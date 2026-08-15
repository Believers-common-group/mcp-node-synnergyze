export interface ActionEnvelopeV1 {
  actionRef: string;
  requestRef: string;
  actorRef: string;
  representedPrincipalRef: string;
  actingCapacityRef: string;
  contextRef: string;
  programRef: string;
  eventRef: string;
  action: string;
  capabilityRef: string;
  targetRef: string;
  executionDeviceRef?: string;
  deviceSecurityPolicyRef?: string;
  deviceSecurityRequestDigest?: string;
  wardenDecisionRef: string;
  actionToken: string;
  requestedAt: string;
  correlationId: string;
}

export interface EvidenceReservationV1 {
  reservationRef: string;
  actionRef: string;
  wardenDecisionRef: string;
  correlationId: string;
  authorizationDigest: string;
  state: "RESERVED";
  reservedAt: string;
}

export interface EventEnvelopeV1 {
  eventRef: string;
  correlationId: string;
  sequence: number;
  eventType: string;
  occurredAt: string;
  payloadDigest: string;
  predecessorEventRef?: string;
}

export interface EventReceiptV1 {
  receiptRef: string;
  eventRef: string;
  correlationId: string;
  acceptedAt: string;
  payloadDigest: string;
}

export interface EffectReceiptV1 {
  effectRef: string;
  correlationId: string;
  targetRef: string;
  observedStateRef: string;
  verifiedAt: string;
  verificationRef: string;
}

export interface EvidenceSealV1 {
  sealRef: string;
  reservationRef: string;
  correlationId: string;
  state: "SEALED";
  traceDigest: string;
  sealedAt: string;
}

export interface CausalTraceV1 {
  correlationId: string;
  reservationRef: string;
  eventReceiptRefs: readonly string[];
  effectRef?: string;
  sealRef?: string;
  sealed: boolean;
}
