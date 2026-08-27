import { describe, expect, it } from "vitest";

import { createTrustReceiptStatusEventV1 } from "./trust-receipt-status.ts";

describe("TrustReceiptStatusEventV1", () => {
  it("creates a deterministic append-only status event independent of evidence ordering", () => {
    const input = {
      receiptRef: "TRUST-RECEIPT:AUTHORITY-001",
      status: "REVOKED" as const,
      reasonCode: "authority_withdrawn",
      authorityRef: "WARDEN:ENTERPRISE-001",
      evidenceRefs: ["RIVER-EVIDENCE:REVOCATION-B", "RIVER-EVIDENCE:REVOCATION-A"],
      effectiveAt: "2026-08-25T04:30:00.000Z",
      observedAt: "2026-08-25T04:31:00.000Z",
      riverEventRef: "RIVER-EVENT:RECEIPT-REVOKED-001",
    };

    const first = createTrustReceiptStatusEventV1(input);
    const reordered = createTrustReceiptStatusEventV1({
      ...input,
      evidenceRefs: [...input.evidenceRefs].reverse(),
    });

    expect(first.statusEventRef).toBe(reordered.statusEventRef);
    expect(first.status).toBe("REVOKED");
    expect(first.evidenceRefs).toEqual([
      "RIVER-EVIDENCE:REVOCATION-A",
      "RIVER-EVIDENCE:REVOCATION-B",
    ]);
  });

  it("requires an explicit distinct replacement receipt for supersession", () => {
    expect(() =>
      createTrustReceiptStatusEventV1({
        receiptRef: "TRUST-RECEIPT:AUTHORITY-001",
        status: "SUPERSEDED",
        reasonCode: "authority_receipt_reissued",
        authorityRef: "WARDEN:ENTERPRISE-001",
        evidenceRefs: ["RIVER-EVIDENCE:SUPERSESSION-001"],
        effectiveAt: "2026-08-25T04:30:00.000Z",
        observedAt: "2026-08-25T04:30:01.000Z",
        supersedingReceiptRef: "TRUST-RECEIPT:AUTHORITY-001",
        riverEventRef: "RIVER-EVENT:RECEIPT-SUPERSEDED-001",
      }),
    ).toThrow("trust_receipt_status_superseding_receipt_must_be_distinct");
  });
});
