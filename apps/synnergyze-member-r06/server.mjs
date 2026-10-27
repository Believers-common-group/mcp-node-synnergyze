// R0.6 local-only member pilot: SQLite and password/session admission.
// NOT DigitalMe/BNR/Warden/RiverOS authority, a hosted SaaS, or a production security boundary.
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync, mkdirSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT=dirname(fileURLToPath(import.meta.url));
const sha=x=>createHash('sha256').update(String(x)).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
const err=(code,status=400)=>{const e=new Error(code);e.status=status;throw e};
const valid=(v,n=120)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=n;
const norm=v=>String(v||'').trim().toLowerCase();
const hashed=password=>{const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(password,salt,64).toString('hex')};
const check=(password,stored)=>{try{const [salt,hex]=stored.split(':');return timingSafeEqual(scryptSync(password,salt,64),Buffer.from(hex,'hex'))}catch{return false}};
function database(file) {
  mkdirSync(dirname(file),{recursive:true,mode:0o700});
  const db=new DatabaseSync(file);
  try{chmodSync(file,0o600)}catch{}
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000; PRAGMA foreign_keys=ON;');
  [
    "CREATE TABLE IF NOT EXISTS orgs(id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE)",
    "CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,label TEXT NOT NULL,org_id TEXT REFERENCES orgs(id),kind TEXT NOT NULL CHECK(kind IN ('office','member')),password_hash TEXT NOT NULL,disabled INTEGER NOT NULL DEFAULT 0)",
    "CREATE TABLE IF NOT EXISTS invitations(token_hash TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES orgs(id),expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0)",
    "CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf_hash TEXT NOT NULL,expires INTEGER NOT NULL)",
    "CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY,title TEXT NOT NULL,requester_org TEXT NOT NULL REFERENCES orgs(id),partner_org TEXT NOT NULL REFERENCES orgs(id),accepted INTEGER NOT NULL DEFAULT 0)",
    "CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,room_id TEXT NOT NULL REFERENCES rooms(id),title TEXT NOT NULL,details TEXT NOT NULL,request_key TEXT NOT NULL,creator TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(room_id,creator,request_key))",
    "CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,room_id TEXT,actor TEXT NOT NULL,kind TEXT NOT NULL,summary TEXT NOT NULL,at TEXT NOT NULL,previous_digest TEXT NOT NULL,digest TEXT NOT NULL)"
  ].forEach(sql=>db.exec(sql));
  return db;
}
export function createMemberApp({file=join(homedir(),'.synnergyze','member-pilot-r06.sqlite'),adminPassword}={}){
  const resolved=resolve(file),db=database(resolved);
  const one=(sql,...args)=>db.prepare(sql).get(...args),many=(sql,...args)=>db.prepare(sql).all(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
  if(one('SELECT COUNT(*) AS n FROM users').n===0){
    if(typeof adminPassword!=='string'||adminPassword.length<14){db.close();err('FIRST_RUN_ADMIN_PASSWORD_REQUIRED')}
    run('INSERT INTO users VALUES(?,?,?,?,?,?,0)',randomUUID(),'office','Network Office',null,'office',hashed(adminPassword));
  }
  const atomic=fn=>{db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e}};
  const log=(actor,kind,summary,room=null)=>{
    const prev=one('SELECT digest FROM events ORDER BY id DESC LIMIT 1')?.digest||'START',at=new Date().toISOString();
    const value=JSON.stringify({actor,kind,summary,room,at,prev,synthetic:true});
    run('INSERT INTO events(room_id,actor,kind,summary,at,previous_digest,digest) VALUES(?,?,?,?,?,?,?)',room,actor,kind,summary,at,prev,sha(value));
  };
  function visibleRoom(user,id){
    const room=one('SELECT * FROM rooms WHERE id=?',id);
    if(!room)err('ROOM_NOT_FOUND',404);
    if(user.kind!=='office'&&user.org_id!==room.requester_org&&user.org_id!==room.partner_org)err('ROOM_FORBIDDEN',403);
    return room;
  }
  const attempts=new Map();
  function authenticate(req){
    const cookie=String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('sy_r06='))?.slice(7);
    if(!cookie||!/^[A-Za-z0-9_-]{43}$/.test(cookie))err('LOGIN_REQUIRED',401);
    const s=one('SELECT s.*,u.username,u.label,u.org_id,u.kind,u.disabled FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?',sha(cookie));
    if(!s||s.expires<Date.now()||s.disabled)err('LOGIN_REQUIRED',401);
    return s;
  }
  function state(user){
    const rooms=many('SELECT * FROM rooms').filter(r=>user.kind==='office'||user.org_id===r.requester_org||user.org_id===r.partner_org);
    const seen=new Set(rooms.filter(r=>user.kind==='office'||user.org_id===r.requester_org||(user.org_id===r.partner_org&&r.accepted)).map(x=>x.id));
    return {mode:'LOCAL_PILOT_NOT_ADMITTED',
      actor:{id:user.id,username:user.username,label:user.label,kind:user.kind,org_id:user.org_id},
      orgs:user.kind==='office'?many('SELECT id,name FROM orgs'):many('SELECT id,name FROM orgs WHERE id=?',user.org_id||''),
      rooms,requests:many('SELECT * FROM requests ORDER BY rowid DESC').filter(r=>seen.has(r.room_id)),
      events:many('SELECT id,room_id,actor,kind,summary,at FROM events ORDER BY id DESC LIMIT 100').filter(e=>user.kind==='office'||seen.has(e.room_id)),
      connections:[{name:'DigitalMe / BNR',state:'Not connected'},{name:'Warden',state:'Not connected'},{name:'RiverOS',state:'Not connected'},{name:'ERP / Tally',state:'Not connected'}]};
  }
  const assets=new Map([
    ['/',['public/index.html','text/html; charset=utf-8']],
    ['/app.js',['public/app.js','text/javascript; charset=utf-8']],
    ['/styles.css',['../synnergyze-workspace-r05/public/styles.css','text/css; charset=utf-8']]
  ]);
  const server=createServer(async(req,res)=>{
    const send=(status,data,extra={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});res.end(JSON.stringify(data))};
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'");
    try{
      const host=String(req.headers.host||'');if(!/^127\.0\.0\.1:\d+$/.test(host))err('LOCAL_ONLY',403);
      if(req.headers.origin&&req.headers.origin!=='http://'+host)err('ORIGIN_DENIED',403);
      const url=new URL(req.url,'http://127.0.0.1');
      if(req.method==='GET'&&assets.has(url.pathname)){
        const [path,type]=assets.get(url.pathname);res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(readFileSync(resolve(ROOT,path)));return;
      }
      if(!url.pathname.startsWith('/api/'))err('NOT_FOUND',404);
      let data={};
      if(req.method==='POST'){
        if(!String(req.headers['content-type']||'').startsWith('application/json'))err('JSON_REQUIRED');
        let raw='';for await(const c of req){raw+=c.toString();if(raw.length>8192)err('BODY_TOO_LARGE',413)}
        try{data=JSON.parse(raw)}catch{err('INVALID_JSON')}
        if(!data||Array.isArray(data)||typeof data!=='object')err('INVALID_JSON');
      }
      if(req.method==='POST'&&url.pathname==='/api/login'){
        const addr=req.socket.remoteAddress||'localhost',bad=attempts.get(addr)||{count:0,until:Date.now()+60000};
        if(bad.until<Date.now()){bad.count=0;bad.until=Date.now()+60000}
        if(bad.count>=10)err('TOO_MANY_ATTEMPTS',429);
        const user=one('SELECT * FROM users WHERE username=?',norm(data.username));
        const fake='0'.repeat(32)+':'+'0'.repeat(128);
        if(typeof data.password!=='string'||!check(data.password,user?.password_hash||fake)||user?.disabled){
          bad.count++;attempts.set(addr,bad);err('INVALID_LOGIN',401);
        }
        attempts.delete(addr);const secret=token(),csrf=token();
        atomic(()=>{run('DELETE FROM sessions WHERE expires<?',Date.now());
          run('INSERT INTO sessions VALUES(?,?,?,?)',sha(secret),user.id,sha(csrf),Date.now()+12*3600*1000);log(user.id,'SIGNED_IN','Local session')});
        send(200,{ok:true,csrf,actor:{kind:user.kind,label:user.label}},{'Set-Cookie':'sy_r06='+secret+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200'});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/join'){
        if(!valid(data.invitation,90)||!valid(data.username,60)||!valid(data.label,120)||typeof data.password!=='string'||data.password.length<12)err('JOIN_DETAILS_REQUIRED');
        if(!/^[a-z0-9._-]{3,60}$/.test(norm(data.username)))err('USERNAME_INVALID');
        const invitation=one('SELECT * FROM invitations WHERE token_hash=?',sha(data.invitation));
        if(!invitation||invitation.used||invitation.expires<=Date.now())err('INVALID_INVITATION',403);
        atomic(()=>{const uid=randomUUID();
          run('INSERT INTO users VALUES(?,?,?,?,?,?,0)',uid,norm(data.username),data.label.trim(),invitation.org_id,'member',hashed(data.password));
          run('UPDATE invitations SET used=1 WHERE token_hash=?',invitation.token_hash);log(uid,'MEMBER_JOINED','Local invitation accepted')});
        send(200,{ok:true});return;
      }
      const session=authenticate(req),user={id:session.user_id,username:session.username,label:session.label,org_id:session.org_id,kind:session.kind};
      if(req.method==='GET'&&url.pathname==='/api/session'){
        const csrf=token();run('UPDATE sessions SET csrf_hash=? WHERE token_hash=?',sha(csrf),session.token_hash);
        send(200,{ok:true,csrf,actor:user});return;
      }
      if(req.method==='GET'&&url.pathname==='/api/state'){send(200,state(user));return}
      if(req.method!=='POST')err('METHOD_NOT_ALLOWED',405);
      if(!valid(req.headers['x-csrf'],90)||sha(req.headers['x-csrf'])!==session.csrf_hash)err('CSRF_DENIED',403);
      if(url.pathname==='/api/logout'){
        run('DELETE FROM sessions WHERE token_hash=?',session.token_hash);
        send(200,{ok:true},{'Set-Cookie':'sy_r06=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});return;
      }
      let result;
      if(url.pathname==='/api/office/orgs'){
        if(user.kind!=='office')err('OFFICE_ONLY',403);
        if(!valid(data.name,100))err('NAME_REQUIRED');
        result=atomic(()=>{const id=randomUUID();run('INSERT INTO orgs VALUES(?,?)',id,data.name.trim());log(user.id,'ORG_CREATED','Organisation created');return{id,name:data.name.trim()}});
      }else if(url.pathname==='/api/office/invitations'){
        if(user.kind!=='office')err('OFFICE_ONLY',403);
        if(!valid(data.org_id,100)||!one('SELECT id FROM orgs WHERE id=?',data.org_id))err('ORG_REQUIRED');
        const secret=token();
        atomic(()=>{run('INSERT INTO invitations VALUES(?,?,?,0)',sha(secret),data.org_id,Date.now()+86400000);
          log(user.id,'INVITATION_CREATED','One-time local invite')});
        result={invitation:secret,expiresInHours:24,note:'Copy privately. No message has been sent.'};
      }else if(url.pathname==='/api/office/rooms'){
        if(user.kind!=='office')err('OFFICE_ONLY',403);
        if(!valid(data.title,120)||!valid(data.requester_org,100)||!valid(data.partner_org,100)||data.requester_org===data.partner_org)err('ROOM_DETAILS_REQUIRED');
        if(!one('SELECT id FROM orgs WHERE id=?',data.requester_org)||!one('SELECT id FROM orgs WHERE id=?',data.partner_org))err('ORG_REQUIRED');
        result=atomic(()=>{const id=randomUUID();run('INSERT INTO rooms VALUES(?,?,?,?,0)',id,data.title.trim(),data.requester_org,data.partner_org);
          log(user.id,'ROOM_CREATED','Shared workroom created',id);return{id,title:data.title.trim()}});
      }else{
        const rm=url.pathname.match(/^\/api\/rooms\/([^/]+)\/(join|requests)$/);
        const action=url.pathname.match(/^\/api\/requests\/([^/]+)\/(accept|decline|approve|complete)$/);
        if(rm){
          const room=visibleRoom(user,rm[1]);
          if(rm[2]==='join'){
            if(user.kind==='office'||user.org_id!==room.partner_org)err('PARTNER_ONLY',403);
            if(room.accepted)err('ALREADY_JOINED');
            result=atomic(()=>{run('UPDATE rooms SET accepted=1 WHERE id=?',room.id);log(user.id,'PARTNER_JOINED','Partner joined',room.id);return{ok:true}});
          }else{
            if(user.kind==='office'||user.org_id!==room.requester_org||!room.accepted)err('REQUESTER_ONLY',403);
            if(!valid(data.title,120)||!valid(data.details,800)||!valid(data.key,100))err('REQUEST_REQUIRED');
            const existing=one('SELECT * FROM requests WHERE room_id=? AND creator=? AND request_key=?',room.id,user.id,data.key);
            if(existing){if(existing.title!==data.title.trim()||existing.details!==data.details.trim())err('REPLAY_CONFLICT');result=existing}
            else result=atomic(()=>{const id=randomUUID(),at=new Date().toISOString();
              run('INSERT INTO requests VALUES(?,?,?,?,?,?,?,?,?)',id,room.id,data.title.trim(),data.details.trim(),data.key,user.id,'AWAITING_PARTNER',at,at);
              log(user.id,'REQUEST_CREATED','Work requested',room.id);return{id,status:'AWAITING_PARTNER'}});
          }
        }else if(action){
          const entry=one('SELECT * FROM requests WHERE id=?',action[1]);if(!entry)err('REQUEST_NOT_FOUND',404);
          const room=visibleRoom(user,entry.room_id),type=action[2];
          const before={accept:'AWAITING_PARTNER',decline:'AWAITING_PARTNER',approve:'AWAITING_OFFICE',complete:'IN_PROGRESS'}[type];
          const after={accept:'AWAITING_OFFICE',decline:'DECLINED',approve:'IN_PROGRESS',complete:'COMPLETED'}[type];
          if(entry.status!==before)err('WORK_STATE_CONFLICT');
          if(type==='approve'){if(user.kind!=='office')err('OFFICE_ONLY',403)}
          else if(!room.accepted||user.kind==='office'||user.org_id!==room.partner_org)err('PARTNER_ONLY',403);
          result=atomic(()=>{run('UPDATE requests SET status=?,updated_at=? WHERE id=?',after,new Date().toISOString(),entry.id);
            log(user.id,'REQUEST_'+type.toUpperCase(),'Work '+type,room.id);return{id:entry.id,status:after}});
        }else err('NOT_FOUND',404);
      }
      send(200,{ok:true,result,externalEffects:false});
    }catch(e){const code=e.message?.includes('UNIQUE constraint')?'CONFLICT':(e.status?e.message:'SERVER_ERROR');
      send(e.status??(code==='CONFLICT'?409:500),{ok:false,error:code})}
  });
  let closed=false;
  return {server,db,file:resolved,async start(port=0){if(closed)err('APP_ALREADY_CLOSED');await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});return 'http://127.0.0.1:'+server.address().port},
    async close(){if(closed)return;closed=true;if(server.listening)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));db.close()}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.env.SYNNERGYZE_MEMBER_PILOT!=='1'){console.error('Not started: SYNNERGYZE_MEMBER_PILOT=1 required');process.exitCode=1}
  else{const app=createMemberApp({file:process.env.SYNNERGYZE_DB_FILE,adminPassword:process.env.SYNNERGYZE_ADMIN_PASSWORD});
    const address=await app.start(Number(process.env.SYNNERGYZE_PORT||4178));
    console.log('Synnergyze local members pilot:',address,'| database:',app.file,'| external effects: disabled')}
}