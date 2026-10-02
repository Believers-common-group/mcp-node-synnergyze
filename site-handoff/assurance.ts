/**
 * REG-SITE-HANDOFF-001 / R1 staging integration adapter contract.
 * NO HTTP ROUTE, NO DEPLOYMENT ACTIVATION, NO PROVIDER IMPLEMENTATIONS.
 * Production MUST supply independent/native DigitalMe, Warden, River,
 * durable replay and scoped-session adapters; synthetic doubles only in tests.
 */
import {
  issueHandoffGrant,
  consumeHandoffGrant,
  type EstateSiteId,
  type HandoffClaims,
  type HandoffGrantInput,
  type ReplayStore,
} from "./runtime.ts";

export interface PrincipalVerification {
  digitalMeId: string;
  status: "VERIFIED" | "REVOKED" | "UNKNOWN";
  proofRef: string;
  expiresAt: number;
}
export interface GrantVerification {
  decision: "ALLOW" | "DENY" | "ESCALATE";
  lifecycle: "ACTIVE" | "REVOKED" | "EXPIRED";
  grantId: string;
  digitalMeId: string;
  sourceSite: EstateSiteId;
  destinationSite: EstateSiteId;
  action: "SITE_HANDOFF";
  decisionRef: string;
  expiresAt: number;
}
export interface IssuanceReservation {
  reservationRef: string;
  state: "RESERVED" | "MISSING" | "SEALED";
  nonce: string;
  wardenDecisionRef: string;
  digitalMeId: string;
  audience: EstateSiteId;
}
export interface SessionState {
  sessionRef: string;
  state: "PENDING" | "ACTIVE" | "REVOKED";
}
export interface SealState {
  state: "SEALED" | "REJECTED";
  evidenceRef: string;
}
export interface HandoffNativePorts {
  /** A real DigitalMe issuer/session proof verifier; not a caller-supplied flag. */
  principal: {
    verify(digitalMeId: string): Promise<PrincipalVerification>;
  };
  /** Re-evaluates an actual Warden grant, including revocation/freshness. */
  warden: {
    verify(input: {
      grantId: string;
      digitalMeId: string;
      sourceSite: EstateSiteId;
      destinationSite: EstateSiteId;
    }): Promise<GrantVerification>;
  };
  /** A persistent River reservation and seal service, not in-memory receipts. */
  river: {
    reserve(input: {
      claims: HandoffClaims;
      principalProofRef: string;
      wardenDecisionRef: string;
    }): Promise<IssuanceReservation>;
    lookup(nonce: string): Promise<IssuanceReservation | null>;
    seal(input: {
      claims: HandoffClaims;
      reservationRef: string;
      sessionRef: string;
    }): Promise<SealState>;
  };
  /** A pending session cannot exercise any capability before activate(). */
  sessions: {
    prepare(claims: HandoffClaims): Promise<SessionState>;
    activate(sessionRef: string, evidenceRef: string): Promise<SessionState>;
    abort(sessionRef: string): Promise<void>;
  };
  /** Durable, shared, atomic compare-and-consume is a production prerequisite. */
  replay: ReplayStore;
}

function site(x: string): x is EstateSiteId {
  return x === "bc" || x === "cc" || x === "vsr";
}
function checkRequest(input: HandoffGrantInput): void {
  if (!site(input.sourceSite) || !site(input.destinationSite)) throw new Error("unknown_site");
  if (input.sourceSite === input.destinationSite) throw new Error("same_site_forbidden");
  if (!input.digitalMeId?.trim() || !input.wardenGrantId?.trim()) throw new Error("identity_or_grant_missing");
}
function checkReservation(res: IssuanceReservation | null, claims: HandoffClaims, decisionRef: string): asserts res is IssuanceReservation {
  if (!res || res.state !== "RESERVED" || !res.reservationRef?.trim() ||
      res.nonce !== claims.nonce || res.digitalMeId !== claims.digital_me_id ||
      res.audience !== claims.audience || res.wardenDecisionRef !== decisionRef) {
    throw new Error("river_reservation_unbound");
  }
}
async function verifyNativeAuthority(
  input: HandoffGrantInput,
  ports: HandoffNativePorts,
  nowSeconds: number,
  requiredUntil: number,
): Promise<{ principal: PrincipalVerification; warden: GrantVerification }> {
  checkRequest(input);
  const principal = await ports.principal.verify(input.digitalMeId);
  if (principal.status !== "VERIFIED" || principal.digitalMeId !== input.digitalMeId ||
      !principal.proofRef?.trim() || !Number.isFinite(principal.expiresAt) ||
      principal.expiresAt < requiredUntil) throw new Error("digitalme_proof_not_admitted");
  const warden = await ports.warden.verify({
    grantId: input.wardenGrantId,
    digitalMeId: input.digitalMeId,
    sourceSite: input.sourceSite,
    destinationSite: input.destinationSite,
  });
  if (warden.decision !== "ALLOW" || warden.lifecycle !== "ACTIVE" ||
      warden.action !== "SITE_HANDOFF" || warden.grantId !== input.wardenGrantId ||
      warden.digitalMeId !== input.digitalMeId || warden.sourceSite !== input.sourceSite ||
      warden.destinationSite !== input.destinationSite || !warden.decisionRef?.trim() ||
      !Number.isFinite(warden.expiresAt) || warden.expiresAt < requiredUntil ||
      nowSeconds > warden.expiresAt) throw new Error("warden_handoff_not_admitted");
  return { principal, warden };
}

export interface PreparedHandoff {
  token: string;
  claims: HandoffClaims;
  reservationRef: string;
}

/** Token never leaves this function until real authority + reservation succeed. */
export async function prepareGovernedHandoff(
  input: HandoffGrantInput,
  secret: string,
  ports: HandoffNativePorts,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<PreparedHandoff> {
  const ttlSeconds = input.ttlSeconds ?? 90;
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 15 || ttlSeconds > 120) {
    throw new Error("invalid_ttl");
  }
  const verified = await verifyNativeAuthority(input, ports, nowSeconds, nowSeconds + ttlSeconds);
  const issued = issueHandoffGrant(input, secret, nowSeconds);
  const reservation = await ports.river.reserve({
    claims: issued.claims,
    principalProofRef: verified.principal.proofRef,
    wardenDecisionRef: verified.warden.decisionRef,
  });
  checkReservation(reservation, issued.claims, verified.warden.decisionRef);
  return { ...issued, reservationRef: reservation.reservationRef };
}

export interface CompletedHandoff {
  sessionRef: string;
  evidenceRef: string;
  destinationSite: EstateSiteId;
}

/** Fail closed: sealed River evidence precedes active destination session. */
export async function completeGovernedHandoff(
  token: string,
  expectedAudience: EstateSiteId,
  secret: string,
  ports: HandoffNativePorts,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<CompletedHandoff> {
  if (!site(expectedAudience)) throw new Error("unknown_audience");
  const claims = await consumeHandoffGrant(token, expectedAudience, secret, ports.replay, nowSeconds);
  const verified = await verifyNativeAuthority({
    digitalMeId: claims.digital_me_id,
    sourceSite: claims.source_site,
    destinationSite: claims.audience,
    returnUrl: claims.return_url,
    wardenGrantId: claims.warden_grant_id,
  }, ports, nowSeconds, nowSeconds);
  const reservation = await ports.river.lookup(claims.nonce);
  checkReservation(reservation, claims, verified.warden.decisionRef);
  let pending: SessionState | undefined;
  try {
    pending = await ports.sessions.prepare(claims);
    if (pending.state !== "PENDING" || !pending.sessionRef?.trim()) {
      throw new Error("scoped_session_not_pending");
    }
    const seal = await ports.river.seal({
      claims,
      reservationRef: reservation.reservationRef,
      sessionRef: pending.sessionRef,
    });
    if (seal.state !== "SEALED" || !seal.evidenceRef?.trim()) {
      throw new Error("river_seal_not_verified");
    }
    const activated = await ports.sessions.activate(pending.sessionRef, seal.evidenceRef);
    if (activated.state !== "ACTIVE" || activated.sessionRef !== pending.sessionRef) {
      throw new Error("scoped_session_not_active");
    }
    return { sessionRef: activated.sessionRef, evidenceRef: seal.evidenceRef, destinationSite: claims.audience };
  } catch (cause) {
    if (pending?.sessionRef) {
      try { await ports.sessions.abort(pending.sessionRef); }
      catch { throw new Error("handoff_compensation_failed", { cause }); }
    }
    throw cause;
  }
}
