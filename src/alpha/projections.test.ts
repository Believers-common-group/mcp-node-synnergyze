import { describe, expect, it } from "vitest";
import {
  acquisitionFunnel,
  sourceNodeYield,
  toolkitForwardDemand,
} from "./projections.ts";

const records = [
  {
    sourceRegistry: "VSR" as const,
    sourceNodeId: "VSR-NODE-SYNTH-001",
    state: "NODE_ACTIVE" as const,
    countable: true,
  },
  {
    sourceRegistry: "VSR" as const,
    sourceNodeId: "VSR-NODE-SYNTH-001",
    state: "QUALIFIED" as const,
    countable: false,
  },
  {
    sourceRegistry: "BC" as const,
    sourceNodeId: "BC-NODE-SYNTH-001",
    state: "ENGAGED" as const,
    countable: false,
  },
];

describe("sourceNodeYield", () => {
  it("aggregates network yield by source node", () => {
    expect(sourceNodeYield(records)).toEqual([
      {
        sourceRegistry: "BC",
        sourceNodeId: "BC-NODE-SYNTH-001",
        opportunities: 1,
        engaged: 1,
        qualified: 0,
        commercialAgreed: 0,
        provisioned: 0,
        countableNodes: 0,
        activeNodes: 0,
      },
      {
        sourceRegistry: "VSR",
        sourceNodeId: "VSR-NODE-SYNTH-001",
        opportunities: 2,
        engaged: 2,
        qualified: 2,
        commercialAgreed: 1,
        provisioned: 1,
        countableNodes: 1,
        activeNodes: 1,
      },
    ]);
  });
});

describe("acquisitionFunnel", () => {
  it("counts current inventory by acquisition state", () => {
    expect(acquisitionFunnel(records)).toEqual([
      { state: "ENGAGED", count: 1 },
      { state: "QUALIFIED", count: 1 },
      { state: "NODE_ACTIVE", count: 1 },
    ]);
  });
});

describe("toolkitForwardDemand", () => {
  it("counts toolkit requirements deterministically", () => {
    expect(
      toolkitForwardDemand([
        { toolkitId: "ALPHA-TK-SYNTH-004" },
        { toolkitId: "ALPHA-TK-SYNTH-001" },
        { toolkitId: "ALPHA-TK-SYNTH-004" },
      ]),
    ).toEqual([
      { toolkitId: "ALPHA-TK-SYNTH-001", count: 1 },
      { toolkitId: "ALPHA-TK-SYNTH-004", count: 2 },
    ]);
  });
});
