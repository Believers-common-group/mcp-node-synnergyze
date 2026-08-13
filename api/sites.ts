import type { IncomingMessage, ServerResponse } from "node:http";

export type EstateSiteId = "bc" | "cc" | "vsr";

export interface EstateSite {
  id: EstateSiteId;
  name: string;
  canonical_url: string;
  role: string;
  alpha_node_id: "ALPHA-NODE-001";
  registry_object: "REG-SITE-001";
  authority_boundary: "WARDEN";
  navigation: EstateSiteId[];
}

export interface EstateSiteRegistry {
  schema_version: "1.0";
  registry_object: "REG-SITE-001";
  alpha_node_id: "ALPHA-NODE-001";
  authority_boundary: "WARDEN";
  session_policy: "NO_SHARED_CROSS_DOMAIN_COOKIE";
  sites: EstateSite[];
}

export const ESTATE_SITE_REGISTRY: EstateSiteRegistry = {
  schema_version: "1.0",
  registry_object: "REG-SITE-001",
  alpha_node_id: "ALPHA-NODE-001",
  authority_boundary: "WARDEN",
  session_policy: "NO_SHARED_CROSS_DOMAIN_COOKIE",
  sites: [
    {
      id: "bc",
      name: "Believers Common",
      canonical_url: "https://believerscommon.com",
      role: "governance-and-participation-entry",
      alpha_node_id: "ALPHA-NODE-001",
      registry_object: "REG-SITE-001",
      authority_boundary: "WARDEN",
      navigation: ["cc", "vsr"],
    },
    {
      id: "cc",
      name: "Creators Common",
      canonical_url: "https://creators-common.org",
      role: "creator-and-shared-commons",
      alpha_node_id: "ALPHA-NODE-001",
      registry_object: "REG-SITE-001",
      authority_boundary: "WARDEN",
      navigation: ["bc", "vsr"],
    },
    {
      id: "vsr",
      name: "Virtual Silk Road",
      canonical_url: "https://virtualsilkroad.com",
      role: "front-gate-and-participation-network",
      alpha_node_id: "ALPHA-NODE-001",
      registry_object: "REG-SITE-001",
      authority_boundary: "WARDEN",
      navigation: ["bc", "cc"],
    },
  ],
};

export function resolveSite(id: string | undefined): EstateSite | undefined {
  return ESTATE_SITE_REGISTRY.sites.find((site) => site.id === id);
}

export function isAllowedSiteOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  if (
    origin === "https://believerscommon.com" ||
    origin === "https://www.believerscommon.com" ||
    origin === "https://creators-common.org" ||
    origin === "https://www.creators-common.org" ||
    origin === "https://virtualsilkroad.com" ||
    origin === "https://www.virtualsilkroad.com"
  ) {
    return true;
  }

  return /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
}

function requestUrl(request: IncomingMessage): URL {
  return new URL(request.url || "/api/sites", "https://alpha.invalid");
}

export default function handler(request: IncomingMessage, response: ServerResponse) {
  const origin = request.headers.origin;
  if (isAllowedSiteOrigin(origin)) {
    response.setHeader("access-control-allow-origin", origin as string);
    response.setHeader("vary", "Origin");
  }
  response.setHeader("access-control-allow-methods", "GET, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
  response.setHeader("cache-control", "public, max-age=60, s-maxage=300");

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (request.method !== "GET") {
    response.statusCode = 405;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
    return;
  }

  const url = requestUrl(request);
  const requestedId = url.searchParams.get("id") || undefined;
  if (requestedId) {
    const site = resolveSite(requestedId);
    if (!site) {
      response.statusCode = 404;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ ok: false, error: "site_not_found" }));
      return;
    }
    response.statusCode = 200;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({ ok: true, site }));
    return;
  }

  response.statusCode = 200;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify({ ok: true, registry: ESTATE_SITE_REGISTRY }));
}
