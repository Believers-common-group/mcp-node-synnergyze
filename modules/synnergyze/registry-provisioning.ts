import type { WardenDecisionV1 } from "../warden/contracts.ts";

export type RegistryCommandTypeV1 =
  | "PROGRAM_PROVISION"
  | "SCHEDULE_PROPOSE"
  | "SCHEDULE_BASELINE_APPROVE"
  | "SCHEDULE_AMEND"
  | "GATE_CHECK"
  | "GATE_DECLARE"
  | "GATE_HOLD"
  | "EXCEPTION_REQUEST"
  | "EXCEPTION_APPROVE"
  | "EXCEPTION_DENY"
  | "PACKAGE_INSTALL_REQUEST"
  | "PACKAGE_ENABLE_REQUEST"
  | "PACKAGE_SUSPEND_REQUEST"
  | "PACKAGE_REVOKE_REQUEST";

export interface RegistryCommandEnvelopeV1 {
  commandRef: string;
  commandType: RegistryCommandTypeV1;
  subjectRef: string;
  actorRef: string;
  actingCapacityRef: string;
  representedPrincipalRef?: string;
  evidenceRefs: readonly string[];
  correlationId: string;
  idempotencyKey: string;
  requestedEffectiveAt?: string;
}

export interface GateDeclareRequestV1 {
  envelope: RegistryCommandEnvelopeV1 & { commandType: "GATE_DECLARE" };
  gateEventRef: string;
  evidenceSetRef: string;
}

export type SentinelTemporalConditionTypeV1 =
  | "TIME_REACHED"
  | "WINDOW_OPEN"
  | "WINDOW_CLOSED"
  | "DEADLINE_DUE"
  | "DEADLINE_MISSED"
  | "RECURRENCE_DUE"
  | "DEPENDENCY_TIME_SATISFIED";

export interface SentinelTemporalConditionV1 {
  conditionRef: string;
  conditionType: SentinelTemporalConditionTypeV1;
  subjectRef: string;
  observedAt: string;
  source: "SENTINEL_CLOCK";
}

export type RegistryGateProposalDispositionV1 =
  | "REQUIRE_AUTHORITY"
  | "REQUIRE_EVIDENCE"
  | "DENIED"
  | "READY_TO_PROPOSE";

export interface RegistryGateTransitionProposalV1 {
  subjectType: "GATE_EVENT";
  subjectRef: string;
  fromState: "DUE" | "READY" | "HELD" | "PLANNED";
  toState: "EFFECTIVE";
  transitionType: "AUTHORITY_DECLARED_GATE";
  actorRef: string;
  actingCapacityRef: string;
  wardenDecisionRef: string;
  evidenceSetRef: string;
  correlationId: string;
  causationRef: string;
  requiresExecutionCheckpoint: true;
}

export interface RiverGateOutboxProposalV1 {
  eventType: "registry.gate.transition.proposed";
  aggregateType: "GATE_EVENT";
  aggregateRef: string;
  correlationId: string;
  causationRef: string;
  wardenDecisionRef: string;
  evidenceSetRef: string;
  requiresExecutionCheckpoint: true;
  payload: {
    commandType: "GATE_DECLARE";
    proposedState: "EFFECTIVE";
    temporalCondition?: {
      conditionType: SentinelTemporalConditionTypeV1;
      observedAt: string;
      source: "SENTINEL_CLOCK";
    };
  };
}

export interface RegistryGateProposalResultV1 {
  disposition: RegistryGateProposalDispositionV1;
  reason: string;
  transitionProposal?: RegistryGateTransitionProposalV1;
  outboxProposal?: RiverGateOutboxProposalV1;
}

export interface RegistryGateProposalInputV1 {
  request: GateDeclareRequestV1;
  decision?: WardenDecisionV1;
  temporalCondition?: SentinelTemporalConditionV1;
  evidenceSatisfied: boolean;
  evaluatedAt: string;
  currentState?: "DUE" | "READY" | "HELD" | "PLANNED";
}

function parseInstant(value: string, errorCode: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(errorCode);
  return parsed;
}

function evaluateAuthority(
  request: GateDeclareRequestV1,
  decision: WardenDecisionV1 | undefined,
  evaluatedAt: string,
): RegistryGateProposalResultV1 | undefined {
  if (!decision) {
    return { disposition: "REQUIRE_AUTHORITY", reason: "WARDEN_DECISION_REQUIRED" };
  }

  if (decision.decision === "DENY") {
    return { disposition: "DENIED", reason: "WARDEN_DENIED" };
  }

  if (decision.decision === "ESCALATE") {
    return { disposition: "REQUIRE_AUTHORITY", reason: "WARDEN_ESCALATION_REQUIRED" };
  }

  if (decision.requestRef !== request.envelope.commandRef) {
    return { disposition: "DENIED", reason: "WARDEN_REQUEST_MISMATCH" };
  }
  if (decision.action !== "registry.gate.declare") {
    return { disposition: "DENIED", reason: "WARDEN_ACTION_MISMATCH" };
  }
  if (decision.targetRef !== request.gateEventRef) {
    return { disposition: "DENIED", reason: "WARDEN_TARGET_MISMATCH" };
  }
  if (decision.correlationId !== request.envelope.correlationId) {
    return { disposition: "DENIED", reason: "WARDEN_CORRELATION_MISMATCH" };
  }
  if (!decision.validUntil) {
    return { disposition: "REQUIRE_AUTHORITY", reason: "WARDEN_VALIDITY_REQUIRED" };
  }

  const decidedAt = parseInstant(decision.decidedAt, "registry_gate_invalid_decision_time");
  const validUntil = parseInstant(decision.validUntil, "registry_gate_invalid_decision_validity");
  const evaluated = parseInstant(evaluatedAt, "registry_gate_invalid_evaluation_time");
  if (validUntil < decidedAt) {
    return { disposition: "DENIED", reason: "WARDEN_INVALID_VALIDITY_WINDOW" };
  }
  if (evaluated < decidedAt) {
    return { disposition: "DENIED", reason: "WARDEN_DECISION_FROM_FUTURE" };
  }
  if (evaluated > validUntil) {
    return { disposition: "REQUIRE_AUTHORITY", reason: "WARDEN_DECISION_EXPIRED" };
  }

  return undefined;
}

/**
 * Evaluates whether Synnergyze may emit proposals for a governed Registry Gate transition.
 *
 * This function does not mutate Registry state, publish a River event, or execute the
 * transition. Sentinel time is context only. A Warden ALLOW decision is necessary but not
 * sufficient: mandatory evidence must also be satisfied, and the eventual execution boundary
 * must perform a fresh Warden execution checkpoint before any authoritative effect.
 */
export function evaluateRegistryGateProposalV1(
  input: RegistryGateProposalInputV1,
): RegistryGateProposalResultV1 {
  const { request, decision, temporalCondition, evidenceSatisfied, evaluatedAt } = input;

  if (request.envelope.subjectRef !== request.gateEventRef) {
    return { disposition: "DENIED", reason: "REGISTRY_SUBJECT_MISMATCH" };
  }

  if (temporalCondition && temporalCondition.subjectRef !== request.gateEventRef) {
    return { disposition: "DENIED", reason: "TEMPORAL_FACT_SUBJECT_MISMATCH" };
  }

  const authorityResult = evaluateAuthority(request, decision, evaluatedAt);
  if (authorityResult) {
    if (!decision && temporalCondition) {
      return {
        disposition: "REQUIRE_AUTHORITY",
        reason: "SENTINEL_FACT_PRESENT_BUT_WARDEN_DECISION_REQUIRED",
      };
    }
    return authorityResult;
  }

  if (!evidenceSatisfied) {
    return {
      disposition: "REQUIRE_EVIDENCE",
      reason: "MANDATORY_GATE_EVIDENCE_NOT_SATISFIED",
    };
  }

  const allowedDecision = decision;
  if (!allowedDecision || allowedDecision.decision !== "ALLOW") {
    throw new Error("registry_gate_internal_authority_narrowing_failed");
  }

  const transitionProposal: RegistryGateTransitionProposalV1 = {
    subjectType: "GATE_EVENT",
    subjectRef: request.gateEventRef,
    fromState: input.currentState ?? "DUE",
    toState: "EFFECTIVE",
    transitionType: "AUTHORITY_DECLARED_GATE",
    actorRef: request.envelope.actorRef,
    actingCapacityRef: request.envelope.actingCapacityRef,
    wardenDecisionRef: allowedDecision.decisionRef,
    evidenceSetRef: request.evidenceSetRef,
    correlationId: request.envelope.correlationId,
    causationRef: request.envelope.commandRef,
    requiresExecutionCheckpoint: true,
  };

  const outboxProposal: RiverGateOutboxProposalV1 = {
    eventType: "registry.gate.transition.proposed",
    aggregateType: "GATE_EVENT",
    aggregateRef: request.gateEventRef,
    correlationId: request.envelope.correlationId,
    causationRef: request.envelope.commandRef,
    wardenDecisionRef: allowedDecision.decisionRef,
    evidenceSetRef: request.evidenceSetRef,
    requiresExecutionCheckpoint: true,
    payload: {
      commandType: "GATE_DECLARE",
      proposedState: "EFFECTIVE",
      ...(temporalCondition
        ? {
            temporalCondition: {
              conditionType: temporalCondition.conditionType,
              observedAt: temporalCondition.observedAt,
              source: temporalCondition.source,
            },
          }
        : {}),
    },
  };

  return {
    disposition: "READY_TO_PROPOSE",
    reason: "WARDEN_ALLOWED_AND_EVIDENCE_SATISFIED",
    transitionProposal,
    outboxProposal,
  };
}
