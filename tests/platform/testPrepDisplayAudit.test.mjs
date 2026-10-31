/*
 * THE TEST-PREP DISPLAY AUDIT READS THE FORMS CT14 AND A2-109 NAME (CT12).
 *
 * scripts/audit-testprep-display-leftovers.mjs counts, over every draw of every
 * Digital SAT, ACT and TSIA2 template, an exponent of 1 ("x^{ 1 }"), a
 * denominator of 1 ("\frac{\sqrt{11}}{1}", "-7/1"), a factor that collapsed to
 * "(x)", the O2 classes in the surfaces O2's test does not read, and a plural unit
 * after 1 ("1 millimeters"). These tests pin what each detector reads and what it
 * leaves alone, on written strings, and that the scan reports a template where it
 * is and not where it is not. They hold no count of the real bank: the bank is
 * being repaired, and the count is the audit's to give.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  DISPLAY_CLASSES,
  findCollapsedFactors,
  findDisplayProblems,
  fractionsIn,
  scanBank,
  surfacesOf,
} from '../../scripts/lib/testPrepDisplayAudit.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const classesIn = (text) => Object.keys(findDisplayProblems(text)).sort();
const read = (relPath) => readFileSync(new URL(`../../${relPath}`, import.meta.url), 'utf8');

test('the audit knows the classes it counts, and which are judgement calls', () => {
  assert.deepEqual(DISPLAY_CLASSES.map((entry) => entry.id), [
    'exponentOne', 'denominatorOne', 'collapsedFactor', 'constantCondition',
    'coefficientOne', 'zeroTerm', 'doubledSign', 'floatArtefact', 'dollarsAfterDollar', 'pluralOne',
    'reducibleFraction', 'unsimplifiedRadical',
  ]);
  assert.deepEqual(DISPLAY_CLASSES.filter((entry) => !entry.certain).map((entry) => entry.id), ['reducibleFraction', 'unsimplifiedRadical']);
});

test('an exponent of 1 is read in math and prose, and a 10, a 1.5 and a ^{12} are not it', () => {
  ['For $x\\ne0$, $\\dfrac{(x^{ -5 })^{ 6 }}{x^k}=x^{ 1 }$.', 'The equation $3^{x+k}=3^{ 1 }$ has', '$x^{1}$', 'x^1 in prose', '$y=5^1$', '$7=5^1$'].forEach((text) => {
    assert.ok(classesIn(text).includes('exponentOne'), text);
  });
  ['$x^{ 10 }$', '$x^{1.5}$', '$x^{12}$', '$x^2$', '$x^{ -1 }$', '$x^{1/2}$', '$x_1$'].forEach((text) => {
    assert.ok(!classesIn(text).includes('exponentOne'), text);
  });
  // "5 = 5^{ 1 }" is the step that writes a number as a power of itself so two powers of one base can be
  // compared (A2.5D's worked solutions), CT14: the exponent is its point. A different number on the left is not that step.
  ['$5=5^{ 1 }$, so $x-3=1$.', '$5 = 5^1$', '$2.5=2.5^{1}$'].forEach((text) => assert.ok(!classesIn(text).includes('exponentOne'), text));
  assert.ok(classesIn('$5=5^{ 1 }$ and $x^{ 1 }$').includes('exponentOne'), 'the step is exempt, a second exponent of 1 beside it is not');
});

test('a "where" clause over the generator\'s constants is read, in prose and in math, and a clause over letters is not', () => {
  [
    'The curve $y=14(2)^x$, where 14>0 and 2>1, approaches which line?',
    'For $f(x)=26\\left(\\dfrac{68}{100}\\right)^x$, where $0<68<100$?',
    'Then $f(t)=4t^2$ and $g(t)=9t^2$, where 9>4>0.',
    'with $f(x)=90(2)^x$, where 90>63>0 and 4>2>1',
    'Plotted in a coordinate plane, where 3 and 5 are positive.',
    'Given $f(-4)<g(-4)$, where $-4\\le 1$.',
  ].forEach((text) => assert.ok(classesIn(text).includes('constantCondition'), text));
  [
    'The curve $y=A(b)^x$, where $A>0$ and $b>1$, approaches which line?',
    'where $a$ and $b$ are positive',
    'where 3 students are in the room',
    'Solve $x>3$ where $x$ is an integer.',
    'a grid where 5 rows are shaded',
    'Find the sum, where the first term is 3.',
  ].forEach((text) => assert.ok(!classesIn(text).includes('constantCondition'), text));
});

test('a denominator of 1 is read in a \\frac with any numerator, and as a gradient written over 1', () => {
  ['$\\frac{\\sqrt{ 11 }}{ 1 }$', '$m=\\frac{5}{1}=5$', '$\\dfrac{x+2}{1}$', '$\\frac{ -1-4 }{ 1 }$', 'The gradient is -7/1', '$-7/1$', '$x=3/1$'].forEach((text) => {
    assert.ok(classesIn(text).includes('denominatorOne'), text);
  });
  ['$\\frac{1}{2}$', '$\\frac{5}{10}$', '$\\frac{ 3 }{ 1.5 }$', '$\\frac{x}{ 11 }$', '$7/10$', 'the 3/12 mark', '$\\frac{1}{ 21 }$'].forEach((text) => {
    assert.ok(!classesIn(text).includes('denominatorOne'), text);
  });
  assert.deepEqual(fractionsIn('$\\frac{\\sqrt{ 14 }}{ 1 }+\\frac{a}{b}$').map((entry) => [entry.numerator, entry.denominator]), [['\\sqrt{ 14 }', '1'], ['a', 'b']]);
});

test('a collapsed factor is read where a shift of 0 left a space, a power, a signed neighbour or a bare right side, and not f(x) or a product of terms', () => {
  [
    '$\\dfrac{(x )^2}{16}+\\dfrac{(y - 4)^2}{9}=1$',
    '$\\dfrac{(x - 1)^2}{36}-\\dfrac{(y )^2}{25}=1$',
    '$(x)(x+3)$',
    '$(x - 2)(x)$',
    '$f(x)=2(x)$',
    '$y+ 3=(x)$',
  ].forEach((text) => assert.ok(findDisplayProblems(text).collapsedFactor, text));
  // The space a zero shift leaves is enough on its own.
  assert.deepEqual(findCollapsedFactors('k+(x )-2'), ['(x )']);
  [
    '$f(x)=3x$', '$g (x)$', '$f^{-1}(y)$', "$f'(x)$", '$\\sin(x)$', '$(3x)(x)=3x^2$', '$(5)(x)=5x$', '$(x+1)^2$', '$f\\left(x\\right)=x$',
    // A function applied is not a factor, even beside a power or a signed bracket.
    '$f(x)^2$', '$g(x)(x+1)$', '$h(t)=f(x)-3$', '$f^{-1}(y)^2$',
    // Mathematics only: prose with a bracket is not a factor.
    'In part (a) of the figure (x) is shown',
  ].forEach((text) => assert.ok(!findDisplayProblems(text).collapsedFactor, text));
  assert.deepEqual(findCollapsedFactors('(x )(x-3)'), ['(x )']);
});

test('the O2 classes and a plural unit after 1 are read, and ordinary arithmetic is left alone', () => {
  assert.ok(classesIn('$1x+3$').includes('coefficientOne'));
  assert.ok(classesIn('$3x + 0$').includes('zeroTerm'));
  assert.ok(classesIn('$5 + -3$').includes('doubledSign'));
  assert.ok(classesIn('the total is 102.40000000000002 dollars').includes('floatArtefact'));
  assert.ok(classesIn('costs $3 dollars each').includes('dollarsAfterDollar'));
  ['at most 1 millimeters', 'moves 1 units right', 'sits 1 dollars', 'over 1 hours'].forEach((text) => assert.ok(classesIn(text).includes('pluralOne'), text));
  ['at most 1 millimeter', '1 unit', '11 units', '2.1 units', '1.5 hours', '1/2 miles', 'a 1-hour wait', 'the 1 st place'].forEach((text) => {
    assert.ok(!classesIn(text).includes('pluralOne'), text);
  });
  ['$6 - 0$ is arithmetic', '$x + 10$', '$10x$', '$2.0x$', '$3 - -x$'].forEach((text) => {
    const found = classesIn(text);
    assert.ok(!found.includes('zeroTerm') && !found.includes('coefficientOne'), `${text}: ${found}`);
  });
  // The judgement classes are shown, and only a reducing fraction or a radical with a square factor.
  assert.ok(classesIn('$\\frac{6}{4}$').includes('reducibleFraction'));
  assert.ok(classesIn('$6/4$').includes('reducibleFraction'));
  assert.ok(!classesIn('$\\frac{3}{4}$').includes('reducibleFraction'));
  assert.ok(classesIn('$\\sqrt{ 8 }$').includes('unsimplifiedRadical'));
  assert.ok(!classesIn('$\\sqrt{ 7 }$').includes('unsimplifiedRadical'));
});

test('every string a student can read in a drawn question is a surface, and a choice question\'s key is not one', () => {
  const question = {
    prompt: 'P',
    choices: [{ id: 'a', label: 'C1' }, { id: 'b', label: 'C2' }],
    responseFields: [{ id: 'answer', inputProfile: 'choice', expected: 'a' }],
    solutionReview: { headline: 'H', reasoning: ['R1', 'R2'], commonError: 'E', answerSummary: 'S' },
    supportHints: ['HINT'],
    attemptFeedback: ['FEED'],
  };
  assert.deepEqual(surfacesOf(question), [
    ['prompt', 'P'], ['choice', 'C1'], ['choice', 'C2'],
    ['review', 'H'], ['review', 'R1'], ['review', 'R2'], ['review', 'E'], ['review', 'S'],
    ['hint', 'HINT'], ['hint', 'FEED'],
  ]);
  const typed = { prompt: 'P', responseFields: [{ id: 'answer', inputProfile: 'number', expected: '-7/1' }] };
  assert.deepEqual(surfacesOf(typed), [['prompt', 'P'], ['key', '-7/1']]);
});

test('the scan reports a template where the form is, in the surface it is in, and not where it is not', () => {
  const source = JSON.parse(read('functions/seeds/pathQuestionBank/act_pathQuestionBank_seed.json')).documents.find((doc) => doc.id === 'mm_act_fn_3_greater-zero_v21');
  assert.ok(source, 'a real drawable template to build from');
  // The exponent is in the prompt and in the worked solution; the other two only in the prompt.
  const defective = {
    ...source,
    id: 'synthetic_defective',
    prompt: 'Simplify $x^{ 1 }(x )^2$ when it moves 1 units.',
    solutionReview: { headline: 'Write $x^{ 1 }$ as x.', reasoning: ['First step.', 'Second step.'], answerSummary: 'Done.' },
  };
  const clean = { ...source, id: 'synthetic_clean' };
  const result = scanBank({ draws: 4, bank: { digitalSAT: [], act: [defective, clean], tsia2: [] }, seedPrefix: 'unit' });
  assert.equal(result.templates, 2);
  assert.equal(result.draws, 8);
  for (const id of ['exponentOne', 'collapsedFactor', 'pluralOne']) {
    const summary = result.classes[id];
    assert.deepEqual(summary.items.map((item) => item.id), ['synthetic_defective'], id);
    assert.equal(summary.templates, 1, id);
    assert.equal(summary.draws, 4, `${id}: a draw is counted once, however many surfaces show it`);
    assert.equal(summary.byFramework.act.templates, 1, id);
    assert.equal(summary.byFramework.digitalSAT.templates, 0, id);
    assert.equal(summary.bySurface.prompt.templates, 1, `${id}: in the prompt`);
    assert.equal(summary.bySurface.review.templates, id === 'exponentOne' ? 1 : 0, `${id}: in the review only for the exponent`);
  }
  assert.deepEqual(result.classes.exponentOne.items[0].surfaces, { prompt: 4, review: 4 }, 'each surface is counted once per draw');
  assert.equal(result.classes.denominatorOne.templates, 0);
  assert.equal(result.classes.exponentOne.items[0].example.surface, 'prompt');
  assert.match(result.classes.exponentOne.items[0].example.text, /x\^\{ 1 \}/);
});

test('the command reads the real bank and prints each class, and writes nothing unless asked', () => {
  const run = spawnSync('node', ['scripts/audit-testprep-display-leftovers.mjs', '--draws', '1'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^Test-prep display audit: \d+ templates, \d+ draws \(1 per template\)/);
  DISPLAY_CLASSES.forEach((entry) => assert.ok(run.stdout.includes(`${entry.id}: `), `${entry.id} is printed`));
  assert.match(run.stdout, /\(judgement\) reducibleFraction/);
  assert.doesNotMatch(run.stdout, /Wrote /);
});
