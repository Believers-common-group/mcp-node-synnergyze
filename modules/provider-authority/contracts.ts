import type { WardenDecisionV1, WardenExecutionCheckpointV1 } from "../warden/contracts.ts";

export type ProviderAuthorityBridgeVersionV1 = "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001";

export interface ProviderAuthorityGrantV1 {
  version: ProviderAuthorityBridgeVersionV1;
  grantRef: string;
  wardenDecisionRef: string;
  wardenCheckpointRef: string;
  delegatedAgentRef: string;
  providerRef: string;
  capabilityRef: string;
  purposeRef: string;
  resourceRefs: readonly string[];
  correlationId: string;
  issuedAt: string;
}

export interface ProviderPrincipalBindingV1 {
  version: ProviderAuthorityBridgeVersionV1;
  bindingRef: string;
  agentRef: string;
  providerRef: string;
  providerPrincipalRef: string;
  state: "ACTIVE" | "SUSPENDED" | "REVOKED";
  boundAt: string;
}

export interface ProviderExecutionRequestV1 {
  agentRef: string;
  providerRef: string;
  capabilityRef: string;
  purposeRef: string;
  resourceRefs: readonly string[];
  requestedAt: string;
  correlationId: string;
}

export interface ProviderAuthorityGateInputV1 {
  grant: ProviderAuthorityGrantV1;
  binding: ProviderPrincipalBindingV1;
  request: ProviderExecutionRequestV1;
  decision: WardenDecisionV1;
  checkpoint: WardenExecutionCheckpointV1;
  authorizedAt: string;
}

export interface AuthorizedProviderExecutionV1 {
  version: ProviderAuthorityBridgeVersionV1;
  authorizationRef: string;
  state: "AUTHORIZED";
  grantRef: string;
  bindingRef: string;
  wardenDecisionRef: string;
  wardenCheckpointRef: string;
  agentRef: string;
  providerRef: string;
  providerPrincipalRef: string;
  capabilityRef: string;
  purposeRef: string;
  resourceRefs: readonly string[];
  correlationId: string;
  authorizedAt: string;
  sourceDigest: string;
}

export type ProviderEffectStateV1 = "NONE" | "PARTIAL" | "COMPLETED" | "FAILED" | "UNKNOWN";

export type ProviderRetryabilityV1 =
  | "NEVER"
  | "SAFE"
  | "AFTER_RECONCILIATION"
  | "POLICY_DECISION_REQUIRED";

export type ProviderExceptionClassV1 =
  | "IDENTITY_EXCEPTION"
  | "CREDENTIAL_EXCEPTION"
  | "PROVIDER_AUTH_EXCEPTION"
  | "NETWORK_EXCEPTION"
  | "EXECUTION_EXCEPTION"
  | "PARTIAL_EFFECT_EXCEPTION"
  | "COMPENSATION_EXCEPTION";

export type ProviderExceptionSeverityV1 = "E1" | "E2" | "E3" | "E4" | "E5";

export type ProviderFailureKindV1 =
  | "HTTP_TIMEOUT_AFTER_SEND"
  | "CREDENTIAL_TRANSIENT"
  | "PROVIDER_AUTH_DENIED"
  | "AGENT_IDENTITY_CONTEXT_MISMATCH"
  | "PARTIAL_EFFECT"
  | "COMPENSATION_FAILURE";

export interface ProviderExceptionV1 {
  version: ProviderAuthorityBridgeVersionV1;
  exceptionRef: string;
  authorizationRef: string;
  exceptionClass: ProviderExceptionClassV1;
  effectState: ProviderEffectStateV1;
  retryability: ProviderRetryabilityV1;
  severity: ProviderExceptionSeverityV1;
  failureKind: ProviderFailureKindV1;
  message: string;
  executionRef?: string;
  parentExceptionRef?: string;
  originatingExecutionRef?: string;
}

export type ProviderAttemptResultV1<T> =
  | { state: "SUCCEEDED"; authorizationRef: string; value: T }
  | { state: "EXCEPTION"; authorizationRef: string; exception: ProviderExceptionV1 };

export type ProviderRecoveryActionV1 =
  | "RETRY"
  | "RECONCILE_FIRST"
  | "ABORT"
  | "CONTAIN"
  | "POLICY_DECISION_REQUIRED";

export interface ProviderExecutionIntentV1 {
  effectKey: string;
  requestDigest: string;
}

export interface ProviderExecutionRecordV1 {
  version: ProviderAuthorityBridgeVersionV1;
  executionRef: string;
  effectKey: string;
  governedIntentDigest: string;
  firstAuthorizationRef: string;
  requestDigest: string;
  agentRef: string;
  providerRef: string;
  providerPrincipalRef: string;
  capabilityRef: string;
  purposeRef: string;
  resourceRefs: readonly string[];
  correlationId: string;
}

export interface ProviderExecutionResolutionV1 {
  execution: ProviderExecutionRecordV1;
  idempotentReplay: boolean;
}

export interface ProviderAttemptEvidenceV1 {
  attemptRef: string;
  executionRef: string;
  authorizationRef: string;
  requestHash: string;
  responseHash?: string;
  capturedAt: string;
}

export interface ProviderCompensationLineageV1 {
  compensationPlanRef: string;
  originalExecutionRef: string;
  compensationExecutionRef: string;
  originalExceptionRef: string;
}
