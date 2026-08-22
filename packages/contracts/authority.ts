export interface WardenActionRequestV1 {
  schema_version: "warden-action-request.v1";
  action_id: string;
  action_type: string;
  resource_id: string;
  evidence_bundle_ref: string;
  requested_at: string;
  constraints: Readonly<Record<string, unknown>>;
}

export interface AuthorityReceiptV1 {
  schema_version: "authority-receipt.v1";
  authority_receipt_id: string;
  action_id: string;
  decision: "ALLOW" | "DENY" | "UNRESOLVED";
  scope_resource_ids: readonly string[];
  constraints: Readonly<Record<string, unknown>>;
  issued_at: string;
  valid_until: string;
}
