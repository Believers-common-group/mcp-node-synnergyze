import { describe, expect, it } from "vitest";

import { createTrustReceiptV1 } from "./trust-receipt.ts";

describe("TrustReceiptV1", () => {
  it("creates a deterministic scope-bound receipt independent of evidence ordering", () => {
    const input = {
      receiptType: "authority.role.current",
      subjectRef: "DIGITALME:BUYER-001",
      objectRef: "ENTERPRISE:ALPHA-001",
      issuerRef: "WARDEN:ENTERPRISE-001",
      verifierRef: "VERIFIER:AUTHORITY-001",
      claim: {
        role: "PROCUREMENT_APPROVER",
        ceiling: { currency: "INR", value: 200000 },
      },
      assurance: {
        identity: 4 as const,
        authority: 4 as const,
        compute: 3 as const,
        evidence: 3 as const,
      },
      policyRef: "POLICY:PROCUREMENT-001",
      evidenceRefs: ["RIVER-EVIDENCE:B", "RIVER-EVIDENCE:A"],
      issuedAt: "2026-08-24T10:00:00.000Z",
      validFrom: "2026-08-24T10:00:00.000Z",
      validUntil: "2026-08-24T11:00:00.000Z",
      riverEventRef: "RIVER-EVENT:AUTHORITY-001",
    };

    const first = createTrustReceiptV1(input);
    const reordered = createTrustReceiptV1({
      ...input,
      evidenceRefs: [...input.evidenceRefs].reverse(),
    });

    expect(first.receiptRef).toBe(reordered.receiptRef);
    expect(first.evidenceRefs).toEqual(["RIVER-EVIDENCE:A", "RIVER-EVIDENCE:B"]);
    expect(first).not.toHaveProperty("trustScore");
    expect(first.receiptType).toBe("authority.role.current");
  });
});
