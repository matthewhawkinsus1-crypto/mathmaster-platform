/*
 * A CLOSED QUESTION IS STILL A QUESTION.
 *
 * Once a question is closed — correct, or out of attempts — QuestionEngine
 * shows its solution review beside the locked board. That review is built from
 * the question's own data and renders OUTSIDE the response module's error
 * boundary, so it is the one place where question data meets the screen in a
 * state ordinary use rarely reaches. lmr-wu-1's review put a Question Family
 * table spec (`{ xValues }`) into the page and took the whole question with it
 * ("This question did not load") — see warmupReopenServerLifecycle.test.mjs
 * for the lifecycle that made it closed.
 *
 * Here: the review is TEXT for every tool and every family instance, and it
 * shows exactly what the shared grader calls correct; a panel that still
 * cannot render is contained to itself (QuestionSupplementBoundary); and what
 * a failure records says where the question stood without naming the student.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { buildToolSolutionReviewModel } from '../../src/tools/shared/toolSolutionReview.js';
import { LINEAR_KIND_LABELS } from '../../src/tools/representationMatch/linearCardLabels.js';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  LINEAR_EQUATION_KINDS,
  buildLinearConnectionCards,
  describeLinearCard,
  linearConnectionsCardKinds,
  linearPlacementsFromAssignments,
  representationSetsFor,
  scoreLinearMismatchSelection,
  tableAuditFunction,
  tableAuditRows,
  findTableMismatchIndexes,
} from '../../functions/shared/toolMath/representationMatch/representationMath.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { questionsOf, lmrAssignment } from './helpers/warmupServerLifecycle.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

let vite = null;
let ToolSolutionReview = null;
let boundaryModule = null;
let resolutionModule = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  ToolSolutionReview = (await vite.ssrLoadModule('/src/tools/shared/ToolSolutionReview.jsx')).default;
  boundaryModule = await vite.ssrLoadModule('/src/QuestionSupplementBoundary.jsx');
  resolutionModule = await vite.ssrLoadModule('/src/QuestionResolutionBoundary.jsx');
});
after(async () => { await vite?.close(); });

const renderReview = (question) => renderToStaticMarkup(React.createElement(ToolSolutionReview, { question }));
const assertTextOnly = (model, label) => {
  assert.ok(model, `${label}: a review model`);
  assert.equal(typeof model.title, 'string', `${label}: title is text`);
  assert.ok(model.note === null || typeof model.note === 'string', `${label}: note is text`);
  model.items.forEach((item, index) => {
    assert.equal(typeof item.label, 'string', `${label}: item ${index} label is text`);
    assert.equal(typeof item.value, 'string', `${label}: item ${index} value is text`);
    assert.ok(item.value.length > 0, `${label}: item ${index} says something`);
  });
};

/* ------------------------------------------- the family that took Q1 down */

// The Warm-Up's two card-sort slots as published, dealt to many seats.
const lesson = lmrAssignment({ id: 'review-check' });
const cardSortSlots = questionsOf(lesson).filter((question) => question.type === 'representationMatch');

test('every linear.representationSort instance reviews as text, naming each line\'s cards (lmr-wu-1, lmr-wu-2)', () => {
  assert.equal(cardSortSlots.length, 2);
  let instances = 0;
  cardSortSlots.forEach((slot, storageIndex) => {
    for (let seat = 0; seat < 24; seat += 1) {
      const resolved = resolveFamilyQuestionInstance({
        question: slot,
        assignmentId: lesson.id,
        storageIndex,
        allocation: { basis: 'seated', seat, variant: 0, stride: 24, index: seat },
      });
      assert.equal(resolved.error, null);
      const question = resolved.question;
      // The production spec that broke the old review.
      assert.equal(typeof question.sets[0].table, 'object');
      const model = buildToolSolutionReviewModel(question);
      assertTextOnly(model, `${slot.questionId} seat ${seat}`);
      assert.equal(model.title, 'Card-sort solution');

      // Each group lists exactly its own line's cards, as the board names them.
      const sets = representationSetsFor(question);
      const deck = buildLinearConnectionCards(sets, linearConnectionsCardKinds(question));
      sets.forEach((set, index) => {
        const value = model.items[index].value;
        deck.forEach((card) => {
          const text = `${LINEAR_KIND_LABELS[card.kind]}: ${describeLinearCard(card, { bounds: question.graphBounds })}`;
          if (card.setId === set.id) assert.ok(value.includes(text), `${slot.questionId} seat ${seat}: ${text} under its own line`);
        });
        const own = deck.filter((card) => card.setId === set.id).length;
        assert.equal(value.split(' · ').length, own, 'and nothing from the other line');
      });

      // The grouping the review shows is the one the shared grader marks correct.
      const shown = Object.fromEntries(deck.map((card) => [card.id, sets.findIndex((set) => set.id === card.setId)]));
      const graded = gradeToolWork({ toolId: 'representationMatch', question, work: { assignments: linearPlacementsFromAssignments(shown) } });
      assert.equal(graded.isCorrect, true, 'the review shows the correct sort');

      // And it renders.
      const html = renderReview(question);
      assert.match(html, /Card-sort solution/);
      instances += 1;
    }
  });
  assert.equal(instances, 48);
});

test('the review of a find-the-mismatch card sort names the card the grader expects', () => {
  const question = {
    type: 'representationMatch',
    mode: 'linearConnections',
    task: 'findMismatch',
    mismatchSetId: 'line-a',
    sets: [{ id: 'line-a', slopeIntercept: 'y = 2x + 1', standard: '2x - y = -1', pointSlope: 'y - 3 = 2(x - 1)', factoredLinear: 'y = 3(x + 1)' }],
    correctionOptions: [{ id: 'fix', label: 'y = 2(x + 0.5)' }, { id: 'other', label: 'y = 3x + 1' }],
    correctionAnswerId: 'fix',
  };
  const model = buildToolSolutionReviewModel(question);
  assertTextOnly(model, 'linear findMismatch');
  const cards = buildLinearConnectionCards(question.sets, LINEAR_EQUATION_KINDS);
  const expected = cards.find((card) => card.id === scoreLinearMismatchSelection(cards, '').expectedId);
  assert.equal(expected.kind, 'factoredLinear');
  assert.equal(model.items[0].value, `${LINEAR_KIND_LABELS.factoredLinear}: ${expected.value}`);
  assert.equal(model.items[1].value, 'y = 2(x + 0.5)');
  const graded = gradeToolWork({ toolId: 'representationMatch', question, work: { selectedId: expected.id, correctionChoice: 'fix' } });
  assert.equal(graded.isCorrect, true);
});

test('the other card layouts review what the grader marks — including when the author left the board to its defaults', () => {
  // findMismatch with no authored mixed set: the board deals the first other
  // set's table, and the grader expects "table".
  const mismatch = buildToolSolutionReviewModel({ type: 'representationMatch', mode: 'findMismatch' });
  assertTextOnly(mismatch, 'findMismatch default');
  assert.equal(mismatch.items[0].value, 'Table');
  assert.equal(gradeToolWork({ toolId: 'representationMatch', question: { type: 'representationMatch', mode: 'findMismatch' }, work: { mismatchKind: 'table' } }).isCorrect, true);

  // tableAudit with no authored rows: the board corrupts its middle row.
  const auditQuestion = { type: 'representationMatch', mode: 'tableAudit' };
  const spec = tableAuditFunction(auditQuestion);
  const [badRow] = findTableMismatchIndexes(spec, tableAuditRows(auditQuestion, spec), 0.01);
  const audit = buildToolSolutionReviewModel(auditQuestion);
  assert.equal(audit.items[0].value, `Row ${badRow + 1}`);
  assert.equal(gradeToolWork({ toolId: 'representationMatch', question: auditQuestion, work: { rowIndex: badRow } }).isCorrect, true);

  // completeSet with no authored sets: the board's demo sets.
  const complete = buildToolSolutionReviewModel({ type: 'representationMatch', mode: 'completeSet' });
  assertTextOnly(complete, 'completeSet default');
  assert.equal(complete.items[0].value, 'y = 2x + 1');
});

test('structure where a sentence belongs is shown as text or "—", never handed to React', () => {
  const cases = [
    { type: 'representationMatch', mode: 'completeSet', sets: [{ id: 's', equation: { latex: 'y=x' }, table: { xValues: [1, 2] }, context: ['a', 'b'] }] },
    { type: 'representationMatch', mode: 'graphMatch', sets: [{ id: 's', equation: ['y', '=', 'x'] }] },
    { type: 'openSortBoard', validSchemes: [{ label: { text: 'odd' }, groups: [{ label: 'A', itemIds: ['1'] }] }] },
    { type: 'constraintFunctionBuilder', constraints: [{ kind: 'mystery', label: { nested: true } }, { kind: 'passesThrough', point: [1, 2] }] },
    { type: 'relationMapping', pairs: [[1, 2], { x: 3, y: 4 }] },
    { type: 'sequenceExplorer', mode: 'analyze', sequence: { kind: 'arithmetic', first: 2, difference: 3 }, targetN: 5 },
    { type: 'functionInvestigation2', mode: 'domainRange', function: { type: 'linear', a: 1, h: 0, k: 0 } },
  ];
  cases.forEach((question) => {
    const model = buildToolSolutionReviewModel(question);
    assertTextOnly(model, question.type);
    assert.doesNotThrow(() => renderReview(question), `${question.type} renders`);
  });
  assert.equal(buildToolSolutionReviewModel({ type: 'constructor' }), null, 'only real review builders run');
  assert.equal(buildToolSolutionReviewModel(null), null);
});

/* ----------------------------------------------- a panel that still fails */

test('a panel beside a question that cannot render is contained to itself, with a scrubbed record of where', () => {
  const { default: QuestionSupplementBoundary } = boundaryModule;
  const values = new Map();
  const previous = globalThis.window;
  globalThis.window = { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) }, location: { pathname: '/' } };
  try {
    const fallback = React.createElement('p', null, 'The worked solution for this question could not be shown here.');
    const boundary = new QuestionSupplementBoundary({
      stage: 'solution-review',
      fallback,
      draftKey: 'mathmaster:draft:v2::student-123456789:a:0:0:student',
      context: resolutionModule.questionFailureContext({
        assignmentId: 'lmr-prod',
        question: { questionId: 'lmr-wu-1', questionFamily: { id: 'linear.representationSort', version: 1 } },
        questionRecord: { status: 'expired', totalAttempts: 3, variantIndex: 0, submissionOrigin: 'deadline-auto-submit', lastResponseKey: '{"assignments":[{"cardId":"line-a:graph","slot":0}]}' },
        familyContext: { pinSource: 'canonical', pin: { variant: 0, fingerprint: 'linear.representationSort:1|-3|-3|6' } },
        activityRole: 'warmup',
        executionScope: 'student',
      }),
      resetKey: 'k1',
    });
    const error = new Error('Objects are not valid as a React child (found: object with keys {xValues})');
    boundary.state = QuestionSupplementBoundary.getDerivedStateFromError(error);
    assert.equal(boundary.render(), fallback, 'only the panel is replaced');
    const consoleError = console.error;
    const consoleWarn = console.warn;
    console.error = () => {};
    console.warn = () => {};
    try { boundary.componentDidCatch(error, { componentStack: '' }); } finally { console.error = consoleError; console.warn = consoleWarn; }
    const stored = JSON.parse(values.get('mm:client-diagnostics') || '[]');
    const entry = stored.at(-1);
    assert.equal(entry.kind, 'question-supplement-error');
    // What went wrong and where, first — then the slot, its lifecycle, record and pin.
    assert.match(entry.message, /^\[solution-review\] supplement-render-failed recovery=contained detail=Error: Objects are not valid as a React child \(found: object with keys \{xValues\}\) \| /);
    assert.match(entry.message, /\| lmr-prod lmr-wu-1 family=linear\.representationSort@v1 role=warmup scope=student/);
    assert.match(entry.message, /state=expired attempts=3 origin=deadline-auto-submit variant=0 pin=canonical@v0 pinRef=fp-[0-9a-z]+/);
    // Never the student, never the answer, never the generated values.
    assert.doesNotMatch(entry.message, /student-123456789|mathmaster:draft|cardId|line-a:graph|1\|-3\|-3\|6/);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});

test('an error message is reported without what it quotes', () => {
  const { describeErrorDetail } = resolutionModule;
  assert.equal(describeErrorDetail(new TypeError("Cannot read properties of null (reading 'line-a:point')")), 'TypeError: Cannot read properties of null (reading …)');
  assert.equal(describeErrorDetail(new Error('Unexpected token in "3x+"')), 'Error: Unexpected token in …');
});

/* ------------------------------------------------------ the engine's wiring */

const engine = executableSource(read('src/QuestionEngine.jsx'));

test('QuestionEngine renders a closed question\'s solution review inside its own boundary', () => {
  // One review for every closed question (SolutionReviewPanel), built once
  // and placed in the closed panel — contained in its own boundary.
  const review = region(engine, 'const closedReview = (isCorrect || isExpired) && feedbackOpen ? (', ') : null;', 'the closed question\'s review');
  const contained = region(review, '<QuestionSupplementBoundary', '</QuestionSupplementBoundary>', 'the contained review');
  assert.match(contained, /stage="solution-review"/);
  assert.match(contained, /<SolutionReviewPanel\s+question=\{processedQuestion\}\s+isToolQuestion=\{isToolQuestion\}/);
  assert.match(contained, /fallback=\{<p[^>]*>The worked solution for this question could not be shown here\./);
  assert.match(engine, /const isToolQuestion = Boolean\(missingToolDefinition\);/);
  // The out-of-attempts panel shows it; the way on stays outside it.
  const closed = region(engine, '{isExpired && showOutcomeFeedback && (\n        <div style={{ margin: \'25px auto 0\'', 'Request New Question', 'the closed question\'s panel');
  assert.match(closed, /\{closedReview\}/);
  assert.doesNotMatch(contained, /handleRequestNewQuestion/);
  assert.match(engine, /import QuestionSupplementBoundary from '\.\/QuestionSupplementBoundary';/);
});

test('QuestionEngine contains Guided Notes the same way', () => {
  const coach = region(engine, 'const guidedCoach = (', '\n  );', 'the guided coach');
  assert.match(coach, /^const guidedCoach = \(\s*<QuestionSupplementBoundary stage="guided-notes"/);
  assert.match(coach, /<GuidedClassworkCoach[\s\S]*<\/QuestionSupplementBoundary>/);
});

test('every question boundary reports the question\'s lifecycle, record and pin — never the draft key', () => {
  const wrapper = region(engine, 'export default function QuestionEngine(props) {', '<QuestionEngineBody', 'the outer wrapper');
  assert.match(wrapper, /const context = questionFailureContext\(\{[\s\S]*questionRecord: record,[\s\S]*familyContext: props\.familyContext,[\s\S]*assignmentLocked: props\.assignmentLocked,/);
  assert.match(wrapper, /context=\{context\}/);
  assert.match(wrapper, /draftKey=\{props\.draftKey \|\| null\}/);
  // The draft key names the student: it is handed over beside the context, never inside it.
  const contextBuilder = region(read('src/QuestionResolutionBoundary.jsx'), 'export const questionFailureContext = (', '\n};', 'questionFailureContext');
  assert.doesNotMatch(executableSource(contextBuilder), /draftKey|studentId/);
});
