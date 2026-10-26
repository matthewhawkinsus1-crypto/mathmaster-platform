/*
 * JOB K (CT02) — THE transformations FAMILY'S WORKED SOLUTION OF A DESCRIPTION.
 *
 * workedSolution(question) is what the closed-question review panel shows when
 * a multiAnswer transformation description ("Describe g(x)=−2f(x−1)+3.",
 * "Analyze y=−2|x+3|+1.") has no authored solution steps
 * (closedQuestionReview.js). Before it, the family had none, and fourteen
 * Algebra II Honors Module 1 items (eight in L2_Day2_Transformations, six in
 * L1_Absolute_Value_ALEKS_Bridge) showed only the answer
 * (kSteps_answerOnlyInventory.test.mjs).
 *
 * This file takes those fourteen as a student's device receives them, and
 * seeded descriptions of every field the family reads (translations, scales,
 * reflections, a single kind of change and its factor, an absolute value's
 * vertex and range; negative, fractional and zero values). Everything is
 * checked with this file's own reading, never the family's helpers:
 *   - the first step's a, b, h and k ARE the written equation:
 *     a·f(b(x − h)) + k equals it at sample x (mathjs, with f a cubic that
 *     has no symmetry, or |x|);
 *   - each field has one step, "<label>: <reason>: <answer>.", whose answer
 *     is this file's own verdict from a, b, h and k, is the item's key, and is
 *     graded right by the shared grader (gradeMultiAnswerResponse); the
 *     answer summary lists exactly those;
 *   - the reasons say what is true of the equation (the sign of a and b, the
 *     reciprocal of b, which way the shift goes);
 *   - plain words: no formula is typeset, no NaN, no doubled sign.
 *
 * Mutation-checked (each undone in transformations.js, seen red, restored):
 *   - the reading step printed h with its sign flipped → the evaluation check;
 *   - the horizontal scale's reason said "1 divided by" the signed b → the
 *     reason check (a negative factor);
 *   - the range reason said "opens up" for a negative factor → the reason check;
 *   - the field grader check removed → the unreadable-field case;
 *   - a field step stated the next field's answer → the oracle and the grader;
 *   - the export removed → the inventory's floors for the two files.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { all, create } from 'mathjs';

import * as transformations from '../../src/platform/supports/families/transformations.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import { buildClosedQuestionReview } from '../../src/platform/supports/review/closedQuestionReview.js';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { isMathSegment, splitMathSegments } from '../../src/components/common/mathSegments.js';

const ROOT = new URL('../../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, ROOT), 'utf8');
const math = create(all, { number: 'Fraction' });
const exact = (value) => math.fraction(String(value).replace(/[−–]/g, '-'));
const same = (a, b) => math.equal(exact(a), exact(b));
const fractionText = (value) => math.format(exact(value), { fraction: 'ratio' }).replace(/\/1$/, '');
const ascii = (value) => String(value ?? '').replace(/[−–]/g, '-');
// Values are fraction strings ('-1/2'): signs and sizes are read exactly, never with Number().
const isNeg = (value) => math.smaller(exact(value), 0);
const isPos = (value) => math.larger(exact(value), 0);

/* ------------------------------------------------------------ the items */

// The fourteen, as seat 0 of an assignment receives them (as the inventory resolves them).
const REAL_FILES = Object.freeze({
  'teacher-import-jsons/algebra2-honors-module1/L2_Day2_Transformations.json': 8,
  'teacher-import-jsons/algebra2-honors-module1/L1_Absolute_Value_ALEKS_Bridge_20260828.json': 6,
});
const REAL = Object.keys(REAL_FILES).flatMap((path) => parseAssignmentBlueprintText(read(path)).questions.map((template, index) => {
  let question = template;
  try {
    question = resolveFamilyQuestionInstance({ question: template, assignmentId: 'k-steps-inventory', storageIndex: index, allocation: { seat: 0 } }).question || template;
  } catch { /* not a family template */ }
  return { source: `${path.split('/').pop()}#${index}`, file: path, question };
}).filter(({ question }) => question.type === 'multiAnswer' && familyFor(question) === transformations));

// Seeded descriptions: { A, B, C, D, abs }, written the way the lessons write them.
const mulberry = (seed) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (random, values) => values[Math.floor(random() * values.length)];
const minus = (value) => value.replace(/-/g, '−');
const factorWritten = (value) => {
  if (same(value, 1)) return '';
  if (same(value, -1)) return '−';
  const text = fractionText(value);
  return minus(text.includes('/') ? `${text.startsWith('-') ? '-' : ''}(${text.replace('-', '')})` : text);
};
const insideWritten = (B, C) => {
  const shift = same(C, 0) ? '' : `${isPos(C) ? '−' : '+'}${absText(C)}`;
  if (same(B, 1)) return `x${shift}`;
  return shift ? `${factorWritten(B)}(x${shift})` : `${factorWritten(B)}x`;
};
const tailWritten = (D) => (same(D, 0) ? '' : `${isPos(D) ? '+' : '−'}${absText(D)}`);

/* ------------------------------------------------------------ the oracle: verdicts from a, b, h, k */

const absText = (value) => fractionText(math.abs(exact(value)));
const scaleVerdict = (size) => (same(size, 1) ? 'unchanged' : `${math.larger(exact(size), 1) ? 'stretch' : 'compression'} by ${absText(size)}`);
const ORACLE = {
  H: ({ h }) => (same(h, 0) ? 'none' : `${isPos(h) ? 'right' : 'left'} ${absText(h)}`),
  V: ({ k }) => (same(k, 0) ? 'none' : `${isPos(k) ? 'up' : 'down'} ${absText(k)}`),
  T: ({ h, k }) => (same(h, 0) && same(k, 0) ? 'none' : null),
  VS: ({ a }) => scaleVerdict(math.abs(exact(a))),
  HS: ({ b }) => scaleVerdict(math.divide(1, math.abs(exact(b)))),
  HR: ({ b }) => (isNeg(b) ? 'across the y-axis' : 'none'),
  VR: ({ a }) => (isNeg(a) ? 'across the x-axis' : 'none'),
  R: ({ a, b }) => (isNeg(a) && isNeg(b) ? null : isNeg(a) ? 'across the x-axis' : isNeg(b) ? 'across the y-axis' : 'none'),
  KIND: ({ a, b, h, k }) => {
    if (!same(h, 0) || !same(k, 0)) return null;
    if (same(a, 1) && isPos(b) && !same(b, 1)) return `horizontal ${math.larger(math.divide(1, exact(b)), 1) ? 'stretch' : 'compression'}`;
    if (isPos(a) && !same(a, 1) && same(b, 1)) return `vertical ${math.larger(exact(a), 1) ? 'stretch' : 'compression'}`;
    return null;
  },
  FACTOR: ({ a, b, h, k }) => {
    if (!same(h, 0) || !same(k, 0)) return null;
    if (same(a, 1) && isPos(b) && !same(b, 1)) return fractionText(math.divide(1, exact(b)));
    if (isPos(a) && !same(a, 1) && same(b, 1)) return fractionText(a);
    return null;
  },
  VERTEX: ({ h, k }) => `(${fractionText(h)}, ${fractionText(k)})`,
  RANGE: ({ a, k }) => (isNeg(a) ? `(-∞, ${fractionText(k)}]` : `[${fractionText(k)}, ∞)`),
};
const LABELS = Object.freeze({
  H: 'Horizontal translation', V: 'Vertical translation', T: 'Translation', VS: 'Vertical scale', HS: 'Horizontal scale',
  HR: 'Horizontal reflection', VR: 'Vertical reflection', R: 'Reflection', KIND: 'Transformation', FACTOR: 'Scale factor', VERTEX: 'Vertex', RANGE: 'Range',
});
const ROLE_OF = Object.freeze(Object.fromEntries(Object.entries(LABELS).map(([role, label]) => [label.toLowerCase(), role])));
const DECOYS = {
  H: ({ h }) => [`right ${absText(h) === '0' ? 3 : absText(h)}`, `left ${absText(h) === '0' ? 3 : absText(h)}`, 'none'],
  V: ({ k }) => [`up ${absText(k) === '0' ? 2 : absText(k)}`, `down ${absText(k) === '0' ? 2 : absText(k)}`, 'none'],
  T: () => ['none', 'right 1', 'left 1'],
  VS: () => ['stretch by 2', 'compression by 1/2', 'unchanged'],
  HS: () => ['stretch by 2', 'compression by 1/2', 'unchanged'],
  HR: () => ['across the y-axis', 'across the x-axis', 'none'],
  VR: () => ['across the x-axis', 'across the y-axis', 'none'],
  R: () => ['across the x-axis', 'across the y-axis', 'none'],
  KIND: () => ['horizontal compression', 'horizontal stretch', 'vertical stretch', 'vertical compression'],
  FACTOR: () => ['1/2', '2', '3', '1/3'],
  VERTEX: ({ h, k }) => [`(${fractionText(h)}, ${fractionText(k)})`, `(${fractionText(math.unaryMinus(exact(h)))}, ${fractionText(k)})`, `(${fractionText(h)}, ${fractionText(math.add(exact(k), 1))})`],
  RANGE: ({ k }) => [`(-∞, ${fractionText(k)}]`, `[${fractionText(k)}, ∞)`, `(-∞, ${fractionText(math.add(exact(k), 2))}]`],
};

/** A description of { a, b, h, k } asking the given fields, with the key from the oracle. */
const describeItem = (source, values, abs, roles, random) => {
  const { a, b, h, k } = values;
  const written = abs ? `y=${factorWritten(a)}|${insideWritten(b, h)}|${tailWritten(k)}` : `g(x)=${factorWritten(a)}f(${insideWritten(b, h)})${tailWritten(k)}`;
  const answerFields = roles.map((role) => {
    const answer = minus(ORACLE[role](values));
    const options = [...new Set([answer, ...DECOYS[role](values).map(minus)])].slice(0, 4).sort(() => random() - 0.5);
    return { id: role.toLowerCase(), label: LABELS[role], type: 'choice', inputProfile: 'choice', options, answer };
  });
  return { source, values, abs, question: { type: 'multiAnswer', prompt: `Describe ${written}.`, answerFields } };
};

// The fields a random draw rarely asks together: each kind of change alone, a
// reflection on each side, the range both ways, negative fractions on both sides.
const EDGES = [
  [{ a: '1', b: '2', h: '0', k: '0' }, false, ['KIND', 'FACTOR']],
  [{ a: '1', b: '1/2', h: '0', k: '0' }, false, ['KIND', 'FACTOR']],
  [{ a: '3', b: '1', h: '0', k: '0' }, false, ['KIND', 'FACTOR']],
  [{ a: '1/2', b: '1', h: '0', k: '0' }, false, ['KIND', 'FACTOR']],
  [{ a: '1', b: '-1', h: '0', k: '0' }, false, ['R', 'T']],
  [{ a: '-1', b: '1', h: '0', k: '0' }, false, ['R', 'VS', 'T']],
  [{ a: '-1/2', b: '-1/2', h: '3', k: '2' }, false, ['VR', 'HR', 'VS', 'HS', 'H', 'V']],
  [{ a: '2', b: '-1', h: '-1', k: '0' }, false, ['HS', 'HR', 'H', 'V']],
  [{ a: '-2', b: '1', h: '-3', k: '1' }, true, ['VERTEX', 'RANGE', 'VR', 'H', 'V']],
  [{ a: '1/2', b: '1', h: '4', k: '-2' }, true, ['VERTEX', 'RANGE', 'VS', 'H']],
  [{ a: '1', b: '-2', h: '0', k: '-4' }, true, ['HR', 'HS', 'V', 'VERTEX']],
];

const DRAWS = (() => {
  const random = mulberry(20261026);
  const out = EDGES.map(([values, abs, roles], index) => describeItem(`edge-${index}`, values, abs, roles, random));
  for (let index = 0; out.length < 120 && index < 2000; index += 1) {
    const abs = index % 3 === 0;
    const values = {
      a: pick(random, ['1', '1', '-1', '2', '-2', '3', '1/2', '-1/2']),
      b: pick(random, ['1', '1', '1', '-1', '2', '-2', '1/2', '-1/2', '3']),
      h: pick(random, ['0', '0', '1', '-1', '2', '-3', '4', '5']),
      k: pick(random, ['0', '0', '2', '-2', '3', '-4', '1']),
    };
    if (['a', 'b'].every((name) => same(values[name], 1)) && ['h', 'k'].every((name) => same(values[name], 0))) continue;
    const roles = Object.keys(ORACLE).filter((role) => ORACLE[role](values) !== null && (abs || !['VERTEX', 'RANGE'].includes(role)) && random() < 0.5);
    if (!roles.some((role) => !['VERTEX', 'RANGE'].includes(role))) roles.push('H');
    out.push(describeItem(`draw-${index}`, values, abs, roles, random));
  }
  return out;
})();

/* ------------------------------------------------------------ reading a worked solution back */

const TEST_F = (t) => math.subtract(math.add(math.pow(t, 3), 1), math.multiply(2, t)); // t³ − 2t + 1: no symmetry
/** The equation the item describes, as written: the last g(x)= / y= whose side is not the parent. */
const writtenSide = (prompt) => {
  const sides = [...ascii(prompt).matchAll(/(?:\bg\(x\)|\by)\s*=\s*([0-9fx()|.+\-·*/]+?)(?=[.,]?(?:\s|$))/g)].map((match) => match[1]);
  return sides.filter((side) => !['f(x)', '|x|'].includes(side)).pop();
};
const evaluateWritten = (side, x) => {
  const expression = side.replace(/·/g, '*').replace(/\|([^|]+)\|/g, 'abs($1)');
  return math.evaluate(expression, { x: exact(x), f: TEST_F, abs: (value) => math.abs(value) });
};
const READING = /^Compare (\S+) with y = a(?:·f\(b\(x − h\)\)|\|b\(x − h\)\|) \+ k: a = (\S+), b = (\S+), h = (\S+) and k = (\S+)\.$/;
const readStep = (step) => {
  const match = READING.exec(step);
  assert.ok(match, `the reading step: ${step}`);
  const [, display, a, b, h, k] = match;
  return { display, values: { a: ascii(a), b: ascii(b), h: ascii(h), k: ascii(k) } };
};

/** One description, checked from top to bottom; returns the worked solution. */
const checkWorked = ({ source, question }) => {
  const worked = transformations.workedSolution(question);
  assert.ok(worked, `${source}: worked`);
  const { headline, steps, answerSummary } = worked;
  const abs = /\|/.test(writtenSide(question.prompt));
  // 1. The reading step's a, b, h, k are the written equation.
  const { display, values } = readStep(steps[0]);
  assert.ok(ascii(question.prompt).includes(ascii(display)), `${source}: it quotes the equation as written`);
  const side = writtenSide(question.prompt);
  const parent = abs ? (t) => math.abs(t) : TEST_F;
  for (const x of ['-3.5', '-1', '0.25', '2', '4.5']) {
    const expected = evaluateWritten(side, x);
    const stated = math.add(math.multiply(exact(values.a), parent(math.multiply(exact(values.b), math.subtract(exact(x), exact(values.h))))), exact(values.k));
    assert.ok(math.equal(stated, expected), `${source}: a·f(b(x − h)) + k with ${JSON.stringify(values)} is ${side} at x = ${x}`);
  }
  // An absolute value hides the sign of b from the graph; the item's own words keep it.
  if (abs) assert.equal(isNeg(values.b), /^[^|]*\|-/.test(side), `${source}: b's sign is the one written inside the bars`);
  // 2. One step per field: its label, a reason, and this file's verdict, which is the key.
  assert.equal(steps.length, question.answerFields.length + 1, `${source}: the reading, then one step per field`);
  const answers = {};
  question.answerFields.forEach((field, index) => {
    const role = ROLE_OF[field.label.toLowerCase()];
    const verdict = ORACLE[role](values);
    const step = steps[index + 1];
    assert.ok(step.startsWith(`${field.label}: `), `${source}: "${step}" is the ${field.label} step`);
    const stated = /: ([^:]+)\.$/.exec(step)?.[1];
    assert.equal(ascii(stated), verdict, `${source}: ${field.label} is ${verdict}`);
    assert.equal(stated, field.answer, `${source}: ${field.label} states the key as written`);
    answers[field.id] = stated;
    // The reason says what is true of a, b, h, k.
    const reason = step.slice(field.label.length + 2, step.length - stated.length - 3);
    if (/factor in front is negative/.test(reason)) assert.ok(isNeg(values.a), `${source}: ${reason}`);
    if (/factor in front is (?:not negative|positive)/.test(reason)) assert.ok(isPos(values.a), `${source}: ${reason}`);
    if (/x is multiplied by a negative number/.test(reason)) assert.ok(isNeg(values.b), `${source}: ${reason}`);
    if (/x is not multiplied by a negative number/.test(reason)) assert.ok(isPos(values.b), `${source}: ${reason}`);
    const divided = /1 divided by (\S+), which is (\S+),/.exec(reason);
    if (divided) {
      assert.ok(same(ascii(divided[1]), math.abs(exact(values.b))), `${source}: divided by the size of b: ${reason}`);
      assert.ok(same(ascii(divided[2]), math.divide(1, math.abs(exact(values.b)))), `${source}: the reciprocal: ${reason}`);
    }
    const size = /scaled vertically by its size, (\S+),/.exec(reason);
    if (size) assert.ok(same(ascii(size[1]), math.abs(exact(values.a))), `${source}: the size of a: ${reason}`);
    for (const [, value, side] of reason.matchAll(/(\S+), (more|less) than 1/g)) {
      assert.equal(math.larger(exact(ascii(value)), 1), side === 'more', `${source}: ${value} is ${side} than 1`);
    }
    if (/opens down/.test(reason)) assert.ok(isNeg(values.a), `${source}: ${reason}`);
    if (/opens up/.test(reason)) assert.ok(isPos(values.a), `${source}: ${reason}`);
    const shift = /gives h = (\S+), and a shift inside goes against the sign it shows/.exec(reason);
    if (shift) assert.equal(ascii(shift[1]), values.h, `${source}: ${reason}`);
    const added = /added at the end is k = (\S+),/.exec(reason);
    if (added) assert.equal(ascii(added[1]), values.k, `${source}: ${reason}`);
  });
  // 3. The shared grader marks what is stated right, and the summary is the same answers.
  const grade = gradeMultiAnswerResponse(question, answers);
  assert.equal(grade.isCorrect, true, `${source}: ${JSON.stringify(grade.parts?.filter((part) => !part.isCorrect))}`);
  assert.equal(answerSummary, `${question.answerFields.map((field) => `${field.label}: ${answers[field.id]}`).join('; ')}.`);
  // 4. Plain words.
  assert.match(headline, /acts on y the way it looks; what is inside, with x, acts on x the opposite way\.$/);
  [headline, ...steps, answerSummary].forEach((line) => {
    assert.deepEqual(splitMathSegments(line).filter(isMathSegment), [], `${source}: "${line}" is shown as prose`);
    assert.doesNotMatch(line, /NaN|undefined|null|Infinity|\[object|[+−-]\s*[+−-]\s*\d/, `${source}: ${line}`);
  });
  return worked;
};

/* ------------------------------------------------------------ the tests */

test('the fourteen answer-only descriptions are the ones the family now works: eight and six, as a student receives them', () => {
  const perFile = Object.fromEntries(Object.keys(REAL_FILES).map((path) => [path, REAL.filter((entry) => entry.file === path).length]));
  assert.deepEqual(perFile, REAL_FILES);
  REAL.forEach((entry) => checkWorked(entry));
});

test('every seeded description is worked: the reading is the equation, each verdict the oracle\'s and the key, graded right', () => {
  assert.ok(DRAWS.length >= 100);
  const roles = new Set();
  for (const entry of DRAWS) {
    assert.equal(familyFor(entry.question), transformations, `${entry.source}: ${entry.question.prompt}`);
    checkWorked(entry);
    entry.question.answerFields.forEach((field) => roles.add(ROLE_OF[field.label.toLowerCase()]));
  }
  // Every field the family reads is worked somewhere here.
  assert.deepEqual([...roles].sort(), Object.keys(LABELS).sort());
  // And the edges: a negative and a fractional factor on each side, no shift, an absolute value's range both ways.
  const seen = (test) => DRAWS.some(({ values }) => test(values));
  assert.ok(seen(({ a }) => a === '-1/2') && seen(({ b }) => b === '-1/2') && seen(({ h, k }) => h === '0' && k === '0'));
  assert.ok(DRAWS.some(({ abs, values, question }) => abs && isNeg(values.a) && question.answerFields.some((field) => field.label === 'Range')));
  assert.ok(DRAWS.some(({ abs, values, question }) => abs && isPos(values.a) && question.answerFields.some((field) => field.label === 'Range')));
});

test('the closed review shows these steps for the fourteen, as a family\'s worked solution', () => {
  for (const { source, question } of REAL) {
    const review = buildClosedQuestionReview({ question, isToolQuestion: false, wasCorrect: false, legacyContent: () => ({ hasContent: true }) });
    assert.equal(review.fromFamily, true, source);
    assert.equal(review.hasSteps, true, source);
    assert.deepEqual(review.authored.reasoning, transformations.workedSolution(question).steps, source);
  }
});

test('a lab item, an item the family does not claim, or a field its own grader cannot read is not worked here', () => {
  const lab = parseAssignmentBlueprintText(read('teacher-import-jsons/algebra2-honors-module1/L2_Day2_Transformations.json')).questions
    .filter((question) => question.type === 'transformationsLab' && transformations.matches(question));
  assert.ok(lab.length >= 3, 'claimed lab items');
  lab.forEach((question) => assert.equal(transformations.workedSolution(question), null, `a lab item is not worked here: ${question.prompt}`));
  const base = structuredClone(REAL.find(({ question }) => question.answerFields.length >= 3).question);
  const wrongKey = structuredClone(base);
  wrongKey.answerFields[0].answer = wrongKey.answerFields[0].options.find((option) => option !== wrongKey.answerFields[0].answer);
  assert.equal(transformations.workedSolution(wrongKey), null, 'a key the equation contradicts');
  assert.equal(transformations.workedSolution({ ...base, prompt: 'Describe g(x)=f(2x+4).' }), null, 'a shift read two ways');
  for (const value of [null, undefined, {}, 'x', { type: 'multiAnswer' }]) assert.equal(transformations.workedSolution(value), null, JSON.stringify(value));
  // A field its own grader cannot read: the family reads it, the grader check refuses it.
  const unreadable = structuredClone(base);
  Object.defineProperty(unreadable.answerFields[1], 'numericTolerance', { get() { throw new Error('unreadable'); }, enumerable: false });
  assert.equal(transformations.matches(unreadable), true);
  assert.equal(transformations.workedSolution(unreadable), null);
});
