import { describe, expect, it } from "vitest";

import { InMemoryContainmentControlPlaneV1 } from "./containment-control.ts";
import {
  InMemoryMaintenanceControlPlaneV1,
  type MaintenanceCheckpointV1,
  type MaintenanceSessionOpenRequestV1,
} from "./maintenance-control.ts";

const TARGET = "ALPHA-NODE-SERVICE-001";
const PROGRAM = "SYNNERGYZE-PROGRAM:MAINTENANCE-001";
const MAINTENANCE_AUTHORITY = "WARDEN:ALPHA:MAINTENANCE-001";
const RESTART_AUTHORITY = "WARDEN:ALPHA:RESTART-001";

function pausedContainment(): InMemoryContainmentControlPlaneV1 {
  const plane = new InMemoryContainmentControlPlaneV1();
  plane.transition({
    controlTargetId: TARGET,
    scope: "TARGET",
    state: "PAUSED",
    reason: "maintenance_required",
    authorityRef: MAINTENANCE_AUTHORITY,
    effectiveAt: "2026-08-28T00:00:00.000Z",
  });
  return plane;
}

function openRequest(
  overrides: Partial<MaintenanceSessionOpenRequestV1> = {},
): MaintenanceSessionOpenRequestV1 {
  return {
    targetRef: TARGET,
    programRef: PROGRAM,
    reasonCode: "service_health_degraded",
    plannedWork: ["inspect_service", "apply_remediation", "verify_recovery"],
    maintenanceAuthorityRef: MAINTENANCE_AUTHORITY,
    restartAuthorityRef: RESTART_AUTHORITY,
    requiredIsolationState: "PAUSED",
    limitedRestartCapabilityRefs: ["service_request.read"],
    openedAt: "2026-08-28T00:01:00.000Z",
    expiresAt: "2026-08-28T02:00:00.000Z",
    ...overrides,
  };
}

function record(
  maintenance: InMemoryMaintenanceControlPlaneV1,
  sessionRef: string,
  checkpoint: MaintenanceCheckpointV1,
  at: string,
  authorityRef = MAINTENANCE_AUTHORITY,
): void {
  maintenance.recordCheckpoint({
    sessionRef,
    checkpoint,
    evidenceRefs: [`RIVER-EVIDENCE:${checkpoint}:001`],
    authorityRef,
    recordedAt: at,
  });
}

function completeThrough(
  maintenance: InMemoryMaintenanceControlPlaneV1,
  sessionRef: string,
  finalCheckpoint: MaintenanceCheckpointV1,
): void {
  const ordered: readonly MaintenanceCheckpointV1[] = [
    "STOP_VERIFIED",
    "WORK_COMPLETE",
    "INSPECTION_PASS",
    "DEPENDENCIES_READY",
    "RESTART_AUTHORIZED",
    "LIMITED_RESTART",
    "POST_RESTART_OBSERVED",
    "RESTORED",
  ];
  const times = [
    "2026-08-28T00:02:00.000Z",
    "2026-08-28T00:10:00.000Z",
    "2026-08-28T00:15:00.000Z",
    "2026-08-28T00:20:00.000Z",
    "2026-08-28T00:25:00.000Z",
    "2026-08-28T00:30:00.000Z",
    "2026-08-28T00:40:00.000Z",
    "2026-08-28T00:45:00.000Z",
  ];
  for (let index = 0; index < ordered.length; index += 1) {
    const checkpoint = ordered[index]!;
    record(
      maintenance,
      sessionRef,
      checkpoint,
      times[index]!,
      checkpoint === "RESTART_AUTHORIZED" ||
        checkpoint === "LIMITED_RESTART" ||
        checkpoint === "RESTORED"
        ? RESTART_AUTHORITY
        : MAINTENANCE_AUTHORITY,
    );
    if (checkpoint === finalCheckpoint) return;
  }
}

describe("WARDEN-MAINTENANCE-CONTROL-001", () => {
  it("refuses to open a maintenance session until the required containment state is present", () => {
    const containment = new InMemoryContainmentControlPlaneV1();
    const maintenance = new InMemoryMaintenanceControlPlaneV1(containment);

    expect(() => maintenance.openSession(openRequest())).toThrow(
      "maintenance_required_isolation_not_present",
    );
  });

  it("opens an evidenced maintenance session against an already contained target", () => {
    const containment = pausedContainment();
    const maintenance = new InMemoryMaintenanceControlPlaneV1(containment);

    const session = maintenance.openSession(openRequest());

    expect(session.sessionRef).toMatch(/^WARDEN-MAINTENANCE-SESSION:/);
    expect(session.state).toBe("OPEN");
    expect(session.currentCheckpoint).toBeNull();
    expect(session.requiredIsolationState).toBe("PAUSED");
  });

  it("requires ordered checkpoints and River evidence for every maintenance transition", () => {
    const containment = pausedContainment();
    const maintenance = new InMemoryMaintenanceControlPlaneV1(containment);
    const session = maintenance.openSession(openRequest());

    expect(() =>
      maintenance.recordCheckpoint({
        sessionRef: session.sessionRef,
        checkpoint: "WORK_COMPLETE",
        evidenceRefs: ["RIVER-EVIDENCE:WORK:001"],
        authorityRef: MAINTENANCE_AUTHORITY,
        recordedAt: "2026-08-28T00:03:00.000Z",
      }),
    ).toThrow("maintenance_checkpoint_out_of_order");

    expect(() =>
      maintenance.recordCheckpoint({
        sessionRef: session.sessionRef,
        checkpoint: "STOP_VERIFIED",
        evidenceRefs: [],
        authorityRef: MAINTENANCE_AUTHORITY,
        recordedAt: "2026-08-28T00:03:00.000Z",
      }),
    ).toThrow("maintenance_checkpoint_evidence_required");
  });

  it("keeps the target contained until restart authorization and uses RESTRICTED for limited restart", () => {
    const containment = pausedContainment();
    const maintenance = new InMemoryMaintenanceControlPlaneV1(containment);
    const session = maintenance.openSession(openRequest());

    completeThrough(maintenance, session.sessionRef, "RESTART_AUTHORIZED");
    expect(
      containment.evaluate({
        targetRef: TARGET,
        capabilityRef: "service_request.read",
        programRef: PROGRAM,
        evaluatedAt: "2026-08-28T00:26:00.000Z",
      }).state,
    ).toBe("PAUSED");

    record(
      maintenance,
      session.sessionRef,
      "LIMITED_RESTART",
      "2026-08-28T00:30:00.000Z",
      RESTART_AUTHORITY,
    );

    const allowed = containment.evaluate({
      targetRef: TARGET,
      capabilityRef: "service_request.read",
      programRef: PROGRAM,
      evaluatedAt: "2026-08-28T00:31:00.000Z",
    });
    const denied = containment.evaluate({
      targetRef: TARGET,
      capabilityRef: "service_request.create",
      programRef: PROGRAM,
      evaluatedAt: "2026-08-28T00:31:00.000Z",
    });

    expect(allowed.state).toBe("RESTRICTED");
    expect(allowed.decision).toBe("ALLOW");
    expect(denied.decision).toBe("DENY");
  });

  it("requires the designated restart authority for restart checkpoints and records denials", () => {
    const containment = pausedContainment();
    const maintenance = new InMemoryMaintenanceControlPlaneV1(containment);
    const session = maintenance.openSession(openRequest());
    completeThrough(maintenance, session.sessionRef, "DEPENDENCIES_READY");

    expect(() =>
      maintenance.recordCheckpoint({
        sessionRef: session.sessionRef,
        checkpoint: "RESTART_AUTHORIZED",
        evidenceRefs: ["RIVER-EVIDENCE:RESTART-APPROVAL:001"],
        authorityRef: MAINTENANCE_AUTHORITY,
        recordedAt: "2026-08-28T00:25:00.000Z",
      }),
    ).toThrow("maintenance_restart_authority_mismatch");

    expect(maintenance.maintenanceSnapshot("2026-08-28T00:26:00.000Z")).toMatchObject({
      failedRestartAttemptCount: 1,
      openSessionCount: 1,
    });
  });

  it("restores ACTIVE only after post-restart observation and exposes recovery metrics", () => {
    const containment = pausedContainment();
    const maintenance = new InMemoryMaintenanceControlPlaneV1(containment);
    const session = maintenance.openSession(openRequest());

    completeThrough(maintenance, session.sessionRef, "RESTORED");

    const active = containment.evaluate({
      targetRef: TARGET,
      capabilityRef: "service_request.create",
      programRef: PROGRAM,
      evaluatedAt: "2026-08-28T00:46:00.000Z",
    });
    expect(active.state).toBe("ACTIVE");
    expect(active.decision).toBe("ALLOW");

    const snapshot = maintenance.maintenanceSnapshot("2026-08-28T00:46:00.000Z");
    expect(snapshot).toMatchObject({
      openSessionCount: 0,
      completedSessionCount: 1,
      failedRestartAttemptCount: 0,
      repeatFailureCount: 0,
      meanTimeToRecoveryMs: 44 * 60 * 1000,
    });
    expect(snapshot.recoveryReadySessionRefs).toEqual([]);
  });

  it("counts repeat failures for the same target and reason across completed sessions", () => {
    const containment = pausedContainment();
    const maintenance = new InMemoryMaintenanceControlPlaneV1(containment);
    const first = maintenance.openSession(openRequest());
    completeThrough(maintenance, first.sessionRef, "RESTORED");

    containment.transition({
      controlTargetId: TARGET,
      scope: "TARGET",
      state: "PAUSED",
      reason: "maintenance_required_again",
      authorityRef: MAINTENANCE_AUTHORITY,
      effectiveAt: "2026-08-28T01:00:00.000Z",
    });
    maintenance.openSession(
      openRequest({
        openedAt: "2026-08-28T01:01:00.000Z",
        expiresAt: "2026-08-28T03:00:00.000Z",
      }),
    );

    expect(maintenance.maintenanceSnapshot("2026-08-28T01:02:00.000Z").repeatFailureCount).toBe(1);
  });
});
