import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { EfomPhysicalWorldContextV1 } from "../osiris/contracts.ts";
import type { EfomPolicyV1 } from "../osiris/policy.ts";
import type { WardenDecisionRequestV1 } from "./contracts.ts";
import {
  evaluateSyntheticWardenDecisionV1,
  type SyntheticWardenDecisionPolicyV1,
} from "./decision-service.ts";

const DECIDED_AT = "2026-08-14T07:00:30.000Z";

function request(overrides: Partial<WardenDecisionRequestV1> = {}): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:001",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:001",
    eventRef: "SYNNERGYZE-EVENT:001:001",
    action: "service_request.create",
    capabilityRef: "service_request.create",
    targetRef: "LAB-SERVICE-DESK-001",
    requestedEffect: "service_request.created",
    authorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    policyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    representationSourceRefs: ["REGISTRY:REPRESENTATION-001"],
    requestedAt: "2026-08-14T07:00:00.000Z",
    correlationId: "CORR-WARDEN-001",
    ...overrides,
  };
}

function efomPolicy(overrides: Partial<EfomPolicyV1> = {}): EfomPolicyV1 {
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

function policy(
  overrides: Partial<SyntheticWardenDecisionPolicyV1> = {},
): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:001",
    wardenRef: "WARDEN-ALPHA-CONFORMANCE-001",
    lifecycle: "ACTIVE",
    validFrom: "2026-08-14T06:55:00.000Z",
    validUntil: "2026-08-14T07:10:00.000Z",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:001",
    requiredAuthorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    requiredPolicyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    allowedCapabilityRefs: ["service_request.create"],
    manualReviewCapabilityRefs: ["contract.execute"],
    constraints: ["SYNTHETIC_CONFORMANCE_ONLY", "NO_EXTERNAL_EFFECT"],
    ...overrides,
  };
}

function efomContext(overrides: Partial<EfomPhysicalWorldContextV1> = {}): EfomPhysicalWorldContextV1 {
  return {
    operationClass: "ACT",
    observations: [
      {
        observationRef: "EFOM-OBS:WARDEN-001",
        sourceRef: "SENTINEL-2:TILE-WARDEN-001",
        sourceType: "SATELLITE_OPTICAL",
        subjectCandidateRef: "LAB-SERVICE-DESK-001",
        observedAt: "2026-08-14T06:59:00.000Z",
        validUntil: "2026-08-14T07:05:00.000Z",
        contentDigest: "sha256:warden-observation",
        sourceEvidenceRefs: ["RIVER-EVIDENCE:WARDEN-001"],
        confidence: 0.94,
        visibilityScope: "ESTATE",
        jurisdictionRef: "IN-KA",
        purposeRef: "PURPOSE:PHYSICAL-VERIFICATION",
      },
    ],
    findings: [
      {
        findingRef: "EFOM-FINDING:WARDEN-001",
        findingType: "PRESENCE_CORRELATION",
        observationRefs: ["EFOM-OBS:WARDEN-001"],
        statementDigest: "sha256:warden-finding",
        confidence: 0.93,
        derivedAt: "2026-08-14T06:59:30.000Z",
        sourceEvidenceRefs: ["RIVER-EVIDENCE:WARDEN-001"],
        status: "CORROBORATED",
      },
    ],
    discrepancies: [],
    attestations: [],
    ...overrides,
  };
}

function contextDigest(context: EfomPhysicalWorldContextV1): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(context), "utf8").digest("hex")}`;
}

function efomRequest(context = efomContext()): WardenDecisionRequestV1 {
  return request({
    operationClass: context.operationClass,
    physicalWorldContext: context,
    physicalWorldContextDigest: contextDigest(context),
  });
}

function decide(
  requestValue = request(),
  policyValue = policy(),
  decidedAt = DECIDED_AT,
) {
  return evaluateSyntheticWardenDecisionV1({
    request: requestValue,
    policy: policyValue,
    decidedAt,
  });
}

describe("VSR-NETWORK-WARDEN-DECISION-SERVICE-001", () => {
  it("allows one exact bounded request and emits a deterministic action token", () => {
    const decision = decide();

    expect(decision.decision).toBe("ALLOW");
    if (decision.decision !== "ALLOW") throw new Error("expected_allow");
    expect(decision.actionToken).toMatch(/^WARDEN-ACTION-TOKEN:/);
    expect(decision.reasonCodes).toEqual(["bounded_policy_allow"]);
    expect(decision.constraints).toEqual(["NO_EXTERNAL_EFFECT", "SYNTHETIC_CONFORMANCE_ONLY"]);
    expect(decision.validUntil).toBe("2026-08-14T07:10:00.000Z");
  });

  it("escalates a manual-review capability and never emits an action token", () => {
    const decision = decide(
      request({
        action: "contract.execute",
        capabilityRef: "contract.execute",
        targetRef: "LAB-CONTRACT-001",
      }),
    );

    expect(decision.decision).toBe("ESCALATE");
    expect("actionToken" in decision).toBe(false);
    expect(decision.reasonCodes).toEqual(["manual_review_required"]);
  });

  it("denies a capability outside the bounded allow/manual-review sets", () => {
    const decision = decide(
      request({ action: "bank.transfer", capabilityRef: "bank.transfer", targetRef: "BANK:TEST" }),
    );

    expect(decision.decision).toBe("DENY");
    expect("actionToken" in decision).toBe(false);
    expect(decision.reasonCodes).toEqual(["capability_not_permitted"]);
  });

  it("denies a revoked policy snapshot", () => {
    const decision = decide(request(), policy({ lifecycle: "REVOKED" }));

    expect(decision.decision).toBe("DENY");
    expect("actionToken" in decision).toBe(false);
    expect(decision.reasonCodes).toEqual(["authority_revoked"]);
  });

  it("denies requests before validity and decisions after expiry", () => {
    const notYetValid = decide(
      request({ requestedAt: "2026-08-14T06:50:00.000Z" }),
      policy(),
      "2026-08-14T06:56:00.000Z",
    );
    expect(notYetValid.decision).toBe("DENY");
    expect(notYetValid.reasonCodes).toEqual(["authority_not_yet_valid"]);

    const expired = decide(request(), policy(), "2026-08-14T07:11:00.000Z");
    expect(expired.decision).toBe("DENY");
    expect(expired.reasonCodes).toEqual(["authority_expired"]);
  });

  it("denies a decision timestamp that precedes the request", () => {
    const decision = decide(
      request({ requestedAt: "2026-08-14T07:01:00.000Z" }),
      policy(),
      "2026-08-14T07:00:30.000Z",
    );

    expect(decision.decision).toBe("DENY");
    expect(decision.reasonCodes).toEqual(["decision_before_request"]);
    expect("actionToken" in decision).toBe(false);
  });

  it("fails closed on malformed or inverted time context", () => {
    const malformed = decide(request({ requestedAt: "not-a-time" }));
    expect(malformed.decision).toBe("DENY");
    expect(malformed.reasonCodes).toEqual(["invalid_time_context"]);

    const inverted = decide(
      request(),
      policy({
        validFrom: "2026-08-14T07:10:00.000Z",
        validUntil: "2026-08-14T07:00:00.000Z",
      }),
    );
    expect(inverted.decision).toBe("DENY");
    expect(inverted.reasonCodes).toEqual(["invalid_time_context"]);
  });

  it("fails closed on actor, principal, capacity, context or program mismatch", () => {
    const mismatches: Array<Partial<WardenDecisionRequestV1>> = [
      { actorRef: "DIGITALME-IMPOSTOR-001" },
      { representedPrincipalRef: "OTHER-COMPANY-001" },
      { actingCapacityRef: "CAPACITY:OTHER-001" },
      { contextRef: "OTHER-NODE-001" },
      { programRef: "SYNNERGYZE-PROGRAM:OTHER" },
    ];

    for (const mismatch of mismatches) {
      const decision = decide(request(mismatch));
      expect(decision.decision).toBe("DENY");
      expect(decision.reasonCodes).toEqual(["identity_or_context_mismatch"]);
      expect("actionToken" in decision).toBe(false);
    }
  });

  it("denies when a required authority reference is absent", () => {
    const decision = decide(request({ authorityRefs: [] }));

    expect(decision.decision).toBe("DENY");
    expect(decision.reasonCodes).toEqual(["required_authority_missing"]);
    expect("actionToken" in decision).toBe(false);
  });

  it("denies when a required policy reference is absent", () => {
    const decision = decide(request({ policyRefs: [] }));

    expect(decision.decision).toBe("DENY");
    expect(decision.reasonCodes).toEqual(["required_policy_missing"]);
    expect("actionToken" in decision).toBe(false);
  });

  it("produces identical decision identity and token for identical inputs", () => {
    const first = decide();
    const second = decide();

    expect(second).toEqual(first);
    expect(first.decisionRef).toBe(second.decisionRef);
    if (first.decision !== "ALLOW" || second.decision !== "ALLOW") {
      throw new Error("expected_allow");
    }
    expect(first.actionToken).toBe(second.actionToken);
  });

  it("changes the bounded token when target or policy snapshot changes", () => {
    const first = decide();
    const targetChanged = decide(request({ targetRef: "LAB-SERVICE-DESK-002" }));
    const policyChanged = decide(request(), policy({ policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:002" }));

    if (
      first.decision !== "ALLOW" ||
      targetChanged.decision !== "ALLOW" ||
      policyChanged.decision !== "ALLOW"
    ) {
      throw new Error("expected_allow");
    }
    expect(targetChanged.actionToken).not.toBe(first.actionToken);
    expect(policyChanged.actionToken).not.toBe(first.actionToken);
  });

  it("denies malformed EFOM context fail-closed", () => {
    const decision = decide(
      request({ operationClass: "ACT", physicalWorldContextDigest: "sha256:missing-context" }),
      policy({ efomPolicy: efomPolicy() }),
    );
    expect(decision.decision).toBe("DENY");
    expect(decision.reasonCodes).toEqual(["efom_context_missing"]);
  });

  it("escalates material EFOM conflicts", () => {
    const base = efomContext();
    const conflicted = efomContext({
      findings: [{ ...base.findings[0], status: "CONFLICTED" }],
      discrepancies: [
        {
          discrepancyRef: "EFOM-DISCREPANCY:WARDEN-001",
          discrepancyType: "DECLARED_OBSERVED_MISMATCH",
          observationRefs: ["EFOM-OBS:WARDEN-001"],
          findingRefs: ["EFOM-FINDING:WARDEN-001"],
          severity: "REVIEW",
          material: true,
          openedAt: "2026-08-14T07:00:00.000Z",
          sourceEvidenceRefs: ["RIVER-EVIDENCE:WARDEN-002"],
        },
      ],
    });
    const decision = decide(efomRequest(conflicted), policy({ efomPolicy: efomPolicy() }));
    expect(decision.decision).toBe("ESCALATE");
    expect(decision.reasonCodes).toEqual(["efom_material_conflict"]);
    expect("actionToken" in decision).toBe(false);
  });

  it("denies ACT from a bare EFOM observation", () => {
    const bare = efomContext({ findings: [] });
    const decision = decide(efomRequest(bare), policy({ efomPolicy: efomPolicy() }));
    expect(decision.decision).toBe("DENY");
    expect(decision.reasonCodes).toEqual(["efom_action_from_unverified_observation"]);
    expect("actionToken" in decision).toBe(false);
  });

  it("allows corroborated EFOM context to continue through existing capability authorization", () => {
    const decision = decide(efomRequest(), policy({ efomPolicy: efomPolicy() }));
    expect(decision.decision).toBe("ALLOW");
    expect(decision.reasonCodes).toEqual(["bounded_policy_allow"]);
    if (decision.decision !== "ALLOW") throw new Error("expected_allow");
    expect(decision.actionToken).toMatch(/^WARDEN-ACTION-TOKEN:/);
  });

  it("keeps non-EFOM request behavior unchanged", () => {
    expect(decide().decision).toBe("ALLOW");
  });
});
