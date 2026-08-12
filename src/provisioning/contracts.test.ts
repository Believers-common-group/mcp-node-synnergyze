import { describe, expect, it } from "vitest";
import {
  gateDeclareRequestSchema,
  packageInstallRequestSchema,
  programProvisionRequestSchema,
  temporalConditionSchema,
} from "./contracts.ts";

const actor = {
  digitalmeId: "DM-TEST-001",
  actingCapacity: "NODE_OPERATOR",
};

const baseEnvelope = {
  commandId: "11111111-1111-4111-8111-111111111111",
  subjectRef: "SUBJECT-001",
  actor,
  correlationId: "22222222-2222-4222-8222-222222222222",
  idempotencyKey: "idem-test-001",
  evidenceRefs: [],
};

describe("Registry provisioning contracts", () => {
  it("accepts a Program provisioning request", () => {
    const parsed = programProvisionRequestSchema.parse({
      envelope: { ...baseEnvelope, commandType: "PROGRAM_PROVISION" },
      templateRef: "CLDR-RELEASE-001@1.0.0",
      editionCode: "CLDR-50",
      externalConstraintRefs: [],
      overrides: {},
    });

    expect(parsed.envelope.commandType).toBe("PROGRAM_PROVISION");
    expect(parsed.editionCode).toBe("CLDR-50");
  });

  it("requires evidence when declaring a Gate", () => {
    expect(() =>
      gateDeclareRequestSchema.parse({
        envelope: { ...baseEnvelope, commandType: "GATE_DECLARE" },
        gateEventRef: "CLDR-49-DATA-SLUSH",
      }),
    ).toThrow();
  });

  it("keeps package installation as a request rather than an implicit enable", () => {
    const parsed = packageInstallRequestSchema.parse({
      envelope: { ...baseEnvelope, commandType: "PACKAGE_INSTALL_REQUEST" },
      packageRef: "QR-DESIGN-001@2.1.0",
      nodeRef: "BNR-IN-KA-BLR-0001",
    });

    expect(parsed.envelope.commandType).toBe("PACKAGE_INSTALL_REQUEST");
  });

  it("accepts Sentinel temporal facts without a Registry state mutation", () => {
    const parsed = temporalConditionSchema.parse({
      conditionId: "33333333-3333-4333-8333-333333333333",
      conditionType: "DEADLINE_DUE",
      subjectRef: "CLDR-49-ALPHA-1",
      observedAt: "2026-08-19T00:00:00Z",
      source: "SENTINEL_CLOCK",
    });

    expect(parsed.source).toBe("SENTINEL_CLOCK");
  });
});
