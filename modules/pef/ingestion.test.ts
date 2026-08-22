import { describe, expect, it } from "vitest";

import { validateProducerEvent } from "./ingestion.ts";

function fixtureObservation(assurance = "A0") {
  return {
    schema_version: "pef-event.v1",
    event_id: "evt-temp-a-1435",
    event_type: "physical.observation.temperature",
    assertion_type: "physical_observation",
    assurance,
    occurred_at: "2026-08-22T12:00:00Z",
    recorded_at: "2026-08-22T12:00:01Z",
    producer: { producer_id: "TEMP-A", producer_type: "sensor" },
    payload: { celsius: 9.1 },
  };
}

describe("producer trust boundary", () => {
  it("rejects producer self-promotion to A3", () => {
    expect(() => validateProducerEvent(fixtureObservation("A3"))).toThrow("PRODUCER_ASSURANCE_FORBIDDEN");
  });
});
