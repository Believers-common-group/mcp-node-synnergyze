import { createHash } from "node:crypto";

import type {
  EstateCapabilityV1,
  EstateConsoleAdmissionRequestV1,
  EstateConsoleAdmissionResultV1,
  EstateConsoleSessionV1,
} from "./contracts.ts";

export interface EstateConsoleAdmissionProjectionV1 {
  readonly principalRef: string;
  readonly deviceRef: string;
  readonly consoleRef: string;
  readonly nodeRef: string;
  readonly estateRef: string;
  readonly deviceState: "ACTIVE" | "REVOKED";
  readonly profileRef: string;
  readonly capabilities: readonly EstateCapabilityV1[];
  readonly sourceRefs: readonly string[];
  readonly validFrom: string;
  readonly validUntil: string;
}

export interface EstateConsoleAdmissionResolverV1 {
  resolve(
    request: EstateConsoleAdmissionRequestV1,
  ): EstateConsoleAdmissionProjectionV1 | undefined;
}

export type EstateConsoleSessionValidationV1 =
  | { readonly active: true; readonly session: EstateConsoleSessionV1 }
  | { readonly active: false; readonly reasonCode: string };

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function timestamp(value: string): number | undefined {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stableUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function denied(
  request: EstateConsoleAdmissionRequestV1,
  reasonCode: string,
): EstateConsoleAdmissionResultV1 {
  return {
    state: "DENIED",
    reasonCode,
    correlationId: request.correlationId,
  };
}

function exactContextMatch(
  request: EstateConsoleAdmissionRequestV1,
  projection: EstateConsoleAdmissionProjectionV1,
): boolean {
  return (
    request.principalRef === projection.principalRef &&
    request.deviceRef === projection.deviceRef &&
    request.consoleRef === projection.consoleRef &&
    request.nodeRef === projection.nodeRef &&
    request.requestedProfileRef === projection.profileRef
  );
}

function sessionRef(
  request: EstateConsoleAdmissionRequestV1,
  projection: EstateConsoleAdmissionProjectionV1,
): string {
  const identity = JSON.stringify({
    principalRef: projection.principalRef,
    deviceRef: projection.deviceRef,
    consoleRef: projection.consoleRef,
    nodeRef: projection.nodeRef,
    estateRef: projection.estateRef,
    profileRef: projection.profileRef,
    capabilities: stableUnique(projection.capabilities),
    admittedAt: request.requestedAt,
    correlationId: request.correlationId,
  });
  return `ESTATE-CONSOLE-SESSION:${digest(identity).slice(0, 24)}`;
}

export class SyntheticEstateConsoleSessionServiceV1 {
  private readonly sessions = new Map<string, EstateConsoleSessionV1>();

  constructor(private readonly resolver: EstateConsoleAdmissionResolverV1) {}

  admit(request: EstateConsoleAdmissionRequestV1): EstateConsoleAdmissionResultV1 {
    const projection = this.resolver.resolve(request);
    if (!projection) {
      return {
        state: "ENROLLMENT_REQUIRED",
        reasonCode: "DEVICE_NOT_REGISTERED",
        correlationId: request.correlationId,
      };
    }

    if (projection.deviceState !== "ACTIVE") {
      return denied(request, "DEVICE_REVOKED");
    }

    if (!exactContextMatch(request, projection)) {
      return denied(request, "IDENTITY_CONTEXT_MISMATCH");
    }

    const requestedAt = timestamp(request.requestedAt);
    const validFrom = timestamp(projection.validFrom);
    const validUntil = timestamp(projection.validUntil);
    if (
      requestedAt === undefined ||
      validFrom === undefined ||
      validUntil === undefined ||
      validUntil < validFrom
    ) {
      return denied(request, "INVALID_TIME_CONTEXT");
    }
    if (requestedAt < validFrom || requestedAt > validUntil) {
      return denied(request, "ADMISSION_WINDOW_CLOSED");
    }

    const ref = sessionRef(request, projection);
    const existing = this.sessions.get(ref);
    if (existing?.state === "REVOKED") {
      return denied(request, "SESSION_REVOKED");
    }
    if (existing?.state === "CLOSED") {
      return denied(request, "SESSION_CLOSED");
    }
    if (existing?.state === "ACTIVE") {
      return { state: "ISSUED", session: existing };
    }

    const session: EstateConsoleSessionV1 = {
      sessionRef: ref,
      principalRef: projection.principalRef,
      deviceRef: projection.deviceRef,
      consoleRef: projection.consoleRef,
      estateRef: projection.estateRef,
      nodeRef: projection.nodeRef,
      profileRef: projection.profileRef,
      environment: "STAGING",
      capabilities: [...projection.capabilities],
      state: "ACTIVE",
      admittedAt: request.requestedAt,
      validUntil: projection.validUntil,
      sourceRefs: stableUnique(projection.sourceRefs),
      correlationId: request.correlationId,
    };

    this.sessions.set(ref, session);
    return { state: "ISSUED", session };
  }

  validateSession(sessionRefValue: string, at: string): EstateConsoleSessionValidationV1 {
    const session = this.sessions.get(sessionRefValue);
    if (!session) return { active: false, reasonCode: "SESSION_NOT_FOUND" };
    if (session.state === "REVOKED") return { active: false, reasonCode: "SESSION_REVOKED" };
    if (session.state === "CLOSED") return { active: false, reasonCode: "SESSION_CLOSED" };
    if (session.state === "EXPIRED") return { active: false, reasonCode: "SESSION_EXPIRED" };

    const checkedAt = timestamp(at);
    const validUntil = timestamp(session.validUntil);
    if (checkedAt === undefined || validUntil === undefined) {
      return { active: false, reasonCode: "INVALID_TIME_CONTEXT" };
    }
    if (checkedAt > validUntil) {
      this.sessions.set(sessionRefValue, { ...session, state: "EXPIRED" });
      return { active: false, reasonCode: "SESSION_EXPIRED" };
    }

    return { active: true, session };
  }

  revokeSession(sessionRefValue: string, revokedAt: string): void {
    const session = this.sessions.get(sessionRefValue);
    if (!session) throw new Error("estate_console_session_not_found");
    if (timestamp(revokedAt) === undefined) throw new Error("estate_console_invalid_revocation_time");
    this.sessions.set(sessionRefValue, { ...session, state: "REVOKED" });
  }
}
