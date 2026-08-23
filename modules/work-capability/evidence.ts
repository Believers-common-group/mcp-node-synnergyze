import type { SynnergyzeExecutionReceiptV1 } from "../synnergyze/contracts.ts";
import type { VerifiedEffectV1 } from "../synnergyze/effect-verification.ts";
import type {
  ActorCapabilityProfileV1,
  CapabilityEvidenceV1,
  CapabilityObservedPerformanceV1,
  WorkAssignmentV1,
  WorkUnitV1,
} from "./contracts.ts";
import { projectCapabilityEvidenceV1 } from "./runtime.ts";

export function projectProfileBoundCapabilityEvidenceV1(input: {
  workUnit: WorkUnitV1;
  assignment: WorkAssignmentV1;
  actorProfiles: readonly ActorCapabilityProfileV1[];
  capabilityRef: string;
  execution: SynnergyzeExecutionReceiptV1;
  verifiedEffect: VerifiedEffectV1;
  observedPerformance: CapabilityObservedPerformanceV1;
  evidenceRefs: readonly string[];
  observedAt: string;
}): readonly CapabilityEvidenceV1[] {
  const profiles = new Map(input.actorProfiles.map((profile) => [profile.actorRef, profile]));
  const directCapabilityActors = new Set<string>();

  for (const actorRef of input.assignment.actorRefs) {
    const profile = profiles.get(actorRef);
    if (!profile) throw new Error(`work_capability_evidence_actor_profile_missing:${actorRef}`);
    if (profile.capabilityRefs.includes(input.capabilityRef)) {
      directCapabilityActors.add(actorRef);
    }
  }

  const projected = projectCapabilityEvidenceV1({
    workUnit: input.workUnit,
    assignment: input.assignment,
    capabilityRef: input.capabilityRef,
    execution: input.execution,
    verifiedEffect: input.verifiedEffect,
    observedPerformance: input.observedPerformance,
    evidenceRefs: input.evidenceRefs,
    observedAt: input.observedAt,
  });

  return projected.filter(
    (item) =>
      item.actorOrCompositionRef === input.assignment.compositionRef ||
      directCapabilityActors.has(item.actorOrCompositionRef),
  );
}
