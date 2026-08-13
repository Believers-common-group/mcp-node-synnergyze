import { describe, expect, it } from "vitest";

import {
  PROGRAM_EVENT_CONTRACT_VERSION,
  type EventContractV1,
  type ProgramContractV1,
  type ProgramExecutionGateway,
  type RegistryResolutionBundle,
} from "./program-event-contract.js";
import { runProgramEvent } from "./program-runner.js";

function program(): ProgramContractV1 {
  return {
    contractVersion: PROGRAM_EVENT_CONTRACT_VERSION,
    programRef: "program:test:1",
    programType: "SANDBOX",
    version: 1,
    sourceRef: "source:test:1",
    ownerContextRef: "workspace:test:1",
    missionPurpose: "Prove governed Program/Event execution",
    targetOutcomeRefs: ["outcome:test:verified"],
    contextRefs: ["realm:alpha", "box:test:1"],
    participantRoleRefs: ["role:test:operator"],
    dependencyRefs: [],
    constraintRefs: [],
    authorityRefs: ["authority:test:program"],
    requirementRefs: ["requirement:test:evidence"],
    economicRuleRefs: ["economic:test:rule"],
    settlementContextRefs: ["settlement:test:1"],
    state: "DRAFT",
  };
}

function event(): EventContractV1 {
  return {
    eventDefinitionRef: "event:test:1",
    programRef: "program:test:1",
    sequence: 1,
    actorRef: "digitalme:test:actor",
    actingCapacityRef: "role:test:operator",
    placeRef: "place:test:alpha",
    thingRef: "thing:test:1",
    requestedCapability: "APPLY",
    dependencyRefs: [],
    constraintRefs: [],
    authorityRefs: ["authority:test:event"],
    requirementRefs: ["requirement:test:evidence"],
    economicRuleRefs: ["economic:test:rule"],
  };
}

function resolved(): RegistryResolutionBundle {
  return {
    requestRef: "registry-request:test:1",
    r1: "RESOLVED",
    r2: "RESOLVED",
    r3: "REQUIRES_AUTHORIZATION",
    r4: "RESOLVED",
    r5: "RESOLVED",
    candidateAction: "ROUTE_TO_TEST_CAPABILITY",
    unmetRequirementRefs: [],
    authorityRefs: ["authority:test:registry"],
    evidenceRequirementRefs: ["requirement:test:evidence"],
    expectedEffectRefs: ["effect:test:expected"],
    economicContextRefs: ["economic:test:context"],
  };
}

interface GatewayBehavior {
  resolution?: RegistryResolutionBundle;
  wardenOutcome?: "AUTHORIZED" | "DENIED" | "REVIEW_REQUIRED";
  riverAvailable?: boolean;
  confirmationMatched?: boolean;
  executionThrows?: boolean;
  settlementState?: "NOT_REQUIRED" | "PENDING" | "RECONCILED";
}

function testGateway(behavior: GatewayBehavior = {}) {
  const calls: string[] = [];
  const gateway: ProgramExecutionGateway = {
    async resolveR1ToR5() {
      calls.push("resolve");
      return behavior.resolution ?? resolved();
    },
    async authorize(action) {
      calls.push(`authorize:${action.candidateAction}`);
      return {
        decisionRef: "warden:test:1",
        outcome: behavior.wardenOutcome ?? "AUTHORIZED",
        reason: behavior.wardenOutcome === "DENIED" ? "policy_denied" : undefined,
      };
    },
    async reserveEvidence() {
      calls.push("reserve");
      return behavior.riverAvailable === false
        ? { reservationRef: "river-reservation:test:1", status: "UNAVAILABLE", reason: "river_down" }
        : { reservationRef: "river-reservation:test:1", status: "RESERVED" };
    },
    async executeCapability() {
      calls.push("execute");
      if (behavior.executionThrows) throw new Error("connector_timeout");
      return { receiptRef: "provider-receipt:test:1" };
    },
    async confirmResult() {
      calls.push("confirm");
      return {
        confirmationRef: "confirmation:test:1",
        matched: behavior.confirmationMatched ?? true,
        reason: behavior.confirmationMatched === false ? "state_mismatch" : undefined,
      };
    },
    async sealEvidence() {
      calls.push("seal");
      return { evidenceRef: "river-evidence:test:1" };
    },
    async recordEffect() {
      calls.push("effect");
      return { effectRef: "effect:test:1" };
    },
    async recordEconomicConsequence() {
      calls.push("economic");
      return {
        consequenceRef: "economic-consequence:test:1",
        settlementState: behavior.settlementState ?? "RECONCILED",
      };
    },
  };

  return { gateway, calls };
}

const input = () => ({
  program: program(),
  event: event(),
  correlationId: "corr:test:1",
  idempotencyKey: "idem:test:1",
});

describe("Synnergyze Program/Event runtime v1", () => {
  it("executes the governed happy path in canonical order", async () => {
    const { gateway, calls } = testGateway();
    const output = await runProgramEvent(input(), gateway);

    expect(output.state).toBe("SETTLED_RECONCILED");
    expect(output.eventState).toBe("SETTLED_RECONCILED");
    expect(output.wardenDecisionRef).toBe("warden:test:1");
    expect(output.evidenceRef).toBe("river-evidence:test:1");
    expect(output.effectRef).toBe("effect:test:1");
    expect(output.economicConsequenceRef).toBe("economic-consequence:test:1");
    expect(calls).toEqual([
      "resolve",
      "authorize:ROUTE_TO_TEST_CAPABILITY",
      "reserve",
      "execute",
      "confirm",
      "seal",
      "effect",
      "economic",
    ]);
    expect(output.trace.map((entry) => entry.step)).toEqual([
      "RESOLVE_R1_R5",
      "PREPARE_ACTION",
      "WARDEN_AUTHORIZE",
      "RIVER_RESERVE",
      "EXECUTE_CAPABILITY",
      "CONFIRM_RESULT",
      "RIVER_SEAL",
      "RECORD_EFFECT",
      "ECONOMIC_CONSEQUENCE",
      "UPDATE_STATE",
    ]);
  });

  it("blocks unmet R4 requirements before Warden or execution", async () => {
    const blockedResolution = resolved();
    blockedResolution.r4 = "REQUIRES_EVIDENCE";
    blockedResolution.r5 = "REQUIRES_EVIDENCE";
    delete blockedResolution.candidateAction;
    blockedResolution.unmetRequirementRefs = ["requirement:test:missing"];
    const { gateway, calls } = testGateway({ resolution: blockedResolution });

    const output = await runProgramEvent(input(), gateway);

    expect(output.state).toBe("BLOCKED_REQUIREMENT");
    expect(output.eventState).toBe("BLOCKED_REQUIREMENT");
    expect(output.reason).toContain("requirement:test:missing");
    expect(calls).toEqual(["resolve"]);
  });

  it("treats R5 as routing only and stops on Warden denial", async () => {
    const { gateway, calls } = testGateway({ wardenOutcome: "DENIED" });

    const output = await runProgramEvent(input(), gateway);

    expect(output.state).toBe("DENIED");
    expect(output.wardenDecisionRef).toBe("warden:test:1");
    expect(calls).toEqual(["resolve", "authorize:ROUTE_TO_TEST_CAPABILITY"]);
    expect(calls).not.toContain("execute");
  });

  it("blocks execution when River evidence cannot be reserved", async () => {
    const { gateway, calls } = testGateway({ riverAvailable: false });

    const output = await runProgramEvent(input(), gateway);

    expect(output.state).toBe("BLOCKED_REQUIREMENT");
    expect(output.reason).toBe("river_down");
    expect(calls).toEqual(["resolve", "authorize:ROUTE_TO_TEST_CAPABILITY", "reserve"]);
  });

  it("records confirmation mismatch evidence but creates no Effect or economics", async () => {
    const { gateway, calls } = testGateway({ confirmationMatched: false });
    const output = await runProgramEvent(input(), gateway);

    expect(output.state).toBe("EXCEPTION");
    expect(output.eventState).toBe("CONFIRMATION_MISMATCH");
    expect(output.evidenceRef).toBe("river-evidence:test:1");
    expect(output.effectRef).toBeUndefined();
    expect(calls).toEqual([
      "resolve",
      "authorize:ROUTE_TO_TEST_CAPABILITY",
      "reserve",
      "execute",
      "confirm",
      "seal",
    ]);
  });

  it("routes connector failure to EXCEPTION before confirmation or Effect", async () => {
    const { gateway, calls } = testGateway({ executionThrows: true });
    const output = await runProgramEvent(input(), gateway);

    expect(output.state).toBe("EXCEPTION");
    expect(output.reason).toBe("connector_timeout");
    expect(calls).toEqual([
      "resolve",
      "authorize:ROUTE_TO_TEST_CAPABILITY",
      "reserve",
      "execute",
    ]);
  });
});
