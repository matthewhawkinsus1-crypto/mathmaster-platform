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
 * only would show in "% partial credit so far" — a verdict); and the
 * wrong-path redirect never appears. Whether a point is right is never decided
 * by the workflow itself: the check asks the shared grader's per-intercept
 * check (checkLinearIntercept), and the completion payload is the shared
 * grader's verdict on the two recorded pairs — the function the server runs on
 * the same work — so a wrong intercept is a complete, wrong part that earns
 * nothing and the question is not correct. Practice is unchanged.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  expectedInterceptPoint,
  resolveInterceptCheck,
} from '../../src/tools/stepAlgebra2/linearInterceptsMath.js';
import {
  checkLinearIntercept,
  linearInterceptsWork,
  stepAlgebraWorkGrader,
} from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { answerStateFromSharedGrading } from '../../src/platform/grading/sharedAnswerState.js';
import { parseOrderedPair } from '../../src/answerUtils.js';
import { recordQuestionAttempt } from '../../functions/shared/attemptPolicy.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

// 2x − 4y = 8: x-intercept (4, 0), y-intercept (0, −2).
const standard = { A: 2, B: -4, C: 8 };
const question = { type: 'stepAlgebra', mode: 'linearIntercepts', prompt: 'Find both intercepts.', standard };
const expectedX = expectedInterceptPoint(standard, 'x');
const expectedY = expectedInterceptPoint(standard, 'y');

test('the fixture is what it claims', () => {
  assert.deepEqual(expectedX, [4, 0]);
  assert.deepEqual(expectedY, [0, -2]);
});

// ---------------------------------------------------------------- the check
// The orchestrator's Check: the shared grader's verdict on the point, then the
// activity's policy for what the check may do with it.
const checkAs = (revealCorrectness) => (point, kind = 'x') => resolveInterceptCheck({
  revealCorrectness,
  kind,
  point,
  isCorrect: checkLinearIntercept(standard, kind, point),
});

test('where outcomes are withheld, a right and a wrong point are recorded alike, with no credit before Submit', () => {
  const check = checkAs(false);
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
  const check = checkAs(true);
  assert.deepEqual(check('(4, 0)'), { completes: true, isCorrect: true, earnsStepCredit: true, message: '' });
  assert.deepEqual(check('(5, 0)'), { completes: false, isCorrect: false, earnsStepCredit: false, message: 'That point does not match this equation. Recheck the value you solved for.' });
  assert.equal(check('(0, 4)').message, 'An x-intercept is a point on the x-axis, so its y-coordinate is 0.');
  assert.equal(check('(1, -2)', 'y').message, 'A y-intercept is a point on the y-axis, so its x-coordinate is 0.');
  assert.equal(check('4').completes, false);
  assert.equal(resolveInterceptCheck({ kind: 'x', point: '(5, 0)', isCorrect: false }).completes, false, 'default: outcomes shown');
});

test('the policy never decides correctness itself: it follows the shared grader\'s verdict', () => {
  // A right point the grader called wrong is treated as wrong, and the
  // reverse: there is no second, local comparison to drift from the grader.
  assert.equal(resolveInterceptCheck({ revealCorrectness: true, kind: 'x', point: '(4, 0)', isCorrect: false }).completes, false);
  assert.equal(resolveInterceptCheck({ revealCorrectness: true, kind: 'x', point: '(5, 0)', isCorrect: true }).completes, true);
  assert.equal(resolveInterceptCheck({ kind: 'x', point: '(4, 0)' }).isCorrect, false, 'no verdict given: not right');
});

// ---------------------------------------------------------------- the grade
// What the orchestrator tells the host once both intercepts are in — built
// exactly as its interceptCompletionPayload builds it (the source contract
// below holds the component to these calls): the shared grader's verdict on
// the two recorded pairs.
const completionPayload = (finishedWork) => {
  const xIntercept = finishedWork.x?.point || '';
  const yIntercept = finishedWork.y?.point || '';
  const result = gradeToolCheck(stepAlgebraWorkGrader, question, linearInterceptsWork({ xIntercept, yIntercept }));
  return {
    ...answerStateFromSharedGrading(result, { questionDetails: `x-intercept ${xIntercept}, y-intercept ${yIntercept}` }),
    responseKey: JSON.stringify({ x: parseOrderedPair(xIntercept), y: parseOrderedPair(yIntercept) }),
  };
};
const partSummary = (payload) => payload.parts.map((part) => [part.id, part.isComplete, part.isCorrect, part.response]);

test('the completion payload grades each intercept against the equation', () => {
  const right = completionPayload({ x: { point: '(4, 0)' }, y: { point: '(0, -2)' } });
  assert.equal(right.isComplete, true);
  assert.equal(right.isCorrect, true);
  assert.equal(right.questionDetails, 'x-intercept (4, 0), y-intercept (0, -2)');
  assert.equal(right.responseKey, JSON.stringify({ x: [4, 0], y: [0, -2] }));
  assert.deepEqual(partSummary(right), [['x-intercept', true, true, '(4, 0)'], ['y-intercept', true, true, '(0, -2)']]);
  assert.ok(right.toolResponse, 'the raw work travels with it, for the server to grade');
  const wrong = completionPayload({ x: { point: '(0, 4)' }, y: { point: '(0, -2)' } });
  assert.equal(wrong.isComplete, true, 'a recorded point completes the question — it can be submitted');
  assert.equal(wrong.isCorrect, false);
  assert.deepEqual(wrong.parts.map((part) => [part.id, part.isComplete, part.isCorrect]), [['x-intercept', true, false], ['y-intercept', true, true]]);
});

test('a submitted DOL attempt with a wrong intercept is recorded as attempted and wrong, and that intercept earns nothing', () => {
  const submit = (finished) => {
    const payload = completionPayload(finished);
    // The server grades the same recorded work, and says the same.
    const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(payload.toolResponse)) });
    assert.equal(server.isCorrect, payload.isCorrect, 'server and device agree on the verdict');
    assert.deepEqual(server.parts.map((part) => [part.id, part.isCorrect]), payload.parts.map((part) => [part.id, part.isCorrect]));
    return recordQuestionAttempt({
      record: null,
      isCorrect: payload.isCorrect,
      parts: payload.parts,
      responseKey: payload.responseKey,
      partialCreditPercent: payload.partialCreditPercent,
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
  // Right or wrong is the shared grader's call; the policy says what to do with it.
  assert.match(check, /const isCorrect = checkLinearIntercept\(standard, kind, stage\.point\);/);
  assert.match(check, /const decision = resolveInterceptCheck\(\{ revealCorrectness, kind, point: stage\.point, isCorrect \}\);/);
  assert.match(check, /const nextStage = \{ \.\.\.stage, checked: true, completed: decision\.completes \};/);
  assert.match(check, /setMessage\(decision\.message\);/);
  assert.match(check, /if \(decision\.earnsStepCredit\) \{\s*onStepGrade\?\.\(/, 'step credit only where the check is a verdict');
  assert.equal((check.match(/onStepGrade\?\.\(/g) || []).length, 1, 'no second, ungated step report');
  assert.doesNotMatch(check, /compareOrderedPair|does not match this equation/, 'no second, ungated verdict');
  assert.match(check, /onStateChange\?\.\(interceptCompletionPayload\(finishedWork\)\);/);
  const restore = region(orchestrator, 'const bothInterceptsFound =', 'const standardUsable', 'restored completion');
  assert.match(restore, /onStateChange\?\.\(interceptCompletionPayload\(work\)\);/);
  // Both reports are the shared grader's verdict on the recorded pairs.
  const payload = region(orchestrator, 'const interceptCompletionPayload = (finishedWork) => {', '\n  };', 'completion payload');
  assert.match(payload, /gradeToolCheck\(stepAlgebraWorkGrader, question, linearInterceptsWork\(\{ xIntercept, yIntercept \}\)\)/);
  assert.match(payload, /\.\.\.answerStateFromSharedGrading\(result,/);
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
