import type {
  CommerceEventTypeV1,
  CommerceSourceEventV1,
  CommerceSourceOwnerV1,
  CommerceSourcePolicyV1,
  CommerceSourceRoleV1,
} from "./contracts.ts";

export const COMMERCE_SOURCE_OWNERS_V1: readonly CommerceSourceOwnerV1[] = Object.freeze([
  "LOGIC_ERP",
  "EASYCOM_OMS",
  "WOOQER",
  "CARRIER_FEED",
  "TALLY_ACCOUNTING",
  "POS",
  "WAREHOUSE_EXECUTION",
  "STORE_EXECUTION",
  "CRM",
  "SYNNERGYZE",
]);

export const COMMERCE_SOURCE_ROLES_V1: readonly CommerceSourceRoleV1[] = Object.freeze([
  "AUTHORITATIVE_ORIGIN",
  "EXECUTION_PROOF",
  "INTEGRATION_OBSERVER",
  "DERIVED_RECONCILIATION",
]);

export function assertCommerceSourcePermittedV1(
  source: CommerceSourceEventV1,
  eventType: CommerceEventTypeV1,
  policy: CommerceSourcePolicyV1,
): void {
  if (policy.status !== "ACTIVE") throw new Error("SOURCE_POLICY_INACTIVE");
  if (!(COMMERCE_SOURCE_OWNERS_V1 as readonly string[]).includes(source.sourceOwner as string)) {
    throw new Error("SOURCE_OWNER_UNKNOWN");
  }
  if (!(COMMERCE_SOURCE_ROLES_V1 as readonly string[]).includes(source.sourceRole as string)) {
    throw new Error("SOURCE_ROLE_UNKNOWN");
  }

  const ownerRules = policy.rules.filter(
    (rule) => rule.eventType === eventType && rule.sourceOwner === source.sourceOwner,
  );
  if (ownerRules.length === 0) throw new Error("SOURCE_OWNER_NOT_PERMITTED");

  const roleRules = ownerRules.filter((rule) => rule.sourceRole === source.sourceRole);
  if (roleRules.length === 0) throw new Error("SOURCE_ROLE_NOT_PERMITTED");

  if (!roleRules.some((rule) => rule.sourceSystemRefs.includes(source.sourceSystemRef))) {
    throw new Error("SOURCE_SYSTEM_NOT_PERMITTED");
  }
}
