import { createHash } from "node:crypto";

import type {
  AgentRuntime,
  ModelInvocationProposal,
  WardenAuthorityEnvelope,
} from "./runtime.ts";
import {
  AlphaRc1Harness,
  type Rc1ActionAttemptResult,
  type Rc1Capability,
  type Rc1EvidenceEntry,
} from "../rc1/runtime.ts";

export interface AgentActionContextV1 {
  actorRef: string;
  representedEntityRef: string;
  actingCapacityRef: string;
  programRef: "ALPHA-RC1-PROGRAM-001";
  targetRef: string;
  correlationId: string;
}

export interface AgentActionIntentV1 {
  intentRef: string;
  proposalRef: string;
  agentId: string;
  issuanceId: string;
  modelBindingRef: string;
  modelRef: string;
  actorRef: string;
  representedEntityRef: string;
  actingCapacityRef: string;
  programRef: "ALPHA-RC1-PROGRAM-001";
  capability: Rc1Capability;
  targetRef: string;
  correlationId: string;
  authorized: false;
  actionToken?: undefined;
}

export type AgentControlledActionStateV1 =
  | "VERIFIED_EFFECT"
  | "DENIED"
  | "BLOCKED_REQUIREMENT"
  | "EXCEPTION";

export interface AgentActionCausalEnvelopeV1 {
  proposalRef: string;
  intentRef: string;
  agentId: string;
  issuanceId: string;
  modelBindingRef: string;
  modelRef: string;
  actorRef: string;
  representedEntityRef: string;
  actingCapacityRef: string;
  targetRef: string;
  capability: Rc1Capability;
  correlationRef: string;
  wardenDecisionRef?: string;
  actionTokenPresent: boolean;
  riverReservationRef?: string;
  riverSealRef?: string;
  riverDeniedOrExceptionRef?: string;
  connectorReceiptRef?: string;
  serviceRequestRef?: string;
  effectRef?: string;
  resultState: AgentControlledActionStateV1;
  idempotentReplay: boolean;
  synthetic: true;
}

export interface AgentControlledActionResultV1 {
  intent: AgentActionIntentV1;
  causalEnvelope: AgentActionCausalEnvelopeV1;
}

interface ProposalMemoV1 {
  fingerprint: string;
  result: AgentControlledActionResultV1;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function proposalFingerprint(
  proposal: ModelInvocationProposal,
  context: AgentActionContextV1,
): string {
  return digest(
    JSON.stringify({
      proposalRef: proposal.proposalRef,
      sessionId: proposal.sessionId,
      agentId: proposal.agentId,
      issuanceId: proposal.issuanceId,
      bindingRef: proposal.bindingRef,
      modelRef: proposal.modelRef,
      requestedCapability: proposal.requestedCapability,
      output: proposal.output,
      context,
    }),
  );
}

function cloneResult(result: AgentControlledActionResultV1): AgentControlledActionResultV1 {
  return {
    intent: { ...result.intent },
    causalEnvelope: { ...result.causalEnvelope },
  };
}

function mapCapability(capability: string): Rc1Capability {
  if (capability === "service_request.create" || capability === "contract.execute") {
    return capability;
  }
  throw new Error(`agent_action_capability_not_supported:${capability}`);
}

function expectedRc1Target(capability: Rc1Capability): string {
  return capability === "service_request.create" ? "LAB-SERVICE-DESK-001" : "LAB-CONTRACT-001";
}

function evidenceForCorrelation(
  entries: readonly Rc1EvidenceEntry[],
  correlationId: string,
): Rc1EvidenceEntry[] {
  return entries.filter((entry) => entry.correlationId === correlationId);
}

function assertProposalIsUnauthorized(proposal: ModelInvocationProposal): void {
  const unsafe = proposal as ModelInvocationProposal & {
    authorized?: unknown;
    actionToken?: unknown;
  };
  if (unsafe.authorized !== false) {
    throw new Error("agent_model_proposal_must_be_unauthorized");
  }
  if (unsafe.actionToken !== undefined) {
    throw new Error("agent_model_self_declared_action_token_rejected");
  }
  if (proposal.requiresWardenDecision !== true) {
    throw new Error("agent_proposal_warden_decision_required");
  }
}

function assertProposalBoundToRuntime(
  runtime: AgentRuntime,
  proposal: ModelInvocationProposal,
  context: AgentActionContextV1,
  issuance: WardenAuthorityEnvelope,
): void {
  if (runtime.state() !== "ACTIVE") {
    throw new Error("agent_runtime_not_active");
  }
  if (proposal.agentId !== issuance.agentId) {
    throw new Error("agent_action_agent_identity_mismatch");
  }
  if (proposal.issuanceId !== issuance.issuanceId) {
    throw new Error("agent_action_issuance_mismatch");
  }
  if (context.actorRef !== issuance.requesterRef) {
    throw new Error("agent_action_requester_mismatch");
  }
  if (context.representedEntityRef !== issuance.representedEntityRef) {
    throw new Error("agent_action_represented_entity_mismatch");
  }

  const capability = mapCapability(proposal.requestedCapability);
  if (context.targetRef !== expectedRc1Target(capability)) {
    throw new Error("agent_action_target_mismatch");
  }

  const binding = runtime
    .bindingHistory()
    .find((candidate) => candidate.bindingRef === proposal.bindingRef);
  if (!binding) {
    throw new Error("agent_action_binding_not_in_agent_lineage");
  }
  if (
    binding.agentId !== issuance.agentId ||
    binding.issuanceId !== issuance.issuanceId ||
    binding.representedEntityRef !== issuance.representedEntityRef ||
    binding.modelRef !== proposal.modelRef ||
    binding.authorityFingerprint !== issuance.authorityFingerprint
  ) {
    throw new Error("agent_action_binding_identity_or_authority_drift");
  }

  if (!issuance.allowedCapabilities.includes(proposal.requestedCapability)) {
    if (!issuance.deniedCapabilities.includes(proposal.requestedCapability)) {
      throw new Error("agent_action_capability_outside_issuance");
    }
  }
}

function actionIntent(
  proposal: ModelInvocationProposal,
  context: AgentActionContextV1,
): AgentActionIntentV1 {
  const capability = mapCapability(proposal.requestedCapability);
  const identity = digest(
    [
      proposal.proposalRef,
      proposal.agentId,
      proposal.issuanceId,
      proposal.bindingRef,
      context.actorRef,
      context.representedEntityRef,
      context.actingCapacityRef,
      context.programRef,
      capability,
      context.targetRef,
      context.correlationId,
    ].join("|"),
  ).slice(0, 24);

  return {
    intentRef: `AGENT-ACTION-INTENT:${identity}`,
    proposalRef: proposal.proposalRef,
    agentId: proposal.agentId,
    issuanceId: proposal.issuanceId,
    modelBindingRef: proposal.bindingRef,
    modelRef: proposal.modelRef,
    actorRef: context.actorRef,
    representedEntityRef: context.representedEntityRef,
    actingCapacityRef: context.actingCapacityRef,
    programRef: context.programRef,
    capability,
    targetRef: context.targetRef,
    correlationId: context.correlationId,
    authorized: false,
    actionToken: undefined,
  };
}

function resultState(result: Rc1ActionAttemptResult): AgentControlledActionStateV1 {
  if (result.status === "VERIFIED") return "VERIFIED_EFFECT";
  if (result.status === "DENIED" || result.status === "MISSING_AUTHORIZATION") return "DENIED";
  if (result.status === "BLOCKED_REQUIREMENT") return "BLOCKED_REQUIREMENT";
  return "EXCEPTION";
}

export class AgentActionGatewayBridgeV1 {
  private readonly harness: AlphaRc1Harness;
  private readonly proposalMemos = new Map<string, ProposalMemoV1>();
  private readonly proposalRefByCorrelation = new Map<string, string>();

  constructor(harness = new AlphaRc1Harness()) {
    this.harness = harness;
  }

  execute(input: {
    runtime: AgentRuntime;
    proposal: ModelInvocationProposal;
    context: AgentActionContextV1;
    options?: {
      omitEvidenceReservation?: boolean;
      injectReadMismatch?: boolean;
    };
  }): AgentControlledActionResultV1 {
    const { runtime, proposal, context } = input;
    const issuance = runtime.authorityEnvelope();

    assertProposalIsUnauthorized(proposal);
    assertProposalBoundToRuntime(runtime, proposal, context, issuance);

    const fingerprint = proposalFingerprint(proposal, context);
    const existing = this.proposalMemos.get(proposal.proposalRef);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new Error("agent_action_proposal_idempotency_conflict");
      }
      return {
        ...cloneResult(existing.result),
        causalEnvelope: {
          ...existing.result.causalEnvelope,
          idempotentReplay: true,
        },
      };
    }

    const correlatedProposal = this.proposalRefByCorrelation.get(context.correlationId);
    if (correlatedProposal && correlatedProposal !== proposal.proposalRef) {
      throw new Error("agent_action_correlation_conflict");
    }

    const intent = actionIntent(proposal, context);
    const attempt = this.harness.attempt(intent.capability, context.correlationId, {
      omitEvidenceReservation: input.options?.omitEvidenceReservation,
      injectReadMismatch: input.options?.injectReadMismatch,
    });
    const evidence = evidenceForCorrelation(this.harness.riverEntries(), context.correlationId);
    const reservation = evidence.find((entry) => entry.stage === "RESERVED");
    const seal = evidence.find((entry) => entry.stage === "SEALED");
    const deniedOrException = [...evidence]
      .reverse()
      .find((entry) => entry.stage === "DENIED" || entry.stage === "EXCEPTION");

    const causalEnvelope: AgentActionCausalEnvelopeV1 = {
      proposalRef: proposal.proposalRef,
      intentRef: intent.intentRef,
      agentId: proposal.agentId,
      issuanceId: proposal.issuanceId,
      modelBindingRef: proposal.bindingRef,
      modelRef: proposal.modelRef,
      actorRef: context.actorRef,
      representedEntityRef: context.representedEntityRef,
      actingCapacityRef: context.actingCapacityRef,
      targetRef: context.targetRef,
      capability: intent.capability,
      correlationRef: context.correlationId,
      wardenDecisionRef: attempt.decision?.decisionRef,
      actionTokenPresent: Boolean(attempt.decision?.actionToken),
      riverReservationRef: reservation?.evidenceRef,
      riverSealRef: seal?.evidenceRef,
      riverDeniedOrExceptionRef: deniedOrException?.evidenceRef,
      connectorReceiptRef: attempt.receipt?.receiptRef,
      serviceRequestRef: attempt.receipt?.serviceRequestRef,
      effectRef: attempt.effectRef,
      resultState: resultState(attempt),
      idempotentReplay: Boolean(attempt.receipt?.idempotentReplay),
      synthetic: true,
    };
    const result = { intent, causalEnvelope };
    this.proposalMemos.set(proposal.proposalRef, { fingerprint, result: cloneResult(result) });
    this.proposalRefByCorrelation.set(context.correlationId, proposal.proposalRef);
    return cloneResult(result);
  }

  gatewayRequestCount(): number {
    return this.harness.gatewayRequestCount();
  }

  riverEntries(): Rc1EvidenceEntry[] {
    return this.harness.riverEntries();
  }
}
