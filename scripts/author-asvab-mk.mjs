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

// ---------------------------------------------------------------- emit
const seen = new Set();
for (const item of ITEMS) {
  if (seen.has(item.id)) throw new Error(`Duplicate ASVAB id: ${item.id}`);
  seen.add(item.id);
}
assertStandardVariety(ITEMS);
writeFileSync(new URL('../drafts/asvab-mk.json', import.meta.url), `${JSON.stringify({ documents: ITEMS }, null, 1)}\n`);
console.log(`Mathematics Knowledge: ${ITEMS.length} families across ${new Set(ITEMS.map((i) => i.assessedConstruct)).size} standards.`);
