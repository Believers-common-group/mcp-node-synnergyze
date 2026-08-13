#!/usr/bin/env -S node --experimental-strip-types

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CONFIG } from "../config.ts";
import { CustomMcpServer } from "../CustomMcpServer.ts";
import { registerAlphaNewtonMetalTools } from "../tools/registerAlphaNewtonMetalTools.ts";
import { registerAppleRunnerCanary } from "../tools/registerAppleRunnerCanary.ts";

/**
 * Standalone Alpha Node / Newton agentic-builder MCP surface.
 *
 * Planning tools remain provider-neutral. APPLE-RUNNER-001 is the first
 * execution adapter and is intentionally narrow: it runs one fixed Metal
 * canary on macOS only after verifying a Warden-signed, single-use capability.
 */
export async function startAlphaNewtonServer(): Promise<CustomMcpServer> {
  const server = new CustomMcpServer({
    name: "alpha-newton",
    version: CONFIG.version,
    capabilities: {
      resources: {},
      tools: {},
    },
  });

  registerAlphaNewtonMetalTools(server);
  registerAppleRunnerCanary(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
