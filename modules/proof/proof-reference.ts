import { createHash } from "node:crypto";

export type ProofScopeV1 = "ESTATE" | "GROUP" | "MISSION";
export type ProofIssuerV1 = "GENESIS" | "SYNNERGYZE" | "WARDEN" | "RIVEROS";

export type ProofTypeV1 =
  | "GENESIS_DEVICE_RESOLUTION"
  | "SYNNERGYZE_COMPOSITION"
  | "WARDEN_AUTHORIZATION"
  | "RIVER_RESERVATION"
  | "SYNNERGYZE_EXECUTION"
  | "SYNNERGYZE_VERIFICATION"
  | "RIVER_SEAL"
  | "RIVER_RUNTIME_COMPOSITE";

export interface ProofReferenceV1 {
  proofId: string;
  proofFrom: ProofIssuerV1;
  proofType: ProofTypeV1;
  claim: string;
  subjectRef: string;
  scope: ProofScopeV1;
  scopeRef: string;
  sourceRefs: readonly string[];
  integrityDigest: `sha256:${string}`;
  createdAt: string;
  synthetic: boolean;
  supersedesProofId?: string;
}

export interface ProofReferenceInputV1 {
  subjectRef: string;
  scope: ProofScopeV1;
  scopeRef: string;
  sourceRefs: readonly string[];
  createdAt: string;
  synthetic: boolean;
  supersedesProofId?: string;
}

interface ProofDefinitionV1 {
  issuer: ProofIssuerV1;
  issuerCode: "GEN" | "SYN" | "WAR" | "RIV";
  claimCode: "DEVICE" | "COMPOSE" | "AUTH" | "RESERVE" | "EXEC" | "VERIFY" | "SEAL" | "RUNTIME";
  claim: string;
}

const DEFINITIONS: Readonly<Record<ProofTypeV1, ProofDefinitionV1>> = {
  GENESIS_DEVICE_RESOLUTION: {
    issuer: "GENESIS",
    issuerCode: "GEN",
    claimCode: "DEVICE",
    claim: "the execution device/context was canonically resolved",
  },
  SYNNERGYZE_COMPOSITION: {
    issuer: "SYNNERGYZE",
    issuerCode: "SYN",
    claimCode: "COMPOSE",
    claim: "the governed runtime request was composed with required lineage",
  },
  WARDEN_AUTHORIZATION: {
    issuer: "WARDEN",
    issuerCode: "WAR",
    claimCode: "AUTH",
    claim: "the exact runtime request was authorized under Warden policy",
  },
  RIVER_RESERVATION: {
    issuer: "RIVEROS",
    issuerCode: "RIV",
    claimCode: "RESERVE",
    claim: "evidence capacity was reserved for the exact authorized action",
  },
  SYNNERGYZE_EXECUTION: {
    issuer: "SYNNERGYZE",
    issuerCode: "SYN",
    claimCode: "EXEC",
    claim: "the reserved authorized action passed controlled execution",
  },
  SYNNERGYZE_VERIFICATION: {
    issuer: "SYNNERGYZE",
    issuerCode: "SYN",
    claimCode: "VERIFY",
    claim: "post-execution observation produced a verified effect",
  },
  RIVER_SEAL: {
    issuer: "RIVEROS",
    issuerCode: "RIV",
    claimCode: "SEAL",
    claim: "the verified effect was bound into the River evidence seal and causal trace",
  },
  RIVER_RUNTIME_COMPOSITE: {
    issuer: "RIVEROS",
    issuerCode: "RIV",
    claimCode: "RUNTIME",
    claim: "the required controlled-runtime proofs are causally bound at the terminal River seal",
  },
};

const SCOPE_CODES: Readonly<Record<ProofScopeV1, "E" | "G" | "M">> = {
  ESTATE: "E",
  GROUP: "G",
  MISSION: "M",
};

function canonicalSourceRefs(sourceRefs: readonly string[]): readonly string[] {
  return [...new Set(sourceRefs.filter((value) => value.trim().length > 0))].sort();
}

function digestPayload(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

function canonicalPayload(
  proofType: ProofTypeV1,
  definition: ProofDefinitionV1,
  input: ProofReferenceInputV1,
): string {
  return JSON.stringify({
    proofFrom: definition.issuer,
    proofType,
    claim: definition.claim,
    subjectRef: input.subjectRef,
    scope: input.scope,
    scopeRef: input.scopeRef,
    sourceRefs: canonicalSourceRefs(input.sourceRefs),
    createdAt: input.createdAt,
    synthetic: input.synthetic,
    supersedesProofId: input.supersedesProofId ?? null,
  });
}

function buildProofReferenceV1(
  proofType: ProofTypeV1,
  input: ProofReferenceInputV1,
): ProofReferenceV1 {
  const definition = DEFINITIONS[proofType];
  const sources = canonicalSourceRefs(input.sourceRefs);
  const canonicalInput: ProofReferenceInputV1 = {
    ...input,
    sourceRefs: sources,
  };
  const hex = digestPayload(canonicalPayload(proofType, definition, canonicalInput));
  const proofId = `${SCOPE_CODES[input.scope]}-${definition.issuerCode}-${definition.claimCode}-${hex.slice(0, 8).toUpperCase()}`;

  return {
    proofId,
    proofFrom: definition.issuer,
    proofType,
    claim: definition.claim,
    subjectRef: input.subjectRef,
    scope: input.scope,
    scopeRef: input.scopeRef,
    sourceRefs: sources,
    integrityDigest: `sha256:${hex}`,
    createdAt: input.createdAt,
    synthetic: input.synthetic,
    ...(input.supersedesProofId ? { supersedesProofId: input.supersedesProofId } : {}),
  };
}

export function createGenesisDeviceProofReferenceV1(
  input: ProofReferenceInputV1,
): ProofReferenceV1 {
  return buildProofReferenceV1("GENESIS_DEVICE_RESOLUTION", input);
}

export function createSynnergyzeCompositionProofReferenceV1(
  input: ProofReferenceInputV1,
): ProofReferenceV1 {
  return buildProofReferenceV1("SYNNERGYZE_COMPOSITION", input);
}

export function createWardenAuthorizationProofReferenceV1(
  input: ProofReferenceInputV1,
): ProofReferenceV1 {
  return buildProofReferenceV1("WARDEN_AUTHORIZATION", input);
}

export function createRiverReservationProofReferenceV1(
  input: ProofReferenceInputV1,
): ProofReferenceV1 {
  return buildProofReferenceV1("RIVER_RESERVATION", input);
}

export function createSynnergyzeExecutionProofReferenceV1(
  input: ProofReferenceInputV1,
): ProofReferenceV1 {
  return buildProofReferenceV1("SYNNERGYZE_EXECUTION", input);
}

export function createSynnergyzeVerificationProofReferenceV1(
  input: ProofReferenceInputV1,
): ProofReferenceV1 {
  return buildProofReferenceV1("SYNNERGYZE_VERIFICATION", input);
}

export function createRiverSealProofReferenceV1(
  input: ProofReferenceInputV1,
): ProofReferenceV1 {
  return buildProofReferenceV1("RIVER_SEAL", input);
}

export function createRiverRuntimeCompositeProofReferenceV1(
  input: ProofReferenceInputV1,
): ProofReferenceV1 {
  return buildProofReferenceV1("RIVER_RUNTIME_COMPOSITE", input);
}

export function assertProofReferenceIntegrityV1(proof: ProofReferenceV1): void {
  const definition = DEFINITIONS[proof.proofType];
  if (proof.proofFrom !== definition.issuer) {
    throw new Error("proof_issuer_mismatch");
  }
  if (proof.claim !== definition.claim) {
    throw new Error("proof_integrity_digest_mismatch");
  }

  const expectedPrefix = `${SCOPE_CODES[proof.scope]}-${definition.issuerCode}-${definition.claimCode}-`;
  if (!proof.proofId.startsWith(expectedPrefix)) {
    throw new Error("proof_scope_prefix_mismatch");
  }

  const rebuilt = buildProofReferenceV1(proof.proofType, {
    subjectRef: proof.subjectRef,
    scope: proof.scope,
    scopeRef: proof.scopeRef,
    sourceRefs: proof.sourceRefs,
    createdAt: proof.createdAt,
    synthetic: proof.synthetic,
    supersedesProofId: proof.supersedesProofId,
  });

  if (proof.integrityDigest !== rebuilt.integrityDigest) {
    throw new Error("proof_integrity_digest_mismatch");
  }
  if (proof.proofId !== rebuilt.proofId) {
    throw new Error("proof_id_digest_mismatch");
  }
}
