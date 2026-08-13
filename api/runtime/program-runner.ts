import type {
  EventContractV1,
  EventExecutionState,
  PreparedProgramAction,
  ProgramContractV1,
  ProgramExecutionGateway,
  ProgramExecutionResult,
  ProgramExecutionTraceEntry,
  ProgramState,
  RegistryResolutionBundle,
} from "./program-event-contract.js";

function trace(
  entries: ProgramExecutionTraceEntry[],
  step: ProgramExecutionTraceEntry["step"],
  state: ProgramState,
  ref?: string,
  detail?: string,
) {
  entries.push({ step, state, ref, detail });
}

function result(
  program: ProgramContractV1,
  event: EventContractV1,
  state: ProgramState,
  eventState: EventExecutionState,
  entries: ProgramExecutionTraceEntry[],
  extra: Omit<ProgramExecutionResult, "programRef" | "eventDefinitionRef" | "state" | "eventState" | "trace"> = {},
): ProgramExecutionResult {
  return {
    programRef: program.programRef,
    eventDefinitionRef: event.eventDefinitionRef,
    state,
    eventState,
    trace: entries,
    ...extra,
  };
}

function resolutionFailure(resolution: RegistryResolutionBundle): string | null {
  if (resolution.r1 !== "RESOLVED") return `R1_${resolution.r1}`;
  if (resolution.r2 !== "RESOLVED") return `R2_${resolution.r2}`;
  if (["DENIED", "EXPIRED", "REVOKED"].includes(resolution.r3)) return `R3_${resolution.r3}`;
  if (resolution.r3 !== "RESOLVED" && resolution.r3 !== "REQUIRES_AUTHORIZATION") {
    return `R3_${resolution.r3}`;
  }
  return null;
}

export interface RunProgramEventInput {
  program: ProgramContractV1;
  event: EventContractV1;
  correlationId: string;
  idempotencyKey: string;
}

export async function runProgramEvent(
  input: RunProgramEventInput,
  gateway: ProgramExecutionGateway,
): Promise<ProgramExecutionResult> {
  const { program, event, correlationId, idempotencyKey } = input;
  const entries: ProgramExecutionTraceEntry[] = [];

  if (event.programRef !== program.programRef) {
    return result(program, event, "EXCEPTION", "EXCEPTION", entries, {
      reason: "EVENT_PROGRAM_REF_MISMATCH",
    });
  }

  trace(entries, "RESOLVE_R1_R5", "READY_FOR_RESOLUTION");
  const resolution = await gateway.resolveR1ToR5(program, event);
  const failedResolution = resolutionFailure(resolution);
  if (failedResolution) {
    const denied = failedResolution.startsWith("R3_DENIED") || failedResolution.startsWith("R3_EXPIRED") || failedResolution.startsWith("R3_REVOKED");
    return result(program, event, denied ? "DENIED" : "EXCEPTION", denied ? "DENIED" : "EXCEPTION", entries, {
      reason: failedResolution,
    });
  }

  if (event.executionDeviceRef) {
    const deviceSecurity = resolution.deviceSecurityContext;
    trace(
      entries,
      "CHECK_DEVICE_SECURITY",
      "READY_FOR_RESOLUTION",
      event.executionDeviceRef,
      deviceSecurity?.state ?? "UNRESOLVED",
    );

    if (!deviceSecurity) {
      return result(program, event, "BLOCKED_REQUIREMENT", "BLOCKED_REQUIREMENT", entries, {
        reason: "DEVICE_SECURITY_STATE_UNRESOLVED",
      });
    }

    if (deviceSecurity.deviceRef !== event.executionDeviceRef) {
      return result(program, event, "BLOCKED_REQUIREMENT", "BLOCKED_REQUIREMENT", entries, {
        reason: "DEVICE_SECURITY_CONTEXT_MISMATCH",
      });
    }

    if (deviceSecurity.state !== "ACTIVE") {
      return result(program, event, "BLOCKED_REQUIREMENT", "BLOCKED_REQUIREMENT", entries, {
        reason: `DEVICE_SECURITY_STATE_${deviceSecurity.state}`,
      });
    }
  }

  if (resolution.r4 === "REQUIRES_EVIDENCE" || resolution.unmetRequirementRefs.length > 0) {
    return result(program, event, "BLOCKED_REQUIREMENT", "BLOCKED_REQUIREMENT", entries, {
      reason: resolution.unmetRequirementRefs.length
        ? `UNMET_REQUIREMENTS:${resolution.unmetRequirementRefs.join(",")}`
        : "R4_REQUIRES_EVIDENCE",
    });
  }
  if (resolution.r4 !== "RESOLVED") {
    return result(program, event, "BLOCKED_REQUIREMENT", "BLOCKED_REQUIREMENT", entries, {
      reason: `R4_${resolution.r4}`,
    });
  }

  if (resolution.r5 !== "RESOLVED" || !resolution.candidateAction) {
    return result(program, event, "EXCEPTION", "EXCEPTION", entries, {
      reason: `R5_${resolution.r5}`,
    });
  }

  const action: PreparedProgramAction = {
    correlationId,
    idempotencyKey,
    programRef: program.programRef,
    eventDefinitionRef: event.eventDefinitionRef,
    actorRef: event.actorRef,
    actingCapacityRef: event.actingCapacityRef,
    targetRef: event.thingRef,
    requestedCapability: event.requestedCapability,
    candidateAction: resolution.candidateAction,
    authorityRefs: [...new Set([...event.authorityRefs, ...resolution.authorityRefs])],
    evidenceRequirementRefs: [
      ...new Set([...event.requirementRefs, ...resolution.evidenceRequirementRefs]),
    ],
  };

  trace(entries, "PREPARE_ACTION", "READY_FOR_AUTHORIZATION", undefined, action.candidateAction);
  trace(entries, "WARDEN_AUTHORIZE", "READY_FOR_AUTHORIZATION");
  const decision = await gateway.authorize(action, resolution);
  if (decision.outcome !== "AUTHORIZED") {
    const paused = decision.outcome === "REVIEW_REQUIRED";
    return result(program, event, paused ? "PAUSED" : "DENIED", paused ? "READY_FOR_AUTHORIZATION" : "DENIED", entries, {
      wardenDecisionRef: decision.decisionRef,
      reason: decision.reason ?? `WARDEN_${decision.outcome}`,
    });
  }

  trace(entries, "RIVER_RESERVE", "AUTHORIZED", decision.decisionRef);
  const reservation = await gateway.reserveEvidence(action, decision);
  if (reservation.status !== "RESERVED") {
    return result(program, event, "BLOCKED_REQUIREMENT", "BLOCKED_REQUIREMENT", entries, {
      wardenDecisionRef: decision.decisionRef,
      reason: reservation.reason ?? "RIVER_EVIDENCE_UNAVAILABLE",
    });
  }

  let execution;
  try {
    trace(entries, "EXECUTE_CAPABILITY", "RUNNING", reservation.reservationRef);
    execution = await gateway.executeCapability(action, reservation);
  } catch (error) {
    return result(program, event, "EXCEPTION", "EXCEPTION", entries, {
      wardenDecisionRef: decision.decisionRef,
      reason: error instanceof Error ? error.message : "EXECUTION_FAILED",
    });
  }

  trace(entries, "CONFIRM_RESULT", "RUNNING", execution.receiptRef);
  const confirmation = await gateway.confirmResult(action, execution);
  if (!confirmation.matched) {
    trace(entries, "RIVER_SEAL", "EXCEPTION", confirmation.confirmationRef, "confirmation_mismatch");
    const mismatchEvidence = await gateway.sealEvidence(action, execution, confirmation);
    return result(program, event, "EXCEPTION", "CONFIRMATION_MISMATCH", entries, {
      wardenDecisionRef: decision.decisionRef,
      evidenceRef: mismatchEvidence.evidenceRef,
      reason: confirmation.reason ?? "CONFIRMATION_MISMATCH",
    });
  }

  trace(entries, "RIVER_SEAL", "VERIFIED", confirmation.confirmationRef);
  const evidence = await gateway.sealEvidence(action, execution, confirmation);

  trace(entries, "RECORD_EFFECT", "VERIFIED", evidence.evidenceRef);
  const effect = await gateway.recordEffect(
    action,
    confirmation,
    evidence,
    resolution.expectedEffectRefs,
  );

  trace(entries, "ECONOMIC_CONSEQUENCE", "EFFECT_RECORDED", effect.effectRef);
  const economic = await gateway.recordEconomicConsequence(
    program,
    event,
    effect,
    resolution.economicContextRefs,
  );

  const finalState: ProgramState =
    economic?.settlementState === "RECONCILED" ? "SETTLED_RECONCILED" : "EFFECT_RECORDED";
  trace(entries, "UPDATE_STATE", finalState, economic?.consequenceRef ?? effect.effectRef);

  return result(
    program,
    event,
    finalState,
    economic?.settlementState === "RECONCILED" ? "SETTLED_RECONCILED" : "EFFECT_RECORDED",
    entries,
    {
      wardenDecisionRef: decision.decisionRef,
      evidenceRef: evidence.evidenceRef,
      effectRef: effect.effectRef,
      economicConsequenceRef: economic?.consequenceRef,
    },
  );
}
