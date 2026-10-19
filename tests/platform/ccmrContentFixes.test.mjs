/*
 * TEST-PREP BANK CONTENT FIXES (job O2).
 *
 * Two Digital SAT keys could be matched by a distractor, and 72 templates
 * printed display faults in their prompts or choices: a coefficient of 1
 * ("1x", "1(x-4)^2", "1\sqrt{8}", "1i"), a zero term ("x + 0"), a
 * floating-point artefact ("102.40000000000002") or a dollar amount that
 * opens a math span it never closes ("$3 dollars").
 *
 * What may change, and only in the 74 templates listed in the fixture of their
 * main versions: the prompt and choice wording, the worked review, NEW derived
 * values and NEW constraints. Everything else in the three banks is pinned to
 * main by digest. No choice id, no response field and no parameter range moves,
 * so a stored attempt keeps its verdict: for every draw a new constraint does not
 * remove, the question has the same parameters, the same choice ids in the same
 * order and the same keyed response as on main.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';
import { splitMathSegments, isMathSegment } from '../../src/components/common/mathSegments.js';
import { DISPLAY_BANS, mathSpans } from './helpers/ccmrSolutionReviewOracle.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

const EXAMS = ['digitalSAT', 'act', 'tsia2'];
const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const PINS = fixture('ccmrContentFixPins.json').digests;
const MAIN = fixture('ccmrContentFixMainTemplates.json').documents;
const BANK = Object.fromEntries(EXAMS.map((exam) => [exam, JSON.parse(readFileSync(new URL(`../../seed/pathQuestionBank/${exam}_pathQuestionBank_seed.json`, import.meta.url), 'utf8')).documents]));
const MIRROR = Object.fromEntries(EXAMS.map((exam) => [exam, JSON.parse(readFileSync(new URL(`../../functions/seeds/pathQuestionBank/${exam}_pathQuestionBank_seed.json`, import.meta.url), 'utf8')).documents]));

const stable = (value) => (Array.isArray(value)
  ? `[${value.map(stable).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
    : JSON.stringify(value));
const digest = (doc) => createHash('sha256').update(stable(doc)).digest('hex');
const changedIds = (exam) => new Set(MAIN[exam].map((doc) => doc.id));
const seeds = (id, count) => Array.from({ length: count }, (unused, index) => `job-o2|${id}|${index}`);

test('everything outside the 74 fixed templates is the content on main', () => {
  for (const exam of EXAMS) {
    const changed = changedIds(exam);
    const now = new Map(BANK[exam].map((doc) => [doc.id, doc]));
    assert.deepEqual([...now.keys()].sort(), Object.keys(PINS[exam]).sort(), `${exam}: same documents as main`);
    for (const [id, pin] of Object.entries(PINS[exam])) {
      if (changed.has(id)) assert.notEqual(digest(now.get(id)), pin, `${exam} ${id} is listed as fixed, so it differs from main`);
      else assert.equal(digest(now.get(id)), pin, `${exam} ${id} is not listed as fixed, so it is main's content`);
    }
    assert.equal(stable(MIRROR[exam]), stable(BANK[exam]), `${exam}: functions/seeds mirrors seed/`);
  }
});

test('a fixed template changes only wording, the review, new derived values and new constraints', () => {
  for (const exam of EXAMS) {
    const now = new Map(BANK[exam].map((doc) => [doc.id, doc]));
    for (const before of MAIN[exam]) {
      const after = now.get(before.id);
      const strip = (doc) => {
        const copy = JSON.parse(JSON.stringify(doc));
        delete copy.prompt;
        delete copy.solutionReview;
        copy.choices = (copy.choices || []).map((choice) => { const rest = { ...choice }; delete rest.label; return rest; });
        if (copy.generator) { delete copy.generator.derived; delete copy.generator.constraints; }
        return copy;
      };
      assert.equal(stable(strip(after)), stable(strip(before)), `${before.id}: ids, response fields and parameters are main's`);
      for (const [name, expression] of Object.entries(before.generator?.derived || {})) {
        assert.equal(after.generator.derived[name], expression, `${before.id}: derived ${name} is main's`);
      }
      const constraints = before.generator?.constraints || [];
      assert.deepEqual((after.generator?.constraints || []).slice(0, constraints.length), constraints, `${before.id}: main's constraints are kept`);
    }
  }
});

test('no stored answer changes meaning: every draw a new constraint keeps is the same question with the same key', () => {
  for (const exam of EXAMS) {
    const now = new Map(BANK[exam].map((doc) => [doc.id, doc]));
    for (const before of MAIN[exam]) {
      const after = now.get(before.id);
      const added = (after.generator?.constraints || []).slice((before.generator?.constraints || []).length);
      for (const seed of seeds(before.id, 200)) {
        const old = generatePathInstance(before, seed);
        const fixed = generatePathInstance(after, seed);
        assert.ok(fixed.question, `${before.id} ${seed}: still issuable`);
        // `parameters` also carries derived values; main's names are the draw.
        const sameDraw = Object.keys(old.parameters || {}).every((name) => old.parameters[name] === fixed.parameters?.[name]);
        if (!sameDraw) {
          // Only a new constraint may move a draw, and only off a draw it rejects.
          assert.ok(added.length, `${before.id} ${seed}: parameters moved without a new constraint`);
          continue;
        }
        assert.deepEqual(fixed.question.choices?.map((choice) => choice.id), old.question.choices?.map((choice) => choice.id), `${before.id} ${seed}: same choice ids, same order`);
        assert.equal(stable(fixed.question.responseFields), stable(old.question.responseFields), `${before.id} ${seed}: same keyed response`);
      }
    }
  }
});

// The two keys a distractor could match. Every combination of the drawn
// parameters is generated with the production generator, then every choice is
// tested as a factor by substituting its zero into the polynomial.
const factorZero = (label) => {
  const match = String(label).replace(/\$/g, '').match(/^x([+-])(\d+)$/);
  return match ? (match[1] === '-' ? 1 : -1) * Number(match[2]) : null;
};
const KEY_FIXES = [
  {
    id: 'mm_sat_A2_7D_factor_from_roots_cubic_v21',
    ranges: { r1: [1, 4], r2: [5, 8], r3: [9, 12] },
    polynomial: ({ r1, r2, r3 }) => (x) => (x - r1) * (x - r2) * (x - r3),
    defective: ({ r1, r2 }) => r1 + 1 === r2,
  },
  {
    id: 'mm_sat_A2_7D_challenge_quartic_factor_structure_v21',
    ranges: { a: [2, 9], b: [2, 8], c: [1, 9] },
    polynomial: ({ a, b, c }) => (x) => (x * x - a * a) * (x * x + b * x + c),
    defective: ({ a, b, c }) => (a + 1) * (a + 1) - b * (a + 1) + c === 0,
  },
];
const combos = (ranges) => Object.entries(ranges).reduce((acc, [name, [lo, hi]]) => acc.flatMap((combo) => Array.from({ length: hi - lo + 1 }, (unused, index) => ({ ...combo, [name]: lo + index }))), [{}]);

for (const fix of KEY_FIXES) {
  test(`${fix.id}: across every draw the key is the only factor, and the production grader agrees`, async () => {
    const template = BANK.digitalSAT.find((doc) => doc.id === fix.id);
    const old = MAIN.digitalSAT.find((doc) => doc.id === fix.id);
    let issued = 0;
    let removed = 0;
    for (const combo of combos(fix.ranges)) {
      const pinned = (doc) => ({
        ...doc,
        generator: {
          ...doc.generator,
          parameters: Object.fromEntries(Object.keys(fix.ranges).map((name) => [name, { type: 'int', min: combo[name], max: combo[name] }])),
        },
      });
      const { question } = generatePathInstance(pinned(template), `combo|${stable(combo)}`);
      if (fix.defective(combo)) {
        // Main issued this draw with two correct choices; the fix never does.
        assert.ok(generatePathInstance(pinned(old), `combo|${stable(combo)}`).question, `${fix.id}: main issued ${stable(combo)}`);
        assert.equal(question, null, `${fix.id}: ${stable(combo)} is no longer issued`);
        removed += 1;
        continue;
      }
      if (!question) continue;
      issued += 1;
      const P = fix.polynomial(combo);
      const keyId = question.responseFields[0].expected;
      for (const choice of question.choices) {
        const zero = factorZero(choice.label);
        assert.notEqual(zero, null, `${fix.id}: ${choice.label} is a linear factor x±k`);
        assert.equal(P(zero) === 0, choice.id === keyId, `${fix.id} ${stable(combo)}: ${choice.label} ${choice.id === keyId ? 'is' : 'is not'} a factor`);
      }
      // The production grader, on the runtime ids a student submits, accepts
      // exactly the one choice that is a factor.
      const plan = await mathPath.buildIssuePlan(question);
      assert.ok(plan.issuable, `${fix.id}: issuable`);
      const issuedChoices = mathPath.buildSanitizedQuestion(question, { questionInstanceId: 'job-o2' }).choices;
      for (const choice of issuedChoices) {
        const result = await mathPath.gradeResponse(plan.privateGrading, { responses: { [question.responseFields[0].id]: choice.id } });
        const isFactor = P(factorZero(choice.label)) === 0;
        assert.equal(Boolean(result.isCorrect), isFactor, `${fix.id} ${stable(combo)}: the grader marks ${choice.label} ${isFactor ? 'right' : 'wrong'}`);
      }
    }
    assert.ok(issued > 0 && removed > 0, `${fix.id}: ${issued} draws checked, ${removed} defective draws removed`);
  });
}

// Display: what a student sees in a prompt or a choice, on every template of
// the three banks. Prose currency ("costs $30 and $24") is prose to the
// renderer, so the check reads the renderer's own math segments.
const FAULTS = DISPLAY_BANS.filter(([, label]) => /coefficient of 1|zero term|floating-point/.test(label));
const displayFaults = (text) => {
  const problems = [];
  const segments = splitMathSegments(text);
  for (const segment of segments) {
    if (!isMathSegment(segment)) {
      if (/\$\s*\d[\d.,]*\s+dollars/.test(segment)) problems.push(`a dollar sign and the word "dollars": "${segment}"`);
      if (FAULTS[2][0].test(segment)) problems.push(`${FAULTS[2][1]}: "${segment}"`);
      continue;
    }
    for (const math of mathSpans(segment).length ? mathSpans(segment) : [segment]) {
      for (const [pattern, label] of FAULTS) if (pattern.test(math)) problems.push(`${label}: "${math}"`);
    }
  }
  return problems;
};

test('no prompt or choice in the three banks shows a coefficient of 1, a zero term, a float artefact or "$N dollars"', () => {
  const failures = [];
  for (const exam of EXAMS) {
    for (const doc of BANK[exam]) {
      for (const seed of seeds(doc.id, 80)) {
        const { question } = generatePathInstance(doc, seed);
        if (!question) continue;
        const texts = [['prompt', question.prompt], ...(question.choices || []).map((choice) => [choice.id, choice.label])];
        const problems = texts.flatMap(([where, text]) => (typeof text === 'string' ? displayFaults(text).map((problem) => `${where}: ${problem}`) : []));
        if (problems.length) { failures.push(`${exam} ${doc.id} ${seed}: ${problems[0]}`); break; }
      }
    }
  }
  assert.deepEqual(failures, [], `${failures.length} template(s)`);
});

test('a fixed template never shows two choices the same way', () => {
  for (const exam of EXAMS) {
    const now = new Map(BANK[exam].map((doc) => [doc.id, doc]));
    for (const { id } of MAIN[exam]) {
      for (const seed of seeds(id, 200)) {
        const { question } = generatePathInstance(now.get(id), seed);
        const labels = (question?.choices || []).map((choice) => String(choice.label).replace(/\s+/g, ''));
        assert.equal(new Set(labels).size, labels.length, `${id} ${seed}: distinct choices ${labels.join(' | ')}`);
      }
    }
  }
});
