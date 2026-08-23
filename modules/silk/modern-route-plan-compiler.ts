import { createHash } from "node:crypto";

import type { SilkResourceTypeV1 } from "./confluence-reference.ts";
import type { ModernJourneyConfluenceLegTypeV1 } from "./modern-journey-confluence.ts";
import type { ModernJourneyPlanV1 } from "./modern-journey-controller.ts";

export interface ModernObjectiveCapabilityRequirementV1 {
  legType: ModernJourneyConfluenceLegTypeV1;
  dependsOn: readonly ModernJourneyConfluenceLegTypeV1[];
  purpose: string;
  capabilityRef: string;
  resourceType: SilkResourceTypeV1;
  quantity: number;
  unit: string;
  expectedEffect: string;
}

export interface ModernCompiledCapabilityIntentV1 extends ModernObjectiveCapabilityRequirementV1 {
  legRef: string;
  wardenDecisionRequired: true;
}

export interface ModernCompiledRoutePlanV1 {
  planRef: string;
  journeyRef: string;
  objectiveRef: string;
  digitalMeRef: string;
  silkAccountRef: string;
  economicOwnerRef: string;
  controllerPlan: ModernJourneyPlanV1;
  capabilityIntents: readonly ModernCompiledCapabilityIntentV1[];
  synthetic: true;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function expectedResourceTypes(
  legType: ModernJourneyConfluenceLegTypeV1,
): readonly SilkResourceTypeV1[] {
  switch (legType) {
    case "PAYMENT":
      return ["MONEY", "CREDIT"];
    case "CONNECTIVITY":
      return ["NETWORK"];
    case "COMPUTE":
      return ["COMPUTE"];
  }
}

function legRef(journeyRef: string, legType: ModernJourneyConfluenceLegTypeV1): string {
  const identity = digest(`${journeyRef}|${legType}`).slice(0, 24);
  return legType === "PAYMENT"
    ? `MODERN-PAYMENT-TRANSACTION:${identity}`
    : `MODERN-CAPABILITY-LEG:${legType}:${identity}`;
}

function assertRequirements(requirements: readonly ModernObjectiveCapabilityRequirementV1[]): void {
  if (requirements.length === 0) throw new Error("modern_route_compiler_requirements_required");
  const types = new Set<ModernJourneyConfluenceLegTypeV1>();
  for (const requirement of requirements) {
    if (types.has(requirement.legType)) throw new Error("modern_route_compiler_duplicate_leg_type");
    if (!requirement.purpose.trim()) throw new Error("modern_route_compiler_purpose_required");
    if (!requirement.capabilityRef.trim()) throw new Error("modern_route_compiler_capability_ref_required");
    if (!requirement.expectedEffect.trim()) throw new Error("modern_route_compiler_expected_effect_required");
    if (!Number.isFinite(requirement.quantity) || requirement.quantity <= 0) {
      throw new Error("modern_route_compiler_quantity_positive_required");
    }
    if (!requirement.unit.trim()) throw new Error("modern_route_compiler_unit_required");
    if (!expectedResourceTypes(requirement.legType).includes(requirement.resourceType)) {
      throw new Error("modern_route_compiler_resource_type_mismatch");
    }
    if (requirement.dependsOn.includes(requirement.legType)) {
      throw new Error("modern_route_compiler_self_dependency");
    }
    if (new Set(requirement.dependsOn).size !== requirement.dependsOn.length) {
      throw new Error("modern_route_compiler_duplicate_dependency");
    }
    types.add(requirement.legType);
  }
  for (const requirement of requirements) {
    for (const dependency of requirement.dependsOn) {
      if (!types.has(dependency)) throw new Error("modern_route_compiler_unknown_dependency");
    }
  }

  const byType = new Map(requirements.map((requirement) => [requirement.legType, requirement]));
  const visiting = new Set<ModernJourneyConfluenceLegTypeV1>();
  const visited = new Set<ModernJourneyConfluenceLegTypeV1>();
  const visit = (type: ModernJourneyConfluenceLegTypeV1): void => {
    if (visited.has(type)) return;
    if (visiting.has(type)) throw new Error("modern_route_compiler_dependency_cycle");
    visiting.add(type);
    const requirement = byType.get(type);
    if (!requirement) throw new Error("modern_route_compiler_unknown_dependency");
    for (const dependency of requirement.dependsOn) visit(dependency);
    visiting.delete(type);
    visited.add(type);
  };
  for (const requirement of requirements) visit(requirement.legType);
}

function orderedRequirements(
  requirements: readonly ModernObjectiveCapabilityRequirementV1[],
): readonly ModernObjectiveCapabilityRequirementV1[] {
  const byType = new Map(requirements.map((requirement) => [requirement.legType, requirement]));
  const visited = new Set<ModernJourneyConfluenceLegTypeV1>();
  const ordered: ModernObjectiveCapabilityRequirementV1[] = [];
  const visit = (type: ModernJourneyConfluenceLegTypeV1): void => {
    if (visited.has(type)) return;
    const requirement = byType.get(type);
    if (!requirement) throw new Error("modern_route_compiler_unknown_dependency");
    for (const dependency of [...requirement.dependsOn].sort()) visit(dependency);
    visited.add(type);
    ordered.push(requirement);
  };
  for (const type of [...byType.keys()].sort()) visit(type);
  return ordered;
}

function canonicalRequirement(intent: ModernCompiledCapabilityIntentV1) {
  return {
    legType: intent.legType,
    dependsOn: [...intent.dependsOn].sort(),
    purpose: intent.purpose,
    capabilityRef: intent.capabilityRef,
    resourceType: intent.resourceType,
    quantity: intent.quantity,
    unit: intent.unit,
    expectedEffect: intent.expectedEffect,
  };
}

export function compileModernRoutePlanV1(input: {
  journeyRef: string;
  objectiveRef: string;
  digitalMeRef: string;
  silkAccountRef: string;
  economicOwnerRef: string;
  requirements: readonly ModernObjectiveCapabilityRequirementV1[];
}): ModernCompiledRoutePlanV1 {
  if (!input.journeyRef.trim()) throw new Error("modern_route_compiler_journey_ref_required");
  if (!input.objectiveRef.trim()) throw new Error("modern_route_compiler_objective_ref_required");
  if (!input.digitalMeRef.trim()) throw new Error("modern_route_compiler_digital_me_ref_required");
  if (!input.silkAccountRef.trim()) throw new Error("modern_route_compiler_silk_account_ref_required");
  if (!input.economicOwnerRef.trim()) throw new Error("modern_route_compiler_owner_ref_required");
  assertRequirements(input.requirements);

  const ordered = orderedRequirements(input.requirements);
  const capabilityIntents: ModernCompiledCapabilityIntentV1[] = ordered.map((requirement) => ({
    ...requirement,
    dependsOn: [...requirement.dependsOn],
    legRef: legRef(input.journeyRef, requirement.legType),
    wardenDecisionRequired: true,
  }));
  const controllerPlan: ModernJourneyPlanV1 = {
    journeyRef: input.journeyRef,
    objectiveRef: input.objectiveRef,
    digitalMeRef: input.digitalMeRef,
    silkAccountRef: input.silkAccountRef,
    economicOwnerRef: input.economicOwnerRef,
    legs: capabilityIntents.map((intent) => ({
      legRef: intent.legRef,
      legType: intent.legType,
      dependsOn: [...intent.dependsOn],
    })),
  };
  const planIdentity = digest(
    JSON.stringify({
      journeyRef: input.journeyRef,
      objectiveRef: input.objectiveRef,
      digitalMeRef: input.digitalMeRef,
      silkAccountRef: input.silkAccountRef,
      economicOwnerRef: input.economicOwnerRef,
      requirements: capabilityIntents.map(canonicalRequirement),
    }),
  ).slice(0, 24);

  return {
    planRef: `MODERN-ROUTE-PLAN:${planIdentity}`,
    journeyRef: input.journeyRef,
    objectiveRef: input.objectiveRef,
    digitalMeRef: input.digitalMeRef,
    silkAccountRef: input.silkAccountRef,
    economicOwnerRef: input.economicOwnerRef,
    controllerPlan,
    capabilityIntents,
    synthetic: true,
  };
}