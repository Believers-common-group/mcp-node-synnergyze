import { describe, expect, it } from "vitest";

import type { PestelReviewWorkCandidateV1 } from "../synnergyze/pestel-work-bridge.ts";
import type { ResolvedRepresentationContextV1 } from "../synnergyze/warden-request-bridge.ts";
import { buildPestelConsequentialWardenRequestV1 } from "./pestel-review-request.ts";

const workCandidate: PestelReviewWorkCandidateV1 = {
  workRef: "SYNNERGYZE-PESTEL-WORK:test",
  sourceEventRef: "LEG-EVENT:test",
  signalRef: "PESTEL-SIGNAL:test",
  briefRef: "PESTEL-BRIEF:test",
  registryCandidateRefs: ["REGISTRY-IMPACT:test"],
  state: "REVIEW_CANDIDATE",
  authorized: false,
  evidenceRefs: ["LEG-SOURCE:test"],
  correlationId: "PESTEL-CORRELATION:test",
};

const representation: ResolvedRepresentationContextV1 = {
  resolutionRef: "REPRESENTATION:TEST",
  actorRef: "ACTOR:TEST",
  representedPrincipalRef: "PRINCIPAL:TEST",
  actingCapacityRef: "CAPACITY:LEGAL-REVIEWER",
  contextRef: "CONTEXT:LEGAL-REVIEW",
  authorityRefs: ["AUTHORITY:TEST"],
  policyRefs: ["POLICY:TEST"],
  sourceRefs: ["REPRESENTATION-SOURCE:TEST"],
  resolvedAt: "2026-09-02T00:00:00.000Z",
};

describe("buildPestelConsequentialWardenRequestV1", () => {
  it("routes a consequential proposal through the existing Warden request bridge", () => {
    const result = buildPestelConsequentialWardenRequestV1({
      workCandidate,
      proposal: {
        proposalRef: "PESTEL-ACTION:001",
        action: "notification.send",
        capabilityRef: "external_notification.send",
        targetRef: "WORKSPACE:LEGAL-REVIEW",
        requestedEffect: "Send an evidence-backed legislative alert outside the bounded workspace",
        evidenceRefs: ["RIVER-LEG-EVIDENCE:test"],
      },
      representation,
      requestedAt: "2026-09-02T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.capabilityRef).toBe("external_notification.send");
    expect(result.request.authorityRefs).toEqual(["AUTHORITY:TEST"]);
    expect(result.request.authorityRefs).not.toContain("RIVER-LEG-EVIDENCE:test");
    expect(result.request).not.toHaveProperty("actionToken");
  });
});
