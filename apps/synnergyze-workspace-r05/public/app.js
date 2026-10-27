// Synnergyze R0.5 local prototype. Demo actors are NOT authenticated identities.
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const translations = {
 en: {
  demo:'LOCAL DEMO — Sample people and sample records. No real customer accounts, payments or accounting connections.',
  tagline:'work together',sidebar:'YOUR WORKSPACE',safe:'A safe place to try it',safeDesc:'This example saves on your own computer. Nothing here is sent to an ERP or a bank.',
  language:'Language',viewAs:'Viewing as',overview:'Overview',requests:'Work requests',connections:'Connections',activity:'Activity',office:'Office panel',
  hi:'Welcome back',overviewTitle:'Good work happens together.',overviewSub:'A single place to work with another business, track decisions and know what happens next — without changing your existing software.',
  create:'New work request',workroom:'Shared workroom',pending:'Waiting for partner',joined:'Partner joined',acceptInvite:'Join this workroom',
  open:'Needs attention',progress:'In progress',done:'Completed',recent:'Recent work requests',latest:'Latest activity',all:'See all requests',noRequests:'Nothing here yet. Create a work request to get started.',
  number:'Reference',subject:'Work',state:'Status',date:'Created',next:'Next action',none:'No recent activity yet.',
  newTitle:'Start a work request',newDesc:'Explain what you need. Your partner can accept it before the office releases work for this sample.',
  what:'What do you need done?',detail:'Describe the work',tip:'Keep it clear: what, where, and when. Do not enter real customer information.',
  submit:'Send request',cancel:'Cancel',detailsPlaceholder:'For example: Prepare 50 sample display units',descriptionPlaceholder:'Describe the expected result, delivery date and important notes.',
  accept:'Accept request',decline:'Decline',approve:'Approve for work',complete:'Mark completed',awaitPartner:'Waiting for partner',awaitOffice:'Waiting for office',inProgress:'Work underway',completed:'Completed',declined:'Declined',
  workroomDesc:'Business A and Business B share this sample room. Each person sees only the actions assigned to their role.',
  invitedDesc:'Business A invited you to this workroom. Join to start receiving work requests.',officeTitle:'Office control panel',officeSub:'Review agreed work, follow up on pending decisions and see what was recorded in this sample.',
  waitingApproval:'Waiting for office approval',requestsAll:'All work requests',connectionsTitle:'System connections',connectionsSub:'These connections show what is available in this demonstration. No real business system is connected.',
  notConnected:'Sample only',network:'Network status',roleOffice:'Office',roleRequester:'Business A',rolePartner:'Business B',roleHint:'Role switcher is for demonstration only — it is not sign-in.',
  activityTitle:'Activity history',activitySub:'A sample activity record is saved with the workroom. It is not a signed RiverOS receipt.',
  events:'Recorded steps',partner:'Partner',requester:'Requester',created:'Created',error:'Could not complete that action',saved:'Saved successfully',
  controlLink:'Open office panel',readOnly:'Office approval required',notAvailable:'Not available to this role',startNow:'Get started',
  requestsDesc:'See what has been requested, agreed and completed. Changes are saved on this computer.',
  emptyOffice:'Nothing requires approval right now.',financeNote:'Finance, banking and Tally posting are disabled in this demonstration.',
  sample:'SAMPLE DATA',quickGuide:'How this works',guide1:'Business A sends a work request.',guide2:'Business B accepts or declines.',guide3:'The office reviews the accepted work.',guide4:'Business B completes it; everyone sees the update.',
  workrooms:'Workroom',labelBusiness:'Business workspace',labelOffice:'Office operations',full:'Showing sample work and sample people only.',
  refresh:'Refresh',stateSaved:'Saved on this device',run:'Work in progress',emptyActivity:'No steps recorded yet.',
  contact:'Need help?',visibility:'Role-specific visibility (demo)',statusLabel:'Connection status'
 },
 hi: {
  demo:'स्थानीय डेमो — सभी लोग और रिकॉर्ड नमूने हैं। असली खाते, भुगतान या अकाउंटिंग कनेक्शन नहीं हैं।',
  tagline:'मिलकर काम करें',sidebar:'आपका कार्यक्षेत्र',safe:'सुरक्षित तरीके से आज़माएँ',safeDesc:'यह उदाहरण आपके कंप्यूटर पर सेव होता है। ERP या बैंक में कुछ नहीं भेजा जाता।',
  language:'भाषा',viewAs:'किसकी भूमिका',overview:'सारांश',requests:'काम के अनुरोध',connections:'कनेक्शन',activity:'गतिविधि',office:'कार्यालय पैनल',
  hi:'वापसी पर स्वागत है',overviewTitle:'मिलकर काम करना आसान बनाएँ।',overviewSub:'दूसरे व्यवसाय के साथ काम करें, फैसले देखें और अगले कदम जानें — बिना अपना मौजूदा सॉफ़्टवेयर बदले।',
  create:'नया काम भेजें',workroom:'साझा कार्यक्षेत्र',pending:'पार्टनर का इंतज़ार',joined:'पार्टनर जुड़ गया',acceptInvite:'इस कार्यक्षेत्र से जुड़ें',
  open:'ध्यान देने की ज़रूरत',progress:'काम चल रहा है',done:'पूरा हुआ',recent:'हाल के अनुरोध',latest:'हाल की गतिविधि',all:'सभी अनुरोध देखें',noRequests:'अभी कोई अनुरोध नहीं है। नया अनुरोध बनाएँ।',
  number:'नंबर',subject:'काम',state:'स्थिति',date:'तारीख',next:'अगला कदम',none:'अभी कोई गतिविधि नहीं है।',
  newTitle:'नया काम बताएँ',newDesc:'अपनी ज़रूरत लिखें। आपका पार्टनर इसे स्वीकार करेगा और कार्यालय समीक्षा करेगा।',
  what:'क्या काम करवाना है?',detail:'काम का विवरण',tip:'क्या, कहाँ और कब — स्पष्ट लिखें। असली ग्राहक की जानकारी न डालें।',
  submit:'अनुरोध भेजें',cancel:'रद्द करें',detailsPlaceholder:'जैसे: 50 नमूना डिस्प्ले यूनिट तैयार करें',descriptionPlaceholder:'ज़रूरी परिणाम, तारीख और निर्देश लिखें।',
  accept:'स्वीकार करें',decline:'अस्वीकार करें',approve:'काम की मंज़ूरी दें',complete:'काम पूरा हुआ',awaitPartner:'पार्टनर का जवाब बाकी',awaitOffice:'कार्यालय की मंज़ूरी बाकी',inProgress:'काम चल रहा है',completed:'पूरा हुआ',declined:'अस्वीकृत',
  workroomDesc:'इस नमूना कार्यक्षेत्र में दो व्यवसाय काम करते हैं। हर भूमिका को अपना काम दिखता है।',
  invitedDesc:'व्यवसाय A ने आपको आमंत्रित किया है। अनुरोध पाने के लिए जुड़ें।',officeTitle:'कार्यालय नियंत्रण पैनल',officeSub:'मंज़ूरी, लंबित फैसले और गतिविधि यहाँ देखें।',
  waitingApproval:'कार्यालय की मंज़ूरी बाकी',requestsAll:'सभी काम के अनुरोध',connectionsTitle:'सिस्टम कनेक्शन',connectionsSub:'यह केवल नमूना है। कोई वास्तविक व्यवसायिक सिस्टम जुड़ा नहीं है।',
  notConnected:'केवल नमूना',network:'नेटवर्क स्थिति',roleOffice:'कार्यालय',roleRequester:'व्यवसाय A',rolePartner:'व्यवसाय B',roleHint:'भूमिका बदलना डेमो के लिए है, असली लॉगिन नहीं।',
  activityTitle:'गतिविधि का रिकॉर्ड',activitySub:'नमूना रिकॉर्ड कंप्यूटर पर सेव है। यह RiverOS की हस्ताक्षरित रसीद नहीं है।',
  events:'दर्ज कदम',partner:'पार्टनर',requester:'अनुरोधकर्ता',created:'बनाया गया',error:'यह काम पूरा नहीं हो सका',saved:'सफलतापूर्वक सेव हुआ',
  controlLink:'कार्यालय पैनल',readOnly:'कार्यालय की मंज़ूरी चाहिए',notAvailable:'इस भूमिका में उपलब्ध नहीं',startNow:'शुरू करें',
  requestsDesc:'कौन सा काम माँगा गया, स्वीकार हुआ या पूरा हुआ — सब देखें।',
  emptyOffice:'अभी मंज़ूरी के लिए कोई काम नहीं है।',financeNote:'इस डेमो में बैंक, Tally और भुगतान बंद हैं।',
  sample:'नमूना डेटा',quickGuide:'काम कैसे होगा',guide1:'व्यवसाय A अनुरोध भेजता है।',guide2:'व्यवसाय B जवाब देता है।',guide3:'कार्यालय काम की समीक्षा करता है।',guide4:'काम पूरा होने पर सबको स्थिति दिखती है।',
  workrooms:'कार्यस्थान',labelBusiness:'व्यवसाय कार्यक्षेत्र',labelOffice:'कार्यालय संचालन',full:'यहाँ केवल नमूना काम और लोग हैं।',
  refresh:'फिर से लोड करें',stateSaved:'इस डिवाइस पर सेव',run:'काम जारी है',emptyActivity:'अभी कोई रिकॉर्ड नहीं है।',
  contact:'सहायता',visibility:'डेमो में भूमिका के अनुसार दृश्य',statusLabel:'कनेक्शन स्थिति'
 },
 kn: {
  demo:'ಸ್ಥಳೀಯ ಮಾದರಿ — ಇಲ್ಲಿ ವ್ಯಕ್ತಿಗಳು ಮತ್ತು ದಾಖಲೆಗಳು ಮಾದರಿಗಳು ಮಾತ್ರ. ನೈಜ ಖಾತೆ, ಪಾವತಿ ಅಥವಾ ಲೆಕ್ಕಪತ್ರ ಸಂಪರ್ಕ ಇಲ್ಲ.',
  tagline:'ಒಟ್ಟಾಗಿ ಕೆಲಸ ಮಾಡಿ',sidebar:'ನಿಮ್ಮ ಕೆಲಸದ ಸ್ಥಳ',safe:'ಸುರಕ್ಷಿತ ಮಾದರಿ',safeDesc:'ಈ ಉದಾಹರಣೆ ನಿಮ್ಮ ಕಂಪ್ಯೂಟರ್‌ನಲ್ಲೇ ಉಳಿಯುತ್ತದೆ. ERP ಅಥವಾ ಬ್ಯಾಂಕ್‌ಗೆ ಮಾಹಿತಿ ಕಳುಹಿಸುವುದಿಲ್ಲ.',
  language:'ಭಾಷೆ',viewAs:'ಪಾತ್ರ',overview:'ಸಾರಾಂಶ',requests:'ಕೆಲಸದ ವಿನಂತಿಗಳು',connections:'ಸಂಪರ್ಕಗಳು',activity:'ಚಟುವಟಿಕೆ',office:'ಕಚೇರಿ ಫಲಕ',
  hi:'ಮತ್ತೆ ಸ್ವಾಗತ',overviewTitle:'ಒಟ್ಟಾಗಿ ಕೆಲಸ ಮಾಡುವುದು ಸುಲಭ.',overviewSub:'ಇನ್ನೊಂದು ವ್ಯಾಪಾರದೊಂದಿಗೆ ಕೆಲಸ ಮಾಡಿ, ನಿರ್ಧಾರಗಳನ್ನು ನೋಡಿ, ಮುಂದಿನ ಹಂತ ತಿಳಿದುಕೊಳ್ಳಿ — ನಿಮ್ಮ ಪ್ರಸ್ತುತ ಸಾಫ್ಟ್‌ವೇರ್ ಬದಲಿಸದೆ.',
  create:'ಹೊಸ ಕೆಲಸದ ವಿನಂತಿ',workroom:'ಹಂಚಿಕೊಂಡ ಕೆಲಸದ ಸ್ಥಳ',pending:'ಪಾಲುದಾರರಿಗಾಗಿ ಕಾಯುತ್ತಿದೆ',joined:'ಪಾಲುದಾರರು ಸೇರಿದ್ದಾರೆ',acceptInvite:'ಈ ಕೆಲಸದ ಸ್ಥಳಕ್ಕೆ ಸೇರಿ',
  open:'ಗಮನ ಅಗತ್ಯ',progress:'ಕೆಲಸ ನಡೆಯುತ್ತಿದೆ',done:'ಪೂರ್ಣಗೊಂಡಿದೆ',recent:'ಇತ್ತೀಚಿನ ವಿನಂತಿಗಳು',latest:'ಇತ್ತೀಚಿನ ಚಟುವಟಿಕೆ',all:'ಎಲ್ಲಾ ವಿನಂತಿಗಳು',noRequests:'ಇನ್ನೂ ವಿನಂತಿಗಳಿಲ್ಲ. ಹೊಸ ವಿನಂತಿ ರಚಿಸಿ.',
  number:'ಸಂಖ್ಯೆ',subject:'ಕೆಲಸ',state:'ಸ್ಥಿತಿ',date:'ದಿನಾಂಕ',next:'ಮುಂದಿನ ಕ್ರಮ',none:'ಇನ್ನೂ ಚಟುವಟಿಕೆ ಇಲ್ಲ.',
  newTitle:'ಕೆಲಸದ ವಿನಂತಿ ರಚಿಸಿ',newDesc:'ನಿಮಗೆ ಬೇಕಾದ ಕೆಲಸವನ್ನು ವಿವರಿಸಿ. ಪಾಲುದಾರರು ಸ್ವೀಕರಿಸಿದ ನಂತರ ಕಚೇರಿ ಪರಿಶೀಲಿಸುತ್ತದೆ.',
  what:'ಏನು ಕೆಲಸ ಬೇಕು?',detail:'ಕೆಲಸದ ವಿವರ',tip:'ಏನು, ಎಲ್ಲಿ, ಯಾವಾಗ ಎಂಬುದನ್ನು ಸ್ಪಷ್ಟವಾಗಿ ಬರೆಯಿರಿ. ನೈಜ ಗ್ರಾಹಕರ ಮಾಹಿತಿ ನಮೂದಿಸಬೇಡಿ.',
  submit:'ವಿನಂತಿ ಕಳುಹಿಸಿ',cancel:'ರದ್ದು',detailsPlaceholder:'ಉದಾ: 50 ಮಾದರಿ ಪ್ರದರ್ಶನ ಘಟಕಗಳು',descriptionPlaceholder:'ನಿರೀಕ್ಷಿತ ಫಲಿತಾಂಶ, ದಿನಾಂಕ ಮತ್ತು ಸೂಚನೆಗಳನ್ನು ಬರೆಯಿರಿ.',
  accept:'ಸ್ವೀಕರಿಸಿ',decline:'ನಿರಾಕರಿಸಿ',approve:'ಕೆಲಸಕ್ಕೆ ಅನುಮೋದಿಸಿ',complete:'ಪೂರ್ಣಗೊಂಡಿದೆ',awaitPartner:'ಪಾಲುದಾರರ ಉತ್ತರ ಬಾಕಿ',awaitOffice:'ಕಚೇರಿ ಅನುಮೋದನೆ ಬಾಕಿ',inProgress:'ಕೆಲಸ ಪ್ರಗತಿಯಲ್ಲಿದೆ',completed:'ಪೂರ್ಣಗೊಂಡಿದೆ',declined:'ನಿರಾಕರಿಸಲಾಗಿದೆ',
  workroomDesc:'ಈ ಮಾದರಿ ಕೆಲಸದ ಸ್ಥಳದಲ್ಲಿ ಎರಡು ವ್ಯಾಪಾರಗಳು ಕೆಲಸ ಮಾಡುತ್ತವೆ. ಪ್ರತಿ ಪಾತ್ರಕ್ಕೂ ತನ್ನ ಕೆಲಸ ಮಾತ್ರ ಕಾಣಿಸುತ್ತದೆ.',
  invitedDesc:'ವ್ಯಾಪಾರ A ನಿಮ್ಮನ್ನು ಆಹ್ವಾನಿಸಿದೆ. ವಿನಂತಿಗಳನ್ನು ಪಡೆಯಲು ಸೇರಿ.',officeTitle:'ಕಚೇರಿ ನಿಯಂತ್ರಣ ಫಲಕ',officeSub:'ಅನುಮೋದನೆ, ಬಾಕಿ ನಿರ್ಧಾರ ಮತ್ತು ಚಟುವಟಿಕೆ ಇಲ್ಲಿ ಪರಿಶೀಲಿಸಿ.',
  waitingApproval:'ಕಚೇರಿ ಅನುಮೋದನೆ ಬಾಕಿ',requestsAll:'ಎಲ್ಲಾ ಕೆಲಸದ ವಿನಂತಿಗಳು',connectionsTitle:'ವ್ಯವಸ್ಥೆ ಸಂಪರ್ಕಗಳು',connectionsSub:'ಇವು ಮಾದರಿ ಸಂಪರ್ಕಗಳು ಮಾತ್ರ. ನೈಜ ವ್ಯಾಪಾರ ವ್ಯವಸ್ಥೆ ಸಂಪರ್ಕಗೊಂಡಿಲ್ಲ.',
  notConnected:'ಮಾದರಿ ಮಾತ್ರ',network:'ಜಾಲದ ಸ್ಥಿತಿ',roleOffice:'ಕಚೇರಿ',roleRequester:'ವ್ಯಾಪಾರ A',rolePartner:'ವ್ಯಾಪಾರ B',roleHint:'ಪಾತ್ರ ಬದಲಿಸುವುದು ಮಾದರಿಗಾಗಿ ಮಾತ್ರ; ನೈಜ ಲಾಗಿನ್ ಅಲ್ಲ.',
  activityTitle:'ಚಟುವಟಿಕೆ ದಾಖಲೆ',activitySub:'ಮಾದರಿ ಚಟುವಟಿಕೆ ಸ್ಥಳೀಯವಾಗಿ ಉಳಿಯುತ್ತದೆ. ಇದು RiverOS ಸಹಿ ಮಾಡಿದ ರಸೀದಿ ಅಲ್ಲ.',
  events:'ದಾಖಲಾದ ಹಂತಗಳು',partner:'ಪಾಲುದಾರ',requester:'ವಿನಂತಿದಾರ',created:'ರಚಿಸಲಾಗಿದೆ',error:'ಈ ಕ್ರಿಯೆ ಪೂರ್ಣಗೊಳಿಸಲಾಗಲಿಲ್ಲ',saved:'ಯಶಸ್ವಿಯಾಗಿ ಉಳಿಸಲಾಗಿದೆ',
  controlLink:'ಕಚೇರಿ ಫಲಕ',readOnly:'ಕಚೇರಿ ಅನುಮೋದನೆ ಅಗತ್ಯ',notAvailable:'ಈ ಪಾತ್ರಕ್ಕೆ ಲಭ್ಯವಿಲ್ಲ',startNow:'ಪ್ರಾರಂಭಿಸಿ',
  requestsDesc:'ಯಾವ ಕೆಲಸ ಕೇಳಲಾಗಿದೆ, ಒಪ್ಪಲಾಗಿದೆ ಅಥವಾ ಮುಗಿದಿದೆ ಎಂದು ಪರಿಶೀಲಿಸಿ.',
  emptyOffice:'ಈಗ ಅನುಮೋದನೆಗೆ ಕೆಲಸವಿಲ್ಲ.',financeNote:'ಈ ಮಾದರಿಯಲ್ಲಿ ಬ್ಯಾಂಕ್, Tally ಮತ್ತು ಪಾವತಿಗಳು ನಿಷ್ಕ್ರಿಯವಾಗಿವೆ.',
  sample:'ಮಾದರಿ ಮಾಹಿತಿ',quickGuide:'ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ',guide1:'ವ್ಯಾಪಾರ A ಕೆಲಸ ಕೇಳುತ್ತದೆ.',guide2:'ವ್ಯಾಪಾರ B ಪ್ರತಿಕ್ರಿಯಿಸುತ್ತದೆ.',guide3:'ಕಚೇರಿ ಒಪ್ಪಿದ ಕೆಲಸ ಪರಿಶೀಲಿಸುತ್ತದೆ.',guide4:'ಕೆಲಸ ಮುಗಿದ ಬಳಿಕ ಸ್ಥಿತಿ ಎಲ್ಲರಿಗೂ ಕಾಣಿಸುತ್ತದೆ.',
  workrooms:'ಕೆಲಸದ ಸ್ಥಳ',labelBusiness:'ವ್ಯಾಪಾರ ಕೆಲಸದ ಸ್ಥಳ',labelOffice:'ಕಚೇರಿ ಕಾರ್ಯಗಳು',full:'ಮಾದರಿ ಕೆಲಸ ಮತ್ತು ಜನರು ಮಾತ್ರ.',
  refresh:'ಮತ್ತೆ ತೆರೆ',stateSaved:'ಈ ಸಾಧನದಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ',run:'ಕೆಲಸ ನಡೆಯುತ್ತಿದೆ',emptyActivity:'ಇನ್ನೂ ಯಾವುದೇ ದಾಖಲೆಗಳಿಲ್ಲ.',
  contact:'ಸಹಾಯ',visibility:'ಪಾತ್ರಕ್ಕೆ ಅನುಗುಣವಾಗಿ ಪ್ರದರ್ಶನ (ಮಾದರಿ)',statusLabel:'ಸಂಪರ್ಕದ ಸ್ಥಿತಿ'
 }
};
let lang = localStorage.getItem('synnergyze-r05-language') || 'en';
if (!translations[lang]) lang='en';
let actor = new URLSearchParams(location.search).get('role') || (location.pathname==='/control'?'office':localStorage.getItem('synnergyze-r05-role')||'requester');
if (!['requester','partner','office'].includes(actor)) actor='requester';
let page = location.pathname==='/control'?'office':'overview';
let snapshot=null;
let busy=false;
const t=k => translations[lang]?.[k] || translations.en[k] || k;
const pill=(name,kind='')=>'<span class="pill '+kind+'">'+escapeHtml(name)+'</span>';
const statusName=s=>t(({AWAITING_PARTNER:'awaitPartner',AWAITING_OFFICE:'awaitOffice',IN_PROGRESS:'inProgress',COMPLETED:'completed',DECLINED:'declined'})[s]||'pending');
const statusPill=s=>pill(statusName(s), s==='COMPLETED'?'green':s==='IN_PROGRESS'?'blue':s==='DECLINED'?'':'amber');
const dateText=raw=>{if(!raw)return '—';const d=new Date(raw);return isNaN(d.getTime())?'—':d.toLocaleDateString(lang==='kn'?'kn-IN':lang==='hi'?'hi-IN':'en-IN',{day:'numeric',month:'short',year:'numeric'});};
const btn=(title,action,id,kind='secondary')=>'<button class="'+kind+'" type="button" data-action="'+escapeHtml(action)+'" data-id="'+escapeHtml(id||'')+'">'+escapeHtml(title)+'</button>';
function notice(title,desc){return '<div class="notice"><strong>'+escapeHtml(title)+'</strong> '+escapeHtml(desc)+'</div>';}
function setMessage(message,error=false) {const area=$('messages');const element=document.createElement('div');element.className='toast'+(error?' error':'');element.textContent=message;area.append(element);setTimeout(()=>element.remove(),3500);}
function counts() {const all=snapshot?.requests||[];return {open:all.filter(x=>x.status==='AWAITING_PARTNER'||x.status==='AWAITING_OFFICE').length,progress:all.filter(x=>x.status==='IN_PROGRESS').length,done:all.filter(x=>x.status==='COMPLETED').length};}
function navigation(){
 const entries=[['overview','⌂','overview'],['requests','▣','requests'],['connections','◈','connections'],['activity','◷','activity']];
 if(actor==='office')entries.push(['office','▤','office']);
 $('navigation').innerHTML=entries.map(([code,icon,k])=>'<button type="button" class="nav-item'+(page===code?' current':'')+'" data-page="'+code+'"><span class="nav-symbol">'+icon+'</span><span>'+escapeHtml(t(k))+'</span></button>').join('');
 $('top-section').textContent=t(page);$('demo-banner').textContent=t('demo');$('sidebar-label').textContent=t('sidebar');
 $('data-info-title').textContent=t('safe');$('data-info-detail').textContent=t('safeDesc');
 $('language-label').textContent=t('language');$('view-label').textContent=t('viewAs');$('avatar').textContent=actor==='office'?'O':actor==='partner'?'B':'A';
 $('language').value=lang;$('actor').value=actor;document.documentElement.lang=lang;
}
function requestActions(req){
 const available=[];
 if(actor==='partner'&&req.status==='AWAITING_PARTNER') {available.push(btn(t('accept'),'accept',req.id,'primary'));available.push(btn(t('decline'),'decline',req.id));}
 if(actor==='office'&&req.status==='AWAITING_OFFICE')available.push(btn(t('approve'),'approve',req.id,'primary'));
 if(actor==='partner'&&req.status==='IN_PROGRESS')available.push(btn(t('complete'),'complete',req.id,'primary'));
 return available.join('');
}
function requestCard(r){
 return '<article class="req-card"><div class="panel-header" style="margin-bottom:7px"><h3>'+escapeHtml(r.title)+'</h3>'+statusPill(r.status)+'</div>'+
 '<div class="muted">'+escapeHtml(r.id)+' · '+escapeHtml(dateText(r.createdAt))+'</div><p style="margin-top:13px">'+escapeHtml(r.details)+'</p>'+
 '<div class="req-foot"><span class="muted">'+escapeHtml(t('sample'))+' · '+escapeHtml(t('stateSaved'))+'</span><div class="actions">'+requestActions(r)+'</div></div></article>';
}
function invitationBox(){const workroom=snapshot.workspaces?.[0];if(!workroom)return '';
 if(actor==='partner'&&workroom.invitation==='PENDING')return notice(t('workroom'),t('invitedDesc'))+'<div style="margin:0 0 20px">'+btn(t('acceptInvite'),'join','', 'primary')+'</div>';
 return '<section class="workroom"><div><strong>'+escapeHtml(t('workroom'))+'</strong><small>WORKSPACE-001 · Business A + Business B</small></div>'+
 (workroom.invitation==='ACCEPTED'?pill(t('joined'),'green'):pill(t('pending'),'amber'))+'</section>';
}
function statCards(){const n=counts(),values=[[t('open'),n.open,'↗'],[t('progress'),n.progress,'◴'],[t('done'),n.done,'✓']];return '<div class="stats">'+values.map(([name,num,icon])=>
 '<div class="stat"><div class="label"><span>'+icon+'</span>'+escapeHtml(name)+'</div><div class="number">'+num+'</div><div class="sub">'+escapeHtml(t('stateSaved'))+'</div></div>').join('')+'</div>';}
function activityList(limit=6) {const events=(snapshot.events||[]).slice().reverse().slice(0,limit);
 if(!events.length)return '<div class="empty">'+escapeHtml(t('none'))+'</div>';
 return '<div class="timeline">'+events.map(e=>'<div class="event"><span class="dot">✓</span><div><strong>'+escapeHtml(e.summary)+'</strong><small>'+escapeHtml(dateText(e.at))+' · '+escapeHtml(e.actor)+'</small></div></div>').join('')+'</div>';
}
function guide(){return '<div class="panel"><div class="panel-header"><h2>'+escapeHtml(t('quickGuide'))+'</h2></div><div class="timeline">'+[1,2,3,4].map(n=>'<div class="event"><span class="dot">'+n+'</span><div><strong>'+escapeHtml(t('guide'+n))+'</strong></div></div>').join('')+'</div></div>';}
function overview(){
 const isOffice=actor==='office',items=[...(snapshot.requests||[])].reverse().slice(0,5);
 return '<section class="hero"><div><div class="eyebrow">'+escapeHtml(t(isOffice?'labelOffice':'labelBusiness'))+' · '+escapeHtml(t('sample'))+'</div>'+
 '<h1>'+escapeHtml(t(isOffice?'officeTitle':'overviewTitle'))+'</h1><p>'+escapeHtml(t(isOffice?'officeSub':'overviewSub'))+'</p></div>'+
 (actor==='requester'&&snapshot.workspaces?.[0]?.invitation==='ACCEPTED'?'<div class="hero-actions">'+btn('＋ '+t('create'),'new','', 'primary')+'</div>':'')+'</section>'+
 invitationBox()+statCards()+
 '<div class="two-col"><section class="panel"><div class="panel-header"><h2>'+escapeHtml(t('recent'))+'</h2>'+
 btn(t('all'),'page-requests','', 'quiet')+'</div>'+
 (items.length?'<div class="table-scroll"><table><thead><tr><th>'+escapeHtml(t('number'))+'</th><th>'+escapeHtml(t('subject'))+'</th><th>'+escapeHtml(t('state'))+'</th><th>'+escapeHtml(t('date'))+'</th></tr></thead><tbody>'+
 items.map(r=>'<tr><td class="strong">'+escapeHtml(r.id)+'</td><td>'+escapeHtml(r.title)+'</td><td>'+statusPill(r.status)+'</td><td>'+escapeHtml(dateText(r.createdAt))+'</td></tr>').join('')+'</tbody></table></div>':
 '<div class="empty"><span class="empty-icon">▤</span>'+escapeHtml(t('noRequests'))+'</div>')+'</section>'+
 '<section class="panel"><div class="panel-header"><h2>'+escapeHtml(t('latest'))+'</h2></div>'+activityList(6)+'</section></div>'+
 '<div class="footer-note">'+escapeHtml(t('roleHint'))+'</div>';
}
function requestForm(){return '<div class="grid-one"><div class="eyebrow">'+escapeHtml(t('sample'))+'</div><h1 class="page-title">'+escapeHtml(t('newTitle'))+'</h1>'+
 '<p class="section-blurb">'+escapeHtml(t('newDesc'))+'</p>'+
 '<div class="panel"><form id="new-request-form" class="form-grid"><label class="field">'+escapeHtml(t('what'))+
 '<input name="title" maxlength="100" required placeholder="'+escapeHtml(t('detailsPlaceholder'))+'"></label>'+
 '<label class="field">'+escapeHtml(t('detail'))+'<textarea name="details" maxlength="800" required placeholder="'+escapeHtml(t('descriptionPlaceholder'))+'"></textarea>'+
 '<small>'+escapeHtml(t('tip'))+'</small></label><div class="actions"><button class="primary" type="submit">'+escapeHtml(t('submit'))+'</button>'+
 btn(t('cancel'),'page-requests','')+'</div></form></div></div>';}
function requests(){const items=[...(snapshot.requests||[])].reverse();
 return '<div class="grid-one"><div class="eyebrow">'+escapeHtml(t('sample'))+'</div><div class="hero"><div><h1 class="page-title">'+escapeHtml(t('requests'))+'</h1>'+
 '<p class="section-blurb">'+escapeHtml(t('requestsDesc'))+'</p></div>'+
 (actor==='requester'&&snapshot.workspaces?.[0]?.invitation==='ACCEPTED' ? btn('＋ '+t('create'),'new','', 'primary'):'')+'</div>'+
 (actor==='partner'&&snapshot.workspaces?.[0]?.invitation==='PENDING'?notice(t('pending'),t('invitedDesc'))+btn(t('acceptInvite'),'join','','primary'):'')+
 (items.length?items.map(requestCard).join(''):'<div class="panel empty"><span class="empty-icon">▤</span>'+escapeHtml(t('noRequests'))+'</div>')+
 '</div>';}
function connections(){return '<div class="grid-one"><div class="eyebrow">'+escapeHtml(t('sample'))+'</div><h1 class="page-title">'+escapeHtml(t('connectionsTitle'))+'</h1>'+
 '<p class="section-blurb">'+escapeHtml(t('connectionsSub'))+'</p>'+
 notice(t('safe'),t('financeNote'))+
 '<div class="panel">'+(snapshot.connections||[]).map(x=>'<div class="connection"><div><strong>'+escapeHtml(x.name)+'</strong><small>'+escapeHtml(x.state)+'</small></div>'+pill(t('notConnected'))+'</div>').join('')+'</div></div>';}
function activity(){return '<div class="grid-one"><div class="eyebrow">'+escapeHtml(t('sample'))+'</div><h1 class="page-title">'+escapeHtml(t('activityTitle'))+'</h1>'+
 '<p class="section-blurb">'+escapeHtml(t('activitySub'))+'</p><div class="panel">'+activityList(40)+'</div></div>';}
function office(){if(actor!=='office')return notice(t('notAvailable'),t('roleHint'));
 const requests=(snapshot.requests||[]).filter(r=>r.status==='AWAITING_OFFICE');
 return '<div class="eyebrow">'+escapeHtml(t('labelOffice'))+' · '+escapeHtml(t('sample'))+'</div>'+
 '<h1 class="page-title">'+escapeHtml(t('officeTitle'))+'</h1><p class="section-blurb">'+escapeHtml(t('officeSub'))+'</p>'+
 statCards()+'<div class="two-col"><div class="panel"><div class="panel-header"><h2>'+escapeHtml(t('waitingApproval'))+'</h2>'+pill(String(requests.length),'amber')+'</div>'+
 (requests.length?'<div class="office-list">'+requests.map(r=>'<div class="office-row"><div><strong>'+escapeHtml(r.title)+'</strong><p>'+escapeHtml(r.id)+' · '+escapeHtml(r.details.slice(0,100))+'</p></div>'+btn(t('approve'),'approve',r.id,'primary')+'</div>').join('')+'</div>':
 '<div class="empty">'+escapeHtml(t('emptyOffice'))+'</div>')+'</div>'+guide()+'</div>'+
 '<div class="subheading">'+escapeHtml(t('requestsAll'))+'</div>'+
 '<div class="panel">'+(snapshot.requests?.length?'<div class="table-scroll"><table><thead><tr><th>'+escapeHtml(t('number'))+'</th><th>'+escapeHtml(t('subject'))+'</th><th>'+escapeHtml(t('state'))+'</th><th>'+escapeHtml(t('date'))+'</th></tr></thead><tbody>'+[...snapshot.requests].reverse().map(r=>'<tr><td class="strong">'+escapeHtml(r.id)+'</td><td>'+escapeHtml(r.title)+'</td><td>'+statusPill(r.status)+'</td><td>'+escapeHtml(dateText(r.createdAt))+'</td></tr>').join('')+'</tbody></table></div>':'<div class="empty">'+escapeHtml(t('noRequests'))+'</div>')+'</div>'+
 '<div class="footer-note">'+escapeHtml(t('financeNote'))+'</div>';
}
function render(){
 navigation();
 if(!snapshot)return;
 if(actor!=='office'&&page==='office')page='overview';
 const main=({overview,requests,connections,activity,office,new:requestForm})[page]||overview;
 $('content').innerHTML=main();
}
async function load(){
 try{
   const response=await fetch('/api/state',{headers:{'x-demo-role':actor},cache:'no-store'});
   const data=await response.json();
   if(!response.ok)throw new Error(data.error||t('error'));
   snapshot=data;render();
 }catch(e){$('content').textContent=t('error')+': '+e.message;}
}
async function post(url,body={}){
 if(busy)return;busy=true;
 try{
 const response=await fetch(url,{method:'POST',headers:{'x-demo-role':actor,'content-type':'application/json'},body:JSON.stringify(body)});
 const result=await response.json();if(!response.ok)throw new Error(result.error||t('error'));
 setMessage(t('saved'));await load();
 }catch(e){setMessage(t('error')+': '+e.message,true);}finally{busy=false;}
}
$('navigation').addEventListener('click',e=>{const target=e.target.closest('[data-page]');if(!target)return;page=target.dataset.page;render();});
$('content').addEventListener('click',async e=>{
 const target=e.target.closest('[data-action]');if(!target)return;
 const action=target.dataset.action,id=target.dataset.id;
 if(action==='new'){page='new';render();return;}
 if(action==='page-requests'){page='requests';render();return;}
 if(action==='join'){await post('/api/invitation/accept');return;}
 if(['accept','decline','approve','complete'].includes(action))await post('/api/requests/'+encodeURIComponent(id)+'/'+action);
});
$('content').addEventListener('submit',async e=>{
 if(e.target.id!=='new-request-form')return;
 e.preventDefault();
 const data=new FormData(e.target);const title=String(data.get('title')||'').trim();const details=String(data.get('details')||'').trim();
 if(!title||!details)return;
 await post('/api/requests',{title,details,clientRequestKey:crypto.randomUUID()});
 page='requests';render();
});
$('language').addEventListener('change',e=>{lang=translations[e.target.value]?e.target.value:'en';localStorage.setItem('synnergyze-r05-language',lang);render();});
$('actor').addEventListener('change',e=>{actor=e.target.value;localStorage.setItem('synnergyze-r05-role',actor);page=actor==='office'?'office':'overview';load();});
load();
