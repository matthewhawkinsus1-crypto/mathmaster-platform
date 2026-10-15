import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import Fraction from 'fraction.js';

import intervalGrader from '../../functions/shared/serverGrading/tools/intervalNumberLine.mjs';
import { intervalsToInequality, normalizeIntervals } from '../../functions/shared/toolMath/intervalNumberLine/intervalMath.mjs';
import { generatePathInstanceWithRetries, hasPathGenerator } from '../../functions/shared/pathQuestionGeneration.mjs';

const require = createRequire(import.meta.url);
const { compilePathRecordForStorage } = require('../../functions/lib/pathFirestoreShape.js');

/*
 * JOB P, ITEM 1 — the number line's inequality stage.
 *
 * The tool writes every endpoint to four places, and its inequality stage
 * compared the student's sentence with that text. For x > 1/3 it accepted
 * `x > 0.3333` and rejected the exact `x > 1/3`. Endpoints are now also read
 * as numbers; the sentence keeps the tool's shape. Graded through the shared
 * grader the browser, QuestionEngine and the server all run.
 */
const inequalityVerdict = (intervals, inequality, variable = 'x') => intervalGrader.grade(
  { intervals, ask: ['inequality'], variable },
  { inequality },
).isCorrect;

const third = [{ min: 1 / 3, max: null, minClosed: false }];
const segment = [{ min: -1 / 3, max: 5 / 2, minClosed: true, maxClosed: false }];
const union = [{ min: null, max: -2 / 3, maxClosed: true }, { min: Math.SQRT2, max: null, minClosed: false }];

test('an exact endpoint is right where the tool writes a rounded one', () => {
  for (const [intervals, sentence] of [
    [third, 'x > 1/3'],
    [third, 'x>\\frac{1}{3}'],
    [third, 'x > 0.3333'], // the tool's own sentence, still right
    [segment, '-1/3 \\le x < 5/2'],
    [segment, '-\\frac{1}{3}\\le x<\\frac{5}{2}'],
    [segment, '-1/3 ≤ x < 2.5'],
    [union, 'x \\le -2/3 \\lor x > \\sqrt{2}'],
    [union, 'x <= -2/3 or x > 1.4142'],
    [[{ min: null, max: Math.PI / 2, maxClosed: false }], 'x < \\frac{\\pi}{2}'],
  ]) assert.equal(inequalityVerdict(intervals, sentence), true, sentence);
});

test('near misses stay wrong: approximation, relation, shape, order and variable', () => {
  for (const [intervals, sentence] of [
    [third, 'x > 0.333'],
    [third, 'x > 0.33333'], // not the tool's four places and not 1/3
    [third, 'x \\ge 1/3'],
    [third, 'x < 1/3'],
    [third, 'x > 1/4'],
    [third, '1/3 < x'], // the tool never wrote it this way round, before or now
    [third, 'y > 1/3'],
    [third, 'x > 1/3 or x > 1/3'],
    [segment, '-1/3 < x < 5/2'],
    [segment, '5/2 > x \\ge -1/3'],
    [union, 'x > \\sqrt{2} or x \\le -2/3'],
    [union, 'x \\le -2/3 and x > \\sqrt{2}'],
    [union, 'x \\le -0.667 or x > 1.4142'],
  ]) assert.equal(inequalityVerdict(intervals, sentence), false, sentence);
});

/*
 * Every number-line item in the banks, as it is drawn. For each, the tool's
 * own sentence is right; the same sentence with exact fraction endpoints is
 * right; and each near miss — an endpoint moved, a relation flipped — is
 * wrong. Nothing that was right can become wrong: the old comparison is kept
 * and the new one is an alternative to it.
 */
const bankItems = () => {
  const items = [];
  const visit = (node, source) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((entry) => visit(entry, source)); return; }
    const intervals = node.intervals || node.expectedIntervals;
    if (node.type === 'intervalNumberLine' && Array.isArray(intervals) && !JSON.stringify(intervals).includes('{{')) {
      items.push({ source, intervals, variable: node.variable || 'x' });
    }
    Object.values(node).forEach((value) => visit(value, source));
  };
  const dir = new URL('../../functions/seeds/pathQuestionBank/', import.meta.url);
  for (const file of readdirSync(dir).filter((name) => name.endsWith('_pathQuestionBank_seed.json'))) {
    for (const item of JSON.parse(readFileSync(new URL(file, dir), 'utf8')).documents || []) {
      if (!JSON.stringify(item).includes('intervalNumberLine')) continue;
      const document = compilePathRecordForStorage({ ...item, active: true }).document;
      if (!hasPathGenerator(document)) { visit(document, `${file} ${item.id}`); continue; }
      for (let draw = 0; draw < 6; draw += 1) visit(generatePathInstanceWithRetries(document, `p-interval-${draw}`, 4).question, `${file} ${item.id} draw ${draw}`);
    }
  }
  return items;
};

test('every bank number-line item: the tool sentence and exact endpoints are right, near misses wrong', () => {
  const items = bankItems();
  assert.ok(items.length >= 40, `only ${items.length} number-line instances found`);
  const failures = [];
  let exactChecked = 0;
  for (const { source, intervals, variable } of items) {
    const expected = normalizeIntervals(intervals);
    if (!expected.length) continue;
    const sentence = intervalsToInequality(expected, variable);
    if (!inequalityVerdict(intervals, sentence, variable)) failures.push(`${source}: tool sentence ${sentence} graded wrong`);
    // The same sentence with each finite endpoint as a fraction.
    const exact = expected.map((interval) => {
      const write = (value) => new Fraction(value).simplify(1e-12).toFraction();
      if (interval.min === -Infinity && interval.max === Infinity) return null;
      if (interval.min === -Infinity) return `${variable} ${interval.maxClosed ? '≤' : '<'} ${write(interval.max)}`;
      if (interval.max === Infinity) return `${variable} ${interval.minClosed ? '≥' : '>'} ${write(interval.min)}`;
      return `${write(interval.min)} ${interval.minClosed ? '≤' : '<'} ${variable} ${interval.maxClosed ? '≤' : '<'} ${write(interval.max)}`;
    });
    if (!exact.includes(null)) {
      exactChecked += 1;
      if (!inequalityVerdict(intervals, exact.join(' or '), variable)) failures.push(`${source}: exact ${exact.join(' or ')} graded wrong`);
    }
    // Near misses: each finite endpoint moved by 1, each closure flipped.
    expected.forEach((interval, index) => {
      for (const change of [
        { min: interval.min + 1 }, { max: interval.max - 1 },
        { minClosed: !interval.minClosed }, { maxClosed: !interval.maxClosed },
      ]) {
        const moved = expected.map((entry, at) => (at === index ? { ...entry, ...change } : entry));
        const key = Object.keys(change)[0];
        if (!Number.isFinite(interval[key.startsWith('min') ? 'min' : 'max'])) continue;
        if (normalizeIntervals(moved).length !== expected.length) continue;
        const miss = intervalsToInequality(moved, variable);
        if (miss !== sentence && inequalityVerdict(intervals, miss, variable)) failures.push(`${source}: near miss ${miss} graded right for ${sentence}`);
      }
    });
  }
  assert.ok(exactChecked >= 40, `exact endpoints checked for only ${exactChecked} instances`);
  assert.deepEqual(failures, []);
});
