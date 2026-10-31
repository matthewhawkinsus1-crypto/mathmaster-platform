/*
 * GRAPH THE LINE: THE LINE A CLASS GRAPHED TOGETHER, SHOWN AFTER ITS ROUND.
 *
 * A Classic game with `sameEquations` (its default) gives every student the
 * same line in a round. Once the round has closed — nobody can answer it any
 * more — the class sees that line, how to graph (or name) it, and the wrong
 * answer most of them gave: the worked solution of a shared round. WHEN it is
 * published is liveChallengeSolutionReveal.mjs's rule, as for every shared
 * question.
 *
 *   lineRoundSolutionRecord  captured privately when the round opens: the
 *                            item's line, its key points, its equation and
 *                            the steps to graph or name it
 *   withClassLineFacts       added at the close, from the class's receipts:
 *                            how many answered, how many got it, and the
 *                            wrong answer most students gave — shown only
 *                            when at least two gave it, and only as a count
 *
 * Names a line, never a student. Pure: Cloud Functions and tests.
 */

import * as Q from './graphFeatureRational.mjs';
import { DIAGNOSIS_LABELS, LINE_DIAGNOSIS } from './lineGraphFeedback.mjs';
import { isHorizontal, isVertical, lineKey, slopeOf, xInterceptOf, yInterceptOf } from './lineGraphMath.mjs';
import { RECEIPT_KIND, isAttemptReceipt, playerWorkReceipts, receiptKindOf } from './liveChallengeResponses.mjs';
import { POINT_SLOPE_LAYOUT, presentEquation, slopeInterceptTokens, specialTokens, standardTokens } from './lineGraphForms.mjs';
import { LINE_ATTEMPT_KIND, LINE_FORM, LINE_ITEM_TYPE, SPECIAL_FORM } from './lineGraphRules.mjs';

// A wrong answer is shown to the class only when at least this many students
// gave it: one student's slip is theirs, not the class's.
export const CLASS_MISTAKE_MIN_STUDENTS = 2;

const MINUS = '−';

const numberText = (value) => {
  const r = Q.toRational(value);
  const magnitude = r.d === 1 ? String(Math.abs(r.n)) : `${Math.abs(r.n)}/${r.d}`;
  return r.n < 0 ? `${MINUS}${magnitude}` : magnitude;
};

const pointText = (point) => `(${numberText(point.x)}, ${numberText(point.y)})`;

// "up 2, right 3" for a slope n/d (d > 0): the rise, then the run.
const stepText = (slope) => {
  const r = Q.toRational(slope);
  const rise = r.n === 0 ? null : `${r.n > 0 ? 'up' : 'down'} ${Math.abs(r.n)}`;
  return [rise, `right ${r.d}`].filter(Boolean).join(', ');
};

const stepFrom = (point, slope) => {
  const r = Q.toRational(slope);
  return { x: Number(point.x) + r.d, y: Number(point.y) + r.n };
};

const integerValue = (value) => value !== null && Q.toRational(value).d === 1;

// The two grid points of the item that a reveal draws, as numbers.
const plainPoints = (points = []) => (Array.isArray(points) ? points : [])
  .map((point) => ({ x: Number(point.x), y: Number(point.y) }));

/* --------------------------------- steps --------------------------------- */

const graphSteps = (item) => {
  const { line } = item;
  const [first, second] = plainPoints(item.reveal?.points);
  if (item.form === SPECIAL_FORM || isHorizontal(line) || isVertical(line)) {
    if (isVertical(line)) {
      const h = xInterceptOf(line);
      return [`Every point on the line has x = ${numberText(h)}.`, `It is the vertical line through ${pointText({ x: h, y: 0 })}.`];
    }
    const k = yInterceptOf(line);
    return [`Every point on the line has y = ${numberText(k)}.`, `It is the horizontal line through ${pointText({ x: 0, y: k })}.`];
  }
  const m = slopeOf(line);
  if (item.form === LINE_FORM.STANDARD) {
    const xi = xInterceptOf(line);
    const yi = yInterceptOf(line);
    if (Q.isZero(line.c)) {
      const next = second || stepFrom({ x: 0, y: 0 }, m);
      return [
        'C is 0, so the line goes through the origin, (0, 0).',
        `Find a second point: ${pointText(next)} makes the equation true.`,
        'Draw the line through the two points.',
      ];
    }
    if (integerValue(xi) && integerValue(yi)) {
      return [
        `Set x = 0 and solve for y: the y-intercept is ${pointText({ x: 0, y: yi })}.`,
        `Set y = 0 and solve for x: the x-intercept is ${pointText({ x: xi, y: 0 })}.`,
        'Draw the line through the two intercepts.',
      ];
    }
    return [
      'An intercept falls between grid lines, so find two grid points that make the equation true.',
      first && second ? `${pointText(first)} and ${pointText(second)} both work.` : 'Try whole-number values of x.',
      'Draw the line through those points.',
    ];
  }
  if (item.form === LINE_FORM.POINT_SLOPE) {
    const point = item.spec?.point ? { x: Q.toNumber(item.spec.point.x), y: Q.toNumber(item.spec.point.y) } : first;
    // Written y − y₁ = m(x − x₁), the point's signs are the opposite of what
    // is printed; solved for y (y = m(x − h) + k), only x's is.
    const signs = item.spec?.layout === POINT_SLOPE_LAYOUT.SOLVED_FOR_Y
      ? 'the sign inside the parentheses is the opposite of the x-coordinate'
      : 'the signs inside y − y₁ and x − x₁ are the opposite of the coordinates';
    return [
      `The point in the equation is ${pointText(point)} — ${signs}.`,
      `The slope is ${numberText(m)}: from that point go ${stepText(m)}, to ${pointText(stepFrom(point, m))}.`,
      'Draw the line through the two points.',
    ];
  }
  // Slope-intercept.
  const b = yInterceptOf(line);
  if (integerValue(b)) {
    const start = { x: 0, y: Q.toNumber(b) };
    return [
      `The y-intercept is ${numberText(b)}: start at ${pointText(start)}.`,
      `The slope is ${numberText(m)}: go ${stepText(m)}, to ${pointText(stepFrom(start, m))}.`,
      'Draw the line through the two points.',
    ];
  }
  return [
    `The y-intercept, ${numberText(b)}, is between grid lines — find a grid point on the line instead.`,
    first ? `${pointText(first)} is on it. The slope is ${numberText(m)}: go ${stepText(m)}, to ${pointText(stepFrom(first, m))}.` : `The slope is ${numberText(m)}.`,
    'Draw the line through the two points.',
  ];
};

// The key idea of graphing this line, in a sentence: the same cases as its
// steps. The prompt already says which equation.
const graphHeadline = (item) => {
  const { line } = item;
  if (item.form === SPECIAL_FORM || isHorizontal(line) || isVertical(line)) {
    return isVertical(line) ? 'A vertical line: every point has the same x.' : 'A horizontal line: every point has the same y.';
  }
  if (item.form === LINE_FORM.STANDARD) {
    if (Q.isZero(line.c)) return 'Through the origin: find one more point.';
    return integerValue(xInterceptOf(line)) && integerValue(yInterceptOf(line))
      ? 'Find both intercepts, then connect them.'
      : 'Find two grid points that make the equation true.';
  }
  if (item.form === LINE_FORM.POINT_SLOPE) return 'Start at the point in the equation, then use the slope.';
  return integerValue(yInterceptOf(line))
    ? 'Start at the y-intercept, then use the slope.'
    : 'Find a grid point on the line, then use the slope.';
};

const nameSteps = (item) => {
  const { line } = item;
  if (item.form === SPECIAL_FORM || isHorizontal(line) || isVertical(line)) {
    return isVertical(line)
      ? [`Every point on the line has the same x: ${numberText(xInterceptOf(line))}.`, 'A vertical line is x = h.']
      : [`Every point on the line has the same y: ${numberText(yInterceptOf(line))}.`, 'A horizontal line is y = k.'];
  }
  const m = slopeOf(line);
  if (item.form === LINE_FORM.STANDARD) {
    const xi = xInterceptOf(line);
    const yi = yInterceptOf(line);
    return [
      integerValue(xi) && integerValue(yi)
        ? `The line crosses the x-axis at ${pointText({ x: xi, y: 0 })} and the y-axis at ${pointText({ x: 0, y: yi })}.`
        : `The slope is ${numberText(m)}, read between two grid points.`,
      'Standard form uses whole numbers for A, B and C.',
    ];
  }
  if (item.form === LINE_FORM.POINT_SLOPE && item.marked) {
    return [
      `The marked point is ${pointText(item.marked)}.`,
      `Between two grid points the line goes ${stepText(m)}: the slope is ${numberText(m)}.`,
    ];
  }
  const b = yInterceptOf(line);
  return [
    `The line crosses the y-axis at ${pointText({ x: 0, y: b })}: b = ${numberText(b)}.`,
    `It goes ${stepText(m)}: the slope is m = ${numberText(m)}.`,
  ];
};

/**
 * The private record of a shared round's line, captured when the round opens
 * from the item every student received. Null without an item.
 */
export const lineRoundSolutionRecord = (item) => {
  if (!item?.line) return null;
  const graphing = item.itemType === LINE_ITEM_TYPE.GRAPH;
  const equation = graphing ? item.equation : item.answer;
  if (!equation?.text) return null;
  return Object.freeze({
    prompt: graphing ? `Graph ${equation.text}.` : 'Name the line.',
    teksCode: null,
    solutionReview: Object.freeze({
      headline: graphing ? graphHeadline(item) : `The line is ${equation.text}`,
      reasoning: Object.freeze(graphing ? graphSteps(item) : nameSteps(item)),
      // The class's own most common mistake is added at the close.
      commonError: null,
      connection: null,
      answerSummary: equation.text,
    }),
    lineGraph: Object.freeze({
      itemType: item.itemType,
      form: item.form,
      view: Object.freeze({ ...item.view }),
      line: Object.freeze({ a: item.line.a, b: item.line.b, c: item.line.c }),
      keyPoints: Object.freeze(plainPoints(item.anchors)),
      revealPoints: Object.freeze(plainPoints(item.reveal?.points)),
      marked: item.marked ? Object.freeze({ x: Number(item.marked.x), y: Number(item.marked.y) }) : null,
      equation: Object.freeze({ tokens: equation.tokens, text: equation.text, speech: equation.speech }),
      // A chosen item's options, so a tapped wrong option can be drawn.
      choices: Array.isArray(item.choices)
        ? Object.freeze(item.choices.map((choice) => Object.freeze({ id: choice.id, line: Object.freeze({ ...choice.line }), text: choice.equation?.text || null })))
        : null,
    }),
  });
};

/* ------------------------------ the class -------------------------------- */

const integerOr = (value, fallback) => {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : fallback;
};

// A wrong line written the way the item's form writes lines: standard form
// as Ax + By = C, anything else as y = mx + b; x = h and y = k as themselves.
const lineText = (line, form) => {
  if (line.b === 0) return presentEquation(specialTokens({ axis: 'x', value: xInterceptOf(line) })).text;
  if (form === LINE_FORM.STANDARD) return presentEquation(standardTokens({ A: line.a, B: line.b, C: line.c })).text;
  if (line.a === 0) return presentEquation(specialTokens({ axis: 'y', value: yInterceptOf(line) })).text;
  return presentEquation(slopeInterceptTokens({ m: slopeOf(line), b: yInterceptOf(line) })).text;
};

// The line a wrong answer drew: `line:a|b|c` (a drawn or typed line) or
// `choice:x` (a tapped option).
const wrongLineOf = (answerKey, record) => {
  const key = String(answerKey || '');
  if (key.startsWith('line:')) {
    const [a, b, c] = key.slice(5).split('|').map(Number);
    if (![a, b, c].every(Number.isSafeInteger) || (a === 0 && b === 0)) return null;
    return { line: { a, b, c }, text: lineText({ a, b, c }, record.lineGraph.form) };
  }
  if (key.startsWith('choice:')) {
    const choice = (record.lineGraph.choices || []).find((option) => option.id === key.slice(7));
    return choice ? { line: choice.line, text: choice.text } : null;
  }
  return null;
};

/**
 * The class's round with this line, from every joined player's receipts:
 * how many answered, how many got it (and on the first try), and the wrong
 * answer most students gave (when at least CLASS_MISTAKE_MIN_STUDENTS did).
 * All of each student's work, what one with extended time did after the
 * buzzer included: the facts are published only once nobody can answer, and
 * are counts, never who.
 */
export const classLineFacts = ({ record, players = [], roundIndex }) => {
  const round = integerOr(roundIndex, -1);
  let answered = 0;
  let correct = 0;
  let firstTry = 0;
  const wrong = new Map();
  (Array.isArray(players) ? players : []).forEach((player, position) => {
    if (player?.joined !== true) return;
    const receipts = Object.values(playerWorkReceipts(player))
      .filter((receipt) => isAttemptReceipt(receipt) && receiptKindOf(receipt) === RECEIPT_KIND.TARGET && integerOr(receipt.roundIndex, null) === round)
      .sort((left, right) => integerOr(left.sequence, 0) - integerOr(right.sequence, 0));
    if (!receipts.length) return;
    answered += 1;
    if (receipts.some((receipt) => receipt.isCorrect === true && receipt.completesQuestion === true)) correct += 1;
    if (receipts[0].isCorrect === true && receipts[0].completesQuestion === true) firstTry += 1;
    const student = String(player.playerKey || player.studentId || position);
    receipts
      .filter((receipt) => receipt.isCorrect !== true && receipt.attemptKind !== LINE_ATTEMPT_KIND.SKIP && receipt.answerKey)
      .forEach((receipt) => {
        const entry = wrong.get(receipt.answerKey) || { students: new Set(), diagnosis: receipt.diagnosis || null };
        entry.students.add(student);
        wrong.set(receipt.answerKey, entry);
      });
  });
  const [topKey, top] = [...wrong.entries()]
    .sort(([leftKey, left], [rightKey, right]) => right.students.size - left.students.size || (leftKey < rightKey ? -1 : 1))[0] || [];
  const drawn = top && top.students.size >= CLASS_MISTAKE_MIN_STUDENTS ? wrongLineOf(topKey, record) : null;
  return Object.freeze({
    answered,
    correct,
    firstTry,
    mistake: drawn ? Object.freeze({
      students: top.students.size,
      line: Object.freeze(drawn.line),
      text: drawn.text,
      // What the line shows, as the report names it — but no label for a line
      // nothing modelled explains ("other wrong lines" says nothing).
      label: top.diagnosis === LINE_DIAGNOSIS.OFF_TRACK ? null : DIAGNOSIS_LABELS[top.diagnosis] || null,
    }) : null,
  });
};

/** The record as it is published at the close: the class's facts added, and its common error said in words. */
export const withClassLineFacts = ({ record, players = [], roundIndex }) => {
  if (!record?.lineGraph) return record;
  const facts = classLineFacts({ record, players, roundIndex });
  const mistake = facts.mistake;
  const commonError = mistake
    ? `${mistake.students} students ${record.lineGraph.itemType === LINE_ITEM_TYPE.GRAPH ? 'drew' : 'chose'} ${mistake.text || 'the same wrong line'}${mistake.label ? ` — ${mistake.label.charAt(0).toLowerCase()}${mistake.label.slice(1)}` : ''}.`
    : null;
  return Object.freeze({
    ...record,
    solutionReview: Object.freeze({ ...record.solutionReview, commonError }),
    lineGraph: Object.freeze({ ...record.lineGraph, class: facts }),
  });
};

/** The key that holds a reveal while a later round asks the same line (revealableRounds' questionKeys). */
export const lineRevealKey = (item) => (item?.line ? `line|${lineKey(item.line)}` : null);
