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
const assignment = {
  schemaVersion: 5,
  releaseAt: `${dateKey}T00:00:00`,
  warmup: { enabled: true, minutesBeforeStart: 7 },
  sections: [
    { id: 'warmup', role: 'warmup', title: 'Warm-Up', questions: [{ type: 'multiAnswer' }] },
    { id: 'classwork', role: 'classwork', title: 'Classwork', questions: [{ type: 'multiAnswer' }] },
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
    closedByClassPeriod: {
      'Period 3': { dateKey, closedAt: `${dateKey}T09:08:00` },
    },
  },
};
state = getWarmupState({ assignment: closed, schedule, classPeriod: 'Period 3', nowValue: at('09:10') });
assert.equal(state.status, 'closed');
state = getWarmupState({ assignment, schedule, classPeriod: 'Period 3', nowValue: at('10:31') });
assert.equal(state.status, 'ended');
state = getWarmupState({ assignment, schedule, classPeriod: 'Period 3', nowValue: new Date('2026-08-18T09:00:00') });
assert.equal(state.status, 'notToday');
console.log('warmupLifecycle.test.mjs: all assertions passed');

// Bundled DOLs are one timed section: every authored DOL question is gated.
const { resolveDOLQuestionIndices } = await import('../../src/assignmentLifecycle.js');
const dolBundle = {
  schemaVersion: 5,
  sections: [
    { id: 'warmup', role: 'warmup', title: 'Warm-Up', questions: [{ type: 'multiAnswer' }] },
    { id: 'classwork', role: 'classwork', title: 'Classwork', questions: [{ type: 'multiAnswer' }] },
    {
      id: 'dol',
      role: 'dol',
      title: 'DOL',
      questions: [{ type: 'multiAnswer' }, { type: 'multiAnswer' }, { type: 'multiAnswer' }],
    },
  ],
};
assert.deepEqual(resolveDOLQuestionIndices(dolBundle), [2,3,4]);
console.log('bundled DOL section indices: all assertions passed');
