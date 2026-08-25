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
      far: { type: 'int', min: 2, max: 40 },
    },
    derived: {
      big: 'small+gap',
      mid: 'small+round(gap/2)',
      answer: '1',
    },
    constraints: ['mid!=small', 'mid!=big', 'far!=mid'],
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

// ---------------------------------------------------------------- emit
const seen = new Set();
for (const item of ITEMS) {
  if (seen.has(item.id)) throw new Error(`Duplicate ASVAB id: ${item.id}`);
  seen.add(item.id);
}
assertStandardVariety(ITEMS);
writeFileSync(new URL('../drafts/asvab-mk.json', import.meta.url), `${JSON.stringify({ documents: ITEMS }, null, 1)}\n`);
console.log(`Mathematics Knowledge: ${ITEMS.length} families across ${new Set(ITEMS.map((i) => i.assessedConstruct)).size} standards.`);
