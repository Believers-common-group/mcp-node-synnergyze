import { describe, expect, it } from "vitest";

import { ModernJourneyEventLogV1 } from "./modern-journey-event-log.ts";
import { rebuildModernCapabilityLegSnapshotV1 } from "./modern-capability-leg-rehydration.ts";

const LEG_REF = "MODERN-CAPABILITY-LEG:COMPUTE-REHYDRATE-001";
const JOURNEY_REF = "MODERN-JOURNEY:MJ-REHYDRATE-001";
const ACTOR_REF = "DIGITALME-CONFLUENCE-001";

function closedComputeStream() {
  const log = new ModernJourneyEventLogV1();
  const append = (
    index: number,
    eventType: Parameters<ModernJourneyEventLogV1["append"]>[0]["eventType"],
    payload: Record<string, unknown>,
  ) =>
    log.append({
      idempotencyKey: `${LEG_REF}:${index}:${eventType}`,
      transactionRef: LEG_REF,
      journeyRef: JOURNEY_REF,
      actorRef: ACTOR_REF,
      eventType,
      occurredAt: `2026-08-24T01:00:${String(index).padStart(2, "0")}.000Z`,
      payload,
    });

  append(1, "TRANSACTION_OPENED", {
    kind: "CAPABILITY_LEG",
    capabilityType: "COMPUTE",
    resourceType: "COMPUTE",
    silkAccountRef: "SILK-ENT-042",
    economicOwnerRef: "ENTERPRISE-CONFLUENCE-001",
    quantity: 2,
    unit: "GPU_HOUR",
  });
  append(2, "RESOURCE_RESERVED", {
    resourceRef: "COMPUTE:PRIVATE-GPU-001",
  });
  append(3, "PROVIDER_EXECUTION_FAILED", {
    attemptRef: "ATTEMPT:PRIVATE",
    providerRef: "PRIVATE-CLOUD-A",
    capabilityRef: "compute.private.allocate",
    failureClass: "RESOURCE_UNAVAILABLE",
    recoverable: true,
  });
  append(4, "RESOURCE_RELEASED", {
    resourceRef: "COMPUTE:PRIVATE-GPU-001",
  });
  append(5, "FALLBACK_AUTHORIZED", {
    providerRef: "PUBLIC-CLOUD-B",
    capabilityRef: "compute.public.allocate",
    wardenDecisionRef: "WARDEN-DECISION:COMPUTE-FALLBACK",
  });
  append(6, "FALLBACK_RESOURCE_RESERVED", {
    resourceRef: "COMPUTE:PUBLIC-GPU-001",
  });
  append(7, "PROVIDER_EXECUTED_UNVERIFIED", {
    attemptRef: "ATTEMPT:PUBLIC",
    providerRef: "PUBLIC-CLOUD-B",
    capabilityRef: "compute.public.allocate",
    executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:PUBLIC-GPU",
  });
  append(8, "RESOURCE_CONSUMED", {
    consumptionRef: "SILK-CAPABILITY-CONSUMPTION:GPU-001",
    resourceRef: "COMPUTE:PUBLIC-GPU-001",
    resourceOwnerRef: "ENTERPRISE-CONFLUENCE-001",
    economicOwnerRef: "ENTERPRISE-CONFLUENCE-001",
    quantity: 2,
    unit: "GPU_HOUR",
    monetaryValue: 240,
    currency: "INR",
  });
  append(9, "EFFECT_VERIFIED", {
    effectRef: "VERIFIED-EFFECT:GPU-READY",
    executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:PUBLIC-GPU",
  });
  append(10, "TRANSACTION_CLOSED", { kind: "CAPABILITY_LEG", state: "CLOSED" });
  return log.stream(LEG_REF);
}

describe("MODERN-CAPABILITY-LEG-REHYDRATION-001", () => {
  it("rebuilds a closed compute leg with attempts, native usage, valuation, and verified effect", () => {
    const rebuilt = rebuildModernCapabilityLegSnapshotV1(closedComputeStream());

    expect(rebuilt.leg).toMatchObject({
      legRef: LEG_REF,
      journeyRef: JOURNEY_REF,
      silkAccountRef: "SILK-ENT-042",
      economicOwnerRef: "ENTERPRISE-CONFLUENCE-001",
      capabilityType: "COMPUTE",
      resourceType: "COMPUTE",
      quantity: 2,
      unit: "GPU_HOUR",
      state: "CLOSED",
      successfulExecutionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:PUBLIC-GPU",
      verifiedEffectRef: "VERIFIED-EFFECT:GPU-READY",
    });
    expect(rebuilt.leg.attempts).toEqual([
      {
        attemptRef: "ATTEMPT:PRIVATE",
        providerRef: "PRIVATE-CLOUD-A",
        capabilityRef: "compute.private.allocate",
        status: "FAILED",
        recoverable: true,
        failureClass: "RESOURCE_UNAVAILABLE",
      },
      {
        attemptRef: "ATTEMPT:PUBLIC",
        providerRef: "PUBLIC-CLOUD-B",
        capabilityRef: "compute.public.allocate",
        status: "EXECUTED_UNVERIFIED",
        executionReceiptRef: "SYNNERGYZE-EXECUTION-RECEIPT:PUBLIC-GPU",
      },
    ]);
    expect(rebuilt.leg.consumption).toMatchObject({
      providerRef: "PUBLIC-CLOUD-B",
      capabilityRef: "compute.public.allocate",
      resourceRef: "COMPUTE:PUBLIC-GPU-001",
      resourceOwnerRef: "ENTERPRISE-CONFLUENCE-001",
      quantity: 2,
      unit: "GPU_HOUR",
      monetaryValue: 240,
      currency: "INR",
    });
  });

  it("preserves EFFECT_VERIFIED when the durable stream stops before the close event", () => {
    const events = closedComputeStream().slice(0, -1);
    const rebuilt = rebuildModernCapabilityLegSnapshotV1(events);

    expect(rebuilt.projection.state).toBe("EFFECT_VERIFIED");
    expect(rebuilt.leg.state).toBe("EFFECT_VERIFIED");
    expect(rebuilt.leg.verifiedEffectRef).toBe("VERIFIED-EFFECT:GPU-READY");
  });

  it("fails closed when native consumption drifts from the opened leg quantity", () => {
    const events = closedComputeStream().map((event) => ({
      ...event,
      payload: { ...event.payload },
    }));
    const consumption = events.find((event) => event.eventType === "RESOURCE_CONSUMED");
    if (!consumption) throw new Error("expected_consumption_event");
    consumption.payload = { ...consumption.payload, quantity: 3 };

    expect(() => rebuildModernCapabilityLegSnapshotV1(events)).toThrow(
      "modern_event_record_payload_digest_mismatch",
    );
  });
});