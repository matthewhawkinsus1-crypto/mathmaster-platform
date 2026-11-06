/*
 * HOW A STUDENT PLAUSIBLY TYPES A RIGHT ANSWER (grader spellings, 2026-11).
 *
 * The equivalence sweep (scripts/sweep-equivalence-verdicts.mjs) builds, for
 * every typed field in every bank, the answers that should be RIGHT and the
 * near misses that should be WRONG. These are the spellings a student types
 * into a plain-text box or a phone keyboard, each the same mathematics as the
 * text it is built from, by class:
 *
 *   spaces              `y = 2x + 3`, `(2, 3)`
 *   leading +           `+5`, `+\frac{1}{x^6}`
 *   superscripts        `x²`, `x⁻¹`, `10³` (never before a `/`: `10⁻³/2` is
 *                       not what `10^-3/2` is drawn as)
 *   product signs       `2·x`, `2×x`, `2*x`, and another sign for the one written
 *   implicit products   `2x` for `2*x`, `(x+1)(x-2)` for `(x+1)*(x-2)`
 *   redundant brackets  `(7x^2-3x-6)`, `y=(2x+3)`, `2x+(-3)`
 *   fractions           `\frac{3}{4}`, `\dfrac{3}{4}`, `3/4`
 *   relation keys       `<=` for ≤ and ≤ for `<=` (`\le`, `\leq` too)
 *   reordered sums      `3 + 2x`, `y = 3 + 2x`, `-8 + 2x + x^2 = 0`
 *   reordered products  `(x+3)(x+2)`, `6\sqrt{x}x^3`, `2rπ`
 *   decimals            `0.75` for 3/4, `.75`, `5.0`
 *   zero terms          `x^2 - 1 = 0` for a generated `x^2 + 0x - 1 = 0`
 *
 * A reordered sum or product is built only where nothing the student reads asks
 * for a form, and a decimal only where nothing asks for a fraction (the field's
 * `formAsked` and `fractionAsked`, read by the sweep): there the order or the
 * fraction may be the question. A choice is never typed, so it gets none.
 *
 * typedNearMissesOf adds the near misses these spellings need, each another
 * answer: a space that makes a mixed number (`3 1/2` for 31/2), a power moved
 * by one (`x³`), brackets that are not redundant (`-(2x+3)` for -2x + 3,
 * `(2x)^2` for 2x²), a fraction turned over or its digits read as a decimal
 * (`3.4` for 3/4), a relation turned round, terms moved without their signs
 * (`3 - 2x` for 2x - 3), a power moved to another factor (`xy²` for x²y).
 * The sweep spells each near miss the same ways — every class, whatever the
 * field asks, since a wrong answer is wrong in any spelling — so every class
 * has wrong answers in its own spelling.
 *
 * Read only; nothing here grades.
 */

const OPENERS = '([{';
const CLOSERS = ')]}';
// Names the spellings never split or join: commands, functions, the words the
// graders read. Any other run of three letters is a word, not a product.
const KNOWN_NAMES = /\\[A-Za-z]+|sqrt|cbrt|root|abs|log|ln|sin|cos|tan|exp|pi|inf|and|or/g;
const hasWords = (text) => /[A-Za-z]{3,}/.test(String(text).replace(KNOWN_NAMES, ' '));
const RELATION = /<=|>=|!=|≤|≥|≠|<|>|=|\\(?:leq?|geq?|neq?|lt|gt)(?![A-Za-z])/;
const SUPERSCRIPT = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };
// What a binary + or − follows (anything else makes it a sign).
const OPERAND_END = /[0-9A-Za-z)\]}|.π%²³¹⁰⁴⁵⁶⁷⁸⁹]/;
// Not a point, an interval or a set: their brackets and U are no product.
const LIST_OR_SET = /[,;∪]|\\cup|^\s*\\?\{|(?<![A-Za-z])U(?![A-Za-z])/;

/** The top-level relation signs of a text, with their positions. */
const relationsOf = (text) => {
  const found = [];
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (OPENERS.includes(character)) depth += 1;
    else if (CLOSERS.includes(character)) depth -= 1;
    if (depth !== 0) continue;
    const match = /^(?:<=|>=|!=|≤|≥|≠|<|>|=|\\(?:leq?|geq?|neq?|lt|gt)(?![A-Za-z]))/.exec(text.slice(index));
    if (match) { found.push({ index, sign: match[0] }); index += match[0].length - 1; }
  }
  return found;
};

/** A text as its sides around one top-level relation, or as one side; null with two relations. */
const sidesOf = (text) => {
  const relations = relationsOf(text);
  if (relations.length > 1) return null;
  if (!relations.length) return { parts: [text], signs: [] };
  const [{ index, sign }] = relations;
  return { parts: [text.slice(0, index), text.slice(index + sign.length)], signs: [sign] };
};
const joinSides = ({ parts, signs }) => parts.reduce((out, part, index) => (index ? `${out}${signs[index - 1]}${part}` : part), '');

/**
 * A side's top-level terms, each with its sign (the first may have none), or
 * null when it cannot be split with confidence: a plain-text `/` (its extent
 * is ambiguous, GR04), ±, scientific notation, a comma, bars inside bars.
 */
const termsOf = (side) => {
  const text = String(side).trim();
  if (!text || /\/|\\pm|±|\de[-+]?\d|,/.test(text) || (text.match(/\|/g) || []).length > 2) return null;
  const terms = [];
  let depth = 0;
  let bars = false;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (OPENERS.includes(character)) depth += 1;
    else if (CLOSERS.includes(character)) { depth -= 1; if (depth < 0) return null; }
    else if (character === '|' && depth === 0) bars = !bars;
    else if ((character === '+' || character === '-') && depth === 0 && !bars && index > start && OPERAND_END.test(text[index - 1])) {
      terms.push(text.slice(start, index));
      start = index;
    }
  }
  if (depth !== 0 || bars) return null;
  terms.push(text.slice(start));
  return terms.every((term) => term.replace(/^[+-]/, '').trim()) ? terms : null;
};
const joinTerms = (terms) => terms.map((term) => (/^[+-]/.test(term) ? term : `+${term}`)).join('').replace(/^\+/, '');

/** What is inside one pair of brackets round all of `text`, or null. */
const wrappedBody = (text) => {
  const source = String(text).trim();
  if (!source.startsWith('(') || !source.endsWith(')')) return null;
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    else if (source[index] === ')') { depth -= 1; if (depth === 0 && index < source.length - 1) return null; }
  }
  return depth === 0 ? source.slice(1, -1) : null;
};

// A product's factors: a number first, then letters (with a power), π, roots
// and bracket groups (with a power). Null for anything else: a quotient, a
// call, a product sign, a mixed number.
const POWER = String.raw`(?:\^(?:\{[^{}]+\}|\([^()]+\)|-?\d+|[A-Za-z]))?`;
const FACTOR = new RegExp(String.raw`^(?:[A-Za-z]${POWER}|π${POWER}|\\pi(?![A-Za-z])${POWER}|\\sqrt(?:\[[^\]]+\])?\{[^{}]+\}${POWER})`);
const factorsOf = (term) => {
  const text = String(term).trim();
  const sign = /^[+-]/.test(text) ? text[0] : '';
  let rest = text.slice(sign.length);
  if (!rest || /\/|\\frac|\\cdot|\\times|\*|[a-z]{2,}\(/.test(rest.replace(/\\(?:sqrt|pi)(?![A-Za-z])/g, ''))) return null;
  const coefficient = /^\d+(?:\.\d+)?/.exec(rest)?.[0] || '';
  rest = rest.slice(coefficient.length);
  const factors = [];
  while (rest) {
    if (rest[0] === '(') {
      let close = -1;
      for (let index = 0, depth = 0; index < rest.length && close < 0; index += 1) {
        if (rest[index] === '(') depth += 1;
        else if (rest[index] === ')' && (depth -= 1) === 0) close = index;
      }
      if (close < 0) return null;
      const power = new RegExp(`^${POWER}`).exec(rest.slice(close + 1))[0];
      factors.push(rest.slice(0, close + 1 + power.length));
      rest = rest.slice(close + 1 + power.length);
      continue;
    }
    const match = FACTOR.exec(rest);
    if (!match) return null;
    factors.push(match[0]);
    rest = rest.slice(match[0].length);
  }
  return { sign, coefficient, factors };
};
// f(x), g(2): a name and its argument are a call, not two factors.
const looksLikeCall = (text) => /^[A-Za-z]\([A-Za-z0-9]\)$/.test(String(text).trim());

// --- RIGHT: the same answer, spelled another way ------------------------------

/** `y = 2x + 3`: spaces round each operation and relation, and after a comma inside brackets. */
const spacedOut = (text) => {
  const source = String(text);
  if (hasWords(source) || /\s/.test(source.trim())) return [];
  let out = '';
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const command = character === '\\' ? /^\\[A-Za-z]+/.exec(source.slice(index)) : null;
    if (command) { out += command[0]; index += command[0].length - 1; continue; }
    if (OPENERS.includes(character)) depth += 1;
    else if (CLOSERS.includes(character)) depth -= 1;
    const pair = source.slice(index, index + 2);
    if (['<=', '>=', '!='].includes(pair)) { out = `${out.trimEnd()} ${pair} `; index += 1; continue; }
    if ('≤≥≠<>='.includes(character)) { out = `${out.trimEnd()} ${character} `; continue; }
    // A binary + or − (a sign keeps its number: `-5`, `x^-2`, `y = -2x`).
    if ((character === '+' || character === '-') && index > 0 && OPERAND_END.test(source[index - 1])) {
      out = `${out.trimEnd()} ${character} `;
      continue;
    }
    if (character === ',' && depth > 0) { out += ', '; continue; }
    out += character;
  }
  return [out.replace(/\s+/g, ' ').trim()];
};

/** `+5`: a sign on a positive number or expression. */
const withLeadingPlus = (text) => {
  const source = String(text).trim();
  if (!/^(?:[0-9.A-Za-zπ]|\\(?:frac|sqrt|pi)(?![A-Za-z]))/.test(source) || RELATION.test(source) || /[,;]/.test(source) || hasWords(source)) return [];
  return [`+${source}`];
};

/** `x²`, `x⁻¹`, `10³`: a whole-number power as superscript characters, never before a `/`. */
const withSuperscripts = (text) => [String(text).replace(/\^(?:\{(-?\d+)\}|\((-?\d+)\)|(-?\d+))(?![\d./^{(_])/g, (match, braced, bracketed, bare) => (
  [...(braced ?? bracketed ?? bare)].map((character) => SUPERSCRIPT[character]).join('')))];

// A digit inside a power or a subscript (`x^2y`, `x_1y`), or a denominator
// typed after a slash (`1/2x`, whose reading is the author's, GR04): a product
// sign after it could change what it covers.
const digitBinds = (source, index) => {
  let cursor = index;
  while (cursor > 0 && /[\d.]/.test(source[cursor - 1])) cursor -= 1;
  return /(?:[\^_]-?|\/)$/.test(source.slice(0, cursor));
};

/** Every place a product is written without a sign, as the index the sign goes before. */
const implicitProductPositions = (source) => {
  const positions = [];
  for (let index = 1; index < source.length; index += 1) {
    const before = source[index - 1];
    const rest = source.slice(index);
    if (!/^(?:[A-Za-z(|π]|\\(?:sqrt|pi|left[(|])(?![A-Za-z]))/.test(rest)) continue;
    if (/\d/.test(before)) {
      if (digitBinds(source, index - 1)) continue;
      // A digit, then a letter that starts a word that is not a call.
      if (/^[A-Za-z]{2,}/.test(rest) && !/^(?:sqrt|abs|log|ln|pi)\b/.test(rest)) continue;
      positions.push(index);
    } else if ((before === ')' && /^[A-Za-z(\\π]/.test(rest)) || (before === '}' && /^[A-Za-z\\π]/.test(rest))) {
      // (Not `}(`: `\log_{10}(x)` is a call.)
      positions.push(index);
    }
  }
  return positions;
};

/** `2·x + 3`, `2×x + 3`, `2*x + 3`: a product sign typed where it may be left out, or another sign for the one written. */
const productSignSpellings = (text) => {
  const source = String(text);
  // Nor ASCIIMath's root(n)(x), one call with two brackets.
  if (hasWords(source) || /\\(?:frac|dfrac|tfrac|text)|root\(/.test(source) || LIST_OR_SET.test(source)) return [];
  const out = [];
  // A product sign after a plain-text `/` could end its denominator, or not:
  // `3/x^{-2}y` is read either way (GR04), so none is put in there.
  const positions = source.includes('/') ? [] : implicitProductPositions(source);
  if (positions.length) {
    for (const sign of ['*', '·', '×']) {
      let spelled = '';
      let last = 0;
      positions.forEach((position) => { spelled += `${source.slice(last, position)}${sign}`; last = position; });
      out.push(`${spelled}${source.slice(last)}`);
    }
  }
  if (/\*/.test(source)) out.push(source.replace(/\*/g, '·'), source.replace(/\*/g, '×'));
  if (/\\cdot/.test(source)) out.push(source.replace(/\\cdot\s*/g, '*'), source.replace(/\\cdot\s*/g, '·'));
  if (/\\times/.test(source)) out.push(source.replace(/\\times\s*/g, '×'), source.replace(/\\times\s*/g, '*'));
  return out;
};

/** `2x` for `2*x`, `(x+1)(x-2)` for `(x+1)*(x-2)`: a written product sign left out where the product stays one. */
const withImplicitProducts = (text) => {
  const source = String(text);
  if (hasWords(source)) return [];
  return [source.replace(/(\d|[A-Za-z]|\)|\})\s*(?:\*|·|⋅|×|\\cdot(?![A-Za-z])\s*|\\times(?![A-Za-z])\s*)\s*(?=([A-Za-z(]|\\(?:sqrt|pi|left)(?![A-Za-z])))/g, (match, before, after, offset) => {
    const rest = source.slice(offset + match.length);
    // Never two letters into a name (p·i is not pi), a letter into a call
    // (f·(x)), a letter into a word, or a power's digit into a product.
    if (/[A-Za-z]/.test(before) && /^[A-Za-z]/.test(rest) && /^(?:pi|ln|lg|in|or|an|sin|cos|tan|log|exp|abs)/i.test(`${before}${rest}`)) return match;
    if (/[A-Za-z]/.test(before) && /^\([^()]{1,2}\)/.test(rest)) return match;
    if (/[A-Za-z]/.test(before) && /^[A-Za-z]/.test(rest) && /[A-Za-z]/.test(source[offset - 1] || '')) return match;
    if (/\d/.test(before) && digitBinds(source, offset)) return match;
    return before;
  })];
};

/** `(2x + 3)`, `y = (2x + 3)`, `2x + (-3)`: brackets that change nothing. */
const redundantBracketSpellings = (text) => {
  const source = String(text);
  if (hasWords(source) || /[,;]/.test(source)) return [];
  const sides = sidesOf(source);
  if (!sides) return [];
  const out = [];
  // Round a whole answer or side that is a sum, or a product with a number or
  // two factors; round a number only when it is the whole answer. A lone
  // letter, a call, a root, a bar or a set is not what a student brackets,
  // and a mixed number is its own class (wave 7).
  sides.parts.forEach((part, index) => {
    const trimmed = part.trim();
    if (!trimmed || wrappedBody(trimmed) !== null || /^[{|]|\\(?:left|lvert)/.test(trimmed) || looksLikeCall(trimmed)) return;
    if (/^-?\d+\s*\\frac/.test(trimmed) || /^-?\d+\s+\d+\/\d+$/.test(trimmed)) return;
    const terms = termsOf(trimmed);
    const read = factorsOf(trimmed);
    const isNumber = /^-?\d+(?:\.\d+)?(?:\/\d+)?$/.test(trimmed);
    if (!(terms && terms.length > 1) && !(read && read.factors.length && (read.coefficient || read.factors.length > 1)) && !(isNumber && !sides.signs.length)) return;
    const parts = [...sides.parts];
    parts[index] = `(${trimmed})`;
    out.push(joinSides({ ...sides, parts }));
  });
  // A number term in its own brackets, with its sign: 2x - 3 as 2x + (-3).
  sides.parts.forEach((part, index) => {
    const terms = termsOf(part);
    if (!terms || terms.length < 2) return;
    const at = terms.findIndex((term) => /^[+-]?\d+(?:\.\d+)?$/.test(term.trim()));
    if (at < 0) return;
    const value = terms[at].trim().replace(/^\+/, '');
    const bracketed = [...terms];
    bracketed[at] = at === 0 ? `(${value})` : `+(${value})`;
    const parts = [...sides.parts];
    parts[index] = bracketed.join('').replace(/^\+/, '');
    out.push(joinSides({ ...sides, parts }));
  });
  return out;
};

// A number quotient that stands alone: nothing binds to it before or after
// (3/4x stays 3/4x: its reading is the author's, GR04).
const NUMBER_QUOTIENT = /(?<![\w)}\].^\\])(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)(?![\w.(^{\\])/g;

/** `\frac{3}{4}`, `\dfrac{3}{4}` and `3/4`: the fraction key, the fraction template and the slash. */
const fractionSpellings = (text) => {
  const source = String(text);
  const out = [];
  if (new RegExp(NUMBER_QUOTIENT.source).test(source)) {
    out.push(source.replace(NUMBER_QUOTIENT, '\\frac{$1}{$2}'), source.replace(NUMBER_QUOTIENT, '\\dfrac{$1}{$2}'));
  }
  if (/\\frac/.test(source)) out.push(source.replace(/\\frac/g, '\\dfrac'));
  if (/\\dfrac/.test(source)) out.push(source.replace(/\\dfrac/g, '\\frac'));
  // A stacked number fraction typed with a slash, where nothing binds to it
  // (and never into a mixed number: `3\frac{1}{2}` is not `31/2`).
  const typed = source.replace(/(?<![\w)}\].^\\])\\d?frac\{(\d+(?:\.\d+)?)\}\{(\d+(?:\.\d+)?)\}(?![\w.(^{\\])/g, '$1/$2');
  if (!/\d\s*\d+\/\d/.test(typed)) out.push(typed);
  // (A)/(B), a generator's quotient, as the fraction template.
  const quotient = /^\(([^()]+)\)\/\(([^()]+)\)$/.exec(source.trim());
  if (quotient) out.push(`\\frac{${quotient[1]}}{${quotient[2]}}`);
  return out;
};

/** `<=` for ≤ and ≤ for `<=`: the relation keys and the typed pairs. */
const relationSpellings = (text) => {
  const source = String(text);
  const out = [];
  if (/≤|≥|≠|\\(?:leq?|geq?|neq?)(?![A-Za-z])/.test(source)) {
    out.push(source.replace(/≤|\\leq?(?![A-Za-z])\s*/g, '<=').replace(/≥|\\geq?(?![A-Za-z])\s*/g, '>=').replace(/≠|\\neq?(?![A-Za-z])\s*/g, '!='));
  }
  if (/<=|>=/.test(source)) {
    out.push(source.replace(/<=/g, '≤').replace(/>=/g, '≥'));
    out.push(source.replace(/<=/g, '\\le ').replace(/>=/g, '\\ge '));
    out.push(source.replace(/<=/g, '\\leq ').replace(/>=/g, '\\geq '));
  }
  return out;
};

/** Each side's terms in another order: `3 + 2x` for `2x + 3`, `y = 3 + 2x` for `y = 2x + 3`. */
const reorderedSums = (text) => {
  const source = String(text);
  const sides = hasWords(source) ? null : sidesOf(source);
  if (!sides) return [];
  return sides.parts.flatMap((part, index) => {
    const terms = termsOf(part);
    if (!terms || terms.length < 2) return [];
    const parts = [...sides.parts];
    parts[index] = joinTerms([...terms.slice(1), terms[0]]);
    return [joinSides({ ...sides, parts })];
  });
};

/**
 * A product's factors in another order, as a student writes them: its
 * brackets in another order (`(x+3)(x+2)`), or its letters, π and roots
 * (`6\sqrt{x}x^3`, `2rπ`). The number stays first.
 */
const reorderedProducts = (text) => {
  const source = String(text);
  const sides = hasWords(source) || LIST_OR_SET.test(source) ? null : sidesOf(source);
  if (!sides) return [];
  return sides.parts.flatMap((part, index) => {
    const terms = termsOf(part) || [part];
    for (let at = 0; at < terms.length; at += 1) {
      const read = factorsOf(terms[at]);
      if (!read || looksLikeCall(terms[at])) continue;
      const groups = read.factors.filter((factor) => factor.startsWith('('));
      const others = read.factors.filter((factor) => !factor.startsWith('('));
      let reordered = null;
      if (groups.length > 1 && new Set(groups).size > 1) reordered = [...others, ...[...groups].reverse()];
      else if (others.length > 1 && new Set(others).size > 1) reordered = [...[...others].reverse(), ...groups];
      if (!reordered) continue;
      const spelled = [...terms];
      spelled[at] = `${read.sign}${read.coefficient}${reordered.join('')}`;
      const parts = [...sides.parts];
      parts[index] = spelled.join('');
      return [joinSides({ ...sides, parts })];
    }
    return [];
  });
};

// A fraction's terminating decimal (at most four places), or null.
const terminatingDecimal = (numerator, denominator) => {
  const value = Number(numerator) / Number(denominator);
  if (!Number.isFinite(value)) return null;
  for (let places = 0; places <= 4; places += 1) {
    const scaled = value * 10 ** places;
    if (Math.abs(scaled - Math.round(scaled)) < 1e-9) return value.toFixed(places);
  }
  return null;
};

/** `0.75` for 3/4 (a fraction that ends), the leading zero left off (`.75`), a trailing zero (`5.0`). */
const decimalSpellings = (text) => {
  const source = String(text).trim();
  const toDecimal = (match, sign, numerator, denominator) => {
    const decimal = terminatingDecimal(numerator, denominator);
    return decimal === null || !decimal.includes('.') ? match : `${sign}${decimal}`;
  };
  const out = [source
    .replace(/(?<![\w)}\].^\\])(-?)(\d+)\/(\d+)(?![\d.(^{\\])/g, toDecimal)
    .replace(/(?<![\w)}\].^\\])(-?)\\d?frac\{(\d+)\}\{(\d+)\}(?![\d.(^{\\])/g, toDecimal)];
  if (/^-?\d*\.\d+$/.test(source)) out.push(source.replace(/^(-?)0\./, '$1.'), `${source}0`);
  if (/^-?\d+$/.test(source)) out.push(`${source}.0`);
  return out.filter((spelling) => !/\d\.\d*\.|\.\./.test(spelling));
};

/**
 * What a student writes for a generated key's zero terms: `x^2 - 1 = 0` for
 * `x^2 + 0x - 1 = 0`, `y = -(x-3)^2` for `y = -1(x - 3)^2 + 0`, `y = -2x^2`
 * for `y = -2(x + 0)^2 + 0`. A term that is 0, or 0 times a letter, goes
 * wherever it stands whole; a bracket left holding one letter goes, and a
 * coefficient of 1 with it.
 */
const withoutZeroTerms = (text) => {
  const source = String(text).replace(/\s+/g, '');
  if (hasWords(source) || LIST_OR_SET.test(source)) return [];
  let out = source;
  for (let guard = 0; guard < 6; guard += 1) {
    const next = out
      .replace(/([0-9A-Za-z)\]}|π])[+-]0(?:\.0+)?(?:\*?[A-Za-z](?:\^\d+)?)?(?![\w.^{(\\π])/g, '$1')
      .replace(/(^|[([{=<>])0(?:\.0+)?(?:\*?[A-Za-z](?:\^\d+)?)?(?:\+|(?=-))/g, '$1');
    if (next === out) break;
    out = next;
  }
  if (out === source) return [];
  return [out
    .replace(/(^|[^A-Za-z_\\])\(([A-Za-z])\)/g, '$1$2')
    .replace(/(^|[=(+-])1(?=[A-Za-z(])/g, '$1')
    .replace(/\(\+/g, '(')];
};

/** The spelling classes, each a function from a text to its spellings. */
export const TYPED_SPELLING_CLASSES = Object.freeze({
  spaces: spacedOut,
  'leading +': withLeadingPlus,
  superscripts: withSuperscripts,
  'product signs': productSignSpellings,
  'implicit products': withImplicitProducts,
  'redundant brackets': redundantBracketSpellings,
  fractions: fractionSpellings,
  'relation keys': relationSpellings,
  'reordered sums': reorderedSums,
  'reordered products': reorderedProducts,
  decimals: decimalSpellings,
  'zero terms': withoutZeroTerms,
});

// Comparisons that read their field's numbers as written: a decimal is not
// built for them (a model equation's rates, a rational or radical form).
const WRITTEN_NUMBER_EQUIVALENCES = new Set(['modelEquation', 'rationalExpression', 'nonnegativeRadicalExpression']);

/** Whether a field is typed: a choice is picked, and a text field holds words. */
export const isTypedField = (field = {}) => !(Array.isArray(field.options) && field.options.length)
  && !['choice', 'text'].includes(String(field.inputProfile || '').toLowerCase());

/**
 * The typed spellings of `text`, a right answer of `field` — or, with
 * `{ nearMiss: true }`, a near miss of it — as `[{ spelling, spellingClass }]`,
 * each different from `text`. A near miss is spelled every way whatever the
 * field asks: in any spelling it is still wrong.
 */
export const typedSpellingsOf = (text, field = {}, { nearMiss = false } = {}) => {
  if (!isTypedField(field)) return [];
  const source = String(text ?? '');
  const out = new Map();
  for (const [spellingClass, spell] of Object.entries(TYPED_SPELLING_CLASSES)) {
    if (!nearMiss && (spellingClass === 'reordered sums' || spellingClass === 'reordered products') && field.formAsked) continue;
    if (!nearMiss && spellingClass === 'decimals' && (field.fractionAsked || WRITTEN_NUMBER_EQUIVALENCES.has(field.equivalence))) continue;
    for (const spelling of spell(source)) {
      if (spelling && spelling !== source && !out.has(spelling)) out.set(spelling, spellingClass);
    }
  }
  return [...out].map(([spelling, spellingClass]) => ({ spelling, spellingClass }));
};

// --- WRONG: the near misses these classes need --------------------------------

/** Near misses of a key that each class needs, as `[{ miss, spellingClass }]`. Each is another answer. */
export const typedNearMissesOf = (text, field = {}) => {
  if (!isTypedField(field)) return [];
  const source = String(text ?? '').trim();
  const out = new Map();
  const add = (spellingClass, miss) => { if (miss && miss !== source && !out.has(miss)) out.set(miss, spellingClass); };
  const zero = (term) => /^[+-]\s*0(?:\.0+)?\s*$/.test(term);
  // spaces: a space inside a number makes a mixed number (`3 1/2` is not
  // 31/2), unless the two are one number (31/10 and 3 1/10).
  const quotient = /^(-?)(\d)(\d+)\/(\d+)$/.exec(source);
  if (quotient) {
    const [, sign, whole, rest, denominator] = quotient;
    const split = Number(whole) + Number(rest) / Number(denominator);
    if (Number(rest) > 0 && Number(rest) < Number(denominator) && Math.abs(Number(`${whole}${rest}`) / Number(denominator) - split) > 1e-9) {
      add('spaces', `${sign}${whole} ${rest}/${denominator}`);
    }
  }
  // superscripts: a power moved by one (x³ for x²), not where the coefficient is 0.
  if (!/(?:^|[^\d.])0\*?[A-Za-z]\^/.test(source)) add('superscripts', source.replace(/\^(\{?)(\d+)/, (match, brace, power) => `^${brace}${Number(power) + 1}`));
  const sides = hasWords(source) ? null : sidesOf(source);
  // redundant brackets: brackets that are not redundant — a minus taking in
  // the rest of the sum (`-(2x + 3)` for -2x + 3), a number inside a power
  // (`(2x)^2` for 2x²).
  sides?.parts.forEach((part, index) => {
    const terms = termsOf(part);
    if (!terms || terms.length < 2) return;
    const parts = [...sides.parts];
    if (terms.length === 2) {
      if (!terms[0].trim().startsWith('-') || zero(terms[1])) return;
      parts[index] = `-(${terms[0].trim().slice(1)}${terms[1]})`;
    } else {
      const minus = terms.findIndex((term, at) => at > 0 && at < terms.length - 1 && term.startsWith('-'));
      if (minus < 0 || terms.slice(minus + 1).every(zero)) return;
      parts[index] = `${terms.slice(0, minus).join('')}-(${terms[minus].slice(1)}${terms.slice(minus + 1).join('')})`;
    }
    add('redundant brackets', joinSides({ ...sides, parts }));
  });
  add('redundant brackets', source.replace(/(?<![\w^.)}])(\d+)([a-z])\^(\d+)(?![\d.])/, (match, coefficient, letter, power) => (
    coefficient === '1' || power === '1' ? match : `(${coefficient}${letter})^${power}`)));
  // fractions: turned over; decimals: its digits read as a decimal (`3.4`
  // for 3/4), or a fraction that does not end, rounded (`0.33` for 1/3).
  const fraction = /^(-?)(?:(\d+)\/(\d+)|\\d?frac\{(\d+)\}\{(\d+)\})$/.exec(source);
  if (fraction) {
    const [numerator, denominator] = [fraction[2] ?? fraction[4], fraction[3] ?? fraction[5]];
    if (Number(numerator) !== Number(denominator)) add('fractions', `${fraction[1]}${denominator}/${numerator}`);
    add('decimals', `${fraction[1]}${numerator}.${denominator}`);
    if (terminatingDecimal(numerator, denominator) === null) add('decimals', `${fraction[1]}${(Number(numerator) / Number(denominator)).toFixed(2)}`);
  }
  // relation keys: the relation turned round (x ≥ 5 for x ≤ 5).
  if (sides?.signs.length === 1 && /<|>|≤|≥|\\[lg]e/.test(sides.signs[0])) {
    const turned = { '<': '>', '>': '<', '<=': '>=', '>=': '<=', '≤': '≥', '≥': '≤' }[sides.signs[0]]
      ?? sides.signs[0].replace(/\\l/, '\\G').replace(/\\g/, '\\l').replace(/\\G/, '\\g');
    add('relation keys', joinSides({ ...sides, signs: [turned] }));
  }
  // reordered sums: two terms swapped without their signs (3 - 2x for 2x - 3).
  sides?.parts.forEach((part, index) => {
    const terms = termsOf(part);
    if (!terms || terms.length < 2 || terms[0].trim().startsWith('-') || !terms[1].startsWith('-')) return;
    const first = terms[0].trim().replace(/^\+/, '');
    const second = terms[1].slice(1);
    if (first === second || zero(terms[1]) || /^0(?:\.0+)?$/.test(first)) return;
    const parts = [...sides.parts];
    parts[index] = `${second}-${first}${terms.slice(2).join('')}`;
    add('reordered sums', joinSides({ ...sides, parts }));
  });
  // reordered products: a power moved to another factor (xy² for x²y).
  const monomial = /^(-?\d*)([a-z])\^(\d+)([a-z])$/.exec(source);
  if (monomial && monomial[2] !== monomial[4] && monomial[3] !== '1') add('reordered products', `${monomial[1]}${monomial[2]}${monomial[4]}^${monomial[3]}`);
  return [...out].map(([miss, spellingClass]) => ({ miss, spellingClass }));
};
