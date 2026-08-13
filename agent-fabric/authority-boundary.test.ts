import { describe, expect, it } from "vitest";

import {
  AGENT_RC1_IDENTITIES,
  AgentRuntime,
  DeterministicModelAdapter,
  SyntheticWardenAgentAuthority,
} from "./runtime.js";

const ISSUED_AT = "2026-08-13T07:10:00.000Z";
const SWAP_AT = "2026-08-13T07:11:00.000Z";

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

describe("AF-002 / AF-003 authority non-expansion", () => {
  it("never grants a policy capability that the requester did not request", () => {
    const warden = new SyntheticWardenAgentAuthority();
    const result = warden.issue({
      requesterRef: AGENT_RC1_IDENTITIES.requesterRef,
      representedEntityRef: AGENT_RC1_IDENTITIES.representedEntityRef,
      packRef: AGENT_RC1_IDENTITIES.packRef,
      requestedAgentId: AGENT_RC1_IDENTITIES.agentId,
      requestedIssuanceId: AGENT_RC1_IDENTITIES.issuanceId,
      requestedCapabilities: ["entity.profile.read"],
      requestedAt: ISSUED_AT,
    });

    expect(result.decision).toBe("ALLOW");
    expect(result.envelope?.allowedCapabilities).toEqual(["entity.profile.read"]);
    expect(result.envelope?.allowedCapabilities).not.toContain("service_request.create");
    expect(result.envelope?.deniedCapabilities).toContain("contract.execute");
  });

  it("denies issuance when Registry-resolved synthetic identity references do not match", () => {
    const warden = new SyntheticWardenAgentAuthority();
    const result = warden.issue({
      requesterRef: "DIGITALME-IMPOSTOR-001",
      representedEntityRef: AGENT_RC1_IDENTITIES.representedEntityRef,
      packRef: AGENT_RC1_IDENTITIES.packRef,
      requestedAgentId: AGENT_RC1_IDENTITIES.agentId,
      requestedIssuanceId: AGENT_RC1_IDENTITIES.issuanceId,
      requestedCapabilities: ["entity.profile.read"],
      requestedAt: ISSUED_AT,
    });

    expect(result.decision).toBe("DENY");
    expect(result.reason).toBe("registry_identity_resolution_mismatch");
    expect(result.envelope).toBeUndefined();
  });

  it("rejects a model binding profile that expands beyond the Warden issuance envelope", () => {
    const warden = new SyntheticWardenAgentAuthority();
    const issuance = warden.issue({
      requesterRef: AGENT_RC1_IDENTITIES.requesterRef,
      representedEntityRef: AGENT_RC1_IDENTITIES.representedEntityRef,
      packRef: AGENT_RC1_IDENTITIES.packRef,
      requestedAgentId: AGENT_RC1_IDENTITIES.agentId,
      requestedIssuanceId: AGENT_RC1_IDENTITIES.issuanceId,
      requestedCapabilities: ["entity.profile.read", "service_request.create"],
      requestedAt: ISSUED_AT,
    }).envelope;
    if (!issuance) throw new Error("test_issuance_missing");

    const initialDecision = warden.authorizeBindingChange(
      issuance,
      modelA.adapterRef,
      "WARDEN-MODEL-BINDING-A-AUTHORITY-TEST",
    );
    const runtime = AgentRuntime.activate({
      issuance,
      initialBindingRef: AGENT_RC1_IDENTITIES.modelABindingRef,
      initialBindingDecision: initialDecision,
      adapterRegistry: [modelA, modelB],
      purpose: "company-base-agent",
      capabilityProfile: issuance.allowedCapabilities,
      activatedAt: ISSUED_AT,
      idempotencyKey: "AGENT-BIND-A-AUTHORITY-TEST",
    });
    const before = runtime.activeBinding();
    const nextDecision = warden.authorizeBindingChange(
      issuance,
      modelB.adapterRef,
      "WARDEN-MODEL-BINDING-B-AUTHORITY-TEST",
    );

    expect(() =>
      runtime.swapModel({
        bindingRef: AGENT_RC1_IDENTITIES.modelBBindingRef,
        bindingDecision: nextDecision,
        identityGuard: runtime.identityGuard(),
        purpose: "company-base-agent",
        capabilityProfile: [...issuance.allowedCapabilities, "contract.execute"],
        activatedAt: SWAP_AT,
        idempotencyKey: "AGENT-SWAP-A-B-AUTHORITY-TEST",
      }),
    ).toThrow("model_binding_capability_expansion");
    expect(runtime.activeBinding()).toEqual(before);
    expect(runtime.bindingHistory()).toHaveLength(1);
  });
});
