import { generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  WardenResolutionProjectionBridgeV1,
  canonicalResolutionPublicationMessageV1,
  type ExceptionResolutionSupersessionSourceV1,
  type PersistedRiverResolutionPublicationV1,
  type RemedyResolutionSealSourceV1,
  type ResolutionAttestorKeyResolverV1,
  type ResolutionAttestorKeyV1,
  type ResolutionProjectionPolicyV1,
  type ResolutionPublicationSignatureEnvelopeV1,
} from "./warden-resolution-projection-bridge.ts";

function seal(overrides: Partial<RemedyResolutionSealSourceV1> = {}): RemedyResolutionSealSourceV1 {
  return {
    version: "REMEDY-CAUSAL-SEAL-001",
    sealRef: "RIVER-REMEDY-SEAL:001",
    state: "SEALED",
    traceDigest: "sha256:remedy-trace-001",
    sealedAt: "2026-08-23T07:00:00.000Z",
    exceptionRef: "RECONCILIATION-EXCEPTION:001",
    reconciliationRef: "RECONCILIATION:001",
    proposalRef: "REMEDY-PROPOSAL:001",
    authorizationRef: "REMEDY-AUTH:001",
    originalWardenDecisionRef: "WARDEN-DECISION:ORIGINAL",
    remedyWardenDecisionRef: "WARDEN-DECISION:REMEDY",
    remedyExecutionReceiptRef: "REMEDY-EXECUTION:001",
    remedyEffectRef: "REMEDY-EFFECT:001",
    remedyVerificationRef: "REMEDY-VERIFICATION:001",
    parentCorrelationId: "CORRELATION:ORIGINAL",
    remedyCorrelationId: "CORRELATION:REMEDY",
    sourceEvidenceRefs: ["EVIDENCE:001", "EVIDENCE:002"],
    synthetic: false,
    ...overrides,
  };
}

function supersession(
  sourceSeal = seal(),
  overrides: Partial<ExceptionResolutionSupersessionSourceV1> = {},
): ExceptionResolutionSupersessionSourceV1 {
  return {
    version: "EXCEPTION-SUPERSESSION-001",
    supersessionRef: "EXCEPTION-SUPERSESSION:001",
    exceptionRef: sourceSeal.exceptionRef,
    reconciliationRef: sourceSeal.reconciliationRef,
    priorState: "EXCEPTION",
    disposition: "SUPERSEDED_BY_VERIFIED_RECOVERY",
    proposalRef: sourceSeal.proposalRef,
    authorizationRef: sourceSeal.authorizationRef,
    remedyEffectRef: sourceSeal.remedyEffectRef,
    remedyVerificationRef: sourceSeal.remedyVerificationRef,
    riverSealRef: sourceSeal.sealRef,
    originalWardenDecisionRef: sourceSeal.originalWardenDecisionRef,
    remedyWardenDecisionRef: sourceSeal.remedyWardenDecisionRef,
    parentCorrelationId: sourceSeal.parentCorrelationId,
    remedyCorrelationId: sourceSeal.remedyCorrelationId,
    sourceEvidenceRefs: [...sourceSeal.sourceEvidenceRefs],
    supersededAt: "2026-08-23T07:00:01.000Z",
    state: "RESOLVED_APPEND_ONLY",
    settlementFinality: false,
    synthetic: false,
    ...overrides,
  };
}

function publication(
  sourceSeal = seal(),
  sourceSupersession = supersession(sourceSeal),
  overrides: Partial<PersistedRiverResolutionPublicationV1> = {},
): PersistedRiverResolutionPublicationV1 {
  return {
    version: "RIVER-RESOLUTION-PUBLICATION-001",
    publicationRef: "RIVER-RESOLUTION-PUBLICATION:001",
    exceptionRef: sourceSeal.exceptionRef,
    reconciliationRef: sourceSeal.reconciliationRef,
    remedyEffectRef: sourceSeal.remedyEffectRef,
    remedyVerificationRef: sourceSeal.remedyVerificationRef,
    riverRemedySealRef: sourceSeal.sealRef,
    exceptionSupersessionRef: sourceSupersession.supersessionRef,
    traceDigest: "sha256:river-resolution-trace-001",
    eventRefs: ["RIVER-EVENT:001", "RIVER-EVENT:002"],
    eventReceiptRefs: ["RIVER-EVENT-RECEIPT:001", "RIVER-EVENT-RECEIPT:002"],
    evidenceObjectRefs: ["RIVER-EVIDENCE-OBJECT:001"],
    evidenceObjectReceiptRefs: ["RIVER-EVIDENCE-RECEIPT:001"],
    recordedAt: "2026-08-23T07:00:02.000Z",
    state: "PERSISTED",
    synthetic: false,
    ...overrides,
  };
}

function policy(overrides: Partial<ResolutionProjectionPolicyV1> = {}): ResolutionProjectionPolicyV1 {
  return {
    version: "WARDEN-RESOLUTION-PROJECTION-POLICY-001",
    policyRef: "WARDEN-RESOLUTION-PROJECTION-POLICY:001",
    minimumAssurance: "A2",
    allowedAttestorRefs: ["RIVER-ATTESTOR:001"],
    requireNonSynthetic: true,
    requireTrustedSigner: true,
    requireVerifiedSignature: true,
    ...overrides,
  };
}

function signingFixture(sourcePublication: PersistedRiverResolutionPublicationV1, overrides: {
  trustState?: ResolutionAttestorKeyV1["trustState"];
  maximumAssurance?: ResolutionAttestorKeyV1["maximumAssurance"];
  syntheticKey?: boolean;
  syntheticSignature?: boolean;
} = {}) {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const key: ResolutionAttestorKeyV1 = {
    keyRef: "RIVER-KEY:001",
    signerRef: "RIVER-ATTESTOR:001",
    algorithm: "Ed25519",
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    trustState: overrides.trustState ?? "TRUSTED",
    maximumAssurance: overrides.maximumAssurance ?? "A3",
    validFrom: "2026-08-23T06:55:00.000Z",
    validUntil: "2026-08-23T08:00:00.000Z",
    synthetic: overrides.syntheticKey ?? false,
  };
  const signatureBase64 = sign(
    null,
    Buffer.from(canonicalResolutionPublicationMessageV1(sourcePublication), "utf8"),
    privateKey,
  ).toString("base64");
  const signature: ResolutionPublicationSignatureEnvelopeV1 = {
    version: "RIVER-RESOLUTION-PUBLICATION-SIGNATURE-001",
    publicationRef: sourcePublication.publicationRef,
    traceDigest: sourcePublication.traceDigest,
    signerRef: key.signerRef,
    keyRef: key.keyRef,
    algorithm: "Ed25519",
    signatureBase64,
    signedAt: "2026-08-23T07:00:03.000Z",
    synthetic: overrides.syntheticSignature ?? false,
  };
  const resolver: ResolutionAttestorKeyResolverV1 = {
    async resolve(keyRef) {
      return keyRef === key.keyRef ? key : undefined;
    },
  };
  return { key, signature, resolver };
}

describe("WardenResolutionProjectionBridgeV1", () => {
  it("blocks the current WARDEN 1.1 synthetic closure before River/signature trust can promote it", async () => {
    const sourceSeal = seal({ synthetic: true });
    const sourceSupersession = supersession(sourceSeal, { synthetic: true });
    const sourcePublication = publication(sourceSeal, sourceSupersession);
    const fixture = signingFixture(sourcePublication);

    const result = await new WardenResolutionProjectionBridgeV1(fixture.resolver).compile({
      seal: sourceSeal,
      supersession: sourceSupersession,
      publication: sourcePublication,
      signature: fixture.signature,
      policy: policy(),
      eligibleAt: "2026-08-23T07:00:04.000Z",
    });

    expect(result).toEqual({
      state: "BLOCKED",
      reasonCode: "RESOLUTION_PROJECTION_SYNTHETIC_CLOSURE",
    });
  });

  it("emits one deterministic non-synthetic Registry revision after exact lineage and Ed25519 verification", async () => {
    const sourceSeal = seal();
    const sourceSupersession = supersession(sourceSeal);
    const sourcePublication = publication(sourceSeal, sourceSupersession);
    const fixture = signingFixture(sourcePublication);
    const bridge = new WardenResolutionProjectionBridgeV1(fixture.resolver);

    const first = await bridge.compile({
      seal: sourceSeal,
      supersession: sourceSupersession,
      publication: sourcePublication,
      signature: fixture.signature,
      policy: policy(),
      eligibleAt: "2026-08-23T07:00:04.000Z",
    });
    const replay = await bridge.compile({
      seal: sourceSeal,
      supersession: sourceSupersession,
      publication: sourcePublication,
      signature: fixture.signature,
      policy: policy(),
      eligibleAt: "2026-08-23T07:00:04.000Z",
    });

    expect(first.state).toBe("ELIGIBLE_REGISTRY_REVISION");
    expect(replay).toEqual(first);
    if (first.state !== "ELIGIBLE_REGISTRY_REVISION") {
      throw new Error("expected_eligible_registry_revision");
    }
    expect(first.revision).toMatchObject({
      version: "REGISTRY-EXCEPTION-RESOLUTION-REVISION-001",
      originalExceptionRef: sourceSeal.exceptionRef,
      assessmentRef: sourceSeal.reconciliationRef,
      disposition: sourceSupersession.disposition,
      remedyEffectRef: sourceSeal.remedyEffectRef,
      remedyVerificationRef: sourceSeal.remedyVerificationRef,
      riverRemedySealRef: sourceSeal.sealRef,
      riverPublicationRef: sourcePublication.publicationRef,
      riverTraceDigest: sourcePublication.traceDigest,
      attestorRef: "RIVER-ATTESTOR:001",
      assurance: "A3",
      projectionPolicyRef: "WARDEN-RESOLUTION-PROJECTION-POLICY:001",
      registryWriteEligible: true,
      state: "ELIGIBLE_FOR_REGISTRY_WRITE",
      synthetic: false,
    });
  });

  it("fails closed on River closure-lineage drift even when the publication has a valid signature", async () => {
    const sourceSeal = seal();
    const sourceSupersession = supersession(sourceSeal);
    const driftedPublication = publication(sourceSeal, sourceSupersession, {
      remedyVerificationRef: "REMEDY-VERIFICATION:DRIFTED",
    });
    const fixture = signingFixture(driftedPublication);

    await expect(new WardenResolutionProjectionBridgeV1(fixture.resolver).compile({
      seal: sourceSeal,
      supersession: sourceSupersession,
      publication: driftedPublication,
      signature: fixture.signature,
      policy: policy(),
      eligibleAt: "2026-08-23T07:00:04.000Z",
    })).resolves.toEqual({
      state: "BLOCKED",
      reasonCode: "RESOLUTION_PROJECTION_RIVER_LINEAGE_MISMATCH",
    });
  });

  it("rejects a tampered signature, revoked key, and assurance below policy independently", async () => {
    const sourceSeal = seal();
    const sourceSupersession = supersession(sourceSeal);
    const sourcePublication = publication(sourceSeal, sourceSupersession);

    const valid = signingFixture(sourcePublication);
    const tampered: ResolutionPublicationSignatureEnvelopeV1 = {
      ...valid.signature,
      signatureBase64: Buffer.from("tampered", "utf8").toString("base64"),
    };
    await expect(new WardenResolutionProjectionBridgeV1(valid.resolver).compile({
      seal: sourceSeal,
      supersession: sourceSupersession,
      publication: sourcePublication,
      signature: tampered,
      policy: policy(),
      eligibleAt: "2026-08-23T07:00:04.000Z",
    })).resolves.toEqual({ state: "BLOCKED", reasonCode: "RESOLUTION_PROJECTION_SIGNATURE_INVALID" });

    const revoked = signingFixture(sourcePublication, { trustState: "REVOKED" });
    await expect(new WardenResolutionProjectionBridgeV1(revoked.resolver).compile({
      seal: sourceSeal,
      supersession: sourceSupersession,
      publication: sourcePublication,
      signature: revoked.signature,
      policy: policy(),
      eligibleAt: "2026-08-23T07:00:04.000Z",
    })).resolves.toEqual({ state: "BLOCKED", reasonCode: "RESOLUTION_PROJECTION_KEY_REVOKED" });

    const lowAssurance = signingFixture(sourcePublication, { maximumAssurance: "A1" });
    await expect(new WardenResolutionProjectionBridgeV1(lowAssurance.resolver).compile({
      seal: sourceSeal,
      supersession: sourceSupersession,
      publication: sourcePublication,
      signature: lowAssurance.signature,
      policy: policy({ minimumAssurance: "A2" }),
      eligibleAt: "2026-08-23T07:00:04.000Z",
    })).resolves.toEqual({
      state: "BLOCKED",
      reasonCode: "RESOLUTION_PROJECTION_ASSURANCE_INSUFFICIENT",
    });
  });

  it("requires one receipt for every persisted River event and evidence object", async () => {
    const sourceSeal = seal();
    const sourceSupersession = supersession(sourceSeal);
    const incompletePublication = publication(sourceSeal, sourceSupersession, {
      eventReceiptRefs: ["RIVER-EVENT-RECEIPT:001"],
    });
    const fixture = signingFixture(incompletePublication);

    await expect(new WardenResolutionProjectionBridgeV1(fixture.resolver).compile({
      seal: sourceSeal,
      supersession: sourceSupersession,
      publication: incompletePublication,
      signature: fixture.signature,
      policy: policy(),
      eligibleAt: "2026-08-23T07:00:04.000Z",
    })).resolves.toEqual({
      state: "BLOCKED",
      reasonCode: "RESOLUTION_PROJECTION_RIVER_PERSISTENCE_PROOF_MISSING",
    });
  });
});
