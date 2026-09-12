import {
  getPlatformSupport,
  type IsolationTier,
  type PlatformSupport,
} from "@microsoft/mxc-sdk";

export type MxcAlphaSmokeRunnerErrorCode =
  | "OPT_IN_REQUIRED"
  | "WINDOWS_HOST_REQUIRED"
  | "MXC_UNSUPPORTED"
  | "PROCESSCONTAINER_UNAVAILABLE";

export class MxcAlphaSmokeRunnerError extends Error {
  readonly code: MxcAlphaSmokeRunnerErrorCode;

  constructor(code: MxcAlphaSmokeRunnerErrorCode, message: string) {
    super(message);
    this.name = "MxcAlphaSmokeRunnerError";
    this.code = code;
  }
}

export interface MxcAlphaSmokeReadinessInput {
  optIn: boolean;
}

export interface MxcAlphaSmokeReadinessDependencies {
  platform?: NodeJS.Platform;
  getPlatformSupport?: () => PlatformSupport;
}

export interface MxcAlphaProcessContainerCapability {
  platform: "win32";
  provider: "MXC";
  backend: "processcontainer";
  isolationTier?: IsolationTier;
}

/**
 * Fail-closed admission gate for Alpha ProcessContainer qualification.
 *
 * This function performs capability detection only. It never spawns a workload.
 * Explicit operator opt-in is checked before any MXC host probe occurs.
 */
export function assertAlphaProcessContainerReady(
  input: MxcAlphaSmokeReadinessInput,
  dependencies: MxcAlphaSmokeReadinessDependencies = {},
): MxcAlphaProcessContainerCapability {
  if (!input.optIn) {
    throw new MxcAlphaSmokeRunnerError(
      "OPT_IN_REQUIRED",
      "Alpha MXC physical qualification requires explicit operator opt-in",
    );
  }

  const platform = dependencies.platform ?? process.platform;
  if (platform !== "win32") {
    throw new MxcAlphaSmokeRunnerError(
      "WINDOWS_HOST_REQUIRED",
      "Alpha MXC ProcessContainer qualification must execute on a Windows host",
    );
  }

  const probe = dependencies.getPlatformSupport ?? getPlatformSupport;
  const support = probe();

  if (!support.isSupported) {
    throw new MxcAlphaSmokeRunnerError(
      "MXC_UNSUPPORTED",
      support.reason || "MXC reports this Windows host as unsupported",
    );
  }

  if (!support.availableMethods.includes("processcontainer")) {
    throw new MxcAlphaSmokeRunnerError(
      "PROCESSCONTAINER_UNAVAILABLE",
      "MXC does not report ProcessContainer as an available containment backend",
    );
  }

  return {
    platform: "win32",
    provider: "MXC",
    backend: "processcontainer",
    isolationTier: support.isolationTier,
  };
}
