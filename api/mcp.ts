import type { IncomingMessage, ServerResponse } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

// Alpha-safe public client configuration. Supabase publishable keys are designed
// for public clients; secret/service-role keys must never be added here.
const ALPHA_SUPABASE_PUBLISHABLE_KEYS: Readonly<Record<string, string>> = {
  ayrivdysmbphhlqjmdtc: "sb_publishable_u0-I8HkVLnTOyV_tjVO8Pw_B-RkrpJj",
};

function configuredSupabaseProjectRef() {
  if (!SUPABASE_URL) return undefined;
  try {
    const hostname = new URL(SUPABASE_URL).hostname;
    return hostname.match(/^([a-z0-9]+)\.supabase\.co$/i)?.[1];
  } catch {
    return undefined;
  }
}

function effectiveSupabasePublishableKey() {
  const projectRef = configuredSupabaseProjectRef();
  if (projectRef && ALPHA_SUPABASE_PUBLISHABLE_KEYS[projectRef]) {
    return ALPHA_SUPABASE_PUBLISHABLE_KEYS[projectRef];
  }
  return SUPABASE_PUBLISHABLE_KEY;
}

function supabaseConfiguration() {
  const projectRef = configuredSupabaseProjectRef();
  const publishableKey = effectiveSupabasePublishableKey();
  return {
    configured: Boolean(SUPABASE_URL && publishableKey),
    urlConfigured: Boolean(SUPABASE_URL),
    publishableKeyConfigured: Boolean(publishableKey),
    projectBoundPublishableKey: Boolean(projectRef && ALPHA_SUPABASE_PUBLISHABLE_KEYS[projectRef]),
  };
}

async function probeSupabase() {
  const publishableKey = effectiveSupabasePublishableKey();
  if (!SUPABASE_URL || !publishableKey) {
    return {
      ok: false,
      configured: false,
      error: "Supabase environment variables are not configured.",
    };
  }

  const startedAt = Date.now();
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/`, {
    method: "GET",
    headers: {
      apikey: publishableKey,
      accept: "application/openapi+json, application/json",
      "user-agent": "synnergyze-genesis-mcp/0.1.0",
    },
    signal: AbortSignal.timeout(8000),
  });

  return {
    ok: response.ok,
    configured: true,
    status: response.status,
    latencyMs: Date.now() - startedAt,
  };
}

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
            supabase: supabaseConfiguration(),
            legacyAlgoliaTools: "quarantined",
          }),
        },
      ],
    }),
  );

  server.tool(
    "genesis_supabase_probe",
    "Test network/API reachability to the configured Supabase project using only its publishable key. This performs no database mutation.",
    {},
    async () => {
      try {
        const result = await probeSupabase();
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: false,
                configured: true,
                error: error instanceof Error ? error.message : "Unknown Supabase probe failure",
              }),
            },
          ],
        };
      }
    },
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
      enableJsonResponse: true,
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
