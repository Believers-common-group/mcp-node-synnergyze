import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";

export type RiverAttestationAssuranceV1 = "A0" | "A1" | "A2" | "A3" | "A4";

export interface AttestableRiverPublicationV1 {
  version: "RIVER-CAUSAL-PUBLICATION-001";
  publicationRef: string;
  originalExceptionRef: string;
  assessmentRef: string;
  remedyEffectRef: string;
  riverRemedySealRef: string;
  exceptionSupersessionRef: string;
  eventRefs: readonly string[];
  eventReceiptRefs: readonly string[];
  evidenceObjectRefs: readonly string[];
  traceDigest: string;
  recordedAt: string;
  signatureState: "UNSIGNED_SYNTHETIC" | "UNSIGNED_PRODUCTION" | "SIGNED_VERIFIED";
  state: "PUBLISHED";
  synthetic: boolean;
}

export interface RiverPublicationSignatureEnvelopeV1 {
  version: "RIVER-PUBLICATION-SIGNATURE-001";
  publicationRef: string;
  traceDigest: string;
  signerRef: string;
  keyRef: string;
  algorithm: "Ed25519";
  signatureBase64: string;
  signedAt: string;
  synthetic: boolean;
}

export interface TrustedAttestorKeyV1 {
  keyRef: string;
  signerRef: string;
  algorithm: "Ed25519";
  publicKeyPem: string;
  trustState: "TRUSTED" | "REVOKED";
  maximumAssurance: Exclude<RiverAttestationAssuranceV1, "A0">;
  validFrom: string;
  validUntil: string;
  synthetic: boolean;
}

export interface TrustedAttestorKeyResolverV1 {
  resolve(keyRef: string): Promise<TrustedAttestorKeyV1 | undefined>;
}

export interface SignedRiverPublicationAttestationV1 {
  schema_version: "attestation-result.v1";
  attestation_id: string;
  source_event_id: string;
  result: "ACCEPT";
  resulting_assurance: RiverAttestationAssuranceV1;
  evaluated_at: string;
  reason_codes: readonly string[];
  publicationRef: string;
  traceDigest: string;
  signerRef: string;
  keyRef: string;
  signatureAlgorithm: "Ed25519";
  signatureDigest: string;
  signedAt: string;
  signatureVerified: true;
  signerTrusted: true;
  synthetic: boolean;
}

export interface RejectedRiverPublicationAttestationV1 {
  schema_version: "attestation-result.v1";
  attestation_id: string;
  source_event_id: string;
  result: "REJECT";
  evaluated_at: string;
  reason_codes: readonly string[];
  publicationRef: string;
  traceDigest: string;
  signerRef: string;
  keyRef: string;
  signatureAlgorithm: "Ed25519";
  signatureDigest: string;
  signedAt: string;
  signatureVerified: boolean;
  signerTrusted: boolean;
  synthetic: boolean;
}

export type RiverPublicationAttestationResultV1 =
  | SignedRiverPublicationAttestationV1
  | RejectedRiverPublicationAttestationV1;

function digest(value: string): string {
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

function signatureDigest(signatureBase64: string): string {
  return `sha256:${digest(signatureBase64)}`;
}

export function canonicalRiverPublicationAttestationMessageV1(
  publication: AttestableRiverPublicationV1,
): string {
  return stableJson({
    contract: "RIVER-PUBLICATION-ATTESTATION-MESSAGE-001",
    publicationRef: publication.publicationRef,
    originalExceptionRef: publication.originalExceptionRef,
    assessmentRef: publication.assessmentRef,
    remedyEffectRef: publication.remedyEffectRef,
    riverRemedySealRef: publication.riverRemedySealRef,
    exceptionSupersessionRef: publication.exceptionSupersessionRef,
    eventRefs: [...publication.eventRefs],
    eventReceiptRefs: [...publication.eventReceiptRefs],
    evidenceObjectRefs: [...publication.evidenceObjectRefs],
    traceDigest: publication.traceDigest,
    recordedAt: publication.recordedAt,
  });
}

function rejected(input: {
  publication: AttestableRiverPublicationV1;
  signature: RiverPublicationSignatureEnvelopeV1;
  evaluatedAt: string;
  reasonCodes: readonly string[];
  signatureVerified?: boolean;
  signerTrusted?: boolean;
  synthetic?: boolean;
}): RejectedRiverPublicationAttestationV1 {
  const firstEventRef = input.publication.eventRefs[0] ?? `RIVER-PUBLICATION:${input.publication.publicationRef}`;
  const normalizedReasons = [...new Set(input.reasonCodes)].sort();
  return {
    schema_version: "attestation-result.v1",
    attestation_id: `RIVER-ATTESTATION-REJECTED:${digest(stableJson({
      publicationRef: input.publication.publicationRef,
      traceDigest: input.publication.traceDigest,
      signerRef: input.signature.signerRef,
      keyRef: input.signature.keyRef,
      signatureDigest: signatureDigest(input.signature.signatureBase64),
      normalizedReasons,
    })).slice(0, 24)}`,
    source_event_id: firstEventRef,
    result: "REJECT",
    evaluated_at: input.evaluatedAt,
    reason_codes: normalizedReasons,
    publicationRef: input.publication.publicationRef,
    traceDigest: input.publication.traceDigest,
    signerRef: input.signature.signerRef,
    keyRef: input.signature.keyRef,
    signatureAlgorithm: input.signature.algorithm,
    signatureDigest: signatureDigest(input.signature.signatureBase64),
    signedAt: input.signature.signedAt,
    signatureVerified: input.signatureVerified ?? false,
    signerTrusted: input.signerTrusted ?? false,
    synthetic: input.synthetic ?? true,
  };
}

export class NodeEd25519RiverPublicationAttestorV1 {
  constructor(private readonly keys: TrustedAttestorKeyResolverV1) {}

  async verify(input: {
    publication: AttestableRiverPublicationV1;
    signature: RiverPublicationSignatureEnvelopeV1;
    evaluatedAt: string;
  }): Promise<RiverPublicationAttestationResultV1> {
    const { publication, signature, evaluatedAt } = input;
    const evaluatedAtMs = parseInstant(evaluatedAt);
    const recordedAtMs = parseInstant(publication.recordedAt);
    const signedAtMs = parseInstant(signature.signedAt);
    if (evaluatedAtMs === null || recordedAtMs === null || signedAtMs === null) {
      return rejected({
        publication,
        signature,
        evaluatedAt,
        reasonCodes: ["ATTESTATION_INVALID_TIME"],
      });
    }
    if (signature.publicationRef !== publication.publicationRef) {
      return rejected({
        publication,
        signature,
        evaluatedAt,
        reasonCodes: ["ATTESTATION_PUBLICATION_MISMATCH"],
      });
    }
    if (signature.traceDigest !== publication.traceDigest) {
      return rejected({
        publication,
        signature,
        evaluatedAt,
        reasonCodes: ["ATTESTATION_TRACE_DIGEST_MISMATCH"],
      });
    }
    if (signature.algorithm !== "Ed25519") {
      return rejected({
        publication,
        signature,
        evaluatedAt,
        reasonCodes: ["ATTESTATION_ALGORITHM_UNSUPPORTED"],
      });
    }
    if (signedAtMs < recordedAtMs || evaluatedAtMs < signedAtMs) {
      return rejected({
        publication,
        signature,
        evaluatedAt,
        reasonCodes: ["ATTESTATION_TEMPORAL_ORDER_INVALID"],
      });
    }

    const key = await this.keys.resolve(signature.keyRef);
    if (!key) {
      return rejected({
        publication,
        signature,
        evaluatedAt,
        reasonCodes: ["ATTESTATION_KEY_NOT_FOUND"],
      });
    }
    const synthetic = publication.synthetic || signature.synthetic || key.synthetic;
    if (
      key.algorithm !== signature.algorithm ||
      key.signerRef !== signature.signerRef
    ) {
      return rejected({
        publication,
        signature,
        evaluatedAt,
        reasonCodes: ["ATTESTATION_KEY_IDENTITY_MISMATCH"],
        synthetic,
      });
    }
    if (key.trustState !== "TRUSTED") {
      return rejected({
        publication,
        signature,
        evaluatedAt,
        reasonCodes: ["ATTESTATION_SIGNER_REVOKED"],
        signerTrusted: false,
        synthetic,
      });
    }
    const validFrom = parseInstant(key.validFrom);
    const validUntil = parseInstant(key.validUntil);
    if (validFrom === null || validUntil === null || signedAtMs < validFrom || signedAtMs > validUntil) {
      return rejected({
        publication,
        signature,
        evaluatedAt,
        reasonCodes: ["ATTESTATION_KEY_OUTSIDE_VALIDITY_WINDOW"],
        signerTrusted: true,
        synthetic,
      });
    }

    let verified = false;
    try {
      const publicKey = createPublicKey(key.publicKeyPem);
      verified = verifySignature(
        null,
        Buffer.from(canonicalRiverPublicationAttestationMessageV1(publication), "utf8"),
        publicKey,
        Buffer.from(signature.signatureBase64, "base64"),
      );
    } catch {
      verified = false;
    }
    if (!verified) {
      return rejected({
        publication,
        signature,
        evaluatedAt,
        reasonCodes: ["ATTESTATION_SIGNATURE_INVALID"],
        signerTrusted: true,
        synthetic,
      });
    }

    const firstEventRef = publication.eventRefs[0] ?? `RIVER-PUBLICATION:${publication.publicationRef}`;
    const result: SignedRiverPublicationAttestationV1 = {
      schema_version: "attestation-result.v1",
      attestation_id: `RIVER-ATTESTATION:${digest(stableJson({
        publicationRef: publication.publicationRef,
        traceDigest: publication.traceDigest,
        signerRef: signature.signerRef,
        keyRef: signature.keyRef,
        signatureDigest: signatureDigest(signature.signatureBase64),
        assurance: key.maximumAssurance,
      })).slice(0, 24)}`,
      source_event_id: firstEventRef,
      result: "ACCEPT",
      resulting_assurance: key.maximumAssurance,
      evaluated_at: evaluatedAt,
      reason_codes: ["SIGNATURE_VERIFIED", "SIGNER_TRUSTED"],
      publicationRef: publication.publicationRef,
      traceDigest: publication.traceDigest,
      signerRef: signature.signerRef,
      keyRef: signature.keyRef,
      signatureAlgorithm: signature.algorithm,
      signatureDigest: signatureDigest(signature.signatureBase64),
      signedAt: signature.signedAt,
      signatureVerified: true,
      signerTrusted: true,
      synthetic,
    };
    return result;
  }
}
