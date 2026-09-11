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
  resolvedWardenDecisionId?: string;
  authorizedPermissions?: WardenExecutionContractR01["permissions"];
}

export type ExecutionValidationCode =
  | "INVALID_CONTRACT_VERSION"
  | "WARDEN_DECISION_MISSING"
  | "WARDEN_DECISION_UNKNOWN"
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
  | "FILESYSTEM_PERMISSION_EXCEEDS_GRANT"
  | "NETWORK_PERMISSION_EXCEEDS_GRANT"
  | "TIMEOUT_EXCEEDS_GRANT"
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

function everyStringInGrant(requested: string[], granted: string[]): boolean {
  const allowed = new Set(granted);
  return requested.every((value) => allowed.has(value));
}

function networkGrantKey(grant: NetworkGrant): string {
  return `${grant.cidr}|${grant.protocol}|${grant.port}`;
}

function everyNetworkGrantInGrant(requested: NetworkGrant[], granted: NetworkGrant[]): boolean {
  const allowed = new Set(granted.map(networkGrantKey));
  return requested.every((grant) => allowed.has(networkGrantKey(grant)));
}

function validatePermissionSubset(
  requested: WardenExecutionContractR01["permissions"],
  granted: WardenExecutionContractR01["permissions"],
): void {
  if (
    !everyStringInGrant(requested.filesystemRead, granted.filesystemRead) ||
    !everyStringInGrant(requested.filesystemWrite, granted.filesystemWrite)
  ) {
    throw new ExecutionContractValidationError(
      "FILESYSTEM_PERMISSION_EXCEEDS_GRANT",
      "Requested filesystem access exceeds the authoritative Warden grant",
    );
  }

  if (
    !everyNetworkGrantInGrant(requested.networkEgress, granted.networkEgress) ||
    !everyNetworkGrantInGrant(requested.networkIngress, granted.networkIngress)
  ) {
    throw new ExecutionContractValidationError(
      "NETWORK_PERMISSION_EXCEEDS_GRANT",
      "Requested network access exceeds the authoritative Warden grant",
    );
  }

  if (requested.timeoutMs > granted.timeoutMs) {
    throw new ExecutionContractValidationError(
      "TIMEOUT_EXCEEDS_GRANT",
      "Requested timeout exceeds the authoritative Warden grant",
    );
  }

  if (requested.ui === "restricted" && granted.ui === "deny") {
    throw new ExecutionContractValidationError(
      "FILESYSTEM_PERMISSION_EXCEEDS_GRANT",
      "Requested UI capability exceeds the authoritative Warden grant",
    );
  }

  if (requested.hostLoopback && !granted.hostLoopback) {
    throw new ExecutionContractValidationError(
      "NETWORK_PERMISSION_EXCEEDS_GRANT",
      "Requested host-loopback capability exceeds the authoritative Warden grant",
    );
  }
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

  if (!contract.authority) {
    throw new ExecutionContractValidationError(
      "WARDEN_DECISION_MISSING",
      "Warden authority is required before MXC execution",
    );
  }

  if (
    context.resolvedWardenDecisionId !== undefined &&
    contract.authority.wardenDecisionId !== context.resolvedWardenDecisionId
  ) {
    throw new ExecutionContractValidationError(
      "WARDEN_DECISION_UNKNOWN",
      "Execution contract references a Warden decision that was not authoritatively resolved",
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

  if (!Number.isSafeInteger(contract.permissions.timeoutMs) || contract.permissions.timeoutMs <= 0) {
    throw new ExecutionContractValidationError(
      "INVALID_TIMEOUT",
      "Execution timeout must be a positive safe integer",
    );
  }

  if (context.authorizedPermissions) {
    validatePermissionSubset(contract.permissions, context.authorizedPermissions);
  }

  if (contract.evidence.riverReservationId !== context.riverReservationId) {
    throw new ExecutionContractValidationError(
      "RIVER_RESERVATION_MISMATCH",
      "River reservation is missing or mismatched",
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
