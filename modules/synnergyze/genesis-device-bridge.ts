import type {
  GenesisDeviceAssuranceLevelV1,
  GenesisDeviceResolutionV1,
} from "../genesis-node-builder/device-registry.ts";

export interface ResolvedGenesisDeviceContextV1 {
  genesisResolutionRef: string;
  deviceRef: string;
  estateRef: string;
  locationRef: string;
  runtimeInstanceRef?: string;
  state: "ACTIVE";
  assuranceLevel: GenesisDeviceAssuranceLevelV1;
  sourceEvidenceRefs: readonly string[];
  attestationRef: string;
  resolvedAt: string;
  validUntil?: string;
}

export function resolveGenesisDeviceContextV1(
  resolution: GenesisDeviceResolutionV1,
  expectedEstateRef: string,
): ResolvedGenesisDeviceContextV1 {
  if (!resolution.resolutionRef.startsWith("GENESIS-DEVICE-RESOLUTION:")) {
    throw new Error("SYNNERGYZE_GENESIS_DEVICE_RESOLUTION_REQUIRED");
  }
  if (resolution.estateRef !== expectedEstateRef) {
    throw new Error("SYNNERGYZE_GENESIS_DEVICE_ESTATE_MISMATCH");
  }

  if (resolution.state !== "ACTIVE") {
    throw new Error("SYNNERGYZE_GENESIS_DEVICE_NOT_ACTIVE");
  }
  if (resolution.evidenceRefs.length === 0) {
    throw new Error("SYNNERGYZE_GENESIS_DEVICE_EVIDENCE_REQUIRED");
  }

  return {
    genesisResolutionRef: resolution.resolutionRef,
    deviceRef: resolution.deviceRef,
    estateRef: resolution.estateRef,
    locationRef: resolution.locationRef,
    runtimeInstanceRef: resolution.runtimeInstanceRef,
    state: "ACTIVE",
    assuranceLevel: resolution.assuranceLevel,
    sourceEvidenceRefs: [...resolution.evidenceRefs],
    attestationRef: resolution.attestationRef,
    resolvedAt: resolution.resolvedAt,
    validUntil: resolution.validUntil,
  };
}
