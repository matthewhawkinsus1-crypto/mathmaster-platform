// Algebra II Rational Exponents: three answer keys were written B^(E)/N
// ("x^(1/3)/x"), which the platform draws as x to the power (1/3)/x (GR04
// decided that reading, and Pre-Flight's "Answer keys to check" flagged them).
// The lesson meant x^(1/3) over x, and its grader (simplestRadicalForm) read
// it that way, so only the drawing was wrong. They are now written
// (x^(1/3))/x. This pins that the rewrite changed no verdict and no miss
// reason, for both static keys and every version the DOL generator can make.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import '../../functions/shared/formSpecificFieldGrading.mjs';
import { matchesFieldAnswer } from '../../functions/shared/answerUtils.mjs';
import { radicalFormMiss } from '../../functions/shared/simplestRadicalFormEquivalence.mjs';
import { ambiguousPowerOverDivisor } from '../../src/platform/preflight/answerKeyPreflight.js';

const LESSON = JSON.parse(readFileSync(new URL('../../teacher-import-jsons/algebra2-polynomials-radicals/4_Rational_Exponents.json', import.meta.url), 'utf8'));
const question = (id) => LESSON.sections.flatMap((section) => section.questions).find((candidate) => candidate.questionId === id);
const key = (id, responseId) => question(id).responses.find((response) => response.id === responseId).answer;

// The keys as they were, beside where they are now.
const REWRITTEN = [
  { id: 're-cw-6', response: 'negative', before: 'x^(1/3)/x' },
  { id: 're-p-6', response: 'negative', before: 'y^(1/4)/y' },
  { id: 're-dol-2', response: 'simplified', before: '{{k|coef}}x^({{b}}/{{n}})/x' },
];

const field = (answer) => ({ answer, gradingMode: 'simplestRadicalForm', inputProfile: 'expression' });
const coef = (k) => (Math.abs(k) === 1 ? (k < 0 ? '-' : '') : String(k));
const fill = (template, values) => template.replace(/\{\{(\w+)(\|coef)?\}\}/g, (_, name, filter) => (filter ? coef(values[name]) : String(values[name])));

// A student's answers to "k·x^(−a/n) simplified": the key's value written every
// way the math field and the keyboard give it, its unsimplified forms, and
// near misses.
const answersFor = ({ k, b, n, v = 'x' }) => {
  const K = coef(k);
  const a = n - b;
  return [
    `${K}${v}^(${b}/${n})/${v}`, `(${K}${v}^(${b}/${n}))/${v}`, `${K}(${v}^(${b}/${n}))/${v}`, `\\frac{${K}${v}^{\\frac{${b}}{${n}}}}{${v}}`,
    `\\frac{${K}${v}^{${b}/${n}}}{${v}}`, `${K}${v}^{\\frac{${b}}{${n}}}/${v}`, `${K}${v}^(-${a}/${n})`, `${K}${v}^{-\\frac{${a}}{${n}}}`,
    `${K}/${v}^(${a}/${n})`, `\\frac{${k}}{${v}^{\\frac{${a}}{${n}}}}`, `${K}${v}^(${b}/${n})`, `${K}${v}`, `${K}${v}^(${a}/${n})/${v}`,
    `\\frac{${K}\\sqrt[${n}]{${v}${b > 1 ? `^${b}` : ''}}}{${v}}`, `${k + 1}${v}^(${b}/${n})/${v}`, `${K}${v}^(${2 * b}/${2 * n})/${v}`,
    `-${K}${v}^(${b}/${n})/${v}`, `${K}${v}^(${b}/${n})/${v}^2`, `${K}${v}^(${b}/${n}) / ${v}`, `(${K}${v}^(${b}/${n}))/(${v})`,
  ];
};

const gcd = (x, y) => (y ? gcd(y, x % y) : x);
const dolVersions = () => {
  const { parameters } = question('re-dol-2').generator;
  const versions = [];
  for (const n of parameters.n.values) {
    for (let a = parameters.a.min; a <= parameters.a.max; a += 1) {
      for (let k = parameters.k.min; k <= parameters.k.max; k += 1) {
        if (a < n && gcd(a, n) === 1) versions.push({ k, b: n - a, n });
      }
    }
  }
  return versions;
};

test('the lesson keys are no longer written B^(E)/N, and nothing in Pre-Flight flags them', () => {
  for (const { id, response, before } of REWRITTEN) {
    const now = key(id, response);
    assert.notEqual(now, before, `${id} still has ${before}`);
    assert.ok(ambiguousPowerOverDivisor(before), `${before} was the ambiguous shape`);
    assert.equal(ambiguousPowerOverDivisor(now), null, `${id}: ${now}`);
  }
});

test('each rewritten key grades every answer exactly as the key it replaced', () => {
  const cases = [
    { before: 'x^(1/3)/x', now: key('re-cw-6', 'negative'), values: { k: 1, b: 1, n: 3 } },
    { before: 'y^(1/4)/y', now: key('re-p-6', 'negative'), values: { k: 1, b: 1, n: 4, v: 'y' } },
    ...dolVersions().map((values) => ({ before: fill(REWRITTEN[2].before, values), now: fill(key('re-dol-2', 'simplified'), values), values })),
  ];
  assert.ok(cases.length >= 90, `${cases.length} keys`);
  let compared = 0;
  for (const { before, now, values } of cases) {
    assert.equal(matchesFieldAnswer(before, field(now)), true, `${now} takes the old key's own form`);
    for (const answer of answersFor(values)) {
      assert.deepEqual(
        [matchesFieldAnswer(answer, field(now)), radicalFormMiss(answer, now)],
        [matchesFieldAnswer(answer, field(before)), radicalFormMiss(answer, before)],
        `${answer} against ${now} (was ${before})`,
      );
      compared += 1;
    }
  }
  assert.ok(compared > 1500, `${compared} answers compared`);
});
