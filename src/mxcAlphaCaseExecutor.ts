import type { IsolationTier } from "@microsoft/mxc-sdk";
import {
  executeQualifiedMxcCommandR01,
  type MxcContainmentResult,
} from "./mxcContainmentHarness.js";
import type {
  MxcAlphaExpectedEffect,
  MxcAlphaSmokeCase,
  MxcAlphaSmokeStatus,
} from "./mxcAlphaSmokePlan.js";
import type { MxcAlphaProcessContainerCapability } from "./mxcAlphaSmokeRunner.js";
import type {
  ExecutionValidationContext,
  WardenExecutionContractR01,
} from "./wardenExecutionContract.js";

export type MxcAlphaObservedEffect = MxcAlphaExpectedEffect | "INCONCLUSIVE";

export interface MxcAlphaEffectObservation {
  observed: MxcAlphaObservedEffect;
  reason?: string;
}

export interface MxcAlphaEffectVerificationInput {
  test: MxcAlphaSmokeCase;
  contract: WardenExecutionContractR01;
  result: MxcContainmentResult;
  capability: MxcAlphaProcessContainerCapability;
}

export type MxcAlphaEffectVerifier = (
  input: MxcAlphaEffectVerificationInput,
) => MxcAlphaEffectObservation | Promise<MxcAlphaEffectObservation>;

export interface MxcAlphaCaseEvidence {
  testId: MxcAlphaSmokeCase["testId"];
  verdict: Exclude<MxcAlphaSmokeStatus, "UNEXECUTED">;
  executionId: string;
  wardenDecisionId: string;
  riverReservationId: string;
  principalId: string;
  genesisContext: MxcAlphaSmokeCase["genesisContext"];
  requestedContainment: "process";
  resolvedBackend: "processcontainer";
  isolationTier?: IsolationTier;
  policyDigest?: string;
  qualificationConfigDigest?: string;
  executionConfigDigest?: string;
  commandDigest: string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  effect: {
    expected: MxcAlphaExpectedEffect;
    observed: MxcAlphaObservedEffect;
    verified: boolean;
  };
  startedAt: string;
  completedAt: string;
  reason?: string;
}

export interface MxcAlphaCaseExecutorDependencies {
  execute?: typeof executeQualifiedMxcCommandR01;
  now?: () => Date;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function verdictFor(
  expected: MxcAlphaExpectedEffect,
  observed: MxcAlphaObservedEffect,
): Exclude<MxcAlphaSmokeStatus, "UNEXECUTED"> {
  if (observed === "INCONCLUSIVE") return "INCONCLUSIVE";
  return observed === expected ? "PASS" : "FAIL";
}

function baseEvidence(
  test: MxcAlphaSmokeCase,
  contract: WardenExecutionContractR01,
  capability: MxcAlphaProcessContainerCapability,
  startedAt: string,
): Omit<
  MxcAlphaCaseEvidence,
  "verdict" | "effect" | "completedAt" | "reason"
> {
  return {
    testId: test.testId,
    executionId: contract.executionId,
    wardenDecisionId: contract.authority.wardenDecisionId,
    riverReservationId: contract.evidence.riverReservationId,
    principalId: contract.principal.principalId,
    genesisContext: { ...contract.genesisContext },
    requestedContainment: "process",
    resolvedBackend: capability.backend,
    isolationTier: capability.isolationTier,
    commandDigest: contract.workload.commandDigest,
    startedAt,
  };
}

/**
 * Execute one Alpha qualification case and produce a River-compatible evidence object.
 *
 * A process exit code is never treated as proof of containment. PASS/FAIL is determined
 * only by the independent case-specific effect verifier. MXC execution failures are
 * recorded as INCONCLUSIVE so they cannot be misreported as successful containment.
 */
export async function runMxcAlphaCaseR01(
  test: MxcAlphaSmokeCase,
  contract: WardenExecutionContractR01,
  context: ExecutionValidationContext,
  commandLine: string,
  capability: MxcAlphaProcessContainerCapability,
  verifyEffect: MxcAlphaEffectVerifier,
  dependencies: MxcAlphaCaseExecutorDependencies = {},
): Promise<MxcAlphaCaseEvidence> {
  const now = dependencies.now ?? (() => new Date());
  const execute = dependencies.execute ?? executeQualifiedMxcCommandR01;
  const startedAt = now().toISOString();
  const base = baseEvidence(test, contract, capability, startedAt);

  let result: MxcContainmentResult;
  try {
    result = await execute(contract, context, commandLine);
  } catch (error) {
    return {
      ...base,
      verdict: "INCONCLUSIVE",
      effect: {
        expected: test.expectedEffect,
        observed: "INCONCLUSIVE",
        verified: false,
      },
      completedAt: now().toISOString(),
      reason: errorMessage(error),
    };
  }

  let observation: MxcAlphaEffectObservation;
  try {
    observation = await verifyEffect({ test, contract, result, capability });
  } catch (error) {
    observation = { observed: "INCONCLUSIVE", reason: errorMessage(error) };
  }

  const verified =
    observation.observed !== "INCONCLUSIVE" && observation.observed === test.expectedEffect;

  return {
    ...base,
    verdict: verdictFor(test.expectedEffect, observation.observed),
    policyDigest: result.policyDigest,
    qualificationConfigDigest: result.configDigest,
    executionConfigDigest: result.executionConfigDigest,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    effect: {
      expected: test.expectedEffect,
      observed: observation.observed,
      verified,
    },
    completedAt: now().toISOString(),
    reason: observation.reason,
  };
}
