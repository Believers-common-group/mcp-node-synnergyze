import { describe, expect, it } from "vitest";

import {
  StaticCongressGovCredentialProviderV1,
  WindowsDpapiCongressGovCredentialProviderV1,
} from "./credential-provider.ts";

const secret = "SENTINEL_CONGRESS_SECRET_12345";

describe("Congress.gov V1 credential providers", () => {
  it("keeps static test credentials out of provider serialization", async () => {
    const provider = new StaticCongressGovCredentialProviderV1(secret, "0123456789abcdef");
    const credential = await provider.getCredential();

    expect(credential.apiKey).toBe(secret);
    expect(credential.credentialAdmissionRef).toBe("CONGRESS-GOV-API-KEY-001");
    expect(credential.credentialFingerprintPrefix).toBe("0123456789abcdef");
    expect(JSON.stringify(provider)).not.toContain(secret);
  });

  it("uses the DPAPI seam only on Windows and returns non-secret receipt metadata", async () => {
    const observedPaths: string[] = [];
    const provider = new WindowsDpapiCongressGovCredentialProviderV1({
      platform: "win32",
      secretPath: "C:\\Users\\alpha\\.alpha\\credentials\\congress-gov\\api-key.dpapi",
      receiptPath: "C:\\Users\\alpha\\.alpha\\credentials\\congress-gov\\admission-receipt.json",
      decrypt: async (path) => {
        observedPaths.push(path);
        return secret;
      },
      readReceipt: async (path) => {
        observedPaths.push(path);
        return { sha256_fingerprint_prefix: "fedcba9876543210" };
      },
    });

    const credential = await provider.getCredential();
    expect(credential.apiKey).toBe(secret);
    expect(credential.credentialFingerprintPrefix).toBe("fedcba9876543210");
    expect(observedPaths).toHaveLength(2);
    expect(JSON.stringify(provider)).not.toContain(secret);
  });

  it("refuses DPAPI use on non-Windows hosts", async () => {
    const provider = new WindowsDpapiCongressGovCredentialProviderV1({ platform: "linux" });
    await expect(provider.getCredential()).rejects.toThrow("congress_dpapi_windows_only");
  });
});
