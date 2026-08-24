import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";

import { SyntheticAuthzenAuthorizationApi10CertificationPdpV1 } from "../modules/warden/authzen-certification-fixture.ts";
import { handleSyntheticWardenAuthzenHttpV1 } from "../modules/warden/authzen-http.ts";

export const AUTHZEN_CERTIFICATION_ROUTE_MAP = {
  metadata: "/.well-known/authzen-configuration",
  evaluation: "/access/v1/evaluation",
  evaluations: "/access/v1/evaluations",
  search_subject: "/access/v1/search/subject",
  search_resource: "/access/v1/search/resource",
  search_action: "/access/v1/search/action",
} as const;

export type AuthzenCertificationRouteV1 = keyof typeof AUTHZEN_CERTIFICATION_ROUTE_MAP;

function firstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function resolveAuthzenCertificationOriginV1(headers: IncomingHttpHeaders): string {
  const forwardedProto = firstHeader(headers["x-forwarded-proto"]);
  const forwardedHost = firstHeader(headers["x-forwarded-host"]);
  const host = forwardedHost ?? firstHeader(headers.host);
  if (!host) throw new Error("authzen_certification_host_required");

  const protocol = forwardedProto === "http" ? "http" : "https";
  return `${protocol}://${host}`;
}

function headersFromIncoming(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) result.append(name, item);
    } else {
      result.set(name, value);
    }
  }
  return result;
}

async function readIncomingBody(request: IncomingMessage): Promise<string | undefined> {
  if (request.method === "GET" || request.method === "HEAD") return undefined;

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return undefined;
  return Buffer.concat(chunks).toString("utf8");
}

function certificationRoute(url: URL): AuthzenCertificationRouteV1 | undefined {
  const value = url.searchParams.get("route");
  if (!value) return undefined;
  return Object.prototype.hasOwnProperty.call(AUTHZEN_CERTIFICATION_ROUTE_MAP, value)
    ? (value as AuthzenCertificationRouteV1)
    : undefined;
}

export async function handleHostedAuthzenCertificationV1(
  request: Request,
): Promise<Response> {
  const incomingUrl = new URL(request.url);
  const route = certificationRoute(incomingUrl);
  if (!route) {
    return new Response(
      JSON.stringify({
        type: "urn:openid:authzen:error:not_found",
        title: "unknown_certification_route",
        status: 404,
      }),
      {
        status: 404,
        headers: { "content-type": "application/problem+json; charset=utf-8" },
      },
    );
  }

  const origin = `${incomingUrl.protocol}//${incomingUrl.host}`;
  const publicUrl = new URL(AUTHZEN_CERTIFICATION_ROUTE_MAP[route], origin);
  const publicRequest = new Request(publicUrl, {
    method: request.method,
    headers: request.headers,
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.text(),
  });

  const pdp = new SyntheticAuthzenAuthorizationApi10CertificationPdpV1(origin);
  return handleSyntheticWardenAuthzenHttpV1(pdp, publicRequest, {
    now: () => new Date().toISOString(),
    requesterRef: () => "AUTHZEN:OIDF-CERTIFICATION-HARNESS",
  });
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
    response.end(
      JSON.stringify({
        type: "urn:openid:authzen:error:server_error",
        title: "authzen_certification_host_error",
        status: 500,
        detail: error instanceof Error ? error.message : "unknown_error",
      }),
    );
  }
}
