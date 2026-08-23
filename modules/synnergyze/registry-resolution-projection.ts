export type RegistryProjectionAssuranceV1 = "A1" | "A2" | "A3" | "A4";

export interface RegistryExceptionResolutionRevisionV1 {
  version: "REGISTRY-EXCEPTION-RESOLUTION-REVISION-001";
  projectionRef: string;
  registryObjectRef: string;
  registryRevisionRef: string;
  predecessorRegistryRevisionRef?: string;
  originalExceptionRef: string;
  assessmentRef: string;
  disposition: "SUPERSEDED_BY_VERIFIED_RECOVERY" | "SUPERSEDED_BY_VERIFIED_COMPENSATION";
  remedyEffectRef: string;
  remedyVerificationRef: string;
  riverRemedySealRef: string;
  riverPublicationRef: string;
  riverTraceDigest: string;
  attestationRef: string;
  attestorRef: string;
  assurance: RegistryProjectionAssuranceV1;
  projectionPolicyRef: string;
  eligibleAt: string;
  registryWriteEligible: true;
  state: "ELIGIBLE_FOR_REGISTRY_WRITE";
  synthetic: false;
}

export interface RegistryResolutionReadModelV1 {
  version: "GENESIS-REGISTRY-RESOLUTION-READ-MODEL-001";
  registryObjectRef: string;
  currentRegistryRevisionRef: string;
  originalExceptionRef: string;
  disposition: RegistryExceptionResolutionRevisionV1["disposition"];
  remedyEffectRef: string;
  remedyVerificationRef: string;
  riverRemedySealRef: string;
  riverPublicationRef: string;
  riverTraceDigest: string;
  attestationRef: string;
  assurance: RegistryProjectionAssuranceV1;
  projectionPolicyRef: string;
  projectedAt: string;
  sourceRevisionRef: string;
  state: "PROJECTED_FROM_APPEND_ONLY_REGISTRY_REVISION";
}

export interface RegistryProjectionOutboxEventV1 {
  eventRef: string;
  registryRevisionRef: string;
  registryObjectRef: string;
  eventType: "WARDEN_EXCEPTION_RESOLUTION_PROJECTED";
  riverPublicationRef: string;
  attestationRef: string;
  attemptCount: number;
}
