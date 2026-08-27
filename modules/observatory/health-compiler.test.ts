import { describe, expect, it } from "vitest";

import {
  compileDimensionHealthV1,
  evaluateEvidenceFreshnessV1,
} from "./health-compiler.ts";

const EVALUATED_AT = "2026-08-28T00:00:00.000Z";

describe("SYNNERGYZE-OBSERVATORY-ECOSYSTEM-HEALTH-001 R0.1", () => {
  it("never compiles missing evidence to HEALTHY", () => {
    const result = compileDimensionHealthV1({
      subjectRef: "GENESIS-NODE:ALPHA-NODE-001",
      dimension: "AVAILABILITY",
      evaluatedAt: EVALUATED_AT,
      expectedIntervalSeconds: 60,
      evidence: undefined,
    });

    expect(result.state).toBe("UNKNOWN");
    expect(result.freshness.state).toBe("MISSING");
    expect(result.evidenceRefs).toEqual([]);
  });

  it("never compiles stale positive evidence to HEALTHY", () => {
    const result = compileDimensionHealthV1({
      subjectRef: "GENESIS-NODE:ALPHA-NODE-001",
      dimension: "AVAILABILITY",
      evaluatedAt: EVALUATED_AT,
      expectedIntervalSeconds: 60,
      evidence: {
        observationRef: "OBSERVATION:ALPHA:001",
        observedAt: "2026-08-27T23:55:00.000Z",
        evidenceRefs: ["RIVER-EVIDENCE:ALPHA:001"],
        condition: "POSITIVE",
        severity: "NONE",
        confidence: 1,
      },
    });

    expect(result.state).toBe("STALE");
    expect(result.freshness.state).toBe("STALE");
    expect(result.state).not.toBe("HEALTHY");
  });

  it("classifies evidence freshness deterministically", () => {
    expect(
      evaluateEvidenceFreshnessV1("2026-08-27T23:59:30.000Z", EVALUATED_AT, 60).state,
    ).toBe("FRESH");
    expect(
      evaluateEvidenceFreshnessV1("2026-08-27T23:58:45.000Z", EVALUATED_AT, 60).state,
    ).toBe("AGING");
    expect(
      evaluateEvidenceFreshnessV1("2026-08-27T23:55:00.000Z", EVALUATED_AT, 60).state,
    ).toBe("STALE");
  });
});
