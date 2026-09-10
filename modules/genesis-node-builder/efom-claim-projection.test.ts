import { describe, expect, it } from "vitest";

import { projectEfomClaimStateV1 } from "./efom-claim-projection.ts";

describe("GENESIS-EFOM-CLAIM-PROJECTION-R0-1", () => {
  it("maps raw and evidenced observations without promoting authority", () => {
    expect(
      projectEfomClaimStateV1({ kind: "OBSERVATION", sourceEvidenceRefs: [] }),
    ).toBe("OBSERVED");
    expect(
      projectEfomClaimStateV1({
        kind: "OBSERVATION",
        sourceEvidenceRefs: ["RIVER-EVIDENCE:001"],
      }),
    ).toBe("EVIDENCED");
  });

  it("maps public corroboration, hypothesis and conflict to existing Genesis states", () => {
    expect(
      projectEfomClaimStateV1({
        kind: "FINDING",
        sourceEvidenceRefs: ["PUBLIC-EVIDENCE:001"],
        findingStatus: "CORROBORATED",
        publicCorroboration: true,
      }),
    ).toBe("CORROBORATED_PUBLIC");
    expect(
      projectEfomClaimStateV1({
        kind: "FINDING",
        sourceEvidenceRefs: ["RIVER-EVIDENCE:001"],
        findingStatus: "HYPOTHESIS",
      }),
    ).toBe("INFERRED");
    expect(
      projectEfomClaimStateV1({
        kind: "FINDING",
        sourceEvidenceRefs: ["RIVER-EVIDENCE:001"],
        findingStatus: "CONFLICTED",
      }),
    ).toBe("DISPUTED");
    expect(
      projectEfomClaimStateV1({
        kind: "DISCREPANCY",
        sourceEvidenceRefs: ["RIVER-EVIDENCE:001"],
      }),
    ).toBe("DISPUTED");
  });

  it("preserves supersession and gates authoritative verification explicitly", () => {
    expect(
      projectEfomClaimStateV1({
        kind: "FINDING",
        sourceEvidenceRefs: ["RIVER-EVIDENCE:001"],
        findingStatus: "SUPERSEDED",
        superseded: true,
      }),
    ).toBe("SUPERSEDED");

    expect(
      projectEfomClaimStateV1({
        kind: "FINDING",
        sourceEvidenceRefs: ["RIVER-EVIDENCE:001"],
        findingStatus: "CORROBORATED",
      }),
    ).not.toBe("AUTHORITATIVELY_VERIFIED");

    expect(
      projectEfomClaimStateV1({
        kind: "FINDING",
        sourceEvidenceRefs: ["RIVER-EVIDENCE:001"],
        findingStatus: "CORROBORATED",
        authoritative: true,
      }),
    ).toBe("AUTHORITATIVELY_VERIFIED");
  });
});
