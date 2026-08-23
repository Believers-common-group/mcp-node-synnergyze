import { describe, expect, it } from "vitest";

import { resolveModernJourneyNextActionV1 } from "./modern-journey-controller.ts";
import {
  compileModernRoutePlanV1,
  type ModernObjectiveCapabilityRequirementV1,
} from "./modern-route-plan-compiler.ts";

const BASE = {
  journeyRef: "MODERN-JOURNEY:ROUTE-COMPILER-001",
  objectiveRef: "OBJECTIVE:ENGINEERING-SUBMISSION-001",
  digitalMeRef: "DIGITALME-CONFLUENCE-001",
  silkAccountRef: "SILK-ENT-042",
  economicOwnerRef: "ENTERPRISE-CONFLUENCE-001",
};

function requirements(): ModernObjectiveCapabilityRequirementV1[] {
  return [
    {
      legType: "CONNECTIVITY",
      dependsOn: [],
      purpose: "restore project connectivity",
      capabilityRef: "connectivity.esim.activate",
      resourceType: "NETWORK",
      quantity: 5,
      unit: "GB",
      expectedEffect: "connectivity.restored",
    },
    {
      legType: "COMPUTE",
      dependsOn: ["CONNECTIVITY"],
      purpose: "run engineering simulation",
      capabilityRef: "compute.public.allocate",
      resourceType: "COMPUTE",
      quantity: 2,
      unit: "GPU_HOUR",
      expectedEffect: "compute.gpu.available",
    },
    {
      legType: "PAYMENT",
      dependsOn: ["COMPUTE"],
      purpose: "obtain external engineering service",
      capabilityRef: "payment.visa.authorize",
      resourceType: "CREDIT",
      quantity: 4800,
      unit: "INR",
      expectedEffect: "engineering_service.payment_authorized",
    },
  ];
}

describe("MODERN-ROUTE-PLAN-COMPILER-001", () => {
  it("compiles the pilot dependencies deterministically and never grants authority", () => {
    const first = compileModernRoutePlanV1({ ...BASE, requirements: requirements() });
    const second = compileModernRoutePlanV1({ ...BASE, requirements: [...requirements()].reverse() });

    expect(first.planRef).toBe(second.planRef);
    expect(first.controllerPlan.legs.map((leg) => leg.legType)).toEqual([
      "CONNECTIVITY",
      "COMPUTE",
      "PAYMENT",
    ]);
    expect(first.capabilityIntents.every((intent) => intent.wardenDecisionRequired)).toBe(true);
    expect(first.capabilityIntents.map((intent) => intent.legRef)).toEqual(
      second.capabilityIntents.map((intent) => intent.legRef),
    );

    const next = resolveModernJourneyNextActionV1({ plan: first.controllerPlan });
    expect(next).toMatchObject({
      action: "START_LEG",
      legType: "CONNECTIVITY",
      requiresWardenDecision: true,
    });
  });

  it("changes route-plan identity when a material resource requirement changes", () => {
    const first = compileModernRoutePlanV1({ ...BASE, requirements: requirements() });
    const changed = requirements();
    const compute = changed.find((requirement) => requirement.legType === "COMPUTE");
    if (!compute) throw new Error("expected_compute_requirement");
    compute.quantity = 3;
    const second = compileModernRoutePlanV1({ ...BASE, requirements: changed });
    expect(second.planRef).not.toBe(first.planRef);
  });

  it("rejects resource-class mismatches and dependency cycles", () => {
    const mismatch = requirements();
    const connectivity = mismatch.find((requirement) => requirement.legType === "CONNECTIVITY");
    if (!connectivity) throw new Error("expected_connectivity_requirement");
    connectivity.resourceType = "COMPUTE";
    expect(() => compileModernRoutePlanV1({ ...BASE, requirements: mismatch })).toThrow(
      "modern_route_compiler_resource_type_mismatch",
    );

    const cyclic = requirements();
    const connectivityCycle = cyclic.find((requirement) => requirement.legType === "CONNECTIVITY");
    if (!connectivityCycle) throw new Error("expected_connectivity_requirement");
    connectivityCycle.dependsOn = ["PAYMENT"];
    expect(() => compileModernRoutePlanV1({ ...BASE, requirements: cyclic })).toThrow(
      "modern_route_compiler_dependency_cycle",
    );
  });
});