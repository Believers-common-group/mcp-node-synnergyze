import { describe, expect, it } from "vitest";

import type {
  EstateActionClassV1,
  EstateCapabilityV1,
  EstateConsoleDeviceV1,
  EstateConsoleProfileV1,
  EstateConsoleSessionV1,
} from "./contracts.ts";

const device: EstateConsoleDeviceV1 = {
  deviceRef: "GENESIS-DEVICE:IPAD-001",
  consoleRef: "TEXTASTIC-IPAD-001",
  estateRef: "GENESIS-ESTATE-001",
  nodeRef: "ALPHA-NODE-001",
  deviceClass: "TABLET",
  platform: "IPADOS",
  state: "ACTIVE",
  sourceRefs: ["REGISTRY:DEVICE:IPAD-001"],
};

const profile: EstateConsoleProfileV1 = {
  profileRef: "ESTATE-CONSOLE-PROFILE:ENGINEERING-STAGING-V0.1",
  environment: "STAGING",
  capabilities: ["DISCOVER", "OBSERVE", "INSPECT", "SUBMIT"],
  sourceRefs: ["POLICY:ESTATE-CONSOLE:G0"],
};

const session: EstateConsoleSessionV1 = {
  sessionRef: "ESTATE-CONSOLE-SESSION:TEST-001",
  principalRef: "DIGITALME:TEST-001",
  deviceRef: device.deviceRef,
  consoleRef: device.consoleRef,
  estateRef: device.estateRef,
  nodeRef: device.nodeRef,
  profileRef: profile.profileRef,
  environment: profile.environment,
  capabilities: profile.capabilities,
  state: "ACTIVE",
  admittedAt: "2026-09-14T00:00:00Z",
  validUntil: "2026-09-14T01:00:00Z",
  sourceRefs: ["REGISTRY:SESSION:TEST-001"],
  correlationId: "CORR:ESTATE-CONSOLE:TEST-001",
};

// @ts-expect-error v0.1 cannot grant CHANGE.
const invalidCapability: EstateCapabilityV1 = "CHANGE";
void invalidCapability;

// @ts-expect-error v0.1 cannot represent Type C EFFECT as an action class.
const invalidActionClass: EstateActionClassV1 = "EFFECT";
void invalidActionClass;

describe("Estate Console v0.1 contracts", () => {
  it("binds the engineering staging profile to L0-L3 capabilities only", () => {
    expect(profile.capabilities).toEqual(["DISCOVER", "OBSERVE", "INSPECT", "SUBMIT"]);
    expect(profile.environment).toBe("STAGING");
  });

  it("binds a session to the exact DigitalMe, Genesis device, and console tuple", () => {
    expect(session.principalRef).toBe("DIGITALME:TEST-001");
    expect(session.deviceRef).toBe("GENESIS-DEVICE:IPAD-001");
    expect(session.consoleRef).toBe("TEXTASTIC-IPAD-001");
    expect(session.nodeRef).toBe("ALPHA-NODE-001");
  });
});
