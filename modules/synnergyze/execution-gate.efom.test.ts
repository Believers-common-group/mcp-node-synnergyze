import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { ActionEnvelopeV1, EvidenceReservationV1 } from "../river/contracts.ts";
import type { WardenDecisionV1, WardenExecutionCheckpointV1 } from "../warden/contracts.ts";
import {
  ControlledExecutionGateV1,
  SyntheticServiceRequestCreateAdapterV1,
} from "./execution-gate.ts";

const ACTION_TOKEN = "WARDEN-ACTION-TOKEN:EFOM-EXEC-001";

function authorizationDigest(): string {
  return `sha256:${createHash("sha256").update(ACTION_TOKEN, "utf8").digest("hex")}`;
}

function action(operationClass: "OBSERVE" | "ACT"): ActionEnvelopeV1 {
  return {
    actionRef: "ACTION:EFOM-EXEC-001",
    requestRef: "WARDEN-REQUEST:EFOM-EXEC-001",
    actorRef: "DIGITALME:EFOM-001",
    representedPrincipalRef: "ESTATE:001",
    actingCapacityRef: "CAPACITY:EFOM-OPERATOR",
    contextRef: "ALPHA-NODE-001",
    programRef: "OSIRIS:EFOM",
    eventRef: "OSIRIS-EVENT:EFOM-EXEC-001",
    action: "service_request.create",
    capabilityRef: "service_request.create",
    targetRef: "LAB-SERVICE-DESK-001",
    requestedEffect: "service_request.created",
    operationClass,
    physicalWorldContextDigest: "sha256:efom-context-001",
    wardenDecisionRef: "WARDEN-DECISION:EFOM-EXEC-001",
    actionToken: ACTION_TOKEN,
    requestedAt: "2026-09-10T06:00:00.000Z",
    correlationId: "CORR:EFOM-EXEC-001",
  };
}

function decision(): WardenDecisionV1 {
  return {
    decisionRef: "WARDEN-DECISION:EFOM-EXEC-001",
    requestRef: "WARDEN-REQUEST:EFOM-EXEC-001",
    wardenRef: "WARDEN:001",
    action: "service_request.create",
    targetRef: "LAB-SERVICE-DESK-001",
    reasonCodes: ["bounded_policy_allow"],
    constraints: [],
    decidedAt: "2026-09-10T06:00:10.000Z",
    validUntil: "2026-09-10T06:10:00.000Z",
    correlationId: "CORR:EFOM-EXEC-001",
    decision: "ALLOW",
    actionToken: ACTION_TOKEN,
  };
}

function reservation(): EvidenceReservationV1 {
  return {
    reservationRef: "RIVER-RESERVATION:EFOM-EXEC-001",
    actionRef: "ACTION:EFOM-EXEC-001",
    wardenDecisionRef: "WARDEN-DECISION:EFOM-EXEC-001",
    correlationId: "CORR:EFOM-EXEC-001",
    authorizationDigest: authorizationDigest(),
    state: "RESERVED",
    reservedAt: "2026-09-10T06:00:20.000Z",
  };
}

function checkpoint(): WardenExecutionCheckpointV1 {
  return {
    checkpointRef: "WARDEN-CHECKPOINT:EFOM-EXEC-001",
    decisionRef: "WARDEN-DECISION:EFOM-EXEC-001",
    wardenRef: "WARDEN:001",
    correlationId: "CORR:EFOM-EXEC-001",
    state: "VALID",
    checkedAt: "2026-09-10T06:00:25.000Z",
    reasonCodes: ["decision_active_for_execution"],
  };
}

describe("OSIRIS-EFOM-SYNNERGYZE-ACTUATION-R0-1", () => {
  it("blocks EFOM OBSERVE before adapter invocation", () => {
    const adapter = new SyntheticServiceRequestCreateAdapterV1();
    const gate = new ControlledExecutionGateV1([adapter]);

    expect(() =>
      gate.execute({
        action: action("OBSERVE"),
        decision: decision(),
        reservation: reservation(),
        checkpoint: checkpoint(),
        executedAt: "2026-09-10T06:00:30.000Z",
      }),
    ).toThrow("execution_efom_act_operation_required");
    expect(adapter.invocationCount()).toBe(0);
  });

  it("allows EFOM ACT only after the existing Warden, River and checkpoint interlocks", () => {
    const adapter = new SyntheticServiceRequestCreateAdapterV1();
    const gate = new ControlledExecutionGateV1([adapter]);
    const receipt = gate.execute({
      action: action("ACT"),
      decision: decision(),
      reservation: reservation(),
      checkpoint: checkpoint(),
      executedAt: "2026-09-10T06:00:30.000Z",
    });

    expect(receipt.state).toBe("EXECUTED_UNVERIFIED");
    expect(adapter.invocationCount()).toBe(1);
  });
});
