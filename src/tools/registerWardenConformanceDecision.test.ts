import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";

import { CustomMcpServer } from "../CustomMcpServer.ts";
import type { WardenDecisionRequestV1, WardenDecisionV1 } from "../../modules/warden/contracts.ts";
import {
  enableEnvironmentVariable,
  evaluateWardenConformanceDecision,
  maybeRegisterWardenConformanceDecision,
  operationId,
  registerWardenConformanceDecision,
} from "./registerWardenConformanceDecision.ts";

const FIXED_DECISION_TIME = "2026-08-23T00:00:30.000Z";

function request(overrides: Partial<WardenDecisionRequestV1> = {}): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:MCP-001",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:001",
    eventRef: "SYNNERGYZE-EVENT:MCP-001:001",
    action: "service_request.create",
    capabilityRef: "service_request.create",
    targetRef: "LAB-SERVICE-DESK-001",
    requestedEffect: "service_request.created",
    authorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    policyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    representationSourceRefs: ["REGISTRY:REPRESENTATION-001"],
    requestedAt: "2026-08-23T00:00:00.000Z",
    correlationId: "CORR-WARDEN-MCP-001",
    ...overrides,
  };
}

async function connectedPair() {
  const server = new CustomMcpServer({ name: "warden-test", version: "0.6.0" });
  const client = new Client({ name: "warden-test-client", version: "0.6.0" });
  registerWardenConformanceDecision(server, () => FIXED_DECISION_TIME);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, server };
}

async function callDecision(
  client: Client,
  decisionRequest: WardenDecisionRequestV1,
  extraArguments: Record<string, unknown> = {},
): Promise<WardenDecisionV1> {
  const result = await client.request(
    {
      method: "tools/call",
      params: {
        name: operationId,
        arguments: { request: decisionRequest, ...extraArguments },
      },
    },
    CallToolResultSchema,
  );
  expect(result.isError).not.toBe(true);
  const first = result.content[0];
  if (!first || first.type !== "text") throw new Error("warden_mcp_text_result_required");
  return JSON.parse(first.text) as WardenDecisionV1;
}

describe("WARDEN-MCP-CONFORMANCE-0.6", () => {
  it("requires both the environment switch and an explicit allow-tools entry", () => {
    const tool = vi.fn();
    const server = { tool } as unknown as CustomMcpServer;
    const allowed = { allowedTools: new Set([operationId]) };

    expect(maybeRegisterWardenConformanceDecision(server, allowed, {})).toBe(false);
    expect(tool).not.toHaveBeenCalled();

    expect(
      maybeRegisterWardenConformanceDecision(
        server,
        {},
        { [enableEnvironmentVariable]: "1" },
      ),
    ).toBe(false);
    expect(tool).not.toHaveBeenCalled();

    expect(
      maybeRegisterWardenConformanceDecision(
        server,
        allowed,
        { [enableEnvironmentVariable]: "1" },
      ),
    ).toBe(true);
    expect(tool).toHaveBeenCalledTimes(1);
  });

  it("exposes only request input and keeps decision time server-controlled", async () => {
    const { client, server } = await connectedPair();
    try {
      const listed = await client.request({ method: "tools/list" }, ListToolsResultSchema);
      const tool = listed.tools.find((candidate) => candidate.name === operationId);
      expect(tool).toBeDefined();
      expect(tool?.annotations).toEqual({ readOnlyHint: true });
      expect(tool?.inputSchema.required).toEqual(["request"]);
      expect(tool?.inputSchema.properties).not.toHaveProperty("decidedAt");
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it("carries ALLOW, DENY and ESCALATE through the MCP tool boundary", async () => {
    const { client, server } = await connectedPair();
    try {
      const allowed = await callDecision(client, request());
      expect(allowed.decision).toBe("ALLOW");
      expect(allowed.decidedAt).toBe(FIXED_DECISION_TIME);
      if (allowed.decision !== "ALLOW") throw new Error("expected_allow");
      expect(allowed.actionToken).toMatch(/^WARDEN-ACTION-TOKEN:/);
      expect(allowed.constraints).toEqual(["MCP_CONFORMANCE_ONLY", "NO_EXTERNAL_EFFECT"]);

      const denied = await callDecision(
        client,
        request({
          requestRef: "WARDEN-REQUEST:MCP-DENY-001",
          correlationId: "CORR-WARDEN-MCP-DENY-001",
          action: "bank.transfer",
          capabilityRef: "bank.transfer",
          targetRef: "BANK:TEST",
        }),
      );
      expect(denied.decision).toBe("DENY");
      expect(denied.reasonCodes).toEqual(["capability_not_permitted"]);
      expect("actionToken" in denied).toBe(false);

      const escalated = await callDecision(
        client,
        request({
          requestRef: "WARDEN-REQUEST:MCP-ESCALATE-001",
          correlationId: "CORR-WARDEN-MCP-ESCALATE-001",
          action: "contract.execute",
          capabilityRef: "contract.execute",
          targetRef: "LAB-CONTRACT-001",
        }),
      );
      expect(escalated.decision).toBe("ESCALATE");
      expect(escalated.reasonCodes).toEqual(["manual_review_required"]);
      expect("actionToken" in escalated).toBe(false);
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it("does not allow a caller-supplied policy object to widen capability authority", async () => {
    const { client, server } = await connectedPair();
    try {
      const denied = await callDecision(
        client,
        request({
          requestRef: "WARDEN-REQUEST:MCP-POLICY-001",
          correlationId: "CORR-WARDEN-MCP-POLICY-001",
          action: "bank.transfer",
          capabilityRef: "bank.transfer",
          targetRef: "BANK:TEST",
        }),
        {
          policy: {
            allowedCapabilityRefs: ["bank.transfer"],
            constraints: [],
          },
        },
      );
      expect(denied.decision).toBe("DENY");
      expect(denied.reasonCodes).toEqual(["capability_not_permitted"]);
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it("preserves deterministic decision identity for an explicitly fixed conformance time", () => {
    const input = { request: request() };
    const first = evaluateWardenConformanceDecision(input, FIXED_DECISION_TIME);
    const second = evaluateWardenConformanceDecision(input, FIXED_DECISION_TIME);
    expect(second).toEqual(first);
  });
});
