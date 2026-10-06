export type QuantumMarketTier = "Q0" | "Q1" | "Q2" | "Q3";

export type DisclosureClassification =
  | "OPEN"
  | "REGISTERED"
  | "SUBSCRIBER"
  | "PREMIUM"
  | "COMMERCIAL_CONFIDENTIAL"
  | "ESTATE_PRIVATE"
  | "TRANSACTION_BOUND"
  | "REGULATED"
  | "NEVER_PUBLIC";

export type DisclosureContext = {
  tier: QuantumMarketTier;
  authenticated: boolean;
  subscriberEntitled?: boolean;
  premiumEntitled?: boolean;
  commercialRelationship?: boolean;
  estateScopeMatch?: boolean;
  transactionEligible?: boolean;
  regulatedApprovedByWarden?: boolean;
};

export type DisclosureDecision = {
  allowed: boolean;
  reason: string;
};

const tierRank: Record<QuantumMarketTier, number> = {
  Q0: 0,
  Q1: 1,
  Q2: 2,
  Q3: 3,
};

export function decideQuantumMarketDisclosure(
  classification: DisclosureClassification,
  context: DisclosureContext,
): DisclosureDecision {
  switch (classification) {
    case "OPEN":
      return { allowed: true, reason: "OPEN" };

    case "REGISTERED":
      return context.authenticated && tierRank[context.tier] >= 1
        ? { allowed: true, reason: "REGISTERED_ACCOUNT" }
        : { allowed: false, reason: "AUTHENTICATION_REQUIRED" };

    case "SUBSCRIBER":
      return context.authenticated &&
        tierRank[context.tier] >= 2 &&
        context.subscriberEntitled === true
        ? { allowed: true, reason: "SUBSCRIBER_ENTITLED" }
        : { allowed: false, reason: "SUBSCRIBER_ENTITLEMENT_REQUIRED" };

    case "PREMIUM":
      return context.authenticated &&
        tierRank[context.tier] >= 3 &&
        context.premiumEntitled === true
        ? { allowed: true, reason: "PREMIUM_ENTITLED" }
        : { allowed: false, reason: "PREMIUM_ENTITLEMENT_REQUIRED" };

    case "COMMERCIAL_CONFIDENTIAL":
      return context.authenticated && context.commercialRelationship === true
        ? { allowed: true, reason: "COMMERCIAL_RELATIONSHIP_CONFIRMED" }
        : { allowed: false, reason: "COMMERCIAL_RELATIONSHIP_REQUIRED" };

    case "ESTATE_PRIVATE":
      return context.authenticated && context.estateScopeMatch === true
        ? { allowed: true, reason: "ESTATE_SCOPE_MATCH" }
        : { allowed: false, reason: "ESTATE_SCOPE_REQUIRED" };

    case "TRANSACTION_BOUND":
      return context.authenticated && context.transactionEligible === true
        ? { allowed: true, reason: "TRANSACTION_STATE_ELIGIBLE" }
        : { allowed: false, reason: "TRANSACTION_STATE_REQUIRED" };

    case "REGULATED":
      return context.authenticated && context.regulatedApprovedByWarden === true
        ? { allowed: true, reason: "WARDEN_REGULATED_APPROVAL" }
        : { allowed: false, reason: "WARDEN_REGULATED_APPROVAL_REQUIRED" };

    case "NEVER_PUBLIC":
      return { allowed: false, reason: "NEVER_PUBLIC" };
  }
}

export type ClassifiedField<T> = {
  value: T;
  classification: DisclosureClassification;
};

export type ClassifiedRecord = Record<string, ClassifiedField<unknown>>;

export function projectQuantumMarketRecord(
  record: ClassifiedRecord,
  context: DisclosureContext,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).flatMap(([field, classified]) => {
      const decision = decideQuantumMarketDisclosure(classified.classification, context);
      return decision.allowed ? [[field, classified.value]] : [];
    }),
  );
}
