import { describe, expect, it, vi } from "vitest";

import {
  resolveWindowsPowerShellExecutableV1,
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

  it("permits WSL PowerShell when the service omits WSL_INTEROP", async () => {
    const provider = new WindowsDpapiCongressGovCredentialProviderV1({
      platform: "linux",
      wslInterop: "",
      kernelRelease: "6.18.33.2-microsoft-standard-WSL2",
      decrypt: async () => secret,
      readReceipt: async () => validReceipt,
    });

    await expect(provider.getCredential()).resolves.toMatchObject({
      credentialAdmissionRef: "CONGRESS-GOV-API-KEY-001",
      credentialFingerprintPrefix: fingerprintPrefix,
    });
  });

  it("falls back to the existing SentinelX LocalAppData admission store", async () => {
    const observedPaths: string[] = [];
    const legacyReceipt = {
      request_id: "CONGRESS-GOV-API-KEY-001",
      credential: { sha256_fingerprint_prefix: fingerprintPrefix },
      admission: { http_status: 200 },
      evidence: { receipt_sha256: "b".repeat(64) },
    };
    const provider = new WindowsDpapiCongressGovCredentialProviderV1({
      platform: "win32",
      readReceipt: async (path) => {
        observedPaths.push(`receipt:${path}`);
        if (path.startsWith("$HOME\\")) throw new Error("CREDENTIAL_FILE_MISSING");
        return legacyReceipt;
      },
      decrypt: async (path) => {
        observedPaths.push(`secret:${path}`);
        return secret;
      },
    });

    await expect(provider.getCredential()).resolves.toMatchObject({
      credentialAdmissionRef: "CONGRESS-GOV-API-KEY-001",
      credentialFingerprintPrefix: fingerprintPrefix,
    });
    expect(observedPaths).toEqual([
      "receipt:$HOME\\.alpha\\credentials\\congress-gov\\admission-receipt.json",
      "receipt:$LOCALAPPDATA\\SentinelX\\credential-intake\\congress-gov\\admission-receipt.json",
      "secret:$LOCALAPPDATA\\SentinelX\\credential-intake\\congress-gov\\api-key.dpapi",
    ]);
  });

  it("resolves WSL PowerShell from PATH before assuming the default mount", () => {
    const customPowerShell = "/windows/System32/WindowsPowerShell/v1.0/powershell.exe";
    const exists = (path: string) => path === customPowerShell;

    expect(
      resolveWindowsPowerShellExecutableV1(
        "linux",
        "/run/WSL/1_interop",
        "6.18.33.2-microsoft-standard-WSL2",
        "/usr/bin:/windows/System32/WindowsPowerShell/v1.0",
        exists,
      ),
    ).toBe(customPowerShell);
  });

  it("uses the verified default WSL PowerShell path as a fallback", () => {
    const defaultPowerShell = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
    const exists = (path: string) => path === defaultPowerShell;

    expect(
      resolveWindowsPowerShellExecutableV1(
        "linux",
        "",
        "6.18.33.2-microsoft-standard-WSL2",
        "/usr/bin:/bin",
        exists,
      ),
    ).toBe(defaultPowerShell);
  });

  it("falls back to the PATH-resolved PowerShell command when no known path exists", () => {
    expect(
      resolveWindowsPowerShellExecutableV1(
        "linux",
        "/run/WSL/1_interop",
        "6.18.33.2-microsoft-standard-WSL2",
        "/usr/bin:/bin",
        () => false,
      ),
    ).toBe("powershell.exe");
    expect(resolveWindowsPowerShellExecutableV1("win32", "")).toBe("powershell.exe");
  });

  it("refuses DPAPI use on unsupported non-Windows hosts", async () => {
    const provider = new WindowsDpapiCongressGovCredentialProviderV1({
      platform: "linux",
      wslInterop: "",
      kernelRelease: "6.8.0-generic",
    });
    await expect(provider.getCredential()).rejects.toThrow("CREDENTIAL_PLATFORM_UNSUPPORTED");
  });
});
