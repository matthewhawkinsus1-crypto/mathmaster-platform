// The school My Math Path banks, swept the way a student meets them.
//
// Every authored family in the course release (grade 6, 7, 8, Algebra I and
// Algebra II) is compiled by the one Path content compiler, drawn by the
// production generator, issued through mathPath.buildIssuePlan, stored and
// re-sanitized exactly as issueNextQuestion stores and serves it, and graded
// by mathPath.gradePathToolResponse against the stored private grading:
//
//   - a choice field is answered with the option id the BROWSER was served,
//     found by the authored option's label, so a key that names no option,
//     or two options with one label, cannot hide;
//   - an open field is answered with its own key and with equivalent spellings
//     a student types into the Path's math editor (LaTeX from the keypad,
//     a fraction for a terminating decimal, commuted factors, reordered terms,
//     an inequality read from the other side ...);
//   - a tool item is answered with the tool's own work, built from the
//     authored item by arithmetic done here (toolWorkFor).
//
// A spelling is only sent if mathjs / fraction.js confirm, independently of
// every grader in this repository, that it means the same thing as the key.
// A spelling the check cannot confirm is dropped and counted, never guessed.
//
// Nothing here writes anything. It is shared by
// scripts/audit-correct-answer-acceptance.mjs (the full sweep) and
// tests/platform/kGrading_pathSchoolBankSweep.test.mjs (a CI-sized one).

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { create, all } from 'mathjs';
import Fraction from 'fraction.js';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mathPath = require(path.join(ROOT, 'functions/lib/mathPath.js'));
const compiler = require(path.join(ROOT, 'functions/lib/pathContentCompiler.js'));
const generation = await import(path.join(ROOT, 'functions/shared/pathQuestionGeneration.mjs'));

const math = create(all, { number: 'number' });

export const SCHOOL_COURSES = Object.freeze(['grade6', 'grade7', 'grade8', 'algebra1', 'algebra2']);
export const SEED_DIR = path.join(ROOT, 'functions/seeds/pathQuestionBank');

export const readCourseSeed = (courseId) => {
  const parsed = JSON.parse(fs.readFileSync(path.join(SEED_DIR, `${courseId}_pathQuestionBank_seed.json`), 'utf8'));
  return Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []);
};

// --- Independent equivalence (mathjs / fraction.js) ---------------------------

// Four fixed, irrational-looking points per letter, so a coincidence is not an
// equivalence. Every letter gets its own value from its name and the round.
const sampleValue = (name, round) => {
  let hash = 7 + round * 131;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 9973;
  return ((hash % 997) / 997) * 6 - 2.9 + 0.137 * (round + 1);
};
const SAMPLE_ROUNDS = [0, 1, 2, 3];

/** A key or prompt spelling (ASCII or LaTeX) -> what mathjs parses the same way, or null. */
const toMathjs = (text) => {
  let value = String(text ?? '').trim();
  if (!value) return null;
  value = value
    .replace(/[−–—]/g, '-')
    .replace(/\\left|\\right/g, '')
    .replace(/\\cdot|\\times/g, '*')
    .replace(/\\div/g, '/')
    .replace(/\\(ln|log|sin|cos|tan)\b/g, '$1')
    // x\\sqrt{x}: a product, which mathjs must not read as one name.
    .replace(/([0-9A-Za-z)}])\\(?=d?frac|sqrt)/g, '$1*\\')
    .replace(/\\,|\\!|\\ /g, '');
  // Innermost groups first, so a fraction inside a radical (or the reverse) reads.
  for (let guard = 0; guard < 8; guard += 1) {
    let next = value
      .replace(/\\d?frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))')
      .replace(/\\sqrt\[3\]\{([^{}]*)\}/g, 'cbrt($1)')
      .replace(/\\sqrt\{([^{}]*)\}/g, 'sqrt($1)')
      .replace(/\^\{([^{}]*)\}/g, '^($1)');
    // A bare group only once nothing named is left to read at this depth.
    if (next === value) next = value.replace(/\{([^{}]*)\}/g, '($1)');
    if (next === value) break;
    value = next;
  }
  value = value
    .replace(/\|([^|]+)\|/g, 'abs($1)')
    .replace(/\bln\(/g, 'log(')
    // 6x(5x^2+1): a letter before a group is a product here, not a call.
    .replace(/(^|[^a-z])([A-Za-z])\(/g, '$1$2*(')
    // 0x is a hex prefix to mathjs; a coefficient is always a product here.
    .replace(/(\d)([A-Za-z])/g, '$1*$2');
  if (/[{}\\<>=!|%$]/.test(value)) return null;
  return value;
};

const evaluateAt = (expression, scope) => {
  try {
    const node = math.parse(expression);
    const result = node.evaluate({ ...scope });
    return typeof result === 'number' ? result : (result && typeof result.valueOf() === 'number' ? result.valueOf() : NaN);
  } catch {
    return NaN;
  }
};

const symbolsOf = (expression) => {
  try {
    // A call's name (sqrt, cbrt, abs, log) is not a letter of the expression.
    return [...new Set(math.parse(expression)
      .filter((node, path, parent) => node.isSymbolNode && !(parent?.isFunctionNode && parent.fn === node))
      .map((node) => node.name))]
      .filter((name) => !['e', 'pi'].includes(name));
  } catch {
    return null;
  }
};

/** The same function of the same letters (mathjs, sampled). */
export const sameExpressionIndependently = (left, right) => {
  const a = toMathjs(left);
  const b = toMathjs(right);
  if (a == null || b == null) return false;
  const sa = symbolsOf(a);
  const sb = symbolsOf(b);
  if (!sa || !sb) return false;
  if (sa.slice().sort().join(',') !== sb.slice().sort().join(',')) return false;
  let compared = 0;
  for (const round of SAMPLE_ROUNDS) {
    const scope = Object.fromEntries(sa.map((name) => [name, sampleValue(name, round)]));
    const va = evaluateAt(a, scope);
    const vb = evaluateAt(b, scope);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
    compared += 1;
    if (Math.abs(va - vb) > 1e-9 * Math.max(1, Math.abs(va))) return false;
  }
  return compared >= 2;
};

/** Two equations with the same sides, or the same sides swapped. */
const sameEquationIndependently = (left, right) => {
  const a = String(left).split('=');
  const b = String(right).split('=');
  if (a.length !== 2 || b.length !== 2) return false;
  return (sameExpressionIndependently(a[0], b[0]) && sameExpressionIndependently(a[1], b[1]))
    || (sameExpressionIndependently(a[0], b[1]) && sameExpressionIndependently(a[1], b[0]));
};

const exactFraction = (value) => {
  try {
    const text = String(value).trim().replace(/[−–—]/g, '-');
    const latex = text.match(/^(-?)\\frac\{(-?\d+)\}\{(\d+)\}$/);
    if (latex) return new Fraction(`${latex[1]}${latex[2]}/${latex[3]}`);
    if (!/^[+-]?\d+(\.\d+)?(\/\d+)?$/.test(text.replace(/^\+/, ''))) return null;
    return new Fraction(text.replace(/^\+/, ''));
  } catch {
    return null;
  }
};

// --- Inequality / interval atoms (independent reading) ------------------------

const OPS = { '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b, '!=': (a, b) => a !== b };

/**
 * 'a<=y and y<=b', 'x>15', '15<x', 'a<=y<=b', '2x+y<=13', 'abs(3x-6)<=9'
 * -> { variables, test(scope) }, read by mathjs, or null.
 */
const inequalityPredicate = (text) => {
  const clean = String(text).replace(/\\le(q)?(?![a-z])/g, '<=').replace(/\\ge(q)?(?![a-z])/g, '>=')
    .replace(/\\ne(q)?(?![a-z])/g, '!=').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, '!=')
    .replace(/\\text\{\s*and\s*\}|\\land/g, ' and ');
  const atoms = [];
  for (const part of clean.split(/\band\b/)) {
    const tokens = part.split(/(<=|>=|!=|<|>)/).map((token) => token.trim()).filter((token) => token !== '');
    if (tokens.length !== 3 && tokens.length !== 5) return null;
    for (let i = 0; i + 2 < tokens.length; i += 2) {
      const left = toMathjs(tokens[i]);
      const right = toMathjs(tokens[i + 2]);
      if (left == null || right == null || !OPS[tokens[i + 1]]) return null;
      atoms.push({ left, op: tokens[i + 1], right });
    }
  }
  const variables = new Set();
  for (const atom of atoms) {
    const names = [...(symbolsOf(atom.left) || []), ...(symbolsOf(atom.right) || [])];
    names.forEach((name) => variables.add(name));
  }
  if (!atoms.length || !variables.size || variables.size > 2) return null;
  return {
    variables: [...variables].sort(),
    test: (scope) => atoms.every((atom) => OPS[atom.op](evaluateAt(atom.left, scope), evaluateAt(atom.right, scope))),
  };
};

const GRID = (() => {
  const points = [];
  for (let i = -160; i <= 160; i += 1) points.push(i / 4);
  [-1e5, 1e5, 0.1, -0.1, 1e-3].forEach((p) => points.push(p));
  return points;
})();
const COARSE = GRID.filter((value, index) => index % 4 === 0);

const sameInequalityIndependently = (left, right) => {
  const a = inequalityPredicate(left);
  const b = inequalityPredicate(right);
  if (!a || !b || a.variables.join() !== b.variables.join()) return false;
  const [u, v] = a.variables;
  if (!v) return GRID.every((x) => a.test({ [u]: x }) === b.test({ [u]: x }));
  return COARSE.every((x) => COARSE.every((y) => a.test({ [u]: x, [v]: y }) === b.test({ [u]: x, [v]: y })));
};

// --- Spellings ----------------------------------------------------------------

// The audit script's human rewrite of generator bookkeeping: y=1*x^2+(-6)*x+(1)
// becomes y=x^2-6x+1. Kept identical so the two agree on what "human" means.
export const safeHumanEquation = (input) => {
  let value = String(input ?? '');
  value = value
    .replace(/([0-9A-Za-z)\]}])\s*\*\s*([A-Za-z(])/g, '$1$2')
    .replace(/([A-Za-z)\]}])\s*\*\s*([0-9A-Za-z(])/g, '$1$2');
  value = value
    .replace(/\+\(\s*(-\d+(?:\.\d+)?)\s*\)/g, '$1')
    .replace(/\+\(\s*(\d+(?:\.\d+)?)\s*\)/g, '+$1')
    .replace(/-\(\s*-(\d+(?:\.\d+)?)\s*\)/g, '+$1')
    .replace(/-\(\s*(\d+(?:\.\d+)?)\s*\)/g, '-$1');
  // ...but never the parentheses of a call: sqrt(3) is not sqrt3.
  value = value
    .replace(/(?<![A-Za-z])\(\s*(-?\d+(?:\.\d+)?)\s*\)(?=[A-Za-z]|$|[+\-=])/g, '$1');
  value = value
    .replace(/(^|[=+-])1(?=[A-Za-z])/g, '$1')
    .replace(/(^|[=+])-1(?=[A-Za-z])/g, '$1-');
  return value;
};

/** What MathLive sends for an ASCII spelling: \frac, ^{}, \cdot, \sqrt{}, |..|. */
export const latexSpelling = (ascii) => String(ascii)
  .replace(/sqrt\(([^()]*)\)/g, '\\sqrt{$1}')
  .replace(/abs\(([^()]*)\)/g, '\\left|$1\\right|')
  .replace(/(^|[^\w)])(-?\d+)\/(\d+)(?![\d.])/g, '$1\\frac{$2}{$3}')
  .replace(/\^\(([^()]*)\)/g, '^{$1}')
  .replace(/\^(-?\d+(?:\.\d+)?)/g, '^{$1}')
  .replace(/\*/g, '\\cdot ')
  .replace(/<=/g, '\\le ')
  .replace(/>=/g, '\\ge ')
  .replace(/!=/g, '\\ne ');

/** Top-level split of a sum into signed terms, or null when it is not one. */
const topLevelTerms = (text) => {
  const source = String(text).replace(/\s+/g, '');
  const terms = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if ('([{'.includes(ch)) depth += 1;
    if (')]}'.includes(ch)) depth -= 1;
    if ((ch === '+' || ch === '-') && depth === 0 && i > 0 && !/[*/^(eE]/.test(source[i - 1])) {
      terms.push(current);
      current = ch;
      continue;
    }
    current += ch;
  }
  terms.push(current);
  return terms.length > 1 && terms.every(Boolean) ? terms : null;
};

const reversedTerms = (text) => {
  const terms = topLevelTerms(text);
  if (!terms) return null;
  const signed = terms.map((term) => (/^[+-]/.test(term) ? term : `+${term}`)).reverse();
  return signed.join('').replace(/^\+/, '');
};

/** (A)(B) or (A)*(B) at top level -> (B)(A). */
const commutedFactors = (text) => {
  const source = String(text).replace(/\s+/g, '');
  const factors = [];
  let depth = 0;
  let start = -1;
  let prefix = '';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '(') {
      if (depth === 0) {
        if (start === -1 && factors.length === 0) prefix = source.slice(0, i);
        else if (source.slice(start, i).replace(/\*/g, '') !== '') return null;
        start = i;
      }
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
      if (depth === 0) { factors.push(source.slice(start, i + 1)); start = i + 1; }
    } else if (depth === 0 && start === -1 && factors.length === 0) {
      // still in the prefix (a coefficient)
    } else if (depth === 0 && ch !== '*') {
      return null;
    }
  }
  if (factors.length < 2 || depth !== 0) return null;
  if (prefix && !/^-?\d*(\.\d+)?$/.test(prefix)) return null;
  return `${prefix}${[...factors].reverse().join('')}`;
};

/** 3x -> 3\\cdot x: the multiplication key pressed where it may be left out. */
const explicitProducts = (text) => {
  const spelled = String(text).replace(/(\d)(?=[A-Za-z(])(?!sqrt|abs|log|ln)/g, '$1\\cdot ');
  return spelled === String(text) ? null : spelled;
};

/** What the editor sends when the student never presses ×: 5x^{3}\\sqrt[3]{x^{2}}, x for x^1. */
const keypadImplicit = (text) => {
  const spelled = latexSpelling(String(text).replace(/\^\(?1\)?(?![\d.])/g, ''))
    .replace(/\\cdot\s*(?=[A-Za-z\\(])/g, '');
  return spelled === latexSpelling(text) ? null : spelled;
};

const SPACE_OUT = (text) => String(text).replace(/([=+\-<>])/g, ' $1 ').replace(/\s+/g, ' ').trim();

const add = (out, spelling, tag) => {
  if (spelling == null) return;
  const text = String(spelling);
  if (!text.trim()) return;
  if (!out.some((entry) => entry.spelling === text)) out.push({ spelling: text, tag });
};

/**
 * Equivalent spellings of one open field's key, each confirmed independently.
 * Returns { spellings: [{ spelling, tag }], dropped: number }.
 */
export const equivalentSpellings = (expected, profile, { percent = false, solvedFor = null, mixedNumbers = false } = {}) => {
  const key = String(expected ?? '').trim();
  const out = [];
  const unconfirmed = [];
  let dropped = 0;
  add(out, key, 'key');
  if (!key) return { spellings: out, dropped, unconfirmed };
  const p = String(profile || '').toLowerCase();

  const offer = (spelling, tag, confirm) => {
    if (spelling == null || spelling === key) return;
    if (confirm(spelling)) add(out, spelling, tag);
    else { dropped += 1; unconfirmed.push({ spelling, tag }); }
  };

  if (p === 'number') {
    const written = exactFraction(key);
    if (!written) return { spellings: out, dropped, unconfirmed };
    // A generated key can be the float of a simple fraction (0.1111111111111111
    // for 1/9). The student's exact answer is the fraction it stands for.
    const nearest = written.simplify(1e-12);
    const value = Number(nearest.d) <= 1000 && Math.abs(nearest.valueOf() - written.valueOf()) < 1e-12 ? nearest : written;
    const same = (spelling) => {
      const other = exactFraction(spelling);
      return other !== null && (other.equals(value) || other.equals(written));
    };
    offer(` ${key} `, 'spaces', () => true);
    if (value.s > 0 && value.n !== 0) offer(`+${key}`, 'leading +', () => true);
    if (value.s < 0) offer(key.replace(/^-/, '−'), 'unicode minus', () => true);
    // A percent field answered with the percent sign the keypad offers.
    if (percent) offer(`${key}\\%`, 'percent sign', () => true);
    // "Solve ... for x" answered as the equation the solving ends on.
    if (solvedFor) offer(`${solvedFor}=${key}`, 'variable prefix', () => true);
    // An improper fraction a student writes as a mixed number (2 1/4).
    if (mixedNumbers && Number(value.d) !== 1 && Math.abs(value.valueOf()) > 1) {
      const whole = value.abs().floor();
      const part = value.abs().sub(whole);
      offer(`${value.s < 0 ? '-' : ''}${whole.toString()}\\frac{${part.n}}{${part.d}}`, 'mixed number', () => true);
    }
    if (Number(value.d) === 1) {
      offer(`${value.toString()}.0`, 'trailing .0', same);
    } else {
      const sign = value.s < 0 ? '-' : '';
      offer(`${sign}\\frac{${value.n}}{${value.d}}`, 'keypad fraction', same);
      offer(`${sign}\\frac{${2n * BigInt(value.n)}}{${2n * BigInt(value.d)}}`, 'unreduced fraction', same);
      offer(`${sign}${value.n}/${value.d}`, 'slash fraction', same);
      const decimal = value.toString();
      if (!decimal.includes('(') && decimal.length < 12) offer(decimal, 'decimal', same);
    }
    return { spellings: out, dropped, unconfirmed };
  }

  if (p === 'text') {
    offer(key.toUpperCase(), 'upper case', () => true);
    offer(key.charAt(0).toUpperCase() + key.slice(1), 'capitalised', () => true);
    return { spellings: out, dropped, unconfirmed };
  }

  if (p === 'orderedpair') {
    const match = key.match(/^\(\s*([^,]+)\s*,\s*([^,]+)\s*\)$/);
    if (!match) return { spellings: out, dropped, unconfirmed };
    const [x, y] = [match[1], match[2]];
    offer(`(${x}, ${y})`, 'space after comma', () => true);
    offer(`\\left(${x},${y}\\right)`, 'keypad parentheses', () => true);
    const fx = exactFraction(x);
    const fy = exactFraction(y);
    const asLatex = (f) => (Number(f.d) === 1 ? f.toString() : `${f.s < 0 ? '-' : ''}\\frac{${f.n}}{${f.d}}`);
    if (fx && fy && (Number(fx.d) !== 1 || Number(fy.d) !== 1)) {
      offer(`(${asLatex(fx)},${asLatex(fy)})`, 'fraction coordinates', () => true);
    }
    return { spellings: out, dropped, unconfirmed };
  }

  if (p === 'set' || (/^\{[^|]*\}$/.test(key) && !key.includes('|'))) {
    const inner = key.replace(/^\{|\}$/g, '').split(',').map((entry) => entry.trim()).filter(Boolean);
    if (inner.length > 1) offer(`\\{${[...inner].reverse().join(',')}\\}`, 'reordered set', () => true);
    offer(`\\left\\{${inner.join(',')}\\right\\}`, 'keypad braces', () => true);
    return { spellings: out, dropped, unconfirmed };
  }

  if (p === 'interval') {
    offer(key.replace(/inf/g, '\\infty').replace(/U/g, '\\cup '), 'keypad infinity/union', () => true);
    offer(key.replace(/inf/g, '∞').replace(/,/g, ', '), 'unicode infinity', () => true);
    return { spellings: out, dropped, unconfirmed };
  }

  const isSetBuilder = /^\{\s*[A-Za-z]\s*\|/.test(key);
  if (isSetBuilder) {
    offer(latexSpelling(key).replace(/^\{/, '\\{').replace(/\}$/, '\\}').replace(/\|/, '\\mid '), 'keypad set-builder', () => true);
    return { spellings: out, dropped, unconfirmed };
  }

  // Some equation fields hold an inequality (a system's constraint), so the
  // key's own relation decides, not the profile.
  const hasRelation = /(<=|>=|!=|<|>)/.test(key) || /\band\b/.test(key);
  if (hasRelation) {
    const same = (spelling) => sameInequalityIndependently(key, spelling);
    offer(safeHumanEquation(key), 'human signs', same);
    const keypad = safeHumanEquation(key).split(/\s+and\s+/).map((part) => latexSpelling(part.replace(/\s+/g, ''))).join('\\text{ and }');
    offer(keypad, 'keypad relation', same);
    const single = key.replace(/\s+/g, '').match(/^([A-Za-z])(<=|>=|<|>)(\(?-?[\d.]+\)?)$/);
    if (single) {
      const flip = { '<': '>', '>': '<', '<=': '>=', '>=': '<=' }[single[2]];
      offer(`${single[3]}${flip}${single[1]}`, 'read from the other side', same);
    }
    const chain = key.replace(/\s+/g, '').match(/^(\(?-?[\d.]+\)?)(<=|<)([A-Za-z])and\3(<=|<)(\(?-?[\d.]+\)?)$/);
    if (chain) offer(latexSpelling(`${chain[1]}${chain[2]}${chain[3]}${chain[4]}${chain[5]}`), 'chained compound', same);
    return { spellings: out, dropped, unconfirmed };
  }

  if (key.includes('=')) {
    const same = (spelling) => sameEquationIndependently(key, spelling);
    const human = safeHumanEquation(key);
    offer(human, 'human signs', same);
    offer(latexSpelling(human), 'keypad', same);
    offer(explicitProducts(human), 'explicit multiplication', same);
    offer(SPACE_OUT(human), 'spaces', same);
    const [lhs, rhs] = human.split('=');
    if (rhs !== undefined) {
      const reorderedRight = reversedTerms(rhs);
      if (reorderedRight) offer(`${lhs}=${reorderedRight}`, 'reordered terms', same);
      const commuted = commutedFactors(rhs);
      if (commuted) offer(`${lhs}=${commuted}`, 'commuted factors', same);
      const commutedLeft = commutedFactors(lhs);
      if (commutedLeft) offer(`${commutedLeft}=${rhs}`, 'commuted factors', same);
      offer(`${rhs}=${lhs}`, 'sides swapped', same);
    }
    return { spellings: out, dropped, unconfirmed };
  }

  // An expression.
  const same = (spelling) => sameExpressionIndependently(key, spelling);
  const human = safeHumanEquation(key);
  offer(human, 'human signs', same);
  offer(latexSpelling(human), 'keypad', same);
  offer(explicitProducts(human), 'explicit multiplication', same);
  offer(keypadImplicit(human), 'keypad implicit product', same);
  offer(SPACE_OUT(human), 'spaces', same);
  offer(reversedTerms(human), 'reordered terms', same);
  offer(commutedFactors(human), 'commuted factors', same);
  const fraction = human.match(/^\((.*)\)\/\((.*)\)$/);
  if (fraction && !fraction[1].includes(')/(')) {
    offer(`\\frac{${fraction[1]}}{${fraction[2]}}`, 'keypad fraction', same);
    const den = commutedFactors(fraction[2]);
    if (den) offer(`\\frac{${fraction[1]}}{${den}}`, 'commuted denominator factors', same);
  }
  return { spellings: out, dropped, unconfirmed };
};

// --- Is the key right for its prompt? (recomputed, never read from the item) ---

const mathSegments = (prompt) => [...String(prompt ?? '').matchAll(/\$([^$]+)\$/g)].map((match) => match[1]
  .replace(/\\text\{[^{}]*\}/g, '').replace(/\^\\circ/g, '').replace(/\\%/g, '').trim());

const sideValue = (expression, scope) => {
  const parsed = toMathjs(expression);
  return parsed == null ? NaN : evaluateAt(parsed, scope);
};

const variableOf = (expression) => {
  const parsed = toMathjs(expression);
  const names = parsed == null ? null : symbolsOf(parsed);
  return names && names.length === 1 ? names[0] : (names && names.length === 0 ? '' : null);
};

const EXPRESSION_VERBS = /^(Factor|Simplify|Expand|Multiply|Divide|Rewrite|Distribute)\b/;

/**
 * Recompute the answer of a recognisable prompt with mathjs and compare it with
 * the key. Returns null when the prompt is not one this reads, else
 * { rule, ok, detail }. Deliberately narrow: a prompt it cannot read
 * confidently is skipped, not guessed.
 */
export const independentKeyCheck = (question) => {
  const fields = Array.isArray(question?.responseFields) ? question.responseFields : [];
  if (fields.length !== 1) return null;
  const field = fields[0];
  const profile = String(field.inputProfile || '').toLowerCase();
  const key = field.expected;
  if (key === undefined || key === null || profile === 'choice') return null;
  const prompt = String(question.prompt ?? '').trim();
  const segments = mathSegments(prompt);
  if (!segments.length) return null;
  const first = segments[0];

  // Evaluate / Compute a purely numeric expression.
  if (/^(Evaluate|Compute)\b/.test(prompt) && profile === 'number' && segments.length === 1 && !/[=<>]/.test(first)) {
    if (variableOf(first) !== '') return null;
    const value = sideValue(first, {});
    if (!Number.isFinite(value)) return null;
    const keyValue = exactFraction(key)?.valueOf() ?? Number(key);
    return { rule: 'evaluate', ok: Math.abs(value - keyValue) <= 1e-9 * Math.max(1, Math.abs(value)), detail: `${first} = ${value}` };
  }

  // Solve one equation in one letter: the key must satisfy it.
  if (/^Solve\b/.test(prompt) && (first.match(/=/g) || []).length === 1 && !/[<>]|\\[lg]e/.test(first)) {
    const [left, right] = first.split('=');
    const name = variableOf(`${left}+${right}`);
    if (!name) return null;
    const values = profile === 'number'
      ? [exactFraction(key)?.valueOf() ?? Number(key)]
      : profile === 'set' ? String(key).replace(/[{}\s]/g, '').split(',').map(Number) : null;
    if (!values || !values.every(Number.isFinite)) return null;
    const ok = values.every((value) => {
      const l = sideValue(left, { [name]: value });
      const r = sideValue(right, { [name]: value });
      return Number.isFinite(l) && Number.isFinite(r) && Math.abs(l - r) <= 1e-6 * Math.max(1, Math.abs(l));
    });
    return { rule: 'solve-substitute', ok, detail: `${first} at ${name}=${values.join(',')}` };
  }

  // Solve one inequality in one letter: the key must have the same solution set.
  if (/^Solve\b/.test(prompt) && profile === 'inequality' && segments.length === 1) {
    const solution = inequalityPredicate(first);
    const answer = inequalityPredicate(key);
    if (!solution || !answer || solution.variables.length !== 1 || answer.variables.join() !== solution.variables.join()) return null;
    const [u] = solution.variables;
    const ok = GRID.every((x) => solution.test({ [u]: x }) === answer.test({ [u]: x }));
    return { rule: 'solve-inequality', ok, detail: `${first} vs ${key}` };
  }

  // Factor / simplify / multiply ... an expression: the key must be the same function.
  if (profile === 'expression' && segments.length <= 2 && !segments.some((segment) => /[=<>]/.test(segment))) {
    let target = null;
    const [a, b] = segments.map((segment) => `(${segment})`);
    if (segments.length === 2 && /^Divide \$[^$]+\$ by \$[^$]+\$/.test(prompt)) target = `${a}/${b}`;
    else if (segments.length === 2 && /^Multiply \$[^$]+\$ (by|and) \$[^$]+\$/.test(prompt)) target = `${a}*${b}`;
    else if (segments.length === 2 && /^Subtract \$[^$]+\$ from \$[^$]+\$/.test(prompt)) target = `${b}-${a}`;
    else if (segments.length === 2 && /^Add \$[^$]+\$ (and|to) \$[^$]+\$/.test(prompt)) target = `${a}+${b}`;
    else if (segments.length === 1 && EXPRESSION_VERBS.test(prompt)) target = first;
    if (target == null || toMathjs(target) == null || toMathjs(key) == null) return null;
    return { rule: 'same-expression', ok: sameExpressionIndependently(target, key), detail: `${target} vs ${key}` };
  }
  return null;
};

// --- The issue path -------------------------------------------------------------

/** issueNextQuestion's store-then-serve, exactly as pathChoiceIdRoundTrip models it. */
export const issueAsServed = async (question) => {
  const plan = await mathPath.buildIssuePlan(question);
  if (!plan?.issuable) return { plan, stored: null, served: null };
  const stored = {
    ...mathPath.buildSanitizedQuestion(question, { questionInstanceId: 'qi-sweep', attemptsAllowed: 3, toolPayload: plan.toolPayload }),
    privateGrading: plan.privateGrading,
  };
  const served = mathPath.buildSanitizedQuestion(stored, {
    questionInstanceId: stored.questionInstanceId,
    attemptsAllowed: stored.attemptsAllowed,
    toolPayload: mathPath.storedToolPayload(stored),
    issued: true,
  });
  return { plan, stored, served };
};

const gradeField = async (stored, fieldId, value) => {
  const result = await mathPath.gradePathToolResponse(stored.privateGrading, { responses: { [fieldId]: value } });
  return Boolean(result.fieldResults?.find((entry) => entry.id === String(fieldId))?.isCorrect);
};

const authoredLabel = (choice) => String(choice?.label ?? choice?.text ?? choice?.value ?? '').trim();
const authoredId = (choice, index) => String(choice?.id ?? choice?.value ?? index);

// --- Tool items: the tool's own work, built from the authored question --------
//
// Each builder answers the question as a student using the tool would, from
// the AUTHORED item and arithmetic done here (fraction.js / mathjs), never from
// the private grading definition the contract derives. It returns the key's
// work plus equivalent work (other points on the same line, rounded regression
// coefficients, a keypad spelling of a typed part), and every authored
// expectation it can recompute independently (`keyChecks`).

const round = (value, places) => Math.round(Number(value) * 10 ** places) / 10 ** places;
const finiteNumber = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

/** y = f(x) for the parent families the function workspace draws. */
export const evaluateFunctionSpec = (spec = {}, x) => {
  const t = String(spec.type || '');
  const a = Number(spec.a ?? 1);
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? 0);
  const base = Number(spec.base ?? 2);
  const u = x - h;
  if (t === 'linear' || t === 'line') return Number(spec.m ?? spec.a) * x + Number(spec.b ?? spec.k ?? 0);
  if (t === 'quadratic') return a * u * u + k;
  if (t === 'cubic') return a * u ** 3 + k;
  if (t === 'absolute') return a * Math.abs(u) + k;
  if (t === 'squareRoot') return u < 0 ? NaN : a * Math.sqrt(u) + k;
  if (t === 'cubeRoot') return a * Math.cbrt(u) + k;
  if (t === 'rational') return u === 0 ? NaN : a / u + k;
  if (t === 'exponential') return a * base ** u + k;
  if (t === 'logarithmic') return u <= 0 ? NaN : a * (Math.log(u) / Math.log(base)) + k;
  return NaN;
};

const intervalText = (intervals, { infinity = '\\infty', union = '\\cup ' } = {}) => intervals.map((entry) => {
  const lo = entry.min == null || entry.min === '' ? `(-${infinity}` : `${entry.minClosed ? '[' : '('}${entry.min}`;
  const hi = entry.max == null || entry.max === '' ? `${infinity})` : `${entry.max}${entry.maxClosed ? ']' : ')'}`;
  return `${lo},${hi}`;
}).join(union);

const inIntervals = (intervals, x) => intervals.some((entry) => {
  const lo = entry.min == null || entry.min === '' ? -Infinity : Number(entry.min);
  const hi = entry.max == null || entry.max === '' ? Infinity : Number(entry.max);
  return (x > lo || (entry.minClosed && x === lo)) && (x < hi || (entry.maxClosed && x === hi));
});

const leastSquares = (rows, ys) => {
  const A = math.matrix(rows);
  const At = math.transpose(A);
  const solution = math.lusolve(math.multiply(At, A), math.multiply(At, math.matrix(ys)));
  return solution.toArray().map((row) => row[0]);
};

const pointsOf = (question) => (Array.isArray(question.points) ? question.points : [])
  .map((point) => (Array.isArray(point) ? [Number(point[0]), Number(point[1])] : [Number(point?.x), Number(point?.y)]))
  .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

/** Independent regressions: linear, quadratic, exponential (log-linear), square root (endpoint convention). */
export const independentRegressions = (points) => {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const [b, m] = leastSquares(xs.map((x) => [1, x]), ys);
  const mx = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const my = ys.reduce((sum, y) => sum + y, 0) / ys.length;
  const sxy = xs.reduce((sum, x, i) => sum + (x - mx) * (ys[i] - my), 0);
  const sxx = xs.reduce((sum, x) => sum + (x - mx) ** 2, 0);
  const syy = ys.reduce((sum, y) => sum + (y - my) ** 2, 0);
  const r = sxy / Math.sqrt(sxx * syy);
  const out = { linear: { m, b }, r };
  if (points.length >= 3) {
    const [c, qb, qa] = leastSquares(xs.map((x) => [1, x, x * x]), ys);
    out.quadratic = { a: qa, b: qb, c };
  }
  if (ys.every((y) => y > 0)) {
    const [lnA, lnB] = leastSquares(xs.map((x) => [1, x]), ys.map((y) => Math.log(y)));
    out.exponential = { a: Math.exp(lnA), base: Math.exp(lnB) };
  }
  const sorted = [...points].sort((p, q) => p[0] - q[0]);
  if (sorted.length >= 3 && sorted[0][0] !== sorted[1][0]) {
    const [h, k] = sorted[0];
    const later = sorted.slice(1);
    const [a] = leastSquares(later.map(([x]) => [Math.sqrt(x - h)]), later.map(([, y]) => y - k));
    out.squareRoot = { a, h, k };
  }
  return out;
};

const predictWith = (id, model, x) => {
  if (id === 'linear') return model.m * x + model.b;
  if (id === 'quadratic') return model.a * x * x + model.b * x + model.c;
  if (id === 'exponential') return model.a * model.base ** x;
  if (id === 'squareRoot') return x < model.h ? NaN : model.a * Math.sqrt(x - model.h) + model.k;
  return NaN;
};

const FORCED_MODEL = {
  linearFit: 'linear', quadraticFit: 'quadratic', exponentialFit: 'exponential',
  linearFitPrediction: 'linear', quadraticFitPrediction: 'quadratic', exponentialFitPrediction: 'exponential', squareRootFitPrediction: 'squareRoot',
};

const lineFromAuthoredGraphing = (question) => {
  const mode = String(question.mode || 'slopeIntercept');
  if (mode === 'verticalHorizontal') {
    return question.orientation === 'vertical' ? { vertical: Number(question.value) } : { m: new Fraction(0), b: new Fraction(Number(question.value)) };
  }
  if (mode === 'pointSlope') {
    const m = new Fraction(Number(question.slope));
    return { m, b: new Fraction(Number(question.point[1])).sub(m.mul(Number(question.point[0]))) };
  }
  if (mode === 'standardForm') {
    const { A, B, C } = question.standard || {};
    if (Number(B) === 0) return { vertical: Number(C) / Number(A) };
    return { m: new Fraction(-Number(A), Number(B)), b: new Fraction(Number(C), Number(B)) };
  }
  if (mode === 'throughPoints') {
    const [[x1, y1], [x2, y2]] = question.givenPoints;
    if (Number(x1) === Number(x2)) return { vertical: Number(x1) };
    const m = new Fraction(Number(y2) - Number(y1), Number(x2) - Number(x1));
    return { m, b: new Fraction(Number(y1)).sub(m.mul(Number(x1))) };
  }
  if (finiteNumber(question.line?.x)) return { vertical: Number(question.line.x) };
  return { m: new Fraction(Number(question.line?.m)), b: new Fraction(Number(question.line?.b)) };
};

/**
 * The key's work and equivalent work for one tool question.
 * Returns { works: [{ tag, raw }], keyChecks: [{ ok, detail }] } or null for a tool this does not drive.
 */
export const toolWorkFor = (toolId, question) => {
  const works = [];
  const keyChecks = [];
  const add = (tag, raw) => works.push({ tag, raw });

  if (toolId === 'intervalNumberLine') {
    const intervals = Array.isArray(question.expectedIntervals) ? question.expectedIntervals : [];
    const ask = Array.isArray(question.ask) && question.ask.length ? question.ask : ['graph'];
    const raw = { intervals };
    if (ask.includes('interval') || ask.includes('notation')) raw.notation = intervalText(intervals);
    if (ask.includes('inequality') && question.expectedInequality != null) raw.inequality = String(question.expectedInequality);
    add('key', raw);
    if (raw.notation) add('unicode infinity', { ...raw, notation: intervalText(intervals, { infinity: '∞', union: 'U' }) });
    if (question.inequalityText) {
      const predicate = inequalityPredicate(question.inequalityText);
      if (predicate && predicate.variables.length === 1) {
        const [u] = predicate.variables;
        keyChecks.push({ ok: GRID.every((x) => predicate.test({ [u]: x }) === inIntervals(intervals, x)), detail: `${question.inequalityText} vs ${JSON.stringify(intervals)}` });
      }
    }
    return { works, keyChecks };
  }

  if (toolId === 'functionInvestigation') {
    const spec = question.functionSpec || {};
    const placements = {};
    for (const [index, task] of (question.pointTasks || []).entries()) {
      if (!Array.isArray(task?.expected)) continue;
      placements[String(task.id || `point-${index + 1}`)] = task.expected;
      const y = evaluateFunctionSpec(spec, Number(task.expected[0]));
      if (Number.isFinite(y)) keyChecks.push({ ok: Math.abs(y - Number(task.expected[1])) <= 1e-6, detail: `f(${task.expected[0]})=${y} vs ${task.expected[1]}` });
    }
    const markerPlacements = {};
    for (const [index, requirement] of (question.endpointRequirements || []).entries()) {
      if (requirement?.marker != null) markerPlacements[String(requirement.id || `endpoint-${index + 1}`)] = requirement.marker;
    }
    const answers = {};
    const selections = {};
    const spellings = [];
    for (const [index, part] of (question.analysisRequests || question.analysisParts || []).entries()) {
      const id = String(part?.id || `analysis-${index + 1}`);
      // The contract marks against acceptedAnswers when an author lists them,
      // and only otherwise against expected.
      const accepted = Array.isArray(part?.acceptedAnswers) ? part.acceptedAnswers : [];
      const expected = accepted.length ? accepted : (Array.isArray(part?.expected) ? part.expected : []);
      if (!expected.length) continue;
      if (['point', 'inversePoint'].includes(String(part.kind))) { selections[id] = expected; continue; }
      answers[id] = String(expected[0]);
      const profile = String(part.notation || '') === 'interval' || ['domain', 'range'].includes(String(part.kind)) && String(part.notation || '') !== 'inequality'
        ? 'interval' : (String(part.notation || '') === 'inequality' ? 'inequality' : 'number');
      const key = String(expected[0]).replace(/∞/g, 'inf');
      for (const { spelling, tag } of equivalentSpellings(key, /^-?[\d.]+$/.test(key) ? 'number' : (/[a-z]\s*[<>=!]/i.test(key) ? 'inequality' : profile)).spellings) {
        if (tag !== 'key') spellings.push({ id, spelling, tag });
      }
    }
    // A graph-based inverse: reflect the plotted points across y = x and write
    // the inverse (pathToolContracts adds these parts to the question).
    const reflection = question.inverseReflection && question.inverseReflection.enabled !== false ? question.inverseReflection : null;
    if (reflection) {
      const tasks = (question.pointTasks || []).map((task, index) => ({ ...task, id: String(task?.id || `point-${index + 1}`) }))
        .filter((task) => Array.isArray(task.expected) && task.expected.length === 2);
      const sources = Array.isArray(reflection.sourceTaskIds) && reflection.sourceTaskIds.length
        ? reflection.sourceTaskIds.map((id) => tasks.find((task) => task.id === String(id))).filter(Boolean)
        : tasks.slice(0, 2);
      for (const task of sources) selections[`inverse-reflect-${task.id}`] = [[Number(task.expected[1]), Number(task.expected[0])]];
      if (reflection.requireInverseEquation !== false) {
        const equationId = String(reflection.equationPartId || 'inverse-equation');
        if (reflection.expectedEquation) {
          answers[equationId] = String(reflection.expectedEquation);
        } else if (['linear', 'line'].includes(String(spec.type))) {
          const m = new Fraction(Number(spec.m ?? spec.a));
          answers[equationId] = `f^{-1}(x)=\\frac{1}{${m.toFraction()}}x${new Fraction(-Number(spec.b ?? 0)).div(m).toFraction().replace(/^(?!-)/, '+')}`;
        }
      }
    }
    const raw = { placements, markerPlacements, answers, selections };
    add('key', raw);
    for (const { id, spelling, tag } of spellings) add(`${id}: ${tag}`, { ...raw, answers: { ...answers, [id]: spelling } });
    return { works, keyChecks };
  }

  if (toolId === 'stepAlgebra' || toolId === 'algebra') {
    const variable = String(question.variable || 'x');
    if (question.solverGrader && question.expectedFinalRelation != null) {
      add('key', { finalRelation: String(question.expectedFinalRelation) });
      return { works, keyChecks };
    }
    const answer = question.answer ?? question.solution ?? question.expected;
    add('key', { finalEquation: `${variable}=${answer}` });
    add('sides swapped', { finalEquation: `${answer}=${variable}` });
    const equation = String(question.equation || question.equationLatex || '');
    const [left, right] = equation.split('=');
    if (right !== undefined && finiteNumber(answer)) {
      const l = sideValue(left, { [variable]: Number(answer) });
      const r = sideValue(right, { [variable]: Number(answer) });
      if (Number.isFinite(l) && Number.isFinite(r)) keyChecks.push({ ok: Math.abs(l - r) <= 1e-9, detail: `${equation} at ${variable}=${answer}` });
    }
    return { works, keyChecks };
  }

  if (toolId === 'relationMapping') {
    const pairs = (question.pairs || []).map((pair) => (Array.isArray(pair) ? [Number(pair[0]), Number(pair[1])] : [Number(pair.x), Number(pair.y)]));
    const outputs = new Map();
    let isFunction = true;
    for (const [x, y] of pairs) {
      if (outputs.has(x) && outputs.get(x) !== y) isFunction = false;
      outputs.set(x, y);
    }
    const raw = {
      arrows: pairs,
      domain: [...new Set(pairs.map(([x]) => x))],
      range: [...new Set(pairs.map(([, y]) => y))],
      isFunction: isFunction ? 'yes-definition' : 'no-input-repeat',
    };
    add('key', raw);
    add('sets listed in another order', { ...raw, domain: [...raw.domain].reverse(), range: [...raw.range].reverse(), arrows: [...pairs].reverse() });
    return { works, keyChecks };
  }

  if (toolId === 'graphing2') {
    const line = lineFromAuthoredGraphing(question);
    const at = (x) => (line.vertical !== undefined ? null : line.m.mul(x).add(line.b).valueOf());
    if (line.vertical !== undefined) {
      add('key', { points: [[line.vertical, 0], [line.vertical, 3]] });
      add('other points on the line', { points: [[line.vertical, -4], [line.vertical, 1]] });
    } else {
      add('key', { points: [[0, at(0)], [1, at(1)]] });
      add('other points on the line', { points: [[-3, at(-3)], [2, at(2)]] });
    }
    return { works, keyChecks };
  }

  if (toolId === 'systemsWorkspace') {
    const mode = String(question.mode || 'linear');
    if (mode === 'linear') {
      const { m1, b1, m2, b2 } = question.system || {};
      const dm = new Fraction(Number(m1)).sub(Number(m2));
      if (dm.equals(0)) {
        add('key', { classification: Number(b1) === Number(b2) ? 'infinite' : 'none' });
      } else {
        const x = new Fraction(Number(b2)).sub(Number(b1)).div(dm);
        const y = x.mul(Number(m1)).add(Number(b1));
        add('key', { classification: 'one', x: x.valueOf(), y: y.valueOf() });
        add('coordinates rounded to hundredths', { classification: 'one', x: round(x.valueOf(), 2), y: round(y.valueOf(), 2) });
      }
      return { works, keyChecks };
    }
    if (mode === 'matrix3') {
      const rows = (question.matrix?.rows || []).map((row) => (Array.isArray(row) ? row : row.cells).map(Number));
      const det = math.det(rows.map((row) => row.slice(0, 3)));
      if (Math.abs(det) < 1e-12) return null;
      const [x, y, z] = math.lusolve(rows.map((row) => row.slice(0, 3)), rows.map((row) => row[3])).map((row) => row[0]);
      add('key', { classification: 'one', x, y, z, technologyUsed: true });
      return { works, keyChecks };
    }
    if (mode === 'inequalities') {
      const inequalities = (question.inequalities || []).map((entry) => ({ m: Number(entry.m), b: Number(entry.b), relation: String(entry.relation) }));
      const holds = (entry, x, y) => ({ '>': y > entry.m * x + entry.b, '>=': y >= entry.m * x + entry.b, '<': y < entry.m * x + entry.b, '<=': y <= entry.m * x + entry.b })[entry.relation];
      const ask = Array.isArray(question.ask) && question.ask.length ? question.ask : ['testPoint', 'candidate'];
      const raw = {};
      if (ask.includes('construction')) {
        raw.construction = inequalities.map((entry) => ({
          points: [[0, entry.b], [2, entry.m * 2 + entry.b]],
          boundaryStyle: entry.relation.includes('=') ? 'solid' : 'dashed',
          shade: entry.relation.startsWith('>') ? 'above' : 'below',
        }));
      }
      if (ask.includes('testPoint') && question.testPoint) {
        raw.testChoice = inequalities.every((entry) => holds(entry, Number(question.testPoint.x), Number(question.testPoint.y))) ? 'yes' : 'no';
      }
      if (ask.includes('candidate')) {
        let found = null;
        for (let x = -10; x <= 10 && !found; x += 1) for (let y = -20; y <= 20 && !found; y += 1) {
          if (inequalities.every((entry) => holds(entry, x, y))) found = { x, y };
        }
        if (!found) return null;
        raw.candidate = found;
      }
      add('key', raw);
      return { works, keyChecks };
    }
    return null;
  }

  if (toolId === 'dataModelingLab') {
    const points = pointsOf(question);
    const fits = independentRegressions(points);
    const mode = String(question.mode || 'full');
    const forced = FORCED_MODEL[mode] || null;
    const xs = points.map(([x]) => x);
    const predictionX = finiteNumber(question.predictionX) ? Number(question.predictionX) : null;
    const build = (places) => {
      const raw = {
        m: round(fits.linear.m, places), b: round(fits.linear.b, places), r: round(fits.r, Math.max(2, places)),
      };
      const id = forced || null;
      if (id === 'quadratic') Object.assign(raw, { a: round(fits.quadratic.a, places), b: round(fits.quadratic.b, places), c: round(fits.quadratic.c, places) });
      if (id === 'exponential') Object.assign(raw, { a: round(fits.exponential.a, places), base: round(fits.exponential.base, places) });
      if (id === 'squareRoot') Object.assign(raw, { a: round(fits.squareRoot.a, places), h: fits.squareRoot.h, k: fits.squareRoot.k });
      if (predictionX != null && id) {
        raw.predictionX = predictionX;
        raw.predictionY = round(predictWith(id, fits[id] || fits.linear, predictionX), places);
        raw.predictionType = predictionX >= Math.min(...xs) && predictionX <= Math.max(...xs) ? 'interpolation' : 'extrapolation';
      }
      return raw;
    };
    const categorical = (raw) => {
      // Direction / strength words, causation and the model verdict are the
      // platform's categories, not arithmetic: they come from the authored
      // item where it says (causationSupported, expectedModel) and from the
      // sign and size of r computed here.
      const abs = Math.abs(fits.r);
      return {
        ...raw,
        direction: fits.r > 0.05 ? 'positive' : fits.r < -0.05 ? 'negative' : 'none',
        strength: abs >= 0.8 ? 'strong' : abs >= 0.5 ? 'moderate' : abs >= 0.2 ? 'weak' : 'none',
        causation: question.causationSupported === true ? 'causation' : 'association',
        ...(question.expectedModel ? { modelChoice: String(question.expectedModel) } : {}),
      };
    };
    if (!forced && !['correlation', 'association'].includes(mode)) return null;
    add('key', categorical(build(6)));
    add('regression rounded to hundredths', categorical(build(2)));
    return { works, keyChecks };
  }
  return null;
};

/**
 * Sweep one generated or fixed question. Calls `record(finding)` for every
 * failure and returns counters.
 */
export const sweepQuestion = async (question, { record, context }) => {
  const counters = { fields: 0, spellings: 0, dropped: 0, choiceFields: 0, toolQuestions: 0, toolSkipped: 0, toolWorks: 0, keyChecks: 0, notIssuable: 0 };
  const { plan, stored, served } = await issueAsServed(question);
  if (!plan?.issuable) {
    counters.notIssuable += 1;
    record({ ...context, class: 'KEY DEFECT', kind: 'not-issuable', detail: plan?.reason || 'unknown' });
    return counters;
  }
  if (plan.toolPayload) {
    counters.toolQuestions += 1;
    const toolId = plan.toolPayload.pathToolId;
    const built = toolWorkFor(toolId, question);
    if (!built) {
      counters.toolSkipped += 1;
      return counters;
    }
    for (const check of built.keyChecks) {
      counters.keyChecks += 1;
      if (!check.ok) record({ ...context, toolId, class: 'KEY DEFECT', kind: 'tool-key-disagrees-with-recomputation', detail: check.detail });
    }
    for (const { tag, raw } of built.works) {
      counters.toolWorks += 1;
      // eslint-disable-next-line no-await-in-loop
      const result = await mathPath.gradePathToolResponse(stored.privateGrading, raw);
      if (!result.isCorrect) {
        const wrongParts = Array.isArray(result.parts)
          ? result.parts.filter((part) => !part.isCorrect).map((part) => part.id)
          : Object.entries(result.parts || {}).filter(([, ok]) => !ok).map(([id]) => id);
        record({ ...context, toolId, class: tag === 'key' ? 'KEY DEFECT' : 'FALSE NEGATIVE', kind: `tool work: ${tag}`, detail: result.reason || wrongParts.join(',') });
      }
    }
    return counters;
  }
  const servedFields = served.responseFields || [];
  for (const field of question.responseFields || []) {
    const id = String(field.id);
    const profile = String(field.inputProfile || 'text').toLowerCase();
    counters.fields += 1;
    if (profile === 'choice') {
      counters.choiceFields += 1;
      const authoredChoices = Array.isArray(field.choices) && field.choices.length ? field.choices : (question.choices || []);
      const servedChoices = (servedFields.find((entry) => entry.id === id)?.choices?.length
        ? servedFields.find((entry) => entry.id === id).choices
        : served.choices) || [];
      const keyIndex = authoredChoices.findIndex((choice, index) => authoredId(choice, index) === String(field.expected));
      if (keyIndex < 0) {
        record({ ...context, fieldId: id, profile, class: 'KEY DEFECT', kind: 'choice-key-names-no-option', expected: field.expected });
        continue;
      }
      const keyLabel = authoredLabel(authoredChoices[keyIndex]);
      const labelled = servedChoices.filter((choice) => String(choice.label ?? '').trim() === keyLabel);
      if (labelled.length !== 1) {
        record({ ...context, fieldId: id, profile, class: 'KEY DEFECT', kind: 'choice-label-not-unique-as-served', expected: keyLabel, detail: labelled.length });
        continue;
      }
      for (const choice of servedChoices) {
        counters.spellings += 1;
        // eslint-disable-next-line no-await-in-loop
        const verdict = await gradeField(stored, id, choice.id);
        const shouldBe = choice.id === labelled[0].id;
        if (verdict !== shouldBe) {
          record({ ...context, fieldId: id, profile, class: 'KEY DEFECT', kind: shouldBe ? 'served-key-option-graded-wrong' : 'served-distractor-graded-right', expected: keyLabel, rejected: choice.label });
        }
      }
      continue;
    }
    const expected = field.expected ?? field.answer;
    if (expected === undefined || expected === null) continue;
    const prompt = String(question.prompt ?? '');
    const label = String(field.label ?? '');
    const solveMatch = /^Solve\b/.test(prompt) && (question.responseFields || []).length === 1
      ? (mathSegments(prompt)[0] || '').match(/^[^=]*=[^=]*$/) && variableOf((mathSegments(prompt)[0] || '').replace('=', '+'))
      : null;
    const { spellings, dropped } = equivalentSpellings(expected, profile, {
      // Only where the ANSWER is a percent: the question asks for one.
      percent: /percent/i.test(label) || ((question.responseFields || []).length === 1
        && /(what|which) percent|as a percent|percent (increase|decrease|change)|rate percent|percent does/i.test(prompt.split(/(?<=[.?])\s/).slice(-1)[0])),
      solvedFor: solveMatch || null,
      mixedNumbers: /\bfraction\b/i.test(`${label} ${prompt}`) && !/improper|lowest terms|simplest/i.test(`${label} ${prompt}`),
    });
    counters.dropped += dropped;
    for (const { spelling, tag } of spellings) {
      counters.spellings += 1;
      // eslint-disable-next-line no-await-in-loop
      const verdict = await gradeField(stored, id, spelling);
      if (!verdict) {
        record({
          ...context,
          fieldId: id,
          profile,
          equivalence: field.equivalence || null,
          class: tag === 'key' ? 'KEY DEFECT' : 'FALSE NEGATIVE',
          kind: tag,
          expected: String(expected),
          rejected: spelling,
        });
      }
    }
  }
  return counters;
};

/**
 * The course release's own documents: every seed family compiled by the one
 * Path content compiler, as scripts/build-course-path-release-v2.mjs compiles
 * them. Production stores and issues the compiled document, not the seed.
 */
export const compiledCourseDocuments = (courseId) => {
  const compiled = compiler.compilePathQuestionPackage(readCourseSeed(courseId), {
    defaults: { builtInPathSeed: 'mathmaster-built-in-path-bank' },
  });
  return { documents: compiled.documents.map((entry) => entry.document), errors: compiled.errors };
};

/**
 * Sweep courses. `draws` seeded draws per generated variant row; `select`
 * optionally narrows which (courseId, document) pairs are swept.
 */
export const sweepCourses = async ({ courses = SCHOOL_COURSES, draws = 3, select = null } = {}) => {
  const findings = [];
  const totals = { families: 0, variantRows: 0, instances: 0, fields: 0, choiceFields: 0, toolQuestions: 0, toolSkipped: 0, toolWorks: 0, keyChecks: 0, spellings: 0, dropped: 0, generationFailures: 0, notIssuable: 0, compileErrors: 0 };
  for (const courseId of courses) {
    const { documents, errors } = compiledCourseDocuments(courseId);
    totals.compileErrors += errors.length;
    errors.forEach((error) => findings.push({ courseId, id: error.questionId, class: 'KEY DEFECT', kind: 'compile-error', detail: error.code }));
    for (const document of documents) {
      if (document.active === false) continue;
      if (select && !select(courseId, document)) continue;
      totals.families += 1;
      for (const row of generation.effectivePathVariants(document)) {
        totals.variantRows += 1;
        const generated = generation.hasPathGenerator(row.template);
        const count = generated ? draws : 1;
        for (let draw = 0; draw < count; draw += 1) {
          const seed = `k-sweep-${draw}`;
          const instance = generated ? generation.generatePathInstanceWithRetries(row.template, seed, 4) : { question: row.template };
          const context = { courseId, id: document.id, variant: row.variantIndex, draw: generated ? seed : null };
          if (!instance?.question) {
            totals.generationFailures += 1;
            findings.push({ ...context, class: 'KEY DEFECT', kind: 'generation-failed', detail: instance?.reason || 'unknown' });
            continue;
          }
          totals.instances += 1;
          // eslint-disable-next-line no-await-in-loop
          const counters = await sweepQuestion(instance.question, { record: (finding) => findings.push(finding), context });
          for (const key of ['fields', 'choiceFields', 'toolQuestions', 'toolSkipped', 'toolWorks', 'keyChecks', 'spellings', 'dropped', 'notIssuable']) totals[key] += counters[key];
        }
      }
    }
  }
  return { findings, totals };
};

// --- What is known and reported, not fixed here --------------------------------
//
// Every remaining false negative in the school banks is a GRADER gap (the
// shared answer-equivalence rules in functions/shared, owned by the functions
// lane) or a grading-policy question, not an item that is too narrow. They are
// listed by finding kind and family so a NEW one still fails the sweep, and so
// a grader fix that clears one never does. '*' means every family: the policy
// question is the same wherever the form appears.
export const KNOWN_OPEN_FALSE_NEGATIVES = Object.freeze({
  // y=7x answered 7x=y; x=3 answered 3=x. sameLinearEquation compares side
  // against side by design. Policy question for the grader owner.
  'sides swapped': { families: '*', reason: 'equation sides compared in order (policy)' },
  'tool work: symmetry: sides swapped': { families: '*', reason: 'equation sides compared in order (policy)' },
  // 28\% for "what percent"; asNumber does not read a percent sign.
  'percent sign': { families: '*', reason: 'asNumber does not read a percent sign' },
  // x=17 typed into the number box of "Solve x+4=21".
  'variable prefix': { families: '*', reason: 'a number field does not read x=17 (policy)' },
  // y=2+3(x+1)^2 for y=3(x+1)^2+2: the form-preserving comparator refuses any reordering.
  'reordered terms': {
    families: [
      'mm_A2_3A_v2_graph-linear-quadratic-system', 'mm_A2_3A_v2_linear-quadratic-error-repair',
      'mm_A2_4C_v2_reverse-build-from-effects', 'mm_A2_4D_v2_coefficient-table-to-attributes',
      'mm_A2_4D_v2_context-maximum-height', 'mm_A2_4D_v2_factoring-error-repair',
      'mm_A2_4D_v2_negative-maximum-range', 'mm_A2_4D_v2_positive-complete-square',
      'mm_A_6B_v2_error-forgets-square-offset', 'mm_A_6B_v2_graph-to-vertex-equation',
      'mm_A_6B_v2_vertex-point-full-equation', 'mm_A_6B_v2_write-from-vertex-a',
      'mm_A_7C_v2_recover-shift', 'mm_A_7C_v2_reflection',
    ],
    reason: 'vertex form with the constant written first (policy)',
  },
  // What the math editor sends: 3\sqrt{3}, 2(4)^{n-1}, \left|5x-3\right|=-3.
  keypad: {
    families: [
      'mm_A_11A_v2_add-like-radicals', 'mm_A_11A_v2_coefficient-times-radical',
      'mm_A_11A_v2_difference-like-radicals', 'mm_A_11A_v2_error-partial-extraction',
      'mm_A_11A_v2_extract-square-factor', 'mm_A_12D_v2_geometric-decay-terms-to-formula',
      'mm_A_12D_v2_geometric-table-to-formula', 'mm_A2_4F_v2_exact-quadratic-formula',
      'mm_A2_5B_v2_decay-explicit-and-recursive', 'mm_A2_5C_v2_common-natural-log-pair',
      'mm_A2_6E_v2_negative-isolated-error',
    ],
    reason: 'normalizeFormPreservingSide: sqrt(3) loses its parentheses, ^{n-1} is not ^(n-1), |u| is not abs(u)',
  },
  // 5x\\sqrt{x} for 5*x^1*sqrt(x), 1/x for 1/x^1, 3|x|y^{2} for 3*|x|*y^2: the
  // key's x^1 is not read as x, and a product the student never typed × into
  // is not read as one before \\sqrt[n]{ or |x|.
  'keypad implicit product': {
    families: [
      'mm_A_11B_v2_quotient-negative-to-positive', 'mm_A2_7G_v2_square-root-variable-power',
      'mm_A2_7G_v2_cube-root-variable-power', 'mm_A2_7G_v2_rational-exponent-to-indexed-radical',
      'mm_A2_7G_v2_absolute-value-error-full-repair',
    ],
    reason: 'x^1 is not x, and an implicit product before \\sqrt[n]{ or |x| is not read',
  },
  'keypad relation': {
    families: [
      'mm_A2_6F_v2_context-linear-tolerance', 'mm_A2_6F_v2_negative-outside-and-interval',
      'mm_A2_6F_v2_strict-or-two-rays', 'mm_A2_7I_v2_reciprocal-domain-range-exclusions-all-notations',
    ],
    reason: '|u|<=c is not abs(u)<=c; x\\ne -5 is not x!=(-5)',
  },
  // (\frac{1}{2},1) for (0.5,1): an ordered pair is compared as text.
  'fraction coordinates': {
    families: [
      'mm_A2_4D_v2_positive-complete-square', 'mm_A2_5A_v2_exponential-compression-translation-analysis',
      'mm_A2_6A_v2_cubic-combined-symbolic-effects', 'mm_A2_6G_v2_negative-b-point-map',
    ],
    reason: 'ordered pairs compared as text, not coordinate by coordinate',
  },
});

/** Findings that are neither fixed nor known and reported. */
export const unexpectedFindings = (findings) => findings.filter((finding) => {
  if (finding.class !== 'FALSE NEGATIVE') return true;
  const known = KNOWN_OPEN_FALSE_NEGATIVES[finding.kind];
  return !known || (known.families !== '*' && !known.families.includes(finding.id));
});

// --- Twin options: two served options a student cannot tell apart -----------
//
// A choice item is graded by option id, so an option that MEANS the key (the
// same label, or a numeric label with the key's value) is a right answer the
// grader marks wrong. These twins appear only for some parameter values (a = b,
// or 3 ÷ (9/3) beside (9/3) ÷ 3), often well under 1% of draws, so a random
// sample misses them. Where a family's parameter space is small enough it is
// ENUMERATED, every combination the generator could draw; otherwise sampled.

const TWIN_SPACE_CAP = 60000;

/** Every value one generator parameter can take, or null (decimals: sampled). */
const parameterValues = (spec) => {
  const type = String(spec?.type || 'int');
  if (type === 'choice') return Array.isArray(spec.values) && spec.values.length ? spec.values : null;
  if (type !== 'int') return null;
  const minimum = Number(spec?.min);
  const maximum = Number(spec?.max);
  const step = Number.isFinite(Number(spec?.step)) && Number(spec.step) > 0 ? Number(spec.step) : 1;
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) return null;
  const values = [];
  for (let value = minimum; value <= maximum + 1e-9; value += step) {
    if (!(Array.isArray(spec.exclude) && spec.exclude.some((entry) => Number(entry) === value))) values.push(value);
  }
  return values;
};

// The names an expression reads (a call's name is not one).
const expressionNames = (expression) => [...String(expression).matchAll(/[A-Za-z_][A-Za-z0-9_]*(?!\s*\()/g)].map((match) => match[0]);

/**
 * Every filling of `used` (placeholder names) the generator could draw, as
 * scopes, or null when the space is too large. Parameters are enumerated only
 * where they reach `used` through a derived value or share a derived value or a
 * constraint with one that does; the rest cannot change the filled text, so
 * leaving them out loses nothing and keeps the space small.
 */
const parameterSpace = (generator, used) => {
  const parameters = generator?.parameters || {};
  const derived = generator?.derived || {};
  const constraints = Array.isArray(generator?.constraints) ? generator.constraints : [];
  const allNames = Object.keys(parameters);
  const plan = generation.orderDerivedExpressions(allNames, derived);
  if (!allNames.length || plan.reason) return null;
  // Each derived value and each constraint ties its names together.
  const edges = [
    ...Object.entries(derived).map(([name, expression]) => [name, ...expressionNames(expression)]),
    ...constraints.map(expressionNames),
  ];
  const reached = new Set(used);
  for (let grew = true; grew;) {
    grew = false;
    for (const edge of edges) {
      if (!edge.some((name) => reached.has(name)) || edge.every((name) => reached.has(name))) continue;
      edge.forEach((name) => reached.add(name));
      grew = true;
    }
  }
  const names = allNames.filter((name) => reached.has(name));
  const lists = names.map((name) => parameterValues(parameters[name]));
  if (lists.some((list) => !list)) return null;
  if (lists.reduce((size, list) => size * list.length, 1) > TWIN_SPACE_CAP) return null;
  const derivedSteps = plan.entries.filter(([name]) => reached.has(name));
  const checks = constraints.filter((expression) => expressionNames(expression).some((name) => reached.has(name)));
  const scopes = [];
  const scope = {};
  const walk = (index) => {
    if (index === names.length) {
      const full = { ...scope };
      for (const [name, expression] of derivedSteps) {
        const value = generation.evaluateExpression(expression, full);
        if (value === null) return;
        full[name] = value;
      }
      if (checks.every((expression) => generation.evaluateExpression(expression, full) === 1)) scopes.push(full);
      return;
    }
    for (const value of lists[index]) { scope[names[index]] = value; walk(index + 1); }
  };
  walk(0);
  return scopes;
};

/** A closed numeric label's value (mathjs), or NaN for anything with letters, pairs, words. */
const optionValueCache = new Map();
const optionValue = (label) => {
  if (!optionValueCache.has(label)) optionValueCache.set(label, closedValue(label));
  return optionValueCache.get(label);
};
const closedValue = (label) => {
  const text = String(label ?? '').trim().replace(/^\$|\$$/g, '');
  if (!text || text.includes('$')) return NaN;
  const expression = toMathjs(text);
  if (expression == null) return NaN;
  const symbols = symbolsOf(expression);
  if (!symbols || symbols.length) return NaN;
  return evaluateAt(expression, {});
};

/** Twins in one filled question: same label anywhere, or a non-key option worth the key. */
const optionTwins = (question) => {
  const twins = [];
  const fields = Array.isArray(question.responseFields) ? question.responseFields : [];
  const lists = [
    { options: question.choices || [], keys: fields.filter((field) => !(field.choices?.length) && field.inputProfile === 'choice').map((field) => String(field.expected)) },
    ...fields.filter((field) => field.choices?.length).map((field) => ({ options: field.choices, keys: [String(field.expected)] })),
  ];
  for (const { options, keys } of lists) {
    const labels = options.map((option) => authoredLabel(option).replace(/\s+/g, ''));
    if (new Set(labels).size !== labels.length) {
      twins.push({ kind: 'same label', labels: options.map(authoredLabel) });
      continue;
    }
    for (const key of keys) {
      const keyOption = options.find((option, index) => authoredId(option, index) === key);
      const keyValue = keyOption ? optionValue(authoredLabel(keyOption)) : NaN;
      if (!Number.isFinite(keyValue)) continue;
      const same = options.filter((option, index) => authoredId(option, index) !== key
        && Math.abs(optionValue(authoredLabel(option)) - keyValue) <= 1e-9 * Math.max(1, Math.abs(keyValue)));
      if (same.length) twins.push({ kind: 'same value as the key', labels: [authoredLabel(keyOption), ...same.map(authoredLabel)] });
    }
  }
  return twins;
};

/**
 * Every served option twin in the generated choice families: each parameter
 * combination where the space is at most TWIN_SPACE_CAP, else `draws` seeds.
 * Only the option lists and fields are filled per combination (the prompt is
 * not needed to compare options), exactly as the generator substitutes them.
 */
export const duplicateServedOptions = (courses = SCHOOL_COURSES, draws = 120, select = null) => {
  const found = [];
  const coverage = { enumeratedRows: 0, sampledRows: 0, combinations: 0, sampledDraws: 0, sampled: [] };
  for (const courseId of courses) {
    for (const document of compiledCourseDocuments(courseId).documents) {
      if (document.active === false) continue;
      if (select && !select(courseId, document)) continue;
      for (const row of generation.effectivePathVariants(document)) {
        if (!generation.hasPathGenerator(row.template)) continue;
        const text = JSON.stringify(row.template);
        if (!text.includes('"choice"') && !Array.isArray(row.template.choices)) continue;
        const where = { courseId, id: document.id, variant: row.variantIndex };
        // Only the option labels and the choice keys are filled per scope: one
        // flat list of strings, put back into the option lists afterwards.
        const { choices, responseFields } = row.template;
        const lists = [
          { options: choices || [], field: null },
          ...(responseFields || []).filter((field) => field.choices?.length).map((field) => ({ options: field.choices, field })),
        ];
        const choiceFields = (responseFields || []).filter((field) => field.inputProfile === 'choice' || field.choices?.length);
        const strings = [
          ...lists.flatMap(({ options }) => options.map(authoredLabel)),
          ...choiceFields.map((field) => String(field.expected)),
        ];
        const space = row.template.generator?.parameters
          ? parameterSpace(row.template.generator, generation.placeholdersUsed(strings))
          : null;
        if (space) {
          coverage.enumeratedRows += 1;
          coverage.combinations += space.length;
          for (const scope of space) {
            const filled = generation.substitutePlaceholders(strings, scope);
            let next = 0;
            const rebuilt = lists.map(({ options, field }) => ({
              options: options.map((option, index) => ({ id: authoredId(option, index), label: filled[next++] })),
              field,
            }));
            const keys = Object.fromEntries(choiceFields.map((field) => [field.id, filled[next++]]));
            const question = {
              choices: rebuilt[0].options,
              responseFields: choiceFields.map((field) => {
                const own = rebuilt.find((entry) => entry.field === field);
                return { id: field.id, inputProfile: field.inputProfile, expected: keys[field.id], ...(own ? { choices: own.options } : {}) };
              }),
            };
            for (const twin of optionTwins(question)) found.push({ ...where, at: JSON.stringify(scope), ...twin });
          }
          continue;
        }
        coverage.sampledRows += 1;
        coverage.sampled.push(`${document.id}#${row.variantIndex ?? 'base'}`);
        for (let draw = 0; draw < draws; draw += 1) {
          const { question } = generation.generatePathInstance(row.template, `k-sweep-options-${draw}`);
          if (!question) continue;
          coverage.sampledDraws += 1;
          for (const twin of optionTwins(question)) found.push({ ...where, at: `draw ${draw}`, ...twin });
        }
      }
    }
  }
  return { found, checked: coverage.combinations + coverage.sampledDraws, coverage };
};
