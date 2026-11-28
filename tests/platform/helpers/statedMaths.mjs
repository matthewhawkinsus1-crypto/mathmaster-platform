/*
 * WHAT A WORKED EXAMPLE STATES, READ AS MATHEMATICS (the examples maths audit,
 * tests/platform/workedExampleMathsAudit.test.mjs).
 *
 *   statedChains(text)        → [{ pieces, ops, truth, source }]  each "A = B = C", "A < B" a sentence states
 *   evaluator(plain, options) → { letters, calls, at(scope) } | null   mathjs, real roots and powers
 *   functionsDefined(text)    → { f: { variable: 'x', body: '2x + 1' } }   "f(x) = 2x + 1" in a prompt
 *   answerValues(text)        → { x: [4] } / { x: [−7, −5] } / { x: [2], y: [3] }
 *   relationHolds(op, a, b)   → boolean
 *
 * It reads the text a student reads: LaTeX in $…$ and plain mathematics
 * (x², √(x + 4), ⁵√32, −3/4, f⁻¹(x), (f ∘ g)(2), log₂(x − 1)) alike. Nothing
 * of a family's own arithmetic is reused, so a wrong step shows up as two
 * different numbers.
 */
import { create, all } from 'mathjs';

const math = create(all);
const realRoot = (value, index) => {
  if (value < 0) return index % 2 === 1 ? -((-value) ** (1 / index)) : Number.NaN;
  return value ** (1 / index);
};
const realPow = (value, p, q) => realRoot(value, q) ** p;
const realLog2 = (value) => (value > 0 ? Math.log2(value) : Number.NaN);
const realSqrtOnly = (value) => (value >= 0 ? Math.sqrt(value) : Number.NaN);
math.import({ realRoot, realPow, realLog2, realSqrtOnly }, { override: true });

const SUPERSCRIPT = Object.freeze({ '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-' });
const sup = (run) => [...run].map((character) => SUPERSCRIPT[character]).join('');

/** LaTeX as plain mathematics: \frac{a}{b} → ((a)/(b)), \sqrt[n]{a} → ⁿ√(a), ^{n} → ^(n). */
export const latexToPlain = (latex) => {
  let out = String(latex)
    // "0 \not> 2": the relation, said to be false.
    .replace(/\\not\s*(>|<|=|\\geq?|\\leq?)(.*)$/, (match, op, rest) => `${op}${rest} is false`)
    .replace(/\\left|\\right|\\,|\\;|\\!|\\quad|\\qquad/g, ' ')
    .replace(/\\(?:text|mathrm|operatorname)\{([^{}]*)\}/g, ' $1 ')
    .replace(/\\cdot|\\times/g, '·')
    .replace(/\\div/g, '÷')
    .replace(/\\le(?:q)?(?![a-z])/g, '≤').replace(/\\ge(?:q)?(?![a-z])/g, '≥')
    .replace(/\\neq?(?![a-z])/g, '≠').replace(/\\approx/g, '≈').replace(/\\pm/g, '±')
    .replace(/\\infty/g, '∞').replace(/\\circ/g, '∘').replace(/\\cup/g, '∪');
  for (let guard = 0; guard < 8; guard += 1) {
    const before = out;
    out = out
      .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))')
      .replace(/\\sqrt\[(\d+)\]\{([^{}]*)\}/g, 'Ω$1Ω($2)')
      .replace(/\\sqrt\{([^{}]*)\}/g, 'Ω2Ω($1)')
      .replace(/\^\{([^{}]*)\}/g, '^($1)')
      .replace(/_\{([^{}]*)\}/g, '_$1')
      .replace(/\{([^{}]*)\}/g, '($1)');
    if (out === before) break;
  }
  return out.replace(/\\[a-zA-Z]+/g, ' ').replace(/Ω(\d+)Ω/g, (match, index) => (index === '2' ? '√' : `${[...index].map((d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d]).join('')}√`));
};

/** The mathematics of a sentence as plain text: $…$ read as LaTeX, the rest as written. */
export const plainOf = (text) => String(text).replace(/\$([^$]+)\$/g, (match, latex) => ` ${latexToPlain(latex)} `);

/**
 * Plain mathematics as a mathjs expression, or null where it is not one.
 * `functions` names the letters that are functions here (f, g, E…): "f(x)" is
 * then a call, not f times x, and "f⁻¹" is the function finv_f.
 */
export const toMathjs = (plain, { functions = [] } = {}) => {
  const named = new Set(functions);
  let out = String(plain).replace(/−|–/g, '-').replace(/·|×/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
  if (!out || /[=<>≤≥≠≈±∞,;:!?∪∩{}[\]→]/.test(out)) return null;
  out = out.replace(/log₂/g, 'Λ');
  // Each function gets a Greek letter of its own (α…: f, g…; ι…: f⁻¹…), so
  // nothing below takes its name for a variable to multiply.
  const names = [...named].filter((name) => /^[A-Za-z]$/.test(name));
  const mark = (name) => 'αβγδεζηθ'[names.indexOf(name)];
  const inverse = (name) => 'ικλμνξοπ'[names.indexOf(name)];
  out = out.replace(/([A-Za-z])⁻¹(?=\()/g, (match, name) => (named.has(`${name}⁻¹`) && names.includes(name) ? inverse(name) : match));
  out = out.replace(/([A-Za-z])(?=\()/g, (match, name) => (names.includes(name) ? mark(name) : match));
  // (f ∘ g)(a) → f(g(a)); (f + g)(a), (f − g)(a), (f * g)(a), (f / g)(a) → (f(a) op g(a)).
  const callNamed = (letter) => (names.includes(letter) ? mark(letter) : null);
  out = out.replace(/\(([A-Za-z])∘([A-Za-z])\)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, (match, f, g, a) => (callNamed(f) && callNamed(g) ? `${mark(f)}(${mark(g)}(${a}))` : match));
  out = out.replace(/\(([A-Za-z])([+\-*/])([A-Za-z])\)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, (match, f, op, g, a) => (callNamed(f) && callNamed(g) ? `(${mark(f)}(${a})${op}${mark(g)}(${a}))` : match));
  if (/∘/.test(out)) return null;
  out = out.replace(/\|([^|]+)\|/g, 'Α($1)');
  out = out.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]*)√|∛|∜/g, (match, index) => `Ω${match === '∛' ? 3 : match === '∜' ? 4 : index ? sup(index) : 2}Ω`);
  // A root's radicand: the bracket after it, matched to its own close, or a run of letters and digits.
  for (let guard = 0; guard < 8 && /Ω\d+Ω/.test(out); guard += 1) {
    const at = out.search(/Ω\d+Ω/);
    const head = /^Ω(\d+)Ω/.exec(out.slice(at));
    const start = at + head[0].length;
    let end = start;
    if (out[start] === '(') {
      let depth = 0;
      for (; end < out.length; end += 1) {
        if (out[end] === '(') depth += 1;
        if (out[end] === ')') { depth -= 1; if (depth === 0) break; }
      }
      if (depth !== 0) return null;
      end += 1;
    } else {
      end = start + (/^[a-z0-9.]+/.exec(out.slice(start))?.[0].length || 0);
    }
    if (end === start) return null;
    const radicand = out.slice(start, end);
    const call = head[1] === '2' ? `Σ(${radicand})` : `Ρ(${radicand},${head[1]})`;
    out = out.slice(0, at) + call + out.slice(end);
  }
  if (/Ω|√/.test(out)) return null;
  out = out.replace(/(\([^()]*\)|[a-z]|\d+)\^\((-?\d+)\/(\d+)\)/g, (match, base, p, q) => `Π(${base},${p},${q})`);
  out = out.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (run) => `^(${sup(run)})`);
  if (/[^a-z0-9.,+\-*/^()ΡΠΑΣΛα-θι-π]/.test(out)) return null;
  // Side by side multiplies: 2x, x y, 3(…), )(, x√…, 2f(x).
  out = out.replace(/([a-z0-9.)])(?=[a-zΡΠΑΣΛα-θι-π(])/g, '$1*').replace(/([a-z)])(?=[0-9])/g, '$1*');
  out = out.replace(/[α-θ]/g, (character) => `fn_${names['αβγδεζηθ'.indexOf(character)]}`).replace(/[ι-π]/g, (character) => `finv_${names['ικλμνξοπ'.indexOf(character)]}`);
  out = out.replace(/Ρ\(/g, 'realRoot(').replace(/Π\(/g, 'realPow(').replace(/Α\(/g, 'abs(').replace(/Σ\(/g, 'realSqrtOnly(').replace(/Λ\(/g, 'realLog2(');
  if (/[ΡΠΑΣΛΦΨ]/.test(out)) return null;
  try {
    math.parse(out);
  } catch {
    return null;
  }
  return out;
};

const RESERVED = /realRoot|realPow|realSqrtOnly|realLog2|abs|fn_[A-Za-z]|finv_[A-Za-z]/g;
/** A compiled evaluator for plain mathematics, or null. `calls` lists the functions it calls. */
const COMPILED = new Map();
export const evaluator = (plain, options = {}) => {
  // The same text is read many times over (every grid point of a range): compile it once.
  const key = `${(options.functions || []).join(',')}|${plain}`;
  if (!COMPILED.has(key)) COMPILED.set(key, compile(plain, options));
  return COMPILED.get(key);
};
const compile = (plain, options) => {
  const source = toMathjs(plain, options);
  if (!source) return null;
  try {
    const compiled = math.compile(source);
    const letters = [...new Set((source.replace(RESERVED, '').match(/[a-z]/g) || []))];
    const calls = [...new Set((source.match(/fn_[A-Za-z]|finv_[A-Za-z]/g) || []))];
    return { source, letters, calls, at: (scope) => { try { const value = compiled.evaluate({ ...scope }); return typeof value === 'number' ? value : Number(value); } catch { return Number.NaN; } } };
  } catch {
    return null;
  }
};

// One side of a relation: where a run of mathematics stops (a word of two or
// more letters, or a capitalised word).
const WORD = /^[A-Za-z]{2,}$/;
const isMathToken = (token) => Boolean(token) && !WORD.test(token.replace(/[.,]$/, '')) && !/^(?:a|I|A)$/.test(token)
  && /^[\d.+\-−*/^()a-zA-Z√∛∜⁰¹²³⁴⁵⁶⁷⁸⁹⁻·×÷|∘₂ΡΠΩ]+$/.test(token.replace(/[.,]$/, '').replace(/log₂/g, ''));
const trailingMath = (piece) => {
  const tokens = piece.trim().split(/\s+/);
  const kept = [];
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    // "a" straight before the sign is the letter a ("a = −4"), anywhere else the word.
    const letterA = tokens[index] === 'a' && index === tokens.length - 1;
    if ((!isMathToken(tokens[index]) && !letterA) || /[.,]$/.test(tokens[index])) break;
    kept.unshift(tokens[index]);
    if (letterA) break;
  }
  return kept.join(' ');
};
const leadingMath = (piece) => {
  const tokens = piece.trim().split(/\s+/);
  const kept = [];
  for (const token of tokens) {
    const clean = token.replace(/[.,?]$/, '');
    if (!isMathToken(clean)) break;
    kept.push(clean);
    if (clean !== token) break;
  }
  return kept.join(' ');
};

const OPS = /(=|<|>|≤|≥|≠)/;
/**
 * Every chain of relations a sentence states: "A = B = C", "A < B is true".
 * Clauses are split where a sentence moves on (":", ";", ", ", ". ", "so",
 * "and", "then", "which", "gives", "or", "but"), so "x = 3, so y = 5" states
 * two things, not "3, so y". A chain whose middle holds words is cut there.
 * `truth` is what the sentence says of it: true, false or null (not said).
 */
export const statedChains = (text) => {
  const found = [];
  const clauses = plainOf(text).split(/[:;]|,\s|\.\s|\.$|\bOR\b|\b(?:so|and|then|which|because|gives|giving|or|but|into|in|when|where|if|means|with|from|to|on|of|at|for|over|while|until|since)\b/);
  clauses.forEach((clause) => {
    const truth = /\bis\s+true\b|\btrue\b/.test(clause) ? true : /\bis\s+false\b|\bfalse\b/.test(clause) ? false : null;
    const body = clause.replace(/\bis\s+(?:true|false)\b/g, ' ');
    const parts = body.split(OPS);
    if (parts.length < 3) return;
    const pieces = [];
    const ops = [];
    for (let index = 0; index < parts.length; index += 2) {
      const raw = parts[index];
      let piece;
      if (index === 0) piece = trailingMath(raw);
      else if (index === parts.length - 1) piece = leadingMath(raw);
      else piece = leadingMath(raw) === raw.trim().replace(/[.,]$/, '') ? raw.trim() : null;
      pieces.push(piece);
      if (index + 1 < parts.length) ops.push(parts[index + 1]);
    }
    found.push({ pieces, ops, truth, source: clause.trim() });
  });
  return found;
};

/** The pairs of neighbours in each chain where both sides read as mathematics. */
export const statedPairs = (text) => statedChains(text).flatMap(({ pieces, ops, truth, source }) => ops.map((op, index) => ({
  left: pieces[index], op, right: pieces[index + 1], truth: ops.length === 1 ? truth : null, source,
})).filter((pair) => pair.left && pair.right));

export const relationHolds = (op, a, b, tolerance = 1e-9) => {
  const close = Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
  if (op === '=') return close;
  if (op === '≠') return !close;
  if (op === '<') return a < b && !close;
  if (op === '>') return a > b && !close;
  if (op === '≤') return a < b || close;
  if (op === '≥') return a > b || close;
  return false;
};

/** "f(x) = 2x + 1", "E(s) = 0.1s + 2950", "P(x) = x³ − 2x² …" in a prompt: { f: { variable, body } }. */
export const functionsDefined = (text) => {
  const defined = {};
  const plain = plainOf(text);
  for (const match of plain.matchAll(/(?:^|[^A-Za-z₀-₉ₙ])([A-Za-z])\(([a-z])\)\s*=\s*/g)) {
    const body = leadingMath(plain.slice(match.index + match[0].length).replace(/\s+(?=[-−+])/g, ' '));
    if (!body || match[1] in defined) continue;
    defined[match[1]] = { variable: match[2], body };
  }
  return defined;
};

/** The values an answer gives its letters: "x = 4", "x = −7 or x = −5", "(x, y) = (2, 3)", "(2, 3)". */
export const answerValues = (text, { pairLetters = null } = {}) => {
  const values = {};
  const plain = plainOf(text).replace(/−/g, '-');
  const read = (value) => { const [top, bottom] = value.split('/').map(Number); return bottom ? top / bottom : top; };
  for (const match of plain.matchAll(/(?:^|[^A-Za-z(])([a-z])\s*=\s*(-?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?)(?![\d.]*(?:[a-z(]|\s*[-+*/^·×÷]))/g)) {
    (values[match[1]] ||= []).push(read(match[2].replace(/\s+/g, '')));
  }
  const pair = /\(\s*([a-z])\s*,\s*([a-z])\s*\)\s*=\s*\(\s*(-?[\d./]+)\s*,\s*(-?[\d./]+)\s*\)/.exec(plain);
  if (pair) {
    values[pair[1]] = [read(pair[3])];
    values[pair[2]] = [read(pair[4])];
  } else if (pairLetters) {
    const bare = /^\s*\(\s*(-?[\d./]+)\s*,\s*(-?[\d./]+)\s*\)\s*$/.exec(plain);
    if (bare) {
      values[pairLetters[0]] = [read(bare[1])];
      values[pairLetters[1]] = [read(bare[2])];
    }
  }
  return values;
};

export const agree = (a, b, tolerance = 1e-9) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));
