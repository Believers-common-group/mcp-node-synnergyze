import type {
  EfomOperationClassV1,
  EfomPhysicalWorldContextV1,
  EfomVisibilityScopeV1,
} from "./contracts.ts";

export type EfomPolicyDecisionV1 = "ADMISSIBLE" | "REVIEW_REQUIRED" | "REJECTED";

export interface EfomPolicyV1 {
  policyRef: string;
  allowedOperationClasses: readonly EfomOperationClassV1[];
  minimumObservationConfidence: number;
  requireCorroborationForOperationClasses: readonly EfomOperationClassV1[];
  manualReviewOnConflict: boolean;
  allowedVisibilityScopes: readonly EfomVisibilityScopeV1[];
  allowedPurposeRefs: readonly string[];
  allowedJurisdictionRefs: readonly string[];
}

export interface EfomPolicyEvaluationV1 {
  decision: EfomPolicyDecisionV1;
  reasonCodes: readonly string[];
  evidenceRefs: readonly string[];
}

function stableUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function instant(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function evidenceRefs(context: EfomPhysicalWorldContextV1): string[] {
  return stableUnique([
    ...context.observations.flatMap((value) => value.sourceEvidenceRefs),
    ...context.findings.flatMap((value) => value.sourceEvidenceRefs),
    ...context.discrepancies.flatMap((value) => value.sourceEvidenceRefs),
    ...context.attestations.flatMap((value) => value.evidenceRefs),
  ]);
}

function result(
  decision: EfomPolicyDecisionV1,
  reasonCodes: readonly string[],
  context: EfomPhysicalWorldContextV1,
): EfomPolicyEvaluationV1 {
  return {
    decision,
    reasonCodes: stableUnique(reasonCodes),
    evidenceRefs: evidenceRefs(context),
  };
}

function reject(reason: string, context: EfomPhysicalWorldContextV1): EfomPolicyEvaluationV1 {
  return result("REJECTED", [reason], context);
}

function review(reason: string, context: EfomPhysicalWorldContextV1): EfomPolicyEvaluationV1 {
  return result("REVIEW_REQUIRED", [reason], context);
}

export function evaluateEfomPolicyV1(input: {
  context: EfomPhysicalWorldContextV1;
  policy: EfomPolicyV1;
  evaluatedAt: string;
}): EfomPolicyEvaluationV1 {
  const { context, policy } = input;
  const evaluatedAt = instant(input.evaluatedAt);
  if (evaluatedAt === undefined) return reject("efom_invalid_time_context", context);

  if (
    !Number.isFinite(policy.minimumObservationConfidence) ||
    policy.minimumObservationConfidence < 0 ||
    policy.minimumObservationConfidence > 1
  ) {
    return reject("efom_invalid_policy", context);
  }

  if (!policy.allowedOperationClasses.includes(context.operationClass)) {
    return reject("efom_operation_not_permitted", context);
  }

  for (const observation of context.observations) {
    if (
      !observation.sourceRef.trim() ||
      !observation.contentDigest.trim() ||
      observation.sourceEvidenceRefs.length === 0
    ) {
      return reject("efom_provenance_missing", context);
    }
    if (!Number.isFinite(observation.confidence) || observation.confidence < 0 || observation.confidence > 1) {
      return reject("efom_invalid_confidence", context);
    }

    const observedAt = instant(observation.observedAt);
    if (observedAt === undefined) return reject("efom_invalid_time_context", context);
    if (observedAt > evaluatedAt) return reject("efom_observation_from_future", context);

    if (observation.validUntil) {
      const validUntil = instant(observation.validUntil);
      if (validUntil === undefined || validUntil < observedAt) {
        return reject("efom_invalid_time_context", context);
      }
      if (
        validUntil < evaluatedAt &&
        ["ACT", "ATTEST", "DISCLOSE"].includes(context.operationClass)
      ) {
        return reject("efom_observation_expired", context);
      }
    }

    if (!policy.allowedVisibilityScopes.includes(observation.visibilityScope)) {
      return reject("efom_visibility_scope_not_permitted", context);
    }
    if (!policy.allowedPurposeRefs.includes(observation.purposeRef)) {
      return reject("efom_purpose_not_permitted", context);
    }
    if (
      !observation.jurisdictionRef ||
      !policy.allowedJurisdictionRefs.includes(observation.jurisdictionRef)
    ) {
      return reject("efom_jurisdiction_not_permitted", context);
    }
  }

  for (const finding of context.findings) {
    if (!finding.statementDigest.trim() || finding.sourceEvidenceRefs.length === 0) {
      return reject("efom_provenance_missing", context);
    }
    if (!Number.isFinite(finding.confidence) || finding.confidence < 0 || finding.confidence > 1) {
      return reject("efom_invalid_confidence", context);
    }
    const derivedAt = instant(finding.derivedAt);
    if (derivedAt === undefined) return reject("efom_invalid_time_context", context);
    if (derivedAt > evaluatedAt) return reject("efom_context_from_future", context);
  }

  for (const discrepancy of context.discrepancies) {
    if (discrepancy.sourceEvidenceRefs.length === 0) {
      return reject("efom_provenance_missing", context);
    }
    const openedAt = instant(discrepancy.openedAt);
    if (openedAt === undefined) return reject("efom_invalid_time_context", context);
    if (openedAt > evaluatedAt) return reject("efom_context_from_future", context);
  }

  for (const attestation of context.attestations) {
    if (
      !attestation.attestorPrincipalRef.trim() ||
      !attestation.statementDigest.trim() ||
      attestation.authorityRefs.length === 0 ||
      attestation.evidenceRefs.length === 0
    ) {
      return reject("efom_provenance_missing", context);
    }
    const issuedAt = instant(attestation.issuedAt);
    if (issuedAt === undefined) return reject("efom_invalid_time_context", context);
    if (issuedAt > evaluatedAt) return reject("efom_context_from_future", context);
  }

  const lowConfidence = [
    ...context.observations.map((value) => value.confidence),
    ...context.findings.map((value) => value.confidence),
  ].some((confidence) => confidence < policy.minimumObservationConfidence);
  if (lowConfidence) return review("efom_confidence_below_threshold", context);

  const materialConflict =
    context.discrepancies.some((value) => value.material) ||
    context.findings.some((value) => value.status === "CONFLICTED");
  if (materialConflict) {
    return policy.manualReviewOnConflict
      ? review("efom_material_conflict", context)
      : reject("efom_material_conflict", context);
  }

  if (policy.requireCorroborationForOperationClasses.includes(context.operationClass)) {
    const corroborated =
      context.findings.some((value) => value.status === "CORROBORATED") ||
      context.attestations.length > 0;
    if (!corroborated) {
      return reject(
        context.operationClass === "ACT"
          ? "efom_action_from_unverified_observation"
          : "efom_corroboration_required",
        context,
      );
    }
  }

  return result("ADMISSIBLE", ["efom_policy_admissible"], context);
}
