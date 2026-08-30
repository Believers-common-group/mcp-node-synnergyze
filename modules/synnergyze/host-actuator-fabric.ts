import { createHash } from "node:crypto";

import type { ContainmentAdmissionVerifierPortV1 } from "./containment-admission-envelope.ts";
import type { ControlLeaseVerifierPortV1 } from "./control-epoch-lease.ts";
import type {
  MaintenanceActuationCommandV1,
  MaintenanceActuationExecutionReceiptV1,
  MaintenanceActuationObservationV1,
  MaintenanceActuatorActionV1,
  MaintenanceActuatorPortV1,
} from "./maintenance-actuation.ts";

export type HostResourceKindV1 =
  | "PROCESS"
  | "SERVICE"
  | "CONTAINER"
  | "WSL_DISTRIBUTION"
  | "NETWORK_ZONE"
  | "CREDENTIAL_SESSION";

export type HostOperationV1 =
  | "STOP"
  | "START"
  | "RESTRICT"
  | "RESTORE"
  | "ISOLATE"
  | "REVOKE";

export interface HostResourceBindingV1 {
  bindingRef: string;
  targetRef: string;
  resourceKind: HostResourceKindV1;
  providerRef: string;
  resourceRef: string;
  allowedOperations: readonly HostOperationV1[];
}

export interface HostOperationRequestV1 {
  targetRef: string;
  operation: HostOperationV1;
  expectedStateRef: string;
  authorityRef: string;
  requestedAt: string;
  executedAt?: string;
  controlLeaseRef?: string;
  containmentAdmissionTokenRef?: string;
}

export interface HostActuationExecutionReceiptV1 {
  executionReceiptRef: string;
  bindingRef: string;
  providerRef: string;
  resourceKind: HostResourceKindV1;
  resourceRef: string;
  targetRef: string;
  operation: HostOperationV1;
  expectedStateRef: string;
  authorityRef: string;
  requestedAt: string;
  executedAt: string;
  controlLeaseRef?: string;
  controlEpoch?: number;
  containmentEvaluationRef?: string;
  containmentAdmissionTokenRef?: string;
  containmentAdmissionEnvelopeRef?: string;
  synthetic: boolean;
}

export interface HostActuationObservationV1 {
  observationRef: string;
  executionReceiptRef: string;
  bindingRef: string;
  providerRef: string;
  resourceRef: string;
  targetRef: string;
  operation: HostOperationV1;
  observedStateRef: string;
  observedAt: string;
  sourceEvidenceRef: string;
  synthetic: boolean;
}

export interface HostResourceAdapterPortV1 {
  readonly providerRef: string;
  execute(
    binding: HostResourceBindingV1,
    request: HostOperationRequestV1,
    executedAt: string,
  ): HostActuationExecutionReceiptV1;
  observe(
    receipt: HostActuationExecutionReceiptV1,
    observedAt: string,
  ): HostActuationObservationV1;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requireText(value: string, errorCode: string): void {
  if (!value.trim()) throw new Error(errorCode);
}

function parseInstant(value: string, errorCode: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(errorCode);
  return parsed;
}

function operationForMaintenanceAction(action: MaintenanceActuatorActionV1): HostOperationV1 {
  switch (action) {
    case "STOP":
      return "STOP";
    case "LIMITED_RESTART":
      return "RESTRICT";
    case "RESTORE":
      return "RESTORE";
  }
}

function cloneBinding(binding: HostResourceBindingV1): HostResourceBindingV1 {
  return { ...binding, allowedOperations: [...binding.allowedOperations] };
}

export class InMemoryHostResourceAdapterV1 implements HostResourceAdapterPortV1 {
  private invocations = 0;
  private readonly observedStates = new Map<string, string>();

  constructor(readonly providerRef: string) {
    requireText(providerRef, "host_provider_ref_required");
  }

  setObservedState(resourceRef: string, operation: HostOperationV1, observedStateRef: string): void {
    requireText(resourceRef, "host_resource_ref_required");
    requireText(observedStateRef, "host_observed_state_required");
    this.observedStates.set(`${resourceRef}|${operation}`, observedStateRef);
  }

  execute(
    binding: HostResourceBindingV1,
    request: HostOperationRequestV1,
    executedAt: string,
  ): HostActuationExecutionReceiptV1 {
    if (binding.providerRef !== this.providerRef) throw new Error("host_provider_binding_mismatch");
    parseInstant(request.requestedAt, "host_invalid_request_time");
    parseInstant(executedAt, "host_invalid_execution_time");
    if (Date.parse(executedAt) < Date.parse(request.requestedAt)) {
      throw new Error("host_execution_before_request");
    }
    this.invocations += 1;
    const executionReceiptRef = `HOST-ACTUATION-RECEIPT:${digest(
      JSON.stringify({
        bindingRef: binding.bindingRef,
        providerRef: this.providerRef,
        resourceRef: binding.resourceRef,
        targetRef: request.targetRef,
        operation: request.operation,
        expectedStateRef: request.expectedStateRef,
        authorityRef: request.authorityRef,
        requestedAt: request.requestedAt,
        executedAt,
        controlLeaseRef: request.controlLeaseRef ?? null,
        containmentAdmissionTokenRef: request.containmentAdmissionTokenRef ?? null,
      }),
    ).slice(0, 24)}`;
    return {
      executionReceiptRef,
      bindingRef: binding.bindingRef,
      providerRef: this.providerRef,
      resourceKind: binding.resourceKind,
      resourceRef: binding.resourceRef,
      targetRef: request.targetRef,
      operation: request.operation,
      expectedStateRef: request.expectedStateRef,
      authorityRef: request.authorityRef,
      requestedAt: request.requestedAt,
      executedAt,
      controlLeaseRef: request.controlLeaseRef,
      containmentAdmissionTokenRef: request.containmentAdmissionTokenRef,
      synthetic: true,
    };
  }

  observe(
    receipt: HostActuationExecutionReceiptV1,
    observedAt: string,
  ): HostActuationObservationV1 {
    if (receipt.providerRef !== this.providerRef) throw new Error("host_provider_receipt_mismatch");
    const executed = parseInstant(receipt.executedAt, "host_invalid_execution_time");
    const observed = parseInstant(observedAt, "host_invalid_observation_time");
    if (observed < executed) throw new Error("host_observation_before_execution");
    const observedStateRef =
      this.observedStates.get(`${receipt.resourceRef}|${receipt.operation}`) ??
      receipt.expectedStateRef;
    const sourceEvidenceRef = `RIVER-EVIDENCE:HOST-ACTUATION:${digest(
      `${receipt.executionReceiptRef}|${observedStateRef}|${observedAt}`,
    ).slice(0, 24)}`;
    const observationRef = `HOST-ACTUATION-OBSERVATION:${digest(
      `${receipt.executionReceiptRef}|${sourceEvidenceRef}|${observedStateRef}|${observedAt}`,
    ).slice(0, 24)}`;
    return {
      observationRef,
      executionReceiptRef: receipt.executionReceiptRef,
      bindingRef: receipt.bindingRef,
      providerRef: receipt.providerRef,
      resourceRef: receipt.resourceRef,
      targetRef: receipt.targetRef,
      operation: receipt.operation,
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

export class HostActuatorFabricV1 {
  private readonly bindingsByTarget = new Map<string, HostResourceBindingV1>();
  private readonly bindingRefs = new Set<string>();
  private readonly adaptersByProvider = new Map<string, HostResourceAdapterPortV1>();
  private readonly maintenanceExecutions = new Map<string, HostActuationExecutionReceiptV1>();

  constructor(
    bindings: readonly HostResourceBindingV1[],
    adapters: readonly HostResourceAdapterPortV1[],
    private readonly controlLeaseVerifier?: ControlLeaseVerifierPortV1,
    private readonly containmentAdmissionVerifier?: ContainmentAdmissionVerifierPortV1,
  ) {
    for (const adapter of adapters) {
      requireText(adapter.providerRef, "host_provider_ref_required");
      if (this.adaptersByProvider.has(adapter.providerRef)) throw new Error("host_duplicate_provider");
      this.adaptersByProvider.set(adapter.providerRef, adapter);
    }
    for (const binding of bindings) {
      requireText(binding.bindingRef, "host_binding_ref_required");
      requireText(binding.targetRef, "host_target_ref_required");
      requireText(binding.providerRef, "host_provider_ref_required");
      requireText(binding.resourceRef, "host_resource_ref_required");
      if (!binding.allowedOperations.length) throw new Error("host_allowed_operations_required");
      if (new Set(binding.allowedOperations).size !== binding.allowedOperations.length) {
        throw new Error("host_duplicate_allowed_operation");
      }
      if (this.bindingRefs.has(binding.bindingRef)) throw new Error("host_duplicate_binding_ref");
      if (this.bindingsByTarget.has(binding.targetRef)) throw new Error("host_duplicate_target_binding");
      this.bindingRefs.add(binding.bindingRef);
      this.bindingsByTarget.set(binding.targetRef, cloneBinding(binding));
    }
  }

  binding(targetRef: string): HostResourceBindingV1 | undefined {
    const binding = this.bindingsByTarget.get(targetRef);
    return binding ? cloneBinding(binding) : undefined;
  }

  executeHostOperation(input: HostOperationRequestV1): HostActuationExecutionReceiptV1 {
    const binding = this.bindingsByTarget.get(input.targetRef);
    if (!binding) throw new Error("host_target_not_bound");
    if (!binding.allowedOperations.includes(input.operation)) {
      throw new Error("host_operation_not_allowed");
    }
    const adapter = this.adaptersByProvider.get(binding.providerRef);
    if (!adapter) throw new Error("host_provider_not_registered");
    requireText(input.expectedStateRef, "host_expected_state_required");
    requireText(input.authorityRef, "host_authority_ref_required");
    const executedAt = input.executedAt ?? input.requestedAt;

    let controlEpoch: number | undefined;
    let containmentEvaluationRef: string | undefined;
    if (this.controlLeaseVerifier) {
      if (!input.controlLeaseRef?.trim()) throw new Error("control_lease_required");
      const verification = this.controlLeaseVerifier.verifyLease({
        leaseRef: input.controlLeaseRef,
        targetRef: input.targetRef,
        authorityRef: input.authorityRef,
        evaluatedAt: executedAt,
      });
      controlEpoch = verification.controlEpoch;
      containmentEvaluationRef = verification.containmentEvaluationRef;
    }

    let containmentAdmissionEnvelopeRef: string | undefined;
    if (this.containmentAdmissionVerifier) {
      if (!input.containmentAdmissionTokenRef?.trim()) {
        throw new Error("containment_admission_token_required");
      }
      const verification = this.containmentAdmissionVerifier.verifyAndConsume({
        tokenRef: input.containmentAdmissionTokenRef,
        executionTargetRef: input.targetRef,
        expectedStateRef: input.expectedStateRef,
        authorityRef: input.authorityRef,
        evaluatedAt: executedAt,
      });
      containmentAdmissionEnvelopeRef = verification.envelopeRef;
    }

    const receipt = adapter.execute(cloneBinding(binding), input, executedAt);
    return {
      ...receipt,
      controlLeaseRef: input.controlLeaseRef,
      controlEpoch,
      containmentEvaluationRef,
      containmentAdmissionTokenRef: input.containmentAdmissionTokenRef,
      containmentAdmissionEnvelopeRef,
    };
  }

  observeHostOperation(
    receipt: HostActuationExecutionReceiptV1,
    observedAt: string,
  ): HostActuationObservationV1 {
    const adapter = this.adaptersByProvider.get(receipt.providerRef);
    if (!adapter) throw new Error("host_provider_not_registered");
    return adapter.observe(receipt, observedAt);
  }

  maintenanceActuator(): MaintenanceActuatorPortV1 {
    const execute = (
      command: MaintenanceActuationCommandV1,
      executedAt: string,
    ): MaintenanceActuationExecutionReceiptV1 => {
      const hostReceipt = this.executeHostOperation({
        targetRef: command.targetRef,
        operation: operationForMaintenanceAction(command.action),
        expectedStateRef: command.expectedStateRef,
        authorityRef: command.authorityRef,
        requestedAt: command.requestedAt,
        executedAt,
        controlLeaseRef: command.controlLeaseRef,
        containmentAdmissionTokenRef: command.containmentAdmissionTokenRef,
      });
      this.maintenanceExecutions.set(hostReceipt.executionReceiptRef, hostReceipt);
      return {
        executionReceiptRef: hostReceipt.executionReceiptRef,
        commandRef: command.commandRef,
        actuatorRef: "HOST-ACTUATOR-FABRIC-001",
        sessionRef: command.sessionRef,
        targetRef: command.targetRef,
        action: command.action,
        executedAt: hostReceipt.executedAt,
        controlLeaseRef: hostReceipt.controlLeaseRef,
        controlEpoch: hostReceipt.controlEpoch,
        containmentEvaluationRef: hostReceipt.containmentEvaluationRef,
        containmentAdmissionTokenRef: hostReceipt.containmentAdmissionTokenRef,
        containmentAdmissionEnvelopeRef: hostReceipt.containmentAdmissionEnvelopeRef,
        synthetic: hostReceipt.synthetic,
      };
    };

    const observe = (
      command: MaintenanceActuationCommandV1,
      receipt: MaintenanceActuationExecutionReceiptV1,
      observedAt: string,
    ): MaintenanceActuationObservationV1 => {
      if (receipt.commandRef !== command.commandRef) {
        throw new Error("maintenance_actuation_command_receipt_mismatch");
      }
      const hostReceipt = this.maintenanceExecutions.get(receipt.executionReceiptRef);
      if (!hostReceipt) throw new Error("host_maintenance_execution_not_found");
      const hostObservation = this.observeHostOperation(hostReceipt, observedAt);
      return {
        observationRef: hostObservation.observationRef,
        executionReceiptRef: receipt.executionReceiptRef,
        targetRef: receipt.targetRef,
        action: receipt.action,
        observedStateRef: hostObservation.observedStateRef,
        observedAt: hostObservation.observedAt,
        sourceEvidenceRef: hostObservation.sourceEvidenceRef,
        synthetic: hostObservation.synthetic,
      };
    };

    return {
      actuatorRef: "HOST-ACTUATOR-FABRIC-001",
      execute,
      observe,
    };
  }
}
