export type BnrServiceState = "REQUIRED" | "OPTIONAL" | "DISABLED";

export type BnrPartnerLifecycleV1 =
  | "PROPOSED_PARTNER"
  | "ENGAGEMENT"
  | "CONTRACTED"
  | "AUTHORITY_EVIDENCED"
  | "TECHNICALLY_READY"
  | "RETIRED";

export type BnrActivationStateV1 = "INACTIVE" | "ELIGIBLE" | "ACTIVE" | "SUSPENDED";
export type BnrCommercialStateV1 = "UNRESOLVED" | "EVIDENCED";
export type BnrRuntimeReadinessV1 = "BLOCKED" | "READY";
export type BnrAuthorityStateV1 = "EXTERNAL_UNRESOLVED" | "EXTERNAL_EVIDENCED";
export type BnrEvidenceStateV1 = "UNRESOLVED" | "READY";

export interface BnrServiceBindingV1 {
  networkObject: string;
  serviceRef: string;
  version: string;
  state: BnrServiceState;
}

export interface BnrNodeManifestV1 {
  nodeRef: string;
  nodeClass: "ALPHA_REFERENCE" | "BNR";
  registryRef: string;
  serviceBindings: readonly BnrServiceBindingV1[];
  policySetRef: string;
  releaseRef: string;
}

export interface BnrPartnerNodeManifestV1 extends BnrNodeManifestV1 {
  nodeClass: "BNR";
  partnerRef: string;
  partnerLifecycle: BnrPartnerLifecycleV1;
  activationState: BnrActivationStateV1;
  authorityEvidenceRefs: readonly string[];
  commercialEvidenceRefs: readonly string[];
  technicalEvidenceRefs: readonly string[];
  activationEvidenceRefs: readonly string[];
}

export interface BnrResolvedCompositionV1 {
  nodeRef: string;
  registryRef: string;
  resolvedServiceRefs: readonly string[];
  unresolvedRequiredObjects: readonly string[];
  compositionDigest: string;
}

export interface BnrActivationInputsV1 {
  nodeRef: string;
  partnerLifecycle: BnrPartnerLifecycleV1;
  runtimeReadiness: BnrRuntimeReadinessV1;
  authorityState: BnrAuthorityStateV1;
  evidenceState: BnrEvidenceStateV1;
  commercialState: BnrCommercialStateV1;
  requiredServicesResolved: boolean;
  wardenPolicyActive: boolean;
  riverOperational: boolean;
  registryDurable: boolean;
  activationEvidenceValid: boolean;
  suspended: boolean;
  readinessCheckedAt: string;
}

/** Legacy readiness shape retained for existing callers. */
export interface BnrReadinessStateV1 {
  nodeRef: string;
  runtimeReadiness: BnrRuntimeReadinessV1;
  authorityState: BnrAuthorityStateV1;
  evidenceState: BnrEvidenceStateV1;
  blockers: readonly string[];
  readinessCheckedAt: string;
}

/** Partner-aware readiness used by external BNR partner nodes. */
export interface BnrPartnerReadinessStateV1 extends BnrReadinessStateV1 {
  partnerLifecycle: BnrPartnerLifecycleV1;
  commercialState: BnrCommercialStateV1;
  activationState: BnrActivationStateV1;
}
