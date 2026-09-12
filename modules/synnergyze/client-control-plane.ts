import type { GenesisDeviceResolutionV1 } from "../genesis-node-builder/device-registry.ts";
import {
  resolveGenesisDeviceContextV1,
  type ResolvedGenesisDeviceContextV1,
} from "./genesis-device-bridge.ts";

export interface SynnergyzeClientRegistrationInputV1 {
  clientRef: string;
  contractRef: string;
  genesisEstateRef: string;
}

export interface SynnergyzeClientBootstrapV1 extends SynnergyzeClientRegistrationInputV1 {
  state: "REGISTERED";
  wardenBinding: "FIT_QUALIFIED";
  executable: false;
}

export interface SynnergyzeSystemAdmissionInputV1 {
  systemRef: string;
  clientRef: string;
  genesisEstateRef: string;
  genesisSystemRef: string;
}

export interface SynnergyzeSystemAdmissionV1 extends SynnergyzeSystemAdmissionInputV1 {
  state: "ADMITTED";
}

export type SynnergyzeCapabilityModeV1 = "READ" | "WRITE" | "EXECUTE";

export interface SynnergyzeCapabilityDeclarationInputV1 {
  capabilityRef: string;
  systemRef: string;
  action: string;
  mode: SynnergyzeCapabilityModeV1;
}

export interface SynnergyzeCapabilityDeclarationV1
  extends SynnergyzeCapabilityDeclarationInputV1 {
  clientRef: string;
  state: "DECLARED";
}

export interface SynnergyzeWorkflowContractInputV1 {
  workflowRef: string;
  clientRef: string;
  capabilityRefs: readonly string[];
}

export interface SynnergyzeWorkflowContractV1
  extends SynnergyzeWorkflowContractInputV1 {
  state: "CONTRACTED";
  executable: false;
}

export interface SynnergyzeClientReadinessV1 {
  clientRef: string;
  genesisBinding: "BOUND";
  synnergyzeState: "READY";
  wardenBinding: "FIT_QUALIFIED";
  executionState: "BLOCKED_RUNTIME_ACTIVATION";
  systemCount: number;
  capabilityCount: number;
  workflowCount: number;
  deviceCount: number;
}

export class InMemorySynnergyzeClientControlPlaneV1 {
  private readonly clients = new Map<string, SynnergyzeClientBootstrapV1>();
  private readonly systems = new Map<string, SynnergyzeSystemAdmissionV1>();
  private readonly capabilities = new Map<string, SynnergyzeCapabilityDeclarationV1>();
  private readonly workflows = new Map<string, SynnergyzeWorkflowContractV1>();
  private readonly devices = new Map<string, ResolvedGenesisDeviceContextV1>();

  registerClient(input: SynnergyzeClientRegistrationInputV1): SynnergyzeClientBootstrapV1 {
    if (this.clients.has(input.clientRef)) throw new Error("synnergyze_client_ref_conflict");
    if (!input.genesisEstateRef.startsWith("GENESIS-")) {
      throw new Error("synnergyze_genesis_estate_ref_required");
    }

    const record: SynnergyzeClientBootstrapV1 = {
      ...input,
      state: "REGISTERED",
      wardenBinding: "FIT_QUALIFIED",
      executable: false,
    };
    this.clients.set(record.clientRef, record);
    return { ...record };
  }

  admitSystem(input: SynnergyzeSystemAdmissionInputV1): SynnergyzeSystemAdmissionV1 {
    if (this.systems.has(input.systemRef)) throw new Error("synnergyze_system_ref_conflict");
    const client = this.requireClient(input.clientRef);
    if (input.genesisEstateRef !== client.genesisEstateRef) {
      throw new Error("synnergyze_genesis_estate_mismatch");
    }

    if (!input.genesisSystemRef.startsWith("GENESIS-")) {
      throw new Error("synnergyze_genesis_system_ref_required");
    }
    const record: SynnergyzeSystemAdmissionV1 = { ...input, state: "ADMITTED" };
    this.systems.set(record.systemRef, record);
    return { ...record };
  }

  declareCapability(
    input: SynnergyzeCapabilityDeclarationInputV1,
  ): SynnergyzeCapabilityDeclarationV1 {
    if (this.capabilities.has(input.capabilityRef)) {
      throw new Error("synnergyze_capability_ref_conflict");
    }
    const system = this.requireSystem(input.systemRef);
    const record: SynnergyzeCapabilityDeclarationV1 = {
      ...input,
      clientRef: system.clientRef,
      state: "DECLARED",
    };
    this.capabilities.set(record.capabilityRef, record);
    return { ...record };
  }

  contractWorkflow(input: SynnergyzeWorkflowContractInputV1): SynnergyzeWorkflowContractV1 {
    if (this.workflows.has(input.workflowRef)) {
      throw new Error("synnergyze_workflow_ref_conflict");
    }
    this.requireClient(input.clientRef);

    for (const capabilityRef of input.capabilityRefs) {
      const capability = this.capabilities.get(capabilityRef);
      if (!capability) {
        throw new Error(`synnergyze_workflow_capability_not_declared:${capabilityRef}`);
      }
      if (capability.clientRef !== input.clientRef) {
        throw new Error(`synnergyze_workflow_capability_client_mismatch:${capabilityRef}`);
      }
    }

    const record: SynnergyzeWorkflowContractV1 = {
      ...input,
      capabilityRefs: [...input.capabilityRefs],
      state: "CONTRACTED",
      executable: false,
    };
    this.workflows.set(record.workflowRef, record);
    return { ...record, capabilityRefs: [...record.capabilityRefs] };
  }

  bindGenesisDevice(
    clientRef: string,
    resolution: GenesisDeviceResolutionV1,
  ): ResolvedGenesisDeviceContextV1 {
    const client = this.requireClient(clientRef);
    const context = resolveGenesisDeviceContextV1(resolution, client.genesisEstateRef);
    const existing = this.devices.get(context.deviceRef);
    if (existing && existing.genesisResolutionRef !== context.genesisResolutionRef) {
      throw new Error("synnergyze_genesis_device_resolution_conflict");
    }
    this.devices.set(context.deviceRef, context);
    return { ...context, sourceEvidenceRefs: [...context.sourceEvidenceRefs] };
  }

  readiness(clientRef: string): SynnergyzeClientReadinessV1 {
    this.requireClient(clientRef);
    return {
      clientRef,
      genesisBinding: "BOUND",
      synnergyzeState: "READY",
      wardenBinding: "FIT_QUALIFIED",
      executionState: "BLOCKED_RUNTIME_ACTIVATION",
      systemCount: [...this.systems.values()].filter((item) => item.clientRef === clientRef).length,
      capabilityCount: [...this.capabilities.values()].filter(
        (item) => item.clientRef === clientRef,
      ).length,
      workflowCount: [...this.workflows.values()].filter(
        (item) => item.clientRef === clientRef,
      ).length,
      deviceCount: [...this.devices.values()].filter(
        (item) => item.estateRef === this.clients.get(clientRef)?.genesisEstateRef,
      ).length,
    };
  }

  private requireClient(clientRef: string): SynnergyzeClientBootstrapV1 {
    const client = this.clients.get(clientRef);
    if (!client) throw new Error(`synnergyze_client_not_registered:${clientRef}`);
    return client;
  }

  private requireSystem(systemRef: string): SynnergyzeSystemAdmissionV1 {
    const system = this.systems.get(systemRef);
    if (!system) throw new Error(`synnergyze_system_not_admitted:${systemRef}`);
    return system;
  }
}
