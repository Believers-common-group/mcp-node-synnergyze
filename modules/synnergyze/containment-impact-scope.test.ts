import { describe, expect, it } from "vitest";

import { InMemoryContainmentControlPlaneV1 } from "./containment-control.ts";
import { ControlEpochLeaseServiceV1 } from "./control-epoch-lease.ts";
import {
  ContainmentImpactScopeCompilerV1,
  HierarchicalContainmentControlPlaneV1,
  InMemoryContainmentHierarchyV1,
} from "./containment-hierarchy.ts";

const AUTHORITY = "WARDEN:ALPHA:MAINTENANCE-001";
const CAPABILITY = "maintenance.control";
const PROGRAM = "PROGRAM:ALPHA-MAINTENANCE";
const DEVICE = "DEVICE:ALPHA-NODE-001";
const LOCATION = "LOCATION:ALPHA";
const OTHER_LOCATION = "LOCATION:BETA";

function hierarchy() {
  return new InMemoryContainmentHierarchyV1([
    { nodeRef: "FEDERATION:VSR", kind: "FEDERATION" },
    { nodeRef: "REGION:KARNATAKA", kind: "REGION", parentRef: "FEDERATION:VSR" },
    { nodeRef: "TENANT:BELIEVERS-COMMON", kind: "TENANT", parentRef: "REGION:KARNATAKA" },
    { nodeRef: LOCATION, kind: "LOCATION", parentRef: "TENANT:BELIEVERS-COMMON" },
    { nodeRef: OTHER_LOCATION, kind: "LOCATION", parentRef: "TENANT:BELIEVERS-COMMON" },
    { nodeRef: "WARDEN-CELL:ALPHA", kind: "WARDEN_CELL", parentRef: LOCATION },
    { nodeRef: "APPLICATION:SYNNERGYZE", kind: "APPLICATION", parentRef: "WARDEN-CELL:ALPHA" },
    { nodeRef: DEVICE, kind: "DEVICE", parentRef: "APPLICATION:SYNNERGYZE" },
    { nodeRef: "CAPABILITY:ALPHA-MAINTENANCE", kind: "CAPABILITY", parentRef: DEVICE },
    { nodeRef: "DEVICE:BETA-NODE-001", kind: "DEVICE", parentRef: OTHER_LOCATION },
  ]);
}

function fixture() {
  const base = new InMemoryContainmentControlPlaneV1();
  const graph = hierarchy();
  const containment = new HierarchicalContainmentControlPlaneV1(base, graph);
  const leases = new ControlEpochLeaseServiceV1(containment);
  return { base, graph, containment, leases };
}

describe("WARDEN-MAINTENANCE-CONTROL-001 R0.5 hierarchy + impact scope", () => {
  it("rejects cyclic containment hierarchies", () => {
    expect(
      () =>
        new InMemoryContainmentHierarchyV1([
          { nodeRef: "A", kind: "APPLICATION", parentRef: "B" },
          { nodeRef: "B", kind: "DEVICE", parentRef: "A" },
        ]),
    ).toThrowError("containment_hierarchy_cycle");
  });

  it("inherits an ancestor containment denial into descendant execution", () => {
    const { base, containment } = fixture();
    base.transition({
      controlTargetId: LOCATION,
      scope: "TARGET",
      state: "PAUSED",
      reason: "site maintenance",
      authorityRef: AUTHORITY,
      effectiveAt: "2026-08-30T06:00:00.000Z",
    });

    const evaluation = containment.evaluate({
      targetRef: DEVICE,
      capabilityRef: CAPABILITY,
      programRef: PROGRAM,
      evaluatedAt: "2026-08-30T06:01:00.000Z",
    });

    expect(evaluation.decision).toBe("DENY");
    expect(evaluation.state).toBe("PAUSED");
    expect(evaluation.reasonCodes).toContain("containment_inherited_ancestor");
    expect(evaluation.matchedControlRefs).toHaveLength(1);
  });

  it("invalidates a descendant lease when an ancestor control epoch advances", () => {
    const { base, leases } = fixture();
    base.transition({
      controlTargetId: LOCATION,
      scope: "TARGET",
      state: "ACTIVE",
      reason: "baseline",
      authorityRef: AUTHORITY,
      effectiveAt: "2026-08-30T06:00:00.000Z",
    });
    const lease = leases.issueLease({
      targetRef: DEVICE,
      capabilityRef: CAPABILITY,
      programRef: PROGRAM,
      authorityRef: AUTHORITY,
      issuedAt: "2026-08-30T06:00:10.000Z",
      expiresAt: "2026-08-30T06:10:10.000Z",
    });

    base.transition({
      controlTargetId: LOCATION,
      scope: "TARGET",
      state: "PAUSED",
      reason: "contain site",
      authorityRef: AUTHORITY,
      effectiveAt: "2026-08-30T06:00:20.000Z",
    });

    expect(() =>
      leases.verifyLease({
        leaseRef: lease.leaseRef,
        targetRef: DEVICE,
        authorityRef: AUTHORITY,
        evaluatedAt: "2026-08-30T06:00:21.000Z",
      }),
    ).toThrowError("control_lease_epoch_stale");
  });

  it("does not invalidate a lease for an unrelated sibling hierarchy transition", () => {
    const { base, leases } = fixture();
    const lease = leases.issueLease({
      targetRef: DEVICE,
      capabilityRef: CAPABILITY,
      programRef: PROGRAM,
      authorityRef: AUTHORITY,
      issuedAt: "2026-08-30T06:00:10.000Z",
      expiresAt: "2026-08-30T06:10:10.000Z",
    });

    base.transition({
      controlTargetId: OTHER_LOCATION,
      scope: "TARGET",
      state: "PAUSED",
      reason: "beta maintenance",
      authorityRef: AUTHORITY,
      effectiveAt: "2026-08-30T06:00:20.000Z",
    });

    expect(
      leases.verifyLease({
        leaseRef: lease.leaseRef,
        targetRef: DEVICE,
        authorityRef: AUTHORITY,
        evaluatedAt: "2026-08-30T06:00:21.000Z",
      }).leaseRef,
    ).toBe(lease.leaseRef);
  });

  it("compiles descendant impact before high-scope containment and requires configured quorum", () => {
    const compiler = new ContainmentImpactScopeCompilerV1(hierarchy(), {
      LOCATION: 2,
      REGION: 3,
      FEDERATION: 4,
    });

    const underApproved = compiler.compile({
      targetRef: LOCATION,
      requestedState: "ISOLATED",
      approvalRefs: ["WARDEN:LOCATION:1"],
    });
    expect(underApproved.decision).toBe("QUORUM_REQUIRED");
    expect(underApproved.requiredApprovals).toBe(2);
    expect(underApproved.impactedNodeRefs).toEqual(
      expect.arrayContaining([
        LOCATION,
        "WARDEN-CELL:ALPHA",
        "APPLICATION:SYNNERGYZE",
        DEVICE,
        "CAPABILITY:ALPHA-MAINTENANCE",
      ]),
    );

    const approved = compiler.compile({
      targetRef: LOCATION,
      requestedState: "ISOLATED",
      approvalRefs: ["WARDEN:LOCATION:1", "WARDEN:LOCATION:2", "WARDEN:LOCATION:2"],
    });
    expect(approved.decision).toBe("ADMISSIBLE");
    expect(approved.distinctApprovalCount).toBe(2);
    expect(approved.impactCount).toBe(5);
  });
});
