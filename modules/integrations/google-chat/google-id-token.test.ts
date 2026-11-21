import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyGoogleIdTokenSubject } from "./google-id-token.ts";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key-1", alg: "RS256", use: "sig" };
const now=1800000000000;
const client="123456789-abcd.apps.googleusercontent.com";
const nonce="N".repeat(43);
const subject="123456789012345678901";
const binding={
  actorRef:"DIGITALME:TEST",principalRef:"PRINCIPAL:TEST",
  googleAccountBindingRef:"GOOGLE:TEST",consentRef:"CONSENT:TEST",
  wardenRequestRef:"WARDEN:TEST",correlationId:"CORR:TEST",
};
const base={
  iss:"https://accounts.google.com",
  aud:client,exp:Math.floor(now/1000)+900,iat:Math.floor(now/1000)-20,
  sub:subject,nonce,
};
const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString("base64url");
const token=(overrides:Record<string,unknown>={},headerOverrides:Record<string,unknown>={})=>{
  const payload=encode({...base,...overrides});
  const header=encode({alg:"RS256",typ:"JWT",kid:"test-key-1",...headerOverrides});
  const signature=sign("RSA-SHA256",Buffer.from(header+"."+payload),privateKey).toString("base64url");
  return header+"."+payload+"."+signature;
};
const jwksFetch=async()=>new Response(JSON.stringify({keys:[jwk]}),{status:200});
const validRegistry={async getVerifiedGoogleSubject(){return subject;}};
const run=(idToken:string,overrides:Record<string,unknown>={})=>verifyGoogleIdTokenSubject({
  idToken,expectedClientId:client,expectedNonce:nonce,binding,registry:validRegistry,
  now,jwksFetch:jwksFetch as typeof fetch,...overrides,
});
describe("GEN-CON-GCHAT-001 signed Google OIDC identity gate",()=>{
  it("accepts genuine RSA signature with registered subject and bound nonce",async()=>{
    expect(await run(token())).toBe(true);
  });
  it("denies tampered signed payload",async()=>{
    const parts=token().split(".");
    parts[1]=encode({...base,sub:"999999999999999999999"});
    expect(await run(parts.join("."))).toBe(false);
  });
  it("rejects wrong audience",async()=>expect(await run(token({aud:"other-client"}))).toBe(false));
  it("rejects wrong issuer",async()=>expect(await run(token({iss:"https://malicious.test"}))).toBe(false));
  it("rejects expired token",async()=>expect(await run(token({exp:Math.floor(now/1000)-3600}))).toBe(false));
  it("rejects future-issued token",async()=>expect(await run(token({iat:Math.floor(now/1000)+3600}))).toBe(false));
  it("rejects mismatched nonce",async()=>expect(await run(token({nonce:"wrong"}))).toBe(false));
  it("rejects unregistered subject",async()=>expect(await run(token({sub:"999999999999999999999"}))).toBe(false));
  it("rejects absent registry binding",async()=>expect(await run(token(),{
    registry:{async getVerifiedGoogleSubject(){return null;}},
  })).toBe(false));
  it("rejects incorrect algorithm",async()=>expect(await run(token({}, {alg:"none"}))).toBe(false));
  it("rejects another signing key",async()=>expect(await run(token(),{
    jwksFetch:(async()=>new Response(JSON.stringify({keys:[]}))) as typeof fetch,
  })).toBe(false));
  it("rejects array audience without explicit support",async()=>expect(await run(token({aud:[client]}))).toBe(false));
  it("rejects malformed ID token",async()=>expect(await run("abc.def.ghi")).toBe(false));
  it("rejects Google cert fetch failure",async()=>expect(await run(token(),{
    jwksFetch:(async()=>new Response("{}",{status:503})) as typeof fetch,
  })).toBe(false));
  it("rejects a different authorized presenter",async()=>expect(await run(token({azp:"other-client"}))).toBe(false));
});
