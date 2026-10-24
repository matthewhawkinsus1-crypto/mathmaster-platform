// CI03 (the owner's decision, 2026-10-23): the release-tier capability
// certification ran every suite in one job, about 43 minutes, the longest part
// of main's CI. It now runs as parallel shards. These pin that the shards run
// exactly what the one job ran, that each capability's verdict is still decided
// in one place, and that the workflow and the runner agree on the shards.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { executableSource } from './helpers/sourceContract.mjs';
import { jobsOf, readWorkflow, stepsOf } from './helpers/ciWorkflows.mjs';
import {
  CERTIFICATION_SHARDS,
  CERTIFICATION_SUITES,
  CERTIFICATION_TIERS,
  INTERACTIVE_CAPABILITIES,
  NODE_GATE_SHARD,
  shardsForTier,
  suitesForTier,
} from '../../src/platform/certification/interactiveCapabilityManifest.js';

const ids = (suites) => suites.map((suite) => suite.id).sort();

test('the shards together run exactly the suites of every tier, each suite once', () => {
  CERTIFICATION_SUITES.forEach((suite) => assert.ok(CERTIFICATION_SHARDS.includes(suite.shard), `${suite.id} names its shard`));
  for (const tier of CERTIFICATION_TIERS) {
    const sharded = CERTIFICATION_SHARDS.flatMap((shard) => suitesForTier(tier, { shard }));
    assert.deepEqual(ids(sharded), ids(suitesForTier(tier)), `${tier}: no suite lost or run twice`);
  }
  // Every shard has work at the release tier (a shard with none would only spend a runner).
  CERTIFICATION_SHARDS.forEach((shard) => assert.ok(suitesForTier('release', { shard }).length > 0, shard));
});

test("one shard runs the node gate and every capability's browser harness, so each verdict is decided in one place", () => {
  const harnesses = new Set(suitesForTier('release', { shard: NODE_GATE_SHARD }).map((suite) => suite.command[1]));
  INTERACTIVE_CAPABILITIES.forEach((capability) => {
    assert.ok(harnesses.has(capability.browser.harness), `${capability.id}: ${capability.browser.harness} runs in the ${NODE_GATE_SHARD} shard`);
  });
  // Below the release tier only that shard has anything to run.
  assert.deepEqual(shardsForTier('release'), [...CERTIFICATION_SHARDS]);
  assert.deepEqual(shardsForTier('merge'), [NODE_GATE_SHARD]);
  assert.deepEqual(shardsForTier('pr'), [NODE_GATE_SHARD]);
});

test('the workflow runs one job per shard at the release tier and the capabilities shard alone below it, each through the shared setup', () => {
  const jobs = jobsOf(readWorkflow('interactive-capability-certification.yml'));
  assert.deepEqual(Object.keys(jobs), ['certify']);
  const certify = jobs.certify;
  const matrix = certify.match(/^ {8}shard: \$\{\{ fromJSON\((.+)\) \}\}$/m)?.[1];
  assert.ok(matrix, 'the shard matrix');
  const [releaseShards, otherShards, ...rest] = [...matrix.matchAll(/'(\[[^']*\])'/g)].map((match) => JSON.parse(match[1]));
  assert.deepEqual(rest, []);
  assert.deepEqual(releaseShards, shardsForTier('release'));
  assert.deepEqual(otherShards, shardsForTier('merge'));
  // The matrix reads the tier exactly as the runner is told it.
  assert.ok(matrix.startsWith("github.event_name != 'pull_request' && (inputs.tier || 'release') == 'release' && "), matrix);
  assert.match(certify, /CERTIFICATION_TIER: \$\{\{ github\.event_name == 'pull_request' && 'merge' \|\| inputs\.tier \|\| 'release' \}\}/);
  assert.match(certify, /^ {6}fail-fast: false$/m, 'every shard reports, whatever another found');
  const steps = stepsOf(certify);
  assert.ok(steps.some((step) => /uses: \.\/\.github\/actions\/setup\n\s+with: \{ browser: "true" \}/.test(step)), 'the shared setup, with Chromium');
  assert.doesNotMatch(certify, /actions\/setup-node|playwright install/);
  const runner = steps.find((step) => /run: node scripts\/certify-interactive-capabilities\.mjs/.test(step));
  assert.match(runner, /CERTIFICATION_SHARD: \$\{\{ matrix\.shard \}\}/);
  // One artifact per shard: two uploads under one name fail the run.
  assert.match(certify, /name: capability-certification-\$\{\{ matrix\.shard \}\}/);
});

test("the runner runs only its shard's share, the node gate only in its shard, and refuses an unknown shard", () => {
  const runnerSource = executableSource(readFileSync('scripts/certify-interactive-capabilities.mjs', 'utf8'));
  assert.match(runnerSource, /const suites = suitesForTier\(tier, \{ shard \}\);/);
  assert.match(runnerSource, /const runsNodeGate = !shard \|\| shard === NODE_GATE_SHARD;/);

  const reportDir = mkdtempSync(path.join(os.tmpdir(), 'capability-shard-'));
  const { GITHUB_STEP_SUMMARY: _summary, ...env } = process.env;
  try {
    // A shard with nothing at this tier runs nothing: no node gate, no suite.
    const run = spawnSync(process.execPath, ['scripts/certify-interactive-capabilities.mjs', '--tier', 'pr', '--shard', 'question-family-cases', '--report-dir', reportDir], { encoding: 'utf8', env });
    assert.equal(run.status, 0, run.stderr);
    const report = JSON.parse(readFileSync(path.join(reportDir, 'capability-certification-report.json'), 'utf8'));
    assert.equal(report.shard, 'question-family-cases');
    assert.deepEqual([report.capabilities, report.suites], [[], []]);
    assert.match(readFileSync(path.join(reportDir, 'capability-certification-report.md'), 'utf8'), /Reported by another shard at tier \*\*pr\*\*/);
    const unknown = spawnSync(process.execPath, ['scripts/certify-interactive-capabilities.mjs', '--tier', 'pr', '--shard', 'everything', '--report-dir', reportDir], { encoding: 'utf8', env });
    assert.equal(unknown.status, 2);
    assert.match(unknown.stderr, /Unknown shard everything/);
  } finally {
    rmSync(reportDir, { recursive: true, force: true });
  }
});
