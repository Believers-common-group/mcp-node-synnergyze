import { realityAdmissionRequestHashV1 } from "./canonical.ts";
import type {
  ComputeGovernanceLevelV1,
  ComputeGovernanceProfileV1,
  R0_1RealityMaturityV1,
  RealityAdmissionDecisionV1,
  RealityAdmissionPolicyV1,
  RealityAdmissionReasonCodeV1,
  RealityAdmissionRequestV1,
  SimulationEffectFlagsV1,
} from "./contracts.ts";

const NO_EFFECTS: SimulationEffectFlagsV1 = {
  mayCreateAuthority: false,
  mayCreateQualification: false,
  mayCreateObligation: false,
  mayCreatePayment: false,
  mayTriggerExecution: false,
};

const R0_1_MATURITIES = new Set<R0_1RealityMaturityV1>([
  "M0_MODELLED",
  "M1_SYNTHETIC",
  "M2_REPLAYED",
  "M3_SHADOW",
]);

const COMPUTE_RANK: Readonly<Record<ComputeGovernanceLevelV1, number>> = {
  CG0_EXPERIMENTAL: 0,
  CG1_REPRODUCIBLE: 1,
  CG2_EVIDENCE_BOUND: 2,
  CG3_POLICY_GOVERNED: 3,
  CG4_INDEPENDENTLY_VERIFIABLE: 4,
  CG5_CONTROLLED_LIVE: 5,
  CG6_ECONOMIC_COMPUTATION: 6,
  CG7_SETTLEMENT_GRADE: 7,
};

function hasProhibitedEffect(flags: RealityAdmissionRequestV1["effectFlags"]): boolean {
  return Object.values(flags).some((value) => value !== false);
}

function expectedEnvelopeHash(request: RealityAdmissionRequestV1): string {
  const { envelopeHash: _envelopeHash, ...body } = request;
  return realityAdmissionRequestHashV1(body);
}

function decision(
  request: RealityAdmissionRequestV1,
  profile: ComputeGovernanceProfileV1,
  reasonCodes: readonly RealityAdmissionReasonCodeV1[],
): RealityAdmissionDecisionV1 {
  return {
    admitted: reasonCodes.length === 0,
    reasonCodes,
    fromMaturity: request.fromMaturity,
    requestedMaturity: request.requestedMaturity,
    computeGovernanceLevel: profile.level,
    envelopeHash: request.envelopeHash,
    effectFlags: NO_EFFECTS,
  };
}

export function evaluateRealityAdmissionV1(
  request: RealityAdmissionRequestV1,
  profile: ComputeGovernanceProfileV1,
  policy: RealityAdmissionPolicyV1,
): RealityAdmissionDecisionV1 {
  if (hasProhibitedEffect(request.effectFlags)) {
    return decision(request, profile, ["REALITY_PROMOTION_NOT_PERMITTED"]);
  }

  if (!R0_1_MATURITIES.has(request.requestedMaturity as R0_1RealityMaturityV1)) {
    return decision(request, profile, ["REALITY_PROMOTION_REQUIRES_FUTURE_AUTHORITY"]);
  }

  if (request.envelopeHash !== expectedEnvelopeHash(request)) {
    return decision(request, profile, ["SIMULATION_INPUT_DRIFT"]);
  }

  const maturity = request.requestedMaturity as R0_1RealityMaturityV1;
  const requiredCompute = policy.minimumComputeGovernance[maturity];
  if (COMPUTE_RANK[profile.level] < COMPUTE_RANK[requiredCompute]) {
    return decision(request, profile, ["COMPUTE_GOVERNANCE_INSUFFICIENT"]);
  }

  return decision(request, profile, []);
}
