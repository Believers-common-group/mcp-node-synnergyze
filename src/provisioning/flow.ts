import type {
  GateDeclareRequest,
  RegistryDecision,
  TemporalCondition,
} from "./contracts.ts";

export type GateFlowDisposition =
  | "REQUIRE_AUTHORITY"
  | "REQUIRE_EVIDENCE"
  | "DENIED"
  | "CONDITIONAL"
  | "READY_TO_COMMIT";

export type RegistryTransitionProposal = {
  subjectType: "GATE_EVENT";
  subjectRef: string;
  fromState: "DUE" | "READY" | "HELD" | "PLANNED";
  toState: "EFFECTIVE";
  transitionType: "AUTHORITY_DECLARED_GATE";
  actorRef: string;
  authorityDecisionRef: string;
  evidenceSetRef: string;
  correlationId: string;
  causationId: string;
};

export type RiverOutboxProposal = {
  eventType: "registry.gate.transition.proposed";
  aggregateType: "GATE_EVENT";
  aggregateRef: string;
  correlationId: string;
  causationId: string;
  authorityDecisionRef: string;
  evidenceSetRef: string;
  payload: {
    commandType: "GATE_DECLARE";
    proposedState: "EFFECTIVE";
    temporalCondition?: {
      conditionType: TemporalCondition["conditionType"];
      observedAt: string;
      source: "SENTINEL_CLOCK";
    };
  };
};

export type GateFlowResult = {
  disposition: GateFlowDisposition;
  reason: string;
  transition?: RegistryTransitionProposal;
  outbox?: RiverOutboxProposal;
};

export type GateFlowInput = {
  request: GateDeclareRequest;
  decision?: RegistryDecision;
  temporalCondition?: TemporalCondition;
  evidenceSatisfied: boolean;
  currentState?: "DUE" | "READY" | "HELD" | "PLANNED";
};

/**
 * Evaluates whether Synnergyze may propose a governed Gate transition.
 *
 * This function deliberately does not mutate Registry state and does not publish
 * to RiverOS. It returns commit/outbox proposals only after Warden authority and
 * evidence are both present. Sentinel Clock facts are context, never authority.
 */
export function evaluateGovernedGateCommand(input: GateFlowInput): GateFlowResult {
  const { request, decision, temporalCondition, evidenceSatisfied } = input;

  if (temporalCondition && temporalCondition.subjectRef !== request.gateEventRef) {
    return {
      disposition: "REQUIRE_AUTHORITY",
      reason: "TEMPORAL_FACT_SUBJECT_MISMATCH",
    };
  }

  if (!decision) {
    return {
      disposition: "REQUIRE_AUTHORITY",
      reason: temporalCondition
        ? "SENTINEL_FACT_PRESENT_BUT_WARDEN_DECISION_REQUIRED"
        : "WARDEN_DECISION_REQUIRED",
    };
  }

  if (decision.disposition === "DENY") {
    return { disposition: "DENIED", reason: "WARDEN_DENIED" };
  }

  if (decision.disposition === "CONDITIONAL") {
    return { disposition: "CONDITIONAL", reason: "WARDEN_CONDITIONS_UNRESOLVED" };
  }

  if (decision.disposition !== "ALLOW") {
    return {
      disposition:
        decision.disposition === "REQUIRE_EVIDENCE" ? "REQUIRE_EVIDENCE" : "REQUIRE_AUTHORITY",
      reason: `WARDEN_${decision.disposition}`,
    };
  }

  if (!evidenceSatisfied) {
    return {
      disposition: "REQUIRE_EVIDENCE",
      reason: "MANDATORY_GATE_EVIDENCE_NOT_SATISFIED",
    };
  }

  const transition: RegistryTransitionProposal = {
    subjectType: "GATE_EVENT",
    subjectRef: request.gateEventRef,
    fromState: input.currentState ?? "DUE",
    toState: "EFFECTIVE",
    transitionType: "AUTHORITY_DECLARED_GATE",
    actorRef: request.envelope.actor.digitalmeId,
    authorityDecisionRef: decision.decisionId,
    evidenceSetRef: request.evidenceSetRef,
    correlationId: request.envelope.correlationId,
    causationId: request.envelope.commandId,
  };

  const outbox: RiverOutboxProposal = {
    eventType: "registry.gate.transition.proposed",
    aggregateType: "GATE_EVENT",
    aggregateRef: request.gateEventRef,
    correlationId: request.envelope.correlationId,
    causationId: request.envelope.commandId,
    authorityDecisionRef: decision.decisionId,
    evidenceSetRef: request.evidenceSetRef,
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
    disposition: "READY_TO_COMMIT",
    reason: "WARDEN_ALLOWED_AND_EVIDENCE_SATISFIED",
    transition,
    outbox,
  };
}
