import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";

import { CustomMcpServer } from "../CustomMcpServer.ts";
import type { WardenDecisionRequestV1, WardenExecutionCheckpointV1 } from "../../modules/warden/contracts.ts";
import {
  enableEnvironmentVariable,
  maybeRegisterWardenRiverSynnergyzeConformanceExecution,
  operationId,
  registerWardenRiverSynnergyzeConformanceExecution,
  WardenRiverSynnergyzeConformanceExecutionServiceV1,
} from "./registerWardenRiverSynnergyzeConformanceExecution.ts";
import { enableEnvironmentVariable as wardenEnableEnvironmentVariable } from "./registerWardenConformanceDecision.ts";
import { enableEnvironmentVariable as riverEnableEnvironmentVariable } from "./registerRiverWardenConformanceReservation.ts";

const FIXED_TIME = "2026-08-23T02:00:30.000Z";

function request(overrides: Partial<WardenDecisionRequestV1> = {}): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:SYN-EXEC-001",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:001",
    eventRef: "SYNNERGYZE-EVENT:SYN-EXEC-001",
    action: "service_request.create",
    capabilityRef: "service_request.create",
    targetRef: "LAB-SERVICE-DESK-001",
    requestedEffect: "service_request.created",
    authorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    policyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    representationSourceRefs: ["REGISTRY:REPRESENTATION-001"],
    requestedAt: "2026-08-23T02:00:00.000Z",
    correlationId: "CORR-WARDEN-SYN-EXEC-001",
    ...overrides,
  };
}

async function connectedPair(clock: () => string = () => FIXED_TIME) {
  const server = new CustomMcpServer({ name: "synnergyze-test", version: "0.8.0" });
  const client = new Client({ name: "synnergyze-test-client", version: "0.8.0" });
  registerWardenRiverSynnergyzeConformanceExecution(server, clock);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, server };
}

async function callExecution(client: Client, value: WardenDecisionRequestV1) {
  return client.request(
    {
      method: "tools/call",
      params: { name: operationId, arguments: { request: value } },
    },
    CallToolResultSchema,
  );
}

function textResult(result: Awaited<ReturnType<typeof callExecution>>) {
  const first = result.content[0];
  if (!first || first.type !== "text") throw new Error("synnergyze_mcp_text_result_required");
  return first.text;
}

describe("WARDEN-RIVER-SYNNERGYZE-MCP-CONFORMANCE-0.8", () => {
  it("requires all three conformance switches plus the explicit tool allow-list", () => {
    const tool = vi.fn();
    const server = { tool } as unknown as CustomMcpServer;
    const allowed = { allowedTools: new Set([operationId]) };
    const all = {
      [wardenEnableEnvironmentVariable]: "1",
      [riverEnableEnvironmentVariable]: "1",
      [enableEnvironmentVariable]: "1",
    };

    expect(maybeRegisterWardenRiverSynnergyzeConformanceExecution(server, allowed, {})).toBe(false);
    expect(
      maybeRegisterWardenRiverSynnergyzeConformanceExecution(server, allowed, {
        ...all,
        [enableEnvironmentVariable]: "0",
      }),
    ).toBe(false);
    expect(maybeRegisterWardenRiverSynnergyzeConformanceExecution(server, {}, all)).toBe(false);
    expect(tool).not.toHaveBeenCalled();

    expect(maybeRegisterWardenRiverSynnergyzeConformanceExecution(server, allowed, all)).toBe(true);
    expect(tool).toHaveBeenCalledTimes(1);
  });

  it("exposes only the request input and returns EXECUTED_UNVERIFIED without leaking the action token", async () => {
    const { client, server } = await connectedPair();
    try {
      const listed = await client.request({ method: "tools/list" }, ListToolsResultSchema);
      const tool = listed.tools.find((candidate) => candidate.name === operationId);
      expect(tool).toBeDefined();
      expect(tool?.inputSchema.required).toEqual(["request"]);

      const result = await callExecution(client, request());
      expect(result.isError).not.toBe(true);
      const text = textResult(result);
      expect(text).not.toContain("WARDEN-ACTION-TOKEN:");
      expect(text).not.toContain("actionToken");

      const body = JSON.parse(text);
      expect(body.decision.decision).toBe("ALLOW");
      expect(body.reservation.state).toBe("RESERVED");
      expect(body.checkpoint.state).toBe("VALID");
      expect(body.checkpoint.synthetic).toBe(true);
      expect(body.executionReceipt.state).toBe("EXECUTED_UNVERIFIED");
      expect(body.executionReceipt.synthetic).toBe(true);
      expect(body.executionReceipt.idempotentReplay).toBe(false);
      expect(body.executionReceipt).not.toHaveProperty("effectRef");
      expect(body.executionReceipt).not.toHaveProperty("verifiedAt");
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it("replays the execution idempotently when server time advances", async () => {
    const times = [FIXED_TIME, "2026-08-23T02:05:00.000Z"];
    let index = 0;
    const { client, server } = await connectedPair(() => times[Math.min(index++, times.length - 1)]);
    try {
      const first = JSON.parse(textResult(await callExecution(client, request())));
      const second = JSON.parse(textResult(await callExecution(client, request())));
      expect(second.executionReceipt.receiptRef).toBe(first.executionReceipt.receiptRef);
      expect(second.executionReceipt.executedAt).toBe(first.executionReceipt.executedAt);
      expect(second.executionReceipt.idempotentReplay).toBe(true);
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it("does not checkpoint or execute DENY and ESCALATE decisions", async () => {
    const { client, server } = await connectedPair();
    try {
      const denied = JSON.parse(
        textResult(
          await callExecution(
            client,
            request({
              requestRef: "WARDEN-REQUEST:SYN-DENY-001",
              correlationId: "CORR-WARDEN-SYN-DENY-001",
              action: "bank.transfer",
              capabilityRef: "bank.transfer",
              targetRef: "BANK:TEST",
            }),
          ),
        ),
      );
      expect(denied.decision.decision).toBe("DENY");
      expect(denied.reservation).toBeNull();
      expect(denied.checkpoint).toBeNull();
      expect(denied.executionReceipt).toBeNull();

      const escalated = JSON.parse(
        textResult(
          await callExecution(
            client,
            request({
              requestRef: "WARDEN-REQUEST:SYN-ESCALATE-001",
              correlationId: "CORR-WARDEN-SYN-ESCALATE-001",
              action: "contract.execute",
              capabilityRef: "contract.execute",
              targetRef: "LAB-CONTRACT-001",
            }),
          ),
        ),
      );
      expect(escalated.decision.decision).toBe("ESCALATE");
      expect(escalated.reservation).toBeNull();
      expect(escalated.checkpoint).toBeNull();
      expect(escalated.executionReceipt).toBeNull();
    } finally {
      await Promise.all([client.close(), server.close()]);
    }
  });

  it("blocks a revoked execution checkpoint before adapter invocation", () => {
    const service = new WardenRiverSynnergyzeConformanceExecutionServiceV1((binding, checkedAt) => {
      if (binding.decision.decision !== "ALLOW") throw new Error("expected_allow");
      const checkpoint: WardenExecutionCheckpointV1 = {
        checkpointRef: `WARDEN-EXEC-CHECK:REVOKED:${binding.decision.decisionRef}`,
        decisionRef: binding.decision.decisionRef,
        wardenRef: binding.decision.wardenRef,
        correlationId: binding.decision.correlationId,
        state: "REVOKED",
        checkedAt,
        reasonCodes: ["synthetic_revocation_test"],
      };
      return checkpoint;
    });

    expect(() => service.execute({ request: request() }, FIXED_TIME)).toThrow(
      "execution_warden_checkpoint_revoked",
    );
    expect(service.adapterInvocationCount()).toBe(0);
    expect(service.executionCount()).toBe(0);
  });

  it("fails closed for device-bound execution until fresh execution-time device security is wired", () => {
    const service = new WardenRiverSynnergyzeConformanceExecutionServiceV1();
    expect(() =>
      service.execute(
        {
          request: request({
            executionDeviceRef: "ALPHA-DEVICE-001",
            deviceSecurityState: "ACTIVE",
            deviceSecuritySourceRefs: ["RIVER-EVIDENCE:DEVICE-REQUEST-001"],
            deviceSecurityResolvedAt: "2026-08-23T01:59:50.000Z",
            deviceSecurityValidUntil: "2026-08-23T02:05:00.000Z",
          }),
        },
        FIXED_TIME,
      ),
    ).toThrow("synnergyze_conformance_execution_device_security_not_bound");
    expect(service.adapterInvocationCount()).toBe(0);
  });
});
