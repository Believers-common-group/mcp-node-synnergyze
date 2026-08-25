import fs from 'node:fs';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const fail = (message) => {
  console.error(`R0_12_CONTRACT_INVALID: ${message}`);
  process.exit(1);
};

const rights = readJson('rights/release-rights.json');
const authority = readJson('rights/authority-declaration.json');
const launchpad = readJson('rights/launchpad-release-request.json');

if (authority.schema !== 'VSR_AUTHORITY_DECLARATION/1.0') fail(`unexpected authority schema ${authority.schema}`);
if (authority.declaration_id !== 'AUTH-MCP-NODE-SYNNERGYZE-R0.12') fail('authority declaration id mismatch');
if (!['UNDECLARED', 'EVIDENCED'].includes(authority.status)) fail(`invalid authority status ${authority.status}`);
if (authority.machine_effect !== 'HOLD_UNTIL_EVIDENCED') fail('authority declaration must remain fail-closed');
if (authority.attestations?.upstream_algolia_notice_preserved !== true) fail('upstream Algolia notice preservation invariant missing');

if (launchpad.schema !== 'VSR_LAUNCHPAD_RELEASE_REQUEST/1.0') fail(`unexpected Launchpad request schema ${launchpad.schema}`);
if (launchpad.request_id !== 'LPR-MCP-NODE-SYNNERGYZE-R0.12') fail('Launchpad request id mismatch');
if (launchpad.route !== 'OPEN_PUBLIC_PPA') fail(`unexpected prepared route ${launchpad.route}`);
if (launchpad.visibility !== 'PUBLIC') fail('OPEN_PUBLIC_PPA route must be public');
if (!['PREPARED_NOT_AUTHORIZED', 'AUTHORIZED'].includes(launchpad.status)) fail(`invalid Launchpad request status ${launchpad.status}`);
if (!Array.isArray(launchpad.invariants) || !launchpad.invariants.includes('NO_LAUNCHPAD_UPLOAD_OR_BUILD_REQUEST_BEFORE_WARDEN_G0_ALLOW')) {
  fail('Launchpad no-external-action invariant missing');
}

if (rights.post_fork_rights?.authority_declaration?.path !== 'rights/authority-declaration.json') fail('release rights authority contract path mismatch');
if (rights.launchpad_request?.path !== 'rights/launchpad-release-request.json') fail('release rights Launchpad request path mismatch');

if (authority.status === 'UNDECLARED') {
  if (rights.status === 'CLEARED') fail('release rights cannot be CLEARED while authority is UNDECLARED');
  if (rights.post_fork_rights?.status === 'CLEARED') fail('post-fork rights cannot be CLEARED while authority is UNDECLARED');
  if (rights.governance?.status === 'CLEARED') fail('governance cannot be CLEARED while authority is UNDECLARED');
  if (launchpad.status !== 'PREPARED_NOT_AUTHORIZED') fail('undeclared authority requires PREPARED_NOT_AUTHORIZED Launchpad request');
  if (launchpad.warden_g0?.status !== 'NOT_EVALUATED') fail('Warden G0 must remain NOT_EVALUATED before authority evidence');
  if (launchpad.execution?.build_request_state !== 'NOT_REQUESTED') fail('Launchpad build must remain NOT_REQUESTED before authority evidence');
  if (launchpad.machine_effect !== 'NO_EXTERNAL_ACTION') fail('undeclared authority must have NO_EXTERNAL_ACTION effect');
}

if (authority.status === 'EVIDENCED') {
  const requiredStrings = [
    ['deciding_principal', authority.deciding_principal],
    ['principal_capacity', authority.principal_capacity],
    ['signed_at', authority.signed_at],
    ['signature_reference', authority.signature_reference],
    ['reviewed_at', authority.reviewed_at],
    ['review_reference', authority.review_reference]
  ];
  for (const [name, value] of requiredStrings) if (!value) fail(`evidenced authority missing ${name}`);
  if (!Array.isArray(authority.authority_basis) || authority.authority_basis.length === 0) fail('evidenced authority missing authority_basis');
  if (!Array.isArray(authority.authority_evidence) || authority.authority_evidence.length === 0) fail('evidenced authority missing authority_evidence');
  if (!Array.isArray(authority.rights_holders_or_authorized_licensors) || authority.rights_holders_or_authorized_licensors.length === 0) fail('evidenced authority missing rights holders/licensors');
  if (!authority.automation_control?.controller_principal || !authority.automation_control?.authority_basis) fail('evidenced authority missing automation controller basis');
  if (authority.license_disposition?.expression !== 'MIT' || authority.license_disposition?.distribution_authorized !== true) fail('evidenced authority must explicitly authorize MIT distribution');
  const attestations = authority.attestations || {};
  for (const key of ['necessary_rights_owned_or_controlled', 'authority_to_license_post_fork_modifications', 'automation_output_attributable_to_authorized_controller', 'no_known_conflicting_grant_or_assignment', 'upstream_algolia_notice_preserved']) {
    if (attestations[key] !== true) fail(`authority attestation ${key} must be true`);
  }
}

if (launchpad.status === 'AUTHORIZED') {
  if (launchpad.warden_g0?.status !== 'ALLOW' || launchpad.warden_g0?.decision !== 'ALLOW') fail('AUTHORIZED Launchpad request requires Warden G0 ALLOW');
  if (!launchpad.warden_g0?.decision_id || !launchpad.warden_g0?.principal || !launchpad.warden_g0?.capability_grant_id || !launchpad.warden_g0?.evidence_reference) fail('AUTHORIZED Launchpad request missing Warden evidence');
  if (!launchpad.source_binding?.authorized_source_commit || !launchpad.source_binding?.required_evidence_artifact || !launchpad.source_binding?.required_evidence_digest) fail('AUTHORIZED Launchpad request missing exact source/evidence binding');
}

console.log('R0_12_CONTRACT_VALID');
console.log(JSON.stringify({
  authority_status: authority.status,
  release_rights_status: rights.status,
  launchpad_request_status: launchpad.status,
  warden_g0_status: launchpad.warden_g0?.status,
  machine_effect: launchpad.machine_effect
}, null, 2));
