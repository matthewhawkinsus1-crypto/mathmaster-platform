/*
 * STEP ALGEBRA READS A TYPED SIDE ON ITS OWN BEFORE IT ACCEPTS IT.
 *
 * After a balanced move the board asks for each side's simpler form ("15" for
 * 21 - 6), and Check compared it through expressionsEquivalent, which reads
 * the typed text only inside "(typed) - (expected)". A side readable only in
 * that context passed ("4)+(4" is 8 there) and was committed as typed. Where
 * QuestionEngine grades each step, the step's grade threw on it inside the
 * commit and Check silently did nothing; where no step is graded, the board
 * held a side nothing could read (drawn as written since 7f247b67), and the
 * server's replay refuses that state, so no later step was credited either.
 *
 * Now the side is read first, as the step commits it and the server replays it
 * (src/platform/algebra/typedSide.js), and a side that cannot be read is told
 * so in Simplify's own words. Only the client's acceptance changed: the shared
 * check (expressionsEquivalent) and the server's replay are as they were.
 *
 * The verdict sweep below works the repository's Step Algebra lessons as an
 * honest student does (a sample of the full sweep reported in the handoff):
 * every honest typed side is accepted exactly as before, and every side the
 * new read refuses is one the old check took only in context, and one the
 * server's replay already refused.
 * tests/browser/stepAlgebraStructureTools.mjs (unreadable-side) types one in Chromium.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { typedSideReadable, unreadableSidesMessage } from '../../src/platform/algebra/typedSide.js';
import { SIMPLIFY_MESSAGES } from '../../src/platform/algebra/simplify/simplifyEngine.js';
import {
  applyBalancedOperation,
  expressionToLatex,
  expressionsEquivalent,
  getEquationAnalysis,
  isSolvedEquation,
  latexToExpression,
} from '../../functions/shared/algebra/algebraAstEngine.mjs';
import { resolveEquationAfterMove, resolveEquationAfterStudentSimplification } from '../../functions/shared/algebra/algebraSupportLevels.mjs';
import { resolveStepAlgebraMode } from '../../functions/shared/serverGrading/stepAlgebraRouting.mjs';
import { workspacePristineEquation } from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import { STEP_ACTIONS, equationStepWork, verifyStepAlgebraStep } from '../../functions/shared/serverGrading/stepAlgebraStepVerification.mjs';
import { emptyQuestionRecord, recordQuestionStep } from '../../functions/shared/attemptPolicy.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { componentSource, executableSource, region } from './helpers/sourceContract.mjs';

test('a side is readable when it is plain algebra on its own, in any spelling MathLive or a keyboard gives', () => {
  for (const typed of ['15', '-3', '1.5', '(15)', '+15', '30/2', '\\frac{5}{3}', '\\frac53', '-\\frac{1}{2}', 'x+2', '2x', '\\sqrt{4}', '2\\pi', 'x^{2}', '\\left(x+1\\right)', '3\\cdot5']) {
    assert.equal(typedSideReadable(typed), true, typed);
  }
  for (const typed of ['4)+(4', '2x)-(x', '1)/(1', 'a)+(b', '(3', '3)', 'x=3', '3;', '3,', '', ' ', '\\left(', '"3"', '[3]', '3=', null, undefined]) {
    assert.equal(typedSideReadable(typed), false, String(typed));
  }
});

test('the old check took "4)+(4" for 8 only in context; the server\'s replay never read it', () => {
  // Why the side is read first: the comparison reads it inside "(typed) - (expected)".
  assert.equal(expressionsEquivalent('4)+(4', '8', 'x'), true);
  assert.equal(typedSideReadable('4)+(4'), false);
  // 3x + 6 = 21, subtract 6, the 6s cancelled: the right side typed "10)+(5" for 15.
  const question = { questionId: 'typed-side', type: 'stepAlgebra', prompt: 'Solve.', equation: '3x + 6 = 21' };
  const before = workspacePristineEquation(question);
  const move = applyBalancedOperation({ equationState: before, operation: 'subtract', operand: '6' });
  const [target] = move.simplificationTargets;
  assert.equal(target.side, 'right');
  assert.equal(expressionsEquivalent('10)+(5', target.simplifiedExpression, 'x'), true, 'the old check accepted it');
  const committed = resolveEquationAfterStudentSimplification(move, { right: latexToExpression('10)+(5') }, move.requiredCancellationSides);
  assert.equal(committed.right, '10)+(5', 'and the step committed it as typed');
  const replay = verifyStepAlgebraStep({ question, record: emptyQuestionRecord(), stepWork: equationStepWork({ action: STEP_ACTIONS.BALANCED_MOVE, before, after: committed, move, supportLevel: 3 }) });
  assert.equal(replay.verified, false);
  assert.equal(replay.reason, 'step-state-unreadable', 'the server already refused the state');
});

test('a side that cannot be read is told so in Simplify\'s words, naming the box', () => {
  assert.equal(unreadableSidesMessage(['right side']), 'MathMaster could not read what you typed for the right side yet. Enter only the expression for that side, without an equals sign.');
  assert.equal(unreadableSidesMessage(['left side', 'right side']), 'MathMaster could not read what you typed for the left side and right side yet. Enter only the expression for each side, without an equals sign.');
  // The same kind of message as Simplify's own box.
  assert.match(SIMPLIFY_MESSAGES.unreadableSide, /^MathMaster could not read that yet\. Enter only the expression for that side, without an equals sign\.$/);
});

test('Check reads each side on its own before comparing it, and an unreadable side records nothing', () => {
  const core = executableSource(componentSource('src/StepByStepAlgebraCore.jsx'));
  const check = region(core, 'const checkSimplifications = async () => {', 'const cancellationsComplete', 'Check my simplification');
  const read = check.indexOf('typedSideReadable(simplificationAnswers[target.side])');
  const compare = check.indexOf('expressionsEquivalent(simplificationAnswers[target.side]');
  assert.ok(read >= 0 && compare > read, 'read first, then compared');
  const refused = check.slice(read, compare);
  assert.match(refused, /setMessage\(\{ tone: 'growth', text: unreadableSidesMessage\(unreadable\.map\(\(target\) => target\.label\.toLowerCase\(\)\)\) \}\);\s*return;/);
  assert.doesNotMatch(refused, /saveStep|commitMove|onStepGrade/, 'nothing recorded, no try, nothing committed');
});

/* ------------------------------------------------------------- the verdict sweep (a sample) */

// A Step Algebra lesson compiled as a teacher's import compiles it, each family slot
// through two of its server-pinned versions, worked by an honest student. (The
// full sweep, every Step Algebra item in the repository and 24 versions of each
// slot, is in docs/handoffs/NOVEMBER_BUILD_2026-11.md.)
const lessonItems = () => {
  const text = readFileSync(new URL('../../teacher-import-jsons/algebra1-module3/T1_L1_Solving_Linear_Equations.json', import.meta.url), 'utf8');
  const { questions } = compileTeacherImport(text);
  const items = [];
  for (const question of questions.filter((entry) => ['stepAlgebra', 'algebra'].includes(entry.type))) {
    if (!question.questionFamily) { items.push(question); continue; }
    for (let seat = 0; seat < 2; seat += 1) {
      const instance = resolveFamilyQuestionInstance({ question, assignmentId: 'typed-side-sample', storageIndex: 0, allocation: { seat, variant: 0, stride: 40, index: seat, basis: 'provisional' } });
      if (instance?.question) items.push(instance.question);
    }
  }
  return items.filter((question) => resolveStepAlgebraMode(question) === 'equation');
};

// The honest move: the variable's terms to one side, its constant off, its coefficient divided.
const honestMove = (equation) => {
  const analysis = getEquationAnalysis(equation);
  if (!analysis.numericLinear) return null;
  const near = (value) => Math.abs(value) < 1e-9;
  const { left, right } = analysis;
  if (!near(left.coefficient) && !near(right.coefficient)) return { operation: 'subtract', operand: `${right.coefficient}*${equation.variable}` };
  const side = !near(left.coefficient) ? left : right;
  if (near(side.coefficient)) return null;
  if (!near(side.constant)) return side.constant > 0 ? { operation: 'subtract', operand: String(side.constant) } : { operation: 'add', operand: String(-side.constant) };
  if (!near(side.coefficient - 1)) return { operation: 'divide', operand: String(side.coefficient) };
  return null;
};

// What a student types for a side's simpler form, and what one types by accident.
const honestSpellings = (expected) => {
  const forms = new Set([expected, expressionToLatex(expected), expressionToLatex(expected).replace(/\\frac\{(\d)\}\{(\d)\}/g, '\\frac$1$2')]);
  const value = Number(expected.replace(/\s+/g, ''));
  if (Number.isInteger(value)) ['(V)', 'V.0', `${2 * value}/2`, `\\frac{${2 * value}}{2}`, `${value + 3}-3`].forEach((form) => forms.add(form.replace('V', value)));
  return [...forms];
};
const hostileSpellings = (expected) => {
  const value = Number(expected.replace(/\s+/g, ''));
  const forms = [`${expected})+(0`, `(${expected}`, `${expected})`, `x=${expected}`, `${expected};`, `${expected},`, `\\left(${expected}`];
  if (Number.isInteger(value)) forms.push(`${value - 1})+(1`, `${2 * value})/(2`);
  return forms;
};

test('verdict sweep: every honest side is taken as before, and only sides unreadable on their own, which the server already refused, change', () => {
  const tally = { items: 0, steps: 0, honest: 0, honestChanged: 0, serverVerified: 0, hostileTakenBefore: 0, hostileTakenNow: 0, hostileServerRefused: 0 };
  for (const question of lessonItems()) {
    tally.items += 1;
    let equation = workspacePristineEquation(question);
    let record = emptyQuestionRecord();
    for (let step = 0; step < 6 && !isSolvedEquation(equation); step += 1) {
      const choice = honestMove(equation);
      if (!choice) break;
      const move = applyBalancedOperation({ equationState: equation, ...choice });
      const crossed = move.requiredCancellationSides || [];
      const answers = {};
      for (const target of move.simplificationTargets || []) {
        const accepted = (typed) => typedSideReadable(typed) && expressionsEquivalent(typed, target.simplifiedExpression, equation.variable);
        for (const typed of honestSpellings(target.simplifiedExpression)) {
          tally.honest += 1;
          if (expressionsEquivalent(typed, target.simplifiedExpression, equation.variable) !== accepted(typed)) tally.honestChanged += 1;
        }
        for (const typed of hostileSpellings(target.simplifiedExpression)) {
          if (!expressionsEquivalent(typed, target.simplifiedExpression, equation.variable)) continue;
          tally.hostileTakenBefore += 1;
          if (accepted(typed)) tally.hostileTakenNow += 1;
          const committed = resolveEquationAfterStudentSimplification(move, { ...answers, [target.side]: latexToExpression(typed) }, crossed);
          const replay = verifyStepAlgebraStep({ question, record, stepWork: equationStepWork({ action: STEP_ACTIONS.BALANCED_MOVE, before: equation, after: committed, move, supportLevel: 3 }) });
          if (replay.eligible && !replay.verified) tally.hostileServerRefused += 1;
        }
        answers[target.side] = latexToExpression(target.simplifiedExpression);
      }
      const next = move.simplificationTargets?.length
        ? resolveEquationAfterStudentSimplification(move, answers, crossed)
        : resolveEquationAfterMove(move, 3, crossed);
      const replay = verifyStepAlgebraStep({ question, record, stepWork: equationStepWork({ action: STEP_ACTIONS.BALANCED_MOVE, before: equation, after: next, move, supportLevel: 3 }) });
      assert.equal(replay.verified, true, `the server credits the honest step ${JSON.stringify(equation)} -> ${JSON.stringify(next)}: ${replay.reason}`);
      tally.serverVerified += 1;
      record = recordQuestionStep({ record, stepGrade: replay.stepGrade, countsAttempt: false, statePatch: replay.statePatch, maximumAttempts: 3 }).record;
      tally.steps += 1;
      equation = next;
    }
  }
  // Not vacuous: the lesson's items were worked, sides typed, hostile ones taken before.
  assert.ok(tally.items >= 15 && tally.steps >= 40 && tally.honest >= 100 && tally.hostileTakenBefore >= 60, JSON.stringify(tally));
  assert.equal(tally.honestChanged, 0, `an honest side changed verdict: ${JSON.stringify(tally)}`);
  assert.equal(tally.hostileTakenNow, 0, 'a side readable only in context is still taken');
  assert.equal(tally.hostileServerRefused, tally.hostileTakenBefore, 'every side that changed verdict is one the server already refused');
});
