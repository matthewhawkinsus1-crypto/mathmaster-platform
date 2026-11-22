/*
 * THE RADICAL EQUATION REPLAY, WITH ITS FACTORING SLIDES (WE-D;
 * docs/platform/WORKED_EXAMPLES.md sections 3, 4 and 7).
 *
 * A worked example for a radical equation solved on the relation workspace
 * plays as that workspace's own moves: isolate the radical, raise both sides,
 * multiply out, collect to zero, factor, the zero product property, solve
 * each branch, then check every candidate in the first equation. A candidate
 * that does not check is rejected on a slide of its own.
 *
 * Every line of a slide is a relation state the workspace's own commit
 * accepts: validateRelationTransition (algebraRelationFoundation.mjs), the
 * function the board and the server's step replay both run. The line an
 * operation leaves "on both sides" is applyBalancedOperationToRelation's, the
 * raised line is raiseRadicalRelation's, and a check's two values are
 * radicalSidesAt's (radicalEquationShape.mjs, exact). A path with a line the
 * engine refuses is REFUSED whole: replayRadicalEquation returns
 * { ok: false, error } and nothing is played.
 *
 * NO STEP IS GLOSSED OVER. The factor step opens the factoring skill's own
 * slides, with the numbers the lesson's factoring method finds
 * (factorQuadraticByMethod, factoringVariant.js):
 *
 *   x² + bx + c    4 slides: what to look for; the factor pairs and their
 *                  sums; the factors, checked by multiplying back; the zero
 *                  product property.
 *   ax² + bx + c   6 slides: a·c; the factor pairs; split the middle term;
 *                  group; factor out the common binomial; the zero product
 *                  property.
 *
 * Each such step carries `subSkill: { skill, index, count, optional }`.
 * Classwork plays them all in the sequence; on Practice the optional ones
 * stay behind the factor step's **Show how** (exampleSlides.js).
 *
 * Two sources:
 *
 *   built in   radicalSiblingEquation(item's equation): the same kind of
 *              radical equation with other numbers, whose quadratic is a
 *              trinomial the slides above factor;
 *   authored   `lessonSupports.examples[]` with `tool: "radicalEquation"`,
 *              `sibling.equation` and `moves` ([{ op: "square", why }, { op:
 *              "collectToZero" }, { op: "factor", detail }, { op:
 *              "zeroProduct" }, { check: "each" }]). The moves must be the
 *              tool's own path for that equation, in order; each supplies its
 *              `why`. The text of a line is never authored.
 */
import {
  applyBalancedOperationToBranches,
  applyBalancedOperationToRelation,
  parseRelationSource,
  raiseRadicalRelation,
  relationExpressionToLatex,
  relationExpressionsEquivalent,
  relationStateToLatex,
  validateRelationTransition,
} from '../../../../functions/shared/toolMath/algebra-relations/algebraRelationFoundation.mjs';
import {
  parseRadicalEquation,
  radicalSidesAt,
  rational,
  rationalEquals,
  rationalToText,
  solveRadicalShape,
} from '../../../../functions/shared/toolMath/algebra-relations/radicalEquationShape.mjs';
import { factorQuadraticByMethod } from './factoringVariant.js';

export const RADICAL_REPLAY_TOOL = 'radicalEquation';
export const RADICAL_REPLAY_OPERATIONS = Object.freeze(['add', 'subtract', 'multiply', 'divide', 'square', 'raise', 'collectToZero', 'factor', 'zeroProduct']);
export const FACTOR_SKILL = Object.freeze({ SIMPLE: 'factor.trinomial', AC: 'factor.trinomialAC' });
export const FACTOR_SLIDE_COUNT = Object.freeze({ [FACTOR_SKILL.SIMPLE]: 4, [FACTOR_SKILL.AC]: 6 });
export const RADICAL_BOARD = Object.freeze({ MOVE: 'move', CHECK: 'check', REJECT: 'reject' });

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const refused = (error) => ({ ok: false, error });

/** The tool the entry plays on. */
export const isRadicalReplayEntry = (entry) => isObject(entry) && text(entry.tool) === RADICAL_REPLAY_TOOL && Boolean(text(entry.sibling?.equation));

/* ------------------------------------------------------------ exact numbers */

const Q = rational;
const ZERO = Q(0);
const ONE = Q(1);
const sub = (a, b) => Q(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a, b) => Q(a.n * b.n, a.d * b.d);
const div = (a, b) => Q(a.n * b.d, a.d * b.n);
const neg = (a) => Q(-a.n, a.d);
const isZero = (a) => a.n === 0;
const isNeg = (a) => a.n < 0;
const abs = (a) => (isNeg(a) ? neg(a) : a);
const isWhole = (a) => a.d === 1;
const pow = (a, k) => { let out = ONE; for (let i = 0; i < k; i += 1) out = mul(out, a); return out; };
const num = (value) => rationalToText(value);
const bracketed = (value) => (value.d === 1 ? num(value) : `(${num(value)})`);

/* --------------------------------------------- expressions the engine reads */

// A sum of terms, each [coefficient, body]: "4*x^2 - 12*x - x + 3".
const sumText = (terms) => {
  const parts = [];
  for (const [coefficient, body] of terms) {
    if (isZero(coefficient)) continue;
    const size = abs(coefficient);
    const lead = body && rationalEquals(size, ONE) ? '' : `${bracketed(size)}${body ? ' ' : ''}`;
    parts.push(`${parts.length ? (isNeg(coefficient) ? ' - ' : ' + ') : (isNeg(coefficient) ? '-' : '')}${lead}${body}`);
  }
  return parts.join('') || '0';
};
const linearText = (a, b, v) => sumText([[a, v], [b, '']]);
const quadraticText = (A, B, C, v) => sumText([[A, `${v}^2`], [B, v], [C, '']]);
const wholeLinear = (d, e, v) => linearText(Q(d), Q(e), v);

const stateLatex = (state) => relationStateToLatex(state).split('=').map((side) => side.trim()).join(' = ');
const expressionLatex = (expression) => {
  try {
    return relationExpressionToLatex(expression).trim();
  } catch {
    return String(expression);
  }
};
const withBranches = (state, pairs) => ({
  ...state,
  special: null,
  branches: pairs.map((expressions) => ({ expressions: [...expressions], relations: ['='] })),
  connective: pairs.length > 1 ? 'OR' : null,
});

/* ------------------------------------------------------------ the whys */

export const RADICAL_WHY = Object.freeze({
  isolate: 'Get the radical alone on its side before raising, so the power undoes the root.',
  raise: 'Raising both sides to the index of the root undoes it. It can add a candidate that is not a solution, so every candidate is checked at the end.',
  expand: 'Multiply the binomial by itself: every term times every term.',
  collect: 'A quadratic is solved with 0 on one side.',
  linear: 'Undo what is done to the variable, the same on both sides.',
  lookFor: 'Multiplying two binomials back gives the sum in the middle term and the product in the last term.',
  pairs: 'Only one pair of numbers has both the product and the sum.',
  factors: 'Multiplying the factors back gives the trinomial, so the factoring is right.',
  ac: 'The two numbers that split the middle term multiply to a times c.',
  split: 'The two terms add back to the middle term, so the equation is unchanged.',
  group: 'Each pair of terms has its own common factor, and what is left is the same binomial.',
  binomial: 'The same binomial is in both groups, so it comes out as a common factor.',
  zeroProduct: 'A product is 0 only when one of its factors is 0.',
  branch: 'Solve this factor\'s equation for the variable.',
  checkHolds: 'The value makes both sides of the first equation equal, so it is a solution.',
  checkFails: 'The value came from raising both sides, but it does not make the first equation true. It is extraneous: reject it.',
});

/* ------------------------------------------------------------- the path */

const pairsWithSums = (product) => {
  const pairs = [];
  const size = Math.abs(product);
  for (let d = 1; d * d <= size; d += 1) {
    if (size % d !== 0) continue;
    const e = size / d;
    const found = product > 0 ? [[d, e], [-d, -e]] : [[d, -e], [-d, e]];
    for (const pair of found) if (!pairs.some((known) => known[0] === pair[1] && known[1] === pair[0])) pairs.push(pair);
  }
  return pairs;
};
const signedNumber = (value) => `$${value}$`;
const pairsSentence = (pairs) => pairs.map(([d, e]) => `${signedNumber(d)} and ${signedNumber(e)} add to ${signedNumber(d + e)}`).join('; ');

/**
 * The tool's own path through a radical equation, each line accepted by the
 * workspace's commit:
 *
 *   radicalPath(source, variable)
 *     → { ok: true, shape, expected, first, steps: [{ op, operand?, auto, label, why, lines, state, subSkill?, alone? }] }
 *     | { ok: false, error }
 *
 * `auto` steps (multiply out, the factoring slides before the factors, a
 * branch's own solve) are the path's, not moves a script names.
 */
export const radicalPath = (source, variable = null) => {
  const equation = text(isObject(source) ? source.equation : source);
  const named = text(isObject(source) ? source.variable : variable) || null;
  const parsed = parseRadicalEquation(equation, { variable: named });
  if (!parsed.ok) return refused(`the sibling equation is not a radical equation the tool verifies (${parsed.reason || 'it cannot be read'}). Write it as text, for example { "equation": "sqrt(x + 6) = 2x - 3" }.`);
  const { shape } = parsed;
  const expected = solveRadicalShape(shape);
  if (!expected.ok) return refused(`the tool cannot solve the sibling equation exactly (${expected.reason}).`);
  if (expected.structuralNoSolution) return refused('the sibling equation has no solution by its structure, so it has no moves to play.');
  if (shape.radicalSide !== 'left') return refused('write the sibling equation with its radical on the left side.');

  const v = shape.variable;
  const first = parseRelationSource(equation, v);
  let state = first;
  const steps = [];
  const fail = (label) => { throw new Error(`the tool does not accept the line after "${label}"`); };
  const commit = (label, after, transition) => {
    const verdict = validateRelationTransition(state, after, transition);
    if (!verdict.valid) fail(label);
  };
  const line = (id, name, latex, result = false) => ({ id, name, latex, ...(result ? { result: true } : {}) });
  const push = (step, after) => {
    steps.push({ auto: false, ...step, state: after, show: `${step.label}: $${stateLatex(after)}$.` });
    state = after;
  };
  // One balanced operation, on one branch: the engine's own line with the
  // operation on both sides, then the simplified line it must be equal to.
  const balanced = ({ op, operand, label, why, after, branch = 0, auto = false, as = null }) => {
    const transition = { kind: 'balancedOperation', operation: op, operandExpression: operand, branchIndices: [branch] };
    commit(label, after, transition);
    let applied = null;
    try {
      applied = state.branches.length > 1
        ? applyBalancedOperationToBranches(state, op, operand, { branchIndices: [branch] }).state
        : applyBalancedOperationToRelation(state, op, operand, { branchIndex: branch }).state;
    } catch {
      applied = null;
    }
    push({
      op: as || op,
      ...(as ? {} : { operand }),
      auto,
      label,
      why,
      lines: [
        line('before', 'Start with', stateLatex(state)),
        applied ? line('applied', 'The same move on both sides', stateLatex(applied)) : null,
        line('after', 'Simplify', stateLatex(after), true),
      ].filter(Boolean),
    }, after);
  };
  const single = (left, right) => withBranches(state, [[left, right]]);

  try {
    const radicandText = linearText(shape.radicand.m, shape.radicand.b, v);
    const radical = shape.index === 2 ? `sqrt(${radicandText})` : `nthRoot(${radicandText}, ${shape.index})`;
    const outside = shape.left.c0;
    const alpha = shape.alpha;
    let rightLinear = shape.right.c1;
    let rightConstant = shape.right.c0;

    // 1. Isolate the radical.
    if (!isZero(outside)) {
      rightConstant = sub(rightConstant, outside);
      const op = isNeg(outside) ? 'add' : 'subtract';
      balanced({
        op,
        operand: num(abs(outside)),
        label: `${op === 'add' ? 'Add' : 'Subtract'} $${num(abs(outside))}$ on both sides`,
        why: RADICAL_WHY.isolate,
        after: single(rationalEquals(alpha, ONE) ? radical : `${bracketed(alpha)}*${radical}`, linearText(rightLinear, rightConstant, v)),
      });
    }
    if (!rationalEquals(alpha, ONE)) {
      rightConstant = div(rightConstant, alpha);
      rightLinear = div(rightLinear, alpha);
      balanced({
        op: 'divide',
        operand: num(alpha),
        label: `Divide both sides by $${num(alpha)}$`,
        why: RADICAL_WHY.isolate,
        after: single(radical, linearText(rightLinear, rightConstant, v)),
      });
    }

    // 2. Raise both sides to the index: the engine's own raised line.
    const { r, s } = shape.isolated;
    const quadratic = shape.index === 2 && !isZero(r);
    const raised = raiseRadicalRelation(state, 0, shape.index);
    if (!raised.ready) fail('isolating the radical');
    const raiseLabel = shape.index === 2 ? 'Square both sides' : `Raise both sides to the power $${shape.index}$`;
    commit(raiseLabel, raised.state, { kind: 'radicalRaise', branchIndex: 0, power: shape.index });
    push({
      op: shape.index === 2 ? 'square' : 'raise',
      label: raiseLabel,
      why: RADICAL_WHY.raise,
      lines: [line('before', 'Start with', stateLatex(state)), line('after', shape.index === 2 ? 'Each side squared' : `Each side to the power ${shape.index}`, stateLatex(raised.state), true)],
    }, raised.state);

    const rewrite = ({ label, why, name, after, subSkill = null, op = 'expand' }) => {
      commit(label, after, { kind: 'equivalentRewrite' });
      push({ op, auto: true, label, why, ...(subSkill ? { subSkill } : {}), lines: [line('before', 'Start with', stateLatex(state)), line('after', name, stateLatex(after), true)] }, after);
    };

    if (quadratic) {
      // 3. Multiply out, then collect to zero.
      const A = mul(r, r);
      const squared = quadraticText(A, mul(mul(Q(2), r), s), mul(s, s), v);
      rewrite({ label: 'Multiply out the squared side', why: RADICAL_WHY.expand, name: 'Multiplied out', after: single(radicandText, squared) });
      const B = sub(mul(mul(Q(2), r), s), shape.radicand.m);
      const C = sub(mul(s, s), shape.radicand.b);
      const collected = quadraticText(A, B, C, v);
      balanced({
        op: 'subtract',
        as: 'collectToZero',
        operand: radicandText,
        label: `Subtract $${expressionLatex(radicandText)}$ on both sides, to get $0$ on one side`,
        why: RADICAL_WHY.collect,
        after: single('0', collected),
      });

      // 4. Factor, with the factoring skill's own slides.
      if (![A, B, C].every(isWhole)) throw new Error('its quadratic does not have whole-number coefficients');
      const found = factorQuadraticByMethod(A.n, B.n, C.n, v);
      if (!found) throw new Error(`its quadratic ${collected} is not a trinomial the factoring slides factor (a common factor, a perfect square, or no whole-number pair)`);
      const { p, q, r: fr, s: fs } = found.split;
      const ac = A.n * C.n;
      const skill = A.n === 1 ? FACTOR_SKILL.SIMPLE : FACTOR_SKILL.AC;
      const count = FACTOR_SLIDE_COUNT[skill];
      const collectedState = state;
      const collectedLatex = expressionLatex(collected);
      const factors = [[p, q], [fr, fs]];
      const factored = `(${wholeLinear(p, q, v)})*(${wholeLinear(fr, fs, v)})`;
      if (!relationExpressionsEquivalent(factored, collected, v)) fail('Factor');
      const said = (index, optional, label, why, show) => steps.push({
        op: 'factor', auto: true, label, why, show, lines: null, state, subSkill: { skill, index, count, optional },
      });
      const pairs = pairsWithSums(ac);
      const pairLine = `The factor pairs of $${ac}$: ${pairsSentence(pairs)}. The pair $${found.m}$ and $${found.n}$ adds to $${B.n}$.`;
      const factorLines = (before, name) => [
        line('before', 'Start with', before),
        line('after', name, stateLatex(single('0', factored)), true),
        line('multiplied', 'Multiplied back', `${expressionLatex(factored)} = ${collectedLatex}`),
      ];
      const alone = { lines: factorLines(stateLatex(collectedState), 'Factored') };
      if (skill === FACTOR_SKILL.SIMPLE) {
        said(1, true, 'Factoring: what to look for', RADICAL_WHY.lookFor, `Factor $${collectedLatex}$. Look for two numbers that multiply to $${C.n}$ and add to $${B.n}$.`);
        said(2, true, 'Factoring: the factor pairs and their sums', RADICAL_WHY.pairs, pairLine);
        commit('Factor', single('0', factored), { kind: 'factor', branchIndex: 0 });
        push({ op: 'factor', label: 'Factor', why: RADICAL_WHY.factors, subSkill: { skill, index: 3, count, optional: false }, alone, lines: alone.lines }, single('0', factored));
      } else {
        said(1, true, 'Factoring: multiply a and c', RADICAL_WHY.ac, `Factor $${collectedLatex}$. Multiply $a$ and $c$: $${A.n} \\cdot ${C.n < 0 ? `(${C.n})` : C.n} = ${ac}$.`);
        said(2, true, 'Factoring: the factor pairs', RADICAL_WHY.pairs, pairLine);
        const splitText = sumText([[A, `${v}^2`], [Q(found.m), v], [Q(found.n), v], [C, '']]);
        rewrite({ op: 'factor', label: 'Factoring: split the middle term', why: RADICAL_WHY.split, name: 'The middle term as two terms', after: single('0', splitText), subSkill: { skill, index: 3, count, optional: true } });
        const binomial = wholeLinear(fr, fs, v);
        const grouped = `${p === 1 ? v : `${p}*${v}`}*(${binomial}) ${q < 0 ? '-' : '+'} ${Math.abs(q)}*(${binomial})`;
        rewrite({ op: 'factor', label: 'Factoring: group', why: RADICAL_WHY.group, name: 'Each pair with its common factor taken out', after: single('0', grouped), subSkill: { skill, index: 4, count, optional: true } });
        const groupedLatex = stateLatex(state);
        // The factored line is judged against the collected equation, as the board's Factor tool judges it.
        if (!validateRelationTransition(collectedState, single('0', factored), { kind: 'factor', branchIndex: 0 }).valid) fail('Factor');
        push({
          op: 'factor',
          label: 'Factor out the common binomial',
          why: RADICAL_WHY.binomial,
          subSkill: { skill, index: 5, count, optional: false },
          alone: { label: 'Factor', why: RADICAL_WHY.factors, lines: alone.lines },
          lines: factorLines(groupedLatex, 'The common binomial taken out'),
        }, single('0', factored));
      }

      // 5. The zero product property: one branch for each factor.
      const branches = withBranches(state, factors.map(([d, e]) => [wholeLinear(d, e, v), '0']));
      commit('Zero product property', branches, { kind: 'zeroProduct', branchIndex: 0 });
      push({
        op: 'zeroProduct',
        label: 'Use the zero product property',
        why: RADICAL_WHY.zeroProduct,
        subSkill: { skill, index: count, count, optional: false },
        lines: [line('before', 'Start with', stateLatex(state)), line('after', 'Each factor equal to 0', stateLatex(branches), true)],
      }, branches);

      // 6. Solve each branch.
      factors.forEach(([d, e], index) => {
        const name = String.fromCharCode(65 + index);
        const pairsNow = () => state.branches.map((branch) => [...branch.expressions]);
        if (e !== 0) {
          const next = pairsNow();
          next[index] = [d === 1 ? v : `${d}*${v}`, String(-e)];
          const op = e < 0 ? 'add' : 'subtract';
          balanced({ op, operand: String(Math.abs(e)), branch: index, auto: true, label: `Branch ${name}: ${op === 'add' ? 'add' : 'subtract'} $${Math.abs(e)}$ on both sides`, why: RADICAL_WHY.branch, after: withBranches(state, next) });
        }
        if (d !== 1) {
          const next = pairsNow();
          next[index] = [v, num(Q(-e, d))];
          balanced({ op: 'divide', operand: String(d), branch: index, auto: true, label: `Branch ${name}: divide both sides by $${d}$`, why: RADICAL_WHY.branch, after: withBranches(state, next) });
        }
      });
    } else {
      // A root equal to a number: a linear equation after raising.
      const { m, b } = shape.radicand;
      let right = pow(s, shape.index);
      if (!isZero(b)) {
        right = sub(right, b);
        const op = isNeg(b) ? 'add' : 'subtract';
        balanced({ op, operand: num(abs(b)), label: `${op === 'add' ? 'Add' : 'Subtract'} $${num(abs(b))}$ on both sides`, why: RADICAL_WHY.linear, after: single(linearText(m, ZERO, v), num(right)) });
      }
      if (!rationalEquals(m, ONE)) {
        balanced({ op: 'divide', operand: num(m), label: `Divide both sides by $${num(m)}$`, why: RADICAL_WHY.linear, after: single(v, num(div(right, m))) });
      }
    }
  } catch (error) {
    return refused(`${text(error?.message) || 'the tool cannot play it'}.`);
  }
  return { ok: true, shape, expected, first, steps, solvedAt: steps.length };
};

/* ------------------------------------------------------------ the check */

const substituted = (expression, variable, value) => String(expression)
  .replace(new RegExp(`(\\d)\\s*\\*?\\s*${variable}\\b`, 'g'), `$1*(${value})`)
  .replace(new RegExp(`\\b${variable}\\b`, 'g'), `(${value})`);

const checkStep = (path, value, why) => {
  const { shape, first } = path;
  const v = shape.variable;
  const sides = radicalSidesAt(shape, value);
  if (!sides.defined || sides.left === null || sides.right === null) return null;
  const holds = rationalEquals(sides.left, sides.right);
  const valueText = num(value);
  const valueLatex = expressionLatex(valueText);
  const [left, right] = first.branches[0].expressions;
  const put = `${expressionLatex(substituted(left, v, valueText))} = ${expressionLatex(substituted(right, v, valueText))}`;
  const leftLatex = expressionLatex(num(sides.left));
  const rightLatex = expressionLatex(num(sides.right));
  const firstLatex = stateLatex(first);
  const line = (id, name, latex, result = false) => ({ id, name, latex, ...(result ? { result: true } : {}) });
  return {
    op: 'check',
    auto: false,
    holds,
    value,
    label: `Check $${v} = ${valueLatex}$ in the first equation`,
    why: text(why) || (holds ? RADICAL_WHY.checkHolds : RADICAL_WHY.checkFails),
    show: holds
      ? `Check: put $${v} = ${valueLatex}$ into $${firstLatex}$. Both sides equal $${leftLatex}$, so $${v} = ${valueLatex}$ is a solution.`
      : `Check: put $${v} = ${valueLatex}$ into $${firstLatex}$. The left side is $${leftLatex}$ and the right side is $${rightLatex}$. They are not equal, so $${v} = ${valueLatex}$ is extraneous: reject it.`,
    kind: holds ? RADICAL_BOARD.CHECK : RADICAL_BOARD.REJECT,
    lines: [
      line('before', 'The first equation', firstLatex),
      line('applied', 'With the value put in', put),
      line('after', holds ? 'Both sides are equal' : 'The two sides are not equal', holds ? `${leftLatex} = ${rightLatex}` : `${leftLatex} \\ne ${rightLatex}`, true),
      line('verdict', holds ? 'A solution' : 'Extraneous: rejected', `${v} = ${valueLatex}`),
    ],
  };
};

/* ------------------------------------------------------------ the replay */

const played = new Map();
const PLAYED_KEPT = 48;
const boardOf = (step) => (step.lines ? { kind: step.kind || RADICAL_BOARD.MOVE, operation: step.op, label: step.label, lines: step.lines } : null);
const slideOf = (step) => {
  const board = boardOf(step);
  const alone = step.alone ? { show: `${step.alone.label || step.label}: $${stateLatex(step.state)}$.`, why: step.alone.why || step.why, board: boardOf({ ...step, label: step.alone.label || step.label, lines: step.alone.lines }) } : null;
  return {
    show: step.show,
    why: step.why,
    ...(board ? { board } : {}),
    ...(step.subSkill ? { subSkill: step.subSkill } : {}),
    ...(alone ? { alone } : {}),
  };
};

/**
 * Play a radical equation through the tool's own path.
 *
 *   replayRadicalEquation({ sibling: { equation }, moves? })
 *     → { ok: true, prompt, steps: [{ show, why, board?, subSkill?, alone? }], answer, moveCount, fadeLimit, factorSkill }
 *     | { ok: false, error }
 *
 * With no `moves` the path plays with its own whys. With `moves`, they must
 * name the path's own moves in order (the automatic steps are not named), and
 * each move's `why` and a factor move's `detail` are read from it.
 */
export const replayRadicalEquation = ({ sibling = null, equation: equationText = '', moves = null } = {}) => {
  const source = isObject(sibling) ? sibling : { equation: equationText };
  const key = `${text(source.equation)}\u0001${text(source.variable)}`;
  let path = played.get(key);
  if (!path) {
    path = radicalPath(source);
    if (played.size >= PLAYED_KEPT) played.delete(played.keys().next().value);
    played.set(key, path);
  }
  if (!path.ok) return path;
  const v = path.shape.variable;
  const factorSkill = path.steps.find((step) => step.subSkill)?.subSkill.skill || null;
  const whys = new Map();
  let checkWhy = '';

  if (moves !== null && moves !== undefined) {
    const script = list(moves);
    if (!script.length) return refused('it has no moves to play.');
    const named = path.steps.filter((step) => !step.auto);
    const describe = (step) => (step.operand !== undefined ? `{ "op": "${step.op}", "operand": "${step.operand}" }` : `{ "op": "${step.op}" }`);
    let at = 0;
    for (let index = 0; index < script.length; index += 1) {
      const move = script[index];
      const where = `moves[${index}]`;
      if (!isObject(move)) return refused(`${where} is not a move.`);
      if (move.check !== undefined && move.op === undefined) {
        if (at < named.length) return refused(`${where} checks the candidates before the equation is solved. The tool's next move is ${describe(named[at])}.`);
        if (index !== script.length - 1) return refused(`${where} is the check, and the check is the last move.`);
        checkWhy = text(move.why);
        at = named.length + 1;
        continue;
      }
      const op = text(move.op) === 'raise' && path.shape.index === 2 ? 'square' : text(move.op);
      if (!RADICAL_REPLAY_OPERATIONS.includes(op)) return refused(`${where}.op "${text(move.op)}" is not a move of the radical equation tool. Use ${RADICAL_REPLAY_OPERATIONS.join(', ')}.`);
      const expected = named[at];
      if (!expected) return refused(`${where} comes after the equation is solved. The next move is { "check": "each" }.`);
      const sameOperand = expected.operand === undefined || move.operand === undefined
        ? expected.operand === undefined || ['collectToZero'].includes(op)
        : relationExpressionsEquivalent(String(move.operand), expected.operand, v);
      if (op !== expected.op || !sameOperand) return refused(`${where} is not the tool's move here. On this equation the next move is ${describe(expected)}.`);
      if (op === 'factor' && move.detail !== undefined && text(move.detail) !== expected.subSkill.skill) {
        return refused(`${where}.detail "${text(move.detail)}" is not this quadratic's factoring. It is "${expected.subSkill.skill}".`);
      }
      if (text(move.why)) whys.set(expected, text(move.why));
      at += 1;
    }
    if (at < named.length) return refused(`its moves stop before the equation is solved. The next move is ${describe(named[at])}.`);
    if (at === named.length) return refused('its moves end without the check. A radical equation\'s candidates are always checked: add { "check": "each" }.');
  }

  const checks = [];
  for (const candidate of path.expected.candidates) {
    const step = checkStep(path, candidate, checkWhy && rationalEquals(candidate, path.expected.genuine[0] || candidate) ? checkWhy : '');
    if (!step) return refused(`the tool cannot check ${v} = ${num(candidate)} exactly.`);
    checks.push(step);
  }
  if (checks.filter((step) => step.holds).length !== path.expected.genuine.length) return refused('the checks do not agree with the tool\'s own solution.');

  const steps = [...path.steps.map((step) => (whys.has(step) ? { ...step, why: whys.get(step) } : step)), ...checks].map(slideOf);
  const genuine = path.expected.genuine.map((value) => `$${v} = ${expressionLatex(num(value))}$`);
  // A faded example stops before the line that first gives the variable a value.
  const firstValue = path.steps.findIndex((step) => step.op === 'zeroProduct');
  const fadeLimit = firstValue >= 0 ? firstValue : Math.max(0, path.steps.length - 1);
  return {
    ok: true,
    prompt: `Solve $${stateLatex(path.first)}$ for $${v}$. Check each candidate.`,
    steps,
    answer: genuine.length ? genuine.join(' or ') : 'No real solution: every candidate is extraneous.',
    moveCount: path.steps.length,
    fadeLimit,
    factorSkill,
    candidates: path.expected.candidates.map(num),
    extraneous: path.expected.extraneous.map(num),
  };
};

/* ------------------------------------------------------------ the sibling */

const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));

/**
 * A sibling for a radical equation item: the same kind of equation with other
 * numbers, or null. A square root with the variable on the other side keeps
 * its leading coefficient's size (1, or more than 1), whether a number stands
 * outside the radical, and how many of its candidates are extraneous; its
 * quadratic is a trinomial with two different non-zero roots, so the
 * factoring slides apply. A root equal to a number keeps its index.
 */
export const radicalSiblingEquation = (itemEquation, { seed = 0, variable = null } = {}) => {
  const parsed = parseRadicalEquation(text(itemEquation), { variable: text(variable) || null });
  if (!parsed.ok) return null;
  const { shape } = parsed;
  const solved = solveRadicalShape(shape);
  if (!solved.ok) return null;
  const v = shape.variable;
  const itemValues = new Set(list(solved.candidates).map(num));
  const outside = !isZero(shape.left.c0);
  const written = ({ radicand, k, right }) => {
    const radical = k === 2 ? `sqrt(${radicand})` : `nthRoot(${radicand}, ${k})`;
    return `${radical}${outside ? (isNeg(shape.left.c0) ? ' - ' : ' + ') + String(2 + (Math.abs(Number(seed) || 0) % 3)) : ''} = ${right}`;
  };
  const shift = outside ? (isNeg(shape.left.c0) ? -1 : 1) * (2 + (Math.abs(Number(seed) || 0) % 3)) : 0;
  const options = [];
  if (shape.index === 2 && !isZero(shape.isolated.r)) {
    const lead = isWhole(shape.isolated.r) && Math.abs(shape.isolated.r.n) > 1 ? 2 : 1;
    const wantExtraneous = Math.min(list(solved.extraneous).length, 1);
    // (d1·x − n1)(d2·x − n2) with d1·d2 = lead²: the candidates n1/d1 and n2/d2.
    const shapes = lead === 1 ? [[1, 1]] : [[4, 1], [1, 4]];
    for (const [d1, d2] of shapes) {
      for (let n1 = -9; n1 <= 9; n1 += 1) {
        for (let n2 = -9; n2 <= 9; n2 += 1) {
          if (!n1 || !n2 || n1 * d2 === n2 * d1 || gcd(n1, d1) !== 1 || gcd(n2, d2) !== 1) continue;
          if (d1 === d2 && n1 > n2) continue;
          for (let s = -6; s <= 6; s += 1) {
            // (lead·x + s)² − (m·x + b) = (d1·x − n1)(d2·x − n2)
            const m = 2 * lead * s + (d1 * n2 + d2 * n1);
            const b = s * s - n1 * n2;
            if (m < 1 || m > 9 || Math.abs(b) > 30) continue;
            const roots = [Q(n1, d1), Q(n2, d2)];
            const extraneous = roots.filter((root) => isNeg(Q(lead * root.n + s * root.d, root.d))).length;
            if (extraneous !== wantExtraneous) continue;
            if (roots.some((root) => itemValues.has(num(root)))) continue;
            // Nicest first: a whole, positive solution and small numbers.
            const genuine = roots.filter((root) => !isNeg(Q(lead * root.n + s * root.d, root.d)));
            const cost = genuine.reduce((sum, root) => sum + (isWhole(root) ? 0 : 6) + (isNeg(root) ? 6 : 0), 0) + Math.abs(s + shift) + Math.abs(b) / 4 + m / 2;
            options.push({ cost, equation: written({ radicand: linearText(Q(m), Q(b), v), k: 2, right: linearText(Q(lead), Q(s + shift), v) }) });
          }
        }
      }
    }
  } else if (isZero(shape.isolated.r)) {
    const k = shape.index;
    for (let s = 2; s <= (k > 2 ? 3 : 6); s += 1) {
      for (let m = 1; m <= 4; m += 1) {
        for (let x0 = 1; x0 <= 12; x0 += 1) {
          const b = s ** k - m * x0;
          if (!x0 || !b || Math.abs(b) > 40 || itemValues.has(String(x0))) continue;
          options.push({ cost: Math.abs(b) / 4 + m + x0 / 4, equation: written({ radicand: linearText(Q(m), Q(b), v), k, right: String(s + shift) }) });
        }
      }
    }
  }
  // Tried from the seed's own choice on, until one is a path the tool plays.
  options.sort((one, two) => one.cost - two.cost || (one.equation < two.equation ? -1 : 1));
  const nicest = options.slice(0, 16);
  for (let turn = 0; turn < Math.min(nicest.length, 12); turn += 1) {
    const { equation } = nicest[(((Number(seed) || 0) + turn * 5) % nicest.length + nicest.length) % nicest.length];
    if (equation.replace(/\s+/g, '') === text(itemEquation).replace(/\s+/g, '')) continue;
    if (replayRadicalEquation({ sibling: { equation, variable: v } }).ok) return { equation, variable: v };
  }
  return null;
};

/* ------------------------------------------------- Pre-Flight's refusal */

/**
 * The errors Pre-Flight and the compiler raise for a lesson's radical
 * equation replays: a script that is not the tool's own path to the answer.
 */
export const radicalReplayErrors = (input = {}) => {
  const errors = [];
  list(input?.lessonSupports?.examples).forEach((entry, index) => {
    if (!isRadicalReplayEntry(entry) || !Array.isArray(entry.moves)) return;
    const replay = replayRadicalEquation({ sibling: entry.sibling, moves: entry.moves });
    if (!replay.ok) {
      errors.push(`lessonSupports.examples[${index}] is a radical equation replay the tool cannot play: ${replay.error} A replay is checked by the tool's own engine, so its moves must be the tool's own.`);
      return;
    }
    const fade = isObject(entry.fade) ? (Number.isInteger(entry.fade.handOverAfter) ? entry.fade.handOverAfter : Number.isInteger(entry.fade.fromStep) ? entry.fade.fromStep - 1 : 0) : 0;
    if (fade > replay.fadeLimit) {
      errors.push(`lessonSupports.examples[${index}].fade would show the candidates: a faded radical example stops before the zero product property. Use handOverAfter of ${replay.fadeLimit} or less.`);
    }
  });
  return errors;
};
