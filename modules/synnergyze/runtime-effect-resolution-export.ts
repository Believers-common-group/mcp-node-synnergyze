import { createPrivateKey, sign } from "node:crypto";

import type {
  ExceptionResolutionSupersessionSourceV1,
  RemedyResolutionSealSourceV1,
  ResolutionProjectionBridgeResultV1,
} from "./warden-resolution-projection-bridge.ts";

export interface RuntimeEffectExceptionSourceBindingV1 {
  version: "RUNTIME-EFFECT-EXCEPTION-SOURCE-BINDING-001";
  runtimeExceptionRef: string;
  sourceReplayKey: string;
  sourceWardenDecisionReceiptId: string;
  wardenExceptionRef: string;
  sourceEvidenceRef: string;
  sourceDigest: string;
  synthetic: false;
}

export interface RuntimeEffectResolutionProducerSignatureV1 {
  alg: "Ed25519";
  key_id: string;
  signature: string;
}

export interface RuntimeEffectResolutionBindingV1 {
  profile_id: "runtime-effect-resolution-binding/v1";
  source_contract: "EXCEPTION-SUPERSESSION-001";
  runtime_exception_ref: string;
  source_replay_key: string;
  source_warden_decision_receipt_id: string;
  supersession_ref: string;
  reconciliation_ref: string;
  river_seal_ref: string;
  remedy_verification_ref: string;
  remedy_warden_decision_ref: string;
  state: "RESOLVED_APPEND_ONLY";
  settlement_finality: false;
  resolved_at: string;
  source_evidence_ref: string;
  source_digest: string;
  bridge: {
    contract: "WARDEN-RESOLUTION-PROJECTION-BRIDGE-001";
    state: "ELIGIBLE_REGISTRY_REVISION";
    registry_write_eligible: true;
    synthetic: false;
    registry_revision_ref: string;
    registry_projection_ref: string;
    river_publication_ref: string;
    attestation_ref: string;
    attestor_ref: string;
    assurance: string;
    projection_policy_ref: string;
  };
  producer_signature: RuntimeEffectResolutionProducerSignatureV1;
}

export interface RuntimeEffectResolutionSigningInputV1 {
  privateKeyPem: string;
  keyId: string;
}

export type RuntimeEffectResolutionExportResultV1 =
  | { state: "SIGNED_RUNTIME_EFFECT_RESOLUTION"; binding: RuntimeEffectResolutionBindingV1 }
  | {
      state: "BLOCKED";
      reasonCode:
        | "RUNTIME_RESOLUTION_BRIDGE_NOT_ELIGIBLE"
        | "RUNTIME_RESOLUTION_BRIDGE_SYNTHETIC"
        | "RUNTIME_RESOLUTION_LINEAGE_MISMATCH"
        | "RUNTIME_RESOLUTION_SOURCE_BINDING_INVALID"
        | "RUNTIME_RESOLUTION_SOURCE_DECISION_MISMATCH"
        | "RUNTIME_RESOLUTION_SIGNING_KEY_REQUIRED"
        | "RUNTIME_RESOLUTION_SIGNING_KEY_INVALID";
    };

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

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function unsignedBindingBytes(binding: Omit<RuntimeEffectResolutionBindingV1, "producer_signature">): Buffer {
  return Buffer.from(stableJson(binding), "utf8");
}

export function buildSignedRuntimeEffectResolutionV1(input: {
  bridgeResult: ResolutionProjectionBridgeResultV1;
  seal: RemedyResolutionSealSourceV1;
  supersession: ExceptionResolutionSupersessionSourceV1;
  runtimeSource: RuntimeEffectExceptionSourceBindingV1;
  signing: RuntimeEffectResolutionSigningInputV1;
}): RuntimeEffectResolutionExportResultV1 {
  const { bridgeResult, seal, supersession, runtimeSource, signing } = input;
  if (bridgeResult.state !== "ELIGIBLE_REGISTRY_REVISION") {
    return { state: "BLOCKED", reasonCode: "RUNTIME_RESOLUTION_BRIDGE_NOT_ELIGIBLE" };
  }
  const revision = bridgeResult.revision;
  if (revision.synthetic !== false || revision.registryWriteEligible !== true) {
    return { state: "BLOCKED", reasonCode: "RUNTIME_RESOLUTION_BRIDGE_SYNTHETIC" };
  }
  if (
    revision.originalExceptionRef !== seal.exceptionRef ||
    revision.assessmentRef !== seal.reconciliationRef ||
    revision.remedyVerificationRef !== seal.remedyVerificationRef ||
    revision.riverRemedySealRef !== seal.sealRef ||
    revision.originalExceptionRef !== supersession.exceptionRef ||
    supersession.reconciliationRef !== seal.reconciliationRef ||
    supersession.riverSealRef !== seal.sealRef ||
    supersession.remedyVerificationRef !== seal.remedyVerificationRef ||
    supersession.remedyWardenDecisionRef !== seal.remedyWardenDecisionRef ||
    supersession.state !== "RESOLVED_APPEND_ONLY" ||
    supersession.settlementFinality !== false ||
    supersession.synthetic !== false
  ) {
    return { state: "BLOCKED", reasonCode: "RUNTIME_RESOLUTION_LINEAGE_MISMATCH" };
  }
  if (
    runtimeSource.version !== "RUNTIME-EFFECT-EXCEPTION-SOURCE-BINDING-001" ||
    runtimeSource.synthetic !== false ||
    !nonEmpty(runtimeSource.runtimeExceptionRef) ||
    !nonEmpty(runtimeSource.sourceReplayKey) ||
    !nonEmpty(runtimeSource.sourceWardenDecisionReceiptId) ||
    !nonEmpty(runtimeSource.sourceEvidenceRef) ||
    !nonEmpty(runtimeSource.sourceDigest) ||
    runtimeSource.wardenExceptionRef !== seal.exceptionRef
  ) {
    return { state: "BLOCKED", reasonCode: "RUNTIME_RESOLUTION_SOURCE_BINDING_INVALID" };
  }
  if (runtimeSource.sourceWardenDecisionReceiptId !== seal.originalWardenDecisionRef) {
    return { state: "BLOCKED", reasonCode: "RUNTIME_RESOLUTION_SOURCE_DECISION_MISMATCH" };
  }
  if (!signing.keyId?.trim() || !signing.privateKeyPem?.trim()) {
    return { state: "BLOCKED", reasonCode: "RUNTIME_RESOLUTION_SIGNING_KEY_REQUIRED" };
  }

  const unsigned: Omit<RuntimeEffectResolutionBindingV1, "producer_signature"> = {
    profile_id: "runtime-effect-resolution-binding/v1",
    source_contract: "EXCEPTION-SUPERSESSION-001",
    runtime_exception_ref: runtimeSource.runtimeExceptionRef,
    source_replay_key: runtimeSource.sourceReplayKey,
    source_warden_decision_receipt_id: runtimeSource.sourceWardenDecisionReceiptId,
    supersession_ref: supersession.supersessionRef,
    reconciliation_ref: supersession.reconciliationRef,
    river_seal_ref: supersession.riverSealRef,
    remedy_verification_ref: supersession.remedyVerificationRef,
    remedy_warden_decision_ref: supersession.remedyWardenDecisionRef,
    state: "RESOLVED_APPEND_ONLY",
    settlement_finality: false,
    resolved_at: supersession.supersededAt,
    source_evidence_ref: runtimeSource.sourceEvidenceRef,
    source_digest: runtimeSource.sourceDigest,
    bridge: {
      contract: "WARDEN-RESOLUTION-PROJECTION-BRIDGE-001",
      state: "ELIGIBLE_REGISTRY_REVISION",
      registry_write_eligible: true,
      synthetic: false,
      registry_revision_ref: revision.registryRevisionRef,
      registry_projection_ref: revision.projectionRef,
      river_publication_ref: revision.riverPublicationRef,
      attestation_ref: bridgeResult.attestationRef,
      attestor_ref: revision.attestorRef,
      assurance: revision.assurance,
      projection_policy_ref: revision.projectionPolicyRef,
    },
  };

  try {
    const key = createPrivateKey(signing.privateKeyPem.replace(/\\n/g, "\n"));
    if (key.asymmetricKeyType !== "ed25519") {
      return { state: "BLOCKED", reasonCode: "RUNTIME_RESOLUTION_SIGNING_KEY_INVALID" };
    }
    const signature = sign(null, unsignedBindingBytes(unsigned), key).toString("base64url");
    return {
      state: "SIGNED_RUNTIME_EFFECT_RESOLUTION",
      binding: {
        ...unsigned,
        producer_signature: {
          alg: "Ed25519",
          key_id: signing.keyId.trim(),
          signature,
        },
      },
    };
  } catch {
    return { state: "BLOCKED", reasonCode: "RUNTIME_RESOLUTION_SIGNING_KEY_INVALID" };
  }
}
