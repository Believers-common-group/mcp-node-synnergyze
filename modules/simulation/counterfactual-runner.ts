import {
  canonicalReferenceSetV1,
  canonicalSha256V1,
  realityAdmissionRequestHashV1,
} from "./canonical.ts";
import type {
  ComputeGovernanceProfileV1,
  RealityAdmissionPolicyV1,
  RealityAdmissionRequestV1,
  SimulationEffectFlagsV1,
  SimulationScenarioV1,
  SimulationSnapshotV1,
} from "./contracts.ts";
import { evaluateRealityAdmissionV1 } from "./reality-gate.ts";

const NO_EFFECTS: SimulationEffectFlagsV1 = {
  mayCreateAuthority: false,
  mayCreateQualification: false,
  mayCreateObligation: false,
  mayCreatePayment: false,
  mayTriggerExecution: false,
};

export interface RunCounterfactualBranchInputV1 {
  scenario: SimulationScenarioV1;
  branchRef: string;
  parentBranchRef: string;
  sourceSnapshot: SimulationSnapshotV1;
  counterfactualRefs: readonly string[];
  evaluatorRef: string;
  evaluator: (input: unknown, counterfactualRefs: readonly string[]) => unknown | Promise<unknown>;
  computeProfile: ComputeGovernanceProfileV1;
  admissionPolicy: RealityAdmissionPolicyV1;
}

function admissionRequest(run: RunCounterfactualBranchInputV1): RealityAdmissionRequestV1 {
  const body: Omit<RealityAdmissionRequestV1, "envelopeHash"> = {
    admissionRequestRef: `REALITY-ADMISSION:${run.scenario.scenarioRef}:${run.branchRef}`,
    objectType: "SIMULATION_SCENARIO",
    objectRef: run.scenario.scenarioRef,
    fromMaturity: "M1_SYNTHETIC",
    requestedMaturity: "M2_REPLAYED",
    qualificationSchemeRevisionRefs: canonicalReferenceSetV1(
      run.scenario.qualificationSchemeRevisionRefs,
    ),
    computeGovernanceProfileRef: run.computeProfile.profileRef,
    evidenceSnapshotRef: run.sourceSnapshot.snapshotRef,
    legalPolicyRefs: canonicalReferenceSetV1(run.scenario.policyRevisionRefs),
    privacyPolicyRefs: ["PRIVACY-POLICY:SIMULATION-ONLY:R0.1"],
    authoritySnapshotRef: "AUTHORITY-SNAPSHOT:SIMULATION-ONLY:R0.1",
    riskSnapshotRef: `RISK-SNAPSHOT:${run.scenario.scenarioRef}`,
    submittedAt: run.scenario.createdAt,
    effectFlags: NO_EFFECTS,
  };
  return { ...body, envelopeHash: realityAdmissionRequestHashV1(body) };
}

export async function runCounterfactualBranchV1(run: RunCounterfactualBranchInputV1) {
  if (
    run.scenario.mode !== "COUNTERFACTUAL" ||
    run.scenario.realityClass !== "M2_REPLAYED" ||
    run.scenario.sourceRealityRef === undefined
  ) {
    throw new Error("counterfactual_scenario_required");
  }
  if (run.sourceSnapshot.snapshotRef !== run.scenario.populationSnapshotRef) {
    throw new Error("SIMULATION_INPUT_DRIFT");
  }

  const sourceHash = canonicalSha256V1(run.sourceSnapshot.payload);
  if (sourceHash !== run.sourceSnapshot.hash) {
    throw new Error("SIMULATION_INPUT_DRIFT");
  }

  const admission = evaluateRealityAdmissionV1(
    admissionRequest(run),
    run.computeProfile,
    run.admissionPolicy,
  );
  if (!admission.admitted) {
    throw new Error(`simulation_admission_denied:${admission.reasonCodes.join(",")}`);
  }

  const counterfactualRefs = canonicalReferenceSetV1(run.counterfactualRefs);
  const lineageHash = canonicalSha256V1({
    sourceRealityRef: run.scenario.sourceRealityRef,
    sourceSnapshotRef: run.sourceSnapshot.snapshotRef,
    sourceHash,
    parentBranchRef: run.parentBranchRef,
    branchRef: run.branchRef,
    counterfactualRefs,
    policyRevisionRefs: canonicalReferenceSetV1(run.scenario.policyRevisionRefs),
    qualificationSchemeRevisionRefs: canonicalReferenceSetV1(
      run.scenario.qualificationSchemeRevisionRefs,
    ),
  });
  const output = await run.evaluator(run.sourceSnapshot.payload, counterfactualRefs);
  const outputHash = canonicalSha256V1(output);
  const outcomeHash = canonicalSha256V1({
    scenarioRef: run.scenario.scenarioRef,
    lineageHash,
    evaluatorRef: run.evaluatorRef,
    outputHash,
  });

  return {
    outcomeRef: `SIMULATION-OUTCOME:${outcomeHash}`,
    scenarioRef: run.scenario.scenarioRef,
    parentBranchRef: run.parentBranchRef,
    branchRef: run.branchRef,
    realityClass: "M2_REPLAYED" as const,
    sourceRealityRef: run.scenario.sourceRealityRef,
    sourceSnapshotRef: run.sourceSnapshot.snapshotRef,
    sourceHash,
    counterfactualRefs,
    lineageHash,
    outputSnapshotRef: `SIMULATION-SNAPSHOT:OUTPUT:${outputHash}`,
    outputHash,
    evaluatorRef: run.evaluatorRef,
    isObservedReality: false as const,
    effectFlags: NO_EFFECTS,
  };
}
