/**
 * Durable one-use OAuth nonce ledger for Google Chat.
 *
 * The database is *not* the authority for the human/account binding; it stores
 * only a SHA-256 digest of that binding. The trusted Synnergyze session resolver
 * must provide the binding for both reservation and consumption.
 *
 * Create the schema in migrations/google-chat-oauth-ledger.sql before enabling.
 */
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type { TrustedGoogleChatPrincipalBinding } from "./oauth-transaction.ts";

export interface GoogleChatNonceLedger {
  reserve(
    nonce: string,
    binding: TrustedGoogleChatPrincipalBinding,
    expiresAt: number,
  ): Promise<boolean>;
  consumeTransactionNonce(
    nonce: string,
    binding: TrustedGoogleChatPrincipalBinding,
  ): Promise<boolean>;
}

function hash(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function bindingFingerprint(binding: TrustedGoogleChatPrincipalBinding): string {
  // Explicit ordered fields prevent surprising JSON key-order dependencies.
  const fields = [
    binding.actorRef,
    binding.principalRef,
    binding.googleAccountBindingRef,
    binding.consentRef,
    binding.wardenRequestRef,
    binding.correlationId,
  ];
  if (fields.some((part) => !part || typeof part !== "string")) {
    throw new Error("oauth_trusted_binding_required");
  }
  return hash(JSON.stringify(fields));
}

function validateNonce(nonce: string): void {
  if (!/^[A-Za-z0-9_-]{43}$/.test(nonce)) {
    throw new Error("oauth_nonce_invalid");
  }
}

export class NeonGoogleChatNonceLedger implements GoogleChatNonceLedger {
  private readonly sql: ReturnType<typeof neon>;

  constructor(databaseUrl: string) {
    if (!databaseUrl) throw new Error("oauth_nonce_database_not_configured");
    this.sql = neon(databaseUrl);
  }

  async reserve(
    nonce: string,
    binding: TrustedGoogleChatPrincipalBinding,
    expiresAt: number,
  ): Promise<boolean> {
    validateNonce(nonce);
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now()) {
      throw new Error("oauth_nonce_expiry_invalid");
    }
    const nonceDigest = hash(nonce);
    const actorBindingDigest = bindingFingerprint(binding);
    const rows = await this.sql\`
      insert into synnergyze_oauth.google_chat_nonce (
        nonce_digest, actor_binding_digest, expires_at
      ) values (
        \${nonceDigest}, \${actorBindingDigest}, to_timestamp(\${expiresAt} / 1000.0)
      )
      on conflict (nonce_digest) do nothing
      returning nonce_digest
    \` as Array<{ nonce_digest: string }>;
    return rows.length === 1;
  }

  async consumeTransactionNonce(
    nonce: string,
    binding: TrustedGoogleChatPrincipalBinding,
  ): Promise<boolean> {
    validateNonce(nonce);
    const nonceDigest = hash(nonce);
    const actorBindingDigest = bindingFingerprint(binding);
    // One atomic statement: at most one callback can consume the nonce.
    // A bad binding must never consume another principal's valid nonce.
    const rows = await this.sql\`
      delete from synnergyze_oauth.google_chat_nonce
      where nonce_digest = \${nonceDigest}
        and actor_binding_digest = \${actorBindingDigest}
        and expires_at > now()
      returning nonce_digest
    \` as Array<{ nonce_digest: string }>;
    return rows.length === 1;
  }
}

export async function reserveGoogleChatOAuthTransaction(
  ledger: GoogleChatNonceLedger,
  transaction: { transactionNonce: string },
  binding: TrustedGoogleChatPrincipalBinding,
  expiresAt: number,
): Promise<void> {
  if (!await ledger.reserve(transaction.transactionNonce, binding, expiresAt)) {
    throw new Error("oauth_transaction_not_reserved");
  }
}
