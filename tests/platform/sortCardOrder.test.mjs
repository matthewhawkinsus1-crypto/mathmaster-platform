/*
 * P-2: A SORT'S CARDS ARE SHOWN IN A STABLE SHUFFLED ORDER, AS CHOICES ARE.
 *
 * The student walkthrough of 2026-11-06 found that a sort drew its cards as
 * authored, and that order was often the answer: Algebra I M3 T1 L3 PR 12 ran
 * x < −4, x < −4, x ≤ −4, x ≤ −4, … in the category list's own order. An
 * authored sort's cards now take a stable shuffled order on the question
 * QuestionEngine prepares (sortCardOrder.js), and the review orders its copy
 * the same way, so "Card 3" is one card everywhere. Sorts whose own wording
 * names cards by number keep the order that wording was written for.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText, validateAssignmentQuestions } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { flattenV5Sections } from '../../src/platform/contract/assignmentSchemaV5.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { prepareQuestionForRuntimeRouting } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { normalizeContextualQuestion } from '../../src/platform/context/wordProblemLayer.js';
import { SHUFFLED_CARD_ORDER, sortOrderNamedByNumber, withShuffledSortCards } from '../../src/platform/workflow/sortCardOrder.js';
import { figureLabel, figureMatchWrongItems, matchItems } from '../../functions/shared/toolMath/workflow/figureMatch.mjs';
import { gradeWorkflow } from '../../functions/shared/toolMath/workflow/workflowGrading.mjs';
import { figureMatchAnswerLines } from '../../src/platform/workflow/workflowSolutionLines.js';
import { figureEquationLines } from '../../src/platform/workflow/figureMatch.js';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { closeEngine, loadEngine, renderEngine } from './helpers/actionBarRender.mjs';

const lessonQuestions = (file) => {
  const parsed = parseAssignmentBlueprintText(readFileSync(new URL(`../../teacher-import-jsons/${file}`, import.meta.url), 'utf8'));
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}), {});
  return validateAssignmentQuestions(flattenV5Sections(model.assignmentV5), {});
};
const stored = (file, questionId) => {
  const question = lessonQuestions(file).find((entry) => entry.questionId === questionId);
  assert.ok(question, `${file} ${questionId}`);
  return question;
};
// QuestionEngine's preparation (QuestionEngine.jsx processedQuestion).
const prepared = (question) => withShuffledSortCards(normalizeContextualQuestion(generateQuestion(
  prepareQuestionForRuntimeRouting(question, { serverGraded: false }), `${question.questionId}|s1|0|variant:0`, null, null, null,
)));
const sortOf = (question) => question.workflow.find((stage) => stage.kind === 'figureMatch');
const ids = (question) => matchItems(sortOf(question)).map((item) => String(item.id));
const keyOf = (question) => question.grading[sortOf(question).id].match;

const M3 = 'algebra1-module3';
// The walkthrough's sorts, every one of which listed its cards category by category or nearly so.
const WALKED = [
  [`${M3}/T1_L1_Solving_Linear_Equations.json`, 'm3l1-cw-14'],
  [`${M3}/T1_L1_Solving_Linear_Equations.json`, 'm3l1-pr-12'],
  [`${M3}/T1_L1_Solving_Linear_Equations_Honors.json`, 'm3l1h-cw-14'],
  [`${M3}/T1_L3_Modeling_and_Solving_Linear_Inequalities.json`, 'm3l3-cw-20'],
  [`${M3}/T1_L3_Modeling_and_Solving_Linear_Inequalities.json`, 'm3l3-pr-12'],
  [`${M3}/T1_L3_Modeling_and_Solving_Linear_Inequalities_Honors.json`, 'm3l3h-cw-17'],
  [`${M3}/T1_L3_Modeling_and_Solving_Linear_Inequalities_Honors.json`, 'm3l3h-pr-9'],
];
// Sorts whose worked solution names each card by its number ("Card 1 (5) …").
const NAMED_BY_NUMBER = [
  ['algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json', 'l2-pr-8'],
  ['algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json', 'l3m-cw-4'],
  ['algebra2-honors-module2/L1_Operations_on_Polynomials.json', 'opp-cw-1'],
  ['algebra2-honors-module2/L1_Operations_on_Polynomials.json', 'opp-pr-15'],
];

before(async () => { await loadEngine(); });
after(async () => { await closeEngine(); });

test('the walkthrough\'s sorts are no longer shown in their authored order, and a reload shows the same order', () => {
  for (const [file, questionId] of WALKED) {
    const question = stored(file, questionId);
    const shown = prepared(question);
    assert.notDeepEqual(ids(shown), ids(question), `${questionId} is not in authored order`);
    assert.notEqual(ids(shown)[0], ids(question)[0], `${questionId}'s first authored card is not first`);
    assert.deepEqual([...ids(shown)].sort(), [...ids(question)].sort(), 'the same cards');
    assert.deepEqual(ids(prepared(stored(file, questionId))), ids(shown), `${questionId}: a reload shows the same order`);
    assert.equal(sortOf(shown).cardOrder, SHUFFLED_CARD_ORDER);
  }
  // L3 PR 12 no longer reads x < −4, x < −4, x ≤ −4, x ≤ −4, … in the category list's order.
  const pr12 = stored(`${M3}/T1_L3_Modeling_and_Solving_Linear_Inequalities.json`, 'm3l3-pr-12');
  const categories = sortOf(pr12).categories.map((category) => category.id);
  const runs = (question) => ids(question).map((id) => keyOf(pr12)[id]);
  assert.deepEqual(runs(pr12), categories.flatMap((category) => [category, category]), 'authored: two of each, in the list\'s order');
  assert.notDeepEqual(runs(prepared(pr12)), runs(pr12));
});

test('a sort whose wording names its cards by number keeps the order that wording was written for', () => {
  for (const [file, questionId] of NAMED_BY_NUMBER) {
    const question = stored(file, questionId);
    assert.equal(sortOrderNamedByNumber(question), true, questionId);
    assert.deepEqual(ids(prepared(question)), ids(question), `${questionId} keeps its order`);
  }
  // A card's own words are not the question's wording about its cards.
  const walked = stored(...WALKED[0]);
  const withCardText = { ...walked, workflow: walked.workflow.map((stage) => (stage.kind === 'figureMatch' ? { ...stage, items: stage.items.map((item, index) => (index ? item : { ...item, text: 'Card 1 of the deck' })) } : stage)) };
  assert.equal(sortOrderNamedByNumber(withCardText), false);
});

test('a family\'s sort deals its own order, and ordering twice changes nothing', () => {
  const walked = stored(...WALKED[0]);
  assert.equal(withShuffledSortCards({ ...walked, familyDelivery: { slot: 's', variant: 0 } }).workflow, walked.workflow);
  assert.equal(withShuffledSortCards({ ...walked, questionFamily: { id: 'graphRecognition.sort' } }).workflow, walked.workflow);
  const once = prepared(walked);
  assert.equal(withShuffledSortCards(once), once, 'already ordered: the same object');
  // The review's own copy of the question (Review My Work: the server's
  // delivered question) is ordered the same way as the board.
  assert.deepEqual(ids(withShuffledSortCards(walked)), ids(once));
});

test('grading reads cards by id: the order never changes a verdict, and "Card n" names the card on the screen', () => {
  for (const [file, questionId] of WALKED) {
    const question = stored(file, questionId);
    const shown = prepared(question);
    const stage = sortOf(shown);
    const key = keyOf(question);
    const right = { [stage.id]: { __mathmasterWorkflowArtifact: 'figureMatch', assignments: { ...key }, isComplete: true } };
    assert.equal(gradeWorkflow({ stages: shown.workflow, responses: right, grading: question.grading }).isCorrect, true, `${questionId} right as shown`);
    assert.equal(gradeWorkflow({ stages: question.workflow, responses: right, grading: question.grading }).isCorrect, true, `${questionId} right as authored`);
    // The student places the card shown third in another category: the board
    // says "Figure 3" (or "Card 3"), and the review's line 3 is that card.
    const third = String(stage.items[2].id);
    const other = stage.categories.find((category) => category.id !== key[third]).id;
    const wrong = figureMatchWrongItems(stage, { assignments: { ...key, [third]: other } }, key);
    assert.deepEqual(wrong, [2]);
    const lines = figureMatchAnswerLines(stage, question.grading[stage.id]);
    assert.match(lines[2], new RegExp(`^${figureLabel(2, 'Figure').replace(' ', '\\s')}|^${figureLabel(2, 'Card').replace(' ', '\\s')}`));
    assert.ok(lines[2].endsWith(stage.categories.find((category) => category.id === key[third]).label), 'line 3 is the third card shown');
  }
});

test('the board draws the cards in that order', async () => {
  const question = stored(...WALKED[0]);
  const { html, errors } = await renderEngine({ question, role: 'classwork' });
  assert.deepEqual(errors, []);
  // Each card's heading, then its equation's lines, as the page draws them.
  const drawn = [...html.matchAll(/>Figure (\d+)<\/p>([\s\S]*?)aria-label="Category for Figure \1"/g)]
    .map((match) => ({ name: Number(match[1]), lines: [...match[2].matchAll(/>([^<]*)<\/math-div>/g)].map((line) => line[1]).join(' | ') }));
  const expected = matchItems(sortOf(prepared(question))).map((item, index) => ({ name: index + 1, lines: figureEquationLines(item.math).join(' | ') }));
  assert.deepEqual(drawn, expected, 'Figure 1, 2, … are the cards in the shuffled order');
  assert.notEqual(drawn[0].lines, figureEquationLines(matchItems(sortOf(question))[0].math).join(' | '), 'the authored first card is not drawn first');
});

test('QuestionEngine and the review order the cards where everything reads them', () => {
  const engine = executableSource(readFileSync(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8'));
  assert.match(region(engine, 'const processedQuestion = useMemo(', ');', 'processedQuestion'), /\(\) => withShuffledSortCards\(normalizeContextualQuestion\(generateQuestion\(/);
  const review = executableSource(readFileSync(new URL('../../src/SolutionReview.jsx', import.meta.url), 'utf8'));
  assert.match(region(review, 'const buildWorkflowSolution = (question) => {', '\n};', 'buildWorkflowSolution'), /^const buildWorkflowSolution = \(question\) => \{\s*const composed = readComposedQuestion\(withShuffledSortCards\(question\)\);/);
});
