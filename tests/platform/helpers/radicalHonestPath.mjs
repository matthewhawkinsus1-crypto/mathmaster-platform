/*
 * THE HONEST PATH THROUGH A RADICAL EQUATION, AS A LIST OF TRANSITIONS.
 *
 * What a student has to write, step by step, to solve a supported radical
 * equation on the relation workspace — isolate the radical, raise both sides to
 * its index, then a linear equation or (for a square root with a variable on
 * the other side) the quadratic: standard form, factor, zero-product, each
 * branch. Every step is { label, before, after, transition } exactly as
 * validateRelationTransition and the server's step verifier take it, so a test
 * can prove the platform ACCEPTS the honest solve of any generated version.
 *
 * Derived from the exact model (radicalEquationShape.mjs), never from a
 * generator's own keys.
 */
import {
  parseRelationSource,
} from '../../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';
import {
  rational, rationalEquals, rationalToText, solveRadicalShape, parseRadicalEquation,
} from '../../../functions/shared/toolMath/algebra-relations/radicalEquationShape.mjs';

const Q = rational;
const sub = (a, b) => Q(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a, b) => Q(a.n * b.n, a.d * b.d);
const div = (a, b) => Q(a.n * b.d, a.d * b.n);
const neg = (a) => Q(-a.n, a.d);
const isZero = (a) => a.n === 0;
const isNeg = (a) => a.n < 0;
const abs = (a) => (isNeg(a) ? neg(a) : a);
const ONE = Q(1);
const pow = (a, k) => { let out = ONE; for (let i = 0; i < k; i += 1) out = mul(out, a); return out; };

export const numberText = (value) => rationalToText(value);

/** a·v + b as an expression the engine reads (fractions as (n/d)). */
export const linearExpression = (a, b, v = 'x') => {
  const parts = [];
  const fraction = (value) => (value.d === 1 ? numberText(value) : `(${numberText(value)})`);
  if (!isZero(a)) parts.push(`${isNeg(a) ? '-' : ''}${rationalEquals(abs(a), ONE) ? '' : `${fraction(abs(a))}*`}${v}`);
  if (!isZero(b) || !parts.length) parts.push(`${parts.length ? (isNeg(b) ? '- ' : '+ ') : (isNeg(b) ? '-' : '')}${fraction(abs(b))}`);
  return parts.join(' ');
};
const quadraticExpression = (A, B, C, v = 'x') => {
  const fraction = (value) => (value.d === 1 ? numberText(value) : `(${numberText(value)})`);
  const terms = [];
  const push = (coefficient, body) => {
    if (isZero(coefficient)) return;
    const magnitude = abs(coefficient);
    const lead = body && rationalEquals(magnitude, ONE) ? '' : `${fraction(magnitude)}${body ? '*' : ''}`;
    terms.push(`${terms.length ? (isNeg(coefficient) ? ' - ' : ' + ') : (isNeg(coefficient) ? '-' : '')}${lead}${body}`);
  };
  push(A, `${v}^2`);
  push(B, v);
  push(C, '');
  return terms.join('') || '0';
};
const factorExpression = (root, v) => {
  const lead = root.d === 1 ? v : `${root.d}*${v}`;
  if (root.n === 0) return lead;
  return `${lead} ${root.n < 0 ? '+' : '-'} ${Math.abs(root.n)}`;
};

const withBranches = (state, pairs) => ({
  ...state,
  special: null,
  branches: pairs.map((expressions) => ({ expressions, relations: ['='] })),
  connective: pairs.length > 1 ? 'OR' : null,
});

export const honestPath = (source, variable = 'x') => {
  const parsed = parseRadicalEquation(source, { variable });
  if (!parsed.ok) throw new Error(`not a radical equation: ${source} (${parsed.reason})`);
  const { shape } = parsed;
  const expected = solveRadicalShape(shape);
  if (!expected.ok) throw new Error(`outside the verified scope: ${source} (${expected.reason})`);
  if (shape.radicalSide !== 'left') throw new Error('the path is written for a radical on the left');

  const v = shape.variable;
  const steps = [];
  let state = parseRelationSource(source, v);
  const step = (label, after, transition, kind = 'relation-step') => {
    steps.push({ label, before: state, after, transition, kind });
    state = after;
  };
  const balanced = (operation, operand, branchIndices = [0]) => ({ kind: 'balancedOperation', operation, operandExpression: operand, branchIndices });

  const radicandText = linearExpression(shape.radicand.m, shape.radicand.b, v);
  const radical = shape.index === 2 ? `sqrt(${radicandText})` : `nthRoot(${radicandText}, ${shape.index})`;
  const outside = shape.left.c0;
  const alpha = shape.alpha;
  const rightLinear = shape.right.c1;
  let rightConstant = shape.right.c0;
  const single = (left, right) => withBranches(state, [[left, right]]);

  if (!isZero(outside)) {
    rightConstant = sub(rightConstant, outside);
    step(`${isNeg(outside) ? 'Add' : 'Subtract'} ${numberText(abs(outside))}`,
      single(rationalEquals(alpha, ONE) ? radical : `${numberText(alpha)}*${radical}`, linearExpression(rightLinear, rightConstant, v)),
      balanced(isNeg(outside) ? 'add' : 'subtract', numberText(abs(outside))));
  }
  let isolatedLinear = rightLinear;
  if (!rationalEquals(alpha, ONE)) {
    rightConstant = div(rightConstant, alpha);
    isolatedLinear = div(rightLinear, alpha);
    step(`Divide by ${numberText(alpha)}`, single(radical, linearExpression(isolatedLinear, rightConstant, v)), balanced('divide', numberText(alpha)));
  }

  const { r, s } = shape.isolated;
  const powered = shape.index === 2 && !isZero(r)
    ? quadraticExpression(mul(r, r), mul(mul(Q(2), r), s), mul(s, s), v)
    : numberText(pow(s, shape.index));
  step(`Raise both sides to the power ${shape.index}`, single(radicandText, powered),
    { kind: 'radicalRaise', branchIndex: 0, power: shape.index }, 'radical-raise');

  if (shape.index === 2 && !isZero(r)) {
    const A = mul(r, r);
    const B = sub(mul(mul(Q(2), r), s), shape.radicand.m);
    const C = sub(mul(s, s), shape.radicand.b);
    step('Subtract the radicand', single('0', quadraticExpression(A, B, C, v)), balanced('subtract', radicandText));
    const roots = expected.candidates;
    const factors = roots.length === 1 ? [`(${factorExpression(roots[0], v)})^2`] : roots.map((root) => `(${factorExpression(root, v)})`);
    const leading = div(A, roots.reduce((product, root) => mul(product, Q(root.d)), ONE));
    const lead = roots.length === 1 ? (rationalEquals(A, ONE) ? '' : `${numberText(A)}*`) : (rationalEquals(leading, ONE) ? '' : `${numberText(leading)}*`);
    step('Factor', single('0', `${lead}${factors.join('*')}`), { kind: 'factor', branchIndex: 0 }, 'factor');
    step('Zero-product property', withBranches(state, roots.map((root) => [factorExpression(root, v), '0'])), { kind: 'zeroProduct', branchIndex: 0 }, 'zero-product');
    roots.forEach((root, index) => {
      const n = Q(root.n);
      const d = Q(root.d);
      const pairs = state.branches.map((branch) => branch.expressions);
      if (!(d.n === 1 && isZero(n))) {
        pairs[index] = [`${d.n === 1 ? '' : `${numberText(d)}*`}${v}`, numberText(n)];
        step(`${isNeg(n) ? 'Subtract' : 'Add'} ${numberText(abs(n))} on Branch ${String.fromCharCode(65 + index)}`, withBranches(state, pairs.map((pair) => [...pair])), balanced(isNeg(n) ? 'subtract' : 'add', numberText(abs(n)), [index]));
        if (!rationalEquals(d, ONE)) {
          pairs[index] = [v, numberText(div(n, d))];
          step(`Divide by ${numberText(d)} on Branch ${String.fromCharCode(65 + index)}`, withBranches(state, pairs.map((pair) => [...pair])), balanced('divide', numberText(d), [index]));
        }
      }
    });
  } else {
    const { m, b } = shape.radicand;
    const K = pow(s, shape.index);
    let right = K;
    if (!isZero(b)) {
      right = sub(K, b);
      step(`${isNeg(b) ? 'Add' : 'Subtract'} ${numberText(abs(b))}`, single(linearExpression(m, ZERO_Q(), v), numberText(right)), balanced(isNeg(b) ? 'add' : 'subtract', numberText(abs(b))));
    }
    if (!rationalEquals(m, ONE)) {
      step(`Divide by ${numberText(m)}`, single(v, numberText(div(right, m))), balanced('divide', numberText(m)));
    }
  }
  return { shape, expected, steps, final: state };
};

const ZERO_Q = () => Q(0);
