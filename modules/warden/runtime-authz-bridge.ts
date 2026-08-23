import { createHash } from "node:crypto";

import type { WardenDecisionRequestV1, WardenDecisionV1 } from "./contracts.ts";

export type RuntimeEffectClass =
  | "READ"
  | "WRITE"
  | "EXECUTE"
  | "FINANCIAL"
  | "PHYSICAL"
  | "EXTERNAL_PROVIDER";

export interface AuthenticatedPrincipalBindingV1 {
  digitalMeId: string;
  authenticatedPrincipalReceiptId: string;
}

export interface RuntimeEffectPolicyV1 {
  policyRef: string;
  capabilityEffectClasses: Readonly<Record<string, RuntimeEffectClass>>;
}

export interface RuntimeDecisionBridgeInputV1 {
  request: WardenDecisionRequestV1;
  decision: WardenDecisionV1;
  principal: AuthenticatedPrincipalBindingV1;
  effectPolicy: RuntimeEffectPolicyV1;
  consentRefs?: readonly string[];
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

export function buildRuntimeEffectPolicyV1(
  capabilityEffectClasses: Readonly<Record<string, RuntimeEffectClass>>,
): RuntimeEffectPolicyV1 {
  const entries = Object.entries(capabilityEffectClasses).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (entries.length === 0) {
    throw new Error("runtime effect policy must classify at least one capability");
  }
  for (const [capabilityRef, effectClass] of entries) {
    if (!capabilityRef.trim()) {
      throw new Error("runtime effect policy capability ref is required");
    }
    if (
      ![
        "READ",
        "WRITE",
        "EXECUTE",
        "FINANCIAL",
        "PHYSICAL",
        "EXTERNAL_PROVIDER",
      ].includes(effectClass)
    ) {
      throw new Error(`unsupported runtime effect class: ${effectClass}`);
    }
  }
  const canonical = JSON.stringify(Object.fromEntries(entries));
  return {
    policyRef: `RUNTIME-EFFECT-POLICY:${sha256(canonical)}`,
    capabilityEffectClasses: Object.fromEntries(entries),
  };
}

function resolveRuntimeEffectClass(
  request: WardenDecisionRequestV1,
  effectPolicy: RuntimeEffectPolicyV1,
): RuntimeEffectClass {
  const rebuilt = buildRuntimeEffectPolicyV1(effectPolicy.capabilityEffectClasses);
  if (rebuilt.policyRef !== effectPolicy.policyRef) {
    throw new Error("runtime effect policy digest mismatch");
  }
  if (!request.policyRefs.includes(effectPolicy.policyRef)) {
    throw new Error("runtime effect policy is not bound to the Warden request");
  }
  const effectClass = effectPolicy.capabilityEffectClasses[request.capabilityRef];
  if (!effectClass) {
    throw new Error("capability has no governed runtime effect classification");
  }
  return effectClass;
}

function canonicalRequestDigest(request: WardenDecisionRequestV1): string {
  const canonical = JSON.stringify({
    requestRef: request.requestRef,
    actorRef: request.actorRef,
    representedPrincipalRef: request.representedPrincipalRef,
    actingCapacityRef: request.actingCapacityRef,
    contextRef: request.contextRef,
    programRef: request.programRef,
    eventRef: request.eventRef,
    action: request.action,
    capabilityRef: request.capabilityRef,
    targetRef: request.targetRef,
    requestedEffect: request.requestedEffect ?? null,
    executionDeviceRef: request.executionDeviceRef ?? null,
    deviceSecurityState: request.deviceSecurityState ?? null,
    deviceSecurityPolicyRef: request.deviceSecurityPolicyRef ?? null,
    deviceSecuritySourceRefs: stableUnique(request.deviceSecuritySourceRefs ?? []),
    deviceSecurityResolvedAt: request.deviceSecurityResolvedAt ?? null,
    deviceSecurityValidUntil: request.deviceSecurityValidUntil ?? null,
    authorityRefs: stableUnique(request.authorityRefs),
    policyRefs: stableUnique(request.policyRefs),
    representationSourceRefs: stableUnique(request.representationSourceRefs),
    evidenceReadinessRef: request.evidenceReadinessRef ?? null,
    requestedAt: request.requestedAt,
    correlationId: request.correlationId,
  });
  return sha256(canonical);
}

function assertDecisionMatchesRequest(
  request: WardenDecisionRequestV1,
  decision: WardenDecisionV1,
): void {
  if (decision.requestRef !== request.requestRef) {
    throw new Error("decision/request reference mismatch");
  }
  if (decision.action !== request.action) throw new Error("decision/action mismatch");
  if (decision.targetRef !== request.targetRef) throw new Error("decision/target mismatch");
  if (decision.correlationId !== request.correlationId) {
    throw new Error("decision/correlation mismatch");
  }
  if (!decision.validUntil) {
    throw new Error("decision validUntil is required for Runtime Stitcher");
  }
  const issued = Date.parse(decision.decidedAt);
  const expires = Date.parse(decision.validUntil);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || expires <= issued) {
    throw new Error("decision validity window is invalid");
  }
}

export function buildRuntimeWardenDecisionReceipt(input: RuntimeDecisionBridgeInputV1) {
  const { request, decision, principal } = input;
  assertDecisionMatchesRequest(request, decision);
  if (!principal.digitalMeId || !principal.authenticatedPrincipalReceiptId) {
    throw new Error("principal binding is required");
  }
  if (principal.digitalMeId !== request.actorRef) {
    throw new Error("authenticated DigitalMe principal does not match Warden actorRef");
  }

  const effectClass = resolveRuntimeEffectClass(request, input.effectPolicy);
  if (!request.requestedEffect && effectClass !== "READ") {
    throw new Error("non-READ Runtime Stitcher action requires requestedEffect binding");
  }
  if (!request.policyRefs.length) throw new Error("policyRefs are required");

  const requestDigest = canonicalRequestDigest(request);
  const receiptDecision = decision.decision === "ALLOW" ? "ALLOW" : "DENY";
  if (receiptDecision === "ALLOW" && request.authorityRefs.length === 0) {
    throw new Error("ALLOW requires authority refs");
  }

  const reasonCodes = stableUnique([
    ...decision.reasonCodes,
    ...(decision.decision === "ESCALATE" ? ["WARDEN_ESCALATE_REQUIRES_REVIEW"] : []),
  ]);

  const core = {
    schema_id: "warden:decision" as const,
    profile_id: "runtime-exact-action-authorization/v1" as const,
    contract_version: "1.0" as const,
    decision_receipt_id: decision.decisionRef,
    decision: receiptDecision,
    principal_binding: {
      digitalme_id: principal.digitalMeId,
      authenticated_principal_receipt_id: principal.authenticatedPrincipalReceiptId,
    },
    action_binding: {
      action_id: request.action,
      capability_id: request.capabilityRef,
      resource_id: request.targetRef,
      effect_class: effectClass,
      request_digest: requestDigest,
      ...(request.requestedEffect ? { effect_binding: request.requestedEffect } : {}),
    },
    ...(receiptDecision === "ALLOW" ? { authority_refs: stableUnique(request.authorityRefs) } : {}),
    ...(input.consentRefs?.length ? { consent_refs: stableUnique(input.consentRefs) } : {}),
    policy_refs: stableUnique(request.policyRefs),
    ...(decision.decision === "ALLOW"
      ? {
          grant_binding: {
            grant_id: decision.decisionRef,
            authorization_token_digest: sha256(decision.actionToken),
          },
        }
      : {}),
    reason_codes: reasonCodes,
    issued_at: decision.decidedAt,
    expires_at: decision.validUntil,
    correlation_id: request.correlationId,
  };

  return { ...core, decision_digest: sha256(JSON.stringify(core)) };
}
