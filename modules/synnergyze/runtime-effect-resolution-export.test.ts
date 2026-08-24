import { generateKeyPairSync, verify } from "node:crypto";

import { describe, expect, it } from "vitest";

import type {
  ExceptionResolutionSupersessionSourceV1,
  RemedyResolutionSealSourceV1,
  ResolutionProjectionBridgeResultV1,
} from "./warden-resolution-projection-bridge.ts";
import {
  buildSignedRuntimeEffectResolutionV1,
  type RuntimeEffectExceptionSourceBindingV1,
} from "./runtime-effect-resolution-export.ts";

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

function seal(): RemedyResolutionSealSourceV1 {
  return {
    version: "REMEDY-CAUSAL-SEAL-001",
    sealRef: "RIVER-REMEDY-SEAL:001",
    state: "SEALED",
    traceDigest: "sha256:remedy-trace-001",
    sealedAt: "2026-08-24T05:00:00.000Z",
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
    sourceEvidenceRefs: ["EVIDENCE:RUNTIME-EXCEPTION", "EVIDENCE:REMEDY"],
    synthetic: false,
  };
}

function supersession(source = seal()): ExceptionResolutionSupersessionSourceV1 {
  return {
    version: "EXCEPTION-SUPERSESSION-001",
    supersessionRef: "EXCEPTION-SUPERSESSION:001",
    exceptionRef: source.exceptionRef,
    reconciliationRef: source.reconciliationRef,
    priorState: "EXCEPTION",
    disposition: "SUPERSEDED_BY_VERIFIED_RECOVERY",
    proposalRef: source.proposalRef,
    authorizationRef: source.authorizationRef,
    remedyEffectRef: source.remedyEffectRef,
    remedyVerificationRef: source.remedyVerificationRef,
    riverSealRef: source.sealRef,
    originalWardenDecisionRef: source.originalWardenDecisionRef,
    remedyWardenDecisionRef: source.remedyWardenDecisionRef,
    parentCorrelationId: source.parentCorrelationId,
    remedyCorrelationId: source.remedyCorrelationId,
    sourceEvidenceRefs: [...source.sourceEvidenceRefs],
    supersededAt: "2026-08-24T05:00:03.000Z",
    state: "RESOLVED_APPEND_ONLY",
    settlementFinality: false,
    synthetic: false,
  };
}

function eligibleBridge(source = seal()): ResolutionProjectionBridgeResultV1 {
  return {
    state: "ELIGIBLE_REGISTRY_REVISION",
    attestationRef: "RIVER-RESOLUTION-ATTESTATION:001",
    signatureDigest: "sha256:bridge-signature",
    revision: {
      version: "REGISTRY-EXCEPTION-RESOLUTION-REVISION-001",
      projectionRef: "REGISTRY-PROJECTION:WARDEN-EXCEPTION-RESOLUTION:001",
      registryObjectRef: `WARDEN-EXCEPTION-RESOLUTION:${source.exceptionRef}`,
      registryRevisionRef: "REGISTRY-REVISION:WARDEN-EXCEPTION-RESOLUTION:001",
      originalExceptionRef: source.exceptionRef,
      assessmentRef: source.reconciliationRef,
      disposition: "SUPERSEDED_BY_VERIFIED_RECOVERY",
      remedyEffectRef: source.remedyEffectRef,
      remedyVerificationRef: source.remedyVerificationRef,
      riverRemedySealRef: source.sealRef,
      riverPublicationRef: "RIVER-RESOLUTION-PUBLICATION:001",
      riverTraceDigest: "sha256:river-resolution-trace-001",
      attestationRef: "RIVER-RESOLUTION-ATTESTATION:001",
      attestorRef: "RIVER-ATTESTOR:001",
      assurance: "A3",
      projectionPolicyRef: "WARDEN-RESOLUTION-PROJECTION-POLICY:001",
      eligibleAt: "2026-08-24T05:00:05.000Z",
      registryWriteEligible: true,
      state: "ELIGIBLE_FOR_REGISTRY_WRITE",
      synthetic: false,
    },
  };
}

function runtimeSource(source = seal()): RuntimeEffectExceptionSourceBindingV1 {
  return {
    version: "RUNTIME-EFFECT-EXCEPTION-SOURCE-BINDING-001",
    runtimeExceptionRef: "RUNTIME-EFFECT-EXCEPTION:001",
    sourceReplayKey: "RUNTIME-REPLAY:001",
    sourceWardenDecisionReceiptId: source.originalWardenDecisionRef,
    wardenExceptionRef: source.exceptionRef,
    sourceEvidenceRef: "RIVER-EVIDENCE:RUNTIME-EXCEPTION-001",
    sourceDigest: "sha256:runtime-exception-source-001",
    synthetic: false,
  };
}

function signingFixture() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKey,
    keyId: "WARDEN-RUNTIME-RESOLUTION-KEY:001",
  };
}

describe("buildSignedRuntimeEffectResolutionV1", () => {
  it("signs only an eligible non-synthetic bridge result bound to the original Runtime decision lineage", () => {
    const sourceSeal = seal();
    const fixture = signingFixture();
    const result = buildSignedRuntimeEffectResolutionV1({
      bridgeResult: eligibleBridge(sourceSeal),
      seal: sourceSeal,
      supersession: supersession(sourceSeal),
      runtimeSource: runtimeSource(sourceSeal),
      signing: fixture,
    });
    expect(result.state).toBe("SIGNED_RUNTIME_EFFECT_RESOLUTION");
    if (result.state !== "SIGNED_RUNTIME_EFFECT_RESOLUTION") throw new Error("expected signed binding");
    expect(result.binding).toMatchObject({
      profile_id: "runtime-effect-resolution-binding/v1",
      source_contract: "EXCEPTION-SUPERSESSION-001",
      runtime_exception_ref: "RUNTIME-EFFECT-EXCEPTION:001",
      source_replay_key: "RUNTIME-REPLAY:001",
      source_warden_decision_receipt_id: "WARDEN-DECISION:ORIGINAL",
      state: "RESOLVED_APPEND_ONLY",
      settlement_finality: false,
      bridge: {
        contract: "WARDEN-RESOLUTION-PROJECTION-BRIDGE-001",
        state: "ELIGIBLE_REGISTRY_REVISION",
        registry_write_eligible: true,
        synthetic: false,
        assurance: "A3",
      },
    });
    const unsigned = { ...result.binding } as Record<string, unknown>;
    delete unsigned.producer_signature;
    expect(verify(
      null,
      Buffer.from(stableJson(unsigned), "utf8"),
      fixture.publicKey,
      Buffer.from(result.binding.producer_signature.signature, "base64url"),
    )).toBe(true);
  });

  it("blocks mismatched Runtime source decision and synthetic/ineligible bridge results", () => {
    const sourceSeal = seal();
    const fixture = signingFixture();
    expect(buildSignedRuntimeEffectResolutionV1({
      bridgeResult: eligibleBridge(sourceSeal),
      seal: sourceSeal,
      supersession: supersession(sourceSeal),
      runtimeSource: { ...runtimeSource(sourceSeal), sourceWardenDecisionReceiptId: "WARDEN-DECISION:OTHER" },
      signing: fixture,
    })).toEqual({ state: "BLOCKED", reasonCode: "RUNTIME_RESOLUTION_SOURCE_DECISION_MISMATCH" });

    const bridge = eligibleBridge(sourceSeal);
    if (bridge.state !== "ELIGIBLE_REGISTRY_REVISION") throw new Error("expected eligible bridge");
    const syntheticBridge = {
      ...bridge,
      revision: { ...bridge.revision, synthetic: true, registryWriteEligible: false },
    } as unknown as ResolutionProjectionBridgeResultV1;
    expect(buildSignedRuntimeEffectResolutionV1({
      bridgeResult: syntheticBridge,
      seal: sourceSeal,
      supersession: supersession(sourceSeal),
      runtimeSource: runtimeSource(sourceSeal),
      signing: fixture,
    })).toEqual({ state: "BLOCKED", reasonCode: "RUNTIME_RESOLUTION_BRIDGE_SYNTHETIC" });
  });

  it("does not sign when the closure lineage or signing key is invalid", () => {
    const sourceSeal = seal();
    const fixture = signingFixture();
    const driftedSupersession = { ...supersession(sourceSeal), remedyVerificationRef: "REMEDY-VERIFICATION:DRIFT" };
    expect(buildSignedRuntimeEffectResolutionV1({
      bridgeResult: eligibleBridge(sourceSeal),
      seal: sourceSeal,
      supersession: driftedSupersession,
      runtimeSource: runtimeSource(sourceSeal),
      signing: fixture,
    })).toEqual({ state: "BLOCKED", reasonCode: "RUNTIME_RESOLUTION_LINEAGE_MISMATCH" });

    expect(buildSignedRuntimeEffectResolutionV1({
      bridgeResult: eligibleBridge(sourceSeal),
      seal: sourceSeal,
      supersession: supersession(sourceSeal),
      runtimeSource: runtimeSource(sourceSeal),
      signing: { privateKeyPem: "", keyId: "" },
    })).toEqual({ state: "BLOCKED", reasonCode: "RUNTIME_RESOLUTION_SIGNING_KEY_REQUIRED" });
  });
});
