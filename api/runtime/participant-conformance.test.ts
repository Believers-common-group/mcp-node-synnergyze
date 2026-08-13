import { describe, expect, it } from "vitest";

import type {
  RegistryResolutionBundle,
  WardenAuthorizationResult,
} from "./program-event-contract.js";
import { assessBnrParticipantConformance } from "./participant-conformance.js";

function resolved(): RegistryResolutionBundle {
  return {
    requestRef: "registry-request:test:participant",
    r1: "RESOLVED",
    r2: "RESOLVED",
    r3: "REQUIRES_AUTHORIZATION",
    r4: "RESOLVED",
    r5: "RESOLVED",
    candidateAction: "ENTER_QUANTUM_ROOM",
    unmetRequirementRefs: [],
    authorityRefs: ["authority:test:participation"],
    evidenceRequirementRefs: ["evidence:test:identity"],
    expectedEffectRefs: ["effect:test:entry"],
    economicContextRefs: [],
  };
}

function warden(
  outcome: WardenAuthorizationResult["outcome"],
): WardenAuthorizationResult {
  return {
    decisionRef: `warden:test:${outcome.toLowerCase()}`,
    outcome,
    reason: outcome === "DENIED" ? "scope_not_permitted" : undefined,
  };
}

describe("BNR participant conformance v1", () => {
  it("is conformant and executable only after explicit Warden authorization", () => {
    const snapshot = assessBnrParticipantConformance(resolved(), warden("AUTHORIZED"));

    expect(snapshot.experienceStatus).toBe("CONFORMANT");
    expect(snapshot.actionability).toBe("EXECUTABLE");
    expect(snapshot.recognized.code).toBe("IDENTITY_RECOGNIZED");
    expect(snapshot.connected.code).toBe("RELATIONSHIP_RESOLVED");
    expect(snapshot.applies.code).toBe("WARDEN_AUTHORIZATION_REQUIRED");
    expect(snapshot.required.code).toBe("REQUIREMENTS_SATISFIED");
    expect(snapshot.next.code).toBe("NEXT_AUTHORIZED");
    expect(snapshot.nextAction).toMatchObject({
      state: "EXECUTE_AUTHORIZED_ACTION",
      executable: true,
      candidateAction: "ENTER_QUANTUM_ROOM",
      decisionRef: "warden:test:authorized",
    });
    expect(snapshot.unresolvedQuestions).toEqual([]);
  });

  it("never treats a resolved R5 candidate as executable without Warden", () => {
    const snapshot = assessBnrParticipantConformance(resolved());

    expect(snapshot.experienceStatus).toBe("CONFORMANT");
    expect(snapshot.actionability).toBe("KNOWN_BLOCKER");
    expect(snapshot.next.code).toBe("NEXT_AWAIT_WARDEN_AUTHORIZATION");
    expect(snapshot.nextAction).toMatchObject({
      state: "AWAIT_WARDEN_AUTHORIZATION",
      executable: false,
      candidateAction: "ENTER_QUANTUM_ROOM",
    });
  });

  it("turns explicit unmet requirements into a participant-visible next step", () => {
    const resolution = resolved();
    resolution.r4 = "REQUIRES_EVIDENCE";
    resolution.r5 = "UNKNOWN";
    resolution.candidateAction = undefined;
    resolution.unmetRequirementRefs = ["requirement:test:proof-of-role"];

    const snapshot = assessBnrParticipantConformance(resolution);

    expect(snapshot.experienceStatus).toBe("CONFORMANT");
    expect(snapshot.actionability).toBe("KNOWN_BLOCKER");
    expect(snapshot.required).toMatchObject({
      outcome: "KNOWN_BLOCKER",
      code: "REQUIREMENTS_EXPLICIT",
    });
    expect(snapshot.next).toMatchObject({
      outcome: "KNOWN_BLOCKER",
      code: "NEXT_SATISFY_REQUIREMENTS",
    });
    expect(snapshot.nextAction).toEqual({
      state: "SATISFY_REQUIREMENTS",
      executable: false,
      candidateAction: undefined,
      requirementRefs: ["requirement:test:proof-of-role", "evidence:test:identity"],
    });
  });

  it("fails conformance when Registry says evidence is required but cannot identify it", () => {
    const resolution = resolved();
    resolution.r4 = "REQUIRES_EVIDENCE";
    resolution.unmetRequirementRefs = [];
    resolution.evidenceRequirementRefs = [];

    const snapshot = assessBnrParticipantConformance(resolution);

    expect(snapshot.experienceStatus).toBe("NON_CONFORMANT");
    expect(snapshot.actionability).toBe("UNRESOLVED");
    expect(snapshot.required.code).toBe("REQUIREMENTS_NOT_IDENTIFIED");
    expect(snapshot.nextAction.state).toBe("UNRESOLVED");
    expect(snapshot.unresolvedQuestions).toEqual(["R4", "R5"]);
  });

  it("treats an evidenced Registry denial as a clear answer rather than an unknown state", () => {
    const resolution = resolved();
    resolution.r3 = "DENIED";

    const snapshot = assessBnrParticipantConformance(resolution);

    expect(snapshot.experienceStatus).toBe("CONFORMANT");
    expect(snapshot.actionability).toBe("DENIED");
    expect(snapshot.applies).toMatchObject({
      outcome: "DENIED",
      code: "APPLICABILITY_DENIED",
      refs: ["authority:test:participation"],
    });
    expect(snapshot.nextAction.state).toBe("DENIED");
    expect(snapshot.nextAction.executable).toBe(false);
  });

  it("fails conformance when a Registry denial has no authority reference", () => {
    const resolution = resolved();
    resolution.r3 = "DENIED";
    resolution.authorityRefs = [];

    const snapshot = assessBnrParticipantConformance(resolution);

    expect(snapshot.experienceStatus).toBe("NON_CONFORMANT");
    expect(snapshot.actionability).toBe("UNRESOLVED");
    expect(snapshot.applies.code).toBe("APPLICABILITY_DENIED_WITHOUT_AUTHORITY_REF");
    expect(snapshot.unresolvedQuestions).toContain("R3");
  });

  it("surfaces Warden review and denial without leaking execution authority", () => {
    const review = assessBnrParticipantConformance(resolved(), warden("REVIEW_REQUIRED"));
    expect(review.experienceStatus).toBe("CONFORMANT");
    expect(review.actionability).toBe("KNOWN_BLOCKER");
    expect(review.nextAction.state).toBe("AWAIT_WARDEN_REVIEW");
    expect(review.nextAction.executable).toBe(false);

    const denied = assessBnrParticipantConformance(resolved(), warden("DENIED"));
    expect(denied.experienceStatus).toBe("CONFORMANT");
    expect(denied.actionability).toBe("DENIED");
    expect(denied.nextAction).toMatchObject({
      state: "DENIED",
      executable: false,
      reason: "scope_not_permitted",
    });
  });

  it("fails conformance when R5 claims resolution but supplies no candidate action", () => {
    const resolution = resolved();
    resolution.candidateAction = undefined;

    const snapshot = assessBnrParticipantConformance(resolution);

    expect(snapshot.experienceStatus).toBe("NON_CONFORMANT");
    expect(snapshot.actionability).toBe("UNRESOLVED");
    expect(snapshot.next.code).toBe("NEXT_ACTION_MISSING");
    expect(snapshot.unresolvedQuestions).toEqual(["R5"]);
  });
});
