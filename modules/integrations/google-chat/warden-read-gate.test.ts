import { describe, expect, it } from "vitest";
import type { WardenDecisionV1 } from "../../warden/contracts.ts";
import {
  GOOGLE_CHAT_READ_SCOPES,
  evaluateGoogleChatReadGateV1,
  type GoogleChatPilotPolicyV1,
  type GoogleChatPilotReadRequestV1,
} from "./warden-read-gate.ts";

const policy: GoogleChatPilotPolicyV1 = {
  connectorRef: "GEN-CON-GCHAT-001",
  projectId: "triple-hour-458713-d9",
  lifecycle: "ACTIVE",
  oauthAgentClientVerified: true,
  developerPreviewVerified: true,
  providerApisVerified: true,
  expectedActorRef: "DIGITALME:TEST",
  expectedPrincipalRef: "PRINCIPAL:TEST",
  expectedProviderAccountRef: "GOOGLE:TEST",
  allowedSpaceRefs: ["spaces/TEST123"],
  validUntil: "2026-12-01T00:00:00Z",
};
const request: GoogleChatPilotReadRequestV1 = {
  tool: "list_messages",
  spaceRef: "spaces/TEST123",
  actorRef: "DIGITALME:TEST",
  principalRef: "PRINCIPAL:TEST",
  providerAccountRef: "GOOGLE:TEST",
  consentRef: "CONSENT:TEST",
  consentState: "ACTIVE",
  consentSpaceRefs: ["spaces/TEST123"],
  grantedScopes: [...GOOGLE_CHAT_READ_SCOPES],
  correlationId: "CORRELATION:TEST",
  wardenRequestRef: "WARDEN-REQUEST:TEST",
  now: "2026-11-21T10:00:00Z",
};
const decision: WardenDecisionV1 = {
  decision: "ALLOW",
  decisionRef: "WARDEN-DECISION:TEST",
  requestRef: request.wardenRequestRef,
  wardenRef: "WARDEN:TEST",
  action: "google_chat.list_messages",
  targetRef: request.spaceRef,
  correlationId: request.correlationId,
  reasonCodes: ["bounded_policy_allow"],
  constraints: [],
  decidedAt: "2026-11-21T09:59:00Z",
  validUntil: "2026-11-21T10:05:00Z",
  actionToken: "SYNTHETIC-TEST-ONLY",
};
const run = (
  p: GoogleChatPilotPolicyV1 = policy,
  r: GoogleChatPilotReadRequestV1 = request,
  d: WardenDecisionV1 = decision,
) => evaluateGoogleChatReadGateV1(p, r, d);

describe("GEN-CON-GCHAT-001 bounded Warden read gate", () => {
  it("allows only fully bound authorized read of allowlisted space", () => {
    expect(run()).toMatchObject({ permitted: true, tool: "list_messages", spaceRef: "spaces/TEST123" });
  });
  it("blocks connector on HOLD", () => expect(run({ ...policy, lifecycle: "HOLD" })).toMatchObject({ permitted: false }));
  it("blocks revoked connector", () => expect(run({ ...policy, lifecycle: "REVOKED" })).toMatchObject({ permitted: false }));
  it("blocks unverified AI client", () => expect(run({ ...policy, oauthAgentClientVerified: false })).toMatchObject({ permitted: false }));
  it("blocks missing preview qualification", () => expect(run({ ...policy, developerPreviewVerified: false })).toMatchObject({ permitted: false }));
  it("blocks write tool", () => expect(run(policy, { ...request, tool: "send_message" })).toMatchObject({ permitted: false }));
  it("blocks unauthorized search", () => expect(run(policy, { ...request, tool: "search_messages" })).toMatchObject({ permitted: false }));
  it("blocks another space", () => expect(run(policy, { ...request, spaceRef: "spaces/OTHER" })).toMatchObject({ permitted: false }));
  it("blocks malformed space", () => expect(run(policy, { ...request, spaceRef: "../spaces/TEST123" })).toMatchObject({ permitted: false }));
  it("blocks revoked consent", () => expect(run(policy, { ...request, consentState: "REVOKED" })).toMatchObject({ permitted: false }));
  it("blocks consent to a different space", () => expect(run(policy, { ...request, consentSpaceRefs: ["spaces/OTHER"] })).toMatchObject({ permitted: false }));
  it("blocks wrong provider account", () => expect(run(policy, { ...request, providerAccountRef: "GOOGLE:OTHER" })).toMatchObject({ permitted: false }));
  it("blocks missing scope", () => expect(run(policy, { ...request, grantedScopes: [] })).toMatchObject({ permitted: false }));
  it("blocks expired Warden decision", () => expect(run(policy, request, { ...decision, validUntil: "2026-11-21T09:00:00Z" })).toMatchObject({ permitted: false }));
  it("blocks Warden binding mismatch", () => expect(run(policy, request, { ...decision, targetRef: "spaces/OTHER" })).toMatchObject({ permitted: false }));
  it("blocks missing action token", () => expect(run(policy, request, { ...decision, actionToken: "" })).toMatchObject({ permitted: false }));
  it("blocks expired policy", () => expect(run({ ...policy, validUntil: "2026-11-20T00:00:00Z" })).toMatchObject({ permitted: false }));
  it("allows membership read with exact matching Warden action", () => {
    expect(run(policy, { ...request, tool: "list_memberships" }, { ...decision, action: "google_chat.list_memberships" })).toMatchObject({ permitted: true });
  });
});
