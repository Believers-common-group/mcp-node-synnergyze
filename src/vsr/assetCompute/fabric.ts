import type { InMemoryEventLog } from "./eventLog.ts";
import type { InMemoryFundingLedger } from "./fundingLedger.ts";
import { assertTransition } from "./stateMachine.ts";
import type {
  AssetComputeExecutionInput,
  AssetComputeExecutionResult,
  DerivedAssetCandidate,
  EffectVerifier,
  ExecutionState,
  ProviderAdapter,
  RiverEvent,
} from "./types.ts";
import { issueExecutionCapability, validateWardenDecision } from "./wardenGate.ts";

interface AssetComputeFabricDependencies {
  fundingLedger: InMemoryFundingLedger;
  eventLog: InMemoryEventLog;
  provider: ProviderAdapter;
  verifyEffect: EffectVerifier;
}

interface CompletedExecution {
  fingerprint: string;
  result: AssetComputeExecutionResult;
}

function executionFingerprint(input: AssetComputeExecutionInput): string {
  return JSON.stringify({
    executionId: input.executionId,
    principalId: input.principalId,
    assetId: input.assetId,
    inputRef: input.inputRef,
    resolutionRefs: {
      principal: input.resolutionRefs.principal,
      asset: input.resolutionRefs.asset,
      entitlement: input.resolutionRefs.entitlement,
      routeQuote: input.resolutionRefs.routeQuote,
    },
    reservationId: input.reservationId,
    reserveAmount: input.reserveAmount,
    fundingPriority: [...input.fundingPriority],
    selectedRoute: input.selectedRoute,
    operations: [...input.operations],
    currency: input.currency,
    requestedCostCeiling: input.requestedCostCeiling,
    decision: {
      decisionId: input.decision.decisionId,
      executionId: input.decision.executionId,
      principalId: input.decision.principalId,
      assetId: input.decision.assetId,
      operations: [...input.decision.operations],
      selectedRoute: input.decision.selectedRoute,
      outcome: input.decision.outcome,
      maxCost: input.decision.maxCost,
      currency: input.decision.currency,
      expiresAt: input.decision.expiresAt,
    },
  });
}

function cloneResult(result: AssetComputeExecutionResult): AssetComputeExecutionResult {
  return {
    ...result,
    settlement: { ...result.settlement },
    derivedAsset: { ...result.derivedAsset },
    capability: {
      ...result.capability,
      operations: [...result.capability.operations],
    },
    providerReceipt: { ...result.providerReceipt },
  };
}

export class AssetComputeFabric {
  private readonly fundingLedger: InMemoryFundingLedger;
  private readonly eventLog: InMemoryEventLog;
  private readonly provider: ProviderAdapter;
  private readonly verifyEffect: EffectVerifier;
  private readonly completed = new Map<string, CompletedExecution>();

  constructor(dependencies: AssetComputeFabricDependencies) {
    this.fundingLedger = dependencies.fundingLedger;
    this.eventLog = dependencies.eventLog;
    this.provider = dependencies.provider;
    this.verifyEffect = dependencies.verifyEffect;
  }

  async execute(input: AssetComputeExecutionInput): Promise<AssetComputeExecutionResult> {
    const fingerprint = executionFingerprint(input);
    const completed = this.completed.get(input.executionId);
    if (completed) {
      if (completed.fingerprint !== fingerprint) {
        throw new Error("EXECUTION_IDEMPOTENCY_CONFLICT");
      }
      return cloneResult(completed.result);
    }

    let state: ExecutionState = "REQUESTED";
    let reservationCreated = false;
    let settlementCompleted = false;
    const timestamp = input.now.toISOString();

    const move = (next: ExecutionState): void => {
      assertTransition(state, next);
      state = next;
    };

    const record = (
      eventType: string,
      source: string,
      payload: Readonly<Record<string, unknown>>,
    ): RiverEvent =>
      this.eventLog.append({
        eventId: `EV:${input.executionId}:${eventType}`,
        executionId: input.executionId,
        eventType,
        timestamp,
        source,
        payload,
      });

    try {
      record("execution.requested", "SYNNERGYZE", {
        principalId: input.principalId,
        assetId: input.assetId,
      });

      move("PRINCIPAL_RESOLVED");
      record("principal.resolved", "GENESIS", { ref: input.resolutionRefs.principal });

      move("ASSET_RESOLVED");
      record("asset.resolved", "GENESIS", { ref: input.resolutionRefs.asset });

      move("ENTITLEMENT_RESOLVED");
      record("entitlement.resolved", "GENESIS", { ref: input.resolutionRefs.entitlement });

      move("ROUTE_QUOTED");
      record("route.quoted", "SYNNERGYZE", {
        ref: input.resolutionRefs.routeQuote,
        selectedRoute: input.selectedRoute,
      });

      move("WARDEN_PENDING");
      validateWardenDecision(input.decision, input.now);
      move("AUTHORIZED");
      record("warden.allowed", "WARDEN", {
        decisionId: input.decision.decisionId,
        expiresAt: input.decision.expiresAt,
      });

      const reservation = this.fundingLedger.reserve({
        reservationId: input.reservationId,
        executionId: input.executionId,
        principalId: input.principalId,
        amount: input.reserveAmount,
        currency: input.currency,
        sourcePriority: input.fundingPriority,
      });
      reservationCreated = true;
      move("FUNDS_RESERVED");
      record("funding.reserved", "SILK-ALPHA", {
        reservationId: reservation.reservationId,
        amountReserved: reservation.amountReserved,
        sourceId: reservation.sourceId,
      });

      const capability = issueExecutionCapability({
        executionId: input.executionId,
        principalId: input.principalId,
        assetId: input.assetId,
        operations: input.operations,
        selectedRoute: input.selectedRoute,
        requestedCostCeiling: input.requestedCostCeiling,
        fundingReserved: reservation.amountReserved,
        currency: input.currency,
        decision: input.decision,
        now: input.now,
      });
      move("CAPABILITY_ISSUED");
      record("capability.issued", "WARDEN", {
        capabilityId: capability.capabilityId,
        maxCost: capability.maxCost,
        selectedRoute: capability.selectedRoute,
      });

      move("DISPATCHED");
      record("execution.dispatched", "SYNNERGYZE", {
        selectedRoute: input.selectedRoute,
      });

      move("RUNNING");
      const providerResult = await this.provider.execute({
        executionId: input.executionId,
        capability,
        inputRef: input.inputRef,
      });

      move("METERING");
      record("provider.completed", "PROVIDER", {
        provider: providerResult.receipt.provider,
        providerExecutionId: providerResult.receipt.providerExecutionId,
        actualCost: providerResult.receipt.actualCost,
        currency: providerResult.receipt.currency,
      });

      move("OUTPUT_OBSERVED");
      record("output.observed", "RIVER-ALPHA", {
        outputRef: providerResult.observation.outputRef,
      });

      const effect = await this.verifyEffect({
        executionId: input.executionId,
        outputRef: providerResult.observation.outputRef,
        providerReceipt: providerResult.receipt,
      });
      if (!effect.verified || effect.outputRef !== providerResult.observation.outputRef) {
        record("effect.rejected", "RIVER-ALPHA", {
          effectReceiptId: effect.effectReceiptId,
          observedOutputRef: providerResult.observation.outputRef,
          verifierOutputRef: effect.outputRef,
          reason: effect.verified ? "OUTPUT_REFERENCE_MISMATCH" : "VERIFIER_REJECTED",
        });
        throw new Error("EFFECT_NOT_VERIFIED");
      }

      move("EFFECT_VERIFIED");
      record("effect.verified", "RIVER-ALPHA", {
        effectReceiptId: effect.effectReceiptId,
        outputRef: effect.outputRef,
      });

      const derivedAsset: DerivedAssetCandidate = {
        assetId: `DERIVED:${input.executionId}`,
        parentAssetId: input.assetId,
        executionId: input.executionId,
        outputRef: effect.outputRef,
        effectReceiptId: effect.effectReceiptId,
      };

      move("ASSET_REGISTERED");
      record("asset.candidate_created", "GENESIS-ALPHA-PROJECTION", {
        assetId: derivedAsset.assetId,
        parentAssetId: derivedAsset.parentAssetId,
        effectReceiptId: derivedAsset.effectReceiptId,
      });

      const settlement = this.fundingLedger.settle(
        input.reservationId,
        providerResult.receipt.actualCost,
      );
      settlementCompleted = true;
      move("SETTLED");
      record("settlement.completed", "SILK-ALPHA", {
        reservationId: settlement.reservationId,
        amountSettled: settlement.amountSettled,
        amountReleased: settlement.amountReleased,
      });

      move("CLOSED");
      record("execution.closed", "SYNNERGYZE", { result: "SUCCESS" });

      const result: AssetComputeExecutionResult = {
        executionId: input.executionId,
        state: "CLOSED",
        settlement,
        derivedAsset,
        capability,
        providerReceipt: providerResult.receipt,
        effectReceiptId: effect.effectReceiptId,
      };
      this.completed.set(input.executionId, {
        fingerprint,
        result: cloneResult(result),
      });
      return result;
    } catch (error) {
      const errorCode = error instanceof Error ? error.message : "UNKNOWN_EXECUTION_ERROR";

      if (reservationCreated && !settlementCompleted) {
        const released = this.fundingLedger.release(input.reservationId);
        record("funding.released", "SILK-ALPHA", {
          reservationId: released.reservationId,
          amountReleased: released.amountReserved,
        });
      }

      if (!settlementCompleted) {
        move("EXCEPTION");
        record("execution.exception", "SYNNERGYZE", { errorCode });
        move("RECONCILIATION");
        record("reconciliation.completed", "SYNNERGYZE", {
          reservationReleased: reservationCreated,
        });
        move("CLOSED");
        record("execution.closed", "SYNNERGYZE", { result: "FAILED", errorCode });
      }

      throw error;
    }
  }
}
