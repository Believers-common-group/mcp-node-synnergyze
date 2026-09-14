import { describe, expect, it } from "vitest";

import {
  SyntheticRiverConsoleReceiptServiceV1,
  type RiverConsoleReceiptReservationRequestV1,
} from "./console-receipt-service.ts";

function reservation(
  overrides: Partial<RiverConsoleReceiptReservationRequestV1> = {},
): RiverConsoleReceiptReservationRequestV1 {
  return {
    sessionRef: "ESTATE-CONSOLE-SESSION:TEST-001",
    correlationId: "CORR:ESTATE-CONSOLE:RECEIPT-001",
    actionClass: "READ",
    payloadDigest: "sha256:payload-a",
    reservedAt: "2026-09-14T08:20:00.000Z",
    ...overrides,
  };
}

describe("River console receipt service", () => {
  it("reserves a deterministic non-effect console receipt", () => {
    const river = new SyntheticRiverConsoleReceiptServiceV1();
    const first = river.reserve(reservation());
    const second = river.reserve(reservation());

    expect(first.receiptRef).toMatch(/^RIVER-CONSOLE-RECEIPT:/);
    expect(first.state).toBe("RESERVED");
    expect(second).toEqual(first);
    expect(river.receiptCount()).toBe(1);
  });

  it("rejects correlation replay when the payload digest changes", () => {
    const river = new SyntheticRiverConsoleReceiptServiceV1();
    river.reserve(reservation());

    expect(() =>
      river.reserve(reservation({ payloadDigest: "sha256:payload-b" })),
    ).toThrow("river_console_receipt_correlation_conflict");
  });

  it("records a read receipt exactly once", () => {
    const river = new SyntheticRiverConsoleReceiptServiceV1();
    const reserved = river.reserve(reservation());
    const recorded = river.recordRead({
      receiptRef: reserved.receiptRef,
      recordedAt: "2026-09-14T08:20:01.000Z",
      reasonCodes: ["bounded_read_recorded"],
    });

    expect(recorded.state).toBe("RECORDED");
    expect(recorded.reasonCodes).toEqual(["bounded_read_recorded"]);
    expect(() =>
      river.recordRejected({
        receiptRef: reserved.receiptRef,
        recordedAt: "2026-09-14T08:20:02.000Z",
        reasonCodes: ["rewrite_attempt"],
      }),
    ).toThrow("river_console_receipt_terminal_state");
  });

  it("requires an explicit Warden decision reference for AUTHORIZED", () => {
    const river = new SyntheticRiverConsoleReceiptServiceV1();
    const reserved = river.reserve(reservation({ actionClass: "PROPOSE" }));

    expect(() =>
      river.recordAuthorizedProposal({
        receiptRef: reserved.receiptRef,
        recordedAt: "2026-09-14T08:21:00.000Z",
        reasonCodes: ["bounded_policy_allow"],
      }),
    ).toThrow("river_console_receipt_warden_decision_required");
  });

  it("records Warden-authorized and Warden-denied proposal outcomes", () => {
    const allowedRiver = new SyntheticRiverConsoleReceiptServiceV1();
    const allowedReserved = allowedRiver.reserve(
      reservation({ actionClass: "PROPOSE", correlationId: "CORR:ALLOW" }),
    );
    const allowed = allowedRiver.recordAuthorizedProposal({
      receiptRef: allowedReserved.receiptRef,
      wardenDecisionRef: "WARDEN-DECISION:ALLOW-001",
      recordedAt: "2026-09-14T08:22:00.000Z",
      reasonCodes: ["bounded_policy_allow"],
    });

    expect(allowed.state).toBe("AUTHORIZED");
    expect(allowed.wardenDecisionRef).toBe("WARDEN-DECISION:ALLOW-001");

    const deniedRiver = new SyntheticRiverConsoleReceiptServiceV1();
    const deniedReserved = deniedRiver.reserve(
      reservation({ actionClass: "PROPOSE", correlationId: "CORR:DENY" }),
    );
    const denied = deniedRiver.recordDeniedProposal({
      receiptRef: deniedReserved.receiptRef,
      wardenDecisionRef: "WARDEN-DECISION:DENY-001",
      recordedAt: "2026-09-14T08:23:00.000Z",
      reasonCodes: ["capability_not_permitted"],
    });

    expect(denied.state).toBe("DENIED");
    expect(denied.wardenDecisionRef).toBe("WARDEN-DECISION:DENY-001");
    expect(denied.reasonCodes).toEqual(["capability_not_permitted"]);
  });

  it("records a pre-Warden rejection without inventing a Warden decision", () => {
    const river = new SyntheticRiverConsoleReceiptServiceV1();
    const reserved = river.reserve(reservation({ actionClass: "PROPOSE" }));
    const rejected = river.recordRejected({
      receiptRef: reserved.receiptRef,
      recordedAt: "2026-09-14T08:24:00.000Z",
      reasonCodes: ["artifact_digest_mismatch"],
    });

    expect(rejected.state).toBe("REJECTED");
    expect(rejected.wardenDecisionRef).toBeUndefined();
    expect(rejected.reasonCodes).toEqual(["artifact_digest_mismatch"]);
  });
});
