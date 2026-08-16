import { describe, expect, it } from "vitest";

import type { WardenDecisionV1 } from "../warden/contracts.ts";
import {
  evaluateRegistryGateProposalV1,
  type GateDeclareRequestV1,
  type SentinelTemporalConditionV1,
} from "./registry-provisioning.ts";

const request: GateDeclareRequestV1 = {
  envelope: {
    commandRef: "REGISTRY-COMMAND:CLDR-V49-DATA-SLUSH",
    commandType: "GATE_DECLARE",
    subjectRef: "CLDR-V49-2026-DATA_SLUSH",
    actorRef: "DM-TEST-001",
    actingCapacityRef: "RELEASE_MANAGER",
    evidenceRefs: ["EVIDENCE-SET-CLDR-V49-DATA-SLUSH"],
    correlationId: "CORRELATION:CLDR-V49-DATA-SLUSH",
    idempotencyKey: "cldr-v49-data-slush-declare",
  },
  gateEventRef: "CLDR-V49-2026-DATA_SLUSH",
  evidenceSetRef: "EVIDENCE-SET-CLDR-V49-DATA-SLUSH",
};

const temporal: SentinelTemporalConditionV1 = {
  conditionRef: "SENTINEL-CONDITION:CLDR-V49-DATA-SLUSH",
  conditionType: "DEADLINE_DUE",
  subjectRef: "CLDR-V49-2026-DATA_SLUSH",
  observedAt: "2026-08-16T03:30:00Z",
  source: "SENTINEL_CLOCK",
};

const allowDecision: WardenDecisionV1 = {
  decisionRef: "WARDEN-DECISION:CLDR-V49-DATA-SLUSH",
  requestRef: request.envelope.commandRef,
  wardenRef: "WARDEN-RUNTIME-001",
  decision: "ALLOW",
  action: "registry.gate.declare",
  targetRef: request.gateEventRef,
  reasonCodes: ["AUTHORITY_VERIFIED"],
  constraints: ["EXECUTION_CHECKPOINT_REQUIRED"],
  decidedAt: "2026-08-16T03:31:00Z",
  validUntil: "2026-08-16T03:41:00Z",
  correlationId: request.envelope.correlationId,
  actionToken: "test-action-token-not-for-production",
};

const evaluatedAt = "2026-08-16T03:32:00Z";

describe("Synnergyze Registry provisioning proposal boundary", () => {
  it("does not turn a Sentinel temporal fact into Warden authority", () => {
    const result = evaluateRegistryGateProposalV1({
      request,
      temporalCondition: temporal,
      evidenceSatisfied: true,
      evaluatedAt,
    });

    expect(result).toEqual({
      disposition: "REQUIRE_AUTHORITY",
      reason: "SENTINEL_FACT_PRESENT_BUT_WARDEN_DECISION_REQUIRED",
    });
  });

  it("preserves a Warden denial even when evidence and time conditions are satisfied", () => {
    const decision: WardenDecisionV1 = {
      ...allowDecision,
      decision: "DENY",
      reasonCodes: ["REQUIREMENTS_NOT_MET"],
      actionToken: undefined as never,
    };

    const result = evaluateRegistryGateProposalV1({
      request,
      decision,
      temporalCondition: temporal,
      evidenceSatisfied: true,
      evaluatedAt,
    });

    expect(result).toEqual({ disposition: "DENIED", reason: "WARDEN_DENIED" });
  });

  it("requires renewed authority when Warden escalates", () => {
    const decision: WardenDecisionV1 = {
      ...allowDecision,
      decision: "ESCALATE",
      reasonCodes: ["SEPARATE_AUTHORITY_REQUIRED"],
      actionToken: undefined as never,
    };

    const result = evaluateRegistryGateProposalV1({
      request,
      decision,
      temporalCondition: temporal,
      evidenceSatisfied: true,
      evaluatedAt,
    });

    expect(result).toEqual({
      disposition: "REQUIRE_AUTHORITY",
      reason: "WARDEN_ESCALATION_REQUIRED",
    });
  });

  it("does not produce proposals when mandatory evidence is missing", () => {
    const result = evaluateRegistryGateProposalV1({
      request,
      decision: allowDecision,
      temporalCondition: temporal,
      evidenceSatisfied: false,
      evaluatedAt,
    });

    expect(result.disposition).toBe("REQUIRE_EVIDENCE");
    expect(result.transitionProposal).toBeUndefined();
    expect(result.outboxProposal).toBeUndefined();
  });

  it("rejects a Warden decision bound to the wrong target", () => {
    const result = evaluateRegistryGateProposalV1({
      request,
      decision: { ...allowDecision, targetRef: "OTHER-GATE" },
      temporalCondition: temporal,
      evidenceSatisfied: true,
      evaluatedAt,
    });

    expect(result).toEqual({ disposition: "DENIED", reason: "WARDEN_TARGET_MISMATCH" });
  });

  it("requires renewed authority after the Warden decision expires", () => {
    const result = evaluateRegistryGateProposalV1({
      request,
      decision: allowDecision,
      temporalCondition: temporal,
      evidenceSatisfied: true,
      evaluatedAt: "2026-08-16T03:42:00Z",
    });

    expect(result).toEqual({
      disposition: "REQUIRE_AUTHORITY",
      reason: "WARDEN_DECISION_EXPIRED",
    });
  });

  it("returns non-authoritative transition and River outbox proposals only after authority and evidence", () => {
    const result = evaluateRegistryGateProposalV1({
      request,
      decision: allowDecision,
      temporalCondition: temporal,
      evidenceSatisfied: true,
      evaluatedAt,
      currentState: "DUE",
    });

    expect(result.disposition).toBe("READY_TO_PROPOSE");
    expect(result.transitionProposal).toMatchObject({
      subjectRef: request.gateEventRef,
      fromState: "DUE",
      toState: "EFFECTIVE",
      wardenDecisionRef: allowDecision.decisionRef,
      evidenceSetRef: request.evidenceSetRef,
      requiresExecutionCheckpoint: true,
    });
    expect(result.outboxProposal).toMatchObject({
      eventType: "registry.gate.transition.proposed",
      aggregateRef: request.gateEventRef,
      wardenDecisionRef: allowDecision.decisionRef,
      requiresExecutionCheckpoint: true,
      payload: {
        commandType: "GATE_DECLARE",
        proposedState: "EFFECTIVE",
        temporalCondition: {
          conditionType: "DEADLINE_DUE",
          source: "SENTINEL_CLOCK",
        },
      },
    });
  });
});
