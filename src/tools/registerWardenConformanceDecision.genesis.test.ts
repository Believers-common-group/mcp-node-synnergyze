import { describe, expect, it } from "vitest";

import { parseWardenConformanceDecisionInput } from "./registerWardenConformanceDecision.ts";

describe("Warden conformance Genesis dependency transport", () => {
  it("preserves the canonical Genesis device dependency through strict request parsing", () => {
    const genesisDevice = {
      resolutionRef: "GENESIS-DEVICE-RESOLUTION:mcp-runtime-001",
      deviceRef: "GENESIS-DEVICE-ALPHA-LG-001",
      estateRef: "GENESIS-ESTATE-001",
      attestationRef: "GENESIS-DEVICE-ATTESTATION-MCP-RUNTIME-001",
      assuranceLevel: "L3" as const,
      evidenceRefs: ["RIVER-DEVICE-EVIDENCE-MCP-RUNTIME-001"],
      resolvedAt: "2026-09-12T05:00:00.000Z",
      validUntil: "2026-09-12T06:00:00.000Z",
    };

    const parsed = parseWardenConformanceDecisionInput({
      request: {
        requestRef: "WARDEN-REQUEST:MCP-RUNTIME-001",
        actorRef: "DIGITALME-ALPHA-TEST-001",
        representedPrincipalRef: "LAB-COMPANY-001",
        actingCapacityRef: "CAPACITY:LAB-OPERATOR-001",
        contextRef: "ALPHA-NODE-001",
        programRef: "SYNNERGYZE-PROGRAM:001",
        eventRef: "SYNNERGYZE-EVENT:MCP-RUNTIME-001",
        action: "service_request.create",
        capabilityRef: "service_request.create",
        targetRef: "SERVICE-REQUEST-TARGET:001",
        executionDeviceRef: genesisDevice.deviceRef,
        genesisDevice,
        deviceSecurityState: "ACTIVE",
        deviceSecurityPolicyRef: "DEVICE-SECURITY-POLICY-001",
        deviceSecuritySourceRefs: [
          "DEVICE-SECURITY-RESOLUTION-001",
          "DEVICE-SECURITY-EVIDENCE-001",
        ],
        deviceSecurityResolvedAt: "2026-09-12T05:00:00.000Z",
        deviceSecurityValidUntil: "2026-09-12T06:00:00.000Z",
        authorityRefs: ["AUTHORITY:LAB-OPERATOR-001"],
        policyRefs: ["POLICY:ALPHA-SYNTHETIC-001"],
        representationSourceRefs: ["GENESIS-REPRESENTATION-001"],
        requestedAt: "2026-09-12T05:10:00.000Z",
        correlationId: "CORR:MCP-RUNTIME-001",
      },
    });

    expect(parsed.request.genesisDevice).toEqual(genesisDevice);
  });
});
