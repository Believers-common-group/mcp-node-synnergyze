/**
 * AWCE R0.2 deterministic router. No network, process, credential or SDK calls here:
 * callers must supply independently reviewed, authenticated provider ports.
 * This module is NOT wired into the production CLI.
 */

export interface RouteRequest {
  requestId: string;
  principalId: string;
  capability: string;
  inputDigest: string;
  payload: unknown;
  allowFallback: boolean;
}

export interface ExecutorRecord {
  id: string;
  capability: string;
  transport: "stdio" | "streamable-http";
  state: "ADMITTED" | "NOT_ADMITTED";
  artifactDigest: string;
  fallbackEligible: boolean;
  priority: number;
}

export interface WardenPermit {
  decision: "ALLOW" | "DENY";
  signatureVerified: boolean;
  decisionId: string;
  requestId: string;
  principalId: string;
  executorId: string;
  artifactDigest: string;
  inputDigest: string;
  expiresAt: string;
}

export interface RiverReservation {
  reservationId: string;
  requestId: string;
  executorId: string;
}

export type ExecutionOutcome =
  | { kind: "SUCCEEDED"; outputDigest: string }
  | { kind: "NOT_STARTED" }
  | { kind: "UNKNOWN" };

export interface ExecutionReceipt {
  verified: boolean;
  reservationId: string;
  requestId: string;
  executorId: string;
  outputDigest: string;
  receiptId: string;
}

export interface RouterPorts {
  registry: {
    /** Trusted authoritative admitted capability inventory, not caller-supplied choices. */
    list(capability: string): Promise<ExecutorRecord[]>;
  };
  warden: {
    /** Must check authentic signed authority and fresh scope for EVERY executor. */
    authorize(request: RouteRequest, executor: ExecutorRecord): Promise<WardenPermit>;
  };
  health: {
    /** True only after a bounded, authenticated, non-mutating protocol probe. */
    probe(executor: ExecutorRecord): Promise<boolean>;
  };
  river: {
    reserve(request: RouteRequest, executor: ExecutorRecord, permit: WardenPermit): Promise<RiverReservation>;
    commit(
      request: RouteRequest,
      executor: ExecutorRecord,
      reservation: RiverReservation,
      outputDigest: string,
    ): Promise<ExecutionReceipt>;
    /** Must durably attest that the provider did not start the operation. */
    recordNotStarted(request: RouteRequest, reservation: RiverReservation): Promise<boolean>;
  };
  idempotency: {
    /** Atomic shared-store claim. A missing or unavailable store must block execution. */
    claim(request: RouteRequest): Promise<"ACQUIRED" | "DUPLICATE" | "UNAVAILABLE">;
    complete(request: RouteRequest, receipt: ExecutionReceipt): Promise<boolean>;
  };
  execution: {
    /** MUST return UNKNOWN on timeout/lost acknowledgement after a possible effect. */
    invoke(
      request: RouteRequest,
      executor: ExecutorRecord,
      permit: WardenPermit,
      reservation: RiverReservation,
    ): Promise<ExecutionOutcome>;
  };
  clock: { now(): number };
}

export type RouteResult =
  | { status: "COMPLETED"; executorId: string; receiptId: string; attempts: string[] }
  | { status: "BLOCKED"; reason: string; attempts: string[] }
  | { status: "UNCERTAIN"; reason: string; attempts: string[] }
  | { status: "PENDING_EVIDENCE"; reason: string; attempts: string[] };

const MAX_CANDIDATES = 3;

function blocked(reason: string, attempts: string[]): RouteResult {
  return { status: "BLOCKED", reason, attempts };
}

function validPermit(
  request: RouteRequest,
  executor: ExecutorRecord,
  permit: WardenPermit,
  now: number,
): boolean {
  const expiry = Date.parse(permit.expiresAt);
  return permit.decision === "ALLOW"
    && permit.signatureVerified === true
    && permit.decisionId.length > 0
    && permit.requestId === request.requestId
    && permit.principalId === request.principalId
    && permit.executorId === executor.id
    && permit.artifactDigest === executor.artifactDigest
    && permit.inputDigest === request.inputDigest
    && Number.isFinite(expiry)
    && expiry > now;
}

function validCandidate(candidate: ExecutorRecord, capability: string): boolean {
  return candidate.state === "ADMITTED"
    && candidate.capability === capability
    && candidate.id.trim().length > 0
    && candidate.artifactDigest.trim().length > 0
    && Number.isFinite(candidate.priority)
    && (candidate.transport === "stdio" || candidate.transport === "streamable-http");
}

export async function routeExecution(
  request: RouteRequest,
  ports: RouterPorts,
): Promise<RouteResult> {
  const attempts: string[] = [];
  if (![request.requestId, request.principalId, request.capability, request.inputDigest]
    .every(value => typeof value === "string" && value.trim().length > 0)) {
    return blocked("INVALID_REQUEST", attempts);
  }

  let listed: ExecutorRecord[];
  try {
    listed = await ports.registry.list(request.capability);
    if (!Array.isArray(listed)) return blocked("REGISTRY_UNAVAILABLE", attempts);
  } catch {
    return blocked("REGISTRY_UNAVAILABLE", attempts);
  }

  const candidates = listed
    .filter(c => validCandidate(c, request.capability))
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .slice(0, MAX_CANDIDATES);
  if (!candidates.length) return blocked("NO_ADMITTED_EXECUTOR", attempts);

  let claimed = false;
  for (const [index, executor] of candidates.entries()) {
    if (index > 0) {
      if (!request.allowFallback) break;
      if (!executor.fallbackEligible) continue;
    }
    attempts.push(executor.id);

    let permit: WardenPermit;
    try {
      permit = await ports.warden.authorize(request, executor);
    } catch {
      return blocked("WARDEN_UNAVAILABLE", attempts);
    }
    if (!validPermit(request, executor, permit, ports.clock.now())) {
      return blocked("WARDEN_DENIED_OR_INVALID", attempts);
    }

    let healthy: boolean;
    try {
      healthy = await ports.health.probe(executor);
    } catch {
      healthy = false;
    }
    if (healthy !== true) continue;

    let reservation: RiverReservation;
    try {
      reservation = await ports.river.reserve(request, executor, permit);
      if (!reservation || !reservation.reservationId?.trim()
          || reservation.requestId !== request.requestId
          || reservation.executorId !== executor.id) {
        return blocked("RIVER_RESERVATION_INVALID", attempts);
      }
    } catch {
      return blocked("RIVER_UNAVAILABLE", attempts);
    }

    if (!claimed) {
      let claim: "ACQUIRED" | "DUPLICATE" | "UNAVAILABLE";
      try {
        claim = await ports.idempotency.claim(request);
      } catch {
        return blocked("IDEMPOTENCY_UNAVAILABLE", attempts);
      }
      if (claim !== "ACQUIRED") {
        return blocked(claim === "DUPLICATE" ? "DUPLICATE_REQUEST" : "IDEMPOTENCY_UNAVAILABLE", attempts);
      }
      claimed = true;
    }

    // Authority must remain unexpired immediately before invoke.
    if (Date.parse(permit.expiresAt) <= ports.clock.now()) {
      return blocked("WARDEN_EXPIRED_BEFORE_EXECUTION", attempts);
    }

    let outcome: ExecutionOutcome;
    try {
      outcome = await ports.execution.invoke(request, executor, permit, reservation);
    } catch {
      // Once execution was attempted, a missing acknowledgement is NOT evidence
      // of non-execution. Never retry or fail over.
      return { status: "UNCERTAIN", reason: "EXECUTION_OUTCOME_UNKNOWN", attempts };
    }

    if (outcome.kind === "UNKNOWN") {
      return { status: "UNCERTAIN", reason: "EXECUTION_OUTCOME_UNKNOWN", attempts };
    }
    if (outcome.kind === "NOT_STARTED") {
      let recorded = false;
      try {
        recorded = await ports.river.recordNotStarted(request, reservation);
      } catch {
        // Evidence service unavailable: do not attempt on another executor.
      }
      if (!recorded) {
        return { status: "PENDING_EVIDENCE", reason: "NONEXECUTION_UNVERIFIED", attempts };
      }
      continue;
    }
    if (outcome.kind !== "SUCCEEDED" || !outcome.outputDigest?.trim()) {
      return { status: "UNCERTAIN", reason: "INVALID_EXECUTION_OUTCOME", attempts };
    }

    let receipt: ExecutionReceipt;
    try {
      receipt = await ports.river.commit(request, executor, reservation, outcome.outputDigest);
    } catch {
      return { status: "PENDING_EVIDENCE", reason: "RIVER_RECEIPT_UNAVAILABLE", attempts };
    }
    if (!receipt || receipt.verified !== true
      || !receipt.receiptId?.trim()
      || receipt.reservationId !== reservation.reservationId
      || receipt.requestId !== request.requestId
      || receipt.executorId !== executor.id
      || receipt.outputDigest !== outcome.outputDigest) {
      return { status: "PENDING_EVIDENCE", reason: "RIVER_RECEIPT_INVALID", attempts };
    }

    let persisted = false;
    try {
      persisted = await ports.idempotency.complete(request, receipt);
    } catch {
      // A verified River receipt exists, but a duplicate-safe finalization
      // remains unresolved. Do not report completed or retry.
    }
    if (!persisted) return { status: "PENDING_EVIDENCE", reason: "IDEMPOTENCY_FINALIZATION_UNVERIFIED", attempts };
    return { status: "COMPLETED", executorId: executor.id, receiptId: receipt.receiptId, attempts };
  }

  return blocked(claimed ? "NO_FURTHER_SAFE_ATTEMPT" : "NO_HEALTHY_AUTHORIZED_EXECUTOR", attempts);
}
