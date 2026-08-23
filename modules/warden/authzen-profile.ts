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

export interface AuthzenActorV1 {
  type: string;
  id: string;
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
    actor?: AuthzenActorV1;
    approval?: AuthzenApprovalV1;
  };
}

export interface AuthzenRequestableDenialV1 {
  endpoint?: string;
  template?: string;
  expires_at: string;
  binding_token?: string;
}

export interface AuthzenDecisionContextV1 {
  evaluation_id?: string;
  evaluated_at?: string;
  reason?: string;
  next_action?: string;
  access_request?: AuthzenRequestableDenialV1;
  warden?: {
    native_decision: WardenDecisionV1["decision"];
    decision_ref?: string;
    reason_codes: readonly string[];
    next_lawful_action: string;
    river_reservation_ref?: string;
  };
}

export interface AuthzenAccessEvaluationResponseV1 {
  decision: boolean;
  context?: AuthzenDecisionContextV1;
}

export interface AuthzenAccessRequestSubmissionV1 {
  subject: AuthzenEntityV1;
  resource: AuthzenEntityV1;
  action: AuthzenActionV1;
  context?: Record<string, unknown>;
  requested_access?: {
    requested_until?: string;
  };
  denial: {
    evaluation_id?: string;
    evaluated_at?: string;
    expires_at: string;
    reason?: string;
    binding_token?: string;
    template?: string;
  };
}

export type AuthzenTaskStatusV1 =
  | "pending"
  | "approved"
  | "denied"
  | "expired"
  | "cancelled"
  | "failed";

export interface AuthzenTaskV1 {
  id: string;
  status: AuthzenTaskStatusV1;
  status_endpoint: string;
  expires_at?: string;
}

export interface AuthzenApprovalResultV1 {
  mode: "reevaluate";
  approval: AuthzenApprovalV1;
}

export interface AuthzenTaskResponseV1 {
  task: AuthzenTaskV1;
  result?: AuthzenApprovalResultV1;
}

export interface AuthzenPdpMetadataV1 {
  policy_decision_point: string;
  access_evaluation_endpoint: string;
  access_request_endpoint: string;
  jwks_uri: string;
  capabilities: readonly string[];
}

export interface AuthzenJwksV1 {
  keys: readonly Record<string, unknown>[];
}

export interface SyntheticWardenAuthzenPdpOptionsV1 {
  baseUrl: string;
  policyResolver: () => SyntheticWardenDecisionPolicyV1;
  approvalThresholdMinor: number;
  delegationLimitMinor: number;
  currency: string;
  requestableDenialTtlMs?: number;
}

export interface AuthzenEvaluationRuntimeV1 {
  evaluatedAt: string;
  requestId: string;
}

export interface AuthzenSubmitAccessRequestInputV1 {
  submission: AuthzenAccessRequestSubmissionV1;
  requesterRef: string;
  idempotencyKey: string;
  submittedAt: string;
}

export interface AuthzenApproveAccessRequestInputV1 {
  taskId: string;
  approvedAt: string;
  approvedUntil?: string;
}

interface StoredEvaluationV1 {
  expiresAt: string;
  fingerprint: string;
  request: AuthzenAccessEvaluationRequestV1;
}

interface StoredTaskV1 {
  fingerprint: string;
  response: AuthzenTaskResponseV1;
  boundRequest: AuthzenAccessEvaluationRequestV1;
}

interface StoredApprovalV1 {
  approval: AuthzenApprovalV1;
  boundRequest: AuthzenAccessEvaluationRequestV1;
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

const ACCESS_REQUEST_CAPABILITY = "urn:openid:authzen:capability:access-request";
const DUPLICATE_REQUEST = "urn:openid:authzen:access-request:error:duplicate_request";
const UNKNOWN_TASK = "urn:openid:authzen:access-request:error:unknown_task";
const INVALID_TASK_STATE = "urn:openid:authzen:access-request:error:invalid_task_state";
const INVALID_REQUEST = "urn:openid:authzen:access-request:error:invalid_request";

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, entry]) => [key, normalize(entry)]),
      );
    }
    return input;
  };
  return JSON.stringify(normalize(value));
}

function timestamp(value: string, code: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new AuthzenProfileError(400, INVALID_REQUEST, code);
  return parsed;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function amountMinor(request: AuthzenAccessEvaluationRequestV1): number | undefined {
  const value = request.action.properties?.amount_minor;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function requestCurrency(request: AuthzenAccessEvaluationRequestV1): string | undefined {
  const value = request.action.properties?.currency;
  return typeof value === "string" ? value : undefined;
}

function exactScopeFingerprint(request: AuthzenAccessEvaluationRequestV1): string {
  return stableJson({
    subject: request.subject,
    resource: request.resource,
    action: request.action,
    context: {
      purpose: request.context?.purpose ?? null,
      actor: request.context?.actor ?? null,
    },
  });
}

export class SyntheticWardenAuthzenPdpV1 {
  private readonly options: SyntheticWardenAuthzenPdpOptionsV1;
  private readonly evaluations = new Map<string, StoredEvaluationV1>();
  private readonly tasksById = new Map<string, StoredTaskV1>();
  private readonly taskIdByIdempotency = new Map<string, string>();
  private readonly approvalsById = new Map<string, StoredApprovalV1>();
  private readonly river = new SyntheticRiverReservationServiceV1();
  private readonly baseUrl: string;
  private readonly ttlMs: number;

  constructor(options: SyntheticWardenAuthzenPdpOptionsV1) {
    this.options = options;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.ttlMs = options.requestableDenialTtlMs ?? 10 * 60 * 1000;
  }

  metadata(): AuthzenPdpMetadataV1 {
    return {
      policy_decision_point: this.baseUrl,
      access_evaluation_endpoint: `${this.baseUrl}/access/v1/evaluation`,
      access_request_endpoint: `${this.baseUrl}/access/v1/requests`,
      jwks_uri: `${this.baseUrl}/access/v1/jwks`,
      capabilities: [ACCESS_REQUEST_CAPABILITY],
    };
  }

  jwks(): AuthzenJwksV1 {
    return { keys: [] };
  }

  evaluate(
    request: AuthzenAccessEvaluationRequestV1,
    runtime: AuthzenEvaluationRuntimeV1,
  ): AuthzenAccessEvaluationResponseV1 {
    this.assertEvaluationShape(request);
    const policy = this.options.policyResolver();
    const amount = amountMinor(request);
    const currency = requestCurrency(request);
    if (amount === undefined || currency !== this.options.currency) {
      return this.projectTerminalDeny("invalid_payment_request", "none");
    }

    if (!request.context?.actor?.id) return this.projectTerminalDeny("actor_required", "none");

    const approval = request.context.approval;
    if (approval) {
      const approvalRecord = this.approvalsById.get(approval.id);
      if (!approvalRecord || stableJson(approvalRecord.approval) !== stableJson(approval)) {
        return this.projectTerminalDeny("approval_unverifiable", "none");
      }
      if (exactScopeFingerprint(approvalRecord.boundRequest) !== exactScopeFingerprint(request)) {
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
        timestamp(runtime.evaluatedAt, "invalid_evaluated_at") >
          timestamp(approval.approved_until, "invalid_approved_until")
      ) {
        return this.projectTerminalDeny("approval_expired", "request");
      }
      return this.evaluateWarden(request, runtime, policy, "silk.payment.transfer.approved");
    }

    if (amount > this.options.delegationLimitMinor) {
      return this.evaluateWarden(request, runtime, policy, "silk.payment.transfer.out_of_bounds");
    }

    if (amount > this.options.approvalThresholdMinor) {
      const warden = this.evaluateWardenDecision(
        request,
        runtime,
        policy,
        "silk.payment.transfer.high_value",
      );
      if (warden.decision !== "ESCALATE") return this.projectWardenNonAllow(warden);

      const evaluatedAtMs = timestamp(runtime.evaluatedAt, "invalid_evaluated_at");
      const expiresAt = new Date(evaluatedAtMs + this.ttlMs).toISOString();
      const evaluationId = `eval_${digest(
        stableJson({
          requestId: runtime.requestId,
          request: exactScopeFingerprint(request),
          evaluatedAt: runtime.evaluatedAt,
        }),
      ).slice(0, 26)}`;
      this.evaluations.set(evaluationId, {
        expiresAt,
        fingerprint: exactScopeFingerprint(request),
        request: clone(request),
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
            native_decision: warden.decision,
            decision_ref: warden.decisionRef,
            reason_codes: warden.reasonCodes,
            next_lawful_action: "request_approval",
          },
        },
      };
    }

    return this.evaluateWarden(request, runtime, policy, "silk.payment.transfer");
  }

  submitAccessRequest(input: AuthzenSubmitAccessRequestInputV1): AuthzenTaskResponseV1 {
    const evaluationId = input.submission.denial.evaluation_id;
    if (!evaluationId) {
      throw new AuthzenProfileError(400, INVALID_REQUEST, "denial_evaluation_id_required");
    }
    const evaluation = this.evaluations.get(evaluationId);
    if (!evaluation) {
      throw new AuthzenProfileError(400, INVALID_REQUEST, "unknown_or_expired_evaluation");
    }
    const submittedAtMs = timestamp(input.submittedAt, "invalid_submitted_at");
    if (submittedAtMs > timestamp(evaluation.expiresAt, "invalid_evaluation_expiry")) {
      throw new AuthzenProfileError(400, INVALID_REQUEST, "requestable_denial_expired");
    }
    if (input.submission.denial.expires_at !== evaluation.expiresAt) {
      throw new AuthzenProfileError(400, INVALID_REQUEST, "denial_expiry_mismatch");
    }

    const submittedScope = exactScopeFingerprint({
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
    if (submittedScope !== evaluation.fingerprint) {
      throw new AuthzenProfileError(400, INVALID_REQUEST, "denial_scope_mismatch");
    }

    const idempotencyScope = `${input.requesterRef}\n${input.idempotencyKey}`;
    const bodyFingerprint = stableJson(input.submission);
    const existingTaskId = this.taskIdByIdempotency.get(idempotencyScope);
    if (existingTaskId) {
      const existing = this.tasksById.get(existingTaskId);
      if (!existing) throw new Error("authzen_internal_idempotency_state_missing");
      if (existing.fingerprint !== bodyFingerprint) {
        throw new AuthzenProfileError(
          409,
          DUPLICATE_REQUEST,
          "idempotency_key_reused_with_different_body",
        );
      }
      return clone(existing.response);
    }

    const taskId = `arq_${digest(
      stableJson({
        evaluationId,
        requesterRef: input.requesterRef,
        idempotencyKey: input.idempotencyKey,
      }),
    ).slice(0, 26)}`;
    const response: AuthzenTaskResponseV1 = {
      task: {
        id: taskId,
        status: "pending",
        status_endpoint: `${this.baseUrl}/access/v1/requests/${taskId}`,
        expires_at: input.submission.requested_access?.requested_until,
      },
    };
    this.tasksById.set(taskId, {
      fingerprint: bodyFingerprint,
      response,
      boundRequest: clone(evaluation.request),
    });
    this.taskIdByIdempotency.set(idempotencyScope, taskId);
    return clone(response);
  }

  approveAccessRequest(input: AuthzenApproveAccessRequestInputV1): AuthzenTaskResponseV1 {
    const stored = this.tasksById.get(input.taskId);
    if (!stored) throw new AuthzenProfileError(404, UNKNOWN_TASK, "unknown_task");
    if (stored.response.task.status !== "pending") {
      throw new AuthzenProfileError(409, INVALID_TASK_STATE, "task_not_pending");
    }
    timestamp(input.approvedAt, "invalid_approved_at");
    if (input.approvedUntil) timestamp(input.approvedUntil, "invalid_approved_until");

    const approval: AuthzenApprovalV1 = {
      id: `apr_${digest(
        stableJson({
          taskId: input.taskId,
          approvedAt: input.approvedAt,
          approvedUntil: input.approvedUntil ?? null,
        }),
      ).slice(0, 26)}`,
      approved_at: input.approvedAt,
      ...(input.approvedUntil ? { approved_until: input.approvedUntil } : {}),
    };
    const response: AuthzenTaskResponseV1 = {
      task: { ...stored.response.task, status: "approved" },
      result: { mode: "reevaluate", approval },
    };
    stored.response = response;
    this.approvalsById.set(approval.id, {
      approval: clone(approval),
      boundRequest: clone(stored.boundRequest),
    });
    return clone(response);
  }

  getAccessRequest(taskId: string): AuthzenTaskResponseV1 {
    const stored = this.tasksById.get(taskId);
    if (!stored) throw new AuthzenProfileError(404, UNKNOWN_TASK, "unknown_task");
    return clone(stored.response);
  }

  private assertEvaluationShape(request: AuthzenAccessEvaluationRequestV1): void {
    if (!request.subject?.type || !request.subject.id) throw new Error("authzen_subject_required");
    if (!request.resource?.type || !request.resource.id) throw new Error("authzen_resource_required");
    if (!request.action?.name) throw new Error("authzen_action_required");
  }

  private evaluateWarden(
    request: AuthzenAccessEvaluationRequestV1,
    runtime: AuthzenEvaluationRuntimeV1,
    policy: SyntheticWardenDecisionPolicyV1,
    capabilityRef: string,
  ): AuthzenAccessEvaluationResponseV1 {
    const normalized = this.normalizeWardenRequest(request, runtime, policy, capabilityRef);
    const decision = evaluateSyntheticWardenDecisionV1({
      request: normalized,
      policy,
      decidedAt: runtime.evaluatedAt,
    });
    if (decision.decision !== "ALLOW") return this.projectWardenNonAllow(decision);

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
          native_decision: decision.decision,
          decision_ref: decision.decisionRef,
          reason_codes: decision.reasonCodes,
          next_lawful_action: "execute_controlled_transfer",
          river_reservation_ref: reservation.reservationRef,
        },
      },
    };
  }

  private evaluateWardenDecision(
    request: AuthzenAccessEvaluationRequestV1,
    runtime: AuthzenEvaluationRuntimeV1,
    policy: SyntheticWardenDecisionPolicyV1,
    capabilityRef: string,
  ): WardenDecisionV1 {
    return evaluateSyntheticWardenDecisionV1({
      request: this.normalizeWardenRequest(request, runtime, policy, capabilityRef),
      policy,
      decidedAt: runtime.evaluatedAt,
    });
  }

  private normalizeWardenRequest(
    request: AuthzenAccessEvaluationRequestV1,
    runtime: AuthzenEvaluationRuntimeV1,
    policy: SyntheticWardenDecisionPolicyV1,
    capabilityRef: string,
  ): WardenDecisionRequestV1 {
    const actorRef = request.context?.actor?.id ?? "AUTHZEN:ACTOR:MISSING";
    const correlationId = `AUTHZEN-CORR:${digest(runtime.requestId).slice(0, 20)}`;
    return {
      requestRef: `AUTHZEN-REQUEST:${digest(stableJson({ runtime, request })).slice(0, 24)}`,
      actorRef,
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
      correlationId,
    };
  }

  private projectWardenNonAllow(decision: WardenDecisionV1): AuthzenAccessEvaluationResponseV1 {
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

  private projectTerminalDeny(
    reason: string,
    nextAction: string,
  ): AuthzenAccessEvaluationResponseV1 {
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
}
