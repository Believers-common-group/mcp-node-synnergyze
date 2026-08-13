import { describe, expect, it } from "vitest";
import type { CustomMcpServer } from "../CustomMcpServer.ts";
import {
  AlphaNewtonOperationIds,
  registerAlphaNewtonMetalTools,
} from "./registerAlphaNewtonMetalTools.ts";

type CapturedTool = {
  name: string;
  cb: (...args: unknown[]) => string | Promise<string>;
};

function captureTools(): CapturedTool[] {
  const tools: CapturedTool[] = [];
  const server = {
    tool(definition: CapturedTool) {
      tools.push(definition);
    },
  } as unknown as CustomMcpServer;

  registerAlphaNewtonMetalTools(server);
  return tools;
}

describe("Alpha Newton tool pack", () => {
  it("registers the five first-slice tools", () => {
    const tools = captureTools();
    expect(tools.map((tool) => tool.name)).toEqual([
      AlphaNewtonOperationIds.listCapabilities,
      AlphaNewtonOperationIds.planMetalWorkload,
      AlphaNewtonOperationIds.routeExecutionTarget,
      AlphaNewtonOperationIds.planDevOpsRun,
      AlphaNewtonOperationIds.createAuthorityEnvelope,
    ]);
  });

  it("routes Metal work on Linux to a remote Apple runner", async () => {
    const routeTool = captureTools().find(
      (tool) => tool.name === AlphaNewtonOperationIds.routeExecutionTarget,
    );
    expect(routeTool).toBeDefined();

    const result = JSON.parse(
      await routeTool!.cb({
        workloadClass: "compute",
        requiresMetal: true,
        localHostClass: "linux",
      }),
    );

    expect(result.route).toBe("CONTROL_PLANE_TO_REMOTE_APPLE_RUNNER");
    expect(result.localMetalCapable).toBe(false);
    expect(result.executionAllowed).toBe(false);
  });

  it("keeps authority envelopes pending until Warden authorization", async () => {
    const envelopeTool = captureTools().find(
      (tool) => tool.name === AlphaNewtonOperationIds.createAuthorityEnvelope,
    );
    expect(envelopeTool).toBeDefined();

    const result = JSON.parse(
      await envelopeTool!.cb({
        digitalMeId: "DM-TEST-001",
        authorityRef: "AUTH-TEST-001",
        workspaceRef: "ALPHA-NODE-001",
        intent: "compile synthetic Metal fixture",
        requestedTool: "apple-runner-build",
      }),
    );

    expect(result.status).toBe("PENDING_WARDEN_AUTHORIZATION");
    expect(result.executionAllowed).toBe(false);
    expect(result.principal).toBe("DM-TEST-001");
  });
});
