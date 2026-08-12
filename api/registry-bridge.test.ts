import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({ source: [] as string[], target: [] as string[] }));
const behavior = vi.hoisted(() => ({
  insertConflict: false,
  existingInboxMatches: true,
  finalizeSucceeds: true,
}));

vi.mock("@neondatabase/serverless", () => ({
  neon: (url: string) => async (strings: TemplateStringsArray, ..._values: unknown[]) => {
    const sql = strings.join("?");
    const bucket = url === "source-db" ? queries.source : queries.target;
    bucket.push(sql);

    if (url === "source-db" && sql.includes("with candidates as")) {
      return [
        {
          registry_outbox_id: "00000000-0000-0000-0000-000000000001",
          event_reference: "EVT-001",
          source_node_code: "CWR-REGISTRY",
          change_code: "CHG-001",
          event_code: "REGISTRY.TEST",
          object_type: "participant",
          object_code: "PART-001",
          registry_revision_ref: "REV-001",
          payload: { ok: true },
          evidence_reference: null,
          occurred_at: "2026-08-12T17:00:00.000Z",
          attempt_count: 3,
        },
      ];
    }

    if (url === "target-db" && sql.includes("insert into uoe_growth_runtime.registry_inbox")) {
      return behavior.insertConflict ? [] : [{ event_reference: "EVT-001" }];
    }

    if (url === "target-db" && sql.includes("select 1 as matched")) {
      return behavior.existingInboxMatches ? [{ matched: 1 }] : [];
    }

    if (url === "source-db" && sql.includes("delivery_state = 'delivered'")) {
      return behavior.finalizeSucceeds
        ? [{ registry_outbox_id: "00000000-0000-0000-0000-000000000001" }]
        : [];
    }

    return [];
  },
}));

import handler, { getBatchSize, isAuthorized } from "./registry-bridge.js";

function request(overrides: Partial<IncomingMessage> = {}) {
  return {
    method: "GET",
    url: "/api/registry-bridge",
    headers: {},
    ...overrides,
  } as IncomingMessage;
}

function response() {
  const headers = new Map<string, string>();
  let body = "";

  const res = {
    statusCode: 200,
    setHeader(name: string, value: string) {
      headers.set(name.toLowerCase(), value);
      return res;
    },
    end(chunk?: string) {
      body = chunk ?? "";
      return res;
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
    header(name: string) {
      return headers.get(name.toLowerCase());
    },
  };
}

const originalEnv = { ...process.env };

function configureBridge() {
  process.env.REGISTRY_BRIDGE_SECRET = "bridge-secret";
  process.env.CWR_REGISTRY_DATABASE_URL = "source-db";
  process.env.VSR_PUBLIC_DATABASE_URL = "target-db";
}

describe("GEN-PART-PG-BRIDGE-003", () => {
  beforeEach(() => {
    queries.source.length = 0;
    queries.target.length = 0;
    behavior.insertConflict = false;
    behavior.existingInboxMatches = true;
    behavior.finalizeSucceeds = true;
    process.env = { ...originalEnv };
    delete process.env.REGISTRY_BRIDGE_SECRET;
    delete process.env.CRON_SECRET;
    delete process.env.CWR_REGISTRY_DATABASE_URL;
    delete process.env.VSR_PUBLIC_DATABASE_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("bounds requested batch size", () => {
    expect(getBatchSize(request({ url: "/api/registry-bridge?limit=250" }))).toBe(100);
    expect(getBatchSize(request({ url: "/api/registry-bridge?limit=0" }))).toBe(1);
    expect(getBatchSize(request({ url: "/api/registry-bridge?limit=not-a-number" }))).toBe(25);
  });

  it("accepts either configured bridge or cron bearer secret", () => {
    process.env.REGISTRY_BRIDGE_SECRET = "bridge-secret";
    process.env.CRON_SECRET = "cron-secret";

    expect(isAuthorized(request({ headers: { authorization: "Bearer bridge-secret" } }))).toBe(true);
    expect(isAuthorized(request({ headers: { authorization: "Bearer cron-secret" } }))).toBe(true);
    expect(isAuthorized(request({ headers: { authorization: "Bearer wrong" } }))).toBe(false);
  });

  it("rejects unsupported methods before any database access", async () => {
    const output = response();
    await handler(request({ method: "PUT" }), output.res);

    expect(output.statusCode).toBe(405);
    expect(output.header("allow")).toBe("GET, POST");
    expect(JSON.parse(output.body)).toEqual({ ok: false, error: "method_not_allowed" });
    expect(queries.source).toHaveLength(0);
    expect(queries.target).toHaveLength(0);
  });

  it("returns configuration failure without touching either database", async () => {
    process.env.REGISTRY_BRIDGE_SECRET = "bridge-secret";
    const output = response();

    await handler(
      request({ headers: { authorization: "Bearer bridge-secret" } }),
      output.res,
    );

    expect(output.statusCode).toBe(503);
    expect(JSON.parse(output.body)).toMatchObject({
      ok: false,
      error: "bridge_not_configured",
      missing: ["CWR_REGISTRY_DATABASE_URL", "VSR_PUBLIC_DATABASE_URL"],
    });
    expect(queries.source).toHaveLength(0);
    expect(queries.target).toHaveLength(0);
  });

  it("claims only CWR source rows and finalizes the exact lease generation", async () => {
    configureBridge();
    const output = response();

    await handler(
      request({ headers: { authorization: "Bearer bridge-secret" } }),
      output.res,
    );

    expect(output.statusCode).toBe(200);
    expect(JSON.parse(output.body)).toMatchObject({
      ok: true,
      bridge: "GEN-PART-PG-BRIDGE-003",
      source: "CWR-REGISTRY",
      scanned: 1,
      delivered: 1,
      failed: 0,
    });

    expect(queries.source[0]).toContain("where source_node_code = ?");
    expect(queries.source[0]).toContain("outbox.attempt_count");
    expect(queries.target[0]).toContain("registry_inbox");
    expect(queries.target[0]).toContain("on conflict (source_node_code, event_reference) do nothing");
    expect(queries.target[1]).toContain("registry_sync_checkpoints");
    expect(queries.source[1]).toContain("delivery_state = 'delivered'");
    expect(queries.source[1]).toContain("attempt_count = ?");
  });

  it("accepts an identical inbox retry after duplicate suppression", async () => {
    configureBridge();
    behavior.insertConflict = true;
    behavior.existingInboxMatches = true;
    const output = response();

    await handler(
      request({ headers: { authorization: "Bearer bridge-secret" } }),
      output.res,
    );

    expect(output.statusCode).toBe(200);
    expect(JSON.parse(output.body)).toMatchObject({ ok: true, delivered: 1, failed: 0 });
    expect(queries.target.some((sql) => sql.includes("select 1 as matched"))).toBe(true);
  });

  it("rejects an idempotency-key collision with different inbox content", async () => {
    configureBridge();
    behavior.insertConflict = true;
    behavior.existingInboxMatches = false;
    const output = response();

    await handler(
      request({ headers: { authorization: "Bearer bridge-secret" } }),
      output.res,
    );

    expect(output.statusCode).toBe(207);
    expect(JSON.parse(output.body)).toMatchObject({
      ok: false,
      delivered: 0,
      failed: 1,
      failures: [{ event_reference: "EVT-001", error: "registry_inbox_idempotency_collision" }],
    });
    expect(queries.target.some((sql) => sql.includes("registry_sync_checkpoints"))).toBe(false);
    expect(queries.source.some((sql) => sql.includes("delivery_state = 'failed'"))).toBe(true);
  });

  it("does not finalize a lease reclaimed by another worker", async () => {
    configureBridge();
    behavior.finalizeSucceeds = false;
    const output = response();

    await handler(
      request({ headers: { authorization: "Bearer bridge-secret" } }),
      output.res,
    );

    expect(output.statusCode).toBe(207);
    expect(JSON.parse(output.body)).toMatchObject({
      ok: false,
      delivered: 0,
      failed: 1,
      failures: [{ event_reference: "EVT-001", error: "lease_lost_before_finalize" }],
    });
    expect(queries.source.some((sql) => sql.includes("delivery_state = 'failed'"))).toBe(true);
    expect(queries.source.at(-1)).toContain("attempt_count = ?");
  });
});
