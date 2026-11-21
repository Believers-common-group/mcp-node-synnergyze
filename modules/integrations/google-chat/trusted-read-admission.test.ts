import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { WardenDecisionV1 } from "../../warden/contracts.ts";
import { GOOGLE_CHAT_READ_SCOPES } from "./warden-read-gate.ts";
import {
  prepareTrustedGoogleChatReadV1,
  type GoogleChatTrustedReadSourcesV1,
  type InternalGoogleChatReadIntentV1,
} from "./trusted-read-admission.ts";
import type {
  VerifiedSynnergyzeSessionV1,
  RegisteredGoogleAccountV1,
  GoogleChatConsentV1,
} from "./trusted-context.ts";

const now = "2026-11-21T09:00:00Z";
const intent: InternalGoogleChatReadIntentV1 = {
  accountBindingRef: "GOOGLE:ACCOUNT-TEST",
  spaceRef: "spaces/TEST123",
  tool: "list_messages",
  wardenRequestRef: "WARDEN-REQUEST:TEST",
  correlationId: "CORR:TEST",
};
const session: VerifiedSynnergyzeSessionV1 = {
  sessionRef: "SESSION:TEST", issuer: "synnergyze-session",
  audience: "genesis-google-chat-mcp", state: "ACTIVE",
  actorRef: "DIGITALME:TEST", principalRef: "PRINCIPAL:TEST",
  actingCapacityRef: "CAPACITY:TEST",
  authenticatedAt: "2026-11-21T07:00:00Z",
  validUntil: "2026-11-21T10:00:00Z",
};
const account: RegisteredGoogleAccountV1 = {
  bindingRef: intent.accountBindingRef, provider: "google",
  issuer: "https://accounts.google.com", lifecycle: "VERIFIED",
  actorRef: session.actorRef, principalRef: session.principalRef,
  subject: "12345678901234567890", enrollmentEvidenceRef: "RIVER:IDENTITY-VERIFIED",
  verifiedAt: "2026-11-21T08:00:00Z",
};
const consent: GoogleChatConsentV1 = {
  consentRef: "CONSENT:TEST", lifecycle: "ACTIVE",
  actorRef: session.actorRef, principalRef: session.principalRef,
  googleAccountBindingRef: intent.accountBindingRef,
  purpose: "google-chat-read-pilot",
  approvedScopes: [...GOOGLE_CHAT_READ_SCOPES],
  allowedSpaceRefs: [intent.spaceRef],
  validFrom: "2026-11-21T08:00:00Z",
  validUntil: "2026-11-21T10:00:00Z",
};
const actionToken = "SYNTHETIC-TEST-ONLY";
const decision: WardenDecisionV1 = {
  decision: "ALLOW", decisionRef: "WARDEN-DECISION:TEST",
  requestRef: intent.wardenRequestRef, wardenRef: "WARDEN:TEST",
  action: "google_chat.list_messages", targetRef: intent.spaceRef,
  correlationId: intent.correlationId,
  reasonCodes: ["bounded_policy_allow"], constraints: [],
  decidedAt: "2026-11-21T08:58:00Z",
  validUntil: "2026-11-21T09:05:00Z",
  actionToken,
};
const digest = (value: string) => "sha256:" + createHash("sha256").update(value).digest("hex");

function buildSources(options: {
  session?: VerifiedSynnergyzeSessionV1 | null;
  account?: RegisteredGoogleAccountV1 | null;
  consent?: GoogleChatConsentV1 | null;
  decision?: WardenDecisionV1 | null;
  verified?: boolean;
  policyState?: "ACTIVE" | "HOLD" | "REVOKED";
  scopes?: readonly string[];
  wrongDigest?: boolean;
  checkpointState?: "VALID" | "REVOKED";
  throwPolicy?: boolean;
} = {}) {
  let reservationCalls = 0;
  const sources: GoogleChatTrustedReadSourcesV1 = {
    context: {
      async verifyCurrentSession() { return options.session === undefined ? session : options.session; },
      async findGoogleAccount() { return options.account === undefined ? account : options.account; },
      async findConsent() { return options.consent === undefined ? consent : options.consent; },
    },
    async getPolicy() {
      if (options.throwPolicy) throw new Error("provider_unavailable");
      return {
        connectorRef: "GEN-CON-GCHAT-001",
        projectId: "triple-hour-458713-d9",
        lifecycle: options.policyState ?? "ACTIVE",
        oauthAgentClientVerified: true,
        developerPreviewVerified: true,
        providerApisVerified: true,
        expectedActorRef: session.actorRef,
        expectedPrincipalRef: session.principalRef,
        expectedProviderAccountRef: account.bindingRef,
        allowedSpaceRefs: [intent.spaceRef],
        validUntil: "2026-11-21T10:00:00Z",
      };
    },
    async getProviderGrantedScopes() { return options.scopes ?? GOOGLE_CHAT_READ_SCOPES; },
    async getVerifiedWardenDecision() {
      if (options.verified === false || options.decision === null) return null;
      return { verified: true, verificationRef: "WARDEN-VERIFICATION:TEST", decision: options.decision ?? decision };
    },
    async reserveRiverEvidence() {
      reservationCalls += 1;
      return {
        actionRef: "ACTION:TEST",
        reservation: {
          reservationRef: "RIVER-RESERVATION:TEST",
          actionRef: "ACTION:TEST",
          wardenDecisionRef: decision.decisionRef,
          correlationId: intent.correlationId,
          authorizationDigest: options.wrongDigest ? "sha256:invalid" : digest(actionToken),
          state: "RESERVED",
          reservedAt: "2026-11-21T08:59:00Z",
        },
        checkpoint: {
          checkpointRef: "WARDEN-CHECKPOINT:TEST",
          decisionRef: decision.decisionRef,
          wardenRef: decision.wardenRef,
          correlationId: intent.correlationId,
          checkedAt: "2026-11-21T08:59:30Z",
          reasonCodes: [],
          state: options.checkpointState ?? "VALID",
        },
      };
    },
    now() { return now; },
  };
  return { sources, getReservationCalls: () => reservationCalls };
}

describe("GEN-CON-GCHAT-001 read readiness without external effect", () => {
  it("returns only bounded read-readiness receipt on complete trusted chain", async () => {
    const {sources, getReservationCalls} = buildSources();
    const response = await prepareTrustedGoogleChatReadV1(sources, intent);
    expect(response).toMatchObject({
      ok: true, state: "READ_READY_NO_EXTERNAL_EFFECT", tool: "list_messages",
      spaceRef: intent.spaceRef, actorRef: session.actorRef,
      principalRef: session.principalRef, googleAccountBindingRef: account.bindingRef,
      wardenDecisionRef: decision.decisionRef, riverReservationRef: "RIVER-RESERVATION:TEST",
      correlationId: intent.correlationId,
    });
    expect(response).not.toHaveProperty("accessToken");
    expect(response).not.toHaveProperty("messages");
    expect(getReservationCalls()).toBe(1);
  });
  it("denies missing authenticated session before River reservation", async () => {
    const {sources, getReservationCalls} = buildSources({session:null});
    expect(await prepareTrustedGoogleChatReadV1(sources,intent))
      .toEqual({ok:false,code:"session_not_verified"});
    expect(getReservationCalls()).toBe(0);
  });
  it("denies revoked consent before Warden/River execution", async () => {
    const {sources, getReservationCalls} = buildSources({consent:{...consent,lifecycle:"REVOKED"}});
    expect(await prepareTrustedGoogleChatReadV1(sources,intent))
      .toEqual({ok:false,code:"consent_not_active"});
    expect(getReservationCalls()).toBe(0);
  });
  it("denies another space before River reservation", async () => {
    const {sources,getReservationCalls}=buildSources();
    expect(await prepareTrustedGoogleChatReadV1(sources,{...intent,spaceRef:"spaces/OTHER"}))
      .toEqual({ok:false,code:"space_not_consented"});
    expect(getReservationCalls()).toBe(0);
  });
  it("denies missing Warden verification", async () => {
    const {sources,getReservationCalls}=buildSources({verified:false});
    expect(await prepareTrustedGoogleChatReadV1(sources,intent))
      .toEqual({ok:false,code:"warden_authority_unverified"});
    expect(getReservationCalls()).toBe(0);
  });
  it("denies Warden decision for another target", async () => {
    const {sources,getReservationCalls}=buildSources({decision:{...decision,targetRef:"spaces/OTHER"}});
    expect(await prepareTrustedGoogleChatReadV1(sources,intent))
      .toEqual({ok:false,code:"warden_decision_binding_mismatch"});
    expect(getReservationCalls()).toBe(0);
  });
  it("denies non-ALLOW Warden decision", async () => {
    const {sources,getReservationCalls}=buildSources({decision:{
      ...decision, decision:"DENY", actionToken:undefined,
    } as WardenDecisionV1});
    expect(await prepareTrustedGoogleChatReadV1(sources,intent))
      .toEqual({ok:false,code:"warden_not_allowed"});
    expect(getReservationCalls()).toBe(0);
  });
  it("denies provider scope missing", async () => {
    const {sources,getReservationCalls}=buildSources({scopes:[]});
    expect(await prepareTrustedGoogleChatReadV1(sources,intent))
      .toEqual({ok:false,code:"provider_scopes_not_exact_readonly"});
    expect(getReservationCalls()).toBe(0);
  });
  it("denies overbroad provider permissions even when read scopes are present", async () => {
    const {sources,getReservationCalls}=buildSources({scopes:[
      ...GOOGLE_CHAT_READ_SCOPES, "https://www.googleapis.com/auth/chat.messages.create",
    ]});
    expect(await prepareTrustedGoogleChatReadV1(sources,intent))
      .toEqual({ok:false,code:"provider_scopes_not_exact_readonly"});
    expect(getReservationCalls()).toBe(0);
  });
  it("denies connector HOLD", async () => {
    const {sources,getReservationCalls}=buildSources({policyState:"HOLD"});
    expect(await prepareTrustedGoogleChatReadV1(sources,intent))
      .toEqual({ok:false,code:"connector_not_active"});
    expect(getReservationCalls()).toBe(0);
  });
  it("denies tampered authorization digest", async () => {
    const {sources}=buildSources({wrongDigest:true});
    expect(await prepareTrustedGoogleChatReadV1(sources,intent))
      .toEqual({ok:false,code:"river_reservation_or_checkpoint_invalid"});
  });
  it("denies revoked checkpoint", async () => {
    const {sources}=buildSources({checkpointState:"REVOKED"});
    expect(await prepareTrustedGoogleChatReadV1(sources,intent))
      .toEqual({ok:false,code:"river_reservation_or_checkpoint_invalid"});
  });
  it("fails closed if trusted policy service is unavailable", async () => {
    const {sources,getReservationCalls}=buildSources({throwPolicy:true});
    expect(await prepareTrustedGoogleChatReadV1(sources,intent))
      .toEqual({ok:false,code:"trusted_read_admission_unavailable"});
    expect(getReservationCalls()).toBe(0);
  });
});
