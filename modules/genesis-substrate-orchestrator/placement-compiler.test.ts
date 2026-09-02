import { describe, expect, it } from "vitest";

import type { SubstrateKind } from "./contracts.ts";

function acceptSubstrateKind(kind: SubstrateKind): SubstrateKind {
  return kind;
}

describe("Genesis substrate taxonomy", () => {
  it("models G0-G4 plus Terra without a G5 class", () => {
    const kinds: SubstrateKind[] = ["G0", "G1", "G2", "G3", "G4", "TERRA"];

    expect(kinds.map(acceptSubstrateKind)).toEqual([
      "G0",
      "G1",
      "G2",
      "G3",
      "G4",
      "TERRA",
    ]);
  });
});
