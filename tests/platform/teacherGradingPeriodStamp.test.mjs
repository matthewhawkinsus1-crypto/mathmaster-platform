/*
 * NEW WORK IS FILED IN THE MARKING PERIOD IT WAS ASSIGNED IN.
 *
 * Unstamped assignments resolve to whatever marking period is current NOW
 * (the documented, migration-free fallback for legacy data). New assignments
 * were never stamped either, so the day a teacher moved on to the next
 * marking period, every earlier lesson moved with it into "current": the
 * gradebook picker, Grade Export's default scope and the student Grade
 * Center all filled back up with last period's work.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { currentGradingPeriodStamp, resolveAssignmentGradingPeriod } from '../../src/platform/student/gradingPeriods.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const settings = (currentPeriodId) => ({
  periods: [
    { id: 'mp1', label: '1st Marking Period', order: 1, archived: true },
    { id: 'mp2', label: '2nd Marking Period', order: 2 },
    { id: 'mp3', label: '3rd Marking Period', order: 3 },
  ],
  currentPeriodId,
});

test('the stamp is the marking period current at assignment time', () => {
  assert.deepEqual(currentGradingPeriodStamp(settings('mp2')), { gradingPeriod: { id: 'mp2', label: '2nd Marking Period', order: 2 } });
});

test('no configured period, no stamp — a school that never uses marking periods sees no change', () => {
  assert.deepEqual(currentGradingPeriodStamp(null), {});
  assert.deepEqual(currentGradingPeriodStamp({ periods: [], currentPeriodId: null }), {});
});

test('after the rollover, stamped work stays in its period; only unstamped legacy work follows "current"', () => {
  const stamped = { id: 'new', ...currentGradingPeriodStamp(settings('mp2')) };
  const legacy = { id: 'legacy' };
  const rolledOver = settings('mp3');
  assert.equal(resolveAssignmentGradingPeriod(stamped, rolledOver).id, 'mp2');
  assert.equal(resolveAssignmentGradingPeriod(stamped, rolledOver).isCurrent, false);
  assert.equal(resolveAssignmentGradingPeriod(legacy, rolledOver).id, 'mp3', 'legacy fallback unchanged');
});

test('assignment creation stamps it — only when it is actually assigned to a class', () => {
  const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /import \{[^}]*currentGradingPeriodStamp[^}]*\} from '\.\/platform\/student\/gradingPeriods\.js';/);
  const write = executableSource(region(app, 'const writeAssignmentVariant = async', 'assertFirestoreSafeAssignmentPayload(payload);', 'writeAssignmentVariant'));
  assert.match(write, /\.\.\.\(\(destination\.classIds \|\| \[\]\)\.length \? currentGradingPeriodStamp\(gradingPeriodSettings\) : \{\}\)/);
});
