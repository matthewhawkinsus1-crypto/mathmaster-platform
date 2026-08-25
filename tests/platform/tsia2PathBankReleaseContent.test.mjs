import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const CURRENT_RELEASE = 'tsia2-v2.1-authentic-language';

test('TSIA2 path-bank release planner retires only stale active TSIA2 runtime state', async () => {
  const release = await import('../../functions/shared/pathBankRelease.mjs');
  assert.equal(release.TSIA2_PATH_BANK_RELEASE, CURRENT_RELEASE);

  const plan = release.planTsia2PathBankReleaseMigration({
    storedRelease: 'tsia2-v2.0',
    sessions: [
      { id: 'tsi-active', assessmentFramework: 'tsia2', status: 'active' },
      { id: 'tsi-complete', assessmentFramework: 'tsia2', status: 'completed' },
      { id: 'sat-active', assessmentFramework: 'digitalSAT', status: 'active' },
      { id: 'act-active', assessmentFramework: 'act', status: 'active' },
      { id: 'course-active', assessmentFramework: null, status: 'active' },
    ],
    locks: [
      { id: 'tsi-lock', assessmentFramework: 'tsia2' },
      { id: 'sat-lock', assessmentFramework: 'digitalSAT' },
      { id: 'course-lock', assessmentFramework: null },
    ],
  });

  assert.equal(plan.noop, false);
  assert.equal(plan.release, CURRENT_RELEASE);
  assert.deepEqual(plan.sessionIdsToRetire, ['tsi-active']);
  assert.deepEqual(plan.lockIdsToDelete, ['tsi-lock']);
});

test('TSIA2 path-bank release migration is a no-op once the current release is recorded', async () => {
  const release = await import('../../functions/shared/pathBankRelease.mjs');
  const plan = release.planTsia2PathBankReleaseMigration({
    storedRelease: CURRENT_RELEASE,
    sessions: [{ id: 'new-tsi-active', assessmentFramework: 'tsia2', status: 'active' }],
    locks: [{ id: 'new-tsi-lock', assessmentFramework: 'tsia2' }],
  });

  assert.deepEqual(plan, {
    noop: true,
    release: CURRENT_RELEASE,
    sessionIdsToRetire: [],
    lockIdsToDelete: [],
  });
});

test('built-in Path seed refresh retires stale TSIA2 runtime state only after bank and coverage refresh succeed', () => {
  const source = fs.readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  assert.match(source, /\.\/shared\/pathBankRelease\.mjs/);
  const removeIndex = source.indexOf('removeSupersededBuiltInPathSeedRecords(db, taggedItems)');
  const coverageIndex = source.indexOf('rebuildStoredPathCoverage(db)', removeIndex);
  const retirementIndex = source.indexOf('retireStaleTsia2PathStateForRelease', coverageIndex);
  assert.ok(removeIndex >= 0, 'built-in refresh must remove superseded bundled bank records');
  assert.ok(coverageIndex > removeIndex, 'coverage rebuild must happen after superseded bank cleanup');
  assert.ok(retirementIndex > coverageIndex, 'TSIA2 runtime retirement must happen only after the refreshed bank and coverage are ready');
});

test('TSIA2 content CI watches the runtime release module and Functions wiring', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/ccmr-v2-1-tsia2-content-audit.yml', import.meta.url), 'utf8');
  assert.match(workflow, /functions\/shared\/pathBankRelease\.mjs/);
  assert.match(workflow, /functions\/index\.js/);
});
