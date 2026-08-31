import { createHash, createPublicKey, sign, verify } from "node:crypto";
import type { ServiceDescriptorV1 } from "./contracts.ts";

type UnsignedInputV1 = Omit<ServiceDescriptorV1, "signature" | "publicKeyFingerprint">;
type UnsignedBoundV1 = Omit<ServiceDescriptorV1, "signature">;

function publicKeyFingerprint(publicKeyPem: string): string {
  const publicKey = createPublicKey(publicKeyPem);
  const der = publicKey.export({ type: "spki", format: "der" });
  return `sha256:${createHash("sha256").update(der).digest("hex")}`;
}

function publicKeyPemFromPrivate(privateKeyPem: string): string {
  return createPublicKey(privateKeyPem).export({ type: "spki", format: "pem" }).toString();
}

function canonicalBytes(descriptor: UnsignedBoundV1): Buffer {
  return Buffer.from(
    JSON.stringify({
      serviceRef: descriptor.serviceRef,
      handle: descriptor.handle,
      transport: descriptor.transport,
      endpoint: descriptor.endpoint,
      capabilityRefs: [...descriptor.capabilityRefs].sort(),
      publicKeyFingerprint: descriptor.publicKeyFingerprint,
      signerRef: descriptor.signerRef,
      validFrom: descriptor.validFrom,
      validUntil: descriptor.validUntil,
      version: descriptor.version,
    }),
    "utf8",
  );
}

export function signServiceDescriptorV1(
  descriptor: UnsignedInputV1,
  privateKeyPem: string,
): ServiceDescriptorV1 {
  const publicKeyPem = publicKeyPemFromPrivate(privateKeyPem);
  const bound: UnsignedBoundV1 = {
    ...descriptor,
    capabilityRefs: [...descriptor.capabilityRefs],
    publicKeyFingerprint: publicKeyFingerprint(publicKeyPem),
  };
  const signature = sign(null, canonicalBytes(bound), privateKeyPem).toString("base64");
  return { ...bound, signature };
}

export function verifyServiceDescriptorV1(
  descriptor: ServiceDescriptorV1,
  publicKeyPem: string,
  now: string,
): boolean {
  const nowMs = Date.parse(now);
  const fromMs = Date.parse(descriptor.validFrom);
  const untilMs = Date.parse(descriptor.validUntil);
  if (!Number.isFinite(nowMs) || !Number.isFinite(fromMs) || !Number.isFinite(untilMs)) return false;
  if (nowMs < fromMs || nowMs > untilMs) return false;
  if (descriptor.publicKeyFingerprint !== publicKeyFingerprint(publicKeyPem)) return false;
  const { signature, ...unsigned } = descriptor;
  return verify(null, canonicalBytes(unsigned), publicKeyPem, Buffer.from(signature, "base64"));
}
