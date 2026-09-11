import { describe, expect, it } from "vitest";

import { buildGovernedEvidenceArtifactV1 } from "./governed-evidence.ts";

describe("RIVER-GOVERNED-EVIDENCE-R0-1", () => {
  it("preserves observation time without inventing derivation time", () => {
    const artifact = buildGovernedEvidenceArtifactV1({
      artifactType: "OBSERVATION",
      sourceRefs: ["EFOM-SOURCE:001"],
      evidenceRefs: ["RIVER-EVIDENCE:001"],
      contentDigest: "sha256:obs001",
      observedAt: "2026-09-10T06:00:00.000Z",
      correlationId: "CORR:OBS:001",
    });

    expect(artifact.observedAt).toBe("2026-09-10T06:00:00.000Z");
    expect(artifact.derivedAt).toBeUndefined();
  });

  it("preserves finding derivation time separately from observation time", () => {
    const artifact = buildGovernedEvidenceArtifactV1({
      artifactType: "FINDING",
      sourceRefs: ["EFOM-OBS:001"],
      evidenceRefs: ["RIVER-EVIDENCE:001"],
      contentDigest: "sha256:finding001",
      observedAt: "2026-09-10T06:00:00.000Z",
      derivedAt: "2026-09-10T06:05:00.000Z",
      correlationId: "CORR:FINDING:001",
    });

    expect(artifact.observedAt).toBe("2026-09-10T06:00:00.000Z");
    expect(artifact.derivedAt).toBe("2026-09-10T06:05:00.000Z");
  });

  it("preserves attestation issuance, validity and supersession", () => {
    const artifact = buildGovernedEvidenceArtifactV1({
      artifactType: "ATTESTATION",
      sourceRefs: ["WARDEN:ATTESTOR:001"],
      evidenceRefs: ["RIVER-EVIDENCE:001"],
      contentDigest: "sha256:attestation001",
      issuedAt: "2026-09-10T06:10:00.000Z",
      validUntil: "2026-09-11T06:10:00.000Z",
      supersedesArtifactRef: "RIVER-GOVERNED-EVIDENCE:OLD",
      correlationId: "CORR:ATTEST:001",
    });

    expect(artifact.issuedAt).toBe("2026-09-10T06:10:00.000Z");
    expect(artifact.validUntil).toBe("2026-09-11T06:10:00.000Z");
    expect(artifact.supersedesArtifactRef).toBe("RIVER-GOVERNED-EVIDENCE:OLD");
  });

  it("is deterministic across equivalent reference order and changes on content change", () => {
    const first = buildGovernedEvidenceArtifactV1({
      artifactType: "DECISION",
      sourceRefs: ["WARDEN:002", "WARDEN:001", "WARDEN:001"],
      evidenceRefs: ["RIVER:002", "RIVER:001", "RIVER:001"],
      contentDigest: "sha256:decision001",
      issuedAt: "2026-09-10T06:20:00.000Z",
      correlationId: "CORR:DECISION:001",
    });
    const equivalent = buildGovernedEvidenceArtifactV1({
      artifactType: "DECISION",
      sourceRefs: ["WARDEN:001", "WARDEN:002"],
      evidenceRefs: ["RIVER:001", "RIVER:002"],
      contentDigest: "sha256:decision001",
      issuedAt: "2026-09-10T06:20:00.000Z",
      correlationId: "CORR:DECISION:001",
    });
    const changed = buildGovernedEvidenceArtifactV1({
      artifactType: "DECISION",
      sourceRefs: ["WARDEN:001", "WARDEN:002"],
      evidenceRefs: ["RIVER:001", "RIVER:002"],
      contentDigest: "sha256:decision002",
      issuedAt: "2026-09-10T06:20:00.000Z",
      correlationId: "CORR:DECISION:001",
    });

    expect(equivalent.artifactRef).toBe(first.artifactRef);
    expect(changed.artifactRef).not.toBe(first.artifactRef);
    expect(first.sourceRefs).toEqual(["WARDEN:001", "WARDEN:002"]);
    expect(first.evidenceRefs).toEqual(["RIVER:001", "RIVER:002"]);
  });

  it("fails closed on missing refs or invalid temporal context", () => {
    expect(() =>
      buildGovernedEvidenceArtifactV1({
        artifactType: "OBSERVATION",
        sourceRefs: [],
        evidenceRefs: ["RIVER:001"],
        contentDigest: "sha256:bad",
        observedAt: "2026-09-10T06:00:00.000Z",
        correlationId: "CORR:BAD:001",
      }),
    ).toThrow("governed evidence source refs are required");

    expect(() =>
      buildGovernedEvidenceArtifactV1({
        artifactType: "ATTESTATION",
        sourceRefs: ["WARDEN:001"],
        evidenceRefs: ["RIVER:001"],
        contentDigest: "sha256:bad-time",
        issuedAt: "not-a-time",
        correlationId: "CORR:BAD:002",
      }),
    ).toThrow("governed evidence timestamp is invalid");
  });
});
