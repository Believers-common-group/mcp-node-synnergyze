import { describe, expect, it } from "vitest";

import { InMemorySynnergyzeClientControlPlaneV1 } from "./client-control-plane.ts";

function bootstrapPlane() {
  const plane = new InMemorySynnergyzeClientControlPlaneV1();
  plane.registerClient({
    clientRef: "CLIENT-VOI-001",
    contractRef: "SYN-CLT-CONTRACT-VOI-001",
    genesisEstateRef: "GENESIS-ESTATE-VOI-001",
  });
  return plane;
}

describe("Synnergyze client control plane R0.1", () => {
  it("registers a Genesis-bound client but keeps execution blocked until Warden is fitted", () => {
    const plane = bootstrapPlane();

    expect(plane.readiness("CLIENT-VOI-001")).toEqual({
      clientRef: "CLIENT-VOI-001",
      genesisBinding: "BOUND",
      synnergyzeState: "READY",
      wardenBinding: "UNBOUND",
      executionState: "BLOCKED_WARDEN_UNBOUND",
      systemCount: 0,
      capabilityCount: 0,
      workflowCount: 0,
      deviceCount: 0,
    });
  });

  it("composes admitted systems, declared capabilities, and contracted workflows", () => {
    const plane = bootstrapPlane();
    plane.admitSystem({
      systemRef: "SYS-LOGIC-001",
      clientRef: "CLIENT-VOI-001",
      genesisEstateRef: "GENESIS-ESTATE-VOI-001",
      genesisSystemRef: "GENESIS-SYSTEM-LOGIC-001",
    });
    plane.declareCapability({
      capabilityRef: "CAP-INVENTORY-READ-001",
      systemRef: "SYS-LOGIC-001",
      action: "inventory.read",
      mode: "READ",
    });
    plane.contractWorkflow({
      workflowRef: "SYN-WFL-INVENTORY-READ-001",
      clientRef: "CLIENT-VOI-001",
      capabilityRefs: ["CAP-INVENTORY-READ-001"],
    });

    const readiness = plane.readiness("CLIENT-VOI-001");
    expect(readiness.systemCount).toBe(1);
    expect(readiness.capabilityCount).toBe(1);
    expect(readiness.workflowCount).toBe(1);
    expect(readiness.executionState).toBe("BLOCKED_WARDEN_UNBOUND");
  });

  it("rejects a system whose Genesis estate does not match the client binding", () => {
    const plane = bootstrapPlane();

    expect(() =>
      plane.admitSystem({
        systemRef: "SYS-FOREIGN-001",
        clientRef: "CLIENT-VOI-001",
        genesisEstateRef: "GENESIS-ESTATE-OTHER-001",
        genesisSystemRef: "GENESIS-SYSTEM-FOREIGN-001",
      }),
    ).toThrow("synnergyze_genesis_estate_mismatch");
  });

  it("rejects duplicate identifiers and undeclared workflow capabilities", () => {
    const plane = bootstrapPlane();
    expect(() =>
      plane.registerClient({
        clientRef: "CLIENT-VOI-001",
        contractRef: "SYN-CLT-CONTRACT-OTHER-001",
        genesisEstateRef: "GENESIS-ESTATE-VOI-001",
      }),
    ).toThrow("synnergyze_client_ref_conflict");

    expect(() =>
      plane.contractWorkflow({
        workflowRef: "SYN-WFL-MISSING-001",
        clientRef: "CLIENT-VOI-001",
        capabilityRefs: ["CAP-MISSING-001"],
      }),
    ).toThrow("synnergyze_workflow_capability_not_declared:CAP-MISSING-001");
  });
});


describe("Synnergyze bootstrap profile", () => {
  it("declares Genesis authoritative and Warden deliberately unbound", async () => {
    const { readFile } = await import("node:fs/promises");
    const profileUrl = new URL(
      "../../config/synnergyze/client-bootstrap-r0.1.json",
      import.meta.url,
    );
    const profile = JSON.parse(await readFile(profileUrl, "utf8"));

    expect(profile.profile_id).toBe("SYNNERGYZE-CLIENT-BOOTSTRAP-001");
    expect(profile.genesis.authority).toBe("CANONICAL");
    expect(profile.warden.binding).toBe("UNBOUND");
    expect(profile.execution.state).toBe("BLOCKED_WARDEN_UNBOUND");
  });
});


describe("Synnergyze VSR module binding", () => {
  it("publishes the client bootstrap without activating Warden", async () => {
    const { readFile } = await import("node:fs/promises");
    const bindingsUrl = new URL("../../.vsr/module-bindings.yaml", import.meta.url);
    const bindings = await readFile(bindingsUrl, "utf8");

    expect(bindings).toContain("module_id: MOD-SYNNERGYZE-001");
    expect(bindings).toContain(
      "bootstrap_profile: config/synnergyze/client-bootstrap-r0.1.json",
    );
    expect(bindings).toContain("module_id: MOD-GENESIS-DEVICE-001");
    expect(bindings).toContain("GENESIS-DEVICE-RESOLUTION");
    expect(bindings).toContain("warden_binding: UNBOUND");
  });
});

describe("Synnergyze client Genesis device dependency", () => {
  const genesisResolution = {
    resolutionRef: "GENESIS-DEVICE-RESOLUTION:abc123",
    deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
    bindingRef: "GENESIS-DEVICE-BINDING-001",
    estateRef: "GENESIS-ESTATE-VOI-001",
    locationRef: "GENESIS-LOCATION-ALPHA-001",
    runtimeInstanceRef: "GENESIS-INSTANCE-ALPHA-001",
    state: "ACTIVE" as const,
    assuranceLevel: "L3" as const,
    evidenceRefs: ["RIVER-DEVICE-ATTESTATION-001"],
    attestationRef: "GENESIS-DEVICE-ATTESTATION-001",
    resolvedAt: "2026-09-10T05:20:00Z",
    validUntil: "2026-09-10T06:20:00Z",
  };

  it("binds a resolved Genesis device to the client plane", () => {
    const plane = bootstrapPlane();
    const context = plane.bindGenesisDevice("CLIENT-VOI-001", genesisResolution);
    expect(context.deviceRef).toBe("GENESIS-DEVICE-ALPHA-LG-001");
    expect(plane.readiness("CLIENT-VOI-001").deviceCount).toBe(1);
  });

  it("rejects a device resolution outside the client estate", () => {
    const plane = bootstrapPlane();
    expect(() =>
      plane.bindGenesisDevice("CLIENT-VOI-001", {
        ...genesisResolution,
        estateRef: "GENESIS-ESTATE-OTHER-001",
      }),
    ).toThrow("SYNNERGYZE_GENESIS_DEVICE_ESTATE_MISMATCH");
  });
});
