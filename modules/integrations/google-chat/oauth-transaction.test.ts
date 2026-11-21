import type { GoogleChatOAuthVault } from "./oauth-transaction.ts";
import { describe, it, expect } from "vitest";
import { strict as assert } from "node:assert";
import { randomBytes } from "node:crypto";
import {
  beginGoogleChatOAuth,
  validateGoogleChatOAuthCallback,
  exchangeAndVaultGoogleChatOAuth,
  GOOGLE_OAUTH_CLEAR_COOKIE,
} from "./oauth-transaction.ts";

const key = randomBytes(32);
const actor = "DIGITALME:TEST";
const binding = {
  actorRef: actor, principalRef: "PRINCIPAL:TEST",
  googleAccountBindingRef: "GOOGLE:TEST",
  consentRef: "CONSENT:TEST", wardenRequestRef: "WDR:TEST",
  correlationId: "CORR:TEST",
};
const callback = "https://synnergyze-genesis-mcp.vercel.app/api/google-chat-oauth-callback";
const clientId = "123456789-abcdef.apps.googleusercontent.com";
const now = 1800000000000;

function start(overrides: Record<string, unknown> = {}) {
  return beginGoogleChatOAuth({
    binding, clientId, redirectUri: callback,
    expectedOrigin: "https://synnergyze-genesis-mcp.vercel.app",
    sealingKey: key, now, ...overrides,
  });
}
function cb(result: ReturnType<typeof start>, overrides: Record<string, unknown> = {}) {
  return validateGoogleChatOAuthCallback({
    cookieHeader: result.setCookie.split(";")[0],
    state: new URL(result.authorizationUrl).searchParams.get("state"),
    code: "google-authorization-code", error: null,
    expectedRedirectUri: callback,
    expectedOrigin: "https://synnergyze-genesis-mcp.vercel.app",
    trustedCurrentActorRef: actor,
    sealingKey: key, now: now + 1000, ...overrides,
  });
}
function throws(f: () => unknown, name: string) {
  assert.throws(f, (e: unknown) => e instanceof Error && e.message === name);
}

describe("GEN-CON-GCHAT-001 OAuth offline conformance", () => {
  it("starts only read-only PKCE S256 OAuth and sets secure cookie", () => {
    const x = start(), u = new URL(x.authorizationUrl);
    expect(u.hostname).toBe("accounts.google.com");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("redirect_uri")).toBe(callback);
    expect(u.searchParams.get("access_type")).toBe("online");
    expect(u.searchParams.get("scope")?.split(" ")).toHaveLength(4);
    expect(u.searchParams.get("scope")?.split(" ")).toContain("openid");
    expect(u.searchParams.get("nonce")).toHaveLength(43);
    expect(u.searchParams.get("scope")).not.toContain("create");
    expect(x.setCookie).toContain("HttpOnly; Secure; SameSite=Lax; Max-Age=600");
    expect(x.authorizationUrl).not.toContain(actor);
    expect(x.setCookie).not.toContain(actor);
  });
  it("valid callback restores sealed trusted binding", () => {
    const x = cb(start()); expect(x.binding.actorRef).toBe(actor);
    expect(x.redirectUri).toBe(callback); expect(x.verifier).toHaveLength(43);
  });
  it("rejects altered state", () => throws(() => cb(start(), {state:"a".repeat(43)}),"oauth_state_mismatch"));
  it("rejects absent cookie", () => throws(() => cb(start(), {cookieHeader:undefined}),"oauth_session_missing"));
  it("rejects forged cookie", () => throws(() => cb(start(), {cookieHeader:"__Host-synnergyze-gchat-oauth="+ "a".repeat(100)}),"oauth_session_cookie_invalid"));
  it("rejects a wrong sealing key", () => throws(() => cb(start(),{sealingKey:randomBytes(32)}),"oauth_session_cookie_invalid"));
  it("rejects expired transaction", () => throws(() => cb(start(),{now:now + 11*60*1000}),"oauth_transaction_expired"));
  it("rejects changed callback origin", () => throws(() => cb(start(),{expectedRedirectUri:"https://evil.com/api/google-chat-oauth-callback"}),"oauth_redirect_not_pinned"));
  it("rejects changed human session", () => throws(() => cb(start(),{trustedCurrentActorRef:"OTHER"}),"oauth_identity_session_mismatch"));
  it("rejects Claude callback in Synnergyze", () => throws(() => start({redirectUri:"https://claude.ai/api/mcp/auth_callback"}),"oauth_redirect_not_pinned"));
  it("requires a trusted binding", () => throws(() => start({binding:{...binding,actorRef:""}}),"oauth_trusted_binding_required"));
  it("handles provider access denial", () => throws(() => cb(start(),{error:"access_denied"}),"oauth_provider_declined"));
  it("clears the correct Host cookie", () => expect(GOOGLE_OAUTH_CLEAR_COOKIE).toContain("Max-Age=0"));
  it("requires nonce consumption and vaults synthetic approved token", async () => {
    const verified = cb(start()); let consumeCount=0; let stored: unknown=null;
    const vault = {
      async consumeTransactionNonce(n: string,b: typeof binding) {consumeCount++;return n===verified.nonce && b.actorRef===actor && consumeCount===1;},
      async putGoogleChatTokens(x: Parameters<GoogleChatOAuthVault["putGoogleChatTokens"]>[0]){stored=x;},
    };
    const token = {access_token:"synthetic-token",token_type:"Bearer",
      scope:"openid https://www.googleapis.com/auth/chat.spaces.readonly https://www.googleapis.com/auth/chat.messages.readonly https://www.googleapis.com/auth/chat.memberships.readonly",expires_in:900,id_token:"synthetic-id-token"};
    const httpPost = async () => new Response(JSON.stringify(token),{status:200});
    const opts={verified,vault,clientId,clientSecret:"synthetic-secret",now,httpPost: httpPost as typeof fetch,verifyProviderAccount:async()=>true};
    const result=await exchangeAndVaultGoogleChatOAuth(opts);
    expect(result.connected).toBe(true);expect(result.actorRef).toBe(actor);
    expect(stored).toMatchObject({ accessToken: "synthetic-token", expiresAt: now + 900000 });
    await expect(exchangeAndVaultGoogleChatOAuth(opts)).rejects.toThrow("oauth_transaction_replayed");
  });
  it("rejects overbroad token scopes", async () => {
    const verified=cb(start());const vault={async consumeTransactionNonce(){return true;},async putGoogleChatTokens(){throw Error("should not store");}};
    const token={access_token:"synthetic-token",token_type:"Bearer",
      scope:"openid https://www.googleapis.com/auth/chat.spaces.readonly https://www.googleapis.com/auth/chat.messages.readonly https://www.googleapis.com/auth/chat.memberships.readonly https://www.googleapis.com/auth/chat.messages.create",expires_in:900,id_token:"synthetic-id-token"};
    await expect(exchangeAndVaultGoogleChatOAuth({verified,vault,clientId,clientSecret:"synthetic-secret",httpPost:(async()=>new Response(JSON.stringify(token))) as typeof fetch,verifyProviderAccount:async()=>true})).rejects.toThrow("oauth_scope_verification_failed");
  });
  it("rejects unverified provider identity without storing token", async () => {
    const verified=cb(start());let stored=false;
    const vault={async consumeTransactionNonce(){return true;},async putGoogleChatTokens(){stored=true;}};
    const token={access_token:"synthetic-token",token_type:"Bearer",
      scope:"openid https://www.googleapis.com/auth/chat.spaces.readonly https://www.googleapis.com/auth/chat.messages.readonly https://www.googleapis.com/auth/chat.memberships.readonly",expires_in:900,id_token:"synthetic-id-token"};
    await expect(exchangeAndVaultGoogleChatOAuth({verified,vault,clientId,clientSecret:"synthetic-secret",httpPost:(async()=>new Response(JSON.stringify(token))) as typeof fetch,verifyProviderAccount:async()=>false})).rejects.toThrow("oauth_provider_account_mismatch");
    expect(stored).toBe(false);
  });
});
