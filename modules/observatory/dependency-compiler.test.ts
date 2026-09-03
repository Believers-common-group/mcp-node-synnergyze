import { describe, expect, it } from "vitest";

import type { EcosystemHealthSubjectV1 } from "./contracts.ts";
import { compileSubjectHealthProfileV1 } from "./health-compiler.ts";
import {
  projectDependencyImpactV1,
  type HealthDependencyV1,
} from "./dependency-compiler.ts";

const EVALUATED_AT = "2026-08-28T00:00:00.000Z";

const DATABASE: EcosystemHealthSubjectV1 = {
  subjectRef: "GENESIS-SERVICE:POSTGRES-001",
  subjectType: "DATABASE",
  genesisIdentityRef: "GENESIS-SERVICE:POSTGRES-001",
  affiliationRefs: ["AFFILIATION:SYNNERGYZE"],
  dependencyRefs: [],
};

const DEPENDENCY: HealthDependencyV1 = {
  dependencyRef: "HEALTH-DEPENDENCY:API-ON-POSTGRES",
  upstreamSubjectRef: DATABASE.subjectRef,
  downstreamSubjectRef: "GENESIS-SERVICE:API-001",
  dependencyType: "REQUIRES",
  criticality: "HIGH",
};

describe("Observatory dependency impact projection", () => {
  it("projects a critical database condition into derived API degradation without claiming verified root cause", () => {
    const databaseProfile = compileSubjectHealthProfileV1(
      DATABASE,
      [
        {
          dimension: "CAPACITY",
          expectedIntervalSeconds: 60,
          evidence: {
            observationRef: "OBSERVATION:POSTGRES:CAPACITY",
            observedAt: "2026-08-27T23:59:50.000Z",
            evidenceRefs: ["RIVER-EVIDENCE:POSTGRES:CAPACITY"],
            condition: "NEGATIVE",
            severity: "CRITICAL",
            confidence: 0.97,
          },
        },
      ],
      EVALUATED_AT,
    );

    const impact = projectDependencyImpactV1(databaseProfile, DEPENDENCY, EVALUATED_AT);

    expect(impact.upstreamState).toBe("CRITICAL");
    expect(impact.downstreamProjectedState).toBe("DEGRADED");
    expect(impact.classification).toBe("DERIVED");
    expect(impact.rootCauseStatus).toBe("SUSPECTED");
    expect(impact.sourceEvidenceRefs).toEqual(["RIVER-EVIDENCE:POSTGRES:CAPACITY"]);
    expect(impact.downstreamSubjectRef).toBe("GENESIS-SERVICE:API-001");
  });
});
