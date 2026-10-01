/*
 * Shared grader for the `sequenceExplorer` registry tool — run by the browser
 * tool for its feedback, by QuestionEngine for the recorded verdict, and by
 * the server as the authority. See ../toolGraderDefinition.mjs.
 *
 * Extracted check-for-check from SequenceExplorer.jsx: the same defaults for
 * an unauthored sequence, target, missing index, sum length and comparison
 * pair; the same tolerances (0.001 for a common change or a₁, 0.01 for a term,
 * a sum or a difference, max(0.02, snap / 3) for a plotted point); the same
 * score (the share of the mode's checks that pass, every check weighted 1);
 * and the same reading of a typed rule (mathjs, sampled at five inputs).
 *
 * The rows a student fills and plots, the snap step and the comparison layout
 * come from ../../toolMath/sequenceExplorer/sequenceMath.mjs — the same
 * functions the screen draws them with.
 */
import { parse } from 'mathjs';
import declaration from '../declarations/sequenceExplorer.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult } from '../gradingResult.mjs';
import { matchesNumericAnswer } from '../../toolMath/shared/toolMath.mjs';
import {
  compareSequencesAt,
  compareSpecsFromQuestion,
  comparePlotCount,
  fullBridgeTermCount,
  generateSequence,
  inferPlotSnapStep,
  plotPointTolerance,
  pointSetMatchesRows,
  sequenceChange,
  sequencePartialSum,
  sequenceSpecFromQuestion,
  sequenceStudentActions,
  sequenceTerm,
} from '../../toolMath/sequenceExplorer/sequenceMath.mjs';

/* ---------- reading the student's entries ---------- */

// Every box on the screen holds a string. Anything else in the work did not
// come from a box, so it reads as blank rather than being coerced into one.
const entry = (value) => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
};
const filled = (value) => entry(value).trim() !== '';
const matchesNumber = (answer, expected, tolerance) => matchesNumericAnswer(entry(answer), expected, tolerance);
const pointList = (value) => (Array.isArray(value) ? value : []);

/* ---------- typed explicit and recursive rules ---------- */

/** "aₙ = 2n + 1" and "2n + 1" are the same rule: drop any left side. */
export const stripRuleLeftSide = (value = '') => {
  const text = String(value || '').trim().replace(/−/g, '-').replace(/×/g, '*').replace(/·/g, '*');
  const equalsIndex = text.indexOf('=');
  return equalsIndex >= 0 ? text.slice(equalsIndex + 1).trim() : text;
};

/** Every way of writing the previous term (a_{n-1}, a(n-1), a[n-1], aₙ₋₁) becomes `p`. */
export const normalizePreviousTermToken = (value = '') => (
  stripRuleLeftSide(value)
    .replace(/a\s*[_]?\s*\{?\s*n\s*[-−]\s*1\s*\}?/gi, 'p')
    .replace(/a\s*\(\s*n\s*[-−]\s*1\s*\)/gi, 'p')
    .replace(/a\s*\[\s*n\s*[-−]\s*1\s*\]/gi, 'p')
    .replace(/aₙ₋₁/gi, 'p')
);

/**
 * Implicit multiplication made explicit: 3n → 3*n, 2(n-1) → 2*(n-1).
 * A side effect the rule check relies on: every `name(` becomes `name*(`, so a
 * typed rule can never call a mathjs function.
 */
export const normalizeSequenceExpressionText = (value = '') => (
  String(value || '')
    .trim()
    .replace(/−/g, '-')
    .replace(/[×·]/g, '*')
    .replace(/\s+/g, '')
    .replace(/(\d|\))(?=[A-Za-z(])/g, '$1*')
    .replace(/([A-Za-z])(?=\d|\()/g, '$1*')
);

// The one mathjs construct left that allocates in proportion to a number the
// student types: `1:99999999` builds a hundred-million-entry matrix. A range
// is never a sequence term (its value is a matrix, which already fails the
// finite-number test below), so refusing it changes no verdict — it only stops
// a ten-character rule from exhausting the server's memory.
const containsRange = (node) => {
  let found = false;
  node.traverse((child) => {
    if (child.type === 'RangeNode') found = true;
  });
  return found;
};

const expressionMatchesSamples = (value, samples = [], expectedAt = () => Number.NaN) => {
  const expression = normalizeSequenceExpressionText(value);
  if (!expression) return false;
  try {
    const node = parse(expression);
    if (containsRange(node)) return false;
    const code = node.compile();
    return samples.every((scope) => {
      const actual = Number(code.evaluate(scope));
      const expected = Number(expectedAt(scope));
      return Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= 1e-6;
    });
  } catch {
    return false;
  }
};

/** An explicit rule in n generates aₙ at n = 1, 2, 3, 5, 8. */
export const matchesExplicitRule = (value, spec) => expressionMatchesSamples(
  stripRuleLeftSide(value),
  [1, 2, 3, 5, 8].map((n) => ({ n })),
  ({ n }) => sequenceTerm(spec, n),
);

/** A recursive rule turns any previous term p into p + d (arithmetic) or p · r (geometric). */
export const matchesRecursiveRule = (value, spec) => {
  const change = sequenceChange(spec);
  return expressionMatchesSamples(
    normalizePreviousTermToken(value),
    [-11, -2.5, 0, 3, 10].map((p) => ({ p })),
    ({ p }) => (spec.kind === 'arithmetic' ? p + change : p * change),
  );
};

/* ---------- parts ---------- */

const part = (id, label, answer, isCorrect) => ({
  id,
  label,
  isComplete: filled(answer),
  isCorrect: isCorrect === true,
  response: entry(answer),
});

// Labels never name the family ("difference" vs "ratio"): that is an answer.
const kindPart = (work, spec) => part('kind', 'Sequence family', work.kindAnswer, work.kindAnswer === spec.kind);
const changePart = (work, spec) => part('change', 'Common difference or ratio', work.changeAnswer, matchesNumber(work.changeAnswer, sequenceChange(spec), 0.001));
const termPart = (id, n, answer, expected) => part(id, `a${n}`, answer, matchesNumber(answer, expected, 0.01));
const explicitPart = (work, spec) => part('explicit-rule', 'Explicit rule', work.explicitRule, matchesExplicitRule(entry(work.explicitRule), spec));
const recursiveFirstPart = (work, spec) => part('recursive-first', 'a₁', work.recursiveFirst, matchesNumber(work.recursiveFirst, spec.first, 0.001));
const recursiveRulePart = (work, spec) => part('recursive-rule', 'Recursive rule', work.recursiveRule, matchesRecursiveRule(entry(work.recursiveRule), spec));

const plotPart = (id, label, points, rows, tolerance) => {
  const list = pointList(points);
  return {
    id,
    label,
    isComplete: list.length >= rows.length,
    isCorrect: pointSetMatchesRows(list, rows, tolerance),
    response: list,
  };
};

// The screen's verdict was `checks.every(Boolean)` and its score
// `passed / checks.length`; every part here is one of those checks, weighted 1,
// so gradedResult's default share is that same score.
const byChecks = (parts) => gradedResult({ parts, isCorrect: parts.length > 0 && parts.every((check) => check.isCorrect === true) });

/* ---------- modes ---------- */

const analyze = (question, work) => {
  const spec = sequenceSpecFromQuestion(question);
  const targetN = Number(question.targetN ?? 8);
  return byChecks([
    kindPart(work, spec),
    changePart(work, spec),
    termPart('term', targetN, work.termAnswer, sequenceTerm(spec, targetN)),
  ]);
};

const ruleBridge = (question, work) => {
  const spec = sequenceSpecFromQuestion(question);
  return byChecks([
    explicitPart(work, spec),
    recursiveFirstPart(work, spec),
    recursiveRulePart(work, spec),
  ]);
};

const fullBridge = (question, work) => {
  const spec = sequenceSpecFromQuestion(question);
  const actions = sequenceStudentActions(question);
  const targetN = Number(question.targetN || 0);
  const rows = generateSequence(spec, fullBridgeTermCount(question));
  const tolerance = plotPointTolerance(inferPlotSnapStep(rows, question.plotSnapStep));
  const parts = [];

  if (actions.includes('buildSequenceTable')) {
    // One box per row on screen. A row whose box is missing from the work is
    // blank (incorrect), never skipped; a value past the last row is not on
    // screen and is not read.
    const values = Array.isArray(work.tableValues) ? work.tableValues : [];
    const cells = rows.map((row, index) => values[index]);
    parts.push({
      id: 'table',
      label: 'Table of (n, aₙ)',
      isComplete: cells.every(filled),
      isCorrect: rows.every((row, index) => matchesNumber(cells[index], row.value, 0.01)),
      response: cells.map(entry),
    });
  }
  if (actions.includes('plotSequence')) parts.push(plotPart('plot', 'Discrete graph', work.plottedPoints, rows, tolerance));
  if (actions.includes('analyzeSequence')) parts.push(kindPart(work, spec), changePart(work, spec));
  if (actions.includes('writeExplicit')) parts.push(explicitPart(work, spec));
  if (actions.includes('writeRecursive')) parts.push(recursiveFirstPart(work, spec), recursiveRulePart(work, spec));
  if (actions.includes('findSequenceTerm') && targetN > 0) parts.push(termPart('term', targetN, work.termAnswer, sequenceTerm(spec, targetN)));

  if (!parts.length) {
    // The screen marks a model that requires nothing as one failed check
    // (`checks.length ? checks : [false]`). There is nothing to finish.
    return byChecks([{ id: 'model', label: 'Sequence model', isComplete: false, isCorrect: false, response: '' }]);
  }
  return byChecks(parts);
};

const missingTerm = (question, work) => {
  const spec = sequenceSpecFromQuestion(question);
  const missingIndex = Number(question.missingIndex ?? 4);
  return byChecks([
    termPart('term', missingIndex, work.termAnswer, sequenceTerm(spec, missingIndex)),
    kindPart(work, spec),
  ]);
};

const partialSum = (question, work) => {
  const spec = sequenceSpecFromQuestion(question);
  const sumN = Number(question.sumN ?? 6);
  return byChecks([
    termPart('last-term', sumN, work.lastTerm, sequenceTerm(spec, sumN)),
    part('sum', `S${sumN}`, work.sumAnswer, matchesNumber(work.sumAnswer, sequencePartialSum(spec, sumN), 0.01)),
  ]);
};

const compare = (question, work) => {
  const { left, right } = compareSpecsFromQuestion(question);
  const compareN = Number(question.compareN ?? 7);
  const result = compareSequencesAt(left, right, compareN);
  const expectedRelation = result.relation === 'left' ? 'A' : result.relation === 'right' ? 'B' : 'equal';
  const parts = [];
  if (sequenceStudentActions(question).includes('plotSequence')) {
    const plotCount = comparePlotCount(question);
    const leftRows = generateSequence(left, plotCount);
    const rightRows = generateSequence(right, plotCount);
    const tolerance = plotPointTolerance(inferPlotSnapStep([...leftRows, ...rightRows], question.plotSnapStep));
    parts.push(
      plotPart('plot-a', 'Sequence A graph', work.leftPlottedPoints, leftRows, tolerance),
      plotPart('plot-b', 'Sequence B graph', work.rightPlottedPoints, rightRows, tolerance),
    );
  }
  parts.push(
    part('relation', 'Larger term', work.relation, work.relation === expectedRelation),
    part('difference', 'Absolute difference', work.difference, matchesNumber(work.difference, result.difference, 0.01)),
  );
  return byChecks(parts);
};

export default bindToolGrader(declaration, 'sequenceExplorer', {
  analyze,
  ruleBridge,
  fullBridge,
  missingTerm,
  partialSum,
  compare,
});
