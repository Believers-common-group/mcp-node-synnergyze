import { createHash } from "node:crypto";

import type { WardenDecisionV1 } from "../warden/contracts.ts";
import { MALL_REQUIREMENT_DEFINITIONS_V1 } from "./blueprints/mall.ts";
import type {
  CandidateEvidenceV1,
  EvidenceRequirementV1,
  GenesisAssetClassV1,
} from "./contracts.ts";

export interface EvaluateRequirementsInputV1 {
  candidateRef: string;
  assetClass: GenesisAssetClassV1;
  jurisdictionRef: string;
  evidence: readonly CandidateEvidenceV1[];
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort();
}

function isAdmissibleEvidenceState(evidence: CandidateEvidenceV1): boolean {
  return evidence.evidenceState === "VALIDATED" || evidence.evidenceState === "SEALED";
}

export function evaluateEvidenceRequirementsV1(
  input: EvaluateRequirementsInputV1,
): readonly EvidenceRequirementV1[] {
  if (input.assetClass !== "MALL") {
    throw new Error("UNSUPPORTED_ASSET_CLASS");
  }

  return MALL_REQUIREMENT_DEFINITIONS_V1.map((definition) => {
    const matches = input.evidence
      .filter((item) => item.candidateRef === input.candidateRef)
      .filter(isAdmissibleEvidenceState)
      .filter((item) => definition.acceptableEvidenceClasses.includes(item.evidenceClass))
      .map((item) => item.evidenceRef);
    const satisfiedByEvidenceRefs = stableUnique(matches);
    const requirementSeed = JSON.stringify({
      candidateRef: input.candidateRef,
      assetClass: input.assetClass,
      requirementClass: definition.requirementClass,
      category: definition.category,
      mandatoryForGate: definition.mandatoryForGate,
      waivable: definition.waivable,
      acceptableEvidenceClasses: [...definition.acceptableEvidenceClasses].sort(),
      reasonCode: definition.reasonCode,
    });

    return {
      requirementRef: `GENESIS-REQUIREMENT:${sha256(requirementSeed).slice(0, 24)}`,
      candidateRef: input.candidateRef,
      requirementClass: definition.requirementClass,
      category: definition.category,
      assetClass: input.assetClass,
      jurisdictionRef: input.jurisdictionRef,
      mandatoryForGate: definition.mandatoryForGate,
      waivable: definition.waivable,
      acceptableEvidenceClasses: [...definition.acceptableEvidenceClasses],
      status: satisfiedByEvidenceRefs.length > 0 ? "SATISFIED" : "MISSING",
      reasonCode: definition.reasonCode,
      satisfiedByEvidenceRefs,
    } satisfies EvidenceRequirementV1;
  });
}

export function applyWardenRequirementWaiverV1(
  requirement: EvidenceRequirementV1,
  decision: WardenDecisionV1,
): EvidenceRequirementV1 {
  if (!requirement.waivable) {
    throw new Error("REQUIREMENT_NOT_WAIVABLE");
  }
  if (requirement.status === "SATISFIED" || requirement.status === "NOT_APPLICABLE") {
    throw new Error("REQUIREMENT_WAIVER_NOT_APPLICABLE");
  }
  if (decision.decision !== "ALLOW") {
    throw new Error("WARDEN_WAIVER_NOT_ALLOWED");
  }
  if (decision.action !== "genesis.node_builder.requirement.waive") {
    throw new Error("WARDEN_WAIVER_ACTION_MISMATCH");
  }
  if (decision.targetRef !== requirement.requirementRef) {
    throw new Error("WARDEN_WAIVER_TARGET_MISMATCH");
  }

  return {
    ...requirement,
    acceptableEvidenceClasses: [...requirement.acceptableEvidenceClasses],
    satisfiedByEvidenceRefs: [...requirement.satisfiedByEvidenceRefs],
    status: "WAIVED_BY_WARDEN",
    waiverDecisionRef: decision.decisionRef,
  };
}
