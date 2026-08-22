export type ReconciliationState =
  | "OPEN"
  | "MATCHED"
  | "MISMATCHED"
  | "TIMED_OUT"
  | "COMPENSATION_REQUIRED"
  | "CLOSED";

export interface ReconciliationRecordV1 {
  schema_version: "reconciliation.v1";
  reconciliation_id: string;
  action_id: string;
  execution_id: string;
  expected_effect: Readonly<Record<string, unknown>>;
  observed_effect?: Readonly<Record<string, unknown>>;
  state: ReconciliationState;
  evidence_refs: readonly string[];
  opened_at: string;
  resolved_at?: string;
}
