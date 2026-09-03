import { describe, expect, it } from "vitest";

import type { EcosystemHealthSubjectV1 } from "./contracts.ts";
import {
  compileDimensionHealthV1,
  compileSubjectHealthProfileV1,
  evaluateEvidenceFreshnessV1,
} from "./health-compiler.ts";

const EVALUATED_AT = "2026-08-28T00:00:00.000Z";

const ALPHA_SUBJECT: EcosystemHealthSubjectV1 = {
  subjectRef: "GENESIS-NODE:ALPHA-NODE-001",
  subjectType: "HOST",
  genesisIdentityRef: "GENESIS-NODE:ALPHA-NODE-001",
  affiliationRefs: ["AFFILIATION:SYNNERGYZE"],
  dependencyRefs: [],
};

describe("SYNNERGYZE-OBSERVATORY-ECOSYSTEM-HEALTH-001 R0.1", () => {
  it("never compiles missing evidence to HEALTHY", () => {
    const result = compileDimensionHealthV1({
      subjectRef: ALPHA_SUBJECT.subjectRef,
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
      subjectRef: ALPHA_SUBJECT.subjectRef,
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

  it("compiles fresh positive evidence to HEALTHY", () => {
    const result = compileDimensionHealthV1({
      subjectRef: ALPHA_SUBJECT.subjectRef,
      dimension: "AVAILABILITY",
      evaluatedAt: EVALUATED_AT,
      expectedIntervalSeconds: 60,
      evidence: {
        observationRef: "OBSERVATION:ALPHA:FRESH",
        observedAt: "2026-08-27T23:59:30.000Z",
        evidenceRefs: ["RIVER-EVIDENCE:ALPHA:FRESH"],
        condition: "POSITIVE",
        severity: "NONE",
        confidence: 0.98,
      },
    });

    expect(result.state).toBe("HEALTHY");
    expect(result.freshness.state).toBe("FRESH");
  });

  it("compiles a fresh critical negative observation to CRITICAL", () => {
    const result = compileDimensionHealthV1({
      subjectRef: ALPHA_SUBJECT.subjectRef,
      dimension: "CAPACITY",
      evaluatedAt: EVALUATED_AT,
      expectedIntervalSeconds: 60,
      evidence: {
        observationRef: "OBSERVATION:ALPHA:CAPACITY",
        observedAt: "2026-08-27T23:59:50.000Z",
        evidenceRefs: ["RIVER-EVIDENCE:ALPHA:CAPACITY"],
        condition: "NEGATIVE",
        severity: "CRITICAL",
        confidence: 0.95,
      },
    });

    expect(result.state).toBe("CRITICAL");
  });

  it("preserves dimension results and prevents a stale dimension from producing an all-green subject", () => {
    const profile = compileSubjectHealthProfileV1(
      ALPHA_SUBJECT,
      [
        {
          dimension: "AVAILABILITY",
          expectedIntervalSeconds: 60,
          evidence: {
            observationRef: "OBSERVATION:ALPHA:AVAILABILITY",
            observedAt: "2026-08-27T23:59:50.000Z",
            evidenceRefs: ["RIVER-EVIDENCE:ALPHA:AVAILABILITY"],
            condition: "POSITIVE",
            severity: "NONE",
            confidence: 1,
          },
        },
        {
          dimension: "RECOVERY_READINESS",
          expectedIntervalSeconds: 60,
          evidence: {
            observationRef: "OBSERVATION:ALPHA:RECOVERY",
            observedAt: "2026-08-27T23:55:00.000Z",
            evidenceRefs: ["RIVER-EVIDENCE:ALPHA:RECOVERY"],
            condition: "POSITIVE",
            severity: "NONE",
            confidence: 0.9,
          },
        },
      ],
      EVALUATED_AT,
    );

    expect(profile.state).toBe("STALE");
    expect(profile.state).not.toBe("HEALTHY");
    expect(profile.dimensions).toHaveLength(2);
    expect(profile.dimensions.map((dimension) => dimension.state)).toEqual(["HEALTHY", "STALE"]);
    expect(profile.evidenceRefs).toEqual([
      "RIVER-EVIDENCE:ALPHA:AVAILABILITY",
      "RIVER-EVIDENCE:ALPHA:RECOVERY",
    ]);
  });
});
