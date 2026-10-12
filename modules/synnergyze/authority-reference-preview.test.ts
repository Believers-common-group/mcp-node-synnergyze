import { describe, expect, it } from "vitest";
import { compileAuthorityReferencePreviewV1 } from "./authority-reference-preview.ts";
import { buildWardenDecisionRequestV1 } from "./warden-request-bridge.ts";

const example = () => ({
  operation: "retrieve_public" as const,
  mode: "OFFLINE_REVIEW" as const,
  actorRef: "DIGITALME-TEST-01",
  contextRef: "ESTATE-STAGING",
  correlationId: "CORRELATION-TEST-01",
  sourceExpressionRef: "EXPRESSION-TEST-01",
  sourceAuthorityRef: "PRGI-DECLARED",
  recordRef: "RECORD-TEST-001",
  observedAt: "2026-10-12T07:00:00.000Z",
  claimedEventDate: "2016-10-11",
});

describe("R0.9 native authority-reference preview — offline and unauthorised", () => {
  it("compiles native Synnergyze program and event drafts", () => {
    const output = compileAuthorityReferencePreviewV1(example());
    expect(output.state).toBe("HOLD");
    expect(output.executionAllowed).toBe(false);
    expect(output.externalEffects).toBe(false);
    expect(output.bundle.program.authorized).toBe(false);
    expect(output.bundle.program.state).not.toBe("READY_FOR_AUTHORIZATION");
    expect(output.bundle.events).toHaveLength(1);
    expect(output.bundle.events[0].authorized).toBe(false);
    expect(output.bundle.events[0].state).toBe("DRAFT");
    expect(output.bundle.events[0].capabilityRef).toBe("authority_reference.retrieve_public");
  });

  it("native Warden request bridge rejects unresolved preview", () => {
    const output = compileAuthorityReferencePreviewV1(example());
    const event = output.bundle.events[0];
    const result = buildWardenDecisionRequestV1({
      program: output.bundle.program,
      event,
      representation: {
        resolutionRef: "TEST-RESOLUTION",
        actorRef: event.actorRef,
        representedPrincipalRef: "PRINCIPAL-TEST",
        actingCapacityRef: "CAPACITY-TEST",
        contextRef: event.contextRef,
        authorityRefs: [], policyRefs: [], sourceRefs: [],
        resolvedAt: "2026-10-12T07:00:00.000Z",
      },
      requestedAt: "2026-10-12T07:00:00.000Z",
    });
    expect(result).toMatchObject({ ok: false, code: "PROGRAM_NOT_READY" });
  });

  it("does not promote claimed dates into source or timestamp evidence", () => {
    const result = compileAuthorityReferencePreviewV1(example());
    expect(result.evidenceChronology).toEqual({
      claimedEventDate: "2016-10-11",
      sourceRecordedAt: null,
      independentlyTimestampedAt: null,
      verifiedAt: null,
    });
    expect(result.declaredSource.independentlyVerified).toBe(false);
  });

  it("changes plan identity when historical assertion changes", () => {
    const a = compileAuthorityReferencePreviewV1(example());
    const b = compileAuthorityReferencePreviewV1({ ...example(), claimedEventDate: "2016-10-12" });
    expect(a.candidateDigest).not.toBe(b.candidateDigest);
    expect(a.bundle.program.compilationDigest).not.toBe(b.bundle.program.compilationDigest);
  });

  it("compilation is deterministic and never mutates input", () => {
    const request = example();
    const original = structuredClone(request);
    expect(compileAuthorityReferencePreviewV1(request)).toEqual(compileAuthorityReferencePreviewV1(request));
    expect(request).toEqual(original);
  });

  it("ignores a caller's claimed authorization", () => {
    const result = compileAuthorityReferencePreviewV1({ ...example(), authorized: true } as never);
    expect(result.authorized).toBe(false);
    expect(result.executionAllowed).toBe(false);
  });

  it("supports all four draft-only operations", () => {
    for (const operation of ["discover", "retrieve_public", "verify", "reference"] as const) {
      const output = compileAuthorityReferencePreviewV1({ ...example(), operation });
      expect(output.bundle.program.capabilityRef).toBe(`authority_reference.${operation}`);
      expect(output.bundle.program.authorized).toBe(false);
      expect(output.executionAllowed).toBe(false);
    }
  });

  const invalid: Array<[string, Record<string, unknown>]> = [
    ["production environment", { mode: "PRODUCTION" }],
    ["unknown operation", { operation: "publish" }],
    ["empty actor", { actorRef: "" }],
    ["invalid record URL", { recordRef: "https://example.com/" }],
    ["invalid calendar date", { claimedEventDate: "2016-02-31" }],
    ["future claimed event date", { claimedEventDate: "2027-01-01" }],
    ["invalid observation instant", { observedAt: "not-a-date" }],
    ["empty source authority", { sourceAuthorityRef: "" }],
    ["invalid correlation", { correlationId: "contains spaces" }],
  ];
  for (const [label, changes] of invalid) {
    it(`rejects ${label}`, () => {
      expect(() => compileAuthorityReferencePreviewV1({ ...example(), ...changes } as never)).toThrow();
    });
  }
});
