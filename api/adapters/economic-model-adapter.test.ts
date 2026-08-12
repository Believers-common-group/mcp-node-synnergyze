import { describe, expect, it } from "vitest";

import {
  adaptEconomicModel,
  authorizeEconomicObligation,
  finalizeSettlement,
  prepareEconomicRequest,
  reconcileEconomicState,
  recordCashEvidence,
  recordInvoice,
} from "./economic-model-adapter.js";

const SOURCE_SHA256 = "533a5caebbb3ebc336137adf0a72cf734b09a19ef4db37b0952834f4f7eb4914";

function calculatorSource() {
  return adaptEconomicModel({
    locator: {
      fileName: "People Magic Profit | $1M Math - July 2024.xlsx",
      fileSha256: SOURCE_SHA256,
      sheetName: "Your ROI Calculator",
      cellAddress: "B5:F26",
      sourceRow: 5,
    },
    modelRef: "people-magic-profit-roi-july-2024",
    scenarioName: "Your ROI Calculator - source sample",
    disclaimer: "FOR DEMONSTRATION PURPOSES - RESULTS ARE NOT GUARANTEED",
    assumptions: [
      { key: "audience", label: "Social/Newsletter", value: 99, unit: "followers", sourceCell: "C5", sourceStatus: "WORKING_CONTEXT" },
      { key: "conversion_rate", label: "Conversion Rate", value: 0.1862, unit: "ratio", sourceCell: "C6", sourceStatus: "WORKING_CONTEXT" },
      { key: "monthly_growth", label: "Monthly Compound Growth", value: 0.1, unit: "ratio", sourceCell: "C7", sourceStatus: "WORKING_CONTEXT" },
      { key: "monthly_subscription", label: "Monthly Subscription", value: 48, unit: "USD/month", sourceCell: "C11", sourceStatus: "WORKING_CONTEXT" },
      { key: "annual_plan_expense", label: "Mighty Pro - Do It With You", value: 20000, unit: "USD/year", sourceCell: "C17", sourceStatus: "WORKING_CONTEXT" },
    ],
    derivedOutputs: [
      { key: "year1_members", label: "Year 1 Members", value: 18.4338, unit: "members", sourceCell: "C10", formula: "=C6*C5", sourceStatus: "DERIVED" },
      { key: "annual_revenue_per_member", label: "Annual Revenue/Member", value: 576, unit: "USD/member/year", sourceCell: "C12", formula: "=C11*12", sourceStatus: "DERIVED" },
      { key: "year1_revenue", label: "Year 1 Annual Revenue", value: 10617.8688, unit: "USD/year", sourceCell: "C13", formula: "=C12*C10", sourceStatus: "DERIVED" },
      { key: "transaction_fee", label: "Transaction Fee", value: 53.089344, unit: "USD/year", sourceCell: "C18", formula: "=C13*vlookup(B17,$B$35:$D$40,3,0)", sourceStatus: "DERIVED" },
      { key: "year1_profit", label: "Year 1 Profit", value: -9435.220544, unit: "USD/year", sourceCell: "C24", formula: "=C13-(C17+C21+C18)", sourceStatus: "DERIVED" },
      { key: "year1_roi", label: "Year 1 ROI", value: -0.4705120683, unit: "ratio", sourceCell: "C25", formula: "=C24/(C21+C18+C17)", sourceStatus: "DERIVED" },
      { key: "year1_margin", label: "Year 1 Margin", value: -0.8886171718, unit: "ratio", sourceCell: "C26", formula: "=C24/C13", sourceStatus: "DERIVED" },
    ],
  });
}

describe("P4 economic/business model adapter", () => {
  it("preserves actual assumptions separately from spreadsheet-derived outputs", () => {
    const item = calculatorSource();

    expect(item.source.locator.fileSha256).toBe(SOURCE_SHA256);
    expect(item.source.locator.sheetName).toBe("Your ROI Calculator");
    expect(item.source.sourceAuthorityStatus).toBe("WORKING_CONTEXT");
    expect(item.assumptions.find((row) => row.key === "audience")?.value).toBe(99);
    expect(item.assumptions.find((row) => row.key === "conversion_rate")?.value).toBe(0.1862);
    expect(item.derivedOutputs.find((row) => row.key === "year1_revenue")?.formula).toBe("=C12*C10");
    expect(item.derivedOutputs.find((row) => row.key === "year1_profit")?.value).toBe(-9435.220544);
    expect(item.derivedOutputs.find((row) => row.key === "year1_roi")?.value).toBe(-0.4705120683);
    expect(item.derivedOutputs.every((row) => row.sourceStatus === "DERIVED")).toBe(true);
  });

  it("starts at MODELLED with no obligation, invoice, cash or settlement refs", () => {
    const item = calculatorSource();

    expect(item.economicState).toEqual({
      lifecycle: "MODELLED",
      modelRef: "people-magic-profit-roi-july-2024",
    });
    expect(item.program.authorityRefs).toEqual([]);
    expect(item.program.economicRuleRefs).toEqual([]);
    expect(item.r5CandidateRoute).toBe("route:prepare-economic-request");
  });

  it("preparing a request does not create an obligation", () => {
    const requested = prepareEconomicRequest(calculatorSource(), "request:sandbox:model-review-001");

    expect(requested.economicState.lifecycle).toBe("REQUESTED");
    expect(requested.economicState.requestRef).toBe("request:sandbox:model-review-001");
    expect(requested.economicState.obligationRef).toBeUndefined();
    expect(requested.economicState.invoiceRef).toBeUndefined();
    expect(requested.economicState.cashEvidenceRef).toBeUndefined();
  });

  it("rejects invoice, cash, reconciliation and finality shortcuts", () => {
    const modelled = calculatorSource();
    const requested = prepareEconomicRequest(modelled, "request:sandbox:model-review-001");

    expect(() => recordInvoice(modelled, "invoice:sandbox:001")).toThrow("INVOICE_REQUIRES_AUTHORIZED_OBLIGATION");
    expect(() => recordCashEvidence(requested, "river-evidence:sandbox:cash-001")).toThrow("CASH_REQUIRES_INVOICED_STATE");
    expect(() => reconcileEconomicState(requested, "reconciliation:sandbox:001")).toThrow("RECONCILIATION_REQUIRES_CASH_EVIDENCE");
    expect(() => finalizeSettlement(requested, "settlement-finality:sandbox:001")).toThrow("SETTLEMENT_FINALITY_REQUIRES_RECONCILIATION");
  });

  it("requires an explicit authority reference before an obligation exists", () => {
    const requested = prepareEconomicRequest(calculatorSource(), "request:sandbox:model-review-001");

    expect(() => authorizeEconomicObligation(requested, "not-authority", "obligation:sandbox:001")).toThrow("VALID_AUTHORITY_REF_REQUIRED");

    const obligated = authorizeEconomicObligation(
      requested,
      "authority:sandbox:economic-obligation-001",
      "obligation:sandbox:001",
    );
    expect(obligated.economicState.lifecycle).toBe("AUTHORIZED_OBLIGATION");
    expect(obligated.economicState.authorityRef).toBe("authority:sandbox:economic-obligation-001");
  });

  it("can represent the full synthetic lineage only in strict order", () => {
    const requested = prepareEconomicRequest(calculatorSource(), "request:sandbox:model-review-001");
    const obligated = authorizeEconomicObligation(
      requested,
      "authority:sandbox:economic-obligation-001",
      "obligation:sandbox:001",
    );
    const invoiced = recordInvoice(obligated, "invoice:sandbox:001");
    const cashObserved = recordCashEvidence(invoiced, "river-evidence:sandbox:cash-001");
    const reconciled = reconcileEconomicState(cashObserved, "reconciliation:sandbox:001");
    const final = finalizeSettlement(reconciled, "settlement-finality:sandbox:001");

    expect(final.economicState).toEqual({
      lifecycle: "SETTLEMENT_FINAL",
      modelRef: "people-magic-profit-roi-july-2024",
      requestRef: "request:sandbox:model-review-001",
      authorityRef: "authority:sandbox:economic-obligation-001",
      obligationRef: "obligation:sandbox:001",
      invoiceRef: "invoice:sandbox:001",
      cashEvidenceRef: "river-evidence:sandbox:cash-001",
      reconciliationRef: "reconciliation:sandbox:001",
      settlementFinalityRef: "settlement-finality:sandbox:001",
    });
  });
});
