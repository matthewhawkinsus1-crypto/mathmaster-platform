// BROWSER GATES RUN THE DEPENDENCIES PRODUCTION BUILDS.
//
// Every browser workflow adds Playwright after `npm ci`. With
// `--package-lock=false` that install re-resolved the whole tree: 126 locked
// packages changed on each run (react, react-dom, firebase, vite among them).
// On Oct 14, 2026 it picked up react 19.3.1 two minutes before react-dom 19.3.1
// was published, and the app refused to start in two certifications on main.
//
// The workflows now add Playwright on top of the lockfile and then run
// scripts/check-lockfile-install.mjs, which fails if anything differs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { installDriftFromLockfile } from '../../scripts/lib/lockfileInstall.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflowDir = path.join(root, '.github/workflows');
const workflows = readdirSync(workflowDir)
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => ({ name, text: readFileSync(path.join(workflowDir, name), 'utf8') }));

/* --- the workflows ------------------------------------------------------- */

test('no workflow installs packages without the lockfile', () => {
  for (const { name, text } of workflows) {
    assert.doesNotMatch(text, /--package-lock=false|--no-package-lock/, `${name} bypasses package-lock.json`);
  }
});

test('every package added after npm ci is checked against the lockfile in the same step', () => {
  const installs = workflows.flatMap(({ name, text }) => text.split('\n')
    .filter((line) => /\bnpm (install|i|add)\b/.test(line))
    .map((line) => ({ name, line: line.trim() })));
  assert.ok(installs.length >= 16, `found ${installs.length} installs; the browser workflows have 16`);
  for (const { name, line } of installs) {
    assert.match(line, /--no-save\b/, `${name}: ${line} would rewrite package.json`);
    assert.match(line, /&& node scripts\/check-lockfile-install\.mjs$/, `${name}: ${line} is not checked`);
  }
});

/* --- the comparison ------------------------------------------------------ */

const lockFor = (packages) => ({ lockfileVersion: 3, packages: { '': { name: 'app' }, ...packages } });
const LOCK = lockFor({
  'node_modules/react': { version: '19.2.8' },
  'node_modules/react-dom': { version: '19.2.8' },
  'node_modules/pkg/node_modules/nested': { version: '1.0.0' },
  'node_modules/@rollup/rollup-darwin-arm64': { version: '4.0.0', optional: true },
  'node_modules/fsevents': { version: '2.3.3', dev: true, optional: true },
  'node_modules/local-tool': { resolved: 'tools/local', link: true },
});

test('an install that matches the lockfile has no drift, whatever else was added', () => {
  const installed = {
    'node_modules/react': '19.2.8',
    'node_modules/react-dom': '19.2.8',
    'node_modules/pkg/node_modules/nested': '1.0.0',
    'node_modules/playwright': '1.55.0',
  };
  assert.deepEqual(installDriftFromLockfile(LOCK, (p) => installed[p] ?? null), { changed: [], missing: [] });
});

test('a changed version or a missing required package is reported; optional ones may be absent', () => {
  const installed = { 'node_modules/react': '19.3.1', 'node_modules/react-dom': '19.3.0' };
  assert.deepEqual(installDriftFromLockfile(LOCK, (p) => installed[p] ?? null), {
    changed: ['react 19.2.8 -> 19.3.1', 'react-dom 19.2.8 -> 19.3.0'],
    missing: ['pkg/node_modules/nested 1.0.0'],
  });
});

/* --- the script, in a repository ----------------------------------------- */

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
const install = (dir, name, version) => {
  mkdirSync(path.join(dir, 'node_modules', name), { recursive: true });
  writeFileSync(path.join(dir, 'node_modules', name, 'package.json'), JSON.stringify({ name, version }));
};
const runCheck = (cwd) => spawnSync(process.execPath, [path.join(root, 'scripts/check-lockfile-install.mjs')], { cwd, encoding: 'utf8' });

test('the check passes on a lockfile install and fails on drift, even when the lockfile on disk was rewritten', (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lockfile-install-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const lock = lockFor({ 'node_modules/react': { version: '19.2.8' }, 'node_modules/react-dom': { version: '19.2.8' } });
  writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify(lock));
  git(dir, 'init', '-q');
  git(dir, 'add', 'package-lock.json');
  git(dir, '-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'lock');

  install(dir, 'react', '19.2.8');
  install(dir, 'react-dom', '19.2.8');
  install(dir, 'playwright', '1.55.0');
  const clean = runCheck(dir);
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /matches package-lock\.json \(2 packages\)/);

  install(dir, 'react', '19.3.1');
  lock.packages['node_modules/react'].version = '19.3.1';
  writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify(lock));
  const drift = runCheck(dir);
  assert.equal(drift.status, 1);
  assert.match(drift.stderr, /changed {2}react 19\.2\.8 -> 19\.3\.1/);
});
