import {
  AuthzenProfileError,
  type AuthzenAccessEvaluationRequestV1,
  type AuthzenAccessEvaluationResponseV1,
  type AuthzenAccessRequestSubmissionV1,
  type AuthzenActionV1,
  type AuthzenEntityV1,
  type AuthzenPdpMetadataV1,
  type AuthzenTaskResponseV1,
} from "./authzen-profile.ts";

export type AuthzenSearchTargetEntityV1 = Omit<AuthzenEntityV1, "id"> & { id?: string };

export interface AuthzenBatchEvaluationV1 {
  subject?: AuthzenEntityV1;
  action?: AuthzenActionV1;
  resource?: AuthzenEntityV1;
  context?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AuthzenAccessEvaluationsRequestV1 {
  subject?: AuthzenEntityV1;
  action?: AuthzenActionV1;
  resource?: AuthzenEntityV1;
  context?: Record<string, unknown>;
  evaluations?: AuthzenBatchEvaluationV1[];
  options?: {
    evaluations_semantic?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface AuthzenAccessEvaluationsResponseV1 {
  evaluations: AuthzenAccessEvaluationResponseV1[];
  context?: Record<string, unknown>;
}

export interface AuthzenSubjectSearchRequestV1 {
  subject: AuthzenSearchTargetEntityV1;
  action: AuthzenActionV1;
  resource: AuthzenEntityV1;
  context?: Record<string, unknown>;
  page?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AuthzenResourceSearchRequestV1 {
  subject: AuthzenEntityV1;
  action: AuthzenActionV1;
  resource: AuthzenSearchTargetEntityV1;
  context?: Record<string, unknown>;
  page?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AuthzenActionSearchRequestV1 {
  subject: AuthzenEntityV1;
  resource: AuthzenEntityV1;
  context?: Record<string, unknown>;
  page?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AuthzenSearchResponseV1<T extends AuthzenEntityV1 | AuthzenActionV1> {
  results: T[];
  context?: Record<string, unknown>;
  page?: {
    next_token: string;
    count?: number;
    total?: number;
    properties?: Record<string, unknown>;
  };
}

export interface SyntheticWardenAuthzenHttpPdpV1 {
  metadata():
    | AuthzenPdpMetadataV1
    | {
        policy_decision_point: string;
        access_evaluation_endpoint: string;
        [key: string]: unknown;
      };
  evaluate(
    request: AuthzenAccessEvaluationRequestV1,
    runtime: { evaluatedAt: string; requestId: string },
  ): AuthzenAccessEvaluationResponseV1;
  evaluateMany?(
    request: AuthzenAccessEvaluationsRequestV1,
    runtime: { evaluatedAt: string; requestId: string },
  ): AuthzenAccessEvaluationsResponseV1 | AuthzenAccessEvaluationResponseV1;
  searchSubjects?(
    request: AuthzenSubjectSearchRequestV1,
    runtime: { evaluatedAt: string; requestId: string },
  ): AuthzenSearchResponseV1<AuthzenEntityV1>;
  searchResources?(
    request: AuthzenResourceSearchRequestV1,
    runtime: { evaluatedAt: string; requestId: string },
  ): AuthzenSearchResponseV1<AuthzenEntityV1>;
  searchActions?(
    request: AuthzenActionSearchRequestV1,
    runtime: { evaluatedAt: string; requestId: string },
  ): AuthzenSearchResponseV1<AuthzenActionV1>;
  submitAccessRequest(input: {
    submission: AuthzenAccessRequestSubmissionV1;
    requesterRef: string;
    idempotencyKey: string;
    submittedAt: string;
  }): AuthzenTaskResponseV1;
  getAccessRequest(taskId: string): AuthzenTaskResponseV1;
}

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

function unsupported(path: string): never {
  throw new AuthzenProfileError(404, "urn:openid:authzen:error:not_supported", path);
}

export async function handleSyntheticWardenAuthzenHttpV1(
  pdp: SyntheticWardenAuthzenHttpPdpV1,
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

    if (request.method === "POST" && url.pathname === "/access/v1/evaluations") {
      if (!pdp.evaluateMany) unsupported("access_evaluations_not_enabled");
      const evaluations = await body<AuthzenAccessEvaluationsRequestV1>(request);
      const id = requestId(request);
      const response = pdp.evaluateMany(evaluations, {
        evaluatedAt: options.now(),
        requestId: id,
      });
      return json(response, 200, { "x-request-id": id });
    }

    if (request.method === "POST" && url.pathname === "/access/v1/search/subject") {
      if (!pdp.searchSubjects) unsupported("subject_search_not_enabled");
      const search = await body<AuthzenSubjectSearchRequestV1>(request);
      const id = requestId(request);
      const response = pdp.searchSubjects(search, {
        evaluatedAt: options.now(),
        requestId: id,
      });
      return json(response, 200, { "x-request-id": id });
    }

    if (request.method === "POST" && url.pathname === "/access/v1/search/resource") {
      if (!pdp.searchResources) unsupported("resource_search_not_enabled");
      const search = await body<AuthzenResourceSearchRequestV1>(request);
      const id = requestId(request);
      const response = pdp.searchResources(search, {
        evaluatedAt: options.now(),
        requestId: id,
      });
      return json(response, 200, { "x-request-id": id });
    }

    if (request.method === "POST" && url.pathname === "/access/v1/search/action") {
      if (!pdp.searchActions) unsupported("action_search_not_enabled");
      const search = await body<AuthzenActionSearchRequestV1>(request);
      const id = requestId(request);
      const response = pdp.searchActions(search, {
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
    if (
      error instanceof Error &&
      ["authzen_subject_required", "authzen_resource_required", "authzen_action_required"].includes(
        error.message,
      )
    ) {
      return problem(
        new AuthzenProfileError(
          400,
          "urn:openid:authzen:error:invalid_request",
          error.message,
        ),
      );
    }
    throw error;
  }
}
