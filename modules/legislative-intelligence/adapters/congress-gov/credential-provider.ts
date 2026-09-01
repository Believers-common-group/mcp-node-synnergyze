import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir, platform as hostPlatform } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CREDENTIAL_ADMISSION_REF = "CONGRESS-GOV-API-KEY-001" as const;

export interface CongressGovCredentialProvider {
  getApiKey(): Promise<string>;
  getAdmissionReceiptRef(): Promise<string>;
}

export class StaticTestCredentialProvider implements CongressGovCredentialProvider {
  #key: string;
  #receiptRef: string;

  constructor(key: string, receiptRef = "CREDENTIAL-RECEIPT:TEST") {
    this.#key = key;
    this.#receiptRef = receiptRef;
  }

  async getApiKey(): Promise<string> {
    return this.#key;
  }

  async getAdmissionReceiptRef(): Promise<string> {
    return this.#receiptRef;
  }
}

export interface CongressGovCredentialMaterialV1 {
  apiKey: string;
  credentialAdmissionRef: typeof CREDENTIAL_ADMISSION_REF;
  credentialFingerprintPrefix?: string;
}

export interface CongressGovCredentialProviderV1 {
  getCredential(): Promise<CongressGovCredentialMaterialV1>;
}

export class StaticCongressGovCredentialProviderV1
  implements CongressGovCredentialProviderV1, CongressGovCredentialProvider
{
  #apiKey: string;
  #fingerprintPrefix?: string;

  constructor(apiKey: string, fingerprintPrefix?: string) {
    this.#apiKey = apiKey;
    this.#fingerprintPrefix = fingerprintPrefix;
  }

  async getCredential(): Promise<CongressGovCredentialMaterialV1> {
    return {
      apiKey: this.#apiKey,
      credentialAdmissionRef: CREDENTIAL_ADMISSION_REF,
      credentialFingerprintPrefix: this.#fingerprintPrefix,
    };
  }

  async getApiKey(): Promise<string> {
    return this.#apiKey;
  }

  async getAdmissionReceiptRef(): Promise<string> {
    return CREDENTIAL_ADMISSION_REF;
  }
}

export interface CongressAdmissionReceiptV1 {
  sha256_fingerprint_prefix?: string;
}

export interface WindowsDpapiProviderOptionsV1 {
  platform?: NodeJS.Platform;
  secretPath?: string;
  receiptPath?: string;
  decrypt?: (path: string) => Promise<string>;
  readReceipt?: (path: string) => Promise<CongressAdmissionReceiptV1>;
}

async function defaultDpapiDecrypt(path: string): Promise<string> {
  const command = [
    "$secure = Get-Content -Raw -LiteralPath $args[0] | ConvertTo-SecureString;",
    "$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);",
    "try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }",
    "finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }",
  ].join(" ");

  try {
    const result = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command, path],
      { windowsHide: true, maxBuffer: 1024 * 1024 },
    );
    const plaintext = result.stdout.trim();
    if (!plaintext) throw new Error("empty");
    return plaintext;
  } catch {
    throw new Error("congress_dpapi_decrypt_failed");
  }
}

async function defaultReceiptReader(path: string): Promise<CongressAdmissionReceiptV1> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    return {
      sha256_fingerprint_prefix:
        typeof parsed.sha256_fingerprint_prefix === "string"
          ? parsed.sha256_fingerprint_prefix
          : undefined,
    };
  } catch {
    throw new Error("congress_admission_receipt_read_failed");
  }
}

export class WindowsDpapiCongressGovCredentialProviderV1
  implements CongressGovCredentialProviderV1, CongressGovCredentialProvider
{
  #platform: NodeJS.Platform;
  #secretPath: string;
  #receiptPath: string;
  #decrypt: (path: string) => Promise<string>;
  #readReceipt: (path: string) => Promise<CongressAdmissionReceiptV1>;

  constructor(options: WindowsDpapiProviderOptionsV1 = {}) {
    this.#platform = options.platform ?? hostPlatform();
    this.#secretPath =
      options.secretPath ?? join(homedir(), ".alpha", "credentials", "congress-gov", "api-key.dpapi");
    this.#receiptPath =
      options.receiptPath ??
      join(homedir(), ".alpha", "credentials", "congress-gov", "admission-receipt.json");
    this.#decrypt = options.decrypt ?? defaultDpapiDecrypt;
    this.#readReceipt = options.readReceipt ?? defaultReceiptReader;
  }

  async getCredential(): Promise<CongressGovCredentialMaterialV1> {
    if (this.#platform !== "win32") throw new Error("congress_dpapi_windows_only");

    const apiKey = await this.#decrypt(this.#secretPath);
    const receipt = await this.#readReceipt(this.#receiptPath);
    return {
      apiKey,
      credentialAdmissionRef: CREDENTIAL_ADMISSION_REF,
      credentialFingerprintPrefix: receipt.sha256_fingerprint_prefix,
    };
  }

  async getApiKey(): Promise<string> {
    return (await this.getCredential()).apiKey;
  }

  async getAdmissionReceiptRef(): Promise<string> {
    return CREDENTIAL_ADMISSION_REF;
  }
}
