import { createHash, generateKeyPairSync, verify } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
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
  "runtime.manifest.attach": "WRITE",
  "runtime.event.ingest": "WRITE",
  "runtime.stitch.run": "EXECUTE",
});
const PRINCIPAL_RECEIPT_ID = "DIGITALME-PRINCIPAL:097414e04f4e127bb1b5fa469b98ffe1";
const RUNTIME_BODY = {
  tenant_id: "BNR",
  runtime_id: "RUNTIME-001",
  page_title: "Hosted Producer Fixture",
  owner_id: "owner",
  programme_id: null,
};
const BODY_CANONICAL = JSON.stringify(
  Object.fromEntries(Object.entries(RUNTIME_BODY).sort(([left], [right]) => left.localeCompare(right))),
);
const BODY_DIGEST = createHash("sha256").update(BODY_CANONICAL, "utf8").digest("hex");
const MATERIAL_EFFECT = `RUNTIME-MATERIAL-EFFECT:v1:runtime.page.created:sha256:${BODY_DIGEST}`;

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
    requestedEffect: MATERIAL_EFFECT,
    authorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    policyRefs: ["POLICY:ALPHA-SYNTHETIC-001", EFFECT_POLICY.policyRef],
    representationSourceRefs: ["REGISTRY:REPRESENTATION-001"],
    requestedAt: "2026-08-23T10:00:00.000Z",
    correlationId: "CORR-SIGNED-001",
  };
}

function policy(req: WardenDecisionRequestV1): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:SIGNED-001",
    wardenRef: "WARDEN-ALPHA-CONFORMANCE-001",
    lifecycle: "ACTIVE",
    validFrom: "2026-08-23T09:55:00.000Z",
    validUntil: "2026-08-23T10:14:00.000Z",
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
    expect(EFFECT_POLICY.policyRef).toBe(
      "RUNTIME-EFFECT-POLICY:6cf48672e30ba8f8ac660d86f8221372d813aa515c72e1e1fb0b2528403e420d",
    );
    expect(BODY_DIGEST).toBe("181d11208c469c5d9d2788a023cceea7e38342fdbef73bb3e7d4fa3d0de2d787");
    const decision = evaluateSyntheticWardenDecisionV1({
      request: req,
      policy: policy(req),
      decidedAt: "2026-08-23T10:00:30.000Z",
    });
    expect(decision.decision).toBe("ALLOW");

    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const receipt = buildSignedRuntimeWardenDecisionReceipt({
      request: req,
      decision,
      principal: {
        digitalMeId: req.actorRef,
        authenticatedPrincipalReceiptId: PRINCIPAL_RECEIPT_ID,
      },
      effectPolicy: EFFECT_POLICY,
      signing: {
        privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
        keyId: "warden-test-key",
      },
    });

    expect(receipt.producer_signature.alg).toBe("Ed25519");
    expect(receipt.producer_signature.key_id).toBe("warden-test-key");
    expect(receipt.principal_binding.authenticated_principal_receipt_id).toBe(PRINCIPAL_RECEIPT_ID);
    expect(receipt.action_binding.effect_binding).toBe(MATERIAL_EFFECT);
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

    const fixtureDir = process.env.RUNTIME_AUTHZ_FIXTURE_DIR;
    if (fixtureDir) {
      mkdirSync(fixtureDir, { recursive: true });
      writeFileSync(`${fixtureDir}/warden-decision-receipt.json`, JSON.stringify(receipt, null, 2));
      writeFileSync(
        `${fixtureDir}/warden-public.pem`,
        publicKey.export({ type: "spki", format: "pem" }).toString(),
      );
      writeFileSync(`${fixtureDir}/runtime-page-body.json`, JSON.stringify(RUNTIME_BODY, null, 2));
      writeFileSync(
        `${fixtureDir}/fixture-metadata.json`,
        JSON.stringify(
          {
            producer: "Warden",
            digitalme_id: req.actorRef,
            principal_receipt_id: PRINCIPAL_RECEIPT_ID,
            decision_receipt_id: receipt.decision_receipt_id,
            effect_policy_ref: EFFECT_POLICY.policyRef,
            material_effect: MATERIAL_EFFECT,
            validation_now: "2026-08-23T10:05:00.000Z",
          },
          null,
          2,
        ),
      );
    }
  });

  it("fails closed when producer signing material is absent", () => {
    const req = request();
    const decision = evaluateSyntheticWardenDecisionV1({
      request: req,
      policy: policy(req),
      decidedAt: "2026-08-23T10:00:30.000Z",
    });
    expect(() =>
      buildSignedRuntimeWardenDecisionReceipt({
        request: req,
        decision,
        principal: {
          digitalMeId: req.actorRef,
          authenticatedPrincipalReceiptId: PRINCIPAL_RECEIPT_ID,
        },
        effectPolicy: EFFECT_POLICY,
        signing: { privateKeyPem: "", keyId: "" },
      }),
    ).toThrow(/producer key id is required/);
  });
});
