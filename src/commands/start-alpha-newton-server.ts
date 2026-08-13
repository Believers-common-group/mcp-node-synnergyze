#!/usr/bin/env -S node --experimental-strip-types

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CONFIG } from "../config.ts";
import { CustomMcpServer } from "../CustomMcpServer.ts";
import { registerAlphaNewtonMetalTools } from "../tools/registerAlphaNewtonMetalTools.ts";

/**
 * Standalone Alpha Node / Newton agentic-builder MCP surface.
 *
 * This command deliberately does not initialize Algolia credentials or any
 * deployment provider. The first tool pack is planning-only and returns
 * pending Warden authority envelopes. Provider-specific execution adapters
 * can be added behind the same governance boundary later.
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
  return server;
}
