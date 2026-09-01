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
