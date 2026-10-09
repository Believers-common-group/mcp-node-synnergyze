/**
 * AWCE R0.4: non-effect, authenticated modern MCP health probe.
 *
 * Exact endpoint bindings and bearer credentials come from trusted, separately
 * admitted configuration. No network requests are made until inspect() is
 * explicitly invoked by an authorized executor controller. This module does
 * not invoke MCP business tools, spawn stdio workers or admit executors.
 *
 * Pins MCP 2026-07-28. Older MCP servers fail closed; no legacy fallback.
 */
import type { ExecutorRecord } from "./awceExecutionRouter.ts";
import type { NativeHealthProbe } from "./awceCircuitBreaker.ts";

const PROTOCOL = "2026-07-28";
const DISCOVER_ID = "awce-health-discover";
const MAX_RESPONSE_BYTES = 8192;
const MAX_TOKEN_LENGTH = 4096;

export interface EndpointBinding {
  executorId: string;
  capability: string;
  artifactDigest: string;
  url: string;
  /** Admission-controlled server origin from configuration, not the RPC. */
  approvedOrigin: string;
}
export interface EndpointResolver {
  resolve(executor: ExecutorRecord): Promise<EndpointBinding | null>;
}
export interface BearerCredentialProvider {
  /** Read-only credential, scoped to this exact executor and discovery. */
  bearerToken(executor: ExecutorRecord): Promise<string>;
}
export interface HttpHealthDependencies {
  endpoints: EndpointResolver;
  credentials: BearerCredentialProvider;
  /** Injectable for tests; production must use approved egress and DNS policy. */
  fetcher: (input: string, init: RequestInit) => Promise<Response>;
  clock: { now(): number };
}

function verifiedEndpoint(binding: EndpointBinding | null, executor: ExecutorRecord): URL | null {
  if (!binding || executor.state !== "ADMITTED"
    || binding.executorId !== executor.id
    || binding.capability !== executor.capability
    || binding.artifactDigest !== executor.artifactDigest) return null;

  try {
    const url = new URL(binding.url);
    const approved = new URL(binding.approvedOrigin);
    // No credentials, URL fragments, raw IP literals, redirects or insecure HTTP.
    // These checks do not replace network-layer protections against DNS rebinding.
    if (url.protocol !== "https:" || url.port !== "" || url.username || url.password
      || url.search || url.hash || approved.protocol !== "https:" || approved.port !== ""
      || approved.username || approved.password || approved.pathname !== "/"
      || approved.search || approved.hash || url.origin !== approved.origin
      || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(url.hostname)
      || url.hostname === "localhost"
      || url.hostname.endsWith(".localhost")
      || url.hostname.endsWith(".local")
      || url.hostname.endsWith(".internal")) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

async function boundedJson(response: Response, limit: number): Promise<unknown> {
  const length = response.headers.get("content-length");
  if (length && Number(length) > limit) throw Error("PROBE_RESPONSE_TOO_LARGE");
  if (!response.body) throw Error("EMPTY_PROBE_RESPONSE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const step = await reader.read();
      if (step.done) break;
      received += step.value.byteLength;
      if (received > limit) throw Error("PROBE_RESPONSE_TOO_LARGE");
      chunks.push(step.value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const data = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)) as unknown;
}

function validDiscovery(raw: unknown): boolean {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const body = raw as Record<string, unknown>;
  if (body.jsonrpc !== "2.0" || body.id !== DISCOVER_ID || "error" in body) return false;
  if (!body.result || typeof body.result !== "object" || Array.isArray(body.result)) return false;
  const result = body.result as Record<string, unknown>;
  return result.resultType === "complete"
    && Array.isArray(result.supportedVersions)
    && result.supportedVersions.includes(PROTOCOL)
    && result.capabilities !== null
    && typeof result.capabilities === "object"
    && !Array.isArray(result.capabilities);
}

/**
 * Health is only an authenticated protocol handshake alternative: the
 * stateless server/discover method. Never tools/call, tools/list or mutation.
 * Success is liveness/protocol evidence, NOT Warden permission or a River receipt.
 */
export function createAuthenticatedMcpHealthProbe(
  deps: HttpHealthDependencies,
): NativeHealthProbe {
  return {
    inspect: async (executor, timeoutMs): Promise<boolean> => {
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3000) return false;
      const started = deps.clock.now();
      let binding: EndpointBinding | null;
      try {
        binding = await deps.endpoints.resolve(executor);
      } catch {
        return false;
      }
      const url = verifiedEndpoint(binding, executor);
      if (!url) return false;

      let token: string;
      try {
        token = await deps.credentials.bearerToken(executor);
      } catch {
        return false;
      }
      if (!token || token.length > MAX_TOKEN_LENGTH || !/^[A-Za-z0-9._~+=-]+$/.test(token)) {
        return false;
      }

      const elapsed = deps.clock.now() - started;
      if (!Number.isFinite(elapsed) || elapsed >= timeoutMs) return false;
      const controller = new AbortController();
      const remainingMs = Math.max(1, Math.min(timeoutMs - elapsed, 3000));
      // setTimeout is a native Node runtime API; injectable fetcher supports test
      // fixtures without I/O. The host must enforce the transport deadline too.
      const deadline = setTimeout(() => controller.abort(), remainingMs);
      try {
        const response = await deps.fetcher(url.href, {
          method: "POST",
          redirect: "error",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            "MCP-Protocol-Version": PROTOCOL,
            "Mcp-Method": "server/discover",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: DISCOVER_ID,
            method: "server/discover",
            params: {
              _meta: {
                "io.modelcontextprotocol/protocolVersion": PROTOCOL,
                "io.modelcontextprotocol/clientInfo": {
                  name: "awce-health",
                  version: "0.4.0",
                },
                "io.modelcontextprotocol/clientCapabilities": {},
              },
            },
          }),
        });
        if (controller.signal.aborted || !response.ok
            || response.status !== 200
            || !response.headers.get("content-type")?.toLowerCase().includes("application/json")
            || deps.clock.now() - started > timeoutMs) {
          return false;
        }
        const result = await boundedJson(response, MAX_RESPONSE_BYTES);
        return !controller.signal.aborted
          && deps.clock.now() - started <= timeoutMs
          && validDiscovery(result);
      } catch {
        return false;
      } finally {
        clearTimeout(deadline);
      }
    },
  };
}
