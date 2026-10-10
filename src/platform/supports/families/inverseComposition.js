// Question family: inverse functions and composition: inverseCompositionLab, functionOperationsLab, and multiAnswer inverse/composition items (teacher-import-jsons L3_Inverse, L4_Composition).
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
//   workedSolution(question)     → { headline, steps: [text], answerSummary } | null
//                                  THIS question's worked solution, for the closed-question
//                                  review only (it states the answer); null when any part
//                                  cannot be explained exactly — see the section at the end
// `implemented` stays false until the family is real: the index skips it.
//
// WHAT THIS FAMILY OWNS (seventh in the index order; the families before it
// own equations, systems, lines/slope, fractions, points/intervals and
// function features, and none of them claims these shapes —
// functionFeatures and linesAndSlope say so in their own headers):
//
//   lab          the `inverseCompositionLab` registry tool in its four lab
//                views (full, composition, inverse, restriction), read with
//                the same helpers its shared grader marks with
//                (inverseCompositionMath.mjs): the same default f and g, the
//                same input x, the same parts per view, the same restriction
//                choice.
//   derive       `inverseCompositionLab` mode deriveInverse: swap x and y in
//                y = f(x), then isolate y (the derivation lab).
//   ops          the `functionOperationsLab` registry tool: the key is the one
//                deriveFunctionOperations gives the grader (the same
//                normalized operations and composition order).
//   multiAnswer  items whose fields ARE inverse / composition / operation
//                work, recognised by their field labels and prompt (no
//                platform question family covers these yet):
//                  linearInverse      f⁻¹(x) of a linear rule (and its slope,
//                                     a check statement, a value in context)
//                  inverseRelation    swap the pairs of a relation
//                  inverseProperty    f(a) = b ⇒ f⁻¹(b) = a; a point on y = x
//                  inverseGraph       y = x as the mirror line of inverse graphs
//                  operations         (f + g)(x), (f − g)(x), (f·g)(x), (f/g)(x),
//                                     the excluded value, the product's degree
//                  pointwise          (f + g)(a) from given values
//                  compositionValues  f(g(a)) from given values
//                  contextComposition t(r(a)) from given rules
//                  compositionSymbolic (f∘g)(x), (g∘f)(x)
//                  inverseVerification "are f and g inverses?" by composing
//                A multiAnswer item with none of those fields (a domain and
//                range review, a bare evaluation) is not claimed.
//
// HOW IT STAYS SAFE.
//   - expectedValues lists what the student must FIND, in every spelling a
//     hint could use: each field's key with Unicode and ASCII minus, with and
//     without spaces, x² and x^2; the value this module computes for the field
//     (the inverse rule, a composition, a sum, an excluded input, a value of
//     f⁻¹) in the same spellings; numbers as integers, decimals and fractions;
//     the lab's numeric parts and its restriction choice (id and label).
//   - Every hint is written in two or three spellings, from one that quotes
//     this problem's own rules and numbers to a plain one that names the move
//     without them; the first spelling that contains none of this question's
//     answers (hintRevealsAnswer — the platform's own guard — against
//     expectedValues plus every plain key) is used. No hint states an inverse
//     rule, a composition, a value, an excluded input or a verdict. Words a
//     verdict could be read from (yes / no, left / right / none / required,
//     "the reflection line") are never written in a hint, so which hints are
//     shown never depends on which verdict is right. An "are they inverses?"
//     item's answers are "x" and yes/no, so its hints rewrite both rules in a
//     letter u and never write a bare x at all, whatever the verdict.
//   - The worked sibling is the same task on new numbers, drawn in an order set
//     by the seed and the question's visible numbers, and offered only when
//     its prompt, every step and its answer avoid this question's answers
//     (the platform's own checks, run here first); its answer is computed, not
//     copied. An "are they inverses?" sibling uses the letter t, and whether it
//     is an inverse pair is decided by the seed alone, never by this
//     question's verdict.
//   - backUpQuestion asks about the first MOVE (which function acts first,
//     which step of f to undo first, which number of a pair is the input),
//     never a value; its option order follows the visible problem.
//
// Pure: no React, no I/O.
import { hintRevealsAnswer } from '../../../../functions/shared/pathSolutionSupport.mjs';
import { answerCandidatesForField, matchesFieldAnswer } from '../../../../functions/shared/answerUtils.mjs';
import { exactFractionText } from '../../../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  composeValue,
  evaluateSpecWithDomain,
  expectedInverseRestriction,
  hasFunctionalInverse,
  inverseLabFunctions,
  inverseLabInitialX,
  inverseLabInputLocked,
  inverseLabRequiredParts,
  inverseLabRoundTrip,
} from '../../../../functions/shared/toolMath/inverseComposition/inverseCompositionMath.mjs';
import {
  deriveFunctionOperations,
  normalizeComposeOrder,
  normalizeFunctionOperations,
  polynomialCoefficientsFromFunction,
} from '../../../../functions/shared/toolMath/functionOperations/functionOperationsMath.mjs';

export const family = 'inverseComposition';
export const implemented = true;

/* ------------------------------------------------------------ basics */

const MINUS = '−';
const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const tidy = (value) => {
  const rounded = Math.round(Number(value) * 1e9) / 1e9;
  return Object.is(rounded, -0) ? 0 : rounded;
};
const typeOf = (question) => text(question?.type || question?.toolId);

/** A number as a student reads it: Unicode minus, a short decimal or a fraction. */
const numText = (value) => {
  const raw = tidy(value);
  if (!Number.isFinite(raw)) return '';
  const v = Math.abs(raw - Math.round(raw)) < 1e-8 ? Math.round(raw) : raw;
  const magnitude = Math.abs(v);
  const body = Number.isInteger(magnitude) || String(magnitude).split('.')[1]?.length <= 4
    ? String(magnitude)
    : exactFractionText(magnitude);
  return v < 0 ? `${MINUS}${body}` : body;
};
// A number substituted into an expression: a negative one in parentheses.
const sub = (value) => (tidy(value) < 0 ? `(${numText(value)})` : numText(value));

/** Every spelling of a number a hint could contain. */
const numberForms = (value) => {
  const v = tidy(value);
  if (!Number.isFinite(v)) return [];
  const out = new Set();
  const add = (raw) => {
    out.add(raw);
    if (raw.startsWith('-')) out.add(`${MINUS}${raw.slice(1)}`);
  };
  add(String(v));
  if (!Number.isInteger(v)) {
    add(String(Math.round(v * 100) / 100));
    add(String(Math.round(v * 1000) / 1000));
    add(exactFractionText(v));
  }
  return [...out];
};

/** Every spelling of a written answer: minus signs, spacing, powers. */
const spellings = (raw) => {
  const base = text(raw);
  if (!base) return [];
  const compact = base.replace(/\s+/g, '');
  const spaced = compact.replace(/([0-9A-Za-z²³)])([+\-−])/g, '$1 $2 ');
  const out = new Set([base]);
  [base, compact, spaced].forEach((form) => {
    const ascii = form.replace(/[−–]/g, '-');
    const unicode = form.replace(/-/g, MINUS);
    [form, ascii, unicode].forEach((variant) => {
      out.add(variant);
      out.add(variant.replace(/²/g, '^2').replace(/³/g, '^3'));
      out.add(variant.replace(/\^2/g, '²').replace(/\^3/g, '³'));
    });
  });
  return [...out];
};

/* -------------------------------------------- polynomials (ascending) */

const P = {
  // Full precision inside (1/3 stays 1/3); numbers are rounded only when shown.
  trim: (p) => {
    const out = p.map(Number);
    while (out.length > 1 && Math.abs(out[out.length - 1]) < 1e-9) out.pop();
    return out.length ? out : [0];
  },
  add: (a, b) => P.trim(Array.from({ length: Math.max(a.length, b.length) }, (_, index) => (a[index] || 0) + (b[index] || 0))),
  neg: (a) => a.map((c) => -c),
  sub: (a, b) => P.add(a, P.neg(b)),
  mul: (a, b) => {
    const out = Array(a.length + b.length - 1).fill(0);
    a.forEach((x, i) => b.forEach((y, j) => { out[i + j] += x * y; }));
    return P.trim(out);
  },
  scale: (a, k) => P.trim(a.map((c) => c * k)),
  pow: (a, n) => {
    let out = [1];
    for (let index = 0; index < n; index += 1) out = P.mul(out, a);
    return out;
  },
  compose: (outer, inner) => {
    let out = [0];
    for (let index = outer.length - 1; index >= 0; index -= 1) out = P.add(P.mul(out, inner), [outer[index]]);
    return out;
  },
  at: (a, x) => tidy(a.reduce((sum, c, index) => sum + c * x ** index, 0)),
  degree: (a) => P.trim(a).length - 1,
  equal: (a, b) => {
    const [x, y] = [P.trim(a), P.trim(b)];
    return x.length === y.length && x.every((c, index) => Math.abs(c - y[index]) <= 1e-9);
  },
};

/* The polynomial a rule spells, or null: + − × ÷ by a number, powers, implicit
 * products, one variable. Anything else (a radical, a second letter, division
 * by an expression) is not a rule this module computes with. */
const normalizeMath = (raw) => text(raw).replace(/[−–—]/g, '-').replace(/[·×∙⋅]/g, '*').replace(/²/g, '^2').replace(/³/g, '^3').replace(/\s+/g, '');
const parsePolynomial = (raw, variable = 'x') => {
  const source = normalizeMath(raw).replace(/\.$/, '');
  if (!source || source.length > 80) return null;
  const tokens = source.match(/\d+(?:\.\d+)?|\.\d+|[A-Za-z]|[-+*/^()]/g) || [];
  if (tokens.join('') !== source) return null;
  let at = 0;
  const peek = () => tokens[at];
  const fail = () => { throw new Error('unreadable'); };
  let expression;
  const atom = () => {
    const token = tokens[at];
    at += 1;
    if (token === undefined) return fail();
    if (/^[\d.]/.test(token)) return [Number(token)];
    if (token === variable) return [0, 1];
    if (token === '(') {
      const inside = expression();
      if (tokens[at] !== ')') fail();
      at += 1;
      return inside;
    }
    return fail();
  };
  let unary;
  const power = () => {
    const base = atom();
    if (peek() !== '^') return base;
    at += 1;
    const exponent = unary();
    if (exponent.length !== 1 || !Number.isInteger(exponent[0]) || exponent[0] < 0 || exponent[0] > 6) fail();
    return P.pow(base, exponent[0]);
  };
  unary = () => {
    if (peek() === '-') { at += 1; return P.neg(unary()); }
    if (peek() === '+') { at += 1; return unary(); }
    return power();
  };
  const term = () => {
    let left = unary();
    for (;;) {
      const token = peek();
      if (token === '*') { at += 1; left = P.mul(left, unary()); } else if (token === '/') {
        at += 1;
        const divisor = unary();
        if (divisor.length !== 1 || divisor[0] === 0) fail();
        left = P.scale(left, 1 / divisor[0]);
      } else if (token !== undefined && (/^[\d.A-Za-z]/.test(token) || token === '(')) left = P.mul(left, power());
      else return left;
    }
  };
  expression = () => {
    let left = term();
    while (peek() === '+' || peek() === '-') {
      const operator = tokens[at];
      at += 1;
      const right = term();
      left = operator === '+' ? P.add(left, right) : P.sub(left, right);
    }
    return left;
  };
  try {
    const result = expression();
    return at === tokens.length ? P.trim(result) : null;
  } catch {
    return null;
  }
};

const SUPERSCRIPT = { 2: '²', 3: '³' };
const monomial = (coefficient, power, variable) => {
  const magnitude = Math.abs(tidy(coefficient));
  const letter = power === 0 ? '' : power === 1 ? variable : `${variable}${SUPERSCRIPT[power] || `^${power}`}`;
  if (!letter) return numText(magnitude);
  if (Math.abs(magnitude - 1) < 1e-8) return letter;
  const shown = numText(magnitude);
  return shown.includes('/') ? `(${shown})${letter}` : `${shown}${letter}`;
};
/** A polynomial as a student writes it: 3x² − 2x + 1. */
const polyText = (p, variable = 'x') => {
  const terms = [];
  P.trim(p).forEach((c, power) => { if (tidy(c) !== 0) terms.unshift([c, power]); });
  if (!terms.length) return '0';
  return terms.map(([c, power], index) => {
    const body = monomial(c, power, variable);
    if (index === 0) return c < 0 ? `${MINUS}${body}` : body;
    return `${c < 0 ? MINUS : '+'} ${body}`;
  }).join(' ');
};
const polyForms = (p, variable = 'x') => spellings(polyText(p, variable));
// A rule as the problem wrote it, with spaces around + and −.
const spacedRule = (raw) => text(raw).replace(/\s+/g, '').replace(/\.$/, '')
  .replace(/([0-9A-Za-z²³)])([+\-−])/g, '$1 $2 ').replace(/-/g, MINUS);
// A rule put in place of x: in parentheses unless it is a single letter or an
// unsigned number. "Replace every x in x² with 3x" reads as 3x², and putting
// (u + 6)/3 in place of u in u² reads as (u + 6)/3²; only (3x)² and
// ((u + 6)/3)² are the substitution.
const wrap = (rule) => (/^(?:[A-Za-z]|\d+(?:\.\d+)?)$/.test(text(rule)) ? rule : `(${rule})`);
const withLetter = (rule, from, to) => rule.replace(new RegExp(`(?<![A-Za-z])${from}(?![A-Za-z])`, 'g'), to);

/* The inverse of y = a·v + b, as the corpus and a student write it. */
const inverseTexts = (a, b, variable = 'x') => {
  const slope = tidy(1 / a);
  const intercept = tidy(-b / a);
  const out = new Set();
  const v = variable;
  const B = numText(Math.abs(b));
  const A = numText(Math.abs(a));
  if (Number.isInteger(a) && Math.abs(a) !== 1) {
    if (a > 0) out.add(b === 0 ? `${v}/${A}` : `(${v} ${b > 0 ? MINUS : '+'} ${B})/${A}`);
    else if (b > 0) out.add(`(${B} ${MINUS} ${v})/${A}`);
    else out.add(b === 0 ? `${MINUS}${v}/${A}` : `${MINUS}(${v} + ${B})/${A}`);
    if (b !== 0 && a < 0) out.add(`(${v} ${b > 0 ? MINUS : '+'} ${B})/(${numText(a)})`);
  }
  out.add(polyText([intercept, slope], v));
  // The slope written as a fraction: (1/3)x + 7/3, x/3 + 7/3.
  const slopeFraction = exactFractionText(Math.abs(slope));
  if (slopeFraction.includes('/')) {
    const [p, q] = slopeFraction.split('/');
    const sign = slope < 0 ? MINUS : '';
    const tail = intercept === 0 ? '' : ` ${intercept < 0 ? MINUS : '+'} ${exactFractionText(Math.abs(intercept))}`;
    [`${sign}(${p}/${q})${v}`, p === '1' ? `${sign}${v}/${q}` : `${sign}${p}${v}/${q}`].forEach((head) => out.add(`${head}${tail}`));
  }
  return [...out];
};
// The spelling a worked example uses: (x + 2)/5 for a whole-number slope,
// 20x − 44000 when the inverse's slope is a whole or short decimal number.
const preferredInverse = (a, b, variable = 'x') => {
  if (Number.isInteger(a) && Math.abs(a) !== 1) return inverseTexts(a, b, variable)[0];
  return polyText([tidy(-b / a), tidy(1 / a)], variable);
};
// An expression in x with a number put in for x: (11 + 2)/5, 20·3450 − 44000.
// A leading −x at zero is −1·0, never "−0".
const plugIn = (expression, value) => (tidy(value) === 0 ? expression.replace(/(^|[^\d)])−x/g, '$1−1·x') : expression)
  .replace(/\(x/g, `(${numText(value)}`).replace(/(\d|\))x/g, `$1·${sub(value)}`).replace(/x/g, sub(value));

/* ---------------------------------------- reading rules from the text */

const STOP = /\s+(?:and|where|at|are|is|be|by|to|for|find|use|with|then|in|of|if|so|on|identify|write|evaluate|determine)\b|[,;:]|\.(?:\s|$)/i;
/** name(v) = rule definitions written in a text: f(x)=3x−7, E(s)=2200+0.05s. */
const definitionsIn = (source) => {
  const out = new Map();
  const pattern = /(?<![A-Za-z])([A-Za-z])\s*\(\s*([a-z])\s*\)\s*=\s*([0-9A-Za-z+\-−–·*×/^²³().\s]+)/g;
  const textOf = String(source || '');
  for (let match = pattern.exec(textOf); match; match = pattern.exec(textOf)) {
    const [whole, name, variable, rest] = match;
    const cut = rest.search(STOP);
    const raw = (cut >= 0 ? rest.slice(0, cut) : rest).trim().replace(/\.$/, '');
    // The next definition may start inside this one's run of characters
    // ("f(x)=2x+3 and g(x)=x−4"): read on from where this rule ends.
    pattern.lastIndex = match.index + whole.length - rest.length + Math.max(1, cut >= 0 ? cut : rest.length);
    if (out.has(name)) continue;
    const poly = parsePolynomial(raw, variable);
    if (!poly || !raw) continue;
    out.set(name, { name, variable, raw, rule: spacedRule(raw), poly });
  }
  return out;
};
const NUMBER = '[−\\-]?\\d+(?:\\.\\d+)?';
const toNumber = (raw) => Number(String(raw).replace(/[−–]/g, '-'));
/** f(6)=2 statements: name, input, output. */
const givensIn = (source) => [...String(source || '').matchAll(new RegExp(`(?<![A-Za-z⁻¹])([A-Za-z])\\s*\\(\\s*(${NUMBER})\\s*\\)\\s*=\\s*(${NUMBER})`, 'g'))]
  .map(([, name, input, output]) => ({ name, input: toNumber(input), output: toNumber(output) }));
const pairsIn = (source) => [...String(source || '').matchAll(new RegExp(`\\(\\s*(${NUMBER})\\s*,\\s*(${NUMBER})\\s*\\)`, 'g'))]
  .map(([, x, y]) => [toNumber(x), toNumber(y)]);
const relationIn = (source) => {
  const set = String(source || '').match(/\{([^{}]*)\}/);
  const pairs = set ? pairsIn(set[1]) : [];
  return pairs.length >= 2 ? pairs : null;
};
const pairText = ([x, y]) => `(${numText(x)}, ${numText(y)})`;
const setText = (pairs) => `{${pairs.map(pairText).join(', ')}}`;

/* ------------------------------------------------- multiAnswer fields */

const OPERATORS = { '+': 'sum', '-': 'difference', '·': 'product', '*': 'product', '': 'product', '/': 'quotient', '∘': 'composition' };
const OP_SYMBOL = { sum: '+', difference: MINUS, product: '·', quotient: '/', composition: '∘' };
const isNumericField = (field) => field?.inputProfile === 'number' || field?.answerFormat === 'number' || field?.inputContract?.format === 'number'
  || (typeof field?.answer === 'number' && !Array.isArray(field?.options));

const fieldRole = (field) => {
  const label = text(field.label || field.prompt || field.id);
  const flat = label.replace(/[−–]/g, '-').replace(/\s+/g, '');
  let match;
  if ((match = flat.match(/^\(([a-z])([+\-·*/∘]?)([a-z])\)\(([a-z]|-?\d+(?:\.\d+)?)\)$/i))) {
    return { role: /^[a-z]$/i.test(match[4]) ? 'opSym' : 'opAt', op: OPERATORS[match[2]], left: match[1], right: match[3], arg: match[4] };
  }
  if ((match = flat.match(/^([a-z])\(([a-z])\((-?\d+(?:\.\d+)?)\)\)$/i))) return { role: 'nested', outer: match[1], inner: match[2], arg: Number(match[3]) };
  if ((match = flat.match(/^([a-z])⁻¹\((-?\d+(?:\.\d+)?)\)$/i))) return { role: 'inverseAt', name: match[1], arg: Number(match[2]) };
  if ((match = flat.match(/^If([a-z])\(([a-z])\)=(.+),then([a-z])\((-?\d+(?:\.\d+)?)\)=$/i))) {
    return { role: 'evalDef', name: match[1], variable: match[2], raw: match[3], arg: Number(match[5]) };
  }
  if (/(?:⁻¹|\^\{?-1\}?)\(([a-z])\)/i.test(flat) || /inverse rule/i.test(label)) return { role: 'inverseRule' };
  if ((match = flat.match(/^([a-z])\((-?\d+(?:\.\d+)?)\)=?$/i))) return { role: 'evalAt', name: match[1], arg: Number(match[2]) };
  if (/slopeof[a-z]⁻¹/i.test(flat)) return { role: 'inverseSlope' };
  if ((match = flat.match(/^If([a-z])\((-?\d+(?:\.\d+)?)\)=(-?\d+(?:\.\d+)?),then$/i))) {
    return { role: 'inverseCheck', name: match[1], input: Number(match[2]), output: Number(match[3]) };
  }
  if (/whichcomposition/i.test(flat)) return { role: 'compositionCheck' };
  if (/inverserelation$/i.test(flat) || (/inverse relation/i.test(label) && text(field.answer).startsWith('{'))) return { role: 'inverseRelation' };
  if (/swappedorderedpair/i.test(flat)) return { role: 'swapPair', pair: pairsIn(label)[0] || null };
  if (/whatwasdone|inverserelationsaremadeby/i.test(flat)) return { role: 'relationProperty' };
  if (/inverse(?:relation)?afunction/i.test(flat)) return { role: 'isFunction' };
  if ((match = flat.match(/^(input|output)(?:to|of)([a-z])⁻¹$/i))) return { role: match[1].toLowerCase() === 'input' ? 'inverseInput' : 'inverseOutput', name: match[2] };
  if (/excluded/i.test(flat)) return { role: 'excluded' };
  if (/degree/i.test(flat)) return { role: 'degree' };
  if (/inverses\??$|^conclusion$/i.test(flat)) return { role: 'verdict' };
  if (/whichorder/i.test(flat)) return { role: 'orderCompare' };
  if (/inversegraphs?/i.test(flat)) return { role: 'graphRole' };
  if (/^slopeofy=x$/i.test(flat)) return { role: 'lineSlope' };
  if (isNumericField(field) && /\d/.test(label)) {
    const amounts = [...label.matchAll(/\$?\s*(\d+(?:,\d{3})*(?:\.\d+)?)/g)].map((entry) => Number(entry[1].replace(/,/g, '')));
    return amounts.length === 1 ? { role: 'contextValue', amount: amounts[0] } : { role: 'other' };
  }
  return { role: 'other' };
};

const linearOf = (definition) => (definition && P.degree(definition.poly) === 1 ? { a: definition.poly[1], b: definition.poly[0] } : null);

const readMultiAnswer = (question) => {
  const fields = list(question.answerFields).filter(isObject);
  if (!fields.length) return null;
  const prompt = text(question.prompt);
  const roles = fields.map((field) => ({ field, ...fieldRole(field) }));
  const has = (...names) => roles.some((entry) => names.includes(entry.role));
  const defs = definitionsIn(prompt);
  const givens = givensIn(prompt);
  const relation = relationIn(prompt);
  const base = { source: 'multiAnswer', prompt, roles, defs, givens, relation };
  const opSym = roles.filter((entry) => entry.role === 'opSym');
  const nested = roles.filter((entry) => entry.role === 'nested');

  const composeFields = opSym.filter((entry) => entry.op === 'composition');
  if (composeFields.length && composeFields.every((entry) => defs.has(entry.left) && defs.has(entry.right))) {
    const verification = has('verdict') || /\binverses\b/i.test(prompt);
    return { ...base, kind: verification ? 'inverseVerification' : 'compositionSymbolic', f: defs.get(composeFields[0].left), g: defs.get(composeFields[0].right) };
  }
  if (nested.length && nested.every((entry) => defs.has(entry.outer) && defs.has(entry.inner))) return { ...base, kind: 'contextComposition' };
  const givenValue = (name, input) => givens.find((entry) => entry.name === name && Math.abs(entry.input - input) < 1e-9);
  if (nested.length && nested.every((entry) => {
    const inner = givenValue(entry.inner, entry.arg);
    return inner && givenValue(entry.outer, inner.output);
  })) return { ...base, kind: 'compositionValues' };
  if (opSym.length && opSym.every((entry) => defs.has(entry.left) && defs.has(entry.right))) {
    return { ...base, kind: 'operations', f: defs.get(opSym[0].left), g: defs.get(opSym[0].right) };
  }
  if (has('excluded') && defs.has('f') && defs.has('g') && /quotient|product|\(f\s*\/\s*g\)/i.test(`${prompt} ${fields.map((field) => field.label).join(' ')}`)) {
    return { ...base, kind: 'operations', f: defs.get('f'), g: defs.get('g') };
  }
  const opAt = roles.filter((entry) => entry.role === 'opAt');
  if (opAt.length && opAt.every((entry) => givenValue(entry.left, Number(entry.arg)) && givenValue(entry.right, Number(entry.arg)))) return { ...base, kind: 'pointwise' };
  if (has('inverseRule', 'inverseSlope', 'inverseCheck', 'compositionCheck')) {
    const definition = [...defs.values()].find((entry) => linearOf(entry) && linearOf(entry).a !== 0);
    if (definition && has('inverseRule')) return { ...base, kind: 'linearInverse', def: definition, ...linearOf(definition) };
  }
  if (has('inverseRelation', 'swapPair')) {
    const swap = roles.find((entry) => entry.role === 'swapPair');
    const pairs = relation || (swap?.pair ? [swap.pair] : null);
    if (pairs) return { ...base, kind: 'inverseRelation', pairs };
  }
  if (has('inverseInput', 'inverseOutput') && givens.length === 1) return { ...base, kind: 'inverseProperty', given: givens[0] };
  if (has('inverseAt')) {
    const point = pairsIn(prompt).find(([x, y]) => x === y);
    if (point && /y\s*=\s*x/i.test(prompt)) return { ...base, kind: 'inverseProperty', point: point[0] };
  }
  if (has('graphRole')) return { ...base, kind: 'inverseGraph' };
  return null;
};

/* --------------------------------------------------- registry tools */

const RESTRICTION_LABELS = Object.freeze({
  none: 'No restriction needed',
  left: 'Use the left branch (x ≤ vertex x)',
  right: 'Use the right branch (x ≥ vertex x)',
  required: 'A restriction is required, but branch is not specified',
});

const linearSpec = (spec = {}) => {
  const a = Number(spec.a ?? 1);
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? 0);
  return [a, h, k].every(Number.isFinite) && a !== 0 ? { a, b: tidy(k - a * h) } : null;
};

const specText = (spec = {}) => {
  const type = spec.type || 'linear';
  const a = Number(spec.a ?? 1);
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? 0);
  const base = Number(spec.base ?? 2);
  const inner = h === 0 ? 'x' : `(x ${h > 0 ? MINUS : '+'} ${numText(Math.abs(h))})`;
  const coefficient = a === 1 ? '' : a === -1 ? MINUS : numText(a);
  const tail = k === 0 ? '' : ` ${k > 0 ? '+' : MINUS} ${numText(Math.abs(k))}`;
  if (type === 'linear') return polyText([tidy(k - a * h), a]);
  if (type === 'quadratic') return `${coefficient}${inner}²${tail}`;
  if (type === 'cubic') return `${coefficient}${inner}³${tail}`;
  if (type === 'absolute') return `${coefficient}|${h === 0 ? 'x' : inner.slice(1, -1)}|${tail}`;
  if (type === 'exponential') return `${coefficient}${coefficient && coefficient !== MINUS ? '·' : ''}${numText(base)}^${inner}${tail}`;
  if (type === 'logarithmic') return `${coefficient}${coefficient && coefficient !== MINUS ? '·' : ''}log_${numText(base)}${h === 0 ? '(x)' : inner}${tail}`;
  if (type === 'squareRoot') return `${coefficient}√${inner}${tail}`;
  return null;
};

const readLab = (question) => {
  const mode = text(question.mode) || 'full';
  if (mode === 'deriveInverse') {
    const f = question.f || { type: 'linear', a: 2, h: 0, k: 3 };
    if (f.type !== 'linear') return null;
    const line = linearSpec(f);
    return line ? { source: 'tool', kind: 'derive', ...line, rule: polyText([line.b, line.a]) } : null;
  }
  const { f, g } = inverseLabFunctions(question);
  const x = Number(inverseLabInitialX(question));
  if (!Number.isFinite(x)) return null;
  const parts = inverseLabRequiredParts(mode, f);
  const fx = evaluateSpecWithDomain(f, x);
  return {
    source: 'tool',
    kind: 'lab',
    mode,
    f,
    g,
    x,
    locked: inverseLabInputLocked(question),
    parts,
    fx,
    fog: composeValue(f, g, x),
    gof: composeValue(g, f, x),
    canInvert: hasFunctionalInverse(f) && Number.isFinite(fx),
    restriction: expectedInverseRestriction(f),
    fRule: specText(f),
    gRule: specText(g),
  };
};

const readOps = (question) => {
  const operations = normalizeFunctionOperations(question.operations);
  const composeOrder = normalizeComposeOrder(question.composeOrder);
  if (!operations.length) return null;
  try {
    const key = deriveFunctionOperations({ f: question.f, g: question.g, operations, composeOrder, restrictions: question.restrictions });
    const f = P.trim([...polynomialCoefficientsFromFunction(question.f)].reverse());
    const g = P.trim([...polynomialCoefficientsFromFunction(question.g)].reverse());
    return { source: 'tool', kind: 'ops', operations, composeOrder, key, fPoly: f, gPoly: g, fRule: polyText(f), gRule: polyText(g) };
  } catch {
    return null;
  }
};

const readModel = (question) => {
  if (!isObject(question)) return null;
  const type = typeOf(question);
  if (type === 'inverseCompositionLab') return readLab(question);
  if (type === 'functionOperationsLab') return readOps(question);
  if (type === 'multiAnswer') return readMultiAnswer(question);
  return null;
};

/** Which shape of this family a question is (lab, derive, ops, linearInverse, …), or null. */
export const questionKind = (question) => {
  try {
    return readModel(question)?.kind || null;
  } catch {
    return null;
  }
};

export const matches = (question) => {
  try {
    return Boolean(readModel(question));
  } catch {
    return false;
  }
};

/* ------------------------------------------------- the answers (key) */

// The plain keys the platform's guard reads (questionAnswerValues), so this
// module's own checks are never weaker than the platform's.
const plainKeys = (question) => {
  const values = [];
  const push = (value) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      if (value.length === 2 && value.every((entry) => typeof entry === 'number')) values.push(`(${value[0]}, ${value[1]})`, `(${value[0]},${value[1]})`);
      return;
    }
    if (typeof value === 'object') return;
    values.push(text(value));
  };
  list(question.answerFields).forEach((field) => answerCandidatesForField(field).forEach(push));
  push(question.answer);
  push(question.solution);
  push(question.target);
  push(question.generatedAnswer);
  list(question.acceptedAnswers).forEach(push);
  if (isObject(question.solutionKey)) push(question.solutionKey.value);
  return unique(values);
};

// A choice keyed by an option id also shows its label: both are the answer.
const fieldAnswerTexts = (field) => {
  const out = [];
  answerCandidatesForField(field).forEach((value) => {
    if (value === null || typeof value === 'object') return;
    out.push(...spellings(value));
    if (typeof value === 'number') out.push(...numberForms(value));
    list(field.options).forEach((option) => {
      if (isObject(option) && text(option.id) === text(value)) out.push(...spellings(option.label || option.text));
    });
  });
  return out;
};

const valueOf = (model, name, input) => {
  const definition = model.defs?.get(name);
  if (definition) return P.at(definition.poly, input);
  const given = model.givens?.find((entry) => entry.name === name && Math.abs(entry.input - input) < 1e-9);
  return given ? given.output : null;
};

const operate = (op, left, right) => {
  if (op === 'sum') return P.add(left, right);
  if (op === 'difference') return P.sub(left, right);
  if (op === 'product') return P.mul(left, right);
  if (op === 'composition') return P.compose(left, right);
  return null;
};
const operateNumbers = (op, left, right) => (op === 'sum' ? left + right : op === 'difference' ? left - right
  : op === 'product' ? left * right : op === 'quotient' && right !== 0 ? left / right : null);

const realRoots = (p) => {
  const q = P.trim(p);
  if (q.length === 2) return [tidy(-q[0] / q[1])];
  if (q.length !== 3) return [];
  const [c, b, a] = q;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -1e-9) return [];
  if (Math.abs(discriminant) <= 1e-9) return [tidy(-b / (2 * a))];
  const root = Math.sqrt(discriminant);
  return [tidy((-b - root) / (2 * a)), tidy((-b + root) / (2 * a))].sort((x, y) => x - y);
};

/** What each multiAnswer field asks for, computed from the problem itself. */
const computedFieldValues = (model, entry) => {
  const { defs } = model;
  switch (entry.role) {
    case 'opSym': {
      const left = defs.get(entry.left)?.poly;
      const right = defs.get(entry.right)?.poly;
      if (!left || !right) return [];
      if (entry.op === 'quotient') {
        const forms = [`(${polyText(left)})/(${polyText(right)})`];
        return forms.flatMap(spellings);
      }
      const result = operate(entry.op, left, right);
      return result ? polyForms(result) : [];
    }
    case 'opAt': {
      const value = operateNumbers(entry.op, valueOf(model, entry.left, Number(entry.arg)), valueOf(model, entry.right, Number(entry.arg)));
      return value === null ? [] : numberForms(value);
    }
    case 'nested': {
      const inner = valueOf(model, entry.inner, entry.arg);
      const outer = inner === null ? null : valueOf(model, entry.outer, inner);
      return outer === null ? [] : numberForms(outer);
    }
    case 'evalAt': {
      if (model.kind === 'inverseProperty' && model.point !== undefined) return numberForms(model.point);
      const value = valueOf(model, entry.name, entry.arg);
      return value === null ? [] : numberForms(value);
    }
    case 'inverseAt': {
      if (model.point !== undefined) return numberForms(model.point);
      const given = model.givens.find((item) => item.name === entry.name && Math.abs(item.output - entry.arg) < 1e-9);
      return given ? numberForms(given.input) : [];
    }
    case 'evalDef': {
      const poly = parsePolynomial(entry.raw, entry.variable);
      return poly ? numberForms(P.at(poly, entry.arg)) : [];
    }
    case 'inverseRule':
      // The rule, and its slope and intercept: a hint naming either gives part of it away.
      return model.kind === 'linearInverse'
        ? [...inverseTexts(model.a, model.b).flatMap(spellings), ...numberForms(1 / model.a), ...numberForms(-model.b / model.a)]
        : [];
    case 'inverseSlope':
      return model.kind === 'linearInverse' ? numberForms(1 / model.a) : [];
    case 'inverseCheck':
      return spellings(`${entry.name}⁻¹(${numText(entry.output)}) = ${numText(entry.input)}`);
    case 'contextValue':
      return model.kind === 'linearInverse' ? numberForms((entry.amount - model.b) / model.a) : [];
    case 'inverseInput':
      return model.given ? numberForms(model.given.output) : [];
    case 'inverseOutput':
      return model.given ? numberForms(model.given.input) : [];
    case 'inverseRelation':
      return model.pairs ? spellings(setText(model.pairs.map(([x, y]) => [y, x]))) : [];
    case 'swapPair':
      return entry.pair ? spellings(pairText([entry.pair[1], entry.pair[0]])) : [];
    case 'excluded': {
      const quotient = model.roles.find((item) => item.role === 'opSym' && item.op === 'quotient');
      const denominator = defs.get(quotient?.right || 'g')?.poly;
      return denominator ? realRoots(denominator).flatMap(numberForms) : [];
    }
    case 'degree': {
      const product = model.roles.find((item) => item.role === 'opSym' && item.op === 'product');
      const left = defs.get(product?.left || 'f')?.poly;
      const right = defs.get(product?.right || 'g')?.poly;
      return left && right ? [String(P.degree(P.mul(left, right)))] : [];
    }
    default:
      return [];
  }
};

const restrictionForms = (id, f) => {
  const out = [id, RESTRICTION_LABELS[id] || ''];
  const h = Number(f?.h ?? 0);
  if (id === 'left') out.push('left branch', ...[numText(h), String(h)].flatMap((value) => [`x ≤ ${value}`, `x≤${value}`, `x <= ${value}`]));
  if (id === 'right') out.push('right branch', ...[numText(h), String(h)].flatMap((value) => [`x ≥ ${value}`, `x≥${value}`, `x >= ${value}`]));
  return out;
};

const toolExpected = (model) => {
  if (model.kind === 'derive') {
    return [
      ...inverseTexts(model.a, model.b).flatMap((form) => [...spellings(form), ...spellings(`y = ${form}`)]),
      ...numberForms(1 / model.a),
      ...numberForms(-model.b / model.a),
    ];
  }
  if (model.kind === 'lab') {
    const out = [];
    if (model.parts.includes('fog') && Number.isFinite(model.fog)) out.push(...numberForms(model.fog));
    if (model.parts.includes('gof') && Number.isFinite(model.gof)) out.push(...numberForms(model.gof));
    // f⁻¹(f(x)) is x on f's kept branch and the mirror 2h − x off it: the
    // value the grader marks, kept with x so neither is ever hinted.
    if (model.parts.includes('inverse') && model.canInvert) out.push(...numberForms(model.x), ...numberForms(inverseLabRoundTrip(model.f, model.x)));
    if (model.parts.includes('restriction')) out.push(...restrictionForms(model.restriction, model.f));
    return out;
  }
  if (model.kind === 'ops') {
    const out = [];
    model.operations.forEach((operation) => {
      const entry = model.key[operation];
      if (!entry) return;
      out.push(...spellings(entry.expression));
      if (entry.coefficients) out.push(...polyForms([...entry.coefficients].reverse()));
      if (operation === 'quotient') {
        out.push(...spellings(`(${polyText(model.fPoly)})/(${polyText(model.gPoly)})`));
        list(entry.excludedValues).forEach((value) => out.push(...numberForms(value)));
      }
    });
    return out;
  }
  return [];
};

export const expectedValues = (question) => {
  try {
    const model = readModel(question);
    if (!model) return [];
    if (model.source === 'tool') return unique(toolExpected(model));
    return unique(model.roles.flatMap((entry) => [...fieldAnswerTexts(entry.field), ...computedFieldValues(model, entry)]));
  } catch {
    return [];
  }
};

const guardOf = (question) => unique([...expectedValues(question), ...plainKeys(question)]);
const safeText = (value, guard) => Boolean(text(value)) && !hintRevealsAnswer(value, guard);
// The first spelling that names no answer; null when every one would.
const firstSafe = (candidates, guard) => list(candidates).find((candidate) => safeText(candidate, guard)) || null;

/* ------------------------------------------------------------- hints */

// The steps that undo f, in the order a student undoes them.
const undoMoves = (spec) => {
  const type = spec.type || 'linear';
  const a = Number(spec.a ?? 1);
  const h = Number(spec.h ?? 0);
  const k = Number(spec.k ?? 0);
  const base = Number(spec.base ?? 2);
  const moves = [];
  if (type === 'linear') {
    const line = linearSpec(spec);
    if (!line) return [];
    if (line.b !== 0) moves.push(line.b > 0 ? `subtract ${numText(line.b)}` : `add ${numText(-line.b)}`);
    if (line.a !== 1) moves.push(`divide by ${numText(line.a)}`);
    return moves;
  }
  if (k !== 0) moves.push(k > 0 ? `subtract ${numText(k)}` : `add ${numText(-k)}`);
  if (a !== 1) moves.push(`divide by ${numText(a)}`);
  if (type === 'exponential') moves.push(`take the logarithm base ${numText(base)}`);
  else if (type === 'logarithmic') moves.push(`raise ${numText(base)} to that power`);
  else if (type === 'quadratic') moves.push('take the square root on the kept side of the vertex');
  else if (type === 'squareRoot') moves.push('square');
  else return [];
  if (h !== 0) moves.push(h > 0 ? `add ${numText(h)}` : `subtract ${numText(-h)}`);
  return moves;
};
const sentence = (moves) => (moves.length <= 1 ? moves.join('') : `${moves.slice(0, -1).join(', ')}, then ${moves[moves.length - 1]}`);

const labHints = (model) => {
  const X = numText(model.x);
  const f = model.fRule ? `f(x) = ${model.fRule}` : 'f';
  const g = model.gRule ? `g(x) = ${model.gRule}` : 'g';
  const out = [];
  if (model.parts.includes('fog')) {
    out.push([
      `In (f ∘ g)(${X}), g acts on ${X} first and f acts on g’s output; in (g ∘ f)(${X}) the order is reversed.`,
      'In (f ∘ g), g acts on the input first and f acts on g’s output; in (g ∘ f) the order is reversed.',
    ]);
    out.push([
      `For (f ∘ g)(${X}), find g(${X}) with ${g} first, then use that output as the input of ${f}.`,
      `For (f ∘ g), put the given input into ${g} first, then use that output as the input of ${f}.`,
      'For (f ∘ g), put the given input into g first, then use that output as the input of f.',
    ]);
    out.push([
      `For (g ∘ f)(${X}), start with f(${X}) using ${f}, then put that output into ${g}. The two orders do not have to give the same number.`,
      `For (g ∘ f), put the given input into ${f} first, then use that output as the input of ${g}. The two orders do not have to give the same number.`,
      'For (g ∘ f), f acts first and g second. The two orders do not have to give the same number.',
    ]);
  }
  if (model.parts.includes('restriction')) {
    out.push(['A function has an inverse function only when each output comes from exactly one input (the horizontal line test).']);
    if ((model.f.type || 'linear') === 'quadratic') {
      const h = numText(Number(model.f.h ?? 0));
      out.push([
        `${f} is a parabola with its vertex at x = ${h}: two inputs the same distance from x = ${h} give the same output, so only one side of the vertex can be kept. Read the inverse condition shown with f.`,
        'A parabola gives the same output for two inputs the same distance from its vertex, so only one side of the vertex can be kept. Read the inverse condition shown with f.',
      ]);
    } else {
      out.push([`Ask whether two different inputs of ${f} can give the same output.`, 'Ask whether two different inputs of f can give the same output.']);
    }
  }
  if (model.parts.includes('inverse')) {
    const moves = undoMoves(model.f);
    out.push([
      moves.length ? `To undo ${f}, reverse its steps in the opposite order: ${sentence(moves)}.` : null,
      'To undo f, reverse its steps in the opposite order: the last thing f does is the first thing you undo.',
    ]);
    out.push([
      Number.isFinite(model.fx) ? `Find f(${X}) first, then apply your undo steps to that output.` : null,
      'Then apply those undo steps to the number in the f⁻¹ box.',
    ]);
  }
  return out;
};

const deriveHints = (model) => {
  const rule = model.rule;
  const swapped = withLetter(rule, 'x', 'y');
  const moves = [];
  if (model.b !== 0) moves.push(model.b > 0 ? `subtract ${numText(model.b)} from both sides` : `add ${numText(-model.b)} to both sides`);
  if (model.a !== 1) moves.push(`divide both sides by ${numText(model.a)}`);
  return [
    [`Write y = ${rule}, then swap x and y: x = ${swapped}.`, 'Write the rule as y = f(x), then swap x and y.'],
    [moves.length ? `Now solve x = ${swapped} for y: ${sentence(moves)}.` : null, 'Now solve for y by undoing the steps in reverse order: the added number first, then the multiplication.'],
    ['Check your rule by composing: f(f⁻¹(x)) should simplify back to x.'],
  ];
};

const opsLabel = (op, composeOrder = 'fOfG') => (op === 'composition' ? (composeOrder === 'gOfF' ? '(g ∘ f)(x)' : '(f ∘ g)(x)')
  : op === 'product' ? '(f · g)(x)' : `(f ${OP_SYMBOL[op]} g)(x)`);

const operationHint = (op, fRule, gRule, { composeOrder = 'fOfG', label, degree = false } = {}) => {
  const L = label || opsLabel(op, composeOrder);
  if (op === 'sum') return [`For ${L}, add (${fRule}) + (${gRule}) and combine like terms.`, `For ${L}, add f(x) and g(x) and combine like terms.`];
  if (op === 'difference') {
    return [
      `For ${L}, write (${fRule}) ${MINUS} (${gRule}) and change the sign of every term of g before combining like terms.`,
      `For ${L}, subtract all of g(x): change the sign of every term of g before combining like terms.`,
    ];
  }
  if (op === 'product') {
    const tail = degree ? ' The highest power of x that remains gives the degree.' : '';
    return [`For ${L}, multiply each term of ${fRule} by each term of ${gRule}, then combine like terms.${tail}`, `For ${L}, multiply each term of f(x) by each term of g(x), then combine like terms.${tail}`];
  }
  if (op === 'quotient') {
    return [
      `For ${L}, write (${fRule}) over (${gRule}). The excluded x-values make the denominator zero: solve ${gRule} = 0.`,
      `For ${L}, write (${fRule}) over (${gRule}). The excluded x-values are the inputs that make the denominator zero.`,
      `For ${L}, write f(x) over g(x). The excluded x-values are the inputs that make the denominator g(x) zero.`,
    ];
  }
  if (op === 'composition') {
    const [outer, inner, outerName, innerName] = composeOrder === 'gOfF' ? [gRule, fRule, 'g', 'f'] : [fRule, gRule, 'f', 'g'];
    return [
      `For ${L}, replace every x in ${outer} with ${wrap(inner)}, then expand and combine like terms.`,
      `For ${L}, put all of ${innerName}(x), in parentheses, in place of every x in ${outerName}(x); then expand.`,
    ];
  }
  return [];
};

const opsHints = (model) => {
  const out = [[
    `Write f(x) = ${model.fRule} and g(x) = ${model.gRule}, and keep like terms together: x² with x², x with x, numbers with numbers.`,
    'Write f(x) and g(x) one under the other and keep like terms together.',
  ]];
  const ops = model.operations.length > 3 ? model.operations.filter((op) => op !== 'sum') : model.operations;
  ops.forEach((op) => out.push(operationHint(op, model.fRule, model.gRule, { composeOrder: model.composeOrder })));
  return out;
};

const multiHints = (model) => {
  const roles = (name) => model.roles.filter((entry) => entry.role === name);
  const out = [];
  switch (model.kind) {
    case 'linearInverse': {
      const { def } = model;
      const name = def.name;
      const ownLetter = def.variable === 'x';
      const swapped = withLetter(def.rule, def.variable, 'y');
      const moves = [];
      if (model.b !== 0) moves.push(model.b > 0 ? `subtract ${numText(model.b)} from both sides` : `add ${numText(-model.b)} to both sides`);
      if (model.a !== 1) moves.push(`divide both sides by ${numText(model.a)}`);
      if (ownLetter) {
        out.push([`Write y = ${def.rule}, then swap x and y: x = ${swapped}.`, `Write ${name}(x) as y = …, then swap x and y: the input and the output trade places.`]);
        out.push([moves.length ? `Now solve x = ${swapped} for y: ${sentence(moves)}.` : null, 'Now solve for y: undo the added number first, then the multiplication.']);
      } else {
        const v = def.variable;
        out.push([`Let x stand for the output of ${name}: write x = ${def.rule} and solve it for ${v}.`, `Let x stand for the output of ${name}, and solve the rule for ${v}.`]);
        out.push([moves.length ? `To get ${v} alone in x = ${def.rule}: ${sentence(moves)}.` : null, `To get ${v} alone: undo the added number first, then the multiplication.`]);
      }
      roles('contextValue').forEach((entry) => out.push([
        `For ${text(entry.field.label).replace(/^./, (c) => c.toLowerCase())}, use ${numText(entry.amount)} as the input of your inverse rule, or solve ${def.rule} = ${numText(entry.amount)} for ${def.variable}.`,
        `For the value in the last part, put the given total into your inverse rule.`,
      ]));
      roles('inverseCheck').forEach((entry) => out.push([
        `${entry.name}(${numText(entry.input)}) = ${numText(entry.output)} puts the pair (${numText(entry.input)}, ${numText(entry.output)}) on ${entry.name}; ${entry.name}⁻¹ has the same two numbers with the input and the output exchanged.`,
        `A statement ${entry.name}(a) = b puts the pair (a, b) on ${entry.name}; ${entry.name}⁻¹ has the same two numbers with the input and the output exchanged.`,
      ]));
      if (roles('inverseSlope').length) out.push([`Once y is alone, the slope of ${name}⁻¹ is the number multiplying x.`]);
      if (!roles('compositionCheck').length && out.length < 4) out.push([`Check your rule: ${name}(${name}⁻¹(x)) should simplify back to x.`]);
      break;
    }
    case 'inverseRelation': {
      const pairs = model.pairs;
      const shown = model.relation ? setText(pairs) : pairText(pairs[0]);
      out.push([
        `In ${shown}, the first number of each pair is an input and the second is an output. What does an inverse relation do with the inputs and the outputs?`,
        'In each ordered pair, the first number is an input and the second is an output. What does an inverse relation do with them?',
      ]);
      if (model.relation) {
        out.push([
          `Work one pair at a time, starting with ${pairText(pairs[0])}: which of its numbers is the input of the inverse relation?`,
          'Work one pair at a time: which number of each pair is the input of the inverse relation?',
        ]);
      }
      roles('evalDef').forEach((entry) => out.push([
        `For ${entry.name}(${numText(entry.arg)}), replace ${entry.variable} with ${numText(entry.arg)} in ${spacedRule(entry.raw)}.`,
        `For the function value, replace ${entry.variable} with the given input in the rule.`,
      ]));
      if (roles('isFunction').length) {
        out.push(['For the function question, look at the inputs of the inverse relation: a relation is a function when each input is paired with only one output.']);
      }
      if (model.relation) out.push(['Check every pair, not only the first: each pair of the original needs a partner in your answer.']);
      break;
    }
    case 'inverseProperty': {
      if (model.given) {
        const { name, input, output } = model.given;
        out.push([
          `${name}(${numText(input)}) = ${numText(output)} says that ${name} takes the input ${numText(input)} to the output ${numText(output)}.`,
          `Read the statement you are given in words: which number goes into ${name}, and which number comes out?`,
        ]);
        out.push([`${name}⁻¹ runs ${name} backwards: what comes out of ${name} goes into ${name}⁻¹, and what went into ${name} comes out of ${name}⁻¹.`]);
      } else {
        out.push(['A point on the line y = x has two equal coordinates.']);
        out.push(['If a point is on the graph of f, its first coordinate is an input and its second coordinate is f of that input.']);
        out.push(['f⁻¹ has every point of f with its coordinates exchanged. What happens to a point whose two coordinates are equal?']);
      }
      break;
    }
    case 'inverseGraph': {
      out.push(['The graph of f⁻¹ has every point (a, b) of f moved to (b, a).']);
      out.push(['Plot a point and its swapped partner, such as (2, 5) and (5, 2): where does the line y = x sit between them?']);
      if (roles('lineSlope').length) out.push(['For the slope of y = x, compare the rise with the run between two of its points, such as (0, 0) and (3, 3).']);
      break;
    }
    case 'operations': {
      const f = model.defs.get('f') || model.f;
      const g = model.defs.get('g') || model.g;
      out.push([
        `Write f(x) = ${f.rule} and g(x) = ${g.rule}, and keep like terms together: x² with x², x with x, numbers with numbers.`,
        'Write f(x) and g(x) one under the other and keep like terms together.',
      ]);
      const degree = roles('degree').length > 0;
      roles('opSym').forEach((entry) => {
        const left = model.defs.get(entry.left);
        const right = model.defs.get(entry.right);
        out.push(operationHint(entry.op, left.rule, right.rule, { label: text(entry.field.label), degree: degree && entry.op === 'product' }));
      });
      if (roles('excluded').length && !roles('opSym').some((entry) => entry.op === 'quotient')) {
        out.push([
          `For (f / g)(x), the excluded x-values make the denominator zero: solve ${g.rule} = 0.`,
          'For (f / g)(x), the excluded x-values are the inputs that make the denominator g(x) zero.',
        ]);
      }
      break;
    }
    case 'pointwise': {
      roles('opAt').forEach((entry) => {
        const a = numText(Number(entry.arg));
        const symbol = { sum: '+', difference: MINUS, product: '·', quotient: '÷' }[entry.op];
        const right = valueOf(model, entry.right, Number(entry.arg));
        const negativeNote = entry.op === 'difference' && right < 0 ? ` Subtracting a negative output is the same as adding its opposite.` : '';
        out.push([
          `${text(entry.field.label)} means ${entry.left}(${a}) ${symbol} ${entry.right}(${a}): combine the two outputs you are given.${negativeNote}`,
          `${OP_SYMBOL[entry.op] ? `(${entry.left} ${OP_SYMBOL[entry.op]} ${entry.right})` : 'The operation'} at an input means: find ${entry.left} and ${entry.right} at that input, then combine the two outputs.${negativeNote}`,
        ]);
      });
      break;
    }
    case 'compositionValues':
    case 'contextComposition': {
      const nested = roles('nested');
      const first = nested[0];
      out.push([
        `In ${first.outer}(${first.inner}(${numText(first.arg)})), work from the inside out: ${first.inner} acts first, and its output is the input of ${first.outer}.`,
        `Work from the inside out: the inner function acts first, and its output is the input of the outer function.`,
      ]);
      nested.forEach((entry) => {
        const innerDef = model.defs.get(entry.inner);
        const outerDef = model.defs.get(entry.outer);
        const label = `${entry.outer}(${entry.inner}(${numText(entry.arg)}))`;
        if (innerDef && outerDef) {
          out.push([
            `For ${label}, find ${entry.inner}(${numText(entry.arg)}) with ${entry.inner}(${innerDef.variable}) = ${innerDef.rule} first, then put that result into ${entry.outer}(${outerDef.variable}) = ${outerDef.rule}.`,
            `For ${label}, apply ${entry.inner} first, then ${entry.outer}.`,
          ]);
        } else {
          out.push([
            `For ${label}, find ${entry.inner}(${numText(entry.arg)}) among the statements you are given; then look for the statement that uses that number as the input of ${entry.outer}.`,
            `Find the inner value among the statements you are given, then look for the statement that uses it as the input of ${entry.outer}.`,
          ]);
        }
      });
      if (roles('orderCompare').length) out.push(['Compare your two results: the order that gives the larger number leaves the larger amount.']);
      break;
    }
    case 'compositionSymbolic': {
      const { f, g } = model;
      out.push(['(f ∘ g)(x) means f(g(x)): g acts first, so its whole rule goes inside f.']);
      out.push([`For (f ∘ g)(x), replace every x in ${f.rule} with ${wrap(g.rule)}, then expand and combine like terms.`, 'For (f ∘ g)(x), put all of g(x), in parentheses, in place of every x in f(x); then expand.']);
      out.push([`For (g ∘ f)(x), it is the other way around: replace every x in ${g.rule} with ${wrap(f.rule)}.`, 'For (g ∘ f)(x), it is the other way around: put all of f(x) in place of every x in g(x).']);
      // The power to expand is f's own: a cubic f needs (g)³, not (g)².
      const power = P.degree(f.poly);
      if ((power === 2 || power === 3) && P.degree(g.poly) === 1) {
        out.push([`Expand (${g.rule})${SUPERSCRIPT[power]} as ${`(${g.rule})`.repeat(power)}: every term times every term.`]);
      }
      break;
    }
    case 'inverseVerification': {
      // Its answers are "x" and a verdict: no hint here writes a bare x or a
      // verdict word, whichever verdict is right. The rules are shown in u.
      const fU = withLetter(model.f.rule, model.f.variable, 'u');
      const gU = withLetter(model.g.rule, model.g.variable, 'u');
      out.push(['Two functions are inverses only when each undoes the other: both f(g(u)) and g(f(u)) must simplify to u.']);
      out.push([
        `Write the rules with a letter like u: f(u) = ${fU} and g(u) = ${gU}. To build f(g(u)), put ${wrap(gU)} in place of every u in ${fU}, then simplify.`,
        'To build f(g(u)), put the whole rule of g, in parentheses, in place of every u in the rule of f, then simplify.',
      ]);
      out.push([
        `Then build g(f(u)): put ${wrap(fU)} in place of every u in ${gU}, and simplify that too.`,
        'Then build g(f(u)) the same way, the other way around, and simplify that too.',
      ]);
      break;
    }
    default:
      break;
  }
  return out;
};

export const hints = (question) => {
  try {
    const model = readModel(question);
    if (!model) return [];
    const guard = guardOf(question);
    const ladder = model.kind === 'lab' ? labHints(model)
      : model.kind === 'derive' ? deriveHints(model)
        : model.kind === 'ops' ? opsHints(model)
          : multiHints(model);
    const chosen = [];
    ladder.forEach((candidates) => {
      const hint = firstSafe(candidates, guard);
      if (hint && !chosen.includes(hint)) chosen.push(hint);
    });
    return chosen.slice(0, 4);
  } catch {
    return [];
  }
};

/* ------------------------------------------------ the worked sibling */

const hashText = (value) => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};
const randomFrom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const integer = (random, low, high) => low + Math.floor(random() * (high - low + 1));
const nonZero = (random, low, high) => {
  for (let tries = 0; tries < 100; tries += 1) {
    const value = integer(random, low, high);
    if (value) return value;
  }
  return high;
};
const pick = (random, values) => values[Math.floor(random() * values.length)];

// The visible problem, never its key: what the sibling's numbers are drawn from.
const fingerprint = (question) => JSON.stringify([
  text(question.prompt),
  typeOf(question),
  text(question.mode),
  question.f ?? null,
  question.g ?? null,
  question.x ?? null,
  question.operations ?? null,
  question.composeOrder ?? null,
  list(question.answerFields).map((field) => text(field?.label || field?.id)),
]);

const numericValue = (raw) => {
  const value = text(raw).replace(/[−–]/g, '-').replace(/\s+/g, '');
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  const fraction = value.match(/^(-?\d+)\/(-?\d+)$/);
  return fraction && Number(fraction[2]) ? Number(fraction[1]) / Number(fraction[2]) : null;
};
// The platform's own checks (similarExampleIsSafe), run here first, and a
// little stricter: no part of the sibling — its answer included — may
// contain one of this question's answers.
const siblingIsSafe = (question, guard, example) => {
  if (!example) return false;
  const prompt = text(example.prompt);
  const answer = text(example.answer);
  const steps = list(example.steps).map(text).filter(Boolean);
  if (!prompt || !answer || steps.length < 2 || prompt === text(question.prompt)) return false;
  if (guard.some((value) => value.toLowerCase() === answer.toLowerCase())) return false;
  const own = numericValue(answer);
  if (own !== null && guard.some((value) => numericValue(value) !== null && Math.abs(numericValue(value) - own) < 1e-9)) return false;
  return ![prompt, ...steps, answer].some((piece) => hintRevealsAnswer(piece, guard));
};

const linear = (a, b, variable = 'x') => polyText([b, a], variable);
// a·value + b written out for substitution: 3(4) − 1, 0.9 · 800, 750 − 50.
const linearAt = (a, b, value) => {
  // −1 times 0 is written −1·0, never "−0".
  const head = a === 1 ? sub(value) : a === -1 && tidy(value) !== 0 ? `${MINUS}${sub(value)}` : `${numText(a)}${tidy(value) < 0 ? '' : '·'}${sub(value)}`;
  return b === 0 ? head : `${head} ${b > 0 ? '+' : MINUS} ${numText(Math.abs(b))}`;
};
// Every term of a polynomial with x replaced by (inner): 3(2x − 1)² − (2x − 1) + 4.
const substituted = (outer, innerText) => {
  const terms = [];
  P.trim(outer).forEach((c, power) => { if (tidy(c) !== 0) terms.unshift([c, power]); });
  return terms.map(([c, power], index) => {
    const magnitude = Math.abs(tidy(c));
    const factor = power === 0 ? '' : `(${innerText})${SUPERSCRIPT[power] || (power === 1 ? '' : `^${power}`)}`;
    const coefficient = power === 0 ? numText(magnitude) : magnitude === 1 ? '' : numText(magnitude);
    const body = `${coefficient}${factor}` || numText(magnitude);
    if (index === 0) return c < 0 ? `${MINUS}${body}` : body;
    return `${c < 0 ? MINUS : '+'} ${body}`;
  }).join(' ');
};
const randomPoly = (random, degree, { low = -6, high = 6 } = {}) => {
  const out = [];
  for (let power = 0; power <= degree; power += 1) out.push(power === degree ? nonZero(random, low, high) : integer(random, low, high));
  if (degree >= 1 && out[0] === 0) out[0] = nonZero(random, low, high);
  return P.trim(out);
};

/* the lab: composition values, undoing f, a restriction */

const SIBLING_TYPES = ['linear', 'quadratic', 'exponential', 'logarithmic', 'squareRoot'];
const undoSibling = (random, type) => {
  if (type === 'exponential') {
    const base = pick(random, [2, 3]);
    const a = pick(random, [1, 2, 3, 4]);
    const h = integer(random, -3, 3);
    const k = nonZero(random, -9, 9);
    const n = integer(random, 1, 3);
    const x0 = h + n;
    const y0 = a * base ** n + k;
    const f = { type, a, h, k, base };
    const X = numText(x0);
    const power = `${base}^${n}`;
    const steps = [
      `f(${X}) = ${a === 1 ? '' : `${numText(a)}·`}${numText(base)}^(${X}${h === 0 ? '' : ` ${h > 0 ? MINUS : '+'} ${numText(Math.abs(h))}`}) ${k > 0 ? '+' : MINUS} ${numText(Math.abs(k))} = ${a === 1 ? '' : `${numText(a)}·`}${power} ${k > 0 ? '+' : MINUS} ${numText(Math.abs(k))} = ${numText(y0)}.`,
      `Undo f in reverse order: ${numText(y0)} ${k > 0 ? MINUS : '+'} ${numText(Math.abs(k))} = ${numText(y0 - k)}${a !== 1 ? `, then ${numText(y0 - k)} ÷ ${numText(a)} = ${numText((y0 - k) / a)}` : ''}.`,
      // With no horizontal shift the logarithm IS the input: no "+ 0" step.
      h === 0
        ? `log_${numText(base)}(${numText((y0 - k) / a)}) = ${numText(n)}, and there is no shift to undo, so x = ${X}.`
        : `log_${numText(base)}(${numText((y0 - k) / a)}) = ${numText(n)}, and ${numText(n)} ${h < 0 ? MINUS : '+'} ${numText(Math.abs(h))} = ${X}.`,
      `So f⁻¹(${numText(y0)}) = ${X}: f⁻¹ gives back the input ${X}.`,
    ];
    return { f, x0, y0, steps };
  }
  if (type === 'quadratic' || type === 'squareRoot' || type === 'logarithmic') return null;
  const a = nonZero(random, -7, 7);
  const b = nonZero(random, -12, 12);
  const x0 = nonZero(random, -6, 9);
  const y0 = a * x0 + b;
  const inverse = preferredInverse(a, b);
  return {
    f: { type: 'linear', a, h: 0, k: b },
    x0,
    y0,
    steps: [
      `f(${numText(x0)}) = ${linearAt(a, b, x0)} = ${numText(y0)}.`,
      `Undo f in reverse order (${sentence(undoMoves({ type: 'linear', a, h: 0, k: b }))}): f⁻¹(x) = ${inverse}.`,
      `f⁻¹(${numText(y0)}) = ${plugIn(inverse, y0)} = ${numText(x0)}.`,
      `So f⁻¹(${numText(y0)}) = ${numText(x0)}: f⁻¹ gives back the input ${numText(x0)}.`,
    ],
  };
};

const restrictionSibling = (random) => {
  const h = nonZero(random, -5, 5);
  const k = nonZero(random, -8, 8);
  const side = pick(random, ['≥', '≤']);
  const d = integer(random, 1, 4);
  const x0 = side === '≥' ? h + d : h - d;
  const y0 = d * d + k;
  const f = `(x ${h > 0 ? MINUS : '+'} ${numText(Math.abs(h))})² ${k > 0 ? '+' : MINUS} ${numText(Math.abs(k))}`;
  return {
    prompt: `Let f(x) = ${f} with its domain kept to x ${side} ${numText(h)}. Explain why the domain is restricted, then find f⁻¹(f(${numText(x0)})).`,
    steps: [
      `f is a parabola with its vertex at x = ${numText(h)}; inputs the same distance from x = ${numText(h)} give the same output, so on its whole domain f is not one-to-one.`,
      `Keeping only x ${side} ${numText(h)} leaves one side of the vertex, where each output comes from exactly one input, so f⁻¹ is a function there.`,
      `f(${numText(x0)}) = (${numText(x0)} ${h > 0 ? MINUS : '+'} ${numText(Math.abs(h))})² ${k > 0 ? '+' : MINUS} ${numText(Math.abs(k))} = ${numText(y0)}.`,
      `Undo f: ${numText(y0)} ${k > 0 ? MINUS : '+'} ${numText(Math.abs(k))} = ${numText(d * d)}, the square root on the kept side is ${side === '≥' ? '' : MINUS}${numText(d)}, and ${side === '≥' ? '' : MINUS}${numText(d)} ${h > 0 ? '+' : MINUS} ${numText(Math.abs(h))} = ${numText(x0)}.`,
    ],
    answer: `Keep x ${side} ${numText(h)} so f is one-to-one; f⁻¹(${numText(y0)}) = ${numText(x0)}`,
  };
};

const labSibling = (model, random) => {
  if (model.parts.includes('fog')) {
    const a = nonZero(random, -5, 5);
    const b = nonZero(random, -9, 9);
    const c = nonZero(random, -5, 5);
    const d = nonZero(random, -9, 9);
    const x0 = nonZero(random, -5, 6);
    if (a === c && b === d) return null;
    const g0 = c * x0 + d;
    const fog = a * g0 + b;
    const f0 = a * x0 + b;
    const gof = c * f0 + d;
    const X = numText(x0);
    const steps = [
      `(f ∘ g)(${X}) = f(g(${X})): g acts first. g(${X}) = ${linearAt(c, d, x0)} = ${numText(g0)}.`,
      `Then f(${numText(g0)}) = ${linearAt(a, b, g0)} = ${numText(fog)}, so (f ∘ g)(${X}) = ${numText(fog)}.`,
      `(g ∘ f)(${X}) = g(f(${X})): f acts first. f(${X}) = ${linearAt(a, b, x0)} = ${numText(f0)}.`,
      `Then g(${numText(f0)}) = ${linearAt(c, d, f0)} = ${numText(gof)}, so (g ∘ f)(${X}) = ${numText(gof)}.`,
    ];
    let answer = `(f ∘ g)(${X}) = ${numText(fog)} and (g ∘ f)(${X}) = ${numText(gof)}`;
    let prompt = `Let f(x) = ${linear(a, b)} and g(x) = ${linear(c, d)}. Find (f ∘ g)(${X}) and (g ∘ f)(${X}).`;
    if (model.parts.includes('inverse')) {
      const inverse = preferredInverse(a, b);
      steps.push(`f⁻¹ undoes f (${sentence(undoMoves({ type: 'linear', a, h: 0, k: b }))}): f⁻¹(x) = ${inverse}, so f⁻¹(${numText(f0)}) = ${plugIn(inverse, f0)} = ${X}.`);
      prompt = `Let f(x) = ${linear(a, b)} and g(x) = ${linear(c, d)}. Find (f ∘ g)(${X}) and (g ∘ f)(${X}), then f⁻¹(f(${X})).`;
      answer += `; f⁻¹(${numText(f0)}) = ${X}`;
    }
    return { prompt, steps, answer };
  }
  if (model.parts[0] === 'restriction' && (model.f.type || 'linear') === 'quadratic') return restrictionSibling(random);
  const type = SIBLING_TYPES.includes(model.f.type || 'linear') ? (model.f.type || 'linear') : 'linear';
  const built = undoSibling(random, type === 'exponential' ? 'exponential' : 'linear');
  if (!built) return null;
  const fText = specText(built.f);
  const restrictionStep = model.parts.includes('restriction')
    ? [`Two different inputs of f(x) = ${fText} never give the same output, so f is already one-to-one and its domain does not have to be cut down.`]
    : [];
  return {
    prompt: `Let f(x) = ${fText}. Find f(${numText(built.x0)}), then use f⁻¹ to undo it.`,
    steps: [...restrictionStep, ...built.steps],
    answer: `f⁻¹(${numText(built.y0)}) = ${numText(built.x0)}`,
  };
};

const deriveSibling = (random, { name = 'f', variable = 'x', context = null } = {}) => {
  const decimalSlope = context?.decimal;
  const a = decimalSlope ? pick(random, [0.02, 0.04, 0.05, 0.1, 0.2, 0.25, 0.5].filter((value) => value !== context.a)) : nonZero(random, -9, 9);
  if (!decimalSlope && Math.abs(a) === 1) return null;
  const b = decimalSlope ? Math.sign(context.b || 1) * 50 * integer(random, 2, 60) : nonZero(random, -15, 15);
  const rule = linear(a, b, variable);
  const inverse = preferredInverse(a, b);
  const steps = [];
  const out = variable === 'x' ? 'y' : variable;
  if (variable === 'x') steps.push(`Write y = ${rule}, then swap x and y: x = ${linear(a, b, 'y')}.`);
  else steps.push(`Let x stand for the output of ${name}: x = ${rule}.`);
  steps.push(b > 0
    ? `Subtract ${numText(b)} from both sides: x ${MINUS} ${numText(b)} = ${monomial(a, 1, out).replace(/^/, a < 0 ? MINUS : '')}.`
    : `Add ${numText(-b)} to both sides: x + ${numText(-b)} = ${monomial(a, 1, out).replace(/^/, a < 0 ? MINUS : '')}.`);
  steps.push(`Divide both sides by ${numText(a)}: ${out} = ${inverse}.`);
  steps.push(`So ${variable === 'x' ? `${name}⁻¹(x)` : `${variable} = ${name}⁻¹(x)`} = ${inverse}.`);
  let answer = `${name}⁻¹(x) = ${inverse}`;
  let prompt = variable === 'x' ? `Find the inverse of ${name}(x) = ${rule}.` : `Let ${name}(${variable}) = ${rule}. Find the inverse rule ${variable} = ${name}⁻¹(x).`;
  if (context?.value) {
    const value = decimalSlope ? 100 * integer(random, 2, 90) : nonZero(random, 2, 20);
    const amount = tidy(a * value + b);
    if (amount <= 0) return null;
    steps.push(`When ${name}(${variable}) = ${numText(amount)}: ${variable} = ${name}⁻¹(${numText(amount)}) = ${plugIn(inverse, amount)} = ${numText(value)}.`);
    prompt = `Let ${name}(${variable}) = ${rule}. Find the inverse rule ${variable} = ${name}⁻¹(x), then the value of ${variable} when ${name}(${variable}) = ${numText(amount)}.`;
    answer += `; ${variable} = ${numText(value)}`;
  } else {
    const check = nonZero(random, -5, 6);
    const y = a * check + b;
    steps.push(`Check with a number: ${name}(${numText(check)}) = ${numText(y)}, and ${name}⁻¹(${numText(y)}) = ${plugIn(inverse, y)} = ${numText(check)}.`);
  }
  return { prompt, steps, answer };
};

const relationSibling = (random, count, { asksFunction = false } = {}) => {
  const pairs = [];
  for (let tries = 0; pairs.length < count && tries < 50; tries += 1) {
    const pair = [integer(random, -9, 12), integer(random, -9, 12)];
    if (pair[0] === pair[1] || pairs.some(([x]) => x === pair[0])) continue;
    pairs.push(pair);
  }
  if (pairs.length < count) return null;
  const swapped = pairs.map(([x, y]) => [y, x]);
  const steps = [
    'An inverse relation exchanges the input and the output of every pair.',
    ...pairs.map((pair, index) => `${pairText(pair)} becomes ${pairText(swapped[index])}.`),
  ];
  let answer = setText(swapped);
  if (asksFunction) {
    const inputs = swapped.map(([x]) => x);
    const distinct = new Set(inputs).size === inputs.length;
    steps.push(`Its inputs ${inputs.map(numText).join(', ')} ${distinct ? 'are all different, so the inverse relation is a function' : 'repeat, so the inverse relation is not a function'}.`);
    answer += distinct ? '; it is a function' : '; it is not a function';
  }
  return { prompt: `Find the inverse relation of ${setText(pairs)}.`, steps, answer };
};

const propertySibling = (random, model) => {
  if (model.point !== undefined) {
    const p = nonZero(random, -9, 12);
    const P0 = numText(p);
    return {
      prompt: `A function f and its inverse meet at the point (${P0}, ${P0}) on the line y = x. Find f(${P0}) and f⁻¹(${P0}).`,
      steps: [
        `(${P0}, ${P0}) is on the graph of f: the input ${P0} gives the output ${P0}, so f(${P0}) = ${P0}.`,
        `f⁻¹ exchanges the coordinates of every point of f; exchanging (${P0}, ${P0}) gives (${P0}, ${P0}) again.`,
        `So f⁻¹(${P0}) = ${P0} as well.`,
      ],
      answer: `f(${P0}) = ${P0} and f⁻¹(${P0}) = ${P0}`,
    };
  }
  const name = model.given?.name || 'f';
  const p = integer(random, -9, 12);
  const q = integer(random, -9, 12);
  if (p === q) return null;
  return {
    prompt: `If ${name}(${numText(p)}) = ${numText(q)}, complete the matching statement about ${name}⁻¹.`,
    steps: [
      `${name}(${numText(p)}) = ${numText(q)} means ${name} takes the input ${numText(p)} to the output ${numText(q)}.`,
      `${name}⁻¹ runs ${name} backwards: it takes ${numText(q)} back to ${numText(p)}.`,
      `So the input of ${name}⁻¹ is ${numText(q)} and its output is ${numText(p)}.`,
    ],
    answer: `${name}⁻¹(${numText(q)}) = ${numText(p)}`,
  };
};

const graphSibling = (random) => {
  const p = integer(random, -6, 9);
  const q = integer(random, -6, 9);
  if (p === q) return null;
  const mid = numText((p + q) / 2);
  return {
    prompt: `The point (${numText(p)}, ${numText(q)}) is on the graph of f. Which point must be on the graph of f⁻¹?`,
    steps: [
      'f⁻¹ exchanges each input of f with its output.',
      `So (${numText(p)}, ${numText(q)}) on f gives (${numText(q)}, ${numText(p)}) on f⁻¹.`,
      `The two points are mirror images across the line y = x: halfway between them is (${mid}, ${mid}), a point of y = x.`,
    ],
    answer: `(${numText(q)}, ${numText(p)})`,
  };
};

// One operation on f and g, worked; the result's text and the steps.
const workOperation = (op, f, g, { composeOrder = 'fOfG', degree = false } = {}) => {
  const fT = polyText(f);
  const gT = polyText(g);
  if (op === 'sum') {
    const r = P.add(f, g);
    return { label: '(f + g)(x)', result: polyText(r), steps: [`(f + g)(x) = (${fT}) + (${gT}) = ${polyText(r)}.`] };
  }
  if (op === 'difference') {
    const r = P.sub(f, g);
    const negated = polyText(P.neg(g));
    const opened = `${fT} ${negated.startsWith(MINUS) ? `${MINUS} ${negated.slice(1)}` : `+ ${negated}`}`;
    return { label: `(f ${MINUS} g)(x)`, result: polyText(r), steps: [`(f ${MINUS} g)(x) = (${fT}) ${MINUS} (${gT}) = ${opened} = ${polyText(r)}.`] };
  }
  if (op === 'product') {
    const r = P.mul(f, g);
    const steps = [`(f · g)(x) = (${fT})(${gT}): multiply each term of ${fT} by each term of ${gT}, then combine like terms: ${polyText(r)}.`];
    if (degree) steps.push(`The highest power of x is ${P.degree(r)}, so the degree is ${P.degree(r)}.`);
    return { label: '(f · g)(x)', result: polyText(r), degree: P.degree(r), steps };
  }
  if (op === 'quotient') {
    const roots = realRoots(g);
    if (P.degree(g) !== 1 || roots.some((root) => Math.abs(P.at(f, root)) < 1e-9) || !roots.every(Number.isInteger)) return null;
    return {
      label: '(f / g)(x)',
      result: `(${fT})/(${gT})`,
      excluded: roots,
      steps: [
        `(f / g)(x) = (${fT})/(${gT}).`,
        `The denominator ${gT} is zero when x = ${roots.map(numText).join(' or ')}, so x = ${roots.map(numText).join(', ')} is excluded.`,
      ],
    };
  }
  if (op === 'composition') {
    const [outer, inner, label] = composeOrder === 'gOfF' ? [g, f, '(g ∘ f)(x)'] : [f, g, '(f ∘ g)(x)'];
    const r = P.compose(outer, inner);
    return { label, result: polyText(r), steps: [`${label} = ${composeOrder === 'gOfF' ? 'g' : 'f'}(${polyText(inner)}) = ${substituted(outer, polyText(inner))} = ${polyText(r)}.`] };
  }
  return null;
};

const operationsSibling = (random, { fDegree, gDegree, ops, composeOrder = 'fOfG', degree = false, excluded = false }) => {
  const needsLinearG = ops.includes('quotient') || excluded;
  const f = randomPoly(random, Math.min(Math.max(fDegree, 1), 2));
  const g = randomPoly(random, needsLinearG ? 1 : Math.min(Math.max(gDegree, 1), 2), { low: -5, high: 5 });
  if (P.equal(f, g)) return null;
  const worked = [];
  for (const op of ops) {
    const result = workOperation(op, f, g, { composeOrder, degree: degree && op === 'product' });
    if (!result) return null;
    // A sum or difference that collapses to a number is a poor model of the task.
    if ((op === 'sum' || op === 'difference') && P.degree(operate(op, f, g)) < Math.max(P.degree(f), P.degree(g))) return null;
    worked.push(result);
  }
  const steps = worked.flatMap((entry) => entry.steps);
  // One sum, difference, product or composition is a single line of work,
  // and a sibling needs two steps: check the result at a number, so every
  // one-operation item gets a worked example (it used to get none).
  if (steps.length < 2 && ops.length === 1 && ops[0] !== 'quotient') {
    const op = ops[0];
    const c = pick(random, [1, 2, 3, -1, -2]);
    const C = numText(c);
    const [fc, gc] = [P.at(f, c), P.at(g, c)];
    const result = op === 'composition'
      ? (composeOrder === 'gOfF' ? P.compose(g, f) : P.compose(f, g))
      : operate(op, f, g);
    const at = P.at(result, c);
    const label = worked[0].label.replace('(x)', `(${C})`);
    const check = op === 'composition'
      ? (composeOrder === 'gOfF'
        ? `f(${C}) = ${numText(fc)} and g(${numText(fc)}) = ${numText(P.at(g, fc))}`
        : `g(${C}) = ${numText(gc)} and f(${numText(gc)}) = ${numText(P.at(f, gc))}`)
      : `f(${C}) = ${numText(fc)} and g(${C}) = ${numText(gc)}, so ${label} = ${numText(fc)} ${{ sum: '+', difference: MINUS, product: '·' }[op]} ${sub(gc)} = ${numText(operateNumbers(op, fc, gc))}`;
    steps.push(`Check at x = ${C}: ${check}; the result ${worked[0].result} also gives ${numText(at)} at x = ${C}.`);
  }
  const pieces = worked.map((entry) => `${entry.label} = ${entry.result}`);
  if (excluded && !ops.includes('quotient')) {
    const roots = realRoots(g);
    if (!roots.length || !roots.every(Number.isInteger) || roots.some((root) => Math.abs(P.at(f, root)) < 1e-9)) return null;
    steps.push(`For (f / g)(x), the denominator ${polyText(g)} is zero when x = ${roots.map(numText).join(' or ')}, so that input is excluded.`);
    pieces.push(`excluded x = ${roots.map(numText).join(', ')}`);
  } else if (excluded) {
    const quotient = worked.find((entry) => entry.excluded);
    pieces.push(`excluded x = ${quotient.excluded.map(numText).join(', ')}`);
  }
  const product = worked.find((entry) => entry.degree !== undefined);
  if (degree && product) pieces.push(`degree ${product.degree}`);
  const asked = worked.map((entry) => entry.label);
  const promptAsks = `${asked.slice(0, -1).join(', ')}${asked.length > 1 ? ' and ' : ''}${asked[asked.length - 1]}`;
  return {
    prompt: `Given f(x) = ${polyText(f)} and g(x) = ${polyText(g)}, find ${promptAsks}${excluded ? ', and the excluded x-value of (f / g)(x)' : ''}${degree ? ', and the degree of the product' : ''}.`,
    steps,
    answer: pieces.join('; '),
  };
};

const pointwiseSibling = (random, entries) => {
  const a = nonZero(random, -5, 8);
  if (entries.some((entry) => Number(entry.arg) === a)) return null;
  const p = nonZero(random, -12, 12);
  const q = nonZero(random, -9, 9);
  const names = entries[0];
  const A = numText(a);
  const steps = [];
  const pieces = [];
  for (const entry of entries) {
    const value = operateNumbers(entry.op, p, q);
    if (value === null || !Number.isInteger(tidy(value))) return null;
    const symbol = { sum: '+', difference: MINUS, product: '·', quotient: '÷' }[entry.op];
    const label = `(${entry.left} ${OP_SYMBOL[entry.op]} ${entry.right})(${A})`;
    steps.push(`${label} = ${entry.left}(${A}) ${symbol} ${entry.right}(${A}) = ${numText(p)} ${symbol} ${sub(q)} = ${numText(value)}.`);
    pieces.push(`${label} = ${numText(value)}`);
  }
  return {
    prompt: `If ${names.left}(${A}) = ${numText(p)} and ${names.right}(${A}) = ${numText(q)}, evaluate ${pieces.map((piece) => piece.split(' = ')[0]).join(' and ')}.`,
    steps,
    answer: pieces.join('; '),
  };
};

const compositionValuesSibling = (random, entry, asksInner) => {
  const a = integer(random, -6, 9);
  const b = integer(random, -6, 9);
  const c = integer(random, -9, 12);
  if (new Set([a, b, c]).size < 3) return null;
  const { outer, inner } = entry;
  const A = numText(a);
  return {
    prompt: `If ${inner}(${A}) = ${numText(b)} and ${outer}(${numText(b)}) = ${numText(c)}, evaluate ${asksInner ? `${inner}(${A}) and ` : ''}${outer}(${inner}(${A})).`,
    steps: [
      `Work from the inside out: ${inner}(${A}) = ${numText(b)}.`,
      `Then ${outer}(${inner}(${A})) = ${outer}(${numText(b)}) = ${numText(c)}.`,
    ],
    answer: `${asksInner ? `${inner}(${A}) = ${numText(b)}; ` : ''}${outer}(${inner}(${A})) = ${numText(c)}`,
  };
};

const perturbLinear = (random, poly) => {
  const [b, a] = [poly[0] || 0, poly[1] || 0];
  let a2 = a;
  if (a === 1) a2 = 1;
  else if (!Number.isInteger(a)) a2 = pick(random, [0.7, 0.75, 0.8, 0.85, 0.9, 0.95].filter((value) => Math.abs(value - Math.abs(a)) > 1e-9)) * Math.sign(a);
  else a2 = Math.sign(a) * integer(random, 2, 6);
  let b2 = 0;
  if (b !== 0) b2 = Math.sign(b) * (Math.abs(b) >= 50 ? 25 * integer(random, 1, 12) : integer(random, 1, 12));
  return [b2, a2];
};

const contextCompositionSibling = (random, model) => {
  const nested = model.roles.filter((entry) => entry.role === 'nested');
  const names = [...new Set(nested.flatMap((entry) => [entry.inner, entry.outer]))];
  const defs = new Map();
  for (const name of names) {
    const original = model.defs.get(name);
    if (!original || P.degree(original.poly) > 1) return null;
    defs.set(name, { variable: original.variable, poly: perturbLinear(random, original.poly) });
  }
  const arg0 = nested[0].arg;
  const arg = Math.abs(arg0) >= 100 ? 100 * integer(random, 3, 30) : nonZero(random, -6, 12);
  const steps = [];
  const results = [];
  for (const entry of nested) {
    const inner = defs.get(entry.inner);
    const outer = defs.get(entry.outer);
    const v1 = P.at(inner.poly, arg);
    const v2 = P.at(outer.poly, v1);
    const label = `${entry.outer}(${entry.inner}(${numText(arg)}))`;
    steps.push(`${label}: first ${entry.inner}(${numText(arg)}) = ${linearAt(inner.poly[1], inner.poly[0], arg)} = ${numText(v1)}.`);
    steps.push(`Then ${entry.outer}(${numText(v1)}) = ${linearAt(outer.poly[1], outer.poly[0], v1)} = ${numText(v2)}.`);
    results.push([label, v2]);
  }
  if (model.roles.some((entry) => entry.role === 'orderCompare') && results.length === 2) {
    const [[l1, v1], [l2, v2]] = results;
    if (Math.abs(v1 - v2) < 1e-9) return null;
    steps.push(`${numText(Math.max(v1, v2))} is larger than ${numText(Math.min(v1, v2))}, so ${v1 > v2 ? l1 : l2} gives the larger result.`);
  }
  const rules = names.map((name) => `${name}(${defs.get(name).variable}) = ${linear(defs.get(name).poly[1], defs.get(name).poly[0], defs.get(name).variable)}`);
  return {
    prompt: `Let ${rules.join(' and ')}. Find ${results.map(([label]) => label).join(' and ')}.`,
    steps,
    answer: results.map(([label, value]) => `${label} = ${numText(value)}`).join('; '),
  };
};

const compositionSymbolicSibling = (random, model) => {
  const f = randomPoly(random, Math.min(Math.max(P.degree(model.f.poly), 1), 2), { low: -5, high: 5 });
  const g = randomPoly(random, Math.min(Math.max(P.degree(model.g.poly), 1), 2), { low: -5, high: 5 });
  if (P.equal(f, g)) return null;
  const fog = workOperation('composition', f, g, { composeOrder: 'fOfG' });
  const gof = workOperation('composition', f, g, { composeOrder: 'gOfF' });
  return {
    prompt: `For f(x) = ${polyText(f)} and g(x) = ${polyText(g)}, find (f ∘ g)(x) and (g ∘ f)(x).`,
    steps: [...fog.steps, ...gof.steps],
    answer: `(f ∘ g)(x) = ${fog.result}; (g ∘ f)(x) = ${gof.result}`,
  };
};

// "Are f and g inverses?" in the letter t. Whether the pair IS an inverse
// pair is drawn from the seed alone — never from this question's verdict.
const verificationSibling = (random) => {
  const a = pick(random, [-5, -4, -3, -2, 2, 3, 4, 5, 6]);
  const b = nonZero(random, -12, 12);
  const inverse = random() < 0.5;
  const b2 = inverse ? b : b + pick(random, [-3, -2, -1, 1, 2, 3]);
  if (b2 === 0) return null;
  const f = [b, a];
  const g = [-b2 / a, 1 / a];
  const fT = linear(a, b, 't');
  const gT = a > 0 ? `(t ${b2 > 0 ? MINUS : '+'} ${numText(Math.abs(b2))})/${numText(a)}` : `(${numText(b2)} ${MINUS} t)/${numText(-a)}`;
  const fog = P.compose(f, g);
  const gof = P.compose(g, f);
  const identity = (p) => P.equal(p, [0, 1]);
  const fogT = polyText(fog, 't');
  const gofT = polyText(gof, 't');
  const conclusion = identity(fog) && identity(gof)
    ? 'Both compositions simplify to t, so f and g are inverses.'
    : `f(g(t)) simplifies to ${fogT}, which is not t, so f and g are not inverses.`;
  return {
    prompt: `Determine whether f(t) = ${fT} and g(t) = ${gT} are inverses.`,
    steps: [
      `f(g(t)) = ${numText(a)}·(${gT}) ${b > 0 ? '+' : MINUS} ${numText(Math.abs(b))} = ${fogT}.`,
      `g(f(t)) = ${a > 0 ? `(${fT} ${b2 > 0 ? MINUS : '+'} ${numText(Math.abs(b2))})/${numText(a)}` : `(${numText(b2)} ${MINUS} (${fT}))/${numText(-a)}`} = ${gofT}.`,
      conclusion,
    ],
    answer: `f(g(t)) = ${fogT}; g(f(t)) = ${gofT}; ${identity(fog) && identity(gof) ? 'f and g are inverses' : 'f and g are not inverses'}`,
  };
};

const multiSibling = (model, random) => {
  const roles = (name) => model.roles.filter((entry) => entry.role === name);
  switch (model.kind) {
    case 'linearInverse': {
      const contextValue = roles('contextValue').length > 0;
      const decimal = !Number.isInteger(model.a);
      return deriveSibling(random, {
        name: model.def.name,
        variable: model.def.variable,
        context: contextValue || decimal ? { decimal, a: model.a, b: model.b, value: contextValue } : null,
      });
    }
    case 'inverseRelation':
      return relationSibling(random, model.relation ? Math.min(Math.max(model.pairs.length, 3), 4) : 3, { asksFunction: roles('isFunction').length > 0 });
    case 'inverseProperty':
      return propertySibling(random, model);
    case 'inverseGraph':
      return graphSibling(random);
    case 'operations': {
      const ops = roles('opSym').map((entry) => entry.op);
      const f = model.defs.get('f') || model.f;
      const g = model.defs.get('g') || model.g;
      // A degree is an answer: the sibling's product has a different one.
      const askedDegree = P.degree(f.poly) + P.degree(g.poly);
      const asksDegree = roles('degree').length > 0;
      const [fDegree, gDegree] = asksDegree ? (askedDegree === 2 ? [2, 1] : [1, 1]) : [P.degree(f.poly), P.degree(g.poly)];
      return operationsSibling(random, {
        fDegree,
        gDegree,
        ops: ops.length ? ops : ['product'],
        degree: roles('degree').length > 0,
        excluded: roles('excluded').length > 0,
      });
    }
    case 'pointwise':
      return pointwiseSibling(random, roles('opAt'));
    case 'compositionValues': {
      const entry = roles('nested')[0];
      return compositionValuesSibling(random, entry, roles('evalAt').length > 0);
    }
    case 'contextComposition':
      return contextCompositionSibling(random, model);
    case 'compositionSymbolic':
      return compositionSymbolicSibling(random, model);
    case 'inverseVerification':
      return verificationSibling(random);
    default:
      return null;
  }
};

export const similarProblem = (question, { seed = 0 } = {}) => {
  try {
    const model = readModel(question);
    if (!model) return null;
    const guard = guardOf(question);
    const random = randomFrom(hashText(`${Number(seed) || 0}|${fingerprint(question)}`));
    for (let attempt = 0; attempt < 400; attempt += 1) {
      let example = null;
      if (model.kind === 'lab') example = labSibling(model, random);
      else if (model.kind === 'derive') example = deriveSibling(random);
      else if (model.kind === 'ops') {
        example = operationsSibling(random, {
          fDegree: P.degree(model.fPoly),
          gDegree: P.degree(model.gPoly),
          ops: model.operations,
          composeOrder: model.composeOrder,
          excluded: model.operations.includes('quotient'),
        });
      } else example = multiSibling(model, random);
      if (siblingIsSafe(question, guard, example)) {
        return { prompt: text(example.prompt), steps: example.steps.map(text).filter(Boolean), answer: text(example.answer) };
      }
    }
    return null;
  } catch {
    return null;
  }
};

/* ------------------------------------------------ "Let's back up" */

// Which button comes first follows what the student sees, so the right
// answer is not always the first one.
const ordered = (prompt, correct, wrong, basis) => ({
  prompt,
  options: hashText(basis) % 2 === 1 ? [wrong, correct] : [correct, wrong],
  correct,
});
const capital = (value) => value.charAt(0).toUpperCase() + value.slice(1);

const backUpCandidates = (model, question) => {
  const basis = fingerprint(question);
  const out = [];
  const undoFirst = (rule, moves, name = 'f') => {
    if (moves.length >= 2) {
      out.push(ordered(`Let’s back up. To undo ${name}(x) = ${rule}, which step do you undo first?`, capital(moves[0]), capital(moves[1]), basis));
    } else if (moves.length === 1) {
      const wrong = moves[0].startsWith('divide by') ? moves[0].replace(/^divide by/, 'multiply by') : moves[0].replace(/^subtract/, 'multiply by').replace(/^add/, 'divide by');
      out.push(ordered(`Let’s back up. To undo ${name}(x) = ${rule}, what do you do?`, capital(moves[0]), capital(wrong), basis));
    }
    out.push(ordered(`Let’s back up. To undo ${name}, which step do you undo first?`, 'The last thing it does', 'The first thing it does', basis));
  };
  switch (model.kind) {
    case 'lab':
      if (model.parts.includes('fog')) {
        out.push(ordered(`Let’s back up. In (f ∘ g)(${numText(model.x)}), which function acts on ${numText(model.x)} first?`, 'g, the inside function', 'f, the outside function', basis));
        out.push(ordered('Let’s back up. In (f ∘ g), which function acts on the input first?', 'g, the inside function', 'f, the outside function', basis));
      } else if (model.parts[0] === 'restriction') {
        out.push(ordered(`Let’s back up. Before f(x) = ${model.fRule} can have an inverse function, what must be true?`, 'Each output comes from only one input', 'Each input gives two outputs', basis));
        out.push(ordered('Let’s back up. Before f can have an inverse function, what must be true?', 'Each output comes from only one input', 'Each input gives two outputs', basis));
      } else {
        undoFirst(model.fRule, undoMoves(model.f));
      }
      break;
    case 'derive':
      out.push(ordered(`Let’s back up. What is the first move in finding the inverse of y = ${model.rule}?`, 'Swap x and y', 'Change the sign of every term', basis));
      out.push(ordered('Let’s back up. What is the first move in finding an inverse from y = f(x)?', 'Swap x and y', 'Change the sign of every term', basis));
      break;
    case 'ops': {
      if (model.operations.includes('quotient')) {
        out.push(ordered('Let’s back up. Which inputs must be left out of the domain of (f / g)(x)?', 'Inputs that make g(x) zero', 'Inputs that make f(x) zero', basis));
      } else if (model.operations.includes('composition')) {
        const [inner, outer] = model.composeOrder === 'gOfF' ? ['f', 'g'] : ['g', 'f'];
        out.push(ordered(`Let’s back up. In ${opsLabel('composition', model.composeOrder)}, which rule goes inside the other?`, `${inner}(x) goes inside ${outer}`, `${outer}(x) goes inside ${inner}`, basis));
      } else if (model.operations.includes('difference')) {
        out.push(ordered('Let’s back up. When you subtract g(x), which terms of g change sign?', 'Every term of g', 'Only the first term of g', basis));
      } else {
        out.push(ordered('Let’s back up. To multiply or add f(x) and g(x), which terms do you combine at the end?', 'Like terms (the same power of x)', 'Every term with every other term', basis));
      }
      break;
    }
    case 'linearInverse': {
      const { def } = model;
      const moves = [];
      if (model.b !== 0) moves.push(model.b > 0 ? `subtract ${numText(model.b)} from both sides` : `add ${numText(-model.b)} to both sides`);
      if (model.a !== 1) moves.push(`divide both sides by ${numText(model.a)}`);
      const solved = def.variable === 'x' ? 'y' : def.variable;
      const equation = `x = ${withLetter(def.rule, def.variable, solved)}`;
      if (moves.length >= 2) {
        out.push(ordered(`Let’s back up. To solve ${equation} for ${solved}, which do you do first?`, capital(moves[0]), capital(moves[1]), basis));
      }
      out.push(ordered(`Let’s back up. To solve for ${solved} after the swap, which do you undo first?`, 'The added number', 'The multiplication', basis));
      break;
    }
    case 'inverseRelation': {
      const pair = model.pairs[0];
      out.push(ordered(`Let’s back up. In the pair ${pairText(pair)}, which number is the input of the original relation?`, numText(pair[0]), numText(pair[1]), basis));
      out.push(ordered('Let’s back up. In each ordered pair of the relation, which number is the input?', 'The first number', 'The second number', basis));
      break;
    }
    case 'inverseProperty':
      if (model.given) {
        const { name, input, output } = model.given;
        out.push(ordered(`Let’s back up. In ${name}(${numText(input)}) = ${numText(output)}, which number is the input of ${name}?`, numText(input), numText(output), basis));
        out.push(ordered(`Let’s back up. In a statement ${name}(a) = b, which letter is the input of ${name}?`, 'a', 'b', basis));
      } else {
        out.push(ordered('Let’s back up. What is true of every point on the line y = x?', 'Its two coordinates are equal', 'Its coordinates are opposites', basis));
      }
      break;
    case 'inverseGraph':
      out.push(ordered('Let’s back up. Exchanging the coordinates of (2, 5) gives which point?', '(5, 2)', `(${MINUS}2, ${MINUS}5)`, basis));
      break;
    case 'operations':
      if (model.roles.some((entry) => entry.role === 'excluded')) {
        out.push(ordered('Let’s back up. Which inputs must be left out of the domain of (f / g)(x)?', 'Inputs that make g(x) zero', 'Inputs that make f(x) zero', basis));
      } else if (model.roles.some((entry) => entry.op === 'product')) {
        out.push(ordered(`Let’s back up. To multiply f(x) by g(x), what multiplies each term of f?`, 'Every term of g', 'Only the first term of g', basis));
      } else if (model.roles.some((entry) => entry.op === 'difference')) {
        out.push(ordered('Let’s back up. When you subtract g(x), which terms of g change sign?', 'Every term of g', 'Only the first term of g', basis));
      } else {
        out.push(ordered('Let’s back up. To add f(x) and g(x), which terms do you combine?', 'Like terms (the same power of x)', 'Every term with every other term', basis));
      }
      break;
    case 'pointwise': {
      const entry = model.roles.find((item) => item.role === 'opAt');
      const a = numText(Number(entry.arg));
      out.push(ordered(`Let’s back up. To find ${text(entry.field.label)}, which two numbers do you combine?`, `${entry.left}(${a}) and ${entry.right}(${a})`, `${entry.left}(${a}) and ${a}`, basis));
      out.push(ordered('Let’s back up. To find (f + g) at an input, which two numbers do you combine?', 'The outputs of f and g at that input', 'The output of f and the input', basis));
      break;
    }
    case 'compositionValues':
    case 'contextComposition': {
      const entry = model.roles.find((item) => item.role === 'nested');
      out.push(ordered(`Let’s back up. In ${entry.outer}(${entry.inner}(${numText(entry.arg)})), which function do you use first?`, `${entry.inner}, the inside function`, `${entry.outer}, the outside function`, basis));
      out.push(ordered('Let’s back up. In a composition, which function do you use first?', 'The inside function', 'The outside function', basis));
      break;
    }
    case 'compositionSymbolic':
      out.push(ordered('Let’s back up. In (f ∘ g)(x), which rule goes inside the other?', 'g(x) goes inside f', 'f(x) goes inside g', basis));
      break;
    case 'inverseVerification':
      out.push(ordered('Let’s back up. To build f(g(u)), what goes in place of every u in the rule of f?', 'The whole rule of g', 'Only the number in the rule of g', basis));
      break;
    default:
      break;
  }
  return out;
};

export const backUpQuestion = (question) => {
  try {
    const model = readModel(question);
    if (!model) return null;
    const guard = guardOf(question);
    return backUpCandidates(model, question)
      .find((step) => [step.prompt, ...step.options].every((piece) => safeText(piece, guard))) || null;
  } catch {
    return null;
  }
};

/* ---------------------------------------------------------------------------
 * workedSolution: THIS question's worked solution, for the review panel once
 * the question is closed (closedQuestionReview.js). It states the answer, so
 * nothing shown while the item is open (hints, the back-up step, siblings)
 * ever calls it. The steps are the siblings' own moves — the derivation of an
 * inverse, the inside-out evaluation, a composition written out — on this
 * item's own rules and numbers. Every answer is computed here, then held to
 * the item's key: a multiAnswer field's own grader (matchesFieldAnswer) must
 * accept the stated answer, which is the computed value or the key itself
 * once the key is shown to be that value; a tool's answer is the one its key
 * (the lab's helpers, deriveFunctionOperations) gives. null whenever any part
 * cannot be explained exactly — never a wrong step.
 * ------------------------------------------------------------------------- */

const accepts = (field, spelling) => {
  try {
    return Boolean(text(spelling)) && matchesFieldAnswer(text(spelling), field);
  } catch {
    return false;
  }
};
const isChoiceField = (field) => Array.isArray(field?.options) && field.options.length > 0;
const keyTextsOf = (field) => answerCandidatesForField(field)
  .filter((value) => value !== null && typeof value !== 'object')
  .map(text)
  .filter(Boolean);

/*
 * The spelling of one field's answer to state: a computed spelling the field's
 * grader accepts, or a key the computation shows to be the same value (a
 * choice states its own option first). null when neither: then the key is not
 * what this module computes, and the item is not explained.
 */
const statedFor = (field, computed, sameAs) => {
  const keys = keyTextsOf(field).filter((key) => {
    try { return Boolean(sameAs(key)); } catch { return false; }
  });
  const mine = unique(computed);
  const order = isChoiceField(field) ? [...keys, ...mine] : [...mine, ...keys];
  return unique(order).find((spelling) => accepts(field, spelling)) || null;
};
const constantOf = (raw) => {
  const poly = parsePolynomial(raw);
  return poly && P.degree(poly) === 0 ? poly[0] : null;
};
const numberStated = (field, value) => (Number.isFinite(value)
  ? statedFor(field, [numText(value), String(tidy(value)), ...(tidy(value) < 0 ? [`-${numText(-value)}`] : [])], (key) => {
    const keyed = constantOf(key);
    return keyed !== null && Math.abs(keyed - value) <= 1e-9 * Math.max(1, Math.abs(value));
  })
  : null);
const polyStated = (field, poly, variable = 'x') => statedFor(field, [polyText(poly, variable)], (key) => {
  const keyed = parsePolynomial(key, variable);
  return keyed && P.equal(keyed, poly);
});
const sameText = (left, right) => normalizeMath(left).toLowerCase() === normalizeMath(right).toLowerCase();

// A polynomial's terms, highest power first, and terms written out in a given order.
const termsOf = (p) => {
  const out = [];
  P.trim(p).forEach((c, power) => { if (tidy(c) !== 0) out.unshift([c, power]); });
  return out;
};
const termsText = (terms, variable = 'x') => (terms.length ? terms.map(([c, power], index) => {
  const body = monomial(c, power, variable);
  if (index === 0) return c < 0 ? `${MINUS}${body}` : body;
  return `${c < 0 ? MINUS : '+'} ${body}`;
}).join(' ') : '0');
/** "a = b = c" with any link that repeats the one before it dropped. */
const chain = (...links) => links.filter((link, index) => link && link !== links[index - 1]).join(' = ');

/** Every term of a polynomial with x replaced by (inner); a fraction coefficient in parentheses: (1/3)(3x − 6) + 2. */
const substitutedText = (outer, innerText) => termsOf(outer).map(([c, power], index) => {
  const magnitude = Math.abs(tidy(c));
  const shown = numText(magnitude);
  const factor = power === 0 ? '' : `(${innerText})${SUPERSCRIPT[power] || (power === 1 ? '' : `^${power}`)}`;
  const coefficient = power === 0 ? shown : magnitude === 1 ? '' : shown.includes('/') ? `(${shown})` : shown;
  const body = `${coefficient}${factor}` || shown;
  if (index === 0) return c < 0 ? `${MINUS}${body}` : body;
  return `${c < 0 ? MINUS : '+'} ${body}`;
}).join(' ');
/** outer(inner): the substitution, every term multiplied out, then like terms combined. */
const compositionChain = (outer, inner, innerText) => {
  const pieces = termsOf(outer).flatMap(([c, power]) => termsOf(P.scale(P.pow(inner, power), c)));
  return chain(substitutedText(outer, innerText), termsText(pieces), polyText(P.compose(outer, inner)));
};
/** The value of a rule at a number, written out: 2·4 − 5, 3(4)² − 2(4) + 1. */
const valueText = (poly, value) => (P.degree(poly) <= 1 ? linearAt(poly[1] || 0, poly[0] || 0, value) : substitutedText(poly, numText(value)));
/** A rule written as a fraction, (x + 6)/3, is first rewritten term by term. */
const termByTerm = (name, definition) => (definition.rule && !sameText(definition.rule, polyText(definition.poly))
  ? [`Written term by term, ${name}(x) = ${definition.rule} is ${polyText(definition.poly)}.`]
  : []);

/** y = a·v + b solved for v after the swap: the moves the derivation sibling writes. */
const derivation = (a, b, { name = 'f', variable = 'x', rule: authored = linear(a, b, variable) } = {}) => {
  // An authored zero term (x + 0, 0 + 3x) is left out: the rule is written as it simplifies.
  const rule = /[+\-−]\s*0(?![\d.])|^\s*0\s*[+\-−]/.test(authored) ? linear(a, b, variable) : authored;
  const out = variable === 'x' ? 'y' : variable;
  const inverse = preferredInverse(a, b);
  const steps = [variable === 'x'
    ? `Write y = ${rule}, then swap x and y: x = ${withLetter(rule, 'x', 'y')}.`
    : `Let x stand for the output of ${name}: x = ${rule}.`];
  const aTerm = `${a < 0 ? MINUS : ''}${monomial(a, 1, out)}`;
  if (tidy(b) !== 0) {
    steps.push(b > 0
      ? `Subtract ${numText(b)} from both sides: x ${MINUS} ${numText(b)} = ${aTerm}.`
      : `Add ${numText(-b)} to both sides: x + ${numText(-b)} = ${aTerm}.`);
  }
  if (tidy(a) === -1) steps.push(`Multiply both sides by ${MINUS}1: ${out} = ${inverse}.`);
  else if (tidy(a) !== 1) steps.push(`Divide both sides by ${numText(a)}: ${out} = ${inverse}.`);
  return { steps, inverse, poly: [-b / a, 1 / a] };
};

/** How a field and its stated answer read in the closing line: "f(4) = 3", "Input to f⁻¹: 2". */
const answerPiece = (field, stated) => {
  const label = text(field.label || field.prompt || field.id);
  if (/^[A-Za-z0-9()⁻¹+\-−·*/∘.\s]+$/.test(label) && label.includes('(')) return `${label} = ${stated}`;
  // A label that is a sentence reads on in lower case: "so if f(1)=3, then f⁻¹(3)=1".
  const sentence = /^[A-Z][a-z]/.test(label) ? `${label[0].toLowerCase()}${label.slice(1)}` : label;
  if (/(?:=|,\s*then|\b(?:is|are|as|by))\s*$/i.test(label)) return `${sentence} ${stated}`;
  return `${sentence.replace(/[:?]\s*$/, '')}: ${stated}`;
};

/** One operation on two named rules, worked: { steps, poly | quotient }. */
const operationWork = (op, left, right, names, arg = 'x') => {
  const [L, R] = names;
  const lT = polyText(left.poly);
  const rT = polyText(right.poly);
  const label = `(${L} ${OP_SYMBOL[op]} ${R})(${arg})`;
  if (op === 'sum') {
    const result = P.add(left.poly, right.poly);
    return { label, poly: result, steps: [`${label} = (${lT}) + (${rT}) = ${chain(termsText([...termsOf(left.poly), ...termsOf(right.poly)]), polyText(result))}.`] };
  }
  if (op === 'difference') {
    const result = P.sub(left.poly, right.poly);
    return { label, poly: result, steps: [`${label} = (${lT}) ${MINUS} (${rT}) = ${chain(termsText([...termsOf(left.poly), ...termsOf(P.neg(right.poly))]), polyText(result))}.`] };
  }
  if (op === 'product') {
    const result = P.mul(left.poly, right.poly);
    const distributed = termsOf(left.poly).flatMap(([c, p]) => termsOf(right.poly).map(([d, q]) => [c * d, p + q]));
    const multiplied = termsOf(right.poly).length > 1 || termsOf(left.poly).length > 1 ? 'multiply each term of the first by each term of the second, then combine like terms' : 'multiply';
    return { label, poly: result, steps: [`${label} = (${lT})(${rT}): ${multiplied}: ${chain(termsText(distributed), polyText(result))}.`] };
  }
  if (op === 'quotient') return { label, quotient: `(${lT})/(${rT})`, steps: [`${label} = (${lT})/(${rT}).`] };
  if (op === 'composition') {
    return {
      label,
      poly: P.compose(left.poly, right.poly),
      steps: [...termByTerm(L, left), `${label} = ${L}(${right.rule || rT}) = ${compositionChain(left.poly, right.poly, right.rule || rT)}.`],
    };
  }
  return null;
};

/** The real zeros of a denominator, when each one is written exactly. */
const exactRoots = (p) => {
  const roots = realRoots(p);
  const written = (root) => Math.abs(P.at(p, root)) < 1e-9 && (Number.isInteger(root) || Math.abs(Number(numText(root).replace(MINUS, '-')) - root) < 1e-12);
  return roots.every(written) ? roots : null;
};
const isRestricted = (spec) => isObject(spec?.domain) || isObject(spec?.restrictedDomain);

// A substitution written out, then its value; an identity rule (x − 0) writes the value once.
const workedValue = (written, shown) => (sameText(written, shown) ? shown : `${written} = ${shown}`);
// A divisor as written after ÷: a negative or a fraction in brackets (1 ÷ 2/3 would read as (1 ÷ 2)/3).
const divisor = (value) => (numText(value).includes('/') ? `(${numText(value)})` : sub(value));

const multiWorked = (model) => {
  const steps = [];
  const answers = [];
  const role = (name) => model.roles.filter((entry) => entry.role === name);
  const def = (name) => model.defs.get(name) || null;
  const nameOf = model.def?.name || 'f';
  let inverse = null;
  const ensureInverse = () => {
    if (inverse || model.kind !== 'linearInverse') return inverse;
    inverse = derivation(model.a, model.b, { name: model.def.name, variable: model.def.variable, rule: model.def.rule });
    steps.push(...inverse.steps);
    return inverse;
  };
  for (const entry of model.roles) {
    const { field } = entry;
    let stated = null;
    switch (entry.role) {
      case 'inverseRule': {
        const worked = ensureInverse();
        if (!worked) return null;
        stated = polyStated(field, worked.poly);
        if (stated) steps.push(`So ${model.def.variable === 'x' ? `${nameOf}⁻¹(x)` : `${model.def.variable} = ${nameOf}⁻¹(x)`} = ${stated}.`);
        break;
      }
      case 'inverseSlope': {
        const worked = ensureInverse();
        if (!worked) return null;
        stated = numberStated(field, 1 / model.a);
        if (stated) steps.push(`${nameOf}⁻¹ undoes multiplying by ${numText(model.a)}, so its slope is 1 ÷ ${divisor(model.a)} = ${stated}.`);
        break;
      }
      case 'inverseCheck': {
        const statement = `${entry.name}⁻¹(${numText(entry.output)}) = ${numText(entry.input)}`;
        const definition = def(entry.name);
        if (definition && Math.abs(P.at(definition.poly, entry.input) - entry.output) > 1e-9) return null;
        stated = statedFor(field, [statement], (key) => sameText(key, statement));
        if (stated) steps.push(`${entry.name}(${numText(entry.input)}) = ${numText(entry.output)} means ${entry.name} takes ${numText(entry.input)} to ${numText(entry.output)}; ${entry.name}⁻¹ runs ${entry.name} backwards, taking ${numText(entry.output)} back to ${numText(entry.input)}: ${stated}.`);
        break;
      }
      case 'compositionCheck': {
        const worked = ensureInverse();
        if (!worked) return null;
        const outerFirst = `${nameOf}(${nameOf}⁻¹(x))`;
        stated = statedFor(field, [outerFirst], (key) => sameText(key, outerFirst) || sameText(key, `${nameOf}⁻¹(${nameOf}(x))`));
        if (stated) {
          const innerText = worked.inverse;
          steps.push(`An inverse undoes ${nameOf}, so composing them gives back x: ${nameOf}(${nameOf}⁻¹(x)) = ${compositionChain(model.def.poly, worked.poly, innerText)}. The composition to check is ${stated}.`);
        }
        break;
      }
      case 'contextValue': {
        const worked = ensureInverse();
        if (!worked) return null;
        const value = (entry.amount - model.b) / model.a;
        stated = numberStated(field, value);
        if (stated) steps.push(`When ${nameOf}(${model.def.variable}) = ${numText(entry.amount)}: ${model.def.variable} = ${nameOf}⁻¹(${numText(entry.amount)}) = ${plugIn(worked.inverse, entry.amount)} = ${stated}.`);
        break;
      }
      case 'inverseRelation': {
        const swapped = model.pairs.map(([x, y]) => [y, x]);
        if (!steps.some((step) => step.startsWith('An inverse relation'))) {
          steps.push('An inverse relation exchanges the input and the output of every pair.', ...model.pairs.map((pair, index) => `${pairText(pair)} becomes ${pairText(swapped[index])}.`));
        }
        stated = statedFor(field, [setText(swapped)], (key) => {
          const keyed = pairsIn(key);
          return keyed.length === swapped.length && swapped.every(([x, y]) => keyed.some(([p, q]) => p === x && q === y));
        });
        if (stated) steps.push(`So the inverse relation is ${stated}.`);
        break;
      }
      case 'swapPair': {
        if (!entry.pair) return null;
        const swapped = [entry.pair[1], entry.pair[0]];
        stated = statedFor(field, [pairText(swapped)], (key) => {
          const keyed = pairsIn(key);
          return keyed.length === 1 && keyed[0][0] === swapped[0] && keyed[0][1] === swapped[1];
        });
        if (stated) steps.push(`Swapping exchanges the two coordinates: ${pairText(entry.pair)} becomes ${stated}.`);
        break;
      }
      case 'relationProperty':
        stated = statedFor(field, [], (key) => /\bswap|exchang|switch|interchang/i.test(key) && !/sign|negat|revers|add/i.test(key));
        if (stated) steps.push(`In every pair the input and the output trade places, so the move is: ${stated}.`);
        break;
      case 'isFunction': {
        if (model.kind !== 'inverseRelation') return null;
        const inputs = model.pairs.map(([, y]) => y);
        const distinct = new Set(inputs).size === inputs.length;
        stated = statedFor(field, [], (key) => (distinct ? /^yes/i.test(key) : /^no/i.test(key)));
        if (stated) {
          steps.push(distinct
            ? `The inputs of the inverse relation, ${inputs.map(numText).join(', ')}, are all different, so each input has exactly one output: it is a function (${stated}).`
            : `An input of the inverse relation repeats among ${inputs.map(numText).join(', ')}, so that input has two outputs: it is not a function (${stated}).`);
        }
        break;
      }
      case 'evalDef': {
        const poly = parsePolynomial(entry.raw, entry.variable);
        if (!poly) return null;
        const value = P.at(poly, entry.arg);
        stated = numberStated(field, value);
        if (stated) steps.push(`${entry.name}(${numText(entry.arg)}) = ${valueText(poly, entry.arg)} = ${stated}.`);
        break;
      }
      case 'evalAt': {
        if (model.kind === 'inverseProperty' && model.point !== undefined) {
          const P0 = numText(model.point);
          stated = numberStated(field, model.point);
          if (stated) steps.push(`(${P0}, ${P0}) is on the graph of ${entry.name}: the input ${P0} gives the output ${P0}, so ${entry.name}(${P0}) = ${stated}.`);
          break;
        }
        const definition = def(entry.name);
        if (definition) {
          const value = P.at(definition.poly, entry.arg);
          stated = numberStated(field, value);
          if (stated) steps.push(`${entry.name}(${numText(entry.arg)}) = ${valueText(definition.poly, entry.arg)} = ${stated}.`);
          break;
        }
        const given = model.givens.find((item) => item.name === entry.name && Math.abs(item.input - entry.arg) < 1e-9);
        if (!given) return null;
        stated = numberStated(field, given.output);
        if (stated) steps.push(`Work from the inside out: ${entry.name}(${numText(entry.arg)}) = ${stated}, as given.`);
        break;
      }
      case 'inverseAt': {
        if (model.point === undefined) return null;
        const P0 = numText(model.point);
        stated = numberStated(field, model.point);
        if (stated) steps.push(`${entry.name}⁻¹ exchanges the coordinates of every point of ${entry.name}; exchanging (${P0}, ${P0}) gives (${P0}, ${P0}) again, so ${entry.name}⁻¹(${P0}) = ${stated}.`);
        break;
      }
      case 'inverseInput':
      case 'inverseOutput': {
        if (!model.given) return null;
        const { name, input, output } = model.given;
        if (!steps.length) {
          steps.push(
            `${name}(${numText(input)}) = ${numText(output)} means ${name} takes the input ${numText(input)} to the output ${numText(output)}.`,
            `${name}⁻¹ runs ${name} backwards: it takes ${numText(output)} back to ${numText(input)}, so ${name}⁻¹(${numText(output)}) = ${numText(input)}.`,
          );
        }
        const value = entry.role === 'inverseInput' ? output : input;
        stated = numberStated(field, value);
        if (stated) steps.push(`So the ${entry.role === 'inverseInput' ? 'input' : 'output'} of ${name}⁻¹ is ${stated}.`);
        break;
      }
      case 'graphRole':
        stated = statedFor(field, [], (key) => /reflect|mirror/i.test(key));
        if (stated) steps.push(`f⁻¹ exchanges the coordinates of every point of f, and exchanging (a, b) for (b, a) mirrors a point across the line y = x: y = x acts as ${stated}.`);
        break;
      case 'lineSlope':
        stated = numberStated(field, 1);
        if (stated) steps.push(`In y = x, y goes up by 1 each time x goes up by 1, so the slope of y = x is ${stated}.`);
        break;
      case 'opSym': {
        const left = def(entry.left);
        const right = def(entry.right);
        if (!left || !right) return null;
        const worked = operationWork(entry.op, left, right, [entry.left, entry.right]);
        if (!worked) return null;
        steps.push(...worked.steps);
        stated = worked.quotient
          ? statedFor(field, [worked.quotient], (key) => sameText(key, worked.quotient))
          : polyStated(field, worked.poly);
        if (stated && !worked.quotient && !sameText(stated, polyText(worked.poly))) steps.push(`So ${worked.label} = ${stated}.`);
        break;
      }
      case 'excluded': {
        const quotient = model.roles.find((item) => item.role === 'opSym' && item.op === 'quotient');
        const denominatorName = quotient?.right || 'g';
        const denominator = def(denominatorName);
        if (!denominator) return null;
        const roots = exactRoots(denominator.poly);
        if (!roots || !roots.length) return null;
        stated = roots.length === 1
          ? numberStated(field, roots[0])
          : statedFor(field, [roots.map(numText).join(', ')], () => false);
        if (stated) steps.push(`A quotient cannot divide by zero: its denominator ${denominator.rule} = 0 when x = ${roots.map(numText).join(' or x = ')}, so the excluded input is ${stated}.`);
        break;
      }
      case 'degree': {
        const product = model.roles.find((item) => item.role === 'opSym' && item.op === 'product');
        const left = def(product?.left || 'f');
        const right = def(product?.right || 'g');
        if (!left || !right) return null;
        const degree = P.degree(P.mul(left.poly, right.poly));
        stated = numberStated(field, degree);
        if (stated) steps.push(`The highest power of x in the product is ${degree} (${P.degree(left.poly)} + ${P.degree(right.poly)}), so the degree is ${stated}.`);
        break;
      }
      case 'opAt': {
        const arg = Number(entry.arg);
        const p = valueOf(model, entry.left, arg);
        const q = valueOf(model, entry.right, arg);
        const value = p === null || q === null ? null : operateNumbers(entry.op, p, q);
        if (value === null) return null;
        const symbol = { sum: '+', difference: MINUS, product: '·', quotient: '÷' }[entry.op];
        stated = numberStated(field, value);
        if (stated) steps.push(`(${entry.left} ${OP_SYMBOL[entry.op]} ${entry.right})(${numText(arg)}) = ${entry.left}(${numText(arg)}) ${symbol} ${entry.right}(${numText(arg)}) = ${numText(p)} ${symbol} ${entry.op === 'quotient' ? divisor(q) : sub(q)} = ${stated}.`);
        break;
      }
      case 'nested': {
        const inner = valueOf(model, entry.inner, entry.arg);
        const outer = inner === null ? null : valueOf(model, entry.outer, inner);
        if (outer === null) return null;
        const innerDef = def(entry.inner);
        const outerDef = def(entry.outer);
        const label = `${entry.outer}(${entry.inner}(${numText(entry.arg)}))`;
        stated = numberStated(field, outer);
        if (!stated) break;
        if (innerDef && outerDef) {
          steps.push(`${label}: first ${entry.inner}(${numText(entry.arg)}) = ${workedValue(valueText(innerDef.poly, entry.arg), numText(inner))}.`);
          steps.push(`Then ${entry.outer}(${numText(inner)}) = ${workedValue(valueText(outerDef.poly, inner), stated)}, so ${label} = ${stated}.`);
        } else {
          if (!steps.some((step) => step.startsWith('Work from the inside out'))) steps.push(`Work from the inside out: ${entry.inner}(${numText(entry.arg)}) = ${numText(inner)}.`);
          steps.push(`Then ${label} = ${entry.outer}(${numText(inner)}) = ${stated}.`);
        }
        break;
      }
      case 'orderCompare': {
        const nested = role('nested');
        if (nested.length !== 2) return null;
        const results = nested.map((item) => {
          const inner = valueOf(model, item.inner, item.arg);
          return { item, value: inner === null ? null : valueOf(model, item.outer, inner) };
        });
        if (results.some((result) => result.value === null)) return null;
        const [first, second] = results;
        if (Math.abs(first.value - second.value) < 1e-9) {
          stated = statedFor(field, [], (key) => /equal|same/i.test(key));
          if (stated) steps.push(`Both orders give ${numText(first.value)}: ${stated}.`);
          break;
        }
        const [big, small] = first.value > second.value ? [first, second] : [second, first];
        const symbol = (item) => `${item.outer}∘${item.inner}`;
        const flatKey = (key) => key.replace(/\s+/g, '');
        stated = statedFor(field, [], (key) => flatKey(key).includes(symbol(big.item)) && !flatKey(key).includes(symbol(small.item)));
        if (stated) {
          steps.push(`${numText(big.value)} is larger than ${numText(small.value)}, so ${big.item.outer}(${big.item.inner}(${numText(big.item.arg)})) — the order ${big.item.outer} ∘ ${big.item.inner}, ${big.item.inner} first — gives the larger result: ${stated}.`);
        }
        break;
      }
      case 'verdict': {
        if (model.kind !== 'inverseVerification') return null;
        const fog = P.compose(model.f.poly, model.g.poly);
        const gof = P.compose(model.g.poly, model.f.poly);
        const identity = (p) => P.equal(p, [0, 1]);
        const yes = identity(fog) && identity(gof);
        stated = statedFor(field, [], (key) => (yes ? /^yes/i.test(key) : /^no/i.test(key)));
        if (stated) {
          const failing = identity(fog) ? ['(g ∘ f)(x)', gof] : ['(f ∘ g)(x)', fog];
          steps.push(yes
            ? `Both compositions simplify to x, so each function undoes the other: f and g are inverses (${stated}).`
            : `${failing[0]} simplifies to ${polyText(failing[1])}, which is not x, so f and g are not inverses (${stated}).`);
        }
        break;
      }
      default:
        return null;
    }
    if (!stated) return null;
    answers.push(answerPiece(field, stated));
  }
  const pieces = answers;
  if (!pieces.length) return null;
  const HEADLINES = {
    linearInverse: 'Swap x and y in y = f(x), then solve for y: the result is the inverse.',
    inverseRelation: 'An inverse relation exchanges the input and the output of every pair.',
    inverseProperty: 'An inverse runs a function backwards: f(a) = b exactly when f⁻¹(b) = a.',
    inverseGraph: 'Inverse graphs are mirror images across the line y = x.',
    operations: 'Combine the two rules term by term, then combine like terms.',
    pointwise: 'Combine the two outputs at the same input.',
    compositionValues: 'Evaluate a composition from the inside out.',
    contextComposition: 'Evaluate each composition from the inside out: the inside function acts first.',
    compositionSymbolic: 'Put the whole inside rule in place of x in the outside rule, then simplify.',
    inverseVerification: 'Two functions are inverses exactly when both compositions simplify to x.',
  };
  const summary = pieces.join('; ');
  // A one-answer item whose last step already says it is not closed twice.
  const closing = `So ${summary}.`;
  return {
    headline: HEADLINES[model.kind] || '',
    steps: steps.at(-1) === closing ? steps : [...steps, closing],
    answerSummary: /^[a-z][a-z]/.test(summary) ? `${summary[0].toUpperCase()}${summary.slice(1)}` : summary,
  };
};

/* The tools: the derivation lab, the inverse/composition lab on lines, the operations workbench. */

const deriveWorked = (model) => {
  const worked = derivation(model.a, model.b, { rule: model.rule });
  return {
    headline: 'Swap x and y in y = f(x), then solve for y: the result is the inverse.',
    steps: [...worked.steps, `So y = ${worked.inverse}.`],
    answerSummary: `y = ${worked.inverse}`,
  };
};

const labWorked = (model) => {
  const fLine = (model.f.type || 'linear') === 'linear' ? linearSpec(model.f) : null;
  const gLine = (model.g.type || 'linear') === 'linear' ? linearSpec(model.g) : null;
  if (!fLine || isRestricted(model.f)) return null;
  const { x, parts } = model;
  const X = numText(x);
  const f0 = tidy(fLine.a * x + fLine.b);
  if (!Number.isFinite(model.fx) || Math.abs(model.fx - f0) > 1e-9) return null;
  const steps = model.locked ? [] : [`Use the input x = ${X}.`];
  const pieces = [];
  if (parts.includes('fog') || parts.includes('gof')) {
    if (!gLine || isRestricted(model.g)) return null;
    const g0 = tidy(gLine.a * x + gLine.b);
    const fog = tidy(fLine.a * g0 + fLine.b);
    const gof = tidy(gLine.a * f0 + gLine.b);
    if (Math.abs(fog - model.fog) > 1e-9 || Math.abs(gof - model.gof) > 1e-9) return null;
    steps.push(
      `(f ∘ g)(${X}) = f(g(${X})): g acts first. g(${X}) = ${linearAt(gLine.a, gLine.b, x)} = ${numText(g0)}.`,
      `Then f(${numText(g0)}) = ${linearAt(fLine.a, fLine.b, g0)} = ${numText(fog)}, so (f ∘ g)(${X}) = ${numText(fog)}.`,
      `(g ∘ f)(${X}) = g(f(${X})): f acts first. f(${X}) = ${linearAt(fLine.a, fLine.b, x)} = ${numText(f0)}.`,
      `Then g(${numText(f0)}) = ${linearAt(gLine.a, gLine.b, f0)} = ${numText(gof)}, so (g ∘ f)(${X}) = ${numText(gof)}.`,
    );
    pieces.push(`(f ∘ g)(${X}) = ${numText(fog)}`, `(g ∘ f)(${X}) = ${numText(gof)}`);
  }
  if (parts.includes('restriction')) {
    if (model.restriction !== 'none') return null;
    steps.push(`f(x) = ${model.fRule} is a line with a nonzero slope: two different inputs never give the same output, so f is already one-to-one and its domain does not have to be cut down.`);
    pieces.push(`restriction: ${RESTRICTION_LABELS.none}`);
  }
  if (parts.includes('inverse')) {
    if (!model.canInvert || inverseLabRoundTrip(model.f, x) !== x) return null;
    if (!(parts.includes('fog') || parts.includes('gof'))) steps.push(`f(${X}) = ${linearAt(fLine.a, fLine.b, x)} = ${numText(f0)}.`);
    const inverse = preferredInverse(fLine.a, fLine.b);
    steps.push(`f⁻¹ undoes f (${sentence(undoMoves(model.f))}): f⁻¹(x) = ${inverse}, so f⁻¹(f(${X})) = f⁻¹(${numText(f0)}) = ${plugIn(inverse, f0)} = ${X}.`);
    pieces.push(`f⁻¹(f(${X})) = ${X}`);
  }
  if (!pieces.length) return null;
  return {
    headline: parts.includes('fog') ? 'In a composition the inside function acts first; an inverse undoes f, giving back the input.' : 'The inverse undoes f step by step, in reverse order, giving back the input.',
    steps: [...steps, `So ${pieces.join('; ')}.`],
    answerSummary: pieces.join('; '),
  };
};

/** Long division of polynomials (ascending coefficients): { quotient, remainder }. */
const dividePoly = (numerator, denominator) => {
  const d = P.trim(denominator);
  let rest = [...P.trim(numerator)];
  const quotient = Array(Math.max(1, rest.length - d.length + 1)).fill(0);
  while (rest.length >= d.length && !(rest.length === 1 && Math.abs(rest[0]) < 1e-12)) {
    const shift = rest.length - d.length;
    const factor = rest[rest.length - 1] / d[d.length - 1];
    quotient[shift] = factor;
    rest = P.sub(rest, P.mul(d, [...Array(shift).fill(0), factor]));
    if (rest.length > d.length - 1 + shift) rest.pop();
    if (P.degree(rest) < P.degree(d) || (rest.length === 1 && Math.abs(rest[0]) < 1e-12)) break;
  }
  return { quotient: P.trim(quotient), remainder: P.trim(rest) };
};

const opsWorked = (model) => {
  const left = { poly: model.fPoly };
  const right = { poly: model.gPoly };
  const steps = [];
  const pieces = [];
  const coefficientsPoly = (entry) => P.trim([...list(entry?.coefficients)].map(Number).reverse());
  for (const operation of model.operations) {
    const entry = model.key[operation];
    if (!entry) return null;
    if (operation === 'quotient') {
      const roots = exactRoots(model.gPoly);
      const excluded = list(entry.excludedValues).map(Number);
      if (!roots || !roots.length || roots.length !== excluded.length || !roots.every((root, index) => Math.abs(root - excluded[index]) < 1e-9)) return null;
      const fraction = `(${polyText(model.fPoly)})/(${polyText(model.gPoly)})`;
      steps.push(`(f / g)(x) = ${fraction}.`);
      let result = fraction;
      if (entry.simplified) {
        const { quotient, remainder } = dividePoly(model.fPoly, model.gPoly);
        const keyed = parsePolynomial(entry.expression);
        if (!P.equal(remainder, [0]) || !keyed || !P.equal(quotient, keyed)) return null;
        result = polyText(quotient);
        steps.push(`g(x) divides f(x) with no remainder: (${polyText(model.gPoly)})(${result}) = ${polyText(model.fPoly)}, so (f / g)(x) = ${result}.`);
      } else if (!sameText(entry.expression, fraction)) {
        return null;
      }
      const shown = roots.map(numText).join(', ');
      steps.push(`The denominator ${polyText(model.gPoly)} is zero when x = ${roots.map(numText).join(' or x = ')}, so x = ${shown} is excluded from the domain.`);
      pieces.push(`(f / g)(x) = ${result}, x ≠ ${shown}`);
      continue;
    }
    const names = operation === 'composition' && model.composeOrder === 'gOfF' ? ['g', 'f'] : ['f', 'g'];
    const [outer, inner] = names[0] === 'g' ? [right, left] : [left, right];
    const worked = operationWork(operation, outer, inner, names);
    if (!worked?.poly || !P.equal(worked.poly, coefficientsPoly(entry))) return null;
    steps.push(...worked.steps);
    pieces.push(`${worked.label} = ${polyText(worked.poly)}`);
  }
  if (!pieces.length) return null;
  return {
    headline: `Work each operation on f(x) = ${model.fRule} and g(x) = ${model.gRule}, then combine like terms.`,
    steps: [...steps, `So ${pieces.join('; ')}.`],
    answerSummary: pieces.join('; '),
  };
};

const WORKED_TOOLS = Object.freeze({ derive: deriveWorked, lab: labWorked, ops: opsWorked });

// What a step must never print: a JS leak or an unsimplified sign.
const SLOPPY = /NaN|undefined|Infinity|\bnull\b|\[object|[+−-]\s*[−-]|(?<![\d.])[−-]0(?![\d./])|(?<![\d.)⁻])1[a-z](?![a-z])/;

export const workedSolution = (question) => {
  try {
    const model = readModel(question);
    if (!model) return null;
    const result = model.source === 'tool' ? WORKED_TOOLS[model.kind]?.(model) : multiWorked(model);
    if (!result) return null;
    const steps = list(result.steps).map(text).filter(Boolean);
    const answerSummary = text(result.answerSummary);
    if (!steps.length || !answerSummary) return null;
    if ([...steps, answerSummary, text(result.headline)].some((entry) => SLOPPY.test(entry))) return null;
    return { headline: text(result.headline), steps, answerSummary };
  } catch {
    return null;
  }
};
