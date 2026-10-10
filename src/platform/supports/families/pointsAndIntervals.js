// Question family: ordered pairs, number lines, inequalities and interval notation: orderedPair, numberLine, intervalNumberLine, signSolutionAnalyzer.
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
// WHAT THIS FAMILY OWNS (fifth in the index order; linearEquations, systems,
// linesAndSlope and fractions claim none of these shapes):
//
//   intervalNumberLine   the key is the question's `intervals` (the classroom
//                        tool and its grader) or `expectedIntervals` (a Path
//                        template instance). What the student is GIVEN decides
//                        what is secret:
//                          graph     the prompt states the inequality the key
//                                    graphs (x > 2, −4 ≤ x < 3, x ≤ −5 or x > 1)
//                          solve     the prompt states a linear inequality whose
//                                    solution is the key (Solve 3x − 10 > −13)
//                          factored  the prompt states a product of linear
//                                    factors compared with 0 ((x + 6)(x − 3) ≥ 0)
//                          verbal    the prompt states the condition in words
//                                    ("at least 49")
//                          unknown   any other key: generic hints only, no sibling
//   signSolutionAnalyzer polynomial and rational sign charts, and the radical
//                        candidate check — read with the grader's own fields
//                        and rules (signSolutionMath.mjs). An item with no
//                        sign-chart data of its own is NOT claimed: the analyzer
//                        would draw its demo problem, or the runtime repair
//                        opens it on Step Algebra.
//   orderedPair          a point read off a plotted graph, the meeting point of
//                        two lines y = mx + b stated in the prompt (or drawn as
//                        graph lines), or any other pair key (generic hints).
//   numberLine           the legacy "select the target" number line (numeric
//                        target or answer).
//   stepAlgebra/algebra  ONE linear inequality in one variable (2x + 3 ≤ 7,
//                        Solve −2x + 3 > 7.) — linearEquations leaves these here.
//
// NOT owned: multiAnswer items (no platform question family covers points or
// intervals, and no corpus item is unmistakably one), absolute-value and
// quadratic relations on Step Algebra, three-part linear chains, and the
// systemsWorkspace inequality mode.
//
// SAFETY. Every hint, back-up text and sibling is checked with
// hintRevealsAnswer (the platform's guard) against this question's answers —
// the forms expectedValues lists plus the plain keys questionAnswerValues
// reads. Each hint has two spellings, one quoting this problem and a plain one;
// the quoted one is used only when it reveals nothing (Solve −5x + 4 ≥ −16 has
// its answer 4 in it, so that hint falls back to the plain spelling). A sibling
// is redrawn until none of its steps contains one of this question's answers.
// Only what the student is given is ever quoted: the inequality to graph, the
// inequality to solve, the factors, the radical equation, the two lines. A
// plotted point and a "select the target" number line have no given numbers
// but the answer itself (the generated graph window is centred on the point),
// so their hints name none, apart from the number line's label spacing.
//
// Pure: no React, no I/O. Exact rational arithmetic for everything solved.
import { hintRevealsAnswer } from '../../../../functions/shared/pathSolutionSupport.mjs';
import {
  intervalsToInequality,
  normalizeIntervals,
  resolveIntervalAsk,
  sameIntervals,
} from '../../../../functions/shared/toolMath/intervalNumberLine/intervalMath.mjs';
import { inequalitySolutionRepresentationStages } from '../../../../functions/shared/toolMath/algebra-relations/inequalityRepresentationPolicy.mjs';
import {
  buildSignIntervals,
  evaluateRadicalEquationCandidate,
  solutionPiecesForRelation,
} from '../../../../functions/shared/toolMath/signSolutionAnalyzer/signSolutionMath.mjs';
import {
  STEP_ALGEBRA_MODES,
  relationSourceFromQuestion,
  resolveStepAlgebraMode,
} from '../../../../functions/shared/serverGrading/stepAlgebraRouting.mjs';
import { withPromptRelationSource } from '../../../../functions/shared/runtime/stepAlgebraRelationRouting.mjs';

export const family = 'pointsAndIntervals';
export const implemented = true;

/* ---------------------------------------------------------------------------
 * Basics.
 * ------------------------------------------------------------------------- */

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const unique = (values) => [...new Set(values.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim()))];
const tidy = (value) => (Object.is(value, -0) ? 0 : value);
const INF = Number.POSITIVE_INFINITY;

// A value the graders read with Number(): a finite number or numeric text.
const plainNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? tidy(value) : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const number = Number(value.trim().replace(/[−–]/g, '-'));
    return Number.isFinite(number) ? tidy(number) : null;
  }
  return null;
};

const singleLetter = (value) => (/^[A-Za-z]$/.test(text(value)) ? text(value) : null);

/* ---------------------------------------------------------------------------
 * Exact rationals and small polynomials.
 * ------------------------------------------------------------------------- */

const gcd = (a, b) => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x || 1;
};
const rat = (n, d = 1) => {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || d === 0) throw new Error('not a safe rational');
  const g = gcd(n, d);
  const sign = d < 0 ? -1 : 1;
  return { n: tidy((sign * n) / g), d: Math.abs(d) / g };
};
const ZERO = rat(0);
const ONE = rat(1);
const radd = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
const rneg = (a) => rat(-a.n, a.d);
const rsub = (a, b) => radd(a, rneg(b));
const rmul = (a, b) => rat(a.n * b.n, a.d * b.d);
const rdiv = (a, b) => {
  if (b.n === 0) throw new Error('division by zero');
  return rat(a.n * b.d, a.d * b.n);
};
const rval = (a) => tidy(a.n / a.d);
const decimalRat = (digits) => {
  const [whole, fraction = ''] = digits.split('.');
  return rat(Number(`${whole || '0'}${fraction}`), 10 ** fraction.length);
};

const MAX_DEGREE = 4;
const ptrim = (p) => {
  const out = [...p];
  while (out.length > 1 && out[out.length - 1].n === 0) out.pop();
  return out;
};
const padd = (p, q) => ptrim(Array.from({ length: Math.max(p.length, q.length) }, (_, i) => radd(p[i] || ZERO, q[i] || ZERO)));
const pneg = (p) => p.map(rneg);
const psub = (p, q) => padd(p, pneg(q));
const pmul = (p, q) => {
  const out = Array.from({ length: p.length + q.length - 1 }, () => ZERO);
  p.forEach((a, i) => q.forEach((b, j) => { out[i + j] = radd(out[i + j], rmul(a, b)); }));
  const trimmed = ptrim(out);
  if (trimmed.length - 1 > MAX_DEGREE) throw new Error('degree too high');
  return trimmed;
};
const isConstant = (p) => p.length === 1;

/* ---------------------------------------------------------------------------
 * Reading math out of a prompt: normalise, cut into runs of math tokens, parse.
 * ------------------------------------------------------------------------- */

const normalizeMath = (value) => {
  let source = String(value ?? '')
    .replace(/\\left|\\right/g, '')
    .replace(/\\(?:leqslant|leq|le)(?![A-Za-z])/g, '≤')
    .replace(/\\(?:geqslant|geq|ge)(?![A-Za-z])/g, '≥')
    .replace(/\\lt(?![A-Za-z])/g, '<')
    .replace(/\\gt(?![A-Za-z])/g, '>')
    .replace(/<=/g, '≤')
    .replace(/>=/g, '≥')
    .replace(/⩽/g, '≤')
    .replace(/⩾/g, '≥')
    .replace(/[−–—]/g, '-')
    .replace(/\\cdot|\\times|[×·]/g, '*')
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3');
  for (let pass = 0; pass < 4; pass += 1) {
    source = source.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '(($1)/($2))');
  }
  return source
    .replace(/\^\s*\{([^{}]*)\}/g, '^($1)')
    .replace(/\\\(|\\\)|\\\[|\\\]/g, ' ')
    .replace(/\$/g, ' ');
};

const TOKEN = /(\d+(?:\.\d+)?|\.\d+)|([A-Za-z]+)|(≤|≥|<|>|=)|([+\-*/^()])|(\s+)|([\s\S])/g;
const tokenize = (source) => {
  const tokens = [];
  for (const match of source.matchAll(TOKEN)) {
    if (match[1]) tokens.push({ t: 'num', v: match[1] });
    else if (match[2]) tokens.push({ t: match[2].length === 1 ? 'var' : 'word', v: match[2] });
    else if (match[3]) tokens.push({ t: 'rel', v: match[3] });
    else if (match[4]) tokens.push({ t: 'op', v: match[4] });
    else if (match[5]) tokens.push({ t: 'space', v: match[5] });
    else tokens.push({ t: 'other', v: match[6] });
  }
  return tokens;
};

// Maximal stretches of math: numbers, single letters, operators, relations.
// A word of two or more letters ("or", "and", "graph") or punctuation ends one.
const mathRuns = (source) => {
  const runs = [];
  let current = [];
  const flush = () => {
    if (current.length) runs.push(current);
    current = [];
  };
  tokenize(normalizeMath(source)).forEach((token) => {
    if (token.t === 'word' || token.t === 'other') flush();
    else if (token.t !== 'space') current.push(token);
  });
  flush();
  return runs;
};

// Recursive descent over one side of a relation: + − * / ^, implicit
// multiplication, parentheses. Throws on anything else.
const parseExpression = (tokens) => {
  let index = 0;
  const peek = () => tokens[index];
  const isOp = (token, value) => Boolean(token) && token.t === 'op' && token.v === value;
  const primary = () => {
    const token = tokens[index];
    index += 1;
    if (!token) throw new Error('unexpected end');
    if (token.t === 'num') return { k: 'num', v: decimalRat(token.v) };
    if (token.t === 'var') return { k: 'var', v: token.v };
    if (isOp(token, '(')) {
      const inner = expression();
      if (!isOp(tokens[index], ')')) throw new Error('unclosed parenthesis');
      index += 1;
      return { k: 'paren', a: inner };
    }
    throw new Error('unexpected token');
  };
  const power = () => {
    const base = primary();
    if (isOp(peek(), '^')) {
      index += 1;
      return { k: 'pow', a: base, b: unary() };
    }
    return base;
  };
  const unary = () => {
    if (isOp(peek(), '-')) {
      index += 1;
      return { k: 'neg', a: unary() };
    }
    if (isOp(peek(), '+')) {
      index += 1;
      return unary();
    }
    return power();
  };
  const term = () => {
    let node = unary();
    for (;;) {
      const token = peek();
      if (isOp(token, '*') || isOp(token, '/')) {
        index += 1;
        node = { k: token.v === '*' ? 'mul' : 'div', a: node, b: unary() };
      } else if (token && (token.t === 'num' || token.t === 'var' || isOp(token, '('))) {
        node = { k: 'mul', a: node, b: power() };
      } else return node;
    }
  };
  const expression = () => {
    let node = term();
    while (isOp(peek(), '+') || isOp(peek(), '-')) {
      const op = tokens[index].v;
      index += 1;
      node = { k: op === '+' ? 'add' : 'sub', a: node, b: term() };
    }
    return node;
  };
  if (!tokens.length) throw new Error('empty');
  const node = expression();
  if (index !== tokens.length) throw new Error('trailing tokens');
  return node;
};

// A polynomial in `variable`, or a throw (another letter, a variable divisor,
// a fractional or too-large power).
const toPoly = (node, variable) => {
  switch (node.k) {
    case 'num': return [node.v];
    case 'var':
      if (node.v !== variable) throw new Error('another letter');
      return [ZERO, ONE];
    case 'paren': return toPoly(node.a, variable);
    case 'neg': return pneg(toPoly(node.a, variable));
    case 'add': return padd(toPoly(node.a, variable), toPoly(node.b, variable));
    case 'sub': return psub(toPoly(node.a, variable), toPoly(node.b, variable));
    case 'mul': return pmul(toPoly(node.a, variable), toPoly(node.b, variable));
    case 'div': {
      const divisor = toPoly(node.b, variable);
      if (!isConstant(divisor) || divisor[0].n === 0) throw new Error('not a polynomial');
      return toPoly(node.a, variable).map((coefficient) => rdiv(coefficient, divisor[0]));
    }
    case 'pow': {
      const exponent = toPoly(node.b, variable);
      if (!isConstant(exponent) || exponent[0].d !== 1 || exponent[0].n < 0 || exponent[0].n > MAX_DEGREE) throw new Error('bad power');
      const base = toPoly(node.a, variable);
      let out = [ONE];
      for (let count = 0; count < exponent[0].n; count += 1) out = pmul(out, base);
      return out;
    }
    default: throw new Error('unknown node');
  }
};
const polyOf = (node, variable) => {
  try {
    return toPoly(node, variable);
  } catch {
    return null;
  }
};

const isBare = (node, variable) => (node.k === 'var' && node.v === variable) || (node.k === 'paren' && isBare(node.a, variable));

// A product of linear factors (with powers) and constants: (x + 6)(x - 3),
// x(x - 5), (x + 1)^2(x - 4), 2(x - 1)(x + 3). Null for anything else.
const factorStructure = (node, variable) => {
  const parts = [];
  const flatten = (current) => {
    if (current.k === 'mul') {
      flatten(current.a);
      flatten(current.b);
    } else parts.push(current);
  };
  flatten(node);
  let coef = ONE;
  const factors = [];
  for (const part of parts) {
    let base = part;
    let multiplicity = 1;
    if (base.k === 'neg') {
      coef = rneg(coef);
      base = base.a;
    }
    if (base.k === 'pow') {
      const exponent = polyOf(base.b, variable);
      if (!exponent || !isConstant(exponent) || exponent[0].d !== 1 || exponent[0].n < 1 || exponent[0].n > MAX_DEGREE) return null;
      multiplicity = exponent[0].n;
      base = base.a;
    }
    const poly = polyOf(base, variable);
    if (!poly) return null;
    if (isConstant(poly)) {
      for (let count = 0; count < multiplicity; count += 1) coef = rmul(coef, poly[0]);
      continue;
    }
    if (poly.length !== 2) return null;
    factors.push({ a: poly[1], b: poly[0], multiplicity });
  }
  const total = factors.reduce((sum, factor) => sum + factor.multiplicity, 0);
  if (total < 2 || coef.n === 0) return null;
  return { coef, factors };
};

const FLIP = Object.freeze({ '<': '>', '>': '<', '≤': '≥', '≥': '≤' });
const isLess = (relation) => relation === '<' || relation === '≤';
const isInclusive = (relation) => relation === '≤' || relation === '≥';

const ray = (value, relation) => (isLess(relation)
  ? { min: -INF, max: value, minClosed: false, maxClosed: isInclusive(relation) }
  : { min: value, max: INF, minClosed: isInclusive(relation), maxClosed: false });

// How a run reads on screen, re-spaced: "3x - 10 > -13".
const displayTokens = (tokens) => {
  let out = '';
  let previous = null;
  tokens.forEach((token) => {
    let piece = token.v;
    if (token.t === 'rel') piece = ` ${token.v} `;
    else if (token.t === 'op' && (token.v === '+' || token.v === '-')
      && previous && (previous.t === 'num' || previous.t === 'var' || (previous.t === 'op' && previous.v === ')'))) piece = ` ${token.v} `;
    else if (token.t === 'op' && token.v === '*') piece = ' · ';
    out += piece;
    previous = token;
  });
  return out.replace(/\s+/g, ' ').trim();
};

const rootOf = (factor) => rval(rdiv(rneg(factor.b), factor.a));

// Sign analysis of coef · Π(a·x + b)^k / Π(denominator): the solution set,
// touching pieces merged, isolated zeros kept as one-point intervals.
const solveBySign = ({ coef = ONE, factors, denominator = [] }, relation) => {
  const valueAt = (x) => {
    const top = factors.reduce((product, factor) => product * ((rval(factor.a) * x + rval(factor.b)) ** factor.multiplicity), rval(coef));
    const bottom = denominator.reduce((product, factor) => product * ((rval(factor.a) * x + rval(factor.b)) ** factor.multiplicity), 1);
    return top / bottom;
  };
  const zeros = [...new Set(factors.map(rootOf))].sort((a, b) => a - b);
  const poles = [...new Set(denominator.map(rootOf))].sort((a, b) => a - b);
  const points = [...new Set([...zeros, ...poles])].sort((a, b) => a - b);
  const bounds = [-INF, ...points, INF];
  const want = isLess(relation) ? -1 : 1;
  const inclusive = isInclusive(relation);
  const pieces = [];
  for (let index = 0; index < bounds.length - 1; index += 1) {
    const left = bounds[index];
    const right = bounds[index + 1];
    const probe = !Number.isFinite(left) ? right - 1 : !Number.isFinite(right) ? left + 1 : (left + right) / 2;
    pieces.push({ kind: 'interval', included: Math.sign(valueAt(probe)) === want, left, right });
    if (index < points.length) {
      const point = points[index];
      pieces.push({ kind: 'point', included: inclusive && zeros.includes(point) && !poles.includes(point), left: point, right: point });
    }
  }
  const components = [];
  let current = null;
  pieces.forEach((piece) => {
    if (!piece.included) {
      if (current) components.push(current);
      current = null;
      return;
    }
    if (!current) current = { min: piece.left, minClosed: piece.kind === 'point', max: piece.right, maxClosed: piece.kind === 'point' };
    else Object.assign(current, { max: piece.right, maxClosed: piece.kind === 'point' });
  });
  if (current) components.push(current);
  return components;
};

const solveLinear = (lhs, relation, rhs) => {
  const a1 = lhs[1] || ZERO;
  const b1 = lhs[0];
  const a2 = rhs[1] || ZERO;
  const b2 = rhs[0];
  const A = rsub(a1, a2);
  if (A.n === 0) return null;
  const boundary = rdiv(rsub(b2, b1), A);
  const solvedRelation = A.n > 0 ? relation : FLIP[relation];
  const varSide = a1.n !== 0 && a2.n === 0 ? 'left' : a1.n === 0 && a2.n !== 0 ? 'right' : 'both';
  return { a1, b1, a2, b2, A, boundary, solvedRelation, varSide, interval: ray(rval(boundary), solvedRelation) };
};

// The variable sits inside brackets (3(x - 2) > 9, (x + 3)/2 > 4): the
// expanded a·x + c is not what the student sees, and dividing by the number
// outside is as good a first move as undoing the constant. Read as
//   null     no bracket holds the variable
//   mixed    the variable is also outside every bracket: 2(x + 1) + 3x > 7
//   bare     nothing multiplies, divides or negates the brackets: (x + 3) > 5
//   applied  something is done to a whole bracket: -2(x + 1) > 4
const variableInGroup = (tokens, variable) => {
  const groups = [];
  let depth = 0;
  let start = -1;
  let outside = false;
  tokens.forEach((token, index) => {
    if (token.t === 'op' && token.v === '(') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (token.t === 'op' && token.v === ')') {
      depth -= 1;
      if (depth === 0) groups.push([start, index]);
    } else if (depth === 0 && token.t === 'var' && token.v === variable) outside = true;
  });
  const holding = groups.filter(([from, to]) => tokens.slice(from, to).some((token) => token.t === 'var' && token.v === variable));
  if (!holding.length) return null;
  if (outside) return 'mixed';
  const added = (token) => !token || token.t === 'rel' || (token.t === 'op' && token.v === '+');
  const bare = holding.every(([from, to]) => added(tokens[from - 1])
    && (added(tokens[to + 1]) || (tokens[to + 1].t === 'op' && tokens[to + 1].v === '-'))
    && !tokens.slice(from + 1, to).some((token) => token.t === 'op' && token.v === '('));
  return bare ? 'bare' : 'applied';
};

// Every inequality the source states, each read as one of:
//   bare      x > 2, -4 ≤ x < 3, 5 ≥ x
//   linear    3x - 10 > -13, 2x + 1 ≤ x + 7
//   factored  (x - (-6))(x - (3)) ≥ 0
const relationRuns = (source, variable) => mathRuns(source).map((tokens) => {
  const segments = [[]];
  const relations = [];
  tokens.forEach((token) => {
    if (token.t === 'rel') {
      relations.push(token.v);
      segments.push([]);
    } else segments[segments.length - 1].push(token);
  });
  if (!relations.length || relations.length > 2 || relations.includes('=')) return null;
  let nodes;
  try {
    nodes = segments.map(parseExpression);
  } catch {
    return null;
  }
  const polys = nodes.map((node) => polyOf(node, variable));
  if (polys.some((poly) => !poly)) return null;
  const display = displayTokens(tokens);
  try {
    if (relations.length === 2) {
      const [first, second] = relations;
      if (!isConstant(polys[0]) || !isBare(nodes[1], variable) || !isConstant(polys[2])) return null;
      if (isLess(first) !== isLess(second)) return null;
      const low = isLess(first) ? rval(polys[0][0]) : rval(polys[2][0]);
      const high = isLess(first) ? rval(polys[2][0]) : rval(polys[0][0]);
      if (!(low < high)) return null;
      const interval = isLess(first)
        ? { min: low, max: high, minClosed: first === '≤', maxClosed: second === '≤' }
        : { min: low, max: high, minClosed: second === '≥', maxClosed: first === '≥' };
      return { kind: 'bare', display, intervals: [interval] };
    }
    const [relation] = relations;
    const [lhsNode, rhsNode] = nodes;
    const [lhs, rhs] = polys;
    if (isBare(lhsNode, variable) && isConstant(rhs)) return { kind: 'bare', display, intervals: [ray(rval(rhs[0]), relation)] };
    if (isBare(rhsNode, variable) && isConstant(lhs)) return { kind: 'bare', display, intervals: [ray(rval(lhs[0]), FLIP[relation])] };
    if (Math.max(lhs.length, rhs.length) === 2) {
      const solved = solveLinear(lhs, relation, rhs);
      return solved ? { kind: 'linear', display, relation, grouped: variableInGroup(tokens, variable), ...solved } : null;
    }
    const zeroSide = (poly) => isConstant(poly) && poly[0].n === 0;
    if (zeroSide(rhs) || zeroSide(lhs)) {
      const structure = factorStructure(zeroSide(rhs) ? lhsNode : rhsNode, variable);
      const facing = zeroSide(rhs) ? relation : FLIP[relation];
      if (structure) return { kind: 'factored', display, relation: facing, structure, intervals: solveBySign(structure, facing) };
    }
  } catch {
    return null;
  }
  return null;
}).filter(Boolean);

const intersect = (a, b) => {
  const lowFromA = a.min > b.min || (a.min === b.min && !a.minClosed);
  const highFromA = a.max < b.max || (a.max === b.max && !a.maxClosed);
  const out = {
    min: lowFromA ? a.min : b.min,
    minClosed: lowFromA ? a.minClosed : b.minClosed,
    max: highFromA ? a.max : b.max,
    maxClosed: highFromA ? a.maxClosed : b.maxClosed,
  };
  return out.min < out.max ? out : null;
};

/* ---------------------------------------------------------------------------
 * Writing numbers, intervals and inequalities (every spelling, for the guard).
 * ------------------------------------------------------------------------- */

const toFraction = (value) => {
  for (let d = 1; d <= 64; d += 1) {
    const n = Math.round(value * d);
    if (Math.abs(n / d - value) < 1e-9) return { n, d };
  }
  return null;
};
// One number as this family writes it: integers plainly, short decimals as
// decimals, other values as a fraction. ASCII minus throughout.
const fmt = (value) => {
  const v = tidy(Number(value));
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '-∞';
  if (Number.isInteger(v)) return String(v);
  const short = Number(v.toFixed(4));
  if (Math.abs(short - v) < 1e-12) return String(short);
  const fraction = toFraction(v);
  return fraction ? `${fraction.n}/${fraction.d}` : String(short);
};
const withUnicodeMinus = (form) => (form.includes('-') ? [form, form.replace(/-/g, '−')] : [form]);
const fractionText = (value) => {
  const fraction = Number.isInteger(value) ? null : toFraction(value);
  return fraction ? `${fraction.n}/${fraction.d}` : fmt(value);
};
const decimalText = (value) => (Number.isInteger(value) ? String(value) : String(Number(Number(value).toFixed(4))));

const numberForms = (value) => {
  const v = tidy(Number(value));
  const forms = [fmt(v)];
  if (!Number.isInteger(v)) {
    const fraction = toFraction(v);
    if (fraction) forms.push(`${fraction.n}/${fraction.d}`, `${fraction.n < 0 ? '-' : ''}\\frac{${Math.abs(fraction.n)}}{${fraction.d}}`);
    [1, 2, 4].forEach((places) => {
      const rounded = Number(v.toFixed(places));
      if (!Number.isInteger(rounded)) forms.push(String(rounded));
    });
  }
  return unique(forms.flatMap(withUnicodeMinus));
};

const NUMBER_STYLES = [fmt, (v) => fmt(v).replace(/-/g, '−'), fractionText, (v) => fractionText(v).replace(/-/g, '−'), decimalText, (v) => decimalText(v).replace(/-/g, '−')];
const INFINITY_STYLES = [['∞', '-∞'], ['∞', '−∞'], ['inf', '-inf'], ['infinity', '-infinity'], ['\\infty', '-\\infty'], ['+∞', '-∞']];
const SEPARATORS = [', ', ','];
const UNIONS = [' ∪ ', '∪', ' U ', ' u ', ' \\cup ', '\\cup'];

const pieceNotation = (piece, num = fmt, [posInf, negInf] = ['∞', '-∞'], separator = ', ') => {
  if (piece.min === piece.max && piece.minClosed && piece.maxClosed) return `{${num(piece.min)}}`;
  const left = Number.isFinite(piece.min) ? num(piece.min) : negInf;
  const right = Number.isFinite(piece.max) ? num(piece.max) : posInf;
  const open = Number.isFinite(piece.min) && piece.minClosed ? '[' : '(';
  const close = Number.isFinite(piece.max) && piece.maxClosed ? ']' : ')';
  return `${open}${left}${separator}${right}${close}`;
};
const notation = (pieces) => (pieces.length ? pieces.map((piece) => pieceNotation(piece)).join(' ∪ ') : '∅');

const EMPTY_FORMS = Object.freeze(['∅', 'no solution', '\\emptyset', '\\varnothing', '{}']);

const notationForms = (pieces) => {
  if (!pieces.length) return [...EMPTY_FORMS];
  const forms = [];
  NUMBER_STYLES.forEach((num) => INFINITY_STYLES.forEach((infinity) => SEPARATORS.forEach((separator) => {
    const written = pieces.map((piece) => pieceNotation(piece, num, infinity, separator));
    forms.push(...written);
    if (written.length > 1) UNIONS.forEach((union) => forms.push(written.join(union)));
  })));
  return unique(forms);
};

const RELATION_SPELLINGS = Object.freeze({ '<': ['<'], '>': ['>'], '≤': ['≤', '<=', '\\le', '\\leq'], '≥': ['≥', '>=', '\\ge', '\\geq'] });

const pieceInequalities = (piece, variable, num, spelling, gap) => {
  const rel = (relation) => RELATION_SPELLINGS[relation][Math.min(spelling, RELATION_SPELLINGS[relation].length - 1)];
  const join = (...parts) => parts.join(gap);
  const low = Number.isFinite(piece.min);
  const high = Number.isFinite(piece.max);
  if (!low && !high) return ['all real numbers'];
  if (piece.min === piece.max) return [join(variable, '=', num(piece.min))];
  if (!low) {
    const relation = piece.maxClosed ? '≤' : '<';
    return [join(variable, rel(relation), num(piece.max)), join(num(piece.max), rel(FLIP[relation]), variable)];
  }
  if (!high) {
    const relation = piece.minClosed ? '≥' : '>';
    return [join(variable, rel(relation), num(piece.min)), join(num(piece.min), rel(FLIP[relation]), variable)];
  }
  const lower = piece.minClosed ? '≤' : '<';
  const upper = piece.maxClosed ? '≤' : '<';
  return [
    join(num(piece.min), rel(lower), variable, rel(upper), num(piece.max)),
    join(num(piece.max), rel(FLIP[upper]), variable, rel(FLIP[lower]), num(piece.min)),
  ];
};

const inequalityForms = (pieces, variable) => {
  if (!pieces.length) return [...EMPTY_FORMS];
  const forms = [];
  NUMBER_STYLES.forEach((num) => [0, 1, 2, 3].forEach((spelling) => [' ', ''].forEach((gap) => {
    const written = pieces.map((piece) => pieceInequalities(piece, variable, num, spelling, gap));
    written.forEach((options) => forms.push(...options));
    if (written.length > 1) forms.push(written.map((options) => options[0]).join(' or '));
  })));
  return unique(forms);
};

const boundaryForms = (value, variable) => {
  const forms = numberForms(value);
  return unique([...forms, ...forms.flatMap((form) => [`${variable} = ${form}`, `${variable}=${form}`])]);
};

// The statement a set of pieces says, as this family writes it: "-4 ≤ x < 3".
const statementOf = (pieces, variable) => pieces.map((piece) => pieceInequalities(piece, variable, fmt, 0, ' ')[0]).join(' or ');

const termText = (coefficient, variable) => {
  if (coefficient === 1) return variable;
  if (coefficient === -1) return `-${variable}`;
  return `${fmt(coefficient)}${variable}`;
};
const linearText = (a, b, variable) => {
  if (a === 0) return fmt(b);
  const term = termText(a, variable);
  if (b === 0) return term;
  return `${term} ${b > 0 ? '+' : '-'} ${fmt(Math.abs(b))}`;
};
const baseFactorText = (root, variable) => (root === 0 ? variable : root > 0 ? `${variable} - ${fmt(root)}` : `${variable} + ${fmt(-root)}`);
const POWERS = ['', '', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
const powerText = (multiplicity) => (multiplicity < POWERS.length ? POWERS[multiplicity] : `^${multiplicity}`);
const rootFactorText = ({ root, multiplicity }, variable = 'x') => {
  const base = root === 0 ? variable : `(${baseFactorText(root, variable)})`;
  return multiplicity > 1 ? `${base}${powerText(multiplicity)}` : base;
};
const rootProductText = (factors, variable = 'x') => [...factors.filter((factor) => factor.root === 0), ...factors.filter((factor) => factor.root !== 0)]
  .map((factor) => rootFactorText(factor, variable)).join('');

// A parsed product as the student would write it: (x + 6)(x - 3), 2(x - 1)².
const structureText = (structure, variable) => {
  // Equal factors are written once, with their powers added: x(x) is x², never "xx".
  const merged = [];
  structure.factors.forEach((factor) => {
    const same = merged.find((entry) => entry.a.n === factor.a.n && entry.a.d === factor.a.d && entry.b.n === factor.b.n && entry.b.d === factor.b.d);
    if (same) same.multiplicity += factor.multiplicity;
    else merged.push({ ...factor });
  });
  const factors = merged.map((factor) => {
    const a = rval(factor.a);
    const b = rval(factor.b);
    const inner = a === 1 ? baseFactorText(-b, variable) : linearText(a, b, variable);
    const wrapped = a === 1 && b === 0 ? variable : `(${inner})`;
    return factor.multiplicity > 1 ? `${wrapped}${powerText(factor.multiplicity)}` : wrapped;
  }).join('');
  const coef = rval(structure.coef);
  return coef === 1 ? factors : coef === -1 ? `-${factors}` : `${fmt(coef)}${factors}`;
};

/* ---------------------------------------------------------------------------
 * The model of one question.
 * ------------------------------------------------------------------------- */

const SURFACES = Object.freeze(['intervalNumberLine', 'signSolutionAnalyzer', 'orderedPair', 'numberLine']);
const surfaceOf = (question) => {
  const ids = [question.toolId, question.type].map(text);
  const surface = SURFACES.find((id) => ids.includes(id));
  if (surface) return surface;
  return ['stepAlgebra', 'algebra'].includes(text(question.type)) ? 'stepAlgebra' : null;
};

const askOf = (question) => {
  const asked = list(question.ask).map((stage) => (stage === 'notation' ? 'interval' : stage))
    .filter((stage) => ['graph', 'interval', 'inequality'].includes(stage));
  return asked.length ? [...new Set(asked)] : ['graph', 'interval'];
};

const promptOf = (question) => text(question.prompt) || text(question.task);
// The prompt states `value` as a whole statement, spacing aside: "x>-1" is
// shown by "Graph $x > -1$" but not by "2x>-13" (a coefficient before it,
// more digits after it).
const promptShows = (prompt, value) => {
  const needle = normalizeMath(value).replace(/\s+/g, '').toLowerCase();
  if (!needle) return false;
  const pattern = [...needle].map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
  return new RegExp(`(?<![\\w.\\-])${pattern}(?![\\d.])`).test(normalizeMath(prompt).toLowerCase());
};

const VERBAL = /(no less than|not less than|at least|a minimum of|no more than|not more than|at most|a maximum of|up to|more than|greater than|fewer than|less than|exceeds|exceed|above|below|over|under)\s*\$?\s*(-?\d+(?:\.\d+)?)/i;
const VERBAL_RELATION = Object.freeze({
  'no less than': '≥', 'not less than': '≥', 'at least': '≥', 'a minimum of': '≥',
  'no more than': '≤', 'not more than': '≤', 'at most': '≤', 'a maximum of': '≤', 'up to': '≤',
  'more than': '>', 'greater than': '>', exceeds: '>', exceed: '>', above: '>', over: '>',
  'fewer than': '<', 'less than': '<', below: '<', under: '<',
});

const verbalCondition = (prompt, key) => {
  if (key.length !== 1) return null;
  const match = normalizeMath(prompt).match(VERBAL);
  if (!match) return null;
  const phrase = match[1].toLowerCase();
  const number = Number(match[2]);
  const relation = VERBAL_RELATION[phrase];
  if (!relation || !Number.isFinite(number)) return null;
  return sameIntervals([ray(number, relation)], key) ? { phrase, number, relation } : null;
};

// An authored endpoint the grader reads as a number or as unbounded. Anything
// else ("{{v}}" in an uninstantiated template) would quietly become ±∞.
const UNBOUNDED_ENDS = Object.freeze([null, undefined, '-inf', 'inf']);
const readableEnd = (value) => UNBOUNDED_ENDS.includes(value) || plainNumber(value) !== null;
const readableInterval = (raw) => isObject(raw)
  && readableEnd(raw.min ?? raw.from ?? raw.lower)
  && readableEnd(raw.max ?? raw.to ?? raw.upper);

const piecesSeparate = (pieces) => pieces.every((piece, index) => {
  const next = pieces[index + 1];
  return !next || piece.max < next.min || (piece.max === next.min && !piece.maxClosed && !next.minClosed);
});

const intervalModel = (question) => {
  const raw = list(question.intervals).length ? question.intervals : question.expectedIntervals;
  if (!Array.isArray(raw) || !raw.length || !raw.every(readableInterval)) return null;
  const key = normalizeIntervals(raw);
  if (!key.length) return null;
  const variable = singleLetter(question.variable) || 'x';
  const prompt = promptOf(question);
  const base = { kind: 'interval', key, variable, ask: askOf(question), prompt };
  // Pieces that overlap or touch at a kept end (x ≤ 2 or x > 2) graph as ONE
  // piece: "separate pieces" would be false, so only the generic help fits.
  if (!piecesSeparate(key)) return { ...base, sub: 'unknown' };
  const runs = relationRuns(prompt, variable);
  const bare = runs.filter((run) => run.kind === 'bare');
  if (bare.length) {
    if (bare.length > 1 && sameIntervals(bare.flatMap((run) => run.intervals), key)) return { ...base, sub: 'graph', given: bare, joiner: 'or' };
    if (bare.length === 2) {
      const both = intersect(bare[0].intervals[0], bare[1].intervals[0]);
      if (both && sameIntervals([both], key)) return { ...base, sub: 'graph', given: bare, joiner: 'and' };
    }
    const single = bare.find((run) => sameIntervals(run.intervals, key));
    if (single) return { ...base, sub: 'graph', given: [single], joiner: null };
  }
  const linear = runs.find((run) => run.kind === 'linear' && sameIntervals([run.interval], key));
  if (linear) return { ...base, sub: 'solve', run: linear };
  const factored = runs.find((run) => run.kind === 'factored' && sameIntervals(run.intervals, key));
  if (factored) return { ...base, sub: 'factored', run: factored };
  const verbal = verbalCondition(prompt, key);
  if (verbal) return { ...base, sub: 'verbal', verbal };
  return { ...base, sub: 'unknown' };
};

const inferredLetter = (source) => {
  const letters = [...new Set((normalizeMath(source).match(/[A-Za-z]+/g) || []).filter((word) => word.length === 1 && word.toLowerCase() !== 'e'))];
  return letters.length === 1 ? letters[0] : null;
};

const stepInequalityModel = (question) => {
  const routed = withPromptRelationSource(question);
  const source = text(relationSourceFromQuestion(routed)) || text(question.inequalityText) || text(question.inequality);
  if (!/[<>≤≥]|\\[lg]eq?(?![A-Za-z])|\\[lg]t(?![A-Za-z])/.test(source)) return null;
  const variable = singleLetter(question.solveFor) || singleLetter(question.variable) || singleLetter(question.objective?.variable)
    || inferredLetter(source) || 'x';
  const runs = relationRuns(source, variable);
  if (runs.length !== 1 || runs[0].kind !== 'linear') return null;
  // The whole source is that one inequality: nothing else left unread.
  if (mathRuns(source).length !== 1) return null;
  return { kind: 'linearInequality', variable, run: runs[0], key: [runs[0].interval] };
};

const SIGN_RELATIONS = Object.freeze({ '>': '>', '>=': '≥', '<': '<', '<=': '≤' });
const MAX_INTERVALS = 8;

const readFactor = (factor) => {
  if (!isObject(factor)) return null;
  const root = plainNumber(factor.root);
  const multiplicity = factor.multiplicity == null ? 1 : plainNumber(factor.multiplicity);
  if (root === null || Math.abs(root) > 1e6) return null;
  if (!Number.isInteger(multiplicity) || multiplicity < 1 || multiplicity > 12) return null;
  return { root, multiplicity };
};
// Repeated roots are one factor with the summed power, as the chart reads them.
const readFactors = (factors) => {
  if (!Array.isArray(factors)) return null;
  const read = factors.map(readFactor);
  if (!read.every(Boolean)) return null;
  const grouped = [];
  read.forEach(({ root, multiplicity }) => {
    const same = grouped.find((factor) => factor.root === root);
    if (same) same.multiplicity += multiplicity;
    else grouped.push({ root, multiplicity });
  });
  return grouped;
};

const chartSolution = (criticalPoints, intervals, inclusive) => {
  const pieces = [];
  intervals.forEach((interval, index) => {
    pieces.push({ kind: 'interval', included: interval.included, left: interval.left, right: interval.right });
    const point = criticalPoints[index];
    if (point) pieces.push({ kind: 'point', included: inclusive && point.isZero && !point.isExcluded, left: point.value, right: point.value });
  });
  const components = [];
  let current = null;
  pieces.forEach((piece) => {
    if (!piece.included) {
      if (current) components.push(current);
      current = null;
      return;
    }
    if (!current) current = { min: piece.left, minClosed: piece.kind === 'point', max: piece.right, maxClosed: piece.kind === 'point' };
    else Object.assign(current, { max: piece.right, maxClosed: piece.kind === 'point' });
  });
  if (current) components.push(current);
  return components;
};

const expressionText = (numerator, denominator) => {
  const top = numerator.length ? rootProductText(numerator) : '1';
  if (!denominator.length) return top;
  const bottom = rootProductText(denominator);
  return `${top} / ${denominator.length > 1 ? `[${bottom}]` : bottom}`;
};

const radicalModel = (question) => {
  const spec = question.radicalEquation;
  if (!isObject(spec) || !isObject(spec.radicand) || !isObject(spec.rhs) || spec.tolerance != null) return null;
  const coefficient = (side, field, fallback) => (side[field] == null ? fallback : plainNumber(side[field]));
  const m1 = coefficient(spec.radicand, 'm', 1);
  const b1 = coefficient(spec.radicand, 'b', 0);
  const m2 = coefficient(spec.rhs, 'm', 0);
  const b2 = coefficient(spec.rhs, 'b', 0);
  if ([m1, b1, m2, b2].some((value) => value === null) || m1 === 0) return null;
  const authored = question.candidates;
  if (!Array.isArray(authored) || !authored.length || authored.length > 10) return null;
  const values = authored.map(plainNumber);
  if (values.some((value) => value === null) || new Set(values).size !== values.length) return null;
  const valid = values.filter((value) => evaluateRadicalEquationCandidate(spec, value).valid);
  const radicand = linearText(m1, b1, 'x');
  const equation = `${/^(x|\d+(\.\d+)?)$/.test(radicand) ? `√${radicand}` : `√(${radicand})`} = ${linearText(m2, b2, 'x')}`;
  return { kind: 'radical', m1, b1, m2, b2, values, valid, radicand, equation };
};

const signChartModel = (question) => {
  const mode = question.mode || (list(question.denominatorFactors).length ? 'rational' : 'polynomial');
  if (mode === 'radicalCheck') return radicalModel(question);
  const rational = mode === 'rational';
  const numeratorSource = question.numeratorFactors || question.factors;
  const denominatorSource = rational ? question.denominatorFactors : [];
  if (!Array.isArray(numeratorSource)) return null;
  if (!Array.isArray(denominatorSource) || (rational && !denominatorSource.length)) return null;
  if (!rational && list(question.denominatorFactors).length) return null;
  const relation = question.relation || '>';
  if (typeof relation !== 'string' || !Object.prototype.hasOwnProperty.call(SIGN_RELATIONS, relation)) return null;
  const numerator = readFactors(numeratorSource);
  const denominator = readFactors(denominatorSource);
  if (!numerator || !denominator) return null;
  // Exactly the chart the grader builds.
  const spec = { numeratorFactors: numeratorSource, denominatorFactors: denominatorSource };
  const { criticalPoints, intervals } = buildSignIntervals(spec, relation);
  if (!criticalPoints.length || intervals.length > MAX_INTERVALS) return null;
  for (let index = 1; index < criticalPoints.length; index += 1) {
    if (criticalPoints[index].value - criticalPoints[index - 1].value < 1e-3) return null;
  }
  const symbol = SIGN_RELATIONS[relation];
  const pieces = solutionPiecesForRelation(spec, relation)
    .map((piece) => ({ min: piece.left, max: piece.right, minClosed: piece.leftClosed, maxClosed: piece.rightClosed }));
  return {
    kind: 'signChart',
    rational,
    numerator,
    denominator,
    symbol,
    inclusive: isInclusive(symbol),
    criticalPoints,
    intervals,
    pieces,
    solution: chartSolution(criticalPoints, intervals, isInclusive(symbol)),
    expression: expressionText(numerator, denominator),
  };
};

const readPair = (value) => {
  if (Array.isArray(value) && value.length === 2) {
    const x = plainNumber(value[0]);
    const y = plainNumber(value[1]);
    return x !== null && y !== null ? [x, y] : null;
  }
  if (typeof value === 'string') {
    const match = value.replace(/[−–]/g, '-').match(/^\s*\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)\s*$/);
    return match ? [Number(match[1]), Number(match[2])] : null;
  }
  if (isObject(value)) {
    const x = plainNumber(value.x);
    const y = plainNumber(value.y);
    return x !== null && y !== null ? [x, y] : null;
  }
  return null;
};
const samePoint = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

// Lines y = m·x + b: from the prompt's equations, or drawn as graph lines.
const linesOf = (question) => {
  const lines = [];
  mathRuns(promptOf(question)).forEach((tokens) => {
    const at = tokens.findIndex((token) => token.t === 'rel');
    if (at < 0 || tokens.filter((token) => token.t === 'rel').length !== 1 || tokens[at].v !== '=') return;
    try {
      const left = parseExpression(tokens.slice(0, at));
      const right = parseExpression(tokens.slice(at + 1));
      if (!(left.k === 'var' && left.v === 'y')) return;
      const poly = toPoly(right, 'x');
      if (poly.length > 2) return;
      lines.push({ m: rval(poly[1] || ZERO), b: rval(poly[0]), display: displayTokens(tokens) });
    } catch { /* not a line */ }
  });
  list(question.graph?.functions).forEach((entry) => {
    if (!isObject(entry) || !['line', 'linear'].includes(text(entry.type))) return;
    const m = plainNumber(entry.m);
    const b = plainNumber(entry.b ?? 0);
    if (m === null || b === null) return;
    lines.push({ m, b, display: `y = ${linearText(m, b, 'x')}` });
  });
  return lines;
};

const pointModel = (question) => {
  const point = readPair(question.answer) || readPair(question.solution);
  if (!point) return null;
  const base = { kind: 'point', point };
  const plotted = list(question.graph?.points).map((entry) => readPair(isObject(entry) && entry.coordinates ? entry.coordinates : entry)).filter(Boolean);
  if (plotted.some((entry) => samePoint(entry, point))) {
    const step = plainNumber(question.graph?.xStep) ?? 1;
    return { ...base, sub: 'plotted', step: step > 0 ? step : 1 };
  }
  const lines = linesOf(question);
  if (lines.length >= 2) {
    const [first, second] = lines;
    const onBoth = [first, second].every((line) => Math.abs(line.m * point[0] + line.b - point[1]) < 1e-9);
    if (onBoth && Math.abs(first.m - second.m) > 1e-9) return { ...base, sub: 'lines', lines: [first, second] };
  }
  return { ...base, sub: 'unknown' };
};

const DEFAULT_NUMBER_LINE = Object.freeze([-10, -5, 0, 5, 10]);
const numberLineModel = (question) => {
  const target = plainNumber(question.target) ?? plainNumber(question.answer);
  if (target === null) return null;
  const authored = list(question.choices);
  const choices = (authored.length ? authored : DEFAULT_NUMBER_LINE).map(plainNumber);
  const labels = choices.every((value) => value !== null) ? [...choices].sort((a, b) => a - b) : [];
  const gaps = labels.slice(1).map((value, index) => value - labels[index]);
  const spacing = gaps.length >= 2 && gaps.every((gap) => Math.abs(gap - gaps[0]) < 1e-9) && gaps[0] > 0 ? gaps[0] : null;
  return { kind: 'numberLine', target, labels, spacing };
};

const modelFor = (question) => {
  if (!isObject(question)) return null;
  try {
    switch (surfaceOf(question)) {
      case 'intervalNumberLine': return intervalModel(question);
      case 'signSolutionAnalyzer': return signChartModel(question);
      case 'orderedPair': return pointModel(question);
      case 'numberLine': return numberLineModel(question);
      case 'stepAlgebra': return stepInequalityModel(question);
      default: return null;
    }
  } catch {
    return null;
  }
};

export const matches = (question) => Boolean(modelFor(question));

/* ---------------------------------------------------------------------------
 * expectedValues: every spelling an answer could leak in.
 * ------------------------------------------------------------------------- */

const pairForms = ([x, y]) => {
  const forms = [];
  NUMBER_STYLES.slice(0, 2).forEach((num) => {
    forms.push(`(${num(x)}, ${num(y)})`, `(${num(x)},${num(y)})`);
  });
  forms.push(...numberForms(x), ...numberForms(y));
  numberForms(x).forEach((form) => forms.push(`x = ${form}`, `x=${form}`));
  numberForms(y).forEach((form) => forms.push(`y = ${form}`, `y=${form}`));
  return unique(forms);
};

const expectedFor = (model, question) => {
  switch (model.kind) {
    case 'interval': {
      const forms = [...notationForms(model.key)];
      if (model.sub !== 'graph') forms.push(...inequalityForms(model.key, model.variable));
      if (model.sub === 'solve') forms.push(...boundaryForms(rval(model.run.boundary), model.variable));
      [question.expectedNotation, question.expectedInequality, question.answer]
        .filter((value) => typeof value === 'string' || typeof value === 'number')
        .forEach((value) => forms.push(text(value)));
      const stated = text(question.inequalityText || question.inequality);
      if (stated && !promptShows(model.prompt, stated)) forms.push(stated);
      return unique(forms);
    }
    case 'linearInequality':
      return unique([
        ...inequalityForms(model.key, model.variable),
        ...notationForms(model.key),
        ...boundaryForms(rval(model.run.boundary), model.variable),
      ]);
    case 'signChart': {
      const labels = model.intervals.filter((interval) => interval.included)
        .map((interval) => ({ min: interval.left, max: interval.right, minClosed: false, maxClosed: false }));
      return unique([
        ...notationForms(model.solution),
        ...notationForms(model.pieces),
        ...notationForms(labels),
        ...inequalityForms(model.solution, 'x'),
      ]);
    }
    case 'radical':
      return model.valid.length
        ? unique(model.valid.flatMap((value) => boundaryForms(value, 'x')))
        : [...EMPTY_FORMS, 'no real solution'];
    case 'point': return pairForms(model.point);
    case 'numberLine': return boundaryForms(model.target, 'x');
    default: return [];
  }
};

export const expectedValues = (question) => {
  const model = modelFor(question);
  if (!model) return [];
  try {
    return expectedFor(model, question);
  } catch {
    return [];
  }
};

// The keys questionAnswerValues reads off the question itself, so this family
// checks its texts against the same list the platform guard will use.
const rawKeyTexts = (question) => {
  const values = [];
  const push = (value) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      if (value.length === 2 && value.every((entry) => typeof entry === 'number')) values.push(`(${value[0]}, ${value[1]})`, `(${value[0]},${value[1]})`);
      return;
    }
    if (typeof value === 'object') return;
    if (text(value)) values.push(text(value));
  };
  push(question.answer);
  push(question.solution);
  push(question.target);
  push(question.generatedAnswer);
  list(question.acceptedAnswers).forEach(push);
  if (isObject(question.solutionKey)) push(question.solutionKey.value);
  list(question.answerFields).forEach((field) => {
    push(field?.answer);
    list(field?.acceptedAnswers).forEach(push);
  });
  return values;
};

const guardFor = (question, model) => unique([...expectedFor(model, question), ...rawKeyTexts(question)]);
const reveals = (value, guard) => !text(value) || hintRevealsAnswer(value, guard);
const firstSafe = (variants, guard) => list(variants).find((variant) => variant && !reveals(variant, guard)) || null;

/* ---------------------------------------------------------------------------
 * Hints: each rung has a spelling that quotes the problem and a plain one.
 * ------------------------------------------------------------------------- */

const ENDPOINT_RULE = '≤ and ≥ include the boundary number (closed dot), while < and > leave it out (open dot).';
const notationRule = (pieces) => `For interval notation, write the left end first. A closed dot becomes a square bracket, an open dot a parenthesis, and an end that goes on forever is written -∞ or ∞ with a parenthesis.${pieces > 1 ? ' Join the pieces with ∪.' : ''}`;
const countWord = (count) => (['zero', 'one', 'two', 'three', 'four'][count] || String(count));

const probeFor = (pieces) => {
  const ends = pieces.flatMap((piece) => [piece.min, piece.max]).filter(Number.isFinite);
  return [0, 1, -1, 2, -2, 3, -3, 10, -10].find((value) => !ends.some((end) => Math.abs(end - value) < 1e-9)) ?? 0;
};

const graphHints = (model) => {
  const G = model.given.map((run) => run.display).join(model.joiner === 'and' ? ' and ' : ' or ');
  const v = model.variable;
  const pieces = model.key;
  const bounded = pieces.length === 1 && Number.isFinite(pieces[0].min) && Number.isFinite(pieces[0].max);
  const shape = pieces.length > 1
    ? [`${G} joins ${countWord(pieces.length)} conditions with "or", so its graph has ${countWord(pieces.length)} separate pieces: graph each condition on its own.`,
      `This inequality joins its conditions with "or", so its graph has separate pieces: graph each condition on its own.`]
    : bounded
      ? [`${G} says ${v} is between two numbers, so its graph is one piece with an endpoint at each end.`,
        `This inequality says ${v} is between two numbers, so its graph is one piece with an endpoint at each end.`]
      : [`${G} has one boundary number. Mark it on the number line first, then decide which side of it holds the solutions.`,
        'This inequality has one boundary number. Mark it on the number line first, then decide which side of it holds the solutions.'];
  const probe = probeFor(pieces);
  const last = model.ask.includes('interval')
    ? [notationRule(pieces.length)]
    : [`Shade every number that makes ${G} true, and put an arrow on any side that goes on forever.`,
      'Shade every number that makes the inequality true, and put an arrow on any side that goes on forever.'];
  return [
    shape,
    [`Look at each symbol in ${G}: ${ENDPOINT_RULE}`, ENDPOINT_RULE],
    [`To decide which way to shade, substitute a test number such as ${fmt(probe)} into ${G}. If the statement is true, that number belongs on the shaded part; if not, shade the other side.`,
      'To decide which way to shade, substitute any test number into the inequality. If the statement is true, that number belongs on the shaded part; if not, shade the other side.'],
    last,
  ];
};

const solveHints = (run, variable, closing) => {
  const O = run.display;
  const v = variable;
  const rungs = [[
    `Solve ${O} the way you would solve an equation: undo what is done to ${v}, one step at a time, doing the same thing to both sides.`,
    `Solve the inequality the way you would solve an equation: undo what is done to ${v}, one step at a time, doing the same thing to both sides.`,
  ]];
  let net = rval(run.A);
  if (run.grouped) {
    // Only the move the brackets allow is named, never the expanded numbers.
    rungs.push({
      mixed: [
        `In ${O}, ${v} is both inside and outside brackets. Distribute first to clear the brackets, then combine the ${v}-terms and solve, one step at a time, on both sides.`,
        `When ${v} is both inside and outside brackets, distribute first to clear the brackets, then combine the ${v}-terms and solve, one step at a time, on both sides.`,
      ],
      bare: [
        `In ${O}, nothing multiplies, divides or negates the brackets, so you can drop them and solve as usual, one step at a time, on both sides.`,
        'When nothing multiplies, divides or negates a bracket, you can drop the brackets and solve as usual, one step at a time, on both sides.',
      ],
      applied: [
        `In ${O}, ${v} is inside brackets. Either distribute first, or undo what is done to the whole bracket, one step at a time, on both sides.`,
        `When ${v} is inside brackets, either distribute first, or undo what is done to the whole bracket, one step at a time, on both sides.`,
      ],
    }[run.grouped]);
    if (run.varSide !== 'both') net = rval(run.varSide === 'left' ? run.a1 : run.a2);
  } else if (run.varSide === 'both') {
    const a2 = rval(run.a2);
    rungs.push([
      `First gather the ${v}-terms on one side of ${O}: ${a2 < 0 ? `add ${termText(-a2, v)} to` : `subtract ${termText(a2, v)} from`} both sides.`,
      `First gather the ${v}-terms on one side, doing the same thing to both sides.`,
    ]);
  } else {
    const a = rval(run.varSide === 'left' ? run.a1 : run.a2);
    const c = rval(run.varSide === 'left' ? run.b1 : run.b2);
    net = a;
    if (c !== 0) {
      const what = a === 1
        ? `${fmt(Math.abs(c))} is ${c > 0 ? 'added to' : 'subtracted from'} ${v}`
        : `${v} is multiplied by ${fmt(a)}, then ${fmt(Math.abs(c))} is ${c > 0 ? 'added' : 'subtracted'}`;
      rungs.push([
        `In ${O}, ${what}. Undo the ${c > 0 ? 'addition' : 'subtraction'} first: ${c > 0 ? 'subtract' : 'add'} ${fmt(Math.abs(c))} on both sides.`,
        `Undo the number added to or subtracted from the ${v}-term first, on both sides.`,
      ]);
    }
  }
  if (net < 0) {
    rungs.push([
      `The ${v}-term ends up with a negative coefficient, ${fmt(net)}. When you divide both sides by ${fmt(net)}, what has to happen to the inequality symbol?`,
      'When you multiply or divide both sides of an inequality by a negative number, what has to happen to the inequality symbol?',
    ]);
  } else if (net !== 1) {
    rungs.push([
      `Dividing both sides by ${fmt(net)}, a positive number, keeps the inequality symbol pointing the same way.`,
      'Dividing both sides by a positive number keeps the inequality symbol pointing the same way.',
    ]);
  }
  rungs.push(closing(O));
  return rungs;
};

const factoredHints = (model) => {
  const P = structureText(model.run.structure, model.variable);
  const R = model.run.relation;
  const v = model.variable;
  const sign = isLess(R) ? 'negative' : 'positive';
  return [
    [`${P} ${R} 0 can only change sign where one of its factors equals 0. Find the ${v}-value that makes each factor 0.`,
      `A product can only change sign where one of its factors equals 0. Find the ${v}-value that makes each factor 0.`],
    [`Those values split the number line into intervals. Pick one test number inside each interval and decide whether ${P} is positive or negative there.`,
      'Those values split the number line into intervals. Pick one test number inside each interval and decide whether the product is positive or negative there.'],
    [`${R} 0 asks for the intervals where the product is ${sign}${isInclusive(R) ? ', together with the points where it equals 0: those endpoints are included (closed dots)' : '; the points where it equals 0 are left out (open dots)'}.`],
    model.ask.includes('interval') ? ['Write each shaded piece in interval notation from left to right; if there is more than one piece, join them with ∪.'] : null,
  ].filter(Boolean);
};

const verbalHints = (model) => {
  const { phrase, number } = model.verbal;
  const quoted = `"${phrase} ${fmt(number)}"`;
  return [
    [`Translate the words into an inequality first: which symbol matches ${quoted}?`,
      'Translate the words into an inequality first: which symbol matches the phrase in the problem?'],
    [`Is ${fmt(number)} itself allowed when the condition is ${quoted}? That decides between a closed dot and an open dot.`,
      'Is the boundary number itself allowed by the words in the problem? That decides between a closed dot and an open dot.'],
    ['Then shade the side that holds the allowed values: larger numbers are to the right on the number line, smaller numbers to the left.'],
    model.ask.includes('interval') ? [notationRule(1)] : null,
  ].filter(Boolean);
};

const unknownIntervalHints = (model) => [
  ['Find the boundary number or numbers first, then decide which side of each boundary holds the solutions.'],
  [ENDPOINT_RULE],
  model.ask.includes('interval') ? [notationRule(1)] : ['Shade every number that makes the condition true, and put an arrow on any side that goes on forever.'],
];

const signChartHints = (model) => {
  const E = model.expression;
  const R = model.symbol;
  const even = [...model.numerator, ...model.denominator].find((factor) => factor.multiplicity % 2 === 0);
  const pole = model.denominator[0];
  const third = even
    ? [`${rootFactorText(even)} has an even power, so the sign of the expression does not change at x = ${fmt(even.root)}.`,
      'A factor with an even power does not change the sign of the expression at its zero.']
    : pole
      ? [`x = ${fmt(pole.root)} makes the denominator 0, so it is never part of the solution, whatever the inequality symbol.`,
        'A value that makes the denominator 0 is never part of the solution.']
      : null;
  return [
    [`The sign of ${E} can only change at its critical points, the x-values that make a factor 0. They split the number line into intervals, and inside one interval the sign stays the same.`,
      'The sign of the expression can only change at its critical points, the x-values that make a factor 0. They split the number line into intervals, and inside one interval the sign stays the same.'],
    [`Pick one test number inside each interval and find the sign of each factor there; the product of those signs is the sign of ${E}.`,
      'Pick one test number inside each interval and find the sign of each factor there; the product of those signs is the sign of the expression.'],
    third,
    [`${R} 0 asks for the intervals where the expression is ${isLess(R) ? 'negative' : 'positive'}${model.inclusive ? `; with ${R}, the x-values where the numerator is 0 count too` : '; the critical points themselves are left out'}.`],
  ].filter(Boolean);
};

const radicalHints = (model) => [
  [`Squaring both sides of ${model.equation} can create candidates that do not solve the original equation, so every candidate has to be checked.`,
    'Squaring both sides of a radical equation can create candidates that do not solve the original equation, so every candidate has to be checked.'],
  [`For each candidate, check the radicand ${model.radicand} first: if it comes out negative, the square root is not a real number and the candidate is rejected.`,
    'For each candidate, check the expression under the square root first: if it comes out negative, the candidate is rejected.'],
  [`Then substitute each remaining candidate into the original equation ${model.equation}. A square root is never negative, so both sides must come out exactly equal.`,
    'Then substitute each remaining candidate into the original equation. A square root is never negative, so both sides must come out exactly equal.'],
];

const pointHints = (model) => {
  if (model.sub === 'lines') {
    const [first, second] = model.lines;
    return [
      [`The point where ${first.display} and ${second.display} meet is on both lines, so its x and y make both equations true.`,
        'The point where the two lines meet is on both lines, so its x and y make both equations true.'],
      [`Both equations give y, so set the right sides equal: ${linearText(first.m, first.b, 'x')} = ${linearText(second.m, second.b, 'x')}. Solve that for x.`,
        'Both equations give y, so set their right sides equal to each other and solve for x.'],
      [`Substitute your x into ${first.display} to find y, then check the point in ${second.display}.`,
        'Substitute your x into either equation to find y, then check the point in the other equation.'],
      ['Write the meeting point as (x, y), with the x-coordinate first.'],
    ];
  }
  if (model.sub === 'plotted') {
    return [
      ['Start at the origin, where the x-axis and the y-axis cross.'],
      ['Is the point to the left or right of the y-axis, and above or below the x-axis? That decides the sign of each coordinate.'],
      [`Count the grid units straight left or right from the origin until you are directly above or below the point${model.step !== 1 ? ` (each grid line is ${fmt(model.step)} units)` : ''}: that count, with its sign, is the x-coordinate. Then count up or down to the point for the y-coordinate.`,
        'Count the grid units straight left or right from the origin until you are directly above or below the point: that count, with its sign, is the x-coordinate. Then count up or down to the point for the y-coordinate.'],
      ['Write the point as (x, y): the horizontal coordinate first, then the vertical one.'],
    ];
  }
  return [
    ['An ordered pair is written (x, y): the x-coordinate (left or right) comes first, then the y-coordinate (up or down).'],
    ['Find the x-value first, then the y-value, and check that both describe the same point.'],
  ];
};

// No hint here uses the word "a": a choice-letter key ("a") would make the
// platform guard drop it.
const numberLineHints = (model) => [
  ['Find zero on the number line first. Positive numbers sit to the right of zero and negative numbers to the left.'],
  ['Is the target number positive, negative, or zero? That tells you which side of zero to look on.'],
  model.spacing
    ? [`The labeled points are ${fmt(model.spacing)} apart, so count by ${fmt(model.spacing)}s from zero or from the nearest label.`,
      'The labeled points are evenly spaced, so count from zero or from the nearest label, one space after another.']
    : ['Count from zero or from the nearest label, tick by tick, toward the target number.'],
];

const hintLadder = (model) => {
  switch (model.kind) {
    case 'interval':
      switch (model.sub) {
        case 'graph': return graphHints(model);
        case 'solve': return solveHints(model.run, model.variable, (O) => [
          `Once ${model.variable} is alone, mark the boundary number: closed dot for ≤ or ≥, open dot for < or >. Then shade the side whose numbers make ${O} true.${model.ask.includes('interval') ? ' In interval notation a closed dot becomes a square bracket and an open dot a parenthesis.' : ''}`,
          `Once ${model.variable} is alone, mark the boundary number: closed dot for ≤ or ≥, open dot for < or >. Then shade the side whose numbers make the original inequality true.`,
        ]);
        case 'factored': return factoredHints(model);
        case 'verbal': return verbalHints(model);
        default: return unknownIntervalHints(model);
      }
    case 'linearInequality': return solveHints(model.run, model.variable, (O) => [
      `Check your result: pick a number on your solution side and substitute it into ${O}. It should make the original inequality true.`,
      'Check your result: pick a number on your solution side and substitute it into the original inequality. It should make it true.',
    ]);
    case 'signChart': return signChartHints(model);
    case 'radical': return radicalHints(model);
    case 'point': return pointHints(model);
    case 'numberLine': return numberLineHints(model);
    default: return [];
  }
};

export const hints = (question) => {
  const model = modelFor(question);
  if (!model) return [];
  try {
    const guard = guardFor(question, model);
    return unique(hintLadder(model).map((variants) => firstSafe(variants, guard)).filter(Boolean)).slice(0, 4);
  } catch {
    return [];
  }
};

/* ---------------------------------------------------------------------------
 * backUpQuestion: one two-choice check about this problem's first move.
 * ------------------------------------------------------------------------- */

const backUp = (prompt, options, correct) => ({ prompt, options, correct });

const backUpCandidates = (model) => {
  switch (model.kind) {
    case 'interval': {
      if (model.sub === 'graph') {
        const G = model.given.map((run) => run.display).join(model.joiner === 'and' ? ' and ' : ' or ');
        if (model.key.length > 1) {
          return [
            backUp(`Let's back up. ${G} joins its conditions with "or". What does its graph look like?`, ['Separate pieces', 'One piece between two numbers'], 'Separate pieces'),
            backUp('Let\'s back up. This inequality joins its conditions with "or". What does its graph look like?', ['Separate pieces', 'One piece between two numbers'], 'Separate pieces'),
          ];
        }
        if (Number.isFinite(model.key[0].min) && Number.isFinite(model.key[0].max)) {
          return [
            backUp(`Let's back up. ${G} says ${model.variable} is between two numbers. What does its graph look like?`, ['One piece between two numbers', 'Separate pieces'], 'One piece between two numbers'),
            backUp(`Let's back up. This inequality says ${model.variable} is between two numbers. What does its graph look like?`, ['One piece between two numbers', 'Separate pieces'], 'One piece between two numbers'),
          ];
        }
      }
      if (model.sub === 'solve') return solveBackUps(model.run, model.variable);
      if (model.sub === 'factored') {
        const P = structureText(model.run.structure, model.variable);
        return [
          backUp(`Let's back up. What is the first step for ${P} ${model.run.relation} 0?`, ['Find where each factor equals 0', 'Multiply the factors out'], 'Find where each factor equals 0'),
          backUp('Let\'s back up. What is the first step for a factored inequality?', ['Find where each factor equals 0', 'Multiply the factors out'], 'Find where each factor equals 0'),
        ];
      }
      if (model.sub === 'verbal') {
        const { phrase, relation } = model.verbal;
        const partner = { '≥': '>', '>': '≥', '≤': '<', '<': '≤' }[relation];
        return [backUp(`Let's back up. Which symbol means "${phrase}"?`, [relation, partner], relation)];
      }
      return [backUp('Let\'s back up. Which symbols mean the boundary number itself is included?', ['≤ and ≥', '< and >'], '≤ and ≥')];
    }
    case 'linearInequality': return solveBackUps(model.run, model.variable);
    case 'signChart':
      return [
        backUp(`Let's back up. What do you find first for ${model.expression} ${model.symbol} 0?`, ['The critical points, where a factor equals 0', 'The value of the expression at x = 0'], 'The critical points, where a factor equals 0'),
        backUp('Let\'s back up. What do you find first for a sign chart?', ['The critical points, where a factor equals 0', 'The value of the expression at x = 0'], 'The critical points, where a factor equals 0'),
      ];
    case 'radical':
      return [
        backUp(`Let's back up. Where must each candidate for ${model.equation} be checked?`, ['In the original equation', 'Only in the squared equation'], 'In the original equation'),
        backUp('Let\'s back up. Where must each candidate be checked?', ['In the original equation', 'Only in the squared equation'], 'In the original equation'),
      ];
    case 'point':
      if (model.sub === 'lines') {
        const [first, second] = model.lines;
        return [
          backUp(`Let's back up. What is true at the point where ${first.display} and ${second.display} meet?`, ['Its x and y make both equations true', 'The two lines have the same slope there'], 'Its x and y make both equations true'),
          backUp('Let\'s back up. What is true at the point where two lines meet?', ['Its x and y make both equations true', 'The two lines have the same slope there'], 'Its x and y make both equations true'),
        ];
      }
      return [backUp('Let\'s back up. Which coordinate is written first in an ordered pair?', ['The x-coordinate (left or right)', 'The y-coordinate (up or down)'], 'The x-coordinate (left or right)')];
    case 'numberLine':
      return [backUp('Let\'s back up. On the number line, where are the negative numbers?', ['Left of zero', 'Right of zero'], 'Left of zero')];
    default: return [];
  }
};

function solveBackUps(run, variable) {
  const O = run.display;
  const v = variable;
  const a = rval(run.varSide === 'left' ? run.a1 : run.a2);
  const c = rval(run.varSide === 'left' ? run.b1 : run.b2);
  // Brackets: either order works, so no move is "first". Only the sign of
  // the coefficient, which decides the symbol whatever the order, is asked.
  // A coefficient of 1 needs no dividing, so the flip question is moot.
  if (run.grouped) return run.varSide === 'both' || a === 1 ? [] : flipBackUps(O, v, a);
  if (run.varSide === 'both') {
    return [
      backUp(`Let's back up. What comes first in ${O}?`, [`Gather the ${v}-terms on one side`, `Divide both sides by ${fmt(rval(run.a1))}`], `Gather the ${v}-terms on one side`),
      backUp('Let\'s back up. What comes first when both sides have a variable term?', [`Gather the ${v}-terms on one side`, `Divide both sides by the coefficient of ${v}`], `Gather the ${v}-terms on one side`),
    ];
  }
  const undo = `${c > 0 ? 'Subtract' : 'Add'} ${fmt(Math.abs(c))} on both sides`;
  if (c !== 0 && a !== 1) {
    return [
      backUp(`Let's back up. Which comes first in ${O}?`, [undo, `Divide both sides by ${fmt(a)}`], undo),
      backUp('Let\'s back up. Which comes first?', ['Undo the added or subtracted number', 'Undo the multiplication'], 'Undo the added or subtracted number'),
    ];
  }
  if (c !== 0) {
    const wrong = `${c > 0 ? 'Add' : 'Subtract'} ${fmt(Math.abs(c))} on both sides`;
    return [
      backUp(`Let's back up. What gets ${v} alone in ${O}?`, [undo, wrong], undo),
      backUp(`Let's back up. What gets ${v} alone when a number is added to or subtracted from it?`, ['Do the opposite operation on both sides', 'Do the same operation again'], 'Do the opposite operation on both sides'),
    ];
  }
  // x alone already, after the arithmetic on one side: nothing to divide by.
  if (a === 1) return [];
  return flipBackUps(O, v, a);
}

function flipBackUps(O, v, a) {
  const flips = a < 0;
  const correct = flips ? 'It flips' : 'It stays the same';
  return [
    backUp(`Let's back up. To get ${v} alone in ${O}, you divide or multiply by a ${flips ? 'negative' : 'positive'} number. What happens to the inequality symbol?`, ['It flips', 'It stays the same'], correct),
    backUp(`Let's back up. When you divide both sides of an inequality by a ${flips ? 'negative' : 'positive'} number, what happens to the symbol?`, ['It flips', 'It stays the same'], correct),
  ];
}

export const backUpQuestion = (question) => {
  const model = modelFor(question);
  if (!model) return null;
  try {
    const guard = guardFor(question, model);
    const chosen = backUpCandidates(model).find((candidate) => candidate
      && candidate.options.length === 2
      && candidate.options.includes(candidate.correct)
      && [candidate.prompt, ...candidate.options].every((value) => !reveals(value, guard)));
    return chosen ? { prompt: chosen.prompt, options: [...chosen.options], correct: chosen.correct } : null;
  } catch {
    return null;
  }
};

/* ---------------------------------------------------------------------------
 * similarProblem: a worked sibling with different numbers.
 * ------------------------------------------------------------------------- */

const hashString = (value) => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};
const rngFor = (seed, salt) => {
  let state = hashString(`${seed}|${salt}`) || 1;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const randInt = (rng, low, high) => low + Math.floor(rng() * (high - low + 1));
const drawDistinct = (rng, count, low, high, avoid = []) => {
  const pool = [];
  for (let value = low; value <= high; value += 1) if (!avoid.some((entry) => Math.abs(entry - value) < 1e-9)) pool.push(value);
  if (pool.length < count) return null;
  const drawn = [];
  while (drawn.length < count) {
    const value = pool[randInt(rng, 0, pool.length - 1)];
    if (!drawn.includes(value)) drawn.push(value);
  }
  return drawn.sort((a, b) => a - b);
};
const sign = (value) => (value > 0 ? 'positive' : 'negative');

const pieceStep = (piece, variable) => {
  const v = variable;
  if (!Number.isFinite(piece.min)) {
    const end = fmt(piece.max);
    return `${v} ${piece.maxClosed ? '≤' : '<'} ${end}: ${piece.maxClosed ? `≤ includes ${end}, so draw a closed dot at ${end}` : `< leaves out ${end}, so draw an open dot at ${end}`}. "Less than" means smaller numbers, so shade to the left with an arrow.`;
  }
  if (!Number.isFinite(piece.max)) {
    const end = fmt(piece.min);
    return `${v} ${piece.minClosed ? '≥' : '>'} ${end}: ${piece.minClosed ? `≥ includes ${end}, so draw a closed dot at ${end}` : `> leaves out ${end}, so draw an open dot at ${end}`}. "Greater than" means larger numbers, so shade to the right with an arrow.`;
  }
  const low = fmt(piece.min);
  const high = fmt(piece.max);
  return `${statementOf([piece], v)}: ${v} is between ${low} and ${high}. Draw ${piece.minClosed ? 'a closed' : 'an open'} dot at ${low} and ${piece.maxClosed ? 'a closed' : 'an open'} dot at ${high}, then shade the segment between them.`;
};

const graphSibling = (model, rng) => {
  const ends = model.key.flatMap((piece) => [piece.min, piece.max]).filter(Number.isFinite);
  const distinct = [...new Set(ends)].sort((a, b) => a - b);
  const drawn = drawDistinct(rng, distinct.length, -9, 9, distinct);
  if (!drawn) return null;
  const mapped = new Map(distinct.map((value, index) => [value, drawn[index]]));
  const pieces = model.key.map((piece) => ({
    min: Number.isFinite(piece.min) ? mapped.get(piece.min) : -INF,
    max: Number.isFinite(piece.max) ? mapped.get(piece.max) : INF,
    minClosed: piece.minClosed,
    maxClosed: piece.maxClosed,
  }));
  const v = model.variable;
  const statement = statementOf(pieces, v);
  const answer = notation(pieces);
  return {
    prompt: `Graph ${statement} on the number line${model.ask.includes('interval') ? ', then write it in interval notation' : ''}.`,
    steps: [
      ...(pieces.length > 1 ? [`${statement} joins ${countWord(pieces.length)} conditions with "or", so the graph has ${countWord(pieces.length)} separate pieces. Graph each one.`] : []),
      ...pieces.map((piece) => pieceStep(piece, v)),
      pieces.length > 1 ? `Write each piece from left to right and join them with ∪: ${answer}.` : `In interval notation: ${answer}.`,
    ],
    answer,
  };
};

// ax + b REL c (or a1x + b1 REL a2x + b2 when the original had x on both
// sides), with the original's relation and the sign of its x-coefficient.
const solveSibling = (run, variable, rng, { graph, interval }) => {
  const v = variable;
  const relation = run.relation;
  // The coefficient the student divides by: the x-term's own sign when x is
  // on one side only, the gathered coefficient when it is on both.
  const negative = rval(run.varSide === 'left' ? run.a1 : run.varSide === 'right' ? run.a2 : run.A) < 0;
  const solution = randInt(rng, -9, 9);
  if (solution === rval(run.boundary)) return null;
  const steps = [];
  let prompt;
  let checkWith;
  if (run.varSide === 'both') {
    const a2 = randInt(rng, 1, 6);
    const A = (negative ? -1 : 1) * randInt(rng, 2, 6);
    const a1 = a2 + A;
    const b1 = randInt(rng, -12, 12);
    const b2 = b1 + A * solution;
    if (a1 === 0 || b1 === 0) return null;
    const original = `${linearText(a1, b1, v)} ${relation} ${linearText(a2, b2, v)}`;
    prompt = original;
    steps.push(`Subtract ${termText(a2, v)} from both sides: ${linearText(A, b1, v)} ${relation} ${fmt(b2)}.`);
    steps.push(`${b1 > 0 ? `Subtract ${fmt(b1)}` : `Add ${fmt(-b1)}`} on both sides: ${termText(A, v)} ${relation} ${fmt(b2 - b1)}.`);
    const solved = A < 0 ? FLIP[relation] : relation;
    steps.push(`Divide both sides by ${fmt(A)}${A < 0 ? `. Dividing by a negative number flips the symbol, so ${relation} becomes ${solved}` : ''}: ${v} ${solved} ${fmt(solution)}.`);
    checkWith = (t) => `Check with ${v} = ${fmt(t)}, on the solution side: ${fmt(a1 * t + b1)} ${relation} ${fmt(a2 * t + b2)} is true.`;
  } else {
    const a = (negative ? -1 : 1) * randInt(rng, 2, 9);
    const b = randInt(rng, -12, 12);
    if (b === 0) return null;
    const c = a * solution + b;
    prompt = `${linearText(a, b, v)} ${relation} ${fmt(c)}`;
    steps.push(`${b > 0 ? `Subtract ${fmt(b)}` : `Add ${fmt(-b)}`} on both sides: ${termText(a, v)} ${relation} ${fmt(c - b)}.`);
    const solved = a < 0 ? FLIP[relation] : relation;
    steps.push(`Divide both sides by ${fmt(a)}${a < 0 ? `. Dividing by a negative number flips the symbol, so ${relation} becomes ${solved}` : ''}: ${v} ${solved} ${fmt(solution)}.`);
    checkWith = (t) => `Check with ${v} = ${fmt(t)}, on the solution side: ${fmt(a * t + b)} ${relation} ${fmt(c)} is true.`;
  }
  const solved = negative ? FLIP[relation] : relation;
  const piece = ray(solution, solved);
  const answerNotation = notation([piece]);
  if (graph) {
    steps.push(`${isInclusive(solved) ? 'Closed' : 'Open'} dot at ${fmt(solution)}, because ${solved} ${isInclusive(solved) ? 'includes' : 'leaves out'} ${fmt(solution)}; shade to the ${isLess(solved) ? 'left' : 'right'}.`);
    if (interval) steps.push(`In interval notation: ${answerNotation}.`);
  }
  steps.push(checkWith(solution + (isLess(solved) ? -1 : 1)));
  const statement = `${v} ${solved} ${fmt(solution)}`;
  return {
    prompt: graph
      ? `Solve ${prompt}, then graph the solution on the number line${interval ? ' and write it in interval notation' : ''}.`
      : `Solve ${prompt}.`,
    steps,
    answer: graph && interval ? `${statement}, which is ${answerNotation}` : statement,
  };
};

const testValue = (left, right) => {
  if (!Number.isFinite(left)) return Math.ceil(right) - 1;
  if (!Number.isFinite(right)) return Math.floor(left) + 1;
  const low = Math.floor(left) + 1;
  const high = Math.ceil(right) - 1;
  if (low <= high) return low <= 0 && high >= 0 ? 0 : Math.round((left + right) / 2);
  return (left + right) / 2;
};

const intervalLabel = (left, right) => `(${Number.isFinite(left) ? fmt(left) : '-∞'}, ${Number.isFinite(right) ? fmt(right) : '∞'})`;

// Roots drawn fresh, multiplicities and relation kept: (x - r1)(x - r2) REL 0.
const factoredSibling = (model, rng) => {
  const { structure, relation } = model.run;
  const original = structure.factors.map((factor) => ({ root: rootOf(factor), multiplicity: factor.multiplicity })).sort((a, b) => a.root - b.root);
  if (original.length > 3) return null;
  const roots = drawDistinct(rng, original.length, -8, 8, original.map((factor) => factor.root));
  // Whole-number test values need a gap of at least 2 between zeros.
  if (!roots || roots.some((root, index) => index > 0 && root - roots[index - 1] < 2)) return null;
  const v = model.variable;
  const factors = roots.map((root, index) => ({ root, multiplicity: original[index].multiplicity }));
  const parsed = factors.map(({ root, multiplicity }) => ({ a: ONE, b: rat(-root), multiplicity }));
  const pieces = solveBySign({ factors: parsed }, relation);
  const product = rootProductText(factors, v);
  const bounds = [-INF, ...roots, INF];
  const tests = bounds.slice(0, -1).map((left, index) => {
    const right = bounds[index + 1];
    const t = testValue(left, right);
    const value = factors.reduce((total, factor) => total * ((t - factor.root) ** factor.multiplicity), 1);
    return `Test ${v} = ${fmt(t)} in ${intervalLabel(left, right)}: the product is ${fmt(value)}, which is ${sign(value)}.`;
  });
  const answer = notation(pieces);
  return {
    prompt: `Solve ${product} ${relation} 0${model.ask.includes('graph') ? ', then graph the solution on the number line' : ''}${model.ask.includes('interval') ? ' and write it in interval notation' : ''}.`,
    steps: [
      `The product is 0 when one of its factors is 0: ${roots.map((root) => `${v} = ${fmt(root)}`).join(' or ')}.`,
      `These zeros split the number line into ${countWord(roots.length + 1)} intervals: ${bounds.slice(0, -1).map((left, index) => intervalLabel(left, bounds[index + 1])).join(', ')}.`,
      ...tests,
      `${relation} 0 keeps the ${isLess(relation) ? 'negative' : 'positive'} intervals${isInclusive(relation) ? ', and the zeros themselves are included because of the "or equal to"' : '; the zeros themselves are left out'}.`,
      `Solution: ${answer}.`,
    ],
    answer,
  };
};

const signChartSibling = (model, rng) => {
  const top = model.numerator.map((factor) => ({ ...factor })).sort((a, b) => a.root - b.root);
  const bottom = model.denominator.map((factor) => ({ ...factor })).sort((a, b) => a.root - b.root);
  const count = top.length + bottom.length;
  if (count > 4) return null;
  const roots = drawDistinct(rng, count, -7, 7, model.criticalPoints.map((point) => point.value));
  if (!roots || roots.some((root, index) => index > 0 && root - roots[index - 1] < 2)) return null;
  // Interleave by drawing a fresh order, keeping each factor's multiplicity.
  const order = roots.slice();
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = randInt(rng, 0, index);
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  const numerator = top.map((factor, index) => ({ root: order[index], multiplicity: factor.multiplicity }));
  const denominator = bottom.map((factor, index) => ({ root: order[top.length + index], multiplicity: factor.multiplicity }));
  const relationKey = Object.keys(SIGN_RELATIONS).find((key) => SIGN_RELATIONS[key] === model.symbol);
  const spec = { numeratorFactors: numerator, denominatorFactors: denominator };
  const { criticalPoints, intervals } = buildSignIntervals(spec, relationKey);
  const solution = chartSolution(criticalPoints, intervals, model.inclusive);
  const expression = expressionText(numerator, denominator);
  const R = model.symbol;
  const want = isLess(R) ? -1 : 1;
  const valueAt = (x) => numerator.reduce((p, f) => p * ((x - f.root) ** f.multiplicity), 1) / denominator.reduce((p, f) => p * ((x - f.root) ** f.multiplicity), 1);
  const tests = intervals.map((interval) => {
    const t = testValue(interval.left, interval.right);
    const value = valueAt(t);
    return `Test x = ${fmt(t)} in ${intervalLabel(interval.left, interval.right)}: the expression is ${sign(value)}, so ${Math.sign(value) === want ? 'select' : 'leave out'} this interval.`;
  });
  const zeros = criticalPoints.filter((point) => point.isZero && !point.isExcluded).map((point) => fmt(point.value));
  const poles = criticalPoints.filter((point) => point.isExcluded).map((point) => fmt(point.value));
  const answer = solution.length ? notation(solution) : '∅';
  return {
    prompt: `Use a sign chart to solve ${expression} ${R} 0.`,
    steps: [
      `Critical points: ${criticalPoints.map((point) => `x = ${fmt(point.value)}${point.isExcluded ? ' (denominator 0)' : ''}`).join(', ')}. They split the number line into ${countWord(intervals.length)} intervals.`,
      ...tests,
      model.inclusive
        ? `${R} also accepts 0, so ${zeros.length ? `x = ${zeros.join(' and x = ')} ${zeros.length === 1 ? 'is' : 'are'} included` : 'no zero is added'}${poles.length ? `; x = ${poles.join(' and x = ')} never ${poles.length === 1 ? 'is' : 'are'}, because the denominator is 0 there` : ''}.`
        : `${R} is strict, so the critical points themselves are left out.`,
      `Solution set: ${answer}.`,
    ],
    answer,
  };
};

// √(x + b) = c (genuine c² − b, extraneous −c² − b), or √(x + b) = x with one
// extraneous root, matching the original's right side.
const radicalSibling = (model, rng) => {
  if (model.m2 === 0) {
    const c = randInt(rng, 2, 9);
    const b = randInt(rng, -9, 9);
    const genuine = c * c - b;
    const extraneous = -c * c - b;
    const radicand = linearText(1, b, 'x');
    const equation = `√(${radicand}) = ${c}`;
    const candidates = rng() < 0.5 ? [genuine, extraneous] : [extraneous, genuine];
    return {
      prompt: `Which of the candidates x = ${fmt(candidates[0])} and x = ${fmt(candidates[1])} solve ${equation}?`,
      steps: [
        `Check x = ${fmt(genuine)}: ${radicand} = ${fmt(genuine + b)}, and √${fmt(genuine + b)} = ${c}, which matches the right side. Keep it.`,
        `Check x = ${fmt(extraneous)}: ${radicand} = ${fmt(extraneous + b)}, which is negative, so the square root is not a real number. Reject it.`,
        `Only x = ${fmt(genuine)} is a genuine solution.`,
      ],
      answer: `x = ${fmt(genuine)}`,
    };
  }
  const r = randInt(rng, 2, 7);
  const b = r * (r - 1);
  const other = 1 - r;
  const equation = `√(x + ${b}) = x`;
  return {
    prompt: `Solve ${equation} and check each candidate.`,
    steps: [
      `Square both sides: x + ${b} = x².`,
      `Rearrange: x² - x - ${b} = 0, which factors as (x - ${r})(x + ${r - 1}) = 0, so the candidates are x = ${r} and x = ${other}.`,
      `Check x = ${r}: √(${r} + ${b}) = √${r * r} = ${r}, which matches the right side. Keep it.`,
      `Check x = ${other}: √(${other} + ${b}) = √${(r - 1) * (r - 1)} = ${r - 1}, but the right side is ${other}. A square root is never negative, so x = ${other} is extraneous.`,
      `The only solution is x = ${r}.`,
    ],
    answer: `x = ${r}`,
  };
};

const verbalSibling = (model, rng) => {
  const { phrase, number, relation } = model.verbal;
  const low = Math.round(number) - 15;
  const value = randInt(rng, low, low + 30);
  if (value === number) return null;
  const v = model.variable;
  const piece = ray(value, relation);
  const answerNotation = notation([piece]);
  return {
    prompt: `A rule says that ${v} must be ${phrase} ${fmt(value)}. Graph all the possible values of ${v}.`,
    steps: [
      `"${phrase} ${fmt(value)}" means ${v} ${relation} ${fmt(value)}.`,
      `${relation} ${isInclusive(relation) ? 'includes' : 'leaves out'} ${fmt(value)} itself, so draw ${isInclusive(relation) ? 'a closed' : 'an open'} dot at ${fmt(value)}.`,
      `The allowed values are ${isLess(relation) ? 'smaller' : 'larger'}, so shade to the ${isLess(relation) ? 'left' : 'right'} with an arrow.`,
      `In interval notation: ${answerNotation}.`,
    ],
    answer: `${v} ${relation} ${fmt(value)}, which is ${answerNotation}`,
  };
};

const plottedSibling = (model, rng) => {
  const x = randInt(rng, 1, 9) * (rng() < 0.5 ? -1 : 1);
  const y = randInt(rng, 1, 9) * (rng() < 0.5 ? -1 : 1);
  return {
    prompt: `A point is ${Math.abs(x)} units ${x < 0 ? 'left' : 'right'} of the origin and ${Math.abs(y)} units ${y < 0 ? 'down' : 'up'}. What are its coordinates?`,
    steps: [
      'Start at the origin, where the axes cross.',
      `${Math.abs(x)} units ${x < 0 ? 'left' : 'right'} makes the x-coordinate ${fmt(x)} (${x < 0 ? 'left is negative' : 'right is positive'}).`,
      `${Math.abs(y)} units ${y < 0 ? 'down' : 'up'} makes the y-coordinate ${fmt(y)} (${y < 0 ? 'down is negative' : 'up is positive'}).`,
      `Write x first, then y: (${fmt(x)}, ${fmt(y)}).`,
    ],
    answer: `(${fmt(x)}, ${fmt(y)})`,
  };
};

const linesSibling = (model, rng) => {
  const horizontal = model.lines.some((line) => line.m === 0);
  const x = randInt(rng, -6, 6);
  const y = randInt(rng, -9, 9);
  const m1 = randInt(rng, 1, 4) * (rng() < 0.5 ? -1 : 1);
  const m2 = horizontal ? 0 : randInt(rng, -4, 4);
  if (m1 === m2 || x === 0) return null;
  const b1 = y - m1 * x;
  const b2 = y - m2 * x;
  const first = `y = ${linearText(m1, b1, 'x')}`;
  const second = `y = ${linearText(m2, b2, 'x')}`;
  const steps = horizontal
    ? [
      `${second} is a horizontal line, so at the meeting point y = ${fmt(y)}.`,
      `Substitute into ${first}: ${fmt(y)} = ${linearText(m1, b1, 'x')}, so ${termText(m1, 'x')} = ${fmt(y - b1)} and x = ${fmt(x)}.`,
      `The lines meet at (${fmt(x)}, ${fmt(y)}).`,
    ]
    : [
      `At the meeting point both equations give the same y, so set the right sides equal: ${linearText(m1, b1, 'x')} = ${linearText(m2, b2, 'x')}.`,
      `Gather the x-terms and the numbers: ${termText(m1 - m2, 'x')} = ${fmt(b2 - b1)}, so x = ${fmt(x)}.`,
      `Substitute x = ${fmt(x)} into ${first}: y = ${fmt(y)}.`,
      `Check in ${second}: ${linearText(m2, b2, 'x').replace(/x/g, `(${fmt(x)})`)} = ${fmt(y)}. The lines meet at (${fmt(x)}, ${fmt(y)}).`,
    ];
  return { prompt: `Where do ${first} and ${second} meet?`, steps, answer: `(${fmt(x)}, ${fmt(y)})` };
};

const numberLineSibling = (model, rng) => {
  const spacing = model.spacing && Number.isInteger(model.spacing) ? model.spacing : 5;
  const target = randInt(rng, -20, 20);
  if (target === model.target || target === 0) return null;
  const position = randInt(rng, 0, 4);
  const labels = [0, 1, 2, 3, 4].map((k) => target + (k - position) * spacing);
  const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth'];
  return {
    prompt: `The points on this number line are labeled ${labels.map(fmt).join(', ')}. Which point shows ${fmt(target)}?`,
    steps: [
      `${fmt(target)} is ${target < 0 ? 'negative, so it sits to the left of zero' : 'positive, so it sits to the right of zero'}.`,
      `The labels go up by ${fmt(spacing)} from left to right: ${labels.map(fmt).join(', ')}.`,
      `${fmt(target)} is the ${ORDINALS[position]} label from the left.`,
    ],
    answer: fmt(target),
  };
};

const siblingBuilder = (model) => {
  switch (model.kind) {
    case 'interval':
      switch (model.sub) {
        case 'graph': return (rng) => graphSibling(model, rng);
        case 'solve': return (rng) => solveSibling(model.run, model.variable, rng, { graph: model.ask.includes('graph'), interval: model.ask.includes('interval') });
        case 'factored': return (rng) => factoredSibling(model, rng);
        case 'verbal': return (rng) => verbalSibling(model, rng);
        default: return null;
      }
    case 'linearInequality': return (rng) => solveSibling(model.run, model.variable, rng, { graph: false, interval: false });
    case 'signChart': return (rng) => signChartSibling(model, rng);
    case 'radical': return (rng) => radicalSibling(model, rng);
    case 'point':
      if (model.sub === 'plotted') return (rng) => plottedSibling(model, rng);
      if (model.sub === 'lines') return (rng) => linesSibling(model, rng);
      return null;
    case 'numberLine': return (rng) => numberLineSibling(model, rng);
    default: return null;
  }
};

const numericValue = (value) => {
  const cleaned = text(value).replace(/−/g, '-').replace(/\s+/g, '');
  if (/^-?\d+(?:\.\d+)?$/.test(cleaned)) return Number(cleaned);
  const fraction = cleaned.match(/^(-?\d+)\/(-?\d+)$/);
  return fraction && Number(fraction[2]) ? Number(fraction[1]) / Number(fraction[2]) : null;
};

// The same checks the platform runs (similarExampleIsSafe), against the same
// answers, so a draw that would be refused is redrawn here instead.
const siblingIsSafe = (question, example, guard) => {
  if (!example) return false;
  const prompt = text(example.prompt);
  const answer = text(example.answer);
  const steps = list(example.steps).map(text).filter(Boolean);
  if (!prompt || !answer || !steps.length || prompt === text(question.prompt)) return false;
  if (guard.some((value) => value.toLowerCase() === answer.toLowerCase())) return false;
  const value = numericValue(answer);
  if (value !== null && guard.some((entry) => numericValue(entry) !== null && Math.abs(numericValue(entry) - value) < 1e-9)) return false;
  if (steps.some((step) => hintRevealsAnswer(step, guard))) return false;
  return !hintRevealsAnswer(prompt, guard.filter((entry) => numericValue(entry) === null));
};

const fingerprintOf = (model) => JSON.stringify([
  model.kind,
  model.sub || '',
  model.key || model.point || model.target || model.values || model.criticalPoints?.map((point) => point.value) || '',
  model.run?.display || '',
]);

export const similarProblem = (question, { seed = 0 } = {}) => {
  const model = modelFor(question);
  if (!model) return null;
  try {
    const build = siblingBuilder(model);
    if (!build) return null;
    const guard = guardFor(question, model);
    const rng = rngFor(seed, fingerprintOf(model));
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const example = build(rng);
      if (siblingIsSafe(question, example, guard)) {
        return { prompt: text(example.prompt), steps: example.steps.map(text).filter(Boolean), answer: text(example.answer) };
      }
    }
  } catch { /* a sibling that cannot be built is not offered */ }
  return null;
};

/* ---------------------------------------------------------------------------
 * workedSolution: THIS question, worked in full, for the closed-question
 * review only (closedQuestionReview.js). It states the answer, so nothing
 * shown while the item is open (hints, the back-up step, the sibling) ever
 * calls it.
 *
 * The steps are written the way this family's siblings write theirs
 * (pieceStep, solveSibling, factoredSibling, signChartSibling,
 * radicalSibling, verbalSibling, plottedSibling, linesSibling,
 * numberLineSibling), on this question's own numbers, each following from the
 * one before, and the last step states the answer in the form its grader
 * reads: every asked number-line stage (graph, interval notation, the
 * tool's own inequality sentence), the sign-chart intervals to select, the
 * radical candidates to keep, the ordered pair, the point to select, or the
 * solved inequality (with the number line the relation workspace asks for).
 * null, never a wrong step, for a shape it cannot explain exactly: an
 * `unknown` key, a number with no exact short form, a key the grader does not
 * hold the way the family read it.
 * ------------------------------------------------------------------------- */

const SLOPPY = /NaN|undefined|\bnull\b|\[object|Infinity|\+\s*-|--|(?<![\d.])-0(?![\d./])|(?<![\d.)/])1[a-z](?![a-z])/;

/** Thrown inside a worker: this question gets no worked solution. */
const cannot = () => {
  throw new Error('no exact worked solution');
};
const sameRat = (a, b) => a.n === b.n && a.d === b.d;
const isOne = (a) => a.n === 1 && a.d === 1;

/** A rational exactly: 3, 2.5, -13/8 (a decimal only when it ends within four places). */
const exactText = (r) => {
  if (r.d === 1) return String(tidy(r.n));
  let rest = r.d;
  let places = 0;
  while (rest % 10 === 0 || rest % 2 === 0 || rest % 5 === 0) {
    if (rest % 10 === 0) rest /= 10;
    else if (rest % 2 === 0) rest /= 2;
    else rest /= 5;
    places += 1;
  }
  if (rest === 1 && places <= 4) {
    const decimal = (r.n / r.d).toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    if (Number(decimal) === r.n / r.d) return decimal;
  }
  return `${r.n}/${r.d}`;
};

/** A float the question holds, as an exact rational, or null. */
const ratOf = (value) => {
  const v = tidy(Number(value));
  if (!Number.isFinite(v)) return null;
  const fraction = toFraction(v);
  if (fraction) return rat(fraction.n, fraction.d);
  const written = String(v);
  if (!/^-?\d+\.\d{1,6}$/.test(written)) return null;
  const magnitude = decimalRat(written.replace('-', ''));
  return written.startsWith('-') ? rneg(magnitude) : magnitude;
};
const ratOrStop = (value) => ratOf(value) || cannot();

/** A float as this family prints it (fmt), but only when that print is exact. */
const endText = (value) => {
  const written = fmt(value);
  const read = numericValue(written);
  return read !== null && Math.abs(read - value) < 1e-12 ? written : cannot();
};

const coefText = (a) => {
  const written = exactText(a);
  if (!written.includes('/')) return written;
  return a.n < 0 ? `-(${exactText(rneg(a))})` : `(${written})`;
};
const termR = (a, v) => (isOne(a) ? v : isOne(rneg(a)) ? `-${v}` : `${coefText(a)}${v}`);
const linearR = (a, b, v) => {
  if (a.n === 0) return exactText(b);
  if (b.n === 0) return termR(a, v);
  return `${termR(a, v)} ${b.n > 0 ? '+' : '-'} ${exactText(b.n > 0 ? b : rneg(b))}`;
};
const squash = (value) => String(value).replace(/\s+/g, '');
const joinWords = (parts) => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/* -------- a solved key, stated the way the number line grades it -------- */

const isPointPiece = (piece) => piece.min === piece.max;
const isWholeLine = (piece) => !Number.isFinite(piece.min) && !Number.isFinite(piece.max);
const dot = (closed) => (closed ? 'a closed' : 'an open');

/** What the graph shows for one piece. */
const shadeText = (piece) => {
  if (isWholeLine(piece)) return 'shade the whole number line, with an arrow at each end';
  if (isPointPiece(piece)) return `draw a closed dot at ${endText(piece.min)} and shade nothing else`;
  if (!Number.isFinite(piece.min)) return `draw ${dot(piece.maxClosed)} dot at ${endText(piece.max)} and shade to the left with an arrow`;
  if (!Number.isFinite(piece.max)) return `draw ${dot(piece.minClosed)} dot at ${endText(piece.min)} and shade to the right with an arrow`;
  return `draw ${dot(piece.minClosed)} dot at ${endText(piece.min)} and ${dot(piece.maxClosed)} dot at ${endText(piece.max)}, and shade the segment between them`;
};

/** One piece as pieceStep (the graph sibling's builder) writes it, with the two shapes it has no words for. */
const pieceWork = (piece, v) => {
  if (isWholeLine(piece)) return `Every real number works, so shade the whole number line, with an arrow at each end.`;
  if (isPointPiece(piece)) return `Only ${v} = ${endText(piece.min)} works: draw a closed dot at ${endText(piece.min)} and shade nothing else.`;
  [piece.min, piece.max].filter(Number.isFinite).forEach(endText);
  return pieceStep(piece, v);
};

/** Interval notation, exact endpoints; a one-number piece as the tool writes it, [a, a]. */
const notationText = (pieces) => pieces.map((piece) => (isPointPiece(piece)
  ? `[${endText(piece.min)}, ${endText(piece.min)}]`
  : pieceNotation(piece, endText))).join(' ∪ ');

/** The tool's own inequality sentence, when its four-place endpoints are exact. */
const inequalityText = (pieces, v) => {
  pieces.flatMap((piece) => [piece.min, piece.max]).filter(Number.isFinite)
    .forEach((end) => (Number(Number(end).toFixed(4)) === end ? end : cannot()));
  return intervalsToInequality(pieces, v);
};

const stagedAnswer = (pieces, v, stages) => {
  const parts = [];
  if (stages.includes('graph')) parts.push(`on the number line, ${pieces.map(shadeText).join(', then ')}`);
  if (stages.includes('interval')) parts.push(`in interval notation, ${notationText(pieces)}`);
  if (stages.includes('inequality')) parts.push(`as an inequality, ${inequalityText(pieces, v)}`);
  return parts.length ? parts : cannot();
};
const capitalizeFirst = (value) => value.charAt(0).toUpperCase() + value.slice(1);

/* -------- solving a linear inequality (solveSibling's moves) -------- */

/** Each side of the inequality already reads a·x + b (either order), so no rewrite is needed. */
const shownAsWritten = (run, v) => {
  const forms = (a, b) => {
    if (a.n === 0 || b.n === 0) return [linearR(a, b, v)];
    const term = termR(a, v);
    return [linearR(a, b, v), `${exactText(b)} ${a.n > 0 ? '+' : '-'} ${a.n > 0 ? term : termR(rneg(a), v)}`];
  };
  const shown = squash(run.display);
  return forms(run.a1, run.b1).some((left) => forms(run.a2, run.b2)
    .some((right) => squash(`${left}${run.relation}${right}`) === shown));
};

const solveWork = (run, v) => {
  let { a1, b1, a2, b2 } = run;
  let relation = run.relation;
  const steps = [];
  const sides = () => `${linearR(a1, b1, v)} ${relation} ${linearR(a2, b2, v)}`;
  if (run.grouped) steps.push(`${run.grouped === 'bare' ? 'Drop' : 'Clear'} the brackets and collect like terms: ${sides()}.`);
  else if (!shownAsWritten(run, v)) steps.push(`Rewrite each side: ${sides()}.`);
  if (a1.n === 0) {
    [a1, b1, a2, b2] = [a2, b2, a1, b1];
    relation = FLIP[relation];
    steps.push(`Read it from right to left, so ${v} is on the left: ${sides()}.`);
  }
  if (a2.n !== 0) {
    const verb = a2.n > 0 ? `Subtract ${termR(a2, v)} from` : `Add ${termR(rneg(a2), v)} to`;
    a1 = rsub(a1, a2);
    a2 = ZERO;
    if (a1.n === 0) cannot();
    steps.push(`${verb} both sides: ${sides()}.`);
  }
  if (b1.n !== 0) {
    const verb = b1.n > 0 ? `Subtract ${exactText(b1)}` : `Add ${exactText(rneg(b1))}`;
    b2 = rsub(b2, b1);
    b1 = ZERO;
    steps.push(`${verb} on both sides: ${sides()}.`);
  }
  if (!isOne(a1)) {
    const solved = a1.n < 0 ? FLIP[relation] : relation;
    const by = a1;
    b2 = rdiv(b2, a1);
    a1 = ONE;
    steps.push(`Divide both sides by ${exactText(by)}${by.n < 0 ? `. Dividing by a negative number flips the symbol, so ${relation} becomes ${solved}` : ''}: ${v} ${solved} ${exactText(b2)}.`);
    relation = solved;
  }
  if (relation !== run.solvedRelation || !sameRat(b2, run.boundary)) cannot();
  // The sibling's check, on the original sides, at a whole number inside the solution.
  const t = rat(isLess(relation) ? Math.ceil(rval(b2)) - 1 : Math.floor(rval(b2)) + 1);
  const left = radd(rmul(run.a1, t), run.b1);
  const right = radd(rmul(run.a2, t), run.b2);
  const holds = { '<': rval(left) < rval(right), '>': rval(left) > rval(right), '≤': rval(left) <= rval(right), '≥': rval(left) >= rval(right) }[run.relation];
  if (!holds) cannot();
  steps.push(`Check with ${v} = ${exactText(t)}, on the solution side: ${exactText(left)} ${run.relation} ${exactText(right)} is true.`);
  return { steps, statement: `${v} ${relation} ${exactText(b2)}` };
};

/* -------- one worker per shape -------- */

const workedGraph = (model) => {
  const v = model.variable;
  const G = model.given.map((run) => run.display).join(model.joiner === 'and' ? ' and ' : ' or ');
  const steps = [];
  if (model.key.length > 1) steps.push(`${G} joins ${countWord(model.key.length)} conditions with "or", so the graph has ${countWord(model.key.length)} separate pieces. Graph each one.`);
  if (model.joiner === 'and') steps.push(`${G}: both conditions must hold at once, so ${statementOf(model.key, v)}.`);
  steps.push(...model.key.map((piece) => pieceWork(piece, v)));
  return { headline: `Graph ${G}: mark each boundary number with the right dot, then shade the numbers that make it true.`, steps };
};

const workedFactored = (model) => {
  const v = model.variable;
  const { structure, relation } = model.run;
  const P = structureText(structure, v);
  const roots = [...new Map(structure.factors.map((factor) => {
    const root = rdiv(rneg(factor.b), factor.a);
    return [`${root.n}/${root.d}`, root];
  })).values()].sort((a, b) => rval(a) - rval(b));
  const bounds = [null, ...roots, null];
  const productAt = (t) => structure.factors.reduce((total, factor) => {
    let out = total;
    const inner = radd(rmul(factor.a, t), factor.b);
    for (let count = 0; count < factor.multiplicity; count += 1) out = rmul(out, inner);
    return out;
  }, structure.coef);
  const label = (left, right) => `(${left ? exactText(left) : '-∞'}, ${right ? exactText(right) : '∞'})`;
  const tests = bounds.slice(0, -1).map((left, index) => {
    const right = bounds[index + 1];
    const t = testRational(left, right);
    const value = productAt(t);
    if (value.n === 0) cannot();
    return `Test ${v} = ${exactText(t)} in ${label(left, right)}: the product is ${exactText(value)}, which is ${sign(value.n)}.`;
  });
  const steps = [
    ...(squash(`${P} ${relation} 0`) === squash(powersAsSuperscripts(model.run.display)) ? [] : [`Write the factors simply: ${P} ${relation} 0.`]),
    `The product is 0 when one of its factors is 0: ${roots.map((root) => `${v} = ${exactText(root)}`).join(' or ')}.`,
    `These zeros split the number line into ${countWord(roots.length + 1)} intervals: ${bounds.slice(0, -1).map((left, index) => label(left, bounds[index + 1])).join(', ')}.`,
    ...tests,
    `${relation} 0 keeps the ${isLess(relation) ? 'negative' : 'positive'} intervals${isInclusive(relation) ? ', and the zeros themselves are included because of the "or equal to"' : '; the zeros themselves are left out'}.`,
  ];
  return { headline: `Solve ${P} ${relation} 0: find the zeros, test one number in each interval, and keep the intervals where the product is ${isLess(relation) ? 'negative' : 'positive'}.`, steps };
};

/** x^2 and x^{2} as they render, x²: a step that only changes how a power is typed changes nothing. */
const powersAsSuperscripts = (value) => String(value).replace(/\^\{?(\d)\}?/g, (match, digit) => POWERS[Number(digit)] || match);

/** A test number strictly inside (left, right) — 0 if it fits, else a whole number, else the midpoint. */
function testRational(left, right) {
  if (!left && !right) return ZERO;
  if (!left) return rat(Math.ceil(rval(right)) - 1);
  if (!right) return rat(Math.floor(rval(left)) + 1);
  const low = Math.floor(rval(left)) + 1;
  const high = Math.ceil(rval(right)) - 1;
  if (low <= high) return low <= 0 && high >= 0 ? ZERO : rat(low);
  return rdiv(radd(left, right), rat(2));
}

const workedVerbal = (model) => {
  const v = model.variable;
  const { phrase, number, relation } = model.verbal;
  const n = endText(number);
  return {
    headline: `Translate "${phrase} ${n}" into an inequality, then graph it.`,
    steps: [
      `"${phrase} ${n}" means ${v} ${relation} ${n}.`,
      `${relation} ${isInclusive(relation) ? 'includes' : 'leaves out'} ${n} itself, so draw ${dot(isInclusive(relation))} dot at ${n}.`,
      `The allowed values are ${isLess(relation) ? 'smaller' : 'larger'}, so shade to the ${isLess(relation) ? 'left' : 'right'} with an arrow.`,
    ],
  };
};

const workedInterval = (question, model) => {
  if (!['graph', 'solve', 'factored', 'verbal'].includes(model.sub)) return null;
  // The key the number line grades is the question's own intervals (a Path
  // instance carries them as expectedIntervals) — the one the model read.
  const stages = resolveIntervalAsk(question.ask);
  let worked;
  let lead = 'the answer is:';
  if (model.sub === 'graph') worked = workedGraph(model);
  else if (model.sub === 'factored') worked = workedFactored(model);
  else if (model.sub === 'verbal') worked = workedVerbal(model);
  else {
    const solved = solveWork(model.run, model.variable);
    lead = `${solved.statement};`;
    worked = {
      headline: `Solve ${model.run.display} the way you solve an equation, flipping the symbol if you divide by a negative number, then show the solution.`,
      steps: solved.steps,
    };
  }
  const parts = stagedAnswer(model.key, model.variable, stages);
  return {
    headline: worked.headline,
    steps: [...worked.steps, `So ${lead} ${parts.join('; ')}.`],
    answerSummary: `${capitalizeFirst(parts.join('; '))}.`,
  };
};

const workedLinearInequality = (question, model) => {
  // Only an item the relation workspace opens is solved (and graded) as an
  // inequality: anything else opens the equation engine, which these steps
  // would not describe.
  if (resolveStepAlgebraMode(question) !== STEP_ALGEBRA_MODES.RELATION) return null;
  const v = model.variable;
  const solved = solveWork(model.run, v);
  const asked = inequalitySolutionRepresentationStages(withPromptRelationSource(question));
  const parts = asked.length ? stagedAnswer(model.key, v, resolveIntervalAsk(asked)) : [];
  const tail = parts.length ? `; ${parts.join('; ')}` : '';
  return {
    headline: `Solve ${model.run.display}: undo each operation on both sides, and flip the symbol if you divide by a negative number.`,
    steps: [...solved.steps, `So the solution is ${solved.statement}${tail}.`],
    answerSummary: `The solution is ${solved.statement}${tail}.`,
  };
};

const workedSignChart = (model) => {
  const E = model.expression;
  const R = model.symbol;
  const want = isLess(R) ? -1 : 1;
  const ends = model.criticalPoints.map((point) => endText(point.value));
  const label = (interval) => `(${Number.isFinite(interval.left) ? endText(interval.left) : '-∞'}, ${Number.isFinite(interval.right) ? endText(interval.right) : '∞'})`;
  const valueAt = (x) => model.numerator.reduce((p, f) => p * ((x - f.root) ** f.multiplicity), 1)
    / model.denominator.reduce((p, f) => p * ((x - f.root) ** f.multiplicity), 1);
  const tests = model.intervals.map((interval) => {
    const t = testValue(interval.left, interval.right);
    const value = valueAt(t);
    if (!Number.isFinite(value) || value === 0 || Math.sign(value) !== Math.sign(interval.sign)) cannot();
    if ((Math.sign(value) === want) !== interval.included) cannot();
    return `Test x = ${endText(t)} in ${label(interval)}: the expression is ${sign(value)}, so ${interval.included ? 'select' : 'leave out'} this interval.`;
  });
  const zeros = model.criticalPoints.filter((point) => point.isZero && !point.isExcluded).map((point) => endText(point.value));
  const poles = model.criticalPoints.filter((point) => point.isExcluded).map((point) => endText(point.value));
  const selected = model.intervals.filter((interval) => interval.included).map(label);
  const solution = model.solution.length ? notationText(model.solution) : '∅';
  const answer = selected.length
    ? `select ${joinWords(selected)}; the solution set is ${solution}`
    : `select no interval, since none makes the expression ${isLess(R) ? 'negative' : 'positive'}; the solution set is ${solution}`;
  return {
    headline: `Use a sign chart for ${E} ${R} 0: find the critical points, test one number in each interval, and select the intervals where the expression is ${isLess(R) ? 'negative' : 'positive'}.`,
    steps: [
      `Critical points: ${model.criticalPoints.map((point, index) => `x = ${ends[index]}${point.isExcluded ? ' (denominator 0)' : ''}`).join(', ')}. They split the number line into ${countWord(model.intervals.length)} intervals.`,
      ...tests,
      model.inclusive
        ? `${R} also accepts 0, so ${zeros.length ? `x = ${zeros.join(' and x = ')} ${zeros.length === 1 ? 'is' : 'are'} included` : 'no zero is added'}${poles.length ? `; x = ${poles.join(' and x = ')} never ${poles.length === 1 ? 'is' : 'are'}, because the denominator is 0 there` : ''}.`
        : `${R} is strict, so the critical points themselves are left out.`,
      `So ${answer}.`,
    ],
    answerSummary: `${capitalizeFirst(answer)}.`,
  };
};

/** √r exactly, when r is the square of a rational. */
const exactRoot = (r) => {
  if (r.n < 0) return null;
  const top = Math.round(Math.sqrt(r.n));
  const bottom = Math.round(Math.sqrt(r.d));
  return top * top === r.n && bottom * bottom === r.d ? rat(top, bottom) : null;
};

/**
 * The real roots of the squared equation m1·x + b1 = (m2·x + b2)², exactly, with
 * the steps that find them; null when a root is irrational (no candidate list of
 * rationals can then hold it, so completeness is never claimed).
 */
const squaredRoots = (m1, b1, m2, b2) => {
  // (m2·x + b2)² − (m1·x + b1) = a·x² + b·x + c, written with a positive lead.
  let [a, b, c] = [rmul(m2, m2), rsub(rmul(rat(2), rmul(m2, b2)), m1), rsub(rmul(b2, b2), b1)];
  if (a.n < 0 || (a.n === 0 && b.n < 0)) [a, b, c] = [rneg(a), rneg(b), rneg(c)];
  const terms = [[a, 'x²'], [b, 'x'], [c, '']].filter(([coef]) => coef.n !== 0);
  const polyText = terms.map(([coef, power], index) => {
    const size = coef.n < 0 ? rneg(coef) : coef;
    const body = power ? termR(size, power) : exactText(size);
    if (index === 0) return coef.n < 0 ? `-${body}` : body;
    return `${coef.n < 0 ? '-' : '+'} ${body}`;
  }).join(' ');
  let roots;
  let found;
  if (a.n === 0) {
    if (b.n === 0) return null;
    roots = [rdiv(rneg(c), b)];
    found = `so x = ${exactText(roots[0])}`;
  } else {
    const disc = rsub(rmul(b, b), rmul(rat(4), rmul(a, c)));
    if (disc.n < 0) {
      roots = [];
      found = `which has no real solution: its discriminant b² - 4ac is ${exactText(disc)}, which is negative`;
    } else {
      const root = exactRoot(disc);
      if (!root) return null;
      const twoA = rmul(rat(2), a);
      roots = [...new Map([rsub(rneg(b), root), radd(rneg(b), root)].map((top) => rdiv(top, twoA)).map((r) => [`${r.n}/${r.d}`, r])).values()]
        .sort((p, q) => rval(p) - rval(q));
      found = `and the quadratic formula gives ${roots.map((r) => `x = ${exactText(r)}`).join(' or ')}`;
    }
  }
  const steps = (model, rhs) => {
    const right = m2.n === 0 ? exactText(rmul(b2, b2)) : rhs === 'x' ? 'x²' : `(${rhs})²`;
    return [
      `Square both sides: ${model.radicand} = ${right}. Gather every term on one side: ${polyText} = 0, ${found}.`,
      roots.length
        ? `Every real solution of ${model.equation} ${roots.length > 1 ? 'is one of these numbers, and each of them is a candidate' : 'must be this number, and it is a candidate'}, so checking the candidates finds every solution.`
        : `So ${model.equation} has no real solution either, and every candidate must fail the check.`,
    ];
  };
  return { roots, steps };
};

const workedRadical = (question, model) => {
  const [m1, b1, m2, b2] = [model.m1, model.b1, model.m2, model.b2].map(ratOrStop);
  const rhs = linearText(model.m2, model.b2, 'x');
  const rootText = (r) => `√${exactText(r).includes('/') ? `(${exactText(r)})` : exactText(r)}`;
  const kept = [];
  const steps = [`Squaring both sides can create candidates that do not solve ${model.equation}, so check each candidate in the original equation.`];
  // Whether the candidates hold every solution there is: only then may the
  // conclusion speak of the equation itself, not just of these candidates.
  const squared = squaredRoots(m1, b1, m2, b2);
  const complete = squared !== null && squared.roots.every((root) => model.values.some((value) => sameRat(ratOrStop(value), root)));
  if (complete) steps.push(...squared.steps(model, rhs));
  model.values.forEach((value) => {
    const c = ratOrStop(value);
    const x = endText(value);
    const R = radd(rmul(m1, c), b1);
    const S = radd(rmul(m2, c), b2);
    const rightSide = m2.n === 0 ? `the right side is ${exactText(S)}` : `the right side ${rhs} is ${exactText(S)}`;
    let keep = false;
    if (R.n < 0) {
      steps.push(`Check x = ${x}: the radicand ${model.radicand} is ${exactText(R)}, which is negative, so the square root is not a real number. Reject it.`);
    } else {
      const root = exactRoot(R);
      const left = `the radicand ${model.radicand} is ${exactText(R)}, so the left side is ${rootText(R)}${root && !sameRat(root, R) ? ` = ${exactText(root)}` : ''}`;
      if (S.n < 0) {
        steps.push(`Check x = ${x}: ${left}, but ${rightSide}. A square root is never negative, so x = ${x} is extraneous. Reject it.`);
      } else if (sameRat(rmul(S, S), R)) {
        keep = true;
        steps.push(`Check x = ${x}: ${left}, and ${rightSide}, which matches. Keep it.`);
      } else {
        steps.push(`Check x = ${x}: ${left}, but ${rightSide}${root ? '' : `, and ${exactText(S)}² = ${exactText(rmul(S, S))}, not ${exactText(R)}`}. The two sides are not equal, so reject it.`);
      }
    }
    // The grader's own verdict on this candidate must agree.
    if (keep !== model.valid.includes(value)) cannot();
    if (keep) kept.push(x);
  });
  const select = `select ${kept.length > 1 ? 'them' : 'it'}`;
  const named = joinWords(kept.map((x) => `x = ${x}`));
  let answer;
  if (complete) {
    answer = kept.length
      ? `the equation's only real solution${kept.length > 1 ? 's are' : ' is'} ${named}: ${select}`
      : 'the equation has no real solution: select none of the candidates';
  } else {
    answer = kept.length
      ? `of the candidates, ${kept.length > 1 ? `only ${named} check out` : `only ${named} checks out`}: ${select}`
      : 'none of the candidates solves the equation: select none of them';
  }
  return {
    headline: `Check each candidate in ${model.equation}: squaring both sides can create candidates that do not work.`,
    steps: [...steps, `So ${answer}.`],
    answerSummary: `${capitalizeFirst(answer)}.`,
  };
};

/** The ordered pair the orderedPair grader holds: question.answer || question.solution, as two numbers. */
const gradedPair = (question, model) => {
  const key = question.answer || question.solution;
  if (!Array.isArray(key) || key.length !== 2) return null;
  const pair = key.map(plainNumber);
  return pair.every((value) => value !== null) && samePoint(pair, model.point) ? pair : null;
};

const workedPlotted = (model) => {
  const [x, y] = model.point.map(endText);
  const [px, py] = model.point;
  const xStep = px === 0
    ? 'The point is straight above, below or on the origin, so the x-coordinate is 0.'
    : `Move ${endText(Math.abs(px))} units ${px < 0 ? 'left' : 'right'} until you are level with the point: ${px < 0 ? 'left is negative' : 'right is positive'}, so the x-coordinate is ${x}.`;
  const yStep = py === 0
    ? 'The point is on the x-axis itself, so the y-coordinate is 0.'
    : `Then move ${endText(Math.abs(py))} units ${py < 0 ? 'down' : 'up'} to the point: ${py < 0 ? 'down is negative' : 'up is positive'}, so the y-coordinate is ${y}.`;
  return {
    headline: 'Read the plotted point: count across from the origin for x, then up or down for y.',
    steps: ['Start at the origin, where the axes cross.', xStep, yStep, `Write x first, then y: (${x}, ${y}).`],
  };
};

const workedLines = (model) => {
  const [first, second] = model.lines;
  const [m1, b1, m2, b2] = [first.m, first.b, second.m, second.b].map(ratOrStop);
  const [X, Y] = model.point.map(ratOrStop);
  // The point is on both lines, exactly.
  if (!sameRat(radd(rmul(m1, X), b1), Y) || !sameRat(radd(rmul(m2, X), b2), Y) || sameRat(m1, m2)) cannot();
  const at = `(${exactText(X)}, ${exactText(Y)})`;
  const plug = (m, b) => linearR(m, b, 'x').replace(/x/g, `(${exactText(X)})`);
  const flat = m1.n === 0 ? 0 : m2.n === 0 ? 1 : -1;
  let steps;
  if (flat >= 0) {
    const level = flat === 0 ? first : second;
    const other = flat === 0 ? second : first;
    const [m, b] = flat === 0 ? [m2, b2] : [m1, b1];
    const solveX = isOne(m)
      ? `so x = ${exactText(rsub(Y, b))}`
      : `so ${termR(m, 'x')} = ${exactText(rsub(Y, b))} and x = ${exactText(X)}`;
    steps = [
      `${level.display} is a horizontal line, so at the meeting point y = ${exactText(Y)}.`,
      `Substitute into ${other.display}: ${exactText(Y)} = ${linearR(m, b, 'x')}, ${solveX}.`,
    ];
  } else {
    const gathered = rsub(m1, m2);
    steps = [
      `At the meeting point both equations give the same y, so set the right sides equal: ${linearR(m1, b1, 'x')} = ${linearR(m2, b2, 'x')}.`,
      `Gather the x-terms and the numbers: ${termR(gathered, 'x')} = ${exactText(rsub(b2, b1))}${isOne(gathered) ? '' : `, so x = ${exactText(X)}`}.`,
      `Substitute x = ${exactText(X)} into ${first.display}: y = ${plug(m1, b1)} = ${exactText(Y)}.`,
      `Check in ${second.display}: ${plug(m2, b2)} = ${exactText(Y)}.`,
    ];
  }
  return {
    headline: `Find where ${first.display} and ${second.display} meet: the point is on both lines, so both equations give the same y there.`,
    steps: [...steps, `The lines meet at ${at}.`],
  };
};

const workedPoint = (question, model) => {
  const pair = gradedPair(question, model);
  if (!pair || !['plotted', 'lines'].includes(model.sub)) return null;
  const worked = model.sub === 'plotted' ? workedPlotted(model) : workedLines(model);
  const answer = `(${endText(pair[0])}, ${endText(pair[1])})`;
  return { ...worked, answerSummary: `The point is ${answer}.` };
};

const LABEL_ORDINALS = Object.freeze(['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']);

const workedNumberLine = (question, model) => {
  // The number-line grader holds question.target, and the student selects one of the labels.
  const target = plainNumber(question.target);
  if (target === null || target !== model.target || !list(question.choices).length) return null;
  const labels = model.labels;
  const position = labels.findIndex((value) => value === target);
  if (position < 0 || position >= LABEL_ORDINALS.length) return null;
  const t = endText(target);
  const shown = labels.map(endText).join(', ');
  return {
    headline: `Find ${t} on the number line: decide which side of zero it is on, then count along the labels.`,
    steps: [
      target === 0 ? '0 is neither positive nor negative: it is the zero point itself.' : `${t} is ${target < 0 ? 'negative, so it sits to the left of zero' : 'positive, so it sits to the right of zero'}.`,
      model.spacing ? `The labels go up by ${endText(model.spacing)} from left to right: ${shown}.` : `The labels from left to right are ${shown}.`,
      `${t} is the ${LABEL_ORDINALS[position]} label from the left: select it.`,
    ],
    answerSummary: `Select the point ${t}.`,
  };
};

const WORKED = Object.freeze({
  interval: workedInterval,
  linearInequality: workedLinearInequality,
  signChart: (question, model) => workedSignChart(model),
  radical: workedRadical,
  point: workedPoint,
  numberLine: workedNumberLine,
});

export const workedSolution = (question) => {
  const model = modelFor(question);
  if (!model || !WORKED[model.kind]) return null;
  try {
    const worked = WORKED[model.kind](question, model);
    if (!worked) return null;
    const steps = list(worked.steps).map(text).filter(Boolean);
    const headline = text(worked.headline);
    const answerSummary = text(worked.answerSummary);
    if (!steps.length || !answerSummary) return null;
    if ([headline, ...steps, answerSummary].some((line) => SLOPPY.test(line))) return null;
    return { headline, steps, answerSummary };
  } catch {
    return null;
  }
};
