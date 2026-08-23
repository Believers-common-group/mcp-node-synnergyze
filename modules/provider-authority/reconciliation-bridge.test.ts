import { describe, expect, it } from "vitest";

import type {
  ReconciliationClassificationV1,
  ReconciliationRemedyProposalV1,
  ReconciliationResultV1,
} from "../synnergyze/reconciliation-fabric.ts";
import type { ProviderExceptionV1 } from "./contracts.ts";
import { interpretProviderReconciliationV1 } from "./reconciliation-bridge.ts";

const providerException: ProviderExceptionV1 = {
  version: "WARDEN-PROVIDER-AUTHORITY-BRIDGE-001",
  exceptionRef: "PROVIDER-EXCEPTION:001",
  authorizationRef: "PROVIDER-AUTH:001",
  exceptionClass: "NETWORK_EXCEPTION",
  effectState: "UNKNOWN",
  retryability: "AFTER_RECONCILIATION",
  severity: "E2",
  failureKind: "HTTP_TIMEOUT_AFTER_SEND",
  message: "timeout_after_send",
};

function resultFor(
  classification: ReconciliationClassificationV1,
  options: {
    closureEligible?: boolean;
    remedy?: ReconciliationRemedyProposalV1;
  } = {},
): ReconciliationResultV1 {
  return {
    state: "DETERMINED",
    idempotentReplay: false,
    determination: {
      version: "RECONCILIATION-FABRIC-001",
      reconciliationRef: `RECONCILIATION:${classification}`,
      state: classification === "MATCH" ? "RECONCILED" : "EXCEPTION",
      classification,
      expectationRef: "EXPECTATION:PROVIDER-001",
      executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:PROVIDER-001",
      actionRef: "ACTION:PROVIDER-001",
      reservationRef: "RIVER-RESERVATION:PROVIDER-001",
      originalWardenDecisionRef: "WARDEN-DECISION:PROVIDER-001",
      programRef: "PROGRAM:PROVIDER-001",
      eventRef: "EVENT:PROVIDER-001",
      capabilityRef: "engineering.analyse",
      targetRef: "PROJECT:GYROCELL",
      requestedEffect: "engineering.analysis.available",
      correlationId: "CORR:PROVIDER-001",
      sourceEvidenceRefs: [],
      candidateRemedies: options.remedy ? [options.remedy] : [],
      closureEligible: options.closureEligible ?? false,
      reconciledAt: "2026-08-24T04:20:00+05:30",
      sourceDigest: `sha256:${classification.toLowerCase()}`,
      synthetic: true,
    },
  };
}

describe("Provider authority reconciliation bridge R0.4-B", () => {
  it("closes a timed-out provider attempt when existing reconciliation proves MATCH", () => {
    const interpretation = interpretProviderReconciliationV1(
      providerException,
      resultFor("MATCH", { closureEligible: true }),
    );

    expect(interpretation).toMatchObject({
      disposition: "CLOSE",
      retryAllowed: false,
      closureEligible: true,
      classification: "MATCH",
    });
  });

  it("preserves the existing fresh-Warden RECOVER proposal when the effect is missing", () => {
    const interpretation = interpretProviderReconciliationV1(
      providerException,
      resultFor("MISSING_EFFECT", {
        remedy: {
          proposalRef: "REMEDY-PROPOSAL:RECOVER-001",
          kind: "RECOVER",
          capabilityRef: "reconciliation.recover",
          reasonCode: "expected_effect_missing",
          requiresFreshWardenDecision: true,
          authorized: false,
        },
      }),
    );

    expect(interpretation.disposition).toBe("REMEDY_PROPOSED");
    expect(interpretation.retryAllowed).toBe(false);
    expect(interpretation.remedy).toMatchObject({
      kind: "RECOVER",
      requiresFreshWardenDecision: true,
      authorized: false,
    });
  });

  it("cannot close evidence-insufficient reconciliation and escalates manual review", () => {
    const interpretation = interpretProviderReconciliationV1(
      providerException,
      resultFor("EVIDENCE_INSUFFICIENT", {
        remedy: {
          proposalRef: "REMEDY-PROPOSAL:REVIEW-001",
          kind: "MANUAL_REVIEW",
          capabilityRef: "reconciliation.manual_review",
          reasonCode: "unsafe_for_automatic_remedy",
          requiresFreshWardenDecision: true,
          authorized: false,
        },
      }),
    );

    expect(interpretation.disposition).toBe("ESCALATE");
    expect(interpretation.retryAllowed).toBe(false);
    expect(interpretation.closureEligible).toBe(false);
    expect(interpretation.remedy?.kind).toBe("MANUAL_REVIEW");
  });

  it("preserves COMPENSATE as an unauthorized fresh-Warden remedy for a partial effect", () => {
    const partialEffect: ProviderExceptionV1 = {
      ...providerException,
      exceptionRef: "PROVIDER-EXCEPTION:PARTIAL-001",
      exceptionClass: "PARTIAL_EFFECT_EXCEPTION",
      effectState: "PARTIAL",
      retryability: "POLICY_DECISION_REQUIRED",
      severity: "E4",
      failureKind: "PARTIAL_EFFECT",
      executionRef: "PROVIDER-EXECUTION:ORIGINAL-001",
      message: "partial_effect_observed",
    };

    const interpretation = interpretProviderReconciliationV1(
      partialEffect,
      resultFor("UNEXPECTED_EFFECT", {
        remedy: {
          proposalRef: "REMEDY-PROPOSAL:COMPENSATE-001",
          kind: "COMPENSATE",
          capabilityRef: "reconciliation.compensate",
          reasonCode: "unexpected_effect_observed",
          requiresFreshWardenDecision: true,
          authorized: false,
        },
      }),
    );

    expect(interpretation.disposition).toBe("REMEDY_PROPOSED");
    expect(interpretation.retryAllowed).toBe(false);
    expect(interpretation.remedy).toMatchObject({
      kind: "COMPENSATE",
      requiresFreshWardenDecision: true,
      authorized: false,
    });
  });
});
