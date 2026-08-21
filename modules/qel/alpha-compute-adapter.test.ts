import { describe, expect, it } from "vitest";

import {
  ComputeEvidenceJournal,
  GovernedComputeCoordinator,
  SyntheticCpuComputeRunner,
  makeSyntheticComputeGrant,
  makeSyntheticComputeIntent,
} from "../../compute/runtime.ts";
import {
  buildAlphaComputePodPulseV01,
  mapAlphaComputeRunnerToQelFrameV01,
  QEL_ALPHA_COMPUTE_ADAPTER_REF,
  QEL_FIXTURE_001_REF,
} from "./alpha-compute-adapter.ts";
import { validateQelOperationalFrameV01 } from "./operational-contracts.ts";

const OBSERVED_AT = "2026-08-13T07:00:00.000Z";
const FIXED_NOW = Date.parse(OBSERVED_AT);

function makeRuntime(): {
  evidence: ComputeEvidenceJournal;
  coordinator: GovernedComputeCoordinator;
  runner: SyntheticCpuComputeRunner;
} {
  const evidence = new ComputeEvidenceJournal();
  const coordinator = new GovernedComputeCoordinator(evidence, () => FIXED_NOW);
  const runner = new SyntheticCpuComputeRunner();
  coordinator.registerRunner(runner);
  return { evidence, coordinator, runner };
}

describe("QEL-FIXTURE-001 Alpha compute adapter", () => {
  it("maps an enrolled attested Alpha compute runner into a valid provider-neutral QEL frame", () => {
    const { runner } = makeRuntime();

    const frame = mapAlphaComputeRunnerToQelFrameV01({
      registration: runner.registration,
      observedAt: OBSERVED_AT,
      correlationId: "QEL-COMPUTE-READY-001",
    });

    expect(frame.frameRef).toContain(QEL_FIXTURE_001_REF);
    expect(frame.object).toMatchObject({
      id: "ALPHA-SYNTHETIC-COMPUTE-RUNNER-001",
      type: "COMPUTE_SERVICE",
      locationRef: "ALPHA-NODE-001",
    });
    expect(frame.state.value).toBe("READY");
    expect(frame.health.value).toBe("GOOD");
    expect(frame.outcome.state).toBe("UNKNOWN");
    expect(frame.native?.adapterRef).toBe(QEL_ALPHA_COMPUTE_ADAPTER_REF);
    expect(validateQelOperationalFrameV01(frame)).toEqual({ ok: true, issues: [] });
  });

  it("does not elevate the compute runtime VERIFIED status into a River-verified QEL outcome", () => {
    const { coordinator, runner } = makeRuntime();
    const intent = makeSyntheticComputeIntent("QEL-COMPUTE-EVIDENCE-001");
    const result = coordinator.attempt(intent, makeSyntheticComputeGrant(intent));

    expect(result.status).toBe("VERIFIED");

    const frame = mapAlphaComputeRunnerToQelFrameV01({
      registration: runner.registration,
      attempt: result,
      observedAt: OBSERVED_AT,
      correlationId: intent.correlationId,
    });

    expect(frame.outcome.state).toBe("EVIDENCE_BOUND");
    expect(frame.outcome.riverReceiptRef).toBeUndefined();
    expect(frame.flow.state).toBe("COMPLETE");
    expect(validateQelOperationalFrameV01(frame).ok).toBe(true);
  });

  it("surfaces a missing Warden grant as a blocked QEL object with an approval demand", () => {
    const { coordinator, runner } = makeRuntime();
    const intent = makeSyntheticComputeIntent("QEL-COMPUTE-NO-GRANT-001");
    const result = coordinator.attempt(intent);

    const frame = mapAlphaComputeRunnerToQelFrameV01({
      registration: runner.registration,
      attempt: result,
      observedAt: OBSERVED_AT,
      correlationId: intent.correlationId,
    });

    expect(result.status).toBe("BLOCKED_REQUIREMENT");
    expect(frame.state.value).toBe("BLOCKED");
    expect(frame.health.value).toBe("WATCH");
    expect(frame.demand).toEqual({
      type: "APPROVAL",
      priority: "HIGH",
      target: "warden_compute_grant_missing",
    });
    expect(frame.risk).toMatchObject({
      type: "COMPUTE_ACTION_BLOCKED",
      severity: "MODERATE",
    });
    expect(frame.moves.find((move) => move.action === "RUN_COMPUTE")?.authority).toBe(
      "APPROVAL_REQUIRED",
    );
  });

  it("surfaces the compute frame through NOW / NEEDS / RISKS / MOVES / PROOF Pod Pulse semantics", () => {
    const { coordinator, runner } = makeRuntime();
    const intent = makeSyntheticComputeIntent("QEL-COMPUTE-PULSE-001");
    const result = coordinator.attempt(intent, makeSyntheticComputeGrant(intent));

    const pulse = buildAlphaComputePodPulseV01({
      podRef: "POD-ALPHA-COMPUTE-001",
      registration: runner.registration,
      attempt: result,
      observedAt: OBSERVED_AT,
      correlationId: intent.correlationId,
    });

    expect(pulse.now).toMatchObject({
      objectCount: 1,
      blockedCount: 0,
      criticalCount: 0,
      health: "GOOD",
    });
    expect(pulse.moves).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: "VIEW", authority: "ALLOWED" }),
        expect.objectContaining({ action: "RUN_COMPUTE", authority: "APPROVAL_REQUIRED" }),
      ]),
    );
    expect(pulse.proof.verifiedOutcomes).toBe(0);
    expect(pulse.proof.unresolvedOutcomes).toBe(1);
    expect(pulse.proof.riverBoundOutcomes).toBe(0);
  });
});
