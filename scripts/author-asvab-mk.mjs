#!/usr/bin/env node
// ASVAB Mathematics Knowledge bank.
//
// MK measures "knowledge of high-school mathematics principles and application
// of basic formulas". Its register is the opposite of Arithmetic Reasoning's:
// short, often symbolic, and it does NOT need a story. Forcing a context onto
// an item that is really about simplifying a radical makes it read like the
// SAT, which is the thing to avoid.
//
//   * prompts stay under the MK limits in functions/shared/asvabFidelity.mjs
//     (34 words, two sentences) — difficulty comes from the mathematics
//   * no prompt names the procedure it wants
//   * contexts appear only where the mathematics is genuinely applied
//   * every number is workable by hand, because the ASVAB permits no calculator
//   * each of the five families per standard is a different task STRUCTURE
//
// Symbolic answers are a real advantage here: a choice like `3x + 5` is not a
// number, so the answer-key rank analysis correctly skips it. Where an item DOES
// answer with a number, the same distractor recipe as the AR bank applies — one
// error that overshoots, one that undershoots, one real quantity from the
// problem that crosses.

import { writeFileSync } from 'node:fs';
import { MK, asvabItem, assertStandardVariety, contextParam, money, plain } from './lib/asvabAuthoring.mjs';

const ITEMS = [];
const mk = (code, slug, spec) => {
  ITEMS.push(asvabItem({ code, slug, domain: MK, courseId: spec.courseId || 'grade6', ...spec }));
};

// Applied-geometry contexts, used only where a formula is genuinely being used
// on something. Most MK items need no context at all.
const SHAPES = contextParam(['plate', 'panel', 'plate steel', 'sheet', 'board']);
const ROOMS = contextParam(['storeroom', 'workshop', 'bay', 'shed', 'office']);

// ================================================================ 6.2A
// Whole numbers, integers and rational numbers.

mk('6.2A', 'which-is-not-an-integer', {
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'Which of these is NOT an integer?',
  generator: {
    parameters: {
      d: { type: 'choice', values: [3, 4, 6, 7, 8] },
      n: { type: 'int', min: 2, max: 12 },
      k: { type: 'int', min: 2, max: 12 },
      w: { type: 'int', min: 2, max: 60 },
      m: { type: 'int', min: 2, max: 60 },
    },
    derived: { num: 'n*d+1', prod: 'k*d' },
    constraints: [],
  },
  choices: [
    { label: plain('\\frac{{{num}}}{{{d}}}'), correct: true },
    { label: plain('\\frac{{{prod}}}{{{d}}}'), error: 'operationInverted' },
    { label: plain('-{{w}}'), error: 'signError' },
    { label: plain('{{m}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['$\\frac{{{prod}}}{{{d}}}$ divides evenly, so it is an integer.', '$\\frac{{{num}}}{{{d}}}$ leaves a remainder, so it is not.'],
  answerSummary: { headline: 'A fraction is an integer only when it divides evenly.', text: '$\\frac{{{num}}}{{{d}}}$ is not an integer.' },
  hint: 'Check which fractions divide without a remainder.',
  feedback: 'A negative sign does not stop a value being an integer.',
});

mk('6.2A', 'rational-that-is-not-an-integer', {
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'A rational number need not be an integer. Which value shows that?',
  generator: {
    parameters: {
      n: { type: 'int', min: 1, max: 6 },
      d: { type: 'choice', values: [3, 4, 6, 7, 8] },
      k: { type: 'int', min: 1, max: 6 },
      k2: { type: 'int', min: 10, max: 30 },
    },
    derived: { num: 'n*d+1', prod: 'k2*d' },
    // k and k2 differ, so the integer-valued fraction and the plain integer
    // are never the same number.
    constraints: ['k!=k2'],
  },
  choices: [
    { label: plain('\\frac{{{num}}}{{{d}}}'), correct: true },
    { label: plain('-{{n}}'), error: 'usedGivenValue' },
    { label: plain('\\frac{{{prod}}}{{{d}}}'), error: 'operationInverted' },
    { label: plain('{{k}}'), error: 'partialTotal' },
  ],
  reasoning: ['Every integer is rational, so an integer cannot be the answer.', '$\\frac{{{num}}}{{{d}}}$ does not divide evenly, so it is rational but not an integer.'],
  answerSummary: { headline: 'A rational number is a ratio; only some of them are integers.', text: '$\\frac{{{num}}}{{{d}}}$ is rational but not an integer.' },
  hint: 'Check which fractions divide out to a whole result.',
  feedback: 'A fraction that divides evenly is still an integer.',
});

mk('6.2A', 'which-sets-contain-a-value', {
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'verbal',
  prompt: 'The number $-{{n}}$ belongs to which of these?',
  generator: {
    parameters: { n: { type: 'int', min: 2, max: 60 } },
    derived: {},
    constraints: [],
  },
  choices: [
    { label: 'The integers and the rational numbers, but not the whole numbers.', correct: true },
    { label: 'The whole numbers and the integers, but not the rational numbers.', error: 'operationInverted' },
    { label: 'The rational numbers only.', error: 'partialTotal' },
    { label: 'All three sets.', error: 'usedGivenValue' },
  ],
  reasoning: ['A negative number cannot be whole.', 'It is an integer, and every integer can be written as a ratio, so it is rational too.'],
  answerSummary: { headline: 'Each set contains the one before it, and the negatives stop at the whole numbers.', text: '$-{{n}}$ is an integer and rational, but not whole.' },
  hint: 'Start by asking whether it can be a whole number.',
  feedback: 'Every integer is also rational.',
});

mk('6.2A', 'is-every-integer-rational', {
  difficultyBand: 2, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'Which statement is true?',
  generator: {
    parameters: { n: { type: 'int', min: 2, max: 40 }, d: { type: 'choice', values: [3, 4, 6, 7] } },
    derived: { num: 'n*d+1' },
    constraints: [],
  },
  choices: [
    { label: 'Every integer is a rational number.', correct: true },
    { label: 'Every rational number is an integer.', error: 'ratioReversed' },
    { label: 'Every integer is a whole number.', error: 'operationInverted' },
    { label: 'No negative number is rational.', error: 'signError' },
  ],
  reasoning: ['An integer $n$ can be written as $\\frac{n}{1}$, which is a ratio.', 'But $\\frac{{{num}}}{{{d}}}$ is rational and is not an integer, so the reverse fails.'],
  answerSummary: { headline: 'Every integer is rational; the reverse is not true.', text: 'Every integer is a rational number.' },
  hint: 'Try to write an integer as a fraction.',
  feedback: 'One example that fails is enough to rule a statement out.',
});

mk('6.2A', 'integers-between-two-values', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'numberLine',
  prompt: 'How many integers lie strictly between $-{{a}}$ and ${{b}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 40 },
      b: { type: 'int', min: 2, max: 40 },
    },
    derived: {
      answer: 'a+b-1',
      d_offByOneStep: 'a+b',
      d_signError: 'abs(b-a)',
      d_operationInverted: 'a*2',
    },
    constraints: ['a!=b', 'd_signError>0'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['From $-{{a}}$ up to ${{b}}$ is a span of {{d_offByOneStep}} whole steps.', 'Leaving out both end values gives {{answer}}.'],
  answerSummary: { headline: 'Counting between two values excludes the ends.', text: 'There are {{answer}} integers between them.' },
  hint: 'Count the whole span first, then take off the two ends.',
  feedback: 'The two given values are not themselves between the two given values.',
});

// ================================================================ 6.2B
// A number, its opposite, and its absolute value.

mk('6.2B', 'difference-of-absolute-values', {
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'symbolic',
  prompt: 'What is $\\left|-{{a}}\\right| - \\left|-{{b}}\\right|$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 80 },
      b: { type: 'int', min: 3, max: 80 },
    },
    derived: {
      answer: 'a-b',
      d_signError: 'b-a',
      d_operationInverted: 'a+b',
      d_arithmeticSlip: '0-a-b',
    },
    constraints: ['a!=b'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['Each pair of bars gives a distance from zero: {{a}} and {{b}}.', 'Subtracting gives {{answer}}.'],
  answerSummary: { headline: 'Absolute value is applied to each term before the subtraction.', text: 'The value is {{answer}}.' },
  hint: 'Work out each absolute value, then subtract.',
  feedback: 'Both values become positive before they are combined.',
});

mk('6.2B', 'value-from-its-opposite', {
  difficultyBand: 2, dok: 2, taskType: 'reverseReasoning', representation: 'verbal',
  prompt: 'The opposite of a number is ${{opp}}$. What is that number plus ${{b}}$?',
  generator: {
    parameters: {
      n: { type: 'int', min: 3, max: 80 },
      b: { type: 'int', min: 3, max: 80 },
    },
    derived: {
      opp: 'n',
      answer: 'b-n',
      d_signError: 'n+b',
      d_operationInverted: 'n-b',
      d_arithmeticSlip: '0-n-b',
    },
    constraints: ['n!=b'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['If the opposite is ${{opp}}$, the number itself is $-{{n}}$.', 'Adding ${{b}}$ gives {{answer}}.'],
  answerSummary: { headline: 'The opposite is given, so the number is its negative.', text: 'The result is {{answer}}.' },
  hint: 'Find the number before doing anything with it.',
  feedback: 'The value given is the opposite, not the number.',
});

mk('6.2B', 'which-is-greater', {
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'Of the four values below, which has the greatest value?',
  generator: {
    parameters: {
      a: { type: 'int', min: 10, max: 90 },
      b: { type: 'int', min: 2, max: 9 },
    },
    derived: { negA: '0-a', negB: '0-b' },
    constraints: ['a>b'],
  },
  choices: [
    { label: plain('\\left|-{{a}}\\right|'), correct: true },
    { label: plain('-{{a}}'), error: 'signError' },
    { label: plain('-{{b}}'), error: 'usedGivenValue' },
    { label: plain('{{b}}'), error: 'partialTotal' },
  ],
  reasoning: ['$\\left|-{{a}}\\right|$ is {{a}}, which is positive and larger than {{b}}.', 'Both negatives sit below zero.'],
  answerSummary: { headline: 'The bars turn a large negative into a large positive.', text: '$\\left|-{{a}}\\right|$ is the greatest.' },
  hint: 'Work out what each expression is actually worth.',
  feedback: 'A larger digit does not mean a larger negative number.',
});

mk('6.2B', 'absolute-value-of-a-difference', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Evaluate $\\left|{{a}} - {{b}}\\right|$.',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 40 },
      b: { type: 'int', min: 20, max: 90 },
    },
    derived: {
      answer: 'abs(a-b)',
      d_signError: 'a-b',
      d_operationInverted: 'a+b',
      d_operationInverted2: 'round((a+b)/2)',
    },
    constraints: ['a!=b', 'a<b'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_operationInverted2}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['${{a}} - {{b}}$ is ${{d_signError}}$.', 'Its distance from zero is {{answer}}.'],
  answerSummary: { headline: 'Take the difference first, then its distance from zero.', text: 'The value is {{answer}}.' },
  hint: 'Work out what is inside the bars before applying them.',
  feedback: 'The bars apply to the whole difference, not to each number.',
});

mk('6.2B', 'sum-of-absolute-values', {
  difficultyBand: 3, dok: 2, taskType: 'representationTranslation', representation: 'table',
  prompt: 'The table gives $a$ and $b$. Find $\\left|a\\right| + \\left|b\\right|$.',
  stimulus: {
    kind: 'expressions',
    title: 'Values',
    note: '$a = {{a}}$ and $b = {{b}}$',
  },
  generator: {
    parameters: {
      p: { type: 'int', min: 3, max: 60 },
      q: { type: 'int', min: 3, max: 60 },
    },
    derived: {
      a: '0-p',
      b: 'q',
      answer: 'p+q',
      d_signError: 'q-p',
      d_operationInverted: 'p*2',
      d_arithmeticSlip: 'p+q+p',
    },
    constraints: ['p!=q'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['$\\left|{{a}}\\right|$ is {{p}} and $\\left|{{b}}\\right|$ is {{q}}.', 'Their sum is {{answer}}.'],
  answerSummary: { headline: 'Each absolute value is taken before the addition.', text: 'The sum is {{answer}}.' },
  hint: 'Apply the bars to each value first.',
  feedback: 'Both values become positive before they are added.',
});

// ---------------------------------------------------------------- emit
const seen = new Set();
for (const item of ITEMS) {
  if (seen.has(item.id)) throw new Error(`Duplicate ASVAB id: ${item.id}`);
  seen.add(item.id);
}
assertStandardVariety(ITEMS);
writeFileSync(new URL('../drafts/asvab-mk.json', import.meta.url), `${JSON.stringify({ documents: ITEMS }, null, 1)}\n`);
console.log(`Mathematics Knowledge: ${ITEMS.length} families across ${new Set(ITEMS.map((i) => i.assessedConstruct)).size} standards.`);
