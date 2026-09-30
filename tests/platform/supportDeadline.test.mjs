// Individualized extra-time deadlines: derived from the student's pinned
// profile and the class dates, never stored on the world-readable assignment,
// never earlier than anything the student already had.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeDueDateExtension, addSchoolDays, extendDueInstant, describeDueDateExtension,
  resolveStudentSupportDeadline, withStudentSupportDates, supportDatesFromOverride, assignmentHasWrittenResponse,
} from '../../functions/shared/supportDeadline.mjs';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import { zonedDateKey } from '../../functions/shared/instructionalCalendar.mjs';

const CHICAGO = 'America/Chicago';

const planProfile = (accommodations, { effectiveStart = '2026-08-17', status = 'active' } = {}) => buildSupportProjection({
  revisions: [{ id: 'r1', revisionId: 'r1', revision: 1, status, effectiveStart, effectiveEnd: null, inclusionStatus: false, accommodations, modifications: [] }],
  todayKey: '2026-09-30',
});

const extraTime = (dueDateExtension, appliesTo = []) => [{ id: 'extra-time', params: { dueDateExtension }, appliesTo }];

test('extension parameters are clamped; garbage means no extension', () => {
  assert.deepEqual(normalizeDueDateExtension({ mode: 'school-days', value: 9 }), { mode: 'school-days', value: 5 });
  assert.deepEqual(normalizeDueDateExtension({ mode: 'hours', value: 500 }), { mode: 'hours', value: 72 });
  assert.deepEqual(normalizeDueDateExtension({ mode: 'hours', value: -3 }), { mode: 'none', value: 0 });
  assert.deepEqual(normalizeDueDateExtension(null), { mode: 'none', value: 0 });
  assert.equal(describeDueDateExtension({ mode: 'school-days', value: 1 }), 'until the end of the next school day');
});

test('school days skip the weekend', () => {
  assert.equal(addSchoolDays('2026-10-02', 1), '2026-10-05'); // Fri → Mon
  assert.equal(addSchoolDays('2026-09-30', 1), '2026-10-01'); // Wed → Thu
  assert.equal(addSchoolDays('2026-10-01', 3), '2026-10-06'); // Thu → Tue
});

test('"up to the next day" ends at the end of the next school day, school time', () => {
  const classDue = Date.parse('2026-10-02T23:59:59.999-05:00'); // Friday end of day, Chicago
  const extended = extendDueInstant({ classDueAtMs: classDue, extension: { mode: 'school-days', value: 1 } });
  assert.equal(zonedDateKey(extended, CHICAGO), '2026-10-05');
  assert.equal(new Date(extended).toISOString(), '2026-10-06T04:59:59.999Z');
  assert.equal(extendDueInstant({ classDueAtMs: classDue, extension: { mode: 'hours', value: 24 } }), classDue + 86400000);
});

test('a legacy extra-time box moves no deadline (it only ever disabled the idle prompt)', () => {
  const assignment = { dueAt: '2026-10-01', lateDueAt: '2026-10-03' };
  assert.equal(resolveStudentSupportDeadline({ assignment, profile: { accommodations: ['extra-time'] } }), null);
  // …nor does a versioned extra time with no extension chosen.
  assert.equal(resolveStudentSupportDeadline({ assignment, profile: planProfile(extraTime({ mode: 'none' })) }), null);
});

test('the individualized due is later; the final cutoff is the later of the class final and it', () => {
  const profile = planProfile(extraTime({ mode: 'school-days', value: 1 }));
  // Class has a long late window: the final cutoff stays the class's.
  const long = resolveStudentSupportDeadline({ assignment: { dueAt: '2026-10-01', lateDueAt: '2026-10-09' }, profile });
  assert.equal(zonedDateKey(long.supportDueAtMs, CHICAGO), '2026-10-02');
  assert.equal(long.supportFinalAtMs, long.classFinalAtMs);
  // No late window: the final cutoff moves to the individualized due.
  const none = resolveStudentSupportDeadline({ assignment: { dueAt: '2026-10-01' }, profile });
  assert.equal(none.supportFinalAtMs, none.supportDueAtMs);
  assert.ok(none.supportFinalAtMs > none.classFinalAtMs);
  assert.equal(none.revisionId, 'r1');
  assert.equal(none.supportId, 'extra-time');
});

test('the profile in effect on the CLASS due date governs, so a later change does not rewrite past work', () => {
  const startsLater = planProfile(extraTime({ mode: 'school-days', value: 1 }), { effectiveStart: '2026-10-05' });
  assert.equal(resolveStudentSupportDeadline({ assignment: { dueAt: '2026-10-01' }, profile: startsLater }), null);
  assert.ok(resolveStudentSupportDeadline({ assignment: { dueAt: '2026-10-06' }, profile: startsLater }));
  const inactive = planProfile(extraTime({ mode: 'school-days', value: 1 }), { status: 'inactive' });
  assert.equal(resolveStudentSupportDeadline({ assignment: { dueAt: '2026-10-06' }, profile: inactive }), null);
});

test('extra time limited to timed class windows does not move the assignment due date', () => {
  const profile = planProfile(extraTime({ mode: 'school-days', value: 1 }, ['dol', 'warmup']));
  assert.equal(resolveStudentSupportDeadline({ assignment: { dueAt: '2026-10-01' }, profile }), null);
});

test('extra time for written response applies only to assignments with written items', () => {
  const profile = planProfile([{ id: 'extra-time-written-response', params: { dueDateExtension: { mode: 'hours', value: 24 } }, appliesTo: [] }]);
  assert.equal(resolveStudentSupportDeadline({ assignment: { dueAt: '2026-10-01', questions: [{ type: 'multipleChoice' }] }, profile }), null);
  const written = { dueAt: '2026-10-01', questions: [{ type: 'multipleChoice' }, { type: 'openResponse' }] };
  assert.ok(assignmentHasWrittenResponse(written));
  assert.ok(resolveStudentSupportDeadline({ assignment: written, profile }));
});

test('injection adds the support dates beside an attendance extension without touching it or the input', () => {
  const assignment = Object.freeze({
    id: 'A1',
    dueAt: '2026-10-01',
    studentOverrides: Object.freeze({
      S1: Object.freeze({ lateDueAt: '2026-10-08', extension: Object.freeze({ meetingsGranted: 2 }) }),
      S2: Object.freeze({ excused: true }),
    }),
  });
  const profile = planProfile(extraTime({ mode: 'school-days', value: 1 }));
  const forS1 = withStudentSupportDates(assignment, 'S1', profile);
  assert.notEqual(forS1, assignment);
  assert.equal(forS1.studentOverrides.S1.lateDueAt, '2026-10-08', 'the attendance extension is untouched');
  assert.deepEqual(forS1.studentOverrides.S1.extension, { meetingsGranted: 2 });
  assert.deepEqual(forS1.studentOverrides.S2, { excused: true }, 'other students are untouched');
  const dates = supportDatesFromOverride(forS1.studentOverrides.S1);
  assert.equal(zonedDateKey(dates.dueAtMs, CHICAGO), '2026-10-02');
  assert.equal(dates.supportDeadline.revisionId, 'r1');
  assert.equal(assignment.studentOverrides.S1.supportDueAt, undefined, 'the stored assignment is never mutated');
  // No support: the very same object comes back.
  assert.equal(withStudentSupportDates(assignment, 'S1', {}), assignment);
});
