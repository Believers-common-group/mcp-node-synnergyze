import { createHash } from "node:crypto";

export type LegislativeLifecycleState =
  | "SIGNAL"
  | "PROPOSAL"
  | "ADVANCING"
  | "ADOPTED"
  | "EFFECTIVE"
  | "ENFORCED"
  | "SUPERSEDED"
  | "WITHDRAWN"
  | "FAILED"
  | "UNKNOWN";

export interface LegislativeObjectRef {
  congress: number;
  billType: string;
  billNumber: number;
}

export interface LegislativeSourceRecord {
  sourceId: string;
  sourceSystem: "congress.gov";
  jurisdiction: "US-FEDERAL";
  sourceObjectType: "bill" | "amendment" | "law" | "committee-report" | "vote";
  sourceObjectId: string;
  sourceUrl?: string;
  retrievedAt: string;
  sourceUpdatedAt?: string;
  rawSha256: string;
  requestReceiptId: string;
}

export interface LegislativeEvent {
  eventId: string;
  sourceRef: string;
  jurisdiction: string;
  authorityRef?: string;
  objectType: string;
  objectId: string;
  eventType: string;
  eventAt?: string;
  stage: LegislativeLifecycleState;
  title?: string;
  summary?: string;
  subjects: string[];
  committees: string[];
  actors: string[];
  effectiveDate?: string;
  evidenceRefs: string[];
}

export interface SourceEnvelope<T = unknown> {
  sourceRecord: LegislativeSourceRecord;
  payload: T;
  httpStatus: number;
  rateLimit?: {
    limit?: string;
    remaining?: string;
  };
}

export interface RelatedSourceBundle {
  bill: SourceEnvelope;
  actions: SourceEnvelope[];
  amendments: SourceEnvelope[];
  committees: SourceEnvelope[];
  subjects: SourceEnvelope[];
  summaries: SourceEnvelope[];
  law?: SourceEnvelope;
}

export interface SourceHealth {
  ok: boolean;
  observedAt: string;
  status?: number;
}

export type LegislativeLifecycleStateV1 = LegislativeLifecycleState;

export interface LegislativeObjectRefV1 {
  jurisdiction: "US-FEDERAL";
  objectType: "bill";
  congress: number;
  billType: string;
  number: number;
}

export interface SourceEnvelopeV1 {
  schemaVersion: "LEG-SOURCE:R0.1";
  sourceRef: string;
  sourceSystem: "congress.gov";
  sourceObjectId: string;
  sourceObjectType:
    | "bill"
    | "actions"
    | "subjects"
    | "committees"
    | "amendments"
    | "summaries"
    | "law";
  sourcePath: string;
  retrievedAt: string;
  sourceUpdatedAt?: string;
  httpStatus: number;
  rateLimitLimit?: number;
  rateLimitRemaining?: number;
  rawSha256: string;
  credentialAdmissionRef: "CONGRESS-GOV-API-KEY-001";
  credentialFingerprintPrefix?: string;
  body: unknown;
}

export interface RelatedSourceBundleV1 {
  bill: SourceEnvelopeV1;
  actions: readonly SourceEnvelopeV1[];
  subjects: readonly SourceEnvelopeV1[];
  committees: readonly SourceEnvelopeV1[];
  amendments: readonly SourceEnvelopeV1[];
  summaries: readonly SourceEnvelopeV1[];
  law?: SourceEnvelopeV1;
}

export interface NormalizedLegislativeEventV1 {
  schemaVersion: "LEG-EVENT:R0.1";
  eventRef: string;
  sourceRefs: readonly string[];
  jurisdiction: "US-FEDERAL";
  objectType: "bill";
  objectId: string;
  lifecycle: LegislativeLifecycleStateV1;
  title?: string;
  summary?: string;
  introducedAt?: string;
  latestActionAt?: string;
  effectiveDate?: string;
  subjects: readonly string[];
  committees: readonly string[];
  actors: readonly string[];
  actionRefs: readonly string[];
  evidenceRefs: readonly string[];
  normalizedAt: string;
  normalizerVersion: "LEG-NORMALIZER:R0.1";
}

export interface SourceHealthV1 {
  sourceSystem: "congress.gov";
  ok: boolean;
  checkedAt: string;
  httpStatus?: number;
  errorCode?: string;
  credentialAdmissionRef: "CONGRESS-GOV-API-KEY-001";
  credentialFingerprintPrefix?: string;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonical(child)]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

export function sha256Ref(prefix: string, value: unknown): string {
  const digest = createHash("sha256").update(stableJson(value), "utf8").digest("hex");
  return `${prefix}:${digest}`;
}
