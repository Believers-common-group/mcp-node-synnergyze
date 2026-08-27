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
  SimulationOutcomeRecordV1,
  SimulationScenarioV1,
} from "./contracts.ts";
import { evaluateRealityAdmissionV1 } from "./reality-gate.ts";

const NO_EFFECTS: SimulationEffectFlagsV1 = {
  mayCreateAuthority: false,
  mayCreateQualification: false,
  mayCreateObligation: false,
  mayCreatePayment: false,
  mayTriggerExecution: false,
};

export interface RunSyntheticScenarioInputV1 {
  scenario: SimulationScenarioV1;
  branchRef: string;
  input: unknown;
  evaluatorRef: string;
  evaluator: (input: unknown) => unknown | Promise<unknown>;
  computeProfile: ComputeGovernanceProfileV1;
  admissionPolicy: RealityAdmissionPolicyV1;
}

function admissionRequest(
  run: RunSyntheticScenarioInputV1,
): RealityAdmissionRequestV1 {
  const body: Omit<RealityAdmissionRequestV1, "envelopeHash"> = {
    admissionRequestRef: `REALITY-ADMISSION:${run.scenario.scenarioRef}:${run.branchRef}`,
    objectType: "SIMULATION_SCENARIO",
    objectRef: run.scenario.scenarioRef,
    fromMaturity: "M0_MODELLED",
    requestedMaturity: "M1_SYNTHETIC",
    qualificationSchemeRevisionRefs: canonicalReferenceSetV1(
      run.scenario.qualificationSchemeRevisionRefs,
    ),
    computeGovernanceProfileRef: run.computeProfile.profileRef,
    evidenceSnapshotRef: run.scenario.populationSnapshotRef,
    legalPolicyRefs: canonicalReferenceSetV1(run.scenario.policyRevisionRefs),
    privacyPolicyRefs: ["PRIVACY-POLICY:SIMULATION-ONLY:R0.1"],
    authoritySnapshotRef: "AUTHORITY-SNAPSHOT:SIMULATION-ONLY:R0.1",
    riskSnapshotRef: `RISK-SNAPSHOT:${run.scenario.scenarioRef}`,
    submittedAt: run.scenario.createdAt,
    effectFlags: NO_EFFECTS,
  };
  return { ...body, envelopeHash: realityAdmissionRequestHashV1(body) };
}

export async function runSyntheticScenarioV1(
  run: RunSyntheticScenarioInputV1,
): Promise<SimulationOutcomeRecordV1> {
  if (run.scenario.mode !== "SYNTHETIC" || run.scenario.realityClass !== "M1_SYNTHETIC") {
    throw new Error("synthetic_scenario_required");
  }

  const admission = evaluateRealityAdmissionV1(
    admissionRequest(run),
    run.computeProfile,
    run.admissionPolicy,
  );
  if (!admission.admitted) {
    throw new Error(`simulation_admission_denied:${admission.reasonCodes.join(",")}`);
  }

  const inputHash = canonicalSha256V1(run.input);
  const output = await run.evaluator(run.input);
  const outputHash = canonicalSha256V1(output);
  const computeModelRefs = canonicalReferenceSetV1(run.scenario.computeModelRefs);
  const outcomeHash = canonicalSha256V1({
    scenarioRef: run.scenario.scenarioRef,
    branchRef: run.branchRef,
    policyRevisionRefs: canonicalReferenceSetV1(run.scenario.policyRevisionRefs),
    qualificationSchemeRevisionRefs: canonicalReferenceSetV1(
      run.scenario.qualificationSchemeRevisionRefs,
    ),
    computeModelRefs,
    evaluatorRef: run.evaluatorRef,
    inputHash,
    outputHash,
  });

  return {
    outcomeRef: `SIMULATION-OUTCOME:${outcomeHash}`,
    scenarioRef: run.scenario.scenarioRef,
    branchRef: run.branchRef,
    realityClass: "M1_SYNTHETIC",
    inputSnapshotRef: `SIMULATION-SNAPSHOT:INPUT:${inputHash}`,
    inputHash,
    outputSnapshotRef: `SIMULATION-SNAPSHOT:OUTPUT:${outputHash}`,
    outputHash,
    evaluatorRef: run.evaluatorRef,
    computeModelRefs,
    effectFlags: NO_EFFECTS,
  };
}
