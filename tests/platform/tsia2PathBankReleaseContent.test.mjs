import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const CURRENT_RELEASE = 'tsia2-v2.1-authentic-language';

function makeFakeFirestore({ sessions = {}, locks = {}, releases = {}, failBatchCommit = false } = {}) {
  const state = {
    pathSessions: new Map(Object.entries(sessions)),
    activePathLocks: new Map(Object.entries(locks)),
    pathBankReleases: new Map(Object.entries(releases)),
  };

  const makeRef = (collectionName, id) => ({
    collectionName,
    id,
    async get() {
      const data = state[collectionName]?.get(id);
      return {
        exists: data !== undefined,
        data: () => data,
      };
    },
    async set(data, options = {}) {
      const collection = state[collectionName];
      const previous = collection.get(id) || {};
      collection.set(id, options?.merge ? { ...previous, ...data } : { ...data });
    },
  });

  const makeDocSnapshot = (collectionName, id, data) => ({
    id,
    ref: makeRef(collectionName, id),
    data: () => data,
  });

  return {
    state,
    collection(collectionName) {
      if (!state[collectionName]) state[collectionName] = new Map();
      return {
        doc: (id) => makeRef(collectionName, id),
        where(field, operator, value) {
          assert.equal(operator, '==');
          return {
            async get() {
              const docs = [...state[collectionName].entries()]
                .filter(([, data]) => data?.[field] === value)
                .map(([id, data]) => makeDocSnapshot(collectionName, id, data));
              return { docs };
            },
          };
        },
      };
    },
    batch() {
      const operations = [];
      return {
        set(ref, data, options = {}) {
          operations.push({ type: 'set', ref, data, options });
        },
        delete(ref) {
          operations.push({ type: 'delete', ref });
        },
        async commit() {
          if (failBatchCommit) throw new Error('simulated batch failure');
          for (const operation of operations) {
            const collection = state[operation.ref.collectionName];
            if (operation.type === 'delete') {
              collection.delete(operation.ref.id);
              continue;
            }
            const previous = collection.get(operation.ref.id) || {};
            collection.set(
              operation.ref.id,
              operation.options?.merge ? { ...previous, ...operation.data } : { ...operation.data },
            );
          }
        },
      };
    },
  };
}

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

test('TSIA2 release migration retires active sessions, preserves completed history, deletes only TSIA2 locks, and records the release', async () => {
  const { retireStaleTsia2PathStateForRelease } = await import('../../functions/shared/pathBankRelease.mjs');
  const now = 1_785_000_000_000;
  const db = makeFakeFirestore({
    sessions: {
      'tsi-active': { assessmentFramework: 'tsia2', status: 'active', completedQuestions: 2 },
      'tsi-complete': { assessmentFramework: 'tsia2', status: 'completed', completedQuestions: 5 },
      'sat-active': { assessmentFramework: 'digitalSAT', status: 'active' },
      'course-active': { assessmentFramework: null, status: 'active' },
    },
    locks: {
      'tsi-lock': { assessmentFramework: 'tsia2' },
      'sat-lock': { assessmentFramework: 'digitalSAT' },
      'course-lock': { assessmentFramework: null },
    },
    releases: {
      tsia2: { release: 'tsia2-v2.0' },
    },
  });

  const result = await retireStaleTsia2PathStateForRelease(db, { now });

  assert.equal(result.noop, false);
  assert.equal(result.retiredSessionCount, 1);
  assert.equal(result.deletedLockCount, 1);
  assert.deepEqual(db.state.pathSessions.get('tsi-active'), {
    assessmentFramework: 'tsia2',
    status: 'retired',
    completedQuestions: 2,
    retirementReason: 'tsia2-path-bank-release',
    retiredForPathBankRelease: CURRENT_RELEASE,
    retiredAt: now,
    updatedAt: now,
  });
  assert.deepEqual(db.state.pathSessions.get('tsi-complete'), {
    assessmentFramework: 'tsia2',
    status: 'completed',
    completedQuestions: 5,
  });
  assert.equal(db.state.activePathLocks.has('tsi-lock'), false);
  assert.equal(db.state.activePathLocks.has('sat-lock'), true);
  assert.equal(db.state.activePathLocks.has('course-lock'), true);
  assert.equal(db.state.pathSessions.get('sat-active')?.status, 'active');
  assert.equal(db.state.pathSessions.get('course-active')?.status, 'active');
  assert.deepEqual(db.state.pathBankReleases.get('tsia2'), {
    release: CURRENT_RELEASE,
    framework: 'tsia2',
    appliedAt: now,
    retiredSessionCount: 1,
    deletedLockCount: 1,
  });

  db.state.pathSessions.set('new-tsi-active', { assessmentFramework: 'tsia2', status: 'active' });
  db.state.activePathLocks.set('new-tsi-lock', { assessmentFramework: 'tsia2' });
  const second = await retireStaleTsia2PathStateForRelease(db, { now: now + 1 });
  assert.equal(second.noop, true);
  assert.equal(db.state.pathSessions.get('new-tsi-active')?.status, 'active');
  assert.equal(db.state.activePathLocks.has('new-tsi-lock'), true);
});

test('TSIA2 release marker is not written when stale-state mutation fails', async () => {
  const { retireStaleTsia2PathStateForRelease } = await import('../../functions/shared/pathBankRelease.mjs');
  const db = makeFakeFirestore({
    sessions: {
      'tsi-active': { assessmentFramework: 'tsia2', status: 'active' },
    },
    locks: {
      'tsi-lock': { assessmentFramework: 'tsia2' },
    },
    failBatchCommit: true,
  });

  await assert.rejects(
    () => retireStaleTsia2PathStateForRelease(db, { now: 1234 }),
    /simulated batch failure/,
  );
  assert.equal(db.state.pathBankReleases.has('tsia2'), false);
  assert.equal(db.state.pathSessions.get('tsi-active')?.status, 'active');
  assert.equal(db.state.activePathLocks.has('tsi-lock'), true);
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
  assert.match(source.slice(retirementIndex), /tsia2PathBankRelease/, 'seed refresh should return the runtime release result to the administrator');
});

test('TSIA2 content CI watches the runtime release module and Functions wiring', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/ccmr-v2-1-tsia2-content-audit.yml', import.meta.url), 'utf8');
  assert.match(workflow, /functions\/shared\/pathBankRelease\.mjs/);
  assert.match(workflow, /functions\/index\.js/);
});
