const el=id=>document.getElementById(id);
const clean=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const langOptions={
  en:{subtitle:'A shared place to get work done',warning:'LOCAL MEMBERS PILOT — Not identity-verified. No real finance, ERP or Warden execution.',language:'Language',logout:'Sign out',signin:'Sign in',join:'Use invitation',welcomeLogin:'Welcome to your workspace',loginHelp:'Sign in to see the work your organisation is part of.',user:'Username',pass:'Password',joinTitle:'Join a workroom',joinHelp:'Enter a code provided by the office. Invitations are not sent automatically.',inviteCode:'Invitation code',chooseUser:'Choose a username',yourName:'Your name',newPassword:'Choose a password (12+ characters)',joinButton:'Create local account',office:'OFFICE CONTROL PANEL',member:'BUSINESS WORKSPACE',hello:'Your shared work',help:'See requests, partner responses and what needs to happen next.',addOrg:'Add an organisation',orgName:'Organisation name',createOrg:'Add organisation',inviteTitle:'Invite a member',org:'Organisation',inviteBtn:'Create invitation code',createRoom:'Create a shared workroom',roomName:'Workroom name',requester:'Requesting business',partner:'Working partner',roomButton:'Create workroom',rooms:'Workrooms and requests',connections:'Connections',footnote:'Records are local to this computer. Accounts here are not legally verified.',notConnected:'Not connected',joinRoom:'Join this workroom',waitingJoin:'Waiting for partner',joined:'Partner joined',newRequest:'New work request',workTitle:'What needs to be done?',workDetails:'Describe the work',send:'Send request',awaitPartner:'Waiting for partner',awaitOffice:'Waiting for office',progress:'Work in progress',complete:'Completed',declined:'Declined',accept:'Accept request',decline:'Decline',approve:'Approve work',markComplete:'Mark completed',signedIn:'Signed in as',noRooms:'No workrooms yet. Ask the office to create one.',noRequests:'No requests yet.',retry:'Please try again.',saved:'Saved',copied:'Copy code now and send privately. It is shown once.',joinSuccess:'Account created. Sign in to continue.',expired:'Access denied or session expired. Sign in again.',notice:'SAMPLE DATA — No payment, Tally or other external effect.'},
  hi:{subtitle:'मिलकर काम करने की जगह',warning:'स्थानीय सदस्य परीक्षण — पहचान सत्यापित नहीं है। भुगतान, ERP या Warden से वास्तविक कनेक्शन नहीं।',language:'भाषा',logout:'साइन आउट',signin:'साइन इन',join:'निमंत्रण से जुड़ें',welcomeLogin:'अपने कार्यक्षेत्र में आपका स्वागत है',loginHelp:'अपनी संस्था का काम देखने के लिए साइन इन करें।',user:'उपयोगकर्ता नाम',pass:'पासवर्ड',joinTitle:'कार्यस्थल से जुड़ें',joinHelp:'कार्यालय से मिला कोड दर्ज करें। निमंत्रण अपने-आप नहीं भेजा जाता।',inviteCode:'निमंत्रण कोड',chooseUser:'उपयोगकर्ता नाम चुनें',yourName:'आपका नाम',newPassword:'पासवर्ड बनाएँ (कम से कम 12 अक्षर)',joinButton:'स्थानीय खाता बनाएँ',office:'कार्यालय नियंत्रण पैनल',member:'व्यवसाय कार्यक्षेत्र',hello:'आपका साझा काम',help:'अनुरोध, पार्टनर की प्रतिक्रिया और अगले कदम देखें।',addOrg:'संस्था जोड़ें',orgName:'संस्था का नाम',createOrg:'संस्था जोड़ें',inviteTitle:'सदस्य को आमंत्रित करें',org:'संस्था',inviteBtn:'निमंत्रण कोड बनाएँ',createRoom:'साझा कार्यस्थल बनाएँ',roomName:'कार्यस्थल का नाम',requester:'अनुरोध करने वाला व्यवसाय',partner:'काम करने वाला पार्टनर',roomButton:'कार्यस्थल बनाएँ',rooms:'कार्यस्थल और अनुरोध',connections:'कनेक्शन',footnote:'रिकॉर्ड इस कंप्यूटर पर रहते हैं। यहाँ पहचान की कानूनी पुष्टि नहीं होती।',notConnected:'कनेक्ट नहीं है',joinRoom:'इस कार्यस्थल से जुड़ें',waitingJoin:'पार्टनर का इंतज़ार',joined:'पार्टनर जुड़ गया',newRequest:'नया काम भेजें',workTitle:'क्या काम करना है?',workDetails:'काम का विवरण',send:'अनुरोध भेजें',awaitPartner:'पार्टनर का जवाब बाकी',awaitOffice:'कार्यालय की मंज़ूरी बाकी',progress:'काम चल रहा है',complete:'पूरा हुआ',declined:'अस्वीकृत',accept:'स्वीकार करें',decline:'अस्वीकार करें',approve:'काम मंज़ूर करें',markComplete:'पूरा हुआ',signedIn:'साइन इन',noRooms:'कोई कार्यस्थल नहीं है। कार्यालय से बनवाएँ।',noRequests:'अभी कोई अनुरोध नहीं।',retry:'फिर कोशिश करें।',saved:'सहेजा गया',copied:'कोड अभी कॉपी करें और निजी रूप से भेजें। यह एक बार दिखता है।',joinSuccess:'खाता बन गया। साइन इन करें।',expired:'पहुँच बंद या सत्र खत्म हुआ। दोबारा साइन इन करें।',notice:'नमूना रिकॉर्ड — कोई वास्तविक भुगतान या Tally प्रविष्टि नहीं।'},
  kn:{subtitle:'ಒಟ್ಟಾಗಿ ಕೆಲಸ ಮಾಡುವ ಸ್ಥಳ',warning:'ಸ್ಥಳೀಯ ಸದಸ್ಯರ ಮಾದರಿ — ಗುರುತು ಪರಿಶೀಲಿಸಿಲ್ಲ. ನೈಜ ಪಾವತಿ, ERP ಅಥವಾ Warden ಸಂಪರ್ಕ ಇಲ್ಲ.',language:'ಭಾಷೆ',logout:'ಹೊರಬನ್ನಿ',signin:'ಪ್ರವೇಶಿಸಿ',join:'ಆಹ್ವಾನದ ಮೂಲಕ ಸೇರಿ',welcomeLogin:'ನಿಮ್ಮ ಕೆಲಸದ ಸ್ಥಳಕ್ಕೆ ಸ್ವಾಗತ',loginHelp:'ನಿಮ್ಮ ಸಂಸ್ಥೆಯ ಕೆಲಸ ನೋಡಲು ಪ್ರವೇಶಿಸಿ.',user:'ಬಳಕೆದಾರ ಹೆಸರು',pass:'ಗುಪ್ತಪದ',joinTitle:'ಕೆಲಸದ ಸ್ಥಳಕ್ಕೆ ಸೇರಿ',joinHelp:'ಕಚೇರಿ ನೀಡಿದ ಆಹ್ವಾನ ಕೋಡ್ ನಮೂದಿಸಿ. ಆಹ್ವಾನ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಕಳುಹಿಸುವುದಿಲ್ಲ.',inviteCode:'ಆಹ್ವಾನ ಕೋಡ್',chooseUser:'ಬಳಕೆದಾರ ಹೆಸರು ಆರಿಸಿ',yourName:'ನಿಮ್ಮ ಹೆಸರು',newPassword:'ಗುಪ್ತಪದ ರಚಿಸಿ (ಕನಿಷ್ಠ 12 ಅಕ್ಷರ)',joinButton:'ಸ್ಥಳೀಯ ಖಾತೆ ರಚಿಸಿ',office:'ಕಚೇರಿ ನಿಯಂತ್ರಣ ಫಲಕ',member:'ವ್ಯಾಪಾರ ಕೆಲಸದ ಸ್ಥಳ',hello:'ನಿಮ್ಮ ಹಂಚಿಕೆಯ ಕೆಲಸ',help:'ವಿನಂತಿಗಳು, ಪಾಲುದಾರರ ಪ್ರತಿಕ್ರಿಯೆ ಮತ್ತು ಮುಂದಿನ ಹಂತಗಳನ್ನು ನೋಡಿ.',addOrg:'ಸಂಸ್ಥೆಯನ್ನು ಸೇರಿಸಿ',orgName:'ಸಂಸ್ಥೆಯ ಹೆಸರು',createOrg:'ಸಂಸ್ಥೆ ಸೇರಿಸಿ',inviteTitle:'ಸದಸ್ಯರಿಗೆ ಆಹ್ವಾನ',org:'ಸಂಸ್ಥೆ',inviteBtn:'ಆಹ್ವಾನ ಕೋಡ್ ರಚಿಸಿ',createRoom:'ಹಂಚಿಕೆಯ ಕೆಲಸದ ಸ್ಥಳ ರಚಿಸಿ',roomName:'ಕೆಲಸದ ಸ್ಥಳದ ಹೆಸರು',requester:'ವಿನಂತಿಸುವ ವ್ಯಾಪಾರ',partner:'ಕೆಲಸ ಮಾಡುವ ಪಾಲುದಾರ',roomButton:'ಕೆಲಸದ ಸ್ಥಳ ರಚಿಸಿ',rooms:'ಕೆಲಸದ ಸ್ಥಳಗಳು ಮತ್ತು ವಿನಂತಿಗಳು',connections:'ಸಂಪರ್ಕಗಳು',footnote:'ದಾಖಲೆಗಳು ಈ ಕಂಪ್ಯೂಟರ್‌ನಲ್ಲಿವೆ. ಇಲ್ಲಿ ಕಾನೂನು ಗುರುತು ಪರಿಶೀಲನೆ ಇಲ್ಲ.',notConnected:'ಸಂಪರ್ಕಗೊಂಡಿಲ್ಲ',joinRoom:'ಈ ಕೆಲಸದ ಸ್ಥಳಕ್ಕೆ ಸೇರಿ',waitingJoin:'ಪಾಲುದಾರರಿಗಾಗಿ ಕಾಯುತ್ತಿದೆ',joined:'ಪಾಲುದಾರರು ಸೇರಿದ್ದಾರೆ',newRequest:'ಹೊಸ ಕೆಲಸದ ವಿನಂತಿ',workTitle:'ಯಾವ ಕೆಲಸ ಬೇಕು?',workDetails:'ಕೆಲಸದ ವಿವರ',send:'ವಿನಂತಿ ಕಳುಹಿಸಿ',awaitPartner:'ಪಾಲುದಾರರ ಉತ್ತರ ಬಾಕಿ',awaitOffice:'ಕಚೇರಿ ಅನುಮೋದನೆ ಬಾಕಿ',progress:'ಕೆಲಸ ಪ್ರಗತಿಯಲ್ಲಿದೆ',complete:'ಪೂರ್ಣಗೊಂಡಿದೆ',declined:'ನಿರಾಕರಿಸಲಾಗಿದೆ',accept:'ಸ್ವೀಕರಿಸಿ',decline:'ನಿರಾಕರಿಸಿ',approve:'ಕೆಲಸ ಅನುಮೋದಿಸಿ',markComplete:'ಪೂರ್ಣಗೊಂಡಿದೆ',signedIn:'ಪ್ರವೇಶಿಸಿದವರು',noRooms:'ಇನ್ನೂ ಕೆಲಸದ ಸ್ಥಳಗಳಿಲ್ಲ. ಕಚೇರಿಯನ್ನು ಸಂಪರ್ಕಿಸಿ.',noRequests:'ಇನ್ನೂ ವಿನಂತಿಗಳಿಲ್ಲ.',retry:'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',saved:'ಉಳಿಸಲಾಗಿದೆ',copied:'ಈ ಕೋಡ್ ನಕಲಿಸಿ ಖಾಸಗಿಯಾಗಿ ಕಳುಹಿಸಿ. ಒಮ್ಮೆ ಮಾತ್ರ ಕಾಣುತ್ತದೆ.',joinSuccess:'ಖಾತೆ ರಚಿಸಲಾಗಿದೆ. ಈಗ ಪ್ರವೇಶಿಸಿ.',expired:'ಪ್ರವೇಶ ನಿರಾಕರಿಸಲಾಗಿದೆ ಅಥವಾ ಅವಧಿ ಮುಗಿದಿದೆ. ಮತ್ತೆ ಪ್ರವೇಶಿಸಿ.',notice:'ಮಾದರಿ ಮಾಹಿತಿ — ನೈಜ ಪಾವತಿ ಅಥವಾ Tally ದಾಖಲಾತಿ ಇಲ್ಲ.'}
};
let language=localStorage.getItem('sy-r06-language')||'en';if(!langOptions[language])language='en';
let csrf='',snapshot=null;
const t=k=>langOptions[language]?.[k]||langOptions.en[k]||k;
const status=s=>t(({AWAITING_PARTNER:'awaitPartner',AWAITING_OFFICE:'awaitOffice',IN_PROGRESS:'progress',COMPLETED:'complete',DECLINED:'declined'})[s]||'waitingJoin');
function inform(text,failed=false){const e=el('message');e.textContent=text;e.classList.remove('hidden');e.style.background=failed?'#ffedea':'#eff8f8';e.style.color=failed?'#8b2d27':'#205b66';}
function showLogin(){el('auth').classList.remove('hidden');el('workspace').classList.add('hidden');el('logout').classList.add('hidden')}
function showWorkspace(){el('auth').classList.add('hidden');el('workspace').classList.remove('hidden');el('logout').classList.remove('hidden')}
function translate(){
 document.documentElement.lang=language;el('lang').value=language;
 const map={'subtitle':'subtitle','warning':'warning','language-label':'language','logout':'logout','show-login':'signin','show-join':'join','login-title':'welcomeLogin','login-help':'loginHelp','username-label':'user','password-label':'pass','login-button':'signin','join-title':'joinTitle','join-help':'joinHelp','invite-label':'inviteCode','new-user-label':'chooseUser','your-name-label':'yourName','new-password-label':'newPassword','join-button':'joinButton','org-title':'addOrg','org-label':'orgName','org-create':'createOrg','invite-title':'inviteTitle','invite-org-label':'org','invite-create':'inviteBtn','room-title':'createRoom','room-name-label':'roomName','requester-label':'requester','partner-label':'partner','room-create':'roomButton','work-title':'rooms','connections-title':'connections','footnote':'footnote'};
 for(const [id,key] of Object.entries(map))el(id).textContent=t(key);
 if(snapshot)render();
}
async function api(path,method='GET',body){
 const opts={method,headers:{}};
 if(method==='POST'){opts.headers['content-type']='application/json';if(csrf)opts.headers['x-csrf']=csrf;opts.body=JSON.stringify(body||{})}
 const r=await fetch(path,opts);const d=await r.json();
 if(!r.ok)throw new Error(d.error||t('retry'));
 return d;
}
async function refresh(){
 try{const s=await api('/api/session');csrf=s.csrf;snapshot=await api('/api/state');showWorkspace();render()}
 catch{csrf='';snapshot=null;showLogin()}
}
function options(items){return '<option value="">—</option>'+items.map(x=>'<option value="'+clean(x.id)+'">'+clean(x.name)+'</option>').join('');}
function setOptions(){const list=snapshot.orgs||[];for(const id of ['invite-org','requester-org','partner-org'])el(id).innerHTML=options(list)}
function btn(label,action,id,style='secondary'){return '<button type="button" data-action="'+clean(action)+'" data-id="'+clean(id)+'" class="'+style+'">'+clean(label)+'</button>'}
function render(){
 if(!snapshot)return;
 const u=snapshot.actor;el('audience').textContent=t(u.kind==='office'?'office':'member');
 el('hello').textContent=t('hello')+' — '+u.label;el('welcome').textContent=t('help');
 el('office-tools').classList.toggle('hidden',u.kind!=='office');setOptions();
 const html=(snapshot.rooms||[]).map(room=>{
   const isPartner=u.org_id===room.partner_org, isRequester=u.org_id===room.requester_org,isOffice=u.kind==='office';
   const records=snapshot.requests.filter(r=>r.room_id===room.id);
   const statusLabel=room.accepted?t('joined'):t('waitingJoin');
   const join=!room.accepted&&isPartner?btn(t('joinRoom'),'join',room.id,'primary'):'';
   const requestForm=room.accepted&&isRequester?'<form data-room="'+clean(room.id)+'" class="form-grid" style="margin:14px 0"><label class="field">'+clean(t('workTitle'))+'<input name="title" required maxlength="120"></label><label class="field">'+clean(t('workDetails'))+'<textarea name="details" required maxlength="800"></textarea></label><button type="submit" class="primary">'+clean(t('send'))+'</button></form>':'';
   const cardRows=records.map(r=>{
     let action='';
     if(room.accepted&&isPartner&&r.status==='AWAITING_PARTNER')action=btn(t('accept'),'accept',r.id,'primary')+btn(t('decline'),'decline',r.id);
     if(isOffice&&r.status==='AWAITING_OFFICE')action=btn(t('approve'),'approve',r.id,'primary');
     if(room.accepted&&isPartner&&r.status==='IN_PROGRESS')action=btn(t('markComplete'),'complete',r.id,'primary');
     return '<div class="record"><strong>'+clean(r.title)+'</strong><p>'+clean(r.details)+'</p><span class="stage">'+clean(status(r.status))+'</span> <span class="actions">'+action+'</span></div>';
   }).join('');
   return '<article class="panel"><div class="panel-header"><h2>'+clean(room.title)+'</h2><span class="pill">'+clean(statusLabel)+'</span></div>'+join+requestForm+(cardRows||'<p class="subtle">'+clean(t('noRequests'))+'</p>')+'</article>';
 }).join('');
 el('rooms').innerHTML=html||'<div class="panel">'+clean(t('noRooms'))+'</div>';
 el('connections').innerHTML=snapshot.connections.map(x=>'<div class="panel"><strong>'+clean(x.name)+'</strong><p class="fine">'+clean(t('notConnected'))+'</p></div>').join('');
}
async function act(path,body){try{await api(path,'POST',body);inform(t('saved'));await refresh()}catch(e){inform(e.message,true)}}
el('lang').addEventListener('change',e=>{language=e.target.value;localStorage.setItem('sy-r06-language',language);translate()});
el('show-login').addEventListener('click',()=>{el('login-panel').classList.remove('hidden');el('join-panel').classList.add('hidden');el('show-login').classList.add('active');el('show-join').classList.remove('active')});
el('show-join').addEventListener('click',()=>{el('login-panel').classList.add('hidden');el('join-panel').classList.remove('hidden');el('show-login').classList.remove('active');el('show-join').classList.add('active')});
el('login-form').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);try{await api('/api/login','POST',{username:f.get('username'),password:f.get('password')});el('message').classList.add('hidden');await refresh()}catch(x){inform(x.message,true)}});
el('join-form').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);try{await api('/api/join','POST',Object.fromEntries(f));inform(t('joinSuccess'));el('show-login').click()}catch(x){inform(x.message,true)}});
el('logout').addEventListener('click',async()=>{try{await api('/api/logout','POST')}finally{csrf='';snapshot=null;showLogin()}});
el('org-form').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);await act('/api/office/orgs',{name:f.get('name')});e.target.reset()});
el('invite-form').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);try{const d=await api('/api/office/invitations','POST',{org_id:f.get('org_id')});const box=el('invite-result');box.classList.remove('hidden');box.textContent=t('copied')+' '+d.result.invitation;inform(t('saved'))}catch(x){inform(x.message,true)}});
el('room-form').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);await act('/api/office/rooms',Object.fromEntries(f));e.target.reset()});
el('rooms').addEventListener('submit',async e=>{const form=e.target;if(!form.dataset.room)return;e.preventDefault();const f=new FormData(form);await act('/api/rooms/'+encodeURIComponent(form.dataset.room)+'/requests',{title:f.get('title'),details:f.get('details'),key:crypto.randomUUID()})});
el('rooms').addEventListener('click',async e=>{const target=e.target.closest('[data-action]');if(!target)return;const {action,id}=target.dataset;
 if(action==='join')await act('/api/rooms/'+encodeURIComponent(id)+'/join');
 else await act('/api/requests/'+encodeURIComponent(id)+'/'+action);
});
translate();refresh();