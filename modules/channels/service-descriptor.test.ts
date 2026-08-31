import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signServiceDescriptorV1, verifyServiceDescriptorV1 } from "./service-descriptor.ts";

const keys = generateKeyPairSync("ed25519");
const privateKeyPem = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicKeyPem = keys.publicKey.export({ type: "spki", format: "pem" }).toString();

const unsigned = {
  serviceRef: "SERVICE:ROUTE:001",
  handle: "@vsr.route.001",
  transport: "IN_MEMORY" as const,
  endpoint: "memory://route/001",
  capabilityRefs: ["VSR-CAPABILITY-HEADER-BOARD-PUBLISH"],
  signerRef: "GENESIS-SERVICE-REGISTRY",
  validFrom: "2026-09-01T00:00:00Z",
  validUntil: "2026-09-02T00:00:00Z",
  version: 1,
};

describe("service descriptor identity", () => {
  it("verifies a descriptor bound to the signing key", () => {
    const descriptor = signServiceDescriptorV1(unsigned, privateKeyPem);
    expect(descriptor.publicKeyFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(verifyServiceDescriptorV1(descriptor, publicKeyPem, "2026-09-01T12:00:00Z")).toBe(true);
    expect(descriptor).not.toHaveProperty("actionToken");
    expect(descriptor).not.toHaveProperty("wardenDecisionRef");
  });

  it("rejects tampering, a different key, and expiry", () => {
    const descriptor = signServiceDescriptorV1(unsigned, privateKeyPem);
    const other = generateKeyPairSync("ed25519");
    const otherPublic = other.publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(
      verifyServiceDescriptorV1(
        { ...descriptor, endpoint: "memory://tampered" },
        publicKeyPem,
        "2026-09-01T12:00:00Z",
      ),
    ).toBe(false);
    expect(verifyServiceDescriptorV1(descriptor, otherPublic, "2026-09-01T12:00:00Z")).toBe(false);
    expect(verifyServiceDescriptorV1(descriptor, publicKeyPem, "2026-09-03T00:00:00Z")).toBe(false);
  });
});
