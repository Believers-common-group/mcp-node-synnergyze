import { createHash } from "node:crypto";

export type GenesisDeviceClassV1 =
  | "HOST"
  | "PHONE"
  | "TABLET"
  | "SCANNER"
  | "KIOSK"
  | "GATEWAY"
  | "PLC"
  | "SENSOR"
  | "VEHICLE_ECU"
  | "OTHER";

export type GenesisDeviceLifecycleV1 =
  | "DISCOVERED"
  | "REGISTERED"
  | "BOUND"
  | "ATTESTED"
  | "ACTIVE"
  | "SUSPENDED"
  | "QUARANTINED"
  | "REVOKED"
  | "RETIRED";

export type GenesisDeviceAssuranceLevelV1 = "L0" | "L1" | "L2" | "L3" | "L4";

export interface GenesisDeviceRegistrationInputV1 {
  deviceRef: string;
  deviceClass: GenesisDeviceClassV1;
  machineAssertionRef: string;
  registeredAt: string;
  sourceEvidenceRefs: readonly string[];
}

export interface GenesisDeviceRecordV1 extends GenesisDeviceRegistrationInputV1 {
  lifecycle: GenesisDeviceLifecycleV1;
}

export interface GenesisDeviceBindingV1 {
  bindingRef: string;
  deviceRef: string;
  estateRef: string;
  locationRef: string;
  runtimeInstanceRef?: string;
  boundAt: string;
}

export interface GenesisDeviceAttestationV1 {
  attestationRef: string;
  deviceRef: string;
  assuranceLevel: GenesisDeviceAssuranceLevelV1;
  evidenceRefs: readonly string[];
  attestedAt: string;
  validUntil?: string;
}

export interface GenesisDeviceResolutionRequestV1 {
  deviceRef: string;
  estateRef: string;
  resolvedAt: string;
}

export interface GenesisDeviceResolutionV1 {
  resolutionRef: string;
  deviceRef: string;
  bindingRef: string;
  estateRef: string;
  locationRef: string;
  runtimeInstanceRef?: string;
  state: "ACTIVE";
  assuranceLevel: GenesisDeviceAssuranceLevelV1;
  evidenceRefs: readonly string[];
  attestationRef: string;
  resolvedAt: string;
  validUntil?: string;
}

function requireInstant(value: string, code: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(code);
  return parsed;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export class InMemoryGenesisDeviceRegistryV1 {
  private readonly devices = new Map<string, GenesisDeviceRecordV1>();
  private readonly bindings = new Map<string, GenesisDeviceBindingV1>();
  private readonly attestations = new Map<string, GenesisDeviceAttestationV1>();

  registerDevice(input: GenesisDeviceRegistrationInputV1): GenesisDeviceRecordV1 {
    if (!input.deviceRef.startsWith("GENESIS-DEVICE-")) {
      throw new Error("GENESIS_DEVICE_REF_REQUIRED");
    }
    if (this.devices.has(input.deviceRef)) throw new Error("GENESIS_DEVICE_REF_CONFLICT");
    requireInstant(input.registeredAt, "GENESIS_DEVICE_REGISTERED_AT_INVALID");

    const record: GenesisDeviceRecordV1 = {
      ...input,
      sourceEvidenceRefs: [...input.sourceEvidenceRefs],
      lifecycle: "REGISTERED",
    };
    this.devices.set(record.deviceRef, record);
    return { ...record, sourceEvidenceRefs: [...record.sourceEvidenceRefs] };
  }

  bindDevice(binding: GenesisDeviceBindingV1): GenesisDeviceBindingV1 {
    const device = this.requireDevice(binding.deviceRef);
    if (device.lifecycle !== "REGISTERED") throw new Error("GENESIS_DEVICE_BIND_STATE_INVALID");
    if (!binding.estateRef.startsWith("GENESIS-ESTATE-")) throw new Error("GENESIS_ESTATE_REF_REQUIRED");
    if (!binding.locationRef.startsWith("GENESIS-LOCATION-")) throw new Error("GENESIS_LOCATION_REF_REQUIRED");
    if (this.bindings.has(binding.deviceRef)) throw new Error("GENESIS_DEVICE_ALREADY_BOUND");
    requireInstant(binding.boundAt, "GENESIS_DEVICE_BOUND_AT_INVALID");

    const stored = { ...binding };
    this.bindings.set(binding.deviceRef, stored);
    this.devices.set(device.deviceRef, { ...device, lifecycle: "BOUND" });
    return { ...stored };
  }

  attestDevice(attestation: GenesisDeviceAttestationV1): GenesisDeviceAttestationV1 {
    const device = this.requireDevice(attestation.deviceRef);
    if (device.lifecycle !== "BOUND" && device.lifecycle !== "ATTESTED") {
      throw new Error("GENESIS_DEVICE_ATTEST_STATE_INVALID");
    }
    if (attestation.evidenceRefs.length === 0) {
      throw new Error("GENESIS_DEVICE_ATTESTATION_EVIDENCE_REQUIRED");
    }
    const attestedAt = requireInstant(attestation.attestedAt, "GENESIS_DEVICE_ATTESTED_AT_INVALID");
    if (attestation.validUntil) {
      const validUntil = requireInstant(
        attestation.validUntil,
        "GENESIS_DEVICE_ATTESTATION_VALID_UNTIL_INVALID",
      );
      if (validUntil < attestedAt) throw new Error("GENESIS_DEVICE_ATTESTATION_WINDOW_INVALID");
    }

    const stored = { ...attestation, evidenceRefs: [...attestation.evidenceRefs] };
    this.attestations.set(attestation.deviceRef, stored);
    this.devices.set(device.deviceRef, { ...device, lifecycle: "ATTESTED" });
    return { ...stored, evidenceRefs: [...stored.evidenceRefs] };
  }

  activateDevice(deviceRef: string, activatedAt: string): GenesisDeviceRecordV1 {
    const device = this.requireDevice(deviceRef);
    if (device.lifecycle !== "ATTESTED") throw new Error("GENESIS_DEVICE_ACTIVATION_REQUIRES_ATTESTATION");
    requireInstant(activatedAt, "GENESIS_DEVICE_ACTIVATED_AT_INVALID");
    const active: GenesisDeviceRecordV1 = { ...device, lifecycle: "ACTIVE" };
    this.devices.set(deviceRef, active);
    return { ...active, sourceEvidenceRefs: [...active.sourceEvidenceRefs] };
  }

  resolveDevice(request: GenesisDeviceResolutionRequestV1): GenesisDeviceResolutionV1 {
    const device = this.requireDevice(request.deviceRef);
    if (device.lifecycle !== "ACTIVE") throw new Error("GENESIS_DEVICE_NOT_ACTIVE");

    const binding = this.bindings.get(request.deviceRef);
    if (!binding) throw new Error("GENESIS_DEVICE_BINDING_REQUIRED");
    if (binding.estateRef !== request.estateRef) throw new Error("GENESIS_DEVICE_ESTATE_MISMATCH");

    const attestation = this.attestations.get(request.deviceRef);
    if (!attestation) throw new Error("GENESIS_DEVICE_ATTESTATION_REQUIRED");
    const resolvedAt = requireInstant(request.resolvedAt, "GENESIS_DEVICE_RESOLVED_AT_INVALID");
    const attestedAt = requireInstant(attestation.attestedAt, "GENESIS_DEVICE_ATTESTED_AT_INVALID");
    if (attestedAt > resolvedAt) throw new Error("GENESIS_DEVICE_ATTESTATION_FROM_FUTURE");
    if (attestation.validUntil) {
      const validUntil = requireInstant(
        attestation.validUntil,
        "GENESIS_DEVICE_ATTESTATION_VALID_UNTIL_INVALID",
      );
      if (resolvedAt > validUntil) throw new Error("GENESIS_DEVICE_ATTESTATION_EXPIRED");
    }

    const identity = digest(
      [request.deviceRef, binding.bindingRef, attestation.attestationRef, request.resolvedAt].join("|"),
    ).slice(0, 24);
    return {
      resolutionRef: `GENESIS-DEVICE-RESOLUTION:${identity}`,
      deviceRef: request.deviceRef,
      bindingRef: binding.bindingRef,
      estateRef: binding.estateRef,
      locationRef: binding.locationRef,
      runtimeInstanceRef: binding.runtimeInstanceRef,
      state: "ACTIVE",
      assuranceLevel: attestation.assuranceLevel,
      evidenceRefs: [...attestation.evidenceRefs],
      attestationRef: attestation.attestationRef,
      resolvedAt: request.resolvedAt,
      validUntil: attestation.validUntil,
    };
  }

  private requireDevice(deviceRef: string): GenesisDeviceRecordV1 {
    const device = this.devices.get(deviceRef);
    if (!device) throw new Error(`GENESIS_DEVICE_NOT_FOUND:${deviceRef}`);
    return device;
  }
}
