/*
 * WHAT AUTHORING THE ALGEBRA I MODULE 3 LESSONS FOUND, FIXED.
 *
 * Each test is one defect a teacher-import JSON could reach, held at the
 * boundary a student or teacher meets it:
 *
 *   - A hand-written equation with no solution, or with every number as a
 *     solution, opened on the balance workspace, where the student reaches
 *     6 = 5 and can never finish. It now opens in the relation workspace,
 *     where "No solution" / "All real numbers" is concluded and graded.
 *   - A systems Question Family slot dropped its method on compile, so every
 *     student chose; a misspelled method was silently "student choice".
 *   - A graphed system's automatic grade value counted the intersection only
 *     when there was one, so its "Grade weight" banner gave the answer away.
 *   - Graph mode without a system drew and graded a demo system; a Graphing
 *     line or required intercept outside the drawn window had no answer.
 *   - "Graph the solution on the number line" was refused on an inequality
 *     whose workspace draws that number line.
 *   - A printed worksheet omitted a hand-written Step Algebra equation.
 *   - Step Algebra drew 236000 as 2.36(10)^{+5}.
 *   - Graphing's task read "Graph 1x + 1y = 450."
 *   - A number line written in b (b ≤ 420) dropped its letter on compile, so
 *     its grader and Pre-Flight expected x; and an authored window was always
 *     replaced on screen by one fitted to the answer.
 *   - The number line read an Algebra I student's graph back as interval
 *     notation, which the course does not teach — "Your graph: (−∞, 420]" —
 *     and wrote the inequality a student was asked to write.
 *   - A generated version's exact answer key (solutionKey.latex) was read as
 *     student-facing text and warned about as raw LaTeX.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { validateQuestionSemantics, validateQuestionsSemantics } from '../../src/platform/contract/semanticValidation.js';
import { validateToolQuestion } from '../../src/tools/toolSchemas.js';
import { structuredGivenLinesFromResolvedQuestion } from '../../src/platform/resources/assignmentWorksheetPdfModel.js';
import { standardFormReadoutText } from '../../src/tools/graphing2/lineReadout.js';
import { expressionToLatex } from '../../functions/shared/algebra/algebraAstEngine.mjs';
import { estimateQuestionValue } from '../../functions/shared/questionValue.mjs';
import { resolveFamilyPreviewInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { resolveStepAlgebraMode } from '../../functions/shared/serverGrading/stepAlgebraRouting.mjs';
import { relationWorkspaceWork } from '../../functions/shared/serverGrading/stepAlgebraWorkspaceGrading.mjs';
import {
  applyBalancedOperationToRelation,
  obviousSpecialClaim,
  parseRelationSource,
  validateRelationTransition,
} from '../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';
import { isAlgebraOneQuestion } from '../../functions/shared/toolMath/algebra-relations/inequalityRepresentationPolicy.mjs';
import { describeNumberLinePiece } from '../../src/platform/language/numberLineDescription.js';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { buildToolResponse } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { gradeBothWays } from './helpers/questionFamilyCases.mjs';

const importQuestions = (questions) => parseAssignmentBlueprintText(JSON.stringify({
  schemaVersion: 5,
  assignment: { title: 'Module 3 fixes', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
  sections: [{ id: 'classwork', role: 'classwork', title: 'Classwork', questions }],
}));

const question = (questionId, extra) => ({
  questionId, standard: 'A.5A', studentActions: ['solveStepByStep'], dok: 2, difficultyBand: 3, prompt: 'Solve.', ...extra,
});

/* ------------------------------------------- special-case equations finish */

test('a hand-written equation with no single solution opens where it can be concluded', () => {
  const { questions, repairs } = importQuestions([
    question('none', { equation: 'x + 3(x + 1) = 2x + 2(x + 2) - 5' }),
    question('all', { equation: '3(x - 2) + 2 = x + 2(x - 2)' }),
    question('gym', { equation: '40 + 20m = 25 + 20m' }),
    question('one', { equation: '6(x - 1) = 3x + 9' }),
    question('one-hidden', { equation: '5(x + 4) = 3(2x + 1)', relationWorkspace: true }),
  ]);
  const byId = Object.fromEntries(questions.map((entry) => [entry.questionId, entry]));
  ['none', 'all', 'gym'].forEach((id) => {
    assert.equal(byId[id].relationWorkspace, true, `${id} is stored for the relation workspace`);
    assert.equal(resolveStepAlgebraMode(byId[id]), 'relation', `${id} opens the relation workspace`);
  });
  assert.equal(byId.one.relationWorkspace, undefined, 'a one-solution equation keeps the balance workspace');
  assert.equal(resolveStepAlgebraMode(byId.one), 'equation');
  assert.equal(resolveStepAlgebraMode(byId['one-hidden']), 'relation', 'an author can open a one-solution equation there too, so the workspace hides the case');
  assert.equal(repairs.filter((repair) => /relation workspace/.test(repair)).length, 3, 'the teacher is told, once per equation moved');
});

test('the relation workspace concludes a hand-written special case, and grades the wrong conclusion wrong', () => {
  const { questions } = importQuestions([
    question('none', { equation: 'x + 3(x + 1) = 2x + 2(x + 2) - 5' }),
    question('all', { equation: '3(x - 2) + 2 = x + 2(x - 2)' }),
    question('gym', { equation: '40 + 20m = 25 + 20m' }),
  ]);
  // Simplify each side, move the variable term, simplify to a statement.
  const walks = {
    none: [['4x + 3', '4x - 1'], ['subtract', '4x'], ['3', '-1']],
    all: [['3x - 4', '3x - 4'], ['subtract', '3x'], ['-4', '-4']],
    gym: [['subtract', '20m'], ['40', '25']],
  };
  const outcomes = { none: 'noSolution', all: 'allReals', gym: 'noSolution' };
  questions.forEach((entry) => {
    let state = parseRelationSource(entry.equationLatex, entry.solveFor);
    walks[entry.questionId].forEach((step) => {
      const balanced = ['add', 'subtract', 'multiply', 'divide'].includes(step[0]);
      const next = balanced
        ? applyBalancedOperationToRelation(state, step[0], step[1]).state
        : { ...state, branches: [{ expressions: step, relations: ['='] }] };
      const context = balanced
        ? { kind: 'balancedOperation', operation: step[0], operandExpression: step[1], branchIndices: [0] }
        : { kind: 'equivalentRewrite' };
      assert.equal(validateRelationTransition(state, next, context).valid, true, `${entry.questionId}: ${step.join(' ')}`);
      state = next;
    });
    const claim = obviousSpecialClaim(state);
    assert.equal(claim, outcomes[entry.questionId], `${entry.questionId}: the statement with no variable left decides`);
    const concluded = { ...state, branches: [], connective: null, special: claim };
    assert.equal(validateRelationTransition(state, concluded, { kind: 'solutionClaim', claim }).valid, true);
    const right = gradeBothWays(entry, relationWorkspaceWork({ relationState: concluded }));
    assert.equal(right.browser.isCorrect, true, `${entry.questionId}: browser`);
    assert.equal(right.server.isCorrect, true, `${entry.questionId}: server`);
    const opposite = claim === 'allReals' ? 'noSolution' : 'allReals';
    const wrong = gradeBothWays(entry, relationWorkspaceWork({ relationState: { ...concluded, special: opposite } }));
    assert.equal(wrong.server.isCorrect, false, `${entry.questionId}: the other conclusion is wrong on the server`);
  });
});

/* ------------------------------------------------ systems family slot method */

const systemSlot = (questionId, extra) => ({
  questionId, standard: 'A.5C', studentActions: ['solveSystem'], dok: 2, difficultyBand: 3, prompt: 'Solve the system {{system}}.', ...extra,
});

test("a systems family slot keeps the author's method and verification choice", () => {
  const { questions } = importQuestions([
    systemSlot('sub', { method: 'substitution', questionFamily: { id: 'systems.algebraic2x2', version: 1, constraints: { solutionCase: 'one' } } }),
    systemSlot('elim', { method: 'elimination', requireVerification: false, questionFamily: { id: 'systems.substitution', version: 2, constraints: { solutionCase: 'one' } } }),
    systemSlot('default', { questionFamily: { id: 'systems.substitution', version: 2, constraints: { solutionCase: 'mixed' } } }),
  ]);
  const built = Object.fromEntries(questions.map((entry) => [entry.questionId, resolveFamilyPreviewInstance(entry).question]));
  assert.equal(built.sub.type, 'systemsWorkspace');
  assert.equal(built.sub.method, 'substitution', 'not every student choosing');
  assert.equal(built.elim.method, 'elimination');
  assert.equal(built.elim.requireVerification, false);
  assert.equal(built.default.method, 'substitution', 'the substitution family defaults to substitution');
  assert.deepEqual(validateQuestionsSemantics(questions).errors, []);
});

test('a misspelled method on a systems family slot is refused, as on a hand-written system', () => {
  const { questions } = importQuestions([
    systemSlot('typo', { method: 'substition', questionFamily: { id: 'systems.algebraic2x2', version: 1, constraints: { solutionCase: 'one' } } }),
  ]);
  const { errors } = validateQuestionsSemantics(questions);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /method "substition" is not one of substitution, elimination, studentChoice/);
});

/* -------------------------------------------------- graph mode and Graphing */

test("a graphed system's value does not depend on how many solutions it has", () => {
  const graphed = (system) => ({ type: 'systemsWorkspace', mode: 'linear', studentActions: ['graphSystem'], prompt: 'How many solutions?', system });
  const values = [
    graphed({ m1: 4, b1: 40, m2: 10, b2: 40 }),
    graphed({ m1: 10, b1: 25, m2: 10, b2: 40 }),
    graphed({ m1: 10, b1: 25, m2: 10, b2: 25 }),
  ].map((entry) => estimateQuestionValue(entry));
  assert.equal(new Set(values.map((value) => value.value)).size, 1, values.map((value) => `${value.value} (${value.summary})`).join(' / '));
  assert.equal(new Set(values.map((value) => value.units)).size, 1);
});

test('graph mode without a system is refused instead of grading its demo system', () => {
  const linear = (system) => validateToolQuestion({ type: 'systemsWorkspace', toolId: 'systemsWorkspace', mode: 'linear', prompt: 'Graph the system.', ...(system ? { system } : {}) });
  assert.match(linear(null).errors.join(' '), /graph mode needs `system` with finite m1, b1, m2 and b2/);
  assert.match(linear({ m1: 2, m2: 2 }).errors.join(' '), /graph mode needs `system`/, 'parallel lines still need both intercepts');
  assert.deepEqual(linear({ m1: 10, b1: 25, m2: 10, b2: 40 }).errors, []);
});

test('a Graphing line, or an intercept it requires, outside the drawn window is refused', () => {
  const graphing = (extra) => validateToolQuestion({ type: 'graphing2', toolId: 'graphing2', prompt: 'Graph the line.', ...extra }).errors;
  const tickets = { mode: 'standardForm', standard: { A: 5, B: 10, C: 3000 }, constructionPolicy: { strategy: 'formAware', requiredAnchor: 'intercepts' } };
  assert.match(graphing(tickets).join(' '), /never crosses the drawn window \(x from -7 to 7/);
  assert.deepEqual(graphing({ ...tickets, graphBounds: { xMin: 0, xMax: 700, yMin: 0, yMax: 400 } }), []);
  assert.match(graphing({ ...tickets, graphBounds: { xMin: 0, xMax: 500, yMin: 0, yMax: 400 } }).join(' '), /x-intercept \(600, 0\), which is outside the drawn window/);
  assert.match(graphing({ line: { m: 2, b: 12 }, constructionPolicy: { strategy: 'formAware' } }).join(' '), /y-intercept \(0, 12\)/);
  assert.deepEqual(graphing({ mode: 'standardForm', standard: { A: 2, B: 3, C: 12 }, constructionPolicy: { strategy: 'formAware', requiredAnchor: 'intercepts' } }), []);
  assert.deepEqual(graphing({ line: { m: 2, b: 12 } }), [], 'without a required anchor, a line crossing the window can be drawn');
});

test("Graphing names a standard-form line the way a teacher writes it", () => {
  assert.equal(standardFormReadoutText({ A: 1, B: 1, C: 450 }), 'x + y = 450');
  assert.equal(standardFormReadoutText({ A: 2, B: -3, C: -6 }), '2x − 3y = −6');
  assert.equal(standardFormReadoutText({ A: 0, B: 2, C: 8 }), '2y = 8');
  assert.equal(standardFormReadoutText({ A: 5, B: 10, C: 3000 }), '5x + 10y = 3000');
});

/* ------------------------------------------------------ number line prompts */

test('an inequality whose workspace graphs its solution may say "the number line"', () => {
  const inequality = (questionId, extra) => question(questionId, {
    standard: 'A.5B', studentActions: ['solveInequality'], inequality: '-4(x - 6) < 22',
    prompt: 'Solve the inequality, then graph the solution on the number line.', ...extra,
  });
  const { questions } = importQuestions([
    inequality('graphed'),
    inequality('not-graphed', { representSolution: false }),
    question('equation', { equation: '2x + 1 = 7', prompt: 'Solve, then show the solution on the number line.' }),
  ]);
  const { errors } = validateQuestionsSemantics(questions);
  assert.equal(errors.some((error) => error.startsWith('Question 1 refers to a number line')), false, errors.join('\n'));
  assert.equal(errors.some((error) => error.startsWith('Question 2 refers to a number line')), true, 'no number line is drawn when the representation is off');
  assert.equal(errors.some((error) => error.startsWith('Question 3 refers to a number line')), true, 'an equation draws none');
});

/* -------------------------------------------------------- print and display */

test('a printed worksheet shows the equation a Step Algebra card asks for', () => {
  const [stored] = importQuestions([question('print', { equation: '6(x - 1) = 3x + 9' })]).questions;
  assert.equal(stored.equation, undefined, 'intake stores it as equationLatex');
  assert.ok(structuredGivenLinesFromResolvedQuestion(stored).includes('Equation: $6(x - 1) = 3x + 9$'));
  assert.ok(
    structuredGivenLinesFromResolvedQuestion({ type: 'stepAlgebra', equation: '(5/4) * x - 21 = 3 * (x + 1)' }).includes('Equation: $(5/4)x - 21 = 3(x + 1)$'),
    "a generated equation's explicit products are written the classroom way",
  );
});

test('Step Algebra writes large and small numbers as numbers', () => {
  assert.equal(expressionToLatex('236000'), '236000');
  assert.equal(expressionToLatex('4000 * y + 56000'), '4000y+56000');
  assert.equal(expressionToLatex('0.0004 * x'), '0.0004x');
});

/* -------------------------------------------- answer keys are not UI text */

test("a version's exact answer key is not student-facing text for the raw-LaTeX check", () => {
  const base = { type: 'stepAlgebra', prompt: 'Solve $\\frac{1}{2}x + 3 = 5$.', equation: '(1/2) * x + 3 = 5' };
  const keyed = validateQuestionSemantics({ ...base, solutionKey: { outcome: 'value', value: '4', latex: '\\frac{8}{2}' } });
  assert.equal(keyed.warnings.some((warning) => /raw LaTeX/.test(warning)), false, keyed.warnings.join('\n'));
  const shown = validateQuestionSemantics({ ...base, hints: ['Undo \\frac{1}{2} first.'] });
  assert.equal(shown.warnings.some((warning) => /raw LaTeX/.test(warning)), true, 'LaTeX a student reads is still caught');
});

/* ------------------------------------------- the number line's own readout */

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test("the number line reads an Algebra I student's graph back in words, never interval notation", () => {
  const line = source('src/tools/intervalNumberLine/IntervalNumberLine.jsx');
  assert.match(line, /const readsGraphAsNotation = !asksNotation && !isAlgebraOneQuestion\(questionData\);/, 'notation only above Algebra I, and never when the student writes the symbols');
  assert.match(line, /readsGraphAsNotation\s*\?\s*`Your graph: \$\{intervalsToNotation\(drawn\)\}`\s*:\s*`Your graph: \$\{drawn\.map\(describeNumberLinePiece\)\.join\(' '\)\}`/);
  // The number line Step Algebra opens after solving knows the course too.
  assert.match(source('src/MultiRelationAlgebraCore.jsx'), /alignments: question\.alignments,\n\s*standard: question\.standard,/);
  assert.equal(isAlgebraOneQuestion({ alignments: [{ framework: 'teks', code: 'A.5B', role: 'primary' }] }), true);
  assert.equal(isAlgebraOneQuestion({ alignments: [{ framework: 'teks', code: 'A2.6F', role: 'primary' }] }), false);
  const words = describeNumberLinePiece({ min: Number.NEGATIVE_INFINITY, max: 420, minClosed: false, maxClosed: true });
  assert.equal(words, 'Shaded from a closed dot at 420 to the left, ending in an arrow.');
  assert.doesNotMatch(words, /[[\](]|∞|≤|x/, 'no notation of any kind');
});

/* ------------------------------------------------ number lines in a letter */

test('a number line written in b is graded in b, and can keep its authored window', () => {
  const numberLine = (questionId, extra) => ({
    questionId, standard: 'A.5B', studentActions: ['constructInterval'], dok: 2, difficultyBand: 2,
    prompt: 'Graph the solution set on a number line, then write the inequality your graph shows.', ask: ['graph', 'inequality'], ...extra,
  });
  const { questions } = importQuestions([
    numberLine('boxes', { inequality: 'b ≤ 420', intervals: [{ min: null, max: 420, minClosed: false, maxClosed: true }], min: 0, max: 600, step: 60, autoViewport: false }),
    numberLine('wrong-key', { inequality: 'b ≤ 420', intervals: [{ min: 0, max: 420, minClosed: true, maxClosed: true }] }),
    numberLine('plain', { inequality: 'x > -9', intervals: [{ min: -9, max: null, minClosed: false, maxClosed: false }] }),
  ]);
  const [boxes, , plain] = questions;
  assert.equal(boxes.variable, 'b');
  assert.equal(boxes.autoViewport, false, 'the authored 0-to-600 window is kept');
  assert.equal(plain.variable, undefined, 'x stays the default');
  assert.equal(plain.autoViewport, undefined, 'a window fitted to the answer stays the default');
  const graded = (inequality) => gradeServerResponse({
    question: boxes,
    response: buildToolResponse({ question: boxes, toolId: 'intervalNumberLine', work: { intervals: [{ min: null, max: 420, minClosed: false, maxClosed: true }], notation: '', inequality } }),
  });
  assert.equal(graded('b ≤ 420').isCorrect, true);
  assert.equal(graded('x ≤ 420').isCorrect, false);
  const { errors } = validateQuestionsSemantics(questions);
  assert.equal(errors.length, 1, errors.join('\n'));
  assert.match(errors[0], /^Question 2 \(intervalNumberLine\) says "b ≤ 420"/, 'the key that disagrees with its inequality is caught in b too');
});
