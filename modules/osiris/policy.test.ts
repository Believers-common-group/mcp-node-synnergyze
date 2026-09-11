import { describe, expect, it } from "vitest";

import type {
  EfomFindingV1,
  EfomObservationV1,
  EfomPhysicalWorldContextV1,
} from "./contracts.ts";
import { evaluateEfomPolicyV1, type EfomPolicyV1 } from "./policy.ts";

const EVALUATED_AT = "2026-09-10T07:00:00.000Z";

function observation(overrides: Partial<EfomObservationV1> = {}): EfomObservationV1 {
  return {
    observationRef: "EFOM-OBS:001",
    sourceRef: "SENTINEL-2:TILE-001",
    sourceType: "SATELLITE_OPTICAL",
    subjectCandidateRef: "GEN-NODE-CANDIDATE:001",
    locationRef: "LOCATION:001",
    terrainClass: "LAND",
    observedAt: "2026-09-10T06:00:00.000Z",
    validUntil: "2026-09-10T12:00:00.000Z",
    contentDigest: "sha256:obs001",
    sourceEvidenceRefs: ["RIVER-EVIDENCE:001"],
    confidence: 0.92,
    visibilityScope: "ESTATE",
    jurisdictionRef: "IN-KA",
    purposeRef: "PURPOSE:PHYSICAL-VERIFICATION",
    ...overrides,
  };
}

function finding(overrides: Partial<EfomFindingV1> = {}): EfomFindingV1 {
  return {
    findingRef: "EFOM-FINDING:001",
    findingType: "PRESENCE_CORRELATION",
    observationRefs: ["EFOM-OBS:001"],
    statementDigest: "sha256:finding001",
    confidence: 0.91,
    derivedAt: "2026-09-10T06:05:00.000Z",
    sourceEvidenceRefs: ["RIVER-EVIDENCE:001"],
    status: "CORROBORATED",
    ...overrides,
  };
}

function context(overrides: Partial<EfomPhysicalWorldContextV1> = {}): EfomPhysicalWorldContextV1 {
  return {
    operationClass: "ACT",
    observations: [observation()],
    findings: [finding()],
    discrepancies: [],
    attestations: [],
    ...overrides,
  };
}

function policy(overrides: Partial<EfomPolicyV1> = {}): EfomPolicyV1 {
  return {
    policyRef: "EFOM-POLICY:001",
    allowedOperationClasses: ["OBSERVE", "INFER", "DISCLOSE", "ATTEST", "ACT"],
    minimumObservationConfidence: 0.8,
    requireCorroborationForOperationClasses: ["ACT", "ATTEST", "DISCLOSE"],
    manualReviewOnConflict: true,
    allowedVisibilityScopes: ["ESTATE", "REGULATOR"],
    allowedPurposeRefs: ["PURPOSE:PHYSICAL-VERIFICATION"],
    allowedJurisdictionRefs: ["IN-KA"],
    ...overrides,
  };
}

describe("OSIRIS-EFOM-POLICY-R0-1", () => {
  it("admits corroborated in-scope context", () => {
    expect(
      evaluateEfomPolicyV1({ context: context(), policy: policy(), evaluatedAt: EVALUATED_AT }),
    ).toEqual({
      decision: "ADMISSIBLE",
      reasonCodes: ["efom_policy_admissible"],
      evidenceRefs: ["RIVER-EVIDENCE:001"],
    });
  });

  it("rejects observations with missing provenance", () => {
    const result = evaluateEfomPolicyV1({
      context: context({ observations: [observation({ sourceEvidenceRefs: [] })] }),
      policy: policy(),
      evaluatedAt: EVALUATED_AT,
    });
    expect(result.decision).toBe("REJECTED");
    expect(result.reasonCodes).toContain("efom_provenance_missing");
  });

  it("rejects future and actionable expired observations", () => {
    const future = evaluateEfomPolicyV1({
      context: context({ observations: [observation({ observedAt: "2026-09-10T08:00:00.000Z" })] }),
      policy: policy(),
      evaluatedAt: EVALUATED_AT,
    });
    expect(future.decision).toBe("REJECTED");
    expect(future.reasonCodes).toContain("efom_observation_from_future");

    const expired = evaluateEfomPolicyV1({
      context: context({ observations: [observation({ validUntil: "2026-09-10T06:30:00.000Z" })] }),
      policy: policy(),
      evaluatedAt: EVALUATED_AT,
    });
    expect(expired.decision).toBe("REJECTED");
    expect(expired.reasonCodes).toContain("efom_observation_expired");
  });

  it("requires review when observation confidence is below threshold", () => {
    const result = evaluateEfomPolicyV1({
      context: context({ observations: [observation({ confidence: 0.6 })] }),
      policy: policy(),
      evaluatedAt: EVALUATED_AT,
    });
    expect(result.decision).toBe("REVIEW_REQUIRED");
    expect(result.reasonCodes).toContain("efom_confidence_below_threshold");
  });

  it("rejects invalid confidence values", () => {
    const result = evaluateEfomPolicyV1({
      context: context({ observations: [observation({ confidence: 1.1 })] }),
      policy: policy(),
      evaluatedAt: EVALUATED_AT,
    });
    expect(result.decision).toBe("REJECTED");
    expect(result.reasonCodes).toContain("efom_invalid_confidence");
  });

  it("requires review for a material evidence conflict when configured", () => {
    const result = evaluateEfomPolicyV1({
      context: context({
        findings: [finding({ status: "CONFLICTED" })],
        discrepancies: [
          {
            discrepancyRef: "EFOM-DISCREPANCY:001",
            discrepancyType: "DECLARED_OBSERVED_MISMATCH",
            observationRefs: ["EFOM-OBS:001"],
            findingRefs: ["EFOM-FINDING:001"],
            severity: "REVIEW",
            material: true,
            openedAt: "2026-09-10T06:10:00.000Z",
            sourceEvidenceRefs: ["RIVER-EVIDENCE:002"],
          },
        ],
      }),
      policy: policy(),
      evaluatedAt: EVALUATED_AT,
    });
    expect(result.decision).toBe("REVIEW_REQUIRED");
    expect(result.reasonCodes).toContain("efom_material_conflict");
  });

  it("rejects ACT from a bare observation without corroboration or attestation", () => {
    const result = evaluateEfomPolicyV1({
      context: context({ findings: [] }),
      policy: policy(),
      evaluatedAt: EVALUATED_AT,
    });
    expect(result.decision).toBe("REJECTED");
    expect(result.reasonCodes).toContain("efom_action_from_unverified_observation");
  });

  it("rejects visibility, purpose and jurisdiction outside policy", () => {
    const wrongScope = evaluateEfomPolicyV1({
      context: context({ observations: [observation({ visibilityScope: "PUBLIC" })] }),
      policy: policy(),
      evaluatedAt: EVALUATED_AT,
    });
    expect(wrongScope.reasonCodes).toContain("efom_visibility_scope_not_permitted");

    const wrongPurpose = evaluateEfomPolicyV1({
      context: context({ observations: [observation({ purposeRef: "PURPOSE:MARKETING" })] }),
      policy: policy(),
      evaluatedAt: EVALUATED_AT,
    });
    expect(wrongPurpose.reasonCodes).toContain("efom_purpose_not_permitted");

    const wrongJurisdiction = evaluateEfomPolicyV1({
      context: context({ observations: [observation({ jurisdictionRef: "US-CA" })] }),
      policy: policy(),
      evaluatedAt: EVALUATED_AT,
    });
    expect(wrongJurisdiction.reasonCodes).toContain("efom_jurisdiction_not_permitted");
  });
});
