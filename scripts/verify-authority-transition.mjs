import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const nonEmptyArray = (value) => Array.isArray(value) && value.length > 0;
const currentHead = () => execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

const authority = readJson('rights/authority-declaration.json');
const rights = readJson('rights/release-rights.json');
const request = readJson('rights/launchpad-release-request.json');

const failures = [];

if (authority.schema !== 'VSR_AUTHORITY_DECLARATION/1.0') {
  failures.push(`authority declaration schema is ${authority.schema ?? 'missing'}`);
}
if (authority.status !== 'EVIDENCED') {
  failures.push(`authority declaration status is ${authority.status ?? 'missing'}`);
}
if (!nonEmpty(authority.deciding_principal)) failures.push('deciding principal is missing');
if (!nonEmpty(authority.principal_capacity)) failures.push('deciding principal capacity is missing');
if (!nonEmptyArray(authority.authority_basis)) failures.push('authority basis is missing');
if (!nonEmptyArray(authority.authority_evidence)) failures.push('authority evidence is missing');
if (!nonEmptyArray(authority.rights_holders_or_authorized_licensors)) {
  failures.push('rights holder or authorized licensor evidence is missing');
}

if (!nonEmpty(authority.automation_control?.controller_principal)) {
  failures.push('automation controller principal is missing');
}
if (!nonEmpty(authority.automation_control?.controller_capacity)) {
  failures.push('automation controller capacity is missing');
}
if (!nonEmpty(authority.automation_control?.authority_basis)) {
  failures.push('automation controller authority basis is missing');
}
if (!nonEmptyArray(authority.automation_control?.evidence)) {
  failures.push('automation controller evidence is missing');
}

if (authority.license_disposition?.expression !== 'MIT') {
  failures.push(`post-fork licence disposition is ${authority.license_disposition?.expression ?? 'missing'}`);
}
if (authority.license_disposition?.distribution_authorized !== true) {
  failures.push('post-fork distribution is not affirmatively authorized');
}
if (!authority.license_disposition?.permitted_scope?.includes('LAUNCHPAD_ALPHA')) {
  failures.push('LAUNCHPAD_ALPHA is not within the declared permitted distribution scope');
}

for (const key of [
  'necessary_rights_owned_or_controlled',
  'authority_to_license_post_fork_modifications',
  'automation_output_attributable_to_authorized_controller',
  'no_known_conflicting_grant_or_assignment',
  'upstream_algolia_notice_preserved'
]) {
  if (authority.attestations?.[key] !== true) failures.push(`authority attestation ${key} is not true`);
}

if (!nonEmpty(authority.signed_at)) failures.push('authority declaration signed_at is missing');
if (!nonEmpty(authority.signature_reference)) failures.push('authority declaration signature reference is missing');
if (!nonEmpty(authority.reviewed_at)) failures.push('authority declaration reviewed_at is missing');
if (!nonEmpty(authority.review_reference)) failures.push('authority declaration review reference is missing');

if (request.schema !== 'VSR_LAUNCHPAD_RELEASE_REQUEST/1.0') {
  failures.push(`Launchpad request schema is ${request.schema ?? 'missing'}`);
}
if (request.route !== 'OPEN_PUBLIC_PPA' || request.visibility !== 'PUBLIC') {
  failures.push('R0.12 request is not the governed OPEN_PUBLIC_PPA/PUBLIC route');
}

const wardenStatus = request.warden_g0?.status;
const wardenDecision = request.warden_g0?.decision;
const externalState = request.execution?.build_request_state;

if (wardenStatus !== 'ALLOW') {
  if (request.status !== 'PREPARED_NOT_AUTHORIZED') {
    failures.push('non-ALLOW Warden state must keep request PREPARED_NOT_AUTHORIZED');
  }
  if (externalState !== 'NOT_REQUESTED') {
    failures.push('external Launchpad action exists before Warden G0 ALLOW');
  }
} else {
  if (wardenDecision !== 'ALLOW') failures.push('Warden status ALLOW requires decision ALLOW');
  for (const [label, value] of [
    ['Warden decision id', request.warden_g0?.decision_id],
    ['Warden principal', request.warden_g0?.principal],
    ['Warden capability grant id', request.warden_g0?.capability_grant_id],
    ['Warden evidence reference', request.warden_g0?.evidence_reference]
  ]) {
    if (!nonEmpty(value)) failures.push(`${label} is missing`);
  }

  if (rights.status !== 'CLEARED') failures.push(`release rights status is ${rights.status ?? 'missing'}`);
  if (rights.governance?.status !== 'CLEARED') {
    failures.push(`governance status is ${rights.governance?.status ?? 'missing'}`);
  }
  if (rights.post_fork_rights?.status !== 'CLEARED') {
    failures.push(`post-fork rights status is ${rights.post_fork_rights?.status ?? 'missing'}`);
  }
  if (rights.platform?.candidate_path !== 'OPEN_PUBLIC_PPA' || rights.platform?.status !== 'NOT_REQUIRED') {
    failures.push('OPEN_PUBLIC_PPA Warden ALLOW requires governed Launchpad platform status NOT_REQUIRED');
  }

  const head = currentHead();
  if (request.source_binding?.authorized_source_commit !== head) {
    failures.push(`authorized source commit ${request.source_binding?.authorized_source_commit ?? 'missing'} does not match exact HEAD ${head}`);
  }
  if (!nonEmpty(request.source_binding?.required_evidence_artifact)) {
    failures.push('exact-head evidence artifact reference is missing');
  }
  if (!nonEmpty(request.source_binding?.required_evidence_digest)) {
    failures.push('exact-head evidence digest is missing');
  }
}

if (failures.length) {
  console.error('AUTHORITY_TRANSITION_HOLD');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(2);
}

console.log('AUTHORITY_TRANSITION_READY');
console.log(JSON.stringify({
  declaration_id: authority.declaration_id,
  deciding_principal: authority.deciding_principal,
  license_expression: authority.license_disposition.expression,
  request_id: request.request_id,
  route: request.route,
  warden_decision_id: request.warden_g0.decision_id,
  authorized_source_commit: request.source_binding.authorized_source_commit,
  external_build_request_state: externalState
}, null, 2));
