import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluate } from 'mathjs';

import intervalGrader from '../../functions/shared/serverGrading/tools/intervalNumberLine.mjs';
import intervalDeclaration from '../../functions/shared/serverGrading/declarations/intervalNumberLine.mjs';
import { GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { attemptInputsFromGrading } from '../../functions/shared/serverGrading/gradingResult.mjs';
import {
  gradeServerResponse,
  serverResponseGradingSupport,
} from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  TOOL_RESPONSE_LIMITS,
  boundToolWork,
  canonicalToolWorkJson,
} from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import {
  INTERVAL_ASK_STAGES,
  intervalsToInequality,
  normalizeIntervals,
  resolveIntervalAsk,
  sameIntervals,
} from '../../functions/shared/toolMath/intervalNumberLine/intervalMath.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * SERVER-AUTHORITATIVE GRADING PARITY FOR THE INTERVAL NUMBER LINE.
 *
 * The tool's Check, QuestionEngine's recorded verdict and the server's
 * ingestion all run functions/shared/serverGrading/tools/intervalNumberLine.mjs.
 * These tests prove three things about it:
 *
 *   1. it is the tool's OWN verdict, extracted check-for-check — a frozen copy
 *      of the component's inline Check (the LEGACY ORACLE below) agrees with it
 *      on every fixture that has an answer key;
 *   2. the browser path (gradeToolCheck) and the server path
 *      (gradeServerResponse over the serialized response) agree exactly;
 *   3. it is a function of the work and the KEY — the same work against an
 *      altered key is marked wrong.
 */

const COMPONENT = 'src/tools/intervalNumberLine/IntervalNumberLine.jsx';
const componentCode = () => executableSource(fs.readFileSync(COMPONENT, 'utf8'));

// ---------------------------------------------------------------------------
// The work exactly as IntervalNumberLine builds it: rays carry ±Infinity.
// ---------------------------------------------------------------------------
const segment = (min, max, minClosed, maxClosed) => ({ min, max, minClosed, maxClosed });
const leftRay = (max, maxClosed) => ({ min: -Infinity, max, minClosed: false, maxClosed });
const rightRay = (min, minClosed) => ({ min, max: Infinity, minClosed, maxClosed: false });
const toolWork = ({ intervals = [], notation = '', inequality = '' } = {}) => ({ intervals, notation, inequality });

const question = (extra) => ({ type: 'intervalNumberLine', prompt: 'Graph the solution.', min: -8, max: 8, ...extra });

const BOUNDED = question({ intervals: [{ min: -3, max: 5, minClosed: true, maxClosed: false }], ask: ['graph', 'interval'] });
// No `ask`: the tool asks for the graph and the interval notation.
const DEFAULT_ASK = question({ intervals: [{ min: -3, max: 5, minClosed: true, maxClosed: false }] });
// Authored the way the catalog documents an unbounded end: null / 'inf'.
const RAYS = question({
  intervals: [
    { min: null, max: -3, minClosed: false, maxClosed: true },
    { min: 2, max: 'inf', minClosed: false, maxClosed: false },
  ],
  ask: ['graph', 'interval'],
});
const FRACTIONS = question({ intervals: [{ min: -1.625, max: 1.625, minClosed: true, maxClosed: false }], ask: ['graph', 'interval'] });
const ROOT = question({ intervals: [{ min: Math.sqrt(5), max: null, minClosed: true, maxClosed: false }], ask: ['interval'] });
const INEQUALITY = question({
  intervals: [{ min: -3, max: 5, minClosed: true, maxClosed: false }],
  ask: ['graph', 'inequality'],
  variable: 't',
});
const ALL_STAGES = question({
  intervals: [{ min: null, max: -3, maxClosed: true }, { min: 2, max: null }],
  ask: ['graph', 'interval', 'inequality'],
});
const GRAPH_ONLY = question({ intervals: [{ min: 4, max: null, minClosed: true }], ask: ['graph'] });

const CORRECT = {
  bounded: toolWork({ intervals: [segment(-3, 5, true, false)], notation: '[-3, 5)' }),
  rays: toolWork({ intervals: [rightRay(2, false), leftRay(-3, true)], notation: '(-\\infty, -3] \\cup (2, \\infty)' }),
  fractions: toolWork({ intervals: [segment(-1.625, 1.625, true, false)], notation: '[-13/8, 13/8)' }),
  root: toolWork({ notation: '[\\sqrt{5}, \\infty)' }),
  inequality: toolWork({ intervals: [segment(-3, 5, true, false)], inequality: '-3 ≤ t < 5' }),
  allStages: toolWork({
    intervals: [leftRay(-3, true), rightRay(2, false)],
    notation: '(-∞, -3] ∪ (2, ∞)',
    inequality: 'x ≤ -3 or x > 2',
  }),
  graphOnly: toolWork({ intervals: [rightRay(4, true)] }),
};

// ---------------------------------------------------------------------------
// LEGACY ORACLE — IntervalNumberLine.jsx's inline Check as it stood before the
// extraction (commit 1939fcc), copied verbatim. A pinned record of the verdict
// students received, so the extraction is held to it fixture by fixture. Not
// used by any production code.
// ---------------------------------------------------------------------------
const legacyTidyNumber = (value) => Number(Number(value).toFixed(10));
const legacyReadBraceGroup = (source, startIndex) => {
  if (source[startIndex] !== '{') return null;
  let depth = 0;
  for (let index = startIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return { content: source.slice(startIndex + 1, index), endIndex: index };
    }
  }
  return null;
};
const legacyReplaceLatexFractions = (raw) => {
  let source = String(raw || '');
  const command = /\\(?:dfrac|tfrac|frac)/;
  for (let guard = 0; guard < 20; guard += 1) {
    const match = command.exec(source);
    if (!match) break;
    const commandStart = match.index;
    let cursor = commandStart + match[0].length;
    while (/\s/.test(source[cursor] || '')) cursor += 1;
    const numerator = legacyReadBraceGroup(source, cursor);
    if (!numerator) break;
    cursor = numerator.endIndex + 1;
    while (/\s/.test(source[cursor] || '')) cursor += 1;
    const denominator = legacyReadBraceGroup(source, cursor);
    if (!denominator) break;
    const replacement = `((${legacyReplaceLatexFractions(numerator.content)})/(${legacyReplaceLatexFractions(denominator.content)}))`;
    source = `${source.slice(0, commandStart)}${replacement}${source.slice(denominator.endIndex + 1)}`;
  }
  return source;
};
const legacyReplaceLatexRoots = (raw) => {
  let source = String(raw || '');
  for (let guard = 0; guard < 20; guard += 1) {
    const index = source.indexOf('\\sqrt');
    if (index < 0) break;
    let cursor = index + '\\sqrt'.length;
    while (/\s/.test(source[cursor] || '')) cursor += 1;
    const group = legacyReadBraceGroup(source, cursor);
    if (!group) break;
    source = `${source.slice(0, index)}sqrt(${legacyReplaceLatexRoots(group.content)})${source.slice(group.endIndex + 1)}`;
  }
  return source;
};
const legacyParseExactNumberLineValue = (raw) => {
  const source = legacyReplaceLatexRoots(legacyReplaceLatexFractions(
    String(raw ?? '')
      .replace(/[−–—]/g, '-')
      .replace(/\\left|\\right/g, '')
      .replace(/\\,/g, '')
      .replace(/\\cdot|\\times/g, '*')
      .replace(/\\div/g, '/')
      .replace(/\\pi/g, 'pi')
      .trim(),
  ));
  if (!source) return null;
  const identifiers = source.match(/[A-Za-z]+/g) || [];
  if (identifiers.some((name) => !['sqrt', 'pi', 'e'].includes(name))) return null;
  if (!/^[0-9A-Za-z+\-*/().^\s]+$/.test(source)) return null;
  try {
    const value = Number(evaluate(source));
    return Number.isFinite(value) ? legacyTidyNumber(value) : null;
  } catch {
    return null;
  }
};
const legacyParseFlexibleIntervalNotation = (text) => {
  const source = String(text || '')
    .replace(/[−–—]/g, '-')
    .replace(/\\left|\\right/g, '')
    .replace(/\\lbrack/g, '[')
    .replace(/\\rbrack/g, ']')
    .replace(/\\infty/g, '∞')
    .replace(/\\cup/g, '∪')
    .replace(/\\(?:,|;|!|quad|qquad)/g, '')
    .replace(/infinity|infty|inf/gi, '∞')
    .replace(/\bU\b/g, '∪')
    .trim();
  if (!source) return null;
  const pieces = source.split('∪').map((piece) => piece.trim()).filter(Boolean);
  const intervals = [];
  for (const piece of pieces) {
    const open = piece[0];
    const close = piece[piece.length - 1];
    if (!['(', '['].includes(open) || ![')', ']'].includes(close)) return null;
    const inside = piece.slice(1, -1);
    const commaIndex = inside.indexOf(',');
    if (commaIndex < 0) return null;
    const lowerText = inside.slice(0, commaIndex).trim();
    const upperText = inside.slice(commaIndex + 1).trim();
    const endpoint = (value, side) => {
      const normalized = value.replace(/\s+/g, '');
      if (normalized === '∞' || normalized === '+∞') return Infinity;
      if (normalized === '-∞') return -Infinity;
      const parsed = legacyParseExactNumberLineValue(value);
      if (parsed == null) return null;
      if (side === 'lower' && parsed === Infinity) return null;
      if (side === 'upper' && parsed === -Infinity) return null;
      return parsed;
    };
    const min = endpoint(lowerText, 'lower');
    const max = endpoint(upperText, 'upper');
    if (min == null || max == null || min > max) return null;
    intervals.push({ min, max, minClosed: Number.isFinite(min) && open === '[', maxClosed: Number.isFinite(max) && close === ']' });
  }
  return normalizeIntervals(intervals);
};
const legacyAsk = (rawAsk) => {
  const requested = Array.isArray(rawAsk) ? rawAsk.filter((stage) => INTERVAL_ASK_STAGES.includes(stage)) : [];
  return requested.length ? requested : ['graph', 'interval'];
};
const legacyCheck = (questionData, { intervals: built, notation, inequality }) => {
  const expected = normalizeIntervals(questionData.intervals);
  const variable = questionData.variable || 'x';
  const ask = legacyAsk(questionData.ask);
  const checks = {};
  if (ask.includes('graph')) checks.graph = sameIntervals(built, expected);
  if (ask.includes('interval')) {
    const parsed = legacyParseFlexibleIntervalNotation(notation);
    checks.interval = parsed ? sameIntervals(parsed, expected) : false;
  }
  if (ask.includes('inequality')) {
    const tidy = (text) => String(text || '').replace(/\s+/g, '').replace(/[−–—]/g, '-').toLowerCase();
    checks.inequality = tidy(inequality) === tidy(intervalsToInequality(expected, variable));
  }
  const values = Object.values(checks);
  const score = values.length ? values.filter(Boolean).length / values.length : 0;
  return { isCorrect: values.every(Boolean), score, checks };
};

// ---------------------------------------------------------------------------
// Both paths, asserted to agree every time.
// ---------------------------------------------------------------------------
const gradeBothWays = (questionData, work) => {
  const browser = gradeToolCheck(intervalGrader, questionData, work);
  assert.ok(browser.toolResponse, 'the browser path always produces the response it would send');
  const server = gradeServerResponse({ question: questionData, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.graded === true, browser.graded, 'graded parity');
  assert.equal(server.isCorrect, browser.isCorrect, 'isCorrect parity');
  assert.equal(server.isComplete, browser.isComplete, 'isComplete parity');
  assert.equal(server.score, browser.score, 'score parity');
  assert.deepEqual(server.parts, browser.parts, 'parts parity');
  if (!browser.graded) assert.equal(server.reason, browser.reason, 'the same refusal on both paths');
  return browser;
};

const checksOf = (result) => Object.fromEntries(result.parts.map((part) => [part.id, part.isCorrect]));

// Every fixture below runs through the parity and legacy-oracle sweeps.
const FIXTURES = [];
const fixture = (name, questionData, work) => {
  FIXTURES.push({ name, question: questionData, work });
  return { question: questionData, work };
};

fixture('bounded correct', BOUNDED, CORRECT.bounded);
fixture('default ask correct', DEFAULT_ASK, CORRECT.bounded);
fixture('rays correct', RAYS, CORRECT.rays);
fixture('fractions correct', FRACTIONS, CORRECT.fractions);
fixture('root correct', ROOT, CORRECT.root);
fixture('inequality correct', INEQUALITY, CORRECT.inequality);
fixture('all stages correct', ALL_STAGES, CORRECT.allStages);
fixture('graph only correct', GRAPH_ONLY, CORRECT.graphOnly);
fixture('bounded, wrong closed end', BOUNDED, toolWork({ intervals: [segment(-3, 5, true, true)], notation: '[-3, 5]' }));
fixture('bounded, graph right notation wrong', BOUNDED, toolWork({ intervals: [segment(-3, 5, true, false)], notation: '(-3, 5)' }));
fixture('bounded, notation right graph wrong', BOUNDED, toolWork({ intervals: [segment(-2, 5, true, false)], notation: '[-3,5)' }));
fixture('bounded, nothing done', BOUNDED, toolWork());
fixture('bounded, notation only', BOUNDED, toolWork({ notation: '[-3, 5)' }));
fixture('bounded, two pieces for one', BOUNDED, toolWork({ intervals: [segment(-3, 1, true, false), segment(1, 5, true, false)], notation: '[-3, 1) ∪ [1, 5)' }));
fixture('rays, wrong direction', RAYS, toolWork({ intervals: [leftRay(2, false), leftRay(-3, true)], notation: '(-inf, -3] U (-inf, 2)' }));
fixture('rays, plain-text notation', RAYS, toolWork({ intervals: [leftRay(-3, true), rightRay(2, false)], notation: '(-inf, -3] U (2, inf)' }));
fixture('rays, unicode notation reversed', RAYS, toolWork({ intervals: [leftRay(-3, true), rightRay(2, false)], notation: '(2, ∞) ∪ (−∞, −3]' }));
fixture('rays, closed infinity', RAYS, toolWork({ intervals: [leftRay(-3, true), rightRay(2, false)], notation: '[-∞, -3] ∪ (2, ∞]' }));
fixture('fractions, latex', FRACTIONS, toolWork({ intervals: [segment(-1.625, 1.625, true, false)], notation: '\\left\\lbrack-\\frac{13}{8},\\frac{13}{8}\\right)' }));
fixture('fractions, decimals', FRACTIONS, toolWork({ intervals: [segment(-1.625, 1.625, true, false)], notation: '[-1.625, 1.625)' }));
fixture('fractions, wrong fraction', FRACTIONS, toolWork({ intervals: [segment(-1.625, 1.625, true, false)], notation: '[-13/6, 13/8)' }));
fixture('root, sqrt text', ROOT, toolWork({ notation: '[sqrt(5), infinity)' }));
fixture('root, wrong bracket', ROOT, toolWork({ notation: '(sqrt(5), inf)' }));
fixture('root, unreadable endpoint', ROOT, toolWork({ notation: '[cbrt(5), inf)' }));
fixture('inequality, spacing and case', INEQUALITY, toolWork({ intervals: [segment(-3, 5, true, false)], inequality: '−3≤T<5' }));
fixture('inequality, wrong relation', INEQUALITY, toolWork({ intervals: [segment(-3, 5, true, false)], inequality: '-3 < t ≤ 5' }));
fixture('inequality, wrong variable', INEQUALITY, toolWork({ intervals: [segment(-3, 5, true, false)], inequality: '-3 ≤ x < 5' }));
fixture('all stages, two of three', ALL_STAGES, toolWork({ ...CORRECT.allStages, inequality: 'x < -3 or x > 2' }));
fixture('all stages, one of three', ALL_STAGES, toolWork({ intervals: [leftRay(-3, true)], notation: '(-∞, -3]', inequality: 'x ≤ -3 or x > 2' }));
fixture('graph only, open where closed', GRAPH_ONLY, toolWork({ intervals: [rightRay(4, false)] }));
fixture('graph only, pieces in any order', question({ intervals: [{ min: null, max: -1 }, { min: 1, max: 3, minClosed: true, maxClosed: true }], ask: ['graph'] }),
  toolWork({ intervals: [segment(1, 3, true, true), leftRay(-1, false)] }));

// ---------------------------------------------------------------------------

test('declaration: one shared, server-authoritative mode, resolved exactly as the tool renders', () => {
  assert.equal(GRADING_MANIFEST.intervalNumberLine, intervalDeclaration);
  assert.equal(intervalDeclaration.contractVersion, 1);
  assert.deepEqual(Object.keys(intervalDeclaration.modes), ['numberLine']);
  assert.equal(intervalDeclaration.modes.numberLine.authority, 'shared-server-authoritative');
  assert.equal(intervalGrader.toolId, 'intervalNumberLine');
  // The component never reads question.mode: every question gets the same view,
  // with the asked stages beside it. So every question resolves to that view.
  for (const authored of [{}, { mode: 'graph' }, { mode: 'interval' }, { mode: 'numberLine' }, { mode: 'features' }, { mode: '' }, { ask: ['inequality'], mode: 'inequality' }]) {
    assert.equal(resolveToolMode(intervalDeclaration, question({ intervals: BOUNDED.intervals, ...authored })), 'numberLine', JSON.stringify(authored));
  }
  assert.doesNotMatch(componentCode(), /questionData\??\.mode\b/, 'the component must not start routing on question.mode without the declaration following');
});

test('ask stages resolve exactly as the tool always resolved them', () => {
  const asks = [undefined, null, [], 'graph', ['graph'], ['interval'], ['inequality'], ['notation'], ['graph', 'notation'],
    ['inequality', 'graph'], ['graph', 'graph'], [null, 3, 'graph'], ['GRAPH'], ['graph', 'interval', 'inequality']];
  asks.forEach((ask) => assert.deepEqual(resolveIntervalAsk(ask), legacyAsk(ask), JSON.stringify(ask)));
  // The component's stages come from the same function the grader uses.
  const source = componentCode();
  assert.match(source, /const ask = useMemo\(\(\) => resolveIntervalAsk\(questionData\.ask\)/);
  // Parts follow the tool's fixed stage order, whatever order `ask` lists.
  const result = gradeBothWays(question({ intervals: BOUNDED.intervals, ask: ['inequality', 'graph'] }), CORRECT.bounded);
  assert.deepEqual(result.parts.map((part) => part.id), ['graph', 'inequality']);
});

test('every fixture: the browser Check and the server ingestion agree exactly', () => {
  assert.ok(FIXTURES.length >= 30);
  FIXTURES.forEach(({ name, question: questionData, work }) => {
    assert.doesNotThrow(() => gradeBothWays(questionData, work), name);
  });
});

test('every keyed fixture: the shared grader is the tool\'s own pre-extraction verdict', () => {
  FIXTURES.forEach(({ name, question: questionData, work }) => {
    const legacy = legacyCheck(questionData, work);
    const shared = gradeBothWays(questionData, work);
    assert.equal(shared.graded, true, name);
    assert.equal(shared.isCorrect, legacy.isCorrect, `${name}: isCorrect`);
    assert.equal(shared.score, legacy.score, `${name}: score`);
    assert.deepEqual(checksOf(shared), legacy.checks, `${name}: per-stage checks`);
    // QuestionEngine's percentage from the tool's score, unchanged.
    assert.equal(attemptInputsFromGrading(shared).partialCreditPercent, Math.round(legacy.score * 100), `${name}: partial credit`);
  });
});

test('fully correct work is correct and complete on every stage combination', () => {
  [
    [BOUNDED, CORRECT.bounded, ['graph', 'interval']],
    [DEFAULT_ASK, CORRECT.bounded, ['graph', 'interval']],
    [RAYS, CORRECT.rays, ['graph', 'interval']],
    [FRACTIONS, CORRECT.fractions, ['graph', 'interval']],
    [ROOT, CORRECT.root, ['interval']],
    [INEQUALITY, CORRECT.inequality, ['graph', 'inequality']],
    [ALL_STAGES, CORRECT.allStages, ['graph', 'interval', 'inequality']],
    [GRAPH_ONLY, CORRECT.graphOnly, ['graph']],
  ].forEach(([questionData, work, stages]) => {
    const result = gradeBothWays(questionData, work);
    assert.equal(result.isCorrect, true, JSON.stringify(questionData.ask));
    assert.equal(result.isComplete, true);
    assert.equal(result.score, 1);
    assert.deepEqual(result.parts.map((part) => part.id), stages);
    assert.ok(result.parts.every((part) => part.isCorrect && part.isComplete));
  });
});

test('incorrect work is incorrect, stage by stage', () => {
  const wrongEnd = gradeBothWays(BOUNDED, toolWork({ intervals: [segment(-3, 5, true, true)], notation: '[-3, 5]' }));
  assert.equal(wrongEnd.isCorrect, false);
  assert.equal(wrongEnd.score, 0);
  assert.deepEqual(checksOf(wrongEnd), { graph: false, interval: false });

  const wrongWay = gradeBothWays(GRAPH_ONLY, toolWork({ intervals: [leftRay(4, true)] }));
  assert.deepEqual(checksOf(wrongWay), { graph: false });

  const extraPiece = gradeBothWays(GRAPH_ONLY, toolWork({ intervals: [rightRay(4, true), segment(-2, -1, false, false)] }));
  assert.equal(extraPiece.isCorrect, false, 'an extra shaded piece is a different set');

  const openFiniteEnd = gradeBothWays(RAYS, toolWork({ intervals: CORRECT.rays.intervals, notation: '(-∞, -3) ∪ (2, ∞)' }));
  assert.deepEqual(checksOf(openFiniteEnd), { graph: true, interval: false }, 'a round bracket excludes -3, which the key includes');

  const relation = gradeBothWays(INEQUALITY, toolWork({ intervals: [segment(-3, 5, true, false)], inequality: '-3 < t ≤ 5' }));
  assert.deepEqual(checksOf(relation), { graph: true, inequality: false });
});

test('partial credit is stages correct over stages asked', () => {
  const half = gradeBothWays(BOUNDED, toolWork({ intervals: [segment(-3, 5, true, false)], notation: '(-3, 5)' }));
  assert.equal(half.isCorrect, false);
  assert.equal(half.isComplete, true);
  assert.equal(half.score, 0.5);
  assert.equal(attemptInputsFromGrading(half).partialCreditPercent, 50);

  const twoThirds = gradeBothWays(ALL_STAGES, toolWork({ ...CORRECT.allStages, inequality: 'x < -3 or x > 2' }));
  assert.equal(twoThirds.score, 2 / 3);
  assert.equal(attemptInputsFromGrading(twoThirds).partialCreditPercent, 67);
});

test('completeness means every asked stage has an answer; an explicit Check on less is still graded', () => {
  const nothing = gradeBothWays(BOUNDED, toolWork());
  assert.equal(nothing.graded, true, 'an explicit Check is a real attempt');
  assert.equal(nothing.isComplete, false);
  assert.equal(nothing.isCorrect, false);
  assert.equal(nothing.score, 0);
  assert.deepEqual(nothing.parts.map((part) => part.isComplete), [false, false]);

  const graphOnly = gradeBothWays(BOUNDED, toolWork({ intervals: [segment(-3, 5, true, false)] }));
  assert.equal(graphOnly.isComplete, false, 'the notation box is still empty');
  assert.equal(graphOnly.score, 0.5, 'the finished stage still earns its share');

  const blankSpaces = gradeBothWays(BOUNDED, toolWork({ intervals: [segment(-3, 5, true, false)], notation: '   ' }));
  assert.equal(blankSpaces.isComplete, false, 'whitespace is not an answer');

  const finishedWrong = gradeBothWays(BOUNDED, toolWork({ intervals: [segment(0, 1, false, false)], notation: '(0, 1)' }));
  assert.equal(finishedWrong.isComplete, true, 'complete does not mean correct');
  assert.equal(finishedWrong.isCorrect, false);

  // A pending endpoint the student never paired is not a graph.
  const pendingOnly = gradeBothWays(GRAPH_ONLY, { intervals: [], notation: '', inequality: '', pending: { value: 4, closed: true } });
  assert.equal(pendingOnly.isComplete, false);
});

test('equivalent forms the tool accepts are accepted on both paths', () => {
  [
    '[-3,5)', '[-3, 5)', '[ -3 , 5 )', '[-3.0, 5)', '\\left[-3,5\\right)', '\\left\\lbrack-3,5\\right)', '[−3, 5)', '[-6/2, 10/2)', '[-\\frac{6}{2}, 5)',
  ].forEach((notation) => {
    const result = gradeBothWays(BOUNDED, toolWork({ intervals: [segment(-3, 5, true, false)], notation }));
    assert.equal(result.isCorrect, true, notation);
  });
  [
    '(-\\infty, -3] \\cup (2, \\infty)', '(-inf, -3] U (2, inf)', '(-infinity,-3]∪(2,infinity)', '(2, ∞) ∪ (−∞, −3]', '(-∞, -3] ∪ (2, +∞)',
    // The tool has always read a square bracket at ∞ as a round one (so do the
    // canonical parser and My Math Path); parity keeps that leniency.
    '[-∞, -3] ∪ (2, ∞]',
  ].forEach((notation) => {
    assert.equal(gradeBothWays(RAYS, toolWork({ intervals: CORRECT.rays.intervals, notation })).isCorrect, true, notation);
  });
  ['[-13/8, 13/8)', '\\left\\lbrack-\\frac{13}{8},\\frac{13}{8}\\right)', '[-1.625, 1.625)', '[-\\dfrac{13}{8}, 1.625)'].forEach((notation) => {
    assert.equal(gradeBothWays(FRACTIONS, toolWork({ intervals: CORRECT.fractions.intervals, notation })).isCorrect, true, notation);
  });
  ['[sqrt(5), inf)', '[\\sqrt{5}, \\infty)', '[\\sqrt{5},∞)'].forEach((notation) => {
    assert.equal(gradeBothWays(ROOT, toolWork({ notation })).isCorrect, true, notation);
  });
  // The graph is a set: piece order and the order endpoints were placed in do not matter.
  assert.equal(gradeBothWays(RAYS, toolWork({ intervals: [leftRay(-3, true), rightRay(2, false)], notation: '(-∞, -3] ∪ (2, ∞)' })).isCorrect, true);
  // Whitespace, dash style and case in the inequality.
  ['-3 ≤ t < 5', '-3≤t<5', '−3 ≤ T < 5', '  -3  ≤  t  <  5  '].forEach((inequality) => {
    assert.equal(gradeBothWays(INEQUALITY, toolWork({ intervals: [segment(-3, 5, true, false)], inequality })).isCorrect, true, inequality);
  });
  // An authored key of 'inf' / null / an omitted end all mean unbounded.
  const authoredRay = (end) => question({ intervals: [{ min: 4, max: end, minClosed: true }], ask: ['graph'] });
  [null, undefined, 'inf'].forEach((end) => assert.equal(gradeBothWays(authoredRay(end), CORRECT.graphOnly).isCorrect, true, String(end)));
});

test('endpoints are compared to the tool\'s 1e-9, not more loosely', () => {
  const near = gradeBothWays(GRAPH_ONLY, toolWork({ intervals: [rightRay(4 + 1e-11, true)] }));
  assert.equal(near.isCorrect, true);
  const off = gradeBothWays(GRAPH_ONLY, toolWork({ intervals: [rightRay(4 + 1e-6, true)] }));
  assert.equal(off.isCorrect, false);
});

test('unbounded ends survive the response contract as "Infinity" and grade the same as the old null encoding', () => {
  const json = canonicalToolWorkJson(CORRECT.rays);
  assert.match(json, /"max":"Infinity"/);
  assert.match(json, /"min":"-Infinity"/);
  assert.doesNotMatch(json, /null/);
  // A response written before the contract, where JSON turned ±Infinity into null.
  const legacyEncoded = JSON.parse(JSON.stringify(CORRECT.rays));
  assert.equal(legacyEncoded.intervals[0].max, null);
  const fromNull = gradeBothWays(RAYS, legacyEncoded);
  const fromInfinity = gradeBothWays(RAYS, CORRECT.rays);
  assert.equal(fromNull.isCorrect, true);
  assert.deepEqual(fromNull.parts.map((part) => part.isCorrect), fromInfinity.parts.map((part) => part.isCorrect));
});

test('unauthored defaults: ask, variable and an absent viewport follow the tool', () => {
  const bare = { type: 'intervalNumberLine', intervals: [{ min: -3, max: 5, minClosed: true, maxClosed: false }] };
  const result = gradeBothWays(bare, CORRECT.bounded);
  assert.deepEqual(result.parts.map((part) => part.id), ['graph', 'interval']);
  assert.equal(result.isCorrect, true);
  // No `variable`: the inequality is about x.
  const noVariable = { ...bare, ask: ['inequality'] };
  assert.equal(gradeBothWays(noVariable, toolWork({ inequality: '-3 ≤ x < 5' })).isCorrect, true);
  assert.equal(gradeBothWays(noVariable, toolWork({ inequality: '-3 ≤ t < 5' })).isCorrect, false);
  // Only unknown stages (e.g. the legacy name 'notation') fall back to the default.
  assert.deepEqual(gradeBothWays({ ...bare, ask: ['notation'] }, CORRECT.bounded).parts.map((part) => part.id), ['graph', 'interval']);
  // Unbounded on both sides, written as the tool writes it.
  const allReals = { ...bare, intervals: [{ min: null, max: 3, maxClosed: false }, { min: 3, max: null, minClosed: false }], ask: ['inequality'] };
  assert.equal(gradeBothWays(allReals, toolWork({ inequality: 'x < 3 or x > 3' })).isCorrect, true);
});

test('BEHAVIOUR CHANGE (bug fix): the inequality box\'s MathLive LaTeX is read as the symbols it displays', () => {
  // The box is a MathLive field, and MathLive hands back LaTeX: the keypad's
  // ≤ / ≥ serialize as \le / \ge, and typing "or" becomes \lor (a default
  // inline shortcut). The tool compares against the sentence it writes with
  // ≤, ≥ and "or", so the old literal compare rejected EVERY correct answer
  // that used any of them. Only the spelling of the same symbol is unified.
  const RAY_INEQUALITY = question({ intervals: [{ min: 4, max: null, minClosed: true }], ask: ['inequality'] });
  [
    [INEQUALITY, '-3\\le t<5'],
    [INEQUALITY, '-3\\leq t<5'],
    [INEQUALITY, '-3\\leqslant t\\lt 5'],
    [ALL_STAGES, 'x\\le-3\\lor x>2'],
    [ALL_STAGES, 'x\\le -3\\text{ or }x\\gt 2'],
    [RAY_INEQUALITY, 'x\\ge4'],
    [RAY_INEQUALITY, 'x\\geq 4'],
  ].forEach(([questionData, inequality]) => {
    const work = toolWork({ intervals: normalizeIntervals(questionData.intervals), inequality });
    assert.equal(legacyCheck(questionData, work).checks.inequality, false, `before: ${inequality} was rejected`);
    assert.equal(checksOf(gradeBothWays(questionData, work)).inequality, true, `after: ${inequality} is accepted`);
  });
  // Strict vs non-strict, the variable, the order and the connective are all
  // still read literally, and \left is never read as \le.
  [
    [INEQUALITY, '-3\\lt t<5'],
    [INEQUALITY, '-3\\le t\\le 5'],
    [INEQUALITY, '-3\\le x<5'],
    [INEQUALITY, '5>t\\ge-3'],
    [ALL_STAGES, 'x\\lt-3\\lor x>2'],
    [ALL_STAGES, 'x\\le-3\\land x>2'],
    [ALL_STAGES, '\\left(x\\right)\\le-3\\lor x>2'],
    [RAY_INEQUALITY, 'x\\gt4'],
  ].forEach(([questionData, inequality]) => {
    const work = toolWork({ intervals: normalizeIntervals(questionData.intervals), inequality });
    assert.equal(checksOf(gradeBothWays(questionData, work)).inequality, false, inequality);
  });
});

test('BEHAVIOUR CHANGE: no answer key is no verdict, never an empty graph marked correct', () => {
  // Before: the tool compared the student's graph with an empty key, so an
  // empty graph was "correct" (and the server could not see the question).
  const keyless = [
    question({ ask: ['graph'] }),
    question({ intervals: [], ask: ['graph'] }),
    question({ intervals: 'x > 2', ask: ['graph'] }),
    // A Path-style item: its key lives in expectedIntervals, which this tool never read.
    question({ expectedIntervals: [{ start: 2, end: null }], ask: ['graph'] }),
  ];
  keyless.forEach((questionData) => {
    assert.equal(legacyCheck(questionData, toolWork()).isCorrect, true, 'the old verdict this replaces');
    const result = gradeBothWays(questionData, toolWork());
    assert.equal(result.graded, false);
    assert.equal(result.reason, 'no-answer-key');
    assert.equal(result.isCorrect, false);
    assert.equal(result.score, 0);
    assert.equal(serverResponseGradingSupport(questionData).supported, false);
    assert.equal(serverResponseGradingSupport(questionData).reason, 'no-answer-key');
  });
  // A key whose only interval is reversed normalizes to nothing: also no verdict.
  const reversed = question({ intervals: [{ min: 5, max: 3, minClosed: true, maxClosed: true }], ask: ['graph'] });
  const result = gradeBothWays(reversed, toolWork());
  assert.equal(result.graded, false);
  assert.equal(result.reason, 'no-answer-key');
});

test('tampered work: verdict and key fields are ignored, wrong types never crash or pass', () => {
  const injected = {
    ...toolWork({ intervals: [segment(0, 1, false, false)], notation: '(0, 1)' }),
    isCorrect: true, score: 1, checks: { graph: true, interval: true }, expected: BOUNDED.intervals, answerKey: '[-3, 5)', correct: true,
  };
  const { dropped } = boundToolWork(injected);
  ['isCorrect', 'score', 'checks', 'expected', 'answerKey', 'correct'].forEach((key) => assert.ok(dropped.includes(key), key));
  const claimed = gradeBothWays(BOUNDED, injected);
  assert.equal(claimed.isCorrect, false);
  assert.equal(claimed.score, 0);

  // A verdict hidden inside a graph piece is dropped too; the endpoints still decide.
  const pieceClaim = gradeBothWays(GRAPH_ONLY, { intervals: [{ ...rightRay(5, true), isCorrect: true, correct: true }] });
  assert.equal(pieceClaim.isCorrect, false);
  const pieceClaimRight = gradeBothWays(GRAPH_ONLY, { intervals: [{ ...rightRay(4, true), isCorrect: false }] });
  assert.equal(pieceClaimRight.isCorrect, true, 'a dropped claim cannot change a verdict either way');

  [
    { intervals: 'x >= 4' },
    { intervals: { 0: rightRay(4, true) } },
    { intervals: [4, Infinity] },
    { intervals: [null] },
    { intervals: [[4, Infinity]] },
    { intervals: [rightRay(4, true), 'and the rest'] },
    { intervals: [{ min: 'four', max: Infinity, minClosed: true }] },
    { intervals: [{ min: 4, max: Infinity, minClosed: 'true' }] },
  ].forEach((work) => {
    let result;
    assert.doesNotThrow(() => { result = gradeBothWays(GRAPH_ONLY, work); }, JSON.stringify(work));
    assert.equal(result.graded, true);
    assert.equal(result.isCorrect, false, JSON.stringify(work));
  });

  // Typed boxes only ever hold text.
  [['[-3, 5)'], 42, { text: '[-3, 5)' }, true].forEach((notation) => {
    const result = gradeBothWays(question({ intervals: BOUNDED.intervals, ask: ['interval'] }), { notation });
    assert.equal(result.isCorrect, false, JSON.stringify(notation));
    assert.equal(result.isComplete, false);
  });
  const inequalityAsArray = gradeBothWays(INEQUALITY, { intervals: [segment(-3, 5, true, false)], inequality: ['-3 ≤ t < 5'] });
  assert.equal(inequalityAsArray.isCorrect, false);

  // Missing fields entirely.
  const empty = gradeBothWays(BOUNDED, {});
  assert.equal(empty.graded, true);
  assert.equal(empty.isComplete, false);
  assert.equal(empty.isCorrect, false);
});

test('non-object and oversize work is refused, not graded', () => {
  [null, undefined, 'graph', 42, true, []].forEach((work) => {
    const result = gradeBothWays(BOUNDED, work);
    assert.equal(result.graded, false, JSON.stringify(work));
    assert.equal(result.isCorrect, false);
    assert.equal(result.score, 0);
  });
  // Larger than the response contract allows: refused whole rather than truncated.
  const huge = toolWork({
    intervals: Array.from({ length: 300 }, (_, index) => ({ ...segment(index, index + 0.5, true, false), note: 'x'.repeat(200) })),
    notation: '[-3, 5)',
  });
  const result = gradeBothWays(BOUNDED, huge);
  assert.equal(result.graded, false);
  assert.equal(result.reason, 'oversize-response');
  assert.equal(result.toolResponse.oversize, true);
});

test('realistic maximal work is bounded and carries no key or verdict', () => {
  // A student who shades 300 separate pieces and fills both boxes to the limit.
  const maximal = toolWork({
    intervals: Array.from({ length: TOOL_RESPONSE_LIMITS.maxArrayLength }, (_, index) => segment(-1000.125 + index * 6.5, -997.875 + index * 6.5, index % 2 === 0, index % 3 === 0)),
    notation: `[-13/8, 13/8) ∪ ${'(1, 2) ∪ '.repeat(80)}(3, 4)`.slice(0, TOOL_RESPONSE_LIMITS.maxStringLength),
    inequality: `${'x < 1 or '.repeat(110)}x > 2`.slice(0, TOOL_RESPONSE_LIMITS.maxStringLength),
  });
  const bounded = boundToolWork(maximal);
  assert.deepEqual(bounded.dropped, []);
  assert.equal(bounded.truncated, false);
  assert.ok(canonicalToolWorkJson(maximal).length < TOOL_RESPONSE_LIMITS.maxJsonLength, `${canonicalToolWorkJson(maximal).length} chars`);
  const result = gradeBothWays(BOUNDED, maximal);
  assert.equal(result.graded, true);
  assert.equal(result.isCorrect, false);

  // Every realistic work object the tool submits keeps all of its fields.
  Object.values(CORRECT).forEach((work) => {
    assert.deepEqual(boundToolWork(work).dropped, []);
    assert.deepEqual(Object.keys(work).sort(), ['inequality', 'intervals', 'notation']);
  });
});

test('discrimination: correct work against an altered key is marked wrong', () => {
  const alter = (questionData, change) => ({ ...questionData, ...change });
  assert.equal(gradeBothWays(BOUNDED, CORRECT.bounded).isCorrect, true);
  [
    alter(BOUNDED, { intervals: [{ min: -2, max: 5, minClosed: true, maxClosed: false }] }),
    alter(BOUNDED, { intervals: [{ min: -3, max: 5, minClosed: false, maxClosed: false }] }),
    alter(BOUNDED, { intervals: [{ min: -3, max: 5, minClosed: true, maxClosed: true }] }),
    alter(BOUNDED, { intervals: [{ min: -3, max: null, minClosed: true }] }),
    alter(BOUNDED, { intervals: [{ min: -3, max: 5, minClosed: true, maxClosed: false }, { min: 7, max: null }] }),
  ].forEach((altered) => {
    const result = gradeBothWays(altered, CORRECT.bounded);
    assert.equal(result.isCorrect, false, JSON.stringify(altered.intervals));
    assert.ok(result.score < 1);
  });
  assert.equal(gradeBothWays(alter(RAYS, { intervals: [{ min: null, max: -3, maxClosed: false }, { min: 2, max: null }] }), CORRECT.rays).isCorrect, false);
  assert.equal(gradeBothWays(alter(FRACTIONS, { intervals: [{ min: -1.6, max: 1.625, minClosed: true }] }), CORRECT.fractions).isCorrect, false);
  assert.equal(gradeBothWays(alter(ROOT, { intervals: [{ min: 2.236, max: null, minClosed: true }] }), CORRECT.root).isCorrect, false);
  // The inequality is about the question's variable.
  assert.equal(gradeBothWays(alter(INEQUALITY, { variable: 'x' }), CORRECT.inequality).isCorrect, false);
  // And asking for one more stage than was answered is not full credit.
  assert.equal(gradeBothWays(alter(GRAPH_ONLY, { ask: ['graph', 'interval'] }), CORRECT.graphOnly).isCorrect, false);
});

test('the component marks every Check through the shared grader and submits only work', () => {
  const source = componentCode();
  const checkHandler = region(source, 'const check = () =>', 'const message = () =>', 'the Check handler');
  // The verdict is the shared grader's, applied to the same work it submits.
  assert.match(checkHandler, /const result = gradeToolCheck\(intervalNumberLineGrader, questionData, work\);/);
  assert.match(checkHandler, /submit\(\s*\{ isCorrect: result\.isCorrect, score: result\.score \},\s*work,\s*\{ mode: 'numberLine', ask, parts: result\.parts \},\s*\)/);
  // No verdict of its own and no answer key in what it sends.
  assert.doesNotMatch(checkHandler, /expected|sameIntervals|notationMatches|intervalsToInequality|checks/);
  // The grader is this tool's own shared grader, imported next to the call.
  assert.match(source, /^import intervalNumberLineGrader from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/intervalNumberLine\.mjs';$/m);
  assert.match(source, /^import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js';$/m);
  // No inline correctness left anywhere in the component.
  assert.doesNotMatch(source, /from 'mathjs'|sameIntervals\(|notationMatchesFlexible\(|intervalsToInequality\(|parseFlexibleIntervalNotation\(/);
  // Feedback reads the grader's parts.
  const message = region(source, 'const message = () =>', 'const drawn =', 'the feedback message');
  assert.match(message, /feedback\.metadata\?\.parts/);
});

test('the component reports the same live work it submits, and only as the question itself', () => {
  const source = componentCode();
  assert.match(source, /^import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js';$/m);
  assert.match(source, /const work = useMemo\(\(\) => \(\{ intervals: built, notation, inequality \}\), \[built, notation, inequality\]\);/);
  assert.match(source, /useReportToolWork\(work, \{ enabled: isIntervalNumberLineQuestion\(questionData\) \}\);/);
  const gate = region(source, 'const isIntervalNumberLineQuestion', 'export default function', 'the reporting gate');
  assert.match(gate, /questionData\?\.toolId === 'intervalNumberLine' \|\| questionData\?\.type === 'intervalNumberLine'/);
});
