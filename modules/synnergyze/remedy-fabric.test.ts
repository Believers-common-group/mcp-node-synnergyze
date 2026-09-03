import { describe, expect, it } from "vitest";

import type { ActionEnvelopeV1, EvidenceReservationV1 } from "../river/contracts.ts";
import type {
  WardenDecisionRequestV1,
  WardenExecutionCheckpointV1,
} from "../warden/contracts.ts";
import {
  evaluateSyntheticWardenDecisionV1,
  type SyntheticWardenDecisionPolicyV1,
} from "../warden/decision-service.ts";
import {
  EffectExpectationServiceV1,
  SyntheticServiceRequestExpectationCompilerV1,
  type ExpectedEffectContractV1,
} from "./effect-expectation.ts";
import type {
  ReconciliationDeterminationV1,
  ReconciliationRemedyProposalV1,
} from "./reconciliation-fabric.ts";
import {
  authorizeReconciliationRemedyV1,
  canonicalRemedyEffectBindingV1,
  type RemedyAuthorizationGrantV1,
} from "./remedy-authorization.ts";
import {
  InMemoryRemedyExecutionJournalV1,
  RemedyExecutionGateV1,
  SyntheticCompensationRemedyAdapterV1,
  SyntheticRecoveryRemedyAdapterV1,
  type RemedyExecutionAdapterV1,
  type RemedyExecutionReceiptV1,
} from "./remedy-execution.ts";
import {
  verifyRemedyEffectV1,
  type CompensationTargetResolverV1,
  type RemedyObservationV1,
} from "./remedy-effect-verification.ts";
import { RemedyLineageClosureServiceV1 } from "./remedy-lineage-closure.ts";

const RECONCILED_AT = "2026-08-23T05:01:00.000Z";
const DECIDED_AT = "2026-08-23T05:01:20.000Z";
const CHECKED_AT = "2026-08-23T05:01:25.000Z";
const EXECUTED_AT = "2026-08-23T05:01:30.000Z";
const OBSERVED_AT = "2026-08-23T05:01:40.000Z";
const VERIFIED_AT = "2026-08-23T05:01:50.000Z";
const SEALED_AT = "2026-08-23T05:02:00.000Z";

function expectation(): ExpectedEffectContractV1 {
  const action: ActionEnvelopeV1 = {
    actionRef: "ACTION:ORIGINAL-001",
    requestRef: "WARDEN-REQUEST:ORIGINAL-001",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:001",
    eventRef: "SYNNERGYZE-EVENT:REMEDY-001",
    action: "service_request.create",
    capabilityRef: "service_request.create",
    targetRef: "LAB-SERVICE-DESK-001",
    requestedEffect: "service_request.created",
    wardenDecisionRef: "WARDEN-DECISION:ORIGINAL-001",
    actionToken: "WARDEN-ACTION-TOKEN:ORIGINAL-SECRET",
    requestedAt: "2026-08-23T05:00:00.000Z",
    correlationId: "CORR-PARENT-REMEDY-001",
  };
  const reservation: EvidenceReservationV1 = {
    reservationRef: "RIVER-RESERVATION:ORIGINAL-001",
    actionRef: action.actionRef,
    wardenDecisionRef: action.wardenDecisionRef,
    correlationId: action.correlationId,
    authorizationDigest: "sha256:original",
    state: "RESERVED",
    reservedAt: "2026-08-23T05:00:10.000Z",
  };
  return new EffectExpectationServiceV1([
    new SyntheticServiceRequestExpectationCompilerV1(),
  ]).compile({ action, reservation, compiledAt: "2026-08-23T05:00:15.000Z" });
}

function determination(kind: "RECOVER" | "COMPENSATE" | "MANUAL_REVIEW") {
  const proposal: ReconciliationRemedyProposalV1 = {
    proposalRef: `REMEDY-PROPOSAL:${kind}:001`,
    kind,
    capabilityRef: kind === "RECOVER"
      ? "reconciliation.recover"
      : kind === "COMPENSATE"
        ? "reconciliation.compensate"
        : "reconciliation.manual_review",
    reasonCode: kind === "RECOVER"
      ? "expected_effect_missing"
      : kind === "COMPENSATE"
        ? "unexpected_effect_observed"
        : "unsafe_for_automatic_remedy",
    requiresFreshWardenDecision: true,
    authorized: false,
  };
  const value: ReconciliationDeterminationV1 = {
    version: "RECONCILIATION-FABRIC-001",
    reconciliationRef: `RECONCILIATION:${kind}:001`,
    state: "EXCEPTION",
    classification: kind === "RECOVER"
      ? "MISSING_EFFECT"
      : kind === "COMPENSATE"
        ? "UNEXPECTED_EFFECT"
        : "EVIDENCE_INSUFFICIENT",
    expectationRef: expectation().expectationRef,
    executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:ORIGINAL-001",
    actionRef: "ACTION:ORIGINAL-001",
    reservationRef: "RIVER-RESERVATION:ORIGINAL-001",
    originalWardenDecisionRef: "WARDEN-DECISION:ORIGINAL-001",
    programRef: "SYNNERGYZE-PROGRAM:001",
    eventRef: "SYNNERGYZE-EVENT:REMEDY-001",
    capabilityRef: "service_request.create",
    targetRef: "LAB-SERVICE-DESK-001",
    requestedEffect: "service_request.created",
    correlationId: "CORR-PARENT-REMEDY-001",
    sourceEvidenceRefs: ["RIVER:EVIDENCE:ORIGINAL-001"],
    candidateRemedies: [proposal],
    closureEligible: false,
    reconciledAt: RECONCILED_AT,
    sourceDigest: `sha256:reconciliation-${kind}`,
    synthetic: true,
  };
  return { determination: value, proposal };
}

function remedyPolicy(capabilityRef: string): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: `WARDEN-REMEDY-POLICY:${capabilityRef}`,
    wardenRef: "WARDEN-REMEDY-CONFORMANCE-001",
    lifecycle: "ACTIVE",
    validFrom: "2026-08-23T05:01:00.000Z",
    validUntil: "2026-08-23T06:00:00.000Z",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:001",
    requiredAuthorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    requiredPolicyRefs: ["POLICY:REMEDY-SYNTHETIC-001"],
    allowedCapabilityRefs: [capabilityRef],
    manualReviewCapabilityRefs: [],
    constraints: ["REMEDY_CONFORMANCE_ONLY", "NO_LIVE_EFFECT"],
  };
}

function authorize(kind: "RECOVER" | "COMPENSATE") {
  const fixture = determination(kind);
  const request: WardenDecisionRequestV1 = {
    requestRef: `WARDEN-REQUEST:REMEDY:${kind}:001`,
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: fixture.determination.programRef,
    eventRef: fixture.determination.eventRef,
    action: fixture.proposal.capabilityRef,
    capabilityRef: fixture.proposal.capabilityRef,
    targetRef: fixture.determination.targetRef,
    requestedEffect: canonicalRemedyEffectBindingV1(fixture.determination, fixture.proposal),
    authorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    policyRefs: ["POLICY:REMEDY-SYNTHETIC-001"],
    representationSourceRefs: ["REGISTRY:REPRESENTATION-001"],
    requestedAt: "2026-08-23T05:01:10.000Z",
    correlationId: `CORR-CHILD-REMEDY-${kind}-001`,
  };
  const decision = evaluateSyntheticWardenDecisionV1({
    request,
    policy: remedyPolicy(fixture.proposal.capabilityRef),
    decidedAt: DECIDED_AT,
  });
  const authorization = authorizeReconciliationRemedyV1({
    determination: fixture.determination,
    proposal: fixture.proposal,
    request,
    decision,
    authorizedAt: DECIDED_AT,
  });
  if (authorization.state !== "AUTHORIZED") throw new Error(authorization.reasonCode);
  return { ...fixture, request, decision, grant: authorization.grant };
}

function checkpoint(
  grant: RemedyAuthorizationGrantV1,
  overrides: Partial<WardenExecutionCheckpointV1> = {},
): WardenExecutionCheckpointV1 {
  return {
    checkpointRef: `WARDEN-REMEDY-CHECKPOINT:${grant.authorizationRef}`,
    decisionRef: grant.remedyWardenDecisionRef,
    wardenRef: grant.remedyWardenRef,
    correlationId: grant.remedyCorrelationId,
    state: "VALID",
    checkedAt: CHECKED_AT,
    reasonCodes: ["synthetic_remedy_checkpoint_valid"],
    ...overrides,
  };
}

function observation(
  receipt: RemedyExecutionReceiptV1,
  grant: RemedyAuthorizationGrantV1,
  observedStateRef: string,
): RemedyObservationV1 {
  return {
    observationRef: `REMEDY-OBSERVATION:${receipt.receiptRef}`,
    remedyExecutionReceiptRef: receipt.receiptRef,
    reconciliationRef: receipt.reconciliationRef,
    proposalRef: receipt.proposalRef,
    targetRef: receipt.targetRef,
    remedyCorrelationId: grant.remedyCorrelationId,
    observerRef: "SYNTHETIC-REMEDY-OBSERVER-001",
    observedStateRef,
    sourceEvidenceRef: `RIVER:REMEDY-EVIDENCE:${receipt.receiptRef}`,
    observedAt: OBSERVED_AT,
    synthetic: true,
  };
}

class CompensationResolver implements CompensationTargetResolverV1 {
  readonly resolverRef = "SYNTHETIC-SERVICE-REQUEST-COMPENSATION-001";
  readonly capabilityRef = "reconciliation.compensate";
  resolve() {
    return { kind: "EXACT" as const, value: "SYNTHETIC-SERVICE-REQUEST-STATE:ABSENT:COMPENSATED" };
  }
}

class FailingAdapter implements RemedyExecutionAdapterV1 {
  readonly adapterRef = "SYNTHETIC-FAILING-REMEDY-ADAPTER-001";
  readonly capabilityRef = "reconciliation.recover";
  invocations = 0;
  async execute(
    _input: Parameters<RemedyExecutionAdapterV1["execute"]>[0],
  ): Promise<{ adapterResultRef: string }> {
    this.invocations += 1;
    throw new Error("provider_outcome_unknown");
  }
}

describe("WARDEN-REMEDY-FABRIC-1.1", () => {
  it("authorizes RECOVER only with a fresh child Warden decision and contains the raw token", () => {
    const fixture = authorize("RECOVER");
    expect(fixture.decision.decision).toBe("ALLOW");
    expect(fixture.grant.originalWardenDecisionRef).not.toBe(fixture.grant.remedyWardenDecisionRef);
    expect(fixture.grant.parentCorrelationId).not.toBe(fixture.grant.remedyCorrelationId);
    expect(fixture.grant.actionTokenDigest).toMatch(/^sha256:/);
    expect(Object.prototype.hasOwnProperty.call(fixture.grant, "actionToken")).toBe(false);
    expect(JSON.stringify(fixture.grant)).not.toContain(fixture.decision.actionToken);
  });

  it("refuses to authorize MANUAL_REVIEW as an executable remedy", () => {
    const fixture = determination("MANUAL_REVIEW");
    const fakeRequest = {
      ...authorize("RECOVER").request,
      requestRef: "WARDEN-REQUEST:MANUAL-001",
      action: fixture.proposal.capabilityRef,
      capabilityRef: fixture.proposal.capabilityRef,
      requestedEffect: canonicalRemedyEffectBindingV1(fixture.determination, fixture.proposal),
      correlationId: "CORR-CHILD-MANUAL-001",
    };
    const decision = evaluateSyntheticWardenDecisionV1({
      request: fakeRequest,
      policy: remedyPolicy(fakeRequest.capabilityRef),
      decidedAt: DECIDED_AT,
    });
    expect(authorizeReconciliationRemedyV1({
      determination: fixture.determination,
      proposal: fixture.proposal,
      request: fakeRequest,
      decision,
      authorizedAt: DECIDED_AT,
    })).toEqual({ state: "REJECTED_INPUT", reasonCode: "REMEDY_MANUAL_REVIEW_NOT_EXECUTABLE" });
  });

  it("rejects a revoked execution-time Warden checkpoint before invoking the adapter", async () => {
    const fixture = authorize("RECOVER");
    const adapter = new SyntheticRecoveryRemedyAdapterV1();
    const result = await new RemedyExecutionGateV1([adapter]).execute({
      determination: fixture.determination,
      proposal: fixture.proposal,
      grant: fixture.grant,
      checkpoint: checkpoint(fixture.grant, { state: "REVOKED" }),
      journal: new InMemoryRemedyExecutionJournalV1(),
      executedAt: EXECUTED_AT,
    });
    expect(result).toEqual({
      state: "REJECTED_INPUT",
      reasonCode: "REMEDY_EXECUTION_CHECKPOINT_NOT_VALID",
    });
    expect(adapter.invocationCount()).toBe(0);
  });

  it("executes recovery once, replays the durable receipt, verifies the remedy and supersedes append-only", async () => {
    const fixture = authorize("RECOVER");
    const adapter = new SyntheticRecoveryRemedyAdapterV1();
    const journal = new InMemoryRemedyExecutionJournalV1();
    const gate = new RemedyExecutionGateV1([adapter]);
    const executionCheckpoint = checkpoint(fixture.grant);
    const first = await gate.execute({
      determination: fixture.determination,
      proposal: fixture.proposal,
      grant: fixture.grant,
      checkpoint: executionCheckpoint,
      journal,
      executedAt: EXECUTED_AT,
    });
    expect(first.state).toBe("EXECUTED_UNVERIFIED_REMEDY");
    if (first.state !== "EXECUTED_UNVERIFIED_REMEDY") throw new Error("expected_execution");
    expect(first.receipt.remedyCheckpointRef).toBe(executionCheckpoint.checkpointRef);
    const replay = await gate.execute({
      determination: fixture.determination,
      proposal: fixture.proposal,
      grant: fixture.grant,
      checkpoint: executionCheckpoint,
      journal,
      executedAt: EXECUTED_AT,
    });
    expect(replay.state).toBe("EXECUTED_UNVERIFIED_REMEDY");
    if (replay.state !== "EXECUTED_UNVERIFIED_REMEDY") throw new Error("expected_replay");
    expect(replay.receipt.receiptRef).toBe(first.receipt.receiptRef);
    expect(replay.receipt.idempotentReplay).toBe(true);
    expect(adapter.invocationCount()).toBe(1);

    const verified = verifyRemedyEffectV1({
      expectation: expectation(),
      determination: fixture.determination,
      proposal: fixture.proposal,
      authorization: fixture.grant,
      receipt: first.receipt,
      observation: observation(
        first.receipt,
        fixture.grant,
        "SYNTHETIC-SERVICE-REQUEST-STATE:CREATED:RECOVERED",
      ),
      verifiedAt: VERIFIED_AT,
    });
    expect(verified.state).toBe("VERIFIED_REMEDY_EFFECT");
    if (verified.state !== "VERIFIED_REMEDY_EFFECT") throw new Error(verified.reasonCode);

    const closureService = new RemedyLineageClosureServiceV1();
    const closure = closureService.close({
      determination: fixture.determination,
      proposal: fixture.proposal,
      effect: verified.effect,
      sealedAt: SEALED_AT,
    });
    expect(closure.state).toBe("SEALED_AND_SUPERSEDED");
    if (closure.state !== "SEALED_AND_SUPERSEDED") throw new Error(closure.reasonCode);
    expect(closure.supersession.disposition).toBe("SUPERSEDED_BY_VERIFIED_RECOVERY");
    expect(closure.supersession.state).toBe("RESOLVED_APPEND_ONLY");
    expect(closure.supersession.settlementFinality).toBe(false);
    expect(fixture.determination.state).toBe("EXCEPTION");
  });

  it("verifies compensation only through an explicit domain compensation resolver", async () => {
    const fixture = authorize("COMPENSATE");
    const adapter = new SyntheticCompensationRemedyAdapterV1();
    const gate = new RemedyExecutionGateV1([adapter]);
    const result = await gate.execute({
      determination: fixture.determination,
      proposal: fixture.proposal,
      grant: fixture.grant,
      checkpoint: checkpoint(fixture.grant),
      journal: new InMemoryRemedyExecutionJournalV1(),
      executedAt: EXECUTED_AT,
    });
    if (result.state !== "EXECUTED_UNVERIFIED_REMEDY") throw new Error("expected_compensation");

    const withoutResolver = verifyRemedyEffectV1({
      expectation: expectation(),
      determination: fixture.determination,
      proposal: fixture.proposal,
      authorization: fixture.grant,
      receipt: result.receipt,
      observation: observation(
        result.receipt,
        fixture.grant,
        "SYNTHETIC-SERVICE-REQUEST-STATE:ABSENT:COMPENSATED",
      ),
      verifiedAt: VERIFIED_AT,
    });
    expect(withoutResolver).toEqual({
      state: "EXCEPTION",
      reasonCode: "REMEDY_EFFECT_COMPENSATION_RESOLVER_REQUIRED",
    });

    const verified = verifyRemedyEffectV1({
      expectation: expectation(),
      determination: fixture.determination,
      proposal: fixture.proposal,
      authorization: fixture.grant,
      receipt: result.receipt,
      observation: observation(
        result.receipt,
        fixture.grant,
        "SYNTHETIC-SERVICE-REQUEST-STATE:ABSENT:COMPENSATED",
      ),
      compensationResolvers: [new CompensationResolver()],
      verifiedAt: VERIFIED_AT,
    });
    expect(verified.state).toBe("VERIFIED_REMEDY_EFFECT");
  });

  it("stops after uncertain provider failure and never invokes the adapter again automatically", async () => {
    const fixture = authorize("RECOVER");
    const adapter = new FailingAdapter();
    const journal = new InMemoryRemedyExecutionJournalV1();
    const gate = new RemedyExecutionGateV1([adapter]);
    const executionCheckpoint = checkpoint(fixture.grant);
    const first = await gate.execute({
      determination: fixture.determination,
      proposal: fixture.proposal,
      grant: fixture.grant,
      checkpoint: executionCheckpoint,
      journal,
      executedAt: EXECUTED_AT,
    });
    expect(first).toMatchObject({
      state: "RECOVERY_REQUIRED",
      reasonCode: "REMEDY_PROVIDER_OUTCOME_UNCERTAIN",
      automaticRetryPermitted: false,
    });
    const second = await gate.execute({
      determination: fixture.determination,
      proposal: fixture.proposal,
      grant: fixture.grant,
      checkpoint: executionCheckpoint,
      journal,
      executedAt: EXECUTED_AT,
    });
    expect(second).toMatchObject({
      state: "RECOVERY_REQUIRED",
      reasonCode: "REMEDY_PRIOR_ATTEMPT_FAILED",
      automaticRetryPermitted: false,
    });
    expect(adapter.invocations).toBe(1);
  });
});
