import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  RELEASE_UPDATE_REASON,
  resolveAssessmentContentRelease,
  resolveManifestAssessmentContentRelease,
  resolveAssessmentContentReleaseAuthority,
  collectAssessmentContentReleases,
  beginAssessmentContentReleaseUpdate,
  completeAssessmentContentReleaseUpdate,
  assessSessionContentRelease,
  planSessionContentReleaseAction,
  supersedeSessionForContentRelease,
} = require('../../functions/lib/pathContentRelease.js');

const RELEASE = 'ccmr-fidelity-v2.1-authentic-language';
const sat = (overrides = {}) => ({
  id: 'sat-family',
  active: true,
  assessmentContext: { framework: 'digitalSAT', examStyle: true },
  ccmrContentRelease: RELEASE,
  ...overrides,
});
const act = (overrides = {}) => ({
  id: 'act-family',
  active: true,
  assessmentContext: { framework: 'act', examStyle: true },
  ccmrContentRelease: RELEASE,
  ...overrides,
});
const tsia2 = (overrides = {}) => ({
  id: 'tsia2-family',
  active: true,
  assessmentContext: { framework: 'tsia2', examStyle: true },
  ccmrContentRelease: RELEASE,
  ...overrides,
});
const asvab = (overrides = {}) => ({
  id: 'asvab-family',
  active: true,
  assessmentContext: { framework: 'asvab', examStyle: true },
  ...overrides,
});
const activeManifest = (overrides = {}) => ({
  schemaVersion: 1,
  status: 'active',
  activeReleases: {
    digitalSAT: RELEASE,
    act: RELEASE,
    tsia2: RELEASE,
  },
  ...overrides,
});

test('homogeneous released framework families produce one server-owned release marker', () => {
  const state = resolveAssessmentContentRelease([
    sat({ id: 'sat-1' }),
    sat({ id: 'sat-2' }),
    act(),
    sat({ id: 'inactive-old', active: false, ccmrContentRelease: 'old-release' }),
  ], 'digitalSAT');

  assert.deepEqual(state, {
    framework: 'digitalSAT',
    tracked: true,
    release: RELEASE,
    matchingFamilies: 2,
  });
});

test('legacy framework families with no release metadata remain untracked', () => {
  const state = resolveAssessmentContentRelease([
    asvab({ id: 'asvab-1' }),
    asvab({ id: 'asvab-2' }),
  ], 'asvab');

  assert.deepEqual(state, {
    framework: 'asvab',
    tracked: false,
    release: null,
    matchingFamilies: 2,
  });
});

test('mixed release values fail closed instead of choosing one arbitrarily', () => {
  assert.throws(
    () => resolveAssessmentContentRelease([
      sat({ id: 'sat-new' }),
      sat({ id: 'sat-old', ccmrContentRelease: 'ccmr-fidelity-v2.0' }),
    ], 'digitalSAT'),
    /mixed.*content release|content release.*mixed/i,
  );
});

test('partially release-marked framework bank fails closed', () => {
  assert.throws(
    () => resolveAssessmentContentRelease([
      sat({ id: 'sat-new' }),
      sat({ id: 'sat-unmarked', ccmrContentRelease: undefined }),
    ], 'digitalSAT'),
    /partially.*release|release.*partially|mixed.*release/i,
  );
});

test('active manifest is the authoritative release boundary even when a bounded bank slice is stale or mixed', () => {
  const manifestState = resolveManifestAssessmentContentRelease(activeManifest(), 'digitalSAT');
  assert.equal(manifestState.authoritative, true);
  assert.equal(manifestState.available, true);
  assert.equal(manifestState.tracked, true);
  assert.equal(manifestState.release, RELEASE);

  const state = resolveAssessmentContentReleaseAuthority([
    sat({ id: 'sat-old', ccmrContentRelease: 'ccmr-fidelity-v2.0' }),
    sat({ id: 'sat-new' }),
  ], 'digitalSAT', activeManifest());
  assert.equal(state.authoritative, true);
  assert.equal(state.available, true);
  assert.equal(state.release, RELEASE);
});

test('manifest entry absent for ASVAB preserves legacy untracked behavior', () => {
  const state = resolveAssessmentContentReleaseAuthority([
    asvab({ id: 'asvab-1' }),
    asvab({ id: 'asvab-2' }),
  ], 'asvab', activeManifest());
  assert.equal(state.authoritative, false);
  assert.equal(state.tracked, false);
  assert.equal(state.release, null);
});

test('release update state holds new issuance but preserves an already-open question', () => {
  const updating = beginAssessmentContentReleaseUpdate(
    activeManifest(),
    { digitalSAT: RELEASE, act: RELEASE, tsia2: RELEASE },
    100,
  );
  const current = resolveManifestAssessmentContentRelease(updating, 'digitalSAT');
  assert.equal(current.authoritative, true);
  assert.equal(current.available, false);
  assert.equal(current.reason, RELEASE_UPDATE_REASON);

  assert.deepEqual(
    planSessionContentReleaseAction(
      { assessmentFramework: 'digitalSAT', assessmentContentRelease: RELEASE, currentQuestion: null },
      current,
    ),
    {
      action: 'hold-release-update',
      tracked: true,
      stale: false,
      currentRelease: RELEASE,
      reason: RELEASE_UPDATE_REASON,
    },
  );

  assert.deepEqual(
    planSessionContentReleaseAction(
      {
        assessmentFramework: 'digitalSAT',
        assessmentContentRelease: RELEASE,
        currentQuestion: { questionInstanceId: 'q-1' },
      },
      current,
    ),
    {
      action: 'finish-open-question',
      tracked: true,
      stale: false,
      currentRelease: RELEASE,
      reason: RELEASE_UPDATE_REASON,
    },
  );
});

test('release manifest activates all coordinated frameworks in one completed state', () => {
  const pending = {
    digitalSAT: RELEASE,
    act: RELEASE,
    tsia2: RELEASE,
  };
  const updating = beginAssessmentContentReleaseUpdate(activeManifest(), pending, 100);
  assert.equal(updating.status, 'updating');
  assert.deepEqual(updating.pendingReleases, pending);
  assert.deepEqual(updating.activeReleases, activeManifest().activeReleases);

  const active = completeAssessmentContentReleaseUpdate(updating, pending, 200);
  assert.equal(active.status, 'active');
  assert.deepEqual(active.activeReleases, pending);
  assert.deepEqual(active.pendingReleases, {});
  assert.equal(active.activatedAt, 200);
});

test('release inventory collects SAT ACT and TSIA2 without enrolling unmarked ASVAB', () => {
  assert.deepEqual(
    collectAssessmentContentReleases([
      sat({ id: 'sat-1' }),
      act({ id: 'act-1' }),
      tsia2({ id: 'tsia2-1' }),
      asvab({ id: 'asvab-1' }),
    ]),
    {
      digitalSAT: RELEASE,
      act: RELEASE,
      tsia2: RELEASE,
    },
  );
});

test('ordinary Path sessions and untracked ASVAB sessions never become stale from this release guard', () => {
  assert.deepEqual(
    assessSessionContentRelease({ assessmentFramework: null }, { framework: null, tracked: false, release: null, matchingFamilies: 0 }),
    { tracked: false, stale: false, currentRelease: null, sessionRelease: null, reason: null },
  );
  assert.deepEqual(
    assessSessionContentRelease({ assessmentFramework: 'asvab' }, resolveAssessmentContentRelease([asvab()], 'asvab')),
    { tracked: false, stale: false, currentRelease: null, sessionRelease: null, reason: null },
  );
});

test('matching V2.1 assessment session remains current', () => {
  const state = resolveAssessmentContentRelease([sat()], 'digitalSAT');
  assert.deepEqual(
    assessSessionContentRelease({ assessmentFramework: 'digitalSAT', assessmentContentRelease: RELEASE }, state),
    { tracked: true, stale: false, currentRelease: RELEASE, sessionRelease: RELEASE, reason: null },
  );
});

test('pre-release session with no marker is stale once its framework is release-tracked', () => {
  const state = resolveAssessmentContentRelease([sat()], 'digitalSAT');
  assert.deepEqual(
    assessSessionContentRelease({ assessmentFramework: 'digitalSAT' }, state),
    {
      tracked: true,
      stale: true,
      currentRelease: RELEASE,
      sessionRelease: null,
      reason: 'ccmr-content-release-changed',
    },
  );
});

test('older release session is stale when current bank release changes', () => {
  const state = resolveAssessmentContentRelease([sat()], 'digitalSAT');
  assert.equal(
    assessSessionContentRelease({ assessmentFramework: 'digitalSAT', assessmentContentRelease: 'ccmr-fidelity-v2.0' }, state).stale,
    true,
  );
});

test('runtime continues current and untracked sessions normally', () => {
  assert.deepEqual(
    planSessionContentReleaseAction(
      { assessmentFramework: 'digitalSAT', assessmentContentRelease: RELEASE, currentQuestion: null },
      resolveAssessmentContentRelease([sat()], 'digitalSAT'),
    ),
    { action: 'continue', tracked: true, stale: false, currentRelease: RELEASE, reason: null },
  );
  assert.deepEqual(
    planSessionContentReleaseAction(
      { assessmentFramework: 'asvab', currentQuestion: null },
      resolveAssessmentContentRelease([asvab()], 'asvab'),
    ),
    { action: 'continue', tracked: false, stale: false, currentRelease: null, reason: null },
  );
});

test('runtime preserves a stale session only while its already-issued question is open', () => {
  assert.deepEqual(
    planSessionContentReleaseAction(
      {
        assessmentFramework: 'digitalSAT',
        assessmentContentRelease: 'ccmr-fidelity-v2.0',
        currentQuestion: { questionInstanceId: 'q-1' },
      },
      resolveAssessmentContentRelease([sat()], 'digitalSAT'),
    ),
    {
      action: 'finish-open-question',
      tracked: true,
      stale: true,
      currentRelease: RELEASE,
      reason: 'ccmr-content-release-changed',
    },
  );
});

test('runtime supersedes a stale session as soon as it has no open question', () => {
  assert.deepEqual(
    planSessionContentReleaseAction(
      {
        assessmentFramework: 'digitalSAT',
        assessmentContentRelease: 'ccmr-fidelity-v2.0',
        currentQuestion: null,
      },
      resolveAssessmentContentRelease([sat()], 'digitalSAT'),
    ),
    {
      action: 'supersede',
      tracked: true,
      stale: true,
      currentRelease: RELEASE,
      reason: 'ccmr-content-release-changed',
    },
  );
});

test('superseding a stale session preserves history and summary while making it non-reusable', () => {
  const original = {
    sessionId: 'session-1',
    studentId: 'student-1',
    status: 'active',
    assessmentFramework: 'digitalSAT',
    assessmentContentRelease: 'ccmr-fidelity-v2.0',
    currentQuestion: null,
    summary: { completedQuestions: 2, correctQuestions: 1 },
    route: [{ action: 'start' }],
    evidenceBySkill: { 'A.2A': { attempts: 2 } },
    createdAt: 100,
    updatedAt: 200,
  };

  const next = supersedeSessionForContentRelease(original, RELEASE, 500);
  assert.equal(next.status, 'superseded');
  assert.equal(next.supersededReason, 'ccmr-content-release-changed');
  assert.equal(next.supersededAt, 500);
  assert.equal(next.supersededByContentRelease, RELEASE);
  assert.equal(next.updatedAt, 500);
  assert.deepEqual(next.summary, original.summary);
  assert.deepEqual(next.route, original.route);
  assert.deepEqual(next.evidenceBySkill, original.evidenceBySkill);
  assert.equal(next.createdAt, 100);
});

test('an open question cannot be superseded before it is submitted', () => {
  assert.throws(
    () => supersedeSessionForContentRelease({
      status: 'active',
      currentQuestion: { questionInstanceId: 'q-1' },
    }, RELEASE, 500),
    /open question|current question/i,
  );
});
