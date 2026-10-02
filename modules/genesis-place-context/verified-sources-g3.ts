import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import type { SourceAdapter, VerifiedReceipt } from "./contracts.ts";

export type ProofPurposeG3 = "RECOGNITION" | "REQUIREMENT" | "PREDICATE" | "INVENTORY";
export interface SignedSourceClaimG3 {
  schema: "PLACE-SOURCE:G3-ED25519-1";
  source_ref: string;
  jurisdiction_ref: string;
  provider_ref: string;
  key_id: string;
  purpose: ProofPurposeG3;
  payload_sha256: string;
  issued_at: string;
  valid_from: string;
  valid_until: string;
}
export interface SignedSourceRecordG3 {
  claim: SignedSourceClaimG3;
  payload_base64: string;
  signature_base64: string;
}
export interface SourceTrustAnchorG3 {
  provider_ref: string;
  key_id: string;
  public_key_spki_pem: string;
  jurisdiction_refs: readonly string[];
  purposes: readonly ProofPurposeG3[];
  status: "ADMITTED" | "REVOKED";
  valid_from: string;
  valid_until: string;
}

/** All signing material is external. No private keys or regulator credentials belong in this repo. */
const marker = "VSR-G3-PLACE-SOURCE-ED25519-V1\n";
export function placeSourceSignedBytesG3(claim: SignedSourceClaimG3): Uint8Array {
  return Buffer.from(marker + JSON.stringify({
    schema: claim.schema, source_ref: claim.source_ref, jurisdiction_ref: claim.jurisdiction_ref,
    provider_ref: claim.provider_ref, key_id: claim.key_id, purpose: claim.purpose,
    payload_sha256: claim.payload_sha256, issued_at: claim.issued_at,
    valid_from: claim.valid_from, valid_until: claim.valid_until,
  }), "utf8");
}
export function placeSourceSha256G3(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function time(s:string):number|undefined {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(s))return undefined;
  const value=Date.parse(s); return Number.isFinite(value)?value:undefined;
}
function decodeExact(base64:string, maxSize=262144):Buffer|undefined {
  if (!base64 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))return;
  const data=Buffer.from(base64,"base64");
  return data.length && data.length<=maxSize && data.toString("base64")===base64 ? data : undefined;
}
/**
 * Validates cryptographic integrity against EXPLICITLY supplied anchors.
 * The calling authority must still prove that the anchor actually belongs to a
 * competent regulator/provider and that admission is independent of this code.
 */
export class VerifiedSourceBundleG3 {
  private readonly records: Map<string, SignedSourceRecordG3>;
  constructor(
    signedRecords: readonly SignedSourceRecordG3[],
    private readonly anchors: readonly SourceTrustAnchorG3[],
    private readonly evaluatedAt: string,
    private readonly maxAgeMs: number,
  ){
    this.records=new Map();
    for(const record of signedRecords){
      if (this.records.has(record.claim.source_ref)) throw Error("G3_DUPLICATE_SOURCE_REF");
      this.records.set(record.claim.source_ref,record);
    }
  }
  inspect(ref:string,jurisdiction:string,purpose:ProofPurposeG3):{claim:SignedSourceClaimG3;body:Buffer}|undefined {
    const r=this.records.get(ref), c=r?.claim;
    if(!r||!c||c.schema!=="PLACE-SOURCE:G3-ED25519-1"||
       c.source_ref!==ref||c.jurisdiction_ref!==jurisdiction||c.purpose!==purpose||
       !/^[a-f0-9]{64}$/i.test(c.payload_sha256)) return;
    const now=time(this.evaluatedAt), issued=time(c.issued_at);
    const from=time(c.valid_from), until=time(c.valid_until);
    if (now===undefined||issued===undefined||from===undefined||until===undefined||
        !Number.isFinite(this.maxAgeMs)||this.maxAgeMs<=0||
        until<from||issued<from||issued>until||now<issued||now-issued>this.maxAgeMs||now<from||now>until) return;
    const matching=this.anchors.filter(a=>a.provider_ref===c.provider_ref&&a.key_id===c.key_id);
    if (matching.length!==1)return;
    const anchor=matching[0];
    if (!anchor||anchor.status!=="ADMITTED"||
        !anchor.jurisdiction_refs.includes(jurisdiction)||!anchor.purposes.includes(purpose))return;
    const begin=time(anchor.valid_from), end=time(anchor.valid_until);
    if(begin===undefined||end===undefined||end<begin||issued<begin||issued>end||now>end)return;
    const body=decodeExact(r.payload_base64);
    const signature=decodeExact(r.signature_base64,8192);
    if(!body||!signature||placeSourceSha256G3(body)!==c.payload_sha256)return;
    try {
      const publicKey=createPublicKey(anchor.public_key_spki_pem);
      if(publicKey.asymmetricKeyType!=="ed25519"||
         !verifySignature(null,placeSourceSignedBytesG3(c),publicKey,signature))return;
    }catch{return}
    return {claim:c,body};
  }
  asAdapter(expectedPurposes: ReadonlyMap<string, ProofPurposeG3>):SourceAdapter {
    return {
      verify:async (ref,jurisdiction):Promise<VerifiedReceipt|undefined>=>{
        const purpose=expectedPurposes.get(ref);
        if(!purpose)return;
        const x=this.inspect(ref,jurisdiction,purpose);
        if(!x)return;
        const c=x.claim;
        return {
          source_ref:ref,jurisdiction_ref:jurisdiction,provider_ref:c.provider_ref,
          sha256:c.payload_sha256,
          evidence_ref:"G3-VERIFIED:"+placeSourceSha256G3(placeSourceSignedBytesG3(c)),
          verified_at:c.issued_at,valid_from:c.valid_from,valid_until:c.valid_until,
          signature_status:"VALID",
        };
      },
    };
  }
}
