// Question family: lines, slope, intercepts and linear representations: graphing, graphing2, linearTableWorkbench, representationBridge, and multiAnswer items from linear.slopeFromPoints / functions.identifyIntercepts / linear.multipleRepresentations.
//
// Contract (./index.js):
//   matches(question)            → true when this family can help with the question
//   hints(question)              → hint sentences, least to most specific, built from
//                                  the question's OWN numbers; never the answer
//   similarProblem(question, { seed }) → { prompt, steps: [text], answer: text } | null
//                                  a worked sibling with DIFFERENT numbers whose answer is
//                                  not this question's answer
//   expectedValues(question)     → this question's answer value(s) as text, so the runtime
//                                  guard (hintRevealsAnswer) can drop a hint that leaks one
//   backUpQuestion(question)     → { prompt, options: [text, text], correct } | null
//                                  the inclusion "Let's back up" check: one quick
//                                  question about THIS problem's first move (never its
//                                  answer); null keeps the platform's generic one
// `implemented` stays false until the family is real: the index skips it.
//
// WHAT THIS FAMILY OWNS (third in the index order; linearEquations and systems
// come first and claim none of these shapes):
//
//   lineFeatures   `graphing` (Graphing Lines): read the slope and y-intercept
//                  of a line shown as y = mx + b and/or as a graph. The key is
//                  the one the shared grader reads (lineFeatureKey).
//   graphLine      `graphing2`: construct a line, in each of its six modes
//                  (slopeIntercept, throughPoints, pointSlope, standardForm,
//                  verticalHorizontal, factoredLinear). The target line is
//                  the one the shared grader reads (graphingTargetLine),
//                  computed exactly from the same authored fields.
//   table*         `linearTableWorkbench`: constantRate (is the rate
//                  constant?), deriveEquation (y = mx + b from the table) and
//                  repairValue (find and fix the one broken row).
//   bridge         `representationBridge`, mode linear: one table, every
//                  representation (rate, y = mx + b, y = a(x − c), graph).
//   multiRep       `representationBridge`, mode linearMultipleRepresentations
//                  (the board family linear.multipleRepresentations delivers):
//                  one GIVEN representation, every other card.
//   slope          multiAnswer slope of the line through two points: by the
//                  family id linear.slopeFromPoints, or unmistakably (the
//                  prompt asks for "slope", shows exactly two points, has one
//                  open field about slope, and that field's key IS the slope
//                  of those two points).
//   intercepts     multiAnswer intercepts of Ax + By = C: by the family id
//                  functions.identifyIntercepts, or unmistakably (one standard
//                  equation in the prompt, an x-intercept field and a
//                  y-intercept field whose keys ARE its intercepts); and the
//                  Step Algebra intercept orchestrator (mode linearIntercepts),
//                  which linearEquations hands on to this family.
//
// Anything else — a multiAnswer item that merely mentions slope (an inverse
// function's slope, a review of y = x), a `graphing` item with no readable key,
// a table that is not a function — is not claimed.
//
// SAFETY.
//   - Every hint and back-up text is written twice: a spelling that quotes this
//     problem's own numbers (the equation, the points, the table's x-values)
//     and a plain spelling that names the move without them. The numbered
//     spelling is used unless it contains one of this question's answers
//     (hintRevealsAnswer — the platform's own guard, also read with "- 3"
//     closed up to "-3" — against expectedValues plus every plain key the
//     question carries); a text that fails both is
//     dropped. No hint states a slope, an intercept, a point to plot, an
//     equation the student must write, a classification, or a corrected value.
//   - expectedValues lists what the student must FIND, in every spelling a
//     hint could use (3/2, \frac{3}{2}, 1.5, −3, (0, -3), y = 2x - 3, …). A
//     number the question itself prints (the slope of a given y = mx + b the
//     student graphs, the coordinates of a given point) is not a hidden answer
//     of a graphing task and is not listed, so a hint may quote the given; the
//     slope and intercept a `graphing` student TYPES are always listed, so
//     those hints never quote the equation. Where the task is a verdict
//     (constant rate or not), every verdict word is listed, so a hint can
//     name neither, and its silence tells nothing.
//   - The worked sibling has new numbers drawn deterministically from the seed
//     and this question's numbers, and is offered only when its prompt, every
//     step and its answer avoid this question's answers (the same checks the
//     platform runs, against the same wider list). A graphing sibling also
//     never names a point of THIS question's line (where the two lines cross).
//     A sibling of a verdict task is always a constant-rate table, whatever
//     this question's verdict.
//
// Pure: no React, no I/O. Exact rational arithmetic (questionFamilyExact).
import { hintRevealsAnswer } from '../../../../functions/shared/pathSolutionSupport.mjs';
import { answerCandidatesForField } from '../../../../functions/shared/answerUtils.mjs';
import {
  ONE,
  ZERO,
  absolute,
  add,
  divide,
  equals,
  isInteger,
  isZero,
  multiply,
  negate,
  rational,
  rationalLatex,
  rationalText,
  subtract,
  toNumber,
} from '../../../../functions/shared/questionFamilyExact.mjs';
import { lineFeatureKey } from '../../../../functions/shared/serverGrading/tools/graphing.mjs';
import { graphingModeOf, graphingTargetLine } from '../../../../functions/shared/toolMath/graphing2/graphingMath.mjs';
import {
  LINEAR_TABLE_WORKBENCH_MODES,
  findTableRepair,
  normalizeRows,
} from '../../../../functions/shared/toolMath/linearTableWorkbench/linearTableWorkbenchMath.mjs';
import {
  deriveLinearMultipleRepresentations,
  resolveRequiredStages,
} from '../../../../functions/shared/toolMath/representationBridge/representationBridgeMath.mjs';
import { resolveStandardCoefficients } from '../../../../functions/shared/toolMath/stepAlgebra2/linearInterceptsMath.mjs';

export const family = 'linesAndSlope';
export const implemented = true;

export const SLOPE_FAMILY_ID = 'linear.slopeFromPoints';
export const INTERCEPTS_FAMILY_ID = 'functions.identifyIntercepts';
export const MULTIPLE_REPRESENTATIONS_FAMILY_ID = 'linear.multipleRepresentations';

// Every word a "constant rate or not?" verdict can be given in.
export const CLASSIFICATION_PHRASES = Object.freeze(['linear', 'nonlinear', 'non-linear', 'not linear']);

const GRAPHING2_MODES = Object.freeze(['slopeIntercept', 'factoredLinear', 'throughPoints', 'pointSlope', 'standardForm', 'verticalHorizontal']);
const MINUS_ONE = rational(-1);

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const ascii = (value) => String(value ?? '').replace(/[−–]/g, '-');
const typeOf = (question) => text(question?.type) || text(question?.toolId);
const familyIdOf = (question) => text(question?.familyInstance?.familyId) || text(question?.questionFamily?.id) || text(question?.familyId);

const hash = (value) => {
  let h = 2166136261;
  for (const character of String(value)) {
    h ^= character.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/* ---------------------------------------------------------------------------
 * Exact numbers. Keys arrive as numbers (1.5, 0.3333333333333333), numeric
 * strings, "n/d" or {n, d}; every comparison here is exact.
 * ------------------------------------------------------------------------- */

const exact = (value) => {
  try {
    if (isObject(value) && 'n' in value && 'd' in value) {
      const n = Number(value.n);
      const d = Number(value.d);
      if (!d || !Number.isFinite(n) || !Number.isFinite(d)) return null;
      return Number.isSafeInteger(n) && Number.isSafeInteger(d) ? rational(n, d) : exact(n / d);
    }
    if (typeof value === 'string') {
      const cleaned = ascii(value).replace(/\s+/g, '').replace(/^\$|\$$/g, '');
      if (!cleaned) return null;
      const slash = /^(-?\d+)\/(-?\d+)$/.exec(cleaned);
      if (slash) return Number(slash[2]) ? rational(Number(slash[1]), Number(slash[2])) : null;
      const latex = /^(-?)\\frac\{(\d+)\}\{(\d+)\}$/.exec(cleaned);
      if (latex) return Number(latex[3]) ? rational((latex[1] ? -1 : 1) * Number(latex[2]), Number(latex[3])) : null;
      if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(cleaned)) return null;
      return exact(Number(cleaned));
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    for (let d = 1; d <= 1000; d += 1) {
      const n = Math.round(value * d);
      if (Math.abs(n / d - value) <= 1e-9 * Math.max(1, Math.abs(value))) return rational(n, d);
    }
  } catch { /* not an exact number */ }
  return null;
};

/** "3", "-3", "3/2" — ASCII minus, so the guard's numeric boundaries read it. */
const show = (value) => rationalText(value);
const paren = (value) => (value.n < 0 ? `(${show(value)})` : show(value));
const isNegative = (value) => value.n < 0;

const decimalText = (value) => {
  let d = value.d;
  while (d % 2 === 0) d /= 2;
  while (d % 5 === 0) d /= 5;
  if (d !== 1 || value.d === 1) return '';
  return String(Number((value.n / value.d).toFixed(10)));
};

const withUnicodeMinus = (value) => (value.includes('-') ? [value, value.replace(/-/g, '−')] : [value]);

/** Every spelling of one number a hint could contain. */
const numberForms = (value) => {
  if (!value) return [];
  const forms = [rationalText(value), rationalLatex(value)];
  const decimal = decimalText(value);
  if (decimal) {
    forms.push(decimal);
    if (/^-?0\./.test(decimal)) forms.push(decimal.replace('0.', '.'));
  }
  return unique(forms.flatMap(withUnicodeMinus));
};

const coordinateForms = (value) => unique([rationalText(value), decimalText(value)]);

/** Every spelling of one ordered pair a hint could contain. */
const pairForms = (point) => {
  if (!point) return [];
  const out = [];
  coordinateForms(point[0]).forEach((a) => coordinateForms(point[1]).forEach((b) => out.push(`(${a}, ${b})`, `(${a},${b})`)));
  return unique(out.flatMap(withUnicodeMinus));
};

const equationForms = (equation) => unique([equation, equation.replace(/\s+/g, '')].flatMap(withUnicodeMinus));

const pt = ([x, y]) => `(${show(x)}, ${show(y)})`;
const samePoint = (a, b) => Boolean(a && b) && equals(a[0], b[0]) && equals(a[1], b[1]);

/* ---------------------------------------------------------------------------
 * Writing a line.
 * ------------------------------------------------------------------------- */

/** "3x", "x", "-x", "(3/2)x" (or "1.5x" with decimal); '' for a zero coefficient. */
const term = (coefficient, variable, { decimal = false } = {}) => {
  if (isZero(coefficient)) return '';
  if (equals(coefficient, ONE)) return variable;
  if (equals(coefficient, MINUS_ONE)) return `-${variable}`;
  if (isInteger(coefficient)) return `${show(coefficient)}${variable}`;
  return decimal && decimalText(coefficient) ? `${decimalText(coefficient)}${variable}` : `(${show(coefficient)})${variable}`;
};
const signedTail = (value, { decimal = false } = {}) => {
  if (isZero(value)) return '';
  const size = absolute(value);
  return ` ${isNegative(value) ? '-' : '+'} ${decimal && decimalText(size) ? decimalText(size) : show(size)}`;
};

/** y = mx + b */
const lineText = (m, b, options = {}) => {
  const x = term(m, 'x', options);
  return x ? `y = ${x}${signedTail(b, options)}` : `y = ${options.decimal && decimalText(b) ? decimalText(b) : show(b)}`;
};
/** Ax + By = C */
const standardText = (A, B, C) => {
  const x = term(A, 'x');
  const y = term(B, 'y');
  let left = x;
  if (y) left = x ? `${x} ${isNegative(B) ? '-' : '+'} ${term(absolute(B), 'y')}` : y;
  return `${left || '0'} = ${show(C)}`;
};
/** y = a(x - c) */
const factoredText = (a, c) => {
  const lead = equals(a, ONE) ? '' : equals(a, MINUS_ONE) ? '-' : isInteger(a) ? show(a) : `(${show(a)})`;
  return isZero(c) ? `y = ${term(a, 'x')}` : `y = ${lead}(x ${isNegative(c) ? '+' : '-'} ${show(absolute(c))})`;
};
/** y - y1 = m(x - x1) */
const pointSlopeText = (m, [x1, y1]) => {
  const left = isZero(y1) ? 'y' : `y ${isNegative(y1) ? '+' : '-'} ${show(absolute(y1))}`;
  const inner = isZero(x1) ? 'x' : `x ${isNegative(x1) ? '+' : '-'} ${show(absolute(x1))}`;
  return `${left} = ${show(m)}(${inner})`;
};
const differenceText = (a, b) => `${show(a)} - ${paren(b)}`;
/** "rise 3 and run 2" for the slope 3/2. */
const riseRunText = (m) => `rise ${show(rational(m.n))} and run ${m.d}`;
const moveText = (m, run = m.d) => {
  const rise = multiply(m, rational(run));
  return `right ${run} and ${isNegative(rise) ? 'down' : 'up'} ${show(absolute(rise))}`;
};

/* ---------------------------------------------------------------------------
 * Reading the question.
 * ------------------------------------------------------------------------- */

const NUMBER = '-?\\d+(?:\\.\\d+)?';
const pointsIn = (value) => [...ascii(value).matchAll(new RegExp(`\\(\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*\\)`, 'g'))]
  .map((match) => [exact(match[1]), exact(match[2])])
  .filter(([x, y]) => x && y);
const distinctPoints = (points) => points.filter((point, index) => points.findIndex((other) => samePoint(other, point)) === index);
const mathSegments = (prompt) => [...ascii(prompt).matchAll(/\$\$?([^$]+)\$\$?/g)].map((match) => text(match[1]));

/** One side of a linear equation in x and y: { x, y, c } coefficients, or null. */
const linearSide = (side) => {
  let source = ascii(side).replace(/\\left|\\right|\\cdot|\*/g, '').replace(/\\frac\{(\d+)\}\{(\d+)\}/g, '$1/$2').replace(/\s+/g, '');
  if (!source) return null;
  if (!/^[+-]/.test(source)) source = `+${source}`;
  const terms = source.match(/[+-][^+-]*/g);
  if (!terms || terms.join('') !== source) return null;
  const sums = { x: ZERO, y: ZERO, c: ZERO };
  for (const entry of terms) {
    const match = /^([+-])(\d+(?:\.\d+)?(?:\/\d+)?)?([xy])?$/.exec(entry);
    if (!match || (!match[2] && !match[3])) return null;
    let coefficient = match[2] ? exact(match[2]) : ONE;
    if (!coefficient) return null;
    if (match[1] === '-') coefficient = negate(coefficient);
    const key = match[3] || 'c';
    sums[key] = add(sums[key], coefficient);
  }
  return sums;
};

/** "3x + 4y = 24" → { A, B, C }; null unless it is a line in x and y. */
const parseStandard = (equation) => {
  const sides = ascii(equation).split('=');
  if (sides.length !== 2) return null;
  const left = linearSide(sides[0]);
  const right = linearSide(sides[1]);
  if (!left || !right) return null;
  const A = subtract(left.x, right.x);
  const B = subtract(left.y, right.y);
  const C = subtract(right.c, left.c);
  return isZero(A) && isZero(B) ? null : { A, B, C };
};

/** Every point/number a field's key holds. */
const keyedPoints = (field) => answerCandidatesForField(field).flatMap((candidate) => (
  Array.isArray(candidate) && candidate.length === 2
    ? [[exact(candidate[0]), exact(candidate[1])]].filter(([x, y]) => x && y)
    : pointsIn(candidate)
));
const keyedNumbers = (field) => answerCandidatesForField(field).map(exact).filter(Boolean);

const fieldMentions = (field, pattern) => pattern.test(`${text(field?.id)} ${text(field?.label)}`);
const isOpenField = (field) => !list(field?.options).length && !list(field?.choices).length && text(field?.type).toLowerCase() !== 'choice';

/* ---------------------------------------------------------------------------
 * The model of one question: its kind and everything hints, keys, the back-up
 * step and the sibling need. null = not ours.
 * ------------------------------------------------------------------------- */

const exactRows = (rawRows) => {
  const rows = normalizeRows(rawRows).map((row) => ({ x: exact(row.x), y: exact(row.y) }));
  if (rows.length < 3 || !rows.every((row) => row.x && row.y)) return null;
  const xs = rows.map((row) => show(row.x));
  return new Set(xs).size === xs.length ? rows : null;
};
const sortedRows = (rows) => [...rows].sort((left, right) => toNumber(left.x) - toNumber(right.x));
const rateOf = (a, b) => divide(subtract(b.y, a.y), subtract(b.x, a.x));
/** { m, b } when every row lies on one line, else null. */
const exactLine = (rows) => {
  const [first, second, ...rest] = sortedRows(rows);
  const m = rateOf(first, second);
  const b = subtract(first.y, multiply(m, first.x));
  return rest.every((row) => equals(row.y, add(multiply(m, row.x), b))) ? { m, b } : null;
};
const adjacentRates = (rows) => {
  const sorted = sortedRows(rows);
  return sorted.slice(1).map((row, index) => rateOf(sorted[index], row));
};
const requiredComparisonsFor = (question, count) => Math.max(1, Math.min(Number(question.requiredComparisons) || 3, (count * (count - 1)) / 2));

const lineFeaturesModel = (question) => {
  const key = lineFeatureKey(question);
  const m = exact(key.m);
  const b = exact(key.b);
  if (!m || !b) return null;
  const shown = question.graph ? question.graph : question.visual?.type === 'graph' ? question.visual : question.showGraph ? {} : null;
  // GraphLine shows equationLatex, or y = mx + b built from the authored m and b.
  const authored = (value) => value !== null && value !== undefined && text(value) !== '' && Number.isFinite(Number(value));
  const equationShown = question.showEquation !== false
    && (Boolean(text(question.equationLatex)) || (authored(question.m) && authored(question.b)));
  const window = {
    xMin: Number.isFinite(Number(shown?.xMin)) ? Number(shown.xMin) : -10,
    xMax: Number.isFinite(Number(shown?.xMax)) ? Number(shown.xMax) : 10,
    yMin: Number.isFinite(Number(shown?.yMin)) ? Number(shown.yMin) : -10,
    yMax: Number.isFinite(Number(shown?.yMax)) ? Number(shown.yMax) : 10,
  };
  return { kind: 'lineFeatures', m, b, equationShown, graphShown: Boolean(shown), window };
};

const slopeInterceptLine = (m, b) => (m && b ? { vertical: false, m, b } : null);
const throughLine = ([x1, y1], [x2, y2]) => {
  if (equals(x1, x2)) return equals(y1, y2) ? null : { vertical: true, x: x1 };
  const m = divide(subtract(y2, y1), subtract(x2, x1));
  return { vertical: false, m, b: subtract(y1, multiply(m, x1)) };
};

/*
 * The line a graphing2 question asks for, exactly. The shared grader's
 * graphingTargetLine rounds derived slopes to 8 decimals (−2/3 becomes
 * −0.66666667), which is not an exact number; the line is computed here from
 * the same authored fields instead, and the item is ours only when the
 * grader can read a target too.
 */
const graphLineModel = (question) => {
  const mode = graphingModeOf(question);
  if (!GRAPHING2_MODES.includes(mode)) return null;
  const target = graphingTargetLine(question);
  if (!target) return null;
  const model = { kind: 'graphLine', mode, line: null, printed: [], givenPoints: [], display: '' };
  if (mode === 'slopeIntercept') {
    model.line = target.kind === 'vertical'
      ? (exact(target.x) ? { vertical: true, x: exact(target.x) } : null)
      : slopeInterceptLine(exact(target.m), exact(target.b));
    if (!model.line) return null;
    // As Graphing2 shows it: y = 1.5x − 2.
    model.display = model.line.vertical ? `x = ${show(model.line.x)}` : lineText(model.line.m, model.line.b, { decimal: true });
    model.printed = model.line.vertical ? [model.line.x] : [model.line.m, model.line.b];
  } else if (mode === 'throughPoints') {
    const points = list(question.givenPoints).map((point) => (Array.isArray(point) ? [exact(point[0]), exact(point[1])] : [exact(point?.x), exact(point?.y)]));
    if (points.length !== 2 || !points.every(([x, y]) => x && y)) return null;
    model.line = throughLine(points[0], points[1]);
    model.givenPoints = points;
    model.printed = points.flat();
    model.display = `${pt(points[0])} and ${pt(points[1])}`;
  } else if (mode === 'pointSlope') {
    const raw = question.point || [0, 0];
    const point = Array.isArray(raw) ? [exact(raw[0]), exact(raw[1])] : [exact(raw?.x), exact(raw?.y)];
    const slope = exact(question.slope);
    if (!point[0] || !point[1] || !slope) return null;
    model.line = slopeInterceptLine(slope, subtract(point[1], multiply(slope, point[0])));
    model.givenPoints = [point];
    model.point = point;
    model.printed = [...point, slope];
    model.display = `the line through ${pt(point)} with slope ${show(slope)}`;
  } else if (mode === 'standardForm') {
    const A = exact(question.standard?.A);
    const B = exact(question.standard?.B);
    const C = exact(question.standard?.C);
    if (!A || !B || !C || (isZero(A) && isZero(B))) return null;
    model.line = isZero(B) ? { vertical: true, x: divide(C, A) } : slopeInterceptLine(divide(negate(A), B), divide(C, B));
    Object.assign(model, { A, B, C, printed: [A, B, C], display: standardText(A, B, C) });
  } else if (mode === 'factoredLinear') {
    const a = exact(question.factored?.a);
    const c = exact(question.factored?.c);
    if (!a || !c || isZero(a)) return null;
    model.line = slopeInterceptLine(a, negate(multiply(a, c)));
    Object.assign(model, { a, c, printed: [a, c], display: factoredText(a, c) });
  } else {
    const value = exact(question.value);
    if (!value || !['vertical', 'horizontal'].includes(question.orientation)) return null;
    model.line = question.orientation === 'vertical' ? { vertical: true, x: value } : slopeInterceptLine(ZERO, value);
    Object.assign(model, { orientation: question.orientation, value, printed: [value], display: `${question.orientation === 'vertical' ? 'x' : 'y'} = ${show(value)}` });
  }
  return model.line ? model : null;
};

const tableModel = (question) => {
  const rows = exactRows(question.rows);
  if (!rows) return null;
  const mode = LINEAR_TABLE_WORKBENCH_MODES.includes(question.mode) ? question.mode : 'constantRate';
  const required = requiredComparisonsFor(question, rows.length);
  const line = exactLine(rows);
  if (mode === 'constantRate') return { kind: 'tableRate', rows, required, line, rates: adjacentRates(rows) };
  if (mode === 'deriveEquation') return line ? { kind: 'tableEquation', rows, required, m: line.m, b: line.b } : null;
  // repairValue: the row the grader itself finds, corrected exactly.
  const repair = findTableRepair(normalizeRows(question.rows));
  if (!repair) return null;
  const good = rows.filter((_, index) => index !== repair.offendingIndex);
  const fixed = exactLine(good);
  if (!fixed) return null;
  const broken = rows[repair.offendingIndex];
  const correctedY = add(multiply(fixed.m, broken.x), fixed.b);
  return { kind: 'tableRepair', rows, required, index: repair.offendingIndex, correctedY, m: fixed.m, b: fixed.b };
};

const bridgeModel = (question) => {
  const mode = question.mode == null ? 'linear' : question.mode;
  if (mode === 'linear') {
    if (question.source?.kind !== 'table') return null;
    const rows = exactRows(question.source.rows);
    const line = rows && exactLine(rows);
    if (!line) return null;
    const zero = isZero(line.m) ? null : divide(negate(line.b), line.m);
    return { kind: 'bridge', rows, m: line.m, b: line.b, zero, stages: resolveRequiredStages(question) };
  }
  if (mode !== 'linearMultipleRepresentations') return null;
  const facts = deriveLinearMultipleRepresentations(question);
  if (!facts?.isValid) return null;
  const m = exact(facts.slopeFraction);
  const b = exact(facts.yInterceptFraction);
  if (!m || !b) return null;
  const zero = facts.zeroFraction ? exact(facts.zeroFraction) : null;
  const source = question.source || {};
  const standard = facts.standard ? { A: exact(facts.standard.A), B: exact(facts.standard.B), C: exact(facts.standard.C) } : null;
  const model = { kind: 'multiRep', given: text(source.kind), m, b, zero, standard: standard?.A && standard?.B && standard?.C ? standard : null, display: '' };
  if (model.given === 'standardForm') {
    const parsed = source.equation ? parseStandard(source.equation) : null;
    model.display = source.equation ? ascii(text(source.equation)) : '';
    if (!parsed && model.standard) model.display = standardText(model.standard.A, model.standard.B, model.standard.C);
  } else if (model.given === 'slopeIntercept') {
    model.display = source.equation ? ascii(text(source.equation)) : lineText(m, b);
  } else if (model.given === 'pointSlope') {
    const point = facts.sourcePoint ? [exact(facts.sourcePoint[0]), exact(facts.sourcePoint[1])] : null;
    model.display = source.equation ? ascii(text(source.equation)) : point && point[0] && point[1] ? pointSlopeText(m, point) : '';
  } else if (model.given === 'twoPoints' || model.given === 'graph') {
    const points = list(facts.sourcePoints).map(([x, y]) => [exact(x), exact(y)]).filter(([x, y]) => x && y);
    model.points = points.length >= 2 ? points.slice(0, 2) : null;
  } else if (model.given === 'table') {
    model.rows = exactRows(source.rows);
  }
  return model;
};

const slopeModel = (question) => {
  const fields = list(question.answerFields);
  const points = distinctPoints(pointsIn(question.prompt));
  if (points.length !== 2 || equals(points[0][0], points[1][0])) return null;
  const m = rateOf({ x: points[0][0], y: points[0][1] }, { x: points[1][0], y: points[1][1] });
  const slopeFields = fields.filter((field) => fieldMentions(field, /slope|\bm\b/i) && isOpenField(field));
  if (slopeFields.length !== 1) return null;
  const keyed = keyedNumbers(slopeFields[0]).some((value) => equals(value, m));
  if (!keyed) return null;
  if (familyIdOf(question) !== SLOPE_FAMILY_ID) {
    // Unmistakable: the prompt asks for the slope, there is one open field,
    // and its key IS the slope of the two points the prompt shows.
    if (fields.length !== 1 || !/\bslope\b/i.test(text(question.prompt))) return null;
  }
  return { kind: 'slope', points, m };
};

const interceptsFromStandard = ({ A, B, C }) => {
  if (isZero(A) || isZero(B)) return null;
  return { xInt: [divide(C, A), ZERO], yInt: [ZERO, divide(C, B)] };
};

const interceptsModel = (question) => {
  const fields = list(question.answerFields);
  const xField = fields.find((field) => fieldMentions(field, /x.?intercept/i));
  const yField = fields.find((field) => fieldMentions(field, /y.?intercept/i));
  if (!xField || !yField || ![xField, yField].every(isOpenField)) return null;
  const keyMatches = (field, point, coordinate) => keyedPoints(field).some((keyed) => samePoint(keyed, point))
    || keyedNumbers(field).some((value) => equals(value, point[coordinate]));
  const equations = mathSegments(question.prompt).map((segment) => ({ segment, standard: parseStandard(segment) })).filter((entry) => entry.standard);
  const fromFamily = familyIdOf(question) === INTERCEPTS_FAMILY_ID;
  if (!fromFamily && (equations.length !== 1 || fields.length !== 2 || !/intercept/i.test(text(question.prompt)))) return null;
  for (const { segment, standard } of equations) {
    const intercepts = interceptsFromStandard(standard);
    if (!intercepts) continue;
    if (keyMatches(xField, intercepts.xInt, 0) && keyMatches(yField, intercepts.yInt, 1)) {
      return { kind: 'intercepts', ...standard, ...intercepts, display: text(segment), workspace: false };
    }
  }
  return null;
};

const linearInterceptsModel = (question) => {
  const standard = resolveStandardCoefficients(question);
  if (!standard) return null;
  const A = exact(standard.A);
  const B = exact(standard.B);
  const C = exact(standard.C);
  if (!A || !B || !C) return null;
  const intercepts = interceptsFromStandard({ A, B, C });
  return intercepts ? { kind: 'intercepts', A, B, C, ...intercepts, display: standardText(A, B, C), workspace: true } : null;
};

const modelFor = (question) => {
  if (!isObject(question)) return null;
  try {
    const type = typeOf(question);
    if (type === 'graphing') return lineFeaturesModel(question);
    if (type === 'graphing2') return graphLineModel(question);
    if (type === 'linearTableWorkbench') return tableModel(question);
    if (type === 'representationBridge') return bridgeModel(question);
    if (type === 'multiAnswer') {
      const id = familyIdOf(question);
      if (id === SLOPE_FAMILY_ID) return slopeModel(question);
      if (id === INTERCEPTS_FAMILY_ID) return interceptsModel(question);
      return slopeModel(question) || interceptsModel(question);
    }
    if ((type === 'stepAlgebra' || type === 'stepAlgebra2') && text(question.mode).toLowerCase() === 'linearintercepts') {
      return linearInterceptsModel(question);
    }
  } catch { /* a question this family cannot read is not its question */ }
  return null;
};

export const matches = (question) => Boolean(modelFor(question));

/* ---------------------------------------------------------------------------
 * expectedValues: everything the student must find, in every spelling.
 * ------------------------------------------------------------------------- */

const lineAnswers = (m, b) => [...numberForms(m), ...numberForms(b), ...pairForms([ZERO, b]), ...equationForms(lineText(m, b))];

const graphLineAnswers = (model) => {
  const { line, printed, givenPoints } = model;
  if (model.mode === 'verticalHorizontal') return []; // everything about x = 3 is printed; any two of its points are right
  const isPrinted = (value) => printed.some((entry) => equals(entry, value));
  const isGiven = (point) => givenPoints.some((entry) => samePoint(entry, point));
  const out = [];
  if (line.vertical) {
    if (!isGiven([line.x, ZERO])) out.push(...pairForms([line.x, ZERO]));
    return unique(out);
  }
  const { m, b } = line;
  if (!isPrinted(m)) out.push(...numberForms(m));
  if (!isPrinted(b)) out.push(...numberForms(b));
  if (!isGiven([ZERO, b])) out.push(...pairForms([ZERO, b]));
  if (!isZero(m)) {
    const xInt = [divide(negate(b), m), ZERO];
    if (!isGiven(xInt)) out.push(...pairForms(xInt));
  }
  if (model.mode !== 'slopeIntercept') out.push(...equationForms(lineText(m, b)));
  return unique(out);
};

const expectedFor = (model) => {
  switch (model.kind) {
    case 'lineFeatures':
      return unique([...numberForms(model.m), ...numberForms(model.b), ...pairForms([ZERO, model.b])]);
    case 'graphLine':
      return graphLineAnswers(model);
    case 'tableRate':
      return unique([...CLASSIFICATION_PHRASES, ...model.rates.flatMap(numberForms)]);
    case 'tableEquation':
      return unique([...CLASSIFICATION_PHRASES, ...lineAnswers(model.m, model.b)]);
    case 'tableRepair': {
      const broken = model.rows[model.index];
      return unique([
        ...CLASSIFICATION_PHRASES,
        ...numberForms(model.correctedY),
        ...pairForms([broken.x, model.correctedY]),
        ...numberForms(model.m),
        `row ${model.index + 1}`,
      ]);
    }
    case 'bridge':
    case 'multiRep': {
      const out = [...lineAnswers(model.m, model.b)];
      if (model.zero) out.push(...numberForms(model.zero), ...pairForms([model.zero, ZERO]), ...equationForms(factoredText(model.m, model.zero)));
      if (model.kind === 'bridge') out.push('constant'); // the rate conclusion, always "constant" on a valid bridge table
      if (model.standard) out.push(...equationForms(standardText(model.standard.A, model.standard.B, model.standard.C)));
      return unique(out);
    }
    case 'slope':
      return numberForms(model.m);
    case 'intercepts': {
      const [p] = model.xInt;
      const [, q] = model.yInt;
      return unique([
        ...pairForms(model.xInt),
        ...pairForms(model.yInt),
        ...coordinateForms(p).flatMap((value) => equationForms(`x = ${value}`)),
        ...coordinateForms(q).flatMap((value) => equationForms(`y = ${value}`)),
      ]);
    }
    default:
      return [];
  }
};

export const expectedValues = (question) => {
  const model = modelFor(question);
  if (!model) return [];
  try {
    return expectedFor(model);
  } catch {
    return [];
  }
};

/** The plain keys the platform guard also reads (questionAnswerValues), without the family. */
const rawKeyTexts = (question = {}) => {
  const values = [];
  const push = (value) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      if (value.length === 2 && value.every((entry) => typeof entry === 'number')) values.push(`(${value[0]}, ${value[1]})`, `(${value[0]},${value[1]})`);
      return;
    }
    if (typeof value !== 'object') values.push(text(value));
  };
  list(question.answerFields).forEach((field) => answerCandidatesForField(field).forEach(push));
  push(question.answer);
  push(question.solution);
  push(question.target);
  push(question.generatedAnswer);
  list(question.acceptedAnswers).forEach(push);
  if (isObject(question.solutionKey)) push(question.solutionKey.value);
  return values;
};

const guardFor = (question, model) => unique([...expectedFor(model), ...rawKeyTexts(question)]);

/**
 * hintRevealsAnswer, also on the spelling with every "- 3" closed up to "-3":
 * an equation writes a term's sign with a space (y = (x - 3)), which the
 * platform guard does not read as −3, while a hidden 3 already sent "x - 3"
 * to the plain spelling.
 */
const revealsAnswer = (value, guard) => hintRevealsAnswer(value, guard)
  || hintRevealsAnswer(String(value ?? '').replace(/[-−]\s+(?=[\d.])/g, '-'), guard);

/** The numbered spelling unless it leaks, else the plain one, else nothing. */
const choose = (guard) => ([specific, plain]) => {
  if (specific && !revealsAnswer(specific, guard)) return specific;
  if (plain && !revealsAnswer(plain, guard)) return plain;
  return null;
};

/* ---------------------------------------------------------------------------
 * hints: least to most specific. Each entry is [numbered, plain].
 * ------------------------------------------------------------------------- */

/** Two x-values (not 0) where the line passes through grid corners inside the window. */
const latticeXs = (model) => {
  const out = [];
  const { xMin, xMax, yMin, yMax } = model.window;
  for (let step = 1; step <= Math.max(Math.abs(xMin), Math.abs(xMax)) && out.length < 2; step += 1) {
    for (const x of [step, -step]) {
      if (x < xMin || x > xMax || out.length >= 2) continue;
      const y = add(multiply(model.m, rational(x)), model.b);
      if (isInteger(y) && toNumber(y) >= yMin && toNumber(y) <= yMax) out.push(x);
    }
  }
  return out.length === 2 ? out.sort((a, b) => a - b) : null;
};

const xValuesOf = (rows) => sortedRows(rows).map((row) => show(row.x));

const lineFeaturesHints = (model) => {
  const lattice = model.graphShown ? latticeXs(model) : null;
  const graphRead = [
    lattice ? `Find two places where the line passes exactly through grid corners, for example at x = ${lattice[0]} and x = ${lattice[1]}, and read their coordinates.` : null,
    'Find two places where the line passes exactly through grid corners, and read their coordinates carefully.',
  ];
  if (model.equationShown) {
    return [
      [null, 'The equation is solved for y, so it has the form y = mx + b: the slope m is the number multiplied by x, and the y-intercept b is the number added on its own.'],
      [null, 'Keep each number together with the sign in front of it: a minus sign belongs to the number that follows it.'],
      model.graphShown ? graphRead : [null, 'The y-intercept is the value of y when x is zero: substitute zero for x and see what is left.'],
      [null, 'Check: on the graph of your line, the y-intercept is where it crosses the y-axis, and the slope says how far it rises for each step to the right.'],
    ];
  }
  return [
    [null, 'The y-intercept b is where the line crosses the y-axis. The slope m tells you how steep the line is and which way it goes.'],
    graphRead,
    [null, 'Slope = rise ÷ run: count how far the line goes up (or down, which makes it negative) while it goes right from one point to the other.'],
    [null, 'Check: from where the line crosses the y-axis, move right one unit and up or down by your slope. You should land on the line again.'],
  ];
};

// y = (x − 3) and y = −(x − 3) have no number written in front of the
// parentheses: the slope is 1 or −1, said as such.
const unitFactorLead = (a) => (equals(a, ONE) ? 'Nothing is written in front of the parentheses, so the slope is' : 'Only a minus sign is written in front of the parentheses, so the slope is');
const unitFactorHint = (a) => (equals(absolute(a), ONE)
  ? [`${unitFactorLead(a)} ${show(a)}: ${riseRunText(a)}.`, `${unitFactorLead(a)} ${equals(a, ONE) ? 'one' : 'negative one'}: use it as rise over run from the x-axis point.`]
  : [`The number in front of the parentheses is the slope: ${riseRunText(a)}.`, 'The number in front of the parentheses is the slope: use it as rise over run from the x-axis point.']);

const graphLineHints = (model) => {
  const { mode, line, display } = model;
  if (mode === 'slopeIntercept' && !line.vertical) {
    return [
      [`Start from ${display}: it is in slope-intercept form y = mx + b.`, 'The equation is in slope-intercept form y = mx + b.'],
      [null, 'Plot the y-intercept first: the point on the y-axis that b gives you.'],
      [`From that point, use the slope as rise over run: ${riseRunText(line.m)}.`, 'From that point, use the slope m as rise over run to find a second point.'],
      [null, 'Check: one more rise-and-run step from your second point should land on the same straight line.'],
    ];
  }
  if (mode === 'throughPoints') {
    const [first, second] = model.givenPoints;
    return [
      [`Your line must pass through ${pt(first)} and ${pt(second)}. Two points are enough to fix a line.`, 'Your line must pass through both given points. Two points are enough to fix a line.'],
      [null, 'Plot each point carefully: move across to its x-coordinate first, then up or down to its y-coordinate.'],
      [`Check: going from ${pt(first)} to ${pt(second)}, your line should rise or fall exactly as the coordinates do.`, 'Check: going from one given point to the other, your line should rise or fall exactly as the coordinates do.'],
    ];
  }
  if (mode === 'pointSlope') {
    const slope = model.printed[2];
    return [
      [`Start at the given point ${pt(model.point)}: plot it first.`, 'Start at the given point: plot it first.'],
      [`The slope ${show(slope)} is rise over run: ${riseRunText(slope)}. From ${pt(model.point)}, make that move to reach a second point.`, 'Use the slope as rise over run to move from the given point to a second point.'],
      [null, 'Check: a positive slope goes up from left to right, and a negative slope goes down.'],
    ];
  }
  if (mode === 'standardForm') {
    if (isZero(model.A) || isZero(model.B)) {
      return [
        [`Start from ${display}: one variable is missing, so the line is vertical or horizontal.`, 'One variable is missing from the equation, so the line is vertical or horizontal.'],
        [`Solve ${display} for the variable that is there; every point on the line has that coordinate.`, 'Solve for the variable that is there; every point on the line has that coordinate.'],
      ];
    }
    return [
      [`Start from ${display}: an equation in standard form is quickest to graph from its intercepts.`, 'An equation in standard form Ax + By = C is quickest to graph from its intercepts.'],
      [`For the point on the y-axis, replace x with 0 in ${display} and solve for y.`, 'For the point on the y-axis, replace x with zero and solve for y.'],
      [`For the point on the x-axis, replace y with 0 in ${display} and solve for x.`, 'For the point on the x-axis, replace y with zero and solve for x.'],
      [`Check: a third point that makes ${display} true should lie on your line.`, 'Check: a third point that makes the equation true should lie on your line.'],
    ];
  }
  if (mode === 'factoredLinear') {
    return [
      [`Start from ${display}: which value of x makes y equal zero? That point is on the x-axis.`, 'In y = a(x − c), y is zero when the factor in parentheses is zero. That point is on the x-axis.'],
      unitFactorHint(model.a),
      [null, 'Check: substitute the x-value of your second point into the equation. The y-value should match your point.'],
    ];
  }
  // verticalHorizontal (or a slope-intercept item authored as a vertical line)
  const vertical = mode === 'verticalHorizontal' ? model.orientation === 'vertical' : true;
  const named = vertical ? 'x' : 'y';
  const free = vertical ? 'y' : 'x';
  return [
    [`In ${display} only ${named} is named: every point on the line has the same ${named}-coordinate, and ${free} can be anything.`, `Only ${named} is named in the equation: every point on the line has the same ${named}-coordinate, and ${free} can be anything.`],
    [null, `Plot two different points that share that ${named}-coordinate, then draw the line through them.`],
    [null, vertical ? 'Check: a vertical line goes straight up and down.' : 'Check: a horizontal line goes straight across.'],
  ];
};

const tableHints = (model) => {
  const xs = xValuesOf(model.rows);
  const firstPair = `x = ${xs[0]} and x = ${xs[1]}`;
  if (model.kind === 'tableRate') {
    return [
      [`Pick two rows, such as ${firstPair}. How much does y change between them, and how much does x change?`, 'Pick two rows. How much does y change between them, and how much does x change?'],
      [null, 'The rate between two rows is (change in y) ÷ (change in x). Subtract in the same order on the top and the bottom.'],
      [`Do the same for another pair, such as x = ${xs[1]} and x = ${xs[2]}, and compare the two rates.`, 'Do the same for another pair of rows and compare the two rates.'],
      [`If every rate you find is the same, the rate of change is constant; if any two differ, it is not. Check at least ${model.required} different pairs before you decide.`, 'If every rate you find is the same, the rate of change is constant; if any two differ, it is not. Check several different pairs before you decide.'],
    ];
  }
  if (model.kind === 'tableEquation') {
    const row = sortedRows(model.rows).find((entry) => !isZero(entry.x));
    return [
      [`Find the rate between two rows, such as ${firstPair}: (change in y) ÷ (change in x). That rate is the slope m.`, 'Find the rate between two rows: (change in y) ÷ (change in x). That rate is the slope m.'],
      [null, 'Check that a different pair of rows gives the same rate.'],
      [row ? `b is the value of y when x is zero. Start from the row x = ${show(row.x)}, y = ${show(row.y)} and undo the slope: b = y − m·x.` : null, 'b is the value of y when x is zero. Start from any row and undo the slope: b = y − m·x.'],
      [null, 'Write y = mx + b with your m and b, then check it by substituting a row of the table.'],
    ];
  }
  return [
    [`Find the rate between each pair of neighbouring rows, starting with ${firstPair}: (change in y) ÷ (change in x).`, 'Find the rate between each pair of neighbouring rows: (change in y) ÷ (change in x).'],
    [null, 'Most of the rates agree. The row that breaks the pattern is the one whose rates disagree with all the others.'],
    [null, 'To fix that row, start from a neighbouring row you trust and use the true rate: new y = neighbour’s y + rate × (change in x).'],
    [null, 'Check: with your corrected value, every pair of neighbouring rows should give the same rate.'],
  ];
};

const bridgeHints = (model) => {
  const xs = xValuesOf(model.rows);
  return [
    [`Start with the table: pick two rows, such as x = ${xs[0]} and x = ${xs[1]}, and find (change in y) ÷ (change in x).`, 'Start with the table: pick two rows and find (change in y) ÷ (change in x).'],
    [null, 'Repeat with other pairs of rows. When every pair gives the same rate, that rate is the slope m in y = mx + b.'],
    [null, 'b is the value of y when x is zero. The factored form y = a(x − c) needs c, the x-value that makes y zero.'],
    [null, 'Check: your equation, your factored form and your graph must all describe the same line. Substitute a row of the table into each one.'],
  ];
};

const multiRepHints = (model) => {
  const display = model.display;
  let first;
  if (model.given === 'standardForm') {
    first = [display ? `Start from the given ${display}: replace x with 0 to find where the line meets the y-axis, and y with 0 to find where it meets the x-axis.` : null, 'Start from the given standard form: replace x with zero to find where the line meets the y-axis, and y with zero to find where it meets the x-axis.'];
  } else if (model.given === 'slopeIntercept') {
    first = [display ? `Start from the given ${display}: in the form y = mx + b you can read the slope and the y-intercept straight off it.` : null, 'Start from the given slope-intercept equation: in the form y = mx + b you can read the slope and the y-intercept straight off it.'];
  } else if (model.given === 'pointSlope') {
    first = [display ? `Start from the given ${display}: the form y − y₁ = m(x − x₁) shows one point on the line and the slope.` : null, 'Start from the given point-slope equation: the form y − y₁ = m(x − x₁) shows one point on the line and the slope.'];
  } else if ((model.given === 'twoPoints' || model.given === 'graph') && model.points) {
    first = [`Start from ${pt(model.points[0])} and ${pt(model.points[1])}: the slope is (change in y) ÷ (change in x) between them.`, 'Start from the two given points: the slope is (change in y) ÷ (change in x) between them.'];
  } else if (model.given === 'table' && model.rows) {
    const xs = xValuesOf(model.rows);
    first = [`Start from the table: pick two rows, such as x = ${xs[0]} and x = ${xs[1]}, and find (change in y) ÷ (change in x).`, 'Start from the table: pick two rows and find (change in y) ÷ (change in x).'];
  } else {
    first = [null, 'Start from the situation: what amount do you begin with, and how much does it change each step? On the graph those are the y-intercept and the slope.'];
  }
  return [
    first,
    [null, 'Once you have the slope m and the y-intercept b, write y = mx + b. Every other card can be built from that equation.'],
    [null, 'For the x-intercept, set y to zero in your equation and solve for x. For standard form, move the x-term to the left side and clear any fractions.'],
    [null, 'Check: every card must describe the same line. Test one point from your table in each equation.'],
  ];
};

const slopeHints = (model) => {
  const [[x1, y1], [x2, y2]] = model.points;
  return [
    [`Label ${pt(model.points[0])} as (x₁, y₁) and ${pt(model.points[1])} as (x₂, y₂).`, 'Label one point (x₁, y₁) and the other (x₂, y₂).'],
    [null, 'Slope = (y₂ − y₁) ÷ (x₂ − x₁): the change in y over the change in x, with both subtractions in the same order.'],
    [`How much does y change from ${show(y1)} to ${show(y2)}? How much does x change from ${show(x1)} to ${show(x2)}?`, 'Find how much y changes from the first point to the second, and how much x changes.'],
    [null, 'Simplify the fraction, and check the sign: if y goes down while x goes up, the slope is negative.'],
  ];
};

const interceptHints = (model) => [
  [`The x-intercept of ${model.display} is where the line crosses the x-axis, so its y-coordinate is 0.`, 'The x-intercept is where the line crosses the x-axis, so its y-coordinate is zero.'],
  [`To find it, replace y with 0 in ${model.display} and solve for x.`, 'To find it, replace y with zero and solve for x.'],
  [`For the y-intercept, replace x with 0 in ${model.display} and solve for y.`, 'For the y-intercept, replace x with zero and solve for y.'],
  [null, 'Write each intercept as an ordered pair: the x-intercept has the form (x, 0) and the y-intercept has the form (0, y).'],
];

const HINTS = Object.freeze({
  lineFeatures: lineFeaturesHints,
  graphLine: graphLineHints,
  tableRate: tableHints,
  tableEquation: tableHints,
  tableRepair: tableHints,
  bridge: bridgeHints,
  multiRep: multiRepHints,
  slope: slopeHints,
  intercepts: interceptHints,
});

export const hints = (question) => {
  const model = modelFor(question);
  if (!model) return [];
  try {
    const guard = guardFor(question, model);
    return unique(HINTS[model.kind](model).map(choose(guard)).filter(Boolean)).slice(0, 4);
  } catch {
    return [];
  }
};

/* ---------------------------------------------------------------------------
 * backUpQuestion: one two-choice question about this problem's first move.
 * ------------------------------------------------------------------------- */

const RATE_STEP = Object.freeze({
  prompt: 'Let’s back up. How do you find the rate of change between two rows of a table?',
  options: ['(change in y) ÷ (change in x)', '(change in x) ÷ (change in y)'],
  correct: '(change in y) ÷ (change in x)',
});

/** [numbered step, plain step]: the first one that names no answer is asked. */
const backUpFor = (model) => {
  const step = (prompt, options, correct) => ({ prompt, options, correct });
  switch (model.kind) {
    case 'lineFeatures':
      return [model.equationShown
        ? step('Let’s back up. In an equation of the form y = mx + b, which part is the slope?', ['The number multiplied by x', 'The number added on its own'], 'The number multiplied by x')
        : step('Let’s back up. Where do you read the y-intercept on a graph?', ['Where the line crosses the y-axis', 'Where the line crosses the x-axis'], 'Where the line crosses the y-axis')];
    case 'graphLine': {
      const { mode, display } = model;
      if (mode === 'slopeIntercept' && !model.line.vertical) {
        const options = ['The y-intercept, on the y-axis', 'A point on the x-axis'];
        return [step(`Let’s back up. To graph ${display}, which point do you plot first?`, options, options[0]), step('Let’s back up. To graph a line in slope-intercept form, which point do you plot first?', options, options[0])];
      }
      if (mode === 'throughPoints') return [step('Let’s back up. Which points must your line pass through?', ['The two given points', 'The origin and one given point'], 'The two given points')];
      if (mode === 'pointSlope') {
        return [
          step(`Let’s back up. Where do you start graphing ${display}?`, [`At ${pt(model.point)}`, 'At the origin'], `At ${pt(model.point)}`),
          step('Let’s back up. Where do you start graphing a line through a given point with a given slope?', ['At the given point', 'At the origin'], 'At the given point'),
        ];
      }
      if (mode === 'standardForm') {
        // 2y = -6 has no x to replace: the question is the one its hints ask.
        if (isZero(model.A) || isZero(model.B)) {
          const correct = isZero(model.B) ? 'The x-coordinate' : 'The y-coordinate';
          return [
            step(`Let’s back up. On the line ${display}, which coordinate is the same at every point?`, ['The x-coordinate', 'The y-coordinate'], correct),
            step(`Let’s back up. On a line whose equation has only ${isZero(model.B) ? 'x' : 'y'} in it, which coordinate is the same at every point?`, ['The x-coordinate', 'The y-coordinate'], correct),
          ];
        }
        const options = ['Replace x or y with zero to find an intercept', 'Set x and y equal to each other'];
        return [step(`Let’s back up. What is a quick first move for graphing ${display}?`, options, options[0]), step('Let’s back up. What is a quick first move for graphing an equation in standard form?', options, options[0])];
      }
      if (mode === 'factoredLinear') {
        const options = ['Where it crosses the x-axis', 'Where it crosses the y-axis'];
        return [step(`Let’s back up. Which point can you read straight from ${display}?`, options, options[0]), step('Let’s back up. Which point can you read straight from y = a(x − c)?', options, options[0])];
      }
      const vertical = mode === 'verticalHorizontal' ? model.orientation === 'vertical' : true;
      const correct = vertical ? 'The x-coordinate' : 'The y-coordinate';
      return [
        step(`Let’s back up. On the line ${display}, which coordinate is the same at every point?`, ['The x-coordinate', 'The y-coordinate'], correct),
        step(`Let’s back up. On a ${vertical ? 'vertical' : 'horizontal'} line, which coordinate is the same at every point?`, ['The x-coordinate', 'The y-coordinate'], correct),
      ];
    }
    case 'tableRate':
    case 'tableEquation':
    case 'tableRepair':
    case 'bridge':
      return [RATE_STEP];
    case 'multiRep':
      if (model.given === 'standardForm') return [step('Let’s back up. From a standard form equation, how do you find where the line crosses the y-axis?', ['Replace x with zero and solve for y', 'Replace y with zero and solve for x'], 'Replace x with zero and solve for y')];
      if (model.given === 'slopeIntercept') return [step('Let’s back up. In y = mx + b, which part is the slope?', ['m, the number multiplied by x', 'b, the number added on its own'], 'm, the number multiplied by x')];
      if (model.given === 'pointSlope') return [step('Let’s back up. In y − y₁ = m(x − x₁), what does (x₁, y₁) give you?', ['A point on the line', 'The y-intercept'], 'A point on the line')];
      if (model.given === 'scenario') return [step('Let’s back up. In the situation, which part of the graph is the starting amount?', ['The y-intercept', 'The slope'], 'The y-intercept')];
      return [RATE_STEP];
    case 'slope': {
      const options = ['The change in y', 'The change in x'];
      return [
        step(`Let’s back up. For ${pt(model.points[0])} and ${pt(model.points[1])}, what goes on top of the slope fraction?`, options, options[0]),
        step('Let’s back up. For the slope between two points, what goes on top of the fraction?', options, options[0]),
      ];
    }
    case 'intercepts':
      return [
        step(`Let’s back up. To find the x-intercept of ${model.display}, which variable do you replace with zero?`, ['y', 'x'], 'y'),
        step('Let’s back up. To find an x-intercept, which variable do you replace with zero?', ['y', 'x'], 'y'),
      ];
    default:
      return [];
  }
};

export const backUpQuestion = (question) => {
  const model = modelFor(question);
  if (!model) return null;
  try {
    const guard = guardFor(question, model);
    const step = backUpFor(model).find((entry) => ![entry.prompt, ...entry.options].some((part) => revealsAnswer(part, guard)));
    if (!step) return null;
    // The right answer is not always the first button.
    const options = hash(`${model.kind}|${step.prompt}`) % 2 ? [...step.options].reverse() : [...step.options];
    return { prompt: step.prompt, options, correct: step.correct };
  } catch {
    return null;
  }
};

/* ---------------------------------------------------------------------------
 * similarProblem: a worked sibling with different numbers.
 * ------------------------------------------------------------------------- */

const R = (value) => exact(value);
const INTEGER_SLOPES = Object.freeze([2, 3, -2, -3, 4, -4, 5, -5, 1, -1, 6, -6].map(R));
const FRACTION_SLOPES = Object.freeze(['1/2', '-1/2', '3/2', '-3/2', '2/3', '-2/3', '5/2', '-5/2', '3/4', '-3/4', '1/3', '-4/3'].map(R));
const HALF_SLOPES = Object.freeze(['1/2', '-1/2', '3/2', '-3/2', '5/2', '-5/2', '1/4', '-3/4'].map(R));
const SMALL_INTEGERS = Object.freeze([3, -4, 2, -3, 5, -2, 4, -5, 6, -1, 1, -6].map(R));

const product = (...lists) => lists.reduce((acc, values) => acc.flatMap((prefix) => values.map((value) => [...prefix, value])), [[]]);

const signatureOf = (model) => JSON.stringify(model, (key, value) => (value && typeof value === 'object' && 'n' in value && 'd' in value ? `${value.n}/${value.d}` : value));

/** The platform's similarExampleIsSafe, against this family's wider guard (stricter on the answer). */
const exampleIsSafe = (question, example, guard) => {
  const prompt = text(example?.prompt);
  const answer = text(example?.answer);
  const steps = list(example?.steps).map(text).filter(Boolean);
  if (!prompt || !answer || !steps.length) return false;
  if (prompt === text(question?.prompt)) return false;
  if (guard.some((value) => value.toLowerCase() === answer.toLowerCase())) return false;
  const value = exact(answer);
  if (value && guard.some((entry) => exact(entry) && equals(exact(entry), value))) return false;
  if (revealsAnswer(answer, guard)) return false;
  if (steps.some((step) => revealsAnswer(step, guard))) return false;
  return !hintRevealsAnswer(prompt, guard.filter((entry) => exact(entry) === null));
};

const onLine = (line, [x, y]) => (line.vertical ? equals(x, line.x) : equals(y, add(multiply(line.m, x), line.b)));

/*
 * The first candidate whose worked sibling is safe. For a graphing task every
 * grid point of this question's line is answer material, so a sibling that
 * names a point of THIS line (where the two lines happen to cross) is passed
 * over as well.
 */
// A bounded search: the platform asks for up to six seeds, in the browser.
const MAX_SIBLING_ATTEMPTS = 400;

const firstSafe = (question, model, seed, candidates, build, { avoidLine = null } = {}) => {
  if (!candidates.length) return null;
  const guard = guardFor(question, model);
  const start = hash(`${signatureOf(model)}|${Number(seed) || 0}`) % candidates.length;
  for (let index = 0; index < Math.min(candidates.length, MAX_SIBLING_ATTEMPTS); index += 1) {
    let example = null;
    try {
      example = build(candidates[(start + index) % candidates.length]);
    } catch {
      example = null;
    }
    if (!example || !exampleIsSafe(question, example, guard)) continue;
    if (avoidLine && pointsIn([example.prompt, ...example.steps, example.answer].join(' ')).some((point) => onLine(avoidLine, point))) continue;
    return example;
  }
  return null;
};

const rowsText = (rows) => `(x, y) = ${rows.map((row) => pt([row.x, row.y])).join(', ')}`;
const tableRowsFor = (m, b, x0, step, count) => Array.from({ length: count }, (_, index) => {
  const x = add(x0, multiply(step, rational(index)));
  return { x, y: add(multiply(m, x), b) };
});
const rateStep = (a, b) => {
  const dy = subtract(b.y, a.y);
  const dx = subtract(b.x, a.x);
  return `From x = ${show(a.x)} to x = ${show(b.x)}: (${differenceText(b.y, a.y)}) ÷ (${differenceText(b.x, a.x)}) = ${show(dy)} ÷ ${show(dx)} = ${show(divide(dy, dx))}.`;
};
const interceptStep = (rows, m, b) => {
  const atZero = rows.find((row) => isZero(row.x));
  if (atZero) return `The row x = 0 has y = ${show(b)}, so b = ${show(b)}.`;
  const row = rows[0];
  return `Undo the slope from ${pt([row.x, row.y])}: b = y - m·x = ${show(row.y)} - ${paren(m)} × ${paren(row.x)} = ${show(b)}.`;
};

const TABLE_STARTS = Object.freeze([[0, 1], [1, 1], [-1, 2], [2, 2], [1, 2], [-2, 1], [4, 1], [5, 2], [-6, 1], [10, 5], [-3, 3]].map(([x0, step]) => [R(x0), R(step)]));
const TABLE_INTERCEPTS = Object.freeze([1, 2, 3, 4, 5, -1, -2, -3, 7, 10].map(R));

const siblingLineFeatures = (question, model, seed) => {
  const safe = (candidates, build) => firstSafe(question, model, seed, candidates, build, { avoidLine: { vertical: false, m: model.m, b: model.b } });
  const slopes = isInteger(model.m) ? INTEGER_SLOPES : HALF_SLOPES;
  const candidates = product(slopes, SMALL_INTEGERS, [2, 3, 1]).filter(([m, b]) => !equals(m, model.m) && !equals(b, model.b));
  return safe(candidates, ([m, b, steps]) => {
    const answer = `m = ${show(m)}, b = ${show(b)}`;
    if (model.equationShown || !model.graphShown) {
      const equation = lineText(m, b);
      return {
        prompt: `Identify the slope m and the y-intercept b of the line ${equation}.`,
        steps: [
          `${equation} is solved for y, so it has the form y = mx + b.`,
          `The slope is the number multiplied by x, sign included: m = ${show(m)}.`,
          `The y-intercept is the number added on its own, sign included: b = ${show(b)}.`,
          `Check: substituting zero for x leaves y = ${show(b)}, which is where the line crosses the y-axis.`,
        ],
        answer,
      };
    }
    // The point is a whole number of slope steps (run m.d each) from the y-axis.
    const run = m.d * steps;
    const rise = multiply(m, rational(run));
    const point = [rational(run), add(b, rise)];
    return {
      prompt: `The graph of a line crosses the y-axis at y = ${show(b)} and also passes through the grid point ${pt(point)}. Identify its slope m and its y-intercept b.`,
      steps: [
        `The line crosses the y-axis at y = ${show(b)}, so the y-intercept is b = ${show(b)}.`,
        `From the y-axis to ${pt(point)} the run is ${run} and the rise is ${differenceText(point[1], b)} = ${show(rise)}.`,
        `Slope m = rise ÷ run = ${show(rise)} ÷ ${run} = ${show(m)}.`,
        `Check: ${show(b)} + ${paren(m)} × ${run} = ${show(point[1])}, the y-value of ${pt(point)}.`,
      ],
      answer,
    };
  });
};

const siblingGraphLine = (question, model, seed) => {
  const safe = (candidates, build) => firstSafe(question, model, seed, candidates, build, { avoidLine: model.line });
  const { mode, line } = model;
  const integerLine = line.vertical || (isInteger(line.m) && isInteger(line.b));
  const slopes = integerLine ? INTEGER_SLOPES : HALF_SLOPES;
  const different = (m, b) => line.vertical || !(equals(m, line.m) && equals(b, line.b));
  if (mode === 'slopeIntercept') {
    const candidates = product(slopes, SMALL_INTEGERS).filter(([m, b]) => different(m, b) && (line.vertical || !equals(m, line.m)));
    return safe(candidates, ([m, b]) => {
      const start = [ZERO, b];
      const second = [rational(m.d), add(b, rational(m.n))];
      return {
        prompt: `Graph ${lineText(m, b)}.`,
        steps: [
          `${lineText(m, b)} has the form y = mx + b, so the slope is ${show(m)} and the y-intercept is ${show(b)}.`,
          `Plot the y-intercept ${pt(start)}.`,
          `The slope ${show(m)} means ${riseRunText(m)}: from ${pt(start)} move ${moveText(m)} to ${pt(second)}.`,
          `Draw the line through ${pt(start)} and ${pt(second)}.`,
        ],
        answer: `The line through ${pt(start)} and ${pt(second)}`,
      };
    });
  }
  if (mode === 'throughPoints') {
    const candidates = product(INTEGER_SLOPES, SMALL_INTEGERS, [-3, -2, -1, 1, 2].map(R), [2, 3].map(R))
      .filter(([m]) => line.vertical || !equals(m, line.m));
    return safe(candidates, ([m, b, x1, dx]) => {
      const first = [x1, add(multiply(m, x1), b)];
      const x2 = add(x1, dx);
      const second = [x2, add(multiply(m, x2), b)];
      if (model.givenPoints.some((point) => samePoint(point, first) || samePoint(point, second))) return null;
      return {
        prompt: `Graph the line that passes through ${pt(first)} and ${pt(second)}.`,
        steps: [
          `Plot ${pt(first)}: across to x = ${show(first[0])}, then to y = ${show(first[1])}.`,
          `Plot ${pt(second)}: across to x = ${show(second[0])}, then to y = ${show(second[1])}.`,
          `Its slope is (${differenceText(second[1], first[1])}) ÷ (${differenceText(second[0], first[0])}) = ${show(m)}, so the line ${isNegative(m) ? 'falls' : 'rises'} from left to right.`,
          `Draw the line through ${pt(first)} and ${pt(second)}; it is ${lineText(m, b)}.`,
        ],
        answer: `The line through ${pt(first)} and ${pt(second)}: ${lineText(m, b)}`,
      };
    });
  }
  if (mode === 'pointSlope') {
    const given = model.printed[2];
    const candidates = product(isInteger(given) ? INTEGER_SLOPES : HALF_SLOPES, [2, -1, 3, -2, 1, -3].map(R), [-2, 3, 1, -4, 4, -1].map(R))
      .filter(([m, x, y]) => !equals(m, given) && !samePoint([x, y], model.point));
    return safe(candidates, ([m, x, y]) => {
      const start = [x, y];
      const second = [add(x, rational(m.d)), add(y, rational(m.n))];
      return {
        prompt: `Graph the line through ${pt(start)} with slope ${show(m)}.`,
        steps: [
          `Plot the given point ${pt(start)}.`,
          `The slope ${show(m)} means ${riseRunText(m)}: from ${pt(start)} move ${moveText(m)} to ${pt(second)}.`,
          `Draw the line through ${pt(start)} and ${pt(second)}.`,
        ],
        answer: `The line through ${pt(start)} and ${pt(second)}`,
      };
    });
  }
  if (mode === 'standardForm') {
    const candidates = product([2, 3, 4, -2, -3, 6, -4, 5].map(R), [3, 2, -4, 5, -2, 4, -3, 6].map(R));
    return safe(candidates, ([p, q]) => {
      const [A, B, C] = standardFromIntercepts(p, q);
      if (!line.vertical && equals(divide(negate(A), B), line.m) && equals(divide(C, B), line.b)) return null;
      const equation = standardText(A, B, C);
      return {
        prompt: `Graph ${equation}.`,
        steps: [
          `Replace x with 0: ${solvedFor(B, 'y', C, q)}. Plot the y-intercept ${pt([ZERO, q])}.`,
          `Replace y with 0: ${solvedFor(A, 'x', C, p)}. Plot the x-intercept ${pt([p, ZERO])}.`,
          `Draw the line through ${pt([ZERO, q])} and ${pt([p, ZERO])}.`,
        ],
        answer: `The line through ${pt([ZERO, q])} and ${pt([p, ZERO])}`,
      };
    });
  }
  if (mode === 'factoredLinear') {
    const candidates = product(isInteger(model.a) ? INTEGER_SLOPES : HALF_SLOPES, [3, -2, 4, -3, 2, -4, 1, -1, 5].map(R))
      .filter(([a, c]) => !equals(a, model.a) && !equals(c, model.c));
    return safe(candidates, ([a, c]) => {
      const start = [c, ZERO];
      const second = [add(c, rational(a.d)), rational(a.n)];
      const factor = isNegative(c) ? `x + ${show(absolute(c))}` : `x - ${show(c)}`;
      return {
        prompt: `Graph ${factoredText(a, c)}.`,
        steps: [
          `y is zero when ${factor} = 0, that is when x = ${show(c)}. Plot the x-intercept ${pt(start)}.`,
          `${equals(absolute(a), ONE) ? `${unitFactorLead(a)} ${show(a)}` : `The number in front of the parentheses, ${show(a)}, is the slope`}: ${riseRunText(a)}. From ${pt(start)} move ${moveText(a)} to ${pt(second)}.`,
          `Draw the line through ${pt(start)} and ${pt(second)}.`,
        ],
        answer: `The line through ${pt(start)} and ${pt(second)}`,
      };
    });
  }
  // verticalHorizontal (and a vertical slope-intercept item)
  const vertical = mode === 'verticalHorizontal' ? model.orientation === 'vertical' : true;
  const current = mode === 'verticalHorizontal' ? model.value : line.x;
  const candidates = [4, -3, 2, -5, 5, -2, 3, -4, 6, 1, -1].map(R).filter((value) => !equals(value, current));
  return safe(candidates, (value) => {
    const named = vertical ? 'x' : 'y';
    const points = vertical ? [[value, R(-2)], [value, R(3)]] : [[R(-2), value], [R(3), value]];
    return {
      prompt: `Graph ${named} = ${show(value)}.`,
      steps: [
        `In ${named} = ${show(value)}, every point has ${named}-coordinate ${show(value)}; the other coordinate can be any number.`,
        `Plot two such points, for example ${pt(points[0])} and ${pt(points[1])}.`,
        `Draw the ${vertical ? 'vertical' : 'horizontal'} line through them.`,
      ],
      answer: `The ${vertical ? 'vertical' : 'horizontal'} line through ${pt(points[0])} and ${pt(points[1])}`,
    };
  });
};

/** "3x = 12, so x = 12 ÷ 3 = 4" — or just "x = 12" when the coefficient is 1. */
const solvedFor = (coefficient, variable, C, value) => (equals(coefficient, ONE)
  ? `${variable} = ${show(C)}`
  : `${term(coefficient, variable)} = ${show(C)}, so ${variable} = ${show(C)} ÷ ${paren(coefficient)} = ${show(value)}`);

/** qx + py = pq in lowest terms with a positive x-coefficient: the line through (p, 0) and (0, q). */
const standardFromIntercepts = (p, q) => {
  const gcdInt = (a, b) => (b ? gcdInt(b, a % b) : Math.abs(a));
  let [A, B, C] = [q.n, p.n, p.n * q.n];
  const divisor = gcdInt(gcdInt(Math.abs(A), Math.abs(B)), Math.abs(C)) || 1;
  const sign = A < 0 ? -1 : 1;
  [A, B, C] = [A, B, C].map((value) => (sign * value) / divisor);
  return [rational(A), rational(B), rational(C)];
};

const siblingTable = (question, model, seed) => {
  const count = Math.min(Math.max(model.rows.length, model.kind === 'tableRepair' ? 4 : 3), 6);
  const slopes = INTEGER_SLOPES.filter((m) => !(equals(m, ONE) || equals(m, MINUS_ONE)));
  if (model.kind === 'tableRepair') {
    const candidates = product(slopes, TABLE_INTERCEPTS, TABLE_STARTS, [1, 2].map((offset) => Math.min(offset, count - 2)), [3, -2, 5, -4].map(R))
      .filter(([m]) => !equals(m, model.m));
    return firstSafe(question, model, seed, candidates, ([m, b, [x0, step], index, delta]) => {
      const truth = tableRowsFor(m, b, x0, step, count);
      const rows = truth.map((row, position) => (position === index ? { x: row.x, y: add(row.y, delta) } : row));
      const broken = rows[index];
      const previous = rows[index - 1];
      const dx = subtract(broken.x, previous.x);
      const corrected = truth[index].y;
      return {
        prompt: `In this table every row but one fits the same rate of change: ${rowsText(rows)}. Find the row that breaks the pattern and its correct y-value.`,
        steps: [
          ...rows.slice(1).map((row, position) => rateStep(rows[position], row)),
          `Every rate is ${show(m)} except the two next to x = ${show(broken.x)}, so that row is the one that is wrong.`,
          `Correct it from ${pt([previous.x, previous.y])}: y = ${show(previous.y)} + ${paren(m)} × ${paren(dx)} = ${show(corrected)}.`,
          `Check: with y = ${show(corrected)} at x = ${show(broken.x)}, every pair of neighbouring rows gives the rate ${show(m)}.`,
        ],
        answer: `The row x = ${show(broken.x)} should have y = ${show(corrected)}`,
      };
    });
  }
  const currentM = model.kind === 'tableEquation' ? model.m : model.line?.m;
  const candidates = product(slopes, TABLE_INTERCEPTS, TABLE_STARTS).filter(([m]) => !currentM || !equals(m, currentM));
  return firstSafe(question, model, seed, candidates, ([m, b, [x0, step]]) => {
    const rows = tableRowsFor(m, b, x0, step, count);
    if (model.kind === 'tableRate') {
      return {
        prompt: `Decide whether y changes at a constant rate in this table, and find the rate: ${rowsText(rows)}.`,
        steps: [
          ...rows.slice(1).map((row, position) => rateStep(rows[position], row)),
          `Every pair of neighbouring rows gives the same rate, ${show(m)}, so y changes at a constant rate of ${show(m)} per unit of x.`,
        ],
        answer: `Constant rate of change: ${show(m)}`,
      };
    }
    const last = rows[rows.length - 1];
    return {
      prompt: `Write the equation y = mx + b for the table ${rowsText(rows)}.`,
      steps: [
        rateStep(rows[0], rows[1]),
        `${rateStep(rows[1], rows[2])} The rate is the same, so m = ${show(m)}.`,
        interceptStep(rows, m, b),
        `So the equation is ${lineText(m, b)}.`,
        `Check with ${pt([last.x, last.y])}: ${paren(m)} × ${paren(last.x)} + ${paren(b)} = ${show(last.y)}.`,
      ],
      answer: lineText(m, b),
    };
  });
};

const siblingBridge = (question, model, seed) => {
  const count = Math.min(Math.max(model.rows.length, 3), 6);
  const candidates = product(INTEGER_SLOPES.filter((m) => !(equals(m, ONE) || equals(m, MINUS_ONE))), [3, -2, 4, 2, -3, 5, -1, 1].map(R), TABLE_STARTS)
    .filter(([m]) => !equals(m, model.m));
  return firstSafe(question, model, seed, candidates, ([m, c, [x0, step]]) => {
    const b = negate(multiply(m, c));
    const rows = tableRowsFor(m, b, x0, step, count);
    return {
      prompt: `For the table ${rowsText(rows)}, find the rate of change, the equation y = mx + b, the x-intercept and the factored form y = a(x - c).`,
      steps: [
        rateStep(rows[0], rows[1]),
        `${rateStep(rows[1], rows[2])} Every pair gives the same rate, so m = ${show(m)}.`,
        interceptStep(rows, m, b),
        `So the equation is ${lineText(m, b)}.`,
        `The x-intercept is where y is zero: ${term(m, 'x')}${signedTail(b)} = 0 gives x = ${show(c)}, the point ${pt([c, ZERO])}.`,
        `Factored form: ${factoredText(m, c)}.`,
      ],
      answer: `${lineText(m, b)}; ${factoredText(m, c)}; x-intercept ${pt([c, ZERO])}`,
    };
  });
};

const siblingMultiRep = (question, model, seed) => {
  const given = ['standardForm', 'slopeIntercept', 'pointSlope', 'twoPoints', 'table', 'scenario'].includes(model.given) ? model.given : 'twoPoints';
  const slopes = given === 'scenario' ? [-2, -3, -4, -5, -6].map(R) : INTEGER_SLOPES.filter((m) => !(equals(m, ONE) || equals(m, MINUS_ONE)));
  const zeros = given === 'scenario' ? [4, 5, 6, 7, 8, 9].map(R) : [3, -2, 4, 2, -3, 5, -1, 1].map(R);
  const candidates = product(slopes, zeros, [2, -1, 3].map(R), [2, 3, 1].map(R)).filter(([m, c]) => !equals(m, model.m) && (!model.zero || !equals(c, model.zero)));
  return firstSafe(question, model, seed, candidates, ([m, c, anchor, spacing]) => {
    const b = negate(multiply(m, c));
    if (isZero(b) || equals(anchor, c)) return null;
    const [A, B, C] = standardFromIntercepts(c, b);
    const standard = standardText(A, B, C);
    const slopeIntercept = lineText(m, b);
    let givenText;
    let firstStep;
    if (given === 'standardForm') {
      givenText = `the standard form equation ${standard}`;
      firstStep = `Solve ${standard} for y: ${term(B, 'y')} = ${term(negate(A), 'x')}${signedTail(C)}, so ${slopeIntercept}: m = ${show(m)} and b = ${show(b)}.`;
    } else if (given === 'slopeIntercept') {
      givenText = `the slope-intercept equation ${slopeIntercept}`;
      firstStep = `${slopeIntercept} is already in the form y = mx + b: m = ${show(m)} and b = ${show(b)}.`;
    } else if (given === 'pointSlope') {
      const point = [anchor, add(multiply(m, anchor), b)];
      givenText = `the point-slope equation ${pointSlopeText(m, point)}`;
      firstStep = `${pointSlopeText(m, point)} passes through ${pt(point)} with slope m = ${show(m)}. Then b = ${show(point[1])} - ${paren(m)} × ${paren(anchor)} = ${show(b)}.`;
    } else if (given === 'table') {
      const rows = tableRowsFor(m, b, anchor, spacing, 4);
      givenText = `the table ${rowsText(rows)}`;
      firstStep = `${rateStep(rows[0], rows[1])} So m = ${show(m)}. Undo the slope from ${pt([rows[1].x, rows[1].y])}: b = ${show(rows[1].y)} - ${paren(m)} × ${paren(rows[1].x)} = ${show(b)}.`;
    } else if (given === 'scenario') {
      const rate = negate(m);
      givenText = `the situation: a pool holds ${show(b)} liters of water and drains at a steady rate of ${show(rate)} liters every minute until it is empty`;
      firstStep = `The amount starts at ${show(b)} liters, so b = ${show(b)}; it drops by ${show(rate)} liters each minute, so m = ${show(m)}.`;
    } else {
      const first = [anchor, add(multiply(m, anchor), b)];
      const x2 = add(anchor, spacing);
      const second = [x2, add(multiply(m, x2), b)];
      givenText = `two points on the line, ${pt(first)} and ${pt(second)}`;
      firstStep = `Slope m = (${differenceText(second[1], first[1])}) ÷ (${differenceText(second[0], first[0])}) = ${show(subtract(second[1], first[1]))} ÷ ${show(spacing)} = ${show(m)}. Then b = ${show(first[1])} - ${paren(m)} × ${paren(first[0])} = ${show(b)}.`;
    }
    return {
      prompt: `You are given ${givenText}. Find the slope, the y-intercept, the x-intercept, the slope-intercept equation and the standard form of the line.`,
      steps: [
        firstStep,
        `Slope-intercept form: ${slopeIntercept}. The y-intercept is ${pt([ZERO, b])}.`,
        `x-intercept: set y to zero, so ${term(m, 'x')}${signedTail(b)} = 0 and x = ${show(c)}: ${pt([c, ZERO])}.`,
        `Standard form: ${standard}.`,
      ],
      answer: `slope ${show(m)}; y-intercept ${pt([ZERO, b])}; x-intercept ${pt([c, ZERO])}; ${slopeIntercept}; ${standard}`,
    };
  });
};

const siblingSlope = (question, model, seed) => {
  const integerSlope = isInteger(model.m);
  const slopes = integerSlope ? INTEGER_SLOPES : FRACTION_SLOPES;
  const candidates = product(slopes, [-3, 1, -2, 2, -1, 3, 4].map(R), [2, -3, 4, -1, 5, -4, 1].map(R), [1, 2, 3].map(R))
    .filter(([m]) => !equals(m, model.m));
  return firstSafe(question, model, seed, candidates, ([m, x1, y1, scale]) => {
    const run = multiply(rational(m.d), scale);
    const rise = multiply(rational(m.n), scale);
    const first = [x1, y1];
    const second = [add(x1, run), add(y1, rise)];
    if (model.points.some((point) => samePoint(point, first) || samePoint(point, second))) return null;
    const simplified = !integerSlope && !equals(scale, ONE);
    return {
      prompt: `Find the slope of the line that passes through ${pt(first)} and ${pt(second)}.`,
      steps: [
        `Label (x₁, y₁) = ${pt(first)} and (x₂, y₂) = ${pt(second)}.`,
        `Change in y: y₂ - y₁ = ${differenceText(second[1], first[1])} = ${show(rise)}.`,
        `Change in x: x₂ - x₁ = ${differenceText(second[0], first[0])} = ${show(run)}.`,
        `Slope = ${show(rise)} ÷ ${show(run)} = ${show(m)}${simplified ? ' in lowest terms' : ''}.`,
      ],
      answer: show(m),
    };
  });
};

const siblingIntercepts = (question, model, seed) => {
  const [p0] = model.xInt;
  const [, q0] = model.yInt;
  const candidates = product([2, 3, 4, -2, -3, 5, -4, 6, -5].map(R), [3, -2, 4, 6, -3, 2, -4, 5, -6].map(R))
    .filter(([p, q]) => !equals(p, p0) && !equals(q, q0));
  return firstSafe(question, model, seed, candidates, ([p, q]) => {
    const [A, B, C] = standardFromIntercepts(p, q);
    const equation = standardText(A, B, C);
    return {
      prompt: model.workspace
        ? `Find both intercepts of ${equation}.`
        : `Find the x-intercept and the y-intercept of ${equation}. Write each as an ordered pair.`,
      steps: [
        `x-intercept: replace y with 0 in ${equation}, which leaves ${solvedFor(A, 'x', C, p)}. The point is ${pt([p, ZERO])}.`,
        `y-intercept: replace x with 0 in ${equation}, which leaves ${solvedFor(B, 'y', C, q)}. The point is ${pt([ZERO, q])}.`,
        `Check: ${paren(A)} × ${paren(p)} = ${show(C)} and ${paren(B)} × ${paren(q)} = ${show(C)}, so both points make ${equation} true.`,
      ],
      answer: `${pt([p, ZERO])} and ${pt([ZERO, q])}`,
    };
  });
};

const SIBLINGS = Object.freeze({
  lineFeatures: siblingLineFeatures,
  graphLine: siblingGraphLine,
  tableRate: siblingTable,
  tableEquation: siblingTable,
  tableRepair: siblingTable,
  bridge: siblingBridge,
  multiRep: siblingMultiRep,
  slope: siblingSlope,
  intercepts: siblingIntercepts,
});

export const similarProblem = (question, { seed = 0 } = {}) => {
  const model = modelFor(question);
  if (!model) return null;
  try {
    return SIBLINGS[model.kind](question, model, seed);
  } catch {
    return null;
  }
};
