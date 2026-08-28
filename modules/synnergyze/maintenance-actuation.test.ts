import { describe, expect, it } from "vitest";

import { InMemoryContainmentControlPlaneV1 } from "./containment-control.ts";
import { InMemoryMaintenanceControlPlaneV1 } from "./maintenance-control.ts";
import {
  MaintenanceActuationCoordinatorV1,
  SyntheticMaintenanceActuatorV1,
} from "./maintenance-actuation.ts";

const TARGET = "ALPHA-NODE-SERVICE-001";
const PROGRAM = "SYNNERGYZE-PROGRAM:MAINTENANCE-ACTUATION-001";
const MAINTENANCE_AUTHORITY = "WARDEN:ALPHA:MAINTENANCE-001";
const RESTART_AUTHORITY = "WARDEN:ALPHA:RESTART-001";

function fixture() {
  const containment = new InMemoryContainmentControlPlaneV1();
  containment.transition({
    controlTargetId: TARGET,
    scope: "TARGET",
    state: "PAUSED",
    reason: "maintenance_required",
    authorityRef: MAINTENANCE_AUTHORITY,
    effectiveAt: "2026-08-29T00:00:00.000Z",
  });
  const maintenance = new InMemoryMaintenanceControlPlaneV1(containment);
  const session = maintenance.openSession({
    targetRef: TARGET,
    programRef: PROGRAM,
    reasonCode: "service_health_degraded",
    plannedWork: ["inspect_service", "apply_remediation", "verify_recovery"],
    maintenanceAuthorityRef: MAINTENANCE_AUTHORITY,
    restartAuthorityRef: RESTART_AUTHORITY,
    requiredIsolationState: "PAUSED",
    limitedRestartCapabilityRefs: ["service_request.read"],
    openedAt: "2026-08-29T00:01:00.000Z",
    expiresAt: "2026-08-29T02:00:00.000Z",
  });
  const actuator = new SyntheticMaintenanceActuatorV1();
  const coordinator = new MaintenanceActuationCoordinatorV1(maintenance, actuator);
  return { containment, maintenance, session, actuator, coordinator };
}

function manualCheckpoint(
  maintenance: InMemoryMaintenanceControlPlaneV1,
  sessionRef: string,
  checkpoint:
    | "WORK_COMPLETE"
    | "INSPECTION_PASS"
    | "DEPENDENCIES_READY"
    | "RESTART_AUTHORIZED"
    | "POST_RESTART_OBSERVED",
  recordedAt: string,
  authorityRef = MAINTENANCE_AUTHORITY,
) {
  return maintenance.recordCheckpoint({
    sessionRef,
    checkpoint,
    evidenceRefs: [`RIVER-EVIDENCE:${checkpoint}:001`],
    authorityRef,
    recordedAt,
  });
}

describe("WARDEN-MAINTENANCE-CONTROL-001 R0.2 actuator + effect verification", () => {
  it("does not advance STOP_VERIFIED when actuator effect cannot be verified", () => {
    const { maintenance, session, actuator, coordinator } = fixture();
    actuator.setObservedEffect("STOP", "MISMATCHED_STATE");

    const result = coordinator.executeCheckpoint({
      sessionRef: session.sessionRef,
      checkpoint: "STOP_VERIFIED",
      authorityRef: MAINTENANCE_AUTHORITY,
      requestedAt: "2026-08-29T00:02:00.000Z",
      executedAt: "2026-08-29T00:02:05.000Z",
      observedAt: "2026-08-29T00:02:10.000Z",
      verifiedAt: "2026-08-29T00:02:15.000Z",
    });

    expect(result.state).toBe("EFFECT_NOT_VERIFIED");
    expect(maintenance.session(session.sessionRef)?.currentCheckpoint).toBeNull();
    expect(actuator.invocationCount()).toBe(1);
  });

  it("binds STOP_VERIFIED to command, execution, observation and verified effect receipts", () => {
    const { maintenance, session, coordinator } = fixture();

    const result = coordinator.executeCheckpoint({
      sessionRef: session.sessionRef,
      checkpoint: "STOP_VERIFIED",
      authorityRef: MAINTENANCE_AUTHORITY,
      requestedAt: "2026-08-29T00:02:00.000Z",
      executedAt: "2026-08-29T00:02:05.000Z",
      observedAt: "2026-08-29T00:02:10.000Z",
      verifiedAt: "2026-08-29T00:02:15.000Z",
    });

    expect(result.state).toBe("CHECKPOINT_RECORDED");
    if (result.state !== "CHECKPOINT_RECORDED") throw new Error("expected_recorded");
    expect(result.commandRef).toMatch(/^WARDEN-MAINTENANCE-COMMAND:/);
    expect(result.executionReceiptRef).toMatch(/^MAINTENANCE-ACTUATION-RECEIPT:/);
    expect(result.observationRef).toMatch(/^MAINTENANCE-ACTUATION-OBSERVATION:/);
    expect(result.effectVerificationRef).toMatch(/^MAINTENANCE-EFFECT-VERIFICATION:/);
    expect(result.checkpointReceipt.evidenceRefs).toEqual(
      expect.arrayContaining([
        result.commandRef,
        result.executionReceiptRef,
        result.observationRef,
        result.effectVerificationRef,
      ]),
    );
    expect(maintenance.session(session.sessionRef)?.currentCheckpoint).toBe("STOP_VERIFIED");
  });

  it("uses restart authority and a verified RESTRICTED effect for LIMITED_RESTART", () => {
    const { containment, maintenance, session, coordinator } = fixture();
    coordinator.executeCheckpoint({
      sessionRef: session.sessionRef,
      checkpoint: "STOP_VERIFIED",
      authorityRef: MAINTENANCE_AUTHORITY,
      requestedAt: "2026-08-29T00:02:00.000Z",
      executedAt: "2026-08-29T00:02:05.000Z",
      observedAt: "2026-08-29T00:02:10.000Z",
      verifiedAt: "2026-08-29T00:02:15.000Z",
    });
    manualCheckpoint(maintenance, session.sessionRef, "WORK_COMPLETE", "2026-08-29T00:10:00.000Z");
    manualCheckpoint(maintenance, session.sessionRef, "INSPECTION_PASS", "2026-08-29T00:15:00.000Z");
    manualCheckpoint(maintenance, session.sessionRef, "DEPENDENCIES_READY", "2026-08-29T00:20:00.000Z");
    manualCheckpoint(
      maintenance,
      session.sessionRef,
      "RESTART_AUTHORIZED",
      "2026-08-29T00:25:00.000Z",
      RESTART_AUTHORITY,
    );

    const denied = coordinator.executeCheckpoint({
      sessionRef: session.sessionRef,
      checkpoint: "LIMITED_RESTART",
      authorityRef: MAINTENANCE_AUTHORITY,
      requestedAt: "2026-08-29T00:30:00.000Z",
      executedAt: "2026-08-29T00:30:05.000Z",
      observedAt: "2026-08-29T00:30:10.000Z",
      verifiedAt: "2026-08-29T00:30:15.000Z",
    });
    expect(denied.state).toBe("AUTHORITY_DENIED");

    const allowed = coordinator.executeCheckpoint({
      sessionRef: session.sessionRef,
      checkpoint: "LIMITED_RESTART",
      authorityRef: RESTART_AUTHORITY,
      requestedAt: "2026-08-29T00:31:00.000Z",
      executedAt: "2026-08-29T00:31:05.000Z",
      observedAt: "2026-08-29T00:31:10.000Z",
      verifiedAt: "2026-08-29T00:31:15.000Z",
    });
    expect(allowed.state).toBe("CHECKPOINT_RECORDED");
    expect(
      containment.evaluate({
        targetRef: TARGET,
        capabilityRef: "service_request.read",
        programRef: PROGRAM,
        evaluatedAt: "2026-08-29T00:32:00.000Z",
      }).state,
    ).toBe("RESTRICTED");
  });

  it("does not mark RESTORED until ACTIVE is observed and effect-verified", () => {
    const { maintenance, session, actuator, coordinator } = fixture();
    coordinator.executeCheckpoint({
      sessionRef: session.sessionRef,
      checkpoint: "STOP_VERIFIED",
      authorityRef: MAINTENANCE_AUTHORITY,
      requestedAt: "2026-08-29T00:02:00.000Z",
      executedAt: "2026-08-29T00:02:05.000Z",
      observedAt: "2026-08-29T00:02:10.000Z",
      verifiedAt: "2026-08-29T00:02:15.000Z",
    });
    manualCheckpoint(maintenance, session.sessionRef, "WORK_COMPLETE", "2026-08-29T00:10:00.000Z");
    manualCheckpoint(maintenance, session.sessionRef, "INSPECTION_PASS", "2026-08-29T00:15:00.000Z");
    manualCheckpoint(maintenance, session.sessionRef, "DEPENDENCIES_READY", "2026-08-29T00:20:00.000Z");
    manualCheckpoint(maintenance, session.sessionRef, "RESTART_AUTHORIZED", "2026-08-29T00:25:00.000Z", RESTART_AUTHORITY);
    coordinator.executeCheckpoint({
      sessionRef: session.sessionRef,
      checkpoint: "LIMITED_RESTART",
      authorityRef: RESTART_AUTHORITY,
      requestedAt: "2026-08-29T00:30:00.000Z",
      executedAt: "2026-08-29T00:30:05.000Z",
      observedAt: "2026-08-29T00:30:10.000Z",
      verifiedAt: "2026-08-29T00:30:15.000Z",
    });
    manualCheckpoint(maintenance, session.sessionRef, "POST_RESTART_OBSERVED", "2026-08-29T00:40:00.000Z");

    actuator.setObservedEffect("RESTORE", "RESTRICTED");
    const failed = coordinator.executeCheckpoint({
      sessionRef: session.sessionRef,
      checkpoint: "RESTORED",
      authorityRef: RESTART_AUTHORITY,
      requestedAt: "2026-08-29T00:45:00.000Z",
      executedAt: "2026-08-29T00:45:05.000Z",
      observedAt: "2026-08-29T00:45:10.000Z",
      verifiedAt: "2026-08-29T00:45:15.000Z",
    });
    expect(failed.state).toBe("EFFECT_NOT_VERIFIED");
    expect(maintenance.session(session.sessionRef)?.state).toBe("LIMITED_RESTART");

    actuator.setObservedEffect("RESTORE", "ACTIVE");
    const restored = coordinator.executeCheckpoint({
      sessionRef: session.sessionRef,
      checkpoint: "RESTORED",
      authorityRef: RESTART_AUTHORITY,
      requestedAt: "2026-08-29T00:46:00.000Z",
      executedAt: "2026-08-29T00:46:05.000Z",
      observedAt: "2026-08-29T00:46:10.000Z",
      verifiedAt: "2026-08-29T00:46:15.000Z",
    });
    expect(restored.state).toBe("CHECKPOINT_RECORDED");
    expect(maintenance.session(session.sessionRef)?.state).toBe("RESTORED");
  });
});
