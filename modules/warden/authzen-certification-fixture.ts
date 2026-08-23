import {
  AuthzenProfileError,
  type AuthzenAccessEvaluationRequestV1,
  type AuthzenAccessEvaluationResponseV1,
  type AuthzenAccessRequestSubmissionV1,
  type AuthzenTaskResponseV1,
} from "./authzen-profile.ts";

const INVALID = "urn:openid:authzen:error:invalid_request";
const NOT_SUPPORTED = "urn:openid:authzen:error:not_supported";

export class SyntheticAuthzenAuthorizationApi10CertificationPdpV1 {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  metadata() {
    return {
      policy_decision_point: this.baseUrl,
      access_evaluation_endpoint: `${this.baseUrl}/access/v1/evaluation`,
    } as const;
  }

  evaluate(
    request: AuthzenAccessEvaluationRequestV1,
    _runtime: { evaluatedAt: string; requestId: string },
  ): AuthzenAccessEvaluationResponseV1 {
    this.validateRequest(request);

    const subjectRole = request.subject.properties?.role;
    const resourceStatus = request.resource.properties?.status;
    const softDelete = request.action.properties?.soft;

    if (request.action.name === "write" && resourceStatus === "archived") {
      return { decision: subjectRole === "admin" };
    }

    if (
      request.subject.id === "alice" &&
      request.action.name === "delete" &&
      request.resource.id === "record-1"
    ) {
      return { decision: softDelete === true };
    }

    if (
      request.subject.id === "alice" &&
      request.resource.id === "record-1" &&
      (request.action.name === "read" || request.action.name === "write")
    ) {
      return { decision: true };
    }

    if (
      request.subject.id === "bob" &&
      request.resource.id === "record-1" &&
      request.action.name === "read"
    ) {
      return { decision: true };
    }

    return { decision: false };
  }

  submitAccessRequest(_input: {
    submission: AuthzenAccessRequestSubmissionV1;
    requesterRef: string;
    idempotencyKey: string;
    submittedAt: string;
  }): AuthzenTaskResponseV1 {
    throw new AuthzenProfileError(404, NOT_SUPPORTED, "access_request_profile_not_enabled");
  }

  getAccessRequest(_taskId: string): AuthzenTaskResponseV1 {
    throw new AuthzenProfileError(404, NOT_SUPPORTED, "access_request_profile_not_enabled");
  }

  private validateRequest(request: AuthzenAccessEvaluationRequestV1): void {
    if (!request.subject?.type || !request.subject.id) {
      throw new AuthzenProfileError(400, INVALID, "authzen_subject_required");
    }
    if (!request.resource?.type || !request.resource.id) {
      throw new AuthzenProfileError(400, INVALID, "authzen_resource_required");
    }
    if (!request.action?.name) {
      throw new AuthzenProfileError(400, INVALID, "authzen_action_required");
    }
  }
}
