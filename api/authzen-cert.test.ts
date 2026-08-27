import { describe, expect, it } from "vitest";

import {
  AUTHZEN_CERTIFICATION_ROUTE_MAP,
  handleHostedAuthzenCertificationV1,
  resolveAuthzenCertificationOriginV1,
} from "./authzen-cert.ts";

const ORIGIN = "https://authzen-cert.example.test";

async function invoke(route: string, method: string, body?: unknown, requestId?: string) {
  const url = new URL("/api/authzen-cert", ORIGIN);
  url.searchParams.set("route", route);
  return handleHostedAuthzenCertificationV1(
    new Request(url, {
      method,
      headers: {
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(requestId ? { "x-request-id": requestId } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

describe("WARDEN-AUTHZEN-CERT-HOSTED-001", () => {
  it("resolves HTTPS origin from forwarded host", () => {
    expect(
      resolveAuthzenCertificationOriginV1({
        "x-forwarded-proto": "https",
        "x-forwarded-host": "warden-cert.example.test",
      }),
    ).toBe("https://warden-cert.example.test");
  });

  it("exposes discovery with the externally reachable root paths", async () => {
    const response = await invoke("metadata", "GET");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      policy_decision_point: ORIGIN,
      access_evaluation_endpoint: `${ORIGIN}${AUTHZEN_CERTIFICATION_ROUTE_MAP.evaluation}`,
      access_evaluations_endpoint: `${ORIGIN}${AUTHZEN_CERTIFICATION_ROUTE_MAP.evaluations}`,
      search_subject_endpoint: `${ORIGIN}${AUTHZEN_CERTIFICATION_ROUTE_MAP.search_subject}`,
      search_resource_endpoint: `${ORIGIN}${AUTHZEN_CERTIFICATION_ROUTE_MAP.search_resource}`,
      search_action_endpoint: `${ORIGIN}${AUTHZEN_CERTIFICATION_ROUTE_MAP.search_action}`,
    });
  });

  it("serves the Basic fixture through the hosted evaluation route", async () => {
    const response = await invoke(
      "evaluation",
      "POST",
      {
        subject: { type: "user", id: "alice" },
        action: { name: "read" },
        resource: { type: "record", id: "record-1" },
      },
      "hosted-eval-001",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("hosted-eval-001");
    expect(await response.json()).toEqual({ decision: true });
  });

  it("serves Batch through the hosted evaluations route", async () => {
    const response = await invoke("evaluations", "POST", {
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
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      evaluations: [{ decision: true }, { decision: false }],
    });
  });

  it("serves Search through the hosted subject-search route", async () => {
    const response = await invoke("search_subject", "POST", {
      subject: { type: "user" },
      action: { name: "read" },
      resource: { type: "record", id: "record-1" },
    });

    expect(response.status).toBe(200);
    const payload = (await response.json()) as { results: Array<{ id: string }> };
    expect(payload.results.map((entry) => entry.id)).toEqual(["alice", "bob"]);
  });

  it("rejects route names outside the certification allow-list", async () => {
    const response = await invoke("silk_live_transfer", "POST", {});
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
  });
});
