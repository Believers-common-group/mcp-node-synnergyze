import type {
  CapabilityGrant,
  IssueExecutionCapabilityInput,
  WardenDecision,
} from "./types.ts";

export function validateWardenDecision(decision: WardenDecision, now: Date): void {
  if (decision.outcome !== "ALLOW") {
    throw new Error("WARDEN_NOT_AUTHORIZED");
  }

  const expiresAt = new Date(decision.expiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
    throw new Error("WARDEN_DECISION_EXPIRED");
  }
}

export function issueExecutionCapability(input: IssueExecutionCapabilityInput): CapabilityGrant {
  validateWardenDecision(input.decision, input.now);

  if (
    input.decision.executionId !== input.executionId ||
    input.decision.principalId !== input.principalId
  ) {
    throw new Error("WARDEN_DECISION_SCOPE_MISMATCH");
  }

  if (input.decision.assetId !== input.assetId) {
    throw new Error("WARDEN_DECISION_ASSET_MISMATCH");
  }

  if (input.operations.some((operation) => !input.decision.operations.includes(operation))) {
    throw new Error("WARDEN_DECISION_OPERATION_MISMATCH");
  }

  if (input.decision.selectedRoute !== input.selectedRoute) {
    throw new Error("WARDEN_DECISION_ROUTE_MISMATCH");
  }

  if (input.decision.currency !== input.currency) {
    throw new Error("WARDEN_DECISION_CURRENCY_MISMATCH");
  }

  if (input.requestedCostCeiling > input.decision.maxCost) {
    throw new Error("WARDEN_COST_CEILING_EXCEEDED");
  }

  if (input.fundingReserved < input.requestedCostCeiling) {
    throw new Error("INSUFFICIENT_RESERVED_FUNDING");
  }

  return {
    capabilityId: `CAP:${input.decision.decisionId}:${input.executionId}`,
    decisionId: input.decision.decisionId,
    executionId: input.executionId,
    principalId: input.principalId,
    assetId: input.assetId,
    operations: [...input.operations],
    selectedRoute: input.selectedRoute,
    maxCost: input.requestedCostCeiling,
    currency: input.currency,
    expiresAt: input.decision.expiresAt,
  };
}
