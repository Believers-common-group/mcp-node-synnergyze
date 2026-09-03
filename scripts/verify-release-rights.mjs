import fs from 'node:fs';
import crypto from 'node:crypto';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const rights = readJson('rights/release-rights.json');
const authority = readJson('rights/authority-declaration.json');
const launchpad = readJson('rights/launchpad-release-request.json');
const licenseBytes = fs.readFileSync('LICENSE');
const licenseTextSha256 = sha256(licenseBytes);

const failures = [];

if (pkg.license !== 'MIT') failures.push(`package.json license is ${pkg.license ?? 'missing'}`);
if (lock.packages?.['']?.license !== 'MIT') failures.push(`package-lock root license is ${lock.packages?.['']?.license ?? 'missing'}`);

if (rights.upstream_rights?.status !== 'EVIDENCED') failures.push(`upstream rights status is ${rights.upstream_rights?.status ?? 'missing'}`);
if (rights.upstream_rights?.license_expression !== 'MIT') failures.push(`upstream license expression is ${rights.upstream_rights?.license_expression ?? 'missing'}`);
if (!rights.upstream_rights?.copyright_notice) failures.push('upstream copyright notice is missing');
if (!rights.upstream_rights?.license_text_sha256) {
  failures.push('upstream governed license-text digest is missing');
} else if (rights.upstream_rights.license_text_sha256 !== licenseTextSha256) {
  failures.push('root LICENSE digest differs from governed upstream license-text digest');
}

if (authority.status !== 'EVIDENCED') failures.push(`competent authority declaration is ${authority.status ?? 'missing'}`);
if (rights.post_fork_rights?.authority_declaration?.declaration_id !== authority.declaration_id) failures.push('release rights do not bind the authority declaration id');
if (rights.post_fork_rights?.status !== 'CLEARED') failures.push(`post-fork rights status is ${rights.post_fork_rights?.status ?? 'missing'}`);
if (rights.post_fork_rights?.license_expression !== 'MIT') failures.push(`post-fork license expression is ${rights.post_fork_rights?.license_expression ?? 'missing'}`);
if (!rights.post_fork_rights?.authority_basis) failures.push('post-fork authority basis is missing');

if (authority.status === 'EVIDENCED') {
  if (authority.license_disposition?.expression !== 'MIT') failures.push(`authority declaration license is ${authority.license_disposition?.expression ?? 'missing'}`);
  if (authority.license_disposition?.distribution_authorized !== true) failures.push('authority declaration does not authorize distribution');
  if (!authority.deciding_principal || !authority.principal_capacity) failures.push('authority declaration principal/capacity is incomplete');
  if (!Array.isArray(authority.authority_basis) || authority.authority_basis.length === 0) failures.push('authority declaration basis is missing');
  if (!authority.automation_control?.controller_principal || !authority.automation_control?.authority_basis) failures.push('automation controller authority is incomplete');
  if (!authority.signature_reference || !authority.review_reference) failures.push('authority declaration signature/review evidence is incomplete');
}

if (rights.status !== 'CLEARED') failures.push(`release rights status is ${rights.status}`);
if (rights.governance?.status !== 'CLEARED') failures.push(`governance rights decision is ${rights.governance?.status ?? 'missing'}`);
if (!rights.clearance?.decision_reference || !rights.clearance?.deciding_principal || !rights.clearance?.authority_basis || !rights.clearance?.cleared_at) {
  failures.push('rights clearance evidence is incomplete');
}

const platformStatus = rights.platform?.status;
if (!['NOT_REQUIRED', 'EVIDENCED'].includes(platformStatus)) failures.push(`Launchpad platform permission is ${platformStatus ?? 'missing'}`);
if (platformStatus === 'NOT_REQUIRED' && rights.platform?.candidate_path !== 'OPEN_PUBLIC_PPA') failures.push('NOT_REQUIRED Launchpad permission is valid only for OPEN_PUBLIC_PPA');
if (platformStatus === 'EVIDENCED' && !rights.platform?.approval_reference) failures.push('evidenced Launchpad permission is missing approval reference');

if (launchpad.status !== 'AUTHORIZED') failures.push(`Launchpad request status is ${launchpad.status ?? 'missing'}`);
if (launchpad.route !== rights.platform?.candidate_path) failures.push('Launchpad request route differs from release-rights route');
if (launchpad.warden_g0?.status !== 'ALLOW' || launchpad.warden_g0?.decision !== 'ALLOW') failures.push(`Warden G0 is ${launchpad.warden_g0?.status ?? 'missing'}`);
if (!launchpad.warden_g0?.decision_id || !launchpad.warden_g0?.principal || !launchpad.warden_g0?.capability_grant_id || !launchpad.warden_g0?.evidence_reference) {
  failures.push('Warden G0 authorization evidence is incomplete');
}
if (!launchpad.source_binding?.authorized_source_commit || !launchpad.source_binding?.required_evidence_artifact || !launchpad.source_binding?.required_evidence_digest) {
  failures.push('Launchpad request exact source/evidence binding is incomplete');
}
if (launchpad.execution?.build_request_state !== 'NOT_REQUESTED') failures.push(`expected pre-build NOT_REQUESTED state, found ${launchpad.execution?.build_request_state ?? 'missing'}`);

if (failures.length) {
  console.error('RELEASE_ADMISSION_HOLD');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(2);
}

console.log('RELEASE_ADMISSION_AUTHORIZED');
console.log(JSON.stringify({
  upstream_license: rights.upstream_rights.license_expression,
  upstream_license_sha256: licenseTextSha256,
  post_fork_license: rights.post_fork_rights.license_expression,
  authority_declaration: authority.declaration_id,
  authority_principal: authority.deciding_principal,
  rights_decision_reference: rights.clearance.decision_reference,
  warden_decision: launchpad.warden_g0.decision_id,
  authorized_source_commit: launchpad.source_binding.authorized_source_commit,
  evidence_artifact: launchpad.source_binding.required_evidence_artifact,
  platform_path: launchpad.route,
  platform_status: rights.platform.status,
  next_state: 'LAUNCHPAD_BUILD_REQUEST_MAY_BE_CREATED'
}, null, 2));
