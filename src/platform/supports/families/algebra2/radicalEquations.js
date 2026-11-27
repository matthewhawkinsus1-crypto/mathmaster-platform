/*
 * RADICAL EQUATIONS IN ANSWER BOXES (WE-I): the Algebra II answer-box
 * generator for A2.4G. A generator as exponents.js describes one.
 *
 *   twoRadicals  √(x − a) = b − √x, solved by squaring twice: square both
 *                sides, isolate the radical that is left, square again, and
 *                check the candidate in the first equation, each side apart,
 *                then say what the check shows.
 *
 * The sibling is the same equation with other numbers, built from its
 * solution so every line checks: √x = s, b − s on the right, and
 * a = s² − (b − s)². Whether its candidate checks is part of the item's
 * answer (the item may have no real solution), so the sibling's case comes
 * from the seed alone and never from the item's: it says nothing about the
 * item's, and the check slide says what the other case would mean.
 */
import { MINUS, firstFitting, signed, superscript, text } from './shared.js';

const plain = (value) => text(value).replace(/\$/g, '').replace(/\s+/g, ' ').trim();

export const TWO_RADICALS_WHY = Object.freeze({
  square: 'Squaring both sides removes the radical on the left. The right side is a difference, so it squares to three terms: the first squared, minus twice the product, plus the second squared.',
  isolate: 'The x-terms cancel and one radical is left. Get it alone before squaring again, so the second squaring removes it.',
  again: 'Squaring the radical that is left removes it and gives the candidate.',
  check: 'Squaring can bring in a candidate that does not solve the first equation, so put it back into each side of the first equation.',
  checks: 'Both sides are equal, so the candidate is a solution. Had they differed, it would be extraneous.',
  extraneous: 'The two sides are not equal, so the candidate is extraneous: the equation has no real solution. Had they been equal, it would be the solution.',
});

const PARTS = Object.freeze([
  { kind: 'square', test: /^Square both sides: x [−-] \d+ = \(\d+ [−-] √x\)² =$/ },
  { kind: 'isolate', test: /^Isolate the radical: √x =$/ },
  { kind: 'again', test: /^Square again: x =$/ },
  { kind: 'left', test: /^Check: the left side √\(\d+ [−-] \d+\) =$/ },
  { kind: 'right', test: /^Check: the right side \d+ [−-] √\d+ =$/ },
  { kind: 'conclusion', test: /^Conclusion$/, choice: true },
]);

const twoRadicalsClaim = (question, fields) => {
  const match = /\\sqrt\{x - (\d+)\} = (\d+) - \\sqrt\{x\}/.exec(text(question?.prompt));
  if (!match) return null;
  const kinds = fields.map((field) => PARTS.find((part) => part.test.test(plain(field.label)) && Boolean(part.choice) === field.choice)?.kind || null);
  if (!kinds.length || kinds.some((kind) => !kind) || !kinds.includes('square')) return null;
  return { a: Number(match[1]), b: Number(match[2]), kinds };
};

// Every (b, s): a = s² − (b − s)² = b(2s − b) > 0 and small.
const OPTIONS = (() => {
  const found = [];
  for (let b = 3; b <= 8; b += 1) for (let s = Math.floor(b / 2) + 1; s <= 2 * b; s += 1) {
    if (s === b) continue;
    const a = b * (2 * s - b);
    if (a > 0 && a <= 45) found.push({ b, s, a, real: s < b });
  }
  return found;
})();

const twoRadicalsPart = (plan, { a, b, s, real }) => {
  if (a === plan.a && b === plan.b) return null;
  const x = s * s;
  const left = Math.abs(b - s);
  const right = b - s;
  const equation = `√(x ${MINUS} ${a}) = ${b} ${MINUS} √x`;
  const has = (kind) => plan.kinds.includes(kind);
  const steps = [
    { show: `Square both sides: x ${MINUS} ${a} = (${b} ${MINUS} √x)² = ${b * b} ${MINUS} ${2 * b}√x + x.`, why: TWO_RADICALS_WHY.square },
    { show: `Subtract x and ${b * b} from both sides: ${MINUS}${a + b * b} = ${MINUS}${2 * b}√x. Divide by ${MINUS}${2 * b}: √x = ${s}.`, why: TWO_RADICALS_WHY.isolate },
    { show: `Square again: x = ${s}${superscript(2)} = ${x}.`, why: TWO_RADICALS_WHY.again },
  ];
  if (has('left') || has('right') || has('conclusion')) {
    steps.push({ show: `Check x = ${x} in the first equation. Left side: √(${x} ${MINUS} ${a}) = √${left * left} = ${left}. Right side: ${b} ${MINUS} √${x} = ${b} ${MINUS} ${s} = ${signed(right)}.`, why: TWO_RADICALS_WHY.check });
    steps.push(real
      ? { show: `${left} = ${signed(right)}, so x = ${x} is the solution.`, why: TWO_RADICALS_WHY.checks }
      : { show: `${left} is not ${signed(right)}, so ${x} is extraneous and ${equation} has no real solution.`, why: TWO_RADICALS_WHY.extraneous });
  }
  const answer = real ? `x = ${x}` : `candidate x = ${x}; no real solution (${x} is extraneous)`;
  return { prompt: `Solve ${equation}. Square both sides, isolate the radical that is left, square again, then check.`, steps, answer, problems: [equation] };
};

export const twoRadicals = Object.freeze({
  id: 'twoRadicals',
  standards: ['A2.4G'],
  claim: twoRadicalsClaim,
  draw: (plan, seed, ok = null) => {
    // The case from the seed alone: a solution on even thirds, none on odd.
    const real = Math.floor(Number(seed) / 3) % 2 === 0;
    return firstFitting(OPTIONS.filter((option) => option.real === real), seed, (option) => twoRadicalsPart(plan, option), ok);
  },
});

export const RADICAL_EQUATION_GENERATORS = Object.freeze([twoRadicals]);
