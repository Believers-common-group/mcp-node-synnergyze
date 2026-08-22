import { describe, expect, it } from "vitest";

import { validatePefEventV1, validateTriggerEvaluationV1 } from "./validator.ts";

function fixtureEvent() {
  return {
    schema_version: "pef-event.v1",
    event_id: "evt-temp-a-1435",
    event_type: "physical.observation.temperature",
    assertion_type: "physical_observation",
    assurance: "A0",
    occurred_at: "2026-08-22T12:00:00Z",
    recorded_at: "2026-08-22T12:00:01Z",
    producer: { producer_id: "TEMP-A", producer_type: "sensor" },
    payload: { celsius: 9.1 },
  };
}

describe("VSR-PEF-ALPHA-0.1 contract grammar", () => {
  it("accepts a valid object", () => {
    expect(validatePefEventV1(fixtureEvent()).valid).toBe(true);
  });

  it("rejects a missing required field", () => {
    const event = fixtureEvent();
    const { event_id: _eventId, ...withoutEventId } = event;
    expect(validatePefEventV1(withoutEventId).valid).toBe(false);
  });

  it("rejects an unknown assertion type", () => {
    expect(validatePefEventV1({ ...fixtureEvent(), assertion_type: "producer_opinion" }).valid).toBe(false);
  });

  it("rejects an invalid assurance", () => {
    expect(validatePefEventV1({ ...fixtureEvent(), assurance: "A9" }).valid).toBe(false);
  });

  it("rejects an invalid timestamp", () => {
    expect(validatePefEventV1({ ...fixtureEvent(), occurred_at: "yesterday" }).valid).toBe(false);
  });

  it("rejects an invalid consequence state", () => {
    expect(validateTriggerEvaluationV1({
      schema_version: "trigger-evaluation.v1",
      trigger_evaluation_id: "TRIG-001",
      evidence_bundle_ref: "EVB:001:v1",
      inference_ref: "INF-001",
      consequence_state: "D9",
      result: "ELIGIBLE",
      reason_codes: [],
      evaluated_at: "2026-08-22T12:10:00Z",
    }).valid).toBe(false);
  });
});
