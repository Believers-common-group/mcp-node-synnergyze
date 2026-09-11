import { describe, expect, it } from "vitest";

import type { EfomFindingV1, EfomObservationV1, EfomPhysicalWorldContextV1 } from "./contracts.ts";
import { evaluateEfomPolicyV1, type EfomPolicyV1 } from "./policy.ts";
import { projectEfomClaimStateV1 } from "../genesis-node-builder/efom-claim-projection.ts";
import { buildGovernedEvidenceArtifactV1 } from "../river/governed-evidence.ts";
import type { WardenDecisionRequestV1 } from "../warden/contracts.ts";
import {
  evaluateSyntheticWardenDecisionV1,
  physicalWorldContextDigestV1,
  type SyntheticWardenDecisionPolicyV1,
} from "../warden/decision-service.ts";
import {
  buildRuntimeEffectPolicyV1,
  buildRuntimeWardenDecisionReceipt,
} from "../warden/runtime-authz-bridge.ts";

const EVALUATED_AT = "2026-09-10T07:00:00.000Z";

function observation(overrides: Partial<EfomObservationV1> = {}): EfomObservationV1 {
  return {
    observationRef: "EFOM-OBS:REVIEW-001",
    sourceRef: "SENTINEL-2:TILE-REVIEW-001",
    sourceType: "SATELLITE_OPTICAL",
    subjectCandidateRef: "GEN-NODE-CANDIDATE:REVIEW-001",
    observedAt: "2026-09-10T06:00:00.000Z",
    validUntil: "2026-09-10T12:00:00.000Z",
    contentDigest: "sha256:review-observation",
    sourceEvidenceRefs: ["RIVER-EVIDENCE:B", "RIVER-EVIDENCE:A"],
    confidence: 0.95,
    visibilityScope: "ESTATE",
    jurisdictionRef: "IN-KA",
    purposeRef: "PURPOSE:PHYSICAL-VERIFICATION",
    ...overrides,
  };
}

function finding(overrides: Partial<EfomFindingV1> = {}): EfomFindingV1 {
  return {
    findingRef: "EFOM-FINDING:REVIEW-001",
    findingType: "PRESENCE_CORRELATION",
    observationRefs: ["EFOM-OBS:REVIEW-001"],
    statementDigest: "sha256:review-finding",
    confidence: 0.94,
    derivedAt: "2026-09-10T06:05:00.000Z",
    sourceEvidenceRefs: ["RIVER-EVIDENCE:B", "RIVER-EVIDENCE:A"],
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

function efomPolicy(overrides: Partial<EfomPolicyV1> = {}): EfomPolicyV1 {
  return {
    policyRef: "EFOM-POLICY:REVIEW-001",
    allowedOperationClasses: ["OBSERVE", "INFER", "DISCLOSE", "ATTEST", "ACT"],
    minimumObservationConfidence: 0.8,
    requireCorroborationForOperationClasses: ["ACT", "ATTEST", "DISCLOSE"],
    manualReviewOnConflict: true,
    allowedVisibilityScopes: ["ESTATE"],
    allowedPurposeRefs: ["PURPOSE:PHYSICAL-VERIFICATION"],
    allowedJurisdictionRefs: ["IN-KA"],
    ...overrides,
  };
}

const EFFECT_POLICY = buildRuntimeEffectPolicyV1({ "service_request.create": "WRITE" });

function wardenRequest(physicalContext: EfomPhysicalWorldContextV1): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:REVIEW-001",
    actorRef: "DIGITALME:REVIEW-001",
    representedPrincipalRef: "ESTATE:REVIEW-001",
    actingCapacityRef: "CAPACITY:OPERATOR",
    contextRef: "GENESIS-NODE:REVIEW-001",
    programRef: "SYNNERGYZE-PROGRAM:REVIEW-001",
    eventRef: "EVENT:REVIEW-001",
    action: "service_request.create",
    capabilityRef: "service_request.create",
    targetRef: "TARGET:REVIEW-001",
    requestedEffect: "service_request.created",
    operationClass: "ACT",
    physicalWorldContext: physicalContext,
    physicalWorldContextDigest: physicalWorldContextDigestV1(physicalContext),
    authorityRefs: ["AUTHORITY:REVIEW-001"],
    policyRefs: ["POLICY:REVIEW-001", EFFECT_POLICY.policyRef],
    representationSourceRefs: ["REGISTRY:REVIEW-001"],
    requestedAt: "2026-09-10T06:59:00.000Z",
    correlationId: "CORR:REVIEW-001",
  };
}

function wardenPolicy(request: WardenDecisionRequestV1): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:REVIEW-001",
    wardenRef: "WARDEN:REVIEW-001",
    lifecycle: "ACTIVE",
    validFrom: "2026-09-10T06:55:00.000Z",
    validUntil: "2026-09-10T07:10:00.000Z",
    actorRef: request.actorRef,
    representedPrincipalRef: request.representedPrincipalRef,
    actingCapacityRef: request.actingCapacityRef,
    contextRef: request.contextRef,
    programRef: request.programRef,
    requiredAuthorityRefs: ["AUTHORITY:REVIEW-001"],
    requiredPolicyRefs: ["POLICY:REVIEW-001", EFFECT_POLICY.policyRef],
    allowedCapabilityRefs: ["service_request.create"],
    manualReviewCapabilityRefs: [],
    constraints: ["REVIEW-REGRESSION"],
    efomPolicy: efomPolicy(),
  };
}

describe("OSIRIS-EFOM-REVIEW-REGRESSIONS-R0-1", () => {
  it("rejects corroborated findings that are not bound to supplied observations", () => {
    const result = evaluateEfomPolicyV1({
      context: context({ findings: [finding({ observationRefs: ["EFOM-OBS:MISSING"] })] }),
      policy: efomPolicy(),
      evaluatedAt: EVALUATED_AT,
    });
    expect(result.decision).toBe("REJECTED");
    expect(result.reasonCodes).toContain("efom_finding_observation_not_bound");
  });

  it("requires ACT corroboration even when policy configuration omits ACT", () => {
    const result = evaluateEfomPolicyV1({
      context: context({ findings: [] }),
      policy: efomPolicy({ requireCorroborationForOperationClasses: [] }),
      evaluatedAt: EVALUATED_AT,
    });
    expect(result.decision).toBe("REJECTED");
    expect(result.reasonCodes).toContain("efom_action_from_unverified_observation");
  });

  it("does not count expired findings or attestations as current corroboration", () => {
    const expiredFinding = evaluateEfomPolicyV1({
      context: context({ findings: [finding({ validUntil: "2026-09-10T06:30:00.000Z" })] }),
      policy: efomPolicy(),
      evaluatedAt: EVALUATED_AT,
    });
    expect(expiredFinding.decision).toBe("REJECTED");
    expect(expiredFinding.reasonCodes).toContain("efom_corroboration_expired");

    const expiredAttestation = evaluateEfomPolicyV1({
      context: context({
        findings: [],
        attestations: [
          {
            attestationRef: "EFOM-ATTESTATION:REVIEW-001",
            attestorPrincipalRef: "PRINCIPAL:ATTESTOR-001",
            authorityRefs: ["AUTHORITY:ATTEST-001"],
            evidenceRefs: ["RIVER-EVIDENCE:ATTEST-001"],
            statementDigest: "sha256:attestation-review",
            issuedAt: "2026-09-10T06:10:00.000Z",
            validUntil: "2026-09-10T06:30:00.000Z",
          },
        ],
      }),
      policy: efomPolicy(),
      evaluatedAt: EVALUATED_AT,
    });
    expect(expiredAttestation.decision).toBe("REJECTED");
    expect(expiredAttestation.reasonCodes).toContain("efom_corroboration_expired");
  });

  it("preserves rejected findings as rejected Genesis claims", () => {
    expect(
      projectEfomClaimStateV1({
        kind: "FINDING",
        sourceEvidenceRefs: ["RIVER-EVIDENCE:REJECTED-001"],
        findingStatus: "REJECTED",
      }),
    ).toBe("REJECTED");
  });

  it("rejects blank governed-evidence provenance references", () => {
    expect(() =>
      buildGovernedEvidenceArtifactV1({
        artifactType: "OBSERVATION",
        sourceRefs: ["   "],
        evidenceRefs: ["RIVER-EVIDENCE:001"],
        contentDigest: "sha256:blank-ref",
        observedAt: "2026-09-10T06:00:00.000Z",
        correlationId: "CORR:BLANK-REF",
      }),
    ).toThrow("governed evidence source refs are required");
  });

  it("canonicalizes equivalent EFOM context into one Warden decision identity", () => {
    const firstContext = context();
    const secondContext = context({
      observations: [
        {
          ...observation(),
          sourceEvidenceRefs: ["RIVER-EVIDENCE:A", "RIVER-EVIDENCE:B"],
        },
      ],
      findings: [
        {
          ...finding(),
          sourceEvidenceRefs: ["RIVER-EVIDENCE:A", "RIVER-EVIDENCE:B"],
        },
      ],
    });
    const firstRequest = wardenRequest(firstContext);
    const secondRequest = wardenRequest(secondContext);
    const first = evaluateSyntheticWardenDecisionV1({
      request: firstRequest,
      policy: wardenPolicy(firstRequest),
      decidedAt: EVALUATED_AT,
    });
    const second = evaluateSyntheticWardenDecisionV1({
      request: secondRequest,
      policy: wardenPolicy(secondRequest),
      decidedAt: EVALUATED_AT,
    });
    expect(first.decision).toBe("ALLOW");
    expect(second.decision).toBe("ALLOW");
    expect(second.decisionRef).toBe(first.decisionRef);
    if (first.decision !== "ALLOW" || second.decision !== "ALLOW") throw new Error("expected_allow");
    expect(second.actionToken).toBe(first.actionToken);
  });

  it("caps an EFOM-informed Warden grant at the earliest evidence expiry", () => {
    const expiringContext = context({
      observations: [observation({ validUntil: "2026-09-10T07:05:00.000Z" })],
    });
    const req = wardenRequest(expiringContext);
    const decision = evaluateSyntheticWardenDecisionV1({
      request: req,
      policy: wardenPolicy(req),
      decidedAt: EVALUATED_AT,
    });
    expect(decision.decision).toBe("ALLOW");
    expect(decision.validUntil).toBe("2026-09-10T07:05:00.000Z");
  });

  it("rejects runtime reuse of a Warden grant with a replaced EFOM digest", () => {
    const physicalContext = context();
    const req = wardenRequest(physicalContext);
    const decision = evaluateSyntheticWardenDecisionV1({
      request: req,
      policy: wardenPolicy(req),
      decidedAt: EVALUATED_AT,
    });
    expect(decision.decision).toBe("ALLOW");

    expect(() =>
      buildRuntimeWardenDecisionReceipt({
        request: { ...req, physicalWorldContextDigest: "sha256:tampered" },
        decision,
        principal: {
          digitalMeId: req.actorRef,
          authenticatedPrincipalReceiptId: "DIGITALME-PRINCIPAL:REVIEW-001",
        },
        effectPolicy: EFFECT_POLICY,
      }),
    ).toThrow(/EFOM context digest/);
  });
});
