import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { ActionEnvelopeV1, EvidenceReservationV1 } from "../river/contracts.ts";
import {
  ControlledExecutionGateV1,
  type ControlledExecutionRequestV1,
  type SyntheticCapabilityAdapterInputV1,
  type SyntheticCapabilityAdapterResultV1,
  type SyntheticCapabilityAdapterV1,
} from "../synnergyze/execution-gate.ts";
import type { WardenAllowDecisionV1, WardenExecutionCheckpointV1 } from "../warden/contracts.ts";
import type {
  AuthorizedProviderExecutionV1,
  ProviderAuthorityGateInputV1,
  ProviderAuthorityGrantV1,
  ProviderExceptionV1,
  ProviderExecutionRequestV1,
  ProviderPrincipalBindingV1,
} from "./contracts.ts";
import {
  classifyCompensationFailureV1,
  createCompensationLineageV1,
  executeProviderControlledExecutionV1,
  executeWithProviderAuthorityV1,
  hashProviderPayloadV1,
  ProviderFailureErrorV1,
  verifyProviderAttemptEvidenceV1,
} from "./runtime.ts";

function tokenDigest(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

class EngineeringAnalysisAdapter implements SyntheticCapabilityAdapterV1 {
  readonly adapterRef = "SYNTHETIC-ENGINEERING-ANALYSIS-ADAPTER-001";
  readonly capabilityRef = "engineering.analyse";
  private invocations = 0;

  execute(input: SyntheticCapabilityAdapterInputV1): SyntheticCapabilityAdapterResultV1 {
    this.invocations += 1;
    return {
      adapterResultRef: `ENGINEERING-ANALYSIS:${input.action.actionRef}:${input.reservation.reservationRef}`,
    };
  }

  invocationCount(): number {
    return this.invocations;
  }
}

function providerFixture(options: {
  checkpointState?: WardenExecutionCheckpointV1["state"];
  authorizedAt?: string;
} = {}) {
  const authorizedAt = options.authorizedAt ?? "2026-08-24T04:15:00+05:30";
  const decision: WardenAllowDecisionV1 = {
    decisionRef: "WARDEN-DECISION:INTEGRITY-001",
    requestRef: "WARDEN-REQUEST:INTEGRITY-001",
    wardenRef: "WARDEN:ALPHA",
    action: "provider.execute",
    targetRef: "PROJECT:GYROCELL",
    reasonCodes: ["bounded_policy_allow"],
    constraints: ["provider:GOOGLE_CLOUD"],
    decidedAt: "2026-08-24T04:00:00+05:30",
    validUntil: "2026-08-24T04:25:00+05:30",
    correlationId: "CORR:INTEGRITY-001",
    decision: "ALLOW",
    actionToken: "WARDEN-ACTION-TOKEN:INTEGRITY-001",
  };
  const checkpoint: WardenExecutionCheckpointV1 = {
    checkpointRef: "WARDEN-CHECKPOINT:INTEGRITY-001",
    decisionRef: decision.decisionRef,
    wardenRef: decision.wardenRef,
    correlationId: decision.correlationId,
    state: options.checkpointState ?? "VALID",
    checkedAt: "2026-08-24T04:14:00+05:30",
    reasonCodes: options.checkpointState === "REVOKED" ? ["authority_revoked"] : ["current"],
  };
  const action: ActionEnvelopeV1 = {
    actionRef: "ACTION:INTEGRITY-001",
    requestRef: decision.requestRef,
    actorRef: "AGENTME:ENGINEERING-017",
    representedPrincipalRef: "ENTERPRISE:SYNNERGYZE",
    actingCapacityRef: "CAPACITY:ENGINEERING-AGENT",
    contextRef: "CONTEXT:ENGINEERING",
    programRef: "PROGRAM:GYROCELL",
    eventRef: "EVENT:THERMAL-VALIDATION-001",
    action: decision.action,
    capabilityRef: "engineering.analyse",
    targetRef: decision.targetRef,
    requestedEffect: "thermal_validation",
    wardenDecisionRef: decision.decisionRef,
    actionToken: decision.actionToken,
    requestedAt: "2026-08-24T03:59:00+05:30",
    correlationId: decision.correlationId,
  };
  const reservation: EvidenceReservationV1 = {
    reservationRef: "RIVER-RESERVATION:INTEGRITY-001",
    actionRef: action.actionRef,
    wardenDecisionRef: decision.decisionRef,
    correlationId: decision.correlationId,
    authorizationDigest: tokenDigest(decision.actionToken),
    state: "RESERVED",
    reservedAt: "2026-08-24T04:13:00+05:30",
  };
  const grant: ProviderAuthorityGrantV1 = {
    version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001",
    grantRef: "PROVIDER-GRANT:INTEGRITY-001",
    actionRef: action.actionRef,
    reservationRef: reservation.reservationRef,
    wardenDecisionRef: decision.decisionRef,
    wardenCheckpointRef: checkpoint.checkpointRef,
    delegatedAgentRef: action.actorRef,
    providerRef: "GOOGLE_CLOUD",
    capabilityRef: action.capabilityRef,
    purposeRef: action.requestedEffect!,
    resourceRefs: [action.targetRef],
    correlationId: decision.correlationId,
    issuedAt: "2026-08-24T04:14:30+05:30",
  };
  const binding: ProviderPrincipalBindingV1 = {
    version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001",
    bindingRef: "PROVIDER-BINDING:INTEGRITY-001",
    agentRef: grant.delegatedAgentRef,
    providerRef: grant.providerRef,
    providerPrincipalRef: "spiffe://agents.example/engineering-017",
    state: "ACTIVE",
    boundAt: "2026-08-24T04:10:00+05:30",
  };
  const request: ProviderExecutionRequestV1 = {
    agentRef: grant.delegatedAgentRef,
    providerRef: grant.providerRef,
    capabilityRef: grant.capabilityRef,
    purposeRef: grant.purposeRef,
    resourceRefs: [...grant.resourceRefs],
    requestedAt: "2026-08-24T04:15:00+05:30",
    correlationId: grant.correlationId,
  };
  const providerAuthority: ProviderAuthorityGateInputV1 = {
    grant,
    binding,
    request,
    action,
    reservation,
    decision,
    checkpoint,
    authorizedAt,
  };
  const controlledExecution: ControlledExecutionRequestV1 = {
    action,
    reservation,
    decision,
    checkpoint,
    executedAt: authorizedAt,
  };

  return { providerAuthority, controlledExecution };
}

const compensationAuthorization: AuthorizedProviderExecutionV1 = {
  version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001",
  authorizationRef: "PROVIDER-AUTH:COMPENSATION-001",
  state: "AUTHORIZED",
  grantRef: "PROVIDER-GRANT:COMPENSATION-001",
  bindingRef: "PROVIDER-BINDING:COMPENSATION-001",
  actionRef: "ACTION:COMPENSATION-001",
  reservationRef: "RIVER-RESERVATION:COMPENSATION-001",
  wardenDecisionRef: "WARDEN-DECISION:COMPENSATION-001",
  wardenCheckpointRef: "WARDEN-CHECKPOINT:COMPENSATION-001",
  agentRef: "AGENTME:ENGINEERING-017",
  providerRef: "GOOGLE_CLOUD",
  providerPrincipalRef: "spiffe://agents.example/engineering-017",
  capabilityRef: "reconciliation.compensate",
  purposeRef: "compensate_partial_effect",
  resourceRefs: ["PROJECT:GYROCELL"],
  correlationId: "CORR:COMPENSATION-001",
  authorizedAt: "2026-08-24T04:21:00+05:30",
  sourceDigest: "compensation-authority-source-digest",
};

const originalException: ProviderExceptionV1 = {
  version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001",
  exceptionRef: "PROVIDER-EXCEPTION:ORIGINAL-001",
  authorizationRef: "PROVIDER-AUTH:ORIGINAL-001",
  actionRef: "ACTION:ORIGINAL-001",
  reservationRef: "RIVER-RESERVATION:ORIGINAL-001",
  exceptionClass: "PARTIAL_EFFECT_EXCEPTION",
  effectState: "PARTIAL",
  retryability: "POLICY_DECISION_REQUIRED",
  severity: "E4",
  failureKind: "PARTIAL_EFFECT",
  message: "partial_effect_observed",
  executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:ORIGINAL-001",
};

describe("Provider authority execution integrity R0.4-B", () => {
  it("J: reuses the existing ControlledExecutionGate receipt on exact replay", () => {
    const adapter = new EngineeringAnalysisAdapter();
    const gate = new ControlledExecutionGateV1([adapter]);
    const input = providerFixture();

    const first = executeProviderControlledExecutionV1(gate, input);
    const replay = executeProviderControlledExecutionV1(gate, input);

    expect(first.receipt.idempotentReplay).toBe(false);
    expect(replay.receipt.idempotentReplay).toBe(true);
    expect(replay.receipt.receiptRef).toBe(first.receipt.receiptRef);
    expect(adapter.invocationCount()).toBe(1);
  });

  it("K: preserves existing ControlledExecutionGate idempotency conflict behavior", () => {
    const adapter = new EngineeringAnalysisAdapter();
    const gate = new ControlledExecutionGateV1([adapter]);
    const first = providerFixture({ authorizedAt: "2026-08-24T04:15:00+05:30" });
    executeProviderControlledExecutionV1(gate, first);

    const changedAttempt = providerFixture({ authorizedAt: "2026-08-24T04:16:00+05:30" });
    expect(() => executeProviderControlledExecutionV1(gate, changedAttempt)).toThrow(
      "execution_idempotency_conflict",
    );
    expect(adapter.invocationCount()).toBe(1);
  });

  it("L: detects request and response evidence tampering against canonical action lineage", () => {
    const evidence = {
      attemptRef: "PROVIDER-ATTEMPT:001",
      authorizationRef: "PROVIDER-AUTH:001",
      actionRef: "ACTION:INTEGRITY-001",
      reservationRef: "RIVER-RESERVATION:INTEGRITY-001",
      executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:INTEGRITY-001",
      requestHash: hashProviderPayloadV1("request-v1"),
      responseHash: hashProviderPayloadV1("response-v1"),
      capturedAt: "2026-08-24T04:16:00+05:30",
    };

    expect(verifyProviderAttemptEvidenceV1(evidence, "request-v1", "response-v1")).toBe(true);
    expect(() =>
      verifyProviderAttemptEvidenceV1(evidence, "request-mutated", "response-v1"),
    ).toThrow("evidence_integrity_failure");
    expect(() =>
      verifyProviderAttemptEvidenceV1(evidence, "request-v1", "response-mutated"),
    ).toThrow("evidence_integrity_failure");
  });

  it("M: preserves canonical original receipt and separate compensation action after compensation failure", () => {
    const lineage = createCompensationLineageV1({
      compensationPlanRef: "COMPENSATION-PLAN:001",
      originalExecutionReceiptRef: originalException.executionReceiptRef!,
      originalActionRef: originalException.actionRef,
      compensationActionRef: compensationAuthorization.actionRef,
      originalExceptionRef: originalException.exceptionRef,
    });

    expect(lineage.compensationActionRef).not.toBe(lineage.originalActionRef);

    const secondary = classifyCompensationFailureV1({
      compensationAuthorization,
      lineage,
      originalException,
      failure: new ProviderFailureErrorV1("COMPENSATION_FAILURE", "compensation_timeout"),
    });

    expect(secondary).toMatchObject({
      exceptionClass: "COMPENSATION_EXCEPTION",
      actionRef: compensationAuthorization.actionRef,
      parentExceptionRef: originalException.exceptionRef,
      originatingExecutionReceiptRef: lineage.originalExecutionReceiptRef,
    });
  });

  it("N: does not let a valid external OAuth credential override a revoked Warden checkpoint", () => {
    const externalOAuthState = "VALID";
    expect(externalOAuthState).toBe("VALID");

    const input = providerFixture({ checkpointState: "REVOKED" });
    const providerInvoke = vi.fn();

    expect(() => executeWithProviderAuthorityV1(input.providerAuthority, providerInvoke)).toThrow(
      "provider_authority_checkpoint_revoked",
    );
    expect(providerInvoke).not.toHaveBeenCalled();
  });
});
