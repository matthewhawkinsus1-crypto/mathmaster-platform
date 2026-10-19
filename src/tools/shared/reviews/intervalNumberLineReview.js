// Worked solution review for intervalNumberLine (contract: ../toolSolutionReview.js, textOnlyReview).
/*
 * THE NUMBER LINE'S WORKED SOLUTION — THE SET THE SHARED GRADER MARKS AGAINST.
 *
 * The tool has one view; what varies is which stages a question asks for
 * (`ask`, read with the grader's own resolveIntervalAsk: graph, interval
 * notation, inequality — graph + interval when nothing usable is asked). The
 * shared grader (functions/shared/serverGrading/tools/intervalNumberLine.mjs)
 * marks every asked stage against ONE key, `normalizeIntervals(question.intervals)`:
 *
 *   graph       the same pieces, endpoints to 1e-9, open/closed flags exact;
 *   interval    the tool's notation reader (exact fractions, sqrt, ∪, ∞);
 *   inequality  LITERALLY the sentence intervalsToInequality writes for the
 *               key (pieces left to right, variable first on a ray, endpoints
 *               as 4-place decimals), whitespace / dashes / case ignored.
 *
 * Every stage has a single correct answer, so every question with a key gets
 * a review. It is built from that key with the grader's helpers, then turned
 * back into the work a student following it would submit — the pieces it
 * tells them to graph, the notation and inequality it states — and graded by
 * the shared grader through the bytes the server reads (gradeWorkWithGrader).
 * Unless the grader calls that work correct and complete, the review is null.
 *
 * Null — never a guess — when:
 *   - there is no key the grader would mark against (no `intervals`, a piece
 *     that is not an object, or a key that normalizes to nothing);
 *   - an authored piece is not what it says: an endpoint that is neither a
 *     number nor an unbounded marker on its own side (Number('abc') would
 *     quietly become ±∞), a reversed piece the grader drops, a single point,
 *     a piece unbounded at both ends (the tool cannot build it), or a closed
 *     flag that is not a boolean;
 *   - pieces overlap or touch at an included endpoint (the key is then not
 *     the set written in simplest form), or there are more than 4 of them;
 *   - an endpoint has no exact short form (integer, decimal of ≤ 6 places,
 *     fraction with denominator ≤ 16, or ±√n), or — when the inequality stage
 *     is asked — is not exact at the 4 decimal places that stage requires: a
 *     rounding is never presented as the answer;
 *   - the variable is not a plain name, or the authored `inequalityText`
 *     reads as a different set than the key (the prompt and the key disagree);
 *   - the grader does not accept the stated work.
 *
 * Shown only once the question is closed (QuestionEngine); pure, no React.
 */
import intervalNumberLineGrader from '../../../../functions/shared/serverGrading/tools/intervalNumberLine.mjs';
import { gradeWorkWithGrader } from '../../../../functions/shared/serverGrading/toolWorkGrading.mjs';
import {
  inequalityMatchesIntervals,
  intervalsToInequality,
  normalizeIntervals,
  resolveIntervalAsk,
} from '../../../../functions/shared/toolMath/intervalNumberLine/intervalMath.mjs';

export const implemented = true;

const INF = Number.POSITIVE_INFINITY;
const MINUS = '−';
// The grader's endpoint tolerance (sameEndpoint) — floating-point noise only.
const EXACT = 1e-9;
const MAX_PIECES = 4;
const MAX_MAGNITUDE = 1e6;
const MIN_GAP = 1e-3;
const MAX_FRACTION_DENOMINATOR = 16; // the tool's own rationalLabel
const MAX_RADICAND = 1000;
const VARIABLE = /^[A-Za-z]\w{0,5}$/;

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const tidy = (value) => {
  const rounded = Number(Number(value).toFixed(10));
  return Object.is(rounded, -0) ? 0 : rounded;
};
const signed = (text) => text.replace(/^-/, MINUS);
const listOf = (texts, joiner = 'and') => (texts.length <= 1 ? texts.join('')
  : texts.length === 2 ? `${texts[0]} ${joiner} ${texts[1]}`
    : `${texts.slice(0, -1).join(', ')}, ${joiner} ${texts[texts.length - 1]}`);

/* ------------------------------------------------------------------ */
/* reading the key exactly as the grader does                           */
/* ------------------------------------------------------------------ */

const LOWER_UNBOUNDED = new Set([null, undefined, '-inf', '-Infinity', -INF]);
const UPPER_UNBOUNDED = new Set([null, undefined, 'inf', 'Infinity', INF]);

// One raw endpoint, read with normalizeInterval's own precedence
// (min ?? from ?? lower). 'unbounded', a finite number, or null for anything
// normalizeInterval would only turn into ±∞ by accident (NaN, the other
// side's marker, text that is not a number).
const readEnd = (raw, unboundedMarkers) => {
  if (unboundedMarkers.has(raw)) return 'unbounded';
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const number = Number(raw);
    return Number.isFinite(number) ? number : null;
  }
  return null;
};

const closedFlagOk = (value) => value === undefined || typeof value === 'boolean';

// The authored pieces are exactly the key the grader marks against, and that
// key is a set written in simplest form; otherwise null.
const readKey = (question) => {
  const raw = question.intervals;
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_PIECES || !raw.every(isPlainObject)) return null;
  for (const piece of raw) {
    const lower = readEnd(piece.min ?? piece.from ?? piece.lower, LOWER_UNBOUNDED);
    const upper = readEnd(piece.max ?? piece.to ?? piece.upper, UPPER_UNBOUNDED);
    if (lower === null || upper === null) return null;
    if (lower === 'unbounded' && upper === 'unbounded') return null;
    if (lower !== 'unbounded' && upper !== 'unbounded' && !(upper - lower >= MIN_GAP)) return null;
    if (!closedFlagOk(piece.minClosed) || !closedFlagOk(piece.maxClosed)) return null;
    if ([lower, upper].some((end) => end !== 'unbounded' && Math.abs(end) > MAX_MAGNITUDE)) return null;
  }
  const key = normalizeIntervals(raw);
  if (key.length !== raw.length) return null;
  for (let index = 1; index < key.length; index += 1) {
    const left = key[index - 1];
    const right = key[index];
    if (left.max > right.min) return null; // overlap
    if (left.max === right.min && (left.maxClosed || right.minClosed)) return null; // one piece really
  }
  const finite = key.flatMap((piece) => [piece.min, piece.max]).filter(Number.isFinite);
  const distinct = [...new Set(finite)].sort((a, b) => a - b);
  if (distinct.some((value, index) => index > 0 && value - distinct[index - 1] < MIN_GAP)) return null;
  return key;
};

/* ------------------------------------------------------------------ */
/* numbers                                                             */
/* ------------------------------------------------------------------ */

const gcd = (a, b) => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x || 1;
};

// An endpoint's exact short form: { label (shown), typed (what the tool's
// notation reader is handed), decimal (the inequality stage's form, or null
// when that 4-place form would be a rounding) } — or null.
const exactForm = (value) => {
  if (!Number.isFinite(value)) return null;
  const t = tidy(value);
  // The inequality stage writes endpoints as String(Number(v.toFixed(4))).
  const fourPlaces = Number(Number(value).toFixed(4));
  const decimal = Math.abs(fourPlaces - value) <= EXACT ? signed(String(Object.is(fourPlaces, -0) ? 0 : fourPlaces)) : null;
  const plain = (text) => ({ label: signed(text), typed: text, decimal });
  if (Number.isInteger(t)) return plain(String(t));
  if (decimal !== null) return plain(String(Number(t.toFixed(4))));
  for (let denominator = 2; denominator <= MAX_FRACTION_DENOMINATOR; denominator += 1) {
    const numerator = Math.round(t * denominator);
    if (Math.abs(numerator / denominator - t) < EXACT) {
      const common = gcd(numerator, denominator);
      return plain(`${numerator / common}/${denominator / common}`);
    }
  }
  if (Math.abs(Number(t.toFixed(6)) - t) < EXACT) return plain(String(Number(t.toFixed(6))));
  const square = t * t;
  const radicand = Math.round(square);
  if (radicand >= 2 && radicand <= MAX_RADICAND && !Number.isInteger(Math.sqrt(radicand))
    && Math.abs(Math.sqrt(radicand) - Math.abs(t)) < EXACT) {
    const sign = t < 0 ? '-' : '';
    return { label: signed(`${sign}√${radicand}`), typed: `${sign}sqrt(${radicand})`, decimal };
  }
  return null;
};

// A test value the review picks itself: an integer, or a decimal of at most
// three places, strictly between `left` and `right` (either may be infinite).
const testValueBetween = (left, right) => {
  if (!Number.isFinite(left) && !Number.isFinite(right)) return 0;
  if (!Number.isFinite(left)) return tidy(Math.ceil(right) - 1);
  if (!Number.isFinite(right)) return tidy(Math.floor(left) + 1);
  for (const scale of [1, 10, 100, 1000]) {
    const low = Math.floor(left * scale) + 1;
    const high = Math.ceil(right * scale) - 1;
    if (low <= high) {
      const pick = low <= 0 && high >= 0 ? 0 : Math.min(high, Math.max(low, Math.round(((left + right) / 2) * scale)));
      const value = tidy(pick / scale);
      if (value > left && value < right) return value;
    }
  }
  return null;
};

/* ------------------------------------------------------------------ */
/* the pieces in words                                                 */
/* ------------------------------------------------------------------ */

// Each piece with its endpoints' forms, its inequality clause (shown and as
// the inequality stage writes it) and its interval notation.
const describePiece = (piece, variable) => {
  const low = Number.isFinite(piece.min) ? exactForm(piece.min) : null;
  const high = Number.isFinite(piece.max) ? exactForm(piece.max) : null;
  if ((Number.isFinite(piece.min) && !low) || (Number.isFinite(piece.max) && !high)) return null;
  const lowOp = piece.minClosed ? '≤' : '<';
  const highOp = piece.maxClosed ? '≤' : '<';
  const kind = !low ? 'left' : !high ? 'right' : 'segment';
  const clause = kind === 'left' ? `${variable} ${highOp} ${high.label}`
    : kind === 'right' ? `${variable} ${piece.minClosed ? '≥' : '>'} ${low.label}`
      : `${low.label} ${lowOp} ${variable} ${highOp} ${high.label}`;
  const openText = low ? (piece.minClosed ? '[' : '(') : '(';
  const closeText = high ? (piece.maxClosed ? ']' : ')') : ')';
  const notation = (form) => `${openText}${low ? form(low) : `${MINUS}∞`}, ${high ? form(high) : '∞'}${closeText}`;
  // The clause with a number in place of the variable.
  const substituted = (valueText) => (kind === 'left' ? `${valueText} ${highOp} ${high.label}`
    : kind === 'right' ? `${valueText} ${piece.minClosed ? '≥' : '>'} ${low.label}`
      : `${low.label} ${lowOp} ${valueText} ${highOp} ${high.label}`);
  return {
    piece, low, high, kind, clause, substituted,
    notationShown: notation((form) => form.label),
    notationTyped: notation((form) => form.typed),
  };
};

const circleText = (closed) => (closed ? 'a closed circle (●)' : 'an open circle (○)');
const includeReason = (closed, symbol) => (closed ? `${symbol} includes it` : `${symbol} leaves it out`);

const wordsFor = (described) => {
  const { piece, low, high, kind } = described;
  if (kind === 'left') return `every number less than ${piece.maxClosed ? 'or equal to ' : ''}${high.label}`;
  if (kind === 'right') return `every number greater than ${piece.minClosed ? 'or equal to ' : ''}${low.label}`;
  // In brackets, so a list of pieces stays readable.
  const inclusion = piece.minClosed && piece.maxClosed ? 'both included'
    : !piece.minClosed && !piece.maxClosed ? 'neither included'
      : piece.minClosed ? `${low.label} included, ${high.label} not` : `${high.label} included, ${low.label} not`;
  return `every number between ${low.label} and ${high.label} (${inclusion})`;
};

const graphStep = (described) => {
  const { piece, low, high, kind, clause } = described;
  if (kind === 'left') {
    return `Graph ${clause}: put ${circleText(piece.maxClosed)} at ${high.label} because ${includeReason(piece.maxClosed, piece.maxClosed ? '≤' : '<')}, then choose ← Shade left — every number below ${high.label} works, so the shading runs on toward ${MINUS}∞.`;
  }
  if (kind === 'right') {
    const symbol = piece.minClosed ? '≥' : '>';
    return `Graph ${clause}: put ${circleText(piece.minClosed)} at ${low.label} because ${includeReason(piece.minClosed, symbol)}, then choose Shade right → — every number above ${low.label} works, so the shading runs on toward ∞.`;
  }
  return `Graph ${clause}: put ${circleText(piece.minClosed)} at ${low.label} because ${includeReason(piece.minClosed, piece.minClosed ? '≤' : '<')}, and ${circleText(piece.maxClosed)} at ${high.label} because ${includeReason(piece.maxClosed, piece.maxClosed ? '≤' : '<')}; the segment between them is shaded.`;
};

const graphItemText = (described) => {
  const { piece, low, high, kind } = described;
  const circle = (closed) => (closed ? 'closed circle' : 'open circle');
  if (kind === 'left') return `${circle(piece.maxClosed)} at ${high.label}, shaded left`;
  if (kind === 'right') return `${circle(piece.minClosed)} at ${low.label}, shaded right`;
  return `${circle(piece.minClosed)} at ${low.label}, ${circle(piece.maxClosed)} at ${high.label}, shaded between`;
};

/* ------------------------------------------------------------------ */
/* the check                                                           */
/* ------------------------------------------------------------------ */

const contains = (piece, value) => value > piece.min && value < piece.max;

// The endpoint substituted into the clause it bounds, written the way that
// clause is written: x > 2 at 2 is "2 > 2", the lower end of −3 ≤ x < 5 is
// "−3 ≤ −3".
const endpointHalf = ({ piece, kind }, value, label) => {
  if (piece.min === value) {
    const symbol = kind === 'right' ? (piece.minClosed ? '≥' : '>') : (piece.minClosed ? '≤' : '<');
    return { text: `${label} ${symbol} ${label}`, included: piece.minClosed };
  }
  if (piece.max === value) return { text: `${label} ${piece.maxClosed ? '≤' : '<'} ${label}`, included: piece.maxClosed };
  return null;
};

// One test number from each region the finite endpoints cut the line into,
// substituted into the inequality, then each endpoint against its circle.
const whyText = (pieces, variable) => {
  const endpoints = [...new Set(pieces.flatMap(({ piece }) => [piece.min, piece.max]).filter(Number.isFinite))]
    .sort((a, b) => a - b);
  const bounds = [-INF, ...endpoints, INF];
  const regionChecks = [];
  for (let index = 1; index < bounds.length; index += 1) {
    const value = testValueBetween(bounds[index - 1], bounds[index]);
    const form = value === null ? null : exactForm(value);
    if (!form) return null;
    const at = `at ${variable} = ${form.label}`;
    const home = pieces.find(({ piece }) => contains(piece, value));
    if (home) {
      regionChecks.push(`${at}, ${home.substituted(form.label)} is true, so ${form.label} is shaded`);
    } else {
      const clauses = pieces.map((entry) => entry.substituted(form.label));
      const verdict = clauses.length === 1 ? 'is false' : clauses.length === 2 ? 'are both false' : 'are all false';
      regionChecks.push(`${at}, ${listOf(clauses)} ${verdict}, so ${form.label} is not shaded`);
    }
  }
  const endpointChecks = endpoints.map((value) => {
    const { label } = exactForm(value);
    const halves = pieces.map((entry) => endpointHalf(entry, value, label)).filter(Boolean);
    const included = halves.some((half) => half.included);
    const verdict = included ? 'true' : halves.length > 1 ? 'both false' : 'false';
    return `${halves.map((half) => half.text).join(' and ')} ${halves.length > 1 ? 'are' : 'is'} ${verdict}, so ${label} gets ${circleText(included)}`;
  });
  return `Test one number from each region the endpoints cut the line into: ${regionChecks.join('; ')}. `
    + `Then check each endpoint: ${endpointChecks.join('; ')}. The shading and the circles match the inequality exactly.`;
};

/* ------------------------------------------------------------------ */
/* the review                                                          */
/* ------------------------------------------------------------------ */

const buildReview = (question) => {
  if (!isPlainObject(question)) return null;
  // The grader's own reading: `question.variable || 'x'`.
  const variable = question.variable || 'x';
  if (typeof variable !== 'string' || !VARIABLE.test(variable)) return null;
  const key = readKey(question);
  if (!key) return null;
  // The prompt's inequality, when authored, must be the key's set.
  if (typeof question.inequalityText === 'string' && question.inequalityText.trim()) {
    const agreement = inequalityMatchesIntervals(question.inequalityText, question.intervals, variable);
    if (agreement.checked && !agreement.matches) return null;
  }
  const ask = resolveIntervalAsk(question.ask);
  const pieces = key.map((piece) => describePiece(piece, variable));
  if (pieces.some((entry) => entry === null)) return null;

  const asksGraph = ask.includes('graph');
  const asksInterval = ask.includes('interval');
  const asksInequality = ask.includes('inequality');
  const ends = pieces.flatMap(({ low, high }) => [low, high]).filter(Boolean);
  // The inequality stage reads 4-place decimals; a rounding is never the answer.
  if (asksInequality && ends.some((form) => form.decimal === null)) return null;

  const setSentence = pieces.map(({ clause }) => clause).join(' or ');
  const notationShown = pieces.map(({ notationShown: text }) => text).join(' ∪ ');
  // Graded exactly as shown, unless a √ has to be typed as sqrt( ) for the
  // tool's notation reader.
  const notationGraded = notationShown.includes('√')
    ? pieces.map(({ notationTyped: text }) => text).join(' ∪ ')
    : notationShown;
  // Exactly the sentence the grader compares with, with a typographic minus.
  const inequalityTyped = intervalsToInequality(key, variable);
  const inequalityShown = inequalityTyped.replace(/-(?=\d)/g, MINUS);

  const work = {
    intervals: key.map(({ min, max, minClosed, maxClosed }) => ({ min, max, minClosed, maxClosed })),
    notation: asksInterval ? notationGraded : '',
    inequality: asksInequality ? inequalityShown : '',
  };
  const verdict = gradeWorkWithGrader({ grader: intervalNumberLineGrader, question, work });
  if (verdict.graded !== true || verdict.isCorrect !== true || verdict.isComplete !== true) return null;

  const steps = [
    `The solution set is ${setSentence}: ${listOf(pieces.map(wordsFor), 'or')}.`,
  ];
  if (asksGraph) steps.push(...pieces.map(graphStep));
  if (asksInterval) {
    const each = pieces.map(({ clause, notationShown: text }) => `${clause} is ${text}`);
    const infinity = pieces.some(({ kind }) => kind !== 'segment')
      ? `, and ${pieces.some(({ kind }) => kind === 'left') ? `${MINUS}∞` : '∞'} always takes a round bracket because infinity is never reached` : '';
    steps.push(`Write each piece as (left end, right end): a square bracket [ or ] marks an endpoint that is included and a round bracket ( or ) one that is left out${infinity} — so ${listOf(each)}.`);
    if (pieces.length > 1) {
      steps.push(`Join the pieces with the union symbol ∪, from left to right: ${notationShown}.`);
    }
  }
  if (asksInequality) {
    steps.push(`Write the inequality the graph shows, reading left to right${pieces.length > 1 ? ' and joining the pieces with "or" (a number only has to be in one of them)' : ''}: ${inequalityShown}.`);
  }

  const items = [];
  if (!asksInequality) items.push({ label: 'Solution set', value: setSentence });
  if (asksGraph) items.push({ label: 'Number-line graph', value: pieces.map(graphItemText).join('; ') });
  if (asksInterval) items.push({ label: 'Interval notation', value: notationShown });
  if (asksInequality) items.push({ label: 'Inequality', value: inequalityShown });

  const why = whyText(pieces, variable);
  if (!why) return null;
  return {
    title: 'Number-line solution',
    items,
    steps,
    why,
    note: asksInequality
      ? `The inequality is written with ${variable} first on a ray and the smaller number first between two endpoints, pieces from left to right.`
      : null,
  };
};

export const buildIntervalNumberLineReview = (question) => {
  try {
    return buildReview(question);
  } catch {
    return null;
  }
};

export default buildIntervalNumberLineReview;
