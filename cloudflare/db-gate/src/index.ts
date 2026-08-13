import { Client } from "pg";

const WARDEN_VERIFY_URL = "https://warden.internal/v1/authorize";
const OP_RUNTIME_HEALTH = "runtime.health";
const OP_REGISTRY_INBOX_LOOKUP = "registry.inbox.lookup";

type JsonRecord = Record<string, unknown>;

type GateRequest =
  | {
      operation: typeof OP_RUNTIME_HEALTH;
      input?: JsonRecord;
    }
  | {
      operation: typeof OP_REGISTRY_INBOX_LOOKUP;
      input: {
        source_node_code: string;
        event_reference: string;
      };
    };

type WardenDecision = {
  allowed: boolean;
  authority_ref: string;
  operation: string;
  execution_lease_id?: string | null;
  expires_at?: string | null;
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
    },
  });
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseGateRequest(value: unknown): GateRequest | null {
  if (!isRecord(value) || !nonEmptyString(value.operation)) return null;

  if (value.operation === OP_RUNTIME_HEALTH) {
    return { operation: OP_RUNTIME_HEALTH };
  }

  if (value.operation === OP_REGISTRY_INBOX_LOOKUP) {
    if (!isRecord(value.input)) return null;
    if (!nonEmptyString(value.input.source_node_code)) return null;
    if (!nonEmptyString(value.input.event_reference)) return null;

    return {
      operation: OP_REGISTRY_INBOX_LOOKUP,
      input: {
        source_node_code: value.input.source_node_code,
        event_reference: value.input.event_reference,
      },
    };
  }

  return null;
}

function parseWardenDecision(value: unknown): WardenDecision | null {
  if (!isRecord(value)) return null;
  if (typeof value.allowed !== "boolean") return null;
  if (!nonEmptyString(value.authority_ref)) return null;
  if (!nonEmptyString(value.operation)) return null;

  return {
    allowed: value.allowed,
    authority_ref: value.authority_ref,
    operation: value.operation,
    execution_lease_id: nonEmptyString(value.execution_lease_id)
      ? value.execution_lease_id
      : null,
    expires_at: nonEmptyString(value.expires_at) ? value.expires_at : null,
  };
}

async function authorize(
  request: Request,
  env: Env,
  gateRequest: GateRequest,
  requestId: string,
): Promise<{ ok: true; decision: WardenDecision } | { ok: false; response: Response }> {
  const authorityRef = request.headers.get("x-warden-authority-ref");
  const actorRef = request.headers.get("x-digitalme-ref");
  const contextRef = request.headers.get("x-context-ref");
  const executionLeaseId = request.headers.get("x-execution-lease-id");

  if (!authorityRef || !actorRef || !contextRef) {
    return {
      ok: false,
      response: json(
        {
          ok: false,
          error: "governance_headers_required",
          required: ["x-warden-authority-ref", "x-digitalme-ref", "x-context-ref"],
          request_id: requestId,
        },
        400,
      ),
    };
  }

  let response: Response;

  try {
    response = await env.WARDEN.fetch(
      new Request(WARDEN_VERIFY_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
        },
        body: JSON.stringify({
          gate_code: env.GATE_CODE,
          node_code: env.NODE_CODE,
          actor_ref: actorRef,
          context_ref: contextRef,
          authority_ref: authorityRef,
          execution_lease_id: executionLeaseId,
          operation: gateRequest.operation,
        }),
      }),
    );
  } catch {
    return {
      ok: false,
      response: json(
        { ok: false, error: "warden_unreachable", request_id: requestId },
        503,
      ),
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      response: json(
        {
          ok: false,
          error: "warden_denied_or_unavailable",
          request_id: requestId,
        },
        response.status === 401 || response.status === 403 ? 403 : 503,
      ),
    };
  }

  const decision = parseWardenDecision(await response.json());

  if (!decision) {
    return {
      ok: false,
      response: json({ ok: false, error: "invalid_warden_decision", request_id: requestId }, 502),
    };
  }

  if (
    !decision.allowed ||
    decision.authority_ref !== authorityRef ||
    decision.operation !== gateRequest.operation
  ) {
    return {
      ok: false,
      response: json({ ok: false, error: "authority_mismatch", request_id: requestId }, 403),
    };
  }

  return { ok: true, decision };
}

async function executeReadOnlyOperation(env: Env, gateRequest: GateRequest) {
  const client = new Client({
    connectionString: env.HYPERDRIVE_AUTH.connectionString,
  });

  await client.connect();

  try {
    if (gateRequest.operation === OP_RUNTIME_HEALTH) {
      const result = await client.query(
        "select current_database() as database_name, now() as database_time",
      );
      return { operation: gateRequest.operation, rows: result.rows };
    }

    const result = await client.query(
      `select
         source_node_code,
         event_reference,
         change_code,
         event_code,
         object_type,
         object_code,
         registry_revision_ref,
         evidence_reference,
         processing_state,
         received_at
       from uoe_growth_runtime.registry_inbox
       where source_node_code = $1
         and event_reference = $2
       limit 1`,
      [gateRequest.input.source_node_code, gateRequest.input.event_reference],
    );

    return { operation: gateRequest.operation, rows: result.rows };
  } finally {
    await client.end();
  }
}

export default {
  async fetch(request, env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        ok: true,
        gate: env.GATE_CODE,
        node: env.NODE_CODE,
        environment: env.ENVIRONMENT,
        database_checked: false,
        request_id: requestId,
      });
    }

    if (request.method !== "POST" || url.pathname !== "/v1/query") {
      return json({ ok: false, error: "not_found", request_id: requestId }, 404);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "invalid_json", request_id: requestId }, 400);
    }

    const gateRequest = parseGateRequest(body);
    if (!gateRequest) {
      return json({ ok: false, error: "invalid_operation", request_id: requestId }, 400);
    }

    const authorization = await authorize(request, env, gateRequest, requestId);
    if (!authorization.ok) return authorization.response;

    try {
      const result = await executeReadOnlyOperation(env, gateRequest);

      console.log(
        JSON.stringify({
          event: "bnr_db_gate_query_complete",
          request_id: requestId,
          gate: env.GATE_CODE,
          node: env.NODE_CODE,
          operation: gateRequest.operation,
          authority_ref: authorization.decision.authority_ref,
          row_count: result.rows.length,
        }),
      );

      return json({
        ok: true,
        gate: env.GATE_CODE,
        node: env.NODE_CODE,
        request_id: requestId,
        operation: result.operation,
        rows: result.rows,
      });
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "bnr_db_gate_query_failed",
          request_id: requestId,
          gate: env.GATE_CODE,
          node: env.NODE_CODE,
          operation: gateRequest.operation,
          error: error instanceof Error ? error.name : "unknown_error",
        }),
      );

      return json({ ok: false, error: "database_operation_failed", request_id: requestId }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
