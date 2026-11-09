/*
 * STEP ALGEBRA'S BOARD READINGS, KEPT BY TEXT, ARE THE ENGINE'S: A SWEEP.
 *
 * platform/algebra/committedEquationFacts.js keeps four readings of the
 * committed equation by the text they are worked out from, in a bounded cache
 * that outlives the board: whether it is solved, the move the strategic hint
 * suggests, each side's cancellation model and each side's terms. The solver
 * reads the hint's two only where the hint can be offered. Before, the board
 * asked the engine directly (behind a cache keyed on the equation object).
 *
 * This sweep reads every Step Algebra equation in the bank (the lessons, the
 * Path seeds, the demo bank and the platform's equation families), every
 * other equation the bank writes, and a set of edge cases (fractions,
 * radicals, inequalities, systems, no solution, identities, formulas,
 * finished forms, text that does not parse), and the equation after each
 * one's first suggested move. Each is read both ways: the engine's own
 * answers, as the board read them before, and the cache's, as a new object
 * each time (worked out, then kept), in one order and then back over the last
 * of them, past the cache's bound. Nothing may differ, a failure included.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EQUATION_READINGS_KEPT,
  boardTerms,
  committedCancellationModel,
  equationIsSolved,
  strategicHintReadings,
  suggestedMove,
} from '../../src/platform/algebra/committedEquationFacts.js';
import {
  describeOperation,
  getSuggestedMove,
  isSolvedEquation,
  parseEquationInput,
  splitAdditiveTerms,
} from '../../src/algebraAstEngine.js';
import { buildCancellationModel } from '../../src/algebraCancellationModel.js';
import { makePendingMove } from '../../src/algebraDraftState.js';
import { resolveEquationAfterMove } from '../../src/algebraSupportLevels.js';
import { resolveFamilyPreviewInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { buildLiteralWorkspaceQuestion } from '../../functions/shared/toolMath/algebra-literal/literalWorkspace.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// --- The equations -----------------------------------------------------------

const jsonFiles = (directory) => readdirSync(directory).flatMap((name) => {
  const full = path.join(directory, name);
  if (statSync(full).isDirectory()) return jsonFiles(full);
  return name.endsWith('.json') ? [full] : [];
});

const STEP_ACTIONS = new Set(['solveStepByStep']);
const isStepAlgebraItem = (node) => ['stepAlgebra', 'algebra'].includes(node.type)
  || node.toolId === 'stepAlgebra'
  || (Array.isArray(node.studentActions) && node.studentActions.some((action) => STEP_ACTIONS.has(action)));
const RELATION = /[<>≤≥]|\\[lg]eq?/;

// Every Step Algebra item the bank holds, as the question the solver reads;
// a Question Family item as the questions it deals; and every other equation
// the bank writes, as a question that asks to solve it.
const bankQuestions = () => {
  const questions = [];
  const equations = new Set();
  const visit = (node) => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!node || typeof node !== 'object') return;
    if (isStepAlgebraItem(node)) {
      if (node.questionFamily) {
        for (let index = 0; index < 6; index += 1) {
          const dealt = resolveFamilyPreviewInstance(node, { index });
          if (dealt?.question) questions.push(dealt.question);
        }
      } else {
        questions.push(node);
      }
    }
    if (node.type === 'literal' && (node.formula || node.equation)) {
      const built = buildLiteralWorkspaceQuestion(node);
      if (built.question) questions.push(built.question);
    }
    if (typeof node.equation === 'string' && node.equation.split('=').length === 2 && !RELATION.test(node.equation)) {
      equations.add(JSON.stringify([node.equation, node.solveFor || node.variable || null]));
    }
    Object.values(node).forEach(visit);
  };
  const sources = [
    ...jsonFiles(path.join(ROOT, 'teacher-import-jsons')),
    ...jsonFiles(path.join(ROOT, 'seed/pathQuestionBank')),
    path.join(ROOT, 'src/demo/demoAssignmentBank.json'),
  ];
  for (const file of sources) visit(JSON.parse(readFileSync(file, 'utf8')));
  for (const entry of equations) {
    const [equation, solveFor] = JSON.parse(entry);
    questions.push(solveFor ? { equation, solveFor } : { equation });
  }
  return questions;
};

// The platform's equation families, dealt as a student meets them.
const familyQuestions = () => [
  { id: 'linear.twoStepEquation', constraints: { distribute: false } },
  { id: 'linear.twoStepEquation', constraints: { distribute: true } },
  { id: 'linear.multiStepEquation' },
  { id: 'inequalities.solveLinear' },
].flatMap((questionFamily) => Array.from({ length: 12 }, (_, index) => resolveFamilyPreviewInstance({
  questionId: 'sweep', prompt: 'Solve {{equation}}.', studentActions: ['solveStepByStep'], questionFamily,
}, { index })?.question).filter(Boolean));

const EDGE_CASES = [
  // fractions
  { equation: 'x/4 + 2 = 5' }, { equation: '(2x + 1)/3 = 5' }, { equation: '(3/4)x = 6' }, { equation: '2x = 5 - (1/2)x' },
  { equationLatex: '\\frac{x}{2}=3' }, { equation: '(6 - 4x)/2 = y', solveFor: 'y' }, { equation: '(x - 3)/(x - 3) = 1' },
  { equation: '(-x)/(-1) = 4' }, { equation: '(3 x)/(3) = (15)/(3)' }, { equation: '10x/4 = 5' }, { equation: 'x = 6/4' },
  // radicals and powers
  { equation: 'sqrt(x) = 3' }, { equation: 'sqrt(2) x = 4' }, { equation: 'x^2 = 9' }, { equation: 'sqrt(x^2) = 5' }, { equation: '2^x = 8' },
  // inequalities (the relation workspace's, and what the equation engine makes of them)
  { equation: 'x + 2 < 5' }, { equation: '2x - 1 >= 7' }, { equation: '-3x <= 9' }, { inequality: '|x - 2| > 3' },
  // systems, and an equation in two variables
  { equation: 'x + y = 5' }, { equation: 'x + y = 5, x - y = 1' }, { formula: 'y=x+2 and y=3x-4', solveFor: 'x' },
  { equation: '2x + 3y = 6', objective: { kind: 'linearStandardForm', variables: ['x', 'y'] } },
  { equation: '-3y + z = -3', objective: { kind: 'linearStandardForm', variables: ['y', 'z'], variable: 'y' } },
  { equation: '-3y = -3', objective: { kind: 'linearStandardForm', variables: ['y'] }, solveFor: 'y' },
  // no solution and identities
  { equation: '2x + 1 = 2x + 3' }, { equation: '3(x - 2) + 2 = x + 2(x - 2)' }, { equation: '2(x + 1) = 2x + 2' },
  { equation: 'x + 3(x + 1) = 2x + 2(x + 2) - 5' }, { equation: '0 = 0' }, { equation: '5 = 7' },
  // formulas and line targets
  { equation: 'A = (1/2) b h', solveFor: 'h' }, { equation: 'P = 2 l + 2 w', solveFor: 'w' }, { equation: 'y = m x + b', solveFor: 'x' },
  { equation: '2x + 3y = 6', targetForm: 'slopeIntercept' }, { equation: 'y = 6(-x + 2)', targetForm: 'factoredLinear' },
  { equation: 'y = (8 - 2x)/(-4)', targetForm: 'slopeIntercept', requireSimplifiedFinalForm: true },
  { leftExpression: '5 - (x + 2)', rightExpression: '7' }, { leftExpression: '-(x + 2)', rightExpression: '5' },
  // finished forms, strict and not
  { equation: 'x = 5' }, { equation: '5 = x' }, { equation: 'x = 21 - 6' }, { equation: 'x = 21 - 6', requireSimplifiedFinalForm: true },
  { equation: '2x/2 = 7' }, { equation: 'x + 0 = 4' }, { equation: '1x = 3' }, { equation: '-x = 4' }, { equation: 'x = -(-3)' },
  // decimals, signs, cancellations on the board
  { equation: '0.6(2x + 1) = 4x + 6.2' }, { equation: '3x - 5 + 5 = 10' }, { equation: '4x + 7 - 7 = -9 - 7' }, { equation: '-2x + 21 - 21 = 1' },
  // text that does not parse, or is not one equation
  { equation: '3x + = 5' }, { equation: '' }, { equation: '=' }, { equation: 'x == 2' }, {}, { equation: 'x = (' },
];

const readEquation = (question) => {
  try {
    const equation = parseEquationInput(question);
    return equation?.left && equation?.right ? equation : null;
  } catch {
    return null;
  }
};

// The equation after the first move the hint suggests, as the board commits it.
const afterSuggestedMove = (equation) => {
  try {
    const move = getSuggestedMove(equation);
    if (!move) return null;
    const pending = makePendingMove({ equation, operation: move.operation, operand: move.operand });
    return resolveEquationAfterMove(pending, 3, pending.requiredCancellationSides);
  } catch {
    return null;
  }
};

const unique = (equations) => {
  const seen = new Map();
  for (const equation of equations) {
    const key = JSON.stringify(equation);
    if (!seen.has(key)) seen.set(key, equation);
  }
  return [...seen.values()];
};

const questions = [...bankQuestions(), ...familyQuestions(), ...EDGE_CASES];
const firstEquations = questions.map(readEquation).filter(Boolean);
const EQUATIONS = unique([...firstEquations, ...firstEquations.map(afterSuggestedMove).filter(Boolean)]);

// --- The readings, both ways -----------------------------------------------------

const outcome = (work) => {
  try {
    return { value: work() };
  } catch (error) {
    return { threw: `${error?.name}: ${error?.message}` };
  }
};
const hintText = (move, solved, offered) => (offered && move && !solved
  ? `Look for a move that cancels a term: ${describeOperation(move.operation, move.operand)}.`
  : '');
const fresh = (equation) => JSON.parse(JSON.stringify(equation));

// As the board read them before: the engine, every time.
const engineReadings = (equation) => ({
  solved: outcome(() => isSolvedEquation(fresh(equation))),
  move: outcome(() => getSuggestedMove(fresh(equation))),
  hint: [true, false].map((offered) => outcome(() => hintText(getSuggestedMove(fresh(equation)), isSolvedEquation(fresh(equation)), offered))),
  models: ['left', 'right'].map((side) => outcome(() => buildCancellationModel(equation[side], null, equation.variable, []))),
  terms: ['left', 'right'].map((side) => outcome(() => splitAdditiveTerms(equation[side]))),
});

// As the board reads them now: the cache, given a new object each time.
const keptReadings = (equation) => ({
  solved: outcome(() => equationIsSolved(fresh(equation))),
  move: outcome(() => suggestedMove(fresh(equation))),
  hint: [true, false].map((offered) => outcome(() => {
    const readings = strategicHintReadings(fresh(equation), { offered });
    return hintText(readings.suggestedMove, readings.solved, offered);
  })),
  models: ['left', 'right'].map((side) => outcome(() => committedCancellationModel(fresh(equation), side))),
  terms: ['left', 'right'].map((side) => outcome(() => boardTerms(equation[side]))),
});

test(`the sweep reads enough of the bank to mean something (${EQUATIONS.length} equations)`, () => {
  assert.ok(questions.length >= 300, `${questions.length} questions`);
  assert.ok(EQUATIONS.length > EQUATION_READINGS_KEPT * 2, 'more equations than the cache keeps, so it is read past its bound');
  assert.ok(EQUATIONS.some((equation) => isSolvedEquation(equation)), 'finished equations are in it');
  assert.ok(EQUATIONS.some((equation) => buildCancellationModel(equation.left, null, equation.variable, [])?.pairs?.length), 'and boards that offer a cancellation');
});

test('every reading the board takes from the cache is the engine\'s, worked out or kept', () => {
  const before = new Map(EQUATIONS.map((equation) => [equation, JSON.stringify(engineReadings(equation))]));
  const differences = [];
  // First and kept, in one order; then back over the last of them, past the
  // bound, so some are kept and some were let go and are worked out again.
  for (const order of [EQUATIONS, EQUATIONS.slice(-EQUATION_READINGS_KEPT * 2).reverse()]) {
    for (const equation of order) {
      for (let read = 0; read < 2; read += 1) {
        const now = JSON.stringify(keptReadings(equation));
        if (now !== before.get(equation)) differences.push(`${equation.left} = ${equation.right}: ${now} (was ${before.get(equation)})`);
      }
    }
  }
  assert.deepEqual(differences.slice(0, 5), [], `${differences.length} readings differ`);
});
