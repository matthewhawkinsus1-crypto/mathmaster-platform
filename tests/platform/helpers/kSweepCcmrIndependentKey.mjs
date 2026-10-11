// An answer key recomputed from the prompt a student reads, never from the
// generator that wrote it.
//
// tests/platform/kSweep_ccmrBanks.test.mjs uses this to check the CCMR Path and
// assignment banks (ACT, ASVAB, Digital SAT, TSIA2). Everything here reads the
// RENDERED instance — the prompt text and the option labels after the
// generator filled them in — and does its own mathematics with mathjs. Nothing
// in this file imports a MathMaster grader, generator or answer utility, so a
// generator that writes a wrong key cannot also make this check agree with it.
//
// Two questions are asked of every multiple-choice instance:
//
//   independentKey(prompt, labels)  for the stems it can read (an equivalent
//                                   expression, f(c), an equation solved by
//                                   substitution, an identity, arithmetic),
//                                   which options are right? Null when the
//                                   stem is not one it can read.
//   equivalentOptions(labels, key)  which OTHER options mean the same as the
//                                   key — the same number, the same
//                                   expression, or an equation with the same
//                                   solutions? Such an option is a second
//                                   right answer the grader marks wrong.
//
// A stem it cannot read is skipped and counted, never guessed.

import { create, all } from 'mathjs';

const math = create(all, { number: 'number' });

const FUNCTION_NAMES = ['sqrt', 'nthRoot', 'abs', 'log', 'pi', 'e'];

const braced = (text, open) => {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}') {
      depth -= 1;
      if (!depth) return [text.slice(open + 1, index), index + 1];
    }
  }
  return null;
};

/** One TeX math span (no relation) -> a mathjs expression, or null. */
export const latexToMathjs = (input) => {
  let s = String(input).trim().replace(/^\$|\$$/g, '').replace(/[−–]/g, '-')
    .replace(/\\left|\\right/g, '').replace(/\\[,;! ]/g, '')
    .replace(/\\cdot|\\times/g, '*').replace(/\\div/g, '/').replace(/\\pi/g, 'pi');
  if (/=|<|>|\\[lg]eq?\b|\\ne/.test(s)) return null;
  // 6\frac{1}{5} is a mixed number, not a product.
  s = s.replace(/(^|[^\d.])(\d+)\s*\\[dt]?frac\{(\d+)\}\{(\d+)\}/g, '$1($2+$3/$4)');
  for (let guard = 0; guard < 50; guard += 1) {
    const match = s.match(/\\[dt]?frac\s*\{/);
    if (!match) break;
    const top = braced(s, match.index + match[0].length - 1);
    const bottom = top && s[top[1]] === '{' ? braced(s, top[1]) : null;
    if (!bottom) return null;
    s = `${s.slice(0, match.index)}((${top[0]})/(${bottom[0]}))${s.slice(bottom[1])}`;
  }
  for (let guard = 0; guard < 50; guard += 1) {
    const match = s.match(/\\sqrt\s*(\[[^\]]*\])?\s*\{/);
    if (!match) break;
    const body = braced(s, match.index + match[0].length - 1);
    if (!body) return null;
    s = `${s.slice(0, match.index)}${match[1] ? `nthRoot((${body[0]}),${match[1].slice(1, -1)})` : `sqrt(${body[0]})`}${s.slice(body[1])}`;
  }
  s = s.replace(/\|([^|]+)\|/g, 'abs($1)');
  s = s.replace(/\^\{/g, '^(').replace(/\{/g, '(').replace(/\}/g, ')').replace(/\[/g, '(').replace(/\]/g, ')');
  if (/\\/.test(s)) return null;
  s = s.replace(/(\d)\s*\(/g, '$1*(')
    .replace(/\)\s*([\w(])/g, ')*$1')
    .replace(/(^|[^a-zA-Z])([a-zA-Z])\s*\(/g, (whole, before, letter) => (letter === 'e' ? whole : `${before}${letter}*(`))
    .replace(/(\d)([a-zA-Z])/g, '$1*$2')
    .replace(/(sqrt|nthRoot|abs|log)\*\(/g, '$1(');
  // xy is x*y: a run of letters that names no function is a product.
  s = s.replace(/[a-zA-Z]{2,}/g, (word) => (FUNCTION_NAMES.includes(word) ? word : word.split('').join('*')));
  return s;
};

const evalAt = (expression, scope) => {
  try {
    const value = math.evaluate(expression, { ...scope });
    return typeof value === 'number' ? value : NaN;
  } catch {
    return NaN;
  }
};

const symbolsOf = (expression) => {
  try {
    return [...new Set(math.parse(expression).filter((node) => node.isSymbolNode).map((node) => node.name))]
      .filter((name) => !FUNCTION_NAMES.includes(name));
  } catch {
    return null;
  }
};

const close = (a, b) => Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b));

// Five rounds of values, unrelated across letters (an FNV hash of the letter
// and the round), so x - y is not the same number every round.
const ROUNDS = [0, 1, 2, 3, 4];
const sampleScope = (names, round) => Object.fromEntries(names.map((name) => {
  let hash = 2166136261 ^ (round * 7919);
  for (const ch of `${name}#${round}`) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return [name, 0.41 + ((hash % 100003) / 100003) * 5.3];
}));

const sameExpression = (a, b) => {
  const names = [...new Set([...(symbolsOf(a) || []), ...(symbolsOf(b) || [])])];
  if (!symbolsOf(a) || !symbolsOf(b)) return null;
  let compared = 0;
  for (const round of ROUNDS) {
    const scope = sampleScope(names, round);
    const x = evalAt(a, scope);
    const y = evalAt(b, scope);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    compared += 1;
    if (!close(x, y)) return false;
  }
  return compared >= 2 ? true : null;
};

/** l1 - r1 is a nonzero constant multiple of l2 - r2: the same solutions. */
const sameEquation = (a, b) => {
  const names = [...new Set([...(symbolsOf(a) || []), ...(symbolsOf(b) || [])])];
  let ratio = null;
  let compared = 0;
  for (const round of ROUNDS) {
    const scope = sampleScope(names, round);
    const x = evalAt(a, scope);
    const y = evalAt(b, scope);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (Math.abs(y) < 1e-12) {
      if (Math.abs(x) > 1e-12) return false;
      continue;
    }
    compared += 1;
    if (ratio === null) ratio = x / y;
    else if (!close(x / y, ratio)) return false;
  }
  return compared >= 2 && ratio !== 0;
};

/** A choice label that names a number ('$\\$44$', '$-\\frac{3}{4}$', '$1,250$'), or NaN. */
export const numericOf = (label) => {
  const expression = latexToMathjs(String(label).replace(/\\\$/g, '').replace(/,(?=\d{3}\b)/g, ''));
  if (expression == null) return NaN;
  const names = symbolsOf(expression);
  if (!names || names.length) return NaN;
  return evalAt(expression, {});
};

const mathSpans = (prompt) => [...String(prompt).matchAll(/\$([^$]+)\$/g)].map((match) => match[1]);
const isMathLabel = (label) => /^\$[^$]+\$$/.test(String(label).trim());

/**
 * The other options that mean the same as the key. Returns
 * { kind: 'numeric' | 'expression' | 'equation' | null, equivalent: [index] };
 * kind null means the options are not all of one comparable kind.
 */
export const equivalentOptions = (labels, keyIndex) => {
  const values = labels.map(numericOf);
  if (values.every(Number.isFinite)) {
    return { kind: 'numeric', equivalent: values.flatMap((value, index) => (index !== keyIndex && close(value, values[keyIndex]) ? [index] : [])) };
  }
  if (!labels.every(isMathLabel)) return { kind: null, equivalent: [] };
  const expressions = labels.map((label) => latexToMathjs(String(label).replace(/\\\$/g, '')));
  if (expressions.every((expression) => expression && symbolsOf(expression)?.length)) {
    return { kind: 'expression', equivalent: expressions.flatMap((expression, index) => (index !== keyIndex && sameExpression(expression, expressions[keyIndex]) === true ? [index] : [])) };
  }
  const equations = labels.map((label) => {
    const match = String(label).trim().match(/^\$([^$=<>]+)=([^$=<>]+)\$$/);
    if (!match) return null;
    const left = latexToMathjs(match[1]);
    const right = latexToMathjs(match[2]);
    return left && right ? `(${left})-(${right})` : null;
  });
  if (equations.every(Boolean)) {
    return { kind: 'equation', equivalent: equations.flatMap((equation, index) => (index !== keyIndex && sameEquation(equation, equations[keyIndex]) ? [index] : [])) };
  }
  return { kind: null, equivalent: [] };
};

// Prompt words that add a condition this reader does not model. A stem that
// carries one is skipped rather than read without the condition.
const UNMODELLED_CONDITION = /greater|greatest|lesser|least|smaller|larger|positive|negative|integer|for \$x\s*[<>]|\\[lg]e|\\ne|<|>|\bnot\b|closest|approximately|nearest|round|short|testing|over by|instead/i;
const GEOMETRIC_CONDITION = /\b(parallel|perpendicular|intercept|tangent|horizontal|vertical|slope|exactly one|solutions? \d|same line|intersect|side length|perfect|real)\b/i;

/**
 * Which options are right for this prompt, recomputed from the prompt alone.
 * Returns { solver, expected: [index] } or null when the stem is not readable.
 * For a student-produced response pass the key as the single label.
 */
export const independentKey = (prompt, labels) => {
  const p = String(prompt);
  // An equivalent expression.
  let match = p.match(/Which (?:expression|of the following) (?:is equivalent to|equals) \$([^$]+)\$\s*\?/i);
  if (match) {
    const target = latexToMathjs(match[1]);
    if (!target) return null;
    const verdicts = labels.map((label) => {
      const expression = latexToMathjs(label);
      return expression ? sameExpression(target, expression) : null;
    });
    if (verdicts.some((verdict) => verdict === null)) return null;
    return { solver: 'equivalent-expression', expected: verdicts.flatMap((verdict, index) => (verdict ? [index] : [])) };
  }
  // f(c) for one stated f.
  match = p.match(/\$f\(x\)\s*=\s*([^$]+)\$[^?]*?what is \$f\(\s*(-?[\d.]+)\s*\)\$\s*\?/i);
  if (match && (p.match(/\$f\(x\)\s*=/g) || []).length === 1 && !/\$g\(x\)/.test(p) && !/for \$?x\s*[<>\\]/i.test(p)) {
    const expression = latexToMathjs(match[1]);
    const names = expression && symbolsOf(expression);
    if (!names || names.some((name) => name !== 'x')) return null;
    const value = evalAt(expression, { x: Number(match[2]) });
    const values = labels.map(numericOf);
    if (!Number.isFinite(value) || values.some((entry) => !Number.isFinite(entry))) return null;
    return { solver: 'function-value', expected: values.flatMap((entry, index) => (close(entry, value) ? [index] : [])) };
  }
  // Givens, function definitions and equations read from the math spans; an
  // option is right when every equation holds with it (an identity at every
  // sampled value of the letters left over).
  match = p.match(/(?:what is the value of|what is|value of) \$([^$]+)\$\s*(?:\?|satisfies)/i)
    || p.match(/What is the solution to \$([^$]+)\$\s*\?/i);
  if (match) {
    const unconditioned = p.replace(/for \$x\s*\\ne\s*-?\d*\$,?/gi, '');
    if (UNMODELLED_CONDITION.test(unconditioned)) return null;
    const functions = {};
    const givens = {};
    const equations = [];
    let target = match[1];
    if (/solution to/i.test(match[0])) {
      equations.push(target);
      target = null;
    }
    for (const span of mathSpans(p)) {
      if (span === match[1]) continue;
      const definition = span.match(/^\s*([a-zA-Z])\(([a-z])\)\s*=\s*([^=]+)$/);
      if (definition) {
        const expression = latexToMathjs(definition[3]);
        if (!expression) return null;
        functions[definition[1]] = { variable: definition[2], expression };
        continue;
      }
      const given = span.match(/^\s*([a-zA-Z])\s*=\s*(-?\d+(?:\.\d+)?)\s*$/);
      if (given) {
        givens[given[1]] = Number(given[2]);
        continue;
      }
      if (/=/.test(span)) {
        equations.push(span);
        continue;
      }
      // A math span that is not a lone letter or a point is context this
      // reader does not understand.
      if (/[a-zA-Z]/.test(span) && !/^\s*[a-zA-Z]\s*$/.test(span) && !/^\(\s*-?\d+\s*,\s*-?\d+\s*\)$/.test(span)) return null;
    }
    const functionScope = {};
    for (const [name, definition] of Object.entries(functions)) {
      functionScope[name] = (value) => evalAt(definition.expression, { ...functionScope, ...givens, [definition.variable]: value });
    }
    const functionNames = Object.keys(functions);
    const convert = (text) => {
      let expression = latexToMathjs(text);
      if (!expression) return null;
      for (const name of functionNames) expression = expression.replace(new RegExp(`\\b${name}\\*\\(`, 'g'), `${name}(`);
      return expression;
    };
    const parsed = [];
    for (const equation of equations) {
      const sides = equation.split('=');
      if (sides.length !== 2) return null;
      const left = convert(sides[0]);
      const right = convert(sides[1]);
      if (!left || !right) return null;
      parsed.push([left, right]);
    }
    const unknownsOf = (expression) => (symbolsOf(expression) || ['?']).filter((name) => !(name in givens) && !functionNames.includes(name));
    const values = labels.map((label) => numericOf(String(label).replace(/^\$\s*[a-z]\s*=\s*/, '$')));
    if (values.some((value) => !Number.isFinite(value))) return null;
    if (target && !/^\s*[a-zA-Z]\s*$/.test(target)) {
      const expression = convert(target);
      if (!expression || unknownsOf(expression).length || parsed.length) return null;
      const value = evalAt(expression, { ...functionScope, ...givens });
      if (!Number.isFinite(value)) return null;
      return { solver: 'evaluate', expected: values.flatMap((entry, index) => (close(entry, value) ? [index] : [])) };
    }
    if (!parsed.length) return null;
    const free = [...new Set(parsed.flatMap(([left, right]) => [...unknownsOf(left), ...unknownsOf(right)]))];
    const asked = target ? target.trim() : (free.length === 1 ? free[0] : null);
    if (!asked || !free.includes(asked) || free.includes('?')) return null;
    const others = free.filter((name) => name !== asked);
    if (others.length && !/for all values of|\bequivalent\b|^For \$x\s*\\ne\s*-?\d+\$,|^The product \$/i.test(p)) return null;
    if (!others.length && GEOMETRIC_CONDITION.test(p)) return null;
    const holds = (candidate) => {
      let compared = 0;
      for (const round of ROUNDS) {
        const scope = { ...functionScope, ...givens, ...sampleScope(others, round), [asked]: candidate };
        for (const [left, right] of parsed) {
          const l = evalAt(left, scope);
          const r = evalAt(right, scope);
          if (!Number.isFinite(l) || !Number.isFinite(r)) continue;
          compared += 1;
          if (!close(l, r)) return false;
        }
        if (!others.length) break;
      }
      return compared > 0;
    };
    return { solver: others.length ? 'identity' : 'substitution', expected: values.flatMap((value, index) => (holds(value) ? [index] : [])) };
  }
  return null;
};
