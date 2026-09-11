import { createHash } from "node:crypto";

import type { EfomPhysicalWorldContextV1 } from "../osiris/contracts.ts";
import {
  evaluateEfomPolicyV1,
  type EfomPolicyV1,
} from "../osiris/policy.ts";
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
  efomPolicy?: EfomPolicyV1;
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

function canonicalPhysicalWorldContext(context: EfomPhysicalWorldContextV1) {
  return {
    operationClass: context.operationClass,
    observations: [...context.observations]
      .sort((left, right) => left.observationRef.localeCompare(right.observationRef))
      .map((value) => ({
        observationRef: value.observationRef,
        sourceRef: value.sourceRef,
        sourceType: value.sourceType,
        subjectCandidateRef: value.subjectCandidateRef ?? null,
        locationRef: value.locationRef ?? null,
        terrainClass: value.terrainClass ?? null,
        observedAt: value.observedAt,
        validUntil: value.validUntil ?? null,
        contentDigest: value.contentDigest,
        sourceEvidenceRefs: stableUnique(value.sourceEvidenceRefs),
        confidence: value.confidence,
        assuranceLevel: value.assuranceLevel ?? null,
        visibilityScope: value.visibilityScope,
        jurisdictionRef: value.jurisdictionRef ?? null,
        purposeRef: value.purposeRef,
        synthetic: value.synthetic ?? null,
      })),
    findings: [...context.findings]
      .sort((left, right) => left.findingRef.localeCompare(right.findingRef))
      .map((value) => ({
        findingRef: value.findingRef,
        findingType: value.findingType,
        observationRefs: stableUnique(value.observationRefs),
        statementDigest: value.statementDigest,
        confidence: value.confidence,
        derivedAt: value.derivedAt,
        validUntil: value.validUntil ?? null,
        sourceEvidenceRefs: stableUnique(value.sourceEvidenceRefs),
        status: value.status,
        supersedesFindingRef: value.supersedesFindingRef ?? null,
      })),
    discrepancies: [...context.discrepancies]
      .sort((left, right) => left.discrepancyRef.localeCompare(right.discrepancyRef))
      .map((value) => ({
        discrepancyRef: value.discrepancyRef,
        discrepancyType: value.discrepancyType,
        observationRefs: stableUnique(value.observationRefs),
        findingRefs: stableUnique(value.findingRefs),
        severity: value.severity,
        material: value.material,
        openedAt: value.openedAt,
        sourceEvidenceRefs: stableUnique(value.sourceEvidenceRefs),
      })),
    attestations: [...context.attestations]
      .sort((left, right) => left.attestationRef.localeCompare(right.attestationRef))
      .map((value) => ({
        attestationRef: value.attestationRef,
        attestorPrincipalRef: value.attestorPrincipalRef,
        authorityRefs: stableUnique(value.authorityRefs),
        evidenceRefs: stableUnique(value.evidenceRefs),
        statementDigest: value.statementDigest,
        issuedAt: value.issuedAt,
        validUntil: value.validUntil ?? null,
        supersedesAttestationRef: value.supersedesAttestationRef ?? null,
      })),
  };
}

export function physicalWorldContextDigestV1(context: EfomPhysicalWorldContextV1): string {
  return `sha256:${digest(JSON.stringify(canonicalPhysicalWorldContext(context)))}`;
}

function normalizedRequestForDecision(request: WardenDecisionRequestV1) {
  return {
    ...request,
    physicalWorldContext: request.physicalWorldContext
      ? physicalWorldContextDigestV1(request.physicalWorldContext)
      : undefined,
    authorityRefs: stableUnique(request.authorityRefs),
    policyRefs: stableUnique(request.policyRefs),
    representationSourceRefs: stableUnique(request.representationSourceRefs),
    deviceSecuritySourceRefs: stableUnique(request.deviceSecuritySourceRefs ?? []),
  };
}

function normalizedPolicyForDecision(policy: SyntheticWardenDecisionPolicyV1) {
  return {
    ...policy,
    requiredAuthorityRefs: stableUnique(policy.requiredAuthorityRefs),
    requiredPolicyRefs: stableUnique(policy.requiredPolicyRefs),
    allowedCapabilityRefs: stableUnique(policy.allowedCapabilityRefs),
    manualReviewCapabilityRefs: stableUnique(policy.manualReviewCapabilityRefs),
    constraints: stableUnique(policy.constraints),
    efomPolicy: policy.efomPolicy
      ? {
          ...policy.efomPolicy,
          allowedOperationClasses: stableUnique(policy.efomPolicy.allowedOperationClasses),
          requireCorroborationForOperationClasses: stableUnique(
            policy.efomPolicy.requireCorroborationForOperationClasses,
          ),
          allowedVisibilityScopes: stableUnique(policy.efomPolicy.allowedVisibilityScopes),
          allowedPurposeRefs: stableUnique(policy.efomPolicy.allowedPurposeRefs),
          allowedJurisdictionRefs: stableUnique(policy.efomPolicy.allowedJurisdictionRefs),
        }
      : undefined,
  };
}

function effectiveDecisionValidUntil(
  request: WardenDecisionRequestV1,
  policy: SyntheticWardenDecisionPolicyV1,
): string {
  const candidates: Array<{ raw: string; time: number }> = [];
  const policyTime = timestamp(policy.validUntil);
  if (policyTime !== undefined) candidates.push({ raw: policy.validUntil, time: policyTime });

  if (request.physicalWorldContext) {
    for (const raw of [
      ...request.physicalWorldContext.observations.map((value) => value.validUntil),
      ...request.physicalWorldContext.findings.map((value) => value.validUntil),
      ...request.physicalWorldContext.attestations.map((value) => value.validUntil),
    ]) {
      if (!raw) continue;
      const time = timestamp(raw);
      if (time !== undefined) candidates.push({ raw, time });
    }
  }

  candidates.sort((left, right) => left.time - right.time || left.raw.localeCompare(right.raw));
  return candidates[0]?.raw ?? policy.validUntil;
}

function baseDecision(
  request: WardenDecisionRequestV1,
  policy: SyntheticWardenDecisionPolicyV1,
  decidedAt: string,
  reasonCodes: readonly string[],
) {
  const validUntil = effectiveDecisionValidUntil(request, policy);
  const canonical = JSON.stringify({
    request: normalizedRequestForDecision(request),
    policy: normalizedPolicyForDecision(policy),
    decidedAt,
    validUntil,
    reasonCodes: stableUnique(reasonCodes),
  });

  return {
    decisionRef: `WARDEN-DECISION:${digest(canonical).slice(0, 24)}`,
    requestRef: request.requestRef,
    wardenRef: policy.wardenRef,
    action: request.action,
    targetRef: request.targetRef,
    ...(request.operationClass ? { operationClass: request.operationClass } : {}),
    ...(request.physicalWorldContextDigest
      ? { physicalWorldContextDigest: request.physicalWorldContextDigest }
      : {}),
    reasonCodes: stableUnique(reasonCodes),
    constraints: stableUnique(policy.constraints),
    decidedAt,
    validUntil,
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

function evaluateEfomContext(
  request: WardenDecisionRequestV1,
  policy: SyntheticWardenDecisionPolicyV1,
  decidedAt: string,
): { decision: "CONTINUE" } | { decision: "DENY" | "ESCALATE"; reason: string } {
  const activated = Boolean(
    request.operationClass || request.physicalWorldContext || request.physicalWorldContextDigest,
  );
  if (!activated) return { decision: "CONTINUE" };

  if (
    !request.operationClass ||
    !request.physicalWorldContext ||
    !request.physicalWorldContextDigest ||
    !policy.efomPolicy
  ) {
    return { decision: "DENY", reason: "efom_context_missing" };
  }
  if (request.operationClass !== request.physicalWorldContext.operationClass) {
    return { decision: "DENY", reason: "efom_operation_context_mismatch" };
  }
  if (request.physicalWorldContextDigest !== physicalWorldContextDigestV1(request.physicalWorldContext)) {
    return { decision: "DENY", reason: "efom_context_digest_mismatch" };
  }

  const evaluation = evaluateEfomPolicyV1({
    context: request.physicalWorldContext,
    policy: policy.efomPolicy,
    evaluatedAt: decidedAt,
  });
  const reason = evaluation.reasonCodes[0] ?? "efom_context_rejected";
  if (evaluation.decision === "REJECTED") return { decision: "DENY", reason };
  if (evaluation.decision === "REVIEW_REQUIRED") return { decision: "ESCALATE", reason };
  return { decision: "CONTINUE" };
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

  if (decidedAtMs < requestedAtMs) {
    return deny(request, policy, decidedAt, "decision_before_request");
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

  const efom = evaluateEfomContext(request, policy, decidedAt);
  if (efom.decision === "DENY") return deny(request, policy, decidedAt, efom.reason);
  if (efom.decision === "ESCALATE") return escalate(request, policy, decidedAt, efom.reason);

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
    operationClass: request.operationClass ?? null,
    physicalWorldContextDigest: request.physicalWorldContextDigest ?? null,
    validUntil: base.validUntil,
  });

  return {
    ...base,
    decision: "ALLOW",
    actionToken: `WARDEN-ACTION-TOKEN:${digest(tokenSeed).slice(0, 32)}`,
  };
}
