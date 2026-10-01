/*
 * ON A DOL, QUIZ OR TEST, "CHECK x-INTERCEPT" RECORDS THE POINT AND SAYS
 * NOTHING ABOUT IT — AND A WRONG POINT IS GRADED WRONG.
 *
 * The intercept workflow (LinearInterceptsOrchestrator, the `linearIntercepts`
 * step-algebra route) is not a registry tool, so it never read the runtime
 * policy. Its point check said "That point does not match this equation…" and
 * only a right point completed the intercept: wrong checks cost nothing, so on
 * an exit ticket it was a free oracle. Because only right points completed,
 * the completion payload simply claimed every part was right.
 *
 * Now QuestionEngine passes `revealCorrectness={showOutcomeFeedback}`. Where it
 * is false any readable point is recorded in the same words and the workflow
 * moves on; no step credit is granted before Submit (credit for a right point
 * only would show in "% partial credit so far" — a verdict); the wrong-path
 * redirect never appears; and the payload grades each part against the
 * equation, so a wrong intercept is a complete, wrong part that earns nothing
 * and the question is not correct. Practice is unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  expectedInterceptPoint,
  interceptCompletionPayload,
  resolveInterceptCheck,
} from '../../src/tools/stepAlgebra2/linearInterceptsMath.js';
import { recordQuestionAttempt } from '../../functions/shared/attemptPolicy.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

// 2x − 4y = 8: x-intercept (4, 0), y-intercept (0, −2).
const standard = { A: 2, B: -4, C: 8 };
const expectedX = expectedInterceptPoint(standard, 'x');
const expectedY = expectedInterceptPoint(standard, 'y');

test('the fixture is what it claims', () => {
  assert.deepEqual(expectedX, [4, 0]);
  assert.deepEqual(expectedY, [0, -2]);
});

// ---------------------------------------------------------------- the check
test('where outcomes are withheld, a right and a wrong point are recorded alike, with no credit before Submit', () => {
  const check = (point, kind = 'x') => resolveInterceptCheck({ revealCorrectness: false, kind, point, expectedPoint: kind === 'x' ? expectedX : expectedY });
  const right = check('(4, 0)');
  const wrongValue = check('(5, 0)');
  const offAxis = check('(0, 4)');
  const observable = ({ completes, earnsStepCredit, message }) => ({ completes, earnsStepCredit, message });
  assert.deepEqual(observable(wrongValue), observable(right));
  assert.deepEqual(observable(offAxis), observable(right), 'not even "an x-intercept is on the x-axis"');
  assert.deepEqual(observable(right), { completes: true, earnsStepCredit: false, message: '' });
  // It still knows — for grading at submission.
  assert.equal(right.isCorrect, true);
  assert.equal(wrongValue.isCorrect, false);
  // An unreadable entry is turned back the same way for everyone: that is format, not correctness.
  assert.deepEqual(observable(check('4')), { completes: false, earnsStepCredit: false, message: 'Enter the intercept as an ordered pair, such as (3, 0).' });
});

test('where outcomes are shown, the check is the verdict practice always had', () => {
  const check = (point, kind = 'x') => resolveInterceptCheck({ revealCorrectness: true, kind, point, expectedPoint: kind === 'x' ? expectedX : expectedY });
  assert.deepEqual(check('(4, 0)'), { completes: true, isCorrect: true, earnsStepCredit: true, message: '' });
  assert.deepEqual(check('(5, 0)'), { completes: false, isCorrect: false, earnsStepCredit: false, message: 'That point does not match this equation. Recheck the value you solved for.' });
  assert.equal(check('(0, 4)').message, 'An x-intercept is a point on the x-axis, so its y-coordinate is 0.');
  assert.equal(check('(1, -2)', 'y').message, 'A y-intercept is a point on the y-axis, so its x-coordinate is 0.');
  assert.equal(check('4').completes, false);
  assert.equal(resolveInterceptCheck({ kind: 'x', point: '(5, 0)', expectedPoint: expectedX }).completes, false, 'default: outcomes shown');
});

// ---------------------------------------------------------------- the grade
test('the completion payload grades each intercept against the equation', () => {
  const right = interceptCompletionPayload({ x: { point: '(4, 0)' }, y: { point: '(0, -2)' } }, standard);
  assert.deepEqual(right, {
    isComplete: true,
    isCorrect: true,
    questionDetails: 'x-intercept (4, 0), y-intercept (0, -2)',
    responseKey: JSON.stringify({ x: [4, 0], y: [0, -2] }),
    parts: [
      { id: 'x-intercept', label: 'x-intercept', isComplete: true, isCorrect: true, response: '(4, 0)' },
      { id: 'y-intercept', label: 'y-intercept', isComplete: true, isCorrect: true, response: '(0, -2)' },
    ],
  });
  const wrong = interceptCompletionPayload({ x: { point: '(0, 4)' }, y: { point: '(0, -2)' } }, standard);
  assert.equal(wrong.isComplete, true, 'a recorded point completes the question — it can be submitted');
  assert.equal(wrong.isCorrect, false);
  assert.deepEqual(wrong.parts.map((part) => [part.id, part.isComplete, part.isCorrect]), [['x-intercept', true, false], ['y-intercept', true, true]]);
});

test('a submitted DOL attempt with a wrong intercept is recorded as attempted and wrong, and that intercept earns nothing', () => {
  const submit = (finished) => {
    const payload = interceptCompletionPayload(finished, standard);
    return recordQuestionAttempt({
      record: null,
      isCorrect: payload.isCorrect,
      parts: payload.parts,
      responseKey: payload.responseKey,
      maximumAttempts: 1,
    });
  };
  const wrong = submit({ x: { point: '(0, 4)' }, y: { point: '(0, 2)' } });
  assert.equal(wrong.record.status, 'expired', 'one attempt, used, not correct');
  assert.equal(wrong.result.isCorrect, false);
  assert.equal(wrong.record.partialCredit, 0, 'no intercept right: no credit');
  assert.deepEqual(wrong.result.incorrectParts, ['x-intercept', 'y-intercept']);
  const half = submit({ x: { point: '(4, 0)' }, y: { point: '(0, 2)' } });
  assert.equal(half.record.partialCredit, 50, 'the right intercept earns its part; the wrong one nothing');
  const right = submit({ x: { point: '(4, 0)' }, y: { point: '(0, -2)' } });
  assert.equal(right.record.status, 'correct');
  assert.equal(right.record.partialCredit, 100);
});

// ---------------------------------------------------------------- the screen is held to it
const orchestrator = executableSource(componentSource('src/LinearInterceptsOrchestrator.jsx'));
const engine = executableSource(componentSource('src/QuestionEngine.jsx'));

test('QuestionEngine hands the intercept workflow the activity\'s outcome policy', () => {
  const mount = region(engine, '<LinearInterceptsOrchestrator', '/>', 'orchestrator mount');
  assert.match(mount, /\n\s*revealCorrectness=\{showOutcomeFeedback\}/);
  assert.match(orchestrator, /\n\s*revealCorrectness = true,\n/, 'a host that passes nothing keeps the practice behaviour');
});

test('the check, the redirect, the credit and both completion reports go through the policy', () => {
  const check = region(orchestrator, 'const checkCurrentIntercept = () => {', 'const reopenIntercept', 'intercept check');
  assert.match(check, /const decision = resolveInterceptCheck\(\{ revealCorrectness, kind, point: stage\.point, expectedPoint \}\);/);
  assert.match(check, /const nextStage = \{ \.\.\.stage, checked: true, completed: decision\.completes \};/);
  assert.match(check, /setMessage\(decision\.message\);/);
  assert.match(check, /if \(decision\.earnsStepCredit\) \{\s*onStepGrade\?\.\(/, 'step credit only where the check is a verdict');
  assert.doesNotMatch(check, /compareOrderedPair|does not match this equation/, 'no second, ungated verdict');
  assert.match(check, /onStateChange\?\.\(interceptCompletionPayload\(finishedWork, standard\)\);/);
  const restore = region(orchestrator, 'const bothInterceptsFound =', 'const standardUsable', 'restored completion');
  assert.match(restore, /onStateChange\?\.\(interceptCompletionPayload\(work, standard\)\);/);
  assert.match(orchestrator, /const progressiveRedirect = revealCorrectness && shouldShowConceptRedirect\(/);
  assert.doesNotMatch(orchestrator, /isCorrect: true/, 'no part is ever claimed right without being graded');
});

test('where outcomes are withheld the finished state is neutral and stays changeable until Submit', () => {
  const content = region(orchestrator, 'const content = bothInterceptsFound ? (revealCorrectness ? (', ')) : !stage.committed ? (', 'completion content');
  const practice = content.slice(0, content.indexOf(') : ('));
  const withheld = content.slice(content.indexOf(') : ('));
  assert.match(practice, /Both intercepts found\./);
  assert.match(withheld, /Both intercepts recorded\./);
  assert.doesNotMatch(withheld, /#e6f4ea|#137333|found/, 'no green, no "found"');
  assert.match(withheld, /onClick=\{\(\) => reopenIntercept\('x'\)\}/);
  assert.match(withheld, /onClick=\{\(\) => reopenIntercept\('y'\)\}/);
  const chip = region(orchestrator, "const doneLook = revealCorrectness", ';', 'chip look');
  assert.match(chip, /\? \{ background: '#e6f4ea', color: '#137333', mark: '✓', suffix: '' \}/);
  assert.match(chip, /: \{ background: '#e8f0fe', color: '#174ea6', mark: '•', suffix: ' recorded' \}/);
  const reopen = region(orchestrator, 'const reopenIntercept = (target) => {', '\n  };', 'reopen');
  assert.match(reopen, /if \(bothInterceptsFound\) \{\s*completionReportedRef\.current = false;\s*onStateChange\?\.\(INCOMPLETE_PAYLOAD\);/, 'Submit waits again for the changed intercept');
  assert.match(orchestrator, /\{!revealCorrectness && !bothInterceptsFound && !disabled && \['x', 'y'\]\.filter/, 'reopen is offered only where outcomes are withheld');
});
