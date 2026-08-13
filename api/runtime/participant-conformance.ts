import type {
  RegistryResolutionBundle,
  RegistryResolutionStatus,
  WardenAuthorizationResult,
} from "./program-event-contract.js";

export const BNR_PARTICIPANT_CONFORMANCE_VERSION =
  "bnr.participant-conformance.v1" as const;

export type ParticipantDimensionOutcome =
  | "ANSWERED"
  | "KNOWN_BLOCKER"
  | "DENIED"
  | "UNRESOLVED";

export type ParticipantQuestion = "R1" | "R2" | "R3" | "R4" | "R5";

export type ParticipantActionability =
  | "EXECUTABLE"
  | "KNOWN_BLOCKER"
  | "DENIED"
  | "UNRESOLVED";

export type ParticipantNextActionState =
  | "EXECUTE_AUTHORIZED_ACTION"
  | "SATISFY_REQUIREMENTS"
  | "AWAIT_WARDEN_AUTHORIZATION"
  | "AWAIT_WARDEN_REVIEW"
  | "DENIED"
  | "UNRESOLVED";

export interface ParticipantDimensionAssessment {
  question: ParticipantQuestion;
  outcome: ParticipantDimensionOutcome;
  registryStatus: RegistryResolutionStatus;
  code: string;
  refs: string[];
}

export interface ParticipantNextAction {
  state: ParticipantNextActionState;
  executable: boolean;
  candidateAction?: string;
  requirementRefs: string[];
  decisionRef?: string;
  reason?: string;
}

export interface BnrParticipantConformanceSnapshotV1 {
  contractVersion: typeof BNR_PARTICIPANT_CONFORMANCE_VERSION;
  requestRef: string;
  experienceStatus: "CONFORMANT" | "NON_CONFORMANT";
  actionability: ParticipantActionability;
  recognized: ParticipantDimensionAssessment;
  connected: ParticipantDimensionAssessment;
  applies: ParticipantDimensionAssessment;
  required: ParticipantDimensionAssessment;
  next: ParticipantDimensionAssessment;
  nextAction: ParticipantNextAction;
  unresolvedQuestions: ParticipantQuestion[];
}

function assessment(
  question: ParticipantQuestion,
  outcome: ParticipantDimensionOutcome,
  registryStatus: RegistryResolutionStatus,
  code: string,
  refs: string[] = [],
): ParticipantDimensionAssessment {
  return {
    question,
    outcome,
    registryStatus,
    code,
    refs: [...new Set(refs)],
  };
}

function isRegistryDenial(status: RegistryResolutionStatus): boolean {
  return status === "DENIED" || status === "EXPIRED" || status === "REVOKED";
}

function explicitRequirementRefs(resolution: RegistryResolutionBundle): string[] {
  return [
    ...new Set([
      ...resolution.unmetRequirementRefs,
      ...resolution.evidenceRequirementRefs,
    ]),
  ];
}

/**
 * Converts Registry R1-R5 plus an optional Warden decision into the five
 * participant-visible answers BNR must be able to present.
 *
 * This function is descriptive only. It never grants authority. A resolved
 * R5 candidate remains non-executable until Warden explicitly authorizes it.
 */
export function assessBnrParticipantConformance(
  resolution: RegistryResolutionBundle,
  wardenDecision?: WardenAuthorizationResult,
): BnrParticipantConformanceSnapshotV1 {
  const recognized =
    resolution.r1 === "RESOLVED"
      ? assessment("R1", "ANSWERED", resolution.r1, "IDENTITY_RECOGNIZED")
      : assessment("R1", "UNRESOLVED", resolution.r1, `IDENTITY_${resolution.r1}`);

  const connected =
    resolution.r2 === "RESOLVED"
      ? assessment("R2", "ANSWERED", resolution.r2, "RELATIONSHIP_RESOLVED")
      : assessment("R2", "UNRESOLVED", resolution.r2, `RELATIONSHIP_${resolution.r2}`);

  let applies: ParticipantDimensionAssessment;
  if (resolution.r3 === "RESOLVED") {
    applies = assessment(
      "R3",
      "ANSWERED",
      resolution.r3,
      "APPLICABLE_AUTHORITY_RESOLVED",
      resolution.authorityRefs,
    );
  } else if (resolution.r3 === "REQUIRES_AUTHORIZATION") {
    applies = assessment(
      "R3",
      "KNOWN_BLOCKER",
      resolution.r3,
      "WARDEN_AUTHORIZATION_REQUIRED",
      resolution.authorityRefs,
    );
  } else if (isRegistryDenial(resolution.r3) && resolution.authorityRefs.length > 0) {
    applies = assessment(
      "R3",
      "DENIED",
      resolution.r3,
      `APPLICABILITY_${resolution.r3}`,
      resolution.authorityRefs,
    );
  } else {
    applies = assessment(
      "R3",
      "UNRESOLVED",
      resolution.r3,
      isRegistryDenial(resolution.r3)
        ? `APPLICABILITY_${resolution.r3}_WITHOUT_AUTHORITY_REF`
        : `APPLICABILITY_${resolution.r3}`,
      resolution.authorityRefs,
    );
  }

  const requirementRefs = explicitRequirementRefs(resolution);
  let required: ParticipantDimensionAssessment;
  if (resolution.r4 === "RESOLVED" && resolution.unmetRequirementRefs.length === 0) {
    required = assessment(
      "R4",
      "ANSWERED",
      resolution.r4,
      "REQUIREMENTS_SATISFIED",
      resolution.evidenceRequirementRefs,
    );
  } else if (
    (resolution.r4 === "REQUIRES_EVIDENCE" || resolution.unmetRequirementRefs.length > 0) &&
    requirementRefs.length > 0
  ) {
    required = assessment(
      "R4",
      "KNOWN_BLOCKER",
      resolution.r4,
      "REQUIREMENTS_EXPLICIT",
      requirementRefs,
    );
  } else {
    required = assessment(
      "R4",
      "UNRESOLVED",
      resolution.r4,
      resolution.r4 === "REQUIRES_EVIDENCE"
        ? "REQUIREMENTS_NOT_IDENTIFIED"
        : `REQUIREMENTS_${resolution.r4}`,
      requirementRefs,
    );
  }

  let next: ParticipantDimensionAssessment;
  let nextAction: ParticipantNextAction;

  if (required.outcome === "KNOWN_BLOCKER") {
    next = assessment(
      "R5",
      "KNOWN_BLOCKER",
      resolution.r5,
      "NEXT_SATISFY_REQUIREMENTS",
      requirementRefs,
    );
    nextAction = {
      state: "SATISFY_REQUIREMENTS",
      executable: false,
      candidateAction: resolution.candidateAction,
      requirementRefs,
    };
  } else if (required.outcome === "UNRESOLVED") {
    next = assessment("R5", "UNRESOLVED", resolution.r5, "NEXT_BLOCKED_BY_UNKNOWN_REQUIREMENTS");
    nextAction = {
      state: "UNRESOLVED",
      executable: false,
      requirementRefs,
      reason: required.code,
    };
  } else if (applies.outcome === "DENIED") {
    next = assessment("R5", "DENIED", resolution.r5, "NEXT_DENIED_BY_REGISTRY", resolution.authorityRefs);
    nextAction = {
      state: "DENIED",
      executable: false,
      candidateAction: resolution.candidateAction,
      requirementRefs,
      reason: applies.code,
    };
  } else if (applies.outcome === "UNRESOLVED") {
    next = assessment("R5", "UNRESOLVED", resolution.r5, "NEXT_BLOCKED_BY_UNKNOWN_APPLICABILITY");
    nextAction = {
      state: "UNRESOLVED",
      executable: false,
      requirementRefs,
      reason: applies.code,
    };
  } else if (resolution.r5 !== "RESOLVED" || !resolution.candidateAction) {
    next = assessment(
      "R5",
      "UNRESOLVED",
      resolution.r5,
      resolution.r5 === "RESOLVED" ? "NEXT_ACTION_MISSING" : `NEXT_${resolution.r5}`,
    );
    nextAction = {
      state: "UNRESOLVED",
      executable: false,
      requirementRefs,
      reason: next.code,
    };
  } else if (!wardenDecision) {
    next = assessment(
      "R5",
      "KNOWN_BLOCKER",
      resolution.r5,
      "NEXT_AWAIT_WARDEN_AUTHORIZATION",
      resolution.authorityRefs,
    );
    nextAction = {
      state: "AWAIT_WARDEN_AUTHORIZATION",
      executable: false,
      candidateAction: resolution.candidateAction,
      requirementRefs,
    };
  } else if (wardenDecision.outcome === "AUTHORIZED") {
    next = assessment(
      "R5",
      "ANSWERED",
      resolution.r5,
      "NEXT_AUTHORIZED",
      resolution.authorityRefs,
    );
    nextAction = {
      state: "EXECUTE_AUTHORIZED_ACTION",
      executable: true,
      candidateAction: resolution.candidateAction,
      requirementRefs,
      decisionRef: wardenDecision.decisionRef,
      reason: wardenDecision.reason,
    };
  } else if (wardenDecision.outcome === "REVIEW_REQUIRED") {
    next = assessment(
      "R5",
      "KNOWN_BLOCKER",
      resolution.r5,
      "NEXT_AWAIT_WARDEN_REVIEW",
      resolution.authorityRefs,
    );
    nextAction = {
      state: "AWAIT_WARDEN_REVIEW",
      executable: false,
      candidateAction: resolution.candidateAction,
      requirementRefs,
      decisionRef: wardenDecision.decisionRef,
      reason: wardenDecision.reason,
    };
  } else {
    next = assessment(
      "R5",
      "DENIED",
      resolution.r5,
      "NEXT_DENIED_BY_WARDEN",
      resolution.authorityRefs,
    );
    nextAction = {
      state: "DENIED",
      executable: false,
      candidateAction: resolution.candidateAction,
      requirementRefs,
      decisionRef: wardenDecision.decisionRef,
      reason: wardenDecision.reason,
    };
  }

  const dimensions = [recognized, connected, applies, required, next];
  const unresolvedQuestions = dimensions
    .filter((dimension) => dimension.outcome === "UNRESOLVED")
    .map((dimension) => dimension.question);

  const experienceStatus = unresolvedQuestions.length === 0 ? "CONFORMANT" : "NON_CONFORMANT";

  let actionability: ParticipantActionability;
  if (unresolvedQuestions.length > 0) {
    actionability = "UNRESOLVED";
  } else if (applies.outcome === "DENIED" || next.outcome === "DENIED") {
    actionability = "DENIED";
  } else if (nextAction.executable) {
    actionability = "EXECUTABLE";
  } else {
    actionability = "KNOWN_BLOCKER";
  }

  return {
    contractVersion: BNR_PARTICIPANT_CONFORMANCE_VERSION,
    requestRef: resolution.requestRef,
    experienceStatus,
    actionability,
    recognized,
    connected,
    applies,
    required,
    next,
    nextAction,
    unresolvedQuestions,
  };
}
