/*
 * THE GRAPHING CALCULATOR'S MATHEMATICS — WHAT A STUDENT TYPED, AND WHAT IT
 * MEANS, WITHOUT EVER RUNNING IT AS CODE.
 *
 * The Digital SAT gives every math question a graphing calculator. A practice
 * test that runs offline cannot embed Desmos, so MathMaster draws its own
 * (src/components/assessment/GraphingCalculatorPanel.jsx, with JSXGraph). This
 * module is everything the panel computes: it reads one line the student
 * typed, decides what kind of line it is, and turns it into a function of x.
 *
 *   y = 2x + 1        a graph (so is `f(x) = …`, and a bare `x^2 - 3`)
 *   x = 4             a vertical line
 *   (3 + 4)/2         a value: = 3.5
 *
 * SAFE BY CONSTRUCTION. mathjs is used for one thing: PARSING the text into a
 * tree (`parse`, from the client's one mathjs instance). Its evaluator is never
 * called. The tree is then checked against a short allowlist — numbers, x, pi,
 * e, + − × ÷ ^, brackets and a dozen named functions — and compiled into plain
 * closures over Math.*. Everything else is refused with a sentence a student
 * can act on: assignment (`a = 5`), function definitions (a `f(x)` on the left
 * is a label for the graph and defines nothing another line can call), arrays,
 * objects, property access, ranges, conditionals, units, strings, factorials,
 * modulo, comparisons and every other mathjs function (`import`, `evaluate`,
 * `createUnit` …). There is no eval, no Function constructor, no scope that
 * one line could write and another read.
 *
 * BOUNDED. A line is at most 120 characters and 100 tree nodes, with brackets
 * at most 24 deep; at most six lines; a table at most 25 rows; coordinates and
 * zoom stay within fixed limits. Nothing a student types can make the page do
 * unbounded work.
 *
 * The calculator knows nothing about the question on screen. It is the
 * student's tool, exactly as a handheld calculator is.
 */
import { parse } from '../math/mathjs.js';

export const GRAPHING_LIMITS = Object.freeze({
  maxEntries: 6,
  maxInputLength: 120,
  maxNodes: 100,
  maxDepth: 24,
  maxTableRows: 25,
  maxCoordinate: 1e6,
  minViewWidth: 1e-3,
  maxViewWidth: 2e6,
});

export const ANGLE_MODES = Object.freeze({ RADIANS: 'radians', DEGREES: 'degrees' });

export const ENTRY_KINDS = Object.freeze({
  EMPTY: 'empty',
  FUNCTION: 'function',
  VERTICAL: 'vertical',
  VALUE: 'value',
  ERROR: 'error',
});

/** The view a fresh calculator opens on: JSXGraph's [left, top, right, bottom]. */
export const DEFAULT_VIEWPORT = Object.freeze([-10, 10, 10, -10]);

const DEG = Math.PI / 180;

/*
 * The named functions a line may use. `trig: 'in'` reads its argument as an
 * angle and `trig: 'out'` returns one, so Degrees mode converts exactly there.
 * `log` is base 10 and `ln` is natural, as on every school calculator (mathjs's
 * own `log` is natural — another reason its evaluator is not used).
 */
/*
 * tan is undefined where cos is 0 — at 90°, 270°, π/2 … — and Math.tan(π/2)
 * is 1.6×10^16 only because π/2 is not exact in floating point. A handheld
 * says "undefined" there, and so does this.
 */
const tangent = (angle) => {
  const cosine = Math.cos(angle);
  return Math.abs(cosine) < 1e-12 ? NaN : Math.sin(angle) / cosine;
};

const FUNCTIONS = Object.freeze({
  sin: { arity: [1], trig: 'in', apply: Math.sin },
  cos: { arity: [1], trig: 'in', apply: Math.cos },
  tan: { arity: [1], trig: 'in', apply: tangent },
  asin: { arity: [1], trig: 'out', apply: Math.asin },
  acos: { arity: [1], trig: 'out', apply: Math.acos },
  atan: { arity: [1], trig: 'out', apply: Math.atan },
  arcsin: { arity: [1], trig: 'out', apply: Math.asin },
  arccos: { arity: [1], trig: 'out', apply: Math.acos },
  arctan: { arity: [1], trig: 'out', apply: Math.atan },
  sqrt: { arity: [1], apply: Math.sqrt },
  cbrt: { arity: [1], apply: Math.cbrt },
  abs: { arity: [1], apply: Math.abs },
  ln: { arity: [1], apply: Math.log },
  log: { arity: [1, 2], apply: (value, base) => (base === undefined ? Math.log10(value) : Math.log(value) / Math.log(base)) },
  exp: { arity: [1], apply: Math.exp },
  floor: { arity: [1], apply: Math.floor },
  ceil: { arity: [1], apply: Math.ceil },
  round: { arity: [1], apply: Math.round },
});

const CONSTANTS = Object.freeze({ pi: Math.PI, e: Math.E });
const VARIABLE = 'x';

/*
 * A POWER, AS A SCHOOL CALCULATOR READS IT. (−8)^(1/3) is −2 on a TI and on
 * Desmos, and y = x^(1/3) is drawn on both sides of the axis; JavaScript's
 * ** gives NaN for any negative base with a fractional exponent. So a negative
 * base raised to p/q in lowest terms with q ODD has the real root
 * sign^p · |a|^(p/q): x^(2/3) is never negative, x^(1/3) keeps the sign. An
 * even q (a square root of a negative) stays undefined. The exponent is
 * recognised as p/q for q up to 99 — enough for anything typed by hand.
 */
const ODD_ROOT_LIMIT = 99;
const power = (base, exponent) => {
  const direct = base ** exponent;
  if (!(base < 0) || Number.isInteger(exponent) || !Number.isFinite(exponent)) return direct;
  for (let q = 3; q <= ODD_ROOT_LIMIT; q += 2) {
    const p = Math.round(exponent * q);
    if (Math.abs(exponent * q - p) > 1e-9) continue;
    const magnitude = Math.abs(base) ** exponent;
    return p % 2 === 0 ? magnitude : -magnitude;
  }
  return direct;
};

const OPERATORS = Object.freeze({
  add: (a, b) => (x) => a(x) + b(x),
  subtract: (a, b) => (x) => a(x) - b(x),
  multiply: (a, b) => (x) => a(x) * b(x),
  divide: (a, b) => (x) => a(x) / b(x),
  pow: (a, b) => (x) => power(a(x), b(x)),
});

class EntryError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const refuse = (code, message) => { throw new EntryError(code, message); };

/*
 * Typing, not mathematics: the characters a phone or a math keyboard produces,
 * spelled the way the parser reads them. Absolute-value bars become abs(…): a
 * bar opens after the start, an operator or an opening bracket, and closes
 * otherwise.
 */
const absoluteBars = (text) => {
  let out = '';
  let open = 0;
  for (const character of text) {
    if (character !== '|') {
      out += character;
      continue;
    }
    const previous = out.replace(/\s+$/, '').slice(-1);
    if (open === 0 || previous === '' || /[+\-*/^(,=]/.test(previous)) {
      out += 'abs(';
      open += 1;
    } else {
      out += ')';
      open -= 1;
    }
  }
  if (open !== 0) refuse('bars', 'Each | needs a partner: |x − 2| has two bars.');
  return out;
};

export const normalizeEntryText = (raw) => absoluteBars(String(raw ?? '')
  .replace(/[​-‏‪-‮⁠-⁯﻿]/g, '')
  .replace(/[−–—]/g, '-')
  .replace(/[×·⋅∗]/g, '*')
  .replace(/÷/g, '/')
  .replace(/π/g, 'pi')
  .replace(/²/g, '^2')
  .replace(/³/g, '^3')
  .replace(/√\s*\(/g, 'sqrt(')
  .replace(/√\s*(\d+(?:\.\d+)?|[A-Za-z])/g, 'sqrt($1)')
  .toLowerCase()
  .trim());

/** Compile one checked tree node into a function of x. */
const compileNode = (node, context, depth) => {
  context.nodes += 1;
  if (context.nodes > GRAPHING_LIMITS.maxNodes) refuse('too-long', 'That line is too long. Split it into shorter lines.');
  if (depth > GRAPHING_LIMITS.maxDepth) refuse('too-deep', 'That line has too many brackets inside brackets.');

  switch (node?.type) {
    case 'ConstantNode': {
      if (typeof node.value !== 'number') refuse('unsupported', 'Use numbers, x, and + − × ÷ ^.');
      if (!Number.isFinite(node.value)) refuse('too-large', 'That number is too large for this calculator.');
      const value = node.value;
      return () => value;
    }
    case 'SymbolNode': {
      const name = node.name;
      if (name === VARIABLE) {
        context.usesX = true;
        return (x) => x;
      }
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) {
        const value = CONSTANTS[name];
        return () => value;
      }
      if (Object.prototype.hasOwnProperty.call(FUNCTIONS, name)) {
        refuse('needs-brackets', `Put brackets after ${name}, like ${name}(x).`);
      }
      if (name === 'y') refuse('use-x', 'Write the right-hand side using x, like y = 2x + 1.');
      refuse('unknown-symbol', `"${name}" is not something this calculator knows. Use x for the variable and numbers for everything else.`);
      break;
    }
    case 'ParenthesisNode':
      return compileNode(node.content, context, depth + 1);
    case 'OperatorNode': {
      // An operator does not nest brackets: `depth` counts brackets only, and
      // the node count bounds a long chain of + and −.
      const args = Array.isArray(node.args) ? node.args : [];
      if (node.fn === 'unaryMinus' && args.length === 1) {
        const inner = compileNode(args[0], context, depth);
        return (x) => -inner(x);
      }
      if (node.fn === 'unaryPlus' && args.length === 1) return compileNode(args[0], context, depth);
      const build = Object.prototype.hasOwnProperty.call(OPERATORS, node.fn) ? OPERATORS[node.fn] : null;
      if (!build || args.length !== 2) {
        refuse('unsupported-operator', `This calculator does not use "${node.op}". Use + − × ÷ and ^.`);
      }
      return build(compileNode(args[0], context, depth), compileNode(args[1], context, depth));
    }
    case 'FunctionNode': {
      const name = node.fn?.type === 'SymbolNode' ? node.fn.name : null;
      const args = Array.isArray(node.args) ? node.args : [];
      // x(x + 1) is a product on paper; the parser reads a call.
      if (name === VARIABLE && args.length === 1) {
        context.usesX = true;
        const inner = compileNode(args[0], context, depth + 1);
        return (x) => x * inner(x);
      }
      const spec = name && Object.prototype.hasOwnProperty.call(FUNCTIONS, name) ? FUNCTIONS[name] : null;
      if (!spec) {
        refuse('unknown-function', `"${name || 'that'}" is not a function this calculator has. It has sin, cos, tan, sqrt, abs, log, ln and exp.`);
      }
      if (!spec.arity.includes(args.length)) refuse('arity', `${name} takes ${spec.arity.join(' or ')} input${spec.arity.length === 1 && spec.arity[0] === 1 ? '' : 's'}.`);
      const compiled = args.map((arg) => compileNode(arg, context, depth + 1));
      const { apply, trig } = spec;
      if (compiled.length === 2) return (x) => apply(compiled[0](x), compiled[1](x));
      const [inner] = compiled;
      if (trig === 'in') return (x) => apply(context.degrees ? inner(x) * DEG : inner(x));
      if (trig === 'out') return (x) => (context.degrees ? apply(inner(x)) / DEG : apply(inner(x)));
      return (x) => apply(inner(x));
    }
    case 'AssignmentNode':
    case 'FunctionAssignmentNode':
      refuse('assignment', 'Only y = …, f(x) = … or x = … can be graphed. Letters other than x cannot be given values.');
      break;
    default:
      refuse('unsupported', 'Use numbers, x, and + − × ÷ ^ with brackets.');
  }
  return refuse('unsupported', 'Use numbers, x, and + − × ÷ ^ with brackets.');
};

/** A real, finite number or null — never Infinity, NaN or a complex number. */
const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

const splitEquation = (text) => {
  if (/[<>≤≥≠]|!=/.test(text)) refuse('inequality', 'This calculator graphs equations like y = 2x + 1, not inequalities.');
  const parts = text.split('=');
  if (parts.length > 2) refuse('equals', 'Use one = sign.');
  if (parts.length === 1) return { left: null, right: text };
  return { left: parts[0].replace(/\s+/g, ''), right: parts[1] };
};

/**
 * Read one line.
 *
 * @returns {{ kind, label?, text, evaluate?, value?, x?, error?, code? }}
 *   kind 'function'  evaluate(x) → number|null (null where undefined)
 *   kind 'vertical'  x
 *   kind 'value'     value
 *   kind 'error'     error (a sentence for the student), code
 *   kind 'empty'
 */
export const parseGraphEntry = (raw, { angleMode = ANGLE_MODES.RADIANS } = {}) => {
  const original = String(raw ?? '');
  if (!original.trim()) return { kind: ENTRY_KINDS.EMPTY, text: '' };
  try {
    if (original.length > GRAPHING_LIMITS.maxInputLength) refuse('too-long', 'That line is too long. Split it into shorter lines.');
    const text = normalizeEntryText(original);
    const { left, right } = splitEquation(text);
    if (!right.trim()) refuse('empty-side', 'Type something after the = sign.');
    let label = null;
    let vertical = false;
    if (left !== null) {
      if (left === 'y') label = 'y';
      else if (/^[a-wz]\(x\)$/.test(left)) label = left; // a label for the graph, not a definition
      else if (left === 'x') vertical = true;
      else refuse('left-side', 'Start with y =, or x = for a vertical line.');
    }
    let tree;
    try {
      tree = parse(right);
    } catch {
      refuse('syntax', 'This line is not finished, or has a symbol out of place.');
    }
    const context = { nodes: 0, usesX: false, degrees: angleMode === ANGLE_MODES.DEGREES };
    const compiled = compileNode(tree, context, 0);
    const evaluate = (x) => {
      const value = finite(Number(x));
      return value === null ? null : finite(compiled(value));
    };

    if (vertical) {
      if (context.usesX) refuse('vertical-with-x', 'For a vertical line, put a number after x =.');
      const x = finite(compiled(0));
      if (x === null) refuse('undefined', 'That value is undefined.');
      if (Math.abs(x) > GRAPHING_LIMITS.maxCoordinate) refuse('too-large', 'That number is too large for this calculator.');
      return { kind: ENTRY_KINDS.VERTICAL, text: original, x };
    }
    if (context.usesX || label) {
      return { kind: ENTRY_KINDS.FUNCTION, text: original, label: label || 'y', evaluate };
    }
    const value = finite(compiled(0));
    if (value === null) refuse('undefined', 'That value is undefined.');
    return { kind: ENTRY_KINDS.VALUE, text: original, value };
  } catch (error) {
    if (error instanceof EntryError) return { kind: ENTRY_KINDS.ERROR, text: original, error: error.message, code: error.code };
    return { kind: ENTRY_KINDS.ERROR, text: original, error: 'This line could not be read.', code: 'unreadable' };
  }
};

/** Read every line, never more than the panel shows. */
export const parseGraphEntries = (lines = [], options = {}) => (
  (Array.isArray(lines) ? lines : []).slice(0, GRAPHING_LIMITS.maxEntries).map((line) => parseGraphEntry(line, options))
);

/** y at one x for a graphed line, or null where it is undefined. */
export const evaluateAt = (entry, x) => (entry?.kind === ENTRY_KINDS.FUNCTION ? entry.evaluate(x) : null);

/**
 * A number a student typed into a small box (trace x, table start, step),
 * read by the same rules as a line: 2, −3, 1/2, 2pi and sqrt(2) are numbers.
 * An empty box, or anything that is not a single value, is null — never 0.
 */
export const readNumberEntry = (raw, options = {}) => {
  const entry = parseGraphEntry(raw, options);
  return entry.kind === ENTRY_KINDS.VALUE ? entry.value : null;
};

const tidy = (value) => Number(Number(value).toPrecision(12));

/**
 * A table of values: `rows` x-values from `start`, `step` apart. Bounded, and
 * an unusable start or step gives no rows rather than a guess.
 */
export const tableOfValues = (entry, { start = -3, step = 1, rows = 7 } = {}) => {
  if (entry?.kind !== ENTRY_KINDS.FUNCTION) return [];
  // An empty box is not 0 (Number('') and Number(null) both are).
  if (start === null || step === null || String(start).trim() === '' || String(step).trim() === '') return [];
  const first = Number(start);
  const gap = Number(step);
  const count = Math.max(0, Math.min(GRAPHING_LIMITS.maxTableRows, Math.floor(Number(rows) || 0)));
  if (!Number.isFinite(first) || !Number.isFinite(gap) || gap === 0) return [];
  if (Math.abs(first) > GRAPHING_LIMITS.maxCoordinate || Math.abs(gap) > GRAPHING_LIMITS.maxCoordinate) return [];
  return Array.from({ length: count }, (unused, index) => {
    const x = tidy(first + index * gap);
    return { x, y: entry.evaluate(x) };
  });
};

/** A number as the calculator shows it: up to 10 significant digits, a real minus sign. */
export const formatNumber = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'undefined';
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  const text = magnitude >= 1e10 || magnitude < 1e-6
    ? value.toExponential(5).replace(/\.?0+e/, 'e').replace('e+', ' × 10^').replace('e-', ' × 10^-')
    : String(Number(value.toPrecision(10)));
  return text.replace(/-/g, '−');
};

const clampBox = ([left, top, right, bottom]) => {
  const limit = GRAPHING_LIMITS.maxCoordinate;
  const width = right - left;
  const height = top - bottom;
  if (![left, top, right, bottom].every(Number.isFinite) || width <= 0 || height <= 0) return [...DEFAULT_VIEWPORT];
  if (width < GRAPHING_LIMITS.minViewWidth || height < GRAPHING_LIMITS.minViewWidth) return null;
  if (width > GRAPHING_LIMITS.maxViewWidth || height > GRAPHING_LIMITS.maxViewWidth) return null;
  if (Math.abs(left) > limit || Math.abs(right) > limit || Math.abs(top) > limit || Math.abs(bottom) > limit) return null;
  return [left, top, right, bottom];
};

/**
 * Zoom about the middle of the view. factor < 1 zooms in. A zoom past the
 * limits leaves the view as it was.
 */
export const zoomViewport = (box, factor) => {
  const scale = Number(factor);
  if (!Number.isFinite(scale) || scale <= 0) return [...box];
  const [left, top, right, bottom] = box;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const halfWidth = ((right - left) / 2) * scale;
  const halfHeight = ((top - bottom) / 2) * scale;
  return clampBox([cx - halfWidth, cy + halfHeight, cx + halfWidth, cy - halfHeight]) || [...box];
};

/** Move the view by a fraction of its own width (dx) and height (dy). */
export const panViewport = (box, dx = 0, dy = 0) => {
  const [left, top, right, bottom] = box;
  const shiftX = (right - left) * (Number(dx) || 0);
  const shiftY = (top - bottom) * (Number(dy) || 0);
  return clampBox([left + shiftX, top + shiftY, right + shiftX, bottom + shiftY]) || [...box];
};

export default parseGraphEntry;
