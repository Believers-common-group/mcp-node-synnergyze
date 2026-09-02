import { timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";

import {
  adaptEasyEcomGetAllOrdersV2Payload,
  buildEasyEcomGetAllOrdersV2Url,
} from "../modules/commerce-events/easyecom-readonly-adapter.ts";
import { evaluateCommerceAlphaOperations } from "../src/tools/registerCommerceAlphaOperations.ts";

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}

function bearer(headers: IncomingHttpHeaders): string | undefined {
  const value = headers.authorization;
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return undefined;
  return value.slice("Bearer ".length);
}

export function isEasyEcomBackfillAuthorized(
  headers: IncomingHttpHeaders,
  configuredSecret: string,
): boolean {
  const presented = bearer(headers);
  if (!presented || !configuredSecret) return false;
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(configuredSecret, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function extractOrders(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.orders)) return record.orders;
    if (Array.isArray(record.data)) return record.data;
    if (record.data && typeof record.data === "object") {
      const nested = record.data as Record<string, unknown>;
      if (Array.isArray(nested.orders)) return nested.orders;
    }
  }
  throw new Error("EASYECOM_BACKFILL_RESPONSE_SHAPE_UNSUPPORTED");
}

export async function handleEasyEcomBackfill(
  request: IncomingMessage,
  response: ServerResponse,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
  clock: () => string = () => new Date().toISOString(),
): Promise<void> {
  if (request.method !== "GET") {
    response.setHeader("allow", "GET");
    return sendJson(response, 405, { ok: false, error: "method_not_allowed" });
  }

  const triggerSecret = env.EASYECOM_BACKFILL_TRIGGER_SECRET;
  if (!triggerSecret || !isEasyEcomBackfillAuthorized(request.headers, triggerSecret)) {
    return sendJson(response, 401, { ok: false, error: "unauthorized" });
  }

  const endpoint = env.EASYECOM_GET_ALL_ORDERS_V2_URL;
  const jwt = env.EASYECOM_API_JWT;
  const apiKey = env.EASYECOM_X_API_KEY;
  if (!endpoint || !jwt || !apiKey) {
    return sendJson(response, 503, {
      ok: false,
      error: "easyecom_backfill_not_configured",
      missing: [
        ...(endpoint ? [] : ["EASYECOM_GET_ALL_ORDERS_V2_URL"]),
        ...(jwt ? [] : ["EASYECOM_API_JWT"]),
        ...(apiKey ? [] : ["EASYECOM_X_API_KEY"]),
      ],
    });
  }

  try {
    const incoming = new URL(request.url ?? "/api/easyecom-backfill", "https://alpha.invalid");
    const updatedAfter = incoming.searchParams.get("updated_after");
    if (!updatedAfter) throw new Error("EASYECOM_UPDATED_AFTER_REQUIRED");
    const url = buildEasyEcomGetAllOrdersV2Url(endpoint, updatedAfter);
    const upstream = await fetcher(url, {
      method: "GET",
      headers: {
        authorization: `Bearer ${jwt}`,
        "x-api-key": apiKey,
        accept: "application/json",
      },
    });
    if (!upstream.ok) {
      return sendJson(response, 502, {
        ok: false,
        error: "easyecom_upstream_error",
        upstreamStatus: upstream.status,
      });
    }

    const orders = extractOrders(await upstream.json());
    const observedAt = clock();
    const sources = adaptEasyEcomGetAllOrdersV2Payload(orders, observedAt);
    const admissions = sources.map((source) => {
      const result = evaluateCommerceAlphaOperations({ sourceEvents: [source] });
      const first = result.results[0];
      if (!first) throw new Error("EASYECOM_BACKFILL_RESULT_MISSING");
      return {
        sourceRecordRef: source.sourceRecordRef,
        eventRef: first.observation.eventRef,
        transitionState: first.transition.state,
      };
    });

    return sendJson(response, 200, {
      ok: true,
      mode: "RECONCILIATION_ONLY",
      requestedUpdatedAfter: updatedAfter,
      fetchedCount: admissions.length,
      admissions,
      externalEffect: "NONE",
      publication: "NONE",
    });
  } catch (error) {
    return sendJson(response, 400, {
      ok: false,
      error: "invalid_backfill_request",
      detail: error instanceof Error ? error.message : "invalid_backfill_request",
    });
  }
}

export default function handler(request: IncomingMessage, response: ServerResponse) {
  return handleEasyEcomBackfill(request, response);
}
