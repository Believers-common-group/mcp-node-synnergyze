import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export type Site = "BC" | "CC" | "VSR";

const ALGORITHM = "HS256" as const;
const TOKEN_TYPE = "VSR-HANDOFF-2" as const;
const TOKEN_VERSION = 2 as const;
const MAX_TTL_SECONDS = 300;

export interface HandoffClaimsV2 {
  ver: typeof TOKEN_VERSION;
  iss: string;
  aud: Site;
  iat: number;
  exp: number;
  jti: string;
  nonce: string;
  src: Site;
  dst: Site;
  digitalme_id: string;
  actor_id: string;
  warden_grant_id: string;
  capabilities: readonly string[];
  handoff_ref: string;
  warden_decision_ref: string;
  warden_evidence_ref: string;
}

interface HandoffHeaderV2 {
  alg: typeof ALGORITHM;
  typ: typeof TOKEN_TYPE;
  kid: string;
}

export interface VerifiedWardenHandoffGrantV1 {
  grantRef: string;
  decisionRef: string;
  evidenceRef: string;
  outcome: "ALLOW";
  actorRef: string;
  digitalMeRef: string;
  sourceSite: Site;
  destinationSite: Site;
  capabilityRefs: readonly string[];
  validFrom: string;
  validUntil: string;
}

export interface WardenHandoffGrantVerifierV1 {
  verify(grantRef: string, nowMs: number): Promise<VerifiedWardenHandoffGrantV1>;
}

export interface HandoffTokenSignerV1 {
  readonly keyRef: string;
  sign(input: string): Promise<string>;
}

export interface HandoffTokenSignatureVerifierV1 {
  verify(keyRef: string, input: string, signature: string): Promise<boolean>;
}

export interface GovernedHandoffIssueInputV1 {
  issuer: string;
  actorRef: string;
  digitalMeRef: string;
  sourceSite: Site;
  destinationSite: Site;
  capabilities: readonly string[];
  wardenGrantRef: string;
  ttlSeconds?: number;
  nowMs?: number;
}

export interface GovernedHandoffTokenV1 {
  token: string;
  tokenDigest: string;
  claims: HandoffClaimsV2;
  keyRef: string;
}

export interface HandoffJournalStartV1 {
  nonce: string;
  handoffRef: string;
  tokenDigest: string;
  expiresAtMs: number;
  startedAtMs: number;
}

export type HandoffJournalBeginResultV1 =
  | { state: "STARTED" }
  | { state: "COMPLETED"; result: GovernedHandoffResultV1 }
  | { state: "IN_PROGRESS" }
  | { state: "FAILED" }
  | { state: "CONFLICT" };

export interface HandoffExecutionJournalV1 {
  begin(input: HandoffJournalStartV1): Promise<HandoffJournalBeginResultV1>;
  complete(input: {
    nonce: string;
    tokenDigest: string;
    result: GovernedHandoffResultV1;
    completedAtMs: number;
  }): Promise<void>;
  fail(input: {
    nonce: string;
    tokenDigest: string;
    reason: string;
    failedAtMs: number;
  }): Promise<void>;
}

export interface RiverHandoffReservationV1 {
  reservationRef: string;
  state: "RESERVED";
}

export interface RiverHandoffSealV1 {
  sealRef: string;
  state: "SEALED";
}

export interface RiverHandoffEvidenceGatewayV1 {
  reserve(input: {
    handoffRef: string;
    tokenDigest: string;
    grant: VerifiedWardenHandoffGrantV1;
    claims: HandoffClaimsV2;
    reservedAt: string;
  }): Promise<RiverHandoffReservationV1>;
  seal(input: {
    handoffRef: string;
    reservationRef: string;
    sessionRef: string;
    verificationEvidenceRef: string;
    claims: HandoffClaimsV2;
    sealedAt: string;
  }): Promise<RiverHandoffSealV1>;
  sealException(input: {
    handoffRef: string;
    reservationRef: string;
    claims: HandoffClaimsV2;
    reason: string;
    sealedAt: string;
  }): Promise<RiverHandoffSealV1>;
}

export interface DestinationSessionReceiptV1 {
  sessionRef: string;
  digitalMeRef: string;
  audience: Site;
  capabilityRefs: readonly string[];
  createdAt: string;
  providerSessionRef?: string;
}

export interface DestinationSessionGatewayV1 {
  openSession(input: {
    handoffRef: string;
    reservationRef: string;
    claims: HandoffClaimsV2;
    roles: readonly string[];
    idempotencyKey: string;
    createdAt: string;
  }): Promise<DestinationSessionReceiptV1>;
}

export interface DestinationSessionVerificationV1 {
  verified: boolean;
  evidenceRef: string;
  checkedAt: string;
  reason?: string;
}

export interface HandoffPostDeploymentVerifierV1 {
  verify(input: {
    handoffRef: string;
    claims: HandoffClaimsV2;
    session: DestinationSessionReceiptV1;
    checkedAt: string;
  }): Promise<DestinationSessionVerificationV1>;
}

export interface GovernedHandoffResultV1 {
  state: "HANDOFF_VERIFIED";
  handoffRef: string;
  tokenDigest: string;
  wardenGrantRef: string;
  wardenDecisionRef: string;
  wardenEvidenceRef: string;
  reservationRef: string;
  destinationSessionRef: string;
  destinationVerificationEvidenceRef: string;
  riverSealRef: string;
  digitalMeRef: string;
  destinationSite: Site;
  capabilityRefs: readonly string[];
  roleRefs: readonly string[];
  activationImplied: false;
  idempotentReplay: boolean;
}

export interface GovernedHandoffConsumeInputV1 {
  token: string;
  expectedDestination: Site;
  signatureVerifier: HandoffTokenSignatureVerifierV1;
  wardenVerifier: WardenHandoffGrantVerifierV1;
  journal: HandoffExecutionJournalV1;
  river: RiverHandoffEvidenceGatewayV1;
  destination: DestinationSessionGatewayV1;
  postDeploymentVerifier: HandoffPostDeploymentVerifierV1;
  nowMs?: number;
}

function b64url(input: Buffer | string): string {
  const value = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return value.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function b64urlDecode(input: string): Buffer {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, "base64");
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonical(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function parseInstant(value: string, code: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(code);
  return parsed;
}

function assertSite(site: string): asserts site is Site {
  if (!(["BC", "CC", "VSR"] as string[]).includes(site)) {
    throw new Error("handoff_invalid_site");
  }
}

function assertGrantMatches(
  grant: VerifiedWardenHandoffGrantV1,
  input: GovernedHandoffIssueInputV1,
  nowMs: number,
): void {
  if (grant.outcome !== "ALLOW") throw new Error("handoff_warden_allow_required");
  if (grant.actorRef !== input.actorRef) throw new Error("handoff_warden_actor_mismatch");
  if (grant.digitalMeRef !== input.digitalMeRef) throw new Error("handoff_warden_digitalme_mismatch");
  if (grant.sourceSite !== input.sourceSite) throw new Error("handoff_warden_source_mismatch");
  if (grant.destinationSite !== input.destinationSite) {
    throw new Error("handoff_warden_destination_mismatch");
  }

  const from = parseInstant(grant.validFrom, "handoff_warden_invalid_valid_from");
  const until = parseInstant(grant.validUntil, "handoff_warden_invalid_valid_until");
  if (until < from) throw new Error("handoff_warden_invalid_window");
  if (nowMs < from) throw new Error("handoff_warden_not_yet_valid");
  if (nowMs > until) throw new Error("handoff_warden_expired");

  const allowed = new Set(grant.capabilityRefs);
  for (const capability of canonical(input.capabilities)) {
    if (!allowed.has(capability)) throw new Error(`handoff_warden_capability_denied:${capability}`);
  }
}

function assertGrantMatchesClaims(
  grant: VerifiedWardenHandoffGrantV1,
  claims: HandoffClaimsV2,
  nowMs: number,
): void {
  if (grant.outcome !== "ALLOW") throw new Error("handoff_warden_allow_required");
  if (grant.grantRef !== claims.warden_grant_id) throw new Error("handoff_warden_grant_mismatch");
  if (grant.decisionRef !== claims.warden_decision_ref) {
    throw new Error("handoff_warden_decision_mismatch");
  }
  if (grant.evidenceRef !== claims.warden_evidence_ref) {
    throw new Error("handoff_warden_evidence_mismatch");
  }
  if (grant.actorRef !== claims.actor_id) throw new Error("handoff_warden_actor_mismatch");
  if (grant.digitalMeRef !== claims.digitalme_id) throw new Error("handoff_warden_digitalme_mismatch");
  if (grant.sourceSite !== claims.src) throw new Error("handoff_warden_source_mismatch");
  if (grant.destinationSite !== claims.dst) throw new Error("handoff_warden_destination_mismatch");

  const grantFrom = parseInstant(grant.validFrom, "handoff_warden_invalid_valid_from");
  const grantUntil = parseInstant(grant.validUntil, "handoff_warden_invalid_valid_until");
  if (nowMs < grantFrom || nowMs > grantUntil) throw new Error("handoff_warden_not_current");
  if (claims.exp * 1000 > grantUntil) throw new Error("handoff_token_exceeds_warden_grant");

  const allowed = new Set(grant.capabilityRefs);
  for (const capability of claims.capabilities) {
    if (!allowed.has(capability)) throw new Error(`handoff_warden_capability_denied:${capability}`);
  }
}

function parseToken(token: string): { header: HandoffHeaderV2; claims: HandoffClaimsV2; signingInput: string; signature: string } {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("handoff_token_malformed");
  const [headerRaw, payloadRaw, signature] = parts;
  let header: HandoffHeaderV2;
  let claims: HandoffClaimsV2;
  try {
    header = JSON.parse(b64urlDecode(headerRaw).toString("utf8")) as HandoffHeaderV2;
    claims = JSON.parse(b64urlDecode(payloadRaw).toString("utf8")) as HandoffClaimsV2;
  } catch {
    throw new Error("handoff_token_decode_failed");
  }
  if (header.alg !== ALGORITHM || header.typ !== TOKEN_TYPE || !header.kid) {
    throw new Error("handoff_token_header_invalid");
  }
  return { header, claims, signingInput: `${headerRaw}.${payloadRaw}`, signature };
}

function validateClaims(claims: HandoffClaimsV2, expectedDestination: Site, nowMs: number): void {
  if (claims.ver !== TOKEN_VERSION) throw new Error("handoff_token_version_invalid");
  assertSite(claims.src);
  assertSite(claims.dst);
  if (claims.aud !== expectedDestination || claims.dst !== expectedDestination) {
    throw new Error("handoff_token_wrong_audience");
  }
  if (!claims.handoff_ref || !claims.warden_grant_id || !claims.warden_decision_ref || !claims.warden_evidence_ref) {
    throw new Error("handoff_token_authority_lineage_missing");
  }
  if (!claims.digitalme_id || !claims.actor_id || !claims.nonce || !claims.jti) {
    throw new Error("handoff_token_identity_missing");
  }
  if (!Array.isArray(claims.capabilities) || claims.capabilities.length === 0) {
    throw new Error("handoff_token_capability_missing");
  }
  if (claims.exp * 1000 <= nowMs) throw new Error("handoff_token_expired");
  if (claims.iat * 1000 > nowMs + 5_000) throw new Error("handoff_token_from_future");
  if (claims.exp <= claims.iat) throw new Error("handoff_token_invalid_window");
  if (claims.exp - claims.iat > MAX_TTL_SECONDS) throw new Error("handoff_token_ttl_exceeded");
}

function rolesForDestination(claims: HandoffClaimsV2): string[] {
  const prefix = claims.dst;
  const roles = new Set<string>();
  for (const capability of claims.capabilities) {
    if (capability === "program:read") roles.add(`${prefix}_VIEWER`);
    if (capability === "evidence:submit") roles.add(`${prefix}_EVIDENCE_CONTRIBUTOR`);
  }
  if (roles.size === 0) throw new Error("handoff_destination_role_mapping_missing");
  return [...roles].sort();
}

export async function issueGovernedHandoffGrantV2(
  input: GovernedHandoffIssueInputV1,
  dependencies: {
    wardenVerifier: WardenHandoffGrantVerifierV1;
    signer: HandoffTokenSignerV1;
  },
): Promise<GovernedHandoffTokenV1> {
  assertSite(input.sourceSite);
  assertSite(input.destinationSite);
  const nowMs = input.nowMs ?? Date.now();
  const ttlSeconds = input.ttlSeconds ?? 120;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > MAX_TTL_SECONDS) {
    throw new Error("handoff_ttl_out_of_bounds");
  }

  const grant = await dependencies.wardenVerifier.verify(input.wardenGrantRef, nowMs);
  assertGrantMatches(grant, input, nowMs);

  const grantUntilMs = parseInstant(grant.validUntil, "handoff_warden_invalid_valid_until");
  const requestedExpiryMs = nowMs + ttlSeconds * 1000;
  const expiryMs = Math.min(requestedExpiryMs, grantUntilMs);
  if (expiryMs <= nowMs) throw new Error("handoff_warden_expired");

  const capabilities = canonical(input.capabilities);
  if (capabilities.length === 0) throw new Error("handoff_capability_missing");
  const nonce = randomBytes(16).toString("hex");
  const issuedAt = Math.floor(nowMs / 1000);
  const expiresAt = Math.floor(expiryMs / 1000);
  const handoffRef = `HANDOFF:${sha256(`${grant.grantRef}|${input.digitalMeRef}|${input.sourceSite}|${input.destinationSite}|${nonce}`).slice(0, 24)}`;
  const claims: HandoffClaimsV2 = {
    ver: TOKEN_VERSION,
    iss: input.issuer,
    aud: input.destinationSite,
    iat: issuedAt,
    exp: expiresAt,
    jti: `HANDOFF-JTI:${sha256(`${handoffRef}|${issuedAt}`).slice(0, 24)}`,
    nonce,
    src: input.sourceSite,
    dst: input.destinationSite,
    digitalme_id: input.digitalMeRef,
    actor_id: input.actorRef,
    warden_grant_id: grant.grantRef,
    capabilities,
    handoff_ref: handoffRef,
    warden_decision_ref: grant.decisionRef,
    warden_evidence_ref: grant.evidenceRef,
  };
  const header: HandoffHeaderV2 = { alg: ALGORITHM, typ: TOKEN_TYPE, kid: dependencies.signer.keyRef };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = await dependencies.signer.sign(signingInput);
  const token = `${signingInput}.${signature}`;
  return { token, tokenDigest: `sha256:${sha256(token)}`, claims, keyRef: dependencies.signer.keyRef };
}

export async function verifyGovernedHandoffTokenV2(
  token: string,
  expectedDestination: Site,
  signatureVerifier: HandoffTokenSignatureVerifierV1,
  nowMs = Date.now(),
): Promise<{ claims: HandoffClaimsV2; tokenDigest: string; keyRef: string }> {
  const parsed = parseToken(token);
  const signatureValid = await signatureVerifier.verify(parsed.header.kid, parsed.signingInput, parsed.signature);
  if (!signatureValid) throw new Error("handoff_token_signature_invalid");
  validateClaims(parsed.claims, expectedDestination, nowMs);
  return {
    claims: parsed.claims,
    tokenDigest: `sha256:${sha256(token)}`,
    keyRef: parsed.header.kid,
  };
}

export async function executeGovernedSiteHandoffV2(
  input: GovernedHandoffConsumeInputV1,
): Promise<GovernedHandoffResultV1> {
  const nowMs = input.nowMs ?? Date.now();
  const verifiedToken = await verifyGovernedHandoffTokenV2(
    input.token,
    input.expectedDestination,
    input.signatureVerifier,
    nowMs,
  );
  const { claims, tokenDigest } = verifiedToken;
  const grant = await input.wardenVerifier.verify(claims.warden_grant_id, nowMs);
  assertGrantMatchesClaims(grant, claims, nowMs);

  const begin = await input.journal.begin({
    nonce: claims.nonce,
    handoffRef: claims.handoff_ref,
    tokenDigest,
    expiresAtMs: claims.exp * 1000,
    startedAtMs: nowMs,
  });
  if (begin.state === "COMPLETED") {
    return { ...begin.result, idempotentReplay: true };
  }
  if (begin.state === "IN_PROGRESS") throw new Error("handoff_replay_in_progress");
  if (begin.state === "FAILED") throw new Error("handoff_prior_attempt_failed");
  if (begin.state === "CONFLICT") throw new Error("handoff_replay_conflict");

  const nowIso = new Date(nowMs).toISOString();
  let reservation: RiverHandoffReservationV1 | undefined;
  try {
    reservation = await input.river.reserve({
      handoffRef: claims.handoff_ref,
      tokenDigest,
      grant,
      claims,
      reservedAt: nowIso,
    });
    if (reservation.state !== "RESERVED" || !reservation.reservationRef) {
      throw new Error("handoff_river_reservation_failed");
    }

    const roleRefs = rolesForDestination(claims);
    const session = await input.destination.openSession({
      handoffRef: claims.handoff_ref,
      reservationRef: reservation.reservationRef,
      claims,
      roles: roleRefs,
      idempotencyKey: claims.nonce,
      createdAt: nowIso,
    });
    if (!session.sessionRef) throw new Error("handoff_destination_session_missing");

    const verification = await input.postDeploymentVerifier.verify({
      handoffRef: claims.handoff_ref,
      claims,
      session,
      checkedAt: nowIso,
    });
    if (!verification.verified || !verification.evidenceRef) {
      throw new Error(verification.reason ?? "handoff_destination_verification_failed");
    }

    const seal = await input.river.seal({
      handoffRef: claims.handoff_ref,
      reservationRef: reservation.reservationRef,
      sessionRef: session.sessionRef,
      verificationEvidenceRef: verification.evidenceRef,
      claims,
      sealedAt: nowIso,
    });
    if (seal.state !== "SEALED" || !seal.sealRef) throw new Error("handoff_river_seal_failed");

    const result: GovernedHandoffResultV1 = {
      state: "HANDOFF_VERIFIED",
      handoffRef: claims.handoff_ref,
      tokenDigest,
      wardenGrantRef: grant.grantRef,
      wardenDecisionRef: grant.decisionRef,
      wardenEvidenceRef: grant.evidenceRef,
      reservationRef: reservation.reservationRef,
      destinationSessionRef: session.sessionRef,
      destinationVerificationEvidenceRef: verification.evidenceRef,
      riverSealRef: seal.sealRef,
      digitalMeRef: claims.digitalme_id,
      destinationSite: claims.dst,
      capabilityRefs: canonical(claims.capabilities),
      roleRefs: canonical(roleRefs),
      activationImplied: false,
      idempotentReplay: false,
    };
    await input.journal.complete({
      nonce: claims.nonce,
      tokenDigest,
      result,
      completedAtMs: nowMs,
    });
    return result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "handoff_execution_failed";
    if (reservation?.reservationRef) {
      try {
        await input.river.sealException({
          handoffRef: claims.handoff_ref,
          reservationRef: reservation.reservationRef,
          claims,
          reason,
          sealedAt: nowIso,
        });
      } catch {
        // The original handoff failure remains authoritative; evidence-seal failure is surfaced by live observability.
      }
    }
    await input.journal.fail({
      nonce: claims.nonce,
      tokenDigest,
      reason,
      failedAtMs: nowMs,
    });
    throw error;
  }
}

export class InMemoryHmacHandoffKeyringV1
  implements HandoffTokenSignerV1, HandoffTokenSignatureVerifierV1
{
  readonly keyRef: string;
  private readonly keys: Map<string, Buffer>;

  constructor(keyRef: string, secret: string, additional: Record<string, string> = {}) {
    if (!keyRef || secret.length < 32) throw new Error("handoff_key_binding_invalid");
    this.keyRef = keyRef;
    this.keys = new Map([[keyRef, Buffer.from(secret, "utf8")]]);
    for (const [ref, value] of Object.entries(additional)) {
      if (value.length < 32) throw new Error("handoff_key_binding_invalid");
      this.keys.set(ref, Buffer.from(value, "utf8"));
    }
  }

  async sign(input: string): Promise<string> {
    const key = this.keys.get(this.keyRef);
    if (!key) throw new Error("handoff_signing_key_missing");
    return b64url(createHmac("sha256", key).update(input).digest());
  }

  async verify(keyRef: string, input: string, signature: string): Promise<boolean> {
    const key = this.keys.get(keyRef);
    if (!key) return false;
    const expected = b64url(createHmac("sha256", key).update(input).digest());
    const left = Buffer.from(signature, "utf8");
    const right = Buffer.from(expected, "utf8");
    return left.length === right.length && timingSafeEqual(left, right);
  }
}

interface InMemoryJournalRowV1 {
  handoffRef: string;
  tokenDigest: string;
  expiresAtMs: number;
  state: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  result?: GovernedHandoffResultV1;
}

export class InMemoryHandoffExecutionJournalV1 implements HandoffExecutionJournalV1 {
  private readonly rows = new Map<string, InMemoryJournalRowV1>();

  async begin(input: HandoffJournalStartV1): Promise<HandoffJournalBeginResultV1> {
    const existing = this.rows.get(input.nonce);
    if (existing && existing.expiresAtMs <= input.startedAtMs) this.rows.delete(input.nonce);
    const current = this.rows.get(input.nonce);
    if (!current) {
      this.rows.set(input.nonce, {
        handoffRef: input.handoffRef,
        tokenDigest: input.tokenDigest,
        expiresAtMs: input.expiresAtMs,
        state: "IN_PROGRESS",
      });
      return { state: "STARTED" };
    }
    if (current.tokenDigest !== input.tokenDigest || current.handoffRef !== input.handoffRef) {
      return { state: "CONFLICT" };
    }
    if (current.state === "COMPLETED" && current.result) {
      return { state: "COMPLETED", result: { ...current.result } };
    }
    return { state: current.state };
  }

  async complete(input: {
    nonce: string;
    tokenDigest: string;
    result: GovernedHandoffResultV1;
    completedAtMs: number;
  }): Promise<void> {
    const row = this.rows.get(input.nonce);
    if (!row || row.tokenDigest !== input.tokenDigest || row.state !== "IN_PROGRESS") {
      throw new Error("handoff_journal_complete_conflict");
    }
    row.state = "COMPLETED";
    row.result = { ...input.result };
  }

  async fail(input: {
    nonce: string;
    tokenDigest: string;
    reason: string;
    failedAtMs: number;
  }): Promise<void> {
    const row = this.rows.get(input.nonce);
    if (!row || row.tokenDigest !== input.tokenDigest || row.state !== "IN_PROGRESS") {
      throw new Error("handoff_journal_fail_conflict");
    }
    row.state = "FAILED";
  }

  size(): number {
    return this.rows.size;
  }
}
