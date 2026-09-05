import { describe, expect, it } from "vitest";
import { evaluateT01Qualification } from "./t01.ts";

const eligible = {
  independentlyProvisioned: true,
  canonicalNodeExists: true,
  wardenAdmitted: true,
  riverEvidenced: true,
  duplicateCheck: "PASS" as const,
  placeholderCheck: "PASS" as const,
  destinationNodeId: "GENESIS-NODE-000037",
  wardenDecisionRef: "WARDEN-DEC-037",
  riverReceiptRef: "RIVER-REC-037",
};

describe("T01 qualification", () => {
  it("qualifies only when every mandatory gate passes", () => {
    expect(evaluateT01Qualification(eligible)).toEqual({ countable: true, blockers: [] });
  });

  it("fails closed when River evidence is missing", () => {
    expect(evaluateT01Qualification({ ...eligible, riverEvidenced: false, riverReceiptRef: null })).toEqual({
      countable: false,
      blockers: ["RIVER_EVIDENCE_REQUIRED", "RIVER_RECEIPT_REF_REQUIRED"],
    });
  });

  it("fails closed for a duplicate destination node", () => {
    expect(evaluateT01Qualification({ ...eligible, duplicateCheck: "FAIL" })).toEqual({
      countable: false,
      blockers: ["DUPLICATE_DESTINATION_NODE"],
    });
  });
});
