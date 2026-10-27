import { createHash } from 'node:crypto';

// SYN-R04: An intentionally IN-MEMORY, synthetic-only collaboration test double.
// No network, filesystem, Docker, GitHub, Tally, Warden, RiverOS or financial effects.
const copy = value => structuredClone(value);
const sha = value => createHash('sha256').update(value).digest('hex');
const key = (workspace, actor, action) => `${workspace}|${actor}|${action}`;
const fail = code => { throw new Error(code); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

export class SynnergyzeCollaborationPilot {
  #actors = new Map(); #workspaces = new Map(); #grants = new Map();
  #orders = new Map(); #claims = new Map(); #events = []; #effects = [];
  #now;
  constructor({ now = () => new Date().toISOString() } = {}) { this.#now = now; }
  #assertName(value) { if (!nonempty(value)) fail('INVALID_REFERENCE'); return value; }
  #actor(actor) { const found = this.#actors.get(actor); if (!found || !found.approved) fail('ACTOR_NOT_APPROVED'); return found; }
  #workspace(id) { const w = this.#workspaces.get(id); if (!w) fail('WORKSPACE_NOT_FOUND'); return w; }
  #entry(type, workspace, data) {
    const previous = this.#events.at(-1)?.digest ?? 'GENESIS';
    const event = { index: this.#events.length + 1, type, workspace, data: copy(data), at: this.#now(), previous, synthetic: true };
    event.digest = sha(JSON.stringify(event)); this.#events.push(event);
    return copy(event);
  }
  registerActor(id, organisation) {
    this.#assertName(id); this.#assertName(organisation);
    if (this.#actors.has(id)) fail('ACTOR_DUPLICATE');
    this.#actors.set(id, { id, organisation, approved: false });
    this.#entry('ACTOR_REGISTERED', null, { actor: id }); return { actor: id, state: 'PENDING' };
  }
  approveActor(id, reviewer) {
    this.#assertName(reviewer); const actor = this.#actors.get(id);
    if (!actor || actor.approved || id === reviewer) fail('INDEPENDENT_APPROVAL_REQUIRED');
    actor.approved = true; this.#entry('ACTOR_APPROVED_SYNTHETIC', null, { actor: id, reviewer });
  }
  createWorkspace(id, owner) {
    this.#assertName(id); this.#actor(owner);
    if (this.#workspaces.has(id)) fail('WORKSPACE_DUPLICATE');
    this.#workspaces.set(id, { id, owner, invited: new Set(), members: new Set([owner]) });
    this.#entry('WORKSPACE_CREATED', id, { owner }); return { id, state: 'SYNTHETIC_ONLY' };
  }
  invite(workspace, inviter, invitee) {
    const w = this.#workspace(workspace); this.#actor(invitee);
    if (w.owner !== inviter || inviter === invitee || w.members.has(invitee)) fail('INVITE_NOT_AUTHORIZED');
    w.invited.add(invitee); this.#entry('INVITATION_SENT', workspace, { inviter, invitee });
  }
  acceptInvite(workspace, invitee) {
    const w = this.#workspace(workspace); this.#actor(invitee);
    if (!w.invited.delete(invitee)) fail('INVITATION_REQUIRED');
    w.members.add(invitee); this.#entry('INVITATION_ACCEPTED', workspace, { invitee });
  }
  issueTestGrant(workspace, issuer, subject, action, expiresAt) {
    const w = this.#workspace(workspace);
    if (w.owner !== issuer || !w.members.has(subject)) fail('GRANT_NOT_AUTHORIZED');
    if (!nonempty(action) || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.parse(this.#now())) fail('INVALID_GRANT');
    this.#grants.set(key(workspace, subject, action), { expiresAt, revoked: false, synthetic: true });
    this.#entry('TEST_GRANT_ISSUED', workspace, { issuer, subject, action, expiresAt });
  }
  revokeGrant(workspace, issuer, subject, action) {
    const w = this.#workspace(workspace); if (w.owner !== issuer) fail('REVOKE_NOT_AUTHORIZED');
    const grant = this.#grants.get(key(workspace, subject, action)); if (!grant) fail('GRANT_MISSING');
    grant.revoked = true; this.#entry('TEST_GRANT_REVOKED', workspace, { issuer, subject, action });
  }
  #permit(workspace, actor, action) {
    const w = this.#workspace(workspace); this.#actor(actor);
    const g = this.#grants.get(key(workspace, actor, action));
    if (!w.members.has(actor) || !g || g.revoked || Date.parse(g.expiresAt) <= Date.parse(this.#now())) fail('WARDEN_TEST_DENY');
    return w;
  }
  proposeOrder(workspace, actor, orderId, amount) {
    const w = this.#permit(workspace, actor, 'ORDER_PROPOSE');
    if (w.owner !== actor || !nonempty(orderId) || !Number.isSafeInteger(amount) || amount <= 0) fail('INVALID_ORDER');
    const id = `${workspace}|${orderId}`; if (this.#orders.has(id)) fail('ORDER_DUPLICATE');
    const o = { id: orderId, workspace, owner: actor, amountMinor: amount, status: 'PROPOSED', acceptedBy: null, financeApprovedBy: null };
    this.#orders.set(id, o); this.#entry('ORDER_PROPOSED', workspace, { order: orderId, amountMinor: amount }); return copy(o);
  }
  readOrder(workspace, actor, orderId) {
    this.#permit(workspace, actor, 'ORDER_VIEW'); const o = this.#orders.get(`${workspace}|${orderId}`);
    if (!o) fail('ORDER_NOT_FOUND'); return copy(o);
  }
  acceptOrder(workspace, actor, orderId) {
    const w = this.#permit(workspace, actor, 'ORDER_ACCEPT');
    if (w.owner === actor) fail('INDEPENDENT_PARTNER_REQUIRED');
    const o = this.#orders.get(`${workspace}|${orderId}`);
    if (!o || o.status !== 'PROPOSED') fail('ORDER_NOT_ACCEPTABLE');
    o.status = 'ACCEPTED'; o.acceptedBy = actor;
    this.#entry('ORDER_ACCEPTED', workspace, { order: orderId, by: actor });
  }
  approveFinance(workspace, actor, orderId) {
    this.#permit(workspace, actor, 'FINANCE_APPROVE');
    const o = this.#orders.get(`${workspace}|${orderId}`);
    if (!o || o.status !== 'ACCEPTED' || actor === o.acceptedBy) fail('FINANCE_APPROVAL_DENIED');
    o.financeApprovedBy = actor; this.#entry('FINANCE_APPROVED_SYNTHETIC', workspace, { order: orderId, by: actor });
  }
  exportDryRun(workspace, actor, orderId, idempotencyKey, { uncertain = false } = {}) {
    this.#permit(workspace, actor, 'ERP_EXPORT'); this.#assertName(idempotencyKey);
    const o = this.#orders.get(`${workspace}|${orderId}`); if (!o || !o.financeApprovedBy) fail('FINANCE_APPROVAL_REQUIRED');
    const fingerprint = sha(JSON.stringify({ workspace, orderId, amountMinor: o.amountMinor, financeApprovedBy: o.financeApprovedBy }));
    const scopeKey = `${workspace}|${idempotencyKey}`; const prior = this.#claims.get(scopeKey);
    if (prior) { if (prior.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT'); return copy(prior.result); }
    if (o.status !== 'ACCEPTED') fail('ORDER_NOT_EXECUTABLE');
    // Claim first. On uncertain outcome, reconciliation is mandatory; never retry automatically.
    const result = { orderId, workspace, synthetic: true, externalEffects: false, state: uncertain ? 'RECONCILIATION_REQUIRED' : 'DRY_RUN_ACCEPTED', adapter: 'ERP_TALLY_STUB' };
    this.#claims.set(scopeKey, { fingerprint, result: copy(result) });
    o.status = result.state;
    this.#entry(uncertain ? 'ADAPTER_OUTCOME_UNKNOWN_SYNTHETIC' : 'ADAPTER_DRY_RUN_ACCEPTED', workspace, { orderId, fingerprint });
    if (!uncertain) this.#effects.push({ workspace, orderId, synthetic: true, externalEffects: false });
    return copy(result);
  }
  evidence(workspace, actor) {
    this.#permit(workspace, actor, 'AUDIT_VIEW');
    return copy(this.#events.filter(e => e.workspace === workspace));
  }
  verifyChain() {
    let previous = 'GENESIS'; for (const e of this.#events) {
      const { digest, ...unsigned } = e;
      if (unsigned.previous !== previous || digest !== sha(JSON.stringify(unsigned))) return false;
      previous = digest;
    } return true;
  }
  stats() { return { testEventCount: this.#events.length, simulatedAdapterCalls: this.#effects.length, realExternalEffects: 0, synthetic: true }; }
}
