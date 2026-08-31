import type { AssuranceLevel } from "./assurance.ts";

export interface AttestationResultV1 {
  schema_version: "attestation-result.v1";
  attestation_id: string;
  source_event_id: string;
  result: "ACCEPT" | "REJECT";
  resulting_assurance?: AssuranceLevel;
  evaluated_at: string;
  reason_codes: readonly string[];
}
