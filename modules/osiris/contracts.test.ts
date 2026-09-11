import { describe, expect, it } from "vitest";

import type {
  EfomObservationV1,
  EfomFindingV1,
  EfomPhysicalWorldContextV1,
} from "./contracts.ts";

describe("OSIRIS-EFOM-CONTRACTS-R0-1", () => {
  it("keeps observation and finding as distinct typed objects", () => {
    const observation: EfomObservationV1 = {
      observationRef: "EFOM-OBS:001",
      sourceRef: "SENTINEL-2:TILE-001",
      sourceType: "SATELLITE_OPTICAL",
      subjectCandidateRef: "GEN-NODE-CANDIDATE:001",
      observedAt: "2026-09-10T06:00:00.000Z",
      validUntil: "2026-09-10T12:00:00.000Z",
      contentDigest: "sha256:obs001",
      sourceEvidenceRefs: ["RIVER-EVIDENCE:001"],
      confidence: 0.92,
      visibilityScope: "ESTATE",
      purposeRef: "PURPOSE:PHYSICAL-VERIFICATION",
    };

    const finding: EfomFindingV1 = {
      findingRef: "EFOM-FINDING:001",
      findingType: "PRESENCE_CORRELATION",
      observationRefs: [observation.observationRef],
      statementDigest: "sha256:finding001",
      confidence: 0.91,
      derivedAt: "2026-09-10T06:05:00.000Z",
      sourceEvidenceRefs: ["RIVER-EVIDENCE:001"],
      status: "CORROBORATED",
    };

    const context: EfomPhysicalWorldContextV1 = {
      operationClass: "INFER",
      observations: [observation],
      findings: [finding],
      discrepancies: [],
      attestations: [],
    };

    expect(context.observations[0].observationRef).toBe("EFOM-OBS:001");
    expect(context.findings[0].findingRef).toBe("EFOM-FINDING:001");
  });
});
