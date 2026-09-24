#!/usr/bin/env node
// Refuse a Hosting deploy whose build does not contain current origin/main.
//
//   node scripts/check-deploy-provenance.mjs            (exit 5 when refused)
//   node scripts/check-deploy-provenance.mjs --json     (machine-readable)
//
// Called by scripts/deploy-hosting-resilient.sh before it builds. See
// scripts/lib/deployProvenance.mjs for why.
import { spawnSync } from 'node:child_process';
import {
  DEPLOY_OVERRIDE_ENV,
  evaluateDeployProvenance,
  formatDeployProvenanceReport,
} from './lib/deployProvenance.mjs';

const git = (args, { timeout = 60_000 } = {}) => {
  const result = spawnSync('git', args, { encoding: 'utf8', timeout });
  return { ok: result.status === 0, out: String(result.stdout || '').trim(), err: String(result.stderr || '').trim() };
};

const lines = (text) => String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
const flag = (name) => ['1', 'true', 'yes'].includes(String(process.env[name] || '').toLowerCase());

const headSha = git(['rev-parse', 'HEAD']).out;
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).out;
const fetched = git(['fetch', '--quiet', 'origin', 'main:refs/remotes/origin/main'], { timeout: 120_000 });
const originMainSha = git(['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main']).out;
const mainFetched = fetched.ok && Boolean(originMainSha);
const headContainsMain = mainFetched
  && spawnSync('git', ['merge-base', '--is-ancestor', originMainSha, 'HEAD']).status === 0;
const missingFromBuild = mainFetched && !headContainsMain
  ? lines(git(['log', '--oneline', '--no-decorate', `HEAD..${originMainSha}`]).out)
  : [];
const aheadOfMain = mainFetched && headContainsMain
  ? Number(git(['rev-list', '--count', `${originMainSha}..HEAD`]).out) || 0
  : 0;
const dirtyFiles = lines(git(['status', '--porcelain', '--untracked-files=no']).out);

const decision = evaluateDeployProvenance(
  { headSha, branch: branch === 'HEAD' ? '' : branch, mainFetched, originMainSha, headContainsMain, aheadOfMain, missingFromBuild, dirtyFiles },
  {
    behindMain: flag(DEPLOY_OVERRIDE_ENV.behindMain),
    dirty: flag(DEPLOY_OVERRIDE_ENV.dirty),
    unverifiedMain: flag(DEPLOY_OVERRIDE_ENV.unverifiedMain),
  },
);

if (process.argv.includes('--json')) {
  process.stdout.write(`${JSON.stringify(decision, null, 2)}\n`);
} else {
  console.log(formatDeployProvenanceReport(decision));
  if (!mainFetched && fetched.err) console.error(`git fetch: ${fetched.err}`);
}

process.exit(decision.ok ? 0 : 5);
