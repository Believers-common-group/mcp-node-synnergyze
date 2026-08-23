import { describe, expect, it } from "vitest";

import type { SyntheticWardenDecisionPolicyV1 } from "./decision-service.ts";
import { SyntheticWardenAuthzenPdpV1 } from "./authzen-profile.ts";
import { handleSyntheticWardenAuthzenHttpV1 } from "./authzen-http.ts";

const BASE_URL = "https://warden.example.test";
const INITIAL_NOW = "2026-08-24T03:45:00.000+05:30";
const APPROVED_AT = "2026-08-24T03:46:00.000+05:30";
const APPROVED_UNTIL = "2026-08-24T04:46:00.000+05:30";

function policy(): SyntheticWardenDecisionPolicyV1 {
  return {
    policySnapshotRef: "WARDEN-POLICY-SNAPSHOT:AUTHZEN-HTTP-001",
    wardenRef: "WARDEN-ALPHA-AUTHZEN-HTTP-001",
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
    constraints: ["SYNTHETIC_AUTHZEN_HTTP_PROOF", "NO_LIVE_MONEY_MOVEMENT"],
  };
}

function payment(amountMinor = 7_500_000) {
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

function pdp() {
  return new SyntheticWardenAuthzenPdpV1({
    baseUrl: BASE_URL,
    policyResolver: () => policy(),
    approvalThresholdMinor: 5_000_000,
    delegationLimitMinor: 10_000_000,
    currency: "INR",
  });
}

function http(now: () => string) {
  return {
    now,
    requesterRef: (request: Request) => request.headers.get("authorization") ?? "PEP:ANONYMOUS",
  };
}

describe("WARDEN-AUTHZEN-HTTP-PROOF-001", () => {
  it("serves discovery and preserves X-Request-ID on evaluation", async () => {
    const instance = pdp();
    const discovery = await handleSyntheticWardenAuthzenHttpV1(
      instance,
      new Request(`${BASE_URL}/.well-known/authzen-configuration`),
      http(() => INITIAL_NOW),
    );
    expect(discovery.status).toBe(200);
    expect(await discovery.json()).toMatchObject({
      policy_decision_point: BASE_URL,
      access_evaluation_endpoint: `${BASE_URL}/access/v1/evaluation`,
      access_request_endpoint: `${BASE_URL}/access/v1/requests`,
    });

    const evaluation = await handleSyntheticWardenAuthzenHttpV1(
      instance,
      new Request(`${BASE_URL}/access/v1/evaluation`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": "http-eval-001" },
        body: JSON.stringify(payment()),
      }),
      http(() => INITIAL_NOW),
    );
    expect(evaluation.status).toBe(200);
    expect(evaluation.headers.get("x-request-id")).toBe("http-eval-001");
    expect(await evaluation.json()).toMatchObject({
      decision: false,
      context: { reason: "approval_required" },
    });
  });

  it("returns 202 + Location for access request and exposes task status", async () => {
    const instance = pdp();
    const evaluationResponse = await handleSyntheticWardenAuthzenHttpV1(
      instance,
      new Request(`${BASE_URL}/access/v1/evaluation`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": "http-eval-002" },
        body: JSON.stringify(payment()),
      }),
      http(() => INITIAL_NOW),
    );
    const evaluation = (await evaluationResponse.json()) as {
      context: {
        evaluation_id: string;
        evaluated_at: string;
        access_request: { expires_at: string; template?: string };
        reason: string;
      };
    };
    const value = payment();
    const submission = {
      subject: value.subject,
      resource: value.resource,
      action: value.action,
      context: {
        purpose: "supplier_payment",
        business_justification: "Synthetic HTTP approval proof",
      },
      requested_access: { requested_until: APPROVED_UNTIL },
      denial: {
        evaluation_id: evaluation.context.evaluation_id,
        evaluated_at: evaluation.context.evaluated_at,
        expires_at: evaluation.context.access_request.expires_at,
        reason: evaluation.context.reason,
        template: evaluation.context.access_request.template,
      },
    };

    const requestResponse = await handleSyntheticWardenAuthzenHttpV1(
      instance,
      new Request(`${BASE_URL}/access/v1/requests`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "http-idem-001",
          authorization: "PEP:SILK-TEST",
        },
        body: JSON.stringify(submission),
      }),
      http(() => "2026-08-24T03:45:15.000+05:30"),
    );
    expect(requestResponse.status).toBe(202);
    const task = (await requestResponse.json()) as {
      task: { id: string; status: string; status_endpoint: string };
    };
    expect(task.task.status).toBe("pending");
    expect(requestResponse.headers.get("location")).toBe(task.task.status_endpoint);

    const status = await handleSyntheticWardenAuthzenHttpV1(
      instance,
      new Request(task.task.status_endpoint),
      http(() => INITIAL_NOW),
    );
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual(task);

    const approved = instance.approveAccessRequest({
      taskId: task.task.id,
      approvedAt: APPROVED_AT,
      approvedUntil: APPROVED_UNTIL,
    });
    expect(approved.result?.mode).toBe("reevaluate");
  });

  it("returns problem+json for missing idempotency key", async () => {
    const instance = pdp();
    const response = await handleSyntheticWardenAuthzenHttpV1(
      instance,
      new Request(`${BASE_URL}/access/v1/requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      http(() => INITIAL_NOW),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(await response.json()).toMatchObject({ detail: "idempotency_key_required" });
  });
});
