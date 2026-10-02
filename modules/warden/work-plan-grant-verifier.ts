/**
 * Reference Ed25519 verification profile for proposed VSR work actions.
 *
 * IMPORTANT: this checks the signature and exact read-only proposal binding,
 * but NEVER admits or executes an effect. Production requires an independently
 * authenticated Registry/Warden key and actual execution-admission service.
 * No private keys are stored here or accessible to callers.
 */
import { createHash, createPublicKey, verify } from "node:crypto";
import type { KeyObject } from "node:crypto";

export interface ProposedWorkRequest {
  request: {
    state: string; principal_id: string; context_id: string;
    program_id: string; action_id: string; capability_id: string;
    target_id: string; effect_class: string; constraints: {
      max_compute_credits: number; max_duration_seconds: number; data_classes: string[];
    };
    required_evidence_profile: string;
  };
  request_digest: string;
}
export interface TrustedWorkContext {
  principalId: string;
  receiptId: string;
  receiptExpiresAt: string;
  representedPrincipalId: string;
  actingCapacityId: string;
  authorityRefs: readonly string[];
  policyRefs: readonly string[];
  // Must be provisioned from an external authenticated Warden trust root.
  trustedPublicKeys: Readonly<Record<string, string>>;
  revokedGrantIds: ReadonlySet<string>;
}
export interface WorkExecutionGrant {
  schema_id: string;
  contract_id: string;
  contract_version: string;
  grant_id: string;
  decision_id: string;
  principal_id: string;
  represented_principal_id: string;
  acting_capacity_id: string;
  context_id: string;
  program_id: string;
  action_id: string;
  capability_id: string;
  target_id: string;
  effect_class: string;
  effect_binding: string;
  authority_refs: string[];
  consent_refs: string[];
  policy_refs: string[];
  request_digest: string;
  constraints: {
    minimum_containment: string;
    network_mode: string;
    max_duration_seconds: number;
  };
  required_evidence_profile: string;
  issued_at: string;
  expires_at: string;
  warden_key_id: string;
  grant_signature: { algorithm: string; signature: string };
}
export type GrantCheck =
  | { verdict: "CRYPTOGRAPHICALLY_VALID_NOT_ADMITTED"; grantId: string; digest: string }
  | { verdict: "REJECTED"; reason: string };

export function workCanonicalJson(input: unknown): string {
  if (input === null || typeof input === "string" || typeof input === "boolean") {
    return JSON.stringify(input);
  }
  if (typeof input === "number") {
    if (!Number.isSafeInteger(input) || Object.is(input, -0)) {
      throw new Error("UNSUPPORTED_CANONICAL_NUMBER");
    }
    return String(input);
  }
  if (Array.isArray(input)) {
    return "[" + input.map(workCanonicalJson).join(",") + "]";
  }
  if (typeof input === "object") {
    const record = input as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return "{" + keys.map((key) =>
      JSON.stringify(key) + ":" + workCanonicalJson(record[key])).join(",") + "}";
  }
  throw new Error("UNSUPPORTED_CANONICAL_VALUE");
}
export function workSha256(input: unknown): string {
  return createHash("sha256").update(workCanonicalJson(input), "utf8").digest("hex");
}
export function unsignedGrant(grant: WorkExecutionGrant): Record<string, unknown> {
  const { grant_signature: _signature, ...payload } = grant;
  return payload;
}
function sameRefs(a: readonly string[], b: readonly string[]): boolean {
  return Array.isArray(a) && Array.isArray(b) &&
    a.length === new Set(a).size && b.length === new Set(b).size &&
    JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}
function parseTime(value: string): number {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return NaN;
  return Date.parse(value);
}
function isDigest(value: string): boolean {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}
function verifySignature(grant: WorkExecutionGrant, pem: string): boolean {
  try {
    const key: KeyObject = createPublicKey(pem);
    if (key.asymmetricKeyType !== "ed25519" ||
        grant.grant_signature?.algorithm !== "Ed25519") return false;
    const encoded = grant.grant_signature.signature;
    if (!/^[A-Za-z0-9+/]{86}==$/.test(encoded)) return false;
    const signature = Buffer.from(encoded, "base64");
    if (signature.length !== 64 || signature.toString("base64") !== encoded) return false;
    return verify(null, Buffer.from(workCanonicalJson(unsignedGrant(grant)), "utf8"), key, signature);
  } catch {
    return false;
  }
}
export function verifyProposedWorkGrant(
  proposal: ProposedWorkRequest,
  grant: WorkExecutionGrant,
  trusted: TrustedWorkContext,
  now: string,
): GrantCheck {
  const reject = (reason: string): GrantCheck => ({ verdict: "REJECTED", reason });
  if (!grant || !proposal || !trusted) return reject("MISSING_INPUT");
  const req = proposal.request;
  if (!req || req.state !== "PROPOSED_FOR_WARDEN_EVALUATION") return reject("PLAN_STATE_INVALID");
  if (!isDigest(proposal.request_digest)) return reject("PROPOSAL_DIGEST_INVALID");
  try {
    // Require the actual request bytes (not a digest claimed by the LLM) to match.
    if (workSha256(req) !== proposal.request_digest) return reject("PROPOSAL_DIGEST_MISMATCH");
  } catch { return reject("UNSUPPORTED_PROPOSAL_INPUT"); }

  if (grant.schema_id !== "genesis:warden-execution-grant" ||
      grant.contract_id !== "WARDEN-EXECUTION-GRANT-001" ||
      grant.contract_version !== "1.0" ||
      !grant.grant_id || !grant.decision_id) return reject("GRANT_CONTRACT_INVALID");

  const fields: Array<[string,string]> = [
    [grant.principal_id, req.principal_id],
    [grant.principal_id, trusted.principalId],
    [grant.represented_principal_id, trusted.representedPrincipalId],
    [grant.acting_capacity_id, trusted.actingCapacityId],
    [grant.context_id, req.context_id], [grant.program_id, req.program_id],
    [grant.action_id, req.action_id], [grant.capability_id, req.capability_id],
    [grant.target_id, req.target_id], [grant.effect_class, req.effect_class],
    [grant.request_digest, proposal.request_digest],
    [grant.effect_binding, "sha256:" + proposal.request_digest],
    [grant.required_evidence_profile, req.required_evidence_profile],
  ];
  if (fields.some(([actual, expected]) => actual !== expected)) {
    return reject("EXACT_ACTION_BINDING_MISMATCH");
  }
  if (!trusted.receiptId || !trusted.principalId ||
      !sameRefs(grant.authority_refs, trusted.authorityRefs) ||
      !grant.authority_refs.length || !sameRefs(grant.policy_refs, trusted.policyRefs) ||
      !grant.policy_refs.length || !Array.isArray(grant.consent_refs)) {
    return reject("TRUSTED_AUTHORITY_CONTEXT_MISMATCH");
  }
  if (!Array.isArray(req.constraints.data_classes) ||
      req.constraints.data_classes.length !== 1 ||
      req.constraints.data_classes[0] !== "SYNTHETIC" ||
      req.constraints.max_compute_credits !== 0 ||
      req.effect_class !== "READ") {
    return reject("ONLY_ZERO_COST_SYNTHETIC_READ_PROFILES");
  }
  if (grant.constraints?.network_mode !== "DENY" ||
      !["C1_PROCESS","C2_CONTAINER","C3_OS_CONTAINER","C4_MICROVM","C5_VM"].includes(grant.constraints.minimum_containment) ||
      !Number.isSafeInteger(grant.constraints.max_duration_seconds) ||
      grant.constraints.max_duration_seconds <= 0 ||
      grant.constraints.max_duration_seconds > req.constraints.max_duration_seconds) {
    return reject("CONSTRAINT_WIDENING_OR_UNSUPPORTED");
  }
  if (trusted.revokedGrantIds.has(grant.grant_id)) return reject("REVOKED_GRANT");
  const current = parseTime(now);
  const start = parseTime(grant.issued_at);
  const end = parseTime(grant.expires_at);
  const receiptExpiry = parseTime(trusted.receiptExpiresAt);
  if (![current,start,end,receiptExpiry].every(Number.isFinite) ||
      end <= start || current < start || current >= end || current >= receiptExpiry ||
      end > receiptExpiry) return reject("EXPIRED_OR_INVALID_TIME_WINDOW");
  const pem = trusted.trustedPublicKeys[grant.warden_key_id];
  if (!pem) return reject("UNKNOWN_TRUST_ROOT");
  if (!verifySignature(grant, pem)) return reject("INVALID_SIGNATURE");
  // No admission, replay fencing, provider invocation or River seal exists here.
  return {
    verdict: "CRYPTOGRAPHICALLY_VALID_NOT_ADMITTED",
    grantId: grant.grant_id,
    digest: proposal.request_digest,
  };
}
export function mayDispatchWorkGrant(_check: GrantCheck): false {
  return false;
}
