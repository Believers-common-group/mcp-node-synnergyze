import { createHash } from "node:crypto";

import type { NormalizedIntentV1, ProgramPlanDraftV1 } from "../qel/contracts.ts";
import type { SynnergyzeProgramEventDraftBundleV1 } from "./contracts.ts";
import { compileQelPlanToSynnergyzeDraftsV1 } from "./program-bridge.ts";

/**
 * R0.9: native Synnergyze source-reference planning preview ONLY.
 * No MCP registration, Warden request, River reservation, network I/O or execution.
 * The current production Agentic Factory worker is NOT established by this module.
 */
export type ReferenceOperationV1 = "discover" | "retrieve_public" | "verify" | "reference";
export type ReferencePreviewModeV1 = "OFFLINE_REVIEW" | "STAGING_REVIEW";

export interface AuthorityReferencePreviewInputV1 {
  operation: ReferenceOperationV1;
  mode: ReferencePreviewModeV1;
  actorRef: string;
  contextRef: string;
  correlationId: string;
  sourceExpressionRef: string;
  sourceAuthorityRef: string;
  recordRef: string;
  observedAt: string;
  claimedEventDate?: string;
}

export interface AuthorityReferencePreviewV1 {
  schema: "SYNNERGYZE-AUTHORITY-REFERENCE-NATIVE-PREVIEW-001/R0.9";
  state: "HOLD";
  authorized: false;
  executionAllowed: false;
  externalEffects: false;
  candidateDigest: string;
  evidenceChronology: {
    claimedEventDate: string | null;
    sourceRecordedAt: null;
    independentlyTimestampedAt: null;
    verifiedAt: null;
  };
  declaredSource: { authorityRef: string; recordRef: string; independentlyVerified: false };
  bundle: SynnergyzeProgramEventDraftBundleV1;
  blockers: readonly string[];
}

const OPERATIONS = new Set<string>(["discover", "retrieve_public", "verify", "reference"]);
const MODES = new Set<string>(["OFFLINE_REVIEW", "STAGING_REVIEW"]);
const REF = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,159}$/;
const BLOCKERS = Object.freeze([
  "NATIVE_WORKER_COMMISSIONING_UNVERIFIED",
  "SOURCE_AUTHORITY_AND_EGRESS_UNAPPROVED",
  "DIGITALME_REPRESENTATION_UNVERIFIED",
  "WARDEN_CAPABILITY_NOT_ADMITTED",
  "LIVE_RIVER_ADMISSION_AND_EXECUTION_RECEIPTS_MISSING",
]);
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, stable(nested)]));
  }
  return value;
}
function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}
function requiredRef(value: unknown, name: string): string {
  if (typeof value !== "string" || !REF.test(value) || value.includes("://"))
    throw new Error(`reference_${name}_invalid`);
  return value;
}
function observedInstant(value: unknown): string {
  if (typeof value !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(Date.parse(value)).toISOString().slice(0, 10) !== value.slice(0, 10)) {
    throw new Error("reference_observed_at_invalid");
  }
  return value;
}
function validateDate(value: unknown, observedAt: string): string | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("reference_claimed_date_invalid");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day)
    throw new Error("reference_claimed_date_invalid");
  if (value > observedAt.slice(0, 10))
    throw new Error("reference_claimed_date_in_future");
  return value;
}

export function compileAuthorityReferencePreviewV1(input: AuthorityReferencePreviewInputV1): AuthorityReferencePreviewV1 {
  if (!isObject(input)) throw new Error("reference_input_invalid");
  if (!OPERATIONS.has(input.operation)) throw new Error("reference_operation_not_supported");
  if (!MODES.has(input.mode)) throw new Error("reference_mode_not_isolated");
  const actorRef = requiredRef(input.actorRef, "actor");
  const contextRef = requiredRef(input.contextRef, "context");
  const correlationId = requiredRef(input.correlationId, "correlation");
  const sourceExpressionRef = requiredRef(input.sourceExpressionRef, "expression");
  const sourceAuthorityRef = requiredRef(input.sourceAuthorityRef, "authority");
  const recordRef = requiredRef(input.recordRef, "record");
  const observedAt = observedInstant(input.observedAt);
  const claimedEventDate = validateDate(input.claimedEventDate, observedAt);
  const candidateDigest = `sha256:${fingerprint({ actorRef, contextRef, correlationId, sourceExpressionRef, sourceAuthorityRef, recordRef, operation: input.operation, mode: input.mode, claimedEventDate, observedAt })}`;
  const seed = candidateDigest.slice(7, 31);
  const intent: NormalizedIntentV1 = {
    intentRef: `REFERENCE-INTENT:${seed}`, actorRef, contextRef,
    thingRef: recordRef, action: `authority_reference.${input.operation}`,
    capabilityRef: `authority_reference.${input.operation}`,
    authorityState: "UNRESOLVED", authorized: false,
    sourceExpressionRef, correlationId,
  };
  const plan: ProgramPlanDraftV1 = {
    planRef: `REFERENCE-PLAN:${seed}`, intentRef: intent.intentRef,
    status: "DRAFT", authorized: false, correlationId,
    steps: [{ stepRef: `REFERENCE-STEP:${seed}`, action: intent.action,
      targetRef: recordRef, dependencyRefs: [], requirementRefs: BLOCKERS }],
    dependencyRefs: [], constraintRefs: ["NO_EXTERNAL_EXECUTION"],
  };
  const compiled = compileQelPlanToSynnergyzeDraftsV1({ intent, plan, compiledAt: observedAt });
  if (!compiled.ok) throw new Error(`reference_native_compiler_${compiled.code}`);
  if (compiled.bundle.program.authorized !== false ||
      compiled.bundle.program.state === "READY_FOR_AUTHORIZATION" ||
      compiled.bundle.events.some(event => event.authorized !== false || event.state !== "DRAFT")) {
    throw new Error("reference_native_authority_invariant_failed");
  }
  return {
    schema: "SYNNERGYZE-AUTHORITY-REFERENCE-NATIVE-PREVIEW-001/R0.9",
    state: "HOLD", authorized: false, executionAllowed: false, externalEffects: false,
    candidateDigest,
    evidenceChronology: { claimedEventDate, sourceRecordedAt: null,
      independentlyTimestampedAt: null, verifiedAt: null },
    declaredSource: { authorityRef: sourceAuthorityRef, recordRef, independentlyVerified: false },
    bundle: compiled.bundle,
    blockers: BLOCKERS,
  };
}
