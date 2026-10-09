import { describe, expect, it } from "vitest";
import {
  routeExecution,
  type ExecutionReceipt,
  type ExecutorRecord,
  type RouteRequest,
  type RouterPorts,
} from "./awceExecutionRouter.ts";

const FIXED_NOW = Date.parse("2026-10-10T00:00:00Z");

const REQUEST: RouteRequest = {
  requestId: "req-001",
  principalId: "digitalme-test-user",
  capability: "read.synthetic",
  inputDigest: "sha256:input-a",
  payload: { synthetic: true },
  allowFallback: true,
};

const PRIMARY: ExecutorRecord = {
  id: "estate-worker-1",
  capability: "read.synthetic",
  transport: "stdio",
  state: "ADMITTED",
  artifactDigest: "sha256:artifact-primary",
  fallbackEligible: false,
  priority: 1,
};
const FALLBACK: ExecutorRecord = {
  ...PRIMARY,
  id: "estate-worker-2",
  artifactDigest: "sha256:artifact-fallback",
  fallbackEligible: true,
  priority: 2,
};

function fixture(executors: ExecutorRecord[] = [PRIMARY]) {
  const trace: string[] = [];
  const ports: RouterPorts = {
    inputIntegrity: {
      verify: async () => {
        trace.push("integrity");
        return true;
      },
    },
    registry: {
      list: async () => {
        trace.push("registry");
        return executors;
      },
    },
    warden: {
      authorize: async (request, executor) => {
        trace.push("warden:" + executor.id);
        return {
          decision: "ALLOW",
          signatureVerified: true,
          decisionId: "decision-for-" + executor.id,
          requestId: request.requestId,
          principalId: request.principalId,
          executorId: executor.id,
          artifactDigest: executor.artifactDigest,
          inputDigest: request.inputDigest,
          expiresAt: new Date(FIXED_NOW + 60_000).toISOString(),
        };
      },
    },
    health: {
      probe: async executor => {
        trace.push("health:" + executor.id);
        return true;
      },
    },
    river: {
      reserve: async (request, executor) => {
        trace.push("reserve:" + executor.id);
        return {
          reservationId: "reservation:" + executor.id,
          requestId: request.requestId,
          executorId: executor.id,
        };
      },
      commit: async (request, executor, reservation, outputDigest): Promise<ExecutionReceipt> => {
        trace.push("commit:" + executor.id);
        return {
          verified: true,
          reservationId: reservation.reservationId,
          requestId: request.requestId,
          executorId: executor.id,
          outputDigest,
          receiptId: "river-receipt-" + executor.id,
        };
      },
      recordNotStarted: async (_request, reservation) => {
        trace.push("not-started:" + reservation.executorId);
        return true;
      },
    },
    idempotency: {
      claim: async () => {
        trace.push("claim");
        return "ACQUIRED";
      },
      complete: async () => {
        trace.push("complete");
        return true;
      },
    },
    execution: {
      invoke: async (_request, executor) => {
        trace.push("invoke:" + executor.id);
        return { kind: "SUCCEEDED", outputDigest: "sha256:result" };
      },
    },
    clock: { now: () => FIXED_NOW },
  };
  return { trace, ports };
}

describe("AWCE fail-closed deterministic routing", () => {
  it("completes only after Warden, healthy executor, idempotency claim and River receipt", async () => {
    const { ports, trace } = fixture();
    expect(await routeExecution(REQUEST, ports)).toEqual({
      status: "COMPLETED",
      executorId: PRIMARY.id,
      receiptId: "river-receipt-" + PRIMARY.id,
      attempts: [PRIMARY.id],
    });
    expect(trace).toEqual([
      "integrity", "registry", "warden:estate-worker-1", "health:estate-worker-1",
      "reserve:estate-worker-1", "claim", "invoke:estate-worker-1",
      "commit:estate-worker-1", "complete",
    ]);
  });

  it("does not execute for missing required request fields", async () => {
    const { ports, trace } = fixture();
    expect(await routeExecution({ ...REQUEST, requestId: " " }, ports)).toMatchObject({
      status: "BLOCKED", reason: "INVALID_REQUEST",
    });
    expect(trace).toEqual([]);
  });

  it("rejects unverified or tampered canonical payload digests before capability lookup", async () => {
    const { ports, trace } = fixture();
    ports.inputIntegrity.verify = async () => false;
    expect(await routeExecution({ ...REQUEST, payload: { tampered: true } }, ports)).toMatchObject({
      status: "BLOCKED", reason: "INPUT_DIGEST_UNVERIFIED",
    });
    expect(trace).toEqual([]);
  });

  it("does not launch unadmitted executables even if a record is returned", async () => {
    const { ports, trace } = fixture([{ ...PRIMARY, state: "NOT_ADMITTED" }]);
    expect(await routeExecution(REQUEST, ports)).toMatchObject({
      status: "BLOCKED", reason: "NO_ADMITTED_EXECUTOR",
    });
    expect(trace).toEqual(["integrity", "registry"]);
  });

  it("blocks when the authoritative registry is unavailable", async () => {
    const { ports, trace } = fixture();
    ports.registry.list = async () => { throw Error("unavailable"); };
    expect(await routeExecution(REQUEST, ports)).toMatchObject({
      status: "BLOCKED", reason: "REGISTRY_UNAVAILABLE",
    });
    expect(trace).toEqual(["integrity"]);
  });

  it("blocks if a purported Warden grant has an invalid signature", async () => {
    const { ports, trace } = fixture();
    const orig = ports.warden.authorize;
    ports.warden.authorize = async (req, executor) => ({
      ...await orig(req, executor), signatureVerified: false,
    });
    expect(await routeExecution(REQUEST, ports)).toMatchObject({
      status: "BLOCKED", reason: "WARDEN_DENIED_OR_INVALID",
    });
    expect(trace.some(x => x.startsWith("invoke:"))).toBe(false);
  });

  it("blocks if the Warden grant is scoped to another principal or input digest", async () => {
    const { ports, trace } = fixture();
    const orig = ports.warden.authorize;
    ports.warden.authorize = async (req, executor) => ({
      ...await orig(req, executor), principalId: "somebody-else",
      inputDigest: "sha256:another-payload",
    });
    expect(await routeExecution(REQUEST, ports)).toMatchObject({
      status: "BLOCKED", reason: "WARDEN_DENIED_OR_INVALID",
    });
    expect(trace.some(x => x.startsWith("invoke:"))).toBe(false);
  });

  it("blocks expired Warden grants before invoking", async () => {
    const { ports, trace } = fixture();
    const orig = ports.warden.authorize;
    ports.warden.authorize = async (req, executor) => ({
      ...await orig(req, executor), expiresAt: new Date(FIXED_NOW).toISOString(),
    });
    expect(await routeExecution(REQUEST, ports)).toMatchObject({
      status: "BLOCKED", reason: "WARDEN_DENIED_OR_INVALID",
    });
    expect(trace.some(x => x.startsWith("invoke:"))).toBe(false);
  });

  it("routes to separately authorized fallback when primary is unhealthy", async () => {
    const { ports, trace } = fixture([PRIMARY, FALLBACK]);
    ports.health.probe = async executor => {
      trace.push("health:" + executor.id);
      return executor.id === FALLBACK.id;
    };
    expect(await routeExecution(REQUEST, ports)).toEqual({
      status: "COMPLETED",
      executorId: FALLBACK.id,
      receiptId: "river-receipt-" + FALLBACK.id,
      attempts: [PRIMARY.id, FALLBACK.id],
    });
    expect(trace).toContain("warden:estate-worker-2");
    expect(trace).not.toContain("invoke:estate-worker-1");
  });

  it("never fails over without user-authorized fallback", async () => {
    const { ports, trace } = fixture([PRIMARY, FALLBACK]);
    ports.health.probe = async () => false;
    expect(await routeExecution({ ...REQUEST, allowFallback: false }, ports)).toMatchObject({
      status: "BLOCKED", attempts: [PRIMARY.id],
    });
    expect(trace).not.toContain("warden:estate-worker-2");
  });

  it("never routes to an unapproved fallback candidate", async () => {
    const { ports, trace } = fixture([PRIMARY, { ...FALLBACK, fallbackEligible: false }]);
    ports.health.probe = async () => false;
    expect(await routeExecution(REQUEST, ports)).toMatchObject({
      status: "BLOCKED", attempts: [PRIMARY.id],
    });
    expect(trace).not.toContain("warden:estate-worker-2");
  });

  it("skips an ineligible intermediate provider and safely considers the next admitted fallback", async () => {
    const skipped: ExecutorRecord = {
      ...FALLBACK,
      id: "not-approved-as-fallback",
      artifactDigest: "sha256:skipped-artifact",
      fallbackEligible: false,
      priority: 2,
    };
    const third: ExecutorRecord = {
      ...FALLBACK,
      id: "estate-worker-3",
      artifactDigest: "sha256:third-artifact",
      fallbackEligible: true,
      priority: 3,
    };
    const { ports, trace } = fixture([PRIMARY, skipped, third]);
    ports.health.probe = async executor => {
      trace.push("health:" + executor.id);
      return executor.id === third.id;
    };
    expect(await routeExecution(REQUEST, ports)).toEqual({
      status: "COMPLETED", executorId: third.id,
      receiptId: "river-receipt-" + third.id,
      attempts: [PRIMARY.id, third.id],
    });
    expect(trace).not.toContain("warden:not-approved-as-fallback");
  });

  it("does not retry an executor whose operation may have started", async () => {
    const { ports, trace } = fixture([PRIMARY, FALLBACK]);
    ports.execution.invoke = async (_request, executor) => {
      trace.push("invoke:" + executor.id);
      return { kind: "UNKNOWN" };
    };
    expect(await routeExecution(REQUEST, ports)).toMatchObject({
      status: "UNCERTAIN", reason: "EXECUTION_OUTCOME_UNKNOWN",
      attempts: [PRIMARY.id],
    });
    expect(trace).not.toContain("invoke:estate-worker-2");
  });

  it("handles exceptions after invoke as uncertain (not safe-to-retry)", async () => {
    const { ports, trace } = fixture([PRIMARY, FALLBACK]);
    ports.execution.invoke = async () => {
      trace.push("invoke-attempted");
      throw Error("lost acknowledgement");
    };
    expect(await routeExecution(REQUEST, ports)).toMatchObject({
      status: "UNCERTAIN", reason: "EXECUTION_OUTCOME_UNKNOWN",
    });
    expect(trace).not.toContain("warden:estate-worker-2");
  });

  it("allows fallback only with verified non-execution evidence", async () => {
    const { ports, trace } = fixture([PRIMARY, FALLBACK]);
    ports.execution.invoke = async (_req, executor) => {
      trace.push("invoke:" + executor.id);
      return executor.id === PRIMARY.id
        ? { kind: "NOT_STARTED" }
        : { kind: "SUCCEEDED", outputDigest: "sha256:ok" };
    };
    expect(await routeExecution(REQUEST, ports)).toEqual({
      status: "COMPLETED", executorId: FALLBACK.id,
      receiptId: "river-receipt-" + FALLBACK.id,
      attempts: [PRIMARY.id, FALLBACK.id],
    });
    expect(trace).toContain("not-started:estate-worker-1");
    expect(trace.filter(x => x === "claim")).toHaveLength(1);
  });

  it("blocks fallback if evidence that previous work did not start is unavailable", async () => {
    const { ports, trace } = fixture([PRIMARY, FALLBACK]);
    ports.execution.invoke = async () => ({ kind: "NOT_STARTED" });
    ports.river.recordNotStarted = async () => false;
    expect(await routeExecution(REQUEST, ports)).toMatchObject({
      status: "PENDING_EVIDENCE", reason: "NONEXECUTION_UNVERIFIED",
      attempts: [PRIMARY.id],
    });
    expect(trace).not.toContain("warden:estate-worker-2");
  });

  it("blocks if River reservation fails", async () => {
    const { ports, trace } = fixture([PRIMARY, FALLBACK]);
    ports.river.reserve = async () => { throw Error("evidence unavailable"); };
    expect(await routeExecution(REQUEST, ports)).toMatchObject({
      status: "BLOCKED", reason: "RIVER_UNAVAILABLE",
      attempts: [PRIMARY.id],
    });
    expect(trace.some(x => x.startsWith("invoke:"))).toBe(false);
  });

  it("blocks without an atomic idempotency claim", async () => {
    const { ports, trace } = fixture([PRIMARY, FALLBACK]);
    ports.idempotency.claim = async () => "UNAVAILABLE";
    expect(await routeExecution(REQUEST, ports)).toMatchObject({
      status: "BLOCKED", reason: "IDEMPOTENCY_UNAVAILABLE",
    });
    expect(trace.some(x => x.startsWith("invoke:"))).toBe(false);
  });

  it("does not execute a duplicate request", async () => {
    const { ports, trace } = fixture();
    ports.idempotency.claim = async () => "DUPLICATE";
    expect(await routeExecution(REQUEST, ports)).toMatchObject({
      status: "BLOCKED", reason: "DUPLICATE_REQUEST",
    });
    expect(trace).not.toContain("invoke:estate-worker-1");
  });

  it("does not declare success without verified River receipt", async () => {
    const { ports, trace } = fixture([PRIMARY, FALLBACK]);
    const orig = ports.river.commit;
    ports.river.commit = async (...args) => ({
      ...await orig(...args), verified: false,
    });
    expect(await routeExecution(REQUEST, ports)).toMatchObject({
      status: "PENDING_EVIDENCE", reason: "RIVER_RECEIPT_INVALID",
      attempts: [PRIMARY.id],
    });
    expect(trace).not.toContain("warden:estate-worker-2");
  });

  it("does not declare completion until finalization is durably saved", async () => {
    const { ports } = fixture();
    ports.idempotency.complete = async () => false;
    expect(await routeExecution(REQUEST, ports)).toMatchObject({
      status: "PENDING_EVIDENCE", reason: "IDEMPOTENCY_FINALIZATION_UNVERIFIED",
    });
  });

  it("does not substitute a capability mismatched executor", async () => {
    const { ports } = fixture([{ ...PRIMARY, capability: "write.another" }]);
    expect(await routeExecution(REQUEST, ports)).toMatchObject({
      status: "BLOCKED", reason: "NO_ADMITTED_EXECUTOR",
    });
  });
});
