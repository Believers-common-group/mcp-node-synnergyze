export interface ActionEnvelopeV1 {
  actionRef: string;
  actorRef: string;
  targetRef: string;
  wardenDecisionRef: string;
  requestedAt: string;
  correlationId: string;
}

export interface EvidenceReservationV1 {
  reservationRef: string;
  actionRef: string;
  correlationId: string;
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
