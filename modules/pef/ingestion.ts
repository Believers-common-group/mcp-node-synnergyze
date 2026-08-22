import type { PefEventV1 } from "../../packages/contracts/event.ts";
import { validatePefEventV1 } from "../../packages/contracts/validator.ts";

export function assertProducerAssuranceBoundary(event: PefEventV1): void {
  if (event.assurance !== "A0") {
    throw new Error("PRODUCER_ASSURANCE_FORBIDDEN");
  }
}

export function validateProducerEvent(event: unknown): PefEventV1 {
  const result = validatePefEventV1(event);
  if (!result.valid) {
    throw new Error(`PEF_EVENT_SCHEMA_INVALID:${result.errors[0]?.instancePath ?? "unknown"}`);
  }
  const typed = event as PefEventV1;
  assertProducerAssuranceBoundary(typed);
  return typed;
}
