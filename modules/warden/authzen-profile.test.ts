import { describe, expect, it } from "vitest";

import type { SyntheticWardenDecisionPolicyV1 } from "./decision-service.ts";
import {
  AuthzenProfileError,
  SyntheticWardenAuthzenPdpV1,
  type AuthzenAccessEvaluationRequestV1,
  type AuthzenAccessRequestSubmissionV1,
} from "./authzen-profile.ts";

const BASE_URL = "https://warden.example.test";
const EVALUATED_AT = "2026-08-24T03:45:00.000+05:30";
const APPROVED_AT = "2026-08-24T03:46:00.000+05:30";
const APPROVED_UNTIL = "2026-08-24T04:46:00.000+05:30";

function policy(
  overrides: Partial<SyntheticWardenDecisionPolicyV1> = {},
): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:AUTHZEN-SILK-001",
    wardenRef: "WARDEN-ALPHA-AUTHZEN-001",
    lifecycle: "ACTIVE",
    validFrom: "2026-08-24T03:00:00.000+05:30",
    validUntil: "2026-08-24T06:00:00.000+05:30",
    actorRef: "DIGITALME:PAYABLES-AGENT-01",
    representedPrincipalRef: "SILK-ENTERPRISE:TEST-001",
    actingCapacityRef: "CAPACITY:PAYABLES-AGENT-01",
    contextRef: "AUTHZEN-PEP:SILK-TEST",
    programRef: "SILK-PROGRAM:TEST",
    requiredAuthorityRefs: ["AUTHORITY:SILK-PAYABLES-TEST"],
    requiredPolicyRefs: ["POLICY:SILK-PAYMENT-TEST"],
    allowedCapabilityRefs: ["silk.payment.transfer", "silk.payment.transfer.approved"],
    manualReviewCapabilityRefs: ["silk.payment.transfer.high_value"],
    constraints: ["SYNTHETIC_AUTHZEN_PROOF", "NO_LIVE_MONEY_MOVEMENT"],
    ...overrides,
  };
}

function payment(amountMinor = 7_500_000): AuthzenAccessEvaluationRequestV1 {
  return {
    subject: { type: "digitalme_principal", id: "SILK-ENTERPRISE:TEST-001" },
    resource: { type: "silk_account", id: "SILK-ACCOUNT:TEST-001" },
    action: {
      name: "transfer",
      properties: { amount_minor: amountMinor, currency: "INR" },
    },
    context: {
      purpose: "supplier_payment",
      actor: { type: "agent", id: "DIGITALME:PAYABLES-AGENT-01" },
    },
  };
}

function submission(
  request: AuthzenAccessEvaluationRequestV1,
  denial: ReturnType<SyntheticWardenAuthzenPdpV1["evaluate"]>,
): AuthzenAccessRequestSubmissionV1 {
  if (denial.decision || !denial.context?.access_request) {
    throw new Error("expected_requestable_denial");
  }
  return {
    subject: request.subject,
    resource: request.resource,
    action: request.action,
    context: {
      purpose: request.context?.purpose,
      business_justification: "Synthetic supplier invoice approval proof",
    },
    requested_access: { requested_until: APPROVED_UNTIL },
    denial: {
      evaluation_id: denial.context.evaluation_id,
      evaluated_at: denial.context.evaluated_at,
      expires_at: denial.context.access_request.expires_at,
      reason: denial.context.reason,
      template: denial.context.access_request.template,
    },
  };
}

function createPdp(policyResolver: () => SyntheticWardenDecisionPolicyV1) {
  return new SyntheticWardenAuthzenPdpV1({
    baseUrl: BASE_URL,
    policyResolver,
    approvalThresholdMinor: 5_000_000,
    delegationLimitMinor: 10_000_000,
    currency: "INR",
  });
}

describe("WARDEN-AUTHZEN-ARAP-PROOF-001", () => {
  it("publishes AuthZEN evaluation and ARAP request discovery without claiming signing keys", () => {
    const pdp = createPdp(() => policy());
    expect(pdp.metadata()).toEqual({
      policy_decision_point: BASE_URL,
      access_evaluation_endpoint: `${BASE_URL}/access/v1/evaluation`,
      access_request_endpoint: `${BASE_URL}/access/v1/requests`,
      capabilities: ["urn:openid:authzen:capability:access-request"],
    });
  });

  it("projects Warden ESCALATE as a requestable AuthZEN denial", () => {
    const pdp = createPdp(() => policy());
    const result = pdp.evaluate(payment(), {
      evaluatedAt: EVALUATED_AT,
      requestId: "authzen-req-001",
    });

    expect(result.decision).toBe(false);
    expect(result.context?.reason).toBe("approval_required");
    expect(result.context?.warden?.native_decision).toBe("ESCALATE");
    expect(result.context?.warden?.next_lawful_action).toBe("request_approval");
    expect(result.context?.access_request?.endpoint).toBe(`${BASE_URL}/access/v1/requests`);
    expect(result.context?.evaluation_id).toMatch(/^eval_/);
  });

  it("replays an equivalent submission idempotently and rejects mutated reuse", () => {
    const pdp = createPdp(() => policy());
    const request = payment();
    const denial = pdp.evaluate(request, {
      evaluatedAt: EVALUATED_AT,
      requestId: "authzen-req-002",
    });
    const body = submission(request, denial);

    const first = pdp.submitAccessRequest({
      submission: body,
      requesterRef: "PEP:SILK-TEST",
      idempotencyKey: "idem-001",
      submittedAt: "2026-08-24T03:45:15.000+05:30",
    });
    const replay = pdp.submitAccessRequest({
      submission: JSON.parse(JSON.stringify(body)) as AuthzenAccessRequestSubmissionV1,
      requesterRef: "PEP:SILK-TEST",
      idempotencyKey: "idem-001",
      submittedAt: "2026-08-24T03:45:20.000+05:30",
    });

    expect(first.task.status).toBe("pending");
    expect(replay).toEqual(first);

    try {
      pdp.submitAccessRequest({
        submission: {
          ...body,
          context: { ...body.context, business_justification: "Mutated justification" },
        },
        requesterRef: "PEP:SILK-TEST",
        idempotencyKey: "idem-001",
        submittedAt: "2026-08-24T03:45:25.000+05:30",
      });
      throw new Error("expected_duplicate_request");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthzenProfileError);
      if (!(error instanceof AuthzenProfileError)) throw error;
      expect(error.statusCode).toBe(409);
      expect(error.type).toBe("urn:openid:authzen:access-request:error:duplicate_request");
    }
  });

  it("allows only after approval plus fresh evaluation and creates a River reservation", () => {
    const pdp = createPdp(() => policy());
    const request = payment();
    const denial = pdp.evaluate(request, {
      evaluatedAt: EVALUATED_AT,
      requestId: "authzen-req-003",
    });
    const pending = pdp.submitAccessRequest({
      submission: submission(request, denial),
      requesterRef: "PEP:SILK-TEST",
      idempotencyKey: "idem-002",
      submittedAt: "2026-08-24T03:45:15.000+05:30",
    });
    const approved = pdp.approveAccessRequest({
      taskId: pending.task.id,
      approvedAt: APPROVED_AT,
      approvedUntil: APPROVED_UNTIL,
    });

    expect(pdp.getAccessRequest(pending.task.id)).toEqual(approved);
    expect(approved.result?.mode).toBe("reevaluate");

    const result = pdp.evaluate(
      {
        ...request,
        context: { ...request.context, approval: approved.result?.approval },
      },
      {
        evaluatedAt: "2026-08-24T03:47:00.000+05:30",
        requestId: "authzen-req-004",
      },
    );

    expect(result.decision).toBe(true);
    expect(result.context?.warden?.native_decision).toBe("ALLOW");
    expect(result.context?.warden?.next_lawful_action).toBe("execute_controlled_transfer");
    expect(result.context?.warden?.river_reservation_ref).toMatch(/^RIVER-RESERVATION:/);
  });

  it("does not let a valid approval authorize a changed payment amount", () => {
    const pdp = createPdp(() => policy());
    const request = payment();
    const denial = pdp.evaluate(request, {
      evaluatedAt: EVALUATED_AT,
      requestId: "authzen-req-005",
    });
    const pending = pdp.submitAccessRequest({
      submission: submission(request, denial),
      requesterRef: "PEP:SILK-TEST",
      idempotencyKey: "idem-003",
      submittedAt: "2026-08-24T03:45:15.000+05:30",
    });
    const approved = pdp.approveAccessRequest({
      taskId: pending.task.id,
      approvedAt: APPROVED_AT,
      approvedUntil: APPROVED_UNTIL,
    });
    const changed = payment(8_000_000);

    const result = pdp.evaluate(
      { ...changed, context: { ...changed.context, approval: approved.result?.approval } },
      {
        evaluatedAt: "2026-08-24T03:47:00.000+05:30",
        requestId: "authzen-req-006",
      },
    );

    expect(result.decision).toBe(false);
    expect(result.context?.reason).toBe("out_of_scope");
    expect(result.context?.next_action).toBe("request");
  });

  it("re-evaluates current authority and fails closed when delegation is revoked", () => {
    let currentPolicy = policy();
    const pdp = createPdp(() => currentPolicy);
    const request = payment();
    const denial = pdp.evaluate(request, {
      evaluatedAt: EVALUATED_AT,
      requestId: "authzen-req-007",
    });
    const pending = pdp.submitAccessRequest({
      submission: submission(request, denial),
      requesterRef: "PEP:SILK-TEST",
      idempotencyKey: "idem-004",
      submittedAt: "2026-08-24T03:45:15.000+05:30",
    });
    const approved = pdp.approveAccessRequest({
      taskId: pending.task.id,
      approvedAt: APPROVED_AT,
      approvedUntil: APPROVED_UNTIL,
    });

    currentPolicy = policy({ lifecycle: "REVOKED" });
    const result = pdp.evaluate(
      { ...request, context: { ...request.context, approval: approved.result?.approval } },
      {
        evaluatedAt: "2026-08-24T03:47:30.000+05:30",
        requestId: "authzen-req-008",
      },
    );

    expect(result.decision).toBe(false);
    expect(result.context?.reason).toBe("policy_denied");
    expect(result.context?.warden?.reason_codes).toEqual(["authority_revoked"]);
  });

  it("denies above the delegated ceiling without exposing an approval path", () => {
    const pdp = createPdp(() => policy());
    const result = pdp.evaluate(payment(12_500_000), {
      evaluatedAt: EVALUATED_AT,
      requestId: "authzen-req-009",
    });

    expect(result.decision).toBe(false);
    expect(result.context?.reason).toBe("policy_denied");
    expect(result.context?.warden?.native_decision).toBe("DENY");
    expect(result.context?.access_request).toBeUndefined();
  });
});
