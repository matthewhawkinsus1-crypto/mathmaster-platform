import test from 'node:test';
import { buildDolWindowOpening } from '../../src/platform/assessment/assessmentRecovery.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getDOLInstructionDateKey } from '../../src/assignmentLifecycle.js';
import { dolTeacherRecoveryActiveAt, resolveDolWindow } from '../../functions/shared/sectionDeadline.mjs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const lifecycle = fs.readFileSync('src/assignmentLifecycle.js', 'utf8');
const teacherHome = fs.readFileSync('src/TeacherHome.jsx', 'utf8');
const classesWorkspace = fs.readFileSync('src/ClassesWorkspace.jsx', 'utf8');

test('DOL instructional date prefers real class identity over shared lesson date', () => {
  // Two real classes can share Period 3, so a teacher moving a reused lesson
  // to one of them must not reschedule its sibling. Asserted by running the
  // resolver rather than by reading it: the rule now lives in shared code so
  // the Cloud Functions deadline finalizer reaches the same answer, and what
  // matters is the precedence, not which file states it.
  const assignment = {
    dol: {
      instructionDate: '2026-01-05',
      instructionDatesByClassPeriod: { 'Period 3': '2026-01-06' },
      instructionDatesByClassId: { 'class-a': '2026-01-07' },
    },
  };
  assert.equal(getDOLInstructionDateKey(assignment, 'Period 3', 'class-a'), '2026-01-07');
  assert.equal(getDOLInstructionDateKey(assignment, 'Period 3', 'class-b'), '2026-01-06');
  assert.equal(getDOLInstructionDateKey(assignment, null, null), '2026-01-05');
});

test('teacher DOL release repairs stale date for only the selected class', () => {
  const start = app.indexOf('const handleUnlockDOLForClass');
  const end = app.indexOf('const handleToggleWarmupForClass', start);
  const block = app.slice(start, end);
  assert.match(block, /needsOpenToday = \['notToday', 'unscheduled'\]/);
  assert.match(block, /dol\.instructionDatesByClassId/);
  assert.match(block, /\[classId\]: dateKey/);
  assert.doesNotMatch(block, /DOL is not scheduled today/);
  // The unlock itself is built by the recovery model (so it is audited); the
  // handler hands it this class only.
  assert.match(block, /buildDolWindowOpening\(\{[\s\S]*?classId,[\s\S]*?recovery: recoveryNow,/);
  const other = { dol: { earlyUnlocksByClassId: { 'class-b': { dateKey: '2026-09-23', unlockedAt: '2026-09-23T15:00:00.000Z' } } } };
  const { dol } = buildDolWindowOpening({ assignment: other, classId: 'class-a', recovery: false, dateKey: '2026-09-24', now: Date.parse('2026-09-24T15:00:00Z') });
  assert.equal(dol.instructionDatesByClassId['class-a'], '2026-09-24');
  assert.equal(dol.earlyUnlocksByClassId['class-a'].dateKey, '2026-09-24');
  assert.deepEqual(dol.earlyUnlocksByClassId['class-b'], other.dol.earlyUnlocksByClassId['class-b'], 'another class is untouched');
  assert.equal(dol.instructionDatesByClassId['class-b'], undefined);
});

test('teacher screens keep stale reused DOL controls reachable', () => {
  assert.match(teacherHome, /Open DOL Today/);
  assert.match(teacherHome, /'notToday', 'unscheduled'/);
  assert.match(classesWorkspace, /Open DOL Today/);
  assert.match(classesWorkspace, /'waiting', 'beforeClass', 'notToday', 'unscheduled'/);
});


test('teacher can explicitly recover a DOL after the regular cutoff without rewriting the original window', () => {
  const assignment = {
    dol: {
      minutesBeforeEnd: 10,
      closeMinutesBeforeEnd: 5,
      recoveryByClassId: {
        'class-a': {
          dateKey: '2026-09-24',
          openedAt: '2026-09-24T20:00:00.000Z',
          closesAt: '2026-09-24T20:10:00.000Z',
          openedBy: 'teacher@example.com',
        },
      },
    },
  };
  const window = { startMs: Date.parse('2026-09-24T18:00:00.000Z'), endMs: Date.parse('2026-09-24T19:00:00.000Z') };
  const recovered = resolveDolWindow({ assignment, window, classId: 'class-a', todayKey: '2026-09-24' });
  assert.equal(recovered.teacherRecovery, true);
  assert.equal(recovered.opensAtMs, Date.parse('2026-09-24T20:00:00.000Z'));
  assert.equal(recovered.endsAtMs, Date.parse('2026-09-24T20:10:00.000Z'));
  assert.equal(dolTeacherRecoveryActiveAt({
    assignment,
    classId: 'class-a',
    at: '2026-09-24T20:05:00.000Z',
    timeZone: 'America/Chicago',
  }), true);
  assert.equal(dolTeacherRecoveryActiveAt({
    assignment,
    classId: 'class-b',
    at: '2026-09-24T20:05:00.000Z',
    timeZone: 'America/Chicago',
  }), false);

  const handlerStart = app.indexOf('const handleUnlockDOLForClass');
  const handlerEnd = app.indexOf('const handleToggleWarmupForClass', handlerStart);
  const handlerBlock = app.slice(handlerStart, handlerEnd);
  assert.match(handlerBlock, /Reopen DOL/);
  assert.match(handlerBlock, /buildDolWindowOpening\(\{[\s\S]*?recovery: recoveryNow,/);
  // What the handler writes on recovery: a class-scoped window with a close
  // and the teacher-recovery reason, recorded in the audit.
  const now = Date.parse('2026-09-24T20:00:00.000Z');
  const opening = buildDolWindowOpening({ assignment: { dol: { minutesBeforeEnd: 10 } }, classId: 'class-a', recovery: true, dateKey: '2026-09-24', now });
  assert.equal(opening.dol.recoveryByClassId['class-a'].reason, 'teacher-recovery');
  assert.equal(opening.dol.recoveryByClassId['class-a'].closesAt, '2026-09-24T20:10:00.000Z');
  assert.equal(opening.dol.recoveryByClassId['class-b'], undefined);
  assert.equal(opening.dol.recoveryAudit.at(-1).action, 'reopenWindow');
});

test('teacher DOL surfaces expose restart, reopen, and extra-attempt recovery', () => {
  assert.match(teacherHome, /state\.canRestart/);
  assert.match(teacherHome, /Reopen DOL/);
  assert.match(teacherHome, /Grant \+1 attempt/);
  assert.match(classesWorkspace, /dol\.canRestart/);
  assert.match(classesWorkspace, /RECOVERY AVAILABLE/);
  assert.match(classesWorkspace, /Reopen DOL/);
  assert.match(classesWorkspace, /Grant \+1 attempt/);
});

console.log('dolClassReuseTeacherControl.test.mjs: all assertions passed');
