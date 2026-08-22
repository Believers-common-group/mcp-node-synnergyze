export type EvidencePolicyDecision = "PASS" | "FAIL" | "INDETERMINATE";

export interface EvidencePolicyRequirementResultV1 {
  requirement_id: string;
  decision: EvidencePolicyDecision;
  reason_code?: string;
  evidence_refs: readonly string[];
}

export interface EvidencePolicyV1 {
  schema_version: "evidence-policy.v1";
  policy_id: string;
  policy_version: number;
  minimum_sources: number;
  minimum_source_assurance: "A0" | "A1" | "A2" | "A3" | "A4";
  minimum_independent_domains: number;
  calibration_required: boolean;
  custody_required: boolean;
}

export interface EvidencePolicyResultV1 {
  schema_version: "evidence-policy-result.v1";
  policy_id: string;
  policy_version: number;
  decision: EvidencePolicyDecision;
  requirements: readonly EvidencePolicyRequirementResultV1[];
  evaluated_at: string;
}
