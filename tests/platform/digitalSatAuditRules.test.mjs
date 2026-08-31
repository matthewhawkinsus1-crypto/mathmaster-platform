import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { codeOf, isCountOptionSet, isComputational } from '../../scripts/lib/digital-sat-audit-rules.mjs';
import { numericLabel, analyzeAnswerKeyBias } from '../../functions/shared/asvabFidelity.mjs';
import { samplePathInstances } from '../../functions/shared/pathQuestionGeneration.mjs';

const compiled = () => JSON.parse(readFileSync(new URL('../../drafts/digitalSAT.v2.1.json', import.meta.url), 'utf8')).documents;

// Five bugs were found in the certification sweep's own tooling while the sweep
// was running, and three of the fixes narrow what the audit reports. A rule
// that quietly stops reporting is worse than no rule, so each exemption is
// asserted in both directions here: the case it exists for, and the case it
// must still catch.

test('the count-options exemption covers 0,1,2,3 and nothing else', () => {
  // The case it exists for: "how many solutions" has one honest option set.
  assert.equal(isCountOptionSet([0, 1, 2, 3]), true);
  assert.equal(isCountOptionSet([0, 1, 2]), true);

  // The case the ladder rule exists to catch must still be caught.
  assert.equal(isCountOptionSet([11, 12, 13, 14]), false, 'key+1/key+2/key+3 is a ladder');
  assert.equal(isCountOptionSet([-1, 0, 1, 2]), false, 'a run around zero is not a count');
  assert.equal(isCountOptionSet([0, 2, 4, 6]), false, 'a step of two is not a count');
  assert.equal(isCountOptionSet([0, 1, 2, 4]), false, 'a gap is not a count');
  assert.equal(isCountOptionSet([1, 2, 3, 4]), false, 'a count set starts at zero');
  assert.equal(isCountOptionSet([]), false);
});

test('the variant-only exemption covers the shuffle seed and nothing else', () => {
  // The case it exists for: a static item whose only parameter seeds the
  // option shuffle has no mathematics to duplicate.
  assert.equal(isComputational({ generator: { parameters: { variant: { type: 'int', min: 1, max: 4 } } } }), false);
  assert.equal(isComputational({ generator: {} }), false);
  assert.equal(isComputational({}), false);

  // Anything with real parameters is still compared.
  assert.equal(isComputational({ generator: { parameters: { m: { type: 'int' } } } }), true);
  assert.equal(isComputational({ generator: { parameters: { variant: {}, m: {} } } }), true,
    'a real parameter alongside the shuffle seed is still mathematics');
});

test('every family groups under a standard, and native skills do not collapse together', () => {
  const docs = compiled();
  const codes = docs.map(codeOf);
  assert.equal(codes.filter((c) => !c).length, 0, 'every family must carry a grouping key');
  // 71 TEKS codes plus the native SAT skills. Keying on `texas:` alone put all
  // 80 native families in one bucket, which is the bug this asserts against.
  assert.equal(new Set(codes).size, 80);
  const nativeCodes = new Set(docs.filter((d) => d.id.includes('_native_')).map(codeOf));
  assert.ok(nativeCodes.size >= 9, `native families must spread across skills, saw ${nativeCodes.size}`);
  assert.ok(![...nativeCodes].includes(''), 'no native family may fall into the empty bucket');
});

test('the label parser reads the numeric forms the bank actually emits', () => {
  // It returned null for every numeric label at one point, which silently
  // reduced the ladder and fixed-offset checks to LaTeX-labelled families.
  assert.equal(numericLabel(42), 42);
  assert.equal(numericLabel(-7), -7);
  assert.equal(numericLabel('42'), 42);
  assert.equal(numericLabel('$-14$'), -14);
  assert.equal(numericLabel('1,250'), 1250);
  assert.equal(numericLabel('$-\\frac{1}{7}$'), -1 / 7);
  assert.equal(numericLabel('$\\frac{3}{4}$'), 0.75);
  assert.equal(numericLabel('Yes, for every x.'), null);
});

test('the rank analyzer still flags a key that is always the largest', () => {
  const family = {
    id: 'selftest',
    assessmentItemFormat: 'multipleChoice',
    prompt: 'What is ${{a}}\\times{{b}}$?',
    generator: {
      parameters: { a: { type: 'int', min: 5, max: 12 }, b: { type: 'int', min: 5, max: 12 } },
      derived: { ans: 'a*b', d1: 'a+b', d2: 'a', d3: 'b' },
    },
    choices: [
      { id: 'choice-a', label: '{{ans}}' }, { id: 'choice-b', label: '{{d1}}' },
      { id: 'choice-c', label: '{{d2}}' }, { id: 'choice-d', label: '{{d3}}' },
    ],
    responseFields: [{ id: 'answer', inputProfile: 'choice', expected: 'choice-a' }],
  };
  const instances = samplePathInstances(family, 200).map((s) => s.question).filter(Boolean);
  const codes = analyzeAnswerKeyBias(instances).issues.map((i) => i.code);
  assert.ok(codes.includes('answerKeyMagnitudeBias'), `expected a bias finding, saw ${JSON.stringify(codes)}`);
});
