import {
  AuthzenProfileError,
  type AuthzenAccessEvaluationRequestV1,
  type AuthzenAccessEvaluationResponseV1,
  type AuthzenAccessRequestSubmissionV1,
  type AuthzenActionV1,
  type AuthzenEntityV1,
  type AuthzenTaskResponseV1,
} from "./authzen-profile.ts";
import type {
  AuthzenAccessEvaluationsRequestV1,
  AuthzenAccessEvaluationsResponseV1,
  AuthzenActionSearchRequestV1,
  AuthzenResourceSearchRequestV1,
  AuthzenSearchResponseV1,
  AuthzenSubjectSearchRequestV1,
} from "./authzen-http.ts";

const INVALID = "urn:openid:authzen:error:invalid_request";
const NOT_SUPPORTED = "urn:openid:authzen:error:not_supported";

const SUBJECTS: readonly AuthzenEntityV1[] = [
  { type: "user", id: "alice" },
  { type: "user", id: "bob", properties: { role: "admin" } },
];

const RESOURCES: readonly AuthzenEntityV1[] = [
  { type: "record", id: "record-1", properties: { status: "active" } },
  { type: "record", id: "record-2", properties: { status: "archived" } },
];

const ACTIONS: readonly AuthzenActionV1[] = [
  { name: "read" },
  { name: "write" },
  { name: "delete" },
];

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function knownSubject(subject: AuthzenEntityV1): boolean {
  return subject.type === "user" && SUBJECTS.some((candidate) => candidate.id === subject.id);
}

function knownResource(resource: AuthzenEntityV1): boolean {
  return resource.type === "record" && RESOURCES.some((candidate) => candidate.id === resource.id);
}

function knownAction(action: AuthzenActionV1): boolean {
  return ACTIONS.some((candidate) => candidate.name === action.name);
}

export class SyntheticAuthzenAuthorizationApi10CertificationPdpV1 {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  metadata() {
    return {
      policy_decision_point: this.baseUrl,
      access_evaluation_endpoint: `${this.baseUrl}/access/v1/evaluation`,
      access_evaluations_endpoint: `${this.baseUrl}/access/v1/evaluations`,
      search_subject_endpoint: `${this.baseUrl}/access/v1/search/subject`,
      search_resource_endpoint: `${this.baseUrl}/access/v1/search/resource`,
      search_action_endpoint: `${this.baseUrl}/access/v1/search/action`,
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

  evaluateMany(
    request: AuthzenAccessEvaluationsRequestV1,
    runtime: { evaluatedAt: string; requestId: string },
  ): AuthzenAccessEvaluationsResponseV1 | AuthzenAccessEvaluationResponseV1 {
    if (request.evaluations !== undefined && !Array.isArray(request.evaluations)) {
      throw new AuthzenProfileError(400, INVALID, "authzen_evaluations_array_required");
    }

    if (!request.evaluations || request.evaluations.length === 0) {
      return this.evaluate(
        {
          subject: request.subject as AuthzenEntityV1,
          action: request.action as AuthzenActionV1,
          resource: request.resource as AuthzenEntityV1,
          context: request.context,
        },
        runtime,
      );
    }

    const evaluations = request.evaluations.map((entry) => {
      const merged = {
        subject: entry.subject ?? request.subject,
        action: entry.action ?? request.action,
        resource: entry.resource ?? request.resource,
        context: entry.context ?? request.context,
      };

      if (!merged.subject?.type || !merged.subject.id) {
        return { decision: false, context: { reason: "authzen_subject_required" } };
      }
      if (!merged.action?.name) {
        return { decision: false, context: { reason: "authzen_action_required" } };
      }
      if (!merged.resource?.type || !merged.resource.id) {
        return { decision: false, context: { reason: "authzen_resource_required" } };
      }

      return this.evaluate(
        {
          subject: merged.subject,
          action: merged.action,
          resource: merged.resource,
          context: merged.context,
        },
        runtime,
      );
    });

    return { evaluations };
  }

  searchSubjects(
    request: AuthzenSubjectSearchRequestV1,
    runtime: { evaluatedAt: string; requestId: string },
  ): AuthzenSearchResponseV1<AuthzenEntityV1> {
    this.validateSubjectSearch(request);
    if (request.subject.type !== "user") return { results: [] };
    if (!knownResource(request.resource) || !knownAction(request.action)) return { results: [] };

    const results = SUBJECTS.filter((subject) =>
      this.evaluate(
        {
          subject,
          action: request.action,
          resource: request.resource,
          context: request.context,
        },
        runtime,
      ).decision,
    ).map(copy);

    return { results };
  }

  searchResources(
    request: AuthzenResourceSearchRequestV1,
    runtime: { evaluatedAt: string; requestId: string },
  ): AuthzenSearchResponseV1<AuthzenEntityV1> {
    this.validateResourceSearch(request);
    if (request.resource.type !== "record") return { results: [] };
    if (!knownSubject(request.subject) || !knownAction(request.action)) return { results: [] };

    const results = RESOURCES.filter((resource) =>
      this.evaluate(
        {
          subject: request.subject,
          action: request.action,
          resource,
          context: request.context,
        },
        runtime,
      ).decision,
    ).map(copy);

    return { results };
  }

  searchActions(
    request: AuthzenActionSearchRequestV1,
    runtime: { evaluatedAt: string; requestId: string },
  ): AuthzenSearchResponseV1<AuthzenActionV1> {
    this.validateActionSearch(request);
    if (!knownSubject(request.subject) || !knownResource(request.resource)) return { results: [] };

    const results = ACTIONS.filter((action) =>
      this.evaluate(
        {
          subject: request.subject,
          action,
          resource: request.resource,
          context: request.context,
        },
        runtime,
      ).decision,
    ).map((action) => ({ name: action.name }));

    return { results };
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

  private validateSubjectSearch(request: AuthzenSubjectSearchRequestV1): void {
    if (!request.subject?.type) {
      throw new AuthzenProfileError(400, INVALID, "authzen_subject_type_required");
    }
    if (!request.action?.name) {
      throw new AuthzenProfileError(400, INVALID, "authzen_action_required");
    }
    if (!request.resource?.type || !request.resource.id) {
      throw new AuthzenProfileError(400, INVALID, "authzen_resource_required");
    }
  }

  private validateResourceSearch(request: AuthzenResourceSearchRequestV1): void {
    if (!request.subject?.type || !request.subject.id) {
      throw new AuthzenProfileError(400, INVALID, "authzen_subject_required");
    }
    if (!request.action?.name) {
      throw new AuthzenProfileError(400, INVALID, "authzen_action_required");
    }
    if (!request.resource?.type) {
      throw new AuthzenProfileError(400, INVALID, "authzen_resource_type_required");
    }
  }

  private validateActionSearch(request: AuthzenActionSearchRequestV1): void {
    if (!request.subject?.type || !request.subject.id) {
      throw new AuthzenProfileError(400, INVALID, "authzen_subject_required");
    }
    if (!request.resource?.type || !request.resource.id) {
      throw new AuthzenProfileError(400, INVALID, "authzen_resource_required");
    }
  }
}
