import {
  PROGRAM_EVENT_CONTRACT_VERSION,
  type EventContractV1,
  type ProgramContractV1,
} from "../runtime/program-event-contract.js";
import {
  SOURCE_ADAPTER_CONTRACT_VERSION,
  assertSourceDoesNotGrantAuthority,
  type NormalizedSourceProgramEvent,
  type SourceLocator,
} from "./source-adapter-contract.js";

export const ECONOMIC_MODEL_ADAPTER_VERSION = "economic-business-model.v1" as const;

export type EconomicLifecycleState =
  | "MODELLED"
  | "REQUESTED"
  | "AUTHORIZED_OBLIGATION"
  | "INVOICED"
  | "CASH_OBSERVED"
  | "RECONCILED"
  | "SETTLEMENT_FINAL";

export interface EconomicAssumption {
  key: string;
  label: string;
  value: number;
  unit: string;
  sourceCell: string;
  sourceStatus: "WORKING_CONTEXT";
}

export interface EconomicDerivedOutput {
  key: string;
  label: string;
  value: number;
  unit: string;
  sourceCell: string;
  formula: string;
  sourceStatus: "DERIVED";
}

export interface EconomicModelInput {
  locator: SourceLocator;
  modelRef: string;
  scenarioName: string;
  disclaimer: string;
  assumptions: EconomicAssumption[];
  derivedOutputs: EconomicDerivedOutput[];
}

export interface EconomicStateEnvelope {
  lifecycle: EconomicLifecycleState;
  modelRef: string;
  requestRef?: string;
  authorityRef?: string;
  obligationRef?: string;
  invoiceRef?: string;
  cashEvidenceRef?: string;
  reconciliationRef?: string;
  settlementFinalityRef?: string;
}

export interface EconomicModelNormalizedEvent extends NormalizedSourceProgramEvent {
  modelRef: string;
  scenarioName: string;
  disclaimer: string;
  assumptions: EconomicAssumption[];
  derivedOutputs: EconomicDerivedOutput[];
  economicState: EconomicStateEnvelope;
}

function ensureModelOnly(state: EconomicStateEnvelope): void {
  if (state.lifecycle === "MODELLED") {
    if (
      state.requestRef ||
      state.authorityRef ||
      state.obligationRef ||
      state.invoiceRef ||
      state.cashEvidenceRef ||
      state.reconciliationRef ||
      state.settlementFinalityRef
    ) {
      throw new Error("MODELLED_STATE_CANNOT_CARRY_DOWNSTREAM_ECONOMIC_REFS");
    }
  }
}

export function adaptEconomicModel(input: EconomicModelInput): EconomicModelNormalizedEvent {
  if (!input.assumptions.length) throw new Error("ECONOMIC_ASSUMPTIONS_REQUIRED");
  if (!input.derivedOutputs.length) throw new Error("ECONOMIC_DERIVED_OUTPUTS_REQUIRED");
  if (!input.disclaimer.toLowerCase().includes("demonstration") && !input.disclaimer.toLowerCase().includes("not guaranteed")) {
    throw new Error("MODEL_DISCLAIMER_REQUIRED");
  }

  const programRef = `program:economic-model:${input.modelRef}`;
  const program: ProgramContractV1 = {
    contractVersion: PROGRAM_EVENT_CONTRACT_VERSION,
    programRef,
    programType: "ECONOMIC_MODEL_REVIEW",
    version: 1,
    sourceRef: `source:${input.locator.fileSha256}`,
    ownerContextRef: "registry-context:UNRESOLVED",
    missionPurpose: "Preserve source economic assumptions and derived model outputs without converting them into obligations, invoices, cash or settlement authority",
    targetOutcomeRefs: [],
    contextRefs: ["economic-plane:MODEL", `model:${input.modelRef}`],
    participantRoleRefs: [],
    dependencyRefs: [],
    constraintRefs: [
      "constraint:modelled-value-ne-obligation",
      "constraint:obligation-ne-invoice",
      "constraint:invoice-ne-cash",
      "constraint:cash-ne-settlement-finality",
    ],
    authorityRefs: [],
    requirementRefs: ["requirement:economic-model-review-authority", "requirement:model-source-evidence"],
    economicRuleRefs: [],
    settlementContextRefs: [],
    state: "DRAFT",
  };

  const event: EventContractV1 = {
    eventDefinitionRef: `event-def:economic-model:${input.modelRef}:review`,
    programRef,
    sequence: 1,
    actorRef: "digitalme:UNRESOLVED",
    thingRef: `economic-model:${input.modelRef}`,
    requestedCapability: "REVIEW_MODELLED_ECONOMIC_SCENARIO",
    dependencyRefs: [],
    constraintRefs: [...program.constraintRefs],
    authorityRefs: [],
    requirementRefs: [...program.requirementRefs],
    economicRuleRefs: [],
  };

  const economicState: EconomicStateEnvelope = {
    lifecycle: "MODELLED",
    modelRef: input.modelRef,
  };
  ensureModelOnly(economicState);

  const item: EconomicModelNormalizedEvent = {
    contractVersion: SOURCE_ADAPTER_CONTRACT_VERSION,
    adapterType: "ECONOMIC_MODEL",
    source: {
      locator: input.locator,
      rawValue: input.scenarioName,
      sourceAuthorityStatus: "WORKING_CONTEXT",
    },
    program,
    event,
    governance: [
      { field: "owner_role_ref", state: "UNRESOLVED", refs: [] },
      { field: "authority_refs", state: "UNRESOLVED", refs: [], note: "Spreadsheet model does not authorize an obligation." },
      { field: "dependency_refs", state: "NOT_APPLICABLE", refs: [] },
      { field: "evidence_requirement_refs", state: "RESOLVED", refs: ["requirement:model-source-evidence"] },
      { field: "target_state_ref", state: "RESOLVED", refs: ["state:economic-model-reviewed"] },
      { field: "closure_condition_ref", state: "RESOLVED", refs: ["closure:model-review-recorded"] },
      { field: "r5_candidate_route", state: "RESOLVED", refs: ["route:prepare-economic-request"], note: "Route prepares a request only; it does not create an obligation." },
    ],
    r5CandidateRoute: "route:prepare-economic-request",
    targetStateRef: "state:economic-model-reviewed",
    closureConditionRef: "closure:model-review-recorded",
    lifecycleState: "READY_FOR_GOVERNANCE",
    modelRef: input.modelRef,
    scenarioName: input.scenarioName,
    disclaimer: input.disclaimer,
    assumptions: input.assumptions,
    derivedOutputs: input.derivedOutputs,
    economicState,
  };

  assertSourceDoesNotGrantAuthority(item);
  return item;
}

export function prepareEconomicRequest(
  sourceItem: EconomicModelNormalizedEvent,
  requestRef: string,
): EconomicModelNormalizedEvent {
  if (sourceItem.economicState.lifecycle !== "MODELLED") throw new Error("ECONOMIC_REQUEST_REQUIRES_MODELLED_STATE");
  if (!requestRef.startsWith("request:")) throw new Error("VALID_ECONOMIC_REQUEST_REF_REQUIRED");

  return {
    ...sourceItem,
    economicState: {
      lifecycle: "REQUESTED",
      modelRef: sourceItem.modelRef,
      requestRef,
    },
  };
}

export function authorizeEconomicObligation(
  requestedItem: EconomicModelNormalizedEvent,
  authorityRef: string,
  obligationRef: string,
): EconomicModelNormalizedEvent {
  if (requestedItem.economicState.lifecycle !== "REQUESTED") throw new Error("OBLIGATION_REQUIRES_REQUESTED_STATE");
  if (!authorityRef.startsWith("authority:")) throw new Error("VALID_AUTHORITY_REF_REQUIRED");
  if (!obligationRef.startsWith("obligation:")) throw new Error("VALID_OBLIGATION_REF_REQUIRED");

  return {
    ...requestedItem,
    economicState: {
      ...requestedItem.economicState,
      lifecycle: "AUTHORIZED_OBLIGATION",
      authorityRef,
      obligationRef,
    },
  };
}

export function recordInvoice(
  obligatedItem: EconomicModelNormalizedEvent,
  invoiceRef: string,
): EconomicModelNormalizedEvent {
  if (obligatedItem.economicState.lifecycle !== "AUTHORIZED_OBLIGATION") throw new Error("INVOICE_REQUIRES_AUTHORIZED_OBLIGATION");
  if (!invoiceRef.startsWith("invoice:")) throw new Error("VALID_INVOICE_REF_REQUIRED");
  return { ...obligatedItem, economicState: { ...obligatedItem.economicState, lifecycle: "INVOICED", invoiceRef } };
}

export function recordCashEvidence(
  invoicedItem: EconomicModelNormalizedEvent,
  cashEvidenceRef: string,
): EconomicModelNormalizedEvent {
  if (invoicedItem.economicState.lifecycle !== "INVOICED") throw new Error("CASH_REQUIRES_INVOICED_STATE");
  if (!cashEvidenceRef.startsWith("river-evidence:")) throw new Error("CASH_REQUIRES_RIVER_EVIDENCE");
  return { ...invoicedItem, economicState: { ...invoicedItem.economicState, lifecycle: "CASH_OBSERVED", cashEvidenceRef } };
}

export function reconcileEconomicState(
  cashItem: EconomicModelNormalizedEvent,
  reconciliationRef: string,
): EconomicModelNormalizedEvent {
  if (cashItem.economicState.lifecycle !== "CASH_OBSERVED") throw new Error("RECONCILIATION_REQUIRES_CASH_EVIDENCE");
  if (!reconciliationRef.startsWith("reconciliation:")) throw new Error("VALID_RECONCILIATION_REF_REQUIRED");
  return { ...cashItem, economicState: { ...cashItem.economicState, lifecycle: "RECONCILED", reconciliationRef } };
}

export function finalizeSettlement(
  reconciledItem: EconomicModelNormalizedEvent,
  settlementFinalityRef: string,
): EconomicModelNormalizedEvent {
  if (reconciledItem.economicState.lifecycle !== "RECONCILED") throw new Error("SETTLEMENT_FINALITY_REQUIRES_RECONCILIATION");
  if (!settlementFinalityRef.startsWith("settlement-finality:")) throw new Error("VALID_SETTLEMENT_FINALITY_REF_REQUIRED");
  return {
    ...reconciledItem,
    economicState: { ...reconciledItem.economicState, lifecycle: "SETTLEMENT_FINAL", settlementFinalityRef },
  };
}
