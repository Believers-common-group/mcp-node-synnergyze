import { createHash } from "node:crypto";

import type { SynnergyzeExecutionReceiptV1 } from "../../synnergyze/contracts.ts";
import type {
  ControlledExecutionGateV1,
  ControlledExecutionRequestV1,
  SyntheticCapabilityAdapterInputV1,
  SyntheticCapabilityAdapterResultV1,
  SyntheticCapabilityAdapterV1,
} from "../../synnergyze/execution-gate.ts";
import type {
  AuthorizedProviderExecutionV1,
  ProviderAuthorityGateInputV1,
  ProviderExceptionV1,
  ProviderRecoveryActionV1,
} from "../contracts.ts";
import {
  determineProviderRecoveryV1,
  executeProviderControlledExecutionV1,
} from "../runtime.ts";
import type { GoogleReferenceAdapterV1 } from "./adapter.ts";
import type {
  GoogleProviderCallReceiptV1,
  GoogleRuntimeIdentityContextV1,
} from "./contracts.ts";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export class GoogleProviderDispatchAdapterV1 implements SyntheticCapabilityAdapterV1 {
  readonly adapterRef: string;

  constructor(readonly capabilityRef: string) {
    if (!capabilityRef.trim()) throw new Error("google_dispatch_capability_required");
    this.adapterRef = `GOOGLE-PROVIDER-DISPATCH:${digest(capabilityRef).slice(0, 24)}`;
  }

  execute(input: SyntheticCapabilityAdapterInputV1): SyntheticCapabilityAdapterResultV1 {
    if (input.action.capabilityRef !== this.capabilityRef) {
      throw new Error("google_dispatch_capability_mismatch");
    }
    if (input.reservation.actionRef !== input.action.actionRef) {
      throw new Error("google_dispatch_reservation_action_mismatch");
    }
    const identity = digest(
      [
        input.action.actionRef,
        input.reservation.reservationRef,
        input.action.correlationId,
        this.adapterRef,
      ].join("|"),
    ).slice(0, 24);
    return { adapterResultRef: `GOOGLE-PROVIDER-DISPATCH-RESULT:${identity}` };
  }
}

export interface GoogleBoundProviderCallReceiptV1 extends GoogleProviderCallReceiptV1 {
  executionReceiptRef: string;
}

export type GoogleControlledExecutionResultV1 =
  | {
      state: "PROVIDER_SUCCEEDED";
      authorization: AuthorizedProviderExecutionV1;
      receipt: SynnergyzeExecutionReceiptV1;
      providerCall: GoogleBoundProviderCallReceiptV1;
      idempotentReplay: boolean;
      providerEvidenceReplay: boolean;
    }
  | {
      state: "PROVIDER_EXCEPTION";
      authorization: AuthorizedProviderExecutionV1;
      receipt: SynnergyzeExecutionReceiptV1;
      exception: ProviderExceptionV1;
      recoveryAction: ProviderRecoveryActionV1;
      idempotentReplay: boolean;
      providerEvidenceReplay: boolean;
    };

type StoredProviderEvidenceV1 =
  | {
      requestHash: string;
      state: "PROVIDER_SUCCEEDED";
      providerCall: GoogleBoundProviderCallReceiptV1;
    }
  | {
      requestHash: string;
      state: "PROVIDER_EXCEPTION";
      exception: ProviderExceptionV1;
      recoveryAction: ProviderRecoveryActionV1;
    };

function cloneProviderCall(
  value: GoogleBoundProviderCallReceiptV1,
): GoogleBoundProviderCallReceiptV1 {
  return { ...value };
}

function cloneException(value: ProviderExceptionV1): ProviderExceptionV1 {
  return { ...value };
}

export class GoogleControlledExecutionServiceV1 {
  private readonly evidenceByExecutionReceiptRef = new Map<string, StoredProviderEvidenceV1>();

  constructor(
    private readonly gate: ControlledExecutionGateV1,
    private readonly google: GoogleReferenceAdapterV1,
  ) {}

  async execute(input: {
    providerAuthority: ProviderAuthorityGateInputV1;
    controlledExecution: ControlledExecutionRequestV1;
    identity: GoogleRuntimeIdentityContextV1;
    prompt: string;
    completedAt: string;
  }): Promise<GoogleControlledExecutionResultV1> {
    const preflight = this.google.preflight({
      authority: input.providerAuthority,
      identity: input.identity,
      prompt: input.prompt,
      completedAt: input.completedAt,
    });

    const controlled = executeProviderControlledExecutionV1(this.gate, {
      providerAuthority: input.providerAuthority,
      controlledExecution: input.controlledExecution,
    });
    const receipt = controlled.receipt;
    const existing = this.evidenceByExecutionReceiptRef.get(receipt.receiptRef);

    if (existing) {
      if (existing.requestHash !== preflight.requestHash) {
        throw new Error("google_provider_evidence_replay_conflict");
      }
      if (existing.state === "PROVIDER_SUCCEEDED") {
        return {
          state: "PROVIDER_SUCCEEDED",
          authorization: controlled.authorization,
          receipt,
          providerCall: cloneProviderCall(existing.providerCall),
          idempotentReplay: receipt.idempotentReplay,
          providerEvidenceReplay: true,
        };
      }
      return {
        state: "PROVIDER_EXCEPTION",
        authorization: controlled.authorization,
        receipt,
        exception: cloneException(existing.exception),
        recoveryAction: existing.recoveryAction,
        idempotentReplay: receipt.idempotentReplay,
        providerEvidenceReplay: true,
      };
    }

    const provider = await this.google.execute({
      authority: input.providerAuthority,
      identity: input.identity,
      prompt: input.prompt,
      completedAt: input.completedAt,
    });

    if (provider.state === "SUCCEEDED") {
      const providerCall: GoogleBoundProviderCallReceiptV1 = {
        ...provider.value,
        executionReceiptRef: receipt.receiptRef,
      };
      this.evidenceByExecutionReceiptRef.set(receipt.receiptRef, {
        requestHash: preflight.requestHash,
        state: "PROVIDER_SUCCEEDED",
        providerCall,
      });
      return {
        state: "PROVIDER_SUCCEEDED",
        authorization: controlled.authorization,
        receipt,
        providerCall: cloneProviderCall(providerCall),
        idempotentReplay: receipt.idempotentReplay,
        providerEvidenceReplay: false,
      };
    }

    const exception: ProviderExceptionV1 = {
      ...provider.exception,
      executionReceiptRef: receipt.receiptRef,
    };
    const recoveryAction = determineProviderRecoveryV1(exception);
    this.evidenceByExecutionReceiptRef.set(receipt.receiptRef, {
      requestHash: preflight.requestHash,
      state: "PROVIDER_EXCEPTION",
      exception,
      recoveryAction,
    });
    return {
      state: "PROVIDER_EXCEPTION",
      authorization: controlled.authorization,
      receipt,
      exception: cloneException(exception),
      recoveryAction,
      idempotentReplay: receipt.idempotentReplay,
      providerEvidenceReplay: false,
    };
  }
}
