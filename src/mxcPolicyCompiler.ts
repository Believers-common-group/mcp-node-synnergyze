import {
  type ExecutionValidationContext,
  type NetworkGrant,
  type WardenExecutionContractR01,
  validateExecutionContractPreSpawn,
} from "./wardenExecutionContract.js";

export type MxcPolicyCompilationCode = "UNSUPPORTED_INGRESS_GRANT_R01";

export class MxcPolicyCompilationError extends Error {
  readonly code: MxcPolicyCompilationCode;

  constructor(code: MxcPolicyCompilationCode, message: string) {
    super(message);
    this.name = "MxcPolicyCompilationError";
    this.code = code;
  }
}

export interface MxcPolicyR08 {
  version: "0.8.0-alpha";
  filesystem: {
    readonlyPaths: string[];
    readwritePaths: string[];
    clearPolicyOnExit: true;
  };
  network: {
    egress: {
      default: "deny";
      allow?: Array<{
        to: Array<{ cidr: string }>;
        ports: Array<{ protocol: "tcp" | "udp"; port: number }>;
      }>;
    };
    ingress: {
      default: "deny";
      hostLoopback: "deny";
    };
  };
  ui: {
    allowWindows: false;
    clipboard: "none";
    allowInputInjection: false;
  };
  timeoutMs: number;
}

function compileNetworkRule(grant: NetworkGrant): {
  to: Array<{ cidr: string }>;
  ports: Array<{ protocol: "tcp" | "udp"; port: number }>;
} {
  return {
    to: [{ cidr: grant.cidr }],
    ports: [{ protocol: grant.protocol, port: grant.port }],
  };
}

/**
 * Compile a validated WARDEN-MXC-R0.1 contract into the portable MXC 0.8 policy shape.
 *
 * This function performs no spawn and no side effect. It is deliberately monotonic:
 * it may preserve or reduce the Warden-authorized surface, but never broaden it.
 */
export function compileMxcPolicyR08(
  contract: WardenExecutionContractR01,
  context: ExecutionValidationContext,
): MxcPolicyR08 {
  validateExecutionContractPreSpawn(contract, context);

  if (contract.permissions.networkIngress.length > 0) {
    throw new MxcPolicyCompilationError(
      "UNSUPPORTED_INGRESS_GRANT_R01",
      "R0.1 compiler does not translate specific ingress grants; refusing to weaken the request",
    );
  }

  const egress = contract.permissions.networkEgress.map(compileNetworkRule);

  return {
    version: "0.8.0-alpha",
    filesystem: {
      readonlyPaths: [...contract.permissions.filesystemRead],
      readwritePaths: [...contract.permissions.filesystemWrite],
      clearPolicyOnExit: true,
    },
    network: {
      egress: egress.length > 0 ? { default: "deny", allow: egress } : { default: "deny" },
      ingress: {
        default: "deny",
        hostLoopback: "deny",
      },
    },
    ui: {
      allowWindows: false,
      clipboard: "none",
      allowInputInjection: false,
    },
    timeoutMs: contract.permissions.timeoutMs,
  };
}
