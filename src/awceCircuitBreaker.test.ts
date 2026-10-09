import { describe, expect, it } from "vitest";
import {
  acquireProbe,
  circuitKey,
  closedCircuit,
  completeProbe,
  createCircuitHealthPort,
  validateBreakerPolicy,
  type AtomicBreakerStore,
  type BreakerPolicy,
  type BreakerState,
} from "./awceCircuitBreaker.ts";
import type { ExecutorRecord } from "./awceExecutionRouter.ts";

const POLICY: BreakerPolicy = {
  failureThreshold: 2,
  cooldownMs: 1000,
  leaseMs: 500,
  probeTimeoutMs: 150,
};
const EXECUTOR: ExecutorRecord = {
  id: "test-executor",
  capability: "read.synthetic",
  transport: "stdio",
  state: "ADMITTED",
  artifactDigest: "sha256:test-artifact",
  fallbackEligible: false,
  priority: 1,
};

function clone(value: BreakerState): BreakerState {
  return JSON.parse(JSON.stringify(value)) as BreakerState;
}

/** Synthetic atomic store: transaction callback executes without awaits. */
class MemoryStore implements AtomicBreakerStore {
  states = new Map<string, BreakerState>();
  fail = false;
  operations = 0;

  async transact<T>(
    key: string,
    transition: (current: Readonly<BreakerState> | undefined) => {
      next: BreakerState;
      value: T;
    },
  ): Promise<T> {
    this.operations += 1;
    if (this.fail) throw new Error("STORAGE_UNAVAILABLE");
    const previous = this.states.get(key);
    const next = transition(previous ? clone(previous) : undefined);
    this.states.set(key, clone(next.next));
    return next.value;
  }
}

function fixture(policy: BreakerPolicy = POLICY) {
  const store = new MemoryStore();
  const inspected: string[] = [];
  let now = 0;
  let counter = 0;
  let healthy = true;
  let reject = false;
  const health = createCircuitHealthPort({
    store,
    policy,
    clock: { now: () => now },
    leaseIds: { next: () => String(++counter) },
    nativeProbe: {
      inspect: async executor => {
        inspected.push(executor.id);
        if (reject) throw Error("connection lost");
        return healthy;
      },
    },
  });
  return {
    health,
    store,
    inspected,
    setTime: (time: number) => { now = time; },
    setHealthy: (value: boolean) => { healthy = value; },
    setReject: (value: boolean) => { reject = value; },
    current: (executor: ExecutorRecord = EXECUTOR) => store.states.get(circuitKey(executor)),
  };
}

describe("AWCE circuit breaker R0.3", () => {
  it("starts CLOSED without failures or a lease", () => {
    expect(closedCircuit()).toEqual({
      phase: "CLOSED", consecutiveFailures: 0, openedAt: null, recoveryLease: null,
    });
  });

  it("rejects invalid thresholds and timeout/lease configurations", () => {
    for (const patch of [
      { failureThreshold: 0 },
      { failureThreshold: 1.5 },
      { cooldownMs: 0 },
      { leaseMs: 150 },
      { probeTimeoutMs: 0 },
    ]) {
      expect(() => validateBreakerPolicy({ ...POLICY, ...patch })).toThrow(
        "INVALID_BREAKER_POLICY",
      );
    }
    expect(() => validateBreakerPolicy(POLICY)).not.toThrow();
  });

  it("isolates breaker identity by executor, capability and artifact digest", () => {
    expect(circuitKey(EXECUTOR)).not.toBe(circuitKey({ ...EXECUTOR, id: "another" }));
    expect(circuitKey(EXECUTOR)).not.toBe(circuitKey({ ...EXECUTOR, capability: "write" }));
    expect(circuitKey(EXECUTOR)).not.toBe(circuitKey({
      ...EXECUTOR, artifactDigest: "sha256:different",
    }));
  });

  it("keeps a healthy executor CLOSED after a successful probe", async () => {
    const x = fixture();
    expect(await x.health.probe(EXECUTOR)).toBe(true);
    expect(x.current()).toEqual(closedCircuit());
    expect(x.inspected).toEqual(["test-executor"]);
  });

  it("opens after threshold failures, blocks without calling native probe", async () => {
    const x = fixture();
    x.setHealthy(false);
    expect(await x.health.probe(EXECUTOR)).toBe(false);
    expect(x.current()?.phase).toBe("CLOSED");
    expect(x.current()?.consecutiveFailures).toBe(1);
    expect(await x.health.probe(EXECUTOR)).toBe(false);
    expect(x.current()?.phase).toBe("OPEN");
    expect(await x.health.probe(EXECUTOR)).toBe(false);
    expect(x.inspected).toHaveLength(2);
  });

  it("resets consecutive failures on a confirmed healthy observation", async () => {
    const x = fixture();
    x.setHealthy(false);
    await x.health.probe(EXECUTOR);
    x.setHealthy(true);
    expect(await x.health.probe(EXECUTOR)).toBe(true);
    expect(x.current()).toEqual(closedCircuit());
  });

  it("rejects a recovery attempt before the cooldown ends", async () => {
    const x = fixture();
    x.setHealthy(false);
    await x.health.probe(EXECUTOR);
    await x.health.probe(EXECUTOR);
    x.setHealthy(true);
    x.setTime(999);
    expect(await x.health.probe(EXECUTOR)).toBe(false);
    expect(x.inspected).toHaveLength(2);
    x.setTime(1000);
    expect(await x.health.probe(EXECUTOR)).toBe(true);
    expect(x.current()?.phase).toBe("CLOSED");
  });

  it("reopens a failed HALF_OPEN probe with a fresh cooldown", async () => {
    const x = fixture();
    x.setHealthy(false);
    await x.health.probe(EXECUTOR);
    await x.health.probe(EXECUTOR);
    x.setTime(1000);
    expect(await x.health.probe(EXECUTOR)).toBe(false);
    expect(x.current()?.phase).toBe("OPEN");
    expect(x.current()?.openedAt).toBe(1000);
    x.setHealthy(true);
    x.setTime(1500);
    expect(await x.health.probe(EXECUTOR)).toBe(false);
    x.setTime(2000);
    expect(await x.health.probe(EXECUTOR)).toBe(true);
    expect(x.current()?.phase).toBe("CLOSED");
  });

  it("permits exactly one HALF_OPEN probe under a valid lease", () => {
    const state: BreakerState = {
      phase: "OPEN", consecutiveFailures: 2, openedAt: 0, recoveryLease: null,
    };
    const a = acquireProbe(state, 1000, "probe-1", POLICY);
    expect(a.value.allowed).toBe(true);
    expect(a.next.phase).toBe("HALF_OPEN");
    expect(acquireProbe(a.next, 1001, "probe-2", POLICY).value).toMatchObject({
      allowed: false, reason: "HALF_OPEN_IN_FLIGHT",
    });
  });

  it("rejects late completion on an expired HALF_OPEN lease", () => {
    const state: BreakerState = {
      phase: "OPEN", consecutiveFailures: 2, openedAt: 0, recoveryLease: null,
    };
    const a = acquireProbe(state, 1000, "probe-1", POLICY);
    expect(completeProbe(a.next, a.value, true, 1500, POLICY).value.accepted).toBe(false);
    expect(completeProbe(a.next, a.value, false, 1500, POLICY).next.phase).toBe("HALF_OPEN");
  });

  it("rejects stale probe results from a replaced recovery lease", () => {
    const state: BreakerState = {
      phase: "OPEN", consecutiveFailures: 2, openedAt: 0, recoveryLease: null,
    };
    const a = acquireProbe(state, 1000, "first", POLICY);
    const b = acquireProbe(a.next, 1500, "second", POLICY);
    const stale = completeProbe(b.next, a.value, true, 1501, POLICY);
    expect(stale.value.accepted).toBe(false);
    expect(stale.next.phase).toBe("HALF_OPEN");
    expect(completeProbe(b.next, b.value, true, 1501, POLICY).next.phase).toBe("CLOSED");
  });

  it("does not allow a CLOSED success to overwrite a concurrently OPEN circuit", () => {
    const admission = acquireProbe(closedCircuit(), 0, "first", POLICY).value;
    const opened: BreakerState = {
      phase: "OPEN", consecutiveFailures: 2, openedAt: 5, recoveryLease: null,
    };
    const completion = completeProbe(opened, admission, true, 10, POLICY);
    expect(completion.value.accepted).toBe(false);
    expect(completion.next).toEqual(opened);
  });

  it("does not call health probes for unadmitted executors", async () => {
    const x = fixture();
    expect(await x.health.probe({ ...EXECUTOR, state: "NOT_ADMITTED" })).toBe(false);
    expect(x.inspected).toHaveLength(0);
    expect(x.store.operations).toBe(0);
  });

  it("fails closed if the atomic state store is unreachable", async () => {
    const x = fixture();
    x.store.fail = true;
    expect(await x.health.probe(EXECUTOR)).toBe(false);
    expect(x.inspected).toHaveLength(0);
  });

  it("fails closed if native probe errors", async () => {
    const x = fixture();
    x.setReject(true);
    expect(await x.health.probe(EXECUTOR)).toBe(false);
    expect(x.current()?.consecutiveFailures).toBe(1);
  });

  it("never reports healthy when recording the probe result fails", async () => {
    const store = new MemoryStore();
    const port = createCircuitHealthPort({
      store: {
        transact: async (key, reducer) => {
          if (store.operations >= 1) throw Error("write failed");
          return store.transact(key, reducer);
        },
      },
      nativeProbe: { inspect: async () => true },
      clock: { now: () => 0 },
      leaseIds: { next: () => "token" },
      policy: POLICY,
    });
    expect(await port.probe(EXECUTOR)).toBe(false);
  });

  it("keeps different artifact digests in separate health circuits", async () => {
    const x = fixture();
    x.setHealthy(false);
    await x.health.probe(EXECUTOR);
    await x.health.probe(EXECUTOR);
    x.setHealthy(true);
    expect(await x.health.probe({ ...EXECUTOR, artifactDigest: "sha256:new" })).toBe(true);
    expect(x.current()?.phase).toBe("OPEN");
  });

  it("keeps failed or malformed probe tokens from reaching native probe", async () => {
    const x = new MemoryStore();
    const port = createCircuitHealthPort({
      store: x,
      nativeProbe: { inspect: async () => { throw Error("must not run"); } },
      clock: { now: () => 0 },
      leaseIds: { next: () => " " },
      policy: POLICY,
    });
    expect(await port.probe(EXECUTOR)).toBe(false);
    expect(x.operations).toBe(0);
  });
});
