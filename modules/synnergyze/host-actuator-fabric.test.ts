import { describe, expect, it } from "vitest";

import {
  HostActuatorFabricV1,
  InMemoryHostResourceAdapterV1,
  type HostResourceBindingV1,
} from "./host-actuator-fabric.ts";
import {
  MaintenanceActuationCoordinatorV1,
  type MaintenanceActuatorPortV1,
} from "./maintenance-actuation.ts";
import { InMemoryContainmentControlPlaneV1 } from "./containment-control.ts";
import { InMemoryMaintenanceControlPlaneV1 } from "./maintenance-control.ts";

const TARGET = "ALPHA-NODE-SERVICE-001";
const PROGRAM = "SYNNERGYZE-PROGRAM:HOST-ACTUATION-001";
const MAINTENANCE_AUTHORITY = "WARDEN:ALPHA:MAINTENANCE-001";
const RESTART_AUTHORITY = "WARDEN:ALPHA:RESTART-001";

function binding(
  overrides: Partial<HostResourceBindingV1> = {},
): HostResourceBindingV1 {
  return {
    bindingRef: "HOST-BINDING:SERVICE-001",
    targetRef: TARGET,
    resourceKind: "SERVICE",
    providerRef: "HOST-PROVIDER:INMEMORY-001",
    resourceRef: "service:synnergyze-api",
    allowedOperations: ["STOP", "START", "RESTRICT", "RESTORE"],
    ...overrides,
  };
}

function maintenanceFixture(actuator: MaintenanceActuatorPortV1) {
  const containment = new InMemoryContainmentControlPlaneV1();
  containment.transition({
    controlTargetId: TARGET,
    scope: "TARGET",
    state: "PAUSED",
    reason: "maintenance_required",
    authorityRef: MAINTENANCE_AUTHORITY,
    effectiveAt: "2026-08-30T00:00:00.000Z",
  });
  const maintenance = new InMemoryMaintenanceControlPlaneV1(containment);
  const session = maintenance.openSession({
    targetRef: TARGET,
    programRef: PROGRAM,
    reasonCode: "service_health_degraded",
    plannedWork: ["inspect_service", "apply_remediation", "verify_recovery"],
    maintenanceAuthorityRef: MAINTENANCE_AUTHORITY,
    restartAuthorityRef: RESTART_AUTHORITY,
    requiredIsolationState: "PAUSED",
    limitedRestartCapabilityRefs: ["service_request.read"],
    openedAt: "2026-08-30T00:01:00.000Z",
    expiresAt: "2026-08-30T02:00:00.000Z",
  });
  return {
    containment,
    maintenance,
    session,
    coordinator: new MaintenanceActuationCoordinatorV1(maintenance, actuator),
  };
}

describe("WARDEN-MAINTENANCE-CONTROL-001 R0.3 host actuator fabric", () => {
  it("rejects host operations that are not explicitly allowed by the resource binding", () => {
    const adapter = new InMemoryHostResourceAdapterV1("HOST-PROVIDER:INMEMORY-001");
    const fabric = new HostActuatorFabricV1([binding({ allowedOperations: ["STOP"] })], [adapter]);

    expect(() =>
      fabric.executeHostOperation({
        targetRef: TARGET,
        operation: "RESTORE",
        expectedStateRef: "ACTIVE",
        authorityRef: RESTART_AUTHORITY,
        requestedAt: "2026-08-30T00:10:00.000Z",
      }),
    ).toThrow("host_operation_not_allowed");
    expect(adapter.invocationCount()).toBe(0);
  });

  it("routes only through the provider bound to the target and emits execution plus observation lineage", () => {
    const adapter = new InMemoryHostResourceAdapterV1("HOST-PROVIDER:INMEMORY-001");
    const fabric = new HostActuatorFabricV1([binding()], [adapter]);

    const executed = fabric.executeHostOperation({
      targetRef: TARGET,
      operation: "STOP",
      expectedStateRef: "PAUSED",
      authorityRef: MAINTENANCE_AUTHORITY,
      requestedAt: "2026-08-30T00:10:00.000Z",
    });
    const observation = fabric.observeHostOperation(executed, "2026-08-30T00:10:05.000Z");

    expect(executed.executionReceiptRef).toMatch(/^HOST-ACTUATION-RECEIPT:/);
    expect(executed.bindingRef).toBe("HOST-BINDING:SERVICE-001");
    expect(executed.providerRef).toBe("HOST-PROVIDER:INMEMORY-001");
    expect(observation.observationRef).toMatch(/^HOST-ACTUATION-OBSERVATION:/);
    expect(observation.observedStateRef).toBe("PAUSED");
    expect(observation.sourceEvidenceRef).toMatch(/^RIVER-EVIDENCE:HOST-ACTUATION:/);
  });

  it("supports distinct service, container, network and credential-session resource bindings without arbitrary shell commands", () => {
    const adapter = new InMemoryHostResourceAdapterV1("HOST-PROVIDER:INMEMORY-001");
    const fabric = new HostActuatorFabricV1(
      [
        binding(),
        binding({
          bindingRef: "HOST-BINDING:CONTAINER-001",
          targetRef: "ALPHA-CONTAINER-001",
          resourceKind: "CONTAINER",
          resourceRef: "container:river-api",
          allowedOperations: ["STOP", "START", "RESTRICT", "RESTORE"],
        }),
        binding({
          bindingRef: "HOST-BINDING:NETWORK-001",
          targetRef: "ALPHA-NETWORK-ZONE-001",
          resourceKind: "NETWORK_ZONE",
          resourceRef: "network-zone:maintenance",
          allowedOperations: ["ISOLATE", "RESTORE"],
        }),
        binding({
          bindingRef: "HOST-BINDING:SESSION-001",
          targetRef: "ALPHA-CREDENTIAL-SESSION-001",
          resourceKind: "CREDENTIAL_SESSION",
          resourceRef: "credential-session:maintenance",
          allowedOperations: ["REVOKE"],
        }),
      ],
      [adapter],
    );

    expect(fabric.binding("ALPHA-CONTAINER-001")?.resourceKind).toBe("CONTAINER");
    expect(fabric.binding("ALPHA-NETWORK-ZONE-001")?.allowedOperations).toEqual([
      "ISOLATE",
      "RESTORE",
    ]);
    expect(fabric.binding("ALPHA-CREDENTIAL-SESSION-001")?.allowedOperations).toEqual([
      "REVOKE",
    ]);
    expect(Object.keys(fabric.binding(TARGET) ?? {})).not.toContain("command");
    expect(Object.keys(fabric.binding(TARGET) ?? {})).not.toContain("shell");
  });

  it("plugs the host fabric into the existing maintenance coordinator and advances STOP_VERIFIED only after host observation matches", () => {
    const adapter = new InMemoryHostResourceAdapterV1("HOST-PROVIDER:INMEMORY-001");
    const fabric = new HostActuatorFabricV1([binding()], [adapter]);
    const fixture = maintenanceFixture(fabric.maintenanceActuator());

    const result = fixture.coordinator.executeCheckpoint({
      sessionRef: fixture.session.sessionRef,
      checkpoint: "STOP_VERIFIED",
      authorityRef: MAINTENANCE_AUTHORITY,
      requestedAt: "2026-08-30T00:02:00.000Z",
      executedAt: "2026-08-30T00:02:05.000Z",
      observedAt: "2026-08-30T00:02:10.000Z",
      verifiedAt: "2026-08-30T00:02:15.000Z",
    });

    expect(result.state).toBe("CHECKPOINT_RECORDED");
    expect(fixture.maintenance.session(fixture.session.sessionRef)?.currentCheckpoint).toBe(
      "STOP_VERIFIED",
    );
    expect(adapter.invocationCount()).toBe(1);
  });

  it("does not advance maintenance when the bound host provider reports the wrong effect", () => {
    const adapter = new InMemoryHostResourceAdapterV1("HOST-PROVIDER:INMEMORY-001");
    adapter.setObservedState("service:synnergyze-api", "STOP", "RUNNING");
    const fabric = new HostActuatorFabricV1([binding()], [adapter]);
    const fixture = maintenanceFixture(fabric.maintenanceActuator());

    const result = fixture.coordinator.executeCheckpoint({
      sessionRef: fixture.session.sessionRef,
      checkpoint: "STOP_VERIFIED",
      authorityRef: MAINTENANCE_AUTHORITY,
      requestedAt: "2026-08-30T00:02:00.000Z",
      executedAt: "2026-08-30T00:02:05.000Z",
      observedAt: "2026-08-30T00:02:10.000Z",
      verifiedAt: "2026-08-30T00:02:15.000Z",
    });

    expect(result.state).toBe("EFFECT_NOT_VERIFIED");
    expect(fixture.maintenance.session(fixture.session.sessionRef)?.currentCheckpoint).toBeNull();
  });
});
