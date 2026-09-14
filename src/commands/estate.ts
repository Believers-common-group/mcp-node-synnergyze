import { extname } from "node:path";

import { parseEstateCommandLineV1 } from "../../modules/estate-console/command-router.ts";
import type {
  EstateArtifactV1,
  EstateConsoleSessionV1,
  EstateProbeHealthV1,
  EstateProbeResultV1,
  EstateReceiptProjectionV1,
} from "../../modules/estate-console/contracts.ts";
import type { EstateConsoleSubmissionResultV1 } from "../../modules/estate-console/runtime.ts";

export interface EstateCommandRunnerInspectionPortV1 {
  status(): readonly EstateProbeResultV1[];
  health(): EstateProbeHealthV1;
  inspect(resourceRef: string): EstateProbeResultV1;
}

export interface EstateCommandRunnerArtifactPortV1 {
  registerIncoming(filename: string, mediaType: string): EstateArtifactV1;
}

export interface EstateCommandRunnerRuntimePortV1 {
  submit(artifact: EstateArtifactV1, requestedAt: string): EstateConsoleSubmissionResultV1;
}

export interface EstateCommandRunnerReceiptQueryPortV1 {
  list(): readonly EstateReceiptProjectionV1[];
  get(receiptRef: string): EstateReceiptProjectionV1 | undefined;
}

export interface EstateCommandRunnerDependenciesV1 {
  readonly session: EstateConsoleSessionV1;
  readonly inspection: EstateCommandRunnerInspectionPortV1;
  readonly artifacts: EstateCommandRunnerArtifactPortV1;
  readonly runtime: EstateCommandRunnerRuntimePortV1;
  readonly receiptQuery: EstateCommandRunnerReceiptQueryPortV1;
  readonly now: () => string;
}

export interface EstateCommandRunnerResultV1 {
  readonly exitCode: number;
  readonly data?: unknown;
  readonly errorCode?: string;
}

function mediaTypeFor(filename: string): string {
  switch (extname(filename).toLowerCase()) {
    case ".yaml":
    case ".yml":
      return "application/yaml";
    case ".json":
      return "application/json";
    case ".toml":
      return "application/toml";
    case ".md":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

function failure(error: unknown): EstateCommandRunnerResultV1 {
  return {
    exitCode: 1,
    errorCode: error instanceof Error ? error.message : "estate_console_command_failed",
  };
}

export function runEstateCommandV1(
  line: string,
  deps: EstateCommandRunnerDependenciesV1,
): EstateCommandRunnerResultV1 {
  try {
    const command = parseEstateCommandLineV1(line);

    switch (command.verb) {
      case "WHOAMI":
        return {
          exitCode: 0,
          data: {
            principalRef: deps.session.principalRef,
            deviceRef: deps.session.deviceRef,
            consoleRef: deps.session.consoleRef,
            sessionRef: deps.session.sessionRef,
            nodeRef: deps.session.nodeRef,
            environment: deps.session.environment,
            capabilities: [...deps.session.capabilities],
          },
        };

      case "STATUS":
        return { exitCode: 0, data: deps.inspection.status() };

      case "HEALTH":
        return { exitCode: 0, data: deps.inspection.health() };

      case "INSPECT":
        return { exitCode: 0, data: deps.inspection.inspect(command.resourceRef) };

      case "SUBMIT": {
        const artifact = deps.artifacts.registerIncoming(
          command.artifactPath,
          mediaTypeFor(command.artifactPath),
        );
        return { exitCode: 0, data: deps.runtime.submit(artifact, deps.now()) };
      }

      case "RECEIPTS":
        return {
          exitCode: 0,
          data: deps.receiptQuery
            .list()
            .filter((receipt) => receipt.sessionRef === deps.session.sessionRef),
        };

      case "RECEIPT": {
        const receipt = deps.receiptQuery.get(command.receiptRef);
        if (!receipt || receipt.sessionRef !== deps.session.sessionRef) {
          return { exitCode: 1, errorCode: "estate_console_receipt_not_visible" };
        }
        return { exitCode: 0, data: receipt };
      }

      case "EXIT":
        return { exitCode: 0, data: { exit: true } };
    }
  } catch (error) {
    return failure(error);
  }
}
