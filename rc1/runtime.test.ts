import { afterEach, describe, expect, it, vi } from "vitest";

import { AlphaRc1Harness, RC1_EVENT_SEQUENCE, RC1_IDENTITIES } from "./runtime.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ALPHA-RC1-PROGRAM-001", () => {
  it("executes the complete synthetic allowed/denied/revoked sequence with no real-world effect", () => {
    const harness = new AlphaRc1Harness();
    const result = harness.runFullProgram();

    expect(result.programRef).toBe(RC1_IDENTITIES.programRef);
    expect(result.programState).toBe("CLOSED");
    expect(result.events.map((event) => event.code)).toEqual(RC1_EVENT_SEQUENCE);
    expect(result.gatewayRequestCount).toBe(1);
    expect(result.realWorldEffectOccurred).toBe(false);

    expect(result.frontGate.programRef).toBe(result.backGate.programRef);
    expect(result.frontGate.actorRef).toBe(result.backGate.actorRef);
    expect(result.frontGate.representedEntityRef).toBe(result.backGate.representedEntityRef);
    expect(result.frontGate.allowedRequestRef).toBe(result.backGate.allowedRequestRef);
    expect(result.frontGate.finalEffectRef).toBe(result.backGate.finalEffectRef);
    expect(result.frontGate.programState).toBe(result.backGate.programState);
  });

  it("creates exactly one synthetic service request for repeated correlation ids", () => {
    const harness = new AlphaRc1Harness();

    const first = harness.attempt("service_request.create", "RC1-IDEMPOTENT-001");
    const second = harness.attempt("service_request.create", "RC1-IDEMPOTENT-001");

    expect(first.status).toBe("VERIFIED");
    expect(second.status).toBe("VERIFIED");
    expect(first.receipt?.serviceRequestRef).toBe(second.receipt?.serviceRequestRef);
    expect(second.receipt?.idempotentReplay).toBe(true);
    expect(harness.gatewayRequestCount()).toBe(1);
  });

  it("fails closed when the Warden decision is missing", () => {
    const harness = new AlphaRc1Harness();

    const result = harness.attempt("service_request.create", "RC1-NO-WARDEN-001", {
      omitDecision: true,
    });

    expect(result.status).toBe("MISSING_AUTHORIZATION");
    expect(result.syntheticEffectRecorded).toBe(false);
    expect(harness.gatewayRequestCount()).toBe(0);
  });

  it("fails closed when River evidence reservation is missing", () => {
    const harness = new AlphaRc1Harness();

    const result = harness.attempt("service_request.create", "RC1-NO-EVIDENCE-001", {
      omitEvidenceReservation: true,
    });

    expect(result.status).toBe("BLOCKED_REQUIREMENT");
    expect(result.syntheticEffectRecorded).toBe(false);
    expect(harness.gatewayRequestCount()).toBe(0);
  });

  it("fails closed when River evidence reservation is unavailable", () => {
    const harness = new AlphaRc1Harness();
    harness.failNextEvidenceReservation();

    const result = harness.attempt("service_request.create", "RC1-EVIDENCE-FAIL-001");

    expect(result.status).toBe("BLOCKED_REQUIREMENT");
    expect(result.syntheticEffectRecorded).toBe(false);
    expect(harness.gatewayRequestCount()).toBe(0);
    expect(harness.riverEntries().some((entry) => entry.stage === "EXCEPTION")).toBe(true);
  });

  it("denies contract.execute and proves zero connector effect", () => {
    const harness = new AlphaRc1Harness();

    const result = harness.attempt("contract.execute", "RC1-CONTRACT-DENY-001");

    expect(result.status).toBe("DENIED");
    expect(result.decision?.status).toBe("DENY");
    expect(result.decision?.actionToken).toBeUndefined();
    expect(result.syntheticEffectRecorded).toBe(false);
    expect(harness.gatewayRequestCount()).toBe(0);
    expect(harness.riverEntries().some((entry) => entry.stage === "DENIED")).toBe(true);
  });

  it("denies controlled action after revocation", () => {
    const harness = new AlphaRc1Harness();
    harness.revoke();

    const result = harness.attempt("service_request.create", "RC1-POST-REVOKE-001");

    expect(result.status).toBe("DENIED");
    expect(result.reason).toBe("authority_revoked");
    expect(result.syntheticEffectRecorded).toBe(false);
    expect(harness.gatewayRequestCount()).toBe(0);
  });

  it("treats read-after-write mismatch as EXCEPTION rather than VERIFIED", () => {
    const harness = new AlphaRc1Harness();

    const result = harness.attempt("service_request.create", "RC1-MISMATCH-001", {
      injectReadMismatch: true,
    });

    expect(result.status).toBe("EXCEPTION");
    expect(result.syntheticEffectRecorded).toBe(false);
    expect(result.effectRef).toBeUndefined();
    expect(harness.gatewayRequestCount()).toBe(1);
    expect(harness.riverEntries().some((entry) => entry.reason === "read_after_write_mismatch")).toBe(
      true,
    );
  });

  it("does not require Supabase or any external network call", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("external_network_forbidden_in_rc1");
    });
    const harness = new AlphaRc1Harness();

    const result = harness.runFullProgram();

    expect(result.programState).toBe("CLOSED");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
