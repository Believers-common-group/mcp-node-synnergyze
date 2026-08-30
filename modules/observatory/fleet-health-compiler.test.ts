import { describe, expect, it } from "vitest";

import type { EcosystemHealthSubjectV1, SubjectHealthProfileV1 } from "./contracts.ts";
import { compileSubjectHealthProfileV1 } from "./health-compiler.ts";
import { compileFleetHealthV1 } from "./fleet-health-compiler.ts";

const EVALUATED_AT = "2026-08-28T00:00:00.000Z";

function subject(subjectRef: string): EcosystemHealthSubjectV1 {
  return {
    subjectRef,
    subjectType: "HOST",
    genesisIdentityRef: subjectRef,
    affiliationRefs: ["AFFILIATION:SYNNERGYZE"],
    dependencyRefs: [],
  };
}

function availabilityProfile(
  subjectRef: string,
  observedAt: string,
  evidenceRef: string,
  condition: "POSITIVE" | "NEGATIVE" | "UNKNOWN" = "POSITIVE",
  severity: "NONE" | "WATCH" | "DEGRADED" | "CRITICAL" = "NONE",
) {
  return compileSubjectHealthProfileV1(
    subject(subjectRef),
    [{
      dimension: "AVAILABILITY",
      expectedIntervalSeconds: 60,
      evidence: {
        observationRef: `OBSERVATION:${subjectRef}`,
        observedAt,
        evidenceRefs: [evidenceRef],
        condition,
        severity,
        confidence: 1,
      },
    }],
    EVALUATED_AT,
  );
}

describe("SYNNERGYZE-OBSERVATORY-ECOSYSTEM-HEALTH-001 R0.2 fleet aggregation", () => {
  it("preserves child evidence and refuses an all-green fleet when one child is stale", () => {
    const healthy = availabilityProfile(
      "GENESIS-NODE:ALPHA-NODE-001",
      "2026-08-27T23:59:50.000Z",
      "RIVER-EVIDENCE:ALPHA:AVAILABILITY",
    );
    const stale = availabilityProfile(
      "GENESIS-NODE:BETA-NODE-001",
      "2026-08-27T23:55:00.000Z",
      "RIVER-EVIDENCE:BETA:AVAILABILITY",
    );

    const fleet = compileFleetHealthV1({
      aggregateRef: "OBSERVATORY-FLEET:SYNNERGYZE",
      aggregateType: "NETWORK",
      childProfiles: [healthy, stale],
      evaluatedAt: EVALUATED_AT,
    });

    expect(fleet.state).toBe("STALE");
    expect(fleet.state).not.toBe("HEALTHY");
    expect(fleet.children).toEqual([healthy, stale]);
    expect(fleet.childStateCounts).toEqual({ HEALTHY: 1, STALE: 1 });
    expect(fleet.evidenceRefs).toEqual([
      "RIVER-EVIDENCE:ALPHA:AVAILABILITY",
      "RIVER-EVIDENCE:BETA:AVAILABILITY",
    ]);
    expect(fleet.derived).toBe(true);
  });

  it("does not keep a cached healthy child current after its evidence freshness window expires", () => {
    const cachedHealthy = availabilityProfile(
      "GENESIS-NODE:ALPHA-NODE-001",
      "2026-08-27T23:59:50.000Z",
      "RIVER-EVIDENCE:ALPHA:AVAILABILITY",
    );

    expect(cachedHealthy.state).toBe("HEALTHY");

    const fleet = compileFleetHealthV1({
      aggregateRef: "OBSERVATORY-FLEET:SYNNERGYZE",
      aggregateType: "NETWORK",
      childProfiles: [cachedHealthy],
      evaluatedAt: "2026-08-28T00:03:00.000Z",
    });

    expect(fleet.state).toBe("STALE");
  });

  it("moves cached positive evidence to WATCH while it is aging", () => {
    const cachedHealthy = availabilityProfile(
      "GENESIS-NODE:ALPHA-NODE-001",
      "2026-08-27T23:59:50.000Z",
      "RIVER-EVIDENCE:ALPHA:AVAILABILITY",
    );

    const fleet = compileFleetHealthV1({
      aggregateRef: "OBSERVATORY-FLEET:SYNNERGYZE",
      aggregateType: "NETWORK",
      childProfiles: [cachedHealthy],
      evaluatedAt: "2026-08-28T00:01:20.000Z",
    });

    expect(fleet.state).toBe("WATCH");
    expect(fleet.childStateCounts).toEqual({ WATCH: 1 });
  });

  it("fails closed to UNKNOWN when cached child timing is invalid", () => {
    const cachedHealthy = availabilityProfile(
      "GENESIS-NODE:ALPHA-NODE-001",
      "2026-08-27T23:59:50.000Z",
      "RIVER-EVIDENCE:ALPHA:AVAILABILITY",
    );
    const invalidTiming: SubjectHealthProfileV1 = {
      ...cachedHealthy,
      dimensions: cachedHealthy.dimensions.map((dimension) => ({
        ...dimension,
        freshness: {
          ...dimension.freshness,
          observedAt: "not-an-instant",
        },
      })),
    };

    const fleet = compileFleetHealthV1({
      aggregateRef: "OBSERVATORY-FLEET:SYNNERGYZE",
      aggregateType: "NETWORK",
      childProfiles: [invalidTiming],
      evaluatedAt: "2026-08-28T00:01:20.000Z",
    });

    expect(fleet.state).toBe("UNKNOWN");
    expect(fleet.childStateCounts).toEqual({ UNKNOWN: 1 });
  });

  it("surfaces a stale child when mixed with a currently fresh child", () => {
    const fresh = availabilityProfile(
      "GENESIS-NODE:ALPHA-NODE-001",
      "2026-08-27T23:59:50.000Z",
      "RIVER-EVIDENCE:ALPHA:AVAILABILITY",
    );
    const cached = availabilityProfile(
      "GENESIS-NODE:BETA-NODE-001",
      "2026-08-27T23:59:40.000Z",
      "RIVER-EVIDENCE:BETA:AVAILABILITY",
    );

    const fleet = compileFleetHealthV1({
      aggregateRef: "OBSERVATORY-FLEET:SYNNERGYZE",
      aggregateType: "NETWORK",
      childProfiles: [fresh, cached],
      evaluatedAt: "2026-08-28T00:02:10.000Z",
    });

    expect(fleet.state).toBe("STALE");
    expect(fleet.childStateCounts).toEqual({ STALE: 2 });
  });

  it("preserves a CRITICAL child while its evidence is only aging", () => {
    const critical = availabilityProfile(
      "GENESIS-NODE:ALPHA-NODE-001",
      "2026-08-27T23:59:50.000Z",
      "RIVER-EVIDENCE:ALPHA:AVAILABILITY",
      "NEGATIVE",
      "CRITICAL",
    );

    expect(critical.state).toBe("CRITICAL");

    const fleet = compileFleetHealthV1({
      aggregateRef: "OBSERVATORY-FLEET:SYNNERGYZE",
      aggregateType: "NETWORK",
      childProfiles: [critical],
      evaluatedAt: "2026-08-28T00:01:20.000Z",
    });

    expect(fleet.state).toBe("CRITICAL");
    expect(fleet.childStateCounts).toEqual({ CRITICAL: 1 });
  });
});
