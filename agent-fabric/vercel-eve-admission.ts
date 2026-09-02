export type VercelEveAdmissionStatus = "ADMITTED" | "DENIED";
export type VercelEveWardenDecisionStatus = "ALLOW" | "DENY";
export type VercelEveAdmissionEventType =
  | "EVE_SESSION_ADMISSION_ACCEPTED"
  | "EVE_SESSION_ADMISSION_DENIED";

export interface VercelEveWardenDecision {
  decisionRef: string;
  decision: VercelEveWardenDecisionStatus;
  allowedCapabilities: readonly string[];
}

export interface VercelEveAdmissionInput {
  requestRef: string;
  requesterRef: string;
  representedEntityRef: string;
  purpose: string;
  requestedCapabilities: readonly string[];
  wardenDecision: VercelEveWardenDecision;
  requestedAt: string;
}

export interface VercelEveSessionRequest {
  requestRef: string;
  requesterRef: string;
  representedEntityRef: string;
  purpose: string;
  capabilities: readonly string[];
  requestedAt: string;
  wardenDecisionRef: string;
}

export interface VercelEveRiverAdmissionReceipt {
  receiptRef: string;
  eventType: VercelEveAdmissionEventType;
  requestRef: string;
  requesterRef: string;
  representedEntityRef: string;
  wardenDecisionRef: string;
  authorizedCapabilities: readonly string[];
  recordedAt: string;
}

export interface VercelEveAdmissionResult {
  status: VercelEveAdmissionStatus;
  eveSessionRequest?: VercelEveSessionRequest;
  riverReceipt: VercelEveRiverAdmissionReceipt;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function authorizedCapabilities(
  requested: readonly string[],
  allowed: readonly string[],
): string[] {
  const allowSet = new Set(allowed);
  return unique(requested).filter((capability) => allowSet.has(capability));
}

function receipt(
  input: VercelEveAdmissionInput,
  eventType: VercelEveAdmissionEventType,
  capabilities: readonly string[],
): VercelEveRiverAdmissionReceipt {
  return {
    receiptRef: `RIVER:EVE:${input.requestRef}:${eventType}`,
    eventType,
    requestRef: input.requestRef,
    requesterRef: input.requesterRef,
    representedEntityRef: input.representedEntityRef,
    wardenDecisionRef: input.wardenDecision.decisionRef,
    authorizedCapabilities: [...capabilities],
    recordedAt: input.requestedAt,
  };
}

export function admitVercelEveSession(
  input: VercelEveAdmissionInput,
): VercelEveAdmissionResult {
  if (input.wardenDecision.decision !== "ALLOW") {
    return {
      status: "DENIED",
      riverReceipt: receipt(input, "EVE_SESSION_ADMISSION_DENIED", []),
    };
  }

  const capabilities = authorizedCapabilities(
    input.requestedCapabilities,
    input.wardenDecision.allowedCapabilities,
  );

  return {
    status: "ADMITTED",
    eveSessionRequest: {
      requestRef: input.requestRef,
      requesterRef: input.requesterRef,
      representedEntityRef: input.representedEntityRef,
      purpose: input.purpose,
      capabilities,
      requestedAt: input.requestedAt,
      wardenDecisionRef: input.wardenDecision.decisionRef,
    },
    riverReceipt: receipt(input, "EVE_SESSION_ADMISSION_ACCEPTED", capabilities),
  };
}
