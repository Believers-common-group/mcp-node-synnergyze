import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { platform as hostPlatform } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const CREDENTIAL_ADMISSION_REF = "CONGRESS-GOV-API-KEY-001" as const;
const DEFAULT_SECRET_PATH = "$HOME\\.alpha\\credentials\\congress-gov\\api-key.dpapi";
const DEFAULT_RECEIPT_PATH = "$HOME\\.alpha\\credentials\\congress-gov\\admission-receipt.json";

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
  request_id?: string;
  http_status?: number;
  sha256_fingerprint_prefix?: string;
  receipt_sha256?: string;
}

export interface WindowsDpapiProviderOptionsV1 {
  platform?: NodeJS.Platform;
  wslInterop?: string;
  secretPath?: string;
  receiptPath?: string;
  decrypt?: (path: string) => Promise<string>;
  readReceipt?: (path: string) => Promise<CongressAdmissionReceiptV1>;
}

function powershellPathResolver(): string {
  return [
    "$rawPath = $args[0];",
    "if ($rawPath.StartsWith('$HOME\\')) { $path = Join-Path $HOME $rawPath.Substring(6) } else { $path = $rawPath };",
  ].join(" ");
}

async function defaultDpapiDecrypt(path: string): Promise<string> {
  const command = [
    powershellPathResolver(),
    "if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { [Console]::Error.Write('CREDENTIAL_FILE_MISSING'); exit 3 };",
    "$bytes = [IO.File]::ReadAllBytes($path);",
    "if ($bytes.Length -eq 0) { [Console]::Error.Write('CREDENTIAL_FILE_EMPTY'); exit 4 };",
    "$plain = $null; $secure = $null; $ptr = [IntPtr]::Zero; $unprotected = $null;",
    "try {",
    "  $text = [Text.Encoding]::UTF8.GetString($bytes).Trim();",
    "  if ($text) {",
    "    try {",
    "      $secure = ConvertTo-SecureString $text;",
    "      $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);",
    "      $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr);",
    "    } catch { $plain = $null } finally { if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $ptr = [IntPtr]::Zero } };",
    "  };",
    "  if ([string]::IsNullOrWhiteSpace($plain)) {",
    "    try {",
    "      $unprotected = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser);",
    "      $plain = [Text.Encoding]::UTF8.GetString($unprotected).Trim();",
    "    } catch { $plain = $null };",
    "  };",
    "  if ([string]::IsNullOrWhiteSpace($plain)) { [Console]::Error.Write('CREDENTIAL_DECRYPT_FAILED'); exit 5 };",
    "  [Console]::Out.Write($plain);",
    "} finally {",
    "  if ($unprotected) { [Array]::Clear($unprotected, 0, $unprotected.Length) };",
    "  if ($bytes) { [Array]::Clear($bytes, 0, $bytes.Length) };",
    "  $plain = $null; $secure = $null;",
    "}",
  ].join(" ");

  try {
    const result = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command, path],
      { windowsHide: true, maxBuffer: 1024 * 1024 },
    );
    const plaintext = result.stdout.trim();
    if (!plaintext) throw new Error("CREDENTIAL_FILE_EMPTY");
    return plaintext;
  } catch (error) {
    const stderr =
      typeof error === "object" && error !== null && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr ?? "")
        : "";
    if (stderr.includes("CREDENTIAL_FILE_MISSING")) throw new Error("CREDENTIAL_FILE_MISSING");
    if (stderr.includes("CREDENTIAL_FILE_EMPTY")) throw new Error("CREDENTIAL_FILE_EMPTY");
    if (error instanceof Error && error.message === "CREDENTIAL_FILE_EMPTY") throw error;
    throw new Error("CREDENTIAL_DECRYPT_FAILED");
  }
}

async function defaultReceiptReader(path: string): Promise<CongressAdmissionReceiptV1> {
  const command = [
    powershellPathResolver(),
    "if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { [Console]::Error.Write('CREDENTIAL_FILE_MISSING'); exit 3 };",
    "$content = Get-Content -Raw -LiteralPath $path;",
    "if ([string]::IsNullOrWhiteSpace($content)) { [Console]::Error.Write('CREDENTIAL_ADMISSION_RECEIPT_INVALID'); exit 4 };",
    "[Console]::Out.Write($content);",
  ].join(" ");

  try {
    const result = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", command, path],
      { windowsHide: true, maxBuffer: 1024 * 1024 },
    );
    return JSON.parse(result.stdout) as CongressAdmissionReceiptV1;
  } catch (error) {
    const stderr =
      typeof error === "object" && error !== null && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr ?? "")
        : "";
    if (stderr.includes("CREDENTIAL_FILE_MISSING")) throw new Error("CREDENTIAL_FILE_MISSING");
    throw new Error("CREDENTIAL_ADMISSION_RECEIPT_INVALID");
  }
}

function validateAdmissionReceipt(receipt: CongressAdmissionReceiptV1): string {
  const fingerprint = receipt.sha256_fingerprint_prefix?.trim().toLowerCase();
  const valid =
    receipt.request_id === CREDENTIAL_ADMISSION_REF &&
    Number.isInteger(receipt.http_status) &&
    (receipt.http_status ?? 0) >= 200 &&
    (receipt.http_status ?? 0) <= 299 &&
    typeof fingerprint === "string" &&
    /^[a-f0-9]{8,64}$/.test(fingerprint) &&
    typeof receipt.receipt_sha256 === "string" &&
    /^[a-f0-9]{64}$/i.test(receipt.receipt_sha256);
  if (!valid || !fingerprint) throw new Error("CREDENTIAL_ADMISSION_RECEIPT_INVALID");
  return fingerprint;
}

function fingerprintMatches(secret: string, prefix: string): boolean {
  const digest = createHash("sha256").update(secret, "utf8").digest("hex");
  return digest.startsWith(prefix.toLowerCase());
}

export class WindowsDpapiCongressGovCredentialProviderV1
  implements CongressGovCredentialProviderV1, CongressGovCredentialProvider
{
  #platform: NodeJS.Platform;
  #wslInterop: string;
  #secretPath: string;
  #receiptPath: string;
  #decrypt: (path: string) => Promise<string>;
  #readReceipt: (path: string) => Promise<CongressAdmissionReceiptV1>;

  constructor(options: WindowsDpapiProviderOptionsV1 = {}) {
    this.#platform = options.platform ?? hostPlatform();
    this.#wslInterop = options.wslInterop ?? process.env.WSL_INTEROP ?? "";
    this.#secretPath = options.secretPath ?? DEFAULT_SECRET_PATH;
    this.#receiptPath = options.receiptPath ?? DEFAULT_RECEIPT_PATH;
    this.#decrypt = options.decrypt ?? defaultDpapiDecrypt;
    this.#readReceipt = options.readReceipt ?? defaultReceiptReader;
  }

  async getCredential(): Promise<CongressGovCredentialMaterialV1> {
    if (this.#platform !== "win32" && !this.#wslInterop) {
      throw new Error("CREDENTIAL_PLATFORM_UNSUPPORTED");
    }

    let receipt: CongressAdmissionReceiptV1;
    try {
      receipt = await this.#readReceipt(this.#receiptPath);
    } catch (error) {
      if (error instanceof Error && error.message === "CREDENTIAL_FILE_MISSING") throw error;
      throw new Error("CREDENTIAL_ADMISSION_RECEIPT_INVALID");
    }
    const fingerprintPrefix = validateAdmissionReceipt(receipt);

    const apiKey = (await this.#decrypt(this.#secretPath)).trim();
    if (!apiKey) throw new Error("CREDENTIAL_FILE_EMPTY");
    if (!fingerprintMatches(apiKey, fingerprintPrefix)) {
      throw new Error("CREDENTIAL_FINGERPRINT_MISMATCH");
    }

    return {
      apiKey,
      credentialAdmissionRef: CREDENTIAL_ADMISSION_REF,
      credentialFingerprintPrefix: fingerprintPrefix,
    };
  }

  async getApiKey(): Promise<string> {
    return (await this.getCredential()).apiKey;
  }

  async getAdmissionReceiptRef(): Promise<string> {
    return CREDENTIAL_ADMISSION_REF;
  }
}
