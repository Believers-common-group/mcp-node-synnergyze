import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";

import type { WardenDecisionRequestV1 } from "../../modules/warden/contracts.ts";
import type { ResolvedDeviceSecurityContextV1 } from "../../modules/synnergyze/contracts.ts";
import type { SynnergyzeRuntimeActivationResultV1 } from "../../modules/synnergyze/runtime-activation.ts";
import { CustomMcpServer } from "../CustomMcpServer.ts";
import { enableEnvironmentVariable as wardenEnable } from "./registerWardenConformanceDecision.ts";
import { enableEnvironmentVariable as riverEnable } from "./registerRiverWardenConformanceReservation.ts";
import { enableEnvironmentVariable as synnergyzeEnable } from "./registerWardenRiverSynnergyzeConformanceExecution.ts";
import { enableEnvironmentVariable as effectEnable } from "./registerWardenRiverEffectConformance.ts";
import {
  enableEnvironmentVariable,
  maybeRegisterSynnergyzeRuntimeActivation,
  operationId,
  registerSynnergyzeRuntimeActivation,
} from "./registerSynnergyzeRuntimeActivation.ts";

const NOW = "2026-09-12T05:11:00.000Z";

function request(): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:MCP-RUNTIME-R01-001",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:001",
    eventRef: "SYNNERGYZE-EVENT:MCP-RUNTIME-R01-001",
    action: "service_request.create",
    capabilityRef: "service_request.create",
    targetRef: "SERVICE-REQUEST-TARGET:001",
    requestedEffect: "service_request.created",
    executionDeviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
    genesisDevice: {
      resolutionRef: "GENESIS-DEVICE-RESOLUTION:mcp-runtime-r01-001",
      deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
      estateRef: "GENESIS-ESTATE-001",
      attestationRef: "GENESIS-DEVICE-ATTESTATION-MCP-RUNTIME-R01-001",
      assuranceLevel: "L3",
      evidenceRefs: ["RIVER-DEVICE-EVIDENCE-MCP-RUNTIME-R01-001"],
      resolvedAt: "2026-09-12T05:00:00.000Z",
      validUntil: "2026-09-12T06:00:00.000Z",
    },
    deviceSecurityState: "ACTIVE",
    deviceSecurityPolicyRef: "DEVICE-SECURITY-POLICY-001",
    deviceSecuritySourceRefs: [
      "DEVICE-SECURITY-RESOLUTION-001",
      "DEVICE-SECURITY-EVIDENCE-001",
    ],
    deviceSecurityResolvedAt: "2026-09-12T05:00:00.000Z",
    deviceSecurityValidUntil: "2026-09-12T06:00:00.000Z",
    authorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    policyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    representationSourceRefs: ["GENESIS-REPRESENTATION-001"],
    requestedAt: "2026-09-12T05:10:00.000Z",
    correlationId: "CORR:MCP-RUNTIME-R01-001",
  };
}

function executionDeviceSecurity(
  overrides: Partial<ResolvedDeviceSecurityContextV1> = {},
): ResolvedDeviceSecurityContextV1 {
  return {
    resolutionRef: "DEVICE-SECURITY-RESOLUTION-001",
    deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
    state: "ACTIVE",
    policyRef: "DEVICE-SECURITY-POLICY-001",
    evidenceRef: "DEVICE-SECURITY-EVIDENCE-001",
    assuranceLevel: "L3",
    resolvedAt: "2026-09-12T05:00:00.000Z",
    validUntil: "2026-09-12T06:00:00.000Z",
    ...overrides,
  };
}

const fullEnv = {
  [wardenEnable]: "1",
  [riverEnable]: "1",
  [synnergyzeEnable]: "1",
  [effectEnable]: "1",
  [enableEnvironmentVariable]: "1",
};

async function connectedPair() {
  const server = new CustomMcpServer({ name: "runtime-activation-test", version: "0.1.0" });
  const client = new Client({ name: "runtime-activation-client", version: "0.1.0" });
  registerSynnergyzeRuntimeActivation(server, () => NOW);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, server };
}

async function callRuntime(
  client: Client,
  security: ResolvedDeviceSecurityContextV1 = executionDeviceSecurity(),
): Promise<SynnergyzeRuntimeActivationResultV1> {
  const result = await client.request(
    {
      method: "tools/call",
      params: {
        name: operationId,
        arguments: {
          request: request(),
          executionDeviceSecurity: security,
          groupScopeRef: "GROUP:ALPHA-RUNTIME-QUALIFICATION-001",
        },
      },
    },
    CallToolResultSchema,
  );
  expect(result.isError).not.toBe(true);
  const first = result.content[0];
  if (!first || first.type !== "text") throw new Error("runtime_activation_text_result_required");
  return JSON.parse(first.text) as SynnergyzeRuntimeActivationResultV1;
}

describe("SYNNERGYZE-RUNTIME-ACTIVATION-R0.1 MCP", () => {
  it("requires every prerequisite switch plus the runtime switch and explicit allow-list membership", () => {
    const tool = vi.fn();
    const server = { tool } as unknown as CustomMcpServer;
    const allowed = { allowedTools: new Set([operationId]) };

    expect(maybeRegisterSynnergyzeRuntimeActivation(server, allowed, {})).toBe(false);
    expect(tool).not.toHaveBeenCalled();

    for (const missing of [wardenEnable, riverEnable, synnergyzeEnable, effectEnable, enableEnvironmentVariable]) {
      const env = { ...fullEnv };
      delete env[missing as keyof typeof env];
      expect(maybeRegisterSynnergyzeRuntimeActivation(server, allowed, env)).toBe(false);
    }
    expect(tool).not.toHaveBeenCalled();

    expect(maybeRegisterSynnergyzeRuntimeActivation(server, {}, fullEnv)).toBe(false);
    expect(tool).not.toHaveBeenCalled();

    expect(maybeRegisterSynnergyzeRuntimeActivation(server, allowed, fullEnv)).toBe(true);
    expect(tool).toHaveBeenCalledTimes(1);
  });

  it("exposes a bounded device-bound input schema and no external-effect control", async () => {
    const { client, server } = await connectedPair();
    try {
      const listed = await client.request({ method: "tools/list" }, ListToolsResultSchema);
      const tool = listed.tools.find((candidate) => candidate.name === operationId);
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.required).toEqual([
        "request",
        "executionDeviceSecurity",
        "groupScopeRef",
      ]);
      expect(tool?.inputSchema.properties).not.toHaveProperty("externalEffects");
      expect(tool?.inputSchema.properties).not.toHaveProperty("settlementFinality");
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it("returns the complete proof-bound controlled runtime result with all real effects disabled", async () => {
    const { client, server } = await connectedPair();
    try {
      const result = await callRuntime(client);
      expect(result.state).toBe("CONTROLLED_ACTIVE_PROOF");
      expect(result.proofChain).toHaveLength(7);
      expect(result.compositeProof?.proofId).toMatch(/^G-RIV-RUNTIME-[0-9A-F]{8}$/);
      expect(result.externalEffects).toBe(false);
      expect(result.settlementFinality).toBe(false);
      expect(result.registryTruthPromoted).toBe(false);
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it("replays exactly with stable Proof IDs", async () => {
    const { client, server } = await connectedPair();
    try {
      const first = await callRuntime(client);
      const second = await callRuntime(client);
      expect(second.proofChain.map((proof) => proof.proofId)).toEqual(
        first.proofChain.map((proof) => proof.proofId),
      );
      expect(second.compositeProof?.proofId).toBe(first.compositeProof?.proofId);
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it("fails closed on a mismatched transient device-security context", async () => {
    const { client, server } = await connectedPair();
    try {
      const result = await callRuntime(
        client,
        executionDeviceSecurity({ deviceRef: "GENESIS-DEVICE-OTHER" }),
      );
      expect(result.state).toBe("BLOCKED");
      expect(result.blockedReason).toBe("runtime_activation_device_security_mismatch");
      expect(result.compositeProof).toBeUndefined();
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });
});
