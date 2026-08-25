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
  prompt: 'A pipe has diameter ${{d}}$ cm. What is the distance round it?',
  generator: {
    parameters: { d: { type: 'int', min: 4, max: 40, step: 2 } },
    derived: { r: 'd/2', twoD: '2*d', dsq: 'd*d' },
    constraints: [],
  },
  choices: [
    { label: plain('{{d}}\\pi'), correct: true },
    { label: plain('{{r}}\\pi'), error: 'partialTotal' },
    { label: plain('{{twoD}}\\pi'), error: 'operationInverted' },
    { label: plain('{{dsq}}\\pi'), error: 'areaPerimeterSwap' },
  ],
  reasoning: ['The way round is $\\pi$ times the diameter.', 'With a diameter of ${{d}}$ that is ${{d}}\\pi$ cm.'],
  answerSummary: { headline: 'Circumference is pi times the diameter.', text: 'It is ${{d}}\\pi$ cm.' },
  hint: 'Which length does $\\pi$ multiply?',
  feedback: 'Multiplying by the radius gives only half the way round.',
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
  prompt: 'A disc has radius ${{r}}$ cm. What area does it cover?',
  generator: {
    // From 3: at r = 2 the squared radius and the doubled radius are both 4,
      // and the labels carry no automatic distinctness constraint.
      parameters: { r: { type: 'int', min: 3, max: 20 } },
    derived: { rsq: 'r*r', twoR: '2*r', dsq: '4*r*r' },
    constraints: [],
  },
  choices: [
    { label: plain('{{rsq}}\\pi'), correct: true },
    { label: plain('{{twoR}}\\pi'), error: 'areaPerimeterSwap' },
    { label: plain('{{r}}\\pi'), error: 'partialTotal' },
    { label: plain('{{dsq}}\\pi'), error: 'diameterForRadius' },
  ],
  reasoning: ['Area is $\\pi$ times the radius squared.', '${{r}} \\times {{r}} = {{rsq}}$, so the disc covers ${{rsq}}\\pi$ square cm.'],
  answerSummary: { headline: 'Square the radius, then multiply by pi.', text: 'It covers ${{rsq}}\\pi$ square cm.' },
  hint: 'Which length gets squared?',
  feedback: 'That expression is the way round, not the area.',
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

// ---------------------------------------------------------------- emit
const seen = new Set();
for (const item of ITEMS) {
  if (seen.has(item.id)) throw new Error(`Duplicate ASVAB id: ${item.id}`);
  seen.add(item.id);
}
assertStandardVariety(ITEMS);
writeFileSync(new URL('../drafts/asvab-mk.json', import.meta.url), `${JSON.stringify({ documents: ITEMS }, null, 1)}\n`);
console.log(`Mathematics Knowledge: ${ITEMS.length} families across ${new Set(ITEMS.map((i) => i.assessedConstruct)).size} standards.`);
