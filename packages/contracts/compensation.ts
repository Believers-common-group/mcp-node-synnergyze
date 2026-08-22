import type { WardenActionRequestV1 } from "./authority.ts";

export interface CompensationProposalV1 {
  schema_version: "compensation.v1";
  compensation_id: string;
  original_action_id: string;
  original_execution_id: string;
  reason: "PARTIAL_EFFECT" | "WRONG_EFFECT" | "DUPLICATE_EFFECT" | "REVERSAL_REQUIRED";
  proposed_action: WardenActionRequestV1;
  authority_required: true;
}
