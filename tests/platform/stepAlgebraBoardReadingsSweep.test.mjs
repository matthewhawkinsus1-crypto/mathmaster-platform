/*
 * STEP ALGEBRA'S BOARD READINGS, KEPT BY TEXT, ARE THE ENGINE'S: A SWEEP.
 *
 * platform/algebra/committedEquationFacts.js keeps four readings of the
 * committed equation by the text they are worked out from, in a bounded cache
 * that outlives the board: whether it is solved, the move the strategic hint
 * suggests, each side's cancellation model, each side's terms and the parts
 * Simplify can act on. The solver reads the hint's two only where the hint
 * can be offered, and Simplify's only while it is open. Before, the board
 * asked the engine directly (behind a cache keyed on the equation object).
 * And the fraction tools no longer parse a term with no slash in it.
 *
 * This sweep reads every Step Algebra equation in the bank (the lessons, the
 * Path seeds, the demo bank and the platform's equation families), every
 * other equation the bank writes, a set of edge cases (fractions, radicals,
 * inequalities, systems, no solution, identities, formulas, finished forms,
 * text that does not parse), the single-radical equations of #548's tests and
 * scenarios (the radical lesson's items and the versions its families deal
 * are in the bank), and the equation after each one's first suggested move;
 * and, for every one of them that opens the relation workspace, the regions
 * of each branch Simplify reads there. Each is read both ways: the engine's own
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
  simplifyPartsFor,
  strategicHintReadings,
  suggestedMove,
} from '../../src/platform/algebra/committedEquationFacts.js';
import { detectSimplifyParts } from '../../src/platform/algebra/simplify/simplifyEngine.js';
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
import { parseRelationSource, relationSourceFromQuestion } from '../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';
import { withPromptRelationSource } from '../../functions/shared/runtime/stepAlgebraRelationRouting.mjs';
import { parse as clientParse } from '../../src/platform/math/mathjs.js';
import { splittableFraction } from '../../src/algebraFractionSplitModel.js';
import { fractionTermParts } from '../../src/algebraFractionReductionModel.js';
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

// Single-radical equations, which the relation workspace solves (#548): its
// node tests' and browser scenarios' own examples, in scope and out of it.
// The lesson's items and the versions its families deal come from the bank.
const RADICAL_CASES = [
  'sqrt(x + 4) + 2 = x', 'sqrt(5x - 1) = 2x - 1', 'sqrt(1.5h) = 6', 'sqrt(3x + 1) + 1 = x', 'sqrt(2x + 2) = 3x - 1',
  'nthRoot(2x - 1, 3) = 3', 'sqrt(4x - 4) = x', 'sqrt(5x - 6) = x', 'sqrt(-7x + 23) = x - 5', 'sqrt(x + 1) = -3',
  'nthRoot(x + 4, 3) - 2 = 3', '2 nthRoot(3x - 5, 4) + 7 = 13', '2 nthRoot(x + 3, 5) + 1 = 7', '3 nthRoot(2x+5,5)-1=8',
  'nthRoot(3x+1,4)=2', 'nthRoot(x, 6) = 2', 'nthRoot(x,1)=2', 'sqrt(-x + 3) - 4 = x - 1', 'sqrt(1.23456789x) = 3',
  'sqrt(2x + 1) = x + 3', 'sqrt(4x) = 3', 'sqrt(4x ) + 3 = x + 3 ', 'sqrt(7)=x', 'sqrt(sqrt(x)+1)=2', 'sqrt(x + 1) + sqrt(x) = 3',
  'sqrt(x + 3) = x', 'sqrt(x)=x^2', 'sqrt(x+4)=3', 'sqrt(x+4)=x-2', 'sqrt(x^2 + 1) = 3', '|sqrt(x)| = 3', '2*sqrt(x+1)=-3',
  '0*sqrt(x - 10) + sqrt(x + 4) = x - 2', '2sqrt(x+4)-2sqrt(x+4)=0', 'sqrt(x) - sqrt(x) + sqrt(x + 9) = x - 3', 'sqrt(x+1)=2=2',
].map((equation) => ({ equation, solveFor: equation.includes('h') ? 'h' : 'x', relationWorkspace: true }));
const RADICAL_SCENARIOS = JSON.parse(readFileSync(path.join(ROOT, 'tests/browser/fixtures/radicalStepAlgebraScenarios.json'), 'utf8'));

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

const questions = [...bankQuestions(), ...familyQuestions(), ...EDGE_CASES, ...RADICAL_CASES, ...RADICAL_SCENARIOS];
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
// The board's regions, as StepByStepAlgebraCore builds them for Simplify.
const regionsOf = (equation) => [
  { key: 'left', label: 'left side', expression: equation.left, variable: equation.variable || 'x' },
  { key: 'right', label: 'right side', expression: equation.right, variable: equation.variable || 'x' },
];

// As the board read them before: the engine, every time.
const engineReadings = (equation) => ({
  solved: outcome(() => isSolvedEquation(fresh(equation))),
  move: outcome(() => getSuggestedMove(fresh(equation))),
  hint: [true, false].map((offered) => outcome(() => hintText(getSuggestedMove(fresh(equation)), isSolvedEquation(fresh(equation)), offered))),
  models: ['left', 'right'].map((side) => outcome(() => buildCancellationModel(equation[side], null, equation.variable, []))),
  terms: ['left', 'right'].map((side) => outcome(() => splitAdditiveTerms(equation[side]))),
  parts: outcome(() => detectSimplifyParts(regionsOf(equation))),
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
  parts: outcome(() => simplifyPartsFor(regionsOf(equation))),
});

// The relation workspace's regions for each branch of every relation a
// question opens there (radicals, absolute values, inequalities), as
// MultiRelationAlgebraCore builds them for Simplify.
const relationOf = (question) => {
  try {
    const source = relationSourceFromQuestion(withPromptRelationSource(question));
    return source ? parseRelationSource(source, question.solveFor || question.variable || question.objective?.variable || 'x') : null;
  } catch {
    return null;
  }
};
const branchRegions = (relation) => (relation?.branches || []).map((branch) => (branch.expressions || []).map((expression, index, all) => ({
  key: String(index),
  label: all.length === 3 ? ['left region', 'middle region', 'right region'][index] : (['left side', 'right side'][index] || `expression ${index + 1}`),
  expression,
  variable: relation.variable || 'x',
})));
const RELATION_BOARDS = (() => {
  const seen = new Map();
  for (const question of questions) {
    for (const regions of branchRegions(relationOf(question))) seen.set(JSON.stringify(regions), regions);
  }
  return [...seen.values()];
})();
const isRadical = (regions) => regions.some((region) => /sqrt|nthRoot/.test(region.expression));

test(`the sweep reads enough of the bank to mean something (${EQUATIONS.length} equations, ${EQUATIONS.filter((equation) => /sqrt|nthRoot/.test(`${equation.left} ${equation.right}`)).length} with a radical)`, () => {
  assert.ok(questions.length >= 300, `${questions.length} questions`);
  assert.ok(EQUATIONS.length > EQUATION_READINGS_KEPT * 2, 'more equations than the cache keeps, so it is read past its bound');
  assert.ok(EQUATIONS.some((equation) => isSolvedEquation(equation)), 'finished equations are in it');
  assert.ok(EQUATIONS.some((equation) => buildCancellationModel(equation.left, null, equation.variable, [])?.pairs?.length), 'and boards that offer a cancellation');
  const radicals = EQUATIONS.filter((equation) => /sqrt|nthRoot/.test(`${equation.left} ${equation.right}`));
  assert.ok(radicals.length >= 60, `${radicals.length} radical equations on the equation board`);
  assert.ok(RELATION_BOARDS.filter(isRadical).length >= 60, `${RELATION_BOARDS.filter(isRadical).length} radical relation boards`);
});

test(`Simplify's parts on the relation workspace, kept, are the engine's (${RELATION_BOARDS.length} boards, ${RELATION_BOARDS.filter(isRadical).length} with a radical)`, () => {
  const differences = [];
  for (const order of [RELATION_BOARDS, RELATION_BOARDS.slice(-EQUATION_READINGS_KEPT * 2).reverse()]) {
    for (const regions of order) {
      const before = JSON.stringify(outcome(() => detectSimplifyParts(regions)));
      for (let read = 0; read < 2; read += 1) {
        const now = JSON.stringify(outcome(() => simplifyPartsFor(JSON.parse(JSON.stringify(regions)))));
        if (now !== before) differences.push(`${regions.map((region) => region.expression).join(' | ')}: ${now} (was ${before})`);
      }
    }
  }
  assert.ok(RELATION_BOARDS.length > EQUATION_READINGS_KEPT * 2, `${RELATION_BOARDS.length} relation boards, past the cache's bound`);
  assert.deepEqual(differences.slice(0, 5), [], `${differences.length} boards differ`);
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

// The fraction tools (Split fraction, Cancel factors) no longer parse a term
// with no slash in it to find it is no fraction: mathjs reads a division only
// from a slash. Every term the bank's boards hold, and some written to test
// the grammar, bear that out (the tools' own answer for a term that is a
// division is unchanged: it is still parsed).
test('a term with no slash is never a division to mathjs, so the fraction tools need not parse it', () => {
  const unwrap = (node) => {
    let current = node;
    while (current?.type === 'ParenthesisNode') current = current.content;
    return current;
  };
  const texts = new Set(['5 cm', 'x mod 2', '5!', 'x ^ -1', '2 x (3)', 'sqrt(x)', '1e-3 x', '-(x + 2)', '1 * (x + 2)', '0.5 x', 'x .* 2', 'abs(-x)', 'x ^ (1 - 2)']);
  for (const equation of EQUATIONS) {
    for (const side of [equation.left, equation.right]) {
      texts.add(String(side));
      for (const term of splitAdditiveTerms(side) || []) texts.add(String(term.magnitudeText));
    }
  }
  let read = 0;
  for (const text of texts) {
    if (text.includes('/')) continue;
    let node = null;
    try {
      node = clientParse(text);
    } catch {
      continue;
    }
    read += 1;
    assert.notEqual(unwrap(node)?.fn, 'divide', text);
    assert.equal(node.filter((child) => child.type === 'OperatorNode' && child.fn === 'divide').length, 0, `${text} holds no division anywhere`);
    assert.equal(splittableFraction(text), null, text);
    assert.equal(fractionTermParts(text), null, text);
  }
  assert.ok(read > 400, `${read} terms read`);
});
