#!/usr/bin/env node
/*
 * Fails when node_modules differs from the committed package-lock.json
 * (scripts/lib/lockfileInstall.mjs). The browser workflows run it after adding
 * Playwright, so a gate never certifies dependencies production does not build.
 *
 *   npm ci && npm install --no-save playwright@1.55.0 && node scripts/check-lockfile-install.mjs
 *
 * The lockfile is read from git HEAD, so an install that rewrote it on disk
 * still fails.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { installDriftFromLockfile } from './lib/lockfileInstall.mjs';

const root = process.cwd();
const lock = JSON.parse(execFileSync('git', ['show', 'HEAD:package-lock.json'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
const installedVersion = (installPath) => {
  const file = path.join(root, installPath, 'package.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).version : null;
};

const { changed, missing } = installDriftFromLockfile(lock, installedVersion);
const checked = Object.keys(lock.packages || {}).filter(Boolean).length;
if (!changed.length && !missing.length) {
  console.log(`node_modules matches package-lock.json (${checked} packages).`);
  process.exit(0);
}
console.error(`node_modules does not match package-lock.json: ${changed.length} changed, ${missing.length} missing.`);
for (const line of changed) console.error(`  changed  ${line}`);
for (const line of missing) console.error(`  missing  ${line}`);
console.error('Install with `npm ci`; add a CI-only package with `npm install --no-save <pkg>@<version>`, never with --package-lock=false.');
process.exit(1);
