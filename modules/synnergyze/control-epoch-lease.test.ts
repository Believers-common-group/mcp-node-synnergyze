import { describe, expect, it } from "vitest";

import { InMemoryContainmentControlPlaneV1 } from "./containment-control.ts";
import { HostActuatorFabricV1, InMemoryHostResourceAdapterV1 } from "./host-actuator-fabric.ts";
import { ControlEpochLeaseServiceV1 } from "./control-epoch-lease.ts";

const TARGET = "ALPHA-NODE-SERVICE-001";
const PROGRAM = "SYNNERGYZE-PROGRAM:CONTROL-EPOCH-001";
const CAPABILITY = "maintenance.control";
const AUTHORITY = "WARDEN:ALPHA:MAINTENANCE-001";

function fixture() {
  const containment = new InMemoryContainmentControlPlaneV1();
  containment.transition({
    controlTargetId: TARGET,
    scope: "TARGET",
    state: "ACTIVE",
    reason: "baseline",
    authorityRef: AUTHORITY,
    effectiveAt: "2026-08-30T05:00:00.000Z",
  });
  const leaseService = new ControlEpochLeaseServiceV1(containment);
  const provider = new InMemoryHostResourceAdapterV1("HOST-PROVIDER:TEST-001");
  const host = new HostActuatorFabricV1(
    [
      {
        bindingRef: "HOST-BINDING:ALPHA-NODE-SERVICE-001",
        targetRef: TARGET,
        resourceKind: "SERVICE",
        providerRef: provider.providerRef,
        resourceRef: "SERVICE:ALPHA-WARDEN",
        allowedOperations: ["STOP", "START", "RESTRICT", "RESTORE"],
      },
    ],
    [provider],
    leaseService,
  );
  return { containment, leaseService, provider, host };
}

describe("WARDEN-MAINTENANCE-CONTROL-001 R0.4 control epoch + lease", () => {
  it("increments the target control epoch after every containment transition", () => {
    const { containment, leaseService } = fixture();
    const before = leaseService.currentEpoch(TARGET);

    containment.transition({
      controlTargetId: TARGET,
      scope: "TARGET",
      state: "PAUSED",
      reason: "maintenance_required",
      authorityRef: AUTHORITY,
      effectiveAt: "2026-08-30T05:01:00.000Z",
    });

    expect(leaseService.currentEpoch(TARGET)).toBe(before + 1);
  });

  it("rejects a host operation when its lease epoch is stale", () => {
    const { containment, leaseService, provider, host } = fixture();
    const lease = leaseService.issueLease({
      targetRef: TARGET,
      capabilityRef: CAPABILITY,
      programRef: PROGRAM,
      authorityRef: AUTHORITY,
      issuedAt: "2026-08-30T05:00:10.000Z",
      expiresAt: "2026-08-30T05:10:10.000Z",
    });

    containment.transition({
      controlTargetId: TARGET,
      scope: "TARGET",
      state: "PAUSED",
      reason: "contain_before_execution",
      authorityRef: AUTHORITY,
      effectiveAt: "2026-08-30T05:00:20.000Z",
    });

    expect(() =>
      host.executeHostOperation({
        targetRef: TARGET,
        operation: "STOP",
        expectedStateRef: "PAUSED",
        authorityRef: AUTHORITY,
        requestedAt: "2026-08-30T05:00:15.000Z",
        executedAt: "2026-08-30T05:00:25.000Z",
        controlLeaseRef: lease.leaseRef,
      }),
    ).toThrowError("control_lease_epoch_stale");
    expect(provider.invocationCount()).toBe(0);
  });

  it("rejects an expired control lease before provider invocation", () => {
    const { leaseService, provider, host } = fixture();
    const lease = leaseService.issueLease({
      targetRef: TARGET,
      capabilityRef: CAPABILITY,
      programRef: PROGRAM,
      authorityRef: AUTHORITY,
      issuedAt: "2026-08-30T05:00:10.000Z",
      expiresAt: "2026-08-30T05:00:20.000Z",
    });

    expect(() =>
      host.executeHostOperation({
        targetRef: TARGET,
        operation: "STOP",
        expectedStateRef: "PAUSED",
        authorityRef: AUTHORITY,
        requestedAt: "2026-08-30T05:00:15.000Z",
        executedAt: "2026-08-30T05:00:21.000Z",
        controlLeaseRef: lease.leaseRef,
      }),
    ).toThrowError("control_lease_expired");
    expect(provider.invocationCount()).toBe(0);
  });

  it("rejects a lease used by another authority", () => {
    const { leaseService, provider, host } = fixture();
    const lease = leaseService.issueLease({
      targetRef: TARGET,
      capabilityRef: CAPABILITY,
      programRef: PROGRAM,
      authorityRef: AUTHORITY,
      issuedAt: "2026-08-30T05:00:10.000Z",
      expiresAt: "2026-08-30T05:10:10.000Z",
    });

    expect(() =>
      host.executeHostOperation({
        targetRef: TARGET,
        operation: "STOP",
        expectedStateRef: "PAUSED",
        authorityRef: "WARDEN:OTHER",
        requestedAt: "2026-08-30T05:00:15.000Z",
        executedAt: "2026-08-30T05:00:16.000Z",
        controlLeaseRef: lease.leaseRef,
      }),
    ).toThrowError("control_lease_authority_mismatch");
    expect(provider.invocationCount()).toBe(0);
  });

  it("allows execution only while lease is current and records epoch lineage", () => {
    const { leaseService, provider, host } = fixture();
    const lease = leaseService.issueLease({
      targetRef: TARGET,
      capabilityRef: CAPABILITY,
      programRef: PROGRAM,
      authorityRef: AUTHORITY,
      issuedAt: "2026-08-30T05:00:10.000Z",
      expiresAt: "2026-08-30T05:10:10.000Z",
    });

    const receipt = host.executeHostOperation({
      targetRef: TARGET,
      operation: "STOP",
      expectedStateRef: "PAUSED",
      authorityRef: AUTHORITY,
      requestedAt: "2026-08-30T05:00:15.000Z",
      executedAt: "2026-08-30T05:00:16.000Z",
      controlLeaseRef: lease.leaseRef,
    });

    expect(receipt.controlLeaseRef).toBe(lease.leaseRef);
    expect(receipt.controlEpoch).toBe(lease.controlEpoch);
    expect(provider.invocationCount()).toBe(1);
  });

  it("fails closed when state-changing execution has no lease", () => {
    const { provider, host } = fixture();

    expect(() =>
      host.executeHostOperation({
        targetRef: TARGET,
        operation: "STOP",
        expectedStateRef: "PAUSED",
        authorityRef: AUTHORITY,
        requestedAt: "2026-08-30T05:00:15.000Z",
        executedAt: "2026-08-30T05:00:16.000Z",
      }),
    ).toThrowError("control_lease_required");
    expect(provider.invocationCount()).toBe(0);
  });
});
