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
 *   - A figure card's `math` holding a sentence ("y = 2x + 3 and y = −x + 3")
 *     reached the typesetter, which runs the word into the equations.
 *   - The hints of a graph the student constructs named its lines as
 *     y = mx + b rewrites, not as the equations on the student's screen.
 *   - "Write an equation for the number of tickets" took only the keyed
 *     arrangement: y = 449 − x was wrong for x + y = 449. A field can now ask
 *     for the relation in any form (`equivalence: "polynomialRelation"`, the
 *     Path field's contract).
 *   - "Try one like this" never checked a sibling inequality (b ≥ 3 read as
 *     words), and the substitution hint said "a $x$-term".
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
import { figureMatchProblems } from '../../functions/shared/toolMath/workflow/figureMatch.mjs';
import { buildQuestionHints } from '../../src/platform/supports/hints/questionHints.js';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { PRACTICE_VERDICT, checkPracticePart, readPracticeAnswer } from '../../src/platform/supports/workedExample/practiceLikeThis.js';

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

/* ------------------------------------------- inequality family slot routing */

test('a family slot that asks to solve an inequality is the Step Algebra solve its family builds', () => {
  const { questions } = importQuestions([
    question('slot', {
      standard: 'A.5B', studentActions: ['solveInequality'], prompt: 'Solve {{inequality}}. Then graph its solution.',
      questionFamily: { id: 'inequalities.solveLinear', constraints: { reversal: 'required' } },
    }),
    question('chart', { standard: 'A.5B', studentActions: ['solveInequality'], prompt: 'Use a sign chart.', factors: ['x - 2', 'x + 3'], inequality: '(x - 2)(x + 3) > 0' }),
  ]);
  const [slot, chart] = questions;
  assert.equal(slot.type, 'stepAlgebra', 'not the sign chart and its sample problem');
  const built = resolveFamilyPreviewInstance(slot).question;
  assert.equal(built.type, 'stepAlgebra');
  assert.equal(resolveStepAlgebraMode(built), 'relation');
  assert.match(built.prompt, /^Solve \$.*(<|>|\\le|\\ge).*\$\. Then graph its solution\.$/);
  assert.equal(chart.type, 'signSolutionAnalyzer', 'authored factors still open the sign chart');
  assert.deepEqual(validateQuestionsSemantics([slot]).errors, []);
});

/* ---------------------------------------- a figure's math is mathematics */

test("a figure card's `math` with a word in it is refused; the sentence belongs in `text`", () => {
  const stage = (math) => ({
    id: 'sort', kind: 'figureMatch',
    items: [{ id: 'a', math }, { id: 'b', math: 'y = 4x - 1' }],
    categories: [{ id: 'one', label: 'One solution' }, { id: 'none', label: 'No solution' }],
  });
  assert.match(figureMatchProblems(stage('y = 2x + 3 and y = -x + 3')).join(' '), /Figure 1's `math` with a word in it \("and"\)/);
  ['AC < BC', 'x + 3(x + 1) = 8x - 3(2x - 1)', '\\frac{1}{2}x + \\sqrt{4}', 'sin(x) + log(x)', '\\text{and } y = 2']
    .forEach((math) => assert.deepEqual(figureMatchProblems(stage(math)), [], math));

  const sort = (key) => importQuestions([{
    questionId: 'sort', standard: 'A.3F', studentActions: ['matchFigures'], dok: 2, difficultyBand: 2, prompt: 'Sort each system by its number of solutions.',
    figures: [{ id: 'a', [key]: 'y = 2x + 3 and y = −x + 3', category: 'one' }, { id: 'b', [key]: 'y = 4x − 1 and y = 4x + 5', category: 'none' }],
    categories: [{ id: 'one', label: 'Exactly one solution' }, { id: 'none', label: 'No solution' }],
  }]).questions;
  assert.match(validateQuestionsSemantics(sort('math')).errors.join(' '), /word in it \("and"\)/, 'Pre-Flight refuses it');
  assert.deepEqual(validateQuestionsSemantics(sort('text')).errors, [], 'written as text, the same sort passes');
});

/* -------------------------- a constructed graph's hints name its equations */

test("a constructed graph's hints name its equations as the student reads them", () => {
  const tickets = {
    type: 'systemsWorkspace', toolId: 'systemsWorkspace', mode: 'linear', interaction: 'construct', prompt: 'Graph both equations of the system.',
    system: { m1: -0.5, b1: 300, m2: -1, b2: 450 }, equationLabels: ['5s + 10a = 3000', 's + a = 450'], variables: ['s', 'a'],
    graph: { xMin: 0, xMax: 700, yMin: 0, yMax: 500 },
  };
  const hints = buildQuestionHints(tickets).map((hint) => hint.text);
  assert.ok(hints.some((hint) => hint.startsWith('Graph $5s + 10a = 3000$')), hints.join('\n'));
  assert.ok(hints.some((hint) => hint.startsWith('Graph $s + a = 450$ the same way')), hints.join('\n'));
  assert.ok(!hints.some((hint) => /\$y = /.test(hint)), `no y = mx + b the student never saw: ${hints.join(' | ')}`);
  // The analyze form draws its lines from `system` and names them that way.
  const drawn = buildQuestionHints({ ...tickets, interaction: undefined, equationLabels: undefined }).map((hint) => hint.text);
  assert.ok(drawn.some((hint) => hint.startsWith('Graph $y = ')), drawn.join('\n'));
});

/* ------------------------------ an equation a student writes, in any form */

test('a field that asks for a relation takes it in any form, on the browser and the server; a field that names its form keeps it', () => {
  const field = { id: 'people', label: 'An equation for the number of people', answer: 'x + y = 449', inputProfile: 'equation' };
  const question = (entry) => ({ type: 'multiAnswer', prompt: 'Write a system.', answerFields: [entry] });
  const graded = (entry, typed) => {
    const browser = gradeMultiAnswerResponse(question(entry), { people: typed }).isCorrect;
    const server = gradeServerResponse({ question: question(entry), response: { kind: 'fields', fields: [{ id: 'people', value: typed }] } }).isCorrect;
    assert.equal(server, browser, `browser and server agree on ${typed}`);
    return browser;
  };
  const relation = { ...field, equivalence: 'polynomialRelation' };
  ['x + y = 449', 'y = 449 − x', '2x + 2y = 898', 'x = 449 - y'].forEach((typed) => assert.equal(graded(relation, typed), true, typed));
  ['x + y = 450', 'x - y = 449', 'a + c = 449'].forEach((typed) => assert.equal(graded(relation, typed), false, typed));
  // The keypad's LaTeX is the same relation.
  assert.equal(graded({ ...relation, answer: 'y = (1/2)x + 5' }, 'y=\\frac{1}{2}x+5'), true);
  // GR03 (the owner, 2026-10-24): without the opt-in, a line field whose
  // question names no form takes any equation of its line too; one that
  // names its form keeps it.
  assert.equal(graded(field, 'y = 449 − x'), true, 'no form is named, so any equation of the line');
  const standardForm = { ...field, label: 'An equation for the number of people, in standard form' };
  assert.equal(graded(standardForm, 'y = 449 − x'), false, 'a field that names its form keeps it');
  assert.equal(graded(standardForm, 'x + y = 449'), true);
});

/* ------------------------------------- a sibling inequality, checked */

test('"Try one like this" checks a sibling inequality by its solution set', () => {
  const { parts, checkable } = readPracticeAnswer('b ≥ 3');
  assert.equal(checkable, true);
  assert.equal(checkPracticePart(parts[0], '3 ≤ b'), PRACTICE_VERDICT.CORRECT);
  assert.equal(checkPracticePart(parts[0], 'b >= 3'), PRACTICE_VERDICT.CORRECT);
  assert.equal(checkPracticePart(parts[0], 'b > 3'), PRACTICE_VERDICT.INCORRECT, 'the boundary is in the set');
  assert.equal(checkPracticePart(parts[0], 'b ≥ 4'), PRACTICE_VERDICT.INCORRECT);
  // Words stay words.
  assert.equal(readPracticeAnswer('b ≥ 3 boxes').checkable, false);
});

test('the substitution hint says "an x-term" and "a y-term"', () => {
  const system = (equations) => buildQuestionHints({ type: 'systemsWorkspace', toolId: 'systemsWorkspace', mode: 'algebraic', prompt: 'Solve the system by substitution.', equations, variables: ['x', 'y'], method: 'substitution' }).map((hint) => hint.text);
  const isolateX = system(['x + 2y = 7', '3x - y = 7']);
  assert.ok(isolateX.includes('One equation has an $x$-term with no coefficient to divide by: solve that equation for $x$ first.'), isolateX.join('\n'));
  assert.ok(!isolateX.some((hint) => /\ba \$x\$-term/.test(hint)));
});
