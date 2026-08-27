import type { WardenTrustResolutionV1 } from "../warden/contracts.ts";

export type AssuranceLevelV1 = 0 | 1 | 2 | 3 | 4 | 5;

export interface AssuranceVectorV1 {
  identity: AssuranceLevelV1;
  authority: AssuranceLevelV1;
  compute: AssuranceLevelV1;
  evidence: AssuranceLevelV1;
}

export type AssuranceDomainV1 = keyof AssuranceVectorV1;
export type AssuranceAgeVectorV1 = Partial<Record<AssuranceDomainV1, number>>;

export interface TrustResolutionRequestV1 {
  resolutionRef: string;
  actionRef: string;
  intendedEffect: {
    type: string;
    irreversible: boolean;
  };
  requiredAssurance: AssuranceVectorV1;
  observedAssurance: AssuranceVectorV1;
  requiredMaxAgeSeconds?: AssuranceAgeVectorV1;
  observedAgeSeconds?: AssuranceAgeVectorV1;
  materialConflict: boolean;
}

function stepUp(
  request: TrustResolutionRequestV1,
  reasonCode: string,
): WardenTrustResolutionV1 {
  return {
    resolutionRef: request.resolutionRef,
    result: "REQUIRES_STEP_UP",
    material: true,
    irreversibleEffect: request.intendedEffect.irreversible,
    reasonCodes: [reasonCode],
  };
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
    return stepUp(request, "insufficient_identity_assurance");
  }

  if (request.observedAssurance.authority < request.requiredAssurance.authority) {
    return stepUp(request, "insufficient_authority_assurance");
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

  if (request.observedAssurance.evidence < request.requiredAssurance.evidence) {
    return stepUp(request, "insufficient_evidence_assurance");
  }

  const assuranceDomains: readonly AssuranceDomainV1[] = [
    "identity",
    "authority",
    "compute",
    "evidence",
  ];
  for (const domain of assuranceDomains) {
    const maximumAge = request.requiredMaxAgeSeconds?.[domain];
    if (maximumAge === undefined) continue;
    const observedAge = request.observedAgeSeconds?.[domain];
    if (observedAge === undefined || observedAge > maximumAge) {
      return stepUp(request, `stale_${domain}_assurance`);
    }
  }

  return {
    resolutionRef: request.resolutionRef,
    result: "SATISFIED",
    material: false,
    irreversibleEffect: request.intendedEffect.irreversible,
    reasonCodes: [],
  };
}
