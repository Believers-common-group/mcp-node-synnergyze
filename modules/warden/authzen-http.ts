import {
  AuthzenProfileError,
  type AuthzenAccessEvaluationRequestV1,
  type AuthzenAccessRequestSubmissionV1,
  type SyntheticWardenAuthzenPdpV1,
} from "./authzen-profile.ts";

export interface SyntheticWardenAuthzenHttpOptionsV1 {
  now: () => string;
  requesterRef: (request: Request) => string;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers,
    },
  });
}

function problem(error: AuthzenProfileError): Response {
  return new Response(
    JSON.stringify({
      type: error.type,
      title: error.message,
      status: error.statusCode,
      detail: error.message,
    }),
    {
      status: error.statusCode,
      headers: { "content-type": "application/problem+json; charset=utf-8" },
    },
  );
}

async function body<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new AuthzenProfileError(
      400,
      "urn:openid:authzen:error:invalid_request",
      "invalid_json_body",
    );
  }
}

function requestId(request: Request): string {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export async function handleSyntheticWardenAuthzenHttpV1(
  pdp: SyntheticWardenAuthzenPdpV1,
  request: Request,
  options: SyntheticWardenAuthzenHttpOptionsV1,
): Promise<Response> {
  const url = new URL(request.url);

  try {
    if (request.method === "GET" && url.pathname === "/.well-known/authzen-configuration") {
      return json(pdp.metadata());
    }

    if (request.method === "POST" && url.pathname === "/access/v1/evaluation") {
      const evaluation = await body<AuthzenAccessEvaluationRequestV1>(request);
      const id = requestId(request);
      const response = pdp.evaluate(evaluation, {
        evaluatedAt: options.now(),
        requestId: id,
      });
      return json(response, 200, { "x-request-id": id });
    }

    if (request.method === "POST" && url.pathname === "/access/v1/requests") {
      const idempotencyKey = request.headers.get("idempotency-key");
      if (!idempotencyKey) {
        throw new AuthzenProfileError(
          400,
          "urn:openid:authzen:access-request:error:invalid_request",
          "idempotency_key_required",
        );
      }
      const submission = await body<AuthzenAccessRequestSubmissionV1>(request);
      const response = pdp.submitAccessRequest({
        submission,
        requesterRef: options.requesterRef(request),
        idempotencyKey,
        submittedAt: options.now(),
      });
      return json(response, 202, { location: response.task.status_endpoint });
    }

    if (request.method === "GET" && url.pathname.startsWith("/access/v1/requests/")) {
      const taskId = decodeURIComponent(url.pathname.slice("/access/v1/requests/".length));
      if (!taskId || taskId.includes("/")) {
        throw new AuthzenProfileError(
          404,
          "urn:openid:authzen:access-request:error:unknown_task",
          "unknown_task",
        );
      }
      return json(pdp.getAccessRequest(taskId));
    }

    return new Response(null, { status: 404 });
  } catch (error) {
    if (error instanceof AuthzenProfileError) return problem(error);
    throw error;
  }
}
