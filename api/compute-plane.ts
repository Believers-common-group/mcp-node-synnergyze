import type { IncomingMessage, ServerResponse } from "node:http";

export type ComputePlaneStatus = {
  ok: boolean;
  node_id: "ALPHA-NODE-001";
  registry_object: "REG-COMPUTE-001";
  mode: string;
  default_provider: string | null;
  require_warden_grant: boolean;
  evidence_mode: string;
  apple_mpp: {
    enabled: boolean;
    runner_configured: boolean;
    status:
      | "DISABLED"
      | "MISCONFIGURED_FAIL_CLOSED"
      | "CONFIGURED_AWAITING_WARDEN_PROOF";
  };
};

function envFlag(value: string | undefined, failClosedDefault: boolean): boolean {
  if (value === undefined || value === "") return failClosedDefault;
  return value.toLowerCase() === "true";
}

export function resolveComputePlaneStatus(
  env: NodeJS.ProcessEnv = process.env,
): ComputePlaneStatus {
  const mode = env.COMPUTE_PLANE_MODE || "governed";
  const defaultProviderRaw = env.COMPUTE_DEFAULT_PROVIDER || "none";
  const defaultProvider = defaultProviderRaw === "none" ? null : defaultProviderRaw;
  const requireWardenGrant = envFlag(env.COMPUTE_REQUIRE_WARDEN_GRANT, true);
  const evidenceMode = env.COMPUTE_EVIDENCE_MODE || "envelope";

  const mppEnabled = envFlag(env.COMPUTE_APPLE_MPP_ENABLED, false);
  const runnerConfigured = Boolean(
    env.COMPUTE_APPLE_MPP_RUNNER_URL && env.COMPUTE_APPLE_MPP_RUNNER_ID,
  );

  let mppStatus: ComputePlaneStatus["apple_mpp"]["status"] = "DISABLED";
  if (mppEnabled && !runnerConfigured) {
    mppStatus = "MISCONFIGURED_FAIL_CLOSED";
  } else if (mppEnabled && runnerConfigured) {
    mppStatus = "CONFIGURED_AWAITING_WARDEN_PROOF";
  }

  return {
    ok: mode === "governed" && requireWardenGrant && defaultProvider === null,
    node_id: "ALPHA-NODE-001",
    registry_object: "REG-COMPUTE-001",
    mode,
    default_provider: defaultProvider,
    require_warden_grant: requireWardenGrant,
    evidence_mode: evidenceMode,
    apple_mpp: {
      enabled: mppEnabled,
      runner_configured: runnerConfigured,
      status: mppStatus,
    },
  };
}

export default function handler(_request: IncomingMessage, response: ServerResponse) {
  const status = resolveComputePlaneStatus();
  response.statusCode = status.ok ? 200 : 503;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(status));
}
