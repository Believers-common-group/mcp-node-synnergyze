import { createHash } from "node:crypto";
import type { WardenDecisionRequestV1 } from "../warden/contracts.ts";
import { evaluateSyntheticWardenDecisionV1, type SyntheticWardenDecisionPolicyV1 } from "../warden/decision-service.ts";
import type { Resolution } from "./contracts.ts";
import { buildPlaceReviewPreviewG2, type PlaceReviewPreviewG2 } from "../river/place-context-review-preview.ts";

export interface PlaceReviewInputG2 {
  /** Explicit sandbox capability only. No real-world use is admitted. */
  mode: "SYNTHETIC_ONLY";
  resolution: Resolution;
  representedPrincipalRef: string;
  actingCapacityRef: string;
  authorityRefs: readonly string[];
  representationSourceRefs: readonly string[];
  programRef: string;
  correlationId: string;
  policyRef: string;
  policy: SyntheticWardenDecisionPolicyV1;
  requestedAt: string;
  decidedAt: string;
}
export interface PlaceReviewG2 {
  reviewState: "REVIEW_ONLY" | "HOLD";
  /** No actual Warden authority or valid provider execution route is issued. */
  simulatedWardenDecision: PlaceReviewPreviewG2["syntheticDecision"];
  evidencePreview: PlaceReviewPreviewG2;
}
function instant(value: string): number | undefined {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)) return undefined;
  const at = Date.parse(value); return Number.isFinite(at) ? at : undefined;
}
const present = (s: string) => !!s && s.trim().length > 0;
const nonempty = (values: readonly string[]) => values.length > 0 && values.every(present);
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");

export function reviewPlaceContextG2(input: PlaceReviewInputG2): PlaceReviewG2 {
  const r = input.resolution;
  const reasons: string[] = [];
  const requested = instant(input.requestedAt);
  const decided = instant(input.decidedAt);
  const resolved = instant(r.evaluated_at);
  const occurs = instant(r.activity_occurred_at);
  if (input.mode !== "SYNTHETIC_ONLY") reasons.push("MODE_REJECTED");
  if (r.resolver_version !== "G1-SANDBOX" || !r.limitations.includes("NO_LIVE_SOURCE_ADAPTERS_BUNDLED") ||
      !r.limitations.includes("CONTEXT_ONLY_NOT_AUTHORITY")) reasons.push("UNTRUSTED_RESOLUTION_LINEAGE");
  if (r.resolution_status !== "COMPLETE" || !r.source_set_verified ||
      r.unresolved_requirement_refs.length || !nonempty(r.applied_requirement_refs)) reasons.push("CONTEXT_NOT_COMPLETE");
  if (!/^[a-f0-9]{64}$/i.test(r.source_digest) ||
      r.resolution_id !== "CONTEXT:" + r.source_digest.slice(0, 24)) reasons.push("CONTEXT_DIGEST_REFERENCE_INVALID");
  if (!present(r.actor_digitalme_ref) || !present(r.estate_id) || !present(r.place_id) ||
      !present(r.envelope_id) || !present(r.envelope_version) || !present(r.binding_id) ||
      !present(r.context_facts_ref)) reasons.push("CONTEXT_IDENTITY_MISSING");
  if (requested === undefined || decided === undefined || resolved === undefined || occurs === undefined ||
      requested < resolved! || resolved! < occurs! || decided < requested!) reasons.push("TIME_INVALID");
  if (!present(input.representedPrincipalRef) || !present(input.actingCapacityRef) ||
      !present(input.programRef) || !present(input.policyRef) || !present(input.correlationId) ||
      !nonempty(input.authorityRefs) || !nonempty(input.representationSourceRefs)) reasons.push("REPRESENTATION_INCOMPLETE");
  if (input.policy.policySnapshotRef !== input.policyRef ||
      !input.policy.constraints.includes("SYNTHETIC_CONFORMANCE_ONLY") ||
      !input.policy.constraints.includes("NO_EXTERNAL_EFFECT") ||
      !input.policy.allowedCapabilityRefs.includes("place_context.review") ||
      !input.policy.requiredPolicyRefs.includes(input.policyRef)) reasons.push("NON_SYNTHETIC_POLICY");
  if (reasons.length) return {
    reviewState: "HOLD", simulatedWardenDecision: "NOT_EVALUATED",
    evidencePreview: buildPlaceReviewPreviewG2({
      resolution: r, syntheticDecision: "NOT_EVALUATED", reviewState: "HOLD", reasons,
    }),
  };

  // Build the exact read-only review request; caller cannot supply a runtime capability/effect.
  const correlation = input.correlationId;
  const contextRef = "PLACE:" + r.estate_id + ":" + r.place_id;
  const refs = [...new Set([
    ...input.representationSourceRefs, r.resolution_id, "SOURCE-DIGEST:" + r.source_digest,
  ])].sort();
  const requestIdentity = {
    resolution: r.resolution_id, digest: r.source_digest,
    actor: r.actor_digitalme_ref, context: contextRef, correlation,
    program: input.programRef, principal: input.representedPrincipalRef,
    policy: input.policyRef,
  };
  const request: WardenDecisionRequestV1 = {
    requestRef: "WARDEN-REQUEST:" + digest(requestIdentity).slice(0, 20),
    actorRef: r.actor_digitalme_ref,
    representedPrincipalRef: input.representedPrincipalRef,
    actingCapacityRef: input.actingCapacityRef,
    contextRef, programRef: input.programRef, eventRef: r.resolution_id,
    action: "place_context.review", capabilityRef: "place_context.review",
    targetRef: r.place_id, authorityRefs: [...new Set(input.authorityRefs)].sort(),
    policyRefs: [input.policyRef], representationSourceRefs: refs,
    requestedAt: input.requestedAt, correlationId: correlation,
  };
  // Existing synthetic Warden evaluator may internally make an action token.
  // The token must never enter the return value, River preview or any effect path.
  const decision = evaluateSyntheticWardenDecisionV1({
    request, policy: input.policy, decidedAt: input.decidedAt,
  });
  const synthetic = decision.decision === "ALLOW" ? "SIMULATED_ALLOW" :
    decision.decision === "ESCALATE" ? "SIMULATED_ESCALATE" : "SIMULATED_DENY";
  return {
    reviewState: decision.decision === "ALLOW" ? "REVIEW_ONLY" : "HOLD",
    simulatedWardenDecision: synthetic,
    evidencePreview: buildPlaceReviewPreviewG2({
      resolution: r, requestRef: request.requestRef, decisionRef: decision.decisionRef,
      syntheticDecision: synthetic,
      reviewState: decision.decision === "ALLOW" ? "REVIEW_ONLY" : "HOLD",
      reasons: decision.reasonCodes,
    }),
  };
}
