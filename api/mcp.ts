import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

function createServer() {
  const server = new McpServer({
    name: "synnergyze-genesis-mcp",
    version: "0.1.0",
  });

  server.tool(
    "genesis_status",
    "Return the deployment and integration status of the Synnergyze Genesis MCP boundary.",
    {},
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            service: "synnergyze-genesis-mcp",
            transport: "streamable-http",
            deployment: "vercel",
            supabase: "not-attached",
            legacyAlgoliaTools: "quarantined",
          }),
        },
      ],
    }),
  );

  server.tool(
    "genesis_echo",
    "Connectivity test for the Genesis MCP transport. It performs no external action.",
    { message: z.string().max(2000) },
    async ({ message }) => ({
      content: [{ type: "text", text: message }],
    }),
  );

  return server;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "POST") {
    response.statusCode = 405;
    response.setHeader("allow", "POST");
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ error: "Use POST for MCP requests." }));
    return;
  }

  try {
    const body = await readJsonBody(request);
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    response.on("close", () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(request, response, body);
  } catch (error) {
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(
        JSON.stringify({
          error: "Genesis MCP request failed.",
          detail: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    }
  }
}
