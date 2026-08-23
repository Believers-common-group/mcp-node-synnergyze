import { createHash } from "node:crypto";

import type { SynnergyzeExecutionReceiptV1 } from "../synnergyze/contracts.ts";
import type {
  ControlledExecutionGateV1,
  ControlledExecutionRequestV1,
} from "../synnergyze/execution-gate.ts";
import type {
  AuthorizedProviderExecutionV1,
  ProviderAttemptEvidenceV1,
  ProviderAttemptResultV1,
  ProviderAuthorityGateInputV1,
  ProviderCompensationLineageV1,
  ProviderExceptionV1,
  ProviderFailureKindV1,
  ProviderRecoveryActionV1,
} from "./contracts.ts";

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

function stableRefs(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))].sort();
}

function sameRefs(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(stableRefs(left)) === JSON.stringify(stableRefs(right));
}

function providerConstraint(providerRef: string): string {
  return `provider:${providerRef}`;
}

export function authorizeProviderExecutionV1(
  input: ProviderAuthorityGateInputV1,
): AuthorizedProviderExecutionV1 {
  const {
    grant,
    binding,
    request,
    action,
    reservation,
    decision,
    checkpoint,
    authorizedAt,
  } = input;

  if (decision.decision !== "ALLOW") {
    throw new Error("provider_authority_warden_allow_required");
  }
  if (!decision.actionToken) throw new Error("provider_authority_action_token_required");
  if (!decision.validUntil) throw new Error("provider_authority_decision_validity_required");
  if (checkpoint.state !== "VALID") {
    throw new Error(`provider_authority_checkpoint_${checkpoint.state.toLowerCase()}`);
  }

  if (decision.requestRef !== action.requestRef) {
    throw new Error("provider_authority_action_request_mismatch");
  }
  if (decision.action !== action.action) {
    throw new Error("provider_authority_action_mismatch");
  }
  if (decision.targetRef !== action.targetRef) {
    throw new Error("provider_authority_action_target_mismatch");
  }
  if (decision.decisionRef !== action.wardenDecisionRef) {
    throw new Error("provider_authority_action_decision_mismatch");
  }
  if (decision.actionToken !== action.actionToken) {
    throw new Error("provider_authority_action_token_mismatch");
  }
  if (decision.correlationId !== action.correlationId) {
    throw new Error("provider_authority_action_correlation_mismatch");
  }

  if (reservation.state !== "RESERVED") {
    throw new Error("provider_authority_river_reservation_required");
  }
  if (reservation.actionRef !== action.actionRef) {
    throw new Error("provider_authority_reservation_action_mismatch");
  }
  if (reservation.wardenDecisionRef !== decision.decisionRef) {
    throw new Error("provider_authority_reservation_decision_mismatch");
  }
  if (reservation.correlationId !== action.correlationId) {
    throw new Error("provider_authority_reservation_correlation_mismatch");
  }
  if (reservation.authorizationDigest !== authorizationDigest(action.actionToken)) {
    throw new Error("provider_authority_reservation_authorization_mismatch");
  }

  if (grant.actionRef !== action.actionRef) {
    throw new Error("provider_authority_grant_action_mismatch");
  }
  if (grant.reservationRef !== reservation.reservationRef) {
    throw new Error("provider_authority_grant_reservation_mismatch");
  }
  if (grant.wardenDecisionRef !== decision.decisionRef) {
    throw new Error("provider_authority_decision_mismatch");
  }
  if (grant.wardenCheckpointRef !== checkpoint.checkpointRef) {
    throw new Error("provider_authority_checkpoint_mismatch");
  }
  if (checkpoint.decisionRef !== decision.decisionRef) {
    throw new Error("provider_authority_checkpoint_decision_mismatch");
  }
  if (checkpoint.wardenRef !== decision.wardenRef) {
    throw new Error("provider_authority_checkpoint_warden_mismatch");
  }

  if (
    grant.correlationId !== decision.correlationId ||
    checkpoint.correlationId !== decision.correlationId ||
    request.correlationId !== decision.correlationId
  ) {
    throw new Error("provider_authority_correlation_mismatch");
  }

  if (binding.state !== "ACTIVE") {
    throw new Error(`provider_authority_binding_${binding.state.toLowerCase()}`);
  }
  if (grant.delegatedAgentRef !== request.agentRef) {
    throw new Error("provider_authority_agent_mismatch");
  }
  if (action.actorRef !== request.agentRef || grant.delegatedAgentRef !== action.actorRef) {
    throw new Error("provider_authority_action_agent_mismatch");
  }
  if (binding.agentRef !== request.agentRef) {
    throw new Error("provider_authority_binding_agent_mismatch");
  }

  if (!decision.constraints.includes(providerConstraint(request.providerRef))) {
    throw new Error("provider_authority_provider_constraint_required");
  }
  if (grant.providerRef !== request.providerRef || binding.providerRef !== request.providerRef) {
    throw new Error("provider_authority_provider_mismatch");
  }

  if (
    grant.capabilityRef !== request.capabilityRef ||
    action.capabilityRef !== request.capabilityRef
  ) {
    throw new Error("provider_authority_capability_mismatch");
  }
  if (!action.requestedEffect) {
    throw new Error("provider_authority_action_purpose_required");
  }
  if (grant.purposeRef !== request.purposeRef || action.requestedEffect !== request.purposeRef) {
    throw new Error("provider_authority_purpose_mismatch");
  }
  if (
    !sameRefs(grant.resourceRefs, request.resourceRefs) ||
    !sameRefs(request.resourceRefs, [action.targetRef])
  ) {
    throw new Error("provider_authority_resource_mismatch");
  }

  const decided = parseInstant(decision.decidedAt, "provider_authority_invalid_decision_time");
  const expires = parseInstant(
    decision.validUntil,
    "provider_authority_invalid_decision_validity",
  );
  const reserved = parseInstant(
    reservation.reservedAt,
    "provider_authority_invalid_reservation_time",
  );
  const checked = parseInstant(checkpoint.checkedAt, "provider_authority_invalid_checkpoint_time");
  const issued = parseInstant(grant.issuedAt, "provider_authority_invalid_grant_time");
  const bound = parseInstant(binding.boundAt, "provider_authority_invalid_binding_time");
  const requested = parseInstant(request.requestedAt, "provider_authority_invalid_request_time");
  const authorized = parseInstant(authorizedAt, "provider_authority_invalid_authorization_time");

  if (expires < decided) {
    throw new Error("provider_authority_invalid_decision_validity_window");
  }
  if (checked < reserved) throw new Error("provider_authority_checkpoint_stale_before_reservation");
  if (issued < checked || issued < reserved) {
    throw new Error("provider_authority_grant_before_checkpoint");
  }
  if (
    authorized < issued ||
    authorized < bound ||
    authorized < requested ||
    authorized < checked ||
    authorized < reserved
  ) {
    throw new Error("provider_authority_authorization_before_context");
  }
  if (authorized > expires) throw new Error("provider_authority_decision_expired");

  const sourceDigest = digest(
    JSON.stringify({
      grantRef: grant.grantRef,
      actionRef: action.actionRef,
      reservationRef: reservation.reservationRef,
      bindingRef: binding.bindingRef,
      wardenDecisionRef: decision.decisionRef,
      wardenCheckpointRef: checkpoint.checkpointRef,
      authorizationDigest: reservation.authorizationDigest,
      agentRef: request.agentRef,
      providerRef: request.providerRef,
      providerPrincipalRef: binding.providerPrincipalRef,
      capabilityRef: request.capabilityRef,
      purposeRef: request.purposeRef,
      resourceRefs: stableRefs(request.resourceRefs),
      correlationId: request.correlationId,
      authorizedAt,
    }),
  );

  return {
    version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001",
    authorizationRef: `PROVIDER-AUTH:${sourceDigest.slice(0, 24)}`,
    state: "AUTHORIZED",
    grantRef: grant.grantRef,
    bindingRef: binding.bindingRef,
    actionRef: action.actionRef,
    reservationRef: reservation.reservationRef,
    wardenDecisionRef: decision.decisionRef,
    wardenCheckpointRef: checkpoint.checkpointRef,
    agentRef: request.agentRef,
    providerRef: request.providerRef,
    providerPrincipalRef: binding.providerPrincipalRef,
    capabilityRef: request.capabilityRef,
    purposeRef: request.purposeRef,
    resourceRefs: stableRefs(request.resourceRefs),
    correlationId: request.correlationId,
    authorizedAt,
    sourceDigest,
  };
}

export function executeWithProviderAuthorityV1<T>(
  input: ProviderAuthorityGateInputV1,
  execute: (authorization: AuthorizedProviderExecutionV1) => T,
): T {
  const authorization = authorizeProviderExecutionV1(input);
  return execute(authorization);
}

export class ProviderFailureErrorV1 extends Error {
  readonly kind: ProviderFailureKindV1;

  constructor(kind: ProviderFailureKindV1, message: string) {
    super(message);
    this.name = "ProviderFailureErrorV1";
    this.kind = kind;
  }
}

export function classifyProviderFailureV1(
  authorization: AuthorizedProviderExecutionV1,
  failure: ProviderFailureErrorV1,
): ProviderExceptionV1 {
  const common = {
    version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001" as const,
    exceptionRef: `PROVIDER-EXCEPTION:${digest(
      `${authorization.authorizationRef}|${failure.kind}|${failure.message}`,
    ).slice(0, 24)}`,
    authorizationRef: authorization.authorizationRef,
    actionRef: authorization.actionRef,
    reservationRef: authorization.reservationRef,
    failureKind: failure.kind,
    message: failure.message,
  };

  switch (failure.kind) {
    case "HTTP_TIMEOUT_AFTER_SEND":
      return {
        ...common,
        exceptionClass: "NETWORK_EXCEPTION",
        effectState: "UNKNOWN",
        retryability: "AFTER_RECONCILIATION",
        severity: "E2",
      };
    case "CREDENTIAL_TRANSIENT":
      return {
        ...common,
        exceptionClass: "CREDENTIAL_EXCEPTION",
        effectState: "NONE",
        retryability: "SAFE",
        severity: "E1",
      };
    case "PROVIDER_AUTH_DENIED":
      return {
        ...common,
        exceptionClass: "PROVIDER_AUTH_EXCEPTION",
        effectState: "NONE",
        retryability: "NEVER",
        severity: "E2",
      };
    case "AGENT_IDENTITY_CONTEXT_MISMATCH":
      return {
        ...common,
        exceptionClass: "IDENTITY_EXCEPTION",
        effectState: "NONE",
        retryability: "NEVER",
        severity: "E3",
      };
    case "PARTIAL_EFFECT":
      return {
        ...common,
        exceptionClass: "PARTIAL_EFFECT_EXCEPTION",
        effectState: "PARTIAL",
        retryability: "POLICY_DECISION_REQUIRED",
        severity: "E4",
      };
    case "COMPENSATION_FAILURE":
      return {
        ...common,
        exceptionClass: "COMPENSATION_EXCEPTION",
        effectState: "UNKNOWN",
        retryability: "AFTER_RECONCILIATION",
        severity: "E4",
      };
  }
}

export async function executeProviderAttemptV1<T>(
  gateInput: ProviderAuthorityGateInputV1,
  execute: (authorization: AuthorizedProviderExecutionV1) => Promise<T> | T,
): Promise<ProviderAttemptResultV1<T>> {
  const authorization = authorizeProviderExecutionV1(gateInput);
  try {
    return {
      state: "SUCCEEDED",
      authorization,
      value: await execute(authorization),
    };
  } catch (error) {
    if (!(error instanceof ProviderFailureErrorV1)) throw error;
    return {
      state: "EXCEPTION",
      authorization,
      exception: classifyProviderFailureV1(authorization, error),
    };
  }
}

export function determineProviderRecoveryV1(
  exception: ProviderExceptionV1,
): ProviderRecoveryActionV1 {
  if (exception.exceptionClass === "IDENTITY_EXCEPTION" && exception.severity === "E3") {
    return "CONTAIN";
  }
  if (exception.effectState === "UNKNOWN") return "RECONCILE_FIRST";
  if (exception.retryability === "NEVER") return "ABORT";
  if (exception.retryability === "SAFE") return "RETRY_AFTER_REAUTHORIZATION";
  return "POLICY_DECISION_REQUIRED";
}

function assertControlledExecutionLineage(
  authority: ProviderAuthorityGateInputV1,
  controlled: ControlledExecutionRequestV1,
): void {
  if (controlled.action.actionRef !== authority.action.actionRef) {
    throw new Error("provider_controlled_execution_action_mismatch");
  }
  if (controlled.reservation.reservationRef !== authority.reservation.reservationRef) {
    throw new Error("provider_controlled_execution_reservation_mismatch");
  }
  if (controlled.decision.decisionRef !== authority.decision.decisionRef) {
    throw new Error("provider_controlled_execution_decision_mismatch");
  }
  if (controlled.checkpoint.checkpointRef !== authority.checkpoint.checkpointRef) {
    throw new Error("provider_controlled_execution_checkpoint_mismatch");
  }
  if (controlled.executedAt !== authority.authorizedAt) {
    throw new Error("provider_controlled_execution_time_mismatch");
  }
}

export function executeProviderControlledExecutionV1(
  gate: ControlledExecutionGateV1,
  input: {
    providerAuthority: ProviderAuthorityGateInputV1;
    controlledExecution: ControlledExecutionRequestV1;
  },
): {
  authorization: AuthorizedProviderExecutionV1;
  receipt: SynnergyzeExecutionReceiptV1;
} {
  assertControlledExecutionLineage(input.providerAuthority, input.controlledExecution);
  const authorization = authorizeProviderExecutionV1(input.providerAuthority);
  const receipt = gate.execute(input.controlledExecution);

  if (
    receipt.actionRef !== authorization.actionRef ||
    receipt.reservationRef !== authorization.reservationRef ||
    receipt.wardenDecisionRef !== authorization.wardenDecisionRef ||
    receipt.checkpointRef !== authorization.wardenCheckpointRef
  ) {
    throw new Error("provider_controlled_execution_receipt_lineage_mismatch");
  }

  return { authorization, receipt };
}

export function hashProviderPayloadV1(payload: string): string {
  return `sha256:${digest(payload)}`;
}

export function verifyProviderAttemptEvidenceV1(
  evidence: ProviderAttemptEvidenceV1,
  requestPayload: string,
  responsePayload?: string,
): true {
  if (evidence.requestHash !== hashProviderPayloadV1(requestPayload)) {
    throw new Error("evidence_integrity_failure");
  }
  if (evidence.responseHash !== undefined) {
    if (
      responsePayload === undefined ||
      evidence.responseHash !== hashProviderPayloadV1(responsePayload)
    ) {
      throw new Error("evidence_integrity_failure");
    }
  } else if (responsePayload !== undefined) {
    throw new Error("evidence_integrity_failure");
  }
  return true;
}

export function createCompensationLineageV1(
  input: ProviderCompensationLineageV1,
): ProviderCompensationLineageV1 {
  if (input.originalActionRef === input.compensationActionRef) {
    throw new Error("provider_compensation_distinct_action_required");
  }
  if (!input.originalExecutionReceiptRef.trim()) {
    throw new Error("provider_compensation_original_receipt_required");
  }
  return { ...input };
}

export function classifyCompensationFailureV1(input: {
  compensationAuthorization: AuthorizedProviderExecutionV1;
  lineage: ProviderCompensationLineageV1;
  originalException: ProviderExceptionV1;
  failure: ProviderFailureErrorV1;
}): ProviderExceptionV1 {
  if (input.failure.kind !== "COMPENSATION_FAILURE") {
    throw new Error("provider_compensation_failure_kind_required");
  }
  if (input.compensationAuthorization.actionRef !== input.lineage.compensationActionRef) {
    throw new Error("provider_compensation_action_lineage_mismatch");
  }
  if (
    input.originalException.executionReceiptRef !== input.lineage.originalExecutionReceiptRef
  ) {
    throw new Error("provider_compensation_receipt_lineage_mismatch");
  }

  const exception = classifyProviderFailureV1(input.compensationAuthorization, input.failure);
  return {
    ...exception,
    parentExceptionRef: input.originalException.exceptionRef,
    originatingExecutionReceiptRef: input.lineage.originalExecutionReceiptRef,
  };
}
