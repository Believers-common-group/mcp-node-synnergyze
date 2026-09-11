export type NetworkProtocol = "tcp" | "udp";

export interface NetworkGrant {
  cidr: string;
  protocol: NetworkProtocol;
  port: number;
}

export interface WardenExecutionContractR01 {
  contractVersion: "WARDEN-MXC-R0.1";
  executionId: string;
  authority: {
    wardenDecisionId: string;
    decisionHash: string;
    decision: "ALLOW";
    issuedAt: string;
    effectiveFrom: string;
    expiresAt: string;
  };
  principal: {
    principalId: string;
    digitalMeId?: string;
  };
  genesisContext: {
    nodeId: string;
    deviceId: string;
    estateId?: string;
    workspaceId: string;
    locationId?: string;
  };
  workload: {
    workloadId: string;
    artifactDigest: string;
    commandDigest: string;
    purpose: string;
  };
  permissions: {
    filesystemRead: string[];
    filesystemWrite: string[];
    networkEgress: NetworkGrant[];
    networkIngress: NetworkGrant[];
    hostLoopback: boolean;
    ui: "deny" | "restricted";
    timeoutMs: number;
  };
  runtime: {
    provider: "MXC";
    mxcSchema: "0.8.0-alpha";
    containment: "process";
  };
  evidence: {
    riverReservationId: string;
    receiptRequired: true;
    captureStdout: boolean;
    captureStderr: boolean;
  };
}

export interface ExecutionValidationContext {
  now: Date;
  principalId: string;
  nodeId: string;
  deviceId: string;
  workspaceId: string;
  artifactDigest: string;
  commandDigest: string;
  riverReservationId: string;
  decisionIntegrityValid: boolean;
  mxcAvailable: boolean;
  supportedSchema: boolean;
  supportedContainment: boolean;
}

export type ExecutionValidationCode =
  | "INVALID_CONTRACT_VERSION"
  | "DECISION_NOT_ALLOW"
  | "INVALID_DECISION_INTEGRITY"
  | "DECISION_NOT_EFFECTIVE"
  | "DECISION_EXPIRED"
  | "PRINCIPAL_MISMATCH"
  | "NODE_MISMATCH"
  | "DEVICE_MISMATCH"
  | "WORKSPACE_MISMATCH"
  | "ARTIFACT_DIGEST_MISMATCH"
  | "COMMAND_DIGEST_MISMATCH"
  | "RIVER_RESERVATION_MISMATCH"
  | "INVALID_TIMEOUT"
  | "HOST_LOOPBACK_NOT_ALLOWED_R01"
  | "MXC_UNAVAILABLE"
  | "UNSUPPORTED_MXC_SCHEMA"
  | "UNSUPPORTED_CONTAINMENT";

export class ExecutionContractValidationError extends Error {
  readonly code: ExecutionValidationCode;

  constructor(code: ExecutionValidationCode, message: string) {
    super(message);
    this.name = "ExecutionContractValidationError";
    this.code = code;
  }
}

function parseInstant(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid timestamp for ${field}`);
  }
  return parsed;
}

/**
 * Fail-closed pre-spawn validation for WARDEN-MXC-R0.1.
 *
 * This function performs no execution and grants no authority. It only proves
 * that the supplied contract still matches the authoritative execution context
 * immediately before an MXC policy may be compiled/spawned.
 */
export function validateExecutionContractPreSpawn(
  contract: WardenExecutionContractR01,
  context: ExecutionValidationContext,
): void {
  if (contract.contractVersion !== "WARDEN-MXC-R0.1") {
    throw new ExecutionContractValidationError(
      "INVALID_CONTRACT_VERSION",
      "Unsupported Warden execution contract version",
    );
  }

  if (contract.authority.decision !== "ALLOW") {
    throw new ExecutionContractValidationError(
      "DECISION_NOT_ALLOW",
      "Warden decision is not ALLOW",
    );
  }

  if (!context.decisionIntegrityValid) {
    throw new ExecutionContractValidationError(
      "INVALID_DECISION_INTEGRITY",
      "Warden decision integrity validation failed",
    );
  }

  const now = context.now.getTime();
  const effectiveFrom = parseInstant(
    contract.authority.effectiveFrom,
    "authority.effectiveFrom",
  );
  const expiresAt = parseInstant(contract.authority.expiresAt, "authority.expiresAt");

  if (now < effectiveFrom) {
    throw new ExecutionContractValidationError(
      "DECISION_NOT_EFFECTIVE",
      "Warden decision is not yet effective",
    );
  }

  if (now >= expiresAt) {
    throw new ExecutionContractValidationError(
      "DECISION_EXPIRED",
      "Warden decision has expired",
    );
  }

  if (contract.principal.principalId !== context.principalId) {
    throw new ExecutionContractValidationError(
      "PRINCIPAL_MISMATCH",
      "Principal does not match the Warden decision context",
    );
  }

  if (contract.genesisContext.nodeId !== context.nodeId) {
    throw new ExecutionContractValidationError(
      "NODE_MISMATCH",
      "Genesis node does not match the execution context",
    );
  }

  if (contract.genesisContext.deviceId !== context.deviceId) {
    throw new ExecutionContractValidationError(
      "DEVICE_MISMATCH",
      "Genesis device does not match the execution context",
    );
  }

  if (contract.genesisContext.workspaceId !== context.workspaceId) {
    throw new ExecutionContractValidationError(
      "WORKSPACE_MISMATCH",
      "Workspace does not match the execution context",
    );
  }

  if (contract.workload.artifactDigest !== context.artifactDigest) {
    throw new ExecutionContractValidationError(
      "ARTIFACT_DIGEST_MISMATCH",
      "Artifact digest changed after authorization",
    );
  }

  if (contract.workload.commandDigest !== context.commandDigest) {
    throw new ExecutionContractValidationError(
      "COMMAND_DIGEST_MISMATCH",
      "Command digest changed after authorization",
    );
  }

  if (contract.evidence.riverReservationId !== context.riverReservationId) {
    throw new ExecutionContractValidationError(
      "RIVER_RESERVATION_MISMATCH",
      "River reservation is missing or mismatched",
    );
  }

  if (!Number.isSafeInteger(contract.permissions.timeoutMs) || contract.permissions.timeoutMs <= 0) {
    throw new ExecutionContractValidationError(
      "INVALID_TIMEOUT",
      "Execution timeout must be a positive safe integer",
    );
  }

  if (contract.permissions.hostLoopback) {
    throw new ExecutionContractValidationError(
      "HOST_LOOPBACK_NOT_ALLOWED_R01",
      "R0.1 does not permit host loopback access",
    );
  }

  if (!context.mxcAvailable) {
    throw new ExecutionContractValidationError(
      "MXC_UNAVAILABLE",
      "MXC is unavailable; native execution fallback is forbidden",
    );
  }

  if (!context.supportedSchema || contract.runtime.mxcSchema !== "0.8.0-alpha") {
    throw new ExecutionContractValidationError(
      "UNSUPPORTED_MXC_SCHEMA",
      "MXC policy schema is not qualified for R0.1",
    );
  }

  if (!context.supportedContainment || contract.runtime.containment !== "process") {
    throw new ExecutionContractValidationError(
      "UNSUPPORTED_CONTAINMENT",
      "MXC containment is not qualified for R0.1",
    );
  }
}
