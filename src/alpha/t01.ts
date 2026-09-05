export type GateCheck = "PASS" | "FAIL";

export interface T01QualificationInput {
  independentlyProvisioned: boolean;
  canonicalNodeExists: boolean;
  wardenAdmitted: boolean;
  riverEvidenced: boolean;
  duplicateCheck: GateCheck;
  placeholderCheck: GateCheck;
  destinationNodeId: string | null;
  wardenDecisionRef: string | null;
  riverReceiptRef: string | null;
}

export interface T01QualificationResult {
  countable: boolean;
  blockers: string[];
}

export function evaluateT01Qualification(
  input: T01QualificationInput,
): T01QualificationResult {
  const blockers: string[] = [];

  if (!input.independentlyProvisioned) blockers.push("INDEPENDENT_PROVISION_REQUIRED");
  if (!input.canonicalNodeExists) blockers.push("CANONICAL_NODE_REQUIRED");
  if (!input.wardenAdmitted) blockers.push("WARDEN_ADMISSION_REQUIRED");
  if (!input.wardenDecisionRef) blockers.push("WARDEN_DECISION_REF_REQUIRED");
  if (!input.riverEvidenced) blockers.push("RIVER_EVIDENCE_REQUIRED");
  if (!input.riverReceiptRef) blockers.push("RIVER_RECEIPT_REF_REQUIRED");
  if (input.duplicateCheck === "FAIL") blockers.push("DUPLICATE_DESTINATION_NODE");
  if (input.placeholderCheck === "FAIL") blockers.push("PLACEHOLDER_NOT_COUNTABLE");
  if (!input.destinationNodeId?.trim()) blockers.push("DESTINATION_NODE_ID_REQUIRED");

  return { countable: blockers.length === 0, blockers };
}
