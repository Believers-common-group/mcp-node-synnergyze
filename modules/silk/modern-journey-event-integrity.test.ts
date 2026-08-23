import { describe, expect, it } from "vitest";

import {
  ModernJourneyEventLogV1,
  modernJourneyPayloadDigestV1,
  validateModernJourneyEventRecordV1,
} from "./modern-journey-event-log.ts";

function event() {
  return new ModernJourneyEventLogV1().append({
    idempotencyKey: "TXN-INTEGRITY:OPEN",
    transactionRef: "TXN-INTEGRITY",
    journeyRef: "MODERN-JOURNEY:INTEGRITY",
    actorRef: "DIGITALME-CONFLUENCE-001",
    eventType: "TRANSACTION_OPENED",
    occurredAt: "2026-08-24T00:00:01.000Z",
    payload: {
      silkAccountRef: "SILK-ENT-042",
      economicOwnerRef: "ENTERPRISE-CONFLUENCE-001",
      amount: 4800,
      currency: "INR",
    },
  });
}

describe("MODERN-JOURNEY-EVENT-INTEGRITY-001", () => {
  it("accepts the original content-addressed event", () => {
    expect(() => validateModernJourneyEventRecordV1(event())).not.toThrow();
  });

  it("rejects payload mutation when the stored digest is unchanged", () => {
    const original = event();
    const tampered = {
      ...original,
      payload: { ...original.payload, amount: 4900 },
    };

    expect(() => validateModernJourneyEventRecordV1(tampered)).toThrow(
      "modern_event_record_payload_digest_mismatch",
    );
  });

  it("rejects coordinated payload and digest mutation when the event reference is unchanged", () => {
    const original = event();
    const payload = { ...original.payload, amount: 4900 };
    const tampered = {
      ...original,
      payload,
      payloadDigest: modernJourneyPayloadDigestV1(payload),
    };

    expect(() => validateModernJourneyEventRecordV1(tampered)).toThrow(
      "modern_event_record_event_ref_mismatch",
    );
  });
});