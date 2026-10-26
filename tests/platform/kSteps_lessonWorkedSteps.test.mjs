/*
 * JOB K (CT02, slice 4) — WORKED STEPS WRITTEN INTO THE LESSON FILES.
 *
 * A closed question that no support family can work, because what it asks
 * rests on something the item itself does not show, carries its own
 * solutionReview in its lesson file. Once the question closes the review panel
 * shows it as the item's steps (closedQuestionReview.js: authored steps win,
 * and no family or builder is asked). The items:
 *
 *   l3-wu-2   Algebra I M2 T2 Lesson 3, Regular and Honors: the slopes of AB and
 *             its three rotations about the origin, whose points are only in the
 *             warm-up item before it (l3-wu-1: A(0, 0) and B(8, 5)). The steps
 *             name those points and the images the warm-up's turn rules give.
 *             The Honors file is rebuilt from the Regular one by
 *             scripts/content/build-algebra1-l3-honors.mjs
 *             (algebra1L3HonorsFile.test.mjs checks the bytes).
 *
 * Checked here with this file's own reading (mathjs fractions), never a
 * family's helpers:
 *   - the review is the item's own, as the inventory resolves the item and as a
 *     student's device gets it after import (Pre-Flight, the stored record,
 *     QuestionEngine), and nothing in it is cut short by the support bundle's
 *     limits (8 steps of at most 400 characters, a 160-character headline, a
 *     240-character summary: pathSolutionSupport.buildPrivateSupport);
 *   - each part's answer is stated in its own step, a choice in its own words,
 *     and the part's grader (gradeMultiAnswerResponse) marks every stated answer
 *     right; the summary states the same answers;
 *   - every "=" a step writes is a claim checked here as exact arithmetic, and
 *     each step's numbers are the points it names: the givens the student was
 *     shown, and the images the turn rules give;
 *   - nothing changes while the item is open: the review names no common error
 *     (FB04 says a common error's mistake half on a miss), and the hints and the
 *     back-up step are the same with or without it.
 *
 * Mutation-checked (each made in the lesson files, seen red, undone):
 *   - a slope's arithmetic changed ("= 5/8" to "= 8/5" in A″B″'s step) → the part and arithmetic checks;
 *   - the 90° rule printed as (y, −x), or B′ printed as (5, 8) → the turn check;
 *   - the pattern step stating "the reciprocal only" → the part check;
 *   - a common error added → the whole-review and open-item checks;
 *   - the review removed from the Regular file only → algebra1L3HonorsFile and every check here;
 *     from both files → the inventory's floors and afterLastMiss's Pre-Flight count.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { all, create } from 'mathjs';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildClosedQuestionReview } from '../../src/platform/supports/review/closedQuestionReview.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { canonicalV5PersistencePatch, getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';
import { prepareQuestionForRuntimeRouting } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { normalizeContextualQuestion } from '../../src/platform/context/wordProblemLayer.js';
import { buildQuestionHints } from '../../src/platform/supports/hints/questionHints.js';
import { backUpStepFor } from '../../src/platform/supports/feedback/backUpStep.js';
import { buildPrivateSupport } from '../../functions/shared/pathSolutionSupport.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, ROOT), 'utf8');
const math = create(all, { number: 'Fraction' });
const ascii = (value) => String(value ?? '').replace(/[−–]/g, '-');
const text = (value) => String(value ?? '').trim();
const F = (value) => math.fraction(ascii(value).replace(/[()\s]/g, ''));
/** An arithmetic expression as a step writes it: −, ÷, × and fractions. */
const evaluate = (expression) => math.evaluate(ascii(expression).replace(/÷/g, '/').replace(/[×·]/g, '*'));
/** Every side of "a = b = c" is the same exact number. */
const holds = (claim) => {
  const values = claim.split('=').map(evaluate);
  return values.every((value) => math.equal(value, values[0]));
};

/* ------------------------------------------------------------ the items, as a student meets them */

const L3 = 'teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json';
const L3_HONORS = 'teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines_Honors.json';

// As the inventory resolves them: the import compiler's questions.
const asInventory = (path) => parseAssignmentBlueprintText(read(path)).questions;
// As a student's device gets them: imported through Pre-Flight, stored, then generated by QuestionEngine.
const asDevice = (path) => {
  const parsed = parseAssignmentBlueprintText(read(path));
  const model = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
  return getStoredAssignmentQuestions({ id: 'k-steps-lesson', ...canonicalV5PersistencePatch(model.assignmentV5) })
    .map((stored) => normalizeContextualQuestion(generateQuestion(prepareQuestionForRuntimeRouting(stored, {}), 0, null, null, null)));
};
const authoredIn = (path, questionId) => JSON.parse(read(path)).sections
  .flatMap((section) => section.questions)
  .find((question) => question.questionId === questionId);

/*
 * Each item: the step that states each part's answer, and the words it states
 * them in; every "=" its steps write, as the claim this file checks; what its
 * summary states; and anything else to check that only this item says.
 */
const TURNS = Object.freeze({
  '90° counterclockwise': { rule: '(−y, x)', turn: ([x, y]) => [-y, x], key: 'b90' },
  '180°': { rule: '(−x, −y)', turn: ([x, y]) => [-x, -y], key: 'b180' },
  '270° counterclockwise': { rule: '(y, −x)', turn: ([x, y]) => [y, -x], key: 'b270' },
});
const pointText = ([x, y]) => `(${String(x).replace('-', '−')}, ${String(y).replace('-', '−')})`;

const ITEMS = Object.freeze([
  {
    files: [L3, L3_HONORS],
    questionId: 'l3-wu-2',
    parts: {
      ab: [0, '5/8'],
      ab90: [1, '−8/5'],
      ab180: [2, '5/8'],
      ab270: [3, '−8/5'],
      pattern90: [4, 'the negative reciprocal'],
      pattern180: [5, 'the same'],
    },
    arithmetic: [
      [0, '(5 − 0) ÷ (8 − 0) = 5/8'],
      [1, '(8 − 0) ÷ (−5 − 0) = −8/5'],
      [2, '(−5 − 0) ÷ (−8 − 0) = 5/8'],
      [3, '(−8 − 0) ÷ (5 − 0) = −8/5'],
      [4, '(5/8) × (−8/5) = −1'],
    ],
    summary: [
      ['AB and A″B″ have slope 5/8', ['ab', 'ab180']],
      ['A′B′ and A‴B‴ have slope −8/5', ['ab90', 'ab270']],
      ['gives the negative reciprocal', ['pattern90']],
      ['keeps the same slope', ['pattern180']],
    ],
    /*
     * The points are the warm-up's: A(0, 0) and B(8, 5) as its prompt states
     * them, and each image the turn's own rule gives, which is the warm-up's key
     * for that turn. Each slope is rise over run from A to that point.
     */
    check: ({ path, review }) => {
      const warmUp = asInventory(path).find((question) => question.questionId === 'l3-wu-1');
      assert.match(warmUp.prompt, /A\(0, 0\) and B\(8, 5\)/, 'the warm-up before it shows A and B');
      const B = [8, 5];
      assert.ok(review.reasoning[0].includes(`A(0, 0) to B${pointText(B)}`), 'AB is the warm-up\'s segment');
      const slopeFrom = (point) => `(${pointText([point[1], 0]).slice(1, -1).replace(', ', ' − ')}) ÷ (${pointText([point[0], 0]).slice(1, -1).replace(', ', ' − ')})`;
      assert.ok(review.reasoning[0].includes(slopeFrom(B)), 'AB\'s slope is rise over run to B');
      Object.entries(TURNS).forEach(([name, { rule, turn, key }], index) => {
        const step = review.reasoning[index + 1];
        const image = turn(B);
        assert.ok(step.includes(`a ${name} turn about the origin sends (x, y) to ${rule}`), `${name}: the turn's rule (${step})`);
        assert.match(step, new RegExp(`so B\\(8, 5\\) goes to B[′″‴]${pointText(image).replace(/[()]/g, '\\$&')}\\.`), `${name}: B goes to ${pointText(image)}`);
        const warmUpKey = warmUp.answerFields.find((field) => field.id === key).answer;
        assert.deepEqual(warmUpKey.replace(/[()\s]/g, '').split(',').map(Number), image, `${name}: the warm-up's own key is that image`);
        assert.ok(step.includes(slopeFrom(image)), `${name}: the slope is rise over run to ${pointText(image)}`);
      });
      // The pattern: 5/8 flipped and its sign changed is the 90° and 270° slope.
      const flip = /flip (\S+) to (\S+) and change its sign, and you get (\S+), the slope of A′B′ and of A‴B‴/.exec(review.reasoning[4]);
      assert.ok(flip, review.reasoning[4]);
      assert.ok(math.equal(F(flip[2]), math.divide(1, F(flip[1]))), 'a flip');
      assert.ok(math.equal(F(flip[3].replace(/,$/, '')), math.unaryMinus(F(flip[2]))), 'a sign change');
      assert.ok(math.equal(F(flip[1]), F('5/8')) && math.equal(F(flip[3].replace(/,$/, '')), F('-8/5')), 'from AB\'s slope to A′B′\'s');
    },
  },
]);

const everyCopy = ITEMS.flatMap((item) => item.files.flatMap((path) => [['inventory', asInventory(path)], ['device', asDevice(path)]]
  .map(([how, questions]) => ({ item, path, how, source: `${path.split('/').pop()}#${item.questionId} (${how})`, question: questions.find((question) => question.questionId === item.questionId) }))));

const reviewOf = (question) => buildClosedQuestionReview({ question, isToolQuestion: false, wasCorrect: false, legacyContent: () => ({ hasContent: true }) });

/* ------------------------------------------------------------ the tests */

test('the closed review shows each item\'s own worked steps, in every copy, whole', () => {
  assert.equal(everyCopy.length, ITEMS.reduce((sum, item) => sum + item.files.length * 2, 0));
  for (const { item, path, source, question } of everyCopy) {
    assert.ok(question, `${source}: found`);
    const authored = authoredIn(path, item.questionId).solutionReview;
    assert.ok(authored, `${source}: the lesson file carries the review`);
    const review = reviewOf(question);
    assert.equal(review.hasSteps, true, source);
    assert.equal(review.fromFamily, false, `${source}: the item's own steps, not a family's`);
    assert.equal(review.fromBuilder, false, source);
    assert.deepEqual(review.authored.reasoning, authored.reasoning, source);
    assert.equal(review.authored.headline, authored.headline, source);
    assert.equal(review.authored.answerSummary, authored.answerSummary, source);
    // Nothing is cut short: the support bundle keeps every word.
    assert.deepEqual(buildPrivateSupport(question).solutionReview, {
      headline: authored.headline, reasoning: authored.reasoning, commonError: null, connection: null, answerSummary: authored.answerSummary,
    }, `${source}: within the support bundle's limits`);
  }
});

test('each part\'s answer is stated in its own step, and the part\'s grader marks every one right', () => {
  for (const { item, source, question } of everyCopy) {
    const review = reviewOf(question).authored;
    const fields = question.answerFields;
    assert.deepEqual(Object.keys(item.parts).sort(), fields.map((field) => field.id).sort(), `${source}: every part, and only those`);
    const responses = {};
    for (const field of fields) {
      const [stepIndex, stated] = item.parts[field.id];
      assert.ok(review.reasoning[stepIndex].includes(stated), `${source}: step ${stepIndex + 1} states "${stated}" for ${field.id}`);
      const options = (field.options || []).map(text);
      if (options.length) assert.ok(options.includes(stated), `${source}: "${stated}" is one of ${field.id}'s choices`);
      responses[field.id] = stated;
    }
    const grade = gradeMultiAnswerResponse(question, responses);
    assert.equal(grade.isCorrect, true, `${source}: ${JSON.stringify(grade.parts.filter((part) => !part.isCorrect))}`);
    // The summary states the same answers.
    for (const [phrase, ids] of item.summary) {
      assert.ok(review.answerSummary.includes(phrase), `${source}: the summary says "${phrase}"`);
      ids.forEach((id) => {
        const stated = responses[id];
        const number = /(−?\d+\/\d+|−?\d+)$/.exec(phrase);
        if (number) assert.ok(math.equal(F(number[1]), F(stated)), `${source}: "${phrase}" is ${id}'s ${stated}`);
        else assert.ok(phrase.includes(stated), `${source}: "${phrase}" is ${id}'s "${stated}"`);
      });
    }
  }
});

test('every "=" a step writes is checked arithmetic, and the numbers are the points the student was shown', () => {
  let checked = 0;
  for (const entry of everyCopy) {
    const { item, source, question } = entry;
    const review = reviewOf(question).authored;
    review.reasoning.forEach((step, index) => {
      const claims = item.arithmetic.filter(([at]) => at === index).map(([, claim]) => claim);
      claims.forEach((claim) => {
        assert.ok(step.includes(claim), `${source}: step ${index + 1} writes ${claim}`);
        assert.ok(holds(claim), `${source}: ${claim}`);
        checked += 1;
      });
      const equalsWritten = (step.match(/=/g) || []).length;
      const equalsChecked = claims.reduce((sum, claim) => sum + (claim.match(/=/g) || []).length, 0);
      assert.equal(equalsWritten, equalsChecked, `${source}: every "=" in step ${index + 1} is checked: ${step}`);
    });
    item.check?.({ ...entry, review });
  }
  assert.ok(checked >= 20, `${checked} claims checked`);
});

test('the words are plain and short, and nothing changes while the item is open', () => {
  for (const { item, path, source, question } of everyCopy) {
    const authored = authoredIn(path, item.questionId).solutionReview;
    for (const line of [authored.headline, ...authored.reasoning, authored.answerSummary]) {
      assert.doesNotMatch(line, /NaN|undefined|\bnull\b|Infinity|\[object|\{\{|\$/, `${source}: ${line}`);
    }
    // A common error's mistake half is said on a miss (FB04, attemptFeedbackPlan.js):
    // these reviews name none, so an open item's feedback is what it was.
    assert.equal(authored.commonError, undefined, `${source}: no common error`);
    const without = { ...question };
    delete without.solutionReview;
    assert.deepEqual(buildQuestionHints(question), buildQuestionHints(without), `${source}: the same hints`);
    assert.deepEqual(backUpStepFor(question), backUpStepFor(without), `${source}: the same back-up step`);
  }
});
