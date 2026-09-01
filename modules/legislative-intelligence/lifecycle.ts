import type { LegislativeLifecycleState } from "./contracts.ts";

export const LIFECYCLE_NORMALIZER_VERSION = "PESTEL-LIFECYCLE-0.1.0";

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
