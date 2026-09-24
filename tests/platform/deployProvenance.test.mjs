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
