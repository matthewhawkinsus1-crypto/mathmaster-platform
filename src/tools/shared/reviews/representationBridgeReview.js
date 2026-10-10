// Worked solution review for representationBridge (contract: ../toolSolutionReview.js, textOnlyReview).
/*
 * THE REPRESENTATION BRIDGE'S WORKED SOLUTION — THE ANSWER ITS GRADER ACCEPTS.
 *
 * The shared grader (functions/shared/serverGrading/tools/representationBridge.mjs)
 * grades two boards, chosen exactly as the tool renders them
 * (declarations/representationBridge.mjs resolveMode):
 *
 *   linear                         the Representation Bridge: a linear table →
 *                                  rate evidence, y = mx + b, y = a(x − c), a
 *                                  graph through the x-intercept, and the
 *                                  meaning of m, b and c
 *                                  (scoreRepresentationBridge);
 *   linearMultipleRepresentations  the Multiple Representations board: one
 *                                  GIVEN line → every other card, plus the
 *                                  situation's meanings when it has one
 *                                  (scoreLinearMultipleRepresentations), in
 *                                  Worksheet Mode or Process Mode.
 *
 * Every number is the grader's own: the bridge's line is deriveLinearBridge
 * (the least-squares fit of a collinear table — exact here), the board's is
 * deriveLinearMultipleRepresentations, each written as an exact fraction. The
 * work this review states — exactly the text in its items, the intervals, the
 * plotted points, the meanings — is graded by the shared grader through the
 * bytes the server reads (gradeWorkWithGrader) before the review is returned.
 * Unless that work is complete and correct the review is null: a review never
 * states an answer the gradebook rejects.
 *
 * PROCESS MODE. A Process Mode board does not read its key facts (slope,
 * intercepts, points) from boxes: each must be established by a method the
 * board offers. The review's steps for those facts follow the grader's own
 * key process (keyProcessLog — the first method each fact can be found by on
 * THIS board, within the author's restriction), and the work it grades
 * carries that process. The fact cards it lists are the ones that process
 * puts on the board (materializeProcessBoard). Worksheet boards use the same
 * steps — any correct method is fine there.
 *
 * Open-ended choices — which row pairs are rate evidence, which point a
 * point-slope equation, a table, two points or a graph uses — are one valid
 * choice each, and the note says so.
 *
 * Null for: no question / not an object; a bridge table that is not linear,
 * has a repeated x or a non-numeric cell, asks for more intervals than it has
 * row pairs, or has slope 0 where c (the zero) is needed; a board whose GIVEN
 * yields no line or a vertical one, or a horizontal line asked for an
 * x-intercept; any value that is not an exact, small-denominator fraction;
 * and anything the shared grader does not mark complete and correct.
 *
 * Shown only once the question is closed (closedQuestionReview); pure, no React.
 */
import representationBridgeGrader from '../../../../functions/shared/serverGrading/tools/representationBridge.mjs';
import representationBridgeDeclaration from '../../../../functions/shared/serverGrading/declarations/representationBridge.mjs';
import { resolveToolMode } from '../../../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeWorkWithGrader } from '../../../../functions/shared/serverGrading/toolWorkGrading.mjs';
import {
  addFractions,
  divFractions,
  makeFraction,
  mulFractions,
  negFraction,
  subFractions,
  toFraction,
} from '../../../../functions/shared/toolMath/shared/linearEquations.mjs';
import { intervalTruth, isCollinear } from '../../../../functions/shared/toolMath/linearTableWorkbench/linearTableWorkbenchMath.mjs';
import {
  REPRESENTATION_BRIDGE_MEANING_ROLES,
  deriveLinearBridge,
  resolveGraphBounds,
  resolveRequiredComparisons,
  resolveRequiredStages,
} from '../../../../functions/shared/toolMath/representationBridge/representationBridgeMath.mjs';
import {
  CARD_PART_KEYS,
  PART_LABELS,
  deriveLinearMultipleRepresentations,
  gradedContextFields,
  normalizeStandardCoefficients,
  resolveExpectedDomain,
  resolveLinearMultipleRepresentationsGraphBounds,
  resolveRequiredCards,
} from '../../../../functions/shared/toolMath/representationBridge/linearMultipleRepresentationsMath.mjs';
import { LMR_PROCESS_MODEL, isProcessModeQuestion } from '../../../../functions/shared/toolMath/representationBridge/lmrProcessModel.mjs';
import {
  establishedPoints,
  keyProcessLog,
  lmrProcessEnvironment,
  lmrSubstitutionQuestion,
  materializeProcessBoard,
  resolveLmrProcess,
} from '../../../../functions/shared/toolMath/representationBridge/lmrProcessVerify.mjs';

export const implemented = true;

// textOnlyReview shows at most this many steps.
const MAX_STEPS = 12;
// A value is shown as an exact fraction; one that needs a bigger denominator
// than this is not a value a student types, and the review says nothing.
const MAX_DENOMINATOR = 1000;

const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value) => String(value ?? '');

/* ---------------------------------------------------------- exact numbers */

const F = (n, d = 1) => makeFraction(n, d);
const ZERO = { n: 0, d: 1 };
const ONE = { n: 1, d: 1 };
const tidy = (fraction) => (fraction && fraction.n === 0 ? ZERO : fraction);

/** A value as an exact fraction, or null when it is not a small-denominator rational. */
const exact = (value) => {
  if (isRecord(value) && Number.isFinite(value.n) && Number.isFinite(value.d) && value.d !== 0) {
    const fraction = F(value.n, value.d);
    return fraction && fraction.d <= MAX_DENOMINATOR ? tidy(fraction) : null;
  }
  const number = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(number)) return null;
  const fraction = toFraction(number);
  if (!fraction || fraction.d > MAX_DENOMINATOR) return null;
  if (Math.abs(fraction.n / fraction.d - number) > 1e-9 * Math.max(1, Math.abs(number))) return null;
  return tidy(fraction);
};

const num = (fraction) => fraction.n / fraction.d;
const same = (a, b) => Boolean(a && b) && a.n * b.d === b.n * a.d;
const isZero = (fraction) => fraction.n === 0;
const isWhole = (fraction) => fraction.d === 1;
const absF = (fraction) => F(Math.abs(fraction.n), fraction.d);

/** As a student types it: "3", "-3/4". */
const typed = (fraction) => (fraction.d === 1 ? String(fraction.n) : `${fraction.n}/${fraction.d}`);
/** In a sentence: a real minus sign. */
const say = (fraction) => typed(tidy(fraction)).replace(/^-/, '−');
/** In a product or after a minus sign: a negative number or a fraction is bracketed. */
const factor = (fraction) => (fraction.n < 0 || fraction.d !== 1 ? `(${say(fraction)})` : say(fraction));
const pointTyped = ([x, y]) => `(${typed(tidy(x))}, ${typed(tidy(y))})`;
const pointSay = ([x, y]) => `(${say(x)}, ${say(y)})`;
/** An equation typed in ASCII, shown in a sentence. */
const sayEquation = (equation) => text(equation).replace(/-/g, '−');
/** m·x + b worked out at one x, in a sentence: "5(6) − 20", "(1/2)(4)". */
const evaluated = (m, x, b) => `${factor(m)}(${say(x)})${isZero(b) ? '' : ` ${b.n < 0 ? '−' : '+'} ${say(absF(b))}`}`;

/* ------------------------------------------------------------ equations */

const coefficientTerm = (coefficient, variable, first) => {
  const value = tidy(coefficient);
  if (isZero(value)) return '';
  const magnitude = absF(value);
  const body = magnitude.n === 1 && magnitude.d === 1 ? variable : `${isWhole(magnitude) ? magnitude.n : `(${typed(magnitude)})`}${variable}`;
  if (first) return `${value.n < 0 ? '-' : ''}${body}`;
  return ` ${value.n < 0 ? '-' : '+'} ${body}`;
};

/** y = mx + b as typed: "y = (1/2)x - 3", "y = -x + 4", "y = 5". */
const slopeInterceptText = (m, b) => {
  if (isZero(m)) return `y = ${typed(b)}`;
  const constant = isZero(b) ? '' : ` ${b.n < 0 ? '-' : '+'} ${typed(absF(b))}`;
  return `y = ${coefficientTerm(m, 'x', true)}${constant}`;
};

/** "x - 3", "x + 3/2", "x - 0": the offset in y − y₁ or x − x₁. */
const offsetText = (variable, value) => (value.n < 0 ? `${variable} + ${typed(absF(value))}` : `${variable} - ${typed(value)}`);
/** A coefficient written in front of brackets: always shown, a fraction bracketed. */
const leadingCoefficient = (value) => (isWhole(value) ? String(value.n) : `(${typed(value)})`);

/** The right side of y = mx + b, in a sentence: "5x − 20", "(1/2)x". */
const rightSide = (m, b) => sayEquation(slopeInterceptText(m, b)).replace(/^y = /, '');

/** y = a(x − c) as typed: "y = 5(x - 4)", "y = (1/2)(x + 3/2)", "y = -1(x - 4)". */
const factoredText = (a, c) => `y = ${leadingCoefficient(a)}(${offsetText('x', c)})`;

/** y − y₁ = m(x − x₁) as typed: "y - 2 = -1(x - 3)", "y + 3 = (1/2)(x - 0)". */
const pointSlopeText = ([x1, y1], m) => `${offsetText('y', y1)} = ${leadingCoefficient(m)}(${offsetText('x', x1)})`;

/** Ax + By = C as typed, from whole-number coefficients: "x - 2y = 6", "y = 5". */
const standardText = ({ A, B, C }) => {
  const terms = [];
  if (A) terms.push(A === 1 ? 'x' : A === -1 ? '-x' : `${A}x`);
  if (B) {
    const magnitude = Math.abs(B) === 1 ? 'y' : `${Math.abs(B)}y`;
    terms.push(terms.length ? `${B < 0 ? '-' : '+'} ${magnitude}` : `${B < 0 ? '-' : ''}${magnitude}`);
  }
  return `${terms.join(' ')} = ${C}`;
};

/* ------------------------------------------------------------ the check */

/** Does the shared grader mark exactly this work complete and correct? */
const graderAccepts = (question, work) => {
  const result = gradeWorkWithGrader({ grader: representationBridgeGrader, question, work });
  return result.graded === true && result.isCorrect === true && result.isComplete === true;
};

/** Steps beyond MAX_STEPS are merged into the last one shown, never dropped. */
const fitSteps = (steps) => (steps.length <= MAX_STEPS
  ? steps
  : [...steps.slice(0, MAX_STEPS - 1), steps.slice(MAX_STEPS - 1).join(' ')]);

/* =====================================================================
 * THE BRIDGE (mode "linear")
 * =================================================================== */

const rowName = (index) => `Row ${index + 1}`;
const STAGE_TITLES = Object.freeze({
  rateEvidence: 'Table and rate of change',
  generalForm: 'General form',
  factoredForm: 'Factored form',
  graph: 'Graph',
  meaning: 'Meaning',
});

/** Row pairs in the order the review records them: neighbours (in order of x) first, then rows two apart, … */
const candidatePairs = (order) => {
  const pairs = [];
  for (let gap = 1; gap < order.length; gap += 1) {
    for (let start = 0; start + gap < order.length; start += 1) pairs.push([order[start], order[start + gap]]);
  }
  return pairs;
};

/** The graph's grid (RepresentationBridge.jsx): whole numbers when m and c are whole, else halves. */
const bridgeSnapStep = (derived) => (Number.isInteger(derived.m) && Number.isInteger(derived.zero) ? 1 : 0.5);
const onGrid = (value, step) => Math.abs(value / step - Math.round(value / step)) < 1e-9;
const inside = (bounds, [x, y]) => num(x) >= bounds.xMin && num(x) <= bounds.xMax && num(y) >= bounds.yMin && num(y) <= bounds.yMax;

const meaningOf = (context, id) => {
  const fields = {
    rate: ['rateUnit', 'rateMeaning'],
    yIntercept: ['outputUnit', 'yInterceptMeaning'],
    zero: ['inputUnit', 'zeroMeaning'],
  }[id];
  return { unit: text(context[fields[0]]), contextMeaning: text(context[fields[1]]), mathRole: REPRESENTATION_BRIDGE_MEANING_ROLES[id] };
};
const meaningValue = ({ unit, contextMeaning, mathRole }) => `Unit: ${unit} · Meaning: ${contextMeaning} · Role: ${mathRole}`;

const buildBridgeReview = (question) => {
  const derived = deriveLinearBridge(question);
  const { rows } = derived;
  if (rows.length < 3 || !rows.every((row) => Number.isFinite(row.x) && Number.isFinite(row.y))) return null;
  // A table the bridge accepts is genuinely linear with distinct x-values; the
  // grader's "constant" conclusion and its fitted line mean nothing otherwise.
  if (!isCollinear(rows)) return null;
  const exactRows = rows.map((row) => [exact(row.x), exact(row.y)]);
  if (exactRows.some(([x, y]) => !x || !y)) return null;
  const order = rows.map((_, index) => index).sort((left, right) => rows[left].x - rows[right].x || left - right);
  for (let index = 1; index < order.length; index += 1) {
    if (Math.abs(rows[order[index]].x - rows[order[index - 1]].x) < 1e-9) return null;
  }
  const m = exact(derived.m);
  const b = exact(derived.b);
  if (!m || !b) return null;
  const stages = resolveRequiredStages(question);
  const needsZero = stages.some((stage) => ['factoredForm', 'graph', 'meaning'].includes(stage));
  const zero = derived.zero === null ? null : exact(derived.zero);
  if (needsZero && (isZero(m) || !zero)) return null;
  // The table's rows lie on y = mx + b exactly.
  if (!exactRows.every(([x, y]) => same(y, addFractions(mulFractions(m, x), b)))) return null;

  const context = isRecord(question.context) ? question.context : {};
  const work = {};
  const items = [];
  const steps = [];
  const choices = [];

  if (stages.includes('rateEvidence')) {
    // The intervals the conclusion buttons wait for (an authored 2.5 means 3).
    const need = Math.ceil(resolveRequiredComparisons(question, rows.length));
    const pairs = candidatePairs(order);
    if (!Number.isInteger(need) || need < 1 || need > pairs.length) return null;
    const intervals = pairs.slice(0, need).map(([i, j]) => {
      const truth = intervalTruth(rows[i], rows[j]);
      const [x1, y1] = exactRows[i];
      const [x2, y2] = exactRows[j];
      const dx = subFractions(x2, x1);
      const dy = subFractions(y2, y1);
      return truth ? { i, j, x1, y1, x2, y2, dx, dy, rate: divFractions(dy, dx) } : null;
    });
    if (intervals.some((interval) => !interval || !interval.rate || !same(interval.rate, m))) return null;
    work.tableEvidence = intervals.map(({ i, j, dx, dy, rate }) => ({ i, j, dx: typed(dx), dy: typed(dy), rate: typed(rate) }));
    work.studentSlope = typed(m);
    work.rateConclusion = 'constant';
    intervals.forEach((interval) => items.push({
      label: `${rowName(interval.i)} → ${rowName(interval.j)}`,
      value: `Δx = ${typed(interval.dx)}, Δy = ${typed(interval.dy)}, rate = ${typed(interval.rate)}`,
    }));
    items.push({ label: 'Rate conclusion', value: 'The rate is constant' }, { label: 'm (your slope)', value: typed(m) });
    const sentences = intervals.map((interval) => `${rowName(interval.i)} ${pointSay([interval.x1, interval.y1])} → ${rowName(interval.j)} ${pointSay([interval.x2, interval.y2])}: Δx = ${say(interval.x2)} − ${factor(interval.x1)} = ${say(interval.dx)}, Δy = ${say(interval.y2)} − ${factor(interval.y1)} = ${say(interval.dy)}, rate = ${say(interval.dy)} ÷ ${factor(interval.dx)} = ${say(interval.rate)}.`);
    steps.push(`${STAGE_TITLES.rateEvidence}: tap two rows to make an interval, then go from the row with the smaller x to the row with the larger x — Δx = x₂ − x₁, Δy = y₂ − y₁ and the rate is Δy ÷ Δx. Record ${need === 1 ? 'one interval' : `${need} different intervals`}.`);
    if (sentences.length <= 3) steps.push(...sentences); else steps.push(sentences.join(' '));
    steps.push(`Every recorded rate is ${say(m)}, so the rate is constant (choose "The rate is constant") and the slope is m = ${say(m)}.`);
    choices.push(need === 1 ? 'any pair of rows counts as the interval' : `any ${need} different pairs of rows count as the intervals`);
  }

  if (stages.includes('generalForm')) {
    const equation = slopeInterceptText(m, b);
    work.generalForm = { m: typed(m), b: typed(b), equation };
    items.push({ label: 'General form: m', value: typed(m) }, { label: 'General form: b', value: typed(b) }, { label: 'General form equation', value: equation });
    // b from the row at x = 0 when the table has one, else from the row nearest it.
    const anchorIndex = order.reduce((best, index) => (Math.abs(rows[index].x) < Math.abs(rows[best].x) ? index : best), order[0]);
    const [ax, ay] = exactRows[anchorIndex];
    const bStep = isZero(ax)
      ? `${rowName(anchorIndex)} ${pointSay([ax, ay])} has x = 0, so its y-value is the y-intercept: b = ${say(b)}.`
      : `Substitute ${rowName(anchorIndex)} ${pointSay([ax, ay])} and m = ${say(m)} into y = mx + b: ${say(ay)} = ${factor(m)}(${say(ax)}) + b, so b = ${say(ay)} − ${factor(mulFractions(m, ax))} = ${say(b)}.`;
    if (!stages.includes('rateEvidence')) {
      // No rate stage to read m from: find it from two neighbouring rows.
      const [first, second] = [exactRows[order[0]], exactRows[order[1]]];
      steps.push(`${STAGE_TITLES.generalForm}: m is the table's constant rate. Between ${rowName(order[0])} ${pointSay(first)} and ${rowName(order[1])} ${pointSay(second)}, m = Δy ÷ Δx = (${say(second[1])} − ${factor(first[1])}) ÷ (${say(second[0])} − ${factor(first[0])}) = ${say(m)}.`);
      steps.push(`${bStep} So the equation is ${sayEquation(equation)}.`);
    } else {
      steps.push(`${STAGE_TITLES.generalForm}: m is the constant rate, ${say(m)}. ${bStep} So the equation is ${sayEquation(equation)}.`);
    }
  }

  if (stages.includes('factoredForm')) {
    const equation = factoredText(m, zero);
    work.factoredForm = { a: typed(m), c: typed(zero), equation };
    items.push({ label: 'Factored form: a', value: typed(m) }, { label: 'Factored form: c', value: typed(zero) }, { label: 'Factored form equation', value: equation });
    steps.push(`${STAGE_TITLES.factoredForm}: a is the slope, a = ${say(m)}, and c is the zero — the x where y = 0. Set 0 = ${rightSide(m, b)}: x = ${say(negFraction(b))} ÷ ${factor(m)} = ${say(zero)}, so c = ${say(zero)} and y = a(x − c) is ${sayEquation(equation)}.`);
  }

  if (stages.includes('graph')) {
    const bounds = resolveGraphBounds(question, derived);
    const step = bridgeSnapStep(derived);
    const anchor = [zero, ZERO];
    const fits = (point) => inside(bounds, point) && point.every((value) => onGrid(num(value), step)) && !same(point[0], zero);
    const rise = F(m.n);
    const run = F(m.d);
    const stepPoints = [1, -1, 2, -2, 3, -3].map((k) => [addFractions(zero, mulFractions(F(k), run)), mulFractions(F(k), rise)]);
    const fromTable = order.map((index) => ({ point: exactRows[index], index })).find(({ point }) => fits(point)) || null;
    const fromSlope = stepPoints.find(fits) || null;
    const second = fromTable ? fromTable.point : fromSlope || stepPoints[0];
    work.graphConstruction = { points: [anchor, second].map((point) => point.map(num)) };
    items.push({ label: 'Graph points', value: `${pointTyped(anchor)} and ${pointTyped(second)}` });
    const secondFrom = fromTable
      ? `${rowName(fromTable.index)} of the table, ${pointSay(second)}, is on the line too`
      : `from it, a run of ${say(subFractions(second[0], zero))} and a rise of ${say(second[1])} (the slope ${say(m)}) reach ${pointSay(second)}`;
    steps.push(`${STAGE_TITLES.graph}: plot the x-intercept ${pointSay(anchor)} — the c from the factored form — then a second point: ${secondFrom}. The line through the two points is the graph.`);
    choices.push('any second point on the line works for the graph');
  }

  if (stages.includes('meaning')) {
    const meanings = Object.fromEntries(['rate', 'yIntercept', 'zero'].map((id) => [id, meaningOf(context, id)]));
    if (Object.values(meanings).some((meaning) => !meaning.unit.trim() || !meaning.contextMeaning.trim())) return null;
    work.meaningAssignments = meanings;
    items.push(
      { label: `Meaning of m = ${typed(m)}`, value: meaningValue(meanings.rate) },
      { label: `Meaning of b = ${typed(b)}`, value: meaningValue(meanings.yIntercept) },
      { label: `Meaning of c = ${typed(zero)}`, value: meaningValue(meanings.zero) },
    );
    steps.push(
      `${STAGE_TITLES.meaning}: m = ${say(m)} is the rate of change — output per input — so its unit is ${meanings.rate.unit}: it is the ${meanings.rate.contextMeaning}. Its role: ${meanings.rate.mathRole}.`,
      `b = ${say(b)} is the output when the input is 0, so its unit is ${meanings.yIntercept.unit}: it is the ${meanings.yIntercept.contextMeaning}. Its role: ${meanings.yIntercept.mathRole}.`,
      `c = ${say(zero)} is the input that makes the output 0, so its unit is ${meanings.zero.unit}: it is the ${meanings.zero.contextMeaning}. Its role: ${meanings.zero.mathRole}.`,
    );
  }

  if (!items.length || !graderAccepts(question, work)) return null;

  // The check: a table row the equations must reproduce (the one farthest from x = 0).
  const checkIndex = order.reduce((best, index) => (Math.abs(rows[index].x) > Math.abs(rows[best].x) ? index : best), order[0]);
  const [cx, cy] = exactRows[checkIndex];
  const rowCheck = `${rowName(checkIndex)} ${pointSay([cx, cy])}: ${evaluated(m, cx, b)} = ${say(cy)}`;
  const why = zero && needsZero
    ? `Check: expanding a(x − c) gives ${factor(m)}x − ${factor(m)}(${say(zero)}) = ${rightSide(m, b)}, the general form, so the equations are the same line; the zero works, since ${evaluated(m, zero, b)} = 0; and the line passes through every row of the table — for ${rowCheck}. One line, every representation.`
    : `Check: the line y = mx + b with m = ${say(m)} and b = ${say(b)} passes through every row of the table — for ${rowCheck} — because every interval has the same rate, ${say(m)}.`;
  return {
    title: 'Representation bridge solution',
    items,
    steps: fitSteps(steps),
    why,
    note: choices.length ? `${choices.join('; ').replace(/^./, (character) => character.toUpperCase())}. The choices above are one valid set.` : null,
  };
};

/* =====================================================================
 * THE MULTIPLE REPRESENTATIONS BOARD (mode "linearMultipleRepresentations")
 * =================================================================== */

const INTERCEPT_LABEL = Object.freeze({ xIntercept: 'x-intercept', yIntercept: 'y-intercept' });

/** A run and rise for the slope as a whole-number step: m = 1/2 → run 2, rise 1. */
const slopeStep = (m) => (isZero(m) ? { run: ONE, rise: ZERO } : { run: F(m.d), rise: F(m.n) });

/** The first slope step from `start` that stays on the plane (else one step on). */
const stepFrom = (start, m, bounds) => {
  const { run, rise } = slopeStep(m);
  const candidates = [1, -1, 2, -2].map((k) => [addFractions(start[0], mulFractions(F(k), run)), addFractions(start[1], mulFractions(F(k), rise))]);
  return candidates.find((point) => !bounds || inside(bounds, point)) || candidates[0];
};

/** A label at the start of a sentence: "Slope", but "y-intercept" stays as written. */
const cap = (label) => (/^[xy]-/.test(label) ? label : label.replace(/^./, (character) => character.toUpperCase()));

const runRiseText = (from, to) => `run ${say(subFractions(to[0], from[0]))}, rise ${say(subFractions(to[1], from[1]))}`;

/** The answer a graded context field expects, as a student would enter it. */
const contextAnswer = (entry) => {
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'number' && Number.isFinite(entry)) return String(entry);
  if (Array.isArray(entry)) {
    if (entry.length === 2 && entry.every((value) => Number.isFinite(Number(value)))) return `${Number(entry[0])} ≤ x ≤ ${Number(entry[1])}`;
    return typeof entry[0] === 'string' ? entry[0] : '';
  }
  if (isRecord(entry)) {
    if (entry.value != null) return text(entry.value);
    if (entry.answer != null) return text(entry.answer);
    if (Array.isArray(entry.acceptedAnswers) && entry.acceptedAnswers.length) return text(entry.acceptedAnswers[0]);
    if (Number.isFinite(Number(entry.min)) && Number.isFinite(Number(entry.max))) {
      return `${Number(entry.min)} ${entry.minInclusive === false ? '<' : '≤'} x ${entry.maxInclusive === false ? '<' : '≤'} ${Number(entry.max)}`;
    }
  }
  return '';
};

/** One step of the grader's key process, as the work a student writes. */
const factSentence = (entry, env, before, labels) => {
  const { m, b, x0 } = env;
  const ev = isRecord(entry.ev) ? entry.ev : {};
  const given = sayEquation(env.equation);
  const siText = sayEquation(slopeInterceptText(m, b));
  const interceptPoint = (fact) => (fact === 'xIntercept' ? [x0, ZERO] : [ZERO, b]);
  const pointOf = (ref) => {
    if (Array.isArray(ref)) return ref.map(exact);
    if (ref === 'g0' || ref === 'g1') return env.givenPoints[ref === 'g0' ? 0 : 1] || null;
    if (ref === 'yIntercept' || ref === 'xIntercept') return before.facts[ref]?.point || null;
    if (typeof ref === 'string' && ref.startsWith('point:')) {
      return establishedPoints(before).find((record) => record.fact === 'point' && `point:${record.key}` === ref)?.point || null;
    }
    return null;
  };
  switch (entry.strategy) {
    case 'readSlopeIntercept':
      return entry.from === 'given'
        ? `${cap(labels.slope)} and ${labels.yIntercept}: the GIVEN ${given} is in slope-intercept form y = mx + b, so read m = ${say(m)} and b = ${say(b)} — the y-intercept is ${pointSay([ZERO, b])}.`
        : `${cap(labels.slope)} and ${labels.yIntercept}: read them from your equation ${siText} — m = ${say(m)}, and b = ${say(b)}, so the y-intercept is ${pointSay([ZERO, b])}.`;
    case 'solveForY': {
      const reached = (Array.isArray(ev.steps) ? ev.steps : []).map((line) => sayEquation(`${line.left} = ${line.right}`));
      return `Solve the GIVEN ${given} for y with Step Algebra: ${reached.join(', then ')}.`;
    }
    case 'readPointSlope':
      return `${cap(labels.slope)}: the GIVEN ${given} is in point-slope form y − y₁ = m(x − x₁), so read m = ${say(m)} and the point (x₁, y₁) = ${pointSay(env.anchor)}.`;
    case 'readScenario':
      return `${cap(labels.slope)} and ${labels.yIntercept}: read them from the situation — the amount changes by ${say(m)} for each 1 unit of x, so the rate of change (the slope) is ${say(m)}; it starts at ${say(b)}, so the initial value is ${say(b)} and the y-intercept is ${pointSay([ZERO, b])}.`;
    case 'substituteZero': {
      const target = entry.target === 'yIntercept' ? 'yIntercept' : 'xIntercept';
      const point = interceptPoint(target);
      if (!point[0] || !point[1]) return null;
      const zeroVariable = target === 'xIntercept' ? 'y' : 'x';
      const solved = target === 'xIntercept' ? point[0] : point[1];
      const into = entry.from === 'given'
        ? `the GIVEN ${given}`
        : entry.from === 'siEquation' ? `your equation ${siText}` : `y = mx + b with your slope and y-intercept, ${siText}`;
      const opened = lmrSubstitutionQuestion(env, entry.from, zeroVariable, before.facts);
      const equation = opened?.equation ? ` (${sayEquation(opened.equation)})` : '';
      return `${cap(labels[target])}: substitute ${zeroVariable} = 0 into ${into} and solve${equation}: ${target === 'xIntercept' ? 'x' : 'y'} = ${say(solved)}, so the ${INTERCEPT_LABEL[target]} is ${pointSay(point)}.`;
    }
    case 'graphCrossing': {
      const target = entry.target === 'xIntercept' ? 'xIntercept' : 'yIntercept';
      const point = interceptPoint(target);
      if (!point[0] || !point[1]) return null;
      return `${cap(labels[target])}: on the GIVEN graph, the line crosses the ${target === 'xIntercept' ? 'x' : 'y'}-axis at ${pointSay(point)}.`;
    }
    case 'graphPoint': {
      const point = pointOf(ev.pick);
      return point && point.every(Boolean) ? `A point: ${pointSay(point)} is on the GIVEN graph's line.` : null;
    }
    case 'riseRun': {
      const [p1, p2] = [pointOf(ev.p1), pointOf(ev.p2)];
      if (!p1 || !p2 || !p1.every(Boolean) || !p2.every(Boolean)) return null;
      const run = subFractions(p2[0], p1[0]);
      const rise = subFractions(p2[1], p1[1]);
      return `${cap(labels.slope)}: on the GIVEN graph go from ${pointSay(p1)} to ${pointSay(p2)} — the rise is ${say(rise)} and the run is ${say(run)} — so m = rise ÷ run = ${say(rise)} ÷ ${factor(run)} = ${say(m)}.`;
    }
    case 'twoPointFormula': {
      const [p1, p2] = [pointOf(ev.p1), pointOf(ev.p2)];
      if (!p1 || !p2 || !p1.every(Boolean) || !p2.every(Boolean)) return null;
      const dy = subFractions(p2[1], p1[1]);
      const dx = subFractions(p2[0], p1[0]);
      return `${cap(labels.slope)}: use the slope formula on ${pointSay(p1)} and ${pointSay(p2)} — m = (y₂ − y₁) ÷ (x₂ − x₁) = (${say(p2[1])} − ${factor(p1[1])}) ÷ (${say(p2[0])} − ${factor(p1[0])}) = ${say(dy)} ÷ ${factor(dx)} = ${say(m)}.`;
    }
    case 'tableDelta': {
      const [r1, r2] = [env.rows[ev.r1], env.rows[ev.r2]];
      if (!r1 || !r2) return null;
      const dy = subFractions(r2.y, r1.y);
      const dx = subFractions(r2.x, r1.x);
      return `${cap(labels.slope)}: between ${rowName(ev.r1)} ${pointSay([r1.x, r1.y])} and ${rowName(ev.r2)} ${pointSay([r2.x, r2.y])}, Δy = ${say(r2.y)} − ${factor(r1.y)} = ${say(dy)} and Δx = ${say(r2.x)} − ${factor(r1.x)} = ${say(dx)}, so m = Δy ÷ Δx = ${say(m)}.`;
    }
    case 'tableRead': {
      const row = env.rows[ev.row];
      const target = entry.target === 'xIntercept' ? 'xIntercept' : 'yIntercept';
      if (!row) return null;
      return `${cap(labels[target])}: ${rowName(ev.row)} of the table, ${pointSay([row.x, row.y])}, has ${target === 'xIntercept' ? 'y' : 'x'} = 0, so it is the ${INTERCEPT_LABEL[target]}.`;
    }
    case 'tableRow': {
      const row = env.rows[ev.row];
      return row ? `A point: ${rowName(ev.row)} of the table, ${pointSay([row.x, row.y])}, is on the line.` : null;
    }
    case 'extendTable': {
      const target = entry.target === 'xIntercept' ? 'xIntercept' : 'yIntercept';
      const point = interceptPoint(target);
      const row = env.rows[0];
      if (!row || !point[0] || !point[1]) return null;
      const run = subFractions(point[0], row.x);
      const rise = subFractions(point[1], row.y);
      return `${cap(labels[target])}: extend the table's constant rate ${say(m)} to ${target === 'xIntercept' ? 'y' : 'x'} = 0 — from ${rowName(0)} ${pointSay([row.x, row.y])}, a change of ${say(run)} in x changes y by ${factor(m)}(${say(run)}) = ${say(rise)} — so the ${INTERCEPT_LABEL[target]} is ${pointSay(point)}.`;
    }
    case 'solveForB': {
      const point = pointOf(ev.pt);
      if (!point || !point.every(Boolean)) return null;
      const [x1, y1] = point;
      return `${cap(labels.yIntercept)}: substitute m = ${say(m)} and the point ${pointSay(point)} into y = mx + b: ${say(y1)} = ${factor(m)}(${say(x1)}) + b, so b = ${say(y1)} − ${factor(mulFractions(m, x1))} = ${say(b)} and the y-intercept is ${pointSay([ZERO, b])}.`;
    }
    case 'evaluateAtX': {
      const x = exact(ev.x);
      if (!x) return null;
      const y = addFractions(mulFractions(m, x), b);
      return `A point: choose x = ${say(x)} and compute y = ${evaluated(m, x, b)} = ${say(y)}, so ${pointSay([x, y])} is on the line.`;
    }
    default:
      return null;
  }
};

/** A strategy's classroom name, for the Process Mode note. */
const strategyLabel = (strategy) => LMR_PROCESS_MODEL.strategies[strategy]?.label || '';

const buildBoardReview = (question) => {
  const canonical = deriveLinearMultipleRepresentations(question);
  if (!canonical.isValid) return null;
  const m = exact(canonical.slopeFraction);
  const b = exact(canonical.yInterceptFraction);
  const x0 = canonical.zeroFraction ? exact(canonical.zeroFraction) : null;
  if (!m || !b || (!isZero(m) && !x0)) return null;
  const required = resolveRequiredCards(question);
  if ((required.includes('xIntercept') || required.includes('graphIntercepts')) && !x0) return null;
  const processMode = isProcessModeQuestion(question);
  const scenario = question.source?.kind === 'scenario';
  const labels = {
    slope: scenario ? 'rate of change (slope)' : 'slope',
    yIntercept: scenario ? 'initial value (y-intercept)' : 'y-intercept',
    xIntercept: 'x-intercept',
  };

  // The grader's own key process: the facts and the methods that establish them.
  const env = lmrProcessEnvironment(question, canonical);
  if (!env.valid || !same(env.m, m) || !same(env.b, b)) return null;
  const log = keyProcessLog(question, { env });
  const factSteps = [];
  for (let index = 0; index < log.entries.length; index += 1) {
    const before = resolveLmrProcess(question, { processLog: { ...log, entries: log.entries.slice(0, index) } }, canonical, env);
    const entry = log.entries[index];
    // The equation the student solved for y is read in the next step.
    if (entry.strategy === 'readSlopeIntercept' && entry.from === 'siEquation' && factSteps.length) {
      const sentence = factSentence(entry, env, before, labels);
      if (!sentence) return null;
      factSteps[factSteps.length - 1] = `${factSteps[factSteps.length - 1]} ${sentence}`;
    } else {
      const sentence = factSentence(entry, env, before, labels);
      if (!sentence) return null;
      factSteps.push(sentence);
    }
  }
  const process = resolveLmrProcess(question, { processLog: log }, canonical, env);
  if (!process.facts.slope?.correct || !process.facts.yIntercept?.correct) return null;
  if (required.some((cardId) => ['xIntercept', 'graphIntercepts'].includes(cardId)) && !process.facts.xIntercept?.correct) return null;

  const bounds = resolveLinearMultipleRepresentationsGraphBounds(question, canonical);
  const yPoint = [ZERO, b];
  const nextPoint = stepFrom(yPoint, m, bounds);
  // The point-slope point (and Graph 3's start): the GIVEN point, a GIVEN
  // point or table row, else one slope step from the y-intercept.
  const source = question.source || {};
  const firstRowOffAxis = env.rows.find((row) => !isZero(row.x)) || env.rows[0];
  const anchor = source.kind === 'pointSlope' && env.anchor
    ? env.anchor
    : env.givenPoints[0] || (firstRowOffAxis ? [firstRowOffAxis.x, firstRowOffAxis.y] : nextPoint);
  if (!anchor || !anchor.every(Boolean)) return null;
  const anchorNext = stepFrom(anchor, m, bounds);
  const lattice = [0, 1, 2, 3].map((k) => [mulFractions(F(k), slopeStep(m).run), addFractions(b, mulFractions(F(k), slopeStep(m).rise))]);
  const siEquation = slopeInterceptText(m, b);
  const standard = normalizeStandardCoefficients({ m, b });
  if (!standard) return null;
  const standardEquation = standardText(standard);
  const pointSlopeEquation = pointSlopeText(anchor, m);
  const graph1 = x0 && same(x0, ZERO) && isZero(b) ? [yPoint, nextPoint] : [[x0, ZERO], yPoint];

  const work = {};
  const cardItems = [];
  const cardSteps = [];
  const has = (cardId) => required.includes(cardId);
  const cardLabel = (cardId) => PART_LABELS[CARD_PART_KEYS[cardId]] || cardId;
  const plotText = (points) => points.map(pointTyped).join(' and ');

  if (has('standardForm')) work.standardFormEquation = standardEquation;
  if (has('slopeIntercept')) work.slopeInterceptEquation = siEquation;
  if (has('pointSlope')) work.pointSlopeEquation = pointSlopeEquation;
  if (has('slope')) work.featureSlope = typed(m);
  if (has('xIntercept')) work.featureXIntercept = pointTyped([x0, ZERO]);
  if (has('yIntercept')) work.featureYIntercept = pointTyped(yPoint);
  if (has('twoPoints')) {
    work.featurePoint1 = pointTyped(yPoint);
    work.featurePoint2 = pointTyped(nextPoint);
  }
  if (has('table')) work.tableRows = lattice.map(([x, y]) => ({ x: typed(x), y: typed(y) }));
  if (has('graphIntercepts')) work.graph1Points = graph1.map((point) => point.map(num));
  if (has('graphSlopeIntercept')) work.graph2Points = [yPoint, nextPoint].map((point) => point.map(num));
  if (has('graphPointSlope')) work.graph3Points = [anchor, anchorNext].map((point) => point.map(num));

  const contextFields = gradedContextFields(question);
  const context = question.source?.context || question.context || {};
  const contextItems = [];
  for (const { field, key } of contextFields) {
    const answer = contextAnswer(key === 'domain' ? resolveExpectedDomain(question) : context[key]);
    if (!answer.trim()) return null;
    work[field] = answer;
    contextItems.push({ label: PART_LABELS[field] || field, value: answer });
  }
  if (processMode) work.processLog = log;

  if (!graderAccepts(question, work)) return null;

  // In Process Mode the fact cards hold what the process established.
  const shown = processMode ? materializeProcessBoard(question, work, process, new Set(required)).board : work;
  required.forEach((cardId) => {
    if (cardId === 'twoPoints') cardItems.push({ label: cardLabel(cardId), value: `${text(shown.featurePoint1)} and ${text(shown.featurePoint2)}` });
    else if (cardId === 'table') cardItems.push({ label: cardLabel(cardId), value: work.tableRows.map((row) => `(${row.x}, ${row.y})`).join(', ') });
    else if (cardId === 'graphIntercepts') cardItems.push({ label: cardLabel(cardId), value: `plot ${plotText(graph1)}` });
    else if (cardId === 'graphSlopeIntercept') cardItems.push({ label: cardLabel(cardId), value: `plot ${plotText([yPoint, nextPoint])}` });
    else if (cardId === 'graphPointSlope') cardItems.push({ label: cardLabel(cardId), value: `plot ${plotText([anchor, anchorNext])}` });
    else {
      const field = { standardForm: 'standardFormEquation', slopeIntercept: 'slopeInterceptEquation', pointSlope: 'pointSlopeEquation', slope: 'featureSlope', xIntercept: 'featureXIntercept', yIntercept: 'featureYIntercept' }[cardId];
      cardItems.push({ label: cardLabel(cardId), value: text(shown[field]) });
    }
  });
  if (cardItems.some((item) => !item.value.trim())) return null;

  // The cards, built from the facts.
  if (has('slopeIntercept')) cardSteps.push(`${cardLabel('slopeIntercept')}: put m = ${say(m)} and b = ${say(b)} into y = mx + b: ${sayEquation(siEquation)}.`);
  if (has('standardForm')) {
    const L = (m.d * b.d) / gcdOf(m.d, b.d);
    const raw = { A: -(L / m.d) * m.n, B: L, C: (L / b.d) * b.n };
    const cleared = L > 1 ? `multiply every term of ${si(m, b)} by ${L} to clear the fractions` : `start from ${si(m, b)}`;
    const flip = raw.A < 0 || (raw.A === 0 && raw.B < 0);
    const divisor = gcdOf(gcdOf(raw.A, raw.B), raw.C);
    const finish = [flip ? 'multiply every term by −1 so the x-coefficient is positive' : '', divisor > 1 ? `divide every term by ${divisor}` : ''].filter(Boolean).join(' and ');
    const moved = isZero(m)
      ? `${cleared}: there is no x-term, so it is already Ax + By = C with A = 0`
      : `${cleared}, then move the x-term to the left: ${sayEquation(standardText(raw))}`;
    cardSteps.push(finish
      ? `${cardLabel('standardForm')}: ${moved}; ${finish}. Standard form: ${sayEquation(standardEquation)}.`
      : `${cardLabel('standardForm')}: ${moved} — whole numbers and a ${isZero(m) ? 'positive y-coefficient' : 'positive x-coefficient'}, so this is standard form: ${sayEquation(standardEquation)}.`);
  }
  if (has('pointSlope')) cardSteps.push(`${cardLabel('pointSlope')}: use the point (x₁, y₁) = ${pointSay(anchor)} and m = ${say(m)} in y − y₁ = m(x − x₁): ${sayEquation(pointSlopeEquation)}.`);
  if (has('table')) cardSteps.push(`${cardLabel('table')}: start at the y-intercept ${pointSay(yPoint)} and step by the slope — each time x goes up ${say(slopeStep(m).run)}, y changes by ${say(slopeStep(m).rise)}: ${lattice.map(pointSay).join(', ')}.`);
  if (has('twoPoints')) cardSteps.push(`${cardLabel('twoPoints')}: ${text(shown.featurePoint1).replace(/-/g, '−')} and ${text(shown.featurePoint2).replace(/-/g, '−')} are two different points on the line.`);
  const graphSentences = [
    has('graphIntercepts') ? `Graph 1 (intercepts): plot ${graph1.map(pointSay).join(' and ')}${graph1[0] === yPoint ? ' — the line goes through the origin, so both intercepts are (0, 0) and the slope gives a second point' : ' — where the line crosses each axis'}.` : '',
    has('graphSlopeIntercept') ? `Graph 2 (slope-intercept): plot the y-intercept ${pointSay(yPoint)}, then ${runRiseText(yPoint, nextPoint)} to ${pointSay(nextPoint)}.` : '',
    has('graphPointSlope') ? `Graph 3 (point-slope): plot the point ${pointSay(anchor)} from point-slope form, then ${runRiseText(anchor, anchorNext)} to ${pointSay(anchorNext)}.` : '',
  ].filter(Boolean);
  if (graphSentences.length) cardSteps.push(`${graphSentences.join(' ')} Draw the line through each pair of points.`);
  if (contextItems.length) cardSteps.push(`The situation: ${contextItems.map((item) => `${item.label.toLowerCase()} — "${item.value}"`).join('; ')}.`);

  // The check: two points of the line satisfy standard form and give the slope.
  const p = x0 && !same(x0, ZERO) ? [x0, ZERO] : nextPoint;
  const q = yPoint;
  // Ax + By at a point: "6 − 2(0)", "2(3/2) + 3(0)", "−(−2) + (−5)".
  const scaled = (coefficient, value) => (Math.abs(coefficient) === 1 ? factor(value) : `${Math.abs(coefficient)}(${say(value)})`);
  const lhs = (point) => {
    const terms = [];
    if (standard.A) terms.push(`${standard.A < 0 ? '−' : ''}${Math.abs(standard.A) === 1 && standard.A > 0 ? say(point[0]) : scaled(standard.A, point[0])}`);
    if (standard.B) {
      const body = Math.abs(standard.B) === 1 && !terms.length && standard.B > 0 ? say(point[1]) : scaled(standard.B, point[1]);
      terms.push(terms.length ? `${standard.B < 0 ? '−' : '+'} ${body}` : `${standard.B < 0 ? '−' : ''}${body}`);
    }
    return terms.join(' ');
  };
  const slopeBetween = isZero(subFractions(p[0], q[0])) ? null : divFractions(subFractions(p[1], q[1]), subFractions(p[0], q[0]));
  if (!slopeBetween || !same(slopeBetween, m)) return null;
  const C = say(F(standard.C));
  const why = `Check: ${pointSay(p)} and ${pointSay(q)} both satisfy ${sayEquation(standardEquation)} — ${lhs(p)} = ${C} and ${lhs(q)} = ${C} — and the slope between them is (${say(p[1])} − ${factor(q[1])}) ÷ (${say(p[0])} − ${factor(q[0])}) = ${say(m)} = m. Every card is built from the same slope ${say(m)} and y-intercept ${pointSay(yPoint)}, so they all describe one line.`;

  const methods = [];
  if (processMode) {
    const named = (fact) => process.facts[fact] ? strategyLabel(process.facts[fact].strategy) : '';
    const factList = [['slope', labels.slope], ['yIntercept', labels.yIntercept], ['xIntercept', labels.xIntercept]]
      .filter(([fact]) => process.facts[fact] && named(fact))
      .map(([fact, label]) => `${label} — ${named(fact)}`);
    if (factList.length) methods.push(`In Process Mode a key fact counts only when one of the board's methods established it; the steps above use: ${factList.join('; ')}.`);
  }
  const openChoices = ['pointSlope', 'twoPoints', 'table', 'graphSlopeIntercept', 'graphPointSlope'].some(has)
    ? 'Any point on the line works for point-slope form, the table, two points and the graphs\' second points; the ones above are one choice.'
    : '';
  return {
    title: 'Multiple representations solution',
    items: [...cardItems, ...contextItems],
    steps: fitSteps([...factSteps, ...cardSteps]),
    why,
    note: [...methods, openChoices].filter(Boolean).join(' ') || null,
  };
};

function gcdOf(left, right) {
  let x = Math.abs(Math.round(left));
  let y = Math.abs(Math.round(right));
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

/** y = mx + b in a sentence. */
function si(m, b) {
  return sayEquation(slopeInterceptText(m, b));
}

/* --------------------------------------------------------------- builder */

const buildReview = (question) => {
  if (!isRecord(question)) return null;
  const mode = resolveToolMode(representationBridgeDeclaration, question);
  if (mode === 'linearMultipleRepresentations') return buildBoardReview(question);
  return buildBridgeReview(question);
};

export const buildRepresentationBridgeReview = (question) => {
  try {
    return buildReview(question);
  } catch {
    // A question this review cannot read has no review, never a broken one.
    return null;
  }
};

export default buildRepresentationBridgeReview;
