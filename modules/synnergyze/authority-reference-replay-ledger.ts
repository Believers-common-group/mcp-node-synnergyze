import { createHash } from "node:crypto";
import { lstat, open } from "node:fs/promises";
import path from "node:path";

/**
 * R1.2 single-host, pre-provisioned *offline test* nonce ledger.
 * Uses exclusive-create atomicity on the same filesystem; no globally distributed
 * guarantees, no source retrieval, no live permit consumption or estate authority.
 * No reset/delete API. Crash-partial records remain spent (fail closed).
 */
export interface OfflineNonceReservationR12 {
  schema: "AUTHORITY-REFERENCE-OFFLINE-NONCE-RESERVATION-001/R1.2";
  reserved: boolean;
  state: "HOLD";
  executionAllowed: false;
  reason: string;
  nonceKeyDigest: string | null;
}
const VALID = /^[A-Za-z0-9._:-]{16,160}$/;
const hex = (value:string) =>
  "sha256:" + createHash("sha256").update(value).digest("hex");
export class OfflineNonceLedgerR12 {
  readonly rootDirectory: string;
  constructor(rootDirectory: string) {
    if (typeof rootDirectory !== "string" || !path.isAbsolute(rootDirectory))
      throw new TypeError("ABSOLUTE_STAGING_ROOT_REQUIRED");
    this.rootDirectory = rootDirectory;
  }

  async reserve(input: { namespace: string; nonce: string; requestDigest: string }):
    Promise<OfflineNonceReservationR12> {
    const answer=(reserved:boolean,reason:string,nonceKeyDigest:string|null):
      OfflineNonceReservationR12=>({
        schema:"AUTHORITY-REFERENCE-OFFLINE-NONCE-RESERVATION-001/R1.2",
        reserved,state:"HOLD",executionAllowed:false,reason,nonceKeyDigest,
      });
    if (!VALID.test(input.namespace)||!VALID.test(input.nonce) ||
        !/^sha256:[a-f0-9]{64}$/.test(input.requestDigest))
      return answer(false,"INVALID_RESERVATION_SCOPE",null);

    const nonceKeyDigest = hex("R1.2-NONCE-KEY\0"+input.namespace+"\0"+input.nonce);
    const name=nonceKeyDigest.slice(7)+".reservation";
    const filename=path.join(this.rootDirectory,name);
    try {
      const stat=await lstat(this.rootDirectory);
      if(!stat.isDirectory()||stat.isSymbolicLink() ||
          (process.platform!=="win32"&&(stat.mode&0o077)!==0))
        return answer(false,"INSECURE_STAGING_LEDGER_DIRECTORY",nonceKeyDigest);
    } catch {
      return answer(false,"STAGING_LEDGER_DIRECTORY_UNAVAILABLE",nonceKeyDigest);
    }

    let file: Awaited<ReturnType<typeof open>> | null=null;
    try {
      file=await open(filename,"wx",0o600);
      await file.writeFile(JSON.stringify({
        schema:"OFFLINE-NONCE-SPENT-001/R1.2",
        nonceKeyDigest,requestDigest:input.requestDigest,
      })+"\n");
      await file.sync();
      return answer(true,"STAGING_NONCE_RESERVED_OFFLINE_ONLY",nonceKeyDigest);
    } catch (e) {
      if (e instanceof Error && "code" in e && e.code==="EEXIST")
        return answer(false,"STAGING_NONCE_ALREADY_SPENT",nonceKeyDigest);
      return answer(false,"STAGING_NONCE_STORAGE_ERROR",nonceKeyDigest);
    } finally {
      if (file) await file.close();
    }
  }
}
