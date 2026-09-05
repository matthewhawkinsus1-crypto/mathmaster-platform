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
  assert.match(teacher, /setDryRunOpen\(false\); \}, \[classId, courseId, standardCode, questionStyle, roundCount, roundSeconds\]/);
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
