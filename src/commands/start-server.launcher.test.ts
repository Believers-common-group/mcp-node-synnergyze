import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";

import {
  enableEnvironmentVariable,
  operationId,
} from "../tools/registerCommerceAlphaOperations.ts";

describe("standard npm MCP launcher", () => {
  it("starts the real stdio server and exposes the explicitly enabled Commerce Alpha tool", async () => {
    const npmExecPath = process.env.npm_execpath;
    if (!npmExecPath) throw new Error("npm_execpath_required_for_launcher_test");

    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        npmExecPath,
        "start",
        "--",
        "--credentials",
        "COMMERCE-ALPHA-NO-ALGOLIA-CALL:COMMERCE-ALPHA-NO-ALGOLIA-CALL",
        "--allow-tools",
        operationId,
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        [enableEnvironmentVariable]: "1",
      } as Record<string, string>,
      stderr: "pipe",
    });
    const client = new Client({ name: "commerce-alpha-launcher-test", version: "0.3.1" });

    try {
      await client.connect(transport);
      const listed = await client.request({ method: "tools/list" }, ListToolsResultSchema);
      expect(listed.tools.map((tool) => tool.name)).toEqual([operationId]);
    } finally {
      await client.close().catch(() => undefined);
      await transport.close().catch(() => undefined);
    }
  }, 10_000);
});
