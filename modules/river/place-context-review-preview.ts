import { createHash } from "node:crypto";
import type { Resolution } from "../genesis-place-context/contracts.ts";

/**
 * River-style local receipt: no River append, reservation, seal, or persistence.
 * Never include Warden action tokens, raw source documents or private facts.
 */
export interface PlaceReviewPreviewG2 {
  schemaVersion: "PLACE-REVIEW-DRYRUN:G2";
  evidenceRef: string;
  persistenceState: "NOT_PERSISTED_DRY_RUN";
  sourceVerificationState: "SYNTHETIC_UNTRUSTED";
  authorityState: "NO_AUTHORITY_ISSUED";
  effectState: "NO_EXECUTION";
  contextResolutionRef: string;
  contextDigest: string;
  envelopeRef: string;
  envelopeVersion: string;
  actorRef: string;
  estateRef: string;
  placeRef: string;
  requestRef?: string;
  syntheticWardenDecisionRef?: string;
  syntheticDecision: "SIMULATED_ALLOW" | "SIMULATED_ESCALATE" | "SIMULATED_DENY" | "NOT_EVALUATED";
  reviewState: "REVIEW_ONLY" | "HOLD";
  reasonCodes: readonly string[];
}

export interface BuildPlaceReviewPreviewInputG2 {
  resolution: Resolution;
  requestRef?: string;
  decisionRef?: string;
  syntheticDecision: PlaceReviewPreviewG2["syntheticDecision"];
  reviewState: PlaceReviewPreviewG2["reviewState"];
  reasons: readonly string[];
}

export function buildPlaceReviewPreviewG2(input: BuildPlaceReviewPreviewInputG2): PlaceReviewPreviewG2 {
  const resolution = input.resolution;
  const canonical = {
    schemaVersion: "PLACE-REVIEW-DRYRUN:G2" as const,
    persistenceState: "NOT_PERSISTED_DRY_RUN" as const,
    sourceVerificationState: "SYNTHETIC_UNTRUSTED" as const,
    authorityState: "NO_AUTHORITY_ISSUED" as const,
    effectState: "NO_EXECUTION" as const,
    contextResolutionRef: resolution.resolution_id,
    contextDigest: resolution.source_digest,
    envelopeRef: resolution.envelope_id,
    envelopeVersion: resolution.envelope_version,
    actorRef: resolution.actor_digitalme_ref,
    estateRef: resolution.estate_id,
    placeRef: resolution.place_id,
    ...(input.requestRef ? { requestRef: input.requestRef } : {}),
    ...(input.decisionRef ? { syntheticWardenDecisionRef: input.decisionRef } : {}),
    syntheticDecision: input.syntheticDecision,
    reviewState: input.reviewState,
    reasonCodes: [...new Set(input.reasons)].sort(),
  };
  const digest = createHash("sha256").update(JSON.stringify(canonical), "utf8").digest("hex");
  return { evidenceRef: "RIVER-PREVIEW:" + digest.slice(0, 32), ...canonical };
}
