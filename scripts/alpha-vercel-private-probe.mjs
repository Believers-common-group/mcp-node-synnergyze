#!/usr/bin/env node

const BASE_URL = process.env.ALPHA_VERCEL_BASE_URL?.replace(/\/$/, "");
const BYPASS_SECRET = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const RUN_BRIDGE = process.env.ALPHA_RUN_REGISTRY_BRIDGE === "1";
const BRIDGE_SECRET = process.env.REGISTRY_BRIDGE_SECRET;

function fail(message) {
  console.error(`ALPHA_VERCEL_PROBE_FAIL: ${message}`);
  process.exitCode = 1;
}

function requireConfig() {
  const missing = [];
  if (!BASE_URL) missing.push("ALPHA_VERCEL_BASE_URL");
  if (!BYPASS_SECRET) missing.push("VERCEL_AUTOMATION_BYPASS_SECRET");
  if (RUN_BRIDGE && !BRIDGE_SECRET) missing.push("REGISTRY_BRIDGE_SECRET");
  if (missing.length) {
    throw new Error(`Missing required environment: ${missing.join(", ")}`);
  }
}

function edgeHeaders(extra = {}) {
  return {
    "x-vercel-protection-bypass": BYPASS_SECRET,
    ...extra,
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: edgeHeaders(options.headers ?? {}),
    signal: AbortSignal.timeout(10_000),
    redirect: "manual",
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { response, text, json };
}

async function checkHealth() {
  const { response, json, text } = await request("/health", {
    headers: { accept: "application/json" },
  });

  if (response.status !== 200) {
    throw new Error(`/health expected 200, got ${response.status}: ${text.slice(0, 300)}`);
  }
  if (json?.ok !== true || json?.service !== "synnergyze-genesis-mcp") {
    throw new Error(`/health returned unexpected body: ${text.slice(0, 300)}`);
  }

  console.log("PASS health: private Vercel edge reached service runtime");
}

async function checkMcpMethodBoundary() {
  const { response, json, text } = await request("/mcp", {
    method: "GET",
    headers: { accept: "application/json" },
  });

  if (response.status !== 405 || json?.error !== "Use POST for MCP requests.") {
    throw new Error(`/mcp GET expected governed 405, got ${response.status}: ${text.slice(0, 300)}`);
  }

  console.log("PASS mcp-method: route reached application boundary");
}

async function checkMcpInitialize() {
  const body = {
    jsonrpc: "2.0",
    id: "alpha-vercel-probe:init",
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: {
        name: "alpha-vercel-private-probe",
        version: "1.0.0",
      },
    },
  };

  const { response, json, text } = await request("/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.status !== 200) {
    throw new Error(`/mcp initialize expected 200, got ${response.status}: ${text.slice(0, 500)}`);
  }
  if (json?.jsonrpc !== "2.0" || json?.result?.serverInfo?.name !== "synnergyze-genesis-mcp") {
    throw new Error(`/mcp initialize returned unexpected response: ${text.slice(0, 500)}`);
  }

  console.log("PASS mcp-initialize: Streamable HTTP MCP boundary initialized");
}

async function checkBridgeDefaultDeny() {
  const { response, json, text } = await request("/registry-bridge?limit=1", {
    method: "GET",
    headers: { accept: "application/json" },
  });

  if (response.status !== 401 || json?.error !== "unauthorized") {
    throw new Error(`/registry-bridge without bearer expected 401, got ${response.status}: ${text.slice(0, 300)}`);
  }

  console.log("PASS bridge-default-deny: Vercel bypass does not bypass bridge authorization");
}

async function runAuthorizedBridge() {
  if (!RUN_BRIDGE) {
    console.log("SKIP bridge-authorized: set ALPHA_RUN_REGISTRY_BRIDGE=1 for explicit mutating bridge execution");
    return;
  }

  const { response, json, text } = await request("/registry-bridge?limit=1", {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${BRIDGE_SECRET}`,
    },
  });

  if (![200, 207].includes(response.status)) {
    throw new Error(`/registry-bridge authorized expected 200/207, got ${response.status}: ${text.slice(0, 500)}`);
  }
  if (json?.bridge !== "GEN-PART-PG-BRIDGE-003" || json?.source !== "CWR-REGISTRY") {
    throw new Error(`/registry-bridge returned unexpected governed bridge identity: ${text.slice(0, 500)}`);
  }

  console.log(
    `PASS bridge-authorized: scanned=${json.scanned ?? "?"} delivered=${json.delivered ?? "?"} failed=${json.failed ?? "?"}`,
  );
}

async function main() {
  requireConfig();

  console.log("ALPHA-NODE-001 private Vercel mount probe");
  console.log(`target=${new URL(BASE_URL).host}`);
  console.log("invariant: Vercel bypass authenticates edge access only; it grants no Registry/Warden authority");

  await checkHealth();
  await checkMcpMethodBoundary();
  await checkMcpInitialize();
  await checkBridgeDefaultDeny();
  await runAuthorizedBridge();

  console.log("ALPHA_VERCEL_PROBE_PASS");
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
