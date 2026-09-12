import { describe, expect, it } from "vitest";

import { InMemoryGenesisDeviceRegistryV1 } from "./device-registry.ts";

const T0 = "2026-09-10T05:00:00Z";
const T1 = "2026-09-10T05:05:00Z";
const T2 = "2026-09-10T05:10:00Z";
const T3 = "2026-09-10T05:15:00Z";

function registerBoundDevice() {
  const registry = new InMemoryGenesisDeviceRegistryV1();
  registry.registerDevice({
    deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
    deviceClass: "HOST",
    machineAssertionRef: "MACHINE:DESKTOP-M13TEPQ",
    registeredAt: T0,
    sourceEvidenceRefs: ["EVIDENCE:GENESIS:DEVICE:001"],
  });
  registry.bindDevice({
    bindingRef: "GENESIS-DEVICE-BINDING-001",
    deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
    estateRef: "GENESIS-ESTATE-001",
    locationRef: "GENESIS-LOCATION-ALPHA-001",
    runtimeInstanceRef: "GENESIS-INSTANCE-ALPHA-001",
    boundAt: T1,
  });
  return registry;
}

describe("InMemoryGenesisDeviceRegistryV1", () => {
  it("resolves only an active Genesis-bound device with a current attestation", () => {
    const registry = registerBoundDevice();
    registry.attestDevice({
      attestationRef: "GENESIS-DEVICE-ATTESTATION-001",
      deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
      assuranceLevel: "L3",
      evidenceRefs: ["RIVER-DEVICE-ATTESTATION-001"],
      attestedAt: T2,
      validUntil: "2026-09-10T06:10:00Z",
    });
    registry.activateDevice("GENESIS-DEVICE-ALPHA-LG-001", T3);

    const resolution = registry.resolveDevice({
      deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
      estateRef: "GENESIS-ESTATE-001",
      resolvedAt: "2026-09-10T05:20:00Z",
    });

    expect(resolution.state).toBe("ACTIVE");
    expect(resolution.assuranceLevel).toBe("L3");
    expect(resolution.evidenceRefs).toEqual(["RIVER-DEVICE-ATTESTATION-001"]);
    expect(resolution.bindingRef).toBe("GENESIS-DEVICE-BINDING-001");
  });

  it("fails closed before the device is active", () => {
    const registry = registerBoundDevice();
    expect(() =>
      registry.resolveDevice({
        deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
        estateRef: "GENESIS-ESTATE-001",
        resolvedAt: T2,
      }),
    ).toThrow("GENESIS_DEVICE_NOT_ACTIVE");
  });

  it("rejects resolution through another estate", () => {
    const registry = registerBoundDevice();
    registry.attestDevice({
      attestationRef: "GENESIS-DEVICE-ATTESTATION-002",
      deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
      assuranceLevel: "L2",
      evidenceRefs: ["RIVER-DEVICE-ATTESTATION-002"],
      attestedAt: T2,
      validUntil: "2026-09-10T06:10:00Z",
    });
    registry.activateDevice("GENESIS-DEVICE-ALPHA-LG-001", T3);

    expect(() =>
      registry.resolveDevice({
        deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
        estateRef: "GENESIS-ESTATE-OTHER-001",
        resolvedAt: "2026-09-10T05:20:00Z",
      }),
    ).toThrow("GENESIS_DEVICE_ESTATE_MISMATCH");
  });

  it("rejects an expired attestation", () => {
    const registry = registerBoundDevice();
    registry.attestDevice({
      attestationRef: "GENESIS-DEVICE-ATTESTATION-003",
      deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
      assuranceLevel: "L1",
      evidenceRefs: ["RIVER-DEVICE-ATTESTATION-003"],
      attestedAt: T2,
      validUntil: T3,
    });
    registry.activateDevice("GENESIS-DEVICE-ALPHA-LG-001", T3);

    expect(() =>
      registry.resolveDevice({
        deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
        estateRef: "GENESIS-ESTATE-001",
        resolvedAt: "2026-09-10T05:20:00Z",
      }),
    ).toThrow("GENESIS_DEVICE_ATTESTATION_EXPIRED");
  });

  it("rejects non-canonical Genesis device references", () => {
    const registry = new InMemoryGenesisDeviceRegistryV1();
    expect(() =>
      registry.registerDevice({
        deviceRef: "DEVICE-001",
        deviceClass: "HOST",
        machineAssertionRef: "MACHINE:LOCAL",
        registeredAt: T0,
        sourceEvidenceRefs: [],
      }),
    ).toThrow("GENESIS_DEVICE_REF_REQUIRED");
  });
});
