import { describe, expect, it } from "vitest";

import type { WardenDecisionRequestV1 } from "../../modules/warden/contracts.ts";
import type {
  PostExecutionObservationSourceV1,
  PostExecutionObservationV1,
} from "../../modules/synnergyze/effect-verification.ts";
import { SyntheticServiceRequestObservationSourceV1 } from "../../modules/synnergyze/effect-verification.ts";
import {
  WardenRiverEffectConformanceServiceV1,
} from "./registerWardenRiverEffectConformance.ts";

const NOW = "2026-08-23T02:00:30.000Z";

function request(overrides: Partial<WardenDecisionRequestV1> = {}): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:EFFECT-001",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:001",
    eventRef: "SYNNERGYZE-EVENT:EFFECT-001",
    action: "service_request.create",
    capabilityRef: "service_request.create",
    targetRef: "LAB-SERVICE-DESK-001",
    requestedEffect: "service_request.created",
    authorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    policyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    representationSourceRefs: ["REGISTRY:REPRESENTATION-001"],
    requestedAt: "2026-08-23T02:00:00.000Z",
    correlationId: "CORR-EFFECT-001",
    ...overrides,
  };
}

function input(value: WardenDecisionRequestV1 = request()) {
  return { request: value };
}

class MismatchedTargetObserver implements PostExecutionObservationSourceV1 {
  readonly observerRef = "TEST-MISMATCHED-TARGET-OBSERVER";
  private readonly base = new SyntheticServiceRequestObservationSourceV1();

  observe(receipt: Parameters<PostExecutionObservationSourceV1["observe"]>[0], observedAt: string): PostExecutionObservationV1 {
    return {
      ...this.base.observe(receipt, observedAt),
      targetRef: "TARGET:MISMATCH",
    };
  }
}

describe("WARDEN-RIVER-EFFECT-CONFORMANCE-0.9", () => {
  it("progresses EXECUTED_UNVERIFIED to VERIFIED_EFFECT and a sealed River causal trace", () => {
    const service = new WardenRiverEffectConformanceServiceV1();
    const result = service.execute(input(), NOW);

    expect(result.execution.executionReceipt?.state).toBe("EXECUTED_UNVERIFIED");
    expect(result.verification?.state).toBe("VERIFIED_EFFECT");
    expect(result.observation?.executionReceiptRef).toBe(result.execution.executionReceipt?.receiptRef);
    expect(result.seal?.state).toBe("SEALED");
    expect(result.causalTrace?.sealed).toBe(true);
    expect(result.causalTrace?.effectRef).toBe(
      result.verification?.state === "VERIFIED_EFFECT" ? result.verification.effect.effectRef : undefined,
    );
    expect(result.causalTrace?.sealRef).toBe(result.seal?.sealRef);
    expect(result.reconciliationState).toBe("PENDING");
    expect(result.idempotentReplay).toBe(false);
  });

  it("contains no raw Warden action token in the public result", () => {
    const service = new WardenRiverEffectConformanceServiceV1();
    const result = service.execute(input(), NOW);
    const text = JSON.stringify(result);

    expect(text).not.toContain("WARDEN-ACTION-TOKEN:");
    expect(text).not.toContain("actionToken");
  });

  it("returns the original effect and seal for exact replay even when time advances", () => {
    const service = new WardenRiverEffectConformanceServiceV1();
    const first = service.execute(input(), NOW);
    const replay = service.execute(input(), "2026-08-23T02:05:00.000Z");

    expect(replay.idempotentReplay).toBe(true);
    expect(replay.seal).toEqual(first.seal);
    expect(replay.causalTrace).toEqual(first.causalTrace);
    expect(replay.verification).toEqual(first.verification);
    expect(replay.observation).toEqual(first.observation);
  });

  it("rejects mutated reuse of the same requestRef before another effect journey", () => {
    const service = new WardenRiverEffectConformanceServiceV1();
    service.execute(input(), NOW);

    expect(() =>
      service.execute(input(request({ targetRef: "LAB-SERVICE-DESK-MUTATED" })), NOW),
    ).toThrow("effect_conformance_request_replay_conflict");
  });

  it("creates no execution, verified effect or seal for DENY", () => {
    const service = new WardenRiverEffectConformanceServiceV1();
    const result = service.execute(
      input(
        request({
          requestRef: "WARDEN-REQUEST:EFFECT-DENY-001",
          correlationId: "CORR-EFFECT-DENY-001",
          action: "bank.transfer",
          capabilityRef: "bank.transfer",
          targetRef: "BANK:TEST",
        }),
      ),
      NOW,
    );

    expect(result.execution.decision.decision).toBe("DENY");
    expect(result.execution.executionReceipt).toBeNull();
    expect(result.observation).toBeNull();
    expect(result.verification).toBeNull();
    expect(result.seal).toBeNull();
    expect(result.causalTrace).toBeNull();
  });

  it("never seals when post-execution observation lineage fails verification", () => {
    const service = new WardenRiverEffectConformanceServiceV1(new MismatchedTargetObserver());
    const result = service.execute(input(), NOW);

    expect(result.execution.executionReceipt?.state).toBe("EXECUTED_UNVERIFIED");
    expect(result.verification?.state).toBe("EXCEPTION");
    if (result.verification?.state !== "EXCEPTION") throw new Error("expected_exception");
    expect(result.verification.reasonCode).toBe("OBSERVATION_TARGET_MISMATCH");
    expect(result.seal).toBeNull();
    expect(result.causalTrace).toBeNull();
    expect(result.reconciliationState).toBe("PENDING");
  });
});
