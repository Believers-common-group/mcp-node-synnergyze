import fs from 'node:fs';
import crypto from 'node:crypto';

const readJson = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const rights = readJson('rights/release-rights.json');
const licenseBytes = fs.readFileSync('LICENSE');
const licenseTextSha256 = sha256(licenseBytes);

const failures = [];

if (pkg.license !== 'MIT') failures.push(`package.json license is ${pkg.license ?? 'missing'}`);
if (lock.packages?.['']?.license !== 'MIT') {
  failures.push(`package-lock root license is ${lock.packages?.['']?.license ?? 'missing'}`);
}

if (rights.upstream_rights?.status !== 'EVIDENCED') {
  failures.push(`upstream rights status is ${rights.upstream_rights?.status ?? 'missing'}`);
}
if (rights.upstream_rights?.license_expression !== 'MIT') {
  failures.push(`upstream license expression is ${rights.upstream_rights?.license_expression ?? 'missing'}`);
}
if (!rights.upstream_rights?.copyright_notice) {
  failures.push('upstream copyright notice is missing');
}
if (!rights.upstream_rights?.license_text_sha256) {
  failures.push('upstream governed license-text digest is missing');
} else if (rights.upstream_rights.license_text_sha256 !== licenseTextSha256) {
  failures.push('root LICENSE digest differs from governed upstream license-text digest');
}

if (rights.post_fork_rights?.status !== 'CLEARED') {
  failures.push(`post-fork rights status is ${rights.post_fork_rights?.status ?? 'missing'}`);
}
if (rights.post_fork_rights?.license_expression !== 'MIT') {
  failures.push(`post-fork license expression is ${rights.post_fork_rights?.license_expression ?? 'missing'}`);
}
if (!rights.post_fork_rights?.authority_basis) {
  failures.push('post-fork authority basis is missing');
}

if (rights.status !== 'CLEARED') failures.push(`release rights status is ${rights.status}`);
if (rights.governance?.status !== 'CLEARED') {
  failures.push(`governance rights decision is ${rights.governance?.status ?? 'missing'}`);
}
if (
  !rights.clearance?.decision_reference ||
  !rights.clearance?.deciding_principal ||
  !rights.clearance?.authority_basis ||
  !rights.clearance?.cleared_at
) {
  failures.push('rights clearance evidence is incomplete');
}

const platformStatus = rights.platform?.status;
if (!['NOT_REQUIRED', 'EVIDENCED'].includes(platformStatus)) {
  failures.push(`Launchpad platform permission is ${platformStatus ?? 'missing'}`);
}
if (platformStatus === 'NOT_REQUIRED' && rights.platform?.candidate_path !== 'OPEN_PUBLIC_PPA') {
  failures.push('NOT_REQUIRED Launchpad permission is valid only for the governed OPEN_PUBLIC_PPA route');
}
if (platformStatus === 'EVIDENCED' && !rights.platform?.approval_reference) {
  failures.push('evidenced Launchpad permission is missing approval reference');
}

if (failures.length) {
  console.error('RELEASE_RIGHTS_HOLD');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(2);
}

console.log('RELEASE_RIGHTS_CLEARED');
console.log(JSON.stringify({
  upstream_license: rights.upstream_rights.license_expression,
  upstream_license_sha256: licenseTextSha256,
  post_fork_license: rights.post_fork_rights.license_expression,
  decision_reference: rights.clearance.decision_reference,
  deciding_principal: rights.clearance.deciding_principal,
  platform_path: rights.platform.candidate_path,
  platform_status: rights.platform.status
}, null, 2));
