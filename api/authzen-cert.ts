import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";

export const AUTHZEN_CERTIFICATION_ROUTE_MAP = {
  metadata: "/.well-known/authzen-configuration",
  evaluation: "/access/v1/evaluation",
  evaluations: "/access/v1/evaluations",
  search_subject: "/access/v1/search/subject",
  search_resource: "/access/v1/search/resource",
  search_action: "/access/v1/search/action",
} as const;

export type AuthzenCertificationRouteV1 = keyof typeof AUTHZEN_CERTIFICATION_ROUTE_MAP;

type Entity = { type: string; id?: string; properties?: Record<string, unknown> };
type Action = { name: string; properties?: Record<string, unknown> };
type Evaluation = {
  subject?: Entity;
  action?: Action;
  resource?: Entity;
  context?: Record<string, unknown>;
  [key: string]: unknown;
};

type BatchRequest = Evaluation & {
  evaluations?: Evaluation[];
  options?: { evaluations_semantic?: string; [key: string]: unknown };
};

const SUBJECTS: readonly Entity[] = [
  { type: "user", id: "alice" },
  { type: "user", id: "bob", properties: { role: "admin" } },
];
const RESOURCES: readonly Entity[] = [
  { type: "record", id: "record-1", properties: { status: "active" } },
  { type: "record", id: "record-2", properties: { status: "archived" } },
];
const ACTIONS: readonly Action[] = [{ name: "read" }, { name: "write" }, { name: "delete" }];

class HostedAuthzenError extends Error {
  readonly statusCode: number;
  readonly type: string;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "HostedAuthzenError";
    this.statusCode = statusCode;
    this.type = "urn:openid:authzen:error:invalid_request";
  }
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveAuthzenCertificationOriginV1(headers: IncomingHttpHeaders): string {
  const forwardedProto = firstHeader(headers["x-forwarded-proto"]);
  const forwardedHost = firstHeader(headers["x-forwarded-host"]);
  const host = forwardedHost ?? firstHeader(headers.host);
  if (!host) throw new Error("authzen_certification_host_required");
  return `${forwardedProto === "http" ? "http" : "https"}://${host}`;
}

function routeFromUrl(url: URL): AuthzenCertificationRouteV1 | undefined {
  const value = url.searchParams.get("route");
  if (!value) return undefined;
  return Object.prototype.hasOwnProperty.call(AUTHZEN_CERTIFICATION_ROUTE_MAP, value)
    ? (value as AuthzenCertificationRouteV1)
    : undefined;
}

function validateEvaluation(input: Evaluation): asserts input is Evaluation & {
  subject: Entity & { id: string };
  action: Action;
  resource: Entity & { id: string };
} {
  if (!input.subject?.type || !input.subject.id) throw new HostedAuthzenError(400, "authzen_subject_required");
  if (!input.resource?.type || !input.resource.id) throw new HostedAuthzenError(400, "authzen_resource_required");
  if (!input.action?.name) throw new HostedAuthzenError(400, "authzen_action_required");
}

function evaluate(input: Evaluation): { decision: boolean } {
  validateEvaluation(input);
  const subjectRole = input.subject.properties?.role;
  const resourceStatus = input.resource.properties?.status;
  const softDelete = input.action.properties?.soft;

  if (input.action.name === "write" && resourceStatus === "archived") {
    return { decision: subjectRole === "admin" };
  }
  if (input.subject.id === "alice" && input.action.name === "delete" && input.resource.id === "record-1") {
    return { decision: softDelete === true };
  }
  if (
    input.subject.id === "alice" &&
    input.resource.id === "record-1" &&
    (input.action.name === "read" || input.action.name === "write")
  ) {
    return { decision: true };
  }
  if (input.subject.id === "bob" && input.resource.id === "record-1" && input.action.name === "read") {
    return { decision: true };
  }
  return { decision: false };
}

function evaluateMany(input: BatchRequest): { evaluations: Array<{ decision: boolean; context?: { reason: string } }> } | { decision: boolean } {
  if (input.evaluations !== undefined && !Array.isArray(input.evaluations)) {
    throw new HostedAuthzenError(400, "authzen_evaluations_array_required");
  }
  if (!input.evaluations || input.evaluations.length === 0) {
    return evaluate(input);
  }

  return {
    evaluations: input.evaluations.map((entry) => {
      const merged: Evaluation = {
        subject: entry.subject ?? input.subject,
        action: entry.action ?? input.action,
        resource: entry.resource ?? input.resource,
        context: entry.context ?? input.context,
      };
      if (!merged.subject?.type || !merged.subject.id) return { decision: false, context: { reason: "authzen_subject_required" } };
      if (!merged.action?.name) return { decision: false, context: { reason: "authzen_action_required" } };
      if (!merged.resource?.type || !merged.resource.id) return { decision: false, context: { reason: "authzen_resource_required" } };
      return evaluate(merged);
    }),
  };
}

function knownSubject(subject: Entity): boolean {
  return subject.type === "user" && SUBJECTS.some((candidate) => candidate.id === subject.id);
}
function knownResource(resource: Entity): boolean {
  return resource.type === "record" && RESOURCES.some((candidate) => candidate.id === resource.id);
}
function knownAction(action: Action): boolean {
  return ACTIONS.some((candidate) => candidate.name === action.name);
}

function searchSubjects(input: Record<string, unknown>): { results: Entity[] } {
  const subject = input.subject as Entity | undefined;
  const action = input.action as Action | undefined;
  const resource = input.resource as Entity | undefined;
  if (!subject?.type) throw new HostedAuthzenError(400, "authzen_subject_type_required");
  if (!action?.name) throw new HostedAuthzenError(400, "authzen_action_required");
  if (!resource?.type || !resource.id) throw new HostedAuthzenError(400, "authzen_resource_required");
  if (subject.type !== "user" || !knownResource(resource) || !knownAction(action)) return { results: [] };
  return {
    results: SUBJECTS.filter((candidate) => evaluate({ subject: candidate, action, resource, context: input.context as Record<string, unknown> | undefined }).decision).map(copy),
  };
}

function searchResources(input: Record<string, unknown>): { results: Entity[] } {
  const subject = input.subject as Entity | undefined;
  const action = input.action as Action | undefined;
  const resource = input.resource as Entity | undefined;
  if (!subject?.type || !subject.id) throw new HostedAuthzenError(400, "authzen_subject_required");
  if (!action?.name) throw new HostedAuthzenError(400, "authzen_action_required");
  if (!resource?.type) throw new HostedAuthzenError(400, "authzen_resource_type_required");
  if (resource.type !== "record" || !knownSubject(subject) || !knownAction(action)) return { results: [] };
  return {
    results: RESOURCES.filter((candidate) => evaluate({ subject, action, resource: candidate, context: input.context as Record<string, unknown> | undefined }).decision).map(copy),
  };
}

function searchActions(input: Record<string, unknown>): { results: Action[] } {
  const subject = input.subject as Entity | undefined;
  const resource = input.resource as Entity | undefined;
  if (!subject?.type || !subject.id) throw new HostedAuthzenError(400, "authzen_subject_required");
  if (!resource?.type || !resource.id) throw new HostedAuthzenError(400, "authzen_resource_required");
  if (!knownSubject(subject) || !knownResource(resource)) return { results: [] };
  return {
    results: ACTIONS.filter((action) => evaluate({ subject, action, resource, context: input.context as Record<string, unknown> | undefined }).decision).map((action) => ({ name: action.name })),
  };
}

function metadata(origin: string) {
  return {
    policy_decision_point: origin,
    access_evaluation_endpoint: `${origin}${AUTHZEN_CERTIFICATION_ROUTE_MAP.evaluation}`,
    access_evaluations_endpoint: `${origin}${AUTHZEN_CERTIFICATION_ROUTE_MAP.evaluations}`,
    search_subject_endpoint: `${origin}${AUTHZEN_CERTIFICATION_ROUTE_MAP.search_subject}`,
    search_resource_endpoint: `${origin}${AUTHZEN_CERTIFICATION_ROUTE_MAP.search_resource}`,
    search_action_endpoint: `${origin}${AUTHZEN_CERTIFICATION_ROUTE_MAP.search_action}`,
  };
}

async function parseBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object_required");
    return value as Record<string, unknown>;
  } catch {
    throw new HostedAuthzenError(400, "invalid_json_body");
  }
}

function jsonResponse(status: number, body: unknown, requestId?: string, problem = false): Response {
  const headers = new Headers({
    "content-type": `${problem ? "application/problem+json" : "application/json"}; charset=utf-8`,
  });
  if (requestId) headers.set("x-request-id", requestId);
  return new Response(JSON.stringify(body), { status, headers });
}

export async function handleHostedAuthzenCertificationV1(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const route = routeFromUrl(url);
  if (!route) {
    return jsonResponse(404, { type: "urn:openid:authzen:error:not_found", title: "unknown_certification_route", status: 404 }, undefined, true);
  }

  const origin = `${url.protocol}//${url.host}`;
  const requestId = request.headers.get("x-request-id") ?? `authzen-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    if (route === "metadata") {
      if (request.method !== "GET") throw new HostedAuthzenError(405, "method_not_allowed");
      return jsonResponse(200, metadata(origin), requestId);
    }
    if (request.method !== "POST") throw new HostedAuthzenError(405, "method_not_allowed");
    const body = await parseBody(request);

    if (route === "evaluation") return jsonResponse(200, evaluate(body), requestId);
    if (route === "evaluations") return jsonResponse(200, evaluateMany(body), requestId);
    if (route === "search_subject") return jsonResponse(200, searchSubjects(body), requestId);
    if (route === "search_resource") return jsonResponse(200, searchResources(body), requestId);
    return jsonResponse(200, searchActions(body), requestId);
  } catch (error) {
    if (error instanceof HostedAuthzenError) {
      return jsonResponse(error.statusCode, { type: error.type, title: error.message, status: error.statusCode }, requestId, true);
    }
    return jsonResponse(500, { type: "urn:openid:authzen:error:server_error", title: "authzen_certification_host_error", status: 500 }, requestId, true);
  }
}

function headersFromIncoming(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => result.append(name, item));
    else result.set(name, value);
  }
  return result;
}

async function readIncomingBody(request: IncomingMessage): Promise<string | undefined> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (chunks.length === 0) return undefined;
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  try {
    const origin = resolveAuthzenCertificationOriginV1(request.headers);
    const requestUrl = new URL(request.url ?? "/api/authzen-cert", origin);
    const webRequest = new Request(requestUrl, {
      method: request.method ?? "GET",
      headers: headersFromIncoming(request.headers),
      body: await readIncomingBody(request),
    });
    const webResponse = await handleHostedAuthzenCertificationV1(webRequest);
    response.statusCode = webResponse.status;
    webResponse.headers.forEach((value, name) => response.setHeader(name, value));
    response.end(Buffer.from(await webResponse.arrayBuffer()));
  } catch (error) {
    response.statusCode = 500;
    response.setHeader("content-type", "application/problem+json; charset=utf-8");
    response.end(JSON.stringify({
      type: "urn:openid:authzen:error:server_error",
      title: "authzen_certification_host_error",
      status: 500,
      detail: error instanceof Error ? error.message : "unknown_error",
    }));
  }
}
