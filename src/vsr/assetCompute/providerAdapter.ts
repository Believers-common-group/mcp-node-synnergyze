import type {
  ProviderAdapter,
  ProviderExecutionRequest,
  ProviderExecutionResult,
} from "./types.ts";

type ProviderMode = "SUCCESS" | "PROVIDER_FAILURE";

interface DeterministicProviderAdapterConfig {
  mode: ProviderMode;
  actualCost?: number;
  outputRef?: string;
}

export class DeterministicProviderAdapter implements ProviderAdapter {
  private readonly config: DeterministicProviderAdapterConfig;

  constructor(config: DeterministicProviderAdapterConfig) {
    this.config = config;
  }

  async execute(input: ProviderExecutionRequest): Promise<ProviderExecutionResult> {
    if (input.executionId !== input.capability.executionId) {
      throw new Error("PROVIDER_CAPABILITY_EXECUTION_MISMATCH");
    }

    if (this.config.mode === "PROVIDER_FAILURE") {
      throw new Error("PROVIDER_EXECUTION_FAILED");
    }

    const actualCost = this.config.actualCost ?? 0;
    if (actualCost > input.capability.maxCost) {
      throw new Error("PROVIDER_COST_EXCEEDS_CAPABILITY");
    }

    const outputRef = this.config.outputRef;
    if (!outputRef) {
      throw new Error("PROVIDER_OUTPUT_NOT_OBSERVED");
    }

    return {
      receipt: {
        provider: "SIMULATED",
        providerExecutionId: `SIM-${input.executionId}`,
        executionId: input.executionId,
        status: "COMPLETED",
        actualCost,
        currency: input.capability.currency,
      },
      observation: {
        executionId: input.executionId,
        outputRef,
        observed: true,
      },
    };
  }
}
