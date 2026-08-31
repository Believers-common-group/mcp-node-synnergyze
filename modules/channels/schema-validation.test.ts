import { readFileSync } from "node:fs";
import { Ajv2020 as Ajv } from "ajv/dist/2020.js";
import { describe, expect, it } from "vitest";

function load(name: string): object {
  return JSON.parse(readFileSync(new URL(`./schemas/${name}`, import.meta.url), "utf8")) as object;
}

const ajv = new Ajv({ allErrors: true, strict: false });

describe("Channel Fabric schemas", () => {
  it("accepts a valid Header Board and rejects authority-field injection", () => {
    const validate = ajv.compile(load("header-board-v1.schema.json"));
    const board = {
      headerBoardRef: "HEADER:001",
      channelRef: "VSR-CHANNEL:PUBLIC",
      publicationType: "STATUS",
      subjectRef: "STYLE:VJ-428",
      sourceEventRefs: ["EVENT:INVENTORY:428"],
      publisherPrincipalRef: "DIGITALME:VOI:OPS",
      publisherCapacityRef: "CAPACITY:VOI:OPS",
      audiencePolicyRef: "POLICY:PUBLIC",
      classification: "PUBLIC",
      effectiveFrom: "2026-09-01T00:00:00Z",
      status: "PREPARED",
      actionCapabilities: ["SUBSCRIBE"],
      payload: { headline: "VJ-428 available" },
      fieldClassifications: { headline: "PUBLIC" },
      correlationId: "CORR:001",
    };
    expect(validate(board)).toBe(true);
    expect(validate({ ...board, actionToken: "FORBIDDEN" })).toBe(false);
  });

  it("rejects Warden fields in a service descriptor", () => {
    const validate = ajv.compile(load("service-descriptor-v1.schema.json"));
    const descriptor = {
      serviceRef: "SERVICE:001",
      handle: "@vsr.route.001",
      transport: "IN_MEMORY",
      endpoint: "memory://route/001",
      capabilityRefs: ["VSR-CAPABILITY-HEADER-BOARD-PUBLISH"],
      publicKeyFingerprint: `sha256:${"a".repeat(64)}`,
      signerRef: "GENESIS-SERVICE-REGISTRY",
      validFrom: "2026-09-01T00:00:00Z",
      validUntil: "2026-09-02T00:00:00Z",
      version: 1,
      signature: "base64-signature",
    };
    expect(validate(descriptor)).toBe(true);
    expect(validate({ ...descriptor, wardenDecisionRef: "WARDEN:ALLOW" })).toBe(false);
  });
});
