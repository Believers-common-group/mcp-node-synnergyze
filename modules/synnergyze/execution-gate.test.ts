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
import type {
  DeviceSecurityStateV1,
  ResolvedDeviceSecurityContextV1,
} from "./contracts.ts";
import {
  ControlledExecutionGateV1,
  SyntheticServiceRequestCreateAdapterV1,
} from "./execution-gate.ts";

const DECIDED_AT = "2026-08-14T09:00:10.000Z";
const RESERVED_AT = "2026-08-14T09:00:20.000Z";
const CHECKED_AT = "2026-08-14T09:00:25.000Z";
const EXECUTED_AT = "2026-08-14T09:00:30.000Z";

function request(overrides: Partial<WardenDecisionRequestV1> = {}): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:EXEC-001",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:EXEC-001",
    eventRef: "SYNNERGYZE-EVENT:EXEC-001:001",
    action: "service_request.create",
    capabilityRef: "service_request.create",
    targetRef: "LAB-SERVICE-DESK-001",
    requestedEffect: "service_request.created",
    authorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    policyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    representationSourceRefs: ["REGISTRY:REPRESENTATION-001"],
    requestedAt: "2026-08-14T09:00:00.000Z",
    correlationId: "CORR-EXEC-001",
    ...overrides,
  };
}

function deviceBoundRequest(
  overrides: Partial<WardenDecisionRequestV1> = {},
): WardenDecisionRequestV1 {
  return request({
    executionDeviceRef: "ALPHA-DEVICE-001",
    deviceSecurityState: "ACTIVE",
    deviceSecurityPolicyRef: "BAG-LOCK-POLICY:ALPHA-001",
    deviceSecuritySourceRefs: [
      "REGISTRY-DEVICE-SECURITY:ALPHA-DEVICE-001:REQUEST",
      "RIVER-EVIDENCE:BAG-LOCK-REQUEST-001",
    ],
    deviceSecurityResolvedAt: "2026-08-14T08:59:58.000Z",
    deviceSecurityValidUntil: "2026-08-14T09:04:59.000Z",
    ...overrides,
  });
}

function executionDeviceSecurity(
  overrides: Partial<ResolvedDeviceSecurityContextV1> = {},
): ResolvedDeviceSecurityContextV1 {
  return {
    resolutionRef: "REGISTRY-DEVICE-SECURITY:ALPHA-DEVICE-001:EXECUTION",
    deviceRef: "ALPHA-DEVICE-001",
    state: "ACTIVE",
    policyRef: "BAG-LOCK-POLICY:ALPHA-001",
    evidenceRef: "RIVER-EVIDENCE:BAG-LOCK-EXECUTION-001",
    assuranceLevel: "L1",
    resolvedAt: "2026-08-14T09:00:26.000Z",
    validUntil: "2026-08-14T09:01:00.000Z",
    ...overrides,
  };
}

function policy(
  overrides: Partial<SyntheticWardenDecisionPolicyV1> = {},
): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:EXEC-001",
    wardenRef: "WARDEN-ALPHA-CONFORMANCE-001",
    lifecycle: "ACTIVE",
    validFrom: "2026-08-14T08:55:00.000Z",
    validUntil: "2026-08-14T09:05:00.000Z",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:EXEC-001",
    requiredAuthorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    requiredPolicyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    allowedCapabilityRefs: ["service_request.create"],
    manualReviewCapabilityRefs: ["contract.execute"],
    constraints: ["SYNTHETIC_CONFORMANCE_ONLY", "NO_EXTERNAL_EFFECT"],
    ...overrides,
  };
}

function chain(input?: {
  request?: WardenDecisionRequestV1;
  policy?: SyntheticWardenDecisionPolicyV1;
  checkpoint?: Partial<WardenExecutionCheckpointV1>;
}) {
  const requestValue = input?.request ?? request();
  const decision = evaluateSyntheticWardenDecisionV1({
    request: requestValue,
    policy: input?.policy ?? policy(),
    decidedAt: DECIDED_AT,
  });
  if (decision.decision !== "ALLOW") throw new Error("expected_allow_chain");
  const action = buildAuthorizedActionEnvelopeV1(requestValue, decision);
  const river = new SyntheticRiverReservationServiceV1();
  const reservation = river.reserve({ request: requestValue, decision, action, reservedAt: RESERVED_AT });
  const checkpoint: WardenExecutionCheckpointV1 = {
    checkpointRef: `WARDEN-EXEC-CHECK:${decision.decisionRef}`,
    decisionRef: decision.decisionRef,
    wardenRef: decision.wardenRef,
    correlationId: decision.correlationId,
    state: "VALID",
    checkedAt: CHECKED_AT,
    reasonCodes: ["decision_active_for_execution"],
    ...input?.checkpoint,
  };
  return { request: requestValue, decision, action, reservation, checkpoint };
}

function deviceChain() {
  return {
    ...chain({ request: deviceBoundRequest() }),
    executionDeviceSecurity: executionDeviceSecurity(),
  };
}

function gate() {
  const adapter = new SyntheticServiceRequestCreateAdapterV1();
  return { adapter, gate: new ControlledExecutionGateV1([adapter]) };
}

describe("VSR-NETWORK-CONTROLLED-EXECUTION-GATE-001", () => {
  it("executes one reserved synthetic capability and returns only an unverified receipt", () => {
    const c = chain();
    const runtime = gate();
    const receipt = runtime.gate.execute({ ...c, executedAt: EXECUTED_AT });

    expect(receipt.state).toBe("EXECUTED_UNVERIFIED");
    expect(receipt.synthetic).toBe(true);
    expect(receipt.idempotentReplay).toBe(false);
    expect(receipt.adapterRef).toBe(runtime.adapter.adapterRef);
    expect(receipt.adapterResultRef).toMatch(/^SYNTHETIC-SERVICE-REQUEST:/);
    expect(receipt.executionDeviceRef).toBeUndefined();
    expect("effectRef" in receipt).toBe(false);
    expect("verifiedAt" in receipt).toBe(false);
    expect(runtime.adapter.invocationCount()).toBe(1);
  });

  it("replays the identical execution idempotently without invoking the adapter twice", () => {
    const c = chain();
    const runtime = gate();
    const first = runtime.gate.execute({ ...c, executedAt: EXECUTED_AT });
    const second = runtime.gate.execute({ ...c, executedAt: EXECUTED_AT });

    expect(second.receiptRef).toBe(first.receiptRef);
    expect(second.adapterResultRef).toBe(first.adapterResultRef);
    expect(second.idempotentReplay).toBe(true);
    expect(runtime.adapter.invocationCount()).toBe(1);
    expect(runtime.gate.executionCount()).toBe(1);
  });

  it("blocks DENY and ESCALATE decisions before adapter invocation", () => {
    const c = chain();
    const runtime = gate();
    const deny = { ...c.decision, decision: "DENY" as const, actionToken: undefined };
    const escalate = { ...c.decision, decision: "ESCALATE" as const, actionToken: undefined };

    expect(() => runtime.gate.execute({ ...c, decision: deny, executedAt: EXECUTED_AT })).toThrow(
      "execution_warden_allow_required",
    );
    expect(() =>
      runtime.gate.execute({ ...c, decision: escalate, executedAt: EXECUTED_AT }),
    ).toThrow("execution_warden_allow_required");
    expect(runtime.adapter.invocationCount()).toBe(0);
  });

  it("blocks revoked, expired and superseded execution checkpoints", () => {
    for (const state of ["REVOKED", "EXPIRED", "SUPERSEDED"] as const) {
      const c = chain({ checkpoint: { state } });
      const runtime = gate();
      expect(() => runtime.gate.execute({ ...c, executedAt: EXECUTED_AT })).toThrow(
        `execution_warden_checkpoint_${state.toLowerCase()}`,
      );
      expect(runtime.adapter.invocationCount()).toBe(0);
    }
  });

  it("blocks checkpoint decision, Warden and correlation drift", () => {
    const drifts: Array<Partial<WardenExecutionCheckpointV1>> = [
      { decisionRef: "WARDEN-DECISION:OTHER" },
      { wardenRef: "WARDEN-OTHER-001" },
      { correlationId: "CORR-OTHER-001" },
    ];
    for (const drift of drifts) {
      const c = chain({ checkpoint: drift });
      const runtime = gate();
      expect(() => runtime.gate.execute({ ...c, executedAt: EXECUTED_AT })).toThrow(/mismatch/);
      expect(runtime.adapter.invocationCount()).toBe(0);
    }
  });

  it("requires a fresh checkpoint after reservation and no later than execution", () => {
    const stale = chain({ checkpoint: { checkedAt: "2026-08-14T09:00:15.000Z" } });
    const future = chain({ checkpoint: { checkedAt: "2026-08-14T09:00:31.000Z" } });

    expect(() => gate().gate.execute({ ...stale, executedAt: EXECUTED_AT })).toThrow(
      "execution_checkpoint_stale_before_reservation",
    );
    expect(() => gate().gate.execute({ ...future, executedAt: EXECUTED_AT })).toThrow(
      "execution_checkpoint_from_future",
    );
  });

  it("blocks execution after the Warden decision expires", () => {
    const c = chain();
    const runtime = gate();
    expect(() =>
      runtime.gate.execute({ ...c, executedAt: "2026-08-14T09:05:01.000Z" }),
    ).toThrow("execution_warden_decision_expired");
    expect(runtime.adapter.invocationCount()).toBe(0);
  });

  it("blocks reservation lineage and authorization-digest drift", () => {
    const c = chain();
    const drifts = [
      { ...c.reservation, actionRef: "ACTION:OTHER" },
      { ...c.reservation, wardenDecisionRef: "WARDEN-DECISION:OTHER" },
      { ...c.reservation, correlationId: "CORR-OTHER" },
      { ...c.reservation, authorizationDigest: "sha256:tampered" },
    ];
    for (const reservation of drifts) {
      const runtime = gate();
      expect(() => runtime.gate.execute({ ...c, reservation, executedAt: EXECUTED_AT })).toThrow();
      expect(runtime.adapter.invocationCount()).toBe(0);
    }
  });

  it("blocks action-token drift before adapter invocation", () => {
    const c = chain();
    const runtime = gate();
    expect(() =>
      runtime.gate.execute({
        ...c,
        action: { ...c.action, actionToken: "WARDEN-ACTION-TOKEN:TAMPERED" },
        executedAt: EXECUTED_AT,
      }),
    ).toThrow("execution_action_token_mismatch");
    expect(runtime.adapter.invocationCount()).toBe(0);
  });

  it("blocks capabilities without a registered execution adapter", () => {
    const requestValue = request({
      action: "bank.transfer",
      capabilityRef: "bank.transfer",
      targetRef: "BANK:TEST-001",
    });
    const c = chain({
      request: requestValue,
      policy: policy({ allowedCapabilityRefs: ["service_request.create", "bank.transfer"] }),
    });
    const runtime = gate();

    expect(() => runtime.gate.execute({ ...c, executedAt: EXECUTED_AT })).toThrow(
      "execution_capability_not_registered:bank.transfer",
    );
    expect(runtime.adapter.invocationCount()).toBe(0);
  });

  it("rejects a same-action replay when the execution checkpoint identity changes", () => {
    const c = chain();
    const runtime = gate();
    runtime.gate.execute({ ...c, executedAt: EXECUTED_AT });

    expect(() =>
      runtime.gate.execute({
        ...c,
        checkpoint: { ...c.checkpoint, checkpointRef: "WARDEN-EXEC-CHECK:NEW" },
        executedAt: EXECUTED_AT,
      }),
    ).toThrow("execution_idempotency_conflict");
    expect(runtime.adapter.invocationCount()).toBe(1);
  });

  it("executes a device-bound action only with a fresh matching ACTIVE security resolution", () => {
    const c = deviceChain();
    const runtime = gate();
    const receipt = runtime.gate.execute({ ...c, executedAt: EXECUTED_AT });

    expect(receipt.state).toBe("EXECUTED_UNVERIFIED");
    expect(receipt.executionDeviceRef).toBe("ALPHA-DEVICE-001");
    expect(receipt.deviceSecurityResolutionRef).toBe(c.executionDeviceSecurity.resolutionRef);
    expect(receipt.deviceSecurityEvidenceRef).toBe(c.executionDeviceSecurity.evidenceRef);
    expect(receipt.deviceSecurityPolicyRef).toBe("BAG-LOCK-POLICY:ALPHA-001");
    expect(runtime.adapter.invocationCount()).toBe(1);
  });

  it("blocks a device-bound action when fresh execution security is missing", () => {
    const c = deviceChain();
    const runtime = gate();
    const { executionDeviceSecurity: _ignored, ...withoutSecurity } = c;

    expect(() => runtime.gate.execute({ ...withoutSecurity, executedAt: EXECUTED_AT })).toThrow(
      "execution_device_security_required",
    );
    expect(runtime.adapter.invocationCount()).toBe(0);
  });

  it("blocks a device security checkpoint for another device", () => {
    const c = deviceChain();
    const runtime = gate();

    expect(() =>
      runtime.gate.execute({
        ...c,
        executionDeviceSecurity: executionDeviceSecurity({ deviceRef: "ALPHA-DEVICE-OTHER" }),
        executedAt: EXECUTED_AT,
      }),
    ).toThrow("execution_device_security_context_mismatch");
    expect(runtime.adapter.invocationCount()).toBe(0);
  });

  for (const state of [
    "BAG_LOCK_REQUESTED",
    "SEALED",
    "SEALED_ALERT",
    "UNSEAL_PENDING",
    "WARDEN_REAUTH",
    "CONTROLLED_RECONNECT",
    "RECOVERY_REQUIRED",
  ] as const satisfies readonly DeviceSecurityStateV1[]) {
    it(`blocks device-bound execution if state changes to ${state} after authorization`, () => {
      const c = deviceChain();
      const runtime = gate();

      expect(() =>
        runtime.gate.execute({
          ...c,
          executionDeviceSecurity: executionDeviceSecurity({ state }),
          executedAt: EXECUTED_AT,
        }),
      ).toThrow(`execution_device_security_state_${state.toLowerCase()}`);
      expect(runtime.adapter.invocationCount()).toBe(0);
    });
  }

  it("blocks missing evidence, policy drift, future resolution and expired security at execution", () => {
    const c = deviceChain();
    const cases: Array<[ResolvedDeviceSecurityContextV1, string]> = [
      [executionDeviceSecurity({ evidenceRef: "" }), "execution_device_security_evidence_required"],
      [
        executionDeviceSecurity({ policyRef: "BAG-LOCK-POLICY:OTHER" }),
        "execution_device_security_policy_mismatch",
      ],
      [
        executionDeviceSecurity({ resolvedAt: "2026-08-14T09:00:31.000Z" }),
        "execution_device_security_from_future",
      ],
      [
        executionDeviceSecurity({ validUntil: "2026-08-14T09:00:29.000Z" }),
        "execution_device_security_expired",
      ],
    ];

    for (const [executionDeviceSecurityValue, expected] of cases) {
      const runtime = gate();
      expect(() =>
        runtime.gate.execute({
          ...c,
          executionDeviceSecurity: executionDeviceSecurityValue,
          executedAt: EXECUTED_AT,
        }),
      ).toThrow(expected);
      expect(runtime.adapter.invocationCount()).toBe(0);
    }
  });

  it("replays identical device-bound execution idempotently", () => {
    const c = deviceChain();
    const runtime = gate();
    const first = runtime.gate.execute({ ...c, executedAt: EXECUTED_AT });
    const second = runtime.gate.execute({ ...c, executedAt: EXECUTED_AT });

    expect(second.receiptRef).toBe(first.receiptRef);
    expect(second.idempotentReplay).toBe(true);
    expect(runtime.adapter.invocationCount()).toBe(1);
  });

  it("fails closed when the same authorized action is replayed with different security evidence", () => {
    const c = deviceChain();
    const runtime = gate();
    runtime.gate.execute({ ...c, executedAt: EXECUTED_AT });

    expect(() =>
      runtime.gate.execute({
        ...c,
        executionDeviceSecurity: executionDeviceSecurity({
          resolutionRef: "REGISTRY-DEVICE-SECURITY:ALPHA-DEVICE-001:EXECUTION:2",
          evidenceRef: "RIVER-EVIDENCE:BAG-LOCK-EXECUTION-002",
        }),
        executedAt: EXECUTED_AT,
      }),
    ).toThrow("execution_idempotency_conflict");
    expect(runtime.adapter.invocationCount()).toBe(1);
  });

  it("rejects stray device security on a non-device-bound action", () => {
    const c = chain();
    const runtime = gate();

    expect(() =>
      runtime.gate.execute({
        ...c,
        executionDeviceSecurity: executionDeviceSecurity(),
        executedAt: EXECUTED_AT,
      }),
    ).toThrow("execution_device_security_unexpected");
    expect(runtime.adapter.invocationCount()).toBe(0);
  });
});
