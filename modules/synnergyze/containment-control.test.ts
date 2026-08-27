import { describe, expect, it } from "vitest";

import {
  buildAuthorizedActionEnvelopeV1,
  SyntheticRiverReservationServiceV1,
} from "../river/reservation-service.ts";
import type { WardenDecisionRequestV1, WardenExecutionCheckpointV1 } from "../warden/contracts.ts";
import {
  evaluateSyntheticWardenDecisionV1,
  type SyntheticWardenDecisionPolicyV1,
} from "../warden/decision-service.ts";
import {
  InMemoryContainmentControlPlaneV1,
  type ContainmentControlRecordV1,
} from "./containment-control.ts";
import {
  ControlledExecutionGateV1,
  SyntheticServiceRequestCreateAdapterV1,
} from "./execution-gate.ts";

const DECIDED_AT = "2026-08-28T00:00:10.000Z";
const RESERVED_AT = "2026-08-28T00:00:20.000Z";
const CHECKED_AT = "2026-08-28T00:00:25.000Z";
const EXECUTED_AT = "2026-08-28T00:00:30.000Z";

function request(): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:CONTAINMENT-001",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:CONTAINMENT-001",
    eventRef: "SYNNERGYZE-EVENT:CONTAINMENT-001:001",
    action: "service_request.create",
    capabilityRef: "service_request.create",
    targetRef: "LAB-SERVICE-DESK-001",
    requestedEffect: "service_request.created",
    authorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    policyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    representationSourceRefs: ["REGISTRY:REPRESENTATION-001"],
    requestedAt: "2026-08-28T00:00:00.000Z",
    correlationId: "CORR-CONTAINMENT-001",
  };
}

function policy(): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:CONTAINMENT-001",
    wardenRef: "WARDEN-ALPHA-CONFORMANCE-001",
    lifecycle: "ACTIVE",
    validFrom: "2026-08-27T23:55:00.000Z",
    validUntil: "2026-08-28T00:05:00.000Z",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:CONTAINMENT-001",
    requiredAuthorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    requiredPolicyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    allowedCapabilityRefs: ["service_request.create"],
    manualReviewCapabilityRefs: [],
    constraints: ["SYNTHETIC_CONFORMANCE_ONLY", "NO_EXTERNAL_EFFECT"],
  };
}

function chain() {
  const requestValue = request();
  const decision = evaluateSyntheticWardenDecisionV1({
    request: requestValue,
    policy: policy(),
    decidedAt: DECIDED_AT,
  });
  if (decision.decision !== "ALLOW") throw new Error("expected_allow_chain");

  const action = buildAuthorizedActionEnvelopeV1(requestValue, decision);
  const river = new SyntheticRiverReservationServiceV1();
  const reservation = river.reserve({
    request: requestValue,
    decision,
    action,
    reservedAt: RESERVED_AT,
  });
  const checkpoint: WardenExecutionCheckpointV1 = {
    checkpointRef: `WARDEN-EXEC-CHECK:${decision.decisionRef}`,
    decisionRef: decision.decisionRef,
    wardenRef: decision.wardenRef,
    correlationId: decision.correlationId,
    state: "VALID",
    checkedAt: CHECKED_AT,
    reasonCodes: ["decision_active_for_execution"],
  };
  return { request: requestValue, decision, action, reservation, checkpoint };
}

function record(
  overrides: Partial<ContainmentControlRecordV1> = {},
): ContainmentControlRecordV1 {
  return {
    controlTargetId: "LAB-SERVICE-DESK-001",
    scope: "TARGET",
    state: "PAUSED",
    reason: "maintenance_window",
    authorityRef: "WARDEN-ALPHA-CONFORMANCE-001",
    effectiveAt: "2026-08-28T00:00:00.000Z",
    ...overrides,
  };
}

describe("WARDEN-CONTAINMENT-CONTROL-001", () => {
  it("defaults to ACTIVE when no containment record matches", () => {
    const plane = new InMemoryContainmentControlPlaneV1();
    const evaluation = plane.evaluate({
      targetRef: "LAB-SERVICE-DESK-001",
      capabilityRef: "service_request.create",
      programRef: "SYNNERGYZE-PROGRAM:CONTAINMENT-001",
      evaluatedAt: EXECUTED_AT,
    });

    expect(evaluation.state).toBe("ACTIVE");
    expect(evaluation.decision).toBe("ALLOW");
    expect(evaluation.matchedControlRefs).toEqual([]);
  });

  it.each(["PAUSED", "ISOLATED", "DISABLED"] as const)(
    "denies execution while a matching target is %s",
    (state) => {
      const plane = new InMemoryContainmentControlPlaneV1();
      plane.transition(record({ state }));

      const evaluation = plane.evaluate({
        targetRef: "LAB-SERVICE-DESK-001",
        capabilityRef: "service_request.create",
        programRef: "SYNNERGYZE-PROGRAM:CONTAINMENT-001",
        evaluatedAt: EXECUTED_AT,
      });

      expect(evaluation.state).toBe(state);
      expect(evaluation.decision).toBe("DENY");
      expect(evaluation.reasonCodes).toContain(`containment_${state.toLowerCase()}`);
    },
  );

  it("allows only explicitly admitted capabilities in RESTRICTED state", () => {
    const plane = new InMemoryContainmentControlPlaneV1();
    plane.transition(
      record({
        state: "RESTRICTED",
        allowedCapabilityRefs: ["service_request.read"],
      }),
    );

    expect(
      plane.evaluate({
        targetRef: "LAB-SERVICE-DESK-001",
        capabilityRef: "service_request.create",
        programRef: "SYNNERGYZE-PROGRAM:CONTAINMENT-001",
        evaluatedAt: EXECUTED_AT,
      }).decision,
    ).toBe("DENY");

    expect(
      plane.evaluate({
        targetRef: "LAB-SERVICE-DESK-001",
        capabilityRef: "service_request.read",
        programRef: "SYNNERGYZE-PROGRAM:CONTAINMENT-001",
        evaluatedAt: EXECUTED_AT,
      }).decision,
    ).toBe("ALLOW");
  });

  it("applies the most restrictive state across target, capability, program and domain scopes", () => {
    const plane = new InMemoryContainmentControlPlaneV1();
    plane.transition(record({ state: "PAUSED" }));
    plane.transition(
      record({
        controlTargetId: "service_request.create",
        scope: "CAPABILITY",
        state: "ISOLATED",
        reason: "capability_incident",
      }),
    );
    plane.transition(
      record({
        controlTargetId: "VSR",
        scope: "DOMAIN",
        state: "RESTRICTED",
        reason: "domain_maintenance",
        allowedCapabilityRefs: ["service_request.create"],
      }),
    );

    const evaluation = plane.evaluate({
      targetRef: "LAB-SERVICE-DESK-001",
      capabilityRef: "service_request.create",
      programRef: "SYNNERGYZE-PROGRAM:CONTAINMENT-001",
      evaluatedAt: EXECUTED_AT,
    });

    expect(evaluation.state).toBe("ISOLATED");
    expect(evaluation.decision).toBe("DENY");
    expect(evaluation.matchedControlRefs).toHaveLength(3);
  });

  it("ignores expired controls without deleting their transition history", () => {
    const plane = new InMemoryContainmentControlPlaneV1();
    const transition = plane.transition(
      record({
        state: "PAUSED",
        expiresAt: "2026-08-28T00:00:29.000Z",
      }),
    );

    const evaluation = plane.evaluate({
      targetRef: "LAB-SERVICE-DESK-001",
      capabilityRef: "service_request.create",
      programRef: "SYNNERGYZE-PROGRAM:CONTAINMENT-001",
      evaluatedAt: EXECUTED_AT,
    });

    expect(evaluation.state).toBe("ACTIVE");
    expect(plane.transitionReceipts().map((receipt) => receipt.transitionRef)).toContain(
      transition.transitionRef,
    );
  });

  it("requires recovery evidence before restoring a contained target to ACTIVE", () => {
    const plane = new InMemoryContainmentControlPlaneV1();
    plane.transition(record({ state: "PAUSED" }));

    expect(() =>
      plane.transition(
        record({
          state: "ACTIVE",
          reason: "maintenance_complete",
          effectiveAt: "2026-08-28T00:01:00.000Z",
        }),
      ),
    ).toThrow("containment_recovery_evidence_required");

    const restored = plane.transition(
      record({
        state: "ACTIVE",
        reason: "maintenance_complete",
        effectiveAt: "2026-08-28T00:01:00.000Z",
        recoveryEvidenceRefs: ["RIVER-EVIDENCE:MAINTENANCE-VERIFY-001"],
      }),
    );

    expect(restored.previousState).toBe("PAUSED");
    expect(restored.nextState).toBe("ACTIVE");
  });

  it("blocks the execution adapter at the central gate while PAUSED", () => {
    const c = chain();
    const adapter = new SyntheticServiceRequestCreateAdapterV1();
    const plane = new InMemoryContainmentControlPlaneV1();
    plane.transition(record({ state: "PAUSED" }));
    const gate = new ControlledExecutionGateV1([adapter], plane);

    expect(() => gate.execute({ ...c, executedAt: EXECUTED_AT })).toThrow(
      "execution_containment_paused",
    );
    expect(adapter.invocationCount()).toBe(0);
    expect(plane.evaluations()).toHaveLength(1);
    expect(plane.evaluations()[0]?.decision).toBe("DENY");
  });

  it("binds successful execution to an ACTIVE containment evaluation", () => {
    const c = chain();
    const adapter = new SyntheticServiceRequestCreateAdapterV1();
    const plane = new InMemoryContainmentControlPlaneV1();
    const gate = new ControlledExecutionGateV1([adapter], plane);

    const receipt = gate.execute({ ...c, executedAt: EXECUTED_AT });

    expect(receipt.containmentState).toBe("ACTIVE");
    expect(receipt.containmentEvaluationRef).toMatch(/^WARDEN-CONTAINMENT-EVAL:/);
    expect(adapter.invocationCount()).toBe(1);
  });

  it("reports maintenance-oriented coverage and denied execution counts", () => {
    const c = chain();
    const adapter = new SyntheticServiceRequestCreateAdapterV1();
    const plane = new InMemoryContainmentControlPlaneV1();
    plane.transition(record({ state: "PAUSED" }));
    const gate = new ControlledExecutionGateV1([adapter], plane);

    expect(() => gate.execute({ ...c, executedAt: EXECUTED_AT })).toThrow();

    expect(gate.maintenanceSnapshot(EXECUTED_AT)).toMatchObject({
      registeredCapabilities: ["service_request.create"],
      executionCount: 0,
      containment: {
        activeControlCount: 1,
        evaluationCount: 1,
        deniedEvaluationCount: 1,
        states: { PAUSED: 1 },
      },
    });
  });
});
