import { createHash } from "node:crypto";

import type {
  ContainmentControlRecordV1,
  ContainmentEvaluationRequestV1,
  ContainmentEvaluationV1,
  ContainmentStateV1,
  ContainmentTransitionReceiptV1,
} from "./containment-control.ts";

export type MaintenanceCheckpointV1 =
  | "STOP_VERIFIED"
  | "WORK_COMPLETE"
  | "INSPECTION_PASS"
  | "DEPENDENCIES_READY"
  | "RESTART_AUTHORIZED"
  | "LIMITED_RESTART"
  | "POST_RESTART_OBSERVED"
  | "RESTORED";

export type MaintenanceSessionStateV1 = "OPEN" | "LIMITED_RESTART" | "RESTORED";

export interface MaintenanceSessionOpenRequestV1 {
  targetRef: string;
  programRef: string;
  reasonCode: string;
  plannedWork: readonly string[];
  maintenanceAuthorityRef: string;
  restartAuthorityRef: string;
  requiredIsolationState: Extract<ContainmentStateV1, "PAUSED" | "ISOLATED" | "DISABLED">;
  limitedRestartCapabilityRefs: readonly string[];
  openedAt: string;
  expiresAt: string;
}

export interface MaintenanceSessionV1 extends MaintenanceSessionOpenRequestV1 {
  sessionRef: string;
  state: MaintenanceSessionStateV1;
  currentCheckpoint: MaintenanceCheckpointV1 | null;
  checkpointRefs: readonly string[];
  completedAt?: string;
}

export interface MaintenanceCheckpointRequestV1 {
  sessionRef: string;
  checkpoint: MaintenanceCheckpointV1;
  evidenceRefs: readonly string[];
  authorityRef: string;
  recordedAt: string;
}

export interface MaintenanceCheckpointReceiptV1 extends MaintenanceCheckpointRequestV1 {
  checkpointRef: string;
  previousCheckpoint: MaintenanceCheckpointV1 | null;
  stateAfter: MaintenanceSessionStateV1;
  containmentTransitionRef?: string;
}

export interface MaintenanceObservatorySessionV1 {
  sessionRef: string;
  targetRef: string;
  reasonCode: string;
  state: MaintenanceSessionStateV1 | "EXPIRED";
  currentCheckpoint: MaintenanceCheckpointV1 | null;
  durationMs: number;
  recoveryReady: boolean;
  expiresAt: string;
}

export interface MaintenanceSnapshotV1 {
  evaluatedAt: string;
  openSessionCount: number;
  completedSessionCount: number;
  expiredSessionCount: number;
  checkpointCount: number;
  failedRestartAttemptCount: number;
  repeatFailureCount: number;
  meanTimeToRecoveryMs: number | null;
  recoveryReadySessionRefs: readonly string[];
  sessions: readonly MaintenanceObservatorySessionV1[];
}

export interface ContainmentMaintenancePortV1 {
  transition(record: ContainmentControlRecordV1): ContainmentTransitionReceiptV1;
  evaluate(input: ContainmentEvaluationRequestV1): ContainmentEvaluationV1;
}

interface StoredSession {
  session: MaintenanceSessionV1;
  receipts: MaintenanceCheckpointReceiptV1[];
}

const ORDER: readonly MaintenanceCheckpointV1[] = [
  "STOP_VERIFIED",
  "WORK_COMPLETE",
  "INSPECTION_PASS",
  "DEPENDENCIES_READY",
  "RESTART_AUTHORIZED",
  "LIMITED_RESTART",
  "POST_RESTART_OBSERVED",
  "RESTORED",
];

const RESTART_AUTHORITY_CHECKPOINTS = new Set<MaintenanceCheckpointV1>([
  "RESTART_AUTHORIZED",
  "LIMITED_RESTART",
  "RESTORED",
]);

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string, errorCode: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(errorCode);
  return parsed;
}

function requireText(value: string, errorCode: string): void {
  if (!value.trim()) throw new Error(errorCode);
}

function cloneSession(session: MaintenanceSessionV1): MaintenanceSessionV1 {
  return {
    ...session,
    plannedWork: [...session.plannedWork],
    limitedRestartCapabilityRefs: [...session.limitedRestartCapabilityRefs],
    checkpointRefs: [...session.checkpointRefs],
  };
}

function nextCheckpoint(current: MaintenanceCheckpointV1 | null): MaintenanceCheckpointV1 | undefined {
  if (current === null) return ORDER[0];
  const index = ORDER.indexOf(current);
  return index < 0 ? undefined : ORDER[index + 1];
}

function checkpointRank(checkpoint: MaintenanceCheckpointV1 | null): number {
  return checkpoint === null ? -1 : ORDER.indexOf(checkpoint);
}

export class InMemoryMaintenanceControlPlaneV1 {
  private readonly sessions = new Map<string, StoredSession>();
  private readonly activeSessionByTarget = new Map<string, string>();
  private failedRestartAttempts = 0;

  constructor(private readonly containment: ContainmentMaintenancePortV1) {}

  openSession(input: MaintenanceSessionOpenRequestV1): MaintenanceSessionV1 {
    requireText(input.targetRef, "maintenance_target_required");
    requireText(input.programRef, "maintenance_program_required");
    requireText(input.reasonCode, "maintenance_reason_required");
    requireText(input.maintenanceAuthorityRef, "maintenance_authority_required");
    requireText(input.restartAuthorityRef, "maintenance_restart_authority_required");
    if (!input.plannedWork.length || input.plannedWork.some((item) => !item.trim())) {
      throw new Error("maintenance_planned_work_required");
    }
    if (
      !input.limitedRestartCapabilityRefs.length ||
      input.limitedRestartCapabilityRefs.some((capability) => !capability.trim())
    ) {
      throw new Error("maintenance_limited_restart_capabilities_required");
    }

    const opened = parseInstant(input.openedAt, "maintenance_invalid_open_time");
    const expires = parseInstant(input.expiresAt, "maintenance_invalid_expiry_time");
    if (expires <= opened) throw new Error("maintenance_invalid_validity_window");
    if (this.activeSessionByTarget.has(input.targetRef)) {
      throw new Error("maintenance_target_already_in_session");
    }

    const isolation = this.containment.evaluate({
      targetRef: input.targetRef,
      capabilityRef: "maintenance.control",
      programRef: input.programRef,
      evaluatedAt: input.openedAt,
    });
    if (isolation.state !== input.requiredIsolationState) {
      throw new Error("maintenance_required_isolation_not_present");
    }

    const normalized: MaintenanceSessionOpenRequestV1 = {
      ...input,
      plannedWork: [...input.plannedWork],
      limitedRestartCapabilityRefs: [...input.limitedRestartCapabilityRefs],
    };
    const sessionRef = `WARDEN-MAINTENANCE-SESSION:${digest(JSON.stringify(normalized)).slice(0, 24)}`;
    const session: MaintenanceSessionV1 = {
      ...normalized,
      sessionRef,
      state: "OPEN",
      currentCheckpoint: null,
      checkpointRefs: [],
    };
    this.sessions.set(sessionRef, { session, receipts: [] });
    this.activeSessionByTarget.set(input.targetRef, sessionRef);
    return cloneSession(session);
  }

  recordCheckpoint(input: MaintenanceCheckpointRequestV1): MaintenanceCheckpointReceiptV1 {
    const stored = this.sessions.get(input.sessionRef);
    if (!stored) throw new Error("maintenance_session_not_found");
    if (stored.session.state === "RESTORED") throw new Error("maintenance_session_restored");
    requireText(input.authorityRef, "maintenance_checkpoint_authority_required");
    if (!input.evidenceRefs.length || input.evidenceRefs.some((ref) => !ref.trim())) {
      throw new Error("maintenance_checkpoint_evidence_required");
    }

    const recorded = parseInstant(input.recordedAt, "maintenance_invalid_checkpoint_time");
    const opened = parseInstant(stored.session.openedAt, "maintenance_invalid_open_time");
    const expires = parseInstant(stored.session.expiresAt, "maintenance_invalid_expiry_time");
    if (recorded < opened) throw new Error("maintenance_checkpoint_before_session");
    if (recorded > expires) {
      if (RESTART_AUTHORITY_CHECKPOINTS.has(input.checkpoint)) this.failedRestartAttempts += 1;
      throw new Error("maintenance_session_expired");
    }

    const expected = nextCheckpoint(stored.session.currentCheckpoint);
    if (input.checkpoint !== expected) {
      if (RESTART_AUTHORITY_CHECKPOINTS.has(input.checkpoint)) this.failedRestartAttempts += 1;
      throw new Error("maintenance_checkpoint_out_of_order");
    }

    const expectedAuthority = RESTART_AUTHORITY_CHECKPOINTS.has(input.checkpoint)
      ? stored.session.restartAuthorityRef
      : stored.session.maintenanceAuthorityRef;
    if (input.authorityRef !== expectedAuthority) {
      if (RESTART_AUTHORITY_CHECKPOINTS.has(input.checkpoint)) this.failedRestartAttempts += 1;
      throw new Error(
        RESTART_AUTHORITY_CHECKPOINTS.has(input.checkpoint)
          ? "maintenance_restart_authority_mismatch"
          : "maintenance_authority_mismatch",
      );
    }

    const previousCheckpoint = stored.session.currentCheckpoint;
    const cumulativeEvidence = [
      ...stored.receipts.flatMap((receipt) => receipt.evidenceRefs),
      ...input.evidenceRefs,
    ];
    let containmentTransitionRef: string | undefined;
    let stateAfter = stored.session.state;

    if (input.checkpoint === "LIMITED_RESTART") {
      try {
        const transition = this.containment.transition({
          controlTargetId: stored.session.targetRef,
          scope: "TARGET",
          state: "RESTRICTED",
          reason: "maintenance_limited_restart",
          authorityRef: stored.session.restartAuthorityRef,
          effectiveAt: input.recordedAt,
          allowedCapabilityRefs: [...stored.session.limitedRestartCapabilityRefs],
          recoveryEvidenceRefs: cumulativeEvidence,
        });
        containmentTransitionRef = transition.transitionRef;
        stateAfter = "LIMITED_RESTART";
      } catch (error) {
        this.failedRestartAttempts += 1;
        throw error;
      }
    }

    if (input.checkpoint === "RESTORED") {
      try {
        const transition = this.containment.transition({
          controlTargetId: stored.session.targetRef,
          scope: "TARGET",
          state: "ACTIVE",
          reason: "maintenance_recovery_verified",
          authorityRef: stored.session.restartAuthorityRef,
          effectiveAt: input.recordedAt,
          recoveryEvidenceRefs: cumulativeEvidence,
        });
        containmentTransitionRef = transition.transitionRef;
        stateAfter = "RESTORED";
      } catch (error) {
        this.failedRestartAttempts += 1;
        throw error;
      }
    }

    const checkpointRef = `WARDEN-MAINTENANCE-CHECKPOINT:${digest(
      JSON.stringify({
        sessionRef: input.sessionRef,
        checkpoint: input.checkpoint,
        previousCheckpoint,
        evidenceRefs: [...input.evidenceRefs],
        authorityRef: input.authorityRef,
        recordedAt: input.recordedAt,
        containmentTransitionRef: containmentTransitionRef ?? null,
      }),
    ).slice(0, 24)}`;
    const receipt: MaintenanceCheckpointReceiptV1 = {
      ...input,
      evidenceRefs: [...input.evidenceRefs],
      checkpointRef,
      previousCheckpoint,
      stateAfter,
      containmentTransitionRef,
    };

    stored.receipts.push(receipt);
    stored.session = {
      ...stored.session,
      currentCheckpoint: input.checkpoint,
      state: stateAfter,
      checkpointRefs: [...stored.session.checkpointRefs, checkpointRef],
      completedAt: stateAfter === "RESTORED" ? input.recordedAt : stored.session.completedAt,
    };
    if (stateAfter === "RESTORED") {
      this.activeSessionByTarget.delete(stored.session.targetRef);
    }
    return { ...receipt, evidenceRefs: [...receipt.evidenceRefs] };
  }

  session(sessionRef: string): MaintenanceSessionV1 | undefined {
    const stored = this.sessions.get(sessionRef);
    return stored ? cloneSession(stored.session) : undefined;
  }

  checkpointReceipts(sessionRef: string): readonly MaintenanceCheckpointReceiptV1[] {
    const stored = this.sessions.get(sessionRef);
    if (!stored) return [];
    return stored.receipts.map((receipt) => ({
      ...receipt,
      evidenceRefs: [...receipt.evidenceRefs],
    }));
  }

  maintenanceSnapshot(evaluatedAt: string): MaintenanceSnapshotV1 {
    const evaluated = parseInstant(evaluatedAt, "maintenance_invalid_snapshot_time");
    const sessions = [...this.sessions.values()].map(({ session }) => {
      const opened = parseInstant(session.openedAt, "maintenance_invalid_open_time");
      const expires = parseInstant(session.expiresAt, "maintenance_invalid_expiry_time");
      const completed = session.completedAt
        ? parseInstant(session.completedAt, "maintenance_invalid_completion_time")
        : undefined;
      const expired = session.state !== "RESTORED" && evaluated > expires;
      const end = completed ?? Math.min(evaluated, expires);
      const recoveryReady =
        !expired &&
        session.state !== "RESTORED" &&
        checkpointRank(session.currentCheckpoint) >= checkpointRank("DEPENDENCIES_READY");
      const observatory: MaintenanceObservatorySessionV1 = {
        sessionRef: session.sessionRef,
        targetRef: session.targetRef,
        reasonCode: session.reasonCode,
        state: expired ? "EXPIRED" : session.state,
        currentCheckpoint: session.currentCheckpoint,
        durationMs: Math.max(0, end - opened),
        recoveryReady,
        expiresAt: session.expiresAt,
      };
      return observatory;
    });

    const completedDurations = [...this.sessions.values()]
      .filter(({ session }) => session.state === "RESTORED" && session.completedAt)
      .map(({ session }) =>
        parseInstant(session.completedAt!, "maintenance_invalid_completion_time") -
        parseInstant(session.openedAt, "maintenance_invalid_open_time"),
      );
    const meanTimeToRecoveryMs = completedDurations.length
      ? completedDurations.reduce((sum, duration) => sum + duration, 0) / completedDurations.length
      : null;

    const failureCounts = new Map<string, number>();
    for (const { session } of this.sessions.values()) {
      const failureKey = `${session.targetRef}|${session.reasonCode}`;
      failureCounts.set(failureKey, (failureCounts.get(failureKey) ?? 0) + 1);
    }
    const repeatFailureCount = [...failureCounts.values()].reduce(
      (sum, count) => sum + Math.max(0, count - 1),
      0,
    );

    return {
      evaluatedAt,
      openSessionCount: sessions.filter((session) =>
        session.state === "OPEN" || session.state === "LIMITED_RESTART",
      ).length,
      completedSessionCount: sessions.filter((session) => session.state === "RESTORED").length,
      expiredSessionCount: sessions.filter((session) => session.state === "EXPIRED").length,
      checkpointCount: [...this.sessions.values()].reduce(
        (sum, stored) => sum + stored.receipts.length,
        0,
      ),
      failedRestartAttemptCount: this.failedRestartAttempts,
      repeatFailureCount,
      meanTimeToRecoveryMs,
      recoveryReadySessionRefs: sessions
        .filter((session) => session.recoveryReady)
        .map((session) => session.sessionRef)
        .sort(),
      sessions,
    };
  }
}
