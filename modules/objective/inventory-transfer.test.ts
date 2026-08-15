import { describe, expect, it } from "vitest";

import type { EvidenceSealV1 } from "../river/contracts.ts";
import type {
  InventoryTransferSpecV1,
  ObjectiveAuthorityEnvelopeV1,
  ObjectiveProjectionV1,
  ObjectiveRefV1,
} from "./contracts.ts";
import {
  compileInventoryTransferObjective,
  evaluateInventoryTransferAcceptance,
  InMemoryInventoryLedgerV1,
  observeInventoryTransfer,
  runSyntheticInventoryTransferProof,
  type SyntheticInventoryTransferTimelineV1,
} from "./inventory-transfer.ts";

const transfer: InventoryTransferSpecV1 = {
  sourceLocationRef: "LOC-ALPHA-SRC-001",
  destinationLocationRef: "LOC-ALPHA-DST-001",
  skuRef: "SKU-ALPHA-001",
  quantity: 10,
};

function objective(overrides: Partial<ObjectiveRefV1> = {}): ObjectiveRefV1 {
  return {
    objectiveRef: "OBJ-ALPHA-STOCK-001",
    principalRef: "LAB-COMPANY-001",
    statementRef: "STATEMENT:PREVENT-AVAILABILITY-FAILURE",
    desiredStateRef: "DESIRED:SKU-ALPHA-001-AVAILABLE-AT-DST",
    successConditionRefs: ["SUCCESS:SOURCE-MINUS-10", "SUCCESS:DESTINATION-PLUS-10"],
    constraintRefs: ["SYNTHETIC_ONLY", "NO_EXTERNAL_PROVIDER"],
    authorityRequirementRefs: ["POLICY:ALPHA-OBJECTIVE-001"],
    acceptanceProfileRef: "ACCEPTANCE:ALPHA-STOCK-TRANSFER-001",
    validFrom: "2026-08-15T05:00:00.000Z",
    validUntil: "2026-08-15T06:00:00.000Z",
    version: "1.0.0",
    status: "AUTHORIZED",
    ...overrides,
  };
}

function authority(overrides: Partial<ObjectiveAuthorityEnvelopeV1> = {}): ObjectiveAuthorityEnvelopeV1 {
  return {
    authorityRef: "OBJECTIVE-AUTHORITY:OBJ-ALPHA-STOCK-001",
    objectiveRef: "OBJ-ALPHA-STOCK-001",
    principalRef: "LAB-COMPANY-001",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    wardenRef: "WARDEN-ALPHA-RC1-001",
    wardenDecisionRef: "WARDEN-OBJECTIVE-DECISION:OBJ-ALPHA-STOCK-001",
    decision: "ALLOW",
    state: "ACTIVE",
    allowedCapabilityRefs: ["inventory.transfer"],
    resourceRefs: ["LOC-ALPHA-SRC-001", "LOC-ALPHA-DST-001", "SKU-ALPHA-001"],
    evidenceRequirementRefs: ["EVIDENCE:DISPATCH", "EVIDENCE:RECEIPT"],
    validFrom: "2026-08-15T05:00:00.000Z",
    validUntil: "2026-08-15T06:00:00.000Z",
    constraintRefs: ["SYNTHETIC_ONLY", "NO_FINANCIAL_EFFECT"],
    ...overrides,
  };
}

const timeline: SyntheticInventoryTransferTimelineV1 = {
  compiledAt: "2026-08-15T05:10:00.000Z",
  actionRequestedAt: "2026-08-15T05:10:01.000Z",
  decidedAt: "2026-08-15T05:10:02.000Z",
  reservedAt: "2026-08-15T05:10:03.000Z",
  checkpointAt: "2026-08-15T05:10:04.000Z",
  executedAt: "2026-08-15T05:10:05.000Z",
  observedAt: "2026-08-15T05:10:06.000Z",
  verifiedAt: "2026-08-15T05:10:07.000Z",
  sealedAt: "2026-08-15T05:10:08.000Z",
  acceptedAt: "2026-08-15T05:10:09.000Z",
};

describe("ALPHA-OBJ-RUNTIME-001", () => {
  it("compiles the 14-event Objective plan with purpose and authority lineage on every event", () => {
    const bundle = compileInventoryTransferObjective({
      objective: objective(),
      authority: authority(),
      transfer,
      compiledAt: timeline.compiledAt,
    });

    expect(bundle.events).toHaveLength(14);
    expect(bundle.events.map((event) => event.eventType)).toEqual([
      "RESOLVE_OBJECTIVE",
      "RESOLVE_RESOURCES",
      "PREPARE_TRANSFER",
      "WARDEN_ALLOW",
      "RESERVE_EVIDENCE",
      "DISPATCH",
      "VERIFY_DISPATCH",
      "RECEIVE",
      "VERIFY_RECEIPT",
      "SEAL_EVIDENCE",
      "RECORD_EFFECTS",
      "ACCEPTANCE_CHECK",
      "RECONCILE_PROJECTIONS",
      "CLOSE_OBJECTIVE",
    ]);
    for (const event of bundle.events) {
      expect(event.objectiveRef).toBe("OBJ-ALPHA-STOCK-001");
      expect(event.programRef).toBe(bundle.program.programRef);
      expect(event.authorityRef).toBe(authority().authorityRef);
      expect(event.correlationId).toBe(bundle.program.correlationId);
      expect(event.idempotencyKey).toBeTruthy();
    }
    expect(bundle.program.objectiveRef).toBe("OBJ-ALPHA-STOCK-001");
    expect(bundle.program.purposeLineageRef).toMatch(/^PURPOSE-LINEAGE:/);
  });

  it("executes exactly one synthetic transfer and closes only after observed, verified, sealed effects pass acceptance", () => {
    const proof = runSyntheticInventoryTransferProof({
      objective: objective(),
      authority: authority(),
      transfer,
      sourceInitial: 50,
      destinationInitial: 5,
      timeline,
    });

    expect(proof.effects).toHaveLength(2);
    expect(proof.effects.map((effect) => effect.observedDeltaOrStateRef)).toEqual(["DELTA:-10", "DELTA:+10"]);
    expect(proof.effects.every((effect) => effect.objectiveRef === "OBJ-ALPHA-STOCK-001")).toBe(true);
    expect(proof.effects.every((effect) => effect.evidenceRef === proof.riverSealRef)).toBe(true);
    expect(proof.verifiedEffectRef).toMatch(/^VERIFIED-EFFECT:/);
    expect(proof.riverSealRef).toMatch(/^OBJECTIVE-RIVER-SEAL:/);
    expect(proof.frontProjection).toEqual(proof.backProjection);
    expect(proof.frontProjection.sourceQuantity).toBe(40);
    expect(proof.frontProjection.destinationQuantity).toBe(15);
    expect(proof.acceptance.result).toBe("PASS");
    expect(proof.closedObjective.status).toBe("CLOSED");
    expect("settlementRef" in proof).toBe(false);
    expect("economicObligationRef" in proof).toBe(false);
  });

  it("fails before planning/execution when Objective authority is denied, revoked, expired or lacks resource scope", () => {
    const invalidAuthorities: ObjectiveAuthorityEnvelopeV1[] = [
      authority({ decision: "DENY" }),
      authority({ state: "REVOKED" }),
      authority({ state: "EXPIRED" }),
      authority({ resourceRefs: ["LOC-ALPHA-SRC-001", "SKU-ALPHA-001"] }),
    ];
    for (const invalid of invalidAuthorities) {
      expect(() =>
        compileInventoryTransferObjective({ objective: objective(), authority: invalid, transfer, compiledAt: timeline.compiledAt }),
      ).toThrow();
    }
  });

  it("fails closed when authority or Objective validity has expired", () => {
    expect(() =>
      compileInventoryTransferObjective({
        objective: objective(),
        authority: authority({ validUntil: "2026-08-15T05:09:59.000Z" }),
        transfer,
        compiledAt: timeline.compiledAt,
      }),
    ).toThrow("objective_authority_outside_validity_window");
    expect(() =>
      compileInventoryTransferObjective({
        objective: objective({ validUntil: "2026-08-15T05:09:59.000Z" }),
        authority: authority(),
        transfer,
        compiledAt: timeline.compiledAt,
      }),
    ).toThrow("objective_outside_validity_window");
  });

  it("refuses to fabricate observed Effects when read-after-write state does not match the transfer", () => {
    const ledger = new InMemoryInventoryLedgerV1();
    ledger.set(transfer.sourceLocationRef, transfer.skuRef, 41);
    ledger.set(transfer.destinationLocationRef, transfer.skuRef, 15);
    expect(() =>
      observeInventoryTransfer({
        receipt: {
          receiptRef: "EXECUTION:TEST",
          actionRef: "ACTION:TEST",
          programRef: "PROGRAM:TEST",
          eventRef: "EVENT:TEST",
          targetRef: "TARGET:TEST",
          correlationId: "CORR:TEST",
          executedAt: timeline.executedAt,
        },
        ledger,
        transfer,
        sourcePrior: 50,
        destinationPrior: 5,
        observedAt: timeline.observedAt,
      }),
    ).toThrow("inventory_read_after_write_mismatch");
  });

  it("acceptance fails on projection divergence even when Effects and evidence otherwise match", () => {
    const proof = runSyntheticInventoryTransferProof({
      objective: objective(),
      authority: authority(),
      transfer,
      sourceInitial: 50,
      destinationInitial: 5,
      timeline,
    });
    const seal: EvidenceSealV1 = {
      sealRef: proof.riverSealRef,
      reservationRef: "RESERVATION:TEST",
      correlationId: proof.bundle.program.correlationId,
      state: "SEALED",
      traceDigest: "TRACE",
      sealedAt: timeline.sealedAt,
    };
    const divergentBack: ObjectiveProjectionV1 = {
      ...proof.backProjection,
      destinationQuantity: proof.backProjection.destinationQuantity + 1,
    };
    const result = evaluateInventoryTransferAcceptance({
      objective: objective({ status: "ACCEPTANCE_PENDING" }),
      transfer,
      effects: proof.effects,
      seal,
      frontProjection: proof.frontProjection,
      backProjection: divergentBack,
      checkedAt: timeline.acceptedAt,
    });
    expect(result.result).toBe("FAIL");
    expect(result.reasonCodes).toContain("PROJECTION_DIVERGENCE");
  });

  it("acceptance rejects duplicate Effects and unsealed/mismatched evidence", () => {
    const proof = runSyntheticInventoryTransferProof({
      objective: objective(),
      authority: authority(),
      transfer,
      sourceInitial: 50,
      destinationInitial: 5,
      timeline,
    });
    const seal: EvidenceSealV1 = {
      sealRef: "SEAL:OTHER",
      reservationRef: "RESERVATION:TEST",
      correlationId: proof.bundle.program.correlationId,
      state: "SEALED",
      traceDigest: "TRACE",
      sealedAt: timeline.sealedAt,
    };
    const duplicated = [proof.effects[0], proof.effects[0]];
    const result = evaluateInventoryTransferAcceptance({
      objective: objective({ status: "ACCEPTANCE_PENDING" }),
      transfer,
      effects: duplicated,
      seal,
      frontProjection: proof.frontProjection,
      backProjection: proof.backProjection,
      checkedAt: timeline.acceptedAt,
    });
    expect(result.result).toBe("FAIL");
    expect(result.reasonCodes).toContain("DUPLICATE_EFFECT");
    expect(result.reasonCodes).toContain("EFFECT_EVIDENCE_MISMATCH");
  });

  it("keeps model/provider identity outside Objective ownership and authority lineage", () => {
    const firstModel = "MODEL-BINDING-A-001";
    const secondModel = "MODEL-BINDING-B-001";
    const first = compileInventoryTransferObjective({ objective: objective(), authority: authority(), transfer, compiledAt: timeline.compiledAt });
    const second = compileInventoryTransferObjective({ objective: objective(), authority: authority(), transfer, compiledAt: timeline.compiledAt });
    expect(first.program.objectiveRef).toBe(second.program.objectiveRef);
    expect(first.program.authorityRef).toBe(second.program.authorityRef);
    expect(first.program.programRef).toBe(second.program.programRef);
    expect(firstModel).not.toBe(secondModel);
    expect("modelRef" in first.program).toBe(false);
    expect("providerRef" in first.program).toBe(false);
  });
});
