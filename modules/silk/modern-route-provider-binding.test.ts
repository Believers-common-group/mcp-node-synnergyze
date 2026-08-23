import { describe, expect, it } from "vitest";

import { SyntheticSilkCapabilityRegistryV1 } from "./confluence-reference.ts";
import { bindModernRoutePlanProvidersV1 } from "./modern-route-provider-binding.ts";
import { compileModernRoutePlanV1 } from "./modern-route-plan-compiler.ts";

function plan() {
  return compileModernRoutePlanV1({
    journeyRef: "MODERN-JOURNEY:PROVIDER-BINDING-001",
    objectiveRef: "OBJECTIVE:ENGINEERING-SUBMISSION-001",
    digitalMeRef: "DIGITALME-CONFLUENCE-001",
    silkAccountRef: "SILK-ENT-042",
    economicOwnerRef: "ENTERPRISE-CONFLUENCE-001",
    requirements: [
      {
        legType: "CONNECTIVITY",
        dependsOn: [],
        purpose: "project connectivity",
        capabilityRef: "connectivity.activate",
        resourceType: "NETWORK",
        quantity: 5,
        unit: "GB",
        expectedEffect: "connectivity.restored",
      },
      {
        legType: "COMPUTE",
        dependsOn: ["CONNECTIVITY"],
        purpose: "engineering simulation",
        capabilityRef: "compute.allocate",
        resourceType: "COMPUTE",
        quantity: 2,
        unit: "GPU_HOUR",
        expectedEffect: "compute.gpu.available",
      },
      {
        legType: "PAYMENT",
        dependsOn: ["COMPUTE"],
        purpose: "external engineering service",
        capabilityRef: "payment.authorize",
        resourceType: "CREDIT",
        quantity: 4800,
        unit: "INR",
        expectedEffect: "engineering_service.payment_authorized",
      },
    ],
  });
}

function registry() {
  return new SyntheticSilkCapabilityRegistryV1([
    {
      providerCapabilityRef: "PCAP:TELCO-A",
      providerRef: "TELCO-A",
      capabilityRef: "connectivity.enterprise.activate",
      capabilityType: "CONNECTIVITY",
      silkAccountRef: "SILK-ENT-042",
      priority: 1,
      fallback: false,
      health: "AVAILABLE",
    },
    {
      providerCapabilityRef: "PCAP:ESIM-B",
      providerRef: "ESIM-B",
      capabilityRef: "connectivity.esim.activate",
      capabilityType: "CONNECTIVITY",
      silkAccountRef: "SILK-ENT-042",
      priority: 2,
      fallback: true,
      health: "AVAILABLE",
    },
    {
      providerCapabilityRef: "PCAP:PRIVATE-CLOUD-A",
      providerRef: "PRIVATE-CLOUD-A",
      capabilityRef: "compute.private.allocate",
      capabilityType: "COMPUTE",
      silkAccountRef: "SILK-ENT-042",
      priority: 1,
      fallback: false,
      health: "UNAVAILABLE",
    },
    {
      providerCapabilityRef: "PCAP:PUBLIC-CLOUD-B",
      providerRef: "PUBLIC-CLOUD-B",
      capabilityRef: "compute.public.allocate",
      capabilityType: "COMPUTE",
      silkAccountRef: "SILK-ENT-042",
      priority: 2,
      fallback: true,
      health: "AVAILABLE",
    },
    {
      providerCapabilityRef: "PCAP:MC-CORP",
      providerRef: "BANK-B",
      capabilityRef: "payment.mastercard.authorize",
      capabilityType: "PAYMENT",
      silkAccountRef: "SILK-ENT-042",
      priority: 1,
      fallback: false,
      health: "AVAILABLE",
    },
    {
      providerCapabilityRef: "PCAP:MC-CORP-ALT",
      providerRef: "BANK-B",
      capabilityRef: "payment.mastercard.alternate",
      capabilityType: "PAYMENT",
      silkAccountRef: "SILK-ENT-042",
      priority: 2,
      fallback: true,
      health: "AVAILABLE",
    },
    {
      providerCapabilityRef: "PCAP:VISA-PERSONAL",
      providerRef: "BANK-A",
      capabilityRef: "payment.visa.authorize",
      capabilityType: "PAYMENT",
      silkAccountRef: "SILK-ENT-042",
      priority: 3,
      fallback: true,
      health: "DEGRADED",
    },
  ]);
}

describe("MODERN-ROUTE-PROVIDER-BINDING-001", () => {
  it("binds eligible preferred providers and provider-distinct fallbacks without granting authority", () => {
    const bound = bindModernRoutePlanProvidersV1({ plan: plan(), registry: registry() });
    const connectivity = bound.bindings.find((binding) => binding.legType === "CONNECTIVITY");
    const compute = bound.bindings.find((binding) => binding.legType === "COMPUTE");
    const payment = bound.bindings.find((binding) => binding.legType === "PAYMENT");

    expect(connectivity).toMatchObject({
      preferred: { providerRef: "TELCO-A", adapterCapabilityRef: "connectivity.enterprise.activate" },
      fallbacks: [{ providerRef: "ESIM-B", adapterCapabilityRef: "connectivity.esim.activate" }],
      wardenDecisionRequired: true,
    });
    expect(compute).toMatchObject({
      preferred: { providerRef: "PUBLIC-CLOUD-B", adapterCapabilityRef: "compute.public.allocate" },
      fallbacks: [],
    });
    expect(payment).toMatchObject({
      preferred: { providerRef: "BANK-B", adapterCapabilityRef: "payment.mastercard.authorize" },
      fallbacks: [{ providerRef: "BANK-A", adapterCapabilityRef: "payment.visa.authorize" }],
      wardenDecisionRequired: true,
    });
    expect(payment?.fallbacks.some((candidate) => candidate.providerRef === "BANK-B")).toBe(false);
  });

  it("produces deterministic binding identities for the same plan and provider world", () => {
    const first = bindModernRoutePlanProvidersV1({ plan: plan(), registry: registry() });
    const second = bindModernRoutePlanProvidersV1({ plan: plan(), registry: registry() });
    expect(second.bindings.map((binding) => binding.bindingRef)).toEqual(
      first.bindings.map((binding) => binding.bindingRef),
    );
  });

  it("fails closed when a required route leg has no eligible provider", () => {
    const noCompute = new SyntheticSilkCapabilityRegistryV1([
      {
        providerCapabilityRef: "PCAP:TELCO-A",
        providerRef: "TELCO-A",
        capabilityRef: "connectivity.enterprise.activate",
        capabilityType: "CONNECTIVITY",
        silkAccountRef: "SILK-ENT-042",
        priority: 1,
        fallback: false,
        health: "AVAILABLE",
      },
      {
        providerCapabilityRef: "PCAP:BANK-B",
        providerRef: "BANK-B",
        capabilityRef: "payment.mastercard.authorize",
        capabilityType: "PAYMENT",
        silkAccountRef: "SILK-ENT-042",
        priority: 1,
        fallback: false,
        health: "AVAILABLE",
      },
    ]);
    expect(() => bindModernRoutePlanProvidersV1({ plan: plan(), registry: noCompute })).toThrow(
      "modern_route_binding_no_eligible_provider:COMPUTE",
    );
  });
});