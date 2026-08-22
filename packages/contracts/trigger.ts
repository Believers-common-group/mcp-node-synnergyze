import type { ConsequenceState } from "./consequence.ts";

export interface TriggerEvaluationV1 {
  schema_version: "trigger-evaluation.v1";
  trigger_evaluation_id: string;
  evidence_bundle_ref: string;
  inference_ref: string;
  consequence_state: ConsequenceState;
  result: "ELIGIBLE" | "INELIGIBLE" | "INDETERMINATE";
  reason_codes: readonly string[];
  evaluated_at: string;
}
