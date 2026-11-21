/**
 * Google Chat MCP Pilot 01: immutable pre-execution read guard.
 * This guard is only one layer. Its Warden decision MUST originate from a
 * trusted internal Warden service; untrusted callers may not supply it.
 * No external tool calls, OAuth flows or secret handling occur here.
 */
import type { WardenDecisionV1 } from "../../warden/contracts.ts";

export const GOOGLE_CHAT_MCP_URL = "https://chatmcp.googleapis.com/mcp/v1";
export const GOOGLE_CHAT_READ_SCOPES = [
  "https://www.googleapis.com/auth/chat.spaces.readonly",
  "https://www.googleapis.com/auth/chat.messages.readonly",
  "https://www.googleapis.com/auth/chat.memberships.readonly",
] as const;

export const GOOGLE_CHAT_PILOT_TOOLS = ["list_messages", "list_memberships"] as const;
export type GoogleChatPilotTool = (typeof GOOGLE_CHAT_PILOT_TOOLS)[number];

export type GoogleChatPilotPolicyV1 = Readonly<{
  connectorRef: "GEN-CON-GCHAT-001";
  projectId: "triple-hour-458713-d9";
  lifecycle: "HOLD" | "ACTIVE" | "REVOKED";
  oauthAgentClientVerified: boolean;
  developerPreviewVerified: boolean;
  providerApisVerified: boolean;
  expectedActorRef: string;
  expectedPrincipalRef: string;
  expectedProviderAccountRef: string;
  allowedSpaceRefs: readonly string[];
  validUntil: string;
}>;

export type GoogleChatPilotReadRequestV1 = Readonly<{
  tool: string;
  spaceRef: string;
  actorRef: string;
  principalRef: string;
  providerAccountRef: string;
  consentRef: string;
  consentState: "ACTIVE" | "REVOKED" | "EXPIRED";
  consentSpaceRefs: readonly string[];
  grantedScopes: readonly string[];
  correlationId: string;
  wardenRequestRef: string;
  now: string;
}>;

export type GoogleChatGateResultV1 =
  | { permitted: false; code: string }
  | { permitted: true; connectorRef: string; tool: GoogleChatPilotTool; spaceRef: string; correlationId: string };

function deny(code: string): GoogleChatGateResultV1 {
  return { permitted: false, code };
}

/** Call only after an authenticated internal Warden decision is resolved. */
export function evaluateGoogleChatReadGateV1(
  policy: GoogleChatPilotPolicyV1,
  request: GoogleChatPilotReadRequestV1,
  decision: WardenDecisionV1,
): GoogleChatGateResultV1 {
  if (policy.lifecycle !== "ACTIVE") return deny("connector_not_active");
  if (!policy.oauthAgentClientVerified || !policy.developerPreviewVerified || !policy.providerApisVerified) {
    return deny("provider_qualification_pending");
  }
  if (!GOOGLE_CHAT_PILOT_TOOLS.some((tool) => tool === request.tool)) {
    return deny("tool_not_pilot_allowlisted");
  }
  if (!/^spaces\/[A-Za-z0-9_-]+$/.test(request.spaceRef)) return deny("invalid_space_ref");
  if (!policy.allowedSpaceRefs.includes(request.spaceRef)) return deny("space_not_allowlisted");
  if (request.consentState !== "ACTIVE" || !request.consentRef.trim()) {
    return deny("consent_not_active");
  }
  if (!request.consentSpaceRefs.includes(request.spaceRef)) return deny("consent_space_mismatch");
  if (
    request.actorRef !== policy.expectedActorRef ||
    request.principalRef !== policy.expectedPrincipalRef ||
    request.providerAccountRef !== policy.expectedProviderAccountRef
  ) return deny("identity_or_account_mismatch");
  const nowMs = Date.parse(request.now);
  const validUntilMs = Date.parse(policy.validUntil);
  if (!Number.isFinite(nowMs) || !Number.isFinite(validUntilMs) || nowMs > validUntilMs) {
    return deny("policy_expired_or_invalid_time");
  }
  for (const scope of GOOGLE_CHAT_READ_SCOPES) {
    if (!request.grantedScopes.includes(scope)) return deny("scope_missing");
  }
  if (decision.decision !== "ALLOW") return deny("warden_not_allowed");
  if (
    decision.action !== "google_chat." + request.tool ||
    decision.targetRef !== request.spaceRef ||
    decision.requestRef !== request.wardenRequestRef ||
    decision.correlationId !== request.correlationId ||
    !decision.actionToken
  ) return deny("warden_decision_binding_mismatch");
  const decidedAtMs = Date.parse(decision.decidedAt);
  const decisionValidUntilMs = Date.parse(decision.validUntil ?? "");
  if (
    !Number.isFinite(decidedAtMs) || !Number.isFinite(decisionValidUntilMs) ||
    decidedAtMs > nowMs || nowMs > decisionValidUntilMs
  ) return deny("warden_decision_expired_or_invalid_time");
  // This is NOT authorization for search_conversations, sending or writes.
  return {
    permitted: true,
    connectorRef: policy.connectorRef,
    tool: request.tool as GoogleChatPilotTool,
    spaceRef: request.spaceRef,
    correlationId: request.correlationId,
  };
}
