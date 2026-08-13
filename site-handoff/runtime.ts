import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type EstateSiteId = "bc" | "cc" | "vsr";

export interface HandoffGrantInput {
  digitalMeId: string;
  sourceSite: EstateSiteId;
  destinationSite: EstateSiteId;
  returnUrl: string;
  wardenGrantId: string;
  ttlSeconds?: number;
}

export interface HandoffClaims {
  version: "REG-SITE-HANDOFF-001";
  issuer: "WARDEN";
  node: "ALPHA-NODE-001";
  digital_me_id: string;
  source_site: EstateSiteId;
  audience: EstateSiteId;
  return_url: string;
  warden_grant_id: string;
  nonce: string;
  issued_at: number;
  expires_at: number;
}

export interface ReplayStore {
  consumeOnce(nonce: string, expiresAt: number): Promise<boolean>;
}

const SITE_URLS: Record<EstateSiteId, string> = {
  bc: "https://believerscommon.com",
  cc: "https://creators-common.org",
  vsr: "https://virtualsilkroad.com",
};

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signature(unsignedToken: string, secret: string): string {
  return createHmac("sha256", secret).update(unsignedToken).digest("base64url");
}

function validReturnUrl(site: EstateSiteId, returnUrl: string): boolean {
  try {
    const parsed = new URL(returnUrl);
    const canonical = new URL(SITE_URLS[site]);
    return parsed.protocol === "https:" && parsed.origin === canonical.origin;
  } catch {
    return false;
  }
}

export function issueHandoffGrant(
  input: HandoffGrantInput,
  secret: string,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): { token: string; claims: HandoffClaims } {
  if (!secret || secret.length < 32) throw new Error("handoff_secret_not_configured");
  if (!input.digitalMeId.trim()) throw new Error("digital_me_required");
  if (!input.wardenGrantId.trim()) throw new Error("warden_grant_required");
  if (input.sourceSite === input.destinationSite) throw new Error("destination_must_differ");
  if (!validReturnUrl(input.destinationSite, input.returnUrl)) throw new Error("invalid_return_url");

  const ttl = input.ttlSeconds ?? 90;
  if (!Number.isInteger(ttl) || ttl < 15 || ttl > 120) throw new Error("invalid_ttl");

  const claims: HandoffClaims = {
    version: "REG-SITE-HANDOFF-001",
    issuer: "WARDEN",
    node: "ALPHA-NODE-001",
    digital_me_id: input.digitalMeId,
    source_site: input.sourceSite,
    audience: input.destinationSite,
    return_url: input.returnUrl,
    warden_grant_id: input.wardenGrantId,
    nonce: randomUUID(),
    issued_at: nowEpochSeconds,
    expires_at: nowEpochSeconds + ttl,
  };

  const header = encode(JSON.stringify({ alg: "HS256", typ: "VSR-HANDOFF" }));
  const payload = encode(JSON.stringify(claims));
  const unsigned = `${header}.${payload}`;
  return { token: `${unsigned}.${signature(unsigned, secret)}`, claims };
}

export async function consumeHandoffGrant(
  token: string,
  expectedAudience: EstateSiteId,
  secret: string,
  replayStore: ReplayStore,
  nowEpochSeconds = Math.floor(Date.now() / 1000),
): Promise<HandoffClaims> {
  if (!secret || secret.length < 32) throw new Error("handoff_secret_not_configured");

  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid_token");
  const [header, payload, suppliedSignature] = parts;
  const unsigned = `${header}.${payload}`;
  const expectedSignature = signature(unsigned, secret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error("invalid_signature");
  }

  const claims = JSON.parse(decode(payload)) as HandoffClaims;
  if (claims.version !== "REG-SITE-HANDOFF-001" || claims.issuer !== "WARDEN") {
    throw new Error("invalid_issuer");
  }
  if (claims.node !== "ALPHA-NODE-001") throw new Error("invalid_node");
  if (claims.audience !== expectedAudience) throw new Error("audience_mismatch");
  if (claims.expires_at <= nowEpochSeconds) throw new Error("expired_handoff");
  if (claims.issued_at > nowEpochSeconds + 30) throw new Error("issued_in_future");
  if (!validReturnUrl(claims.audience, claims.return_url)) throw new Error("invalid_return_url");
  if (!claims.digital_me_id || !claims.warden_grant_id || !claims.nonce) throw new Error("incomplete_claims");

  const firstUse = await replayStore.consumeOnce(claims.nonce, claims.expires_at);
  if (!firstUse) throw new Error("replay_detected");
  return claims;
}

export class MemoryReplayStore implements ReplayStore {
  private readonly used = new Map<string, number>();

  async consumeOnce(nonce: string, expiresAt: number): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    for (const [key, expiry] of this.used.entries()) {
      if (expiry <= now) this.used.delete(key);
    }
    if (this.used.has(nonce)) return false;
    this.used.set(nonce, expiresAt);
    return true;
  }
}
