import { describe, expect, it } from "vitest";

import { assertGoogleIdentityModeConstraintV1 } from "./adapter.ts";

describe("Google Warden identity-mode binding R0.5", () => {
  it("accepts ADC only when Warden explicitly allowed ADC mode", () => {
    expect(
      assertGoogleIdentityModeConstraintV1("ADC", ["provider_identity_mode:ADC"]),
    ).toBe(true);
  });

  it("rejects silent downgrade from Agent Identity authority to ADC", () => {
    expect(() =>
      assertGoogleIdentityModeConstraintV1("ADC", [
        "provider_identity_mode:AGENT_IDENTITY",
      ]),
    ).toThrow("google_identity_mode_constraint_required");
  });

  it("requires explicit Agent Identity mode when an attested principal is used", () => {
    expect(
      assertGoogleIdentityModeConstraintV1("AGENT_IDENTITY", [
        "provider_identity_mode:AGENT_IDENTITY",
      ]),
    ).toBe(true);
  });
});
