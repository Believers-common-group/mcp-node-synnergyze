import type { VercelEveAdmissionResult } from "./vercel-eve-admission.js";

export type VercelEveTransportStatus = "STARTED" | "BLOCKED";
export type VercelEveTransportEventType =
  | "EVE_SESSION_TRANSPORT_STARTED"
  | "EVE_SESSION_TRANSPORT_BLOCKED";

export interface VercelEveTransportInput {
  admission: VercelEveAdmissionResult;
  endpoint: string;
  message: string;
  oidcToken?: string;
  fetchImpl?: typeof fetch;
  recordedAt: string;
}

export interface VercelEveTransportReceipt {
  receiptRef: string;
  eventType: VercelEveTransportEventType;
  requestRef: string;
  wardenDecisionRef: string;
  authorizedCapabilities: readonly string[];
  eveSessionId?: string;
  recordedAt: string;
}

export interface VercelEveTransportResult {
  status: VercelEveTransportStatus;
  sessionId?: string;
  riverReceipt: VercelEveTransportReceipt;
}

function transportReceipt(
  admission: VercelEveAdmissionResult,
  eventType: VercelEveTransportEventType,
  recordedAt: string,
  sessionId?: string,
): VercelEveTransportReceipt {
  const requestRef = admission.riverReceipt.requestRef;
  return {
    receiptRef: `RIVER:EVE:${requestRef}:${eventType}`,
    eventType,
    requestRef,
    wardenDecisionRef: admission.riverReceipt.wardenDecisionRef,
    authorizedCapabilities: [...admission.riverReceipt.authorizedCapabilities],
    eveSessionId: sessionId,
    recordedAt,
  };
}

function sessionEndpoint(endpoint: string): string {
  return `${endpoint.replace(/\/+$/, "")}/eve/v1/session`;
}

export async function startVercelEveSession(
  input: VercelEveTransportInput,
): Promise<VercelEveTransportResult> {
  if (input.admission.status !== "ADMITTED" || !input.admission.eveSessionRequest) {
    return {
      status: "BLOCKED",
      riverReceipt: transportReceipt(
        input.admission,
        "EVE_SESSION_TRANSPORT_BLOCKED",
        input.recordedAt,
      ),
    };
  }

  const fetchImpl = input.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (input.oidcToken) {
    headers.authorization = `Bearer ${input.oidcToken}`;
    headers["x-vercel-trusted-oidc-idp-token"] = input.oidcToken;
  }

  const response = await fetchImpl(sessionEndpoint(input.endpoint), {
    method: "POST",
    headers,
    body: JSON.stringify({ message: input.message }),
  });

  if (!response.ok) {
    throw new Error(`vercel_eve_session_start_failed:${response.status}`);
  }

  const sessionId = response.headers.get("x-eve-session-id") ?? undefined;
  if (!sessionId) {
    throw new Error("vercel_eve_session_id_missing");
  }

  return {
    status: "STARTED",
    sessionId,
    riverReceipt: transportReceipt(
      input.admission,
      "EVE_SESSION_TRANSPORT_STARTED",
      input.recordedAt,
      sessionId,
    ),
  };
}
