import { describe, expect, it } from "vitest";

import type { CandidateEvidenceV1, EvidenceRequirementV1 } from "./contracts.ts";
import { MALL_REQUIREMENT_DEFINITIONS_V1 } from "./blueprints/mall.ts";
import {
  applyWardenRequirementWaiverV1,
  evaluateEvidenceRequirementsV1,
} from "./requirement-engine.ts";
import type { WardenDecisionV1 } from "../warden/contracts.ts";

const candidateRef = "GENESIS-CANDIDATE:MOA";
const jurisdictionRef = "JURISDICTION:KA-BLR";

function evidence(
  evidenceRef: string,
  evidenceClass: string,
  evidenceState: CandidateEvidenceV1["evidenceState"] = "VALIDATED",
): CandidateEvidenceV1 {
  return {
    evidenceRef,
    candidateRef,
    evidenceClass,
    retrievedAt: "2026-08-28T01:00:00Z",
    evidenceState,
    accessClass: "PUBLIC",
  };
}

function allowDecision(requirement: EvidenceRequirementV1): WardenDecisionV1 {
  return {
    decisionRef: "WARDEN-DECISION:WAIVER-001",
    requestRef: "REQUEST:WAIVER-001",
    wardenRef: "WARDEN:ALPHA",
    decision: "ALLOW",
    action: "genesis.node_builder.requirement.waive",
    targetRef: requirement.requirementRef,
    reasonCodes: ["bounded_policy_allow"],
    constraints: [],
    decidedAt: "2026-08-28T01:00:00Z",
    correlationId: "CORR:WAIVER-001",
    actionToken: "SYNTHETIC-ACTION-TOKEN",
  };
}

describe("MALL evidence requirements", () => {
  it("defines the stable R0.1 Mall requirement catalogue", () => {
    expect(MALL_REQUIREMENT_DEFINITIONS_V1.map((item) => item.requirementClass)).toEqual([
      "IDENTITY_EVIDENCE",
      "JURISDICTION_EVIDENCE",
      "REGISTRATION_EVIDENCE",
      "TITLE_CHAIN_EVIDENCE",
      "ENCUMBRANCE_EVIDENCE",
      "PARCEL_BOUNDARY_EVIDENCE",
      "MUNICIPAL_IDENTIFIER_EVIDENCE",
      "BUILDING_APPROVAL_EVIDENCE",
      "AS_BUILT_GEOMETRY_EVIDENCE",
      "OCCUPANCY_COMPLETION_EVIDENCE",
      "FIRE_STATUTORY_EVIDENCE",
      "TENANCY_REGISTER_EVIDENCE",
      "ENGINEERING_UTILITY_EVIDENCE",
    ]);
  });

  it("emits stable missing requirements and satisfies only admissible evidence", () => {
    const requirements = evaluateEvidenceRequirementsV1({
      candidateRef,
      assetClass: "MALL",
      jurisdictionRef,
      evidence: [
        evidence("EVIDENCE:IDENTITY", "PROPERTY_IDENTITY_RECORD"),
        evidence("EVIDENCE:JURISDICTION", "JURISDICTION_RECORD"),
        evidence("EVIDENCE:REGISTRATION", "REGISTERED_DOCUMENT", "SEALED"),
        evidence("EVIDENCE:STALE:SURVEY", "AUTHORITATIVE_SURVEY", "STALE"),
      ],
    });

    expect(requirements).toHaveLength(13);
    expect(requirements.slice(0, 3).map((item) => item.status)).toEqual([
      "SATISFIED",
      "SATISFIED",
      "SATISFIED",
    ]);
    expect(requirements.find((item) => item.requirementClass === "TITLE_CHAIN_EVIDENCE")?.status)
      .toBe("MISSING");
    expect(
      requirements.find((item) => item.requirementClass === "PARCEL_BOUNDARY_EVIDENCE")?.status,
    ).toBe("MISSING");

    const replay = evaluateEvidenceRequirementsV1({
      candidateRef,
      assetClass: "MALL",
      jurisdictionRef,
      evidence: [
        evidence("EVIDENCE:REGISTRATION", "REGISTERED_DOCUMENT", "SEALED"),
        evidence("EVIDENCE:JURISDICTION", "JURISDICTION_RECORD"),
        evidence("EVIDENCE:IDENTITY", "PROPERTY_IDENTITY_RECORD"),
        evidence("EVIDENCE:STALE:SURVEY", "AUTHORITATIVE_SURVEY", "STALE"),
      ],
    });
    expect(replay.map((item) => item.requirementRef)).toEqual(
      requirements.map((item) => item.requirementRef),
    );
  });

  it("allows a correctly targeted Warden waiver only for waivable requirements", () => {
    const requirements = evaluateEvidenceRequirementsV1({
      candidateRef,
      assetClass: "MALL",
      jurisdictionRef,
      evidence: [],
    });
    const tenancy = requirements.find(
      (item) => item.requirementClass === "TENANCY_REGISTER_EVIDENCE",
    )!;
    const title = requirements.find((item) => item.requirementClass === "TITLE_CHAIN_EVIDENCE")!;

    const waived = applyWardenRequirementWaiverV1(tenancy, allowDecision(tenancy));
    expect(waived.status).toBe("WAIVED_BY_WARDEN");
    expect(waived.waiverDecisionRef).toBe("WARDEN-DECISION:WAIVER-001");
    expect(tenancy.status).toBe("MISSING");

    expect(() => applyWardenRequirementWaiverV1(title, allowDecision(title))).toThrow(
      "REQUIREMENT_NOT_WAIVABLE",
    );
  });

  it("rejects non-allow, wrong-action and wrong-target waiver decisions", () => {
    const requirement = evaluateEvidenceRequirementsV1({
      candidateRef,
      assetClass: "MALL",
      jurisdictionRef,
      evidence: [],
    }).find((item) => item.requirementClass === "TENANCY_REGISTER_EVIDENCE")!;

    const allowed = allowDecision(requirement);
    const denied: WardenDecisionV1 = {
      ...allowed,
      decision: "DENY",
      actionToken: undefined as never,
    };

    expect(() => applyWardenRequirementWaiverV1(requirement, denied)).toThrow(
      "WARDEN_WAIVER_NOT_ALLOWED",
    );
    expect(() =>
      applyWardenRequirementWaiverV1(requirement, {
        ...allowed,
        action: "different.action",
      }),
    ).toThrow("WARDEN_WAIVER_ACTION_MISMATCH");
    expect(() =>
      applyWardenRequirementWaiverV1(requirement, {
        ...allowed,
        targetRef: "REQ:OTHER",
      }),
    ).toThrow("WARDEN_WAIVER_TARGET_MISMATCH");
  });
});
