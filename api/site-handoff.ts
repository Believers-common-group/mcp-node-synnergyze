import type { IncomingMessage, ServerResponse } from "node:http";

export default function handler(request: IncomingMessage, response: ServerResponse) {
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");

  if (request.method !== "GET") {
    response.statusCode = 405;
    response.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
    return;
  }

  response.statusCode = 200;
  response.end(
    JSON.stringify({
      ok: true,
      registry_object: "REG-SITE-HANDOFF-001",
      alpha_node_id: "ALPHA-NODE-001",
      authority_boundary: "WARDEN",
      registered_apps: ["APP-BC-001", "APP-CC-001"],
      session_policy: "NO_SHARED_CROSS_DOMAIN_COOKIE",
      token_ttl_seconds_max: 120,
      replay_protection_required: true,
      river_evidence_required: true,
      activation_allowed: false,
      status: "SCAFFOLDED_NOT_ACTIVATED",
      next_gate: "DURABLE_REPLAY_STORE_AND_WARDEN_GRANT_VERIFIER",
    }),
  );
}
