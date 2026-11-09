/*
 * "PRACTISE ONE LIKE THIS" FOR AN nTH ROOT OF A MONOMIAL (numericVariant.js's
 * fifth kind): THE ITEM ITSELF, WITH NEW NUMBERS.
 *
 *   buildRadicalVariant(question, { seed }) → { prompt, steps, answer, fields, kind } | null
 *   readRadicalItem(question)               → the item's roots, or null
 *
 * Algebra II's radicals lessons (Radical Expressions, its Honors twin, nth
 * Roots, Operations with Radical Expressions) offered a practice for none of
 * their Classwork and Practice items. Their product-property items have a
 * shape a variant can keep exactly: an nth root of a monomial, perhaps with a
 * number in front, written in simplest radical form,
 *
 *   √(25a⁴b⁹) = 5a²b⁴√b        ∛(−54a⁷) = −3a²∛(2a)        3√12 = 6√3
 *   ⁴√(625b²⁸k²³) = 5|b⁷|k⁵∜(k³), where b can be any real number
 *
 * with the boxes beside it: the largest perfect nth-power factor of the
 * radicand, or the radicand as a perfect nth power ("9x⁴y¹⁰z⁴ = ( ? )²").
 *
 * WHERE THE WORK IS READ. A root box is one the item grades in simplest
 * radical form (gradingMode simplestRadicalForm) that names its root in its
 * label ("√(16x⁴y¹¹) =", "3√12 =") or, as the item's one root box with a label
 * in words ("Simplified"), in the prompt's one piece of mathematics. Its key
 * must be exactly the simplified root (the platform's own comparator
 * decides), so the key confirms the reading, and it decides the item's
 * assumption: absolute value bars on a power taken out of an even root
 * unless the item says its letters are positive. Every typed box must be read;
 * a choice is left out (its options are the item's reasons).
 *
 * NOT VARIED: a word problem (a prompt with a number outside its
 * mathematics), a family slot, a box this cannot read (a root of a sum or a
 * fraction, a negative square root asked apart, a decimal), and a root with
 * no number to change (⁶√(t⁶) = |t|).
 *
 * THE SAME SHAPE, NEVER EASIER. The index, the letters, and what each letter
 * leaves under the root (its exponent's remainder) stay; each letter's
 * exponent moves by a whole multiple of the index, keeping the parity of what
 * comes out, so absolute value bars are needed exactly where the item's are.
 * The radicand's largest perfect nth power keeps its root's size (a 1 stays
 * 1, any other moves at most one down or two up, never below 2), what is left
 * in the number under the root stays free of nth powers (a 1 stays 1), a sign
 * stays, and a number in front stays 1 or moves like the others. The sizes
 * add up to at least the item's.
 *
 * NEVER A GIVE-AWAY. No answer equals one of the item's keys, nothing the
 * variant writes has a key's value (compared at sample points), and the guard
 * every family sibling passes (similarExampleIsSafe) runs too.
 *
 * VERIFIED. Each key is graded by the item's own box (gradeMultiAnswerResponse,
 * its simplest-radical-form comparator included): the key right, the root
 * retyped unsimplified wrong, the key with a number off by one wrong, the key
 * without its bars wrong where bars are needed, and the item's own key wrong.
 * The practice checks the student's answer with that same box (`fields`).
 *
 * THE ITEM'S METHOD. The steps write the radicand as its largest perfect nth
 * power times what is left, split the root, take the root of the perfect
 * power, and say why each bar is there. Every "=" in them is true
 * (tests/platform/practiceLikeThisRadicals.test.mjs evaluates each one).
 *
 * NOTHING HERE IS RECORDED. It returns values, like numericVariant.js.
 */
import { hintRevealsAnswer } from '../../../../functions/shared/pathSolutionSupport.mjs';
import { isFamilyBackedQuestion } from '../../../../functions/shared/questionFamilySlot.mjs';
import { sameSimplestRadicalForm } from '../../../../functions/shared/simplestRadicalFormEquivalence.mjs';
import { gradeMultiAnswerResponse } from '../../../../functions/shared/ordinaryResponseGrading.mjs';
// The item's simplest-radical-form boxes grade with the form-specific comparators.
import '../../../../functions/shared/formSpecificFieldGrading.mjs';
import { parse } from '../../math/mathjs.js';
import { questionAnswerValues } from '../hints/questionHints.js';
import { similarExampleIsSafe } from './similarProblem.js';

export const RADICAL_VARIANT_KIND = 'radical';

const text = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

/* ------------------------------------------------------ seeded randomness */

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

/* --------------------------------------------------------- the arithmetic */

/** The largest k with kⁿ dividing m (m > 0): { k, rest: m / kⁿ }. */
const perfectPart = (m, n) => {
  let k = 1;
  for (let candidate = 2; candidate ** n <= m; candidate += 1) if (m % (candidate ** n) === 0) k = candidate;
  return { k, rest: m / k ** n };
};
const isPowerFree = (m, n) => perfectPart(m, n).k === 1;

/*
 * A root: { outside, n, c, powers } is outside · ⁿ√(c · ∏ letterᵉ). Its
 * simplest form: { sign, coefficient, out: { letter: q }, inside: { c, powers },
 * bars: [letters] } — every letter's exponent split as n·q + s, the number as
 * kⁿ·r, a bar on letter^q where the index is even, q is odd, the letter may be
 * negative and nothing left under the root says it is not.
 */
const simplify = (root, { anyReal }) => {
  const { outside, n, c, powers } = root;
  const sign = c < 0 ? -1 : 1;
  const { k, rest } = perfectPart(Math.abs(c), n);
  const out = {};
  const inside = {};
  Object.entries(powers).forEach(([letter, exponent]) => {
    out[letter] = Math.floor(exponent / n);
    inside[letter] = exponent % n;
  });
  const bars = n % 2 === 0 && anyReal
    ? Object.keys(powers).filter((letter) => out[letter] % 2 === 1 && inside[letter] % 2 === 0)
    : [];
  return { sign, coefficient: outside * k, k, out, inside: { c: rest, powers: inside }, bars };
};

/* --------------------------------------------------------------- writing */

const SUPERSCRIPT_DIGITS = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
const letters = (powers) => Object.entries(powers).filter(([, power]) => power > 0).sort(([a], [b]) => (a < b ? -1 : 1));
const powerLatex = (letter, power) => (power === 1 ? letter : `${letter}^{${power}}`);
const powerTyped = (letter, power) => (power === 1 ? letter : `${letter}^${power}`);
/** A monomial: "25a^{4}b^{8}", or typed "25a^4b^8"; 1 with no letters is "1". */
const monomial = (c, powers, write) => {
  const shown = letters(powers).map(([letter, power]) => write(letter, power)).join('');
  if (!shown) return String(c);
  return `${c === 1 ? '' : c === -1 ? '-' : c}${shown}`;
};
const monomialLatex = (c, powers) => monomial(c, powers, powerLatex);
const monomialTyped = (c, powers) => monomial(c, powers, powerTyped);

/** "\sqrt{b}", "\sqrt[3]{p^{2}}". */
const rootLatex = (n, radicand) => (n === 2 ? `\\sqrt{${radicand}}` : `\\sqrt[${n}]{${radicand}}`);
/*
 * A root as the item's key writes one: "√b", "√(15a)", "cbrt(2a)" or
 * "∛(p^2)", "∜(k^3)" or "root(4)(k^3)", "root(6)(x^2y)".
 */
const rootTyped = (n, radicand, style) => {
  const bare = /^[A-Za-z0-9]$/.test(radicand) || /^\d+$/.test(radicand);
  if (n === 2) return bare ? `√${radicand}` : `√(${radicand})`;
  if (n === 3 && style.cube === 'cbrt') return `cbrt(${radicand})`;
  if (n === 3) return `∛(${radicand})`;
  if (n === 4 && style.fourth === '∜') return `∜(${radicand})`;
  return `root(${n})(${radicand})`;
};

/** The letters that come out of the root, with bars where they are needed. */
const outsideLetters = (simple, write, bar) => letters(simple.out).map(([letter, power]) => (simple.bars.includes(letter) ? bar(write(letter, power)) : write(letter, power))).join('');

/** The simplest form, written: "5a^{2}b^{4}\sqrt{b}", typed "5a^2b^4√b". */
const simplestLatex = (simple, n) => {
  const front = simple.sign * simple.coefficient;
  const lettersOut = outsideLetters(simple, powerLatex, (inner) => `|${inner}|`);
  const radicand = monomialLatex(simple.inside.c, simple.inside.powers);
  const root = radicand === '1' ? '' : rootLatex(n, radicand);
  const number = front === 1 && (lettersOut || root) ? '' : front === -1 && (lettersOut || root) ? '-' : String(front);
  return `${number}${lettersOut}${root}` || '1';
};
const simplestTyped = (simple, n, style) => {
  const front = simple.sign * simple.coefficient;
  const lettersOut = outsideLetters(simple, powerTyped, (inner) => `|${inner}|`);
  const radicand = monomialTyped(simple.inside.c, simple.inside.powers);
  const root = radicand === '1' ? '' : rootTyped(n, radicand, style);
  const number = front === 1 && (lettersOut || root) ? '' : front === -1 && (lettersOut || root) ? '-' : String(front);
  return `${number}${lettersOut}${lettersOut && root && /^(?:root|cbrt)/.test(root) ? ' ' : ''}${root}` || '1';
};
/** The root as written in a prompt: "2\sqrt{75x^{2}y^{3}}", "\sqrt[3]{-54a^{7}}". */
const rootOfLatex = (root) => `${root.outside === 1 ? '' : root.outside}${rootLatex(root.n, monomialLatex(root.c, root.powers))}`;

/* ------------------------------------------------- reading the item's math */

/*
 * A root as an item writes it — "\sqrt[3]{-54a^7}", "2\sqrt{75x^2y^3}",
 * "√(16x⁴y¹¹)", "⁶√(64x⁸y¹³)", "∛(−54a⁷)", "3√12" — or null.
 */
const readRoot = (raw) => {
  let value = text(raw)
    .replace(/^\$|\$$/g, '')
    .replace(/\\left|\\right/g, '')
    .replace(/[−–]/g, '-')
    .replace(/\s+/g, '')
    .replace(/\^\{(\d+)\}/g, '^$1');
  // A root is marked R<index>| so its index never runs into its radicand's digits.
  // LaTeX: \sqrt[n]{…} and \sqrt{…}.
  value = value.replace(/\\sqrt\[(\d+)\]\{([^{}]+)\}/g, 'R$1|($2)').replace(/\\sqrt\{([^{}]+)\}/g, 'R2|($1)');
  // Unicode: ⁿ√(…), ∛(…), ∜(…), √(…), √63.
  value = value.replace(/([⁰¹²³⁴⁵⁶⁷⁸⁹]+)√/g, (match, digits) => `R${[...digits].map((digit) => SUPERSCRIPT_DIGITS[digit]).join('')}|`)
    .replace(/∛/g, 'R3|').replace(/∜/g, 'R4|').replace(/√/g, 'R2|')
    .replace(/R(\d+)\|(\d+|[A-Za-z])$/, 'R$1|($2)')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (digits) => `^${[...digits].map((digit) => SUPERSCRIPT_DIGITS[digit]).join('')}`);
  const match = /^(\d*)R(\d+)\|\(([^()]+)\)$/.exec(value);
  if (!match) return null;
  const outside = match[1] ? Number(match[1]) : 1;
  const n = Number(match[2]);
  const inner = /^(-?)(\d*)((?:[A-Za-z](?:\^\d+)?)*)$/.exec(match[3]);
  if (!inner || n < 2 || n > 8 || outside < 1) return null;
  const c = (inner[1] ? -1 : 1) * (inner[2] ? Number(inner[2]) : 1);
  if (c < 0 && n % 2 === 0) return null;
  const powers = {};
  for (const [, letter, power] of inner[3].matchAll(/([A-Za-z])(?:\^(\d+))?/g)) {
    if (powers[letter]) return null;
    powers[letter] = power ? Number(power) : 1;
  }
  if (!inner[2] && !inner[3]) return null;
  return { outside, n, c, powers };
};

/** A monomial as written ("25a⁴b⁸", "9", "3x^2y^5z^2"), or null. */
const readMonomial = (raw) => {
  const value = text(raw).replace(/[−–]/g, '-').replace(/\s+/g, '').replace(/\^\{(\d+)\}/g, '^$1')
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (digits) => `^${[...digits].map((digit) => SUPERSCRIPT_DIGITS[digit]).join('')}`);
  const match = /^(-?)(\d*)((?:[A-Za-z](?:\^\d+)?)*)$/.exec(value);
  if (!match || (!match[2] && !match[3])) return null;
  const powers = {};
  for (const [, letter, power] of match[3].matchAll(/([A-Za-z])(?:\^(\d+))?/g)) {
    if (powers[letter]) return null;
    powers[letter] = power ? Number(power) : 1;
  }
  return { c: (match[1] ? -1 : 1) * (match[2] ? Number(match[2]) : 1), powers };
};
const sameMonomial = (left, right) => Boolean(left && right) && left.c === right.c
  && JSON.stringify(letters(left.powers)) === JSON.stringify(letters(right.powers));

const mathPieces = (prompt) => (text(prompt).match(/\$[^$]+\$/g) || []).map((piece) => piece.slice(1, -1));
const outsideMath = (prompt) => text(prompt).replace(/\$[^$]+\$/g, ' ');
const isChoiceField = (field) => /choice|select|dropdown|radio/i.test(String(field?.type || field?.inputType || '')) || list(field?.options).length > 0;

const FACTOR_LABEL = /^largest\s+perfect[-\s](square|cube|fourth[-\s]power|fifth[-\s]power|sixth[-\s]power)\s+factor\s+of\s+(.+?)\s*$/i;
const BASE_LABEL = /^(.+?)\s*=\s*\(\s*\?\s*\)\s*([²³⁴⁵⁶⁷⁸⁹])\s*\.?.*$/;
const INDEX_OF = Object.freeze({ square: 2, cube: 3, 'fourth power': 4, 'fifth power': 5, 'sixth power': 6 });

/** How the item's key writes a cube or fourth root, so the variant's keys are in the key's notation. */
const styleOf = (keys) => ({
  cube: keys.some((key) => /cbrt\(/.test(key)) ? 'cbrt' : '∛',
  fourth: keys.some((key) => /∜/.test(key)) ? '∜' : 'root',
});

/**
 * The item as roots: { boxes: [{ role, field, root?, anyReal? }] } in the order
 * of its typed boxes, or null. `role` is 'root', 'factor' or 'base'.
 */
export const readRadicalItem = (question) => {
  if (!question || typeof question !== 'object' || question.type !== 'multiAnswer') return null;
  if (isFamilyBackedQuestion(question) || question.familyDelivery || question.generator || question.context) return null;
  const prompt = text(question.prompt);
  if (/\d/.test(outsideMath(prompt))) return null;
  const typed = list(question.answerFields).filter((field) => text(field?.id) && !isChoiceField(field));
  if (!typed.length || typed.length > 4) return null;
  const rootFields = typed.filter((field) => field.gradingMode === 'simplestRadicalForm');
  const style = styleOf(rootFields.map((field) => text(field.answer)));
  const boxes = [];
  for (const field of typed) {
    const label = text(field.label);
    const key = text(field.answer);
    if (!key) return null;
    const factor = FACTOR_LABEL.exec(label);
    const base = BASE_LABEL.exec(label);
    if (field.gradingMode === 'simplestRadicalForm') {
      let root = readRoot(label.replace(/\s*=\s*$/, ''));
      if (!root && rootFields.length === 1 && !/\d|√|∛|∜/.test(label)) {
        const pieces = mathPieces(prompt).map(readRoot).filter(Boolean);
        if (pieces.length === 1) [root] = pieces;
      }
      if (!root) return null;
      // The key confirms the reading, and says whether the letters may be negative.
      const anyReal = [false, true].find((assumption) => sameSimplestRadicalForm(simplestTyped(simplify(root, { anyReal: assumption }), root.n, style), key));
      if (anyReal === undefined) return null;
      boxes.push({ role: 'root', field, root, anyReal, style });
    } else if (factor && !field.gradingMode) {
      const radicand = readMonomial(factor[2]);
      if (!radicand || radicand.c < 1) return null;
      const n = INDEX_OF[factor[1].toLowerCase().replace(/-/g, ' ')];
      const root = { outside: 1, n, c: radicand.c, powers: radicand.powers };
      const simple = simplify(root, { anyReal: false });
      const perfect = { c: simple.k ** n, powers: Object.fromEntries(Object.entries(simple.out).map(([letter, q]) => [letter, n * q])) };
      if (!sameMonomial(readMonomial(key), perfect)) return null;
      boxes.push({ role: 'factor', field, root });
    } else if (base && !field.gradingMode) {
      const radicand = readMonomial(base[1]);
      const n = Number(SUPERSCRIPT_DIGITS[base[2]]);
      if (!radicand || radicand.c < 1) return null;
      const root = { outside: 1, n, c: radicand.c, powers: radicand.powers };
      const simple = simplify(root, { anyReal: false });
      // A perfect nth power: nothing is left under the root.
      if (simple.inside.c !== 1 || Object.values(simple.inside.powers).some(Boolean)) return null;
      if (!sameMonomial(readMonomial(key), { c: simple.k, powers: simple.out })) return null;
      boxes.push({ role: 'base', field, root });
    } else return null;
  }
  return boxes.some((box) => box.role === 'root' || box.role === 'factor') ? { boxes } : null;
};

/* ------------------------------------------------------------ the variant */

/*
 * A root with new numbers. A number of size 1 stays 1; the perfect power's
 * root k and a number in front move at most one down or two up, never below
 * 2; what is left in the number under the root is another number of about its
 * size with no nth power in it; each exponent moves by a whole multiple of the
 * index, at most twice it, keeping its remainder and the parity of what comes out.
 */
const move = (random, size) => (size === 1 ? 1 : integer(random, Math.max(2, size - 1), size + 2));
const redrawRadicand = (random, root) => {
  const { n, c, powers } = root;
  const { k, rest } = perfectPart(Math.abs(c), n);
  let r = rest;
  if (rest > 1) {
    const options = [];
    for (let candidate = Math.max(2, rest - 2); candidate <= rest + 3; candidate += 1) if (isPowerFree(candidate, n)) options.push(candidate);
    r = options[integer(random, 0, options.length - 1)];
  }
  const kNext = move(random, k);
  const next = {};
  Object.entries(powers).forEach(([letter, exponent]) => {
    const q = Math.floor(exponent / n);
    const s = exponent % n;
    const choices = [q, q + 2, q - 2].filter((value) => value >= Math.max(0, q - 1) && value <= q + 2 && (q === 0 ? value === 0 : value >= 1));
    next[letter] = n * choices[integer(random, 0, choices.length - 1)] + s;
  });
  return { n, c: Math.sign(c) * kNext ** n * r, powers: next };
};

const sizeOfRoot = (root) => {
  const { k, rest } = perfectPart(Math.abs(root.c), root.n);
  return root.outside + k + rest + Object.values(root.powers).reduce((sum, power) => sum + power, 0);
};

/* The value of a typed or written root expression at positive letters, or null (the "never the item's" check). */
const toMathjs = (raw) => text(raw)
  .replace(/\\left|\\right/g, '')
  .replace(/\\sqrt\[(\d+)\]\{([^{}]+)\}/g, 'nthRoot($2, $1)')
  .replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)')
  .replace(/root\((\d+)\)\(([^()]+)\)/g, 'nthRoot($2, $1)')
  .replace(/cbrt\(/g, 'nthRoot3(')
  .replace(/∛\(([^()]+)\)/g, 'nthRoot($1, 3)')
  .replace(/∜\(([^()]+)\)/g, 'nthRoot($1, 4)')
  .replace(/√\(([^()]+)\)/g, 'sqrt($1)')
  .replace(/√([A-Za-z0-9])/g, 'sqrt($1)')
  .replace(/\|([^|]+)\|/g, 'abs($1)')
  .replace(/\^\{([^{}]+)\}/g, '^($1)')
  .replace(/\\cdot/g, '*')
  .replace(/[−–]/g, '-')
  // A run of letters is a product of letters ("ab" is a·b), not one name; function names stay, set apart.
  .replace(/(sqrt|nthRoot3|nthRoot|abs)\(/g, ' $1(')
  .replace(/[A-Za-z]+/g, (run) => (/^(?:sqrt|nthRoot|nthRoot3|abs)$/.test(run) ? run : run.split('').join('*')));
const SAMPLE = Object.freeze({ a: 1.3, b: 1.7, c: 1.1, k: 1.9, m: 1.2, p: 1.4, t: 1.6, x: 1.15, y: 1.45, z: 1.25 });
const valueAt = (raw) => {
  try {
    const expression = toMathjs(raw).replace(/nthRoot3\(([^()]+)\)/g, 'nthRoot($1, 3)');
    const scope = Object.fromEntries(Object.entries(SAMPLE));
    const value = Number(parse(expression).evaluate({ ...scope }));
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
};

/** The steps of one root, in the item's method. */
const stepsOf = (root, simple) => {
  const { n } = root;
  const steps = [];
  const radicand = monomialLatex(root.c, root.powers);
  const name = n === 2 ? 'square' : n === 3 ? 'cube' : `${['', '', '', '', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'][n]} power`;
  const perfect = monomialLatex(Math.sign(root.c) * simple.k ** n, Object.fromEntries(Object.entries(simple.out).map(([letter, q]) => [letter, n * q])));
  const leftover = monomialLatex(simple.inside.c, simple.inside.powers);
  const base = monomialLatex(Math.sign(root.c) * simple.k, simple.out);
  const result = simplestLatex(simple, n);
  const front = root.outside === 1 ? '' : `${root.outside}`;
  const whole = rootOfLatex(root);
  if (leftover === '1') {
    steps.push(`$${radicand} = (${base})^{${n}}$, a perfect ${name}.`);
  } else {
    steps.push(`The largest perfect ${name} factor of $${radicand}$ is $${perfect}$: $${radicand} = ${perfect} \\cdot ${leftover}$.`);
  }
  // A bar for each letter whose power comes out of an even root and may be negative.
  simple.bars.forEach((letter) => {
    const q = simple.out[letter];
    steps.push(`$${letter}$ can be negative and the index is even, so $${rootLatex(n, powerLatex(letter, n * q))} = |${powerLatex(letter, q)}|$.`);
  });
  // A number in front multiplies the root's own simplest form.
  const middle = front ? ` = ${front} \\cdot ${simplestLatex({ ...simple, coefficient: simple.k }, n)}` : '';
  if (leftover === '1') {
    steps.push(`So $${whole}${middle} = ${result}$.`);
  } else {
    steps.push(`So $${whole} = ${front}${rootLatex(n, perfect)} \\cdot ${rootLatex(n, leftover)}${middle} = ${result}$.`);
  }
  return steps;
};

/** The box as the item grades it, keyed to the variant (any alternate answer listed was the item's). */
const keyedField = (field, answer) => ({ ...field, answer, acceptedAnswers: undefined, accepted: undefined, expected: undefined });

const ORDINALS = ['First', 'Second', 'Third', 'Fourth'];
const ATTEMPTS = 400;

const variantOf = (question, item, seed) => {
  const itemKeys = item.boxes.map((box) => text(box.field.answer));
  const itemValues = itemKeys.map(valueAt).filter((value) => value !== null);
  const answersAnywhere = [...itemKeys, ...questionAnswerValues(question)];
  const positive = /\bpositive\b/i.test(text(question.prompt));
  const random = randomFrom(hashText(`${Number(seed) || 0}|${RADICAL_VARIANT_KIND}|${itemKeys.join('|')}`));
  // A radicand named twice (a factor box and its root box, "3√12" and "the largest
  // perfect-square factor of 12") is one radicand, redrawn once.
  const radicandKey = (root) => JSON.stringify([root.n, root.c, letters(root.powers)]);
  const rootKey = (root) => JSON.stringify([root.outside, root.n, root.c, letters(root.powers)]);
  const radicands = [...new Set(item.boxes.map((box) => radicandKey(box.root)))];

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const redrawn = new Map();
    item.boxes.forEach((box) => {
      const key = radicandKey(box.root);
      if (!redrawn.has(key)) redrawn.set(key, redrawRadicand(random, box.root));
    });
    const outsides = new Map();
    const roots = item.boxes.map((box) => {
      if (!outsides.has(radicandKey(box.root))) outsides.set(radicandKey(box.root), move(random, box.root.outside));
      return { outside: box.role === 'root' ? outsides.get(radicandKey(box.root)) : 1, ...redrawn.get(radicandKey(box.root)) };
    });
    // Never easier, never the item's own root.
    if (item.boxes.some((box, index) => sizeOfRoot(roots[index]) < sizeOfRoot(box.root) || rootKey(roots[index]) === rootKey(box.root))) continue;
    if (roots.some((root, index) => Math.abs(root.c) > Math.max(4 * Math.abs(item.boxes[index].root.c), Math.abs(item.boxes[index].root.c) + 60))) continue;
    // Different roots stay different.
    const distinct = new Set(item.boxes.map((box) => rootKey(box.root))).size;
    if (new Set(roots.map(rootKey)).size !== distinct) continue;

    const keys = [];
    const shown = [];
    item.boxes.forEach((box, index) => {
      const root = roots[index];
      const simple = simplify(root, { anyReal: box.role === 'root' ? box.anyReal : false });
      if (box.role === 'root') {
        keys.push(simplestTyped(simple, root.n, box.style));
        shown.push(simplestLatex(simple, root.n));
      } else if (box.role === 'factor') {
        const perfect = Object.fromEntries(Object.entries(simple.out).map(([letter, q]) => [letter, root.n * q]));
        keys.push(monomialTyped(simple.k ** root.n, perfect));
        shown.push(monomialLatex(simple.k ** root.n, perfect));
      } else {
        keys.push(monomialTyped(simple.k, simple.out));
        shown.push(monomialLatex(simple.k, simple.out));
      }
    });
    // The same shape: a base box's radicand stays a perfect power; a root keeps what is left under it and its bars.
    const sameShape = item.boxes.every((box, index) => {
      const own = simplify(box.root, { anyReal: box.anyReal || false });
      const next = simplify(roots[index], { anyReal: box.anyReal || false });
      return (own.inside.c === 1) === (next.inside.c === 1)
        && JSON.stringify(own.inside.powers) === JSON.stringify(next.inside.powers)
        && JSON.stringify(own.bars) === JSON.stringify(next.bars)
        && (own.k === 1) === (next.k === 1);
    });
    if (!sameShape) continue;

    // The prompt: each radicand once, in the item's order (as its root box writes it), with the item's assumption.
    const askedAt = radicands.map((key) => {
      const rootAt = item.boxes.findIndex((box) => box.role === 'root' && radicandKey(box.root) === key);
      return rootAt >= 0 ? rootAt : item.boxes.findIndex((box) => radicandKey(box.root) === key);
    });
    const asked = askedAt.map((index) => roots[index]);
    const ordinalOf = (index) => ORDINALS[radicands.indexOf(radicandKey(item.boxes[index].root))];
    const barsNeeded = item.boxes.some((box, index) => box.role === 'root' && box.anyReal && simplify(roots[index], { anyReal: true }).bars.length);
    const assumption = positive ? ' Assume every variable is positive.' : barsNeeded ? ' The variables can be any real numbers: use absolute value where it is needed.' : '';
    const prompt = asked.length === 1
      ? `Simplify $${rootOfLatex(asked[0])}$.${assumption}`
      : `Simplify each root.${assumption} ${asked.map((root, index) => `${ORDINALS[index]}: $${rootOfLatex(root)}$.`).join(' ')}`;
    // Box names in words only (the answer line is read at its "=", and a comma or an apostrophe would split it).
    const factorName = (n) => (n === 2 ? 'square' : n === 3 ? 'cube' : `${['fourth', 'fifth', 'sixth', 'seventh', 'eighth'][n - 4]} power`);
    const labels = item.boxes.map((box, index) => {
      const which = asked.length === 1 ? '' : `${ordinalOf(index)} `;
      if (box.role === 'factor') return `${which || 'Largest '}perfect ${factorName(box.root.n)} factor`;
      if (box.role === 'base') return `${which}base`.replace(/^b/, 'B');
      return which ? `${which}root` : 'Simplified';
    });
    const steps = askedAt.flatMap((index) => {
      const box = item.boxes[index];
      return stepsOf(roots[index], simplify(roots[index], { anyReal: box.role === 'root' ? box.anyReal : false }));
    });
    const variant = {
      prompt,
      steps,
      answer: labels.map((label, index) => `${label} = $${shown[index]}$`).join('; '),
      fields: item.boxes.map((box, index) => keyedField(box.field, keys[index])),
      kind: RADICAL_VARIANT_KIND,
    };

    // Never the item's: no key, and nothing written with a key's value.
    if (keys.some((key, index) => key === itemKeys[index] || (valueAt(key) !== null && valueAt(itemKeys[index]) !== null && Math.abs(valueAt(key) - valueAt(itemKeys[index])) < 1e-9))) continue;
    const written = [variant.prompt, ...variant.steps, variant.answer].flatMap((line) => (String(line).match(/\$[^$]+\$/g) || []).map((piece) => piece.slice(1, -1)))
      .flatMap((piece) => piece.split(/=|\\cdot|:/)).map((side) => side.trim()).filter(Boolean);
    if (written.some((side) => {
      const value = valueAt(side);
      return value !== null && itemValues.some((own) => Math.abs(own - value) < 1e-9);
    })) continue;
    if (hintRevealsAnswer([variant.prompt, ...variant.steps, variant.answer].join('\n'), answersAnywhere)) continue;
    if (!similarExampleIsSafe(question, variant)) continue;
    if (!boxesAgree(question, item, keys, roots)) continue;
    return variant;
  }
  return null;
};

/** The item's own boxes about the variant's keys: right; the root unsimplified, a number off by one, the bars left off and the item's key wrong. */
const boxesAgree = (question, item, keys, roots) => {
  try {
    const fields = item.boxes.map((box, index) => keyedField(box.field, keys[index]));
    const asked = { ...question, answerFields: fields };
    const grade = (typed) => gradeMultiAnswerResponse(asked, Object.fromEntries(fields.map((field, index) => [field.id, typed[index]]))).parts;
    if (!grade(keys).every((part) => part.isCorrect === true)) return false;
    return item.boxes.every((box, index) => {
      const wrong = [text(box.field.answer), keys[index].replace(/(?<![\^\d(])(\d+)/, (digits) => String(Number(digits) + 1))];
      if (box.role === 'root') {
        const root = roots[index];
        wrong.push(`${root.outside === 1 ? '' : root.outside}${rootTyped(root.n, monomialTyped(root.c, root.powers), box.style)}`);
        if (keys[index].includes('|')) wrong.push(keys[index].replace(/\|/g, ''));
      }
      // (A key with no number to move, |x^5|, has no near miss of that kind.)
      return wrong.filter((answer) => answer !== keys[index]).every((answer) => grade(keys.map((key, at) => (at === index ? answer : key)))[index].isCorrect === false);
    });
  } catch {
    return false;
  }
};

export const buildRadicalVariant = (question, { seed = 0 } = {}) => {
  try {
    const item = readRadicalItem(question);
    return item ? variantOf(question, item, seed) : null;
  } catch {
    return null;
  }
};
