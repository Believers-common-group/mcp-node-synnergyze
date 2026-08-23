import type {
  BnrActivationInputsV1,
  BnrReadinessStateV1,
} from "./contracts.ts";

function blockersFor(input: BnrActivationInputsV1): string[] {
  const blockers: string[] = [];

  if (input.partnerLifecycle !== "TECHNICALLY_READY") {
    blockers.push("BNR_PARTNER_NOT_TECHNICALLY_READY");
  }
  if (input.runtimeReadiness !== "READY") blockers.push("BNR_RUNTIME_BLOCKED");
  if (input.authorityState !== "EXTERNAL_EVIDENCED") {
    blockers.push("BNR_AUTHORITY_UNRESOLVED");
  }
  if (input.evidenceState !== "READY") blockers.push("BNR_EVIDENCE_UNREADY");
  if (input.commercialState !== "EVIDENCED") blockers.push("BNR_COMMERCIAL_UNRESOLVED");
  if (!input.requiredServicesResolved) blockers.push("BNR_REQUIRED_SERVICES_UNRESOLVED");
  if (!input.wardenPolicyActive) blockers.push("BNR_WARDEN_POLICY_INACTIVE");
  if (!input.riverOperational) blockers.push("BNR_RIVER_UNREADY");
  if (!input.registryDurable) blockers.push("BNR_REGISTRY_NOT_DURABLE");

  return blockers;
}

export function resolveBnrReadinessV1(input: BnrActivationInputsV1): BnrReadinessStateV1 {
  const blockers = blockersFor(input);

  let activationState: BnrReadinessStateV1["activationState"];
  if (input.suspended) {
    activationState = "SUSPENDED";
  } else if (blockers.length > 0) {
    activationState = "INACTIVE";
  } else if (!input.activationEvidenceValid) {
    activationState = "ELIGIBLE";
  } else {
    activationState = "ACTIVE";
  }

  return {
    nodeRef: input.nodeRef,
    partnerLifecycle: input.partnerLifecycle,
    runtimeReadiness: input.runtimeReadiness,
    authorityState: input.authorityState,
    evidenceState: input.evidenceState,
    commercialState: input.commercialState,
    activationState,
    blockers,
    readinessCheckedAt: input.readinessCheckedAt,
  };
}
