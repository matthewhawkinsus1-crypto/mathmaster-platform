/*
 * DECISION D1 (docs/qa/student-experience-pass-3.md, RUN-2): Step Algebra never
 * spends the question's tries on a valid move or a tap slip; the shorter route
 * stays as coaching.
 *
 * Before it, Standard (the default level) and Independent charged a try for a
 * valid but longer move, so on a one-try DOL adding 7 to both sides of
 * 3x + 6 = 21 ended the question ("That used the final attempt on this
 * version"), and three wrong-side taps while marking a cancellation closed a
 * Classwork item.
 *
 * What still spends a try is unchanged and lives outside these paths: the
 * student's recorded answer (recordQuestionAttempt). A move that would change
 * the solution set is refused before any step is reported, as before.
 *
 * The accounting is exercised through the shared functions both the workspace
 * and the server call; the workspace wiring is read as source (node cannot
 * render .jsx).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBalancedOperation, parseEquationInput } from '../../functions/shared/algebra/algebraAstEngine.mjs';
import { SUPPORT_LEVELS, evaluateMove, resolveEquationAfterMove } from '../../functions/shared/algebra/algebraSupportLevels.mjs';
import { emptyQuestionRecord, recordQuestionStep } from '../../functions/shared/attemptPolicy.mjs';
import {
  STEP_ACTIONS,
  equationMoveStepGrade,
  stepActionCountsAttempt,
} from '../../functions/shared/serverGrading/stepAlgebraStepVerification.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

const core = executableSource(componentSource('src/StepByStepAlgebraCore.jsx'));
const QUESTION = { equation: '3x + 6 = 21', variable: 'x' };
const equation = () => parseEquationInput(QUESTION);
const DOL_TRIES = 1;

// saveStep in StepByStepAlgebraCore, then App.handleStepGrade's recordQuestionStep.
const report = (record, { action, move, supportLevel, after }) => recordQuestionStep({
  record,
  stepGrade: equationMoveStepGrade({ action, move, supportLevel, before: equation(), after, question: QUESTION }),
  countsAttempt: stepActionCountsAttempt(action, { attemptsDoNotExpire: false }),
  maximumAttempts: DOL_TRIES,
});

test('a valid longer move on a one-try DOL leaves the question open at every level', () => {
  const longWay = applyBalancedOperation({ equationState: equation(), operation: 'add', operand: '7' });
  assert.equal(longWay.preservesSolution, true);
  SUPPORT_LEVELS.forEach(({ level }) => {
    const verdict = evaluateMove(longWay, level);
    assert.equal(verdict.countsAttempt, false, `level ${level}`);
    assert.equal(verdict.tone, 'growth', `level ${level} still coaches the shorter route`);
    const { record, result } = report(emptyQuestionRecord(), {
      action: STEP_ACTIONS.BALANCED_MOVE, move: longWay, supportLevel: level, after: resolveEquationAfterMove(longWay, level),
    });
    assert.equal(record.attemptCount, 0, `level ${level} spent the DOL's only try`);
    assert.equal(result.expired, false);
    assert.equal(record.status, 'attempted');
    assert.equal(record.stepGrades[0].productive, false, 'the step still records it was the longer route');
  });
});

test('tap slips on a one-try DOL leave the question open, however many', () => {
  const move = applyBalancedOperation({ equationState: equation(), operation: 'subtract', operand: '6' });
  let record = emptyQuestionRecord();
  for (let slip = 1; slip <= 4; slip += 1) {
    const outcome = report(record, { action: STEP_ACTIONS.REJECTED_MOVE, move, supportLevel: 3 });
    record = outcome.record;
    assert.equal(outcome.result.expired, false, `slip ${slip} closed the question`);
  }
  assert.equal(record.attemptCount, 0);
  assert.equal(record.stepGrades.length, 4, 'each slip is still recorded');
});

test('the workspace never reports a valid move as costing a try before committing it', () => {
  const attempt = region(core, 'const attemptMove = async', 'const localPoint =', 'attemptMove');
  assert.doesNotMatch(attempt, /INEFFICIENT_MOVE|countsAttempt|final attempt/);
  // An invalid move is still refused before any step is reported.
  const invalid = region(attempt, 'if (!move.preservesSolution) {', 'return;', 'invalid move');
  assert.match(invalid, /tone: 'error'/);
  assert.doesNotMatch(invalid, /saveStep/);
  // Every step's attempt use is the shared rule's.
  const save = region(core, 'const saveStep = async', 'const commitMove = async', 'saveStep');
  assert.match(save, /countsAttempt: stepActionCountsAttempt\(action, \{ attemptsDoNotExpire \}\)/);
});

test('a wrong-side tap and a wrong intermediate simplification give feedback and never close the question', () => {
  const strike = region(core, 'const strikeSide = async', 'const handleTermClick', 'strikeSide');
  const wrongSide = region(strike, 'if (!valid) {', 'return;', 'wrong-side tap');
  const simplify = region(core, 'const checkSimplifications = async', 'const cancellationsComplete', 'checkSimplifications');
  const wrongSimplification = region(simplify, 'if (incorrect.length) {', 'return;', 'wrong simplification');
  for (const [label, branch] of [['wrong-side tap', wrongSide], ['wrong simplification', wrongSimplification]]) {
    assert.match(branch, /setMessage\(\{ tone: 'growth'/, `${label}: feedback`);
    assert.doesNotMatch(branch, /expired|attempt|setPendingMove\(null\)/i, `${label}: must not spend or close`);
    // Only a slip-recording level reports it, and only as a REJECTED_MOVE.
    assert.match(branch, /if \(supportPolicy\.recordsSlips && !embedded\) await saveStep\(\{ move: pendingMove, action: STEP_ACTIONS\.REJECTED_MOVE \}\);/, `${label}: slip record`);
  }
});

test('the footnote says a longer route never uses a try, at every level', () => {
  const footnote = region(core, '{!embedded && <p', '</p>}', 'policy footnote');
  assert.match(footnote, /never uses a try/);
  assert.doesNotMatch(footnote, /uses an attempt|costs nothing|supportPolicy\.inefficientMoveCostsAttempt/);
});
