import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { region } from './helpers/sourceContract.mjs';
import { appSurfaceSource, teacherControlsSource } from './helpers/appScreens.mjs';

const withoutComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');
const read = (rel) => withoutComments(readFileSync(new URL(rel, import.meta.url), 'utf8'));

const teacher = read('../../src/components/liveChallenge/LiveChallengeTeacher.jsx');
const app = read('../../src/App.jsx');
// Since the App split the toggle's handler is createAssignmentLibraryControls' (the teacher kit);
// teacherControlsSource checks App calls it and takes handleLinkWarmupChallenge by name.
const linkWarmupChallenge = () => region(
  withoutComments(teacherControlsSource('createAssignmentLibraryControls')),
  'const handleLinkWarmupChallenge = async', 'const beginEditAssignmentDates', 'handleLinkWarmupChallenge',
);

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
  // The create that can carry an assignment is the one the link must precede.
  const creates = [...createBlock.matchAll(/createLiveChallenge\(\{([\s\S]*?)\n\s*\}\);/g)].map((match) => ({ at: match.index, payload: match[1] }));
  const linked = creates.filter((entry) => /\bassignmentId\b/.test(entry.payload));
  assert.ok(linkAt > -1 && linked.length === 1);
  assert.ok(linkAt < linked[0].at, 'a room must never exist for an assignment that is not switched on');
  // Any create before the opt-in (a Graph Feature Rush, which cannot be a
  // Warm-Up) sends no assignment at all.
  creates.filter((entry) => entry.at < linkAt).forEach((entry) => assert.doesNotMatch(entry.payload, /assignment/i));
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
  assert.match(linkWarmupChallenge(), /'warmup\.liveChallenge\.enabled': true/);
  // Refused wherever App's code now lives, so a whole-object write cannot hide by having moved.
  assert.doesNotMatch(withoutComments(appSurfaceSource()), /warmup: \{ liveChallenge:/);
});

test('the teacher panel is given the assignments and the handler', () => {
  // Mounted by the teacher's screen, its own module since G2, given App's
  // handler by name.
  const teacherWorkspace = read('../../src/app/teacher/TeacherWorkspace.jsx');
  assert.match(teacherWorkspace, /assignments=\{assignments\}/);
  assert.match(teacherWorkspace, /onLinkWarmupChallenge=\{handleLinkWarmupChallenge\}/);
  assert.match(app, /\n {8}handleLinkWarmupChallenge=\{handleLinkWarmupChallenge\}\n/);
});

test('round settings are clamped before they are stored', () => {
  assert.match(linkWarmupChallenge(), /Math\.max\(3, Math\.min\(20, Number\(options\.roundCount\) \|\| 5\)\)/);
  assert.match(linkWarmupChallenge(), /Math\.max\(15, Math\.min\(120, Number\(options\.roundSeconds\) \|\| 30\)\)/);
});

test('the control tells the teacher what reaches the gradebook', () => {
  assert.match(teacher, /participation and accuracy are[\s\S]{0,80}challenge score is not/);
});
