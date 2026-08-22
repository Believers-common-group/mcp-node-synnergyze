export interface CredentialV1 {
  schema_version: "credential.v1";
  credential_id: string;
  credential_type: "calibration" | "identity" | "custody" | "coverage";
  subject_id: string;
  issuer_id: string;
  valid_from: string;
  valid_until?: string;
  revoked_at?: string;
  evidence_refs: readonly string[];
}
