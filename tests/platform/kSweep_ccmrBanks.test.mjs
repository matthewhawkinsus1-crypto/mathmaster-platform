import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import Fraction from 'fraction.js';

import { generatePathInstanceWithRetries } from '../../functions/shared/pathQuestionGeneration.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { equivalentOptions, independentKey } from './helpers/kSweepCcmrIndependentKey.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');
const { compilePathRecordForStorage } = require('../../functions/lib/pathFirestoreShape.js');
const { bankDocumentToV5Intent } = require('../../functions/lib/ccmrAssignmentBank.js');

/*
 * JOB K SWEEP — THE CCMR BANKS (ACT, ASVAB, DIGITAL SAT, TSIA2), GRADED THE WAY
 * A STUDENT IS GRADED.
 *
 * One file per framework, read by two products:
 *
 *   - My Math Path. functions/index.js ships functions/seeds/pathQuestionBank;
 *     a release refresh stores compilePathRecordForStorage(item), and
 *     issueNextQuestion draws an instance, plans it with buildIssuePlan,
 *     stores it sanitized and serves it sanitized again (issued: true). The
 *     answer is graded by gradePathToolResponse against the stored private
 *     grading. Modelled here exactly as pathChoiceIdRoundTrip.test.mjs does.
 *   - Assignments. functions/lib/ccmrAssignmentBank.js hydrates an exam-style
 *     question from the same file (ACT, Digital SAT, TSIA2 only: ASVAB has no
 *     authored V2.1 language) through bankDocumentToV5Intent and
 *     compileAuthoringIntentV5; QuestionEngine generates the instance with
 *     generateQuestion and the response is graded by gradeServerResponse.
 *
 * seed/pathQuestionBank holds a byte-identical copy that the audit scripts
 * read; the first test keeps the two in step.
 *
 * Every family is drawn DRAWS times on fixed seeds. For each instance:
 *   - the option served for the key is graded right and every other option
 *     wrong (chosen by label, as a student chooses);
 *   - a student-produced response is graded right in the spellings a student
 *     types (fraction.js decides they are the same number);
 *   - the key is recomputed from the rendered prompt by
 *     helpers/kSweepCcmrIndependentKey.mjs (mathjs, no MathMaster code) where
 *     the stem is one it can read, and no other option may mean the same as
 *     the key.
 *
 * Six ASVAB families could draw a second right answer. Each fix is item data
 * (one generator constraint) and is pinned below by a test that fails on the
 * old data. Two findings whose fix is outside this lane are pinned as `todo`.
 */

const FRAMEWORKS = ['act', 'asvab', 'digitalSAT', 'tsia2'];
const DRAWS = 3;
const seedOf = (draw) => `k-sweep-ccmr-${draw}`;

const readBank = (dir, framework) => readFileSync(new URL(`../../${dir}/${framework}_pathQuestionBank_seed.json`, import.meta.url), 'utf8');
const BANKS = Object.fromEntries(FRAMEWORKS.map((framework) => [framework, JSON.parse(readBank('functions/seeds/pathQuestionBank', framework)).documents]));
const familyById = (framework, id) => BANKS[framework].find((item) => item.id === id);

// issueNextQuestion: the stored item is the sanitized instance plus its
// private grading; the browser gets that stored item sanitized with issued: true.
const issue = async (question) => {
  const plan = await mathPath.buildIssuePlan(question);
  if (!plan?.issuable) return { plan };
  const stored = {
    ...mathPath.buildSanitizedQuestion(question, { questionInstanceId: 'qi-k-sweep', attemptsAllowed: 3, toolPayload: plan.toolPayload }),
    privateGrading: plan.privateGrading,
  };
  const served = mathPath.buildSanitizedQuestion(stored, {
    questionInstanceId: stored.questionInstanceId,
    attemptsAllowed: stored.attemptsAllowed,
    toolPayload: mathPath.storedToolPayload(stored),
    issued: true,
  });
  return { plan, stored, served };
};

const gradePath = async (stored, fieldId, value) => {
  const result = await mathPath.gradePathToolResponse(stored.privateGrading, { responses: { [fieldId]: value } });
  return Boolean(result.fieldResults?.find((entry) => entry.id === String(fieldId))?.isCorrect);
};

const gradeAssignment = (question, fieldId, value) => gradeServerResponse({
  question,
  response: { kind: 'fields', fields: [{ id: fieldId, value }] },
});

const drawPath = (item, draw) => generatePathInstanceWithRetries(
  compilePathRecordForStorage({ ...item, active: item.active !== false }).document,
  seedOf(draw),
  4,
).question;

const choicesOf = (question, field) => (field.choices?.length ? field.choices : question.choices) || [];

/** What a student may type for a number key, each the same number by fraction.js. */
const numberSpellings = (key) => {
  const value = new Fraction(String(key));
  const sign = value.s < 0 ? '-' : '';
  const spellings = [String(key), ` ${key} `];
  if (value.s > 0 && value.n !== 0) spellings.push(`+${key}`);
  if (Number(value.d) === 1) spellings.push(`${value.toString()}.0`);
  else {
    spellings.push(`${sign}${value.n}/${value.d}`, `${sign}\\frac{${value.n}}{${value.d}}`, `${sign}${2n * BigInt(value.n)}/${2n * BigInt(value.d)}`);
    if (!value.toString().includes('(')) spellings.push(value.toString());
  }
  return spellings.filter((spelling) => new Fraction(spelling.trim().replace(/^\+/, '').replace(/\\frac\{(\d+)\}\{(\d+)\}/, '$1/$2')).equals(value));
};

const pairSpellings = (key) => {
  const [x, y] = String(key).replace(/^\(|\)$/g, '').split(',').map((part) => part.trim());
  return [String(key), `(${x}, ${y})`, `\\left(${x},${y}\\right)`, ` ( ${x} , ${y} ) `];
};

// The assignment hydration lower-cases the profile ('orderedpair').
const openSpellings = (field, key) => (String(field.inputProfile).toLowerCase() === 'orderedpair' ? pairSpellings(key) : numberSpellings(key));

// The options the independent reader finds equal to the key, where the prompt
// itself asks for one form of that value. Recorded and reviewed, not hidden:
// each named option is a wrong FORM of the right value.
const FORM_DEMANDED = new Map([
  ['mm_asvab_mk_6_7A_prime_factorization_of_a_number', 'prime factorization: 2 × 2 × 3 × 1 × 11 multiplies to the number but 1 is not prime'],
  ['mm_asvab_mk_A2_7F_divide_a_quadratic_fraction', '"in its simplest form": the uncancelled quotient is equal but not simplest'],
  ['mm_asvab_mk_8_2C_product_in_scientific_notation', '"in scientific notation": 64 × 10^14 is equal but not scientific notation'],
]);

test('the shipped CCMR seeds and the seed/ copies the audits read are the same bytes', () => {
  for (const framework of FRAMEWORKS) {
    assert.equal(readBank('seed/pathQuestionBank', framework), readBank('functions/seeds/pathQuestionBank', framework), `${framework} copies differ`);
  }
});

test('My Math Path: every CCMR family, issued and served as a student meets it, grades its key right and only its key', async (t) => {
  const failures = [];
  const counts = { families: 0, instances: 0, optionsGraded: 0, spellingsGraded: 0 };
  for (const framework of FRAMEWORKS) {
    for (const item of BANKS[framework]) {
      if (item.active === false) continue;
      counts.families += 1;
      for (let draw = 0; draw < DRAWS; draw += 1) {
        const where = `${framework} ${item.id} ${seedOf(draw)}`;
        const question = drawPath(item, draw);
        if (!question) { failures.push(`${where}: no instance`); continue; }
        // eslint-disable-next-line no-await-in-loop
        const { plan, stored, served } = await issue(question);
        if (!plan.issuable) { failures.push(`${where}: not issuable (${plan.reason})`); continue; }
        counts.instances += 1;
        for (const field of question.responseFields) {
          if (field.inputProfile === 'choice') {
            const authored = choicesOf(question, field);
            // Some generated labels are numbers; the served label is what a student reads.
            const keyLabel = String(authored.find((choice) => choice.id === field.expected)?.label);
            const servedField = served.responseFields.find((entry) => entry.id === field.id);
            const servedChoices = choicesOf(served, servedField);
            if (servedChoices.filter((choice) => String(choice.label) === keyLabel).length !== 1) {
              failures.push(`${where}: key label ${JSON.stringify(keyLabel)} is not one served option`);
              continue;
            }
            for (const choice of servedChoices) {
              counts.optionsGraded += 1;
              // eslint-disable-next-line no-await-in-loop
              const verdict = await gradePath(stored, field.id, choice.id);
              if (verdict !== (String(choice.label) === keyLabel)) failures.push(`${where}: option ${JSON.stringify(choice.label)} graded ${verdict}`);
            }
            continue;
          }
          for (const spelling of openSpellings(field, field.expected)) {
            counts.spellingsGraded += 1;
            // eslint-disable-next-line no-await-in-loop
            if (!(await gradePath(stored, field.id, spelling))) failures.push(`${where}: ${JSON.stringify(spelling)} for key ${JSON.stringify(field.expected)} graded wrong`);
          }
        }
      }
    }
  }
  t.diagnostic(`path sweep: ${JSON.stringify(counts)}`);
  assert.ok(counts.families >= 2176, `only ${counts.families} families swept`);
  assert.deepEqual(failures, []);
});

test('Assignments: every hydrated CCMR family, generated as QuestionEngine generates it, grades its key right and only its key', (t) => {
  const failures = [];
  const counts = { families: 0, instances: 0, optionsGraded: 0, spellingsGraded: 0 };
  for (const framework of FRAMEWORKS) {
    // loadFrameworkBank's own filter: exam-style, this framework, authored V2.1.
    const documents = BANKS[framework].filter((item) => item.active !== false
      && item.assessmentContext?.examStyle === true
      && item.assessmentContext?.framework === framework
      && item.ccmrAuthenticLanguage?.authored === true);
    if (!documents.length) continue;
    const compiled = compileAuthoringIntentV5({
      schemaVersion: 5,
      assignment: { title: `K sweep ${framework}`, courseId: 'algebra1', instructionalPurpose: 'review', gradingPurpose: 'practice' },
      sections: [{ role: 'practice', title: 'Practice', questions: documents.map((item) => bankDocumentToV5Intent(item)) }],
    }).package.sections[0].questions;
    assert.equal(compiled.length, documents.length, `${framework}: every family compiles to one question`);
    compiled.forEach((template, index) => {
      counts.families += 1;
      for (let draw = 0; draw < DRAWS; draw += 1) {
        const where = `${framework} ${documents[index].id} ${seedOf(draw)}`;
        const question = generateQuestion(template, `${seedOf(draw)}|${documents[index].id}`);
        if (question?.type !== 'multiAnswer') { failures.push(`${where}: generated ${question?.type}`); continue; }
        counts.instances += 1;
        for (const field of question.answerFields) {
          if (field.inputProfile === 'choice') {
            if (field.options.filter((option) => option === field.answer).length !== 1) failures.push(`${where}: key is not one option`);
            for (const option of field.options) {
              counts.optionsGraded += 1;
              const verdict = gradeAssignment(question, field.id, option);
              if (verdict.isCorrect !== (option === field.answer)) failures.push(`${where}: option ${JSON.stringify(option)} graded ${verdict.isCorrect} (${verdict.reason || 'graded'})`);
            }
            continue;
          }
          for (const spelling of openSpellings(field, field.answer)) {
            counts.spellingsGraded += 1;
            const verdict = gradeAssignment(question, field.id, spelling);
            if (!verdict.isCorrect) failures.push(`${where}: ${JSON.stringify(spelling)} for key ${JSON.stringify(field.answer)} graded wrong (${verdict.reason || 'graded'})`);
          }
        }
      }
    });
  }
  t.diagnostic(`assignment sweep: ${JSON.stringify(counts)}`);
  assert.ok(counts.families >= 1000, `only ${counts.families} hydrated families swept`);
  assert.deepEqual(failures, []);
});

test('every key agrees with the prompt read independently, and no other option means the same as the key', (t) => {
  const failures = [];
  const formDemanded = new Set();
  const counts = { instances: 0, keyRecomputed: 0, optionSetsCompared: 0 };
  const recomputedFamilies = new Set();
  for (const framework of FRAMEWORKS) {
    for (const item of BANKS[framework]) {
      if (item.active === false) continue;
      for (let draw = 0; draw < DRAWS; draw += 1) {
        const question = drawPath(item, draw);
        const field = question.responseFields[0];
        const where = `${framework} ${item.id} ${seedOf(draw)}`;
        counts.instances += 1;
        let labels = [String(field.expected)];
        let keyIndex = 0;
        if (field.inputProfile === 'choice') {
          const choices = choicesOf(question, field);
          labels = choices.map((choice) => choice.label);
          keyIndex = choices.findIndex((choice) => choice.id === field.expected);
          const { kind, equivalent } = equivalentOptions(labels, keyIndex);
          if (kind) counts.optionSetsCompared += 1;
          if (equivalent.length && FORM_DEMANDED.has(item.id)) formDemanded.add(item.id);
          else if (equivalent.length) failures.push(`${where}: ${equivalent.map((index) => JSON.stringify(labels[index])).join(', ')} means the same as the key ${JSON.stringify(labels[keyIndex])} — "${question.prompt}"`);
        }
        const recomputed = independentKey(question.prompt, labels);
        if (!recomputed) continue;
        counts.keyRecomputed += 1;
        recomputedFamilies.add(item.id);
        if (recomputed.expected.length !== 1 || recomputed.expected[0] !== keyIndex) {
          failures.push(`${where}: ${recomputed.solver} finds option(s) [${recomputed.expected}] right, key is ${keyIndex} — "${question.prompt}" ${JSON.stringify(labels)}`);
        }
      }
    }
  }
  t.diagnostic(`independent check: ${JSON.stringify({ ...counts, familiesWithKeyRecomputed: recomputedFamilies.size, formDemanded: [...formDemanded] })}`);
  // A reader that silently stopped reading would pass; it must still cover
  // what it covered when this was written.
  assert.ok(recomputedFamilies.size >= 140, `key recomputed for only ${recomputedFamilies.size} families`);
  assert.ok(counts.optionSetsCompared >= 3800, `only ${counts.optionSetsCompared} option sets compared`);
  assert.deepEqual(failures, []);
});

/*
 * THE SIX ASVAB FAMILIES THAT COULD DRAW A SECOND RIGHT ANSWER.
 *
 * Each distractor is a misconception, but for some draws the misconception
 * lands on the right answer. The added generator constraint removes exactly
 * those draws (constraints reject; every other draw keeps its numbers). Checked
 * exhaustively over each family's whole parameter grid when the fix was made;
 * here, 400 seeded draws per family through the production generator, each
 * read independently. On the old data every family below produces at least
 * one draw with a second right answer.
 */
const SECOND_RIGHT_ANSWER = [
  // y = mx + p into ax + by = c: "ax + bmx + bp = bp" IS the substituted equation when c = bp.
  'mm_asvab_mk_A_5C_the_equation_substitution_leaves',
  // The swapped-fee equation has the same solution when |rate gap| = |fee gap|;
  // the summed equation does when rateA/feeA = rateB/feeB.
  'mm_asvab_ar_8_8B_which_equation_balances',
  'mm_asvab_mk_8_8A_equation_for_two_plans_meeting',
  // ab/2d = (a+b)/d when ab = 2(a+b): 4/5 + 4/5 offered 16/10 beside 8/5.
  'mm_asvab_mk_7_3A_sum_of_two_fractions',
  // y + y1 = m(x + x1) is the same line when the line passes through the origin.
  'mm_asvab_mk_A_2B_point_slope_form',
  // a + bc = ab + ac = a(b + c) for a = 2, b = 3, c = 4 and others.
  'mm_asvab_mk_6_7A_expression_with_the_same_value',
];

test('the six ASVAB families never draw a distractor that is also right', () => {
  for (const id of SECOND_RIGHT_ANSWER) {
    const item = familyById('asvab', id);
    assert.ok(item, `${id} is in the ASVAB bank`);
    const doubled = [];
    for (let draw = 0; draw < 400; draw += 1) {
      const question = generatePathInstanceWithRetries(compilePathRecordForStorage(item).document, `k-sweep-ccmr-second-right-${draw}`, 4).question;
      const field = question.responseFields[0];
      const labels = question.choices.map((choice) => choice.label);
      const keyIndex = question.choices.findIndex((choice) => choice.id === field.expected);
      // The expression family's value is in its stimulus, not its prompt.
      const { equivalent } = equivalentOptions(labels, keyIndex);
      const recomputed = independentKey(question.prompt, labels);
      if (equivalent.length || (recomputed && recomputed.expected.length !== 1)) doubled.push(`${question.prompt} ${JSON.stringify(labels)}`);
    }
    assert.deepEqual(doubled, [], `${id} drew a second right answer`);
  }
});

/*
 * DIGITAL SAT "union-overlap" probability: the decimal the SAT accepts.
 *
 * The only student-produced response in the CCMR banks whose key is not an
 * integer. The Digital SAT's directions for a student-produced response accept
 * a decimal that does not fit, truncated or rounded at the fourth digit (2/3 as
 * .6666 or .6667). The Path grades 57/73 right and .7808 wrong.
 *
 * The fix is item data, but not in this lane's files: the Digital SAT mirrors
 * are regenerated at predeploy from drafts/ccmr-v2.1/digitalSAT
 * (scripts/build-ccmr-v2-1-production-release.mjs --write, pinned by
 * ccmrV21ProductionReleaseContent.test.mjs), so an edit to the mirror alone
 * would be overwritten. Reported with the patch: list both four-place decimals
 * as accepted answers. Then .78 and the other neighbour .7809 stay wrong.
 */
test('Digital SAT union-overlap accepts the four-place decimal the SAT accepts, on the Path', { skip: 'source fix in drafts/ccmr-v2.1/digitalSAT reported; the mirrors are regenerated from it' }, async () => {
  const item = familyById('digitalSAT', 'mm_sat_native_prob_ch1_union-overlap_v21');
  for (let draw = 0; draw < 12; draw += 1) {
    const question = drawPath(item, draw);
    const { stored } = await issue(question);
    const key = new Fraction(question.responseFields[0].expected);
    // Fraction.js, to four places: floor for the truncation, round for the rounding.
    const truncated = key.mul(10000).floor().div(10000);
    const rounded = key.mul(10000).round().div(10000);
    const shown = (fraction) => fraction.valueOf().toFixed(4);
    for (const accepted of new Set([shown(truncated), shown(truncated).replace(/^0/, ''), shown(rounded), shown(rounded).replace(/^0/, '')])) {
      // eslint-disable-next-line no-await-in-loop
      assert.equal(await gradePath(stored, 'answer', accepted), true, `${question.prompt} → ${accepted}`);
    }
    // Not every decimal near the key: a two-place rounding and a four-place
    // neighbour that is neither truncation nor rounding stay wrong.
    const neighbour = truncated.equals(rounded) ? truncated.add(new Fraction(1, 10000)) : rounded.add(new Fraction(1, 10000));
    // eslint-disable-next-line no-await-in-loop
    assert.equal(await gradePath(stored, 'answer', shown(neighbour)), false, `${shown(neighbour)} is not the SAT decimal of ${key.toFraction()}`);
    const coarse = key.valueOf().toFixed(2);
    // eslint-disable-next-line no-await-in-loop
    if (!new Fraction(coarse).equals(key)) assert.equal(await gradePath(stored, 'answer', coarse), false, `${coarse} is too coarse for ${key.toFraction()}`);
  }
});

// Outside this lane (reported): the assignment hydration keeps only `answer`
// for an open field (ccmrAssignmentBank responseFieldToIntent), so the decimal
// is still wrong in an assignment, and the V5 compiler reads the template key
// '{{a}}' as set notation, so every Digital SAT student-produced response opens
// the set keypad with '{', '}' and 'a' marked as required symbols.
test('Assignments: a Digital SAT student-produced response is a number box, not a set box', { skip: 'compiler fieldFromIntent reads "{{a}}" as a set; reported to the compiler owner' }, () => {
  const item = familyById('digitalSAT', 'mm_sat_A_10C_4_quotient-parameter_v21');
  const template = compileAuthoringIntentV5({
    schemaVersion: 5,
    assignment: { title: 'K sweep SPR', courseId: 'algebra1', instructionalPurpose: 'review', gradingPurpose: 'practice' },
    sections: [{ role: 'practice', title: 'Practice', questions: [bankDocumentToV5Intent(item)] }],
  }).package.sections[0].questions[0];
  const field = generateQuestion(template, 'k-sweep-ccmr-spr').answerFields[0];
  assert.notEqual(field.type, 'set');
  assert.deepEqual(field.requiredSymbols ?? [], []);
});
