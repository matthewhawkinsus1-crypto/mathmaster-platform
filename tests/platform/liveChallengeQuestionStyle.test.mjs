import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CHALLENGE_QUESTION_STYLES,
  canonicalQuestionStyle,
  matchesQuestionStyle,
  pathToolIdOf,
} from '../../functions/shared/liveChallenge.mjs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const functionsIndex = read('../../functions/index.js');
const teacher = read('../../src/components/liveChallenge/LiveChallengeTeacher.jsx');
const student = read('../../src/components/liveChallenge/LiveChallengeStudent.jsx');
// Comments stripped: a promise made to a teacher has to be in the markup they
// read, not in a note to the next developer. Without this, a comment mentioning
// `pathToolId` satisfied the assertion while the panel said nothing.
const withoutComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const library = withoutComments(read('../../src/components/liveChallenge/ChallengeQuestionLibrary.jsx'));
const css = read('../../src/App.css');

/* ---------- the style contract ---------- */

test('an unknown or missing style falls back to any, never to a filter', () => {
  // A typo that silently meant "tools only" would empty most games.
  for (const bad of [undefined, null, '', 'TOOLS', 'interactive', 7, {}]) {
    assert.equal(canonicalQuestionStyle(bad), 'any', `${String(bad)} must fall back to any`);
  }
  CHALLENGE_QUESTION_STYLES.forEach((style) => assert.equal(canonicalQuestionStyle(style), style));
});

test('the tool id is read in every spelling the bank uses', () => {
  assert.equal(pathToolIdOf({ pathToolId: 'stepAlgebra' }), 'stepAlgebra');
  assert.equal(pathToolIdOf({ toolId: 'graphing2' }), 'graphing2');
  assert.equal(pathToolIdOf({ tool: { id: 'systemsWorkspace' } }), 'systemsWorkspace');
  assert.equal(pathToolIdOf({ pathToolId: '   ' }), null, 'whitespace is not a tool');
  assert.equal(pathToolIdOf({}), null);
  assert.equal(pathToolIdOf(null), null);
});

test('each style keeps exactly the questions it names', () => {
  const withTool = { id: 'a', pathToolId: 'stepAlgebra' };
  const typed = { id: 'b' };
  assert.equal(matchesQuestionStyle(withTool, 'tools'), true);
  assert.equal(matchesQuestionStyle(typed, 'tools'), false);
  assert.equal(matchesQuestionStyle(withTool, 'noTools'), false);
  assert.equal(matchesQuestionStyle(typed, 'noTools'), true);
  for (const question of [withTool, typed]) {
    assert.equal(matchesQuestionStyle(question, 'any'), true);
  }
});

/* ---------- it has to reach every draw, not just the first ---------- */

test('the style filters candidates on the server, not in the browser', () => {
  assert.match(functionsIndex, /async function loadChallengeCandidates\(db, \{ courseId, standardCode, questionStyle = "any" \}\)/);
  assert.match(functionsIndex, /\.filter\(\(question\) => challenge\.matchesQuestionStyle\(question, style\)\)/);
});

test('every callable that draws questions honours the style', () => {
  // A swap that ignored it would hand back exactly the kind of question the
  // teacher just chose not to have.
  const draws = ['exports.createLiveChallenge', 'exports.createChallengeDryRun', 'exports.swapChallengeDryRunRound'];
  draws.forEach((name) => {
    const start = functionsIndex.indexOf(name);
    assert.ok(start > 0, `${name} must exist`);
    // Bound by the next export, not a fixed window: createLiveChallenge loads a
    // roster first and is far longer than the others, and a window that stopped
    // short of the draw would pass by never reaching the code it checks.
    const nextExport = functionsIndex.indexOf('\nexports.', start + name.length);
    const block = functionsIndex.slice(start, nextExport > start ? nextExport : functionsIndex.length);
    assert.match(block, /loadChallengeCandidates\(/, `${name} must be a question draw`);
    // The VALUE matters, not the key name. A hardcoded "any" here would still
    // mention questionStyle while silently ignoring the teacher's choice, so
    // assert each callable reads it from the place that actually holds it.
    const source = name === 'exports.swapChallengeDryRunRound'
      ? /questionStyle: dryRun\.questionStyle/
      : /const questionStyle = challenge\.canonicalQuestionStyle\(request\.data\?\.questionStyle\)/;
    assert.match(block, source, `${name} must read the real question style`);
    assert.match(block, /loadChallengeCandidates\(db, \{[\s\S]{0,200}questionStyle/, `${name} must pass it to the draw`);
  });
});

test('a game that cannot be filled says which style emptied it', () => {
  // "Only 2 questions" is baffling on a bank of 800.
  assert.match(functionsIndex, /const questionStyleLabel = \(style\)/);
  assert.match(functionsIndex, /questionStyleLabel\(questionStyle\)\}\. At least/);
});

test('the choice is remembered on the room and on the dry run', () => {
  assert.match(functionsIndex, /standardCode,\n    questionStyle,\n    status: challenge\.LIVE_CHALLENGE_STATUS\.LOBBY/);
  assert.match(functionsIndex, /standardCode,\n    questionStyle,\n    roundSeconds,/);
});

/* ---------- the teacher can actually reach it ---------- */

test('the control exists and rehearses with the dry run', () => {
  assert.match(teacher, /Question style/);
  for (const value of ['any', 'tools', 'noTools']) {
    assert.match(teacher, new RegExp(`<option value="${value}"`), `${value} must be offered`);
  }
  assert.match(teacher, /questionStyle=\{questionStyle\}/, 'the dry run must rehearse the chosen style');
  // Changing the style must close a rehearsal drawn under the old one. Asserted
  // by reading the dependency list rather than matching it as a frozen literal,
  // which broke as soon as a new setting was correctly added to it — and which
  // never could have caught the failure that matters here.
  const deps = /setDryRunOpen\(false\); \}, \[([^\]]*)\]/.exec(teacher);
  assert.ok(deps, 'the effect that closes a stale rehearsal must exist');
  assert.ok(
    deps[1].split(',').map((name) => name.trim()).includes('questionStyle'),
    'a style change must close a rehearsal drawn under the old style',
  );
  assert.match(teacher, /courseId,\n        standardCode,\n        questionStyle,/, 'createLiveChallenge must send it');
});

/* ---------- the student round reads as a game ---------- */

test('the round bar shows standing, not just instructions', () => {
  assert.match(student, /Round \{roundIndex \+ 1\} of \{room\.roundCount\}/);
  assert.match(student, /Points banked this round/);
  assert.match(student, /const urgent = !expired && remainingMs <= 10000;/);
});

test('the countdown is announced to a screen reader, not only coloured', () => {
  assert.match(student, /aria-label=\{`\$\{Math\.ceil\(remainingMs \/ 1000\)\} seconds left`\}/);
  assert.match(student, /aria-live="polite"/);
  // Round pips are decoration over information already stated in words.
  assert.match(student, /aria-hidden="true"/);
});

test('the last-ten-seconds pulse respects prefers-reduced-motion', () => {
  assert.match(css, /@keyframes challengePulse/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]{0,200}challengePulse[\s\S]{0,60}animation: none/);
});

/* ---------- the student surface is a different place from an assignment ---------- */

test('the whole student shell is themed, not just one bar', () => {
  // A game bar bolted onto an assignment-coloured page still reads as the
  // assignment. Every status a student can land on gets the game ground.
  assert.match(student, /radial-gradient\(120% 90% at 50% 0%, #1f2a44/);
  assert.doesNotMatch(student, /background: '#f0f2f5'/, 'the old worksheet ground must be gone');
  for (const status of ['lobby', 'running', 'finished', 'cancelled']) {
    assert.ok(student.includes(`room.status === '${status}'`), `${status} must still render`);
  }
});

test('the question card itself stays light so the math tools keep their contrast', () => {
  // Recolouring a coordinate plane or a solver to match a dark theme trades a
  // game feel for a legibility problem in the one place that cannot afford it.
  assert.match(student, /<section style=\{\{ background: '#fff', borderRadius: 14, border: '1px solid #d8dde6', overflow: 'hidden' \}\}>/);
});

test('a student can see where they stand without waiting for the round to end', () => {
  assert.match(student, /Your score/);
  assert.match(student, /selfRow\.liveScore \?\? selfRow\.score/);
  // And the finish screen leads with their own result, not with the list.
  assert.match(student, /#\{selfRow\.rank\}/);
});

test('every exit route out of the game still exists', () => {
  // A themed dead end is worse than an ugly one. Cancelled and finished both
  // have to get a student back.
  const exits = student.match(/onClick=\{onExit\}/g) || [];
  assert.ok(exits.length >= 3, `expected an exit from header, finished and cancelled; found ${exits.length}`);
});

/* ---------- uploading more questions ---------- */

test('the teacher can add questions at the point of need, not by leaving', () => {
  // This used to be a paragraph telling the teacher to go and find the
  // importer under Path coverage. It is now the importer itself, mounted where
  // a teacher discovers the pool is thin — a stronger answer to the same need,
  // so the assertion follows the mechanism rather than the old prose.
  assert.match(teacher, /<ChallengeQuestionLibrary/, 'the library must be mounted in the teacher view');
  assert.match(teacher, /import ChallengeQuestionLibrary from '\.\/ChallengeQuestionLibrary\.jsx'/);
  // And it must really import, through the same secure server path as any
  // other Path import rather than a second bank of its own.
  assert.match(library, /import \{ seedPathQuestionBank \}/);
  assert.match(library, /seedPathQuestionBank\(/);
});

test('the teacher is told what actually makes a question interactive', () => {
  // The reason a teacher opens the library is that "Interactive tools only"
  // came up short, and uploading more typed-answer questions does not fix
  // that. `pathToolId` is the single field that decides it.
  assert.match(library, /pathToolId/);
  // Named tools must be ones the filter actually recognises.
  for (const tool of ['stepAlgebra', 'graphing2', 'systemsWorkspace']) {
    assert.ok(library.includes(tool), `${tool} must be named`);
  }
  // A tool id is exactly what the filter looks for, so the advice is true.
  assert.equal(pathToolIdOf({ pathToolId: 'graphing2' }), 'graphing2');
  assert.equal(pathToolIdOf({ answer: '5' }), null);
});
