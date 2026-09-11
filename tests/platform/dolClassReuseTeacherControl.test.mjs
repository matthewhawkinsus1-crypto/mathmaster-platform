import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const lifecycle = fs.readFileSync('src/assignmentLifecycle.js', 'utf8');
const teacherHome = fs.readFileSync('src/TeacherHome.jsx', 'utf8');
const classesWorkspace = fs.readFileSync('src/ClassesWorkspace.jsx', 'utf8');

test('DOL instructional date prefers real class identity over shared lesson date', () => {
  const start = lifecycle.indexOf('export const getDOLInstructionDateKey');
  const end = lifecycle.indexOf('export const getWarmupInstructionDateKey', start);
  const block = lifecycle.slice(start, end);
  assert.match(block, /instructionDatesByClassId/);
  assert.match(block, /instructionDatesByClassPeriod/);
  assert.ok(
    block.indexOf('instructionDatesByClassId') < block.indexOf('instructionDatesByClassPeriod'),
    'class ID override must be more specific than period override',
  );
});

test('teacher DOL release repairs stale date for only the selected class', () => {
  const start = app.indexOf('const handleUnlockDOLForClass');
  const end = app.indexOf('const handleToggleWarmupForClass', start);
  const block = app.slice(start, end);
  assert.match(block, /needsOpenToday = \['notToday', 'unscheduled'\]/);
  assert.match(block, /dol\.instructionDatesByClassId/);
  assert.match(block, /\[classId\]: dateKey/);
  assert.match(block, /dol\.earlyUnlocksByClassId/);
  assert.doesNotMatch(block, /DOL is not scheduled today/);
});

test('teacher screens keep stale reused DOL controls reachable', () => {
  assert.match(teacherHome, /Open DOL Today/);
  assert.match(teacherHome, /'notToday', 'unscheduled'/);
  assert.match(classesWorkspace, /Open DOL Today/);
  assert.match(classesWorkspace, /'waiting', 'beforeClass', 'notToday', 'unscheduled'/);
});


test('expired early DOL can restart only before the regular DOL cutoff', () => {
  const lifecycleStart = lifecycle.indexOf('export const getDOLState');
  const lifecycleEnd = lifecycle.indexOf('export const normalizeAssignmentActivity', lifecycleStart);
  const lifecycleBlock = lifecycle.slice(lifecycleStart, lifecycleEnd);
  assert.match(lifecycleBlock, /regularEndsAt/);
  assert.match(lifecycleBlock, /const canRestart = status === 'ended' && now < regularEndsAt/);
  assert.match(lifecycleBlock, /regularOpensAt,/);
  assert.match(lifecycleBlock, /regularEndsAt,/);
  assert.match(lifecycleBlock, /canRestart,/);

  const handlerStart = app.indexOf('const handleUnlockDOLForClass');
  const handlerEnd = app.indexOf('const handleToggleWarmupForClass', handlerStart);
  const handlerBlock = app.slice(handlerStart, handlerEnd);
  assert.match(handlerBlock, /const canRestart = state\.status === 'ended' && state\.canRestart === true/);
  assert.match(handlerBlock, /Restart DOL/);
  assert.match(handlerBlock, /final technology-return window/);
  assert.match(handlerBlock, /if \(\(state\.status === 'ended' && !canRestart\)/);
});

test('teacher DOL surfaces keep restartable ended timers actionable', () => {
  assert.match(teacherHome, /state\.canRestart === true/);
  assert.match(teacherHome, /Restart DOL/);
  assert.match(classesWorkspace, /dol\.canRestart/);
  assert.match(classesWorkspace, /RESTART AVAILABLE/);
  assert.match(classesWorkspace, /Restart DOL/);
});

console.log('dolClassReuseTeacherControl.test.mjs: all assertions passed');
