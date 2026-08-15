export type BnrServiceState = "REQUIRED" | "OPTIONAL" | "DISABLED";

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

export interface BnrResolvedCompositionV1 {
  nodeRef: string;
  registryRef: string;
  resolvedServiceRefs: readonly string[];
  unresolvedRequiredObjects: readonly string[];
  compositionDigest: string;
}

export interface BnrReadinessStateV1 {
  nodeRef: string;
  runtimeReadiness: "BLOCKED" | "READY";
  authorityState: "EXTERNAL_UNRESOLVED" | "EXTERNAL_EVIDENCED";
  evidenceState: "UNRESOLVED" | "READY";
  blockers: readonly string[];
  readinessCheckedAt: string;
}
