export interface ExceptionRecordV1 {
  schema_version: "exception.v1";
  exception_id: string;
  exception_type: string;
  state: "OPEN" | "RESOLVED";
  source_event_id?: string;
  evidence_refs: readonly string[];
  opened_at: string;
  resolved_at?: string;
}
