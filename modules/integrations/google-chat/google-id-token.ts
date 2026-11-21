/**
 * GEN-CON-GCHAT-001: Google OIDC ID-token signature and account-subject verification.
 * No network calls unless invoked by a trusted server-side OAuth callback.
 * The identity registry lookup is trusted; it cannot be populated from user input.
 */
import { createPublicKey, verify } from "node:crypto";
import type { TrustedGoogleChatPrincipalBinding } from "./oauth-transaction.ts";

const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const CLOCK_SKEW_SECONDS = 60;
const MAX_TOKEN_LENGTH = 16384;

export type GoogleSubjectRegistry = {
  /** Return the registered immutable subject for this trusted DigitalMe account binding. */
  getVerifiedGoogleSubject(binding: TrustedGoogleChatPrincipalBinding): Promise<string | null>;
};

type GoogleJwk = JsonWebKey & { kid?: string; kty?: string; use?: string; alg?: string };
type JwtHeader = { alg?: string; typ?: string; kid?: string };
type JwtClaims = Record<string, unknown>;

function decodePart(value: string): Record<string, unknown> {
  if (!/^[A-Za-z0-9_-]{2,12000}$/.test(value)) throw Error("oidc_malformed_token");
  try {
    const decoded: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) throw Error();
    return decoded as Record<string, unknown>;
  } catch { throw Error("oidc_malformed_token"); }
}

export async function verifyGoogleIdTokenSubject(input: {
  idToken: string;
  expectedClientId: string;
  expectedNonce: string;
  binding: TrustedGoogleChatPrincipalBinding;
  registry: GoogleSubjectRegistry;
  now?: number;
  jwksFetch?: typeof fetch;
}): Promise<boolean> {
  const { idToken, expectedClientId, expectedNonce, binding } = input;
  if (!idToken || idToken.length > MAX_TOKEN_LENGTH) return false;
  if (!/^[A-Za-z0-9_-]{43}$/.test(expectedNonce)) return false;
  if (!/^[A-Za-z0-9_.-]+\.apps\.googleusercontent\.com$/.test(expectedClientId)) return false;
  const parts = idToken.split(".");
  if (parts.length !== 3 || !parts[2] || !/^[A-Za-z0-9_-]+$/.test(parts[2])) return false;
  try {
    const header = decodePart(parts[0]) as JwtHeader;
    const claims = decodePart(parts[1]) as JwtClaims;
    if (header.alg !== "RS256" || typeof header.kid !== "string" ||
        header.kid.length > 256 || header.typ && header.typ !== "JWT") return false;
    const now = Math.floor((input.now ?? Date.now()) / 1000);
    if (!Number.isFinite(now) || !ISSUERS.has(String(claims.iss))) return false;
    if (typeof claims.aud !== "string" || claims.aud !== expectedClientId) return false;
    if (typeof claims.azp === "string" && claims.azp !== expectedClientId) return false;
    // Google sub is case-sensitive and can be up to 255 ASCII characters.
    if (typeof claims.sub !== "string" || !/^[\x21-\x7E]{1,255}$/.test(claims.sub)) return false;
    if (typeof claims.nonce !== "string" || claims.nonce !== expectedNonce) return false;
    if (typeof claims.exp !== "number" || !Number.isSafeInteger(claims.exp) ||
        claims.exp <= now - CLOCK_SKEW_SECONDS) return false;
    if (typeof claims.iat !== "number" || !Number.isSafeInteger(claims.iat) ||
        claims.iat > now + CLOCK_SKEW_SECONDS || claims.iat < now - 86400) return false;

    const response = await (input.jwksFetch ?? fetch)(GOOGLE_JWKS_URI, {
      method: "GET", headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return false;
    const jwks: unknown = await response.json();
    if (!jwks || typeof jwks !== "object" || !("keys" in jwks) ||
        !Array.isArray(jwks.keys)) return false;
    const keys = (jwks.keys as GoogleJwk[]).filter((key) =>
      key.kid === header.kid && key.kty === "RSA" &&
      (!key.alg || key.alg === "RS256") && (!key.use || key.use === "sig"));
    if (keys.length !== 1) return false;
    const candidate = keys[0];
    if (typeof candidate.n !== "string" || typeof candidate.e !== "string" ||
        !/^[A-Za-z0-9_-]+$/.test(candidate.n) ||
        !/^[A-Za-z0-9_-]+$/.test(candidate.e)) return false;
    const publicKey = createPublicKey({
      key: { kty: "RSA", n: candidate.n, e: candidate.e }, format: "jwk",
    });
    if (!verify("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]), publicKey,
      Buffer.from(parts[2], "base64url"))) return false;
    const registeredSubject = await input.registry.getVerifiedGoogleSubject(binding);
    return Boolean(registeredSubject && claims.sub === registeredSubject);
  } catch {
    return false; // Never leak provider ID tokens or claims in errors.
  }
}
