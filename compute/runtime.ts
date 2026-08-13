import { createHash } from "node:crypto";

export const ALPHA_COMPUTE_IDENTITIES = {
  nodeId: "ALPHA-NODE-001",
  principalRef: "DIGITALME-ALPHA-TEST-001",
  representedEntityRef: "LAB-COMPANY-001",
  wardenRef: "WARDEN-ALPHA-RC1-001",
  modelRef: "MODEL-SYNTHETIC-GEMM-001",
} as const;

export type ComputeProvider = "synthetic-cpu-proof" | "apple-mpp-local";
export type ComputeOperation = "gemm";
export type RunnerStatus = "ENROLLED" | "REVOKED";
export type ComputeGrantStatus = "ALLOW" | "DENY";
export type ComputeAttemptStatus =
  | "VERIFIED"
  | "DENIED"
  | "BLOCKED_REQUIREMENT"
  | "UNAVAILABLE";

export interface ComputeGrant {
  grantRef: string;
  wardenRef: string;
  nodeId: string;
  principalRef: string;
  representedEntityRef: string;
  provider: ComputeProvider;
  operation: ComputeOperation;
  modelRef: string;
  runnerId: string;
  status: ComputeGrantStatus;
  issuedAt: string;
  expiresAt: string;
  evidenceRequired: true;
  synthetic: true;
}

export interface ComputeIntent {
  correlationId: string;
  nodeId: string;
  principalRef: string;
  representedEntityRef: string;
  provider: ComputeProvider;
  operation: ComputeOperation;
  modelRef: string;
  runnerId: string;
  input: GemmInput;
  synthetic: true;
}

export interface RunnerRegistration {
  runnerId: string;
  nodeId: string;
  provider: ComputeProvider;
  status: RunnerStatus;
  attested: boolean;
  toolchainStatus: "SYNTHETIC_READY" | "TOOLCHAIN_READY";
  hardwareClass: string;
  synthetic: boolean;
}

export interface GemmInput {
  m: number;
  n: number;
  k: number;
  a: number[];
  b: number[];
}

export interface GemmResult {
  rows: number;
  columns: number;
  values: number[];
  sha256: string;
}

export interface ComputeEvidenceEnvelope {
  evidenceRef: string;
  correlationId: string;
  nodeId: string;
  principalRef: string;
  representedEntityRef: string;
  wardenGrantRef: string;
  provider: ComputeProvider;
  runnerId: string;
  modelRef: string;
  operation: ComputeOperation;
  stage: "RESERVED" | "SEALED" | "DENIED";
  resultHash?: string;
  reason?: string;
  synthetic: true;
}

export interface ComputeAttemptResult {
  status: ComputeAttemptStatus;
  correlationId: string;
  grantRef?: string;
  reservationRef?: string;
  evidenceRef?: string;
  result?: GemmResult;
  reason?: string;
  realWorldEffectOccurred: false;
}

export interface ComputeRunner {
  registration: RunnerRegistration;
  execute(intent: ComputeIntent): GemmResult;
}

function validateGemmInput(input: GemmInput): void {
  if (!Number.isInteger(input.m) || !Number.isInteger(input.n) || !Number.isInteger(input.k)) {
    throw new Error("gemm_dimensions_must_be_integers");
  }
  if (input.m <= 0 || input.n <= 0 || input.k <= 0) {
    throw new Error("gemm_dimensions_must_be_positive");
  }
  if (input.a.length !== input.m * input.k) {
    throw new Error("gemm_matrix_a_shape_mismatch");
  }
  if (input.b.length !== input.k * input.n) {
    throw new Error("gemm_matrix_b_shape_mismatch");
  }
}

function multiplyGemm(input: GemmInput): GemmResult {
  validateGemmInput(input);
  const values = Array<number>(input.m * input.n).fill(0);

  for (let row = 0; row < input.m; row += 1) {
    for (let column = 0; column < input.n; column += 1) {
      let sum = 0;
      for (let inner = 0; inner < input.k; inner += 1) {
        sum += input.a[row * input.k + inner] * input.b[inner * input.n + column];
      }
      values[row * input.n + column] = sum;
    }
  }

  return {
    rows: input.m,
    columns: input.n,
    values,
    sha256: createHash("sha256").update(JSON.stringify(values)).digest("hex"),
  };
}

export class SyntheticCpuComputeRunner implements ComputeRunner {
  readonly registration: RunnerRegistration = {
    runnerId: "ALPHA-SYNTHETIC-COMPUTE-RUNNER-001",
    nodeId: ALPHA_COMPUTE_IDENTITIES.nodeId,
    provider: "synthetic-cpu-proof",
    status: "ENROLLED",
    attested: true,
    toolchainStatus: "SYNTHETIC_READY",
    hardwareClass: "in-memory-test-runner",
    synthetic: true,
  };

  execute(intent: ComputeIntent): GemmResult {
    if (intent.provider !== this.registration.provider) {
      throw new Error("runner_provider_mismatch");
    }
    if (intent.operation !== "gemm") {
      throw new Error("runner_operation_unsupported");
    }
    return multiplyGemm(intent.input);
  }
}

export class ComputeEvidenceJournal {
  private readonly envelopes: ComputeEvidenceEnvelope[] = [];

  reserve(intent: ComputeIntent, grant: ComputeGrant): string {
    const evidenceRef = `COMPUTE-EVIDENCE-RESERVATION:${intent.correlationId}`;
    this.envelopes.push({
      evidenceRef,
      correlationId: intent.correlationId,
      nodeId: intent.nodeId,
      principalRef: intent.principalRef,
      representedEntityRef: intent.representedEntityRef,
      wardenGrantRef: grant.grantRef,
      provider: intent.provider,
      runnerId: intent.runnerId,
      modelRef: intent.modelRef,
      operation: intent.operation,
      stage: "RESERVED",
      synthetic: true,
    });
    return evidenceRef;
  }

  seal(intent: ComputeIntent, grant: ComputeGrant, result: GemmResult): string {
    const evidenceRef = `COMPUTE-EVIDENCE-SEALED:${intent.correlationId}`;
    this.envelopes.push({
      evidenceRef,
      correlationId: intent.correlationId,
      nodeId: intent.nodeId,
      principalRef: intent.principalRef,
      representedEntityRef: intent.representedEntityRef,
      wardenGrantRef: grant.grantRef,
      provider: intent.provider,
      runnerId: intent.runnerId,
      modelRef: intent.modelRef,
      operation: intent.operation,
      stage: "SEALED",
      resultHash: result.sha256,
      synthetic: true,
    });
    return evidenceRef;
  }

  deny(intent: ComputeIntent, grant: ComputeGrant | undefined, reason: string): string {
    const evidenceRef = `COMPUTE-EVIDENCE-DENIED:${intent.correlationId}`;
    this.envelopes.push({
      evidenceRef,
      correlationId: intent.correlationId,
      nodeId: intent.nodeId,
      principalRef: intent.principalRef,
      representedEntityRef: intent.representedEntityRef,
      wardenGrantRef: grant?.grantRef ?? "MISSING",
      provider: intent.provider,
      runnerId: intent.runnerId,
      modelRef: intent.modelRef,
      operation: intent.operation,
      stage: "DENIED",
      reason,
      synthetic: true,
    });
    return evidenceRef;
  }

  list(): ComputeEvidenceEnvelope[] {
    return this.envelopes.map((entry) => ({ ...entry }));
  }
}

export class GovernedComputeCoordinator {
  private readonly runners = new Map<string, ComputeRunner>();

  constructor(
    private readonly evidence: ComputeEvidenceJournal,
    private readonly now: () => number = () => Date.now(),
  ) {}

  registerRunner(runner: ComputeRunner): void {
    this.runners.set(runner.registration.runnerId, runner);
  }

  attempt(intent: ComputeIntent, grant?: ComputeGrant): ComputeAttemptResult {
    const deny = (reason: string, status: ComputeAttemptStatus = "DENIED"): ComputeAttemptResult => {
      const evidenceRef = this.evidence.deny(intent, grant, reason);
      return {
        status,
        correlationId: intent.correlationId,
        grantRef: grant?.grantRef,
        evidenceRef,
        reason,
        realWorldEffectOccurred: false,
      };
    };

    if (!grant) return deny("warden_compute_grant_missing", "BLOCKED_REQUIREMENT");
    if (grant.status !== "ALLOW") return deny("warden_compute_grant_denied");
    if (!grant.evidenceRequired) return deny("evidence_requirement_missing", "BLOCKED_REQUIREMENT");
    if (grant.nodeId !== intent.nodeId) return deny("grant_node_mismatch");
    if (grant.principalRef !== intent.principalRef) return deny("grant_principal_mismatch");
    if (grant.representedEntityRef !== intent.representedEntityRef) {
      return deny("grant_entity_mismatch");
    }
    if (grant.provider !== intent.provider) return deny("grant_provider_mismatch");
    if (grant.operation !== intent.operation) return deny("grant_operation_mismatch");
    if (grant.modelRef !== intent.modelRef) return deny("grant_model_mismatch");
    if (grant.runnerId !== intent.runnerId) return deny("grant_runner_mismatch");
    if (grant.wardenRef !== ALPHA_COMPUTE_IDENTITIES.wardenRef) return deny("unknown_warden");

    const issuedAt = Date.parse(grant.issuedAt);
    const expiresAt = Date.parse(grant.expiresAt);
    if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || expiresAt <= issuedAt) {
      return deny("invalid_grant_validity_window");
    }
    const now = this.now();
    if (now < issuedAt) return deny("grant_not_yet_valid");
    if (now >= expiresAt) return deny("grant_expired");

    const runner = this.runners.get(intent.runnerId);
    if (!runner) return deny("runner_not_registered", "UNAVAILABLE");
    const registration = runner.registration;
    if (registration.status !== "ENROLLED") return deny("runner_revoked", "UNAVAILABLE");
    if (!registration.attested) return deny("runner_attestation_required", "BLOCKED_REQUIREMENT");
    if (registration.nodeId !== intent.nodeId) return deny("runner_node_mismatch");
    if (registration.provider !== intent.provider) return deny("runner_provider_mismatch");

    const reservationRef = this.evidence.reserve(intent, grant);
    const result = runner.execute(intent);
    const evidenceRef = this.evidence.seal(intent, grant, result);

    return {
      status: "VERIFIED",
      correlationId: intent.correlationId,
      grantRef: grant.grantRef,
      reservationRef,
      evidenceRef,
      result,
      realWorldEffectOccurred: false,
    };
  }
}

export function makeSyntheticComputeIntent(correlationId: string): ComputeIntent {
  return {
    correlationId,
    nodeId: ALPHA_COMPUTE_IDENTITIES.nodeId,
    principalRef: ALPHA_COMPUTE_IDENTITIES.principalRef,
    representedEntityRef: ALPHA_COMPUTE_IDENTITIES.representedEntityRef,
    provider: "synthetic-cpu-proof",
    operation: "gemm",
    modelRef: ALPHA_COMPUTE_IDENTITIES.modelRef,
    runnerId: "ALPHA-SYNTHETIC-COMPUTE-RUNNER-001",
    input: {
      m: 2,
      n: 2,
      k: 2,
      a: [1, 2, 3, 4],
      b: [5, 6, 7, 8],
    },
    synthetic: true,
  };
}

export function makeSyntheticComputeGrant(
  intent: ComputeIntent,
  status: ComputeGrantStatus = "ALLOW",
): ComputeGrant {
  return {
    grantRef: `WARDEN-COMPUTE-GRANT:${intent.correlationId}`,
    wardenRef: ALPHA_COMPUTE_IDENTITIES.wardenRef,
    nodeId: intent.nodeId,
    principalRef: intent.principalRef,
    representedEntityRef: intent.representedEntityRef,
    provider: intent.provider,
    operation: intent.operation,
    modelRef: intent.modelRef,
    runnerId: intent.runnerId,
    status,
    issuedAt: "2026-08-13T06:00:00.000Z",
    expiresAt: "2026-08-13T08:00:00.000Z",
    evidenceRequired: true,
    synthetic: true,
  };
}
