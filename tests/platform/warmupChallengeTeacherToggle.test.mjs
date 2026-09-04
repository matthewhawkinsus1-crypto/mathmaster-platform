import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');

const teacher = read('../../src/components/liveChallenge/LiveChallengeTeacher.jsx');
const app = read('../../src/App.jsx');

test('a standalone challenge is still the default', () => {
  // The empty value must be the initial state, so an untouched panel behaves
  // exactly as it does today.
  assert.match(teacher, /useState\(''\);/);
  assert.match(teacher, /<option value="">No — students join from their dashboard<\/option>/);
});

test('the assignment id is sent to the server on create', () => {
  assert.match(teacher, /assignmentId: warmupAssignmentId \|\| null,/);
});

test('the opt-in is persisted before the room is created', () => {
  const createBlock = teacher.slice(teacher.indexOf('const create = async'), teacher.indexOf('const control = async'));
  const linkAt = createBlock.indexOf('onLinkWarmupChallenge(');
  const createAt = createBlock.indexOf('createLiveChallenge(');
  assert.ok(linkAt > -1 && createAt > -1);
  assert.ok(linkAt < createAt, 'a room must never exist for an assignment that is not switched on');
});

test('only assignments with a Warm-Up are offered', () => {
  assert.match(teacher, /assignment\?\.warmup\?\.enabled !== false/);
});

test('assignments not given to the selected class are filtered out', () => {
  assert.match(teacher, /ids\.includes\(classId\)/);
});

test('the toggle writes dotted paths so the rest of the Warm-Up survives', () => {
  // A whole-object write here would silently drop the window, the instruction
  // dates and the per-class closures.
  assert.match(app, /'warmup\.liveChallenge\.enabled': true/);
  assert.doesNotMatch(app, /warmup: \{ liveChallenge:/);
});

test('the teacher panel is given the assignments and the handler', () => {
  assert.match(app, /assignments=\{assignments\}/);
  assert.match(app, /onLinkWarmupChallenge=\{handleLinkWarmupChallenge\}/);
});

test('round settings are clamped before they are stored', () => {
  assert.match(app, /Math\.max\(3, Math\.min\(20, Number\(options\.roundCount\) \|\| 5\)\)/);
  assert.match(app, /Math\.max\(15, Math\.min\(120, Number\(options\.roundSeconds\) \|\| 30\)\)/);
});

test('the control tells the teacher what reaches the gradebook', () => {
  assert.match(teacher, /participation and accuracy are[\s\S]{0,80}challenge score is not/);
});
