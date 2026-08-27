import { createHash } from "node:crypto";

import {
  buildAuthorizedActionEnvelopeV1,
  SyntheticRiverReservationServiceV1,
} from "../river/reservation-service.ts";
import type { WardenDecisionRequestV1, WardenDecisionV1 } from "./contracts.ts";
import {
  evaluateSyntheticWardenDecisionV1,
  type SyntheticWardenDecisionPolicyV1,
} from "./decision-service.ts";

export interface AuthzenEntityV1 {
  type: string;
  id: string;
  properties?: Record<string, unknown>;
}

export interface AuthzenActionV1 {
  name: string;
  properties?: Record<string, unknown>;
}

export interface AuthzenApprovalV1 {
  id: string;
  approved_at: string;
  approved_until?: string;
  state?: string;
}

export interface AuthzenAccessEvaluationRequestV1 {
  subject: AuthzenEntityV1;
  resource: AuthzenEntityV1;
  action: AuthzenActionV1;
  context?: Record<string, unknown> & {
    purpose?: string;
    actor?: { type: string; id: string };
    approval?: AuthzenApprovalV1;
  };
}

export interface AuthzenAccessEvaluationResponseV1 {
  decision: boolean;
  context?: {
    evaluation_id?: string;
    evaluated_at?: string;
    reason?: string;
    next_action?: string;
    access_request?: {
      endpoint?: string;
      template?: string;
      expires_at: string;
      binding_token?: string;
    };
    warden?: {
      native_decision: WardenDecisionV1["decision"];
      decision_ref?: string;
      reason_codes: readonly string[];
      next_lawful_action: string;
      river_reservation_ref?: string;
    };
  };
}

export interface AuthzenAccessRequestSubmissionV1 {
  subject: AuthzenEntityV1;
  resource: AuthzenEntityV1;
  action: AuthzenActionV1;
  context?: Record<string, unknown>;
  requested_access?: { requested_until?: string };
  denial: {
    evaluation_id?: string;
    evaluated_at?: string;
    expires_at: string;
    reason?: string;
    binding_token?: string;
    template?: string;
  };
}

export interface AuthzenTaskResponseV1 {
  task: {
    id: string;
    status: "pending" | "approved" | "denied" | "expired" | "cancelled" | "failed";
    status_endpoint: string;
    expires_at?: string;
  };
  result?: {
    mode: "reevaluate";
    approval: AuthzenApprovalV1;
  };
}

export interface AuthzenPdpMetadataV1 {
  policy_decision_point: string;
  access_evaluation_endpoint: string;
  access_request_endpoint: string;
  capabilities: readonly string[];
}

export interface SyntheticWardenAuthzenPdpOptionsV1 {
  baseUrl: string;
  policyResolver: () => SyntheticWardenDecisionPolicyV1;
  approvalThresholdMinor: number;
  delegationLimitMinor: number;
  currency: string;
  requestableDenialTtlMs?: number;
}

export class AuthzenProfileError extends Error {
  readonly statusCode: number;
  readonly type: string;

  constructor(statusCode: number, type: string, message: string) {
    super(message);
    this.name = "AuthzenProfileError";
    this.statusCode = statusCode;
    this.type = type;
  }
}

const CAPABILITY = "urn:openid:authzen:capability:access-request";
const DUPLICATE = "urn:openid:authzen:access-request:error:duplicate_request";
const INVALID = "urn:openid:authzen:access-request:error:invalid_request";
const UNKNOWN_TASK = "urn:openid:authzen:access-request:error:unknown_task";
const INVALID_TASK = "urn:openid:authzen:access-request:error:invalid_task_state";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stable(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, normalize(item)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

function instant(value: string, code: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new AuthzenProfileError(400, INVALID, code);
  return parsed;
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function amountOf(request: AuthzenAccessEvaluationRequestV1): number | undefined {
  const value = request.action.properties?.amount_minor;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function currencyOf(request: AuthzenAccessEvaluationRequestV1): string | undefined {
  const value = request.action.properties?.currency;
  return typeof value === "string" ? value : undefined;
}

function scopeOf(request: AuthzenAccessEvaluationRequestV1): string {
  return stable({
    subject: request.subject,
    resource: request.resource,
    action: request.action,
    context: {
      purpose: request.context?.purpose ?? null,
      actor: request.context?.actor ?? null,
    },
  });
}

interface StoredEvaluation {
  expiresAt: string;
  scope: string;
  request: AuthzenAccessEvaluationRequestV1;
}

interface StoredTask {
  body: string;
  response: AuthzenTaskResponseV1;
  request: AuthzenAccessEvaluationRequestV1;
}

export class SyntheticWardenAuthzenPdpV1 {
  private readonly options: SyntheticWardenAuthzenPdpOptionsV1;
  private readonly baseUrl: string;
  private readonly evaluations = new Map<string, StoredEvaluation>();
  private readonly tasks = new Map<string, StoredTask>();
  private readonly idempotency = new Map<string, string>();
  private readonly approvals = new Map<
    string,
    { approval: AuthzenApprovalV1; request: AuthzenAccessEvaluationRequestV1 }
  >();
  private readonly river = new SyntheticRiverReservationServiceV1();

  constructor(options: SyntheticWardenAuthzenPdpOptionsV1) {
    this.options = options;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
  }

  metadata(): AuthzenPdpMetadataV1 {
    return {
      policy_decision_point: this.baseUrl,
      access_evaluation_endpoint: `${this.baseUrl}/access/v1/evaluation`,
      access_request_endpoint: `${this.baseUrl}/access/v1/requests`,
      capabilities: [CAPABILITY],
    };
  }

  evaluate(
    request: AuthzenAccessEvaluationRequestV1,
    runtime: { evaluatedAt: string; requestId: string },
  ): AuthzenAccessEvaluationResponseV1 {
    this.validateRequest(request);
    const amount = amountOf(request);
    if (amount === undefined || currencyOf(request) !== this.options.currency) {
      return this.terminal("invalid_payment_request", "none");
    }
    if (!request.context?.actor?.id) return this.terminal("actor_required", "none");

    const policy = this.options.policyResolver();
    const approval = request.context.approval;
    if (approval) return this.evaluateApproved(request, runtime, policy, approval);

    if (amount > this.options.delegationLimitMinor) {
      return this.evaluateWarden(request, runtime, policy, "silk.payment.transfer.out_of_bounds");
    }
    if (amount <= this.options.approvalThresholdMinor) {
      return this.evaluateWarden(request, runtime, policy, "silk.payment.transfer");
    }

    const decision = this.wardenDecision(request, runtime, policy, "silk.payment.transfer.high_value");
    if (decision.decision !== "ESCALATE") return this.projectNonAllow(decision);

    const expiresAt = new Date(
      instant(runtime.evaluatedAt, "invalid_evaluated_at") +
        (this.options.requestableDenialTtlMs ?? 600_000),
    ).toISOString();
    const evaluationId = `eval_${digest(stable({ runtime, scope: scopeOf(request) })).slice(0, 26)}`;
    this.evaluations.set(evaluationId, {
      expiresAt,
      scope: scopeOf(request),
      request: copy(request),
    });

    return {
      decision: false,
      context: {
        evaluation_id: evaluationId,
        evaluated_at: runtime.evaluatedAt,
        reason: "approval_required",
        next_action: "request",
        access_request: {
          endpoint: `${this.baseUrl}/access/v1/requests`,
          template: "silk_high_value_payment_approval",
          expires_at: expiresAt,
        },
        warden: {
          native_decision: "ESCALATE",
          decision_ref: decision.decisionRef,
          reason_codes: decision.reasonCodes,
          next_lawful_action: "request_approval",
        },
      },
    };
  }

  submitAccessRequest(input: {
    submission: AuthzenAccessRequestSubmissionV1;
    requesterRef: string;
    idempotencyKey: string;
    submittedAt: string;
  }): AuthzenTaskResponseV1 {
    const evaluationId = input.submission.denial.evaluation_id;
    const evaluation = evaluationId ? this.evaluations.get(evaluationId) : undefined;
    if (!evaluation) throw new AuthzenProfileError(400, INVALID, "unknown_or_missing_evaluation");
    if (
      instant(input.submittedAt, "invalid_submitted_at") >
      instant(evaluation.expiresAt, "invalid_expiry")
    ) {
      throw new AuthzenProfileError(400, INVALID, "requestable_denial_expired");
    }
    if (input.submission.denial.expires_at !== evaluation.expiresAt) {
      throw new AuthzenProfileError(400, INVALID, "denial_expiry_mismatch");
    }

    const submittedScope = scopeOf({
      subject: input.submission.subject,
      resource: input.submission.resource,
      action: input.submission.action,
      context: {
        purpose:
          typeof input.submission.context?.purpose === "string"
            ? input.submission.context.purpose
            : undefined,
        actor: evaluation.request.context?.actor,
      },
    });
    if (submittedScope !== evaluation.scope) {
      throw new AuthzenProfileError(400, INVALID, "denial_scope_mismatch");
    }

    const body = stable(input.submission);
    const key = `${input.requesterRef}\n${input.idempotencyKey}`;
    const previousTaskId = this.idempotency.get(key);
    if (previousTaskId) {
      const previous = this.tasks.get(previousTaskId);
      if (!previous) throw new Error("authzen_idempotency_state_missing");
      if (previous.body !== body) {
        throw new AuthzenProfileError(
          409,
          DUPLICATE,
          "idempotency_key_reused_with_different_body",
        );
      }
      return copy(previous.response);
    }

    const taskId = `arq_${digest(stable({ evaluationId, key })).slice(0, 26)}`;
    const response: AuthzenTaskResponseV1 = {
      task: {
        id: taskId,
        status: "pending",
        status_endpoint: `${this.baseUrl}/access/v1/requests/${taskId}`,
        expires_at: input.submission.requested_access?.requested_until,
      },
    };
    this.tasks.set(taskId, { body, response, request: copy(evaluation.request) });
    this.idempotency.set(key, taskId);
    return copy(response);
  }

  approveAccessRequest(input: {
    taskId: string;
    approvedAt: string;
    approvedUntil?: string;
  }): AuthzenTaskResponseV1 {
    const stored = this.tasks.get(input.taskId);
    if (!stored) throw new AuthzenProfileError(404, UNKNOWN_TASK, "unknown_task");
    if (stored.response.task.status !== "pending") {
      throw new AuthzenProfileError(409, INVALID_TASK, "task_not_pending");
    }
    instant(input.approvedAt, "invalid_approved_at");
    if (input.approvedUntil) instant(input.approvedUntil, "invalid_approved_until");

    const approval: AuthzenApprovalV1 = {
      id: `apr_${digest(stable(input)).slice(0, 26)}`,
      approved_at: input.approvedAt,
      ...(input.approvedUntil ? { approved_until: input.approvedUntil } : {}),
    };
    const response: AuthzenTaskResponseV1 = {
      task: { ...stored.response.task, status: "approved" },
      result: { mode: "reevaluate", approval },
    };
    stored.response = response;
    this.approvals.set(approval.id, {
      approval: copy(approval),
      request: copy(stored.request),
    });
    return copy(response);
  }

  getAccessRequest(taskId: string): AuthzenTaskResponseV1 {
    const stored = this.tasks.get(taskId);
    if (!stored) throw new AuthzenProfileError(404, UNKNOWN_TASK, "unknown_task");
    return copy(stored.response);
  }

  private evaluateApproved(
    request: AuthzenAccessEvaluationRequestV1,
    runtime: { evaluatedAt: string; requestId: string },
    policy: SyntheticWardenDecisionPolicyV1,
    approval: AuthzenApprovalV1,
  ): AuthzenAccessEvaluationResponseV1 {
    const stored = this.approvals.get(approval.id);
    if (!stored || stable(stored.approval) !== stable(approval)) {
      return this.terminal("approval_unverifiable", "none");
    }
    if (scopeOf(stored.request) !== scopeOf(request)) {
      return {
        decision: false,
        context: {
          reason: "out_of_scope",
          next_action: "request",
          warden: {
            native_decision: "DENY",
            reason_codes: ["approval_scope_mismatch"],
            next_lawful_action: "request_approval",
          },
        },
      };
    }
    if (
      approval.approved_until &&
      instant(runtime.evaluatedAt, "invalid_evaluated_at") >
        instant(approval.approved_until, "invalid_approved_until")
    ) {
      return this.terminal("approval_expired", "request");
    }
    return this.evaluateWarden(request, runtime, policy, "silk.payment.transfer.approved");
  }

  private evaluateWarden(
    request: AuthzenAccessEvaluationRequestV1,
    runtime: { evaluatedAt: string; requestId: string },
    policy: SyntheticWardenDecisionPolicyV1,
    capabilityRef: string,
  ): AuthzenAccessEvaluationResponseV1 {
    const normalized = this.normalize(request, runtime, policy, capabilityRef);
    const decision = evaluateSyntheticWardenDecisionV1({
      request: normalized,
      policy,
      decidedAt: runtime.evaluatedAt,
    });
    if (decision.decision !== "ALLOW") return this.projectNonAllow(decision);

    const action = buildAuthorizedActionEnvelopeV1(normalized, decision);
    const reservation = this.river.reserve({
      request: normalized,
      decision,
      action,
      reservedAt: runtime.evaluatedAt,
    });
    return {
      decision: true,
      context: {
        reason: "allowed",
        warden: {
          native_decision: "ALLOW",
          decision_ref: decision.decisionRef,
          reason_codes: decision.reasonCodes,
          next_lawful_action: "execute_controlled_transfer",
          river_reservation_ref: reservation.reservationRef,
        },
      },
    };
  }

  private wardenDecision(
    request: AuthzenAccessEvaluationRequestV1,
    runtime: { evaluatedAt: string; requestId: string },
    policy: SyntheticWardenDecisionPolicyV1,
    capabilityRef: string,
  ): WardenDecisionV1 {
    return evaluateSyntheticWardenDecisionV1({
      request: this.normalize(request, runtime, policy, capabilityRef),
      policy,
      decidedAt: runtime.evaluatedAt,
    });
  }

  private normalize(
    request: AuthzenAccessEvaluationRequestV1,
    runtime: { evaluatedAt: string; requestId: string },
    policy: SyntheticWardenDecisionPolicyV1,
    capabilityRef: string,
  ): WardenDecisionRequestV1 {
    return {
      requestRef: `AUTHZEN-REQUEST:${digest(stable({ runtime, request })).slice(0, 24)}`,
      actorRef: request.context?.actor?.id ?? "AUTHZEN:ACTOR:MISSING",
      representedPrincipalRef: request.subject.id,
      actingCapacityRef: policy.actingCapacityRef,
      contextRef: policy.contextRef,
      programRef: policy.programRef,
      eventRef: `AUTHZEN-EVENT:${digest(runtime.requestId).slice(0, 24)}`,
      action: request.action.name,
      capabilityRef,
      targetRef: request.resource.id,
      requestedEffect: "silk.payment.transfer.executed",
      authorityRefs: policy.requiredAuthorityRefs,
      policyRefs: policy.requiredPolicyRefs,
      representationSourceRefs: [`AUTHZEN-SUBJECT:${request.subject.type}:${request.subject.id}`],
      requestedAt: runtime.evaluatedAt,
      correlationId: `AUTHZEN-CORR:${digest(runtime.requestId).slice(0, 20)}`,
    };
  }

  private projectNonAllow(decision: WardenDecisionV1): AuthzenAccessEvaluationResponseV1 {
    return {
      decision: false,
      context: {
        reason: "policy_denied",
        next_action: "none",
        warden: {
          native_decision: decision.decision,
          decision_ref: decision.decisionRef,
          reason_codes: decision.reasonCodes,
          next_lawful_action: decision.decision === "ESCALATE" ? "request_approval" : "none",
        },
      },
    };
  }

  private terminal(reason: string, nextAction: string): AuthzenAccessEvaluationResponseV1 {
    return {
      decision: false,
      context: {
        reason,
        next_action: nextAction,
        warden: {
          native_decision: "DENY",
          reason_codes: [reason],
          next_lawful_action: nextAction === "request" ? "request_approval" : "none",
        },
      },
    };
  }

  private validateRequest(request: AuthzenAccessEvaluationRequestV1): void {
    if (!request.subject?.type || !request.subject.id) throw new Error("authzen_subject_required");
    if (!request.resource?.type || !request.resource.id) throw new Error("authzen_resource_required");
    if (!request.action?.name) throw new Error("authzen_action_required");
  }
}
