import type { Rc1ActionIntent, Rc1Capability, Rc1WardenDecision } from "../../rc1/runtime.ts";
import type {
  WardenDecisionRequestV1,
  WardenDecisionV1,
} from "./contracts.ts";

const RC1_CONSTRAINTS = ["SYNTHETIC_RC1_ONLY"] as const;

function asRc1Capability(capabilityRef: string): Rc1Capability {
  if (capabilityRef === "service_request.create" || capabilityRef === "contract.execute") {
    return capabilityRef;
  }
  throw new Error(`unsupported_rc1_capability:${capabilityRef}`);
}

export function toRc1ActionIntent(request: WardenDecisionRequestV1): Rc1ActionIntent {
  if (!request.representedPrincipalRef) {
    throw new Error("represented_principal_required_for_rc1");
  }

  return {
    programRef: request.programRef,
    actorRef: request.actorRef,
    representedEntityRef: request.representedPrincipalRef,
    capability: asRc1Capability(request.capabilityRef),
    correlationId: request.correlationId,
    targetRef: request.targetRef,
  };
}

export function adaptRc1WardenDecision(
  request: WardenDecisionRequestV1,
  decision: Rc1WardenDecision,
): WardenDecisionV1 {
  const base = {
    decisionRef: decision.decisionRef,
    requestRef: request.requestRef,
    wardenRef: decision.wardenRef,
    action: request.action,
    targetRef: request.targetRef,
    reasonCodes: [decision.reason],
    constraints: RC1_CONSTRAINTS,
    decidedAt: request.requestedAt,
    correlationId: request.correlationId,
  } as const;

  if (decision.status === "ALLOW") {
    if (!decision.actionToken) {
      throw new Error("rc1_allow_missing_action_token");
    }
    return { ...base, decision: "ALLOW", actionToken: decision.actionToken };
  }

  return { ...base, decision: "DENY" };
}
