// Synnergyze R0.5: loopback-only, persistent, SYNTHETIC workspace demonstration.
// This is not real authentication, tenant IAM, Warden, RiverOS, Tally, or production hosting.
import { createServer as nodeServer } from 'node:http';
import { readFileSync, writeFileSync, renameSync, mkdirSync, openSync, closeSync, fsyncSync, unlinkSync, existsSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_FILE = join(homedir(), '.synnergyze', 'workspace-r05.json');
const INITIAL_ACTORS = {
  requester: { id: 'requester', name: 'Business A', organisation: 'Business A', role: 'requester' },
  partner: { id: 'partner', name: 'Business B', organisation: 'Business B', role: 'partner' },
  office: { id: 'office', name: 'Network Office', organisation: 'Network Office', role: 'office' },
};
const START = {
  schemaVersion: 1, mode: 'SYNTHETIC_LOCAL_ONLY',
  workspaces: [{ id:'WORKSPACE-001', title:'Shared workroom', requester:'requester', partner:'partner', invitation:'PENDING' }],
  requests: [], events: [],
};
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone = x => structuredClone(x);
const required = (v, max=140) => typeof v === 'string' && v.trim().length>0 && v.trim().length<=max;
class HttpError extends Error { constructor(status,code) { super(code); this.status=status; this.code=code; } }
const denied = code => { throw new HttpError(403,code); };
const bad = code => { throw new HttpError(400,code); };

function safePersist(file, state) {
  const folder=dirname(file); mkdirSync(folder,{recursive:true,mode:0o700});
  const temp=join(folder,'.workspace-'+randomUUID()+'.tmp');
  const bytes=JSON.stringify(state,null,2)+'\n';
  // Restrict file permissions; keep the update atomic within one filesystem.
  let fd;
  try {
    fd=openSync(temp,'wx',0o600);writeFileSync(fd,bytes,'utf8');fsyncSync(fd);closeSync(fd);fd=undefined;
    renameSync(temp,file);
    // The directory sync makes the rename more durable when supported.
    try { const d=openSync(folder,'r');try{fsyncSync(d);}finally{closeSync(d);} } catch {}
  } finally { if(fd!==undefined)closeSync(fd);if(existsSync(temp))unlinkSync(temp); }
}
function addEvent(state,actor,kind,summary,workspace='WORKSPACE-001') {
  const previous=state.events.at(-1)?.digest ?? 'GENESIS';
  const entry={sequence:state.events.length+1,at:new Date().toISOString(),actor,kind,summary,workspace,previous,synthetic:true};
  entry.digest=hash(entry);state.events.push(entry);
}
export function createStore(file) {
  file=resolve(file);
  let state;
  if(existsSync(file)) {
    state=JSON.parse(readFileSync(file,'utf8'));
    if(state.schemaVersion!==1||!Array.isArray(state.requests)||!Array.isArray(state.workspaces)||!Array.isArray(state.events)||state.mode!=='SYNTHETIC_LOCAL_ONLY') throw new Error('STATE_SCHEMA_UNSUPPORTED');
  } else {state=clone(START);addEvent(state,'office','WORKROOM_CREATED','Sample workroom prepared');safePersist(file,state);}
  function read() { return clone(state); }
  function commit(change) {
    const next=clone(state);const result=change(next);
    safePersist(file,next);state=next;return clone(result);
  }
  return { read,commit,file };
}
const permitted = (s,actor,workspace) => {
  const w=s.workspaces.find(x=>x.id===workspace);
  if(!w)throw new HttpError(404,'WORKROOM_NOT_FOUND');
  if(actor==='office'||actor===w.requester||(actor===w.partner&&w.invitation==='ACCEPTED'))return w;
  denied('NOT_IN_WORKROOM');
};
function view(s,actor) {
  if(!INITIAL_ACTORS[actor])denied('DEMO_ROLE_REQUIRED');
  const workspaces=s.workspaces.filter(w=>actor==='office'||w.requester===actor||w.partner===actor);
  const visible=new Set(workspaces.filter(w=>actor!=='partner'||w.invitation==='ACCEPTED').map(w=>w.id));
  return {
    demo:true, role:actor, actor:clone(INITIAL_ACTORS[actor]),
    workspaces: workspaces.map(w=>({...w})),
    requests:s.requests.filter(r=>visible.has(r.workspace)&&(
      actor==='office'||r.requester===actor||(r.partner===actor&&s.workspaces.find(w=>w.id===r.workspace)?.invitation==='ACCEPTED')
    )).map(clone),
    events:s.events.filter(e=>visible.has(e.workspace)).slice(-40).map(e=>({sequence:e.sequence,kind:e.kind,summary:e.summary,at:e.at,actor:e.actor,synthetic:true})),
    connections:[
      {name:'Membership checks',state:'Sample identities only'},
      {name:'Permission checks',state:'Local demonstration rules'},
      {name:'Accounting and ERP',state:'Not connected'},
      {name:'Evidence ledger',state:'Local sample activity only'},
    ],
  };
}
export function createApp({file=DEFAULT_FILE}={}) {
  const db=createStore(file);
  const staticFiles=new Map([
    ['/',{path:join(here,'public','index.html'),type:'text/html; charset=utf-8'}],
    ['/control',{path:join(here,'public','index.html'),type:'text/html; charset=utf-8'}],
    ['/app.js',{path:join(here,'public','app.js'),type:'text/javascript; charset=utf-8'}],
    ['/styles.css',{path:join(here,'public','styles.css'),type:'text/css; charset=utf-8'}],
  ]);
  const server=nodeServer(async(req,res)=>{
    const send=(status,payload)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(payload));};
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const host=req.headers.host??'';
      if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(host))denied('LOCAL_HOST_ONLY');
      if(req.headers.origin&&req.headers.origin!=='http://'+host)denied('CROSS_ORIGIN_DENIED');
      const url=new URL(req.url,'http://127.0.0.1');
      if(req.method==='GET'&&staticFiles.has(url.pathname)) {
        const f=staticFiles.get(url.pathname);res.statusCode=200;res.setHeader('Content-Type',f.type);res.end(readFileSync(f.path));return;
      }
      if(!url.pathname.startsWith('/api/'))throw new HttpError(404,'NOT_FOUND');
      const actor=req.headers['x-demo-role'];
      if(!INITIAL_ACTORS[actor])denied('SELECT_DEMO_ROLE');
      if(req.method==='GET'&&url.pathname==='/api/state'){send(200,view(db.read(),actor));return;}
      if(req.method!=='POST')throw new HttpError(405,'METHOD_NOT_ALLOWED');
      if(!(req.headers['content-type']??'').toLowerCase().startsWith('application/json'))bad('JSON_REQUIRED');
      let text='';for await(const chunk of req){text+=chunk.toString('utf8');if(text.length>8192)throw new HttpError(413,'REQUEST_TOO_LARGE');}
      let body;try{body=JSON.parse(text||'{}');}catch{bad('INVALID_JSON');}
      if(!body||typeof body!=='object'||Array.isArray(body))bad('INVALID_JSON');
      const pathname=url.pathname;
      const result=db.commit(s=>{
        const w=s.workspaces.find(item=>item.id==='WORKSPACE-001');
        if(!w)throw new HttpError(404,'WORKROOM_NOT_FOUND');
        if(pathname==='/api/invitation/accept'){
          if(actor!==w.partner)denied('PARTNER_ONLY');
          if(w.invitation!=='PENDING')bad('ALREADY_RESPONDED');
          w.invitation='ACCEPTED';addEvent(s,actor,'PARTNER_JOINED','Partner accepted the invitation');
          return {ok:true};
        }
        permitted(s,actor,'WORKSPACE-001');
        if(pathname==='/api/requests'){
          if(actor!==w.requester)denied('REQUESTER_ONLY');
          if(w.invitation!=='ACCEPTED')bad('WAIT_FOR_PARTNER');
          if(!required(body.title,100)||!required(body.details,800)||!required(body.clientRequestKey,120))bad('REQUEST_DETAILS_REQUIRED');
          const existing=s.requests.find(x=>x.requester===actor&&x.clientRequestKey===body.clientRequestKey);
          if(existing){if(existing.title!==body.title.trim()||existing.details!==body.details.trim())bad('REQUEST_KEY_CONFLICT');return existing;}
          const item={id:'REQ-'+String(s.requests.length+1).padStart(3,'0'),workspace:w.id,
            requester:w.requester,partner:w.partner,title:body.title.trim(),details:body.details.trim(),
            clientRequestKey:body.clientRequestKey,status:'AWAITING_PARTNER',createdAt:new Date().toISOString(),acceptedAt:null,approvedAt:null,completedAt:null,
            synthetic:true,externalEffects:false};
          s.requests.push(item);addEvent(s,actor,'REQUEST_CREATED','Work request '+item.id+' submitted');return item;
        }
        const m=pathname.match(/^\/api\/requests\/(REQ-\d+)\/(accept|decline|approve|complete)$/);
        if(!m)throw new HttpError(404,'ACTION_NOT_FOUND');
        const item=s.requests.find(x=>x.id===m[1]&&x.workspace===w.id);
        if(!item)throw new HttpError(404,'REQUEST_NOT_FOUND');
        const action=m[2];
        if(action==='accept'||action==='decline') {
          if(actor!==w.partner)denied('PARTNER_ONLY');
          if(item.status!=='AWAITING_PARTNER')bad('REQUEST_ALREADY_RESPONDED');
          item.status=action==='accept'?'AWAITING_OFFICE':'DECLINED';
          item.acceptedAt=action==='accept'?new Date().toISOString():null;
          addEvent(s,actor,action==='accept'?'REQUEST_ACCEPTED':'REQUEST_DECLINED','Partner '+(action==='accept'?'accepted ':'declined ')+item.id);
        } else if(action==='approve') {
          if(actor!=='office')denied('OFFICE_ONLY');
          if(item.status!=='AWAITING_OFFICE')bad('REQUEST_NOT_READY');
          item.status='IN_PROGRESS';item.approvedAt=new Date().toISOString();
          addEvent(s,actor,'OFFICE_APPROVED','Office approved '+item.id+' for demonstration');
        } else if(action==='complete') {
          if(actor!==w.partner)denied('PARTNER_ONLY');
          if(item.status!=='IN_PROGRESS')bad('REQUEST_NOT_IN_PROGRESS');
          item.status='COMPLETED';item.completedAt=new Date().toISOString();
          addEvent(s,actor,'WORK_MARKED_COMPLETE','Partner marked '+item.id+' complete');
        }
        return item;
      });
      send(200,{ok:true,result});
    } catch(error) { send(error.status??500,{ok:false,error:error.code??'INTERNAL_ERROR'}); }
  });
  return { server, store:db, async start(port=0) {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
    return 'http://127.0.0.1:'+server.address().port;
  },async close(){if(!server.listening)return;await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));} };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.env.SYNNERGYZE_DEMO_MODE!=='1'){console.error('Refusing to start: set SYNNERGYZE_DEMO_MODE=1. This is a local synthetic demo only.');process.exitCode=1;}
  else {
    const app=createApp({file:process.env.SYNNERGYZE_STATE_FILE||DEFAULT_FILE});
    const address=await app.start(Number(process.env.SYNNERGYZE_PORT||4177));
    console.log('Synnergyze SAMPLE WORKSPACE: '+address);
    console.log('Local-only role switcher; no real identities, authorisation, integrations or external effects.');
    console.log('Local state file: '+app.store.file);
  }
}
