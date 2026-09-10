import { describe, expect, it } from "vitest";

import type { GenesisDeviceResolutionV1 } from "../genesis-node-builder/device-registry.ts";
import { resolveGenesisDeviceContextV1 } from "./genesis-device-bridge.ts";

function resolution(): GenesisDeviceResolutionV1 {
  return {
    resolutionRef: "GENESIS-DEVICE-RESOLUTION:abc123",
    deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
    bindingRef: "GENESIS-DEVICE-BINDING-001",
    estateRef: "GENESIS-ESTATE-001",
    locationRef: "GENESIS-LOCATION-ALPHA-001",
    runtimeInstanceRef: "GENESIS-INSTANCE-ALPHA-001",
    state: "ACTIVE",
    assuranceLevel: "L3",
    evidenceRefs: ["RIVER-DEVICE-ATTESTATION-001"],
    attestationRef: "GENESIS-DEVICE-ATTESTATION-001",
    resolvedAt: "2026-09-10T05:20:00Z",
    validUntil: "2026-09-10T06:20:00Z",
  };
}

describe("resolveGenesisDeviceContextV1", () => {
  it("preserves the canonical Genesis device resolution for Synnergyze", () => {
    const context = resolveGenesisDeviceContextV1(resolution(), "GENESIS-ESTATE-001");
    expect(context.genesisResolutionRef).toBe("GENESIS-DEVICE-RESOLUTION:abc123");
    expect(context.deviceRef).toBe("GENESIS-DEVICE-ALPHA-LG-001");
    expect(context.assuranceLevel).toBe("L3");
    expect(context.sourceEvidenceRefs).toEqual(["RIVER-DEVICE-ATTESTATION-001"]);
  });

  it("rejects a Genesis resolution from another estate", () => {
    expect(() =>
      resolveGenesisDeviceContextV1(resolution(), "GENESIS-ESTATE-OTHER-001"),
    ).toThrow("SYNNERGYZE_GENESIS_DEVICE_ESTATE_MISMATCH");
  });

  it("rejects a malformed Genesis resolution reference", () => {
    expect(() =>
      resolveGenesisDeviceContextV1(
        { ...resolution(), resolutionRef: "DEVICE-RESOLUTION:abc123" },
        "GENESIS-ESTATE-001",
      ),
    ).toThrow("SYNNERGYZE_GENESIS_DEVICE_RESOLUTION_REQUIRED");
  });
});
