import { describe, expect, it } from "vitest";

import { resolveTrustV1 } from "./resolver.ts";
import { createTrustPathV1 } from "./trust-path.ts";

describe("TrustPathV1", () => {
  it("materializes a deterministic action-bound path independent of selected receipt ordering", () => {
    const request = {
      resolutionRef: "TRUST-RESOLUTION:PATH-001",
      actionRef: "payment.release",
      intendedEffect: {
        type: "payment.released",
        irreversible: true,
      },
      requiredAssurance: {
        identity: 3 as const,
        authority: 4 as const,
        compute: 3 as const,
        evidence: 3 as const,
      },
      observedAssurance: {
        identity: 4 as const,
        authority: 4 as const,
        compute: 4 as const,
        evidence: 4 as const,
      },
      requiredMaxAgeSeconds: { authority: 300 },
      observedAgeSeconds: { authority: 120 },
      materialConflict: false,
    };
    const resolution = resolveTrustV1(request);
    const input = {
      request,
      resolution,
      requirementSetRef: "ASSURANCE-REQUIREMENT-SET:PAYMENT-001",
      selectedReceiptRefs: ["TRUST-RECEIPT:B", "TRUST-RECEIPT:A"],
      selectedAssuranceStatementRefs: ["ASSURANCE-STATEMENT:B", "ASSURANCE-STATEMENT:A"],
      policyRef: "POLICY:PAYMENT-001",
      resolvedAt: "2026-08-25T05:00:00.000Z",
      validUntil: "2026-08-25T05:05:00.000Z",
      riverEventRef: "RIVER-EVENT:TRUST-PATH-001",
    };

    const first = createTrustPathV1(input);
    const reordered = createTrustPathV1({
      ...input,
      selectedReceiptRefs: [...input.selectedReceiptRefs].reverse(),
      selectedAssuranceStatementRefs: [...input.selectedAssuranceStatementRefs].reverse(),
    });

    expect(first.trustPathRef).toBe(reordered.trustPathRef);
    expect(first.result).toBe("SATISFIED");
    expect(first.selectedReceiptRefs).toEqual(["TRUST-RECEIPT:A", "TRUST-RECEIPT:B"]);
    expect(first.selectedAssuranceStatementRefs).toEqual([
      "ASSURANCE-STATEMENT:A",
      "ASSURANCE-STATEMENT:B",
    ]);
    expect(first.actionRef).toBe("payment.release");
  });

  it("rejects a resolution that is not bound to the request resolution reference", () => {
    const request = {
      resolutionRef: "TRUST-RESOLUTION:PATH-002",
      actionRef: "asset.transfer",
      intendedEffect: { type: "asset.transferred", irreversible: true },
      requiredAssurance: { identity: 3 as const, authority: 4 as const, compute: 3 as const, evidence: 3 as const },
      observedAssurance: { identity: 4 as const, authority: 4 as const, compute: 4 as const, evidence: 4 as const },
      materialConflict: false,
    };

    expect(() =>
      createTrustPathV1({
        request,
        resolution: {
          resolutionRef: "TRUST-RESOLUTION:OTHER",
          result: "SATISFIED",
          material: false,
          irreversibleEffect: true,
          reasonCodes: [],
        },
        selectedReceiptRefs: ["TRUST-RECEIPT:A"],
        policyRef: "POLICY:ASSET-001",
        resolvedAt: "2026-08-25T05:00:00.000Z",
        riverEventRef: "RIVER-EVENT:TRUST-PATH-002",
      }),
    ).toThrow("trust_path_resolution_mismatch");
  });
});
