import { describe, expect, it } from "vitest";

import { normalizeLegislativeLifecycle } from "./lifecycle.ts";

describe("normalizeLegislativeLifecycle", () => {
  it("does not treat introduction as adoption", () => {
    expect(normalizeLegislativeLifecycle([{ text: "Introduced in House" }]).state).toBe("PROPOSAL");
  });

  it("recognizes enacted authoritative state", () => {
    expect(
      normalizeLegislativeLifecycle(
        [{ text: "Became Law" }],
        { lawNumber: "Public Law 119-1" },
      ).state,
    ).toBe("ADOPTED");
  });

  it("recognizes advancing legislative action without overstating adoption", () => {
    expect(normalizeLegislativeLifecycle([{ text: "Passed House" }]).state).toBe("ADVANCING");
  });

  it("uses UNKNOWN for ambiguous evidence", () => {
    expect(normalizeLegislativeLifecycle([{ text: "Status updated" }]).state).toBe("UNKNOWN");
  });
});
