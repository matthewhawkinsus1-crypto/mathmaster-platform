import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const student = read('../../src/components/liveChallenge/LiveChallengeStudent.jsx');

test('a whole Live Challenge renders clean in a real browser', () => {
  const findings = JSON.parse(read('./fixtures/liveChallengeGameFindings.json'));
  assert.deepEqual(findings, [], `full-game check found problems:\n${JSON.stringify(findings, null, 2)}`);
});

/* ---------- the LaTeX leak the game harness found ---------- */

test('the round prompt is rendered as mathematics, not as text', () => {
  // Rendered raw, an authored `$7(x-9)=63$` reached the screen as those literal
  // characters during a timed round. renderAudit could not catch it: it renders
  // through PathSessionPlayer, and the challenge has its own fallback renderer.
  assert.match(student, /import MathText from '\.\.\/common\/MathText\.jsx'/);
  assert.match(student, /<MathText as="h2"[\s\S]{0,200}question\?\.prompt/);
  assert.doesNotMatch(student, /<h2[^>]*>\{question\?\.prompt\}<\/h2>/);
});

test('response field labels go through the same renderer', () => {
  // "Solve for $x$" is a label, not a prompt, and leaked identically.
  assert.match(student, /<MathText as="span">\{`\$\{field\.label \|\| 'Answer'\}/);
});

/* ---------- no white screen mid-round ---------- */

test('a grading result missing a number cannot throw inside a live round', () => {
  // The server always sends these. But this block renders under a countdown,
  // and one absent number would leave a student on a blank screen with no way
  // to answer, for this round and every one after it.
  assert.doesNotMatch(student, /result\.totalScore\.toLocaleString\(\)/);
  assert.match(student, /\(Number\(result\.totalScore\) \|\| 0\)\.toLocaleString\(\)/);
  for (const field of ['pointsAwarded', 'scorePercent', 'basePoints', 'speedBonus', 'streakBonus']) {
    assert.match(student, new RegExp(`Number\\(result\\.${field}\\) \\|\\| 0`), `${field} must be read defensively`);
  }
});

/* ---------- the harness cannot reach production ---------- */

test('the game harness is pinned to the emulator and to localhost', () => {
  const runner = read('../browser/liveChallengeGame.mjs');
  assert.match(runner, /context\.route\('\*\*\/\*'/);
  assert.match(runner, /route\.abort\(\)/);
  const swap = read('../browser/emulator/vite.config.mjs');
  // A string alias would silently not fire on relative specifiers and the
  // harness would load the real, production-pointed Firebase module.
  assert.match(swap, /resolved\.id === targetAbs/);
  const firebase = read('../browser/emulator/firebaseEmulator.js');
  assert.match(firebase, /connectFirestoreEmulator/);
  assert.doesNotMatch(firebase, /mathmaster-aleks/);
});

test('the harness builds its question with the real server pipeline', () => {
  // A hand-written question shape produced a fake LaTeX-leak finding once
  // already. The input has to come from the bank through the real sanitizer.
  const runner = read('../browser/liveChallengeGame.mjs');
  assert.match(runner, /instantiateQuestion/);
  assert.match(runner, /buildIssuePlan/);
  assert.match(runner, /buildSanitizedQuestion/);
});

test('the submit stub returns the shape the real callable returns', () => {
  const stub = read('../browser/emulator/liveChallengeServiceStub.js');
  for (const field of ['isCorrect', 'scorePercent', 'pointsAwarded', 'totalScore', 'streak', 'rank']) {
    assert.match(stub, new RegExp(`${field}[,:]`), `${field} must be in the stubbed result`);
  }
});
