/**
 * GEN-CON-GCHAT-001 – bounded user-delegated Google OAuth transaction.
 * No live host is enabled by this file. A trusted session resolver MUST supply
 * the binding and a durable one-time transaction ledger MUST consume nonce.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { GOOGLE_CHAT_READ_SCOPES } from './warden-read-gate.ts';

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const COOKIE = '__Host-synnergyze-gchat-oauth';
const TEN_MIN = 10 * 60 * 1000;
const ENVELOPE_VERSION = 1;

export interface TrustedGoogleChatPrincipalBinding {
  actorRef: string;
  principalRef: string;
  googleAccountBindingRef: string;
  consentRef: string;
  wardenRequestRef: string;
  correlationId: string;
}

interface OAuthTransaction {
  version: 1;
  state: string;
  nonce: string;
  verifier: string;
  createdAt: number;
  redirectUri: string;
  binding: TrustedGoogleChatPrincipalBinding;
}

export interface OAuthStartOptions {
  binding: TrustedGoogleChatPrincipalBinding;
  clientId: string;
  redirectUri: string;
  expectedOrigin: string;
  sealingKey: Buffer;
  now?: number;
}

function nonemptyRecord(binding: TrustedGoogleChatPrincipalBinding): boolean {
  return Object.values(binding).every((value) => typeof value === 'string' && value.length > 0 && value.length < 512);
}

function checkCallbackUri(redirectUri: string, expectedOrigin: string): void {
  const uri = new URL(redirectUri);
  if (uri.protocol !== 'https:' || uri.origin !== expectedOrigin ||
      uri.pathname !== '/api/google-chat-oauth-callback' || uri.search || uri.hash ||
      uri.username || uri.password) {
    throw new Error('oauth_redirect_not_pinned');
  }
}

function checkKey(key: Buffer): void {
  if (!Buffer.isBuffer(key) || key.byteLength !== 32) throw new Error('oauth_sealing_key_invalid');
}

function seal(transaction: OAuthTransaction, key: Buffer): string {
  checkKey(key);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('GEN-CON-GCHAT-001:OAUTH-TXN:v1', 'utf8'));
  const body = Buffer.concat([cipher.update(JSON.stringify(transaction), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, body]).toString('base64url');
}

function unseal(value: string, key: Buffer): OAuthTransaction {
  checkKey(key);
  if (!/^[a-zA-Z0-9_-]{40,3500}$/.test(value)) throw new Error('oauth_session_cookie_invalid');
  const sealed = Buffer.from(value, 'base64url');
  if (sealed.length < 29) throw new Error('oauth_session_cookie_invalid');
  const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(0, 12));
  decipher.setAAD(Buffer.from('GEN-CON-GCHAT-001:OAUTH-TXN:v1', 'utf8'));
  decipher.setAuthTag(sealed.subarray(12, 28));
  try {
    const decoded = Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]).toString('utf8');
    const txn: OAuthTransaction = JSON.parse(decoded);
    if (txn.version !== ENVELOPE_VERSION || typeof txn.state !== 'string' ||
        typeof txn.nonce !== 'string' || typeof txn.verifier !== 'string' ||
        typeof txn.createdAt !== 'number' || typeof txn.redirectUri !== 'string' ||
        !txn.binding || !nonemptyRecord(txn.binding)) throw new Error('oauth_session_cookie_invalid');
    return txn;
  } catch { throw new Error('oauth_session_cookie_invalid'); }
}

export function googleOAuthTransactionCookie(value: string): string {
  return COOKIE + '=' + value + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600';
}

export const GOOGLE_OAUTH_CLEAR_COOKIE = COOKIE + '=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0';

export function beginGoogleChatOAuth(options: OAuthStartOptions): {
  authorizationUrl: string; setCookie: string; transactionNonce: string;
} {
  checkCallbackUri(options.redirectUri, options.expectedOrigin);
  if (!nonemptyRecord(options.binding)) throw new Error('oauth_trusted_binding_required');
  if (!/^[a-zA-Z0-9_.-]+\.apps\.googleusercontent\.com$/.test(options.clientId)) {
    throw new Error('oauth_client_id_invalid');
  }
  const now = options.now ?? Date.now();
  if (!Number.isFinite(now)) throw new Error('oauth_invalid_time');
  const verifier = randomBytes(32).toString('base64url');
  const transaction: OAuthTransaction = {
    version: 1,
    state: randomBytes(32).toString('base64url'),
    nonce: randomBytes(32).toString('base64url'),
    verifier,
    createdAt: now,
    redirectUri: options.redirectUri,
    binding: options.binding,
  };
  const url = new URL(GOOGLE_AUTH);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', options.clientId);
  url.searchParams.set('redirect_uri', options.redirectUri);
  url.searchParams.set('scope', GOOGLE_CHAT_READ_SCOPES.join(' '));
  url.searchParams.set('state', transaction.state);
  url.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('access_type', 'online'); // No long-lived refresh-token requirement in Pilot 01
  return {
    authorizationUrl: url.toString(),
    setCookie: googleOAuthTransactionCookie(seal(transaction, options.sealingKey)),
    transactionNonce: transaction.nonce,
  };
}

function cookieValue(header: string | undefined): string {
  if (!header) throw new Error('oauth_session_missing');
  const matches = header.split(';').map((s) => s.trim())
    .filter((s) => s.startsWith(COOKIE + '='));
  if (matches.length !== 1) throw new Error('oauth_session_missing_or_ambiguous');
  return matches[0].slice(COOKIE.length + 1);
}

export function validateGoogleChatOAuthCallback(input: {
  cookieHeader: string | undefined;
  state: string | null;
  code: string | null;
  error: string | null;
  expectedRedirectUri: string;
  expectedOrigin: string;
  sealingKey: Buffer;
  trustedCurrentActorRef: string;
  now?: number;
}): Readonly<{ code: string; verifier: string; nonce: string; binding: TrustedGoogleChatPrincipalBinding; redirectUri: string }> {
  checkCallbackUri(input.expectedRedirectUri, input.expectedOrigin);
  if (input.error) throw new Error('oauth_provider_declined');
  if (!input.state || !/^[A-Za-z0-9_-]{43}$/.test(input.state)) throw new Error('oauth_state_invalid');
  if (!input.code || input.code.length > 4096) throw new Error('oauth_code_missing_or_invalid');
  const transaction = unseal(cookieValue(input.cookieHeader), input.sealingKey);
  const now = input.now ?? Date.now();
  if (!Number.isFinite(now) || transaction.createdAt > now + 30000 ||
      now - transaction.createdAt > TEN_MIN) throw new Error('oauth_transaction_expired');
  if (transaction.redirectUri !== input.expectedRedirectUri) throw new Error('oauth_redirect_mismatch');
  if (!input.trustedCurrentActorRef || transaction.binding.actorRef !== input.trustedCurrentActorRef) {
    throw new Error('oauth_identity_session_mismatch');
  }
  if (!/^[a-zA-Z0-9_-]{43}$/.test(transaction.verifier)) throw new Error('oauth_pkce_invalid');
  const lhs = Buffer.from(input.state);
  const rhs = Buffer.from(transaction.state);
  if (lhs.length !== rhs.length || !timingSafeEqual(lhs, rhs)) throw new Error('oauth_state_mismatch');
  return {
    code: input.code,
    verifier: transaction.verifier,
    nonce: transaction.nonce,
    binding: transaction.binding,
    redirectUri: transaction.redirectUri,
  };
}

export interface GoogleChatOAuthVault {
  /** Atomic, durable and one-time; false on replay. Must be scoped to the trusted binding. */
  consumeTransactionNonce(nonce: string, binding: TrustedGoogleChatPrincipalBinding): Promise<boolean>;
  /** Write only; encrypt tokens at rest; bind to DigitalMe/principal/provider account. */
  putGoogleChatTokens(input: {
    binding: TrustedGoogleChatPrincipalBinding;
    accessToken: string;
    expiresAt: number;
    grantedScopes: readonly string[];
  }): Promise<void>;
}

export async function exchangeAndVaultGoogleChatOAuth(input: {
  verified: ReturnType<typeof validateGoogleChatOAuthCallback>;
  vault: GoogleChatOAuthVault;
  clientId: string;
  clientSecret: string;
  verifyProviderAccount: (token: string, binding: TrustedGoogleChatPrincipalBinding) => Promise<boolean>;
  now?: number;
  httpPost?: typeof fetch;
}): Promise<{ connected: true; actorRef: string; correlationId: string }> {
  if (!input.clientSecret || !input.clientId) throw new Error('oauth_client_configuration_missing');
  if (!await input.vault.consumeTransactionNonce(input.verified.nonce, input.verified.binding)) {
    throw new Error('oauth_transaction_replayed');
  }
  const body = new URLSearchParams({
    grant_type: 'authorization_code', client_id: input.clientId,
    client_secret: input.clientSecret, code: input.verified.code,
    code_verifier: input.verified.verifier,
    redirect_uri: input.verified.redirectUri,
  });
  let reply: Response;
  try {
    reply = await (input.httpPost ?? fetch)(GOOGLE_TOKEN, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body, signal: AbortSignal.timeout(8000),
    });
  } catch { throw new Error('oauth_token_exchange_failed'); }
  if (!reply.ok) throw new Error('oauth_token_exchange_failed');
  let payload: Record<string, unknown>;
  try { payload = await reply.json() as Record<string, unknown>; }
  catch { throw new Error('oauth_token_response_invalid'); }
  const scopes = typeof payload.scope === 'string' ? payload.scope.split(/\s+/).filter(Boolean) : [];
  if (scopes.length !== GOOGLE_CHAT_READ_SCOPES.length ||
      !GOOGLE_CHAT_READ_SCOPES.every((scope) => scopes.includes(scope))) {
    throw new Error('oauth_scope_verification_failed');
  }
  if (typeof payload.access_token !== 'string' || !payload.access_token ||
      payload.token_type !== 'Bearer' || typeof payload.expires_in !== 'number' ||
      !Number.isFinite(payload.expires_in) || payload.expires_in <= 0) {
    throw new Error('oauth_token_response_invalid');
  }
  if (!await input.verifyProviderAccount(payload.access_token, input.verified.binding)) {
    throw new Error('oauth_provider_account_mismatch');
  }
  await input.vault.putGoogleChatTokens({
    binding: input.verified.binding,
    accessToken: payload.access_token,
    expiresAt: (input.now ?? Date.now()) + payload.expires_in * 1000,
    grantedScopes: scopes,
  });
  return { connected: true, actorRef: input.verified.binding.actorRef,
    correlationId: input.verified.binding.correlationId };
}
