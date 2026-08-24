import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));

const packageJson = readJson('package.json');
const rights = readJson('rights/release-rights.json');
const lockfiles = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb'
].filter((name) => fs.existsSync(path.join(root, name)));

const failures = [];

if (rights.status !== 'CLEARED') failures.push(`rights status is ${rights.status}`);
if (packageJson.private === true) failures.push('package is marked private');
if (!packageJson.license || packageJson.license === 'UNLICENSED') {
  failures.push(`package license is ${packageJson.license ?? 'missing'}`);
}
if (lockfiles.length !== 1) failures.push(`expected exactly one governed lockfile, found ${lockfiles.length}`);
if (!rights.cleared_by || !rights.cleared_at) failures.push('clearance authority/timestamp missing');

if (failures.length) {
  console.error('RELEASE_RIGHTS_HOLD');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(2);
}

console.log('RELEASE_RIGHTS_CLEARED');
console.log(JSON.stringify({
  license: packageJson.license,
  lockfile: lockfiles[0],
  cleared_by: rights.cleared_by,
  cleared_at: rights.cleared_at
}, null, 2));
