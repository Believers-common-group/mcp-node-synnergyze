import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AGENT_RC1_IDENTITIES,
  AgentRuntime,
  DeterministicModelAdapter,
  SyntheticWardenAgentAuthority,
} from "./runtime.ts";
import type { ModelInvocationProposal, WardenAuthorityEnvelope } from "./runtime.ts";
import { AgentActionGatewayBridgeV1, type AgentActionContextV1 } from "./action-gateway.ts";

const ISSUED_AT = "2026-08-13T07:10:00.000Z";
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

function activateRuntime(): {
  warden: SyntheticWardenAgentAuthority;
  envelope: WardenAuthorityEnvelope;
  runtime: AgentRuntime;
} {
  const warden = new SyntheticWardenAgentAuthority();
  const issuance = warden.issue({
    requesterRef: AGENT_RC1_IDENTITIES.requesterRef,
    representedEntityRef: AGENT_RC1_IDENTITIES.representedEntityRef,
    packRef: AGENT_RC1_IDENTITIES.packRef,
    requestedAgentId: AGENT_RC1_IDENTITIES.agentId,
    requestedIssuanceId: AGENT_RC1_IDENTITIES.issuanceId,
    requestedCapabilities: ["entity.profile.read", "service_request.create"],
    requestedAt: ISSUED_AT,
  });
  if (!issuance.envelope) throw new Error("test_agent_issuance_missing");
  const envelope = issuance.envelope;
  const bindingDecision = warden.authorizeBindingChange(
    envelope,
    modelA.adapterRef,
    "WARDEN-MODEL-BINDING-A-AF004",
  );
  const runtime = AgentRuntime.activate({
    issuance: envelope,
    initialBindingRef: AGENT_RC1_IDENTITIES.modelABindingRef,
    initialBindingDecision: bindingDecision,
    adapterRegistry: [modelA, modelB],
    purpose: "company-base-agent",
    capabilityProfile: envelope.allowedCapabilities,
    activatedAt: ISSUED_AT,
    idempotencyKey: "AF004-BIND-A-001",
  });
  runtime.openSession({ sessionId: "AF004-SESSION-001", openedAt: ISSUED_AT });
  return { warden, envelope, runtime };
}

function proposal(runtime: AgentRuntime, capability: string): ModelInvocationProposal {
  return runtime.invoke({
    sessionId: "AF004-SESSION-001",
    prompt: `propose ${capability}`,
    requestedCapability: capability,
  });
}

function context(
  capability: "service_request.create" | "contract.execute",
  correlationId = capability === "service_request.create" ? "AF004-CORR-ALLOW-001" : "AF004-CORR-DENY-001",
): AgentActionContextV1 {
  return {
    actorRef: AGENT_RC1_IDENTITIES.requesterRef,
    representedEntityRef: AGENT_RC1_IDENTITIES.representedEntityRef,
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    programRef: "ALPHA-RC1-PROGRAM-001",
    targetRef: capability === "service_request.create" ? "LAB-SERVICE-DESK-001" : "LAB-CONTRACT-001",
    correlationId,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AF-004 Agent proposal to governed Action Gateway", () => {
  it("executes one allowed Agent proposal only after a separate Warden decision and River reservation", () => {
    const { runtime } = activateRuntime();
    const modelProposal = proposal(runtime, "service_request.create");
    const bridge = new AgentActionGatewayBridgeV1();

    expect(modelProposal.authorized).toBe(false);
    expect(modelProposal.actionToken).toBeUndefined();

    const result = bridge.execute({
      runtime,
      proposal: modelProposal,
      context: context("service_request.create"),
    });

    expect(result.intent.authorized).toBe(false);
    expect(result.intent.actionToken).toBeUndefined();
    expect(result.causalEnvelope.resultState).toBe("VERIFIED_EFFECT");
    expect(result.causalEnvelope.proposalRef).toBe(modelProposal.proposalRef);
    expect(result.causalEnvelope.agentId).toBe(AGENT_RC1_IDENTITIES.agentId);
    expect(result.causalEnvelope.issuanceId).toBe(AGENT_RC1_IDENTITIES.issuanceId);
    expect(result.causalEnvelope.modelBindingRef).toBe(modelProposal.bindingRef);
    expect(result.causalEnvelope.actionTokenPresent).toBe(true);
    expect(result.causalEnvelope.wardenDecisionRef).toMatch(/^RC1-WARDEN-DECISION:/);
    expect(result.causalEnvelope.riverReservationRef).toMatch(/^RC1-EVIDENCE-RESERVATION:/);
    expect(result.causalEnvelope.connectorReceiptRef).toMatch(/^RC1-RECEIPT:/);
    expect(result.causalEnvelope.serviceRequestRef).toMatch(/^RC1-SERVICE-REQUEST:/);
    expect(result.causalEnvelope.riverSealRef).toMatch(/^RC1-EVIDENCE-SEALED:/);
    expect(result.causalEnvelope.effectRef).toMatch(/^RC1-EFFECT:/);
    expect(bridge.gatewayRequestCount()).toBe(1);
  });

  it("denies contract.execute with no token, connector mutation, seal or effect", () => {
    const { runtime } = activateRuntime();
    const bridge = new AgentActionGatewayBridgeV1();
    const result = bridge.execute({
      runtime,
      proposal: proposal(runtime, "contract.execute"),
      context: context("contract.execute"),
    });

    expect(result.causalEnvelope.resultState).toBe("DENIED");
    expect(result.causalEnvelope.actionTokenPresent).toBe(false);
    expect(result.causalEnvelope.riverDeniedOrExceptionRef).toMatch(/^RC1-EVIDENCE-DENIED:/);
    expect(result.causalEnvelope.riverReservationRef).toBeUndefined();
    expect(result.causalEnvelope.connectorReceiptRef).toBeUndefined();
    expect(result.causalEnvelope.riverSealRef).toBeUndefined();
    expect(result.causalEnvelope.effectRef).toBeUndefined();
    expect(bridge.gatewayRequestCount()).toBe(0);
  });

  it("rejects a model-produced or self-declared action token", () => {
    const { runtime } = activateRuntime();
    const bridge = new AgentActionGatewayBridgeV1();
    const tampered = {
      ...proposal(runtime, "service_request.create"),
      actionToken: "MODEL-MINTED-TOKEN",
    } as unknown as ModelInvocationProposal;

    expect(() =>
      bridge.execute({ runtime, proposal: tampered, context: context("service_request.create") }),
    ).toThrow("agent_model_self_declared_action_token_rejected");
    expect(bridge.gatewayRequestCount()).toBe(0);
  });

  it("rejects Agent, issuance, represented entity, target and binding drift before Warden/execution", () => {
    const mutations: Array<[string, (proposalValue: ModelInvocationProposal, ctx: AgentActionContextV1) => void]> = [
      ["agent_action_agent_identity_mismatch", (value) => Object.assign(value, { agentId: "AGENT-IMPOSTOR-001" })],
      ["agent_action_issuance_mismatch", (value) => Object.assign(value, { issuanceId: "ISSUANCE-IMPOSTOR-001" })],
      ["agent_action_represented_entity_mismatch", (_value, ctx) => Object.assign(ctx, { representedEntityRef: "ENTITY-IMPOSTOR-001" })],
      ["agent_action_target_mismatch", (_value, ctx) => Object.assign(ctx, { targetRef: "LAB-WRONG-TARGET-001" })],
      ["agent_action_binding_not_in_agent_lineage", (value) => Object.assign(value, { bindingRef: "MODEL-BINDING-IMPOSTOR-001" })],
    ];

    for (const [error, mutate] of mutations) {
      const { runtime } = activateRuntime();
      const bridge = new AgentActionGatewayBridgeV1();
      const value = { ...proposal(runtime, "service_request.create") };
      const ctx = { ...context("service_request.create") };
      mutate(value, ctx);
      expect(() => bridge.execute({ runtime, proposal: value, context: ctx })).toThrow(error);
      expect(bridge.gatewayRequestCount()).toBe(0);
    }
  });

  it("blocks execution when River evidence reservation is missing", () => {
    const { runtime } = activateRuntime();
    const bridge = new AgentActionGatewayBridgeV1();
    const result = bridge.execute({
      runtime,
      proposal: proposal(runtime, "service_request.create"),
      context: context("service_request.create"),
      options: { omitEvidenceReservation: true },
    });

    expect(result.causalEnvelope.resultState).toBe("BLOCKED_REQUIREMENT");
    expect(result.causalEnvelope.actionTokenPresent).toBe(true);
    expect(result.causalEnvelope.riverReservationRef).toBeUndefined();
    expect(result.causalEnvelope.connectorReceiptRef).toBeUndefined();
    expect(result.causalEnvelope.effectRef).toBeUndefined();
    expect(bridge.gatewayRequestCount()).toBe(0);
  });

  it("turns a read-after-write mismatch into EXCEPTION and never records a verified effect", () => {
    const { runtime } = activateRuntime();
    const bridge = new AgentActionGatewayBridgeV1();
    const result = bridge.execute({
      runtime,
      proposal: proposal(runtime, "service_request.create"),
      context: context("service_request.create"),
      options: { injectReadMismatch: true },
    });

    expect(result.causalEnvelope.resultState).toBe("EXCEPTION");
    expect(result.causalEnvelope.connectorReceiptRef).toMatch(/^RC1-RECEIPT:/);
    expect(result.causalEnvelope.riverDeniedOrExceptionRef).toMatch(/^RC1-EVIDENCE-EXCEPTION:/);
    expect(result.causalEnvelope.riverSealRef).toBeUndefined();
    expect(result.causalEnvelope.effectRef).toBeUndefined();
    expect(bridge.gatewayRequestCount()).toBe(1);
  });

  it("replays the exact proposal idempotently without duplicating the gateway effect", () => {
    const { runtime } = activateRuntime();
    const bridge = new AgentActionGatewayBridgeV1();
    const modelProposal = proposal(runtime, "service_request.create");
    const ctx = context("service_request.create");
    const first = bridge.execute({ runtime, proposal: modelProposal, context: ctx });
    const second = bridge.execute({ runtime, proposal: modelProposal, context: ctx });

    expect(second.causalEnvelope.effectRef).toBe(first.causalEnvelope.effectRef);
    expect(second.causalEnvelope.connectorReceiptRef).toBe(first.causalEnvelope.connectorReceiptRef);
    expect(second.causalEnvelope.idempotentReplay).toBe(true);
    expect(bridge.gatewayRequestCount()).toBe(1);
    expect(bridge.riverEntries().filter((entry) => entry.stage === "SEALED")).toHaveLength(1);
  });

  it("rejects changed context under the same proposal and another proposal under the same correlation", () => {
    const { runtime } = activateRuntime();
    const bridge = new AgentActionGatewayBridgeV1();
    const firstProposal = proposal(runtime, "service_request.create");
    const firstContext = context("service_request.create");
    bridge.execute({ runtime, proposal: firstProposal, context: firstContext });

    expect(() =>
      bridge.execute({
        runtime,
        proposal: firstProposal,
        context: { ...firstContext, actingCapacityRef: "CAPACITY:DIFFERENT-001" },
      }),
    ).toThrow("agent_action_proposal_idempotency_conflict");

    const secondProposal = proposal(runtime, "service_request.create");
    expect(() =>
      bridge.execute({ runtime, proposal: secondProposal, context: firstContext }),
    ).toThrow("agent_action_correlation_conflict");
    expect(bridge.gatewayRequestCount()).toBe(1);
  });

  it("rechecks runtime state and blocks a pre-revocation proposal after revocation", () => {
    const { warden, envelope, runtime } = activateRuntime();
    const bridge = new AgentActionGatewayBridgeV1();
    const prepared = proposal(runtime, "service_request.create");
    const revocation = warden.revoke(envelope, {
      decisionRef: "WARDEN-AGENT-REVOCATION-AF004",
      revokedAt: REVOKED_AT,
      reason: "synthetic_af004_revocation",
    });
    runtime.applyRevocation(revocation);

    expect(() =>
      bridge.execute({ runtime, proposal: prepared, context: context("service_request.create") }),
    ).toThrow("agent_runtime_not_active");
    expect(bridge.gatewayRequestCount()).toBe(0);
  });

  it("does not use external network/provider calls in the conformance path", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("external_network_forbidden_in_af004");
    });
    const { runtime } = activateRuntime();
    const bridge = new AgentActionGatewayBridgeV1();
    bridge.execute({
      runtime,
      proposal: proposal(runtime, "service_request.create"),
      context: context("service_request.create"),
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
