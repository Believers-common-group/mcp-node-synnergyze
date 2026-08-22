export interface EventInferenceV1 {
  schema_version: "inference.v1";
  inference_id: string;
  inference_type: string;
  consequence_state: "D1";
  evidence_bundle_ref: string;
  result: string;
  explanation: readonly string[];
  derived_at: string;
}
