/**
 * GEN-CON-GCHAT-001: encrypted, principal-bound short-lived token vault.
 *
 * This is an internal adapter, not an externally callable MCP tool.
 * It must be used only after server-authenticated DigitalMe resolution.
 * The Google Chat callback remains disabled until identity and deployment are qualified.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type {
  GoogleChatOAuthVault,
  TrustedGoogleChatPrincipalBinding,
} from "./oauth-transaction.ts";
import type { GoogleChatNonceLedger } from "./nonce-ledger.ts";
import { GOOGLE_CHAT_READ_SCOPES } from "./warden-read-gate.ts";

export type TokenVaultKeyring = Readonly<{
  activeKeyId: string;
  keys: ReadonlyMap<string, Buffer>;
}>;

export interface SealedGoogleChatToken {
  keyId: string;
  bindingDigest: string;
  ciphertext: string;
  iv: string;
  tag: string;
  expiresAt: number;
  scopeDigest: string;
}

function digest(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function googleChatBindingDigest(binding: TrustedGoogleChatPrincipalBinding): string {
  const values = [
    binding.actorRef, binding.principalRef, binding.googleAccountBindingRef,
    binding.consentRef, binding.wardenRequestRef, binding.correlationId,
  ];
  if (values.some((value) => typeof value !== "string" || !value.trim() || value.length >= 512)) {
    throw new Error("vault_binding_invalid");
  }
  return digest(JSON.stringify(values));
}

function normalizedScopes(scopes: readonly string[]): string[] {
  const allowed = [...GOOGLE_CHAT_READ_SCOPES];
  const actual = [...new Set(scopes)].sort();
  if (actual.length !== allowed.length || !allowed.every((scope) => actual.includes(scope))) {
    throw new Error("vault_scope_not_readonly");
  }
  return actual;
}

function requireKey(keyring: TokenVaultKeyring, keyId: string): Buffer {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(keyId)) throw new Error("vault_key_id_invalid");
  const key = keyring.keys.get(keyId);
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error("vault_key_not_configured");
  return key;
}

function aad(bindingDigest: string, scopeDigest: string, expiresAt: number): Buffer {
  return Buffer.from(
    JSON.stringify(["GEN-CON-GCHAT-001", "token-v1", bindingDigest, scopeDigest, expiresAt]),
    "utf8",
  );
}

export function sealGoogleChatAccessToken(input: {
  accessToken: string;
  binding: TrustedGoogleChatPrincipalBinding;
  grantedScopes: readonly string[];
  expiresAt: number;
  keyring: TokenVaultKeyring;
  now?: number;
}): SealedGoogleChatToken {
  const now = input.now ?? Date.now();
  if (!input.accessToken || input.accessToken.length > 8192) throw new Error("vault_token_invalid");
  if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= now ||
      input.expiresAt - now > 24 * 60 * 60 * 1000) throw new Error("vault_expiry_invalid");
  const bindingDigest = googleChatBindingDigest(input.binding);
  const scopeDigest = digest(JSON.stringify(normalizedScopes(input.grantedScopes)));
  const key = requireKey(input.keyring, input.keyring.activeKeyId);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(bindingDigest, scopeDigest, input.expiresAt));
  const ciphertext = Buffer.concat([
    cipher.update(input.accessToken, "utf8"), cipher.final(),
  ]);
  return {
    keyId: input.keyring.activeKeyId,
    bindingDigest,
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    expiresAt: input.expiresAt,
    scopeDigest,
  };
}

/**
 * Only call from an authenticated back-end that has independently resolved
 * the same DigitalMe/principal/Google account binding and Warden admission.
 */
export function openGoogleChatAccessToken(input: {
  sealed: SealedGoogleChatToken;
  trustedBinding: TrustedGoogleChatPrincipalBinding;
  keyring: TokenVaultKeyring;
  now?: number;
}): string {
  const now = input.now ?? Date.now();
  if (!Number.isSafeInteger(input.sealed.expiresAt) || input.sealed.expiresAt <= now) {
    throw new Error("vault_token_expired");
  }
  const digestForBinding = googleChatBindingDigest(input.trustedBinding);
  if (digestForBinding !== input.sealed.bindingDigest) throw new Error("vault_binding_mismatch");
  const key = requireKey(input.keyring, input.sealed.keyId);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(input.sealed.iv, "base64"));
    decipher.setAAD(aad(input.sealed.bindingDigest, input.sealed.scopeDigest, input.sealed.expiresAt));
    decipher.setAuthTag(Buffer.from(input.sealed.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(input.sealed.ciphertext, "base64")), decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("vault_ciphertext_invalid");
  }
}

export class NeonGoogleChatTokenVault implements GoogleChatOAuthVault {
  private readonly sql: ReturnType<typeof neon>;

  constructor(
    databaseUrl: string,
    private readonly nonceLedger: GoogleChatNonceLedger,
    private readonly keyring: TokenVaultKeyring,
  ) {
    if (!databaseUrl) throw new Error("vault_database_not_configured");
    this.sql = neon(databaseUrl);
    requireKey(keyring, keyring.activeKeyId);
  }

  consumeTransactionNonce(nonce: string, binding: TrustedGoogleChatPrincipalBinding): Promise<boolean> {
    return this.nonceLedger.consumeTransactionNonce(nonce, binding);
  }

  async putGoogleChatTokens(input: {
    binding: TrustedGoogleChatPrincipalBinding;
    accessToken: string;
    expiresAt: number;
    grantedScopes: readonly string[];
  }): Promise<void> {
    const sealed = sealGoogleChatAccessToken({ ...input, keyring: this.keyring });
    await this.sql`
      insert into synnergyze_oauth.google_chat_access_token (
        binding_digest, key_id, iv, tag, ciphertext, scope_digest, expires_at
      ) values (
        ${sealed.bindingDigest}, ${sealed.keyId}, ${sealed.iv}, ${sealed.tag},
        ${sealed.ciphertext}, ${sealed.scopeDigest},
        to_timestamp(${sealed.expiresAt} / 1000.0)
      )
      on conflict (binding_digest) do update set
        key_id = excluded.key_id,
        iv = excluded.iv,
        tag = excluded.tag,
        ciphertext = excluded.ciphertext,
        scope_digest = excluded.scope_digest,
        expires_at = excluded.expires_at,
        updated_at = now()
    `;
  }

  /**
   * Internal-only retrieval. Identity, consent, Warden authorization and
   * target-space admission MUST have occurred before invocation.
   */
  async getAccessTokenForAuthorizedRead(
    trustedBinding: TrustedGoogleChatPrincipalBinding,
  ): Promise<string | null> {
    const bindingDigest = googleChatBindingDigest(trustedBinding);
    const rows = await this.sql`
      select binding_digest, key_id, iv, tag, ciphertext, scope_digest,
        (extract(epoch from expires_at) * 1000)::bigint as expires_at_ms
      from synnergyze_oauth.google_chat_access_token
      where binding_digest = ${bindingDigest} and expires_at > now()
      limit 1
    ` as Array<{
      binding_digest: string;
      key_id: string;
      iv: string;
      tag: string;
      ciphertext: string;
      scope_digest: string;
      expires_at_ms: string;
    }>;
    if (rows.length !== 1) return null;
    const row = rows[0];
    const expiresAt = Number(row.expires_at_ms);
    return openGoogleChatAccessToken({
      sealed: {
        keyId: row.key_id,
        bindingDigest: row.binding_digest,
        iv: row.iv,
        tag: row.tag,
        ciphertext: row.ciphertext,
        scopeDigest: row.scope_digest,
        expiresAt,
      },
      trustedBinding,
      keyring: this.keyring,
    });
  }

  async revokeBinding(trustedBinding: TrustedGoogleChatPrincipalBinding): Promise<void> {
    const bindingDigest = googleChatBindingDigest(trustedBinding);
    await this.sql`
      delete from synnergyze_oauth.google_chat_access_token
      where binding_digest = ${bindingDigest}
    `;
  }
}
