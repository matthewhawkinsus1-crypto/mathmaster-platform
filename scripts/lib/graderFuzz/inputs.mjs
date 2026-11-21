/*
 * WHAT A STUDENT'S ANSWER BOX CAN HOLD: THE FUZZ HARNESS'S INPUT GENERATORS.
 *
 * The bugs that reached students in November 2026 were all one kind: a value a
 * student could type that no test had typed. MathLive's LaTeX in a box whose
 * reader took plain text (`\frac12`, `\sqrt{24}`, PR #553); `Pr` and `2πr`
 * read as one name (PR #551); `x(x - 5)` read as a call; a half-written
 * equation. Each generator below builds one such class, and every value it
 * returns carries the name of its class, so a finding says which kind of
 * typing broke.
 *
 *   latex      what the math editor writes: \frac, \sqrt[3]{}, \left( \right),
 *              \pi, \le, x^{2}, \cdot, an empty \placeholder{}
 *   unicode    √ − × π ² ≤ · ÷ ∞ from a phone keyboard or a paste
 *   partial    an answer that is not finished: "2x +", "(", "1/", "="
 *   blank      nothing, spaces, tabs, a non-breaking or zero-width space
 *   long       the same token many times over
 *   manyTerms  many short terms inside the 240 characters a box may hold:
 *              48 like terms, a chain of divisions, a run of brackets. What
 *              a comparison costs is set by its terms, not its characters
 *              (#558)
 *   oddNumber  1e999, 0x10, 1,000, 1/0, .5, 5., a digit from another script
 *   implicit   products with no sign: Pr, x(x-5), 2πr
 *   hostile    what a paste or a tampered client sends: markup, JSON, the
 *              names of Object's own properties, control characters
 *
 * and, from a key the banks hold:
 *
 *   keySpelling  the key spelled another right way
 *                (scripts/lib/typedAnswerSpellings.mjs, editorTypedSpelling.mjs)
 *   nearMiss     a wrong answer one slip from the key
 *   keyMutation  the key with a character added, dropped, doubled or swapped
 *   brokenKey    the key left unfinished: a sign after it, a bracket opened
 *                and never closed. No reading of these is a finished answer.
 *   paddedKey    the key made longer than a response may travel, saying the same
 *
 * Every function takes the seeded generator of prng.mjs and nothing else that
 * varies, so a seed names its inputs for good. Read only; nothing here grades.
 */
import { editorTypedSpellings } from '../editorTypedSpelling.mjs';
import { typedNearMissesOf, typedSpellingsOf } from '../typedAnswerSpellings.mjs';

const LETTERS = ['x', 'y', 'a', 'b', 'n', 't', 'r', 'P', 'h', 'k'];
const DIGITS = ['0', '1', '2', '3', '4', '5', '7', '9', '10', '12', '24', '100', '0.5', '1.5', '-1', '-3'];

/* --------------------------------------------------------------- MathLive LaTeX */

const latexAtom = (rng) => rng.pick([
  () => rng.pick(DIGITS),
  () => rng.pick(LETTERS),
  () => '\\pi',
  () => `${rng.pick(DIGITS)}${rng.pick(LETTERS)}`,
  () => `${rng.pick(LETTERS)}^{${rng.pick(['2', '3', '-1', 'n', '\\frac{1}{2}'])}}`,
  () => `${rng.pick(LETTERS)}_{${rng.pick(['1', '2', '0', 'n'])}}`,
])();

/** One expression as the math editor writes it, nested to `depth`. */
export const latexExpression = (rng, depth = 2) => {
  if (depth <= 0) return latexAtom(rng);
  const inner = () => latexExpression(rng, depth - 1);
  return rng.pick([
    latexAtom.bind(null, rng),
    () => `\\frac{${inner()}}{${inner()}}`,
    // The editor's short forms: a one-digit numerator and denominator.
    () => `\\frac${rng.int(1, 9)}${rng.int(2, 9)}`,
    () => `\\frac{${inner()}}${rng.int(2, 9)}`,
    () => `\\dfrac{${inner()}}{${inner()}}`,
    () => `\\sqrt{${inner()}}`,
    () => `\\sqrt[${rng.pick(['3', '4', 'n'])}]{${inner()}}`,
    () => `\\sqrt${rng.int(2, 9)}`,
    () => `\\left(${inner()}\\right)`,
    () => `\\left(${inner()}\\right)^{${rng.pick(['2', '3', '-1'])}}`,
    () => `\\left|${inner()}\\right|`,
    () => `${inner()}${rng.pick(['+', '-', '\\cdot ', '\\times ', '\\div ', ''])}${inner()}`,
    () => `${inner()}^{${inner()}}`,
    () => `-${inner()}`,
    () => `\\pm${inner()}`,
    () => `${rng.pick(['\\sin', '\\cos', '\\ln', '\\log', '\\log_{2}'])}\\left(${inner()}\\right)`,
    () => `${inner()}\\placeholder{}`,
    () => `\\frac{\\placeholder{}}{${inner()}}`,
    () => `\\text{${rng.pick(['no solution', 'all real numbers', 'or', 'and', 'DNE'])}}`,
    () => `${rng.int(1, 9)}\\frac{${rng.int(1, 9)}}{${rng.int(2, 9)}}`,
    () => `\\left(${inner()},${inner()}\\right)`,
    () => `\\left\\{${inner()},${inner()}\\right\\}`,
    () => `\\left[${inner()},\\infty\\right)`,
  ])();
};

const LATEX_RELATIONS = ['=', '\\le ', '\\ge ', '<', '>', '\\ne ', '\\leq ', '\\geq ', '\\lt ', '\\gt '];

/** An equation or inequality as the math editor writes it. */
export const latexRelation = (rng, depth = 2) => `${latexExpression(rng, depth)}${rng.pick(LATEX_RELATIONS)}${latexExpression(rng, depth)}`;

/* ----------------------------------------------------------------- fixed classes */

const UNICODE = [
  '√2', '√(24)', '2√3', '−3', '−x', 'x − 5', '2×3', '2×x', 'π', '2π', '2πr', 'πr²', 'x²', 'x³', 'x⁻¹', '10⁻³', 'x ≤ 3', 'x ≥ −2',
  'x ≠ 0', '3·x', '6÷2', '∞', '(−∞, 3]', '½', '¾', '1½', 'x′', '±2', '∅', 'ℝ', '∪', '(1, 2) ∪ (3, 4)', '°', '45°', 'θ', 'Δx',
  '≈3.14', '→', '∈', '∴', '⅓x', '𝑥', '𝟐', 'ｘ＝２', '１２', '٣', '३', 'x̄', 'é', '×', '−− 1',
];

const PARTIAL = [
  '2x +', '2x -', '2x *', '2x /', '2x ^', '(', ')', '((', '())', '[', ']', '{', '}', '|', '||', '1/', '/2', '=', '==', 'x=', '=x', 'y=', '<', '>',
  '<=', '≤', '\\le', '^', '_', '.', ',', '-', '+', '--', '+-', 'x^', 'x_', '2^{', '\\frac', '\\frac{', '\\frac{1}', '\\frac{1}{', '\\sqrt',
  '\\sqrt{', '\\sqrt[', '\\sqrt[3]', '\\left(', '\\right)', '\\left(\\right)', '\\left(x', 'x\\right)', '\\', '\\\\', '}{', '\\{', '\\text{',
  '\\frac{}{}', '\\sqrt{}', 'e^', '\\log_', 'sqrt(', 'abs(', 'f(', '(x', 'x)', '(,)', '(1,', ',2)', '(1,2', '1,2)', '[1,', '{1,2', 'x <', '< x',
  '1 <', '2 < x <', 'x = or', 'or', 'and', 'x=1 or', 'x>', 'y=mx+', 'y-=', '3x+2=', '=7', '1//2', '1..2', '2**3', '5!', '%', '$', '$1$', '#',
];

const BLANK = ['', ' ', '  ', '\t', '\n', ' \n ', ' ', '​', '​​', ' ', '﻿', '\\ ', '\\,', '\\:', '\\placeholder{}', '{}', '\\text{}', '\\left(\\right)'];

const ODD_NUMBERS = [
  '1e999', '-1e999', '1e-999', '1e3', '1E3', '2e', 'e2', '0x10', '0b11', '0o7', '1,000', '1,000,000', '1.000,5', '1 000', '1_000', '1,00', ',5',
  '.5', '5.', '-.5', '+.5', '0.', '-0', '+0', '00012', '012', '1.0', '1.50', '1.5.2', '1/0', '0/0', '-1/0', '1/-2', '--1', '-+1', '+-1', '++1',
  '1/2/3', '1 1/2', '1-1/2', '-1 1/2', '1 / 2', '3/4/', 'NaN', 'Infinity', '-Infinity', 'inf', '-inf', 'oo', '\\infty', '9007199254740993',
  '0.1+0.2', '0.30000000000000004', '1e21', '123456789012345678901234567890', '0.000000000000000000001', '1%', '50%', '$5', '5$', '5 cm',
  '3.14159', '22/7', '2^3', '2^-1', '2^0.5', '4^(1/2)', '9^9^9', '9^9^9^9', '170!', '171!', '5!', 'sqrt(-1)', 'i', '2i', 'e', 'pi', 'π',
  '1e', '1e+', '1e-', 'e', 'E', '-', '+', '٣', '１２', '1️⃣', '1.2e3.4', '0x', '0xg', '1__0', '१२', 'ⅲ', 'IV', 'one', 'two',
];

const IMPLICIT = [
  'Pr', 'Prt', 'P(1+rt)', 'A=Prt', 'A=P(1+rt)', 'x(x-5)', 'x(x - 5) = 0', '(x-5)x', '2πr', '2pir', 'πr^2', 'xy', 'yx', '2xy', 'xyz', 'ab',
  'abc', '2(3)', '(2)(3)', '(x+1)(x-1)', '2(x+1)', '(x+1)2', 'x2', '2x3', 'x(2)', 'f(x)', 'f(2)', 'g(x+1)', 'h(t)=5t', 'a(b+c)', 'n(n+1)/2',
  'mx+b', 'y=mx+b', 'lw', 'A=lw', 'bh/2', '1/2bh', '1/2 bh', '½bh', 'V=lwh', 'C=2πr', 'd=rt', 'I=Prt', 'E=mc^2', 'sinx', 'sin x', 'sin(x)',
  'xsin(x)', 'xln(x)', 'lnx', 'logx', 'log2x', 'sqrtx', 'sqrt2', '2sqrt3', 'xsqrt2', 'sqrt2x', '3x^2y', 'x^2y^3', 'x^2x', 'e^x', 'e^2x', 'e^(2x)',
  '2e', 'pix', 'xpi', 'api', '3pi/4', 'pi/2', 'x|x|', '|x|x', '-x(x)', 'k(x-h)^2', 'a(x-h)^2+k', 'r(cos t)', 'P r', 'P·r', 'P*r',
];

const HOSTILE = [
  '__proto__', 'constructor', 'prototype', 'toString', 'valueOf', 'hasOwnProperty', 'null', 'undefined', 'true', 'false', '[object Object]',
  '{}', '[]', '{"a":1}', '[1,2]', '<b>4</b>', '<script>alert(1)</script>', '&lt;', '&amp;', '"4"', "'4'", '`4`', '4;', '4\u0000', '\u0000',
  '\u0007', '4\r\n5', '4 ', '\ud83d', '\udc00', '😀', '4😀', '‮4', 'á', '${4}', '{{answer}}', '%s', '%d', '\\u0034', '\\x34',
  '4//comment', '4/*c*/', '4#', 'x=>x', 'function(){}', 'import("x")', 'eval(1)', 'process.exit()', 'cos(cos(cos(cos(cos(1)))))', 'a=1;a',
  'x=1,y=2', 'x:=1', 'x==1', 'x===1', 'x!=1', 'not x', 'x && y', 'x || y', 'x ? 1 : 2', '[1,2;3,4]', 'ones(3)', 'range(0,1e9)', '1:1e9',
  'factorial(1e6)', 'x.y', 'x[0]', 'x"', 'det([1])', 'simplify("x")', 'derivative("x^2","x")', 'unit(5,"cm")', '5 cm to m', 'i^i', '0^0',
];

const LONG_TOKENS = ['x', '9', '(', ')', '\\frac{', '}', '+1', 'x^', '\\sqrt{', '-', ' ', '1/', '\\left(', '\\right)', 'sqrt(', '.', '0', '^2', '\\pi', ',1', '=x', 'xy', '−', '(x+1)', '\\frac{1}{2}+'];

/** One token `length` characters over, or two tokens alternating. */
export const longInput = (rng, maxLength = 2000) => {
  const length = rng.pick([241, 300, 1001, maxLength].filter((value) => value <= maxLength));
  const token = rng.pick(LONG_TOKENS);
  const other = rng.chance(0.3) ? rng.pick(LONG_TOKENS) : '';
  return (token + other).repeat(Math.ceil(length / (token.length + other.length))).slice(0, length);
};

/*
 * MANY SHORT TERMS, INSIDE THE LENGTH A BOX MAY HOLD (#558). A length limit
 * bounds characters; what a simplifier's rule matcher costs is set by terms.
 * 48 like terms with varied coefficients fit in 240 characters, and took
 * about 40 s where one was asked (docs/handoffs/NOVEMBER_BUILD_2026-11.md
 * section 6, "A long side"). Each shape is cut at a term, never mid-term, so
 * the value is a finished answer of at most `limit` characters.
 */
const MANY_TERMS_SHAPES = [
  (index, letter) => `${index ? '+' : ''}${index + 2}${letter}`,
  (index, letter) => `${index ? '-' : ''}${index + 2}${letter}^2`,
  (index, letter) => `${index ? '+' : ''}${letter}`,
  (index, letter) => `${index ? '+' : ''}${index + 2}${'xyz'[index % 3]}`,
  (index, letter) => (index ? `/${index + 1}` : letter),
  (index, letter) => (index ? '/2' : letter),
  (index, letter) => (index ? `/${letter}` : '1'),
  (index, letter) => `(${letter}+${index + 1})`,
  (index, letter) => `(${letter}+1)`,
  (index, letter) => (index ? `*${index + 1}` : letter),
  (index, letter) => (index ? `*${letter}` : letter),
  (index, letter) => `${index ? '+' : ''}\\frac{${letter}}{${index + 2}}`,
  (index, letter) => `${index ? '+' : ''}${index + 2}\\sqrt{${index + 2}}`,
  (index, letter) => `${index ? '+' : ''}\\frac{1}{${letter}+${index + 1}}`,
  (index, letter) => `${index ? '+' : ''}0.${index + 1}${letter}`,
  (index, letter) => `${index ? '+' : ''}${letter}^${index + 1}`,
  (index, letter) => `${index ? '*' : ''}${letter}^${index + 1}`,
  (index, letter) => `${index ? ' or ' : ''}${letter}>${index}`,
];
export const manyTermsInput = (rng, limit = 240) => {
  const shape = rng.pick(MANY_TERMS_SHAPES);
  const letter = rng.pick(['x', 'x', 'y', 'n']);
  const wrap = rng.pick([(text) => text, (text) => text, (text) => `y=${text}`, (text) => `${text}=0`, (text) => `y<${text}`]);
  const terms = rng.pick([12, 24, 48, 240]);
  let text = '';
  for (let index = 0; index < terms; index += 1) {
    const next = `${text}${shape(index, letter)}`;
    if (wrap(next).length > limit) break;
    text = next;
  }
  return wrap(text);
};

/* ------------------------------------------------------------------ from a key */

const SUFFIXES_THAT_FINISH_NOTHING = ['+', ' +', '-', ' -', '*', '/', '^', '=', '(', '+(', '\\cdot', '\\times', '^{', '_', ',', '\\frac{', '<', '\\le'];
const PREFIXES_THAT_FINISH_NOTHING = ['*', '/', '^', ')', '=', ',', '\\right)', '}'];

/**
 * The key left unfinished. Whatever a grader accepts, it is not one of these:
 * a sign with nothing after it, a bracket never closed, a product sign first.
 */
export const brokenKey = (rng, key) => {
  const text = String(key);
  return rng.chance(0.75)
    ? `${text}${rng.pick(SUFFIXES_THAT_FINISH_NOTHING)}`
    : `${rng.pick(PREFIXES_THAT_FINISH_NOTHING)}${text}`;
};

/** The key with one character added, dropped, doubled or swapped. */
export const mutatedKey = (rng, key) => {
  const text = String(key);
  if (!text) return rng.pick(PARTIAL);
  const at = rng.int(0, text.length - 1);
  return rng.pick([
    () => text.slice(0, at) + text.slice(at + 1),
    () => text.slice(0, at) + text[at] + text.slice(at),
    () => text.slice(0, at) + rng.pick(['-', '+', '1', '0', ' ', '(', ')', 'x', '.', '/', '^', '\\', '{', '}', '=', '²', '−']) + text.slice(at),
    () => (at + 1 < text.length ? text.slice(0, at) + text[at + 1] + text[at] + text.slice(at + 2) : text + text),
    () => text.slice(0, at),
    () => text.slice(at),
    () => text.split('').reverse().join(''),
    () => `${text}${text}`,
    () => text.toUpperCase(),
    () => text.replace(/\d/, (digit) => String((Number(digit) + 1) % 10)),
    () => text.replace('-', '').replace('−', ''),
    () => `-${text}`,
    () => `-(${text})`,
    () => `1/(${text})`,
    () => `\\frac{${text}}{1}`,
    () => `\\left(${text}\\right)`,
    () => `${text}\\placeholder{}`,
    () => `$${text}$`,
    () => `\\text{${text}}`,
    () => `${text} ${rng.pick(['cm', 'units', '%', 'x', 'or', 'and', '.', '!', '?'])}`,
    () => `x=${text}`,
    () => `${text}=${text}`,
    () => `${text}${rng.pick(UNICODE)}`,
  ])();
};

/**
 * The key made long without changing what it says: zeros before a number,
 * brackets round the whole of it, `+0` after it, spaces in it. A response
 * travels to the server cut to a length (240 characters a box,
 * ordinaryResponseGrading.mjs normalizeOrdinaryResponse), so a long answer the
 * screen reads whole is where the screen and the server can part.
 */
export const paddedKey = (rng, key, length = 260) => {
  const text = String(key);
  const room = Math.max(0, length - text.length);
  return rng.pick([
    () => (/^\d/.test(text) ? `${'0'.repeat(room)}${text}` : `${' '.repeat(room)}${text}`),
    () => `${'('.repeat(Math.ceil(room / 2))}${text}${')'.repeat(Math.ceil(room / 2))}`,
    () => `${text}${'+0'.repeat(Math.ceil(room / 2))}`,
    () => `${text}${'*1'.repeat(Math.ceil(room / 2))}`,
    () => `${text}${' '.repeat(room)}`,
    () => `${text}${'\\ '.repeat(Math.ceil(room / 2))}`,
    () => `${'+'.repeat(room)}${text}`,
    () => (/^-?\d+$/.test(text) ? `${text}.${'0'.repeat(room)}` : `${text}${'\\,'.repeat(Math.ceil(room / 2))}`),
    () => text.split('').join(' '.repeat(Math.ceil(room / Math.max(1, text.length - 1)))),
  ])();
};

const spellingsOfKey = (key, field) => {
  const text = String(key);
  const built = [];
  try { typedSpellingsOf(text, field).forEach(({ spelling, spellingClass }) => built.push({ text: spelling, detail: spellingClass })); } catch { /* a key the spellings cannot read gets none */ }
  try { editorTypedSpellings(text).forEach((spelling) => built.push({ text: spelling, detail: 'math editor' })); } catch { /* as above */ }
  return built;
};

const nearMissesOfKey = (key, field) => {
  try { return typedNearMissesOf(String(key), field).map(({ miss, spellingClass }) => ({ text: miss, detail: spellingClass })); } catch { return []; }
};

/* -------------------------------------------------------------------- the draw */

export const INPUT_CLASSES = Object.freeze([
  'latex', 'unicode', 'partial', 'blank', 'long', 'manyTerms', 'oddNumber', 'implicit', 'hostile', 'keySpelling', 'nearMiss', 'keyMutation', 'brokenKey', 'paddedKey', 'key',
]);

/** Classes that need no key. */
export const FREE_CLASSES = Object.freeze(['latex', 'unicode', 'partial', 'blank', 'long', 'manyTerms', 'oddNumber', 'implicit', 'hostile']);

/**
 * One typed value of a class. `key` and `field` are for the classes built
 * from a key; without a key those classes fall back to a free one.
 */
export const typedInput = (rng, inputClass, { key = null, field = {}, maxLength = 2000 } = {}) => {
  const hasKey = key !== null && key !== undefined && String(key) !== '';
  const of = (text, detail = null) => ({ text: String(text), inputClass, detail });
  switch (inputClass) {
    case 'latex': return of(rng.chance(0.25) ? latexRelation(rng, rng.int(0, 2)) : latexExpression(rng, rng.int(1, 3)));
    case 'unicode': return of(rng.pick(UNICODE));
    case 'partial': return of(rng.chance(0.2) ? latexExpression(rng, 2).slice(0, rng.int(1, 12)) : rng.pick(PARTIAL));
    case 'blank': return of(rng.pick(BLANK));
    case 'long': return of(longInput(rng, maxLength));
    case 'manyTerms': return of(manyTermsInput(rng));
    case 'oddNumber': return of(rng.pick(ODD_NUMBERS));
    case 'implicit': return of(rng.pick(IMPLICIT));
    case 'hostile': return of(rng.pick(HOSTILE));
    case 'key': return hasKey ? of(key) : typedInput(rng, 'oddNumber', { maxLength });
    case 'brokenKey': return hasKey ? of(brokenKey(rng, key)) : typedInput(rng, 'partial', { maxLength });
    case 'paddedKey': return hasKey ? of(paddedKey(rng, key)) : typedInput(rng, 'long', { maxLength });
    case 'keyMutation': return hasKey ? of(mutatedKey(rng, key)) : typedInput(rng, 'partial', { maxLength });
    case 'keySpelling': {
      const spellings = hasKey ? spellingsOfKey(key, field) : [];
      if (!spellings.length) return hasKey ? of(` ${key} `, 'spaces') : typedInput(rng, 'latex', { maxLength });
      const chosen = rng.pick(spellings);
      return of(chosen.text, chosen.detail);
    }
    case 'nearMiss': {
      const misses = hasKey ? nearMissesOfKey(key, field) : [];
      if (!misses.length) return typedInput(rng, 'keyMutation', { key, field, maxLength });
      const chosen = rng.pick(misses);
      return of(chosen.text, chosen.detail);
    }
    default: throw new Error(`Unknown input class "${inputClass}".`);
  }
};

/** A typed value of a class drawn at random (every class, evenly). */
export const anyTypedInput = (rng, options = {}) => typedInput(rng, rng.pick(options.key === null || options.key === undefined ? FREE_CLASSES : INPUT_CLASSES), options);

/** Every fixed value of the free classes, for a target that tries them all. */
export const FIXED_INPUTS = Object.freeze({ unicode: UNICODE, partial: PARTIAL, blank: BLANK, oddNumber: ODD_NUMBERS, implicit: IMPLICIT, hostile: HOSTILE });

/**
 * Is this text broken the way a finished answer never is: brackets that do
 * not balance, or an operator with nothing after it? Used to hold "an
 * unfinished answer is not a right answer" to inputs where nobody can argue.
 */
export const isUnfinished = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return false;
  let depth = 0;
  for (const character of text.replace(/\\left|\\right/g, '').replace(/\\[{}]/g, '')) {
    if ('([{'.includes(character)) depth += 1;
    else if (')]}'.includes(character)) depth -= 1;
    if (depth < 0) break;
  }
  // An interval's brackets differ on purpose: (2, 5] is finished.
  const interval = /^[[(][^()[\]]*,[^()[\]]*[\])]$/.test(text);
  if (depth !== 0 && !interval) return true;
  return /(?:[-+*/^=<>,_]|\\cdot|\\times|\\div|\\le|\\ge|\\frac|\\sqrt)\s*$/.test(text) || /^\s*[*/^=,)]/.test(text);
};

/**
 * How a broken key was broken, as a class a signature can hold: a sign or a
 * product sign left after the key, a product sign put before it, or the text
 * itself for anything rarer.
 */
export const breakOf = (typed, key) => {
  const text = String(typed);
  const original = String(key);
  const kind = (extra, where) => {
    const sign = extra.trim();
    if (where === 'after' && (sign === '+' || sign === '-')) return 'sign-after';
    if (sign === '*' || sign === '\\cdot' || sign === '\\times') return `product-sign-${where}`;
    return `${where}:${sign}`;
  };
  if (text.startsWith(original)) return kind(text.slice(original.length), 'after');
  if (text.endsWith(original)) return kind(text.slice(0, text.length - original.length), 'before');
  return 'other';
};
