/*
 * DIGITAL SAT WORKED SOLUTIONS FROM THE DRAW'S OWN NUMBERS (job O).
 *
 * 465 Digital SAT Path templates — every one of them a Live Challenge question
 * too — published one generic sentence as their solution ("Preserve
 * equivalence.", "Use the model and the data."), and 16 published none. Each
 * now carries a worked solution of THE DRAW, built from its placeholders.
 * The checks are the shared ones in helpers/ccmrSolutionReviewOracle.mjs
 * (every relation recomputed with mathjs, the key reached and no losing
 * option stated, display and shape), run on every draw below, from the
 * PRODUCTION SEED the bank refresh deploys (which the CCMR release check pins
 * to drafts/ccmr-v2.1).
 *
 * Only the review and new derived values may change. Everything else is pinned
 * by digest (fixtures/ccmrSolutionReviewPins.json, computed on main before
 * this change), and a new derived value must never change a draw: the
 * parameters, prompt and choice order of every seed below are compared with
 * the same template stripped back to its committed derived block.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';
import { buildPrivateSupport } from '../../functions/shared/pathSolutionSupport.mjs';
import { roundSolutionRecord } from '../../functions/shared/liveChallengeSolutionReveal.mjs';
import {
  checkRelations, displayProblems, keyProblems, mentionsDraw, shapeProblems,
} from './helpers/ccmrSolutionReviewOracle.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

const EXAM = 'digitalSAT';
// Overridable only so a scratch run can point the same checks at a mutated copy.
const SEED = process.env.MM_CCMR_REVIEW_SEED
  || new URL(`../../seed/pathQuestionBank/${EXAM}_pathQuestionBank_seed.json`, import.meta.url);
const DRAWS = Math.max(24, Number(process.env.MM_REVIEW_DRAWS) || 24);
const GRADED_DRAWS = 4;

const PINS = JSON.parse(readFileSync(new URL('./fixtures/ccmrSolutionReviewPins.json', import.meta.url), 'utf8')).exams[EXAM];
const DOCS = new Map(JSON.parse(readFileSync(SEED, 'utf8')).documents.map((doc) => [doc.id, doc]));

// Templates that keep the generic text on purpose: no worked solution is
// correct for every draw. Each says why.
const DECLINED = Object.freeze({
});

// How many still publish their generic review (shrinks to 0 as the slices
// land; a template is pending while its review hashes to the pinned generic).
const EXPECTED_PENDING = 177;

// Reviews whose reasoning is verbal (a definition or an interpretation) and so
// states no relation for the arithmetic check. Everything else must have at
// least one relation verified across its draws.
const VERBAL = new Set([
  'mm_sat_A_12A_1_distinct-input-pairs_v21',
  'mm_sat_A_12A_4_context-unique-output_v21',
  'mm_sat_A_12A_challenge_1_parameter-repeated-input_v21',
  'mm_sat_A_12A_challenge_2_vertical-line-relation_v21',
  'mm_sat_A_3D_5_strict-boundary-inclusion_v21',
  'mm_sat_A_3F_4_graph-solution-ordered-pair_v21',
  'mm_sat_A_3F_5_horizontal-vertical-intersection_v21',
  'mm_sat_A_3G_1_break-even-interpretation_v21',
  'mm_sat_A_3G_2_meeting-time-interpretation_v21',
  'mm_sat_A_3G_3_estimate-crossing-from-values_v21',
  'mm_sat_A_3G_4_context-intersection-output_v21',
  'mm_sat_A_3G_challenge_2_intersection-rate-meaning_v21',
  'mm_sat_A_3H_2_region-description-system_v21',
  'mm_sat_A_3H_3_context-feasible-combination_v21',
  'mm_sat_A_3H_4_solid-dashed-system_v21',
  'mm_sat_A2_3E_1_ticket-constraints_v21',
  'mm_sat_A2_3E_2_production-resources_v21',
  'mm_sat_A2_3E_3_region-description_v21',
  'mm_sat_A2_3E_4_minimum-mixture_v21',
  'mm_sat_A2_3E_5_three-constraints_v21',
  'mm_sat_A2_3E_challenge_1_challenge-rental-plan_v21',
  'mm_sat_A2_3E_challenge_3_challenge-research-allocation_v21',
  'mm_sat_A2_3A_break-even-linear-cost-quadratic-revenue_v21',
  'mm_sat_A2_3A_price-demand-break-even-context_v21',
]);

const stable = (value) => (Array.isArray(value)
  ? `[${value.map(stable).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
    : JSON.stringify(value));

const withoutReviewAndDerived = (doc) => {
  const copy = JSON.parse(JSON.stringify(doc));
  delete copy.solutionReview;
  if (copy.generator) delete copy.generator.derived;
  return copy;
};

const reviewHash = (review) => (review ? createHash('sha256').update(stable(review)).digest('hex').slice(0, 16) : null);
const isPending = (id) => reviewHash(DOCS.get(id)?.solutionReview) === PINS[id].genericReview;
const authored = () => Object.keys(PINS).filter((id) => !isPending(id) && !DECLINED[id]);
const seeds = (id) => Array.from({ length: DRAWS }, (unused, index) => `job-o|${id}|${index}`);

test(`${EXAM}: everything except the review and new derived values is the committed content`, () => {
  for (const [id, pin] of Object.entries(PINS)) {
    const doc = DOCS.get(id);
    assert.ok(doc, `${id} is still in the production seed`);
    const digest = createHash('sha256').update(stable(withoutReviewAndDerived(doc))).digest('hex');
    assert.equal(digest, pin.sha256, `${id}: only solutionReview and generator.derived may change`);
    const derived = doc.generator?.derived || null;
    for (const [name, expression] of Object.entries(pin.derived || {})) {
      assert.equal(derived?.[name], expression, `${id}: committed derived value ${name} is unchanged`);
    }
  }
});

test(`${EXAM}: a new derived value never changes a draw`, () => {
  for (const id of authored()) {
    const doc = DOCS.get(id);
    const committed = JSON.parse(JSON.stringify(doc));
    if (committed.generator) {
      if (PINS[id].derived) committed.generator.derived = PINS[id].derived;
      else delete committed.generator.derived;
    }
    delete committed.solutionReview;
    for (const seed of seeds(id)) {
      const now = generatePathInstance(doc, seed);
      const before = generatePathInstance(committed, seed);
      assert.equal(Boolean(now.question), Boolean(before.question), `${id} ${seed}: issuable as before`);
      if (!now.question) continue;
      for (const name of Object.keys(before.parameters || {})) {
        assert.equal(now.parameters[name], before.parameters[name], `${id} ${seed}: ${name} keeps its value`);
      }
      assert.equal(now.question.prompt, before.question.prompt, `${id} ${seed}: same prompt`);
      assert.deepEqual((now.question.choices || []).map((choice) => choice.id), (before.question.choices || []).map((choice) => choice.id), `${id} ${seed}: same choice order`);
    }
  }
});

test(`${EXAM}: every generic solution is replaced, or declined with a reason`, () => {
  const pending = Object.keys(PINS).filter((id) => isPending(id) && !DECLINED[id]);
  assert.equal(pending.length, EXPECTED_PENDING, `templates still publishing the generic solution: ${pending.length}`);
  for (const id of Object.keys(DECLINED)) {
    assert.ok(PINS[id], `${id} is a pinned template`);
    assert.ok(isPending(id), `${id} is declined, so it keeps the generic solution`);
  }
});

test(`${EXAM}: each review solves its own draw and reaches the key`, async () => {
  const failures = [];
  for (const id of authored()) {
    const doc = DOCS.get(id);
    let checked = 0;
    let graded = 0;
    for (const [index, seed] of seeds(id).entries()) {
      const { question, reason } = generatePathInstance(doc, seed);
      if (!question) { failures.push(`${id} ${seed}: no instance (${reason})`); continue; }
      const review = question.solutionReview;
      const problems = [...shapeProblems(review)];
      if (!problems.length) {
        problems.push(...displayProblems(review));
        // A review may restate the question's own equations (prompt or choices).
        const given = [question.prompt, ...(question.choices || []).map((choice) => choice.label)].join(' ');
        const relations = checkRelations(review, { prompt: given });
        checked += relations.checked;
        problems.push(...relations.problems);
        const field = question.responseFields[0];
        let key;
        let losers = [];
        if (field.inputProfile === 'choice') {
          key = question.choices.find((choice) => choice.id === field.expected)?.label;
          losers = question.choices.filter((choice) => choice.id !== field.expected).map((choice) => choice.label);
        } else {
          key = String(field.expected);
        }
        problems.push(...keyProblems(review, { key, losers }));
        // A drawn prompt's review must use the draw: some number from it.
        if (/\{\{/.test(doc.prompt) && !mentionsDraw(review, question.prompt)) problems.push('mentions no value from its own prompt');
        // What the Path recap and the Live Challenge round record carry.
        const support = buildPrivateSupport(question);
        if (support.solutionReview?.reasoning?.length !== review.reasoning.length) problems.push('the Path support bundle drops steps');
        const record = roundSolutionRecord({ question, solutionReview: support.solutionReview });
        if (!record.solutionReview || record.solutionReview.answerSummary !== review.answerSummary) problems.push('the Live Challenge round record drops the review');
        if (field.inputProfile !== 'choice' && index < GRADED_DRAWS) {
          const plan = await mathPath.buildIssuePlan(question);
          if (!plan.issuable) problems.push(`not issuable: ${plan.reason}`);
          else {
            const result = await mathPath.gradeResponse(plan.privateGrading, { responses: { [field.id]: key } });
            if (!result.isCorrect) problems.push(`the production grader rejects the stated answer ${key}`);
            graded += 1;
          }
        }
      }
      // One failing draw per template is enough to read.
      if (problems.length) { failures.push(`${id} ${seed}:\n    ${problems.join('\n    ')}`); break; }
    }
    if (!VERBAL.has(id) && checked === 0) failures.push(`${id}: no relation in any draw could be checked (add arithmetic, or list it as VERBAL)`);
    if (VERBAL.has(id) && checked > 0) failures.push(`${id}: listed VERBAL but states checkable relations`);
    void graded;
  }
  assert.deepEqual(failures.slice(0, 25), [], `${failures.length} problem(s)`);
});
