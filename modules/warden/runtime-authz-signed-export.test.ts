import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { WardenDecisionRequestV1 } from "./contracts.ts";
import {
  evaluateSyntheticWardenDecisionV1,
  type SyntheticWardenDecisionPolicyV1,
} from "./decision-service.ts";
import { buildRuntimeEffectPolicyV1 } from "./runtime-authz-bridge.ts";
import { canonicalReceiptBytes } from "./producer-signature.ts";
import { buildSignedRuntimeWardenDecisionReceipt } from "./runtime-authz-signed-export.ts";

const EFFECT_POLICY = buildRuntimeEffectPolicyV1({
  "runtime.page.create": "WRITE",
});

function request(): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:SIGNED-001",
    actorRef: "DIGITALME:GENESIS:001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:001",
    eventRef: "SYNNERGYZE-EVENT:001",
    action: "runtime.page.create",
    capabilityRef: "runtime.page.create",
    targetRef: "RUNTIME-001",
    requestedEffect: "RUNTIME-MATERIAL-EFFECT:v1:runtime.page.created:sha256:" + "a".repeat(64),
    authorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    policyRefs: ["POLICY:ALPHA-SYNTHETIC-001", EFFECT_POLICY.policyRef],
    representationSourceRefs: ["REGISTRY:REPRESENTATION-001"],
    requestedAt: "2026-08-23T08:00:00.000Z",
    correlationId: "CORR-SIGNED-001",
  };
}

function policy(req: WardenDecisionRequestV1): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:SIGNED-001",
    wardenRef: "WARDEN-ALPHA-CONFORMANCE-001",
    lifecycle: "ACTIVE",
    validFrom: "2026-08-23T07:55:00.000Z",
    validUntil: "2026-08-23T08:10:00.000Z",
    actorRef: req.actorRef,
    representedPrincipalRef: req.representedPrincipalRef,
    actingCapacityRef: req.actingCapacityRef,
    contextRef: req.contextRef,
    programRef: req.programRef,
    requiredAuthorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    requiredPolicyRefs: ["POLICY:ALPHA-SYNTHETIC-001", EFFECT_POLICY.policyRef],
    allowedCapabilityRefs: ["runtime.page.create"],
    manualReviewCapabilityRefs: [],
    constraints: ["NO_EXTERNAL_EFFECT"],
  };
}

describe("GCS-20260823-002 signed Warden Runtime receipt export", () => {
  it("signs the actual decision producer output and fails verification after tamper", () => {
    const req = request();
    const decision = evaluateSyntheticWardenDecisionV1({
      request: req,
      policy: policy(req),
      decidedAt: "2026-08-23T08:00:30.000Z",
    });
    expect(decision.decision).toBe("ALLOW");

    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const receipt = buildSignedRuntimeWardenDecisionReceipt({
      request: req,
      decision,
      principal: {
        digitalMeId: req.actorRef,
        authenticatedPrincipalReceiptId: "DIGITALME-PRINCIPAL:SIGNED-001",
      },
      effectPolicy: EFFECT_POLICY,
      signing: {
        privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
        keyId: "warden-test-key",
      },
    });

    expect(receipt.producer_signature.alg).toBe("Ed25519");
    expect(receipt.producer_signature.key_id).toBe("warden-test-key");
    expect(
      verify(
        null,
        canonicalReceiptBytes(receipt),
        publicKey,
        Buffer.from(receipt.producer_signature.signature, "base64url"),
      ),
    ).toBe(true);
    expect(JSON.stringify(receipt)).not.toContain("WARDEN-ACTION-TOKEN:");

    const tampered = { ...receipt, decision: "DENY" as const };
    expect(
      verify(
        null,
        canonicalReceiptBytes(tampered),
        publicKey,
        Buffer.from(receipt.producer_signature.signature, "base64url"),
      ),
    ).toBe(false);
  });

  it("fails closed when producer signing material is absent", () => {
    const req = request();
    const decision = evaluateSyntheticWardenDecisionV1({
      request: req,
      policy: policy(req),
      decidedAt: "2026-08-23T08:00:30.000Z",
    });
    expect(() =>
      buildSignedRuntimeWardenDecisionReceipt({
        request: req,
        decision,
        principal: {
          digitalMeId: req.actorRef,
          authenticatedPrincipalReceiptId: "DIGITALME-PRINCIPAL:SIGNED-001",
        },
        effectPolicy: EFFECT_POLICY,
        signing: { privateKeyPem: "", keyId: "" },
      }),
    ).toThrow(/producer key id is required/);
  });
});
