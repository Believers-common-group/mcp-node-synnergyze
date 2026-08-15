import { describe, expect, it } from "vitest";

import { normalizeQelExpressionV1 } from "../qel/normalizer.ts";
import { compileQelPlanToSynnergyzeDraftsV1 } from "./program-bridge.ts";
import type {
  DeviceSecurityStateV1,
  ResolvedDeviceSecurityContextV1,
} from "./contracts.ts";
import {
  buildWardenDecisionRequestV1,
  type ResolvedRepresentationContextV1,
} from "./warden-request-bridge.ts";

function readyPlanningBundle() {
  const normalized = normalizeQelExpressionV1({
    expressionRef: "QEL-EXPR-WARDEN-001",
    rawExpression:
      "IF ACTOR DIGITALME-ALPHA-TEST-001 IN PLACE ALPHA-NODE-001 ACTS CREATE ON THING LAB-SERVICE-DESK-001 THEN EFFECT SERVICE_REQUEST_CREATED USING CAPABILITY service_request.create",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    contextRef: "ALPHA-NODE-001",
    sourceRef: "TEST-SOURCE-001",
    submittedAt: "2026-08-14T06:00:00Z",
    correlationId: "CORR-WARDEN-001",
  });

  if (!normalized.ok) {
    throw new Error(`normalization_failed:${normalized.code}`);
  }

  const compiled = compileQelPlanToSynnergyzeDraftsV1({
    intent: normalized.intent,
    plan: normalized.plan,
    compiledAt: "2026-08-14T06:01:00Z",
  });

  if (!compiled.ok) {
    throw new Error(`program_compile_failed:${compiled.code}`);
  }

  if (compiled.bundle.program.state !== "READY_FOR_AUTHORIZATION") {
    throw new Error(`program_not_ready:${compiled.bundle.program.state}`);
  }

  return compiled.bundle;
}

function representation(
  overrides: Partial<ResolvedRepresentationContextV1> = {},
): ResolvedRepresentationContextV1 {
  return {
    resolutionRef: "REGISTRY-REPRESENTATION-RESOLUTION-001",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "LAB-COMPANY-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    authorityRefs: ["AUTH-LAB-OPERATOR-001"],
    policyRefs: ["POLICY-SERVICE-REQUEST-001"],
    sourceRefs: ["REGISTRY-R2-RELATION-001", "REGISTRY-R3-AUTHORITY-001"],
    resolvedAt: "2026-08-14T06:02:00Z",
    ...overrides,
  };
}

function deviceSecurity(
  overrides: Partial<ResolvedDeviceSecurityContextV1> = {},
): ResolvedDeviceSecurityContextV1 {
  return {
    resolutionRef: "REGISTRY-DEVICE-SECURITY:ALPHA-DEVICE-001:ACTIVE",
    deviceRef: "ALPHA-DEVICE-001",
    state: "ACTIVE",
    policyRef: "BAG-LOCK-POLICY:ALPHA-001",
    evidenceRef: "RIVER-EVIDENCE:BAG-LOCK-ACTIVE-001",
    assuranceLevel: "L1",
    resolvedAt: "2026-08-14T06:02:30Z",
    validUntil: "2026-08-14T06:10:00Z",
    ...overrides,
  };
}

function deviceBoundEvent() {
  const bundle = readyPlanningBundle();
  return {
    bundle,
    event: { ...bundle.events[0], executionDeviceRef: "ALPHA-DEVICE-001" },
  };
}

describe("VSR-NETWORK-WARDEN-REQUEST-BRIDGE-001", () => {
  it("builds one explicit non-decision Warden request from a ready Event", () => {
    const bundle = readyPlanningBundle();
    const result = buildWardenDecisionRequestV1({
      program: bundle.program,
      event: bundle.events[0],
      representation: representation(),
      requestedAt: "2026-08-14T06:03:00Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.request.actorRef).toBe("DIGITALME-ALPHA-TEST-001");
    expect(result.request.representedPrincipalRef).toBe("LAB-COMPANY-001");
    expect(result.request.actingCapacityRef).toBe("LAB-COMPANY-OPERATOR-001");
    expect(result.request.capabilityRef).toBe("service_request.create");
    expect(result.request.programRef).toBe(bundle.program.programRef);
    expect(result.request.eventRef).toBe(bundle.events[0].eventRef);
    expect(result.request.executionDeviceRef).toBeUndefined();
    expect("decision" in result.request).toBe(false);
    expect("actionToken" in result.request).toBe(false);
  });

  it("produces a deterministic request identity for the same governed input", () => {
    const bundle = readyPlanningBundle();
    const input = {
      program: bundle.program,
      event: bundle.events[0],
      representation: representation(),
      requestedAt: "2026-08-14T06:03:00Z",
    } as const;

    const first = buildWardenDecisionRequestV1(input);
    const second = buildWardenDecisionRequestV1(input);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.request.requestRef).toBe(second.request.requestRef);
  });

  it("fails closed when represented principal is missing", () => {
    const bundle = readyPlanningBundle();
    const result = buildWardenDecisionRequestV1({
      program: bundle.program,
      event: bundle.events[0],
      representation: representation({ representedPrincipalRef: "" }),
      requestedAt: "2026-08-14T06:03:00Z",
    });

    expect(result).toMatchObject({ ok: false, code: "REPRESENTATION_INCOMPLETE" });
  });

  it("fails closed when acting capacity is missing", () => {
    const bundle = readyPlanningBundle();
    const result = buildWardenDecisionRequestV1({
      program: bundle.program,
      event: bundle.events[0],
      representation: representation({ actingCapacityRef: "" }),
      requestedAt: "2026-08-14T06:03:00Z",
    });

    expect(result).toMatchObject({ ok: false, code: "REPRESENTATION_INCOMPLETE" });
  });

  it("fails closed on actor mismatch", () => {
    const bundle = readyPlanningBundle();
    const result = buildWardenDecisionRequestV1({
      program: bundle.program,
      event: bundle.events[0],
      representation: representation({ actorRef: "DIGITALME-OTHER-001" }),
      requestedAt: "2026-08-14T06:03:00Z",
    });

    expect(result).toMatchObject({ ok: false, code: "ACTOR_MISMATCH" });
  });

  it("fails closed on context mismatch", () => {
    const bundle = readyPlanningBundle();
    const result = buildWardenDecisionRequestV1({
      program: bundle.program,
      event: bundle.events[0],
      representation: representation({ contextRef: "OTHER-CONTEXT-001" }),
      requestedAt: "2026-08-14T06:03:00Z",
    });

    expect(result).toMatchObject({ ok: false, code: "CONTEXT_MISMATCH" });
  });

  it("does not create a request from a blocked Program", () => {
    const bundle = readyPlanningBundle();
    const result = buildWardenDecisionRequestV1({
      program: { ...bundle.program, state: "BLOCKED_REQUIREMENT" },
      event: bundle.events[0],
      representation: representation(),
      requestedAt: "2026-08-14T06:03:00Z",
    });

    expect(result).toMatchObject({ ok: false, code: "PROGRAM_NOT_READY" });
  });

  it("requires an exact capability before Warden evaluation", () => {
    const bundle = readyPlanningBundle();
    const result = buildWardenDecisionRequestV1({
      program: { ...bundle.program, capabilityRef: undefined },
      event: { ...bundle.events[0], capabilityRef: undefined },
      representation: representation(),
      requestedAt: "2026-08-14T06:03:00Z",
    });

    expect(result).toMatchObject({ ok: false, code: "CAPABILITY_REQUIRED" });
  });

  it("rejects an Event that is not a member of the prepared Program", () => {
    const bundle = readyPlanningBundle();
    const result = buildWardenDecisionRequestV1({
      program: { ...bundle.program, eventRefs: [] },
      event: bundle.events[0],
      representation: representation(),
      requestedAt: "2026-08-14T06:03:00Z",
    });

    expect(result).toMatchObject({ ok: false, code: "EVENT_NOT_IN_PROGRAM" });
  });

  it("requires a resolved security context for a device-bound Event", () => {
    const { bundle, event } = deviceBoundEvent();
    const result = buildWardenDecisionRequestV1({
      program: bundle.program,
      event,
      representation: representation(),
      requestedAt: "2026-08-14T06:03:00Z",
    });

    expect(result).toMatchObject({ ok: false, code: "DEVICE_SECURITY_REQUIRED" });
  });

  it("rejects a security context for another device", () => {
    const { bundle, event } = deviceBoundEvent();
    const result = buildWardenDecisionRequestV1({
      program: bundle.program,
      event,
      representation: representation(),
      deviceSecurity: deviceSecurity({ deviceRef: "ALPHA-DEVICE-OTHER" }),
      requestedAt: "2026-08-14T06:03:00Z",
    });

    expect(result).toMatchObject({ ok: false, code: "DEVICE_SECURITY_CONTEXT_MISMATCH" });
  });

  for (const state of [
    "BAG_LOCK_REQUESTED",
    "SEALED",
    "SEALED_ALERT",
    "UNSEAL_PENDING",
    "WARDEN_REAUTH",
    "CONTROLLED_RECONNECT",
    "RECOVERY_REQUIRED",
  ] as const satisfies readonly DeviceSecurityStateV1[]) {
    it(`blocks Warden request while device security state is ${state}`, () => {
      const { bundle, event } = deviceBoundEvent();
      const result = buildWardenDecisionRequestV1({
        program: bundle.program,
        event,
        representation: representation(),
        deviceSecurity: deviceSecurity({ state }),
        requestedAt: "2026-08-14T06:03:00Z",
      });

      expect(result).toMatchObject({ ok: false, code: "DEVICE_SECURITY_NOT_ACTIVE" });
    });
  }

  it("requires device security evidence before requesting Warden authorization", () => {
    const { bundle, event } = deviceBoundEvent();
    const result = buildWardenDecisionRequestV1({
      program: bundle.program,
      event,
      representation: representation(),
      deviceSecurity: deviceSecurity({ evidenceRef: "" }),
      requestedAt: "2026-08-14T06:03:00Z",
    });

    expect(result).toMatchObject({ ok: false, code: "DEVICE_SECURITY_EVIDENCE_MISSING" });
  });

  it("rejects future and expired device security resolutions", () => {
    const { bundle, event } = deviceBoundEvent();
    const future = buildWardenDecisionRequestV1({
      program: bundle.program,
      event,
      representation: representation(),
      deviceSecurity: deviceSecurity({ resolvedAt: "2026-08-14T06:03:01Z" }),
      requestedAt: "2026-08-14T06:03:00Z",
    });
    const expired = buildWardenDecisionRequestV1({
      program: bundle.program,
      event,
      representation: representation(),
      deviceSecurity: deviceSecurity({ validUntil: "2026-08-14T06:02:59Z" }),
      requestedAt: "2026-08-14T06:03:00Z",
    });

    expect(future).toMatchObject({ ok: false, code: "DEVICE_SECURITY_FROM_FUTURE" });
    expect(expired).toMatchObject({ ok: false, code: "DEVICE_SECURITY_EXPIRED" });
  });

  it("binds ACTIVE device security evidence into the Warden request identity", () => {
    const { bundle, event } = deviceBoundEvent();
    const first = buildWardenDecisionRequestV1({
      program: bundle.program,
      event,
      representation: representation(),
      deviceSecurity: deviceSecurity(),
      requestedAt: "2026-08-14T06:03:00Z",
    });
    const second = buildWardenDecisionRequestV1({
      program: bundle.program,
      event,
      representation: representation(),
      deviceSecurity: deviceSecurity({
        resolutionRef: "REGISTRY-DEVICE-SECURITY:ALPHA-DEVICE-001:ACTIVE:2",
        evidenceRef: "RIVER-EVIDENCE:BAG-LOCK-ACTIVE-002",
      }),
      requestedAt: "2026-08-14T06:03:00Z",
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.request.executionDeviceRef).toBe("ALPHA-DEVICE-001");
    expect(first.request.deviceSecurityState).toBe("ACTIVE");
    expect(first.request.deviceSecurityPolicyRef).toBe("BAG-LOCK-POLICY:ALPHA-001");
    expect(first.request.deviceSecuritySourceRefs).toEqual([
      "REGISTRY-DEVICE-SECURITY:ALPHA-DEVICE-001:ACTIVE",
      "RIVER-EVIDENCE:BAG-LOCK-ACTIVE-001",
    ]);
    expect(second.request.requestRef).not.toBe(first.request.requestRef);
  });

  it("rejects stray device security context on a non-device-bound Event", () => {
    const bundle = readyPlanningBundle();
    const result = buildWardenDecisionRequestV1({
      program: bundle.program,
      event: bundle.events[0],
      representation: representation(),
      deviceSecurity: deviceSecurity(),
      requestedAt: "2026-08-14T06:03:00Z",
    });

    expect(result).toMatchObject({ ok: false, code: "DEVICE_SECURITY_CONTEXT_MISMATCH" });
  });
});
