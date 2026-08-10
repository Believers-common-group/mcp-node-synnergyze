import type { IncomingMessage, ServerResponse } from "node:http";

export default function handler(_request: IncomingMessage, response: ServerResponse) {
  response.statusCode = 200;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(
    JSON.stringify({
      ok: true,
      service: "synnergyze-genesis-mcp",
      runtime: "vercel-node",
      timestamp: new Date().toISOString(),
    }),
  );
}
