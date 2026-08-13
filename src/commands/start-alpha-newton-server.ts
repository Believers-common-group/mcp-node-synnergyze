#!/usr/bin/env -S node --experimental-strip-types

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CONFIG } from "../config.ts";
import { CustomMcpServer } from "../CustomMcpServer.ts";
import { registerAlphaNewtonMetalTools } from "../tools/registerAlphaNewtonMetalTools.ts";
import { registerAppleRunnerBuild } from "../tools/registerAppleRunnerBuild.ts";
import { registerAppleRunnerCanary } from "../tools/registerAppleRunnerCanary.ts";

/**
 * Standalone Alpha Node / Newton agentic-builder MCP surface.
 *
 * Planning tools remain provider-neutral. APPLE-RUNNER-001 exposes only
 * constrained, Warden-gated execution adapters: one deterministic Metal
 * canary and one fixed Swift/Metal package build/test/artifact workflow.
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
  registerAppleRunnerBuild(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
