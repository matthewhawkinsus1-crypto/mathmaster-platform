/*
 * THE TWO A2.7G HONORS LESSONS MEET DIFFERENT SAT ITEMS, AND EVERY AUDITED ITEM HAS A VERSION FOR EACH OF 32 STUDENTS (CT18).
 *
 * Radical Expressions and Rational Exponents (Algebra II Honors, Radicals) are both on TEKS A2.7G, and
 * both put two audited Digital SAT items in Practice. They put the same two: a student who took both
 * lessons met the same two items twice. The bank holds three A2.7G items a lesson can use (the others
 * choose among LaTeX options, which a lesson's one-try choice cannot carry); one of them, the radical
 * exponent item, had 21 versions, too few to give a class of 32 a version each, so no lesson used it.
 * It now has 40 (k up to 9, j up to 4; every old version is still dealt), and Rational Exponents uses
 * it in place of the quotient item. The two lessons now share one item, not two.
 *
 * This holds that:
 *   - the two lessons share at most one audited item (the bank has no fourth clean A2.7G item);
 *   - every audited item of the five Honors lessons gives each of 32 students a different version;
 *   - the widened item is right at every one of its versions: the keyed n is the one that makes the
 *     two sides equal (found by taking logarithms of the sides the student READS, not from the
 *     generator's formula), the other three are not, and every version the old ranges dealt is kept;
 *   - the lesson's own reasons, worked solution and options agree with each version's numbers.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { compileTeacherImport } from '../../scripts/check-teacher-import.mjs';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';
import { buildFamilyQuestion, cachedFamilyInstanceSequence } from '../../functions/shared/questionFamilyEngine.mjs';
import { buildTemplateFamily } from '../../functions/shared/questionFamilyTemplate.mjs';
import { optionRationale } from '../../src/platform/supports/feedback/oneTryChoice.js';

const read = (relPath) => readFileSync(new URL(`../../${relPath}`, import.meta.url), 'utf8');
const STEMS = ['1_Factoring_Polynomials', '2_Remainder_and_Factor_Theorems', '3_Radical_Expressions', '4_Rational_Exponents', '5_Solving_Radical_Equations'];
const LESSONS = Object.fromEntries(STEMS.map((stem) => [stem, compileTeacherImport(read(`teacher-import-jsons/algebra2-polynomials-radicals-honors/${stem}_Honors.json`)).questions]));
const auditedOf = (stem) => LESSONS[stem].filter((question) => question.ccmrSource);

const EXPONENT_ITEM = 'mm_sat_A2_7G_challenge_3_radical-exponent-parameter_v21';
const bankDoc = JSON.parse(read('seed/pathQuestionBank/digitalSAT_pathQuestionBank_seed.json')).documents.find((doc) => doc.id === EXPONENT_ITEM);
// The item as it was before CT18 widened it: the ranges that dealt 21 versions.
const baseDoc = JSON.parse(read('tests/platform/fixtures/testPrepDisplayLeftoverMainTemplates.json')).documents.digitalSAT.find((doc) => doc.id === EXPONENT_ITEM);

/** The versions a class meets, in the order the server deals them. */
const versionsOf = (question, count) => {
  const family = buildTemplateFamily(question, { slotKey: question.questionId });
  const sequence = cachedFamilyInstanceSequence(family, {}, `ct18|${question.questionId}`);
  const versions = [];
  for (let index = 0; index < count; index += 1) {
    const instance = sequence.instanceAt(index);
    if (!instance) break;
    versions.push(buildFamilyQuestion({ family, instance, constraintValues: {}, authored: question, tool: family.defaultTool }));
  }
  return versions;
};

/** Every (k, j) a bank document's ranges allow, with the question it deals. */
const everyVersion = (doc) => {
  const { k, j } = doc.generator.parameters;
  const dealt = [];
  for (let kv = k.min; kv <= k.max; kv += 1) {
    for (let jv = j.min; jv <= j.max; jv += 1) {
      const pinned = { ...doc, generator: { ...doc.generator, parameters: { ...doc.generator.parameters, k: { type: 'choice', values: [kv] }, j: { type: 'choice', values: [jv] } } } };
      const { question } = generatePathInstance(pinned, `ct18-every|${kv}|${jv}`);
      if (question) dealt.push({ k: kv, j: jv, question });
    }
  }
  return dealt;
};

test('the Radical Expressions and Rational Exponents lessons, both on A2.7G, share at most one audited SAT item', () => {
  const ids = (stem) => new Set(auditedOf(stem).map((question) => question.ccmrSource.documentId));
  const radicals = ids('3_Radical_Expressions');
  const exponents = ids('4_Rational_Exponents');
  assert.equal(radicals.size, 2);
  assert.equal(exponents.size, 2);
  const shared = [...radicals].filter((id) => exponents.has(id));
  assert.ok(shared.length <= 1, `a student who takes both lessons meets ${shared.join(' and ')} twice`);
});

test('every audited SAT item of the five Honors lessons gives each of 32 students a different version', () => {
  let checked = 0;
  for (const stem of STEMS) {
    for (const question of auditedOf(stem)) {
      const versions = versionsOf(question, 32);
      assert.equal(versions.length, 32, `${stem} ${question.questionId} (${question.ccmrSource.documentId}) deals only ${versions.length} versions`);
      const shown = new Set(versions.map((version) => JSON.stringify([version.prompt, version.answerFields.map((field) => [field.options, field.answer])])));
      assert.equal(shown.size, 32, `${stem} ${question.questionId}: two of 32 students see the same question`);
      checked += 1;
    }
  }
  assert.equal(checked, 10, 'two audited items in each of the five lessons');
});

test('the radical-exponent item is right at every version: the keyed n makes the two sides equal, the others do not, and no old version is lost', () => {
  const versions = everyVersion(bankDoc);
  assert.ok(versions.length >= 32, `${versions.length} versions: fewer than a class of 32`);
  const READ = /\\sqrt\{x\^n\}=x(?:\^(\d+))?\\sqrt\{x(?:\^(\d+))?\}/;
  for (const { k, j, question } of versions) {
    // What the student reads: sqrt(x^n) = x^a * sqrt(x^b), with a bare x meaning an exponent of 1 and never "x^1".
    const read = READ.exec(question.prompt);
    assert.ok(read, `the sides are readable in: ${question.prompt}`);
    assert.ok(!/\^\{?\s*1\s*\}?(?!\d)/.test(question.prompt), `no exponent of 1 in: ${question.prompt}`);
    const outside = read[1] ? Number(read[1]) : 1;
    const under = read[2] ? Number(read[2]) : 1;
    assert.equal(outside, k, `the prompt shows the outside exponent ${k}`);
    assert.equal(under, 2 * j + 1, `the prompt shows the exponent under the root, ${2 * j + 1}`);
    const right = (x) => x ** outside * Math.sqrt(x ** under);
    const holds = (n) => [2, 3, 5].every((x) => Math.abs(Math.sqrt(x ** n) - right(x)) <= 1e-9 * right(x));
    const labels = question.choices.map((choice) => Number(choice.label));
    assert.equal(new Set(labels).size, 4, `four different options: ${labels}`);
    labels.forEach((label) => assert.ok(Number.isInteger(label) && label > 0, `option ${label} is a positive integer`));
    const keyed = Number(question.choices.find((choice) => choice.id === question.responseFields[0].expected).label);
    assert.ok(holds(keyed), `the keyed ${keyed} makes the sides equal in: ${question.prompt}`);
    assert.deepEqual(labels.filter(holds), [keyed], `no other option makes the sides equal in: ${question.prompt}`);
  }
  // Every version the old ranges dealt is still dealt, with the same question and key.
  const now = new Map(versions.map((entry) => [`${entry.k},${entry.j}`, entry]));
  const before = everyVersion(baseDoc);
  assert.equal(before.length, 21, 'the old ranges dealt 21 versions');
  for (const old of before) {
    const kept = now.get(`${old.k},${old.j}`);
    assert.ok(kept, `version k=${old.k}, j=${old.j} is still dealt`);
    // (CT14 wrote the prompt without "x^1" since the base commit, so the words are not compared: the numbers are.)
    const labelOf = (entry) => entry.question.choices.find((choice) => choice.id === entry.question.responseFields[0].expected).label;
    const optionsOf = (entry) => entry.question.choices.map((choice) => choice.label).sort();
    assert.equal(labelOf(kept), labelOf(old), `k=${old.k}, j=${old.j}: the same key`);
    assert.deepEqual(optionsOf(kept), optionsOf(old), `k=${old.k}, j=${old.j}: the same four options`);
  }
});

test('the Rational Exponents lesson\'s copy of the item: its reason for each option, its worked solution and its options agree with each version\'s numbers', () => {
  const question = LESSONS['4_Rational_Exponents'].find((candidate) => candidate.ccmrSource?.documentId === EXPONENT_ITEM);
  assert.ok(question, 'the lesson uses the radical-exponent item');
  assert.equal(question.familyVersion, bankDoc.familyVersion, 'it is the bank\'s current version');
  const versions = versionsOf(question, 40);
  assert.ok(versions.length >= 32);
  // A whole number: not part of a longer one or of a decimal, but a full stop after it ends a sentence.
  const tokenOf = (number) => new RegExp(`(?<![\\d.])${number}(?!\\d|\\.\\d)`);
  for (const version of versions) {
    const [field] = version.answerFields;
    const prompt = /x(?:\^(\d+))?\\sqrt\{x(?:\^(\d+))?\}/.exec(version.prompt);
    const k = prompt[1] ? Number(prompt[1]) : 1;
    const m = prompt[2] ? Number(prompt[2]) : 1;
    const n = 2 * k + m;
    assert.equal(Number(field.answer), n, `${version.prompt}: the key`);
    assert.deepEqual([...field.options].map(Number).sort((a, b) => a - b), [k + m, 2 * k + m, 2 * m + k, 2 * k + 2 * m].sort((a, b) => a - b), 'the four options');
    // The worked solution is plain text and its arithmetic is this version's.
    const review = version.solutionReview;
    assert.ok(!/[$\\]/.test(JSON.stringify(review)), 'plain math text');
    assert.ok(!/\^1(?!\d)/.test(JSON.stringify(review)), `no "x^1" in ${JSON.stringify(review)}`);
    const sum = /n = 2·(\d+) \+ (\d+) = (\d+)/.exec(review.reasoning.join(' '));
    assert.ok(sum, `the worked solution states n = 2·k + m: ${review.reasoning.join(' ')}`);
    assert.deepEqual(sum.slice(1).map(Number), [k, m, n], 'the worked solution uses this version\'s k and m and reaches n');
    assert.equal(Number(review.answerSummary), n);
    // Each option has a reason, and each reason is the one for that option.
    const reasonOf = (option) => optionRationale(field, option);
    field.options.forEach((option) => assert.ok(reasonOf(option), `${version.prompt}: option ${option} has a reason`));
    assert.ok(tokenOf(n).test(reasonOf(n)), 'the key\'s reason reaches n');
    field.options.filter((option) => Number(option) !== n).forEach((option) => {
      const reason = reasonOf(option);
      assert.ok(!tokenOf(n).test(reason), `the reason for ${option} states the answer ${n}: ${reason}`);
      assert.ok(reason.startsWith(`${option} `), `the reason for ${option} is about ${option}: ${reason}`);
    });
    assert.match(reasonOf(k + m), new RegExp(`^${k + m} = ${k} \\+ ${m} adds`), 'the reason for k + m says it adds without squaring');
    assert.match(reasonOf(2 * k + 2 * m), /^\d+ doubles both exponents/);
    assert.match(reasonOf(2 * m + k), new RegExp(`^${2 * m + k} doubles the ${m} under the root`));
    assert.doesNotMatch(JSON.stringify(field.optionRationales), /\{\{|\}\}/, 'every placeholder is filled');
  }
});
