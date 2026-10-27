import { SynnergyzeCollaborationPilot } from './pilot.mjs';
const p = new SynnergyzeCollaborationPilot({ now: () => '2026-10-27T12:00:00.000Z' });
for (const [actor,org] of [['companyA','SYNTH_A'],['companyB','SYNTH_B'],['financeA','SYNTH_A']]) { p.registerActor(actor,org);p.approveActor(actor,'reviewer'); }
p.createWorkspace('SYNTHETIC_ROOM_01','companyA');
for (const actor of ['companyB','financeA']){p.invite('SYNTHETIC_ROOM_01','companyA',actor);p.acceptInvite('SYNTHETIC_ROOM_01',actor);}
for (const [who,action] of [['companyA','ORDER_PROPOSE'],['companyA','ERP_EXPORT'],['companyB','ORDER_ACCEPT'],['financeA','FINANCE_APPROVE'],['financeA','AUDIT_VIEW']]) p.issueTestGrant('SYNTHETIC_ROOM_01','companyA',who,action,'2026-12-01T00:00:00.000Z');
p.proposeOrder('SYNTHETIC_ROOM_01','companyA','ORDER_SYN_01',100000);
p.acceptOrder('SYNTHETIC_ROOM_01','companyB','ORDER_SYN_01');p.approveFinance('SYNTHETIC_ROOM_01','financeA','ORDER_SYN_01');
const exportResult=p.exportDryRun('SYNTHETIC_ROOM_01','companyA','ORDER_SYN_01','KEY_SYN_01');
console.log(JSON.stringify({exportResult,stats:p.stats(),ledgerValid:p.verifyChain(),sampleEvents:p.evidence('SYNTHETIC_ROOM_01','financeA').map(e=>({index:e.index,type:e.type,synthetic:e.synthetic,digest:e.digest.slice(0,12)}))},null,2));
