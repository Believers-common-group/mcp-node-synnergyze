import { mkdirSync, writeFileSync } from "node:fs";
import { createHash, generateKeyPairSync } from "node:crypto";

import { expect, it } from "vitest";

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
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

it("emits a public hosted Runtime-resolution fixture", () => {
  const action = {
    action_id: "runtime.page.create",
    capability_id: "runtime.page.create",
    resource_id: "RUNTIME-001",
    effect_class: "WRITE",
  };
  const providerKey = sha256(stableJson(action));
  const sourceReplayKey = "RUNTIME-REPLAY:HOSTED-001";
  const runtimeExceptionRef = `RUNTIME-EFFECT-EXCEPTION:${sha256(`${providerKey}|${sourceReplayKey}`).slice(0, 32)}`;

  const seal: RemedyResolutionSealSourceV1 = {
    version: "REMEDY-CAUSAL-SEAL-001",
    sealRef: "RIVER-REMEDY-SEAL:HOSTED-001",
    state: "SEALED",
    traceDigest: "sha256:hosted-remedy-trace",
    sealedAt: "2026-08-24T05:10:00.000Z",
    exceptionRef: "RECONCILIATION-EXCEPTION:HOSTED-001",
    reconciliationRef: "RECONCILIATION:HOSTED-001",
    proposalRef: "REMEDY-PROPOSAL:HOSTED-001",
    authorizationRef: "REMEDY-AUTH:HOSTED-001",
    originalWardenDecisionRef: "WARDEN-DECISION:1",
    remedyWardenDecisionRef: "WARDEN-DECISION:HOSTED-REMEDY",
    remedyExecutionReceiptRef: "REMEDY-EXECUTION:HOSTED-001",
    remedyEffectRef: "REMEDY-EFFECT:HOSTED-001",
    remedyVerificationRef: "REMEDY-VERIFICATION:HOSTED-001",
    parentCorrelationId: "CORRELATION:HOSTED-ORIGINAL",
    remedyCorrelationId: "CORRELATION:HOSTED-REMEDY",
    sourceEvidenceRefs: ["EVIDENCE:HOSTED-RUNTIME", "EVIDENCE:HOSTED-REMEDY"],
    synthetic: false,
  };
  const supersession: ExceptionResolutionSupersessionSourceV1 = {
    version: "EXCEPTION-SUPERSESSION-001",
    supersessionRef: "EXCEPTION-SUPERSESSION:HOSTED-001",
    exceptionRef: seal.exceptionRef,
    reconciliationRef: seal.reconciliationRef,
    priorState: "EXCEPTION",
    disposition: "SUPERSEDED_BY_VERIFIED_RECOVERY",
    proposalRef: seal.proposalRef,
    authorizationRef: seal.authorizationRef,
    remedyEffectRef: seal.remedyEffectRef,
    remedyVerificationRef: seal.remedyVerificationRef,
    riverSealRef: seal.sealRef,
    originalWardenDecisionRef: seal.originalWardenDecisionRef,
    remedyWardenDecisionRef: seal.remedyWardenDecisionRef,
    parentCorrelationId: seal.parentCorrelationId,
    remedyCorrelationId: seal.remedyCorrelationId,
    sourceEvidenceRefs: [...seal.sourceEvidenceRefs],
    supersededAt: "2026-08-24T05:10:03.000Z",
    state: "RESOLVED_APPEND_ONLY",
    settlementFinality: false,
    synthetic: false,
  };
  const bridgeResult: ResolutionProjectionBridgeResultV1 = {
    state: "ELIGIBLE_REGISTRY_REVISION",
    attestationRef: "RIVER-RESOLUTION-ATTESTATION:HOSTED-001",
    signatureDigest: "sha256:hosted-bridge-signature",
    revision: {
      version: "REGISTRY-EXCEPTION-RESOLUTION-REVISION-001",
      projectionRef: "REGISTRY-PROJECTION:WARDEN-EXCEPTION-RESOLUTION:HOSTED-001",
      registryObjectRef: `WARDEN-EXCEPTION-RESOLUTION:${seal.exceptionRef}`,
      registryRevisionRef: "REGISTRY-REVISION:WARDEN-EXCEPTION-RESOLUTION:HOSTED-001",
      originalExceptionRef: seal.exceptionRef,
      assessmentRef: seal.reconciliationRef,
      disposition: supersession.disposition,
      remedyEffectRef: seal.remedyEffectRef,
      remedyVerificationRef: seal.remedyVerificationRef,
      riverRemedySealRef: seal.sealRef,
      riverPublicationRef: "RIVER-RESOLUTION-PUBLICATION:HOSTED-001",
      riverTraceDigest: "sha256:hosted-river-resolution-trace",
      attestationRef: "RIVER-RESOLUTION-ATTESTATION:HOSTED-001",
      attestorRef: "RIVER-ATTESTOR:HOSTED-001",
      assurance: "A3",
      projectionPolicyRef: "WARDEN-RESOLUTION-PROJECTION-POLICY:HOSTED-001",
      eligibleAt: "2026-08-24T05:10:05.000Z",
      registryWriteEligible: true,
      state: "ELIGIBLE_FOR_REGISTRY_WRITE",
      synthetic: false,
    },
  };
  const runtimeSource: RuntimeEffectExceptionSourceBindingV1 = {
    version: "RUNTIME-EFFECT-EXCEPTION-SOURCE-BINDING-001",
    runtimeExceptionRef,
    sourceReplayKey,
    sourceWardenDecisionReceiptId: seal.originalWardenDecisionRef,
    wardenExceptionRef: seal.exceptionRef,
    sourceEvidenceRef: "RIVER-EVIDENCE:RUNTIME-EXCEPTION-HOSTED-001",
    sourceDigest: `sha256:${sha256(stableJson({ runtimeExceptionRef, sourceReplayKey, providerKey, originalWardenDecisionRef: seal.originalWardenDecisionRef }))}`,
    synthetic: false,
  };
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const result = buildSignedRuntimeEffectResolutionV1({
    bridgeResult,
    seal,
    supersession,
    runtimeSource,
    signing: {
      privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
      keyId: "WARDEN-RUNTIME-RESOLUTION-KEY:HOSTED-001",
    },
  });
  expect(result.state).toBe("SIGNED_RUNTIME_EFFECT_RESOLUTION");
  if (result.state !== "SIGNED_RUNTIME_EFFECT_RESOLUTION") throw new Error("fixture export blocked");

  const dir = process.env.RUNTIME_EFFECT_RESOLUTION_FIXTURE_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/resolution.json`, `${JSON.stringify(result.binding, null, 2)}\n`, "utf8");
  writeFileSync(`${dir}/public-key.pem`, publicKey.export({ type: "spki", format: "pem" }).toString(), "utf8");
  writeFileSync(`${dir}/expected.json`, `${JSON.stringify({
    key_id: "WARDEN-RUNTIME-RESOLUTION-KEY:HOSTED-001",
    assurance: "A3",
    provider_key: providerKey,
    runtime_exception_ref: runtimeSource.runtimeExceptionRef,
    source_replay_key: runtimeSource.sourceReplayKey,
    source_warden_decision_receipt_id: runtimeSource.sourceWardenDecisionReceiptId,
    warden_exception_ref: runtimeSource.wardenExceptionRef,
  }, null, 2)}\n`, "utf8");
});
