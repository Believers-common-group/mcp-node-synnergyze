import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";

interface CheckResult {
  name: string;
  status: "PASS" | "FAIL";
  detail?: string;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function originFromHeaders(headers: IncomingHttpHeaders): string {
  const protocol = firstHeader(headers["x-forwarded-proto"]) === "http" ? "http" : "https";
  const host = firstHeader(headers["x-forwarded-host"]) ?? firstHeader(headers.host);
  if (!host) throw new Error("authzen_hosted_selftest_host_required");
  return `${protocol}://${host}`;
}

function forwardedAuthHeaders(headers: IncomingHttpHeaders): HeadersInit {
  const result: Record<string, string> = {};
  const cookie = firstHeader(headers.cookie);
  const bypass = firstHeader(headers["x-vercel-protection-bypass"]);
  const authorization = firstHeader(headers.authorization);
  if (cookie) result.cookie = cookie;
  if (bypass) result["x-vercel-protection-bypass"] = bypass;
  if (authorization) result.authorization = authorization;
  return result;
}

function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function jsonCall(
  origin: string,
  authHeaders: HeadersInit,
  method: "GET" | "POST",
  path: string,
  payload?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<{ status: number; headers: Headers; body: unknown }> {
  const response = await fetch(new URL(path, `${origin}/`), {
    method,
    redirect: "manual",
    headers: {
      ...authHeaders,
      ...(payload === undefined ? {} : { "content-type": "application/json" }),
      ...extraHeaders,
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });

  const text = await response.text();
  let body: unknown;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, headers: response.headers, body };
}

function asRecord(value: unknown): Record<string, unknown> {
  ensure(typeof value === "object" && value !== null && !Array.isArray(value), "expected_object");
  return value as Record<string, unknown>;
}

async function executeHostedChecks(
  origin: string,
  authHeaders: HeadersInit,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  async function check(name: string, action: () => Promise<void>) {
    try {
      await action();
      results.push({ name, status: "PASS" });
    } catch (error) {
      results.push({
        name,
        status: "FAIL",
        detail: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }

  await check("discovery", async () => {
    const response = await jsonCall(origin, authHeaders, "GET", "/.well-known/authzen-configuration");
    ensure(response.status === 200, `expected_200_got_${response.status}`);
    const body = asRecord(response.body);
    ensure(body.policy_decision_point === origin, "pdp_origin_mismatch");
    ensure(body.access_evaluation_endpoint === `${origin}/access/v1/evaluation`, "evaluation_endpoint_mismatch");
    ensure(body.access_evaluations_endpoint === `${origin}/access/v1/evaluations`, "batch_endpoint_mismatch");
    ensure(body.search_subject_endpoint === `${origin}/access/v1/search/subject`, "subject_search_endpoint_mismatch");
  });

  const alice = { type: "user", id: "alice" };
  const bob = { type: "user", id: "bob" };
  const record1 = { type: "record", id: "record-1" };
  const archived = { type: "record", id: "record-2", properties: { status: "archived" } };

  await check("basic-allow", async () => {
    const response = await jsonCall(origin, authHeaders, "POST", "/access/v1/evaluation", {
      subject: alice,
      action: { name: "read" },
      resource: record1,
    });
    ensure(response.status === 200, `expected_200_got_${response.status}`);
    ensure(asRecord(response.body).decision === true, "expected_allow");
  });

  await check("basic-deny", async () => {
    const response = await jsonCall(origin, authHeaders, "POST", "/access/v1/evaluation", {
      subject: bob,
      action: { name: "write" },
      resource: record1,
    });
    ensure(response.status === 200, `expected_200_got_${response.status}`);
    ensure(asRecord(response.body).decision === false, "expected_deny");
  });

  await check("properties-deny", async () => {
    const response = await jsonCall(origin, authHeaders, "POST", "/access/v1/evaluation", {
      subject: alice,
      action: { name: "write" },
      resource: archived,
    });
    ensure(response.status === 200, `expected_200_got_${response.status}`);
    ensure(asRecord(response.body).decision === false, "expected_archived_deny");
  });

  await check("request-id-echo", async () => {
    const requestId = "AUTHZEN-HOSTED-SELFTEST-001";
    const response = await jsonCall(
      origin,
      authHeaders,
      "POST",
      "/access/v1/evaluation",
      { subject: alice, action: { name: "read" }, resource: record1 },
      { "x-request-id": requestId },
    );
    ensure(response.status === 200, `expected_200_got_${response.status}`);
    ensure(response.headers.get("x-request-id") === requestId, "request_id_not_echoed");
  });

  await check("missing-required-field", async () => {
    const response = await jsonCall(origin, authHeaders, "POST", "/access/v1/evaluation", {
      subject: alice,
      resource: record1,
    });
    ensure(response.status === 400, `expected_400_got_${response.status}`);
  });

  await check("batch", async () => {
    const response = await jsonCall(origin, authHeaders, "POST", "/access/v1/evaluations", {
      subject: alice,
      resource: record1,
      evaluations: [
        { action: { name: "read" } },
        { subject: bob, action: { name: "write" } },
      ],
    });
    ensure(response.status === 200, `expected_200_got_${response.status}`);
    const body = asRecord(response.body);
    ensure(Array.isArray(body.evaluations), "batch_evaluations_missing");
    const evaluations = body.evaluations as Array<Record<string, unknown>>;
    ensure(evaluations.length === 2, "batch_count_mismatch");
    ensure(evaluations[0]?.decision === true, "batch_first_should_allow");
    ensure(evaluations[1]?.decision === false, "batch_second_should_deny");
  });

  await check("subject-search", async () => {
    const response = await jsonCall(origin, authHeaders, "POST", "/access/v1/search/subject", {
      action: { name: "read" },
      resource: record1,
    });
    ensure(response.status === 200, `expected_200_got_${response.status}`);
    const body = asRecord(response.body);
    ensure(Array.isArray(body.results), "search_results_missing");
    const ids = (body.results as Array<Record<string, unknown>>).map((entry) => entry.id);
    ensure(ids.includes("alice") && ids.includes("bob"), "expected_subjects_missing");
  });

  await check("resource-search", async () => {
    const response = await jsonCall(origin, authHeaders, "POST", "/access/v1/search/resource", {
      subject: alice,
      action: { name: "read" },
    });
    ensure(response.status === 200, `expected_200_got_${response.status}`);
    const body = asRecord(response.body);
    ensure(Array.isArray(body.results), "search_results_missing");
    ensure((body.results as unknown[]).length > 0, "resource_search_empty");
  });

  await check("action-search", async () => {
    const response = await jsonCall(origin, authHeaders, "POST", "/access/v1/search/action", {
      subject: alice,
      resource: record1,
    });
    ensure(response.status === 200, `expected_200_got_${response.status}`);
    const body = asRecord(response.body);
    ensure(Array.isArray(body.results), "search_results_missing");
    const names = (body.results as Array<Record<string, unknown>>).map((entry) => entry.name);
    ensure(names.includes("read") && names.includes("write"), "expected_actions_missing");
  });

  return results;
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  try {
    if ((request.method ?? "GET") !== "GET") {
      response.statusCode = 405;
      response.setHeader("allow", "GET");
      response.end("method_not_allowed");
      return;
    }

    const origin = originFromHeaders(request.headers);
    const checks = await executeHostedChecks(origin, forwardedAuthHeaders(request.headers));
    const passed = checks.filter((item) => item.status === "PASS").length;
    const failed = checks.length - passed;

    response.statusCode = failed === 0 ? 200 : 500;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    response.end(
      JSON.stringify({
        proof: "WARDEN-AUTHZEN-R0.2-HOSTED-HTTPS-SELFTEST",
        origin,
        result: failed === 0 ? "PASS" : "FAIL",
        passed,
        failed,
        checks,
      }),
    );
  } catch (error) {
    response.statusCode = 500;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(
      JSON.stringify({
        proof: "WARDEN-AUTHZEN-R0.2-HOSTED-HTTPS-SELFTEST",
        result: "FAIL",
        error: error instanceof Error ? error.message : "unknown_error",
      }),
    );
  }
}
