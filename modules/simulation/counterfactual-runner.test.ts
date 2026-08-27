import { describe, expect, it } from "vitest";

import { canonicalSha256V1 } from "./canonical.ts";
import type {
  ComputeGovernanceProfileV1,
  RealityAdmissionPolicyV1,
  SimulationScenarioV1,
  SimulationSnapshotV1,
} from "./contracts.ts";
import { runCounterfactualBranchV1 } from "./counterfactual-runner.ts";

const cg2: ComputeGovernanceProfileV1 = {
  profileRef: "COMPUTE-GOVERNANCE:CG2",
  level: "CG2_EVIDENCE_BOUND",
  policyRef: "COMPUTE-GOVERNANCE-POLICY:R0.1",
  evidenceRefs: ["RIVER:EVIDENCE:CG:002"],
  validFrom: "2026-08-28T00:00:00.000Z",
  validUntil: "2027-08-28T00:00:00.000Z",
  sourceDigest: "sha256:cg2",
};

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
  sourceDigest: "sha256:policy",
};

const payload = { observedQualification: "L2_VERIFIED", evidenceCount: 7 };
const sourceSnapshot: SimulationSnapshotV1 = {
  snapshotRef: "SIMULATION-SNAPSHOT:HISTORICAL-002",
  hash: canonicalSha256V1(payload),
  payload,
};

const scenario: SimulationScenarioV1 = {
  scenarioRef: "SIMULATION-SCENARIO:COUNTERFACTUAL-001",
  mode: "COUNTERFACTUAL",
  sourceRealityRef: "RIVER:OBSERVED-REALITY:002",
  populationSnapshotRef: sourceSnapshot.snapshotRef,
  policyRevisionRefs: ["POLICY:QUALIFICATION:R0.1"],
  qualificationSchemeRevisionRefs: ["QUALIFICATION-SCHEME:R0.1"],
  computeModelRefs: ["MODEL:QUALIFICATION:R0.1"],
  createdAt: "2026-08-28T00:00:00.000Z",
  realityClass: "M2_REPLAYED",
};

describe("counterfactual branch runner", () => {
  it("binds every result to source reality and explicit counterfactual lineage", async () => {
    const result = await runCounterfactualBranchV1({
      scenario,
      branchRef: "SIMULATION-BRANCH:POLICY-R0.2",
      parentBranchRef: "SIMULATION-BRANCH:OBSERVED-BASELINE",
      sourceSnapshot,
      counterfactualRefs: ["POLICY:QUALIFICATION:R0.2"],
      evaluatorRef: "QUALIFICATION-EVALUATOR:R0.1",
      evaluator: (input) => ({ hypotheticalQualification: "L3_DEMONSTRATED", input }),
      computeProfile: cg2,
      admissionPolicy: policy,
    });

    expect(result).toMatchObject({
      sourceRealityRef: "RIVER:OBSERVED-REALITY:002",
      sourceSnapshotRef: sourceSnapshot.snapshotRef,
      sourceHash: sourceSnapshot.hash,
      parentBranchRef: "SIMULATION-BRANCH:OBSERVED-BASELINE",
      branchRef: "SIMULATION-BRANCH:POLICY-R0.2",
      counterfactualRefs: ["POLICY:QUALIFICATION:R0.2"],
      realityClass: "M2_REPLAYED",
      isObservedReality: false,
    });
  });

  it("produces distinct lineage and output identity when the counterfactual changes", async () => {
    const evaluator = (input: unknown, refs: readonly string[]) => ({ input, appliedRefs: refs });
    const base = {
      scenario,
      parentBranchRef: "SIMULATION-BRANCH:OBSERVED-BASELINE",
      sourceSnapshot,
      evaluatorRef: "QUALIFICATION-EVALUATOR:R0.1",
      evaluator,
      computeProfile: cg2,
      admissionPolicy: policy,
    };

    const policyBranch = await runCounterfactualBranchV1({
      ...base,
      branchRef: "SIMULATION-BRANCH:POLICY-R0.2",
      counterfactualRefs: ["POLICY:QUALIFICATION:R0.2"],
    });
    const interventionBranch = await runCounterfactualBranchV1({
      ...base,
      branchRef: "SIMULATION-BRANCH:INTERVENTION-ALT",
      counterfactualRefs: ["INTERVENTION:TRAINING-ALT-001"],
    });

    expect(policyBranch.lineageHash).not.toBe(interventionBranch.lineageHash);
    expect(policyBranch.outputHash).not.toBe(interventionBranch.outputHash);
    expect(policyBranch.outcomeRef).not.toBe(interventionBranch.outcomeRef);
  });
});
