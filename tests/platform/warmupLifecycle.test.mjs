import assert from 'node:assert/strict';
import { getWarmupState } from '../../src/assignmentLifecycle.js';

const dateKey = '2026-08-17'; // Monday
const schedule = {
  version: 2,
  dayTypeOverrides: { [dateKey]: 'A' },
  daySchedules: {
    A: { periods: { 'Period 3': { enabled: true, start: '09:00', end: '10:30' } } },
    B: { periods: {} },
  },
};
// Assignment V5. getStoredAssignmentQuestions reads sections[] on a schemaVersion
// 5 document and returns [] for anything else, so a bare questions[] array is
// invisible to every lifecycle helper that asks what an assignment contains.
const assignment = {
  schemaVersion: 5,
  releaseAt: `${dateKey}T00:00:00`,
  warmup: { enabled: true, minutesBeforeStart: 7 },
  sections: [
    { id: 'warmup', role: 'warmup', questions: [{ activityRole: 'warmup' }] },
    { id: 'classwork', role: 'classwork', questions: [{ activityRole: 'classwork' }] },
  ],
};
const at = (time) => new Date(`${dateKey}T${time}:00`);

let state = getWarmupState({ assignment, schedule, classPeriod: 'Period 3', nowValue: at('08:52') });
assert.equal(state.status, 'waiting');
state = getWarmupState({ assignment, schedule, classPeriod: 'Period 3', nowValue: at('08:53') });
assert.equal(state.status, 'active');
assert.equal(state.opensAt.getHours(), 8);
assert.equal(state.opensAt.getMinutes(), 53);

const closed = {
  ...assignment,
  warmup: {
    ...assignment.warmup,
    closedByClassId: {
      'class-3': { dateKey, closedAt: `${dateKey}T09:08:00` },
    },
  },
};
state = getWarmupState({ assignment: closed, schedule, classId: 'class-3', classPeriod: 'Period 3', nowValue: at('09:10') });
assert.equal(state.status, 'closed');

const timedReopen = {
  ...assignment,
  warmup: {
    ...assignment.warmup,
    autoCloseByClassId: {
      'class-3': { dateKey, closesAt: `${dateKey}T09:15:00` },
    },
  },
};
state = getWarmupState({ assignment: timedReopen, schedule, classId: 'class-3', classPeriod: 'Period 3', nowValue: at('09:10') });
assert.equal(state.status, 'active');
assert.equal(state.autoCloseScheduled, true);
assert.equal(state.autoCloseAt.getHours(), 9);
assert.equal(state.autoCloseAt.getMinutes(), 15);
assert.equal(state.millisecondsRemaining, 5 * 60 * 1000);

state = getWarmupState({ assignment: timedReopen, schedule, classId: 'class-3', classPeriod: 'Period 3', nowValue: at('09:15') });
assert.equal(state.status, 'closed');
assert.equal(state.autoCloseScheduled, false);

// The timer belongs to one real class, not every class that happens to share
// the same bell period.
state = getWarmupState({ assignment: timedReopen, schedule, classId: 'class-other', classPeriod: 'Period 3', nowValue: at('09:16') });
assert.equal(state.status, 'active');
state = getWarmupState({ assignment, schedule, classPeriod: 'Period 3', nowValue: at('10:31') });
assert.equal(state.status, 'ended');
state = getWarmupState({ assignment, schedule, classPeriod: 'Period 3', nowValue: new Date('2026-08-18T09:00:00') });
assert.equal(state.status, 'notToday');
// A stale instructional date still returns today's bell window so the teacher
// live hub can offer "Open Warm-Up Today" instead of hiding the control.
assert.ok(state.window);

// A teacher-opened instructional date is scoped to the real class id. A class
// sharing the same bell period does not inherit the override.
const classSpecificOpen = {
  ...assignment,
  warmup: {
    ...assignment.warmup,
    instructionDate: '2026-08-16',
    instructionDatesByClassId: {
      'class-3': dateKey,
    },
  },
};
state = getWarmupState({ assignment: classSpecificOpen, schedule, classId: 'class-3', classPeriod: 'Period 3', nowValue: at('09:10') });
assert.equal(state.status, 'active');
state = getWarmupState({ assignment: classSpecificOpen, schedule, classId: 'class-other', classPeriod: 'Period 3', nowValue: at('09:10') });
assert.equal(state.status, 'notToday');
console.log('warmupLifecycle.test.mjs: all assertions passed');

// Bundled DOLs are one timed section: every authored DOL question is gated.
const { resolveDOLQuestionIndices } = await import('../../src/assignmentLifecycle.js');
const dolBundle = {
  schemaVersion: 5,
  sections: [
    { id: 'warmup', role: 'warmup', questions: [{ activityRole: 'warmup' }] },
    { id: 'classwork', role: 'classwork', questions: [{ activityRole: 'classwork' }] },
    {
      id: 'dol',
      role: 'dol',
      questions: [
        { activityRole: 'dol' },
        { activityRole: 'dol' },
        { activityRole: 'dol' },
      ],
    },
  ],
};
assert.deepEqual(resolveDOLQuestionIndices(dolBundle), [2,3,4]);
console.log('bundled DOL section indices: all assertions passed');
