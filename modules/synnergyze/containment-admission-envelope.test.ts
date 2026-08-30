import { describe, expect, it } from "vitest";

import { InMemoryContainmentControlPlaneV1 } from "./containment-control.ts";
import { ControlEpochLeaseServiceV1 } from "./control-epoch-lease.ts";
import {
  ContainmentImpactScopeCompilerV1,
  HierarchicalContainmentControlPlaneV1,
  InMemoryContainmentHierarchyV1,
} from "./containment-hierarchy.ts";
import {
  ContainmentAdmissionServiceV1,
  type ContainmentAdmissionVerifierPortV1,
} from "./containment-admission-envelope.ts";
import { HostActuatorFabricV1, InMemoryHostResourceAdapterV1 } from "./host-actuator-fabric.ts";
import type { MaintenanceActuationCommandV1 } from "./maintenance-actuation.ts";

const AUTHORITY = "WARDEN:ALPHA:CONTAINMENT-001";
const CAPABILITY = "maintenance.control";
const PROGRAM = "PROGRAM:ALPHA-MAINTENANCE";
const LOCATION = "LOCATION:ALPHA";
const DEVICE = "DEVICE:ALPHA-NODE-001";

function fixture(requiredApprovals = 2) {
  const hierarchy = new InMemoryContainmentHierarchyV1([
    { nodeRef: "FEDERATION:VSR", kind: "FEDERATION" },
    { nodeRef: "REGION:KARNATAKA", kind: "REGION", parentRef: "FEDERATION:VSR" },
    { nodeRef: LOCATION, kind: "LOCATION", parentRef: "REGION:KARNATAKA" },
    { nodeRef: "WARDEN-CELL:ALPHA", kind: "WARDEN_CELL", parentRef: LOCATION },
    { nodeRef: DEVICE, kind: "DEVICE", parentRef: "WARDEN-CELL:ALPHA" },
  ]);
  const base = new InMemoryContainmentControlPlaneV1();
  base.transition({
    controlTargetId: DEVICE,
    scope: "TARGET",
    state: "ACTIVE",
    reason: "baseline",
    authorityRef: AUTHORITY,
    effectiveAt: "2026-08-30T07:30:00.000Z",
  });
  const containment = new HierarchicalContainmentControlPlaneV1(base, hierarchy);
  const impact = new ContainmentImpactScopeCompilerV1(hierarchy, { LOCATION: requiredApprovals });
  const admission = new ContainmentAdmissionServiceV1(containment, hierarchy, impact);
  const leases = new ControlEpochLeaseServiceV1(containment);
  return { hierarchy, base, containment, impact, admission, leases };
}

function admit(admission: ContainmentAdmissionServiceV1) {
  return admission.admit({
    targetRef: LOCATION,
    requestedState: "PAUSED",
    capabilityRef: CAPABILITY,
    programRef: PROGRAM,
    authorityRef: AUTHORITY,
    approvalRefs: ["WARDEN-APPROVAL:A", "WARDEN-APPROVAL:B"],
    admittedAt: "2026-08-30T07:31:00.000Z",
    expiresAt: "2026-08-30T07:36:00.000Z",
  });
}

describe("WARDEN-MAINTENANCE-CONTROL-001 R0.6 containment admission envelope", () => {
  it("does not mint an execution token when quorum is incomplete", () => {
    const { admission } = fixture(2);

    expect(() =>
      admission.admit({
        targetRef: LOCATION,
        requestedState: "PAUSED",
        capabilityRef: CAPABILITY,
        programRef: PROGRAM,
        authorityRef: AUTHORITY,
        approvalRefs: ["WARDEN-APPROVAL:A"],
        admittedAt: "2026-08-30T07:31:00.000Z",
        expiresAt: "2026-08-30T07:36:00.000Z",
      }),
    ).toThrowError("containment_admission_quorum_required");
  });

  it("mints a deterministic envelope bound to impact, approvals and context epoch", () => {
    const { admission } = fixture();
    const admitted = admit(admission);

    expect(admitted.envelope.targetRef).toBe(LOCATION);
    expect(admitted.envelope.impactedNodeRefs).toContain(DEVICE);
    expect(admitted.envelope.requiredApprovals).toBe(2);
    expect(admitted.envelope.approvalRefs).toEqual([
      "WARDEN-APPROVAL:A",
      "WARDEN-APPROVAL:B",
    ]);
    expect(admitted.token.contextEpoch).toBe(admitted.envelope.contextEpoch);
    expect(admitted.token.impactCompilationRef).toBe(admitted.envelope.impactCompilationRef);
  });

  it("rejects an admitted token after applicable containment epoch drift", () => {
    const { base, admission } = fixture();
    const admitted = admit(admission);

    base.transition({
      controlTargetId: LOCATION,
      scope: "TARGET",
      state: "RESTRICTED",
      reason: "scope_changed_after_admission",
      authorityRef: AUTHORITY,
      allowedCapabilityRefs: [CAPABILITY],
      effectiveAt: "2026-08-30T07:32:00.000Z",
    });

    expect(() =>
      admission.verifyAndConsume({
        tokenRef: admitted.token.tokenRef,
        executionTargetRef: DEVICE,
        expectedStateRef: "PAUSED",
        authorityRef: AUTHORITY,
        evaluatedAt: "2026-08-30T07:33:00.000Z",
      }),
    ).toThrowError("containment_admission_context_stale");
  });

  it("allows one use only and rejects token replay", () => {
    const { admission } = fixture();
    const admitted = admit(admission);

    const verified = admission.verifyAndConsume({
      tokenRef: admitted.token.tokenRef,
      executionTargetRef: DEVICE,
      expectedStateRef: "PAUSED",
      authorityRef: AUTHORITY,
      evaluatedAt: "2026-08-30T07:32:00.000Z",
    });
    expect(verified.tokenRef).toBe(admitted.token.tokenRef);

    expect(() =>
      admission.verifyAndConsume({
        tokenRef: admitted.token.tokenRef,
        executionTargetRef: DEVICE,
        expectedStateRef: "PAUSED",
        authorityRef: AUTHORITY,
        evaluatedAt: "2026-08-30T07:32:01.000Z",
      }),
    ).toThrowError("containment_admission_token_consumed");
  });

  it("guards host execution before provider invocation", () => {
    const { admission, leases } = fixture();
    const admitted = admit(admission);
    const lease = leases.issueLease({
      targetRef: DEVICE,
      capabilityRef: CAPABILITY,
      programRef: PROGRAM,
      authorityRef: AUTHORITY,
      issuedAt: "2026-08-30T07:31:00.000Z",
      expiresAt: "2026-08-30T07:36:00.000Z",
    });
    const provider = new InMemoryHostResourceAdapterV1("HOST-PROVIDER:TEST-001");
    const host = new HostActuatorFabricV1(
      [
        {
          bindingRef: "HOST-BINDING:ALPHA",
          targetRef: DEVICE,
          resourceKind: "SERVICE",
          providerRef: provider.providerRef,
          resourceRef: "SERVICE:ALPHA-WARDEN",
          allowedOperations: ["STOP"],
        },
      ],
      [provider],
      leases,
      admission as ContainmentAdmissionVerifierPortV1,
    );

    expect(() =>
      host.executeHostOperation({
        targetRef: DEVICE,
        operation: "STOP",
        expectedStateRef: "PAUSED",
        authorityRef: AUTHORITY,
        requestedAt: "2026-08-30T07:32:00.000Z",
        executedAt: "2026-08-30T07:32:01.000Z",
        controlLeaseRef: lease.leaseRef,
      }),
    ).toThrowError("containment_admission_token_required");
    expect(provider.invocationCount()).toBe(0);

    const receipt = host.executeHostOperation({
      targetRef: DEVICE,
      operation: "STOP",
      expectedStateRef: "PAUSED",
      authorityRef: AUTHORITY,
      requestedAt: "2026-08-30T07:32:00.000Z",
      executedAt: "2026-08-30T07:32:01.000Z",
      controlLeaseRef: lease.leaseRef,
      containmentAdmissionTokenRef: admitted.token.tokenRef,
    });
    expect(receipt.containmentAdmissionTokenRef).toBe(admitted.token.tokenRef);
    expect(receipt.containmentAdmissionEnvelopeRef).toBe(admitted.envelope.envelopeRef);
    expect(provider.invocationCount()).toBe(1);
  });

  it("propagates admission lineage through the maintenance actuator bridge", () => {
    const { admission, leases } = fixture();
    const admitted = admit(admission);
    const lease = leases.issueLease({
      targetRef: DEVICE,
      capabilityRef: CAPABILITY,
      programRef: PROGRAM,
      authorityRef: AUTHORITY,
      issuedAt: "2026-08-30T07:31:00.000Z",
      expiresAt: "2026-08-30T07:36:00.000Z",
    });
    const provider = new InMemoryHostResourceAdapterV1("HOST-PROVIDER:MAINT-001");
    const host = new HostActuatorFabricV1(
      [
        {
          bindingRef: "HOST-BINDING:MAINT",
          targetRef: DEVICE,
          resourceKind: "SERVICE",
          providerRef: provider.providerRef,
          resourceRef: "SERVICE:ALPHA-WARDEN",
          allowedOperations: ["STOP"],
        },
      ],
      [provider],
      leases,
      admission,
    );
    const command: MaintenanceActuationCommandV1 = {
      commandRef: "WARDEN-MAINTENANCE-COMMAND:R0.6",
      sessionRef: "MAINTENANCE-SESSION:R0.6",
      targetRef: DEVICE,
      programRef: PROGRAM,
      action: "STOP",
      checkpoint: "STOP_VERIFIED",
      authorityRef: AUTHORITY,
      expectedStateRef: "PAUSED",
      requestedAt: "2026-08-30T07:32:00.000Z",
      controlLeaseRef: lease.leaseRef,
      containmentAdmissionTokenRef: admitted.token.tokenRef,
    };

    const receipt = host.maintenanceActuator().execute(command, "2026-08-30T07:32:01.000Z");
    expect(receipt.containmentAdmissionTokenRef).toBe(admitted.token.tokenRef);
    expect(receipt.containmentAdmissionEnvelopeRef).toBe(admitted.envelope.envelopeRef);
    expect(provider.invocationCount()).toBe(1);
  });
});
