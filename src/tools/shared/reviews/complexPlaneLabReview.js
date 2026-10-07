// Worked solution review for complexPlaneLab (contract: ../toolSolutionReview.js, textOnlyReview).
//
// WHAT THE SHARED GRADER CALLS CORRECT
// (functions/shared/serverGrading/tools/complexPlaneLab.mjs). Every mode is a
// set of typed numbers checked against values recomputed from the question's
// own z, w, operation, exponent, quarter turns or quadratic — with the lab's
// defaults for an unauthored one — to within 0.01 (0.02 for a power's
// magnitude):
//
//   features        |z|, Re(z̄), Im(z̄)
//   operations      the real and imaginary parts of z + w, z − w or z·w
//   division        Re(w̄), Im(w̄) and the real and imaginary parts of z ÷ w
//   powers          the real and imaginary parts of zⁿ, and |zⁿ|
//   rotation        the real and imaginary parts of iⁿ·z, and n mod 4
//   quadraticRoots  both roots (either order), from the quadratic formula
//
// Every one has a single answer, so every mode is explained. The review reads
// the answer with the grader's own helpers (complexMath.mjs), writes out the
// arithmetic that reaches it, and then GRADES THE ANSWERS IT STATES with the
// shared grader: if the grader would not accept them exactly as written, the
// whole review is null.
//
// Null — never a guess — when:
//   - the question carries none of the fields the lab reads (no mode, z, w,
//     operation, exponent, quarter turns or quadratic): an empty shell;
//   - the lab would render a different mode than the grader grades (a mode
//     with stray spaces, a non-string mode);
//   - an operation other than add / subtract / multiply is named (the lab
//     would silently multiply, which is not what the author asked for);
//   - a number the student was shown is not exactly the number the grader
//     uses: a component with more than two decimal places (the lab prints it
//     rounded), a non-numeric or template value ('{{a}}'), or one beyond ±1000;
//   - the grader itself has no answer (division by 0 + 0i, a non-integer
//     exponent or quarter-turn count, a = 0 in the quadratic, 0 to a power
//     ≤ 0), or a power beyond ±12;
//   - a number the worked steps would claim is exact is not exact.
import complexPlaneGrader from '../../../../functions/shared/serverGrading/tools/complexPlaneLab.mjs';
import { resolveToolMode } from '../../../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import {
  complexAdd,
  complexConjugateValue,
  complexDivide,
  complexMagnitudeValue,
  complexMultiplyValues,
  complexPower,
  complexSubtract,
  normalizedQuarterTurns,
  quadraticRootsComplex,
  rotateByPowerOfI,
  toComplex,
} from '../../../../functions/shared/toolMath/complexPlane/complexMath.mjs';

export const implemented = true;

// ComplexPlaneLab.jsx: `questionData.mode || 'features'`, compared strictly;
// anything else renders the Features view.
const LAB_MODES = Object.freeze(['features', 'operations', 'division', 'powers', 'rotation', 'quadraticRoots']);
const labMode = (question) => (typeof question.mode === 'string' && LAB_MODES.includes(question.mode) ? question.mode : 'features');

// The Net rotation select's option text, by its value '0'…'3'.
const ROTATION_CHOICES = Object.freeze(['No net rotation', '90° counterclockwise', '180°', '90° clockwise']);
const I_POWERS = Object.freeze(['1', 'i', '-1', '-i']);

const INPUT_LIMIT = 1000;
const MAX_POWER = 12;
const ROUNDING_NOTE = 'A decimal rounded to two places is accepted wherever the exact value is not a short decimal.';

/* ---------------------------------------------------------------- numbers -- */

// The exact decimal text of a number (at most 8 places), or null when the
// number is not exactly that.
const exactText = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (Number.isInteger(number)) return Number.isSafeInteger(number) ? String(number === 0 ? 0 : number) : null;
  if (Math.abs(number) >= 1e7) return null;
  const rounded = Number(number.toFixed(8));
  if (Math.abs(rounded - number) > 1e-9) return null;
  const text = String(rounded === 0 ? 0 : rounded);
  return /e/i.test(text) ? null : text;
};
const decimalsOf = (text) => (String(text).split('.')[1] || '').length;
// Two decimal places: always within 0.005, inside every tolerance the grader uses.
const roundedText = (value) => {
  const rounded = Number(Number(value).toFixed(2));
  return String(rounded === 0 ? 0 : rounded);
};
const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
// A value that is an exact short decimal, snapped to it (float noise removed).
const snapped = (value) => {
  const text = exactText(value);
  return text === null ? Number.NaN : Number(text);
};

// A number the lab shows and the grader uses identically: finite, at most two
// decimal places (formatComplex prints two), within ±1000.
const inputOk = (value) => {
  const text = exactText(value);
  return text !== null && decimalsOf(text) <= 2 && Math.abs(Number(value)) <= INPUT_LIMIT;
};

// The grader's `toComplex(question.z || fallback)`, refused unless it is a
// plain { re, im } object of displayable numbers.
const complexInput = (raw, fallback) => {
  const source = raw || fallback;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
  const value = toComplex(source);
  return inputOk(value.re) && inputOk(value.im) ? { re: value.re + 0, im: value.im + 0 } : null;
};

const finiteComplex = (value) => Boolean(value) && Number.isFinite(value.re) && Number.isFinite(value.im);
const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const sameComplex = (a, b) => close(a.re, b.re) && close(a.im, b.im);

// p/q (q > 0) as a decimal, worked out in integers: it terminates exactly when
// q has no prime factor but 2 and 5. Null when it does not (or needs more than
// eight places) — a float cannot tell 3/13 from 0.23076923.
const terminatingText = (p, q) => {
  let rest = q;
  let twos = 0;
  let fives = 0;
  while (rest % 2 === 0) {
    rest /= 2;
    twos += 1;
  }
  while (rest % 5 === 0) {
    rest /= 5;
    fives += 1;
  }
  const places = Math.max(twos, fives);
  if (rest !== 1 || places > 8) return null;
  const scaled = Math.abs(p) * (10 ** places / q);
  if (!Number.isSafeInteger(scaled)) return null;
  const digits = String(scaled).padStart(places + 1, '0');
  const whole = digits.slice(0, digits.length - places);
  const fractional = digits.slice(digits.length - places).replace(/0+$/, '');
  return `${p < 0 ? '-' : ''}${whole}${fractional ? `.${fractional}` : ''}`;
};

// The reduced integer fraction p/q (q > 0).
const fractionOf = (p, q) => {
  const top = p === 0 ? 0 : p;
  return {
    p: top,
    q,
    value: top / q,
    isInteger: q === 1,
    latex: q === 1 ? String(top) : `${top < 0 ? '-' : ''}\\frac{${Math.abs(top)}}{${q}}`,
    numeratorText: String(Math.abs(top)),
    denominatorText: String(q),
    decimal: terminatingText(top, q),
  };
};

// numerator / denominator (exact decimals) as a reduced fraction of integers.
const fraction = (numerator, denominator) => {
  const top = exactText(numerator);
  const bottom = exactText(denominator);
  if (top === null || bottom === null || Number(bottom) === 0) return null;
  const scale = 10 ** Math.max(decimalsOf(top), decimalsOf(bottom));
  let p = Math.round(Number(top) * scale);
  let q = Math.round(Number(bottom) * scale);
  if (!Number.isSafeInteger(p) || !Number.isSafeInteger(q)) return null;
  if (q < 0) {
    p = -p;
    q = -q;
  }
  const divisor = gcd(Math.abs(p), q) || 1;
  return fractionOf(p / divisor, q / divisor);
};
const negated = (f) => fractionOf(-f.p, f.q);

// √S for an exact S ≥ 0: rational, a simplified surd k√m, or √S.
const rootInfo = (radicand) => {
  const text = exactText(radicand);
  if (text === null || Number(text) < 0) return null;
  const value = Math.sqrt(Number(text));
  const half = Math.ceil(decimalsOf(text) / 2);
  const scaled = Math.round(Number(text) * 10 ** (2 * half));
  const plain = `\\sqrt{${text}}`;
  if (Number.isSafeInteger(scaled)) {
    const root = Math.round(Math.sqrt(scaled));
    if (root * root === scaled) {
      return { value, radicand: text, rational: true, latex: exactText(root / 10 ** half), plain, outside: null, inside: null };
    }
    if (half === 0 && scaled <= 1e10) {
      let outside = 1;
      for (let factor = 2; factor * factor <= scaled; factor += 1) {
        if (scaled % (factor * factor) === 0) outside = factor;
      }
      const inside = scaled / (outside * outside);
      return { value, radicand: text, rational: false, latex: `${outside === 1 ? '' : outside}\\sqrt{${inside}}`, plain, outside, inside };
    }
  }
  return { value, radicand: text, rational: false, latex: plain, plain, outside: null, inside: null };
};

// "\sqrt{25} = 5", "\sqrt{8} = 2\sqrt{2} \approx 2.83", "\sqrt{13} \approx 3.61".
const rootChain = (info) => {
  if (info.rational) return `${info.plain} = ${info.latex}`;
  const simplified = info.latex !== info.plain ? ` = ${info.latex}` : '';
  return `${info.plain}${simplified} \\approx ${roundedText(info.value)}`;
};

// An item for a fraction: "3", "$\frac{11}{25} = 0.44$", "$\frac{1}{3} \approx 0.33$".
const fractionItem = (f) => {
  if (f.isInteger) return { value: f.latex, answer: { text: f.latex, approximate: false } };
  if (f.decimal !== null) return { value: `$${f.latex} = ${f.decimal}$`, answer: { text: f.decimal, approximate: false } };
  const rounded = roundedText(f.value);
  return { value: `$${f.latex} \\approx ${rounded}$`, answer: { text: rounded, approximate: true } };
};

// An item for an irrational value: "$\sqrt{8} = 2\sqrt{2} \approx 2.83$".
const approximateItem = (latex, value) => {
  const rounded = roundedText(value);
  return { value: `$${latex} \\approx ${rounded}$`, answer: { text: rounded, approximate: true } };
};

const parenthesized = (latex) => (latex.startsWith('-') || latex.includes('\\') ? `\\left(${latex}\\right)` : latex);

// Unicode superscripts for a plain-text label: |z³|, |z⁻²|.
const SUPERSCRIPTS = Object.freeze({ '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' });
const superscript = (value) => String(value).split('').map((character) => SUPERSCRIPTS[character] || character).join('');

/*
 * Text writer for the worked steps (LaTeX inside $…$). Every number goes
 * through `n`, which records when a number is not exactly what it prints —
 * the builder then says nothing rather than print a false equation.
 */
const makeWriter = () => {
  let exact = true;
  const n = (value) => {
    const text = exactText(value);
    if (text === null) {
      exact = false;
      return '0';
    }
    return text;
  };
  // A number used as a factor or after an operator: negatives in parentheses.
  const p = (value) => {
    const text = n(value);
    return text.startsWith('-') ? `(${text})` : text;
  };
  const sq = (value) => `${p(value)}^2`;
  // A signed sum of [coefficient, unit] terms in the order given, NOT combined;
  // unit is '', 'i', 'i^2', 'x' or 'x^2'. Zero terms are left out.
  const sum = (terms) => {
    const pieces = [];
    terms.forEach(([coefficient, unit]) => {
      const text = n(coefficient);
      if (text === '0') return;
      const negative = text.startsWith('-');
      const magnitude = negative ? text.slice(1) : text;
      const body = unit ? `${magnitude === '1' ? '' : magnitude}${unit}` : magnitude;
      if (!pieces.length) pieces.push(negative ? `-${body}` : body);
      else pieces.push(`${negative ? '-' : '+'} ${body}`);
    });
    return pieces.length ? pieces.join(' ') : '0';
  };
  // An imaginary factor (2i, -i) inside a product, negatives in parentheses.
  const ip = (value) => {
    const text = sum([[value, 'i']]);
    return text.startsWith('-') ? `(${text})` : text;
  };
  const cx = (value) => sum([[value.re, ''], [value.im, 'i']]);
  // (a + bi)(c + di) written as its four products, not combined.
  const expand = (left, right) => sum([
    [left.re * right.re, ''], [left.re * right.im, 'i'], [left.im * right.re, 'i'], [left.im * right.im, 'i^2'],
  ]);
  return { n, p, sq, sum, ip, cx, expand, ok: () => exact };
};

// "\frac{N}{D} = \frac{p}{q} = 0.44" for a division step.
const divisionChain = (w, numerator, denominator, f) => {
  const head = `\\frac{${w.n(numerator)}}{${w.n(denominator)}}`;
  if (f.isInteger) return `${head} = ${f.latex}`;
  const reduced = f.latex !== head ? ` = ${f.latex}` : '';
  return f.decimal !== null ? `${head}${reduced} = ${f.decimal}` : `${head}${reduced} \\approx ${roundedText(f.value)}`;
};

/* ------------------------------------------------------------------ modes -- */

const features = (question) => {
  const z = complexInput(question.z, { re: 3, im: -4 });
  if (!z) return null;
  const w = makeWriter();
  const conjugate = complexConjugateValue(z);
  const magnitude = complexMagnitudeValue(z);
  const squares = z.re ** 2 + z.im ** 2;
  const root = rootInfo(squares);
  if (!root || !close(root.value, magnitude)) return null;
  const magnitudeItem = root.rational
    ? { value: root.latex, answer: { text: root.latex, approximate: false } }
    : approximateItem(root.latex === root.plain ? root.plain : `${root.plain} = ${root.latex}`, magnitude);
  return {
    work: { magnitudeAnswer: magnitudeItem.answer.text, conjugateRe: w.n(conjugate.re), conjugateIm: w.n(conjugate.im) },
    approximate: magnitudeItem.answer.approximate,
    writer: w,
    title: 'Complex number features',
    items: [
      { label: '|z|', value: magnitudeItem.value },
      { label: 'Re(z̄)', value: w.n(conjugate.re) },
      { label: 'Im(z̄)', value: w.n(conjugate.im) },
    ],
    steps: [
      `Plot $z = ${w.cx(z)}$ as the point $(${w.n(z.re)}, ${w.n(z.im)})$: the real part is the horizontal coordinate and the imaginary part is the vertical coordinate.`,
      `The magnitude $|z|$ is the distance from the origin to that point, so use the Pythagorean theorem: $|z| = \\sqrt{${w.sq(z.re)} + ${w.sq(z.im)}} = \\sqrt{${w.n(z.re ** 2)} + ${w.n(z.im ** 2)}} = ${rootChain(root)}$.`,
      `The conjugate keeps the real part and changes the sign of the imaginary part: $\\bar{z} = ${w.cx(conjugate)}$.`,
      `So $\\operatorname{Re}(\\bar{z}) = ${w.n(conjugate.re)}$ and $\\operatorname{Im}(\\bar{z}) = ${w.n(conjugate.im)}$.`,
    ],
    why: `Reflecting $(${w.n(z.re)}, ${w.n(z.im)})$ across the real axis gives $(${w.n(conjugate.re)}, ${w.n(conjugate.im)})$, the point for $\\bar{z}$. Check: $z\\bar{z} = (${w.cx(z)})(${w.cx(conjugate)}) = ${w.sq(z.re)} + ${w.sq(z.im)} = ${w.n(squares)}$, which is $|z|^2$, so $|z| = ${root.rational ? root.latex : root.plain}$.`,
  };
};

const OPERATION_NAMES = Object.freeze({ add: 'addition', subtract: 'subtraction', multiply: 'multiplication' });

const operations = (question) => {
  const operation = question.operation || 'multiply';
  // The lab multiplies for any other name; a review would then explain an
  // operation the author did not ask for.
  if (typeof operation !== 'string' || !Object.prototype.hasOwnProperty.call(OPERATION_NAMES, operation)) return null;
  const z = complexInput(question.z, { re: 2, im: 3 });
  const v = complexInput(question.w, { re: -1, im: 2 });
  if (!z || !v) return null;
  const expected = operation === 'add' ? complexAdd(z, v) : operation === 'subtract' ? complexSubtract(z, v) : complexMultiplyValues(z, v);
  const w = makeWriter();
  const [a, b, c, d] = [z.re, z.im, v.re, v.im];
  let result;
  let steps;
  let why;
  if (operation === 'add' || operation === 'subtract') {
    const sign = operation === 'add' ? '+' : '-';
    result = operation === 'add' ? { re: a + c, im: b + d } : { re: a - c, im: b - d };
    steps = [
      `${operation === 'add' ? 'Add' : 'Subtract'} the real parts and the imaginary parts separately: $z = ${w.cx(z)}$ and $w = ${w.cx(v)}$.`,
      `Real parts: $${w.n(a)} ${sign} ${w.p(c)} = ${w.n(result.re)}$.`,
      `Imaginary parts: $${w.n(b)} ${sign} ${w.p(d)} = ${w.n(result.im)}$.`,
      `So $(${w.cx(z)}) ${sign} (${w.cx(v)}) = ${w.cx(result)}$: the real part is $${w.n(result.re)}$ and the imaginary part is $${w.n(result.im)}$.`,
    ];
    why = operation === 'add'
      ? `On the plane, adding $w$ moves the point $(${w.n(a)}, ${w.n(b)})$ by $(${w.n(c)}, ${w.n(d)})$, landing on $(${w.n(result.re)}, ${w.n(result.im)})$. Check by subtracting $w$ back: $(${w.cx(result)}) - (${w.cx(v)}) = ${w.cx(z)}$, which is $z$.`
      : `Subtracting is undone by adding: $(${w.cx(result)}) + (${w.cx(v)}) = ${w.cx(z)}$, which is $z$. On the plane, $z - w$ is the arrow from the point $w$ to the point $z$.`;
  } else {
    result = { re: a * c - b * d, im: a * d + b * c };
    const zSquares = a ** 2 + b ** 2;
    const vSquares = c ** 2 + d ** 2;
    steps = [
      `Expand $(${w.cx(z)})(${w.cx(v)})$ like two binomials, treating $i$ as a variable. The four products are $${w.n(a)} \\cdot ${w.p(c)} = ${w.n(a * c)}$, $${w.n(a)} \\cdot ${w.ip(d)} = ${w.sum([[a * d, 'i']])}$, $${w.ip(b)} \\cdot ${w.p(c)} = ${w.sum([[b * c, 'i']])}$ and $${w.ip(b)} \\cdot ${w.ip(d)} = ${w.sum([[b * d, 'i^2']])}$.`,
      exactText(b * d) === '0'
        ? 'The $i^2$ product is 0 here, so it adds nothing to the real part.'
        : `Replace $i^2$ with $-1$: $${w.sum([[b * d, 'i^2']])} = ${w.n(-b * d)}$, which is a real term.`,
      `Collect the real terms: $${w.n(a * c)} + ${w.p(-b * d)} = ${w.n(result.re)}$.`,
      `Collect the imaginary terms: $${w.n(a * d)} + ${w.p(b * c)} = ${w.n(result.im)}$, so the $i$ part is $${w.sum([[result.im, 'i']])}$.`,
      `So $(${w.cx(z)})(${w.cx(v)}) = ${w.cx(result)}$: the real part is $${w.n(result.re)}$ and the imaginary part is $${w.n(result.im)}$.`,
    ];
    why = `Magnitudes multiply, so $|zw|^2 = |z|^2 \\cdot |w|^2$. Here $|z|^2 \\cdot |w|^2 = (${w.sq(a)} + ${w.sq(b)})(${w.sq(c)} + ${w.sq(d)}) = ${w.n(zSquares)} \\cdot ${w.n(vSquares)} = ${w.n(zSquares * vSquares)}$, and the result gives $${w.sq(result.re)} + ${w.sq(result.im)} = ${w.n(result.re ** 2 + result.im ** 2)}$ — the same.`;
  }
  if (!sameComplex(result, expected)) return null;
  return {
    work: { real: w.n(expected.re), imaginary: w.n(expected.im) },
    approximate: false,
    writer: w,
    title: `Complex ${OPERATION_NAMES[operation]}`,
    items: [
      { label: 'Real part', value: w.n(expected.re) },
      { label: 'Imaginary part', value: w.n(expected.im) },
    ],
    steps,
    why,
  };
};

const division = (question) => {
  const z = complexInput(question.z, { re: 4, im: 2 });
  const v = complexInput(question.w, { re: 1, im: -1 });
  if (!z || !v) return null;
  let quotient;
  try {
    quotient = complexDivide(z, v);
  } catch {
    return null;
  }
  if (!finiteComplex(quotient)) return null;
  const w = makeWriter();
  const conjugate = complexConjugateValue(v);
  const denominator = v.re ** 2 + v.im ** 2;
  const top = complexMultiplyValues(z, conjugate);
  const real = fraction(top.re, denominator);
  const imaginary = fraction(top.im, denominator);
  if (!real || !imaginary || !close(real.value, quotient.re) || !close(imaginary.value, quotient.im)) return null;
  const realItem = fractionItem(real);
  const imaginaryItem = fractionItem(imaginary);
  // Multiplying back: w · (top) = denominator · z.
  const back = complexMultiplyValues(v, top);
  if (!sameComplex(back, { re: denominator * z.re, im: denominator * z.im })) return null;
  return {
    work: { conjugateRe: w.n(conjugate.re), conjugateIm: w.n(conjugate.im), real: realItem.answer.text, imaginary: imaginaryItem.answer.text },
    approximate: realItem.answer.approximate || imaginaryItem.answer.approximate,
    writer: w,
    title: 'Complex division',
    items: [
      { label: 'Re(w̄)', value: w.n(conjugate.re) },
      { label: 'Im(w̄)', value: w.n(conjugate.im) },
      { label: 'Quotient real part', value: realItem.value },
      { label: 'Quotient imaginary part', value: imaginaryItem.value },
    ],
    steps: [
      `The denominator is $w = ${w.cx(v)}$. Its conjugate keeps the real part and changes the sign of the imaginary part: $\\bar{w} = ${w.cx(conjugate)}$, so $\\operatorname{Re}(\\bar{w}) = ${w.n(conjugate.re)}$ and $\\operatorname{Im}(\\bar{w}) = ${w.n(conjugate.im)}$.`,
      `Multiply the top and the bottom by $\\bar{w}$ — that is multiplying by 1, so the value does not change: $\\frac{${w.cx(z)}}{${w.cx(v)}} \\cdot \\frac{${w.cx(conjugate)}}{${w.cx(conjugate)}}$.`,
      `Bottom: $(${w.cx(v)})(${w.cx(conjugate)}) = ${w.sq(v.re)} + ${w.sq(v.im)} = ${w.n(denominator)}$ — the $i$ terms cancel, leaving the real number $|w|^2$.`,
      `Top: $(${w.cx(z)})(${w.cx(conjugate)}) = ${w.expand(z, conjugate)}$. ${exactText(z.im * conjugate.im) === '0' ? 'Collect' : 'Replace $i^2$ with $-1$ and collect'}: real part $${w.n(z.re * conjugate.re)} + ${w.p(-z.im * conjugate.im)} = ${w.n(top.re)}$, imaginary part $${w.n(z.re * conjugate.im)} + ${w.p(z.im * conjugate.re)} = ${w.n(top.im)}$, so the top is $${w.cx(top)}$.`,
      `Divide both parts by $${w.n(denominator)}$: the real part is $${divisionChain(w, top.re, denominator, real)}$ and the imaginary part is $${divisionChain(w, top.im, denominator, imaginary)}$.`,
    ],
    why: `Multiplying back gives $z$: $w \\cdot \\frac{${w.cx(top)}}{${w.n(denominator)}} = \\frac{(${w.cx(v)})(${w.cx(top)})}{${w.n(denominator)}} = \\frac{${w.cx(back)}}{${w.n(denominator)}} = ${w.cx(z)}$, which is $z$.`,
  };
};

// The multiplications that build zᵐ (m ≥ 2): one factor at a time up to 6,
// by squaring above that, so the steps stay few. [k, i, j] means zᵏ = zⁱ·zʲ.
const powerPlan = (m) => {
  const plan = [];
  if (m <= 6) {
    for (let k = 2; k <= m; k += 1) plan.push([k, k - 1, 1]);
    return plan;
  }
  let square = 1;
  while (square * 2 <= m) {
    plan.push([square * 2, square, square]);
    square *= 2;
  }
  let built = square;
  for (let bit = square / 2; bit >= 1; bit /= 2) {
    if (built + bit <= m) {
      plan.push([built + bit, built, bit]);
      built += bit;
    }
  }
  return plan;
};

const powers = (question) => {
  const z = complexInput(question.z, { re: 1, im: 1 });
  if (!z) return null;
  const exponent = Number(question.exponent ?? 3);
  if (!Number.isInteger(exponent) || Math.abs(exponent) > MAX_POWER) return null;
  if (z.re === 0 && z.im === 0 && exponent <= 0) return null;
  let expected;
  try {
    expected = complexPower(z, exponent);
  } catch {
    return null;
  }
  if (!finiteComplex(expected)) return null;
  const expectedMagnitude = complexMagnitudeValue(expected);
  const m = Math.abs(exponent);
  // Every power the steps print stays an exact short decimal.
  const places = Math.max(decimalsOf(exactText(z.re)), decimalsOf(exactText(z.im)));
  if (places * m > 4) return null;
  const w = makeWriter();
  const zTo = (k) => `z^{${k}}`;
  const label = `|z${superscript(exponent)}|`;

  if (exponent === 0) {
    return {
      work: { real: '1', imaginary: '0', magnitude: '1' },
      approximate: false,
      writer: w,
      title: 'Complex power',
      items: [
        { label: 'Real part', value: '1' },
        { label: 'Imaginary part', value: '0' },
        { label, value: '1' },
      ],
      steps: [
        `Any nonzero number raised to the power 0 is 1, so $${zTo(0)} = (${w.cx(z)})^{0} = 1$.`,
        'As a complex number that is $1 + 0i$: the real part is $1$ and the imaginary part is $0$.',
        `Its distance from the origin is $|${zTo(0)}| = \\sqrt{1^2 + 0^2} = 1$.`,
      ],
      why: `$${zTo(0)} = \\frac{z^{1}}{z^{1}} = 1$ for any $z \\ne 0$, and the magnitude follows the same rule: $|z|^{0} = 1$.`,
    };
  }

  const built = { 1: z };
  const steps = [m === 1
    ? `A power of 1 is the number itself: $${zTo(1)} = ${w.cx(z)}$.`
    : m <= 6
      ? `Build $${zTo(m)}$ by multiplying by $z = ${w.cx(z)}$ one factor at a time; expand each product and replace $i^2$ with $-1$.`
      : `Build $${zTo(m)}$ from repeated squares of $z = ${w.cx(z)}$, because $z^{a} \\cdot z^{b} = z^{a+b}$; expand each product and replace $i^2$ with $-1$.`];
  powerPlan(m).forEach(([k, i, j]) => {
    built[k] = complexMultiplyValues(built[i], built[j]);
    const expansion = w.expand(built[i], built[j]);
    const result = w.cx(built[k]);
    steps.push(`$${zTo(k)} = ${zTo(i)} \\cdot ${zTo(j)} = (${w.cx(built[i])})(${w.cx(built[j])}) = ${expansion}${expansion === result ? '' : ` = ${result}`}$.`);
  });
  const positive = built[m];
  const positiveSquares = positive.re ** 2 + positive.im ** 2;
  const positiveRoot = rootInfo(positiveSquares);
  const zRoot = rootInfo(z.re ** 2 + z.im ** 2);
  if (!positive || !positiveRoot || !zRoot) return null;

  if (exponent > 0) {
    if (!sameComplex(positive, expected) || !close(positiveRoot.value, expectedMagnitude)) return null;
    const magnitudeItem = positiveRoot.rational
      ? { value: positiveRoot.latex, answer: { text: positiveRoot.latex, approximate: false } }
      : approximateItem(positiveRoot.latex === positiveRoot.plain ? positiveRoot.plain : `${positiveRoot.plain} = ${positiveRoot.latex}`, expectedMagnitude);
    steps.push(`Its distance from the origin: $|${zTo(m)}| = \\sqrt{${w.sq(positive.re)} + ${w.sq(positive.im)}} = ${rootChain(positiveRoot)}$.`);
    return {
      work: { real: w.n(expected.re), imaginary: w.n(expected.im), magnitude: magnitudeItem.answer.text },
      approximate: magnitudeItem.answer.approximate,
      writer: w,
      title: 'Complex power',
      items: [
        { label: 'Real part', value: w.n(expected.re) },
        { label: 'Imaginary part', value: w.n(expected.im) },
        { label, value: magnitudeItem.value },
      ],
      steps,
      why: `Magnitudes multiply, so $|${zTo(m)}| = |z|^{${m}}$. Here $|z| = ${zRoot.latex}$, and $${parenthesized(zRoot.latex)}^{${m}} ${magnitudeItem.answer.approximate ? '\\approx' : '='} ${magnitudeItem.answer.text}$ — the same distance found above.`,
    };
  }

  // z^(−m) = 1 / z^m, rationalized by the conjugate of z^m.
  const conjugate = complexConjugateValue(positive);
  const real = fraction(conjugate.re, positiveSquares);
  const imaginary = fraction(conjugate.im, positiveSquares);
  if (!real || !imaginary || !close(real.value, expected.re) || !close(imaginary.value, expected.im)) return null;
  if (!close(1 / positiveRoot.value, expectedMagnitude)) return null;
  const realItem = fractionItem(real);
  const imaginaryItem = fractionItem(imaginary);
  let magnitudeItem;
  let reciprocal = `\\frac{1}{${positiveRoot.plain}}`;
  if (positiveRoot.rational) {
    const inverse = fraction(1, Number(positiveRoot.latex));
    if (!inverse) return null;
    const head = `\\frac{1}{${positiveRoot.latex}}`;
    reciprocal += ` = ${head}`;
    if (inverse.latex !== head) reciprocal += ` = ${inverse.latex}`;
    if (!inverse.isInteger) reciprocal += inverse.decimal !== null ? ` = ${inverse.decimal}` : ` \\approx ${roundedText(inverse.value)}`;
    magnitudeItem = fractionItem(inverse);
  } else {
    const shown = positiveRoot.latex !== positiveRoot.plain ? `\\frac{1}{${positiveRoot.latex}}` : reciprocal;
    if (shown !== reciprocal) reciprocal += ` = ${shown}`;
    reciprocal += ` \\approx ${roundedText(expectedMagnitude)}`;
    magnitudeItem = approximateItem(shown, expectedMagnitude);
  }
  steps.push(
    `A negative exponent means a reciprocal: $${zTo(exponent)} = \\frac{1}{${zTo(m)}} = \\frac{1}{${w.cx(positive)}}$.`,
    `Multiply the top and the bottom by the conjugate $${w.cx(conjugate)}$: the bottom becomes $(${w.cx(positive)})(${w.cx(conjugate)}) = ${w.sq(positive.re)} + ${w.sq(positive.im)} = ${w.n(positiveSquares)}$, so $${zTo(exponent)} = \\frac{${w.cx(conjugate)}}{${w.n(positiveSquares)}}$.`,
    `Divide both parts by $${w.n(positiveSquares)}$: the real part is $${divisionChain(w, conjugate.re, positiveSquares, real)}$ and the imaginary part is $${divisionChain(w, conjugate.im, positiveSquares, imaginary)}$.`,
    `Its distance from the origin is the reciprocal of $|${zTo(m)}|$: $|${zTo(exponent)}| = \\frac{1}{|${zTo(m)}|} = ${reciprocal}$.`,
  );
  return {
    work: { real: realItem.answer.text, imaginary: imaginaryItem.answer.text, magnitude: magnitudeItem.answer.text },
    approximate: realItem.answer.approximate || imaginaryItem.answer.approximate || magnitudeItem.answer.approximate,
    writer: w,
    title: 'Complex power',
    items: [
      { label: 'Real part', value: realItem.value },
      { label: 'Imaginary part', value: imaginaryItem.value },
      { label, value: magnitudeItem.value },
    ],
    steps,
    why: `Multiplying back by $${zTo(m)}$ gives 1, as a reciprocal must: $\\frac{${w.cx(conjugate)}}{${w.n(positiveSquares)}} \\cdot (${w.cx(positive)}) = \\frac{${w.n(positiveSquares)}}{${w.n(positiveSquares)}} = 1$.`,
  };
};

const rotation = (question) => {
  const z = complexInput(question.z, { re: 3, im: 1 });
  if (!z) return null;
  const turns = Number(question.quarterTurns ?? 1);
  if (!Number.isSafeInteger(turns)) return null;
  let expected;
  try {
    expected = rotateByPowerOfI(z, turns);
  } catch {
    return null;
  }
  if (!finiteComplex(expected)) return null;
  const k = normalizedQuarterTurns(turns);
  if (![0, 1, 2, 3].includes(k)) return null;
  const { re: a, im: b } = z;
  const result = [{ re: a, im: b }, { re: -b, im: a }, { re: -a, im: -b }, { re: b, im: -a }][k];
  if (!sameComplex(result, expected)) return null;
  const w = makeWriter();
  const shown = turns === 0 ? 0 : turns;
  const groups = (shown - k) / 4;
  const reduce = shown >= 0 && shown <= 3
    ? `The exponent is already between 0 and 3, so $i^{${shown}} = ${I_POWERS[k]}$.`
    : `Powers of $i$ repeat every four because $i^4 = 1$, so reduce the exponent modulo 4: $${shown} = 4(${groups}) + ${k}$, so $i^{${shown}} = (i^4)^{${groups}} \\cdot i^{${k}} = i^{${k}} = ${I_POWERS[k]}$.`;
  const meaning = [
    'Multiplying by $1$ leaves every point where it is: there is no net rotation.',
    'Multiplying by $i$ turns a point 90° counterclockwise about the origin, so the net rotation is 90° counterclockwise.',
    'Multiplying by $i^2 = -1$ is two counterclockwise quarter-turns — a 180° turn about the origin.',
    'Multiplying by $i^3 = -i$ is three counterclockwise quarter-turns, which ends where one clockwise quarter-turn does: 90° clockwise.',
  ][k];
  // "left = middle = right", a middle step that only repeats the result left out.
  const equation = (left, middle, right) => [left, ...(middle === right ? [] : [middle]), right].join(' = ');
  const product = [
    `$${equation(`1 \\cdot (${w.cx(z)})`, w.cx(result), w.cx(result))}$.`,
    `$${equation(`i(${w.cx(z)})`, w.sum([[a, 'i'], [b, 'i^2']]), w.cx(result))}$${exactText(b) === '0' ? '' : ', using $i^2 = -1$'}.`,
    `$${equation(`-1 \\cdot (${w.cx(z)})`, w.cx(result), w.cx(result))}$.`,
    `$${equation(`-i(${w.cx(z)})`, w.sum([[-a, 'i'], [-b, 'i^2']]), w.cx(result))}$${exactText(b) === '0' ? '' : ', using $i^2 = -1$'}.`,
  ][k];
  const netRotation = ['there is no net rotation', 'the net rotation is 90° counterclockwise', 'the net rotation is 180°', 'the net rotation is 90° clockwise'][k];
  const perpendicular = ` The two arrows are also perpendicular — $${w.p(a)} \\cdot ${w.p(result.re)} + ${w.p(b)} \\cdot ${w.p(result.im)} = 0$ — so the turn is a quarter-turn.`;
  const shape = a === 0 && b === 0
    ? ' The origin stays where it is under every rotation.'
    : [' Multiplying by 1 changes nothing.', perpendicular, ' The result is $-z$, on the opposite side of the origin — a half-turn.', perpendicular][k];
  return {
    work: { real: w.n(result.re), imaginary: w.n(result.im), rotation: String(k) },
    approximate: false,
    writer: w,
    title: 'Rotation by a power of i',
    items: [
      { label: 'Result real part', value: w.n(result.re) },
      { label: 'Result imaginary part', value: w.n(result.im) },
      { label: 'Net rotation', value: ROTATION_CHOICES[k] },
    ],
    steps: [
      reduce,
      meaning,
      `Multiply: ${product}`,
      `So the point $(${w.n(a)}, ${w.n(b)})$ moves to $(${w.n(result.re)}, ${w.n(result.im)})$: the result's real part is $${w.n(result.re)}$, its imaginary part is $${w.n(result.im)}$, and ${netRotation}.`,
    ],
    why: `A rotation about the origin keeps the distance: $|z|^2 = ${w.sq(a)} + ${w.sq(b)} = ${w.n(a ** 2 + b ** 2)}$, and the result gives $${w.sq(result.re)} + ${w.sq(result.im)} = ${w.n(result.re ** 2 + result.im ** 2)}$ too.${shape}`,
  };
};

// √E / (2|a|) as LaTeX with its value: "2", "\frac{3}{2}", "\sqrt{2}", "\frac{\sqrt{3}}{2}".
const halfRoot = (radicand, twoA) => {
  const root = rootInfo(radicand);
  if (!root) return null;
  if (root.rational) {
    const f = fraction(Number(root.latex), twoA);
    return f ? { ...f, rational: true, root } : null;
  }
  const value = root.value / twoA;
  if (root.outside !== null) {
    const coefficient = fraction(root.outside, twoA);
    if (!coefficient) return null;
    const surd = `${coefficient.numeratorText === '1' ? '' : coefficient.numeratorText}\\sqrt{${root.inside}}`;
    return { value, latex: coefficient.isInteger ? surd : `\\frac{${surd}}{${coefficient.denominatorText}}`, decimal: null, rational: false, root };
  }
  const bottom = exactText(twoA);
  if (bottom === null) return null;
  return { value, latex: bottom === '1' ? root.latex : `\\frac{${root.latex}}{${bottom}}`, decimal: null, rational: false, root };
};

// "x = −1 ± 2i" — the pair as the formula gives it.
const plusMinus = (center, partLatex) => (center.latex === '0' ? `\\pm ${partLatex}` : `${center.latex} \\pm ${partLatex}`);
const withSign = (center, sign, partLatex) => (center.latex === '0'
  ? `${sign === '-' ? '-' : ''}${partLatex}`
  : `${center.latex} ${sign} ${partLatex}`);

const quadraticRoots = (question) => {
  const source = question.quadratic;
  const a = Number(source?.a ?? 1);
  const b = Number(source?.b ?? 2);
  const c = Number(source?.c ?? 5);
  if (![a, b, c].every(inputOk)) return null;
  let roots;
  try {
    roots = quadraticRootsComplex({ a, b, c });
  } catch {
    return null;
  }
  if (!Array.isArray(roots) || roots.length !== 2 || !roots.every(finiteComplex)) return null;
  const w = makeWriter();
  // Exact: at most four decimal places from two-place coefficients.
  const discriminant = snapped(b ** 2 - 4 * a * c);
  const twoA = 2 * a;
  const fourASquared = snapped(4 * a ** 2);
  const center = fraction(-b, twoA);
  const sumValue = fraction(-b, a);
  const productValue = fraction(c, a);
  const centerSquared = fraction(snapped(b ** 2), fourASquared);
  if (!Number.isFinite(discriminant) || !center || !sumValue || !productValue || !centerSquared) return null;
  const centerParen = parenthesized(center.latex);
  const vieta = 'Check against the equation: the roots of $ax^2 + bx + c = 0$ add to $-\\frac{b}{a}$ and multiply to $\\frac{c}{a}$.';
  const steps = [
    `Compare $${w.sum([[a, 'x^2'], [b, 'x'], [c, '']])} = 0$ with $ax^2 + bx + c = 0$: $a = ${w.n(a)}$, $b = ${w.n(b)}$ and $c = ${w.n(c)}$.`,
    `Discriminant: $b^2 - 4ac = ${w.sq(b)} - 4(${w.n(a)})(${w.n(c)}) = ${w.n(b ** 2)} - ${w.p(4 * a * c)} = ${w.n(discriminant)}$.`,
  ];
  let first;
  let second;
  let why;

  if (discriminant < 0) {
    const h = halfRoot(-discriminant, Math.abs(twoA));
    const hSquared = fraction(-discriminant, fourASquared);
    if (!h || !hSquared) return null;
    const rootI = h.root.rational ? `${h.root.latex === '1' ? '' : h.root.latex}i` : `${h.root.latex}\\,i`;
    const iPart = h.latex === '1' ? 'i' : h.rational && !h.latex.includes('\\') ? `${h.latex}i` : `${h.latex}\\,i`;
    const rootValue = h.root.rational ? '' : ` \\approx ${roundedText(h.root.value)}i`;
    steps.push(
      `It is negative, so the square root is imaginary: $\\sqrt{${w.n(discriminant)}} = i\\sqrt{${w.n(-discriminant)}} = ${rootI}${rootValue}$.`,
      `Quadratic formula: $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} = \\frac{${w.n(-b)} \\pm ${rootI}}{${w.n(twoA)}} = ${plusMinus(center, iPart)}$.`,
      `So the roots are $${withSign(center, '+', iPart)}$ and $${withSign(center, '-', iPart)}$: enter each as a real part and an imaginary part, in either order.`,
    );
    const centerItem = fractionItem(center);
    const up = h.rational ? fractionItem(h) : approximateItem(h.latex, h.value);
    const down = h.rational ? fractionItem(negated(h)) : approximateItem(`-${h.latex}`, -h.value);
    first = { re: centerItem, im: up };
    second = { re: centerItem, im: down };
    why = `${vieta} These two add to $2 \\cdot ${centerParen} = ${sumValue.latex}$ (the $\\pm$ parts cancel) and multiply to $${centerParen}^2 + ${parenthesized(h.latex)}^2 = ${centerSquared.latex} + ${hSquared.latex} = ${productValue.latex}$ — exactly $-\\frac{b}{a}$ and $\\frac{c}{a}$.`;
  } else {
    const h = halfRoot(discriminant, Math.abs(twoA));
    const hSquared = fraction(discriminant, fourASquared);
    if (!h || !hSquared) return null;
    const zero = { value: '0', answer: { text: '0', approximate: false } };
    if (h.rational) {
      const rootValue = Number(h.root.latex);
      const r1 = fraction(snapped(-b + rootValue), twoA);
      const r2 = fraction(snapped(-b - rootValue), twoA);
      if (!r1 || !r2) return null;
      first = { re: fractionItem(r1), im: zero };
      second = { re: fractionItem(r2), im: zero };
      if (discriminant === 0) {
        steps.push(
          'It is 0, so the square-root part is 0 and both roots are the same real number, with imaginary part 0.',
          `Quadratic formula: $x = \\frac{-b}{2a} = \\frac{${w.n(-b)}}{${w.n(twoA)}} = ${r1.latex}$.`,
          `So both roots are $${r1.latex}$: enter real part $${first.re.answer.text}$ and imaginary part $0$ for each.`,
        );
      } else {
        steps.push(
          `It is positive, so both roots are real numbers, each with imaginary part 0: $\\sqrt{${w.n(discriminant)}} = ${h.root.latex}$.`,
          `Quadratic formula: $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} = \\frac{${w.n(-b)} \\pm ${h.root.latex}}{${w.n(twoA)}}$, so $x = \\frac{${w.n(-b + rootValue)}}{${w.n(twoA)}} = ${r1.latex}$ or $x = \\frac{${w.n(-b - rootValue)}}{${w.n(twoA)}} = ${r2.latex}$.`,
          `So the roots are $${r1.latex}$ and $${r2.latex}$, each with imaginary part 0, in either order.`,
        );
      }
    } else {
      const join = (sign) => withSign(center, sign, h.latex);
      first = { re: approximateItem(join('+'), center.value + h.value), im: zero };
      second = { re: approximateItem(join('-'), center.value - h.value), im: zero };
      steps.push(
        `It is positive, so both roots are real numbers, each with imaginary part 0: $${rootChain(h.root)}$.`,
        `Quadratic formula: $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} = \\frac{${w.n(-b)} \\pm ${h.root.latex}}{${w.n(twoA)}} = ${plusMinus(center, h.latex)}$.`,
        `So the roots are $${join('+')} \\approx ${first.re.answer.text}$ and $${join('-')} \\approx ${second.re.answer.text}$, each with imaginary part 0, in either order.`,
      );
    }
    why = discriminant === 0
      ? `${vieta} The repeated root gives $2 \\cdot ${centerParen} = ${sumValue.latex}$ and $${centerParen}^2 = ${centerSquared.latex}${centerSquared.latex === productValue.latex ? '' : ` = ${productValue.latex}`}$ — exactly $-\\frac{b}{a}$ and $\\frac{c}{a}$.`
      : `${vieta} These two add to $2 \\cdot ${centerParen} = ${sumValue.latex}$ (the $\\pm$ parts cancel) and multiply to $${centerParen}^2 - ${parenthesized(h.latex)}^2 = ${centerSquared.latex} - ${hSquared.latex} = ${productValue.latex}$ — exactly $-\\frac{b}{a}$ and $\\frac{c}{a}$.`;
  }
  return {
    work: { r1Re: first.re.answer.text, r1Im: first.im.answer.text, r2Re: second.re.answer.text, r2Im: second.im.answer.text },
    approximate: [first.re, first.im, second.re, second.im].some((item) => item.answer.approximate),
    note: 'The two roots can be entered in either order.',
    writer: w,
    title: 'Roots of a quadratic',
    items: [
      { label: 'Root 1 real', value: first.re.value },
      { label: 'Root 1 imaginary', value: first.im.value },
      { label: 'Root 2 real', value: second.re.value },
      { label: 'Root 2 imaginary', value: second.im.value },
    ],
    steps,
    why,
  };
};

const BUILDERS = Object.freeze({ features, operations, division, powers, rotation, quadraticRoots });

// The fields the lab reads. A question with none of them is an empty shell
// the lab fills with demo defaults, not a question anyone wrote: no review.
const AUTHORED_FIELDS = Object.freeze(['mode', 'z', 'w', 'operation', 'exponent', 'quarterTurns', 'quadratic']);
const isAuthored = (question) => AUTHORED_FIELDS.some((key) => question[key] !== undefined && question[key] !== null && question[key] !== '');

/*
 * The review, or null. The answers it states are graded by the shared grader
 * before anything is returned: a review the grader would mark wrong is never
 * shown.
 */
export const buildComplexPlaneLabReview = (question) => {
  try {
    if (!question || typeof question !== 'object' || Array.isArray(question) || !isAuthored(question)) return null;
    const mode = resolveToolMode(complexPlaneGrader.declaration, question);
    if (mode !== labMode(question) || !Object.prototype.hasOwnProperty.call(BUILDERS, mode)) return null;
    const built = BUILDERS[mode](question);
    if (!built || !built.writer.ok()) return null;
    const verdict = complexPlaneGrader.grade(question, built.work);
    if (!verdict || verdict.graded !== true || verdict.isCorrect !== true) return null;
    const notes = [built.note, built.approximate ? ROUNDING_NOTE : null].filter(Boolean);
    return {
      title: built.title,
      items: built.items,
      steps: built.steps,
      why: built.why || null,
      note: notes.length ? notes.join(' ') : null,
    };
  } catch {
    return null;
  }
};

export default buildComplexPlaneLabReview;
