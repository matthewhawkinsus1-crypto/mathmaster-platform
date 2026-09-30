/*
 * A TEACHER'S "OPEN DOL" MUST WORK.
 *
 * Since the zoned school clock landed (94a0f81), `localDateKey` read a string
 * as Number(text). The teacher DOL handler passed it an ISO timestamp, got '',
 * and buildDolWindowOpening threw "A DOL opening needs its instructional date"
 * — so Unlock DOL, Open DOL Today and Reopen DOL all failed for every class.
 * Found by driving the teacher-workflow harness (tests/browser/teacherWorkflow).
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { localDateKey } from '../../src/assignmentLifecycle.js';
import { buildDolWindowOpening } from '../../src/platform/assessment/assessmentRecovery.js';

const lifecycleUrl = new URL('../../src/assignmentLifecycle.js', import.meta.url).href;

test('an ISO timestamp names the same school day as the instant it came from', () => {
  const now = Date.now();
  assert.equal(localDateKey(new Date(now).toISOString()), localDateKey(now));
  assert.match(localDateKey(new Date(now).toISOString()), /^\d{4}-\d{2}-\d{2}$/);
});

test('a bare YYYY-MM-DD stays that day, even west of UTC', () => {
  // `new Date('2026-09-30')` is UTC midnight — the evening of the 29th in
  // Chicago. The key must still be the 30th.
  const script = `import(${JSON.stringify(lifecycleUrl)}).then((m) => process.stdout.write(m.localDateKey('2026-09-30') + '|' + m.localDateKey('2026-09-30T20:30:00-05:00')))`;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, TZ: 'America/Chicago' },
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
  }).toString();
  assert.equal(out, '2026-09-30|2026-09-30');
});

test('text that is not a date gives no key rather than a wrong one', () => {
  assert.equal(localDateKey('not a date'), '');
});

test('the teacher DOL opening builds with the key the handler derives', () => {
  const now = Date.now();
  const { dol, entry } = buildDolWindowOpening({
    assignment: { id: 'a1', dol: { enabled: true, minutesBeforeEnd: 10 } },
    classId: 'c1',
    dateKey: localDateKey(new Date(now).toISOString()),
    teacherId: 't1',
    now,
  });
  assert.equal(entry.dateKey, localDateKey(now));
  assert.equal(dol.instructionDatesByClassId.c1, localDateKey(now));
});
