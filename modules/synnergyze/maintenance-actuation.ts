import { createHash } from "node:crypto";

import type {
  InMemoryMaintenanceControlPlaneV1,
  MaintenanceCheckpointReceiptV1,
  MaintenanceSessionV1,
} from "./maintenance-control.ts";

export type MaintenanceActuatedCheckpointV1 =
  | "STOP_VERIFIED"
  | "LIMITED_RESTART"
  | "RESTORED";

export type MaintenanceActuatorActionV1 = "STOP" | "LIMITED_RESTART" | "RESTORE";

export interface MaintenanceActuationRequestV1 {
  sessionRef: string;
  checkpoint: MaintenanceActuatedCheckpointV1;
  authorityRef: string;
  requestedAt: string;
  executedAt: string;
  observedAt: string;
  verifiedAt: string;
  controlLeaseRef?: string;
}

export interface MaintenanceActuationCommandV1 {
  commandRef: string;
  sessionRef: string;
  targetRef: string;
  programRef: string;
  action: MaintenanceActuatorActionV1;
  checkpoint: MaintenanceActuatedCheckpointV1;
  authorityRef: string;
  expectedStateRef: string;
  requestedAt: string;
  controlLeaseRef?: string;
}

export interface MaintenanceActuationExecutionReceiptV1 {
  executionReceiptRef: string;
  commandRef: string;
  actuatorRef: string;
  sessionRef: string;
  targetRef: string;
  action: MaintenanceActuatorActionV1;
  executedAt: string;
  controlLeaseRef?: string;
  controlEpoch?: number;
  containmentEvaluationRef?: string;
  synthetic: boolean;
}

export interface MaintenanceActuationObservationV1 {
  observationRef: string;
  executionReceiptRef: string;
  targetRef: string;
  action: MaintenanceActuatorActionV1;
  observedStateRef: string;
  observedAt: string;
  sourceEvidenceRef: string;
  synthetic: boolean;
}

export interface MaintenanceActuatorPortV1 {
  readonly actuatorRef: string;
  execute(
    command: MaintenanceActuationCommandV1,
    executedAt: string,
  ): MaintenanceActuationExecutionReceiptV1;
  observe(
    command: MaintenanceActuationCommandV1,
    receipt: MaintenanceActuationExecutionReceiptV1,
    observedAt: string,
  ): MaintenanceActuationObservationV1;
}

export interface MaintenanceEffectVerificationV1 {
  effectVerificationRef: string;
  executionReceiptRef: string;
  observationRef: string;
  targetRef: string;
  expectedStateRef: string;
  observedStateRef: string;
  verifiedAt: string;
}

export interface MaintenanceCheckpointRecordedV1 {
  state: "CHECKPOINT_RECORDED";
  commandRef: string;
  executionReceiptRef: string;
  observationRef: string;
  effectVerificationRef: string;
  checkpointReceipt: MaintenanceCheckpointReceiptV1;
}

export interface MaintenanceAuthorityDeniedV1 {
  state: "AUTHORITY_DENIED";
  sessionRef: string;
  checkpoint: MaintenanceActuatedCheckpointV1;
  requiredAuthorityRef: string;
}

export interface MaintenanceCheckpointNotReadyV1 {
  state: "CHECKPOINT_NOT_READY";
  sessionRef: string;
  checkpoint: MaintenanceActuatedCheckpointV1;
  currentCheckpoint: string | null;
}

export interface MaintenanceEffectNotVerifiedV1 {
  state: "EFFECT_NOT_VERIFIED";
  commandRef: string;
  executionReceiptRef: string;
  observationRef: string;
  expectedStateRef: string;
  observedStateRef: string;
}

export type MaintenanceActuationResultV1 =
  | MaintenanceCheckpointRecordedV1
  | MaintenanceAuthorityDeniedV1
  | MaintenanceCheckpointNotReadyV1
  | MaintenanceEffectNotVerifiedV1;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseInstant(value: string, errorCode: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(errorCode);
  return parsed;
}

function actionFor(checkpoint: MaintenanceActuatedCheckpointV1): MaintenanceActuatorActionV1 {
  switch (checkpoint) {
    case "STOP_VERIFIED":
      return "STOP";
    case "LIMITED_RESTART":
      return "LIMITED_RESTART";
    case "RESTORED":
      return "RESTORE";
  }
}

function expectedStateFor(
  checkpoint: MaintenanceActuatedCheckpointV1,
  session: MaintenanceSessionV1,
): string {
  switch (checkpoint) {
    case "STOP_VERIFIED":
      return session.requiredIsolationState;
    case "LIMITED_RESTART":
      return "RESTRICTED";
    case "RESTORED":
      return "ACTIVE";
  }
}

function requiredAuthorityFor(
  checkpoint: MaintenanceActuatedCheckpointV1,
  session: MaintenanceSessionV1,
): string {
  return checkpoint === "STOP_VERIFIED"
    ? session.maintenanceAuthorityRef
    : session.restartAuthorityRef;
}

function checkpointReady(
  checkpoint: MaintenanceActuatedCheckpointV1,
  session: MaintenanceSessionV1,
): boolean {
  switch (checkpoint) {
    case "STOP_VERIFIED":
      return session.currentCheckpoint === null;
    case "LIMITED_RESTART":
      return session.currentCheckpoint === "RESTART_AUTHORIZED";
    case "RESTORED":
      return session.currentCheckpoint === "POST_RESTART_OBSERVED";
  }
}

export class SyntheticMaintenanceActuatorV1 implements MaintenanceActuatorPortV1 {
  readonly actuatorRef = "SYNTHETIC-MAINTENANCE-ACTUATOR-001";
  private invocations = 0;
  private readonly observedEffects = new Map<MaintenanceActuatorActionV1, string>();

  setObservedEffect(action: MaintenanceActuatorActionV1, observedStateRef: string): void {
    if (!observedStateRef.trim()) throw new Error("maintenance_actuator_observed_state_required");
    this.observedEffects.set(action, observedStateRef);
  }

  execute(
    command: MaintenanceActuationCommandV1,
    executedAt: string,
  ): MaintenanceActuationExecutionReceiptV1 {
    parseInstant(executedAt, "maintenance_actuation_invalid_execution_time");
    this.invocations += 1;
    const executionReceiptRef = `MAINTENANCE-ACTUATION-RECEIPT:${digest(
      `${command.commandRef}|${this.actuatorRef}|${executedAt}|${command.controlLeaseRef ?? "NO_LEASE"}`,
    ).slice(0, 24)}`;
    return {
      executionReceiptRef,
      commandRef: command.commandRef,
      actuatorRef: this.actuatorRef,
      sessionRef: command.sessionRef,
      targetRef: command.targetRef,
      action: command.action,
      executedAt,
      controlLeaseRef: command.controlLeaseRef,
      synthetic: true,
    };
  }

  observe(
    command: MaintenanceActuationCommandV1,
    receipt: MaintenanceActuationExecutionReceiptV1,
    observedAt: string,
  ): MaintenanceActuationObservationV1 {
    parseInstant(observedAt, "maintenance_actuation_invalid_observation_time");
    if (receipt.commandRef !== command.commandRef) {
      throw new Error("maintenance_actuation_command_receipt_mismatch");
    }
    const observedStateRef =
      this.observedEffects.get(command.action) ?? command.expectedStateRef;
    const sourceEvidenceRef = `RIVER-EVIDENCE:MAINTENANCE-ACTUATION:${digest(
      `${receipt.executionReceiptRef}|${observedStateRef}|${observedAt}`,
    ).slice(0, 24)}`;
    const observationRef = `MAINTENANCE-ACTUATION-OBSERVATION:${digest(
      `${receipt.executionReceiptRef}|${observedStateRef}|${sourceEvidenceRef}|${observedAt}`,
    ).slice(0, 24)}`;
    return {
      observationRef,
      executionReceiptRef: receipt.executionReceiptRef,
      targetRef: receipt.targetRef,
      action: receipt.action,
      observedStateRef,
      observedAt,
      sourceEvidenceRef,
      synthetic: true,
    };
  }

  invocationCount(): number {
    return this.invocations;
  }
}

export class MaintenanceActuationCoordinatorV1 {
  constructor(
    private readonly maintenance: InMemoryMaintenanceControlPlaneV1,
    private readonly actuator: MaintenanceActuatorPortV1,
  ) {}

  executeCheckpoint(input: MaintenanceActuationRequestV1): MaintenanceActuationResultV1 {
    const session = this.maintenance.session(input.sessionRef);
    if (!session) throw new Error("maintenance_session_not_found");

    const requiredAuthorityRef = requiredAuthorityFor(input.checkpoint, session);
    if (input.authorityRef !== requiredAuthorityRef) {
      return {
        state: "AUTHORITY_DENIED",
        sessionRef: input.sessionRef,
        checkpoint: input.checkpoint,
        requiredAuthorityRef,
      };
    }
    if (!checkpointReady(input.checkpoint, session)) {
      return {
        state: "CHECKPOINT_NOT_READY",
        sessionRef: input.sessionRef,
        checkpoint: input.checkpoint,
        currentCheckpoint: session.currentCheckpoint,
      };
    }

    const requested = parseInstant(input.requestedAt, "maintenance_actuation_invalid_request_time");
    const executed = parseInstant(input.executedAt, "maintenance_actuation_invalid_execution_time");
    const observed = parseInstant(input.observedAt, "maintenance_actuation_invalid_observation_time");
    const verified = parseInstant(input.verifiedAt, "maintenance_actuation_invalid_verification_time");
    if (executed < requested) throw new Error("maintenance_actuation_execution_before_request");
    if (observed < executed) throw new Error("maintenance_actuation_observation_before_execution");
    if (verified < observed) throw new Error("maintenance_actuation_verification_before_observation");

    const action = actionFor(input.checkpoint);
    const expectedStateRef = expectedStateFor(input.checkpoint, session);
    const commandRef = `WARDEN-MAINTENANCE-COMMAND:${digest(
      JSON.stringify({
        sessionRef: input.sessionRef,
        targetRef: session.targetRef,
        programRef: session.programRef,
        action,
        checkpoint: input.checkpoint,
        authorityRef: input.authorityRef,
        expectedStateRef,
        requestedAt: input.requestedAt,
        controlLeaseRef: input.controlLeaseRef ?? null,
      }),
    ).slice(0, 24)}`;
    const command: MaintenanceActuationCommandV1 = {
      commandRef,
      sessionRef: input.sessionRef,
      targetRef: session.targetRef,
      programRef: session.programRef,
      action,
      checkpoint: input.checkpoint,
      authorityRef: input.authorityRef,
      expectedStateRef,
      requestedAt: input.requestedAt,
      controlLeaseRef: input.controlLeaseRef,
    };

    const execution = this.actuator.execute(command, input.executedAt);
    const observation = this.actuator.observe(command, execution, input.observedAt);
    if (observation.observedStateRef !== expectedStateRef) {
      return {
        state: "EFFECT_NOT_VERIFIED",
        commandRef,
        executionReceiptRef: execution.executionReceiptRef,
        observationRef: observation.observationRef,
        expectedStateRef,
        observedStateRef: observation.observedStateRef,
      };
    }

    const effectVerificationRef = `MAINTENANCE-EFFECT-VERIFICATION:${digest(
      `${execution.executionReceiptRef}|${observation.observationRef}|${expectedStateRef}|${input.verifiedAt}`,
    ).slice(0, 24)}`;
    const verification: MaintenanceEffectVerificationV1 = {
      effectVerificationRef,
      executionReceiptRef: execution.executionReceiptRef,
      observationRef: observation.observationRef,
      targetRef: session.targetRef,
      expectedStateRef,
      observedStateRef: observation.observedStateRef,
      verifiedAt: input.verifiedAt,
    };
    if (verification.observedStateRef !== verification.expectedStateRef) {
      throw new Error("maintenance_effect_verification_state_mismatch");
    }

    const evidenceRefs = [
      commandRef,
      execution.executionReceiptRef,
      observation.observationRef,
      observation.sourceEvidenceRef,
      effectVerificationRef,
    ];
    if (execution.controlLeaseRef) evidenceRefs.push(execution.controlLeaseRef);
    if (execution.containmentEvaluationRef) evidenceRefs.push(execution.containmentEvaluationRef);

    const checkpointReceipt = this.maintenance.recordCheckpoint({
      sessionRef: input.sessionRef,
      checkpoint: input.checkpoint,
      authorityRef: input.authorityRef,
      recordedAt: input.verifiedAt,
      evidenceRefs,
    });

    return {
      state: "CHECKPOINT_RECORDED",
      commandRef,
      executionReceiptRef: execution.executionReceiptRef,
      observationRef: observation.observationRef,
      effectVerificationRef,
      checkpointReceipt,
    };
  }
}
