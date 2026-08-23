import { createHash } from "node:crypto";

import type { WardenDecisionRequestV1, WardenDecisionV1 } from "./contracts.ts";

export type WardenPolicyLifecycleV1 = "ACTIVE" | "REVOKED";

export interface SyntheticWardenDecisionPolicyV1 {
  policySnapshotRef: string;
  wardenRef: string;
  lifecycle: WardenPolicyLifecycleV1;
  validFrom: string;
  validUntil: string;
  actorRef: string;
  representedPrincipalRef: string;
  actingCapacityRef: string;
  contextRef: string;
  programRef: string;
  requiredAuthorityRefs: readonly string[];
  requiredPolicyRefs: readonly string[];
  allowedCapabilityRefs: readonly string[];
  manualReviewCapabilityRefs: readonly string[];
  constraints: readonly string[];
}

export interface WardenDecisionEvaluationV1 {
  request: WardenDecisionRequestV1;
  policy: SyntheticWardenDecisionPolicyV1;
  decidedAt: string;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function includesAll(actual: readonly string[], required: readonly string[]): boolean {
  const values = new Set(actual);
  return required.every((value) => values.has(value));
}

function stableUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function timestamp(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function baseDecision(
  request: WardenDecisionRequestV1,
  policy: SyntheticWardenDecisionPolicyV1,
  decidedAt: string,
  reasonCodes: readonly string[],
) {
  const canonical = JSON.stringify({
    request: {
      ...request,
      authorityRefs: stableUnique(request.authorityRefs),
      policyRefs: stableUnique(request.policyRefs),
      representationSourceRefs: stableUnique(request.representationSourceRefs),
      deviceSecuritySourceRefs: stableUnique(request.deviceSecuritySourceRefs ?? []),
    },
    policy: {
      ...policy,
      requiredAuthorityRefs: stableUnique(policy.requiredAuthorityRefs),
      requiredPolicyRefs: stableUnique(policy.requiredPolicyRefs),
      allowedCapabilityRefs: stableUnique(policy.allowedCapabilityRefs),
      manualReviewCapabilityRefs: stableUnique(policy.manualReviewCapabilityRefs),
      constraints: stableUnique(policy.constraints),
    },
    decidedAt,
    reasonCodes: stableUnique(reasonCodes),
  });

  return {
    decisionRef: `WARDEN-DECISION:${digest(canonical).slice(0, 24)}`,
    requestRef: request.requestRef,
    wardenRef: policy.wardenRef,
    action: request.action,
    targetRef: request.targetRef,
    reasonCodes: stableUnique(reasonCodes),
    constraints: stableUnique(policy.constraints),
    decidedAt,
    validUntil: policy.validUntil,
    correlationId: request.correlationId,
  } as const;
}

function deny(
  request: WardenDecisionRequestV1,
  policy: SyntheticWardenDecisionPolicyV1,
  decidedAt: string,
  reason: string,
): WardenDecisionV1 {
  return {
    ...baseDecision(request, policy, decidedAt, [reason]),
    decision: "DENY",
  };
}

function escalate(
  request: WardenDecisionRequestV1,
  policy: SyntheticWardenDecisionPolicyV1,
  decidedAt: string,
  reason: string,
): WardenDecisionV1 {
  return {
    ...baseDecision(request, policy, decidedAt, [reason]),
    decision: "ESCALATE",
  };
}

export function evaluateSyntheticWardenDecisionV1(
  evaluation: WardenDecisionEvaluationV1,
): WardenDecisionV1 {
  const { request, policy, decidedAt } = evaluation;

  if (policy.lifecycle !== "ACTIVE") {
    return deny(request, policy, decidedAt, "authority_revoked");
  }

  const requestedAtMs = timestamp(request.requestedAt);
  const decidedAtMs = timestamp(decidedAt);
  const validFromMs = timestamp(policy.validFrom);
  const validUntilMs = timestamp(policy.validUntil);

  if (
    requestedAtMs === undefined ||
    decidedAtMs === undefined ||
    validFromMs === undefined ||
    validUntilMs === undefined ||
    validUntilMs < validFromMs
  ) {
    return deny(request, policy, decidedAt, "invalid_time_context");
  }

  if (decidedAtMs < validFromMs || requestedAtMs < validFromMs) {
    return deny(request, policy, decidedAt, "authority_not_yet_valid");
  }

  if (decidedAtMs > validUntilMs || requestedAtMs > validUntilMs) {
    return deny(request, policy, decidedAt, "authority_expired");
  }

  if (
    request.actorRef !== policy.actorRef ||
    request.representedPrincipalRef !== policy.representedPrincipalRef ||
    request.actingCapacityRef !== policy.actingCapacityRef ||
    request.contextRef !== policy.contextRef ||
    request.programRef !== policy.programRef
  ) {
    return deny(request, policy, decidedAt, "identity_or_context_mismatch");
  }

  if (!includesAll(request.authorityRefs, policy.requiredAuthorityRefs)) {
    return deny(request, policy, decidedAt, "required_authority_missing");
  }

  if (!includesAll(request.policyRefs, policy.requiredPolicyRefs)) {
    return deny(request, policy, decidedAt, "required_policy_missing");
  }

  if (
    request.trustResolution?.result === "CONFLICTED" &&
    request.trustResolution.material &&
    request.trustResolution.irreversibleEffect
  ) {
    return escalate(request, policy, decidedAt, "material_trust_conflict");
  }

  if (request.trustResolution?.result === "HOLD") {
    const reason = request.trustResolution.reasonCodes?.[0] ?? "unspecified";
    return escalate(request, policy, decidedAt, `trust_hold:${reason}`);
  }

  if (policy.manualReviewCapabilityRefs.includes(request.capabilityRef)) {
    return escalate(request, policy, decidedAt, "manual_review_required");
  }

  if (!policy.allowedCapabilityRefs.includes(request.capabilityRef)) {
    return deny(request, policy, decidedAt, "capability_not_permitted");
  }

  const base = baseDecision(request, policy, decidedAt, ["bounded_policy_allow"]);
  const tokenSeed = JSON.stringify({
    decisionRef: base.decisionRef,
    requestRef: request.requestRef,
    capabilityRef: request.capabilityRef,
    targetRef: request.targetRef,
    policySnapshotRef: policy.policySnapshotRef,
    validUntil: policy.validUntil,
  });

  return {
    ...base,
    decision: "ALLOW",
    actionToken: `WARDEN-ACTION-TOKEN:${digest(tokenSeed).slice(0, 32)}`,
  };
}
