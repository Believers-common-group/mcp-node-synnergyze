import { describe, expect, it } from "vitest";
import {
  reconcileCompletedOperation,
  type DurableIdempotencyLedger,
  type RecoveryEvidencePort,
  type VerifiedRiverOutcome,
} from "./awcePgIdempotencyLedger.ts";
import type { RouteRequest, ExecutionReceipt } from "./awceExecutionRouter.ts";

const REQUEST: RouteRequest = {
  requestId: "synthetic-req-1",
  principalId: "synthetic-principal",
  capability: "read.synthetic",
  inputDigest: "sha256:synthetic-input",
  payload: { synthetic: true },
  allowFallback: false,
};
const RECEIPT: ExecutionReceipt = {
  verified: true,
  receiptId: "river-proof-1",
  requestId: REQUEST.requestId,
  executorId: "synthetic-executor",
  reservationId: "synthetic-reservation",
  outputDigest: "sha256:synthetic-output",
};
function fixture() {
  let completeCalls = 0;
  let evidenceCalls = 0;
  let status: "NEEDS_RECONCILIATION" | "COMPLETED" = "NEEDS_RECONCILIATION";
  const ledger: DurableIdempotencyLedger = {
    inspect: async () => status === "COMPLETED"
      ? { status, receiptId: RECEIPT.receiptId }
      : { status },
    idempotency: {
      claim: async () => "DUPLICATE",
      complete: async (_request, _receipt) => {
        completeCalls++;
        status = "COMPLETED";
        return true;
      },
    },
  };
  const proof: VerifiedRiverOutcome = {
    verification: "VERIFIED",
    principalId: REQUEST.principalId,
    capability: REQUEST.capability,
    inputDigest: REQUEST.inputDigest,
    receipt: RECEIPT,
  };
  const river: RecoveryEvidencePort = {
    findVerifiedCompletion: async () => {
      evidenceCalls++;
      return proof;
    },
  };
  return { ledger, river, proof,
    stats: () => ({ completeCalls, evidenceCalls }),
  };
}
describe("AWCE R0.6 non-reexecuting reconciliation", () => {
  it("finalizes only an independently verified matching River receipt", async () => {
    const x = fixture();
    expect(await reconcileCompletedOperation(REQUEST, x.ledger, x.river)).toEqual({
      status: "COMPLETED", receiptId: RECEIPT.receiptId,
    });
    expect(x.stats()).toEqual({ completeCalls: 1, evidenceCalls: 1 });
  });
  it("is idempotent when already complete and does not query River", async () => {
    const x = fixture();
    await reconcileCompletedOperation(REQUEST, x.ledger, x.river);
    expect(await reconcileCompletedOperation(REQUEST, x.ledger, x.river)).toMatchObject({
      status: "COMPLETED",
    });
    expect(x.stats()).toEqual({ completeCalls: 1, evidenceCalls: 1 });
  });
  it("does not reexecute or complete without prior River evidence", async () => {
    const x = fixture();
    x.river.findVerifiedCompletion = async () => null;
    expect(await reconcileCompletedOperation(REQUEST, x.ledger, x.river)).toMatchObject({
      status: "NEEDS_RECONCILIATION",
    });
    expect(x.stats().completeCalls).toBe(0);
  });
  it("refuses evidence bound to another principal", async () => {
    const x = fixture();
    x.river.findVerifiedCompletion = async () => ({ ...x.proof, principalId: "other" });
    expect(await reconcileCompletedOperation(REQUEST, x.ledger, x.river)).toMatchObject({
      status: "NEEDS_RECONCILIATION",
    });
    expect(x.stats().completeCalls).toBe(0);
  });
  it("refuses another capability, digest, or request identity", async () => {
    for (const bad of [
      { capability: "write.other" },
      { inputDigest: "sha256:other" },
      { receipt: { ...RECEIPT, requestId: "other" } },
    ]) {
      const x = fixture();
      x.river.findVerifiedCompletion = async () => ({ ...x.proof, ...bad });
      expect(await reconcileCompletedOperation(REQUEST, x.ledger, x.river)).toMatchObject({
        status: "NEEDS_RECONCILIATION",
      });
      expect(x.stats().completeCalls).toBe(0);
    }
  });
  it("rejects unverified receipt or empty receipt identifiers", async () => {
    for (const receipt of [
      { ...RECEIPT, verified: false },
      { ...RECEIPT, receiptId: "" },
    ]) {
      const x = fixture();
      x.river.findVerifiedCompletion = async () => ({ ...x.proof, receipt });
      expect(await reconcileCompletedOperation(REQUEST, x.ledger, x.river)).toMatchObject({
        status: "NEEDS_RECONCILIATION",
      });
      expect(x.stats().completeCalls).toBe(0);
    }
  });
  it("survives a failed evidence lookup without retrying the operation", async () => {
    const x = fixture();
    x.river.findVerifiedCompletion = async () => { throw Error("offline"); };
    expect(await reconcileCompletedOperation(REQUEST, x.ledger, x.river)).toMatchObject({
      status: "NEEDS_RECONCILIATION",
    });
  });
  it("does not declare completion when database finalization is unavailable", async () => {
    const x = fixture();
    x.ledger.idempotency.complete = async () => false;
    expect(await reconcileCompletedOperation(REQUEST, x.ledger, x.river)).toMatchObject({
      status: "NEEDS_RECONCILIATION",
    });
  });
  it("does not inspect River for absent, conflicting or untrusted claims", async () => {
    for (const status of ["NOT_FOUND", "CONFLICT", "UNAVAILABLE"] as const) {
      const x = fixture();
      x.ledger.inspect = async () => ({ status });
      expect(await reconcileCompletedOperation(REQUEST, x.ledger, x.river)).toEqual({ status });
      expect(x.stats().evidenceCalls).toBe(0);
    }
  });
});
