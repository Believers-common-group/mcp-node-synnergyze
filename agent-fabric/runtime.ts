export const AGENT_RC1_IDENTITIES = {
  representedEntityRef: "LAB-COMPANY-001",
  requesterRef: "DIGITALME-ALPHA-TEST-001",
  packRef: "AGENT-PACK-COMPANY-BASE-001@1.0.0",
  agentId: "AGENT-LAB-COMPANY-001",
  issuanceId: "AGENT-ISSUANCE-LAB-COMPANY-001",
  wardenRef: "WARDEN-ALPHA-RC1-001",
  modelABindingRef: "MODEL-BINDING-A-001",
  modelBBindingRef: "MODEL-BINDING-B-001",
} as const;

export type AgentIssuanceDecision = "ALLOW" | "ESCALATE" | "DENY";
export type ModelBindingDecisionStatus = "ALLOW" | "DENY";
export type AgentRuntimeState = "ACTIVE" | "REVOKED";
export type ModelBindingState = "ACTIVE" | "SUPERSEDED";

export interface WardenIssuanceRequest {
  requesterRef: string;
  representedEntityRef: string;
  packRef: string;
  requestedAgentId: string;
  requestedIssuanceId: string;
  requestedCapabilities: readonly string[];
  requestedAt: string;
}

export interface WardenAuthorityEnvelope {
  agentId: string;
  issuanceId: string;
  representedEntityRef: string;
  requesterRef: string;
  packRef: string;
  wardenRef: string;
  issuanceDecisionRef: string;
  decision: "ALLOW";
  allowedCapabilities: readonly string[];
  deniedCapabilities: readonly string[];
  validFrom: string;
  validUntil: string;
  issuedAt: string;
  lifecycleState: "ACTIVE";
  authorityFingerprint: string;
}

export interface AgentIssuanceResult {
  decision: AgentIssuanceDecision;
  decisionRef: string;
  reason: string;
  envelope?: WardenAuthorityEnvelope;
}

export interface WardenBindingDecision {
  decisionRef: string;
  wardenRef: string;
  decision: ModelBindingDecisionStatus;
  agentId: string;
  issuanceId: string;
  adapterRef: string;
  authorityFingerprint: string;
  reason: string;
}

export interface WardenRevocationDecision {
  decisionRef: string;
  wardenRef: string;
  agentId: string;
  issuanceId: string;
  authorityFingerprint: string;
  revokedAt: string;
  reason: string;
}

export interface ModelInvocationContext {
  sessionId: string;
  sequence: number;
  prompt: string;
  requestedCapability: string;
}

export interface ModelAdapter {
  adapterRef: string;
  providerRef: string;
  modelRef: string;
  invoke(context: ModelInvocationContext): string;
}

export interface AgentBindingIdentityGuard {
  agentId: string;
  issuanceId: string;
  representedEntityRef: string;
  authorityFingerprint: string;
}

export interface ModelBinding {
  bindingRef: string;
  bindingVersion: number;
  agentId: string;
  issuanceId: string;
  representedEntityRef: string;
  authorityFingerprint: string;
  adapterRef: string;
  providerRef: string;
  modelRef: string;
  purpose: string;
  capabilityProfile: readonly string[];
  activatedAt: string;
  lifecycleState: ModelBindingState;
  predecessorBindingRef?: string;
  changeDecisionRef: string;
  idempotencyKey: string;
}

export interface AgentSessionSnapshot {
  sessionId: string;
  agentId: string;
  issuanceId: string;
  openedAt: string;
  invocationSequence: number;
  continuityRef: string;
}

export interface ModelInvocationProposal {
  proposalRef: string;
  sessionId: string;
  agentId: string;
  issuanceId: string;
  bindingRef: string;
  modelRef: string;
  requestedCapability: string;
  output: string;
  requiresWardenDecision: true;
  authorized: false;
  actionToken?: undefined;
}

export interface ActivateAgentRuntimeInput {
  issuance?: WardenAuthorityEnvelope;
  initialBindingRef: string;
  initialBindingDecision: WardenBindingDecision;
  adapterRegistry: readonly ModelAdapter[];
  purpose: string;
  capabilityProfile: readonly string[];
  activatedAt: string;
  idempotencyKey: string;
}

export interface SwapModelInput {
  bindingRef: string;
  bindingDecision: WardenBindingDecision;
  identityGuard: AgentBindingIdentityGuard;
  purpose: string;
  capabilityProfile: readonly string[];
  activatedAt: string;
  idempotencyKey: string;
}

interface MutableSession {
  sessionId: string;
  openedAt: string;
  invocationSequence: number;
  continuityRef: string;
}

interface SwapMemo {
  bindingRef: string;
  requestFingerprint: string;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function immutableStrings(values: readonly string[]): readonly string[] {
  return Object.freeze(uniqueStrings(values));
}

function makeAuthorityFingerprint(input: {
  agentId: string;
  issuanceId: string;
  representedEntityRef: string;
  requesterRef: string;
  packRef: string;
  allowedCapabilities: readonly string[];
  deniedCapabilities: readonly string[];
  validFrom: string;
  validUntil: string;
}): string {
  return [
    "AF-AUTH-V1",
    input.agentId,
    input.issuanceId,
    input.representedEntityRef,
    input.requesterRef,
    input.packRef,
    [...input.allowedCapabilities].sort().join(","),
    [...input.deniedCapabilities].sort().join(","),
    input.validFrom,
    input.validUntil,
  ].join("|");
}

function makeSwapRequestFingerprint(input: SwapModelInput): string {
  return [
    input.bindingRef,
    input.bindingDecision.adapterRef,
    input.bindingDecision.decisionRef,
    input.identityGuard.agentId,
    input.identityGuard.issuanceId,
    input.identityGuard.representedEntityRef,
    input.identityGuard.authorityFingerprint,
    input.purpose,
    [...input.capabilityProfile].sort().join(","),
    input.activatedAt,
  ].join("|");
}

function cloneBinding(binding: ModelBinding): ModelBinding {
  return { ...binding, capabilityProfile: [...binding.capabilityProfile] };
}

export class DeterministicModelAdapter implements ModelAdapter {
  readonly adapterRef: string;
  readonly providerRef: string;
  readonly modelRef: string;

  constructor(input: { adapterRef: string; providerRef: string; modelRef: string }) {
    this.adapterRef = input.adapterRef;
    this.providerRef = input.providerRef;
    this.modelRef = input.modelRef;
  }

  invoke(context: ModelInvocationContext): string {
    return [
      this.modelRef,
      context.sessionId,
      String(context.sequence),
      context.requestedCapability,
      context.prompt,
    ].join(":");
  }
}

export class SyntheticWardenAgentAuthority {
  private readonly issuanceDecision: AgentIssuanceDecision;
  private readonly approvedPackRefs: ReadonlySet<string>;
  private readonly approvedAdapterRefs: ReadonlySet<string>;
  private readonly allowedCapabilities: ReadonlySet<string>;
  private readonly deniedCapabilities: readonly string[];

  constructor(input?: {
    issuanceDecision?: AgentIssuanceDecision;
    approvedPackRefs?: readonly string[];
    approvedAdapterRefs?: readonly string[];
    allowedCapabilities?: readonly string[];
    deniedCapabilities?: readonly string[];
  }) {
    this.issuanceDecision = input?.issuanceDecision ?? "ALLOW";
    this.approvedPackRefs = new Set(input?.approvedPackRefs ?? [AGENT_RC1_IDENTITIES.packRef]);
    this.approvedAdapterRefs = new Set(
      input?.approvedAdapterRefs ?? ["MODEL-ADAPTER-A-001", "MODEL-ADAPTER-B-001"],
    );
    this.allowedCapabilities = new Set(
      input?.allowedCapabilities ?? ["entity.profile.read", "service_request.create"],
    );
    this.deniedCapabilities = immutableStrings(input?.deniedCapabilities ?? ["contract.execute"]);
  }

  issue(request: WardenIssuanceRequest): AgentIssuanceResult {
    const decisionRef = `WARDEN-AGENT-ISSUANCE:${request.requestedIssuanceId}`;

    if (
      request.requesterRef !== AGENT_RC1_IDENTITIES.requesterRef ||
      request.representedEntityRef !== AGENT_RC1_IDENTITIES.representedEntityRef ||
      request.requestedAgentId !== AGENT_RC1_IDENTITIES.agentId ||
      request.requestedIssuanceId !== AGENT_RC1_IDENTITIES.issuanceId
    ) {
      return { decision: "DENY", decisionRef, reason: "registry_identity_resolution_mismatch" };
    }

    if (!this.approvedPackRefs.has(request.packRef)) {
      return { decision: "DENY", decisionRef, reason: "agent_pack_not_approved" };
    }

    if (this.issuanceDecision === "DENY") {
      return { decision: "DENY", decisionRef, reason: "warden_policy_denied" };
    }

    if (this.issuanceDecision === "ESCALATE") {
      return { decision: "ESCALATE", decisionRef, reason: "manual_review_required" };
    }

    const requestedCapabilities = uniqueStrings(request.requestedCapabilities);
    const allowedCapabilities = immutableStrings(
      requestedCapabilities.filter((capability) => this.allowedCapabilities.has(capability)),
    );
    const deniedCapabilities = immutableStrings([
      ...this.deniedCapabilities,
      ...requestedCapabilities.filter((capability) => !this.allowedCapabilities.has(capability)),
    ]);
    const validFrom = request.requestedAt;
    const validUntil = "2026-08-14T07:10:00.000Z";
    const authorityFingerprint = makeAuthorityFingerprint({
      agentId: request.requestedAgentId,
      issuanceId: request.requestedIssuanceId,
      representedEntityRef: request.representedEntityRef,
      requesterRef: request.requesterRef,
      packRef: request.packRef,
      allowedCapabilities,
      deniedCapabilities,
      validFrom,
      validUntil,
    });

    const envelope: WardenAuthorityEnvelope = Object.freeze({
      agentId: request.requestedAgentId,
      issuanceId: request.requestedIssuanceId,
      representedEntityRef: request.representedEntityRef,
      requesterRef: request.requesterRef,
      packRef: request.packRef,
      wardenRef: AGENT_RC1_IDENTITIES.wardenRef,
      issuanceDecisionRef: decisionRef,
      decision: "ALLOW" as const,
      allowedCapabilities,
      deniedCapabilities,
      validFrom,
      validUntil,
      issuedAt: request.requestedAt,
      lifecycleState: "ACTIVE" as const,
      authorityFingerprint,
    });

    return { decision: "ALLOW", decisionRef, reason: "bounded_agent_issuance", envelope };
  }

  authorizeBindingChange(
    envelope: WardenAuthorityEnvelope,
    adapterRef: string,
    decisionRef: string,
  ): WardenBindingDecision {
    const approved = this.approvedAdapterRefs.has(adapterRef);
    return {
      decisionRef,
      wardenRef: AGENT_RC1_IDENTITIES.wardenRef,
      decision: approved ? "ALLOW" : "DENY",
      agentId: envelope.agentId,
      issuanceId: envelope.issuanceId,
      adapterRef,
      authorityFingerprint: envelope.authorityFingerprint,
      reason: approved ? "model_adapter_approved" : "model_adapter_not_approved",
    };
  }

  revoke(
    envelope: WardenAuthorityEnvelope,
    input: { decisionRef: string; revokedAt: string; reason: string },
  ): WardenRevocationDecision {
    return {
      decisionRef: input.decisionRef,
      wardenRef: AGENT_RC1_IDENTITIES.wardenRef,
      agentId: envelope.agentId,
      issuanceId: envelope.issuanceId,
      authorityFingerprint: envelope.authorityFingerprint,
      revokedAt: input.revokedAt,
      reason: input.reason,
    };
  }
}

export class AgentRuntime {
  private readonly issuance: WardenAuthorityEnvelope;
  private readonly adapters: ReadonlyMap<string, ModelAdapter>;
  private readonly bindings: ModelBinding[] = [];
  private readonly sessions = new Map<string, MutableSession>();
  private readonly swapMemos = new Map<string, SwapMemo>();
  private runtimeState: AgentRuntimeState = "ACTIVE";
  private activeBindingRef: string;
  private revocation?: WardenRevocationDecision;

  private constructor(
    issuance: WardenAuthorityEnvelope,
    adapters: ReadonlyMap<string, ModelAdapter>,
    initialBinding: ModelBinding,
  ) {
    this.issuance = issuance;
    this.adapters = adapters;
    this.bindings.push(initialBinding);
    this.activeBindingRef = initialBinding.bindingRef;
  }

  static activate(input: ActivateAgentRuntimeInput): AgentRuntime {
    if (!input.issuance) {
      throw new Error("warden_issuance_required");
    }

    AgentRuntime.assertBindingDecision(input.issuance, input.initialBindingDecision);
    AgentRuntime.assertCapabilityProfile(input.issuance, input.capabilityProfile);

    const adapters = new Map(input.adapterRegistry.map((adapter) => [adapter.adapterRef, adapter]));
    const adapter = adapters.get(input.initialBindingDecision.adapterRef);
    if (!adapter) {
      throw new Error("model_adapter_not_registered");
    }

    const initialBinding: ModelBinding = {
      bindingRef: input.initialBindingRef,
      bindingVersion: 1,
      agentId: input.issuance.agentId,
      issuanceId: input.issuance.issuanceId,
      representedEntityRef: input.issuance.representedEntityRef,
      authorityFingerprint: input.issuance.authorityFingerprint,
      adapterRef: adapter.adapterRef,
      providerRef: adapter.providerRef,
      modelRef: adapter.modelRef,
      purpose: input.purpose,
      capabilityProfile: immutableStrings(input.capabilityProfile),
      activatedAt: input.activatedAt,
      lifecycleState: "ACTIVE",
      changeDecisionRef: input.initialBindingDecision.decisionRef,
      idempotencyKey: input.idempotencyKey,
    };

    return new AgentRuntime(input.issuance, adapters, initialBinding);
  }

  private static assertBindingDecision(
    issuance: WardenAuthorityEnvelope,
    decision: WardenBindingDecision,
  ): void {
    if (decision.decision !== "ALLOW") {
      throw new Error("warden_model_binding_denied");
    }
    if (decision.wardenRef !== issuance.wardenRef) {
      throw new Error("binding_warden_mismatch");
    }
    if (decision.agentId !== issuance.agentId || decision.issuanceId !== issuance.issuanceId) {
      throw new Error("binding_identity_mismatch");
    }
    if (decision.authorityFingerprint !== issuance.authorityFingerprint) {
      throw new Error("binding_authority_mismatch");
    }
  }

  private static assertCapabilityProfile(
    issuance: WardenAuthorityEnvelope,
    capabilityProfile: readonly string[],
  ): void {
    const allowed = new Set(issuance.allowedCapabilities);
    if (capabilityProfile.some((capability) => !allowed.has(capability))) {
      throw new Error("model_binding_capability_expansion");
    }
  }

  private assertActive(): void {
    if (this.runtimeState !== "ACTIVE") {
      throw new Error("agent_issuance_revoked");
    }
  }

  private assertIdentityGuard(guard: AgentBindingIdentityGuard): void {
    if (
      guard.agentId !== this.issuance.agentId ||
      guard.issuanceId !== this.issuance.issuanceId ||
      guard.representedEntityRef !== this.issuance.representedEntityRef ||
      guard.authorityFingerprint !== this.issuance.authorityFingerprint
    ) {
      throw new Error("model_swap_identity_or_authority_drift");
    }
  }

  identityGuard(): AgentBindingIdentityGuard {
    return {
      agentId: this.issuance.agentId,
      issuanceId: this.issuance.issuanceId,
      representedEntityRef: this.issuance.representedEntityRef,
      authorityFingerprint: this.issuance.authorityFingerprint,
    };
  }

  authorityEnvelope(): WardenAuthorityEnvelope {
    return {
      ...this.issuance,
      allowedCapabilities: [...this.issuance.allowedCapabilities],
      deniedCapabilities: [...this.issuance.deniedCapabilities],
    };
  }

  state(): AgentRuntimeState {
    return this.runtimeState;
  }

  bindingHistory(): ModelBinding[] {
    return this.bindings.map(cloneBinding);
  }

  activeBinding(): ModelBinding {
    const binding = this.bindings.find((candidate) => candidate.bindingRef === this.activeBindingRef);
    if (!binding) {
      throw new Error("active_model_binding_missing");
    }
    return cloneBinding(binding);
  }

  openSession(input: { sessionId: string; openedAt: string }): AgentSessionSnapshot {
    this.assertActive();
    const existing = this.sessions.get(input.sessionId);
    if (existing) {
      return this.sessionSnapshot(existing);
    }

    const session: MutableSession = {
      sessionId: input.sessionId,
      openedAt: input.openedAt,
      invocationSequence: 0,
      continuityRef: `AGENT-SESSION-CONTINUITY:${input.sessionId}`,
    };
    this.sessions.set(input.sessionId, session);
    return this.sessionSnapshot(session);
  }

  session(sessionId: string): AgentSessionSnapshot {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("agent_session_not_found");
    }
    return this.sessionSnapshot(session);
  }

  private sessionSnapshot(session: MutableSession): AgentSessionSnapshot {
    return {
      sessionId: session.sessionId,
      agentId: this.issuance.agentId,
      issuanceId: this.issuance.issuanceId,
      openedAt: session.openedAt,
      invocationSequence: session.invocationSequence,
      continuityRef: session.continuityRef,
    };
  }

  invoke(input: {
    sessionId: string;
    prompt: string;
    requestedCapability: string;
  }): ModelInvocationProposal {
    this.assertActive();
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      throw new Error("agent_session_not_found");
    }

    const binding = this.activeBinding();
    const adapter = this.adapters.get(binding.adapterRef);
    if (!adapter) {
      throw new Error("active_model_adapter_missing");
    }

    session.invocationSequence += 1;
    const output = adapter.invoke({
      sessionId: session.sessionId,
      sequence: session.invocationSequence,
      prompt: input.prompt,
      requestedCapability: input.requestedCapability,
    });

    return {
      proposalRef: `AGENT-PROPOSAL:${session.sessionId}:${session.invocationSequence}`,
      sessionId: session.sessionId,
      agentId: this.issuance.agentId,
      issuanceId: this.issuance.issuanceId,
      bindingRef: binding.bindingRef,
      modelRef: binding.modelRef,
      requestedCapability: input.requestedCapability,
      output,
      requiresWardenDecision: true,
      authorized: false,
      actionToken: undefined,
    };
  }

  swapModel(input: SwapModelInput): ModelBinding {
    this.assertActive();
    this.assertIdentityGuard(input.identityGuard);
    AgentRuntime.assertCapabilityProfile(this.issuance, input.capabilityProfile);

    const requestFingerprint = makeSwapRequestFingerprint(input);
    const memo = this.swapMemos.get(input.idempotencyKey);
    if (memo) {
      if (memo.bindingRef !== input.bindingRef || memo.requestFingerprint !== requestFingerprint) {
        throw new Error("model_swap_idempotency_conflict");
      }
      const replay = this.bindings.find((binding) => binding.bindingRef === memo.bindingRef);
      if (!replay) {
        throw new Error("model_swap_replay_binding_missing");
      }
      return cloneBinding(replay);
    }

    AgentRuntime.assertBindingDecision(this.issuance, input.bindingDecision);
    const adapter = this.adapters.get(input.bindingDecision.adapterRef);
    if (!adapter) {
      throw new Error("model_adapter_not_registered");
    }

    const previousIndex = this.bindings.findIndex(
      (binding) => binding.bindingRef === this.activeBindingRef,
    );
    if (previousIndex < 0) {
      throw new Error("active_model_binding_missing");
    }
    const previous = this.bindings[previousIndex];
    this.bindings[previousIndex] = { ...previous, lifecycleState: "SUPERSEDED" };

    const nextBinding: ModelBinding = {
      bindingRef: input.bindingRef,
      bindingVersion: previous.bindingVersion + 1,
      agentId: this.issuance.agentId,
      issuanceId: this.issuance.issuanceId,
      representedEntityRef: this.issuance.representedEntityRef,
      authorityFingerprint: this.issuance.authorityFingerprint,
      adapterRef: adapter.adapterRef,
      providerRef: adapter.providerRef,
      modelRef: adapter.modelRef,
      purpose: input.purpose,
      capabilityProfile: immutableStrings(input.capabilityProfile),
      activatedAt: input.activatedAt,
      lifecycleState: "ACTIVE",
      predecessorBindingRef: previous.bindingRef,
      changeDecisionRef: input.bindingDecision.decisionRef,
      idempotencyKey: input.idempotencyKey,
    };

    this.bindings.push(nextBinding);
    this.activeBindingRef = nextBinding.bindingRef;
    this.swapMemos.set(input.idempotencyKey, {
      bindingRef: nextBinding.bindingRef,
      requestFingerprint,
    });
    return cloneBinding(nextBinding);
  }

  applyRevocation(decision: WardenRevocationDecision): void {
    if (
      decision.wardenRef !== this.issuance.wardenRef ||
      decision.agentId !== this.issuance.agentId ||
      decision.issuanceId !== this.issuance.issuanceId ||
      decision.authorityFingerprint !== this.issuance.authorityFingerprint
    ) {
      throw new Error("revocation_authority_mismatch");
    }
    this.revocation = { ...decision };
    this.runtimeState = "REVOKED";
  }

  revocationDecision(): WardenRevocationDecision | undefined {
    return this.revocation ? { ...this.revocation } : undefined;
  }
}
