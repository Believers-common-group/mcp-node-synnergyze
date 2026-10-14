import { createHash, createPublicKey, verify } from "node:crypto";

import type { AuthorityReferencePreviewV1 } from "./authority-reference-preview.ts";

/**
 * R1.1 offline Warden/River admission-evidence verifier.
 *
 * Verifies TEST FIXTURE signatures and exact binding only.
 * Never calls real Warden/River, admits a capability, consumes a permit,
 * makes network calls, or invokes a worker.
 */
export interface SignedAdmissionEvidenceV1 {
  schema: "SYNNERGYZE-AUTHORITY-SIGNED-PROOF-001/R1.1";
  issuerId: string;
  keyId: string;
  algorithm: "Ed25519";
  claims: Record<string, unknown>;
  signatureBase64: string;
}

export interface OfflineAdmissionTrustV1 {
  schema: "SYNNERGYZE-OFFLINE-ADMISSION-TRUST-001/R1.1";
  mode: "TEST_FIXTURE_ONLY";
  warden: { issuerId: string; keys: Record<string, string>; revokedKeyIds: string[] };
  river: { issuerId: string; keys: Record<string, string>; revokedKeyIds: string[] };
}

export interface OfflineAdmissionBundleV1 {
  preview: AuthorityReferencePreviewV1;
  requestRef: string;
  workerBindingDigest: string;
  warden: SignedAdmissionEvidenceV1;
  river: SignedAdmissionEvidenceV1;
  trust: OfflineAdmissionTrustV1;
  evaluatedAt: string;
}

export interface OfflineAdmissionResultV1 {
  schema: "SYNNERGYZE-ADMISSION-CHAIN-PREFLIGHT-001/R1.1";
  state: "HOLD";
  executionAllowed: false;
  wardenAdmissionGranted: false;
  riverLiveReceiptVerified: false;
  oneTimePermitConsumed: false;
  realWorkerAttested: false;
  cryptographicFixtureChecks: {
    wardenSignatureValid: boolean;
    riverSignatureValid: boolean;
    claimsBoundToNativeDraft: boolean;
    crossReceiptBindingValid: boolean;
  };
  reasons: readonly string[];
}

const SCHEMA = "SYNNERGYZE-AUTHORITY-SIGNED-PROOF-001/R1.1";
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.trim() === v;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const isoTime = (v: unknown): number => {
  if (!str(v) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v))
    return NaN;
  const t = Date.parse(v);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0,10) === v.slice(0,10) ? t : NaN;
};
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (object(v)) return Object.fromEntries(
    Object.entries(v).sort(([a],[b]) => a.localeCompare(b)).map(([k,n]) => [k,stable(n)])
  );
  return v;
}
export function admissionClaimsDigest(claims: unknown): string {
  return "sha256:" + createHash("sha256").update(JSON.stringify(stable(claims))).digest("hex");
}
export function canonicalAdmissionProofMessage(proof: Pick<SignedAdmissionEvidenceV1,
  "schema" | "issuerId" | "keyId" | "algorithm" | "claims">): string {
  return "SYNNERGYZE-ADMISSION-EVIDENCE-R1.1\n" + JSON.stringify(stable({
    schema: proof.schema, issuerId: proof.issuerId, keyId: proof.keyId,
    algorithm: proof.algorithm, claims: proof.claims,
  }));
}
function signatureBytes(x: unknown): Buffer | null {
  if (!str(x) || !/^[A-Za-z0-9+/]+={0,2}$/.test(x)) return null;
  const bytes = Buffer.from(x, "base64");
  return bytes.length === 64 && bytes.toString("base64") === x ? bytes : null;
}
function verifies(proof: unknown, root: unknown): boolean {
  if (!object(proof) || !object(root) || proof.schema !== SCHEMA ||
      proof.algorithm !== "Ed25519" || proof.issuerId !== root.issuerId ||
      !str(proof.keyId) || !object(proof.claims) ||
      !object(root.keys) || !Array.isArray(root.revokedKeyIds) ||
      root.revokedKeyIds.includes(proof.keyId)) return false;
  const pem = root.keys[proof.keyId];
  const sig = signatureBytes(proof.signatureBase64);
  if (typeof pem !== "string" || !pem.includes("-----BEGIN PUBLIC KEY-----") || !sig) return false;
  try {
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== "ed25519") return false;
    const message = canonicalAdmissionProofMessage(proof as unknown as SignedAdmissionEvidenceV1);
    return verify(null, Buffer.from(message), key, sig);
  } catch { return false; }
}
export function inspectOfflineAdmissionChainV1(input: unknown): OfflineAdmissionResultV1 {
  const reasons: string[] = [];
  const add = (r: string) => { if (!reasons.includes(r)) reasons.push(r); };
  const proof = object(input) ? input : {};
  const trust = object(proof.trust) ? proof.trust : {};
  const preview = object(proof.preview) ? proof.preview : {};
  const warden = object(proof.warden) ? proof.warden : {};
  const river = object(proof.river) ? proof.river : {};
  const wc = object(warden.claims) ? warden.claims : {};
  const rc = object(river.claims) ? river.claims : {};
  const p = object(preview.bundle) && object(preview.bundle.program) ? preview.bundle.program : {};
  const event = object(preview.bundle) && Array.isArray(preview.bundle.events) &&
    preview.bundle.events.length === 1 && object(preview.bundle.events[0]) ?
    preview.bundle.events[0] : {};

  if (trust.schema !== "SYNNERGYZE-OFFLINE-ADMISSION-TRUST-001/R1.1" ||
      trust.mode !== "TEST_FIXTURE_ONLY" || !object(trust.warden) ||
      !object(trust.river) || trust.warden.issuerId === trust.river.issuerId) {
    add("DISTINCT_OFFLINE_TRUST_ROOTS_REQUIRED");
  }
  const wKey = object(trust.warden) && object(trust.warden.keys) ? trust.warden.keys[warden.keyId as string] : undefined;
  const rKey = object(trust.river) && object(trust.river.keys) ? trust.river.keys[river.keyId as string] : undefined;
  if (str(wKey) && str(rKey) && wKey === rKey) add("SAME_PUBLIC_KEY_NOT_INDEPENDENT");

  const signatureRootsValid = !reasons.includes("DISTINCT_OFFLINE_TRUST_ROOTS_REQUIRED") &&
    !reasons.includes("SAME_PUBLIC_KEY_NOT_INDEPENDENT");
  const wardenSignatureValid = signatureRootsValid && verifies(warden, trust.warden);
  const riverSignatureValid = signatureRootsValid && verifies(river, trust.river);
  if (!wardenSignatureValid) add("WARDEN_TEST_SIGNATURE_INVALID");
  if (!riverSignatureValid) add("RIVER_TEST_SIGNATURE_INVALID");

  const previewValid = preview.schema === "SYNNERGYZE-AUTHORITY-REFERENCE-NATIVE-PREVIEW-001/R0.9" &&
    preview.state === "HOLD" && preview.executionAllowed === false &&
    preview.authorized === false && preview.externalEffects === false &&
    p.authorized === false && p.state !== "READY_FOR_AUTHORIZATION" &&
    event.authorized === false && event.state === "DRAFT" &&
    p.programRef === event.programRef && p.correlationId === event.correlationId &&
    p.actorRef === event.actorRef && p.eventRefs instanceof Array &&
    p.eventRefs.length === 1 && p.eventRefs[0] === event.eventRef;

  const requestRef = proof.requestRef, workerBindingDigest = proof.workerBindingDigest;
  const requestTime = isoTime(wc.issuedAt), expiry = isoTime(wc.expiresAt),
    receiptTime = isoTime(rc.acceptedAt), now = isoTime(proof.evaluatedAt);
  const timesValid = [requestTime,expiry,receiptTime,now].every(Number.isFinite) &&
    requestTime <= receiptTime && receiptTime <= now && now <= expiry &&
    expiry > requestTime && expiry - requestTime <= 15 * 60 * 1000;

  const nativeBinding = previewValid && str(requestRef) && str(workerBindingDigest) &&
    DIGEST.test(workerBindingDigest) && str(preview.candidateDigest) &&
    DIGEST.test(preview.candidateDigest) &&
    wc.decision === "ALLOW" && str(wc.decisionRef) &&
    wc.requestRef === requestRef && wc.actorRef === event.actorRef &&
    wc.contextRef === event.contextRef && wc.programRef === p.programRef &&
    wc.eventRef === event.eventRef && wc.correlationId === event.correlationId &&
    wc.capabilityRef === event.capabilityRef && wc.action === event.action &&
    wc.targetRef === event.targetRef &&
    wc.candidateDigest === preview.candidateDigest &&
    wc.compilationDigest === p.compilationDigest &&
    wc.workerBindingDigest === workerBindingDigest &&
    str(wc.actionTokenDigest) && DIGEST.test(wc.actionTokenDigest) && timesValid;
  if (!nativeBinding) add("SIGNED_WARDEN_CLAIMS_NOT_BOUND_TO_DRAFT");

  const receiptBinding = nativeBinding && rc.receiptType === "ADMISSION" &&
    rc.state === "ACCEPTED" && str(rc.receiptRef) && rc.requestRef === requestRef &&
    rc.wardenDecisionRef === wc.decisionRef &&
    rc.wardenDecisionDigest === admissionClaimsDigest(wc) &&
    rc.actionTokenDigest === wc.actionTokenDigest &&
    rc.workerBindingDigest === workerBindingDigest &&
    rc.candidateDigest === preview.candidateDigest &&
    rc.programRef === p.programRef && rc.eventRef === event.eventRef &&
    rc.correlationId === event.correlationId && timesValid;
  if (!receiptBinding) add("SIGNED_RIVER_RECEIPT_NOT_EXACTLY_BOUND");

  // Valid offline test signatures verify mathematical consistency only.
  add("OFFLINE_FIXTURES_ARE_NOT_AUTHORISED_WARDEN_OR_RIVER");
  add("INDEPENDENT_WORKER_BUILD_AND_DEPLOYMENT_NOT_ESTABLISHED");
  add("DIGITALME_DELEGATION_AND_LIVE_REVOCATION_NOT_VERIFIED");
  add("GLOBAL_NONCE_AND_SINGLE_USE_PERMIT_LEDGER_NOT_AVAILABLE");
  add("OFFICIAL_SOURCE_EGRESS_AND_LIVE_EXECUTION_RECEIPT_MISSING");
  return {
    schema: "SYNNERGYZE-ADMISSION-CHAIN-PREFLIGHT-001/R1.1",
    state: "HOLD", executionAllowed: false, wardenAdmissionGranted: false,
    riverLiveReceiptVerified: false, oneTimePermitConsumed: false,
    realWorkerAttested: false,
    cryptographicFixtureChecks: {
      wardenSignatureValid,
      riverSignatureValid,
      claimsBoundToNativeDraft: Boolean(nativeBinding),
      crossReceiptBindingValid: Boolean(receiptBinding),
    },
    reasons,
  };
}
