// COURSE MASTERY IS NOT TRANSFER.
//
// A student can hold an A in Algebra I and still not recognise the same
// mathematics when the SAT puts it in a paragraph with no equals sign in sight.
// That is not a contradiction — it is the most common shape of a
// college-readiness problem, and it is invisible on every gradebook ever built,
// because a gradebook only ever asks the question the way the teacher asked it.
//
// The tests below are mostly about the two ways a dashboard destroys that
// finding: averaging the two numbers, and reading Honors enrollment as evidence.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CCMR_STATE, CCMR_THRESHOLDS, ccmrForStudent, buildCcmrView,
} from '../../src/platform/teacher/ccmrReadiness.js';

const profile = ({ mastery = 0.8, transfer = null, attempts = 0, framework = 'digitalSAT' } = {}) => ({
  courseMastery: mastery,
  instructionalBand: 'on',
  ccmrTransfer: attempts
    ? { [framework]: { attempts, proficiency: transfer, provisional: attempts < 5 } }
    : {},
});

const forStudent = (overrides) => ccmrForStudent({
  studentId: 's1', studentName: 'Rivera, Ana', ...overrides,
});

// --- the rule this dashboard exists to protect ---------------------------------

test('Honors enrollment is never treated as evidence of anything', () => {
  // Enrollment is a scheduling fact. It says which room a student sits in, not
  // what they can do — and a dashboard that reads the Honors roster as the
  // college-ready roster tells a counsellor something false about every child
  // in it, in both directions.
  const evidence = { profile: profile({ mastery: 0.45, transfer: 0.3, attempts: 12 }) };
  const honors = forStudent({ ...evidence, courseLevel: 'honors' });
  const standard = forStudent({ ...evidence, courseLevel: 'standard' });
  assert.equal(honors.state, standard.state);
  assert.equal(honors.detail, standard.detail);
  assert.equal(honors.courseLevel, 'honors', 'reported, but not used');
});

test('a strong Honors student with no exam-style evidence is reported as having none', () => {
  const row = forStudent({ profile: profile({ mastery: 0.95, attempts: 0 }), courseLevel: 'honors' });
  assert.equal(row.state, CCMR_STATE.NO_EVIDENCE);
  assert.match(row.detail, /has not met any exam-style question/);
  assert.equal(row.transfer, null, 'not inferred from the course grade');
});

test('no aggregate readiness percentage is produced for a class', () => {
  // A single number across a class averages two things that must not be
  // averaged, and it is precisely the number that gets pasted into a campus
  // report and treated as a fact about the children.
  const view = buildCcmrView({
    students: [{ id: 'a', displayName: 'A' }, { id: 'b', displayName: 'B' }],
    profilesByStudentId: {
      a: profile({ mastery: 0.9, transfer: 0.4, attempts: 10 }),
      b: profile({ mastery: 0.5, transfer: 0.8, attempts: 10 }),
    },
  });
  assert.deepEqual(Object.keys(view).sort(), ['findings', 'rows']);
  assert.ok(!('readiness' in view) && !('score' in view) && !('average' in view));
});

// --- the finding a gradebook cannot show ---------------------------------------

test('knows the course, does not transfer — the case this screen is for', () => {
  const row = forStudent({ profile: profile({ mastery: 0.88, transfer: 0.42, attempts: 14 }) });
  assert.equal(row.state, CCMR_STATE.COURSE_ONLY);
  assert.match(row.detail, /practice problem with unfamiliar phrasing, not a reteaching problem/);
});

test('transfers ahead of the course grade is flagged as a question about the grade', () => {
  const row = forStudent({ profile: profile({ mastery: 0.45, transfer: 0.85, attempts: 14 }) });
  assert.equal(row.state, CCMR_STATE.TRANSFER_AHEAD);
  assert.match(row.detail, /measuring completion rather than what this student can do/);
});

test('both low is named as a mathematics problem, not a transfer problem', () => {
  // The distinction matters: CCMR practice will not fix an underlying gap, and
  // assigning it instead of reteaching wastes a term.
  const row = forStudent({ profile: profile({ mastery: 0.4, transfer: 0.35, attempts: 14 }) });
  assert.equal(row.state, CCMR_STATE.BOTH_LOW);
  assert.match(row.detail, /CCMR practice on its own will not close it/);
});

test('knowledge that reaches the exam context is reported as such', () => {
  const row = forStudent({ profile: profile({ mastery: 0.8, transfer: 0.82, attempts: 20 }) });
  assert.equal(row.state, CCMR_STATE.TRANSFERS);
});

// --- thin evidence -------------------------------------------------------------

test('a handful of exam-style questions is shown but marked provisional', () => {
  const row = forStudent({ profile: profile({ mastery: 0.9, transfer: 0, attempts: CCMR_THRESHOLDS.minTransferAttempts - 1 }) });
  assert.equal(row.state, CCMR_STATE.PROVISIONAL);
  assert.match(row.detail, /too little to act on/);
});

test('transfer without a course mastery figure does not become a verdict', () => {
  const row = forStudent({ profile: { courseMastery: null, ccmrTransfer: { act: { attempts: 12, proficiency: 0.3 } } } });
  assert.equal(row.state, CCMR_STATE.PROVISIONAL);
  assert.match(row.detail, /no course mastery figure to compare it against/);
});

// --- framework selection ---------------------------------------------------------

test('one framework can be isolated, and aggregating is the default', () => {
  const multi = {
    courseMastery: 0.8,
    ccmrTransfer: {
      digitalSAT: { attempts: 10, proficiency: 0.9 },
      act: { attempts: 10, proficiency: 0.3 },
    },
  };
  const aggregate = forStudent({ profile: multi });
  const satOnly = forStudent({ profile: multi, framework: 'digitalSAT' });
  assert.equal(aggregate.transferAttempts, 20);
  assert.equal(satOnly.transferAttempts, 10);
  assert.ok(satOnly.transfer > aggregate.transfer, 'isolating the stronger framework must change the answer');
});

test('proficiency is weighted by attempts across frameworks, not averaged', () => {
  const row = forStudent({
    profile: {
      courseMastery: 0.8,
      ccmrTransfer: {
        digitalSAT: { attempts: 18, proficiency: 1 },
        act: { attempts: 2, proficiency: 0 },
      },
    },
  });
  assert.equal(row.transferAttempts, 20);
  assert.equal(Math.round(row.transfer * 100), 90, 'not 50');
});

// --- the class view ------------------------------------------------------------

test('students with no exam evidence are named, so their absence is not read as a result', () => {
  const view = buildCcmrView({
    students: [{ id: 'a', displayName: 'A' }, { id: 'b', displayName: 'B' }],
    profilesByStudentId: {
      a: profile({ mastery: 0.9, transfer: 0.4, attempts: 12 }),
      b: profile({ mastery: 0.9, attempts: 0 }),
    },
  });
  const none = view.findings.find((finding) => finding.state === CCMR_STATE.NO_EVIDENCE);
  assert.equal(none.students.length, 1);
  assert.match(none.detail, /no conclusion should be drawn from their absence/);
});

test('a class where everyone transfers produces no findings', () => {
  const view = buildCcmrView({
    students: [{ id: 'a', displayName: 'A' }, { id: 'b', displayName: 'B' }],
    profilesByStudentId: {
      a: profile({ mastery: 0.85, transfer: 0.8, attempts: 12 }),
      b: profile({ mastery: 0.8, transfer: 0.78, attempts: 12 }),
    },
  });
  assert.deepEqual(view.findings, []);
});
