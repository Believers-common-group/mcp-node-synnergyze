import { describe, expect, it } from "vitest";
import {
  assertAllowedTransition,
  isAllowedTransition,
  validatePrimarySource,
} from "./acquisition.ts";

describe("acquisition transitions", () => {
  it("allows the canonical next step", () => {
    expect(isAllowedTransition("DISCOVERED", "SELECTED_FOR_OUTREACH")).toBe(true);
  });

  it("rejects skipping directly from discovered to qualified", () => {
    expect(isAllowedTransition("DISCOVERED", "QUALIFIED")).toBe(false);
    expect(() => assertAllowedTransition("DISCOVERED", "QUALIFIED")).toThrow(
      "Illegal acquisition transition: DISCOVERED -> QUALIFIED",
    );
  });

  it("allows terminal loss from active commercial states", () => {
    expect(isAllowedTransition("PROPOSAL_ACTIVE", "LOST")).toBe(true);
  });
});

describe("primary source provenance", () => {
  it("requires an object reference for BC, VSR, and CC", () => {
    expect(() =>
      validatePrimarySource({ registry: "VSR", sourceObjectType: "NODE", sourceObjectId: "" }),
    ).toThrow("VSR primary source requires sourceObjectId");
  });

  it("allows EXTERNAL without a network object id", () => {
    expect(
      validatePrimarySource({ registry: "EXTERNAL", sourceObjectType: "OTHER", sourceObjectId: null }),
    ).toEqual({ registry: "EXTERNAL", sourceObjectType: "OTHER", sourceObjectId: null });
  });
});
