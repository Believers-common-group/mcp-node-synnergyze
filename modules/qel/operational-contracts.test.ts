import { describe, expect, it } from "vitest";

import {
  bindRiverVerifiedOutcomeV01,
  validateQelOperationalFrameV01,
  VSR_QEL_CORE_CONTRACT_VERSION,
  type QelOperationalFrameV01,
} from "./operational-contracts.ts";

function frame(overrides: Partial<QelOperationalFrameV01> = {}): QelOperationalFrameV01 {
  return {
    contractVersion: VSR_QEL_CORE_CONTRACT_VERSION,
    frameRef: "QEL-FRAME-001",
    correlationId: "QEL-CORR-001",
    observedAt: "2026-08-21T08:35:00.000Z",
    object: {
      id: "LINE-03/MOTOR-04",
      type: "MACHINE",
      class: "MOTOR",
      registryRef: "GENESIS:MOTOR-04",
      locationRef: "FACTORY-BLR-001",
    },
    state: { value: "ACTIVE", kind: "FACT", confidence: 1 },
    health: { value: "WATCH", kind: "DERIVED", confidence: 0.97 },
    flow: {
      state: "SLOWING",
      value: 812,
      unit: "PCS_PER_SHIFT",
      direction: "OUTPUT",
      trend: "FALLING",
    },
    demand: { type: "SERVICE", priority: "HIGH", target: "BEARING_INSPECTION" },
    risk: { type: "PRODUCTION_INTERRUPTION", severity: "HIGH", confidence: 0.91 },
    moves: [
      { action: "INSPECT", authority: "ALLOWED", targetRef: "LINE-03/MOTOR-04" },
      { action: "REROUTE", authority: "APPROVAL_REQUIRED", targetRef: "LINE-05" },
    ],
    evidence: {
      status: "FRESH",
      confidence: 0.97,
      freshness: {
        observedAt: "2026-08-21T08:34:56.000Z",
        ageMs: 4000,
        status: "FRESH",
        maximumValidAgeMs: 30000,
      },
      sources: [
        { sourceRef: "PLC-03", kind: "CONTROLLER", nativeRef: "DB9.DBD42" },
        { sourceRef: "TEMP-SENSOR-44", kind: "SENSOR" },
      ],
    },
    outcome: { state: "OBSERVED" },
    native: {
      provider: "SIEMENS",
      protocol: "OPC-UA",
      sourceRef: "ns=4;s=Line03/Motor04/Temp",
      rawValue: 84.2,
      rawUnit: "degC",
      adapterRef: "QEL-MAP-SIEMENS-S7",
      adapterVersion: "1.0.0",
    },
    ...overrides,
  };
}

describe("VSR-QEL-CORE-001 operational frame", () => {
  it("accepts a complete operational frame", () => {
    expect(validateQelOperationalFrameV01(frame())).toEqual({ ok: true, issues: [] });
  });

  it("does not allow a VERIFIED outcome without a River receipt", () => {
    const result = validateQelOperationalFrameV01(
      frame({ outcome: { state: "VERIFIED", effectRef: "EFFECT-001" } }),
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("verified_outcome_requires_river_receipt");
  });

  it("accepts VERIFIED only when River evidence is bound", () => {
    const result = validateQelOperationalFrameV01(
      frame({
        outcome: {
          state: "VERIFIED",
          effectRef: "EFFECT-001",
          riverReceiptRef: "RIVER:EFFECT-RECEIPT-001",
        },
      }),
    );

    expect(result.ok).toBe(true);
  });

  it("fails closed when evidence is missing but confidence is non-zero", () => {
    const valid = frame();
    const result = validateQelOperationalFrameV01(
      frame({
        evidence: {
          ...valid.evidence,
          status: "MISSING",
          confidence: 0.5,
          freshness: { ...valid.evidence.freshness, status: "MISSING" },
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("missing_evidence_must_have_zero_confidence");
  });

  it("rejects confidence outside the canonical zero-to-one range", () => {
    const result = validateQelOperationalFrameV01(
      frame({ risk: { type: "PRODUCTION_INTERRUPTION", severity: "HIGH", confidence: 1.4 } }),
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("risk_confidence_invalid");
  });

  it("keeps provider/native evidence optional but complete when supplied", () => {
    const result = validateQelOperationalFrameV01(
      frame({
        native: {
          provider: "SIEMENS",
          sourceRef: "",
          adapterRef: "QEL-MAP-SIEMENS-S7",
          adapterVersion: "1.0.0",
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toContain("native_binding_incomplete");
  });
  it("binds a correlated fresh River receipt into VERIFIED", () => {
    const result = bindRiverVerifiedOutcomeV01({
      correlationId: "QEL-CORR-001",
      effectRef: "EFFECT-001",
      observedAt: "2026-08-21T08:35:00.000Z",
      maximumReceiptAgeMs: 30_000,
      receipt: {
        receiptRef: "RIVER:EFFECT-RECEIPT-001",
        correlationId: "QEL-CORR-001",
        effectRef: "EFFECT-001",
        verifiedAt: "2026-08-21T08:34:59.000Z",
        verificationState: "VERIFIED",
      },
    });

    expect(result).toEqual({
      outcome: {
        state: "VERIFIED",
        effectRef: "EFFECT-001",
        riverReceiptRef: "RIVER:EFFECT-RECEIPT-001",
      },
    });
  });

  it("fails closed on mismatched, future or stale River verification evidence", () => {
    const common = {
      correlationId: "QEL-CORR-001",
      effectRef: "EFFECT-001",
      observedAt: "2026-08-21T08:35:00.000Z",
      maximumReceiptAgeMs: 30_000,
    };
    const receipt = {
      receiptRef: "RIVER:EFFECT-RECEIPT-001",
      correlationId: "QEL-CORR-001",
      effectRef: "EFFECT-001",
      verifiedAt: "2026-08-21T08:34:59.000Z",
      verificationState: "VERIFIED" as const,
    };

    expect(
      bindRiverVerifiedOutcomeV01({
        ...common,
        receipt: { ...receipt, correlationId: "QEL-CORR-OTHER" },
      }),
    ).toMatchObject({
      outcome: { state: "CONFLICTING_EVIDENCE" },
      issue: "river_receipt_correlation_mismatch",
    });
    expect(
      bindRiverVerifiedOutcomeV01({
        ...common,
        receipt: { ...receipt, verifiedAt: "2026-08-21T08:35:01.000Z" },
      }),
    ).toMatchObject({
      outcome: { state: "CONFLICTING_EVIDENCE" },
      issue: "river_receipt_from_future",
    });
    expect(
      bindRiverVerifiedOutcomeV01({
        ...common,
        receipt: { ...receipt, verifiedAt: "2026-08-21T08:34:00.000Z" },
      }),
    ).toMatchObject({
      outcome: { state: "EVIDENCE_BOUND" },
      issue: "river_receipt_stale",
    });
  });

});
