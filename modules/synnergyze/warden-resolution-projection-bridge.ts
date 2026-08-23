import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";

import type {
  RegistryExceptionResolutionRevisionV1,
  RegistryProjectionAssuranceV1,
} from "./registry-resolution-projection.ts";

export interface RemedyResolutionSealSourceV1 {
  version: "REMEDY-CAUSAL-SEAL-001";
  sealRef: string;
  state: "SEALED";
  traceDigest: string;
  sealedAt: string;
  exceptionRef: string;
  reconciliationRef: string;
  proposalRef: string;
  authorizationRef: string;
  originalWardenDecisionRef: string;
  remedyWardenDecisionRef: string;
  remedyExecutionReceiptRef: string;
  remedyEffectRef: string;
  remedyVerificationRef: string;
  parentCorrelationId: string;
  remedyCorrelationId: string;
  sourceEvidenceRefs: readonly string[];
  synthetic: boolean;
}

export interface ExceptionResolutionSupersessionSourceV1 {
  version: "EXCEPTION-SUPERSESSION-001";
  supersessionRef: string;
  exceptionRef: string;
  reconciliationRef: string;
  priorState: "EXCEPTION";
  disposition:
    | "SUPERSEDED_BY_VERIFIED_RECOVERY"
    | "SUPERSEDED_BY_VERIFIED_COMPENSATION";
  proposalRef: string;
  authorizationRef: string;
  remedyEffectRef: string;
  remedyVerificationRef: string;
  riverSealRef: string;
  originalWardenDecisionRef: string;
  remedyWardenDecisionRef: string;
  parentCorrelationId: string;
  remedyCorrelationId: string;
  sourceEvidenceRefs: readonly string[];
  supersededAt: string;
  state: "RESOLVED_APPEND_ONLY";
  settlementFinality: false;
  synthetic: boolean;
}

export interface PersistedRiverResolutionPublicationV1 {
  version: "RIVER-RESOLUTION-PUBLICATION-001";
  publicationRef: string;
  exceptionRef: string;
  reconciliationRef: string;
  remedyEffectRef: string;
  remedyVerificationRef: string;
  riverRemedySealRef: string;
  exceptionSupersessionRef: string;
  traceDigest: string;
  eventRefs: readonly string[];
  eventReceiptRefs: readonly string[];
  evidenceObjectRefs: readonly string[];
  evidenceObjectReceiptRefs: readonly string[];
  recordedAt: string;
  state: "PERSISTED";
  synthetic: boolean;
}

export interface ResolutionPublicationSignatureEnvelopeV1 {
  version: "RIVER-RESOLUTION-PUBLICATION-SIGNATURE-001";
  publicationRef: string;
  traceDigest: string;
  signerRef: string;
  keyRef: string;
  algorithm: "Ed25519";
  signatureBase64: string;
  signedAt: string;
  synthetic: boolean;
}

export interface ResolutionAttestorKeyV1 {
  keyRef: string;
  signerRef: string;
  algorithm: "Ed25519";
  publicKeyPem: string;
  trustState: "TRUSTED" | "REVOKED";
  maximumAssurance: RegistryProjectionAssuranceV1;
  validFrom: string;
  validUntil: string;
  synthetic: boolean;
}

export interface ResolutionAttestorKeyResolverV1 {
  resolve(keyRef: string): Promise<ResolutionAttestorKeyV1 | undefined>;
}

export interface ResolutionProjectionPolicyV1 {
  version: "WARDEN-RESOLUTION-PROJECTION-POLICY-001";
  policyRef: string;
  minimumAssurance: RegistryProjectionAssuranceV1;
  allowedAttestorRefs: readonly string[];
  requireNonSynthetic: true;
  requireTrustedSigner: true;
  requireVerifiedSignature: true;
}

export type ResolutionProjectionBridgeResultV1 =
  | {
      state: "ELIGIBLE_REGISTRY_REVISION";
      revision: RegistryExceptionResolutionRevisionV1;
      attestationRef: string;
      signatureDigest: string;
    }
  | {
      state: "BLOCKED";
      reasonCode:
        | "RESOLUTION_PROJECTION_SYNTHETIC_CLOSURE"
        | "RESOLUTION_PROJECTION_CLOSURE_LINEAGE_MISMATCH"
        | "RESOLUTION_PROJECTION_SETTLEMENT_FINALITY_INVALID"
        | "RESOLUTION_PROJECTION_RIVER_NOT_PERSISTED"
        | "RESOLUTION_PROJECTION_RIVER_SYNTHETIC"
        | "RESOLUTION_PROJECTION_RIVER_LINEAGE_MISMATCH"
        | "RESOLUTION_PROJECTION_RIVER_PERSISTENCE_PROOF_MISSING"
        | "RESOLUTION_PROJECTION_SIGNATURE_SYNTHETIC"
        | "RESOLUTION_PROJECTION_SIGNATURE_PUBLICATION_MISMATCH"
        | "RESOLUTION_PROJECTION_SIGNATURE_TRACE_MISMATCH"
        | "RESOLUTION_PROJECTION_KEY_NOT_FOUND"
        | "RESOLUTION_PROJECTION_KEY_IDENTITY_MISMATCH"
        | "RESOLUTION_PROJECTION_KEY_REVOKED"
        | "RESOLUTION_PROJECTION_KEY_SYNTHETIC"
        | "RESOLUTION_PROJECTION_KEY_OUTSIDE_VALIDITY"
        | "RESOLUTION_PROJECTION_ATTESTOR_NOT_ALLOWED"
        | "RESOLUTION_PROJECTION_ASSURANCE_INSUFFICIENT"
        | "RESOLUTION_PROJECTION_SIGNATURE_INVALID"
        | "RESOLUTION_PROJECTION_TEMPORAL_ORDER_INVALID";
    };

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function assuranceRank(value: RegistryProjectionAssuranceV1): number {
  return Number(value.slice(1));
}

function exactStringSet(left: readonly string[], right: readonly string[]): boolean {
  const l = [...new Set(left)].sort();
  const r = [...new Set(right)].sort();
  return l.length === r.length && l.every((value, index) => value === r[index]);
}

export function canonicalResolutionPublicationMessageV1(
  publication: PersistedRiverResolutionPublicationV1,
): string {
  return stableJson({
    contract: "WARDEN-RESOLUTION-PROJECTION-BRIDGE-001",
    publicationRef: publication.publicationRef,
    exceptionRef: publication.exceptionRef,
    reconciliationRef: publication.reconciliationRef,
    remedyEffectRef: publication.remedyEffectRef,
    remedyVerificationRef: publication.remedyVerificationRef,
    riverRemedySealRef: publication.riverRemedySealRef,
    exceptionSupersessionRef: publication.exceptionSupersessionRef,
    traceDigest: publication.traceDigest,
    eventRefs: [...publication.eventRefs],
    eventReceiptRefs: [...publication.eventReceiptRefs],
    evidenceObjectRefs: [...publication.evidenceObjectRefs],
    evidenceObjectReceiptRefs: [...publication.evidenceObjectReceiptRefs],
    recordedAt: publication.recordedAt,
    state: publication.state,
  });
}

function closureLineageMatches(
  seal: RemedyResolutionSealSourceV1,
  supersession: ExceptionResolutionSupersessionSourceV1,
): boolean {
  return (
    supersession.exceptionRef === seal.exceptionRef &&
    supersession.reconciliationRef === seal.reconciliationRef &&
    supersession.proposalRef === seal.proposalRef &&
    supersession.authorizationRef === seal.authorizationRef &&
    supersession.remedyEffectRef === seal.remedyEffectRef &&
    supersession.remedyVerificationRef === seal.remedyVerificationRef &&
    supersession.riverSealRef === seal.sealRef &&
    supersession.originalWardenDecisionRef === seal.originalWardenDecisionRef &&
    supersession.remedyWardenDecisionRef === seal.remedyWardenDecisionRef &&
    supersession.parentCorrelationId === seal.parentCorrelationId &&
    supersession.remedyCorrelationId === seal.remedyCorrelationId &&
    exactStringSet(supersession.sourceEvidenceRefs, seal.sourceEvidenceRefs)
  );
}

function riverLineageMatches(
  seal: RemedyResolutionSealSourceV1,
  supersession: ExceptionResolutionSupersessionSourceV1,
  publication: PersistedRiverResolutionPublicationV1,
): boolean {
  return (
    publication.exceptionRef === seal.exceptionRef &&
    publication.reconciliationRef === seal.reconciliationRef &&
    publication.remedyEffectRef === seal.remedyEffectRef &&
    publication.remedyVerificationRef === seal.remedyVerificationRef &&
    publication.riverRemedySealRef === seal.sealRef &&
    publication.exceptionSupersessionRef === supersession.supersessionRef
  );
}

export class WardenResolutionProjectionBridgeV1 {
  constructor(private readonly keys: ResolutionAttestorKeyResolverV1) {}

  async compile(input: {
    seal: RemedyResolutionSealSourceV1;
    supersession: ExceptionResolutionSupersessionSourceV1;
    publication: PersistedRiverResolutionPublicationV1;
    signature: ResolutionPublicationSignatureEnvelopeV1;
    policy: ResolutionProjectionPolicyV1;
    eligibleAt: string;
    predecessorRegistryRevisionRef?: string;
  }): Promise<ResolutionProjectionBridgeResultV1> {
    const { seal, supersession, publication, signature, policy, eligibleAt } = input;

    if (
      policy.requireNonSynthetic &&
      (seal.synthetic || supersession.synthetic)
    ) {
      return { state: "BLOCKED", reasonCode: "RESOLUTION_PROJECTION_SYNTHETIC_CLOSURE" };
    }
    if (
      seal.state !== "SEALED" ||
      supersession.state !== "RESOLVED_APPEND_ONLY" ||
      !closureLineageMatches(seal, supersession)
    ) {
      return { state: "BLOCKED", reasonCode: "RESOLUTION_PROJECTION_CLOSURE_LINEAGE_MISMATCH" };
    }
    if (supersession.settlementFinality !== false) {
      return { state: "BLOCKED", reasonCode: "RESOLUTION_PROJECTION_SETTLEMENT_FINALITY_INVALID" };
    }
    if (publication.state !== "PERSISTED") {
      return { state: "BLOCKED", reasonCode: "RESOLUTION_PROJECTION_RIVER_NOT_PERSISTED" };
    }
    if (policy.requireNonSynthetic && publication.synthetic) {
      return { state: "BLOCKED", reasonCode: "RESOLUTION_PROJECTION_RIVER_SYNTHETIC" };
    }
    if (!riverLineageMatches(seal, supersession, publication)) {
      return { state: "BLOCKED", reasonCode: "RESOLUTION_PROJECTION_RIVER_LINEAGE_MISMATCH" };
    }
    if (
      publication.eventRefs.length === 0 ||
      publication.evidenceObjectRefs.length === 0 ||
      publication.eventRefs.length !== publication.eventReceiptRefs.length ||
      publication.evidenceObjectRefs.length !== publication.evidenceObjectReceiptRefs.length
    ) {
      return {
        state: "BLOCKED",
        reasonCode: "RESOLUTION_PROJECTION_RIVER_PERSISTENCE_PROOF_MISSING",
      };
    }
    if (policy.requireNonSynthetic && signature.synthetic) {
      return { state: "BLOCKED", reasonCode: "RESOLUTION_PROJECTION_SIGNATURE_SYNTHETIC" };
    }
    if (signature.publicationRef !== publication.publicationRef) {
      return {
        state: "BLOCKED",
        reasonCode: "RESOLUTION_PROJECTION_SIGNATURE_PUBLICATION_MISMATCH",
      };
    }
    if (signature.traceDigest !== publication.traceDigest) {
      return { state: "BLOCKED", reasonCode: "RESOLUTION_PROJECTION_SIGNATURE_TRACE_MISMATCH" };
    }

    const key = await this.keys.resolve(signature.keyRef);
    if (!key) {
      return { state: "BLOCKED", reasonCode: "RESOLUTION_PROJECTION_KEY_NOT_FOUND" };
    }
    if (
      key.algorithm !== signature.algorithm ||
      key.keyRef !== signature.keyRef ||
      key.signerRef !== signature.signerRef
    ) {
      return { state: "BLOCKED", reasonCode: "RESOLUTION_PROJECTION_KEY_IDENTITY_MISMATCH" };
    }
    if (policy.requireTrustedSigner && key.trustState !== "TRUSTED") {
      return { state: "BLOCKED", reasonCode: "RESOLUTION_PROJECTION_KEY_REVOKED" };
    }
    if (policy.requireNonSynthetic && key.synthetic) {
      return { state: "BLOCKED", reasonCode: "RESOLUTION_PROJECTION_KEY_SYNTHETIC" };
    }
    if (!policy.allowedAttestorRefs.includes(key.signerRef)) {
      return { state: "BLOCKED", reasonCode: "RESOLUTION_PROJECTION_ATTESTOR_NOT_ALLOWED" };
    }
    if (assuranceRank(key.maximumAssurance) < assuranceRank(policy.minimumAssurance)) {
      return { state: "BLOCKED", reasonCode: "RESOLUTION_PROJECTION_ASSURANCE_INSUFFICIENT" };
    }

    const sealedAtMs = parseInstant(seal.sealedAt);
    const supersededAtMs = parseInstant(supersession.supersededAt);
    const recordedAtMs = parseInstant(publication.recordedAt);
    const signedAtMs = parseInstant(signature.signedAt);
    const eligibleAtMs = parseInstant(eligibleAt);
    const validFromMs = parseInstant(key.validFrom);
    const validUntilMs = parseInstant(key.validUntil);
    if (
      sealedAtMs === null ||
      supersededAtMs === null ||
      recordedAtMs === null ||
      signedAtMs === null ||
      eligibleAtMs === null ||
      validFromMs === null ||
      validUntilMs === null ||
      supersededAtMs < sealedAtMs ||
      recordedAtMs < supersededAtMs ||
      signedAtMs < recordedAtMs ||
      eligibleAtMs < signedAtMs
    ) {
      return { state: "BLOCKED", reasonCode: "RESOLUTION_PROJECTION_TEMPORAL_ORDER_INVALID" };
    }
    if (signedAtMs < validFromMs || signedAtMs > validUntilMs) {
      return { state: "BLOCKED", reasonCode: "RESOLUTION_PROJECTION_KEY_OUTSIDE_VALIDITY" };
    }

    let signatureVerified = false;
    try {
      signatureVerified = verifySignature(
        null,
        Buffer.from(canonicalResolutionPublicationMessageV1(publication), "utf8"),
        createPublicKey(key.publicKeyPem),
        Buffer.from(signature.signatureBase64, "base64"),
      );
    } catch {
      signatureVerified = false;
    }
    if (policy.requireVerifiedSignature && !signatureVerified) {
      return { state: "BLOCKED", reasonCode: "RESOLUTION_PROJECTION_SIGNATURE_INVALID" };
    }

    const signatureDigest = `sha256:${sha256(signature.signatureBase64)}`;
    const attestationRef = `RIVER-RESOLUTION-ATTESTATION:${sha256(stableJson({
      publicationRef: publication.publicationRef,
      traceDigest: publication.traceDigest,
      signerRef: key.signerRef,
      keyRef: key.keyRef,
      signatureDigest,
      assurance: key.maximumAssurance,
      policyRef: policy.policyRef,
    })).slice(0, 24)}`;
    const registryObjectRef = `WARDEN-EXCEPTION-RESOLUTION:${seal.exceptionRef}`;
    const revisionIdentity = stableJson({
      registryObjectRef,
      predecessorRegistryRevisionRef: input.predecessorRegistryRevisionRef ?? null,
      publicationRef: publication.publicationRef,
      traceDigest: publication.traceDigest,
      attestationRef,
      policyRef: policy.policyRef,
    });
    const registryRevisionRef = `REGISTRY-REVISION:WARDEN-EXCEPTION-RESOLUTION:${sha256(
      revisionIdentity,
    ).slice(0, 24)}`;
    const projectionRef = `REGISTRY-PROJECTION:WARDEN-EXCEPTION-RESOLUTION:${sha256(
      `${registryRevisionRef}|${attestationRef}`,
    ).slice(0, 24)}`;

    const revision: RegistryExceptionResolutionRevisionV1 = {
      version: "REGISTRY-EXCEPTION-RESOLUTION-REVISION-001",
      projectionRef,
      registryObjectRef,
      registryRevisionRef,
      ...(input.predecessorRegistryRevisionRef
        ? { predecessorRegistryRevisionRef: input.predecessorRegistryRevisionRef }
        : {}),
      originalExceptionRef: seal.exceptionRef,
      assessmentRef: seal.reconciliationRef,
      disposition: supersession.disposition,
      remedyEffectRef: seal.remedyEffectRef,
      remedyVerificationRef: seal.remedyVerificationRef,
      riverRemedySealRef: seal.sealRef,
      riverPublicationRef: publication.publicationRef,
      riverTraceDigest: publication.traceDigest,
      attestationRef,
      attestorRef: key.signerRef,
      assurance: key.maximumAssurance,
      projectionPolicyRef: policy.policyRef,
      eligibleAt,
      registryWriteEligible: true,
      state: "ELIGIBLE_FOR_REGISTRY_WRITE",
      synthetic: false,
    };

    return {
      state: "ELIGIBLE_REGISTRY_REVISION",
      revision,
      attestationRef,
      signatureDigest,
    };
  }
}
