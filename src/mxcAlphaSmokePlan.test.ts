import { describe, expect, it } from "vitest";
import { createAlphaSmokePlan } from "./mxcAlphaSmokePlan.js";

describe("Alpha MXC physical smoke plan", () => {
  it("defines exactly W-017 through W-021 and marks every case unexecuted by default", () => {
    const plan = createAlphaSmokePlan({
      nodeId: "ALPHA-NODE-001",
      deviceId: "GENESIS-DEVICE-001",
      workspaceId: "WORKSPACE-001",
      riverReservationPrefix: "RR-MXC-SMOKE",
    });

    expect(plan.map((test) => test.testId)).toEqual([
      "MXC-W-017",
      "MXC-W-018",
      "MXC-W-019",
      "MXC-W-020",
      "MXC-W-021",
    ]);
    expect(plan.every((test) => test.status === "UNEXECUTED")).toBe(true);
  });

  it("binds each case to Alpha Genesis context and a unique River reservation", () => {
    const plan = createAlphaSmokePlan({
      nodeId: "ALPHA-NODE-001",
      deviceId: "DESKTOP-M13TEPQ",
      workspaceId: "WARDEN-MXC-QUALIFICATION",
      riverReservationPrefix: "RR-MXC-SMOKE",
    });

    expect(new Set(plan.map((test) => test.riverReservationId)).size).toBe(5);
    for (const test of plan) {
      expect(test.genesisContext).toEqual({
        nodeId: "ALPHA-NODE-001",
        deviceId: "DESKTOP-M13TEPQ",
        workspaceId: "WARDEN-MXC-QUALIFICATION",
      });
      expect(test.riverReservationId).toMatch(/^RR-MXC-SMOKE-W0(17|18|19|20|21)$/);
    }
  });

  it("classifies W-017..020 as expected denials and W-021 as expected success", () => {
    const plan = createAlphaSmokePlan({
      nodeId: "ALPHA-NODE-001",
      deviceId: "GENESIS-DEVICE-001",
      workspaceId: "WORKSPACE-001",
      riverReservationPrefix: "RR-MXC-SMOKE",
    });

    expect(plan.slice(0, 4).every((test) => test.expectedEffect === "BLOCKED")).toBe(true);
    expect(plan[4]?.expectedEffect).toBe("ALLOWED");
  });

  it("never embeds user-sensitive paths or credentials in the qualification plan", () => {
    const plan = createAlphaSmokePlan({
      nodeId: "ALPHA-NODE-001",
      deviceId: "GENESIS-DEVICE-001",
      workspaceId: "WORKSPACE-001",
      riverReservationPrefix: "RR-MXC-SMOKE",
    });

    const serialized = JSON.stringify(plan).toLowerCase();
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("users\\");
    expect(serialized).not.toContain("documents");
  });
});
