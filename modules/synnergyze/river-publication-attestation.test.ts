import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  NodeEd25519RiverPublicationAttestorV1,
  canonicalRiverPublicationAttestationMessageV1,
  type AttestableRiverPublicationV1,
  type RiverPublicationSignatureEnvelopeV1,
  type TrustedAttestorKeyResolverV1,
  type TrustedAttestorKeyV1,
} from "./river-publication-attestation.ts";
import {
  evaluateRegistryProjectionEligibilityV1,
  type RegistryExceptionResolutionProjectionIntentV1,
  type RegistryProjectionPolicyV1,
} from "./registry-resolution-projection.ts";

function publication(overrides: Partial<AttestableRiverPublicationV1> = {}): AttestableRiverPublicationV1 {
  return {
    version: "RIVER-CAUSAL-PUBLICATION-001",
    publicationRef: "RIVER-CAUSAL-PUBLICATION:001",
    originalExceptionRef: "EXCEPTION:001",
    assessmentRef: "ASSESSMENT:001",
    remedyEffectRef: "REMEDY-EFFECT:001",
    riverRemedySealRef: "RIVER-REMEDY-SEAL:001",
    exceptionSupersessionRef: "EXCEPTION-SUPERSESSION:001",
    eventRefs: ["RIVER-EVENT:001", "RIVER-EVENT:002"],
    eventReceiptRefs: ["RIVER-EVENT-RECEIPT:001", "RIVER-EVENT-RECEIPT:002"],
    evidenceObjectRefs: ["RIVER-EVIDENCE-OBJECT:001"],
    traceDigest: "sha256:trace-001",
    recordedAt: "2026-08-23T06:10:00.000Z",
    signatureState: "UNSIGNED_PRODUCTION",
    state: "PUBLISHED",
    synthetic: false,
    ...overrides,
  };
}

function intent(
  sourcePublication = publication(),
  overrides: Partial<RegistryExceptionResolutionProjectionIntentV1> = {},
): RegistryExceptionResolutionProjectionIntentV1 {
  return {
    version: "REGISTRY-EXCEPTION-RESOLUTION-PROJECTION-001",
    projectionRef: "REGISTRY-PROJECTION-CANDIDATE:001",
    registryObjectRef: "WARDEN-EXCEPTION-RESOLUTION:EXCEPTION:001",
    registryRevisionRef: "REGISTRY-REVISION:WARDEN-EXCEPTION-RESOLUTION:001",
    originalExceptionRef: sourcePublication.originalExceptionRef,
    assessmentRef: sourcePublication.assessmentRef,
    disposition: "SUPERSEDED_BY_VERIFIED_RECOVERY",
    remedyEffectRef: sourcePublication.remedyEffectRef,
    remedyVerificationRef: "REMEDY-VERIFICATION:001",
    riverRemedySealRef: sourcePublication.riverRemedySealRef,
    riverPublicationRef: sourcePublication.publicationRef,
    riverTraceDigest: sourcePublication.traceDigest,
    riverEventRefs: [...sourcePublication.eventRefs],
    riverEvidenceObjectRefs: [...sourcePublication.evidenceObjectRefs],
    sourceEvidenceRefs: ["EVIDENCE:001"],
    generatedAt: sourcePublication.recordedAt,
    synthetic: false,
    ...overrides,
  };
}

function policy(overrides: Partial<RegistryProjectionPolicyV1> = {}): RegistryProjectionPolicyV1 {
  return {
    version: "REGISTRY-PROJECTION-POLICY-001",
    policyRef: "REGISTRY-PROJECTION-POLICY:001",
    minimumAssurance: "A2",
    requireNonSynthetic: true,
    requireVerifiedSignature: true,
    requireTrustedSigner: true,
    allowedAttestorRefs: ["RIVER-ATTESTOR:001"],
    ...overrides,
  };
}

function signingFixture(input: {
  sourcePublication?: AttestableRiverPublicationV1;
  syntheticKey?: boolean;
  maximumAssurance?: TrustedAttestorKeyV1["maximumAssurance"];
  trustState?: TrustedAttestorKeyV1["trustState"];
}) {
  const sourcePublication = input.sourcePublication ?? publication();
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const key: TrustedAttestorKeyV1 = {
    keyRef: "RIVER-KEY:001",
    signerRef: "RIVER-ATTESTOR:001",
    algorithm: "Ed25519",
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    trustState: input.trustState ?? "TRUSTED",
    maximumAssurance: input.maximumAssurance ?? "A3",
    validFrom: "2026-08-23T06:00:00.000Z",
    validUntil: "2026-08-23T07:00:00.000Z",
    synthetic: input.syntheticKey ?? false,
  };
  const signatureBase64 = sign(
    null,
    Buffer.from(canonicalRiverPublicationAttestationMessageV1(sourcePublication), "utf8"),
    privateKey,
  ).toString("base64");
  const signature: RiverPublicationSignatureEnvelopeV1 = {
    version: "RIVER-PUBLICATION-SIGNATURE-001",
    publicationRef: sourcePublication.publicationRef,
    traceDigest: sourcePublication.traceDigest,
    signerRef: key.signerRef,
    keyRef: key.keyRef,
    algorithm: "Ed25519",
    signatureBase64,
    signedAt: "2026-08-23T06:10:01.000Z",
    synthetic: false,
  };
  const resolver: TrustedAttestorKeyResolverV1 = {
    async resolve(keyRef) {
      return keyRef === key.keyRef ? key : undefined;
    },
  };
  return { sourcePublication, key, signature, resolver };
}

describe("River publication attestation and Registry projection gate", () => {
  it("verifies Ed25519 over the exact River publication trace and unlocks a non-synthetic A3 projection", async () => {
    const fixture = signingFixture({});
    const attestation = await new NodeEd25519RiverPublicationAttestorV1(fixture.resolver).verify({
      publication: fixture.sourcePublication,
      signature: fixture.signature,
      evaluatedAt: "2026-08-23T06:10:02.000Z",
    });

    expect(attestation).toMatchObject({
      schema_version: "attestation-result.v1",
      result: "ACCEPT",
      resulting_assurance: "A3",
      signatureVerified: true,
      signerTrusted: true,
      synthetic: false,
    });

    const eligibility = evaluateRegistryProjectionEligibilityV1({
      intent: intent(fixture.sourcePublication),
      attestation,
      policy: policy(),
      eligibleAt: "2026-08-23T06:10:03.000Z",
    });
    expect(eligibility.state).toBe("ELIGIBLE");
    if (eligibility.state !== "ELIGIBLE") throw new Error("expected_registry_eligibility");
    expect(eligibility.projection).toMatchObject({
      assurance: "A3",
      attestorRef: "RIVER-ATTESTOR:001",
      registryWriteEligible: true,
      state: "ELIGIBLE_FOR_REGISTRY_WRITE",
      synthetic: false,
    });
  });

  it("does not let a valid signature on synthetic evidence cross the Registry boundary", async () => {
    const syntheticPublication = publication({
      signatureState: "UNSIGNED_SYNTHETIC",
      synthetic: true,
    });
    const fixture = signingFixture({ sourcePublication: syntheticPublication });
    const attestation = await new NodeEd25519RiverPublicationAttestorV1(fixture.resolver).verify({
      publication: syntheticPublication,
      signature: fixture.signature,
      evaluatedAt: "2026-08-23T06:10:02.000Z",
    });
    expect(attestation).toMatchObject({ result: "ACCEPT", signatureVerified: true, synthetic: true });

    const eligibility = evaluateRegistryProjectionEligibilityV1({
      intent: intent(syntheticPublication, { synthetic: false }),
      attestation,
      policy: policy(),
      eligibleAt: "2026-08-23T06:10:03.000Z",
    });
    expect(eligibility).toEqual({
      state: "BLOCKED",
      reasonCode: "REGISTRY_PROJECTION_ATTESTATION_SYNTHETIC",
    });
  });

  it("rejects a tampered signature and never promotes the resulting rejected attestation", async () => {
    const fixture = signingFixture({});
    const tampered: RiverPublicationSignatureEnvelopeV1 = {
      ...fixture.signature,
      signatureBase64: Buffer.from("not-the-signature", "utf8").toString("base64"),
    };
    const attestation = await new NodeEd25519RiverPublicationAttestorV1(fixture.resolver).verify({
      publication: fixture.sourcePublication,
      signature: tampered,
      evaluatedAt: "2026-08-23T06:10:02.000Z",
    });
    expect(attestation).toMatchObject({
      result: "REJECT",
      signatureVerified: false,
      signerTrusted: true,
      reason_codes: ["ATTESTATION_SIGNATURE_INVALID"],
    });

    expect(evaluateRegistryProjectionEligibilityV1({
      intent: intent(fixture.sourcePublication),
      attestation,
      policy: policy(),
      eligibleAt: "2026-08-23T06:10:03.000Z",
    })).toEqual({ state: "BLOCKED", reasonCode: "REGISTRY_PROJECTION_ATTESTATION_REJECTED" });
  });

  it("blocks a valid trusted signature when its attested assurance is below policy", async () => {
    const fixture = signingFixture({ maximumAssurance: "A1" });
    const attestation = await new NodeEd25519RiverPublicationAttestorV1(fixture.resolver).verify({
      publication: fixture.sourcePublication,
      signature: fixture.signature,
      evaluatedAt: "2026-08-23T06:10:02.000Z",
    });
    expect(attestation).toMatchObject({ result: "ACCEPT", resulting_assurance: "A1" });
    expect(evaluateRegistryProjectionEligibilityV1({
      intent: intent(fixture.sourcePublication),
      attestation,
      policy: policy({ minimumAssurance: "A2" }),
      eligibleAt: "2026-08-23T06:10:03.000Z",
    })).toEqual({ state: "BLOCKED", reasonCode: "REGISTRY_PROJECTION_ASSURANCE_INSUFFICIENT" });
  });

  it("rejects a revoked attestor key before signature trust can promote evidence", async () => {
    const fixture = signingFixture({ trustState: "REVOKED" });
    const attestation = await new NodeEd25519RiverPublicationAttestorV1(fixture.resolver).verify({
      publication: fixture.sourcePublication,
      signature: fixture.signature,
      evaluatedAt: "2026-08-23T06:10:02.000Z",
    });
    expect(attestation).toMatchObject({
      result: "REJECT",
      signerTrusted: false,
      reason_codes: ["ATTESTATION_SIGNER_REVOKED"],
    });
  });
});
