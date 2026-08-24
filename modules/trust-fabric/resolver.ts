import type { WardenTrustResolutionV1 } from "../warden/contracts.ts";

export type AssuranceLevelV1 = 0 | 1 | 2 | 3 | 4 | 5;

export interface AssuranceVectorV1 {
  identity: AssuranceLevelV1;
  authority: AssuranceLevelV1;
  compute: AssuranceLevelV1;
  evidence: AssuranceLevelV1;
}

export interface TrustResolutionRequestV1 {
  resolutionRef: string;
  actionRef: string;
  intendedEffect: {
    type: string;
    irreversible: boolean;
  };
  requiredAssurance: AssuranceVectorV1;
  observedAssurance: AssuranceVectorV1;
  materialConflict: boolean;
}

export function resolveTrustV1(request: TrustResolutionRequestV1): WardenTrustResolutionV1 {
  if (request.materialConflict) {
    return {
      resolutionRef: request.resolutionRef,
      result: "CONFLICTED",
      material: true,
      irreversibleEffect: request.intendedEffect.irreversible,
      reasonCodes: ["material_trust_conflict"],
    };
  }

  if (request.observedAssurance.identity < request.requiredAssurance.identity) {
    return {
      resolutionRef: request.resolutionRef,
      result: "REQUIRES_STEP_UP",
      material: true,
      irreversibleEffect: request.intendedEffect.irreversible,
      reasonCodes: ["insufficient_identity_assurance"],
    };
  }

  if (request.observedAssurance.authority < request.requiredAssurance.authority) {
    return {
      resolutionRef: request.resolutionRef,
      result: "REQUIRES_STEP_UP",
      material: true,
      irreversibleEffect: request.intendedEffect.irreversible,
      reasonCodes: ["insufficient_authority_assurance"],
    };
  }

  if (request.observedAssurance.compute < request.requiredAssurance.compute) {
    return {
      resolutionRef: request.resolutionRef,
      result: "HOLD",
      material: true,
      irreversibleEffect: request.intendedEffect.irreversible,
      reasonCodes: ["insufficient_compute_assurance"],
    };
  }

  return {
    resolutionRef: request.resolutionRef,
    result: "SATISFIED",
    material: false,
    irreversibleEffect: request.intendedEffect.irreversible,
    reasonCodes: [],
  };
}
