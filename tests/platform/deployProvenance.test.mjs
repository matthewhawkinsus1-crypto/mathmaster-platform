import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DEPLOY_OVERRIDE_ENV,
  evaluateDeployProvenance,
  evaluateLiveBuild,
  formatDeployProvenanceReport,
} from '../../scripts/lib/deployProvenance.mjs';

// A DEPLOY MUST CONTAIN CURRENT MAIN (Job 1 root cause).
//
// #337 refuses a stale dist/, #348 proves the public site serves the commit
// that was built. Neither asks whether that commit is current main — and PRs
// #345 and #346 were built in parallel from the same base, so a deploy from
// either branch silently removed the other's work from production.

const current = {
  headSha: 'a'.repeat(40),
  branch: 'main',
  mainFetched: true,
  originMainSha: 'a'.repeat(40),
  headContainsMain: true,
  missingFromBuild: [],
  dirtyFiles: [],
};

test('a clean checkout of current main is allowed', () => {
  const decision = evaluateDeployProvenance(current);
  assert.equal(decision.ok, true);
  assert.deepEqual(decision.problems, []);
});

test('a branch that contains main (a hotfix on top of main) is allowed, and says unmerged work goes live', () => {
  const decision = evaluateDeployProvenance({ ...current, branch: 'hotfix/x', headSha: 'b'.repeat(40), aheadOfMain: 2 });
  assert.equal(decision.ok, true);
  assert.equal(decision.warnings[0].code, 'aheadOfMain');
  assert.match(formatDeployProvenanceReport(decision), /2 commit\(s\) that are not merged to main/);
});

test('a checkout behind main is refused and names every commit it would remove', () => {
  const decision = evaluateDeployProvenance({
    ...current,
    branch: 'fix/elimination-direct-equation-flow',
    headContainsMain: false,
    missingFromBuild: ['6d9570a Step Algebra: student-driven factoring, fraction splitting and reduction (#346)'],
  });
  assert.equal(decision.ok, false);
  assert.equal(decision.problems[0].code, 'behindMain');
  assert.deepEqual(decision.problems[0].missingFromBuild, ['6d9570a Step Algebra: student-driven factoring, fraction splitting and reduction (#346)']);
  assert.match(formatDeployProvenanceReport(decision), /missing\s+6d9570a .*#346/);
  assert.match(formatDeployProvenanceReport(decision), new RegExp(DEPLOY_OVERRIDE_ENV.behindMain));
});

test('uncommitted changes and an unverifiable main are refused', () => {
  assert.equal(evaluateDeployProvenance({ ...current, dirtyFiles: [' M src/App.jsx'] }).problems[0].code, 'dirtyWorkingTree');
  assert.equal(evaluateDeployProvenance({ ...current, mainFetched: false }).problems[0].code, 'mainUnverifiable');
});

test('an explicit override turns a refusal into a recorded warning, never silently', () => {
  const decision = evaluateDeployProvenance({ ...current, headContainsMain: false, missingFromBuild: ['x'] }, { behindMain: true });
  assert.equal(decision.ok, true);
  assert.equal(decision.warnings[0].code, 'behindMain');
  assert.equal(decision.warnings[0].overridden, true);
  assert.match(formatDeployProvenanceReport(decision), /OVERRIDDEN/);
});

test('the live-build check distinguishes current, behind, and unknown builds', () => {
  assert.equal(evaluateLiveBuild({ liveSha: 'aaaaaaaaaaaa', originMainSha: 'a'.repeat(40) }).status, 'current');
  const behind = evaluateLiveBuild({ liveSha: 'bbbbbbbbbbbb', originMainSha: 'a'.repeat(40), liveKnownLocally: true, liveContainsMain: false, missingFromLive: ['x', 'y'] });
  assert.equal(behind.status, 'behindMain');
  assert.equal(behind.ok, false);
  assert.equal(evaluateLiveBuild({ liveSha: 'cccccccccccc', originMainSha: 'a'.repeat(40), liveKnownLocally: false }).status, 'unknownCommit');
  assert.equal(evaluateLiveBuild({ liveSha: '', originMainSha: 'a'.repeat(40) }).status, 'unknownLiveBuild');
});

test('the resilient Hosting wrapper checks provenance before it builds or uploads anything', () => {
  const script = fs.readFileSync('scripts/deploy-hosting-resilient.sh', 'utf8');
  const guard = script.indexOf('node scripts/check-deploy-provenance.mjs');
  assert.ok(guard > -1, 'the wrapper must run the provenance check');
  assert.ok(guard < script.indexOf('npm run build:firebase'), 'provenance is checked before the build');
  assert.ok(guard < script.indexOf('firebase deploy --only hosting'), 'provenance is checked before the upload');
  assert.match(script.slice(guard, guard + 300), /exit 5/, 'a refusal stops the deploy');
});

test('the provenance CLI compares HEAD with a freshly fetched origin/main', () => {
  const cli = fs.readFileSync('scripts/check-deploy-provenance.mjs', 'utf8');
  assert.match(cli, /'fetch', '--quiet', 'origin', 'main:refs\/remotes\/origin\/main'/);
  assert.match(cli, /'merge-base', '--is-ancestor', originMainSha, 'HEAD'/);
  assert.match(cli, /process\.exit\(decision\.ok \? 0 : 5\)/);
});

test('the public build manifest records where the build came from', () => {
  const build = fs.readFileSync('scripts/build-firebase-hosting.mjs', 'utf8');
  const manifest = build.slice(build.indexOf("resolve('dist/mathmaster-build.json')"));
  assert.match(manifest, /gitBranch,/);
  assert.match(manifest, /gitDirty,/);
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.equal(pkg.scripts['verify:deployed-build'], 'node scripts/verify-deployed-build.mjs');
});

// A DEPLOY MUST HAVE PASSED CI (the CI gate of .github/workflows/ci.yml).
//
// The browser gates were red on the merged head of #510, #511 and #513: main
// contained them, so provenance passed, and any of those commits could have
// been deployed.

test('a commit whose CI gate passed is allowed; failed, running, missing or unreadable is refused', async () => {
  const { ciGateFromWorkflowRuns } = await import('../../scripts/lib/ciGateStatus.mjs');
  assert.equal(evaluateDeployProvenance({ ...current, ci: { state: 'passed' } }).ok, true);
  const refused = {
    failed: 'ciFailed', running: 'ciRunning', missing: 'ciMissing', unknown: 'ciUnverifiable',
  };
  for (const [state, code] of Object.entries(refused)) {
    const decision = evaluateDeployProvenance({ ...current, ci: { state, url: 'https://github.com/x/y/runs/1' } });
    assert.equal(decision.ok, false, state);
    assert.equal(decision.problems[0].code, code);
    assert.match(formatDeployProvenanceReport(decision), /Deploy refused: this commit has not passed CI/);
    assert.match(formatDeployProvenanceReport(decision), new RegExp(DEPLOY_OVERRIDE_ENV.unverifiedCi));
  }
  // The states come from ci.yml's runs for a push of the commit to main.
  const run = (status, conclusion, created = '2026-10-22T14:00:00Z') => ({
    path: '.github/workflows/ci.yml', event: 'push', head_branch: 'main', head_sha: 'abc123',
    status, conclusion, created_at: created, run_started_at: created, html_url: 'u',
  });
  const state = (...runs) => ciGateFromWorkflowRuns({ workflow_runs: runs }, 'abc123').state;
  assert.equal(state(run('completed', 'success')), 'passed');
  assert.equal(state(run('completed', 'failure')), 'failed');
  assert.equal(state(run('completed', 'cancelled')), 'failed', 'a cancelled run is not a pass');
  assert.equal(state(run('in_progress', null)), 'running');
  assert.equal(state(run('completed', 'failure', '2026-10-22T13:00:00Z'), run('completed', 'success', '2026-10-22T14:00:00Z')), 'passed', 'the latest run decides');
  assert.equal(state(run('completed', 'success', '2026-10-22T13:00:00Z'), run('queued', null, '2026-10-22T14:00:00Z')), 'running', 'the latest run decides');
  assert.equal(ciGateFromWorkflowRuns({}, 'abc123').state, 'missing');
});

// A pull request's run reports "CI gate" on its head commit after skipping the
// workflows whose area it did not change. Pushed to main as it is, that commit
// must still wait for main's own run, which runs every workflow.
test('only ci.yml\'s run for a push to main counts, not a pull request\'s run of the same commit', async () => {
  const { ciGateFromWorkflowRuns } = await import('../../scripts/lib/ciGateStatus.mjs');
  const main = {
    path: '.github/workflows/ci.yml', event: 'push', head_branch: 'main', head_sha: 'abc123',
    status: 'in_progress', conclusion: null, created_at: '2026-10-22T14:00:00Z',
  };
  const pullRequest = { ...main, event: 'pull_request', head_branch: 'feature', status: 'completed', conclusion: 'success', created_at: '2026-10-22T13:00:00Z' };
  const state = (...runs) => ciGateFromWorkflowRuns({ workflow_runs: runs }, 'abc123').state;
  assert.equal(state(pullRequest, main), 'running', 'main\'s run is still going');
  assert.equal(state(pullRequest), 'missing', 'main has not run it');
  const passed = { ...main, status: 'completed', conclusion: 'success' };
  assert.equal(state(passed), 'passed');
  assert.equal(state({ ...passed, path: '.github/workflows/full-platform-suite.yml' }), 'missing', 'another workflow');
  assert.equal(state({ ...passed, event: 'workflow_dispatch' }), 'missing', 'a manual run');
  assert.equal(state({ ...passed, head_branch: 'release' }), 'missing', 'another branch');
  assert.equal(state({ ...passed, head_sha: 'def456' }), 'missing', 'another commit');
});

test('an override deploys an unverified commit only as a recorded warning', () => {
  const decision = evaluateDeployProvenance({ ...current, ci: { state: 'failed' } }, { unverifiedCi: true });
  assert.equal(decision.ok, true);
  assert.equal(decision.warnings[0].code, 'ciFailed');
  assert.match(formatDeployProvenanceReport(decision), /OVERRIDDEN/);
});

test('the CI result is read from GitHub for the exact commit, and an unreachable GitHub is never a pass', async () => {
  const { fetchCiGate, repoFromRemote } = await import('../../scripts/lib/ciGateStatus.mjs');
  assert.equal(repoFromRemote('https://github.com/matthewhawkinsus1-crypto/mathmaster-platform.git'), 'matthewhawkinsus1-crypto/mathmaster-platform');
  assert.equal(repoFromRemote('git@github.com:matthewhawkinsus1-crypto/mathmaster-platform.git'), 'matthewhawkinsus1-crypto/mathmaster-platform');
  assert.equal(repoFromRemote('http://127.0.0.1:1234/git/matthewhawkinsus1-crypto/mathmaster-platform'), 'matthewhawkinsus1-crypto/mathmaster-platform');
  let asked = null;
  const ok = await fetchCiGate({
    repo: 'o/r',
    sha: 'abc123',
    token: 't',
    fetchImpl: async (url, init) => {
      asked = { url, init };
      return {
        ok: true,
        json: async () => ({ workflow_runs: [{ path: '.github/workflows/ci.yml', event: 'push', head_branch: 'main', head_sha: 'abc123', status: 'completed', conclusion: 'success' }] }),
      };
    },
  });
  assert.equal(ok.state, 'passed');
  assert.match(asked.url, /^https:\/\/api\.github\.com\/repos\/o\/r\/actions\/workflows\/ci\.yml\/runs\?event=push&branch=main&head_sha=abc123&/);
  assert.equal(asked.init.headers.Authorization, 'Bearer t');
  assert.equal((await fetchCiGate({ repo: 'o/r', sha: 'abc', fetchImpl: async () => ({ ok: false, status: 403 }) })).state, 'unknown');
  assert.equal((await fetchCiGate({ repo: 'o/r', sha: 'abc', fetchImpl: async () => { throw new Error('offline'); } })).state, 'unknown');
  assert.equal((await fetchCiGate({ repo: null, sha: 'abc' })).state, 'unknown');
});

test('the provenance CLI reads the CI result for HEAD and hands it to the decision', async () => {
  const { CI_WORKFLOW } = await import('../../scripts/lib/ciGateStatus.mjs');
  const cli = fs.readFileSync('scripts/check-deploy-provenance.mjs', 'utf8');
  assert.match(cli, /const ci = await fetchCiGate\(\{ repo, sha: headSha/);
  assert.match(cli, /dirtyFiles, ci \}/, 'the decision sees the CI result');
  assert.match(cli, /unverifiedCi: flag\(DEPLOY_OVERRIDE_ENV\.unverifiedCi\)/);
  const ciWorkflow = fs.readFileSync(CI_WORKFLOW, 'utf8');
  assert.match(ciWorkflow, /^ {2}push:\n {4}branches: \[main\]$/m, 'the run it reads is ci.yml\'s for a push to main');
  assert.match(ciWorkflow, /^ {4}name: CI gate$/m);
});

// Every way to deploy runs that check first. Ten of them (eight scripts and two
// npm commands) once called `firebase deploy` with no provenance check at all.
test('every way to deploy proves provenance and CI before its first firebase deploy', () => {
  const executable = (text) => text.split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
  const shells = fs.readdirSync('scripts').filter((name) => name.endsWith('.sh'));
  let deployers = 0;
  for (const name of shells) {
    const text = executable(fs.readFileSync(`scripts/${name}`, 'utf8'));
    const deploy = text.search(/firebase deploy|deploy-hosting-resilient\.sh|deploy-functions-in-groups\.sh/);
    if (deploy < 0 || name === 'deploy-hosting-resilient.sh') continue;
    deployers += 1;
    const guard = text.search(/node scripts\/check-deploy-provenance\.mjs|bash scripts\/deploy-hosting-resilient\.sh/);
    assert.ok(guard > -1 && guard <= deploy, `scripts/${name} deploys before proving provenance`);
  }
  assert.ok(deployers >= 8, `found ${deployers} deploy scripts`);
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  for (const [name, command] of Object.entries(pkg.scripts)) {
    if (/firebase deploy/.test(command)) assert.match(command, /^node scripts\/check-deploy-provenance\.mjs && /, `npm run ${name}`);
  }
  const release = fs.readFileSync('scripts/release-firebase.mjs', 'utf8');
  const gate = release.indexOf("gate('Deploy provenance");
  assert.ok(gate > -1 && gate < release.indexOf('await executeReleasePlan('), 'release-firebase.mjs checks before it deploys');
  assert.match(release.slice(gate, gate + 200), /scripts\/check-deploy-provenance\.mjs/);
});
