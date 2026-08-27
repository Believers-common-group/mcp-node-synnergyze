import { describe, expect, it } from "vitest";

import { SyntheticAuthzenAuthorizationApi10CertificationPdpV1 } from "./authzen-certification-fixture.ts";
import { handleSyntheticWardenAuthzenHttpV1 } from "./authzen-http.ts";

const BASE_URL = "https://warden.example.test";
const NOW = "2026-08-24T11:20:00.000+05:30";

function pdp() {
  return new SyntheticAuthzenAuthorizationApi10CertificationPdpV1(BASE_URL);
}

function http() {
  return {
    now: () => NOW,
    requesterRef: () => "PEP:AUTHZEN-CERT",
  };
}

async function post(path: string, payload: unknown, requestId?: string) {
  return handleSyntheticWardenAuthzenHttpV1(
    pdp(),
    new Request(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(requestId ? { "x-request-id": requestId } : {}),
      },
      body: JSON.stringify(payload),
    }),
    http(),
  );
}

describe("WARDEN-AUTHZEN-CERT-BATCH-001", () => {
  it("advertises the batch and search endpoints in discovery metadata", async () => {
    const response = await handleSyntheticWardenAuthzenHttpV1(
      pdp(),
      new Request(`${BASE_URL}/.well-known/authzen-configuration`),
      http(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      policy_decision_point: BASE_URL,
      access_evaluation_endpoint: `${BASE_URL}/access/v1/evaluation`,
      access_evaluations_endpoint: `${BASE_URL}/access/v1/evaluations`,
      search_subject_endpoint: `${BASE_URL}/access/v1/search/subject`,
      search_resource_endpoint: `${BASE_URL}/access/v1/search/resource`,
      search_action_endpoint: `${BASE_URL}/access/v1/search/action`,
    });
  });

  it("evaluates fully specified Core batch items in request order", async () => {
    const response = await post(
      "/access/v1/evaluations",
      {
        evaluations: [
          {
            subject: { type: "user", id: "alice" },
            action: { name: "read" },
            resource: { type: "record", id: "record-1" },
          },
          {
            subject: { type: "user", id: "bob" },
            action: { name: "write" },
            resource: { type: "record", id: "record-1" },
          },
        ],
      },
      "batch-core-001",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("batch-core-001");
    expect(await response.json()).toEqual({
      evaluations: [{ decision: true }, { decision: false }],
    });
  });

  it("applies top-level defaults by whole-entity inheritance", async () => {
    const response = await post("/access/v1/evaluations", {
      subject: { type: "user", id: "alice" },
      action: { name: "write" },
      resource: { type: "record", id: "record-1", properties: { status: "active" } },
      evaluations: [
        {},
        {
          resource: {
            type: "record",
            id: "record-2",
            properties: { status: "archived" },
          },
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      evaluations: [{ decision: true }, { decision: false }],
    });
  });

  it("evaluates per-item subject properties and action properties", async () => {
    const response = await post("/access/v1/evaluations", {
      evaluations: [
        {
          subject: { type: "user", id: "alice" },
          action: { name: "write" },
          resource: {
            type: "record",
            id: "record-2",
            properties: { status: "archived" },
          },
        },
        {
          subject: { type: "user", id: "bob", properties: { role: "admin" } },
          action: { name: "write" },
          resource: {
            type: "record",
            id: "record-2",
            properties: { status: "archived" },
          },
        },
        {
          subject: { type: "user", id: "alice" },
          action: { name: "delete", properties: { soft: true } },
          resource: { type: "record", id: "record-1" },
        },
        {
          subject: { type: "user", id: "alice" },
          action: { name: "delete", properties: { soft: false } },
          resource: { type: "record", id: "record-1" },
        },
      ],
    });

    expect(await response.json()).toEqual({
      evaluations: [
        { decision: false },
        { decision: true },
        { decision: true },
        { decision: false },
      ],
    });
  });

  it("inherits top-level context unless an item overrides it", async () => {
    const response = await post("/access/v1/evaluations", {
      subject: { type: "user", id: "alice" },
      action: { name: "read" },
      context: { source: "top-level", risk: "low" },
      evaluations: [
        { resource: { type: "record", id: "record-1" } },
        {
          resource: { type: "record", id: "record-1" },
          context: { source: "item", risk: "high" },
        },
      ],
    });

    expect(await response.json()).toEqual({
      evaluations: [{ decision: true }, { decision: true }],
    });
  });

  it("marks a malformed item false under execute_all without failing the whole batch", async () => {
    const response = await post("/access/v1/evaluations", {
      subject: { type: "user", id: "alice" },
      action: { name: "read" },
      options: { evaluations_semantic: "execute_all" },
      evaluations: [
        { resource: { type: "record", id: "record-1" } },
        {},
      ],
    });

    expect(response.status).toBe(200);
    const result = (await response.json()) as {
      evaluations: Array<{ decision: boolean; context?: { reason?: string } }>;
    };
    expect(result.evaluations).toHaveLength(2);
    expect(result.evaluations[0]).toEqual({ decision: true });
    expect(result.evaluations[1].decision).toBe(false);
    expect(result.evaluations[1].context?.reason).toBe("authzen_resource_required");
  });

  it("preserves backwards compatibility when evaluations is missing or empty", async () => {
    const payload = {
      subject: { type: "user", id: "alice" },
      action: { name: "read" },
      resource: { type: "record", id: "record-1" },
    };

    const missing = await post("/access/v1/evaluations", payload);
    expect(missing.status).toBe(200);
    expect(await missing.json()).toEqual({ decision: true });

    const empty = await post("/access/v1/evaluations", { ...payload, evaluations: [] });
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ decision: true });
  });
});

describe("WARDEN-AUTHZEN-CERT-SEARCH-001", () => {
  it("returns alice and bob for Subject Search Core and ignores subject.id", async () => {
    const core = {
      subject: { type: "user" },
      action: { name: "read" },
      resource: { type: "record", id: "record-1" },
    };
    const response = await post("/access/v1/search/subject", core, "search-subject-001");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("search-subject-001");
    expect(await response.json()).toEqual({
      results: [
        { type: "user", id: "alice" },
        { type: "user", id: "bob", properties: { role: "admin" } },
      ],
    });

    const withId = await post("/access/v1/search/subject", {
      ...core,
      subject: { type: "user", id: "does-not-filter" },
    });
    expect(await withId.json()).toEqual({
      results: [
        { type: "user", id: "alice" },
        { type: "user", id: "bob", properties: { role: "admin" } },
      ],
    });
  });

  it("returns bob for Subject Search Properties against archived write", async () => {
    const response = await post("/access/v1/search/subject", {
      subject: { type: "user" },
      action: { name: "write" },
      resource: {
        type: "record",
        id: "record-2",
        properties: { status: "archived" },
      },
    });

    expect(await response.json()).toEqual({
      results: [{ type: "user", id: "bob", properties: { role: "admin" } }],
    });
  });

  it("returns record-1 for Resource Search Core and record-2 for admin archived write", async () => {
    const core = await post("/access/v1/search/resource", {
      subject: { type: "user", id: "alice" },
      action: { name: "read" },
      resource: { type: "record" },
    });
    expect(await core.json()).toEqual({
      results: [{ type: "record", id: "record-1", properties: { status: "active" } }],
    });

    const properties = await post("/access/v1/search/resource", {
      subject: { type: "user", id: "bob", properties: { role: "admin" } },
      action: { name: "write" },
      resource: { type: "record" },
    });
    expect(await properties.json()).toEqual({
      results: [{ type: "record", id: "record-2", properties: { status: "archived" } }],
    });
  });

  it("returns read/write for Action Search Core and write for admin archived resource", async () => {
    const core = await post("/access/v1/search/action", {
      subject: { type: "user", id: "alice" },
      resource: { type: "record", id: "record-1" },
    });
    expect(await core.json()).toEqual({
      results: [{ name: "read" }, { name: "write" }],
    });

    const properties = await post("/access/v1/search/action", {
      subject: { type: "user", id: "bob", properties: { role: "admin" } },
      resource: {
        type: "record",
        id: "record-2",
        properties: { status: "archived" },
      },
    });
    expect(await properties.json()).toEqual({ results: [{ name: "write" }] });
  });

  it("accepts context and page without changing fixture search results", async () => {
    const response = await post("/access/v1/search/subject", {
      subject: { type: "user" },
      action: { name: "read" },
      resource: { type: "record", id: "record-1" },
      context: { ip: "192.0.2.1" },
      page: { limit: 1 },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      results: [{ id: "alice" }, { id: "bob" }],
    });
  });

  it("returns empty results for unknown search target type or unknown input entity", async () => {
    const unknownType = await post("/access/v1/search/subject", {
      subject: { type: "spaceship" },
      action: { name: "read" },
      resource: { type: "record", id: "record-1" },
    });
    expect(await unknownType.json()).toEqual({ results: [] });

    const unknownInput = await post("/access/v1/search/action", {
      subject: { type: "user", id: "nobody" },
      resource: { type: "record", id: "record-1" },
    });
    expect(await unknownInput.json()).toEqual({ results: [] });
  });

  it("returns HTTP 400 for missing search fields and missing input entity ids", async () => {
    const missingAction = await post("/access/v1/search/subject", {
      subject: { type: "user" },
      resource: { type: "record", id: "record-1" },
    });
    expect(missingAction.status).toBe(400);

    const missingResourceId = await post("/access/v1/search/subject", {
      subject: { type: "user" },
      action: { name: "read" },
      resource: { type: "record" },
    });
    expect(missingResourceId.status).toBe(400);

    const missingSubjectId = await post("/access/v1/search/resource", {
      subject: { type: "user" },
      action: { name: "read" },
      resource: { type: "record" },
    });
    expect(missingSubjectId.status).toBe(400);
  });
});
