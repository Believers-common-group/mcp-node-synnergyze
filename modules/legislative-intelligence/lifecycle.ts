import lifecycleMap from "../../config/pestel/lifecycle-map.json" with { type: "json" };
import type {
  LegislativeLifecycleState,
  LegislativeLifecycleStateV1,
} from "./contracts.ts";

export const LIFECYCLE_NORMALIZER_VERSION = "PESTEL-LIFECYCLE-0.1.0";
export const LIFECYCLE_NORMALIZER_VERSION_V1 = "LEG-NORMALIZER:R0.1" as const;

export interface LifecycleActionInput {
  text: string;
  actionDate?: string;
}

export interface LifecycleLawInput {
  lawNumber?: string;
  effectiveDate?: string;
  enforced?: boolean;
}

export interface LifecycleNormalizationResult {
  state: LegislativeLifecycleState;
  matchedRule: string;
  version: string;
}

export interface LifecycleActionEvidenceV1 {
  code?: string;
  text: string;
  actionDate?: string;
}

export interface LifecycleEvidenceV1 {
  introduced: boolean;
  actions: readonly LifecycleActionEvidenceV1[];
  lawNumber?: string;
  effectiveDate?: string;
  evaluatedAt?: string;
  enforcementEvidence?: boolean;
  enforced?: boolean;
  superseded?: boolean;
  withdrawn?: boolean;
  failed?: boolean;
}

function result(state: LegislativeLifecycleState, matchedRule: string): LifecycleNormalizationResult {
  return { state, matchedRule, version: LIFECYCLE_NORMALIZER_VERSION };
}

export function normalizeLegislativeLifecycle(
  actions: readonly LifecycleActionInput[],
  lawState?: LifecycleLawInput,
): LifecycleNormalizationResult {
  if (lawState?.enforced) return result("ENFORCED", "law_enforced");
  if (lawState?.effectiveDate) return result("EFFECTIVE", "law_effective_date");
  if (lawState?.lawNumber) return result("ADOPTED", "authoritative_law_number");

  const text = actions.map((action) => action.text.toLowerCase()).join("\n");

  if (/withdrawn|laid on table|indefinitely postponed/.test(text)) {
    return result("WITHDRAWN", "withdrawal_action");
  }
  if (/failed of passage|rejected|veto sustained/.test(text)) {
    return result("FAILED", "failed_action");
  }
  if (/passed house|passed senate|ordered to be reported|reported by committee|cloture invoked/.test(text)) {
    return result("ADVANCING", "advancing_action");
  }
  if (/introduced in house|introduced in senate/.test(text)) {
    return result("PROPOSAL", "introduced_action");
  }

  return result("UNKNOWN", "no_defensible_match");
}

function matchesConfiguredAdvancingEvidence(text: string): boolean {
  const terms = Object.values(lifecycleMap.advancingEvidenceFamilies).flat();
  return terms.some((term) => text.includes(term.toLowerCase()));
}

function effectiveByEvaluation(evidence: LifecycleEvidenceV1): boolean {
  if (!evidence.lawNumber || !evidence.effectiveDate || !evidence.evaluatedAt) return false;
  const effectiveAt = Date.parse(evidence.effectiveDate);
  const evaluatedAt = Date.parse(evidence.evaluatedAt);
  return Number.isFinite(effectiveAt) && Number.isFinite(evaluatedAt) && effectiveAt <= evaluatedAt;
}

export function normalizeLegislativeLifecycleV1(
  evidence: LifecycleEvidenceV1,
): LegislativeLifecycleStateV1 {
  if (evidence.superseded) return "SUPERSEDED";
  if (evidence.withdrawn) return "WITHDRAWN";
  if (evidence.failed) return "FAILED";
  if (evidence.enforcementEvidence || evidence.enforced) return "ENFORCED";
  if (effectiveByEvaluation(evidence)) return "EFFECTIVE";
  if (evidence.lawNumber) return "ADOPTED";

  const actionText = evidence.actions.map((action) => action.text.toLowerCase()).join("\n");
  if (matchesConfiguredAdvancingEvidence(actionText)) return "ADVANCING";
  if (evidence.introduced) return "PROPOSAL";
  return "UNKNOWN";
}
