/**
 * AWCE R0.3: deterministic circuit-breaker state machine and health adapter.
 *
 * The adapter is deliberately non-effect: it only queries a bounded,
 * authenticated health probe supplied by its caller. The store must implement
 * ACID/serializable atomic transactions (e.g., compare-and-swap with retry).
 * No process launch, network client, credentials or deployment is in this file.
 */

import type { ExecutorRecord, RouterPorts } from "./awceExecutionRouter.ts";

export interface BreakerPolicy {
  /** Minimum consecutive observed probe failures before OPEN. */
  failureThreshold: number;
  /** Duration before allowing exactly one HALF_OPEN recovery probe. */
  cooldownMs: number;
  /** Lease > bounded health probe duration; protects concurrent recovery probes. */
  leaseMs: number;
  /** Enforced by the native probe implementation, not a timeout in this module. */
  probeTimeoutMs: number;
}

export interface ProbeLease {
  id: string;
  expiresAt: number;
}

export interface BreakerState {
  phase: "CLOSED" | "OPEN" | "HALF_OPEN";
  consecutiveFailures: number;
  openedAt: number | null;
  recoveryLease: ProbeLease | null;
}

export interface StateTransaction<T> {
  next: BreakerState;
  value: T;
}

/**
 * Required durable-store contract. The reducer must be applied atomically
 * against the latest state. Fail closed on storage unavailability or conflict.
 * This callback is a local implementation abstraction, NOT executable data
 * to be sent to a remote database as code.
 */
export interface AtomicBreakerStore {
  transact<T>(
    key: string,
    transition: (current: Readonly<BreakerState> | undefined) => StateTransaction<T>,
  ): Promise<T>;
}

export interface NativeHealthProbe {
  /** Non-mutating, authenticated, deadline-enforced probe, without user data. */
  inspect(executor: ExecutorRecord, timeoutMs: number): Promise<boolean>;
}

export interface CircuitHealthDependencies {
  store: AtomicBreakerStore;
  nativeProbe: NativeHealthProbe;
  clock: { now(): number };
  leaseIds: { next(): string };
  policy: BreakerPolicy;
}

export interface ProbeAdmission {
  allowed: boolean;
  reason: "PROBE_ADMITTED" | "COOLDOWN" | "HALF_OPEN_IN_FLIGHT";
  phaseAtAdmission?: "CLOSED" | "HALF_OPEN";
  token?: string;
}

export interface ProbeCompletion {
  /** False when a concurrent transition or expired lease makes observation stale. */
  accepted: boolean;
}

export function validateBreakerPolicy(p: BreakerPolicy): void {
  if (!Number.isSafeInteger(p.failureThreshold) || p.failureThreshold < 1
      || !Number.isSafeInteger(p.cooldownMs) || p.cooldownMs < 1
      || !Number.isSafeInteger(p.leaseMs) || p.leaseMs <= p.probeTimeoutMs
      || !Number.isSafeInteger(p.probeTimeoutMs) || p.probeTimeoutMs < 1) {
    throw new Error("INVALID_BREAKER_POLICY");
  }
}

export function closedCircuit(): BreakerState {
  return {
    phase: "CLOSED",
    consecutiveFailures: 0,
    openedAt: null,
    recoveryLease: null,
  };
}

/** Pure state machine; must be committed atomically by the durable store. */
export function acquireProbe(
  current: Readonly<BreakerState> | undefined,
  now: number,
  token: string,
  policy: BreakerPolicy,
): StateTransaction<ProbeAdmission> {
  const state = current || closedCircuit();
  if (!Number.isFinite(now) || !token?.trim()) {
    return { next: { ...state }, value: { allowed: false, reason: "HALF_OPEN_IN_FLIGHT" } };
  }

  if (state.phase === "CLOSED") {
    return {
      next: { ...state },
      value: { allowed: true, reason: "PROBE_ADMITTED", phaseAtAdmission: "CLOSED", token },
    };
  }

  if (state.phase === "OPEN") {
    if (state.openedAt === null || now - state.openedAt < policy.cooldownMs) {
      return { next: { ...state }, value: { allowed: false, reason: "COOLDOWN" } };
    }
    return {
      next: {
        phase: "HALF_OPEN",
        consecutiveFailures: state.consecutiveFailures,
        openedAt: state.openedAt,
        recoveryLease: { id: token, expiresAt: now + policy.leaseMs },
      },
      value: { allowed: true, reason: "PROBE_ADMITTED", phaseAtAdmission: "HALF_OPEN", token },
    };
  }

  if (state.recoveryLease && state.recoveryLease.expiresAt > now) {
    return { next: { ...state }, value: { allowed: false, reason: "HALF_OPEN_IN_FLIGHT" } };
  }
  return {
    next: {
      ...state,
      recoveryLease: { id: token, expiresAt: now + policy.leaseMs },
    },
    value: { allowed: true, reason: "PROBE_ADMITTED", phaseAtAdmission: "HALF_OPEN", token },
  };
}

/**
 * Only a matching, unexpired HALF_OPEN lease may close an OPEN circuit.
 * A delayed CLOSED observation cannot reset a circuit already opened by
 * concurrent failures.
 */
export function completeProbe(
  current: Readonly<BreakerState> | undefined,
  admission: ProbeAdmission,
  healthy: boolean,
  now: number,
  policy: BreakerPolicy,
): StateTransaction<ProbeCompletion> {
  const state = current || closedCircuit();
  if (admission.allowed !== true || !Number.isFinite(now)) {
    return { next: { ...state }, value: { accepted: false } };
  }

  if (admission.phaseAtAdmission === "HALF_OPEN") {
    if (state.phase !== "HALF_OPEN"
        || !state.recoveryLease
        || state.recoveryLease.id !== admission.token
        || state.recoveryLease.expiresAt <= now) {
      return { next: { ...state }, value: { accepted: false } };
    }
    if (healthy) {
      return { next: closedCircuit(), value: { accepted: true } };
    }
    return {
      next: {
        phase: "OPEN",
        consecutiveFailures: Math.max(policy.failureThreshold, state.consecutiveFailures),
        openedAt: now,
        recoveryLease: null,
      },
      value: { accepted: true },
    };
  }

  if (admission.phaseAtAdmission !== "CLOSED" || state.phase !== "CLOSED") {
    return { next: { ...state }, value: { accepted: false } };
  }

  if (healthy) return { next: closedCircuit(), value: { accepted: true } };

  const consecutiveFailures = Math.min(Number.MAX_SAFE_INTEGER, state.consecutiveFailures + 1);
  if (consecutiveFailures >= policy.failureThreshold) {
    return {
      next: {
        phase: "OPEN",
        consecutiveFailures,
        openedAt: now,
        recoveryLease: null,
      },
      value: { accepted: true },
    };
  }

  return {
    next: { ...state, consecutiveFailures },
    value: { accepted: true },
  };
}

/** Strict isolation by executor identity, capability AND deployed artifact. */
export function circuitKey(executor: ExecutorRecord): string {
  return JSON.stringify([
    "awce.breaker.r0.3",
    executor.id,
    executor.capability,
    executor.artifactDigest,
  ]);
}

/**
 * Drop-in implementation of RouterPorts.health.
 *
 * A healthy response is impossible without: an ADMITTED record, successful
 * atomic state admission, a TRUE bounded native probe and durable state
 * finalization. Storage failure, timeout, exception or stale lease -> false.
 */
export function createCircuitHealthPort(
  deps: CircuitHealthDependencies,
): RouterPorts["health"] {
  validateBreakerPolicy(deps.policy);
  return {
    probe: async (executor: ExecutorRecord): Promise<boolean> => {
      if (executor.state !== "ADMITTED" || !executor.id?.trim()
          || !executor.capability?.trim() || !executor.artifactDigest?.trim()) {
        return false;
      }
      const key = circuitKey(executor);
      let token: string;
      try {
        token = deps.leaseIds.next();
        if (!token?.trim()) return false;
      } catch {
        return false;
      }

      let admission: ProbeAdmission;
      try {
        const now = deps.clock.now();
        admission = await deps.store.transact(
          key, current => acquireProbe(current, now, token, deps.policy),
        );
      } catch {
        return false;
      }
      if (!admission.allowed) return false;

      let healthy = false;
      try {
        healthy = await deps.nativeProbe.inspect(executor, deps.policy.probeTimeoutMs) === true;
      } catch {
        healthy = false;
      }

      try {
        const completion = await deps.store.transact(
          key,
          current => completeProbe(current, admission, healthy, deps.clock.now(), deps.policy),
        );
        return healthy && completion.accepted === true;
      } catch {
        return false;
      }
    },
  };
}
