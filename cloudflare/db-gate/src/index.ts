import { Client } from "pg";

const WARDEN_VERIFY_URL = "https://warden.internal/v1/authorize";
const WARDEN_CONSUME_URL = "https://warden.internal/v1/consume";
const OP_RUNTIME_HEALTH = "runtime.health";
const OP_REGISTRY_INBOX_LOOKUP = "registry.inbox.lookup";
const OP_RUNTIME_CANARY_RECORD = "runtime.canary.record";

type JsonRecord = Record<string, unknown>;

type ReadGateRequest =
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

type MutationGateRequest = {
  operation: typeof OP_RUNTIME_CANARY_RECORD;
  input: {
    canary_ref: string;
    payload: JsonRecord;
  };
};

type GateRequest = ReadGateRequest | MutationGateRequest;

type GovernanceContext = {
  authorityRef: string;
  actorRef: string;
  contextRef: string;
  executionLeaseId: string | null;
  idempotencyKey: string | null;
};

type WardenDecision = {
  allowed: boolean;
  authority_ref: string;
  operation: string;
  execution_lease_id?: string | null;
  command_fingerprint?: string | null;
  expires_at?: string | null;
};

type CanaryReceiptRow = {
  command_id: string;
  operation_code: string;
  command_fingerprint: string;
  canary_ref: string;
  payload: unknown;
  actor_ref: string;
  context_ref: string;
  authority_ref: string;
  execution_lease_id: string;
  accepted_at: string | Date;
  receipt_id: string;
  receipt_ref: string;
  warden_consumption_state: "pending" | "consumed";
  warden_consumed_at: string | Date | null;
};

class GateError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "GateError";
    this.code = code;
    this.status = status;
  }
}

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

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function stableJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

export async function fingerprintCommand(gateRequest: MutationGateRequest) {
  const encoded = new TextEncoder().encode(
    stableJson({ operation: gateRequest.operation, input: gateRequest.input }),
  );
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isMutationOperation(
  gateRequest: GateRequest,
): gateRequest is MutationGateRequest {
  return gateRequest.operation === OP_RUNTIME_CANARY_RECORD;
}

export function parseGateRequest(value: unknown): GateRequest | null {
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

  if (value.operation === OP_RUNTIME_CANARY_RECORD) {
    if (!isRecord(value.input)) return null;
    if (!nonEmptyString(value.input.canary_ref)) return null;
    if (!isRecord(value.input.payload)) return null;

    return {
      operation: OP_RUNTIME_CANARY_RECORD,
      input: {
        canary_ref: value.input.canary_ref,
        payload: value.input.payload,
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
    command_fingerprint: nonEmptyString(value.command_fingerprint)
      ? value.command_fingerprint
      : null,
    expires_at: nonEmptyString(value.expires_at) ? value.expires_at : null,
  };
}

export function validateWardenDecision(
  decision: WardenDecision,
  governance: GovernanceContext,
  gateRequest: GateRequest,
  commandFingerprint: string | null,
  nowMs = Date.now(),
): string | null {
  if (!decision.allowed) return "authority_denied";
  if (decision.authority_ref !== governance.authorityRef) return "authority_mismatch";
  if (decision.operation !== gateRequest.operation) return "authority_operation_mismatch";

  if (decision.expires_at) {
    const expiresAtMs = Date.parse(decision.expires_at);
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) return "authority_expired";
  }

  if (isMutationOperation(gateRequest)) {
    if (!governance.executionLeaseId) return "execution_lease_required";
    if (!governance.idempotencyKey) return "idempotency_key_required";
    if (!decision.expires_at) return "authority_expiry_required";
    if (decision.execution_lease_id !== governance.executionLeaseId) {
      return "execution_lease_mismatch";
    }
    if (!commandFingerprint || decision.command_fingerprint !== commandFingerprint) {
      return "command_fingerprint_mismatch";
    }
  }

  return null;
}

function readGovernanceContext(
  request: Request,
  mutation: boolean,
  requestId: string,
): { ok: true; governance: GovernanceContext } | { ok: false; response: Response } {
  const governance: GovernanceContext = {
    authorityRef: request.headers.get("x-warden-authority-ref")?.trim() ?? "",
    actorRef: request.headers.get("x-digitalme-ref")?.trim() ?? "",
    contextRef: request.headers.get("x-context-ref")?.trim() ?? "",
    executionLeaseId: request.headers.get("x-execution-lease-id")?.trim() || null,
    idempotencyKey: request.headers.get("x-idempotency-key")?.trim() || null,
  };

  const missing = [
    ...(!governance.authorityRef ? ["x-warden-authority-ref"] : []),
    ...(!governance.actorRef ? ["x-digitalme-ref"] : []),
    ...(!governance.contextRef ? ["x-context-ref"] : []),
    ...(mutation && !governance.executionLeaseId ? ["x-execution-lease-id"] : []),
    ...(mutation && !governance.idempotencyKey ? ["x-idempotency-key"] : []),
  ];

  if (missing.length > 0) {
    return {
      ok: false,
      response: json(
        {
          ok: false,
          error: "governance_headers_required",
          required: missing,
          request_id: requestId,
        },
        400,
      ),
    };
  }

  return { ok: true, governance };
}

async function authorize(
  env: Env,
  governance: GovernanceContext,
  gateRequest: GateRequest,
  commandFingerprint: string | null,
  requestId: string,
): Promise<{ ok: true; decision: WardenDecision } | { ok: false; response: Response }> {
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
          actor_ref: governance.actorRef,
          context_ref: governance.contextRef,
          authority_ref: governance.authorityRef,
          execution_lease_id: governance.executionLeaseId,
          idempotency_key: governance.idempotencyKey,
          operation: gateRequest.operation,
          command_fingerprint: commandFingerprint,
        }),
      }),
    );
  } catch {
    return {
      ok: false,
      response: json({ ok: false, error: "warden_unreachable", request_id: requestId }, 503),
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      response: json(
        { ok: false, error: "warden_denied_or_unavailable", request_id: requestId },
        response.status === 401 || response.status === 403 ? 403 : 503,
      ),
    };
  }

  let decision: WardenDecision | null = null;
  try {
    decision = parseWardenDecision(await response.json());
  } catch {
    decision = null;
  }

  if (!decision) {
    return {
      ok: false,
      response: json({ ok: false, error: "invalid_warden_decision", request_id: requestId }, 502),
    };
  }

  const decisionError = validateWardenDecision(
    decision,
    governance,
    gateRequest,
    commandFingerprint,
  );

  if (decisionError) {
    return {
      ok: false,
      response: json({ ok: false, error: decisionError, request_id: requestId }, 403),
    };
  }

  return { ok: true, decision };
}

async function executeReadOnlyOperation(env: Env, gateRequest: ReadGateRequest) {
  const client = new Client({ connectionString: env.HYPERDRIVE_AUTH.connectionString });
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

function canaryEnvelopeMatches(
  existing: CanaryReceiptRow,
  env: Env,
  governance: GovernanceContext,
  gateRequest: MutationGateRequest,
  commandFingerprint: string,
) {
  return (
    existing.operation_code === gateRequest.operation &&
    existing.command_fingerprint === commandFingerprint &&
    existing.canary_ref === gateRequest.input.canary_ref &&
    stableJson(existing.payload) === stableJson(gateRequest.input.payload) &&
    existing.actor_ref === governance.actorRef &&
    existing.context_ref === governance.contextRef &&
    existing.authority_ref === governance.authorityRef &&
    existing.execution_lease_id === governance.executionLeaseId &&
    env.NODE_CODE.length > 0
  );
}

async function executeCanaryMutation(
  env: Env,
  governance: GovernanceContext,
  gateRequest: MutationGateRequest,
  commandFingerprint: string,
  requestId: string,
): Promise<CanaryReceiptRow & { replayed: boolean }> {
  if (!governance.executionLeaseId || !governance.idempotencyKey) {
    throw new GateError("governance_envelope_incomplete", 400);
  }

  const client = new Client({ connectionString: env.HYPERDRIVE_AUTH.connectionString });
  await client.connect();
  let inTransaction = false;

  try {
    await client.query("begin");
    inTransaction = true;

    const commandId = crypto.randomUUID();
    const receiptId = crypto.randomUUID();
    const receiptRef = `BNR-DB-GATE-RECEIPT:${commandId}`;

    const inserted = await client.query<{ command_id: string }>(
      `insert into uoe_app_bridge.bnr_db_gate_canary_commands (
         command_id,
         node_code,
         gate_code,
         idempotency_key,
         operation_code,
         command_fingerprint,
         canary_ref,
         payload,
         actor_ref,
         context_ref,
         authority_ref,
         execution_lease_id
       ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12)
       on conflict (node_code, idempotency_key) do nothing
       returning command_id`,
      [
        commandId,
        env.NODE_CODE,
        env.GATE_CODE,
        governance.idempotencyKey,
        gateRequest.operation,
        commandFingerprint,
        gateRequest.input.canary_ref,
        stableJson(gateRequest.input.payload),
        governance.actorRef,
        governance.contextRef,
        governance.authorityRef,
        governance.executionLeaseId,
      ],
    );

    let replayed = inserted.rowCount !== 1;

    if (!replayed) {
      await client.query(
        `insert into uoe_app_bridge.bnr_db_gate_command_receipts (
           receipt_id,
           receipt_ref,
           command_id,
           receipt_type,
           request_id,
           warden_consumption_state
         ) values ($1, $2, $3, 'ACKNOWLEDGED', $4, 'pending')`,
        [receiptId, receiptRef, commandId, requestId],
      );
    }

    const reconciled = await client.query<CanaryReceiptRow>(
      `select
         command.command_id,
         command.operation_code,
         command.command_fingerprint,
         command.canary_ref,
         command.payload,
         command.actor_ref,
         command.context_ref,
         command.authority_ref,
         command.execution_lease_id,
         command.accepted_at,
         receipt.receipt_id,
         receipt.receipt_ref,
         receipt.warden_consumption_state,
         receipt.warden_consumed_at
       from uoe_app_bridge.bnr_db_gate_canary_commands command
       join uoe_app_bridge.bnr_db_gate_command_receipts receipt
         on receipt.command_id = command.command_id
       where command.node_code = $1
         and command.idempotency_key = $2
       limit 1`,
      [env.NODE_CODE, governance.idempotencyKey],
    );

    if (reconciled.rowCount !== 1) {
      throw new GateError("idempotency_reconciliation_failed", 500);
    }

    const row = reconciled.rows[0];
    if (!canaryEnvelopeMatches(row, env, governance, gateRequest, commandFingerprint)) {
      throw new GateError("idempotency_collision", 409);
    }

    await client.query("commit");
    inTransaction = false;

    return { ...row, replayed };
  } catch (error) {
    if (inTransaction) {
      try {
        await client.query("rollback");
      } catch {
        // Preserve the original error. No effect is inferred from rollback failure.
      }
    }
    throw error;
  } finally {
    await client.end();
  }
}

async function consumeWardenAuthority(
  env: Env,
  governance: GovernanceContext,
  gateRequest: MutationGateRequest,
  commandFingerprint: string,
  accepted: CanaryReceiptRow,
  requestId: string,
) {
  if (!governance.executionLeaseId) return false;

  let response: Response;
  try {
    response = await env.WARDEN.fetch(
      new Request(WARDEN_CONSUME_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
        },
        body: JSON.stringify({
          gate_code: env.GATE_CODE,
          node_code: env.NODE_CODE,
          authority_ref: governance.authorityRef,
          execution_lease_id: governance.executionLeaseId,
          operation: gateRequest.operation,
          command_fingerprint: commandFingerprint,
          command_id: accepted.command_id,
          receipt_ref: accepted.receipt_ref,
        }),
      }),
    );
  } catch {
    return false;
  }

  if (!response.ok) return false;

  try {
    const body = await response.json();
    return (
      isRecord(body) &&
      body.consumed === true &&
      body.authority_ref === governance.authorityRef &&
      body.execution_lease_id === governance.executionLeaseId &&
      body.receipt_ref === accepted.receipt_ref
    );
  } catch {
    return false;
  }
}

async function markWardenConsumed(env: Env, receiptRef: string) {
  const client = new Client({ connectionString: env.HYPERDRIVE_AUTH.connectionString });
  await client.connect();

  try {
    const updated = await client.query<{ receipt_ref: string }>(
      `update uoe_app_bridge.bnr_db_gate_command_receipts
       set warden_consumption_state = 'consumed',
           warden_consumed_at = coalesce(warden_consumed_at, now())
       where receipt_ref = $1
       returning receipt_ref`,
      [receiptRef],
    );

    if (updated.rowCount !== 1) throw new GateError("receipt_reconciliation_failed", 500);
  } finally {
    await client.end();
  }
}

function logEvent(event: string, fields: JsonRecord) {
  console.log(JSON.stringify({ event, ...fields }));
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

    const isQueryEndpoint = request.method === "POST" && url.pathname === "/v1/query";
    const isCommandEndpoint = request.method === "POST" && url.pathname === "/v1/command";

    if (!isQueryEndpoint && !isCommandEndpoint) {
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

    const mutation = isMutationOperation(gateRequest);
    if ((isCommandEndpoint && !mutation) || (isQueryEndpoint && mutation)) {
      return json(
        { ok: false, error: "operation_not_valid_for_endpoint", request_id: requestId },
        400,
      );
    }

    const governanceResult = readGovernanceContext(request, mutation, requestId);
    if (!governanceResult.ok) return governanceResult.response;
    const governance = governanceResult.governance;

    const commandFingerprint = mutation ? await fingerprintCommand(gateRequest) : null;
    const authorization = await authorize(
      env,
      governance,
      gateRequest,
      commandFingerprint,
      requestId,
    );
    if (!authorization.ok) return authorization.response;

    if (mutation) {
      try {
        const accepted = await executeCanaryMutation(
          env,
          governance,
          gateRequest,
          commandFingerprint as string,
          requestId,
        );

        if (accepted.warden_consumption_state !== "consumed") {
          const consumed = await consumeWardenAuthority(
            env,
            governance,
            gateRequest,
            commandFingerprint as string,
            accepted,
            requestId,
          );

          if (consumed) {
            try {
              await markWardenConsumed(env, accepted.receipt_ref);
              accepted.warden_consumption_state = "consumed";
            } catch (error) {
              logEvent("bnr_db_gate_receipt_reconciliation_failed", {
                request_id: requestId,
                gate: env.GATE_CODE,
                node: env.NODE_CODE,
                operation: gateRequest.operation,
                command_id: accepted.command_id,
                receipt_ref: accepted.receipt_ref,
                error: error instanceof Error ? error.name : "unknown_error",
              });
            }
          }
        }

        const consumptionConfirmed = accepted.warden_consumption_state === "consumed";

        logEvent("bnr_db_gate_command_accepted", {
          request_id: requestId,
          gate: env.GATE_CODE,
          node: env.NODE_CODE,
          operation: gateRequest.operation,
          authority_ref: governance.authorityRef,
          command_id: accepted.command_id,
          receipt_ref: accepted.receipt_ref,
          replayed: accepted.replayed,
          warden_consumption_state: consumptionConfirmed ? "consumed" : "pending",
        });

        return json(
          {
            ok: consumptionConfirmed,
            state: consumptionConfirmed
              ? "accepted"
              : "accepted_pending_authority_consumption",
            gate: env.GATE_CODE,
            node: env.NODE_CODE,
            request_id: requestId,
            operation: gateRequest.operation,
            command_id: accepted.command_id,
            receipt_ref: accepted.receipt_ref,
            receipt_type: "ACKNOWLEDGED",
            replayed: accepted.replayed,
            warden_consumption_state: consumptionConfirmed ? "consumed" : "pending",
            effect_observed: false,
          },
          consumptionConfirmed ? 200 : 202,
        );
      } catch (error) {
        const gateError = error instanceof GateError ? error : null;

        logEvent("bnr_db_gate_command_failed", {
          request_id: requestId,
          gate: env.GATE_CODE,
          node: env.NODE_CODE,
          operation: gateRequest.operation,
          error: gateError?.code ?? (error instanceof Error ? error.name : "unknown_error"),
        });

        return json(
          {
            ok: false,
            error: gateError?.code ?? "database_operation_failed",
            request_id: requestId,
          },
          gateError?.status ?? 500,
        );
      }
    }

    try {
      const result = await executeReadOnlyOperation(env, gateRequest);

      logEvent("bnr_db_gate_query_complete", {
        request_id: requestId,
        gate: env.GATE_CODE,
        node: env.NODE_CODE,
        operation: gateRequest.operation,
        authority_ref: authorization.decision.authority_ref,
        row_count: result.rows.length,
      });

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
