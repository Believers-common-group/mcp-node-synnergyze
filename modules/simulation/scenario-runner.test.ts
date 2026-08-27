import { describe, expect, it } from "vitest";

import { canonicalReferenceSetHashV1 } from "./canonical.ts";
import type {
  ComputeGovernanceProfileV1,
  RealityAdmissionPolicyV1,
  SimulationScenarioV1,
} from "./contracts.ts";
import { runSyntheticScenarioV1 } from "./scenario-runner.ts";

const computeProfile: ComputeGovernanceProfileV1 = {
  profileRef: "COMPUTE-GOVERNANCE:CG1",
  level: "CG1_REPRODUCIBLE",
  policyRef: "COMPUTE-GOVERNANCE-POLICY:R0.1",
  evidenceRefs: ["RIVER:EVIDENCE:CG:001"],
  validFrom: "2026-08-28T00:00:00.000Z",
  validUntil: "2027-08-28T00:00:00.000Z",
  sourceDigest: "sha256:cg1",
};

const admissionPolicy: RealityAdmissionPolicyV1 = {
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

const scenario: SimulationScenarioV1 = {
  scenarioRef: "SIMULATION-SCENARIO:SYNTHETIC-001",
  mode: "SYNTHETIC",
  populationSnapshotRef: "SIMULATION-SNAPSHOT:POPULATION-001",
  policyRevisionRefs: ["POLICY:B", "POLICY:A"],
  qualificationSchemeRevisionRefs: ["QUALIFICATION:B", "QUALIFICATION:A"],
  computeModelRefs: ["MODEL:QUALIFICATION:R0.1"],
  createdAt: "2026-08-28T00:00:00.000Z",
  realityClass: "M1_SYNTHETIC",
};

const input = {
  principalRef: "SYNTHETIC-PERSONA:001",
  evidenceRefs: ["EVIDENCE:B", "EVIDENCE:A"],
  claimedCapability: "industrial.cold_storage.supervision",
};

describe("synthetic scenario runner", () => {
  it("canonicalizes declared unordered reference sets", () => {
    expect(canonicalReferenceSetHashV1(["B", "A", "A"])).toBe(
      canonicalReferenceSetHashV1(["A", "B"]),
    );
  });

  it("reproduces identical outcome identities for identical inputs", async () => {
    const evaluator = async (value: unknown) => ({ decision: "L3_DEMONSTRATED", source: value });

    const first = await runSyntheticScenarioV1({
      scenario,
      branchRef: "SIMULATION-BRANCH:BASELINE",
      input,
      evaluatorRef: "QUALIFICATION-EVALUATOR:R0.1",
      evaluator,
      computeProfile,
      admissionPolicy,
    });
    const second = await runSyntheticScenarioV1({
      scenario,
      branchRef: "SIMULATION-BRANCH:BASELINE",
      input,
      evaluatorRef: "QUALIFICATION-EVALUATOR:R0.1",
      evaluator,
      computeProfile,
      admissionPolicy,
    });

    expect(second.inputHash).toBe(first.inputHash);
    expect(second.outputHash).toBe(first.outputHash);
    expect(second.outcomeRef).toBe(first.outcomeRef);
  });

  it("binds M1 output to snapshots, evaluator/model refs, and zero effect authority", async () => {
    const result = await runSyntheticScenarioV1({
      scenario,
      branchRef: "SIMULATION-BRANCH:BASELINE",
      input,
      evaluatorRef: "QUALIFICATION-EVALUATOR:R0.1",
      evaluator: (value) => ({ accepted: true, source: value }),
      computeProfile,
      admissionPolicy,
    });

    expect(result).toMatchObject({
      scenarioRef: scenario.scenarioRef,
      branchRef: "SIMULATION-BRANCH:BASELINE",
      realityClass: "M1_SYNTHETIC",
      evaluatorRef: "QUALIFICATION-EVALUATOR:R0.1",
      computeModelRefs: ["MODEL:QUALIFICATION:R0.1"],
      effectFlags: {
        mayCreateAuthority: false,
        mayCreateQualification: false,
        mayCreateObligation: false,
        mayCreatePayment: false,
        mayTriggerExecution: false,
      },
    });
    expect(result.inputSnapshotRef).toMatch(/^SIMULATION-SNAPSHOT:INPUT:sha256:/);
    expect(result.outputSnapshotRef).toMatch(/^SIMULATION-SNAPSHOT:OUTPUT:sha256:/);
    expect(result.inputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.outputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("changes the input identity when material input changes", async () => {
    const evaluator = (value: unknown) => value;
    const first = await runSyntheticScenarioV1({
      scenario,
      branchRef: "SIMULATION-BRANCH:BASELINE",
      input,
      evaluatorRef: "QUALIFICATION-EVALUATOR:R0.1",
      evaluator,
      computeProfile,
      admissionPolicy,
    });
    const changed = await runSyntheticScenarioV1({
      scenario,
      branchRef: "SIMULATION-BRANCH:BASELINE",
      input: { ...input, claimedCapability: "industrial.refrigeration.maintenance" },
      evaluatorRef: "QUALIFICATION-EVALUATOR:R0.1",
      evaluator,
      computeProfile,
      admissionPolicy,
    });

    expect(changed.inputHash).not.toBe(first.inputHash);
    expect(changed.outcomeRef).not.toBe(first.outcomeRef);
  });
});
