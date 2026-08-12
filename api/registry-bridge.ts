import { neon } from "@neondatabase/serverless";
import type { IncomingMessage, ServerResponse } from "node:http";

const SOURCE_NODE_CODE = "CWR-REGISTRY";
const BRIDGE_CODE = "GEN-PART-PG-BRIDGE-003";
const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;
const LEASE_MINUTES = 5;

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
  occurred_at: string | Date;
};

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

export function getBatchSize(request: IncomingMessage) {
  const url = new URL(request.url ?? "/api/registry-bridge", "https://registry-bridge.invalid");
  const requested = Number(url.searchParams.get("limit") ?? DEFAULT_BATCH_SIZE);

  if (!Number.isFinite(requested)) return DEFAULT_BATCH_SIZE;
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.trunc(requested)));
}

export function isAuthorized(request: IncomingMessage) {
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

  // Claim a bounded batch in one atomic statement. `available_at` doubles as the
  // lease expiry so an interrupted worker can be safely reclaimed later.
  const envelopes = (await source`
    with candidates as (
      select registry_outbox_id
      from uoe_master.registry_outbox
      where delivery_state in ('pending', 'failed', 'leased')
        and available_at <= now()
      order by occurred_at asc, registry_outbox_id asc
      for update skip locked
      limit ${batchSize}
    )
    update uoe_master.registry_outbox as outbox
    set delivery_state = 'leased',
        available_at = now() + (${LEASE_MINUTES} * interval '1 minute'),
        attempt_count = attempt_count + 1,
        last_error = null
    from candidates
    where outbox.registry_outbox_id = candidates.registry_outbox_id
    returning
      outbox.registry_outbox_id,
      outbox.event_reference,
      outbox.source_node_code,
      outbox.change_code,
      outbox.event_code,
      outbox.object_type,
      outbox.object_code,
      outbox.registry_revision_ref,
      outbox.payload,
      outbox.evidence_reference,
      outbox.occurred_at
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

      // The checkpoint is observability state, not the transport authority. Guard
      // it against regressing when two workers complete distinct leases out of order.
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
          jsonb_build_object(
            'bridge', ${BRIDGE_CODE},
            'last_event_occurred_at', ${envelope.occurred_at}::timestamptz
          ),
          now()
        )
        on conflict (registry_source_code) do update set
          last_outbox_event_ref = excluded.last_outbox_event_ref,
          last_registry_revision_ref = excluded.last_registry_revision_ref,
          last_processed_at = excluded.last_processed_at,
          checkpoint_context = coalesce(uoe_growth_runtime.registry_sync_checkpoints.checkpoint_context, '{}'::jsonb)
            || excluded.checkpoint_context,
          updated_at = excluded.updated_at
        where coalesce(
          (uoe_growth_runtime.registry_sync_checkpoints.checkpoint_context->>'last_event_occurred_at')::timestamptz,
          '-infinity'::timestamptz
        ) <= ${envelope.occurred_at}::timestamptz
      `;

      await source`
        update uoe_master.registry_outbox
        set delivery_state = 'delivered',
            delivered_at = now(),
            last_error = null
        where registry_outbox_id = ${envelope.registry_outbox_id}
          and delivery_state = 'leased'
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
              available_at = now() + interval '1 minute',
              last_error = ${message}
          where registry_outbox_id = ${envelope.registry_outbox_id}
            and delivery_state = 'leased'
        `;
      } catch {
        // Preserve the original bridge error; the lease expires and becomes reclaimable.
      }
    }
  }

  return sendJson(response, failed > 0 ? 207 : 200, {
    ok: failed === 0,
    bridge: BRIDGE_CODE,
    source: SOURCE_NODE_CODE,
    scanned: envelopes.length,
    delivered,
    failed,
    failures,
    timestamp: new Date().toISOString(),
  });
}
