import type { EffectVerificationSuccessV1 } from "../synnergyze/effect-verification.ts";
import type { ModernCapabilityLegSnapshotV1 } from "./modern-capability-leg.ts";
import {
  composeModernJourneyConfluenceV1,
  type ModernJourneyConfluenceLegTypeV1,
  type ModernJourneyConfluenceV1,
} from "./modern-journey-confluence.ts";
import type { ModernJourneyRuntimeSnapshotV1 } from "./modern-journey-runtime.ts";

export interface ModernJourneyPlanLegV1 {
  legRef: string;
  legType: ModernJourneyConfluenceLegTypeV1;
  dependsOn: readonly ModernJourneyConfluenceLegTypeV1[];
}

export interface ModernJourneyPlanV1 {
  journeyRef: string;
  objectiveRef: string;
  digitalMeRef: string;
  silkAccountRef: string;
  economicOwnerRef: string;
  legs: readonly ModernJourneyPlanLegV1[];
}

export type ModernJourneyControllerActionV1 =
  | "START_LEG"
  | "CONTINUE_LEG"
  | "RECOVER_LEG"
  | "VERIFY_LEG_EFFECT"
  | "CLOSE_LEG"
  | "VERIFY_JOURNEY_EFFECT"
  | "PERSIST_JOURNEY_CLOSURE"
  | "WAIT_DEPENDENCY"
  | "BLOCKED";

export interface ModernJourneyControllerDecisionV1 {
  journeyRef: string;
  objectiveRef: string;
  action: ModernJourneyControllerActionV1;
  legRef?: string;
  legType?: ModernJourneyConfluenceLegTypeV1;
  blockedByLegTypes: readonly ModernJourneyConfluenceLegTypeV1[];
  reasonCodes: readonly string[];
  confluence: ModernJourneyConfluenceV1;
  requiresWardenDecision: boolean;
}

function assertPlan(plan: ModernJourneyPlanV1): void {
  if (!plan.journeyRef.trim()) throw new Error("modern_controller_journey_ref_required");
  if (!plan.objectiveRef.trim()) throw new Error("modern_controller_objective_ref_required");
  if (!plan.digitalMeRef.trim()) throw new Error("modern_controller_digital_me_ref_required");
  if (!plan.silkAccountRef.trim()) throw new Error("modern_controller_silk_account_ref_required");
  if (!plan.economicOwnerRef.trim()) throw new Error("modern_controller_economic_owner_ref_required");
  if (plan.legs.length === 0) throw new Error("modern_controller_plan_legs_required");

  const types = new Set<ModernJourneyConfluenceLegTypeV1>();
  const refs = new Set<string>();
  for (const leg of plan.legs) {
    if (!leg.legRef.trim()) throw new Error("modern_controller_leg_ref_required");
    if (types.has(leg.legType)) throw new Error("modern_controller_duplicate_leg_type");
    if (refs.has(leg.legRef)) throw new Error("modern_controller_duplicate_leg_ref");
    if (leg.dependsOn.includes(leg.legType)) throw new Error("modern_controller_self_dependency");
    if (new Set(leg.dependsOn).size !== leg.dependsOn.length) {
      throw new Error("modern_controller_duplicate_dependency");
    }
    types.add(leg.legType);
    refs.add(leg.legRef);
  }
  for (const leg of plan.legs) {
    for (const dependency of leg.dependsOn) {
      if (!types.has(dependency)) throw new Error("modern_controller_unknown_dependency");
    }
  }

  const visiting = new Set<ModernJourneyConfluenceLegTypeV1>();
  const visited = new Set<ModernJourneyConfluenceLegTypeV1>();
  const byType = new Map(plan.legs.map((leg) => [leg.legType, leg]));
  const visit = (legType: ModernJourneyConfluenceLegTypeV1): void => {
    if (visited.has(legType)) return;
    if (visiting.has(legType)) throw new Error("modern_controller_dependency_cycle");
    visiting.add(legType);
    const leg = byType.get(legType);
    if (!leg) throw new Error("modern_controller_unknown_dependency");
    for (const dependency of leg.dependsOn) visit(dependency);
    visiting.delete(legType);
    visited.add(legType);
  };
  for (const leg of plan.legs) visit(leg.legType);
}

function snapshotLegRef(
  legType: ModernJourneyConfluenceLegTypeV1,
  payment: ModernJourneyRuntimeSnapshotV1 | undefined,
  capabilityLegs: readonly ModernCapabilityLegSnapshotV1[],
): string | undefined {
  if (legType === "PAYMENT") return payment?.transaction.transactionRef;
  return capabilityLegs.find((snapshot) => snapshot.leg.capabilityType === legType)?.leg.legRef;
}

function suppliedState(
  legType: ModernJourneyConfluenceLegTypeV1,
  payment: ModernJourneyRuntimeSnapshotV1 | undefined,
  capabilityLegs: readonly ModernCapabilityLegSnapshotV1[],
): string | undefined {
  if (legType === "PAYMENT") return payment?.transaction.state;
  return capabilityLegs.find((snapshot) => snapshot.leg.capabilityType === legType)?.leg.state;
}

function decision(input: {
  plan: ModernJourneyPlanV1;
  confluence: ModernJourneyConfluenceV1;
  action: ModernJourneyControllerActionV1;
  leg?: ModernJourneyPlanLegV1;
  blockedBy?: readonly ModernJourneyConfluenceLegTypeV1[];
  reasonCodes: readonly string[];
  requiresWardenDecision?: boolean;
}): ModernJourneyControllerDecisionV1 {
  return {
    journeyRef: input.plan.journeyRef,
    objectiveRef: input.plan.objectiveRef,
    action: input.action,
    legRef: input.leg?.legRef,
    legType: input.leg?.legType,
    blockedByLegTypes: [...(input.blockedBy ?? [])],
    reasonCodes: [...input.reasonCodes],
    confluence: input.confluence,
    requiresWardenDecision: input.requiresWardenDecision ?? false,
  };
}

export function resolveModernJourneyNextActionV1(input: {
  plan: ModernJourneyPlanV1;
  payment?: ModernJourneyRuntimeSnapshotV1;
  capabilityLegs?: readonly ModernCapabilityLegSnapshotV1[];
  finalEffect?: EffectVerificationSuccessV1;
}): ModernJourneyControllerDecisionV1 {
  assertPlan(input.plan);
  const capabilityLegs = input.capabilityLegs ?? [];
  const requiredLegTypes = input.plan.legs.map((leg) => leg.legType);
  const confluence = composeModernJourneyConfluenceV1({
    journeyRef: input.plan.journeyRef,
    objectiveRef: input.plan.objectiveRef,
    digitalMeRef: input.plan.digitalMeRef,
    silkAccountRef: input.plan.silkAccountRef,
    economicOwnerRef: input.plan.economicOwnerRef,
    requiredLegTypes,
    payment: input.payment,
    capabilityLegs,
    finalEffect: input.finalEffect,
  });

  for (const leg of input.plan.legs) {
    const ref = snapshotLegRef(leg.legType, input.payment, capabilityLegs);
    if (ref && ref !== leg.legRef) throw new Error("modern_controller_leg_ref_mismatch");
  }

  const blockedLeg = input.plan.legs.find(
    (leg) => suppliedState(leg.legType, input.payment, capabilityLegs) === "BLOCKED",
  );
  if (blockedLeg) {
    return decision({
      plan: input.plan,
      confluence,
      action: "BLOCKED",
      leg: blockedLeg,
      reasonCodes: ["required_leg_blocked"],
    });
  }

  const recoveryLeg = input.plan.legs.find(
    (leg) => suppliedState(leg.legType, input.payment, capabilityLegs) === "RECOVERY_REQUIRED",
  );
  if (recoveryLeg) {
    return decision({
      plan: input.plan,
      confluence,
      action: "RECOVER_LEG",
      leg: recoveryLeg,
      reasonCodes: ["required_leg_recovery_required", "fresh_warden_authority_may_be_required"],
      requiresWardenDecision: true,
    });
  }

  for (const leg of input.plan.legs) {
    const state = suppliedState(leg.legType, input.payment, capabilityLegs);
    const incompleteDependencies = leg.dependsOn.filter(
      (dependency) => suppliedState(dependency, input.payment, capabilityLegs) !== "CLOSED",
    );
    if (!state) {
      if (incompleteDependencies.length > 0) {
        return decision({
          plan: input.plan,
          confluence,
          action: "WAIT_DEPENDENCY",
          leg,
          blockedBy: incompleteDependencies,
          reasonCodes: ["leg_dependencies_not_closed"],
        });
      }
      return decision({
        plan: input.plan,
        confluence,
        action: "START_LEG",
        leg,
        reasonCodes: ["required_leg_not_started", "warden_decision_required_before_execution"],
        requiresWardenDecision: true,
      });
    }

    if (state === "OPEN") {
      if (incompleteDependencies.length > 0) {
        throw new Error("modern_controller_started_leg_dependency_not_closed");
      }
      return decision({
        plan: input.plan,
        confluence,
        action: "CONTINUE_LEG",
        leg,
        reasonCodes: ["leg_open", "continue_only_with_existing_or_fresh_warden_authority"],
        requiresWardenDecision: true,
      });
    }
    if (state === "EXECUTED_UNVERIFIED") {
      return decision({
        plan: input.plan,
        confluence,
        action: "VERIFY_LEG_EFFECT",
        leg,
        reasonCodes: ["provider_execution_not_work_effect"],
      });
    }
    if (state === "EFFECT_VERIFIED") {
      return decision({
        plan: input.plan,
        confluence,
        action: "CLOSE_LEG",
        leg,
        reasonCodes: ["leg_effect_verified_closure_pending"],
      });
    }
  }

  if (confluence.state === "EFFECT_PENDING") {
    return decision({
      plan: input.plan,
      confluence,
      action: "VERIFY_JOURNEY_EFFECT",
      reasonCodes: ["all_required_legs_closed", "journey_effect_still_required"],
    });
  }
  if (confluence.state === "CLOSED") {
    return decision({
      plan: input.plan,
      confluence,
      action: "PERSIST_JOURNEY_CLOSURE",
      reasonCodes: ["journey_effect_verified", "work_receipt_ready_for_append_only_persistence"],
    });
  }

  throw new Error("modern_controller_no_valid_next_action");
}