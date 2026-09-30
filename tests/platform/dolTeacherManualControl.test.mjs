import test from 'node:test';
import assert from 'node:assert/strict';

import { getDOLState, localDateKey } from '../../src/assignmentLifecycle.js';
import {
  buildDolClose, buildDolDateMove, buildDolExtension, buildDolScheduleRestore, buildDolWindowOpening, scheduledDolDateFor,
} from '../../src/platform/assessment/assessmentRecovery.js';
import { dolTeacherRecoveryActiveAt, resolveAuthoritativeClose, resolveDolWindow } from '../../functions/shared/sectionDeadline.mjs';

/*
 * Real classroom timing: a fire drill, an assembly, classwork that runs long.
 * The teacher must be able to open, close, extend and move a DOL for ONE class
 * without destroying the schedule underneath — and nothing here may finalize a
 * student's DOL before the DOL was actually open.
 */

const schedule = {
  version: 2,
  periods: {},
  daySchedules: {
    A: { periods: { 'Period 1': { enabled: true, start: '08:00', end: '09:30' } } },
    B: { periods: {} },
  },
  weeklyDayTypes: { 1: 'A', 2: 'B', 3: 'A', 4: 'B', 5: null },
  dayTypeOverrides: {},
  modifiedSchedules: {},
};

const at = (hour, minute, second = 0) => new Date(2026, 7, 31, hour, minute, second);
const TODAY = localDateKey(at(8, 0));

const lesson = (dol = {}) => ({
  schemaVersion: 5,
  sections: [{ id: 'dol', role: 'dol', title: 'DOL', questions: [{ questionId: 'dol-1', activityRole: 'dol', prompt: 'Solve x + 2 = 7.', type: 'freeResponse', expected: '5' }] }],
  dol: { enabled: true, minutesBeforeEnd: 10, closeMinutesBeforeEnd: 5, instructionDate: TODAY, ...dol },
});

const stateAt = (assignment, when, classId = 'class-a') => getDOLState({ assignment, schedule, classId, classPeriod: 'Period 1', nowValue: when });

test('regular window is unchanged when no teacher control exists (09:15–09:25)', () => {
  const state = stateAt(lesson(), at(9, 16));
  assert.equal(state.status, 'active');
  assert.equal(state.teacherClosed, false);
  assert.equal(state.endsAt.getMinutes(), 25);
});

test('Close now ends an open DOL for that class only, like the normal cutoff', () => {
  const base = lesson();
  const { dol } = buildDolClose({ assignment: base, classId: 'class-a', dateKey: TODAY, now: at(9, 18).getTime() });
  const closed = { ...base, dol };
  const after = stateAt(closed, at(9, 19));
  assert.equal(after.status, 'ended');
  assert.equal(after.teacherClosed, true);
  assert.equal(after.teacherClosedAt.getMinutes(), 18);
  // A teacher close is reopened as a recovery window, never a silent restart.
  assert.equal(after.canRestart, false);
  assert.equal(after.canRecover, true);
  // The other class sharing the lesson is untouched.
  assert.equal(stateAt(closed, at(9, 19), 'class-b').status, 'active');
  assert.equal(dol.recoveryAudit.at(-1).action, 'closeWindow');
});

test('the server finalizer closes at the teacher close time, with its own reason', () => {
  const base = lesson();
  const { dol } = buildDolClose({ assignment: base, classId: 'class-a', dateKey: TODAY, now: at(9, 18).getTime() });
  const close = resolveAuthoritativeClose({ assignment: { ...base, dol }, activityRole: 'dol', schedule, classId: 'class-a', classPeriod: 'Period 1', nowValue: at(9, 19), timeZone: undefined });
  assert.equal(close.reason, 'teacher-dol-close');
  assert.equal(new Date(close.closesAtMs).getMinutes(), 18);
});

test('the latest teacher action wins: a reopen after a close opens the DOL again', () => {
  const base = lesson();
  const closed = { ...base, dol: buildDolClose({ assignment: base, classId: 'class-a', dateKey: TODAY, now: at(9, 18).getTime() }).dol };
  const reopened = { ...closed, dol: buildDolWindowOpening({ assignment: closed, classId: 'class-a', recovery: true, dateKey: TODAY, now: at(9, 20).getTime() }).dol };
  const state = stateAt(reopened, at(9, 21));
  assert.equal(state.status, 'active');
  assert.equal(state.teacherRecovery, true);
  assert.equal(state.teacherClosed, false);
});

test('an unlock pressed inside the regular window after a close also supersedes the close', () => {
  const base = lesson();
  const closed = { ...base, dol: buildDolClose({ assignment: base, classId: 'class-a', dateKey: TODAY, now: at(9, 16).getTime() }).dol };
  const unlocked = { ...closed, dol: buildDolWindowOpening({ assignment: closed, classId: 'class-a', recovery: false, dateKey: TODAY, now: at(9, 17).getTime() }).dol };
  assert.equal(stateAt(unlocked, at(9, 18)).status, 'active');
});

test('a close from another day is inert today', () => {
  const base = lesson({ closedByClassId: { 'class-a': { dateKey: '2026-08-24', closedAt: at(9, 16).toISOString().replace('2026-08-31', '2026-08-24') } } });
  assert.equal(stateAt(base, at(9, 16)).status, 'active');
});

test('+5 min keeps students working past the pack-up cutoff, stays creditable, and never passes the bell', () => {
  const base = lesson();
  const window = { startMs: at(8, 0).getTime(), endMs: at(9, 30).getTime() };
  const active = stateAt(base, at(9, 23));
  const { dol, entry } = buildDolExtension({ assignment: base, classId: 'class-a', dateKey: TODAY, currentEndsAtMs: active.endsAt.getTime(), minutes: 5, capAtMs: window.endMs, now: at(9, 23).getTime() });
  assert.equal(new Date(entry.closesAt).getMinutes(), 30);
  const extended = { ...base, dol };
  assert.equal(stateAt(extended, at(9, 27)).status, 'active');
  assert.equal(dolTeacherRecoveryActiveAt({ assignment: extended, classId: 'class-a', at: at(9, 27).getTime(), timeZone: undefined }), true);
  const resolved = resolveDolWindow({ assignment: extended, window, classId: 'class-a', todayKey: TODAY });
  assert.equal(resolved.endsAtMs, window.endMs, 'capped at the end of the class period');
  assert.throws(() => buildDolExtension({ assignment: base, classId: 'class-a', dateKey: TODAY, currentEndsAtMs: window.endMs, capAtMs: window.endMs, now: window.endMs }));
});

test('Not today moves only this class, preserves the original schedule, and never ends (finalizes) the DOL', () => {
  const base = lesson();
  assert.equal(stateAt(base, at(9, 0)).status, 'waiting');
  const { dol } = buildDolDateMove({ assignment: base, classId: 'class-a', classPeriod: 'Period 1', toDateKey: '2026-09-02', todayKey: TODAY, now: at(9, 0).getTime() });
  const moved = { ...base, dol };
  const state = stateAt(moved, at(9, 16));
  // 'notToday', never 'ended': the student client only finalizes a DOL grade on 'ended'.
  assert.equal(state.status, 'notToday');
  assert.equal(state.instructionDateKey, '2026-09-02');
  assert.deepEqual(scheduledDolDateFor(moved, 'class-a'), { classDateKey: null, resolvedDateKey: TODAY });
  assert.equal(stateAt(moved, at(9, 16), 'class-b').status, 'active', 'other class keeps its DOL');
});

test('Back to the scheduled date restores the class exactly as it was, including "no class-specific date"', () => {
  const base = lesson();
  const moved = { ...base, dol: buildDolDateMove({ assignment: base, classId: 'class-a', toDateKey: '2026-09-02', todayKey: TODAY, now: at(9, 0).getTime() }).dol };
  const movedAgain = { ...moved, dol: buildDolDateMove({ assignment: moved, classId: 'class-a', toDateKey: '2026-09-03', todayKey: TODAY, now: at(9, 1).getTime() }).dol };
  // The first override's original is kept; later moves never overwrite it.
  assert.deepEqual(scheduledDolDateFor(movedAgain, 'class-a'), { classDateKey: null, resolvedDateKey: TODAY });
  const restored = { ...movedAgain, dol: buildDolScheduleRestore({ assignment: movedAgain, classId: 'class-a', todayKey: TODAY, now: at(9, 2).getTime() }).dol };
  assert.equal(restored.dol.instructionDatesByClassId['class-a'], undefined);
  assert.equal(scheduledDolDateFor(restored, 'class-a'), null);
  assert.equal(stateAt(restored, at(9, 16)).status, 'active');
  assert.equal(restored.dol.recoveryAudit.at(-1).action, 'returnToSchedule');
});

test('"Open DOL Today" on a reused lesson keeps the date it replaced, so the teacher can return to it', () => {
  const reused = lesson({ instructionDate: '2026-08-24', instructionDatesByClassId: { 'class-a': '2026-08-25' } });
  assert.equal(stateAt(reused, at(9, 0)).status, 'notToday');
  const { dol } = buildDolWindowOpening({ assignment: reused, classId: 'class-a', classPeriod: 'Period 1', recovery: false, dateKey: TODAY, now: at(9, 0).getTime() });
  const opened = { ...reused, dol };
  assert.deepEqual(scheduledDolDateFor(opened, 'class-a'), { classDateKey: '2026-08-25', resolvedDateKey: '2026-08-25' });
  const restored = buildDolScheduleRestore({ assignment: opened, classId: 'class-a', todayKey: TODAY, now: at(9, 1).getTime() }).dol;
  assert.equal(restored.instructionDatesByClassId['class-a'], '2026-08-25');
  assert.equal(restored.earlyUnlocksByClassId?.['class-a'], undefined, 'the same-day unlock is removed with it');
});

test('moving a DOL to another day drops a same-day unlock so it cannot follow the DOL', () => {
  const base = lesson();
  const unlocked = { ...base, dol: buildDolWindowOpening({ assignment: base, classId: 'class-a', recovery: false, dateKey: TODAY, now: at(8, 30).getTime() }).dol };
  const moved = buildDolDateMove({ assignment: unlocked, classId: 'class-a', toDateKey: '2026-09-02', todayKey: TODAY, now: at(8, 31).getTime() }).dol;
  assert.equal(moved.earlyUnlocksByClassId['class-a'], undefined);
});
