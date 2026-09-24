#!/usr/bin/env node
// Which commit is production actually serving, and what is it missing?
//
//   npm run verify:deployed-build
//   npm run verify:deployed-build -- --url https://mathmaster-aleks.web.app
//
// Reads the public build manifest (mathmaster-build.json, written by
// scripts/build-firebase-hosting.mjs and served uncached since #348), fetches
// origin/main, and lists every merged commit production does not contain.
// Exit 0 when production contains main, 1 otherwise. Read-only: it deploys
// nothing and writes nothing.
import { spawnSync } from 'node:child_process';
import { evaluateLiveBuild } from './lib/deployProvenance.mjs';

const argUrl = (() => {
  const index = process.argv.indexOf('--url');
  return index > -1 ? process.argv[index + 1] : null;
})();
const project = process.env.FIREBASE_PROJECT || 'mathmaster-aleks';
const origin = (argUrl || `https://${project}.web.app`).replace(/\/$/, '');

const git = (args) => {
  const result = spawnSync('git', args, { encoding: 'utf8', timeout: 120_000 });
  return { ok: result.status === 0, out: String(result.stdout || '').trim() };
};
const lines = (text) => String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);

let manifest = null;
try {
  const response = await fetch(`${origin}/mathmaster-build.json?v=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
  if (response.ok) manifest = await response.json();
  else console.error(`GET ${origin}/mathmaster-build.json → HTTP ${response.status}`);
} catch (error) {
  console.error(`Could not read ${origin}/mathmaster-build.json: ${error?.message || error}`);
}

git(['fetch', '--quiet', 'origin', 'main:refs/remotes/origin/main']);
const originMainSha = git(['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main']).out;
const liveSha = String(manifest?.gitSha || '').trim();
const liveFull = liveSha ? git(['rev-parse', '--verify', '--quiet', `${liveSha}^{commit}`]).out : '';
const liveKnownLocally = Boolean(liveFull);
const liveContainsMain = liveKnownLocally && originMainSha
  && spawnSync('git', ['merge-base', '--is-ancestor', originMainSha, liveFull]).status === 0;
const missingFromLive = liveKnownLocally && originMainSha && !liveContainsMain
  ? lines(git(['log', '--oneline', '--no-decorate', `${liveFull}..${originMainSha}`]).out)
  : [];

const verdict = evaluateLiveBuild({ liveSha, originMainSha, liveKnownLocally, liveContainsMain, missingFromLive });

console.log('=== MathMaster live build check ===');
console.log(`Site:        ${origin}`);
console.log(`Live build:  ${liveSha || 'unknown'}${manifest?.builtAt ? ` (built ${manifest.builtAt})` : ''}${manifest?.gitBranch ? ` from ${manifest.gitBranch}` : ''}`);
console.log(`origin/main: ${originMainSha.slice(0, 12) || 'unknown'}`);
console.log('');
console.log(verdict.message);
(verdict.missingFromLive || []).forEach((line) => console.log(`    not in production  ${line}`));
if (!verdict.ok) {
  console.log('');
  console.log('To publish current main from Cloud Shell:');
  console.log('  cd ~/mathmaster-platform && git checkout main && git pull --ff-only origin main && npm run deploy:hosting');
}
process.exit(verdict.ok ? 0 : 1);
