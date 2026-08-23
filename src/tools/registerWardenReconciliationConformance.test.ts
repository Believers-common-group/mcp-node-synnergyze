import { describe, expect, it } from "vitest";

import type { WardenDecisionRequestV1 } from "../../modules/warden/contracts.ts";
import {
  SyntheticServiceRequestObservationSourceV1,
  type PostExecutionObservationSourceV1,
} from "../../modules/synnergyze/effect-verification.ts";
import { WardenRiverEffectConformanceServiceV1 } from "./registerWardenRiverEffectConformance.ts";
import { WardenReconciliationConformanceServiceV1 } from "./registerWardenReconciliationConformance.ts";

const NOW = "2026-08-23T05:00:30.000Z";

function request(overrides: Partial<WardenDecisionRequestV1> = {}): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:RECON-001",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:001",
    eventRef: "SYNNERGYZE-EVENT:RECON-001",
    action: "service_request.create",
    capabilityRef: "service_request.create",
    targetRef: "LAB-SERVICE-DESK-001",
    requestedEffect: "service_request.created",
    authorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    policyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    representationSourceRefs: ["REGISTRY:REPRESENTATION-001"],
    requestedAt: "2026-08-23T05:00:00.000Z",
    correlationId: "CORR-RECON-001",
    ...overrides,
  };
}

function input(value: WardenDecisionRequestV1) {
  return { request: value };
}

class UnexpectedStateObserver implements PostExecutionObservationSourceV1 {
  readonly observerRef = "SYNTHETIC-UNEXPECTED-STATE-OBSERVER-001";
  private readonly delegate = new SyntheticServiceRequestObservationSourceV1();

  observe(receipt: Parameters<PostExecutionObservationSourceV1["observe"]>[0], observedAt: string) {
    const base = this.delegate.observe(receipt, observedAt);
    return {
      ...base,
      observerRef: this.observerRef,
      observedStateRef: "SYNTHETIC-SERVICE-REQUEST-STATE:UNEXPECTED:001",
    };
  }
}

class MissingStateObserver implements PostExecutionObservationSourceV1 {
  readonly observerRef = "SYNTHETIC-MISSING-STATE-OBSERVER-001";
  private readonly delegate = new SyntheticServiceRequestObservationSourceV1();

  observe(receipt: Parameters<PostExecutionObservationSourceV1["observe"]>[0], observedAt: string) {
    const base = this.delegate.observe(receipt, observedAt);
    return { ...base, observerRef: this.observerRef, observedStateRef: "" };
  }
}

describe("WARDEN-RECONCILIATION-CONFORMANCE-1.0", () => {
  it("binds expectation before execution and closes only after verified sealed MATCH", () => {
    const service = new WardenReconciliationConformanceServiceV1();
    const result = service.execute(input(request()), NOW);

    expect(result.expectation?.state).toBe("BOUND_PRE_EXECUTION");
    expect(result.expectation?.requestedEffect).toBe("service_request.created");
    expect(result.effect.execution.executionReceipt?.state).toBe("EXECUTED_UNVERIFIED");
    expect(result.effect.verification?.state).toBe("VERIFIED_EFFECT");
    expect(result.effect.seal?.state).toBe("SEALED");
    expect(result.reconciliation?.state).toBe("DETERMINED");
    if (result.reconciliation?.state !== "DETERMINED") throw new Error("expected_determination");
    expect(result.reconciliation.determination.classification).toBe("MATCH");
    expect(result.reconciliation.determination.state).toBe("RECONCILED");
    expect(result.reconciliation.determination.closureEligible).toBe(true);
    expect(result.reconciliation.determination.candidateRemedies).toEqual([]);
    expect(result.closure?.state).toBe("CLOSED");
    expect(result.closure?.settlementFinality).toBe(false);
    expect(result.state).toBe("RECONCILED_CLOSED");
    expect(JSON.stringify(result)).not.toContain("actionToken");
    expect(JSON.stringify(result)).not.toContain("WARDEN-ACTION-TOKEN:");
  });

  it("returns the original reconciliation and closure on exact replay even when time advances", () => {
    const service = new WardenReconciliationConformanceServiceV1();
    const first = service.execute(input(request()), NOW);
    const replay = service.execute(input(request()), "2026-08-23T05:05:00.000Z");

    expect(replay.idempotentReplay).toBe(true);
    expect(replay.closure?.closureRef).toBe(first.closure?.closureRef);
    if (replay.reconciliation?.state !== "DETERMINED" || first.reconciliation?.state !== "DETERMINED") {
      throw new Error("expected_reconciliations");
    }
    expect(replay.reconciliation.determination.reconciliationRef).toBe(
      first.reconciliation.determination.reconciliationRef,
    );
  });

  it("rejects mutated reuse of the same request identity", () => {
    const service = new WardenReconciliationConformanceServiceV1();
    service.execute(input(request()), NOW);
    expect(() =>
      service.execute(input(request({ targetRef: "LAB-SERVICE-DESK-MUTATED" })), NOW),
    ).toThrow("reconciliation_conformance_request_replay_conflict");
  });

  it("does not reconcile or close a DENY decision", () => {
    const service = new WardenReconciliationConformanceServiceV1();
    const result = service.execute(
      input(request({
        requestRef: "WARDEN-REQUEST:RECON-DENY-001",
        action: "bank.transfer",
        capabilityRef: "bank.transfer",
        targetRef: "BANK:TEST",
        correlationId: "CORR-RECON-DENY-001",
      })),
      NOW,
    );

    expect(result.effect.execution.decision.decision).toBe("DENY");
    expect(result.effect.execution.executionReceipt).toBeNull();
    expect(result.reconciliation).toBeNull();
    expect(result.closure).toBeNull();
    expect(result.state).toBe("NOT_EXECUTED");
  });

  it("classifies a verified but unexpected effect as COMPENSATE without authorizing the remedy", () => {
    const effect = new WardenRiverEffectConformanceServiceV1(new UnexpectedStateObserver());
    const service = new WardenReconciliationConformanceServiceV1(effect);
    const result = service.execute(
      input(request({
        requestRef: "WARDEN-REQUEST:RECON-UNEXPECTED-001",
        eventRef: "SYNNERGYZE-EVENT:RECON-UNEXPECTED-001",
        correlationId: "CORR-RECON-UNEXPECTED-001",
      })),
      NOW,
    );

    expect(result.effect.verification?.state).toBe("VERIFIED_EFFECT");
    expect(result.effect.seal?.state).toBe("SEALED");
    if (result.reconciliation?.state !== "DETERMINED") throw new Error("expected_determination");
    expect(result.reconciliation.determination.classification).toBe("UNEXPECTED_EFFECT");
    expect(result.reconciliation.determination.state).toBe("EXCEPTION");
    expect(result.reconciliation.determination.closureEligible).toBe(false);
    expect(result.reconciliation.determination.candidateRemedies).toHaveLength(1);
    expect(result.reconciliation.determination.candidateRemedies[0]).toMatchObject({
      kind: "COMPENSATE",
      requiresFreshWardenDecision: true,
      authorized: false,
    });
    expect(result.closure).toBeNull();
    expect(result.state).toBe("EXCEPTION_OPEN");
  });

  it("classifies missing observed state as RECOVER and does not seal or close", () => {
    const effect = new WardenRiverEffectConformanceServiceV1(new MissingStateObserver());
    const service = new WardenReconciliationConformanceServiceV1(effect);
    const result = service.execute(
      input(request({
        requestRef: "WARDEN-REQUEST:RECON-MISSING-001",
        eventRef: "SYNNERGYZE-EVENT:RECON-MISSING-001",
        correlationId: "CORR-RECON-MISSING-001",
      })),
      NOW,
    );

    expect(result.effect.verification?.state).toBe("EXCEPTION");
    expect(result.effect.seal).toBeNull();
    if (result.reconciliation?.state !== "DETERMINED") throw new Error("expected_determination");
    expect(result.reconciliation.determination.classification).toBe("MISSING_EFFECT");
    expect(result.reconciliation.determination.candidateRemedies[0]).toMatchObject({
      kind: "RECOVER",
      requiresFreshWardenDecision: true,
      authorized: false,
    });
    expect(result.closure).toBeNull();
    expect(result.state).toBe("EXCEPTION_OPEN");
  });
});
