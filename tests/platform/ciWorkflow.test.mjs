// ONE ENTRY POINT, ONE REQUIRED CHECK.
//
// Branch protection requires a single check, "CI gate", from
// .github/workflows/ci.yml. That is only as good as what the gate waits on. A
// workflow that triggers itself would run outside it (a red result nothing
// stops), and one the gate does not wait on would be advisory. Before this, the
// browser gates were red on the merged head of #510, #511 and #513, and a
// nightly that timed out every night for ten days went unreported.
//
// These pin: every workflow that guards main is called by ci.yml and waited on
// by the gate; nothing else triggers on pull requests or pushes; a pull request
// runs a workflow exactly when it changes a file in that workflow's area
// (scripts/lib/ciAreas.mjs), read by GitHub's rule; a push to main runs
// everything; and the gate fails on anything but passed or skipped.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { CI_AREAS, RUN_EVERYTHING, changedAreas, patternRegExp, reachedBy } from '../../scripts/lib/ciAreas.mjs';
import { gateVerdict } from '../../scripts/lib/ciGate.mjs';
import { calledWorkflows, jobsOf, readWorkflow, triggersOf, workflowFiles } from './helpers/ciWorkflows.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ci = readWorkflow('ci.yml');
const ciJobs = jobsOf(ci);
const calls = calledWorkflows();

/* --- the wiring ------------------------------------------------------------ */

test('ci.yml runs on pull requests to main and on pushes to main, and is the only workflow that does', () => {
  const triggers = triggersOf(ci);
  assert.match(triggers, /^ {2}pull_request:\n {4}branches: \[main\]$/m);
  assert.match(triggers, /^ {2}push:\n {4}branches: \[main\]$/m);
  for (const name of workflowFiles().filter((file) => file !== 'ci.yml')) {
    assert.doesNotMatch(triggersOf(readWorkflow(name)), /^ {2}(pull_request|pull_request_target|push):/m,
      `${name} triggers itself: it would run outside the CI gate`);
  }
});

test('a new push to a pull request replaces its run; a push to main is checked to the end', () => {
  assert.match(ci, /^concurrency:\n {2}group: ci-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}\n {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}$/m);
});

test('every workflow ci.yml can call is called, once, and every call is to a callable workflow', () => {
  const callable = workflowFiles().filter((name) => /^ {2}workflow_call:/m.test(triggersOf(readWorkflow(name))));
  const called = Object.values(calls).map(({ workflow }) => workflow).sort();
  assert.deepEqual(called, [...new Set(called)], 'no workflow is called twice');
  assert.deepEqual(called, callable, 'the callable workflows and the called ones are the same set');
  assert.ok(called.length >= 10, `${called.length} workflows`);
});

test('the gate waits on every other job, runs whatever happened, and judges them with ci-gate.mjs', () => {
  const gate = ciJobs.gate;
  assert.ok(gate, 'ci.yml has a gate job');
  assert.match(gate, /^ {4}name: CI gate$/m, 'branch protection requires it by this name');
  assert.match(gate, /^ {4}if: always\(\)$/m, 'a cancelled or failed run still reports a gate, which fails');
  const needs = [...gate.slice(gate.indexOf('needs:')).matchAll(/^ {6}- ([\w-]+)$/gm)].map((match) => match[1]).sort();
  const others = Object.keys(ciJobs).filter((job) => job !== 'gate').sort();
  assert.deepEqual(needs, others, 'every job in ci.yml is in the gate\'s needs');
  assert.match(gate, /NEEDS: \$\{\{ toJSON\(needs\) \}\}\n\s+run: node scripts\/ci-gate\.mjs/);
});

test('each area job runs its own workflow when its own area changed; full-platform-suite.yml always runs', () => {
  for (const [area] of Object.entries(CI_AREAS)) {
    const call = calls[area];
    assert.ok(call, `ci.yml has a job ${area}`);
    assert.equal(call.workflow, `${area}.yml`);
    assert.equal(call.needs, 'changes');
    assert.equal(call.condition, `fromJSON(needs.changes.outputs.areas)['${area}']`);
  }
  const unconditional = Object.entries(calls).filter(([, call]) => !call.condition).map(([job]) => job);
  assert.deepEqual(unconditional, ['full-platform-suite'], 'only the full suite runs on every pull request');
  assert.ok(!('full-platform-suite' in CI_AREAS));
  // The other way round: a job whose area is missing would read null from the
  // areas and be skipped on every pull request, silently.
  for (const [job, call] of Object.entries(calls).filter(([, entry]) => entry.condition)) {
    assert.ok(job in CI_AREAS, `ci.yml's ${job} has an area in scripts/lib/ciAreas.mjs`);
    assert.equal(call.condition, `fromJSON(needs.changes.outputs.areas)['${job}']`);
  }
});

test('the changed-areas job diffs the merge against its base and hands the areas on', () => {
  const changes = ciJobs.changes;
  assert.match(changes, /fetch-depth: 2/, 'the merge commit and its first parent');
  assert.match(changes, /run: node scripts\/ci-changed-areas\.mjs/);
  assert.match(changes, /areas: \$\{\{ steps\.areas\.outputs\.areas \}\}/);
});

test('no called workflow sets its own concurrency (it would cancel a nightly, or main\'s run, from inside ci.yml)', () => {
  for (const { workflow } of Object.values(calls)) {
    assert.doesNotMatch(readWorkflow(workflow), /^concurrency:/m, workflow);
  }
});

/* --- the matching rule ----------------------------------------------------- */

test('patterns are read as GitHub reads `paths`: * within a folder, ** across, dotfiles included, last match wins', () => {
  assert.equal(reachedBy('src/a/b.js', ['src/**']), true);
  assert.equal(reachedBy('src/a/.hidden', ['src/**']), true, '** reaches dotfiles, as GitHub does');
  assert.equal(reachedBy('tests/browser/secureResults.mjs', ['tests/browser/secure*']), true);
  assert.equal(reachedBy('tests/browser/sub/secureResults.mjs', ['tests/browser/secure*']), false, '* stays in its folder');
  assert.equal(reachedBy('src/a/b.js', ['src/**', '!src/a/**']), false);
  assert.equal(reachedBy('src/a/b.js', ['!src/a/**', 'src/**']), true, 'order matters');
  assert.equal(reachedBy('SAMPLE_X_ASSIGNMENT_Y.json', ['SAMPLE_*ASSIGNMENT*.json']), true);
  assert.equal(reachedBy('srcXfile.js', ['src.file.js']), false, 'a dot is a dot');
  assert.equal(patternRegExp('a/**').test('a'), false, 'a folder pattern does not match the bare name');
});

test('no area uses pattern syntax GitHub reads differently from this matcher', () => {
  for (const [area, patterns] of Object.entries({ ...CI_AREAS, RUN_EVERYTHING })) {
    for (const pattern of patterns) {
      assert.doesNotMatch(pattern.replace(/^!/, ''), /[?+[\]{}!]/, `${area}: ${pattern}`);
      assert.doesNotMatch(pattern, /^\/|\/$/, `${area}: ${pattern} is a repository path`);
    }
  }
});

test('a pull request runs exactly the areas its files reach; CI changes and unknown changes run everything', () => {
  const none = changedAreas(['docs/handoffs/anything.md']);
  assert.deepEqual(Object.values(none).filter(Boolean), [], 'a docs change runs only the full suite');
  const driver = changedAreas(['tests/browser/secureExamNavigation.mjs']);
  assert.equal(driver['student-runtime-browser-gates'], true);
  assert.equal(driver['student-teacher-journeys'], false);
  for (const file of ['.github/workflows/ci.yml', '.github/actions/setup/action.yml', 'scripts/lib/ciAreas.mjs']) {
    assert.ok(Object.values(changedAreas([file])).every(Boolean), `${file} runs every workflow`);
  }
  assert.ok(Object.values(changedAreas(null)).every(Boolean), 'an unknown change runs every workflow');
});

/* --- the script ------------------------------------------------------------ */

const runAreas = (cwd, env) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ci-areas-out-'));
  const output = path.join(dir, 'out');
  writeFileSync(output, '');
  const run = spawnSync(process.execPath, [path.join(repo, 'scripts/ci-changed-areas.mjs')], {
    cwd,
    encoding: 'utf8',
    env: { PATH: process.env.PATH, GITHUB_OUTPUT: output, ...env },
  });
  const line = readFileSync(output, 'utf8').match(/^areas=(.*)$/m);
  rmSync(dir, { recursive: true, force: true });
  return { status: run.status, stdout: run.stdout, areas: line ? JSON.parse(line[1]) : null };
};

test('on a push to main, or a manual run, the script calls every workflow', () => {
  for (const event of ['push', 'workflow_dispatch']) {
    const { status, areas } = runAreas(repo, { GITHUB_EVENT_NAME: event });
    assert.equal(status, 0);
    assert.deepEqual(Object.keys(areas).sort(), Object.keys(CI_AREAS).sort());
    assert.ok(Object.values(areas).every(Boolean), `${event} runs every workflow`);
  }
});

test('on a pull request the script reads the merge commit against its base', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ci-areas-repo-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'ci@example.invalid');
    git('config', 'user.name', 'ci');
    mkdirSync(path.join(dir, 'tests/browser'), { recursive: true });
    writeFileSync(path.join(dir, 'README.md'), 'base\n');
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    git('checkout', '-q', '-b', 'feature');
    writeFileSync(path.join(dir, 'tests/browser/secureResults.mjs'), 'changed\n');
    git('add', '.');
    git('commit', '-q', '-m', 'change a driver');
    git('checkout', '-q', 'main');
    writeFileSync(path.join(dir, 'docs.md'), 'main moved on\n');
    git('add', '.');
    git('commit', '-q', '-m', 'main moved on');
    git('merge', '-q', '--no-ff', '-m', 'merge', 'feature');
    const { status, areas } = runAreas(dir, { GITHUB_EVENT_NAME: 'pull_request' });
    assert.equal(status, 0);
    assert.equal(areas['student-runtime-browser-gates'], true, 'the changed driver runs its workflow');
    assert.equal(areas['student-teacher-journeys'], false, 'a workflow whose area did not change is skipped');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a pull request whose change cannot be read runs everything', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ci-areas-nogit-'));
  try {
    const { status, areas, stdout } = runAreas(dir, { GITHUB_EVENT_NAME: 'pull_request' });
    assert.equal(status, 0);
    assert.ok(Object.values(areas).every(Boolean));
    assert.match(stdout, /could not read the change/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* --- the verdict ----------------------------------------------------------- */

test('the gate passes when everything that ran passed and the rest was skipped', () => {
  const verdict = gateVerdict({
    changes: { result: 'success' },
    'full-platform-suite': { result: 'success' },
    'theme-certification': { result: 'skipped' },
  });
  assert.equal(verdict.ok, true, verdict.problems.join('; '));
});

test('the gate fails on a failure, a cancellation, an unknown result, or a changed-areas job that did not succeed', () => {
  const base = { changes: { result: 'success' }, 'full-platform-suite': { result: 'success' } };
  for (const result of ['failure', 'cancelled', 'timed_out', undefined]) {
    assert.equal(gateVerdict({ ...base, 'student-runtime-browser-gates': { result } }).ok, false, String(result));
  }
  assert.equal(gateVerdict({ ...base, changes: { result: 'failure' } }).ok, false, 'skipped areas prove nothing if the areas were never computed');
  assert.equal(gateVerdict({ changes: { result: 'success' }, 'full-platform-suite': { result: 'skipped' } }).ok, false, 'a run where nothing ran is not a pass');
});

test('the gate script exits non-zero on a failed workflow and zero on a pass', () => {
  const run = (needs) => spawnSync(process.execPath, [path.join(repo, 'scripts/ci-gate.mjs')], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, NEEDS: JSON.stringify(needs) },
  }).status;
  assert.equal(run({ changes: { result: 'success' }, 'full-platform-suite': { result: 'success' } }), 0);
  assert.equal(run({ changes: { result: 'success' }, 'full-platform-suite': { result: 'failure' } }), 1);
  assert.equal(spawnSync(process.execPath, [path.join(repo, 'scripts/ci-gate.mjs')], { env: { PATH: process.env.PATH, NEEDS: 'not json' } }).status, 1);
});
