// Worked solution review for inverseCompositionLab (contract: ../toolSolutionReview.js, textOnlyReview).
/*
 * THE INVERSE & COMPOSITION LAB'S WORKED SOLUTION — THE ANSWER ITS GRADER ACCEPTS.
 *
 * Every value here is recomputed from the question with the helpers the shared
 * grader (functions/shared/serverGrading/tools/inverseCompositionLab.mjs) uses:
 * the same f and g (inverseLabFunctions), the same input x (inverseLabInitialX,
 * inverseLabInputLocked), the same compositions (composeValue), the same
 * inverse (hasFunctionalInverse, inverseLabRoundTrip), the same expected restriction
 * (expectedInverseRestriction) and the same parts per view
 * (inverseLabRequiredParts). The derivation is driven through the lab's own
 * state machine (createLinearInverseDerivation, applyInverseDerivationOperation)
 * with operands a student can type into its number box.
 *
 * Before a review is returned, the work it states — the numbers as a student
 * would type them, the restriction it names, the derivation it walks — is
 * graded by that grader through the bytes the server reads
 * (gradeWorkWithGrader). If the grader does not call it correct, the review is
 * null: a review never states an answer the gradebook would reject.
 *
 * Null — never a guess — when:
 *   - the question authors no f (the lab's demonstration functions are not a
 *     question), or a view that asks for compositions authors no g;
 *   - a function carries a field the lab and grader ignore (a horizontal scale
 *     `b`, a slope `m`) — the prompt and the screen would disagree;
 *   - the view is not one the lab draws its inputs for (an unknown `mode`
 *     shows no composition boxes but the grader still asks for them);
 *   - no answer can be right: a composition or f(x) outside a domain, an f the
 *     lab gives no inverse (an unrestricted parabola, |x|, and — as the lab
 *     treats them, hasFunctionalInverse — a cubic or a rational f), or an
 *     input off the kept branch of a parabola, where f⁻¹(f(x)) is not x;
 *   - a derivation needs an operand that cannot be typed exactly.
 *
 * Shown only once the question is closed (QuestionEngine); pure, no React.
 */
import inverseCompositionGrader from '../../../../functions/shared/serverGrading/tools/inverseCompositionLab.mjs';
import { gradeWorkWithGrader } from '../../../../functions/shared/serverGrading/toolWorkGrading.mjs';
import { round } from '../../../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  composeValue,
  evaluateSpecWithDomain,
  expectedInverseRestriction,
  functionLabel,
  hasFunctionalInverse,
  inverseLabFunctions,
  inverseLabInitialX,
  inverseLabInputLocked,
  inverseLabRequiredParts,
  inverseLabRoundTrip,
} from '../../../../functions/shared/toolMath/inverseComposition/inverseCompositionMath.mjs';
import {
  applyInverseDerivationOperation,
  createLinearInverseDerivation,
  derivationEquationSolvesInverse,
  expectedLinearInverse,
  formatInverseDerivationRelation,
} from '../../../../functions/shared/toolMath/inverseComposition/inverseDerivationMath.mjs';

export const implemented = true;

const MINUS = '−';

/* ------------------------------------------------------------ number text */

const signed = (text) => String(text).replace(/^-/, MINUS);
// An authored constant exactly as written (a, h, k, base, x).
const num = (value) => signed(String(value));
const tidy = (value) => {
  const rounded = Math.round(value * 1e9) / 1e9;
  return Object.is(rounded, -0) ? 0 : rounded;
};

// The smallest denominator (≤ 64) that writes the value exactly — up to
// floating-point dust — or null. Dust is a few units in the last place: a
// looser match, or a large value (where sixty-fourths sit closer together
// than the tolerance), turns an irrational 10^4.25 − 4 into "604479/34".
const fractionOf = (value) => {
  if (Math.abs(value) >= 1e6) return null;
  for (let denominator = 2; denominator <= 64; denominator += 1) {
    const numerator = Math.round(value * denominator);
    if (Math.abs(value - numerator / denominator) <= 1e-13 * Math.max(1, Math.abs(value))) return { numerator, denominator };
  }
  return null;
};

/**
 * A computed value as the review writes it and as a student types it:
 *   decimal   2.5        exact, typed as written
 *   fraction  7/3        exact; typed 2.333 (the lab's boxes are number inputs)
 *   approx    1.414      rounded to 3 places (the grader allows 0.02)
 */
const shown = (value) => {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e12) return null;
  const exact = tidy(value);
  const short = Number(exact.toFixed(4));
  // Exact only up to floating-point dust: 0.25·4^(−17) + 1 is 1.0000000000146,
  // not 1, though it rounds there at nine places.
  if (Math.abs(value - short) <= Math.min(1e-9, 1e-12 * Math.max(1, Math.abs(value)))) return { text: signed(String(short)), typed: String(short), exact: true, kind: 'decimal' };
  const typed = String(Number(exact.toFixed(3)));
  const fraction = fractionOf(value);
  if (fraction) return { text: signed(`${fraction.numerator}/${fraction.denominator}`), typed, exact: true, kind: 'fraction' };
  return { text: signed(typed), typed, exact: false, kind: 'approx' };
};

/*
 * EXACT VALUES. A double cannot tell 10 − 0.25^27, 1.9e-18 or 0.5·3^25.5 + 10
 * from the round number beside it, so shown() alone wrote them "= 10", "= 0"
 * and "= 733773460124.8296". Each computed value also carries its exact value
 * as a fraction of BigInts, worked from the authored decimals — or null when it
 * is irrational or out of reach — and is written "=" only when that fraction
 * is the number shown.
 */
const MAX_POWER = 1024;
const MAX_ROOT = 12;
const absBig = (n) => (n < 0n ? -n : n);
const gcdBig = (a, b) => { let [p, q] = [absBig(a), absBig(b)]; while (q) [p, q] = [q, p % q]; return p; };
const ratio = (n, d = 1n) => {
  if (d === 0n) return null;
  const g = gcdBig(n, d) || 1n;
  return d < 0n ? { n: -n / g, d: -d / g } : { n: n / g, d: d / g };
};
// A plain decimal ("−2.25", "0.5") or a fraction ("7/3"); null for anything else.
const ratioOf = (text) => {
  const plain = String(text).replace(MINUS, '-');
  const decimal = plain.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (decimal) {
    const digits = decimal[3] || '';
    const n = BigInt(decimal[2] + digits) * (decimal[1] ? -1n : 1n);
    return ratio(n, 10n ** BigInt(digits.length));
  }
  const fraction = plain.match(/^(-?\d+)\/(\d+)$/);
  return fraction ? ratio(BigInt(fraction[1]), BigInt(fraction[2])) : null;
};
const both = (fn) => (p, q) => (p && q ? fn(p, q) : null);
const plus = both((p, q) => ratio(p.n * q.d + q.n * p.d, p.d * q.d));
const minus = both((p, q) => ratio(p.n * q.d - q.n * p.d, p.d * q.d));
const product = both((p, q) => ratio(p.n * q.n, p.d * q.d));
const over = both((p, q) => ratio(p.n * q.d, p.d * q.n));
const sameRatio = (p, q) => Boolean(p && q) && p.n === q.n && p.d === q.d;
// The integer q-th root of n ≥ 0 when n is a perfect q-th power, else null.
const exactRoot = (n, q) => {
  if (n < 2n) return n;
  const power = BigInt(q);
  let root = 1n << BigInt(Math.ceil(n.toString(2).length / q));
  for (;;) {
    const next = ((power - 1n) * root + n / root ** (power - 1n)) / power;
    if (next >= root) break;
    root = next;
  }
  return root ** power === n ? root : null;
};
// r^(e) for a rational exponent e: exact only when r is a perfect power of e's denominator.
const raised = (r, e) => {
  if (!r || !e || e.d > BigInt(MAX_ROOT) || absBig(e.n) > BigInt(MAX_POWER)) return null;
  if (r.n === 0n) return e.n > 0n ? r : null;
  const q = Number(e.d);
  if (r.n < 0n && q % 2 === 0) return null;
  const top = exactRoot(absBig(r.n), q);
  const bottom = exactRoot(r.d, q);
  if (top === null || bottom === null) return null;
  const root = ratio(r.n < 0n ? -top : top, bottom);
  const p = absBig(e.n);
  const power = ratio(root.n ** p, root.d ** p);
  return e.n < 0n ? over(ratio(1n), power) : power;
};
// log_base(v) when it is a fraction with a small denominator, else null.
const logarithm = (base, v, baseNumber, vNumber) => {
  if (!base || !v || !(v.n > 0n) || !(vNumber > 0)) return null;
  for (let q = 1; q <= MAX_ROOT; q += 1) {
    const p = Math.round(q * (Math.log(vNumber) / Math.log(baseNumber)));
    if (!Number.isFinite(p) || Math.abs(p) > MAX_POWER) continue;
    if (sameRatio(raised(v, ratio(BigInt(q))), raised(base, ratio(BigInt(p))))) return ratio(BigInt(p), BigInt(q));
  }
  return null;
};
// The steps of fn at an input whose exact value is r, in the order fn takes
// them — x − h, the family's own operation, × a, + k — as the grader's
// evaluateSpecWithDomain works them, in fractions.
const exactSteps = (fn, r, inputNumber) => {
  const [a, h, k, base] = [fn.a, fn.h, fn.k, fn.base].map((value) => ratioOf(String(value)));
  const shift = minus(r, h);
  let core = null;
  if (!shift) core = null;
  else if (fn.type === 'linear') core = shift;
  else if (fn.type === 'quadratic') core = product(shift, shift);
  else if (fn.type === 'cubic') core = product(shift, product(shift, shift));
  else if (fn.type === 'absolute') core = ratio(absBig(shift.n), shift.d);
  else if (fn.type === 'rational') core = shift.n === 0n ? null : over(ratio(1n), shift);
  else if (fn.type === 'squareRoot') core = raised(shift, ratio(1n, 2n));
  else if (fn.type === 'exponential') core = raised(base, shift);
  else if (fn.type === 'logarithmic') core = logarithm(base, shift, fn.base, inputNumber - fn.h);
  const scaled = product(a, core);
  return { shift, core, scaled, value: plus(scaled, k) };
};
const exactValue = (fn, r, inputNumber) => exactSteps(fn, r, inputNumber).value;

// An exponential and a log of the same base undo each other, so their
// composition can be exact though the value between them is irrational:
// 2^(log_2(3)) = 3. Worked in one piece from x, or null.
const undoneExactly = (outer, inner, r) => {
  const [ao, ho, ko, bo] = [outer.a, outer.h, outer.k, outer.base].map((value) => ratioOf(String(value)));
  const [ai, hi, ki, bi] = [inner.a, inner.h, inner.k, inner.base].map((value) => ratioOf(String(value)));
  if (!sameRatio(bo, bi)) return null;
  // a·b^(aᵢ·log_b(x − hᵢ) + kᵢ − h) + k = a·b^(kᵢ − h)·(x − hᵢ)^aᵢ + k
  if (outer.type === 'exponential' && inner.type === 'logarithmic') {
    return plus(product(ao, product(raised(bo, minus(ki, ho)), raised(minus(r, hi), ai))), ko);
  }
  // a·log_b(aᵢ·b^(x − hᵢ) + kᵢ − h) + k = a·(log_b(aᵢ) + x − hᵢ) + k, when kᵢ = h
  if (outer.type === 'logarithmic' && inner.type === 'exponential' && sameRatio(ki, ho)) {
    return plus(product(ao, plus(logarithm(bo, ai, outer.base, inner.a), minus(r, hi))), ko);
  }
  return null;
};

// shown(), "=" only when the exact value is the one written. The exact value
// rides along either way: 3/128 shows as ≈ 0.023, yet 4(3/128 + 2) + 3 is
// exactly 355/32.
const certified = (value, exact) => {
  const text = shown(value);
  if (!text || !text.exact) return text && { ...text, ratio: exact };
  const written = text.kind === 'fraction' ? ratioOf(text.text) : ratioOf(text.typed);
  if (sameRatio(written, exact)) return { ...text, ratio: exact };
  const typed = String(Number(tidy(value).toFixed(3)));
  return { text: signed(typed), typed, exact: false, kind: 'approx', ratio: exact };
};

// An authored input, written as given (it is exact).
const given = (value) => {
  const text = String(value);
  return /e/i.test(text) ? null : { text: signed(text), typed: text, exact: true, kind: 'decimal', ratio: ratioOf(text) };
};

const answerText = (value) => (value.kind === 'fraction' ? `${value.text} ≈ ${signed(value.typed)}` : value.exact ? value.text : `≈ ${value.text}`);
const eq = (value) => `${value.exact ? '=' : '≈'} ${value.text}`;
const grouped = (value) => (value.kind === 'fraction' || value.text.startsWith(MINUS) ? `(${value.text})` : value.text);

/* ---------------------------------------------------------- the functions */

const FAMILIES = Object.freeze(['linear', 'quadratic', 'absolute', 'cubic', 'squareRoot', 'exponential', 'logarithmic', 'rational']);
const LABELLED_BY_LAB = Object.freeze(['linear', 'quadratic', 'exponential', 'logarithmic', 'squareRoot']);
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// A function the lab evaluates exactly as authored: a, h, k (and base) only.
const readFunction = (spec) => {
  if (!isRecord(spec)) return null;
  const type = spec.type || 'linear';
  if (!FAMILIES.includes(type)) return null;
  // Fields the lab's label and the grader's evaluation both ignore: a prompt
  // written from them would describe a different function than the one marked.
  if ((spec.b != null && Number(spec.b) !== 1) || spec.m != null || spec.slope != null) return null;
  const a = Number(spec.a ?? 1);
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? 0);
  const base = Number(spec.base ?? 2);
  if (![a, h, k, base].every(Number.isFinite) || Math.abs(a) <= 1e-9) return null;
  // Written into the steps as given, so never in exponent notation.
  if ([a, h, k, base].some((value) => /e/i.test(String(value)))) return null;
  return { spec, type, a, h, k, base };
};

const coefficientOf = (fn) => (fn.a === 1 ? '' : fn.a === -1 ? MINUS : num(fn.a));
const tailOf = (fn) => (fn.k === 0 ? '' : ` ${fn.k > 0 ? '+' : MINUS} ${num(Math.abs(fn.k))}`);
const shiftedOf = (inputText, h) => (h === 0 ? inputText : `${inputText} ${h > 0 ? MINUS : '+'} ${num(Math.abs(h))}`);

// "f(x) = …" as the lab writes it (functionLabel), in the same style for the
// families the lab's label does not spell out.
const labelOf = (fn, name) => {
  if (LABELLED_BY_LAB.includes(fn.type)) return functionLabel(fn.spec, name);
  const coefficient = coefficientOf(fn);
  const inside = shiftedOf('x', fn.h);
  if (fn.type === 'absolute') return `${name}(x) = ${coefficient}|${inside}|${tailOf(fn)}`;
  if (fn.type === 'cubic') return `${name}(x) = ${coefficient}${fn.h === 0 ? 'x' : `(${inside})`}³${tailOf(fn)}`;
  return `${name}(x) = ${num(fn.a)}/${fn.h === 0 ? 'x' : `(${inside})`}${tailOf(fn)}`;
};

// The right-hand side with a number put in for x.
const substituted = (fn, input) => {
  const coefficient = coefficientOf(fn);
  const times = coefficient && coefficient !== MINUS ? '·' : '';
  const argument = shiftedOf(input.text, fn.h);
  const tail = tailOf(fn);
  if (fn.type === 'linear') return coefficient === '' && fn.h === 0 ? `${input.text}${tail}` : `${coefficient}(${argument})${tail}`;
  if (fn.type === 'quadratic') return `${coefficient}(${argument})²${tail}`;
  if (fn.type === 'cubic') return `${coefficient}(${argument})³${tail}`;
  if (fn.type === 'absolute') return `${coefficient}|${argument}|${tail}`;
  // A plain non-negative number needs no brackets under a root or over a bar.
  const bare = fn.h === 0 && input.kind === 'decimal' && !input.text.startsWith(MINUS);
  if (fn.type === 'squareRoot') return bare ? `${coefficient}√${input.text}${tail}` : `${coefficient}√(${argument})${tail}`;
  if (fn.type === 'exponential') return `${coefficient}${times}${num(fn.base)}^(${argument})${tail}`;
  if (fn.type === 'logarithmic') return `${coefficient}${times}log_${num(fn.base)}(${argument})${tail}`;
  return bare ? `${num(fn.a)}/${input.text}${tail}` : `${num(fn.a)}/(${argument})${tail}`;
};

// "f(2) = 2(2) + 3 = 7"
const evaluation = (name, fn, input, output) => {
  const work = substituted(fn, input);
  const start = `${name}(${input.text}) = ${work}`;
  return work === output.text ? start : `${start} ${input.exact && output.exact ? '=' : '≈'} ${output.text}`;
};

/* -------------------------------------------------------------- the parts */

// The lab's own words for the restriction select's options.
const RESTRICTION_OPTIONS = Object.freeze({
  none: 'No restriction needed',
  left: 'Use the left branch (x ≤ vertex x)',
  right: 'Use the right branch (x ≥ vertex x)',
});

const compositionSteps = (outerName, outer, innerName, inner, x, xNumber) => {
  const middleNumber = evaluateSpecWithDomain(inner.spec, xNumber);
  const middle = certified(middleNumber, exactValue(inner, x.ratio, xNumber));
  const resultNumber = composeValue(outer.spec, inner.spec, xNumber);
  const result = certified(resultNumber, (middle && exactValue(outer, middle.ratio, middleNumber)) || undoneExactly(outer, inner, x.ratio));
  if (!middle || !result) return null;
  // The outer step is worked from the middle value as shown. Rounded, it must
  // still lead to the result: "f(1.002) = 1/(1.002 − 1) + 2 ≈ 579.35" does
  // not (it is 502) — the unrounded 1.00173 does.
  if (!middle.exact && !(Math.abs(evaluateSpecWithDomain(outer.spec, Number(middle.typed)) - resultNumber) <= 0.005 * Math.max(1, Math.abs(resultNumber)))) return null;
  const name = `(${outerName} ∘ ${innerName})(${x.text})`;
  return {
    name,
    result,
    steps: [
      `For ${name}, ${innerName} is written closest to x, so ${innerName} acts first: ${evaluation(innerName, inner, x, middle)}.`,
      `Then ${outerName} acts on that output: ${evaluation(outerName, outer, middle, result)}, so ${name} ${eq(result)}.`,
    ],
    trace: `${x.text} → ${innerName} → ${middle.text} → ${outerName} → ${result.text}`,
  };
};

// y = mx + c for a linear function, or null.
const linearForm = (fn) => (fn.type === 'linear' ? { m: fn.a, c: fn.k - fn.a * fn.h } : null);

const linearText = (m, c) => {
  const slope = shown(m);
  const constant = shown(Math.abs(c));
  if (!slope?.exact || !constant?.exact || tidy(m) === 0) return null;
  const term = slope.text === '1' ? 'x' : slope.text === `${MINUS}1` ? `${MINUS}x` : `${slope.kind === 'fraction' ? `(${slope.text})` : slope.text}x`;
  return tidy(c) === 0 ? term : `${term} ${c > 0 ? '+' : MINUS} ${constant.text}`;
};

// A formula check when both functions are linear: (f ∘ g)(x) = mx + c.
const composedFormulaCheck = (outerName, outer, innerName, inner, x, xNumber, result) => {
  const o = linearForm(outer);
  const i = linearForm(inner);
  if (!o || !i) return null;
  const m = o.m * i.m;
  const c = o.m * i.c + o.c;
  const formula = linearText(m, c);
  const inside = linearText(i.m, i.c);
  const value = composeValue(outer.spec, inner.spec, xNumber);
  if (!formula || !inside || Math.abs(m * xNumber + c - value) > 1e-9 * Math.max(1, Math.abs(value))) return null;
  return `As one formula, (${outerName} ∘ ${innerName})(x) = ${outerName}(${inside}) = ${formula}, and at x = ${x.text} it gives ${result.exact ? '' : '≈ '}${result.text} again.`;
};

// Undo f in reverse order, starting from y = f(x): each move and its result.
// Each value met on the way back is one f met on the way out, so its exact
// value is f's own step from x (exactSteps): 5.292² ≈ 28 is rounded, but the
// 28 it reaches is exactly x − h, and 28 − 1 = 27 is exact.
const undoMoves = (fn, start, x, xNumber, branch) => {
  const moves = [];
  const forward = exactSteps(fn, x.ratio, xNumber);
  let value = start;
  let exact = forward.value;
  const move = (describe, undo, work, afterExact) => {
    const next = undo(value);
    const before = certified(value, exact);
    const after = certified(next, afterExact);
    if (!before || !after) return false;
    // Worked from a rounded value, the result is only approximately equal —
    // "1.732² = 3" is false, even though √3 squared is exactly 3 — and the
    // rounded value must still lead there: "log_5(0.004) ≈ −3.5" does not
    // (log_5(0.004) ≈ −3.43). Null rather than a step a student cannot redo.
    if (!before.exact && !(Math.abs(undo(Number(before.typed)) - next) <= 0.005 * Math.max(1, Math.abs(next)))) return false;
    moves.push(`${describe}: ${work(before)} ${before.exact && after.exact ? '=' : '≈'} ${after.text}`);
    value = next;
    exact = after.ratio;
    return true;
  };
  if (fn.k !== 0 && !move(`undo the ${fn.k > 0 ? '+' : MINUS} ${num(Math.abs(fn.k))}`, (v) => v - fn.k,
    (before) => `${before.text} ${fn.k > 0 ? MINUS : '+'} ${num(Math.abs(fn.k))}`, forward.scaled)) return null;
  if (fn.a !== 1 && !move(`undo the × ${fn.a < 0 ? `(${num(fn.a)})` : num(fn.a)}`, (v) => v / fn.a,
    (before) => `${before.text} ÷ ${fn.a < 0 ? `(${num(fn.a)})` : num(fn.a)}`, forward.core)) return null;
  if (fn.type === 'quadratic') {
    if (value < -1e-9) return null;
    if (!move(`undo the square with the ${branch < 0 ? 'negative' : 'positive'} square root (the ${branch < 0 ? 'left' : 'right'} branch)`,
      (v) => branch * Math.sqrt(Math.max(0, v)),
      (before) => `${branch < 0 ? MINUS : ''}√${grouped(before)}`, forward.shift)) return null;
  } else if (fn.type === 'squareRoot') {
    if (value < -1e-9) return null;
    if (!move('undo the square root by squaring', (v) => v ** 2, (before) => `${grouped(before)}²`, forward.shift)) return null;
  } else if (fn.type === 'exponential') {
    if (!(value > 0)) return null;
    if (!move(`undo the power of ${num(fn.base)} with log base ${num(fn.base)}`, (v) => Math.log(v) / Math.log(fn.base),
      (before) => `log_${num(fn.base)}(${before.text})`, forward.shift)) return null;
  } else if (fn.type === 'logarithmic') {
    if (!move(`undo log base ${num(fn.base)} by raising ${num(fn.base)} to that power`, (v) => fn.base ** v,
      (before) => `${num(fn.base)}^${grouped(before)}`, forward.shift)) return null;
  } else if (fn.type !== 'linear') {
    return null;
  }
  if (fn.h !== 0 && !move(`undo the ${fn.h > 0 ? MINUS : '+'} ${num(Math.abs(fn.h))} on x`, (v) => v + fn.h,
    (before) => `${before.text} ${fn.h > 0 ? '+' : MINUS} ${num(Math.abs(fn.h))}`, x.ratio)) return null;
  return { moves, value };
};

const inverseWork = (f, x, xNumber) => {
  if (!hasFunctionalInverse(f.spec)) return null;
  const fxNumber = evaluateSpecWithDomain(f.spec, xNumber);
  const fx = certified(fxNumber, exactValue(f, x.ratio, xNumber));
  if (!fx) return null;
  const inverseNumber = inverseLabRoundTrip(f.spec, xNumber);
  const close = (value) => Number.isFinite(value) && Math.abs(value - xNumber) <= 1e-6 * Math.max(1, Math.abs(xNumber));
  // f⁻¹(f(x)) is x only for an input on f's kept branch; off a parabola's
  // kept branch it is the mirror input 2h − x, which this review does not
  // explain.
  if (!close(inverseNumber)) return null;
  const restriction = expectedInverseRestriction(f.spec);
  const branch = restriction === 'left' ? -1 : 1;
  const undo = undoMoves(f, fxNumber, x, xNumber, branch);
  if (!undo || !close(undo.value)) return null;
  // The lab labels the box with f(x) rounded to 3 places.
  const name = `f⁻¹(${signed(String(round(fxNumber, 3)))})`;
  // f's output by name when it shows rounded: f⁻¹(6.162) is not 10 — only
  // f⁻¹(f(10)) = f⁻¹(√10 + 3) is.
  const output = fx.exact ? fx.text : `f(${x.text})`;
  const undoStep = undo.moves.length
    ? `To find f⁻¹(${output}), undo f's operations in reverse order — ${undo.moves.join('; ')}. So f⁻¹(${output}) = ${x.text}, the input you started with.`
    : `f leaves every input unchanged, so f⁻¹ does too: f⁻¹(${output}) = ${x.text}, the input you started with.`;
  return {
    name,
    fx,
    steps: [
      `f sends the input ${x.text} to ${evaluation('f', f, x, fx)}, so f⁻¹(${output}) is the input that f sends to ${output}.`,
      undoStep,
    ],
    why: `Check by applying f again: f(${x.text}) ${eq(fx)}, so f⁻¹ sends ${output} straight back to ${x.text}. On the graph, (${x.text}, ${output}) on f and (${output}, ${x.text}) on f⁻¹ are mirror images across y = x.`,
  };
};

// Is f always increasing or always decreasing (so already one-to-one)?
const monotoneDirection = (fn) => {
  const sign = ['exponential', 'logarithmic'].includes(fn.type) ? fn.a * Math.log(fn.base) : fn.a;
  if (!['linear', 'squareRoot', 'exponential', 'logarithmic'].includes(fn.type) || !Number.isFinite(sign) || sign === 0) return null;
  return sign > 0 ? 'increasing' : 'decreasing';
};

const restrictionWork = (f) => {
  const expected = expectedInverseRestriction(f.spec);
  const option = RESTRICTION_OPTIONS[expected];
  if (!option) return null;
  if (expected === 'none') {
    const direction = monotoneDirection(f);
    if (!direction) return null;
    return {
      choice: expected,
      value: option,
      steps: [`${labelOf(f, 'f')} is always ${direction}, so no two inputs share an output: f is already one-to-one and has an inverse on its whole domain. Choose “${option}”.`],
      why: 'Because f is one-to-one, every output comes from exactly one input — which is all an inverse function needs.',
    };
  }
  if (f.type !== 'quadratic') return null;
  const vertex = num(f.h);
  const left = shown(f.h - 1);
  const right = shown(f.h + 1);
  const output = shown(f.a + f.k);
  if (!left || !right || !output) return null;
  const side = expected === 'left' ? `x ≤ ${vertex}` : `x ≥ ${vertex}`;
  return {
    choice: expected,
    value: `${option}: ${side}`,
    steps: [
      `${labelOf(f, 'f')} is a parabola with its vertex at x = ${vertex}. The whole parabola is not one-to-one: x = ${left.text} and x = ${right.text} both give y ${eq(output)}, so an inverse could not tell which input to give back.`,
      `Keeping one side of the vertex fixes that. The lab's inverse condition keeps the ${expected} branch, ${side}, so choose “${option}”.`,
    ],
    branchStep: `${labelOf(f, 'f')} is a parabola, so it has an inverse function only on one side of its vertex. The lab's inverse condition keeps the ${expected} branch, ${side}.`,
    why: `On the ${expected} branch (${side}) each output of f comes from exactly one input, so f⁻¹ is a function there.`,
  };
};

/* ------------------------------------------------------------- the review */

const LAB_VIEWS = Object.freeze(['full', 'composition', 'inverse', 'restriction']);
const TITLES = Object.freeze({
  full: 'Composition and inverse solution',
  composition: 'Composition solution',
  inverse: 'Inverse solution',
  restriction: 'Restriction and inverse solution',
});

const acceptedByGrader = (question, work) => {
  const result = gradeWorkWithGrader({ grader: inverseCompositionGrader, question, work });
  return result.graded === true && result.isCorrect === true;
};

const buildLabReview = (question) => {
  // The lab's own reading of its view. Any other value hides the composition
  // boxes while the grader still asks for them: nothing could be right.
  const view = question.mode || 'full';
  if (!LAB_VIEWS.includes(view)) return null;
  if (!isRecord(question.f)) return null;
  const { f: fSpec, g: gSpec } = inverseLabFunctions(question);
  const f = readFunction(fSpec);
  if (!f) return null;
  const parts = inverseLabRequiredParts(view, fSpec);
  const composes = parts.includes('fog') || parts.includes('gof');
  const g = composes && isRecord(question.g) ? readFunction(gSpec) : null;
  if (composes && !g) return null;

  const xValue = inverseLabInitialX(question);
  if (!(typeof xValue === 'number' || (typeof xValue === 'string' && xValue.trim() !== ''))) return null;
  const xNumber = Number(xValue);
  if (!Number.isFinite(xNumber)) return null;
  const x = given(xNumber);
  if (!x) return null;

  const items = [];
  const steps = [];
  const why = [];
  const work = { x: xValue, fogAnswer: '', gofAnswer: '', inverseAnswer: '', restrictionChoice: '' };

  if (composes) {
    const fog = compositionSteps('f', f, 'g', g, x, xNumber);
    const gof = compositionSteps('g', g, 'f', f, x, xNumber);
    if (!fog || !gof) return null;
    items.push({ label: fog.name, value: answerText(fog.result) }, { label: gof.name, value: answerText(gof.result) });
    steps.push(...fog.steps, ...gof.steps);
    work.fogAnswer = fog.result.typed;
    work.gofAnswer = gof.result.typed;
    why.push(fog.result.text === gof.result.text
      ? `The function written closest to x always acts first: ${fog.trace}, and ${gof.trace}. Here the two orders happen to give the same value, which is not true in general.`
      : `The function written closest to x always acts first, so the order matters: ${fog.trace}, but ${gof.trace}.`);
    const formulas = [composedFormulaCheck('f', f, 'g', g, x, xNumber, fog.result), composedFormulaCheck('g', g, 'f', f, x, xNumber, gof.result)];
    if (formulas.every(Boolean)) why.push(...formulas);
  }

  const restriction = parts.includes('restriction') ? restrictionWork(f) : null;
  if (parts.includes('restriction') && !restriction) return null;
  const inverse = parts.includes('inverse') ? inverseWork(f, x, xNumber) : null;
  if (parts.includes('inverse') && !inverse) return null;

  if (restriction) {
    steps.push(...restriction.steps);
    work.restrictionChoice = restriction.choice;
  }
  if (inverse) {
    // An inverse-only view still shows a parabola's restriction select (it is
    // not marked there): the branch is part of the reasoning, not an answer.
    if (!restriction && f.type === 'quadratic') {
      const kept = restrictionWork(f);
      if (!kept?.branchStep) return null;
      steps.push(kept.branchStep);
    }
    steps.push(...inverse.steps);
    work.inverseAnswer = x.typed;
    why.push(inverse.why);
  }
  if (restriction) why.push(restriction.why);
  // Items in the order the grader marks the parts.
  parts.forEach((part) => {
    if (part === 'inverse') items.push({ label: inverse.name, value: x.text });
    if (part === 'restriction') items.push({ label: 'Domain restriction', value: restriction.value });
  });

  if (!acceptedByGrader(question, work)) return null;
  return {
    title: TITLES[view],
    items,
    steps,
    why: why.join(' '),
    note: inverseLabInputLocked(question)
      ? null
      : `This question let you change the input x. The answers above are for x = ${x.text}, where the lab starts; with a different x, follow the same steps with your x.`,
  };
};

// The equation the lab shows, with a true minus sign.
const relationText = (state) => formatInverseDerivationRelation(state).replace(/-/g, MINUS);

// An operand a student can type exactly into the lab's number box.
const typeable = (value) => {
  const text = shown(value);
  return text && text.kind === 'decimal' ? text : null;
};

const buildDerivationReview = (question) => {
  if (!isRecord(question.f)) return null;
  const f = readFunction(question.f);
  if (!f || question.f.type !== 'linear') return null;
  let state = createLinearInverseDerivation(question.f);
  const slope = state.right.x;
  const constant = state.right.c;
  const original = relationText(state);
  const steps = [`Write ${labelOf(f, 'f')} as an equation in x and y: ${original}.`];

  state = applyInverseDerivationOperation(state, 'swapVariables');
  const swapped = relationText(state);
  steps.push(`Swap x and y — this is the step that makes it the inverse, because every output becomes an input: ${swapped}.`);

  if (constant !== 0) {
    const amount = typeable(Math.abs(constant));
    if (!amount) return null;
    state = applyInverseDerivationOperation(state, constant > 0 ? 'subtract' : 'add', Number(amount.typed));
    steps.push(constant > 0
      ? `Subtract ${amount.text} from both sides to clear the constant from the y side: ${relationText(state)}.`
      : `Add ${amount.text} to both sides to clear the constant from the y side: ${relationText(state)}.`);
  }
  if (slope !== 1) {
    const divisor = typeable(slope);
    const reciprocal = divisor ? null : typeable(1 / slope);
    if (!divisor && !reciprocal) return null;
    state = divisor
      ? applyInverseDerivationOperation(state, 'divide', Number(divisor.typed))
      : applyInverseDerivationOperation(state, 'multiply', Number(reciprocal.typed));
    steps.push(divisor
      ? `Divide both sides by ${divisor.text} so y stands alone: ${relationText(state)}.`
      : `Multiply both sides by ${reciprocal.text}, the reciprocal of ${shown(slope).text}, so y stands alone: ${relationText(state)}.`);
  }

  const equation = { left: state.left, right: state.right };
  if (!derivationEquationSolvesInverse(equation, question.f)) return null;
  const relation = relationText(state);
  if (!relation.endsWith(' = y')) return null;
  const inverse = relation.slice(0, -4);
  steps.push(`y is alone, so f⁻¹(x) = ${inverse}.`);

  // A point check: f(1), then f⁻¹ of that output, gives back 1.
  const expected = expectedLinearInverse(question.f);
  const output = shown(slope + constant);
  if (!output?.exact || Math.abs(expected.slope * (slope + constant) + expected.intercept - 1) > 1e-9) return null;
  const pointCheck = `Check with a point: f(1) = ${output.text}, and f⁻¹(${output.text}) = ${inverse.replace(/x/g, `(${output.text})`)} = 1 — f⁻¹ sends f's output back to its input.`;

  const work = {
    equation,
    relation: formatInverseDerivationRelation(state),
    steps: state.history?.length || 0,
  };
  if (!acceptedByGrader(question, work)) return null;
  return {
    title: 'Inverse derivation solution',
    items: [
      { label: 'After swapping x and y', value: swapped },
      { label: 'f⁻¹(x)', value: inverse },
    ],
    steps,
    why: `Every move after the swap did the same thing to both sides, so the final equation still says x = f(y) — solved for y, which is exactly f⁻¹. ${pointCheck}`,
    note: null,
  };
};

export const buildInverseCompositionLabReview = (question) => {
  try {
    if (!isRecord(question)) return null;
    // The grader's own reading of the view, and whether it can mark it at all.
    const support = inverseCompositionGrader.support(question);
    if (!support || support.supported !== true) return null;
    return support.mode === 'deriveInverse' ? buildDerivationReview(question) : buildLabReview(question);
  } catch {
    return null;
  }
};

export default buildInverseCompositionLabReview;
