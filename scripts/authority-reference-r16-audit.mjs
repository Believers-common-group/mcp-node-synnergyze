#!/usr/bin/env node
// R1.6 source-only offline evidence signature protocol.
// Strictly test-only. No database, Warden, RiverOS, network, or execution calls.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";

const PREFIX = "AUTHORITY_REFERENCE_R16_AUDIT_CHECKPOINT_V1\n";
const SHA = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const CLUSTER = /^[0-9]{6,32}$/;
const NONEMPTY = /^[a-zA-Z0-9_.:-]{1,160}$/;
const obj=x=>x!==null&&typeof x==="object"&&!Array.isArray(x);
const digest=b=>"sha256:"+createHash("sha256").update(b).digest("hex");
const normalize=x=>Array.isArray(x)?x.map(normalize):obj(x)?
  Object.fromEntries(Object.keys(x).sort().map(k=>[k,normalize(x[k])])):x;
const canonical=x=>JSON.stringify(normalize(x));
const ensure=(cond,message)=>{if(!cond)throw Error(message)};
const maxBytes=16384;
const readBounded=async path=>{
  const b=await readFile(path);ensure(b.length>0&&b.length<maxBytes,"FILE_OUT_OF_BOUNDS");return b;
};
const iso=t=>typeof t==="string"&&Number.isFinite(Date.parse(t))&&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(t);
function validateCandidate(x) {
  ensure(obj(x)&&x.schema==="AUTHORITY-REFERENCE-R15-AUDIT-CANDIDATE-001","CANDIDATE_SCHEMA_INVALID");
  ensure(x.origin==="ephemeral-github-actions-postgres16","ORIGIN_NOT_EPHEMERAL");
  ensure(typeof x.sourceCommit==="string"&&COMMIT.test(x.sourceCommit),"INVALID_SOURCE_COMMIT");
  ensure(typeof x.sourceClusterIdentifier==="string"&&CLUSTER.test(x.sourceClusterIdentifier),"INVALID_SOURCE_CLUSTER");
  ensure(typeof x.restoredClusterIdentifier==="string"&&CLUSTER.test(x.restoredClusterIdentifier)&&
    x.restoredClusterIdentifier!==x.sourceClusterIdentifier,"INVALID_RESTORE_IDENTITY");
  ensure(x.syntheticRowCount===2&&typeof x.rowDataSha256==="string"&&SHA.test(x.rowDataSha256),"ROW_DIGEST_INVALID");
  ensure(x.restartIdentityUnchanged===true&&x.restoredIdentityDistinct===true&&
    x.replayAfterRestartDenied===true&&x.replayAfterRestoreDenied===true,"RECOVERY_EVIDENCE_INCOMPLETE");
  ensure(x.authorityAdmitted===false&&x.externallyAnchored===false&&x.commissioningState==="HOLD",
    "UNAUTHORISED_CANDIDATE_CLAIM");
}
const BASE64=/^[A-Za-z0-9+/]+={0,2}$/;
const decodeSig=s=>{
  ensure(typeof s==="string"&&BASE64.test(s),"SIGNATURE_ENCODING_INVALID");
  const b=Buffer.from(s,"base64");
  ensure(b.length===64&&b.toString("base64")===s,"SIGNATURE_ENCODING_INVALID");return b;
};
function pinnedSpki(pem){
  const key=createPublicKey(pem);ensure(key.asymmetricKeyType==="ed25519","SIGNER_NOT_ED25519");
  return digest(key.export({format:"der",type:"spki"}));
}
function validateBundle(bundle, candidate, candidateBytes, expectedCommit, expectedPin, publicKey, now) {
  ensure(obj(bundle)&&bundle.schema==="AUTHORITY-REFERENCE-R16-SIGNED-AUDIT-001","BUNDLE_SCHEMA_INVALID");
  ensure(bundle.algorithm==="Ed25519"&&bundle.signerRole==="TEST_AUDITOR"&&
    bundle.authorityGranted===false&&bundle.externallyAnchored===false&&
    bundle.state==="HOLD","BUNDLE_AUTHORITY_INVARIANT");
  ensure(obj(bundle.claims),"SIGNED_CLAIMS_MISSING");
  const x=bundle.claims;
  ensure(x.audience==="AUTHORITY_REFERENCE_OFFLINE_AUDIT_REVIEW"&&
    typeof x.evidenceRunId==="string"&&NONEMPTY.test(x.evidenceRunId),"AUDIENCE_OR_RUN_MISMATCH");
  ensure(x.sourceCommit===expectedCommit&&x.sourceCommit===candidate.sourceCommit,
    "SOURCE_COMMIT_MISMATCH");
  ensure(x.candidateSha256===digest(candidateBytes)&&
    x.rowDataSha256===candidate.rowDataSha256&&x.syntheticRowCount===candidate.syntheticRowCount&&
    x.originalClusterId===candidate.sourceClusterIdentifier&&
    x.restoredClusterId===candidate.restoredClusterIdentifier,
    "CANDIDATE_BINDING_MISMATCH");
  ensure(x.anchorMode==="CI_EPHEMERAL_TEST_ONLY"&&x.commissioningState==="HOLD"&&
    x.authorityAdmitted===false,"ANCHOR_ELEVATION_FORBIDDEN");
  ensure(iso(x.signedAt)&&iso(x.expiresAt)&&Date.parse(x.signedAt)<=now&&
    now<=Date.parse(x.expiresAt)&&
    Date.parse(x.expiresAt)>Date.parse(x.signedAt)&&
    Date.parse(x.expiresAt)-Date.parse(x.signedAt)<=15*60*1000,
    "ATTESTATION_TIME_INVALID");
  ensure(pinnedSpki(publicKey)===expectedPin,"INDEPENDENT_PIN_MISMATCH");
  const k=createPublicKey(publicKey);
  const payload=PREFIX+canonical({schema:bundle.schema,algorithm:bundle.algorithm,
    signerRole:bundle.signerRole,claims:x,authorityGranted:false,externallyAnchored:false,state:"HOLD"});
  ensure(verify(null,Buffer.from(payload),k,decodeSig(bundle.signatureBase64)),
    "AUDIT_SIGNATURE_INVALID");
}

async function main(){
 const [mode,...args]=process.argv.slice(2);
 ensure(process.env.R16_TEST_ONLY==="1","R16_TEST_ONLY_ENV_REQUIRED");
 if(mode==="generate-test-key"){
   ensure(args.length===2,"ARGUMENTS_INVALID");
   const k=generateKeyPairSync("ed25519");
   await writeFile(args[0],k.privateKey.export({type:"pkcs8",format:"pem"}),{flag:"wx",mode:0o600});
   await chmod(args[0],0o600);
   await writeFile(args[1],k.publicKey.export({type:"spki",format:"pem"}),{flag:"wx",mode:0o600});
   process.stdout.write("TEST_ONLY_KEYPAIR_CREATED\n");return;
 }
 if(mode==="pin"){
   ensure(args.length===1,"ARGUMENTS_INVALID");
   process.stdout.write(pinnedSpki((await readBounded(args[0])).toString("utf8"))+"\n");return;
 }
 if(mode==="sign"){
   ensure(args.length===5,"ARGUMENTS_INVALID");
   const [candidatePath,privatePath,bundlePath,runId,expectedCommit]=args;
   const b=await readBounded(candidatePath),candidate=JSON.parse(b.toString("utf8"));
   validateCandidate(candidate);
   ensure(NONEMPTY.test(runId)&&COMMIT.test(expectedCommit)&&candidate.sourceCommit===expectedCommit,
     "SIGNER_REQUEST_SCOPE_INVALID");
   const key=createPrivateKey((await readBounded(privatePath)).toString("utf8"));
   ensure(key.asymmetricKeyType==="ed25519","SIGNER_NOT_ED25519");
   const now=new Date(),exp=new Date(now.valueOf()+10*60*1000);
   const claims={
     audience:"AUTHORITY_REFERENCE_OFFLINE_AUDIT_REVIEW",evidenceRunId:runId,
     candidateSha256:digest(b),sourceCommit:expectedCommit,
     rowDataSha256:candidate.rowDataSha256,syntheticRowCount:2,
     originalClusterId:candidate.sourceClusterIdentifier,
     restoredClusterId:candidate.restoredClusterIdentifier,
     anchorMode:"CI_EPHEMERAL_TEST_ONLY",commissioningState:"HOLD",authorityAdmitted:false,
     signedAt:now.toISOString(),expiresAt:exp.toISOString(),
   };
   const unsigned={
     schema:"AUTHORITY-REFERENCE-R16-SIGNED-AUDIT-001",algorithm:"Ed25519",
     signerRole:"TEST_AUDITOR",claims,authorityGranted:false,externallyAnchored:false,state:"HOLD",
   };
   const signatureBase64=sign(null,Buffer.from(PREFIX+canonical(unsigned)),key).toString("base64");
   await writeFile(bundlePath,JSON.stringify({...unsigned,signatureBase64},null,2)+"\n",{flag:"wx",mode:0o600});
   process.stdout.write("SIGNED_TEST_ONLY_UNANCHORED_CHECKPOINT\n");return;
 }
 if(mode==="verify"){
   ensure(args.length===5,"ARGUMENTS_INVALID");
   const [candidatePath,bundlePath,publicPath,pin,expectedCommit]=args;
   ensure(typeof pin==="string"&&SHA.test(pin)&&typeof expectedCommit==="string"&&COMMIT.test(expectedCommit),
     "INDEPENDENT_EXPECTATION_REQUIRED");
   const candidateBytes=await readBounded(candidatePath);
   const candidate=JSON.parse(candidateBytes.toString("utf8"));
   validateCandidate(candidate);
   const bundle=JSON.parse((await readBounded(bundlePath)).toString("utf8"));
   const publicKey=(await readBounded(publicPath)).toString("utf8");
   validateBundle(bundle,candidate,candidateBytes,expectedCommit,pin,publicKey,Date.now());
   process.stdout.write(JSON.stringify({
     schema:"AUTHORITY-REFERENCE-R16-VERIFICATION-RESULT-001",
     state:"HOLD",signatureValid:true,contentBound:true,
     independentlyAnchored:false,actualAuditIssuerTrusted:false,
     databaseIdentityAuthenticated:false,wardenAdmissionGranted:false,
     riverLiveReceiptVerified:false,executionAllowed:false,
   })+"\n");return;
 }
 throw Error("UNKNOWN_COMMAND");
}
main().catch(e=>{process.stderr.write("R1.6 audit validation failed: "+String(e.message)+"\n");process.exitCode=1});
