export type MxcAlphaSmokeTestId =
  | "MXC-W-017"
  | "MXC-W-018"
  | "MXC-W-019"
  | "MXC-W-020"
  | "MXC-W-021";

export type MxcAlphaSmokeStatus = "UNEXECUTED" | "PASS" | "FAIL" | "INCONCLUSIVE";
export type MxcAlphaExpectedEffect = "BLOCKED" | "ALLOWED";

export interface MxcAlphaSmokeGenesisContext {
  nodeId: string;
  deviceId: string;
  workspaceId: string;
}

export interface MxcAlphaSmokePlanInput extends MxcAlphaSmokeGenesisContext {
  riverReservationPrefix: string;
}

export interface MxcAlphaSmokeCase {
  testId: MxcAlphaSmokeTestId;
  status: MxcAlphaSmokeStatus;
  expectedEffect: MxcAlphaExpectedEffect;
  riverReservationId: string;
  genesisContext: MxcAlphaSmokeGenesisContext;
  purpose: string;
}

const CASES: ReadonlyArray<{
  testId: MxcAlphaSmokeTestId;
  expectedEffect: MxcAlphaExpectedEffect;
  purpose: string;
}> = [
  {
    testId: "MXC-W-017",
    expectedEffect: "BLOCKED",
    purpose: "Verify unauthorized filesystem read is blocked by MXC containment",
  },
  {
    testId: "MXC-W-018",
    expectedEffect: "BLOCKED",
    purpose: "Verify unauthorized filesystem write is blocked by MXC containment",
  },
  {
    testId: "MXC-W-019",
    expectedEffect: "BLOCKED",
    purpose: "Verify outbound internet access is blocked under explicit deny",
  },
  {
    testId: "MXC-W-020",
    expectedEffect: "BLOCKED",
    purpose: "Verify host loopback access is blocked under explicit deny",
  },
  {
    testId: "MXC-W-021",
    expectedEffect: "ALLOWED",
    purpose: "Verify explicitly authorized bounded resource access succeeds",
  },
];

export function createAlphaSmokePlan(input: MxcAlphaSmokePlanInput): MxcAlphaSmokeCase[] {
  const genesisContext: MxcAlphaSmokeGenesisContext = {
    nodeId: input.nodeId,
    deviceId: input.deviceId,
    workspaceId: input.workspaceId,
  };

  return CASES.map((test) => ({
    ...test,
    status: "UNEXECUTED",
    riverReservationId: `${input.riverReservationPrefix}-${test.testId.slice(4).replaceAll("-", "")}`,
    genesisContext: { ...genesisContext },
  }));
}
