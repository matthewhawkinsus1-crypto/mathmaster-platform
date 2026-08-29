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
      k: { type: 'int', min: 1, max: 9 },
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

// ================================================================ 6.2C
// Integers and rationals on a number line.

mk('6.2C', 'least-of-four-values', {
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'symbolic',
  rankAnalysisNotApplicable: true,
  prompt: 'Which of these four values is the least?',
  generator: {
    parameters: {
      a: { type: 'int', min: 20, max: 90 },
      b: { type: 'int', min: 2, max: 19 },
      c: { type: 'int', min: 2, max: 90 },
      d: { type: 'choice', values: [2, 4, 5, 8] },
    },
    derived: { num: 'c*d+1' },
    constraints: [],
  },
  choices: [
    { label: plain('-{{a}}'), correct: true },
    { label: plain('-{{b}}'), error: 'signError' },
    { label: plain('\\frac{{{num}}}{{{d}}}'), error: 'usedGivenValue' },
    { label: plain('0'), error: 'partialTotal' },
  ],
  reasoning: ['Both negatives sit below zero, and $-{{a}}$ is further from it.', 'The fraction is positive.'],
  answerSummary: { headline: 'Further left on the number line means smaller, however large the digits.', text: '$-{{a}}$ is the least.' },
  hint: 'Picture where each value sits relative to zero.',
  feedback: 'A bigger digit after a minus sign means a smaller number.',
});

mk('6.2C', 'distance-between-two-points', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'numberLine',
  prompt: 'How far apart are $-{{a}}$ and ${{b}}$ on a number line?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 60 },
      b: { type: 'int', min: 2, max: 60 },
    },
    derived: {
      answer: 'a+b',
      d_signError: 'abs(b-a)',
      d_operationInverted: 'a*2',
      d_arithmeticSlip: 'a+b+b',
    },
    constraints: ['a!=b'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['From $-{{a}}$ to zero is {{a}} units.', 'From zero to ${{b}}$ is another {{b}}, giving {{answer}}.'],
  answerSummary: { headline: 'Points on opposite sides of zero add their distances.', text: 'They are {{answer}} apart.' },
  hint: 'Count to zero first, then onwards.',
  feedback: 'Subtracting treats both points as being on the same side of zero.',
});

mk('6.2C', 'value-between-two-points', {
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'numberLine',
  prompt: 'Which value lies between $-{{a}}$ and $-{{b}}$?',
  generator: {
    parameters: {
      b: { type: 'int', min: 3, max: 40 },
      gap: { type: 'int', min: 4, max: 30 },
      out: { type: 'int', min: 2, max: 60 },
    },
    derived: {
      a: 'b+gap',
      answer: '0-b-round(gap/2)',
      d_signError: 'b+round(gap/2)',
      d_operationInverted: '0-b-gap-out',
      d_usedGivenValue: '0-out',
    },
    constraints: ['gap>3', '(out<b)||(out>a)'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The two ends are $-{{a}}$ and $-{{b}}$.', 'Only {{answer}} sits between them.'],
  answerSummary: { headline: 'Between two negatives means closer to zero than one and further than the other.', text: '{{answer}} lies between them.' },
  hint: 'Both ends are negative, so the value between them is too.',
  feedback: 'Check each option against both ends, not just one.',
});

mk('6.2C', 'order-three-values', {
  difficultyBand: 2, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'Which ordering is correct, from least to greatest?',
  generator: {
    parameters: {
      a: { type: 'int', min: 20, max: 80 },
      b: { type: 'int', min: 2, max: 19 },
      c: { type: 'int', min: 2, max: 40 },
    },
    derived: {},
    constraints: [],
  },
  choices: [
    { label: plain('-{{a}},\; -{{b}},\; {{c}}'), correct: true },
    { label: plain('-{{b}},\; -{{a}},\; {{c}}'), error: 'signError' },
    { label: plain('{{c}},\; -{{b}},\; -{{a}}'), error: 'ratioReversed' },
    { label: plain('-{{b}},\; {{c}},\; -{{a}}'), error: 'operationInverted' },
  ],
  reasoning: ['$-{{a}}$ is further below zero than $-{{b}}$.', 'Both are below the positive ${{c}}$.'],
  answerSummary: { headline: 'Least to greatest runs left to right on the number line.', text: 'The order is $-{{a}}$, $-{{b}}$, ${{c}}$.' },
  hint: 'Place all three relative to zero first.',
  feedback: 'Among negatives, the larger digit is the smaller number.',
});

mk('6.2C', 'value-at-a-marked-tick', {
  difficultyBand: 3, dok: 2, taskType: 'representationTranslation', representation: 'table',
  prompt: 'A line runs from $-{{a}}$ to ${{b}}$ in {{steps}} equal steps. What value sits one step above $-{{a}}$?',
  generator: {
    parameters: {
      stepSize: { type: 'int', min: 2, max: 20 },
      left: { type: 'int', min: 1, max: 20 },
      right: { type: 'int', min: 1, max: 20 },
    },
    derived: {
      a: 'left*stepSize',
      b: 'right*stepSize',
      steps: 'left+right',
      answer: '0-left*stepSize+stepSize',
      d_signError: '0-left*stepSize-stepSize',
      d_operationInverted: '0-right*stepSize',
      d_usedGivenValue: 'right*stepSize',
    },
    constraints: ['left>1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The span from $-{{a}}$ to ${{b}}$ is {{steps}} steps, so each step is {{stepSize}}.', 'One step up from $-{{a}}$ is {{answer}}.'],
  answerSummary: { headline: 'The step size is the whole span divided by the number of steps.', text: 'The value is {{answer}}.' },
  hint: 'Work out how much one step is worth first.',
  feedback: 'One step up from the left end is not the right end.',
});

// ================================================================ 6.2D
// Ordering rational numbers.

mk('6.2D', 'greatest-of-mixed-forms', {
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  rankAnalysisNotApplicable: true,
  prompt: 'Which of the four values below is the greatest?',
  generator: {
    parameters: {
      big: { type: 'int', min: 60, max: 95 },
      mid: { type: 'int', min: 20, max: 50 },
      low: { type: 'int', min: 2, max: 15 },
    },
    derived: { bigDec: 'big/100', midDec: 'mid/100', lowDec: 'low/100' },
    constraints: ['big>mid+10'],
  },
  choices: [
    { label: plain('{{bigDec}}'), correct: true },
    { label: plain('\\frac{{{mid}}}{100}'), error: 'wrongPercentBase' },
    { label: plain('{{lowDec}}'), error: 'convertedWrongWay' },
    { label: plain('\\frac{{{low}}}{100}'), error: 'unitConversion' },
  ],
  reasoning: ['Every option is a number of hundredths.', '{{bigDec}} is {{big}} hundredths, the largest of the four.'],
  answerSummary: { headline: 'Decimals and fractions compare once both are in hundredths.', text: '{{bigDec}} is the greatest.' },
  hint: 'Rewrite each option in the same form.',
  feedback: 'A larger numerator does not mean a larger value when the forms differ.',
});

mk('6.2D', 'least-of-four-negatives', {
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'symbolic',
  rankAnalysisNotApplicable: true,
  prompt: 'Which of these negative values is the least?',
  generator: {
    parameters: {
      a: { type: 'int', min: 60, max: 95 },
      b: { type: 'int', min: 20, max: 55 },
      c: { type: 'int', min: 2, max: 18 },
      d: { type: 'choice', values: [4, 5, 10] },
    },
    derived: { frac: 'a*d-1' },
    constraints: [],
  },
  choices: [
    { label: plain('-\\frac{{{frac}}}{{{d}}}'), correct: true },
    { label: plain('-{{a}}'), error: 'offByOneStep' },
    { label: plain('-{{b}}'), error: 'signError' },
    { label: plain('-{{c}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['$-\\frac{{{frac}}}{{{d}}}$ is a little below $-{{a}}$.', 'Both sit further from zero than $-{{b}}$ or $-{{c}}$.'],
  answerSummary: { headline: 'Among negatives, further from zero is smaller.', text: '$-\\frac{{{frac}}}{{{d}}}$ is the least.' },
  hint: 'Work out roughly what the fraction is worth.',
  feedback: 'The value furthest below zero is the least, not the one with the smallest digits.',
});

mk('6.2D', 'fraction-between-two-fractions', {
  difficultyBand: 3, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: 'Which fraction lies between $\\frac{1}{{{big}}}$ and $\\frac{1}{{{small}}}$?',
  generator: {
    parameters: {
      small: { type: 'int', min: 2, max: 6 },
      gap: { type: 'int', min: 4, max: 20 },
      pull: { type: 'choice', values: [1, 2] },
      spread: { type: 'int', min: 1, max: 10 },
      side: { type: 'choice', values: [0, 1] },
    },
    derived: {
      big: 'small+gap',
      far: 'side*(2*(small+gap)+spread)+(1-side)*(2*small-pull)',
      mid: 'small+round(gap/2)',
      answer: '1',
    },
    constraints: ['mid!=small', 'mid!=big', 'far!=mid', '2*mid!=far'],
  },
  choices: [
    { label: plain('\\frac{1}{{{mid}}}'), correct: true },
    { label: plain('\\frac{2}{{{far}}}'), error: 'operationInverted' },
    { label: plain('\\frac{1}{{{small}}}'), error: 'ratioReversed' },
    { label: plain('\\frac{1}{{{big}}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['With 1 on top, a larger bottom makes a smaller fraction.', '{{mid}} sits between {{small}} and {{big}}, so $\\frac{1}{{{mid}}}$ sits between the two given fractions.'],
  answerSummary: { headline: 'For unit fractions the order of the denominators reverses the order of the values.', text: '$\\frac{1}{{{mid}}}$ lies between them.' },
  hint: 'Ask what happens to a unit fraction as its denominator grows.',
  feedback: 'A larger denominator gives a smaller unit fraction.',
});

mk('6.2D', 'closest-to-zero', {
  difficultyBand: 3, dok: 2, taskType: 'procedural', representation: 'table',
  prompt: 'Of the values listed, which is closest to zero?',
  stimulus: {
    kind: 'expressions',
    title: 'Values',
    note: '$-{{p}}$, $-{{q}}$, ${{r}}$, ${{u}}$',
  },
  generator: {
    parameters: {
      q: { type: 'int', min: 2, max: 12 },
      pGap: { type: 'int', min: 5, max: 60 },
      rGap: { type: 'int', min: 3, max: 60 },
      uGap: { type: 'int', min: 8, max: 60 },
      rSign: { type: 'choice', values: [-1, 1] },
      uSign: { type: 'choice', values: [-1, 1] },
    },
    derived: {
      p: 'q+pGap',
      r: 'rSign*(q+rGap)',
      u: 'uSign*(q+uGap)',
      answer: '0-q',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('-{{p}}'), error: 'signError' },
    { label: plain('{{r}}'), error: 'usedGivenValue' },
    { label: plain('{{u}}'), error: 'partialTotal' },
  ],
  reasoning: ['Distance from zero ignores the sign.', '$-{{q}}$ is {{q}} from zero, nearer than any of the others.'],
  answerSummary: { headline: 'Closest to zero is about distance, not about sign.', text: '$-{{q}}$ is closest to zero.' },
  hint: 'Compare how far each value is from zero.',
  feedback: 'A negative value can be closer to zero than a positive one.',
});

mk('6.2D', 'order-mixed-signs', {
  difficultyBand: 3, dok: 3, taskType: 'representationTranslation', representation: 'verbal',
  prompt: 'Which ordering runs from least to greatest?',
  generator: {
    parameters: {
      a: { type: 'int', min: 30, max: 90 },
      b: { type: 'int', min: 2, max: 25 },
      d: { type: 'choice', values: [2, 4, 5] },
      c: { type: 'int', min: 2, max: 30 },
    },
    derived: { num: 'c*d+1' },
    constraints: [],
  },
  choices: [
    { label: plain('-{{a}},\; -{{b}},\; \\frac{{{num}}}{{{d}}}'), correct: true },
    { label: plain('-{{b}},\; -{{a}},\; \\frac{{{num}}}{{{d}}}'), error: 'signError' },
    { label: plain('\\frac{{{num}}}{{{d}}},\; -{{a}},\; -{{b}}'), error: 'ratioReversed' },
    { label: plain('-{{a}},\; \\frac{{{num}}}{{{d}}},\; -{{b}}'), error: 'operationInverted' },
  ],
  reasoning: ['Both negatives are below the positive fraction.', '$-{{a}}$ is further below zero than $-{{b}}$.'],
  answerSummary: { headline: 'Signs decide the grouping; distance from zero decides the order within it.', text: 'The order is $-{{a}}$, $-{{b}}$, $\\frac{{{num}}}{{{d}}}$.' },
  hint: 'Sort by sign first, then within each sign.',
  feedback: 'Every negative is less than every positive.',
});

// ================================================================ 6.2E
// A fraction is a division.

mk('6.2E', 'fraction-written-as-a-quotient', {
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'Which division has the same value as $\\frac{{{a}}}{{{b}}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 90 },
      b: { type: 'int', min: 2, max: 40 },
    },
    derived: {},
    constraints: ['a!=b'],
  },
  choices: [
    { label: plain('{{a}} \\div {{b}}'), correct: true },
    { label: plain('{{b}} \\div {{a}}'), error: 'ratioReversed' },
    { label: plain('{{a}} \\times {{b}}'), error: 'operationInverted' },
    { label: plain('{{a}} - {{b}}'), error: 'signError' },
  ],
  reasoning: ['The bar in a fraction means divide.', 'The top is shared out by the bottom, so it is ${{a}} \\div {{b}}$.'],
  answerSummary: { headline: 'A fraction bar is a division sign.', text: '$\\frac{{{a}}}{{{b}}} = {{a}} \\div {{b}}$.' },
  hint: 'Which number is being shared out?',
  feedback: 'The top of the fraction is the number being divided.',
});

mk('6.2E', 'quotient-written-as-a-fraction', {
  difficultyBand: 1, dok: 1, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'Write ${{a}} \\div {{b}}$ as a fraction.',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 40 },
      b: { type: 'int', min: 2, max: 40 },
    },
    derived: { sum: 'a+b' },
    constraints: ['a!=b'],
  },
  choices: [
    { label: plain('\\frac{{{a}}}{{{b}}}'), correct: true },
    { label: plain('\\frac{{{b}}}{{{a}}}'), error: 'ratioReversed' },
    { label: plain('\\frac{{{sum}}}{{{b}}}'), error: 'operationInverted' },
    { label: plain('\\frac{{{b}}}{{{sum}}}'), error: 'partialTotal' },
  ],
  reasoning: ['The number being divided goes on top.', 'So ${{a}} \\div {{b}}$ is $\\frac{{{a}}}{{{b}}}$.'],
  answerSummary: { headline: 'The dividend sits above the bar.', text: 'It is $\\frac{{{a}}}{{{b}}}$.' },
  hint: 'Which number is being shared out?',
  feedback: 'Swapping the two changes the value.',
});

mk('6.2E', 'fraction-as-a-decimal', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'What is $\\frac{{{a}}}{{{b}}}$ as a decimal?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 10 },
      b: { type: 'choice', values: [2, 4, 5, 8, 10] },
    },
    derived: {
      answer: 'a/b',
      d_ratioReversed: 'b/a',
      d_unitConversion: 'a/b*10',
      d_convertedWrongWay: 'a/b/10',
    },
    constraints: ['a!=b'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_unitConversion}}'), error: 'unitConversion' },
    { label: plain('{{d_convertedWrongWay}}'), error: 'convertedWrongWay' },
  ],
  reasoning: ['The bar means divide, so work out ${{a}}$ shared by ${{b}}$.', 'That gives {{answer}}.'],
  answerSummary: { headline: 'A fraction becomes a decimal by carrying out the division.', text: 'It is {{answer}}.' },
  hint: 'Divide the top by the bottom.',
  feedback: 'Check which number is doing the dividing.',
});

mk('6.2E', 'improper-fraction-as-a-mixed-number', {
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'verbal',
  prompt: 'Written as a mixed number, what is $\\frac{{{num}}}{{{b}}}$?',
  generator: {
    parameters: {
      whole: { type: 'int', min: 2, max: 12 },
      rem: { type: 'int', min: 1, max: 9 },
      b: { type: 'choice', values: [3, 4, 5, 6, 7, 8] },
    },
    derived: { num: 'whole*b+rem', wholePlus: 'whole+1' },
    constraints: ['rem<b', 'whole!=rem'],
  },
  choices: [
    { label: plain('{{whole}}\\frac{{{rem}}}{{{b}}}'), correct: true },
    { label: plain('{{rem}}\\frac{{{whole}}}{{{b}}}'), error: 'ratioReversed' },
    { label: plain('{{wholePlus}}\\frac{{{rem}}}{{{b}}}'), error: 'offByOneStep' },
    { label: plain('{{whole}}\\frac{{{b}}}{{{rem}}}'), error: 'operationInverted' },
  ],
  reasoning: ['${{b}}$ goes into ${{num}}$ {{whole}} times with {{rem}} left over.', 'The leftover stays over {{b}}.'],
  answerSummary: { headline: 'The quotient becomes the whole part and the remainder stays over the divisor.', text: 'It is ${{whole}}\\frac{{{rem}}}{{{b}}}$.' },
  hint: 'How many whole times does the bottom go into the top?',
  feedback: 'The remainder keeps the original denominator.',
});

mk('6.2E', 'value-of-a-grouped-division', {
  difficultyBand: 3, dok: 2, taskType: 'procedural', representation: 'table',
  prompt: 'Using the values shown, what is $\\frac{a + b}{c}$?',
  stimulus: {
    kind: 'expressions',
    title: 'Values',
    note: '$a = {{a}}$, $b = {{b}}$, $c = {{c}}$',
  },
  generator: {
    parameters: {
      c: { type: 'int', min: 2, max: 12 },
      q: { type: 'int', min: 2, max: 14 },
      b: { type: 'int', min: 2, max: 60 },
    },
    derived: {
      a: 'c*q-b',
      answer: 'q',
      d_forgotFinalStep: 'c*q',
      d_usedGivenValue: 'c',
      d_orderOfOperations: 'round(a/c)',
    },
    constraints: ['a>0', 'c!=q'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_orderOfOperations}}'), error: 'orderOfOperations' },
  ],
  reasoning: ['The bar groups the top, so add first: ${{a}} + {{b}} = {{d_forgotFinalStep}}$.', 'Dividing by ${{c}}$ gives {{answer}}.'],
  answerSummary: { headline: 'A fraction bar groups everything above it.', text: 'The value is {{answer}}.' },
  hint: 'The bar acts like brackets around the top.',
  feedback: 'Dividing only the first term ignores the grouping.',
});

// ================================================================ 6.3A
// Dividing by a rational number is multiplying by its reciprocal.

mk('6.3A', 'equivalent-to-dividing-by-a-fraction', {
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'Which expression equals ${{a}} \\div \\frac{{{b}}}{{{c}}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 40 },
      b: { type: 'int', min: 2, max: 12 },
      c: { type: 'int', min: 2, max: 12 },
    },
    derived: {},
    constraints: ['b!=c'],
  },
  choices: [
    { label: plain('{{a}} \\times \\frac{{{c}}}{{{b}}}'), correct: true },
    { label: plain('{{a}} \\times \\frac{{{b}}}{{{c}}}'), error: 'operationInverted' },
    { label: plain('\\frac{{{b}}}{{{c}}} \\div {{a}}'), error: 'ratioReversed' },
    { label: plain('{{a}} \\div \\frac{{{c}}}{{{b}}}'), error: 'partialTotal' },
  ],
  reasoning: ['Dividing by a fraction is multiplying by its reciprocal.', 'The reciprocal of $\\frac{{{b}}}{{{c}}}$ is $\\frac{{{c}}}{{{b}}}$.'],
  answerSummary: { headline: 'Flip the divisor and multiply.', text: 'It equals ${{a}} \\times \\frac{{{c}}}{{{b}}}$.' },
  hint: 'What is the reciprocal of the fraction you are dividing by?',
  feedback: 'The fraction must be flipped as well as the operation changed.',
});

mk('6.3A', 'reciprocal-of-a-value', {
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'symbolic',
  prompt: 'What is the reciprocal of $\\frac{{{b}}}{{{c}}}$?',
  generator: {
    parameters: {
      b: { type: 'int', min: 2, max: 20 },
      c: { type: 'int', min: 2, max: 20 },
    },
    derived: { negB: '0-b' },
    constraints: ['b!=c'],
  },
  choices: [
    { label: plain('\\frac{{{c}}}{{{b}}}'), correct: true },
    { label: plain('\\frac{{{negB}}}{{{c}}}'), error: 'signError' },
    { label: plain('\\frac{{{b}}}{{{c}}}'), error: 'partialTotal' },
    { label: plain('\\frac{1}{{{b}}}'), error: 'operationInverted' },
  ],
  reasoning: ['A reciprocal swaps the top and the bottom.', 'So $\\frac{{{b}}}{{{c}}}$ becomes $\\frac{{{c}}}{{{b}}}$.'],
  answerSummary: { headline: 'The reciprocal turns the fraction upside down.', text: 'It is $\\frac{{{c}}}{{{b}}}$.' },
  hint: 'What must it multiply by to give 1?',
  feedback: 'A reciprocal is not the negative.',
});

mk('6.3A', 'dividing-by-a-unit-fraction', {
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'verbal',
  prompt: 'What is ${{a}} \\div \\frac{1}{{{b}}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 20 },
      b: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      answer: 'a*b',
      d_operationInverted: 'round(a/b)',
      d_partialTotal: 'b*b',
      d_arithmeticSlip: 'a*b+b',
    },
    constraints: ['a!=b'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['Dividing by $\\frac{1}{{{b}}}$ is multiplying by ${{b}}$.', 'So the result is {{answer}}.'],
  answerSummary: { headline: 'Dividing by a fraction below one makes the result larger.', text: 'It is {{answer}}.' },
  hint: 'How many {{b}}ths fit into each whole?',
  feedback: 'Dividing by a number below one increases the value.',
});

mk('6.3A', 'which-division-gives-more', {
  difficultyBand: 2, dok: 3, taskType: 'errorAnalysis', representation: 'symbolic',
  rankAnalysisNotApplicable: true,
  prompt: 'Which of these has the greatest value?',
  generator: {
    parameters: {
      a: { type: 'int', min: 4, max: 40 },
      b: { type: 'int', min: 3, max: 15 },
    },
    derived: { bPlus: 'b+1' },
    constraints: [],
  },
  choices: [
    { label: plain('{{a}} \\div \\frac{1}{{{bPlus}}}'), correct: true },
    { label: plain('{{a}} \\div \\frac{1}{{{b}}}'), error: 'offByOneStep' },
    { label: plain('{{a}} \\div {{b}}'), error: 'operationInverted' },
    { label: plain('{{a}} \\times \\frac{1}{{{bPlus}}}'), error: 'ratioReversed' },
  ],
  reasoning: ['Dividing by a unit fraction multiplies, so the first two grow the value.', 'Dividing by the larger count of parts gives the larger result.'],
  answerSummary: { headline: 'Dividing by a smaller fraction gives a larger result.', text: '${{a}} \\div \\frac{1}{{{bPlus}}}$ is the greatest.' },
  hint: 'Decide first which expressions make the value larger.',
  feedback: 'Dividing by a whole number makes the value smaller.',
});

mk('6.3A', 'multiply-by-a-reciprocal', {
  difficultyBand: 3, dok: 2, taskType: 'representationTranslation', representation: 'table',
  prompt: 'Using the values shown, what is $a \\div \\frac{b}{c}$?',
  stimulus: {
    kind: 'expressions',
    title: 'Values',
    note: '$a = {{a}}$, $b = {{b}}$, $c = {{c}}$',
  },
  generator: {
    parameters: {
      b: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 2, max: 9 },
      k: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      a: 'b*k',
      answer: 'c*k',
      d_operationInverted: 'round(b*k*b/c)',
      d_usedGivenValue: 'k',
      d_arithmeticSlip: 'b*k*c',
    },
    constraints: ['b!=c', 'c!=k'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['Flip the divisor: $a \\times \\frac{{{c}}}{{{b}}}$.', '${{a}}$ divided by ${{b}}$ is {{k}}, and {{k}} times ${{c}}$ is {{answer}}.'],
  answerSummary: { headline: 'Flip and multiply, then cancel before multiplying out.', text: 'The value is {{answer}}.' },
  hint: 'Cancel with the top before multiplying.',
  feedback: 'Multiplying by the divisor as given goes the wrong way.',
});


// ================================================================ 6.3C
// Integer operations shown with concrete models, connected to the algorithm.
//
// The model IS the point of this standard, so four of the five families put a
// pile of counters or a move along a number line in front of the student and
// ask for the arithmetic it stands for. The pile is built as `n` negatives plus
// `n + g` positives so the surviving value is `g`, positive by construction —
// that lets one distractor sit reliably below the key without a constraint that
// would skew the draws.

mk('6.3C', 'counters-after-zero-pairs', {
  difficultyBand: 1, dok: 2, taskType: 'representationTranslation', representation: 'verbal',
  prompt: 'A pile holds ${{p}}$ positive counters and ${{n}}$ negative counters. What is the value of the pile?',
  generator: {
    parameters: {
      // `n` and `g` share a range so the given count crosses the key
      // from either side; a wider `g` made the key the larger of the two
      // in 61% of draws.
      n: { type: 'int', min: 2, max: 18 },
      g: { type: 'int', min: 1, max: 20 },
    },
    derived: {
      p: 'n+g',
      answer: 'g',
      d_operationInverted: 'p+n',
      d_signError: 'n-p',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{n}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Each positive counter cancels one negative counter.', '${{n}}$ pairs cancel, and the ${{answer}}$ positives that are left give the value.'],
  answerSummary: { headline: 'A positive and a negative counter cancel to nothing.', text: 'The pile is worth ${{answer}}$.' },
  hint: 'Pair each negative counter with a positive one.',
  feedback: 'Counting every counter ignores the cancelling.',
});

mk('6.3C', 'move-along-the-number-line', {
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'numberLine',
  prompt: 'Start at ${{a}}$ on a number line and move ${{b}}$ units left. Where do you land?',
  generator: {
    parameters: {
      // Equal ranges. With `b` drawn wider than `a` the move landed left of
      // the start in 68% of draws, so the key sat below `b - a` that often.
      a: { type: 'int', min: 2, max: 25 },
      b: { type: 'int', min: 2, max: 25 },
    },
    derived: {
      answer: 'a-b',
      d_operationInverted: 'a+b',
      d_usedGivenValue: '0-b',
      d_signError: 'b-a',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['Moving left subtracts, so the landing point is ${{a}} - {{b}}$.', 'That is ${{answer}}$.'],
  answerSummary: { headline: 'Left is subtraction, whichever side of zero you start on.', text: 'You land on ${{answer}}$.' },
  hint: 'Which direction makes the value smaller?',
  feedback: 'Moving left from a positive start can carry you past zero.',
});

mk('6.3C', 'removing-negative-counters', {
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'A pile worth ${{a}}$ has ${{n}}$ negative counters taken away. Which expression gives the new value?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 40 },
      n: { type: 'int', min: 2, max: 20 },
    },
    derived: {},
    constraints: [],
  },
  choices: [
    { label: plain('{{a}} + {{n}}'), correct: true },
    { label: plain('{{a}} - {{n}}'), error: 'signError' },
    { label: plain('-{{a}} + {{n}}'), error: 'operationInverted' },
    { label: plain('-{{a}} - {{n}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['Taking away a negative counter leaves the pile worth more.', 'So the value becomes ${{a}} + {{n}}$.'],
  answerSummary: { headline: 'Removing negatives raises the value.', text: 'The new value is ${{a}} + {{n}}$.' },
  hint: 'Does the pile end up worth more or less?',
  feedback: 'Subtracting the count treats the counters as positive.',
});

mk('6.3C', 'what-removal-really-does', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student takes ${{n}}$ negative counters out of a pile and says the total drops. What really happens?',
  generator: {
    parameters: { n: { type: 'int', min: 2, max: 20 } },
    derived: { twice: '2*n' },
    constraints: [],
  },
  choices: [
    { label: 'The total rises by ${{n}}$.', correct: true },
    { label: 'The total drops by ${{n}}$.', error: 'signError' },
    { label: 'The total does not change.', error: 'operationInverted' },
    { label: 'The total rises by ${{twice}}$.', error: 'arithmeticSlip' },
  ],
  reasoning: ['Each negative counter was holding the total down by one.', 'Removing ${{n}}$ of them lets the total rise by ${{n}}$.'],
  answerSummary: { headline: 'Taking away a negative is the same as adding a positive.', text: 'The total rises by ${{n}}$.' },
  hint: 'What were those counters doing to the total?',
  feedback: 'Removing counters and adding counters are different moves.',
});

mk('6.3C', 'two-rounds-of-counters', {
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'table',
  prompt: 'The table records two rounds of counters. What is the value after both rounds?',
  stimulus: {
    kind: 'table',
    title: 'Counter log',
    table: {
      headers: ['round', 'positive', 'negative'],
      rows: [['first', '{{p1}}', '{{n1}}'], ['second', '{{p2}}', '{{n2}}']],
    },
  },
  generator: {
    parameters: {
      p1: { type: 'int', min: 2, max: 24 },
      n1: { type: 'int', min: 2, max: 24 },
      p2: { type: 'int', min: 2, max: 24 },
      n2: { type: 'int', min: 2, max: 24 },
    },
    derived: {
      answer: 'p1-n1+p2-n2',
      d_operationInverted: 'p1+n1+p2+n2',
      d_signError: '0-p1-n1-p2-n2',
      d_partialTotal: 'p1-n1',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['The first round is worth ${{d_partialTotal}}$.', 'Adding the second round gives ${{answer}}$.'],
  answerSummary: { headline: 'Each round contributes its own positive-minus-negative value.', text: 'The value after both rounds is ${{answer}}$.' },
  hint: 'Work out each round on its own first.',
  feedback: 'The second round still has negatives in it.',
});

// ================================================================ 6.3D
// Adding, subtracting, multiplying and dividing integers fluently.

mk('6.3D', 'sum-with-a-negative', {
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'symbolic',
  prompt: 'What is $-{{a}} + {{b}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 40 },
      b: { type: 'int', min: 2, max: 40 },
    },
    derived: {
      answer: 'b-a',
      d_signError: 'a+b',
      d_arithmeticSlip: 'a-b',
      d_operationInverted: '0-a-b',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['The two numbers pull in opposite directions, so subtract.', '${{b}} - {{a}} = {{answer}}$.'],
  answerSummary: { headline: 'Opposite signs subtract; the larger size decides the sign.', text: 'The sum is ${{answer}}$.' },
  hint: 'Which of the two is further from zero?',
  feedback: 'The minus sign belongs to the first number only.',
});

mk('6.3D', 'product-then-sum', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: '$(-{{a}}) \\times {{b}} + {{c}}$ has what value?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 5, max: 60 },
    },
    derived: {
      answer: 'c-a*b',
      d_signError: 'a*b+c',
      d_forgotFinalStep: '0-a*b',
      d_arithmeticSlip: 'a*b-c',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['A negative times a positive is negative, so the product is $-{{d_forgotFinalStep}}$ written as ${{d_forgotFinalStep}}$.', 'Adding ${{c}}$ gives ${{answer}}$.'],
  answerSummary: { headline: 'Multiply before adding, and keep the sign with the product.', text: 'The value is ${{answer}}$.' },
  hint: 'Settle the sign of the product first.',
  feedback: 'The minus sign stays on the product, not on the number added to it.',
});

mk('6.3D', 'steady-rate-of-fall', {
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A temperature falls ${{prod}}$ degrees over ${{a}}$ hours at a steady rate. What is the change each hour?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      q: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      prod: 'a*q',
      answer: '0-q',
      d_signError: 'q',
      d_forgotFinalStep: '0-prod',
      d_usedGivenValue: '0-a',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['A fall of ${{prod}}$ degrees is a change of $-{{prod}}$.', 'Shared over ${{a}}$ hours that is ${{answer}}$ degrees an hour.'],
  answerSummary: { headline: 'A steady fall shares out as a negative rate.', text: 'The change is ${{answer}}$ degrees an hour.' },
  hint: 'A fall is a negative change.',
  feedback: 'The whole fall is not the hourly change.',
});

mk('6.3D', 'which-integer-statement-is-wrong', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'Which of these is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 2, max: 12 },
    },
    derived: { prod: 'a*b', sum: 'a+b' },
    constraints: [],
  },
  choices: [
    { label: plain('(-{{a}})(-{{b}}) = -{{prod}}'), correct: true },
    { label: plain('(-{{a}})({{b}}) = -{{prod}}'), error: 'operationInverted' },
    { label: plain('-{{a}} - {{b}} = -{{sum}}'), error: 'signError' },
    { label: plain('-{{sum}} + {{b}} = -{{a}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['Two negative factors give a positive product.', 'So $(-{{a}})(-{{b}})$ is ${{prod}}$, not $-{{prod}}$.'],
  answerSummary: { headline: 'A product of two negatives is positive.', text: '$(-{{a}})(-{{b}}) = -{{prod}}$ is the false one.' },
  hint: 'Check the sign of each product first.',
  feedback: 'One negative factor does give a negative product.',
});

mk('6.3D', 'running-total-of-changes', {
  difficultyBand: 3, dok: 2, taskType: 'interpretation', representation: 'table',
  prompt: 'A temperature starts at ${{s}}$ degrees and changes as the table shows. What is the final temperature?',
  stimulus: {
    kind: 'table',
    title: 'Recorded changes',
    table: {
      headers: ['step', 'change'],
      rows: [['1', '-{{c1}}'], ['2', '+{{c2}}'], ['3', '-{{c3}}']],
    },
  },
  generator: {
    parameters: {
      s: { type: 'int', min: 10, max: 80 },
      c1: { type: 'int', min: 2, max: 20 },
      c2: { type: 'int', min: 2, max: 20 },
      c3: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      answer: 's-c1+c2-c3',
      d_signError: 's+c1+c2+c3',
      d_operationInverted: 's-c1-c2-c3',
      d_partialTotal: 's-c1',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['After the first step the reading is ${{d_partialTotal}}$.', 'Adding ${{c2}}$ and then taking ${{c3}}$ leaves ${{answer}}$.'],
  answerSummary: { headline: 'Signs in the table tell you which way each step moves.', text: 'The final temperature is ${{answer}}$ degrees.' },
  hint: 'Apply the steps one at a time in order.',
  feedback: 'The middle step is a rise, not a fall.',
});

// ================================================================ 6.3E
// Multiplying and dividing positive rational numbers fluently.
//
// Decimal quantities are drawn as whole numbers of tenths and divided ONCE at
// the end, so every displayed value is exact. Drawing `2.4` and `3.5` and
// multiplying them in floating point gives 8.399999999999999, which would ship
// as the label a student reads.

mk('6.3E', 'fraction-times-a-whole', {
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Simplify $\\frac{{{a}}}{{{b}}} \\times {{c}}$.',
  generator: {
    parameters: {
      // `a` and `b` share a range: the crossing distractor is the given
      // {{c}}, which beats the key exactly when b > a.
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 9 },
      k: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      c: 'b*k',
      answer: 'a*k',
      d_forgotFinalStep: 'a*c',
      d_operationInverted: 'a+k',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{c}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['${{c}}$ divided by ${{b}}$ is ${{k}}$.', 'Then ${{a}} \\times {{k}} = {{answer}}$.'],
  answerSummary: { headline: 'Cancel with the denominator before multiplying out.', text: 'It simplifies to ${{answer}}$.' },
  hint: 'Does the denominator divide the whole number?',
  feedback: 'The denominator still has to divide something.',
});

mk('6.3E', 'product-of-two-decimals', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'What is the product of ${{a}}$ and ${{b}}$?',
  generator: {
    parameters: {
      // Tenths, both between 1.1 and 3.2. The crossing distractor adds the
      // factors instead of multiplying them, and a sum beats a product only
      // while both factors are small: drawn up to 9.9 the product won 94% of
      // the time, which handed the key away.
      p: { type: 'int', min: 11, max: 32 },
      q: { type: 'int', min: 11, max: 32 },
    },
    derived: {
      a: 'p/10',
      b: 'q/10',
      pq: 'p*q',
      answer: 'p*q/100',
      d_roundedWrong: 'p*q/10',
      d_operationInverted: '(p+q)/10',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_roundedWrong}}'), error: 'roundedWrong' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{a}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['${{p}} \\times {{q}} = {{pq}}$ ignoring the points.', 'There are two decimal places between the two factors, so the product is ${{answer}}$.'],
  answerSummary: { headline: 'The product carries as many decimal places as the two factors together.', text: 'The product is ${{answer}}$.' },
  hint: 'Count the decimal places in both factors.',
  feedback: 'One decimal place too few makes the answer ten times too big.',
});

mk('6.3E', 'cutting-a-decimal-length', {
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A board ${{a}}$ metres long is cut into ${{c}}$ equal pieces. How long is each piece?',
  generator: {
    parameters: {
      m: { type: 'int', min: 11, max: 99 },
      // The count of pieces is the crossing distractor and has to straddle
      // m/10, which runs 1.1 to 9.9.
      c: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      a: 'm*c/10',
      answer: 'm/10',
      d_forgotFinalStep: 'a',
      d_roundedWrong: 'm/100',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_roundedWrong}}'), error: 'roundedWrong' },
    { label: plain('{{c}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['${{a}}$ shared between ${{c}}$ pieces is ${{a}} \\div {{c}}$.', 'That is ${{answer}}$ metres each.'],
  answerSummary: { headline: 'Equal pieces means dividing the whole length by the count.', text: 'Each piece is ${{answer}}$ metres.' },
  hint: 'The pieces are all the same length.',
  feedback: 'The full board is not the length of one piece.',
});

mk('6.3E', 'batches-of-a-fractional-amount', {
  difficultyBand: 3, dok: 2, taskType: 'representationTranslation', representation: 'table',
  prompt: 'How many cans does the whole run use?',
  // Three inputs chained, deliberately: with only the per-batch amount and a
  // batch count this family computed the same relation as
  // `fraction-times-a-whole` and the two fingerprinted as one task.
  stimulus: {
    kind: 'table',
    title: 'Mix record',
    table: {
      headers: ['cans per batch', 'batches per day', 'days'],
      rows: [['\\frac{{{n}}}{{{d}}}', '{{k}}', '{{j}}']],
    },
  },
  generator: {
    parameters: {
      n: { type: 'int', min: 2, max: 9 },
      d: { type: 'int', min: 2, max: 9 },
      t: { type: 'int', min: 2, max: 9 },
      j: { type: 'int', min: 2, max: 6 },
    },
    derived: {
      k: 'd*t',
      perDay: 'n*t',
      answer: 'n*t*j',
      d_forgotFinalStep: 'n*k*j',
      d_usedGivenValue: 'k*j',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{perDay}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['${{k}}$ batches at $\\frac{{{n}}}{{{d}}}$ of a can is ${{perDay}}$ cans a day.', 'Over ${{j}}$ days that is ${{answer}}$ cans.'],
  answerSummary: { headline: 'Cancel the denominator against the batch count, then scale by the days.', text: 'The run uses ${{answer}}$ cans.' },
  hint: 'Work out one day before working out the run.',
  feedback: 'A single day is not the whole run.',
});

mk('6.3E', 'multiplying-by-a-fraction-below-one', {
  difficultyBand: 1, dok: 2, taskType: 'conceptual', representation: 'verbal',
  prompt: 'A positive number is multiplied by $\\frac{{{n}}}{{{d}}}$. What happens to it?',
  generator: {
    parameters: {
      n: { type: 'choice', values: [1, 2, 3, 4] },
      d: { type: 'choice', values: [5, 7, 11, 13] },
    },
    derived: {},
    constraints: [],
  },
  choices: [
    { label: 'It gets smaller, because $\\frac{{{n}}}{{{d}}}$ is less than one.', correct: true },
    { label: 'It gets larger, because multiplying always makes more.', error: 'operationInverted' },
    { label: 'It stays the same, because the fraction is part of the number.', error: 'usedGivenValue' },
    { label: 'It gets smaller only when the number is a whole number.', error: 'partialTotal' },
  ],
  reasoning: ['$\\frac{{{n}}}{{{d}}}$ is less than one because ${{n}}$ is less than ${{d}}$.', 'Taking a part of a positive number leaves less than you started with.'],
  answerSummary: { headline: 'Multiplying by a factor below one shrinks a positive number.', text: 'The number gets smaller.' },
  hint: 'Compare the top of the fraction with the bottom.',
  feedback: 'Multiplying only makes more when the factor is above one.',
});

// ================================================================ 6.4A
// Additive versus multiplicative rules: y = ax against y = x + a.

mk('6.4A', 'which-rule-is-multiplicative', {
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'Which rule shows a multiplicative relationship?',
  generator: {
    parameters: { a: { type: 'int', min: 2, max: 9 } },
    derived: {},
    constraints: [],
  },
  choices: [
    { label: plain('y = {{a}}x'), correct: true },
    { label: plain('y = x + {{a}}'), error: 'operationInverted' },
    { label: plain('y = x - {{a}}'), error: 'signError' },
    { label: plain('y = {{a}} - x'), error: 'ratioReversed' },
  ],
  reasoning: ['A multiplicative rule scales $x$ by a fixed factor.', 'Only $y = {{a}}x$ does that; the others shift $x$ instead.'],
  answerSummary: { headline: 'Scaling is multiplicative; shifting is additive.', text: '$y = {{a}}x$ is the multiplicative rule.' },
  hint: 'Which rule stretches $x$ rather than moving it?',
  feedback: 'Adding a fixed amount is an additive rule.',
});

mk('6.4A', 'rule-that-fits-the-table', {
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'table',
  prompt: 'Which rule produces every pair in the table?',
  stimulus: {
    kind: 'table',
    title: 'Rule output',
    table: {
      headers: ['x', 'y'],
      rows: [['{{x1}}', '{{y1}}'], ['{{x2}}', '{{y2}}'], ['{{x3}}', '{{y3}}']],
    },
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      x1: { type: 'int', min: 1, max: 4 },
    },
    derived: {
      x2: 'x1+2', x3: 'x1+5',
      y1: 'a*x1', y2: 'a*x2', y3: 'a*x3',
      gap1: '(a-1)*x1',
      aPlus: 'a+1',
    },
    constraints: ['gap1!=a'],
  },
  choices: [
    { label: plain('y = {{a}}x'), correct: true },
    { label: plain('y = x + {{gap1}}'), error: 'partialTotal' },
    { label: plain('y = x + {{a}}'), error: 'operationInverted' },
    { label: plain('y = {{aPlus}}x'), error: 'offByOneStep' },
  ],
  reasoning: ['Every $y$ is ${{a}}$ times its $x$.', 'A rule that adds a fixed amount fits at most one row.'],
  answerSummary: { headline: 'Check a candidate rule against every row, not just the first.', text: 'The rule is $y = {{a}}x$.' },
  hint: 'Test each rule on the last row too.',
  feedback: 'Fitting the first row is not enough.',
});

mk('6.4A', 'how-far-apart-the-rules-are', {
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'symbolic',
  prompt: 'Rule A is $y = {{a}}x$ and Rule B is $y = x + {{a}}$. At $x = {{x}}$, how much larger is A than B?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 5 },
      x: { type: 'int', min: 3, max: 8 },
    },
    derived: {
      outA: 'a*x',
      outB: 'x+a',
      answer: 'a*x-x-a',
      d_operationInverted: 'a*x+x+a',
      d_signError: 'x+a-a*x',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{outB}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Rule A gives ${{outA}}$ and Rule B gives ${{outB}}$.', 'The gap is ${{outA}} - {{outB}} = {{answer}}$.'],
  answerSummary: { headline: 'Evaluate both rules, then compare.', text: 'Rule A is ${{answer}}$ larger.' },
  hint: 'Work out each rule at $x = {{x}}$ first.',
  feedback: 'The question asks for the gap, not either output.',
});

mk('6.4A', 'rule-behind-two-pairs', {
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'orderedPairs',
  prompt: 'The pairs $({{x1}}, {{y1}})$ and $({{x2}}, {{y2}})$ follow the same rule. Which rule is it?',
  generator: {
    parameters: {
      x1: { type: 'int', min: 2, max: 9 },
      m: { type: 'int', min: 1, max: 6 },
      step: { type: 'int', min: 1, max: 8 },
    },
    derived: {
      a: 'x1*m',
      y1: 'x1+a',
      x2: 'x1+step',
      y2: 'x2+a',
      q: 'm+1',
    },
    constraints: ['q!=a'],
  },
  choices: [
    { label: plain('y = x + {{a}}'), correct: true },
    { label: plain('y = {{q}}x'), error: 'partialTotal' },
    { label: plain('y = x - {{a}}'), error: 'signError' },
    { label: plain('y = {{a}}x'), error: 'operationInverted' },
  ],
  reasoning: ['Both pairs sit ${{a}}$ above their $x$.', '$y = {{q}}x$ matches the first pair only.'],
  answerSummary: { headline: 'A rule has to fit both pairs, not one.', text: 'The rule is $y = x + {{a}}$.' },
  hint: 'Compare each $y$ with its own $x$.',
  feedback: 'One matching pair does not settle the rule.',
});

mk('6.4A', 'what-doubling-x-does', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'Which statement about $y = {{a}}x$ and $y = x + {{a}}$ is true?',
  generator: {
    parameters: { a: { type: 'int', min: 2, max: 9 } },
    derived: {},
    constraints: [],
  },
  choices: [
    { label: 'Doubling $x$ doubles $y$ for $y = {{a}}x$ only.', correct: true },
    { label: 'Doubling $x$ doubles $y$ for both rules.', error: 'operationInverted' },
    { label: 'Doubling $x$ doubles $y$ for $y = x + {{a}}$ only.', error: 'ratioReversed' },
    { label: 'Doubling $x$ doubles $y$ for neither rule.', error: 'signError' },
  ],
  reasoning: ['In $y = {{a}}x$ every output is ${{a}}$ times its input, so doubling the input doubles the output.', 'In $y = x + {{a}}$ the extra ${{a}}$ is not doubled, so the output does not double.'],
  answerSummary: { headline: 'Only a multiplicative rule scales the output with the input.', text: 'It holds for $y = {{a}}x$ only.' },
  hint: 'Try a value of $x$ and then twice that value.',
  feedback: 'The constant term does not grow when $x$ does.',
});

// ================================================================ 6.7A
// Equivalent numerical expressions: order of operations, whole-number
// exponents and prime factorization.

mk('6.7A', 'evaluate-with-a-square', {
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Find the value of ${{a}} + {{b}} \\times {{c}}^2$.',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 60 },
      b: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 3, max: 7 },
    },
    derived: {
      answer: 'a+b*c*c',
      d_orderOfOperations: '(a+b)*c*c',
      d_exponentError: 'a+2*b*c',
      d_operationInverted: 'a*b+c*c',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_orderOfOperations}}'), error: 'orderOfOperations' },
    { label: plain('{{d_exponentError}}'), error: 'exponentError' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['The square comes first: ${{c}}^2$.', 'Multiply by ${{b}}$, then add ${{a}}$, giving ${{answer}}$.'],
  answerSummary: { headline: 'Powers, then multiplication, then addition.', text: 'The value is ${{answer}}$.' },
  hint: 'Which operation is settled first?',
  feedback: 'Adding before multiplying changes the value.',
});

mk('6.7A', 'prime-factorization-of-a-number', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Which is the prime factorization of ${{n}}$?',
  generator: {
    parameters: {
      e1: { type: 'int', min: 1, max: 4 },
      e2: { type: 'int', min: 1, max: 2 },
      p: { type: 'choice', values: [5, 7, 11] },
    },
    derived: {
      n: 'pow(2,e1)*pow(3,e2)*p',
      e1p: 'e1+1',
    },
    constraints: ['e1!=e2'],
  },
  choices: [
    { label: plain('2^{{{e1}}} \\times 3^{{{e2}}} \\times {{p}}'), correct: true },
    { label: plain('2^{{{e2}}} \\times 3^{{{e1}}} \\times {{p}}'), error: 'ratioReversed' },
    { label: plain('2 \\times {{e1}} \\times 3 \\times {{e2}} \\times {{p}}'), error: 'exponentError' },
    { label: plain('2^{{{e1p}}} \\times 3^{{{e2}}} \\times {{p}}'), error: 'offByOneStep' },
  ],
  reasoning: ['Divide ${{n}}$ by $2$ while it stays even: that happens ${{e1}}$ times.', 'What is left divides by $3$ ${{e2}}$ times, leaving the prime ${{p}}$.'],
  answerSummary: { headline: 'Strip one prime at a time and count how often each divides.', text: '${{n}} = 2^{{{e1}}} \\times 3^{{{e2}}} \\times {{p}}$.' },
  hint: 'Take out all the factors of two first.',
  feedback: 'An exponent counts repeated factors; it is not a factor itself.',
});

mk('6.7A', 'expression-with-the-same-value', {
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'table',
  prompt: 'Which expression has the same value as the one shown?',
  stimulus: {
    kind: 'expressions',
    title: 'Expression',
    note: '${{a}} \\times ({{b}} + {{c}})$',
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 12 },
      c: { type: 'int', min: 2, max: 12 },
    },
    derived: {},
    constraints: [],
  },
  choices: [
    { label: plain('{{a}} \\times {{b}} + {{a}} \\times {{c}}'), correct: true },
    { label: plain('{{a}} \\times {{b}} + {{c}}'), error: 'partialTotal' },
    { label: plain('{{a}} + {{b}} \\times {{c}}'), error: 'orderOfOperations' },
    { label: plain('({{a}} \\times {{b}}) \\times ({{a}} \\times {{c}})'), error: 'operationInverted' },
  ],
  reasoning: ['The bracket is multiplied by ${{a}}$, so both terms inside it are.', 'That gives ${{a}} \\times {{b}} + {{a}} \\times {{c}}$.'],
  answerSummary: { headline: 'A factor outside a bracket reaches every term inside it.', text: 'It equals ${{a}} \\times {{b}} + {{a}} \\times {{c}}$.' },
  hint: 'How many terms are inside the bracket?',
  feedback: 'Only one term inside the bracket has been multiplied.',
});

mk('6.7A', 'left-to-right-with-a-subtraction', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says ${{a}} - {{b}} + {{c}}$ equals ${{d_orderOfOperations}}$. What is the correct value?',
  generator: {
    parameters: {
      // `a` is built as b + g so the correct value g + c is always positive.
      // The crossing distractor b + c beats it exactly when b > g, and the
      // two ranges are chosen to make that a coin flip.
      b: { type: 'int', min: 5, max: 30 },
      g: { type: 'int', min: 2, max: 34 },
      c: { type: 'int', min: 2, max: 30 },
    },
    derived: {
      a: 'b+g',
      ab: 'g',
      answer: 'a-b+c',
      d_orderOfOperations: 'a-b-c',
      d_signError: 'a+b+c',
      d_usedGivenValue: 'b+c',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_orderOfOperations}}'), error: 'orderOfOperations' },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Addition and subtraction are settled left to right, not addition first.', '${{a}} - {{b}} = {{ab}}$, and adding ${{c}}$ gives ${{answer}}$.'],
  answerSummary: { headline: 'Addition and subtraction rank equally and run left to right.', text: 'The value is ${{answer}}$.' },
  hint: 'Which operation comes first reading left to right?',
  feedback: 'Grouping the last two terms subtracts them both.',
});

mk('6.7A', 'which-power-is-greatest', {
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'symbolic',
  rankAnalysisNotApplicable: true,
  prompt: 'Which expression has the greatest value?',
  generator: {
    parameters: { n: { type: 'int', min: 5, max: 10 } },
    derived: {},
    constraints: [],
  },
  choices: [
    { label: plain('2^{{{n}}}'), correct: true },
    { label: plain('{{n}}^2'), error: 'exponentError' },
    { label: plain('2 \\times {{n}}'), error: 'arithmeticSlip' },
    { label: plain('{{n}} + {{n}}^2'), error: 'orderOfOperations' },
  ],
  reasoning: ['Doubling ${{n}}$ times grows faster than squaring once when ${{n}}$ is at least five.', 'So $2^{{{n}}}$ is the largest of the four.'],
  answerSummary: { headline: 'Repeated doubling outgrows squaring.', text: '$2^{{{n}}}$ is the greatest.' },
  hint: 'Work out each one for the value of $n$ given.',
  feedback: 'A base of two with a large exponent beats a square.',
});


// ================================================================ 6.6A
// Telling the independent quantity from the dependent one.
//
// The mathematics here is thin on purpose — the standard is about reading a
// relationship, not computing one — so the five families are kept apart by the
// FORM the relationship arrives in: a table, a rule in letters, a sentence, an
// ordered pair, and a claim to be corrected. Each still derives real values, so
// no two share a relation graph.
//
// The quantity pair is fixed inside each family. Two `choice` parameters are
// drawn independently and can never be relied on to agree, and a mismatched
// pair here would read as "the litres depend on the kilograms".

mk('6.6A', 'dependent-in-a-pay-table', {
  difficultyBand: 1, dok: 2, taskType: 'interpretation', representation: 'table',
  prompt: 'The table pairs hours worked with pay earned. Which quantity depends on the other?',
  stimulus: {
    kind: 'table',
    title: 'Payroll',
    table: {
      headers: ['hours', 'pay'],
      rows: [['{{h1}}', '\\${{p1}}'], ['{{h2}}', '\\${{p2}}'], ['{{h3}}', '\\${{p3}}']],
    },
  },
  generator: {
    parameters: {
      r: { type: 'int', min: 9, max: 25 },
      h1: { type: 'int', min: 2, max: 4 },
    },
    derived: {
      h2: 'h1+3', h3: 'h1+6',
      p1: 'r*h1', p2: 'r*h2', p3: 'r*h3',
    },
    constraints: [],
  },
  choices: [
    { label: 'The pay depends on the hours worked.', correct: true },
    { label: 'The hours worked depend on the pay.', error: 'ratioReversed' },
    { label: 'Neither quantity depends on the other.', error: 'operationInverted' },
    { label: 'Each quantity depends on the other equally.', error: 'partialTotal' },
  ],
  reasoning: ['Choosing the hours settles the pay: every extra hour adds $\\${{r}}$.', 'Nothing about the pay decides how long the shift is.'],
  answerSummary: { headline: 'The quantity you choose is independent; the one that follows is dependent.', text: 'The pay depends on the hours.' },
  hint: 'Which one can you decide first?',
  feedback: 'Only one of the two is settled by the other.',
});

mk('6.6A', 'independent-letter-in-a-rule', {
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'A cost $c$ follows $c = {{r}}n$ for $n$ parts. Which letter stands for the independent quantity?',
  generator: {
    parameters: { r: { type: 'int', min: 3, max: 30 } },
    derived: { twice: '2*r' },
    constraints: [],
  },
  choices: [
    { label: plain('n'), correct: true },
    { label: plain('c'), error: 'ratioReversed' },
    { label: plain('{{r}}'), error: 'usedGivenValue' },
    { label: 'Both $n$ and $c$.', error: 'partialTotal' },
  ],
  reasoning: ['The number of parts is chosen, and the cost follows from it.', 'Two parts cost $\\${{twice}}$ because $n$ was set to two, not the other way round.'],
  answerSummary: { headline: 'The letter you substitute into is the independent one.', text: '$n$ is independent.' },
  hint: 'Which letter do you put a value into?',
  feedback: 'A fixed rate is not a quantity that varies.',
});

mk('6.6A', 'dependent-from-a-description', {
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'verbal',
  prompt: 'A tank loses ${{r}}$ litres each minute. Which statement is correct?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 15 },
      m: { type: 'int', min: 3, max: 12 },
    },
    derived: { lost: 'r*m' },
    constraints: [],
  },
  choices: [
    { label: 'The litres lost depend on the minutes elapsed.', correct: true },
    { label: 'The minutes elapsed depend on the litres lost.', error: 'ratioReversed' },
    { label: 'Neither quantity depends on the other.', error: 'operationInverted' },
    { label: 'The rate of ${{r}}$ litres a minute depends on the time.', error: 'usedGivenValue' },
  ],
  reasoning: ['Wait ${{m}}$ minutes and ${{lost}}$ litres have gone.', 'The time passing is what drives the loss, so the litres are the dependent quantity.'],
  answerSummary: { headline: 'Time runs on its own; what it causes depends on it.', text: 'The litres lost depend on the minutes.' },
  hint: 'Which quantity would you measure first?',
  feedback: 'A steady rate stays the same as time passes.',
});

mk('6.6A', 'ordered-pair-order', {
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'orderedPairs',
  prompt: 'A crew earns $\\${{r}}$ an hour. Which ordered pair records a shift of ${{h}}$ hours?',
  generator: {
    parameters: {
      r: { type: 'int', min: 9, max: 25 },
      h: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      pay: 'r*h',
      slip: 'r*h+r',
    },
    constraints: [],
  },
  choices: [
    { label: plain('({{h}}, {{pay}})'), correct: true },
    { label: plain('({{pay}}, {{h}})'), error: 'ratioReversed' },
    { label: plain('({{h}}, {{r}})'), error: 'usedGivenValue' },
    { label: plain('({{h}}, {{slip}})'), error: 'offByOneStep' },
  ],
  reasoning: ['The independent quantity is written first, so the hours lead.', '${{h}}$ hours at $\\${{r}}$ an hour is $\\${{pay}}$.'],
  answerSummary: { headline: 'An ordered pair lists the independent quantity first.', text: 'It is $({{h}}, {{pay}})$.' },
  hint: 'Which quantity goes in the first position?',
  feedback: 'The hourly rate is not the shift total.',
});

mk('6.6A', 'reversed-dependence', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says the hours worked depend on the pay earned. What is wrong with that?',
  generator: {
    parameters: {
      r: { type: 'int', min: 9, max: 25 },
      h: { type: 'int', min: 2, max: 9 },
    },
    derived: { pay: 'r*h' },
    constraints: [],
  },
  choices: [
    { label: 'The hours are chosen and the pay follows, so the pay is the dependent quantity.', correct: true },
    { label: 'Nothing is wrong, because either quantity may be called dependent.', error: 'operationInverted' },
    { label: 'Both quantities are independent, because both can be measured.', error: 'partialTotal' },
    { label: 'Pay cannot depend on anything, because it is fixed at $\\${{r}}$.', error: 'usedGivenValue' },
  ],
  reasoning: ['Working ${{h}}$ hours produces $\\${{pay}}$; deciding to earn $\\${{pay}}$ does not produce the hours.', 'The direction of the relationship runs one way only.'],
  answerSummary: { headline: 'Dependence has a direction, and it is not a matter of choice.', text: 'The pay is the dependent quantity.' },
  hint: 'Which one causes the other?',
  feedback: 'Being measurable does not make a quantity independent.',
});

// ================================================================ 6.6B
// Writing the equation a table describes.

mk('6.6B', 'equation-for-a-scaling-table', {
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'table',
  prompt: 'Which equation matches every row of the table?',
  stimulus: {
    kind: 'table',
    title: 'Recorded values',
    table: { headers: ['x', 'y'], rows: [['{{x1}}', '{{y1}}'], ['{{x2}}', '{{y2}}'], ['{{x3}}', '{{y3}}']] },
  },
  generator: {
    parameters: {
      k: { type: 'int', min: 3, max: 12 },
      x1: { type: 'int', min: 2, max: 5 },
    },
    derived: {
      x2: 'x1+2', x3: 'x1+4',
      y1: 'k*x1', y2: 'k*x2', y3: 'k*x3',
      gap: '(k-1)*x1',
      kPlus: 'k+1',
    },
    constraints: ['gap!=k'],
  },
  choices: [
    { label: plain('y = {{k}}x'), correct: true },
    { label: plain('y = x + {{gap}}'), error: 'partialTotal' },
    { label: plain('y = x + {{k}}'), error: 'operationInverted' },
    { label: plain('y = {{kPlus}}x'), error: 'offByOneStep' },
  ],
  reasoning: ['Every $y$ is ${{k}}$ times its own $x$.', 'A rule that adds a fixed amount fits the first row only.'],
  answerSummary: { headline: 'Test a candidate on every row before choosing it.', text: 'The equation is $y = {{k}}x$.' },
  hint: 'Divide each $y$ by its $x$.',
  feedback: 'One row agreeing is not enough.',
});

mk('6.6B', 'equation-for-a-shifting-table', {
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'table',
  prompt: 'Which equation fits the table?',
  stimulus: {
    kind: 'table',
    title: 'Recorded values',
    table: { headers: ['x', 'y'], rows: [['{{x1}}', '{{y1}}'], ['{{x2}}', '{{y2}}'], ['{{x3}}', '{{y3}}']] },
  },
  generator: {
    parameters: {
      b: { type: 'int', min: 4, max: 30 },
      x1: { type: 'int', min: 2, max: 6 },
    },
    derived: {
      x2: 'x1+3', x3: 'x1+7',
      y1: 'x1+b', y2: 'x2+b', y3: 'x3+b',
      ratio: 'round((x1+b)/x1)',
      bPlus: 'b+1',
    },
    constraints: ['ratio!=b', 'ratio!=bPlus'],
  },
  choices: [
    { label: plain('y = x + {{b}}'), correct: true },
    { label: plain('y = {{ratio}}x'), error: 'partialTotal' },
    { label: plain('y = x - {{b}}'), error: 'signError' },
    { label: plain('y = x + {{bPlus}}'), error: 'offByOneStep' },
  ],
  reasoning: ['Every $y$ sits ${{b}}$ above its own $x$.', 'The gap stays the same as $x$ grows, so nothing is being multiplied.'],
  answerSummary: { headline: 'A constant gap means addition, not scaling.', text: 'The equation is $y = x + {{b}}$.' },
  hint: 'Subtract each $x$ from its $y$.',
  feedback: 'A multiplying rule would open the gap as $x$ grows.',
});

mk('6.6B', 'missing-value-from-pairs', {
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'orderedPairs',
  prompt: 'The pairs $({{x1}}, {{y1}})$, $({{x2}}, {{y2}})$ and $({{x3}}, {{y3}})$ obey one rule. What is $y$ when $x = {{xq}}$?',
  generator: {
    parameters: {
      k: { type: 'int', min: 3, max: 12 },
      // From 3, so the smallest queried x is 2 — at x = 1 the rule returns k
      // itself and the item stops asking anything.
      x1: { type: 'int', min: 3, max: 5 },
      delta: { type: 'choice', values: [-5, -3, 3, 5] },
    },
    derived: {
      x2: 'x1+2', x3: 'x1+4',
      xq: 'x1+4+delta',
      y1: 'k*x1', y2: 'k*x2', y3: 'k*x3',
      answer: 'k*xq',
      d_offByOneStep: 'k*xq+k',
      d_operationInverted: 'k+xq',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{y3}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Each $y$ is ${{k}}$ times its $x$, so the rule is $y = {{k}}x$.', 'At $x = {{xq}}$ that gives ${{answer}}$.'],
  answerSummary: { headline: 'Find the rule from the pairs, then use it.', text: '$y = {{answer}}$.' },
  hint: 'What does each pair have in common?',
  feedback: 'A value already listed is not the one being asked for.',
});

mk('6.6B', 'equation-in-two-letters', {
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'In a table, every cost $c$ is ${{k}}$ times its count $n$. Which equation says that?',
  generator: {
    parameters: { k: { type: 'int', min: 2, max: 20 } },
    derived: {},
    constraints: [],
  },
  choices: [
    { label: plain('c = {{k}}n'), correct: true },
    { label: plain('n = {{k}}c'), error: 'ratioReversed' },
    { label: plain('c = n + {{k}}'), error: 'operationInverted' },
    { label: plain('c = \\frac{n}{{{k}}}'), error: 'signError' },
  ],
  reasoning: ['"${{k}}$ times its count" scales $n$, so $n$ is multiplied.', 'The cost is what comes out, so $c$ stands alone.'],
  answerSummary: { headline: 'The dependent quantity stands alone on one side.', text: 'It is $c = {{k}}n$.' },
  hint: 'Which quantity is being multiplied?',
  feedback: 'Swapping the letters describes the opposite relationship.',
});

mk('6.6B', 'row-that-breaks-the-rule', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'table',
  prompt: 'Three rows obey $y = {{k}}x$ and one does not. Which row is wrong?',
  stimulus: {
    kind: 'table',
    title: 'Recorded values',
    table: { headers: ['x', 'y'], rows: [['{{x1}}', '{{y1}}'], ['{{x2}}', '{{y2}}'], ['{{x3}}', '{{bad}}'], ['{{x4}}', '{{y4}}']] },
  },
  generator: {
    parameters: {
      k: { type: 'int', min: 3, max: 12 },
      x1: { type: 'int', min: 2, max: 5 },
    },
    derived: {
      x2: 'x1+2', x3: 'x1+4', x4: 'x1+6',
      y1: 'k*x1', y2: 'k*x2', y4: 'k*x4',
      bad: 'k*x3+k-1',
    },
    constraints: [],
  },
  choices: [
    { label: plain('({{x3}}, {{bad}})'), correct: true },
    { label: plain('({{x1}}, {{y1}})'), error: 'partialTotal' },
    { label: plain('({{x2}}, {{y2}})'), error: 'operationInverted' },
    { label: plain('({{x4}}, {{y4}})'), error: 'usedGivenValue' },
  ],
  reasoning: ['${{k}} \\times {{x3}}$ is not ${{bad}}$.', 'Every other row divides out to ${{k}}$ exactly.'],
  answerSummary: { headline: 'Check each row against the rule, not against its neighbour.', text: 'The row $({{x3}}, {{bad}})$ breaks it.' },
  hint: 'Divide each $y$ by its $x$ and watch for the odd one.',
  feedback: 'That row does divide out to ${{k}}$.',
});

// ================================================================ 6.6C
// One situation shown as words, a table, ordered pairs and an equation.

mk('6.6C', 'equation-for-a-situation', {
  difficultyBand: 1, dok: 2, taskType: 'representationTranslation', representation: 'verbal',
  prompt: 'A flat fee of $\\${{b}}$ is added to every order. Which equation gives the total $y$ on an order of $x$ dollars?',
  generator: {
    parameters: {
      b: { type: 'int', min: 3, max: 40 },
      order: { type: 'int', min: 10, max: 120, step: 5 },
    },
    derived: { total: 'order+b' },
    constraints: [],
  },
  choices: [
    { label: plain('y = x + {{b}}'), correct: true },
    { label: plain('y = {{b}}x'), error: 'operationInverted' },
    { label: plain('y = x - {{b}}'), error: 'signError' },
    { label: plain('y = \\frac{x}{{{b}}}'), error: 'ratioReversed' },
  ],
  reasoning: ['An order of $\\${{order}}$ comes to $\\${{total}}$, because the fee is added once.', 'A fixed amount added is written $+ {{b}}$, not $\\times {{b}}$.'],
  answerSummary: { headline: 'A flat fee adds; a rate multiplies.', text: 'The equation is $y = x + {{b}}$.' },
  hint: 'Does the fee grow with the order?',
  feedback: 'Multiplying would make the fee larger on larger orders.',
});

mk('6.6C', 'pairs-that-fit-the-equation', {
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'orderedPairs',
  prompt: 'Which pair of records could have come from $y = {{k}}x$?',
  generator: {
    parameters: {
      k: { type: 'int', min: 3, max: 12 },
      x1: { type: 'int', min: 2, max: 5 },
    },
    derived: {
      x2: 'x1+3',
      y1: 'k*x1', y2: 'k*x2',
      a1: 'x1+k', a2: 'x2+k',
      off: 'k*x2+k',
    },
    constraints: [],
  },
  choices: [
    { label: plain('({{x1}}, {{y1}}) \\text{ and } ({{x2}}, {{y2}})'), correct: true },
    { label: plain('({{x1}}, {{a1}}) \\text{ and } ({{x2}}, {{a2}})'), error: 'operationInverted' },
    { label: plain('({{y1}}, {{x1}}) \\text{ and } ({{y2}}, {{x2}})'), error: 'ratioReversed' },
    { label: plain('({{x1}}, {{y1}}) \\text{ and } ({{x2}}, {{off}})'), error: 'offByOneStep' },
  ],
  reasoning: ['Both records have to satisfy the equation, not just the first.', '${{k}} \\times {{x1}} = {{y1}}$ and ${{k}} \\times {{x2}} = {{y2}}$.'],
  answerSummary: { headline: 'A rule has to hold for every record it claims to cover.', text: 'The pair $({{x1}}, {{y1}})$ and $({{x2}}, {{y2}})$ fits.' },
  hint: 'Check the second record as carefully as the first.',
  feedback: 'Adding ${{k}}$ is not the same as multiplying by it.',
});

mk('6.6C', 'situation-for-an-equation', {
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'verbal',
  prompt: 'Which situation is described by $y = {{k}}x$?',
  generator: {
    parameters: {
      k: { type: 'int', min: 3, max: 25 },
      n: { type: 'int', min: 3, max: 12 },
    },
    derived: { mass: 'k*n', doubled: '2*k*n' },
    constraints: [],
  },
  choices: [
    { label: 'Each crate weighs ${{k}}$ kilograms; $y$ is the mass of $x$ crates.', correct: true },
    { label: 'A crate weighs ${{k}}$ kilograms more than a box; $y$ is the crate mass.', error: 'operationInverted' },
    { label: 'A load of ${{k}}$ kilograms is split into $x$ equal crates.', error: 'ratioReversed' },
    { label: 'A crate holds ${{k}}$ kilograms at most; $y$ is what fits.', error: 'partialTotal' },
  ],
  reasoning: ['$y = {{k}}x$ scales with $x$, so ${{n}}$ crates weigh ${{mass}}$ kilograms.', 'Twice as many crates weigh ${{doubled}}$, which is twice as much.'],
  answerSummary: { headline: 'A multiplying rule means each unit contributes the same amount.', text: 'It is ${{k}}$ kilograms per crate.' },
  hint: 'What happens to $y$ when $x$ doubles?',
  feedback: 'Dividing a fixed load is the opposite relationship.',
});

mk('6.6C', 'value-from-a-start-and-a-rate', {
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A tank already holds ${{b}}$ litres and a pump adds ${{k}}$ litres a minute. How much is in it after ${{m}}$ minutes?',
  generator: {
    parameters: {
      b: { type: 'int', min: 10, max: 50 },
      k: { type: 'int', min: 5, max: 40 },
      m: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      answer: 'b+k*m',
      d_orderOfOperations: '(b+k)*m',
      d_operationInverted: 'b+k+m',
      d_usedGivenValue: 'b*m',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_orderOfOperations}}'), error: 'orderOfOperations' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['${{m}}$ minutes add ${{k}} \\times {{m}}$ litres.', 'On top of the ${{b}}$ already there that is ${{answer}}$.'],
  answerSummary: { headline: 'The starting amount is added once, not multiplied.', text: 'The tank holds ${{answer}}$ litres.' },
  hint: 'Only the inflow depends on the time.',
  feedback: 'The starting amount was already there before the clock started.',
});

mk('6.6C', 'times-against-more-than', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'symbolic',
  prompt: 'A student writes $y = {{k}} + x$ for "$y$ is ${{k}}$ times $x$". What should it be?',
  generator: {
    parameters: {
      k: { type: 'int', min: 3, max: 20 },
      v: { type: 'int', min: 4, max: 30 },
    },
    derived: { scaled: 'k*v', shifted: 'k+v' },
    constraints: [],
  },
  choices: [
    { label: plain('y = {{k}}x'), correct: true },
    { label: plain('y = \\frac{x}{{{k}}}'), error: 'ratioReversed' },
    { label: plain('y = {{k}} - x'), error: 'signError' },
    { label: plain('y = x^{{{k}}}'), error: 'exponentError' },
  ],
  reasoning: ['At $x = {{v}}$, ${{k}}$ times $x$ is ${{scaled}}$, while what the student wrote gives ${{shifted}}$.', '"More than" would have been the addition; "times" is not.'],
  answerSummary: { headline: 'Times multiplies; more than adds.', text: 'It should be $y = {{k}}x$.' },
  hint: 'What does the word "times" do to $x$?',
  feedback: 'Repeated multiplication is not what "times" asks for here.',
});

// ================================================================ 6.9A
// Writing a one-step equation or inequality for a stated condition.

mk('6.9A', 'inequality-for-a-ceiling', {
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'A shelf holds at most ${{c}}$ kilograms. Which inequality does an allowed mass $x$ satisfy?',
  generator: {
    parameters: {
      c: { type: 'int', min: 15, max: 200, step: 5 },
      over: { type: 'int', min: 1, max: 20 },
    },
    derived: { heavier: 'c+over' },
    constraints: [],
  },
  choices: [
    { label: plain('x \\le {{c}}'), correct: true },
    { label: plain('x \\ge {{c}}'), error: 'ratioReversed' },
    { label: plain('x < {{c}}'), error: 'offByOneStep' },
    { label: plain('x = {{c}}'), error: 'partialTotal' },
  ],
  reasoning: ['"At most" allows ${{c}}$ itself, so the line under the sign stays.', '${{heavier}}$ kilograms is over the limit, so the mass cannot exceed ${{c}}$.'],
  answerSummary: { headline: 'At most means less than or equal to.', text: 'It is $x \\le {{c}}$.' },
  hint: 'Is a mass of exactly ${{c}}$ allowed?',
  feedback: 'A strict inequality would rule out ${{c}}$ itself.',
});

mk('6.9A', 'equation-for-an-increase', {
  difficultyBand: 1, dok: 1, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'A number increased by ${{a}}$ gives ${{t}}$. Which equation says that?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 40 },
      x: { type: 'int', min: 4, max: 60 },
    },
    derived: { t: 'a+x' },
    constraints: [],
  },
  choices: [
    { label: plain('x + {{a}} = {{t}}'), correct: true },
    { label: plain('x - {{a}} = {{t}}'), error: 'signError' },
    { label: plain('{{a}}x = {{t}}'), error: 'operationInverted' },
    { label: plain('x + {{t}} = {{a}}'), error: 'ratioReversed' },
  ],
  reasoning: ['"Increased by ${{a}}$" adds ${{a}}$ to the unknown.', 'The result of that addition is ${{t}}$.'],
  answerSummary: { headline: 'Write the operation the sentence performs, in the order it performs it.', text: 'It is $x + {{a}} = {{t}}$.' },
  hint: 'What is done to the number first?',
  feedback: 'The total belongs on its own side.',
});

mk('6.9A', 'equation-for-equal-shares', {
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'Each crate weighs ${{w}}$ kilograms and the load weighs ${{t}}$ kilograms. Which equation gives the crate count $x$?',
  generator: {
    parameters: {
      w: { type: 'int', min: 3, max: 25 },
      n: { type: 'int', min: 4, max: 30 },
    },
    derived: { t: 'w*n' },
    constraints: [],
  },
  choices: [
    { label: plain('{{w}}x = {{t}}'), correct: true },
    { label: plain('x + {{w}} = {{t}}'), error: 'operationInverted' },
    { label: plain('\\frac{x}{{{w}}} = {{t}}'), error: 'ratioReversed' },
    { label: plain('{{t}}x = {{w}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Each crate contributes ${{w}}$ kilograms, so $x$ crates contribute ${{w}}x$.', 'That has to come to the load of ${{t}}$.'],
  answerSummary: { headline: 'Equal shares multiply the share by the count.', text: 'The equation is ${{w}}x = {{t}}$.' },
  hint: 'What does one crate contribute?',
  feedback: 'The load is not being cut into ${{w}}$ pieces.',
});

mk('6.9A', 'wrong-operation-for-a-sentence', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'For "a number increased by ${{a}}$ is ${{t}}$" a student writes $x - {{a}} = {{t}}$. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 40 },
      x: { type: 'int', min: 4, max: 60 },
    },
    derived: { t: 'a+x', wrong: 'a+t' },
    constraints: [],
  },
  choices: [
    { label: 'Increasing adds, so it should read $x + {{a}} = {{t}}$.', correct: true },
    { label: 'Nothing is wrong, because subtraction undoes addition.', error: 'operationInverted' },
    { label: 'The two sides should be swapped, giving ${{t}} = {{a}} - x$.', error: 'ratioReversed' },
    { label: 'The total is wrong and should be ${{wrong}}$.', error: 'usedGivenValue' },
  ],
  reasoning: ['The equation has to record what happened, not how it will be undone.', 'Undoing comes later, when the equation is solved.'],
  answerSummary: { headline: 'Write what the sentence does; solve it afterwards.', text: 'It should be $x + {{a}} = {{t}}$.' },
  hint: 'Does the sentence describe an increase or a decrease?',
  feedback: 'Undoing the operation belongs to solving, not to writing.',
});

mk('6.9A', 'phrase-for-an-inequality', {
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'verbal',
  prompt: 'Which phrase matches $x \\ge {{c}}$?',
  generator: {
    parameters: {
      c: { type: 'int', min: 5, max: 90 },
      gap: { type: 'int', min: 1, max: 4 },
    },
    derived: { under: 'c-gap' },
    constraints: [],
  },
  choices: [
    { label: 'At least ${{c}}$.', correct: true },
    { label: 'More than ${{c}}$.', error: 'offByOneStep' },
    { label: 'At most ${{c}}$.', error: 'ratioReversed' },
    { label: 'Fewer than ${{c}}$.', error: 'signError' },
  ],
  reasoning: ['The bar under the sign lets $x$ equal ${{c}}$, while ${{under}}$ is too small.', '"At least" is the phrase that allows the boundary.'],
  answerSummary: { headline: 'At least keeps the boundary; more than drops it.', text: 'It reads "at least ${{c}}$".' },
  hint: 'Is ${{c}}$ itself included?',
  feedback: '"More than" would exclude ${{c}}$.',
});

// ================================================================ 6.9B
// Showing the solution of a one-step equation or inequality on a number line.

mk('6.9B', 'graph-of-an-equation-solution', {
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'numberLine',
  prompt: 'The solution of $x + {{a}} = {{t}}$ is drawn on a number line. Which description fits?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 30 },
      s: { type: 'int', min: 2, max: 40 },
    },
    derived: { t: 'a+s', sum: 'a+t' },
    constraints: [],
  },
  choices: [
    { label: 'One closed dot at ${{s}}$, with nothing shaded.', correct: true },
    { label: 'A closed dot at ${{s}}$ with an arrow to the right.', error: 'operationInverted' },
    { label: 'One closed dot at ${{sum}}$, with nothing shaded.', error: 'signError' },
    { label: 'An open dot at ${{s}}$, with nothing shaded.', error: 'offByOneStep' },
  ],
  reasoning: ['Only ${{s}}$ satisfies the equation, because ${{s}} + {{a}} = {{t}}$.', 'An equation has one solution here, so nothing beyond that point belongs.'],
  answerSummary: { headline: 'An equation marks a point; an inequality shades a stretch.', text: 'One closed dot at ${{s}}$.' },
  hint: 'How many values make the equation true?',
  feedback: 'An arrow would claim every value past the dot.',
});

mk('6.9B', 'open-or-closed-endpoint', {
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'numberLine',
  prompt: 'How is $x > {{c}}$ drawn at ${{c}}$?',
  generator: {
    parameters: {
      c: { type: 'int', min: 2, max: 60 },
      step: { type: 'int', min: 1, max: 9 },
    },
    derived: { inside: 'c+step' },
    constraints: [],
  },
  choices: [
    { label: 'An open dot, with the arrow to the right.', correct: true },
    { label: 'A closed dot, with the arrow to the right.', error: 'offByOneStep' },
    { label: 'An open dot, with the arrow to the left.', error: 'ratioReversed' },
    { label: 'A closed dot, with the arrow to the left.', error: 'signError' },
  ],
  reasoning: ['${{c}}$ itself does not satisfy $x > {{c}}$, so the endpoint is hollow.', '${{inside}}$ does satisfy it, and it lies to the right, so the arrow runs that way.'],
  answerSummary: { headline: 'A hollow endpoint means the boundary is excluded.', text: 'An open dot with the arrow to the right.' },
  hint: 'Is ${{c}}$ itself a solution?',
  feedback: 'A filled dot would include a value that fails the inequality.',
});

mk('6.9B', 'value-the-dot-lands-on', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Solving ${{k}}x = {{p}}$ puts a single dot on the line. At what value?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 12 },
      q: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      p: 'k*q',
      answer: 'q',
      d_forgotFinalStep: 'p',
      d_operationInverted: 'q-k',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{k}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['${{p}}$ shared into ${{k}}$ equal parts is ${{answer}}$.', 'So the dot sits at ${{answer}}$.'],
  answerSummary: { headline: 'Undo the multiplication to find the one value that works.', text: 'The dot is at ${{answer}}$.' },
  hint: 'What undoes multiplying by ${{k}}$?',
  feedback: 'The total is not the value of $x$.',
});

mk('6.9B', 'which-values-are-shaded', {
  difficultyBand: 1, dok: 2, taskType: 'interpretation', representation: 'verbal',
  prompt: 'Which values are shaded for $x \\le {{c}}$?',
  generator: {
    parameters: {
      c: { type: 'int', min: 2, max: 60 },
      drop: { type: 'int', min: 2, max: 12 },
    },
    derived: { sample: 'c-drop', doubleDrop: 'c-2*drop' },
    constraints: [],
  },
  choices: [
    { label: 'Every value ${{c}}$ and below.', correct: true },
    { label: 'Every value ${{c}}$ and above.', error: 'ratioReversed' },
    { label: 'Every value below ${{c}}$, but not ${{c}}$ itself.', error: 'offByOneStep' },
    { label: 'Only ${{c}}$.', error: 'partialTotal' },
  ],
  reasoning: ['The bar under the sign admits ${{c}}$ itself.', '${{sample}}$ and ${{doubleDrop}}$ satisfy it too, so the shading runs left without stopping.'],
  answerSummary: { headline: 'The sign gives the direction; the bar gives the endpoint.', text: '${{c}}$ and everything below it.' },
  hint: 'Try a value well below ${{c}}$.',
  feedback: 'A single value would answer an equation, not an inequality.',
});

mk('6.9B', 'endpoint-drawn-wrongly', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student graphs $x < {{c}}$ with a closed dot at ${{c}}$ and an arrow left. What is wrong?',
  generator: {
    parameters: { c: { type: 'int', min: 2, max: 60 } },
    derived: { below: 'c-1' },
    constraints: [],
  },
  choices: [
    { label: 'The dot should be open, because ${{c}}$ does not satisfy the inequality.', correct: true },
    { label: 'The arrow should run right, because $<$ points that way.', error: 'ratioReversed' },
    { label: 'Nothing is wrong, because the dot marks where the shading starts.', error: 'operationInverted' },
    { label: 'The dot belongs at ${{below}}$, the largest value that works.', error: 'offByOneStep' },
  ],
  reasoning: ['A filled dot claims ${{c}}$ is a solution, and ${{c}} < {{c}}$ is false.', 'The direction is right; only the endpoint is drawn wrongly.'],
  answerSummary: { headline: 'A strict inequality excludes its own boundary.', text: 'The dot should be open.' },
  hint: 'Test ${{c}}$ in the inequality.',
  feedback: 'There is no largest value below ${{c}}$ to mark.',
});


// ================================================================ 6.10A
// Solving the one-step equation or inequality a problem sets up.

mk('6.10A', 'solve-a-one-step-sum', {
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Solve $x + {{a}} = {{t}}$.',
  generator: {
    parameters: {
      // Same range for both, so the given value crosses the answer from either
      // side rather than sitting above it in most draws.
      a: { type: 'int', min: 3, max: 40 },
      s: { type: 'int', min: 3, max: 40 },
    },
    derived: {
      t: 'a+s',
      answer: 's',
      d_signError: 't+a',
      d_ratioReversed: 'a-t',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{a}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Take ${{a}}$ from both sides.', '${{t}} - {{a}} = {{answer}}$.'],
  answerSummary: { headline: 'Undo the addition on both sides at once.', text: '$x = {{answer}}$.' },
  hint: 'What undoes adding ${{a}}$?',
  feedback: 'Adding ${{a}}$ again moves further from the answer.',
});

mk('6.10A', 'height-from-a-triangle-area', {
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A triangular plate has area ${{A}}$ square centimetres and base ${{b}}$ centimetres. What is its height?',
  generator: {
    parameters: {
      b: { type: 'int', min: 3, max: 20 },
      half: { type: 'int', min: 2, max: 10 },
    },
    derived: {
      h: '2*half',
      A: 'b*half',
      answer: 'h',
      d_partialTotal: 'half',
      d_forgotFinalStep: '2*A',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{b}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['A triangle covers half of the ${{b}}$ by ${{answer}}$ rectangle.', 'So ${{A}}$ doubled is ${{d_forgotFinalStep}}$, and shared by the base ${{b}}$ that is ${{answer}}$.'],
  answerSummary: { headline: 'A triangle is half its surrounding rectangle, so double before dividing.', text: 'The height is ${{answer}}$ centimetres.' },
  hint: 'What rectangle would the triangle be half of?',
  feedback: 'Leaving out the halving loses a factor of two.',
});

mk('6.10A', 'inequality-after-a-load', {
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'A shelf holds at most ${{c}}$ kilograms and already carries ${{m}}$ kilograms. Which inequality must the rest $x$ satisfy?',
  generator: {
    parameters: {
      m: { type: 'int', min: 5, max: 60, step: 5 },
      room: { type: 'int', min: 5, max: 90, step: 5 },
    },
    derived: {
      c: 'm+room',
      over: 'c+m',
    },
    constraints: [],
  },
  choices: [
    { label: plain('x \\le {{room}}'), correct: true },
    { label: plain('x \\le {{c}}'), error: 'partialTotal' },
    { label: plain('x \\ge {{room}}'), error: 'ratioReversed' },
    { label: plain('x \\le {{over}}'), error: 'signError' },
  ],
  reasoning: ['${{m}}$ of the ${{c}}$ kilograms is already used.', 'That leaves ${{room}}$, and the rest must not exceed it.'],
  answerSummary: { headline: 'Subtract what is already there before writing the limit.', text: 'It is $x \\le {{room}}$.' },
  hint: 'How much of the limit is still free?',
  feedback: 'The full limit ignores the load already on the shelf.',
});

mk('6.10A', 'undoing-the-wrong-operation', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'To solve ${{a}}x = {{t}}$ a student subtracts ${{a}}$ from both sides. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 15 },
      q: { type: 'int', min: 3, max: 15 },
    },
    derived: {
      t: 'a*q',
      wrong: 'a*q-a',
    },
    constraints: [],
  },
  choices: [
    { label: 'Subtraction undoes addition, not multiplication; dividing gives $x = {{q}}$.', correct: true },
    { label: 'Nothing is wrong, and the answer is ${{wrong}}$.', error: 'operationInverted' },
    { label: 'The subtraction should be done on one side only.', error: 'partialTotal' },
    { label: 'The equation has no solution, because ${{a}}$ does not divide ${{t}}$.', error: 'usedGivenValue' },
  ],
  reasoning: ['$x$ is multiplied by ${{a}}$, so dividing by ${{a}}$ is what releases it.', '${{t}} \\div {{a}} = {{q}}$.'],
  answerSummary: { headline: 'Undo an operation with its own inverse.', text: '$x = {{q}}$.' },
  hint: 'What is being done to $x$ in the first place?',
  feedback: 'Doing something to one side only breaks the equality.',
});

mk('6.10A', 'solve-a-one-step-quotient', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Solve $\\frac{x}{{{a}}} = {{q}}$.',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 20 },
      q: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      answer: 'a*q',
      d_offByOneStep: 'a*q+a',
      d_operationInverted: 'a+q',
      d_arithmeticSlip: 'a*a',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['$x$ is divided by ${{a}}$, so multiply both sides by ${{a}}$.', '${{q}} \\times {{a}} = {{answer}}$.'],
  answerSummary: { headline: 'Multiplying undoes dividing.', text: '$x = {{answer}}$.' },
  hint: 'What undoes dividing by ${{a}}$?',
  feedback: 'Adding the two numbers is not the inverse of dividing.',
});

// ================================================================ 6.10B
// Deciding whether a given value makes an equation or inequality true.
//
// None of these is written as "which of these four values satisfies the
// inequality". The value that satisfies `x > c` is necessarily the large one,
// so that shape hands the key to anyone who reads only the choices. Testing a
// value, or substituting into an expression, asks the same mathematics without
// making the key the extreme.

mk('6.10B', 'value-that-solves-a-product', {
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Which value of $x$ makes ${{a}}x = {{t}}$ true?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 14 },
      q: { type: 'int', min: 2, max: 14 },
    },
    derived: {
      t: 'a*q',
      answer: 'q',
      d_forgotFinalStep: 't',
      d_operationInverted: 'q-a',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{a}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['${{a}} \\times {{answer}} = {{t}}$, so ${{answer}}$ makes it true.', 'No other listed value does.'],
  answerSummary: { headline: 'Test a value by putting it back into the equation.', text: '$x = {{answer}}$.' },
  hint: 'What times ${{a}}$ gives ${{t}}$?',
  feedback: 'The total is what ${{a}}x$ comes to, not what $x$ is.',
});

mk('6.10B', 'do-the-boxes-fit', {
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'context',
  prompt: 'A shelf holds at most ${{t}}$ kilograms. Do ${{v}}$ boxes of ${{a}}$ kilograms fit?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      v: { type: 'int', min: 2, max: 12 },
      slack: { type: 'int', min: 1, max: 30 },
    },
    derived: {
      prod: 'a*v',
      t: 'a*v+slack',
    },
    constraints: [],
  },
  choices: [
    { label: 'Yes, because they weigh ${{prod}}$ kilograms, which is under ${{t}}$.', correct: true },
    { label: 'No, because ${{prod}}$ kilograms is over the limit.', error: 'signError' },
    { label: 'Yes, because ${{v}}$ is smaller than ${{t}}$.', error: 'partialTotal' },
    { label: 'It cannot be decided without knowing the shelf width.', error: 'operationInverted' },
  ],
  reasoning: ['${{v}}$ boxes at ${{a}}$ kilograms weigh ${{prod}}$ kilograms.', '${{prod}}$ is at most ${{t}}$, so the load is allowed.'],
  answerSummary: { headline: 'Work out what the load actually weighs, then compare.', text: 'They fit, at ${{prod}}$ kilograms.' },
  hint: 'What do the boxes weigh altogether?',
  feedback: 'The number of boxes is not their mass.',
});

mk('6.10B', 'substituting-into-a-difference', {
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'symbolic',
  prompt: 'What does $x - {{a}}$ equal when $x = {{v}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 40 },
      v: { type: 'int', min: 2, max: 40 },
    },
    derived: {
      answer: 'v-a',
      d_signError: 'v+a',
      d_operationInverted: '0-v-a',
      d_ratioReversed: 'a-v',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['Put ${{v}}$ where $x$ stands.', '${{v}} - {{a}} = {{answer}}$.'],
  answerSummary: { headline: 'Substituting replaces the letter and leaves the operation alone.', text: 'It equals ${{answer}}$.' },
  hint: 'Replace $x$ and then subtract.',
  feedback: 'The order of the subtraction matters.',
});

mk('6.10B', 'how-to-check-a-claimed-solution', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student claims $x = {{wrong}}$ solves $x + {{a}} = {{t}}$. How is that settled?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 30 },
      s: { type: 'int', min: 3, max: 30 },
      slip: { type: 'int', min: 1, max: 9 },
    },
    derived: {
      t: 'a+s',
      wrong: 's+slip',
      got: 'a+s+slip',
    },
    constraints: [],
  },
  choices: [
    { label: 'Put ${{wrong}}$ in place of $x$: it gives ${{got}}$, not ${{t}}$, so it fails.', correct: true },
    { label: 'It is correct, because ${{wrong}}$ is close to ${{t}} - {{a}}$.', error: 'partialTotal' },
    { label: 'Add ${{a}}$ to ${{t}}$; if that gives ${{wrong}}$ the claim holds.', error: 'operationInverted' },
    { label: 'It cannot be checked, because the equation was not solved first.', error: 'usedGivenValue' },
  ],
  reasoning: ['A claimed solution is tested by substitution, not by how close it looks.', '${{wrong}} + {{a}} = {{got}}$, which is not ${{t}}$.'],
  answerSummary: { headline: 'Substitute the claim and see whether both sides agree.', text: 'It gives ${{got}}$, so the claim fails.' },
  hint: 'Put the value back in and see what comes out.',
  feedback: 'Being near the answer is not the same as being the answer.',
});

mk('6.10B', 'what-a-solution-must-satisfy', {
  difficultyBand: 1, dok: 2, taskType: 'conceptual', representation: 'verbal',
  prompt: 'A value makes ${{a}}x = {{t}}$ true. What must be true of it?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 15 },
      q: { type: 'int', min: 3, max: 15 },
    },
    derived: { t: 'a*q', gap: 'a*q-a' },
    constraints: [],
  },
  choices: [
    { label: 'It equals ${{t}}$ divided by ${{a}}$.', correct: true },
    { label: 'It equals ${{t}}$ minus ${{a}}$, which is ${{gap}}$.', error: 'operationInverted' },
    { label: 'It equals ${{a}}$ times ${{t}}$.', error: 'ratioReversed' },
    { label: 'Any value below ${{t}}$ will do.', error: 'partialTotal' },
  ],
  reasoning: ['${{a}}x$ reaching ${{t}}$ means $x$ is what ${{t}}$ splits into ${{a}}$ equal parts.', 'Only one value does that.'],
  answerSummary: { headline: 'A one-step equation admits exactly one value.', text: 'It is ${{t}}$ divided by ${{a}}$.' },
  hint: 'How many values can make it true?',
  feedback: 'An equation is not satisfied by a whole range of values.',
});

// ================================================================ 6.11
// Points in all four quadrants.
//
// The key is fixed when the family is authored, so the quadrant a family asks
// about has to be fixed too: a family that drew signs freely would need a
// different choice to be correct on different draws. Each family therefore
// pins its own sign pattern, and the variety across the standard covers the
// plane.

mk('6.11', 'quadrant-of-a-point', {
  difficultyBand: 1, dok: 1, taskType: 'interpretation', representation: 'orderedPairs',
  prompt: 'In which quadrant does the point $({{a}} - {{b}}, {{q}})$ lie?',
  generator: {
    parameters: {
      a: { type: 'int', min: 1, max: 20 },
      g: { type: 'int', min: 1, max: 20 },
      q: { type: 'int', min: 1, max: 20 },
    },
    derived: { b: 'a+g', x: '0-g' },
    constraints: [],
  },
  choices: [
    { label: 'Quadrant II', correct: true },
    { label: 'Quadrant I', error: 'signError' },
    { label: 'Quadrant III', error: 'ratioReversed' },
    { label: 'Quadrant IV', error: 'operationInverted' },
  ],
  reasoning: ['${{a}} - {{b}} = {{x}}$, which is negative, so the point sits left of the vertical axis.', 'The second coordinate is positive, so it sits above the horizontal axis.'],
  answerSummary: { headline: 'The two signs together fix the quadrant.', text: 'It lies in Quadrant II.' },
  hint: 'Which side of each axis does the point fall on?',
  feedback: 'A negative first coordinate cannot put a point on the right.',
});

mk('6.11', 'point-in-a-named-quadrant', {
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'orderedPairs',
  prompt: 'Which point lies in Quadrant III?',
  generator: {
    parameters: {
      p: { type: 'int', min: 1, max: 20 },
      q: { type: 'int', min: 1, max: 20 },
    },
    derived: {},
    constraints: [],
  },
  choices: [
    { label: plain('(-{{p}}, -{{q}})'), correct: true },
    { label: plain('({{p}}, -{{q}})'), error: 'signError' },
    { label: plain('(-{{p}}, {{q}})'), error: 'ratioReversed' },
    { label: plain('({{p}}, {{q}})'), error: 'operationInverted' },
  ],
  reasoning: ['Quadrant III is left of the vertical axis and below the horizontal one.', 'Both coordinates are therefore negative.'],
  answerSummary: { headline: 'Quadrant III is the one where both coordinates are negative.', text: 'It is $(-{{p}}, -{{q}})$.' },
  hint: 'What signs does Quadrant III require?',
  feedback: 'One negative coordinate puts the point in a different quadrant.',
});

mk('6.11', 'reflection-across-the-x-axis', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'orderedPairs',
  prompt: 'Reflecting $(-{{p}}, {{q}})$ across the horizontal axis gives which point?',
  generator: {
    parameters: {
      p: { type: 'int', min: 1, max: 20 },
      q: { type: 'int', min: 1, max: 20 },
    },
    derived: {},
    // Ordered-pair labels carry two placeholders each, so the kit cannot
    // reduce them to a value and emits no automatic constraint — the author
    // owns the collision. At p = q the swapped-coordinates distractor and the
    // reflect-the-wrong-axis one become the same point.
    constraints: ['p!=q'],
  },
  choices: [
    { label: plain('(-{{p}}, -{{q}})'), correct: true },
    { label: plain('({{p}}, {{q}})'), error: 'operationInverted' },
    { label: plain('({{p}}, -{{q}})'), error: 'ratioReversed' },
    { label: plain('({{q}}, -{{p}})'), error: 'arithmeticSlip' },
  ],
  reasoning: ['Reflecting across the horizontal axis moves a point straight up or down.', 'The first coordinate is untouched and the second changes sign.'],
  answerSummary: { headline: 'A reflection across an axis flips only the coordinate measured against it.', text: 'It is $(-{{p}}, -{{q}})$.' },
  hint: 'Which coordinate measures distance from the horizontal axis?',
  feedback: 'The horizontal position does not move.',
});

mk('6.11', 'distance-across-the-vertical-axis', {
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'numberLine',
  prompt: 'How far apart are $(-{{p}}, {{c}})$ and $({{q}}, {{c}})$?',
  generator: {
    parameters: {
      p: { type: 'int', min: 1, max: 20 },
      q: { type: 'int', min: 1, max: 20 },
      c: { type: 'int', min: 1, max: 20 },
    },
    derived: {
      answer: 'p+q',
      d_usedGivenValue: 'p+q+c',
      d_signError: 'q-p',
      d_arithmeticSlip: 'p+c',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['Both points sit at the same height, so only the horizontal positions matter.', 'From $-{{p}}$ to $0$ is ${{p}}$, and on to ${{q}}$ is ${{q}}$ more, giving ${{answer}}$.'],
  answerSummary: { headline: 'Points on one horizontal line differ only in their first coordinate.', text: 'They are ${{answer}}$ apart.' },
  hint: 'Count to the vertical axis and then onward.',
  feedback: 'Subtracting the two first coordinates loses the crossing of zero.',
});

mk('6.11', 'plotted-in-the-wrong-direction', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student plots $(-{{p}}, {{q}})$ by going ${{p}}$ right and ${{q}}$ up. What is wrong?',
  generator: {
    parameters: {
      p: { type: 'int', min: 1, max: 20 },
      q: { type: 'int', min: 1, max: 20 },
    },
    derived: { gap: '2*p' },
    constraints: [],
  },
  choices: [
    { label: 'The first coordinate is negative, so the move is ${{p}} $ to the left.', correct: true },
    { label: 'The vertical move should be ${{q}}$ down, not up.', error: 'signError' },
    { label: 'Nothing is wrong, because the minus sign only labels the point.', error: 'operationInverted' },
    { label: 'The two moves should be swapped, going ${{q}}$ right and ${{p}}$ up.', error: 'ratioReversed' },
  ],
  reasoning: ['A negative first coordinate is a move left from the origin, so the plotted point lands ${{gap}}$ units right of the correct one.', 'The second coordinate is positive, so the upward move is right.'],
  answerSummary: { headline: 'The sign of a coordinate sets the direction of its move.', text: 'The horizontal move should be to the left.' },
  hint: 'What does the minus sign do to the direction?',
  feedback: 'Only one of the two moves is in the wrong direction.',
});

// ================================================================ 6.8A
// Triangle facts: the angle sum, sides against angles, and which three lengths
// can close.

mk('6.8A', 'third-angle-of-a-triangle', {
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'verbal',
  prompt: 'Two angles of a triangle measure ${{a}}^\\circ$ and ${{b}}^\\circ$. What is the third?',
  generator: {
    parameters: {
      // Capped at 75 so the two given angles can never reach 180 between them,
      // which keeps the third angle positive without a constraint that would
      // reject draws unevenly.
      a: { type: 'int', min: 15, max: 75 },
      b: { type: 'int', min: 15, max: 75 },
    },
    derived: {
      answer: '180-a-b',
      d_forgotFinalStep: '180-a',
      d_signError: 'b-a',
      d_operationInverted: 'a+b',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}^\\circ'), correct: true },
    { label: plain('{{d_forgotFinalStep}}^\\circ'), error: 'forgotFinalStep' },
    { label: plain('{{d_signError}}^\\circ'), error: 'signError' },
    { label: plain('{{d_operationInverted}}^\\circ'), error: 'operationInverted' },
  ],
  reasoning: ['The three angles of a triangle come to $180^\\circ$.', '$180 - {{a}} - {{b}} = {{answer}}$.'],
  answerSummary: { headline: 'The angles of any triangle total 180 degrees.', text: 'The third angle is ${{answer}}^\\circ$.' },
  hint: 'What do all three angles come to?',
  feedback: 'Both given angles have to come off the total.',
});

mk('6.8A', 'which-lengths-close-a-triangle', {
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'Which three lengths can form a triangle?',
  generator: {
    parameters: {
      p: { type: 'int', min: 10, max: 30 },
      q: { type: 'int', min: 10, max: 30 },
      g: { type: 'int', min: 1, max: 9 },
    },
    derived: {
      sum: 'p+q',
      rOk: 'p+q-g',
      rBig: 'p+q+g',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{p}}, {{q}}, {{rOk}}'), correct: true },
    { label: plain('{{p}}, {{q}}, {{sum}}'), error: 'offByOneStep' },
    { label: plain('{{p}}, {{q}}, {{rBig}}'), error: 'signError' },
    { label: plain('{{p}}, {{g}}, {{rBig}}'), error: 'operationInverted' },
  ],
  reasoning: ['Two sides have to reach further than the third, or they cannot meet.', '${{p}} + {{q}} = {{sum}}$, which beats ${{rOk}}$ but not the others.'],
  answerSummary: { headline: 'The two shorter sides must total more than the longest.', text: '${{p}}, {{q}}, {{rOk}}$ closes.' },
  hint: 'Add the two shorter lengths and compare with the longest.',
  feedback: 'Sides that exactly reach lie flat instead of closing.',
});

mk('6.8A', 'longest-side-of-a-triangle', {
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'verbal',
  prompt: 'A triangle has angles ${{a}}^\\circ$, ${{b}}^\\circ$ and ${{c}}^\\circ$. Which side is longest?',
  generator: {
    parameters: {
      // a < b < c by construction, so the largest angle is always the derived
      // one and the key can be a fixed choice.
      a: { type: 'int', min: 30, max: 45 },
      g: { type: 'int', min: 1, max: 15 },
    },
    derived: {
      b: 'a+g',
      c: '180-a-b',
    },
    constraints: [],
  },
  choices: [
    { label: 'The side opposite the ${{c}}^\\circ$ angle.', correct: true },
    { label: 'The side opposite the ${{a}}^\\circ$ angle.', error: 'ratioReversed' },
    { label: 'The side opposite the ${{b}}^\\circ$ angle.', error: 'partialTotal' },
    { label: 'All three sides are the same length.', error: 'operationInverted' },
  ],
  reasoning: ['${{c}}^\\circ$ is the largest of the three angles.', 'The longest side of a triangle faces its largest angle.'],
  answerSummary: { headline: 'Bigger angle, longer side opposite it.', text: 'The side opposite the ${{c}}^\\circ$ angle.' },
  hint: 'Which angle is the largest?',
  feedback: 'Equal sides would need equal angles.',
});

mk('6.8A', 'apex-angle-of-a-truss', {
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A roof truss is a triangle whose two base angles are ${{a}}^\\circ$ each. What is the top angle?',
  generator: {
    parameters: { a: { type: 'int', min: 15, max: 75 } },
    derived: {
      answer: '180-2*a',
      d_partialTotal: '180-a',
      d_operationInverted: '2*a',
      d_arithmeticSlip: '90-a',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}^\\circ'), correct: true },
    { label: plain('{{d_partialTotal}}^\\circ'), error: 'partialTotal' },
    { label: plain('{{d_operationInverted}}^\\circ'), error: 'operationInverted' },
    { label: plain('{{d_arithmeticSlip}}^\\circ'), error: 'arithmeticSlip' },
  ],
  reasoning: ['The two base angles together take ${{d_operationInverted}}^\\circ$.', 'That leaves $180 - {{d_operationInverted}} = {{answer}}$ for the top.'],
  answerSummary: { headline: 'Take both equal angles off the 180 degree total.', text: 'The top angle is ${{answer}}^\\circ$.' },
  hint: 'Both base angles are the same size.',
  feedback: 'One base angle is not the pair of them.',
});

mk('6.8A', 'angles-that-cannot-be-a-triangle', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says a triangle has angles ${{a}}^\\circ$, ${{b}}^\\circ$ and ${{c}}^\\circ$. Why is that impossible?',
  generator: {
    parameters: {
      a: { type: 'int', min: 20, max: 70 },
      b: { type: 'int', min: 20, max: 70 },
      e: { type: 'int', min: 5, max: 40 },
    },
    derived: {
      c: '180-a-b+e',
      total: '180+e',
    },
    constraints: [],
  },
  choices: [
    { label: 'The three angles total ${{total}}^\\circ$, and a triangle totals $180^\\circ$.', correct: true },
    { label: 'The three angles total ${{total}}^\\circ$, which is short of $180^\\circ$.', error: 'signError' },
    { label: 'A triangle cannot have three angles of different sizes.', error: 'operationInverted' },
    { label: 'An angle of ${{a}}^\\circ$ is not allowed in a triangle.', error: 'usedGivenValue' },
  ],
  reasoning: ['${{a}} + {{b}} + {{c}} = {{total}}$.', 'Every triangle totals exactly $180^\\circ$, so these three cannot close one.'],
  answerSummary: { headline: 'Add the angles before judging whether the triangle exists.', text: 'They total ${{total}}^\\circ$.' },
  hint: 'Add the three measures.',
  feedback: 'The total is over 180, not under it.',
});

// ================================================================ 6.8B
// Where the area formulas come from: cutting a shape up and moving the pieces.

mk('6.8B', 'parallelogram-cut-into-a-rectangle', {
  difficultyBand: 1, dok: 2, taskType: 'conceptual', representation: 'verbal',
  prompt: 'A triangle is cut from one end of a parallelogram and moved to the other. What results?',
  generator: {
    parameters: {
      b: { type: 'int', min: 4, max: 24 },
      h: { type: 'int', min: 3, max: 18 },
    },
    derived: { area: 'b*h' },
    constraints: [],
  },
  choices: [
    { label: 'A rectangle of the same base and height, and the same area.', correct: true },
    { label: 'A rectangle of the same base and height, but twice the area.', error: 'operationInverted' },
    { label: 'A triangle of half the area.', error: 'partialTotal' },
    { label: 'A square with the same distance round the outside.', error: 'areaPerimeterSwap' },
  ],
  reasoning: ['Nothing is added or thrown away, so the area cannot change.', 'A base of ${{b}}$ and a height of ${{h}}$ give ${{area}}$ either way.'],
  answerSummary: { headline: 'Rearranging pieces moves area about; it does not create or destroy it.', text: 'A rectangle of the same area.' },
  hint: 'Was anything added or removed?',
  feedback: 'Moving a piece cannot double what is there.',
});

mk('6.8B', 'two-triangles-make-a-parallelogram', {
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'Two identical triangles of base $b$ and height $h$ join into a parallelogram. Which expression gives the area of one of them?',
  generator: {
    parameters: {
      b: { type: 'int', min: 4, max: 24, step: 2 },
      h: { type: 'int', min: 3, max: 18 },
    },
    derived: { pair: 'b*h', each: 'b*h/2' },
    constraints: [],
  },
  choices: [
    { label: plain('\\frac{bh}{2}'), correct: true },
    { label: plain('bh'), error: 'operationInverted' },
    { label: plain('2bh'), error: 'arithmeticSlip' },
    { label: plain('\\frac{b + h}{2}'), error: 'areaPerimeterSwap' },
  ],
  reasoning: ['The parallelogram covers $bh$, and the two triangles share it equally.', 'With $b = {{b}}$ and $h = {{h}}$ the pair covers ${{pair}}$, so one covers ${{each}}$.'],
  answerSummary: { headline: 'A triangle is half the parallelogram built from two copies of it.', text: 'It is $\\frac{bh}{2}$.' },
  hint: 'How many triangles make the parallelogram?',
  feedback: 'Adding the base to the height measures neither area.',
});

mk('6.8B', 'why-a-triangle-is-half', {
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'verbal',
  prompt: 'Why does a triangle of base ${{b}}$ cm and height ${{h}}$ cm cover ${{half}}$ square cm?',
  generator: {
    parameters: {
      b: { type: 'int', min: 4, max: 24, step: 2 },
      h: { type: 'int', min: 3, max: 18 },
    },
    derived: { rect: 'b*h', half: 'b*h/2' },
    constraints: [],
  },
  choices: [
    { label: 'Two copies of it form a parallelogram of ${{rect}}$ square cm.', correct: true },
    { label: 'Its base and height are each halved before multiplying.', error: 'operationInverted' },
    { label: 'Half of the base is multiplied by half of the height.', error: 'partialTotal' },
    { label: 'The distance round the outside is halved.', error: 'areaPerimeterSwap' },
  ],
  reasoning: ['Turning a second copy of the triangle upside down closes a parallelogram of ${{rect}}$ square cm.', 'The two copies are identical, so each holds ${{half}}$.'],
  answerSummary: { headline: 'The halving comes from pairing the triangle with a copy of itself.', text: 'Two copies make ${{rect}}$ square cm.' },
  hint: 'What shape do two copies of the triangle close?',
  feedback: 'Halving both dimensions would quarter the area, not halve it.',
});

mk('6.8B', 'rearranging-does-not-change-area', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says cutting a parallelogram into a rectangle changes its area. What is wrong?',
  generator: {
    parameters: {
      b: { type: 'int', min: 4, max: 24 },
      h: { type: 'int', min: 3, max: 18 },
    },
    derived: { area: 'b*h', slant: 'b*h+h' },
    constraints: [],
  },
  choices: [
    { label: 'The same pieces are used, so the area stays ${{area}}$ square units.', correct: true },
    { label: 'Nothing is wrong, because the slanted side is longer than the base.', error: 'areaPerimeterSwap' },
    { label: 'Nothing is wrong, and the rectangle covers ${{slant}}$ square units.', error: 'operationInverted' },
    { label: 'The area does change, because the height is measured differently.', error: 'usedGivenValue' },
  ],
  reasoning: ['The cut piece is moved, not resized, so nothing is gained or lost.', 'Both shapes stand on a base of ${{b}}$ with a height of ${{h}}$.'],
  answerSummary: { headline: 'Decomposing and rearranging preserves area exactly.', text: 'The area is ${{area}}$ either way.' },
  hint: 'Count what was added and what was removed.',
  feedback: 'A longer slanted side does not add area.',
});

mk('6.8B', 'area-of-one-of-the-two-triangles', {
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A parallelogram plate of base ${{b}}$ cm and height ${{h}}$ cm is cut along a diagonal. What area does one piece cover?',
  generator: {
    parameters: {
      // The crossing distractor is the distance round the outside, and whether
      // that beats half the area turns on 4(b + h) against bh. Drawn to 24 by
      // 18 the area ran away with it and the key was the larger of the two in
      // two draws out of three.
      b: { type: 'int', min: 4, max: 20, step: 2 },
      h: { type: 'int', min: 3, max: 12 },
    },
    derived: {
      answer: 'b*h/2',
      d_forgotFinalStep: 'b*h',
      d_areaPerimeterSwap: 'b+h',
      d_operationInverted: '2*(b+h)',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_areaPerimeterSwap}}'), error: 'areaPerimeterSwap' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['The whole plate covers ${{d_forgotFinalStep}}$ square centimetres.', 'The diagonal splits it into two equal pieces, so one covers ${{answer}}$.'],
  answerSummary: { headline: 'A diagonal halves a parallelogram.', text: 'One piece covers ${{answer}}$ square centimetres.' },
  hint: 'What does the whole plate cover first?',
  feedback: 'The whole plate is twice one of the pieces.',
});


// ================================================================ 6.7B
// Telling an expression from an equation.

mk('6.7B', 'which-of-these-is-an-equation', {
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'Which of these is an equation?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 2, max: 20 },
      v: { type: 'int', min: 2, max: 12 },
    },
    derived: { t: 'a*v+b' },
    constraints: [],
  },
  choices: [
    { label: plain('{{a}}x + {{b}} = {{t}}'), correct: true },
    { label: plain('{{a}}x + {{b}}'), error: 'operationInverted' },
    { label: plain('{{a}}(x + {{b}})'), error: 'partialTotal' },
    { label: plain('{{a}}x - {{b}}'), error: 'signError' },
  ],
  reasoning: ['An equation states that two quantities are equal, so it carries an equals sign.', 'The other three only describe a quantity.'],
  answerSummary: { headline: 'An equation makes a claim; an expression only names a value.', text: '${{a}}x + {{b}} = {{t}}$ is the equation.' },
  hint: 'Look for the equals sign.',
  feedback: 'Brackets do not make an expression into an equation.',
});

mk('6.7B', 'expression-for-a-phrase', {
  difficultyBand: 1, dok: 2, taskType: 'representationTranslation', representation: 'verbal',
  prompt: 'How is "${{a}}$ more than a number" written?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 40 },
      v: { type: 'int', min: 2, max: 30 },
    },
    derived: { t: 'a+v' },
    constraints: [],
  },
  choices: [
    { label: plain('x + {{a}}'), correct: true },
    { label: plain('x + {{a}} = {{t}}'), error: 'operationInverted' },
    { label: plain('{{a}} - x'), error: 'ratioReversed' },
    { label: plain('{{a}}x'), error: 'signError' },
  ],
  reasoning: ['The phrase names a quantity but claims nothing about its value.', 'So it is written without an equals sign.'],
  answerSummary: { headline: 'A phrase becomes an expression; a sentence becomes an equation.', text: 'It is $x + {{a}}$.' },
  hint: 'Does the phrase say what the result equals?',
  feedback: 'Adding an equals sign claims more than the phrase does.',
});

mk('6.7B', 'what-makes-it-an-equation', {
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'table',
  prompt: 'One of these can be solved and the other cannot. Why?',
  stimulus: {
    kind: 'expressions',
    title: 'Two lines of algebra',
    note: 'First: ${{a}}x + {{b}}$    Second: ${{a}}x + {{b}} = {{t}}$',
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 2, max: 20 },
      v: { type: 'int', min: 2, max: 12 },
    },
    derived: { t: 'a*v+b' },
    constraints: [],
  },
  choices: [
    { label: 'The second sets a value for $x$ to satisfy; the first only names a quantity.', correct: true },
    { label: 'The second has more terms in it than the first.', error: 'partialTotal' },
    { label: 'The first cannot be solved because it has no brackets.', error: 'operationInverted' },
    { label: 'Both can be solved, but the first has many answers.', error: 'ratioReversed' },
  ],
  reasoning: ['Solving means finding values that make a statement true.', 'The first line makes no statement, so there is nothing to satisfy.'],
  answerSummary: { headline: 'Only a statement of equality can be solved.', text: 'The second is an equation; the first is not.' },
  hint: 'What would solving even mean for the first line?',
  feedback: 'The number of terms has nothing to do with it.',
});

mk('6.7B', 'evaluating-rather-than-solving', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'What is ${{a}}x + {{b}}$ when $x = {{v}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      // b and v share a range so the mis-paired product crosses the key.
      b: { type: 'int', min: 2, max: 20 },
      v: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      answer: 'a*v+b',
      d_orderOfOperations: '(a+b)*v',
      d_operationInverted: 'a+b+v',
      d_arithmeticSlip: 'a*b+v',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_orderOfOperations}}'), error: 'orderOfOperations' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['Only $x$ is replaced, so ${{a}} \\times {{v}} = {{a}}{{v}}$ is worked out first.', 'Adding ${{b}}$ gives ${{answer}}$.'],
  answerSummary: { headline: 'An expression is evaluated, not solved.', text: 'It comes to ${{answer}}$.' },
  hint: 'Which number replaces $x$?',
  feedback: 'The coefficient and the constant are not added together first.',
});

mk('6.7B', 'nothing-to-solve', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student tries to solve ${{a}}x + {{b}}$ for $x$. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 2, max: 20 },
    },
    derived: { ratio: '0-b' },
    constraints: [],
  },
  choices: [
    { label: 'There is no equals sign, so there is no statement to make true.', correct: true },
    { label: 'Nothing is wrong, and the answer is ${{ratio}}$.', error: 'operationInverted' },
    { label: 'It can be solved only once a value of $x$ is chosen.', error: 'ratioReversed' },
    { label: 'It cannot be solved because ${{a}}$ does not divide ${{b}}$.', error: 'usedGivenValue' },
  ],
  reasoning: ['An expression names a quantity; it does not claim that quantity equals anything.', 'Without a claim there is nothing for $x$ to satisfy.'],
  answerSummary: { headline: 'Solving needs an equation to solve.', text: 'There is no equals sign.' },
  hint: 'What does solving an equation actually find?',
  feedback: 'Choosing a value for $x$ evaluates the expression; it does not solve it.',
});

// ================================================================ 6.7C
// Deciding whether two expressions are the same.

mk('6.7C', 'combining-two-like-terms', {
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Which expression equals ${{a}}x + {{b}}x$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 2, max: 12 },
    },
    derived: { sum: 'a+b', prod: 'a*b' },
    // At a = b = 2 the sum and the product are both 4, so the key and the
    // multiply-instead-of-add distractor become the same label. Coefficient
    // labels carry two placeholders, so no automatic constraint covers this.
    constraints: ['sum!=prod'],
  },
  choices: [
    { label: plain('{{sum}}x'), correct: true },
    { label: plain('{{prod}}x'), error: 'operationInverted' },
    { label: plain('{{sum}}x^2'), error: 'exponentError' },
    { label: plain('{{sum}} + x'), error: 'arithmeticSlip' },
  ],
  reasoning: ['${{a}}$ lots of $x$ and ${{b}}$ lots of $x$ make ${{sum}}$ lots of $x$.', 'The $x$ itself is not multiplied by anything new.'],
  answerSummary: { headline: 'Like terms add their counts, not their letters.', text: 'It is ${{sum}}x$.' },
  hint: 'How many $x$ are there altogether?',
  feedback: 'Adding two terms does not raise the power.',
});

mk('6.7C', 'which-pair-is-equivalent', {
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'table',
  prompt: 'Which two expressions are equal for every value of $x$?',
  stimulus: {
    kind: 'expressions',
    title: 'Values in play',
    note: '$a = {{a}}$, $b = {{b}}$',
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 12 },
    },
    derived: { ab: 'a*b', twoA: '2*a' },
    constraints: [],
  },
  choices: [
    { label: plain('{{a}}(x + {{b}}) \\text{ and } {{a}}x + {{ab}}'), correct: true },
    { label: plain('{{a}}(x + {{b}}) \\text{ and } {{a}}x + {{b}}'), error: 'partialTotal' },
    { label: plain('{{a}}x + {{a}}x \\text{ and } {{twoA}}x^2'), error: 'exponentError' },
    { label: plain('x + {{a}} \\text{ and } {{a}}x'), error: 'operationInverted' },
  ],
  reasoning: ['The ${{a}}$ outside the bracket multiplies both terms inside it.', 'That gives ${{a}}x + {{ab}}$, and no other pair matches for every $x$.'],
  answerSummary: { headline: 'Equivalent means equal for every value, not for one.', text: '${{a}}(x + {{b}})$ and ${{a}}x + {{ab}}$.' },
  hint: 'Multiply out the bracket in full.',
  feedback: 'Leaving one term inside the bracket unmultiplied changes the value.',
});

mk('6.7C', 'expression-equal-to-a-bracket', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Multiplying out ${{a}}(x + {{b}})$ gives which expression?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 2, max: 15 },
    },
    derived: { ab: 'a*b' },
    constraints: [],
  },
  choices: [
    { label: plain('{{a}}x + {{ab}}'), correct: true },
    { label: plain('{{a}}x + {{b}}'), error: 'partialTotal' },
    { label: plain('x + {{ab}}'), error: 'operationInverted' },
    { label: plain('{{a}}x - {{ab}}'), error: 'signError' },
  ],
  reasoning: ['Everything inside the bracket is multiplied by ${{a}}$.', '${{a}} \\times {{b}} = {{ab}}$.'],
  answerSummary: { headline: 'The factor outside reaches every term inside.', text: 'It is ${{a}}x + {{ab}}$.' },
  hint: 'How many terms are inside the bracket?',
  feedback: 'The constant inside the bracket must be multiplied too.',
});

mk('6.7C', 'where-two-plans-agree', {
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'context',
  prompt: 'Plan A costs $\\${{a}}$ an hour, and Plan B costs $\\${{b}}$ plus $\\$1$ an hour. At how many hours do they cost the same?',
  generator: {
    parameters: {
      // a from 3 so the two plans always meet at a whole number of hours, and
      // k over the same span as a so the given rate crosses the answer.
      a: { type: 'int', min: 3, max: 9 },
      k: { type: 'int', min: 2, max: 10 },
    },
    derived: {
      b: 'k*(a-1)',
      answer: 'k',
      d_usedGivenValue: 'b',
      d_operationInverted: 'floor(b/a)',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{a}}'), error: 'partialTotal' },
  ],
  reasoning: ['Each hour Plan A gains $\\$1$ times ${{a}} - 1$ on Plan B.', 'Closing the $\\${{b}}$ head start therefore takes ${{answer}}$ hours.'],
  answerSummary: { headline: 'The two costs meet where the gap between the rates has closed the head start.', text: 'They agree at ${{answer}}$ hours.' },
  hint: 'How much does Plan A catch up each hour?',
  feedback: 'The head start is not itself a number of hours.',
});

mk('6.7C', 'multiplying-out-by-half', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says ${{a}}(x + {{b}})$ equals ${{a}}x + {{b}}$. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 2, max: 15 },
      v: { type: 'int', min: 1, max: 9 },
    },
    derived: {
      ab: 'a*b',
      right: 'a*(v+b)',
      wrong: 'a*v+b',
    },
    constraints: [],
  },
  choices: [
    { label: 'The ${{b}}$ was not multiplied, so it should read ${{a}}x + {{ab}}$.', correct: true },
    { label: 'Nothing is wrong; both give ${{right}}$ at $x = {{v}}$.', error: 'operationInverted' },
    { label: 'The $x$ should not have been multiplied by ${{a}}$ either.', error: 'ratioReversed' },
    { label: 'The bracket should have been left alone entirely.', error: 'partialTotal' },
  ],
  reasoning: ['At $x = {{v}}$ the first comes to ${{right}}$ and the version written to ${{wrong}}$.', 'One counter-example is enough to show two expressions are not equivalent.'],
  answerSummary: { headline: 'A factor outside a bracket multiplies every term inside.', text: 'It should be ${{a}}x + {{ab}}$.' },
  hint: 'Try a value of $x$ in both.',
  feedback: 'The term in $x$ was handled correctly; the constant was not.',
});

// ================================================================ 6.7D
// Rewriting an expression using the properties of operations.

mk('6.7D', 'factoring-out-a-common-factor', {
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Which expression equals ${{ab}}x + {{ac}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 2, max: 12 },
    },
    derived: { ab: 'a*b', ac: 'a*c' },
    constraints: [],
  },
  choices: [
    { label: plain('{{a}}({{b}}x + {{c}})'), correct: true },
    { label: plain('{{a}}({{b}}x + {{ac}})'), error: 'partialTotal' },
    { label: plain('{{ab}}(x + {{ac}})'), error: 'operationInverted' },
    { label: plain('{{a}}({{b}}x - {{c}})'), error: 'signError' },
  ],
  reasoning: ['Both terms carry a factor of ${{a}}$.', 'Taking it out leaves ${{b}}x$ and ${{c}}$ inside.'],
  answerSummary: { headline: 'Taking a factor out divides every term by it.', text: 'It is ${{a}}({{b}}x + {{c}})$.' },
  hint: 'What divides both ${{ab}}$ and ${{ac}}$?',
  feedback: 'A term left undivided would make the bracket too large.',
});

mk('6.7D', 'which-property-regroups', {
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'verbal',
  prompt: 'Which property turns ${{a}} + (x + {{b}})$ into $({{a}} + x) + {{b}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 20 },
      b: { type: 'int', min: 2, max: 20 },
    },
    derived: { sum: 'a+b' },
    constraints: [],
  },
  choices: [
    { label: 'The associative property of addition.', correct: true },
    { label: 'The commutative property of addition.', error: 'operationInverted' },
    { label: 'The distributive property.', error: 'ratioReversed' },
    { label: 'The identity property of addition.', error: 'partialTotal' },
  ],
  reasoning: ['The three terms stay in the same order; only the brackets move.', 'Regrouping without reordering is the associative property.'],
  answerSummary: { headline: 'Associative moves the brackets; commutative moves the terms.', text: 'It is the associative property.' },
  hint: 'Did anything change order, or only grouping?',
  feedback: 'Nothing was reordered, so commuting is not what happened.',
});

mk('6.7D', 'adding-then-taking-back', {
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Simplify ${{a}}x + {{b}} - {{b}}$.',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 15 },
      b: { type: 'int', min: 2, max: 30 },
    },
    derived: { twoB: '2*b' },
    constraints: [],
  },
  choices: [
    { label: plain('{{a}}x'), correct: true },
    { label: plain('{{a}}x + {{twoB}}'), error: 'signError' },
    { label: plain('{{a}}x + {{b}}'), error: 'partialTotal' },
    { label: plain('x'), error: 'operationInverted' },
  ],
  reasoning: ['Adding ${{b}}$ and then removing ${{b}}$ leaves nothing behind.', 'The term in $x$ is untouched.'],
  answerSummary: { headline: 'A number and its opposite cancel to zero.', text: 'It simplifies to ${{a}}x$.' },
  hint: 'What do $+{{b}}$ and $-{{b}}$ come to together?',
  feedback: 'The coefficient of $x$ does not disappear.',
});

mk('6.7D', 'two-properties-in-one-rewrite', {
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'table',
  prompt: 'Which steps take the first line to the second?',
  stimulus: {
    kind: 'expressions',
    title: 'A rewrite',
    note: 'From: ${{a}} + x + {{b}}$    To: $x + {{sum}}$',
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 20 },
      b: { type: 'int', min: 2, max: 20 },
    },
    derived: { sum: 'a+b', prod: 'a*b' },
    constraints: [],
  },
  choices: [
    { label: 'Reorder the terms, then add ${{a}}$ and ${{b}}$.', correct: true },
    { label: 'Multiply ${{a}}$ by ${{b}}$ to get ${{prod}}$, then reorder.', error: 'operationInverted' },
    { label: 'Take $x$ out as a common factor.', error: 'ratioReversed' },
    { label: 'Add ${{a}}$ to $x$ first, then attach ${{b}}$.', error: 'partialTotal' },
  ],
  reasoning: ['Moving $x$ to the front is the commutative property.', '${{a}}$ and ${{b}}$ are then like terms and add to ${{sum}}$.'],
  answerSummary: { headline: 'Reorder first so the like terms sit together.', text: 'Reorder, then add to ${{sum}}$.' },
  hint: 'Which two terms can actually be combined?',
  feedback: '$x$ is not a factor of the constants.',
});

mk('6.7D', 'subtracting-a-whole-bracket', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student rewrites ${{a}} - (x + {{b}})$ as ${{a}} - x + {{b}}$. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 10, max: 40 },
      b: { type: 'int', min: 2, max: 15 },
      v: { type: 'int', min: 1, max: 9 },
    },
    derived: {
      right: 'a-v-b',
      wrong: 'a-v+b',
      diff: '2*b',
    },
    constraints: [],
  },
  choices: [
    { label: 'Both terms in the bracket are subtracted, so it is ${{a}} - x - {{b}}$.', correct: true },
    { label: 'Nothing is wrong, because the bracket only groups the terms.', error: 'operationInverted' },
    { label: 'The $x$ should keep its plus sign, giving ${{a}} + x - {{b}}$.', error: 'signError' },
    { label: 'The bracket cannot be removed without a factor outside it.', error: 'partialTotal' },
  ],
  reasoning: ['At $x = {{v}}$ the original comes to ${{right}}$ and the rewrite to ${{wrong}}$, a gap of ${{diff}}$.', 'The minus sign in front applies to everything inside.'],
  answerSummary: { headline: 'A minus sign before a bracket subtracts every term inside it.', text: 'It should be ${{a}} - x - {{b}}$.' },
  hint: 'Try a value of $x$ in both versions.',
  feedback: 'The term in $x$ was handled correctly; the constant was not.',
});

// ================================================================ 6.8C
// Writing the equation an area or volume problem calls for.

mk('6.8C', 'equation-for-a-rectangle-width', {
  difficultyBand: 1, dok: 1, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'A rectangle of length ${{L}}$ cm has area ${{A}}$ square cm. Which equation gives its width $w$?',
  generator: {
    parameters: {
      L: { type: 'int', min: 3, max: 25 },
      w: { type: 'int', min: 3, max: 25 },
    },
    derived: { A: 'L*w' },
    constraints: [],
  },
  choices: [
    { label: plain('{{L}}w = {{A}}'), correct: true },
    { label: plain('w + {{L}} = {{A}}'), error: 'operationInverted' },
    { label: plain('\\frac{w}{{{L}}} = {{A}}'), error: 'ratioReversed' },
    { label: plain('{{A}}w = {{L}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['A rectangle covers its length times its width.', 'So ${{L}}$ times $w$ has to come to ${{A}}$.'],
  answerSummary: { headline: 'Write the area rule with the unknown left in place.', text: 'It is ${{L}}w = {{A}}$.' },
  hint: 'What are the two dimensions multiplied together?',
  feedback: 'Adding the sides measures the way round, not the area.',
});

mk('6.8C', 'equation-for-a-triangle-area', {
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'A triangle of base ${{b}}$ units and height $h$ covers ${{A}}$ square units. Which equation is right?',
  generator: {
    parameters: {
      b: { type: 'int', min: 4, max: 24, step: 2 },
      h: { type: 'int', min: 3, max: 18 },
    },
    derived: { A: 'b*h/2', whole: 'b*h' },
    constraints: [],
  },
  choices: [
    { label: plain('\\frac{{{b}}h}{2} = {{A}}'), correct: true },
    { label: plain('{{b}}h = {{A}}'), error: 'partialTotal' },
    { label: plain('\\frac{{{b}} + h}{2} = {{A}}'), error: 'areaPerimeterSwap' },
    { label: plain('2{{b}}h = {{A}}'), error: 'operationInverted' },
  ],
  reasoning: ['The surrounding parallelogram would cover ${{whole}}$ square units.', 'A triangle covers half of that, so the halving belongs in the equation.'],
  answerSummary: { headline: 'The triangle rule carries the halving with it.', text: 'It is $\\frac{{{b}}h}{2} = {{A}}$.' },
  hint: 'What shape is the triangle half of?',
  feedback: 'Leaving out the halving describes a parallelogram.',
});

mk('6.8C', 'equation-for-a-box-height', {
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A crate has a base ${{l}}$ by ${{w}}$ centimetres and holds ${{V}}$ cubic centimetres. Which equation gives its height $h$?',
  generator: {
    parameters: {
      l: { type: 'int', min: 3, max: 20 },
      w: { type: 'int', min: 3, max: 20 },
      h: { type: 'int', min: 3, max: 20 },
    },
    derived: { base: 'l*w', V: 'l*w*h' },
    constraints: [],
  },
  choices: [
    { label: plain('{{base}}h = {{V}}'), correct: true },
    { label: plain('{{l}} + {{w}} + h = {{V}}'), error: 'operationInverted' },
    { label: plain('\\frac{{{base}}}{h} = {{V}}'), error: 'ratioReversed' },
    { label: plain('\\frac{{{base}}h}{2} = {{V}}'), error: 'partialTotal' },
  ],
  reasoning: ['The base covers ${{base}}$ square centimetres.', 'Each centimetre of height adds another ${{base}}$, so ${{base}}h$ must reach ${{V}}$.'],
  answerSummary: { headline: 'A prism stacks its base area through its height.', text: 'It is ${{base}}h = {{V}}$.' },
  hint: 'What does one centimetre of height contribute?',
  feedback: 'Halving belongs to a triangle, not to a box.',
});

mk('6.8C', 'equation-for-a-trapezoid-area', {
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'table',
  prompt: 'Which equation gives the area $A$ of the shape described?',
  stimulus: {
    kind: 'expressions',
    title: 'A trapezoid',
    note: 'Parallel sides $a$ and $b$, height $h$; with $a = {{a}}$, $b = {{b}}$ and $h = {{h}}$ it covers ${{area}}$ square units.',
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 15 },
      b: { type: 'int', min: 3, max: 15 },
      half: { type: 'int', min: 2, max: 9 },
    },
    derived: { h: '2*half', area: '(a+b)*half' },
    constraints: [],
  },
  choices: [
    { label: plain('A = \\frac{(a + b)h}{2}'), correct: true },
    { label: plain('A = (a + b)h'), error: 'partialTotal' },
    { label: plain('A = \\frac{abh}{2}'), error: 'operationInverted' },
    { label: plain('A = \\frac{a + b + h}{2}'), error: 'areaPerimeterSwap' },
  ],
  reasoning: ['Two copies of the trapezoid form a parallelogram of base $a + b$ and height $h$.', 'With the numbers given that is ${{a}} + {{b}}$ times ${{h}}$, and one trapezoid holds half of it: ${{area}}$.'],
  answerSummary: { headline: 'A trapezoid is half a parallelogram built on the two parallel sides.', text: 'It is $A = \\frac{(a + b)h}{2}$.' },
  hint: 'What do two copies of the shape make?',
  feedback: 'The parallel sides are added, not multiplied.',
});

mk('6.8C', 'halving-where-no-halving-belongs', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'For a parallelogram of base ${{b}}$ units and height ${{h}}$ units a student writes $A = \\frac{{{b}} \\times {{h}}}{2}$. What is wrong?',
  generator: {
    parameters: {
      b: { type: 'int', min: 4, max: 24, step: 2 },
      h: { type: 'int', min: 3, max: 18 },
    },
    derived: { area: 'b*h', halved: 'b*h/2' },
    constraints: [],
  },
  choices: [
    { label: 'A parallelogram is not halved, so the area is ${{area}}$ square units.', correct: true },
    { label: 'Nothing is wrong; a parallelogram is half a rectangle.', error: 'operationInverted' },
    { label: 'The halving is right but the base and height should be added.', error: 'areaPerimeterSwap' },
    { label: 'The area is ${{halved}}$, because the shape leans.', error: 'usedGivenValue' },
  ],
  reasoning: ['Cutting a triangle off one end of a parallelogram and moving it makes a rectangle of the same area.', 'So the parallelogram covers the full ${{b}} \\times {{h}} = {{area}}$.'],
  answerSummary: { headline: 'Only the triangle rule carries a halving.', text: 'The area is ${{area}}$ square units.' },
  hint: 'What rectangle has the same area as the parallelogram?',
  feedback: 'Leaning does not reduce the area.',
});

// ================================================================ 6.8D
// Working out the area or volume a problem asks for.

mk('6.8D', 'area-of-a-trapezoid-plate', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'A trapezoidal plate has parallel edges of ${{a}}$ and ${{b}}$ cm and a height of ${{h}}$ cm. What area does it cover?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 20 },
      b: { type: 'int', min: 3, max: 20 },
      half: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      h: '2*half',
      answer: '(a+b)*half',
      d_forgotFinalStep: '(a+b)*h',
      d_partialTotal: 'a*half',
      d_operationInverted: 'a*b',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['The two parallel edges total ${{a}} + {{b}}$.', 'Half the height is ${{half}}$, and the product is ${{answer}}$ square cm.'],
  answerSummary: { headline: 'Average the parallel edges, then multiply by the height.', text: 'It covers ${{answer}}$ square cm.' },
  hint: 'Both parallel edges are involved.',
  feedback: 'Using one parallel edge alone describes a rectangle.',
});

mk('6.8D', 'height-of-a-crate', {
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A crate of volume ${{V}}$ cubic cm has a base ${{l}}$ by ${{w}}$ cm. How tall is it?',
  generator: {
    parameters: {
      l: { type: 'int', min: 2, max: 12 },
      w: { type: 'int', min: 2, max: 12 },
      e: { type: 'int', min: 1, max: 6 },
    },
    derived: {
      h: '2*e',
      V: 'l*w*2*e',
      answer: 'h',
      d_forgotFinalStep: 'V',
      d_partialTotal: 'e',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{l}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The base covers ${{l}} \\times {{w}}$ square cm.', 'Dividing ${{V}}$ by that base area leaves a height of ${{answer}}$ cm.'],
  answerSummary: { headline: 'Volume divided by base area gives the height.', text: 'It is ${{answer}}$ cm tall.' },
  hint: 'What area does one layer cover?',
  feedback: 'The whole volume is not a length.',
});

mk('6.8D', 'total-area-of-two-plates', {
  difficultyBand: 3, dok: 2, taskType: 'interpretation', representation: 'table',
  prompt: 'The table lists two parallelogram plates. What area do they cover together?',
  stimulus: {
    kind: 'table',
    title: 'Plate sizes',
    table: {
      headers: ['plate', 'base (cm)', 'height (cm)'],
      rows: [['first', '{{b1}}', '{{h1}}'], ['second', '{{b2}}', '{{h2}}']],
    },
  },
  generator: {
    parameters: {
      b1: { type: 'int', min: 3, max: 20 },
      h1: { type: 'int', min: 3, max: 20 },
      b2: { type: 'int', min: 3, max: 20 },
      h2: { type: 'int', min: 3, max: 20 },
    },
    derived: {
      answer: 'b1*h1+b2*h2',
      d_operationInverted: '(b1+b2)*(h1+h2)',
      d_partialTotal: 'b1*h1',
      d_arithmeticSlip: 'b1*h2+b2*h1',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['The first plate covers ${{d_partialTotal}}$ square cm.', 'Adding the second plate brings the total to ${{answer}}$.'],
  answerSummary: { headline: 'Work out each plate on its own, then add.', text: 'Together they cover ${{answer}}$ square cm.' },
  hint: 'Each plate has its own base and its own height.',
  feedback: 'Each base belongs with its own height.',
});

mk('6.8D', 'area-reported-in-the-wrong-unit', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student gives the volume of a crate as ${{V}}$ square centimetres. What is wrong?',
  generator: {
    parameters: {
      l: { type: 'int', min: 3, max: 15 },
      w: { type: 'int', min: 3, max: 15 },
      h: { type: 'int', min: 3, max: 15 },
    },
    derived: { V: 'l*w*h', base: 'l*w' },
    constraints: [],
  },
  choices: [
    { label: 'Volume fills space in three directions, so the unit is cubic centimetres.', correct: true },
    { label: 'Nothing is wrong, because area and volume share the same unit.', error: 'operationInverted' },
    { label: 'The number should be ${{base}}$, the area of the base.', error: 'partialTotal' },
    { label: 'The unit should be plain centimetres, because it is a measurement.', error: 'usedGivenValue' },
  ],
  reasoning: ['Three lengths are multiplied together, so three units of length are too.', 'That gives cubic centimetres, not square ones.'],
  answerSummary: { headline: 'The unit records how many lengths were multiplied.', text: 'It should be ${{V}}$ cubic centimetres.' },
  hint: 'How many measurements were multiplied?',
  feedback: 'A base area is not the volume of the crate.',
});

mk('6.8D', 'how-much-larger-the-second-triangle-is', {
  difficultyBand: 3, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'Two triangles share a height of ${{h}}$ units and have bases ${{b1}}$ and ${{b2}}$ units. How much larger is the second?',
  generator: {
    parameters: {
      // b1 is offered as a distractor against an AREA, so its range has to
      // straddle d*g rather than match the other base's span.
      b1: { type: 'int', min: 2, max: 85 },
      d: { type: 'int', min: 2, max: 14 },
      g: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      b2: 'b1+d',
      h: '2*g',
      answer: 'd*g',
      d_operationInverted: '(b1+b2)*g',
      d_arithmeticSlip: 'd+g',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
    { label: plain('{{b1}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The bases differ by ${{d}}$, and both triangles share the height ${{h}}$.', 'The extra area is half of ${{d}} \\times {{h}}$, which is ${{answer}}$.'],
  answerSummary: { headline: 'Only the difference in the bases contributes the extra area.', text: 'The second is ${{answer}}$ square units larger.' },
  hint: 'What do the two triangles have in common?',
  feedback: 'Adding the two bases measures both triangles, not the gap.',
});


// ================================================================ 7.2
// Sets and subsets of the rational numbers.

mk('7.2', 'set-containing-every-value', {
  courseId: 'grade7',
  difficultyBand: 1, dok: 2, taskType: 'interpretation', representation: 'symbolic',
  prompt: 'Which set contains all three of $-{{a}}$, ${{b}}$ and $\\frac{{{num}}}{{{d}}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 40 },
      b: { type: 'int', min: 2, max: 40 },
      n: { type: 'int', min: 1, max: 9 },
      d: { type: 'choice', values: [3, 4, 6, 7, 8] },
    },
    derived: { num: 'n*d+1' },
    constraints: [],
  },
  choices: [
    { label: 'The rational numbers.', correct: true },
    { label: 'The integers.', error: 'operationInverted' },
    { label: 'The whole numbers.', error: 'partialTotal' },
    { label: 'The counting numbers.', error: 'signError' },
  ],
  reasoning: ['$\\frac{{{num}}}{{{d}}}$ does not divide evenly, so it is not an integer.', 'Every one of the three can be written as a ratio, so all three are rational.'],
  answerSummary: { headline: 'The rationals hold every value that can be written as a ratio.', text: 'All three are rational numbers.' },
  hint: 'Find the value that rules out the smaller sets.',
  feedback: 'A fraction that does not divide evenly is not an integer.',
});

mk('7.2', 'whole-numbers-inside-integers', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'verbal',
  prompt: 'Which statement about the whole numbers and the integers is true?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 40 },
      b: { type: 'int', min: 2, max: 40 },
    },
    derived: { neg: '0-a', sum: 'a+b' },
    constraints: [],
  },
  choices: [
    { label: 'Every whole number is an integer, but not every integer is whole.', correct: true },
    { label: 'Every integer is whole, but not every whole number is an integer.', error: 'ratioReversed' },
    { label: 'The two sets hold exactly the same values.', error: 'operationInverted' },
    { label: 'No value belongs to both sets.', error: 'partialTotal' },
  ],
  reasoning: ['${{sum}}$ is whole and is also an integer, and that holds for every whole number.', '${{neg}}$ is an integer but is not whole, so the integers reach further.'],
  answerSummary: { headline: 'The whole numbers sit inside the integers, not the other way round.', text: 'Every whole number is an integer; the reverse fails.' },
  hint: 'Think of a value in one set but not the other.',
  feedback: 'The negatives belong to only one of the two sets.',
});

mk('7.2', 'nested-rings-of-numbers', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'table',
  prompt: 'Three sets are drawn as nested rings. Which arrangement is right?',
  stimulus: {
    kind: 'expressions',
    title: 'A value from each set',
    note: 'Whole: ${{w}}$    Integer: $-{{a}}$    Rational: $\\frac{{{num}}}{{{d}}}$',
  },
  generator: {
    parameters: {
      w: { type: 'int', min: 0, max: 40 },
      a: { type: 'int', min: 2, max: 40 },
      n: { type: 'int', min: 1, max: 9 },
      d: { type: 'choice', values: [3, 4, 6, 7, 8] },
    },
    derived: { num: 'n*d+1', prod: 'n*d' },
    constraints: [],
  },
  choices: [
    { label: 'Whole inside integer, and integer inside rational.', correct: true },
    { label: 'Integer inside whole, and whole inside rational.', error: 'ratioReversed' },
    { label: 'Rational inside integer, and integer inside whole.', error: 'operationInverted' },
    { label: 'The three rings sit side by side and never overlap.', error: 'partialTotal' },
  ],
  reasoning: ['${{w}}$ is whole, an integer and rational, so it sits in all three rings.', '$\\frac{{{num}}}{{{d}}}$ is only rational, so the rational ring is the outer one.'],
  answerSummary: { headline: 'Each ring contains the one before it.', text: 'Whole, then integer, then rational.' },
  hint: 'Which value belongs to all three sets?',
  feedback: 'The rings do overlap: some values belong to all three.',
});

mk('7.2', 'operation-that-leaves-the-integers', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'verbal',
  prompt: 'Which operation on two integers can give a value that is not an integer?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 30 },
      d: { type: 'choice', values: [3, 4, 6, 7, 8] },
      n: { type: 'int', min: 1, max: 9 },
    },
    derived: { num: 'n*d+1', diff: 'a-n' },
    constraints: [],
  },
  choices: [
    { label: 'Division.', correct: true },
    { label: 'Subtraction.', error: 'signError' },
    { label: 'Addition.', error: 'operationInverted' },
    { label: 'Multiplication.', error: 'partialTotal' },
  ],
  reasoning: ['${{num}} \\div {{d}}$ does not divide evenly, so the result is not an integer.', 'Adding, subtracting or multiplying two integers always lands on another integer.'],
  answerSummary: { headline: 'Only division can take you out of the integers.', text: 'Division.' },
  hint: 'Which operation can leave a remainder?',
  feedback: 'Subtracting integers gives a negative at worst, which is still an integer.',
});

mk('7.2', 'every-rational-is-not-an-integer', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says every rational number is an integer. What is wrong?',
  generator: {
    parameters: {
      n: { type: 'int', min: 1, max: 9 },
      d: { type: 'choice', values: [3, 4, 6, 7, 8] },
      k: { type: 'int', min: 2, max: 20 },
    },
    derived: { num: 'n*d+1', prod: 'k*d' },
    constraints: [],
  },
  choices: [
    { label: '$\\frac{{{num}}}{{{d}}}$ is rational and is not an integer.', correct: true },
    { label: 'Nothing is wrong, because $\\frac{{{prod}}}{{{d}}}$ is an integer.', error: 'partialTotal' },
    { label: 'The claim fails only for negative rational numbers.', error: 'signError' },
    { label: 'It should say every integer is rational, which is also false.', error: 'operationInverted' },
  ],
  reasoning: ['One counter-example settles it: $\\frac{{{num}}}{{{d}}}$ leaves a remainder.', 'The reverse claim, that every integer is rational, is in fact true.'],
  answerSummary: { headline: 'A single counter-example disproves a claim about every value.', text: '$\\frac{{{num}}}{{{d}}}$ is the counter-example.' },
  hint: 'Find one rational number that is not an integer.',
  feedback: 'A fraction that does divide evenly does not test the claim.',
});

// ================================================================ 7.3A
// Fluency with rational numbers: fractions, decimals and signs.

mk('7.3A', 'sum-of-two-fractions', {
  courseId: 'grade7',
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'symbolic',
  prompt: 'What is $\\frac{{{a}}}{{{d}}} + \\frac{{{b}}}{{{d}}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 7 },
      b: { type: 'int', min: 2, max: 7 },
      d: { type: 'choice', values: [5, 7, 11, 13] },
    },
    derived: { sum: 'a+b', prod: 'a*b', twoD: '2*d' },
    constraints: ['gcd(a,d)==1', 'gcd(b,d)==1', 'sum!=prod'],
  },
  choices: [
    { label: plain('\\frac{{{sum}}}{{{d}}}'), correct: true },
    { label: plain('\\frac{{{sum}}}{{{twoD}}}'), error: 'operationInverted' },
    { label: plain('\\frac{{{prod}}}{{{twoD}}}'), error: 'arithmeticSlip' },
    { label: plain('\\frac{{{prod}}}{{{d}}}'), error: 'partialTotal' },
  ],
  reasoning: ['The denominators already match, so only the numerators are added.', '${{a}} + {{b}} = {{sum}}$, over the same ${{d}}$.'],
  answerSummary: { headline: 'Like denominators add their numerators and keep the denominator.', text: 'It is $\\frac{{{sum}}}{{{d}}}$.' },
  hint: 'What happens to the denominator?',
  feedback: 'Adding the denominators too would shrink the result.',
});

mk('7.3A', 'difference-of-two-decimals', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Work out ${{x}} - {{y}}$.',
  generator: {
    parameters: {
      p: { type: 'int', min: 11, max: 99 },
      q: { type: 'int', min: 11, max: 99 },
    },
    derived: {
      x: 'p/10', y: 'q/10',
      answer: '(p-q)/10',
      d_signError: '(p+q)/10',
      d_ratioReversed: '(q-p)/10',
      d_operationInverted: '(0-p-q)/10',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['Line the points up and subtract: ${{p}} - {{q}} = {{p}}$ minus ${{q}}$ in tenths.', 'That gives ${{answer}}$.'],
  answerSummary: { headline: 'Subtract in tenths, then put the point back.', text: 'It is ${{answer}}$.' },
  hint: 'Which value is larger?',
  feedback: 'Reversing the order flips the sign of the answer.',
});

mk('7.3A', 'negative-fraction-times-a-whole', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Work out $-\\frac{{{a}}}{{{b}}} \\times {{c}}$.',
  generator: {
    parameters: {
      // a and b share a range so the given multiplier crosses the key.
      a: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 2, max: 12 },
      k: { type: 'int', min: 2, max: 9 },
    },
    // The fraction is shown to the student, so it has to be in lowest terms.
    derived: {
      c: 'b*k',
      answer: '0-a*k',
      d_signError: 'a*k',
      d_forgotFinalStep: '0-a*b*k',
      d_usedGivenValue: '0-c',
    },
    constraints: ['gcd(a,b)==1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['${{c}}$ divided by ${{b}}$ is ${{k}}$, and ${{a}} \\times {{k}} = {{d_signError}}$.', 'One negative factor makes the result negative: ${{answer}}$.'],
  answerSummary: { headline: 'Cancel first, then settle the sign.', text: 'It is ${{answer}}$.' },
  hint: 'Does the denominator divide the whole number?',
  feedback: 'A single negative factor cannot give a positive result.',
});

mk('7.3A', 'balance-after-weekly-falls', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A tank holds ${{b}}$ litres and loses ${{fall}}$ litres a week for ${{w}}$ weeks. How much is left?',
  generator: {
    parameters: {
      b: { type: 'int', min: 10, max: 50 },
      q: { type: 'int', min: 11, max: 99 },
      w: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      fall: 'q/10',
      lost: 'q*w/10',
      answer: '(10*b-q*w)/10',
      d_signError: '(10*b+q*w)/10',
      d_forgotFinalStep: '(0-q*w)/10',
      d_ratioReversed: '(q*w-10*b)/10',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['${{w}}$ weeks at ${{fall}}$ litres take ${{lost}}$ litres away.', 'Starting from ${{b}}$ that leaves ${{answer}}$.'],
  answerSummary: { headline: 'Work out the total loss, then take it off the start.', text: 'It leaves ${{answer}}$ litres.' },
  hint: 'How much goes in total?',
  feedback: 'The amount lost is not the amount left.',
});

mk('7.3A', 'adding-the-denominators', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student writes $\\frac{{{a}}}{{{d}}} + \\frac{{{b}}}{{{d}}}$ as $\\frac{{{sum}}}{{{twoD}}}$. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 2, max: 12 },
      d: { type: 'choice', values: [5, 7, 11, 13] },
    },
    derived: { sum: 'a+b', twoD: '2*d', prod: 'a*b' },
    constraints: ['gcd(a,d)==1', 'gcd(b,d)==1', 'sum!=prod'],
  },
  choices: [
    { label: 'The denominator names the size of the parts, so it stays ${{d}}$.', correct: true },
    { label: 'Nothing is wrong, because both parts were counted.', error: 'operationInverted' },
    { label: 'The numerators should have been multiplied to give ${{prod}}$.', error: 'arithmeticSlip' },
    { label: 'The denominators are right but the numerators should stay apart.', error: 'partialTotal' },
  ],
  reasoning: ['Both fractions already count ${{d}}$ths, so the parts being counted do not change size.', 'Doubling the denominator halves every part, which changes the value.'],
  answerSummary: { headline: 'Adding fractions counts parts; it does not resize them.', text: 'The denominator stays ${{d}}$.' },
  hint: 'What does the denominator actually tell you?',
  feedback: 'Counting the parts is right; changing their size is not.',
});

// ================================================================ 7.4A
// Constant rates of change, including d = rt.

mk('7.4A', 'rate-from-a-table', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'table',
  prompt: 'The table records a steady journey. What is the speed?',
  stimulus: {
    kind: 'table',
    title: 'Journey log',
    table: {
      headers: ['hours', 'km'],
      rows: [['{{t1}}', '{{d1}}'], ['{{t2}}', '{{d2}}'], ['{{t3}}', '{{d3}}']],
    },
  },
  generator: {
    parameters: {
      // The last time in the table is offered as a distractor against the
      // speed, so the two ranges are chosen to overlap.
      r: { type: 'int', min: 6, max: 14, step: 2 },
      t1: { type: 'int', min: 2, max: 6 },
    },
    derived: {
      t2: 't1+3', t3: 't1+6',
      d1: 'r*t1', d2: 'r*t2', d3: 'r*t3',
      answer: 'r',
      d_partialTotal: 'r/2',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d1}}'), error: 'usedGivenValue' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{t3}}'), error: 'ratioReversed' },
  ],
  reasoning: ['Each row divides out the same way: ${{d1}} \\div {{t1}} = {{answer}}$.', 'A steady journey covers ${{answer}}$ km every hour.'],
  answerSummary: { headline: 'A constant rate is the same quotient in every row.', text: 'The speed is ${{answer}}$ km an hour.' },
  hint: 'Divide a distance by its own time.',
  feedback: 'A distance from the table is not a speed.',
});

mk('7.4A', 'equation-for-a-steady-journey', {
  courseId: 'grade7',
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'A vehicle holds a steady ${{r}}$ km an hour. Which equation gives the distance $d$ after $t$ hours?',
  generator: {
    parameters: {
      r: { type: 'int', min: 30, max: 90, step: 5 },
      t: { type: 'int', min: 2, max: 9 },
    },
    derived: { far: 'r*t' },
    constraints: [],
  },
  choices: [
    { label: plain('d = {{r}}t'), correct: true },
    { label: plain('d = t + {{r}}'), error: 'operationInverted' },
    { label: plain('d = \\frac{t}{{{r}}}'), error: 'ratioReversed' },
    { label: plain('t = {{r}}d'), error: 'usedGivenValue' },
  ],
  reasoning: ['Every hour adds another ${{r}}$ km.', 'After ${{t}}$ hours that is ${{far}}$ km, which is ${{r}}$ times $t$.'],
  answerSummary: { headline: 'Distance is rate multiplied by time.', text: 'It is $d = {{r}}t$.' },
  hint: 'What does one more hour add?',
  feedback: 'Adding the rate to the time compares two different quantities.',
});

mk('7.4A', 'how-far-ahead-the-faster-machine-is', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'One machine fills ${{a}}$ crates an hour and another fills ${{b}}$. How many more does the first fill in ${{t}}$ hours?',
  generator: {
    parameters: {
      // b and g share a range so the slower machine's output crosses the gap.
      b: { type: 'int', min: 2, max: 14 },
      g: { type: 'int', min: 2, max: 14 },
      t: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      a: 'b+g',
      answer: 'g*t',
      d_operationInverted: '(a+b)*t',
      d_arithmeticSlip: 'g+t',
      d_usedGivenValue: 'b*t',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The first machine gains ${{g}}$ crates every hour.', 'Over ${{t}}$ hours that gap grows to ${{answer}}$.'],
  answerSummary: { headline: 'Only the difference in the rates opens a gap.', text: 'It fills ${{answer}}$ more.' },
  hint: 'How much does the first gain each hour?',
  feedback: 'Adding the two rates counts both machines, not the gap.',
});

mk('7.4A', 'drive-time-after-a-rest', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'A depot is open ${{rest}}$ hours a day. How long does a ${{d}}$ km drive at ${{r}}$ km an hour take?',
  generator: {
    parameters: {
      r: { type: 'int', min: 30, max: 90, step: 5 },
      e: { type: 'int', min: 1, max: 6 },
      // The opening hours share the drive time's span, so they cross the key.
      rest: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      t: '2*e',
      d: 'r*2*e',
      answer: 't',
      d_forgotFinalStep: 'd',
      d_partialTotal: 'e',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{rest}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['${{d}}$ km at ${{r}}$ km an hour takes ${{d}} \\div {{r}} = {{answer}}$ hours.', 'When the depot is open has nothing to do with how long the drive takes.'],
  answerSummary: { headline: 'Time is distance divided by rate.', text: 'The drive takes ${{answer}}$ hours.' },
  hint: 'Which two quantities settle the driving time?',
  feedback: 'The distance in kilometres is not a number of hours.',
});

mk('7.4A', 'doubling-the-speed', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says doubling the speed doubles the time for a fixed distance. What is wrong?',
  generator: {
    parameters: {
      r: { type: 'int', min: 20, max: 60, step: 5 },
      e: { type: 'int', min: 2, max: 8 },
    },
    derived: {
      t: '2*e',
      d: 'r*2*e',
      twiceR: '2*r',
      halfT: 'e',
    },
    constraints: [],
  },
  choices: [
    { label: 'Going faster takes less time: at ${{twiceR}}$ km an hour the drive falls to ${{halfT}}$ hours.', correct: true },
    { label: 'Nothing is wrong, because distance is rate multiplied by time.', error: 'operationInverted' },
    { label: 'The time stays at ${{t}}$ hours, because the distance has not changed.', error: 'partialTotal' },
    { label: 'The distance doubles to twice ${{d}}$ km instead.', error: 'ratioReversed' },
  ],
  reasoning: ['${{d}}$ km at ${{r}}$ km an hour takes ${{t}}$ hours.', 'At ${{twiceR}}$ km an hour the same ${{d}}$ km takes ${{halfT}}$ hours, which is half as long.'],
  answerSummary: { headline: 'For a fixed distance, rate and time move in opposite directions.', text: 'The time halves to ${{halfT}}$ hours.' },
  hint: 'Try the numbers both ways round.',
  feedback: 'The rule is right, but doubling one factor while the product is fixed halves the other.',
});

// ================================================================ 7.5A
// What similarity actually requires, and the ratios that follow.

mk('7.5A', 'scale-factor-between-two-rectangles', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'A rectangle ${{a}}$ by ${{b}}$ cm is enlarged to ${{ka}}$ by ${{kb}}$ cm. What is the scale factor?',
  generator: {
    parameters: {
      // a and k share a range, so the original side crosses the factor.
      a: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 2, max: 12 },
      k: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      ka: 'k*a', kb: 'k*b',
      answer: 'k',
      d_partialTotal: 'a*(k-1)',
      d_arithmeticSlip: 'k-a',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
    { label: plain('{{a}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['${{ka}} \\div {{a}} = {{answer}}$, and ${{kb}} \\div {{b}} = {{answer}}$ as well.', 'A scale factor multiplies every side by the same amount.'],
  answerSummary: { headline: 'A scale factor is a ratio between matching sides, not a difference.', text: 'The factor is ${{answer}}$.' },
  hint: 'Divide a new side by the one it came from.',
  feedback: 'How much a side grew by is not how many times it grew.',
});

mk('7.5A', 'ratio-inside-a-shape', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'In one rectangle the ratio of length to width is $\\frac{{{a}}}{{{b}}}$. In a similar rectangle it is what?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 15 },
      b: { type: 'int', min: 2, max: 15 },
      k: { type: 'int', min: 2, max: 6 },
    },
    derived: { ka: 'k*a', kb: 'k*b' },
    // Fraction labels carry two placeholders each, so the kit emits no
    // automatic distinctness constraint and the author owns the collision.
    // At a = b the ratio and its reverse are the same label; and b*b = k*a*a
    // makes the two remaining distractors equal in value even though they read
    // differently, which would offer the same answer twice.
    // A ratio is quoted in lowest terms, so a and b share no factor.
    constraints: ['a!=b', 'b*b!=k*a*a', 'gcd(a,b)==1'],
  },
  choices: [
    { label: plain('\\frac{{{a}}}{{{b}}}'), correct: true },
    { label: plain('\\frac{{{b}}}{{{a}}}'), error: 'ratioReversed' },
    { label: plain('\\frac{{{ka}}}{{{b}}}'), error: 'partialTotal' },
    { label: plain('\\frac{{{a}}}{{{kb}}}'), error: 'operationInverted' },
  ],
  reasoning: ['Both sides are multiplied by the same factor, so the factor cancels.', '$\\frac{{{ka}}}{{{kb}}}$ reduces to $\\frac{{{a}}}{{{b}}}$.'],
  answerSummary: { headline: 'A ratio taken inside a shape survives any enlargement.', text: 'It is still $\\frac{{{a}}}{{{b}}}$.' },
  hint: 'What happens to both sides at once?',
  feedback: 'Scaling only one of the two sides would change the shape.',
});

mk('7.5A', 'matching-side-in-a-similar-triangle', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A triangle has sides ${{a}}$ and ${{b}}$ cm, and in a similar triangle the side matching ${{a}}$ is ${{ka}}$ cm. What matches ${{b}}$?',
  generator: {
    parameters: {
      // a and b share a range: the common error adds the difference instead of
      // scaling, and which way that lands turns on a against b.
      a: { type: 'int', min: 2, max: 15 },
      b: { type: 'int', min: 2, max: 15 },
      k: { type: 'int', min: 2, max: 8 },
    },
    derived: {
      ka: 'k*a',
      answer: 'k*b',
      d_offByOneStep: 'k*b+b',
      d_operationInverted: 'b+a*(k-1)',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{b}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['${{ka}} \\div {{a}} = {{k}}$, so every side is multiplied by ${{k}}$.', '${{b}} \\times {{k}} = {{answer}}$.'],
  answerSummary: { headline: 'Similar shapes scale every side by one factor.', text: 'It is ${{answer}}$ cm.' },
  hint: 'Find the factor from the pair you were given.',
  feedback: 'Adding the growth of one side to another only works if the sides are equal.',
});

mk('7.5A', 'what-similarity-requires', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'verbal',
  prompt: 'Two figures are similar. Which must be true?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 15 },
      k: { type: 'int', min: 2, max: 6 },
    },
    derived: { ka: 'k*a' },
    constraints: [],
  },
  choices: [
    { label: 'Matching angles are equal and matching sides share one ratio.', correct: true },
    { label: 'Matching sides are equal and matching angles share one ratio.', error: 'ratioReversed' },
    { label: 'Matching angles are equal, and the sides may be anything.', error: 'partialTotal' },
    { label: 'Every side and every angle is equal.', error: 'operationInverted' },
  ],
  reasoning: ['A side of ${{a}}$ becoming ${{ka}}$ is allowed, so sides need not be equal.', 'The angles hold the shape, so they must match exactly.'],
  answerSummary: { headline: 'Similarity fixes the angles and the ratio, not the lengths.', text: 'Equal angles, one common ratio.' },
  hint: 'Which of the two can change under an enlargement?',
  feedback: 'Equal sides as well as equal angles would make the figures congruent.',
});

mk('7.5A', 'right-angles-are-not-enough', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says any two rectangles are similar because every corner is a right angle. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 2, max: 12 },
      k: { type: 'int', min: 2, max: 6 },
    },
    derived: { ka: 'k*a', wide: 'k*a+a' },
    constraints: [],
  },
  choices: [
    { label: 'The sides must also share one ratio, and a ${{a}}$ by ${{ka}}$ rectangle does not match a ${{a}}$ by ${{wide}}$ one.', correct: true },
    { label: 'Nothing is wrong, because equal angles are all similarity needs.', error: 'partialTotal' },
    { label: 'Rectangles are never similar, because their sides differ.', error: 'operationInverted' },
    { label: 'The angles must be in one ratio as well as equal.', error: 'ratioReversed' },
  ],
  reasoning: ['Equal angles are necessary but not sufficient.', 'A ${{a}}$ by ${{ka}}$ rectangle is a different shape from a ${{a}}$ by ${{wide}}$ one, though both have four right angles.'],
  answerSummary: { headline: 'Equal angles alone do not fix a shape.', text: 'The side ratios must match too.' },
  hint: 'Picture a square beside a long thin rectangle.',
  feedback: 'Some rectangles are similar; the claim is that all of them are.',
});

// ================================================================ 7.5B
// Pi as the ratio of a circle's circumference to its diameter.

mk('7.5B', 'what-pi-measures', {
  courseId: 'grade7',
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'verbal',
  prompt: 'What does $\\pi$ measure?',
  generator: {
    parameters: { d: { type: 'int', min: 4, max: 40, step: 2 } },
    derived: { r: 'd/2', around: '3*d' },
    constraints: [],
  },
  choices: [
    { label: 'How many diameters fit around the edge of a circle.', correct: true },
    { label: 'How many radii fit around the edge of a circle.', error: 'partialTotal' },
    { label: 'The distance straight across a circle.', error: 'operationInverted' },
    { label: 'The area of a circle whose radius is one.', error: 'areaPerimeterSwap' },
  ],
  reasoning: ['Three diameters laid round a circle of diameter ${{d}}$ reach ${{around}}$ cm, a little short of the way round.', 'That little bit over three is $\\pi$, and it is the same for every circle.'],
  answerSummary: { headline: 'Pi is a ratio, and the same one for every circle.', text: 'It counts diameters around the edge.' },
  hint: 'What two lengths is it comparing?',
  feedback: 'Radii would fit around twice as often as diameters.',
});

mk('7.5B', 'what-the-quotient-comes-to', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'A wheel of diameter ${{d}}$ cm rolls ${{c}}$ cm in one full turn. What is ${{c}}$ divided by ${{d}}$ close to?',
  generator: {
    parameters: { d: { type: 'int', min: 4, max: 40, step: 2 } },
    derived: { c: 'round(314*d/100)', r: 'd/2' },
    constraints: [],
  },
  choices: [
    { label: plain('\\pi'), correct: true },
    { label: plain('\\frac{\\pi}{2}'), error: 'partialTotal' },
    { label: plain('2\\pi'), error: 'operationInverted' },
    { label: plain('\\pi^2'), error: 'exponentError' },
  ],
  reasoning: ['One turn lays the edge of the wheel out flat, so ${{c}}$ is the way round.', 'The way round divided by the diameter is $\\pi$ for every circle.'],
  answerSummary: { headline: 'One turn of a wheel covers its own circumference.', text: 'The quotient is $\\pi$.' },
  hint: 'What distance does one turn cover?',
  feedback: 'Dividing by the radius instead would give twice as much.',
});

mk('7.5B', 'circumference-of-a-pipe', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'Two pipes have diameters ${{d}}$ and ${{d2}}$ cm. What is the distance round the first?',
  // The second pipe is drawn separately. Without it all four choices were
  // fixed multiples of one diameter, so their order never changed and the key
  // was the second smallest in every draw.
  generator: {
    parameters: {
      d: { type: 'int', min: 4, max: 40, step: 2 },
      d2: { type: 'int', min: 4, max: 40, step: 2 },
    },
    derived: { r: 'd/2', dsq: 'd*d' },
    constraints: [],
  },
  choices: [
    { label: plain('{{d}}\\pi'), correct: true },
    { label: plain('{{r}}\\pi'), error: 'partialTotal' },
    { label: plain('{{dsq}}\\pi'), error: 'areaPerimeterSwap' },
    { label: plain('{{d2}}\\pi'), error: 'usedGivenValue' },
  ],
  reasoning: ['The way round is $\\pi$ times the diameter.', 'For the first pipe that is ${{d}}\\pi$ cm.'],
  answerSummary: { headline: 'Circumference is pi times the diameter.', text: 'It is ${{d}}\\pi$ cm.' },
  hint: 'Which length does $\\pi$ multiply?',
  feedback: 'That belongs to the second pipe.',
});

mk('7.5B', 'diameter-from-the-circumference', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'A circle has circumference $C$. Which expression gives its diameter?',
  generator: {
    parameters: { d: { type: 'int', min: 4, max: 40, step: 2 } },
    derived: { half: 'd/2' },
    constraints: [],
  },
  choices: [
    { label: plain('\\frac{C}{\\pi}'), correct: true },
    { label: plain('\\frac{C}{2\\pi}'), error: 'partialTotal' },
    { label: plain('C\\pi'), error: 'operationInverted' },
    { label: plain('\\frac{2C}{\\pi}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['$C$ is $\\pi$ times the diameter, so dividing by $\\pi$ undoes that.', 'A circle of diameter ${{d}}$ has $C = {{d}}\\pi$, and ${{d}}\\pi \\div \\pi = {{d}}$.'],
  answerSummary: { headline: 'Undo the multiplication by pi.', text: 'It is $\\frac{C}{\\pi}$.' },
  hint: 'What was the diameter multiplied by?',
  feedback: 'Dividing by $2\\pi$ returns the radius ${{half}}$, not the diameter.',
});

mk('7.5B', 'pi-against-the-radius', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says $\\pi$ is the circumference divided by the radius. What is wrong?',
  generator: {
    parameters: { r: { type: 'int', min: 2, max: 20 } },
    derived: { d: '2*r', c: 'round(314*2*r/100)' },
    constraints: [],
  },
  choices: [
    { label: 'That quotient comes to $2\\pi$, because the radius is half the diameter.', correct: true },
    { label: 'Nothing is wrong, because the radius and diameter both measure across.', error: 'operationInverted' },
    { label: 'That quotient comes to $\\frac{\\pi}{2}$, because the radius is smaller.', error: 'ratioReversed' },
    { label: 'The circumference should be divided by the area instead.', error: 'areaPerimeterSwap' },
  ],
  reasoning: ['A circle of radius ${{r}}$ cm has diameter ${{d}}$ cm and a way round of about ${{c}}$ cm.', 'Dividing by ${{r}}$ rather than ${{d}}$ halves the divisor, so the quotient doubles to $2\\pi$.'],
  answerSummary: { headline: 'Halving the divisor doubles the quotient.', text: 'It comes to $2\\pi$.' },
  hint: 'How does the radius compare with the diameter?',
  feedback: 'A smaller divisor gives a larger quotient, not a smaller one.',
});


// ================================================================ 7.5C
// Scale drawings and similar shapes in use.

mk('7.5C', 'actual-length-from-a-drawing', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'On a drawing at $1$ cm to ${{s}}$ m, a wall measures ${{c}}$ cm and a door ${{c2}}$ cm. How long is the wall?',
  generator: {
    parameters: {
      s: { type: 'int', min: 2, max: 12 },
      // The door's true length is the crossing distractor, so its drawn length
      // shares the wall's range.
      c: { type: 'int', min: 2, max: 15 },
      c2: { type: 'int', min: 2, max: 15 },
    },
    derived: {
      answer: 'c*s',
      d_offByOneStep: 'c*s+s',
      d_operationInverted: 'c+s',
      d_usedGivenValue: 'c2*s',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Each drawn centimetre stands for ${{s}}$ m.', '${{c}}$ cm therefore stands for ${{answer}}$ m.'],
  answerSummary: { headline: 'A scale multiplies every drawn length by the same amount.', text: 'The wall is ${{answer}}$ m long.' },
  hint: 'What does one centimetre on the drawing stand for?',
  feedback: 'That is the door, not the wall.',
});

mk('7.5C', 'what-happens-to-area', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'A shape is enlarged by a scale factor of $k$. Its area is multiplied by what?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 6 },
      side: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      ksq: 'k*k',
      area: 'side*side',
      bigArea: 'k*k*side*side',
    },
    constraints: [],
  },
  choices: [
    { label: plain('k^2'), correct: true },
    { label: plain('k'), error: 'partialTotal' },
    { label: plain('k^3'), error: 'exponentError' },
    { label: plain('2k'), error: 'operationInverted' },
  ],
  reasoning: ['A square of side ${{side}}$ covers ${{area}}$; enlarged by ${{k}}$ its side becomes ${{k}}$ times as long in both directions.', 'That gives ${{bigArea}}$, which is ${{ksq}}$ times the original.'],
  answerSummary: { headline: 'Both directions stretch, so area grows by the factor twice over.', text: 'Area is multiplied by $k^2$.' },
  hint: 'How many directions does the stretch act in?',
  feedback: 'Multiplying by the factor once only stretches one direction.',
});

mk('7.5C', 'map-distance-from-a-real-one', {
  courseId: 'grade7',
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'context',
  prompt: 'A map is drawn at $1$ cm to ${{s}}$ km. Two towns ${{d}}$ km apart appear how far apart?',
  generator: {
    parameters: {
      // s and the drawn length share a range so the scale crosses the answer.
      s: { type: 'int', min: 2, max: 12 },
      half: { type: 'int', min: 1, max: 6 },
    },
    derived: {
      c: '2*half',
      d: 's*2*half',
      answer: 'c',
      d_forgotFinalStep: 'd',
      d_partialTotal: 'half',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{s}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Every ${{s}}$ km of ground takes one centimetre on the map.', '${{d}} \\div {{s}} = {{answer}}$ cm.'],
  answerSummary: { headline: 'Going from ground to map divides by the scale.', text: 'They appear ${{answer}}$ cm apart.' },
  hint: 'Which way does the scale run here?',
  feedback: 'The real distance in kilometres is not a length on the map.',
});

mk('7.5C', 'row-drawn-to-the-wrong-scale', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'table',
  prompt: 'Three of these are drawn to one scale and one is not. Which row is wrong?',
  stimulus: {
    kind: 'table',
    title: 'Drawing against ground',
    table: {
      headers: ['feature', 'drawn (cm)', 'actual (m)'],
      rows: [['wall', '{{c1}}', '{{a1}}'], ['beam', '{{c2}}', '{{a2}}'], ['span', '{{c3}}', '{{bad}}'], ['rail', '{{c4}}', '{{a4}}']],
    },
  },
  generator: {
    parameters: {
      s: { type: 'int', min: 2, max: 12 },
      c1: { type: 'int', min: 2, max: 6 },
    },
    derived: {
      c2: 'c1+2', c3: 'c1+4', c4: 'c1+6',
      a1: 'c1*s', a2: 'c2*s', a4: 'c4*s',
      bad: 'c3*s+s-1',
    },
    constraints: [],
  },
  choices: [
    { label: plain('({{c3}}, {{bad}})'), correct: true },
    { label: plain('({{c1}}, {{a1}})'), error: 'partialTotal' },
    { label: plain('({{c2}}, {{a2}})'), error: 'operationInverted' },
    { label: plain('({{c4}}, {{a4}})'), error: 'usedGivenValue' },
  ],
  reasoning: ['Every other row divides out to ${{s}}$ m per centimetre.', '${{bad}} \\div {{c3}}$ does not.'],
  answerSummary: { headline: 'One scale must hold for every row of a drawing.', text: 'The span row breaks it.' },
  hint: 'Divide each actual length by its drawn length.',
  feedback: 'That row does divide out to ${{s}}$.',
});

mk('7.5C', 'doubling-lengths-and-area', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says doubling every length of a shape doubles its area. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      area: 'a*b',
      doubled: '2*a*b',
      real: '4*a*b',
    },
    constraints: [],
  },
  choices: [
    { label: 'Both directions double, so the area reaches ${{real}}$, not ${{doubled}}$.', correct: true },
    { label: 'Nothing is wrong, because every length was doubled.', error: 'operationInverted' },
    { label: 'The area stays at ${{area}}$, because the shape is unchanged.', error: 'partialTotal' },
    { label: 'The area is doubled twice over, reaching ${{doubled}}$ each time.', error: 'arithmeticSlip' },
  ],
  reasoning: ['A ${{a}}$ by ${{b}}$ rectangle covers ${{area}}$.', 'Doubled it is $2 \\times {{a}}$ by $2 \\times {{b}}$, covering ${{real}}$ — four times as much.'],
  answerSummary: { headline: 'A length factor acts once in each direction.', text: 'The area quadruples to ${{real}}$.' },
  hint: 'Try it on a rectangle you can picture.',
  feedback: 'Doubling both directions is not the same as doubling the area.',
});

// ================================================================ 7.7
// Linear relationships in words, tables and equations.

mk('7.7', 'equation-that-fits-the-table', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'table',
  prompt: 'Which equation matches the table?',
  stimulus: {
    kind: 'table',
    title: 'Recorded values',
    table: { headers: ['x', 'y'], rows: [['{{x1}}', '{{y1}}'], ['{{x2}}', '{{y2}}'], ['{{x3}}', '{{y3}}']] },
  },
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 3, max: 25 },
      x1: { type: 'int', min: 1, max: 4 },
    },
    derived: {
      x2: 'x1+2', x3: 'x1+5',
      y1: 'm*x1+b', y2: 'm*x2+b', y3: 'm*x3+b',
      mPlus: 'm+1',
      firstGap: 'm*x1+b-x1',
    },
    constraints: ['firstGap!=b'],
  },
  choices: [
    { label: plain('y = {{m}}x + {{b}}'), correct: true },
    { label: plain('y = {{mPlus}}x + {{b}}'), error: 'offByOneStep' },
    { label: plain('y = x + {{firstGap}}'), error: 'partialTotal' },
    { label: plain('y = {{m}}x'), error: 'operationInverted' },
  ],
  reasoning: ['Each step of $2$ in $x$ raises $y$ by $2 \\times {{m}}$, so the rate is ${{m}}$.', 'At $x = {{x1}}$ the value is ${{y1}}$, which needs a further ${{b}}$ on top of ${{m}} \\times {{x1}}$.'],
  answerSummary: { headline: 'Find the step first, then what is left over.', text: 'It is $y = {{m}}x + {{b}}$.' },
  hint: 'How much does $y$ move for each step in $x$?',
  feedback: 'A rule with no constant misses every row.',
});

mk('7.7', 'what-the-constant-stands-for', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'verbal',
  prompt: 'A hire costs $y = {{m}}x + {{b}}$ dollars for $x$ days. What does ${{b}}$ stand for?',
  generator: {
    parameters: {
      m: { type: 'int', min: 5, max: 40, step: 5 },
      b: { type: 'int', min: 10, max: 90, step: 5 },
      x: { type: 'int', min: 2, max: 9 },
    },
    derived: { total: 'm*x+b', days: 'm*x' },
    constraints: [],
  },
  choices: [
    { label: 'A fixed charge that applies however many days the hire runs.', correct: true },
    { label: 'The cost of one day of hire.', error: 'ratioReversed' },
    { label: 'The total cost of the hire.', error: 'partialTotal' },
    { label: 'The number of days the hire may run.', error: 'operationInverted' },
  ],
  reasoning: ['At ${{x}}$ days the daily part comes to $\\${{days}}$ and the total to $\\${{total}}$.', 'The extra $\\${{b}}$ is there whatever ${{x}}$ is, so it does not depend on the days.'],
  answerSummary: { headline: 'The constant is what you pay before any day is counted.', text: 'It is a fixed charge.' },
  hint: 'What happens to that term as $x$ changes?',
  feedback: 'The daily rate is the number multiplying $x$.',
});

mk('7.7', 'input-that-gives-a-target', {
  courseId: 'grade7',
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'symbolic',
  prompt: 'In $y = {{m}}x + {{b}}$, what is $x$ when $y = {{t}}$?',
  generator: {
    parameters: {
      // m and v share a range so the rate crosses the answer.
      m: { type: 'int', min: 2, max: 14 },
      v: { type: 'int', min: 2, max: 14 },
      b: { type: 'int', min: 3, max: 30 },
    },
    derived: {
      t: 'm*v+b',
      answer: 'v',
      d_forgotFinalStep: 't',
      d_operationInverted: 'v-m',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{m}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Take the ${{b}}$ off first: ${{t}} - {{b}}$ leaves the part that came from ${{m}}x$.', 'Dividing that by ${{m}}$ gives ${{answer}}$.'],
  answerSummary: { headline: 'Undo the constant, then undo the rate.', text: '$x = {{answer}}$.' },
  hint: 'Which of the two operations is undone first?',
  feedback: 'The target value of $y$ is not the value of $x$.',
});

mk('7.7', 'slope-from-two-points', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'orderedPairs',
  prompt: 'A line passes through $({{x1}}, {{y1}})$ and $({{x2}}, {{y2}})$. What is its slope?',
  generator: {
    parameters: {
      // m and g share a range so the run crosses the slope.
      m: { type: 'int', min: 2, max: 12 },
      g: { type: 'int', min: 2, max: 12 },
      x1: { type: 'int', min: 1, max: 6 },
      y1: { type: 'int', min: 1, max: 20 },
    },
    derived: {
      x2: 'x1+g',
      y2: 'y1+m*g',
      answer: 'm',
      d_partialTotal: 'm*g',
      d_arithmeticSlip: 'm-g',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
    { label: plain('{{g}}'), error: 'ratioReversed' },
  ],
  reasoning: ['From the first point to the second, $x$ moves ${{g}}$ and $y$ moves ${{d_partialTotal}}$.', 'The slope is the rise shared by the run: ${{answer}}$.'],
  answerSummary: { headline: 'Slope is rise divided by run, not rise alone.', text: 'The slope is ${{answer}}$.' },
  hint: 'How far does each coordinate move?',
  feedback: 'The rise on its own has not been shared by the run.',
});

mk('7.7', 'reading-the-slope-off-the-wrong-number', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student reads the slope of $y = {{m}}x + {{b}}$ as ${{b}}$. What is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 3, max: 30 },
    },
    derived: { atOne: 'm+b', atTwo: '2*m+b' },
    constraints: [],
  },
  choices: [
    { label: 'The slope is ${{m}}$: each step in $x$ moves $y$ from ${{atOne}}$ to ${{atTwo}}$.', correct: true },
    { label: 'Nothing is wrong, because ${{b}}$ is the larger number.', error: 'partialTotal' },
    { label: 'The slope is ${{atOne}}$, the value of $y$ at $x = 1$.', error: 'operationInverted' },
    { label: 'The slope cannot be read without a table of values.', error: 'usedGivenValue' },
  ],
  reasoning: ['${{b}}$ is where the line starts, not how steeply it climbs.', 'Between $x = 1$ and $x = 2$ the value moves from ${{atOne}}$ to ${{atTwo}}$, a rise of ${{m}}$.'],
  answerSummary: { headline: 'The number multiplying x is the slope.', text: 'The slope is ${{m}}$.' },
  hint: 'Which number changes the value as $x$ moves?',
  feedback: 'Size does not decide which number is the slope.',
});

// ================================================================ 7.8A
// A rectangular pyramid against the prism that surrounds it.

mk('7.8A', 'how-the-two-volumes-compare', {
  courseId: 'grade7',
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'verbal',
  prompt: 'A pyramid and a prism share a base and a height. How do their volumes compare?',
  generator: {
    parameters: {
      B: { type: 'int', min: 6, max: 40, step: 2 },
      e: { type: 'int', min: 1, max: 6 },
    },
    derived: { h: '3*e', prism: '3*B*e', pyramid: 'B*e' },
    constraints: [],
  },
  choices: [
    { label: 'The pyramid holds a third of the prism.', correct: true },
    { label: 'The pyramid holds half of the prism.', error: 'partialTotal' },
    { label: 'The two hold the same amount.', error: 'operationInverted' },
    { label: 'The pyramid holds three times the prism.', error: 'ratioReversed' },
  ],
  reasoning: ['With a base of ${{B}}$ and a height of ${{h}}$ the prism holds ${{prism}}$.', 'The pyramid holds ${{pyramid}}$, which is a third of it.'],
  answerSummary: { headline: 'Three pyramids fill the prism they share a base and height with.', text: 'A third.' },
  hint: 'How many pyramids would fill the prism?',
  feedback: 'Halving would be right for a triangle against a rectangle, not here.',
});

mk('7.8A', 'volume-of-the-pyramid-inside', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'A pyramid of base ${{B}}$ square cm and height ${{h}}$ cm sits beside one of base ${{B2}}$ square cm at the same height. What is the volume of the first?',
  generator: {
    parameters: {
      // The crossing distractor is the OTHER pyramid's volume, so the two
      // base areas share a range. An earlier draft used three times the base,
      // which beats the key only when e < 3 — and the automatic constraints
      // rule out e = 1 and e = 3, leaving nothing below the threshold at all.
      B: { type: 'int', min: 4, max: 30 },
      B2: { type: 'int', min: 4, max: 30 },
      e: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      h: '3*e',
      answer: 'B*e',
      d_forgotFinalStep: '3*B*e',
      d_operationInverted: 'B+e',
      d_usedGivenValue: 'B2*e',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The surrounding prism would hold ${{B}} \\times {{h}} = {{d_forgotFinalStep}}$ cubic cm.', 'A pyramid holds a third of that: ${{answer}}$.'],
  answerSummary: { headline: 'Base area times height, then a third.', text: 'It holds ${{answer}}$ cubic cm.' },
  hint: 'What would the matching prism hold?',
  feedback: 'That is the second pyramid, not the first.',
});

mk('7.8A', 'prism-from-a-known-pyramid', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'One pyramid of base ${{B}}$ square cm is ${{h}}$ cm tall and a second is ${{h2}}$ cm tall. What does a prism matching the first hold?',
  // The crossing distractor is the volume of the prism matching the SECOND
  // pyramid. An earlier draft used the base area, which is a factor of the key
  // and so can never exceed it — the key was the second largest of four in
  // every single draw.
  generator: {
    parameters: {
      B: { type: 'int', min: 4, max: 30 },
      e: { type: 'int', min: 1, max: 8 },
      h2: { type: 'int', min: 3, max: 24, step: 3 },
    },
    derived: {
      h: '3*e',
      answer: 'B*3*e',
      d_partialTotal: 'B*e',
      d_offByOneStep: '3*B*3*e',
      d_usedGivenValue: 'B*h2',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['A prism holds its base area times its height: ${{B}} \\times {{h}} = {{answer}}$ cubic cm.', 'The pyramid inside it would hold only a third of that, ${{d_partialTotal}}$.'],
  answerSummary: { headline: 'The prism is the plain base-times-height; the third belongs to the pyramid.', text: 'It holds ${{answer}}$ cubic cm.' },
  hint: 'The prism needs no dividing.',
  feedback: 'That is the prism around the second pyramid, not the first.',
});

mk('7.8A', 'expression-for-a-rectangular-pyramid', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'A rectangular pyramid has base $l$ by $w$ and height $h$. Which expression gives its volume?',
  generator: {
    parameters: {
      l: { type: 'int', min: 2, max: 12 },
      w: { type: 'int', min: 2, max: 12 },
      e: { type: 'int', min: 1, max: 6 },
    },
    derived: { h: '3*e', vol: 'l*w*e' },
    constraints: [],
  },
  choices: [
    { label: plain('\\frac{lwh}{3}'), correct: true },
    { label: plain('lwh'), error: 'partialTotal' },
    { label: plain('\\frac{lwh}{2}'), error: 'operationInverted' },
    { label: plain('3lwh'), error: 'ratioReversed' },
  ],
  reasoning: ['$lwh$ is what the surrounding prism holds.', 'With $l = {{l}}$, $w = {{w}}$ and $h = {{h}}$ the pyramid holds ${{vol}}$, a third of that.'],
  answerSummary: { headline: 'The pyramid formula is the prism formula divided by three.', text: 'It is $\\frac{lwh}{3}$.' },
  hint: 'Start from the prism that surrounds it.',
  feedback: 'Halving belongs to a triangle, not to a pyramid.',
});

mk('7.8A', 'halving-instead-of-thirding', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says a pyramid holds half of the prism around it. What is wrong?',
  generator: {
    parameters: {
      B: { type: 'int', min: 6, max: 40, step: 2 },
      e: { type: 'int', min: 2, max: 8 },
    },
    derived: {
      h: '3*e',
      prism: '3*B*e',
      right: 'B*e',
      claimed: '3*B*e/2',
    },
    constraints: [],
  },
  choices: [
    { label: 'It holds a third: ${{right}}$ of the prism total of ${{prism}}$, not ${{claimed}}$.', correct: true },
    { label: 'Nothing is wrong, because a pyramid comes to a point halfway up.', error: 'operationInverted' },
    { label: 'It holds a quarter, because the base narrows in both directions.', error: 'exponentError' },
    { label: 'It holds the same as the prism, because the base and height match.', error: 'partialTotal' },
  ],
  reasoning: ['Three identical pyramids, not two, fill the prism they share a base and height with.', 'So the share is ${{right}}$ out of ${{prism}}$.'],
  answerSummary: { headline: 'Three pyramids fill the prism, so the share is a third.', text: 'It holds ${{right}}$ cubic units.' },
  hint: 'How many would it take to fill the prism?',
  feedback: 'Coming to a point does not make the share a half.',
});

// ================================================================ 7.8B
// The same relationship with a triangular base, explained in symbols.

mk('7.8B', 'volume-of-a-triangular-prism', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'A triangular prism has an end triangle of base ${{b}}$ cm and height ${{ht}}$ cm, and is ${{L}}$ cm long. What is its volume?',
  generator: {
    parameters: {
      b: { type: 'int', min: 4, max: 12, step: 2 },
      ht: { type: 'int', min: 3, max: 9 },
      L: { type: 'int', min: 3, max: 9 },
    },
    derived: {
      end: 'b*ht/2',
      answer: 'b*ht*L/2',
      d_partialTotal: 'b*ht*L',
      d_operationInverted: 'b+ht+L',
      d_areaPerimeterSwap: 'b*ht+b*L+ht*L',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_areaPerimeterSwap}}'), error: 'areaPerimeterSwap' },
  ],
  reasoning: ['The end triangle covers ${{end}}$ square cm.', 'Carried ${{L}}$ cm along, that fills ${{answer}}$ cubic cm.'],
  answerSummary: { headline: 'A prism is its end face carried along its length.', text: 'It holds ${{answer}}$ cubic cm.' },
  hint: 'What area does the end face cover?',
  feedback: 'Leaving out the halving describes a box, not a triangular prism.',
});

mk('7.8B', 'expression-for-a-triangular-pyramid', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'A triangular pyramid has base area $B$ and height $h$. Which expression gives its volume?',
  generator: {
    parameters: {
      B: { type: 'int', min: 6, max: 40, step: 2 },
      e: { type: 'int', min: 1, max: 6 },
    },
    derived: { h: '3*e', vol: 'B*e', prism: '3*B*e' },
    constraints: [],
  },
  choices: [
    { label: plain('\\frac{Bh}{3}'), correct: true },
    { label: plain('Bh'), error: 'partialTotal' },
    { label: plain('\\frac{Bh}{2}'), error: 'operationInverted' },
    { label: plain('\\frac{Bh}{6}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['$B$ already accounts for the triangle, so no further halving is owed.', 'With $B = {{B}}$ and $h = {{h}}$ the prism holds ${{prism}}$ and the pyramid ${{vol}}$.'],
  answerSummary: { headline: 'Base area times height, divided by three.', text: 'It is $\\frac{Bh}{3}$.' },
  hint: 'Does $B$ already account for the triangle?',
  feedback: 'Halving twice would take the triangle into account a second time.',
});

mk('7.8B', 'what-three-pours-show', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'verbal',
  prompt: 'Three fillings of a triangular pyramid exactly fill a prism with the same base and height. What does that show?',
  generator: {
    parameters: {
      B: { type: 'int', min: 6, max: 40, step: 2 },
      e: { type: 'int', min: 2, max: 9 },
    },
    derived: { h: '3*e', pyramid: 'B*e', prism: '3*B*e', afterTwo: '2*B*e' },
    constraints: [],
  },
  choices: [
    { label: 'The pyramid holds a third of the prism, so its volume is $\\frac{Bh}{3}$.', correct: true },
    { label: 'The pyramid holds three times the prism, so its volume is $3Bh$.', error: 'ratioReversed' },
    { label: 'The two shapes hold the same, because their bases and heights match.', error: 'partialTotal' },
    { label: 'The pyramid holds a third of the base area, not of the volume.', error: 'operationInverted' },
  ],
  reasoning: ['Each pour adds ${{pyramid}}$, so after two the prism holds ${{afterTwo}}$ and one pour remains.', 'Three equal pours filling ${{prism}}$ means each is a third of it.'],
  answerSummary: { headline: 'The pouring result is the formula, stated physically.', text: 'The pyramid is a third: $\\frac{Bh}{3}$.' },
  hint: 'What does it mean that three fill one?',
  feedback: 'The prism is the larger of the two, not the smaller.',
});

mk('7.8B', 'extra-room-in-the-prism', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'Two triangular pyramids of the same height hold ${{p}}$ and ${{p2}}$ cubic cm. How much more than the first does its matching prism hold?',
  // Two independently drawn volumes: the spare room around the SECOND pyramid
  // crosses the key as the two are drawn, which a multiple of the first never
  // could.
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 60 },
      p2: { type: 'int', min: 2, max: 60 },
    },
    derived: {
      answer: '2*p',
      d_partialTotal: '3*p',
      d_usedGivenValue: '2*p2',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{p}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The prism holds three pyramids, or $3 \\times {{p}} = {{d_partialTotal}}$ cubic cm.', 'Beyond the pyramid itself that leaves ${{answer}}$ cubic cm spare.'],
  answerSummary: { headline: 'Three pyramids fill the prism, so two pyramids of room are spare.', text: 'It holds ${{answer}}$ cubic cm more.' },
  hint: 'The question asks for the gap, not the whole prism.',
  feedback: 'That is what the prism holds altogether.',
});

mk('7.8B', 'forgetting-the-triangle', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'For a triangular prism a student multiplies base by height by length and stops. What is wrong?',
  generator: {
    parameters: {
      b: { type: 'int', min: 4, max: 16, step: 2 },
      ht: { type: 'int', min: 3, max: 12 },
      L: { type: 'int', min: 3, max: 12 },
    },
    derived: {
      right: 'b*ht*L/2',
      wrong: 'b*ht*L',
      end: 'b*ht/2',
    },
    constraints: [],
  },
  choices: [
    { label: 'The end face is a triangle, so it covers ${{end}}$ and the volume is ${{right}}$.', correct: true },
    { label: 'Nothing is wrong, because all three measurements were used.', error: 'operationInverted' },
    { label: 'The result ${{wrong}}$ should be divided by three, not by two.', error: 'partialTotal' },
    { label: 'The length should not be used at all for a prism.', error: 'usedGivenValue' },
  ],
  reasoning: ['Multiplying base by height gives the rectangle the triangle sits inside.', 'The triangle covers half of it, so the volume is ${{right}}$, not ${{wrong}}$.'],
  answerSummary: { headline: 'The halving belongs to the triangular end, not to the prism.', text: 'The volume is ${{right}}$ cubic units.' },
  hint: 'What shape is the end face?',
  feedback: 'Dividing by three would turn the prism into a pyramid.',
});

// ================================================================ 7.8C
// Where the circle formulas come from.

mk('7.8C', 'what-the-wedges-make', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'verbal',
  prompt: 'A circle is cut into thin wedges and laid alternately into a near-rectangle. What are the sides of that rectangle?',
  generator: {
    parameters: { r: { type: 'int', min: 2, max: 20 } },
    derived: { d: '2*r', halfC: 'round(314*r/100)' },
    constraints: [],
  },
  choices: [
    { label: 'Half the way round, by the radius.', correct: true },
    { label: 'The whole way round, by the radius.', error: 'partialTotal' },
    { label: 'Half the way round, by the diameter.', error: 'diameterForRadius' },
    { label: 'The diameter, by the radius.', error: 'operationInverted' },
  ],
  reasoning: ['Half the wedges point up and half point down, so each long side takes half the edge: about ${{halfC}}$ for a radius of ${{r}}$.', 'The short side is one wedge tall, which is the radius.'],
  answerSummary: { headline: 'The wedges split the edge between the two long sides.', text: 'Half the circumference by the radius.' },
  hint: 'How much of the edge lies along each long side?',
  feedback: 'The whole edge is shared between top and bottom.',
});

mk('7.8C', 'area-from-the-near-rectangle', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'That near-rectangle has sides $\\pi r$ and $r$. What is its area?',
  generator: {
    parameters: { r: { type: 'int', min: 2, max: 20 } },
    derived: { rsq: 'r*r', twoR: '2*r', four: '4*r' },
    constraints: [],
  },
  choices: [
    { label: plain('\\pi r^2'), correct: true },
    { label: plain('2\\pi r'), error: 'partialTotal' },
    { label: plain('\\pi r'), error: 'operationInverted' },
    { label: plain('2\\pi r^2'), error: 'arithmeticSlip' },
  ],
  reasoning: ['A rectangle covers one side times the other.', '$\\pi r \\times r$ is $\\pi r^2$, and with $r = {{r}}$ that is ${{rsq}}\\pi$.'],
  answerSummary: { headline: 'The wedge rectangle gives the circle formula directly.', text: 'It is $\\pi r^2$.' },
  hint: 'Multiply the two sides together.',
  feedback: 'That expression measures a distance, not an area.',
});

mk('7.8C', 'area-of-a-disc', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'Two discs have radii ${{r}}$ and ${{r2}}$ cm. What area does the first cover?',
  generator: {
    parameters: {
      r: { type: 'int', min: 3, max: 20 },
      r2: { type: 'int', min: 3, max: 20 },
    },
    derived: { rsq: 'r*r', twoR: '2*r', dsq: '4*r*r', r2sq: 'r2*r2' },
    constraints: [],
  },
  choices: [
    { label: plain('{{rsq}}\\pi'), correct: true },
    { label: plain('{{twoR}}\\pi'), error: 'areaPerimeterSwap' },
    { label: plain('{{dsq}}\\pi'), error: 'diameterForRadius' },
    { label: plain('{{r2sq}}\\pi'), error: 'usedGivenValue' },
  ],
  reasoning: ['Area is $\\pi$ times the radius squared.', '${{r}} \\times {{r}} = {{rsq}}$, so the first disc covers ${{rsq}}\\pi$ square cm.'],
  answerSummary: { headline: 'Square the radius, then multiply by pi.', text: 'It covers ${{rsq}}\\pi$ square cm.' },
  hint: 'Which length gets squared?',
  feedback: 'That is the second disc.',
});

mk('7.8C', 'what-the-string-supports', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'context',
  prompt: 'A string laid round a can of diameter ${{d}}$ cm measures about ${{c}}$ cm. Which formula does that support?',
  generator: {
    parameters: { d: { type: 'int', min: 4, max: 40, step: 2 } },
    derived: { c: 'round(314*d/100)', r: 'd/2' },
    constraints: [],
  },
  choices: [
    { label: plain('C = \\pi d'), correct: true },
    { label: plain('C = \\pi r'), error: 'partialTotal' },
    { label: plain('C = 2\\pi d'), error: 'operationInverted' },
    { label: plain('C = \\pi d^2'), error: 'areaPerimeterSwap' },
  ],
  reasoning: ['${{c}}$ divided by ${{d}}$ comes to about $3.14$.', 'That is $\\pi$, so the way round is $\\pi$ times the diameter.'],
  answerSummary: { headline: 'The measured ratio is what the formula records.', text: 'It supports $C = \\pi d$.' },
  hint: 'Divide the string length by the diameter.',
  feedback: 'Using the radius would make the ratio about $6.28$.',
});

mk('7.8C', 'diameter-in-the-area-formula', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student puts the diameter into $\\pi r^2$. What is wrong?',
  generator: {
    parameters: { r: { type: 'int', min: 2, max: 20 } },
    derived: { d: '2*r', rsq: 'r*r', dsq: '4*r*r' },
    constraints: [],
  },
  choices: [
    { label: 'The diameter is twice the radius, so the answer comes out four times too large.', correct: true },
    { label: 'Nothing is wrong, because both measure across the circle.', error: 'operationInverted' },
    { label: 'The answer comes out twice too large, because the diameter is doubled.', error: 'partialTotal' },
    { label: 'The formula should use the diameter, and the radius is the mistake.', error: 'ratioReversed' },
  ],
  reasoning: ['With a radius of ${{r}}$ the area is ${{rsq}}\\pi$.', 'Using the diameter ${{d}}$ gives ${{dsq}}\\pi$, four times as much, because the doubling is squared.'],
  answerSummary: { headline: 'A squared term doubles twice over.', text: 'The result is four times too large.' },
  hint: 'What does squaring do to a doubled length?',
  feedback: 'The error is squared, so it is worse than a factor of two.',
});


// ================================================================ 7.9A
// Volumes of prisms and pyramids in use.

mk('7.9A', 'volume-of-a-crate', {
  courseId: 'grade7',
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'context',
  prompt: 'A crate measures ${{l}}$ by ${{w}}$ by ${{h}}$ cm. What is its volume?',
  generator: {
    parameters: {
      l: { type: 'int', min: 3, max: 11 },
      w: { type: 'int', min: 3, max: 11 },
      h: { type: 'int', min: 3, max: 11 },
    },
    derived: {
      answer: 'l*w*h',
      d_offByOneStep: 'l*w*h+l*w',
      d_operationInverted: 'l+w+h',
      d_areaPerimeterSwap: '2*(l*w+l*h+w*h)',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_areaPerimeterSwap}}'), error: 'areaPerimeterSwap' },
  ],
  reasoning: ['One layer covers ${{l}} \\times {{w}}$ square cm.', 'Stacked ${{h}}$ deep that fills ${{answer}}$ cubic cm.'],
  answerSummary: { headline: 'Volume multiplies all three measurements.', text: 'It holds ${{answer}}$ cubic cm.' },
  hint: 'What does one layer cover?',
  feedback: 'Adding the three edges measures none of the box.',
});

mk('7.9A', 'length-of-a-triangular-prism', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A triangular prism holds ${{V}}$ cubic cm and its end face covers ${{B}}$ square cm. How long is it?',
  generator: {
    parameters: {
      // B is a second measurement of the same prism, drawn separately, so it
      // crosses the length rather than dividing it.
      B: { type: 'int', min: 4, max: 24 },
      e: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      L: '2*e',
      V: 'B*2*e',
      answer: 'L',
      d_forgotFinalStep: 'V',
      d_partialTotal: 'e',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{B}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Each centimetre of length adds another ${{B}}$ cubic cm.', '${{V}} \\div {{B}} = {{answer}}$ cm.'],
  answerSummary: { headline: 'Volume divided by the end face gives the length.', text: 'It is ${{answer}}$ cm long.' },
  hint: 'What does one centimetre of length contribute?',
  feedback: 'The whole volume is not a length.',
});

mk('7.9A', 'two-containers-together', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 2, taskType: 'interpretation', representation: 'table',
  prompt: 'The table lists two crates. How much do they hold together?',
  stimulus: {
    kind: 'table',
    title: 'Crate sizes (cm)',
    table: {
      headers: ['crate', 'length', 'width', 'height'],
      rows: [['first', '{{l1}}', '{{w1}}', '{{h1}}'], ['second', '{{l2}}', '{{w2}}', '{{h2}}']],
    },
  },
  generator: {
    parameters: {
      l1: { type: 'int', min: 3, max: 10 }, w1: { type: 'int', min: 3, max: 10 }, h1: { type: 'int', min: 3, max: 10 },
      l2: { type: 'int', min: 3, max: 10 }, w2: { type: 'int', min: 3, max: 10 }, h2: { type: 'int', min: 3, max: 10 },
    },
    derived: {
      answer: 'l1*w1*h1+l2*w2*h2',
      d_operationInverted: '(l1+l2)*(w1+w2)*(h1+h2)',
      d_partialTotal: 'l1*w1*h1',
      d_arithmeticSlip: 'l1*w1*h2+l2*w2*h1',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['The first crate holds ${{d_partialTotal}}$ cubic cm.', 'Adding the second brings the total to ${{answer}}$.'],
  answerSummary: { headline: 'Work out each crate on its own, then add.', text: 'Together they hold ${{answer}}$ cubic cm.' },
  hint: 'Each crate has its own three measurements.',
  feedback: 'Each height belongs with its own crate.',
});

mk('7.9A', 'volume-of-a-rectangular-pyramid', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'A pyramid has a rectangular base ${{l}}$ by ${{w}}$ cm and a height of ${{h}}$ cm. What is its volume?',
  generator: {
    parameters: {
      l: { type: 'int', min: 6, max: 30 },
      w: { type: 'int', min: 6, max: 30 },
      e: { type: 'int', min: 2, max: 18 },
    },
    derived: {
      h: '3*e',
      answer: 'l*w*e',
      d_partialTotal: 'l*w*3*e',
      d_operationInverted: 'l+w+e',
      d_areaPerimeterSwap: '2*(l*w+l*3*e+w*3*e)',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_areaPerimeterSwap}}'), error: 'areaPerimeterSwap' },
  ],
  reasoning: ['The prism around it would hold ${{d_partialTotal}}$ cubic cm.', 'A pyramid holds a third of that: ${{answer}}$.'],
  answerSummary: { headline: 'Base area times height, then a third.', text: 'It holds ${{answer}}$ cubic cm.' },
  hint: 'What would the surrounding prism hold?',
  feedback: 'That is the prism, not the pyramid.',
});

mk('7.9A', 'doubling-every-edge', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student doubles every edge of a crate and says the volume doubles. What is wrong?',
  generator: {
    parameters: {
      l: { type: 'int', min: 3, max: 10 },
      w: { type: 'int', min: 3, max: 10 },
      h: { type: 'int', min: 3, max: 10 },
    },
    derived: {
      vol: 'l*w*h',
      doubled: '2*l*w*h',
      real: '8*l*w*h',
    },
    constraints: [],
  },
  choices: [
    { label: 'All three directions double, so the volume reaches ${{real}}$, not ${{doubled}}$.', correct: true },
    { label: 'Nothing is wrong, because every edge was doubled.', error: 'operationInverted' },
    { label: 'The volume quadruples to four times ${{vol}}$, one doubling for each face.', error: 'partialTotal' },
    { label: 'The volume stays at ${{vol}}$, because the shape is unchanged.', error: 'usedGivenValue' },
  ],
  reasoning: ['The crate holds ${{vol}}$ cubic cm to begin with.', 'Doubling all three edges multiplies the volume by $2 \\times 2 \\times 2$, giving ${{real}}$.'],
  answerSummary: { headline: 'A length factor acts once in every direction.', text: 'The volume reaches ${{real}}$.' },
  hint: 'How many directions does the doubling act in?',
  feedback: 'A box has three directions, not two.',
});

// ================================================================ 7.9B
// Circumference and area of circles.

mk('7.9B', 'circumference-from-a-radius', {
  courseId: 'grade7',
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Two circles have radii ${{r}}$ and ${{r2}}$ cm. What is the circumference of the first?',
  generator: {
    parameters: {
      r: { type: 'int', min: 3, max: 20 },
      r2: { type: 'int', min: 3, max: 20 },
    },
    derived: { twoR: '2*r', rsq: 'r*r', twoR2: '2*r2' },
    constraints: [],
  },
  choices: [
    { label: plain('{{twoR}}\\pi'), correct: true },
    { label: plain('{{r}}\\pi'), error: 'partialTotal' },
    { label: plain('{{rsq}}\\pi'), error: 'areaPerimeterSwap' },
    { label: plain('{{twoR2}}\\pi'), error: 'usedGivenValue' },
  ],
  reasoning: ['The way round is $\\pi$ times the diameter, and the first diameter is ${{twoR}}$ cm.', 'So the circumference is ${{twoR}}\\pi$ cm.'],
  answerSummary: { headline: 'Circumference uses the diameter, so a radius must be doubled first.', text: 'It is ${{twoR}}\\pi$ cm.' },
  hint: 'Which length does $\\pi$ multiply?',
  feedback: 'That belongs to the second circle.',
});

mk('7.9B', 'area-from-a-diameter', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'Two discs have diameters ${{d}}$ and ${{d2}}$ cm. What area does the first cover?',
  generator: {
    parameters: {
      d: { type: 'int', min: 6, max: 40, step: 2 },
      d2: { type: 'int', min: 6, max: 40, step: 2 },
    },
    derived: { r: 'd/2', rsq: 'd*d/4', dsq: 'd*d', r2sq: 'd2*d2/4' },
    constraints: [],
  },
  choices: [
    { label: plain('{{rsq}}\\pi'), correct: true },
    { label: plain('{{dsq}}\\pi'), error: 'diameterForRadius' },
    { label: plain('{{r}}\\pi'), error: 'partialTotal' },
    { label: plain('{{r2sq}}\\pi'), error: 'usedGivenValue' },
  ],
  reasoning: ['The first radius is half of ${{d}}$, which is ${{r}}$ cm.', 'Area is $\\pi$ times the radius squared, or ${{rsq}}\\pi$ square cm.'],
  answerSummary: { headline: 'Halve the diameter before squaring.', text: 'It covers ${{rsq}}\\pi$ square cm.' },
  hint: 'Which length does the area formula square?',
  feedback: 'That is the second disc.',
});

mk('7.9B', 'circumference-with-a-fraction-for-pi', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'Taking $\\pi$ as $\\frac{22}{7}$, two pipes have diameters ${{d}}$ and ${{d2}}$ cm. What is the first one round?',
  generator: {
    parameters: {
      // The second pipe's circumference is the crossing distractor: a separate
      // draw, not a multiple of the key.
      k: { type: 'int', min: 1, max: 9 },
      k2: { type: 'int', min: 1, max: 9 },
    },
    derived: {
      d: '7*k', d2: '7*k2',
      answer: '22*k',
      d_operationInverted: '44*k',
      d_partialTotal: '11*k',
      d_usedGivenValue: '22*k2',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The way round is $\\frac{22}{7}$ times ${{d}}$.', '${{d}} \\div 7 = {{k}}$, and ${{k}} \\times 22 = {{answer}}$ cm.'],
  answerSummary: { headline: 'Cancel the seven before multiplying by twenty-two.', text: 'It is ${{answer}}$ cm round.' },
  hint: 'Does seven divide the diameter?',
  feedback: 'That is the second pipe, not the first.',
});

mk('7.9B', 'what-doubling-the-radius-does', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'verbal',
  prompt: 'A circle of radius ${{r}}$ cm has its radius doubled. What happens to its area and its circumference?',
  generator: {
    parameters: { r: { type: 'int', min: 3, max: 20 } },
    derived: { rsq: 'r*r', bigArea: '4*r*r', twoR: '2*r', bigC: '4*r' },
    constraints: [],
  },
  choices: [
    { label: 'The area quadruples and the circumference doubles.', correct: true },
    { label: 'Both of them double.', error: 'partialTotal' },
    { label: 'Both of them quadruple.', error: 'operationInverted' },
    { label: 'The area doubles and the circumference quadruples.', error: 'ratioReversed' },
  ],
  reasoning: ['The area moves from ${{rsq}}\\pi$ to ${{bigArea}}\\pi$, because the radius is squared.', 'The circumference moves from ${{twoR}}\\pi$ to ${{bigC}}\\pi$, because the radius appears once.'],
  answerSummary: { headline: 'A squared radius feels a doubling twice; a plain radius feels it once.', text: 'Area quadruples, circumference doubles.' },
  hint: 'How many times does the radius appear in each formula?',
  feedback: 'Only one of the two formulas squares the radius.',
});

mk('7.9B', 'circumference-formula-used-for-area', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student gives the area of a circle of radius ${{r}}$ cm as ${{twoR}}\\pi$. What is wrong?',
  generator: {
    parameters: { r: { type: 'int', min: 3, max: 20 } },
    derived: { twoR: '2*r', rsq: 'r*r' },
    constraints: [],
  },
  choices: [
    { label: 'That is the way round; the area is ${{rsq}}\\pi$ square cm.', correct: true },
    { label: 'Nothing is wrong, because both formulas use $\\pi$ and the radius.', error: 'operationInverted' },
    { label: 'The area is ${{twoR}}\\pi$ but the unit should be cubic cm.', error: 'usedGivenValue' },
    { label: 'The radius should have been halved first, giving half of ${{twoR}}\\pi$.', error: 'diameterForRadius' },
  ],
  reasoning: ['$2\\pi r$ measures a distance round the edge, not a region.', 'Area squares the radius: ${{r}} \\times {{r}} = {{rsq}}$, so it is ${{rsq}}\\pi$ square cm.'],
  answerSummary: { headline: 'One formula measures an edge, the other a region.', text: 'The area is ${{rsq}}\\pi$ square cm.' },
  hint: 'Which of the two formulas squares the radius?',
  feedback: 'Sharing the same letters does not make two formulas interchangeable.',
});

// ================================================================ 7.9C
// Areas of composite figures.

mk('7.9C', 'rectangle-with-a-triangle-on-top', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'A plate is a rectangle ${{a}}$ by ${{b}}$ cm with a triangle of base ${{a}}$ cm and height ${{t}}$ cm on top. What area does it cover?',
  generator: {
    parameters: {
      // a and b share a range: the crossing distractor takes the triangle over
      // the wrong base, which lands either side depending on which is larger.
      a: { type: 'int', min: 3, max: 15 },
      b: { type: 'int', min: 3, max: 15 },
      half: { type: 'int', min: 2, max: 8 },
    },
    derived: {
      t: '2*half',
      answer: 'a*b+a*half',
      d_partialTotal: 'a*b+a*t',
      d_forgotFinalStep: 'a*b',
      d_arithmeticSlip: 'a*b+b*half',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['The rectangle covers ${{d_forgotFinalStep}}$ square cm.', 'The triangle adds half of ${{a}} \\times {{t}}$, bringing the total to ${{answer}}$.'],
  answerSummary: { headline: 'Split the shape, work out each part, then add.', text: 'It covers ${{answer}}$ square cm.' },
  hint: 'Deal with the rectangle and the triangle separately.',
  feedback: 'The triangle sits on the ${{a}} $ cm edge, not the other one.',
});

mk('7.9C', 'square-with-a-quarter-circle-removed', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A square of side ${{s}}$ cm has a quarter circle of radius ${{s}}$ cm cut from one corner. What is left?',
  generator: {
    parameters: { s: { type: 'int', min: 3, max: 20 } },
    derived: { ssq: 's*s', half: 's*s/2' },
    constraints: [],
  },
  choices: [
    { label: plain('{{ssq}} - \\frac{{{ssq}}\\pi}{4}'), correct: true },
    { label: plain('{{ssq}} - {{ssq}}\\pi'), error: 'operationInverted' },
    { label: plain('{{ssq}} - \\frac{{{ssq}}\\pi}{2}'), error: 'partialTotal' },
    { label: plain('\\frac{{{ssq}}\\pi}{4}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['A full circle of radius ${{s}}$ covers ${{ssq}}\\pi$, so a quarter of it covers $\\frac{{{ssq}}\\pi}{4}$.', 'Taking that from the square leaves ${{ssq}} - \\frac{{{ssq}}\\pi}{4}$ square cm.'],
  answerSummary: { headline: 'Work out the piece removed, then subtract it.', text: 'It is ${{ssq}} - \\frac{{{ssq}}\\pi}{4}$ square cm.' },
  hint: 'What fraction of a circle is being cut away?',
  feedback: 'That is the piece removed, not what remains.',
});

mk('7.9C', 'rectangle-with-a-notch-cut-out', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'table',
  prompt: 'The notch is cut out of the first sheet. What area is left on it?',
  // The crossing distractor is the SECOND sheet, drawn independently. Every
  // error built from the first sheet and its notch lands on a fixed side of
  // the key: forgetting to subtract is always above, subtracting twice or
  // shrinking both dimensions always below.
  stimulus: {
    kind: 'table',
    title: 'Measurements (cm)',
    table: {
      headers: ['piece', 'length', 'width'],
      rows: [['first sheet', '{{a}}', '{{b}}'], ['notch', '{{c}}', '{{d}}'], ['second sheet', '{{a2}}', '{{b2}}']],
    },
  },
  generator: {
    parameters: {
      c: { type: 'int', min: 2, max: 9 },
      d: { type: 'int', min: 2, max: 9 },
      gapL: { type: 'int', min: 2, max: 12 },
      gapW: { type: 'int', min: 2, max: 12 },
      a2: { type: 'int', min: 4, max: 21 },
      b2: { type: 'int', min: 4, max: 21 },
    },
    derived: {
      a: 'c+gapL', b: 'd+gapW',
      answer: 'a*b-c*d',
      d_forgotFinalStep: 'a*b',
      d_offByOneStep: 'a*b-2*c*d',
      d_usedGivenValue: 'a2*b2',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The first sheet covers ${{d_forgotFinalStep}}$ square cm and the notch ${{c}} \\times {{d}}$.', 'Taking one from the other leaves ${{answer}}$.'],
  answerSummary: { headline: 'Subtract the piece removed from the whole.', text: '${{answer}}$ square cm are left.' },
  hint: 'Work out the first sheet before the notch.',
  feedback: 'That is the second sheet, which has no notch cut from it.',
});

mk('7.9C', 'semicircle-on-a-rectangle', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'symbolic',
  prompt: 'A window is a rectangle ${{a}}$ by ${{b}}$ cm topped by a semicircle of diameter ${{a}}$ cm. Which expression gives its area?',
  generator: {
    parameters: {
      a: { type: 'int', min: 4, max: 20, step: 2 },
      b: { type: 'int', min: 3, max: 20 },
    },
    derived: { ab: 'a*b', asq: 'a*a' },
    constraints: [],
  },
  choices: [
    { label: plain('{{ab}} + \\frac{{{asq}}\\pi}{8}'), correct: true },
    { label: plain('{{ab}} + \\frac{{{asq}}\\pi}{4}'), error: 'diameterForRadius' },
    { label: plain('{{ab}} + \\frac{{{asq}}\\pi}{2}'), error: 'partialTotal' },
    { label: plain('{{ab}} + {{asq}}\\pi'), error: 'operationInverted' },
  ],
  reasoning: ['The semicircle has radius $\\frac{{{a}}}{2}$, so a full circle would cover $\\frac{{{asq}}\\pi}{4}$.', 'Half of that is $\\frac{{{asq}}\\pi}{8}$, on top of the ${{ab}}$ the rectangle covers.'],
  answerSummary: { headline: 'Halve the diameter for the radius, then halve the circle.', text: 'It is ${{ab}} + \\frac{{{asq}}\\pi}{8}$.' },
  hint: 'Two halvings are owed, not one.',
  feedback: 'Using the diameter as the radius makes the top four times too big.',
});

mk('7.9C', 'adding-perimeters-instead-of-areas', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'To find a composite area a student adds the perimeters of the two shapes. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 15 },
      b: { type: 'int', min: 3, max: 15 },
    },
    derived: { area: 'a*b', perim: '2*a+2*b' },
    constraints: [],
  },
  choices: [
    { label: 'A perimeter is a distance, so adding two of them cannot give an area.', correct: true },
    { label: 'Nothing is wrong, as long as the shared edge is counted once.', error: 'operationInverted' },
    { label: 'The perimeters should be multiplied together instead of added.', error: 'areaPerimeterSwap' },
    { label: 'The perimeters are right but should then be halved.', error: 'partialTotal' },
  ],
  reasoning: ['An ${{a}}$ by ${{b}}$ rectangle has a perimeter of ${{perim}}$ cm and an area of ${{area}}$ square cm.', 'The two measure different things, so no arrangement of perimeters produces an area.'],
  answerSummary: { headline: 'Distance round and region covered are different measurements.', text: 'Areas must be added, not perimeters.' },
  hint: 'What units does each measurement carry?',
  feedback: 'Multiplying two distances gives an area, but not the right one.',
});

// ================================================================ 7.9D
// Surface area from a net.

mk('7.9D', 'total-surface-of-a-box', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'A box measures ${{l}}$ by ${{w}}$ by ${{h}}$ cm. What is its total surface area?',
  generator: {
    parameters: {
      l: { type: 'int', min: 2, max: 13 },
      w: { type: 'int', min: 2, max: 13 },
      h: { type: 'int', min: 2, max: 13 },
    },
    derived: {
      faces: 'l*w+l*h+w*h',
      answer: '2*(l*w+l*h+w*h)',
      d_partialTotal: 'l*w+l*h+w*h',
      d_operationInverted: '4*(l*w+l*h+w*h)',
      d_areaPerimeterSwap: 'l*w*h',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_areaPerimeterSwap}}'), error: 'areaPerimeterSwap' },
  ],
  reasoning: ['The net has three different rectangles, covering ${{faces}}$ square cm between them.', 'Each appears twice, so the surface is ${{answer}}$ square cm.'],
  answerSummary: { headline: 'Three distinct faces, each of them twice over.', text: 'It is ${{answer}}$ square cm.' },
  hint: 'How many faces does the net have, and how do they pair?',
  feedback: 'Filling the box is a volume, not a surface.',
});

mk('7.9D', 'lateral-surface-of-a-box', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A box ${{l}}$ by ${{w}}$ cm at the base stands ${{h}}$ cm tall. What is its lateral surface area?',
  generator: {
    parameters: {
      l: { type: 'int', min: 2, max: 7 },
      w: { type: 'int', min: 2, max: 7 },
      h: { type: 'int', min: 2, max: 7 },
    },
    derived: {
      answer: '2*(l+w)*h',
      d_partialTotal: '2*(l*w+l*h+w*h)',
      d_forgotFinalStep: '(l+w)*h',
      d_areaPerimeterSwap: 'l*w*h',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_areaPerimeterSwap}}'), error: 'areaPerimeterSwap' },
  ],
  reasoning: ['Lateral surface leaves out the top and the bottom.', 'The four walls wrap a distance of $2({{l}} + {{w}})$ round, ${{h}}$ cm high: ${{answer}}$ square cm.'],
  answerSummary: { headline: 'Lateral surface is the way round the base times the height.', text: 'It is ${{answer}}$ square cm.' },
  hint: 'Which faces does lateral surface leave out?',
  feedback: 'That total includes the top and the bottom.',
});

mk('7.9D', 'what-the-net-of-a-box-holds', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'verbal',
  prompt: 'A net of a rectangular prism is laid flat. What does it show?',
  generator: {
    parameters: {
      l: { type: 'int', min: 2, max: 10 },
      w: { type: 'int', min: 2, max: 10 },
      h: { type: 'int', min: 2, max: 10 },
    },
    derived: { faces: 'l*w+l*h+w*h', total: '2*(l*w+l*h+w*h)' },
    constraints: [],
  },
  choices: [
    { label: 'Six rectangles in three matching pairs, covering ${{total}}$ square cm.', correct: true },
    { label: 'Six rectangles all the same size, covering ${{total}}$ square cm.', error: 'partialTotal' },
    { label: 'Three rectangles in all, covering ${{faces}}$ square cm.', error: 'forgotFinalStep' },
    { label: 'Four rectangles and two squares, whatever the measurements.', error: 'operationInverted' },
  ],
  reasoning: ['Opposite faces of a box match, so the six rectangles form three pairs.', 'Between them they cover ${{total}}$ square cm.'],
  answerSummary: { headline: 'A box net is three pairs of matching rectangles.', text: 'Six faces, three pairs, ${{total}}$ square cm.' },
  hint: 'Which faces of a box are the same as each other?',
  feedback: 'All six would only match on a cube.',
});

mk('7.9D', 'surface-of-a-square-pyramid', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'A square pyramid has base side $s$ and slant height $l$. Which expression gives its total surface area?',
  generator: {
    parameters: {
      s: { type: 'int', min: 2, max: 12 },
      l: { type: 'int', min: 3, max: 15 },
    },
    derived: { base: 's*s', sides: '2*s*l', total: 's*s+2*s*l' },
    constraints: [],
  },
  choices: [
    { label: plain('s^2 + 2sl'), correct: true },
    { label: plain('s^2 + 4sl'), error: 'operationInverted' },
    { label: plain('s^2 + \\frac{sl}{2}'), error: 'partialTotal' },
    { label: plain('4sl'), error: 'forgotFinalStep' },
  ],
  reasoning: ['The base covers $s^2$, which is ${{base}}$ when $s = {{s}}$.', 'Each of the four triangles covers $\\frac{sl}{2}$, so together they cover $2sl$, or ${{sides}}$.'],
  answerSummary: { headline: 'A square base and four triangles that pair into two rectangles.', text: 'It is $s^2 + 2sl$.' },
  hint: 'How many triangles, and what does each cover?',
  feedback: 'Four triangles come to $2sl$, because each is already halved.',
});

mk('7.9D', 'doubling-the-lateral-surface', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student finds the lateral surface of a box as the base perimeter times the height, then doubles it. What is wrong?',
  generator: {
    parameters: {
      l: { type: 'int', min: 2, max: 10 },
      w: { type: 'int', min: 2, max: 10 },
      h: { type: 'int', min: 2, max: 10 },
    },
    derived: {
      right: '2*(l+w)*h',
      wrong: '4*(l+w)*h',
      perim: '2*l+2*w',
    },
    constraints: [],
  },
  choices: [
    { label: 'The perimeter of ${{perim}}$ already goes right round, so the answer is ${{right}}$, not ${{wrong}}$.', correct: true },
    { label: 'Nothing is wrong, because a box has two pairs of walls.', error: 'operationInverted' },
    { label: 'The doubling is right but the top and bottom are still missing.', error: 'partialTotal' },
    { label: 'The height should have been doubled instead of the product.', error: 'arithmeticSlip' },
  ],
  reasoning: ['Going once round the base already passes all four walls.', 'Doubling counts every wall twice: ${{wrong}}$ instead of ${{right}}$ square cm.'],
  answerSummary: { headline: 'One trip round the base covers every wall exactly once.', text: 'It is ${{right}}$ square cm.' },
  hint: 'How many walls does one lap of the base pass?',
  feedback: 'The two pairs of walls are already inside the perimeter.',
});

// ================================================================ 7.10A
// Writing the two-step equation or inequality a problem sets up.

mk('7.10A', 'equation-for-a-fee-plus-a-rate', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'context',
  prompt: 'A hire costs $\\${{b}}$ plus $\\${{m}}$ a day. Which equation gives the days $x$ for a total of $\\${{t}}$?',
  generator: {
    parameters: {
      b: { type: 'int', min: 10, max: 90, step: 5 },
      m: { type: 'int', min: 5, max: 40, step: 5 },
      x: { type: 'int', min: 2, max: 12 },
    },
    // The daily part is named in the explanation, and deriving it also keeps
    // this family's relation graph distinct from the abstract phrase family,
    // which otherwise builds its total exactly the same way.
    derived: { t: 'm*x+b', daily: 'm*x' },
    constraints: ['m!=b'],
  },
  choices: [
    { label: plain('{{m}}x + {{b}} = {{t}}'), correct: true },
    { label: plain('{{b}}x + {{m}} = {{t}}'), error: 'ratioReversed' },
    { label: plain('{{m}}x = {{t}}'), error: 'partialTotal' },
    { label: plain('{{m}} + {{b}} + x = {{t}}'), error: 'operationInverted' },
  ],
  reasoning: ['Each day adds $\\${{m}}$, so ${{x}}$ days would add $\\${{daily}}$.', 'The fixed $\\${{b}}$ is paid once on top of whatever the days come to.'],
  answerSummary: { headline: 'The rate multiplies the days; the fee is added once.', text: 'It is ${{m}}x + {{b}} = {{t}}$.' },
  hint: 'Which of the two charges depends on the days?',
  feedback: 'The fee does not grow with the number of days.',
});

mk('7.10A', 'inequality-for-a-budget', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'A budget of $\\${{t}}$ must cover a $\\${{b}}$ fee plus $\\${{m}}$ a day. Which inequality must the days $x$ satisfy?',
  generator: {
    parameters: {
      b: { type: 'int', min: 10, max: 90, step: 5 },
      m: { type: 'int', min: 5, max: 40, step: 5 },
      x: { type: 'int', min: 2, max: 12 },
    },
    derived: { t: 'm*x+b', room: 'm*x' },
    constraints: [],
  },
  choices: [
    { label: plain('{{m}}x + {{b}} \\le {{t}}'), correct: true },
    { label: plain('{{m}}x + {{b}} \\ge {{t}}'), error: 'ratioReversed' },
    { label: plain('{{m}}x \\le {{t}}'), error: 'partialTotal' },
    { label: plain('{{m}}x + {{b}} < {{t}}'), error: 'offByOneStep' },
  ],
  reasoning: ['The spend is ${{m}}x + {{b}}$, and it may reach the budget but not pass it.', 'Spending exactly $\\${{t}}$ is allowed, so the bar under the sign stays.'],
  answerSummary: { headline: 'A budget is a ceiling the spend may touch.', text: 'It is ${{m}}x + {{b}} \\le {{t}}$.' },
  hint: 'May the budget be spent exactly?',
  feedback: 'A strict inequality would forbid spending the budget in full.',
});

mk('7.10A', 'equation-from-a-perimeter', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A rectangle has perimeter ${{P}}$ cm and width ${{w}}$ cm. Which equation gives its length $x$?',
  generator: {
    parameters: {
      w: { type: 'int', min: 3, max: 20 },
      x: { type: 'int', min: 3, max: 20 },
    },
    derived: { twoW: '2*w', P: '2*w+2*x' },
    constraints: [],
  },
  choices: [
    { label: plain('2x + {{twoW}} = {{P}}'), correct: true },
    { label: plain('x + {{w}} = {{P}}'), error: 'partialTotal' },
    { label: plain('2x + {{w}} = {{P}}'), error: 'arithmeticSlip' },
    { label: plain('{{twoW}}x = {{P}}'), error: 'operationInverted' },
  ],
  reasoning: ['A rectangle has two lengths and two widths.', 'Two widths come to ${{twoW}}$, so the two lengths must make up the rest of ${{P}}$.'],
  answerSummary: { headline: 'Every side appears twice in a perimeter.', text: 'It is $2x + {{twoW}} = {{P}}$.' },
  hint: 'How many of each side does the perimeter pass?',
  feedback: 'One length and one width cover only half the way round.',
});

mk('7.10A', 'equation-for-a-two-step-phrase', {
  courseId: 'grade7',
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'symbolic',
  prompt: '${{c}}$ more than ${{m}}$ times a number is ${{t}}$. Which equation says that?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      c: { type: 'int', min: 2, max: 30 },
      x: { type: 'int', min: 2, max: 20 },
    },
    derived: { t: 'm*x+c' },
    constraints: ['m!=c'],
  },
  choices: [
    { label: plain('{{m}}x + {{c}} = {{t}}'), correct: true },
    { label: plain('{{m}}(x + {{c}}) = {{t}}'), error: 'orderOfOperations' },
    { label: plain('{{m}}x - {{c}} = {{t}}'), error: 'signError' },
    { label: plain('{{c}}x + {{m}} = {{t}}'), error: 'ratioReversed' },
  ],
  reasoning: ['The number is multiplied by ${{m}}$ first.', 'Then ${{c}}$ is added to that product, giving ${{t}}$.'],
  answerSummary: { headline: 'Write the operations in the order the sentence applies them.', text: 'It is ${{m}}x + {{c}} = {{t}}$.' },
  hint: 'Which happens first, the multiplying or the adding?',
  feedback: 'A bracket would add before multiplying, which reverses the order.',
});

mk('7.10A', 'bracket-that-changes-the-order', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'For "${{m}}$ times a number, then add ${{c}}$" a student writes ${{m}}(x + {{c}})$. What is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      c: { type: 'int', min: 2, max: 30 },
      v: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      right: 'm*v+c',
      wrong: 'm*(v+c)',
      mc: 'm*c',
    },
    constraints: [],
  },
  choices: [
    { label: 'The bracket adds first, so it should read ${{m}}x + {{c}}$.', correct: true },
    { label: 'Nothing is wrong, because both multiply and both add.', error: 'operationInverted' },
    { label: 'The bracket is right but ${{c}}$ should be outside it as well.', error: 'partialTotal' },
    { label: 'The two are equal, since multiplying out gives ${{m}}x + {{c}}$.', error: 'orderOfOperations' },
  ],
  reasoning: ['At $x = {{v}}$ the sentence gives ${{right}}$ and the bracket gives ${{wrong}}$.', 'Multiplying out the bracket produces ${{m}}x + {{mc}}$, not ${{m}}x + {{c}}$.'],
  answerSummary: { headline: 'A bracket performs the addition before the multiplication.', text: 'It should be ${{m}}x + {{c}}$.' },
  hint: 'Try a value of $x$ in both.',
  feedback: 'Multiplying out the bracket scales the constant too.',
});


// ================================================================ 7.10B
// Two-step solutions drawn on a number line.

mk('7.10B', 'graph-of-a-two-step-solution', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'numberLine',
  prompt: 'The solution of ${{m}}x + {{b}} = {{t}}$ is drawn on a number line. Which description fits?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 3, max: 30 },
      v: { type: 'int', min: 2, max: 20 },
    },
    derived: { t: 'm*v+b', stripped: 'm*v', shifted: 'v+b' },
    constraints: ['stripped!=shifted', 'stripped!=v', 'shifted!=v'],
  },
  choices: [
    { label: 'One closed dot at ${{v}}$, with nothing shaded.', correct: true },
    { label: 'One closed dot at ${{stripped}}$, with nothing shaded.', error: 'forgotFinalStep' },
    { label: 'A closed dot at ${{v}}$ with an arrow to the right.', error: 'operationInverted' },
    { label: 'One closed dot at ${{shifted}}$, with nothing shaded.', error: 'orderOfOperations' },
  ],
  reasoning: ['Taking ${{b}}$ off leaves ${{stripped}}$, and dividing by ${{m}}$ gives ${{v}}$.', 'An equation is satisfied by that one value, so nothing beyond it is shaded.'],
  answerSummary: { headline: 'An equation marks a point; an inequality shades a stretch.', text: 'One closed dot at ${{v}}$.' },
  hint: 'How many values make the equation true?',
  feedback: 'The subtraction has been done but not the division.',
});

mk('7.10B', 'endpoint-of-a-two-step-inequality', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'numberLine',
  prompt: 'How is the solution of ${{m}}x + {{b}} > {{t}}$ drawn?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 3, max: 30 },
      v: { type: 'int', min: 2, max: 20 },
    },
    derived: { t: 'm*v+b', above: 'v+1' },
    constraints: [],
  },
  choices: [
    { label: 'An open dot at ${{v}}$, with the arrow to the right.', correct: true },
    { label: 'A closed dot at ${{v}}$, with the arrow to the right.', error: 'offByOneStep' },
    { label: 'An open dot at ${{v}}$, with the arrow to the left.', error: 'ratioReversed' },
    { label: 'An open dot at ${{above}}$, with the arrow to the right.', error: 'arithmeticSlip' },
  ],
  reasoning: ['Undoing both steps leaves $x > {{v}}$.', 'Strictly greater excludes ${{v}}$ itself, so the endpoint is hollow and the arrow runs right.'],
  answerSummary: { headline: 'A strict inequality leaves its own boundary out.', text: 'An open dot at ${{v}}$, arrow right.' },
  hint: 'Does ${{v}}$ itself satisfy the inequality?',
  feedback: 'A filled dot would include a value that fails it.',
});

mk('7.10B', 'where-the-single-dot-sits', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Solving ${{m}}x - {{b}} = {{t}}$ puts one dot on the line. At what value?',
  generator: {
    parameters: {
      // m and v share a range so the coefficient crosses the solution.
      m: { type: 'int', min: 2, max: 14 },
      v: { type: 'int', min: 2, max: 14 },
      b: { type: 'int', min: 3, max: 30 },
    },
    derived: {
      t: 'm*v-b',
      answer: 'v',
      d_forgotFinalStep: 'm*v',
      d_operationInverted: 'v-m',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{m}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Adding ${{b}}$ to both sides leaves ${{m}}x = {{d_forgotFinalStep}}$.', 'Dividing by ${{m}}$ puts the dot at ${{answer}}$.'],
  answerSummary: { headline: 'Undo the addition first, then the multiplication.', text: 'The dot sits at ${{answer}}$.' },
  hint: 'Which step is undone first?',
  feedback: 'The division has not been done yet.',
});

mk('7.10B', 'which-values-a-two-step-shades', {
  courseId: 'grade7',
  difficultyBand: 1, dok: 2, taskType: 'interpretation', representation: 'verbal',
  prompt: 'Which values does ${{m}}x \\le {{t}}$ shade?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      v: { type: 'int', min: 2, max: 20 },
    },
    derived: { t: 'm*v', below: 'v-1' },
    constraints: [],
  },
  choices: [
    { label: 'Every value ${{v}}$ and below.', correct: true },
    { label: 'Every value ${{v}}$ and above.', error: 'ratioReversed' },
    { label: 'Every value ${{t}}$ and below.', error: 'forgotFinalStep' },
    { label: 'Every value below ${{v}}$, but not ${{v}}$ itself.', error: 'offByOneStep' },
  ],
  reasoning: ['Dividing both sides by ${{m}}$ leaves $x \\le {{v}}$.', 'The bar under the sign admits ${{v}}$, and everything smaller satisfies it too.'],
  answerSummary: { headline: 'Solve first, then read the direction off the sign.', text: '${{v}}$ and everything below it.' },
  hint: 'Divide before deciding what is shaded.',
  feedback: 'The total on the right is not the boundary value.',
});

mk('7.10B', 'shading-the-wrong-way', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student solves ${{m}}x + {{b}} < {{t}}$ and shades to the right of ${{v}}$. What is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 3, max: 30 },
      v: { type: 'int', min: 2, max: 20 },
    },
    derived: { t: 'm*v+b', test: 'v+1', lhs: 'm*v+m+b' },
    constraints: [],
  },
  choices: [
    { label: 'Values above ${{v}}$ fail: at $x = {{test}}$ the left side reaches ${{lhs}}$.', correct: true },
    { label: 'Nothing is wrong, because the arrow follows the larger side.', error: 'operationInverted' },
    { label: 'The endpoint should be filled, but the direction is right.', error: 'offByOneStep' },
    { label: 'Dividing by ${{m}}$ flips the sign, so the shading is correct.', error: 'signError' },
  ],
  reasoning: ['Less than means the values that satisfy it lie below ${{v}}$.', 'Testing ${{test}}$ gives ${{lhs}}$, which is not below ${{t}}$.'],
  answerSummary: { headline: 'Test a value on the side you shaded.', text: 'The shading belongs to the left of ${{v}}$.' },
  hint: 'Try a value on the shaded side.',
  feedback: 'Dividing by a positive number leaves the sign alone.',
});

// ================================================================ 7.11A
// Solving two-step equations and inequalities.

mk('7.11A', 'solve-with-a-divided-variable', {
  courseId: 'grade7',
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Solve $\\frac{x}{{{m}}} + {{b}} = {{t}}$.',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      // b and g share a range so the given constant crosses the answer.
      b: { type: 'int', min: 2, max: 20 },
      g: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      t: 'g+b',
      answer: 'm*g',
      d_offByOneStep: 'm*g+m',
      d_partialTotal: 'g',
      d_usedGivenValue: 'm*b',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Taking ${{b}}$ off both sides leaves $\\frac{x}{{{m}}} = {{g}}$.', 'Multiplying by ${{m}}$ gives ${{answer}}$.'],
  answerSummary: { headline: 'Undo the addition, then undo the division.', text: '$x = {{answer}}$.' },
  hint: 'What undoes dividing by ${{m}}$?',
  feedback: 'The multiplication has not been done yet.',
});

mk('7.11A', 'solve-a-two-step-inequality', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'Solve ${{m}}x - {{b}} \\ge {{t}}$.',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 3, max: 30 },
      v: { type: 'int', min: 2, max: 20 },
    },
    derived: { t: 'm*v-b', noAdd: 'v-1', wrong: 'm*v' },
    constraints: ['noAdd!=v', 'wrong!=v'],
  },
  choices: [
    { label: plain('x \\ge {{v}}'), correct: true },
    { label: plain('x \\le {{v}}'), error: 'ratioReversed' },
    { label: plain('x \\ge {{wrong}}'), error: 'forgotFinalStep' },
    { label: plain('x > {{v}}'), error: 'offByOneStep' },
  ],
  reasoning: ['Adding ${{b}}$ to both sides gives ${{m}}x \\ge {{wrong}}$.', 'Dividing by the positive ${{m}}$ leaves the sign alone: $x \\ge {{v}}$.'],
  answerSummary: { headline: 'Dividing by a positive number does not flip the sign.', text: 'It is $x \\ge {{v}}$.' },
  hint: 'Does dividing by a positive number change the direction?',
  feedback: 'The division has not been carried out.',
});

mk('7.11A', 'rate-from-two-recorded-costs', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'table',
  prompt: 'A hire has a fixed fee and a daily rate. What is the daily rate?',
  stimulus: {
    kind: 'table',
    title: 'Recorded costs',
    table: { headers: ['days', 'cost'], rows: [['{{d1}}', '\\${{c1}}'], ['{{d2}}', '\\${{c2}}']] },
  },
  generator: {
    parameters: {
      // The fixed fee and the rate share a range, so reading one for the other
      // lands on either side of the answer.
      half: { type: 'int', min: 2, max: 15 },
      b: { type: 'int', min: 4, max: 30 },
      d1: { type: 'int', min: 1, max: 4 },
      gap: { type: 'int', min: 2, max: 6 },
    },
    derived: {
      m: '2*half',
      d2: 'd1+gap',
      c1: '2*half*d1+b',
      c2: '2*half*d2+b',
      answer: 'm',
      d_usedGivenValue: 'c1',
      d_partialTotal: 'half',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{b}}'), error: 'ratioReversed' },
  ],
  reasoning: ['Between the two rows the cost rises by $\\${{c2}} - \\${{c1}}$ over ${{gap}}$ extra days.', 'That is ${{answer}}$ dollars a day, and the fee never enters the difference.'],
  answerSummary: { headline: 'The difference between two rows cancels the fixed fee.', text: 'The rate is $\\${{answer}}$ a day.' },
  hint: 'What changes between the two rows, and what does not?',
  feedback: 'A whole cost includes the fee as well as the days.',
});

mk('7.11A', 'solve-with-a-negative-coefficient', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Solve $-{{m}}x + {{b}} = {{t}}$.',
  generator: {
    parameters: {
      // m and v share a range so the coefficient crosses the solution.
      m: { type: 'int', min: 2, max: 12 },
      v: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 5, max: 40 },
    },
    derived: {
      t: 'b-m*v',
      answer: 'v',
      d_forgotFinalStep: 'm*v',
      d_signError: '0-v',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{m}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Taking ${{b}}$ off both sides leaves $-{{m}}x = {{t}} - {{b}}$, which is $-{{d_forgotFinalStep}}$.', 'Dividing by $-{{m}}$ gives ${{answer}}$.'],
  answerSummary: { headline: 'Two negatives divide to a positive.', text: '$x = {{answer}}$.' },
  hint: 'What sign does the result of the division carry?',
  feedback: 'Dividing a negative by a negative does not leave a negative.',
});

mk('7.11A', 'dividing-only-one-term', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'To solve ${{m}}x + {{b}} = {{t}}$ a student divides only the ${{m}}x$ by ${{m}}$. What is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 3, max: 30 },
      v: { type: 'int', min: 2, max: 20 },
    },
    derived: { t: 'm*v+b', stripped: 'm*v', claimed: 'm*v+b-b' },
    constraints: [],
  },
  choices: [
    { label: 'Every term must be divided, or take ${{b}}$ off first to leave ${{stripped}}$.', correct: true },
    { label: 'Nothing is wrong, because only the term in $x$ matters.', error: 'partialTotal' },
    { label: 'The division should have come before any subtraction.', error: 'orderOfOperations' },
    { label: 'Dividing by ${{m}}$ flips the equals sign.', error: 'signError' },
  ],
  reasoning: ['An operation applies to a whole side, not to one term of it.', 'Taking ${{b}}$ off first leaves ${{m}}x = {{stripped}}$, which then divides cleanly.'],
  answerSummary: { headline: 'What you do, you do to the whole side.', text: 'Take ${{b}}$ off first.' },
  hint: 'What does the division act on?',
  feedback: 'The constant does not disappear when the other term is divided.',
});

// ================================================================ 7.11B
// Testing a value in a two-step equation or inequality.
//
// As in 6.10B, none of these is "which of these four values satisfies the
// inequality" — that shape makes the key the large one and gives it away.

mk('7.11B', 'substituting-into-a-two-step-difference', {
  courseId: 'grade7',
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'symbolic',
  prompt: 'What is ${{b}} - {{m}}x$ when $x = {{v}}$?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      v: { type: 'int', min: 2, max: 12 },
      // The crossing distractor is the subtraction done the other way round,
      // so it only crosses where the key changes sign. b runs high enough to
      // make that a coin flip instead of sitting at the tolerance edge.
      b: { type: 'int', min: 5, max: 70 },
    },
    derived: {
      answer: 'b-m*v',
      d_signError: 'b+m*v',
      d_operationInverted: '0-b-m*v',
      d_ratioReversed: 'm*v-b',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['Work out ${{m}} \\times {{v}}$ first.', 'Taking that from ${{b}}$ leaves ${{answer}}$.'],
  answerSummary: { headline: 'Multiply before subtracting, and keep the order.', text: 'It comes to ${{answer}}$.' },
  hint: 'Which operation comes first?',
  feedback: 'Subtracting the other way round flips the sign.',
});

mk('7.11B', 'does-the-load-fit', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'context',
  prompt: 'A shelf holds at most ${{t}}$ kg. Do ${{v}}$ boxes of ${{m}}$ kg on a ${{b}}$ kg pallet fit?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      v: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 3, max: 20 },
      slack: { type: 'int', min: 1, max: 25 },
    },
    derived: { load: 'm*v+b', t: 'm*v+b+slack', boxes: 'm*v' },
    constraints: [],
  },
  choices: [
    { label: 'Yes: the boxes weigh ${{boxes}}$ kg and the pallet brings it to ${{load}}$ kg.', correct: true },
    { label: 'No: ${{load}}$ kg is over the limit.', error: 'signError' },
    { label: 'Yes: the boxes alone weigh ${{boxes}}$ kg, which is under ${{t}}$.', error: 'partialTotal' },
    { label: 'It cannot be decided without knowing the shelf width.', error: 'operationInverted' },
  ],
  reasoning: ['${{v}}$ boxes weigh ${{boxes}}$ kg, and the pallet adds ${{b}}$ kg more.', '${{load}}$ kg is within the ${{t}}$ kg the shelf takes.'],
  answerSummary: { headline: 'Count everything on the shelf, not just the boxes.', text: 'They fit, at ${{load}}$ kg.' },
  hint: 'What else is on the shelf besides the boxes?',
  feedback: 'Leaving the pallet out understates the load.',
});

mk('7.11B', 'how-a-claim-is-tested', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'verbal',
  prompt: 'How is a claimed solution of ${{m}}x + {{b}} = {{t}}$ tested?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 3, max: 30 },
      v: { type: 'int', min: 2, max: 20 },
    },
    derived: { t: 'm*v+b', stripped: 'm*v' },
    constraints: [],
  },
  choices: [
    { label: 'Put the value in place of $x$ and see whether the left side reaches ${{t}}$.', correct: true },
    { label: 'Check that the value is smaller than ${{t}}$.', error: 'partialTotal' },
    { label: 'Check that ${{m}}$ divides the value exactly.', error: 'usedGivenValue' },
    { label: 'Add ${{b}}$ to ${{t}}$ and see whether the value appears.', error: 'operationInverted' },
  ],
  reasoning: ['A solution is a value that makes the two sides agree.', 'Substituting is the only test of that; ${{m}}x$ must come to ${{stripped}}$ for the total to reach ${{t}}$.'],
  answerSummary: { headline: 'Substitute and compare the two sides.', text: 'Put the value in and evaluate.' },
  hint: 'What does being a solution actually mean?',
  feedback: 'Being smaller than the total is true of many values that are not solutions.',
});

mk('7.11B', 'what-the-test-gives', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'symbolic',
  prompt: 'Testing $x = {{v}}$ in ${{m}}x + {{b}} \\le {{t}}$ gives what?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      v: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 3, max: 30 },
      slack: { type: 'int', min: 1, max: 25 },
    },
    derived: { lhs: 'm*v+b', t: 'm*v+b+slack', product: 'm*v', overshoot: 'm*v+b+b' },
    constraints: [],
  },
  choices: [
    { label: 'It gives ${{lhs}}$, which is at most ${{t}}$, so the value works.', correct: true },
    { label: 'It gives ${{lhs}}$, which is more than ${{t}}$, so the value fails.', error: 'signError' },
    { label: 'It gives ${{product}}$, which is at most ${{t}}$, so the value works.', error: 'partialTotal' },
    { label: 'It gives ${{overshoot}}$, which is more than ${{t}}$, so the value fails.', error: 'arithmeticSlip' },
  ],
  reasoning: ['${{m}} \\times {{v}} = {{product}}$, and adding ${{b}}$ gives ${{lhs}}$.', '${{lhs}}$ does not pass ${{t}}$, so the inequality holds.'],
  answerSummary: { headline: 'Evaluate the left side, then compare it with the limit.', text: 'It gives ${{lhs}}$, and the value works.' },
  hint: 'Work the left side out in full first.',
  feedback: 'The constant belongs in the total too.',
});

mk('7.11B', 'checking-by-undoing-the-wrong-way', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'To check $x = {{w}}$ in ${{m}}x + {{b}} = {{t}}$ a student adds ${{b}}$ to ${{t}}$. What is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 3, max: 30 },
      v: { type: 'int', min: 2, max: 20 },
      slip: { type: 'int', min: 1, max: 8 },
    },
    derived: {
      t: 'm*v+b',
      w: 'v+slip',
      got: 'm*v+m*slip+b',
      wrongSide: 'm*v+b+b',
    },
    constraints: [],
  },
  choices: [
    { label: 'Substitute instead: ${{w}}$ gives ${{got}}$, which is not ${{t}}$.', correct: true },
    { label: 'Nothing is wrong, because adding undoes subtracting.', error: 'operationInverted' },
    { label: 'The ${{b}}$ should be added to the left side, giving ${{wrongSide}}$.', error: 'partialTotal' },
    { label: 'The check works only once the equation has been solved.', error: 'usedGivenValue' },
  ],
  reasoning: ['Checking a value means putting it in, not rearranging the equation.', '${{m}} \\times {{w}} + {{b}} = {{got}}$, and ${{got}}$ is not ${{t}}$.'],
  answerSummary: { headline: 'A check substitutes; it does not solve.', text: 'It gives ${{got}}$, so the claim fails.' },
  hint: 'What does checking a value actually involve?',
  feedback: 'Undoing steps is solving, which is a different job.',
});

// ================================================================ 7.11C
// Equations that come out of angle facts.

mk('7.11C', 'equation-for-the-third-angle', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'A triangle has angles ${{a}}^\\circ$, ${{c}}^\\circ$ and $x$. Which equation gives $x$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 20, max: 70 },
      c: { type: 'int', min: 20, max: 70 },
    },
    derived: { ac: 'a+c', diff: 'a-c' },
    constraints: [],
  },
  choices: [
    { label: plain('x + {{ac}} = 180'), correct: true },
    { label: plain('x + {{ac}} = 360'), error: 'arithmeticSlip' },
    { label: plain('x + {{a}} = 180'), error: 'partialTotal' },
    { label: plain('x + {{diff}} = 180'), error: 'operationInverted' },
  ],
  reasoning: ['The three angles of a triangle total $180^\\circ$.', 'The two given angles come to ${{ac}}$, so $x$ makes up the rest.'],
  answerSummary: { headline: 'Write the angle sum, with the unknown left in place.', text: 'It is $x + {{ac}} = 180$.' },
  hint: 'What do all three angles come to?',
  feedback: 'Both given angles belong in the equation.',
});

mk('7.11C', 'angle-on-a-straight-line', {
  courseId: 'grade7',
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Two angles sit on a straight line and one is ${{a}}^\\circ$. What is the other?',
  generator: {
    // a runs either side of 90, so the given angle crosses the answer.
    parameters: { a: { type: 'int', min: 20, max: 160 } },
    derived: {
      answer: '180-a',
      d_operationInverted: '360-a',
      d_partialTotal: '90-a',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}^\\circ'), correct: true },
    { label: plain('{{d_operationInverted}}^\\circ'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}^\\circ'), error: 'partialTotal' },
    { label: plain('{{a}}^\\circ'), error: 'usedGivenValue' },
  ],
  reasoning: ['Angles on a straight line total $180^\\circ$.', '$180 - {{a}} = {{answer}}$.'],
  answerSummary: { headline: 'A straight line is half a full turn.', text: 'The other angle is ${{answer}}^\\circ$.' },
  hint: 'How much is a straight angle?',
  feedback: 'A full turn is twice what a straight line covers.',
});

mk('7.11C', 'solving-for-x-in-a-supplementary-pair', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'An angle of $(2x + {{b}})^\\circ$ is supplementary to ${{a}}^\\circ$. What is $x$?',
  generator: {
    parameters: {
      // b and v share a range, so the constant crosses the answer. Both are
      // capped so the third angle stays positive without a constraint.
      v: { type: 'int', min: 5, max: 40 },
      b: { type: 'int', min: 6, max: 40, step: 2 },
    },
    derived: {
      a: '180-2*v-b',
      answer: 'v',
      d_forgotFinalStep: '2*v+b',
      d_arithmeticSlip: 'v-b/2',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
    { label: plain('{{b}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Supplementary angles total $180^\\circ$, so $2x + {{b}} = {{d_forgotFinalStep}}$.', 'Taking ${{b}}$ off and halving gives ${{answer}}$.'],
  answerSummary: { headline: 'Write the angle fact as an equation, then solve it.', text: '$x = {{answer}}$.' },
  hint: 'What do the two angles come to together?',
  feedback: 'That is the whole angle, not the value of $x$.',
});

mk('7.11C', 'equation-for-angles-in-a-ratio', {
  courseId: 'grade7',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'One angle of a triangle is twice another, and the third is ${{c}}^\\circ$. Which equation gives the smaller unknown angle $x$?',
  generator: {
    parameters: { k: { type: 'int', min: 10, max: 50 } },
    derived: { c: '180-3*k', rest: '3*k', third: 'k' },
    constraints: [],
  },
  choices: [
    { label: plain('3x + {{c}} = 180'), correct: true },
    { label: plain('x + {{c}} = 180'), error: 'partialTotal' },
    { label: plain('3x = 180'), error: 'operationInverted' },
    { label: plain('3x + {{c}} = 360'), error: 'arithmeticSlip' },
  ],
  reasoning: ['$x$ and $2x$ together make $3x$.', 'With ${{c}}$ that has to reach $180$, leaving ${{rest}}$ for the two unknown angles and ${{third}}$ for $x$ itself.'],
  answerSummary: { headline: 'Collect the unknown angles before writing the sum.', text: 'It is $3x + {{c}} = 180$.' },
  hint: 'How many lots of $x$ are there?',
  feedback: 'The second angle is $2x$, not another $x$.',
});

mk('7.11C', 'supplementary-against-complementary', {
  courseId: 'grade7',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says two angles adding to $90^\\circ$ are supplementary. What is wrong?',
  generator: {
    parameters: { a: { type: 'int', min: 20, max: 70 } },
    derived: { comp: '90-a', supp: '180-a' },
    constraints: [],
  },
  choices: [
    { label: 'Adding to $90^\\circ$ is complementary; supplementary angles add to $180^\\circ$.', correct: true },
    { label: 'Nothing is wrong, because both words mean angles that pair up.', error: 'operationInverted' },
    { label: 'Supplementary angles add to $360^\\circ$, not $90^\\circ$.', error: 'arithmeticSlip' },
    { label: 'The two words mean the same thing for a right angle.', error: 'partialTotal' },
  ],
  reasoning: ['${{a}}^\\circ$ has a complement of ${{comp}}^\\circ$ and a supplement of ${{supp}}^\\circ$.', 'The two are different unless the angle is a right angle, which these are not.'],
  answerSummary: { headline: 'Complementary makes a right angle; supplementary makes a straight line.', text: 'Ninety degrees is complementary.' },
  hint: 'Which pairing makes a straight line?',
  feedback: 'A full turn is not what either word describes.',
});

// ================================================================ 8.2A
// Sets and subsets of the real numbers.

mk('8.2A', 'set-that-holds-an-irrational', {
  courseId: 'grade8',
  difficultyBand: 1, dok: 2, taskType: 'interpretation', representation: 'symbolic',
  prompt: 'Which set contains both $\\sqrt{{{n}}}$ and $-{{a}}$?',
  generator: {
    parameters: {
      // n is not a perfect square, so the root is irrational by construction.
      n: { type: 'choice', values: [2, 3, 5, 6, 7, 8, 10, 11] },
      a: { type: 'int', min: 2, max: 40 },
    },
    derived: { sq: 'a*a' },
    constraints: [],
  },
  choices: [
    { label: 'The real numbers.', correct: true },
    { label: 'The rational numbers.', error: 'operationInverted' },
    { label: 'The integers.', error: 'partialTotal' },
    { label: 'The whole numbers.', error: 'signError' },
  ],
  reasoning: ['$\\sqrt{{{n}}}$ cannot be written as a ratio, so it is irrational.', 'The reals are the one set holding both the rationals and the irrationals.'],
  answerSummary: { headline: 'The reals take in the rationals and the irrationals together.', text: 'The real numbers.' },
  hint: 'Which of the two values rules out the smaller sets?',
  feedback: 'A root that does not come out exactly is not rational.',
});

mk('8.2A', 'rational-or-irrational-root', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'Which of these is irrational?',
  generator: {
    parameters: {
      n: { type: 'choice', values: [2, 3, 5, 6, 7, 8, 10, 11] },
      a: { type: 'int', min: 3, max: 12 },
      b: { type: 'int', min: 2, max: 30 },
      d: { type: 'choice', values: [3, 4, 6, 7, 8] },
    },
    derived: { sq: 'a*a', num: 'b*d+1' },
    constraints: [],
  },
  choices: [
    { label: plain('\\sqrt{{{n}}}'), correct: true },
    { label: plain('\\sqrt{{{sq}}}'), error: 'operationInverted' },
    { label: plain('\\frac{{{num}}}{{{d}}}'), error: 'partialTotal' },
    { label: plain('-{{b}}'), error: 'signError' },
  ],
  reasoning: ['$\\sqrt{{{sq}}}$ comes out exactly as ${{a}}$, so it is rational.', '$\\sqrt{{{n}}}$ does not come out exactly and cannot be written as a ratio.'],
  answerSummary: { headline: 'A root is irrational only when it does not come out exactly.', text: '$\\sqrt{{{n}}}$ is the irrational one.' },
  hint: 'Which roots come out to a whole number?',
  feedback: 'A fraction is rational however awkward it looks.',
});

mk('8.2A', 'where-the-reals-sit', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'table',
  prompt: 'The sets are drawn as nested rings. Which arrangement is right?',
  stimulus: {
    kind: 'expressions',
    title: 'A value from each set',
    note: 'Integer: $-{{a}}$    Rational: $\\frac{{{num}}}{{{d}}}$    Irrational: $\\sqrt{{{n}}}$',
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 40 },
      b: { type: 'int', min: 2, max: 20 },
      d: { type: 'choice', values: [3, 4, 6, 7, 8] },
      n: { type: 'choice', values: [2, 3, 5, 6, 7, 8, 10, 11] },
    },
    derived: { num: 'b*d+1', prod: 'b*d' },
    constraints: [],
  },
  choices: [
    { label: 'Integers inside rationals, with rationals and irrationals both inside the reals.', correct: true },
    { label: 'Rationals inside integers, with both inside the reals.', error: 'ratioReversed' },
    { label: 'Irrationals inside the rationals, with rationals inside the reals.', error: 'operationInverted' },
    { label: 'Rationals and irrationals overlap, sharing the roots between them.', error: 'partialTotal' },
  ],
  reasoning: ['$-{{a}}$ is an integer and also rational, so the integers sit inside the rationals.', '$\\sqrt{{{n}}}$ is real but not rational, so the irrationals sit beside the rationals inside the reals.'],
  answerSummary: { headline: 'Rationals and irrationals divide the reals between them without overlapping.', text: 'Integers inside rationals; rationals and irrationals inside the reals.' },
  hint: 'Can a value be both rational and irrational?',
  feedback: 'No value is both rational and irrational.',
});

mk('8.2A', 'which-value-is-not-real', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'verbal',
  prompt: 'Which statement about $\\sqrt{{{n}}}$ is true?',
  generator: {
    parameters: {
      n: { type: 'choice', values: [2, 3, 5, 6, 7, 8, 10, 11] },
      a: { type: 'int', min: 2, max: 9 },
    },
    derived: { low: 'a*a', high: 'a*a+2*a+1' },
    constraints: [],
  },
  choices: [
    { label: 'It is real but not rational, so it has no exact fraction.', correct: true },
    { label: 'It is not a real number, because it does not come out exactly.', error: 'operationInverted' },
    { label: 'It is rational, because a decimal for it can be written down.', error: 'partialTotal' },
    { label: 'It is an integer, because it lies between two whole numbers.', error: 'signError' },
  ],
  reasoning: ['Every point on the number line is a real number, and $\\sqrt{{{n}}}$ has a place on it.', 'It cannot be written as a ratio of whole numbers, so it is irrational rather than rational.'],
  answerSummary: { headline: 'Irrational numbers are real; they simply are not ratios.', text: 'Real, but not rational.' },
  hint: 'Does the value have a place on the number line?',
  feedback: 'A rounded decimal is an approximation, not the value itself.',
});

mk('8.2A', 'every-real-is-rational', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says every real number is rational. What is wrong?',
  generator: {
    parameters: {
      n: { type: 'choice', values: [2, 3, 5, 6, 7, 8, 10, 11] },
      a: { type: 'int', min: 3, max: 12 },
    },
    derived: { sq: 'a*a', next: 'a+1' },
    constraints: [],
  },
  choices: [
    { label: '$\\sqrt{{{n}}}$ is real and is not rational.', correct: true },
    { label: 'Nothing is wrong, because $\\sqrt{{{sq}}}$ works out to ${{a}}$.', error: 'partialTotal' },
    { label: 'The claim fails only for negative numbers.', error: 'signError' },
    { label: 'It should say every rational number is real, which is also false.', error: 'operationInverted' },
  ],
  reasoning: ['One counter-example settles it: $\\sqrt{{{n}}}$ lies between ${{a}}$ and ${{next}}$ without being a ratio.', 'The reverse claim, that every rational is real, is in fact true.'],
  answerSummary: { headline: 'The irrationals are the real numbers the rationals miss.', text: '$\\sqrt{{{n}}}$ is the counter-example.' },
  hint: 'Find one real number that is not a ratio.',
  feedback: 'A root that does come out exactly does not test the claim.',
});


// ================================================================ 8.2B
// Placing an irrational number between rationals.
//
// Every root here is drawn as a perfect square plus an offset that keeps it
// strictly between two consecutive whole numbers, so the answer is correct by
// construction and no draw can produce a root that lands on a whole number.

mk('8.2B', 'between-which-whole-numbers', {
  courseId: 'grade8',
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'numberLine',
  prompt: 'Between which two whole numbers does $\\sqrt{{{n}}}$ lie?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 14 },
      off: { type: 'int', min: 1, max: 6 },
    },
    derived: {
      n: 'a*a+off',
      next: 'a+1',
      prev: 'a-1',
      nextNext: 'a+2',
      halved: 'round(a*a/2)',
      halvedNext: 'round(a*a/2)+1',
    },
    constraints: [],
  },
  choices: [
    { label: '${{a}}$ and ${{next}}$', correct: true },
    { label: '${{prev}}$ and ${{a}}$', error: 'offByOneStep' },
    { label: '${{next}}$ and ${{nextNext}}$', error: 'arithmeticSlip' },
    { label: '${{halved}}$ and ${{halvedNext}}$', error: 'operationInverted' },
  ],
  reasoning: ['${{a}} \\times {{a}} = {{n}}$ minus ${{off}}$, so ${{a}}$ squared is just below ${{n}}$.', '${{next}}$ squared is above ${{n}}$, so the root sits between them.'],
  answerSummary: { headline: 'Find the perfect squares that bracket the number.', text: 'It lies between ${{a}}$ and ${{next}}$.' },
  hint: 'Which whole numbers square to just below and just above ${{n}}$?',
  feedback: 'Halving a number is not the same as taking its root.',
});

mk('8.2B', 'best-estimate-of-a-root', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'symbolic',
  prompt: 'Which is the best estimate of $\\sqrt{{{n}}}$, and why?',
  generator: {
    parameters: {
      a: { type: 'int', min: 4, max: 14 },
      // Strictly below a, so the root always rounds down to a.
      off: { type: 'int', min: 1, max: 3 },
    },
    derived: {
      n: 'a*a+off',
      asq: 'a*a',
      next: 'a+1',
      nextSq: 'a*a+2*a+1',
      halved: 'round(a*a/2)',
    },
    constraints: [],
  },
  choices: [
    { label: 'About ${{a}}$, because ${{a}}^2 = {{asq}}$ is just below ${{n}}$.', correct: true },
    { label: 'About ${{next}}$, because ${{next}}^2 = {{nextSq}}$ is the nearer square.', error: 'offByOneStep' },
    { label: 'Exactly ${{a}}$, because roots of whole numbers are whole.', error: 'partialTotal' },
    { label: 'About ${{halved}}$, because that is half of ${{asq}}$.', error: 'operationInverted' },
  ],
  reasoning: ['${{n}}$ sits only ${{off}}$ above ${{asq}}$ but well below ${{nextSq}}$.', 'So the root is a little over ${{a}}$, and ${{a}}$ is the closest whole number.'],
  answerSummary: { headline: 'Compare the number with the squares either side of it.', text: 'A little over ${{a}}$.' },
  hint: 'Which perfect square is ${{n}}$ nearer to?',
  feedback: '${{n}}$ is not a perfect square, so its root is not whole.',
});

mk('8.2B', 'what-is-true-of-pi', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'verbal',
  prompt: 'Which statement about $\\pi$ is true?',
  generator: {
    parameters: { d: { type: 'int', min: 4, max: 40, step: 2 } },
    derived: { c: 'round(314*d/100)', r: 'd/2' },
    constraints: [],
  },
  choices: [
    { label: 'It lies between $3$ and $4$ and cannot be written as a fraction.', correct: true },
    { label: '$\\frac{22}{7}$ is exactly equal to it.', error: 'partialTotal' },
    { label: 'It is exactly $3.14$.', error: 'roundedWrong' },
    { label: 'It is greater than $4$, because circles curve.', error: 'operationInverted' },
  ],
  reasoning: ['A circle of diameter ${{d}}$ measures about ${{c}}$ round, and ${{c}} \\div {{d}}$ is a little over $3$.', 'No fraction gives the value exactly, however many digits are used.'],
  answerSummary: { headline: 'Pi is a little over three and never terminates.', text: 'Between three and four, and not a fraction.' },
  hint: 'What does the way round divided by the diameter come to?',
  feedback: 'A fraction or a two-place decimal is an approximation, not the value.',
});

mk('8.2B', 'root-against-a-half-way-mark', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'numberLine',
  prompt: 'On a number line, where does $\\sqrt{{{n}}}$ sit compared with ${{a}}$ and ${{next}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 4, max: 14 },
      // Below a, so the root lands in the lower half of the gap every time.
      off: { type: 'int', min: 1, max: 3 },
    },
    derived: { n: 'a*a+off', next: 'a+1', asq: 'a*a', nextSq: 'a*a+2*a+1' },
    constraints: [],
  },
  choices: [
    { label: 'Just above ${{a}}$, nearer to ${{a}}$ than to ${{next}}$.', correct: true },
    { label: 'Just below ${{next}}$, nearer to ${{next}}$ than to ${{a}}$.', error: 'ratioReversed' },
    { label: 'Exactly halfway between ${{a}}$ and ${{next}}$.', error: 'partialTotal' },
    { label: 'Below ${{a}}$, because ${{n}}$ is not a perfect square.', error: 'operationInverted' },
  ],
  reasoning: ['${{n}}$ is only ${{off}}$ above ${{asq}}$, while ${{nextSq}}$ is much further above ${{n}}$.', 'So the root sits close to ${{a}}$ rather than in the middle of the gap.'],
  answerSummary: { headline: 'How far past the lower square you are decides where in the gap you land.', text: 'Just above ${{a}}$.' },
  hint: 'How far is ${{n}}$ from each of the two squares?',
  feedback: 'The root of a number above ${{asq}}$ cannot be below ${{a}}$.',
});

mk('8.2B', 'halving-instead-of-rooting', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says $\\sqrt{{{n}}}$ is about ${{halved}}$, because that is half of ${{n}}$. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 5, max: 14 },
      off: { type: 'int', min: 1, max: 6 },
    },
    derived: {
      n: 'a*a+off',
      halved: 'round((a*a+off)/2)',
      asq: 'a*a',
      next: 'a+1',
    },
    constraints: [],
  },
  choices: [
    { label: 'A root asks what squares to ${{n}}$, and ${{a}}^2 = {{asq}}$, so it is about ${{a}}$.', correct: true },
    { label: 'Nothing is wrong, because halving and rooting both make a number smaller.', error: 'operationInverted' },
    { label: 'The half is right but should be rounded up to ${{next}}$.', error: 'roundedWrong' },
    { label: 'A root of a number that is not a perfect square cannot be estimated.', error: 'partialTotal' },
  ],
  reasoning: ['Halving ${{n}}$ answers a different question entirely.', 'The root is the number that multiplies by itself to give ${{n}}$, which is close to ${{a}}$.'],
  answerSummary: { headline: 'A root undoes squaring, not doubling.', text: 'It is about ${{a}}$.' },
  hint: 'What operation does a square root undo?',
  feedback: 'Both do make the number smaller, which is why the mistake is easy to make.',
});

// ================================================================ 8.2C
// Scientific notation and standard decimal notation.

mk('8.2C', 'write-in-scientific-notation', {
  courseId: 'grade8',
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Which is ${{value}}$ written in scientific notation?',
  generator: {
    parameters: {
      d1: { type: 'int', min: 1, max: 9 },
      d2: { type: 'int', min: 1, max: 9 },
      e: { type: 'int', min: 3, max: 7 },
    },
    derived: {
      value: '(10*d1+d2)*pow(10,e-1)',
      mant: '10*d1+d2',
      eMinus: 'e-1',
      eNeg: '0-e',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{d1}}.{{d2}} \\times 10^{{{e}}}'), correct: true },
    { label: plain('{{mant}} \\times 10^{{{e}}}'), error: 'partialTotal' },
    { label: plain('{{d1}}.{{d2}} \\times 10^{{{eMinus}}}'), error: 'offByOneStep' },
    { label: plain('{{d1}}.{{d2}} \\times 10^{{{eNeg}}}'), error: 'signError' },
  ],
  reasoning: ['The first factor has to sit between $1$ and $10$, so it is ${{d1}}.{{d2}}$.', 'Moving the point back to where it started takes ${{e}}$ places.'],
  answerSummary: { headline: 'One digit before the point, and the exponent counts the places.', text: 'It is ${{d1}}.{{d2}} \\times 10^{{{e}}}$.' },
  hint: 'Where does the point have to sit?',
  feedback: 'A first factor of ${{mant}}$ is not below ten.',
});

mk('8.2C', 'back-to-a-plain-number', {
  courseId: 'grade8',
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'context',
  prompt: 'Two readings are ${{d1}}.{{d2}} \\times 10^{{{e}}}$ and ${{f1}}.{{f2}} \\times 10^{{{e}}}$. What is the first as a plain number?',
  generator: {
    parameters: {
      // The second reading is drawn separately, so its value crosses the key.
      d1: { type: 'int', min: 1, max: 9 },
      d2: { type: 'int', min: 1, max: 9 },
      f1: { type: 'int', min: 1, max: 9 },
      f2: { type: 'int', min: 1, max: 9 },
      e: { type: 'int', min: 3, max: 6 },
    },
    derived: {
      answer: '(10*d1+d2)*pow(10,e-1)',
      d_offByOneStep: '(10*d1+d2)*pow(10,e)',
      d_partialTotal: '(10*d1+d2)*pow(10,e-2)',
      d_usedGivenValue: '(10*f1+f2)*pow(10,e-1)',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The exponent ${{e}}$ moves the point ${{e}}$ places to the right.', 'That turns ${{d1}}.{{d2}}$ into ${{answer}}$.'],
  answerSummary: { headline: 'The exponent counts the places the point travels.', text: 'It is ${{answer}}$.' },
  hint: 'How many places does the point move, and which way?',
  feedback: 'That is the second reading, not the first.',
});

mk('8.2C', 'which-of-two-is-larger', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'symbolic',
  prompt: 'Which is larger, ${{a1}}.{{a2}} \\times 10^{{{e1}}}$ or ${{b1}}.{{b2}} \\times 10^{{{e2}}}$?',
  generator: {
    parameters: {
      // The first has the larger exponent and the SMALLER first factor, so a
      // student comparing first factors alone lands on the wrong one.
      a1: { type: 'int', min: 1, max: 4 },
      a2: { type: 'int', min: 1, max: 9 },
      b1: { type: 'int', min: 5, max: 9 },
      b2: { type: 'int', min: 1, max: 9 },
      e2: { type: 'int', min: 2, max: 6 },
      gap: { type: 'int', min: 1, max: 3 },
    },
    derived: { e1: 'e2+gap' },
    constraints: [],
  },
  choices: [
    { label: 'The first, because its exponent is larger.', correct: true },
    { label: 'The second, because its first factor is larger.', error: 'ratioReversed' },
    { label: 'They are equal, because both are written the same way.', error: 'operationInverted' },
    { label: 'It cannot be decided without writing both out in full.', error: 'partialTotal' },
  ],
  reasoning: ['The exponent settles the size first: $10^{{{e1}}}$ beats $10^{{{e2}}}$ by ${{gap}}$ powers of ten.', 'A first factor can only range from $1$ to just under $10$, which cannot make up a whole power of ten.'],
  answerSummary: { headline: 'Compare the exponents first; the first factors only break ties.', text: 'The first is larger.' },
  hint: 'How much can the first factor ever be worth?',
  feedback: 'A larger first factor cannot outweigh a larger exponent.',
});

mk('8.2C', 'why-the-first-factor-is-bounded', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'verbal',
  prompt: 'Why must the first factor in scientific notation be at least $1$ and below $10$?',
  generator: {
    parameters: {
      d1: { type: 'int', min: 1, max: 9 },
      d2: { type: 'int', min: 1, max: 9 },
      e: { type: 'int', min: 3, max: 7 },
    },
    derived: { mant: '10*d1+d2', eMinus: 'e-1', value: '(10*d1+d2)*pow(10,e-1)' },
    constraints: [],
  },
  choices: [
    { label: 'So each number has only one way of being written.', correct: true },
    { label: 'So the exponent is always positive.', error: 'signError' },
    { label: 'Because a factor of ${{mant}}$ cannot be multiplied by a power of ten.', error: 'operationInverted' },
    { label: 'Because numbers below $1$ have no scientific notation.', error: 'partialTotal' },
  ],
  reasoning: ['${{value}}$ could be written as ${{d1}}.{{d2}} \\times 10^{{{e}}}$ or as ${{mant}} \\times 10^{{{eMinus}}}$, and both are correct arithmetic.', 'Fixing the first factor between $1$ and $10$ leaves exactly one of them standing.'],
  answerSummary: { headline: 'The bound makes the notation unique, not merely tidy.', text: 'So each number has one form.' },
  hint: 'How many ways could the same number otherwise be written?',
  feedback: 'Negative exponents are perfectly allowed.',
});

mk('8.2C', 'first-factor-left-too-large', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student writes ${{value}}$ as ${{mant}} \\times 10^{{{eMinus}}}$. What is wrong?',
  generator: {
    parameters: {
      d1: { type: 'int', min: 1, max: 9 },
      d2: { type: 'int', min: 1, max: 9 },
      e: { type: 'int', min: 3, max: 7 },
    },
    derived: {
      value: '(10*d1+d2)*pow(10,e-1)',
      mant: '10*d1+d2',
      eMinus: 'e-1',
    },
    constraints: [],
  },
  choices: [
    { label: 'The arithmetic is right but the first factor must be below $10$: ${{d1}}.{{d2}} \\times 10^{{{e}}}$.', correct: true },
    { label: 'The arithmetic is wrong, because ${{mant}} \\times 10^{{{eMinus}}}$ is not ${{value}}$.', error: 'operationInverted' },
    { label: 'The exponent should have gone down again, to ${{e}}$ minus two.', error: 'offByOneStep' },
    { label: 'Nothing is wrong, because any first factor is allowed.', error: 'partialTotal' },
  ],
  reasoning: ['${{mant}} \\times 10^{{{eMinus}}}$ does come to ${{value}}$, so nothing has been miscalculated.', 'Scientific notation additionally requires one digit before the point, which moves the exponent to ${{e}}$.'],
  answerSummary: { headline: 'Correct arithmetic is not yet correct notation.', text: 'It should read ${{d1}}.{{d2}} \\times 10^{{{e}}}$.' },
  hint: 'Is the value wrong, or only the form?',
  feedback: 'The value is right; only the way it is written breaks the rule.',
});

// ================================================================ 8.2D
// Ordering real numbers, rational and irrational together.

mk('8.2D', 'ordering-with-a-root', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Which ordering runs from least to greatest?',
  generator: {
    parameters: {
      // The root sits strictly between a and a+1, and the two rationals are
      // placed either side of it, so one ordering is right by construction.
      a: { type: 'int', min: 3, max: 12 },
      off: { type: 'int', min: 1, max: 4 },
    },
    derived: {
      n: 'a*a+off',
      low: 'a-1',
      high: 'a+2',
      next: 'a+1',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{low}}, \\sqrt{{{n}}}, {{high}}'), correct: true },
    { label: plain('\\sqrt{{{n}}}, {{low}}, {{high}}'), error: 'operationInverted' },
    { label: plain('{{high}}, \\sqrt{{{n}}}, {{low}}'), error: 'ratioReversed' },
    { label: plain('{{low}}, {{high}}, \\sqrt{{{n}}}'), error: 'partialTotal' },
  ],
  reasoning: ['$\\sqrt{{{n}}}$ lies between ${{a}}$ and ${{next}}$.', 'That puts it above ${{low}}$ and below ${{high}}$.'],
  answerSummary: { headline: 'Locate the root between whole numbers before ordering.', text: 'It is ${{low}}, \\sqrt{{{n}}}, {{high}}$.' },
  hint: 'Which whole numbers does the root sit between?',
  feedback: 'A root of a number above ${{a}}$ squared is not the smallest here.',
});

mk('8.2D', 'greatest-of-a-mixed-set', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'symbolic',
  rankAnalysisNotApplicable: true,
  prompt: 'Which of these has the greatest value?',
  generator: {
    parameters: {
      a: { type: 'int', min: 4, max: 12 },
      off: { type: 'int', min: 1, max: 4 },
      d: { type: 'choice', values: [3, 4, 5, 8] },
    },
    derived: {
      n: 'a*a+off',
      big: 'a+3',
      num: 'a*d-1',
      low: 'a-2',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{big}}'), correct: true },
    { label: plain('\\sqrt{{{n}}}'), error: 'operationInverted' },
    { label: plain('\\frac{{{num}}}{{{d}}}'), error: 'partialTotal' },
    { label: plain('{{low}}'), error: 'signError' },
  ],
  reasoning: ['$\\sqrt{{{n}}}$ is a little over ${{a}}$, and $\\frac{{{num}}}{{{d}}}$ is a little under ${{a}}$.', '${{big}}$ is three above ${{a}}$, so it beats both.'],
  answerSummary: { headline: 'Put every value near a whole number before comparing.', text: '${{big}}$ is the greatest.' },
  hint: 'Estimate each value to the nearest whole number.',
  feedback: 'A square root sign does not make a value large.',
});

mk('8.2D', 'value-between-a-whole-and-a-root', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'numberLine',
  prompt: 'Which value lies between ${{a}}$ and $\\sqrt{{{n}}}$?',
  generator: {
    parameters: {
      // The root sits between a and a+1 with the offset above a, so the root
      // is past the halfway mark and a + 1/2 lands strictly between the two.
      a: { type: 'int', min: 4, max: 12 },
      extra: { type: 'int', min: 1, max: 3 },
      c: { type: 'int', min: 4, max: 12 },
    },
    derived: {
      off: 'a+extra',
      n: 'a*a+a+extra',
      otherNum: '2*c+1',
      halfNum: '2*a+1',
      next: 'a+1',
      low: 'a-1',
    },
    constraints: ['c!=a'],
  },
  choices: [
    { label: plain('\\frac{{{halfNum}}}{2}'), correct: true },
    { label: plain('{{low}}'), error: 'signError' },
    { label: plain('{{next}}'), error: 'offByOneStep' },
    { label: plain('\\frac{{{otherNum}}}{2}'), error: 'usedGivenValue' },
  ],
  reasoning: ['${{n}}$ is ${{off}}$ above ${{a}}$ squared, and ${{off}}$ is more than ${{a}}$, so $\\sqrt{{{n}}}$ is past halfway to ${{next}}$.', '$\\frac{{{halfNum}}}{2}$ is exactly halfway, so it sits between ${{a}}$ and the root.'],
  answerSummary: { headline: 'A root past the halfway mark leaves room for the midpoint below it.', text: 'It is $\\frac{{{halfNum}}}{2}$.' },
  hint: 'How far past ${{a}}$ does the root reach?',
  feedback: '$\\frac{{{otherNum}}}{2}$ sits outside the gap entirely.',
});

mk('8.2D', 'root-against-a-fraction', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'verbal',
  prompt: 'How does $\\sqrt{{{n}}}$ compare with $\\frac{{{num}}}{{{d}}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 4, max: 12 },
      off: { type: 'int', min: 1, max: 4 },
      d: { type: 'choice', values: [3, 4, 5, 8] },
    },
    derived: {
      n: 'a*a+off',
      num: 'a*d-1',
      next: 'a+1',
    },
    constraints: [],
  },
  choices: [
    { label: 'The root is larger, because it is above ${{a}}$ and the fraction is below it.', correct: true },
    { label: 'The fraction is larger, because a fraction can be written exactly.', error: 'ratioReversed' },
    { label: 'They are equal, because both are close to ${{a}}$.', error: 'partialTotal' },
    { label: 'It cannot be decided, because one is irrational.', error: 'operationInverted' },
  ],
  reasoning: ['$\\sqrt{{{n}}}$ lies between ${{a}}$ and ${{next}}$, so it is above ${{a}}$.', '$\\frac{{{num}}}{{{d}}}$ is one ${{d}}$th short of ${{a}}$, so it is below ${{a}}$.'],
  answerSummary: { headline: 'Compare each value with a whole number they straddle.', text: 'The root is larger.' },
  hint: 'Which side of ${{a}}$ does each value fall on?',
  feedback: 'Being irrational does not stop a value being compared.',
});

mk('8.2D', 'ordering-negatives-backwards', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student puts $-{{a}}$ before $-{{b}}$ because ${{a}}$ is less than ${{b}}$. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 20 },
      gap: { type: 'int', min: 1, max: 20 },
    },
    derived: { b: 'a+gap', negA: '0-a', negB: '0-a-gap' },
    constraints: [],
  },
  choices: [
    { label: 'Negating reverses the order, so $-{{b}}$ comes first.', correct: true },
    { label: 'Nothing is wrong, because the order of the sizes is kept.', error: 'operationInverted' },
    { label: 'The two are equal once the signs are dropped.', error: 'partialTotal' },
    { label: 'Negative numbers cannot be put in order at all.', error: 'signError' },
  ],
  reasoning: ['${{a}}$ is less than ${{b}}$, so ${{a}}$ is closer to zero.', 'Closer to zero on the negative side means larger, so ${{negB}}$ comes before ${{negA}}$.'],
  answerSummary: { headline: 'Further from zero is smaller once you are below it.', text: '$-{{b}}$ comes first.' },
  hint: 'Which of the two lies further left?',
  feedback: 'The sizes keep their order; the values do not.',
});

// ================================================================ 8.3A
// Corresponding sides of similar shapes, and dilation.

mk('8.3A', 'scale-factor-of-a-dilation', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'orderedPairs',
  prompt: 'A dilation centred at the origin sends $({{x}}, {{y}})$ to $({{kx}}, {{ky}})$. What is the scale factor?',
  generator: {
    parameters: {
      // x and k share a range, so the original coordinate crosses the factor.
      x: { type: 'int', min: 2, max: 12 },
      y: { type: 'int', min: 2, max: 12 },
      k: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      kx: 'k*x', ky: 'k*y',
      answer: 'k',
      d_partialTotal: 'x*(k-1)',
      d_arithmeticSlip: 'k-x',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
    { label: plain('{{x}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['${{kx}} \\div {{x}} = {{answer}}$, and ${{ky}} \\div {{y}} = {{answer}}$ as well.', 'A dilation multiplies both coordinates by the same factor.'],
  answerSummary: { headline: 'A scale factor is a ratio, not a difference.', text: 'The factor is ${{answer}}$.' },
  hint: 'Divide an image coordinate by the one it came from.',
  feedback: 'How much the coordinate grew by is not how many times it grew.',
});

mk('8.3A', 'perimeters-of-similar-shapes', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'Two similar shapes have sides in the ratio ${{a}} : {{b}}$. Their perimeters are in what ratio?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 2, max: 12 },
    },
    derived: { asq: 'a*a', bsq: 'b*b', aPlus: 'a+1', bPlus: 'b+1' },
    constraints: ['a!=b'],
  },
  choices: [
    { label: plain('{{a}} : {{b}}'), correct: true },
    { label: plain('{{b}} : {{a}}'), error: 'ratioReversed' },
    { label: plain('{{asq}} : {{bsq}}'), error: 'exponentError' },
    { label: plain('{{aPlus}} : {{bPlus}}'), error: 'offByOneStep' },
  ],
  reasoning: ['A perimeter adds up sides, and every side is scaled by the same factor.', 'Adding scaled sides scales the total by that factor too, so the ratio is unchanged.'],
  answerSummary: { headline: 'Perimeter scales exactly as the sides do.', text: 'It is ${{a}} : {{b}}$.' },
  hint: 'What does a perimeter add up?',
  feedback: 'Squaring the ratio describes areas, not perimeters.',
});

mk('8.3A', 'areas-of-similar-shapes', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A rectangle ${{a}}$ by ${{b}}$ cm is dilated by a factor of ${{k}}$, and a second measures ${{a2}}$ by ${{b2}}$ cm. What area does the image of the first cover?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 9 },
      k: { type: 'int', min: 2, max: 5 },
      // The second rectangle is drawn separately, so its area crosses the key.
      a2: { type: 'int', min: 4, max: 36 },
      b2: { type: 'int', min: 4, max: 36 },
    },
    derived: {
      area: 'a*b',
      answer: 'a*b*k*k',
      d_exponentError: 'a*b*k*k*k',
      d_partialTotal: 'a*b*k',
      d_usedGivenValue: 'a2*b2',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_exponentError}}'), error: 'exponentError' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The rectangle covers ${{area}}$ square cm to begin with.', 'Both directions stretch by ${{k}}$, so the image covers ${{k}} \\times {{k}}$ times as much: ${{answer}}$.'],
  answerSummary: { headline: 'Area scales by the square of the length factor.', text: 'The image covers ${{answer}}$ square cm.' },
  hint: 'How many directions does the stretch act in?',
  feedback: 'That is the second rectangle, which was not dilated.',
});

mk('8.3A', 'image-of-a-second-point', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'orderedPairs',
  prompt: 'A dilation about the origin sends $({{x1}}, {{y1}})$ to $({{kx1}}, {{ky1}})$. Where does $({{x2}}, {{y2}})$ go?',
  generator: {
    parameters: {
      x1: { type: 'int', min: 2, max: 9 },
      y1: { type: 'int', min: 2, max: 9 },
      x2: { type: 'int', min: 2, max: 9 },
      y2: { type: 'int', min: 2, max: 9 },
      k: { type: 'int', min: 2, max: 6 },
    },
    derived: {
      kx1: 'k*x1', ky1: 'k*y1',
      kx2: 'k*x2', ky2: 'k*y2',
      addX: 'x2+k*x1-x1', addY: 'y2+k*y1-y1',
      swapX: 'k*y2', swapY: 'k*x2',
    },
    constraints: ['x2!=y2', 'x2!=x1', 'y2!=y1', '(addX!=swapX)||(addY!=swapY)'],
  },
  choices: [
    { label: plain('({{kx2}}, {{ky2}})'), correct: true },
    { label: plain('({{addX}}, {{addY}})'), error: 'operationInverted' },
    { label: plain('({{swapX}}, {{swapY}})'), error: 'ratioReversed' },
    { label: plain('({{x2}}, {{y2}})'), error: 'partialTotal' },
  ],
  reasoning: ['${{kx1}} \\div {{x1}} = {{k}}$, so the factor is ${{k}}$.', 'Both coordinates of the second point are multiplied by ${{k}}$.'],
  answerSummary: { headline: 'One factor applies to every point and both coordinates.', text: 'It goes to $({{kx2}}, {{ky2}})$.' },
  hint: 'Work out the factor from the pair you were given.',
  feedback: 'Adding the growth of the first point only works if the points match.',
});

mk('8.3A', 'does-a-dilation-change-angles', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says a dilation changes the angles as well as the sides. What is wrong?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 8 },
      ang: { type: 'int', min: 20, max: 120 },
    },
    derived: { kAng: 'k*ang', third: '180-ang' },
    constraints: [],
  },
  choices: [
    { label: 'A dilation keeps every angle, so an angle of ${{ang}}^\\circ$ stays ${{ang}}^\\circ$.', correct: true },
    { label: 'Nothing is wrong: the angle becomes ${{kAng}}^\\circ$.', error: 'operationInverted' },
    { label: 'The angles do change, but only in a reduction, not an enlargement.', error: 'partialTotal' },
    { label: 'The angles change to ${{third}}^\\circ$, because the shape leans.', error: 'signError' },
  ],
  reasoning: ['A dilated shape is similar to the original, and similarity fixes the angles exactly.', 'Scaling an angle would bend the sides, and $ {{k}} \\times {{ang}} = {{kAng}}$ can even pass $180^\\circ$.'],
  answerSummary: { headline: 'A dilation scales lengths and leaves angles alone.', text: 'The angle stays ${{ang}}^\\circ$.' },
  hint: 'What makes two shapes similar rather than congruent?',
  feedback: 'Enlarging and reducing treat the angles the same way.',
});

// ================================================================ 8.3B
// A shape and its dilation, side by side.

mk('8.3B', 'what-a-dilation-leaves-alone', {
  courseId: 'grade8',
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'verbal',
  prompt: 'A shape is dilated about the origin by a factor of ${{k}}$. What is unchanged?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 8 },
      side: { type: 'int', min: 2, max: 12 },
    },
    derived: { kSide: 'k*side', area: 'side*side', kArea: 'k*k*side*side' },
    constraints: [],
  },
  choices: [
    { label: 'The angle measures.', correct: true },
    { label: 'The side lengths.', error: 'operationInverted' },
    { label: 'The area.', error: 'areaPerimeterSwap' },
    { label: 'The distance of each vertex from the origin.', error: 'partialTotal' },
  ],
  reasoning: ['A side of ${{side}}$ becomes ${{kSide}}$ and an area of ${{area}}$ becomes ${{kArea}}$.', 'The angles are the one thing a dilation carries over untouched.'],
  answerSummary: { headline: 'A dilation changes size, not shape.', text: 'The angles.' },
  hint: 'What tells you two shapes are the same shape?',
  feedback: 'Every distance from the centre is multiplied by the factor.',
});

mk('8.3B', 'perimeter-after-a-dilation', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'Two panels have perimeters ${{p}}$ and ${{p2}}$ cm, and the first is dilated by a factor of ${{k}}$. What is its new perimeter?',
  generator: {
    parameters: {
      // The second panel's perimeter is drawn separately, so it crosses the key.
      p: { type: 'int', min: 6, max: 40 },
      p2: { type: 'int', min: 12, max: 200 },
      k: { type: 'int', min: 2, max: 8 },
    },
    derived: {
      answer: 'k*p',
      d_offByOneStep: 'k*p+p',
      d_operationInverted: 'k+p',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{p2}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Every side is multiplied by ${{k}}$, so the total round is too.', '${{k}} \\times {{p}} = {{answer}}$ cm.'],
  answerSummary: { headline: 'Perimeter scales by the factor itself.', text: 'It becomes ${{answer}}$ cm.' },
  hint: 'What happens to each side?',
  feedback: 'That is the second panel, which was not dilated.',
});

mk('8.3B', 'area-after-a-dilation', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'Two panels cover ${{A}}$ and ${{A2}}$ square cm, and the first is dilated by a factor of ${{k}}$. What area does it cover then?',
  generator: {
    parameters: {
      // Drawn separately so it crosses the key rather than dividing it.
      A: { type: 'int', min: 4, max: 40 },
      A2: { type: 'int', min: 20, max: 600 },
      k: { type: 'int', min: 2, max: 6 },
    },
    derived: {
      answer: 'A*k*k',
      d_exponentError: 'A*k*k*k',
      d_partialTotal: 'A*k',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_exponentError}}'), error: 'exponentError' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{A2}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Both directions stretch by ${{k}}$, so the area grows by ${{k}} \\times {{k}}$.', '${{A}} \\times {{k}}^2 = {{answer}}$ square cm.'],
  answerSummary: { headline: 'Area scales by the square of the factor.', text: 'It covers ${{answer}}$ square cm.' },
  hint: 'How many directions does the stretch act in?',
  feedback: 'Scaling once describes a length, not an area.',
});

mk('8.3B', 'image-under-a-reduction', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'orderedPairs',
  prompt: 'A dilation of factor $\\frac{1}{{{k}}}$ about the origin sends $({{kx}}, {{ky}})$ where?',
  generator: {
    parameters: {
      x: { type: 'int', min: 2, max: 12 },
      y: { type: 'int', min: 2, max: 12 },
      k: { type: 'int', min: 2, max: 6 },
    },
    derived: {
      kx: 'k*x', ky: 'k*y',
      bigX: 'k*k*x', bigY: 'k*k*y',
      subX: 'k*x-k', subY: 'k*y-k',
    },
    constraints: ['x!=y'],
  },
  choices: [
    { label: plain('({{x}}, {{y}})'), correct: true },
    { label: plain('({{bigX}}, {{bigY}})'), error: 'operationInverted' },
    { label: plain('({{subX}}, {{subY}})'), error: 'arithmeticSlip' },
    { label: plain('({{ky}}, {{kx}})'), error: 'ratioReversed' },
  ],
  reasoning: ['A factor below one shrinks the shape towards the origin.', 'Dividing both coordinates by ${{k}}$ gives $({{x}}, {{y}})$.'],
  answerSummary: { headline: 'A fractional factor divides both coordinates.', text: 'It goes to $({{x}}, {{y}})$.' },
  hint: 'Does a factor below one grow the shape or shrink it?',
  feedback: 'Multiplying by ${{k}}$ would enlarge it instead.',
});

mk('8.3B', 'every-point-moves-the-same-distance', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says a dilation about the origin moves every point the same distance. What is wrong?',
  generator: {
    parameters: {
      near: { type: 'int', min: 2, max: 6 },
      far: { type: 'int', min: 10, max: 30 },
      k: { type: 'int', min: 2, max: 6 },
    },
    derived: {
      nearMove: 'near*k-near',
      farMove: 'far*k-far',
    },
    constraints: [],
  },
  choices: [
    { label: 'A point at ${{near}}$ moves ${{nearMove}}$, while one at ${{far}}$ moves ${{farMove}}$.', correct: true },
    { label: 'Nothing is wrong, because every point is multiplied by ${{k}}$.', error: 'operationInverted' },
    { label: 'Every point does move equally, but only away from the origin.', error: 'partialTotal' },
    { label: 'Points move equally only when the factor is a whole number.', error: 'usedGivenValue' },
  ],
  reasoning: ['A dilation multiplies each distance from the centre, so a larger distance gains more.', 'Multiplying by ${{k}}$ is not the same as adding a fixed amount.'],
  answerSummary: { headline: 'A dilation scales distances; a translation adds to them.', text: 'Far points move further.' },
  hint: 'Compare a point near the origin with one far from it.',
  feedback: 'The same multiplier does not mean the same movement.',
});


// ================================================================ 8.3C
// A dilation written as an algebraic rule, with a rational scale factor.

mk('8.3C', 'rule-for-a-dilation', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'Which rule describes a dilation of factor ${{k}}$ about the origin?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      x: { type: 'int', min: 2, max: 12 },
    },
    derived: { kx: 'k*x', shifted: 'x+k' },
    constraints: [],
  },
  choices: [
    { label: plain('(x, y) \\to ({{k}}x, {{k}}y)'), correct: true },
    { label: plain('(x, y) \\to (x + {{k}}, y + {{k}})'), error: 'operationInverted' },
    { label: plain('(x, y) \\to ({{k}}x, y)'), error: 'partialTotal' },
    { label: plain('(x, y) \\to (\\frac{x}{{{k}}}, \\frac{y}{{{k}}})'), error: 'ratioReversed' },
  ],
  reasoning: ['A dilation multiplies both coordinates by the factor, so ${{x}}$ becomes ${{kx}}$.', 'Adding ${{k}}$ would give ${{shifted}}$ instead, which slides the figure rather than scaling it.'],
  answerSummary: { headline: 'A dilation multiplies; a translation adds.', text: 'It is $(x, y) \\to ({{k}}x, {{k}}y)$.' },
  hint: 'What happens to a point twice as far from the origin?',
  feedback: 'Scaling only one coordinate would stretch the figure out of shape.',
});

mk('8.3C', 'what-a-fraction-below-one-does', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'A dilation about the origin uses the factor $\\frac{{{p}}}{{{q}}}$. What does it do to a figure?',
  generator: {
    parameters: {
      // p is built strictly below q, so the factor is always under one.
      q: { type: 'int', min: 3, max: 9 },
      drop: { type: 'int', min: 1, max: 2 },
      u: { type: 'int', min: 2, max: 9 },
    },
    derived: { p: 'q-drop', side: 'q*u', image: '(q-drop)*u' },
    constraints: [],
  },
  choices: [
    { label: 'Shrinks it towards the origin, keeping its shape.', correct: true },
    { label: 'Enlarges it away from the origin, keeping its shape.', error: 'ratioReversed' },
    { label: 'Shrinks it and changes its angles as well.', error: 'operationInverted' },
    { label: 'Leaves it the same size, because the factor is a fraction.', error: 'partialTotal' },
  ],
  reasoning: ['${{p}}$ is below ${{q}}$, so the factor is less than one.', 'A side of ${{side}}$ becomes ${{image}}$, shorter but in the same proportions.'],
  answerSummary: { headline: 'A factor below one is a reduction, and still a similarity.', text: 'It shrinks towards the origin.' },
  hint: 'Is the fraction above or below one?',
  feedback: 'Angles survive every dilation, whatever the factor.',
});

mk('8.3C', 'image-under-a-rational-factor', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'orderedPairs',
  prompt: 'A dilation of factor $\\frac{{{p}}}{{{q}}}$ about the origin sends $({{x}}, {{y}})$ where?',
  generator: {
    parameters: {
      q: { type: 'int', min: 2, max: 6 },
      p: { type: 'int', min: 2, max: 9 },
      u: { type: 'int', min: 2, max: 9 },
      v: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      x: 'q*u', y: 'q*v',
      px: 'p*u', py: 'p*v',
      halfX: 'p*u*q', halfY: 'p*v*q',
    },
    constraints: ['u!=v', 'p!=q'],
  },
  choices: [
    { label: plain('({{px}}, {{py}})'), correct: true },
    { label: plain('({{halfX}}, {{halfY}})'), error: 'partialTotal' },
    { label: plain('({{py}}, {{px}})'), error: 'ratioReversed' },
    { label: plain('({{x}}, {{y}})'), error: 'operationInverted' },
  ],
  reasoning: ['${{x}} \\div {{q}} = {{u}}$, and ${{u}} \\times {{p}} = {{px}}$.', 'The same treatment of ${{y}}$ gives ${{py}}$.'],
  answerSummary: { headline: 'Divide by the bottom, then multiply by the top.', text: 'It goes to $({{px}}, {{py}})$.' },
  hint: 'Which part of the fraction shrinks the coordinate?',
  feedback: 'Multiplying by ${{q}}$ as well undoes the division.',
});

mk('8.3C', 'length-after-a-rational-dilation', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'Two rods along an axis run ${{x}}$ and ${{x2}}$ units from the origin, and the first is dilated by $\\frac{{{p}}}{{{q}}}$. How long is its image?',
  generator: {
    parameters: {
      q: { type: 'int', min: 2, max: 6 },
      p: { type: 'int', min: 2, max: 9 },
      u: { type: 'int', min: 2, max: 12 },
      // The second rod is drawn separately, so its length crosses the key.
      x2: { type: 'int', min: 4, max: 90 },
    },
    derived: {
      x: 'q*u',
      answer: 'p*u',
      d_operationInverted: 'p*u*q',
      d_partialTotal: 'u',
    },
    constraints: ['p!=q'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{x2}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['${{x}}$ divided by ${{q}}$ is ${{u}}$.', 'Multiplying by ${{p}}$ gives an image of ${{answer}}$ units.'],
  answerSummary: { headline: 'A rational factor divides then multiplies.', text: 'The image is ${{answer}}$ units.' },
  hint: 'Deal with the bottom of the fraction first.',
  feedback: 'That is the second rod, which was not dilated.',
});

mk('8.3C', 'fraction-factor-read-as-an-enlargement', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says a factor of $\\frac{{{p}}}{{{q}}}$ enlarges a figure because ${{p}}$ and ${{q}}$ are both above one. What is wrong?',
  generator: {
    parameters: {
      q: { type: 'int', min: 3, max: 9 },
      drop: { type: 'int', min: 1, max: 2 },
      u: { type: 'int', min: 3, max: 12 },
    },
    derived: { p: 'q-drop', side: 'q*u', image: '(q-drop)*u' },
    constraints: [],
  },
  choices: [
    { label: 'The factor is $\\frac{{{p}}}{{{q}}}$, which is below one, so a side of ${{side}}$ shrinks to ${{image}}$.', correct: true },
    { label: 'Nothing is wrong, because multiplying by a fraction still multiplies.', error: 'operationInverted' },
    { label: 'It enlarges, but only in one direction.', error: 'partialTotal' },
    { label: 'The figure stays the same size and only its position moves.', error: 'ratioReversed' },
  ],
  reasoning: ['What matters is the value of the whole fraction, not the size of its parts.', '${{p}}$ over ${{q}}$ is less than one, so every length shrinks.'],
  answerSummary: { headline: 'Compare the fraction with one, not its parts with one.', text: 'It shrinks: ${{side}}$ becomes ${{image}}$.' },
  hint: 'What does the fraction come to as a decimal?',
  feedback: 'Multiplying by a value below one makes the result smaller.',
});

// ================================================================ 8.4A
// Slope is the same whichever two points on the line you pick.

mk('8.4A', 'slope-from-a-different-pair', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'verbal',
  prompt: 'The first two of three points on a line give a slope of ${{m}}$. What slope do the last two give?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      g1: { type: 'int', min: 1, max: 6 },
      g2: { type: 'int', min: 1, max: 6 },
    },
    derived: { rise1: 'm*g1', rise2: 'm*g2', bigger: 'm*g2' },
    constraints: [],
  },
  choices: [
    { label: 'The same, ${{m}}$, because slope does not change along a line.', correct: true },
    { label: 'Larger, ${{bigger}}$, because those points are further apart.', error: 'partialTotal' },
    { label: 'Smaller, because the second stretch is shorter.', error: 'ratioReversed' },
    { label: 'It cannot be told without the coordinates.', error: 'operationInverted' },
  ],
  reasoning: ['Over a run of ${{g1}}$ the line rises ${{rise1}}$, and over ${{g2}}$ it rises ${{rise2}}$.', 'Both divide out to ${{m}}$, because the slope triangles are similar.'],
  answerSummary: { headline: 'Every slope triangle on one line is similar to every other.', text: 'The same, ${{m}}$.' },
  hint: 'What do the two slope triangles have in common?',
  feedback: 'A longer run comes with a proportionally larger rise.',
});

mk('8.4A', 'why-the-triangles-agree', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'verbal',
  prompt: 'Why do slope triangles drawn between different pairs of points on one line give the same ratio?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      g: { type: 'int', min: 2, max: 8 },
      f: { type: 'int', min: 2, max: 5 },
    },
    derived: { rise: 'm*g', bigRun: 'g*f', bigRise: 'm*g*f' },
    constraints: [],
  },
  choices: [
    { label: 'They are similar triangles, so their sides stay in one ratio.', correct: true },
    { label: 'They are congruent triangles, so their sides are equal.', error: 'operationInverted' },
    { label: 'The rises are equal, so the ratios must match.', error: 'partialTotal' },
    { label: 'The ratio only matches when the points are equally spaced.', error: 'ratioReversed' },
  ],
  reasoning: ['A run of ${{g}}$ carries a rise of ${{rise}}$; a run ${{f}}$ times as long carries ${{bigRise}}$.', 'Both triangles have the same angles, so multiplying the run multiplies the rise to match.'],
  answerSummary: { headline: 'Similar triangles, not equal ones, is what keeps the ratio fixed.', text: 'They are similar.' },
  hint: 'Are the triangles the same size, or the same shape?',
  feedback: 'Equal sides would need the points equally spaced, which is not required.',
});

mk('8.4A', 'coordinate-further-along-the-line', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'orderedPairs',
  prompt: 'A line of slope ${{m}}$ passes through $({{x1}}, {{y1}})$, and a second line passes through $({{x2}}, {{other}})$. On the first line, what is $y$ when $x = {{x2}}$?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      x1: { type: 'int', min: 1, max: 8 },
      y1: { type: 'int', min: 1, max: 20 },
      run: { type: 'int', min: 2, max: 9 },
      // The other line's y-value is drawn separately, so it crosses the key.
      other: { type: 'int', min: 4, max: 75 },
    },
    derived: {
      x2: 'x1+run',
      answer: 'y1+m*run',
      d_partialTotal: 'y1+m*(x1+run)',
      d_operationInverted: 'y1+run',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{other}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['From ${{x1}}$ to ${{x2}}$ the run is ${{run}}$.', 'A slope of ${{m}}$ raises $y$ by ${{m}} \\times {{run}}$, from ${{y1}}$ to ${{answer}}$.'],
  answerSummary: { headline: 'Slope multiplies the run, not the whole coordinate.', text: '$y = {{answer}}$.' },
  hint: 'How far does $x$ actually move?',
  feedback: 'The run is the change in $x$, not its new value.',
});

mk('8.4A', 'slope-read-from-a-table', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'table',
  prompt: 'The table lists three points on one line. What is its slope?',
  stimulus: {
    kind: 'table',
    title: 'Points on the line',
    table: { headers: ['x', 'y'], rows: [['0', '{{b}}'], ['{{x2}}', '{{y2}}'], ['{{x3}}', '{{y3}}']] },
  },
  generator: {
    parameters: {
      // m and b share a range, so the value at x = 0 crosses the slope.
      m: { type: 'int', min: 2, max: 14 },
      b: { type: 'int', min: 2, max: 14 },
      x2: { type: 'int', min: 2, max: 6 },
      gap: { type: 'int', min: 2, max: 6 },
    },
    derived: {
      x3: 'x2+gap',
      y2: 'm*x2+b', y3: 'm*(x2+gap)+b',
      answer: 'm',
      d_partialTotal: 'm*x2',
      d_arithmeticSlip: 'm-x2',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
    { label: plain('{{b}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Between the last two rows $x$ moves ${{gap}}$ and $y$ moves ${{y3}} - {{y2}}$.', 'Dividing gives ${{answer}}$, and the first two rows give the same.'],
  answerSummary: { headline: 'Slope is the change in y shared by the change in x.', text: 'The slope is ${{answer}}$.' },
  hint: 'Compare how much each column changes between rows.',
  feedback: 'The value at $x = 0$ is where the line starts, not how steep it is.',
});

mk('8.4A', 'steeper-looking-stretch', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says a longer stretch of a line has a larger slope. What is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      g1: { type: 'int', min: 1, max: 4 },
      f: { type: 'int', min: 2, max: 5 },
    },
    derived: { g2: 'g1*f', rise1: 'm*g1', rise2: 'm*g1*f' },
    constraints: [],
  },
  choices: [
    { label: 'A run of ${{g2}}$ carries a rise of ${{rise2}}$, and ${{rise2}}$ over ${{g2}}$ is still ${{m}}$.', correct: true },
    { label: 'Nothing is wrong, because the rise grows from ${{rise1}}$ to ${{rise2}}$.', error: 'partialTotal' },
    { label: 'The slope shrinks instead, because the run grows faster.', error: 'ratioReversed' },
    { label: 'Slope can only be measured between neighbouring points.', error: 'operationInverted' },
  ],
  reasoning: ['The rise does grow, but so does the run, and by the same factor.', 'Slope is their ratio, so it stays at ${{m}}$ however far apart the points are.'],
  answerSummary: { headline: 'Both parts of the ratio grow together.', text: 'The slope stays ${{m}}$.' },
  hint: 'What happens to the run at the same time?',
  feedback: 'The rise alone is not the slope.',
});

// ================================================================ 8.4B
// Proportional relationships and the unit rate as slope.

mk('8.4B', 'cost-per-unit-from-a-point', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'context',
  prompt: 'A cost graph passes through the origin and $({{w}}, {{c}})$, where ${{w}}$ is a weight in kg. What is the cost per kg?',
  generator: {
    parameters: {
      // w and the rate share a range, so the weight crosses the answer.
      w: { type: 'int', min: 2, max: 14 },
      half: { type: 'int', min: 1, max: 7 },
    },
    derived: {
      k: '2*half',
      c: 'w*2*half',
      answer: 'k',
      d_forgotFinalStep: 'c',
      d_partialTotal: 'half',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{w}}'), error: 'ratioReversed' },
  ],
  reasoning: ['The line goes through the origin, so the cost is proportional to the weight.', '${{c}} \\div {{w}} = {{answer}}$ for every point on it.'],
  answerSummary: { headline: 'On a proportional graph the unit rate is the slope.', text: 'It is ${{answer}}$ per kg.' },
  hint: 'What does one kilogram cost?',
  feedback: 'That is the cost of ${{w}}$ kg, not of one.',
});

mk('8.4B', 'what-makes-a-relationship-proportional', {
  courseId: 'grade8',
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'verbal',
  prompt: 'Which is true of every proportional relationship?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 12 },
      x: { type: 'int', min: 2, max: 9 },
    },
    derived: { y: 'k*x', doubled: '2*k*x' },
    constraints: [],
  },
  choices: [
    { label: 'Its graph is a straight line through the origin.', correct: true },
    { label: 'Its graph is a straight line, wherever it crosses the axis.', error: 'partialTotal' },
    { label: 'Its graph passes through the origin, straight or not.', error: 'operationInverted' },
    { label: 'Its graph rises by a fixed amount rather than a fixed factor.', error: 'ratioReversed' },
  ],
  reasoning: ['At $x = {{x}}$ the value is ${{y}}$, and doubling $x$ doubles it to ${{doubled}}$.', 'That only happens when the line is straight and starts at the origin.'],
  answerSummary: { headline: 'Proportional needs both: straight, and through the origin.', text: 'A straight line through the origin.' },
  hint: 'What must happen to $y$ when $x$ doubles?',
  feedback: 'A straight line that misses the origin is linear but not proportional.',
});

mk('8.4B', 'which-set-of-pairs-is-proportional', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'orderedPairs',
  prompt: 'Which pair of records could come from a proportional relationship?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      x1: { type: 'int', min: 2, max: 5 },
      b: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      x2: 'x1+3',
      y1: 'k*x1', y2: 'k*(x1+3)',
      a1: 'k*x1+b', a2: 'k*(x1+3)+b',
      off: 'k*(x1+3)+k',
    },
    constraints: ['b!=k'],
  },
  choices: [
    { label: plain('({{x1}}, {{y1}}) \\text{ and } ({{x2}}, {{y2}})'), correct: true },
    { label: plain('({{x1}}, {{a1}}) \\text{ and } ({{x2}}, {{a2}})'), error: 'partialTotal' },
    { label: plain('({{x1}}, {{y1}}) \\text{ and } ({{x2}}, {{off}})'), error: 'offByOneStep' },
    { label: plain('({{y1}}, {{x1}}) \\text{ and } ({{y2}}, {{x2}})'), error: 'ratioReversed' },
  ],
  reasoning: ['Both records must divide out to the same rate: ${{y1}} \\div {{x1}} = {{k}}$ and ${{y2}} \\div {{x2}} = {{k}}$.', 'The pair with a fixed ${{b}}$ added has a different quotient in each record.'],
  answerSummary: { headline: 'Proportional means one quotient across every record.', text: 'The pair $({{x1}}, {{y1}})$ and $({{x2}}, {{y2}})$.' },
  hint: 'Divide each second value by its first.',
  feedback: 'A fixed amount added spoils the constant ratio.',
});

mk('8.4B', 'value-further-along-a-proportional-graph', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A proportional graph passes through $({{a}}, {{b}})$, and a second graph through $({{c}}, {{other}})$. On the first, what is $y$ at $x = {{c}}$?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      a: { type: 'int', min: 2, max: 8 },
      c: { type: 'int', min: 2, max: 12 },
      // The second graph's value is drawn separately, so it crosses the key.
      other: { type: 'int', min: 3, max: 110 },
    },
    derived: {
      b: 'k*a',
      answer: 'k*c',
      d_operationInverted: 'k+c',
      d_partialTotal: 'b',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{other}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['${{b}} \\div {{a}} = {{k}}$, so the rate is ${{k}}$.', 'At $x = {{c}}$ that gives ${{k}} \\times {{c}} = {{answer}}$.'],
  answerSummary: { headline: 'Find the rate from the point you have, then apply it.', text: '$y = {{answer}}$.' },
  hint: 'What is the value at $x = 1$?',
  feedback: 'That belongs to the second graph.',
});

mk('8.4B', 'straight-does-not-mean-proportional', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says every straight-line graph is proportional. What is wrong?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 3, max: 20 },
      x: { type: 'int', min: 2, max: 9 },
    },
    derived: { atX: 'k*x+b', twiceX: '2*k*x+b', doubled: '2*k*x+2*b' },
    constraints: [],
  },
  choices: [
    { label: 'A line missing the origin fails: doubling $x$ gives ${{twiceX}}$, not ${{doubled}}$.', correct: true },
    { label: 'Nothing is wrong, because every straight line has a constant slope.', error: 'partialTotal' },
    { label: 'Only curved graphs can be proportional.', error: 'operationInverted' },
    { label: 'A straight line is proportional only when its slope is one.', error: 'ratioReversed' },
  ],
  reasoning: ['At $x = {{x}}$ the value is ${{atX}}$; at twice that $x$ it is ${{twiceX}}$.', 'Doubling the output would need ${{doubled}}$, so the constant ${{b}}$ breaks proportionality.'],
  answerSummary: { headline: 'Constant slope is not the same as constant ratio.', text: 'The line must also pass through the origin.' },
  hint: 'Try doubling $x$ and see whether $y$ doubles.',
  feedback: 'A constant slope makes a line linear, not proportional.',
});

// ================================================================ 8.4C
// Reading both the rate of change and the starting value off a table.

mk('8.4C', 'rate-and-start-from-a-table', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'table',
  prompt: 'Which pair gives the rate of change and the value at $x = 0$?',
  stimulus: {
    kind: 'table',
    title: 'Recorded values',
    table: { headers: ['x', 'y'], rows: [['{{x1}}', '{{y1}}'], ['{{x2}}', '{{y2}}'], ['{{x3}}', '{{y3}}']] },
  },
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 2, max: 30 },
      x1: { type: 'int', min: 1, max: 4 },
      gap: { type: 'int', min: 2, max: 5 },
    },
    derived: {
      x2: 'x1+gap', x3: 'x1+2*gap',
      y1: 'm*x1+b', y2: 'm*(x1+gap)+b', y3: 'm*(x1+2*gap)+b',
      rise: 'm*gap',
    },
    constraints: ['m!=b', 'rise!=m'],
  },
  choices: [
    { label: 'Rate ${{m}}$, value ${{b}}$.', correct: true },
    { label: 'Rate ${{b}}$, value ${{m}}$.', error: 'ratioReversed' },
    { label: 'Rate ${{rise}}$, value ${{y1}}$.', error: 'partialTotal' },
    { label: 'Rate ${{m}}$, value ${{y1}}$.', error: 'offByOneStep' },
  ],
  reasoning: ['Each step of ${{gap}}$ in $x$ raises $y$ by ${{rise}}$, so the rate is ${{m}}$.', 'Working back from $({{x1}}, {{y1}})$ to $x = 0$ removes ${{m}} \\times {{x1}}$, leaving ${{b}}$.'],
  answerSummary: { headline: 'The rate comes from the steps; the starting value comes from working back to zero.', text: 'Rate ${{m}}$, value ${{b}}$.' },
  hint: 'The table does not start at $x = 0$.',
  feedback: 'The first row is not the value at zero.',
});

mk('8.4C', 'what-the-starting-value-means', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'context',
  prompt: 'A tank fills so that $y = {{m}}x + {{b}}$ litres after $x$ minutes. What does ${{b}}$ describe?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 20 },
      b: { type: 'int', min: 5, max: 60 },
      x: { type: 'int', min: 2, max: 9 },
    },
    derived: { total: 'm*x+b', added: 'm*x' },
    constraints: [],
  },
  choices: [
    { label: 'How much was already in the tank before filling started.', correct: true },
    { label: 'How much runs in each minute.', error: 'ratioReversed' },
    { label: 'How much is in the tank after ${{x}}$ minutes.', error: 'partialTotal' },
    { label: 'How many minutes the filling lasts.', error: 'operationInverted' },
  ],
  reasoning: ['After ${{x}}$ minutes the inflow has added ${{added}}$ litres and the tank holds ${{total}}$.', 'The ${{b}}$ is there at $x = 0$, before any minute has passed.'],
  answerSummary: { headline: 'The constant is the reading before the rate starts acting.', text: 'What was already in the tank.' },
  hint: 'What does the rule give when $x$ is zero?',
  feedback: 'The rate per minute is the number multiplying $x$.',
});

mk('8.4C', 'rate-of-change-between-rows', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'table',
  prompt: 'What is the rate of change shown in the table?',
  stimulus: {
    kind: 'table',
    title: 'Recorded values',
    table: { headers: ['x', 'y'], rows: [['{{x1}}', '{{y1}}'], ['{{x2}}', '{{y2}}']] },
  },
  generator: {
    parameters: {
      // m and b share a range, so the starting value crosses the rate.
      m: { type: 'int', min: 2, max: 14 },
      b: { type: 'int', min: 2, max: 14 },
      x1: { type: 'int', min: 1, max: 5 },
      gap: { type: 'int', min: 2, max: 6 },
    },
    derived: {
      x2: 'x1+gap',
      y1: 'm*x1+b', y2: 'm*(x1+gap)+b',
      answer: 'm',
      d_partialTotal: 'm*gap',
      d_arithmeticSlip: 'm-gap',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
    { label: plain('{{b}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['$y$ moves from ${{y1}}$ to ${{y2}}$, a rise of ${{d_partialTotal}}$.', '$x$ moves ${{gap}}$, so the rate is ${{answer}}$.'],
  answerSummary: { headline: 'Divide the rise by the run, not the rise alone.', text: 'The rate is ${{answer}}$.' },
  hint: 'How far does each column move between the rows?',
  feedback: 'The rise has not yet been shared by the run.',
});

mk('8.4C', 'starting-value-from-a-table', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'table',
  prompt: 'What is the value at $x = 0$?',
  stimulus: {
    kind: 'table',
    title: 'Recorded values',
    table: { headers: ['x', 'y'], rows: [['{{x1}}', '{{y1}}'], ['{{x2}}', '{{y2}}']] },
  },
  generator: {
    parameters: {
      // b and m share a range, so the rate crosses the starting value.
      m: { type: 'int', min: 2, max: 14 },
      b: { type: 'int', min: 2, max: 14 },
      x1: { type: 'int', min: 2, max: 5 },
      gap: { type: 'int', min: 2, max: 6 },
    },
    derived: {
      x2: 'x1+gap',
      y1: 'm*x1+b', y2: 'm*(x1+gap)+b',
      answer: 'b',
      d_partialTotal: 'y1',
      d_offByOneStep: 'b-m',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{m}}'), error: 'ratioReversed' },
  ],
  reasoning: ['The rate is ${{m}}$, so each step back in $x$ removes ${{m}}$ from $y$.', 'From $({{x1}}, {{y1}})$ back to zero removes ${{m}} \\times {{x1}}$, leaving ${{answer}}$.'],
  answerSummary: { headline: 'Work back to zero one step at a time.', text: 'The value at zero is ${{answer}}$.' },
  hint: 'How many steps back is $x = 0$?',
  feedback: 'One step too many back overshoots the starting value.',
});

mk('8.4C', 'first-row-read-as-the-intercept', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student reads the starting value as the first $y$ in a table beginning at $x = {{x1}}$. What is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 3, max: 30 },
      x1: { type: 'int', min: 2, max: 6 },
    },
    derived: { y1: 'm*x1+b', back: 'm*x1' },
    constraints: [],
  },
  choices: [
    { label: 'The table starts at ${{x1}}$, so ${{back}}$ must come off ${{y1}}$ to reach ${{b}}$.', correct: true },
    { label: 'Nothing is wrong, because the first row is where the data begins.', error: 'partialTotal' },
    { label: 'The rate should be added instead, giving ${{y1}}$ plus ${{m}}$.', error: 'signError' },
    { label: 'The starting value cannot be found unless the table reaches zero.', error: 'operationInverted' },
  ],
  reasoning: ['Where the data begins and where $x$ is zero are different places.', 'Each of the ${{x1}}$ steps back removes ${{m}}$, so ${{y1}}$ falls to ${{b}}$.'],
  answerSummary: { headline: 'The starting value is at x = 0, not at the top of the table.', text: 'It is ${{b}}$.' },
  hint: 'Where does the table actually begin?',
  feedback: 'Stepping back lowers the value; it does not raise it.',
});

// ================================================================ 8.5A
// Proportional situations as tables, graphs and y = kx.

mk('8.5A', 'constant-of-proportionality-from-a-table', {
  courseId: 'grade8',
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'table',
  prompt: 'What is the constant of proportionality?',
  stimulus: {
    kind: 'table',
    title: 'Proportional values',
    table: { headers: ['x', 'y'], rows: [['{{x1}}', '{{y1}}'], ['{{x2}}', '{{y2}}'], ['{{x3}}', '{{y3}}']] },
  },
  generator: {
    parameters: {
      // k and the first x share a range, so a table entry crosses the answer.
      k: { type: 'int', min: 2, max: 12 },
      x1: { type: 'int', min: 2, max: 12 },
      gap: { type: 'int', min: 2, max: 5 },
    },
    derived: {
      x2: 'x1+gap', x3: 'x1+2*gap',
      y1: 'k*x1', y2: 'k*(x1+gap)', y3: 'k*(x1+2*gap)',
      answer: 'k',
      d_forgotFinalStep: 'y1',
      d_arithmeticSlip: 'k-gap',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
    { label: plain('{{x1}}'), error: 'ratioReversed' },
  ],
  reasoning: ['Every row divides out the same way: ${{y1}} \\div {{x1}} = {{answer}}$.', 'That common quotient is the constant of proportionality.'],
  answerSummary: { headline: 'The constant is the quotient every row shares.', text: 'It is ${{answer}}$.' },
  hint: 'Divide each $y$ by its own $x$.',
  feedback: 'A $y$ from the table is a value, not the constant.',
});

mk('8.5A', 'equation-for-a-proportional-situation', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'context',
  prompt: 'Cable costs $\\${{k}}$ a metre with no other charge. Which equation gives the cost $y$ of $x$ metres?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 20 },
      x: { type: 'int', min: 2, max: 12 },
    },
    derived: { cost: 'k*x', plus: 'k+x' },
    constraints: [],
  },
  choices: [
    { label: plain('y = {{k}}x'), correct: true },
    { label: plain('y = x + {{k}}'), error: 'operationInverted' },
    { label: plain('y = {{k}}x + {{k}}'), error: 'partialTotal' },
    { label: plain('x = {{k}}y'), error: 'ratioReversed' },
  ],
  reasoning: ['Each metre adds $\\${{k}}$ and nothing is charged on top.', 'So ${{x}}$ metres cost $\\${{cost}}$, which is ${{k}}$ times $x$.'],
  answerSummary: { headline: 'No fixed charge means no constant term.', text: 'It is $y = {{k}}x$.' },
  hint: 'Is there anything to pay before the first metre?',
  feedback: 'A constant term would be a charge that applies at zero metres.',
});

mk('8.5A', 'which-pairs-share-one-constant', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'orderedPairs',
  prompt: 'Which two records share a single constant of proportionality?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      x1: { type: 'int', min: 2, max: 6 },
      step: { type: 'int', min: 2, max: 5 },
      b: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      x2: 'x1+step',
      y1: 'k*x1', y2: 'k*(x1+step)',
      shifted: 'k*(x1+step)+b',
      swapped: 'k*x1+k',
    },
    constraints: ['b!=k'],
  },
  choices: [
    { label: plain('({{x1}}, {{y1}}) \\text{ and } ({{x2}}, {{y2}})'), correct: true },
    { label: plain('({{x1}}, {{y1}}) \\text{ and } ({{x2}}, {{shifted}})'), error: 'partialTotal' },
    { label: plain('({{x1}}, {{y1}}) \\text{ and } ({{x1}}, {{swapped}})'), error: 'offByOneStep' },
    { label: plain('({{y1}}, {{x1}}) \\text{ and } ({{y2}}, {{x2}})'), error: 'ratioReversed' },
  ],
  reasoning: ['${{y1}} \\div {{x1}} = {{k}}$ and ${{y2}} \\div {{x2}} = {{k}}$, so both records agree.', 'A record with ${{b}}$ added on top divides out to something else.'],
  answerSummary: { headline: 'One constant has to work for every record, not just one.', text: 'The pair $({{x1}}, {{y1}})$ and $({{x2}}, {{y2}})$.' },
  hint: 'Divide each second value by its first.',
  feedback: 'Adding a fixed amount changes the quotient.',
});

mk('8.5A', 'value-from-the-constant', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'Rope costs $\\${{k}}$ a metre and chain $\\${{other}}$ a metre. What do ${{x}}$ metres of rope cost?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 15 },
      x: { type: 'int', min: 2, max: 12 },
      // The chain's price per metre is drawn separately, so the total for the
      // chain crosses the key.
      other: { type: 'int', min: 2, max: 15 },
    },
    derived: {
      answer: 'k*x',
      d_operationInverted: 'k+x',
      d_offByOneStep: 'k*x+k',
      d_usedGivenValue: 'other*x',
    },
    constraints: [],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: money('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Each metre of rope costs $\\${{k}}$.', '${{x}}$ metres therefore cost $\\${{answer}}$.'],
  answerSummary: { headline: 'A proportional cost is the rate times the amount.', text: 'It costs $\\${{answer}}$.' },
  hint: 'Which of the two prices applies to rope?',
  feedback: 'That total belongs to the chain.',
});

mk('8.5A', 'constant-term-in-a-proportional-claim', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says $y = {{m}}x + {{b}}$ is proportional because it is linear. What is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 3, max: 25 },
      x: { type: 'int', min: 2, max: 9 },
    },
    derived: { atX: 'm*x+b', atZero: 'b' },
    constraints: ['m!=b'],
  },
  choices: [
    { label: 'At $x = 0$ the value is ${{atZero}}$, not zero, so the graph misses the origin.', correct: true },
    { label: 'Nothing is wrong, because a linear rule has a constant slope.', error: 'partialTotal' },
    { label: 'It is proportional only if ${{b}}$ is larger than ${{m}}$.', error: 'usedGivenValue' },
    { label: 'It is not linear either, because of the constant term.', error: 'operationInverted' },
  ],
  reasoning: ['Proportional needs $y$ to be zero when $x$ is, and here it is ${{b}}$.', 'At $x = {{x}}$ the value is ${{atX}}$, which is not ${{m}} \\times {{x}}$.'],
  answerSummary: { headline: 'Linear is necessary for proportional but not enough.', text: 'The constant ${{b}}$ moves it off the origin.' },
  hint: 'What does the rule give at $x = 0$?',
  feedback: 'A constant term keeps the rule linear but not proportional.',
});


// ================================================================ 8.5B
// Linear situations that do not pass through the origin.

mk('8.5B', 'equation-with-a-joining-fee', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'context',
  prompt: 'A gym charges $\\${{b}}$ to join and $\\${{m}}$ a month. Which equation gives the cost $y$ after $x$ months?',
  generator: {
    parameters: {
      b: { type: 'int', min: 15, max: 90, step: 5 },
      m: { type: 'int', min: 5, max: 40, step: 5 },
      x: { type: 'int', min: 2, max: 12 },
    },
    derived: { total: 'm*x+b', months: 'm*x' },
    constraints: ['m!=b'],
  },
  choices: [
    { label: plain('y = {{m}}x + {{b}}'), correct: true },
    { label: plain('y = {{b}}x + {{m}}'), error: 'ratioReversed' },
    { label: plain('y = {{m}}x'), error: 'partialTotal' },
    { label: plain('y = ({{m}} + {{b}})x'), error: 'operationInverted' },
  ],
  reasoning: ['After ${{x}}$ months the monthly charges come to $\\${{months}}$.', 'The joining fee is paid once, so the total is $\\${{total}}$ and the fee is not multiplied.'],
  answerSummary: { headline: 'A one-off fee is added; only the repeating charge is multiplied.', text: 'It is $y = {{m}}x + {{b}}$.' },
  hint: 'How many times is the joining fee paid?',
  feedback: 'Dropping the fee describes a gym that is free to join.',
});

mk('8.5B', 'equation-for-a-table-that-misses-the-origin', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'table',
  prompt: 'Which equation produces every row?',
  stimulus: {
    kind: 'table',
    title: 'Recorded values',
    table: { headers: ['x', 'y'], rows: [['{{x1}}', '{{y1}}'], ['{{x2}}', '{{y2}}'], ['{{x3}}', '{{y3}}']] },
  },
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 3, max: 25 },
      x1: { type: 'int', min: 1, max: 4 },
      gap: { type: 'int', min: 2, max: 4 },
    },
    derived: {
      x2: 'x1+gap', x3: 'x1+2*gap',
      y1: 'm*x1+b', y2: 'm*(x1+gap)+b', y3: 'm*(x1+2*gap)+b',
      ratio: 'round((m*x1+b)/x1)',
      mPlus: 'm+1',
    },
    constraints: ['ratio!=m', 'ratio!=mPlus'],
  },
  choices: [
    { label: plain('y = {{m}}x + {{b}}'), correct: true },
    { label: plain('y = {{ratio}}x'), error: 'partialTotal' },
    { label: plain('y = {{mPlus}}x + {{b}}'), error: 'offByOneStep' },
    { label: plain('y = {{m}}x - {{b}}'), error: 'signError' },
  ],
  reasoning: ['Each step of ${{gap}}$ in $x$ raises $y$ by ${{m}}$ times that, so the rate is ${{m}}$.', 'At $x = {{x1}}$ the value ${{y1}}$ needs a further ${{b}}$ beyond ${{m}} \\times {{x1}}$.'],
  answerSummary: { headline: 'Find the rate from the steps, then what is left over at any row.', text: 'It is $y = {{m}}x + {{b}}$.' },
  hint: 'Does a rule with no constant fit every row?',
  feedback: 'A proportional rule would miss every row but at most one.',
});

mk('8.5B', 'gap-between-two-plans', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'context',
  prompt: 'Two plans both charge $\\${{m}}$ a month, with joining fees of $\\${{b1}}$ and $\\${{b2}}$. After ${{x}}$ months, how much more is the first?',
  generator: {
    parameters: {
      // g and m share a range, so the monthly charge crosses the fee gap.
      b2: { type: 'int', min: 5, max: 60, step: 5 },
      g: { type: 'int', min: 2, max: 14 },
      m: { type: 'int', min: 2, max: 14 },
      x: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      b1: 'b2+g',
      answer: 'g',
      d_operationInverted: 'b2+b2+g',
      d_arithmeticSlip: 'g-m',
    },
    constraints: [],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: money('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
    { label: money('{{m}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Both plans charge the same each month, so the monthly part cancels.', 'Only the joining fees differ, by $\\${{answer}}$, and that gap never changes.'],
  answerSummary: { headline: 'Equal rates leave a gap that does not grow with time.', text: 'The first is $\\${{answer}}$ more, whatever ${{x}}$ is.' },
  hint: 'What is different between the two plans?',
  feedback: 'The monthly charge is the same on both, so it cannot open a gap.',
});

mk('8.5B', 'what-a-nonzero-constant-does', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'verbal',
  prompt: 'In $y = {{m}}x + {{b}}$, what does the ${{b}}$ do to the graph?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 3, max: 25 },
    },
    derived: { atZero: 'b', atOne: 'm+b', proportional: 'm' },
    constraints: [],
  },
  choices: [
    { label: 'It lifts the line so it crosses the vertical axis at ${{atZero}}$ instead of the origin.', correct: true },
    { label: 'It makes the line steeper, raising the rate to ${{atOne}}$.', error: 'ratioReversed' },
    { label: 'It has no effect on the graph, only on the arithmetic.', error: 'operationInverted' },
    { label: 'It bends the line, because the two terms disagree.', error: 'partialTotal' },
  ],
  reasoning: ['At $x = 0$ the rule gives ${{atZero}}$, so the line starts there rather than at the origin.', 'The steepness still comes from ${{m}}$ alone: at $x = 1$ the value is ${{atOne}}$, one step of ${{m}}$ above ${{atZero}}$.'],
  answerSummary: { headline: 'The constant moves the line up or down; the coefficient tilts it.', text: 'It lifts the crossing point to ${{atZero}}$.' },
  hint: 'What does the rule give at $x = 0$?',
  feedback: 'The rate of climb is unchanged by the constant.',
});

mk('8.5B', 'fee-left-out-of-the-equation', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'For a $\\${{b}}$ joining fee at $\\${{m}}$ a month a student writes $y = {{m}}x$. What is wrong?',
  generator: {
    parameters: {
      b: { type: 'int', min: 15, max: 90, step: 5 },
      m: { type: 'int', min: 5, max: 40, step: 5 },
      x: { type: 'int', min: 2, max: 12 },
    },
    derived: { right: 'm*x+b', wrong: 'm*x' },
    constraints: [],
  },
  choices: [
    { label: 'At ${{x}}$ months that gives $\\${{wrong}}$, but the real cost is $\\${{right}}$.', correct: true },
    { label: 'Nothing is wrong, because the fee is paid before the months start.', error: 'partialTotal' },
    { label: 'The fee should be multiplied in, giving $\\${{m}}$ times $\\${{b}}$ times ${{x}}$.', error: 'operationInverted' },
    { label: 'The rule is right but only for whole numbers of months.', error: 'usedGivenValue' },
  ],
  reasoning: ['The fee is real money and has to appear in the total.', 'It is paid once, so it is added rather than multiplied: $y = {{m}}x + {{b}}$.'],
  answerSummary: { headline: 'A one-off charge still belongs in the rule.', text: 'It should be $y = {{m}}x + {{b}}$.' },
  hint: 'Work out the cost after ${{x}}$ months both ways.',
  feedback: 'Being paid up front does not make the fee disappear.',
});

// ================================================================ 8.5E
// Direct variation.

mk('8.5E', 'find-y-under-direct-variation', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: '$y$ varies directly with $x$, and $y = {{y1}}$ when $x = {{x1}}$. What is $y$ when $x = {{x2}}$?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 12 },
      // x1 and x2 share a range, so the given y crosses the answer.
      x1: { type: 'int', min: 2, max: 12 },
      x2: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      y1: 'k*x1',
      answer: 'k*x2',
      d_offByOneStep: 'k*x2+k',
      d_operationInverted: 'k+x2',
    },
    constraints: ['x1!=x2'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{y1}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['${{y1}} \\div {{x1}} = {{k}}$, so $y = {{k}}x$.', 'At $x = {{x2}}$ that gives ${{answer}}$.'],
  answerSummary: { headline: 'Find the constant first, then use it.', text: '$y = {{answer}}$.' },
  hint: 'What is $y$ when $x$ is one?',
  feedback: 'That is the value at the first $x$, not the second.',
});

mk('8.5E', 'find-x-under-direct-variation', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'A direct variation passes through $({{x1}}, {{y1}})$. At which $x$ does $y$ reach ${{y2}}$?',
  generator: {
    parameters: {
      // k and x2 share a range, so the constant crosses the answer.
      k: { type: 'int', min: 2, max: 12 },
      x1: { type: 'int', min: 2, max: 9 },
      x2: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      y1: 'k*x1',
      y2: 'k*x2',
      answer: 'x2',
      d_forgotFinalStep: 'y2',
      d_operationInverted: 'x2-k',
    },
    constraints: ['x1!=x2'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{k}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The constant is ${{y1}} \\div {{x1}} = {{k}}$.', 'Dividing ${{y2}}$ by ${{k}}$ gives $x = {{answer}}$.'],
  answerSummary: { headline: 'Going from y back to x divides by the constant.', text: '$x = {{answer}}$.' },
  hint: 'What undoes multiplying by the constant?',
  feedback: 'The value of $y$ is not the value of $x$.',
});

mk('8.5E', 'stretch-of-a-spring', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A spring stretches ${{s1}}$ cm under ${{L1}}$ kg, and a second stretches ${{s2}}$ cm under the same load. How far does the first stretch under ${{L2}}$ kg?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      L1: { type: 'int', min: 2, max: 9 },
      L2: { type: 'int', min: 2, max: 14 },
      // The second spring's stretch is drawn separately, so it crosses the key.
      s2: { type: 'int', min: 3, max: 80 },
    },
    derived: {
      s1: 'k*L1',
      answer: 'k*L2',
      d_operationInverted: 'k+L2',
      d_offByOneStep: 'k*L2+k',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{s2}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The first spring stretches ${{s1}} \\div {{L1}} = {{k}}$ cm for each kilogram.', 'Under ${{L2}}$ kg that is ${{answer}}$ cm.'],
  answerSummary: { headline: 'Direct variation means a fixed amount per unit.', text: 'It stretches ${{answer}}$ cm.' },
  hint: 'How far does one kilogram stretch the first spring?',
  feedback: 'That is the second spring, which is a different spring.',
});

mk('8.5E', 'which-rule-is-direct-variation', {
  courseId: 'grade8',
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'Which equation shows $y$ varying directly with $x$?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 3, max: 25 },
    },
    derived: { atOne: 'k', atTwo: '2*k' },
    constraints: ['k!=b'],
  },
  choices: [
    { label: plain('y = {{k}}x'), correct: true },
    { label: plain('y = {{k}}x + {{b}}'), error: 'partialTotal' },
    { label: plain('y = \\frac{{{k}}}{x}'), error: 'ratioReversed' },
    { label: plain('y = x + {{k}}'), error: 'operationInverted' },
  ],
  reasoning: ['Direct variation needs $y$ to be a fixed multiple of $x$ and nothing else.', 'At $x = 1$ it gives ${{atOne}}$ and at $x = 2$ it gives ${{atTwo}}$, exactly double.'],
  answerSummary: { headline: 'Direct variation is a bare multiple, with no constant and no division.', text: 'It is $y = {{k}}x$.' },
  hint: 'What must happen to $y$ when $x$ doubles?',
  feedback: 'A constant term stops the doubling from carrying through.',
});

mk('8.5E', 'tripling-adds-three', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'In a direct variation a student says tripling $x$ adds $3$ to $y$. What is wrong?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 12 },
      x: { type: 'int', min: 2, max: 9 },
    },
    derived: { y: 'k*x', tripled: '3*k*x', added: 'k*x+3' },
    constraints: [],
  },
  choices: [
    { label: 'Tripling $x$ triples $y$: from ${{y}}$ to ${{tripled}}$, not to ${{added}}$.', correct: true },
    { label: 'Nothing is wrong, because both changes make $y$ larger.', error: 'operationInverted' },
    { label: 'Tripling $x$ leaves $y$ alone, because the constant does the work.', error: 'partialTotal' },
    { label: 'It adds $3$ only when the constant is $3$.', error: 'usedGivenValue' },
  ],
  reasoning: ['In $y = {{k}}x$ the output is a fixed multiple of the input.', 'Multiplying the input by three multiplies the output by three as well.'],
  answerSummary: { headline: 'Direct variation scales the output; it does not shift it.', text: '$y$ triples to ${{tripled}}$.' },
  hint: 'What happens to a multiple when its input triples?',
  feedback: 'Both do grow, which is why the mistake slips through.',
});

// ================================================================ 8.5F
// Telling proportional from non-proportional across representations.

mk('8.5F', 'is-this-situation-proportional', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'context',
  prompt: 'A printer charges $\\${{b}}$ for setup and $\\${{m}}$ a copy. Is the cost proportional to the number of copies?',
  generator: {
    parameters: {
      b: { type: 'int', min: 5, max: 60, step: 5 },
      m: { type: 'int', min: 2, max: 12 },
      x: { type: 'int', min: 2, max: 9 },
    },
    derived: { atX: 'm*x+b', atTwoX: '2*m*x+b', doubled: '2*m*x+2*b' },
    constraints: [],
  },
  choices: [
    { label: 'No: doubling the copies gives $\\${{atTwoX}}$, not double $\\${{atX}}$.', correct: true },
    { label: 'Yes: the cost rises by the same $\\${{m}}$ for every extra copy.', error: 'partialTotal' },
    { label: 'No: the cost per copy changes as more are printed.', error: 'operationInverted' },
    { label: 'Yes, as long as the setup charge is paid first.', error: 'ratioReversed' },
  ],
  reasoning: ['Proportional needs the cost to double when the copies do.', '${{x}}$ copies cost $\\${{atX}}$ and twice as many cost $\\${{atTwoX}}$, which is short of $\\${{doubled}}$.'],
  answerSummary: { headline: 'A setup charge breaks the doubling.', text: 'It is not proportional.' },
  hint: 'Try doubling the number of copies.',
  feedback: 'A constant rate per copy is not enough on its own.',
});

mk('8.5F', 'which-equation-is-proportional', {
  courseId: 'grade8',
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'Which of these equations is proportional?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 3, max: 25 },
    },
    derived: { sum: 'k+b' },
    constraints: ['k!=b'],
  },
  choices: [
    { label: plain('y = {{k}}x'), correct: true },
    { label: plain('y = {{k}}x + {{b}}'), error: 'partialTotal' },
    { label: plain('y = {{k}}x - {{b}}'), error: 'signError' },
    { label: plain('y = {{sum}} - x'), error: 'operationInverted' },
  ],
  reasoning: ['Proportional means $y$ is zero when $x$ is, and a fixed multiple otherwise.', 'Only $y = {{k}}x$ has no constant term to lift it off the origin.'],
  answerSummary: { headline: 'A proportional rule has nothing but the multiple.', text: 'It is $y = {{k}}x$.' },
  hint: 'What does each rule give at $x = 0$?',
  feedback: 'Subtracting a constant moves the line off the origin just as adding one does.',
});

mk('8.5F', 'two-straight-graphs', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'verbal',
  prompt: 'Two graphs are straight lines and only one passes through the origin. What follows?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 3, max: 25 },
      x: { type: 'int', min: 2, max: 9 },
    },
    derived: { through: 'k*x', off: 'k*x+b' },
    constraints: [],
  },
  choices: [
    { label: 'Only the one through the origin is proportional; both are linear.', correct: true },
    { label: 'Both are proportional, because both are straight.', error: 'partialTotal' },
    { label: 'Only the one through the origin is linear; the other is not.', error: 'ratioReversed' },
    { label: 'Neither is proportional unless both pass through the origin.', error: 'operationInverted' },
  ],
  reasoning: ['At $x = {{x}}$ one gives ${{through}}$ and the other ${{off}}$.', 'Both climb steadily, so both are linear, but only the first is zero at zero.'],
  answerSummary: { headline: 'Every proportional graph is linear; not every linear graph is proportional.', text: 'Only the one through the origin.' },
  hint: 'Which of the two conditions does each graph meet?',
  feedback: 'Straightness alone settles linearity, not proportionality.',
});

mk('8.5F', 'row-that-breaks-proportionality', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'procedural', representation: 'table',
  prompt: 'Three rows fit one proportional rule and one does not. Which row is wrong?',
  stimulus: {
    kind: 'table',
    title: 'Recorded values',
    table: { headers: ['x', 'y'], rows: [['{{x1}}', '{{y1}}'], ['{{x2}}', '{{y2}}'], ['{{x3}}', '{{bad}}'], ['{{x4}}', '{{y4}}']] },
  },
  generator: {
    parameters: {
      k: { type: 'int', min: 3, max: 12 },
      x1: { type: 'int', min: 2, max: 5 },
      off: { type: 'int', min: 1, max: 9 },
    },
    derived: {
      x2: 'x1+2', x3: 'x1+4', x4: 'x1+6',
      y1: 'k*x1', y2: 'k*(x1+2)', y4: 'k*(x1+6)',
      bad: 'k*(x1+4)+off',
    },
    constraints: [],
  },
  choices: [
    { label: plain('({{x3}}, {{bad}})'), correct: true },
    { label: plain('({{x1}}, {{y1}})'), error: 'partialTotal' },
    { label: plain('({{x2}}, {{y2}})'), error: 'operationInverted' },
    { label: plain('({{x4}}, {{y4}})'), error: 'usedGivenValue' },
  ],
  reasoning: ['Every other row divides out to ${{k}}$.', '${{bad}} \\div {{x3}}$ does not, because ${{off}}$ has been added on.'],
  answerSummary: { headline: 'A proportional table has one quotient in every row.', text: 'The row $({{x3}}, {{bad}})$ breaks it.' },
  hint: 'Divide each $y$ by its own $x$.',
  feedback: 'That row does divide out to ${{k}}$.',
});

mk('8.5F', 'steady-increase-read-as-proportional', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says a table is proportional because $y$ rises steadily. What is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 3, max: 25 },
      x1: { type: 'int', min: 1, max: 5 },
    },
    derived: {
      y1: 'm*x1+b',
      x2: 'x1+1',
      y2: 'm*x1+m+b',
    },
    constraints: [],
  },
  choices: [
    { label: 'The quotients differ: ${{y1}}$ over ${{x1}}$ is not ${{y2}}$ over ${{x2}}$.', correct: true },
    { label: 'Nothing is wrong, because a steady rise is what proportional means.', error: 'partialTotal' },
    { label: 'The rise is not steady; it grows as $x$ does.', error: 'operationInverted' },
    { label: 'Only a table starting at $x = 0$ can be judged at all.', error: 'usedGivenValue' },
  ],
  reasoning: ['A steady rise makes the table linear, which is a weaker claim.', 'Proportional needs each $y$ divided by its own $x$ to give the same value, and here they do not.'],
  answerSummary: { headline: 'Equal steps is linear; equal quotients is proportional.', text: 'The quotients do not match.' },
  hint: 'Divide each $y$ by its own $x$ and compare.',
  feedback: 'The rise really is steady; that is simply not the test.',
});

// ================================================================ 8.5G
// Which relations are functions.

mk('8.5G', 'which-set-of-pairs-is-a-function', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'orderedPairs',
  prompt: 'Which set of records is a function?',
  generator: {
    parameters: {
      a: { type: 'int', min: 1, max: 9 },
      p: { type: 'int', min: 1, max: 9 },
      q: { type: 'int', min: 1, max: 9 },
      r: { type: 'int', min: 1, max: 9 },
    },
    derived: { b: 'a+1', c: 'a+2', pAlt: 'p+3' },
    constraints: ['p!=q', 'q!=r', 'p!=r'],
  },
  choices: [
    { label: plain('({{a}}, {{p}}), ({{b}}, {{q}}), ({{c}}, {{r}})'), correct: true },
    { label: plain('({{a}}, {{p}}), ({{a}}, {{pAlt}}), ({{b}}, {{q}})'), error: 'operationInverted' },
    { label: plain('({{a}}, {{p}}), ({{b}}, {{q}}), ({{a}}, {{r}})'), error: 'partialTotal' },
    { label: plain('({{b}}, {{p}}), ({{b}}, {{q}}), ({{c}}, {{r}})'), error: 'ratioReversed' },
  ],
  reasoning: ['A function gives each input exactly one output.', 'Only the first set uses ${{a}}$, ${{b}}$ and ${{c}}$ once each.'],
  answerSummary: { headline: 'One output per input, no exceptions.', text: 'The set with three different inputs.' },
  hint: 'Look for an input that appears twice.',
  feedback: 'An input paired with two different outputs breaks the rule.',
});

mk('8.5G', 'repeated-input-in-a-table', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'table',
  prompt: 'Is the relation in the table a function?',
  stimulus: {
    kind: 'table',
    title: 'Recorded values',
    table: { headers: ['input', 'output'], rows: [['{{a}}', '{{p}}'], ['{{b}}', '{{q}}'], ['{{a}}', '{{r}}']] },
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 1, max: 9 },
      p: { type: 'int', min: 1, max: 20 },
      q: { type: 'int', min: 1, max: 20 },
      diff: { type: 'int', min: 1, max: 9 },
    },
    derived: { b: 'a+2', r: 'p+diff' },
    constraints: [],
  },
  choices: [
    { label: 'No, because ${{a}}$ appears twice with different outputs.', correct: true },
    { label: 'Yes, because every output is different.', error: 'ratioReversed' },
    { label: 'No, because two of the outputs are close together.', error: 'partialTotal' },
    { label: 'Yes, because a table always defines a function.', error: 'operationInverted' },
  ],
  reasoning: ['The input ${{a}}$ is listed with ${{p}}$ and again with ${{r}}$.', 'One input cannot have two outputs in a function.'],
  answerSummary: { headline: 'A repeated input with different outputs settles it.', text: 'No, it is not a function.' },
  hint: 'Read down the input column first.',
  feedback: 'Distinct outputs are not what the definition asks about.',
});

mk('8.5G', 'what-the-vertical-line-test-checks', {
  courseId: 'grade8',
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'verbal',
  prompt: 'What does the vertical line test check?',
  generator: {
    parameters: {
      a: { type: 'int', min: 1, max: 9 },
      p: { type: 'int', min: 1, max: 20 },
      diff: { type: 'int', min: 1, max: 9 },
    },
    derived: { r: 'p+diff', gap: 'diff' },
    constraints: [],
  },
  choices: [
    { label: 'Whether any input has more than one output.', correct: true },
    { label: 'Whether any output has more than one input.', error: 'ratioReversed' },
    { label: 'Whether the graph is a straight line.', error: 'operationInverted' },
    { label: 'Whether the graph passes through the origin.', error: 'partialTotal' },
  ],
  reasoning: ['A vertical line gathers every point sharing one input.', 'Two crossings mean that input has two outputs, such as ${{p}}$ and ${{r}}$ at $x = {{a}}$.'],
  answerSummary: { headline: 'The test looks along one input at a time.', text: 'Whether an input has more than one output.' },
  hint: 'What do all the points on one vertical line share?',
  feedback: 'Repeated outputs are allowed in a function.',
});

mk('8.5G', 'two-inputs-one-output', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'verbal',
  prompt: 'A mapping sends both ${{a}}$ and ${{b}}$ to ${{p}}$. Is it a function?',
  generator: {
    parameters: {
      a: { type: 'int', min: 1, max: 9 },
      p: { type: 'int', min: 1, max: 20 },
      step: { type: 'int', min: 1, max: 6 },
      c: { type: 'int', min: 10, max: 20 },
    },
    derived: { b: 'a+step', q: 'p+c' },
    constraints: [],
  },
  choices: [
    { label: 'Yes: two inputs may share an output, so long as neither has two.', correct: true },
    { label: 'No: every input needs an output of its own.', error: 'ratioReversed' },
    { label: 'Yes, but only because ${{a}}$ and ${{b}}$ are different.', error: 'partialTotal' },
    { label: 'No, unless one of them also maps to ${{q}}$.', error: 'operationInverted' },
  ],
  reasoning: ['The rule is about inputs, not outputs: each input needs exactly one output.', '${{a}}$ has only ${{p}}$ and ${{b}}$ has only ${{p}}$, so both are satisfied.'],
  answerSummary: { headline: 'Sharing an output is allowed; splitting an input is not.', text: 'Yes, it is a function.' },
  hint: 'How many outputs does each input have?',
  feedback: 'Nothing requires outputs to be used only once.',
});

mk('8.5G', 'shared-output-called-a-failure', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says a relation is not a function because ${{a}}$ and ${{b}}$ both give ${{p}}$. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 1, max: 9 },
      p: { type: 'int', min: 1, max: 20 },
      step: { type: 'int', min: 1, max: 6 },
      other: { type: 'int', min: 21, max: 40 },
    },
    derived: { b: 'a+step', q: 'other' },
    constraints: [],
  },
  choices: [
    { label: 'Sharing an output is allowed; only an input with two outputs would fail.', correct: true },
    { label: 'Nothing is wrong, because outputs must be used once each.', error: 'ratioReversed' },
    { label: 'It fails, but because ${{a}}$ and ${{b}}$ are different inputs.', error: 'operationInverted' },
    { label: 'It fails unless ${{b}}$ also gives ${{q}}$.', error: 'partialTotal' },
  ],
  reasoning: ['The definition constrains what leaves each input, not what arrives at each output.', 'A rule such as squaring sends two inputs to one output and is still a function.'],
  answerSummary: { headline: 'The condition runs from inputs outwards.', text: 'A shared output is fine.' },
  hint: 'Which side of the pairing does the definition restrict?',
  feedback: 'Outputs may be reused freely.',
});

// ================================================================ 8.5H
// Which real situations are proportional and which are not.

mk('8.5H', 'which-situation-is-proportional', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'verbal',
  prompt: 'Which of these situations is proportional?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 15 },
      b: { type: 'int', min: 5, max: 40, step: 5 },
      x: { type: 'int', min: 2, max: 9 },
    },
    derived: { plain: 'k*x', withFee: 'k*x+b' },
    constraints: [],
  },
  choices: [
    { label: 'Cloth at $\\${{k}}$ a metre with no other charge.', correct: true },
    { label: 'A taxi charging $\\${{b}}$ to start and $\\${{k}}$ a km.', error: 'partialTotal' },
    { label: 'A phone plan of $\\${{b}}$ a month whatever the usage.', error: 'operationInverted' },
    { label: 'A pool draining from $\\${{b}}$ litres at ${{k}}$ litres a minute.', error: 'signError' },
  ],
  reasoning: ['${{x}}$ metres of cloth cost $\\${{plain}}$, and no metres cost nothing.', 'Each of the others is worth something at zero, so none of them passes through the origin.'],
  answerSummary: { headline: 'Proportional situations charge nothing for nothing.', text: 'The cloth by the metre.' },
  hint: 'What does each situation cost when the amount is zero?',
  feedback: 'A starting charge puts the graph above the origin.',
});

mk('8.5H', 'which-situation-is-not-proportional', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'verbal',
  prompt: 'Three of these are proportional and one is not. Which is the odd one out?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 15 },
      b: { type: 'int', min: 5, max: 40, step: 5 },
      x: { type: 'int', min: 2, max: 9 },
    },
    derived: { plain: 'k*x', withFee: 'k*x+b', doubled: '2*k*x' },
    constraints: [],
  },
  choices: [
    { label: 'A delivery of $\\${{b}}$ plus $\\${{k}}$ an item.', correct: true },
    { label: 'Wire at $\\${{k}}$ a metre.', error: 'partialTotal' },
    { label: 'Pay at $\\${{k}}$ an hour with no bonus.', error: 'operationInverted' },
    { label: 'Fuel at $\\${{k}}$ a litre.', error: 'ratioReversed' },
  ],
  reasoning: ['The three by-the-unit charges all cost nothing for nothing and double when the amount doubles.', 'The delivery costs $\\${{b}}$ before any item is bought, so ${{x}}$ items cost $\\${{withFee}}$ rather than $\\${{plain}}$.'],
  answerSummary: { headline: 'The fixed charge is what breaks it.', text: 'The delivery with a fee.' },
  hint: 'Which one costs something when the amount is zero?',
  feedback: 'A plain rate per unit is proportional.',
});

mk('8.5H', 'cost-of-a-proportional-service', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'Wire costs $\\${{k}}$ a metre and rope $\\${{other}}$ a metre, both with no other charge. What do ${{x}}$ metres of wire cost?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 15 },
      x: { type: 'int', min: 2, max: 12 },
      // The rope's rate is drawn separately, so its total crosses the key.
      other: { type: 'int', min: 2, max: 15 },
    },
    derived: {
      answer: 'k*x',
      d_operationInverted: 'k+x',
      d_offByOneStep: 'k*x+k',
      d_usedGivenValue: 'other*x',
    },
    constraints: [],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: money('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['With no fixed charge the cost is proportional to the length.', '${{x}}$ metres at $\\${{k}}$ come to $\\${{answer}}$.'],
  answerSummary: { headline: 'A proportional cost is the rate times the amount.', text: 'It costs $\\${{answer}}$.' },
  hint: 'Which of the two rates applies to wire?',
  feedback: 'That total is for the rope.',
});

mk('8.5H', 'table-of-a-real-situation', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'table',
  prompt: 'The table records a taxi fare. Is the fare proportional to the distance?',
  stimulus: {
    kind: 'table',
    title: 'Fares',
    table: { headers: ['km', 'fare'], rows: [['{{x1}}', '\\${{y1}}'], ['{{x2}}', '\\${{y2}}'], ['{{x3}}', '\\${{y3}}']] },
  },
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 3, max: 20 },
      x1: { type: 'int', min: 1, max: 4 },
    },
    derived: {
      x2: 'x1+2', x3: 'x1+4',
      y1: 'm*x1+b', y2: 'm*(x1+2)+b', y3: 'm*(x1+4)+b',
    },
    constraints: [],
  },
  choices: [
    { label: 'No: the fare rises by $\\${{m}}$ a km but starts at $\\${{b}}$.', correct: true },
    { label: 'Yes: the fare rises by the same amount for each extra km.', error: 'partialTotal' },
    { label: 'No: the fare per km grows as the trip lengthens.', error: 'operationInverted' },
    { label: 'Yes: every fare divides by its distance to give $\\${{m}}$.', error: 'ratioReversed' },
  ],
  reasoning: ['Each extra kilometre adds $\\${{m}}$, so the fare is linear.', 'A ${{x1}}$ km trip costs $\\${{y1}}$ rather than $\\${{m}}$ times ${{x1}}$, because $\\${{b}}$ is charged before the meter runs.'],
  answerSummary: { headline: 'A flag fall makes a fare linear but not proportional.', text: 'Not proportional.' },
  hint: 'What would a trip of zero kilometres cost?',
  feedback: 'A constant increase per kilometre is not the same as a constant quotient.',
});

mk('8.5H', 'doubling-the-amount', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says a $\\${{b}}$ callout plus $\\${{k}}$ an hour is proportional because the hourly rate never changes. What is wrong?',
  generator: {
    parameters: {
      b: { type: 'int', min: 10, max: 80, step: 5 },
      k: { type: 'int', min: 5, max: 40, step: 5 },
      h: { type: 'int', min: 2, max: 9 },
    },
    derived: { atH: 'k*h+b', atTwoH: '2*k*h+b', doubled: '2*k*h+2*b' },
    constraints: [],
  },
  choices: [
    { label: 'Doubling the hours takes the bill to $\\${{atTwoH}}$, not to double $\\${{atH}}$.', correct: true },
    { label: 'Nothing is wrong, because a fixed rate is what proportional means.', error: 'partialTotal' },
    { label: 'The hourly rate does change once the callout is paid.', error: 'operationInverted' },
    { label: 'It is proportional only when the callout is larger than the rate.', error: 'usedGivenValue' },
  ],
  reasoning: ['${{h}}$ hours cost $\\${{atH}}$, and twice as many cost $\\${{atTwoH}}$.', 'Doubling the bill would need $\\${{doubled}}$, so the callout is counted once but ought to double.'],
  answerSummary: { headline: 'A fixed charge is paid once however long the job runs.', text: 'The bill does not double.' },
  hint: 'Work out the bill for twice as many hours.',
  feedback: 'The rate really is fixed; that alone does not make it proportional.',
});


// ================================================================ 8.5I
// Writing y = mx + b from whichever representation is handed over.
//
// The standard names four starting points — verbal, numerical, tabular and
// graphical — so the five families start from four different ones rather than
// asking the same question about the same table five times.

mk('8.5I', 'equation-from-a-description', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'verbal',
  prompt: 'A crew is paid $\\${{b}}$ for turning up and $\\${{m}}$ an hour. Which equation models the pay $y$ for $x$ hours?',
  generator: {
    parameters: {
      b: { type: 'int', min: 20, max: 90, step: 5 },
      m: { type: 'int', min: 5, max: 40, step: 5 },
      x: { type: 'int', min: 2, max: 10 },
    },
    derived: { total: 'm*x+b', hourly: 'm*x' },
    constraints: ['m!=b'],
  },
  choices: [
    { label: plain('y = {{m}}x + {{b}}'), correct: true },
    { label: plain('y = {{b}}x + {{m}}'), error: 'ratioReversed' },
    { label: plain('y = ({{m}} + {{b}})x'), error: 'operationInverted' },
    { label: plain('y = {{m}}x'), error: 'partialTotal' },
  ],
  reasoning: ['The hours earn $\\${{hourly}}$ after ${{x}}$ of them.', 'The turn-up payment arrives once, so it is added rather than multiplied.'],
  answerSummary: { headline: 'What repeats is multiplied; what happens once is added.', text: 'It is $y = {{m}}x + {{b}}$.' },
  hint: 'Which of the two payments depends on the hours?',
  feedback: 'Swapping the two numbers pays by the hour for turning up.',
});

mk('8.5I', 'equation-from-two-readings', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'procedural', representation: 'symbolic',
  prompt: 'A linear rule gives $y = {{y1}}$ at $x = {{x1}}$ and $y = {{y2}}$ at $x = {{x2}}$. Which equation is it?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 3, max: 25 },
      x1: { type: 'int', min: 1, max: 5 },
      run: { type: 'int', min: 2, max: 5 },
    },
    derived: {
      x2: 'x1+run',
      y1: 'm*x1+b', y2: 'm*(x1+run)+b',
      rise: 'm*run',
      mPlus: 'm+1',
    },
    constraints: ['rise!=m', 'rise!=mPlus'],
  },
  choices: [
    { label: plain('y = {{m}}x + {{b}}'), correct: true },
    { label: plain('y = {{rise}}x + {{b}}'), error: 'partialTotal' },
    { label: plain('y = {{m}}x + {{y1}}'), error: 'offByOneStep' },
    { label: plain('y = {{mPlus}}x + {{b}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['From the first reading to the second, $y$ rises ${{rise}}$ over a run of ${{run}}$, so the rate is ${{m}}$.', 'At $x = {{x1}}$ the rate accounts for ${{m}} \\times {{x1}}$, leaving ${{b}}$.'],
  answerSummary: { headline: 'Rise over run first, then work back to the constant.', text: 'It is $y = {{m}}x + {{b}}$.' },
  hint: 'The rise is not the rate until it is shared by the run.',
  feedback: 'The first $y$ is a value on the line, not the constant.',
});

mk('8.5I', 'equation-from-a-table-with-a-drop', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'table',
  prompt: 'Which equation produces the table?',
  stimulus: {
    kind: 'table',
    title: 'Recorded values',
    table: { headers: ['x', 'y'], rows: [['{{x1}}', '{{y1}}'], ['{{x2}}', '{{y2}}'], ['{{x3}}', '{{y3}}']] },
  },
  generator: {
    parameters: {
      // A falling line, so the rate is negative and the constant is the largest
      // value in sight — a shape the other table families do not use.
      m: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 60, max: 140, step: 5 },
      x1: { type: 'int', min: 1, max: 4 },
      gap: { type: 'int', min: 2, max: 4 },
    },
    derived: {
      x2: 'x1+gap', x3: 'x1+2*gap',
      y1: 'b-m*x1', y2: 'b-m*(x1+gap)', y3: 'b-m*(x1+2*gap)',
      negM: '0-m',
    },
    constraints: [],
  },
  choices: [
    { label: plain('y = {{negM}}x + {{b}}'), correct: true },
    { label: plain('y = {{m}}x + {{b}}'), error: 'signError' },
    { label: plain('y = {{negM}}x + {{y1}}'), error: 'offByOneStep' },
    { label: plain('y = {{b}}x - {{m}}'), error: 'ratioReversed' },
  ],
  reasoning: ['Each step of ${{gap}}$ in $x$ lowers $y$, so the rate is negative: ${{negM}}$.', 'Working back from $({{x1}}, {{y1}})$ to $x = 0$ adds ${{m}} \\times {{x1}}$, giving ${{b}}$.'],
  answerSummary: { headline: 'A falling column means a negative rate.', text: 'It is $y = {{negM}}x + {{b}}$.' },
  hint: 'Is $y$ rising or falling as $x$ grows?',
  feedback: 'A positive rate would make the column climb.',
});

mk('8.5I', 'equation-from-a-graph-reading', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'verbal',
  prompt: 'A line crosses the vertical axis at ${{b}}$ and rises ${{m}}$ for each step to the right. Which equation is it?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 3, max: 30 },
    },
    derived: { atOne: 'm+b', atTwo: '2*m+b' },
    constraints: ['m!=b'],
  },
  choices: [
    { label: plain('y = {{m}}x + {{b}}'), correct: true },
    { label: plain('y = {{b}}x + {{m}}'), error: 'ratioReversed' },
    { label: plain('y = {{m}}x + {{atOne}}'), error: 'offByOneStep' },
    { label: plain('y = {{atOne}}x + {{b}}'), error: 'partialTotal' },
  ],
  reasoning: ['The crossing point is the value at $x = 0$, which is ${{b}}$.', 'One step right reaches ${{atOne}}$ and two reach ${{atTwo}}$, a climb of ${{m}}$ each time.'],
  answerSummary: { headline: 'The crossing gives the constant; the climb gives the rate.', text: 'It is $y = {{m}}x + {{b}}$.' },
  hint: 'Which reading belongs to $x = 0$?',
  feedback: 'The value one step along is not the constant.',
});

mk('8.5I', 'rate-and-constant-swapped', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'From a line crossing at ${{b}}$ with slope ${{m}}$ a student writes $y = {{b}}x + {{m}}$. What is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 3, max: 30 },
    },
    derived: { atZeroRight: 'b', atZeroWrong: 'm' },
    constraints: ['m!=b'],
  },
  choices: [
    { label: 'That line crosses at ${{atZeroWrong}}$, not ${{atZeroRight}}$: the two numbers are the wrong way round.', correct: true },
    { label: 'Nothing is wrong, because both numbers appear in the equation.', error: 'operationInverted' },
    { label: 'The slope should be negative, because the line was read backwards.', error: 'signError' },
    { label: 'The equation needs a third number for the crossing point.', error: 'partialTotal' },
  ],
  reasoning: ['Setting $x = 0$ in the written rule leaves ${{atZeroWrong}}$, which is the slope.', 'The number multiplying $x$ is the rate, and the number added is the crossing point.'],
  answerSummary: { headline: 'Test an equation at x = 0 to see which number is which.', text: 'The two are swapped.' },
  hint: 'Put $x = 0$ into what the student wrote.',
  feedback: 'Using both numbers is not the same as using them in the right places.',
});

// ================================================================ 8.6A
// V = Bh for a cylinder.

mk('8.6A', 'what-b-stands-for', {
  courseId: 'grade8',
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'verbal',
  prompt: 'In $V = Bh$ for a cylinder, what does $B$ stand for?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 12 },
      h: { type: 'int', min: 3, max: 20 },
    },
    derived: { rsq: 'r*r', twoR: '2*r', vol: 'r*r*h' },
    constraints: [],
  },
  choices: [
    { label: 'The area of the circular base.', correct: true },
    { label: 'The distance round the base.', error: 'areaPerimeterSwap' },
    { label: 'The radius of the base.', error: 'partialTotal' },
    { label: 'The area of the curved surface.', error: 'operationInverted' },
  ],
  reasoning: ['A cylinder is its base carried straight up through its height.', 'With radius ${{r}}$ the base covers ${{rsq}}\\pi$, so the volume is ${{vol}}\\pi$.'],
  answerSummary: { headline: 'B is an area, which is why V = Bh gives a volume.', text: 'The area of the circular base.' },
  hint: 'What must $B$ measure for $Bh$ to be a volume?',
  feedback: 'A distance round is a length, and a length times a height is an area.',
});

mk('8.6A', 'volume-from-base-and-height', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'Two tanks have base areas ${{B}}$ and ${{B2}}$ square cm, and the first stands ${{h}}$ cm tall. What is its volume?',
  generator: {
    parameters: {
      B: { type: 'int', min: 4, max: 30 },
      h: { type: 'int', min: 3, max: 20 },
      // The second tank's base is drawn separately, so it crosses the key.
      B2: { type: 'int', min: 10, max: 400 },
    },
    derived: {
      answer: 'B*h',
      d_operationInverted: 'B+h',
      d_offByOneStep: 'B*h+B',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{B2}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Each centimetre of height adds another ${{B}}$ cubic cm.', 'Over ${{h}}$ cm that gives ${{answer}}$.'],
  answerSummary: { headline: 'Base area times height, with no other factor.', text: 'It holds ${{answer}}$ cubic cm.' },
  hint: 'What does one centimetre of height contribute?',
  feedback: 'That is the second tank, and a base area is not a volume.',
});

mk('8.6A', 'cylinder-volume-from-the-radius', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'Which expression gives the volume of a cylinder from its radius $r$ and height $h$?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 12 },
      h: { type: 'int', min: 3, max: 20 },
    },
    derived: { rsq: 'r*r', vol: 'r*r*h' },
    constraints: [],
  },
  choices: [
    { label: plain('\\pi r^2 h'), correct: true },
    { label: plain('2\\pi r h'), error: 'areaPerimeterSwap' },
    { label: plain('\\pi r h'), error: 'partialTotal' },
    { label: plain('\\frac{\\pi r^2 h}{3}'), error: 'operationInverted' },
  ],
  reasoning: ['The base is a circle of area $\\pi r^2$, which is ${{rsq}}\\pi$ when $r = {{r}}$.', 'Carried through a height of ${{h}}$ that fills ${{vol}}\\pi$.'],
  answerSummary: { headline: 'Put the circle formula into V = Bh.', text: 'It is $\\pi r^2 h$.' },
  hint: 'What is the area of the base?',
  feedback: 'The thirding belongs to a cone, not a cylinder.',
});

mk('8.6A', 'height-from-volume-and-base', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A tank of base area ${{B}}$ square cm holds ${{V}}$ cubic cm, and a second tank stands ${{h2}}$ cm tall. How tall is the first?',
  generator: {
    parameters: {
      B: { type: 'int', min: 4, max: 30 },
      e: { type: 'int', min: 1, max: 9 },
      // The second tank's height is drawn separately, so it crosses the key.
      h2: { type: 'int', min: 2, max: 18 },
    },
    derived: {
      h: '2*e',
      V: 'B*2*e',
      answer: 'h',
      d_forgotFinalStep: 'V',
      d_partialTotal: 'e',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{h2}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Each centimetre of height holds ${{B}}$ cubic cm.', '${{V}} \\div {{B}} = {{answer}}$ cm.'],
  answerSummary: { headline: 'Volume divided by base area gives the height.', text: 'It is ${{answer}}$ cm tall.' },
  hint: 'How much does one centimetre of height hold?',
  feedback: 'That is the second tank.',
});

mk('8.6A', 'circumference-used-as-the-base', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student puts the distance round the base in for $B$ in $V = Bh$. What is wrong?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 12 },
      h: { type: 'int', min: 3, max: 20 },
    },
    derived: { rsq: 'r*r', twoR: '2*r', vol: 'r*r*h', wrong: '2*r*h' },
    constraints: [],
  },
  choices: [
    { label: '$B$ must be an area: ${{rsq}}\\pi$, not the ${{twoR}}\\pi$ round the outside.', correct: true },
    { label: 'Nothing is wrong, because both describe the base.', error: 'operationInverted' },
    { label: 'The distance round is right but should be halved first.', error: 'partialTotal' },
    { label: 'The height should be squared instead, to make up the difference.', error: 'exponentError' },
  ],
  reasoning: ['A length times a height gives an area, not a volume: ${{wrong}}\\pi$ is the curved surface.', 'Using the base area ${{rsq}}\\pi$ gives the volume ${{vol}}\\pi$.'],
  answerSummary: { headline: 'Check the units before checking the arithmetic.', text: '$B$ is the base area.' },
  hint: 'What does a length times a height measure?',
  feedback: 'Describing the same circle does not make two measurements interchangeable.',
});

// ================================================================ 8.6B
// A cone against the cylinder that surrounds it.

mk('8.6B', 'cone-formula-from-the-cylinder', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'A cylinder holds $\\pi r^2 h$. Which expression gives a cone of the same base and height?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 12 },
      e: { type: 'int', min: 1, max: 6 },
    },
    derived: { h: '3*e', cyl: 'r*r*3*e', cone: 'r*r*e' },
    constraints: [],
  },
  choices: [
    { label: plain('\\frac{\\pi r^2 h}{3}'), correct: true },
    { label: plain('\\frac{\\pi r^2 h}{2}'), error: 'operationInverted' },
    { label: plain('3\\pi r^2 h'), error: 'ratioReversed' },
    { label: plain('\\frac{\\pi r h}{3}'), error: 'partialTotal' },
  ],
  reasoning: ['With $r = {{r}}$ and $h = {{h}}$ the cylinder holds ${{cyl}}\\pi$.', 'Three cones fill it, so each holds ${{cone}}\\pi$.'],
  answerSummary: { headline: 'The cone formula is the cylinder formula over three.', text: 'It is $\\frac{\\pi r^2 h}{3}$.' },
  hint: 'How many cones fill the cylinder?',
  feedback: 'Halving would be right for a triangle against a rectangle, not here.',
});

mk('8.6B', 'volume-of-a-cone', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'Two cones stand ${{h}}$ cm tall, with radii ${{r}}$ and ${{r2}}$ cm. What is the volume of the first?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 12 },
      r2: { type: 'int', min: 2, max: 12 },
      e: { type: 'int', min: 1, max: 6 },
    },
    derived: {
      h: '3*e',
      answer: 'r*r*e',
      d_forgotFinalStep: 'r*r*3*e',
      d_partialTotal: 'r*e',
      d_usedGivenValue: 'r2*r2*e',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}\\pi'), correct: true },
    { label: plain('{{d_forgotFinalStep}}\\pi'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}\\pi'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}\\pi'), error: 'usedGivenValue' },
  ],
  reasoning: ['The first base covers ${{r}} \\times {{r}}$ times $\\pi$, and the cylinder around it holds ${{d_forgotFinalStep}}\\pi$.', 'A cone holds a third of that: ${{answer}}\\pi$ cubic cm.'],
  answerSummary: { headline: 'Square the radius, multiply by the height, then take a third.', text: 'It holds ${{answer}}\\pi$ cubic cm.' },
  hint: 'What would the surrounding cylinder hold?',
  feedback: 'That is the cylinder, not the cone.',
});

mk('8.6B', 'cylinder-from-a-known-cone', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'Two cones hold ${{c}}$ and ${{c2}}$ cubic cm. What does a cylinder with the base and height of the first cone hold?',
  generator: {
    parameters: {
      // The second cone is drawn separately, so its cylinder crosses the key.
      c: { type: 'int', min: 4, max: 60 },
      c2: { type: 'int', min: 6, max: 180 },
    },
    derived: {
      answer: '3*c',
      d_offByOneStep: '4*c',
      d_partialTotal: 'c',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{c2}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Three cone-fulls fill the matching cylinder.', 'Three lots of ${{c}}$ is ${{answer}}$ cubic cm.'],
  answerSummary: { headline: 'Going from cone to cylinder multiplies by three.', text: 'It holds ${{answer}}$ cubic cm.' },
  hint: 'How many cone-fulls does the cylinder take?',
  feedback: 'That is the second cone.',
});

mk('8.6B', 'what-three-pourings-establish', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'verbal',
  prompt: 'Three cone-fulls of water exactly fill a cylinder of the same radius and height. What does that establish?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 12 },
      e: { type: 'int', min: 2, max: 8 },
    },
    derived: { h: '3*e', cone: 'r*r*e', cyl: 'r*r*3*e', afterTwo: 'r*r*2*e' },
    constraints: [],
  },
  choices: [
    { label: 'That a cone holds a third of the cylinder, so its volume is $\\frac{\\pi r^2 h}{3}$.', correct: true },
    { label: 'That a cone holds three times the cylinder, so its volume is $3\\pi r^2 h$.', error: 'ratioReversed' },
    { label: 'That the two hold the same, because their bases and heights match.', error: 'partialTotal' },
    { label: 'That a cone holds a third of the base area rather than of the volume.', error: 'operationInverted' },
  ],
  reasoning: ['Each pouring adds ${{cone}}\\pi$, so after two the cylinder holds ${{afterTwo}}\\pi$ with one to go.', 'Three equal pourings filling ${{cyl}}\\pi$ means each is a third of it.'],
  answerSummary: { headline: 'The pouring is the formula demonstrated.', text: 'A cone is a third: $\\frac{\\pi r^2 h}{3}$.' },
  hint: 'What does it mean that exactly three fill it?',
  feedback: 'The cylinder is the larger of the two.',
});

mk('8.6B', 'thirding-the-radius', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'For a cone a student divides the radius by three and then uses the cylinder formula. What is wrong?',
  generator: {
    parameters: {
      r: { type: 'int', min: 3, max: 12, step: 3 },
      e: { type: 'int', min: 1, max: 6 },
    },
    derived: {
      h: '3*e',
      right: 'r*r*e',
      wrong: 'r*r*e/3',
      third: 'r/3',
    },
    constraints: [],
  },
  choices: [
    { label: 'The thirding applies to the volume, not the radius: that gives ${{wrong}}\\pi$ instead of ${{right}}\\pi$.', correct: true },
    { label: 'Nothing is wrong, because dividing the radius divides the volume too.', error: 'operationInverted' },
    { label: 'The height should be divided by three instead of the radius.', error: 'partialTotal' },
    { label: 'The radius should be divided by nine, because it is squared.', error: 'exponentError' },
  ],
  reasoning: ['A radius of ${{r}}$ cut to ${{third}}$ is squared, so the base shrinks nine times over rather than three.', 'The third belongs at the end, to the finished volume.'],
  answerSummary: { headline: 'Divide the volume by three, not one of the lengths.', text: 'The volume is ${{right}}\\pi$.' },
  hint: 'What does squaring do to a thirded radius?',
  feedback: 'Dividing the radius by three divides the base by nine.',
});

// ================================================================ 8.6C
// The Pythagorean theorem as areas of squares on the sides.
//
// Every triangle here is generated from m and n as m^2 - n^2, 2mn, m^2 + n^2,
// so the sides form a genuine Pythagorean triple for every draw and the right
// angle is real rather than asserted.

mk('8.6C', 'squares-on-the-three-sides', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'verbal',
  prompt: 'Squares are drawn on all three sides of a right triangle. What is true of their areas?',
  generator: {
    parameters: {
      n: { type: 'int', min: 1, max: 5 },
      d: { type: 'int', min: 1, max: 4 },
    },
    derived: {
      m: 'n+d',
      a: '(n+d)*(n+d)-n*n',
      b: '2*n*(n+d)',
      c: '(n+d)*(n+d)+n*n',
      asq: '((n+d)*(n+d)-n*n)*((n+d)*(n+d)-n*n)',
      bsq: '4*n*n*(n+d)*(n+d)',
      csq: '((n+d)*(n+d)+n*n)*((n+d)*(n+d)+n*n)',
    },
    constraints: [],
  },
  choices: [
    { label: 'The two smaller areas add up to the largest.', correct: true },
    { label: 'The two smaller areas multiply to give the largest.', error: 'operationInverted' },
    { label: 'All three areas are equal.', error: 'partialTotal' },
    { label: 'The largest area is twice the smallest.', error: 'ratioReversed' },
  ],
  reasoning: ['With sides ${{a}}$, ${{b}}$ and ${{c}}$ the squares cover ${{asq}}$, ${{bsq}}$ and ${{csq}}$.', '${{asq}} + {{bsq}} = {{csq}}$, which is what the theorem says.'],
  answerSummary: { headline: 'The theorem is a statement about areas, not lengths.', text: 'The two smaller areas total the largest.' },
  hint: 'Work out the three areas and compare them.',
  feedback: 'Multiplying the two smaller areas gives a far larger number.',
});

mk('8.6C', 'area-of-the-third-square', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'table',
  prompt: 'The table gives the squares on the two shorter sides of a right triangle. What does the third square cover?',
  stimulus: {
    kind: 'table',
    title: 'Squares on the sides',
    table: { headers: ['side', 'square'], rows: [['shorter', '{{asq}}'], ['longer', '{{bsq}}'], ['third', '?']] },
  },
  generator: {
    parameters: {
      n: { type: 'int', min: 1, max: 3 },
      d: { type: 'int', min: 1, max: 3 },
      // A separately drawn area, so it crosses the key.
      other: { type: 'int', min: 20, max: 900 },
    },
    derived: {
      a: '(n+d)*(n+d)-n*n',
      b: '2*n*(n+d)',
      asq: '((n+d)*(n+d)-n*n)*((n+d)*(n+d)-n*n)',
      bsq: '4*n*n*(n+d)*(n+d)',
      answer: '((n+d)*(n+d)+n*n)*((n+d)*(n+d)+n*n)',
      d_signError: '4*n*n*(n+d)*(n+d)-((n+d)*(n+d)-n*n)*((n+d)*(n+d)-n*n)',
      d_arithmeticSlip: '((n+d)*(n+d)-n*n+2*n*(n+d))*((n+d)*(n+d)-n*n+2*n*(n+d))',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
    { label: plain('{{other}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The squares on the two shorter sides cover ${{asq}}$ and ${{bsq}}$.', 'Their total, ${{answer}}$, is what the square on the longest side covers.'],
  answerSummary: { headline: 'Add the two smaller squares to reach the largest.', text: 'It covers ${{answer}}$.' },
  hint: 'The theorem adds; it does not subtract.',
  feedback: 'Squaring the sum of the sides adds an extra rectangle twice over.',
});

mk('8.6C', 'length-of-the-longest-side', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A brace runs corner to corner across a right angle whose sides are ${{a}}$ and ${{b}}$ cm, beside a rod of ${{other}}$ cm. How long is the brace?',
  generator: {
    parameters: {
      n: { type: 'int', min: 1, max: 5 },
      d: { type: 'int', min: 1, max: 4 },
      // The rod is drawn separately, so its length crosses the key.
      other: { type: 'int', min: 3, max: 70 },
    },
    derived: {
      a: '(n+d)*(n+d)-n*n',
      b: '2*n*(n+d)',
      answer: '(n+d)*(n+d)+n*n',
      d_operationInverted: '(n+d)*(n+d)-n*n+2*n*(n+d)',
      d_signError: '2*n*(n+d)-((n+d)*(n+d)-n*n)',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{other}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The squares on ${{a}}$ and ${{b}}$ add to the square on the brace.', 'That total is ${{answer}}$ squared, so the brace is ${{answer}}$ cm.'],
  answerSummary: { headline: 'Add the squares, then take the root.', text: 'The brace is ${{answer}}$ cm.' },
  hint: 'Add the squares of the two sides first.',
  feedback: 'Adding the sides themselves overshoots the diagonal.',
});

mk('8.6C', 'testing-for-a-right-angle', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'verbal',
  prompt: 'A triangle has sides ${{a}}$, ${{b}}$ and ${{c}}$. Is its largest angle a right angle?',
  generator: {
    parameters: {
      n: { type: 'int', min: 1, max: 5 },
      d: { type: 'int', min: 1, max: 4 },
    },
    derived: {
      a: '(n+d)*(n+d)-n*n',
      b: '2*n*(n+d)',
      c: '(n+d)*(n+d)+n*n',
      asq: '((n+d)*(n+d)-n*n)*((n+d)*(n+d)-n*n)',
      bsq: '4*n*n*(n+d)*(n+d)',
      csq: '((n+d)*(n+d)+n*n)*((n+d)*(n+d)+n*n)',
      sum: '((n+d)*(n+d)-n*n)+2*n*(n+d)',
    },
    constraints: [],
  },
  choices: [
    { label: 'Yes: ${{asq}} + {{bsq}} = {{csq}}$, so the theorem holds in reverse.', correct: true },
    { label: 'No: ${{a}} + {{b}} = {{sum}}$, which is not ${{c}}$.', error: 'operationInverted' },
    { label: 'Yes, because ${{c}}$ is the largest of the three sides.', error: 'partialTotal' },
    { label: 'It cannot be told without measuring the angle.', error: 'usedGivenValue' },
  ],
  reasoning: ['The converse of the theorem says the angle is right exactly when the squares balance.', '${{asq}}$ and ${{bsq}}$ do total ${{csq}}$, so the angle is right.'],
  answerSummary: { headline: 'The theorem runs both ways, and it is about squares.', text: 'Yes, the squares balance.' },
  hint: 'Square all three sides and compare.',
  feedback: 'Adding the sides themselves is not the test.',
});

mk('8.6C', 'adding-the-sides-instead', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student adds the two shorter sides to find the longest. What is wrong?',
  generator: {
    parameters: {
      n: { type: 'int', min: 1, max: 5 },
      d: { type: 'int', min: 1, max: 4 },
    },
    derived: {
      a: '(n+d)*(n+d)-n*n',
      b: '2*n*(n+d)',
      c: '(n+d)*(n+d)+n*n',
      sum: '((n+d)*(n+d)-n*n)+2*n*(n+d)',
    },
    constraints: [],
  },
  choices: [
    { label: 'The squares add, not the sides: ${{a}}$ and ${{b}}$ give ${{c}}$, not ${{sum}}$.', correct: true },
    { label: 'Nothing is wrong, because the longest side is the largest number.', error: 'partialTotal' },
    { label: 'The sides should be subtracted rather than added.', error: 'signError' },
    { label: 'The two shorter sides should be multiplied instead.', error: 'operationInverted' },
  ],
  reasoning: ['Going straight across is shorter than going along two sides.', 'The theorem balances areas, so the squares are what add: ${{c}}$ rather than ${{sum}}$.'],
  answerSummary: { headline: 'The theorem adds areas, not lengths.', text: 'The longest side is ${{c}}$.' },
  hint: 'Compare the diagonal of a rectangle with going round two sides.',
  feedback: 'A diagonal is shorter than the two sides it replaces, not longer.',
});

// ================================================================ 8.7A
// Volumes of cylinders, cones and spheres.

mk('8.7A', 'volume-of-a-cylinder', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'A drum of radius ${{r}}$ cm sits beside one of radius ${{r2}}$ cm, both ${{h}}$ cm tall. What is the volume of the first drum?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 12 },
      r2: { type: 'int', min: 2, max: 12 },
      h: { type: 'int', min: 3, max: 20 },
    },
    derived: {
      answer: 'r*r*h',
      d_partialTotal: 'r*h',
      d_exponentError: 'r*r*r*h',
      d_usedGivenValue: 'r2*r2*h',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}\\pi'), correct: true },
    { label: plain('{{d_partialTotal}}\\pi'), error: 'partialTotal' },
    { label: plain('{{d_exponentError}}\\pi'), error: 'exponentError' },
    { label: plain('{{d_usedGivenValue}}\\pi'), error: 'usedGivenValue' },
  ],
  reasoning: ['The first base covers ${{r}} \\times {{r}}$ times $\\pi$.', 'Carried up ${{h}}$ cm that fills ${{answer}}\\pi$ cubic cm.'],
  answerSummary: { headline: 'Square the radius, then multiply by the height.', text: 'It holds ${{answer}}\\pi$ cubic cm.' },
  hint: 'What area does the base cover?',
  feedback: 'That is the second drum.',
});

mk('8.7A', 'volume-of-a-sphere', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'Two spheres have radii ${{r}}$ and ${{r2}}$ cm. What is the volume of the first?',
  generator: {
    parameters: {
      // Multiples of three, so four thirds of the cube stays a whole number.
      // t starts at 2: at t = 1 the cube and the square coincide and the
      // automatic constraint throws the draw away, which skewed the second
      // radius against a first that could never be smallest.
      t: { type: 'int', min: 2, max: 5 },
      t2: { type: 'int', min: 1, max: 6 },
    },
    derived: {
      r: '3*t', r2: '3*t2',
      answer: '36*t*t*t',
      d_exponentError: '36*t*t',
      d_operationInverted: '108*t*t*t',
      d_usedGivenValue: '36*t2*t2*t2',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}\\pi'), correct: true },
    { label: plain('{{d_exponentError}}\\pi'), error: 'exponentError' },
    { label: plain('{{d_operationInverted}}\\pi'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}\\pi'), error: 'usedGivenValue' },
  ],
  reasoning: ['A sphere holds $\\frac{4}{3}\\pi r^3$, and ${{r}}$ cubed is $27t^3$ with $t = {{t}}$.', 'Four thirds of that is ${{answer}}$, so the first sphere holds ${{answer}}\\pi$ cubic cm.'],
  answerSummary: { headline: 'Cube the radius, then take four thirds.', text: 'It holds ${{answer}}\\pi$ cubic cm.' },
  hint: 'The radius is cubed, not squared.',
  feedback: 'That is the second sphere.',
});

mk('8.7A', 'which-of-the-two-holds-more', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'verbal',
  prompt: 'A cylinder and a cone share a radius of ${{r}}$ cm and a height of ${{h}}$ cm. How much more does the cylinder hold?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 12 },
      e: { type: 'int', min: 1, max: 6 },
    },
    derived: {
      h: '3*e',
      cyl: 'r*r*3*e',
      cone: 'r*r*e',
      gap: 'r*r*2*e',
    },
    constraints: [],
  },
  choices: [
    { label: 'Twice the cone: ${{gap}}\\pi$ more.', correct: true },
    { label: 'Three times the cone: ${{cyl}}\\pi$ more.', error: 'partialTotal' },
    { label: 'The same as the cone: ${{cone}}\\pi$ more.', error: 'operationInverted' },
    { label: 'Nothing, because their bases and heights match.', error: 'ratioReversed' },
  ],
  reasoning: ['The cylinder holds ${{cyl}}\\pi$ and the cone ${{cone}}\\pi$.', 'The difference is ${{gap}}\\pi$, which is two cone-fulls, not three.'],
  answerSummary: { headline: 'Three cones fill the cylinder, so two are spare.', text: '${{gap}}\\pi$ cubic cm more.' },
  hint: 'The question asks for the gap, not the cylinder.',
  feedback: 'Three cone-fulls is the whole cylinder, not the extra room.',
});

mk('8.7A', 'height-of-a-drum', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A drum of radius ${{r}}$ cm holds ${{V}}\\pi$ cubic cm, and a second drum stands ${{h2}}$ cm tall. How tall is the first?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 10 },
      e: { type: 'int', min: 1, max: 9 },
      // The second drum's height is drawn separately, so it crosses the key.
      h2: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      h: '2*e',
      V: 'r*r*2*e',
      answer: 'h',
      d_forgotFinalStep: 'V',
      d_partialTotal: 'e',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{h2}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The base covers ${{r}} \\times {{r}}$ times $\\pi$.', 'Dividing ${{V}}\\pi$ by that base leaves a height of ${{answer}}$ cm.'],
  answerSummary: { headline: 'Volume divided by base area gives the height.', text: 'It is ${{answer}}$ cm tall.' },
  hint: 'What does one centimetre of height hold?',
  feedback: 'That is the second drum.',
});

mk('8.7A', 'diameter-used-as-the-radius', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'For a sphere of diameter ${{d}}$ cm a student puts ${{d}}$ in for the radius. What is wrong?',
  generator: {
    parameters: { t: { type: 'int', min: 1, max: 5 } },
    derived: {
      r: '3*t',
      d: '6*t',
      right: '4*27*t*t*t/3',
      wrong: '4*216*t*t*t/3',
    },
    constraints: [],
  },
  choices: [
    { label: 'The radius is ${{r}}$, half of ${{d}}$, and cubing the error makes the answer eight times too large.', correct: true },
    { label: 'Nothing is wrong, because both measure across the sphere.', error: 'operationInverted' },
    { label: 'The answer comes out twice too large, because the diameter is doubled.', error: 'partialTotal' },
    { label: 'The answer comes out four times too large, because the radius is squared.', error: 'exponentError' },
  ],
  reasoning: ['Using ${{r}}$ gives ${{right}}\\pi$; using ${{d}}$ gives ${{wrong}}\\pi$.', 'The radius is cubed, so doubling it multiplies the volume by eight.'],
  answerSummary: { headline: 'A cubed term feels a doubling three times over.', text: 'The result is eight times too large.' },
  hint: 'What does cubing do to a doubled length?',
  feedback: 'Squaring would give four times; cubing gives eight.',
});


// ================================================================ 8.7B
// Lateral and total surface area, cylinders included.
//
// 7.9D already covers boxes and their nets, so these lean on the cylinder: the
// curved surface unrolls into a rectangle whose width is the circumference,
// which is the connection the standard asks for.

mk('8.7B', 'curved-surface-unrolled', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'verbal',
  prompt: 'The curved surface of a cylinder is unrolled flat. What shape results, and what are its sides?',
  generator: {
    parameters: {
      r: { type: 'int', min: 3, max: 12 },
      h: { type: 'int', min: 3, max: 20 },
    },
    derived: { twoR: '2*r', rsq: 'r*r', lateral: '2*r*h' },
    constraints: [],
  },
  choices: [
    { label: 'A rectangle, ${{twoR}}\\pi$ round by ${{h}}$ tall.', correct: true },
    { label: 'A rectangle, ${{r}}\\pi$ round by ${{h}}$ tall.', error: 'partialTotal' },
    { label: 'A circle of radius ${{r}}$, repeated twice.', error: 'areaPerimeterSwap' },
    { label: 'A rectangle, ${{rsq}}\\pi$ round by ${{h}}$ tall.', error: 'exponentError' },
  ],
  reasoning: ['Cutting the tube straight down and flattening it leaves a rectangle.', 'Its width is the way round the base, ${{twoR}}\\pi$, and its height is the ${{h}}$ of the cylinder.'],
  answerSummary: { headline: 'The curved surface is a rectangle as wide as the base is round.', text: '${{twoR}}\\pi$ by ${{h}}$.' },
  hint: 'What distance does one trip round the base cover?',
  feedback: 'The circles are the two ends, not the curved part.',
});

mk('8.7B', 'lateral-surface-of-a-cylinder', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'Two tins stand ${{h}}$ cm tall, with radii ${{r}}$ and ${{r2}}$ cm. What is the label area round the first?',
  generator: {
    parameters: {
      // The second tin is drawn separately, so its label crosses the key.
      r: { type: 'int', min: 2, max: 12 },
      r2: { type: 'int', min: 2, max: 12 },
      h: { type: 'int', min: 3, max: 20 },
    },
    derived: {
      answer: '2*r*h',
      d_partialTotal: 'r*h',
      d_areaPerimeterSwap: '2*r*h+2*r*r',
      d_usedGivenValue: '2*r2*h',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}\\pi'), correct: true },
    { label: plain('{{d_partialTotal}}\\pi'), error: 'partialTotal' },
    { label: plain('{{d_areaPerimeterSwap}}\\pi'), error: 'areaPerimeterSwap' },
    { label: plain('{{d_usedGivenValue}}\\pi'), error: 'usedGivenValue' },
  ],
  reasoning: ['The label is a rectangle ${{answer}}\\pi$ wide when unrolled... more precisely $2\\pi r$ round by ${{h}}$ tall.', 'That comes to ${{answer}}\\pi$ square cm, with no ends included.'],
  answerSummary: { headline: 'Lateral surface is the way round times the height.', text: 'It is ${{answer}}\\pi$ square cm.' },
  hint: 'A label wraps the side but not the lid.',
  feedback: 'Adding the two ends gives the total surface, not the label.',
});

mk('8.7B', 'total-surface-of-a-cylinder', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'symbolic',
  prompt: 'Which expression gives the total surface area of a cylinder of radius $r$ and height $h$?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 12 },
      h: { type: 'int', min: 3, max: 20 },
    },
    derived: { lateral: '2*r*h', ends: '2*r*r', total: '2*r*h+2*r*r' },
    constraints: [],
  },
  choices: [
    { label: plain('2\\pi r h + 2\\pi r^2'), correct: true },
    { label: plain('2\\pi r h'), error: 'partialTotal' },
    { label: plain('2\\pi r h + \\pi r^2'), error: 'offByOneStep' },
    { label: plain('\\pi r^2 h'), error: 'areaPerimeterSwap' },
  ],
  reasoning: ['The curved part covers $2\\pi r h$, which is ${{lateral}}\\pi$ when $r = {{r}}$ and $h = {{h}}$.', 'Two circular ends add $2\\pi r^2$, or ${{ends}}\\pi$ more, for ${{total}}\\pi$ altogether.'],
  answerSummary: { headline: 'Curved surface plus two ends.', text: 'It is $2\\pi r h + 2\\pi r^2$.' },
  hint: 'How many flat faces does a cylinder have?',
  feedback: 'One end leaves the tin open at the top.',
});

mk('8.7B', 'lateral-surface-of-a-triangular-prism', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'context',
  prompt: 'Two prisms share a triangular end of sides ${{a}}$, ${{b}}$ and ${{c}}$ cm, and run ${{L}}$ and ${{L2}}$ cm long. What is the lateral surface of the first?',
  generator: {
    parameters: {
      // The three side lengths are drawn so the triangle can actually close.
      a: { type: 'int', min: 5, max: 15 },
      b: { type: 'int', min: 5, max: 15 },
      gap: { type: 'int', min: 1, max: 4 },
      L: { type: 'int', min: 3, max: 20 },
      L2: { type: 'int', min: 3, max: 20 },
    },
    derived: {
      c: 'a+b-gap',
      perim: 'a+b+a+b-gap',
      answer: '(a+b+a+b-gap)*L',
      d_partialTotal: '(a+b)*L',
      d_arithmeticSlip: '2*(a+b+a+b-gap)*L',
      d_usedGivenValue: '(a+b+a+b-gap)*L2',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The three rectangles round the sides have widths ${{a}}$, ${{b}}$ and ${{c}}$, totalling ${{perim}}$.', 'Each is ${{L}}$ cm long, so together they cover ${{answer}}$ square cm.'],
  answerSummary: { headline: 'Lateral surface is the perimeter of the end times the length.', text: 'It is ${{answer}}$ square cm.' },
  hint: 'How many rectangles wrap a triangular prism?',
  feedback: 'That is the second prism, which is a different length.',
});

mk('8.7B', 'ends-left-out-of-the-total', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student gives the total surface of a tin as $2\\pi r h$. What is wrong?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 12 },
      h: { type: 'int', min: 3, max: 20 },
    },
    derived: { lateral: '2*r*h', ends: '2*r*r', total: '2*r*h+2*r*r' },
    constraints: [],
  },
  choices: [
    { label: 'That is the curved part only: the two ends add ${{ends}}\\pi$ more, for ${{total}}\\pi$.', correct: true },
    { label: 'Nothing is wrong, because a cylinder has no flat faces.', error: 'operationInverted' },
    { label: 'One end should be added, giving ${{lateral}}\\pi$ plus half of ${{ends}}\\pi$.', error: 'offByOneStep' },
    { label: 'The expression measures a volume rather than a surface.', error: 'areaPerimeterSwap' },
  ],
  reasoning: ['$2\\pi r h$ is the label round the side, which is the lateral surface.', 'A closed tin also has a base and a lid, each covering $\\pi r^2$.'],
  answerSummary: { headline: 'Lateral leaves the ends out; total puts them back.', text: 'The total is ${{total}}\\pi$ square cm.' },
  hint: 'What does a tin have besides its side?',
  feedback: 'A cylinder has two flat circular faces.',
});

// ================================================================ 8.7C
// Using the theorem, and its converse, on real problems.

mk('8.7C', 'ladder-against-a-wall', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A ${{c}}$ m ladder stands ${{a}}$ m out from a wall, beside a ${{other}}$ m pole. How high up the wall does it reach?',
  generator: {
    parameters: {
      n: { type: 'int', min: 1, max: 4 },
      d: { type: 'int', min: 1, max: 3 },
      // The pole is drawn separately, so its height crosses the key.
      other: { type: 'int', min: 3, max: 45 },
    },
    derived: {
      a: '(n+d)*(n+d)-n*n',
      answer: '2*n*(n+d)',
      c: '(n+d)*(n+d)+n*n',
      d_operationInverted: '(n+d)*(n+d)+n*n-((n+d)*(n+d)-n*n)',
      d_partialTotal: '(n+d)*(n+d)+n*n+((n+d)*(n+d)-n*n)',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{other}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The ladder is the longest side, so its square equals the other two squares added.', 'Taking the ${{a}}$ square from the ${{c}}$ square leaves the square on ${{answer}}$.'],
  answerSummary: { headline: 'To find a shorter side, subtract the squares rather than adding them.', text: 'It reaches ${{answer}}$ m.' },
  hint: 'Which of the three lengths is the longest?',
  feedback: 'Subtracting the lengths themselves is not the theorem.',
});

mk('8.7C', 'diagonal-of-a-rectangle', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'A gate is ${{a}}$ cm by ${{b}}$ cm, and a brace of ${{other}}$ cm is to hand. How long is the gate diagonal?',
  generator: {
    parameters: {
      n: { type: 'int', min: 1, max: 4 },
      d: { type: 'int', min: 1, max: 3 },
      other: { type: 'int', min: 3, max: 60 },
    },
    derived: {
      a: '(n+d)*(n+d)-n*n',
      b: '2*n*(n+d)',
      answer: '(n+d)*(n+d)+n*n',
      d_operationInverted: '(n+d)*(n+d)-n*n+2*n*(n+d)',
      d_signError: '2*n*(n+d)-((n+d)*(n+d)-n*n)',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{other}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The diagonal closes a right angle whose sides are ${{a}}$ and ${{b}}$.', 'Adding the squares and taking the root gives ${{answer}}$ cm.'],
  answerSummary: { headline: 'A diagonal is the longest side of the triangle it makes.', text: 'It is ${{answer}}$ cm.' },
  hint: 'The two sides of the gate meet at a right angle.',
  feedback: 'Going along both sides is longer than cutting across.',
});

mk('8.7C', 'does-the-converse-hold', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'verbal',
  prompt: 'A frame has sides ${{a}}$, ${{b}}$ and ${{c}}$ cm. Is its corner square?',
  generator: {
    parameters: {
      n: { type: 'int', min: 1, max: 4 },
      d: { type: 'int', min: 1, max: 3 },
      off: { type: 'int', min: 1, max: 4 },
    },
    derived: {
      a: '(n+d)*(n+d)-n*n',
      b: '2*n*(n+d)',
      c: '(n+d)*(n+d)+n*n+off',
      asq: '((n+d)*(n+d)-n*n)*((n+d)*(n+d)-n*n)',
      bsq: '4*n*n*(n+d)*(n+d)',
      csq: '((n+d)*(n+d)+n*n+off)*((n+d)*(n+d)+n*n+off)',
      right: '(n+d)*(n+d)+n*n',
    },
    constraints: [],
  },
  choices: [
    { label: 'No: ${{asq}}$ and ${{bsq}}$ total less than ${{csq}}$, so the corner is open.', correct: true },
    { label: 'Yes: the three sides differ, which is what a right angle needs.', error: 'partialTotal' },
    { label: 'No: the sides ${{a}}$ and ${{b}}$ do not add to ${{c}}$.', error: 'operationInverted' },
    { label: 'Yes: a longest side of ${{c}}$ always closes a right angle.', error: 'usedGivenValue' },
  ],
  reasoning: ['The converse asks whether the two smaller squares total the largest.', 'Here they fall short — a longest side of ${{right}}$ would have made the corner square — so the angle is wider than a right angle.'],
  answerSummary: { headline: 'The converse is a test on the squares, and it can fail.', text: 'No, the corner is open.' },
  hint: 'Square all three and compare.',
  feedback: 'Adding the sides themselves is not the test.',
});

mk('8.7C', 'which-triple-is-right-angled', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'Which three lengths make a right-angled triangle?',
  generator: {
    parameters: {
      n: { type: 'int', min: 1, max: 4 },
      d: { type: 'int', min: 1, max: 3 },
      off: { type: 'int', min: 1, max: 3 },
    },
    derived: {
      a: '(n+d)*(n+d)-n*n',
      b: '2*n*(n+d)',
      c: '(n+d)*(n+d)+n*n',
      cBig: '(n+d)*(n+d)+n*n+off',
      cSmall: '(n+d)*(n+d)+n*n-off',
      sum: '(n+d)*(n+d)-n*n+2*n*(n+d)',
    },
    constraints: ['cBig!=sum', 'cSmall!=sum'],
  },
  choices: [
    { label: plain('{{a}}, {{b}}, {{c}}'), correct: true },
    { label: plain('{{a}}, {{b}}, {{cBig}}'), error: 'offByOneStep' },
    { label: plain('{{a}}, {{b}}, {{cSmall}}'), error: 'signError' },
    { label: plain('{{a}}, {{b}}, {{sum}}'), error: 'operationInverted' },
  ],
  reasoning: ['The squares on ${{a}}$ and ${{b}}$ total exactly the square on ${{c}}$.', 'Any other longest side leaves the two sides of the test unequal.'],
  answerSummary: { headline: 'Only one longest side makes the squares balance.', text: 'It is ${{a}}, {{b}}, {{c}}$.' },
  hint: 'Square each candidate longest side and compare.',
  feedback: 'A longest side equal to the other two added would lie flat.',
});

mk('8.7C', 'subtracting-when-adding-was-needed', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'To find the longest side from ${{a}}$ and ${{b}}$ a student subtracts the squares. What is wrong?',
  generator: {
    parameters: {
      n: { type: 'int', min: 1, max: 4 },
      d: { type: 'int', min: 1, max: 3 },
    },
    derived: {
      a: '(n+d)*(n+d)-n*n',
      b: '2*n*(n+d)',
      c: '(n+d)*(n+d)+n*n',
      asq: '((n+d)*(n+d)-n*n)*((n+d)*(n+d)-n*n)',
      bsq: '4*n*n*(n+d)*(n+d)',
      diff: '4*n*n*(n+d)*(n+d)-((n+d)*(n+d)-n*n)*((n+d)*(n+d)-n*n)',
    },
    constraints: [],
  },
  choices: [
    { label: 'Subtracting finds a shorter side; the longest needs ${{asq}} + {{bsq}}$, giving ${{c}}$.', correct: true },
    { label: 'Nothing is wrong, because either operation reaches the third side.', error: 'operationInverted' },
    { label: 'The subtraction is right but the answer ${{diff}}$ should not be rooted.', error: 'partialTotal' },
    { label: 'The squares should be multiplied rather than added.', error: 'arithmeticSlip' },
  ],
  reasoning: ['Subtracting is what finds a leg when the longest side is already known.', 'With two legs in hand the squares add, and the root of that total is ${{c}}$.'],
  answerSummary: { headline: 'Add to reach the longest side; subtract to come back from it.', text: 'The longest side is ${{c}}$.' },
  hint: 'Which side is the one being looked for?',
  feedback: 'The two operations answer opposite questions.',
});

// ================================================================ 8.7D
// Distance between two points on the coordinate plane.

mk('8.7D', 'distance-between-two-points', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'orderedPairs',
  prompt: 'A route runs from $({{x1}}, {{y1}})$ to $({{x2}}, {{y2}})$ and on to $({{x3}}, {{y3}})$. How long is the first leg?',
  generator: {
    parameters: {
      n: { type: 'int', min: 1, max: 4 },
      d: { type: 'int', min: 1, max: 3 },
      n2: { type: 'int', min: 1, max: 4 },
      d2: { type: 'int', min: 1, max: 3 },
      x1: { type: 'int', min: 1, max: 8 },
      y1: { type: 'int', min: 1, max: 8 },
    },
    derived: {
      run: '(n+d)*(n+d)-n*n',
      rise: '2*n*(n+d)',
      x2: 'x1+(n+d)*(n+d)-n*n',
      y2: 'y1+2*n*(n+d)',
      x3: 'x1+(n+d)*(n+d)-n*n+(n2+d2)*(n2+d2)-n2*n2',
      y3: 'y1+2*n*(n+d)+2*n2*(n2+d2)',
      answer: '(n+d)*(n+d)+n*n',
      d_operationInverted: '(n+d)*(n+d)-n*n+2*n*(n+d)',
      d_partialTotal: '2*n*(n+d)',
      d_usedGivenValue: '(n2+d2)*(n2+d2)+n2*n2',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Along the first leg $x$ moves ${{run}}$ and $y$ moves ${{rise}}$.', 'Those are the legs of a right angle, so the leg itself measures ${{answer}}$.'],
  answerSummary: { headline: 'The two coordinate changes are the legs; the distance is the longest side.', text: 'The first leg is ${{answer}}$ long.' },
  hint: 'How far does each coordinate move on the first leg?',
  feedback: 'That is the second leg of the route.',
});

mk('8.7D', 'why-the-theorem-applies', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'verbal',
  prompt: 'Why does the Pythagorean theorem give the distance between two points?',
  generator: {
    parameters: {
      n: { type: 'int', min: 1, max: 4 },
      d: { type: 'int', min: 1, max: 3 },
    },
    derived: {
      run: '(n+d)*(n+d)-n*n',
      rise: '2*n*(n+d)',
      dist: '(n+d)*(n+d)+n*n',
    },
    constraints: [],
  },
  choices: [
    { label: 'The horizontal and vertical moves meet at a right angle.', correct: true },
    { label: 'The two points always lie on a straight line through the origin.', error: 'operationInverted' },
    { label: 'The theorem works for any triangle, not only right ones.', error: 'partialTotal' },
    { label: 'The axes are equally scaled, which is all the theorem needs.', error: 'usedGivenValue' },
  ],
  reasoning: ['Going ${{run}}$ across and then ${{rise}}$ up traces two sides of a right angle.', 'The straight line between the points closes it, so its length is ${{dist}}$.'],
  answerSummary: { headline: 'The axes are perpendicular, which is what builds the right angle.', text: 'The two moves meet at a right angle.' },
  hint: 'What angle do the axes make with each other?',
  feedback: 'The theorem needs a right angle and fails without one.',
});

mk('8.7D', 'distance-across-the-origin', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'symbolic',
  prompt: 'Which expression gives the distance between $(-{{x1}}, -{{y1}})$ and $({{x2}}, {{y2}})$?',
  generator: {
    parameters: {
      n: { type: 'int', min: 1, max: 4 },
      d: { type: 'int', min: 1, max: 3 },
      split: { type: 'int', min: 1, max: 3 },
    },
    derived: {
      run: '(n+d)*(n+d)-n*n',
      rise: '2*n*(n+d)',
      x1: 'split',
      y1: 'split',
      x2: '(n+d)*(n+d)-n*n-split',
      y2: '2*n*(n+d)-split',
      dist: '(n+d)*(n+d)+n*n',
    },
    constraints: ['x2>0', 'y2>0'],
  },
  choices: [
    { label: plain('\\sqrt{({{x2}} + {{x1}})^2 + ({{y2}} + {{y1}})^2}'), correct: true },
    { label: plain('\\sqrt{({{x2}} - {{x1}})^2 + ({{y2}} - {{y1}})^2}'), error: 'signError' },
    { label: plain('({{x2}} + {{x1}}) + ({{y2}} + {{y1}})'), error: 'operationInverted' },
    { label: plain('\\sqrt{{{x2}}^2 + {{y2}}^2}'), error: 'partialTotal' },
  ],
  reasoning: ['Going from $-{{x1}}$ to ${{x2}}$ covers ${{x1}} + {{x2}} = {{run}}$, because the move crosses zero.', 'The same holds vertically, and those two legs give a distance of ${{dist}}$.'],
  answerSummary: { headline: 'Crossing zero adds the two distances rather than subtracting them.', text: 'The moves are ${{run}}$ and ${{rise}}$.' },
  hint: 'How far is it from $-{{x1}}$ to ${{x2}}$?',
  feedback: 'Subtracting treats both points as being on the same side of zero.',
});

mk('8.7D', 'points-on-one-horizontal-line', {
  courseId: 'grade8',
  // With no vertical move this reduces to a distance along a line, which is
  // what the student is really reading.
  difficultyBand: 1, dok: 1, taskType: 'interpretation', representation: 'numberLine',
  prompt: 'What is the distance between $({{x1}}, {{c}})$ and $({{x2}}, {{c}})$?',
  generator: {
    parameters: {
      // The shared height is a red herring drawn over the same span as the gap.
      x1: { type: 'int', min: 1, max: 12 },
      gap: { type: 'int', min: 2, max: 20 },
      c: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      x2: 'x1+gap',
      answer: 'gap',
      d_operationInverted: 'x1+x1+gap',
      d_partialTotal: 'x1',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{c}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Both points sit at the same height, so the vertical move is zero.', 'Only the horizontal move counts: ${{x2}} - {{x1}} = {{answer}}$.'],
  answerSummary: { headline: 'With no vertical move the theorem reduces to a subtraction.', text: 'They are ${{answer}}$ apart.' },
  hint: 'How far does the second coordinate move?',
  feedback: 'The shared height is not a distance between the points.',
});

mk('8.7D', 'adding-the-two-moves', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student finds the distance by adding the horizontal and vertical moves. What is wrong?',
  generator: {
    parameters: {
      n: { type: 'int', min: 1, max: 4 },
      d: { type: 'int', min: 1, max: 3 },
    },
    derived: {
      run: '(n+d)*(n+d)-n*n',
      rise: '2*n*(n+d)',
      sum: '(n+d)*(n+d)-n*n+2*n*(n+d)',
      dist: '(n+d)*(n+d)+n*n',
    },
    constraints: [],
  },
  choices: [
    { label: 'That measures going round the corner: ${{sum}}$ rather than the ${{dist}}$ straight across.', correct: true },
    { label: 'Nothing is wrong, because both moves are covered either way.', error: 'operationInverted' },
    { label: 'The moves should be subtracted, giving the difference of ${{run}}$ and ${{rise}}$.', error: 'signError' },
    { label: 'The moves should be multiplied, because area is involved.', error: 'areaPerimeterSwap' },
  ],
  reasoning: ['Walking ${{run}}$ across and then ${{rise}}$ up covers ${{sum}}$ in total.', 'The straight line cuts the corner, and the theorem gives it as ${{dist}}$.'],
  answerSummary: { headline: 'The straight line is shorter than the two sides it replaces.', text: 'The distance is ${{dist}}$.' },
  hint: 'Compare walking two sides of a rectangle with cutting across it.',
  feedback: 'Both moves are covered, but not by the shortest route.',
});

// ================================================================ 8.8A
// Writing an equation with the unknown on both sides.

mk('8.8A', 'equation-for-two-plans-meeting', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'context',
  prompt: 'Plan A costs $\\${{b1}}$ plus $\\${{m1}}$ a month and Plan B $\\${{b2}}$ plus $\\${{m2}}$ a month. Which equation finds when they match?',
  generator: {
    parameters: {
      m2: { type: 'int', min: 2, max: 14 },
      rise: { type: 'int', min: 2, max: 10 },
      b1: { type: 'int', min: 10, max: 80, step: 5 },
      drop: { type: 'int', min: 5, max: 40, step: 5 },
    },
    derived: {
      m1: 'm2+rise',
      b2: 'b1+drop',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{m1}}x + {{b1}} = {{m2}}x + {{b2}}'), correct: true },
    { label: plain('{{m1}}x + {{b1}} + {{m2}}x + {{b2}} = 0'), error: 'operationInverted' },
    { label: plain('{{b1}}x + {{m1}} = {{b2}}x + {{m2}}'), error: 'ratioReversed' },
    { label: plain('{{m1}}x = {{m2}}x'), error: 'partialTotal' },
  ],
  reasoning: ['Each plan has its own monthly charge and its own fixed fee.', 'They match when the two totals are equal, which is what setting the sides equal says.'],
  answerSummary: { headline: 'Matching costs means the two expressions are set equal.', text: 'It is ${{m1}}x + {{b1}} = {{m2}}x + {{b2}}$.' },
  hint: 'What has to be true when the two costs are the same?',
  feedback: 'Dropping the fees compares only the monthly parts.',
});

mk('8.8A', 'situation-behind-an-equation', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'symbolic',
  prompt: 'Which situation does ${{p}}x + {{a}} = {{q}}x + {{b}}$ describe?',
  generator: {
    parameters: {
      q: { type: 'int', min: 2, max: 9 },
      more: { type: 'int', min: 1, max: 6 },
      a: { type: 'int', min: 3, max: 40 },
      extra: { type: 'int', min: 2, max: 30 },
    },
    derived: {
      p: 'q+more',
      b: 'a+extra',
      leftAtTwo: '2*(q+more)+a',
      rightAtTwo: '2*q+a+extra',
    },
    constraints: [],
  },
  choices: [
    { label: 'Two ropes of ${{a}}$ and ${{b}}$ m, plus ${{p}}$ and ${{q}}$ equal pieces, come to the same length.', correct: true },
    { label: 'Two ropes of ${{p}}$ and ${{q}}$ m, plus ${{a}}$ and ${{b}}$ equal pieces, come to the same length.', error: 'ratioReversed' },
    { label: 'A rope of ${{a}}$ m is cut into ${{p}}$ pieces and another of ${{b}}$ m into ${{q}}$.', error: 'operationInverted' },
    { label: 'The pieces on the left total ${{a}}$ m and those on the right total ${{b}}$ m.', error: 'partialTotal' },
  ],
  reasoning: ['The number multiplying $x$ counts the pieces of unknown length; the number added is a fixed length.', 'With two pieces each the sides come to ${{leftAtTwo}}$ and ${{rightAtTwo}}$, which agree only at the right $x$.'],
  answerSummary: { headline: 'Read the coefficient as a count and the constant as a fixed amount.', text: 'Fixed lengths of ${{a}}$ and ${{b}}$ with ${{p}}$ and ${{q}}$ pieces.' },
  hint: 'Which number counts things, and which is a length on its own?',
  feedback: 'The coefficients count pieces; they are not lengths themselves.',
});

mk('8.8A', 'inequality-with-both-sides', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'Plan A costs $\\${{m1}}$ a month plus $\\${{b1}}$; Plan B costs $\\${{m2}}$ a month plus $\\${{b2}}$. Which inequality says A is cheaper?',
  generator: {
    parameters: {
      m2: { type: 'int', min: 2, max: 14 },
      rise: { type: 'int', min: 2, max: 10 },
      b1: { type: 'int', min: 10, max: 80, step: 5 },
      drop: { type: 'int', min: 5, max: 40, step: 5 },
    },
    derived: { m1: 'm2+rise', b2: 'b1+drop', atOneA: 'm2+rise+b1', atOneB: 'm2+b1+drop' },
    constraints: [],
  },
  choices: [
    { label: plain('{{m1}}x + {{b1}} < {{m2}}x + {{b2}}'), correct: true },
    { label: plain('{{m1}}x + {{b1}} > {{m2}}x + {{b2}}'), error: 'ratioReversed' },
    { label: plain('{{m1}}x + {{b1}} \\le {{m2}}x + {{b2}}'), error: 'offByOneStep' },
    { label: plain('{{m1}}x < {{m2}}x'), error: 'partialTotal' },
  ],
  reasoning: ['After one month A has cost $\\${{atOneA}}$ and B $\\${{atOneB}}$, so which is cheaper depends on how long the plan runs.', 'Cheaper means strictly less, and both totals carry a monthly charge and a fee.'],
  answerSummary: { headline: 'Cheaper is a strict inequality between the two full costs.', text: 'It is ${{m1}}x + {{b1}} < {{m2}}x + {{b2}}$.' },
  hint: 'Does cheaper allow the two to be equal?',
  feedback: 'Allowing equality would let the two cost the same.',
});

mk('8.8A', 'inequality-from-a-balance', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'table',
  prompt: 'The left pan tips down. Which inequality says so?',
  stimulus: {
    kind: 'table',
    title: 'What each pan holds',
    table: {
      headers: ['pan', 'boxes', 'loose kg'],
      rows: [['left', '{{p}}', '{{a}}'], ['right', '{{q}}', '{{b}}']],
    },
  },
  generator: {
    parameters: {
      q: { type: 'int', min: 2, max: 9 },
      more: { type: 'int', min: 2, max: 9 },
      a: { type: 'int', min: 2, max: 30 },
      v: { type: 'int', min: 2, max: 12 },
      slack: { type: 'int', min: 1, max: 20 },
    },
    derived: {
      p: 'q+more',
      b: 'a+more*v-slack',
      leftTotal: '(q+more)*v+a',
      rightTotal: 'q*v+a+more*v-slack',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{p}}x + {{a}} > {{q}}x + {{b}}'), correct: true },
    { label: plain('{{p}}x + {{a}} < {{q}}x + {{b}}'), error: 'ratioReversed' },
    { label: plain('{{p}}x + {{a}} = {{q}}x + {{b}}'), error: 'partialTotal' },
    { label: plain('{{p}} + {{a}}x > {{q}} + {{b}}x'), error: 'operationInverted' },
  ],
  reasoning: ['Tipping down means the left pan is the heavier of the two.', 'At a box mass of ${{v}}$ kg the pans hold ${{leftTotal}}$ and ${{rightTotal}}$ kg, and the left is indeed heavier.'],
  answerSummary: { headline: 'A pan that tips down is strictly heavier.', text: 'It is ${{p}}x + {{a}} > {{q}}x + {{b}}$.' },
  hint: 'Which pan is carrying more?',
  feedback: 'An equals sign would describe a balance, not a tip.',
});

mk('8.8A', 'unknown-collected-too-early', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'For two plans a student writes ${{m1}}x = {{m2}}x$ and drops the fees. What is wrong?',
  generator: {
    parameters: {
      m2: { type: 'int', min: 2, max: 14 },
      rise: { type: 'int', min: 2, max: 10 },
      b1: { type: 'int', min: 10, max: 80, step: 5 },
      drop: { type: 'int', min: 5, max: 40, step: 5 },
    },
    derived: { m1: 'm2+rise', b2: 'b1+drop' },
    constraints: [],
  },
  choices: [
    { label: 'The fees are part of each cost: it should read ${{m1}}x + {{b1}} = {{m2}}x + {{b2}}$.', correct: true },
    { label: 'Nothing is wrong, because the fees are the same on both sides.', error: 'partialTotal' },
    { label: 'The fees belong on the same side, added together.', error: 'operationInverted' },
    { label: 'The equation is right but has no solution.', error: 'usedGivenValue' },
  ],
  reasoning: ['The fees differ, $\\${{b1}}$ against $\\${{b2}}$, so they cannot cancel.', 'Each side has to state that plan cost in full before the two are set equal.'],
  answerSummary: { headline: 'Only equal terms cancel, and these are not equal.', text: 'It should be ${{m1}}x + {{b1}} = {{m2}}x + {{b2}}$.' },
  hint: 'Are the two fees the same amount?',
  feedback: 'Terms cancel across an equals sign only when they match.',
});

// ================================================================ 8.8C
// Solving when the unknown appears on both sides.

mk('8.8C', 'solve-with-x-on-both-sides', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Solve ${{m1}}x + {{b1}} = {{m2}}x + {{b2}}$.',
  generator: {
    parameters: {
      // The coefficient gap and the answer share a range, so the gap crosses.
      m2: { type: 'int', min: 2, max: 12 },
      rise: { type: 'int', min: 2, max: 12 },
      v: { type: 'int', min: 2, max: 12 },
      b1: { type: 'int', min: 3, max: 40 },
    },
    derived: {
      m1: 'm2+rise',
      b2: 'b1+rise*v',
      answer: 'v',
      d_forgotFinalStep: 'rise*v',
      d_operationInverted: 'v-rise',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{rise}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Taking ${{m2}}x$ from both sides leaves ${{rise}}x + {{b1}} = {{b2}}$.', 'Then ${{b2}} - {{b1}} = {{d_forgotFinalStep}}$, and dividing by ${{rise}}$ gives ${{answer}}$.'],
  answerSummary: { headline: 'Gather the unknown on one side first.', text: '$x = {{answer}}$.' },
  hint: 'What happens if you take the smaller $x$ term off both sides?',
  feedback: 'The division has not been done yet.',
});

mk('8.8C', 'cost-where-two-plans-meet', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'Plan A is $\\${{b1}}$ plus $\\${{m1}}$ a month, Plan B $\\${{b2}}$ plus $\\${{m2}}$, and Plan C a flat $\\${{flat}}$. What do A and B cost where they match?',
  generator: {
    parameters: {
      m2: { type: 'int', min: 2, max: 12 },
      rise: { type: 'int', min: 2, max: 12 },
      v: { type: 'int', min: 2, max: 12 },
      b1: { type: 'int', min: 5, max: 40, step: 5 },
      flat: { type: 'int', min: 10, max: 200, step: 5 },
    },
    derived: {
      m1: 'm2+rise',
      b2: 'b1+rise*v',
      answer: '(m2+rise)*v+b1',
      d_partialTotal: 'v',
      d_offByOneStep: '(m2+rise)*v+b1+m2+rise',
      d_usedGivenValue: 'flat',
    },
    constraints: [],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Plan A gains $\\${{rise}}$ a month, so it closes the fee gap after ${{v}}$ months.', 'At that point Plan A has cost $\\${{m1}} \\times {{v}} + \\${{b1}} = \\${{answer}}$.'],
  answerSummary: { headline: 'Find when they meet, then work out what that costs.', text: 'They both cost $\\${{answer}}$.' },
  hint: 'Find the month first, then the money.',
  feedback: 'That is Plan C, which never enters the comparison.',
});

mk('8.8C', 'no-solution-or-every-value', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'How many values of $x$ satisfy ${{m}}x + {{b1}} = {{m}}x + {{b2}}$?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      b1: { type: 'int', min: 3, max: 40 },
      drop: { type: 'int', min: 2, max: 20 },
    },
    derived: { b2: 'b1+drop', diff: 'drop' },
    constraints: [],
  },
  choices: [
    { label: 'None, because the sides differ by ${{diff}}$ whatever $x$ is.', correct: true },
    { label: 'Exactly one, found by dividing ${{diff}}$ by ${{m}}$.', error: 'operationInverted' },
    { label: 'Every value, because both sides have the same $x$ term.', error: 'partialTotal' },
    { label: 'Exactly one, at $x = {{diff}}$.', error: 'usedGivenValue' },
  ],
  reasoning: ['Taking ${{m}}x$ from both sides leaves ${{b1}} = {{b2}}$, which is false.', 'No value of $x$ can mend a gap the unknown never touches.'],
  answerSummary: { headline: 'When the unknown cancels, the constants decide everything.', text: 'No value works.' },
  hint: 'What is left after the $x$ terms cancel?',
  feedback: 'Matching $x$ terms is not enough if the constants disagree.',
});

mk('8.8C', 'total-mass-on-a-pan', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 2, taskType: 'representationTranslation', representation: 'table',
  prompt: 'The two pans balance, and a third holds ${{spare}}$ kg. What does the left pan hold altogether?',
  stimulus: {
    kind: 'table',
    title: 'What each pan holds',
    table: {
      headers: ['pan', 'boxes', 'loose kg'],
      rows: [['left', '{{p}}', '{{a}}'], ['right', '{{q}}', '{{b}}']],
    },
  },
  generator: {
    parameters: {
      q: { type: 'int', min: 2, max: 9 },
      more: { type: 'int', min: 2, max: 12 },
      a: { type: 'int', min: 2, max: 30 },
      v: { type: 'int', min: 2, max: 12 },
      spare: { type: 'int', min: 5, max: 200, step: 5 },
    },
    derived: {
      p: 'q+more',
      b: 'a+more*v',
      answer: '(q+more)*v+a',
      d_partialTotal: 'v',
      d_offByOneStep: '(q+more)*v+a+more*v',
      d_usedGivenValue: 'spare',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Taking ${{q}}$ boxes off each pan leaves ${{more}}$ boxes against ${{more}} \\times {{v}}$ loose kilograms, so a box weighs ${{v}}$ kg.', 'The left pan then holds ${{p}} \\times {{v}} + {{a}} = {{answer}}$ kg.'],
  answerSummary: { headline: 'Solve for one box, then total the pan.', text: 'The left pan holds ${{answer}}$ kg.' },
  hint: 'Find one box first, then add everything on the left.',
  feedback: 'That is what one box weighs, not the whole pan.',
});

mk('8.8C', 'cancelling-unequal-terms', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'Solving ${{m1}}x + {{b1}} = {{m2}}x + {{b2}}$ a student cancels the two $x$ terms outright. What is wrong?',
  generator: {
    parameters: {
      m2: { type: 'int', min: 2, max: 12 },
      rise: { type: 'int', min: 2, max: 12 },
      v: { type: 'int', min: 2, max: 12 },
      b1: { type: 'int', min: 3, max: 40 },
    },
    derived: {
      m1: 'm2+rise',
      b2: 'b1+rise*v',
      gap: 'rise*v',
    },
    constraints: [],
  },
  choices: [
    { label: 'They are unequal: taking ${{m2}}x$ off both sides leaves ${{rise}}x$, not nothing.', correct: true },
    { label: 'Nothing is wrong, because both sides contain an $x$ term.', error: 'partialTotal' },
    { label: 'The $x$ terms should be added instead, giving a larger coefficient.', error: 'operationInverted' },
    { label: 'The constants should have been cancelled first.', error: 'orderOfOperations' },
  ],
  reasoning: ['Only equal quantities cancel, and ${{m1}}x$ is larger than ${{m2}}x$.', 'Removing the smaller from both sides leaves ${{rise}}x$ facing a gap of ${{gap}}$.'],
  answerSummary: { headline: 'Subtract the smaller term from both sides; do not delete both.', text: '${{rise}}x$ is left over.' },
  hint: 'Are the two coefficients the same?',
  feedback: 'Sharing a letter does not make two terms equal.',
});


// ================================================================ 8.8D
// Informal arguments about angles: the angle sum, the exterior angle, parallel
// lines cut by a transversal, and the angle-angle criterion.

mk('8.8D', 'exterior-angle-of-a-triangle', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'Two interior angles of a triangle are ${{a}}^\\circ$ and ${{b}}^\\circ$. What is the exterior angle at the third vertex?',
  generator: {
    parameters: {
      // The two angles are capped so their total straddles 90 degrees, which
      // is where the remaining interior angle crosses the exterior one.
      a: { type: 'int', min: 15, max: 75 },
      b: { type: 'int', min: 15, max: 75 },
    },
    derived: {
      answer: 'a+b',
      third: '180-a-b',
      d_arithmeticSlip: '360-a-b',
      d_signError: 'b-a',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}^\\circ'), correct: true },
    { label: plain('{{d_arithmeticSlip}}^\\circ'), error: 'arithmeticSlip' },
    { label: plain('{{d_signError}}^\\circ'), error: 'signError' },
    { label: plain('{{third}}^\\circ'), error: 'partialTotal' },
  ],
  reasoning: ['The third interior angle is $180 - {{a}} - {{b}} = {{third}}$.', 'The exterior angle beside it makes a straight line, so it is $180 - {{third}} = {{answer}}$, the other two added.'],
  answerSummary: { headline: 'An exterior angle equals the two interior angles it is not beside.', text: 'It is ${{answer}}^\\circ$.' },
  hint: 'Work out the third interior angle first.',
  feedback: 'That is the interior angle at that vertex, not the exterior one.',
});

mk('8.8D', 'angles-on-a-transversal', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'verbal',
  prompt: 'Parallel lines are cut by a transversal and one angle measures ${{a}}^\\circ$. Which statement is true?',
  generator: {
    parameters: { a: { type: 'int', min: 25, max: 155 } },
    derived: { supp: '180-a', twice: '2*a' },
    constraints: [],
  },
  choices: [
    { label: 'Each corresponding angle is also ${{a}}^\\circ$, and each co-interior angle is ${{supp}}^\\circ$.', correct: true },
    { label: 'Each corresponding angle is ${{supp}}^\\circ$, and each co-interior angle is ${{a}}^\\circ$.', error: 'ratioReversed' },
    { label: 'Every angle formed is ${{a}}^\\circ$, because the lines are parallel.', error: 'partialTotal' },
    { label: 'Each corresponding angle is ${{twice}}^\\circ$, twice the one given.', error: 'operationInverted' },
  ],
  reasoning: ['Sliding along the transversal carries an angle onto its corresponding partner unchanged.', 'A co-interior angle sits beside that partner on a straight line, so it makes up ${{supp}}$.'],
  answerSummary: { headline: 'Corresponding angles match; co-interior angles make a straight line.', text: '${{a}}^\\circ$ and ${{supp}}^\\circ$.' },
  hint: 'Which pairs are equal and which pairs add to a straight line?',
  feedback: 'The eight angles come in two sizes, not one.',
});

mk('8.8D', 'why-the-angles-total-180', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'verbal',
  prompt: 'A line is drawn through one vertex of a triangle parallel to the opposite side. What does that show?',
  generator: {
    parameters: {
      a: { type: 'int', min: 20, max: 70 },
      b: { type: 'int', min: 20, max: 70 },
    },
    derived: { third: '180-a-b', pair: 'a+b' },
    constraints: [],
  },
  choices: [
    { label: 'The three angles lie along a straight line, so they total $180^\\circ$.', correct: true },
    { label: 'The triangle is similar to itself, so its angles are fixed.', error: 'operationInverted' },
    { label: 'The two base angles are equal, so the third is ${{third}}^\\circ$.', error: 'partialTotal' },
    { label: 'The angles total $360^\\circ$, because a full turn is made.', error: 'arithmeticSlip' },
  ],
  reasoning: ['The two base angles reappear at the vertex as alternate angles, ${{a}}$ and ${{b}}$.', 'With the vertex angle between them they fill a straight line: ${{pair}} + {{third}} = 180$.'],
  answerSummary: { headline: 'The parallel line gathers all three angles onto one straight line.', text: 'They total $180^\\circ$.' },
  hint: 'Which angles reappear at the vertex, and why?',
  feedback: 'A straight line is half a full turn.',
});

mk('8.8D', 'two-matching-angles', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'symbolic',
  prompt: 'One triangle has angles ${{a}}^\\circ$ and ${{b}}^\\circ$; another has ${{a}}^\\circ$ and ${{c}}^\\circ$. What follows?',
  generator: {
    parameters: {
      a: { type: 'int', min: 20, max: 70 },
      b: { type: 'int', min: 20, max: 70 },
    },
    derived: { c: '180-a-b', pair: 'a+b' },
    constraints: [],
  },
  choices: [
    { label: 'They are similar: the third angles match at ${{c}}^\\circ$ and ${{b}}^\\circ$.', correct: true },
    { label: 'They are congruent, because two angles agree.', error: 'operationInverted' },
    { label: 'Nothing follows without knowing a side length.', error: 'partialTotal' },
    { label: 'They are similar only if ${{b}}$ and ${{c}}$ are equal.', error: 'ratioReversed' },
  ],
  reasoning: ['The first triangle has a third angle of $180 - {{a}} - {{b}} = {{c}}$.', 'The second therefore has ${{a}}$, ${{c}}$ and ${{b}}$ as well, so all three angles agree.'],
  answerSummary: { headline: 'Two matching angles force the third, which is why two are enough.', text: 'They are similar.' },
  hint: 'What is each triangle third angle?',
  feedback: 'Equal angles fix the shape but not the size.',
});

mk('8.8D', 'corresponding-called-supplementary', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says corresponding angles on a transversal add to $180^\\circ$. What is wrong?',
  generator: {
    parameters: { a: { type: 'int', min: 25, max: 155 } },
    derived: { supp: '180-a', twiceA: '2*a' },
    constraints: [],
  },
  choices: [
    { label: 'Corresponding angles are equal: two of ${{a}}^\\circ$ total ${{twiceA}}^\\circ$, not $180^\\circ$.', correct: true },
    { label: 'Nothing is wrong, because all angle pairs on a transversal are supplementary.', error: 'operationInverted' },
    { label: 'They add to $360^\\circ$, because there are two lines.', error: 'arithmeticSlip' },
    { label: 'They are equal only when the transversal is perpendicular.', error: 'partialTotal' },
  ],
  reasoning: ['Corresponding angles sit in matching positions and are equal.', 'The pairs that add to $180^\\circ$ are the co-interior ones, ${{a}}$ with ${{supp}}$.'],
  answerSummary: { headline: 'Equal and supplementary are different relationships.', text: 'Corresponding angles are equal.' },
  hint: 'Which pair sits on a straight line together?',
  feedback: 'Only some of the pairs are supplementary.',
});

// ================================================================ 8.9
// Where two graphed lines meet.

mk('8.9', 'what-the-crossing-point-means', {
  courseId: 'grade8',
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'verbal',
  prompt: 'Two lines are graphed and cross once. What does the crossing point give?',
  generator: {
    parameters: {
      m1: { type: 'int', min: 2, max: 9 },
      rise: { type: 'int', min: 2, max: 9 },
      v: { type: 'int', min: 1, max: 8 },
      b1: { type: 'int', min: 1, max: 20 },
    },
    derived: {
      m2: 'm1+rise',
      b2: 'b1-rise*v',
      y: 'm1*v+b1',
    },
    constraints: [],
  },
  choices: [
    { label: 'The one pair of values satisfying both equations at once.', correct: true },
    { label: 'The values satisfying the first equation only.', error: 'partialTotal' },
    { label: 'The point where both lines cross the vertical axis.', error: 'operationInverted' },
    { label: 'The average of the two lines at that value of $x$.', error: 'ratioReversed' },
  ],
  reasoning: ['A point on a line satisfies that line equation, so a point on both satisfies both.', 'Here that point is $({{v}}, {{y}})$, which works in each equation separately.'],
  answerSummary: { headline: 'A crossing point belongs to both lines, so it solves both equations.', text: 'The pair satisfying both.' },
  hint: 'What is true of every point on a graphed line?',
  feedback: 'Each line meets the vertical axis at its own place.',
});

mk('8.9', 'verify-a-candidate-point', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Does $({{v}}, {{y}})$ satisfy both $y = {{m1}}x + {{b1}}$ and $y = {{m2}}x + {{b2}}$?',
  generator: {
    parameters: {
      m1: { type: 'int', min: 2, max: 9 },
      rise: { type: 'int', min: 2, max: 9 },
      v: { type: 'int', min: 1, max: 8 },
      b1: { type: 'int', min: 1, max: 20 },
    },
    derived: {
      m2: 'm1+rise',
      b2: 'b1-rise*v',
      y: 'm1*v+b1',
      firstOnly: 'm1*v+b1',
      secondAtV: 'm1*v+rise*v+b1-rise*v',
    },
    constraints: [],
  },
  choices: [
    { label: 'Yes: both equations give ${{y}}$ at $x = {{v}}$.', correct: true },
    { label: 'Only the first: the second gives something else at $x = {{v}}$.', error: 'partialTotal' },
    { label: 'Neither: ${{y}}$ is too large for both lines.', error: 'signError' },
    { label: 'It cannot be checked without graphing the two lines.', error: 'operationInverted' },
  ],
  reasoning: ['The first gives ${{m1}} \\times {{v}} + {{b1}} = {{y}}$.', 'The second gives ${{m2}} \\times {{v}} + {{b2}}$, which comes to ${{y}}$ as well.'],
  answerSummary: { headline: 'A shared solution has to work in both equations, tested separately.', text: 'Yes, both give ${{y}}$.' },
  hint: 'Put the pair into each equation in turn.',
  feedback: 'Both need testing, and here both agree.',
});

mk('8.9', 'where-the-two-lines-meet', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'orderedPairs',
  prompt: 'Where do $y = {{m1}}x + {{b1}}$ and $y = {{m2}}x + {{b2}}$ cross?',
  generator: {
    parameters: {
      m1: { type: 'int', min: 2, max: 9 },
      rise: { type: 'int', min: 2, max: 9 },
      v: { type: 'int', min: 1, max: 8 },
      b1: { type: 'int', min: 1, max: 20 },
    },
    derived: {
      m2: 'm1+rise',
      b2: 'b1-rise*v',
      y: 'm1*v+b1',
      swappedY: 'm1*v+b1+rise',
      atZero: 'b1',
    },
    constraints: ['v!=y'],
  },
  choices: [
    { label: plain('({{v}}, {{y}})'), correct: true },
    { label: plain('({{y}}, {{v}})'), error: 'ratioReversed' },
    { label: plain('({{v}}, {{swappedY}})'), error: 'offByOneStep' },
    { label: plain('(0, {{atZero}})'), error: 'partialTotal' },
  ],
  reasoning: ['Setting the two right sides equal gives $x = {{v}}$.', 'Putting ${{v}}$ back into either equation gives $y = {{y}}$.'],
  answerSummary: { headline: 'Solve for x first, then substitute to get y.', text: 'They cross at $({{v}}, {{y}})$.' },
  hint: 'When are the two right sides equal?',
  feedback: 'That is where the first line meets the vertical axis.',
});

mk('8.9', 'lines-that-never-meet', {
  courseId: 'grade8',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'table',
  prompt: 'The table lists both lines at three values of $x$. How many pairs satisfy both?',
  stimulus: {
    kind: 'table',
    table: {
      headers: ['x', 'first line', 'second line'],
      rows: [['{{x1}}', '{{p1}}', '{{q1}}'], ['{{x2}}', '{{p2}}', '{{q2}}'], ['{{x3}}', '{{p3}}', '{{q3}}']],
    },
    title: 'Values on each line',
  },
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      b1: { type: 'int', min: 2, max: 20 },
      drop: { type: 'int', min: 2, max: 15 },
      x1: { type: 'int', min: 1, max: 4 },
    },
    derived: {
      b2: 'b1+drop',
      x2: 'x1+2', x3: 'x1+4',
      p1: 'm*x1+b1', p2: 'm*(x1+2)+b1', p3: 'm*(x1+4)+b1',
      q1: 'm*x1+b1+drop', q2: 'm*(x1+2)+b1+drop', q3: 'm*(x1+4)+b1+drop',
    },
    constraints: [],
  },
  choices: [
    { label: 'None: the two stay ${{drop}}$ apart at every $x$.', correct: true },
    { label: 'One, at the $x$ where the gap is smallest.', error: 'partialTotal' },
    { label: 'Three, one for each row of the table.', error: 'operationInverted' },
    { label: 'Every pair, because both lines are straight.', error: 'ratioReversed' },
  ],
  reasoning: ['Each row shows the second line exactly ${{drop}}$ above the first.', 'Equal steps keep that gap forever, so the lines are parallel and never cross.'],
  answerSummary: { headline: 'Equal slopes with different intercepts never meet.', text: 'No pair satisfies both.' },
  hint: 'What happens to the gap between the columns?',
  feedback: 'The gap is the same in every row, so it never closes.',
});

mk('8.9', 'checked-in-one-equation-only', {
  courseId: 'grade8',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student checks a candidate point in the first equation only and calls it the solution. What is wrong?',
  generator: {
    parameters: {
      m1: { type: 'int', min: 2, max: 9 },
      rise: { type: 'int', min: 2, max: 9 },
      v: { type: 'int', min: 1, max: 8 },
      b1: { type: 'int', min: 1, max: 20 },
      off: { type: 'int', min: 1, max: 6 },
    },
    derived: {
      m2: 'm1+rise',
      b2: 'b1-rise*v',
      other: 'v+off',
      firstAtOther: 'm1*v+m1*off+b1',
      secondAtOther: 'm1*v+m1*off+rise*off+b1',
    },
    constraints: [],
  },
  choices: [
    { label: 'Every point on the first line passes that test: at $x = {{other}}$ the lines give ${{firstAtOther}}$ and ${{secondAtOther}}$.', correct: true },
    { label: 'Nothing is wrong, because the two equations describe the same line.', error: 'operationInverted' },
    { label: 'The second equation only matters when the lines are parallel.', error: 'partialTotal' },
    { label: 'The point should be checked in the second equation instead.', error: 'ratioReversed' },
  ],
  reasoning: ['One equation is satisfied by every point along its own line, which is infinitely many.', 'Only the crossing point satisfies both, so both have to be tested.'],
  answerSummary: { headline: 'One equation cannot single out a point on its own line.', text: 'Both equations must be checked.' },
  hint: 'How many points satisfy the first equation alone?',
  feedback: 'Checking the other one alone has exactly the same weakness.',
});

// ================================================================ A.2A
// Domain and range of a linear function.
//
// The ASVAB crosswalk allows only stating the domain or range and reading the
// values a linear function can take. Reasonable-domain reasoning in context
// and discrete-versus-continuous classification are excluded, so nothing here
// asks about either.

mk('A.2A', 'domain-of-a-linear-rule', {
  courseId: 'algebra1',
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'What is the domain of $f(x) = {{m}}x + {{b}}$?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 2, max: 30 },
    },
    derived: { atZero: 'b', atOne: 'm+b' },
    constraints: ['m!=b'],
  },
  choices: [
    { label: 'All real numbers.', correct: true },
    { label: 'All real numbers except ${{atZero}}$.', error: 'operationInverted' },
    { label: 'All numbers greater than or equal to ${{atZero}}$.', error: 'partialTotal' },
    { label: 'All whole numbers.', error: 'ratioReversed' },
  ],
  reasoning: ['Multiplying by ${{m}}$ and adding ${{b}}$ works on any number at all.', 'Nothing is divided by and no root is taken, so no input has to be barred.'],
  answerSummary: { headline: 'A linear rule accepts every real input.', text: 'All real numbers.' },
  hint: 'Is there any input the rule cannot handle?',
  feedback: 'The value at $x = 0$ is an output, not a barred input.',
});

mk('A.2A', 'range-over-a-closed-domain', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'For $f(x) = {{m}}x + {{b}}$ with ${{lo}} \\le x \\le {{hi}}$, what is the range?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 20 },
      lo: { type: 'int', min: 1, max: 6 },
      span: { type: 'int', min: 2, max: 8 },
    },
    derived: {
      hi: 'lo+span',
      flo: 'm*lo+b',
      fhi: 'm*(lo+span)+b',
      swapLo: 'm*lo',
      swapHi: 'm*(lo+span)',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{flo}} \\le y \\le {{fhi}}'), correct: true },
    { label: plain('{{lo}} \\le y \\le {{hi}}'), error: 'ratioReversed' },
    { label: plain('{{swapLo}} \\le y \\le {{swapHi}}'), error: 'partialTotal' },
    { label: plain('{{fhi}} \\le y \\le {{flo}}'), error: 'operationInverted' },
  ],
  reasoning: ['The rule climbs steadily, so the smallest input gives the smallest output.', '$f({{lo}}) = {{flo}}$ and $f({{hi}}) = {{fhi}}$, and every value between is reached.'],
  answerSummary: { headline: 'A rising line maps the ends of the domain to the ends of the range.', text: 'From ${{flo}}$ to ${{fhi}}$.' },
  hint: 'What does the rule give at each end of the domain?',
  feedback: 'The constant has to be added as well as the multiplying done.',
});

mk('A.2A', 'value-inside-the-range', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'symbolic',
  prompt: 'For $f(x) = {{m}}x + {{b}}$ with ${{lo}} \\le x \\le {{hi}}$, which value is in the range?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 20 },
      lo: { type: 'int', min: 1, max: 6 },
      span: { type: 'int', min: 3, max: 8 },
      inside: { type: 'int', min: 1, max: 2 },
      out: { type: 'int', min: 2, max: 12 },
      // Outside on one side or the other, so this choice crosses the key.
      side: { type: 'choice', values: [0, 1] },
    },
    derived: {
      hi: 'lo+span',
      flo: 'm*lo+b',
      fhi: 'm*(lo+span)+b',
      answer: 'm*(lo+inside)+b',
      d_signError: 'm*lo+b-out',
      d_operationInverted: 'm*(lo+span)+b+out',
      d_usedGivenValue: 'side*(m*(lo+span)+b+out+out)+(1-side)*(m*lo+b-out-out)',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The range runs from $f({{lo}}) = {{flo}}$ up to $f({{hi}}) = {{fhi}}$.', '${{answer}}$ is $f({{lo}} + {{inside}})$, which lies inside that stretch; the others fall outside it.'],
  answerSummary: { headline: 'A value is in the range when some allowed input produces it.', text: '${{answer}}$ is reached.' },
  hint: 'Work out the two ends of the range first.',
  feedback: 'That value lies outside the stretch the rule can reach.',
});

mk('A.2A', 'range-read-from-two-endpoints', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'orderedPairs',
  prompt: 'A linear function passes through $({{lo}}, {{flo}})$ and $({{hi}}, {{fhi}})$ and is defined only between them. What is its range?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 20 },
      lo: { type: 'int', min: 1, max: 6 },
      span: { type: 'int', min: 2, max: 8 },
    },
    derived: {
      hi: 'lo+span',
      flo: 'm*lo+b',
      fhi: 'm*(lo+span)+b',
      gap: 'm*span',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{flo}} \\le y \\le {{fhi}}'), correct: true },
    { label: plain('{{lo}} \\le y \\le {{hi}}'), error: 'ratioReversed' },
    { label: plain('y = {{flo}} \\text{ or } y = {{fhi}}'), error: 'partialTotal' },
    { label: plain('0 \\le y \\le {{gap}}'), error: 'operationInverted' },
  ],
  reasoning: ['The two points give the ends of the stretch the outputs cover.', 'The line is unbroken between them, so every value from ${{flo}}$ to ${{fhi}}$ is taken.'],
  answerSummary: { headline: 'The range is the stretch of outputs, endpoints included.', text: 'From ${{flo}}$ to ${{fhi}}$.' },
  hint: 'Which coordinate of each point is an output?',
  feedback: 'Only the two ends would be reached if the line had gaps.',
});

mk('A.2A', 'range-called-positive-only', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says the range of $f(x) = {{m}}x + {{b}}$ is the positive numbers. What is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 2, max: 30 },
      k: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      negInput: '0-k',
      negOutput: 'b-m*k',
      atZero: 'b',
    },
    constraints: ['negOutput<0'],
  },
  choices: [
    { label: 'Negative inputs reach negative outputs: $f(-{{k}}) = {{negOutput}}$.', correct: true },
    { label: 'Nothing is wrong, because ${{m}}$ and ${{b}}$ are both positive.', error: 'partialTotal' },
    { label: 'The range is the positive numbers and zero, because $f(0) = {{atZero}}$.', error: 'offByOneStep' },
    { label: 'The range is only the numbers above ${{atZero}}$.', error: 'operationInverted' },
  ],
  reasoning: ['Every real number is an allowed input, including negative ones.', 'Far enough left the outputs go below zero: $f(-{{k}}) = {{negOutput}}$.'],
  answerSummary: { headline: 'An unrestricted line reaches every output, high and low.', text: 'The range is all real numbers.' },
  hint: 'Try an input well to the left of zero.',
  feedback: 'Positive coefficients do not stop the outputs falling.',
});

// ================================================================ A.2B
// Writing a line from a point and a slope, or from two points, in more than
// one form.

mk('A.2B', 'point-slope-form', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'A line of slope ${{m}}$ passes through $({{x1}}, {{y1}})$. Which is its point-slope form?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      x1: { type: 'int', min: 1, max: 12 },
      y1: { type: 'int', min: 1, max: 20 },
    },
    derived: { b: 'y1-m*x1' },
    // One distractor puts x1 where the slope belongs, so the two must differ or
    // it reproduces the key exactly.
    constraints: ['x1!=y1', 'x1!=m'],
  },
  choices: [
    { label: plain('y - {{y1}} = {{m}}(x - {{x1}})'), correct: true },
    { label: plain('y + {{y1}} = {{m}}(x + {{x1}})'), error: 'signError' },
    { label: plain('y - {{x1}} = {{m}}(x - {{y1}})'), error: 'ratioReversed' },
    { label: plain('y - {{y1}} = {{x1}}(x - {{m}})'), error: 'operationInverted' },
  ],
  reasoning: ['Point-slope form subtracts the point coordinates from the matching letters.', 'The slope multiplies the bracket holding $x$.'],
  answerSummary: { headline: 'Subtract each coordinate from its own letter.', text: 'It is $y - {{y1}} = {{m}}(x - {{x1}})$.' },
  hint: 'Which coordinate belongs with $x$?',
  feedback: 'Adding the coordinates would describe the point reflected through the origin.',
});

mk('A.2B', 'slope-intercept-from-a-point', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'A line of slope ${{m}}$ passes through $({{x1}}, {{y1}})$. What is its slope-intercept form?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      x1: { type: 'int', min: 1, max: 12 },
      y1: { type: 'int', min: 1, max: 20 },
    },
    derived: {
      b: 'y1-m*x1',
      wrongB: 'y1+m*x1',
      swapped: 'x1-m*y1',
    },
    // Three distractors are all constants sitting after the same slope term, so
    // each pair has to be kept apart by hand.
    constraints: ['b!=y1', 'b!=swapped', 'swapped!=y1'],
  },
  choices: [
    { label: plain('y = {{m}}x + {{b}}'), correct: true },
    { label: plain('y = {{m}}x + {{y1}}'), error: 'partialTotal' },
    { label: plain('y = {{m}}x + {{wrongB}}'), error: 'signError' },
    { label: plain('y = {{m}}x + {{swapped}}'), error: 'ratioReversed' },
  ],
  reasoning: ['Substituting the point into $y = {{m}}x + b$ gives ${{y1}} = {{m}} \\times {{x1}} + b$.', 'So $b = {{y1}} - {{m}} \\times {{x1}} = {{b}}$.'],
  answerSummary: { headline: 'Substitute the point to find the constant.', text: 'It is $y = {{m}}x + {{b}}$.' },
  hint: 'What must $b$ be for the point to lie on the line?',
  feedback: 'The point value of $y$ is the constant only when $x$ is zero.',
});

mk('A.2B', 'line-through-two-points', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'orderedPairs',
  prompt: 'Which line passes through $({{x1}}, {{y1}})$ and $({{x2}}, {{y2}})$?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      run: { type: 'int', min: 1, max: 6 },
      x1: { type: 'int', min: 1, max: 8 },
      y1: { type: 'int', min: 1, max: 20 },
    },
    derived: {
      x2: 'x1+run',
      y2: 'y1+m*run',
      b: 'y1-m*x1',
      rise: 'm*run',
      wrongB: 'y1+m*x1',
    },
    // run also stands in as a slope in one distractor, so it must differ from
    // the real slope as well as from the rise.
    constraints: ['rise!=m', 'b!=wrongB', 'run!=m'],
  },
  choices: [
    { label: plain('y = {{m}}x + {{b}}'), correct: true },
    { label: plain('y = {{rise}}x + {{b}}'), error: 'partialTotal' },
    { label: plain('y = {{m}}x + {{wrongB}}'), error: 'signError' },
    { label: plain('y = {{run}}x + {{b}}'), error: 'ratioReversed' },
  ],
  reasoning: ['From the first point to the second, $y$ rises ${{rise}}$ over a run of ${{run}}$, so the slope is ${{m}}$.', 'Substituting the first point gives $b = {{b}}$.'],
  answerSummary: { headline: 'Slope first, then the constant from either point.', text: 'It is $y = {{m}}x + {{b}}$.' },
  hint: 'The rise is not the slope until it is shared by the run.',
  feedback: 'The rise alone has not been divided by the run.',
});

mk('A.2B', 'same-line-in-another-form', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'Which equation describes the same line as $y - {{y1}} = {{m}}(x - {{x1}})$?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      x1: { type: 'int', min: 1, max: 12 },
      y1: { type: 'int', min: 1, max: 20 },
    },
    derived: {
      b: 'y1-m*x1',
      wrongB: 'y1+m*x1',
      noExpand: 'm*x1',
    },
    constraints: ['b!=wrongB', 'b!=noExpand'],
  },
  choices: [
    { label: plain('y = {{m}}x + {{b}}'), correct: true },
    { label: plain('y = {{m}}x + {{wrongB}}'), error: 'signError' },
    { label: plain('y = {{m}}x - {{noExpand}}'), error: 'partialTotal' },
    { label: plain('y = {{m}}x + {{y1}}'), error: 'operationInverted' },
  ],
  reasoning: ['Multiplying out the bracket gives $y - {{y1}} = {{m}}x - {{noExpand}}$.', 'Adding ${{y1}}$ to both sides leaves $y = {{m}}x + {{b}}$.'],
  answerSummary: { headline: 'The two forms differ only in how the constant is packaged.', text: 'It is $y = {{m}}x + {{b}}$.' },
  hint: 'Multiply out the bracket, then move the constant across.',
  feedback: 'The ${{y1}}$ still has to be added to both sides.',
});

mk('A.2B', 'signs-in-point-slope', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'For the point $({{x1}}, {{y1}})$ a student writes $y + {{y1}} = {{m}}(x + {{x1}})$. What is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      x1: { type: 'int', min: 1, max: 12 },
      y1: { type: 'int', min: 1, max: 20 },
    },
    derived: {
      negX: '0-x1',
      negY: '0-y1',
      b: 'y1-m*x1',
    },
    constraints: [],
  },
  choices: [
    { label: 'Those signs describe the point $(-{{x1}}, -{{y1}})$; the form subtracts the coordinates.', correct: true },
    { label: 'Nothing is wrong, because the signs cancel when the bracket is expanded.', error: 'operationInverted' },
    { label: 'The slope should be negative to match the added signs.', error: 'signError' },
    { label: 'Only the $x$ coordinate is subtracted; the $y$ one is added.', error: 'partialTotal' },
  ],
  reasoning: ['Point-slope form reads $y - y_1 = m(x - x_1)$, with each coordinate subtracted.', 'Writing plus signs puts $-{{x1}}$ and $-{{y1}}$ in place of the point given.'],
  answerSummary: { headline: 'The minus signs in the form are what carry the point.', text: 'It should subtract both coordinates.' },
  hint: 'Substitute the point and see whether both sides come to zero.',
  feedback: 'Expanding keeps the error rather than cancelling it.',
});

// ================================================================ A.2C
// Writing a line from a table, a graph or a description, in standard form.

mk('A.2C', 'standard-form-from-a-description', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'verbal',
  prompt: 'Tickets cost $\\${{a}}$ and programmes $\\${{b}}$, and a group spends $\\${{c}}$ altogether. Which equation says so?',
  generator: {
    parameters: {
      a: { type: 'int', min: 4, max: 25 },
      b: { type: 'int', min: 2, max: 20 },
      x: { type: 'int', min: 2, max: 12 },
      y: { type: 'int', min: 2, max: 12 },
    },
    derived: { c: 'a*x+b*y', sum: 'a+b' },
    constraints: ['a!=b'],
  },
  choices: [
    { label: plain('{{a}}x + {{b}}y = {{c}}'), correct: true },
    { label: plain('{{b}}x + {{a}}y = {{c}}'), error: 'ratioReversed' },
    { label: plain('{{sum}}(x + y) = {{c}}'), error: 'operationInverted' },
    { label: plain('{{a}}x + {{b}}y + {{c}} = 0'), error: 'signError' },
  ],
  reasoning: ['Each ticket adds $\\${{a}}$ and each programme $\\${{b}}$.', 'The two contributions together come to the $\\${{c}}$ spent.'],
  answerSummary: { headline: 'Standard form puts both variable terms on one side and the total on the other.', text: 'It is ${{a}}x + {{b}}y = {{c}}$.' },
  hint: 'What does each ticket contribute, and what does each programme?',
  feedback: 'The two prices are different, so they cannot share one bracket.',
});

mk('A.2C', 'standard-form-from-intercepts', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A line crosses the horizontal axis at ${{xInt}}$ and the vertical axis at ${{yInt}}$. Which equation in standard form fits?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 2, max: 12 },
      k: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      c: 'a*b*k',
      xInt: 'b*k',
      yInt: 'a*k',
      swapped: 'a*b',
    },
    // Standard form wants coefficients with no common factor: without this a
    // student who correctly reduces $4x + 8y = 48$ to $x + 2y = 12$ finds no
    // matching choice.
    constraints: ['a!=b', 'gcd(a,b)==1'],
  },
  choices: [
    { label: plain('{{a}}x + {{b}}y = {{c}}'), correct: true },
    { label: plain('{{b}}x + {{a}}y = {{c}}'), error: 'ratioReversed' },
    { label: plain('{{a}}x + {{b}}y = {{swapped}}'), error: 'partialTotal' },
    { label: plain('{{a}}x - {{b}}y = {{c}}'), error: 'signError' },
  ],
  reasoning: ['At $y = 0$ the equation gives ${{a}}x = {{c}}$, so $x = {{xInt}}$.', 'At $x = 0$ it gives ${{b}}y = {{c}}$, so $y = {{yInt}}$, matching both crossings.'],
  answerSummary: { headline: 'Test a standard-form candidate by setting each variable to zero in turn.', text: 'It is ${{a}}x + {{b}}y = {{c}}$.' },
  hint: 'Put $y = 0$ into each candidate and see where it crosses.',
  feedback: 'Swapping the coefficients swaps the two crossings.',
});

mk('A.2C', 'standard-form-from-a-table', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 2, taskType: 'interpretation', representation: 'table',
  prompt: 'Which equation in standard form produces every row?',
  stimulus: {
    kind: 'table',
    title: 'Recorded values',
    table: { headers: ['x', 'y'], rows: [['{{x1}}', '{{y1}}'], ['{{x2}}', '{{y2}}'], ['{{x3}}', '{{y3}}']] },
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      k: { type: 'int', min: 2, max: 8 },
      y1: { type: 'int', min: 2, max: 12 },
      step: { type: 'int', min: 1, max: 3 },
    },
    derived: {
      b: '1',
      x1: 'k', x2: 'k+step', x3: 'k+2*step',
      c: 'a*k+y1',
      y2: 'a*k+y1-a*(k+step)',
      y3: 'a*k+y1-a*(k+2*step)',
      aPlus: 'a+1',
    },
    constraints: ['y2>0', 'y3>0'],
  },
  choices: [
    { label: plain('{{a}}x + y = {{c}}'), correct: true },
    { label: plain('{{a}}x - y = {{c}}'), error: 'signError' },
    { label: plain('{{aPlus}}x + y = {{c}}'), error: 'offByOneStep' },
    { label: plain('x + {{a}}y = {{c}}'), error: 'ratioReversed' },
  ],
  reasoning: ['Each step of ${{step}}$ in $x$ lowers $y$ by ${{a}}$ times that, so ${{a}}x + y$ stays fixed.', 'At the first row that total is ${{a}} \\times {{x1}} + {{y1}} = {{c}}$.'],
  answerSummary: { headline: 'In standard form the two terms trade off to a constant total.', text: 'It is ${{a}}x + y = {{c}}$.' },
  hint: 'Work out ${{a}}x + y$ for each row.',
  feedback: 'Subtracting would make the total change from row to row.',
});

mk('A.2C', 'standard-form-from-two-plotted-points', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'orderedPairs',
  prompt: 'Which equation in standard form passes through both points?',
  // The two points are shown rather than named in the sentence: nothing in the
  // platform plots a line, so a prompt must not tell a student to read one off
  // a graph that will never appear.
  stimulus: {
    kind: 'orderedPairs',
    title: 'Two points on the line',
    orderedPairs: [{ x: '{{x1}}', y: '{{y1}}' }, { x: '{{x2}}', y: '{{y2}}' }],
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 9 },
      x1: { type: 'int', min: 1, max: 9 },
      rise: { type: 'int', min: 1, max: 8 },
    },
    derived: {
      y1: 'a+rise',
      c: 'a*x1+b*(a+rise)',
      x2: 'x1+b',
      y2: 'rise',
      mixed: 'a*x1+b*(a+rise)+a*b',
    },
    // Standard form wants coefficients with no common factor: without this a
    // student who correctly reduces $4x + 8y = 48$ to $x + 2y = 12$ finds no
    // matching choice.
    constraints: ['a!=b', 'gcd(a,b)==1'],
  },
  choices: [
    { label: plain('{{a}}x + {{b}}y = {{c}}'), correct: true },
    { label: plain('{{b}}x + {{a}}y = {{c}}'), error: 'ratioReversed' },
    { label: plain('{{a}}x - {{b}}y = {{c}}'), error: 'signError' },
    { label: plain('{{a}}x + {{b}}y = {{mixed}}'), error: 'partialTotal' },
  ],
  reasoning: ['Between the two points the line runs ${{b}}$ across and drops ${{a}}$, so ${{a}}x + {{b}}y$ never changes.', 'At the first point that fixed total is ${{a}} \\times {{x1}} + {{b}} \\times {{y1}} = {{c}}$.'],
  answerSummary: { headline: 'Two points pin down both coefficients and the constant.', text: 'It is ${{a}}x + {{b}}y = {{c}}$.' },
  hint: 'How far across, and how far down, from one point to the other?',
  feedback: 'Check your equation against both points, not just one.',
});
mk('A.2C', 'coefficients-attached-to-the-wrong-variable', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'For chairs at ${{a}}$ minutes and tables at ${{b}}$ minutes a student writes ${{b}}x + {{a}}y = {{c}}$, with $x$ the chairs. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 4, max: 25 },
      b: { type: 'int', min: 2, max: 20 },
      x: { type: 'int', min: 2, max: 12 },
      y: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      c: 'a*x+b*y',
      wrongTotal: 'b*x+a*y',
    },
    constraints: ['a!=b', 'c!=wrongTotal'],
  },
  choices: [
    { label: 'Each time must sit with its own item: at ${{x}}$ chairs and ${{y}}$ tables that gives ${{c}}$ minutes, not ${{wrongTotal}}$.', correct: true },
    { label: 'Nothing is wrong, because both times appear in the equation.', error: 'operationInverted' },
    { label: 'The times are right but the total should be on the left.', error: 'signError' },
    { label: 'The equation needs a third term for the total time.', error: 'partialTotal' },
  ],
  reasoning: ['A coefficient says how long one of that item takes, so it belongs with that item count.', 'Swapping them charges table times to chairs and the other way round.'],
  answerSummary: { headline: 'A coefficient belongs to the variable it measures.', text: 'It should be ${{a}}x + {{b}}y = {{c}}$.' },
  hint: 'Work out the total time both ways for a small batch.',
  feedback: 'Appearing in the equation is not enough; each must be in the right place.',
});

// ================================================================ A.2D
// Writing and solving direct-variation equations. Grade 8 (8.5A, 8.5E, 8.5F)
// already substitutes into a variation that has been handed to the student;
// the Algebra I verb is to WRITE the equation and rearrange it, so these five
// build it, solve it for either letter, and read it out of a ratio form.

mk('A.2D', 'variation-equation-from-a-point', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: '$y$ varies directly with $x$, and $y = {{y1}}$ when $x = {{x1}}$. Which equation is the variation?',
  generator: {
    parameters: {
      x1: { type: 'int', min: 2, max: 9 },
      k: { type: 'int', min: 2, max: 9 },
    },
    derived: { y1: 'k*x1', diff: 'k*x1-x1' },
    constraints: ['x1!=k'],
  },
  choices: [
    { label: plain('y = {{k}}x'), correct: true },
    { label: plain('y = {{x1}}x'), error: 'usedGivenValue' },
    { label: plain('y = {{y1}}x'), error: 'partialTotal' },
    { label: plain('y = x + {{diff}}'), error: 'operationInverted' },
  ],
  reasoning: ['A direct variation is $y = kx$, so $k = {{y1}} \\div {{x1}} = {{k}}$.', 'Adding a fixed amount would fit this one point but no other.'],
  answerSummary: { headline: 'The constant is the quotient of the two given values, not either one of them.', text: 'It is $y = {{k}}x$.' },
  hint: 'What must $x$ be multiplied by to reach $y$?',
  feedback: 'That rule happens to fit the given point, but it is not a direct variation.',
});

mk('A.2D', 'solve-a-variation-for-x', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'If $y = {{k}}x$, which expression gives $x$?',
  generator: {
    parameters: { k: { type: 'int', min: 2, max: 12 } },
    derived: {},
    constraints: [],
  },
  choices: [
    { label: plain('\\frac{y}{{{k}}}'), correct: true },
    { label: plain('{{k}}y'), error: 'operationInverted' },
    { label: plain('\\frac{{{k}}}{y}'), error: 'ratioReversed' },
    { label: plain('y - {{k}}'), error: 'partialTotal' },
  ],
  reasoning: ['Both sides are divided by ${{k}}$, the number multiplying $x$.', 'Dividing undoes multiplication; subtracting does not.'],
  answerSummary: { headline: 'Undo a multiplication by dividing, on both sides.', text: 'It is $\\frac{y}{{{k}}}$.' },
  hint: 'What is being done to $x$, and what undoes it?',
  feedback: 'Subtracting would undo an addition, but ${{k}}$ is multiplying $x$.',
});

mk('A.2D', 'equation-from-a-variation-table', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'table',
  prompt: 'Which equation fits every row?',
  stimulus: {
    kind: 'table',
    title: 'Recorded values',
    table: { headers: ['x', 'y'], rows: [['{{x1}}', '{{y1}}'], ['{{x2}}', '{{y2}}'], ['{{x3}}', '{{y3}}']] },
  },
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      x1: { type: 'int', min: 1, max: 5 },
      step: { type: 'int', min: 1, max: 4 },
    },
    derived: {
      x2: 'x1+step', x3: 'x1+2*step',
      y1: 'k*x1', y2: 'k*(x1+step)', y3: 'k*(x1+2*step)',
      shift: 'k*x1-x1',
    },
    constraints: ['k!=x1', 'shift!=k'],
  },
  choices: [
    { label: plain('y = {{k}}x'), correct: true },
    { label: plain('y = x + {{shift}}'), error: 'operationInverted' },
    { label: plain('y = {{k}}x + {{k}}'), error: 'partialTotal' },
    { label: plain('x = {{k}}y'), error: 'ratioReversed' },
  ],
  reasoning: ['Every row divides to the same quotient: ${{y1}} \\div {{x1}} = {{k}}$.', 'A rule that adds a fixed amount matches the first row only.'],
  answerSummary: { headline: 'A direct variation holds one quotient across every row.', text: 'It is $y = {{k}}x$.' },
  hint: 'Divide $y$ by $x$ in each row and compare.',
  feedback: 'Check your rule against the second and third rows, not just the first.',
});

mk('A.2D', 'value-after-an-increase', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'context',
  prompt: 'The load on a belt varies directly with time, and reaches ${{y1}}$ kg in ${{x1}}$ minutes. How much is on it after ${{d}}$ more minutes?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      x1: { type: 'int', min: 2, max: 9 },
      d: { type: 'int', min: 2, max: 6 },
    },
    derived: {
      y1: 'k*x1',
      total: 'k*(x1+d)',
      onlyExtra: 'k*d',
      slopeShifted: '(k+d)*x1',
      multiplied: 'k*x1*d',
    },
    constraints: ['x1!=k'],
  },
  choices: [
    { label: plain('{{total}}'), correct: true },
    { label: plain('{{onlyExtra}}'), error: 'forgotFinalStep' },
    { label: plain('{{slopeShifted}}'), error: 'usedGivenValue' },
    { label: plain('{{multiplied}}'), error: 'operationInverted' },
  ],
  reasoning: ['The belt carries ${{y1}} \\div {{x1}} = {{k}}$ kg a minute.', 'Over ${{x1}} + {{d}}$ minutes that is ${{total}}$ kg.'],
  answerSummary: { headline: 'Find the rate, then apply it to the whole new time.', text: 'It carries ${{total}}$ kg.' },
  hint: 'How much does one minute carry?',
  feedback: 'That is the load added by the extra minutes alone.',
});

mk('A.2D', 'constant-taken-upside-down', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'For a variation through $({{x1}}, {{y1}})$ a student writes $y = \\frac{{{x1}}}{{{y1}}}x$. What is wrong?',
  generator: {
    parameters: {
      x1: { type: 'int', min: 2, max: 9 },
      k: { type: 'int', min: 2, max: 9 },
    },
    derived: { y1: 'k*x1' },
    constraints: ['x1!=k'],
  },
  choices: [
    { label: 'The constant is $y$ divided by $x$, which is ${{k}}$, so the rule is $y = {{k}}x$.', correct: true },
    { label: 'Nothing is wrong, since both given numbers appear in the rule.', error: 'usedGivenValue' },
    { label: 'The rule needs a constant added on the end as well.', error: 'partialTotal' },
    { label: 'The constant is right, but the two letters should be swapped.', error: 'ratioReversed' },
  ],
  reasoning: ['Substituting $x = {{x1}}$ into the student rule gives ${{x1}}$ back, not ${{y1}}$.', 'The constant must be ${{y1}} \\div {{x1}} = {{k}}$.'],
  answerSummary: { headline: 'The constant of variation is $y \\div x$, in that order.', text: 'The rule should be $y = {{k}}x$.' },
  hint: 'Put the given $x$ into the student rule and see what comes out.',
  feedback: 'Using both numbers is not enough; they have to be the right way round.',
});

// ================================================================ A.2E
// A line through a given point, parallel to a given line. The whole standard
// turns on one idea — the slope is copied, the intercept is not — so the five
// attack it from construction, recognition, a context value, a statement about
// the result, and the parallel/perpendicular confusion.

mk('A.2E', 'parallel-through-a-point', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Which line passes through $({{x1}}, {{y1}})$ and is parallel to $y = {{m}}x + {{c}}$?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 2, max: 20 },
      x1: { type: 'int', min: 1, max: 9 },
      y1: { type: 'int', min: 1, max: 20 },
    },
    derived: { b: 'y1-m*x1', wrongB: 'y1+m*x1' },
    constraints: ['b!=c', 'c!=m', 'wrongB!=c'],
  },
  choices: [
    { label: plain('y = {{m}}x + {{b}}'), correct: true },
    { label: plain('y = {{m}}x + {{c}}'), error: 'usedGivenValue' },
    { label: plain('y = {{m}}x + {{wrongB}}'), error: 'signError' },
    { label: plain('y = {{c}}x + {{b}}'), error: 'ratioReversed' },
  ],
  reasoning: ['Parallel lines share the slope, so the new line is $y = {{m}}x + b$.', 'Substituting $({{x1}}, {{y1}})$ gives $b = {{y1}} - {{m}} \\times {{x1}} = {{b}}$.'],
  answerSummary: { headline: 'Copy the slope, then find the constant from the point.', text: 'It is $y = {{m}}x + {{b}}$.' },
  hint: 'Which part of the given equation carries over, and which does not?',
  feedback: 'Keeping the original constant would give back the original line.',
});

mk('A.2E', 'which-line-is-parallel', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'Which line is parallel to ${{a}}x + {{b}}y = {{c}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 10, max: 60 },
      gap: { type: 'int', min: 3, max: 20 },
    },
    derived: { c2: 'c+gap' },
    constraints: ['a!=b', 'gcd(a,b)==1'],
  },
  choices: [
    { label: plain('{{a}}x + {{b}}y = {{c2}}'), correct: true },
    { label: plain('{{a}}x + {{b}}y = {{c}}'), error: 'usedGivenValue' },
    { label: plain('{{b}}x + {{a}}y = {{c2}}'), error: 'ratioReversed' },
    { label: plain('{{a}}x - {{b}}y = {{c2}}'), error: 'signError' },
  ],
  reasoning: ['Two lines in this form are parallel when the $x$ and $y$ coefficients keep the same ratio.', 'Only the constant may change, and it must change or the line is the same one.'],
  answerSummary: { headline: 'Same coefficients, different constant.', text: 'It is ${{a}}x + {{b}}y = {{c2}}$.' },
  hint: 'What has to stay the same, and what has to differ?',
  feedback: 'That is the given line itself, not a line parallel to it.',
});

mk('A.2E', 'parallel-path-in-context', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'context',
  prompt: 'A path parallel to $y = {{m}}x + {{c}}$ runs through $({{x1}}, {{y1}})$. What is its $y$ at $x = {{x2}}$?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      // Drawn over the same range as y1 so the distractor that swaps one for
      // the other lands above the key about half the time. A wider range put it
      // above in 95% of draws and pinned the key to one rank.
      c: { type: 'int', min: 2, max: 20 },
      x1: { type: 'int', min: 1, max: 6 },
      y1: { type: 'int', min: 2, max: 20 },
      run: { type: 'int', min: 2, max: 7 },
    },
    derived: {
      x2: 'x1+run',
      answer: 'y1+m*run',
      withGivenConstant: 'm*run+c',
      fromOrigin: 'm*(x1+run)+y1',
    },
    constraints: ['c!=y1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{y1}}'), error: 'partialTotal' },
    { label: plain('{{withGivenConstant}}'), error: 'usedGivenValue' },
    { label: plain('{{fromOrigin}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['The parallel path also rises ${{m}}$ for every $1$ across.', 'From $x = {{x1}}$ to $x = {{x2}}$ is ${{run}}$ across, so $y$ climbs to ${{y1}} + {{m}} \\times {{run}} = {{answer}}$.'],
  answerSummary: { headline: 'Travel from the known point at the shared slope.', text: 'It is ${{answer}}$.' },
  hint: 'How far across is it from the point you were given?',
  feedback: 'The constant belongs to the given path, not to this one.',
});

mk('A.2E', 'what-the-parallel-line-keeps', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'verbal',
  prompt: 'A line parallel to $y = {{m}}x + {{c}}$ passes through $({{x1}}, {{y1}})$. Which statement is true?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 2, max: 20 },
      x1: { type: 'int', min: 1, max: 9 },
      y1: { type: 'int', min: 1, max: 20 },
    },
    derived: { b: 'y1-m*x1', negM: '0-m' },
    // Two choices read the same pair of numbers in opposite roles, so the two
    // numbers must differ or those choices coincide.
    constraints: ['b!=c', 'c!=m', 'b!=m'],
  },
  choices: [
    { label: 'Its slope is ${{m}}$ and it crosses the $y$-axis at ${{b}}$.', correct: true },
    { label: 'Its slope and its $y$-intercept both match the given line.', error: 'usedGivenValue' },
    { label: 'Its slope is ${{negM}}$, since a parallel line runs the other way.', error: 'signError' },
    { label: 'Its slope is ${{b}}$ and it crosses the $y$-axis at ${{m}}$.', error: 'ratioReversed' },
  ],
  reasoning: ['Parallel fixes the slope at ${{m}}$ and says nothing about the intercept.', 'The point then fixes the intercept at ${{y1}} - {{m}} \\times {{x1}} = {{b}}$.'],
  answerSummary: { headline: 'Parallel decides the slope; the point decides the intercept.', text: 'Slope ${{m}}$, crossing at ${{b}}$.' },
  hint: 'Which of the two numbers does the word parallel settle?',
  feedback: 'Matching both numbers would make it the same line, not a parallel one.',
});

mk('A.2E', 'parallel-given-a-flipped-slope', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'For a line parallel to $y = {{m}}x + {{c}}$ a student uses slope $-\\frac{1}{{{m}}}$. What is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 2, max: 20 },
    },
    derived: {},
    constraints: ['c!=m'],
  },
  choices: [
    { label: 'That slope is for a perpendicular line; a parallel one keeps slope ${{m}}$.', correct: true },
    { label: 'The slope is right, but the sign in front of it should be positive.', error: 'signError' },
    { label: 'Nothing is wrong, as long as the line goes through the given point.', error: 'usedGivenValue' },
    { label: 'The slope should be ${{c}}$, taken from the end of the equation.', error: 'ratioReversed' },
  ],
  reasoning: ['Turning a slope upside down and changing its sign produces a right angle, not a parallel.', 'Parallel lines have equal slopes, so this one keeps ${{m}}$.'],
  answerSummary: { headline: 'Flipping and negating a slope makes a perpendicular, not a parallel.', text: 'The slope stays ${{m}}$.' },
  hint: 'What does flipping a slope upside down and negating it actually produce?',
  feedback: 'Passing through the point is not enough; the slope has to match too.',
});

// ================================================================ A.2F
// A line through a given point, perpendicular to a given line. The given line
// is written with a unit-fraction slope wherever the answer needs a slope, so
// the perpendicular slope comes out whole and the item tests the right angle
// rather than fraction arithmetic already covered in Grade 6.

mk('A.2F', 'perpendicular-through-a-point', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Which line passes through $({{x1}}, {{y1}})$ and is perpendicular to $y = \\frac{1}{{{m}}}x + {{c}}$?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 2, max: 20 },
      x1: { type: 'int', min: 1, max: 9 },
      y1: { type: 'int', min: 1, max: 20 },
    },
    derived: { b: 'y1+m*x1', negM: '0-m' },
    constraints: ['b!=c', 'c!=m'],
  },
  choices: [
    { label: plain('y = {{negM}}x + {{b}}'), correct: true },
    { label: plain('y = {{m}}x + {{b}}'), error: 'signError' },
    { label: plain('y = \\frac{1}{{{m}}}x + {{b}}'), error: 'usedGivenValue' },
    { label: plain('y = -\\frac{1}{{{m}}}x + {{b}}'), error: 'operationInverted' },
  ],
  reasoning: ['A perpendicular slope is the given slope turned over and negated: $-{{m}}$.', 'Substituting $({{x1}}, {{y1}})$ gives $b = {{y1}} + {{m}} \\times {{x1}} = {{b}}$.'],
  answerSummary: { headline: 'Turn the slope over and change its sign; both steps, not one.', text: 'It is $y = -{{m}}x + {{b}}$.' },
  hint: 'What must the two slopes multiply to?',
  feedback: 'Negating alone leaves the line at the wrong angle; it must be inverted too.',
});

mk('A.2F', 'perpendicular-slope-from-standard-form', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'What is the slope of a line perpendicular to ${{a}}x + {{b}}y = {{c}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 9 },
      over: { type: 'int', min: 2, max: 30 },
    },
    // The constant is drawn above b so the distractor built from it always sits
    // above the key, giving the key something on each side of it.
    derived: { c: 'b+over' },
    // The constant shares no factor with a either, so the distractor built from
    // it renders as a reduced fraction like the other three rather than
    // standing out as the one unreduced option.
    constraints: ['a!=b', 'gcd(a,b)==1', 'gcd(c,a)==1'],
  },
  choices: [
    { label: plain('\\frac{{{b}}}{{{a}}}'), correct: true },
    { label: plain('-\\frac{{{a}}}{{{b}}}'), error: 'usedGivenValue' },
    { label: plain('\\frac{{{a}}}{{{b}}}'), error: 'ratioReversed' },
    { label: plain('\\frac{{{c}}}{{{a}}}'), error: 'partialTotal' },
  ],
  reasoning: ['Solving for $y$ gives a slope of $-\\frac{{{a}}}{{{b}}}$.', 'The perpendicular slope turns that over and negates it, leaving $\\frac{{{b}}}{{{a}}}$.'],
  answerSummary: { headline: 'Read the slope out of standard form first, then invert and negate it.', text: 'It is $\\frac{{{b}}}{{{a}}}$.' },
  hint: 'What is the slope of the given line itself?',
  feedback: 'That is the slope of the given line itself, not the perpendicular one.',
});

mk('A.2F', 'is-this-pair-perpendicular', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'Are $y = \\frac{1}{{{m}}}x + {{c}}$ and $y = -{{m}}x + {{d}}$ perpendicular?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 2, max: 20 },
      d: { type: 'int', min: 2, max: 20 },
    },
    derived: {},
    constraints: ['c!=d', 'c!=m', 'd!=m'],
  },
  choices: [
    { label: 'Yes: the slopes $\\frac{1}{{{m}}}$ and $-{{m}}$ multiply to $-1$.', correct: true },
    { label: 'No, because their constants ${{c}}$ and ${{d}}$ are different.', error: 'usedGivenValue' },
    { label: 'Yes, because one slope is positive and the other is negative.', error: 'partialTotal' },
    { label: 'No: perpendicular lines must have equal slopes.', error: 'operationInverted' },
  ],
  reasoning: ['Two lines meet at a right angle exactly when their slopes multiply to $-1$.', 'Here $\\frac{1}{{{m}}} \\times -{{m}} = -1$, so they do.'],
  answerSummary: { headline: 'Multiply the slopes; a right angle gives $-1$.', text: 'Yes, they are perpendicular.' },
  hint: 'Multiply the two slopes together.',
  feedback: 'Opposite signs alone are not enough; the sizes must be reciprocal too.',
});

mk('A.2F', 'perpendicular-to-a-line-through-two-points', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'orderedPairs',
  // The two points give a slope of p/q rather than a whole number on purpose.
  // With a whole-number slope the only four sensible answers are m, -m, 1/m and
  // -1/m, whose order never changes, so the key sat at one rank in every draw.
  // A fractional slope lets the negated-but-not-inverted choice fall on either
  // side of the key.
  prompt: 'A line passes through both points shown. What is the slope of a line perpendicular to it?',
  stimulus: {
    kind: 'orderedPairs',
    title: 'Two points on the line',
    orderedPairs: [{ x: '{{x1}}', y: '{{y1}}' }, { x: '{{x2}}', y: '{{y2}}' }],
  },
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 9 },
      q: { type: 'int', min: 2, max: 9 },
      x1: { type: 'int', min: 1, max: 8 },
      y1: { type: 'int', min: 1, max: 15 },
    },
    derived: { x2: 'x1+q', y2: 'y1+p' },
    // gcd keeps the slope in lowest terms; q*q>p keeps the undivided run below
    // the key rather than letting it drift above.
    constraints: ['p!=q', 'gcd(p,q)==1', 'q*q>p'],
  },
  choices: [
    { label: plain('-\\frac{{{q}}}{{{p}}}'), correct: true },
    { label: plain('-\\frac{{{p}}}{{{q}}}'), error: 'operationInverted' },
    { label: plain('\\frac{{{q}}}{{{p}}}'), error: 'signError' },
    { label: plain('-{{q}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['Between the two points $y$ climbs ${{p}}$ over a run of ${{q}}$, so the slope is $\\frac{{{p}}}{{{q}}}$.', 'Turning that over and negating it gives $-\\frac{{{q}}}{{{p}}}$.'],
  answerSummary: { headline: 'Get the slope from the points first, then invert and negate it.', text: 'It is $-\\frac{{{q}}}{{{p}}}$.' },
  hint: 'What is the slope of the line through the two points?',
  feedback: 'Negating without turning the fraction over leaves the wrong angle.',
});

mk('A.2F', 'perpendicular-given-the-same-slope', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'For a line perpendicular to $y = {{m}}x + {{c}}$ a student keeps slope ${{m}}$. What is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 2, max: 20 },
    },
    derived: { negM: '0-m' },
    constraints: ['c!=m'],
  },
  choices: [
    { label: 'An equal slope gives a parallel line; a perpendicular one needs $-\\frac{1}{{{m}}}$.', correct: true },
    { label: 'The slope should be ${{negM}}$, the same size with the sign changed.', error: 'operationInverted' },
    { label: 'Nothing is wrong, provided the constant is changed as well.', error: 'usedGivenValue' },
    { label: 'The slope should be $\\frac{1}{{{m}}}$, turned over but left positive.', error: 'signError' },
  ],
  reasoning: ['Equal slopes never meet, so they cannot meet at a right angle.', 'The two slopes must multiply to $-1$, which needs $-\\frac{1}{{{m}}}$.'],
  answerSummary: { headline: 'Equal slopes describe parallel lines, not perpendicular ones.', text: 'The slope should be $-\\frac{1}{{{m}}}$.' },
  hint: 'What do two lines with the same slope do?',
  feedback: 'Changing the constant only shifts the line; it does not turn it.',
});

// ================================================================ A.2G
// Lines parallel or perpendicular to an axis, and whether their slope is zero
// or undefined. The slope question is asked with four full sentences rather
// than three numbers and the word "undefined", which would mark the key out by
// its shape alone.

mk('A.2G', 'equation-of-a-horizontal-line', {
  courseId: 'algebra1',
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Which equation describes the horizontal line through $({{x1}}, {{y1}})$?',
  generator: {
    parameters: {
      x1: { type: 'int', min: 1, max: 15 },
      y1: { type: 'int', min: 1, max: 15 },
    },
    derived: {},
    constraints: ['x1!=y1'],
  },
  choices: [
    { label: plain('y = {{y1}}'), correct: true },
    { label: plain('x = {{x1}}'), error: 'ratioReversed' },
    { label: plain('y = {{x1}}'), error: 'usedGivenValue' },
    { label: plain('x = {{y1}}'), error: 'operationInverted' },
  ],
  reasoning: ['A horizontal line holds $y$ fixed while $x$ takes any value.', 'The point sits at height ${{y1}}$, so that is the value $y$ holds.'],
  answerSummary: { headline: 'A horizontal line fixes $y$; a vertical line fixes $x$.', text: 'It is $y = {{y1}}$.' },
  hint: 'Which coordinate stays the same all along a horizontal line?',
  feedback: 'That equation fixes $x$, which draws a vertical line.',
});

mk('A.2G', 'slope-between-two-points-that-share-an-x', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  // The student computes a rise and a run here rather than recalling a fact
  // about a named line: without that the item collapses onto the same relation
  // graph as the error-analysis family lower down.
  prompt: 'What is the slope of the line through $({{a}}, {{y1}})$ and $({{a}}, {{y2}})$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 15 },
      y1: { type: 'int', min: 1, max: 9 },
      climb: { type: 'int', min: 2, max: 9 },
    },
    derived: { y2: 'y1+climb', rise: 'climb' },
    constraints: ['a!=y1', 'a!=y2', 'a!=climb'],
  },
  choices: [
    { label: 'It is undefined: the rise is ${{rise}}$ but the run is zero.', correct: true },
    { label: 'It is zero, because the two points sit at the same $x$.', error: 'ratioReversed' },
    { label: 'It is ${{rise}}$, the change from one point to the other.', error: 'partialTotal' },
    { label: 'It is ${{a}}$, the value both points share.', error: 'usedGivenValue' },
  ],
  reasoning: ['The two points differ by ${{climb}}$ in $y$ and by nothing in $x$.', 'Slope divides rise by run, and a run of zero leaves the quotient undefined.'],
  answerSummary: { headline: 'A run of zero makes the quotient undefined, however large the rise.', text: 'The slope is undefined.' },
  hint: 'Work out the run between the two points.',
  feedback: 'A slope of zero needs a rise of zero, and this rise is not zero.',
});

mk('A.2G', 'line-through-points-that-share-an-x', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'orderedPairs',
  prompt: 'All three points shown lie on one line. What is its equation?',
  stimulus: {
    kind: 'orderedPairs',
    title: 'Points on the line',
    orderedPairs: [{ x: '{{a}}', y: '{{y1}}' }, { x: '{{a}}', y: '{{y2}}' }, { x: '{{a}}', y: '{{y3}}' }],
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 14 },
      y1: { type: 'int', min: 1, max: 8 },
      gap: { type: 'int', min: 2, max: 5 },
    },
    derived: { y2: 'y1+gap', y3: 'y1+2*gap' },
    constraints: ['a!=y1', 'a!=y2', 'a!=y3'],
  },
  choices: [
    { label: plain('x = {{a}}'), correct: true },
    { label: plain('y = {{a}}'), error: 'ratioReversed' },
    { label: plain('y = {{y1}}'), error: 'partialTotal' },
    { label: plain('y = {{gap}}x'), error: 'operationInverted' },
  ],
  reasoning: ['Every point has $x = {{a}}$ while $y$ keeps changing.', 'A line holding one $x$ value is vertical, written $x = {{a}}$.'],
  answerSummary: { headline: 'When one coordinate never changes, that coordinate names the line.', text: 'It is $x = {{a}}$.' },
  hint: 'Which coordinate is the same in all three points?',
  feedback: 'That equation would fix $y$, but $y$ is the coordinate that changes here.',
});

mk('A.2G', 'line-midway-between-two-verticals', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'context',
  prompt: 'Two vertical rails stand at $x = {{p}}$ and $x = {{q}}$. Which equation describes the rail placed midway between them?',
  generator: {
    parameters: {
      u: { type: 'int', min: 1, max: 9 },
      spread: { type: 'int', min: 1, max: 8 },
    },
    derived: {
      v: 'u+spread',
      p: '2*u', q: '2*(u+spread)',
      mid: 'u+(u+spread)',
      diff: '2*spread',
      sum: '2*(u+(u+spread))',
    },
    constraints: ['mid!=diff', 'mid!=sum'],
  },
  choices: [
    { label: plain('x = {{mid}}'), correct: true },
    { label: plain('x = {{diff}}'), error: 'operationInverted' },
    { label: plain('y = {{mid}}'), error: 'ratioReversed' },
    { label: plain('x = {{sum}}'), error: 'partialTotal' },
  ],
  reasoning: ['Halfway between ${{p}}$ and ${{q}}$ is $({{p}} + {{q}}) \\div 2 = {{mid}}$.', 'The new rail is vertical too, so its equation fixes $x$.'],
  answerSummary: { headline: 'Average the two positions, and keep the vertical form.', text: 'It is $x = {{mid}}$.' },
  hint: 'What is the average of the two positions?',
  feedback: 'That is the gap between the rails, not the position of the middle one.',
});

mk('A.2G', 'horizontal-line-called-undefined', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student says the line $y = {{a}}$ has undefined slope. What is wrong?',
  generator: {
    parameters: { a: { type: 'int', min: 2, max: 15 } },
    derived: {},
    constraints: [],
  },
  choices: [
    { label: 'That line is horizontal, so it has plenty of run and no rise: its slope is zero.', correct: true },
    { label: 'Nothing is wrong, since the equation names only one of the two letters.', error: 'usedGivenValue' },
    { label: 'The slope is ${{a}}$, the number the equation gives.', error: 'partialTotal' },
    { label: 'The slope is undefined, but only where the line meets the $y$-axis.', error: 'operationInverted' },
  ],
  reasoning: ['An undefined slope needs a run of zero, which only a vertical line has.', 'Here $y$ never changes while $x$ does, so rise divided by run is zero.'],
  answerSummary: { headline: 'Undefined belongs to vertical lines; horizontal lines have slope zero.', text: 'The slope is zero.' },
  hint: 'Which letter is held fixed by this equation?',
  feedback: 'Naming one letter is what both kinds of line do; which one is fixed decides the slope.',
});

// ================================================================ A.2I
// Writing a system of two linear equations from a description, a table or a
// pair of stated rules. 8.9 already SOLVES a system that has been handed over;
// the verb here is to write one, so no family in this standard is asked for the
// solution point.

mk('A.2I', 'system-from-a-count-and-a-total', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'verbal',
  prompt: 'A canteen sold ${{n}}$ items in all, sandwiches at $\\${{a}}$ and soups at $\\${{b}}$, taking $\\${{t}}$. Which system says so?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 12 },
      b: { type: 'int', min: 2, max: 11 },
      x: { type: 'int', min: 3, max: 15 },
      y: { type: 'int', min: 3, max: 15 },
    },
    derived: { n: 'x+y', t: 'a*x+b*y', both: 'a+b' },
    constraints: ['a!=b', 'n!=t'],
  },
  choices: [
    { label: plain('x + y = {{n}} \\text{ and } {{a}}x + {{b}}y = {{t}}'), correct: true },
    { label: plain('x + y = {{n}} \\text{ and } {{b}}x + {{a}}y = {{t}}'), error: 'ratioReversed' },
    { label: plain('{{a}}x + {{b}}y = {{n}} \\text{ and } x + y = {{t}}'), error: 'operationInverted' },
    { label: plain('x + y = {{n}} \\text{ and } {{both}}(x + y) = {{t}}'), error: 'partialTotal' },
  ],
  reasoning: ['Counting the items ignores their prices, giving $x + y = {{n}}$.', 'The money adds $\\${{a}}$ for each sandwich and $\\${{b}}$ for each soup, giving ${{a}}x + {{b}}y = {{t}}$.'],
  answerSummary: { headline: 'One equation counts the items, the other counts the money.', text: 'It is $x + y = {{n}}$ with ${{a}}x + {{b}}y = {{t}}$.' },
  hint: 'Which of the two totals has nothing to do with price?',
  feedback: 'The two prices differ, so they cannot be pulled out of one bracket.',
});

mk('A.2I', 'system-from-a-two-column-table', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 2, taskType: 'interpretation', representation: 'table',
  prompt: 'Which system describes the two columns?',
  stimulus: {
    kind: 'table',
    title: 'Recorded values',
    table: {
      headers: ['x', 'Line 1', 'Line 2'],
      rows: [['{{x1}}', '{{p1}}', '{{q1}}'], ['{{x2}}', '{{p2}}', '{{q2}}'], ['{{x3}}', '{{p3}}', '{{q3}}']],
    },
  },
  generator: {
    parameters: {
      m1: { type: 'int', min: 2, max: 9 },
      m2: { type: 'int', min: 2, max: 9 },
      b1: { type: 'int', min: 1, max: 14 },
      b2: { type: 'int', min: 1, max: 14 },
      x1: { type: 'int', min: 1, max: 4 },
    },
    derived: {
      x2: 'x1+1', x3: 'x1+2',
      p1: 'm1*x1+b1', p2: 'm1*(x1+1)+b1', p3: 'm1*(x1+2)+b1',
      q1: 'm2*x1+b2', q2: 'm2*(x1+1)+b2', q3: 'm2*(x1+2)+b2',
    },
    constraints: ['m1!=m2', 'b1!=b2', 'm1!=b1', 'm2!=b2'],
  },
  choices: [
    { label: plain('y = {{m1}}x + {{b1}} \\text{ and } y = {{m2}}x + {{b2}}'), correct: true },
    { label: plain('y = {{m1}}x + {{b2}} \\text{ and } y = {{m2}}x + {{b1}}'), error: 'ratioReversed' },
    { label: plain('y = {{m2}}x + {{b1}} \\text{ and } y = {{m1}}x + {{b2}}'), error: 'operationInverted' },
    { label: plain('y = {{m1}}x - {{b1}} \\text{ and } y = {{m2}}x - {{b2}}'), error: 'signError' },
  ],
  reasoning: ['Column one climbs ${{m1}}$ each step and reads ${{b1}}$ back at $x = 0$.', 'Column two climbs ${{m2}}$ each step and reads ${{b2}}$ back at $x = 0$.'],
  answerSummary: { headline: 'Each column gives one equation: its step is the slope, its start the constant.', text: 'It is $y = {{m1}}x + {{b1}}$ with $y = {{m2}}x + {{b2}}$.' },
  hint: 'How much does each column change for one step in $x$?',
  feedback: 'Check which constant belongs to which column by testing the first row.',
});

mk('A.2I', 'system-for-a-sum-and-a-gap', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'A larger number $x$ and a smaller number $y$ add to ${{s}}$, and $x$ exceeds $y$ by ${{d}}$. Which system says so?',
  generator: {
    parameters: {
      y: { type: 'int', min: 2, max: 20 },
      d: { type: 'int', min: 2, max: 18 },
    },
    derived: { s: '2*y+d' },
    constraints: ['s!=d'],
  },
  choices: [
    { label: plain('x + y = {{s}} \\text{ and } x - y = {{d}}'), correct: true },
    { label: plain('x + y = {{s}} \\text{ and } y - x = {{d}}'), error: 'signError' },
    { label: plain('x - y = {{s}} \\text{ and } x + y = {{d}}'), error: 'ratioReversed' },
    { label: plain('x + y = {{s}} \\text{ and } x = {{d}}y'), error: 'operationInverted' },
  ],
  reasoning: ['Adding the two numbers gives $x + y = {{s}}$.', 'Exceeding by ${{d}}$ is a subtraction, and $x$ is the larger, so $x - y = {{d}}$.'],
  answerSummary: { headline: 'Exceeds by means subtract, in the order the sentence names.', text: 'It is $x + y = {{s}}$ with $x - y = {{d}}$.' },
  hint: 'Which number is taken away from which?',
  feedback: 'Exceeding by an amount is a difference, not a multiple.',
});

mk('A.2I', 'system-for-two-charging-plans', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'context',
  prompt: 'Plan A charges $\\${{f1}}$ to join and $\\${{m1}}$ a month; Plan B charges $\\${{f2}}$ and $\\${{m2}}$ a month. Which system gives each cost $y$ after $x$ months?',
  generator: {
    parameters: {
      f1: { type: 'int', min: 10, max: 60 },
      f2: { type: 'int', min: 10, max: 60 },
      m1: { type: 'int', min: 2, max: 15 },
      m2: { type: 'int', min: 2, max: 15 },
    },
    derived: {},
    constraints: ['f1!=f2', 'm1!=m2', 'f1!=m1', 'f2!=m2', 'f1!=m2', 'f2!=m1'],
  },
  choices: [
    { label: plain('y = {{m1}}x + {{f1}} \\text{ and } y = {{m2}}x + {{f2}}'), correct: true },
    { label: plain('y = {{f1}}x + {{m1}} \\text{ and } y = {{f2}}x + {{m2}}'), error: 'ratioReversed' },
    { label: plain('y = {{m1}}x + {{f2}} \\text{ and } y = {{m2}}x + {{f1}}'), error: 'usedGivenValue' },
    { label: plain('y = ({{m1}} + {{f1}})x \\text{ and } y = ({{m2}} + {{f2}})x'), error: 'partialTotal' },
  ],
  reasoning: ['The joining fee is paid once, so it is the constant, not a rate.', 'The monthly charge is what multiplies the number of months.'],
  answerSummary: { headline: 'A one-off charge is the constant; a repeating charge is the slope.', text: 'It is $y = {{m1}}x + {{f1}}$ with $y = {{m2}}x + {{f2}}$.' },
  hint: 'Which charge is paid again every month?',
  feedback: 'Folding the joining fee into the monthly rate charges it every month.',
});

mk('A.2I', 'prices-put-in-the-counting-equation', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'For ${{n}}$ tickets costing $\\${{t}}$ in all, at $\\${{a}}$ and $\\${{b}}$ each, a student writes ${{a}}x + {{b}}y = {{n}}$ for the count. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 4, max: 15 },
      b: { type: 'int', min: 2, max: 13 },
      x: { type: 'int', min: 3, max: 15 },
      y: { type: 'int', min: 3, max: 15 },
    },
    derived: { n: 'x+y', t: 'a*x+b*y' },
    constraints: ['a!=b', 'n!=t'],
  },
  choices: [
    { label: 'Counting tickets ignores their prices: the count equation is $x + y = {{n}}$.', correct: true },
    { label: 'Nothing is wrong, because both prices are used somewhere in the system.', error: 'usedGivenValue' },
    { label: 'The two prices are attached to the wrong items and should be swapped.', error: 'ratioReversed' },
    { label: 'The equation is right, but it should be set equal to $\\${{t}}$ instead.', error: 'partialTotal' },
  ],
  reasoning: ['A count of tickets is a number of tickets, so each ticket contributes exactly $1$.', 'The prices belong in the money equation, ${{a}}x + {{b}}y = {{t}}$.'],
  answerSummary: { headline: 'The counting equation has no prices in it at all.', text: 'It should be $x + y = {{n}}$.' },
  hint: 'What does each single ticket add to the count?',
  feedback: 'That equation is the money equation, not the count.',
});

// ================================================================ A.3A
// Slope from an equation. 7.7 already reads the slope out of y = mx + b and
// 8.4A gets it from a table or a pair of points, so every family here works
// from a form that neither of those touches: standard form, point-slope form,
// and an equation solved for x instead of y.

mk('A.3A', 'slope-from-standard-form', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'What is the slope of ${{a}}x + {{b}}y = {{c}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 9 },
      over: { type: 'int', min: 2, max: 30 },
    },
    // The constant sits above a so the choice built from it is always steeper
    // than the key, leaving the key with one option on each side.
    derived: { c: 'a+over' },
    constraints: ['a!=b', 'gcd(a,b)==1', 'gcd(c,b)==1'],
  },
  choices: [
    { label: plain('-\\frac{{{a}}}{{{b}}}'), correct: true },
    { label: plain('\\frac{{{a}}}{{{b}}}'), error: 'signError' },
    { label: plain('-\\frac{{{b}}}{{{a}}}'), error: 'ratioReversed' },
    { label: plain('-\\frac{{{c}}}{{{b}}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Solving for $y$ gives ${{b}}y = -{{a}}x + {{c}}$.', 'Dividing by ${{b}}$ leaves a slope of $-\\frac{{{a}}}{{{b}}}$.'],
  answerSummary: { headline: 'Standard form hides the slope until the equation is solved for $y$.', text: 'It is $-\\frac{{{a}}}{{{b}}}$.' },
  hint: 'What happens when you make $y$ the subject?',
  feedback: 'Moving the $x$ term across changes its sign.',
});

mk('A.3A', 'hourly-rate-from-point-slope-form', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A repair bill follows $y - {{y1}} = {{m}}(x - {{x1}})$, where $x$ is hours. What is the hourly rate?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 15 },
      // Drawn over the same range as m: this is the one choice that can land on
      // either side of the key, and it only does so evenly if the two ranges
      // match.
      x1: { type: 'int', min: 2, max: 15 },
      y1: { type: 'int', min: 20, max: 90 },
    },
    derived: { negM: '0-m' },
    constraints: ['m!=x1', 'm!=y1', 'x1!=y1'],
  },
  choices: [
    { label: plain('{{m}}'), correct: true },
    { label: plain('{{y1}}'), error: 'usedGivenValue' },
    { label: plain('{{x1}}'), error: 'partialTotal' },
    { label: plain('{{negM}}'), error: 'signError' },
  ],
  reasoning: ['In point-slope form the number multiplying the bracket is the slope.', 'A slope of ${{m}}$ means the bill climbs $\\${{m}}$ for each extra hour.'],
  answerSummary: { headline: 'The multiplier outside the bracket is the rate.', text: 'It is ${{m}}$ an hour.' },
  hint: 'Which number is multiplying the bracket that holds $x$?',
  feedback: 'That is one recorded bill, not the rate at which it grows.',
});

mk('A.3A', 'slope-when-solved-for-x', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'What is the slope of the line $x = {{a}}y + {{b}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      // b decides where a/b falls against the key of 1/a — it crosses when a*a
      // passes b. A narrow range for b put it above the key in four draws out
      // of five; this one splits it about evenly.
      b: { type: 'int', min: 2, max: 60 },
    },
    derived: {},
    constraints: ['a!=b', 'a*a!=b'],
  },
  choices: [
    { label: plain('\\frac{1}{{{a}}}'), correct: true },
    { label: plain('-\\frac{1}{{{a}}}'), error: 'signError' },
    { label: plain('\\frac{{{b}}}{{{a}}}'), error: 'usedGivenValue' },
    { label: plain('\\frac{{{a}}}{{{b}}}'), error: 'ratioReversed' },
  ],
  reasoning: ['Making $y$ the subject gives $y = \\frac{x - {{b}}}{{{a}}}$.', 'The number multiplying $x$ is then $\\frac{1}{{{a}}}$.'],
  answerSummary: { headline: 'An equation solved for $x$ gives the reciprocal of the slope, not the slope.', text: 'It is $\\frac{1}{{{a}}}$.' },
  hint: 'Rearrange until $y$ stands alone.',
  feedback: 'That is how much $x$ changes per unit of $y$, which is the other way round.',
});

mk('A.3A', 'which-line-falls-fastest', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'symbolic',
  // "Steepest" is ambiguous once every slope is negative, so the prompt asks
  // which one falls fastest, which has a single defensible reading.
  prompt: 'On which line does $y$ fall fastest as $x$ increases?',
  generator: {
    parameters: {
      a: { type: 'int', min: 5, max: 12 },
      b: { type: 'int', min: 2, max: 5 },
      c: { type: 'int', min: 12, max: 60 },
      down: { type: 'int', min: 1, max: 3 },
      up: { type: 'int', min: 1, max: 4 },
    },
    derived: { a2: 'a-down', b2: 'b+up' },
    constraints: ['a2>=2'],
  },
  choices: [
    { label: plain('{{a}}x + {{b}}y = {{c}}'), correct: true },
    { label: plain('{{a}}x + {{b2}}y = {{c}}'), error: 'ratioReversed' },
    { label: plain('{{a2}}x + {{b}}y = {{c}}'), error: 'partialTotal' },
    { label: plain('{{a2}}x + {{b2}}y = {{c}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Each line falls at $\\frac{a}{b}$ for its own pair of coefficients.', 'The largest $x$ coefficient over the smallest $y$ coefficient gives the fastest fall, $\\frac{{{a}}}{{{b}}}$.'],
  answerSummary: { headline: 'Compare the ratio of the coefficients, not either one alone.', text: 'It is ${{a}}x + {{b}}y = {{c}}$.' },
  hint: 'Work out how far $y$ drops for one step in $x$ on each line.',
  feedback: 'A larger $y$ coefficient spreads the same drop over more $y$, making the fall slower.',
});

mk('A.3A', 'coefficient-read-as-the-slope', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student reads the slope of ${{a}}x + {{b}}y = {{c}}$ as ${{a}}$. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 12, max: 60 },
    },
    derived: {},
    constraints: ['a!=b', 'gcd(a,b)==1'],
  },
  choices: [
    { label: 'The equation is not solved for $y$ yet: the slope is $-\\frac{{{a}}}{{{b}}}$.', correct: true },
    { label: 'The size is right, but the sign should be negative, giving $-{{a}}$.', error: 'signError' },
    { label: 'Nothing is wrong, because ${{a}}$ is the number attached to $x$.', error: 'usedGivenValue' },
    { label: 'The slope should be ${{c}}$, the number standing alone.', error: 'partialTotal' },
  ],
  reasoning: ['A slope can only be read straight off an equation that has $y$ by itself.', 'Here $y$ still carries a coefficient of ${{b}}$, which has to be divided out.'],
  answerSummary: { headline: 'Read a slope only from an equation solved for $y$.', text: 'The slope is $-\\frac{{{a}}}{{{b}}}$.' },
  hint: 'What still has to happen to the ${{b}}y$ term?',
  feedback: 'Fixing the sign alone still leaves the ${{b}}$ undivided.',
});

// ================================================================ A.3C
// Key features of a linear function: intercepts, zeros and what they mean.
// 8.5I writes the equation; nothing below this asks where a line crosses an
// axis or what the crossing stands for.

mk('A.3C', 'where-a-line-crosses-the-horizontal-axis', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Where does ${{a}}x + {{b}}y = {{c}}$ cross the horizontal axis?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 9 },
      k: { type: 'int', min: 2, max: 8 },
    },
    derived: { c: 'a*b*k', xInt: 'b*k', yInt: 'a*k' },
    constraints: ['a!=b'],
  },
  choices: [
    { label: plain('({{xInt}}, 0)'), correct: true },
    { label: plain('(0, {{xInt}})'), error: 'ratioReversed' },
    { label: plain('({{yInt}}, 0)'), error: 'usedGivenValue' },
    { label: plain('({{c}}, 0)'), error: 'partialTotal' },
  ],
  reasoning: ['On the horizontal axis $y = 0$, so the equation becomes ${{a}}x = {{c}}$.', 'That gives $x = {{xInt}}$, and the crossing is $({{xInt}}, 0)$.'],
  answerSummary: { headline: 'Set the other variable to zero and solve.', text: 'It crosses at $({{xInt}}, 0)$.' },
  hint: 'What is $y$ everywhere along the horizontal axis?',
  feedback: 'Dividing by the wrong coefficient gives the crossing on the other axis.',
});

mk('A.3C', 'zero-of-a-linear-function', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'What is the zero of $f(x) = {{m}}x - {{p}}$?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      z: { type: 'int', min: 2, max: 12 },
    },
    derived: { p: 'm*z', negZ: '0-z' },
    constraints: ['m!=z'],
  },
  choices: [
    { label: plain('{{z}}'), correct: true },
    { label: plain('{{negZ}}'), error: 'signError' },
    { label: plain('{{p}}'), error: 'usedGivenValue' },
    { label: plain('{{m}}'), error: 'partialTotal' },
  ],
  reasoning: ['A zero is the input that makes the output nothing, so ${{m}}x - {{p}} = 0$.', 'That gives ${{m}}x = {{p}}$, so $x = {{z}}$.'],
  answerSummary: { headline: 'A zero of a function is where its value, not its input, is nothing.', text: 'It is ${{z}}$.' },
  hint: 'What must $f(x)$ equal at a zero?',
  feedback: 'That is the constant in the rule, not the input that cancels it.',
});

mk('A.3C', 'reading-the-vertical-crossing-off-a-table', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 2, taskType: 'interpretation', representation: 'table',
  // No row sits at x = 0, so the crossing has to be worked back to rather than
  // read off, which is the feature the standard names.
  prompt: 'Where does this line cross the vertical axis?',
  stimulus: {
    kind: 'table',
    title: 'Recorded values',
    table: { headers: ['x', 'y'], rows: [['{{x1}}', '{{y1}}'], ['{{x2}}', '{{y2}}'], ['{{x3}}', '{{y3}}']] },
  },
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 20 },
      x1: { type: 'int', min: 2, max: 6 },
      step: { type: 'int', min: 1, max: 3 },
    },
    derived: {
      x2: 'x1+step', x3: 'x1+2*step',
      y1: 'm*x1+b', y2: 'm*(x1+step)+b', y3: 'm*(x1+2*step)+b',
    },
    constraints: ['b!=y1', 'b!=m', 'b!=x1'],
  },
  choices: [
    { label: plain('(0, {{b}})'), correct: true },
    { label: plain('(0, {{y1}})'), error: 'usedGivenValue' },
    { label: plain('({{b}}, 0)'), error: 'ratioReversed' },
    { label: plain('(0, {{m}})'), error: 'partialTotal' },
  ],
  reasoning: ['Each step of ${{step}}$ in $x$ raises $y$ by ${{m}}$ times that, so the slope is ${{m}}$.', 'Walking back from $({{x1}}, {{y1}})$ to $x = 0$ leaves $y = {{b}}$.'],
  answerSummary: { headline: 'Work back to $x = 0$ at the rate the line itself sets.', text: 'It crosses at $(0, {{b}})$.' },
  hint: 'How much does $y$ change for one step in $x$?',
  feedback: 'The first row is not the crossing unless its $x$ is already zero.',
});

mk('A.3C', 'what-the-horizontal-crossing-stands-for', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'context',
  prompt: 'A tank holds $y = {{b}} - {{m}}x$ litres after $x$ minutes. What does the crossing on the horizontal axis stand for?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      t: { type: 'int', min: 4, max: 15 },
    },
    derived: { b: 'm*t' },
    constraints: ['m!=t'],
  },
  choices: [
    { label: 'The tank is empty after ${{t}}$ minutes.', correct: true },
    { label: 'The tank holds ${{b}}$ litres at the start.', error: 'ratioReversed' },
    { label: 'The tank loses ${{m}}$ litres every minute.', error: 'partialTotal' },
    { label: 'The tank is empty after ${{b}}$ minutes.', error: 'usedGivenValue' },
  ],
  reasoning: ['The horizontal axis is where $y$, the litres held, is zero.', 'Setting ${{b}} - {{m}}x = 0$ gives $x = {{t}}$ minutes.'],
  answerSummary: { headline: 'A crossing on the horizontal axis is where the quantity runs out.', text: 'The tank is empty at ${{t}}$ minutes.' },
  hint: 'What is $y$ at that crossing, and what does $y$ measure here?',
  feedback: 'The starting amount is the crossing on the other axis.',
});

mk('A.3C', 'intercepts-swapped-over', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'For ${{a}}x + {{b}}y = {{c}}$ a student gives the horizontal crossing as $({{yInt}}, 0)$. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 9 },
      k: { type: 'int', min: 2, max: 8 },
    },
    derived: { c: 'a*b*k', xInt: 'b*k', yInt: 'a*k' },
    constraints: ['a!=b'],
  },
  choices: [
    { label: 'Setting $y = 0$ divides by ${{a}}$, not ${{b}}$, so the crossing is $({{xInt}}, 0)$.', correct: true },
    { label: 'Nothing is wrong, since ${{yInt}}$ does come from the equation.', error: 'usedGivenValue' },
    { label: 'The number is right but the pair should be written $(0, {{yInt}})$.', error: 'ratioReversed' },
    { label: 'The crossing should be $({{c}}, 0)$, using the constant unchanged.', error: 'partialTotal' },
  ],
  reasoning: ['On the horizontal axis $y$ is zero, which removes the ${{b}}y$ term entirely.', 'What is left is ${{a}}x = {{c}}$, giving $x = {{xInt}}$.'],
  answerSummary: { headline: 'Whichever variable is set to zero, divide by the coefficient of the other.', text: 'The crossing is $({{xInt}}, 0)$.' },
  hint: 'Which term disappears when $y = 0$?',
  feedback: 'That value is where the line crosses the other axis.',
});

// ================================================================ A.3F
// What graphing a system shows. 8.9 already finds the crossing of two lines
// that meet at a whole-numbered point, so these five take the cases that
// graphing is actually used for: a system with no single answer, a crossing
// that falls between whole numbers, and a crossing that lands on an axis.

mk('A.3F', 'the-same-line-written-twice', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'How many pairs satisfy both ${{a}}x + {{b}}y = {{c}}$ and ${{a2}}x + {{b2}}y = {{c2}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 7 },
      b: { type: 'int', min: 2, max: 7 },
      k: { type: 'int', min: 2, max: 4 },
      base: { type: 'int', min: 3, max: 15 },
    },
    derived: { c: 'a*base', a2: 'a*k', b2: 'b*k', c2: 'a*base*k' },
    constraints: ['a!=b'],
  },
  choices: [
    { label: 'Infinitely many: the second equation is the first multiplied by ${{k}}$, so the two graphs are one line.', correct: true },
    { label: 'Exactly one, because the two equations are written differently.', error: 'usedGivenValue' },
    { label: 'None, because no pair can satisfy two different equations at once.', error: 'operationInverted' },
    { label: 'Exactly ${{k}}$, one for each time the first equation was multiplied.', error: 'partialTotal' },
  ],
  reasoning: ['Multiplying every term of the first equation by ${{k}}$ gives the second exactly.', 'Two names for one line share every point on it.'],
  answerSummary: { headline: 'A system whose equations are multiples of each other draws a single line.', text: 'Infinitely many pairs satisfy both.' },
  hint: 'What happens if you multiply the first equation through by ${{k}}$?',
  feedback: 'Looking different is not the same as being different.',
});

mk('A.3F', 'between-which-rows-the-lines-cross', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'table',
  // The crossing deliberately falls between two tabulated values of x: reading
  // it off exactly is impossible, which is what estimating from a graph means.
  prompt: 'Between which two values of $x$ do the two lines cross?',
  stimulus: {
    kind: 'table',
    title: 'Recorded values',
    table: {
      headers: ['x', 'Line 1', 'Line 2'],
      rows: [['{{x1}}', '{{p1}}', '{{q1}}'], ['{{x2}}', '{{p2}}', '{{q2}}'], ['{{x3}}', '{{p3}}', '{{q3}}'], ['{{x4}}', '{{p4}}', '{{q4}}']],
    },
  },
  generator: {
    parameters: {
      x1: { type: 'int', min: 1, max: 5 },
      lead: { type: 'int', min: 4, max: 9 },
      gain: { type: 'int', min: 2, max: 8 },
      slow: { type: 'int', min: 1, max: 3 },
    },
    derived: {
      x2: 'x1+1', x3: 'x1+2', x4: 'x1+3',
      // Line 1 starts ahead by `lead` and gains `slow` a step; line 2 gains
      // `slow + gain`, so it overtakes somewhere strictly inside the table.
      p1: '20+lead', p2: '20+lead+slow', p3: '20+lead+2*slow', p4: '20+lead+3*slow',
      q1: '20', q2: '20+slow+gain', q3: '20+2*(slow+gain)', q4: '20+3*(slow+gain)',
    },
    // The overtake must happen strictly between the second and third rows, so
    // line 2 is still behind at row 2 and already ahead at row 3.
    constraints: ['gain<lead', '2*gain>lead'],
  },
  choices: [
    { label: plain('{{x2}} \\text{ and } {{x3}}'), correct: true },
    { label: plain('{{x1}} \\text{ and } {{x2}}'), error: 'offByOneStep' },
    { label: plain('{{x3}} \\text{ and } {{x4}}'), error: 'forgotFinalStep' },
    { label: plain('{{x1}} \\text{ and } {{x4}}'), error: 'partialTotal' },
  ],
  reasoning: ['Line 2 is still below line 1 at $x = {{x2}}$ and above it at $x = {{x3}}$.', 'The two must therefore have crossed somewhere in between.'],
  answerSummary: { headline: 'A crossing sits between the last row where one leads and the first where the other does.', text: 'Between ${{x2}}$ and ${{x3}}$.' },
  hint: 'Where does the column that was behind become the column in front?',
  feedback: 'Check which column is larger in each row before choosing.',
});

mk('A.3F', 'lines-that-meet-on-the-vertical-axis', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Where do $y = {{m1}}x + {{c}}$ and $y = {{m2}}x + {{c}}$ cross?',
  generator: {
    parameters: {
      m1: { type: 'int', min: 2, max: 9 },
      m2: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 3, max: 25 },
    },
    derived: { sum: 'm1+m2' },
    constraints: ['m1!=m2', 'c!=m1', 'c!=m2', 'c!=sum'],
  },
  choices: [
    { label: plain('(0, {{c}})'), correct: true },
    { label: plain('({{c}}, 0)'), error: 'ratioReversed' },
    { label: plain('({{c}}, {{c}})'), error: 'usedGivenValue' },
    { label: plain('(0, {{sum}})'), error: 'partialTotal' },
  ],
  reasoning: ['Setting the two right-hand sides equal gives ${{m1}}x = {{m2}}x$, so $x = 0$.', 'At $x = 0$ both lines give $y = {{c}}$.'],
  answerSummary: { headline: 'Two lines sharing a constant already meet on the vertical axis.', text: 'They cross at $(0, {{c}})$.' },
  hint: 'What do the two equations have in common?',
  feedback: 'Check which coordinate is zero at a crossing on the vertical axis.',
});

mk('A.3F', 'about-when-two-plans-cost-the-same', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'context',
  prompt: 'Plan A costs $\\${{f1}}$ plus $\\${{m1}}$ a month and Plan B $\\${{f2}}$ plus $\\${{m2}}$. After about how many months do they match?',
  generator: {
    parameters: {
      m1: { type: 'int', min: 3, max: 9 },
      // gain doubles as the crossing choice, so it shares the range of whole.
      gain: { type: 'int', min: 2, max: 9 },
      whole: { type: 'int', min: 2, max: 9 },
      f2: { type: 'int', min: 10, max: 40 },
    },
    // The crossing is put a little past a whole month, so the honest answer is
    // an estimate rather than a value read straight off.
    derived: {
      m2: 'm1+gain',
      f1: 'f2+gain*whole+1',
      headStart: 'gain*whole+1',
      double: '2*whole',
      // Dividing the head start by Plan B's whole monthly charge instead of by
      // the amount it gains each month. Always short of the answer, and a far
      // more likely slip than a value two months off it.
      wrongDivisor: 'round((gain*whole+1)/(m1+gain))',
    },
    constraints: ['wrongDivisor>=1', 'wrongDivisor!=gain', 'gain!=whole', 'double!=whole', 'f1!=f2'],
  },
  choices: [
    { label: plain('{{whole}}'), correct: true },
    { label: plain('{{wrongDivisor}}'), error: 'usedGivenValue' },
    { label: plain('{{double}}'), error: 'operationInverted' },
    { label: plain('{{gain}}'), error: 'partialTotal' },
  ],
  reasoning: ['Plan A starts $\\${{headStart}}$ ahead, and Plan B gains $\\${{gain}}$ a month on it.', 'That gap closes a little after ${{whole}}$ months, so ${{whole}}$ is the nearest whole month.'],
  answerSummary: { headline: 'Divide the head start by the monthly gain, then round to the nearest month.', text: 'After about ${{whole}}$ months.' },
  hint: 'How much does the gap between the two plans shrink each month?',
  feedback: 'That is the monthly difference, not the number of months it takes.',
});

mk('A.3F', 'parallel-lines-said-to-meet-later', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'Graphing $y = {{m}}x + {{c1}}$ and $y = {{m}}x + {{c2}}$, a student says they meet further right. What is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      c1: { type: 'int', min: 2, max: 15 },
      gap: { type: 'int', min: 2, max: 15 },
    },
    derived: { c2: 'c1+gap' },
    constraints: ['c1!=m', 'gap!=m'],
  },
  choices: [
    { label: 'Equal slopes keep the lines a fixed ${{gap}}$ apart, so they never meet at all.', correct: true },
    { label: 'They meet, but to the left rather than to the right.', error: 'signError' },
    { label: 'Nothing is wrong: any two straight lines meet somewhere.', error: 'operationInverted' },
    { label: 'They meet where $x = {{gap}}$, once the constants have been subtracted.', error: 'partialTotal' },
  ],
  reasoning: ['Setting the two right-hand sides equal removes the ${{m}}x$ terms and leaves ${{c1}} = {{c2}}$, which is false.', 'A system with no solution graphs as two lines that stay apart forever.'],
  answerSummary: { headline: 'Same slope and different constants means no crossing anywhere.', text: 'The lines never meet.' },
  hint: 'What happens to the $x$ terms when you set the two sides equal?',
  feedback: 'Extending the axes further does not bring parallel lines together.',
});

// ================================================================ A.5A
// Solving a linear equation in one variable. 8.8C already handles whole-number
// coefficients on both sides, so this standard takes the parts it does not:
// a fractional coefficient, a bracket to distribute, and working backwards to
// a constant that produces a stated solution.

mk('A.5A', 'equation-with-a-fractional-coefficient', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Solve $\\frac{x}{{{d}}} + {{p}} = {{q}}$.',
  generator: {
    parameters: {
      d: { type: 'int', min: 2, max: 5 },
      // dividedFirst is rise + p against a key of d * rise, so it crosses when
      // p passes (d - 1) * rise. These three ranges are chosen to make that
      // happen about half the time rather than almost never.
      p: { type: 'int', min: 2, max: 30 },
      rise: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      q: 'p+rise',
      x: 'd*rise',
      noDivide: 'rise',
      dividedFirst: 'rise+p',
      multipliedBoth: 'd*(p+rise)',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{x}}'), correct: true },
    { label: plain('{{noDivide}}'), error: 'forgotFinalStep' },
    { label: plain('{{dividedFirst}}'), error: 'orderOfOperations' },
    { label: plain('{{multipliedBoth}}'), error: 'partialTotal' },
  ],
  reasoning: ['Taking ${{p}}$ from both sides leaves $\\frac{x}{{{d}}} = {{rise}}$.', 'Multiplying by ${{d}}$ then gives $x = {{x}}$.'],
  answerSummary: { headline: 'Undo the addition first, then the division.', text: 'It is ${{x}}$.' },
  hint: 'What is $\\frac{x}{{{d}}}$ worth once ${{p}}$ has been taken off?',
  feedback: 'The division by ${{d}}$ still has to be undone.',
});

mk('A.5A', 'equation-with-the-whole-side-over-a-denominator', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
  // The companion family divides the variable and then adds; this one adds
  // first and divides the whole lot, so the two undo their steps in opposite
  // orders rather than being the same exercise twice.
  prompt: 'What value of $x$ satisfies $\\frac{x + {{p}}}{{{d}}} = {{q}}$?',
  generator: {
    parameters: {
      d: { type: 'int', min: 2, max: 9 },
      // wrongMultiplier is p * q against a key near d * q, so p shares d's
      // range and lands on either side of the key about equally often.
      p: { type: 'int', min: 2, max: 9 },
      q: { type: 'int', min: 3, max: 15 },
    },
    derived: {
      x: 'd*q-p',
      noSubtract: 'd*q',
      noMultiply: 'q-p',
      wrongMultiplier: 'p*q',
    },
    constraints: ['p!=d', 'x>=1'],
  },
  choices: [
    { label: plain('{{x}}'), correct: true },
    { label: plain('{{noSubtract}}'), error: 'forgotFinalStep' },
    { label: plain('{{noMultiply}}'), error: 'partialTotal' },
    { label: plain('{{wrongMultiplier}}'), error: 'orderOfOperations' },
  ],
  reasoning: ['Multiplying both sides by ${{d}}$ gives $x + {{p}} = {{d}} \\times {{q}}$.', 'Taking ${{p}}$ off both sides leaves $x = {{x}}$.'],
  answerSummary: { headline: 'Clear the denominator from the whole side first, then undo the addition.', text: 'It is ${{x}}$.' },
  hint: 'What is $x + {{p}}$ worth once the denominator is cleared?',
  feedback: 'The ${{p}}$ is inside the fraction, so it is only removed after multiplying.',
});

mk('A.5A', 'where-an-expression-reaches-a-target', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 2, taskType: 'interpretation', representation: 'table',
  // An earlier version tabulated two expressions and asked which row they
  // agreed on. The answer was then always the third of four ascending values,
  // so the key sat at one rank in every draw and no range could shift it. Here
  // the target lies outside the table, so the answer is a value the student
  // works out rather than one of the rows on show.
  prompt: 'The table gives ${{a}}x + {{b}}$. At which $x$ does it reach ${{target}}$?',
  stimulus: {
    kind: 'table',
    title: 'Values of the expression',
    table: {
      headers: ['x', 'Value'],
      rows: [['{{x1}}', '{{v1}}'], ['{{x2}}', '{{v2}}'], ['{{x3}}', '{{v3}}']],
    },
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 25 },
      // Excluding s from the three tabulated rows removes three values that
      // all sit at or above x1, which quietly biases s downward. The range
      // is lifted to compensate, so x1 lands above the key about half the
      // time instead of in five draws out of eight.
      s: { type: 'int', min: 4, max: 17 },
      x1: { type: 'int', min: 3, max: 15 },
      step: { type: 'int', min: 1, max: 3 },
    },
    derived: {
      x2: 'x1+step', x3: 'x1+2*step',
      v1: 'a*x1+b', v2: 'a*(x1+step)+b', v3: 'a*(x1+2*step)+b',
      target: 'a*s+b',
      noSubtract: 'a*s',
      constantInRate: 'floor((a*s+b)/(a+b))',
    },
    // The target must not be one of the rows, or it could be read off instead
    // of worked out. x1 doubles as the choice that lands on either side of the
    // key, so it shares the range of s.
    constraints: ['s!=x1', 's!=x2', 's!=x3', 's!=noSubtract', 's!=constantInRate'],
  },
  choices: [
    { label: plain('{{s}}'), correct: true },
    { label: plain('{{x1}}'), error: 'usedGivenValue' },
    { label: plain('{{noSubtract}}'), error: 'forgotFinalStep' },
    { label: plain('{{constantInRate}}'), error: 'orderOfOperations' },
  ],
  reasoning: ['Reaching ${{target}}$ means ${{a}}x + {{b}} = {{target}}$, so ${{a}}x = {{noSubtract}}$.', 'Dividing by ${{a}}$ gives $x = {{s}}$, past the last row shown.'],
  answerSummary: { headline: 'Take off the constant first, then divide by what multiplies $x$.', text: 'It is $x = {{s}}$.' },
  hint: 'What is ${{a}}x$ worth when the expression reaches ${{target}}$?',
  feedback: 'The ${{b}}$ is added once, not once per $x$, so it cannot join the rate.',
});

mk('A.5A', 'constant-that-produces-a-given-solution', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: 'For which $c$ does ${{a}}x + c = {{b}}x + {{q}}$ have the solution $x = {{s}}$?',
  generator: {
    parameters: {
      // b and drop are drawn independently and a is built from them, rather
      // than drawing a and subtracting. Deriving b from a made b larger than
      // drop in three draws out of four, which pinned the key's rank.
      b: { type: 'int', min: 2, max: 10 },
      drop: { type: 'int', min: 2, max: 10 },
      q: { type: 'int', min: 2, max: 20 },
      s: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      a: 'b+drop',
      c: 'q-drop*s',
      signFlipped: 'q+drop*s',
      // Using the other coefficient. b is above drop about half the time, so
      // this is the choice that lands on either side of the key; q - drop was
      // above it in every single draw.
      usedB: 'q-b*s',
      usedA: 'q-a*s',
    },
    constraints: ['b!=drop', 'c!=usedB', 'c!=usedA', 'usedB!=usedA'],
  },
  choices: [
    { label: plain('{{c}}'), correct: true },
    { label: plain('{{signFlipped}}'), error: 'signError' },
    { label: plain('{{usedB}}'), error: 'ratioReversed' },
    { label: plain('{{usedA}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Putting $x = {{s}}$ in gives ${{a}} \\times {{s}} + c = {{b}} \\times {{s}} + {{q}}$.', 'The two $x$ terms differ by ${{drop}} \\times {{s}}$, so $c = {{q}} - {{drop}} \\times {{s}} = {{c}}$.'],
  answerSummary: { headline: 'Substitute the solution and the unknown constant is the only thing left.', text: 'It is ${{c}}$.' },
  hint: 'What do both sides come to at $x = {{s}}$?',
  feedback: 'The gap between the $x$ terms depends on ${{s}}$, not on the coefficients alone.',
});

mk('A.5A', 'bracket-multiplied-into-one-term-only', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'Solving ${{a}}(x + {{p}}) = {{r}}$ a student writes ${{a}}x + {{p}} = {{r}}$. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      p: { type: 'int', min: 2, max: 12 },
      x: { type: 'int', min: 2, max: 15 },
    },
    derived: { r: 'a*(x+p)', ap: 'a*p' },
    constraints: ['a!=p'],
  },
  choices: [
    { label: 'The ${{a}}$ multiplies everything in the bracket, so it should be ${{a}}x + {{ap}} = {{r}}$.', correct: true },
    { label: 'Nothing is wrong, because the bracket has been removed correctly.', error: 'usedGivenValue' },
    { label: 'The ${{p}}$ should have been left inside a bracket of its own.', error: 'partialTotal' },
    { label: 'The ${{a}}$ should multiply the ${{p}}$ only, not the $x$.', error: 'ratioReversed' },
  ],
  reasoning: ['A number outside a bracket multiplies every term inside it.', 'Here that makes the second term ${{a}} \\times {{p}} = {{ap}}$, not ${{p}}$.'],
  answerSummary: { headline: 'Distributing means multiplying every term in the bracket.', text: 'It should be ${{a}}x + {{ap}} = {{r}}$.' },
  hint: 'How many terms are inside the bracket?',
  feedback: 'Only the first term was multiplied; the second was copied across unchanged.',
});

// ================================================================ A.5B
// Solving a linear inequality in one variable. Grades 6 to 8 (6.9A, 6.10A,
// 7.10A, 8.8A) only ever WRITE an inequality from a situation; none of them
// solves one, so the reversal on dividing by a negative appears here for the
// first time and two of the five families turn on it.

mk('A.5B', 'solve-a-two-step-inequality', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Solve ${{a}}x + {{p}} \\le {{q}}$.',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      p: { type: 'int', min: 2, max: 20 },
      s: { type: 'int', min: 2, max: 12 },
    },
    derived: { q: 'a*s+p', noDivide: 'a*s', wrongOrder: 'a*s+p' },
    constraints: ['s!=noDivide'],
  },
  choices: [
    { label: plain('x \\le {{s}}'), correct: true },
    { label: plain('x \\ge {{s}}'), error: 'signError' },
    { label: plain('x \\le {{noDivide}}'), error: 'forgotFinalStep' },
    { label: plain('x \\le {{wrongOrder}}'), error: 'orderOfOperations' },
  ],
  reasoning: ['Taking ${{p}}$ from both sides gives ${{a}}x \\le {{noDivide}}$.', 'Dividing by ${{a}}$, which is positive, keeps the direction: $x \\le {{s}}$.'],
  answerSummary: { headline: 'Dividing by a positive number leaves the direction alone.', text: 'It is $x \\le {{s}}$.' },
  hint: 'What is ${{a}}x$ worth once ${{p}}$ has been taken off?',
  feedback: 'The ${{a}}$ still has to be divided out.',
});

mk('A.5B', 'dividing-an-inequality-by-a-negative', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'Solve $-{{a}}x > {{q}}$.',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      s: { type: 'int', min: 2, max: 12 },
    },
    derived: { q: '0-a*s', negS: '0-s', absQ: 'a*s' },
    constraints: ['s!=absQ', 'a!=s'],
  },
  choices: [
    { label: plain('x < {{s}}'), correct: true },
    { label: plain('x > {{s}}'), error: 'signError' },
    { label: plain('x < {{negS}}'), error: 'operationInverted' },
    { label: plain('x < {{absQ}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['Dividing both sides by $-{{a}}$ gives $x$ against ${{q}} \\div -{{a}} = {{s}}$.', 'Dividing by a negative reverses the direction, so the $>$ becomes $<$.'],
  answerSummary: { headline: 'Dividing by a negative turns the inequality around.', text: 'It is $x < {{s}}$.' },
  hint: 'What does dividing by a negative number do to the direction?',
  feedback: 'Keeping the direction would let values that fail the original through.',
});

mk('A.5B', 'least-whole-number-that-works', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'symbolic',
  prompt: 'What is the least whole number $x$ with ${{a}}x + {{p}} > {{q}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      // p doubles as the crossing choice, so its range matches the answer's.
      p: { type: 'int', min: 3, max: 13 },
      s: { type: 'int', min: 2, max: 12 },
    },
    // The boundary lands exactly on s, so strict inequality makes s + 1 the
    // least whole number that works and s itself the tempting near miss.
    derived: { q: 'a*s+p', answer: 's+1', noDivide: 'a*s' },
    // p stands in for the answer often enough to sit on either side of it;
    // a*s + p was above the key in every draw, which pinned the key's rank.
    constraints: ['answer!=noDivide', 'p!=answer', 'p!=s', 'p!=noDivide', 's!=noDivide'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{s}}'), error: 'offByOneStep' },
    { label: plain('{{noDivide}}'), error: 'forgotFinalStep' },
    { label: plain('{{p}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The inequality rearranges to $x > {{s}}$, and ${{s}}$ itself is not allowed.', 'The least whole number strictly above ${{s}}$ is ${{answer}}$.'],
  answerSummary: { headline: 'A strict inequality excludes its own boundary.', text: 'It is ${{answer}}$.' },
  hint: 'Does $x = {{s}}$ itself satisfy a strict inequality?',
  feedback: 'At that value the two sides are equal, which a $>$ does not allow.',
});

mk('A.5B', 'how-many-days-a-budget-covers', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'context',
  prompt: 'A budget of $\\${{q}}$ must cover a $\\${{p}}$ fee plus $\\${{a}}$ a day. At most how many whole days can be booked?',
  generator: {
    parameters: {
      // a doubles as the crossing choice, so it shares the range of s.
      a: { type: 'int', min: 3, max: 14 },
      p: { type: 'int', min: 10, max: 40 },
      s: { type: 'int', min: 3, max: 14 },
      spare: { type: 'int', min: 1, max: 2 },
    },
    // A little money is left over, so the answer is a whole number of days
    // rather than an exact division that hides the rounding.
    derived: {
      q: 'a*s+p+spare',
      // Ignoring the fee buys too many days; charging the fee every day buys
      // too few. One sits above the answer and one below it.
      ignoredFee: 'floor((a*s+p+spare)/a)',
      feeAsDaily: 'floor((a*s+p+spare)/(a+p))',
    },
    constraints: ['feeAsDaily>=1', 's!=ignoredFee', 's!=a'],
  },
  choices: [
    { label: plain('{{s}}'), correct: true },
    { label: plain('{{ignoredFee}}'), error: 'partialTotal' },
    { label: plain('{{feeAsDaily}}'), error: 'orderOfOperations' },
    { label: plain('{{a}}'), error: 'ratioReversed' },
  ],
  reasoning: ['After the $\\${{p}}$ fee, $\\${{q}} - \\${{p}}$ is left for the daily charge.', 'That covers ${{s}}$ whole days at $\\${{a}}$ each, with a little to spare.'],
  answerSummary: { headline: 'Take the fixed charge off first, then see how many days the rest buys.', text: 'It is ${{s}}$ days.' },
  hint: 'How much is left once the fee is paid?',
  feedback: 'The whole budget cannot go on daily charges while a fee is still owed.',
});

mk('A.5B', 'direction-kept-after-a-negative-divide', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'From $-{{a}}x < {{q}}$ a student writes $x < {{negS}}$. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      s: { type: 'int', min: 2, max: 12 },
    },
    derived: { q: 'a*s', negS: '0-s' },
    constraints: ['a!=s'],
  },
  choices: [
    { label: 'Dividing by $-{{a}}$ reverses the direction, so it should be $x > {{negS}}$.', correct: true },
    { label: 'Nothing is wrong, since both sides were divided by the same number.', error: 'usedGivenValue' },
    { label: 'The direction is right but the value should be ${{s}}$, without the minus.', error: 'signError' },
    { label: 'The whole inequality should become $x > {{q}}$, leaving the ${{a}}$ alone.', error: 'forgotFinalStep' },
  ],
  reasoning: ['Dividing both sides by a negative number swaps which side is larger.', 'The value $-{{s}}$ is right, but the direction must turn with it.'],
  answerSummary: { headline: 'Dividing both sides by the same number is not enough when that number is negative.', text: 'It should be $x > {{negS}}$.' },
  hint: 'Test a value that the student answer allows in the original inequality.',
  feedback: 'Same divisor on both sides is correct; the direction is what was missed.',
});

// ================================================================ A.5C
// Solving a system of two linear equations. A.2I writes systems and 8.9 reads
// a crossing off two graphed lines; this standard does the algebra, so every
// family here either carries out an elimination or a substitution, or reasons
// about the step that makes one possible.

mk('A.5C', 'elimination-when-a-coefficient-matches', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Solve ${{a}}x + {{b}}y = {{c1}}$ and ${{a}}x - {{b}}y = {{c2}}$.',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 8 },
      b: { type: 'int', min: 2, max: 8 },
      x: { type: 'int', min: 2, max: 9 },
      y: { type: 'int', min: 2, max: 9 },
    },
    derived: { c1: 'a*x+b*y', c2: 'a*x-b*y', sum: 'x+y' },
    constraints: ['x!=y', 'a!=b', 'sum!=x', 'sum!=y'],
  },
  choices: [
    { label: plain('({{x}}, {{y}})'), correct: true },
    { label: plain('({{y}}, {{x}})'), error: 'ratioReversed' },
    { label: plain('({{x}}, {{sum}})'), error: 'partialTotal' },
    { label: plain('({{sum}}, {{y}})'), error: 'forgotFinalStep' },
  ],
  reasoning: ['Adding the two equations cancels the $y$ terms and leaves $2 \\times {{a}}x = {{c1}} + {{c2}}$, so $x = {{x}}$.', 'Substituting back gives $y = {{y}}$.'],
  answerSummary: { headline: 'Add the equations when one variable already carries opposite signs.', text: 'It is $({{x}}, {{y}})$.' },
  hint: 'What happens to the $y$ terms if the two equations are added?',
  feedback: 'Check which coordinate is $x$ and which is $y$ before choosing.',
});

mk('A.5C', 'what-to-multiply-to-eliminate', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'To eliminate $x$ from ${{a}}x + {{b}}y = {{c1}}$ and ${{a2}}x + {{d}}y = {{c2}}$, what should the first be multiplied by?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 6 },
      k: { type: 'int', min: 2, max: 6 },
      b: { type: 'int', min: 2, max: 9 },
      d: { type: 'int', min: 2, max: 9 },
      c1: { type: 'int', min: 10, max: 60 },
      c2: { type: 'int', min: 10, max: 60 },
    },
    // Two of the three distractors are negative as well. When the key was the
    // only negative choice it was the smallest of the four in every draw, and
    // no scaling of the ranges could have changed that.
    derived: { a2: 'a*k', negK: '0-k', negA: '0-a', negA2: '0-a*k' },
    constraints: ['b!=d', 'k!=a', 'k!=b', 'k!=d'],
  },
  choices: [
    { label: plain('-{{k}}'), correct: true },
    { label: plain('{{k}}'), error: 'signError' },
    { label: plain('{{negA}}'), error: 'usedGivenValue' },
    { label: plain('{{negA2}}'), error: 'operationInverted' },
  ],
  reasoning: ['The second equation already holds ${{a2}}x$, which is ${{k}}$ times the ${{a}}x$ in the first equation.', 'Multiplying the first by $-{{k}}$ makes the two $x$ terms cancel when the equations are added.'],
  answerSummary: { headline: 'Match the coefficient, then flip its sign so the terms cancel.', text: 'Multiply by $-{{k}}$.' },
  hint: 'How many times does the first $x$ coefficient go into the second?',
  feedback: 'That is a coefficient copied from the equations, not the factor between them.',
});

mk('A.5C', 'how-many-of-the-cheaper-ticket', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'context',
  prompt: 'A group bought ${{n}}$ tickets for $\\${{t}}$ in all, at $\\${{a}}$ and $\\${{b}}$ each. How many of the $\\${{b}}$ tickets were bought?',
  generator: {
    parameters: {
      a: { type: 'int', min: 6, max: 15 },
      gap: { type: 'int', min: 2, max: 6 },
      x: { type: 'int', min: 2, max: 12 },
      y: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      b: 'a-gap',
      n: 'x+y',
      t: 'a*x+(a-gap)*y',
      other: 'x',
      total: 'x+y',
    },
    constraints: ['b>=2', 'x!=y', 'y!=total', 'x!=total', 'y!=gap', 'x!=gap'],
  },
  choices: [
    { label: plain('{{y}}'), correct: true },
    { label: plain('{{other}}'), error: 'ratioReversed' },
    { label: plain('{{total}}'), error: 'partialTotal' },
    { label: plain('{{gap}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['If every ticket cost $\\${{a}}$ the total would be $\\${{a}} \\times {{n}}$, which overshoots the $\\${{t}}$ paid.', 'Each cheaper ticket saves $\\${{gap}}$, and the overshoot divides by ${{gap}}$ to give ${{y}}$ of them.'],
  answerSummary: { headline: 'Price everything at one rate, then divide the overshoot by the difference.', text: 'There were ${{y}}$ of them.' },
  hint: 'What would the whole group cost at the dearer price?',
  feedback: 'That is how many of the other kind were bought.',
});

mk('A.5C', 'the-equation-substitution-leaves', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'Substituting $y = {{m}}x + {{p}}$ into ${{a}}x + {{b}}y = {{c}}$ leaves which equation in $x$ alone?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 9 },
      m: { type: 'int', min: 2, max: 6 },
      p: { type: 'int', min: 2, max: 12 },
      c: { type: 'int', min: 20, max: 90 },
    },
    derived: { bm: 'b*m', bp: 'b*p', abm: 'a+b*m', noB: 'a+m' },
    constraints: ['a!=b', 'abm!=noB'],
  },
  choices: [
    { label: plain('{{abm}}x + {{bp}} = {{c}}'), correct: true },
    { label: plain('{{noB}}x + {{p}} = {{c}}'), error: 'partialTotal' },
    { label: plain('{{abm}}x + {{p}} = {{c}}'), error: 'forgotFinalStep' },
    { label: plain('{{a}}x + {{bm}}x + {{bp}} = {{bp}}'), error: 'operationInverted' },
  ],
  reasoning: ['The ${{b}}y$ term becomes ${{b}}({{m}}x + {{p}}) = {{bm}}x + {{bp}}$.', 'Collecting the $x$ terms gives ${{abm}}x + {{bp}} = {{c}}$.'],
  answerSummary: { headline: 'The coefficient outside multiplies both parts of what is substituted in.', text: 'It is ${{abm}}x + {{bp}} = {{c}}$.' },
  hint: 'What does ${{b}}$ multiply once $y$ is replaced?',
  feedback: 'The ${{p}}$ is inside the bracket too, so it is multiplied by ${{b}}$ as well.',
});

mk('A.5C', 'equations-added-without-matching-first', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'To eliminate $x$ from ${{a}}x + {{b}}y = {{c1}}$ and ${{a2}}x - {{d}}y = {{c2}}$, a student adds them as they stand. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 6 },
      k: { type: 'int', min: 2, max: 5 },
      b: { type: 'int', min: 2, max: 9 },
      d: { type: 'int', min: 2, max: 9 },
      c1: { type: 'int', min: 10, max: 60 },
      c2: { type: 'int', min: 10, max: 60 },
    },
    derived: { a2: 'a*k', left: 'a+a*k' },
    constraints: ['b!=d', 'k!=a'],
  },
  choices: [
    { label: 'The $x$ coefficients are not opposite, so adding leaves ${{left}}x$ rather than nothing.', correct: true },
    { label: 'Nothing is wrong, because adding two true equations gives a true equation.', error: 'usedGivenValue' },
    { label: 'The equations should be subtracted, which would cancel the $y$ terms instead.', error: 'operationInverted' },
    { label: 'The two constants ${{c1}}$ and ${{c2}}$ must match before anything can be added.', error: 'partialTotal' },
  ],
  reasoning: ['Elimination needs the two coefficients of the chosen variable to be opposites.', 'Here they are ${{a}}$ and ${{a2}}$, so one equation must be scaled first.'],
  answerSummary: { headline: 'Coefficients have to be made opposite before the equations are added.', text: 'Adding as they stand leaves ${{left}}x$.' },
  hint: 'What do the two $x$ terms come to when added?',
  feedback: 'The result is still true; it just has not eliminated anything.',
});

// ================================================================ A.6A
// Domain and range of a quadratic. The crosswalk allows only stating the
// domain, and stating the range once a minimum or maximum is known; it
// excludes inequality-notation emphasis and contextual reasonable-range
// reasoning. Nothing here asks a student to choose between notations, and no
// family asks what domain a situation would sensibly allow.

mk('A.6A', 'domain-of-a-quadratic-rule', {
  courseId: 'algebra1',
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'What is the domain of $f(x) = {{a}}x^2 + {{b}}x + {{c}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 12 },
      c: { type: 'int', min: 2, max: 20 },
    },
    derived: {},
    constraints: ['a!=b', 'b!=c'],
  },
  choices: [
    { label: 'Every real number, since any value of $x$ can be squared and combined.', correct: true },
    { label: 'Only the numbers from ${{c}}$ upwards, where the rule starts.', error: 'usedGivenValue' },
    { label: 'Only numbers that are not negative, because of the square.', error: 'signError' },
    { label: 'Only whole numbers, since the coefficients are whole numbers.', error: 'partialTotal' },
  ],
  reasoning: ['Squaring, multiplying and adding can be carried out on any real number.', 'Nothing in the rule divides or takes a root, so nothing has to be ruled out.'],
  answerSummary: { headline: 'A quadratic accepts every real input; only its outputs are limited.', text: 'The domain is every real number.' },
  hint: 'Is there any value of $x$ this rule cannot be worked out for?',
  feedback: 'Squaring a negative number is allowed, and it produces a positive result.',
});

mk('A.6A', 'range-above-a-known-minimum', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'A quadratic opens upwards and its least value is ${{k}}$. What is its range?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 30 },
      other: { type: 'int', min: 2, max: 30 },
    },
    derived: { negK: '0-k' },
    constraints: ['k!=other'],
  },
  choices: [
    { label: 'Every number from ${{k}}$ upwards.', correct: true },
    { label: 'Every number up to ${{k}}$.', error: 'operationInverted' },
    { label: 'Every real number, as it is for the inputs.', error: 'ratioReversed' },
    { label: 'Every number from ${{negK}}$ upwards.', error: 'signError' },
  ],
  reasoning: ['Opening upwards means the curve turns at its lowest point and rises on both sides.', 'It therefore reaches ${{k}}$ and everything above it, and nothing below.'],
  answerSummary: { headline: 'An upward parabola starts at its minimum and climbs without limit.', text: 'Every number from ${{k}}$ upwards.' },
  hint: 'Which way does the curve go on either side of its lowest point?',
  feedback: 'That range belongs to a parabola opening downwards from a maximum.',
});

mk('A.6A', 'range-below-a-known-maximum', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'verbal',
  // The maximum is named through the turning point rather than stated outright,
  // so this is not the upward family with one word changed.
  prompt: 'A downward parabola turns at $({{h}}, {{k}})$. What is its range?',
  generator: {
    parameters: {
      h: { type: 'int', min: 2, max: 20 },
      k: { type: 'int', min: 2, max: 30 },
    },
    derived: {},
    constraints: ['h!=k'],
  },
  choices: [
    { label: 'Every number up to ${{k}}$.', correct: true },
    { label: 'Every number up to ${{h}}$.', error: 'ratioReversed' },
    { label: 'Every number from ${{k}}$ upwards.', error: 'operationInverted' },
    { label: 'Every number between ${{h}}$ and ${{k}}$.', error: 'partialTotal' },
  ],
  reasoning: ['The turning point of a downward parabola is its highest point, at height ${{k}}$.', 'The curve falls away on both sides, so it takes ${{k}}$ and everything below.'],
  answerSummary: { headline: 'The second coordinate of the turning point is the limit on the outputs.', text: 'Every number up to ${{k}}$.' },
  hint: 'Which coordinate of the turning point is an output of the function?',
  feedback: 'The first coordinate is an input, so it limits nothing about the range.',
});

mk('A.6A', 'how-often-a-value-is-reached', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'table',
  // Asking which value is never reached made the key the smallest of the four
  // in every draw: for an upward parabola the unreachable values are exactly
  // the small ones, so no choice of ranges could have fixed it. Counting how
  // often a value is reached tests the same understanding of the range without
  // encoding the answer in its size.
  prompt: 'The table gives an upward parabola. How many times does it take the value ${{v}}$?',
  stimulus: {
    kind: 'table',
    title: 'Recorded values',
    table: { headers: ['x', 'y'], rows: [['{{x1}}', '{{y1}}'], ['{{x2}}', '{{y2}}'], ['{{h}}', '{{k}}'], ['{{x4}}', '{{y2}}'], ['{{x5}}', '{{y1}}']] },
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 1, max: 4 },
      h: { type: 'int', min: 3, max: 12 },
      k: { type: 'int', min: 10, max: 40 },
      above: { type: 'int', min: 2, max: 30 },
    },
    derived: {
      x1: 'h-2', x2: 'h-1', x4: 'h+1', x5: 'h+2',
      y1: 'k+4*a', y2: 'k+a',
      v: 'k+above',
    },
    constraints: ['x1>=1', 'v!=k', 'h!=k'],
  },
  choices: [
    { label: 'Twice, once on each side of the turning point.', correct: true },
    { label: 'Once, since a parabola reaches each of its values one time.', error: 'partialTotal' },
    { label: 'Never, because the table does not list it.', error: 'usedGivenValue' },
    { label: 'Once, at the turning point, where the curve is lowest.', error: 'operationInverted' },
  ],
  reasoning: ['The least value is ${{k}}$, and ${{v}}$ is above it, so the curve does reach it.', 'An upward parabola climbs on both sides of its turning point, so it passes ${{v}}$ twice.'],
  answerSummary: { headline: 'Every value above the minimum is reached twice; the minimum itself, once.', text: 'Twice.' },
  hint: 'How many times does the curve pass a height above its lowest point?',
  feedback: 'A table shows a handful of points, not every value the curve takes.',
});

mk('A.6A', 'domain-given-in-place-of-the-range', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'For an upward parabola with least value ${{k}}$ a student gives the range as every real number. What is wrong?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 30 },
      h: { type: 'int', min: 2, max: 20 },
    },
    derived: {},
    constraints: ['h!=k'],
  },
  choices: [
    { label: 'That is the domain: the outputs stop at ${{k}}$ and go no lower.', correct: true },
    { label: 'Nothing is wrong, because the curve carries on forever in both directions.', error: 'usedGivenValue' },
    { label: 'The range is every real number, but only once the curve is shifted.', error: 'partialTotal' },
    { label: 'The range should be every number up to ${{k}}$ instead.', error: 'operationInverted' },
  ],
  reasoning: ['Any $x$ may be put in, which is what makes the domain every real number.', 'The outputs are held above ${{k}}$ by the turning point, so the range is not.'],
  answerSummary: { headline: 'A quadratic takes every input but not every output.', text: 'The range is every number from ${{k}}$ upwards.' },
  hint: 'Which of the two, inputs or outputs, does the turning point limit?',
  feedback: 'Carrying on forever sideways does not mean carrying on forever downwards.',
});

// ================================================================ A.7A
// Key attributes of a quadratic. The crosswalk allows zeros, intercepts, the
// vertex, the axis of symmetry and basic graph properties, and excludes
// transformation analysis and parameter-effect comparison. No family here asks
// what happens to the graph when a coefficient is changed. Zeros from factors
// are left to A.7B, which is the standard about exactly that.

mk('A.7A', 'axis-of-symmetry-from-standard-form', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'What is the axis of symmetry of $y = {{a}}x^2 + {{b}}x + {{c}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 6 },
      h: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 2, max: 20 },
    },
    derived: { b: '0-2*a*h', absB: '2*a*h', negH: '0-h', twoA: '2*a' },
    constraints: ['h!=c', 'h!=a', 'h!=absB', 'absB!=c'],
  },
  choices: [
    { label: plain('x = {{h}}'), correct: true },
    { label: plain('x = {{negH}}'), error: 'signError' },
    { label: plain('x = {{absB}}'), error: 'forgotFinalStep' },
    { label: plain('x = {{c}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The axis sits at $x = -b \\div 2a$, with $b = {{b}}$ and $a = {{a}}$.', 'That gives $x = {{absB}} \\div {{twoA}} = {{h}}$.'],
  answerSummary: { headline: 'The axis is fixed by the first two coefficients, not the constant.', text: 'It is $x = {{h}}$.' },
  hint: 'Which two coefficients decide where the curve turns?',
  feedback: 'The $2a$ underneath still has to be divided out.',
});

mk('A.7A', 'where-a-parabola-meets-the-vertical-axis', {
  courseId: 'algebra1',
  difficultyBand: 1, dok: 1, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'Where does $y = {{a}}x^2 + {{b}}x + {{c}}$ cross the vertical axis?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 14 },
      c: { type: 'int', min: 2, max: 25 },
    },
    derived: { sum: 'a+b+c' },
    constraints: ['a!=b', 'b!=c', 'a!=c', 'sum!=c'],
  },
  choices: [
    { label: plain('(0, {{c}})'), correct: true },
    { label: plain('({{c}}, 0)'), error: 'ratioReversed' },
    { label: plain('(0, {{a}})'), error: 'usedGivenValue' },
    { label: plain('(0, {{sum}})'), error: 'partialTotal' },
  ],
  reasoning: ['On the vertical axis $x = 0$, which removes both the $x^2$ and the $x$ term.', 'What is left is $y = {{c}}$.'],
  answerSummary: { headline: 'Put zero in for $x$ and only the constant survives.', text: 'It crosses at $(0, {{c}})$.' },
  hint: 'What is $x$ everywhere along the vertical axis?',
  feedback: 'Adding the coefficients gives the value at $x = 1$, not at $x = 0$.',
});

mk('A.7A', 'vertex-from-the-axis-of-symmetry', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'symbolic',
  prompt: 'What is the vertex of $y = {{a}}(x - {{h}})^2 + {{k}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 6 },
      h: { type: 'int', min: 2, max: 12 },
      k: { type: 'int', min: 2, max: 20 },
    },
    derived: { negH: '0-h', negK: '0-k' },
    constraints: ['h!=k', 'a!=h', 'a!=k'],
  },
  choices: [
    { label: plain('({{h}}, {{k}})'), correct: true },
    { label: plain('({{negH}}, {{k}})'), error: 'signError' },
    { label: plain('({{k}}, {{h}})'), error: 'ratioReversed' },
    { label: plain('({{h}}, {{negK}})'), error: 'operationInverted' },
  ],
  reasoning: ['The bracket is zero when $x = {{h}}$, which is where the curve turns.', 'At that point the ${{a}}(x - {{h}})^2$ term contributes nothing and $y = {{k}}$.'],
  answerSummary: { headline: 'The turning point is where the squared bracket collapses to zero.', text: 'It is $({{h}}, {{k}})$.' },
  hint: 'What value of $x$ makes the bracket zero?',
  feedback: 'A minus inside the bracket means the curve turns at a positive value of $x$.',
});

mk('A.7A', 'vertex-read-from-symmetric-values', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'table',
  // The table is symmetric about the turning point, so the vertex is found by
  // spotting the repeat rather than by substituting into a formula.
  prompt: 'The table gives a quadratic. Where is its turning point?',
  stimulus: {
    kind: 'table',
    title: 'Recorded values',
    table: { headers: ['x', 'y'], rows: [['{{x1}}', '{{y1}}'], ['{{x2}}', '{{y2}}'], ['{{h}}', '{{k}}'], ['{{x4}}', '{{y2}}'], ['{{x5}}', '{{y1}}']] },
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 1, max: 4 },
      h: { type: 'int', min: 3, max: 12 },
      k: { type: 'int', min: 2, max: 15 },
    },
    derived: {
      x1: 'h-2', x2: 'h-1', x4: 'h+1', x5: 'h+2',
      y1: 'k+4*a', y2: 'k+a',
    },
    constraints: ['h!=k', 'x1>=1', 'h!=y1', 'h!=y2', 'k!=y2'],
  },
  choices: [
    { label: plain('({{h}}, {{k}})'), correct: true },
    { label: plain('({{k}}, {{h}})'), error: 'ratioReversed' },
    { label: plain('({{x1}}, {{y1}})'), error: 'usedGivenValue' },
    { label: plain('({{h}}, {{y2}})'), error: 'offByOneStep' },
  ],
  reasoning: ['The outputs repeat either side of $x = {{h}}$, so the curve is symmetric about it.', 'The turning point is the row at that centre, $({{h}}, {{k}})$.'],
  answerSummary: { headline: 'Matching outputs either side of a row put the turning point on that row.', text: 'It is $({{h}}, {{k}})$.' },
  hint: 'Which row has the same output on both sides of it?',
  feedback: 'That row is one step from the centre, so it is not the turning point.',
});

mk('A.7A', 'axis-taken-without-dividing', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'For $y = {{a}}x^2 - {{absB}}x + {{c}}$ a student gives the axis of symmetry as $x = {{absB}}$. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 6 },
      h: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 2, max: 20 },
    },
    derived: { absB: '2*a*h', twoA: '2*a' },
    constraints: ['h!=c', 'h!=absB', 'h!=twoA'],
  },
  choices: [
    { label: 'The $-b$ still has to be divided by $2a$, which is ${{twoA}}$, giving $x = {{h}}$.', correct: true },
    { label: 'Nothing is wrong, since ${{absB}}$ is the number attached to $x$.', error: 'usedGivenValue' },
    { label: 'The sign is the only mistake: it should be $x = -{{absB}}$.', error: 'signError' },
    { label: 'The axis should be $x = {{c}}$, taken from the constant.', error: 'partialTotal' },
  ],
  reasoning: ['The axis is at $-b \\div 2a$, and only the first half of that has been done.', 'Dividing ${{absB}}$ by ${{twoA}}$ gives ${{h}}$.'],
  answerSummary: { headline: 'Changing the sign of $b$ is half the formula; the division is the other half.', text: 'The axis is $x = {{h}}$.' },
  hint: 'What is still sitting underneath $-b$?',
  feedback: 'The sign was already handled correctly; the division was not.',
});

// ================================================================ A.7B
// The link between the linear factors of a quadratic and its zeros. A.7A takes
// the vertex, the axis and the intercepts; this standard is only about factors
// and zeros, in both directions.

mk('A.7B', 'zeros-from-factored-form', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'What are the zeros of $y = (x - {{r}})(x - {{s}})$?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 12 },
      gap: { type: 'int', min: 1, max: 8 },
    },
    derived: { s: 'r+gap', negR: '0-r', negS: '0-s', sum: 'r+r+gap' },
    constraints: ['sum!=r', 'sum!=s'],
  },
  choices: [
    { label: plain('{{r}} \\text{ and } {{s}}'), correct: true },
    { label: plain('{{negR}} \\text{ and } {{negS}}'), error: 'signError' },
    { label: plain('{{r}} \\text{ and } {{negS}}'), error: 'partialTotal' },
    { label: plain('{{sum}} \\text{ and } {{gap}}'), error: 'operationInverted' },
  ],
  reasoning: ['A product is zero when one of its factors is zero.', 'That happens at $x = {{r}}$ and at $x = {{s}}$, the values that empty each bracket.'],
  answerSummary: { headline: 'A zero is the value that empties a bracket, so the sign inside is reversed.', text: 'They are ${{r}}$ and ${{s}}$.' },
  hint: 'What value of $x$ makes the first bracket zero?',
  feedback: 'A minus inside the bracket gives a positive zero, not a negative one.',
});

mk('A.7B', 'factors-from-the-zeros', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: 'A quadratic has zeros ${{r}}$ and $-{{s}}$. Which pair of factors does it have?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 12 },
      s: { type: 'int', min: 2, max: 12 },
    },
    derived: {},
    constraints: ['r!=s'],
  },
  choices: [
    { label: plain('(x - {{r}})(x + {{s}})'), correct: true },
    { label: plain('(x + {{r}})(x - {{s}})'), error: 'signError' },
    { label: plain('(x - {{r}})(x - {{s}})'), error: 'partialTotal' },
    { label: plain('(x + {{r}})(x + {{s}})'), error: 'operationInverted' },
  ],
  reasoning: ['A zero at ${{r}}$ needs a bracket that empties there, which is $(x - {{r}})$.', 'A zero at $-{{s}}$ needs $(x + {{s}})$, since that empties when $x$ is $-{{s}}$.'],
  answerSummary: { headline: 'Each bracket carries the opposite sign to the zero it produces.', text: 'It is $(x - {{r}})(x + {{s}})$.' },
  hint: 'What must go in the bracket so that it is zero at $-{{s}}$?',
  feedback: 'Both signs have been flipped, which moves both zeros to the other side of nothing.',
});

mk('A.7B', 'a-factor-that-appears-twice', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'How many different zeros does $y = (x - {{r}})^2$ have?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 14 },
    },
    derived: { negR: '0-r' },
    constraints: [],
  },
  choices: [
    { label: 'One, at $x = {{r}}$, because both factors empty at the same value.', correct: true },
    { label: 'Two, at $x = {{r}}$ and $x = {{negR}}$, one for each factor.', error: 'signError' },
    { label: 'Two, both at $x = {{r}}$, since the bracket is written twice.', error: 'partialTotal' },
    { label: 'None, because a squared bracket can never be zero.', error: 'operationInverted' },
  ],
  reasoning: ['The square is two copies of the same factor, and both empty at $x = {{r}}$.', 'The curve therefore touches the axis at one place instead of crossing it at two.'],
  answerSummary: { headline: 'A repeated factor gives one zero, not two.', text: 'One, at $x = {{r}}$.' },
  hint: 'What does the second copy of the bracket empty at?',
  feedback: 'Counting the brackets is not the same as counting the different values they empty at.',
});

mk('A.7B', 'which-rule-has-these-zeros', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'context',
  prompt: 'A projectile is at ground level after ${{r}}$ and ${{s}}$ seconds. Which rule gives its height?',
  generator: {
    parameters: {
      r: { type: 'int', min: 1, max: 5 },
      gap: { type: 'int', min: 2, max: 8 },
      a: { type: 'int', min: 2, max: 6 },
    },
    derived: { s: 'r+gap', negR: '0-r', negS: '0-s' },
    constraints: ['a!=r', 'a!=s'],
  },
  choices: [
    { label: plain('h = -{{a}}(t - {{r}})(t - {{s}})'), correct: true },
    { label: plain('h = -{{a}}(t + {{r}})(t + {{s}})'), error: 'signError' },
    { label: plain('h = -{{a}}(t - {{r}})(t + {{s}})'), error: 'partialTotal' },
    { label: plain('h = -{{a}}t(t - {{gap}})'), error: 'operationInverted' },
  ],
  reasoning: ['Ground level means a height of zero, so ${{r}}$ and ${{s}}$ are the zeros of the rule.', 'Brackets that empty at those two times are $(t - {{r}})$ and $(t - {{s}})$.'],
  answerSummary: { headline: 'Where a height is zero, the rule has a factor that empties.', text: 'It is $h = -{{a}}(t - {{r}})(t - {{s}})$.' },
  hint: 'What is the height at each of the two named times?',
  feedback: 'That rule is at ground level at $0$ and ${{gap}}$ seconds, not at the two times given.',
});

mk('A.7B', 'zeros-read-straight-out-of-the-brackets', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'For $y = (x - {{r}})(x + {{s}})$ a student gives the zeros as $-{{r}}$ and ${{s}}$. What is wrong?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 12 },
      s: { type: 'int', min: 2, max: 12 },
    },
    derived: { negS: '0-s' },
    constraints: ['r!=s'],
  },
  choices: [
    { label: 'Both signs are the wrong way round: the zeros are ${{r}}$ and ${{negS}}$.', correct: true },
    { label: 'Nothing is wrong, since those are the numbers written in the brackets.', error: 'usedGivenValue' },
    { label: 'Only the first is wrong; the second bracket does give a zero at ${{s}}$.', error: 'partialTotal' },
    { label: 'The zeros should be ${{r}}$ and ${{s}}$, with no minus signs at all.', error: 'operationInverted' },
  ],
  reasoning: ['A bracket is zero at the value that cancels what is inside it, not at the number shown.', 'So $(x - {{r}})$ gives ${{r}}$ and $(x + {{s}})$ gives $-{{s}}$.'],
  answerSummary: { headline: 'Each zero is the opposite of the number written in its bracket.', text: 'They are ${{r}}$ and ${{negS}}$.' },
  hint: 'Put ${{r}}$ into the first bracket and see what it comes to.',
  feedback: 'Copying the numbers out reverses both zeros, not just one.',
});

// ================================================================ A.8A
// Solving a quadratic with real solutions. A.7B reads zeros off factors that
// are already there; here the student produces the solutions, by four routes:
// square roots, factoring, the formula, and completing the square.

mk('A.8A', 'solve-by-taking-square-roots', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Solve $x^2 = {{sq}}$.',
  generator: {
    parameters: { m: { type: 'int', min: 3, max: 15 } },
    derived: { sq: 'm*m', half: 'm*m/2', double: '2*m' },
    constraints: ['m!=double'],
  },
  choices: [
    { label: plain('\\pm {{m}}'), correct: true },
    { label: plain('{{m}}'), error: 'partialTotal' },
    { label: plain('\\pm {{sq}}'), error: 'forgotFinalStep' },
    { label: plain('\\pm {{double}}'), error: 'operationInverted' },
  ],
  reasoning: ['Both ${{m}}$ and $-{{m}}$ square to ${{sq}}$.', 'A squared unknown therefore has two solutions, not one.'],
  answerSummary: { headline: 'Taking a square root of both sides admits a negative solution as well.', text: 'It is $\\pm {{m}}$.' },
  hint: 'Is there a negative number that also squares to ${{sq}}$?',
  feedback: 'That is one of the two solutions, but not both of them.',
});

mk('A.8A', 'solve-by-factoring', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Solve $x^2 - {{sum}}x + {{product}} = 0$.',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 9 },
      gap: { type: 'int', min: 1, max: 7 },
    },
    derived: {
      s: 'r+gap',
      sum: 'r+r+gap',
      product: 'r*(r+gap)',
      negR: '0-r', negS: '0-(r+gap)',
    },
    constraints: ['sum!=product'],
  },
  choices: [
    { label: plain('{{r}} \\text{ and } {{s}}'), correct: true },
    { label: plain('{{negR}} \\text{ and } {{negS}}'), error: 'signError' },
    { label: plain('{{sum}} \\text{ and } {{product}}'), error: 'usedGivenValue' },
    { label: plain('{{r}} \\text{ and } {{negS}}'), error: 'partialTotal' },
  ],
  reasoning: ['Two numbers multiplying to ${{product}}$ and adding to ${{sum}}$ are ${{r}}$ and ${{s}}$.', 'The equation factors as $(x - {{r}})(x - {{s}}) = 0$.'],
  answerSummary: { headline: 'Find the pair that multiplies to the constant and adds to the middle coefficient.', text: 'They are ${{r}}$ and ${{s}}$.' },
  hint: 'Which two numbers multiply to ${{product}}$?',
  feedback: 'Both signs are negative there, which would make the middle term positive.',
});

mk('A.8A', 'when-a-projectile-lands', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'context',
  prompt: 'A stone thrown from ground level has height $h = {{v}}t - {{a}}t^2$ metres. After how many seconds does it land?',
  generator: {
    parameters: {
      // a shares t's range so it falls on either side of the key evenly, and
      // the flight time is drawn even so the highest point lands on a whole
      // second. That time is a real and tempting wrong answer, and it is
      // always below the key, which keeps the key off the bottom.
      a: { type: 'int', min: 2, max: 10 },
      u: { type: 'int', min: 1, max: 5 },
    },
    derived: { t: '2*u', v: 'a*2*u', highest: 'u' },
    constraints: ['t!=a', 't!=v', 'highest!=a'],
  },
  choices: [
    { label: plain('{{t}}'), correct: true },
    { label: plain('{{v}}'), error: 'usedGivenValue' },
    { label: plain('{{highest}}'), error: 'partialTotal' },
    { label: plain('{{a}}'), error: 'operationInverted' },
  ],
  reasoning: ['Landing means $h = 0$, so $t({{v}} - {{a}}t) = 0$.', 'The stone is at ground level at $t = 0$ and again at $t = {{v}} \\div {{a}} = {{t}}$.'],
  answerSummary: { headline: 'Factor out the common $t$; the second bracket gives the landing time.', text: 'After ${{t}}$ seconds.' },
  hint: 'What is common to both terms of the height rule?',
  feedback: 'That is when the stone is highest, which is halfway through the flight.',
});

mk('A.8A', 'completing-the-square', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'Which is $x^2 + {{b}}x + {{c}}$ written as a completed square?',
  generator: {
    parameters: {
      h: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 2, max: 25 },
    },
    derived: { b: '2*h', hsq: 'h*h', k: 'c-h*h', wrongK: 'c-2*h' },
    constraints: ['c!=hsq', 'k!=wrongK', 'h!=c'],
  },
  choices: [
    { label: plain('(x + {{h}})^2 + {{k}}'), correct: true },
    { label: plain('(x + {{b}})^2 + {{k}}'), error: 'forgotFinalStep' },
    { label: plain('(x + {{h}})^2 + {{c}}'), error: 'partialTotal' },
    { label: plain('(x + {{h}})^2 + {{wrongK}}'), error: 'operationInverted' },
  ],
  reasoning: ['Half of ${{b}}$ is ${{h}}$, and $(x + {{h}})^2$ expands to $x^2 + {{b}}x + {{hsq}}$.', 'That is ${{hsq}}$ too much, so ${{c}} - {{hsq}} = {{k}}$ is left over.'],
  answerSummary: { headline: 'Halve the middle coefficient, then take back the square of what you halved.', text: 'It is $(x + {{h}})^2 + {{k}}$.' },
  hint: 'What does $(x + {{h}})^2$ come to when it is expanded?',
  feedback: 'The constant cannot be carried across unchanged; the square has added ${{hsq}}$ of its own.',
});

mk('A.8A', 'only-the-positive-root-given', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'Solving $x^2 = {{sq}}$ a student answers ${{m}}$ only. What is wrong?',
  generator: {
    parameters: { m: { type: 'int', min: 3, max: 15 } },
    derived: { sq: 'm*m', negM: '0-m' },
    constraints: [],
  },
  choices: [
    { label: 'Squaring $-{{m}}$ also gives ${{sq}}$, so ${{negM}}$ is a solution too.', correct: true },
    { label: 'Nothing is wrong, because a square root is never negative.', error: 'usedGivenValue' },
    { label: 'The answer should be ${{negM}}$ instead, since squaring reverses the sign.', error: 'signError' },
    { label: 'The equation has no solution, because ${{sq}}$ is not itself a square.', error: 'operationInverted' },
  ],
  reasoning: ['The square of a negative number is positive, so two values square to ${{sq}}$.', 'An equation with $x^2$ in it therefore usually has two solutions.'],
  answerSummary: { headline: 'The square root symbol is never negative, but a squared unknown has two solutions.', text: 'The solutions are ${{m}}$ and ${{negM}}$.' },
  hint: 'What does $-{{m}}$ come to when it is squared?',
  feedback: 'That is true of the root symbol, but not of an equation with $x^2$ in it.',
});

// ================================================================ A.10A
// Adding and subtracting polynomials. The whole standard is collecting like
// terms, so the five differ by what makes that hard: a subtraction whose sign
// has to be carried across a bracket, a sum read off a shape, and working
// backwards from a known total.

mk('A.10A', 'add-two-quadratics', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Add $({{a}}x^2 + {{b}}x + {{c}})$ and $({{d}}x^2 + {{e}}x + {{f}})$.',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 }, b: { type: 'int', min: 2, max: 9 }, c: { type: 'int', min: 2, max: 9 },
      d: { type: 'int', min: 2, max: 9 }, e: { type: 'int', min: 2, max: 9 }, f: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      sa: 'a+d', sb: 'b+e', sc: 'c+f',
      da: 'a-d', db: 'b-e', dc: 'c-f',
      whole: 'a+b+c+d+e+f',
    },
    constraints: ['a!=d', 'b!=e', 'c!=f', 'da>=1', 'db>=1', 'dc>=1'],
  },
  choices: [
    { label: plain('{{sa}}x^2 + {{sb}}x + {{sc}}'), correct: true },
    { label: plain('{{da}}x^2 + {{db}}x + {{dc}}'), error: 'signError' },
    { label: plain('{{sa}}x^4 + {{sb}}x^2 + {{sc}}'), error: 'exponentError' },
    { label: plain('{{whole}}x^2'), error: 'operationInverted' },
  ],
  reasoning: ['Only terms carrying the same power of $x$ may be combined.', 'That gives ${{sa}}x^2$, ${{sb}}x$ and ${{sc}}$ separately.'],
  answerSummary: { headline: 'Collect each power on its own; the powers themselves do not change.', text: 'It is ${{sa}}x^2 + {{sb}}x + {{sc}}$.' },
  hint: 'Which terms are allowed to be added together?',
  feedback: 'Adding coefficients does not add the powers they sit on.',
});

mk('A.10A', 'subtract-a-quadratic', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Subtract $({{d}}x^2 + {{e}}x + {{f}})$ from $({{a}}x^2 + {{b}}x + {{c}})$.',
  generator: {
    parameters: {
      d: { type: 'int', min: 2, max: 8 }, e: { type: 'int', min: 2, max: 8 }, f: { type: 'int', min: 2, max: 8 },
      ga: { type: 'int', min: 1, max: 6 }, gb: { type: 'int', min: 1, max: 6 }, gc: { type: 'int', min: 1, max: 6 },
    },
    derived: {
      a: 'd+ga', b: 'e+gb', c: 'f+gc',
      sa: 'd+ga+d', sb: 'e+gb+e', sc: 'f+gc+f',
      // The sign carried across the bracket for the first term only.
      ha: 'ga', hb: 'e+gb+e', hc: 'f+gc+f',
      ra: '0-ga', rb: '0-gb', rc: '0-gc',
    },
    constraints: ['ga!=gb', 'gb!=gc'],
  },
  choices: [
    { label: plain('{{ga}}x^2 + {{gb}}x + {{gc}}'), correct: true },
    { label: plain('{{sa}}x^2 + {{sb}}x + {{sc}}'), error: 'signError' },
    { label: plain('{{ha}}x^2 + {{hb}}x + {{hc}}'), error: 'partialTotal' },
    { label: plain('{{ra}}x^2 + {{rb}}x + {{rc}}'), error: 'ratioReversed' },
  ],
  reasoning: ['The subtraction applies to every term in the second bracket, not just its first.', 'Term by term that leaves ${{ga}}x^2 + {{gb}}x + {{gc}}$.'],
  answerSummary: { headline: 'A minus in front of a bracket changes the sign of everything inside it.', text: 'It is ${{ga}}x^2 + {{gb}}x + {{gc}}$.' },
  hint: 'What happens to the ${{e}}x$ term when the bracket is removed?',
  feedback: 'Only the first term had its sign changed; the other two were added.',
});

mk('A.10A', 'perimeter-of-an-algebraic-rectangle', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'context',
  prompt: 'A rectangle is ${{a}}x + {{b}}$ long and ${{c}}x + {{d}}$ wide. What is its perimeter?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 }, b: { type: 'int', min: 2, max: 12 },
      c: { type: 'int', min: 2, max: 9 }, d: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      px: '2*(a+c)', pk: '2*(b+d)',
      onceX: 'a+c', onceK: 'b+d',
      areaX: 'a*c', areaK: 'b*d',
    },
    constraints: ['a!=c', 'b!=d'],
  },
  choices: [
    { label: plain('{{px}}x + {{pk}}'), correct: true },
    { label: plain('{{onceX}}x + {{onceK}}'), error: 'partialTotal' },
    { label: plain('{{areaX}}x^2 + {{areaK}}'), error: 'areaPerimeterSwap' },
    { label: plain('{{px}}x + {{onceK}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['A perimeter counts each side twice, so it is $2({{a}}x + {{b}}) + 2({{c}}x + {{d}})$.', 'Collecting gives ${{px}}x + {{pk}}$.'],
  answerSummary: { headline: 'Both pairs of sides are doubled, constants included.', text: 'It is ${{px}}x + {{pk}}$.' },
  hint: 'How many sides of each length does a rectangle have?',
  feedback: 'That adds one of each side, which is half the way round.',
});

mk('A.10A', 'the-polynomial-that-completes-a-sum', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: 'What must be added to $({{a}}x^2 + {{b}}x + {{c}})$ to give $({{sa}}x^2 + {{sb}}x + {{sc}})$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 8 }, b: { type: 'int', min: 2, max: 8 }, c: { type: 'int', min: 2, max: 8 },
      ga: { type: 'int', min: 2, max: 7 }, gb: { type: 'int', min: 2, max: 7 }, gc: { type: 'int', min: 2, max: 7 },
    },
    derived: {
      sa: 'a+ga', sb: 'b+gb', sc: 'c+gc',
      ta: 'a+ga+a', tb: 'b+gb+b', tc: 'c+gc+c',
      na: '0-ga', nb: '0-gb', nc: '0-gc',
    },
    constraints: ['ga!=gb', 'gb!=gc', 'a!=ga', 'b!=gb'],
  },
  choices: [
    { label: plain('{{ga}}x^2 + {{gb}}x + {{gc}}'), correct: true },
    { label: plain('{{na}}x^2 + {{nb}}x + {{nc}}'), error: 'signError' },
    { label: plain('{{ta}}x^2 + {{tb}}x + {{tc}}'), error: 'operationInverted' },
    { label: plain('{{sa}}x^2 + {{sb}}x + {{sc}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The missing polynomial is the total minus what is already there.', 'Term by term that is ${{ga}}x^2 + {{gb}}x + {{gc}}$.'],
  answerSummary: { headline: 'Work backwards by subtracting the part you already have from the total.', text: 'It is ${{ga}}x^2 + {{gb}}x + {{gc}}$.' },
  hint: 'How much does each term still need?',
  feedback: 'That is the total itself, which would double what is already there.',
});

mk('A.10A', 'minus-applied-to-the-first-term-only', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'Working out $({{a}}x^2 + {{b}}x) - ({{d}}x^2 + {{e}}x)$ a student writes ${{ga}}x^2 + {{sb}}x$. What is wrong?',
  generator: {
    parameters: {
      d: { type: 'int', min: 2, max: 8 }, e: { type: 'int', min: 2, max: 8 },
      ga: { type: 'int', min: 2, max: 7 }, gb: { type: 'int', min: 2, max: 7 },
    },
    derived: { a: 'd+ga', b: 'e+gb', sb: 'e+gb+e' },
    constraints: ['ga!=gb', 'd!=e'],
  },
  choices: [
    { label: 'The minus applies to the ${{e}}x$ term as well, so the answer is ${{ga}}x^2 + {{gb}}x$.', correct: true },
    { label: 'Nothing is wrong, because the minus sits in front of the first term.', error: 'usedGivenValue' },
    { label: 'The $x^2$ terms should have been added instead, giving a larger first term.', error: 'signError' },
    { label: 'The two brackets cannot be combined at all until they are multiplied out.', error: 'operationInverted' },
  ],
  reasoning: ['A bracket with a minus in front of it has every term inside it negated.', 'The second term is therefore ${{b}} - {{e}} = {{gb}}$, not ${{b}} + {{e}}$.'],
  answerSummary: { headline: 'The sign in front of a bracket reaches every term inside it.', text: 'It is ${{ga}}x^2 + {{gb}}x$.' },
  hint: 'What does the minus reach?',
  feedback: 'It sits in front of the whole bracket, not just its first term.',
});

// ================================================================ A.10B
// Multiplying polynomials. Every family turns on the same rule — each term of
// one factor meets each term of the other — approached through a plain
// product, a square, an area, a monomial across a trinomial, and the standing
// misconception that a squared bracket may be squared term by term.

mk('A.10B', 'multiply-two-binomials', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Expand $(x + {{p}})(x + {{q}})$.',
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 12 },
      q: { type: 'int', min: 2, max: 12 },
    },
    derived: { sum: 'p+q', product: 'p*q', diff: 'p-q' },
    constraints: ['p!=q', 'sum!=product'],
  },
  choices: [
    { label: plain('x^2 + {{sum}}x + {{product}}'), correct: true },
    { label: plain('x^2 + {{product}}x + {{sum}}'), error: 'ratioReversed' },
    { label: plain('x^2 + {{product}}'), error: 'partialTotal' },
    { label: plain('x^2 + {{sum}}x + {{sum}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['Each term of the first bracket multiplies each term of the second.', 'The two middle products give ${{sum}}x$ and the constants give ${{product}}$.'],
  answerSummary: { headline: 'The constants add in the middle term and multiply in the last.', text: 'It is $x^2 + {{sum}}x + {{product}}$.' },
  hint: 'How many products are there altogether?',
  feedback: 'Leaving out the middle term skips the two cross products.',
});

mk('A.10B', 'square-of-a-binomial', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'Expand $(x + {{p}})^2$.',
  generator: {
    parameters: { p: { type: 'int', min: 2, max: 14 } },
    derived: { twoP: '2*p', pSq: 'p*p', fourP: '4*p' },
    constraints: ['twoP!=pSq', 'p!=twoP'],
  },
  choices: [
    { label: plain('x^2 + {{twoP}}x + {{pSq}}'), correct: true },
    { label: plain('x^2 + {{pSq}}'), error: 'partialTotal' },
    { label: plain('x^2 + {{p}}x + {{pSq}}'), error: 'forgotFinalStep' },
    { label: plain('x^2 + {{fourP}}x + {{pSq}}'), error: 'operationInverted' },
  ],
  reasoning: ['A square is the bracket multiplied by itself, so there are two identical cross products.', 'Those two give ${{twoP}}x$, and the constants give ${{pSq}}$.'],
  answerSummary: { headline: 'A squared bracket has a middle term; squaring term by term loses it.', text: 'It is $x^2 + {{twoP}}x + {{pSq}}$.' },
  hint: 'Write the bracket out twice and multiply.',
  feedback: 'There are two cross products, not one.',
});

mk('A.10B', 'area-of-a-rectangle-with-algebraic-sides', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'context',
  prompt: 'A rectangle is ${{a}}x + {{b}}$ long and $x + {{c}}$ wide. What is its area?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 8 },
      b: { type: 'int', min: 2, max: 12 },
      c: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      mid: 'a*c+b', last: 'b*c',
      perimX: '2*(a+1)', perimK: '2*(b+c)',
      noCross: 'a', onlyEnds: 'b*c',
    },
    constraints: ['b!=c', 'mid!=last', 'a!=mid'],
  },
  choices: [
    { label: plain('{{a}}x^2 + {{mid}}x + {{last}}'), correct: true },
    { label: plain('{{a}}x^2 + {{last}}'), error: 'partialTotal' },
    { label: plain('{{perimX}}x + {{perimK}}'), error: 'areaPerimeterSwap' },
    { label: plain('{{a}}x^2 + {{mid}}x'), error: 'forgotFinalStep' },
  ],
  reasoning: ['Area is length times width, so every term of one side meets every term of the other.', 'The cross products give ${{mid}}x$ and the constants give ${{last}}$.'],
  answerSummary: { headline: 'An algebraic area is a product, so all four term pairs appear.', text: 'It is ${{a}}x^2 + {{mid}}x + {{last}}$.' },
  hint: 'How many pairs of terms have to be multiplied?',
  feedback: 'Adding the sides gives a distance round the shape, not the space inside it.',
});

mk('A.10B', 'monomial-across-a-trinomial', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'Expand ${{k}}x(x^2 + {{b}}x + {{c}})$.',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 2, max: 12 },
    },
    derived: { kb: 'k*b', kc: 'k*c' },
    constraints: ['b!=c', 'k!=b', 'kb!=kc'],
  },
  choices: [
    { label: plain('{{k}}x^3 + {{kb}}x^2 + {{kc}}x'), correct: true },
    { label: plain('{{k}}x^3 + {{b}}x^2 + {{c}}x'), error: 'partialTotal' },
    { label: plain('{{k}}x^2 + {{kb}}x + {{kc}}'), error: 'exponentError' },
    { label: plain('{{k}}x^3 + {{kb}}x^2 + {{kc}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['The ${{k}}x$ outside multiplies all three terms inside.', 'Each product gains one power of $x$ from the $x$ that is multiplying in.'],
  answerSummary: { headline: 'A monomial reaches every term, and its $x$ raises every power by one.', text: 'It is ${{k}}x^3 + {{kb}}x^2 + {{kc}}x$.' },
  hint: 'What does the ${{k}}x$ have to reach?',
  feedback: 'Only the first term was multiplied by ${{k}}$; the other two kept their old coefficients.',
});

mk('A.10B', 'a-square-taken-term-by-term', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student writes $(x + {{p}})^2$ as $x^2 + {{pSq}}$. What is wrong?',
  generator: {
    parameters: { p: { type: 'int', min: 2, max: 14 } },
    derived: { twoP: '2*p', pSq: 'p*p' },
    constraints: ['twoP!=pSq'],
  },
  choices: [
    { label: 'The two cross products are missing: the answer is $x^2 + {{twoP}}x + {{pSq}}$.', correct: true },
    { label: 'Nothing is wrong, since each term inside the bracket has been squared.', error: 'usedGivenValue' },
    { label: 'The constant is wrong and should be ${{twoP}}$, but the rest is right.', error: 'partialTotal' },
    { label: 'The answer should be $x^2 + {{p}}x + {{pSq}}$, with one cross product.', error: 'forgotFinalStep' },
  ],
  reasoning: ['Squaring a bracket means multiplying it by itself, which produces four products.', 'The two cross products are equal and add to ${{twoP}}x$.'],
  answerSummary: { headline: 'A bracket cannot be squared one term at a time.', text: 'It is $x^2 + {{twoP}}x + {{pSq}}$.' },
  hint: 'Multiply $(x + {{p}})$ by $(x + {{p}})$ in full.',
  feedback: 'Squaring each term separately is exactly what leaves the middle term out.',
});

// ================================================================ A.10C
// Dividing a polynomial by a binomial. Every quotient here is exact, which is
// what the standard asks for, and the divisor is always a genuine factor
// rather than a term that happens to appear.

mk('A.10C', 'divide-a-quadratic-by-a-binomial', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'What is $(x^2 + {{sum}}x + {{product}}) \\div (x + {{p}})$?',
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 11 },
      gap: { type: 'int', min: 1, max: 8 },
    },
    derived: { q: 'p+gap', sum: 'p+p+gap', product: 'p*(p+gap)' },
    constraints: ['p!=q', 'q!=sum', 'q!=product'],
  },
  choices: [
    { label: plain('x + {{q}}'), correct: true },
    { label: plain('x + {{p}}'), error: 'usedGivenValue' },
    { label: plain('x + {{sum}}'), error: 'partialTotal' },
    { label: plain('x + {{product}}'), error: 'operationInverted' },
  ],
  reasoning: ['The quadratic factors as $(x + {{p}})(x + {{q}})$, since ${{p}}$ and ${{q}}$ add to ${{sum}}$ and multiply to ${{product}}$.', 'Dividing by $(x + {{p}})$ leaves the other factor.'],
  answerSummary: { headline: 'Dividing by one factor leaves the other one behind.', text: 'It is $x + {{q}}$.' },
  hint: 'What does the quadratic factor into?',
  feedback: 'That is the divisor itself, not what is left after dividing by it.',
});

mk('A.10C', 'quotient-when-one-factor-is-known', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'If $x^2 - {{diff}}x - {{product}} = (x + {{p}})(x - {{q}})$, what is it divided by $(x - {{q}})$?',
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 10 },
      gap: { type: 'int', min: 1, max: 8 },
    },
    derived: { q: 'p+gap', diff: 'gap', product: 'p*(p+gap)', negP: '0-p' },
    constraints: ['p!=q', 'p!=diff', 'p!=product'],
  },
  choices: [
    { label: plain('x + {{p}}'), correct: true },
    { label: plain('x - {{p}}'), error: 'signError' },
    { label: plain('x - {{q}}'), error: 'usedGivenValue' },
    { label: plain('x + {{product}}'), error: 'partialTotal' },
  ],
  reasoning: ['A product divided by one of its factors is whatever the other factor is.', 'Here that other factor is $(x + {{p}})$, exactly as written.'],
  answerSummary: { headline: 'Once the factors are on show, division just removes one of them.', text: 'It is $x + {{p}}$.' },
  hint: 'Which factor is left when the divisor is taken away?',
  feedback: 'That is the factor being divided by, so it is the one that disappears.',
});

mk('A.10C', 'the-other-side-of-a-rectangle', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'context',
  prompt: 'A rectangle has area ${{a}}x^2 + {{mid}}x + {{last}}$ and is $x + {{c}}$ wide. How long is it?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 7 },
      b: { type: 'int', min: 2, max: 11 },
      c: { type: 'int', min: 2, max: 11 },
    },
    derived: { mid: 'a*c+b', last: 'b*c', ac: 'a*c' },
    constraints: ['b!=c', 'a!=b', 'b!=mid', 'b!=last', 'b!=ac'],
  },
  choices: [
    { label: plain('{{a}}x + {{b}}'), correct: true },
    { label: plain('{{a}}x + {{c}}'), error: 'usedGivenValue' },
    { label: plain('{{a}}x + {{last}}'), error: 'partialTotal' },
    { label: plain('{{a}}x + {{mid}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['Length is area divided by width, so the area must factor with $(x + {{c}})$ as one side.', 'The other side is ${{a}}x + {{b}}$, since ${{b}} \\times {{c}} = {{last}}$ and ${{a}} \\times {{c}} + {{b}} = {{mid}}$.'],
  answerSummary: { headline: 'Divide the area by the side you know to get the side you do not.', text: 'It is ${{a}}x + {{b}}$.' },
  hint: 'What must multiply $x + {{c}}$ to give a constant term of ${{last}}$?',
  feedback: 'That is the width again, and the two sides are different.',
});

mk('A.10C', 'dividing-out-a-common-factor', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'What is $({{ka}}x^2 + {{kb}}x) \\div {{k}}x$?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 12 },
    },
    derived: { ka: 'k*a', kb: 'k*b' },
    constraints: ['a!=b', 'k!=a', 'ka!=kb'],
  },
  choices: [
    { label: plain('{{a}}x + {{b}}'), correct: true },
    { label: plain('{{a}}x^2 + {{b}}x'), error: 'exponentError' },
    { label: plain('{{a}}x + {{kb}}'), error: 'partialTotal' },
    { label: plain('{{ka}}x + {{b}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['Both terms are divided by ${{k}}x$, not just the first.', 'Dividing by the $x$ lowers each power by one, leaving ${{a}}x + {{b}}$.'],
  answerSummary: { headline: 'A divisor reaches every term, and dividing by $x$ drops each power by one.', text: 'It is ${{a}}x + {{b}}$.' },
  hint: 'What happens to the power of $x$ in each term?',
  feedback: 'The second term still has to be divided by ${{k}}$ as well.',
});

mk('A.10C', 'a-term-cancelled-instead-of-a-factor', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'From $\\frac{x^2 + {{sum}}x + {{product}}}{x + {{p}}}$ a student cancels the $x$ terms and writes ${{sum}}x + {{product}}$. What is wrong?',
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 11 },
      gap: { type: 'int', min: 1, max: 8 },
    },
    derived: { q: 'p+gap', sum: 'p+p+gap', product: 'p*(p+gap)' },
    constraints: ['p!=q', 'q!=sum'],
  },
  choices: [
    { label: 'Only whole factors may be cancelled: the top factors as $(x + {{p}})(x + {{q}})$, leaving $x + {{q}}$.', correct: true },
    { label: 'Nothing is wrong, because $x$ appears on the top and on the bottom.', error: 'usedGivenValue' },
    { label: 'The cancelling is right but the ${{product}}$ should have gone too.', error: 'partialTotal' },
    { label: 'The fraction cannot be simplified at all, since the top has three terms.', error: 'operationInverted' },
  ],
  reasoning: ['Cancelling removes a factor of the whole top and the whole bottom, not a term of each.', 'Once the top is factored, $(x + {{p}})$ really is a factor and may go.'],
  answerSummary: { headline: 'Cancel factors, never terms.', text: 'The quotient is $x + {{q}}$.' },
  hint: 'Is the $x$ on top multiplying everything, or only part of it?',
  feedback: 'Appearing on both lines is not enough; it has to be a factor of both.',
});

// ================================================================ A.10D
// Rewriting a polynomial in an equivalent form using the distributive
// property, in both directions. A.10B multiplies to expand; here the point is
// that the two forms are the same expression, so two families go from a
// product to a sum and two come back the other way.

mk('A.10D', 'distribute-across-a-bracket', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Write ${{k}}({{a}}x - {{b}})$ without a bracket.',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 14 },
    },
    derived: { ka: 'k*a', kb: 'k*b', negKb: '0-k*b' },
    constraints: ['a!=b', 'k!=a', 'ka!=kb'],
  },
  choices: [
    { label: plain('{{ka}}x - {{kb}}'), correct: true },
    { label: plain('{{ka}}x - {{b}}'), error: 'partialTotal' },
    { label: plain('{{ka}}x + {{kb}}'), error: 'signError' },
    { label: plain('{{a}}x - {{kb}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['The ${{k}}$ multiplies both terms inside the bracket.', 'That gives ${{ka}}x$ and ${{kb}}$, and the minus between them is kept.'],
  answerSummary: { headline: 'A multiplier outside a bracket reaches everything inside it.', text: 'It is ${{ka}}x - {{kb}}$.' },
  hint: 'How many terms are inside the bracket?',
  feedback: 'The second term still has to be multiplied by ${{k}}$.',
});

mk('A.10D', 'take-out-the-greatest-common-factor', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: 'Write ${{ka}}x + {{kb}}$ as a product with the largest possible factor outside.',
  generator: {
    parameters: {
      k: { type: 'int', min: 3, max: 9 },
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 12 },
      part: { type: 'int', min: 2, max: 3 },
    },
    derived: { ka: 'k*a', kb: 'k*b', kOver: 'k*part', aOver: 'a*part', bOver: 'b*part' },
    // The factor taken out must be the largest available, so a and b share none.
    constraints: ['gcd(a,b)==1', 'a!=b', 'k!=a', 'k*part<=k*a'],
  },
  choices: [
    { label: plain('{{k}}({{a}}x + {{b}})'), correct: true },
    { label: plain('{{kOver}}({{a}}x + {{b}})'), error: 'operationInverted' },
    { label: plain('{{k}}({{ka}}x + {{kb}})'), error: 'forgotFinalStep' },
    { label: plain('{{a}}({{k}}x + {{b}})'), error: 'partialTotal' },
  ],
  reasoning: ['Both coefficients divide by ${{k}}$, and ${{a}}$ and ${{b}}$ share no further factor.', 'So ${{k}}$ is the largest that can come out, leaving ${{a}}x + {{b}}$ inside.'],
  answerSummary: { headline: 'Take out the largest factor common to every term, and divide every term by it.', text: 'It is ${{k}}({{a}}x + {{b}})$.' },
  hint: 'What divides both ${{ka}}$ and ${{kb}}$?',
  feedback: 'Multiplying that back out does not return the expression you started with.',
});

mk('A.10D', 'two-forms-agreeing-at-every-value', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 2, taskType: 'interpretation', representation: 'table',
  prompt: 'Which expression agrees with the recorded values at every row?',
  stimulus: {
    kind: 'table',
    title: 'Recorded values',
    table: { headers: ['x', 'Value'], rows: [['{{x1}}', '{{v1}}'], ['{{x2}}', '{{v2}}'], ['{{x3}}', '{{v3}}']] },
  },
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 7 },
      a: { type: 'int', min: 2, max: 7 },
      b: { type: 'int', min: 2, max: 11 },
      x1: { type: 'int', min: 1, max: 5 },
    },
    derived: {
      x2: 'x1+1', x3: 'x1+2',
      ka: 'k*a', kb: 'k*b',
      v1: 'k*(a*x1+b)', v2: 'k*(a*(x1+1)+b)', v3: 'k*(a*(x1+2)+b)',
    },
    constraints: ['a!=b', 'k!=a', 'ka!=kb'],
  },
  choices: [
    { label: plain('{{k}}({{a}}x + {{b}})'), correct: true },
    { label: plain('{{k}}{{a}}x + {{b}}'), error: 'partialTotal' },
    { label: plain('{{ka}}x + {{kb}}x'), error: 'operationInverted' },
    { label: plain('{{a}}x + {{kb}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['At $x = {{x1}}$ the bracket is ${{a}} \\times {{x1}} + {{b}}$, and ${{k}}$ times that is ${{v1}}$.', 'The same form matches the other two rows, which the others do not.'],
  answerSummary: { headline: 'Two forms are equivalent only if they agree at every value, not just one.', text: 'It is ${{k}}({{a}}x + {{b}})$.' },
  hint: 'Test each candidate on the first row, then on the second.',
  feedback: 'That form leaves the constant outside the multiplication.',
});

mk('A.10D', 'a-bill-written-two-ways', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'context',
  prompt: '${{k}}$ people each buy a ticket at $\\${{a}}$ and a programme at $\\${{b}}$. Which expression is not the total?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      a: { type: 'int', min: 3, max: 14 },
      b: { type: 'int', min: 2, max: 12 },
    },
    derived: { ka: 'k*a', kb: 'k*b', sum: 'a+b' },
    constraints: ['a!=b', 'k!=a', 'k!=b', 'ka!=kb'],
  },
  choices: [
    { label: plain('{{ka}} + {{b}}'), correct: true },
    { label: plain('{{k}}({{a}} + {{b}})'), error: 'usedGivenValue' },
    { label: plain('{{ka}} + {{kb}}'), error: 'partialTotal' },
    { label: plain('{{k}} \\times {{sum}}'), error: 'operationInverted' },
  ],
  reasoning: ['Every person buys both items, so both prices are multiplied by ${{k}}$.', 'An expression that multiplies only the ticket price charges one programme for the whole group.'],
  answerSummary: { headline: 'Distributing over a bracket means every term inside is multiplied.', text: '${{ka}} + {{b}}$ is not the total.' },
  hint: 'How many programmes are bought altogether?',
  feedback: 'That expression is the bracketed form multiplied out correctly.',
});

mk('A.10D', 'a-factor-taken-out-of-one-term-only', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student writes ${{ka}}x + {{b}}$ as ${{k}}({{a}}x + {{b}})$. What is wrong?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 12 },
    },
    derived: { ka: 'k*a', kb: 'k*b' },
    constraints: ['a!=b', 'k!=a', 'k!=b'],
  },
  choices: [
    { label: 'Multiplying back gives ${{ka}}x + {{kb}}$, so the ${{b}}$ was never divided by ${{k}}$.', correct: true },
    { label: 'Nothing is wrong, because ${{k}}$ does divide the first coefficient.', error: 'usedGivenValue' },
    { label: 'The factor outside should be ${{a}}$ rather than ${{k}}$.', error: 'ratioReversed' },
    { label: 'The bracket is right but the sign inside it should be a minus.', error: 'signError' },
  ],
  reasoning: ['A factor can only come out of a term that it divides.', 'Here ${{b}}$ was carried into the bracket unchanged, which changes the expression.'],
  answerSummary: { headline: 'Check a factorisation by multiplying it back out.', text: 'That bracket gives ${{ka}}x + {{kb}}$, not ${{ka}}x + {{b}}$.' },
  hint: 'Multiply the answer back out and compare.',
  feedback: 'Dividing one term is not enough; every term has to be divided.',
});

// ================================================================ A.10E
// Factoring a trinomial, including the perfect square. A.7B reads zeros off
// factors that are already written down and A.10C divides by a factor it has
// been handed; here the student has to find the factors.

mk('A.10E', 'factor-a-monic-trinomial', {
  courseId: 'algebra1',
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Factor $x^2 + {{sum}}x + {{product}}$.',
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 10 },
      gap: { type: 'int', min: 1, max: 8 },
    },
    derived: { q: 'p+gap', sum: 'p+p+gap', product: 'p*(p+gap)' },
    constraints: ['p!=q', 'sum!=product'],
  },
  choices: [
    { label: plain('(x + {{p}})(x + {{q}})'), correct: true },
    { label: plain('(x - {{p}})(x - {{q}})'), error: 'signError' },
    { label: plain('(x + {{sum}})(x + {{product}})'), error: 'usedGivenValue' },
    { label: plain('(x + {{p}})(x - {{q}})'), error: 'partialTotal' },
  ],
  reasoning: ['Two numbers multiplying to ${{product}}$ and adding to ${{sum}}$ are ${{p}}$ and ${{q}}$.', 'Both are positive, so both brackets carry a plus.'],
  answerSummary: { headline: 'Find the pair that multiplies to the constant and adds to the middle coefficient.', text: 'It is $(x + {{p}})(x + {{q}})$.' },
  hint: 'Which pairs multiply to ${{product}}$?',
  feedback: 'Two minus signs would give the same constant but a negative middle term.',
});

mk('A.10E', 'factor-with-a-leading-coefficient', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Factor ${{a}}x^2 + {{mid}}x + {{last}}$.',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 6 },
      b: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 2, max: 9 },
    },
    derived: { mid: 'a*c+b', last: 'b*c', ac: 'a*c' },
    constraints: ['b!=c', 'a!=b', 'ac!=b'],
  },
  choices: [
    { label: plain('({{a}}x + {{b}})(x + {{c}})'), correct: true },
    { label: plain('({{a}}x + {{c}})(x + {{b}})'), error: 'ratioReversed' },
    { label: plain('({{a}}x + {{b}})(x - {{c}})'), error: 'signError' },
    { label: plain('({{a}}x + {{last}})(x + {{b}})'), error: 'usedGivenValue' },
  ],
  reasoning: ['The constants must multiply to ${{last}}$, so they are ${{b}}$ and ${{c}}$.', 'Placing them so the cross products give ${{mid}}x$ puts ${{c}}$ with the plain $x$.'],
  answerSummary: { headline: 'With a leading coefficient, where each constant goes changes the middle term.', text: 'It is $({{a}}x + {{b}})(x + {{c}})$.' },
  hint: 'Try both placements and check the middle term each time.',
  feedback: 'Swapping the constants changes the middle term, so check it before choosing.',
});

mk('A.10E', 'recognising-a-perfect-square', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  prompt: 'Which product equals $x^2 + {{twoP}}x + {{pSq}}$?',
  generator: {
    parameters: { p: { type: 'int', min: 2, max: 12 } },
    derived: { twoP: '2*p', pSq: 'p*p' },
    constraints: ['twoP!=pSq'],
  },
  choices: [
    { label: plain('(x + {{p}})^2'), correct: true },
    { label: plain('(x + {{pSq}})^2'), error: 'usedGivenValue' },
    { label: plain('(x + {{p}})(x - {{p}})'), error: 'signError' },
    { label: plain('(x + {{twoP}})(x + {{p}})'), error: 'partialTotal' },
  ],
  reasoning: ['The constant ${{pSq}}$ is ${{p}}$ squared, and the middle term is twice ${{p}}$.', 'That is exactly the pattern a squared bracket produces.'],
  answerSummary: { headline: 'A perfect square has a constant that is a square and a middle term twice its root.', text: 'It is $(x + {{p}})^2$.' },
  hint: 'What is the square root of the constant, and how does it relate to the middle term?',
  feedback: 'Opposite signs would cancel the middle term altogether.',
});

mk('A.10E', 'sides-of-a-rectangle-from-its-area', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'context',
  prompt: 'A rectangle has area $x^2 + {{sum}}x + {{product}}$. What could its two sides be?',
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 10 },
      gap: { type: 'int', min: 1, max: 8 },
    },
    derived: { q: 'p+gap', sum: 'p+p+gap', product: 'p*(p+gap)', halfSum: 'p+gap' },
    constraints: ['p!=q', 'sum!=product', 'p!=gap'],
  },
  choices: [
    { label: plain('x + {{p}} \\text{ and } x + {{q}}'), correct: true },
    { label: plain('x + {{sum}} \\text{ and } x + {{product}}'), error: 'usedGivenValue' },
    { label: plain('x \\text{ and } x + {{sum}}'), error: 'partialTotal' },
    { label: plain('x + {{p}} \\text{ and } x - {{q}}'), error: 'signError' },
  ],
  reasoning: ['The two sides multiply to the area, so they are the factors of the trinomial.', 'Those are $x + {{p}}$ and $x + {{q}}$, since the constants add to ${{sum}}$ and multiply to ${{product}}$.'],
  answerSummary: { headline: 'Factoring an area splits it into the two sides that produced it.', text: 'They are $x + {{p}}$ and $x + {{q}}$.' },
  hint: 'What two expressions multiply to give this area?',
  feedback: 'Multiply that pair out and see whether the constant term survives.',
});

mk('A.10E', 'factors-that-miss-the-middle-term', {
  courseId: 'algebra1',
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student factors $x^2 + {{sum}}x + {{product}}$ as $(x + {{one}})(x + {{other}})$. What is wrong?',
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 8 },
      gap: { type: 'int', min: 2, max: 8 },
    },
    // one * other still gives the constant, but they add to the wrong middle
    // term: the pair is right for the product and wrong for the sum.
    derived: {
      q: 'p+gap', sum: 'p+p+gap', product: 'p*(p+gap)',
      one: '1', other: 'p*(p+gap)', wrongSum: '1+p*(p+gap)',
    },
    constraints: ['p!=q', 'sum!=wrongSum', 'p!=gap'],
  },
  choices: [
    { label: 'Those constants multiply to ${{product}}$ but add to ${{wrongSum}}$, not ${{sum}}$: it is $(x + {{p}})(x + {{q}})$.', correct: true },
    { label: 'Nothing is wrong, since the two constants do multiply to ${{product}}$.', error: 'usedGivenValue' },
    { label: 'The constants are right but both signs should be minus.', error: 'signError' },
    { label: 'A trinomial with a middle term cannot be factored into two brackets.', error: 'operationInverted' },
  ],
  reasoning: ['A factor pair has to satisfy both conditions at once, not just the product.', 'Only ${{p}}$ and ${{q}}$ multiply to ${{product}}$ and also add to ${{sum}}$.'],
  answerSummary: { headline: 'The pair must give the constant and the middle term together.', text: 'It is $(x + {{p}})(x + {{q}})$.' },
  hint: 'Add the two constants the student chose and compare with the middle term.',
  feedback: 'Matching the product alone is only half of what a factor pair has to do.',
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
