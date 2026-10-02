/*
 * PROCESS MODE FOR THE MULTIPLE REPRESENTATIONS BOARD — THE MATHEMATICS.
 *
 * Every piece of process evidence a student produces is marked HERE, by one
 * pure function the board runs to show feedback and the server runs as the
 * authority (serverGrading/tools/representationBridge/lmr.mjs). Nothing the
 * device says about a fact is believed: not that it is verified, not its
 * value, not that a process finished. The device sends what the student did —
 * the numbers they typed, the points they picked, the equations their Step
 * Algebra steps produced — and this file decides, against the question the
 * student was actually shown (a Question Family instance is rebuilt from its
 * pin first), what that work establishes.
 *
 * EXACT. Slopes and intercepts are compared as exact rationals: 3/4 is 3/4,
 * 0.75 is 3/4 too (a terminating decimal IS that fraction), and 0.333 is not
 * 1/3. Values are displayed as the fractions they are.
 *
 * REUSE, NOT A SECOND ENGINE. Solving for y and substituting 0 are marked by
 * the Step Algebra workspace's own verdict (gradeEquationObjective) on the same
 * question the embedded workspace opens (lmrRewriteQuestion,
 * lmrSubstitutionQuestion); the standard-form substitution is the existing
 * intercept tool's (interceptSubEquationQuestion); every step is checked to
 * keep the original line (equationKeepsZeroSet, the rewrite grader's check);
 * the representations themselves are scored by the Worksheet board's own
 * validators (scoreLinearMultipleRepresentations), on a board whose fact cards
 * hold only what the student established.
 *
 * FEEDBACK NEVER GIVES THE ANSWER. A mistake is named by its mathematics —
 * "the slope is the coefficient of x, not the x-term", "you moved down from A
 * to B, so the rise is negative" — never by the value it should have been.
 * Where outcomes are withheld (a DOL, quiz or test) only format problems are
 * said at all.
 */
import { generateStableUUID, stableStringify } from '../../idUtils.mjs';
import { equationToLatex, latexToExpression } from '../../algebra/algebraAstEngine.mjs';
import {
  addFractions,
  divFractions,
  makeFraction,
  mulFractions,
  negFraction,
  standardCoefficientsFromEquationText,
  subFractions,
  toFraction,
} from '../shared/linearEquations.mjs';
import {
  buildInitialEquationState,
  equationKeepsZeroSet,
  sampleEquationZeroSet,
} from '../stepAlgebra2/rewriteLinearFormMath.mjs';
import { gradeEquationObjective } from '../../serverGrading/stepAlgebraEquationVerdict.mjs';
import { formatSubstitutionEquation, interceptSubEquationQuestion } from '../stepAlgebra2/linearInterceptsMath.mjs';
import {
  PROCESS_LOG_LIMITS,
  appendProcessEntry,
  emptyProcessLog,
  factRecords,
  normalizeProcessLog,
  processOptions,
  representationUnlocks,
  requirementAlternatives,
  resolveProcessFacts,
} from '../../processFacts/processFactsEngine.mjs';
import {
  CARD_PART_KEYS,
  authoredPointPair,
  deriveLinearMultipleRepresentations,
  fractionLatex,
  readSourceTableRows,
  refineSnapStep,
  resolveAuthoredSnapStep,
  resolveLinearMultipleRepresentationsGraphBounds,
  resolveRequiredCards,
  scoreLinearMultipleRepresentations,
  unfinishedLinearMultipleRepresentationsParts,
} from './linearMultipleRepresentationsMath.mjs';
import {
  LMR_PROCESS_MODEL,
  SCENARIO_TOKEN_PHRASES,
  TOKEN_PHRASES,
  lmrAchievableTokens,
  lmrBaseTokens,
  lmrProcessContext,
  lmrProcessOptions,
  lmrRelevantFacts,
  processStrategyRestriction,
} from './lmrProcessModel.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? '');

/* ---------------------------------------------------------------------------
 * Exact numbers.
 * ------------------------------------------------------------------------- */

const F = (n, d = 1) => makeFraction(n, d);
const ZERO = F(0);
/** Exact equality, -0 included. */
export const sameFraction = (a, b) => Boolean(a && b) && a.n * b.d === b.n * a.d;
const clean0 = (fraction) => (fraction && fraction.n === 0 ? F(0) : fraction);
/** "3", "-3/4" — what a student would write, and what the evidence keeps. */
export const fractionText = (fraction) => {
  const value = clean0(fraction);
  if (!value) return '';
  return value.d === 1 ? String(value.n) : `${value.n}/${value.d}`;
};
const latexOf = (fraction) => fractionLatex(clean0(fraction));
const pointLatexOf = ([x, y]) => `(${latexOf(x)}, ${latexOf(y)})`;
const pointTextOf = ([x, y]) => `(${fractionText(x)}, ${fractionText(y)})`;
/** One identity per point, for "two different points". */
export const pointKeyOf = (point) => (Array.isArray(point) && point.length === 2 && point.every(Boolean)
  ? `${fractionText(point[0])},${fractionText(point[1])}`
  : null);

// A small exact parser: an optional sign, a decimal or whole number, division,
// parentheses. Nothing else is a number a student types for a slope.
const MAX_DIGITS = 15;
const parseRational = (input) => {
  const source = text(input);
  let index = 0;
  const peek = () => source[index];
  const number = () => {
    const start = index;
    while (/[0-9]/.test(peek() || '')) index += 1;
    let decimals = 0;
    if (peek() === '.') {
      index += 1;
      const decimalStart = index;
      while (/[0-9]/.test(peek() || '')) index += 1;
      decimals = index - decimalStart;
    }
    const raw = source.slice(start, index);
    if (!raw || raw === '.' || raw.replace('.', '').length > MAX_DIGITS) return null;
    const digits = raw.replace('.', '');
    return F(Number(digits), 10 ** decimals);
  };
  let expression;
  const factor = () => {
    if (peek() === '-') { index += 1; const inner = factor(); return inner ? negFraction(inner) : null; }
    if (peek() === '+') { index += 1; return factor(); }
    if (peek() === '(') {
      index += 1;
      const inner = expression();
      if (!inner || peek() !== ')') return null;
      index += 1;
      return inner;
    }
    return number();
  };
  const term = () => {
    let value = factor();
    while (value && peek() === '/') {
      index += 1;
      const divisor = factor();
      if (!divisor || divisor.n === 0) return null;
      value = divFractions(value, divisor);
    }
    return value;
  };
  expression = () => {
    let value = term();
    while (value && (peek() === '+' || peek() === '-')) {
      const sign = peek();
      index += 1;
      const next = term();
      if (!next) return null;
      value = sign === '+' ? addFractions(value, next) : subFractions(value, next);
    }
    return value;
  };
  const result = expression();
  return result && index === source.length ? clean0(result) : null;
};

const asciiOf = (raw) => {
  let value = text(raw).trim().replace(/[−–]/g, '-');
  if (value.includes('\\')) {
    try {
      value = latexToExpression(value);
    } catch {
      return null;
    }
  }
  return value.replace(/\s+/g, '');
};

/**
 * A typed number, read exactly.
 *   { ok: true, value, decimal }      decimal: written with a decimal point
 *   { ok: false, reason }             'blank' | 'variable' | 'unreadable'
 * A leading label the student typed themselves ("m = 2") is accepted.
 */
export const readExactNumber = (raw, { labels = [] } = {}) => {
  let value = asciiOf(raw);
  if (value === null) return { ok: false, reason: 'unreadable' };
  if (!value) return { ok: false, reason: 'blank' };
  const lowered = value.toLowerCase();
  const label = labels.find((entry) => lowered.startsWith(`${entry.toLowerCase()}=`));
  if (label) value = value.slice(label.length + 1);
  if (!value) return { ok: false, reason: 'blank' };
  if (/[a-z]/i.test(value)) return { ok: false, reason: 'variable', variable: (value.match(/[a-z]/i) || [''])[0].toLowerCase() };
  const parsed = parseRational(value);
  return parsed ? { ok: true, value: parsed, decimal: value.includes('.') } : { ok: false, reason: 'unreadable' };
};

// Split "a,b" at its one top-level comma.
const splitPair = (value) => {
  let depth = 0;
  const commas = [];
  [...value].forEach((character, position) => {
    if (character === '(' || character === '[') depth += 1;
    else if (character === ')' || character === ']') depth -= 1;
    else if (character === ',' && depth === 0) commas.push(position);
  });
  return commas.length === 1 ? [value.slice(0, commas[0]), value.slice(commas[0] + 1)] : null;
};

/**
 * An ordered pair, read exactly: "(3, −2)", "\left(\frac{3}{2},0\right)", a
 * plotted [x, y] or { x, y }.
 */
export const readExactPoint = (raw) => {
  if (Array.isArray(raw) || (isObject(raw) && 'x' in raw && 'y' in raw)) {
    const pair = Array.isArray(raw) ? raw : [raw.x, raw.y];
    if (pair.length !== 2) return { ok: false, reason: 'unreadable' };
    const values = pair.map((entry) => (typeof entry === 'number' ? (Number.isFinite(entry) ? clean0(toFraction(entry)) : null) : readExactNumber(entry).value || null));
    return values.every(Boolean) ? { ok: true, value: values } : { ok: false, reason: 'unreadable' };
  }
  let value = asciiOf(raw);
  if (value === null) return { ok: false, reason: 'unreadable' };
  if (!value) return { ok: false, reason: 'blank' };
  if (/^[([].*[)\]]$/.test(value)) {
    const inner = value.slice(1, -1);
    if (splitPair(inner)) value = inner;
  }
  const parts = splitPair(value);
  if (!parts) return { ok: false, reason: 'unreadable' };
  if (parts.some((part) => /[a-z]/i.test(part))) return { ok: false, reason: 'variable' };
  const values = parts.map(parseRational);
  return values.every(Boolean) ? { ok: true, value: values } : { ok: false, reason: 'unreadable' };
};

/* ---------------------------------------------------------------------------
 * The question, as the processes see it.
 * ------------------------------------------------------------------------- */

const exactOf = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (isObject(value) && Number.isFinite(value.n) && Number.isFinite(value.d)) return clean0(F(value.n, value.d));
  if (typeof value === 'number') return Number.isFinite(value) ? clean0(toFraction(value)) : null;
  const read = readExactNumber(value);
  return read.ok ? read.value : null;
};

const term = (coefficient, variable, first) => {
  const value = clean0(coefficient);
  if (!value || value.n === 0) return '';
  const negative = value.n < 0;
  const magnitude = F(Math.abs(value.n), value.d);
  const body = magnitude.n === 1 && magnitude.d === 1 && variable
    ? variable
    : `${magnitude.d === 1 ? magnitude.n : `(${magnitude.n}/${magnitude.d})`}${variable}`;
  if (first) return `${negative ? '-' : ''}${body}`;
  return ` ${negative ? '-' : '+'} ${body}`;
};

/** y = mx + b as Step Algebra reads it: "y = (1/2)x - 3", "y = -x + 4", "y = 5". */
export const slopeInterceptAscii = (m, b) => {
  const slope = clean0(m);
  const intercept = clean0(b);
  if (!slope || !intercept) return '';
  if (slope.n === 0) return `y = ${fractionText(intercept)}`;
  return `y = ${term(slope, 'x', true)}${term(intercept, '', false)}`;
};

const pointSlopeAscii = (point, m) => {
  const [x1, y1] = point.map(clean0);
  const offset = (value, variable) => (value.n === 0 ? `${variable} - 0` : `${variable} ${value.n < 0 ? '+' : '-'} ${fractionText(F(Math.abs(value.n), value.d))}`);
  return `${offset(y1, 'y')} = ${clean0(m).d === 1 ? clean0(m).n : `(${fractionText(m)})`}(${offset(x1, 'x')})`;
};

const authoredEquationAscii = (equation) => {
  const raw = text(equation).trim().replace(/[−–]/g, '-');
  if (!raw) return '';
  if (!raw.includes('\\')) return raw;
  try {
    return latexToExpression(raw);
  } catch {
    return '';
  }
};

/** The GIVEN equation as Step Algebra opens it, for the three equation GIVENs. */
export const givenEquationAscii = (question = {}, canonical = deriveLinearMultipleRepresentations(question)) => {
  const source = question?.source || {};
  if (!canonical?.isValid) return '';
  if (source.kind === 'standardForm') {
    if (text(source.equation).trim()) return authoredEquationAscii(source.equation);
    const [A, B, C] = [source.A, source.B, source.C].map(exactOf);
    if (!A || !B || !C) return '';
    const left = A.n === 0 ? term(B, 'y', true) : `${term(A, 'x', true)}${term(B, 'y', false)}`;
    return `${left} = ${fractionText(C)}`;
  }
  if (source.kind === 'slopeIntercept') {
    return text(source.equation).trim() ? authoredEquationAscii(source.equation) : slopeInterceptAscii(canonical.slopeFraction, canonical.yInterceptFraction);
  }
  if (source.kind === 'pointSlope') {
    if (text(source.equation).trim()) return authoredEquationAscii(source.equation);
    const point = authoredPointPair(source.point);
    const exact = point ? point.map(exactOf) : null;
    const m = exactOf(source.m);
    return exact && exact.every(Boolean) && m ? pointSlopeAscii(exact, m) : '';
  }
  return '';
};

/** The GIVEN standard form's own coefficients (as authored, not reduced). */
const givenStandard = (question, equationAscii) => {
  const source = question?.source || {};
  if (source.kind !== 'standardForm') return null;
  if (!text(source.equation).trim() && [source.A, source.B, source.C].every((value) => value !== undefined && value !== null)) {
    const [A, B, C] = [source.A, source.B, source.C].map(Number);
    return [A, B, C].every(Number.isFinite) ? { A, B, C } : null;
  }
  return standardCoefficientsFromEquationText(equationAscii);
};

/**
 * WHICH QUESTION A PROCESS LOG BELONGS TO.
 *
 * A fingerprint of the delivered question's mathematics — its GIVEN kind, its
 * line, and what the GIVEN shows (the authored standard-form coefficients, the
 * point, the points, the rows) — never its wording, which a translation may
 * change. Two versions of a Question Family slot have different lines, so a
 * fact established on one establishes nothing on another; the browser and the
 * server compute it from the same question, so honest work always matches.
 */
export const lmrProcessBinding = (question = {}, canonical = deriveLinearMultipleRepresentations(question)) => {
  if (!canonical?.isValid) return 'lmr1-invalid';
  const source = question?.source || {};
  const f = (value) => fractionText(exactOf(value));
  const signature = { kind: text(source.kind), m: fractionText(canonical.slopeFraction), b: fractionText(canonical.yInterceptFraction) };
  if (source.kind === 'standardForm') {
    const standard = givenStandard(question, givenEquationAscii(question, canonical));
    if (standard) signature.standard = [standard.A, standard.B, standard.C].map(f);
  }
  if (source.kind === 'pointSlope' && Array.isArray(canonical.sourcePoint)) signature.point = canonical.sourcePoint.map(f);
  if ((source.kind === 'twoPoints' || source.kind === 'graph') && Array.isArray(canonical.sourcePoints)) {
    signature.points = canonical.sourcePoints.map((point) => point.map(f));
  }
  if (source.kind === 'table') signature.rows = (readSourceTableRows(source.rows) || []).map((row) => [f(row.x), f(row.y)]);
  return `lmr1-${generateStableUUID(stableStringify(signature)).replace(/-/g, '').slice(0, 16)}`;
};

/**
 * Where a pick on the GIVEN graph can land in Process Mode: the author's grid,
 * refined (exactly as the board's own graphs are, resolveGraphSnapSteps) until
 * both intercepts and every GIVEN point are on it, so a student can always
 * pick the actual crossing and the actual points — never "close enough".
 */
export const lmrProcessSnapStep = (question = {}, canonical = deriveLinearMultipleRepresentations(question)) => {
  if (!canonical?.isValid) return 1;
  const anchors = [canonical.xInterceptPoint, canonical.yInterceptPoint, ...(Array.isArray(canonical.sourcePoints) ? canonical.sourcePoints : [])]
    .filter((point) => Array.isArray(point) && point.every((value) => Number.isFinite(Number(value))));
  return refineSnapStep(resolveAuthoredSnapStep(question), anchors);
};

/** The points a Process Mode graph pick must be able to land on exactly. */
export const lmrProcessGraphTargets = (question = {}, canonical = deriveLinearMultipleRepresentations(question)) => (canonical?.isValid
  ? [canonical.xInterceptPoint, canonical.yInterceptPoint, ...(Array.isArray(canonical.sourcePoints) ? canonical.sourcePoints : [])]
    .filter((point) => Array.isArray(point) && point.every((value) => Number.isFinite(Number(value))))
  : []);

/** Everything a process is marked against, built once per question. */
export const lmrProcessEnvironment = (question = {}, canonical = deriveLinearMultipleRepresentations(question)) => {
  const context = lmrProcessContext(question);
  const source = question?.source || {};
  const equation = givenEquationAscii(question, canonical);
  const rows = context.given === 'table'
    ? (readSourceTableRows(source.rows) || []).map((row) => ({ x: exactOf(row.x), y: exactOf(row.y), rawX: row.rawX, rawY: row.rawY }))
    : [];
  const anchor = context.given === 'pointSlope' && Array.isArray(canonical?.sourcePoint) ? canonical.sourcePoint.map(exactOf) : null;
  const givenPoints = ['twoPoints', 'graph'].includes(context.given) && Array.isArray(canonical?.sourcePoints)
    ? canonical.sourcePoints.map((point) => point.map(exactOf))
    : [];
  return {
    question,
    canonical,
    context,
    kind: context.given,
    valid: Boolean(canonical?.isValid),
    m: canonical?.isValid ? clean0(canonical.slopeFraction) : null,
    b: canonical?.isValid ? clean0(canonical.yInterceptFraction) : null,
    x0: canonical?.isValid && canonical.zeroFraction ? clean0(canonical.zeroFraction) : null,
    equation,
    standard: givenStandard(question, equation),
    rows,
    anchor,
    givenPoints,
    bounds: canonical?.isValid ? resolveLinearMultipleRepresentationsGraphBounds(question, canonical) : null,
    binding: lmrProcessBinding(question, canonical),
    // Every method this question offers (its GIVEN, the author's
    // restriction), whatever the student has established so far.
    offered: processOptions(LMR_PROCESS_MODEL, context, { allowed: processStrategyRestriction(question) }),
    evaluations: new Map(),
  };
};

const onLine = (env, point) => Boolean(env.m && env.b && point && point.every(Boolean))
  && sameFraction(point[1], addFractions(mulFractions(env.m, point[0]), env.b));

const insideBounds = (env, point) => {
  if (!env.bounds || !point) return false;
  const [x, y] = point.map((value) => value.n / value.d);
  const pad = 0.5;
  return x >= env.bounds.xMin - pad && x <= env.bounds.xMax + pad && y >= env.bounds.yMin - pad && y <= env.bounds.yMax + pad;
};

/** The Step Algebra question "solve the GIVEN for y" opens — and is marked against. */
export const lmrRewriteQuestion = (env) => {
  if (!env?.equation || !['standardForm', 'pointSlope'].includes(env.kind)) return null;
  let state;
  try {
    state = buildInitialEquationState({ equation: env.equation, targetForm: 'slopeIntercept' });
  } catch {
    return null;
  }
  return {
    leftExpression: state.left,
    rightExpression: state.right,
    solveFor: 'y',
    objective: { kind: 'slopeIntercept', variable: 'y', targetForm: 'slopeIntercept', requireSimplifiedFinalForm: true },
  };
};

// Replace a variable with (0) wherever it stands alone: 2x -> 2(0), -x -> -(0).
const substituteZeroInto = (equation, variable) => {
  const sides = text(equation).split('=');
  if (sides.length !== 2) return '';
  const replaced = sides.map((side) => {
    const trimmed = side.trim();
    if (trimmed === variable) return '0';
    return trimmed.replace(new RegExp(`(?<![A-Za-z])${variable}(?![A-Za-z])`, 'g'), '(0)');
  });
  return `${replaced[0]} = ${replaced[1]}`;
};

const equationText = (equation) => (isObject(equation) ? `${text(equation.left)} = ${text(equation.right)}` : text(equation));

/**
 * The one-variable equation "substitute 0 and solve" opens: the GIVEN, the
 * student's own y = mx + b, or y = mx + b made from their slope and
 * y-intercept, with `zero` (x or y) replaced by 0. A standard-form GIVEN opens
 * exactly the equation the platform's intercept tool opens for it.
 */
export const lmrSubstitutionQuestion = (env, sourceId, zero, facts = {}) => {
  if (!['x', 'y'].includes(zero)) return null;
  const other = zero === 'x' ? 'y' : 'x';
  let equation = '';
  if (sourceId === 'given') {
    if (env.kind === 'standardForm' && env.standard) {
      const built = interceptSubEquationQuestion({}, env.standard, zero);
      equation = text(built?.equation);
    } else if (['slopeIntercept', 'pointSlope'].includes(env.kind)) {
      equation = substituteZeroInto(env.equation, zero);
    }
  } else if (sourceId === 'siEquation') {
    const record = facts.siEquation;
    if (record?.value) equation = substituteZeroInto(equationText(record.value), zero);
  } else if (sourceId === 'facts') {
    const slope = facts.slope?.value;
    const intercept = facts.yIntercept?.value;
    if (slope && intercept) equation = substituteZeroInto(slopeInterceptAscii(slope, intercept), zero);
  }
  if (!equation) return null;
  return { equation, solveFor: other, variable: other, prompt: `Solve for ${other}.` };
};

/**
 * The substitution itself, as the student reads it before solving: "3x + 2(0)
 * = 6" for a standard-form GIVEN (the intercept tool's own wording), the
 * substituted equation otherwise. LaTeX.
 */
export const lmrSubstitutionLatex = (env, sourceId, zero, facts = {}) => {
  const question = lmrSubstitutionQuestion(env, sourceId, zero, facts);
  if (!question) return '';
  if (sourceId === 'given' && env.kind === 'standardForm' && env.standard) {
    const written = text(formatSubstitutionEquation(env.standard, zero)).replace(/[−–]/g, '-');
    if (written.includes('=')) return questionEquationLatex({ equation: written });
  }
  return questionEquationLatex(question);
};

const equationLatex = (equation) => {
  try {
    return equationToLatex(equation);
  } catch {
    return `${text(equation?.left)} = ${text(equation?.right)}`;
  }
};

/** A Step Algebra question's equation as display LaTeX ("0 = 2x - 3"). */
export const questionEquationLatex = (question) => {
  if (!question) return '';
  if (question.leftExpression && question.rightExpression) return equationLatex({ left: question.leftExpression, right: question.rightExpression });
  const sides = text(question.equation).split('=');
  return sides.length === 2 ? equationLatex({ left: sides[0].trim(), right: sides[1].trim() }) : text(question.equation);
};

const readEquation = (value) => (isObject(value) && typeof value.left === 'string' && typeof value.right === 'string' && value.left.trim() && value.right.trim()
  ? { left: value.left, right: value.right }
  : null);

const readSteps = (value) => list(value).map(readEquation).filter(Boolean);

// The Step Algebra equation workspace's own verdict on the equation reached.
const equationSolved = (question, equation) => {
  try {
    const objective = gradeEquationObjective(question, { equation })?.part || {};
    return { complete: objective.isComplete === true, correct: objective.isCorrect === true };
  } catch {
    return { complete: false, correct: false };
  }
};

const pristineSolved = (question) => {
  const sides = text(question?.equation).split('=');
  if (sides.length !== 2) return false;
  return equationSolved(question, { left: sides[0].trim(), right: sides[1].trim() }).complete;
};

/* ---------------------------------------------------------------------------
 * Marking one piece of process evidence.
 *
 * Each evaluator returns
 *   { usable, claims: [{ fact, value, key?, pointKey?, point?, correct, display }],
 *     problems: [code], fields: { [field]: { ok, code } } }
 * `usable` is structural (complete, readable work of that strategy);
 * correctness is per claim. `fields` and `problems` drive feedback only.
 * ------------------------------------------------------------------------- */

// Codes that describe the FORM of the work, never whether it is right: the
// only ones said where outcomes are withheld.
export const FORMAT_CODES = Object.freeze(new Set([
  'unreadable-number', 'unreadable-point', 'number-has-variable', 'rewrite-unfinished', 'rewrite-no-steps',
  'sub-unsolved', 'sub-no-steps', 'zero-choice-missing', 'same-point', 'same-x', 'run-zero', 'extend-not-there-yet-x',
  'extend-not-there-yet-y', 'pick-missing', 'pick-outside', 'row-missing', 'point-missing', 'facts-missing',
]));

const numberField = (raw, labels) => readExactNumber(raw, { labels });

const formatCode = (read) => (read.reason === 'variable' ? 'number-has-variable' : 'unreadable-number');

const close = (a, b, tolerance = 0.01) => Boolean(a && b) && Math.abs(a.n / a.d - b.n / b.d) <= tolerance;

const slopeMistake = (value, read, env, { own = false, pointSlope = false } = {}) => {
  if (sameFraction(value, env.m)) return null;
  if (env.m.n === 0) return 'slope-horizontal';
  if (env.b && sameFraction(value, env.b) && !sameFraction(env.m, env.b) && !pointSlope) return 'slope-is-intercept';
  if (sameFraction(negFraction(value), env.m)) return pointSlope ? 'slope-point-slope-sign' : 'slope-sign';
  if (read.decimal && close(value, env.m)) return 'slope-inexact';
  if (Math.abs(env.m.n) === env.m.d && value.n === 0 && !pointSlope) return 'slope-unit';
  if (pointSlope) return 'slope-point-slope';
  return own ? 'slope-own-wrong' : 'slope-wrong';
};

const interceptMistake = (value, read, env) => {
  if (sameFraction(value, env.b)) return null;
  if (env.b.n === 0) return 'intercept-none';
  if (sameFraction(value, env.m) && !sameFraction(env.m, env.b)) return 'intercept-is-slope';
  if (sameFraction(negFraction(value), env.b)) return 'intercept-sign';
  if (read.decimal && close(value, env.b)) return 'intercept-inexact';
  return 'intercept-wrong';
};

// b typed as a number, or the intercept as a point (0, b).
const readIntercept = (raw, labels) => {
  const number = readExactNumber(raw, { labels });
  if (number.ok || number.reason === 'blank') return { ...number, point: false };
  const point = readExactPoint(raw);
  if (point.ok) {
    if (point.value[0].n !== 0) return { ok: false, reason: 'off-axis', point: true };
    return { ok: true, value: point.value[1], decimal: false, point: true };
  }
  return { ...number, point: false };
};

const slopeClaim = (value, correct) => ({ fact: 'slope', value, correct, display: latexOf(value) });
const yInterceptClaim = (value, correct) => {
  const point = [ZERO, value];
  return { fact: 'yIntercept', value, point, pointKey: pointKeyOf(point), correct, display: pointLatexOf(point) };
};
const xInterceptClaim = (value, correct, point = [value, ZERO]) => ({
  fact: 'xIntercept', value, point, pointKey: pointKeyOf(point), correct, display: pointLatexOf(point),
});
const interceptClaim = (fact, point, correct) => (fact === 'xIntercept'
  ? xInterceptClaim(point[0], correct, point)
  : { fact: 'yIntercept', value: point[1], point, pointKey: pointKeyOf(point), correct, display: pointLatexOf(point) });
const pointClaim = (point, correct) => ({ fact: 'point', value: point, point, key: pointKeyOf(point), pointKey: pointKeyOf(point), correct, display: pointLatexOf(point) });

const result = (claims, fields, problems = []) => ({
  usable: claims.length > 0,
  claims,
  fields,
  problems: [...problems, ...Object.values(fields).map((field) => field?.code).filter(Boolean)],
});

/** Read m and b from y = mx + b (the GIVEN, or the student's own). */
const readSlopeIntercept = (entry, state, env) => {
  const ev = entry.ev || {};
  const own = entry.from === 'siEquation';
  const claims = [];
  const fields = {};
  const m = numberField(ev.m, ['m']);
  if (m.ok) {
    const code = slopeMistake(m.value, m, env, { own });
    claims.push(slopeClaim(m.value, !code));
    fields.m = { ok: !code, code };
  } else if (m.reason === 'variable') {
    fields.m = { ok: false, code: m.variable === 'x' ? 'slope-has-x' : 'number-has-variable' };
  } else if (m.reason !== 'blank') {
    fields.m = { ok: false, code: 'unreadable-number' };
  }
  const b = readIntercept(ev.b, ['b']);
  if (b.ok) {
    const code = interceptMistake(b.value, b, env);
    claims.push(yInterceptClaim(b.value, !code));
    fields.b = { ok: !code, code };
  } else if (b.reason === 'off-axis') {
    fields.b = { ok: false, code: 'intercept-not-on-y-axis' };
  } else if (b.reason !== 'blank') {
    fields.b = { ok: false, code: b.reason === 'variable' ? 'number-has-variable' : 'unreadable-number' };
  }
  return result(claims, fields);
};

/** Read m and the point from y − y₁ = m(x − x₁). */
const readPointSlope = (entry, state, env) => {
  const ev = entry.ev || {};
  const claims = [];
  const fields = {};
  const m = numberField(ev.m, ['m']);
  if (m.ok) {
    const code = slopeMistake(m.value, m, env, { pointSlope: true });
    claims.push(slopeClaim(m.value, !code));
    fields.m = { ok: !code, code };
  } else if (m.reason !== 'blank') {
    fields.m = { ok: false, code: m.reason === 'variable' ? 'number-has-variable' : 'unreadable-number' };
  }
  const point = readExactPoint(ev.point);
  if (point.ok && env.anchor) {
    const [x, y] = point.value;
    const [ax, ay] = env.anchor;
    let code = null;
    if (!(sameFraction(x, ax) && sameFraction(y, ay))) {
      if (sameFraction(x, negFraction(ax)) && sameFraction(y, negFraction(ay))) code = 'point-signs';
      else if ((sameFraction(x, negFraction(ax)) && sameFraction(y, ay)) || (sameFraction(x, ax) && sameFraction(y, negFraction(ay)))) code = 'point-sign-one';
      else if (sameFraction(x, ay) && sameFraction(y, ax)) code = 'point-swapped';
      else if (onLine(env, point.value)) code = 'point-not-written';
      else code = 'point-wrong';
    }
    claims.push(pointClaim(point.value, !code));
    fields.point = { ok: !code, code };
  } else if (point.reason !== 'blank') {
    fields.point = { ok: false, code: 'unreadable-point' };
  }
  return result(claims, fields);
};

/** Read the rate of change and the initial value from the situation. */
const readScenario = (entry, state, env) => {
  const ev = entry.ev || {};
  const claims = [];
  const fields = {};
  const rate = numberField(ev.rate, []);
  if (rate.ok) {
    let code = null;
    if (!sameFraction(rate.value, env.m)) {
      if (sameFraction(negFraction(rate.value), env.m)) code = 'rate-sign';
      else if (sameFraction(rate.value, env.b) || sameFraction(negFraction(rate.value), env.b)) code = 'rate-is-start';
      else if (rate.decimal && close(rate.value, env.m)) code = 'slope-inexact';
      else code = 'rate-wrong';
    }
    claims.push(slopeClaim(rate.value, !code));
    fields.rate = { ok: !code, code };
  } else if (rate.reason !== 'blank') {
    fields.rate = { ok: false, code: formatCode(rate) };
  }
  const start = numberField(ev.start, []);
  if (start.ok) {
    let code = null;
    if (!sameFraction(start.value, env.b)) {
      if (sameFraction(start.value, env.m) || sameFraction(negFraction(start.value), env.m)) code = 'start-is-rate';
      else if (sameFraction(negFraction(start.value), env.b)) code = 'intercept-sign';
      else code = 'start-wrong';
    }
    claims.push(yInterceptClaim(start.value, !code));
    fields.start = { ok: !code, code };
  } else if (start.reason !== 'blank') {
    fields.start = { ok: false, code: formatCode(start) };
  }
  return result(claims, fields);
};

/** Solve the GIVEN for y with Step Algebra: the equation reached and its steps. */
const solveForY = (entry, state, env) => {
  const ev = entry.ev || {};
  const question = lmrRewriteQuestion(env);
  const equation = readEquation(ev.eq);
  const steps = readSteps(ev.steps);
  if (!question || !equation) return { usable: false, claims: [], fields: {}, problems: ['rewrite-unfinished'] };
  const solved = equationSolved(question, equation);
  if (!solved.complete) return { usable: false, claims: [], fields: {}, problems: ['rewrite-unfinished'] };
  if (!steps.length) return { usable: false, claims: [], fields: {}, problems: ['rewrite-no-steps'] };
  const reference = sampleEquationZeroSet({ left: question.leftExpression, right: question.rightExpression });
  const stepsHold = Boolean(reference) && steps.every((step) => equationKeepsZeroSet(step, reference));
  const correct = solved.correct && stepsHold;
  return {
    usable: true,
    claims: [{ fact: 'siEquation', value: equation, correct, display: equationLatex(equation) }],
    fields: {},
    problems: correct ? [] : ['rewrite-not-same-line'],
  };
};

const interceptPointOf = (env, fact) => (fact === 'xIntercept' ? (env.x0 ? [env.x0, ZERO] : null) : [ZERO, env.b]);

/** Substitute 0 and solve the one-variable equation with Step Algebra. */
const substituteZero = (entry, state, env) => {
  const ev = entry.ev || {};
  const target = entry.target === 'yIntercept' ? 'yIntercept' : entry.target === 'xIntercept' ? 'xIntercept' : null;
  if (!target) return { usable: false, claims: [], fields: {}, problems: ['zero-choice-missing'] };
  const zero = ['x', 'y'].includes(ev.zero) ? ev.zero : null;
  if (!zero) return { usable: false, claims: [], fields: {}, problems: ['zero-choice-missing'] };
  const question = lmrSubstitutionQuestion(env, entry.from, zero, state.facts || {});
  if (!question) return { usable: false, claims: [], fields: {}, problems: ['facts-missing'] };
  const equation = readEquation(ev.eq);
  const solved = equation ? equationSolved(question, equation) : { complete: false, correct: false };
  if (!solved.complete) return { usable: false, claims: [], fields: {}, problems: ['sub-unsolved'] };
  const steps = readSteps(ev.steps);
  if (!steps.length && !pristineSolved(question)) return { usable: false, claims: [], fields: {}, problems: ['sub-no-steps'] };
  const point = readExactPoint(ev.point);
  if (!point.ok) return { usable: false, claims: [], fields: { point: { ok: false, code: point.reason === 'blank' ? 'point-missing' : 'unreadable-point' } }, problems: [] };
  const expectedZero = target === 'xIntercept' ? 'y' : 'x';
  const truth = interceptPointOf(env, target);
  const [px, py] = point.value;
  let code = null;
  if (zero !== expectedZero) code = target === 'xIntercept' ? 'zero-wrong-x' : 'zero-wrong-y';
  else if (!solved.correct) code = 'sub-not-same';
  else if (target === 'xIntercept' && py.n !== 0) code = 'point-not-on-x-axis';
  else if (target === 'yIntercept' && px.n !== 0) code = 'point-not-on-y-axis';
  else if (!truth || !(sameFraction(px, truth[0]) && sameFraction(py, truth[1]))) code = 'intercept-value-wrong';
  return { usable: true, claims: [interceptClaim(target, point.value, !code)], fields: { point: { ok: !code, code } }, problems: [] };
};

const readPick = (raw) => {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const read = readExactPoint(raw.map(Number));
  return read.ok ? read.value : null;
};

/** Pick where the line crosses an axis on the GIVEN graph. */
const graphCrossing = (entry, state, env) => {
  const target = entry.target === 'yIntercept' ? 'yIntercept' : entry.target === 'xIntercept' ? 'xIntercept' : null;
  const pick = readPick(entry.ev?.pick);
  if (!target || !pick) return { usable: false, claims: [], fields: { pick: { ok: false, code: 'pick-missing' } }, problems: [] };
  if (!insideBounds(env, pick)) return { usable: false, claims: [], fields: { pick: { ok: false, code: 'pick-outside' } }, problems: [] };
  const line = onLine(env, pick);
  const axis = target === 'xIntercept' ? pick[1].n === 0 : pick[0].n === 0;
  let code = null;
  if (!line && axis) code = 'pick-on-axis-off-line';
  else if (line && !axis) code = target === 'xIntercept' ? 'pick-on-line-off-x-axis' : 'pick-on-line-off-y-axis';
  else if (!line) code = 'pick-off-both';
  return { usable: true, claims: [interceptClaim(target, pick, !code)], fields: { pick: { ok: !code, code } }, problems: [] };
};

/** Pick a point on the GIVEN graph and read its coordinates. */
const graphPoint = (entry, state, env) => {
  const pick = readPick(entry.ev?.pick);
  if (!pick) return { usable: false, claims: [], fields: { pick: { ok: false, code: 'pick-missing' } }, problems: [] };
  const typed = readExactPoint(entry.ev?.point);
  if (!typed.ok) return { usable: false, claims: [], fields: { point: { ok: false, code: typed.reason === 'blank' ? 'point-missing' : 'unreadable-point' } }, problems: [] };
  let code = null;
  if (!onLine(env, pick)) code = 'pick-off-line';
  else if (!(sameFraction(typed.value[0], pick[0]) && sameFraction(typed.value[1], pick[1]))) code = 'typed-not-pick';
  else if (!onLine(env, typed.value)) code = 'pick-off-line';
  return { usable: true, claims: [pointClaim(typed.value, !code)], fields: { point: { ok: !code, code } }, problems: [] };
};

const differenceCode = (typed, actual, prefix) => {
  if (sameFraction(typed, actual)) return null;
  if (sameFraction(typed, negFraction(actual))) return `${prefix}-sign`;
  return `${prefix}-wrong`;
};

/** Rise over run between two points picked on the GIVEN graph. */
const riseRun = (entry, state, env) => {
  const ev = entry.ev || {};
  const p1 = readPick(ev.p1);
  const p2 = readPick(ev.p2);
  if (!p1 || !p2) return { usable: false, claims: [], fields: { pick: { ok: false, code: 'pick-missing' } }, problems: [] };
  if (sameFraction(p1[0], p2[0]) && sameFraction(p1[1], p2[1])) return { usable: false, claims: [], fields: { pick: { ok: false, code: 'same-point' } }, problems: [] };
  if (sameFraction(p1[0], p2[0])) return { usable: false, claims: [], fields: { pick: { ok: false, code: 'run-zero' } }, problems: [] };
  const run = numberField(ev.run, []);
  const rise = numberField(ev.rise, []);
  const m = numberField(ev.m, ['m']);
  const fields = {};
  if (!run.ok) fields.run = { ok: false, code: run.reason === 'blank' ? 'unreadable-number' : formatCode(run) };
  if (!rise.ok) fields.rise = { ok: false, code: rise.reason === 'blank' ? 'unreadable-number' : formatCode(rise) };
  if (!m.ok) fields.m = { ok: false, code: m.reason === 'blank' ? 'unreadable-number' : formatCode(m) };
  if (!run.ok || !rise.ok || !m.ok) return { usable: false, claims: [], fields, problems: [] };
  if (run.value.n === 0) return { usable: false, claims: [], fields: { run: { ok: false, code: 'run-zero' } }, problems: [] };
  const actualRun = subFractions(p2[0], p1[0]);
  const actualRise = subFractions(p2[1], p1[1]);
  let code = null;
  let field = 'm';
  if (!onLine(env, p1)) { code = 'p1-off-line'; field = 'pick'; } else if (!onLine(env, p2)) { code = 'p2-off-line'; field = 'pick'; } else if ((code = differenceCode(run.value, actualRun, 'run'))) {
    field = 'run';
  } else if ((code = differenceCode(rise.value, actualRise, 'rise'))) {
    field = 'rise';
  } else if (!sameFraction(m.value, divFractions(rise.value, run.value))) {
    code = rise.value.n !== 0 && sameFraction(m.value, divFractions(run.value, rise.value)) ? 'slope-run-over-rise' : (m.decimal && close(m.value, divFractions(rise.value, run.value)) ? 'slope-inexact' : 'slope-not-quotient');
  } else if (!sameFraction(m.value, env.m)) code = 'slope-wrong';
  return { usable: true, claims: [slopeClaim(m.value, !code)], fields: { [field]: { ok: !code, code } }, problems: [] };
};

// A point the slope formula uses: a GIVEN point (g0, g1), a plotted pick on
// the GIVEN graph, or a point the student established (yIntercept,
// xIntercept, point:<key>).
const formulaPoint = (ref, entry, state, env) => {
  if (entry.from === 'given' && env.kind === 'twoPoints') {
    const index = ref === 'g0' ? 0 : ref === 'g1' ? 1 : -1;
    if (index >= 0 && env.givenPoints[index]) return { point: env.givenPoints[index], valid: true };
    const read = Array.isArray(ref) ? readPick(ref) : null;
    const match = read && env.givenPoints.find((point) => sameFraction(point[0], read[0]) && sameFraction(point[1], read[1]));
    return match ? { point: match, valid: true } : null;
  }
  if (entry.from === 'given' && env.kind === 'graph') {
    const pick = readPick(ref);
    return pick ? { point: pick, valid: onLine(env, pick) } : null;
  }
  if (entry.from === 'points') {
    const key = text(ref);
    const records = ['yIntercept', 'xIntercept', 'point'].flatMap((fact) => factRecords({ facts: state.facts }, fact));
    const record = key === 'yIntercept' || key === 'xIntercept'
      ? factRecords({ facts: state.facts }, key)[0]
      : key.startsWith('point:') ? records.find((held) => held.fact === 'point' && held.key === key.slice(6)) : null;
    if (!record?.point) return null;
    return { point: record.point, valid: true };
  }
  return null;
};

/** (y₂ − y₁)/(x₂ − x₁) from two points, substituted by the student. */
const twoPointFormula = (entry, state, env) => {
  const ev = entry.ev || {};
  const first = formulaPoint(ev.p1, entry, state, env);
  const second = formulaPoint(ev.p2, entry, state, env);
  if (!first || !second) return { usable: false, claims: [], fields: { pick: { ok: false, code: 'point-missing' } }, problems: [] };
  const [a, b] = [first.point, second.point];
  if (sameFraction(a[0], b[0]) && sameFraction(a[1], b[1])) return { usable: false, claims: [], fields: { pick: { ok: false, code: 'same-point' } }, problems: [] };
  if (sameFraction(a[0], b[0])) return { usable: false, claims: [], fields: { pick: { ok: false, code: 'same-x' } }, problems: [] };
  const values = Object.fromEntries(['y2', 'y1', 'x2', 'x1', 'm'].map((key) => [key, numberField(ev[key], key === 'm' ? ['m'] : [])]));
  const fields = {};
  Object.entries(values).forEach(([key, read]) => {
    if (!read.ok) fields[key] = { ok: false, code: read.reason === 'blank' ? 'unreadable-number' : formatCode(read) };
  });
  if (Object.keys(fields).length) return { usable: false, claims: [], fields, problems: [] };
  const { y2, y1, x2, x1, m } = Object.fromEntries(Object.entries(values).map(([key, read]) => [key, read.value]));
  let code = null;
  let field = 'm';
  const matches = (y, x, point) => sameFraction(y, point[1]) && sameFraction(x, point[0]);
  if (!first.valid || !second.valid) { code = 'pt-off-line'; field = 'pick'; } else if (!(matches(y2, x2, b) && matches(y1, x1, a))) {
    field = 'sub';
    const usesBoth = [y2, y1].every((y) => sameFraction(y, a[1]) || sameFraction(y, b[1])) && [x2, x1].every((x) => sameFraction(x, a[0]) || sameFraction(x, b[0]));
    code = usesBoth ? 'sub-mixed' : 'sub-value-wrong';
  } else if (sameFraction(x2, x1)) {
    code = 'same-x';
    field = 'sub';
  } else if (!sameFraction(m, divFractions(subFractions(y2, y1), subFractions(x2, x1)))) {
    code = m.n !== 0 && sameFraction(m, divFractions(subFractions(x2, x1), subFractions(y2, y1))) ? 'slope-run-over-rise' : 'slope-arithmetic';
  } else if (!sameFraction(m, env.m)) code = 'slope-points-wrong';
  return { usable: true, claims: [slopeClaim(m, !code)], fields: { [field]: { ok: !code, code } }, problems: [] };
};

const tableRow = (env, index) => {
  const position = Number(index);
  return Number.isInteger(position) && position >= 0 && position < env.rows.length ? env.rows[position] : null;
};

/** Δy/Δx between two rows of the GIVEN table. */
const tableDelta = (entry, state, env) => {
  const ev = entry.ev || {};
  const first = tableRow(env, ev.r1);
  const second = tableRow(env, ev.r2);
  if (!first || !second) return { usable: false, claims: [], fields: { rows: { ok: false, code: 'row-missing' } }, problems: [] };
  if (Number(ev.r1) === Number(ev.r2)) return { usable: false, claims: [], fields: { rows: { ok: false, code: 'same-point' } }, problems: [] };
  const values = Object.fromEntries(['dy', 'dx', 'm'].map((key) => [key, numberField(ev[key], key === 'm' ? ['m'] : [])]));
  const fields = {};
  Object.entries(values).forEach(([key, read]) => {
    if (!read.ok) fields[key] = { ok: false, code: read.reason === 'blank' ? 'unreadable-number' : formatCode(read) };
  });
  if (Object.keys(fields).length) return { usable: false, claims: [], fields, problems: [] };
  const { dy, dx, m } = Object.fromEntries(Object.entries(values).map(([key, read]) => [key, read.value]));
  if (dx.n === 0) return { usable: false, claims: [], fields: { dx: { ok: false, code: 'run-zero' } }, problems: [] };
  let code = null;
  let field = 'm';
  if ((code = differenceCode(dy, subFractions(second.y, first.y), 'dy'))) field = 'dy';
  else if ((code = differenceCode(dx, subFractions(second.x, first.x), 'dx'))) field = 'dx';
  else if (!sameFraction(m, divFractions(dy, dx))) {
    code = dy.n !== 0 && sameFraction(m, divFractions(dx, dy)) ? 'slope-run-over-rise' : (values.m.decimal && close(m, divFractions(dy, dx)) ? 'slope-inexact' : 'slope-not-quotient');
  } else if (!sameFraction(m, env.m)) code = 'slope-wrong';
  return { usable: true, claims: [slopeClaim(m, !code)], fields: { [field]: { ok: !code, code } }, problems: [] };
};

/** The row of the GIVEN table that already sits on an axis. */
const tableRead = (entry, state, env) => {
  const target = entry.target === 'xIntercept' ? 'xIntercept' : 'yIntercept';
  const row = tableRow(env, entry.ev?.row);
  if (!row) return { usable: false, claims: [], fields: { row: { ok: false, code: 'row-missing' } }, problems: [] };
  const onAxis = target === 'yIntercept' ? row.x.n === 0 : row.y.n === 0;
  const code = onAxis ? null : (target === 'yIntercept' ? 'row-not-zero-x' : 'row-not-zero-y');
  return { usable: true, claims: [interceptClaim(target, [row.x, row.y], !code)], fields: { row: { ok: !code, code } }, problems: [] };
};

/** A row of the GIVEN table, taken as a known point. */
const tableRowPoint = (entry, state, env) => {
  const row = tableRow(env, entry.ev?.row);
  if (!row) return { usable: false, claims: [], fields: { row: { ok: false, code: 'row-missing' } }, problems: [] };
  return { usable: true, claims: [pointClaim([row.x, row.y], onLine(env, [row.x, row.y]))], fields: { row: { ok: true, code: null } }, problems: [] };
};

/** New rows that continue the table's pattern until it reaches an axis. */
const extendTable = (entry, state, env) => {
  const target = entry.target === 'xIntercept' ? 'xIntercept' : 'yIntercept';
  const rows = list(entry.ev?.rows).slice(0, 12).map((row) => ({ x: readExactNumber(row?.x), y: readExactNumber(row?.y) }));
  const filled = rows.filter((row) => row.x.ok || row.y.ok);
  if (!filled.length) return { usable: false, claims: [], fields: { rows: { ok: false, code: target === 'yIntercept' ? 'extend-not-there-yet-y' : 'extend-not-there-yet-x' } }, problems: [] };
  const unreadable = filled.findIndex((row) => !row.x.ok || !row.y.ok);
  if (unreadable >= 0) return { usable: false, claims: [], fields: { rows: { ok: false, code: 'unreadable-number', row: unreadable } }, problems: [] };
  const points = filled.map((row) => [row.x.value, row.y.value]);
  const zero = points.find(([x, y]) => (target === 'yIntercept' ? x.n === 0 : y.n === 0));
  if (!zero) return { usable: false, claims: [], fields: { rows: { ok: false, code: target === 'yIntercept' ? 'extend-not-there-yet-y' : 'extend-not-there-yet-x' } }, problems: [] };
  const off = points.findIndex((point) => !onLine(env, point));
  const code = off >= 0 ? 'extend-off-pattern' : null;
  return { usable: true, claims: [interceptClaim(target, zero, !code)], fields: { rows: { ok: !code, code, row: off >= 0 ? off : null } }, problems: [] };
};

/** b from y₁ = m·x₁ + b, with the student's slope and a point they established. */
const solveForB = (entry, state, env) => {
  const ev = entry.ev || {};
  const slope = state.facts?.slope;
  const ref = text(ev.pt);
  const records = ['xIntercept', 'yIntercept', 'point'].flatMap((fact) => factRecords({ facts: state.facts }, fact));
  const record = ref === 'xIntercept' || ref === 'yIntercept'
    ? records.find((held) => held.fact === ref)
    : ref.startsWith('point:') ? records.find((held) => held.fact === 'point' && held.key === ref.slice(6)) : null;
  if (!slope?.value || !record?.point) return { usable: false, claims: [], fields: { pick: { ok: false, code: 'point-missing' } }, problems: [] };
  const values = Object.fromEntries(['y1', 'm', 'x1', 'b'].map((key) => [key, numberField(ev[key], key === 'b' ? ['b'] : key === 'm' ? ['m'] : [])]));
  const fields = {};
  Object.entries(values).forEach(([key, read]) => {
    if (!read.ok) fields[key] = { ok: false, code: read.reason === 'blank' ? 'unreadable-number' : formatCode(read) };
  });
  if (Object.keys(fields).length) return { usable: false, claims: [], fields, problems: [] };
  const { y1, m, x1, b } = Object.fromEntries(Object.entries(values).map(([key, read]) => [key, read.value]));
  let code = null;
  let field = 'b';
  if (!(sameFraction(y1, record.point[1]) && sameFraction(x1, record.point[0]))) { code = 'sub-point-mismatch'; field = 'sub'; } else if (!sameFraction(m, slope.value)) { code = 'sub-slope-mismatch'; field = 'sub'; } else if (!sameFraction(b, subFractions(y1, mulFractions(m, x1)))) code = 'b-arithmetic';
  else if (!sameFraction(b, env.b)) code = 'intercept-wrong';
  return { usable: true, claims: [yInterceptClaim(b, !code)], fields: { [field]: { ok: !code, code } }, problems: [] };
};

/** Choose an x-value and compute y. */
const evaluateAtX = (entry, state, env) => {
  const ev = entry.ev || {};
  if (entry.from === 'facts' && !(state.facts?.slope?.value && state.facts?.yIntercept?.value)) {
    return { usable: false, claims: [], fields: {}, problems: ['facts-missing'] };
  }
  const x = numberField(ev.x, ['x']);
  const y = numberField(ev.y, ['y']);
  const fields = {};
  if (!x.ok) fields.x = { ok: false, code: x.reason === 'blank' ? 'unreadable-number' : formatCode(x) };
  if (!y.ok) fields.y = { ok: false, code: y.reason === 'blank' ? 'unreadable-number' : formatCode(y) };
  if (Object.keys(fields).length) return { usable: false, claims: [], fields, problems: [] };
  const point = [x.value, y.value];
  const code = onLine(env, point) ? null : 'point-off-line';
  return { usable: true, claims: [pointClaim(point, !code)], fields: { y: { ok: !code, code } }, problems: [] };
};

const EVALUATORS = Object.freeze({
  readSlopeIntercept,
  readPointSlope,
  readScenario,
  solveForY,
  substituteZero,
  graphCrossing,
  graphPoint,
  riseRun,
  twoPointFormula,
  tableDelta,
  tableRead,
  tableRow: tableRowPoint,
  extendTable,
  solveForB,
  evaluateAtX,
});

/**
 * Mark one process entry, as resolution does (exported for the board's
 * feedback). Only a method this question OFFERS counts — its GIVEN, and the
 * author's restriction — and it establishes only the facts it is offered
 * for: a tampered log cannot reach a fact by a route the board never showed.
 */
export const evaluateLmrEntry = (entry, state = {}, env) => {
  const evaluator = EVALUATORS[text(entry?.strategy)];
  if (!evaluator || !env?.valid) return { usable: false, claims: [], fields: {}, problems: ['unknown-strategy'] };
  const option = (env.offered || []).find((candidate) => candidate.strategy === entry.strategy && candidate.source === entry.from);
  if (!option) return { usable: false, claims: [], fields: {}, problems: ['unknown-strategy'] };
  if (entry.target && LMR_PROCESS_MODEL.facts[entry.target] && !option.targets.includes(entry.target) && !option.yields.includes(entry.target)) {
    return { usable: false, claims: [], fields: {}, problems: ['unknown-strategy'] };
  }
  let evaluated;
  try {
    evaluated = evaluator(entry, { facts: state.facts || {} }, env);
  } catch {
    return { usable: false, claims: [], fields: {}, problems: ['unreadable-number'] };
  }
  const claims = list(evaluated?.claims).filter((claim) => option.targets.includes(claim.fact));
  return { ...evaluated, usable: evaluated?.usable === true && claims.length > 0, claims };
};

/* ---------------------------------------------------------------------------
 * Resolution: what a student's log establishes on this question.
 * ------------------------------------------------------------------------- */

/** The GIVEN points of a two-points GIVEN: established before any work. */
const baseFactsOf = (env) => (env.kind === 'twoPoints'
  ? { point: env.givenPoints.filter((point) => point.every(Boolean)).map((point) => pointClaim(point, onLine(env, point))) }
  : {});

/**
 * Everything the board and the grader need to know about a process log:
 *
 *   binding    the fingerprint this question's logs must carry
 *   stale      the log was written for another question (ignored)
 *   facts      { slope, yIntercept, xIntercept, siEquation, point: [] } records
 *   tokens     what those facts establish ("slope", "anyPoint", …)
 *   unlocks    { [cardId]: { unlocked, missing } }
 *   entries    each entry, marked
 */
// Marking an entry is pure in (entry, the facts its method reads), so a
// question's environment remembers recent marks: the board re-resolves on
// every render and Pre-Flight resolves many logs per version, and a Step
// Algebra verdict is the expensive part. Bounded, per question.
const EVALUATION_CACHE_LIMIT = 256;
const factsKeyFor = (entry, facts = {}) => {
  const found = LMR_PROCESS_MODEL.strategies[entry?.strategy]?.sources.find((source) => source.id === entry?.from);
  if (!found?.needs) return '';
  const value = (record) => (record ? JSON.stringify([record.value, record.point || null]) : '');
  return [
    value(facts.slope),
    value(facts.yIntercept),
    value(facts.xIntercept),
    value(facts.siEquation),
    list(facts.point).map((record) => record.key).join(';'),
  ].join('|');
};
// The strategies whose mark depends on which fact the student was finding.
const TARGETED_STRATEGIES = new Set(['substituteZero', 'graphCrossing', 'tableRead', 'extendTable']);
export const cachedEvaluation = (entry, state, env) => {
  if (!env?.evaluations) return evaluateLmrEntry(entry, state, env);
  const target = TARGETED_STRATEGIES.has(entry.strategy) ? entry.target || null : null;
  const key = `${JSON.stringify([entry.strategy, entry.from, target, entry.ev])}#${factsKeyFor(entry, state.facts)}`;
  if (env.evaluations.has(key)) return env.evaluations.get(key);
  const evaluated = evaluateLmrEntry(entry, state, env);
  if (env.evaluations.size >= EVALUATION_CACHE_LIMIT) env.evaluations.delete(env.evaluations.keys().next().value);
  env.evaluations.set(key, evaluated);
  return evaluated;
};

export const resolveLmrProcess = (question = {}, response = {}, canonical = deriveLinearMultipleRepresentations(question), env = lmrProcessEnvironment(question, canonical)) => {
  const resolution = resolveProcessFacts({
    model: LMR_PROCESS_MODEL,
    log: response?.processLog,
    binding: env.binding,
    evaluate: (entry, state) => cachedEvaluation(entry, state, env),
    baseFacts: baseFactsOf(env),
  });
  const achievable = lmrAchievableTokens(question, [...resolution.tokens]);
  return {
    ...resolution,
    env,
    binding: env.binding,
    achievable,
    unlocks: representationUnlocks(LMR_PROCESS_MODEL, resolution.tokens, { achievable }),
  };
};

/** Distinct points the student established (intercepts and points). */
export const establishedPoints = (process) => {
  const seen = new Set();
  return ['yIntercept', 'xIntercept', 'point'].flatMap((fact) => factRecords(process, fact))
    .filter((record) => record?.pointKey && !seen.has(record.pointKey) && seen.add(record.pointKey));
};

/* ---------------------------------------------------------------------------
 * Scoring a Process Mode board.
 * ------------------------------------------------------------------------- */

// The board fields each card's work lives in (the Worksheet board's own).
const CARD_FIELDS = Object.freeze({
  standardForm: ['standardFormEquation'],
  slopeIntercept: ['slopeInterceptEquation'],
  pointSlope: ['pointSlopeEquation'],
  table: ['tableRows'],
  graphIntercepts: ['graph1Points'],
  graphSlopeIntercept: ['graph2Points'],
  graphPointSlope: ['graph3Points'],
});
const EMPTY_FIELD = Object.freeze({ tableRows: [], graph1Points: [], graph2Points: [], graph3Points: [] });

/** A teacher's one-line description of how a fact was established. */
export const methodLabelFor = (record) => {
  if (!record) return '';
  if (record.base) return 'Given';
  const strategy = LMR_PROCESS_MODEL.strategies[record.strategy];
  const source = strategy?.sources.find((entry) => entry.id === record.source);
  return text(source?.method || strategy?.method);
};

/** A fact as plain text: "1/2", "(0, -3)", "y = (1/2)x - 3". */
export const processFactText = (record) => factText(record);

const factText = (record) => {
  if (!record) return '';
  if (Array.isArray(record.point)) return pointTextOf(record.point);
  if (record.fact === 'siEquation') return equationText(record.value);
  return fractionText(record.value);
};

/**
 * THE BOARD THE STUDENT ACTUALLY EARNED, scored by the Worksheet board's own
 * rules.
 *
 * Fact cards hold only what a process established (a fact typed into a box
 * means nothing here), and a representation card the student's facts had not
 * opened holds nothing. That board is then scored by
 * scoreLinearMultipleRepresentations — the same validators, tolerances,
 * context grading and cross-representation check as Worksheet Mode — and the
 * fact parts are taken from the process itself: correct exactly when the fact
 * was established by valid work AND is right.
 */
export const scoreLinearMultipleRepresentationsProcess = (question = {}, response = {}) => {
  const canonical = deriveLinearMultipleRepresentations(question);
  if (!canonical.isValid) return { isCorrect: false, score: 0, error: canonical.error, parts: {} };
  const process = resolveLmrProcess(question, response, canonical);
  const required = new Set(resolveRequiredCards(question));
  const { board, locked, points, correctPoints, shownPoints } = materializeProcessBoard(question, response, process, required);
  const slope = process.facts.slope || null;
  const yIntercept = process.facts.yIntercept || null;
  const xIntercept = process.facts.xIntercept || null;
  const scored = scoreLinearMultipleRepresentations(question, board);
  const parts = { ...scored.parts };
  const evidence = { ...scored.evidence };
  const factEvidence = (record) => (record ? {
    established: true,
    isCorrect: record.correct === true,
    value: factText(record),
    method: methodLabelFor(record),
    strategy: record.strategy,
    source: record.source,
    at: record.at || null,
    tries: record.tries || 0,
  } : { established: false, isCorrect: false });
  if (required.has('slope')) { parts.slope = slope?.correct === true; evidence.slope = factEvidence(slope); }
  if (required.has('yIntercept')) { parts.yIntercept = yIntercept?.correct === true; evidence.yIntercept = factEvidence(yIntercept); }
  if (required.has('xIntercept')) { parts.xIntercept = xIntercept?.correct === true; evidence.xIntercept = factEvidence(xIntercept); }
  if (required.has('twoPoints')) {
    parts.twoPoints = correctPoints.length >= 2;
    evidence.twoPoints = { established: points.length >= 2, isCorrect: parts.twoPoints, points: shownPoints.map(factEvidence) };
  }
  locked.forEach((cardId) => {
    const key = CARD_PART_KEYS[cardId];
    evidence[key] = { ...evidence[key], locked: true, missing: process.unlocks[cardId]?.missing || null };
  });
  const values = Object.values(parts);
  const correctCount = values.filter(Boolean).length;
  const isCorrect = values.length > 0 && values.every(Boolean);
  return {
    ...scored,
    isCorrect,
    score: values.length ? correctCount / values.length : 0,
    parts,
    evidence,
    board,
    process,
    locked,
  };
};

/**
 * The board a Process Mode response amounts to, before any scoring: fact
 * cards hold what the process established, written as a student writes it,
 * and every required representation card the student's facts have not opened
 * holds nothing. The board reads its "still empty" list from this on every
 * render without paying for a full score.
 */
export function materializeProcessBoard(question = {}, response = {}, process = resolveLmrProcess(question, response), required = new Set(resolveRequiredCards(question))) {
  const board = { ...(isObject(response) ? response : {}) };
  // Fact cards: only established facts, written as a student would.
  delete board.featureSlope;
  delete board.featureXIntercept;
  delete board.featureYIntercept;
  delete board.featurePoint1;
  delete board.featurePoint2;
  const slope = process.facts.slope || null;
  const yIntercept = process.facts.yIntercept || null;
  const xIntercept = process.facts.xIntercept || null;
  if (slope) board.featureSlope = fractionText(slope.value);
  if (yIntercept?.point) board.featureYIntercept = pointTextOf(yIntercept.point);
  if (xIntercept?.point) board.featureXIntercept = pointTextOf(xIntercept.point);
  const points = establishedPoints(process);
  const correctPoints = points.filter((record) => record.correct);
  const shownPoints = (correctPoints.length >= 2 ? correctPoints : points).slice(0, 2);
  if (shownPoints.length >= 2) {
    board.featurePoint1 = pointTextOf(shownPoints[0].point);
    board.featurePoint2 = pointTextOf(shownPoints[1].point);
  }
  // Representation cards the student's facts have not opened hold nothing.
  const locked = [];
  Object.entries(CARD_FIELDS).forEach(([cardId, fields]) => {
    if (!required.has(cardId) || process.unlocks[cardId]?.unlocked) return;
    locked.push(cardId);
    fields.forEach((field) => { board[field] = EMPTY_FIELD[field] ?? ''; });
  });
  return { board, locked, points, correctPoints, shownPoints };
}

/** The graded parts still empty on a Process Mode board (the board's "still empty" rule). */
export const unfinishedLinearMultipleRepresentationsProcessParts = (question = {}, response = {}, scored = scoreLinearMultipleRepresentationsProcess(question, response)) => (
  scored?.board ? unfinishedLinearMultipleRepresentationsParts(question, scored.board) : []
);

/** What a teacher reads for one graded part of a Process Mode board. */
export const processPartResponse = (scored, partId) => {
  // The fact cards, and the student's own y = mx + b (teacher evidence only).
  const factCard = { slope: 'slope', yIntercept: 'yIntercept', xIntercept: 'xIntercept', siEquation: 'siEquation' }[partId];
  if (factCard) {
    const record = scored?.process?.facts?.[factCard];
    return record ? `${factText(record)} — ${methodLabelFor(record)}` : '';
  }
  if (partId === 'twoPoints') {
    return establishedPoints(scored?.process).slice(0, 2).map((record) => `${factText(record)} (${methodLabelFor(record)})`).join('; ');
  }
  return null;
};

/* ---------------------------------------------------------------------------
 * The board's view: What I Know, methods, feedback.
 * ------------------------------------------------------------------------- */

const FEEDBACK = Object.freeze({
  'unreadable-number': 'Enter just a number: a whole number, a fraction or a decimal.',
  'unreadable-point': 'Enter an ordered pair: (x, y).',
  'number-has-variable': 'Enter just the number.',
  'point-missing': 'Choose a point first.',
  'pick-missing': 'Pick a point on the graph first.',
  'pick-outside': 'Pick a point inside the graph.',
  'row-missing': 'Choose a row of the table first.',
  'facts-missing': 'This method needs facts you have not established yet.',
  'zero-choice-missing': 'First decide which variable is 0.',
  'same-point': 'Choose two different points.',
  'same-x': 'These two points have the same x-value. Choose two points with different x-values.',
  'run-zero': 'Choose two points with different x-values.',
  'slope-has-x': 'The slope is the coefficient of x — the number multiplying x — not the x-term itself.',
  'slope-is-intercept': 'That number is the constant term. The slope is the number multiplying x.',
  'slope-sign': 'Check the sign. Is the x-term added or subtracted?',
  'slope-inexact': 'Use the exact value — a fraction, not a rounded decimal.',
  'slope-horizontal': 'There is no x-term in this equation. What does that tell you about the slope?',
  'slope-unit': 'When no number is written in front of x, x still has a coefficient. What number is x multiplied by here?',
  'slope-point-slope-sign': 'Check the sign of the number multiplying the parentheses.',
  'slope-point-slope': 'In y − y₁ = m(x − x₁), the slope is the number multiplying the parentheses.',
  'slope-wrong': 'That is not the number multiplying x in this equation. Look again.',
  'slope-own-wrong': 'Read the slope from your own equation: the number multiplying x.',
  'slope-run-over-rise': 'Slope is rise over run — the vertical change goes on top.',
  'slope-not-quotient': 'Divide the vertical change by the horizontal change, and keep the answer exact.',
  'slope-arithmetic': 'Check your arithmetic: subtract on top, subtract on the bottom, then divide. Keep it exact.',
  'slope-points-wrong': 'Your arithmetic is right, but these points do not give this line\'s slope. Check the points you are using.',
  'intercept-none': 'Nothing is added to mx in this equation. What value of b does that mean?',
  'intercept-is-slope': 'That number multiplies x — it is the slope. b is the constant term.',
  'intercept-sign': 'Keep the sign: b is the constant term, including its sign.',
  'intercept-inexact': 'Use the exact value — a fraction, not a rounded decimal.',
  'intercept-not-on-y-axis': 'A y-intercept is on the y-axis, so its x-coordinate is 0.',
  'intercept-wrong': 'That is not this line\'s y-intercept. Check your work.',
  'point-signs': 'In y − y₁ = m(x − x₁) each coordinate appears with the opposite sign: y − k means y₁ = k, and y + k means y₁ = −k.',
  'point-sign-one': 'One coordinate has the wrong sign. In y − y₁ = m(x − x₁), read each coordinate with the opposite sign of what is written.',
  'point-swapped': 'Write the point as (x₁, y₁): x₁ comes from the x-part, y₁ from the y-part.',
  'point-not-written': 'That point is on the line, but read the point written in the equation.',
  'point-wrong': 'Read the point from the equation: y − y₁ = m(x − x₁).',
  'rate-sign': 'Check the direction: does the amount go up or down as x increases?',
  'rate-is-start': 'That is an amount, not a change. The rate of change is how much it changes for each step of x.',
  'rate-wrong': 'Reread the situation: how much does the amount change for each step of x?',
  'start-is-rate': 'That is how much it changes each step. The initial value is the amount at the very start, when x = 0.',
  'start-wrong': 'Reread the situation: what is the amount at the very start, when x = 0?',
  'rewrite-unfinished': 'Keep going until your equation reads y = mx + b.',
  'rewrite-no-steps': 'Solve for y in the algebra workspace, one step at a time.',
  'rewrite-not-same-line': 'This equation is no longer the GIVEN line. Undo back to your last correct step.',
  'sub-unsolved': 'Finish solving: get the variable alone on one side.',
  'sub-no-steps': 'Solve the equation in the algebra workspace, one step at a time.',
  'sub-not-same': 'This is not the solution of your substituted equation. Undo and recheck your steps.',
  'zero-wrong-x': 'Check your target. Every point on the x-axis has the same y-coordinate. What is it?',
  'zero-wrong-y': 'Check your target. Every point on the y-axis has the same x-coordinate. What is it?',
  'point-not-on-x-axis': 'An x-intercept is on the x-axis, so its y-coordinate is 0.',
  'point-not-on-y-axis': 'A y-intercept is on the y-axis, so its x-coordinate is 0.',
  'intercept-value-wrong': 'That point does not match the value you solved for. Recheck it.',
  'pick-on-axis-off-line': 'That point is on the axis, but the line does not pass through it. Find where the line itself crosses.',
  'pick-on-line-off-x-axis': 'That point is on the line, but not on the x-axis. Follow the line to where it crosses the x-axis.',
  'pick-on-line-off-y-axis': 'That point is on the line, but not on the y-axis. Follow the line to where it crosses the y-axis.',
  'pick-off-both': 'Find the point where the line crosses the axis.',
  'pick-off-line': 'That point is not on the line. Choose a point the line passes through exactly — where it crosses grid lines.',
  'typed-not-pick': 'Those coordinates are not the point you picked. Count the grid lines from the origin.',
  'p1-off-line': 'Point A is not on the line. Choose points the line passes through exactly — where it crosses grid lines.',
  'p2-off-line': 'Point B is not on the line. Choose points the line passes through exactly — where it crosses grid lines.',
  'pt-off-line': 'One of your points is not on the line. Choose points the line passes through exactly.',
  'run-sign': 'Check the direction of the run: moving right is positive, moving left is negative.',
  'run-wrong': 'Count the horizontal change from A to B again.',
  'rise-sign': 'Check the direction of the rise: moving up is positive, moving down is negative.',
  'rise-wrong': 'Count the vertical change from A to B again.',
  'sub-mixed': 'Keep the order: y₂ and x₂ come from the same point, and y₁ and x₁ from the other.',
  'sub-value-wrong': 'Check the coordinates you substituted.',
  'dy-sign': 'Δy is the second row\'s y minus the first row\'s y. Check the sign.',
  'dy-wrong': 'Find the change in y again: the second row\'s y minus the first row\'s y.',
  'dx-sign': 'Δx is the second row\'s x minus the first row\'s x. Check the sign.',
  'dx-wrong': 'Find the change in x again: the second row\'s x minus the first row\'s x.',
  'row-not-zero-x': 'In that row x is not 0. The y-intercept is where x = 0.',
  'row-not-zero-y': 'In that row y is not 0. The x-intercept is where y = 0.',
  'extend-off-pattern': 'A row breaks the table\'s pattern. Keep the change in y the same for each equal change in x.',
  'extend-not-there-yet-y': 'Keep extending the table until x = 0.',
  'extend-not-there-yet-x': 'Keep extending the table until y = 0.',
  'sub-point-mismatch': 'Use the coordinates of the point you chose for x₁ and y₁.',
  'sub-slope-mismatch': 'Use your slope for m.',
  'b-arithmetic': 'Check your arithmetic: solve y₁ = m·x₁ + b for b.',
  'point-off-line': 'That point is not on the line. Substitute your x-value again.',
  'unknown-strategy': 'Choose a method.',
});

/**
 * What the board says about a piece of work. `reveal` is the activity's
 * permission to say whether work is right (guided feedback with immediate
 * outcomes); without it only the form of the work is ever commented on.
 */
export const processFeedback = (code, { reveal = true } = {}) => {
  if (!code) return '';
  if (!reveal && !FORMAT_CODES.has(code)) return '';
  return FEEDBACK[code] || (reveal ? 'Not yet. Check your work.' : '');
};

/** The first problem worth saying for an evaluated entry, or ''. */
export const firstProcessFeedback = (evaluated, { reveal = true } = {}) => {
  const codes = [
    ...Object.values(evaluated?.fields || {}).map((field) => field?.code).filter(Boolean),
    ...list(evaluated?.problems),
  ];
  for (const code of codes) {
    const message = processFeedback(code, { reveal });
    if (message) return message;
  }
  return '';
};

/** A fact's display, for the strip: LaTeX of the value, never an answer the student did not give. */
export const factDisplay = (record) => {
  if (!record) return '';
  if (record.fact === 'slope') return `m = ${record.display || latexOf(record.value)}`;
  if (record.fact === 'siEquation') return record.display || equationLatex(record.value);
  return record.display || (Array.isArray(record.point) ? pointLatexOf(record.point) : latexOf(record.value));
};

/** Classroom phrase for a missing requirement token. */
export const tokenPhrase = (question, token) => (question?.source?.kind === 'scenario' ? SCENARIO_TOKEN_PHRASES : TOKEN_PHRASES)[token] || token;

/**
 * Every way a locked card could still be opened on this board, as the facts
 * each way is missing — fewest first, only ways this GIVEN can reach, at most
 * three. The board names them all, so no pathway is presented as the one to
 * take. [] when the card is open.
 */
export const lmrCardAlternatives = (question, process, cardId) => {
  const representation = LMR_PROCESS_MODEL.representations[cardId];
  if (!representation || process?.unlocks?.[cardId]?.unlocked) return [];
  const held = process?.tokens || new Set();
  const achievable = process?.achievable || new Set();
  const seen = new Set();
  return requirementAlternatives(representation.unlock)
    .filter((alternative) => alternative.every((token) => held.has(token) || achievable.has(token)))
    .map((alternative) => alternative.filter((token) => !held.has(token)))
    .filter((missing) => missing.length && !seen.has(missing.join('+')) && seen.add(missing.join('+')))
    .sort((left, right) => left.length - right.length)
    .slice(0, 3);
};

/**
 * Where a "Find …" for one missing requirement takes the student: the fact to
 * find, and — for y = mx + b from their own algebra — the method that makes it.
 */
export const lmrFindFor = (need) => {
  if (need === 'siEquation') return { target: 'slope', method: 'solveForY' };
  if (need === 'anyPoint' || need === 'twoPoints' || need === 'point') return { target: 'point', method: null };
  return { target: need, method: null };
};

/**
 * A locked card, as the student reads it: every way it could still open, each
 * as the facts still missing — a phrase and where "Find" goes for each.
 *   [[{ need, phrase, find: { target, method } }]]
 */
export const lmrLockedCardWays = (question, process, cardId) => lmrCardAlternatives(question, process, cardId)
  .map((missing) => missing.map((need) => ({ need, phrase: tokenPhrase(question, need), find: lmrFindFor(need) })));

const FIND_LABELS = Object.freeze({
  slope: 'Find the slope',
  yIntercept: 'Find the y-intercept',
  xIntercept: 'Find the x-intercept',
  point: 'Find a point',
});
const SCENARIO_FIND_LABELS = Object.freeze({ ...FIND_LABELS, slope: 'Find the rate of change', yIntercept: 'Find the initial value' });

/** "Find the slope", or the situation's own words for it. */
export const lmrFindLabel = (question, target) => (question?.source?.kind === 'scenario' ? SCENARIO_FIND_LABELS : FIND_LABELS)[target] || 'Find it';

/** A fact's name on the board: "Slope", or "Rate of change" for a situation. */
export const lmrFactLabel = (question, fact) => {
  const entry = LMR_PROCESS_MODEL.facts[fact];
  if (!entry) return fact;
  return question?.source?.kind === 'scenario' && entry.contextLabel ? entry.contextLabel : entry.label;
};

/** How the student established a fact, in a few words for the facts strip. */
export const studentMethodLabel = (record) => {
  if (!record) return '';
  if (record.base) return 'Given';
  const strategy = LMR_PROCESS_MODEL.strategies[record.strategy];
  return text(strategy?.label);
};

/** y = mx + b, as LaTeX, from the student's own slope and y-intercept. */
export const slopeInterceptLatexOf = (m, b) => {
  const ascii = slopeInterceptAscii(m, b);
  if (!ascii) return '';
  return equationLatex({ left: 'y', right: ascii.replace(/^y = /, '') });
};

/** The cards a change of facts opened: in `after`, not in `before`. */
export const lmrNewlyOpened = (before, after, cardIds = []) => cardIds
  .filter((cardId) => after?.unlocks?.[cardId]?.unlocked && !before?.unlocks?.[cardId]?.unlocked);

/** The card's name, as the board shows it. */
export const lmrCardLabel = (cardId) => LMR_PROCESS_MODEL.representations[cardId]?.label || cardId;

/** The methods offered for a target now, grouped by strategy (one choice each). */
export const lmrMethodsFor = (question, process, target) => {
  const options = lmrProcessOptions(question, { target, tokens: process?.tokens || new Set(lmrBaseTokens(question)) });
  const byStrategy = new Map();
  options.forEach((option) => {
    const current = byStrategy.get(option.strategy);
    if (current) current.sources.push(option);
    else byStrategy.set(option.strategy, { strategy: option.strategy, label: LMR_PROCESS_MODEL.strategies[option.strategy].label, kind: option.kind, sources: [option] });
  });
  return [...byStrategy.values()];
};

/**
 * The methods for a target that this board offers but that need a fact the
 * student has not established yet — "Use the slope and a point: needs a point
 * on the line". Shown beside the methods available now, so a pathway that
 * starts somewhere else is visible without being a menu. Only ways this GIVEN
 * can actually reach; each method once, with the fewest facts still missing.
 *   [{ strategy, label, needs: [phrase] }]
 */
export const lmrLaterMethods = (question, process, target) => {
  const held = process?.tokens || new Set(lmrBaseTokens(question));
  const achievable = process?.achievable || lmrAchievableTokens(question, [...held]);
  const now = new Set(lmrMethodsFor(question, process, target).map((group) => group.strategy));
  const best = new Map();
  lmrProcessOptions(question, { target }).forEach((option) => {
    if (now.has(option.strategy) || option.bridgeTo) return;
    // The last step of a pathway already on offer (reading m and b from the
    // equation "Solve for y" makes) is that pathway, not another way.
    const source = LMR_PROCESS_MODEL.strategies[option.strategy]?.sources.find((entry) => entry.id === option.source);
    if (list(source?.partOf).some((strategy) => now.has(strategy))) return;
    const alternatives = requirementAlternatives(option.needs)
      .filter((alternative) => alternative.every((need) => held.has(need) || achievable.has(need)))
      .map((alternative) => alternative.filter((need) => !held.has(need)))
      .filter((missing) => missing.length);
    if (!alternatives.length) return;
    const fewest = alternatives.sort((left, right) => left.length - right.length)[0];
    const current = best.get(option.strategy);
    if (!current || fewest.length < current.missing.length) best.set(option.strategy, { option, missing: fewest });
  });
  return [...best.values()].map(({ option, missing }) => ({
    strategy: option.strategy,
    label: LMR_PROCESS_MODEL.strategies[option.strategy].label,
    needs: missing.map((need) => tokenPhrase(question, need)),
  }));
};

/* ---------------------------------------------------------------------------
 * Correct evidence, built from the question's own line: what Pre-Flight
 * marks to prove the server can verify every method a version offers, and
 * what tests submit as a student who did everything right.
 * ------------------------------------------------------------------------- */

const twoLatticePoints = (env) => {
  if (Array.isArray(env.givenPoints) && env.givenPoints.length >= 2) return env.givenPoints.slice(0, 2);
  const run = F(env.m.d);
  const first = [ZERO, env.b];
  const second = [run, addFractions(env.b, F(env.m.n))];
  return [first, second];
};

const stepsForRewrite = (env) => {
  const m = env.m;
  const b = env.b;
  const final = { left: 'y', right: slopeInterceptAscii(m, b).replace(/^y = /, '') };
  if (env.kind === 'standardForm' && env.standard) {
    const { A, B, C } = env.standard;
    const Af = toFraction(A);
    const Cf = toFraction(C);
    const isolated = { left: `${term(toFraction(B), 'y', true)}`, right: `${term(negFraction(Af), 'x', true) || '0'}${term(Cf, '', false)}` };
    return { final, steps: [isolated, final] };
  }
  if (env.kind === 'pointSlope' && env.anchor) {
    const [, y1] = env.anchor;
    const distributed = { left: `y${term(negFraction(y1), '', false)}`, right: slopeInterceptAscii(m, negFraction(mulFractions(m, env.anchor[0]))).replace(/^y = /, '') };
    return { final, steps: [distributed, final] };
  }
  return { final, steps: [final] };
};

const keyEvidence = (option, target, state, env) => {
  const m = env.m;
  const b = env.b;
  const facts = state.facts || {};
  switch (option.strategy) {
    case 'readSlopeIntercept': return { ev: { m: fractionText(m), b: fractionText(b) } };
    case 'readPointSlope': return { ev: { m: fractionText(m), point: pointTextOf(env.anchor) } };
    case 'readScenario': return { ev: { rate: fractionText(m), start: fractionText(b) } };
    case 'solveForY': {
      const { final, steps } = stepsForRewrite(env);
      return { ev: { eq: final, steps } };
    }
    case 'substituteZero': {
      const zero = target === 'xIntercept' ? 'y' : 'x';
      const point = interceptPointOf(env, target);
      if (!point) return null;
      const other = zero === 'x' ? 'y' : 'x';
      const value = other === 'x' ? point[0] : point[1];
      const solved = { left: other, right: fractionText(value) };
      return { target, ev: { zero, eq: solved, steps: [solved], point: pointTextOf(point) } };
    }
    case 'graphCrossing': {
      const point = interceptPointOf(env, target);
      return point ? { target, ev: { pick: point.map((value) => value.n / value.d) } } : null;
    }
    case 'graphPoint': {
      const [point] = twoLatticePoints(env);
      return { ev: { pick: point.map((value) => value.n / value.d), point: pointTextOf(point) } };
    }
    case 'riseRun': {
      const [p1, p2] = twoLatticePoints(env);
      const run = subFractions(p2[0], p1[0]);
      const rise = subFractions(p2[1], p1[1]);
      return { ev: { p1: p1.map((value) => value.n / value.d), p2: p2.map((value) => value.n / value.d), run: fractionText(run), rise: fractionText(rise), m: fractionText(divFractions(rise, run)) } };
    }
    case 'twoPointFormula': {
      let p1;
      let p2;
      let refs;
      if (option.source === 'points') {
        const held = establishedPoints({ facts });
        if (held.length < 2) return null;
        const ref = (record) => (record.fact === 'point' ? `point:${record.key}` : record.fact);
        [p1, p2] = [held[0].point, held[1].point];
        refs = [ref(held[0]), ref(held[1])];
      } else if (env.kind === 'twoPoints') {
        [p1, p2] = env.givenPoints;
        refs = ['g0', 'g1'];
      } else {
        [p1, p2] = twoLatticePoints(env);
        refs = [p1.map((value) => value.n / value.d), p2.map((value) => value.n / value.d)];
      }
      return {
        ev: {
          p1: refs[0],
          p2: refs[1],
          y2: fractionText(p2[1]),
          y1: fractionText(p1[1]),
          x2: fractionText(p2[0]),
          x1: fractionText(p1[0]),
          m: fractionText(divFractions(subFractions(p2[1], p1[1]), subFractions(p2[0], p1[0]))),
        },
      };
    }
    case 'tableDelta': {
      const [first, second] = env.rows;
      const dy = subFractions(second.y, first.y);
      const dx = subFractions(second.x, first.x);
      return { ev: { r1: 0, r2: 1, dy: fractionText(dy), dx: fractionText(dx), m: fractionText(divFractions(dy, dx)) } };
    }
    case 'tableRead': {
      const row = env.rows.findIndex((entry) => (target === 'yIntercept' ? entry.x.n === 0 : entry.y.n === 0));
      return row >= 0 ? { target, ev: { row } } : null;
    }
    case 'tableRow': {
      const used = new Set(establishedPoints({ facts }).map((record) => record.pointKey));
      const row = env.rows.findIndex((entry) => !used.has(pointKeyOf([entry.x, entry.y])));
      return row >= 0 ? { ev: { row } } : null;
    }
    case 'extendTable': {
      const point = interceptPointOf(env, target);
      return point ? { target, ev: { rows: [{ x: fractionText(point[0]), y: fractionText(point[1]) }] } } : null;
    }
    case 'solveForB': {
      const record = establishedPoints({ facts }).find((held) => held.fact !== 'yIntercept');
      if (!record || !facts.slope?.value) return null;
      const [x1, y1] = record.point;
      return {
        ev: {
          pt: record.fact === 'point' ? `point:${record.key}` : record.fact,
          y1: fractionText(y1),
          m: fractionText(facts.slope.value),
          x1: fractionText(x1),
          b: fractionText(subFractions(y1, mulFractions(facts.slope.value, x1))),
        },
      };
    }
    case 'evaluateAtX': {
      const used = new Set(establishedPoints({ facts }).map((record) => record.pointKey));
      for (const step of [1, 2, 3, -1, 4, -2]) {
        const x = F(step * m.d);
        const point = [x, addFractions(mulFractions(m, x), b)];
        if (!used.has(pointKeyOf(point))) return { ev: { x: fractionText(point[0]), y: fractionText(point[1]) } };
      }
      return null;
    }
    default: return null;
  }
};

/**
 * A correct process entry for one option, given what is established so far,
 * or null when the option cannot be worked on this version (no row on an
 * axis to read, too few points yet).
 */
export const keyProcessEntry = (question, option, target, state = {}, env = lmrProcessEnvironment(question)) => {
  if (!env.valid) return null;
  const built = keyEvidence(option, target, state, env);
  if (!built) return null;
  return {
    id: `k-${option.strategy}-${option.source}-${target}`.slice(0, PROCESS_LOG_LIMITS.maxIdLength),
    strategy: option.strategy,
    from: option.source,
    ...(built.target ? { target: built.target } : (target ? { target } : {})),
    at: 0,
    tries: 1,
    ev: built.ev,
  };
};

/** The facts an entry claims, for superseding older entries on the board. */
export const lmrEntryClaims = (question, entry, process = null) => {
  const env = process?.env || lmrProcessEnvironment(question);
  const evaluated = evaluateLmrEntry(entry, { facts: process?.facts || {} }, env);
  return list(evaluated.claims).map((claim) => (claim.fact === 'point' ? `point:${claim.key}` : claim.fact));
};

// Points are the one fact a student can keep adding. Two make a line and a
// few more help a table, so the log keeps the newest few: a student plotting
// point after point can never push the slope's evidence out of the log's
// budget.
const MAX_POINT_ENTRIES = 4;

/** Append an entry to a log the way the board does. */
export const appendLmrProcessEntry = (question, log, entry, process = null) => {
  const env = process?.env || lmrProcessEnvironment(question);
  const claimsOf = (candidate) => lmrEntryClaims(question, candidate, process);
  const next = appendProcessEntry(log, entry, { binding: env.binding, claimsOf });
  const pointOnly = next.entries.filter((candidate) => {
    const claims = claimsOf(candidate);
    return claims.length > 0 && claims.every((key) => key.startsWith('point:'));
  });
  if (pointOnly.length <= MAX_POINT_ENTRIES) return next;
  const dropped = new Set(pointOnly.slice(0, pointOnly.length - MAX_POINT_ENTRIES).map((candidate) => candidate.id));
  return normalizeProcessLog({ ...next, entries: next.entries.filter((candidate) => !dropped.has(candidate.id)) });
};

/**
 * A complete, correct log for a question: every relevant fact established,
 * each by the first method available for it (or the one `prefer` names for
 * that fact). Used by Pre-Flight and tests; a student's own log is theirs.
 */
export const keyProcessLog = (question = {}, { prefer = {}, complete = false, env: providedEnv = null } = {}) => {
  const canonical = providedEnv?.canonical || deriveLinearMultipleRepresentations(question);
  const env = providedEnv || lmrProcessEnvironment(question, canonical);
  let log = emptyProcessLog(env.binding);
  if (!env.valid) return log;
  // `complete`: everything this version can reach — y = mx + b from the
  // student's own algebra included — so every method can be tried from it.
  const reachable = complete ? ['slope', 'yIntercept', 'xIntercept', 'point', ...(env.offered.some((option) => option.strategy === 'solveForY') ? ['siEquation'] : [])] : [];
  const wanted = [...new Set([...lmrRelevantFacts(question), 'slope', 'yIntercept', ...reachable])].filter((fact) => fact !== 'xIntercept' || env.x0);
  const pointGoal = 2;
  for (let round = 0; round < 12; round += 1) {
    const process = resolveLmrProcess(question, { processLog: log }, canonical, env);
    const missing = wanted.filter((fact) => (fact === 'point' ? establishedPoints(process).length < pointGoal : !process.facts[fact]));
    if (!missing.length) break;
    let progressed = false;
    for (const fact of missing) {
      const methods = lmrMethodsFor(question, process, fact).flatMap((method) => method.sources);
      const preferred = prefer[fact] ? methods.filter((option) => option.strategy === prefer[fact] || option.key === prefer[fact]) : [];
      for (const option of [...preferred, ...methods]) {
        const target = option.bridgeTo ? null : fact;
        const entry = keyProcessEntry(question, option, target, process, env);
        if (!entry) continue;
        const next = appendLmrProcessEntry(question, log, entry, process);
        const after = resolveLmrProcess(question, { processLog: next }, canonical, env);
        if (after.tokens.size > process.tokens.size || establishedPoints(after).length > establishedPoints(process).length) {
          log = next;
          progressed = true;
          break;
        }
      }
      if (progressed) break;
    }
    if (!progressed) break;
  }
  return log;
};

/** Normalize a log for storage (re-exported so the board imports one module). */
export { normalizeProcessLog, emptyProcessLog };
