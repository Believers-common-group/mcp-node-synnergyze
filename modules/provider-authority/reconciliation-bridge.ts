import type {
  ReconciliationClassificationV1,
  ReconciliationRemedyProposalV1,
  ReconciliationResultV1,
} from "../synnergyze/reconciliation-fabric.ts";
import type { ProviderExceptionV1 } from "./contracts.ts";

export type ProviderReconciliationDispositionV1 =
  | "CLOSE"
  | "REMEDY_PROPOSED"
  | "ESCALATE"
  | "REJECTED";

export interface ProviderReconciliationInterpretationV1 {
  disposition: ProviderReconciliationDispositionV1;
  retryAllowed: false;
  closureEligible: boolean;
  classification?: ReconciliationClassificationV1;
  reconciliationRef?: string;
  remedy?: ReconciliationRemedyProposalV1;
  reasonCode?: string;
}

export function interpretProviderReconciliationV1(
  exception: ProviderExceptionV1,
  reconciliation: ReconciliationResultV1,
): ProviderReconciliationInterpretationV1 {
  if (exception.effectState !== "UNKNOWN" && exception.effectState !== "PARTIAL") {
    throw new Error("provider_reconciliation_not_required");
  }

  if (reconciliation.state !== "DETERMINED") {
    return {
      disposition: "REJECTED",
      retryAllowed: false,
      closureEligible: false,
      reasonCode: reconciliation.reasonCode,
    };
  }

  const { determination } = reconciliation;
  const remedy = determination.candidateRemedies[0];

  if (determination.classification === "MATCH") {
    if (!determination.closureEligible) {
      return {
        disposition: "ESCALATE",
        retryAllowed: false,
        closureEligible: false,
        classification: determination.classification,
        reconciliationRef: determination.reconciliationRef,
      };
    }

    return {
      disposition: "CLOSE",
      retryAllowed: false,
      closureEligible: true,
      classification: determination.classification,
      reconciliationRef: determination.reconciliationRef,
    };
  }

  if (determination.classification === "MISSING_EFFECT" && remedy?.kind === "RECOVER") {
    return {
      disposition: "REMEDY_PROPOSED",
      retryAllowed: false,
      closureEligible: false,
      classification: determination.classification,
      reconciliationRef: determination.reconciliationRef,
      remedy,
    };
  }

  if (determination.classification === "UNEXPECTED_EFFECT" && remedy?.kind === "COMPENSATE") {
    return {
      disposition: "REMEDY_PROPOSED",
      retryAllowed: false,
      closureEligible: false,
      classification: determination.classification,
      reconciliationRef: determination.reconciliationRef,
      remedy,
    };
  }

  return {
    disposition: "ESCALATE",
    retryAllowed: false,
    closureEligible: false,
    classification: determination.classification,
    reconciliationRef: determination.reconciliationRef,
    remedy,
  };
}
