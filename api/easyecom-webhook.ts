import { timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";

import { adaptEasyEcomCreateOrderV2Payload } from "../modules/commerce-events/easyecom-readonly-adapter.ts";
import { evaluateCommerceAlphaOperations } from "../src/tools/registerCommerceAlphaOperations.ts";

const MAX_BODY_BYTES = 1024 * 1024;

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}

function presentedAccessToken(headers: IncomingHttpHeaders): string | undefined {
  const value = headers["access-token"];
  if (Array.isArray(value)) return value.length === 1 ? value[0] : undefined;
  return value;
}

export function isEasyEcomWebhookAuthorized(
  headers: IncomingHttpHeaders,
  configuredToken: string,
): boolean {
  const presented = presentedAccessToken(headers);
  if (!presented || !configuredToken) return false;
  const presentedBytes = Buffer.from(presented, "utf8");
  const configuredBytes = Buffer.from(configuredToken, "utf8");
  if (presentedBytes.length !== configuredBytes.length) return false;
  return timingSafeEqual(presentedBytes, configuredBytes);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf8");
    total += buffer.length;
    if (total > MAX_BODY_BYTES) throw new Error("EASYECOM_WEBHOOK_BODY_TOO_LARGE");
    chunks.push(buffer);
  }
  if (chunks.length === 0) throw new Error("EASYECOM_WEBHOOK_BODY_REQUIRED");
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function headerBoardRefFor(sourceRecordRef: string, evidenceRef: string): string {
  const evidenceSuffix = evidenceRef.split(":").at(-1) ?? "UNKNOWN";
  const sourceSuffix = sourceRecordRef.replace(/[^A-Za-z0-9:_-]/g, "-");
  return `HEADER:EASYECOM:${sourceSuffix}:${evidenceSuffix}`;
}

export async function handleEasyEcomWebhook(
  request: IncomingMessage,
  response: ServerResponse,
  env: NodeJS.ProcessEnv = process.env,
  clock: () => string = () => new Date().toISOString(),
): Promise<void> {
  if (request.method !== "POST") {
    response.setHeader("allow", "POST");
    sendJson(response, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  const configuredToken = env.EASYECOM_WEBHOOK_TOKEN;
  if (!configuredToken) {
    sendJson(response, 503, { ok: false, error: "easyecom_webhook_not_configured" });
    return;
  }

  if (!isEasyEcomWebhookAuthorized(request.headers, configuredToken)) {
    sendJson(response, 401, { ok: false, error: "unauthorized" });
    return;
  }

  try {
    const receivedAt = clock();
    const payload = await readJsonBody(request);
    const sourceEvents = adaptEasyEcomCreateOrderV2Payload(payload, receivedAt);
    const admissions = sourceEvents.map((source) => {
      const headerBoardRef = headerBoardRefFor(source.sourceRecordRef, source.evidenceRefs[0]);
      const result = evaluateCommerceAlphaOperations({
        sourceEvents: [source],
        projection: {
          profileRef: "PROFILE:COMMERCE:ORDERS:ORDER-CREATED",
          headerBoardRef,
          publisherPrincipalRef: "SERVICE-PRINCIPAL:VOI:EASYECOM-READONLY-ADAPTER",
          publisherCapacityRef: "CAPACITY:COMMERCE:SOURCE-ADMISSION",
          effectiveFrom: receivedAt,
        },
      });
      const first = result.results[0];
      if (!first) throw new Error("EASYECOM_COMMERCE_RESULT_MISSING");
      return {
        sourceRecordRef: source.sourceRecordRef,
        eventRef: first.observation.eventRef,
        transitionState: first.transition.state,
        headerBoardRef: result.headerBoardDraft?.headerBoardRef ?? null,
        channelRef: result.headerBoardDraft?.channelRef ?? null,
      };
    });

    sendJson(response, 202, {
      ok: true,
      source: "EASYCOM_OMS",
      admissionCount: admissions.length,
      admissions,
      externalEffect: "NONE",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid_webhook_payload";
    sendJson(response, 400, { ok: false, error: "invalid_webhook_payload", detail: message });
  }
}

export default function handler(request: IncomingMessage, response: ServerResponse) {
  return handleEasyEcomWebhook(request, response);
}
