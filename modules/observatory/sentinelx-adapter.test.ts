import { describe, expect, it } from "vitest";

import { projectSentinelXHostObservationV1 } from "./sentinelx-adapter.ts";

const OBSERVED_AT = "2026-08-28T00:00:00.000Z";

describe("Observatory SentinelX adapter boundary", () => {
  it("retains SentinelX host identity as adapter lineage while Genesis remains canonical", () => {
    const observation = projectSentinelXHostObservationV1({
      genesisSubjectRef: "GENESIS-NODE:ALPHA-NODE-001",
      sentinelxHostRef: "host_8d65c9f45d501775",
      hostname: "DESKTOP-M13TEPQ",
      label: "alpha-node-001-wsl",
      agentVersion: "0.11.11",
      observedAt: OBSERVED_AT,
      sourceEvidenceRef: "RIVER-EVIDENCE:SENTINELX:ALPHA:001",
      reachable: true,
    });

    expect(observation.subjectRef).toBe("GENESIS-NODE:ALPHA-NODE-001");
    expect(observation.adapterRef).toBe("SENTINELX");
    expect(observation.adapterHostRef).toBe("host_8d65c9f45d501775");
    expect(observation.adapterHostRef).not.toBe(observation.subjectRef);
    expect(observation.healthEvidence.condition).toBe("POSITIVE");
    expect(observation.healthEvidence.severity).toBe("NONE");
    expect(observation.healthEvidence.evidenceRefs).toEqual([
      "RIVER-EVIDENCE:SENTINELX:ALPHA:001",
    ]);
  });

  it("projects an unreachable SentinelX host as a critical availability observation, not an authority decision", () => {
    const observation = projectSentinelXHostObservationV1({
      genesisSubjectRef: "GENESIS-NODE:ALPHA-NODE-001",
      sentinelxHostRef: "host_8d65c9f45d501775",
      hostname: "DESKTOP-M13TEPQ",
      label: "alpha-node-001-wsl",
      agentVersion: "0.11.11",
      observedAt: OBSERVED_AT,
      sourceEvidenceRef: "RIVER-EVIDENCE:SENTINELX:ALPHA:DISCONNECTED",
      reachable: false,
    });

    expect(observation.healthEvidence.condition).toBe("NEGATIVE");
    expect(observation.healthEvidence.severity).toBe("CRITICAL");
    expect("authorized" in observation).toBe(false);
    expect("affiliationRef" in observation).toBe(false);
  });
});
