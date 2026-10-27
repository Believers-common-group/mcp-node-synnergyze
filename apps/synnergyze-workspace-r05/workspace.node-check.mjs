import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './server.mjs';
async function setup(t) {
 const dir=mkdtempSync(join(tmpdir(),'syn-r05-'));
 const file=join(dir,'workroom.json');
 const app=createApp({file});
 const url=await app.start(0);
 t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
 const api=async(role,path,body,headers={})=>{
   const options={headers:{'x-demo-role':role,...headers}};
   if(body!==undefined){options.method='POST';options.headers['content-type']='application/json';options.body=JSON.stringify(body);}
   const r=await fetch(url+path,options);
   return {status:r.status,body:await r.json()};
 };
 return {dir,file,app,url,api};
}
const requester='requester', partner='partner', office='office';
async function invite(api){return api(partner,'/api/invitation/accept',{});}
async function create(api,body={title:'Prepare a display sample',details:'Deliver to the agreed workspace by Friday.',clientRequestKey:'IDEMP-01'}){return api(requester,'/api/requests',body);}
async function accepted(api){
 await invite(api);const order=await create(api);
 await api(partner,'/api/requests/'+order.body.result.id+'/accept',{});
 return order.body.result.id;
}
test('01 initial workspace created with private persistent state file', async t=>{const x=await setup(t);assert.equal(existsSync(x.file),true);assert.equal(JSON.parse(readFileSync(x.file)).mode,'SYNTHETIC_LOCAL_ONLY');});
test('02 initial state has no business orders',async t=>{const x=await setup(t);const r=await x.api(requester,'/api/state');assert.equal(r.body.requests.length,0);});
test('03 partner sees invitation but not internal pre-acceptance events',async t=>{const x=await setup(t);const r=await x.api(partner,'/api/state');assert.equal(r.body.workspaces[0].invitation,'PENDING');assert.equal(r.body.events.length,0);});
test('04 office can see sample coordination workroom',async t=>{const x=await setup(t);const r=await x.api(office,'/api/state');assert.equal(r.body.workspaces.length,1);});
test('05 invite must be accepted by the partner',async t=>{const x=await setup(t);const r=await x.api(requester,'/api/invitation/accept',{});assert.equal(r.status,403);});
test('06 partner can accept invitation once',async t=>{const x=await setup(t);assert.equal((await invite(x.api)).status,200);assert.equal((await invite(x.api)).status,400);});
test('07 requester cannot send a task before partner joins',async t=>{const x=await setup(t);const r=await create(x.api);assert.equal(r.status,400);assert.equal(r.body.error,'WAIT_FOR_PARTNER');});
test('08 requester creates a request after invitation accepted',async t=>{const x=await setup(t);await invite(x.api);const r=await create(x.api);assert.equal(r.status,200);assert.equal(r.body.result.status,'AWAITING_PARTNER');});
test('09 partner cannot propose tasks for requester',async t=>{const x=await setup(t);await invite(x.api);const r=await x.api(partner,'/api/requests',{title:'Wrong actor',details:'Unauthorised.',clientRequestKey:'UNAUTH'});assert.equal(r.status,403);});
test('10 office cannot approve before partner agrees',async t=>{const x=await setup(t);await invite(x.api);await create(x.api);const r=await x.api(office,'/api/requests/REQ-001/approve',{});assert.equal(r.status,400);});
test('11 partner can accept pending work',async t=>{const x=await setup(t);const id=await accepted(x.api);const r=await x.api(office,'/api/state');assert.equal(r.body.requests.find(v=>v.id===id).status,'AWAITING_OFFICE');});
test('12 office approves accepted work',async t=>{const x=await setup(t);const id=await accepted(x.api);const r=await x.api(office,'/api/requests/'+id+'/approve',{});assert.equal(r.body.result.status,'IN_PROGRESS');});
test('13 only partner can mark approved work completed',async t=>{const x=await setup(t);const id=await accepted(x.api);await x.api(office,'/api/requests/'+id+'/approve',{});assert.equal((await x.api(requester,'/api/requests/'+id+'/complete',{})).status,403);assert.equal((await x.api(partner,'/api/requests/'+id+'/complete',{})).body.result.status,'COMPLETED');});
test('14 partner may decline; a declined task cannot be approved',async t=>{const x=await setup(t);await invite(x.api);await create(x.api);assert.equal((await x.api(partner,'/api/requests/REQ-001/decline',{})).body.result.status,'DECLINED');assert.equal((await x.api(office,'/api/requests/REQ-001/approve',{})).status,400);});
test('15 idempotent repeat request produces only one task',async t=>{const x=await setup(t);await invite(x.api);const a=await create(x.api);const b=await create(x.api);const r=await x.api(requester,'/api/state');assert.equal(a.body.result.id,b.body.result.id);assert.equal(r.body.requests.length,1);});
test('16 idempotency key conflict refuses altered payload',async t=>{const x=await setup(t);await invite(x.api);await create(x.api);const r=await create(x.api,{title:'Changed task',details:'Changed',clientRequestKey:'IDEMP-01'});assert.equal(r.status,400);assert.equal(r.body.error,'REQUEST_KEY_CONFLICT');});
test('17 persistent work and decisions survive backend restart',async t=>{const x=await setup(t);const id=await accepted(x.api);await x.app.close();const app2=createApp({file:x.file});const url2=await app2.start();t.after(()=>app2.close());const r=await fetch(url2+'/api/state',{headers:{'x-demo-role':office}});const data=await r.json();assert.equal(data.requests.find(v=>v.id===id).status,'AWAITING_OFFICE');assert.ok(data.events.some(e=>e.kind==='REQUEST_ACCEPTED'));});
test('18 request amount and metadata cannot trigger financial effects',async t=>{const x=await setup(t);await invite(x.api);const r=await x.api(requester,'/api/requests',{title:'Example',details:'Example',clientRequestKey:'NO_EFFECT',amount:999999,externalEffects:true});assert.equal(r.body.result.externalEffects,false);assert.equal(r.body.result.synthetic,true);});
test('19 identity header required and cross-origin writes denied',async t=>{const x=await setup(t);assert.equal((await x.api('unknown','/api/state')).status,403);const r=await x.api(partner,'/api/invitation/accept',{}, {origin:'https://other.invalid'});assert.equal(r.status,403);});
test('20 frontend is served with safe content types and expected languages',async t=>{const x=await setup(t);const html=await fetch(x.url+'/');assert.equal(html.status,200);assert.match(html.headers.get('content-type'),/text\/html/);const js=await fetch(x.url+'/app.js');const source=await js.text();assert.match(source,/हिन्दी/);assert.match(source,/ಕನ್ನಡ/);assert.match(js.headers.get('content-type'),/javascript/);});
test('21 office control route is same-origin, not separately deployed',async t=>{const x=await setup(t);const r=await fetch(x.url+'/control');assert.equal(r.status,200);assert.match(await r.text(),/Synnergyze/);});
test('22 HTML injection text is stored as data, not an effect',async t=>{const x=await setup(t);await invite(x.api);const title='<img src=x onerror=alert(1)>';const r=await create(x.api,{title,details:'Test content',clientRequestKey:'SAFE-CONTENT'});assert.equal(r.body.result.title,title);const js=readFileSync(join(new URL('.',import.meta.url).pathname,'public','app.js'),'utf8');assert.match(js,/escapeHtml/);});
test('23 invalid JSON or wrong content type rejected without changing state',async t=>{const x=await setup(t);await invite(x.api);const r=await fetch(x.url+'/api/requests',{method:'POST',headers:{'x-demo-role':requester,'content-type':'text/plain'},body:'not-json'});assert.equal(r.status,400);assert.equal((await x.api(office,'/api/state')).body.requests.length,0);});
test('24 synthetic state schema version is explicit',async t=>{const x=await setup(t);const state=JSON.parse(readFileSync(x.file,'utf8'));assert.equal(state.schemaVersion,1);});
test('25 state file restricts access on POSIX filesystem',async t=>{const x=await setup(t);if(process.platform==='win32')return;assert.equal(statSync(x.file).mode&0o077,0);});
