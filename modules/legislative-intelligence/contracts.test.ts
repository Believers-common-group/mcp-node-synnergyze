import { describe, expect, it } from "vitest";

import { sha256Ref, stableJson } from "./contracts.ts";
import type {
  LegislativeObjectRefV1,
  NormalizedLegislativeEventV1,
  SourceEnvelopeV1,
} from "./contracts.ts";

describe("legislative contracts", () => {
  it("canonicalizes object keys recursively", () => {
    expect(stableJson({ z: 1, a: { y: 2, x: 1 } })).toBe('{"a":{"x":1,"y":2},"z":1}');
  });

  it("returns deterministic prefixed identities", () => {
    expect(sha256Ref("LEG-EVENT", { b: 2, a: 1 })).toBe(
      sha256Ref("LEG-EVENT", { a: 1, b: 2 }),
    );
  });

  it("represents a Congress.gov bill without authority semantics", () => {
    const ref: LegislativeObjectRefV1 = {
      jurisdiction: "US-FEDERAL",
      objectType: "bill",
      congress: 119,
      billType: "hr",
      number: 6048,
    };
    const source: SourceEnvelopeV1 = {
      schemaVersion: "LEG-SOURCE:R0.1",
      sourceRef: "LEG-SOURCE:abc",
      sourceSystem: "congress.gov",
      sourceObjectId: "119-hr-6048",
      sourceObjectType: "bill",
      sourcePath: "/bill/119/hr/6048",
      retrievedAt: "2026-09-02T00:00:00.000Z",
      httpStatus: 200,
      rawSha256: "a".repeat(64),
      credentialAdmissionRef: "CONGRESS-GOV-API-KEY-001",
      body: { bill: { number: "6048" } },
    };
    const event: NormalizedLegislativeEventV1 = {
      schemaVersion: "LEG-EVENT:R0.1",
      eventRef: "LEG-EVENT:def",
      sourceRefs: [source.sourceRef],
      jurisdiction: "US-FEDERAL",
      objectType: "bill",
      objectId: "119-hr-6048",
      lifecycle: "ADVANCING",
      title: "NDO Fairness Act of 2025",
      subjects: [],
      committees: [],
      actors: [],
      actionRefs: [],
      evidenceRefs: [source.sourceRef],
      normalizedAt: "2026-09-02T00:00:01.000Z",
      normalizerVersion: "LEG-NORMALIZER:R0.1",
    };

    expect(ref.number).toBe(6048);
    expect(source).not.toHaveProperty("authority");
    expect(event.lifecycle).toBe("ADVANCING");
  });
});
