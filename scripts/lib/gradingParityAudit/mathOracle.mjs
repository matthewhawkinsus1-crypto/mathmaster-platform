/*
 * AN INDEPENDENT READING OF A TYPED ANSWER, FOR THE REAL-ITEM GRADING AUDIT.
 *
 * The audit asks two graders (the screen's and the server's) for a verdict and
 * then asks whether that verdict is RIGHT. It cannot use either grader to
 * decide that, so it reads the item's own key and the student's answer here,
 * with mathjs and nothing of the platform's answer layer, and compares the
 * mathematics:
 *
 *   expression   the same value at seeded sample points of every letter
 *   equation     L − R a constant non-zero multiple of the key's L − R
 *   inequality   the same truth value at every sample point (a chain too)
 *   pair         each coordinate the same number
 *   set          the same numbers, each once (± written out)
 *   interval     the same ends and the same brackets
 *
 * It answers 'same', 'different' or 'unknown' (it could not read one side).
 * 'unknown' is never turned into a verdict: the audit lists such a case as
 * "needs review" when the graders do something surprising with it.
 *
 * What it does NOT judge: FORM. Two spellings of one value are 'same' here even
 * where the item asks for factored or simplest radical form; the audit reads
 * the field's own form rule for that.
 *
 * Pure. Deterministic: sample points come from the seed.
 */
import { create, all } from 'mathjs';
import { createRng } from '../graderFuzz/prng.mjs';

const math = create(all);
math.import({ ln: (value) => math.log(value) }, { override: true });

const FUNCTIONS = ['sqrt', 'cbrt', 'nthRoot', 'abs', 'log', 'ln', 'sin', 'cos', 'tan', 'exp', 'pi'];
const SUPER = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' };

/** Find the matching close bracket for the open one at `start`, or -1. */
const closing = (text, start) => {
  const open = text[start];
  const close = { '(': ')', '{': '}', '[': ']' }[open];
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === open) depth += 1;
    else if (text[index] === close) { depth -= 1; if (depth === 0) return index; }
  }
  return -1;
};

/** LaTeX commands with brace arguments, rewritten to plain text. */
const fromLatex = (input) => {
  let text = input;
  for (let guard = 0; guard < 50; guard += 1) {
    const match = /\\d?frac\s*/.exec(text);
    if (!match) break;
    let at = match.index + match[0].length;
    const read = () => {
      if (text[at] === '{') { const end = closing(text, at); if (end < 0) return null; const body = text.slice(at + 1, end); at = end + 1; return body; }
      const single = text[at]; at += 1; return single ?? null;
    };
    const numerator = read();
    const denominator = read();
    if (numerator === null || denominator === null) return null;
    text = `${text.slice(0, match.index)}((${numerator})/(${denominator}))${text.slice(at)}`;
  }
  for (let guard = 0; guard < 50; guard += 1) {
    const match = /\\sqrt\s*(\[[^\]]*\])?\s*/.exec(text);
    if (!match) break;
    let at = match.index + match[0].length;
    let body;
    if (text[at] === '{') { const end = closing(text, at); if (end < 0) return null; body = text.slice(at + 1, end); at = end + 1; } else { body = text[at] ?? ''; at += 1; }
    const index = match[1] ? match[1].slice(1, -1) : null;
    text = `${text.slice(0, match.index)}${index ? `nthRoot((${body}),(${index}))` : `sqrt(${body})`}${text.slice(at)}`;
  }
  return text
    .replace(/\\left|\\right/g, '')
    .replace(/\\cdot|\\times/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\pi/g, 'pi')
    .replace(/\\leq?(?![a-z])/g, '<=')
    .replace(/\\geq?(?![a-z])/g, '>=')
    .replace(/\\lt/g, '<')
    .replace(/\\gt/g, '>')
    .replace(/\\pm/g, '±')
    .replace(/\\infty/g, 'Infinity')
    .replace(/\\cup/g, 'U')
    .replace(/\\[{}]/g, (brace) => brace.slice(1))
    .replace(/\\ |\\,|\\;|\\!/g, ' ')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')');
};

/** A typed expression (no relation) as text mathjs reads, or null. */
export const toMathjs = (input) => {
  let text = String(input ?? '').trim();
  if (!text) return null;
  if (/\\[A-Za-z]/.test(text)) { text = fromLatex(text); if (text === null) return null; }
  text = text
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
    .replace(/[−–—]/g, '-')
    .replace(/[×·∙]/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, 'pi')
    .replace(/∞/g, 'Infinity')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (run) => `^(${[...run].map((character) => SUPER[character]).join('')})`)
    .replace(/\*\*/g, '^');
  // √ and ∛ take a bracket or the next number or letter (with a power).
  text = text.replace(/([√∛])\s*(\d+(?:\.\d+)?|[A-Za-z](?:\^\d+)?)(?![\d(])/g, (match, sign, body) => `${sign}(${body})`);
  text = text.replace(/√/g, 'sqrt').replace(/∛/g, 'cbrt');
  // root(n)(x) → nthRoot(x, n)
  for (let guard = 0; guard < 20; guard += 1) {
    const match = /root\s*\(/.exec(text);
    if (!match) break;
    const first = match.index + match[0].length - 1;
    const firstEnd = closing(text, first);
    if (firstEnd < 0 || text[firstEnd + 1] !== '(') return null;
    const secondEnd = closing(text, firstEnd + 1);
    if (secondEnd < 0) return null;
    text = `${text.slice(0, match.index)}nthRoot((${text.slice(firstEnd + 2, secondEnd)}),(${text.slice(first + 1, firstEnd)}))${text.slice(secondEnd + 1)}`;
  }
  // |x| → abs(x), innermost first, where the bars pair simply.
  for (let guard = 0; guard < 20 && text.includes('|'); guard += 1) {
    const next = text.replace(/\|([^|]*)\|/, (match, body) => `abs(${body})`);
    if (next === text) return null;
    text = next;
  }
  // A run of letters that is not a function or pi is a product of letters.
  text = text.replace(/[A-Za-z]+/g, (run) => {
    if (FUNCTIONS.includes(run) || run === 'Infinity') return run;
    const pieces = [];
    let rest = run;
    while (rest) {
      const name = FUNCTIONS.find((candidate) => rest.startsWith(candidate) && candidate !== 'pi' && rest.length > candidate.length) || (rest.startsWith('pi') ? 'pi' : null);
      if (name) { pieces.push(name); rest = rest.slice(name.length); continue; }
      pieces.push(rest[0]);
      rest = rest.slice(1);
    }
    return pieces.join(' ');
  });
  // A number or close bracket next to a letter or open bracket multiplies.
  text = text.replace(/(\d|\))\s*(?=[A-Za-z(√])/g, '$1*').replace(/\)\s*(?=\d)/g, ')*');
  text = text.replace(/([A-Za-z])\s+(?=[A-Za-z(\d])/g, (match, letter, offset, whole) => {
    // `sqrt (x)` stays a call.
    const before = whole.slice(0, offset + 1).match(/[A-Za-z]+$/)?.[0];
    return FUNCTIONS.includes(before) ? letter : `${letter}*`;
  });
  try {
    math.parse(text);
  } catch {
    return null;
  }
  return text;
};

const RELATION = /<=|>=|≤|≥|<|>|=|\\leq?|\\geq?|\\lt|\\gt/g;

/** Split a text at its top-level relations: { parts, signs }. */
export const relationParts = (input) => {
  const text = String(input ?? '');
  const parts = [];
  const signs = [];
  let depth = 0;
  let last = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if ('([{'.includes(character)) depth += 1;
    else if (')]}'.includes(character)) depth -= 1;
    if (depth) continue;
    RELATION.lastIndex = index;
    const match = RELATION.exec(text);
    if (match && match.index === index) {
      parts.push(text.slice(last, index));
      signs.push({ '≤': '<=', '≥': '>=', '\\le': '<=', '\\leq': '<=', '\\ge': '>=', '\\geq': '>=', '\\lt': '<', '\\gt': '>' }[match[0]] || match[0]);
      last = index + match[0].length;
      index = last - 1;
    }
  }
  parts.push(text.slice(last));
  return { parts, signs };
};

const isReal = (value) => typeof value === 'number' && Number.isFinite(value);
const evaluateReal = (compiled, scope) => {
  try {
    const value = compiled.evaluate(scope);
    if (isReal(value)) return value;
    if (value && typeof value === 'object' && typeof value.re === 'number' && Math.abs(value.im) < 1e-12) return value.re;
    return null;
  } catch {
    return null;
  }
};
const close = (left, right) => Math.abs(left - right) <= 1e-7 * Math.max(1, Math.abs(left), Math.abs(right));

const symbolsOf = (texts) => {
  const names = new Set();
  for (const text of texts) {
    try {
      math.parse(text).traverse((node) => { if (node.isSymbolNode && !FUNCTIONS.includes(node.name) && !['e', 'i', 'Infinity'].includes(node.name) && !math[node.name]?.signatures) names.add(node.name); });
    } catch { /* read by the caller */ }
  }
  return [...names].sort();
};

const samplePoints = (names, seed, count = 24) => {
  const rng = createRng(`oracle/${seed}`);
  const points = [];
  for (let index = 0; index < count; index += 1) {
    points.push(Object.fromEntries(names.map((name) => [name, (rng.chance(0.75) ? 1 : -1) * (0.3 + rng.next() * 4.7)])));
  }
  return points;
};

/** Two expressions: the same value at every point where both are real. */
const sameExpression = (left, right, seed) => {
  const a = toMathjs(left);
  const b = toMathjs(right);
  if (a === null || b === null) return 'unknown';
  const ca = math.compile(a);
  const cb = math.compile(b);
  let compared = 0;
  for (const point of samplePoints(symbolsOf([a, b]), seed)) {
    const x = evaluateReal(ca, point);
    const y = evaluateReal(cb, point);
    if (x === null && y === null) continue;
    if (x === null || y === null) return 'different';
    if (!close(x, y)) return 'different';
    compared += 1;
  }
  return compared >= 4 ? 'same' : 'unknown';
};

/** Two equations: L − R of one a constant multiple of the other's. */
const sameEquation = (left, right, seed) => {
  const one = relationParts(left);
  const two = relationParts(right);
  if (one.signs.join() !== '=' || two.signs.join() !== '=') return 'unknown';
  const f = [one, two].map(({ parts }) => {
    const [l, r] = parts.map(toMathjs);
    return l === null || r === null ? null : `(${l})-(${r})`;
  });
  if (f.includes(null)) return 'unknown';
  const [cf, cg] = f.map((text) => math.compile(text));
  let ratio = null;
  let compared = 0;
  for (const point of samplePoints(symbolsOf(f), seed)) {
    const x = evaluateReal(cf, point);
    const y = evaluateReal(cg, point);
    if (x === null || y === null) continue;
    if (Math.abs(x) < 1e-12 && Math.abs(y) < 1e-12) continue;
    if (Math.abs(y) < 1e-12 || Math.abs(x) < 1e-12) return 'different';
    const r = x / y;
    if (ratio === null) ratio = r;
    else if (!close(ratio, r)) return 'different';
    compared += 1;
  }
  return compared >= 4 ? 'same' : 'unknown';
};

const holds = (value, sign, other) => ({ '<': value < other - 1e-9, '<=': value <= other + 1e-9, '>': value > other + 1e-9, '>=': value >= other - 1e-9, '=': Math.abs(value - other) <= 1e-9 })[sign];

/** Two relations with an inequality: the same truth value at every sample point. */
const sameInequality = (left, right, seed) => {
  const read = (text) => {
    const { parts, signs } = relationParts(text);
    if (!signs.length) return null;
    const compiled = parts.map(toMathjs);
    if (compiled.includes(null)) return null;
    return { compiled: compiled.map((part) => math.compile(part)), texts: compiled, signs };
  };
  const a = read(left);
  const b = read(right);
  if (!a || !b) return 'unknown';
  const names = symbolsOf([...a.texts, ...b.texts]);
  // Integers and halves near the key's numbers, and random points.
  const numbers = [...String(left).matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
  const grid = new Set();
  for (const n of [...numbers, 0]) for (const d of [-1, -0.5, -0.01, 0, 0.01, 0.5, 1]) grid.add(n + d);
  const points = names.length === 1
    ? [...grid, ...samplePoints(names, seed, 40).map((point) => point[names[0]] * 20)].map((value) => ({ [names[0]]: value }))
    : samplePoints(names, seed, 200).map((point) => Object.fromEntries(Object.entries(point).map(([key, value]) => [key, value * 60])));
  const truth = ({ compiled, signs }, point) => {
    const values = compiled.map((part) => evaluateReal(part, point));
    if (values.includes(null)) return null;
    return signs.every((sign, index) => holds(values[index], sign, values[index + 1]));
  };
  let compared = 0;
  for (const point of points) {
    const x = truth(a, point);
    const y = truth(b, point);
    if (x === null || y === null) continue;
    if (x !== y) return 'different';
    compared += 1;
  }
  return compared >= 4 ? 'same' : 'unknown';
};

export const numberOf = (text) => {
  const compiled = toMathjs(text);
  if (compiled === null) return null;
  try {
    const value = math.evaluate(compiled);
    return isReal(value) ? value : null;
  } catch {
    return null;
  }
};

/** Split a list at its top-level commas. */
const listItems = (text) => {
  const items = [];
  let depth = 0;
  let last = 0;
  for (let index = 0; index < text.length; index += 1) {
    if ('([{'.includes(text[index])) depth += 1;
    else if (')]}'.includes(text[index])) depth -= 1;
    else if ((text[index] === ',' || text[index] === ';') && depth === 0) { items.push(text.slice(last, index)); last = index + 1; }
  }
  items.push(text.slice(last));
  return items.map((item) => item.trim());
};

const unwrap = (text, open, close) => {
  const trimmed = String(text ?? '').trim().replace(/^\\left/, '').replace(/\\right(?=.$)/, '');
  if (trimmed.startsWith(open) && trimmed.endsWith(close)) return trimmed.slice(open.length, trimmed.length - close.length);
  return null;
};

const samePair = (left, right) => {
  const read = (text) => {
    const body = unwrap(String(text).replace(/\\left\(/g, '(').replace(/\\right\)/g, ')'), '(', ')');
    if (body === null) return null;
    const items = listItems(body);
    if (items.length !== 2) return null;
    const values = items.map(numberOf);
    return values.includes(null) ? null : values;
  };
  const a = read(left);
  const b = read(right);
  if (!a || !b) return 'unknown';
  return a.every((value, index) => close(value, b[index])) ? 'same' : 'different';
};

const sameSet = (left, right) => {
  const read = (text) => {
    const body = unwrap(String(text).replace(/\\\{/g, '{').replace(/\\\}/g, '}'), '{', '}');
    if (body === null) return null;
    const values = [];
    for (const item of listItems(body)) {
      if (!item) return null;
      const pm = /^±\s*(.+)$/.exec(item);
      if (pm) { const value = numberOf(pm[1]); if (value === null) return null; values.push(value, -value); continue; }
      const value = numberOf(item);
      if (value === null) return null;
      values.push(value);
    }
    const unique = [];
    for (const value of values) if (!unique.some((other) => close(other, value))) unique.push(value);
    return unique.sort((x, y) => x - y);
  };
  const a = read(left);
  const b = read(right);
  if (!a || !b) return 'unknown';
  return a.length === b.length && a.every((value, index) => close(value, b[index])) ? 'same' : 'different';
};

const sameInterval = (left, right) => {
  const read = (text) => {
    const trimmed = String(text).trim().replace(/[−]/g, '-').replace(/∞/g, 'Infinity').replace(/\\infty/g, 'Infinity');
    const match = /^([[(])(.+),(.+)([\])])$/.exec(trimmed);
    if (!match) return null;
    const ends = [match[2], match[3]].map((end) => (/^\s*-?\s*Infinity\s*$/.test(end) ? (end.includes('-') ? -Infinity : Infinity) : numberOf(end)));
    return ends.includes(null) ? null : [match[1], ...ends, match[4]];
  };
  const a = read(left);
  const b = read(right);
  if (!a || !b) return 'unknown';
  return a[0] === b[0] && a[3] === b[3] && a[1] === b[1] && a[2] === b[2] ? 'same' : (close(a[1], b[1]) && close(a[2], b[2]) && a[0] === b[0] && a[3] === b[3] ? 'same' : 'different');
};

/**
 * Does `candidate` say what `key` says? `kind` is the field's: number,
 * expression, equation, inequality, orderedPair, set, interval.
 */
export const compareToKey = (key, candidate, kind, seed = 'oracle') => {
  const k = String(key ?? '').trim();
  const c = String(candidate ?? '').trim();
  if (!c) return 'different';
  try {
    if (kind === 'orderedPair') return samePair(k, c);
    if (kind === 'set') return sameSet(k, c);
    if (kind === 'interval') return sameInterval(k, c);
    const keySigns = relationParts(k).signs;
    const candidateSigns = relationParts(c).signs;
    if (keySigns.length || candidateSigns.length) {
      if (!keySigns.length || !candidateSigns.length) return 'different';
      if (keySigns.every((sign) => sign === '=') && candidateSigns.every((sign) => sign === '=')) return sameEquation(k, c, seed);
      if (keySigns.includes('=') !== candidateSigns.includes('=') && (keySigns.length === 1 && candidateSigns.length === 1)) return 'different';
      return sameInequality(k, c, seed);
    }
    return sameExpression(k, c, seed);
  } catch {
    return 'unknown';
  }
};

/*
 * A polynomial as a sparse map of monomials ("x^2*y" -> coefficient), built
 * from the mathjs tree. mathjs's rationalize takes minutes on a product of
 * four factors; this takes microseconds and refuses anything not a polynomial.
 */
const monomialKey = (powers) => Object.keys(powers).filter((name) => powers[name]).sort().map((name) => (powers[name] === 1 ? name : `${name}^${powers[name]}`)).join('*');
const fromKey = (key) => Object.fromEntries(key ? key.split('*').map((piece) => { const [name, power = '1'] = piece.split('^'); return [name, Number(power)]; }) : []);
const addInto = (target, key, coefficient) => { const next = (target.get(key) || 0) + coefficient; if (Math.abs(next) < 1e-12) target.delete(key); else target.set(key, next); };
const polyTimes = (a, b) => {
  const out = new Map();
  for (const [ka, ca] of a) for (const [kb, cb] of b) {
    const powers = fromKey(ka);
    for (const [name, power] of Object.entries(fromKey(kb))) powers[name] = (powers[name] || 0) + power;
    addInto(out, monomialKey(powers), ca * cb);
  }
  return out;
};
const polyOf = (node) => {
  if (node.isParenthesisNode) return polyOf(node.content);
  if (node.isConstantNode) return typeof node.value === 'number' ? new Map([['', node.value]]) : null;
  if (node.isSymbolNode) return FUNCTIONS.includes(node.name) ? null : new Map([[node.name, 1]]);
  if (node.isOperatorNode) {
    const args = node.args.map(polyOf);
    if (args.includes(null)) return null;
    if (node.fn === 'unaryMinus') return new Map([...args[0]].map(([key, value]) => [key, -value]));
    if (node.fn === 'unaryPlus') return args[0];
    if (node.fn === 'add' || node.fn === 'subtract') {
      const out = new Map(args[0]);
      for (const [key, value] of args[1]) addInto(out, key, node.fn === 'add' ? value : -value);
      return out;
    }
    if (node.fn === 'multiply') return polyTimes(args[0], args[1]);
    if (node.fn === 'pow') {
      const exponent = args[1].size === 1 && args[1].has('') ? args[1].get('') : null;
      if (exponent === null || !Number.isInteger(exponent) || exponent < 0 || exponent > 12) return null;
      let out = new Map([['', 1]]);
      for (let index = 0; index < exponent; index += 1) out = polyTimes(out, args[0]);
      return out;
    }
  }
  return null;
};

/** The polynomial a factored key expands to, as text, or null. */
export const expandedPolynomial = (key) => {
  const text = toMathjs(key);
  if (text === null) return null;
  let poly;
  try { poly = polyOf(math.parse(text)); } catch { return null; }
  if (!poly || poly.size < 2) return null;
  const degree = (monomial) => Object.values(fromKey(monomial)).reduce((sum, power) => sum + power, 0);
  const terms = [...poly].sort(([a], [b]) => degree(b) - degree(a) || a.localeCompare(b));
  return terms.map(([monomial, coefficient], index) => {
    const body = monomial.replace(/\*/g, '');
    const magnitude = Math.abs(coefficient);
    const head = !monomial ? String(magnitude) : magnitude === 1 ? body : `${magnitude}${body}`;
    return `${coefficient < 0 ? '-' : index ? '+' : ''}${head}`;
  }).join('');
};
