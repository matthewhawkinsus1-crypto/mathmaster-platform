/*
 * CT02, SLICE 2 — WORKED STEPS FOR THE DISTRICT DOL #2 RETEST, ONLY IN ITS
 * RELEASED REVIEW.
 *
 * The secure retest's thirteen families (functions/seeds/secureAssessments/
 * algebra1_district_dol2.json, 64 variants each: 832 items) showed a student
 * only the answer once their teacher released the results: the largest
 * answer-only group left (kSteps_answerOnlyInventory.test.mjs). The review
 * callable (getStudentSecureExamReview) now passes its released review through
 * secureExamItems.withReleasedWorkedSteps, which works the student's own issued
 * item with the review tasks' builder (functions/shared/
 * districtDol2WorkedSolution.mjs) and holds every answer it states to the
 * item's key twice: the shared field grader, and the grader that scored the
 * student. Nothing is stored.
 *
 * Here:
 *   1. every variant, issued as the server issues it, gets steps; what they
 *      state is the item's own key, graded right by the shared field grader
 *      and by the secure grader, written in the steps, and released whole; the
 *      line's three questions read the line drawn;
 *   2. THE GUARD: before release (submitted and held, still testing, released
 *      with the answers held, or a caller that skipped the gates) nothing a
 *      student can get carries a step or an answer, and no item document is
 *      even read; after release the steps are on every item, as the results
 *      page shows them, and no document changed;
 *   3. never a wrong step: a key the steps do not reproduce (in the item's
 *      fields or only in its private grading), a keyless copy, a missing item
 *      document, a reader that fails, a tool item: no steps, the review as it
 *      was; an item's own steps win;
 *   4. only the review callable asks for them, after its gates; the device
 *      never runs the builder on a secure item; the results page shows them
 *      with the one worked-solution panel.
 *
 * Mutation-checked (each went red, then was restored):
 *   - withReleasedWorkedSteps without its own release check (feedbackReleased,
 *     terminal status, held answers each dropped in turn) → the guard's
 *     "caller that skipped the gates" and "answers held" cases;
 *   - steps added where the release carries no solution → "answers held";
 *   - the secure grader check skipped, or a choice graded by its words → the
 *     private-key cases (and every variant goes unworked when choices are not
 *     mapped to runtime ids);
 *   - the release-bounds check skipped, with a step made too long → "released
 *     whole";
 *   - the y-intercept value stated as the pair, the zero read off the
 *     y-axis, the q03 pairs swapped → the key, the graders and the drawn line;
 *   - the wording guard of q04 / q08 dropped → the "other words" case;
 *   - an item's own steps replaced by the builder's → "its own steps win";
 *   - the callable returning `review` instead of the stepped review, or asking
 *     before the release check → section 4.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { districtDol2ReviewWorkedSolution, districtDol2SecureWorkedSolution } from '../../functions/shared/districtDol2WorkedSolution.mjs';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { effectivePathVariants } from '../../functions/shared/pathQuestionGeneration.mjs';
import { buildClosedQuestionReview } from '../../src/platform/supports/review/closedQuestionReview.js';
import { reviewItemResult } from '../../src/platform/assessment/secureExamResultsModel.js';
import { isMathSegment, splitMathSegments } from '../../src/components/common/mathSegments.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const secureItems = require('../../functions/lib/secureItems.js');
const secureExam = require('../../functions/lib/secureExam.js');
const secureExamItems = require('../../functions/lib/secureExamItems.js');

const ROOT = new URL('../../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, ROOT), 'utf8');
const readJson = (relative) => JSON.parse(read(relative));
// structuredClone keeps a curve's -0, which a JSON round trip would turn into 0.
const copy = (value) => structuredClone(value);

const bank = readJson('functions/seeds/secureAssessments/algebra1_district_dol2.json');
const FAMILY_IDS = Array.from({ length: 13 }, (_, index) => `mm_district_dol2_q${String(index + 1).padStart(2, '0')}`);
const VARIANTS = 64;
const familyById = (id) => bank.documents.find((family) => family.id === id);

/*
 * The item the server stores for one variant (index.js buildCourseTestExamItem):
 * the variant over its family — what mathPath.instantiateQuestion returns for
 * it — with its private grading from mathPath.buildIssuePlan and an instance id,
 * encoded for storage. A copy: the variant shares its fields with the bank, and
 * a case below that changes an item must not change the bank under the next.
 */
const issue = async (family, variantIndex, instance = `${family.id}_${variantIndex}`) => {
  const template = copy(effectivePathVariants(family)[variantIndex].template);
  const plan = await mathPath.buildIssuePlan(template);
  assert.equal(plan.issuable, true, `${family.id}#${variantIndex} is issuable`);
  return secureItems.storableItem({
    ...template,
    bankQuestionId: family.id,
    familyId: family.id,
    questionInstanceId: `examq_ct02_${instance}`,
    attemptsAllowed: 1,
    attemptsUsed: 0,
    generatorParameters: { __variantIndex: variantIndex },
    privateGrading: plan.privateGrading,
  });
};

/** What the steps state, as the secure grader reads a response: a choice by its runtime id. */
const asResponses = (item, answers) => {
  const fields = mathPath.buildSanitizedQuestion(item, {}).responseFields;
  return Object.fromEntries(Object.entries(answers).map(([id, stated]) => {
    const choices = fields.find((field) => field.id === id)?.choices || [];
    return [id, choices.length ? choices.find((choice) => choice.label === stated)?.id : stated];
  }));
};

/* The key, read without any grader: numbers by value, sets and pairs element by element. */
const numbersIn = (value) => String(value).replace(/[{}()]/g, '').split(',').map((entry) => Number(entry.trim()));
const assertIsTheKey = (stated, field, label) => {
  if (field.inputProfile === 'choice') return assert.equal(stated, field.expected, label);
  if (field.inputProfile === 'set') {
    const sorted = (values) => [...values].sort((a, b) => a - b);
    return assert.deepEqual(sorted(numbersIn(stated)), sorted(numbersIn(field.expected)), label);
  }
  if (field.inputProfile === 'orderedPair') return assert.deepEqual(numbersIn(stated), numbersIn(field.expected), label);
  return assert.equal(Number(stated), Number(field.expected), label);
};

/** A point on the line through the two points drawn (each drawn to 8 decimals). */
const onDrawnLine = (graph, [x, y]) => {
  const [p, q] = graph.lines[0].points;
  return Math.abs((q.y - p.y) * (x - p.x) - (y - p.y) * (q.x - p.x)) <= 1e-6 * Math.abs(q.x - p.x);
};

/* ------------------------------------------------------------ 1. every variant */

test('the retest is the thirteen families the builder was extended for: 13 × 64 variants, and the server issues one of them', async () => {
  assert.deepEqual(bank.documents.map((family) => family.id), FAMILY_IDS);
  bank.documents.forEach((family) => assert.equal(effectivePathVariants(family).length, VARIANTS, family.id));
  // What the server's own draw issues is one of the 64 checked below.
  for (const family of bank.documents) {
    const variants = effectivePathVariants(family).map((row) => JSON.stringify(row.template));
    for (const seed of ['seat-1', 'seat-2', 'seat-3']) {
      const { question } = await mathPath.instantiateQuestion(family, `exam_ct02|${seed}`, { preferredDok: 2, preferredDifficultyBand: 3 });
      assert.ok(variants.includes(JSON.stringify(question)), `${family.id} ${seed}: one of the 64`);
    }
  }
});

test('every variant, issued as the server issues it, gets steps that state its own key, graded right by the shared field grader and by the grader that scored the student', async () => {
  const worked = Object.fromEntries(FAMILY_IDS.map((id) => [id, 0]));
  for (const family of bank.documents) {
    for (let index = 0; index < VARIANTS; index += 1) {
      const label = `${family.id}#${index}`;
      const stored = await issue(family, index);
      const item = secureItems.readStoredItem(stored);
      const solution = districtDol2SecureWorkedSolution(item);
      assert.ok(solution, `${label}: worked`);
      assert.ok(solution.steps.length >= 2 && solution.headline && solution.answerSummary, label);
      // Every box is stated, and what is stated is the item's own key.
      assert.deepEqual(Object.keys(solution.answers).sort(), item.responseFields.map((field) => field.id).sort(), label);
      item.responseFields.forEach((field) => assertIsTheKey(solution.answers[field.id], field, `${label} ${field.id}`));
      // The shared field grader, box by box, as the builder asks it.
      item.responseFields.forEach((field) => assert.equal(matchesFieldAnswer(solution.answers[field.id], field), true, `${label} ${field.id}`));
      // The grader that scored the student, on its private grading.
      const verdict = await secureItems.gradeItem(item.privateGrading, { responses: asResponses(item, solution.answers) });
      assert.deepEqual([verdict.isCorrect, verdict.score], [true, 1], `${label}: ${JSON.stringify(verdict.parts)}`);
      // What is graded is what the student reads.
      const shown = [...solution.steps, solution.answerSummary].join(' ');
      Object.entries(solution.answers).forEach(([box, answer]) => assert.ok(shown.includes(answer), `${label}: ${box} = ${answer} is written in the steps`));
      // Plain words: no step is typeset as a formula, none leaks a value.
      [solution.headline, ...solution.steps, solution.answerSummary].forEach((line) => {
        assert.deepEqual(splitMathSegments(line).filter(isMathSegment), [], `${label}: "${line}" is shown as prose`);
        assert.doesNotMatch(line, /NaN|undefined|null|Infinity|\[object/, label);
      });
      // The server hands out exactly these steps, released whole (secureExam.releasedSolutionOf's bounds).
      const released = await secureExamItems.releasedWorkedStepsFor(stored);
      assert.deepEqual(released, { headline: solution.headline, reasoning: solution.steps, commonError: null, connection: null, answerSummary: solution.answerSummary }, label);
      assert.deepEqual(secureExam.releasedSolutionOf({ releasedSolution: { answers: [], review: released } }).review, released, `${label}: nothing is cut`);
      worked[family.id] += 1;
    }
  }
  assert.deepEqual(worked, Object.fromEntries(FAMILY_IDS.map((id) => [id, VARIANTS])));
});

test('the line\'s three retest questions read the line drawn: each point named is on it, inside the window', async () => {
  for (const id of ['mm_district_dol2_q03', 'mm_district_dol2_q04', 'mm_district_dol2_q08']) {
    for (let index = 0; index < VARIANTS; index += 1) {
      const label = `${id}#${index}`;
      const item = secureItems.readStoredItem(await issue(familyById(id), index));
      const { graph } = item.stimulus;
      const { steps, answers } = districtDol2SecureWorkedSolution(item);
      const named = [...steps.join(' ').matchAll(/\((-?\d+), (-?\d+)\)/g)].map((match) => [Number(match[1]), Number(match[2])]);
      assert.ok(named.length >= 1, label);
      named.forEach(([x, y]) => {
        assert.ok(onDrawnLine(graph, [x, y]), `${label}: (${x}, ${y}) is on the line drawn`);
        assert.ok(x === 0 || y === 0, `${label}: (${x}, ${y}) is on an axis`);
        assert.ok(x >= graph.xMin && x <= graph.xMax && y >= graph.yMin && y <= graph.yMax, `${label}: inside the window`);
      });
      if (id === 'mm_district_dol2_q04') {
        // The box takes the y-value alone, and it is the crossing's.
        assert.match(answers.yIntercept, /^-?\d+$/, label);
        assert.ok(onDrawnLine(graph, [0, Number(answers.yIntercept)]), label);
      }
      if (id === 'mm_district_dol2_q08') assert.ok(onDrawnLine(graph, [Number(answers.zero), 0]), `${label}: the zero is where y = 0`);
    }
  }
});

/* ------------------------------------------------------------ 2. only after release */

const WRONG = '999';
/*
 * A finished retest of thirteen items, one of each family, as finalize records
 * it (secureExamItems.buildResponseRecord): every other item answered wrong in
 * its first box, the rest left blank. `items` are the item documents.
 */
const finishedRetest = async ({ status = 'submitted', feedbackReleased = false, variant = 7 } = {}) => {
  const session = {
    examSessionId: 'exam_ct02_retest', studentId: 'S_CT02', examType: 'courseTest', requiredQuestions: 13,
    courseTest: { assignmentId: 'ct02-assignment', cycleStage: 'retest' }, status, feedbackReleased,
  };
  const items = new Map();
  const responses = {};
  for (const [position, family] of bank.documents.entries()) {
    const item = await issue(family, variant);
    items.set(item.questionInstanceId, { item, draftResponse: null, issuedAt: 1 });
    const answered = position % 2 === 0;
    responses[item.questionInstanceId] = await secureExamItems.buildResponseRecord(item, {
      session,
      responsePayload: { responses: answered ? { [item.responseFields[0].id]: WRONG } : {} },
      now: 100 + position,
      unanswered: !answered,
    });
  }
  const order = [...items.keys()];
  session.navigation = { version: 1, itemOrder: order, items: Object.fromEntries(order.map((id, position) => [id, { position, state: 'recorded' }])) };
  session.responses = responses;
  return { session, items };
};

/** The item documents, as the callable reads them (the same objects, so a change to one shows); every request is recorded. */
const itemReader = (items) => {
  const asked = [];
  const readItems = async (ids) => {
    asked.push([...ids]);
    return new Map(ids.filter((id) => items.has(id)).map((id) => [id, items.get(id)]));
  };
  return { asked, readItems };
};

/** What the callable returns: the public review, then the steps (index.js getStudentSecureExamReview). */
const serve = async (session, items, { withSolutions = true } = {}) => {
  const reader = itemReader(items);
  const review = await secureExamItems.withReleasedWorkedSteps(secureExam.publicReview(session, { withSolutions }), { session, readItems: reader.readItems });
  return { review, asked: reader.asked };
};

/** Every line the steps would show, for every item: none may appear before release. */
const stepTexts = (items) => [...items.values()].flatMap(({ item }) => {
  const solution = districtDol2SecureWorkedSolution(secureItems.readStoredItem(item));
  return [...solution.steps, solution.answerSummary];
});
const assertNothingReleased = (payload, items, where) => {
  const serialized = JSON.stringify(payload ?? null);
  stepTexts(items).forEach((line) => assert.ok(!serialized.includes(JSON.stringify(line).slice(1, -1)), `${where}: carries the step "${line}"`));
  assert.doesNotMatch(serialized, /"(reasoning|answerSummary|headline|releasedSolution|answers|display|expected|accepted|privateGrading|generatorParameters)"/, `${where}: carries no answer or solution`);
};

test('THE GUARD: before release nothing a student can get carries a step or an answer, and no item document is read', async () => {
  // Submitted, results not released: the review is refused (publicReview null), the session is states only.
  const held = await finishedRetest();
  const before = copy(held.session);
  const refused = await serve(held.session, held.items);
  assert.equal(refused.review, null);
  assert.deepEqual(refused.asked, [], 'no item document is read before release');
  assertNothingReleased(secureExam.publicSession(held.session), held.items, 'the public session');
  assertNothingReleased(secureExam.publicSession(held.session, { teacher: true }), held.items, 'the proctor\'s row');

  // Still testing, even with a release flag: nothing.
  const testing = await serve({ ...held.session, status: 'in_progress', feedbackReleased: true }, held.items);
  assert.equal(testing.review, null);
  assert.deepEqual(testing.asked, []);

  // Released, but a course Test's answers are held for the class: the score and
  // the student's own answers, no correct answer, no step, no item read.
  const releasedSession = { ...held.session, feedbackReleased: true };
  const withheld = await serve(releasedSession, held.items, { withSolutions: false });
  assert.equal(withheld.review.solutionsHeld, true);
  assert.equal(withheld.review.items.length, 13);
  assert.ok(withheld.review.items.every((item) => item.solution === null));
  assert.deepEqual(withheld.asked, []);
  assertNothingReleased(withheld.review, held.items, 'the held review');

  // A caller that skipped the gates gets nothing added: the function checks the release itself.
  const releasedShape = secureExam.publicReview(releasedSession);
  for (const [what, session] of [
    ['not released', held.session],
    ['not finished', { ...releasedSession, status: 'in_progress' }],
    ['locked', { ...releasedSession, status: 'locked_proctor' }],
  ]) {
    const reader = itemReader(held.items);
    const result = await secureExamItems.withReleasedWorkedSteps(releasedShape, { session, readItems: reader.readItems });
    assert.equal(result, releasedShape, `${what}: the review exactly as it was handed in`);
    assert.ok(result.items.every((item) => !item.solution.review?.reasoning?.length), `${what}: no steps`);
    assert.deepEqual(reader.asked, [], `${what}: no item document read`);
  }
  const heldShape = { ...releasedShape, solutionsHeld: true };
  const heldReader = itemReader(held.items);
  assert.equal(await secureExamItems.withReleasedWorkedSteps(heldShape, { session: releasedSession, readItems: heldReader.readItems }), heldShape, 'answers held: nothing added');
  assert.deepEqual(heldReader.asked, []);

  // Nothing was written anywhere along the way.
  assert.deepEqual(held.session, before, 'the session document is unchanged');
});

test('after release the steps are on every item, as the results page shows them, and nothing is stored', async () => {
  const { session, items } = await finishedRetest({ feedbackReleased: true });
  const sessionBefore = copy(session);
  const itemsBefore = copy([...items]);
  const { review, asked } = await serve(session, items);
  // The item documents are read once, for exactly the items that had no steps.
  assert.deepEqual(asked, [[...items.keys()]]);
  assert.equal(review.items.length, 13);
  for (const entry of review.items) {
    const { item } = items.get(entry.questionInstanceId);
    const solution = districtDol2SecureWorkedSolution(secureItems.readStoredItem(item));
    assert.ok(entry.solution.answers.length, `${entry.bankQuestionId}: the correct answers`);
    assert.deepEqual(entry.solution.review, { headline: solution.headline, reasoning: solution.steps, commonError: null, connection: null, answerSummary: solution.answerSummary }, entry.bankQuestionId);
    // The results page's model hands these lines to the worked-solution panel.
    const result = reviewItemResult(entry, 0, { solutionsHeld: review.solutionsHeld === true });
    assert.deepEqual(result.workedSolution.reasoning, solution.steps, entry.bankQuestionId);
    assert.equal(result.solutionNote, null);
    assert.ok(result.correctAnswers.length, 'the correct answers stay above the steps');
  }
  // Answered or blank, every item: and the student's own answer is still theirs.
  assert.equal(review.items.filter((entry) => entry.unanswered).length, 6);
  assert.ok(review.items.filter((entry) => !entry.unanswered).every((entry) => Object.values(entry.responsePayload.responses).includes(WRONG)));
  // Stored nowhere: the session and item documents are as they were.
  assert.deepEqual(session, sessionBefore);
  assert.deepEqual(copy([...items]), itemsBefore);
  assert.equal(JSON.stringify(session).includes('"reasoning":["'), false, 'no step on the session document');
});

/* ------------------------------------------------------------ 3. never a wrong step */

test('a key the steps do not reproduce — in the item\'s fields, or only in its private grading — means no steps for that item, and the review keeps its answers', async () => {
  const { session, items } = await finishedRetest({ feedbackReleased: true });
  const idOf = (familyId) => [...items.keys()].find((id) => items.get(id).item.bankQuestionId === familyId);
  const edit = (familyId, change) => {
    const entry = items.get(idOf(familyId));
    const item = copy(secureItems.readStoredItem(entry.item));
    change(item);
    entry.item = secureItems.storableItem(item);
  };
  const choiceId = (item, fieldId, label) => mathPath.buildSanitizedQuestion(item, {}).responseFields.find((field) => field.id === fieldId).choices.find((choice) => choice.label === label).id;
  // Only the private grading disagrees: the builder's field grader is satisfied, the secure grader is not.
  edit('mm_district_dol2_q02', (item) => { item.privateGrading.fields.find((field) => field.id === 'constant').expected += 1; });
  edit('mm_district_dol2_q01', (item) => { item.privateGrading.fields.find((field) => field.id === 'association').expected = choiceId(item, 'association', 'No'); });
  edit('mm_district_dol2_q13', (item) => { item.privateGrading.fields.find((field) => field.id === 'prediction2').expected += 3; });
  // The item's own fields disagree with what is shown.
  edit('mm_district_dol2_q05', (item) => { item.responseFields.find((field) => field.id === 'a3').expected += 1; });
  edit('mm_district_dol2_q08', (item) => { item.stimulus.graph.lines[0].points[0].y += 1; });
  const changed = ['mm_district_dol2_q02', 'mm_district_dol2_q01', 'mm_district_dol2_q13', 'mm_district_dol2_q05', 'mm_district_dol2_q08'];
  // The builder alone still works the first three (its key is the fields'); the server refuses them.
  ['mm_district_dol2_q02', 'mm_district_dol2_q01', 'mm_district_dol2_q13'].forEach((familyId) => assert.ok(districtDol2SecureWorkedSolution(secureItems.readStoredItem(items.get(idOf(familyId)).item)), `${familyId}: the field key alone agrees`));
  for (const familyId of changed) assert.equal(await secureExamItems.releasedWorkedStepsFor(items.get(idOf(familyId)).item), null, familyId);
  const { review } = await serve(session, items);
  for (const entry of review.items) {
    const disagreed = changed.includes(entry.bankQuestionId);
    assert.equal(Boolean(entry.solution.review?.reasoning?.length), !disagreed, entry.bankQuestionId);
    assert.ok(entry.solution.answers.length, `${entry.bankQuestionId}: the answers are released either way`);
  }
});

test('a keyless copy, another kind of item, other words, a missing document or a failing reader: no steps, never an error', async () => {
  const q04 = await issue(familyById('mm_district_dol2_q04'), 3);
  const item = secureItems.readStoredItem(q04);
  // The copy a device holds while testing has no keys: nothing to state.
  const delivered = await secureItems.publicItem(q04, { mode: 'secureRetest' });
  assert.equal(districtDol2SecureWorkedSolution(delivered), null, 'the delivered copy');
  assert.equal(districtDol2SecureWorkedSolution(mathPath.buildSanitizedQuestion(item, {})), null, 'the review snapshot');
  assert.equal(await secureExamItems.releasedWorkedStepsFor({ ...q04, privateGrading: undefined }), null, 'no private grading');
  // The closed review on a device never works a secure item, keyed or not.
  for (const question of [item, delivered]) {
    const closed = buildClosedQuestionReview({ question, legacyContent: () => ({ hasContent: true }) });
    assert.equal(closed.fromBuilder, false);
    assert.equal(closed.hasSteps, false);
  }
  // Each entry point takes only its own kind of item.
  assert.equal(districtDol2ReviewWorkedSolution(item), null, 'a secure item is not a review task');
  const reviewTask = readJson('drafts/district-dol2/assignment.json').sections[0].questions[0];
  assert.equal(districtDol2SecureWorkedSolution({ ...reviewTask, ...reviewTask.variants[0] }), null, 'a review task is not a secure item');
  assert.equal(districtDol2SecureWorkedSolution({ ...item, pathToolId: 'graphFeatureReader' }), null, 'a Rich Tool item');
  // The same boxes in other words are not this question.
  assert.equal(districtDol2SecureWorkedSolution({ ...item, prompt: 'What is the slope of this line? Enter the y-value.' }), null, 'q04 in other words');
  const q08 = secureItems.readStoredItem(await issue(familyById('mm_district_dol2_q08'), 3));
  assert.equal(districtDol2SecureWorkedSolution({ ...q08, prompt: 'Determine the maximum of the function. Enter its x-value.' }), null, 'q08 in other words');
  // A step the release would cut short is not released at all.
  const q01 = secureItems.readStoredItem(await issue(familyById('mm_district_dol2_q01'), 3));
  q01.responseFields[0].label = `Association described${' and recorded'.repeat(30)}?`;
  assert.ok(districtDol2SecureWorkedSolution(q01).steps[0].length > 400, 'the builder works it, with a step too long to release');
  assert.equal(await secureExamItems.releasedWorkedStepsFor(secureItems.storableItem(q01)), null, 'released whole or not at all');
  for (const value of [null, undefined, {}, 7, 'x', { responseFields: [] }, { prompt: 'Determine the zero of the function. Enter its x-value.', responseFields: [{ id: 'zero', expected: 2 }] }]) {
    assert.equal(districtDol2SecureWorkedSolution(value), null, JSON.stringify(value));
    assert.equal(await secureExamItems.releasedWorkedStepsFor(value), null, JSON.stringify(value));
  }

  const { session, items } = await finishedRetest({ feedbackReleased: true });
  const [missing, ...rest] = [...items.keys()];
  items.delete(missing);
  const { review } = await serve(session, items);
  assert.equal(review.items.find((entry) => entry.questionInstanceId === missing).solution.review, null, 'a missing item document: no steps');
  assert.ok(rest.every((id) => review.items.find((entry) => entry.questionInstanceId === id).solution.review.reasoning.length));
  // A reader that fails leaves the review exactly as publicReview made it.
  const plain = secureExam.publicReview(session);
  const failed = await secureExamItems.withReleasedWorkedSteps(plain, { session, readItems: async () => { throw new Error('unavailable'); } });
  assert.equal(failed, plain);
  // No reader, or no review: as given.
  assert.equal(await secureExamItems.withReleasedWorkedSteps(plain, { session }), plain);
  assert.equal(await secureExamItems.withReleasedWorkedSteps(null, { session, readItems: async () => new Map() }), null);
});

test('an item\'s own worked solution wins: its steps are kept, and its words are kept beside built steps', async () => {
  const { session, items } = await finishedRetest({ feedbackReleased: true });
  const [own, partial, tool, older] = [...items.keys()];
  session.responses[own].releasedSolution.review = { headline: 'Read the report.', reasoning: ['An authored step.'], commonError: null, connection: null, answerSummary: null };
  session.responses[partial].releasedSolution.review = { headline: '', reasoning: [], commonError: 'Observation is not experiment.', connection: null, answerSummary: 'Teacher summary.' };
  session.responses[tool].pathToolId = 'graphFeatureReader';
  // Graded before solutions were stored: its review releases no answer, so no steps either.
  delete session.responses[older].releasedSolution;
  const { review, asked } = await serve(session, items);
  assert.ok(![own, tool, older].some((id) => asked[0].includes(id)), 'an item with steps, a tool item or one with no released solution is not looked up');
  assert.ok(asked[0].includes(partial));
  const entry = (id) => review.items.find((item) => item.questionInstanceId === id);
  assert.deepEqual(entry(own).solution.review.reasoning, ['An authored step.']);
  assert.equal(entry(tool).solution.review, null);
  assert.equal(entry(older).solution, null, 'no answer and no step where the release has no solution');
  const built = districtDol2SecureWorkedSolution(secureItems.readStoredItem(items.get(partial).item));
  assert.deepEqual(entry(partial).solution.review, { headline: built.headline, reasoning: built.steps, commonError: 'Observation is not experiment.', connection: null, answerSummary: 'Teacher summary.' });
});

test('the item documents are read in one request, by id, and never written', async () => {
  const calls = [];
  const docs = new Map([['examq_a', { item: { prompt: 'A' } }]]);
  const sessionRef = {
    firestore: { getAll: async (...refs) => { calls.push(refs.map((ref) => ref.path)); return refs.map((ref) => ({ exists: docs.has(ref.id), data: () => docs.get(ref.id) })); } },
    collection: (name) => ({ doc: (id) => ({ id, path: `examSessions/s1/${name}/${id}` }) }),
  };
  const found = await secureExamItems.readIssuedItems(sessionRef, ['examq_a', 'examq_b', 'examq_a', '']);
  assert.deepEqual(calls, [['examSessions/s1/items/examq_a', 'examSessions/s1/items/examq_b']]);
  assert.deepEqual([...found], [['examq_a', { item: { prompt: 'A' } }]]);
  assert.deepEqual([...(await secureExamItems.readIssuedItems(sessionRef, []))], []);
  assert.equal(calls.length, 1, 'nothing to read, no request');
});

/* ------------------------------------------------------------ 4. where it is asked */

test('only the review callable asks for the steps, after every gate, and returns them; no device runs the builder on a secure item', () => {
  const functionsIndex = read('functions/index.js');
  const callable = region(functionsIndex, 'exports.getStudentSecureExamReview = onCall(', '\n});', 'review callable');
  const code = executableSource(callable);
  const asks = code.search(/await secureExamItems\.withReleasedWorkedSteps\(review, \{/);
  assert.ok(asks > 0, 'the callable asks');
  // After the finish and release checks, the open-attempt block and the held answers, and on publicReview's own result.
  const precedes = (pattern, what) => {
    const at = code.search(pattern);
    assert.ok(at >= 0 && at < asks, `${what} comes first`);
  };
  precedes(/if \(!secureExam\.TERMINAL_STATES\.has\(session\.status\)\) \{\s*throw/, 'the finished check');
  precedes(/if \(session\.feedbackReleased !== true\) \{\s*throw/, 'the release check');
  precedes(/if \(blocked\) throw/, 'the open-attempt block');
  precedes(/withSolutions = !\(await courseAnswersHeld\(/, 'the held answers');
  precedes(/const review = secureExam\.publicReview\(session, \{ withSolutions \}\);/, 'the public review');
  assert.match(code, /withReleasedWorkedSteps\(review, \{\s*session,\s*readItems: \(ids\) => secureExamItems\.readIssuedItems\(snapshot\.ref, ids\),\s*\}\);\s*return \{ success: true, review: reviewWithSteps \};\s*$/);
  // Nowhere else on the server, and the device never names the secure entry point.
  const files = [];
  const walk = (directory) => readdirSync(new URL(directory, ROOT)).forEach((name) => {
    const child = `${directory}/${name}`;
    if (statSync(new URL(child, ROOT)).isDirectory()) { if (name !== 'node_modules') walk(child); } else if (/\.(m?js|jsx|cjs)$/.test(name)) files.push(child);
  });
  ['src', 'functions/lib', 'functions/shared'].forEach(walk);
  files.push('functions/index.js');
  const callers = files.filter((file) => /withReleasedWorkedSteps\(|releasedWorkedStepsFor\(/.test(executableSource(read(file))));
  assert.deepEqual(callers.sort(), ['functions/index.js', 'functions/lib/secureExamItems.js']);
  assert.equal((executableSource(functionsIndex).match(/withReleasedWorkedSteps\(/g) || []).length, 1, 'one call, in the review callable');
  const builder = 'functions/shared/districtDol2WorkedSolution.mjs';
  assert.deepEqual(files.filter((file) => file !== builder && /districtDol2SecureWorkedSolution/.test(executableSource(read(file)))), ['functions/lib/secureExamItems.js']);
});

let vite = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
});
after(async () => { await vite?.close(); });

test('rendered: a released retest question shows its steps in the one worked-solution panel, as a closed review task does', async () => {
  const SolutionReviewPanel = (await vite.ssrLoadModule('/src/SolutionReviewPanel.jsx')).default;
  const { session, items } = await finishedRetest({ feedbackReleased: true });
  const { review } = await serve(session, items);
  const entry = review.items.find((item) => item.bankQuestionId === 'mm_district_dol2_q07');
  const result = reviewItemResult(entry, 6);
  // As SecureExamReview renders it.
  const html = renderToStaticMarkup(React.createElement(SolutionReviewPanel, { question: { solutionReview: result.workedSolution }, wasCorrect: false, headingLevel: 4, showIntro: false }));
  assert.match(html, /data-worked-solution="present"/);
  assert.ok(html.includes('data-review-source="authored"'), 'the block a closed review task\'s steps use');
  const authored = html.slice(html.indexOf('data-review-source="authored"'));
  assert.equal((authored.slice(0, authored.indexOf('</ol>')).match(/<li/g) || []).length, result.workedSolution.reasoning.length, 'one list item per step');
  assert.ok(authored.includes('The range is the set of outputs.'));
  assert.ok(authored.includes(result.workedSolution.answerSummary), 'the answer summary');
  assert.doesNotMatch(html, /data-review-source="tool"|data-part-review/);
});
