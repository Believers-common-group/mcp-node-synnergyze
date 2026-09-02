import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";

import handler, {
  handleEasyEcomWebhook,
  isEasyEcomWebhookAuthorized,
} from "./easyecom-webhook.ts";

const payload = [
  {
    order_id: 141340837,
    reference_code: "MYNTRA-REF-1001",
    marketplace: "Myntra",
    marketplace_id: 42,
    order_status: "Open",
    last_update_date: "2026-09-02 12:30:00",
    customer_name: "Sensitive Customer",
    contact_num: "9999999999",
    email: "private@example.invalid",
    address_line_1: "Private address",
    payment_mode: "PrePaid",
  },
];

function request(input: {
  method?: string;
  headers?: IncomingHttpHeaders;
  body?: unknown;
}): IncomingMessage {
  const stream = Readable.from(input.body === undefined ? [] : [JSON.stringify(input.body)]);
  const req = stream as unknown as IncomingMessage;
  req.method = input.method ?? "POST";
  req.url = "/api/easyecom-webhook";
  req.headers = input.headers ?? {};
  return req;
}

function response() {
  const headers = new Map<string, string>();
  let body = "";
  const res = {
    statusCode: 200,
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.set(name.toLowerCase(), String(value));
      return this;
    },
    end(value?: string) {
      body = value ?? "";
      return this;
    },
  } as unknown as ServerResponse;
  return {
    res,
    get statusCode() {
      return res.statusCode;
    },
    get body() {
      return body;
    },
    headers,
  };
}

const env = { EASYECOM_WEBHOOK_TOKEN: "local-webhook-secret" };

describe("EasyEcom webhook authorization", () => {
  it("accepts only the configured Access-Token header", () => {
    expect(
      isEasyEcomWebhookAuthorized({ "access-token": "local-webhook-secret" }, "local-webhook-secret"),
    ).toBe(true);
    expect(
      isEasyEcomWebhookAuthorized({ "access-token": "wrong" }, "local-webhook-secret"),
    ).toBe(false);
    expect(isEasyEcomWebhookAuthorized({}, "local-webhook-secret")).toBe(false);
  });
});

describe("EasyEcom Create Order V2 webhook handler", () => {
  it("returns 503 when the local webhook secret is not configured", async () => {
    const out = response();
    await handleEasyEcomWebhook(
      request({ headers: { "access-token": "anything" }, body: payload }),
      out.res,
      {},
      () => "2026-09-02T07:00:00.000Z",
    );
    expect(out.statusCode).toBe(503);
    expect(JSON.parse(out.body)).toEqual({ ok: false, error: "easyecom_webhook_not_configured" });
  });

  it("rejects an incorrect Access-Token before reading/admitting the payload", async () => {
    const out = response();
    await handleEasyEcomWebhook(
      request({ headers: { "access-token": "wrong" }, body: payload }),
      out.res,
      env,
      () => "2026-09-02T07:00:00.000Z",
    );
    expect(out.statusCode).toBe(401);
    expect(JSON.parse(out.body)).toEqual({ ok: false, error: "unauthorized" });
  });

  it("accepts a Create Order V2 webhook into Commerce Alpha without publishing externally", async () => {
    const out = response();
    await handleEasyEcomWebhook(
      request({ headers: { "access-token": "local-webhook-secret" }, body: payload }),
      out.res,
      env,
      () => "2026-09-02T07:00:00.000Z",
    );

    expect(out.statusCode).toBe(202);
    const parsed = JSON.parse(out.body);
    expect(parsed.ok).toBe(true);
    expect(parsed.admissionCount).toBe(1);
    expect(parsed.admissions[0].transitionState).toBe("ADMITTED");
    expect(parsed.admissions[0].channelRef).toBe("VSR-CHANNEL:COMMERCE:ORDERS");
    expect(parsed.externalEffect).toBe("NONE");
    expect(out.body).not.toContain("Sensitive Customer");
    expect(out.body).not.toContain("9999999999");
    expect(out.body).not.toContain("private@example.invalid");
    expect(out.body).not.toContain("local-webhook-secret");
  });

  it("rejects methods other than POST", async () => {
    const out = response();
    await handleEasyEcomWebhook(request({ method: "GET" }), out.res, env);
    expect(out.statusCode).toBe(405);
    expect(JSON.parse(out.body)).toEqual({ ok: false, error: "method_not_allowed" });
  });

  it("exports the serverless default handler", () => {
    expect(handler).toBeTypeOf("function");
  });
});
