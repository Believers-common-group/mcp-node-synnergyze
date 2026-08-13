import { describe, expect, it } from "vitest";

import { resolveComputePlaneStatus } from "./compute-plane.ts";

describe("ALPHA-NODE-001 compute plane", () => {
  it("defaults to governed, Warden-required, no implicit provider", () => {
    const status = resolveComputePlaneStatus({});

    expect(status.ok).toBe(true);
    expect(status.mode).toBe("governed");
    expect(status.require_warden_grant).toBe(true);
    expect(status.default_provider).toBeNull();
    expect(status.apple_mpp.enabled).toBe(false);
    expect(status.apple_mpp.status).toBe("DISABLED");
  });

  it("fails closed when MPP is enabled without a complete runner binding", () => {
    const status = resolveComputePlaneStatus({
      COMPUTE_APPLE_MPP_ENABLED: "true",
      COMPUTE_APPLE_MPP_RUNNER_ID: "GENESIS-APPLE-RUNNER-001",
    });

    expect(status.apple_mpp.runner_configured).toBe(false);
    expect(status.apple_mpp.status).toBe("MISCONFIGURED_FAIL_CLOSED");
  });

  it("never reports MPP ready from environment configuration alone", () => {
    const status = resolveComputePlaneStatus({
      COMPUTE_PLANE_MODE: "governed",
      COMPUTE_DEFAULT_PROVIDER: "none",
      COMPUTE_REQUIRE_WARDEN_GRANT: "true",
      COMPUTE_EVIDENCE_MODE: "envelope",
      COMPUTE_APPLE_MPP_ENABLED: "true",
      COMPUTE_APPLE_MPP_RUNNER_URL: "https://runner.invalid",
      COMPUTE_APPLE_MPP_RUNNER_ID: "GENESIS-APPLE-RUNNER-001",
    });

    expect(status.ok).toBe(true);
    expect(status.apple_mpp.runner_configured).toBe(true);
    expect(status.apple_mpp.status).toBe("CONFIGURED_AWAITING_WARDEN_PROOF");
  });

  it("marks the control plane unhealthy if Warden grants are disabled", () => {
    const status = resolveComputePlaneStatus({
      COMPUTE_REQUIRE_WARDEN_GRANT: "false",
    });

    expect(status.ok).toBe(false);
  });
});
