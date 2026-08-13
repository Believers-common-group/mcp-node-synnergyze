import { describe, expect, it } from "vitest";
import {
  fingerprintCommand,
  isMutationOperation,
  parseGateRequest,
  stableJson,
  validateWardenDecision,
} from "./index";

describe("BNR-DB-GATE-001 command contract", () => {
  it("canonicalizes object keys before fingerprinting", async () => {
    const left = parseGateRequest({
      operation: "runtime.canary.record",
      input: {
        canary_ref: "CANARY-001",
        payload: { beta: 2, alpha: 1, nested: { z: true, a: false } },
      },
    });
    const right = parseGateRequest({
      operation: "runtime.canary.record",
      input: {
        payload: { nested: { a: false, z: true }, alpha: 1, beta: 2 },
        canary_ref: "CANARY-001",
      },
    });

    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect(isMutationOperation(left!)).toBe(true);
    expect(isMutationOperation(right!)).toBe(true);

    const leftFingerprint = await fingerprintCommand(left! as Extract<typeof left, { operation: "runtime.canary.record" }>);
    const rightFingerprint = await fingerprintCommand(right! as Extract<typeof right, { operation: "runtime.canary.record" }>);

    expect(leftFingerprint).toBe(rightFingerprint);
    expect(stableJson({ b: 2, a: 1 })).toBe(stableJson({ a: 1, b: 2 }));
  });

  it("changes the fingerprint when the command payload changes", async () => {
    const first = parseGateRequest({
      operation: "runtime.canary.record",
      input: { canary_ref: "CANARY-001", payload: { value: 1 } },
    });
    const second = parseGateRequest({
      operation: "runtime.canary.record",
      input: { canary_ref: "CANARY-001", payload: { value: 2 } },
    });

    expect(first && isMutationOperation(first)).toBe(true);
    expect(second && isMutationOperation(second)).toBe(true);

    const firstFingerprint = await fingerprintCommand(first! as Extract<typeof first, { operation: "runtime.canary.record" }>);
    const secondFingerprint = await fingerprintCommand(second! as Extract<typeof second, { operation: "runtime.canary.record" }>);

    expect(firstFingerprint).not.toBe(secondFingerprint);
  });

  it("rejects arbitrary or malformed operations", () => {
    expect(parseGateRequest({ operation: "sql.execute", input: { sql: "drop table x" } })).toBeNull();
    expect(
      parseGateRequest({
        operation: "runtime.canary.record",
        input: { canary_ref: "CANARY-001", payload: "not-an-object" },
      }),
    ).toBeNull();
  });

  it("requires an exact unexpired Warden lease and command fingerprint", async () => {
    const gateRequest = parseGateRequest({
      operation: "runtime.canary.record",
      input: { canary_ref: "CANARY-001", payload: { probe: "alpha" } },
    });

    expect(gateRequest && isMutationOperation(gateRequest)).toBe(true);
    const mutation = gateRequest! as Extract<typeof gateRequest, { operation: "runtime.canary.record" }>;
    const fingerprint = await fingerprintCommand(mutation);
    const now = Date.parse("2026-08-13T06:00:00.000Z");

    const governance = {
      authorityRef: "AUTH-001",
      actorRef: "DM-001",
      contextRef: "CTX-001",
      executionLeaseId: "LEASE-001",
      idempotencyKey: "IDEMP-001",
    };

    const validDecision = {
      allowed: true,
      authority_ref: "AUTH-001",
      operation: "runtime.canary.record",
      execution_lease_id: "LEASE-001",
      command_fingerprint: fingerprint,
      expires_at: "2026-08-13T06:05:00.000Z",
    };

    expect(validateWardenDecision(validDecision, governance, mutation, fingerprint, now)).toBeNull();
    expect(
      validateWardenDecision(
        { ...validDecision, execution_lease_id: "LEASE-OTHER" },
        governance,
        mutation,
        fingerprint,
        now,
      ),
    ).toBe("execution_lease_mismatch");
    expect(
      validateWardenDecision(
        { ...validDecision, command_fingerprint: "different" },
        governance,
        mutation,
        fingerprint,
        now,
      ),
    ).toBe("command_fingerprint_mismatch");
    expect(
      validateWardenDecision(
        { ...validDecision, expires_at: "2026-08-13T05:59:59.000Z" },
        governance,
        mutation,
        fingerprint,
        now,
      ),
    ).toBe("authority_expired");
  });
});
