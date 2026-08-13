import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AGENT_RC1_IDENTITIES,
  AgentRuntime,
  DeterministicModelAdapter,
  SyntheticWardenAgentAuthority,
} from "./runtime.js";
import type { WardenAuthorityEnvelope } from "./runtime.js";

const ISSUED_AT = "2026-08-13T07:10:00.000Z";
const SWAP_AT = "2026-08-13T07:11:00.000Z";
const REVOKED_AT = "2026-08-13T07:12:00.000Z";

const modelA = new DeterministicModelAdapter({
  adapterRef: "MODEL-ADAPTER-A-001",
  providerRef: "SYNTHETIC-PROVIDER-A",
  modelRef: "SYNTHETIC-MODEL-A",
});
const modelB = new DeterministicModelAdapter({
  adapterRef: "MODEL-ADAPTER-B-001",
  providerRef: "SYNTHETIC-PROVIDER-B",
  modelRef: "SYNTHETIC-MODEL-B",
});
const unapprovedModel = new DeterministicModelAdapter({
  adapterRef: "MODEL-ADAPTER-UNAPPROVED-001",
  providerRef: "SYNTHETIC-PROVIDER-X",
  modelRef: "SYNTHETIC-MODEL-X",
});

function issueEnvelope(
  warden = new SyntheticWardenAgentAuthority(),
): { warden: SyntheticWardenAgentAuthority; envelope: WardenAuthorityEnvelope } {
  const result = warden.issue({
    requesterRef: AGENT_RC1_IDENTITIES.requesterRef,
    representedEntityRef: AGENT_RC1_IDENTITIES.representedEntityRef,
    packRef: AGENT_RC1_IDENTITIES.packRef,
    requestedAgentId: AGENT_RC1_IDENTITIES.agentId,
    requestedIssuanceId: AGENT_RC1_IDENTITIES.issuanceId,
    requestedCapabilities: ["entity.profile.read", "service_request.create"],
    requestedAt: ISSUED_AT,
  });
  if (!result.envelope) {
    throw new Error(`test_issuance_failed:${result.decision}:${result.reason}`);
  }
  return { warden, envelope: result.envelope };
}

function activateRuntime(): {
  warden: SyntheticWardenAgentAuthority;
  envelope: WardenAuthorityEnvelope;
  runtime: AgentRuntime;
} {
  const { warden, envelope } = issueEnvelope();
  const decision = warden.authorizeBindingChange(
    envelope,
    modelA.adapterRef,
    "WARDEN-MODEL-BINDING-A-001",
  );
  const runtime = AgentRuntime.activate({
    issuance: envelope,
    initialBindingRef: AGENT_RC1_IDENTITIES.modelABindingRef,
    initialBindingDecision: decision,
    adapterRegistry: [modelA, modelB, unapprovedModel],
    purpose: "company-base-agent",
    capabilityProfile: envelope.allowedCapabilities,
    activatedAt: ISSUED_AT,
    idempotencyKey: "AGENT-BIND-A-001",
  });
  return { warden, envelope, runtime };
}

function swapToModelB(
  warden: SyntheticWardenAgentAuthority,
  envelope: WardenAuthorityEnvelope,
  runtime: AgentRuntime,
) {
  const decision = warden.authorizeBindingChange(
    envelope,
    modelB.adapterRef,
    "WARDEN-MODEL-BINDING-B-001",
  );
  return runtime.swapModel({
    bindingRef: AGENT_RC1_IDENTITIES.modelBBindingRef,
    bindingDecision: decision,
    identityGuard: runtime.identityGuard(),
    purpose: "company-base-agent",
    capabilityProfile: envelope.allowedCapabilities,
    activatedAt: SWAP_AT,
    idempotencyKey: "AGENT-SWAP-A-B-001",
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AF-002 / AF-003 Warden-issued Agent runtime", () => {
  it("keeps Agent identity, issuance, authority and session continuity across Model A to Model B", () => {
    const { warden, envelope, runtime } = activateRuntime();
    const authorityBefore = runtime.authorityEnvelope();
    const sessionBefore = runtime.openSession({ sessionId: "AGENT-SESSION-001", openedAt: ISSUED_AT });

    const proposalA = runtime.invoke({
      sessionId: sessionBefore.sessionId,
      prompt: "read the approved company profile",
      requestedCapability: "entity.profile.read",
    });
    expect(proposalA.modelRef).toBe(modelA.modelRef);
    expect(proposalA.authorized).toBe(false);

    const bindingB = swapToModelB(warden, envelope, runtime);
    const proposalB = runtime.invoke({
      sessionId: sessionBefore.sessionId,
      prompt: "continue the same governed session",
      requestedCapability: "entity.profile.read",
    });
    const sessionAfter = runtime.session(sessionBefore.sessionId);
    const authorityAfter = runtime.authorityEnvelope();

    expect(bindingB.agentId).toBe(AGENT_RC1_IDENTITIES.agentId);
    expect(bindingB.issuanceId).toBe(AGENT_RC1_IDENTITIES.issuanceId);
    expect(bindingB.authorityFingerprint).toBe(envelope.authorityFingerprint);
    expect(proposalB.modelRef).toBe(modelB.modelRef);
    expect(proposalB.agentId).toBe(proposalA.agentId);
    expect(proposalB.issuanceId).toBe(proposalA.issuanceId);
    expect(sessionAfter.continuityRef).toBe(sessionBefore.continuityRef);
    expect(sessionAfter.invocationSequence).toBe(2);
    expect(authorityAfter).toEqual(authorityBefore);

    const history = runtime.bindingHistory();
    expect(history).toHaveLength(2);
    expect(history[0].lifecycleState).toBe("SUPERSEDED");
    expect(history[1].lifecycleState).toBe("ACTIVE");
    expect(history[1].predecessorBindingRef).toBe(history[0].bindingRef);
  });

  it("fails closed when no Warden issuance exists", () => {
    const decision = new SyntheticWardenAgentAuthority().authorizeBindingChange(
      issueEnvelope().envelope,
      modelA.adapterRef,
      "WARDEN-MODEL-BINDING-MISSING-ISSUANCE",
    );

    expect(() =>
      AgentRuntime.activate({
        issuance: undefined,
        initialBindingRef: AGENT_RC1_IDENTITIES.modelABindingRef,
        initialBindingDecision: decision,
        adapterRegistry: [modelA],
        purpose: "company-base-agent",
        capabilityProfile: ["entity.profile.read"],
        activatedAt: ISSUED_AT,
        idempotencyKey: "MISSING-ISSUANCE",
      }),
    ).toThrow("warden_issuance_required");
  });

  it("does not create an active Agent for DENY or ESCALATE issuance decisions", () => {
    for (const issuanceDecision of ["DENY", "ESCALATE"] as const) {
      const warden = new SyntheticWardenAgentAuthority({ issuanceDecision });
      const result = warden.issue({
        requesterRef: AGENT_RC1_IDENTITIES.requesterRef,
        representedEntityRef: AGENT_RC1_IDENTITIES.representedEntityRef,
        packRef: AGENT_RC1_IDENTITIES.packRef,
        requestedAgentId: AGENT_RC1_IDENTITIES.agentId,
        requestedIssuanceId: AGENT_RC1_IDENTITIES.issuanceId,
        requestedCapabilities: ["entity.profile.read"],
        requestedAt: ISSUED_AT,
      });

      expect(result.decision).toBe(issuanceDecision);
      expect(result.envelope).toBeUndefined();
    }
  });

  it("rejects an unapproved model adapter without changing the active binding", () => {
    const { warden, envelope, runtime } = activateRuntime();
    const before = runtime.activeBinding();
    const deniedDecision = warden.authorizeBindingChange(
      envelope,
      unapprovedModel.adapterRef,
      "WARDEN-MODEL-BINDING-X-DENY",
    );

    expect(deniedDecision.decision).toBe("DENY");
    expect(() =>
      runtime.swapModel({
        bindingRef: "MODEL-BINDING-X-001",
        bindingDecision: deniedDecision,
        identityGuard: runtime.identityGuard(),
        purpose: "company-base-agent",
        capabilityProfile: envelope.allowedCapabilities,
        activatedAt: SWAP_AT,
        idempotencyKey: "AGENT-SWAP-A-X-001",
      }),
    ).toThrow("warden_model_binding_denied");
    expect(runtime.activeBinding()).toEqual(before);
    expect(runtime.bindingHistory()).toHaveLength(1);
  });

  it("rejects a model swap that attempts Agent, issuance, entity or authority drift", () => {
    const { warden, envelope, runtime } = activateRuntime();
    const decision = warden.authorizeBindingChange(
      envelope,
      modelB.adapterRef,
      "WARDEN-MODEL-BINDING-B-DRIFT",
    );

    expect(() =>
      runtime.swapModel({
        bindingRef: AGENT_RC1_IDENTITIES.modelBBindingRef,
        bindingDecision: decision,
        identityGuard: { ...runtime.identityGuard(), agentId: "AGENT-IMPOSTOR-001" },
        purpose: "company-base-agent",
        capabilityProfile: envelope.allowedCapabilities,
        activatedAt: SWAP_AT,
        idempotencyKey: "AGENT-SWAP-DRIFT-001",
      }),
    ).toThrow("model_swap_identity_or_authority_drift");
    expect(runtime.activeBinding().modelRef).toBe(modelA.modelRef);
  });

  it("makes duplicate model-swap idempotency keys replay the same binding exactly once", () => {
    const { warden, envelope, runtime } = activateRuntime();
    const decision = warden.authorizeBindingChange(
      envelope,
      modelB.adapterRef,
      "WARDEN-MODEL-BINDING-B-IDEMPOTENT",
    );
    const request = {
      bindingRef: AGENT_RC1_IDENTITIES.modelBBindingRef,
      bindingDecision: decision,
      identityGuard: runtime.identityGuard(),
      purpose: "company-base-agent",
      capabilityProfile: envelope.allowedCapabilities,
      activatedAt: SWAP_AT,
      idempotencyKey: "AGENT-SWAP-IDEMPOTENT-001",
    };

    const first = runtime.swapModel(request);
    const second = runtime.swapModel(request);

    expect(second).toEqual(first);
    expect(runtime.bindingHistory()).toHaveLength(2);
  });

  it("keeps model output proposal-only for allowed and forbidden controlled capabilities", () => {
    const { runtime } = activateRuntime();
    runtime.openSession({ sessionId: "AGENT-SESSION-PROPOSAL-001", openedAt: ISSUED_AT });

    for (const requestedCapability of ["service_request.create", "contract.execute"]) {
      const proposal = runtime.invoke({
        sessionId: "AGENT-SESSION-PROPOSAL-001",
        prompt: `propose ${requestedCapability}`,
        requestedCapability,
      });
      expect(proposal.requiresWardenDecision).toBe(true);
      expect(proposal.authorized).toBe(false);
      expect(proposal.actionToken).toBeUndefined();
    }
  });

  it("stops model invocation after a matching Warden revocation", () => {
    const { warden, envelope, runtime } = activateRuntime();
    runtime.openSession({ sessionId: "AGENT-SESSION-REVOKE-001", openedAt: ISSUED_AT });
    const revocation = warden.revoke(envelope, {
      decisionRef: "WARDEN-AGENT-REVOCATION-001",
      revokedAt: REVOKED_AT,
      reason: "synthetic_conformance_revocation",
    });

    runtime.applyRevocation(revocation);

    expect(runtime.state()).toBe("REVOKED");
    expect(runtime.revocationDecision()?.decisionRef).toBe(revocation.decisionRef);
    expect(() =>
      runtime.invoke({
        sessionId: "AGENT-SESSION-REVOKE-001",
        prompt: "continue after revocation",
        requestedCapability: "entity.profile.read",
      }),
    ).toThrow("agent_issuance_revoked");
  });

  it("performs the issuance, binding and swap conformance path without external network calls", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("external_network_forbidden_in_agent_conformance");
    });
    const { warden, envelope, runtime } = activateRuntime();
    runtime.openSession({ sessionId: "AGENT-SESSION-NETWORK-001", openedAt: ISSUED_AT });
    runtime.invoke({
      sessionId: "AGENT-SESSION-NETWORK-001",
      prompt: "model A proposal",
      requestedCapability: "entity.profile.read",
    });
    swapToModelB(warden, envelope, runtime);
    runtime.invoke({
      sessionId: "AGENT-SESSION-NETWORK-001",
      prompt: "model B proposal",
      requestedCapability: "entity.profile.read",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
