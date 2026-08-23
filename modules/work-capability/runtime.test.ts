import { describe, expect, it } from "vitest";

import { compileSyntheticGarmentWorkflowV1 } from "./runtime.ts";

describe("WORK-CAPABILITY-RUNTIME-001 compiler", () => {
  it("compiles at least ten unassigned work units for the garment reference objective", () => {
    const result = compileSyntheticGarmentWorkflowV1({
      objectiveRef: "OBJECTIVE:B124",
      principalRef: "ORG:DDB-01",
      requiredEffectRef: "EFFECT:B124:500-ACCEPTED",
      deadline: "2026-08-30T18:00:00+05:30",
    });

    expect(result.workUnits.length).toBeGreaterThanOrEqual(10);
    expect(result.workUnits.every((unit) => !("assignmentRef" in unit))).toBe(true);
    expect(result.workUnits.some((unit) => unit.action === "attach_waistband")).toBe(true);
  });
});
