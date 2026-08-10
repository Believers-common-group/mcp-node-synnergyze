import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "../src/commands/start-server.ts";

interface VercelRequest extends IncomingMessage {
  body?: unknown;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
}

function hasValidBearerToken(request: IncomingMessage, expected: string): boolean {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return false;

  const actual = Buffer.from(authorization.slice("Bearer ".length));
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

function hasAllowedOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;

  const configured = process.env.MCP_ALLOWED_ORIGINS;
  if (!configured) return false;

  const allowed = configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.includes(origin);
}

export default async function handler(request: VercelRequest, response: ServerResponse) {
  const bearerToken = process.env.MCP_BEARER_TOKEN;
  const applicationId = process.env.ALGOLIA_APPLICATION_ID;
  const apiKey = process.env.ALGOLIA_API_KEY;

  if (!bearerToken || !applicationId || !apiKey) {
    return sendJson(response, 503, {
      error: "MCP runtime is not configured",
    });
  }

  if (!hasAllowedOrigin(request)) {
    return sendJson(response, 403, { error: "Origin not allowed" });
  }

  if (!hasValidBearerToken(request, bearerToken)) {
    response.setHeader("www-authenticate", "Bearer");
    return sendJson(response, 401, { error: "Unauthorized" });
  }

  const server = await createServer({
    credentials: { applicationId, apiKey },
  });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  } finally {
    await transport.close();
    await server.close();
  }
}
