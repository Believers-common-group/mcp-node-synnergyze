import { describe, expect, it } from "vitest";

import type { WardenDecisionRequestV1, WardenDecisionV1 } from "./contracts.ts";
import {
  buildRuntimeEffectPolicyV1,
  buildRuntimeWardenDecisionReceipt,
  type RuntimeEffectPolicyV1,
} from "./runtime-authz-bridge.ts";

const DECIDED_AT = "2026-09-10T06:00:00.000Z";
const VALID_UNTIL = "2026-09-10T07:00:00.000Z";

function request(
  effectPolicy: RuntimeEffectPolicyV1,
  effect: "READ" | "EXECUTE" | "PHYSICAL" | "FINANCIAL",
  operationClass: "OBSERVE" | "INFER" | "ACT",
  overrides: Partial<WardenDecisionRequestV1> = {},
): WardenDecisionRequestV1 {
  const capabilityRef = `efom.${effect.toLowerCase()}`;
  return {
    requestRef: `WARDEN-REQUEST:${effect}`,
    actorRef: "DIGITALME:EFOM-OPERATOR-001",
    representedPrincipalRef: "ESTATE:001",
    actingCapacityRef: "CAPACITY:EFOM-OPERATOR",
    contextRef: "ALPHA-NODE-001",
    programRef: "OSIRIS:EFOM",
    eventRef: `OSIRIS-EVENT:${effect}`,
    action: capabilityRef,
    capabilityRef,
    targetRef: "GEN-NODE:001",
    requestedEffect: effect === "READ" ? undefined : `efom.${effect.toLowerCase()}.effect`,
    operationClass,
    physicalWorldContextDigest: "sha256:efom-context-001",
    authorityRefs: ["AUTHORITY:EFOM-OPERATOR"],
    policyRefs: ["POLICY:EFOM-RUNTIME", effectPolicy.policyRef],
    representationSourceRefs: ["GENESIS:REGISTRY-001"],
    requestedAt: "2026-09-10T05:59:00.000Z",
    correlationId: `CORR:${effect}`,
    ...overrides,
  };
}

function allowDecision(req: WardenDecisionRequestV1): WardenDecisionV1 {
  return {
    decisionRef: `WARDEN-DECISION:${req.requestRef}`,
    requestRef: req.requestRef,
    wardenRef: "WARDEN:001",
    action: req.action,
    targetRef: req.targetRef,
    reasonCodes: ["bounded_policy_allow"],
    constraints: [],
    decidedAt: DECIDED_AT,
    validUntil: VALID_UNTIL,
    correlationId: req.correlationId,
    decision: "ALLOW",
    actionToken: `WARDEN-ACTION-TOKEN:${req.requestRef}`,
  };
}

const principal = {
  digitalMeId: "DIGITALME:EFOM-OPERATOR-001",
  authenticatedPrincipalReceiptId: "DIGITALME-PRINCIPAL:EFOM-001",
};

describe("OSIRIS-EFOM-RUNTIME-AUTHZ-R0-1", () => {
  it("allows READ + OBSERVE when existing bindings are valid", () => {
    const effectPolicy = buildRuntimeEffectPolicyV1({ "efom.read": "READ" });
    const req = request(effectPolicy, "READ", "OBSERVE");
    const receipt = buildRuntimeWardenDecisionReceipt({
      request: req,
      decision: allowDecision(req),
      principal,
      effectPolicy,
    });
    expect(receipt.decision).toBe("ALLOW");
    expect(receipt.action_binding.effect_class).toBe("READ");
  });

  it("rejects EXECUTE + OBSERVE and PHYSICAL + INFER", () => {
    const executePolicy = buildRuntimeEffectPolicyV1({ "efom.execute": "EXECUTE" });
    const executeReq = request(executePolicy, "EXECUTE", "OBSERVE");
    expect(() =>
      buildRuntimeWardenDecisionReceipt({
        request: executeReq,
        decision: allowDecision(executeReq),
        principal,
        effectPolicy: executePolicy,
      }),
    ).toThrow("consequential runtime effect requires ACT operation class");

    const physicalPolicy = buildRuntimeEffectPolicyV1({ "efom.physical": "PHYSICAL" });
    const physicalReq = request(physicalPolicy, "PHYSICAL", "INFER");
    expect(() =>
      buildRuntimeWardenDecisionReceipt({
        request: physicalReq,
        decision: allowDecision(physicalReq),
        principal,
        effectPolicy: physicalPolicy,
      }),
    ).toThrow("consequential runtime effect requires ACT operation class");
  });

  it("allows FINANCIAL + ACT when all existing bindings are valid", () => {
    const effectPolicy = buildRuntimeEffectPolicyV1({ "efom.financial": "FINANCIAL" });
    const req = request(effectPolicy, "FINANCIAL", "ACT");
    const receipt = buildRuntimeWardenDecisionReceipt({
      request: req,
      decision: allowDecision(req),
      principal,
      effectPolicy,
    });
    expect(receipt.decision).toBe("ALLOW");
    expect(receipt.action_binding.effect_class).toBe("FINANCIAL");
  });

  it("binds operation class and physical-world context digest into request digest", () => {
    const effectPolicy = buildRuntimeEffectPolicyV1({ "efom.read": "READ" });
    const observe = request(effectPolicy, "READ", "OBSERVE");
    const infer = request(effectPolicy, "READ", "INFER");
    const changedContext = request(effectPolicy, "READ", "OBSERVE", {
      physicalWorldContextDigest: "sha256:efom-context-002",
    });

    const receipt = (req: WardenDecisionRequestV1) =>
      buildRuntimeWardenDecisionReceipt({
        request: req,
        decision: allowDecision(req),
        principal,
        effectPolicy,
      });

    expect(receipt(infer).action_binding.request_digest).not.toBe(
      receipt(observe).action_binding.request_digest,
    );
    expect(receipt(changedContext).action_binding.request_digest).not.toBe(
      receipt(observe).action_binding.request_digest,
    );
  });
});
