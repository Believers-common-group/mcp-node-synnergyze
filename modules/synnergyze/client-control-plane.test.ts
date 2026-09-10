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
    expect(bindings).toContain("warden_binding: UNBOUND");
  });
});
