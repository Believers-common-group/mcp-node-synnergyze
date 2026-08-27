import { describe, expect, it } from "vitest";

import { canonicalSha256V1 } from "./canonical.ts";
import type {
  ComputeGovernanceProfileV1,
  RealityAdmissionPolicyV1,
  SimulationScenarioV1,
  SimulationSnapshotV1,
} from "./contracts.ts";
import { runHistoricalReplayV1 } from "./replay-runner.ts";

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

const sourcePayload = {
  principalRef: "DIGITALME:HISTORICAL-001",
  capabilityRef: "CAPABILITY:COLD-STORAGE-SUPERVISION",
  observedResult: "COMPLETED",
};

const sourceSnapshot: SimulationSnapshotV1 = {
  snapshotRef: "SIMULATION-SNAPSHOT:HISTORICAL-001",
  hash: canonicalSha256V1(sourcePayload),
  payload: sourcePayload,
};

const scenario: SimulationScenarioV1 = {
  scenarioRef: "SIMULATION-SCENARIO:REPLAY-001",
  mode: "HISTORICAL_REPLAY",
  sourceRealityRef: "RIVER:OBSERVED-REALITY:001",
  populationSnapshotRef: sourceSnapshot.snapshotRef,
  policyRevisionRefs: ["POLICY:QUALIFICATION:R0.1"],
  qualificationSchemeRevisionRefs: ["QUALIFICATION-SCHEME:R0.1"],
  computeModelRefs: ["MODEL:QUALIFICATION:R0.1"],
  createdAt: "2026-08-28T00:00:00.000Z",
  realityClass: "M2_REPLAYED",
};

describe("historical replay runner", () => {
  it("requires M2/CG2 admission and preserves source reality separately", async () => {
    const before = structuredClone(sourceSnapshot);
    const result = await runHistoricalReplayV1({
      scenario,
      branchRef: "SIMULATION-BRANCH:REPLAY-BASELINE",
      sourceSnapshot,
      evaluatorRef: "QUALIFICATION-EVALUATOR:R0.1",
      evaluator: (input) => ({ replayDecision: "L3_DEMONSTRATED", input }),
      computeProfile: cg2,
      admissionPolicy: policy,
    });

    expect(sourceSnapshot).toEqual(before);
    expect(result).toMatchObject({
      scenarioRef: scenario.scenarioRef,
      branchRef: "SIMULATION-BRANCH:REPLAY-BASELINE",
      realityClass: "M2_REPLAYED",
      sourceRealityRef: "RIVER:OBSERVED-REALITY:001",
      sourceSnapshotRef: sourceSnapshot.snapshotRef,
      sourceHash: sourceSnapshot.hash,
      effectFlags: {
        mayCreateAuthority: false,
        mayCreateQualification: false,
        mayCreateObligation: false,
        mayCreatePayment: false,
        mayTriggerExecution: false,
      },
    });
    expect(result.outputHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("fails on source snapshot drift before invoking the evaluator", async () => {
    let calls = 0;
    const drifted: SimulationSnapshotV1 = {
      ...sourceSnapshot,
      payload: { ...sourcePayload, observedResult: "CHANGED" },
    };

    await expect(
      runHistoricalReplayV1({
        scenario,
        branchRef: "SIMULATION-BRANCH:REPLAY-DRIFT",
        sourceSnapshot: drifted,
        evaluatorRef: "QUALIFICATION-EVALUATOR:R0.1",
        evaluator: () => {
          calls += 1;
          return { shouldNotRun: true };
        },
        computeProfile: cg2,
        admissionPolicy: policy,
      }),
    ).rejects.toThrow("SIMULATION_INPUT_DRIFT");
    expect(calls).toBe(0);
  });
});
