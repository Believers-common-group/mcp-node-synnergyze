export interface EvidenceDependencyV1 {
  schema_version: "dependency.v1";
  dependency_id: string;
  dependency_type: "gateway" | "power" | "clock" | "network" | "operator" | "other";
  source_ids: readonly string[];
  shared_domain_id: string;
  observed_at: string;
}
