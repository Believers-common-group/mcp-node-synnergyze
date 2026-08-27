import { describe, expect, it } from "vitest";

import type {
  ComputeGovernanceProfileV1,
  RealityAdmissionPolicyV1,
  RealityAdmissionRequestV1,
  SimulationEffectFlagsV1,
} from "./contracts.ts";
import { realityAdmissionRequestHashV1 } from "./canonical.ts";
import { evaluateRealityAdmissionV1 } from "./reality-gate.ts";

const NO_EFFECTS: SimulationEffectFlagsV1 = {
  mayCreateAuthority: false,
  mayCreateQualification: false,
  mayCreateObligation: false,
  mayCreatePayment: false,
  mayTriggerExecution: false,
};

function profile(level: ComputeGovernanceProfileV1["level"]): ComputeGovernanceProfileV1 {
  return {
    profileRef: `COMPUTE-GOVERNANCE:${level}`,
    level,
    policyRef: "COMPUTE-GOVERNANCE-POLICY:R0.1",
    evidenceRefs: ["RIVER:EVIDENCE:CG:001"],
    validFrom: "2026-08-28T00:00:00.000Z",
    validUntil: "2027-08-28T00:00:00.000Z",
    sourceDigest: `sha256:${level.toLowerCase()}`,
  };
}

const policy: RealityAdmissionPolicyV1 = {
  policyRef: "REALITY-ADMISSION-POLICY:R0.1",
  version: "VSR-SIMULATION-TO-REALITY-FABRIC-001-R0.1",
  active: true,
  maximumAdmittedMaturity: "M3_SHADOW",
  minimumComputeGovernance: {
    M0_MODELLED: "CG0_EXPERIMENTAL",
    M1_SYNTHETIC: "CG1_REPRODUCIBLE",
    M2_REPLAYED: "CG2_EVIDENCE_BOUND",
    M3_SHADOW: "CG2_EVIDENCE_BOUND",
  },
  sourceDigest: "sha256:reality-admission-policy-r0.1",
};

function request(
  requestedMaturity: RealityAdmissionRequestV1["requestedMaturity"],
  computeGovernanceProfileRef: string,
): RealityAdmissionRequestV1 {
  const body: Omit<RealityAdmissionRequestV1, "envelopeHash"> = {
    admissionRequestRef: `REALITY-ADMISSION:${requestedMaturity}`,
    objectType: "QUALIFICATION_SIMULATION",
    objectRef: "SIMULATION-SCENARIO:001",
    fromMaturity: "M0_MODELLED",
    requestedMaturity,
    qualificationSchemeRevisionRefs: ["QUALIFICATION-SCHEME-REVISION:001"],
    computeGovernanceProfileRef,
    evidenceSnapshotRef: "SIMULATION-SNAPSHOT:EVIDENCE:001",
    legalPolicyRefs: ["LEGAL-POLICY:SIMULATION-ONLY:001"],
    privacyPolicyRefs: ["PRIVACY-POLICY:SIMULATION-ONLY:001"],
    authoritySnapshotRef: "AUTHORITY-SNAPSHOT:SIMULATION:001",
    riskSnapshotRef: "RISK-SNAPSHOT:SIMULATION:001",
    submittedAt: "2026-08-28T00:00:00.000Z",
    effectFlags: NO_EFFECTS,
  };
  return { ...body, envelopeHash: realityAdmissionRequestHashV1(body) };
}

describe("VSR-SIMULATION-TO-REALITY-FABRIC-001 R0.1 reality admission", () => {
  it("requires CG1 for M1 synthetic admission", () => {
    const cg0 = profile("CG0_EXPERIMENTAL");
    const cg1 = profile("CG1_REPRODUCIBLE");

    expect(evaluateRealityAdmissionV1(request("M1_SYNTHETIC", cg0.profileRef), cg0, policy)).toMatchObject({
      admitted: false,
      reasonCodes: ["COMPUTE_GOVERNANCE_INSUFFICIENT"],
    });
    expect(evaluateRealityAdmissionV1(request("M1_SYNTHETIC", cg1.profileRef), cg1, policy)).toMatchObject({
      admitted: true,
      reasonCodes: [],
    });
  });

  it("requires CG2 for replay and shadow admission", () => {
    const cg1 = profile("CG1_REPRODUCIBLE");
    const cg2 = profile("CG2_EVIDENCE_BOUND");

    for (const maturity of ["M2_REPLAYED", "M3_SHADOW"] as const) {
      expect(evaluateRealityAdmissionV1(request(maturity, cg1.profileRef), cg1, policy).reasonCodes)
        .toContain("COMPUTE_GOVERNANCE_INSUFFICIENT");
      expect(evaluateRealityAdmissionV1(request(maturity, cg2.profileRef), cg2, policy).admitted).toBe(true);
    }
  });

  it("blocks every M4+ promotion in R0.1 even with stronger compute governance", () => {
    const cg7 = profile("CG7_SETTLEMENT_GRADE");
    for (const maturity of [
      "M4_ADVISORY",
      "M5_GOVERNED_PILOT",
      "M6_VERIFIED_LIVE",
      "M7_ECONOMICALLY_ADMISSIBLE",
      "M8_SILK_ACTIVE",
    ] as const) {
      expect(evaluateRealityAdmissionV1(request(maturity, cg7.profileRef), cg7, policy)).toMatchObject({
        admitted: false,
        reasonCodes: ["REALITY_PROMOTION_REQUIRES_FUTURE_AUTHORITY"],
      });
    }
  });

  it("detects material admission-envelope drift before admission", () => {
    const cg2 = profile("CG2_EVIDENCE_BOUND");
    const original = request("M2_REPLAYED", cg2.profileRef);
    const drifted: RealityAdmissionRequestV1 = {
      ...original,
      evidenceSnapshotRef: "SIMULATION-SNAPSHOT:EVIDENCE:CHANGED",
    };

    expect(evaluateRealityAdmissionV1(drifted, cg2, policy)).toMatchObject({
      admitted: false,
      reasonCodes: ["SIMULATION_INPUT_DRIFT"],
    });
  });

  it("rejects any R0.1 request that attempts a live or economic effect", () => {
    const cg2 = profile("CG2_EVIDENCE_BOUND");
    const original = request("M3_SHADOW", cg2.profileRef);
    const invalid = {
      ...original,
      effectFlags: { ...NO_EFFECTS, mayTriggerExecution: true },
    } as unknown as RealityAdmissionRequestV1;

    expect(evaluateRealityAdmissionV1(invalid, cg2, policy)).toMatchObject({
      admitted: false,
      reasonCodes: ["REALITY_PROMOTION_NOT_PERMITTED"],
    });
  });
});
