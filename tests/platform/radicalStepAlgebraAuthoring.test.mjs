import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { validateQuestionSemantics } from '../../src/platform/contract/semanticValidation.js';
import {
  isRadicalEquationText,
  radicalAuthoringProblem,
  radicalEquationOpensRelationWorkspace,
} from '../../src/platform/contract/radicalEquationIntent.js';
import {
  MAX_ZERO_PRODUCT_ROWS,
  checkChoiceOf,
  factorResult,
  isRecordedCheck,
  radicalCandidateList,
  raiseResult,
  readCheckDraft,
  readSolutionSetDraft,
  relationToolsFor,
  restorableSolutionSet,
  withExplicitProducts,
  zeroProductResult,
} from '../../src/relationRadicalToolsModel.js';
import { parseRelationSource, relationSolutionSummary, validateRelationTransition } from '../../src/algebraRelationFoundation.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

/*
 * AUTHORING A RADICAL EQUATION, AND THE TOOLS THE STUDENT GETS.
 *
 * solveStepByStep is the one way to author it. A radical equation the relation
 * workspace verifies opens there by default; anything else is left where it
 * was. The tools are opt-in, so no absolute-value or inequality lesson gains a
 * button. The student's input becomes the next state through the model below,
 * and the workspace's own validated commit judges it.
 */

const LESSON_FILE = 'teacher-import-jsons/algebra2-polynomials-radicals-honors/5_Solving_Radical_Equations_Honors_Step_Algebra.json';
const lessonText = readFileSync(new URL(`../../${LESSON_FILE}`, import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// The default
// ---------------------------------------------------------------------------

test('a verified radical equation opens the relation workspace by default — templates included', () => {
  for (const equation of [
    'sqrt(x + 4) + 2 = x',
    'sqrt(5x - 1) = 2x - 1',
    'sqrt(1.5h) = 6',
    'nthRoot(2x - 1, 3) = 3',
    '2 nthRoot(x + 3, 5) + 1 = 7',
    '\\sqrt{x + 4} + 2 = x',
    // A family slot's equation: the pipe of {{b|term}} is a filter, not an absolute-value bar.
    'sqrt({{m|coef}}x {{b|term}}) {{k|signed}} = x {{ck|term}}',
    '{{a|coef}} nthRoot({{m|coef}}x {{b|signed}}, {{n}}) {{c|signed}} = {{d}}',
  ]) {
    assert.equal(radicalEquationOpensRelationWorkspace(equation, equation.includes('1.5h') ? 'h' : 'x'), true, equation);
  }
});

test('anything the workspace does not verify is left exactly where it was', () => {
  for (const equation of [
    'sqrt(x + 1) + sqrt(x) = 3', // two radicals
    'sqrt(x + 3) = x', // candidates that are not rational
    'sqrt(2x + 1) = x + 3', // the raised quadratic has no real roots
    'cbrt(x) = x', // a variable beside a cube root: a cubic
    'nthRoot(x, 6) = 2',
    'sqrt(x^2 + 1) = 3',
    'd = sqrt(2*g*h)', // a formula, solved for one letter elsewhere
    '|x - 3| = 5',
    'sqrt(x) < 3',
    '3x + 1 = 7',
    '',
    undefined,
  ]) {
    assert.equal(radicalEquationOpensRelationWorkspace(equation, 'x'), false, String(equation));
  }
  assert.equal(isRadicalEquationText('|sqrt(x)| = 3'), false, 'an absolute value makes it another relation');
  assert.equal(isRadicalEquationText('sqrt({{a}}x {{b|signed}}) = 3'), true);
});

/** The lesson, with one question replaced, compiled as the teacher's import compiles it. */
const compileWith = (id, change) => {
  const lesson = JSON.parse(lessonText);
  lesson.sections.forEach((section) => {
    section.questions = section.questions.map((question) => (question.questionId === id ? { ...question, ...change(question) } : question));
  });
  const compiled = compileTeacherImport(JSON.stringify(lesson));
  return { compiled, question: compiled.questions.find((candidate) => candidate.questionId === id) };
};

test('compiling honours the author: an opt-out, an unsupported radical, and the tools a lesson asks for', () => {
  // The default.
  assert.equal(compileWith('srh-cw-1', () => ({})).question.relationWorkspace, true);
  // An author's own "relationWorkspace": false is honoured: the item keeps the equation workspace.
  const optedOut = compileWith('srh-cw-1', () => ({ relationWorkspace: false })).question;
  assert.notEqual(optedOut.relationWorkspace, true);
  // An equation with candidates the lesson cannot factor is not claimed, and says nothing false.
  const unsupported = compileWith('srh-cw-1', () => ({ equation: 'sqrt(x + 3) = x' }));
  assert.notEqual(unsupported.question.relationWorkspace, true);
  assert.deepEqual(unsupported.compiled.semantic.errors, [], 'an unflagged item is judged as it always was');
  // A lesson turns the factor and zero-product tools on for itself.
  const tools = compileWith('srh-cw-2', () => ({ algebraTools: ['factor', 'zeroProduct'] })).question;
  assert.deepEqual(tools.algebraTools, ['factor', 'zeroProduct']);
  // The variable of a horizon-style equation is read without the radical's function name.
  assert.equal(compileWith('srh-cw-9', (question) => ({ solveFor: undefined, equation: question.equation })).question.solveFor, 'h');
});

test('Pre-Flight refuses a radical the workspace was told to open but cannot verify — for the item and for a family\'s versions', () => {
  const base = { type: 'stepAlgebra', prompt: 'Solve.', solveFor: 'x', relationWorkspace: true };
  const refused = validateQuestionSemantics({ ...base, equationLatex: 'sqrt(x + 3) = x' }, { label: 'Question 4' });
  assert.equal(refused.errors.length, 1);
  assert.match(refused.errors[0], /Question 4 \(stepAlgebra\)/);
  assert.match(refused.errors[0], /radical equation the Step Algebra radical workspace cannot verify/);
  assert.match(refused.errors[0], /not rational/);
  assert.match(validateQuestionSemantics({ ...base, equationLatex: 'sqrt(x + 1) + sqrt(x) = 3' }).errors[0], /more than one radical/);
  assert.match(validateQuestionSemantics({ ...base, equationLatex: 'cbrt(x) = x' }).errors[0], /cube, 4th or 5th root has a variable/);
  assert.equal(radicalAuthoringProblem('nthRoot(x, 6) = 2'), 'its root index is outside 2 to 5');
  // A verified one, and equations that are not radical equations at all, pass untouched.
  for (const equationLatex of ['sqrt(x + 4) + 2 = x', '2 nthRoot(x + 3, 5) + 1 = 7', '|2x - 3| = 7', '3x + 1 = 7']) {
    assert.deepEqual(validateQuestionSemantics({ ...base, equationLatex }).errors, [], equationLatex);
  }
  // A radical inside another kind of relation item is not this rule's business.
  assert.deepEqual(validateQuestionSemantics({ ...base, equationLatex: 'sqrt(x) < 3' }).errors, []);
  // An item not flagged for the relation workspace is judged as it always was.
  assert.deepEqual(validateQuestionSemantics({ type: 'stepAlgebra', prompt: 'Solve.', solveFor: 'x', equationLatex: 'sqrt(x + 3) = x' }).errors, []);
});

// ---------------------------------------------------------------------------
// The tools are opt-in
// ---------------------------------------------------------------------------

test('the tools: all three for a verified radical, only what a lesson names otherwise, none for absolute value or inequalities', () => {
  const ids = (question, source) => relationToolsFor(question, parseRelationSource(source, 'x')).map((tool) => tool.id);
  assert.deepEqual(ids({}, 'sqrt(x+4)+2=x'), ['raisePower', 'factor', 'zeroProduct']);
  assert.deepEqual(ids({}, '|2x-3|=7'), [], 'an absolute-value lesson gains no button');
  assert.deepEqual(ids({}, '-2x+3>7'), [], 'neither does an inequality');
  assert.deepEqual(ids({}, '3x+1=7'), []);
  // A standalone quadratic lesson asks for the shared operations by name.
  assert.deepEqual(ids({ algebraTools: ['factor', 'zeroProduct'] }, 'x^2-5x=0'), ['factor', 'zeroProduct']);
  assert.deepEqual(ids({ algebraTools: ['zeroProduct', 'nonsense'] }, 'x^2-5x=0'), ['zeroProduct']);
  assert.deepEqual(ids({ algebraTools: 'factor' }, 'x^2-5x=0'), [], 'a malformed list names nothing');
  // The same shared tools work on a quadratic with no radical anywhere.
  const standard = { ...parseRelationSource('x^2-5x=0', 'x') };
  const factored = factorResult({ state: standard, text: 'x(x-5)' });
  assert.equal(factored.ready, true, factored.reason);
  assert.equal(validateRelationTransition(standard, factored.state, factored.transition).valid, true);
});

test('the student\'s input becomes the next state: what each tool builds, and what it refuses before the workspace is asked', () => {
  const isolated = parseRelationSource('sqrt(x+4)=x-2', 'x');
  const raised = raiseResult({ state: isolated, power: 2, left: 'x+4', right: 'x^2-4x+4' });
  assert.equal(raised.ready, true, raised.reason);
  assert.equal(raised.kind, 'radical-raise');
  assert.deepEqual(raised.transition, { kind: 'radicalRaise', branchIndex: 0, power: 2 });
  assert.equal(validateRelationTransition(isolated, raised.state, raised.transition).valid, true);
  assert.equal(raiseResult({ state: isolated, power: 3, left: 'x+4', right: 'x^3' }).ready, false, 'a power that does not undo the root');
  assert.equal(raiseResult({ state: parseRelationSource('sqrt(x+4)+2=x', 'x'), power: 2, left: 'x+4', right: 'x^2' }).ready, false, 'a radical that is not alone');
  assert.match(raiseResult({ state: isolated, power: 2, left: '', right: 'x' }).reason, /Enter an expression/);
  assert.match(raiseResult({ state: isolated, power: 2, left: 'x', right: 'x = 2' }).reason, /without a relation symbol/);

  const standard = { ...parseRelationSource('0=x^2-5x', 'x') };
  assert.equal(factorResult({ state: parseRelationSource('x+4=x^2-4x+4', 'x'), text: 'x(x-5)' }).ready, false, 'factoring needs the 0 first');
  const factored = factorResult({ state: standard, text: '2x(x-3)/2' });
  assert.equal(factored.ready, true);
  assert.equal(validateRelationTransition(standard, factored.state, factored.transition).valid, false, 'a product that is not the polynomial is the workspace\'s to refuse');

  // As the Factor tool leaves it: the product written with its multiplication.
  const product = { ...parseRelationSource('0=x*(x-5)', 'x') };
  const split = zeroProductResult({ state: product, rows: [{ left: 'x', right: '0' }, { left: 'x-5', right: '0' }] });
  assert.equal(split.ready, true, split.reason);
  assert.equal(split.state.connective, 'OR');
  assert.equal(split.state.branches.length, 2);
  assert.equal(validateRelationTransition(product, split.state, split.transition).valid, true);
  const single = zeroProductResult({ state: { ...parseRelationSource('0=(x-2)^2', 'x') }, rows: [{ left: 'x-2', right: '0' }] });
  assert.equal(single.state.connective, null, 'a repeated factor written once is one equation');
  assert.equal(zeroProductResult({ state: standard, rows: [{ left: 'x', right: '0' }] }).ready, false, 'nothing to split until it is factored');
  assert.equal(zeroProductResult({ state: product, rows: [{ left: 'x', right: '' }] }).ready, false, 'both sides of every equation');
  assert.equal(zeroProductResult({ state: product, rows: [] }).ready, false);
  assert.ok(MAX_ZERO_PRODUCT_ROWS >= 3);
});

test('a variable straight before a bracket is a factor, in these tools only', () => {
  for (const [typed, expected] of [['x(x-5)', 'x*(x-5)'], ['2x(x-3)', '2x*(x-3)'], ['x (x+1)', 'x*(x+1)'], ['x\\left(x-5\\right)', 'x*(x-5\\right)']]) {
    assert.equal(withExplicitProducts(typed, 'x'), expected, typed);
  }
  assert.equal(withExplicitProducts('3h(h+1)', 'h'), '3h*(h+1)');
  for (const untouched of ['(2x-1)(x-3)', 'max(x)', 'abs(x)', '\\sqrt{x}(x)']) assert.equal(withExplicitProducts(untouched, 'x'), untouched);
  // The product the student meant is the product the engine reads.
  const standard = parseRelationSource('0=2x^2-6x', 'x');
  const result = factorResult({ state: standard, text: '2x(x-3)' });
  assert.equal(result.ready, true);
  assert.equal(validateRelationTransition(standard, result.state, result.transition).valid, true);
});

// ---------------------------------------------------------------------------
// Candidates and the final answer, as the student records them
// ---------------------------------------------------------------------------

test('candidates are keyed by their value, and 0.25 and 1/4 are the same candidate', () => {
  const summary = (text) => relationSolutionSummary({ ...parseRelationSource(text, 'x') });
  assert.deepEqual(radicalCandidateList(summary('x=1/4 OR x=2')).map((entry) => entry.key), ['1/4', '2']);
  assert.deepEqual(radicalCandidateList(summary('x=0.25 OR x=2')).map((entry) => entry.key), ['1/4', '2']);
  assert.deepEqual(radicalCandidateList(summary('x=2 OR x=2.0')).map((entry) => entry.key), ['2'], 'a repeated root is one candidate');
  assert.deepEqual(radicalCandidateList({ solved: true, kind: 'exactValues', exactValues: ['sqrt(2)'] }), [], 'values that are not exact numbers are not candidates');
  assert.deepEqual(radicalCandidateList({ solved: false }), []);
});

test('a check needs both substituted values and a decision; a solution set needs numbers or "no real solution"', () => {
  assert.deepEqual(readCheckDraft({ left: '4', right: '0', choice: 'extraneous' }), { ok: true, entry: { choice: 'extraneous', left: '4', right: '0' } });
  assert.equal(readCheckDraft({ left: '4', right: '', choice: 'valid' }).ok, false);
  assert.equal(readCheckDraft({ left: '4', right: '0', choice: null }).ok, false);
  assert.equal(readCheckDraft({ left: 'four', right: '0', choice: 'valid' }).ok, false);
  assert.equal(readCheckDraft({ left: 'sqrt(9)+2', right: '5', choice: 'valid' }).ok, true, 'a value written with its root is a value');
  assert.equal(isRecordedCheck({ choice: 'valid', left: '5', right: '5' }), true);
  assert.equal(isRecordedCheck('valid'), false, 'an absolute-value choice alone is not a radical check');
  assert.equal(checkChoiceOf('valid'), 'valid');
  assert.equal(checkChoiceOf({ choice: 'extraneous', left: '1', right: '2' }), 'extraneous');

  assert.deepEqual(readSolutionSetDraft({ none: false, values: ['5', ' 1/4 '] }), { ok: true, set: { none: false, values: ['5', '1/4'] } });
  assert.deepEqual(readSolutionSetDraft({ none: true, values: ['5'] }), { ok: true, set: { none: true, values: [] } });
  assert.equal(readSolutionSetDraft({ none: false, values: [] }).ok, false, 'an empty set is not "no real solution"');
  assert.equal(readSolutionSetDraft({ none: false, values: ['five'] }).ok, false);
  assert.deepEqual(restorableSolutionSet({ none: false, values: ['5', 3, ''] }), { none: false, values: ['5'] });
  assert.deepEqual(restorableSolutionSet({ none: true }), { none: true, values: [] });
  for (const bad of [null, 'x', [], { values: 'x' }, { none: false, values: [] }]) assert.equal(restorableSolutionSet(bad), null, JSON.stringify(bad));
});

// ---------------------------------------------------------------------------
// The workspace is wired to all of it
// ---------------------------------------------------------------------------

const CORE = executableSource(readFileSync(new URL('../../src/MultiRelationAlgebraCore.jsx', import.meta.url), 'utf8'));

test('the workspace offers the tools only where relationToolsFor names them, and keeps the absolute-value stage for absolute value', () => {
  assert.match(region(CORE, 'const radicalTools = useMemo', ';\n', 'the tools'), /relationToolsFor\(question, pristine\)/);
  // The five existing operations are rendered exactly as before; the opted-in tools are an additive block after them.
  const rail = region(CORE, 'OTHER_ALGEBRA_OPERATIONS.map((item)', 'These choices stay available from the beginning', 'the tools rail');
  assert.ok(rail.indexOf('radicalTools.map((item)') > rail.indexOf('chooseOtherOperation(item.id)'), 'the radical tools follow the existing operations in the rail');
  assert.match(region(rail, 'radicalTools.map((item)', '</button>', 'a radical tool button'), /chooseOtherOperation\(item\.id\)/);
  // The menu is never reopened by code: it is the host's and the student's to open.
  assert.doesNotMatch(CORE, /setOtherOpen\(true\)/);
  // The radical stage replaces the absolute-value buttons only for a radical equation.
  assert.match(CORE, /requireCandidateVerification && radicalContext && \(/);
  assert.match(CORE, /requireCandidateVerification && !radicalContext && \(/);
  assert.match(region(CORE, 'const candidateVerification = useMemo', 'const requireCandidateVerification', 'the candidates'), /radicalCandidateList\(summary\)/);
});

test('everything that rested on the algebra goes when the algebra changes, and only a recorded answer is saved', () => {
  // A committed step, Undo and Start over each withdraw the checks and the final set.
  assert.match(region(CORE, 'const commitState = async', 'const hasOperationOperand', 'commitState'), /setCandidateChecks\(\{\}\);\s*setSolutionSet\(null\)/);
  assert.match(region(CORE, 'setHistory((current) => {\n          if (!current.length)', 'return current.slice(0, -1)', 'Undo'), /setCandidateChecks\(\{\}\);\s*setSolutionSet\(null\)/);
  assert.match(region(CORE, 'const reset = () =>', 'const active = relationState.branches', 'Start over'), /setCandidateChecks\(\{\}\);\s*setSolutionSet\(null\)/);
  // Changing one check withdraws the final set that rested on it.
  assert.match(region(CORE, 'const recordRadicalCheck', 'const chooseOtherOperation', 'recording a check'), /setSolutionSet\(null\)/);
  // The final answer is part of the saved draft and of the work graded; nothing typed toward it is.
  assert.match(region(CORE, 'writeQuestionDraft(draftKeyFor(draftKey), {', '}, [draftKey', 'the draft'), /solutionSet/);
  // Bound to the call that builds the work, not to the memo's dependency list.
  assert.match(region(CORE, 'relationWorkspaceWork({', '}), [', 'the graded work'), /representation: representationWork,\s*solutionSet,\s*$/);
  assert.doesNotMatch(region(CORE, 'writeQuestionDraft(draftKeyFor(draftKey), {', '}, [draftKey', 'the draft'), /operand|completeSquareValue|absoluteSplitValues/, 'what is being typed is never saved');
});
