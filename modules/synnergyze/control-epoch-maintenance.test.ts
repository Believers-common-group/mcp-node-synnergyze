import { describe, expect, it } from "vitest";

import { InMemoryContainmentControlPlaneV1 } from "./containment-control.ts";
import { ControlEpochLeaseServiceV1 } from "./control-epoch-lease.ts";
import { HostActuatorFabricV1, InMemoryHostResourceAdapterV1 } from "./host-actuator-fabric.ts";

const TARGET = "ALPHA-NODE-SERVICE-001";
const PROGRAM = "SYNNERGYZE-PROGRAM:CONTROL-EPOCH-001";
const AUTHORITY = "WARDEN:ALPHA:MAINTENANCE-001";

describe("R0.4 maintenance command lease propagation", () => {
  it("carries a control lease from Warden maintenance command into guarded host execution", () => {
    const containment = new InMemoryContainmentControlPlaneV1();
    containment.transition({
      controlTargetId: TARGET,
      scope: "TARGET",
      state: "ACTIVE",
      reason: "baseline",
      authorityRef: AUTHORITY,
      effectiveAt: "2026-08-30T05:00:00.000Z",
    });
    const leases = new ControlEpochLeaseServiceV1(containment);
    const lease = leases.issueLease({
      targetRef: TARGET,
      capabilityRef: "maintenance.control",
      programRef: PROGRAM,
      authorityRef: AUTHORITY,
      issuedAt: "2026-08-30T05:00:10.000Z",
      expiresAt: "2026-08-30T05:10:10.000Z",
    });
    const provider = new InMemoryHostResourceAdapterV1("HOST-PROVIDER:TEST-001");
    const host = new HostActuatorFabricV1(
      [
        {
          bindingRef: "HOST-BINDING:ALPHA-NODE-SERVICE-001",
          targetRef: TARGET,
          resourceKind: "SERVICE",
          providerRef: provider.providerRef,
          resourceRef: "SERVICE:ALPHA-WARDEN",
          allowedOperations: ["STOP"],
        },
      ],
      [provider],
      leases,
    );

    const receipt = host.maintenanceActuator().execute(
      {
        commandRef: "WARDEN-MAINTENANCE-COMMAND:001",
        sessionRef: "WARDEN-MAINTENANCE-SESSION:001",
        targetRef: TARGET,
        programRef: PROGRAM,
        action: "STOP",
        checkpoint: "STOP_VERIFIED",
        authorityRef: AUTHORITY,
        expectedStateRef: "ACTIVE",
        requestedAt: "2026-08-30T05:00:15.000Z",
        controlLeaseRef: lease.leaseRef,
      },
      "2026-08-30T05:00:16.000Z",
    );

    expect(receipt.controlLeaseRef).toBe(lease.leaseRef);
    expect(receipt.controlEpoch).toBe(lease.controlEpoch);
    expect(provider.invocationCount()).toBe(1);
  });
});
