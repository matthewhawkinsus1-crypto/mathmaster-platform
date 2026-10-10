// Worked solution review for parabolaGeometryLab (contract: ../toolSolutionReview.js, textOnlyReview).
/*
 * THE PARABOLA GEOMETRY LAB'S WORKED SOLUTION — THE ANSWER ITS GRADER ACCEPTS.
 *
 * Every view of the lab is marked by the shared grader
 * (functions/shared/serverGrading/tools/parabolaGeometryLab.mjs) against ONE
 * key recomputed from the question, so every view has a single correct answer
 * and every view gets a review:
 *
 *   features      focus x, focus y, the directrix value and the latus rectum
 *                 length 4|p|, from the vertex (h, k), p and the orientation;
 *   equidistance  the distance from P to the focus, the perpendicular distance
 *                 from P to the directrix, and whether P is on the parabola;
 *   fromGeometry  the vertex h, k and the signed p, from a focus and a
 *                 horizontal or vertical directrix;
 *   equation      the coefficient 4p of the standard form and the opening.
 *
 * The view, the defaults for anything the question leaves out (features
 * h=1, k=−1, p=2; equidistance h=0, k=0, p=2 with P sampled at offset 4;
 * fromGeometry focus (2, 3) and directrix y = −1; equation h=−2, k=1,
 * p=1.5; orientation vertical) and the key all come from the grader's own
 * declaration and mathematics (parabolaGeometryMath.mjs). The review then does
 * the same arithmetic EXACTLY — every authored number is a decimal, so every
 * value here is a fraction — and states a number only when it agrees with the
 * grader's key. Before it is returned, the work it states (the numbers as a
 * student would type them, the Yes/No, the opening) is graded by that grader
 * through the bytes the server reads (gradeWorkWithGrader). Anything the
 * grader would not call correct makes the whole review null.
 *
 * Null — never a guess — when:
 *   - the question sets nothing the view reads: the lab's demonstration values
 *     are not a question a teacher wrote;
 *   - the lab cannot render the question (p = 0 or not a number, a point that
 *     is not a list) or no answer can be right (a focus on its own directrix);
 *   - a number is not a decimal with at most 6 places, or an authored focus,
 *     directrix or point is not written as numbers — P exactly two of them —
 *     (the screen would show something other than the value the grader uses);
 *   - P is so close to the parabola that the grader's tolerance and the exact
 *     arithmetic disagree, or its two distances only differ past the second
 *     decimal place — the explanation would not be honest.
 *
 * Shown only once the question is closed (QuestionEngine); pure, no React.
 */
import parabolaGeometryGrader from '../../../../functions/shared/serverGrading/tools/parabolaGeometryLab.mjs';
import { gradeWorkWithGrader } from '../../../../functions/shared/serverGrading/toolWorkGrading.mjs';
import { round } from '../../../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  geometryFromFocusDirectrix,
  parabolaFeatures,
  pointDistances,
  sampleParabolaPoint,
  standardEquationParts,
} from '../../../../functions/shared/toolMath/parabolaGeometry/parabolaGeometryMath.mjs';

export const implemented = true;

const MINUS = '−';

/* ------------------------------------------------------- exact fractions */

const gcd = (a, b) => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x || 1;
};
// A reduced fraction { n, d } with d > 0, or null once a value leaves the safe
// integers (the review then states nothing).
const frac = (n, d = 1) => {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || d === 0) return null;
  const sign = d < 0 ? -1 : 1;
  const g = gcd(n, d);
  const num = (sign * n) / g;
  return { n: num === 0 ? 0 : num, d: (sign * d) / g };
};
const all = (...values) => values.every((value) => value && typeof value === 'object');
const add = (a, b) => (all(a, b) ? frac(a.n * b.d + b.n * a.d, a.d * b.d) : null);
const neg = (a) => (all(a) ? frac(-a.n, a.d) : null);
const sub = (a, b) => add(a, neg(b));
const mul = (a, b) => (all(a, b) ? frac(a.n * b.n, a.d * b.d) : null);
const div = (a, b) => (all(a, b) && b.n !== 0 ? frac(a.n * b.d, a.d * b.n) : null);
const abs = (a) => (all(a) ? frac(Math.abs(a.n), a.d) : null);
const int = (value) => frac(value, 1);
const same = (a, b) => all(a, b) && a.n === b.n && a.d === b.d;
const toFloat = (a) => a.n / a.d;
// The exact value agrees with the grader's floating-point key.
const agrees = (a, key) => all(a) && Number.isFinite(Number(key))
  && Math.abs(toFloat(a) - Number(key)) <= 1e-9 * Math.max(1, Math.abs(Number(key)));

// A number exactly as a decimal with at most 6 places, else null.
const exactNumber = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const match = /^(-?)(\d+)(?:\.(\d{1,6}))?$/.exec(String(number));
  if (!match) return null;
  const decimals = match[3] || '';
  return frac(Number(`${match[1]}${match[2]}${decimals}`), 10 ** decimals.length);
};
// A focus, directrix or point entry the screen prints as written: a number, or
// a string that is plainly one.
const authoredNumber = (value) => {
  if (typeof value === 'number') return exactNumber(value);
  if (typeof value === 'string' && /^\s*-?(?:\d+(?:\.\d+)?|\.\d+)\s*$/.test(value)) return exactNumber(value);
  return null;
};

// The square root of a fraction when it is itself a fraction, else null.
const exactRoot = (a) => {
  if (!all(a) || a.n < 0) return null;
  const n = Math.round(Math.sqrt(a.n));
  const d = Math.round(Math.sqrt(a.d));
  return n * n === a.n && d * d === a.d ? frac(n, d) : null;
};

/* ------------------------------------------------------------ number text */

const decimalPlaces = (d) => {
  for (let places = 0; places <= 6; places += 1) if ((10 ** places) % d === 0) return places;
  return null;
};
// A terminating decimal written out digit by digit, or null.
const decimalText = (a) => {
  const places = decimalPlaces(a.d);
  if (places === null) return null;
  const scaled = a.n * ((10 ** places) / a.d);
  if (!Number.isSafeInteger(scaled)) return null;
  const digits = String(Math.abs(scaled)).padStart(places + 1, '0');
  const body = places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits;
  return `${scaled < 0 ? '-' : ''}${body}`;
};
const isDecimal = (a) => decimalText(a) !== null;

// LaTeX for a value; after an operator a negative (or a fraction) is bracketed.
const tex = (a) => decimalText(a) ?? `${a.n < 0 ? '-' : ''}\\frac{${Math.abs(a.n)}}{${a.d}}`;
const operand = (a) => {
  if (!isDecimal(a)) return `\\left(${tex(a)}\\right)`;
  return a.n < 0 ? `(${tex(a)})` : tex(a);
};
const squared = (a) => (a.n < 0 || !isDecimal(a) ? `${isDecimal(a) ? `(${tex(a)})` : `\\left(${tex(a)}\\right)`}^2` : `${tex(a)}^2`);
// "x − h" with the sign of h folded in: x − 2, x + 2, or x alone.
const shifted = (variable, a) => {
  if (a.n === 0) return variable;
  return a.n > 0 ? `${variable} - ${tex(a)}` : `${variable} + ${tex(abs(a))}`;
};
const point = (x, y) => `(${tex(x)}, ${tex(y)})`;

// What a student types for an exact value: the decimal, or n/d (the lab reads
// fractions).
const typed = (a) => decimalText(a) ?? `${a.n}/${a.d}`;
const approx = (value) => String(Number(Number(value).toFixed(2))).replace(/^-/, MINUS);
const plain = (text) => String(text).replace(/^-/, MINUS);
// The value shown in the results list: exact, with a decimal beside a fraction.
const stated = (a) => (isDecimal(a) ? plain(typed(a)) : `${plain(typed(a))} ≈ ${approx(toFloat(a))}`);

/* -------------------------------------------------------------- geometry */

// The question's vertex, p and orientation exactly as the grader reads them.
const vertexSpec = (question, defaults) => ({
  h: Number(question.h ?? defaults.h),
  k: Number(question.k ?? defaults.k),
  p: Number(question.p ?? defaults.p),
  orientation: question.orientation || 'vertical',
});

const exactSpec = (spec) => {
  const h = exactNumber(spec.h);
  const k = exactNumber(spec.k);
  const p = exactNumber(spec.p);
  if (!all(h, k, p) || p.n === 0) return null;
  return { h, k, p, vertical: spec.orientation !== 'horizontal' };
};

// Focus, directrix and latus rectum, exactly: the grader's parabolaFeatures.
const exactFeatures = ({ h, k, p, vertical }) => ({
  focus: vertical ? [h, add(k, p)] : [add(h, p), k],
  directrix: vertical ? sub(k, p) : sub(h, p),
  latus: mul(int(4), abs(p)),
});

const openingOf = ({ p, vertical }) => (vertical ? (p.n > 0 ? 'up' : 'down') : (p.n > 0 ? 'right' : 'left'));
const SIDE = Object.freeze({ up: 'above', down: 'below', right: 'to the right of', left: 'to the left of' });

const axisSentence = (exact) => {
  const { h, k, p, vertical } = exact;
  const axis = vertical ? `the vertical line $x = ${tex(h)}$` : `the horizontal line $y = ${tex(k)}$`;
  return `The vertex is $${point(h, k)}$ and $p = ${tex(p)}$. The axis of symmetry is ${axis} through the vertex, and since p is ${p.n > 0 ? 'positive' : 'negative'} the parabola opens ${openingOf(exact)}, toward the focus.`;
};

// The standard form with this question's vertex: (x − h)² = 4p(y − k), with
// 4p left as "4p" (`symbolic`) or written as its value.
const standardForm = ({ h, k, p, vertical }, { symbolic = false } = {}) => {
  const [squaredVariable, squaredShift, linearVariable, linearShift] = vertical ? ['x', h, 'y', k] : ['y', k, 'x', h];
  const left = squaredShift.n === 0 ? `${squaredVariable}^2` : `(${shifted(squaredVariable, squaredShift)})^2`;
  const inner = shifted(linearVariable, linearShift);
  const bare = linearShift.n === 0;
  if (symbolic) return `${left} = ${bare ? `4p${inner}` : `4p(${inner})`}`;
  const coefficient = mul(int(4), p);
  let right;
  if (coefficient.n === coefficient.d) right = inner;
  else if (coefficient.n === -coefficient.d) right = bare ? `-${inner}` : `-(${inner})`;
  else right = bare ? `${tex(coefficient)}${inner}` : `${tex(coefficient)}(${inner})`;
  return `${left} = ${right}`;
};
const symbolicForm = (vertical) => (vertical ? '(x - h)^2 = 4p(y - k)' : '(y - k)^2 = 4p(x - h)');

// Substitute a point into the standard form: both sides, exactly.
const substitute = ({ h, k, p, vertical }, x, y) => {
  const [squaredValue, squaredShift, linearValue, linearShift] = vertical ? [x, h, y, k] : [y, k, x, h];
  const coefficient = mul(int(4), p);
  const left = mul(sub(squaredValue, squaredShift), sub(squaredValue, squaredShift));
  const right = mul(coefficient, sub(linearValue, linearShift));
  if (!all(left, right)) return null;
  const leftText = squaredShift.n === 0 ? squared(squaredValue) : `(${shifted(tex(squaredValue), squaredShift)})^2`;
  const rightText = `${tex(coefficient)}(${shifted(tex(linearValue), linearShift)})`;
  return { left, right, text: `$${leftText} = ${tex(left)}$ and $${rightText} = ${tex(right)}$` };
};

/* ----------------------------------------------------------------- views */

const featuresReview = (question) => {
  const spec = vertexSpec(question, { h: 1, k: -1, p: 2 });
  const key = parabolaFeatures(spec);
  const exact = exactSpec(spec);
  if (!exact) return null;
  const { h, k, p, vertical } = exact;
  const result = exactFeatures(exact);
  const [fx, fy] = result.focus;
  if (!all(fx, fy, result.directrix, result.latus)) return null;
  if (!agrees(fx, key.focus[0]) || !agrees(fy, key.focus[1]) || !agrees(result.directrix, key.directrix.value)
    || !agrees(result.latus, key.latusRectumLength)) return null;
  const line = vertical ? 'y' : 'x';
  const twoP = mul(int(2), abs(p));
  const ends = vertical
    ? [[sub(h, twoP), fy], [add(h, twoP), fy]]
    : [[fx, sub(k, twoP)], [fx, add(k, twoP)]];
  const end = ends[1];
  if (!all(twoP, ...ends.flat())) return null;
  const focusStep = vertical
    ? `The focus is on the axis, $|p| = ${tex(abs(p))}$ from the vertex on the side the parabola opens: add p to the y-coordinate of the vertex, $${point(h, fy)}$ because $${tex(k)} + ${operand(p)} = ${tex(fy)}$.`
    : `The focus is on the axis, $|p| = ${tex(abs(p))}$ from the vertex on the side the parabola opens: add p to the x-coordinate of the vertex, $${point(fx, k)}$ because $${tex(h)} + ${operand(p)} = ${tex(fx)}$.`;
  const directrixStep = `The directrix is the line perpendicular to the axis, $|p|$ from the vertex on the other side: subtract p, $${line} = ${tex(vertical ? k : h)} - ${operand(p)} = ${tex(result.directrix)}$.`;
  const latusStep = `The latus rectum is the chord through the focus perpendicular to the axis. Its length is $4|p| = 4 \\cdot ${tex(abs(p))} = ${tex(result.latus)}$.`;
  const endToDirectrix = vertical ? sub(fy, result.directrix) : sub(fx, result.directrix);
  const midpoint = div(add(vertical ? fy : fx, result.directrix), int(2));
  if (!all(endToDirectrix, midpoint)) return null;
  const why = `Check with an end of the latus rectum, $${point(...end)}$: it is $2|p| = ${tex(twoP)}$ from the focus $${point(fx, fy)}$ and $|${tex(vertical ? fy : fx)} - ${operand(result.directrix)}| = ${tex(abs(endToDirectrix))}$ from the directrix $${line} = ${tex(result.directrix)}$. Equal distances put it on the parabola, and the two ends $${point(...ends[0])}$ and $${point(...ends[1])}$ are $${tex(result.latus)}$ apart. The vertex is halfway between the focus and the directrix too: $\\frac{${tex(vertical ? fy : fx)} + ${operand(result.directrix)}}{2} = ${tex(midpoint)}$.`;
  return {
    work: { focusX: typed(fx), focusY: typed(fy), directrix: typed(result.directrix), latus: typed(result.latus) },
    model: {
      title: 'Parabola features solution',
      items: [
        { label: 'Focus x', value: stated(fx) },
        { label: 'Focus y', value: stated(fy) },
        { label: 'Directrix', value: `${line} = ${stated(result.directrix)}` },
        { label: 'Latus rectum length', value: stated(result.latus) },
      ],
      steps: [axisSentence(exact), focusStep, directrixStep, latusStep],
      why,
      note: null,
    },
  };
};

// P as the grader reads it: the authored point, or the point of the parabola
// at the offset along the axis.
const equidistancePoint = (question, spec, exact) => {
  if (question.point) {
    const raw = question.point;
    if (!Array.isArray(raw) || raw.length !== 2) return null;
    const [x, y] = raw.map(authoredNumber);
    return all(x, y) ? { x, y, floats: raw.map(Number), sampled: false } : null;
  }
  const offset = exactNumber(Number(question.offset ?? 4));
  if (!offset) return null;
  const { h, k, p, vertical } = exact;
  const along = div(mul(offset, offset), mul(int(4), p));
  const [x, y] = vertical ? [add(h, offset), add(along, k)] : [add(along, h), add(k, offset)];
  if (!all(x, y)) return null;
  return { x, y, floats: sampleParabolaPoint(spec, Number(question.offset ?? 4)), sampled: true };
};

const equidistanceReview = (question) => {
  const spec = vertexSpec(question, { h: 0, k: 0, p: 2 });
  const exact = exactSpec(spec);
  if (!exact) return null;
  const P = equidistancePoint(question, spec, exact);
  if (!P) return null;
  if (!agrees(P.x, P.floats[0]) || !agrees(P.y, P.floats[1])) return null;
  const key = pointDistances(spec, question.point || P.floats);
  const { h, k, p, vertical } = exact;
  const { focus: [fx, fy], directrix } = exactFeatures(exact);
  const dx = sub(P.x, fx);
  const dy = sub(P.y, fy);
  const sum = add(mul(dx, dx), mul(dy, dy));
  const toDirectrix = abs(vertical ? sub(P.y, directrix) : sub(P.x, directrix));
  if (!all(fx, fy, directrix, dx, dy, sum, toDirectrix)) return null;
  const root = exactRoot(sum);
  if (root ? !agrees(root, key.focusDistance) : Math.abs(Math.sqrt(toFloat(sum)) - key.focusDistance) > 1e-9 * Math.max(1, key.focusDistance)) return null;
  if (!agrees(toDirectrix, key.directrixDistance)) return null;

  // Exactly on the parabola when PF² equals the directrix distance squared —
  // and the grader's tolerance must say the same.
  const onCurve = same(sum, mul(toDirectrix, toDirectrix));
  if (onCurve !== key.onParabola) return null;
  const check = substitute(exact, P.x, P.y);
  if (!check || same(check.left, check.right) !== onCurve) return null;

  const focusText = root ? tex(root) : `\\sqrt{${tex(sum)}}`;
  const focusTyped = root ? typed(root) : String(Number(key.focusDistance.toFixed(2)));
  const focusStated = root ? stated(root) : `√${isDecimal(sum) ? plain(typed(sum)) : `(${plain(typed(sum))})`} ≈ ${approx(key.focusDistance)}`;
  if (!onCurve && approx(key.focusDistance) === approx(key.directrixDistance)) return null;

  const line = vertical ? 'y' : 'x';
  const steps = [
    `The vertex is $${point(h, k)}$ and $p = ${tex(p)}$, so the focus is $F = ${point(fx, fy)}$ (p added to the ${vertical ? 'y' : 'x'}-coordinate of the vertex) and the directrix is $${line} = ${tex(directrix)}$ (p subtracted). The point is $P = ${point(P.x, P.y)}$.`,
    `Distance from P to the focus, by the distance formula: $PF = \\sqrt{(${tex(P.x)} - ${operand(fx)})^2 + (${tex(P.y)} - ${operand(fy)})^2} = \\sqrt{${squared(dx)} + ${squared(dy)}} = \\sqrt{${tex(mul(dx, dx))} + ${tex(mul(dy, dy))}} = ${root ? `\\sqrt{${tex(sum)}} = ${tex(root)}` : `\\sqrt{${tex(sum)}} \\approx ${Number(key.focusDistance.toFixed(2))}`}$.`,
    `Distance from P to the directrix $${line} = ${tex(directrix)}$ is measured straight ${vertical ? 'up or down' : 'across'} (perpendicular to it), so only the ${line}-coordinate matters: $|${tex(vertical ? P.y : P.x)} - ${operand(directrix)}| = ${tex(toDirectrix)}$.`,
    onCurve
      ? `The two distances are equal ($${focusText} = ${tex(toDirectrix)}$), so P is on the parabola: the answer is Yes.`
      : `The two distances are not equal ($${focusText}${root ? '' : ` \\approx ${Number(key.focusDistance.toFixed(2))}`}$ and $${tex(toDirectrix)}$${isDecimal(toDirectrix) ? '' : ` \\approx ${Number(key.directrixDistance.toFixed(2))}`}), so P is not on the parabola: the answer is No.`,
  ];
  const why = `A parabola is exactly the set of points the same distance from the focus as from the directrix, so comparing the two distances decides it. Check with the equation $${symbolicForm(vertical)}$, here $${standardForm(exact)}$: at P, ${check.text} — ${onCurve ? 'the same, so P is on the parabola.' : 'not the same, so P is not on the parabola.'}`;

  const shown = [round(P.floats[0], 2), round(P.floats[1], 2)];
  const roundedOnScreen = !agrees(P.x, shown[0]) || !agrees(P.y, shown[1]);
  const note = roundedOnScreen
    ? `The lab shows P rounded to two decimal places, as (${plain(String(shown[0]))}, ${plain(String(shown[1]))}); the work above uses the exact point (${plain(typed(P.x))}, ${plain(typed(P.y))}).`
    : null;
  return {
    work: { focusDistance: focusTyped, directrixDistance: typed(toDirectrix), onCurve: onCurve ? 'yes' : 'no' },
    model: {
      title: 'Focus–directrix distance solution',
      items: [
        { label: 'Distance P → focus', value: focusStated },
        { label: 'Distance P → directrix', value: stated(toDirectrix) },
        { label: 'Is P on the parabola?', value: onCurve ? 'Yes' : 'No' },
      ],
      steps,
      why,
      note,
    },
  };
};

const fromGeometryReview = (question) => {
  const focus = question.focus || [2, 3];
  const directrix = question.directrix || { kind: 'horizontal', value: -1 };
  const expected = geometryFromFocusDirectrix({ focus, directrix });
  if (!expected || !Array.isArray(focus) || focus.length !== 2) return null;
  const fx = authoredNumber(focus[0]);
  const fy = authoredNumber(focus[1]);
  const d = authoredNumber(directrix.value);
  if (!all(fx, fy, d)) return null;
  const horizontalDirectrix = directrix.kind === 'horizontal';
  const h = horizontalDirectrix ? fx : div(add(fx, d), int(2));
  const k = horizontalDirectrix ? div(add(fy, d), int(2)) : fy;
  const p = horizontalDirectrix ? sub(fy, k) : sub(fx, h);
  if (!all(h, k, p) || p.n === 0) return null;
  if (!agrees(h, expected.h) || !agrees(k, expected.k) || !agrees(p, expected.p)) return null;
  const exact = { h, k, p, vertical: horizontalDirectrix };
  const line = horizontalDirectrix ? 'y' : 'x';
  const opening = openingOf(exact);
  const steps = horizontalDirectrix
    ? [
      `The directrix $y = ${tex(d)}$ is horizontal, so the axis of symmetry is the vertical line through the focus, $x = ${tex(fx)}$. The vertex is on that axis, so $h = ${tex(h)}$.`,
      `The vertex is halfway between the focus and the directrix: $k = \\frac{${tex(fy)} + ${operand(d)}}{2} = ${tex(k)}$.`,
      `p is the signed distance from the vertex to the focus: $p = ${tex(fy)} - ${operand(k)} = ${tex(p)}$. It is ${p.n > 0 ? 'positive' : 'negative'} because the focus is ${SIDE[opening]} the vertex, so the parabola opens ${opening}.`,
    ]
    : [
      `The directrix $x = ${tex(d)}$ is vertical, so the axis of symmetry is the horizontal line through the focus, $y = ${tex(fy)}$. The vertex is on that axis, so $k = ${tex(k)}$.`,
      `The vertex is halfway between the focus and the directrix: $h = \\frac{${tex(fx)} + ${operand(d)}}{2} = ${tex(h)}$.`,
      `p is the signed distance from the vertex to the focus: $p = ${tex(fx)} - ${operand(h)} = ${tex(p)}$. It is ${p.n > 0 ? 'positive' : 'negative'} because the focus is ${SIDE[opening]} the vertex, so the parabola opens ${opening}.`,
    ];
  const back = exactFeatures(exact);
  if (!same(back.focus[0], fx) || !same(back.focus[1], fy) || !same(back.directrix, d)) return null;
  const why = `Check by going forward from the answer: from the vertex $${point(h, k)}$, adding $p = ${tex(p)}$ to the ${line}-coordinate gives the focus $${point(fx, fy)}$, and subtracting it gives the directrix $${line} = ${tex(horizontalDirectrix ? k : h)} - ${operand(p)} = ${tex(d)}$ — exactly the focus and directrix you were given.`;
  return {
    work: { h: typed(h), k: typed(k), p: typed(p) },
    model: {
      title: 'Vertex and p from the focus and directrix',
      items: [
        { label: 'Vertex h', value: stated(h) },
        { label: 'Vertex k', value: stated(k) },
        { label: 'p', value: stated(p) },
      ],
      steps,
      why,
      note: null,
    },
  };
};

const equationReview = (question) => {
  const spec = vertexSpec(question, { h: -2, k: 1, p: 1.5 });
  const key = { coefficient: standardEquationParts(spec).coefficient, opens: parabolaFeatures(spec).opens };
  const exact = exactSpec(spec);
  if (!exact) return null;
  const { h, k, p, vertical } = exact;
  const coefficient = mul(int(4), p);
  const opening = openingOf(exact);
  if (!agrees(coefficient, key.coefficient) || opening !== key.opens) return null;
  const twoP = mul(int(2), abs(p));
  const [x, y] = vertical ? [add(h, twoP), add(k, p)] : [add(h, p), add(k, twoP)];
  if (!all(twoP, x, y)) return null;
  const check = substitute(exact, x, y);
  if (!check || !same(check.left, check.right)) return null;
  const focus = exactFeatures(exact).focus;
  if (!all(...focus)) return null;
  const steps = [
    `The equation has the form $${symbolicForm(vertical)}$ with vertex $${point(h, k)}$: here $${standardForm(exact, { symbolic: true })}$ and $p = ${tex(p)}$.`,
    `The coefficient on the right is $4p = 4 \\cdot ${operand(p)} = ${tex(coefficient)}$, so the equation is $${standardForm(exact)}$.`,
    `The squared variable is ${vertical ? 'x' : 'y'}, so the axis of symmetry is ${vertical ? 'vertical and the parabola opens up or down' : 'horizontal and the parabola opens left or right'}. Since $p = ${tex(p)}$ is ${p.n > 0 ? 'positive' : 'negative'}, it opens ${opening}.`,
  ];
  const why = `Check with the point $${point(x, y)}$, an end of the latus rectum (the chord through the focus $${point(...focus)}$ perpendicular to the axis): ${check.text}, so it is on $${standardForm(exact)}$. It lies ${SIDE[opening]} the vertex $${point(h, k)}$, on the focus's side, so the parabola opens ${opening}.`;
  return {
    work: { coefficient: typed(coefficient), opening },
    model: {
      title: 'Standard-form solution',
      items: [
        { label: 'Value of 4p', value: stated(coefficient) },
        { label: 'Opening direction', value: opening },
      ],
      steps,
      why,
      note: null,
    },
  };
};

const VIEWS = Object.freeze({
  features: { build: featuresReview, reads: { nullish: ['h', 'k', 'p'], truthy: ['orientation'] } },
  equidistance: { build: equidistanceReview, reads: { nullish: ['h', 'k', 'p', 'offset'], truthy: ['orientation', 'point'] } },
  fromGeometry: { build: fromGeometryReview, reads: { nullish: [], truthy: ['focus', 'directrix'] } },
  equation: { build: equationReview, reads: { nullish: ['h', 'k', 'p'], truthy: ['orientation'] } },
});

// Does the question set anything this view reads (with the grader's own `??`
// or `||` fallback), or is it only the lab's demonstration?
const authorsView = (question, { nullish, truthy }) => nullish.some((field) => question[field] != null)
  || truthy.some((field) => Boolean(question[field]));

export const buildParabolaGeometryLabReview = (question) => {
  if (!question || typeof question !== 'object' || Array.isArray(question)) return null;
  try {
    const support = parabolaGeometryGrader.support(question);
    const view = support.supported ? VIEWS[support.mode] : null;
    if (!view || !Object.prototype.hasOwnProperty.call(VIEWS, support.mode)) return null;
    if (!authorsView(question, view.reads)) return null;
    const built = view.build(question);
    if (!built) return null;
    // The grader the server records with must call the stated work correct.
    const result = gradeWorkWithGrader({ grader: parabolaGeometryGrader, question, work: built.work });
    if (result.graded !== true || result.isCorrect !== true || result.mode !== support.mode) return null;
    return built.model;
  } catch {
    return null;
  }
};

export default buildParabolaGeometryLabReview;
