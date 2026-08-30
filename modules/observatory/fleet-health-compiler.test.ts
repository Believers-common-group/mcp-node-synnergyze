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

function availabilityProfile(
  subjectRef: string,
  observedAt: string,
  evidenceRef: string,
  confidence: number,
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
        condition: "POSITIVE",
        severity: "NONE",
        confidence,
      },
    }],
    EVALUATED_AT,
  );
}

describe("SYNNERGYZE-OBSERVATORY-ECOSYSTEM-HEALTH-001 R0.2 fleet aggregation", () => {
  it("preserves child evidence, refuses stale all-green, and bounds aggregate confidence", () => {
    const healthy = availabilityProfile(
      "GENESIS-NODE:ALPHA-NODE-001",
      "2026-08-27T23:59:50.000Z",
      "RIVER-EVIDENCE:ALPHA:AVAILABILITY",
      0.9,
    );
    const stale = availabilityProfile(
      "GENESIS-NODE:BETA-NODE-001",
      "2026-08-27T23:55:00.000Z",
      "RIVER-EVIDENCE:BETA:AVAILABILITY",
      0.4,
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
    expect(fleet.confidence).toBe(0.4);
    expect(fleet.evidenceRefs).toEqual([
      "RIVER-EVIDENCE:ALPHA:AVAILABILITY",
      "RIVER-EVIDENCE:BETA:AVAILABILITY",
    ]);
    expect(fleet.derived).toBe(true);
  });
});
