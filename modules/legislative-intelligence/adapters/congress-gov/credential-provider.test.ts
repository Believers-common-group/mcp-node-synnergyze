import { describe, expect, it, vi } from "vitest";

import {
  StaticCongressGovCredentialProviderV1,
  WindowsDpapiCongressGovCredentialProviderV1,
} from "./credential-provider.ts";

const secret = "SENTINEL_CONGRESS_SECRET_12345";
const fingerprintPrefix = "308734f19cb4077c";
const validReceipt = {
  request_id: "CONGRESS-GOV-API-KEY-001",
  http_status: 200,
  sha256_fingerprint_prefix: fingerprintPrefix,
  receipt_sha256: "a".repeat(64),
};

describe("Congress.gov V1 credential providers", () => {
  it("keeps static test credentials out of provider serialization", async () => {
    const provider = new StaticCongressGovCredentialProviderV1(secret, fingerprintPrefix);
    const credential = await provider.getCredential();

    expect(credential.apiKey).toBe(secret);
    expect(credential.credentialAdmissionRef).toBe("CONGRESS-GOV-API-KEY-001");
    expect(credential.credentialFingerprintPrefix).toBe(fingerprintPrefix);
    expect(JSON.stringify(provider)).not.toContain(secret);
  });

  it("validates admission receipt before decrypting and binds the fingerprint", async () => {
    const observedPaths: string[] = [];
    const provider = new WindowsDpapiCongressGovCredentialProviderV1({
      platform: "win32",
      secretPath: "C:\\Users\\alpha\\.alpha\\credentials\\congress-gov\\api-key.dpapi",
      receiptPath: "C:\\Users\\alpha\\.alpha\\credentials\\congress-gov\\admission-receipt.json",
      readReceipt: async (path) => {
        observedPaths.push(`receipt:${path}`);
        return validReceipt;
      },
      decrypt: async (path) => {
        observedPaths.push(`secret:${path}`);
        return secret;
      },
    });

    const credential = await provider.getCredential();
    expect(credential.apiKey).toBe(secret);
    expect(credential.credentialFingerprintPrefix).toBe(fingerprintPrefix);
    expect(observedPaths[0]).toMatch(/^receipt:/);
    expect(observedPaths[1]).toMatch(/^secret:/);
    expect(JSON.stringify(provider)).not.toContain(secret);
  });

  it("fails closed on an invalid admission receipt without attempting decryption", async () => {
    const decrypt = vi.fn(async () => secret);
    const provider = new WindowsDpapiCongressGovCredentialProviderV1({
      platform: "win32",
      decrypt,
      readReceipt: async () => ({ ...validReceipt, request_id: "WRONG-REQUEST" }),
    });

    await expect(provider.getCredential()).rejects.toThrow("CREDENTIAL_ADMISSION_RECEIPT_INVALID");
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("fails closed when decrypted secret does not match the admitted fingerprint", async () => {
    const provider = new WindowsDpapiCongressGovCredentialProviderV1({
      platform: "win32",
      decrypt: async () => "different-secret",
      readReceipt: async () => validReceipt,
    });

    await expect(provider.getCredential()).rejects.toThrow("CREDENTIAL_FINGERPRINT_MISMATCH");
  });

  it("permits the Windows PowerShell boundary from WSL", async () => {
    const provider = new WindowsDpapiCongressGovCredentialProviderV1({
      platform: "linux",
      wslInterop: "/run/WSL/1_interop",
      decrypt: async () => secret,
      readReceipt: async () => validReceipt,
    });

    await expect(provider.getCredential()).resolves.toMatchObject({
      credentialAdmissionRef: "CONGRESS-GOV-API-KEY-001",
      credentialFingerprintPrefix: fingerprintPrefix,
    });
  });

  it("refuses DPAPI use on unsupported non-Windows hosts", async () => {
    const provider = new WindowsDpapiCongressGovCredentialProviderV1({ platform: "linux", wslInterop: "" });
    await expect(provider.getCredential()).rejects.toThrow("CREDENTIAL_PLATFORM_UNSUPPORTED");
  });
});
