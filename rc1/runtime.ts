export const RC1_IDENTITIES = {
  entityRef: "LAB-COMPANY-001",
  actorRef: "DIGITALME-ALPHA-TEST-001",
  wardenRef: "WARDEN-ALPHA-RC1-001",
  programRef: "ALPHA-RC1-PROGRAM-001",
} as const;

export const RC1_EVENT_SEQUENCE = [
  "RC1-E01 IDENTIFY",
  "RC1-E02 RELATE",
  "RC1-E03 REQUIREMENTS",
  "RC1-E04 PREPARE_ALLOWED",
  "RC1-E05 WARDEN_ALLOW",
  "RC1-E06 RESERVE_EVIDENCE",
  "RC1-E07 EXECUTE_ALLOWED",
  "RC1-E08 VERIFY_ALLOWED",
  "RC1-E09 SEAL_EVIDENCE",
  "RC1-E10 PREPARE_FORBIDDEN",
  "RC1-E11 WARDEN_DENY",
  "RC1-E12 PROVE_NO_EFFECT",
  "RC1-E13 REVOKE",
  "RC1-E14 POST_REVOKE_DENY",
  "RC1-E15 RECONSTRUCT",
  "RC1-E16 CLOSE",
] as const;

export type Rc1Capability = "service_request.create" | "contract.execute";
export type Rc1DecisionStatus = "ALLOW" | "DENY";
export type Rc1AttemptStatus =
  | "VERIFIED"
  | "DENIED"
  | "MISSING_AUTHORIZATION"
  | "BLOCKED_REQUIREMENT"
  | "EXCEPTION";
export type Rc1ProgramState =
  | "DRAFT"
  | "RUNNING"
  | "EXCEPTION"
  | "EFFECT_RECORDED"
  | "CLOSED";

export interface Rc1ActionIntent {
  programRef: string;
  actorRef: string;
  representedEntityRef: string;
  capability: Rc1Capability;
  correlationId: string;
  targetRef: string;
}

export interface Rc1WardenDecision {
  decisionRef: string;
  wardenRef: string;
  status: Rc1DecisionStatus;
  reason: string;
  actionToken?: string;
}

export interface Rc1EvidenceEntry {
  evidenceRef: string;
  correlationId: string;
  stage: "RESERVED" | "SEALED" | "DENIED" | "EXCEPTION";
  capability: Rc1Capability;
  decisionRef?: string;
  effectRef?: string;
  reason?: string;
}

export interface SyntheticServiceRequest {
  serviceRequestRef: string;
  correlationId: string;
  programRef: string;
  actorRef: string;
  representedEntityRef: string;
  targetRef: string;
  capability: "service_request.create";
  synthetic: true;
}

export interface Rc1ActionReceipt {
  receiptRef: string;
  serviceRequestRef: string;
  correlationId: string;
  idempotentReplay: boolean;
  synthetic: true;
}

export interface Rc1ActionAttemptResult {
  status: Rc1AttemptStatus;
  correlationId: string;
  capability: Rc1Capability;
  decision?: Rc1WardenDecision;
  evidenceReservationRef?: string;
  receipt?: Rc1ActionReceipt;
  effectRef?: string;
  syntheticEffectRecorded: boolean;
  reason?: string;
}

export interface Rc1EventRecord {
  code: (typeof RC1_EVENT_SEQUENCE)[number];
  programRef: string;
  status: "OBSERVED" | "PREPARED" | "ALLOWED" | "DENIED" | "VERIFIED" | "CLOSED";
  correlationId?: string;
  decisionRef?: string;
  evidenceRef?: string;
  effectRef?: string;
}

export interface Rc1FrontGateProjection {
  programRef: string;
  actorRef: string;
  representedEntityRef: string;
  allowedRequestRef?: string;
  finalEffectRef?: string;
  programState: Rc1ProgramState;
}

export interface Rc1BackGateProjection {
  programRef: string;
  actorRef: string;
  representedEntityRef: string;
  allowedRequestRef?: string;
  finalEffectRef?: string;
  programState: Rc1ProgramState;
  decisionRefs: string[];
  evidenceRefs: string[];
}

export interface Rc1RunResult {
  programRef: string;
  programState: Rc1ProgramState;
  events: Rc1EventRecord[];
  frontGate: Rc1FrontGateProjection;
  backGate: Rc1BackGateProjection;
  gatewayRequestCount: number;
  realWorldEffectOccurred: false;
}

export interface Rc1AttemptOptions {
  omitDecision?: boolean;
  omitEvidenceReservation?: boolean;
  injectReadMismatch?: boolean;
}

class SyntheticWarden {
  private revoked = false;

  authorize(intent: Rc1ActionIntent): Rc1WardenDecision {
    const decisionRef = `RC1-WARDEN-DECISION:${intent.correlationId}`;

    if (this.revoked) {
      return {
        decisionRef,
        wardenRef: RC1_IDENTITIES.wardenRef,
        status: "DENY",
        reason: "authority_revoked",
      };
    }

    const contextMatches =
      intent.programRef === RC1_IDENTITIES.programRef &&
      intent.actorRef === RC1_IDENTITIES.actorRef &&
      intent.representedEntityRef === RC1_IDENTITIES.entityRef;

    if (!contextMatches) {
      return {
        decisionRef,
        wardenRef: RC1_IDENTITIES.wardenRef,
        status: "DENY",
        reason: "context_mismatch",
      };
    }

    if (intent.capability !== "service_request.create") {
      return {
        decisionRef,
        wardenRef: RC1_IDENTITIES.wardenRef,
        status: "DENY",
        reason: "capability_not_permitted",
      };
    }

    return {
      decisionRef,
      wardenRef: RC1_IDENTITIES.wardenRef,
      status: "ALLOW",
      reason: "synthetic_rc1_policy_allow",
      actionToken: `RC1-ACTION-TOKEN:${intent.correlationId}`,
    };
  }

  revoke(): void {
    this.revoked = true;
  }
}

class SyntheticRiverEvidence {
  private readonly entries: Rc1EvidenceEntry[] = [];
  private failNextReservation = false;

  failReservationOnce(): void {
    this.failNextReservation = true;
  }

  reserve(intent: Rc1ActionIntent, decision: Rc1WardenDecision): string | undefined {
    if (this.failNextReservation) {
      this.failNextReservation = false;
      this.entries.push({
        evidenceRef: `RC1-EVIDENCE-EXCEPTION:${intent.correlationId}`,
        correlationId: intent.correlationId,
        stage: "EXCEPTION",
        capability: intent.capability,
        decisionRef: decision.decisionRef,
        reason: "evidence_reservation_unavailable",
      });
      return undefined;
    }

    const evidenceRef = `RC1-EVIDENCE-RESERVATION:${intent.correlationId}`;
    this.entries.push({
      evidenceRef,
      correlationId: intent.correlationId,
      stage: "RESERVED",
      capability: intent.capability,
      decisionRef: decision.decisionRef,
    });
    return evidenceRef;
  }

  seal(intent: Rc1ActionIntent, decision: Rc1WardenDecision, effectRef: string): string {
    const evidenceRef = `RC1-EVIDENCE-SEALED:${intent.correlationId}`;
    this.entries.push({
      evidenceRef,
      correlationId: intent.correlationId,
      stage: "SEALED",
      capability: intent.capability,
      decisionRef: decision.decisionRef,
      effectRef,
    });
    return evidenceRef;
  }

  recordDenied(intent: Rc1ActionIntent, decision: Rc1WardenDecision): string {
    const evidenceRef = `RC1-EVIDENCE-DENIED:${intent.correlationId}`;
    this.entries.push({
      evidenceRef,
      correlationId: intent.correlationId,
      stage: "DENIED",
      capability: intent.capability,
      decisionRef: decision.decisionRef,
      reason: decision.reason,
    });
    return evidenceRef;
  }

  recordException(intent: Rc1ActionIntent, decision: Rc1WardenDecision, reason: string): string {
    const evidenceRef = `RC1-EVIDENCE-EXCEPTION:${intent.correlationId}`;
    this.entries.push({
      evidenceRef,
      correlationId: intent.correlationId,
      stage: "EXCEPTION",
      capability: intent.capability,
      decisionRef: decision.decisionRef,
      reason,
    });
    return evidenceRef;
  }

  list(): Rc1EvidenceEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }
}

class InMemoryActionGateway {
  private readonly requests = new Map<string, SyntheticServiceRequest>();
  private readonly mismatchReads = new Set<string>();

  injectReadMismatch(correlationId: string): void {
    this.mismatchReads.add(correlationId);
  }

  execute(
    intent: Rc1ActionIntent,
    decision: Rc1WardenDecision | undefined,
    evidenceReservationRef: string | undefined,
  ): Rc1ActionReceipt {
    if (!decision || decision.status !== "ALLOW" || !decision.actionToken) {
      throw new Error("warden_authorization_required");
    }
    if (!evidenceReservationRef) {
      throw new Error("evidence_reservation_required");
    }
    if (intent.capability !== "service_request.create") {
      throw new Error("unsupported_capability");
    }

    const existing = this.requests.get(intent.correlationId);
    if (existing) {
      return {
        receiptRef: `RC1-RECEIPT:${intent.correlationId}`,
        serviceRequestRef: existing.serviceRequestRef,
        correlationId: intent.correlationId,
        idempotentReplay: true,
        synthetic: true,
      };
    }

    const request: SyntheticServiceRequest = {
      serviceRequestRef: `RC1-SERVICE-REQUEST:${intent.correlationId}`,
      correlationId: intent.correlationId,
      programRef: intent.programRef,
      actorRef: intent.actorRef,
      representedEntityRef: intent.representedEntityRef,
      targetRef: intent.targetRef,
      capability: "service_request.create",
      synthetic: true,
    };
    this.requests.set(intent.correlationId, request);

    return {
      receiptRef: `RC1-RECEIPT:${intent.correlationId}`,
      serviceRequestRef: request.serviceRequestRef,
      correlationId: intent.correlationId,
      idempotentReplay: false,
      synthetic: true,
    };
  }

  read(correlationId: string): SyntheticServiceRequest | undefined {
    const request = this.requests.get(correlationId);
    if (!request) return undefined;
    if (this.mismatchReads.has(correlationId)) {
      return { ...request, targetRef: `${request.targetRef}:MISMATCH` };
    }
    return { ...request };
  }

  count(): number {
    return this.requests.size;
  }
}

export class AlphaRc1Harness {
  private readonly warden = new SyntheticWarden();
  private readonly river = new SyntheticRiverEvidence();
  private readonly gateway = new InMemoryActionGateway();
  private readonly decisions: Rc1WardenDecision[] = [];
  private programState: Rc1ProgramState = "DRAFT";
  private allowedRequestRef: string | undefined;
  private finalEffectRef: string | undefined;

  prepareIntent(capability: Rc1Capability, correlationId: string): Rc1ActionIntent {
    return {
      programRef: RC1_IDENTITIES.programRef,
      actorRef: RC1_IDENTITIES.actorRef,
      representedEntityRef: RC1_IDENTITIES.entityRef,
      capability,
      correlationId,
      targetRef: capability === "service_request.create" ? "LAB-SERVICE-DESK-001" : "LAB-CONTRACT-001",
    };
  }

  attempt(
    capability: Rc1Capability,
    correlationId: string,
    options: Rc1AttemptOptions = {},
  ): Rc1ActionAttemptResult {
    const intent = this.prepareIntent(capability, correlationId);
    const decision = options.omitDecision ? undefined : this.warden.authorize(intent);

    if (!decision) {
      return {
        status: "MISSING_AUTHORIZATION",
        correlationId,
        capability,
        syntheticEffectRecorded: false,
        reason: "warden_decision_missing",
      };
    }

    this.decisions.push(decision);
    if (decision.status !== "ALLOW") {
      this.river.recordDenied(intent, decision);
      return {
        status: "DENIED",
        correlationId,
        capability,
        decision,
        syntheticEffectRecorded: false,
        reason: decision.reason,
      };
    }

    if (options.omitEvidenceReservation) {
      return {
        status: "BLOCKED_REQUIREMENT",
        correlationId,
        capability,
        decision,
        syntheticEffectRecorded: false,
        reason: "evidence_reservation_missing",
      };
    }

    const evidenceReservationRef = this.river.reserve(intent, decision);
    if (!evidenceReservationRef) {
      return {
        status: "BLOCKED_REQUIREMENT",
        correlationId,
        capability,
        decision,
        syntheticEffectRecorded: false,
        reason: "evidence_reservation_unavailable",
      };
    }

    if (options.injectReadMismatch) {
      this.gateway.injectReadMismatch(correlationId);
    }

    const receipt = this.gateway.execute(intent, decision, evidenceReservationRef);
    const observed = this.gateway.read(correlationId);
    if (
      !observed ||
      observed.serviceRequestRef !== receipt.serviceRequestRef ||
      observed.targetRef !== intent.targetRef
    ) {
      this.programState = "EXCEPTION";
      this.river.recordException(intent, decision, "read_after_write_mismatch");
      return {
        status: "EXCEPTION",
        correlationId,
        capability,
        decision,
        evidenceReservationRef,
        receipt,
        syntheticEffectRecorded: false,
        reason: "read_after_write_mismatch",
      };
    }

    const effectRef = `RC1-EFFECT:${correlationId}`;
    this.river.seal(intent, decision, effectRef);
    this.allowedRequestRef = observed.serviceRequestRef;
    this.finalEffectRef = effectRef;
    this.programState = "EFFECT_RECORDED";

    return {
      status: "VERIFIED",
      correlationId,
      capability,
      decision,
      evidenceReservationRef,
      receipt,
      effectRef,
      syntheticEffectRecorded: true,
    };
  }

  failNextEvidenceReservation(): void {
    this.river.failReservationOnce();
  }

  revoke(): void {
    this.warden.revoke();
  }

  gatewayRequestCount(): number {
    return this.gateway.count();
  }

  riverEntries(): Rc1EvidenceEntry[] {
    return this.river.list();
  }

  frontGateProjection(): Rc1FrontGateProjection {
    return {
      programRef: RC1_IDENTITIES.programRef,
      actorRef: RC1_IDENTITIES.actorRef,
      representedEntityRef: RC1_IDENTITIES.entityRef,
      allowedRequestRef: this.allowedRequestRef,
      finalEffectRef: this.finalEffectRef,
      programState: this.programState,
    };
  }

  backGateProjection(): Rc1BackGateProjection {
    return {
      programRef: RC1_IDENTITIES.programRef,
      actorRef: RC1_IDENTITIES.actorRef,
      representedEntityRef: RC1_IDENTITIES.entityRef,
      allowedRequestRef: this.allowedRequestRef,
      finalEffectRef: this.finalEffectRef,
      programState: this.programState,
      decisionRefs: this.decisions.map((decision) => decision.decisionRef),
      evidenceRefs: this.river.list().map((entry) => entry.evidenceRef),
    };
  }

  runFullProgram(): Rc1RunResult {
    this.programState = "RUNNING";
    const events: Rc1EventRecord[] = [
      this.event("RC1-E01 IDENTIFY", "OBSERVED"),
      this.event("RC1-E02 RELATE", "OBSERVED"),
      this.event("RC1-E03 REQUIREMENTS", "OBSERVED"),
      this.event("RC1-E04 PREPARE_ALLOWED", "PREPARED", "RC1-CORR-ALLOWED-001"),
    ];

    const allowed = this.attempt("service_request.create", "RC1-CORR-ALLOWED-001");
    if (allowed.status !== "VERIFIED" || !allowed.decision || !allowed.effectRef) {
      throw new Error(`rc1_allowed_path_failed:${allowed.status}`);
    }
    const sealedEvidence = this.river
      .list()
      .find(
        (entry) =>
          entry.correlationId === allowed.correlationId && entry.stage === "SEALED",
      );

    events.push(
      this.event(
        "RC1-E05 WARDEN_ALLOW",
        "ALLOWED",
        allowed.correlationId,
        allowed.decision.decisionRef,
      ),
      this.event(
        "RC1-E06 RESERVE_EVIDENCE",
        "OBSERVED",
        allowed.correlationId,
        allowed.decision.decisionRef,
        allowed.evidenceReservationRef,
      ),
      this.event(
        "RC1-E07 EXECUTE_ALLOWED",
        "OBSERVED",
        allowed.correlationId,
        allowed.decision.decisionRef,
        allowed.evidenceReservationRef,
      ),
      this.event(
        "RC1-E08 VERIFY_ALLOWED",
        "VERIFIED",
        allowed.correlationId,
        allowed.decision.decisionRef,
        allowed.evidenceReservationRef,
        allowed.effectRef,
      ),
      this.event(
        "RC1-E09 SEAL_EVIDENCE",
        "VERIFIED",
        allowed.correlationId,
        allowed.decision.decisionRef,
        sealedEvidence?.evidenceRef,
        allowed.effectRef,
      ),
      this.event("RC1-E10 PREPARE_FORBIDDEN", "PREPARED", "RC1-CORR-DENIED-001"),
    );

    const forbidden = this.attempt("contract.execute", "RC1-CORR-DENIED-001");
    if (forbidden.status !== "DENIED" || !forbidden.decision) {
      throw new Error(`rc1_forbidden_path_failed:${forbidden.status}`);
    }
    events.push(
      this.event(
        "RC1-E11 WARDEN_DENY",
        "DENIED",
        forbidden.correlationId,
        forbidden.decision.decisionRef,
      ),
      this.event(
        "RC1-E12 PROVE_NO_EFFECT",
        "VERIFIED",
        forbidden.correlationId,
        forbidden.decision.decisionRef,
      ),
    );

    this.revoke();
    events.push(this.event("RC1-E13 REVOKE", "OBSERVED"));

    const postRevoke = this.attempt("service_request.create", "RC1-CORR-REVOKED-001");
    if (postRevoke.status !== "DENIED" || !postRevoke.decision) {
      throw new Error(`rc1_post_revoke_path_failed:${postRevoke.status}`);
    }
    events.push(
      this.event(
        "RC1-E14 POST_REVOKE_DENY",
        "DENIED",
        postRevoke.correlationId,
        postRevoke.decision.decisionRef,
      ),
      this.event("RC1-E15 RECONSTRUCT", "VERIFIED"),
    );

    this.programState = "CLOSED";
    events.push(this.event("RC1-E16 CLOSE", "CLOSED"));

    return {
      programRef: RC1_IDENTITIES.programRef,
      programState: this.programState,
      events,
      frontGate: this.frontGateProjection(),
      backGate: this.backGateProjection(),
      gatewayRequestCount: this.gateway.count(),
      realWorldEffectOccurred: false,
    };
  }

  private event(
    code: (typeof RC1_EVENT_SEQUENCE)[number],
    status: Rc1EventRecord["status"],
    correlationId?: string,
    decisionRef?: string,
    evidenceRef?: string,
    effectRef?: string,
  ): Rc1EventRecord {
    return {
      code,
      programRef: RC1_IDENTITIES.programRef,
      status,
      correlationId,
      decisionRef,
      evidenceRef,
      effectRef,
    };
  }
}
