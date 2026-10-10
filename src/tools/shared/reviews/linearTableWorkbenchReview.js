// Worked solution review for linearTableWorkbench (contract: ../toolSolutionReview.js, textOnlyReview).
/*
 * THE LINEAR TABLE WORKBENCH'S WORKED SOLUTION — THE ANSWER ITS GRADER ACCEPTS.
 *
 * Every mode of the workbench is graded against truths derived from the
 * authored rows alone (functions/shared/serverGrading/tools/linearTableWorkbench.mjs
 * → scoreLinearTableWorkbench): each recorded interval's Δx, Δy and rate
 * (intervalTruth: always from the smaller x to the larger x), the
 * linear/nonlinear classification (tableClassification), the single offending
 * row and its corrected y (findTableRepair) and the fitted m and b
 * (fitTableLine). This review is built from those same helpers, with the same
 * view resolution (resolveLinearTableWorkbenchMode) and the same interval
 * count the Check button waits for (linearTableRequiredComparisons).
 *
 * The intervals are open-ended — any distinct, correctly computed row pairs
 * count — so the review records one valid set (neighbouring rows in order of
 * x first) and says so in its note. For a nonlinear table the set always
 * holds two intervals with different rates, which the grader requires.
 *
 * Before a review is returned, the work it states (exactly the text shown in
 * its items) is graded by the shared grader through the bytes the server
 * reads (gradeWorkWithGrader). If that work is not complete and correct the
 * review is null: a review never states an answer the gradebook rejects.
 *
 * Returns null for: no question / no rows, fewer than three rows, a blank or
 * non-numeric coordinate, two rows with the same x (not a function), more
 * required intervals than the table has row pairs (the Check button never
 * enables), deriveEquation on a table without a constant rate (Preflight
 * rejects it; the "fitted line" would be a regression the workbench never
 * teaches), and repairValue on a table where no single row is the culprit.
 *
 * Shown only once the question is closed (QuestionEngine); pure, no React.
 */
import linearTableWorkbenchGrader, {
  linearTableRequiredComparisons,
} from '../../../../functions/shared/serverGrading/tools/linearTableWorkbench.mjs';
import { resolveLinearTableWorkbenchMode } from '../../../../functions/shared/serverGrading/declarations/linearTableWorkbench.mjs';
import { gradeWorkWithGrader } from '../../../../functions/shared/serverGrading/toolWorkGrading.mjs';
import { exactFractionText, nearlyEqual } from '../../../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  findTableRepair,
  fitTableLine,
  intervalTruth,
  normalizeRows,
  tableClassification,
} from '../../../../functions/shared/toolMath/linearTableWorkbench/linearTableWorkbenchMath.mjs';

export const implemented = true;

// The words on the workbench's classification buttons.
const CLASSIFICATION_TEXT = Object.freeze({
  linear: 'Constant rate (linear)',
  nonlinear: 'Not a constant rate (nonlinear)',
});

// The scorer's own tolerance for "the same rate".
const RATE_TOLERANCE = 1e-6;

// textOnlyReview shows at most this many steps.
const MAX_STEPS = 12;

/* ------------------------------------------------------------ number text */

const trimDecimal = (text) => (text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text);

/**
 * A number as a student would type it into the workbench (ASCII minus, no
 * exponent): an integer, a short decimal (−0.75), an exact fraction when the
 * value is one (1/3, which no decimal the grader would accept can be), else
 * a long decimal.
 */
const numberText = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const tidy = Math.round(number * 1e9) / 1e9;
  if (Number.isInteger(tidy) && Math.abs(tidy - number) < 1e-9) return String(tidy === 0 ? 0 : tidy);
  const short = Math.round(number * 1e4) / 1e4;
  if (Math.abs(short - number) < 1e-9) return String(short);
  const fraction = exactFractionText(number);
  if (fraction.includes('/')) return fraction;
  const text = trimDecimal(number.toFixed(12));
  return text === '-0' ? '0' : text;
};

const typedValue = (text) => {
  const match = String(text).match(/^(-?)(\d+(?:\.\d+)?)(?:\/(\d+))?$/);
  if (!match) return Number(text);
  const magnitude = match[3] ? Number(match[2]) / Number(match[3]) : Number(match[2]);
  return match[1] ? -magnitude : magnitude;
};

// The same number in a sentence: a real minus sign.
const say = (value) => String(numberText(value)).replace(/^-/, '−');
// In a product or after a minus sign, a negative number or a fraction is bracketed.
const factor = (value) => {
  const text = say(value);
  return text.startsWith('−') || text.includes('/') ? `(${text})` : text;
};
const point = (row) => `(${say(row.x)}, ${say(row.y)})`;
const rowName = (index) => `Row ${index + 1}`;
const exactly = (value, text) => (Math.abs(typedValue(text) - value) <= 1e-9 * Math.max(1, Math.abs(value)) ? '=' : '≈');

/* -------------------------------------------------------------- equations */

// y = mx + b as typed: "y = -2x + 10", "y = (1/3)x - 2", "y = 4".
const equationText = (mText, bText) => {
  const m = typedValue(mText);
  const b = typedValue(bText);
  if (m === 0) return `y = ${bText}`;
  const negative = mText.startsWith('-');
  const magnitude = negative ? mText.slice(1) : mText;
  const coefficient = magnitude === '1' ? '' : magnitude.includes('/') ? `(${magnitude})` : magnitude;
  const xTerm = `${negative ? '-' : ''}${coefficient}x`;
  if (b === 0) return `y = ${xTerm}`;
  return `y = ${xTerm} ${bText.startsWith('-') ? '-' : '+'} ${bText.replace(/^-/, '')}`;
};
const shownEquation = (text) => text.replace(/-/g, '−');

/* -------------------------------------------------------------- the table */

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** The authored rows, or null when the table is not one the workbench can be right about. */
const tableOf = (question) => {
  if (!Array.isArray(question.rows) || question.rows.length < 3) return null;
  const rows = normalizeRows(question.rows);
  if (!rows.every((row) => Number.isFinite(row.x) && Number.isFinite(row.y))) return null;
  // Two rows with the same x have no interval between them, and the table is not a function.
  const order = rows.map((_, index) => index).sort((left, right) => rows[left].x - rows[right].x || left - right);
  for (let index = 1; index < order.length; index += 1) {
    if (Math.abs(rows[order[index]].x - rows[order[index - 1]].x) < 1e-9) return null;
  }
  return { rows, order };
};

/**
 * Row pairs in the order the review records them: neighbours in order of x
 * first, then rows two apart, and so on — over `indexes` (already sorted by x).
 */
const candidatePairs = (indexes) => {
  const pairs = [];
  for (let gap = 1; gap < indexes.length; gap += 1) {
    for (let start = 0; start + gap < indexes.length; start += 1) pairs.push([indexes[start], indexes[start + gap]]);
  }
  return pairs;
};

/** One recorded interval: the two rows (smaller x first) and the grader's own truth for it. */
const intervalOf = (rows, [i, j]) => {
  const truth = intervalTruth(rows[i], rows[j]);
  if (!truth) return null;
  const [first, second] = rows[i].x <= rows[j].x ? [i, j] : [j, i];
  const dx = numberText(truth.dx);
  const dy = numberText(truth.dy);
  const rate = numberText(truth.rate);
  if (dx == null || dy == null || rate == null) return null;
  return { i: first, j: second, truth, text: { dx, dy, rate } };
};

const intervalName = (interval) => `${rowName(interval.i)} → ${rowName(interval.j)}`;
const intervalItem = (interval) => ({
  label: intervalName(interval),
  value: `Δx = ${interval.text.dx}, Δy = ${interval.text.dy}, rate = ${interval.text.rate}`,
});
const intervalSentence = (rows, interval) => {
  const a = rows[interval.i];
  const b = rows[interval.j];
  return `${rowName(interval.i)} ${point(a)} → ${rowName(interval.j)} ${point(b)}: `
    + `Δx = ${say(b.x)} − ${factor(a.x)} = ${say(interval.truth.dx)}, `
    + `Δy = ${say(b.y)} − ${factor(a.y)} = ${say(interval.truth.dy)}, `
    + `rate = ${say(interval.truth.dy)} ÷ ${factor(interval.truth.dx)} = ${say(interval.truth.rate)}.`;
};

const METHOD_STEP = 'For each interval, go from the row with the smaller x to the row with the larger x: Δx = x₂ − x₁, Δy = y₂ − y₁, and the rate is Δy ÷ Δx.';

/** The interval steps, one per interval — or one step for all of them when the review would run past MAX_STEPS. */
const intervalSteps = (rows, intervals, otherSteps) => (
  intervals.length + otherSteps <= MAX_STEPS
    ? intervals.map((interval) => intervalSentence(rows, interval))
    : [`Record these intervals: ${intervals.map((interval) => `${intervalName(interval)}: Δx = ${say(interval.truth.dx)}, Δy = ${say(interval.truth.dy)}, rate = ${say(interval.truth.rate)}`).join('; ')}.`]
);

const sameRate = (left, right) => nearlyEqual(left, right, RATE_TOLERANCE);
// Every interval's rate is shown as exactly this text.
const allRead = (intervals, rateText) => intervals.every((interval) => interval.text.rate === rateText);

/** The rate between each pair of neighbouring rows (in order of x), over `indexes`. */
const neighbourIntervals = (rows, indexes) => indexes.slice(1).map((index, position) => intervalOf(rows, [indexes[position], index]));

/* -------------------------------------------------------------- the check */

const workFor = (intervals, fields) => ({
  intervals: intervals.map((interval) => ({ i: interval.i, j: interval.j, ...interval.text })),
  classification: '',
  repairRowIndex: null,
  repairedValue: '',
  m: '',
  b: '',
  equation: '',
  ...fields,
});

/** Does the shared grader mark exactly this work complete and correct? */
const graderAccepts = (question, work) => {
  const result = gradeWorkWithGrader({ grader: linearTableWorkbenchGrader, question, work });
  return result.graded === true && result.isCorrect === true && result.isComplete === true;
};

const evidenceNote = (count, extra = '') => `${count === 1 ? 'Any pair of rows counts' : `Any ${count} different pairs of rows count`} as evidence, as long as Δx, Δy and the rate are right for each one${extra}. The intervals above are one choice.`;

/** "Every recorded rate is r", naming the neighbouring intervals the student did not need to record. */
const constantRateSentence = (rateText, chosen, neighbours) => {
  const unrecorded = neighbours.filter((interval) => !chosen.includes(interval));
  const rest = unrecorded.length
    ? `, and the neighbouring interval${unrecorded.length > 1 ? 's' : ''} not recorded (${unrecorded.map(intervalName).join(', ')}) give${unrecorded.length > 1 ? '' : 's'} ${rateText} too`
    : '';
  return `Every recorded rate is ${rateText}${rest}. The rate of change is constant, so the table is linear`;
};

/* ------------------------------------------------------------------ modes */

const buildConstantRate = (question, { rows, order }, need) => {
  const classification = tableClassification(rows);
  const candidates = candidatePairs(order).map((pair) => intervalOf(rows, pair));
  if (candidates.some((interval) => !interval)) return null;
  const neighbours = candidates.slice(0, order.length - 1);
  const count = classification === 'nonlinear' ? Math.max(need, 2) : need;
  const chosen = candidates.slice(0, count);
  let contrast = null;
  if (classification === 'nonlinear') {
    // Two recorded rates must differ — the grader's nonconstant-rate evidence.
    const first = chosen[0];
    contrast = chosen.find((interval) => !sameRate(interval.truth.rate, first.truth.rate))
      || candidates.find((interval) => !sameRate(interval.truth.rate, first.truth.rate));
    if (!contrast) return null;
    if (!chosen.includes(contrast)) chosen[chosen.length - 1] = contrast;
    chosen.sort((left, right) => candidates.indexOf(left) - candidates.indexOf(right));
  }

  const rate = chosen[0].truth.rate;
  // "Every rate is r" is said only when every neighbouring rate reads as r.
  if (classification === 'linear' && !allRead([...neighbours, ...chosen], numberText(rate))) return null;

  const work = workFor(chosen, { classification });
  if (!graderAccepts(question, work)) return null;

  const conclusion = classification === 'linear'
    ? `${constantRateSentence(say(rate), chosen, neighbours)}.`
    : `${intervalName(chosen[0])} has rate ${say(rate)} but ${intervalName(contrast)} has rate ${say(contrast.truth.rate)}. The rate changes, so the table is nonlinear.`;
  const steps = [METHOD_STEP, ...intervalSteps(rows, chosen, 2), conclusion];
  const why = classification === 'linear'
    ? `A table is linear exactly when y changes by the same rate everywhere. Between every pair of neighbouring rows (in order of x) Δy ÷ Δx = ${say(rate)}, so one rate fits the whole table.`
    : `A linear table has one rate between every pair of rows. Here ${intervalName(chosen[0])} gives ${say(rate)} and ${intervalName(contrast)} gives ${say(contrast.truth.rate)}, so no single rate fits — and both of those intervals are recorded as evidence.`;
  return {
    title: 'Rate-of-change solution',
    items: [...chosen.map(intervalItem), { label: 'Classification', value: CLASSIFICATION_TEXT[classification] }],
    steps,
    why,
    note: evidenceNote(count, classification === 'nonlinear' ? ', and at least two of the rates are different' : ''),
  };
};

// The row whose arithmetic for b is simplest: x = 0 if the table has it, else the smallest |x|.
const interceptRowOf = (rows, order) => order.reduce((best, index) => (Math.abs(rows[index].x) < Math.abs(rows[best].x) ? index : best), order[0]);

const buildDeriveEquation = (question, { rows, order }, need) => {
  if (tableClassification(rows) !== 'linear') return null;
  const candidates = candidatePairs(order).map((pair) => intervalOf(rows, pair));
  if (candidates.some((interval) => !interval)) return null;
  const chosen = candidates.slice(0, need);
  const fit = fitTableLine(rows);
  const mText = numberText(fit.m);
  const bText = numberText(fit.b);
  if (mText == null || bText == null) return null;
  const equation = equationText(mText, bText);
  const neighbours = candidates.slice(0, order.length - 1);
  if (!allRead([...neighbours, ...chosen], mText)) return null;

  const work = workFor(chosen, { classification: 'linear', m: mText, b: bText, equation });
  if (!graderAccepts(question, work)) return null;

  const m = typedValue(mText);
  const b = typedValue(bText);
  const anchorIndex = interceptRowOf(rows, order);
  const anchor = rows[anchorIndex];
  const bFromAnchor = anchor.y - m * anchor.x;
  const interceptStep = anchor.x === 0 && numberText(anchor.y) === bText
    ? `${rowName(anchorIndex)} has x = 0, so its y-value is the y-intercept: b = ${say(b)}.`
    : `Substitute ${rowName(anchorIndex)} ${point(anchor)} and m = ${say(m)} into y = mx + b: ${say(anchor.y)} = ${factor(m)}(${say(anchor.x)}) + b, so b = ${say(anchor.y)} − ${factor(m)}(${say(anchor.x)}) ${exactly(bFromAnchor, bText)} ${say(b)}.`;
  // The check uses the row farthest from the one b came from.
  const checkIndex = order.reduce((best, index) => (Math.abs(rows[index].x - anchor.x) > Math.abs(rows[best].x - anchor.x) ? index : best), order[0]);
  const check = rows[checkIndex];
  const predicted = m * check.x + b;

  const steps = [
    METHOD_STEP,
    ...intervalSteps(rows, chosen, 4),
    `${constantRateSentence(say(m), chosen, neighbours)}, and its slope is m = ${say(m)}.`,
    interceptStep,
    `So the equation is ${shownEquation(equation)}.`,
  ];
  return {
    title: 'Linear-equation solution',
    items: [
      ...chosen.map(intervalItem),
      { label: 'Classification', value: CLASSIFICATION_TEXT.linear },
      { label: 'Slope m', value: mText },
      { label: 'y-intercept b', value: bText },
      { label: 'Equation', value: equation },
    ],
    steps,
    why: `Check with ${rowName(checkIndex)} ${point(check)}: ${factor(m)}(${say(check.x)}) + ${factor(b)} ${exactly(predicted, numberText(check.y))} ${say(check.y)}, the y-value in the table. Every row lies on ${shownEquation(equation)} because every interval has the same rate, ${say(m)}.`,
    note: evidenceNote(chosen.length),
  };
};

const buildRepairValue = (question, { rows, order }, need) => {
  const repair = findTableRepair(rows);
  if (!repair) return null;
  const bad = repair.offendingIndex;
  const correctedText = numberText(repair.correctedY);
  if (correctedText == null) return null;
  const repaired = rows.map((row, index) => (index === bad ? { x: row.x, y: repair.correctedY } : row));
  if (tableClassification(repaired) !== 'linear') return null;

  // Evidence from the rows that keep the pattern; rows touching the broken
  // row only when the question asks for more pairs than those can give.
  const good = order.filter((index) => index !== bad);
  const candidates = [...candidatePairs(good), ...good.map((index) => [index, bad])].map((pair) => intervalOf(rows, pair));
  if (candidates.some((interval) => !interval)) return null;
  const chosen = candidates.slice(0, need);

  const work = workFor(chosen, { classification: 'linear', repairRowIndex: bad, repairedValue: correctedText });
  if (!graderAccepts(question, work)) return null;

  const m = repair.expected.m;
  const mText = numberText(m);
  const neighbours = neighbourIntervals(rows, order);
  if (mText == null || neighbours.some((interval) => !interval)) return null;
  // "Every other row lies on one line with rate m": every interval between rows that keep the pattern reads as m.
  if (!allRead(neighbourIntervals(rows, good), mText)) return null;
  const badRow = rows[bad];
  const corrected = repair.correctedY;
  const fixed = { x: badRow.x, y: corrected };
  // The nearest row that keeps the pattern: extend the rate from it to the broken row's x.
  const from = good.reduce((best, index) => (Math.abs(rows[index].x - badRow.x) < Math.abs(rows[best].x - badRow.x) ? index : best), good[0]);
  const fromRow = rows[from];
  const run = badRow.x - fromRow.x;
  const extended = fromRow.y + typedValue(mText) * run;
  // The check: the corrected row and its nearest neighbour, smaller x first.
  const [left, right] = fromRow.x < badRow.x ? [fromRow, fixed] : [fixed, fromRow];
  const checkRate = (right.y - left.y) / (right.x - left.x);
  if (numberText(checkRate) !== mText) return null;

  const steps = [
    `Put the rows in order of x and find the rate between each pair of neighbouring rows: ${neighbours.map((interval) => `${intervalName(interval)}: ${say(interval.truth.rate)}`).join('; ')}.`,
    `Leave out ${rowName(bad)} ${point(badRow)} and every other row lies on one line with rate ${say(m)}. Leaving out any other single row does not fix the table, so ${rowName(bad)} is the offending row.`,
    METHOD_STEP,
    ...intervalSteps(rows, chosen, 5),
    `Extend the rate ${say(m)} from ${rowName(from)} ${point(fromRow)} to x = ${say(badRow.x)}: Δx = ${say(badRow.x)} − ${factor(fromRow.x)} = ${say(run)}, so y = ${say(fromRow.y)} + ${factor(m)}(${say(run)}) ${exactly(extended, correctedText)} ${say(corrected)}. That is the corrected value for ${rowName(bad)}.`,
    `With ${rowName(bad)} changed to ${point(fixed)}, every interval has rate ${say(m)}, so the repaired table is linear.`,
  ];
  return {
    title: 'Table-repair solution',
    items: [
      { label: 'Offending row', value: rowName(bad) },
      { label: `Corrected y-value for ${rowName(bad)}`, value: correctedText },
      ...chosen.map(intervalItem),
      { label: 'Classification (of the repaired table)', value: CLASSIFICATION_TEXT.linear },
    ],
    steps,
    why: `Check: from ${point(left)} to ${point(right)} the rate is (${say(right.y)} − ${factor(left.y)}) ÷ (${say(right.x)} − ${factor(left.x)}) = ${say(right.y - left.y)} ÷ ${factor(right.x - left.x)} = ${say(checkRate)} — the same rate as every other interval, so the corrected ${rowName(bad)} fits the pattern.`,
    note: evidenceNote(chosen.length, ' (an interval that uses the offending row as printed counts too)'),
  };
};

/* --------------------------------------------------------------- builder */

const buildReview = (question) => {
  if (!isRecord(question)) return null;
  const table = tableOf(question);
  if (!table) return null;
  const pairCount = (table.rows.length * (table.rows.length - 1)) / 2;
  // The intervals the Check button waits for (an author's 2.5 means 3).
  const need = Math.ceil(linearTableRequiredComparisons(question));
  if (!Number.isFinite(need) || need < 1 || need > pairCount) return null;
  const mode = resolveLinearTableWorkbenchMode(question);
  if (mode === 'deriveEquation') return buildDeriveEquation(question, table, need);
  if (mode === 'repairValue') return buildRepairValue(question, table, need);
  return buildConstantRate(question, table, need);
};

export const buildLinearTableWorkbenchReview = (question) => {
  try {
    return buildReview(question);
  } catch {
    // A question this review cannot read has no review, never a broken one.
    return null;
  }
};

export default buildLinearTableWorkbenchReview;
