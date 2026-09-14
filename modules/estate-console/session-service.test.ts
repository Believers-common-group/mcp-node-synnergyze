import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { EstateConsoleAdmissionRequestV1 } from "./contracts.ts";
import {
  SyntheticEstateConsoleSessionServiceV1,
  type EstateConsoleAdmissionProjectionV1,
  type EstateConsoleAdmissionResolverV1,
} from "./session-service.ts";

const REQUESTED_AT = "2026-09-14T08:00:00.000Z";

function request(
  overrides: Partial<EstateConsoleAdmissionRequestV1> = {},
): EstateConsoleAdmissionRequestV1 {
  return {
    transportCredentialRef: "SSH-KEY-FINGERPRINT:TEST-IPAD-001",
    principalRef: "DIGITALME:TEST-001",
    deviceRef: "GENESIS-DEVICE:IPAD-TEST-001",
    consoleRef: "TEXTASTIC-IPAD-TEST-001",
    nodeRef: "ALPHA-NODE-001",
    requestedProfileRef: "ESTATE-CONSOLE-PROFILE:ENGINEERING-STAGING-V0.1",
    requestedAt: REQUESTED_AT,
    correlationId: "CORR:ESTATE-CONSOLE:ADMISSION-001",
    ...overrides,
  };
}

function projection(
  overrides: Partial<EstateConsoleAdmissionProjectionV1> = {},
): EstateConsoleAdmissionProjectionV1 {
  return {
    principalRef: "DIGITALME:TEST-001",
    deviceRef: "GENESIS-DEVICE:IPAD-TEST-001",
    consoleRef: "TEXTASTIC-IPAD-TEST-001",
    nodeRef: "ALPHA-NODE-001",
    estateRef: "GENESIS-ESTATE-001",
    deviceState: "ACTIVE",
    profileRef: "ESTATE-CONSOLE-PROFILE:ENGINEERING-STAGING-V0.1",
    capabilities: ["DISCOVER", "OBSERVE", "INSPECT", "SUBMIT"],
    sourceRefs: ["REGISTRY:DEVICE:IPAD-TEST-001", "DIGITALME:TEST-001"],
    validFrom: "2026-09-14T07:55:00.000Z",
    validUntil: "2026-09-14T09:00:00.000Z",
    ...overrides,
  };
}

function service(
  resolved: EstateConsoleAdmissionProjectionV1 | undefined,
): SyntheticEstateConsoleSessionServiceV1 {
  const resolver: EstateConsoleAdmissionResolverV1 = {
    resolve: () => resolved,
  };
  return new SyntheticEstateConsoleSessionServiceV1(resolver);
}

describe("Estate Console session admission", () => {
  it("requires enrollment when transport is admitted but the Genesis device is unknown", () => {
    const result = service(undefined).admit(request());

    expect(result).toEqual({
      state: "ENROLLMENT_REQUIRED",
      reasonCode: "DEVICE_NOT_REGISTERED",
      correlationId: "CORR:ESTATE-CONSOLE:ADMISSION-001",
    });
  });

  it("issues a staging session for an exact active DigitalMe/device/console projection", () => {
    const result = service(projection()).admit(request());

    expect(result.state).toBe("ISSUED");
    if (result.state !== "ISSUED") throw new Error("expected_issued_session");
    expect(result.session.sessionRef).toMatch(/^ESTATE-CONSOLE-SESSION:/);
    expect(result.session.principalRef).toBe("DIGITALME:TEST-001");
    expect(result.session.deviceRef).toBe("GENESIS-DEVICE:IPAD-TEST-001");
    expect(result.session.consoleRef).toBe("TEXTASTIC-IPAD-TEST-001");
    expect(result.session.nodeRef).toBe("ALPHA-NODE-001");
    expect(result.session.environment).toBe("STAGING");
    expect(result.session.capabilities).toEqual(["DISCOVER", "OBSERVE", "INSPECT", "SUBMIT"]);
  });

  it("treats an issued session as expired after its validity window", () => {
    const sessions = service(projection({ validUntil: "2026-09-14T08:05:00.000Z" }));
    const admitted = sessions.admit(request());
    if (admitted.state !== "ISSUED") throw new Error("expected_issued_session");

    expect(sessions.validateSession(admitted.session.sessionRef, "2026-09-14T08:06:00.000Z")).toEqual({
      active: false,
      reasonCode: "SESSION_EXPIRED",
    });
  });

  it("denies admission for a revoked Genesis device", () => {
    const result = service(projection({ deviceState: "REVOKED" })).admit(request());

    expect(result).toEqual({
      state: "DENIED",
      reasonCode: "DEVICE_REVOKED",
      correlationId: "CORR:ESTATE-CONSOLE:ADMISSION-001",
    });
  });

  it("denies reuse after explicit session revocation", () => {
    const sessions = service(projection());
    const admitted = sessions.admit(request());
    if (admitted.state !== "ISSUED") throw new Error("expected_issued_session");

    sessions.revokeSession(admitted.session.sessionRef, "2026-09-14T08:10:00.000Z");

    expect(sessions.validateSession(admitted.session.sessionRef, "2026-09-14T08:11:00.000Z")).toEqual({
      active: false,
      reasonCode: "SESSION_REVOKED",
    });
    expect(sessions.admit(request())).toEqual({
      state: "DENIED",
      reasonCode: "SESSION_REVOKED",
      correlationId: "CORR:ESTATE-CONSOLE:ADMISSION-001",
    });
  });

  it("fails closed when identity, device, console, node, or profile does not match", () => {
    const mismatches: EstateConsoleAdmissionProjectionV1[] = [
      projection({ principalRef: "DIGITALME:OTHER" }),
      projection({ deviceRef: "GENESIS-DEVICE:OTHER" }),
      projection({ consoleRef: "TEXTASTIC-IPAD-OTHER" }),
      projection({ nodeRef: "ALPHA-NODE-OTHER" }),
      projection({ profileRef: "ESTATE-CONSOLE-PROFILE:OTHER" }),
    ];

    for (const resolved of mismatches) {
      const result = service(resolved).admit(request());
      expect(result.state).toBe("DENIED");
      if (result.state === "ISSUED") throw new Error("unexpected_issued_session");
      expect(result.reasonCode).toBe("IDENTITY_CONTEXT_MISMATCH");
    }
  });

  it("keeps the Alpha example config synthetic and secret-free", () => {
    const raw = readFileSync(
      new URL("../../config/estate-console/ALPHA-NODE-001.example.json", import.meta.url),
      "utf8",
    );
    const config = JSON.parse(raw) as {
      principalRef: string;
      deviceRef: string;
      consoleRef: string;
      publicKeyFingerprint: string;
      capabilities: string[];
    };

    expect(config.principalRef).toBe("DIGITALME:TEST-IPAD-001");
    expect(config.deviceRef).toBe("GENESIS-DEVICE:IPAD-EXAMPLE-001");
    expect(config.consoleRef).toBe("TEXTASTIC-IPAD-EXAMPLE-001");
    expect(config.publicKeyFingerprint).toBe("SHA256:EXAMPLE-TEXTASTIC-IPAD-001");
    expect(config.capabilities).toEqual(["DISCOVER", "OBSERVE", "INSPECT", "SUBMIT"]);
    expect(raw).not.toMatch(/PRIVATE KEY|password|api[_-]?key|secret/i);
  });
});
