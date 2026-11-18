// Everything Step Algebra and its server work out from a balanced move, as
// plain JSON, for a test that runs it twice (issue #559): once as the platform
// runs it, and once with mathjs's own simplifyCore (mathjsOwnSimplifyCore.mjs).
//
//   node stepAlgebraMoveReadings.mjs [--mathjs-own]
//
// prints one JSON line: { mathjsOwn, visitsInTenTerms, cases: [{ name, readings }] },
// the long cases first, then the ordinary ones.
// Readings are the move as made, its reopen from a draft, the verdict at every
// support level, the equation committed each way, that equation's solved check,
// board, objective grade, the step grade and raw work, and the server's own
// verdict on the step.
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// Sides grown as an honest student grows them: each balanced move kept as
// written adds a term. Long enough to cost mathjs's own simplifyCore 2^n
// visits, short enough that it still finishes in a test.
export const LONG_SIDES = Object.freeze({
  ones: (terms) => `2x${' + 1'.repeat(terms)}`,
  likeTerms: (terms) => `2x${' + x'.repeat(terms)}`,
  mixed: (terms) => `2x${Array.from({ length: terms }, (_, i) => (i % 2 ? ' + x' : ' + 1')).join('')}`,
  keptAsWritten: (terms) => `3x + 6${Array.from({ length: terms }, (_, i) => (i % 2 ? ' + 2' : ' - 2')).join('')}`,
  product: (terms) => `2x${' * 2'.repeat(terms)}`,
  fractions: (terms) => `x/2${Array.from({ length: terms }, (_, i) => ` + ${i + 1}/3`).join('')}`,
  decimals: (terms) => `0.5x${Array.from({ length: terms }, (_, i) => ` + 0.${(i % 9) + 1}`).join('')}`,
});
export const LONG_MOVES = Object.freeze([['subtract', '3'], ['add', 'x'], ['multiply', '2'], ['divide', '2']]);

// Ordinary work: the equations a lesson's Step Algebra items hold, of every
// kind the solver reads, and the moves a student makes on them.
export const NORMAL_QUESTIONS = Object.freeze([
  '3x + 6 = 21', 'x/4 + 2 = 5', '(2x + 1)/3 = 5', '5x + 3 = 2x + 12', '2(x + 3) - 4 = 10', '0.6(2x + 1) = 4x + 6.2',
  '7 - 2x = 3x + 2', '2x + 1 = 2x + 3',
].map((equation) => ({ equation })).concat([
  { equation: 'x = 21 - 6', requireSimplifiedFinalForm: true },
  { equation: 'P = 2 l + 2 w', solveFor: 'w' },
  { equation: 'y = (8 - 2x)/(-4)', targetForm: 'slopeIntercept', requireSimplifiedFinalForm: true },
  { leftExpression: '5 - (x + 2)', rightExpression: '7' },
]).map((question, index) => ({ questionId: `normal-${index}`, type: 'stepAlgebra', prompt: 'Solve.', ...question })));
export const NORMAL_MOVES = Object.freeze([
  ['subtract', '6'], ['multiply', '2'], ['divide', '-3'], ['subtract', 'x'],
  ['add', '1/2', { left: { kind: 'after', termIndex: 0 }, right: { kind: 'after', termIndex: 0 } }],
]);

export const longCases = (terms = [13]) => Object.entries(LONG_SIDES).flatMap(([shape, side]) => terms.flatMap((count) => [
  { name: `${shape} × ${count} = 7`, question: { questionId: `long-${shape}-${count}`, type: 'stepAlgebra', prompt: 'Solve.', leftExpression: side(count), rightExpression: '7' } },
  ...(shape === 'ones' ? [{ name: `5 = ${shape} × ${count}`, question: { questionId: `long-${shape}-${count}-right`, type: 'stepAlgebra', prompt: 'Solve.', leftExpression: '5', rightExpression: side(count) } }] : []),
]).flatMap((entry) => LONG_MOVES.map((move) => ({ ...entry, name: `${entry.name}: ${move.join(' ')}`, move }))));

export const normalCases = () => NORMAL_QUESTIONS.flatMap((question) => NORMAL_MOVES.map((move) => ({
  name: `${question.equation || `${question.leftExpression} = ${question.rightExpression}`}: ${move.slice(0, 2).join(' ')}${move[2] ? ' (placed)' : ''}`,
  question,
  move,
})));

const outcome = (work) => {
  try {
    const value = work();
    return { value: value === undefined ? null : JSON.parse(JSON.stringify(value)) };
  } catch (error) {
    return { threw: `${error?.name}: ${error?.message}` };
  }
};

/** Every reading of one balanced move. */
export const moveReadings = async ({ question, move: [operation, operand, placementBySide = null] }) => {
  const load = (relative) => import(path.join(ROOT, relative));
  const engine = await load('src/algebraAstEngine.js');
  const draftState = await load('src/algebraDraftState.js');
  const supports = await load('src/algebraSupportLevels.js');
  const { buildCancellationModel } = await load('src/algebraCancellationModel.js');
  const verification = await load('functions/shared/serverGrading/stepAlgebraStepVerification.mjs');
  const { gradeEquationObjective } = await load('functions/shared/serverGrading/stepAlgebraEquationVerdict.mjs');
  const { emptyQuestionRecord } = await load('functions/shared/attemptPolicy.mjs');

  const equation = engine.parseEquationInput(question);
  const made = outcome(() => draftState.makePendingMove({ equation, operation, operand, placementBySide }));
  if (made.threw) return { made };
  const pending = made.value;
  const cancelled = pending.requiredCancellationSides || [];
  const committed = supports.resolveEquationAfterMove(pending, 3, cancelled);
  const draft = {
    algebraDraftVersion: draftState.ALGEBRA_DRAFT_VERSION,
    equation,
    pendingMove: draftState.pendingMoveDraft(pending),
    simplificationAnswers: { left: '1', right: '2' },
    workSteps: [],
  };
  const stepWork = outcome(() => verification.equationStepWork({
    action: verification.STEP_ACTIONS.BALANCED_MOVE, before: equation, after: committed, move: pending, supportLevel: 3,
  }));
  return {
    made,
    reopened: outcome(() => draftState.rehydrateAlgebraDraft({ draft, initialEquation: equation })),
    verdicts: [1, 2, 3, 4, 5].map((level) => outcome(() => {
      const { policy, ...verdict } = supports.evaluateMove(pending, level);
      return { ...verdict, level: policy.level };
    })),
    committed: [1, 2, 3, 4, 5].map((level) => outcome(() => [
      supports.resolveEquationAfterMove(pending, level, []),
      supports.resolveEquationAfterMove(pending, level, cancelled),
    ])),
    kept: outcome(() => supports.resolveEquationAfterKeepingMove(pending, cancelled)),
    simplifiedByStudent: outcome(() => supports.resolveEquationAfterStudentSimplification(pending, { left: 'x', right: '4' }, cancelled)),
    simplificationChecks: (pending.simplificationTargets || []).map((target) => outcome(() => [
      engine.expressionsEquivalent(target.simplifiedExpression, target.simplifiedExpression, equation.variable),
      engine.expressionsEquivalent('0', target.simplifiedExpression, equation.variable),
    ])),
    solvedAfter: outcome(() => engine.isSolvedEquation(committed)),
    board: outcome(() => ['left', 'right'].map((side) => ({
      model: buildCancellationModel(committed[side], null, committed.variable, []),
      terms: engine.splitAdditiveTerms(committed[side]),
    }))),
    objective: outcome(() => gradeEquationObjective(question, { equation: { left: committed.left, right: committed.right } })?.part),
    step: outcome(() => verification.equationMoveStepGrade({
      action: verification.STEP_ACTIONS.BALANCED_MOVE, move: pending, supportLevel: 3, before: equation, after: committed, question,
    })),
    stepWork,
    server: stepWork.threw
      ? null
      : outcome(() => verification.verifyStepAlgebraStep({ question, record: emptyQuestionRecord(), stepWork: stepWork.value })),
  };
};

/**
 * How many sums simplifyCore visits in a1 + a2 + … + a`terms` on the client's
 * instance (src/platform/math/mathjs.js): each of its trivial nodes asks
 * forEach for its children once a visit. terms - 1 when each is visited once;
 * 2^(terms - 1) - 1 with mathjs's own simplifyCore.
 */
export const simplifyCoreVisits = async (terms) => {
  const { math } = await import(path.join(ROOT, 'src/platform/math/mathjs.js'));
  const chain = math.parse(Array.from({ length: terms }, (_, index) => `a${index + 1}`).join(' + '));
  const prototype = math.OperatorNode.prototype;
  const forEach = prototype.forEach;
  let visits = 0;
  prototype.forEach = function countedForEach(callback) {
    if (this.fn === 'add') visits += 1;
    return forEach.call(this, callback);
  };
  try {
    math.simplifyCore(chain);
  } finally {
    prototype.forEach = forEach;
  }
  return visits;
};

// Run as a script: the readings of every case, with the platform's
// simplifyCore or (--mathjs-own) mathjs's own, and how many sums it visits in
// a 10-term chain (which shows which one ran).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mathjsOwn = process.argv.includes('--mathjs-own');
  if (mathjsOwn) register('./mathjsOwnSimplifyCore.mjs', import.meta.url);
  const results = [];
  for (const entry of [...longCases(), ...normalCases()]) results.push({ name: entry.name, readings: await moveReadings(entry) });
  process.stdout.write(`${JSON.stringify({ mathjsOwn, visitsInTenTerms: await simplifyCoreVisits(10), cases: results })}\n`);
}
