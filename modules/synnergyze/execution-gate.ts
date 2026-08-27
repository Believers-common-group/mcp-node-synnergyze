import { createHash } from "node:crypto";

import type { ActionEnvelopeV1, EvidenceReservationV1 } from "../river/contracts.ts";
import type {
  WardenDecisionV1,
  WardenExecutionCheckpointV1,
} from "../warden/contracts.ts";
import {
  InMemoryContainmentControlPlaneV1,
  type ContainmentControlPlaneV1,
  type ContainmentMaintenanceSnapshotV1,
} from "./containment-control.ts";
import type {
  ResolvedDeviceSecurityContextV1,
  SynnergyzeExecutionReceiptV1,
} from "./contracts.ts";

export interface ControlledExecutionRequestV1 {
  action: ActionEnvelopeV1;
  reservation: EvidenceReservationV1;
  decision: WardenDecisionV1;
  checkpoint: WardenExecutionCheckpointV1;
  executionDeviceSecurity?: ResolvedDeviceSecurityContextV1;
  executedAt: string;
}

export interface SyntheticCapabilityAdapterInputV1 {
  action: ActionEnvelopeV1;
  reservation: EvidenceReservationV1;
  executedAt: string;
}

export interface SyntheticCapabilityAdapterResultV1 {
  adapterResultRef: string;
}

export interface SyntheticCapabilityAdapterV1 {
  readonly adapterRef: string;
  readonly capabilityRef: string;
  execute(input: SyntheticCapabilityAdapterInputV1): SyntheticCapabilityAdapterResultV1;
}

export interface ControlledExecutionMaintenanceSnapshotV1 {
  registeredCapabilities: readonly string[];
  executionCount: number;
  containment: ContainmentMaintenanceSnapshotV1;
}

interface StoredExecution {
  fingerprint: string;
  receipt: SynnergyzeExecutionReceiptV1;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function authorizationDigest(actionToken: string): string {
  return `sha256:${digest(actionToken)}`;
}

function parseInstant(value: string, errorCode: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(errorCode);
  return parsed;
}

function assertDecision(action: ActionEnvelopeV1, decision: WardenDecisionV1, executedAt: string): void {
  if (decision.decision !== "ALLOW") throw new Error("execution_warden_allow_required");
  if (!decision.actionToken) throw new Error("execution_warden_action_token_required");
  if (!decision.validUntil) throw new Error("execution_warden_validity_required");
  if (decision.decisionRef !== action.wardenDecisionRef) {
    throw new Error("execution_warden_decision_mismatch");
  }
  if (decision.requestRef !== action.requestRef) throw new Error("execution_request_mismatch");
  if (decision.action !== action.action) throw new Error("execution_action_mismatch");
  if (decision.targetRef !== action.targetRef) throw new Error("execution_target_mismatch");
  if (decision.correlationId !== action.correlationId) throw new Error("execution_correlation_mismatch");
  if (decision.actionToken !== action.actionToken) throw new Error("execution_action_token_mismatch");

  const decided = parseInstant(decision.decidedAt, "execution_invalid_decision_time");
  const expires = parseInstant(decision.validUntil, "execution_invalid_decision_validity");
  const executed = parseInstant(executedAt, "execution_invalid_execution_time");
  if (expires < decided) throw new Error("execution_invalid_decision_validity_window");
  if (executed < decided) throw new Error("execution_before_decision");
  if (executed > expires) throw new Error("execution_warden_decision_expired");
}

function assertReservation(action: ActionEnvelopeV1, reservation: EvidenceReservationV1): void {
  if (reservation.state !== "RESERVED") throw new Error("execution_river_reservation_required");
  if (reservation.actionRef !== action.actionRef) throw new Error("execution_reservation_action_mismatch");
  if (reservation.wardenDecisionRef !== action.wardenDecisionRef) {
    throw new Error("execution_reservation_decision_mismatch");
  }
  if (reservation.correlationId !== action.correlationId) {
    throw new Error("execution_reservation_correlation_mismatch");
  }
  if (reservation.authorizationDigest !== authorizationDigest(action.actionToken)) {
    throw new Error("execution_reservation_authorization_mismatch");
  }
}

function assertCheckpoint(
  action: ActionEnvelopeV1,
  reservation: EvidenceReservationV1,
  decision: WardenDecisionV1,
  checkpoint: WardenExecutionCheckpointV1,
  executedAt: string,
): void {
  if (checkpoint.state !== "VALID") {
    throw new Error(`execution_warden_checkpoint_${checkpoint.state.toLowerCase()}`);
  }
  if (checkpoint.decisionRef !== decision.decisionRef) {
    throw new Error("execution_checkpoint_decision_mismatch");
  }
  if (checkpoint.wardenRef !== decision.wardenRef) {
    throw new Error("execution_checkpoint_warden_mismatch");
  }
  if (checkpoint.correlationId !== action.correlationId) {
    throw new Error("execution_checkpoint_correlation_mismatch");
  }

  const reserved = parseInstant(reservation.reservedAt, "execution_invalid_reservation_time");
  const checked = parseInstant(checkpoint.checkedAt, "execution_invalid_checkpoint_time");
  const executed = parseInstant(executedAt, "execution_invalid_execution_time");
  if (checked < reserved) throw new Error("execution_checkpoint_stale_before_reservation");
  if (checked > executed) throw new Error("execution_checkpoint_from_future");
}

function assertDeviceSecurity(
  action: ActionEnvelopeV1,
  security: ResolvedDeviceSecurityContextV1 | undefined,
  executedAt: string,
): void {
  if (!action.executionDeviceRef) {
    if (security) throw new Error("execution_device_security_unexpected");
    return;
  }

  if (!action.deviceSecurityRequestDigest) {
    throw new Error("execution_device_security_request_binding_required");
  }
  if (!security) throw new Error("execution_device_security_required");
  if (security.deviceRef !== action.executionDeviceRef) {
    throw new Error("execution_device_security_context_mismatch");
  }
  if (security.state !== "ACTIVE") {
    throw new Error(`execution_device_security_state_${security.state.toLowerCase()}`);
  }
  if (!security.resolutionRef || !security.evidenceRef) {
    throw new Error("execution_device_security_evidence_required");
  }
  if (action.deviceSecurityPolicyRef && security.policyRef !== action.deviceSecurityPolicyRef) {
    throw new Error("execution_device_security_policy_mismatch");
  }

  const resolved = parseInstant(security.resolvedAt, "execution_invalid_device_security_time");
  const executed = parseInstant(executedAt, "execution_invalid_execution_time");
  if (resolved > executed) throw new Error("execution_device_security_from_future");
  if (security.validUntil) {
    const validUntil = parseInstant(
      security.validUntil,
      "execution_invalid_device_security_validity",
    );
    if (executed > validUntil) throw new Error("execution_device_security_expired");
  }
}

function executionFingerprint(
  input: ControlledExecutionRequestV1,
  adapterRef: string,
  containmentEvaluationRef: string,
): string {
  return digest(
    JSON.stringify({
      actionRef: input.action.actionRef,
      reservationRef: input.reservation.reservationRef,
      wardenDecisionRef: input.decision.decisionRef,
      checkpointRef: input.checkpoint.checkpointRef,
      authorizationDigest: input.reservation.authorizationDigest,
      capabilityRef: input.action.capabilityRef,
      targetRef: input.action.targetRef,
      correlationId: input.action.correlationId,
      executionDeviceRef: input.action.executionDeviceRef ?? null,
      deviceSecurityRequestDigest: input.action.deviceSecurityRequestDigest ?? null,
      executionDeviceSecurity: input.executionDeviceSecurity
        ? {
            resolutionRef: input.executionDeviceSecurity.resolutionRef,
            deviceRef: input.executionDeviceSecurity.deviceRef,
            state: input.executionDeviceSecurity.state,
            policyRef: input.executionDeviceSecurity.policyRef ?? null,
            evidenceRef: input.executionDeviceSecurity.evidenceRef,
            assuranceLevel: input.executionDeviceSecurity.assuranceLevel ?? null,
            resolvedAt: input.executionDeviceSecurity.resolvedAt,
            validUntil: input.executionDeviceSecurity.validUntil ?? null,
          }
        : null,
      containmentEvaluationRef,
      adapterRef,
      executedAt: input.executedAt,
    }),
  );
}

export class SyntheticServiceRequestCreateAdapterV1 implements SyntheticCapabilityAdapterV1 {
  readonly adapterRef = "SYNTHETIC-SERVICE-REQUEST-ADAPTER-001";
  readonly capabilityRef = "service_request.create";
  private invocations = 0;

  execute(input: SyntheticCapabilityAdapterInputV1): SyntheticCapabilityAdapterResultV1 {
    if (input.action.capabilityRef !== this.capabilityRef) {
      throw new Error("synthetic_adapter_capability_mismatch");
    }
    this.invocations += 1;
    const identity = digest(
      [
        input.action.actionRef,
        input.reservation.reservationRef,
        input.action.targetRef,
        input.action.correlationId,
      ].join("|"),
    ).slice(0, 24);
    return { adapterResultRef: `SYNTHETIC-SERVICE-REQUEST:${identity}` };
  }

  invocationCount(): number {
    return this.invocations;
  }
}

export class ControlledExecutionGateV1 {
  private readonly adapters: ReadonlyMap<string, SyntheticCapabilityAdapterV1>;
  private readonly containment: ContainmentControlPlaneV1;
  private readonly byActionRef = new Map<string, StoredExecution>();
  private readonly actionRefByCorrelation = new Map<string, string>();

  constructor(
    adapters: readonly SyntheticCapabilityAdapterV1[],
    containment: ContainmentControlPlaneV1 = new InMemoryContainmentControlPlaneV1(),
  ) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.capabilityRef, adapter]));
    this.containment = containment;
  }

  execute(input: ControlledExecutionRequestV1): SynnergyzeExecutionReceiptV1 {
    assertDecision(input.action, input.decision, input.executedAt);
    assertReservation(input.action, input.reservation);
    assertCheckpoint(
      input.action,
      input.reservation,
      input.decision,
      input.checkpoint,
      input.executedAt,
    );
    assertDeviceSecurity(input.action, input.executionDeviceSecurity, input.executedAt);

    const adapter = this.adapters.get(input.action.capabilityRef);
    if (!adapter) throw new Error(`execution_capability_not_registered:${input.action.capabilityRef}`);

    const containment = this.containment.evaluate({
      targetRef: input.action.targetRef,
      capabilityRef: input.action.capabilityRef,
      programRef: input.action.programRef,
      evaluatedAt: input.executedAt,
    });
    if (containment.decision !== "ALLOW") {
      throw new Error(`execution_containment_${containment.state.toLowerCase()}`);
    }

    const fingerprint = executionFingerprint(input, adapter.adapterRef, containment.evaluationRef);
    const existing = this.byActionRef.get(input.action.actionRef);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new Error("execution_idempotency_conflict");
      return { ...existing.receipt, idempotentReplay: true };
    }

    const correlatedAction = this.actionRefByCorrelation.get(input.action.correlationId);
    if (correlatedAction && correlatedAction !== input.action.actionRef) {
      throw new Error("execution_correlation_conflict");
    }

    const adapterResult = adapter.execute({
      action: input.action,
      reservation: input.reservation,
      executedAt: input.executedAt,
    });
    const receiptIdentity = digest(
      [
        input.action.actionRef,
        input.reservation.reservationRef,
        input.decision.decisionRef,
        input.checkpoint.checkpointRef,
        input.executionDeviceSecurity?.resolutionRef ?? "NO-DEVICE-SECURITY",
        input.executionDeviceSecurity?.evidenceRef ?? "NO-DEVICE-EVIDENCE",
        containment.evaluationRef,
        adapter.adapterRef,
        adapterResult.adapterResultRef,
      ].join("|"),
    ).slice(0, 24);
    const receipt: SynnergyzeExecutionReceiptV1 = {
      receiptRef: `SYNNERGYZE-EXECUTION-RECEIPT:${receiptIdentity}`,
      actionRef: input.action.actionRef,
      reservationRef: input.reservation.reservationRef,
      wardenDecisionRef: input.decision.decisionRef,
      checkpointRef: input.checkpoint.checkpointRef,
      programRef: input.action.programRef,
      eventRef: input.action.eventRef,
      capabilityRef: input.action.capabilityRef,
      targetRef: input.action.targetRef,
      correlationId: input.action.correlationId,
      adapterRef: adapter.adapterRef,
      adapterResultRef: adapterResult.adapterResultRef,
      executionDeviceRef: input.action.executionDeviceRef,
      deviceSecurityResolutionRef: input.executionDeviceSecurity?.resolutionRef,
      deviceSecurityEvidenceRef: input.executionDeviceSecurity?.evidenceRef,
      deviceSecurityPolicyRef: input.executionDeviceSecurity?.policyRef,
      deviceSecurityAssuranceLevel: input.executionDeviceSecurity?.assuranceLevel,
      containmentEvaluationRef: containment.evaluationRef,
      containmentState: containment.state,
      state: "EXECUTED_UNVERIFIED",
      executedAt: input.executedAt,
      synthetic: true,
      idempotentReplay: false,
    };

    this.byActionRef.set(input.action.actionRef, { fingerprint, receipt });
    this.actionRefByCorrelation.set(input.action.correlationId, input.action.actionRef);
    return { ...receipt };
  }

  executionCount(): number {
    return this.byActionRef.size;
  }

  receipts(): readonly SynnergyzeExecutionReceiptV1[] {
    return [...this.byActionRef.values()].map(({ receipt }) => ({ ...receipt }));
  }

  maintenanceSnapshot(evaluatedAt: string): ControlledExecutionMaintenanceSnapshotV1 {
    return {
      registeredCapabilities: [...this.adapters.keys()].sort(),
      executionCount: this.executionCount(),
      containment: this.containment.maintenanceSnapshot(evaluatedAt),
    };
  }
}
