import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import {
  handleEasyEcomBackfill,
  isEasyEcomBackfillAuthorized,
} from "./easyecom-backfill.ts";

function request(url: string, authorization?: string): IncomingMessage {
  const req = Readable.from([]) as unknown as IncomingMessage;
  req.method = "GET";
  req.url = url;
  req.headers = authorization ? { authorization } : {};
  return req;
}

function response() {
  let body = "";
  const res = {
    statusCode: 200,
    setHeader() {
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
  };
}

const configuredEnv = {
  EASYECOM_BACKFILL_TRIGGER_SECRET: "trigger-secret",
  EASYECOM_GET_ALL_ORDERS_V2_URL: "https://api.easyecom.invalid/getAllOrdersV2",
  EASYECOM_API_JWT: "jwt-secret",
  EASYECOM_X_API_KEY: "api-key-secret",
};

const orders = [
  {
    order_id: 141340837,
    reference_code: "MYNTRA-REF-1001",
    marketplace: "Myntra",
    marketplace_id: 42,
    order_status: "Open",
    last_update_date: "2026-09-02 12:30:00",
    customer_name: "Sensitive Customer",
    contact_num: "9999999999",
  },
];

describe("EasyEcom backfill authorization", () => {
  it("requires the local bearer trigger secret", () => {
    expect(isEasyEcomBackfillAuthorized({ authorization: "Bearer trigger-secret" }, "trigger-secret")).toBe(true);
    expect(isEasyEcomBackfillAuthorized({ authorization: "Bearer wrong" }, "trigger-secret")).toBe(false);
    expect(isEasyEcomBackfillAuthorized({}, "trigger-secret")).toBe(false);
  });
});

describe("EasyEcom getAllOrdersV2 reconciliation endpoint", () => {
  it("fails closed if API read credentials are not locally configured", async () => {
    const out = response();
    await handleEasyEcomBackfill(
      request("/api/easyecom-backfill?updated_after=2026-09-02%2012:15:59", "Bearer trigger-secret"),
      out.res,
      { EASYECOM_BACKFILL_TRIGGER_SECRET: "trigger-secret" },
      vi.fn(),
      () => "2026-09-02T07:10:00.000Z",
    );
    expect(out.statusCode).toBe(503);
    expect(JSON.parse(out.body).error).toBe("easyecom_backfill_not_configured");
  });

  it("performs only a GET with updated_after and the mandatory EasyEcom read headers", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe(
        "https://api.easyecom.invalid/getAllOrdersV2?updated_after=2026-09-02+12%3A15%3A59",
      );
      expect(init?.method).toBe("GET");
      expect(init?.body).toBeUndefined();
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe("Bearer jwt-secret");
      expect(headers.get("x-api-key")).toBe("api-key-secret");
      return new Response(JSON.stringify(orders), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const out = response();

    await handleEasyEcomBackfill(
      request("/api/easyecom-backfill?updated_after=2026-09-02%2012:15:59", "Bearer trigger-secret"),
      out.res,
      configuredEnv,
      fetcher,
      () => "2026-09-02T07:10:00.000Z",
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(out.statusCode).toBe(200);
    const parsed = JSON.parse(out.body);
    expect(parsed.mode).toBe("RECONCILIATION_ONLY");
    expect(parsed.fetchedCount).toBe(1);
    expect(parsed.admissions[0].transitionState).toBe("ADMITTED");
    expect(parsed.admissions[0]).not.toHaveProperty("headerBoardRef");
    expect(parsed.externalEffect).toBe("NONE");
    expect(out.body).not.toContain("Sensitive Customer");
    expect(out.body).not.toContain("9999999999");
    expect(out.body).not.toContain("jwt-secret");
    expect(out.body).not.toContain("api-key-secret");
  });

  it("does not call EasyEcom when the trigger bearer is wrong", async () => {
    const fetcher = vi.fn();
    const out = response();
    await handleEasyEcomBackfill(
      request("/api/easyecom-backfill?updated_after=2026-09-02%2012:15:59", "Bearer wrong"),
      out.res,
      configuredEnv,
      fetcher,
    );
    expect(out.statusCode).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
