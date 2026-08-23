import { describe, expect, it } from "vitest";

import type { WardenDecisionRequestV1 } from "../../modules/warden/contracts.ts";
import { RiverWardenConformanceBindingServiceV1 } from "./registerRiverWardenConformanceReservation.ts";

const DECIDED_AT = "2026-08-23T01:00:30.000Z";

function request(overrides: Partial<WardenDecisionRequestV1> = {}): WardenDecisionRequestV1 {
  return {
    requestRef: "WARDEN-REQUEST:RIVER-REVIEW-001",
    actorRef: "DIGITALME-ALPHA-TEST-001",
    representedPrincipalRef: "LAB-COMPANY-001",
    actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
    contextRef: "ALPHA-NODE-001",
    programRef: "SYNNERGYZE-PROGRAM:001",
    eventRef: "SYNNERGYZE-EVENT:RIVER-REVIEW-001",
    action: "service_request.create",
    capabilityRef: "service_request.create",
    targetRef: "LAB-SERVICE-DESK-001",
    requestedEffect: "service_request.created",
    authorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
    policyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
    representationSourceRefs: ["REGISTRY:REPRESENTATION-001"],
    requestedAt: "2026-08-23T01:00:00.000Z",
    correlationId: "CORR-WARDEN-RIVER-REVIEW-001",
    ...overrides,
  };
}

function input(value: WardenDecisionRequestV1) {
  return { request: value };
}

describe("WARDEN-RIVER-MCP-CONFORMANCE-0.7 review regressions", () => {
  it("rejects an action that does not match the permitted capability", () => {
    const binding = new RiverWardenConformanceBindingServiceV1();
    expect(() =>
      binding.execute(
        input(request({ action: "bank.transfer", capabilityRef: "service_request.create" })),
        DECIDED_AT,
      ),
    ).toThrow("warden_river_action_capability_mismatch");
  });

  it("requires non-empty representation provenance before reservation", () => {
    const binding = new RiverWardenConformanceBindingServiceV1();
    expect(() =>
      binding.execute(input(request({ representationSourceRefs: [] })), DECIDED_AT),
    ).toThrow("warden_river_representation_source_required");
  });

  it("rejects future or expired device-security evidence", () => {
    const future = new RiverWardenConformanceBindingServiceV1();
    expect(() =>
      future.execute(
        input(
          request({
            executionDeviceRef: "GENESIS-DEVICE:ALPHA-001",
            deviceSecurityState: "ACTIVE",
            deviceSecuritySourceRefs: ["RIVER:DEVICE-SECURITY-001"],
            deviceSecurityResolvedAt: "2026-08-23T01:00:10.000Z",
            deviceSecurityValidUntil: "2026-08-23T02:00:00.000Z",
          }),
        ),
        DECIDED_AT,
      ),
    ).toThrow("warden_river_device_security_from_future");

    const expired = new RiverWardenConformanceBindingServiceV1();
    expect(() =>
      expired.execute(
        input(
          request({
            requestRef: "WARDEN-REQUEST:RIVER-REVIEW-EXPIRED-001",
            correlationId: "CORR-WARDEN-RIVER-REVIEW-EXPIRED-001",
            executionDeviceRef: "GENESIS-DEVICE:ALPHA-001",
            deviceSecurityState: "ACTIVE",
            deviceSecuritySourceRefs: ["RIVER:DEVICE-SECURITY-001"],
            deviceSecurityResolvedAt: "2026-08-23T00:59:00.000Z",
            deviceSecurityValidUntil: "2026-08-23T01:00:15.000Z",
          }),
        ),
        DECIDED_AT,
      ),
    ).toThrow("warden_river_device_security_expired");
  });

  it("treats duplicate and reordered reference sets as the same replay identity", () => {
    const binding = new RiverWardenConformanceBindingServiceV1();
    const first = binding.execute(input(request()), DECIDED_AT);
    const replay = binding.execute(
      input(
        request({
          authorityRefs: ["AUTHORITY:LAB-OPERATOR-001", "AUTHORITY:LAB-OPERATOR-001"],
          policyRefs: ["POLICY:ALPHA-SYNTHETIC-001", "POLICY:ALPHA-SYNTHETIC-001"],
          representationSourceRefs: [
            "REGISTRY:REPRESENTATION-001",
            "REGISTRY:REPRESENTATION-001",
          ],
        }),
      ),
      "2026-08-23T01:05:00.000Z",
    );

    expect(replay).toEqual(first);
  });
});
