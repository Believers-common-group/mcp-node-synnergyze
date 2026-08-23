import type {
  BnrPartnerNodeManifestV1,
  BnrServiceBindingV1,
} from "../../bnr/contracts.ts";

export type AmazonBnrEffectClassV1 =
  | "READ_ONLY_PROVIDER_EFFECT"
  | "EFFECT_BEARING_REQUIRES_SEPARATE_AUTHORITY"
  | "INFRASTRUCTURE_REQUIRES_SEPARATE_AUTHORITY";

export interface AmazonBnrServiceBindingV1 extends BnrServiceBindingV1 {
  capabilityRef: string;
  effectClass: AmazonBnrEffectClassV1;
  settlementFinality: false;
  authorityRefs: readonly string[];
}

export interface AmazonBnrNodeManifestV1 extends BnrPartnerNodeManifestV1 {
  partnerRef: "PARTNER:AMAZON";
  serviceBindings: readonly AmazonBnrServiceBindingV1[];
}

const SERVICE_BINDINGS: readonly AmazonBnrServiceBindingV1[] = Object.freeze([
  Object.freeze({
    networkObject: "AMAZON:SPAPI:ORDERS",
    serviceRef: "AMAZON-SPAPI-ORDERS",
    version: "R0.1",
    state: "REQUIRED",
    capabilityRef: "amazon.orders.search",
    effectClass: "READ_ONLY_PROVIDER_EFFECT",
    settlementFinality: false,
    authorityRefs: Object.freeze(["AUTHORITY:AMAZON-SPAPI-ORDERS-READ"]),
  }),
  Object.freeze({
    networkObject: "AMAZON:MARKETPLACE:LISTINGS",
    serviceRef: "AMAZON-MARKETPLACE-LISTINGS",
    version: "PROPOSED",
    state: "OPTIONAL",
    capabilityRef: "amazon.listings.put",
    effectClass: "EFFECT_BEARING_REQUIRES_SEPARATE_AUTHORITY",
    settlementFinality: false,
    authorityRefs: Object.freeze(["AUTHORITY:AMAZON-MARKETPLACE-LISTINGS-WRITE"]),
  }),
  Object.freeze({
    networkObject: "AMAZON:FULFILMENT",
    serviceRef: "AMAZON-FULFILMENT",
    version: "PROPOSED",
    state: "OPTIONAL",
    capabilityRef: "amazon.fulfilment.execute",
    effectClass: "EFFECT_BEARING_REQUIRES_SEPARATE_AUTHORITY",
    settlementFinality: false,
    authorityRefs: Object.freeze(["AUTHORITY:AMAZON-FULFILMENT"]),
  }),
  Object.freeze({
    networkObject: "AMAZON:ADS",
    serviceRef: "AMAZON-ADS",
    version: "PROPOSED",
    state: "OPTIONAL",
    capabilityRef: "amazon.ads.manage",
    effectClass: "EFFECT_BEARING_REQUIRES_SEPARATE_AUTHORITY",
    settlementFinality: false,
    authorityRefs: Object.freeze(["AUTHORITY:AMAZON-ADS"]),
  }),
  Object.freeze({
    networkObject: "AMAZON:BUSINESS:PROCUREMENT",
    serviceRef: "AMAZON-BUSINESS-PROCUREMENT",
    version: "PROPOSED",
    state: "OPTIONAL",
    capabilityRef: "amazon.business.procurement",
    effectClass: "EFFECT_BEARING_REQUIRES_SEPARATE_AUTHORITY",
    settlementFinality: false,
    authorityRefs: Object.freeze(["AUTHORITY:AMAZON-BUSINESS-PROCUREMENT"]),
  }),
  Object.freeze({
    networkObject: "AMAZON:AWS:COMPUTE",
    serviceRef: "AWS-COMPUTE",
    version: "PROPOSED",
    state: "OPTIONAL",
    capabilityRef: "aws.compute.use",
    effectClass: "INFRASTRUCTURE_REQUIRES_SEPARATE_AUTHORITY",
    settlementFinality: false,
    authorityRefs: Object.freeze(["AUTHORITY:AWS-COMPUTE"]),
  }),
]);

export const AMAZON_BNR_NODE_001: Readonly<AmazonBnrNodeManifestV1> = Object.freeze({
  nodeRef: "BNR-001",
  nodeClass: "BNR",
  partnerRef: "PARTNER:AMAZON",
  partnerLifecycle: "PROPOSED_PARTNER",
  activationState: "INACTIVE",
  registryRef: "REGISTRY:BNR-001",
  policySetRef: "POLICY-SET:BNR-001-AMAZON",
  releaseRef: "RELEASE:AMAZON-BNR-001-R0.1-DRAFT",
  serviceBindings: SERVICE_BINDINGS,
  authorityEvidenceRefs: Object.freeze([]),
  commercialEvidenceRefs: Object.freeze([]),
  technicalEvidenceRefs: Object.freeze([]),
  activationEvidenceRefs: Object.freeze([]),
});

export function resolveAmazonBnrServiceBindingV1(
  serviceRef: string,
): AmazonBnrServiceBindingV1 {
  const binding = AMAZON_BNR_NODE_001.serviceBindings.find(
    (candidate) => candidate.serviceRef === serviceRef,
  );
  if (!binding) throw new Error("amazon_bnr_service_not_found");
  return binding;
}
