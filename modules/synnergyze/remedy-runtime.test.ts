import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { ActionEnvelopeV1, EvidenceReservationV1 } from "../river/contracts.ts";
import type { WardenDecisionV1, WardenExecutionCheckpointV1 } from "../warden/contracts.ts";
import type {
  ReconciliationDeterminationV1,
  ReconciliationRemedyKindV1,
  ReconciliationRemedyProposalV1,
} from "./reconciliation-fabric.ts";
import type { RemedyAuthorizationGrantV1 } from "./remedy-authorization.ts";
import { canonicalRemedyEffectBindingV1 } from "./remedy-authorization.ts";
import {
  RemedyRuntimeV1,
  SyntheticCompensationAdapterV1,
  SyntheticRecoveryAdapterV1,
} from "./remedy-runtime.ts";

const TOKEN = "WARDEN-ACTION-TOKEN:REMEDY-RUNTIME-001";
const EXECUTED_AT = "2026-08-22T12:00:08.000Z";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function proposal(kind: ReconciliationRemedyKindV1): ReconciliationRemedyProposalV1 {
  const capabilityRef =
    kind === "RECOVER"
      ? "effect.recover"
      : kind === "COMPENSATE"
        ? "effect.compensate"
        : "reconciliation.manual_review";
  return {
    proposalRef: `REMEDY-PROPOSAL:${kind}`,
    kind,
    capabilityRef,
    reasonCode: `${kind.toLowerCase()}_required`,
    requiresFreshWardenDecision: true,
    authorized: false,
  };
}

function determination(
  boundProposal: ReconciliationRemedyProposalV1,
  overrides: Partial<ReconciliationDeterminationV1> = {},
): ReconciliationDeterminationV1 {
  return {
    version: "RECONCILIATION-FABRIC-001",
    reconciliationRef: "RECONCILIATION:RUNTIME-001",
    exceptionRef: "EXCEPTION:RUNTIME-001",
    classification: boundProposal.kind === "RECOVER" ? "MISSING_EFFECT" : "UNEXPECTED_EFFECT",
    executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:ORIGINAL-001",
    reservationRef: "RIVER-RESERVATION:ORIGINAL-001",
    originalWardenDecisionRef: "WARDEN-DECISION:ORIGINAL-001",
    programRef: "SYNNERGYZE-PROGRAM:RUNTIME-001",
    eventRef: "SYNNERGYZE-EVENT:RUNTIME-001:001",
    targetRef: "LAB-SERVICE-DESK-001",
    requestedEffect: "service_request.created",
    correlationId: "CORR:PARENT:RUNTIME-001",
    expectationRef: "EXPECTED-EFFECT:RUNTIME-001",
    readbackRef: "PROVIDER-READBACK:RUNTIME-001",
    sourceEvidenceRefs: ["PROVIDER-EVIDENCE:RUNTIME-001"],
    candidateRemedies: [boundProposal],
    sourceDigest: "sha256:reconciliation-source",
    reconciledAt: "2026-08-22T12:00:03.000Z",
    state: "DETERMINED_UNAUTHORIZED",
    authorized: false,
    synthetic: true,
    ...overrides,
  };
}

function authorization(
  value: ReconciliationDeterminationV1,
  boundProposal: ReconciliationRemedyProposalV1,
  overrides: Partial<RemedyAuthorizationGrantV1> = {},
): RemedyAuthorizationGrantV1 {
  return {
    version: "WARDEN-REMEDY-AUTH-001",
    authorizationRef: `REMEDY-AUTHORIZATION:${boundProposal.kind}`,
    reconciliationRef: value.reconciliationRef,
    proposalRef: boundProposal.proposalRef,
    proposalKind: boundProposal.kind,
    parentCorrelationId: value.correlationId,
    remedyCorrelationId: `CORR:REMEDY:${boundProposal.kind}`,
    originalWardenDecisionRef: value.originalWardenDecisionRef,
    remedyWardenDecisionRef: `WARDEN-DECISION:REMEDY:${boundProposal.kind}`,
    remedyWardenRequestRef: `WARDEN-REQUEST:REMEDY:${boundProposal.kind}`,
    capabilityRef: boundProposal.capabilityRef,
    targetRef: value.targetRef,
    actionTokenDigest: `sha256:${digest(TOKEN)}`,
    authorizedAt: "2026-08-22T12:00:05.000Z",
    validUntil: "2026-08-22T12:05:00.000Z",
    state: "AUTHORIZED_REMEDY",
    synthetic: true,
    ...overrides,
  };
}

function action(
  value: ReconciliationDeterminationV1,
  boundProposal: ReconciliationRemedyProposalV1,
  grant: RemedyAuthorizationGrantV1,
  overrides: Partial<ActionEnvelopeV1> = {},
): ActionEnvelopeV1 {
  return {
    actionRef: `ACTION:REMEDY:${boundProposal.kind}`,
    requestRef: grant.remedyWardenRequestRef,
    actorRef: "ACTOR:001",
    representedPrincipalRef: "PRINCIPAL:001",
    actingCapacityRef: "CAPACITY:001",
    contextRef: "CONTEXT:001",
    programRef: value.programRef,
    eventRef: value.eventRef,
    action: boundProposal.capabilityRef,
    capabilityRef: boundProposal.capabilityRef,
    targetRef: value.targetRef,
    requestedEffect: canonicalRemedyEffectBindingV1(value, boundProposal),
    wardenDecisionRef: grant.remedyWardenDecisionRef,
    actionToken: TOKEN,
    requestedAt: "2026-08-22T12:00:04.000Z",
    correlationId: grant.remedyCorrelationId,
    ...overrides,
  };
}

function decision(
  remedyAction: ActionEnvelopeV1,
  overrides: Partial<WardenDecisionV1> = {},
): WardenDecisionV1 {
  return {
    decisionRef: remedyAction.wardenDecisionRef,
    requestRef: remedyAction.requestRef,
    wardenRef: "WARDEN:001",
    decision: "ALLOW",
    action: remedyAction.action,
    targetRef: remedyAction.targetRef,
    reasonCodes: ["bounded_remedy_allow"],
    constraints: ["SYNTHETIC_ONLY"],
    decidedAt: "2026-08-22T12:00:05.000Z",
    validUntil: "2026-08-22T12:05:00.000Z",
    correlationId: remedyAction.correlationId,
    actionToken: remedyAction.actionToken,
    ...overrides,
  } as WardenDecisionV1;
}

function reservation(
  remedyAction: ActionEnvelopeV1,
  overrides: Partial<EvidenceReservationV1> = {},
): EvidenceReservationV1 {
  return {
    reservationRef: `RIVER-RESERVATION:REMEDY:${remedyAction.capabilityRef}`,
    actionRef: remedyAction.actionRef,
    wardenDecisionRef: remedyAction.wardenDecisionRef,
    correlationId: remedyAction.correlationId,
    authorizationDigest: `sha256:${digest(remedyAction.actionToken)}`,
    state: "RESERVED",
    reservedAt: "2026-08-22T12:00:06.000Z",
    ...overrides,
  };
}

function checkpoint(
  remedyAction: ActionEnvelopeV1,
  overrides: Partial<WardenExecutionCheckpointV1> = {},
): WardenExecutionCheckpointV1 {
  return {
    checkpointRef: `WARDEN-EXEC-CHECK:REMEDY:${remedyAction.capabilityRef}`,
    decisionRef: remedyAction.wardenDecisionRef,
    wardenRef: "WARDEN:001",
    correlationId: remedyAction.correlationId,
    state: "VALID",
    checkedAt: "2026-08-22T12:00:07.000Z",
    reasonCodes: ["decision_still_valid"],
    ...overrides,
  };
}

function fixture(kind: "RECOVER" | "COMPENSATE") {
  const boundProposal = proposal(kind);
  const value = determination(boundProposal);
  const grant = authorization(value, boundProposal);
  const remedyAction = action(value, boundProposal, grant);
  return {
    determination: value,
    proposal: boundProposal,
    authorization: grant,
    action: remedyAction,
    reservation: reservation(remedyAction),
    decision: decision(remedyAction),
    checkpoint: checkpoint(remedyAction),
    executedAt: EXECUTED_AT,
  };
}

describe("REMEDY-RUNTIME-001", () => {
  it("executes a fresh authorized recovery as RECOVERED_UNVERIFIED", () => {
    const adapter = new SyntheticRecoveryAdapterV1();
    const runtime = new RemedyRuntimeV1([adapter]);

    const result = runtime.execute(fixture("RECOVER"));

    expect(result.version).toBe("RECOVERY-CONTRACT-001");
    expect(result.kind).toBe("RECOVER");
    expect(result.state).toBe("RECOVERED_UNVERIFIED");
    expect(result.originalExecutionReceiptRef).toBe("SYNNERGYZE-EXECUTION-RECEIPT:ORIGINAL-001");
    expect(result.originalReservationRef).toBe("RIVER-RESERVATION:ORIGINAL-001");
    expect(result.remedyExecutionReceiptRef).toMatch(/^SYNNERGYZE-EXECUTION-RECEIPT:/);
    expect(result.remedyReservationRef).not.toBe(result.originalReservationRef);
    expect(result.effectVerified).toBe(false);
    expect(result.idempotentReplay).toBe(false);
    expect(adapter.invocationCount()).toBe(1);
    expect("actionToken" in result).toBe(false);
  });

  it("executes a fresh authorized compensation as COMPENSATED_UNVERIFIED", () => {
    const adapter = new SyntheticCompensationAdapterV1();
    const runtime = new RemedyRuntimeV1([adapter]);

    const result = runtime.execute(fixture("COMPENSATE"));

    expect(result.version).toBe("COMPENSATION-CONTRACT-001");
    expect(result.kind).toBe("COMPENSATE");
    expect(result.state).toBe("COMPENSATED_UNVERIFIED");
    expect(result.effectVerified).toBe(false);
    expect(result.authorizationRef).toBe("REMEDY-AUTHORIZATION:COMPENSATE");
    expect(adapter.invocationCount()).toBe(1);
  });

  it("rejects manual review and mismatched authorization before invoking an adapter", () => {
    const recovery = new SyntheticRecoveryAdapterV1();
    const compensation = new SyntheticCompensationAdapterV1();
    const runtime = new RemedyRuntimeV1([recovery, compensation]);
    const manualProposal = proposal("MANUAL_REVIEW");
    const manualDetermination = determination(manualProposal);
    const manualGrant = authorization(manualDetermination, manualProposal);
    const manualAction = action(manualDetermination, manualProposal, manualGrant);

    expect(() =>
      runtime.execute({
        determination: manualDetermination,
        proposal: manualProposal,
        authorization: manualGrant,
        action: manualAction,
        reservation: reservation(manualAction),
        decision: decision(manualAction),
        checkpoint: checkpoint(manualAction),
        executedAt: EXECUTED_AT,
      }),
    ).toThrow("remedy_runtime_unexecutable_kind");

    const mismatched = fixture("RECOVER");
    expect(() =>
      runtime.execute({
        ...mismatched,
        authorization: { ...mismatched.authorization, proposalKind: "COMPENSATE" },
      }),
    ).toThrow("remedy_runtime_grant_kind_mismatch");
    expect(recovery.invocationCount()).toBe(0);
    expect(compensation.invocationCount()).toBe(0);
  });

  it("rejects original decision or reservation reuse and grant token drift", () => {
    const recovery = new SyntheticRecoveryAdapterV1();
    const runtime = new RemedyRuntimeV1([recovery]);
    const original = fixture("RECOVER");

    expect(() =>
      runtime.execute({
        ...original,
        action: {
          ...original.action,
          wardenDecisionRef: original.determination.originalWardenDecisionRef,
        },
      }),
    ).toThrow("remedy_runtime_fresh_decision_required");

    expect(() =>
      runtime.execute({
        ...original,
        reservation: {
          ...original.reservation,
          reservationRef: original.determination.reservationRef,
        },
      }),
    ).toThrow("remedy_runtime_fresh_reservation_required");

    expect(() =>
      runtime.execute({
        ...original,
        authorization: {
          ...original.authorization,
          actionTokenDigest: "sha256:tampered",
        },
      }),
    ).toThrow("remedy_runtime_action_token_mismatch");
    expect(recovery.invocationCount()).toBe(0);
  });

  it("rejects execution outside the fresh grant window", () => {
    const runtime = new RemedyRuntimeV1([new SyntheticRecoveryAdapterV1()]);
    const original = fixture("RECOVER");

    expect(() =>
      runtime.execute({
        ...original,
        executedAt: "2026-08-22T12:05:00.001Z",
      }),
    ).toThrow("remedy_runtime_authorization_expired");
  });

  it("replays idempotently without re-invoking the adapter and rejects mutation", () => {
    const adapter = new SyntheticRecoveryAdapterV1();
    const runtime = new RemedyRuntimeV1([adapter]);
    const original = fixture("RECOVER");

    const first = runtime.execute(original);
    const replay = runtime.execute(original);

    expect(first.idempotentReplay).toBe(false);
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.remedyExecutionRef).toBe(first.remedyExecutionRef);
    expect(adapter.invocationCount()).toBe(1);

    expect(() =>
      runtime.execute({
        ...original,
        checkpoint: {
          ...original.checkpoint,
          checkpointRef: "WARDEN-EXEC-CHECK:REMEDY:MUTATED",
        },
      }),
    ).toThrow("remedy_runtime_idempotency_conflict");
    expect(adapter.invocationCount()).toBe(1);
  });
});
