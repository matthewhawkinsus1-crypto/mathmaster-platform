// Question family: one-variable linear equations and literal equations: stepAlgebra, algebra, literal, stepAlgebra2, and multiAnswer items from families linear.twoStepEquation / linear.multiStepEquation.
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
// WHAT THIS FAMILY OWNS (first in the index order, so it must not over-claim):
//
//   numeric    one variable, numbers only: 3x + 5 = 20, 5x + 3 - 2x = 3x + 1,
//              -2(x - 3) + 5x = 4, \frac{x}{3} + 17 = 37. Read from the Step
//              Algebra sides (leftExpression / rightExpression), the equation
//              text fields, the legacy `algebra` a·x + b = c, the stepAlgebra2
//              {a, b, c} solver, or the $…$ equation of a multiAnswer prompt.
//              Special outcomes (no solution / all real numbers) included.
//   literal    a formula solved for one letter: A = bh + c for h, A = 5r - 3 for r,
//              C = 15 + 7g for g (a formula applied to a given value), and
//              Ax + By = C rewritten in slope-intercept form (line form).
//
// NOT owned, so a later family (or the platform's generic help) gets them:
// inequalities (pointsAndIntervals), the linearIntercepts mode (linesAndSlope),
// a factored-linear rewrite, systems (two equations), anything nonlinear
// (x², |x|, √x, a variable in a denominator), function notation f(x), and a
// multiAnswer item that is neither a linear-equation family instance nor
// unmistakably "Solve <one linear equation>" with one field whose key is that
// equation's solution.
//
// SAFETY. Every hint and back-up text is built in two spellings: one quoting
// this problem's numbers, and a plain one that names the move without them.
// The numbered spelling is used unless it contains one of this question's
// answers (hintRevealsAnswer, the same guard the platform runs, also read with
// "- 5" closed up to "-5") — 3x + 5 = 20 has the answer 5 in it, so
// "subtract 5" becomes "subtract the constant"; 3x - 5 = -20 likewise.
// No text ever states the solution, the value of an intermediate equation, or
// the slope/intercept of a line form. On a question that can be a special case
// (relation workspace), the hints are the same sentences whichever case the
// student drew: they never say which case it is.
//
// Pure: no React, no mathjs, no I/O. Exact rational arithmetic only.
import { hintRevealsAnswer } from '../../../../functions/shared/pathSolutionSupport.mjs';
import {
  ONE,
  ZERO,
  absolute,
  add,
  constTerm,
  divide,
  equals,
  expandLinearSide,
  groupTerm,
  isInteger,
  isZero,
  multiply,
  negate,
  rational,
  rationalLatex,
  rationalText,
  subtract,
  toNumber,
  toRational,
  xTerm,
} from '../../../../functions/shared/questionFamilyExact.mjs';

export const family = 'linearEquations';
export const implemented = true;

/** The platform Question Families whose instances this family helps with. */
export const LINEAR_EQUATION_FAMILY_IDS = Object.freeze(['linear.twoStepEquation', 'linear.multiStepEquation']);

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];
const MINUS_ONE = rational(-1);

/* ---------------------------------------------------------------------------
 * Small exact helpers.
 * ------------------------------------------------------------------------- */

const gcdInt = (left, right) => {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a;
};
const lcmInt = (left, right) => (left / gcdInt(left, right)) * right;

const decimalRational = (digits) => {
  const [whole, fraction = ''] = String(digits).split('.');
  if (fraction.length > 6 || whole.length > 9) throw new RangeError('number too long');
  return rational(Number(`${whole || '0'}${fraction}`), 10 ** fraction.length);
};

/** "3.5" for 7/2, null for 1/3: the decimal a student would write, only when exact. */
const terminatingDecimal = (value) => {
  const r = toRational(value);
  let d = r.d;
  while (d % 2 === 0) d /= 2;
  while (d % 5 === 0) d /= 5;
  if (d !== 1) return null;
  const decimal = String(toNumber(r));
  return /e/i.test(decimal) ? null : decimal;
};

/** A number as this problem writes numbers: decimals stay decimals, fractions stay fractions. */
const numberLatex = (value, style = 'fraction') => {
  const r = toRational(value);
  if (r.d === 1) return String(r.n);
  if (style === 'decimal') {
    const decimal = terminatingDecimal(r);
    if (decimal !== null) return decimal;
  }
  return rationalLatex(r);
};

const sign = (value) => (toRational(value).n < 0 ? -1 : 1);

/* ---------------------------------------------------------------------------
 * Reading an expression: LaTeX or engine text → a small tree.
 * ------------------------------------------------------------------------- */

const readBraced = (source, start) => {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return { body: source.slice(start + 1, index), end: index + 1 };
    }
  }
  return null;
};

const expandFractions = (source) => {
  let out = source;
  const pattern = /\\[dt]?frac\s*/;
  for (let guard = 0; pattern.test(out); guard += 1) {
    if (guard > 40) return null;
    const match = pattern.exec(out);
    const start = match.index + match[0].length;
    if (out[start] !== '{') {
      const short = /^(\d)(\d)/.exec(out.slice(start));
      if (!short) return null;
      out = `${out.slice(0, match.index)}((${short[1]})/(${short[2]}))${out.slice(start + 2)}`;
      continue;
    }
    const numerator = readBraced(out, start);
    if (!numerator) return null;
    let next = numerator.end;
    while (out[next] === ' ') next += 1;
    if (out[next] !== '{') return null;
    const denominator = readBraced(out, next);
    if (!denominator) return null;
    out = `${out.slice(0, match.index)}((${numerator.body})/(${denominator.body}))${out.slice(denominator.end)}`;
  }
  return out;
};

// f(x), g(t): function notation is a different question (evaluation, inverses).
const FUNCTION_NOTATION = /(^|[^A-Za-z\\])[fgh]\s*\(\s*[a-z]\s*\)/;

const normalizeMath = (source) => {
  let value = text(source);
  if (!value || FUNCTION_NOTATION.test(value)) return null;
  value = value
    .replace(/\$/g, ' ')
    .replace(/[−–—]/g, '-')
    .replace(/\\left\s*/g, '')
    .replace(/\\right\s*/g, '')
    .replace(/\\(?:cdot|times|ast)(?![A-Za-z])/g, '*')
    .replace(/\\div(?![A-Za-z])/g, '/')
    .replace(/\\(?:quad|qquad)(?![A-Za-z])/g, ' ')
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/\\pi(?![A-Za-z])/g, ' pi ')
    .replace(/[×·⋅]/g, '*')
    .replace(/÷/g, '/');
  value = expandFractions(value);
  if (value === null) return null;
  value = value.replace(/_\{([A-Za-z0-9]+)\}/g, '_$1');
  // Any other command (\sqrt, \le, \text, \vert …) is not a linear equation we read.
  if (/\\/.test(value)) return null;
  return value.replace(/[{[]/g, '(').replace(/[}\]]/g, ')');
};

const tokenize = (source) => {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const rest = source.slice(index);
    const space = /^\s+/.exec(rest);
    if (space) { index += space[0].length; continue; }
    const number = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(rest);
    if (number) { tokens.push({ kind: 'num', text: number[0] }); index += number[0].length; continue; }
    const name = /^[A-Za-z]+(?:_[A-Za-z0-9]+)?/.exec(rest);
    if (name) { tokens.push({ kind: 'id', text: name[0] }); index += name[0].length; continue; }
    if ('+-*/^()'.includes(rest[0])) { tokens.push({ kind: rest[0] }); index += 1; continue; }
    return null;
  }
  return tokens;
};

const FUNCTION_NAMES = new Set(['sqrt', 'abs', 'exp', 'log', 'ln', 'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'mod', 'nthroot', 'and', 'or', 'for', 'if', 'of', 'then']);

const symbolNode = (name, target) => {
  const [letters, subscript] = name.split('_');
  if (subscript !== undefined) return { type: 'sym', name };
  if (FUNCTION_NAMES.has(letters.toLowerCase())) throw new SyntaxError('function or prose');
  if (letters === 'pi' || letters.length === 1) return { type: 'sym', name: letters };
  // The platform's literal convention (literalWorkspace.expandImplicitProducts):
  // lowercase letters standing together are separate variables (bh = b·h).
  // A short mixed run that holds the letter being solved for is split too
  // (I = Prt for t), so the letter can be isolated.
  const split = /^[a-z]{2,3}$/.test(letters) || (letters.length <= 3 && target && letters.includes(target));
  if (split) {
    return { type: 'product', factors: letters.split('').map((letter) => ({ node: { type: 'sym', name: letter }, inverse: false })) };
  }
  if (/^[a-z]+$/.test(letters)) throw new SyntaxError('a word, not a variable');
  return { type: 'sym', name: letters };
};

/** The expression tree of one side, or null when it is not ordinary algebra. */
const parseExpression = (source, target = '') => {
  const normalized = normalizeMath(source);
  if (!normalized) return null;
  const tokens = tokenize(normalized);
  if (!tokens || !tokens.length) return null;
  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];
  const fail = () => { throw new SyntaxError('unreadable'); };
  const startsFactor = (token) => Boolean(token) && (token.kind === 'num' || token.kind === 'id' || token.kind === '(');

  let expression;
  const primary = () => {
    const token = take();
    if (!token) return fail();
    if (token.kind === 'num') return { type: 'num', value: decimalRational(token.text), text: token.text };
    if (token.kind === 'id') return symbolNode(token.text, target);
    if (token.kind === '(') {
      const inner = expression();
      if (take()?.kind !== ')') fail();
      return { type: 'paren', node: inner };
    }
    return fail();
  };
  const power = () => {
    const base = primary();
    if (peek()?.kind === '^') {
      take();
      return { type: 'power', base, exponent: unary() };
    }
    return base;
  };
  const unary = () => {
    if (peek()?.kind === '-') { take(); return { type: 'neg', node: unary() }; }
    if (peek()?.kind === '+') { take(); return unary(); }
    return power();
  };
  const product = () => {
    const factors = [{ node: unary(), inverse: false }];
    while (peek()) {
      const token = peek();
      if (token.kind === '*' || token.kind === '/') {
        take();
        factors.push({ node: unary(), inverse: token.kind === '/' });
        continue;
      }
      if (startsFactor(token)) { factors.push({ node: power(), inverse: false }); continue; }
      break;
    }
    return factors.length === 1 ? factors[0].node : { type: 'product', factors };
  };
  expression = () => {
    const terms = [{ sign: 1, node: product() }];
    while (peek() && (peek().kind === '+' || peek().kind === '-')) {
      const operator = take().kind;
      terms.push({ sign: operator === '-' ? -1 : 1, node: product() });
    }
    return terms.length === 1 ? terms[0].node : { type: 'sum', terms };
  };
  try {
    const node = expression();
    return position === tokens.length ? node : null;
  } catch {
    return null;
  }
};

/* ---------------------------------------------------------------------------
 * Polynomials over the letters, with exact coefficients: the reading every
 * kind is checked against.
 * ------------------------------------------------------------------------- */

const MAX_DEGREE = 4;
const monomialKey = (symbols) => [...symbols].sort().join('*');

const addInto = (map, symbols, coef) => {
  const key = monomialKey(symbols);
  const previous = map.get(key);
  const next = previous ? add(previous.coef, coef) : toRational(coef);
  if (isZero(next)) map.delete(key);
  else map.set(key, { symbols: [...symbols].sort(), coef: next });
};
const polyOf = (entries) => {
  const map = new Map();
  entries.forEach(([symbols, coef]) => addInto(map, symbols, coef));
  return map;
};
const polyAdd = (left, right, factor = ONE) => {
  const out = new Map(left);
  for (const { symbols, coef } of right.values()) addInto(out, symbols, multiply(factor, coef));
  return out;
};
const polyScale = (poly, factor) => {
  const out = new Map();
  for (const { symbols, coef } of poly.values()) addInto(out, symbols, multiply(coef, factor));
  return out;
};
const polyMul = (left, right) => {
  const out = new Map();
  for (const one of left.values()) {
    for (const two of right.values()) addInto(out, [...one.symbols, ...two.symbols], multiply(one.coef, two.coef));
  }
  return out;
};
const polyConstant = (poly) => ([...poly.keys()].every((key) => key === '') ? (poly.get('')?.coef ?? ZERO) : null);
const polySymbols = (poly) => new Set([...poly.values()].flatMap((monomial) => monomial.symbols));
const polyEquals = (left, right) => left.size === right.size
  && [...left.entries()].every(([key, { coef }]) => right.has(key) && equals(right.get(key).coef, coef));

const toPoly = (node) => {
  switch (node.type) {
    case 'num': return polyOf([[[], node.value]]);
    case 'sym': return polyOf([[[node.name], ONE]]);
    case 'neg': return polyScale(toPoly(node.node), MINUS_ONE);
    case 'paren': return toPoly(node.node);
    case 'sum': return node.terms.reduce((sum, term) => polyAdd(sum, toPoly(term.node), term.sign < 0 ? MINUS_ONE : ONE), new Map());
    case 'product': return node.factors.reduce((productSoFar, factor) => {
      const value = toPoly(factor.node);
      if (!factor.inverse) return polyMul(productSoFar, value);
      const constant = polyConstant(value);
      if (constant === null || isZero(constant)) throw new RangeError('division by a variable');
      return polyScale(productSoFar, divide(ONE, constant));
    }, polyOf([[[], ONE]]));
    case 'power': {
      const exponent = polyConstant(toPoly(node.exponent));
      if (exponent === null || !isInteger(exponent) || exponent.n < 0 || exponent.n > MAX_DEGREE) throw new RangeError('exponent');
      const base = toPoly(node.base);
      let out = polyOf([[[], ONE]]);
      for (let count = 0; count < exponent.n; count += 1) out = polyMul(out, base);
      return out;
    }
    default: throw new TypeError('unknown node');
  }
};

const constantOf = (node) => {
  try {
    return polyConstant(toPoly(node));
  } catch {
    return null;
  }
};

/* ---------------------------------------------------------------------------
 * Linear term trees (questionFamilyExact's shape: x terms, constants and
 * k·(…) groups) — the structure the hints and the worked steps talk about.
 * ------------------------------------------------------------------------- */

const scaleTerm = (term, factor) => {
  if (term.kind === 'x') return xTerm(multiply(term.coef, factor));
  if (term.kind === 'c') return constTerm(multiply(term.value, factor));
  return groupTerm(multiply(term.mult, factor), term.inner);
};

const termsOf = (node, variable, factor) => {
  if (node.type === 'neg') return termsOf(node.node, variable, negate(factor));
  const constant = constantOf(node);
  if (constant !== null) return [constTerm(multiply(factor, constant))];
  if (node.type === 'sym') {
    if (node.name !== variable) throw new SyntaxError('another letter');
    return [xTerm(factor)];
  }
  if (node.type === 'paren' || node.type === 'sum') {
    const inner = sideTerms(node.type === 'paren' ? node.node : node, variable);
    if (inner.length === 1) return [scaleTerm(inner[0], factor)];
    return [groupTerm(factor, inner)];
  }
  if (node.type === 'power') {
    const exponent = constantOf(node.exponent);
    if (exponent && equals(exponent, ONE)) return termsOf(node.base, variable, factor);
    throw new SyntaxError('a power of the variable');
  }
  if (node.type === 'product') {
    let coef = factor;
    let core = null;
    for (const { node: part, inverse } of node.factors) {
      const value = constantOf(part);
      if (value !== null) {
        if (inverse && isZero(value)) throw new RangeError('division by zero');
        coef = inverse ? divide(coef, value) : multiply(coef, value);
        continue;
      }
      // A variable in a denominator, or two non-constant factors (x·x, x(x + 1)).
      if (inverse || core) throw new SyntaxError('not linear');
      core = part;
    }
    return core ? termsOf(core, variable, coef) : [constTerm(coef)];
  }
  throw new SyntaxError('unreadable term');
};

const sideTerms = (node, variable) => (node.type === 'sum'
  ? node.terms.flatMap((term) => termsOf(term.node, variable, term.sign < 0 ? MINUS_ONE : ONE))
  : termsOf(node, variable, ONE));

const termsPoly = (terms, variable) => {
  const { a, b } = expandLinearSide(terms);
  return polyOf([[[variable], a], [[], b]]);
};

/** "3x + 5", "-2\left(x - 3\right) + 5x", "\frac{1}{2}x - 4": a side as a student reads it. */
const termsLatex = (terms, variable, style) => {
  const magnitude = (term) => {
    if (term.kind === 'x') return `${equals(absolute(term.coef), ONE) ? '' : numberLatex(absolute(term.coef), style)}${variable}`;
    if (term.kind === 'c') return numberLatex(absolute(term.value), style);
    return `${equals(absolute(term.mult), ONE) ? '' : numberLatex(absolute(term.mult), style)}\\left(${termsLatex(term.inner, variable, style)}\\right)`;
  };
  const termSign = (term) => sign(term.kind === 'x' ? term.coef : term.kind === 'c' ? term.value : term.mult);
  return (terms.map((term, index) => {
    const body = magnitude(term);
    if (index === 0) return termSign(term) < 0 ? `-${body}` : body;
    return `${termSign(term) < 0 ? ' - ' : ' + '}${body}`;
  }).join('')) || '0';
};

const equationLatexOf = (left, right, variable, style) => `${termsLatex(left, variable, style)} = ${termsLatex(right, variable, style)}`;

/** "9w", "\frac{1}{2}bh", "c": one side of a formula, the solved-for letter last in each term. */
const polyLatex = (poly, { style = 'fraction', last = '' } = {}) => {
  // Higher degree first; then code-point order, so a formula's capital letter
  // leads (P + d, not d + P); constants last.
  const order = (key) => (key === '' ? '\uffff' : key);
  const monomials = [...poly.values()].sort((one, two) => (two.symbols.length - one.symbols.length)
    || (order(monomialKey(one.symbols)) < order(monomialKey(two.symbols)) ? -1 : 1));
  const lettersLatex = (symbols) => {
    const ordered = [...symbols.filter((symbol) => symbol !== last), ...symbols.filter((symbol) => symbol === last)];
    const counts = [];
    ordered.forEach((symbol) => {
      const previous = counts[counts.length - 1];
      if (previous && previous.symbol === symbol) previous.count += 1;
      else counts.push({ symbol, count: 1 });
    });
    return counts.map(({ symbol, count }) => {
      const name = symbol === 'pi' ? '\\pi ' : symbol.replace(/_(\w+)/, '_{$1}');
      return count > 1 ? `${name.trim()}^{${count}}` : name;
    }).join('').trim();
  };
  return monomials.map((monomial, index) => {
    const magnitude = absolute(monomial.coef);
    const letters = lettersLatex(monomial.symbols);
    const number = letters && equals(magnitude, ONE) ? '' : numberLatex(magnitude, style);
    const body = `${number}${letters}`;
    if (index === 0) return monomial.coef.n < 0 ? `-${body}` : body;
    return `${monomial.coef.n < 0 ? ' - ' : ' + '}${body}`;
  }).join('') || '0';
};

/** The same, in plain text: what a student would type ("(A - c)/b"). */
const polyPlain = (poly, options) => polyLatex(poly, options)
  .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2')
  .replace(/\\pi/g, 'pi')
  .replace(/[{}]/g, '');

/** The original equation as LaTeX, from its tree: structure kept ("2x + (-4)"). */
const nodeLatex = (node) => {
  switch (node.type) {
    case 'num': return node.text;
    case 'sym': return node.name === 'pi' ? '\\pi' : node.name.replace(/_(\w+)/, '_{$1}');
    case 'neg': return `-${nodeLatex(node.node)}`;
    // The reader's \frac{…}{…} arrives as ((…)/(…)): keep a bracket only
    // where it groups a sum or a negative.
    case 'paren': return node.node.type === 'sum' || node.node.type === 'neg' ? `\\left(${nodeLatex(node.node)}\\right)` : nodeLatex(node.node);
    case 'power': return `${nodeLatex(node.base)}^{${nodeLatex(node.exponent)}}`;
    case 'sum': return node.terms.map((term, index) => {
      const body = nodeLatex(term.node);
      if (index === 0) return term.sign < 0 ? `-${body}` : body;
      return `${term.sign < 0 ? ' - ' : ' + '}${body}`;
    }).join('');
    case 'product': {
      const join = (factors) => factors.map((factor, index) => {
        const body = nodeLatex(factor.node);
        return index > 0 && /^[\d.-]/.test(body) ? `\\cdot ${body}` : body;
      }).join('');
      // A legacy draw's "1 * x + 10" reads "x + 10", never "1x + 10".
      const unitLead = (factors) => (factors.length > 1 && factors[0].node.type === 'num' && equals(factors[0].node.value, ONE)
        && factors[1].node.type !== 'num' ? factors.slice(1) : factors);
      const top = unitLead(node.factors.filter((factor) => !factor.inverse));
      const bottom = node.factors.filter((factor) => factor.inverse);
      if (!bottom.length) return join(top);
      const unwrap = (factors) => (factors.length === 1 && factors[0].node.type === 'paren' ? nodeLatex(factors[0].node.node) : join(factors));
      return `\\frac{${top.length ? unwrap(top) : '1'}}{${unwrap(bottom)}}`;
    }
    default: return '';
  }
};

/* ---------------------------------------------------------------------------
 * Which equation the question shows.
 * ------------------------------------------------------------------------- */

const EQUATION_TEXT_FIELDS = Object.freeze(['equationAscii', 'equation', 'initialEquation', 'equationText', 'formula', 'equationLatex', 'formulaLatex']);
const RELATION = /[<>≤≥≠]|\\(?:le|ge|lt|gt|ne|neq|leq|geq|leqslant|geqslant)(?![A-Za-z])/;

const splitEquation = (value) => {
  if (typeof value !== 'string') return null;
  const source = text(value);
  if (!source || RELATION.test(source)) return null;
  const parts = source.split('=');
  return parts.length === 2 && text(parts[0]) && text(parts[1]) ? parts.map(text) : null;
};

const mathSegments = (prompt) => [...String(prompt ?? '').matchAll(/\$\$?([^$]+)\$\$?/g)].map((match) => text(match[1]));

const typeOf = (question) => text(question?.type);
const isStepAlgebra2 = (question) => typeOf(question).toLowerCase() === 'stepalgebra2' || text(question?.toolId).toLowerCase() === 'stepalgebra2';
const familyIdOf = (question) => text(question?.familyInstance?.familyId) || text(question?.questionFamily?.id);
export const isLinearEquationFamilyItem = (question) => LINEAR_EQUATION_FAMILY_IDS.includes(familyIdOf(question));

const isSlopeInterceptTask = (question) => question?.objective?.kind === 'slopeIntercept'
  || text(question?.targetForm) === 'slopeIntercept'
  || (question?.mode === 'rewriteLinearForm' && (text(question?.targetForm) || 'slopeIntercept') === 'slopeIntercept');

const declaredTarget = (question) => {
  const named = text(question?.solveFor) || text(question?.objective?.variable) || text(question?.variable);
  if (named) return named;
  if (isSlopeInterceptTask(question)) return 'y';
  if (typeOf(question) === 'multiAnswer') {
    const field = list(question.answerFields)[0];
    const fromLabel = /^\$?\s*([A-Za-z])\s*\$?\s*=\s*$/.exec(text(field?.label));
    if (fromLabel) return fromLabel[1];
    const fromPrompt = /\bfor\s+\$?\s*([A-Za-z])\s*\$?(?![A-Za-z])/.exec(String(question.prompt ?? ''));
    if (fromPrompt) return fromPrompt[1];
  }
  return '';
};

const abcModel = (source) => {
  if (!isObject(source)) return null;
  const values = ['a', 'b', 'c'].map((key) => (source[key] === '' || source[key] === null || source[key] === undefined ? NaN : Number(source[key])));
  if (!values.every((value) => Number.isFinite(value) && Number.isInteger(value * 1000))) return null;
  const [a, b, c] = values.map((value) => decimalRational(String(value)));
  return { a, b, c };
};

/** Every place this question may hold its equation, best first: [{ left, right } | { abc }]. */
const equationCandidates = (question) => {
  const type = typeOf(question);
  const out = [];
  if (type === 'multiAnswer') {
    mathSegments(question.prompt).map(splitEquation).filter(Boolean).forEach(([left, right]) => out.push({ left, right, fromPrompt: true }));
    return out;
  }
  if (typeof question.leftExpression === 'string' && typeof question.rightExpression === 'string'
    && text(question.leftExpression) && text(question.rightExpression)) {
    out.push({ left: text(question.leftExpression), right: text(question.rightExpression) });
  }
  EQUATION_TEXT_FIELDS.forEach((field) => {
    const sides = splitEquation(question[field]);
    if (sides) out.push({ left: sides[0], right: sides[1] });
  });
  if (type === 'algebra') {
    const abc = abcModel(question);
    if (abc) out.push({ abc });
  }
  if (isStepAlgebra2(question)) {
    const abc = abcModel(question.equation);
    if (abc) out.push({ abc });
    // The legacy solver opens 3x + 6 = 21 when the question authors none.
    if (question.equation === undefined || question.equation === null) out.push({ abc: { a: rational(3), b: rational(6), c: rational(21) } });
  }
  return out;
};

const isOwnedShape = (question) => {
  if (!isObject(question)) return false;
  const type = typeOf(question);
  if (type === 'multiAnswer') return true;
  if (!['stepAlgebra', 'algebra', 'literal'].includes(type) && !isStepAlgebra2(question)) return false;
  // Not ours: the intercept orchestrator, a factored-linear rewrite, systems, inequalities.
  if (text(question.mode).toLowerCase() === 'linearintercepts') return false;
  if (question.mode === 'rewriteLinearForm' && text(question.targetForm) === 'factoredLinear') return false;
  if (list(question.equations).length > 1) return false;
  if (text(question.inequalityText) || text(question.inequality)) return false;
  return true;
};

/* ---------------------------------------------------------------------------
 * The model of one question: what kind it is and everything the hints, the
 * answer forms, the back-up step and the sibling need.
 * ------------------------------------------------------------------------- */

const keyedAnswers = (question) => {
  const values = [];
  const push = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) values.push(String(value));
    else if (typeof value === 'string' && text(value)) values.push(text(value));
  };
  list(question.answerFields).forEach((field) => {
    push(field?.answer);
    push(field?.expected);
    list(field?.acceptedAnswers).forEach(push);
    list(field?.accepted).forEach(push);
  });
  push(question.answer);
  push(question.generatedAnswer);
  list(question.acceptedAnswers).forEach(push);
  if (isObject(question.solutionKey)) {
    push(question.solutionKey.value);
    push(question.solutionKey.latex);
    push(question.solutionKey.display);
  }
  return unique(values);
};

const numericKey = (value) => {
  const cleaned = text(value).replace(/[−–]/g, '-').replace(/\s+/g, '').replace(/^\$|\$$/g, '').replace(/^[A-Za-z]=/, '');
  try {
    if (/^-?\d+(?:\.\d+)?$/.test(cleaned)) return cleaned.startsWith('-') ? negate(decimalRational(cleaned.slice(1))) : decimalRational(cleaned);
    const fraction = /^(-?)(\d+)\/(\d+)$/.exec(cleaned) || /^(-?)\\frac\{(\d+)\}\{(\d+)\}$/.exec(cleaned);
    if (fraction && Number(fraction[3])) return rational((fraction[1] ? -1 : 1) * Number(fraction[2]), Number(fraction[3]));
  } catch { /* not a number */ }
  return null;
};

const specialOutcomeOf = (question) => {
  const outcome = text(question?.solutionKey?.outcome);
  return outcome === 'noSolution' || outcome === 'allReals' ? outcome : null;
};

const buildNumeric = ({ question, leftTerms: shownLeft, rightTerms: shownRight, variable, display, style }) => {
  // "5x + 0 = 1x - 16" (a Path template's draw): a zero term is not a move.
  const withoutZeros = (terms) => terms.filter((term) => term.kind === 'group' || !isZero(term.kind === 'x' ? term.coef : term.value));
  const leftTerms = withoutZeros(shownLeft);
  const rightTerms = withoutZeros(shownRight);
  const L = expandLinearSide(leftTerms);
  const R = expandLinearSide(rightTerms);
  if (isZero(L.a) && isZero(R.a)) return null;
  // Already solved (x = 7, 5 = x): there is nothing to help with.
  const bare = (terms) => terms.length === 1 && terms[0].kind === 'x' && equals(terms[0].coef, ONE);
  if ((bare(leftTerms) && isZero(R.a)) || (bare(rightTerms) && isZero(L.a))) return null;
  const A = subtract(L.a, R.a);
  const B = subtract(R.b, L.b);
  const outcome = isZero(A) ? (isZero(B) ? 'allReals' : 'noSolution') : 'value';
  return {
    kind: 'numeric',
    variable,
    leftTerms,
    rightTerms,
    display,
    style,
    outcome,
    solution: outcome === 'value' ? divide(B, A) : null,
    // A relation-workspace slot can be any case: its hints must not differ by
    // case. An equation with no single value gets the same case-neutral ending.
    relation: question.relationWorkspace === true || Boolean(specialOutcomeOf(question)) || outcome !== 'value',
  };
};

const splitByTarget = (poly, target) => {
  const coefficient = new Map();
  const rest = new Map();
  for (const monomial of poly.values()) {
    if (monomial.symbols.includes(target)) addInto(coefficient, monomial.symbols.filter((symbol) => symbol !== target), monomial.coef);
    else addInto(rest, monomial.symbols, monomial.coef);
  }
  return { coefficient, rest };
};

const buildLiteral = ({ question, leftPoly, rightPoly, target, display, style }) => {
  const every = [...leftPoly.values(), ...rightPoly.values()];
  if (every.some((monomial) => monomial.symbols.filter((symbol) => symbol === target).length > 1)) return null;
  const left = splitByTarget(leftPoly, target);
  const right = splitByTarget(rightPoly, target);
  const inLeft = left.coefficient.size > 0;
  const inRight = right.coefficient.size > 0;
  if (!inLeft && !inRight) return null;
  let side;
  let coefficient;
  let rest;
  let other;
  if (inLeft && !inRight) { side = 'left'; coefficient = left.coefficient; rest = left.rest; other = rightPoly; }
  else if (inRight && !inLeft) { side = 'right'; coefficient = right.coefficient; rest = right.rest; other = leftPoly; }
  else { side = 'both'; coefficient = polyAdd(left.coefficient, right.coefficient, MINUS_ONE); rest = left.rest; other = right.rest; }
  if (!coefficient.size) return null;
  const unit = (poly) => { const value = polyConstant(poly); return value !== null && equals(value, ONE); };
  // Already solved for the letter: nothing to help with (C = 25 + 5g "for C").
  if (side !== 'both' && unit(coefficient) && !rest.size) return null;
  const numerator = polyAdd(other, rest, MINUS_ONE);
  const symbols = new Set([...polySymbols(leftPoly), ...polySymbols(rightPoly)]);
  const denominator = polyConstant(coefficient);
  const lineForm = target === 'y' && symbols.size === 2 && symbols.has('x') && denominator !== null
    && [...numerator.values()].every((monomial) => monomial.symbols.length === 0 || (monomial.symbols.length === 1 && monomial.symbols[0] === 'x'));
  const keyed = keyedAnswers(question);
  return {
    kind: 'literal',
    target,
    leftPoly,
    rightPoly,
    side,
    coefficient,
    rest,
    other,
    numerator,
    display,
    style,
    lineForm,
    // "C = 15 + 7g … a bill is $50": the formula is applied to a given value,
    // so the answer is a number, not an expression.
    applied: !lineForm && keyed.length > 0 && keyed.every((value) => numericKey(value) !== null),
  };
};

const sameSides = (one, two, target) => {
  const a = parseExpression(one[0], target);
  const b = parseExpression(one[1], target);
  const c = parseExpression(two[0], target);
  const d = parseExpression(two[1], target);
  if (!a || !b || !c || !d) return false;
  try {
    return polyEquals(toPoly(a), toPoly(c)) && polyEquals(toPoly(b), toPoly(d));
  } catch {
    return false;
  }
};

/** The equation as this student sees it: the prompt's own LaTeX when it shows the same equation. */
const displayFor = (question, sides, target, fallback) => {
  if (!sides) return fallback;
  const shown = mathSegments(question.prompt).find((segment) => {
    const split = splitEquation(segment);
    return split && sameSides(split, sides, target);
  });
  return shown || fallback;
};

const modelFromCandidate = (question, candidate) => {
  const target = declaredTarget(question);
  if (candidate.abc) {
    const { a, b, c } = candidate.abc;
    if (isZero(a)) return null;
    const variable = text(question.variable) || 'x';
    const leftTerms = isZero(b) ? [xTerm(a)] : [xTerm(a), constTerm(b)];
    const rightTerms = [constTerm(c)];
    const style = [a, b, c].some((value) => !isInteger(value)) ? 'decimal' : 'fraction';
    const display = equationLatexOf(leftTerms, rightTerms, variable, style);
    return buildNumeric({ question, leftTerms, rightTerms, variable, display: displayFor(question, [termsLatex(leftTerms, variable, style), termsLatex(rightTerms, variable, style)], variable, display), style });
  }
  const leftNode = parseExpression(candidate.left, target);
  const rightNode = parseExpression(candidate.right, target);
  if (!leftNode || !rightNode) return null;
  let leftPoly;
  let rightPoly;
  try {
    leftPoly = toPoly(leftNode);
    rightPoly = toPoly(rightNode);
  } catch {
    return null;
  }
  if ([...leftPoly.values(), ...rightPoly.values()].some((monomial) => monomial.symbols.length > MAX_DEGREE)) return null;
  const symbols = [...new Set([...polySymbols(leftPoly), ...polySymbols(rightPoly)])];
  if (!symbols.length) return null;
  const style = /\d\.\d|(^|[^\d])\.\d/.test(`${candidate.left} ${candidate.right}`) ? 'decimal' : 'fraction';
  const display = displayFor(question, [candidate.left, candidate.right], target, `${nodeLatex(leftNode)} = ${nodeLatex(rightNode)}`);
  if (symbols.length === 1 && symbols[0] !== 'pi' && !(isSlopeInterceptTask(question) && symbols[0] !== 'y')) {
    const variable = symbols[0];
    let leftTerms;
    let rightTerms;
    try {
      leftTerms = sideTerms(leftNode, variable);
      rightTerms = sideTerms(rightNode, variable);
    } catch {
      return null;
    }
    // The tree and the polynomial must read the same equation.
    if (!polyEquals(termsPoly(leftTerms, variable), leftPoly) || !polyEquals(termsPoly(rightTerms, variable), rightPoly)) return null;
    return buildNumeric({ question, leftTerms, rightTerms, variable, display, style });
  }
  if (!target || !symbols.includes(target)) return null;
  return buildLiteral({ question, leftPoly, rightPoly, target, display, style });
};

const modelFor = (question) => {
  if (!isOwnedShape(question)) return null;
  for (const candidate of equationCandidates(question)) {
    const model = modelFromCandidate(question, candidate);
    if (model) return model;
  }
  return null;
};

/* ---------------------------------------------------------------------------
 * matches
 * ------------------------------------------------------------------------- */

const solutionKeyMatches = (question, model) => {
  const keys = keyedAnswers(question);
  if (!keys.length) return false;
  if (model.kind === 'numeric') {
    if (model.outcome !== 'value') return false;
    return keys.some((key) => {
      const value = numericKey(key);
      return value !== null && equals(value, model.solution);
    });
  }
  // A literal answer is an expression: the prompt naming the letter and a
  // non-numeric key is the signal (numeric keys mean an applied formula).
  return !model.applied;
};

export const matches = (question) => {
  if (!isOwnedShape(question)) return false;
  if (typeOf(question) === 'multiAnswer') {
    if (isLinearEquationFamilyItem(question)) return true;
    const fields = list(question.answerFields);
    if (fields.length !== 1 || list(fields[0]?.options).length) return false;
    if (!/\bsolve\b/i.test(String(question.prompt ?? ''))) return false;
    const equations = mathSegments(question.prompt).filter((segment) => splitEquation(segment));
    if (equations.length !== 1) return false;
    const model = modelFor(question);
    return Boolean(model) && solutionKeyMatches(question, model);
  }
  return Boolean(modelFor(question));
};

/* ---------------------------------------------------------------------------
 * expectedValues: every form an answer could leak in.
 * ------------------------------------------------------------------------- */

const SPECIAL_OUTCOME_TEXTS = Object.freeze({
  noSolution: Object.freeze(['No solution', 'no solutions', 'empty set', '\\varnothing', '\\emptyset', '∅']),
  allReals: Object.freeze(['All real numbers', 'infinitely many solutions', 'every real number', '\\mathbb{R}']),
});

const withUnicodeMinus = (value) => (value.startsWith('-') ? [value, `−${value.slice(1)}`] : [value]);

const valueTexts = (value, variable) => {
  const forms = unique([rationalText(value), rationalLatex(value), isInteger(value) ? '' : terminatingDecimal(value) || '']);
  return unique([
    ...forms.flatMap(withUnicodeMinus),
    ...forms.flatMap((form) => [`${variable} = ${form}`, `${variable}=${form}`]),
  ]);
};

const literalAnswerTexts = (model) => {
  const { target, numerator, coefficient } = model;
  const style = model.style;
  const options = { style, last: target };
  const forms = [];
  // The coefficient of the letter is c·S (S its letters, c a number p/q):
  // the answer is q·N over p·S, which is how a student writes it (2A/b).
  const single = coefficient.size === 1 ? [...coefficient.values()][0] : null;
  const constant = polyConstant(coefficient);
  if (constant !== null) {
    const scaled = polyScale(numerator, divide(ONE, constant));
    forms.push(polyLatex(scaled, options), polyPlain(scaled, options));
  }
  if (single) {
    const q = rational(single.coef.d);
    const top = polyScale(numerator, single.coef.n < 0 ? negate(q) : q);
    const bottom = polyOf([[single.symbols, rational(Math.abs(single.coef.n))]]);
    const unit = !single.symbols.length && Math.abs(single.coef.n) === 1;
    if (!unit) {
      const topLatex = polyLatex(top, options);
      const topPlain = polyPlain(top, options);
      const bottomLatex = polyLatex(bottom, { style });
      const bottomPlain = polyPlain(bottom, { style });
      const simpleBottom = single.symbols.length === 0 || (single.symbols.length === 1 && Math.abs(single.coef.n) === 1);
      forms.push(`\\frac{${topLatex}}{${bottomLatex}}`, `(${topPlain})/(${bottomPlain})`, `(${topPlain.replace(/\s+/g, '')})/(${bottomPlain})`);
      if (simpleBottom) forms.push(`(${topPlain})/${bottomPlain}`, `(${topPlain.replace(/\s+/g, '')})/${bottomPlain}`);
      if (top.size === 1) forms.push(`${topPlain}/${simpleBottom ? bottomPlain : `(${bottomPlain})`}`);
    }
  } else {
    const topLatex = polyLatex(numerator, options);
    const topPlain = polyPlain(numerator, options);
    const bottomLatex = polyLatex(coefficient, { style });
    const bottomPlain = polyPlain(coefficient, { style });
    forms.push(`\\frac{${topLatex}}{${bottomLatex}}`, `(${topPlain})/(${bottomPlain})`, `(${topPlain.replace(/\s+/g, '')})/(${bottomPlain.replace(/\s+/g, '')})`);
  }
  const out = [...forms, ...forms.map((form) => `${target} = ${form}`)];
  if (model.lineForm) {
    const { slope, intercept } = lineParts(model);
    out.push(...valueTexts(slope, 'm'));
    if (!isZero(intercept)) out.push(...valueTexts(intercept, 'b'));
  }
  return out;
};

function lineParts(model) {
  const constant = polyConstant(model.coefficient);
  const scaled = polyScale(model.numerator, divide(ONE, constant));
  return { slope: scaled.get('x')?.coef ?? ZERO, intercept: scaled.get('')?.coef ?? ZERO };
}

export const expectedValues = (question) => {
  try {
    if (!isObject(question)) return [];
    const values = [...keyedAnswers(question)];
    const special = specialOutcomeOf(question);
    if (special) values.push(...SPECIAL_OUTCOME_TEXTS[special]);
    const model = modelFor(question);
    if (model?.kind === 'numeric') {
      if (model.outcome === 'value') values.push(...valueTexts(model.solution, model.variable));
      else values.push(...SPECIAL_OUTCOME_TEXTS[model.outcome]);
      // A key that disagrees with the displayed equation is guarded too.
      keyedAnswers(question).map(numericKey).filter(Boolean).forEach((value) => values.push(...valueTexts(value, model.variable)));
    } else if (model?.kind === 'literal') {
      values.push(...literalAnswerTexts(model));
    }
    return unique(values);
  } catch {
    return [];
  }
};

/* ---------------------------------------------------------------------------
 * The moves that solve a numeric equation, with the equation after each one.
 * The same list drives the hints (first moves, no results), the back-up step
 * (first move) and the sibling's worked steps (every move, every result).
 * ------------------------------------------------------------------------- */

const termValue = (term) => (term.kind === 'x' ? term.coef : term.kind === 'c' ? term.value : term.mult);
const hasGroup = (terms) => terms.some((term) => term.kind === 'group');
const hasFraction = (terms) => terms.some((term) => !isInteger(termValue(term)) || (term.kind === 'group' && hasFraction(term.inner)));
const fractionInsideGroup = (terms) => terms.some((term) => term.kind === 'group' && (hasFraction(term.inner) || fractionInsideGroup(term.inner)));
const topDenominator = (terms) => terms.reduce((lcm, term) => lcmInt(lcm, toRational(termValue(term)).d), 1);
const distributeTerms = (terms, factor = ONE) => terms.flatMap((term) => (term.kind === 'group'
  ? distributeTerms(term.inner, multiply(factor, term.mult))
  : [scaleTerm(term, factor)]));
const combineTerms = (terms) => {
  const { a, b } = expandLinearSide(terms);
  return [...(isZero(a) ? [] : [xTerm(a)]), ...(isZero(b) ? [] : [constTerm(b)])];
};
const needsCombine = (terms) => terms.filter((term) => term.kind === 'x').length > 1
  || terms.filter((term) => term.kind === 'c').length > 1
  || terms.some((term) => isZero(termValue(term)));

export const numericMoves = (leftTerms, rightTerms, { style = 'fraction' } = {}) => {
  const moves = [];
  let left = leftTerms;
  let right = rightTerms;
  // Decimals (1.2x + 6 = 30) are worked as decimals, never "cleared" by 5.
  const clearFractions = style !== 'decimal';
  const push = (move) => moves.push({ ...move, left, right });
  const clear = () => {
    const factor = rational(lcmInt(topDenominator(left), topDenominator(right)));
    left = left.map((term) => scaleTerm(term, factor));
    right = right.map((term) => scaleTerm(term, factor));
    push({ kind: 'clear', factor });
  };
  // Fractions outside any parentheses are cleared first (multiply both sides
  // by 7 for (6x − 24)/7 = 12); fractions inside parentheses after distributing.
  if (clearFractions && !fractionInsideGroup([...left, ...right]) && hasFraction([...left, ...right])) clear();
  if (hasGroup(left) || hasGroup(right)) {
    const groups = [...left, ...right].filter((term) => term.kind === 'group');
    left = distributeTerms(left);
    right = distributeTerms(right);
    push({ kind: 'distribute', groups });
  }
  if (clearFractions && hasFraction([...left, ...right])) clear();
  if (needsCombine(left) || needsCombine(right)) {
    const before = { left, right };
    left = combineTerms(left);
    right = combineTerms(right);
    push({ kind: 'combine', before });
  }
  if (isZero(expandLinearSide(left).a) && !isZero(expandLinearSide(right).a)) {
    [left, right] = [right, left];
    push({ kind: 'swap' });
  }
  const rightX = expandLinearSide(right).a;
  if (!isZero(rightX)) {
    left = combineTerms([...left, xTerm(negate(rightX))]);
    right = combineTerms([...right, xTerm(negate(rightX))]);
    push({ kind: 'collect', coef: rightX });
  }
  const a = expandLinearSide(left).a;
  if (isZero(a)) {
    const statement = { left: expandLinearSide(left).b, right: expandLinearSide(right).b };
    push({ kind: 'special', outcome: equals(statement.left, statement.right) ? 'allReals' : 'noSolution', statement });
    return moves;
  }
  const b = expandLinearSide(left).b;
  if (!isZero(b)) {
    left = [xTerm(a)];
    right = [constTerm(subtract(expandLinearSide(right).b, b))];
    push({ kind: 'constant', value: b });
  } else if (left.length !== 1 || right.length > 1) {
    left = [xTerm(a)];
    right = [constTerm(expandLinearSide(right).b)];
  }
  if (!equals(a, ONE)) {
    left = [xTerm(ONE)];
    right = [constTerm(divide(expandLinearSide(right).b, a))];
    push({ kind: 'divide', by: a });
  }
  return moves;
};

/* ---------------------------------------------------------------------------
 * Hints.
 * ------------------------------------------------------------------------- */

/**
 * hintRevealsAnswer, also on the spelling with every "- 5" closed up to "-5".
 * A term is written with a space after its sign ("3x - 5", "Undo the $- 5$"),
 * which the platform guard does not read as −5: 3x + 5 = 20 (answer 5) lost
 * its numbered spellings while 3x - 5 = -20 (answer −5) kept them.
 */
const revealsAnswer = (value, answers) => hintRevealsAnswer(value, answers)
  || hintRevealsAnswer(String(value ?? '').replace(/[-−]\s+(?=[\d.]|\\frac)/g, '-'), answers);

/** The first spelling that does not contain one of the answers; null when none is safe. */
const firstSafe = (variants, answers) => variants.map(text).find((variant) => variant && !revealsAnswer(variant, answers)) || null;

const originalMagnitudes = (terms) => terms.flatMap((term) => [
  rationalText(absolute(termValue(term))),
  ...(term.kind === 'group' ? originalMagnitudes(term.inner) : []),
]);

const addOrSubtract = (value, what) => (sign(value) > 0
  ? `subtract $${what}$ from both sides`
  : `add $${what}$ to both sides`);
const capitalize = (sentence) => sentence.charAt(0).toUpperCase() + sentence.slice(1);
/** "3x", "x", "\frac{1}{2}x": the size of an x-term, without its sign. */
const xMagnitude = (coef, variable, style) => `${equals(absolute(coef), ONE) ? '' : numberLatex(absolute(coef), style)}${variable}`;

/**
 * [numbered, plain] spellings of one move, as a hint. A number is quoted only
 * when the student can see it in the original equation (`own`): a value the
 * earlier moves computed (the −5 of −5/3 · 3) is named in words instead.
 */
const numericMoveHint = (move, model, { own, first }) => {
  const v = model.variable;
  const style = model.style;
  const show = (value) => numberLatex(absolute(value), style);
  const visible = (value) => own.has(rationalText(absolute(value)));
  const lead = (sentence) => (first ? `${sentence} first` : `Then ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`);
  switch (move.kind) {
    case 'clear':
      return [
        `${lead('Clear the fractions')}: multiply every term on both sides by $${show(move.factor)}$.`,
        `${lead('Clear the fractions')}: multiply every term on both sides by the least common denominator.`,
      ];
    case 'distribute': {
      const [group] = move.groups;
      const inside = (terms) => `$\\left(${termsLatex(terms, v, style)}\\right)$`;
      const insideVisible = (terms) => terms.every((term) => (term.kind === 'group' ? false : visible(termValue(term))));
      if (move.groups.length === 1 && equals(group.mult, MINUS_ONE)) {
        const plain = `${lead('Distribute the negative sign')}: change the sign of every term inside the parentheses.`;
        return insideVisible(group.inner) ? [`${lead('Distribute the negative sign')}: change the sign of every term inside ${inside(group.inner)}.`, plain] : [plain];
      }
      // (x + 3) + 2, or 1·(6x − 24) once 7 has cleared (6x − 24)/7: there is
      // no number in front to multiply by.
      if (move.groups.every((term) => equals(term.mult, ONE))) {
        return [`${lead('Remove the parentheses')}: with no number in front of them, every term inside keeps its sign.`];
      }
      const plain = `${lead('Distribute')}: multiply the number in front of the parentheses by each term inside them.`;
      if (move.groups.length === 1 && visible(group.mult) && insideVisible(group.inner)) {
        return [`${lead('Distribute')}: multiply $${numberLatex(group.mult, style)}$ by each term inside ${inside(group.inner)}.`, plain];
      }
      return [plain];
    }
    case 'combine': {
      const sides = [['left', move.before.left], ['right', move.before.right]].filter(([, terms]) => needsCombine(terms));
      const [name, terms] = sides[0];
      const xs = terms.filter((term) => term.kind === 'x');
      const like = xs.length > 1 ? xs : terms.filter((term) => term.kind === 'c');
      const plain = `${lead('Combine like terms on each side')}: add the $${v}$-terms together and the constants together.`;
      if (sides.length > 1 || !like.every((term) => visible(termValue(term)))) return [plain];
      const named = like.map((term) => `$${termsLatex([term], v, style)}$`).join(' and ');
      return [`${lead(`Combine like terms on the ${name} side`)}: ${named} are like terms.`, plain];
    }
    case 'collect': {
      const plain = `${lead(`Get the $${v}$-terms on one side`)}: remove the $${v}$-term from the right side by doing the opposite operation to both sides.`;
      if (!visible(move.coef)) return [plain];
      return [`${lead(`Get the $${v}$-terms on one side`)}: ${addOrSubtract(move.coef, xMagnitude(move.coef, v, style))}.`, plain];
    }
    case 'constant': {
      const plain = `${lead(`Undo the constant term on the $${v}$ side`)} by doing the opposite operation to both sides.`;
      if (!visible(move.value)) return [plain];
      return [`${lead(`Undo the $${sign(move.value) > 0 ? '+' : '-'} ${show(move.value)}$ on the $${v}$ side`)}: ${addOrSubtract(move.value, show(move.value))}.`, plain];
    }
    case 'divide': {
      const plain = `${lead('Undo the multiplication')}: divide both sides by the coefficient of $${v}$.`;
      if (!visible(move.by)) return [plain];
      return [`${lead('Undo the multiplication')}: divide both sides by $${numberLatex(move.by, style)}$.`, plain];
    }
    default:
      return null;
  }
};

const AGNOSTIC_MOVES = new Set(['clear', 'distribute', 'combine', 'collect']);

const numericHintVariants = (model) => {
  const v = model.variable;
  const eq = model.display;
  const own = new Set(originalMagnitudes([...model.leftTerms, ...model.rightTerms]));
  const moves = numericMoves(model.leftTerms, model.rightTerms, { style: model.style }).filter((move) => move.kind !== 'swap');
  const out = [[
    `Start from $${eq}$: what is being done to $${v}$, and in what order? Undo those operations in reverse order, doing the same thing to both sides.`,
    `Look at what is being done to $${v}$ in the equation, and in what order. Undo those operations in reverse order, doing the same thing to both sides.`,
  ]];
  const [first, second] = moves;
  if (model.relation) {
    // Any case: the sentences may not depend on which one this is.
    if (first && AGNOSTIC_MOVES.has(first.kind)) out.push(numericMoveHint(first, model, { own, first: true }));
    out.push([`Then collect the $${v}$-terms on one side and the constants on the other, doing the same thing to both sides.`]);
    out.push([`If $${v}$ is still in the equation, divide both sides by its coefficient. If the $${v}$-terms cancel, decide whether the statement that is left is always true or never true.`]);
    return out.filter(Boolean);
  }
  if (first && first.kind !== 'special') out.push(numericMoveHint(first, model, { own, first: true }));
  if (second && second.kind !== 'special') out.push(numericMoveHint(second, model, { own, first: false }));
  out.push([
    `Check your value: substitute it into $${eq}$ and make sure both sides come out equal.`,
    'Check your value: substitute it into the original equation and make sure both sides come out equal.',
  ]);
  return out.filter(Boolean);
};

/* Literal equations: the same moves, on formulas. */

const polyDenominator = (poly) => [...poly.values()].reduce((lcm, monomial) => lcmInt(lcm, monomial.coef.d), 1);

const literalMoves = (model) => {
  const moves = [];
  let { coefficient, rest, other } = model;
  const factor = lcmInt(polyDenominator(model.leftPoly), polyDenominator(model.rightPoly));
  // y = 3.5x + 7 is divided by 3.5, not "cleared" by 2.
  if (factor > 1 && model.style !== 'decimal') {
    const scale = rational(factor);
    coefficient = polyScale(coefficient, scale);
    rest = polyScale(rest, scale);
    other = polyScale(other, scale);
    moves.push({ kind: 'clear', factor: scale });
  }
  if (model.side === 'both') moves.push({ kind: 'collect' });
  if (rest.size) moves.push({ kind: 'rest', rest });
  const constant = polyConstant(coefficient);
  if (constant === null || !equals(constant, ONE)) moves.push({ kind: 'divide', by: coefficient });
  return { moves, coefficient, rest, other };
};

const literalMoveHint = (move, model) => {
  const t = model.target;
  const style = model.style;
  const latex = (poly) => polyLatex(poly, { style, last: t });
  switch (move.kind) {
    case 'clear':
      return [
        `Clear the fraction first: multiply both sides by $${numberLatex(move.factor, style)}$.`,
        'Clear the fraction first: multiply both sides by the denominator.',
      ];
    case 'collect':
      return [`Collect the $${t}$-terms on one side, then factor $${t}$ out of them.`];
    case 'rest': {
      if (move.rest.size === 1) {
        const [monomial] = [...move.rest.values()];
        const magnitude = latex(polyOf([[monomial.symbols, absolute(monomial.coef)]]));
        return [
          `Undo the $${monomial.coef.n < 0 ? '-' : '+'} ${magnitude}$ on the $${t}$ side: ${addOrSubtract(monomial.coef, magnitude)}.`,
          `Undo the term without $${t}$ on the $${t}$ side: do the opposite operation to both sides.`,
        ];
      }
      return [
        `Move the terms without $${t}$ to the other side: subtract $\\left(${latex(move.rest)}\\right)$ from both sides.`,
        `Move the terms without $${t}$ to the other side by doing the opposite operation to both sides.`,
      ];
    }
    case 'divide': {
      const by = move.by.size > 1 ? `\\left(${latex(move.by)}\\right)` : latex(move.by);
      return [
        `Undo the multiplication: divide both sides by $${by}$${model.lineForm ? `, the coefficient of $${t}$` : ''}.`,
        `Undo the multiplication: divide both sides by the coefficient of $${t}$.`,
      ];
    }
    default:
      return null;
  }
};

const literalHintVariants = (model) => {
  const t = model.target;
  const eq = model.display;
  const { moves } = literalMoves(model);
  const out = [];
  if (model.lineForm) {
    out.push([
      `Start from $${eq}$: to write it in slope-intercept form, get $y$ by itself on one side.`,
      'To write the equation in slope-intercept form, get $y$ by itself on one side.',
    ]);
  } else if (model.applied) {
    out.push([
      `Start from $${eq}$: put in the value the question gives you, then solve for $${t}$ by undoing what is done to it.`,
      `Use the formula and the value the question gives you, then solve for $${t}$ by undoing what is done to it.`,
    ]);
  } else {
    out.push([
      `Start from $${eq}$: you are solving for $${t}$. Treat every other letter as if it were a number, and undo what is done to $${t}$.`,
      `You are solving for $${t}$. Treat every other letter as if it were a number, and undo what is done to $${t}$.`,
    ]);
  }
  moves.slice(0, 2).forEach((move) => out.push(literalMoveHint(move, model)));
  if (model.lineForm) {
    out.push(['Finish by writing the equation as $y = mx + b$: the $x$-term first, then the constant.']);
  } else if (model.applied) {
    out.push([
      `Check: put your value for $${t}$ back into $${eq}$ with the given value, and make sure both sides are equal.`,
      `Check: put your value for $${t}$ back into the formula with the given value, and make sure both sides are equal.`,
    ]);
  } else {
    out.push([
      `Check: your answer for $${t}$ should not contain $${t}$, and putting it back into $${eq}$ should make both sides equal.`,
      `Check: your answer for $${t}$ should not contain $${t}$, and putting it back into the formula should make both sides equal.`,
    ]);
  }
  return out.filter(Boolean);
};

const GENERIC_LINEAR_HINTS = Object.freeze([
  'Look at what is being done to the variable, and in what order. Undo those operations in reverse order.',
  'Whatever you do to one side of the equation, do the same thing to the other side.',
  'Check your value: substitute it into the original equation and make sure both sides come out equal.',
]);

export const hints = (question) => {
  try {
    if (!matches(question)) return [];
    const answers = expectedValues(question);
    const model = modelFor(question);
    const variants = model
      ? (model.kind === 'numeric' ? numericHintVariants(model) : literalHintVariants(model))
      : GENERIC_LINEAR_HINTS.map((hint) => [hint]);
    return variants.map((spellings) => firstSafe(spellings, answers)).filter(Boolean).slice(0, 4);
  } catch {
    return [];
  }
};

/* ---------------------------------------------------------------------------
 * "Let's back up": this problem's first move, as a two-choice question.
 * ------------------------------------------------------------------------- */

const hashString = (value) => {
  let hash = 2166136261;
  const source = String(value ?? '');
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const capitalized = (sentence) => capitalize(sentence.trim());

const numericBackUp = (model) => {
  const v = model.variable;
  const style = model.style;
  const show = (value) => numberLatex(absolute(value), style);
  const moves = numericMoves(model.leftTerms, model.rightTerms, { style }).filter((move) => move.kind !== 'swap');
  const [first] = moves;
  if (!first || first.kind === 'special') return null;
  // The x-coefficient on the side the variable is isolated on, after this move.
  const xCoefficient = expandLinearSide(first.left).a;
  switch (first.kind) {
    case 'clear':
      return {
        rich: [`Multiply every term on both sides by $${show(first.factor)}$`, `Multiply only the first term by $${show(first.factor)}$`],
        plain: ['Multiply every term on both sides by the common denominator', 'Multiply only the first term by the common denominator'],
      };
    case 'distribute': {
      const [group] = first.groups;
      if (first.groups.length === 1 && equals(group.mult, MINUS_ONE)) {
        return {
          rich: [`Change the sign of every term inside $\\left(${termsLatex(group.inner, v, style)}\\right)$`, `Change the sign of only the first term inside $\\left(${termsLatex(group.inner, v, style)}\\right)$`],
          plain: ['Change the sign of every term inside the parentheses', 'Change the sign of only the first term inside the parentheses'],
        };
      }
      // Nothing in front: "distribute 1" is no move, and undoing the constant
      // inside is a correct first move here, so it cannot be the wrong choice.
      if (first.groups.every((term) => equals(term.mult, ONE))) {
        const choices = ['Remove the parentheses: every term inside keeps its sign', 'Change the sign of every term inside the parentheses'];
        return { rich: choices, plain: choices };
      }
      const innerConstant = group.inner.find((term) => term.kind === 'c');
      const wrongRich = innerConstant
        ? capitalized(addOrSubtract(innerConstant.value, show(innerConstant.value)))
        : `Multiply only the first term inside the parentheses by $${show(group.mult)}$`;
      return {
        rich: [`Distribute $${numberLatex(group.mult, style)}$ to each term inside the parentheses`, wrongRich],
        plain: ['Distribute the number in front to each term inside the parentheses', 'Undo the constant inside the parentheses first'],
      };
    }
    case 'combine': {
      const terms = needsCombine(first.before.left) ? first.before.left : first.before.right;
      const xs = terms.filter((term) => term.kind === 'x');
      const like = xs.length > 1 ? xs : terms.filter((term) => term.kind === 'c');
      const lead = xs[0] || terms.find((term) => term.kind === 'x');
      return {
        rich: [
          `Combine the like terms ${like.map((term) => `$${termsLatex([term], v, style)}$`).join(' and ')}`,
          lead && !equals(absolute(lead.coef), ONE) ? `Divide both sides by $${numberLatex(lead.coef, style)}$` : 'Move one of the like terms to the other side without changing its sign',
        ],
        plain: ['Combine the like terms on the same side', 'Divide both sides by the first coefficient'],
      };
    }
    case 'collect':
      return {
        rich: [
          capitalized(addOrSubtract(first.coef, xMagnitude(first.coef, v, style))),
          capitalized(addOrSubtract(negate(first.coef), xMagnitude(first.coef, v, style))),
        ],
        plain: [`Remove the $${v}$-term from the right side with the opposite operation on both sides`, `Add the $${v}$-term on the right to both sides`],
      };
    case 'constant':
      return {
        rich: [
          capitalized(addOrSubtract(first.value, show(first.value))),
          equals(absolute(xCoefficient), ONE) ? capitalized(addOrSubtract(negate(first.value), show(first.value))) : `Divide both sides by $${numberLatex(xCoefficient, style)}$`,
        ],
        plain: [`Undo the constant term on the $${v}$ side`, `Divide both sides by the coefficient of $${v}$`],
      };
    case 'divide':
      return {
        rich: [`Divide both sides by $${numberLatex(first.by, style)}$`, `Subtract $${show(first.by)}$ from both sides`],
        plain: [`Divide both sides by the coefficient of $${v}$`, `Subtract the coefficient of $${v}$ from both sides`],
      };
    default:
      return null;
  }
};

const literalBackUp = (model) => {
  const t = model.target;
  const style = model.style;
  const latex = (poly) => polyLatex(poly, { style, last: t });
  const { moves } = literalMoves(model);
  const [first] = moves;
  if (!first) return null;
  if (first.kind === 'clear') {
    return {
      rich: [`Multiply both sides by $${numberLatex(first.factor, style)}$`, `Add $${numberLatex(first.factor, style)}$ to both sides`],
      plain: ['Multiply both sides by the denominator', 'Add the denominator to both sides'],
    };
  }
  if (first.kind === 'collect') {
    return {
      rich: [`Collect the $${t}$-terms on one side`, `Divide both sides by $${t}$`],
      plain: [`Collect the $${t}$-terms on one side`, `Divide both sides by $${t}$`],
    };
  }
  if (first.kind === 'rest') {
    const restText = first.rest.size === 1 ? null : `\\left(${latex(first.rest)}\\right)`;
    const [monomial] = [...first.rest.values()];
    const magnitude = restText || latex(polyOf([[monomial.symbols, absolute(monomial.coef)]]));
    const correct = restText ? `Subtract $${restText}$ from both sides` : capitalized(addOrSubtract(monomial.coef, magnitude));
    const second = moves[1];
    let wrong;
    if (model.lineForm) {
      const yCoefficient = polyConstant(model.coefficient) ?? ONE;
      wrong = capitalized(addOrSubtract(yCoefficient, xMagnitude(yCoefficient, t, style)));
    } else if (second?.kind === 'divide') {
      wrong = `Divide both sides by $${second.by.size > 1 ? `\\left(${latex(second.by)}\\right)` : latex(second.by)}$`;
    } else {
      wrong = restText ? `Add $${restText}$ to both sides` : capitalized(addOrSubtract(negate(monomial.coef), magnitude));
    }
    return {
      rich: [correct, wrong],
      plain: [`Undo the term without $${t}$ first`, `Divide both sides by the coefficient of $${t}$ first`],
    };
  }
  const by = first.by.size > 1 ? `\\left(${latex(first.by)}\\right)` : latex(first.by);
  // The wrong move is named by the coefficient's size: "Subtract $3$", never "Subtract $-3$".
  const [single] = first.by.size === 1 ? [...first.by.values()] : [];
  const wrong = single && single.coef.n < 0 ? `Subtract $${latex(polyScale(first.by, MINUS_ONE))}$ from both sides` : `Subtract $${by}$ from both sides`;
  return {
    rich: [`Divide both sides by $${by}$`, wrong],
    plain: [`Divide both sides by the coefficient of $${t}$`, `Subtract the coefficient of $${t}$ from both sides`],
  };
};

export const backUpQuestion = (question) => {
  try {
    if (!matches(question)) return null;
    const model = modelFor(question);
    if (!model) return null;
    const step = model.kind === 'numeric' ? numericBackUp(model) : literalBackUp(model);
    if (!step) return null;
    const answers = expectedValues(question);
    const subject = model.kind === 'numeric' ? 'equation' : model.lineForm ? 'equation' : 'formula';
    const richPrompt = `Let’s back up. In $${model.display}$, which move comes first?`;
    const plainPrompt = `Let’s back up. In this ${subject}, which move comes first?`;
    const safe = (texts) => texts.every((value) => !revealsAnswer(value, answers));
    let options;
    if (safe(step.rich)) options = step.rich;
    else if (safe(step.plain)) options = step.plain;
    else return null;
    const prompt = firstSafe([richPrompt, plainPrompt], answers);
    if (!prompt || options[0] === options[1]) return null;
    const [correct, wrong] = options;
    // The correct move is not always the first choice.
    const ordered = hashString(model.display) % 2 === 0 ? [correct, wrong] : [wrong, correct];
    return { prompt, options: ordered, correct };
  } catch {
    return null;
  }
};

/* ---------------------------------------------------------------------------
 * "Try a similar one": a sibling with different numbers, worked in full.
 * ------------------------------------------------------------------------- */

const mulberry32 = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};
const randomInt = (random, low, high) => Math.floor(random() * (high - low + 1)) + low;
const pick = (random, values) => values[randomInt(random, 0, values.length - 1)];

/** Is this sibling safe to show for this question? (the platform's similarExampleIsSafe rules, plus the numbers check) */
const siblingIsSafe = (example, question, answers, originalValue) => {
  if (!example) return false;
  const answerText = text(example.answer).replace(/\$/g, '');
  if (text(example.prompt) === text(question.prompt)) return false;
  if (answers.some((value) => value.toLowerCase() === answerText.toLowerCase())) return false;
  if (example.steps.some((step) => revealsAnswer(step, answers))) return false;
  if (revealsAnswer(example.answer, answers)) return false;
  const nonNumeric = answers.filter((value) => numericKey(value) === null);
  if (hintRevealsAnswer(example.prompt, nonNumeric)) return false;
  if (originalValue && example.value && equals(originalValue, example.value)) return false;
  return true;
};

const drawLike = (random, original, role) => {
  const value = toRational(original);
  const negative = value.n < 0;
  if ((role === 'coef' || role === 'mult') && equals(absolute(value), ONE)) return value;
  if (value.d === 1) {
    const magnitude = role === 'const' ? randomInt(random, 1, 12) : randomInt(random, 2, 9);
    return rational(negative ? -magnitude : magnitude);
  }
  // Still a fraction; usually the same denominator, sometimes another one (a
  // question whose answer is 3 cannot be shown a sibling full of thirds).
  const denominator = random() < 0.5 ? value.d : pick(random, [2, 3, 4, 5]);
  const candidates = [];
  for (let numerator = 1; numerator <= Math.max(2 * denominator, 4); numerator += 1) {
    if (numerator % denominator !== 0 && gcdInt(numerator, denominator) === 1) candidates.push(numerator);
  }
  const numerator = pick(random, candidates.length ? candidates : [1]);
  return rational(negative ? -numerator : numerator, denominator);
};

const redrawTerms = (terms, random) => terms.map((term) => {
  if (term.kind === 'x') return xTerm(drawLike(random, term.coef, 'coef'));
  if (term.kind === 'c') return constTerm(drawLike(random, term.value, 'const'));
  return groupTerm(drawLike(random, term.mult, 'mult'), redrawTerms(term.inner, random));
});

const constantPaths = (terms, prefix = []) => terms.flatMap((term, index) => {
  if (term.kind === 'c') return [[...prefix, index]];
  if (term.kind === 'group') return constantPaths(term.inner, [...prefix, index]);
  return [];
});
const replaceAt = (terms, path, value) => terms.map((term, index) => {
  if (index !== path[0]) return term;
  if (path.length === 1) return constTerm(value);
  return groupTerm(term.mult, replaceAt(term.inner, path.slice(1), value));
});

const sideShape = (terms) => {
  const { a, b } = expandLinearSide(terms);
  return `${isZero(a) ? 0 : 1}${isZero(b) ? 0 : 1}`;
};

/** The right side's last constant is set so the sibling's answer is the drawn one. */
const solveForConstant = (left, right, value) => {
  const choices = [
    ...constantPaths(right).filter((path) => path.length === 1).reverse().map((path) => ['right', path]),
    ...constantPaths(left).filter((path) => path.length === 1).reverse().map((path) => ['left', path]),
    ...constantPaths(right).filter((path) => path.length > 1).map((path) => ['right', path]),
    ...constantPaths(left).filter((path) => path.length > 1).map((path) => ['left', path]),
  ];
  if (!choices.length) return null;
  const [side, path] = choices[0];
  const residual = (k) => {
    const L = expandLinearSide(side === 'left' ? replaceAt(left, path, k) : left);
    const R = expandLinearSide(side === 'right' ? replaceAt(right, path, k) : right);
    return subtract(add(multiply(L.a, value), L.b), add(multiply(R.a, value), R.b));
  };
  const at0 = residual(ZERO);
  const slope = subtract(residual(ONE), at0);
  if (isZero(slope)) return null;
  const k = divide(negate(at0), slope);
  if (!isInteger(k) || isZero(k) || Math.abs(toNumber(k)) > 99) return null;
  return side === 'left'
    ? { left: replaceAt(left, path, k), right }
    : { left, right: replaceAt(right, path, k) };
};

const numericSibling = (model, random, accept) => {
  const v = model.variable;
  const style = model.style;
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const value = rational(pick(random, [-9, -8, -7, -6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7, 8, 9]));
    const solved = solveForConstant(redrawTerms(model.leftTerms, random), redrawTerms(model.rightTerms, random), value);
    if (!solved) continue;
    const { left, right } = solved;
    if (sideShape(left) !== sideShape(model.leftTerms) || sideShape(right) !== sideShape(model.rightTerms)) continue;
    const L = expandLinearSide(left);
    const R = expandLinearSide(right);
    if (equals(L.a, R.a)) continue;
    if (!equals(divide(subtract(R.b, L.b), subtract(L.a, R.a)), value)) continue;
    const equation = equationLatexOf(left, right, v, style);
    const moves = numericMoves(left, right, { style });
    const last = moves[moves.length - 1];
    if (!last || last.kind === 'special') continue;
    const final = expandLinearSide(last.right);
    if (!(last.left.length === 1 && last.left[0].kind === 'x' && equals(last.left[0].coef, ONE) && equals(final.b, value))) continue;
    const say = (move) => {
      const eq = equationLatexOf(move.left, move.right, v, style);
      const show = (number) => numberLatex(absolute(number), style);
      switch (move.kind) {
        case 'clear': return `Multiply every term on both sides by $${show(move.factor)}$ to clear the fractions: $${eq}$.`;
        case 'distribute': return `Distribute to remove the parentheses: $${eq}$.`;
        case 'combine': return `Combine like terms on each side: $${eq}$.`;
        case 'swap': return `Switch the two sides so the $${v}$-term is on the left: $${eq}$.`;
        case 'collect': return `${capitalize(addOrSubtract(move.coef, xMagnitude(move.coef, v, style)))}: $${eq}$.`;
        case 'constant': return `${capitalize(addOrSubtract(move.value, show(move.value)))}: $${eq}$.`;
        case 'divide': return `Divide both sides by $${numberLatex(move.by, style)}$: $${eq}$.`;
        default: return '';
      }
    };
    const leftValue = add(multiply(L.a, value), L.b);
    const steps = [
      ...moves.map(say).filter(Boolean),
      `Check: with $${v} = ${numberLatex(value, style)}$, both sides of $${equation}$ equal $${numberLatex(leftValue, style)}$.`,
    ];
    const example = {
      prompt: `Solve $${equation}$ for $${v}$.`,
      steps,
      answer: `$${v} = ${numberLatex(value, style)}$`,
      value,
    };
    if (accept(example)) return example;
  }
  return null;
};

const DEPENDENT_LETTERS = Object.freeze(['P', 'Q', 'S', 'T', 'V', 'W', 'M', 'N', 'R', 'E', 'F', 'G', 'H', 'K', 'L', 'U', 'D', 'A', 'B', 'C']);
const TARGET_LETTERS = Object.freeze(['t', 'n', 'r', 'w', 'k', 'm', 'p', 'q', 's', 'u', 'v', 'z', 'h', 'x']);
const OTHER_LETTERS = Object.freeze(['a', 'b', 'c', 'd', 'g', 'j', 'f', 'e', 'h', 'k']);

const singleMonomial = (poly) => (poly.size === 1 ? [...poly.values()][0] : null);

const literalSibling = (model, random, accept) => {
  if (model.applied || model.side === 'both') return null;
  const dependent = singleMonomial(model.other);
  const coefficient = singleMonomial(model.coefficient);
  const rest = model.rest.size ? singleMonomial(model.rest) : null;
  if (!dependent || !coefficient || (model.rest.size && !rest)) return null;
  if (!(dependent.symbols.length === 1 && equals(dependent.coef, ONE))) return null;
  if (coefficient.symbols.length > 2 || (rest && rest.symbols.length > 1)) return null;
  const used = new Set([...polySymbols(model.leftPoly), ...polySymbols(model.rightPoly)]);
  const free = (pool) => pool.filter((letter) => !used.has(letter));
  const dependents = free(DEPENDENT_LETTERS);
  if (!dependents.length) return null;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const D = pick(random, dependents);
    const targets = free(TARGET_LETTERS).filter((letter) => letter !== D.toLowerCase());
    const t = targets.length ? pick(random, targets) : '';
    const others = free(OTHER_LETTERS).filter((letter) => letter !== t && letter !== D.toLowerCase());
    if (!t || others.length < 3) return null;
    // Keep a ±1 where the original had one (h + c stays a one-step move).
    const drawNumber = (original, low, high) => {
      if (equals(absolute(original), ONE)) return toRational(original);
      const magnitude = randomInt(random, low, high);
      return rational(toRational(original).n < 0 ? -magnitude : magnitude);
    };
    const kLetters = coefficient.symbols.map(() => pick(random, others));
    if (new Set(kLetters).size !== kLetters.length) continue;
    const K = polyOf([[kLetters, drawNumber(coefficient.coef, 2, 9)]]);
    let R = new Map();
    if (rest) {
      const rLetters = rest.symbols.map(() => pick(random, others.filter((letter) => !kLetters.includes(letter))));
      R = polyOf([[rLetters, drawNumber(rest.coef, 2, 15)]]);
    }
    if (polyEquals(K, model.coefficient) && polyEquals(R, model.rest)) continue;
    const tSide = polyAdd(polyMul(K, polyOf([[[t], ONE]])), R);
    const show = (poly) => polyLatex(poly, { last: t });
    const formula = model.side === 'left' ? `${show(tSide)} = ${D}` : `${D} = ${show(tSide)}`;
    const kConstant = polyConstant(K);
    const unitK = kConstant !== null && equals(kConstant, ONE);
    // The dependent letter first: P - 7, not -7 + P.
    const [restMonomial] = [...R.values()];
    const restMagnitude = restMonomial ? show(polyOf([[restMonomial.symbols, absolute(restMonomial.coef)]])) : '';
    const numeratorText = restMonomial ? `${D} ${restMonomial.coef.n > 0 ? '-' : '+'} ${restMagnitude}` : D;
    // A negative coefficient (T = 11 - 3k) is divided out with the signs
    // turned over: (11 - P)/3, never (P - 11)/(-3) or (P - 11)/(-1).
    const [kMonomial] = [...K.values()];
    const negativeK = kMonomial.coef.n < 0;
    const positiveK = polyScale(K, MINUS_ONE);
    const unitPositiveK = negativeK && kConstant !== null && equals(kConstant, MINUS_ONE);
    const flippedText = restMonomial ? `${show(R)} - ${D}` : `-${D}`;
    const answerBody = unitK ? numeratorText
      : !negativeK ? `\\frac{${numeratorText}}{${show(K)}}`
        : unitPositiveK ? flippedText : `\\frac{${flippedText}}{${show(positiveK)}}`;
    const steps = [];
    if (restMonomial) {
      const kt = show(polyMul(K, polyOf([[[t], ONE]])));
      steps.push(`${capitalize(addOrSubtract(restMonomial.coef, restMagnitude))}: $${model.side === 'left' ? `${kt} = ${numeratorText}` : `${numeratorText} = ${kt}`}$.`);
    }
    if (!unitK && !negativeK) steps.push(`Divide both sides by $${show(K)}$: $${t} = ${answerBody}$.`);
    if (unitPositiveK) steps.push(`Divide both sides by $-1$, which changes the sign of every term: $${t} = ${answerBody}$.`);
    if (negativeK && !unitPositiveK) steps.push(`Divide both sides by $${show(K)}$: $${t} = \\frac{${numeratorText}}{${show(K)}} = ${answerBody}$.`);
    const undo = restMonomial ? `, then ${restMonomial.coef.n > 0 ? 'adding' : 'subtracting'} $${restMagnitude}$` : '';
    steps.push(`Check: ${unitK ? `starting from $${answerBody}$` : `multiplying $${answerBody}$ by $${show(K)}$`}${undo} gives back $${D}$, so the formula holds.`);
    const example = {
      prompt: `Solve $${formula}$ for $${t}$.`,
      steps,
      answer: `$${t} = ${answerBody}$`,
    };
    if (accept(example)) return example;
  }
  return null;
};

const lineSibling = (model, random, accept) => {
  const original = lineParts(model);
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const B = rational(pick(random, [2, 3, 4, 5, 6, -2, -3, -4]));
    const A = rational(pick(random, [1, 2, 3, 4, 5, 6, -1, -2, -3, -4, -5]));
    const intercept = rational(pick(random, [-8, -7, -6, -5, -4, -3, -2, 2, 3, 4, 5, 6, 7, 8]));
    const C = multiply(intercept, B);
    const slope = divide(negate(A), B);
    if (equals(slope, original.slope) || equals(intercept, original.intercept)) continue;
    const xPart = `${equals(absolute(A), ONE) ? (A.n < 0 ? '-' : '') : rationalText(A)}x`;
    const yPart = `${B.n < 0 ? ' - ' : ' + '}${equals(absolute(B), ONE) ? '' : rationalText(absolute(B))}y`;
    const standard = `${xPart}${yPart} = ${rationalText(C)}`;
    const line = (m, b) => {
      const mText = equals(m, ONE) ? '' : equals(m, MINUS_ONE) ? '-' : rationalLatex(m);
      return `y = ${mText}x${isZero(b) ? '' : b.n < 0 ? ` - ${rationalLatex(absolute(b))}` : ` + ${rationalLatex(b)}`}`;
    };
    const negA = negate(A);
    const afterMove = `${equals(absolute(B), ONE) ? (B.n < 0 ? '-' : '') : rationalText(B)}y = ${equals(absolute(negA), ONE) ? (negA.n < 0 ? '-' : '') : rationalText(negA)}x + ${rationalText(C)}`.replace(/\+ -/g, '- ');
    const answer = line(slope, intercept);
    const example = {
      prompt: `Write $${standard}$ in slope-intercept form.`,
      steps: [
        `${capitalize(addOrSubtract(A, `${equals(absolute(A), ONE) ? '' : rationalText(absolute(A))}x`))}: $${afterMove}$.`,
        `Divide every term on both sides by $${rationalText(B)}$: $${answer}$.`,
        `Check: the slope is $${rationalLatex(slope)}$ and the $y$-intercept is $${rationalLatex(intercept)}$.`,
      ],
      answer: `$${answer}$`,
    };
    if (accept(example)) return example;
  }
  return null;
};

export const similarProblem = (question, { seed = 0 } = {}) => {
  try {
    if (!matches(question)) return null;
    const model = modelFor(question);
    if (!model) return null;
    const answers = expectedValues(question);
    const fingerprint = model.kind === 'numeric'
      ? equationLatexOf(model.leftTerms, model.rightTerms, model.variable, 'fraction')
      : `${polyLatex(model.leftPoly)}=${polyLatex(model.rightPoly)}|${model.target}`;
    const random = mulberry32(hashString(`${Number(seed) || 0}|${fingerprint}`));
    // Every candidate is judged as the platform will judge it, inside the
    // draw loop: a draw that would show one of this question's answers in any
    // line is replaced, not offered.
    const accept = (example) => siblingIsSafe(example, question, answers, model.kind === 'numeric' ? model.solution : null);
    let example = null;
    if (model.kind === 'numeric') example = numericSibling(model, random, accept);
    else if (model.lineForm) example = lineSibling(model, random, accept);
    else example = literalSibling(model, random, accept);
    return example ? { prompt: example.prompt, steps: example.steps, answer: example.answer } : null;
  } catch {
    return null;
  }
};
