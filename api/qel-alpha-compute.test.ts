import { describe, expect, it } from "vitest";

import {
  mapComputePlaneStatusToQelFrameV01,
  resolveAlphaComputeQelStatusV01,
} from "./qel-alpha-compute.ts";
import { resolveComputePlaneStatus } from "./compute-plane.ts";
import { validateQelOperationalFrameV01 } from "../modules/qel/operational-contracts.ts";

const NOW = new Date("2026-08-21T09:00:00.000Z");

describe("QEL Alpha compute plane API fixture", () => {
  it("maps the fail-closed default compute plane into a valid READY QEL frame", () => {
    const status = resolveComputePlaneStatus({});
    const frame = mapComputePlaneStatusToQelFrameV01({
      status,
      observedAt: NOW.toISOString(),
      correlationId: "QEL-API-COMPUTE-001",
    });

    expect(status.ok).toBe(true);
    expect(frame.object).toMatchObject({
      id: "REG-COMPUTE-001",
      type: "COMPUTE_PLANE",
      locationRef: "ALPHA-NODE-001",
    });
    expect(frame.state.value).toBe("READY");
    expect(frame.health.value).toBe("GOOD");
    expect(frame.outcome.state).toBe("OBSERVED");
    expect(frame.outcome.riverReceiptRef).toBeUndefined();
    expect(validateQelOperationalFrameV01(frame)).toEqual({ ok: true, issues: [] });
  });

  it("surfaces Apple MPP fail-closed misconfiguration without claiming execution failure", () => {
    const result = resolveAlphaComputeQelStatusV01(
      {
        COMPUTE_APPLE_MPP_ENABLED: "true",
      },
      () => NOW,
    );

    expect(result.ok).toBe(true);
    expect(result.frame.state.value).toBe("DEGRADED");
    expect(result.frame.health.value).toBe("ACT");
    expect(result.frame.demand).toEqual({
      type: "SERVICE",
      priority: "HIGH",
      target: "configure_apple_mpp_runner_or_disable_provider",
    });
    expect(result.frame.risk).toMatchObject({
      type: "APPLE_MPP_CONFIGURATION",
      severity: "HIGH",
    });
    expect(result.frame.outcome.state).toBe("OBSERVED");
    expect(result.pulse.proof.verifiedOutcomes).toBe(0);
    expect(result.pulse.proof.unresolvedOutcomes).toBe(1);
  });

  it("surfaces configured Apple MPP as awaiting Warden proof rather than executable authority", () => {
    const result = resolveAlphaComputeQelStatusV01(
      {
        COMPUTE_APPLE_MPP_ENABLED: "true",
        COMPUTE_APPLE_MPP_RUNNER_URL: "https://runner.invalid",
        COMPUTE_APPLE_MPP_RUNNER_ID: "GENESIS-APPLE-RUNNER-001",
      },
      () => NOW,
    );

    expect(result.frame.state.value).toBe("READY");
    expect(result.frame.health.value).toBe("WATCH");
    expect(result.frame.demand).toEqual({
      type: "APPROVAL",
      priority: "MODERATE",
      target: "warden_compute_proof_required_before_execution",
    });
    expect(result.frame.moves.find((move) => move.action === "REQUEST_COMPUTE")?.authority).toBe(
      "APPROVAL_REQUIRED",
    );
    expect(result.pulse.moves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "REQUEST_COMPUTE",
          authority: "APPROVAL_REQUIRED",
        }),
      ]),
    );
  });

  it("shows non-governed compute configuration as BLOCKED in QEL while keeping monitoring available", () => {
    const result = resolveAlphaComputeQelStatusV01(
      {
        COMPUTE_PLANE_MODE: "direct",
        COMPUTE_REQUIRE_WARDEN_GRANT: "false",
        COMPUTE_DEFAULT_PROVIDER: "apple-mpp-local",
      },
      () => NOW,
    );

    expect(result.ok).toBe(true);
    expect(result.frame.state.value).toBe("BLOCKED");
    expect(result.frame.health.value).toBe("ACT");
    expect(result.frame.risk).toMatchObject({
      type: "COMPUTE_POLICY_CONFIGURATION",
      severity: "HIGH",
    });
    expect(result.pulse.now.blockedCount).toBe(1);
    expect(result.pulse.now.health).toBe("ACT");
  });
});
