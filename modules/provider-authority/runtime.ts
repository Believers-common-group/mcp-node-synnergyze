import { createHash } from "node:crypto";

import type {
  AuthorizedProviderExecutionV1,
  ProviderAuthorityGateInputV1,
} from "./contracts.ts";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
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

export function authorizeProviderExecutionV1(
  input: ProviderAuthorityGateInputV1,
): AuthorizedProviderExecutionV1 {
  const { grant, binding, request, decision, checkpoint, authorizedAt } = input;

  if (decision.decision !== "ALLOW") {
    throw new Error("provider_authority_warden_allow_required");
  }
  if (!decision.actionToken) throw new Error("provider_authority_action_token_required");
  if (!decision.validUntil) throw new Error("provider_authority_decision_validity_required");
  if (checkpoint.state !== "VALID") {
    throw new Error(`provider_authority_checkpoint_${checkpoint.state.toLowerCase()}`);
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
  if (binding.agentRef !== request.agentRef) {
    throw new Error("provider_authority_binding_agent_mismatch");
  }
  if (grant.providerRef !== request.providerRef || binding.providerRef !== request.providerRef) {
    throw new Error("provider_authority_provider_mismatch");
  }
  if (grant.capabilityRef !== request.capabilityRef) {
    throw new Error("provider_authority_capability_mismatch");
  }
  if (grant.purposeRef !== request.purposeRef) {
    throw new Error("provider_authority_purpose_mismatch");
  }
  if (!sameRefs(grant.resourceRefs, request.resourceRefs)) {
    throw new Error("provider_authority_resource_mismatch");
  }

  const decided = parseInstant(decision.decidedAt, "provider_authority_invalid_decision_time");
  const expires = parseInstant(
    decision.validUntil,
    "provider_authority_invalid_decision_validity",
  );
  const checked = parseInstant(checkpoint.checkedAt, "provider_authority_invalid_checkpoint_time");
  const issued = parseInstant(grant.issuedAt, "provider_authority_invalid_grant_time");
  const bound = parseInstant(binding.boundAt, "provider_authority_invalid_binding_time");
  const requested = parseInstant(request.requestedAt, "provider_authority_invalid_request_time");
  const authorized = parseInstant(authorizedAt, "provider_authority_invalid_authorization_time");

  if (expires < decided) {
    throw new Error("provider_authority_invalid_decision_validity_window");
  }
  if (checked < decided) throw new Error("provider_authority_checkpoint_before_decision");
  if (issued < checked) throw new Error("provider_authority_grant_before_checkpoint");
  if (authorized < issued || authorized < bound || authorized < requested) {
    throw new Error("provider_authority_authorization_before_context");
  }
  if (authorized > expires) throw new Error("provider_authority_decision_expired");

  const sourceDigest = digest(
    JSON.stringify({
      grantRef: grant.grantRef,
      bindingRef: binding.bindingRef,
      wardenDecisionRef: decision.decisionRef,
      wardenCheckpointRef: checkpoint.checkpointRef,
      actionTokenDigest: `sha256:${digest(decision.actionToken)}`,
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
