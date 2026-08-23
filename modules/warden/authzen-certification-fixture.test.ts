import { describe, expect, it } from "vitest";

import { SyntheticAuthzenAuthorizationApi10CertificationPdpV1 } from "./authzen-certification-fixture.ts";
import { handleSyntheticWardenAuthzenHttpV1 } from "./authzen-http.ts";

const BASE_URL = "https://warden.example.test";
const NOW = "2026-08-24T04:00:00.000+05:30";

function pdp() {
  return new SyntheticAuthzenAuthorizationApi10CertificationPdpV1(BASE_URL);
}

function http() {
  return {
    now: () => NOW,
    requesterRef: () => "AUTHZEN:CERTIFICATION-HARNESS",
  };
}

async function evaluate(body: unknown, requestId?: string) {
  return handleSyntheticWardenAuthzenHttpV1(
    pdp(),
    new Request(`${BASE_URL}/access/v1/evaluation`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(requestId ? { "x-request-id": requestId } : {}),
      },
      body: JSON.stringify(body),
    }),
    http(),
  );
}

describe("WARDEN-AUTHZEN-CERT-BASIC-001", () => {
  it.each([
    [
      "alice read record-1",
      {
        subject: { type: "user", id: "alice" },
        action: { name: "read" },
        resource: { type: "record", id: "record-1" },
      },
      true,
    ],
    [
      "alice write record-1",
      {
        subject: { type: "user", id: "alice" },
        action: { name: "write" },
        resource: { type: "record", id: "record-1" },
      },
      true,
    ],
    [
      "bob read record-1",
      {
        subject: { type: "user", id: "bob" },
        action: { name: "read" },
        resource: { type: "record", id: "record-1" },
      },
      true,
    ],
    [
      "bob write record-1",
      {
        subject: { type: "user", id: "bob" },
        action: { name: "write" },
        resource: { type: "record", id: "record-1" },
      },
      false,
    ],
  ])("matches Basic Core fixture: %s", async (_name, request, expected) => {
    const response = await evaluate(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ decision: expected });
  });

  it.each([
    [
      "alice write archived record",
      {
        subject: { type: "user", id: "alice" },
        action: { name: "write" },
        resource: { type: "record", id: "record-2", properties: { status: "archived" } },
      },
      false,
    ],
    [
      "admin write archived record",
      {
        subject: { type: "user", id: "bob", properties: { role: "admin" } },
        action: { name: "write" },
        resource: { type: "record", id: "record-2", properties: { status: "archived" } },
      },
      true,
    ],
    [
      "soft delete",
      {
        subject: { type: "user", id: "alice" },
        action: { name: "delete", properties: { soft: true } },
        resource: { type: "record", id: "record-1" },
      },
      true,
    ],
    [
      "hard delete",
      {
        subject: { type: "user", id: "alice" },
        action: { name: "delete", properties: { soft: false } },
        resource: { type: "record", id: "record-1" },
      },
      false,
    ],
  ])("matches Basic Properties fixture: %s", async (_name, request, expected) => {
    const response = await evaluate(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ decision: expected });
  });

  it("accepts optional context and ignores unknown fields without changing the fixture decision", async () => {
    const response = await evaluate(
      {
        subject: { type: "user", id: "alice" },
        action: { name: "read" },
        resource: { type: "record", id: "record-1" },
        context: {
          time: "2025-06-27T18:03-07:00",
          ip: "192.168.1.1",
        },
        unknown_top_level: "ignored",
      },
      "authzen-cert-request-001",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("authzen-cert-request-001");
    expect(await response.json()).toEqual({ decision: true });
  });

  it.each([
    [
      "subject",
      {
        action: { name: "read" },
        resource: { type: "record", id: "record-1" },
      },
    ],
    [
      "action",
      {
        subject: { type: "user", id: "alice" },
        resource: { type: "record", id: "record-1" },
      },
    ],
    [
      "resource",
      {
        subject: { type: "user", id: "alice" },
        action: { name: "read" },
      },
    ],
  ])("returns 400 when required %s is missing", async (_name, request) => {
    const response = await evaluate(request);
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
  });

  it("does not fail when X-Request-ID is absent and may generate one", async () => {
    const response = await evaluate({
      subject: { type: "user", id: "alice" },
      action: { name: "read" },
      resource: { type: "record", id: "record-1" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });

  it("returns the same decision for consecutive identical requests", async () => {
    const request = {
      subject: { type: "user", id: "alice" },
      action: { name: "read" },
      resource: { type: "record", id: "record-1" },
    };

    const first = await evaluate(request);
    const second = await evaluate(request);
    expect(await first.json()).toEqual({ decision: true });
    expect(await second.json()).toEqual({ decision: true });
  });
});

describe("WARDEN-AUTHZEN-CERT-DISCOVERY-001", () => {
  it("serves required PDP metadata with valid HTTPS endpoints", async () => {
    const response = await handleSyntheticWardenAuthzenHttpV1(
      pdp(),
      new Request(`${BASE_URL}/.well-known/authzen-configuration`),
      http(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      policy_decision_point: BASE_URL,
      access_evaluation_endpoint: `${BASE_URL}/access/v1/evaluation`,
    });
  });
});
