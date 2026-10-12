/*
 * THE SECURE TEST SCREEN'S TOOLS (src/platform/teacher/testCycleTeacherTools.js)
 * and the row model's new states (testCycleTeacherRows.js): what a class-wide
 * button promises, how an operation is driven to its end and reported, a typed
 * time read as school time, the sources a grade can be set from, and what a
 * student who missed the Test is offered.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BULK_ACTION,
  audienceCandidates,
  describeBulkPlan,
  describeLifecycleEvidence,
  describeOperation,
  describeReviewSummary,
  driveBulkOperation,
  gradeAdjustmentChoices,
  instantFromSchoolInput,
  newBulkOperationId,
  planBulkAction,
  schoolDateKey,
  schoolInputValue,
  validateManualGrade,
} from '../../src/platform/teacher/testCycleTeacherTools.js';
import { TEACHER_BUCKET_LABEL, TEACHER_BUCKET_ORDER, describeTeacherRow, teacherActionsForRow } from '../../src/platform/teacher/testCycleTeacherRows.js';
import { normalizeBulkOperationId, bulkOperationView, newBulkOperation, withBulkResult } from '../../functions/shared/testCycleBulk.mjs';

const row = (studentId, extra = {}) => ({
  studentId, stage: 'review', review: { attempted: 0, total: 4 }, test: { state: 'none', examSessionId: null }, retest: { state: 'none', examSessionId: null },
  corrections: {}, teacherControls: {}, ...extra,
});
const rows = [
  row('s1'),
  row('s2', { teacherControls: { reviewWaived: true }, stage: 'test' }),
  row('s3', { stage: 'test', test: { state: 'assigned', examSessionId: 'e3' } }),
  row('s4', { stage: 'passed', test: { state: 'released', examSessionId: 'e4' } }),
  row('s5', { stage: 'retest', missedTest: true, retestWithoutOriginal: true, retest: { state: 'inProgress', examSessionId: 'r5' } }),
  row('s6', { stage: 'review', missedTest: true }),
];

test('a class-wide button counts the students it will actually change', () => {
  const waiveAll = planBulkAction({ action: BULK_ACTION.WAIVE_REVIEW, rows });
  assert.deepEqual([waiveAll.scope, waiveAll.targetCount, waiveAll.willChangeIds, waiveAll.alreadyCount], [{ kind: 'all' }, 6, ['s1', 's6'], 4]);
  const openAll = planBulkAction({ action: BULK_ACTION.OPEN_TEST_SESSIONS, rows });
  // s3 has a session, s4 has finished, s5 is sitting the Retest that replaced the Test.
  assert.deepEqual(openAll.willChangeIds, ['s1', 's2', 's6']);
  // A stand-in Retest that has not been started does not rule the Test out:
  // the teacher may be about to reopen its window.
  const notStarted = row('s7', { stage: 'retest', missedTest: true, retestWithoutOriginal: true, retest: { state: 'assigned', examSessionId: 'r7' } });
  assert.deepEqual(planBulkAction({ action: BULK_ACTION.OPEN_TEST_SESSIONS, rows: [notStarted] }).willChangeIds, ['s7']);

  const picked = planBulkAction({ action: BULK_ACTION.WAIVE_REVIEW, rows, selectedIds: ['s1', 's4', 'not-on-the-table'] });
  assert.deepEqual(picked.scope, { kind: 'students', studentIds: ['s1', 's4'] }, 'only students on the table are sent');
  assert.deepEqual([picked.selected, picked.targetCount, picked.willChangeCount, picked.alreadyCount], [true, 2, 1, 1]);
  assert.equal(planBulkAction({ action: 'deleteEverything', rows }), null);

  const words = describeBulkPlan(picked);
  assert.equal(words.button, 'Waive Review · 1');
  assert.equal(words.title, 'Waive Review for 2 selected students?');
  assert.match(words.body, /1 student still in Review will be able to start the Test without finishing it/);
  assert.match(words.body, /1 student needs nothing and will be reported as already complete/);
  assert.match(words.body, /Their Review work is kept exactly as it is/);
  const open = describeBulkPlan(openAll, { external: false });
  assert.deepEqual([open.button, open.title, open.disabled], ['Open Test sessions · 3', 'Open secure Test sessions for all 6 students?', false]);
  assert.match(open.body, /nobody is given a second one/);
  // Nothing to do is a disabled button, not a confirmation for nothing.
  assert.equal(describeBulkPlan(planBulkAction({ action: BULK_ACTION.WAIVE_REVIEW, rows: [rows[3]] })).disabled, true);
});

test('an operation id is one the server will store, and differs every time', () => {
  const first = newBulkOperationId(BULK_ACTION.WAIVE_REVIEW, { now: 1760000000000 });
  const second = newBulkOperationId(BULK_ACTION.WAIVE_REVIEW, { now: 1760000000000 });
  assert.notEqual(first, second);
  for (const id of [first, second, newBulkOperationId(''), newBulkOperationId(BULK_ACTION.OPEN_TEST_SESSIONS)]) {
    assert.equal(normalizeBulkOperationId(id), id, `${id} is a valid idempotency key`);
  }
});

test('an operation is driven until every student has an outcome, reporting each answer', async () => {
  const ids = ['s1', 's2', 's3', 's4', 's5'];
  let stored = newBulkOperation({ operationId: 'op-12345678', assignmentId: 'a', action: BULK_ACTION.WAIVE_REVIEW, targetStudentIds: ids, now: 1 });
  const seen = [];
  let calls = 0;
  const waits = [];
  const final = await driveBulkOperation({
    // The server does two students per call, and is "busy" once.
    step: async () => {
      calls += 1;
      if (calls === 2) return { ...bulkOperationView(stored), busy: true };
      ids.filter((id) => !stored.results[id]).slice(0, 2).forEach((id) => { stored = withBulkResult(stored, id, { outcome: 'succeeded' }, calls); });
      return bulkOperationView(stored);
    },
    onProgress: (view) => seen.push(`${view.counts.total - view.counts.pending}/${view.counts.total}${view.busy ? ' busy' : ''}`),
    wait: async (ms) => { waits.push(ms); },
  });
  assert.deepEqual(seen, ['2/5', '2/5 busy', '4/5', '5/5']);
  assert.deepEqual(waits, [2000], 'it waits only while another request holds the operation');
  assert.deepEqual([final.finished, final.tone, final.counts.succeeded], [true, 'success', 5]);

  // A call that fails stops the loop with the error: nothing is swallowed.
  await assert.rejects(driveBulkOperation({ step: async () => { throw new Error('network'); } }), /network/);
  // It cannot spin forever on a server that never finishes.
  let rounds = 0;
  const stuck = await driveBulkOperation({ step: async () => { rounds += 1; return { finished: false, counts: { total: 1, pending: 1 } }; }, maxRounds: 3 });
  assert.deepEqual([rounds, stuck.finished], [3, false]);
});

test('a partial failure is shown as an error, with the students named', () => {
  let stored = newBulkOperation({ operationId: 'op-12345678', assignmentId: 'a', action: BULK_ACTION.OPEN_TEST_SESSIONS, targetStudentIds: ['s1', 's2', 's3'], now: 1 });
  stored = withBulkResult(stored, 's1', { outcome: 'succeeded' }, 2);
  stored = withBulkResult(stored, 's2', { outcome: 'failed', detail: 'The secure Test plan could not be completed.' }, 3);
  const running = describeOperation(bulkOperationView(stored), (id) => ({ s2: 'Rivera, Ana' }[id] || id));
  assert.deepEqual([running.tone, running.finished, running.canContinue], ['error', false, true]);
  stored = withBulkResult(stored, 's3', { outcome: 'notEligible', detail: 'This student is inactive.' }, 4);
  const done = describeOperation(bulkOperationView(stored), (id) => ({ s2: 'Rivera, Ana', s3: 'Okafor, Chidi' }[id] || id));
  assert.deepEqual([done.tone, done.finished, done.canContinue, done.actionLabel], ['error', true, false, 'Open Test sessions']);
  assert.match(done.headline, /did not finish for everyone: 1 succeeded, 1 not eligible, 1 failed/);
  assert.deepEqual(done.failures, [{ studentId: 's2', name: 'Rivera, Ana', detail: 'The secure Test plan could not be completed.' }]);
  assert.deepEqual(done.notEligible, [{ studentId: 's3', name: 'Okafor, Chidi', detail: 'This student is inactive.' }]);
  assert.equal(describeOperation(null), null);
});

test('a time a teacher types is read as school time, whatever zone the browser is in', () => {
  const TZ = 'America/Chicago';
  // 4:00 PM on 15 October in Chicago (CDT, UTC-5) is 21:00 UTC.
  const instant = instantFromSchoolInput('2026-10-15T16:00', TZ);
  assert.equal(instant, Date.UTC(2026, 9, 15, 21, 0));
  assert.equal(schoolInputValue(instant, TZ), '2026-10-15T16:00');
  // Standard time in January (UTC-6).
  assert.equal(instantFromSchoolInput('2027-01-11T08:30', TZ), Date.UTC(2027, 0, 11, 14, 30));
  assert.equal(schoolDateKey(Date.UTC(2026, 9, 16, 3, 0), TZ), '2026-10-15', 'late evening in Chicago is still the 15th');
  assert.equal(instantFromSchoolInput('next Tuesday', TZ), null);
  assert.equal(schoolInputValue(null, TZ), '');
});

test('the Review reads as progress, points, percent, status and when it was last saved', () => {
  assert.deepEqual(describeReviewSummary({ total: 4, attempted: 3, earnedPoints: 2.5, possiblePoints: 4, percent: 63, status: 'inProgress', lastSavedLabel: 'Fri, Oct 9, 10:04 AM CDT' }), {
    status: 'In progress',
    progress: '3/4',
    points: '2.5/4 pts',
    percent: 63,
    saved: 'Fri, Oct 9, 10:04 AM CDT',
    line: 'In progress · 3/4 answered · 2.5/4 pts · 63%',
  });
  assert.equal(describeReviewSummary({ total: 4, attempted: 0, earnedPoints: 0, possiblePoints: 4, percent: 0, status: 'waived' }).status, 'Waived');
  assert.equal(describeReviewSummary({ total: 0 }).line, 'No Review questions');
});

test('a grade can be set from the Review score, the actual Retest score, or a typed grade with a note', () => {
  const missed = row('s5', { review: { total: 4, attempted: 4, earnedPoints: 3, possiblePoints: 4, percent: 75 }, rawRetestGrade: 86, retestCappedContribution: 70, recordedGrade: 70 });
  const { choices, adjusted, current } = gradeAdjustmentChoices(missed);
  assert.deepEqual(choices.map((choice) => [choice.source, choice.label, choice.grade]), [
    ['review', 'Use the Review score (75%)', 75],
    ['retestActual', 'Use the actual Retest score (86%)', 86],
    ['manual', 'Enter a grade', null],
  ]);
  assert.match(choices[0].detail, /3 of 4 points.*done with hints and retries; the secure scores are kept/);
  assert.match(choices[1].detail, /instead of the capped 70%/);
  assert.deepEqual([adjusted, current], [false, null]);
  // No Review and no Retest: only a typed grade.
  assert.deepEqual(gradeAdjustmentChoices(row('s9', { review: { total: 0 } })).choices.map((choice) => choice.source), ['manual']);
  const set = gradeAdjustmentChoices({ ...missed, gradeAdjustment: { grade: 86, by: 'teacher@example.org' }, ruleRecordedGrade: 70 });
  assert.deepEqual([set.adjusted, set.current], [true, 'Set by teacher@example.org to 86%. The grade rule alone would record 70%.']);

  assert.equal(validateManualGrade({ grade: '85', note: 'Agreed with the family' }), null);
  assert.equal(validateManualGrade({ grade: '', note: 'why' }), 'Enter a grade from 0 to 100.');
  assert.equal(validateManualGrade({ grade: '140', note: 'why' }), 'Enter a grade from 0 to 100.');
  assert.equal(validateManualGrade({ grade: '85', note: '   ' }), 'Add a short note saying why you are setting this grade.');
});

test('the classes and students offered are the ones that can actually be added', () => {
  const classes = [
    { classId: 'c1', name: 'Algebra I — 1st', teacherOfRecord: 'Me@School.org' },
    { classId: 'c2', name: 'Algebra I — 2nd', teacherOfRecord: 'me@school.org' },
    { classId: 'c3', name: 'Algebra I — 3rd', teacherOfRecord: 'someone.else@school.org' },
    { classId: 'c4', name: 'Old class', teacherOfRecord: 'me@school.org', status: 'archived' },
  ];
  const students = [
    { id: 's1', classId: 'c1' }, { id: 's7', classId: 'c2' }, { id: 's8', classId: 'c3' }, { id: 's9', classId: 'c2', status: 'inactive' },
    { id: 's5', classId: 'c2' },
  ];
  const offered = audienceCandidates({ classes, students, audienceClassIds: ['c1'], rows: [row('s1'), row('s5')], teacherEmail: 'me@school.org' });
  assert.deepEqual(offered.assignedClasses, [{ classId: 'c1', label: 'Algebra I — 1st' }]);
  assert.deepEqual(offered.classes, [{ classId: 'c2', label: 'Algebra I — 2nd' }], 'not assigned already, not archived, and mine');
  // Not on the table, not in an assigned class, not inactive. (The server
  // still checks whose student each one is.)
  assert.deepEqual(offered.students.map((entry) => entry.studentId), ['s7', 's8']);
  assert.equal(offered.classLabel('c9'), 'c9');
});

test('the delete confirmation says what the evidence check found', () => {
  assert.deepEqual(describeLifecycleEvidence({ canDelete: true, secureSessions: 2, classroomPublications: 1 }), {
    canDelete: true,
    text: 'No student has worked on this Test. Deleting removes it, 2 unstarted secure sessions and every record opened for it. Its Google Classroom post is not removed by deleting here.',
    classroomPublications: 1,
  });
  const blocked = describeLifecycleEvidence({ canDelete: false, studentsWithWork: 1 });
  assert.deepEqual([blocked.canDelete, blocked.text], [false, '1 student has work on this Test, so it cannot be deleted. Archive it instead: archiving hides it from students and keeps their work and grades.']);
  assert.match(describeLifecycleEvidence({ canDelete: false, studentsWithWork: 0, scanIncomplete: true }).text, /more secure sessions than can be checked/);
  assert.equal(describeLifecycleEvidence(null), null);
});

test('a student who missed the Test is a row that says so, with the actions that apply', () => {
  assert.equal(TEACHER_BUCKET_LABEL.missedTest, 'Missed Test — Retest at home');
  assert.ok(TEACHER_BUCKET_ORDER.includes('missedTest'));
  const missed = row('s5', {
    stage: 'retest', bucket: 'missedTest', missedTest: true, review: { attempted: 4, total: 4, complete: true },
    test: { state: 'assigned', examSessionId: 'e5' }, retest: { state: 'assigned', examSessionId: 'r5' },
    schedule: { test: { state: 'closed' }, followUp: { state: 'open' } },
  });
  const described = describeTeacherRow(missed);
  assert.deepEqual([described.bucketLabel, described.testText, described.retestText], ['Missed Test — Retest at home', 'Missed', 'Ready']);
  const actions = teacherActionsForRow(missed);
  const reopen = actions.find((item) => item.key === 'reopenTest');
  assert.equal(reopen.label, 'Reopen the Test for this student');
  assert.match(reopen.detail, /instead of the Retest\. Starting it closes the Retest that was opened in its place/);
  assert.ok(actions.some((item) => item.key === 'extendHome'));
  assert.ok(actions.some((item) => item.key === 'disableRetest' && item.confirm), 'a missed student\'s retest can be closed');
  assert.ok(actions.some((item) => item.key === 'adjustGrade'));
  // Not "open their Test session": they are past it.
  assert.ok(!actions.some((item) => item.key === 'openTest'));
  // Once they are sitting the Retest, the Test is not offered back.
  assert.ok(!teacherActionsForRow({ ...missed, retest: { state: 'inProgress', examSessionId: 'r5' } }).some((item) => item.key === 'reopenTest'));
  // Their Review can be waived, and the waiver says what it opens.
  const waive = teacherActionsForRow({ ...missed, stage: 'review', retest: { state: 'none', examSessionId: null } }).find((item) => item.key === 'waiveReview');
  assert.match(waive.detail, /start the Retest without finishing Review/);
  assert.equal(waive.doneNote, null);

  // A Test that waits on class time is not "Ready".
  const waiting = row('s3', { stage: 'test', bucket: 'readyForTest', windowClosed: 'test', test: { state: 'assigned', examSessionId: 'e3' }, schedule: { test: { state: 'upcoming' }, followUp: { state: 'upcoming' } } });
  assert.equal(describeTeacherRow(waiting).testText, 'Opened · waits for class time');
  assert.equal(teacherActionsForRow(waiting).find((item) => item.key === 'reopenTest').label, 'Open the Test for this student at another time');
  // The home window closed on a student with a Retest to take.
  const expired = { ...missed, windowClosed: 'followUp', schedule: { test: { state: 'closed' }, followUp: { state: 'closed' } } };
  assert.equal(describeTeacherRow(expired).retestText, 'Opened · home window closed');
  assert.equal(teacherActionsForRow(expired).find((item) => item.key === 'extendHome').label, 'Reopen Corrections and the Retest for this student');
  // With no window set, none of the window actions appear.
  const legacy = row('s1', { schedule: { test: { state: 'unset' }, followUp: { state: 'unset' } }, stage: 'corrections', test: { state: 'released', examSessionId: 'e1' } });
  assert.ok(!teacherActionsForRow(legacy).some((item) => ['reopenTest', 'extendHome'].includes(item.key)));
});
