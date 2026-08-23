import { describe, expect, it, vi } from "vitest";

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
  executeWithProviderAuthorityV1,
  hashProviderPayloadV1,
  ProviderExecutionRegistryV1,
  ProviderFailureErrorV1,
  verifyProviderAttemptEvidenceV1,
} from "./runtime.ts";

const authorization: AuthorizedProviderExecutionV1 = {
  version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001",
  authorizationRef: "PROVIDER-AUTH:001",
  state: "AUTHORIZED",
  grantRef: "PROVIDER-GRANT:001",
  bindingRef: "PROVIDER-BINDING:001",
  wardenDecisionRef: "WARDEN-DECISION:001",
  wardenCheckpointRef: "WARDEN-CHECKPOINT:001",
  agentRef: "AGENTME:ENGINEERING-017",
  providerRef: "GOOGLE_CLOUD",
  providerPrincipalRef: "spiffe://agents.example/engineering-017",
  capabilityRef: "engineering.analyse",
  purposeRef: "thermal_validation",
  resourceRefs: ["PROJECT:GYROCELL"],
  correlationId: "CORR:PROVIDER-001",
  authorizedAt: "2026-08-24T04:15:00+05:30",
  sourceDigest: "authority-source-digest",
};

const originalException: ProviderExceptionV1 = {
  version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001",
  exceptionRef: "PROVIDER-EXCEPTION:ORIGINAL-001",
  authorizationRef: authorization.authorizationRef,
  exceptionClass: "PARTIAL_EFFECT_EXCEPTION",
  effectState: "PARTIAL",
  retryability: "POLICY_DECISION_REQUIRED",
  severity: "E4",
  failureKind: "PARTIAL_EFFECT",
  message: "partial_effect_observed",
  executionRef: "PROVIDER-EXECUTION:ORIGINAL-001",
};

describe("Provider authority execution integrity R0.4-B", () => {
  it("J: reuses the same governed execution on exact effect-key replay", () => {
    const registry = new ProviderExecutionRegistryV1();
    const intent = { effectKey: "EFFECT:001", requestDigest: "sha256:request-v1" };

    const first = registry.resolve(authorization, intent);
    const replay = registry.resolve(authorization, intent);

    expect(first.idempotentReplay).toBe(false);
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.execution.executionRef).toBe(first.execution.executionRef);
  });

  it("K: rejects mutated governed intent under an existing effect key", () => {
    const registry = new ProviderExecutionRegistryV1();
    registry.resolve(authorization, {
      effectKey: "EFFECT:001",
      requestDigest: "sha256:request-v1",
    });

    expect(() =>
      registry.resolve(authorization, {
        effectKey: "EFFECT:001",
        requestDigest: "sha256:request-mutated",
      }),
    ).toThrow("provider_execution_idempotency_conflict");
  });

  it("L: detects request and response evidence tampering", () => {
    const evidence = {
      attemptRef: "PROVIDER-ATTEMPT:001",
      executionRef: "PROVIDER-EXECUTION:001",
      authorizationRef: authorization.authorizationRef,
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

  it("M: preserves original and compensation execution lineage after compensation failure", () => {
    const lineage = createCompensationLineageV1({
      compensationPlanRef: "COMPENSATION-PLAN:001",
      originalExecutionRef: originalException.executionRef!,
      compensationExecutionRef: "PROVIDER-EXECUTION:COMPENSATION-001",
      originalExceptionRef: originalException.exceptionRef,
    });

    expect(lineage.compensationExecutionRef).not.toBe(lineage.originalExecutionRef);

    const secondary = classifyCompensationFailureV1({
      authorizationRef: "PROVIDER-AUTH:COMPENSATION-001",
      compensationExecutionRef: lineage.compensationExecutionRef,
      originalException,
      failure: new ProviderFailureErrorV1("COMPENSATION_FAILURE", "compensation_timeout"),
    });

    expect(secondary).toMatchObject({
      exceptionClass: "COMPENSATION_EXCEPTION",
      parentExceptionRef: originalException.exceptionRef,
      originatingExecutionRef: lineage.originalExecutionRef,
      executionRef: lineage.compensationExecutionRef,
    });
  });

  it("N: does not let a valid external OAuth credential override a revoked Warden checkpoint", () => {
    const externalOAuthState = "VALID";
    expect(externalOAuthState).toBe("VALID");

    const decision: WardenAllowDecisionV1 = {
      decisionRef: "WARDEN-DECISION:REVOKED-001",
      requestRef: "WARDEN-REQUEST:REVOKED-001",
      wardenRef: "WARDEN:ALPHA",
      action: "provider.execute",
      targetRef: "PROVIDER-RESOURCE:001",
      reasonCodes: [],
      constraints: [],
      decidedAt: "2026-08-24T04:00:00+05:30",
      validUntil: "2026-08-24T04:25:00+05:30",
      correlationId: "CORR:REVOKED-001",
      decision: "ALLOW",
      actionToken: "WARDEN-ACTION-TOKEN:REVOKED-001",
    };
    const checkpoint: WardenExecutionCheckpointV1 = {
      checkpointRef: "WARDEN-CHECKPOINT:REVOKED-001",
      decisionRef: decision.decisionRef,
      wardenRef: decision.wardenRef,
      correlationId: decision.correlationId,
      state: "REVOKED",
      checkedAt: "2026-08-24T04:14:00+05:30",
      reasonCodes: ["authority_revoked"],
    };
    const grant: ProviderAuthorityGrantV1 = {
      version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001",
      grantRef: "PROVIDER-GRANT:REVOKED-001",
      wardenDecisionRef: decision.decisionRef,
      wardenCheckpointRef: checkpoint.checkpointRef,
      delegatedAgentRef: "AGENTME:001",
      providerRef: "GOOGLE_CLOUD",
      capabilityRef: "provider.call",
      purposeRef: "test",
      resourceRefs: ["RESOURCE:001"],
      correlationId: decision.correlationId,
      issuedAt: "2026-08-24T04:14:30+05:30",
    };
    const binding: ProviderPrincipalBindingV1 = {
      version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001",
      bindingRef: "PROVIDER-BINDING:REVOKED-001",
      agentRef: grant.delegatedAgentRef,
      providerRef: grant.providerRef,
      providerPrincipalRef: "spiffe://agents.example/revoked-001",
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
    const gate: ProviderAuthorityGateInputV1 = {
      grant,
      binding,
      request,
      decision,
      checkpoint,
      authorizedAt: "2026-08-24T04:15:00+05:30",
    };
    const providerInvoke = vi.fn();

    expect(() => executeWithProviderAuthorityV1(gate, providerInvoke)).toThrow(
      "provider_authority_checkpoint_revoked",
    );
    expect(providerInvoke).not.toHaveBeenCalled();
  });
});
