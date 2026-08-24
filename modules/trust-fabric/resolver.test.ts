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

  it("requires step-up when observed identity assurance is below the action requirement", () => {
    const result = resolveTrustV1({
      resolutionRef: "TRUST-RESOLUTION:IDENTITY-001",
      actionRef: "contract.commit",
      intendedEffect: {
        type: "contract.committed",
        irreversible: true,
      },
      requiredAssurance: {
        identity: 4,
        authority: 4,
        compute: 3,
        evidence: 3,
      },
      observedAssurance: {
        identity: 2,
        authority: 4,
        compute: 4,
        evidence: 4,
      },
      materialConflict: false,
    });

    expect(result.result).toBe("REQUIRES_STEP_UP");
    expect(result.material).toBe(true);
    expect(result.reasonCodes).toEqual(["insufficient_identity_assurance"]);
  });

  it("requires step-up when observed authority assurance is below the action requirement", () => {
    const result = resolveTrustV1({
      resolutionRef: "TRUST-RESOLUTION:AUTHORITY-001",
      actionRef: "payment.release",
      intendedEffect: {
        type: "payment.released",
        irreversible: true,
      },
      requiredAssurance: {
        identity: 3,
        authority: 4,
        compute: 3,
        evidence: 3,
      },
      observedAssurance: {
        identity: 4,
        authority: 2,
        compute: 4,
        evidence: 4,
      },
      materialConflict: false,
    });

    expect(result.result).toBe("REQUIRES_STEP_UP");
    expect(result.material).toBe(true);
    expect(result.reasonCodes).toEqual(["insufficient_authority_assurance"]);
  });

  it("returns conflicted when a material authority conflict affects the requested effect", () => {
    const result = resolveTrustV1({
      resolutionRef: "TRUST-RESOLUTION:CONFLICT-001",
      actionRef: "asset.transfer",
      intendedEffect: {
        type: "asset.transferred",
        irreversible: true,
      },
      requiredAssurance: {
        identity: 3,
        authority: 4,
        compute: 3,
        evidence: 3,
      },
      observedAssurance: {
        identity: 4,
        authority: 4,
        compute: 4,
        evidence: 4,
      },
      materialConflict: true,
    });

    expect(result.result).toBe("CONFLICTED");
    expect(result.material).toBe(true);
    expect(result.reasonCodes).toEqual(["material_trust_conflict"]);
  });
});
