/*
 * CT02, SLICE 4 — WORKED STEPS FOR A CLOSED DISTRICT DOL #2 CORRECTION.
 *
 * Corrections (issueTestCycleCorrectionQuestion, functions/index.js) hands a
 * student who failed a Test fresh items of the families the Test drew on, each
 * with three tries. On a Test Cycle whose blueprint is the DOL #2 one
 * (drafts/district-dol2/assignment.json, under a policy with Corrections: the
 * district's own copy is an external original, which has none) those are the
 * thirteen DOL #2 families (functions/seeds/secureAssessments/
 * algebra1_district_dol2.json), which carry no worked solution. The screen
 * shows only the review the server releases (RichQuestionRuntime), so a closed
 * correction showed nothing at all. The answer stays on the server, so the
 * steps are built there, by the released Test review's own per-item builder
 * (secureExamItems.reviewWithWorkedSteps over releasedWorkedStepsFor, 4969bb40),
 * from the student's own issued item, only once that item is closed
 * (submitTestCycleCorrectionResponse), and stored nowhere.
 *
 * Here:
 *   1. every variant, issued as Corrections issues it, gets the builder's steps
 *      once closed; what they state, sent as the Corrections screen sends it (a
 *      choice by the id its public item carries), is marked right by the
 *      Corrections grader (gradeIssuedItem); they are released whole and the
 *      one worked-solution panel shows them as given;
 *   2. an item's own steps win, and its own words stay beside built steps;
 *   3. never a wrong step: a key the steps do not reproduce, a tool item, a
 *      keyless or unreadable item: the review exactly as it was;
 *   4. only a closed item's response carries them, through that one helper; the
 *      issued item never does. tests/integration/districtDol2CorrectionsSteps
 *      drives the real callables end to end on the emulator.
 *
 * Mutation-checked (each went red, then was restored):
 *   - reviewWithWorkedSteps returning the item's own review untouched → section 1;
 *   - its own-steps check dropped (built steps replace an item's own) → section 2;
 *   - releasedWorkedStepsFor's grader check skipped → section 3's private-key case;
 *   - the callable releasing the steps before the item closes, or returning the
 *     item's own review instead → section 4 (and the emulator test).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { districtDol2SecureWorkedSolution } from '../../functions/shared/districtDol2WorkedSolution.mjs';
import { effectivePathVariants } from '../../functions/shared/pathQuestionGeneration.mjs';
import { buildClosedQuestionReview } from '../../src/platform/supports/review/closedQuestionReview.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const secureItems = require('../../functions/lib/secureItems.js');
const secureExam = require('../../functions/lib/secureExam.js');
const secureExamItems = require('../../functions/lib/secureExamItems.js');

const ROOT = new URL('../../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, ROOT), 'utf8');
const copy = (value) => structuredClone(value);

const bank = JSON.parse(read('functions/seeds/secureAssessments/algebra1_district_dol2.json'));
const dol2 = JSON.parse(read('drafts/district-dol2/assignment.json'));

/*
 * The item a correction stores for one variant (issueTestCycleCorrectionQuestion):
 * the variant over its family — what mathPath.instantiateQuestion returns for it —
 * certified for Corrections, with its private grading and three tries.
 */
const issueCorrection = async (family, variantIndex) => {
  const template = copy(effectivePathVariants(family)[variantIndex].template);
  const plan = await mathPath.buildIssuePlan(template);
  assert.equal(plan.issuable, true, `${family.id}#${variantIndex} is issuable`);
  const certification = await secureItems.certifyItem(template, { mode: 'corrections' });
  assert.equal(certification.compatible, true, `${family.id}#${variantIndex} is certified for Corrections`);
  return secureItems.storableItem({
    ...template,
    bankQuestionId: family.id,
    familyId: family.id,
    questionInstanceId: `correction_ct02_${family.id}_${variantIndex}`,
    correctionId: `correction-${family.id}`,
    attemptsAllowed: 3,
    attemptsUsed: 0,
    privateGrading: plan.privateGrading,
    ...plan.toolPayload,
  });
};
/** What the closed correction's response carries (submitTestCycleCorrectionResponse). */
const closedReview = async (stored) => secureExamItems.reviewWithWorkedSteps((await mathPath.buildPrivateSupport(stored)).solutionReview || null, stored);
/** What the steps state, as the Corrections screen sends it: a choice by the id its public item carries. */
const asSent = async (stored, answers) => {
  const { responseFields } = await secureItems.publicItem(stored, { mode: 'corrections' });
  return Object.fromEntries(Object.entries(answers).map(([id, stated]) => {
    const choices = responseFields.find((field) => field.id === id)?.choices || [];
    return [id, choices.length ? choices.find((choice) => choice.label === stated)?.id : stated];
  }));
};

/* ------------------------------------------------------------ 1. every variant */

test('the DOL #2 blueprint\'s Corrections draw on the thirteen bundled families, none with a worked solution of its own', () => {
  const familyIds = dol2.testBlueprint.targets.flatMap((target) => target.familyIds);
  assert.deepEqual(familyIds.sort(), bank.documents.map((family) => family.id).sort());
  for (const family of bank.documents) {
    assert.equal(effectivePathVariants(family).length, 64, family.id);
    assert.ok(effectivePathVariants(family).every((row) => !row.template.solutionReview), `${family.id}: no review of its own`);
  }
  // The district's own copy has no Corrections: an external original is Review, then the Retest.
  assert.ok(dol2.assessmentPolicy.externalAssessment, 'the district copy is an external original');
});

test('every variant, issued as a correction, closes with the builder\'s steps; what they state is marked right by the Corrections grader', async () => {
  let worked = 0;
  for (const family of bank.documents) {
    for (let variantIndex = 0; variantIndex < 64; variantIndex += 1) {
      // eslint-disable-next-line no-await-in-loop
      const stored = await issueCorrection(family, variantIndex);
      const label = `${family.id}#${variantIndex}`;
      // eslint-disable-next-line no-await-in-loop
      assert.equal((await mathPath.buildPrivateSupport(stored)).solutionReview, null, `${label}: no review of its own`);
      const expected = districtDol2SecureWorkedSolution(secureItems.readStoredItem(stored));
      assert.ok(expected, `${label}: the builder works it`);
      // eslint-disable-next-line no-await-in-loop
      const review = await closedReview(stored);
      assert.deepEqual(review, {
        headline: expected.headline, reasoning: expected.steps, commonError: null, connection: null, answerSummary: expected.answerSummary,
      }, `${label}: the steps`);
      // Typed into the correction exactly as stated: right, by the grader that scores a correction.
      // eslint-disable-next-line no-await-in-loop
      const verdict = await secureItems.gradeIssuedItem(stored, { responses: await asSent(stored, expected.answers) });
      assert.equal(verdict.isCorrect, true, `${label}: ${JSON.stringify(verdict.parts)}`);
      // Released whole, and shown as given by the one worked-solution panel.
      assert.deepEqual(secureExam.releasedSolutionOf({ releasedSolution: { answers: [], review } }).review, review, `${label}: released whole`);
      const shown = buildClosedQuestionReview({ question: { solutionReview: review }, legacyContent: () => ({ hasContent: false }) });
      assert.deepEqual(shown.authored.reasoning, expected.steps, `${label}: the panel shows them`);
      worked += 1;
    }
  }
  assert.equal(worked, 13 * 64);
});

/* ------------------------------------------------------------ 2. its own words win */

test('an item\'s own worked solution wins: its steps are kept, and its words are kept beside built steps', async () => {
  const stored = await issueCorrection(bank.documents[1], 5);
  const own = { headline: 'Its own headline.', reasoning: ['Its own step.'], commonError: null, connection: null, answerSummary: 'Its own answer.' };
  assert.equal(await secureExamItems.reviewWithWorkedSteps(own, stored), own, 'its own steps, untouched');
  const wordsOnly = { headline: 'Its own headline.', reasoning: [], commonError: 'Its own common error.', connection: null, answerSummary: null };
  const expected = districtDol2SecureWorkedSolution(secureItems.readStoredItem(stored));
  assert.deepEqual(await secureExamItems.reviewWithWorkedSteps(wordsOnly, stored), {
    headline: 'Its own headline.', reasoning: expected.steps, commonError: 'Its own common error.', connection: null, answerSummary: expected.answerSummary,
  });
});

/* ------------------------------------------------------------ 3. never a wrong step */

test('a key the steps do not reproduce, a tool item, a keyless or unreadable item: the review exactly as it was', async () => {
  const edit = async (familyIndex, change) => {
    const item = copy(secureItems.readStoredItem(await issueCorrection(bank.documents[familyIndex], 7)));
    change(item);
    return secureItems.storableItem(item);
  };
  // Only the private grading disagrees: the builder's field grader is satisfied, the Corrections grader is not.
  const privateKey = await edit(1, (item) => { item.privateGrading.fields.find((field) => field.id === 'constant').expected += 1; });
  assert.ok(districtDol2SecureWorkedSolution(secureItems.readStoredItem(privateKey)), 'the field key alone agrees');
  // The item's own field key disagrees with what is shown.
  const fieldKey = await edit(4, (item) => { item.responseFields.find((field) => field.id === 'a3').expected += 1; });
  const tool = await edit(0, (item) => { item.privateGrading.pathToolId = 'graphFeatureReader'; });
  const keyless = await edit(3, (item) => { delete item.privateGrading; });
  for (const [label, stored] of [['private key', privateKey], ['field key', fieldKey], ['tool item', tool], ['keyless', keyless]]) {
    assert.equal(await secureExamItems.reviewWithWorkedSteps(null, stored), null, label);
    const own = { headline: 'Kept.', reasoning: [], commonError: null, connection: null, answerSummary: null };
    assert.equal(await secureExamItems.reviewWithWorkedSteps(own, stored), own, `${label}: the review as given`);
  }
  for (const value of [null, undefined, {}, 7, 'x', { privateGrading: { fields: [] } }]) {
    assert.equal(await secureExamItems.reviewWithWorkedSteps(null, value), null, JSON.stringify(value));
  }
});

/* ------------------------------------------------------------ 4. only a closed item, through that helper */

test('only a closed correction\'s response carries the steps, built from the item it graded; the issued item never does', () => {
  const source = executableSource(read('functions/index.js'));
  const submit = region(source, 'exports.submitTestCycleCorrectionResponse = onCall(', '\n});');
  // Built from the item just graded, only once it is closed, else nothing.
  assert.match(submit, /const solutionReview = applied\.questionClosed\s*\?\s*await secureExamItems\.reviewWithWorkedSteps\(support\?\.solutionReview \|\| null, openForGrading\)\s*:\s*null;/);
  // And that is the review the response returns.
  const returned = region(submit, '  return {\n    success: true,', '\n  };');
  assert.match(returned, /\n {4}solutionReview,\n/);
  assert.doesNotMatch(returned, /solutionReview: /, 'no other review is returned');
  // The issued item is the public item alone: no review, no steps.
  const issue = region(source, 'exports.issueTestCycleCorrectionQuestion = onCall(', '\n});');
  assert.doesNotMatch(issue, /solutionReview|reviewWithWorkedSteps|releasedWorkedStepsFor|districtDol2/);
});
