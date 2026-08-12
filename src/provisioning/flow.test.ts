import { describe, expect, it } from "vitest";
import type { GateDeclareRequest, RegistryDecision, TemporalCondition } from "./contracts.ts";
import { evaluateGovernedGateCommand } from "./flow.ts";

const request: GateDeclareRequest = {
  envelope: {
    commandId: "11111111-1111-4111-8111-111111111111",
    commandType: "GATE_DECLARE",
    subjectRef: "CLDR-V49-2026",
    actor: {
      digitalmeId: "DM-TEST-001",
      actingCapacity: "RELEASE_MANAGER",
    },
    evidenceRefs: ["EVIDENCE-SET-CLDR-V49-DATA-SLUSH"],
    correlationId: "22222222-2222-4222-8222-222222222222",
    idempotencyKey: "cldr-v49-data-slush-declare",
  },
  gateEventRef: "CLDR-V49-2026-DATA_SLUSH",
  evidenceSetRef: "EVIDENCE-SET-CLDR-V49-DATA-SLUSH",
};

const temporal: TemporalCondition = {
  conditionId: "33333333-3333-4333-8333-333333333333",
  conditionType: "DEADLINE_DUE",
  subjectRef: "CLDR-V49-2026-DATA_SLUSH",
  observedAt: "2026-08-12T18:51:00Z",
  source: "SENTINEL_CLOCK",
};

const allowDecision: RegistryDecision = {
  decisionId: "44444444-4444-4444-8444-444444444444",
  disposition: "ALLOW",
  policyVersion: "CLDR-GP-DATA-SLUSH@1",
  conditions: [],
  reasonCodes: ["AUTHORITY_AND_REQUIREMENTS_VERIFIED"],
};

describe("governed provisioning flow", () => {
  it("does not turn a passed Sentinel clock fact into Registry authority", () => {
    const result = evaluateGovernedGateCommand({
      request,
      temporalCondition: temporal,
      evidenceSatisfied: true,
      currentState: "DUE",
    });

    expect(result).toEqual({
      disposition: "REQUIRE_AUTHORITY",
      reason: "SENTINEL_FACT_PRESENT_BUT_WARDEN_DECISION_REQUIRED",
    });
  });

  it("does not commit an allowed decision without mandatory evidence", () => {
    const result = evaluateGovernedGateCommand({
      request,
      decision: allowDecision,
      temporalCondition: temporal,
      evidenceSatisfied: false,
      currentState: "DUE",
    });

    expect(result.disposition).toBe("REQUIRE_EVIDENCE");
    expect(result.transition).toBeUndefined();
    expect(result.outbox).toBeUndefined();
  });

  it("returns transition and River outbox proposals only after authority and evidence", () => {
    const result = evaluateGovernedGateCommand({
      request,
      decision: allowDecision,
      temporalCondition: temporal,
      evidenceSatisfied: true,
      currentState: "DUE",
    });

    expect(result.disposition).toBe("READY_TO_COMMIT");
    expect(result.transition).toMatchObject({
      subjectRef: "CLDR-V49-2026-DATA_SLUSH",
      fromState: "DUE",
      toState: "EFFECTIVE",
      authorityDecisionRef: allowDecision.decisionId,
      evidenceSetRef: request.evidenceSetRef,
    });
    expect(result.outbox).toMatchObject({
      eventType: "registry.gate.transition.proposed",
      aggregateRef: "CLDR-V49-2026-DATA_SLUSH",
      authorityDecisionRef: allowDecision.decisionId,
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

  it("preserves a Warden denial even when the planned time has passed", () => {
    const result = evaluateGovernedGateCommand({
      request,
      temporalCondition: temporal,
      evidenceSatisfied: true,
      decision: { ...allowDecision, disposition: "DENY", reasonCodes: ["REQUIREMENTS_NOT_MET"] },
      currentState: "DUE",
    });

    expect(result).toEqual({ disposition: "DENIED", reason: "WARDEN_DENIED" });
  });
});
