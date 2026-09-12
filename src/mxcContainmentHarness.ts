import { createHash } from "node:crypto";
import { spawnSandboxFromConfig, type ContainerConfig } from "@microsoft/mxc-sdk";
import { prepareMxcExecutionConfigR01 } from "./mxcSdkAdapter.js";
import {
  ExecutionContractValidationError,
  type ExecutionValidationContext,
  type WardenExecutionContractR01,
} from "./wardenExecutionContract.js";

export interface MxcContainmentResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  policyDigest: string;
  configDigest: string;
  executionConfigDigest: string;
  containmentIntent: "process";
}

export interface MxcSpawnedProcess {
  stdout?: NodeJS.ReadableStream | null;
  stderr?: NodeJS.ReadableStream | null;
  once(event: "close", listener: (code: number | null) => void): unknown;
  once(event: "error", listener: (error: Error) => void): unknown;
}

export interface MxcContainmentHarnessDependencies {
  spawn?: (config: ContainerConfig, options: { usePty: false }) => MxcSpawnedProcess;
  revalidateBeforeSpawn?: () => ExecutionValidationContext | Promise<ExecutionValidationContext>;
}

export type MxcContainmentHarnessErrorCode =
  | "COMMAND_DIGEST_MISMATCH"
  | "REVALIDATION_REQUIRED"
  | "SPAWN_FAILED";

export class MxcContainmentHarnessError extends Error {
  readonly code: MxcContainmentHarnessErrorCode;
  readonly cause?: unknown;

  constructor(code: MxcContainmentHarnessErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "MxcContainmentHarnessError";
    this.code = code;
    this.cause = cause;
  }
}

export function sha256Command(commandLine: string): string {
  return `sha256:${createHash("sha256").update(commandLine, "utf8").digest("hex")}`;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}

function digestConfig(config: ContainerConfig): string {
  return `sha256:${createHash("sha256").update(canonicalize(config)).digest("hex")}`;
}

function collectStream(stream: NodeJS.ReadableStream | null | undefined): Promise<string> {
  if (!stream) return Promise.resolve("");

  return new Promise((resolve, reject) => {
    let output = "";
    stream.setEncoding?.("utf8");
    stream.on("data", (chunk) => {
      output += String(chunk);
    });
    stream.once("end", () => resolve(output));
    stream.once("error", reject);
  });
}

/**
 * Execute one already-authorized command through MXC.
 *
 * This is deliberately narrow and fail-closed:
 * - command bytes are rebound to the Warden-authorized command digest;
 * - an initial Warden / Genesis / River / MXC gate rejects invalid work early;
 * - authority is resolved again immediately before spawn and the complete policy is recompiled;
 * - commandLine is populated only after fresh revalidation succeeds;
 * - the only execution primitive is spawnSandboxFromConfig(..., { usePty: false });
 * - there is no raw/native fallback path.
 */
export async function executeQualifiedMxcCommandR01(
  contract: WardenExecutionContractR01,
  context: ExecutionValidationContext,
  commandLine: string,
  dependencies: MxcContainmentHarnessDependencies = {},
): Promise<MxcContainmentResult> {
  const actualCommandDigest = sha256Command(commandLine);
  if (
    actualCommandDigest !== contract.workload.commandDigest ||
    actualCommandDigest !== context.commandDigest
  ) {
    throw new MxcContainmentHarnessError(
      "COMMAND_DIGEST_MISMATCH",
      "Command bytes do not match the Warden-authorized workload digest",
    );
  }

  // Initial fail-closed qualification prevents invalid work from reaching the queued spawn boundary.
  prepareMxcExecutionConfigR01(contract, context);

  if (!dependencies.revalidateBeforeSpawn) {
    throw new MxcContainmentHarnessError(
      "REVALIDATION_REQUIRED",
      "Immediate Warden authority revalidation is required before MXC spawn",
    );
  }

  // W-026: resolve fresh authority/context immediately before spawn, then rerun the complete
  // contract -> policy -> MXC config path. A queued decision that expired or narrowed therefore
  // fails before any executable command is inserted into a sandbox configuration.
  const freshContext = await dependencies.revalidateBeforeSpawn();
  const prepared = prepareMxcExecutionConfigR01(contract, freshContext);
  prepared.config.process!.commandLine = commandLine;
  const executionConfigDigest = digestConfig(prepared.config);

  const spawn = dependencies.spawn ?? spawnSandboxFromConfig;

  let child: MxcSpawnedProcess;
  try {
    child = spawn(prepared.config, { usePty: false });
  } catch (error) {
    throw new MxcContainmentHarnessError(
      "SPAWN_FAILED",
      "MXC failed before a sandboxed process was created; native fallback is forbidden",
      error,
    );
  }

  const stdoutPromise = collectStream(child.stdout);
  const stderrPromise = collectStream(child.stderr);

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", (error) => {
      reject(
        new MxcContainmentHarnessError(
          "SPAWN_FAILED",
          "MXC sandbox process emitted an execution error; native fallback is forbidden",
          error,
        ),
      );
    });
    child.once("close", resolve);
  });

  const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);

  return {
    exitCode,
    stdout,
    stderr,
    policyDigest: prepared.policyDigest,
    configDigest: prepared.configDigest,
    executionConfigDigest,
    containmentIntent: prepared.containmentIntent,
  };
}

/** Type guard for callers that need to keep Warden denials distinct from spawn failures. */
export function isWardenPreSpawnDenial(error: unknown): error is ExecutionContractValidationError {
  return error instanceof ExecutionContractValidationError;
}
