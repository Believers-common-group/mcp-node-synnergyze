import { describe, expect, it } from "vitest";

import type { ActionEnvelopeV1, EvidenceReservationV1 } from "../river/contracts.ts";
import type { SynnergyzeExecutionReceiptV1 } from "./contracts.ts";
import {
  assessCompositeEffectV1,
  bindCompositeExpectedEffectV1,
  type CompositeEffectObservationV1,
  type PartialFailurePolicyV1,
} from "./composite-effect-reconciliation.ts";

const RESERVED_AT = "2026-08-22T13:00:01.000Z";
const COMPILED_AT = "2026-08-22T13:00:02.000Z";
const EXECUTED_AT = "2026-08-22T13:00:03.000Z";
const OBSERVED_AT = "2026-08-22T13:00:04.000Z";
const ASSESSED_AT = "2026-08-22T13:00:05.000Z";

function action(): ActionEnvelopeV1 {
  return {
    actionRef: "ACTION:TRANSFER-001",
    requestRef: "WARDEN-REQUEST:TRANSFER-001",
    actorRef: "DIGITALME:001",
    representedPrincipalRef: "PRINCIPAL:001",
    actingCapacityRef: "CAPACITY:WAREHOUSE-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "PROGRAM:TRANSFER-001",
    eventRef: "EVENT:TRANSFER-001",
    action: "inventory.transfer",
    capabilityRef: "inventory.transfer",
    targetRef: "TRANSFER:SKU-001:SRC-A:DST-B",
    requestedEffect: "inventory.transfer.completed",
    wardenDecisionRef: "WARDEN-DECISION:TRANSFER-001",
    actionToken: "WARDEN-ACTION-TOKEN:TRANSFER-001",
    requestedAt: "2026-08-22T13:00:00.000Z",
    correlationId: "CORR:TRANSFER-001",
  };
}

function reservation(): EvidenceReservationV1 {
  return {
    reservationRef: "RIVER-RESERVATION:TRANSFER-001",
    actionRef: action().actionRef,
    wardenDecisionRef: action().wardenDecisionRef,
    correlationId: action().correlationId,
    authorizationDigest: "sha256:transfer-auth",
    state: "RESERVED",
    reservedAt: RESERVED_AT,
  };
}

function receipt(): SynnergyzeExecutionReceiptV1 {
  return {
    receiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:TRANSFER-001",
    actionRef: action().actionRef,
    reservationRef: reservation().reservationRef,
    wardenDecisionRef: action().wardenDecisionRef,
    checkpointRef: "WARDEN-CHECKPOINT:TRANSFER-001",
    programRef: action().programRef,
    eventRef: action().eventRef,
    capabilityRef: action().capabilityRef,
    targetRef: action().targetRef,
    requestedEffect: action().requestedEffect,
    correlationId: action().correlationId,
    adapterRef: "SYNTHETIC-INVENTORY-TRANSFER-ADAPTER-001",
    adapterResultRef: "TRANSFER-RESULT:001",
    state: "EXECUTED_UNVERIFIED",
    executedAt: EXECUTED_AT,
    synthetic: true,
    idempotentReplay: false,
  };
}

function contract(policy: PartialFailurePolicyV1) {
  return bindCompositeExpectedEffectV1({
    action: action(),
    reservation: reservation(),
    partialFailurePolicy: policy,
    compiledAt: COMPILED_AT,
    components: [
      {
        componentRef: "EFFECT:SOURCE-DEBIT-10",
        subjectRef: "INVENTORY:SRC-A:SKU-001",
        matcher: { kind: "EXACT", value: "DELTA:-10" },
        recoveryCapabilityRef: "inventory.source_debit.recover",
        compensationCapabilityRef: "inventory.source_debit.compensate",
        required: true,
      },
      {
        componentRef: "EFFECT:DEST-CREDIT-10",
        subjectRef: "INVENTORY:DST-B:SKU-001",
        matcher: { kind: "EXACT", value: "DELTA:+10" },
        recoveryCapabilityRef: "inventory.destination_credit.recover",
        compensationCapabilityRef: "inventory.destination_credit.compensate",
        required: true,
      },
    ],
  });
}

function observation(
  componentRef: string,
  subjectRef: string,
  observedStateRef: string,
  suffix: string,
): CompositeEffectObservationV1 {
  return {
    observationRef: `OBS:${suffix}`,
    executionReceiptRef: receipt().receiptRef,
    targetRef: action().targetRef,
    correlationId: action().correlationId,
    componentRef,
    subjectRef,
    observedStateRef,
    sourceEvidenceRef: `RIVER-EVIDENCE:${suffix}`,
    observedAt: OBSERVED_AT,
    synthetic: true,
  };
}

const sourceDebit = () =>
  observation(
    "EFFECT:SOURCE-DEBIT-10",
    "INVENTORY:SRC-A:SKU-001",
    "DELTA:-10",
    "SOURCE-DEBIT",
  );
const destinationCredit = () =>
  observation(
    "EFFECT:DEST-CREDIT-10",
    "INVENTORY:DST-B:SKU-001",
    "DELTA:+10",
    "DEST-CREDIT",
  );

describe("PARTIAL-EFFECT-ASSESSMENT-001", () => {
  it("proposes recovery only for the exact missing component when completion was pre-authorized as policy", () => {
    const result = assessCompositeEffectV1({
      contract: contract("COMPLETE_REMAINING_IF_SAFE"),
      receipt: receipt(),
      observations: [sourceDebit()],
      assessedAt: ASSESSED_AT,
    });

    expect(result.classification).toBe("PARTIAL_EFFECT");
    expect(result.matchedComponentRefs).toEqual(["EFFECT:SOURCE-DEBIT-10"]);
    expect(result.missingComponentRefs).toEqual(["EFFECT:DEST-CREDIT-10"]);
    expect(result.candidateRemedies).toHaveLength(1);
    expect(result.candidateRemedies[0]).toMatchObject({
      kind: "RECOVER",
      capabilityRef: "inventory.destination_credit.recover",
      componentRefs: ["EFFECT:DEST-CREDIT-10"],
      requiresFreshWardenDecision: true,
      authorized: false,
    });
  });

  it("proposes compensation only for the exact realized component when rollback was the predeclared policy", () => {
    const result = assessCompositeEffectV1({
      contract: contract("ROLLBACK_REALIZED_IF_SAFE"),
      receipt: receipt(),
      observations: [sourceDebit()],
      assessedAt: ASSESSED_AT,
    });

    expect(result.classification).toBe("PARTIAL_EFFECT");
    expect(result.candidateRemedies).toHaveLength(1);
    expect(result.candidateRemedies[0]).toMatchObject({
      kind: "COMPENSATE",
      capabilityRef: "inventory.source_debit.compensate",
      componentRefs: ["EFFECT:SOURCE-DEBIT-10"],
      requiresFreshWardenDecision: true,
      authorized: false,
    });
    expect(result.candidateRemedies[0].componentRefs).not.toContain("EFFECT:DEST-CREDIT-10");
  });

  it("does nothing when every required component is independently evidenced", () => {
    const result = assessCompositeEffectV1({
      contract: contract("ROLLBACK_REALIZED_IF_SAFE"),
      receipt: receipt(),
      observations: [sourceDebit(), destinationCredit()],
      assessedAt: ASSESSED_AT,
    });

    expect(result.classification).toBe("MATCH");
    expect(result.missingComponentRefs).toEqual([]);
    expect(result.candidateRemedies).toEqual([]);
  });

  it("classifies zero realized components as missing effect and never compensates nothing", () => {
    const result = assessCompositeEffectV1({
      contract: contract("ROLLBACK_REALIZED_IF_SAFE"),
      receipt: receipt(),
      observations: [],
      assessedAt: ASSESSED_AT,
    });

    expect(result.classification).toBe("MISSING_EFFECT");
    expect(result.matchedComponentRefs).toEqual([]);
    expect(result.missingComponentRefs).toEqual([
      "EFFECT:DEST-CREDIT-10",
      "EFFECT:SOURCE-DEBIT-10",
    ]);
    expect(result.candidateRemedies).toEqual([]);
  });

  it("falls back to manual review on an unexpected component even if the expected subset otherwise looks recoverable", () => {
    const result = assessCompositeEffectV1({
      contract: contract("COMPLETE_REMAINING_IF_SAFE"),
      receipt: receipt(),
      observations: [
        sourceDebit(),
        observation("EFFECT:UNKNOWN", "INVENTORY:OTHER", "DELTA:+99", "UNKNOWN"),
      ],
      assessedAt: ASSESSED_AT,
    });

    expect(result.classification).toBe("UNEXPECTED_EFFECT");
    expect(result.candidateRemedies).toHaveLength(1);
    expect(result.candidateRemedies[0].kind).toBe("MANUAL_REVIEW");
    expect(result.candidateRemedies[0].componentRefs).toEqual([
      "EFFECT:DEST-CREDIT-10",
      "EFFECT:UNKNOWN",
    ]);
  });

  it("falls back to manual review when two observations conflict for one expected component", () => {
    const result = assessCompositeEffectV1({
      contract: contract("ROLLBACK_REALIZED_IF_SAFE"),
      receipt: receipt(),
      observations: [
        sourceDebit(),
        observation(
          "EFFECT:SOURCE-DEBIT-10",
          "INVENTORY:SRC-A:SKU-001",
          "DELTA:-9",
          "SOURCE-CONFLICT",
        ),
      ],
      assessedAt: ASSESSED_AT,
    });

    expect(result.classification).toBe("CONFLICTING_EFFECT");
    expect(result.conflictingComponentRefs).toEqual(["EFFECT:SOURCE-DEBIT-10"]);
    expect(result.candidateRemedies).toHaveLength(1);
    expect(result.candidateRemedies[0].kind).toBe("MANUAL_REVIEW");
  });

  it("treats duplicate evidence as unsafe rather than using it to strengthen a recovery claim", () => {
    const first = sourceDebit();
    const second = { ...sourceDebit(), observationRef: "OBS:SOURCE-DEBIT-REPLAY", sourceEvidenceRef: "RIVER-EVIDENCE:SOURCE-DEBIT-REPLAY" };
    const result = assessCompositeEffectV1({
      contract: contract("COMPLETE_REMAINING_IF_SAFE"),
      receipt: receipt(),
      observations: [first, second],
      assessedAt: ASSESSED_AT,
    });

    expect(result.classification).toBe("DUPLICATE_EFFECT");
    expect(result.duplicateComponentRefs).toEqual(["EFFECT:SOURCE-DEBIT-10"]);
    expect(result.candidateRemedies[0].kind).toBe("MANUAL_REVIEW");
  });

  it("rejects a composite contract fabricated after execution", () => {
    const lateContract = {
      ...contract("COMPLETE_REMAINING_IF_SAFE"),
      compiledAt: "2026-08-22T13:00:04.500Z",
    };
    expect(() =>
      assessCompositeEffectV1({
        contract: lateContract,
        receipt: receipt(),
        observations: [sourceDebit()],
        assessedAt: ASSESSED_AT,
      }),
    ).toThrow("partial_effect_contract_after_execution");
  });
});
