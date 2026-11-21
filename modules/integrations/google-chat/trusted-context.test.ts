import { describe, expect, it } from "vitest";
import { GOOGLE_CHAT_READ_SCOPES } from "./warden-read-gate.ts";
import {
  resolveTrustedGoogleChatContextV1,
  type TrustedGoogleChatContextSourcesV1,
  type VerifiedSynnergyzeSessionV1,
  type RegisteredGoogleAccountV1,
  type GoogleChatConsentV1,
} from "./trusted-context.ts";

const now = "2026-11-21T09:00:00Z";
const session: VerifiedSynnergyzeSessionV1 = {
  sessionRef: "SESSION:TEST", issuer: "synnergyze-session",
  audience: "genesis-google-chat-mcp", state: "ACTIVE",
  actorRef: "DIGITALME:TEST", principalRef: "PRINCIPAL:TEST",
  actingCapacityRef: "CAPACITY:TEST",
  authenticatedAt: "2026-11-21T07:00:00Z",
  validUntil: "2026-11-21T10:00:00Z",
};
const account: RegisteredGoogleAccountV1 = {
  bindingRef: "GOOGLE:ACCOUNT-TEST", provider: "google",
  issuer: "https://accounts.google.com", lifecycle: "VERIFIED",
  actorRef: "DIGITALME:TEST", principalRef: "PRINCIPAL:TEST",
  subject: "12345678901234567890", enrollmentEvidenceRef: "RIVER:IDENTITY-VERIFIED",
  verifiedAt: "2026-11-21T08:00:00Z",
};
const consent: GoogleChatConsentV1 = {
  consentRef: "CONSENT:TEST", lifecycle: "ACTIVE",
  actorRef: "DIGITALME:TEST", principalRef: "PRINCIPAL:TEST",
  googleAccountBindingRef: "GOOGLE:ACCOUNT-TEST",
  purpose: "google-chat-read-pilot",
  approvedScopes: [...GOOGLE_CHAT_READ_SCOPES],
  allowedSpaceRefs: ["spaces/TEST123"],
  validFrom: "2026-11-21T08:00:00Z",
  validUntil: "2026-11-21T10:00:00Z",
};
const request = {
  accountBindingRef: "GOOGLE:ACCOUNT-TEST",
  targetSpaceRef: "spaces/TEST123",
  wardenRequestRef: "WARDEN-REQUEST:TEST",
  correlationId: "CORR:TEST",
  now,
};
function sources(options: {
  session?: VerifiedSynnergyzeSessionV1 | null;
  account?: RegisteredGoogleAccountV1 | null;
  consent?: GoogleChatConsentV1 | null;
} = {}): TrustedGoogleChatContextSourcesV1 {
  return {
    async verifyCurrentSession() {
      return options.session === undefined ? session : options.session;
    },
    async findGoogleAccount() {
      return options.account === undefined ? account : options.account;
    },
    async findConsent() {
      return options.consent === undefined ? consent : options.consent;
    },
  };
}
const run = (options: Parameters<typeof sources>[0] = {}, req = request) =>
  resolveTrustedGoogleChatContextV1(sources(options), req);
const denied = async (result: ReturnType<typeof run>, code: string) =>
  expect(await result).toEqual({ ok: false, code });

describe("GEN-CON-GCHAT-001 trusted session and consent gate", () => {
  it("binds independently verified session, Google subject and consent", async () => {
    const result = await run();
    expect(result).toMatchObject({
      ok: true,
      registeredGoogleSubject: account.subject,
      sessionRef: session.sessionRef,
      binding: {
        actorRef: session.actorRef,
        principalRef: session.principalRef,
        googleAccountBindingRef: account.bindingRef,
        consentRef: consent.consentRef,
      },
    });
  });
  it("rejects unauthenticated session", async () =>
    denied(run({ session: null }), "session_not_verified"));
  it("rejects revoked session", async () =>
    denied(run({ session: { ...session, state: "REVOKED" } }), "session_not_active"));
  it("rejects wrong session audience", async () =>
    denied(run({ session: { ...session, audience: "other" as typeof session.audience } }), "session_not_active"));
  it("rejects expired session", async () =>
    denied(run({ session: { ...session, validUntil: "2026-11-21T08:00:00Z" } }), "session_expired_or_invalid"));
  it("rejects wrong principal on account", async () =>
    denied(run({ account: { ...account, principalRef: "OTHER" } }), "google_account_not_verified"));
  it("rejects unverified account", async () =>
    denied(run({ account: { ...account, lifecycle: "PENDING" } }), "google_account_not_verified"));
  it("rejects future Google enrollment", async () =>
    denied(run({ account: { ...account, verifiedAt: "2026-11-22T08:00:00Z" } }), "google_enrollment_invalid"));
  it("rejects revoked consent", async () =>
    denied(run({ consent: { ...consent, lifecycle: "REVOKED" } }), "consent_not_active"));
  it("rejects expired consent", async () =>
    denied(run({ consent: { ...consent, validUntil: "2026-11-21T08:30:00Z" } }), "consent_expired_or_invalid"));
  it("rejects too broad consent", async () =>
    denied(run({ consent: { ...consent, approvedScopes: [
      ...GOOGLE_CHAT_READ_SCOPES, "https://www.googleapis.com/auth/chat.messages.create",
    ] } }), "consent_scope_mismatch"));
  it("rejects insufficient consent", async () =>
    denied(run({ consent: { ...consent, approvedScopes: [GOOGLE_CHAT_READ_SCOPES[0]] } }), "consent_scope_mismatch"));
  it("rejects another space", async () =>
    denied(run({}, { ...request, targetSpaceRef: "spaces/OTHER" }), "space_not_consented"));
  it("rejects malformed space", async () =>
    denied(run({}, { ...request, targetSpaceRef: "../spaces/TEST123" }), "invalid_request_scope"));
  it("rejects missing account registration", async () =>
    denied(run({ account: null }), "google_account_not_verified"));
  it("rejects source failure", async () => {
    const broken: TrustedGoogleChatContextSourcesV1 = {
      async verifyCurrentSession(): Promise<VerifiedSynnergyzeSessionV1 | null> {
        throw Error("database unavailable");
      },
      async findGoogleAccount() { return account; },
      async findConsent() { return consent; },
    };
    await denied(resolveTrustedGoogleChatContextV1(broken, request), "trusted_context_unavailable");
  });
  it("does not produce a Warden ALLOW token or external read receipt", async () => {
    const result = await run();
    expect(result).toMatchObject({ ok: true });
    expect(result).not.toHaveProperty("actionToken");
    expect(result).not.toHaveProperty("authorization");
    expect(result).not.toHaveProperty("riverReceipt");
  });
});
