import type { CommerceEventTypeV1 } from "../commerce-events/contracts.ts";
import type {
  ChannelClassification,
  HeaderBoardActionCapability,
  JsonValue,
} from "./contracts.ts";

export interface CommerceProjectionFieldRuleV1 {
  sourceField: string;
  targetField: string;
  classification: ChannelClassification;
}

export interface CommerceProjectionScopeRuleV1 {
  fieldName: string;
  equals: JsonValue;
  errorCode: "CROSS_MARKETPLACE_LEAKAGE" | "PROFILE_SCOPE_MISMATCH";
}

export interface CommerceProjectionProfileV1 {
  profileRef: string;
  canonicalEventType: CommerceEventTypeV1;
  targetChannelRef: string;
  audiencePolicyRef: string;
  classification: ChannelClassification;
  requiredSourceFields: readonly string[];
  requiredEvidenceClasses: readonly string[];
  fieldRules: readonly CommerceProjectionFieldRuleV1[];
  requiredScope: readonly CommerceProjectionScopeRuleV1[];
  correlationField?: string;
  allowedActionCapabilities: readonly HeaderBoardActionCapability[];
  sourceOwnerPolicyRef: string;
  sourceRolePolicyRef: string;
  version: number;
  status: "ACTIVE" | "INACTIVE";
}

const SOURCE_OWNER_POLICY_REF = "COMMERCE-SOURCE-POLICY:VOI:R0-3";
const SOURCE_ROLE_POLICY_REF = "COMMERCE-SOURCE-ROLE-POLICY:VOI:R0-3";

function profile(
  input: Omit<
    CommerceProjectionProfileV1,
    "sourceOwnerPolicyRef" | "sourceRolePolicyRef" | "version" | "status"
  >,
): CommerceProjectionProfileV1 {
  return {
    ...input,
    sourceOwnerPolicyRef: SOURCE_OWNER_POLICY_REF,
    sourceRolePolicyRef: SOURCE_ROLE_POLICY_REF,
    version: 1,
    status: "ACTIVE",
  };
}

export const COMMERCE_PROJECTION_PROFILES_R0_3: readonly CommerceProjectionProfileV1[] = [
  profile({
    profileRef: "PROFILE:COMMERCE:ORDERS:ORDER-CREATED",
    canonicalEventType: "order_created",
    targetChannelRef: "VSR-CHANNEL:COMMERCE:ORDERS",
    audiencePolicyRef: "POLICY:COMMERCE:ORDERS:INTERNAL",
    classification: "GOVERNED_INTERNAL",
    requiredSourceFields: ["orderRef", "marketplaceRef", "orderStatus"],
    requiredEvidenceClasses: ["ORDER_RECORD"],
    fieldRules: [
      { sourceField: "orderRef", targetField: "orderRef", classification: "GOVERNED_INTERNAL" },
      { sourceField: "marketplaceRef", targetField: "marketplaceRef", classification: "PARTNER" },
      { sourceField: "orderStatus", targetField: "orderStatus", classification: "MANAGEMENT" },
    ],
    requiredScope: [],
    correlationField: "orderRef",
    allowedActionCapabilities: ["ACKNOWLEDGE"],
  }),
  profile({
    profileRef: "PROFILE:COMMERCE:WAREHOUSE:PICK-TASK",
    canonicalEventType: "pick_task_created",
    targetChannelRef: "VSR-CHANNEL:COMMERCE:WAREHOUSE",
    audiencePolicyRef: "POLICY:COMMERCE:WAREHOUSE:INTERNAL",
    classification: "GOVERNED_INTERNAL",
    requiredSourceFields: ["orderRef", "taskRef", "dueTime"],
    requiredEvidenceClasses: ["PICK_TASK"],
    fieldRules: [
      { sourceField: "orderRef", targetField: "orderRef", classification: "GOVERNED_INTERNAL" },
      { sourceField: "taskRef", targetField: "taskRef", classification: "WORKFORCE" },
      { sourceField: "dueTime", targetField: "dueTime", classification: "WORKFORCE" },
    ],
    requiredScope: [],
    correlationField: "orderRef",
    allowedActionCapabilities: ["ACKNOWLEDGE"],
  }),
  profile({
    profileRef: "PROFILE:COMMERCE:WAREHOUSE:PACKED",
    canonicalEventType: "item_packed",
    targetChannelRef: "VSR-CHANNEL:COMMERCE:WAREHOUSE",
    audiencePolicyRef: "POLICY:COMMERCE:WAREHOUSE:INTERNAL",
    classification: "GOVERNED_INTERNAL",
    requiredSourceFields: ["orderRef", "packageRef", "packingStatus"],
    requiredEvidenceClasses: ["PACKING_PROOF"],
    fieldRules: [
      { sourceField: "orderRef", targetField: "orderRef", classification: "GOVERNED_INTERNAL" },
      { sourceField: "packageRef", targetField: "packageRef", classification: "WORKFORCE" },
      { sourceField: "packingStatus", targetField: "packingStatus", classification: "WORKFORCE" },
    ],
    requiredScope: [],
    correlationField: "orderRef",
    allowedActionCapabilities: ["ACKNOWLEDGE"],
  }),
  profile({
    profileRef: "PROFILE:COMMERCE:MARKETPLACE:MYNTRA:SHIPMENT",
    canonicalEventType: "shipment_dispatched",
    targetChannelRef: "VSR-CHANNEL:COMMERCE:MARKETPLACE",
    audiencePolicyRef: "POLICY:COMMERCE:MARKETPLACE:MYNTRA",
    classification: "PARTNER",
    requiredSourceFields: ["orderRef", "marketplaceRef", "shipmentStatus"],
    requiredEvidenceClasses: ["HANDOVER_PROOF"],
    fieldRules: [
      { sourceField: "orderRef", targetField: "orderRef", classification: "PARTNER" },
      { sourceField: "marketplaceRef", targetField: "marketplaceRef", classification: "PARTNER" },
      { sourceField: "shipmentStatus", targetField: "shipmentStatus", classification: "PARTNER" },
    ],
    requiredScope: [
      {
        fieldName: "marketplaceRef",
        equals: "MARKETPLACE:MYNTRA",
        errorCode: "CROSS_MARKETPLACE_LEAKAGE",
      },
    ],
    correlationField: "orderRef",
    allowedActionCapabilities: ["ACKNOWLEDGE"],
  }),
  profile({
    profileRef: "PROFILE:COMMERCE:LOGISTICS:DISPATCHED",
    canonicalEventType: "shipment_dispatched",
    targetChannelRef: "VSR-CHANNEL:COMMERCE:LOGISTICS",
    audiencePolicyRef: "POLICY:COMMERCE:LOGISTICS:INTERNAL",
    classification: "GOVERNED_INTERNAL",
    requiredSourceFields: ["orderRef", "shipmentStatus"],
    requiredEvidenceClasses: ["HANDOVER_PROOF"],
    fieldRules: [
      { sourceField: "orderRef", targetField: "orderRef", classification: "GOVERNED_INTERNAL" },
      { sourceField: "shipmentStatus", targetField: "shipmentStatus", classification: "GOVERNED_INTERNAL" },
    ],
    requiredScope: [],
    correlationField: "orderRef",
    allowedActionCapabilities: ["ACKNOWLEDGE"],
  }),
  profile({
    profileRef: "PROFILE:COMMERCE:LOGISTICS:DELIVERED",
    canonicalEventType: "shipment_delivered",
    targetChannelRef: "VSR-CHANNEL:COMMERCE:LOGISTICS",
    audiencePolicyRef: "POLICY:COMMERCE:LOGISTICS:INTERNAL",
    classification: "GOVERNED_INTERNAL",
    requiredSourceFields: ["orderRef", "deliveryStatus"],
    requiredEvidenceClasses: ["DELIVERY_PROOF"],
    fieldRules: [
      { sourceField: "orderRef", targetField: "orderRef", classification: "GOVERNED_INTERNAL" },
      { sourceField: "deliveryStatus", targetField: "deliveryStatus", classification: "GOVERNED_INTERNAL" },
    ],
    requiredScope: [],
    correlationField: "orderRef",
    allowedActionCapabilities: ["ACKNOWLEDGE"],
  }),
  profile({
    profileRef: "PROFILE:COMMERCE:RETURNS:CREATED",
    canonicalEventType: "return_created",
    targetChannelRef: "VSR-CHANNEL:COMMERCE:RETURNS",
    audiencePolicyRef: "POLICY:COMMERCE:RETURNS:INTERNAL",
    classification: "GOVERNED_INTERNAL",
    requiredSourceFields: ["orderRef", "returnRef", "returnStatus"],
    requiredEvidenceClasses: ["RETURN_CASE"],
    fieldRules: [
      { sourceField: "orderRef", targetField: "orderRef", classification: "GOVERNED_INTERNAL" },
      { sourceField: "returnRef", targetField: "returnRef", classification: "GOVERNED_INTERNAL" },
      { sourceField: "returnStatus", targetField: "returnStatus", classification: "MANAGEMENT" },
    ],
    requiredScope: [],
    correlationField: "orderRef",
    allowedActionCapabilities: ["ACKNOWLEDGE"],
  }),
  profile({
    profileRef: "PROFILE:COMMERCE:MANAGEMENT:ORDER-CLOSED",
    canonicalEventType: "order_closed",
    targetChannelRef: "VSR-CHANNEL:COMMERCE:MANAGEMENT",
    audiencePolicyRef: "POLICY:COMMERCE:MANAGEMENT",
    classification: "MANAGEMENT",
    requiredSourceFields: ["orderRef", "closureKind", "closureStatus"],
    requiredEvidenceClasses: ["RECONCILIATION_PROOF"],
    fieldRules: [
      { sourceField: "orderRef", targetField: "orderRef", classification: "MANAGEMENT" },
      { sourceField: "closureKind", targetField: "closureKind", classification: "MANAGEMENT" },
      { sourceField: "closureStatus", targetField: "closureStatus", classification: "MANAGEMENT" },
    ],
    requiredScope: [],
    correlationField: "orderRef",
    allowedActionCapabilities: ["ACKNOWLEDGE", "SUBSCRIBE"],
  }),
  profile({
    profileRef: "PROFILE:COMMERCE:CUSTOMER:DELIVERED",
    canonicalEventType: "shipment_delivered",
    targetChannelRef: "VSR-CHANNEL:COMMERCE:ORDERS",
    audiencePolicyRef: "POLICY:COMMERCE:CUSTOMER:ORDER-STATUS",
    classification: "CUSTOMER",
    requiredSourceFields: ["orderRef", "deliveryStatus"],
    requiredEvidenceClasses: ["DELIVERY_PROOF"],
    fieldRules: [
      { sourceField: "orderRef", targetField: "orderRef", classification: "CUSTOMER" },
      { sourceField: "deliveryStatus", targetField: "deliveryStatus", classification: "CUSTOMER" },
    ],
    requiredScope: [],
    correlationField: "orderRef",
    allowedActionCapabilities: ["ACKNOWLEDGE"],
  }),
  profile({
    profileRef: "PROFILE:COMMERCE:WORKFORCE:PICK-TASK",
    canonicalEventType: "pick_task_created",
    targetChannelRef: "VSR-CHANNEL:COMMERCE:WAREHOUSE",
    audiencePolicyRef: "POLICY:COMMERCE:WORKFORCE:PICK",
    classification: "WORKFORCE",
    requiredSourceFields: ["orderRef", "taskRef", "dueTime"],
    requiredEvidenceClasses: ["PICK_TASK"],
    fieldRules: [
      { sourceField: "orderRef", targetField: "orderRef", classification: "WORKFORCE" },
      { sourceField: "taskRef", targetField: "taskRef", classification: "WORKFORCE" },
      { sourceField: "dueTime", targetField: "dueTime", classification: "WORKFORCE" },
    ],
    requiredScope: [],
    correlationField: "orderRef",
    allowedActionCapabilities: ["ACKNOWLEDGE"],
  }),
];

export function getCommerceProjectionProfileV1(profileRef: string): CommerceProjectionProfileV1 {
  const found = COMMERCE_PROJECTION_PROFILES_R0_3.find(
    (candidate) => candidate.profileRef === profileRef,
  );
  if (!found) throw new Error(`PROFILE_UNKNOWN:${profileRef}`);
  return structuredClone(found);
}
