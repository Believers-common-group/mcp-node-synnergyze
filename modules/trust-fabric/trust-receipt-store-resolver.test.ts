import { describe, expect, it } from "vitest";

import { resolveTrustReceiptRelianceFromStoreV1 } from "./trust-receipt-store-resolver.ts";
import { createTrustReceiptStatusEventV1 } from "./trust-receipt-status.ts";
import { createTrustReceiptV1 } from "./trust-receipt.ts";

function receipt() {
  return createTrustReceiptV1({
    receiptType: "authority.role.current",
    subjectRef: "DIGITALME:BUYER-001",
    objectRef: "ENTERPRISE:ALPHA-001",
    issuerRef: "WARDEN:ENTERPRISE-001",
    verifierRef: "VERIFIER:AUTHORITY-001",
    claim: { role: "PROCUREMENT_APPROVER" },
    assurance: { identity: 4, authority: 4, compute: 3, evidence: 3 },
    policyRef: "POLICY:PROCUREMENT-001",
    evidenceRefs: ["RIVER-EVIDENCE:AUTHORITY-001"],
    issuedAt: "2026-08-25T05:00:00.000Z",
    validFrom: "2026-08-25T05:00:00.000Z",
    validUntil: "2026-08-25T06:00:00.000Z",
    riverEventRef: "RIVER-EVENT:AUTHORITY-001",
  });
}

function currentStatus(receiptRef: string) {
  return createTrustReceiptStatusEventV1({
    receiptRef,
    status: "CURRENT",
    reasonCode: "issuer_status_confirmed",
    authorityRef: "WARDEN:ENTERPRISE-001",
    verifierRef: "VERIFIER:AUTHORITY-001",
    evidenceRefs: ["RIVER-EVIDENCE:STATUS-001"],
    effectiveAt: "2026-08-25T05:00:00.000Z",
    observedAt: "2026-08-25T05:00:30.000Z",
    riverEventRef: "RIVER-EVENT:STATUS-CURRENT-001",
  });
}

describe("resolveTrustReceiptRelianceFromStoreV1", () => {
  it("loads the receipt and decision-time status before evaluating reliance", async () => {
    const value = receipt();
    const status = currentStatus(value.receiptRef);
    const calls: string[] = [];
    const store = {
      async getReceipt(receiptRef: string) {
        calls.push(`receipt:${receiptRef}`);
        return value;
      },
      async getEffectiveReceiptStatus(receiptRef: string, asOf: string) {
        calls.push(`status:${receiptRef}:${asOf}`);
        return status;
      },
    };

    const resolved = await resolveTrustReceiptRelianceFromStoreV1({
      store,
      receiptRef: value.receiptRef,
      asOf: "2026-08-25T05:02:00.000Z",
      requiredPolicyRef: "POLICY:PROCUREMENT-001",
      maximumAgeSeconds: 300,
    });

    expect(resolved.state).toBe("USABLE");
    expect(resolved.usable).toBe(true);
    expect(calls).toEqual([
      `receipt:${value.receiptRef}`,
      `status:${value.receiptRef}:2026-08-25T05:02:00.000Z`,
    ]);
  });

  it("fails closed when the referenced receipt does not exist", async () => {
    let statusQueried = false;
    const store = {
      async getReceipt() {
        return undefined;
      },
      async getEffectiveReceiptStatus() {
        statusQueried = true;
        return undefined;
      },
    };

    const resolved = await resolveTrustReceiptRelianceFromStoreV1({
      store,
      receiptRef: "TRUST-RECEIPT:MISSING",
      asOf: "2026-08-25T05:02:00.000Z",
      requiredPolicyRef: "POLICY:PROCUREMENT-001",
    });

    expect(resolved).toEqual({
      receiptRef: "TRUST-RECEIPT:MISSING",
      state: "RECEIPT_NOT_FOUND",
      usable: false,
      reasonCodes: ["receipt_not_found"],
    });
    expect(statusQueried).toBe(false);
  });
});
