import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  resolveAssessmentContentRelease,
  assessSessionContentRelease,
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
const asvab = (overrides = {}) => ({
  id: 'asvab-family',
  active: true,
  assessmentContext: { framework: 'asvab', examStyle: true },
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
