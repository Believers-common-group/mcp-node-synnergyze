import { createHash } from "node:crypto";

import {
  SyntheticSilkCapabilityRegistryV1,
  type SilkCapabilityTypeV1,
  type SilkProviderCapabilityV1,
} from "./confluence-reference.ts";
import type { ModernCompiledRoutePlanV1 } from "./modern-route-plan-compiler.ts";

export interface ModernBoundProviderOptionV1 {
  providerCapabilityRef: string;
  providerRef: string;
  adapterCapabilityRef: string;
  health: "AVAILABLE" | "DEGRADED";
  priority: number;
}

export interface ModernRouteProviderBindingV1 {
  bindingRef: string;
  planRef: string;
  journeyRef: string;
  legRef: string;
  legType: SilkCapabilityTypeV1;
  requestedCapabilityRef: string;
  preferred: ModernBoundProviderOptionV1;
  fallbacks: readonly ModernBoundProviderOptionV1[];
  wardenDecisionRequired: true;
  synthetic: true;
}

export interface ModernBoundRoutePlanV1 {
  planRef: string;
  journeyRef: string;
  bindings: readonly ModernRouteProviderBindingV1[];
  synthetic: true;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function option(capability: SilkProviderCapabilityV1): ModernBoundProviderOptionV1 {
  if (capability.health === "UNAVAILABLE") {
    throw new Error("modern_route_binding_unavailable_capability_selected");
  }
  return {
    providerCapabilityRef: capability.providerCapabilityRef,
    providerRef: capability.providerRef,
    adapterCapabilityRef: capability.capabilityRef,
    health: capability.health,
    priority: capability.priority,
  };
}

function distinctProviderFallbacks(
  preferred: SilkProviderCapabilityV1,
  candidates: readonly SilkProviderCapabilityV1[],
): ModernBoundProviderOptionV1[] {
  const seenProviders = new Set([preferred.providerRef]);
  const fallbacks: ModernBoundProviderOptionV1[] = [];
  for (const candidate of candidates) {
    if (seenProviders.has(candidate.providerRef)) continue;
    seenProviders.add(candidate.providerRef);
    fallbacks.push(option(candidate));
  }
  return fallbacks;
}

export function bindModernRoutePlanProvidersV1(input: {
  plan: ModernCompiledRoutePlanV1;
  registry: SyntheticSilkCapabilityRegistryV1;
}): ModernBoundRoutePlanV1 {
  const bindings: ModernRouteProviderBindingV1[] = input.plan.capabilityIntents.map((intent) => {
    const resolution = input.registry.resolve({
      silkAccountRef: input.plan.silkAccountRef,
      capabilityType: intent.legType,
    });
    if (!resolution.preferred) {
      throw new Error(`modern_route_binding_no_eligible_provider:${intent.legType}`);
    }
    const preferred = option(resolution.preferred);
    const fallbacks = distinctProviderFallbacks(resolution.preferred, resolution.fallbacks);
    const identity = digest(
      JSON.stringify({
        planRef: input.plan.planRef,
        journeyRef: input.plan.journeyRef,
        legRef: intent.legRef,
        legType: intent.legType,
        requestedCapabilityRef: intent.capabilityRef,
        preferred,
        fallbacks,
      }),
    ).slice(0, 24);
    return {
      bindingRef: `MODERN-ROUTE-PROVIDER-BINDING:${identity}`,
      planRef: input.plan.planRef,
      journeyRef: input.plan.journeyRef,
      legRef: intent.legRef,
      legType: intent.legType,
      requestedCapabilityRef: intent.capabilityRef,
      preferred,
      fallbacks,
      wardenDecisionRequired: true,
      synthetic: true,
    };
  });

  return {
    planRef: input.plan.planRef,
    journeyRef: input.plan.journeyRef,
    bindings,
    synthetic: true,
  };
}