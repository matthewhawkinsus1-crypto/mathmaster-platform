/*
 * "WHAT CHANGED" (product decision 6): a read-only list built from events the
 * platform already records. These tests run the real model; the screen is
 * covered by tests/browser/studentWhatChanged.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  WHAT_CHANGED_KIND,
  buildWhatChanged,
  markWhatChangedSeen,
  readWhatChangedSeenAt,
  rememberWhatChangedFirstSeen,
  toMillis,
  untimedWhatChangedKeys,
  whatChangedSeenKey,
} from '../../src/platform/student/whatChangedModel.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const NOW = Date.parse('2026-10-07T15:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const iso = (ms) => new Date(ms).toISOString();

const lesson = (id, extra = {}) => ({
  id,
  title: `Lesson ${id}`,
  assignedClassIds: ['class-a'],
  dueAt: '2026-10-20',
  lateDueAt: '2026-10-22',
  createdAt: iso(NOW - 30 * DAY),
  ...extra,
});
const testCycle = (id, extra = {}) => lesson(id, { title: `Test ${id}`, assessmentPolicy: { mode: 'testCycle' }, ...extra });

const build = (input = {}) => buildWhatChanged({
  studentId: 'stu-1', classId: 'class-a', classPeriod: '3', nowValue: NOW, ...input,
});
const kinds = (items) => items.map((item) => `${item.kind}:${item.assignmentId}`);

/* ---- released results ---------------------------------------------------- */

test('released feedback appears with its release time', () => {
  const items = build({ assignments: [lesson('a1', { feedbackReleased: true, feedbackReleasedAt: iso(NOW - 2 * HOUR) })] });
  assert.deepEqual(kinds(items), ['released:a1']);
  assert.equal(items[0].text, 'Results released: Lesson a1');
  assert.equal(items[0].at, NOW - 2 * HOUR);
  assert.equal(items[0].unseen, true);
  assert.equal(items[0].reasonText, null);
});

test('held feedback is not news', () => {
  assert.deepEqual(build({ assignments: [lesson('a1', { feedbackReleased: false, feedbackReleasedAt: null })] }), []);
});

test('a Test Cycle release is read from the projection stage', () => {
  for (const stage of ['corrections', 'passed', 'complete', 'retestReady']) {
    const items = build({
      assignments: [testCycle('t1')],
      testCycleGrades: { t1: { stage, stageChangedAt: NOW - HOUR } },
    });
    assert.deepEqual(kinds(items), ['released:t1'], stage);
    assert.equal(items[0].at, NOW - HOUR, stage);
  }
});

test('a recorded grade on the projection counts as released; a submitted Test does not', () => {
  assert.deepEqual(kinds(build({
    assignments: [testCycle('t1')],
    testCycleGrades: { t1: { stage: 'awaitingRelease', recordedGrade: 74, stageChangedAt: NOW - HOUR } },
  })), ['released:t1']);
  assert.deepEqual(build({
    assignments: [testCycle('t1')],
    testCycleGrades: { t1: { stage: 'awaitingRelease', testState: 'submitted', recordedGrade: null, stageChangedAt: NOW - HOUR } },
  }), []);
});

test('a projection on something that is not a Test Cycle is ignored', () => {
  assert.deepEqual(build({ assignments: [lesson('a1')], testCycleGrades: { a1: { stage: 'complete', recordedGrade: 90, stageChangedAt: NOW } } }), []);
});

test('a retest opening is "Retest ready", and replaces the earlier release', () => {
  for (const projection of [
    { stage: 'retest', retestState: 'assigned', recordedGrade: 60, stageChangedAt: NOW - HOUR },
    { stage: 'retest', retestState: 'inProgress', recordedGrade: 60, stageChangedAt: NOW - HOUR },
  ]) {
    const items = build({ assignments: [testCycle('t1', { feedbackReleased: true, feedbackReleasedAt: iso(NOW - 3 * DAY) })], testCycleGrades: { t1: projection } });
    assert.deepEqual(kinds(items), ['retest:t1']);
    assert.equal(items[0].text, 'Retest ready: Test t1');
    assert.equal(items[0].at, NOW - HOUR);
  }
});

/* ---- grade changes ------------------------------------------------------- */

/*
 * A per-question override is bound to the attempt it was made on: the record
 * the student has now must be that attempt (same totalAttempts, variant and
 * submission), or the gradebook no longer applies it.
 */
const v5Lesson = (id, questions, extra = {}) => lesson(id, {
  schemaVersion: 5,
  sections: [{ id: 's1', role: 'classwork', title: 'Classwork', questions }],
  ...extra,
});
const q = (n, extra = {}) => ({ questionId: `q${n}`, prompt: `Question ${n}`, ...extra });
const questions = (count) => Array.from({ length: count }, (_, n) => q(n));
const attempt = (index, extra = {}) => ({
  status: 'attempted', partialCredit: 0, totalAttempts: 1, variantIndex: 0,
  lastSubmissionId: `sub-${index}-1`, lastAttemptAt: iso(NOW - 5 * HOUR), ...extra,
});
const overrideOn = (index, extra = {}) => ({
  active: true, score: 100, source: 'teacher-override',
  totalAttempts: 1, variantIndex: 0, submissionId: `sub-${index}-1`, lastAttemptAt: iso(NOW - 5 * HOUR),
  updatedAt: iso(NOW - HOUR), ...extra,
});

test('a per-question teacher override names the question, with no reason', () => {
  const items = build({
    assignments: [v5Lesson('a1', questions(4))],
    trackerByAssignment: { a1: { 2: attempt(2) } },
    teacherGradeOverridesByAssignment: { a1: { 2: overrideOn(2) } },
  });
  assert.deepEqual(kinds(items), ['gradeChanged:a1']);
  assert.equal(items[0].text, 'Your teacher updated your grade on Lesson a1 (Question 3)');
  assert.equal(items[0].reasonText, null);
  assert.equal(items[0].at, NOW - HOUR);
});

test('several changed questions are one line, numbered in order, at the latest time', () => {
  const tracker = { 0: attempt(0), 1: attempt(1), 2: attempt(2), 4: attempt(4), 7: attempt(7) };
  const items = build({
    assignments: [v5Lesson('a1', questions(8))],
    trackerByAssignment: { a1: tracker },
    teacherGradeOverridesByAssignment: { a1: {
      4: overrideOn(4, { score: 50, updatedAt: iso(NOW - 3 * HOUR) }),
      0: overrideOn(0, { score: 80, updatedAt: iso(NOW - HOUR) }),
      1: overrideOn(1, { score: 80, updatedAt: iso(NOW - 2 * HOUR) }),
      7: overrideOn(7, { active: false, score: 0, updatedAt: iso(NOW) }),
    } },
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].text, 'Your teacher updated your grade on Lesson a1 (Questions 1, 2 and 5)');
  assert.equal(items[0].at, NOW - HOUR);
  const two = build({
    assignments: [v5Lesson('a1', questions(8))],
    trackerByAssignment: { a1: tracker },
    teacherGradeOverridesByAssignment: { a1: { 0: overrideOn(0, { updatedAt: iso(NOW) }), 2: overrideOn(2, { updatedAt: iso(NOW) }) } },
  });
  assert.equal(two[0].text, 'Your teacher updated your grade on Lesson a1 (Questions 1 and 3)');
});

test('an override the student has since re-attempted past is not a change: the gradebook no longer applies it', () => {
  const input = {
    assignments: [v5Lesson('a1', questions(4))],
    teacherGradeOverridesByAssignment: { a1: { 1: overrideOn(1), 3: overrideOn(3) } },
  };
  // Question 2 was re-attempted after the override (attempt 2, a new submission);
  // Question 4 is still the attempt the teacher graded.
  const items = build({
    ...input,
    trackerByAssignment: { a1: {
      1: attempt(1, { totalAttempts: 2, lastSubmissionId: 'sub-1-2', lastAttemptAt: iso(NOW - 30 * 60 * 1000) }),
      3: attempt(3),
    } },
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].text, 'Your teacher updated your grade on Lesson a1 (Question 4)');
  // Every question re-attempted: nothing to claim.
  assert.deepEqual(build({
    ...input,
    trackerByAssignment: { a1: {
      1: attempt(1, { totalAttempts: 2, lastSubmissionId: 'sub-1-2' }),
      3: attempt(3, { variantIndex: 1 }),
    } },
  }), []);
});

test('with no record for the question (or no tracker at all) an override is not claimed', () => {
  const input = {
    assignments: [v5Lesson('a1', questions(4))],
    teacherGradeOverridesByAssignment: { a1: { 2: overrideOn(2) } },
  };
  assert.deepEqual(build({ ...input, trackerByAssignment: { a1: { 0: attempt(0) } } }), []);
  assert.deepEqual(build(input), []);
});

test('questions are numbered as Review My Work numbers them: excluded questions do not count', () => {
  const items = build({
    assignments: [v5Lesson('a1', [q(0), q(1, { teacherExcluded: true }), q(2), q(3)])],
    trackerByAssignment: { a1: { 2: attempt(2), 1: attempt(1) } },
    teacherGradeOverridesByAssignment: { a1: { 2: overrideOn(2) } },
  });
  // Storage index 2 sits behind an excluded question: it is the student's Question 2.
  assert.equal(items[0].text, 'Your teacher updated your grade on Lesson a1 (Question 2)');
  // An override on the excluded question itself changes no grade.
  assert.deepEqual(build({
    assignments: [v5Lesson('a1', [q(0), q(1, { teacherExcluded: true }), q(2)])],
    trackerByAssignment: { a1: { 1: attempt(1) } },
    teacherGradeOverridesByAssignment: { a1: { 1: overrideOn(1) } },
  }), []);
});

test('the numbering matches the server Review My Work rows across sections', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { runtimeIncludedQuestionIndices } = require('../../functions/lib/assignmentRuntime.js');
  const assignment = lesson('a1', {
    schemaVersion: 5,
    sections: [
      { id: 'w', role: 'warmup', questions: [q(0), q(1, { teacherExcluded: true })] },
      { id: 'c', role: 'classwork', questions: [q(2, { teacherExcluded: true }), q(3), q(4)] },
    ],
  });
  const reviewNumberOf = (index) => runtimeIncludedQuestionIndices(assignment).indexOf(index) + 1;
  const items = build({
    assignments: [assignment],
    trackerByAssignment: { a1: { 4: attempt(4) } },
    teacherGradeOverridesByAssignment: { a1: { 4: overrideOn(4) } },
  });
  assert.equal(reviewNumberOf(4), 3);
  assert.equal(items[0].text, `Your teacher updated your grade on Lesson a1 (Question ${reviewNumberOf(4)})`);
});

test('a section integrity zero is one line for the section, with the fixed reason only', () => {
  const zero = () => ({
    active: true, score: 0, persistent: true, source: 'teacher-section-zero', incidentId: 'inc-1', sectionRole: 'classwork',
    reasonCode: 'cellPhoneUse', reason: 'Prohibited cellphone use', participantRole: 'individual',
    note: 'SECRET-NOTE caught texting during the lesson', actor: { uid: 't1', email: 'teacher@school.example', name: 'Ms Teacher' }, at: iso(NOW - HOUR),
  });
  const items = build({
    assignments: [lesson('a1')],
    teacherGradeOverridesByAssignment: { a1: {
      0: zero(), 1: zero(), 2: zero(),
      __sectionIntegrity_classwork: { active: true, incidentId: 'inc-1', sectionRole: 'classwork', previousOverridesByQuestion: { 0: null } },
    } },
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].text, 'Your teacher updated your grade on Lesson a1 (Classwork)');
  assert.equal(items[0].reasonText, 'Prohibited cellphone use');
  assert.equal(items[0].at, NOW - HOUR);
});

test('an assignment integrity zero shows its fixed reason', () => {
  const items = build({
    assignments: [lesson('a1')],
    teacherGradeOverridesByAssignment: { a1: { __assignment: {
      active: true, score: 0, reasonCode: 'academicDishonesty', reason: 'Unauthorized assistance / cheating',
      note: 'SECRET-NOTE', source: 'teacher-assignment-zero', actor: { email: 'teacher@school.example' }, at: iso(NOW - 2 * HOUR),
    } } },
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].text, 'Your teacher updated your grade on Lesson a1');
  assert.equal(items[0].reasonText, 'Unauthorized assistance / cheating');
  assert.equal(items[0].at, NOW - 2 * HOUR);
  // A lifted consequence is no longer news.
  assert.deepEqual(build({ assignments: [lesson('a1')], teacherGradeOverridesByAssignment: { a1: { __assignment: { active: false, reason: 'x', at: iso(NOW) } } } }), []);
});

test('no teacher note, identity or email ever reaches the output', () => {
  const secrets = ['SECRET-NOTE', 'teacher@school.example', 'Ms Teacher', 'uid-teacher-9', 'private audit'];
  const actor = { uid: 'uid-teacher-9', email: 'teacher@school.example', name: 'Ms Teacher' };
  const items = build({
    assignments: [
      v5Lesson('a1', questions(4), { feedbackReleased: true, feedbackReleasedAt: iso(NOW - HOUR), releasedBy: actor, teacherNote: 'SECRET-NOTE' }),
      lesson('a2'),
      testCycle('t1'),
    ],
    testCycleGrades: { t1: { stage: 'corrections', stageChangedAt: NOW - HOUR, releasedBy: actor, note: 'SECRET-NOTE' } },
    trackerByAssignment: { a1: { 0: attempt(0) } },
    teacherGradeOverridesByAssignment: {
      a1: {
        0: overrideOn(0, { score: 90, note: 'SECRET-NOTE', actor, audit: 'private audit' }),
        3: { active: true, score: 0, source: 'teacher-section-zero', incidentId: 'i', sectionRole: 'dol', reason: 'Account or laptop switching', note: 'SECRET-NOTE', actor, at: iso(NOW - HOUR) },
        __assignment: { active: true, score: 0, reason: 'Prohibited cellphone use', note: 'SECRET-NOTE', actor, at: iso(NOW - HOUR) },
      },
    },
    controlsByAssignmentId: { a2: { reopened: true, extension: { grantedAt: NOW - HOUR, by: actor }, lateDueAt: '2026-10-25', note: 'SECRET-NOTE' } },
  });
  assert.ok(items.length >= 5, 'the fixture produces items to inspect');
  assert.ok(items.some((item) => item.key === 'gradeChanged:a1:questions'), 'the per-question override is among them');
  const output = JSON.stringify(items);
  for (const secret of secrets) assert.ok(!output.includes(secret), `"${secret}" leaked into What changed`);
  // Every item carries exactly the documented fields — nothing spread in.
  for (const item of items) {
    assert.deepEqual(Object.keys(item).sort(), ['assignmentId', 'at', 'key', 'kind', 'reasonText', 'text', 'title', 'unseen']);
  }
});

/* ---- reopened / extended / excused ------------------------------------- */

test('excused and reopened are untimed state items: listed last, never "new"', () => {
  const items = build({
    assignments: [lesson('a1'), lesson('a2'), lesson('a3', { feedbackReleased: true, feedbackReleasedAt: iso(NOW - 5 * DAY) })],
    controlsByAssignmentId: { a1: { excused: true }, a2: { reopened: true } },
  });
  assert.deepEqual(kinds(items), ['released:a3', 'excused:a1', 'reopened:a2']);
  assert.equal(items[1].text, 'Lesson a1 is excused');
  assert.equal(items[2].text, 'Lesson a2 was reopened');
  assert.equal(items[1].at, null);
  assert.equal(items[1].unseen, false);
  assert.equal(items[2].unseen, false);
});

test('an excused assignment does not also announce itself as new, extended or another try', () => {
  const items = build({
    assignments: [lesson('a1', { createdAt: iso(NOW - HOUR) })],
    controlsByAssignmentId: { a1: { excused: true, reopened: true, lateDueAt: '2026-10-25', extension: { grantedAt: NOW - HOUR }, dolAttemptGrant: { extraAttempts: 1, changedAt: iso(NOW) } } },
  });
  assert.deepEqual(kinds(items), ['excused:a1']);
});

test('an extension says the new due date, timed by when it was granted', () => {
  const items = build({
    assignments: [lesson('a1')],
    controlsByAssignmentId: { a1: { lateDueAt: '2026-10-30T17:00:00Z', extension: { dateKey: '2026-10-06', grantedAt: NOW - 2 * HOUR } } },
  });
  assert.deepEqual(kinds(items), ['extended:a1']);
  assert.match(items[0].text, /^You have more time on Lesson a1 — now due \w{3}, Oct 30, \d{1,2}:\d{2} [AP]M$/);
  assert.equal(items[0].at, NOW - 2 * HOUR);
  assert.equal(items[0].unseen, true);
});

test('another DOL try is listed with its change time', () => {
  const items = build({
    assignments: [lesson('a1')],
    controlsByAssignmentId: { a1: { dolExtraAttempts: 1, dolAttemptGrant: { extraAttempts: 1, changedAt: iso(NOW - HOUR) } } },
  });
  assert.deepEqual(kinds(items), ['moreAttempts:a1']);
  assert.equal(items[0].text, 'You have another try on the DOL for Lesson a1');
  assert.equal(items[0].at, NOW - HOUR);
});

/* ---- new assignments ----------------------------------------------------- */

test('a new assignment is timed by the later of created and released, and only once released', () => {
  const created = build({ assignments: [lesson('a1', { createdAt: iso(NOW - DAY) })] });
  assert.deepEqual(kinds(created), ['new:a1']);
  assert.equal(created[0].text, 'New: Lesson a1');
  assert.equal(created[0].at, NOW - DAY);

  const released = build({ assignments: [lesson('a1', { createdAt: iso(NOW - 20 * DAY), releaseAt: iso(NOW - 2 * HOUR) })] });
  assert.equal(released[0].at, NOW - 2 * HOUR);

  assert.deepEqual(build({ assignments: [lesson('a1', { createdAt: iso(NOW - DAY), releaseAt: iso(NOW + HOUR) })] }), [], 'not released yet');
});

test('createdAt may be a Firestore Timestamp, its plain {seconds} form, ms or ISO', () => {
  const at = NOW - 3 * HOUR;
  for (const createdAt of [
    { toDate: () => new Date(at) },
    { toMillis: () => at },
    { seconds: at / 1000, nanoseconds: 0 },
    { _seconds: at / 1000, _nanoseconds: 0 },
    at,
    iso(at),
  ]) {
    assert.equal(toMillis(createdAt), at);
    assert.equal(build({ assignments: [lesson('a1', { createdAt })] })[0].at, at);
  }
  assert.equal(toMillis(null), null);
  assert.equal(toMillis('not a date'), null);
  assert.equal(toMillis({}), null);
});

/* ---- whose, how many, in what order ----------------------------------- */

test('only this student\'s class sees an assignment, and archived or draft work is skipped', () => {
  const other = lesson('o1', { assignedClassIds: ['class-b'], createdAt: iso(NOW - HOUR) });
  const archived = lesson('x1', { archived: true, createdAt: iso(NOW - HOUR) });
  const draft = lesson('x2', { status: 'draft', createdAt: iso(NOW - HOUR) });
  const mine = lesson('a1', { createdAt: iso(NOW - HOUR) });
  assert.deepEqual(kinds(build({ assignments: [other, archived, draft, mine] })), ['new:a1']);
  assert.deepEqual(build({ classId: null, assignments: [mine] }), [], 'no class, nothing claimed');
});

test('the window drops old events; newest first; the list is capped', () => {
  const old = lesson('old', { createdAt: iso(NOW - 60 * DAY), feedbackReleased: true, feedbackReleasedAt: iso(NOW - 15 * DAY) });
  const recent = lesson('recent', { createdAt: iso(NOW - 60 * DAY), feedbackReleased: true, feedbackReleasedAt: iso(NOW - 13 * DAY) });
  assert.deepEqual(kinds(build({ assignments: [old, recent] })), ['released:recent']);
  assert.deepEqual(kinds(build({ assignments: [old, recent], windowDays: 30 })), ['released:recent', 'released:old']);

  const many = Array.from({ length: 30 }, (_, index) => lesson(`m${index}`, { createdAt: iso(NOW - (index + 1) * HOUR) }));
  const capped = build({ assignments: many });
  assert.equal(capped.length, 20);
  assert.equal(capped[0].assignmentId, 'm0');
  assert.equal(capped[19].assignmentId, 'm19');
  assert.equal(build({ assignments: many, limit: 5 }).length, 5);
  for (let index = 1; index < capped.length; index += 1) assert.ok(capped[index - 1].at >= capped[index].at);
});

test('the same assignment listed twice is one item per event', () => {
  const a = lesson('a1', { createdAt: iso(NOW - HOUR) });
  const items = build({ assignments: [a, { ...a }] });
  assert.deepEqual(kinds(items), ['new:a1']);
  assert.equal(new Set(items.map((item) => item.key)).size, items.length);
});

test('"new" means after the last time this device showed the list', () => {
  const items = build({
    assignments: [
      lesson('a1', { feedbackReleased: true, feedbackReleasedAt: iso(NOW - HOUR) }),
      lesson('a2', { feedbackReleased: true, feedbackReleasedAt: iso(NOW - 5 * HOUR) }),
    ],
    seenAt: NOW - 2 * HOUR,
  });
  assert.deepEqual(items.map((item) => [item.assignmentId, item.unseen]), [['a1', true], ['a2', false]]);
});

test('a remembered first-seen time dates a state item, makes it new once, and ages it out', () => {
  const input = { assignments: [lesson('a1')], controlsByAssignmentId: { a1: { excused: true } } };
  const fresh = build({ ...input, firstSeenByKey: { 'excused:a1': NOW - HOUR }, seenAt: NOW - 2 * HOUR });
  assert.equal(fresh[0].at, NOW - HOUR);
  assert.equal(fresh[0].unseen, true);
  assert.deepEqual(build({ ...input, firstSeenByKey: { 'excused:a1': NOW - 20 * DAY } }), []);
  assert.deepEqual(untimedWhatChangedKeys(build(input)), ['excused:a1']);
});

/* ---- per-device storage --------------------------------------------------- */

const withStorage = (fn) => {
  const previous = globalThis.window;
  const store = new Map();
  globalThis.window = { localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
  } };
  try { return fn(store); } finally { globalThis.window = previous; }
};

test('seen time is stored per student under mm-what-changed-seen:{studentId}', () => {
  withStorage((store) => {
    assert.equal(readWhatChangedSeenAt('stu-1'), 0);
    markWhatChangedSeen('stu-1', 12345);
    assert.equal(store.get('mm-what-changed-seen:stu-1'), '12345');
    assert.equal(whatChangedSeenKey('stu-1'), 'mm-what-changed-seen:stu-1');
    assert.equal(readWhatChangedSeenAt('stu-1'), 12345);
    assert.equal(readWhatChangedSeenAt('stu-2'), 0, 'another student on the same Chromebook starts fresh');
    markWhatChangedSeen('', 999);
    assert.equal(readWhatChangedSeenAt(''), 0);
  });
});

test('first-seen times are kept for live keys and dropped for gone ones', () => {
  withStorage(() => {
    const first = rememberWhatChangedFirstSeen('stu-1', ['excused:a1', 'reopened:a2'], 1000);
    assert.deepEqual(first, { 'excused:a1': 1000, 'reopened:a2': 1000 });
    const second = rememberWhatChangedFirstSeen('stu-1', ['excused:a1'], 5000);
    assert.deepEqual(second, { 'excused:a1': 1000 });
  });
});

test('blocked storage never throws', () => {
  const previous = globalThis.window;
  globalThis.window = { localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } };
  try {
    assert.equal(readWhatChangedSeenAt('stu-1'), 0);
    assert.doesNotThrow(() => markWhatChangedSeen('stu-1', 1));
    assert.deepEqual(rememberWhatChangedFirstSeen('stu-1', ['k'], 7), { k: 7 });
  } finally { globalThis.window = previous; }
  // And no window at all (server render, node).
  assert.equal(readWhatChangedSeenAt('stu-1'), 0);
});

/* ---- the list component (source contract: node cannot render .jsx) ------ */

const list = executableSource(readFileSync(new URL('../../src/components/student/WhatChangedList.jsx', import.meta.url), 'utf8'));

test('the list is read-only: every row only opens the assignment', () => {
  assert.match(list, /<h2[^>]*>What changed<\/h2>/);
  const row = region(list, '{list.map((item) => (', '))}', 'one row');
  assert.match(row, /<button[\s\S]*onClick=\{\(\) => onOpenAssignment\?\.\(item\.assignmentId\)\}/);
  assert.match(row, /minHeight: MIN_TOUCH_TARGET_PX/);
  assert.match(row, /\{item\.unseen && \([\s\S]*>\s*New\s*</);
  assert.match(row, /\{item\.text\}/);
  assert.match(row, /Reason: \{item\.reasonText\}/);
  // One control per row, and nothing to type into: no reply, no dismiss.
  assert.equal((row.match(/<button/g) || []).length, 1);
  assert.doesNotMatch(list, /<textarea|<input|<form/);
});

test('an empty list draws nothing when compact and "Nothing new" otherwise', () => {
  const empty = region(list, 'if (!list.length) {', '\n  }\n', 'the empty branch');
  assert.match(empty, /if \(compact\) return null;/);
  assert.match(empty, /Nothing new/);
});

test('onMarkSeen is called once, after the list has been on screen', () => {
  const effect = region(list, 'useEffect(() => {', '}, [list.length, onMarkSeen]);', 'the seen effect');
  assert.match(effect, /if \(marked\.current \|\| !list\.length \|\| typeof onMarkSeen !== 'function'\) return;/);
  assert.match(effect, /marked\.current = true;\s*onMarkSeen\(\);/);
});

test('the kinds are the six decision-6 events plus another DOL try', () => {
  assert.deepEqual(Object.values(WHAT_CHANGED_KIND).sort(), ['excused', 'extended', 'gradeChanged', 'moreAttempts', 'new', 'released', 'reopened', 'retest']);
});
