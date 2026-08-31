import type { AssertionType } from "./assertion.ts";
import type { AssuranceLevel } from "./assurance.ts";

export interface PefProducerV1 {
  producer_id: string;
  producer_type: "sensor" | "gateway" | "service" | "fixture";
}

export interface PefEventV1<TPayload = Record<string, unknown>> {
  schema_version: "pef-event.v1";
  event_id: string;
  event_type: string;
  assertion_type: AssertionType;
  assurance: AssuranceLevel;
  occurred_at: string;
  recorded_at: string;
  producer: PefProducerV1;
  payload: TPayload;
  payload_hash?: string;
  source_event_id?: string;
  predecessor_event_id?: string;
}
