import { describe, expect, it } from "vitest";

import {
  normalizeLegislativeLifecycle,
  normalizeLegislativeLifecycleV1,
} from "./lifecycle.ts";

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

describe("normalizeLegislativeLifecycleV1", () => {
  it("keeps introduction at PROPOSAL", () => {
    expect(normalizeLegislativeLifecycleV1({ introduced: true, actions: [] })).toBe("PROPOSAL");
  });

  it("maps House passage to ADVANCING, not ADOPTED", () => {
    expect(
      normalizeLegislativeLifecycleV1({
        introduced: true,
        actions: [{ code: "H11100", text: "Passed House" }],
      }),
    ).toBe("ADVANCING");
  });

  it("requires authoritative law evidence for ADOPTED", () => {
    expect(
      normalizeLegislativeLifecycleV1({
        introduced: true,
        actions: [{ text: "Became Law" }],
        lawNumber: "Public Law 119-1",
      }),
    ).toBe("ADOPTED");
  });

  it("uses UNKNOWN for unsupported ambiguous material", () => {
    expect(
      normalizeLegislativeLifecycleV1({
        introduced: false,
        actions: [{ text: "Activity" }],
      }),
    ).toBe("UNKNOWN");
  });

  it("prioritizes supersession over otherwise authoritative law evidence", () => {
    expect(
      normalizeLegislativeLifecycleV1({
        introduced: true,
        actions: [],
        lawNumber: "Public Law 119-1",
        enforcementEvidence: true,
        superseded: true,
      }),
    ).toBe("SUPERSEDED");
  });

  it("prioritizes withdrawal and failure before advancement or adoption", () => {
    expect(
      normalizeLegislativeLifecycleV1({
        introduced: true,
        actions: [{ text: "Passed House" }],
        lawNumber: "Public Law 119-1",
        withdrawn: true,
      }),
    ).toBe("WITHDRAWN");
    expect(
      normalizeLegislativeLifecycleV1({
        introduced: true,
        actions: [{ text: "Passed Senate" }],
        lawNumber: "Public Law 119-1",
        failed: true,
      }),
    ).toBe("FAILED");
  });

  it("requires law identity and an effective date not later than evaluation for EFFECTIVE", () => {
    expect(
      normalizeLegislativeLifecycleV1({
        introduced: true,
        actions: [],
        lawNumber: "Public Law 119-1",
        effectiveDate: "2026-09-01T00:00:00.000Z",
        evaluatedAt: "2026-09-02T00:00:00.000Z",
      }),
    ).toBe("EFFECTIVE");

    expect(
      normalizeLegislativeLifecycleV1({
        introduced: true,
        actions: [],
        lawNumber: "Public Law 119-1",
        effectiveDate: "2026-09-03T00:00:00.000Z",
        evaluatedAt: "2026-09-02T00:00:00.000Z",
      }),
    ).toBe("ADOPTED");
  });

  it("does not treat an effective date without authoritative law identity as EFFECTIVE", () => {
    expect(
      normalizeLegislativeLifecycleV1({
        introduced: true,
        actions: [],
        effectiveDate: "2026-09-01T00:00:00.000Z",
        evaluatedAt: "2026-09-02T00:00:00.000Z",
      }),
    ).toBe("PROPOSAL");
  });
});
