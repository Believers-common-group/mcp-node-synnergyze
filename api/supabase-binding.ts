import type { IncomingMessage, ServerResponse } from "node:http";

export default function handler(_request: IncomingMessage, response: ServerResponse) {
  const raw = process.env.SUPABASE_URL;
  let projectRef: string | null = null;

  if (raw) {
    try {
      const hostname = new URL(raw).hostname;
      const match = hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
      projectRef = match?.[1] ?? null;
    } catch {
      projectRef = null;
    }
  }

  response.statusCode = 200;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify({
    service: "synnergyze-genesis-mcp",
    supabaseUrlConfigured: Boolean(raw),
    projectRef,
  }));
}
