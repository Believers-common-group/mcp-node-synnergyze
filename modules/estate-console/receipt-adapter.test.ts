import { describe, expect, it } from "vitest";

import {
  EstateConsoleReceiptAdapterV1,
  type ConsoleReceiptPortV1,
} from "./receipt-adapter.ts";

function port() {
  const calls: Array<{ method: string; input: unknown }> = [];
  const receipt = {
    receiptRef: "RIVER-CONSOLE-RECEIPT:PORT-001",
    sessionRef: "ESTATE-CONSOLE-SESSION:TEST-001",
    correlationId: "CORR:PORT-001",
    actionClass: "PROPOSE" as const,
    state: "RESERVED" as const,
    recordedAt: "2026-09-14T08:30:00.000Z",
    reasonCodes: [] as readonly string[],
  };

  const value: ConsoleReceiptPortV1 = {
    reserve: (input) => {
      calls.push({ method: "reserve", input });
      return receipt;
    },
    recordRead: (input) => {
      calls.push({ method: "recordRead", input });
      return { ...receipt, actionClass: "READ", state: "RECORDED" };
    },
    recordAuthorizedProposal: (input) => {
      calls.push({ method: "recordAuthorizedProposal", input });
      return { ...receipt, state: "AUTHORIZED", wardenDecisionRef: input.wardenDecisionRef };
    },
    recordDeniedProposal: (input) => {
      calls.push({ method: "recordDeniedProposal", input });
      return { ...receipt, state: "DENIED", wardenDecisionRef: input.wardenDecisionRef };
    },
    recordHeldProposal: (input) => {
      calls.push({ method: "recordHeldProposal", input });
      return { ...receipt, state: "HELD_FOR_REVIEW", wardenDecisionRef: input.wardenDecisionRef };
    },
    recordRejected: (input) => {
      calls.push({ method: "recordRejected", input });
      return { ...receipt, state: "REJECTED" };
    },
    get: (receiptRef) => {
      calls.push({ method: "get", input: receiptRef });
      return receipt;
    },
  };

  return { value, calls };
}

describe("Estate Console receipt adapter", () => {
  it("forwards reserve and returns the River-created receipt ref unchanged", () => {
    const target = port();
    const adapter = new EstateConsoleReceiptAdapterV1(target.value);
    const result = adapter.reserve({
      sessionRef: "ESTATE-CONSOLE-SESSION:TEST-001",
      correlationId: "CORR:PORT-001",
      actionClass: "PROPOSE",
      payloadDigest: "sha256:test",
      reservedAt: "2026-09-14T08:30:00.000Z",
    });

    expect(result.receiptRef).toBe("RIVER-CONSOLE-RECEIPT:PORT-001");
    expect(target.calls).toHaveLength(1);
    expect(target.calls[0]?.method).toBe("reserve");
  });

  it("forwards every receipt transition without manufacturing evidence identity", () => {
    const target = port();
    const adapter = new EstateConsoleReceiptAdapterV1(target.value);

    adapter.recordRead({ receiptRef: "R", recordedAt: "2026-09-14T08:31:00Z", reasonCodes: [] });
    adapter.recordAuthorizedProposal({
      receiptRef: "R",
      wardenDecisionRef: "WARDEN-DECISION:ALLOW",
      recordedAt: "2026-09-14T08:31:01Z",
      reasonCodes: [],
    });
    adapter.recordDeniedProposal({
      receiptRef: "R",
      wardenDecisionRef: "WARDEN-DECISION:DENY",
      recordedAt: "2026-09-14T08:31:02Z",
      reasonCodes: [],
    });
    adapter.recordHeldProposal({
      receiptRef: "R",
      wardenDecisionRef: "WARDEN-DECISION:ESCALATE",
      recordedAt: "2026-09-14T08:31:03Z",
      reasonCodes: [],
    });
    adapter.recordRejected({ receiptRef: "R", recordedAt: "2026-09-14T08:31:04Z", reasonCodes: [] });
    adapter.get("R");

    expect(target.calls.map(({ method }) => method)).toEqual([
      "recordRead",
      "recordAuthorizedProposal",
      "recordDeniedProposal",
      "recordHeldProposal",
      "recordRejected",
      "get",
    ]);
  });
});
