import { describe, expect, it } from "vitest";

import type { EcosystemHealthSubjectV1 } from "./contracts.ts";
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

function availabilityProfile(subjectRef: string, observedAt: string, evidenceRef: string) {
  return compileSubjectHealthProfileV1(
    subject(subjectRef),
    [{
      dimension: "AVAILABILITY",
      expectedIntervalSeconds: 60,
      evidence: {
        observationRef: `OBSERVATION:${subjectRef}`,
        observedAt,
        evidenceRefs: [evidenceRef],
        condition: "POSITIVE",
        severity: "NONE",
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
});
