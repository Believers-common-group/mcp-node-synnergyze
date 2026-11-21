import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  googleChatBindingDigest,
  openGoogleChatAccessToken,
  sealGoogleChatAccessToken,
  type TokenVaultKeyring,
} from "./token-vault.ts";
import { GOOGLE_CHAT_READ_SCOPES } from "./warden-read-gate.ts";

const binding = {
  actorRef: "DIGITALME:USER1",
  principalRef: "ESTATE-PRINCIPAL:TEST",
  googleAccountBindingRef: "GOOGLE:TEST",
  consentRef: "CONSENT:TEST",
  wardenRequestRef: "WARDEN-REQUEST:ONE",
  correlationId: "CORR:ONE",
};
const now=1800000000000;
const key1=randomBytes(32),key2=randomBytes(32);
const keys: TokenVaultKeyring={activeKeyId:"k1",keys:new Map([["k1",key1],["k2",key2]])};
const seal=(overrides: Record<string, unknown>={})=>sealGoogleChatAccessToken({
  accessToken:"SYNTHETIC-ACCESS-TOKEN-NEVER-REAL",
  binding,
  grantedScopes:[...GOOGLE_CHAT_READ_SCOPES],
  expiresAt:now+900000,now,keyring:keys,...overrides,
});
const open=(x: ReturnType<typeof seal>, overrides: Record<string, unknown>={})=>
  openGoogleChatAccessToken({sealed:x,trustedBinding:binding,keyring:keys,now:now+1000,...overrides});

describe("GEN-CON-GCHAT-001 encrypted Google Chat vault",()=>{
  it("seals without retaining plaintext and decrypts with scoped account binding",()=>{
    const s=seal();
    expect(s.ciphertext).not.toContain("SYNTHETIC-ACCESS-TOKEN");
    expect(open(s)).toBe("SYNTHETIC-ACCESS-TOKEN-NEVER-REAL");
  });
  it("refuses cross-principal reads",()=>expect(()=>open(seal(),{
    trustedBinding:{...binding,principalRef:"OTHER"},
  })).toThrow("vault_binding_mismatch"));
  it("refuses changed Google account",()=>expect(()=>open(seal(),{
    trustedBinding:{...binding,googleAccountBindingRef:"GOOGLE:OTHER"},
  })).toThrow("vault_binding_mismatch"));
  it("binds consent",()=>expect(()=>open(seal(),{
    trustedBinding:{...binding,consentRef:"CONSENT:OTHER"},
  })).toThrow("vault_binding_mismatch"));
  it("does not bind reusable credentials to a single event correlation ID",()=>{
    expect(googleChatBindingDigest(binding)).toBe(
      googleChatBindingDigest({...binding,correlationId:"CORR:TWO",wardenRequestRef:"WARDEN-REQUEST:TWO"}));
  });
  it("refuses altered ciphertext",()=>{
    const s=seal();
    expect(()=>open({...s,ciphertext:Buffer.from("tampered").toString("base64")})).toThrow("vault_ciphertext_invalid");
  });
  it("refuses altered expiration even when not yet expired",()=>{
    const s=seal();
    expect(()=>open({...s,expiresAt:s.expiresAt+1000})).toThrow("vault_ciphertext_invalid");
  });
  it("refuses changed scope digest",()=>{
    const s=seal();
    expect(()=>open({...s,scopeDigest:"f".repeat(64)})).toThrow("vault_scope_mismatch");
  });
  it("refuses token access after expiry",()=>expect(()=>open(seal(),{now:now+900001})).toThrow("vault_token_expired"));
  it("refuses write scope",()=>expect(()=>seal({
    grantedScopes:[...GOOGLE_CHAT_READ_SCOPES,"https://www.googleapis.com/auth/chat.messages.create"],
  })).toThrow("vault_scope_not_readonly"));
  it("refuses missing granted scope",()=>expect(()=>seal({
    grantedScopes:[GOOGLE_CHAT_READ_SCOPES[0]],
  })).toThrow("vault_scope_not_readonly"));
  it("refuses a malformed encryption key",()=>expect(()=>seal({
    keyring:{activeKeyId:"bad",keys:new Map([["bad",randomBytes(16)]])},
  })).toThrow("vault_key_not_configured"));
  it("retains old keys during key rotation and uses active key for new token",()=>{
    const old=seal();
    const rotated:TokenVaultKeyring={activeKeyId:"k2",keys:keys.keys};
    const newer=seal({keyring:rotated});
    expect(old.keyId).toBe("k1");expect(newer.keyId).toBe("k2");
    expect(open(old,{keyring:rotated})).toContain("SYNTHETIC");
    expect(open(newer,{keyring:rotated})).toContain("SYNTHETIC");
  });
  it("refuses access when retired key unavailable",()=>{
    const s=seal();
    const retired:TokenVaultKeyring={activeKeyId:"k2",keys:new Map([["k2",key2]])};
    expect(()=>open(s,{keyring:retired})).toThrow("vault_key_not_configured");
  });
});
