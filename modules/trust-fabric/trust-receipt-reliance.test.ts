import { describe, expect, it } from "vitest";

import { evaluateTrustReceiptRelianceV1 } from "./trust-receipt-reliance.ts";
import { createTrustReceiptStatusEventV1 } from "./trust-receipt-status.ts";
import { createTrustReceiptV1 } from "./trust-receipt.ts";

// Issuance is historical evidence; CURRENT reliance requires status knowledge at decision time.
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

function status(status: "CURRENT" | "REVOKED", observedAt = "2026-08-25T05:00:30.000Z") {
  const value = receipt();
  return createTrustReceiptStatusEventV1({
    receiptRef: value.receiptRef,
    status,
    reasonCode: status === "CURRENT" ? "issuer_status_confirmed" : "authority_withdrawn",
    authorityRef: "WARDEN:ENTERPRISE-001",
    verifierRef: "VERIFIER:AUTHORITY-001",
    evidenceRefs: ["RIVER-EVIDENCE:STATUS-001"],
    effectiveAt: "2026-08-25T05:00:00.000Z",
    observedAt,
    riverEventRef: `RIVER-EVENT:STATUS-${status}`,
  });
}

describe("TrustReceiptRelianceV1", () => {
  it("does not treat an issued receipt as CURRENT without a current status observation", () => {
    const result = evaluateTrustReceiptRelianceV1({
      receipt: receipt(),
      asOf: "2026-08-25T05:02:00.000Z",
      requiredPolicyRef: "POLICY:PROCUREMENT-001",
    });

    expect(result.state).toBe("STATUS_UNCONFIRMED");
    expect(result.usable).toBe(false);
  });

  it("accepts a current, in-scope, fresh receipt without collapsing its assurance vector", () => {
    const value = receipt();
    const result = evaluateTrustReceiptRelianceV1({
      receipt: value,
      statusEvent: status("CURRENT"),
      asOf: "2026-08-25T05:02:00.000Z",
      requiredPolicyRef: "POLICY:PROCUREMENT-001",
      maximumAgeSeconds: 300,
      acceptedIssuerRefs: ["WARDEN:ENTERPRISE-001"],
      acceptedVerifierRefs: ["VERIFIER:AUTHORITY-001"],
    });

    expect(result.state).toBe("USABLE");
    expect(result.usable).toBe(true);
    expect(result.ageSeconds).toBe(120);
    expect(result.assurance).toEqual(value.assurance);
  });

  it("rejects a revocation that was known by the decision time", () => {
    const result = evaluateTrustReceiptRelianceV1({
      receipt: receipt(),
      statusEvent: status("REVOKED"),
      asOf: "2026-08-25T05:02:00.000Z",
      requiredPolicyRef: "POLICY:PROCUREMENT-001",
    });

    expect(result.state).toBe("REVOKED");
    expect(result.usable).toBe(false);
  });

  it("does not use a status observation that was only learned after the decision time", () => {
    const result = evaluateTrustReceiptRelianceV1({
      receipt: receipt(),
      statusEvent: status("CURRENT", "2026-08-25T05:03:00.000Z"),
      asOf: "2026-08-25T05:02:00.000Z",
      requiredPolicyRef: "POLICY:PROCUREMENT-001",
    });

    expect(result.state).toBe("STATUS_UNCONFIRMED");
    expect(result.usable).toBe(false);
  });

  it("marks an otherwise current receipt stale when claim freshness exceeds policy", () => {
    const result = evaluateTrustReceiptRelianceV1({
      receipt: receipt(),
      statusEvent: status("CURRENT"),
      asOf: "2026-08-25T05:10:01.000Z",
      requiredPolicyRef: "POLICY:PROCUREMENT-001",
      maximumAgeSeconds: 600,
    });

    expect(result.state).toBe("STALE");
    expect(result.usable).toBe(false);
    expect(result.ageSeconds).toBe(601);
  });
});
