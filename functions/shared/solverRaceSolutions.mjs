/*
 * SOLVER RACE WORKED SOLUTIONS (student push J).
 *
 * Solver Race rounds are generated, not authored (solverRace.mjs
 * generateSolverRaceQuestion), so they had no solution review and every round
 * published "no worked solution yet" between rounds. Each round now carries a
 * `solutionReview` built from the SAME parameters the generator drew — the
 * equation, every step and the answer come from one set of numbers, never
 * from re-reading the equation text.
 *
 * It travels exactly like an authored Path review: the server captures it
 * privately when the round opens and publishes it only after the round has
 * closed (liveChallengeSolutionReveal.mjs — Second Chance holds and
 * cancellation unchanged). The public question is built by allowlist
 * (mathPath.buildSanitizedQuestion) and never carries it.
 *
 * Shape: { headline, reasoning (≤ 5 steps, the projector's limit),
 * commonError, answerSummary }. Mathematics in `$…$` (MathText).
 * Every step is checked by tests/platform/solverRaceSolutions.test.mjs, which
 * evaluates the published LaTeX itself against the round's equation.
 *
 * Pure: no I/O.
 */

const num = (value) => String(Object.is(value, -0) ? 0 : value);
const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const lcm = (a, b) => Math.abs(a * b) / gcd(a, b);

/** `c·v` as written: x, -x, 3x, -3x. */
const term = (coefficient, variable = 'x') => {
  if (coefficient === 1) return variable;
  if (coefficient === -1) return `-${variable}`;
  return `${num(coefficient)}${variable}`;
};
/** ` + 5`, ` - 5`, or nothing for 0. */
const plus = (value) => (value === 0 ? '' : value < 0 ? ` - ${num(-value)}` : ` + ${num(value)}`);
/** `c·v + k`; a lone constant when c is 0. */
const lin = (coefficient, variable, constant) => (coefficient === 0 ? num(constant) : `${term(coefficient, variable)}${plus(constant)}`);
/** An exact fraction in LaTeX, reduced, sign in front. */
const frac = (numerator, denominator) => {
  const sign = (numerator < 0) !== (denominator < 0) && numerator !== 0 ? '-' : '';
  const divisor = gcd(Math.abs(numerator), Math.abs(denominator)) || 1;
  const n = Math.abs(numerator) / divisor;
  const d = Math.abs(denominator) / divisor;
  return d === 1 ? `${sign}${n}` : `${sign}\\frac{${n}}{${d}}`;
};
const LATEX_OPERATOR = { '<': '<', '<=': '\\le', '>': '>', '>=': '\\ge', '=': '=' };
const op = (operator) => LATEX_OPERATOR[operator];
const flip = (operator) => ({ '<': '>', '<=': '>=', '>': '<', '>=': '<=' })[operator];
/** "Subtract 5 from both sides" / "Add 5 to both sides" — the move that removes `value`. */
const removeConstant = (value, where = 'both sides') => (value > 0
  ? `Subtract $${num(value)}$ from ${where}`
  : `Add $${num(-value)}$ to ${where}`);
/** x − h written the way the generator writes it. */
const shifted = (variable, center) => (center < 0 ? `${variable} + ${num(-center)}` : `${variable} - ${num(center)}`);

const HEADLINE = {
  linearEquation: 'Undo the operations around $x$ in reverse order, doing the same thing to both sides.',
  literalEquation: 'Treat the other letters like numbers, and undo what is done to the variable you are solving for.',
  linearInequality: 'Solve it like an equation, and flip the inequality sign only when you multiply or divide by a negative.',
  absoluteValueEquation: 'Get the absolute value by itself, then split it into two equations.',
  absoluteValueInequality: 'Get the absolute value by itself. "Less than" means between two values (AND); "greater than" means outside them (OR).',
};
const COMMON_ERROR = {
  linearEquation: 'Moving a term to the other side without changing its sign.',
  literalEquation: 'Dividing only one term by the coefficient instead of the whole side.',
  linearInequality: 'Forgetting to flip the sign after multiplying or dividing by a negative number.',
  absoluteValueEquation: 'Solving only the positive case, or splitting before the absolute value is by itself.',
  absoluteValueInequality: 'Writing an AND for a "greater than" inequality (or an OR for "less than").',
};

const review = (family, steps, answerSummary) => Object.freeze({
  headline: HEADLINE[family],
  reasoning: Object.freeze(steps.filter(Boolean).slice(0, 5)),
  commonError: COMMON_ERROR[family],
  answerSummary,
});

/** a·x + k = r → x = (r − k)/a, as up to two steps. */
const isolateLinear = ({ a, k, right, variable = 'x', relation = '=' }) => {
  const steps = [];
  if (k !== 0) steps.push(`${removeConstant(k)}: $${term(a, variable)} ${op(relation)} ${num(right - k)}$.`);
  if (a !== 1) {
    const flipped = a < 0 && relation !== '=';
    const finalRelation = flipped ? flip(relation) : relation;
    const value = frac(right - k, a);
    steps.push(a === -1 && !flipped
      ? `Multiply both sides by $-1$: $${variable} ${op(finalRelation)} ${value}$.`
      : `Divide both sides by $${num(a)}$${flipped ? ' and flip the inequality sign, because you divided by a negative' : ''}: $${variable} ${op(finalRelation)} ${value}$.`);
  }
  return steps;
};

const linearEquation = (key, p) => {
  const X = p.x;
  const start = (latex) => `Start with $${latex}$.`;
  const done = (steps, check) => review('linearEquation', steps, `$x = ${num(X)}$. Check: $${check}$.`);
  switch (key) {
    case 'add':
    case 'subtract':
      return done([start(`${lin(1, 'x', p.c)} = ${num(X + p.c)}`), ...isolateLinear({ a: 1, k: p.c, right: X + p.c })], `${num(X)}${plus(p.c)} = ${num(X + p.c)}`);
    case 'multiply':
      return done([start(`${term(p.a)} = ${num(p.a * X)}`), ...isolateLinear({ a: p.a, k: 0, right: p.a * X })], `${num(p.a)}(${num(X)}) = ${num(p.a * X)}`);
    case 'divide':
      return done([
        start(`\\frac{x}{${p.d}} = \\frac{${num(X)}}{${p.d}}`),
        `Multiply both sides by $${p.d}$: $x = ${num(X)}$.`,
      ], `\\frac{${num(X)}}{${p.d}} = \\frac{${num(X)}}{${p.d}}`);
    case 'two_step':
    case 'negative_coefficient': {
      const right = p.a * X + p.b;
      return done([start(`${lin(p.a, 'x', p.b)} = ${num(right)}`), ...isolateLinear({ a: p.a, k: p.b, right })], `${num(p.a)}(${num(X)})${plus(p.b)} = ${num(right)}`);
    }
    case 'both_sides':
    case 'signed_both_sides': {
      const { a, b, c, d } = p;
      return done([
        start(`${lin(a, 'x', c)} = ${lin(b, 'x', d)}`),
        `Subtract $${term(b)}$ from both sides: $${lin(a - b, 'x', c)} = ${num(d)}$.`,
        ...isolateLinear({ a: a - b, k: c, right: d }),
      ], `${num(a)}(${num(X)})${plus(c)} = ${num(a * X + c)} \\text{ and } ${num(b)}(${num(X)})${plus(d)} = ${num(b * X + d)}`);
    }
    case 'distribution':
    case 'negative_distribution': {
      const { a, h, b } = p;
      const right = a * (X - h) + b;
      const constant = b - a * h;
      return done([
        start(`${num(a)}(${shifted('x', h)})${plus(b)} = ${num(right)}`),
        `Distribute $${num(a)}$: $${term(a)}${plus(-a * h)}${plus(b)} = ${num(right)}$.`,
        `Combine the constants: $${lin(a, 'x', constant)} = ${num(right)}$.`,
        ...isolateLinear({ a, k: constant, right }),
      ], `${num(a)}(${num(X)}${plus(-h)})${plus(b)} = ${num(right)}`);
    }
    case 'fraction': {
      const { h, d, b } = p;
      return done([
        start(`\\frac{${shifted('x', h)}}{${d}}${plus(b)} = \\frac{${num(X - h)}}{${d}}${plus(b)}`),
        `${removeConstant(b)}: $\\frac{${shifted('x', h)}}{${d}} = \\frac{${num(X - h)}}{${d}}$.`,
        `Multiply both sides by $${d}$: $${shifted('x', h)} = ${num(X - h)}$.`,
        `${removeConstant(-h)}: $x = ${num(X)}$.`,
      ], `\\frac{${num(X)}${plus(-h)}}{${d}} = \\frac{${num(X - h)}}{${d}}`);
    }
    case 'multi_operation': {
      const { outer, inner, h, b, right, constant } = p;
      const slope = outer * inner;
      const k = b - outer * h;
      return done([
        start(`${num(outer)}(${lin(inner, 'x', -h)})${plus(b)} = ${lin(right, 'x', constant)}`),
        `Distribute and combine the constants: $${lin(slope, 'x', k)} = ${lin(right, 'x', constant)}$.`,
        `Subtract $${term(right)}$ from both sides: $${lin(slope - right, 'x', k)} = ${num(constant)}$.`,
        ...isolateLinear({ a: slope - right, k, right: constant }),
      ], `${num(outer)}(${num(inner)}(${num(X)})${plus(-h)})${plus(b)} = ${num(outer * (inner * X - h) + b)} \\text{ and } ${num(right)}(${num(X)})${plus(constant)} = ${num(right * X + constant)}`);
    }
    case 'distributed_both_sides': {
      const { a, b, h, k, c, d } = p;
      const left = a * h + c;
      const rightConstant = b * k + d;
      return done([
        start(`${num(a)}(${lin(1, 'x', h)})${plus(c)} = ${num(b)}(${lin(1, 'x', k)})${plus(d)}`),
        `Distribute and combine the constants: $${lin(a, 'x', left)} = ${lin(b, 'x', rightConstant)}$.`,
        `Subtract $${term(b)}$ from both sides: $${lin(a - b, 'x', left)} = ${num(rightConstant)}$.`,
        ...isolateLinear({ a: a - b, k: left, right: rightConstant }),
      ], `${num(a)}(${num(X)}${plus(h)})${plus(c)} = ${num(a * (X + h) + c)}`);
    }
    case 'fraction_both_sides': {
      // (x + h)/p = (m·x + k2)/q
      const { h, p: leftDen, m, k2, q } = p;
      const L = lcm(leftDen, q);
      const lf = L / leftDen;
      const rf = L / q;
      const scaled = (factor, body) => (factor === 1 ? body : `${num(factor)}(${body})`);
      const A = lf - rf * m;
      const K = lf * h;
      const R = rf * k2;
      return done([
        start(`\\frac{${lin(1, 'x', h)}}{${leftDen}} = \\frac{${lin(m, 'x', k2)}}{${q}}`),
        `Multiply both sides by $${L}$: $${scaled(lf, lin(1, 'x', h))} = ${scaled(rf, lin(m, 'x', k2))}$.`,
        `Distribute: $${lin(lf, 'x', K)} = ${lin(rf * m, 'x', R)}$.`,
        `Subtract $${term(rf * m)}$ from both sides: $${lin(A, 'x', K)} = ${num(R)}$.`,
        ...isolateLinear({ a: A, k: K, right: R }),
      ], `\\frac{${num(X)}${plus(h)}}{${leftDen}} = ${frac(X + h, leftDen)} \\text{ and } \\frac{${m === 1 ? num(X) : `${num(m)}(${num(X)})`}${plus(k2)}}{${q}} = ${frac(m * X + k2, q)}`);
    }
    default:
      return null;
  }
};

const linearInequality = (key, p) => {
  const X = p.x;
  const start = (latex) => `Start with $${latex}$.`;
  const done = (steps, summary) => review('linearInequality', steps, summary);
  switch (key) {
    case 'one_add':
    case 'one_subtract':
      return done([start(`${lin(1, 'x', p.c)} ${op(p.op)} ${num(X + p.c)}`), ...isolateLinear({ a: 1, k: p.c, right: X + p.c, relation: p.op })], `$x ${op(p.op)} ${num(X)}$`);
    case 'positive_coefficient':
    case 'two_step':
    case 'negative_flip': {
      const right = p.a * X + p.b;
      const finalOp = p.a < 0 ? flip(p.op) : p.op;
      return done([start(`${lin(p.a, 'x', p.b)} ${op(p.op)} ${num(right)}`), ...isolateLinear({ a: p.a, k: p.b, right, relation: p.op })], `$x ${op(finalOp)} ${num(X)}$`);
    }
    case 'both_sides': {
      const { a, b, c, d } = p;
      return done([
        start(`${lin(a, 'x', c)} ${op(p.op)} ${lin(b, 'x', d)}`),
        `Subtract $${term(b)}$ from both sides: $${lin(a - b, 'x', c)} ${op(p.op)} ${num(d)}$.`,
        ...isolateLinear({ a: a - b, k: c, right: d, relation: p.op }),
      ], `$x ${op(p.op)} ${num(X)}$`);
    }
    case 'compound': {
      const { low, high, a, b } = p;
      return done([
        start(`${num(a * low + b)} < ${lin(a, 'x', b)} \\le ${num(a * high + b)}`),
        `${removeConstant(b, 'all three parts')}: $${num(a * low)} < ${term(a)} \\le ${num(a * high)}$.`,
        `Divide all three parts by $${num(a)}$ (positive, so the signs stay): $${num(low)} < x \\le ${num(high)}$.`,
      ], `$${num(low)} < x \\le ${num(high)}$`);
    }
    case 'fraction_negative': {
      const { c, d, rhs } = p;
      return done([
        start(`\\frac{${num(c)} - x}{${d}} \\ge ${num(rhs)}`),
        `Multiply both sides by $${d}$ (positive, so the sign stays): $${num(c)} - x \\ge ${num(d * rhs)}$.`,
        `${removeConstant(c)}: $-x \\ge ${num(d * rhs - c)}$.`,
        `Multiply both sides by $-1$ and flip the inequality sign: $x \\le ${num(c - d * rhs)}$.`,
      ], `$x \\le ${num(X)}$`);
    }
    default:
      return null;
  }
};

const pairOf = (left, right) => `$x = ${num(left)}$ or $x = ${num(right)}$`;

const absoluteValueEquation = (key, p) => {
  const { center: c, radius: r, inner: k } = p;
  const low = c - r;
  const high = c + r;
  const start = (latex) => `Start with $${latex}$.`;
  const done = (steps, summary = pairOf(low, high)) => review('absoluteValueEquation', steps, summary);
  const splitShifted = () => [
    `Split into two equations: $${shifted('x', c)} = ${num(r)}$ or $${shifted('x', c)} = ${num(-r)}$.`,
    `${removeConstant(-c, 'both sides of each')}: ${pairOf(high, low)}.`,
  ];
  switch (key) {
    case 'basic':
      return done([start(`|x| = ${num(r)}`), `Two numbers are ${num(r)} away from 0: ${pairOf(r, -r)}.`]);
    case 'translated':
      return done([start(`|${shifted('x', c)}| = ${num(r)}`), ...splitShifted()]);
    case 'outside_coefficient':
      return done([start(`${num(p.outside)}|${shifted('x', c)}| = ${num(p.outside * r)}`), `Divide both sides by $${num(p.outside)}$: $|${shifted('x', c)}| = ${num(r)}$.`, ...splitShifted()]);
    case 'isolate_first':
      return done([
        start(`${num(p.outside)}|${shifted('x', c)}|${plus(p.shift)} = ${num(p.outside * r + p.shift)}`),
        `${removeConstant(p.shift)}: $${num(p.outside)}|${shifted('x', c)}| = ${num(p.outside * r)}$.`,
        `Divide both sides by $${num(p.outside)}$: $|${shifted('x', c)}| = ${num(r)}$.`,
        ...splitShifted(),
      ]);
    case 'inside_coefficient': {
      const body = lin(k, 'x', -k * c);
      return done([
        start(`|${body}| = ${num(k * r)}`),
        `Split into two equations: $${body} = ${num(k * r)}$ or $${body} = ${num(-k * r)}$.`,
        `${removeConstant(-k * c, 'both sides of each')}: $${term(k)} = ${num(k * c + k * r)}$ or $${term(k)} = ${num(k * c - k * r)}$.`,
        `Divide each by $${num(k)}$: ${pairOf(high, low)}.`,
      ]);
    }
    case 'negative_inside': {
      const body = `${num(k * c)} - ${term(k)}`;
      return done([
        start(`|${body}| = ${num(k * r)}`),
        `Split into two equations: $${body} = ${num(k * r)}$ or $${body} = ${num(-k * r)}$.`,
        `${removeConstant(k * c, 'both sides of each')}: $${term(-k)} = ${num(k * r - k * c)}$ or $${term(-k)} = ${num(-k * r - k * c)}$.`,
        `Divide each by $${num(-k)}$: ${pairOf(low, high)}.`,
      ]);
    }
    case 'fraction':
      return done([
        start(`\\left|\\frac{${shifted('x', c)}}{${k}}\\right| = \\frac{${num(r)}}{${k}}`),
        `Split into two equations: $\\frac{${shifted('x', c)}}{${k}} = \\frac{${num(r)}}{${k}}$ or $\\frac{${shifted('x', c)}}{${k}} = -\\frac{${num(r)}}{${k}}$.`,
        `Multiply each by $${k}$: $${shifted('x', c)} = ${num(r)}$ or $${shifted('x', c)} = ${num(-r)}$.`,
        `${removeConstant(-c, 'both sides of each')}: ${pairOf(high, low)}.`,
      ]);
    case 'no_solution': {
      const { outside, shift, target } = p;
      // The generator may draw a coefficient of 1 (written 1*|…|): no division step then.
      const scaled = outside === 1 ? '' : num(outside);
      return done([
        start(`${scaled}|${shifted('x', c)}|${plus(shift)} = ${num(-target)}`),
        `${removeConstant(shift)}: $${scaled}|${shifted('x', c)}| = ${num(-target - shift)}$.`,
        outside === 1 ? null : `Divide both sides by $${num(outside)}$: $|${shifted('x', c)}| = ${frac(-target - shift, outside)}$.`,
        'An absolute value is never negative, so no number makes this true.',
      ], 'No solution');
    }
    default:
      return null;
  }
};

const absoluteValueInequality = (key, p) => {
  const { center: c, radius: r, inner: k } = p;
  const low = c - r;
  const high = c + r;
  const start = (latex) => `Start with $${latex}$.`;
  const done = (steps, summary) => review('absoluteValueInequality', steps, summary);
  const between = (o) => `$${num(low)} ${op(o)} x ${op(o)} ${num(high)}$`;
  const outside = (o) => `$x ${op(flip(o))} ${num(low)}$ or $x ${op(o)} ${num(high)}$`;
  const shiftedSteps = (o) => (['<', '<='].includes(o)
    ? [
      `Less than means between: $${num(-r)} ${op(o)} ${shifted('x', c)} ${op(o)} ${num(r)}$.`,
      `${removeConstant(-c, 'all three parts')}: ${between(o)}.`,
    ]
    : [
      `Greater than means outside: $${shifted('x', c)} ${op(flip(o))} ${num(-r)}$ or $${shifted('x', c)} ${op(o)} ${num(r)}$.`,
      `${removeConstant(-c, 'both sides of each')}: ${outside(o)}.`,
    ]);
  switch (key) {
    case 'and_open':
      return done([start(`|x| < ${num(r)}`), `Less than means between: the numbers less than ${num(r)} away from 0 are ${between('<')}.`], between('<'));
    case 'and_closed':
      return done([start(`|${shifted('x', c)}| \\le ${num(r)}`), ...shiftedSteps('<=')], between('<='));
    case 'or_open':
      return done([start(`|${shifted('x', c)}| > ${num(r)}`), ...shiftedSteps('>')], outside('>'));
    case 'or_closed': {
      const body = lin(k, 'x', -k * c);
      return done([
        start(`|${body}| \\ge ${num(k * r)}`),
        `Greater than means outside: $${body} \\le ${num(-k * r)}$ or $${body} \\ge ${num(k * r)}$.`,
        `${removeConstant(-k * c, 'both sides of each')}: $${term(k)} \\le ${num(k * c - k * r)}$ or $${term(k)} \\ge ${num(k * c + k * r)}$.`,
        `Divide each by $${num(k)}$ (positive, so the signs stay): ${outside('>=')}.`,
      ], outside('>='));
    }
    case 'isolate_and':
    case 'isolate_or': {
      const o = key === 'isolate_and' ? '<' : '>=';
      return done([
        start(`${num(p.outside)}|${shifted('x', c)}|${plus(p.shift)} ${op(o)} ${num(p.outside * r + p.shift)}`),
        `${removeConstant(p.shift)}, then divide both sides by $${num(p.outside)}$: $|${shifted('x', c)}| ${op(o)} ${num(r)}$.`,
        ...shiftedSteps(o),
      ], key === 'isolate_and' ? between(o) : outside(o));
    }
    case 'all_real':
      return done([
        start(`|${shifted('x', c)}| \\ge ${num(-p.target)}`),
        `An absolute value is never negative, so it is always at least $${num(-p.target)}$: every number works.`,
      ], 'All real numbers');
    case 'none': {
      const body = lin(k, 'x', -k * c);
      return done([
        start(`|${body}| < ${num(-p.target)}`),
        `An absolute value is never negative, so it is never less than $${num(-p.target)}$: no number works.`,
      ], 'No solution');
    }
    default:
      return null;
  }
};

const literalEquation = (key, names) => {
  const v = (letter) => names[letter] || letter;
  const [X, Y, A, B, C] = ['x', 'y', 'a', 'b', 'c'].map(v);
  const start = (latex) => `Start with $${latex}$.`;
  const done = (steps, solved, target = X) => review('literalEquation', steps, `$${target} = ${solved}$`);
  switch (key) {
    case 'subtract_a':
      return done([start(`${Y} = ${X} + ${A}`), `Subtract $${A}$ from both sides: $${Y} - ${A} = ${X}$.`], `${Y} - ${A}`);
    case 'add_a':
      return done([start(`${Y} = ${X} - ${A}`), `Add $${A}$ to both sides: $${Y} + ${A} = ${X}$.`], `${Y} + ${A}`);
    case 'divide_a':
      return done([start(`${Y} = ${A}${X}`), `Divide both sides by $${A}$ (with $${A} \\neq 0$): $\\frac{${Y}}{${A}} = ${X}$.`], `\\frac{${Y}}{${A}}`);
    case 'multiply_a':
      return done([start(`${Y} = \\frac{${X}}{${A}}`), `Multiply both sides by $${A}$: $${A}${Y} = ${X}$.`], `${A}${Y}`);
    case 'two_step':
      return done([
        start(`${Y} = ${A}${X} + ${B}`),
        `Subtract $${B}$ from both sides: $${Y} - ${B} = ${A}${X}$.`,
        `Divide both sides by $${A}$ (with $${A} \\neq 0$): $\\frac{${Y} - ${B}}{${A}} = ${X}$.`,
      ], `\\frac{${Y} - ${B}}{${A}}`);
    case 'grouped':
      return done([
        start(`${Y} = ${A}(${X} + ${B})`),
        `Divide both sides by $${A}$ (with $${A} \\neq 0$): $\\frac{${Y}}{${A}} = ${X} + ${B}$.`,
        `Subtract $${B}$ from both sides: $\\frac{${Y}}{${A}} - ${B} = ${X}$.`,
      ], `\\frac{${Y}}{${A}} - ${B}`);
    case 'invisible_negative':
      return done([
        start(`${Y} = ${B} - ${X}`),
        `Subtract $${B}$ from both sides: $${Y} - ${B} = -${X}$.`,
        `Multiply both sides by $-1$: $${B} - ${Y} = ${X}$.`,
      ], `${B} - ${Y}`);
    case 'negative_multi':
      return done([
        start(`${Y} = ${B} - ${A}${X}`),
        `Subtract $${B}$ from both sides: $${Y} - ${B} = -${A}${X}$.`,
        `Divide both sides by $-${A}$ (with $${A} \\neq 0$): $\\frac{${B} - ${Y}}{${A}} = ${X}$.`,
      ], `\\frac{${B} - ${Y}}{${A}}`);
    case 'perimeter': {
      const [P, L, W] = ['P', 'L', 'W'].map(v);
      return done([
        start(`${P} = 2${L} + 2${W}`),
        `Subtract $2${L}$ from both sides: $${P} - 2${L} = 2${W}$.`,
        `Divide both sides by $2$: $\\frac{${P} - 2${L}}{2} = ${W}$.`,
      ], `\\frac{${P} - 2${L}}{2}`, W);
    }
    case 'fraction_group':
      return done([
        start(`${Y} = \\frac{${A}${X} - ${B}}{${C}}`),
        `Multiply both sides by $${C}$: $${C}${Y} = ${A}${X} - ${B}$.`,
        `Add $${B}$ to both sides: $${C}${Y} + ${B} = ${A}${X}$.`,
        `Divide both sides by $${A}$ (with $${A} \\neq 0$): $\\frac{${C}${Y} + ${B}}{${A}} = ${X}$.`,
      ], `\\frac{${C}${Y} + ${B}}{${A}}`);
    default:
      return null;
  }
};

/**
 * The worked solution of one generated Solver Race round, from the
 * parameters it was generated with, or null for a structure this file does
 * not know (that round then publishes "no worked solution", as before).
 */
export const solverRaceSolutionReview = ({ family, key, params = {}, names = {} } = {}) => {
  try {
    if (family === 'linearEquation') return linearEquation(key, params);
    if (family === 'linearInequality') return linearInequality(key, params);
    if (family === 'absoluteValueEquation') return absoluteValueEquation(key, params);
    if (family === 'absoluteValueInequality') return absoluteValueInequality(key, params);
    if (family === 'literalEquation') return literalEquation(key, names);
  } catch {
    return null;
  }
  return null;
};
