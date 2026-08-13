import {
  AlphaRc1Harness,
  RC1_IDENTITIES,
  type Rc1ActionAttemptResult,
  type Rc1Capability,
  type Rc1EvidenceEntry,
} from "../rc1/runtime.js";
import { AgentRuntime } from "./runtime.js";

export interface AgentActionProposal {
  proposalRef: string;
  sessionId: string;
  agentId: string;
  issuanceId: string;
  bindingRef: string;
  modelRef: string;
  requestedCapability: string;
  requiresWardenDecision: boolean;
  authorized: boolean;
  actionToken?: string;
}

export interface AgentActionRequest {
  proposal: AgentActionProposal;
  correlationId: string;
  actorRef: string;
  representedEntityRef: string;
}

export interface AgentActionExecutionOptions {
  omitWardenDecision?: boolean;
  omitEvidenceReservation?: boolean;
  failEvidenceReservation?: boolean;
  injectReadMismatch?: boolean;
}

export type AgentActionBoundaryStatus =
  | Rc1ActionAttemptResult["status"]
  | "BOUNDARY_DENIED"
  | "IDEMPOTENCY_CONFLICT";

export interface AgentActionCausalEnvelope {
  envelopeRef: string;
  programRef: string;
  proposalRef: string;
  sessionId: string;
  agentId: string;
  issuanceId: string;
  modelBindingRef: string;
  modelRef: string;
  actorRef: string;
  representedEntityRef: string;
  capability: string;
  correlationId: string;
  wardenDecisionRef?: string;
  wardenDecisionStatus?: "ALLOW" | "DENY";
  actionTokenIssued: boolean;
  boundaryEvidenceRef?: string;
  riverEvidenceRefs: string[];
  evidenceReservationRef?: string;
  connectorReceiptRef?: string;
  serviceRequestRef?: string;
  effectRef?: string;
  result: AgentActionBoundaryStatus;
  reason?: string;
  realWorldEffectOccurred: false;
}

export interface AgentActionBoundaryResult {
  status: AgentActionBoundaryStatus;
  reason?: string;
  boundaryReplay: boolean;
  baseAttempt?: Rc1ActionAttemptResult;
  causalEnvelope: AgentActionCausalEnvelope;
}

interface CompletedAttempt {
  fingerprint: string;
  result: AgentActionBoundaryResult;
}

function cloneEnvelope(envelope: AgentActionCausalEnvelope): AgentActionCausalEnvelope {
  return { ...envelope, riverEvidenceRefs: [...envelope.riverEvidenceRefs] };
}

function cloneResult(result: AgentActionBoundaryResult): AgentActionBoundaryResult {
  return {
    ...result,
    baseAttempt: result.baseAttempt
      ? {
          ...result.baseAttempt,
          decision: result.baseAttempt.decision ? { ...result.baseAttempt.decision } : undefined,
          receipt: result.baseAttempt.receipt ? { ...result.baseAttempt.receipt } : undefined,
        }
      : undefined,
    causalEnvelope: cloneEnvelope(result.causalEnvelope),
  };
}

function requestFingerprint(request: AgentActionRequest): string {
  const proposal = request.proposal;
  return [
    proposal.proposalRef,
    proposal.sessionId,
    proposal.agentId,
    proposal.issuanceId,
    proposal.bindingRef,
    proposal.modelRef,
    proposal.requestedCapability,
    String(proposal.requiresWardenDecision),
    String(proposal.authorized),
    proposal.actionToken ?? "",
    request.actorRef,
    request.representedEntityRef,
  ].join("|");
}

function isRc1Capability(value: string): value is Rc1Capability {
  return value === "service_request.create" || value === "contract.execute";
}

export class AgentActionBoundary {
  private readonly runtime: AgentRuntime;
  private readonly rc1: AlphaRc1Harness;
  private readonly fingerprints = new Map<string, string>();
  private readonly completed = new Map<string, CompletedAttempt>();
  private readonly trace: AgentActionCausalEnvelope[] = [];

  constructor(runtime: AgentRuntime, rc1Harness: AlphaRc1Harness = new AlphaRc1Harness()) {
    this.runtime = runtime;
    this.rc1 = rc1Harness;
  }

  private boundaryDenied(request: AgentActionRequest, reason: string): AgentActionBoundaryResult {
    const envelope: AgentActionCausalEnvelope = {
      envelopeRef: `AGENT-ACTION-CAUSAL:${request.correlationId}`,
      programRef: RC1_IDENTITIES.programRef,
      proposalRef: request.proposal.proposalRef,
      sessionId: request.proposal.sessionId,
      agentId: request.proposal.agentId,
      issuanceId: request.proposal.issuanceId,
      modelBindingRef: request.proposal.bindingRef,
      modelRef: request.proposal.modelRef,
      actorRef: request.actorRef,
      representedEntityRef: request.representedEntityRef,
      capability: request.proposal.requestedCapability,
      correlationId: request.correlationId,
      actionTokenIssued: false,
      boundaryEvidenceRef: `AGENT-ACTION-BOUNDARY-EVIDENCE:${request.correlationId}`,
      riverEvidenceRefs: [],
      result: "BOUNDARY_DENIED",
      reason,
      realWorldEffectOccurred: false,
    };
    this.trace.push(envelope);
    return {
      status: "BOUNDARY_DENIED",
      reason,
      boundaryReplay: false,
      causalEnvelope: cloneEnvelope(envelope),
    };
  }

  private conflict(request: AgentActionRequest): AgentActionBoundaryResult {
    const envelope: AgentActionCausalEnvelope = {
      envelopeRef: `AGENT-ACTION-CAUSAL:${request.correlationId}:CONFLICT`,
      programRef: RC1_IDENTITIES.programRef,
      proposalRef: request.proposal.proposalRef,
      sessionId: request.proposal.sessionId,
      agentId: request.proposal.agentId,
      issuanceId: request.proposal.issuanceId,
      modelBindingRef: request.proposal.bindingRef,
      modelRef: request.proposal.modelRef,
      actorRef: request.actorRef,
      representedEntityRef: request.representedEntityRef,
      capability: request.proposal.requestedCapability,
      correlationId: request.correlationId,
      actionTokenIssued: false,
      boundaryEvidenceRef: `AGENT-ACTION-IDEMPOTENCY-CONFLICT:${request.correlationId}`,
      riverEvidenceRefs: [],
      result: "IDEMPOTENCY_CONFLICT",
      reason: "agent_action_idempotency_conflict",
      realWorldEffectOccurred: false,
    };
    this.trace.push(envelope);
    return {
      status: "IDEMPOTENCY_CONFLICT",
      reason: envelope.reason,
      boundaryReplay: false,
      causalEnvelope: cloneEnvelope(envelope),
    };
  }

  execute(
    request: AgentActionRequest,
    options: AgentActionExecutionOptions = {},
  ): AgentActionBoundaryResult {
    const authority = this.runtime.authorityEnvelope();
    const proposal = request.proposal;

    // Current state is checked before replay lookup so a proposal prepared before
    // revocation can never be used as a post-revocation execution loophole.
    if (this.runtime.state() !== "ACTIVE") {
      return this.boundaryDenied(request, "agent_issuance_revoked");
    }

    if (request.actorRef !== authority.requesterRef) {
      return this.boundaryDenied(request, "agent_action_actor_mismatch");
    }
    if (request.representedEntityRef !== authority.representedEntityRef) {
      return this.boundaryDenied(request, "agent_action_represented_entity_mismatch");
    }
    if (proposal.agentId !== authority.agentId || proposal.issuanceId !== authority.issuanceId) {
      return this.boundaryDenied(request, "agent_action_identity_mismatch");
    }
    if (
      proposal.authorized !== false ||
      proposal.requiresWardenDecision !== true ||
      Boolean(proposal.actionToken)
    ) {
      return this.boundaryDenied(request, "model_self_authorization_forbidden");
    }

    const binding = this.runtime
      .bindingHistory()
      .find((candidate) => candidate.bindingRef === proposal.bindingRef);
    if (!binding || binding.modelRef !== proposal.modelRef) {
      return this.boundaryDenied(request, "proposal_binding_not_in_agent_lineage");
    }

    if (!isRc1Capability(proposal.requestedCapability)) {
      return this.boundaryDenied(request, "unsupported_agent_action_capability");
    }

    // A capability outside the Warden-issued Agent envelope is rejected before
    // connector admission. The canonical forbidden contract path is still sent
    // through RC1 because RC1's Warden explicitly DENYs and evidences it.
    if (
      proposal.requestedCapability !== "contract.execute" &&
      !authority.allowedCapabilities.includes(proposal.requestedCapability)
    ) {
      return this.boundaryDenied(request, "capability_outside_agent_issuance");
    }

    const fingerprint = requestFingerprint(request);
    const existingFingerprint = this.fingerprints.get(request.correlationId);
    if (existingFingerprint && existingFingerprint !== fingerprint) {
      return this.conflict(request);
    }

    const completed = this.completed.get(request.correlationId);
    if (completed) {
      const replay = cloneResult(completed.result);
      replay.boundaryReplay = true;
      replay.causalEnvelope = {
        ...replay.causalEnvelope,
        envelopeRef: `${replay.causalEnvelope.envelopeRef}:REPLAY`,
      };
      this.trace.push(cloneEnvelope(replay.causalEnvelope));
      return replay;
    }

    this.fingerprints.set(request.correlationId, fingerprint);

    if (options.failEvidenceReservation) {
      this.rc1.failNextEvidenceReservation();
    }

    const baseAttempt = this.rc1.attempt(
      proposal.requestedCapability,
      request.correlationId,
      {
        omitDecision: options.omitWardenDecision,
        omitEvidenceReservation: options.omitEvidenceReservation,
        injectReadMismatch: options.injectReadMismatch,
      },
    );

    const riverEvidenceRefs = this.rc1
      .riverEntries()
      .filter((entry) => entry.correlationId === request.correlationId)
      .map((entry) => entry.evidenceRef);

    const envelope: AgentActionCausalEnvelope = {
      envelopeRef: `AGENT-ACTION-CAUSAL:${request.correlationId}`,
      programRef: RC1_IDENTITIES.programRef,
      proposalRef: proposal.proposalRef,
      sessionId: proposal.sessionId,
      agentId: proposal.agentId,
      issuanceId: proposal.issuanceId,
      modelBindingRef: proposal.bindingRef,
      modelRef: proposal.modelRef,
      actorRef: request.actorRef,
      representedEntityRef: request.representedEntityRef,
      capability: proposal.requestedCapability,
      correlationId: request.correlationId,
      wardenDecisionRef: baseAttempt.decision?.decisionRef,
      wardenDecisionStatus: baseAttempt.decision?.status,
      actionTokenIssued: Boolean(baseAttempt.decision?.actionToken),
      riverEvidenceRefs,
      evidenceReservationRef: baseAttempt.evidenceReservationRef,
      connectorReceiptRef: baseAttempt.receipt?.receiptRef,
      serviceRequestRef: baseAttempt.receipt?.serviceRequestRef,
      effectRef: baseAttempt.effectRef,
      result: baseAttempt.status,
      reason: baseAttempt.reason,
      realWorldEffectOccurred: false,
    };

    const result: AgentActionBoundaryResult = {
      status: baseAttempt.status,
      reason: baseAttempt.reason,
      boundaryReplay: false,
      baseAttempt: {
        ...baseAttempt,
        decision: baseAttempt.decision ? { ...baseAttempt.decision } : undefined,
        receipt: baseAttempt.receipt ? { ...baseAttempt.receipt } : undefined,
      },
      causalEnvelope: cloneEnvelope(envelope),
    };

    this.trace.push(envelope);

    if (baseAttempt.status === "VERIFIED" || baseAttempt.status === "DENIED") {
      this.completed.set(request.correlationId, {
        fingerprint,
        result: cloneResult(result),
      });
    }

    return result;
  }

  gatewayRequestCount(): number {
    return this.rc1.gatewayRequestCount();
  }

  riverEntries(): Rc1EvidenceEntry[] {
    return this.rc1.riverEntries();
  }

  causalTrace(): AgentActionCausalEnvelope[] {
    return this.trace.map(cloneEnvelope);
  }
}
