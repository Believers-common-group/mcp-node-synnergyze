export interface ExecutionReceiptV1 {
  schema_version: "execution-receipt.v1";
  execution_id: string;
  action_id: string;
  authority_receipt_id: string;
  status: "ACCEPTED" | "REJECTED" | "FAILED";
  external_reference?: string;
  executed_at: string;
}
