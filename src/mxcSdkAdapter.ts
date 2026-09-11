import { createHash } from "node:crypto";
import {
  createConfigFromPolicy as sdkCreateConfigFromPolicy,
  type ContainerConfig,
  type SandboxPolicy,
} from "@microsoft/mxc-sdk";
import { compileMxcPolicyR08 } from "./mxcPolicyCompiler.js";
import type {
  ExecutionValidationContext,
  WardenExecutionContractR01,
} from "./wardenExecutionContract.js";

export type MxcSdkAdapterErrorCode = "MXC_CONFIG_GENERATION_FAILED";

export class MxcSdkAdapterError extends Error {
  readonly code: MxcSdkAdapterErrorCode;
  readonly cause?: unknown;

  constructor(code: MxcSdkAdapterErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "MxcSdkAdapterError";
    this.code = code;
    this.cause = cause;
  }
}

export interface PreparedMxcExecutionConfigR01 {
  containmentIntent: "process";
  policyDigest: string;
  configDigest: string;
  config: ContainerConfig;
}

export interface MxcSdkAdapterDependencies {
  createConfigFromPolicy?: typeof sdkCreateConfigFromPolicy;
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

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalize(value)).digest("hex")}`;
}

function deterministicContainerId(executionId: string): string {
  const suffix = createHash("sha256").update(executionId).digest("hex").slice(0, 20);
  return `wdmxc${suffix}`;
}

/**
 * Prepare a real MXC ContainerConfig from a qualified WARDEN-MXC-R0.1 contract.
 *
 * This adapter is intentionally non-spawning. It calls only MXC's policy-to-config
 * translation API. It does not import or invoke spawnSandboxFromConfig.
 * Authority validation remains in the Warden contract/compiler layer; SDK failures
 * are wrapped distinctly so River evidence can preserve the correct failure domain.
 */
export function prepareMxcExecutionConfigR01(
  contract: WardenExecutionContractR01,
  context: ExecutionValidationContext,
  dependencies: MxcSdkAdapterDependencies = {},
): PreparedMxcExecutionConfigR01 {
  // Keep authority/context failures in their original Warden error domain.
  const compiledPolicy = compileMxcPolicyR08(contract, context);
  const policy: SandboxPolicy = compiledPolicy;
  const containmentIntent = "process" as const;
  const containerId = deterministicContainerId(contract.executionId);
  const createConfigFromPolicy = dependencies.createConfigFromPolicy ?? sdkCreateConfigFromPolicy;

  let config: ContainerConfig;
  try {
    config = createConfigFromPolicy(policy, containmentIntent, containerId);
  } catch (error) {
    throw new MxcSdkAdapterError(
      "MXC_CONFIG_GENERATION_FAILED",
      "MXC SDK failed to generate a containment configuration; execution remains unavailable",
      error,
    );
  }

  // Qualification must never smuggle an executable command into the config.
  if (!config.process) {
    throw new MxcSdkAdapterError(
      "MXC_CONFIG_GENERATION_FAILED",
      "MXC SDK returned a config without process settings",
    );
  }
  config.process.commandLine = "";

  return {
    containmentIntent,
    policyDigest: digest(policy),
    configDigest: digest(config),
    config,
  };
}
