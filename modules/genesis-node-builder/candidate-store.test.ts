import { describe, expect, it } from "vitest";

import { GenesisCandidateStoreV1 } from "./candidate-store.ts";

describe("GenesisCandidateStoreV1", () => {
  it("creates the same candidate ref for an idempotent replay", () => {
    const store = new GenesisCandidateStoreV1();
    const input = {
      displayName: "Phoenix Mall of Asia",
      jurisdictionRef: "JURISDICTION:KA-BLR",
      assetClass: "MALL" as const,
      createdAt: "2026-08-28T00:00:00Z",
      correlationId: "CORR:MOA-001",
      sourceEvidenceRefs: ["EVIDENCE:PUBLIC:001"],
    };

    const first = store.createCandidateV1(input);
    const replay = store.createCandidateV1(input);

    expect(first.state).toBe("CREATED");
    expect(replay.state).toBe("REPLAY");
    expect(replay.candidate.candidateRef).toBe(first.candidate.candidateRef);
  });

  it("rejects a changed payload under the same correlation id", () => {
    const store = new GenesisCandidateStoreV1();
    store.createCandidateV1({
      displayName: "Phoenix Mall of Asia",
      jurisdictionRef: "JURISDICTION:KA-BLR",
      assetClass: "MALL",
      createdAt: "2026-08-28T00:00:00Z",
      correlationId: "CORR:MOA-002",
      sourceEvidenceRefs: [],
    });

    expect(() =>
      store.createCandidateV1({
        displayName: "Different Asset",
        jurisdictionRef: "JURISDICTION:KA-BLR",
        assetClass: "MALL",
        createdAt: "2026-08-28T00:00:00Z",
        correlationId: "CORR:MOA-002",
        sourceEvidenceRefs: [],
      }),
    ).toThrow("CANDIDATE_IDEMPOTENCY_CONFLICT");
  });

  it("replays identical identity input and preserves distinct unresolved clues", () => {
    const store = new GenesisCandidateStoreV1();
    const created = store.createCandidateV1({
      displayName: "Phoenix Mall of Asia",
      jurisdictionRef: "JURISDICTION:KA-BLR",
      assetClass: "MALL",
      createdAt: "2026-08-28T00:00:00Z",
      correlationId: "CORR:MOA-003",
      sourceEvidenceRefs: [],
    });

    const first = store.addCandidateIdentityV1({
      candidateRef: created.candidate.candidateRef,
      kind: "SURVEY_NUMBER",
      normalizedValue: "239",
      sourceEvidenceRefs: ["EVIDENCE:SURVEY:PUBLIC:239"],
      observedAt: "2026-08-28T00:01:00Z",
    });
    const replay = store.addCandidateIdentityV1({
      candidateRef: created.candidate.candidateRef,
      kind: "SURVEY_NUMBER",
      normalizedValue: "239",
      sourceEvidenceRefs: ["EVIDENCE:SURVEY:PUBLIC:239"],
      observedAt: "2026-08-28T00:01:00Z",
    });
    store.addCandidateIdentityV1({
      candidateRef: created.candidate.candidateRef,
      kind: "SURVEY_NUMBER",
      normalizedValue: "240",
      sourceEvidenceRefs: ["EVIDENCE:SURVEY:PUBLIC:240"],
      observedAt: "2026-08-28T00:02:00Z",
    });

    expect(first.state).toBe("ADDED");
    expect(replay.state).toBe("REPLAY");
    expect(replay.identity.identityRef).toBe(first.identity.identityRef);
    expect(store.listCandidateIdentitiesV1(created.candidate.candidateRef)).toHaveLength(2);
  });

  it("rejects identity input for an unknown candidate", () => {
    const store = new GenesisCandidateStoreV1();
    expect(() =>
      store.addCandidateIdentityV1({
        candidateRef: "GENESIS-CANDIDATE:UNKNOWN",
        kind: "PID",
        normalizedValue: "PID-001",
        sourceEvidenceRefs: [],
        observedAt: "2026-08-28T00:00:00Z",
      }),
    ).toThrow("CANDIDATE_NOT_FOUND");
  });
});
