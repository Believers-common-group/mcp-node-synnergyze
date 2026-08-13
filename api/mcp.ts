import type { IncomingMessage, ServerResponse } from "node:http";
import { neon } from "@neondatabase/serverless";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const CWR_REGISTRY_DATABASE_URL = process.env.CWR_REGISTRY_DATABASE_URL;
const VSR_PUBLIC_DATABASE_URL = process.env.VSR_PUBLIC_DATABASE_URL;

function supabaseConfiguration() {
  return {
    required: false,
    mode: "deferred_optional",
    configured: Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY),
    urlConfigured: Boolean(SUPABASE_URL),
    publishableKeyConfigured: Boolean(SUPABASE_PUBLISHABLE_KEY),
  };
}

function neonProjectionConfiguration() {
  return {
    required: true,
    mode: "runtime_projection",
    configured: Boolean(CWR_REGISTRY_DATABASE_URL && VSR_PUBLIC_DATABASE_URL),
    cwrRegistryConfigured: Boolean(CWR_REGISTRY_DATABASE_URL),
    vsrPublicConfigured: Boolean(VSR_PUBLIC_DATABASE_URL),
  };
}

async function probeSupabase() {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return {
      ok: false,
      required: false,
      deferred: true,
      configured: false,
      error: "Supabase adapter is deferred and not fully configured.",
    };
  }

  const startedAt = Date.now();
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/`, {
    method: "GET",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      accept: "application/openapi+json, application/json",
      "user-agent": "synnergyze-genesis-mcp/0.2.0",
    },
    signal: AbortSignal.timeout(8000),
  });

  return {
    ok: response.ok,
    required: false,
    deferred: true,
    configured: true,
    status: response.status,
    latencyMs: Date.now() - startedAt,
  };
}

async function probeNeonProjection() {
  const missing = [
    ...(CWR_REGISTRY_DATABASE_URL ? [] : ["CWR_REGISTRY_DATABASE_URL"]),
    ...(VSR_PUBLIC_DATABASE_URL ? [] : ["VSR_PUBLIC_DATABASE_URL"]),
  ];

  if (missing.length > 0) {
    return {
      ok: false,
      required: true,
      configured: false,
      missing,
    };
  }

  const startedAt = Date.now();
  const source = neon(CWR_REGISTRY_DATABASE_URL!);
  const target = neon(VSR_PUBLIC_DATABASE_URL!);
  const [sourceRows, targetRows] = await Promise.all([
    source`select 1 as ok`,
    target`select 1 as ok`,
  ]);

  return {
    ok: sourceRows.length === 1 && targetRows.length === 1,
    required: true,
    configured: true,
    cwrRegistryReachable: sourceRows.length === 1,
    vsrPublicReachable: targetRows.length === 1,
    latencyMs: Date.now() - startedAt,
  };
}

function createServer() {
  const server = new McpServer({
    name: "synnergyze-genesis-mcp",
    version: "0.2.0",
  });

  server.tool(
    "genesis_status",
    "Return the deployment, authority-boundary, and persistence status of the Synnergyze Genesis MCP boundary.",
    {},
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            service: "synnergyze-genesis-mcp",
            transport: "streamable-http",
            deployment: "vercel",
            authorityBoundary: {
              canonicalState: "ALPHA-NODE-001 local Registry",
              policyAuthority: "Warden",
              neon: "runtime_projection_only",
              supabase: "deferred_optional_retained_data",
              evidence: "RiverOS + governed object storage",
            },
            neonProjection: neonProjectionConfiguration(),
            supabase: supabaseConfiguration(),
            legacyAlgoliaTools: "quarantined",
          }),
        },
      ],
    }),
  );

  server.tool(
    "genesis_neon_projection_probe",
    "Test read-only connectivity to the governed CWR and VSR Neon projection databases. This performs no database mutation.",
    {},
    async () => {
      try {
        const result = await probeNeonProjection();
        return {
          ...(result.ok ? {} : { isError: true }),
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: false,
                required: true,
                configured: Boolean(CWR_REGISTRY_DATABASE_URL && VSR_PUBLIC_DATABASE_URL),
                error: error instanceof Error ? error.message : "Unknown Neon projection probe failure",
              }),
            },
          ],
        };
      }
    },
  );

  server.tool(
    "genesis_supabase_probe",
    "Inspect the deferred Supabase adapter using only its publishable key. Supabase is not a deployment gate and this performs no database mutation.",
    {},
    async () => {
      try {
        const result = await probeSupabase();
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: false,
                required: false,
                deferred: true,
                configured: Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY),
                error: error instanceof Error ? error.message : "Unknown deferred Supabase probe failure",
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
