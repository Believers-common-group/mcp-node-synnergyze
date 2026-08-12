import { neon } from "@neondatabase/serverless";
import type { IncomingMessage, ServerResponse } from "node:http";

const SOURCE_NODE_CODE = "CWR-REGISTRY";
const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;

type RegistryEnvelope = {
  registry_outbox_id: string;
  event_reference: string;
  source_node_code: string;
  change_code: string;
  event_code: string;
  object_type: string | null;
  object_code: string | null;
  registry_revision_ref: string | null;
  payload: unknown;
  evidence_reference: string | null;
};

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function getBatchSize(request: IncomingMessage) {
  const url = new URL(request.url ?? "/api/registry-bridge", "https://registry-bridge.invalid");
  const requested = Number(url.searchParams.get("limit") ?? DEFAULT_BATCH_SIZE);

  if (!Number.isFinite(requested)) return DEFAULT_BATCH_SIZE;
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.trunc(requested)));
}

function isAuthorized(request: IncomingMessage) {
  const secret = process.env.REGISTRY_BRIDGE_SECRET ?? process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.authorization === `Bearer ${secret}`;
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("allow", "GET, POST");
    return sendJson(response, 405, { ok: false, error: "method_not_allowed" });
  }

  if (!isAuthorized(request)) {
    return sendJson(response, 401, { ok: false, error: "unauthorized" });
  }

  const sourceUrl = process.env.CWR_REGISTRY_DATABASE_URL;
  const targetUrl = process.env.VSR_PUBLIC_DATABASE_URL;

  if (!sourceUrl || !targetUrl) {
    return sendJson(response, 503, {
      ok: false,
      error: "bridge_not_configured",
      missing: [
        ...(sourceUrl ? [] : ["CWR_REGISTRY_DATABASE_URL"]),
        ...(targetUrl ? [] : ["VSR_PUBLIC_DATABASE_URL"]),
      ],
    });
  }

  const source = neon(sourceUrl);
  const target = neon(targetUrl);
  const batchSize = getBatchSize(request);

  const envelopes = (await source`
    select
      registry_outbox_id,
      event_reference,
      source_node_code,
      change_code,
      event_code,
      object_type,
      object_code,
      registry_revision_ref,
      payload,
      evidence_reference
    from uoe_master.registry_outbox
    where delivery_state in ('pending', 'failed')
      and available_at <= now()
    order by occurred_at asc, registry_outbox_id asc
    limit ${batchSize}
  `) as RegistryEnvelope[];

  let delivered = 0;
  let failed = 0;
  const failures: Array<{ event_reference: string; error: string }> = [];

  for (const envelope of envelopes) {
    try {
      await target`
        insert into uoe_growth_runtime.registry_inbox (
          source_node_code,
          event_reference,
          change_code,
          event_code,
          object_type,
          object_code,
          registry_revision_ref,
          payload,
          evidence_reference,
          processing_state
        ) values (
          ${envelope.source_node_code},
          ${envelope.event_reference},
          ${envelope.change_code},
          ${envelope.event_code},
          ${envelope.object_type},
          ${envelope.object_code},
          ${envelope.registry_revision_ref},
          ${JSON.stringify(envelope.payload)}::jsonb,
          ${envelope.evidence_reference},
          'received'
        )
        on conflict (source_node_code, event_reference) do nothing
      `;

      await target`
        insert into uoe_growth_runtime.registry_sync_checkpoints (
          registry_source_code,
          last_outbox_event_ref,
          last_registry_revision_ref,
          last_processed_at,
          checkpoint_context,
          updated_at
        ) values (
          ${SOURCE_NODE_CODE},
          ${envelope.event_reference},
          ${envelope.registry_revision_ref},
          now(),
          jsonb_build_object('bridge', 'GEN-PART-PG-BRIDGE-003'),
          now()
        )
        on conflict (registry_source_code) do update set
          last_outbox_event_ref = excluded.last_outbox_event_ref,
          last_registry_revision_ref = excluded.last_registry_revision_ref,
          last_processed_at = excluded.last_processed_at,
          checkpoint_context = coalesce(uoe_growth_runtime.registry_sync_checkpoints.checkpoint_context, '{}'::jsonb)
            || excluded.checkpoint_context,
          updated_at = excluded.updated_at
      `;

      await source`
        update uoe_master.registry_outbox
        set delivery_state = 'delivered',
            delivered_at = now(),
            attempt_count = attempt_count + 1,
            last_error = null
        where registry_outbox_id = ${envelope.registry_outbox_id}
      `;

      delivered += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_bridge_error";
      failed += 1;
      failures.push({ event_reference: envelope.event_reference, error: message });

      try {
        await source`
          update uoe_master.registry_outbox
          set delivery_state = 'failed',
              attempt_count = attempt_count + 1,
              last_error = ${message}
          where registry_outbox_id = ${envelope.registry_outbox_id}
        `;
      } catch {
        // Preserve the original bridge error; a later run can retry the same envelope idempotently.
      }
    }
  }

  return sendJson(response, failed > 0 ? 207 : 200, {
    ok: failed === 0,
    bridge: "GEN-PART-PG-BRIDGE-003",
    source: SOURCE_NODE_CODE,
    scanned: envelopes.length,
    delivered,
    failed,
    failures,
    timestamp: new Date().toISOString(),
  });
}
