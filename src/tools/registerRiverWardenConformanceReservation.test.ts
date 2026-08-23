import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";

import { CustomMcpServer } from "../CustomMcpServer.ts";
import type { WardenDecisionRequestV1 } from "../../modules/warden/contracts.ts";
import {
  enableEnvironmentVariable,
  maybeRegisterRiverWardenConformanceReservation,
  operationId,
  registerRiverWardenConformanceReservation,
} from "./registerRiverWardenConformanceReservation.ts";
import { enableEnvironmentVariable as wardenEnableEnvironmentVariable } from "./registerWardenConformanceDecision.ts";

const FIXED_TIME = "2026-08-23T01:00:30.000Z";

function request(overrides: Partial<WardenDecisionRequestV1> = {}): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:RIVER-MCP-001",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:001",
    eventRef: "SYNNERGYZE-EVENT:RIVER-MCP-001:001",
    action: "service_request.create",
    capabilityRef: "service_request.create",
    targetRef: "LAB-SERVICE-DESK-001",
    requestedEffect: "service_request.created",
    authorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    policyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    representationSourceRefs: ["REGISTRY:REPRESENTATION-001"],
    requestedAt: "2026-08-23T01:00:00.000Z",
    correlationId: "CORR-WARDEN-RIVER-MCP-001",
    ...overrides,
  };
}

async function connectedPair() {
  const server = new CustomMcpServer({ name: "river-warden-test", version: "0.7.0" });
  const client = new Client({ name: "river-warden-test-client", version: "0.7.0" });
  registerRiverWardenConformanceReservation(server, () => FIXED_TIME);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, server };
}

async function callReservation(client: Client, decisionRequest: WardenDecisionRequestV1) {
  return client.request(
    {
      method: "tools/call",
      params: {
        name: operationId,
        arguments: { request: decisionRequest },
      },
    },
    CallToolResultSchema,
  );
}

function textResult(result: Awaited<ReturnType<typeof callReservation>>) {
  const first = result.content[0];
  if (!first || first.type !== "text") throw new Error("river_warden_mcp_text_result_required");
  return first.text;
}

describe("WARDEN-RIVER-MCP-CONFORMANCE-0.7", () => {
  it("requires both conformance environment switches plus explicit allow-tools", () => {
    const tool = vi.fn();
    const server = { tool } as unknown as CustomMcpServer;
    const allowed = { allowedTools: new Set([operationId]) };

    expect(
      maybeRegisterRiverWardenConformanceReservation(server, allowed, {
        [wardenEnableEnvironmentVariable]: "1",
      }),
    ).toBe(false);
    expect(
      maybeRegisterRiverWardenConformanceReservation(server, allowed, {
        [enableEnvironmentVariable]: "1",
      }),
    ).toBe(false);
    expect(
      maybeRegisterRiverWardenConformanceReservation(server, {}, {
        [wardenEnableEnvironmentVariable]: "1",
        [enableEnvironmentVariable]: "1",
      }),
    ).toBe(false);
    expect(tool).not.toHaveBeenCalled();

    expect(
      maybeRegisterRiverWardenConformanceReservation(server, allowed, {
        [wardenEnableEnvironmentVariable]: "1",
        [enableEnvironmentVariable]: "1",
      }),
    ).toBe(true);
    expect(tool).toHaveBeenCalledTimes(1);
  });

  it("exposes only the Warden request and keeps policy/time internal", async () => {
    const { client, server } = await connectedPair();
    try {
      const listed = await client.request({ method: "tools/list" }, ListToolsResultSchema);
      const tool = listed.tools.find((candidate) => candidate.name === operationId);
      expect(tool).toBeDefined();
      expect(tool?.annotations).toEqual({ destructiveHint: false, readOnlyHint: false });
      expect(tool?.inputSchema.required).toEqual(["request"]);
      expect(tool?.inputSchema.properties).not.toHaveProperty("policy");
      expect(tool?.inputSchema.properties).not.toHaveProperty("decidedAt");
      expect(tool?.inputSchema.properties).not.toHaveProperty("reservedAt");
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it("binds an ALLOW decision to one River reservation without returning the raw action token", async () => {
    const { client, server } = await connectedPair();
    try {
      const result = await callReservation(client, request());
      expect(result.isError).not.toBe(true);
      const text = textResult(result);
      expect(text).not.toContain("WARDEN-ACTION-TOKEN:");
      expect(text).not.toContain("actionToken");

      const parsed = JSON.parse(text);
      expect(parsed.decision.decision).toBe("ALLOW");
      expect(parsed.decision.decidedAt).toBe(FIXED_TIME);
      expect(parsed.actionRef).toMatch(/^ACTION:/);
      expect(parsed.reservation.state).toBe("RESERVED");
      expect(parsed.reservation.reservationRef).toMatch(/^RIVER-RESERVATION:/);
      expect(parsed.reservation.actionRef).toBe(parsed.actionRef);
      expect(parsed.reservation.wardenDecisionRef).toBe(parsed.decision.decisionRef);
      expect(parsed.reservation.authorizationDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(parsed.reservation.reservedAt).toBe(FIXED_TIME);
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it("returns the same reservation for exact replay", async () => {
    const { client, server } = await connectedPair();
    try {
      const first = await callReservation(client, request());
      const second = await callReservation(client, request());
      expect(first.isError).not.toBe(true);
      expect(second.isError).not.toBe(true);
      expect(JSON.parse(textResult(second))).toEqual(JSON.parse(textResult(first)));
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it("creates no River reservation for DENY or ESCALATE", async () => {
    const { client, server } = await connectedPair();
    try {
      const denied = await callReservation(
        client,
        request({
          requestRef: "WARDEN-REQUEST:RIVER-DENY-001",
          correlationId: "CORR-WARDEN-RIVER-DENY-001",
          action: "bank.transfer",
          capabilityRef: "bank.transfer",
          targetRef: "BANK:TEST",
        }),
      );
      const deniedBody = JSON.parse(textResult(denied));
      expect(deniedBody.decision.decision).toBe("DENY");
      expect(deniedBody.actionRef).toBeNull();
      expect(deniedBody.reservation).toBeNull();

      const escalated = await callReservation(
        client,
        request({
          requestRef: "WARDEN-REQUEST:RIVER-ESCALATE-001",
          correlationId: "CORR-WARDEN-RIVER-ESCALATE-001",
          action: "contract.execute",
          capabilityRef: "contract.execute",
          targetRef: "LAB-CONTRACT-001",
        }),
      );
      const escalatedBody = JSON.parse(textResult(escalated));
      expect(escalatedBody.decision.decision).toBe("ESCALATE");
      expect(escalatedBody.actionRef).toBeNull();
      expect(escalatedBody.reservation).toBeNull();
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it("fails closed when one correlation is replayed for a different authorized action", async () => {
    const { client, server } = await connectedPair();
    try {
      const first = await callReservation(client, request());
      expect(first.isError).not.toBe(true);

      const conflict = await callReservation(
        client,
        request({
          requestRef: "WARDEN-REQUEST:RIVER-MCP-002",
          eventRef: "SYNNERGYZE-EVENT:RIVER-MCP-001:002",
          targetRef: "LAB-SERVICE-DESK-002",
        }),
      );
      expect(conflict.isError).toBe(true);
      expect(textResult(conflict)).toContain("river_reservation_correlation_conflict");
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });
});
