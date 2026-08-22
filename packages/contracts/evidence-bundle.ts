import type { EvidencePolicyResultV1 } from "./evidence-policy.ts";

export interface EvidenceBundleV1 {
  schema_version: "evidence-bundle.v1";
  bundle_id: string;
  version: number;
  created_at: string;
  bundle_hash: string;
  previous_version_hash?: string;
  observation_refs: readonly string[];
  attestation_refs: readonly string[];
  credential_refs: readonly string[];
  context_refs: readonly string[];
  custody_refs: readonly string[];
  dependency_refs: readonly string[];
  contradiction_refs: readonly string[];
  policy_evaluation: EvidencePolicyResultV1;
}
