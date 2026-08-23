import { describe, expect, it } from "vitest";

import { resolveTrustV1 } from "./resolver.ts";

describe("WARDEN-TRUST-FABRIC-001 resolver", () => {
  it("holds when observed compute assurance is below the action requirement", () => {
    const result = resolveTrustV1({
      resolutionRef: "TRUST-RESOLUTION:001",
      actionRef: "purchase.commit",
      intendedEffect: {
        type: "purchase.committed",
        irreversible: true,
      },
      requiredAssurance: {
        identity: 3,
        authority: 4,
        compute: 3,
        evidence: 2,
      },
      observedAssurance: {
        identity: 4,
        authority: 4,
        compute: 2,
        evidence: 3,
      },
      materialConflict: false,
    });

    expect(result.result).toBe("HOLD");
    expect(result.material).toBe(true);
    expect(result.irreversibleEffect).toBe(true);
    expect(result.reasonCodes).toEqual(["insufficient_compute_assurance"]);
  });
});
