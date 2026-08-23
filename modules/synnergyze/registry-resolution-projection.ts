import { createHash } from "node:crypto";

import type { SignedRiverPublicationAttestationV1 } from "./river-publication-attestation.ts";

export type RegistryProjectionAssuranceV1 = "A0" | "A1" | "A2" | "A3" | "A4";

export interface RegistryExceptionResolutionProjectionIntentV1 {
  version: "REGISTRY-EXCEPTION-RESOLUTION-PROJECTION-001";
  projectionRef: string;
  registryObjectRef: string;
  registryRevisionRef: string;
  originalExceptionRef: string;
  assessmentRef: string;
  disposition: "SUPERSEDED_BY_VERIFIED_RECOVERY" | "SUPERSEDED_BY_VERIFIED_COMPENSATION";
  remedyEffectRef: string;
  remedyVerificationRef: string;
  riverRemedySealRef: string;
  riverPublicationRef: string;
  riverTraceDigest: string;
  riverEventRefs: readonly string[];
  riverEvidenceObjectRefs: readonly string[];
  sourceEvidenceRefs: readonly string[];
  generatedAt: string;
  synthetic: boolean;
}

export interface RegistryProjectionPolicyV1 {
  version: "REGISTRY-PROJECTION-POLICY-001";
  policyRef: string;
  minimumAssurance: Exclude<RegistryProjectionAssuranceV1, "A0">;
  requireNonSynthetic: true;
  requireVerifiedSignature: true;
  requireTrustedSigner: true;
  allowedAttestorRefs: readonly string[];
}

export interface RegistryExceptionResolutionProjectionV1
  extends RegistryExceptionResolutionProjectionIntentV1 {
  version: "REGISTRY-EXCEPTION-RESOLUTION-PROJECTION-001";
  attestationRef: string;
  attestorRef: string;
  assurance: RegistryProjectionAssuranceV1;
  projectionPolicyRef: string;
  eligibleAt: string;
  registryWriteEligible: true;
  state: "ELIGIBLE_FOR_REGISTRY_WRITE";
  synthetic: false;
}

export type RegistryProjectionEligibilityResultV1 =
  | {
      state: "ELIGIBLE";
      projection: RegistryExceptionResolutionProjectionV1;
    }
  | {
      state: "BLOCKED";
      reasonCode:
        | "REGISTRY_PROJECTION_SYNTHETIC_INPUT"
        | "REGISTRY_PROJECTION_ATTESTATION_REJECTED"
        | "REGISTRY_PROJECTION_ATTESTATION_SYNTHETIC"
        | "REGISTRY_PROJECTION_SIGNATURE_NOT_VERIFIED"
        | "REGISTRY_PROJECTION_SIGNER_NOT_TRUSTED"
        | "REGISTRY_PROJECTION_ATTESTOR_NOT_ALLOWED"
        | "REGISTRY_PROJECTION_ASSURANCE_INSUFFICIENT"
        | "REGISTRY_PROJECTION_PUBLICATION_MISMATCH"
        | "REGISTRY_PROJECTION_TRACE_MISMATCH"
        | "REGISTRY_PROJECTION_INVALID_TIME";
    };

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assuranceRank(level: RegistryProjectionAssuranceV1): number {
  return Number(level.slice(1));
}

function parseInstant(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function evaluateRegistryProjectionEligibilityV1(input: {
  intent: RegistryExceptionResolutionProjectionIntentV1;
  attestation: SignedRiverPublicationAttestationV1;
  policy: RegistryProjectionPolicyV1;
  eligibleAt: string;
}): RegistryProjectionEligibilityResultV1 {
  const { intent, attestation, policy, eligibleAt } = input;

  if (intent.synthetic && policy.requireNonSynthetic) {
    return { state: "BLOCKED", reasonCode: "REGISTRY_PROJECTION_SYNTHETIC_INPUT" };
  }
  if (attestation.result !== "ACCEPT") {
    return { state: "BLOCKED", reasonCode: "REGISTRY_PROJECTION_ATTESTATION_REJECTED" };
  }
  if (attestation.synthetic && policy.requireNonSynthetic) {
    return { state: "BLOCKED", reasonCode: "REGISTRY_PROJECTION_ATTESTATION_SYNTHETIC" };
  }
  if (!attestation.signatureVerified && policy.requireVerifiedSignature) {
    return { state: "BLOCKED", reasonCode: "REGISTRY_PROJECTION_SIGNATURE_NOT_VERIFIED" };
  }
  if (!attestation.signerTrusted && policy.requireTrustedSigner) {
    return { state: "BLOCKED", reasonCode: "REGISTRY_PROJECTION_SIGNER_NOT_TRUSTED" };
  }
  if (!policy.allowedAttestorRefs.includes(attestation.signerRef)) {
    return { state: "BLOCKED", reasonCode: "REGISTRY_PROJECTION_ATTESTOR_NOT_ALLOWED" };
  }
  if (assuranceRank(attestation.resulting_assurance) < assuranceRank(policy.minimumAssurance)) {
    return { state: "BLOCKED", reasonCode: "REGISTRY_PROJECTION_ASSURANCE_INSUFFICIENT" };
  }
  if (attestation.publicationRef !== intent.riverPublicationRef) {
    return { state: "BLOCKED", reasonCode: "REGISTRY_PROJECTION_PUBLICATION_MISMATCH" };
  }
  if (attestation.traceDigest !== intent.riverTraceDigest) {
    return { state: "BLOCKED", reasonCode: "REGISTRY_PROJECTION_TRACE_MISMATCH" };
  }

  const eligibleAtMs = parseInstant(eligibleAt);
  const generatedAtMs = parseInstant(intent.generatedAt);
  const attestedAtMs = parseInstant(attestation.evaluated_at);
  if (
    eligibleAtMs === null ||
    generatedAtMs === null ||
    attestedAtMs === null ||
    attestedAtMs < generatedAtMs ||
    eligibleAtMs < attestedAtMs
  ) {
    return { state: "BLOCKED", reasonCode: "REGISTRY_PROJECTION_INVALID_TIME" };
  }

  const projection: RegistryExceptionResolutionProjectionV1 = {
    ...intent,
    projectionRef: `REGISTRY-PROJECTION:${digest(
      `${intent.registryRevisionRef}|${attestation.attestation_id}|${policy.policyRef}`,
    ).slice(0, 24)}`,
    attestationRef: attestation.attestation_id,
    attestorRef: attestation.signerRef,
    assurance: attestation.resulting_assurance,
    projectionPolicyRef: policy.policyRef,
    eligibleAt,
    registryWriteEligible: true,
    state: "ELIGIBLE_FOR_REGISTRY_WRITE",
    synthetic: false,
  };
  return { state: "ELIGIBLE", projection };
}
