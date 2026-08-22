import { createHash } from "node:crypto";

import type { ActionEnvelopeV1, EvidenceReservationV1 } from "../river/contracts.ts";
import type { WardenDecisionV1, WardenExecutionCheckpointV1 } from "../warden/contracts.ts";
import type { SynnergyzeExecutionReceiptV1 } from "./contracts.ts";
import {
  ControlledExecutionGateV1,
  type SyntheticCapabilityAdapterInputV1,
  type SyntheticCapabilityAdapterResultV1,
  type SyntheticCapabilityAdapterV1,
} from "./execution-gate.ts";
import type {
  ReconciliationDeterminationV1,
  ReconciliationRemedyProposalV1,
} from "./reconciliation-fabric.ts";
import {
  canonicalRemedyEffectBindingV1,
  type RemedyAuthorizationGrantV1,
} from "./remedy-authorization.ts";

export interface RemedyRuntimeInputV1 {
  determination: ReconciliationDeterminationV1;
  proposal: ReconciliationRemedyProposalV1;
  authorization: RemedyAuthorizationGrantV1;
  action: ActionEnvelopeV1;
  reservation: EvidenceReservationV1;
  decision: WardenDecisionV1;
  checkpoint: WardenExecutionCheckpointV1;
  executedAt: string;
}

interface RemedyExecutionContractBaseV1 {
  remedyExecutionRef: string;
  reconciliationRef: string;
  exceptionRef: string;
  proposalRef: string;
  authorizationRef: string;
  originalExecutionReceiptRef: string;
  originalReservationRef: string;
  originalWardenDecisionRef: string;
  remedyExecutionReceiptRef: string;
  remedyReservationRef: string;
  remedyWardenDecisionRef: string;
  remedyCheckpointRef: string;
  parentCorrelationId: string;
  remedyCorrelationId: string;
  capabilityRef: string;
  targetRef: string;
  executedAt: string;
  effectVerified: false;
  synthetic: true;
  idempotentReplay: boolean;
}

export interface RecoveryContractV1 extends RemedyExecutionContractBaseV1 {
  version: "RECOVERY-CONTRACT-001";
  kind: "RECOVER";
  state: "RECOVERED_UNVERIFIED";
}

export interface CompensationContractV1 extends RemedyExecutionContractBaseV1 {
  version: "COMPENSATION-CONTRACT-001";
  kind: "COMPENSATE";
  state: "COMPENSATED_UNVERIFIED";
}

export type RemedyExecutionContractV1 = RecoveryContractV1 | CompensationContractV1;

interface StoredRemedyExecutionV1 {
  fingerprint: string;
  contract: RemedyExecutionContractV1;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function authorizationDigest(actionToken: string): string {
  return `sha256:${digest(actionToken)}`;
}

function parseInstant(value: string, errorCode: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(errorCode);
  return parsed;
}

function assertBoundProposal(
  determination: ReconciliationDeterminationV1,
  proposal: ReconciliationRemedyProposalV1,
): void {
  const bound = determination.candidateRemedies.find(
    (candidate) => candidate.proposalRef === proposal.proposalRef,
  );
  if (
    !bound ||
    bound.kind !== proposal.kind ||
    bound.capabilityRef !== proposal.capabilityRef ||
    bound.reasonCode !== proposal.reasonCode ||
    bound.requiresFreshWardenDecision !== true ||
    bound.authorized !== false
  ) {
    throw new Error("remedy_runtime_proposal_not_bound");
  }
  if (proposal.kind !== "RECOVER" && proposal.kind !== "COMPENSATE") {
    throw new Error("remedy_runtime_unexecutable_kind");
  }
  const expectedCapability =
    proposal.kind === "RECOVER" ? "effect.recover" : "effect.compensate";
  if (proposal.capabilityRef !== expectedCapability) {
    throw new Error("remedy_runtime_kind_capability_mismatch");
  }
}

function assertGrantAndLineage(input: RemedyRuntimeInputV1): void {
  const {
    determination,
    proposal,
    authorization,
    action,
    reservation,
    decision,
    executedAt,
  } = input;

  if (determination.state !== "DETERMINED_UNAUTHORIZED" || determination.authorized !== false) {
    throw new Error("remedy_runtime_determination_not_unauthorized");
  }
  if (determination.synthetic !== true) {
    throw new Error("remedy_runtime_non_synthetic_determination");
  }
  assertBoundProposal(determination, proposal);

  if (authorization.state !== "AUTHORIZED_REMEDY" || authorization.synthetic !== true) {
    throw new Error("remedy_runtime_authorization_required");
  }
  if (authorization.reconciliationRef !== determination.reconciliationRef) {
    throw new Error("remedy_runtime_grant_reconciliation_mismatch");
  }
  if (authorization.proposalRef !== proposal.proposalRef) {
    throw new Error("remedy_runtime_grant_proposal_mismatch");
  }
  if (authorization.proposalKind !== proposal.kind) {
    throw new Error("remedy_runtime_grant_kind_mismatch");
  }
  if (authorization.capabilityRef !== proposal.capabilityRef) {
    throw new Error("remedy_runtime_grant_capability_mismatch");
  }
  if (authorization.targetRef !== determination.targetRef) {
    throw new Error("remedy_runtime_grant_target_mismatch");
  }
  if (authorization.parentCorrelationId !== determination.correlationId) {
    throw new Error("remedy_runtime_grant_parent_correlation_mismatch");
  }
  if (authorization.originalWardenDecisionRef !== determination.originalWardenDecisionRef) {
    throw new Error("remedy_runtime_grant_original_decision_mismatch");
  }
  if (authorization.remedyWardenDecisionRef === determination.originalWardenDecisionRef) {
    throw new Error("remedy_runtime_fresh_decision_required");
  }

  if (action.wardenDecisionRef === determination.originalWardenDecisionRef) {
    throw new Error("remedy_runtime_fresh_decision_required");
  }
  if (action.wardenDecisionRef !== authorization.remedyWardenDecisionRef) {
    throw new Error("remedy_runtime_grant_decision_mismatch");
  }
  if (action.requestRef !== authorization.remedyWardenRequestRef) {
    throw new Error("remedy_runtime_grant_request_mismatch");
  }
  if (action.programRef !== determination.programRef) {
    throw new Error("remedy_runtime_program_mismatch");
  }
  if (action.eventRef !== determination.eventRef) {
    throw new Error("remedy_runtime_event_mismatch");
  }
  if (action.targetRef !== determination.targetRef || action.targetRef !== authorization.targetRef) {
    throw new Error("remedy_runtime_target_mismatch");
  }
  if (action.capabilityRef !== proposal.capabilityRef || action.action !== proposal.capabilityRef) {
    throw new Error("remedy_runtime_capability_mismatch");
  }
  if (action.correlationId === determination.correlationId) {
    throw new Error("remedy_runtime_fresh_correlation_required");
  }
  if (action.correlationId !== authorization.remedyCorrelationId) {
    throw new Error("remedy_runtime_grant_correlation_mismatch");
  }
  const expectedEffect = canonicalRemedyEffectBindingV1(determination, proposal);
  if (action.requestedEffect !== expectedEffect) {
    throw new Error("remedy_runtime_effect_binding_mismatch");
  }
  if (authorization.actionTokenDigest !== authorizationDigest(action.actionToken)) {
    throw new Error("remedy_runtime_action_token_mismatch");
  }

  if (decision.decisionRef !== authorization.remedyWardenDecisionRef) {
    throw new Error("remedy_runtime_decision_mismatch");
  }
  if (decision.validUntil !== authorization.validUntil) {
    throw new Error("remedy_runtime_decision_window_mismatch");
  }

  if (reservation.reservationRef === determination.reservationRef) {
    throw new Error("remedy_runtime_fresh_reservation_required");
  }

  const reconciled = parseInstant(
    determination.reconciledAt,
    "remedy_runtime_invalid_reconciliation_time",
  );
  const authorized = parseInstant(
    authorization.authorizedAt,
    "remedy_runtime_invalid_authorization_time",
  );
  const validUntil = parseInstant(
    authorization.validUntil,
    "remedy_runtime_invalid_authorization_validity",
  );
  const executed = parseInstant(executedAt, "remedy_runtime_invalid_execution_time");
  if (authorized < reconciled) {
    throw new Error("remedy_runtime_authorized_before_reconciliation");
  }
  if (validUntil < authorized) {
    throw new Error("remedy_runtime_invalid_authorization_window");
  }
  if (executed < authorized) {
    throw new Error("remedy_runtime_execution_before_authorization");
  }
  if (executed > validUntil) {
    throw new Error("remedy_runtime_authorization_expired");
  }
}

function remedyFingerprint(input: RemedyRuntimeInputV1): string {
  return digest(JSON.stringify({
    determination: {
      reconciliationRef: input.determination.reconciliationRef,
      exceptionRef: input.determination.exceptionRef,
      sourceDigest: input.determination.sourceDigest,
      originalExecutionReceiptRef: input.determination.executionReceiptRef,
      originalReservationRef: input.determination.reservationRef,
      originalWardenDecisionRef: input.determination.originalWardenDecisionRef,
      parentCorrelationId: input.determination.correlationId,
    },
    proposal: input.proposal,
    authorization: input.authorization,
    action: {
      ...input.action,
      actionToken: authorizationDigest(input.action.actionToken),
    },
    reservation: input.reservation,
    decision: {
      ...input.decision,
      actionToken:
        input.decision.decision === "ALLOW"
          ? authorizationDigest(input.decision.actionToken)
          : null,
    },
    checkpoint: input.checkpoint,
    executedAt: input.executedAt,
  }));
}

function buildContract(
  input: RemedyRuntimeInputV1,
  receipt: SynnergyzeExecutionReceiptV1,
): RemedyExecutionContractV1 {
  const base = {
    remedyExecutionRef: `REMEDY-EXECUTION:${digest(
      `${input.authorization.authorizationRef}|${receipt.receiptRef}`,
    ).slice(0, 24)}`,
    reconciliationRef: input.determination.reconciliationRef,
    exceptionRef: input.determination.exceptionRef,
    proposalRef: input.proposal.proposalRef,
    authorizationRef: input.authorization.authorizationRef,
    originalExecutionReceiptRef: input.determination.executionReceiptRef,
    originalReservationRef: input.determination.reservationRef,
    originalWardenDecisionRef: input.determination.originalWardenDecisionRef,
    remedyExecutionReceiptRef: receipt.receiptRef,
    remedyReservationRef: receipt.reservationRef,
    remedyWardenDecisionRef: receipt.wardenDecisionRef,
    remedyCheckpointRef: receipt.checkpointRef,
    parentCorrelationId: input.determination.correlationId,
    remedyCorrelationId: receipt.correlationId,
    capabilityRef: receipt.capabilityRef,
    targetRef: receipt.targetRef,
    executedAt: receipt.executedAt,
    effectVerified: false,
    synthetic: true,
    idempotentReplay: false,
  } as const;

  return input.proposal.kind === "RECOVER"
    ? {
        ...base,
        version: "RECOVERY-CONTRACT-001",
        kind: "RECOVER",
        state: "RECOVERED_UNVERIFIED",
      }
    : {
        ...base,
        version: "COMPENSATION-CONTRACT-001",
        kind: "COMPENSATE",
        state: "COMPENSATED_UNVERIFIED",
      };
}

export class RemedyRuntimeV1 {
  private readonly executionGate: ControlledExecutionGateV1;
  private readonly byAuthorizationRef = new Map<string, StoredRemedyExecutionV1>();
  private readonly authorizationRefByCorrelation = new Map<string, string>();

  constructor(adapters: readonly SyntheticCapabilityAdapterV1[]) {
    this.executionGate = new ControlledExecutionGateV1(adapters);
  }

  execute(input: RemedyRuntimeInputV1): RemedyExecutionContractV1 {
    assertGrantAndLineage(input);
    const fingerprint = remedyFingerprint(input);
    const existing = this.byAuthorizationRef.get(input.authorization.authorizationRef);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error("remedy_runtime_idempotency_conflict");
      }
      return { ...existing.contract, idempotentReplay: true };
    }

    const correlatedAuthorization = this.authorizationRefByCorrelation.get(
      input.authorization.remedyCorrelationId,
    );
    if (
      correlatedAuthorization &&
      correlatedAuthorization !== input.authorization.authorizationRef
    ) {
      throw new Error("remedy_runtime_correlation_conflict");
    }

    const receipt = this.executionGate.execute({
      action: input.action,
      reservation: input.reservation,
      decision: input.decision,
      checkpoint: input.checkpoint,
      executedAt: input.executedAt,
    });
    const contract = buildContract(input, receipt);
    this.byAuthorizationRef.set(input.authorization.authorizationRef, {
      fingerprint,
      contract,
    });
    this.authorizationRefByCorrelation.set(
      input.authorization.remedyCorrelationId,
      input.authorization.authorizationRef,
    );
    return { ...contract };
  }

  executionCount(): number {
    return this.byAuthorizationRef.size;
  }

  executions(): readonly RemedyExecutionContractV1[] {
    return [...this.byAuthorizationRef.values()].map(({ contract }) => ({ ...contract }));
  }
}

export class SyntheticRecoveryAdapterV1 implements SyntheticCapabilityAdapterV1 {
  readonly adapterRef = "SYNTHETIC-RECOVERY-ADAPTER-001";
  readonly capabilityRef = "effect.recover";
  private invocations = 0;

  execute(input: SyntheticCapabilityAdapterInputV1): SyntheticCapabilityAdapterResultV1 {
    if (input.action.capabilityRef !== this.capabilityRef) {
      throw new Error("synthetic_recovery_adapter_capability_mismatch");
    }
    this.invocations += 1;
    const resultIdentity = digest([
      input.action.actionRef,
      input.reservation.reservationRef,
      input.action.targetRef,
      input.action.correlationId,
    ].join("|")).slice(0, 24);
    return { adapterResultRef: `SYNTHETIC-RECOVERY-RESULT:${resultIdentity}` };
  }

  invocationCount(): number {
    return this.invocations;
  }
}

export class SyntheticCompensationAdapterV1 implements SyntheticCapabilityAdapterV1 {
  readonly adapterRef = "SYNTHETIC-COMPENSATION-ADAPTER-001";
  readonly capabilityRef = "effect.compensate";
  private invocations = 0;

  execute(input: SyntheticCapabilityAdapterInputV1): SyntheticCapabilityAdapterResultV1 {
    if (input.action.capabilityRef !== this.capabilityRef) {
      throw new Error("synthetic_compensation_adapter_capability_mismatch");
    }
    this.invocations += 1;
    const resultIdentity = digest([
      input.action.actionRef,
      input.reservation.reservationRef,
      input.action.targetRef,
      input.action.correlationId,
    ].join("|")).slice(0, 24);
    return { adapterResultRef: `SYNTHETIC-COMPENSATION-RESULT:${resultIdentity}` };
  }

  invocationCount(): number {
    return this.invocations;
  }
}
