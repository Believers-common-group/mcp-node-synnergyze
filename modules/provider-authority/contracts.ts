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
