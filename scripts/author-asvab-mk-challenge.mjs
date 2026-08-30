#!/usr/bin/env node
// ASVAB Mathematics Knowledge — tier-2 challenge bank.
//
// Three authored families per standard, on the same terms as the Arithmetic
// Reasoning challenge bank: SYNTHESIS (two linked steps), INVERSE (the result is
// given and an input has to be recovered) and JUDGEMENT (compare, or find the
// entry that breaks a rule). Nothing here wraps or relabels a direct family.
//
// Mathematics Knowledge keeps its own register: direct symbolic mathematics,
// under 34 words and two sentences, no practical framing for its own sake. That
// is tighter than Arithmetic Reasoning and it changes the authoring. In AR an
// independently drawn crossing distractor can be introduced with a clause; here
// there is no room for one, so the crossing quantity rides in a stimulus table
// instead, or comes out of the mathematics itself.
//
// Many Mathematics Knowledge items answer with an expression, an ordering or a
// statement rather than a number. The answer-key bias analysis does not apply to
// those — there is no magnitude to rank — so the mix of numeric and symbolic
// answers here follows the direct tier's rather than being chosen to avoid the
// gate.

import { readFileSync, writeFileSync } from 'node:fs';
import { MK, asvabChallengeItem, assertChallengeVariety, contextParam, plain } from './lib/asvabAuthoring.mjs';

const ITEMS = [];
const mkc = (code, slug, spec) => {
  ITEMS.push(asvabChallengeItem({ code, slug, domain: MK, courseId: spec.courseId || 'grade6', ...spec }));
};

// ================================================================ 6.2A
// Integers, rationals and the sets they belong to.

mkc('6.2A', 'counting-multiples-inside-a-range', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'How many multiples of ${{m}}$ lie strictly between $-{{a}}$ and ${{b}}$?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 6 },
      ka: { type: 'int', min: 2, max: 8 },
      kb: { type: 'int', min: 2, max: 8 },
    },
    derived: {
      a: 'm*ka',
      b: 'm*kb',
      answer: 'ka+kb-1',
      // Assuming the range is symmetric about zero. Crosses the key as ka and
      // kb are drawn apart, where ka+kb would have been the key plus one.
      d_signError: '2*kb-1',
      d_partialTotal: 'kb-1',
      d_wrongPercentBase: 'a+b-1',
    },
    constraints: ['ka!=kb', 'kb>1', 'abs(ka-kb)>1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_wrongPercentBase}}'), error: 'wrongPercentBase' },
  ],
  reasoning: ['The multiples run from $-{{a}}+{{m}}$ up to ${{b}}-{{m}}$, and zero is one of them.', 'That is ${{ka}}+{{kb}}-1={{answer}}$ values.'],
  answerSummary: { headline: 'Zero is a multiple of every number and sits inside the range.', text: 'There are ${{answer}}$.' },
  hint: 'Count the multiples on each side of zero, then zero itself.',
  feedback: 'The range does not reach as far below zero as it does above, or the other way round.',
});

mkc('6.2A', 'number-behind-a-doubling', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: 'Doubling a number and adding ${{b}}$ gives ${{result}}$. What is the number?',
  generator: {
    parameters: {
      x: { type: 'int', min: 6, max: 40 },
      b: { type: 'int', min: 8, max: 52 },
    },
    derived: {
      result: '2*x+b',
      answer: 'x',
      d_forgotFinalStep: 'result-b',
      d_orderOfOperations: 'round(result/2)-b',
      d_operationInverted: 'result-2*b',
    },
    // x and b overlap so `result-2b` lands either side of the key rather than
    // always below it.
    constraints: ['round(result/2)-b>0', 'result-2*b!=x', 'b>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_orderOfOperations}}'), error: 'orderOfOperations' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['Taking ${{b}}$ off ${{result}}$ leaves twice the number.', 'Halving that gives ${{answer}}$.'],
  answerSummary: { headline: 'Undo the addition before undoing the doubling.', text: 'The number is ${{answer}}$.' },
  hint: 'The addition happened last, so it comes off first.',
  feedback: 'Halving before removing the addition halves part of the wrong quantity.',
});

mkc('6.2A', 'which-set-claim-holds', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal',
  prompt: 'Which statement is true of every rational number?',
  generator: { parameters: { n: { type: 'int', min: 2, max: 9 } }, derived: { twice: 'n*2' } },
  choices: [
    { label: 'It can be written as one integer divided by a non-zero integer.', correct: true },
    { label: 'It can be written as a decimal that never repeats or ends.', error: 'orderOfOperations' },
    { label: 'It is an integer whenever it is greater than zero.', error: 'signError' },
    { label: 'It becomes a whole number when multiplied by any integer.', error: 'operationInverted' },
  ],
  rankAnalysisNotApplicable: false,
  reasoning: ['A rational number is by definition a ratio of two integers with a non-zero denominator.', 'The other statements each fail for a value such as $\\frac{1}{{{n}}}$.'],
  answerSummary: { headline: 'Rational means expressible as a ratio of integers.', text: 'It is a ratio of two integers.' },
  hint: 'Test each claim against a simple fraction.',
  feedback: 'A non-repeating, non-terminating decimal is irrational, not rational.',
});

// ================================================================ 6.2B
// Absolute value.

mkc('6.2B', 'scaling-a-difference-of-absolute-values', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'What is $\\left(\\left|-{{p}}\\right| - \\left|{{q}}\\right|\\right) \\times {{c}}$?',
  generator: {
    parameters: {
      p: { type: 'int', min: 12, max: 40 },
      q: { type: 'int', min: 4, max: 28 },
      c: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      answer: '(p-q)*c',
      d_signError: '(p+q)*c',
      d_forgotFinalStep: 'p-q',
      d_usedGivenValue: 'q*c',
    },
    constraints: ['p>q', 'p-q>2', 'q*c!=(p-q)*c'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Both absolute values are positive, so the bracket is ${{p}}-{{q}}$.', 'Multiplying by ${{c}}$ gives ${{answer}}$.'],
  answerSummary: { headline: 'Absolute value strips the sign before the subtraction.', text: 'It is ${{answer}}$.' },
  hint: 'Evaluate inside the bracket first.',
  feedback: 'Adding the two magnitudes treats the subtraction as an addition.',
});

mkc('6.2B', 'value-inside-an-absolute-equation', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: '$\\left|x - {{b}}\\right| = {{d}}$ and $x < {{b}}$. What is $x$?',
  generator: {
    parameters: {
      b: { type: 'int', min: 14, max: 60 },
      d: { type: 'int', min: 5, max: 40 },
    },
    derived: {
      answer: 'b-d',
      d_signError: 'b+d',
      d_operationInverted: 'd-b',
      d_usedGivenValue: 'd',
    },
    constraints: ['b>d', 'b-d>2', 'd!=b-d'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The absolute value gives $x-{{b}}={{d}}$ or $x-{{b}}=-{{d}}$.', 'Only the second satisfies $x<{{b}}$, so $x={{answer}}$.'],
  answerSummary: { headline: 'An absolute equation has two roots; the condition picks one.', text: '$x={{answer}}$.' },
  hint: 'The condition rules out one of the two solutions.',
  feedback: 'Adding the distance gives the root that sits above the centre.',
});

mkc('6.2B', 'absolute-value-row-that-fails', {
  difficultyBand: 5, dok: 3, taskType: 'errorAnalysis', representation: 'table',
  prompt: 'One row below does not record $\\left|a\\right| + \\left|b\\right|$ correctly. What should it read?',
  stimulus: {
    kind: 'table',
    columns: ['a', 'b', 'Recorded'],
    rows: [['-{{a1}}', '{{b1}}', '{{r1}}'], ['-{{a2}}', '-{{b2}}', '{{rBad}}'], ['{{a3}}', '-{{b3}}', '{{r3}}']],
  },
  generator: {
    parameters: {
      a1: { type: 'int', min: 6, max: 30 },
      b1: { type: 'int', min: 6, max: 30 },
      a2: { type: 'int', min: 6, max: 30 },
      b2: { type: 'int', min: 6, max: 30 },
      a3: { type: 'int', min: 4, max: 20 },
      b3: { type: 'int', min: 4, max: 20 },
    },
    derived: {
      r1: 'a1+b1',
      r3: 'a3+b3',
      answer: 'a2+b2',
      rBad: 'a2-b2',
      d_signError: 'rBad',
      d_partialTotal: 'r1+a2+b2',
      d_usedGivenValue: 'r1',
    },
    constraints: ['a2>b2', 'a2-b2>2', 'r1!=a2+b2'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Both entries in row two are negative, so both absolute values are positive.', 'The row should read ${{a2}}+{{b2}}={{answer}}$.'],
  answerSummary: { headline: 'Absolute value makes every entry positive before adding.', text: 'It should read ${{answer}}$.' },
  hint: 'Two negatives do not cancel inside separate absolute values.',
  feedback: 'Subtracting treats the second negative as if it stayed negative.',
});

// ================================================================ 6.2C
// Position and distance on a number line.

mkc('6.2C', 'value-at-a-step-along-a-line', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'A line runs from $-{{a}}$ to ${{b}}$ in ${{steps}}$ equal steps. What value sits ${{k}}$ steps from the left end?',
  generator: {
    parameters: {
      stepSize: { type: 'int', min: 2, max: 9 },
      steps: { type: 'int', min: 4, max: 10 },
      ka: { type: 'int', min: 1, max: 5 },
      k: { type: 'int', min: 2, max: 6 },
    },
    derived: {
      a: 'stepSize*ka',
      b: 'stepSize*(steps-ka)',
      answer: 'stepSize*k-a',
      d_forgotFinalStep: 'stepSize*k',
      d_signError: 'a-stepSize*k',
      d_usedGivenValue: 'b-stepSize*k',
    },
    constraints: ['k<steps', 'steps>ka', 'stepSize*k-a!=stepSize*k', 'b-stepSize*k!=stepSize*k-a'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The line covers ${{a}}+{{b}}$ over ${{steps}}$ steps, so each step is ${{stepSize}}$.', 'From $-{{a}}$, ${{k}}$ steps reach ${{answer}}$.'],
  answerSummary: { headline: 'Count the steps from the left end, not from zero.', text: 'It is ${{answer}}$.' },
  hint: 'Find the size of one step before counting along.',
  feedback: 'Counting from zero ignores where the line begins.',
});

mkc('6.2C', 'step-count-to-reach-a-value', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: 'A line runs from $-{{a}}$ to ${{b}}$ in ${{steps}}$ equal steps. How many steps reach ${{target}}$?',
  generator: {
    parameters: {
      stepSize: { type: 'int', min: 2, max: 9 },
      steps: { type: 'int', min: 6, max: 14 },
      ka: { type: 'int', min: 2, max: 4 },
      k: { type: 'int', min: 3, max: 8 },
    },
    derived: {
      a: 'stepSize*ka',
      b: 'stepSize*(steps-ka)',
      target: 'stepSize*k-a',
      answer: 'k',
      d_partialTotal: 'k+ka',
      d_forgotFinalStep: 'round(target/stepSize)',
      d_usedGivenValue: 'steps-k',
    },
    constraints: ['k<steps', 'steps>ka', 'round(target/stepSize)!=k', 'steps-k!=k'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Each step is ${{stepSize}}$, and ${{target}}$ sits ${{target}}+{{a}}$ above the left end.', 'That is ${{answer}}$ steps.'],
  answerSummary: { headline: 'Measure from the left end of the line.', text: 'It is ${{answer}}$ steps.' },
  hint: 'The distance travelled is measured from the starting value.',
  feedback: 'Dividing the target itself counts from zero, not from the left end.',
});

mkc('6.2C', 'which-ordering-of-signed-values-holds', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal',
  prompt: 'Which ordering runs from least to greatest?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 9 },
      b: { type: 'int', min: 11, max: 19 },
      c: { type: 'int', min: 21, max: 29 },
    },
    derived: { negB: 'b', negC: 'c' },
  },
  choices: [
    { label: plain('-{{c}} < -{{b}} < -{{a}} < {{a}}'), correct: true },
    { label: plain('-{{a}} < -{{b}} < -{{c}} < {{a}}'), error: 'signError' },
    { label: plain('{{a}} < -{{a}} < -{{b}} < -{{c}}'), error: 'operationInverted' },
    { label: plain('-{{b}} < -{{c}} < -{{a}} < {{a}}'), error: 'orderOfOperations' },
  ],
  rankAnalysisNotApplicable: false,
  reasoning: ['Among negatives, the one with the largest magnitude is the least.', 'So $-{{c}}$ comes first and the positive value comes last.'],
  answerSummary: { headline: 'Bigger magnitude means smaller value once the sign is negative.', text: '$-{{c}} < -{{b}} < -{{a}} < {{a}}$.' },
  hint: 'On a number line, further left is less.',
  feedback: 'Ordering the negatives by magnitude alone reverses them.',
});

// ================================================================ 6.2D
// Comparing and ordering rational numbers written in different forms.

mkc('6.2D', 'gap-between-a-fraction-and-a-percent', {
  difficultyBand: 4, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'By how much does ${{r}}\\%$ of ${{n}}$ fall short of $\\frac{{{p}}}{{{q}}}$ of ${{n}}$?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      q: { type: 'int', min: 2, max: 10 },
      p: { type: 'int', min: 1, max: 9 },
      r: { type: 'int', min: 5, max: 95, step: 5 },
    },
    derived: {
      n: '100*k',
      frac: '100*k*p/q',
      pct: 'k*r',
      answer: 'frac-pct',
      // Read the percent as a plain count of units. Above the key whenever more
      // than one hundred is in play, which is every draw here.
      d_percentNotApplied: 'frac-r',
      // Answered the amount that was subtracted.
      d_forgotFinalStep: 'pct',
      // Took the difference the other way round.
      d_operationInverted: 'pct-frac',
    },
    constraints: ['p<q', 'gcd(p,q)==1', '100*k%q==0', '100*p>r*q', 'frac-pct>8', 'k>1', 'abs(pct-answer)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_percentNotApplied}}'), error: 'percentNotApplied' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['$\\frac{{{p}}}{{{q}}}$ of ${{n}}$ is ${{frac}}$ and ${{r}}\\%$ of ${{n}}$ is ${{pct}}$.', 'The shortfall is ${{frac}}-{{pct}}={{answer}}$.'],
  answerSummary: { headline: 'Put both forms into the same units before comparing.', text: 'It falls short by ${{answer}}$.' },
  hint: 'Work out each share of ${{n}}$ separately, then subtract.',
  feedback: 'A percent is hundredths of the whole, not a count of units.',
});

mkc('6.2D', 'endpoint-behind-a-fractional-position', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'numberLine',
  prompt: 'A point at ${{x}}$ lies $\\frac{{{p}}}{{{q}}}$ of the way from $-{{a}}$ to a larger value. What is that value?',
  generator: {
    parameters: {
      a: { type: 'int', min: 4, max: 40 },
      q: { type: 'int', min: 3, max: 8 },
      p: { type: 'int', min: 1, max: 5 },
      u: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      x: 'u*p-a',
      answer: 'q*u-a',
      // Found the full span but never came back to the left-hand endpoint.
      d_forgotFinalStep: 'q*u',
      // Answered the point that was given.
      d_usedGivenValue: 'x',
      // Subtracted the travelled distance instead of the starting value.
      d_orderOfOperations: 'q*u-u*p',
    },
    constraints: ['p<q', 'gcd(p,q)==1', 'q*u-a>3', 'abs(a-u*p)>3', 'u*(q-p)>3', 'x<q*u-a'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_orderOfOperations}}'), error: 'orderOfOperations' },
  ],
  reasoning: ['From $-{{a}}$ to ${{x}}$ is ${{u}}\\times{{p}}$, which is $\\frac{{{p}}}{{{q}}}$ of the span.', 'The whole span is ${{q}}\\times{{u}}$, so the far end is ${{answer}}$.'],
  answerSummary: { headline: 'A fractional position measures from the left endpoint, not from zero.', text: 'The value is ${{answer}}$.' },
  hint: 'Find the length of one ${{q}}$th of the span first.',
  feedback: 'The span is a length; the endpoint is that length counted from $-{{a}}$.',
});

mkc('6.2D', 'claim-that-sign-reverses', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'Which claim about ${{a}}$, $-\\frac{{{p}}}{{{q}}}$ and ${{r}}\\%$ is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      q: { type: 'int', min: 3, max: 9 },
      p: { type: 'int', min: 1, max: 8 },
      r: { type: 'int', min: 10, max: 90, step: 5 },
    },
    derived: { hundredths: 'r' },
    constraints: ['p<q', 'gcd(p,q)==1', 'r*q!=100*p'],
  },
  choices: [
    { label: 'Because ${{a}}$ is greater than $\\frac{{{p}}}{{{q}}}$, $-{{a}}$ is greater than $-\\frac{{{p}}}{{{q}}}$.', correct: true },
    { label: '$-\\frac{{{p}}}{{{q}}}$ is greater than $-{{a}}$.', error: 'signError' },
    { label: '${{a}}$ is greater than ${{r}}\\%$.', error: 'wrongPercentBase' },
    { label: '$-\\frac{{{p}}}{{{q}}}$ is less than ${{r}}\\%$.', error: 'operationInverted' },
  ],
  reasoning: ['Negating two values reverses the order they sit in.', 'Since ${{a}}>\\frac{{{p}}}{{{q}}}$, it follows that $-{{a}}<-\\frac{{{p}}}{{{q}}}$.'],
  answerSummary: { headline: 'Order reverses under negation.', text: 'The claim that $-{{a}}$ is the greater one is wrong.' },
  hint: 'Place both negatives on a number line before deciding.',
  feedback: 'Comparing magnitudes settles nothing until the signs are the same.',
});

// ================================================================ 6.2E
// A fraction is a quotient: $\frac{a}{b}$ and $a \div b$ name one number.

mkc('6.2E', 'doubling-a-quotient-into-mixed-form', {
  difficultyBand: 4, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'Write ${{n}} \\div {{b}}$ as a mixed number, then double it.',
  generator: {
    parameters: {
      b: { type: 'int', min: 3, max: 9 },
      n: { type: 'int', min: 11, max: 95 },
    },
    derived: {
      whole: 'floor(2*n/b)',
      rem: '2*n-b*floor(2*n/b)',
      // Never doubled: the mixed form of the original quotient.
      w_single: 'floor(n/b)',
      r_single: 'n-b*floor(n/b)',
      // Doubled the denominator instead of the value.
      w_den: 'floor(n/(2*b))',
      r_den: 'n-2*b*floor(n/(2*b))',
      // Doubled the whole part and left the fractional part alone.
      w_part: '2*floor(n/b)',
      r_part: 'n-b*floor(n/b)',
    },
    constraints: ['n%b!=0', '2*n%b!=0', 'floor(2*n/b)>1', 'floor(n/(2*b))>0', 'n%(2*b)!=0'],
  },
  choices: [
    { label: plain('{{whole}}\\frac{{{rem}}}{{{b}}}'), correct: true },
    { label: plain('{{w_single}}\\frac{{{r_single}}}{{{b}}}'), error: 'forgotFinalStep' },
    { label: plain('{{w_den}}\\frac{{{r_den}}}{2 \\times {{b}}}'), error: 'operationInverted' },
    { label: plain('{{w_part}}\\frac{{{r_part}}}{{{b}}}'), error: 'partialTotal' },
  ],
  reasoning: ['${{n}} \\div {{b}}$ is $\\frac{{{n}}}{{{b}}}$, so doubling gives $\\frac{2 \\times {{n}}}{{{b}}}$.', 'That is ${{whole}}\\frac{{{rem}}}{{{b}}}$.'],
  answerSummary: { headline: 'Double the numerator, not the denominator.', text: 'It is ${{whole}}\\frac{{{rem}}}{{{b}}}$.' },
  hint: 'A quotient can be doubled before it is rewritten.',
  feedback: 'Doubling the whole part alone leaves the fractional part undoubled.',
});

mkc('6.2E', 'dividend-behind-a-mixed-number', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: 'A whole number divided by ${{b}}$ gives ${{w}}\\frac{{{r}}}{{{b}}}$. What is the whole number?',
  generator: {
    parameters: {
      b: { type: 'int', min: 5, max: 9 },
      w: { type: 'int', min: 2, max: 9 },
      r: { type: 'int', min: 3, max: 8 },
    },
    derived: {
      answer: 'w*b+r',
      // Dropped the remainder entirely.
      d_forgotFinalStep: 'w*b',
      // Read the mixed number back to front.
      d_ratioReversed: 'r*b+w',
      // Multiplied the whole and the remainder together by the divisor.
      d_partialTotal: '(w+r)*b',
    },
    constraints: ['r<b', 'r!=w', 'abs((r-w)*(b-1))>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['${{w}}\\frac{{{r}}}{{{b}}}$ is $\\frac{{{w}} \\times {{b}} + {{r}}}{{{b}}}$.', 'So the dividend is ${{answer}}$.'],
  answerSummary: { headline: 'Rebuild the improper fraction, then read its numerator.', text: 'The number is ${{answer}}$.' },
  hint: 'The whole part accounts for ${{w}} \\times {{b}}$ of the dividend.',
  feedback: 'The remainder is part of the dividend, not something left outside it.',
});

mkc('6.2E', 'statement-that-breaks-the-fraction-bar', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal',
  prompt: 'Which statement about $\\frac{{{a}}}{{{b}}}$ is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 29 },
      b: { type: 'int', min: 2, max: 12 },
      k: { type: 'int', min: 2, max: 6 },
    },
    constraints: ['a!=b', 'a%b!=0'],
  },
  choices: [
    { label: 'It has the same value as ${{b}}$ divided by ${{a}}$.', correct: true },
    { label: 'It has the same value as ${{a}}$ divided by ${{b}}$.', error: 'usedGivenValue' },
    { label: 'Multiplying both ${{a}}$ and ${{b}}$ by ${{k}}$ leaves its value unchanged.', error: 'incompleteFactoring' },
    { label: 'It equals ${{a}}$ multiplied by $\\frac{1}{{{b}}}$.', error: 'operationInverted' },
  ],
  reasoning: ['A fraction bar means numerator divided by denominator, in that order.', '${{b}} \\div {{a}}$ is the reciprocal of $\\frac{{{a}}}{{{b}}}$, not the same number.'],
  answerSummary: { headline: 'The fraction bar is not symmetric.', text: 'The claim about ${{b}} \\div {{a}}$ is wrong.' },
  hint: 'Test each claim on a fraction you can evaluate in your head.',
  feedback: 'Scaling both parts by the same factor does preserve the value.',
});

// ================================================================ 6.3A
// Dividing by a fraction, and the reciprocal that makes it a multiplication.

mkc('6.3A', 'two-divisions-in-sequence', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Dividing ${{n}}$ by $\\frac{{{p}}}{{{q}}}$ and then by ${{m}}$ gives what result?',
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 3 },
      q: { type: 'int', min: 5, max: 12 },
      m: { type: 'int', min: 2, max: 4 },
      s: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      n: 'p*m*s',
      answer: 's*q',
      // Multiplied by ${{m}} instead of dividing by it.
      d_operationInverted: 'm*s*q',
      // Divided by ${{m}} and left the fraction out.
      d_partialTotal: 'p*s',
      // Answered the amount that was given.
      d_usedGivenValue: 'n',
    },
    constraints: ['q>p', 'gcd(p,q)==1', 'n>12', 'abs(n-s*q)>3', 'abs(p*s-s*q)>3', 's*q>9'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['${{n}} \\div \\frac{{{p}}}{{{q}}}$ is ${{n}} \\times \\frac{{{q}}}{{{p}}}$, which is ${{m}} \\times {{s}} \\times {{q}}$.', 'Dividing that by ${{m}}$ leaves ${{answer}}$.'],
  answerSummary: { headline: 'Turn the division into a multiplication by the reciprocal first.', text: 'The result is ${{answer}}$.' },
  hint: 'Dividing by $\\frac{{{p}}}{{{q}}}$ makes the amount larger, not smaller.',
  feedback: 'The two divisions pull in the same direction only if the fraction is greater than one.',
});

mkc('6.3A', 'denominator-behind-a-known-quotient', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: 'Dividing ${{n}}$ by a fraction gives ${{v}}$. If the fraction has numerator ${{p}}$, what is its denominator?',
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 7 },
      u: { type: 'int', min: 2, max: 9 },
      d: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      n: 'p*u',
      v: 'u*d',
      answer: 'd',
      // Answered the quotient that was given.
      d_forgotFinalStep: 'v',
      // Answered ${{n}} \div {{p}}, which is only part of the work.
      d_usedGivenValue: 'u',
      // Answered the numerator that was given.
      d_operationInverted: 'p',
    },
    constraints: ['u!=d', 'p!=d', 'p!=u', 'v!=d', 'n>5'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['${{n}} \\div \\frac{{{p}}}{d}$ is ${{n}} \\times \\frac{d}{{{p}}}$, and that equals ${{v}}$.', 'So $d = {{v}} \\times {{p}} \\div {{n}} = {{answer}}$.'],
  answerSummary: { headline: 'The denominator is the factor the reciprocal multiplies by.', text: 'The denominator is ${{answer}}$.' },
  hint: 'Write the division as a multiplication by the reciprocal, then solve for the missing part.',
  feedback: 'The quotient itself is not the denominator; it already has ${{n}}$ folded into it.',
});

mkc('6.3A', 'diagnosing-a-multiplied-fraction', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student found ${{n}} \\div \\frac{{{p}}}{{{q}}}$ and answered ${{wrong}}$. What did they do?',
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 7 },
      q: { type: 'int', min: 3, max: 9 },
      t: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      n: 'q*t',
      wrong: 'p*t',
      right: 'q*q*t/p',
    },
    constraints: ['q>p', 'gcd(p,q)==1', 'p*t>5'],
  },
  choices: [
    { label: 'They multiplied by $\\frac{{{p}}}{{{q}}}$ instead of by its reciprocal.', correct: true },
    { label: 'They multiplied by ${{q}}$ and forgot to divide by ${{p}}$.', error: 'forgotFinalStep' },
    { label: 'They cancelled ${{q}}$ from ${{n}}$ and from the numerator.', error: 'incompleteFactoring' },
    { label: 'They added $\\frac{{{p}}}{{{q}}}$ to ${{n}}$ instead of dividing.', error: 'operationInverted' },
  ],
  reasoning: ['${{n}} \\times \\frac{{{p}}}{{{q}}}$ is exactly ${{wrong}}$.', 'Dividing calls for $\\frac{{{q}}}{{{p}}}$, which would have made the result larger.'],
  answerSummary: { headline: 'Dividing by a fraction below one makes a number bigger.', text: 'They multiplied by the fraction itself.' },
  hint: 'Check what ${{n}} \\times \\frac{{{p}}}{{{q}}}$ comes to.',
  feedback: 'Cancelling would not have produced a value below ${{n}}$ in this pattern.',
});

// ================================================================ 6.3C
// Integer addition and subtraction shown on models: counters and the number line.

mkc('6.3C', 'repeated-moves-in-both-directions', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'numberLine',
  prompt: 'A marker at $-{{a}}$ makes ${{n}}$ moves of ${{b}}$ right, then ${{m}}$ moves of ${{c}}$ left. Where does it stop?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 18 },
      b: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 2, max: 9 },
      n: { type: 'int', min: 2, max: 6 },
      m: { type: 'int', min: 2, max: 6 },
    },
    derived: {
      answer: 'n*b-m*c-a',
      // Stopped after the rightward moves.
      d_forgotFinalStep: 'n*b-a',
      // Ran both journeys the wrong way.
      d_operationInverted: 'm*c-n*b-a',
      // Attached each count to the wrong move size.
      d_ratioReversed: 'm*b-n*c-a',
    },
    constraints: ['m!=n', 'b!=c', 'abs((m-n)*(b+c))>3', 'abs(m*c)>3', 'abs(n*b-m*c-a)>2'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['The rightward moves add ${{n}} \\times {{b}}$ and the leftward moves take off ${{m}} \\times {{c}}$.', 'From $-{{a}}$ that lands on ${{answer}}$.'],
  answerSummary: { headline: 'Total each direction before combining them.', text: 'It stops at ${{answer}}$.' },
  hint: 'Repeated moves of the same size can be totalled first.',
  feedback: 'Each count belongs to the move size it was given with.',
});

mkc('6.3C', 'size-of-the-return-move', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'numberLine',
  prompt: 'A marker at $-{{a}}$ moved ${{b}}$ right ${{n}}$ times, then once to the left and stopped at ${{end}}$. How long was the left move?',
  generator: {
    parameters: {
      a: { type: 'int', min: 4, max: 18 },
      b: { type: 'int', min: 3, max: 9 },
      n: { type: 'int', min: 2, max: 6 },
      left: { type: 'int', min: 6, max: 48 },
    },
    derived: {
      end: 'n*b-a-left',
      answer: 'left',
      // Measured the left move from zero rather than from where it started.
      d_forgotFinalStep: 'n*b-end',
      // Counted only one rightward move.
      d_partialTotal: 'b-end-a',
      // Answered the total rightward distance.
      d_usedGivenValue: 'n*b',
    },
    constraints: ['left>4', 'abs(n*b)>4', 'abs(b-end-a-left)>3', 'abs(n*b-left)>3', 'abs(end)>1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['After the rightward moves the marker sat at ${{n}} \\times {{b}} - {{a}}$.', 'Dropping from there to ${{end}}$ takes ${{answer}}$.'],
  answerSummary: { headline: 'Find where the marker stood before the last move.', text: 'The left move was ${{answer}}$.' },
  hint: 'Rebuild the position reached after the rightward moves.',
  feedback: 'The left move is measured from that position, not from zero.',
});

mkc('6.3C', 'which-sequence-lands-on-the-target', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'verbal',
  prompt: 'Starting at $-{{a}}$, which sequence of moves ends at ${{target}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 15 },
      b: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 2, max: 9 },
      n: { type: 'int', min: 2, max: 6 },
      m: { type: 'int', min: 2, max: 6 },
    },
    derived: { target: 'n*b-m*c-a' },
    constraints: [
      'n!=m', 'b!=c',
      'n*b-m*c!=m*b-n*c',
      'n*b-m*c!=m*c-n*b',
      'n*b-m*c!=n*c-m*b',
      'abs(n*b-m*c-a)>2',
    ],
  },
  choices: [
    { label: 'Right ${{b}}$ taken ${{n}}$ times, then left ${{c}}$ taken ${{m}}$ times.', correct: true },
    { label: 'Left ${{b}}$ taken ${{n}}$ times, then right ${{c}}$ taken ${{m}}$ times.', error: 'signError' },
    { label: 'Right ${{c}}$ taken ${{m}}$ times, then left ${{b}}$ taken ${{n}}$ times.', error: 'ratioReversed' },
    { label: 'Right ${{b}}$ taken ${{m}}$ times, then left ${{c}}$ taken ${{n}}$ times.', error: 'usedGivenValue' },
  ],
  reasoning: ['Only ${{n}} \\times {{b}} - {{m}} \\times {{c}}$ carries $-{{a}}$ to ${{target}}$.', 'Every other pairing changes the net distance travelled.'],
  answerSummary: { headline: 'Test each sequence by its net movement.', text: 'Right ${{b}}$ ${{n}}$ times, then left ${{c}}$ ${{m}}$ times.' },
  hint: 'Work out the net movement each sequence produces.',
  feedback: 'Swapping the counts between the two move sizes changes the total.',
});

// ================================================================ 6.3D
// Adding and subtracting integers.

mkc('6.3D', 'subtracting-a-negative-inside-a-product', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'What is $-{{a}} - \\left(-{{b}}\\right) + {{c}} \\times \\left(-{{d}}\\right)$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 4, max: 24 },
      b: { type: 'int', min: 3, max: 22 },
      c: { type: 'int', min: 2, max: 8 },
      d: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      answer: 'b-a-c*d',
      // Read the double negative as a further subtraction.
      d_signError: '0-a-b-c*d',
      // Added the product instead of subtracting it.
      d_operationInverted: 'b-a+c*d',
      // Combined the sum before multiplying.
      d_orderOfOperations: '(b-a+c)*(0-d)',
    },
    constraints: ['a!=b', 'abs(b-a-c*d)>2', 'abs((b-a+c)*d)>3', 'abs(b-a-c*d-(b-a+c)*(0-d))>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_orderOfOperations}}'), error: 'orderOfOperations' },
  ],
  reasoning: ['$-{{a}} - \\left(-{{b}}\\right)$ is ${{b}}-{{a}}$, and ${{c}} \\times \\left(-{{d}}\\right)$ is $-{{c}}\\times{{d}}$.', 'Together that is ${{answer}}$.'],
  answerSummary: { headline: 'Subtracting a negative adds; multiplying by a negative subtracts.', text: 'The value is ${{answer}}$.' },
  hint: 'Deal with the product before combining anything.',
  feedback: 'The multiplication binds tighter than the addition in front of it.',
});

mkc('6.3D', 'starting-value-behind-two-changes', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: 'Subtracting ${{n}}$ from a number and then adding $-{{m}}$ gives $-{{r}}$. What was the number?',
  generator: {
    parameters: {
      n: { type: 'int', min: 4, max: 30 },
      m: { type: 'int', min: 3, max: 24 },
      r: { type: 'int', min: 3, max: 28 },
    },
    derived: {
      answer: 'n+m-r',
      // Treated the stated result as positive.
      d_signError: 'r+n+m',
      // Left the second change out.
      d_forgotFinalStep: 'n-r',
      // Read the result as positive and reversed the second change.
      d_operationInverted: 'r+n-m',
    },
    constraints: ['abs(n+m-r)>3', 'abs(r-m)>3', 'abs(m)>2', 'n+m-r>0'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['Undoing the changes means adding ${{n}}$ back and adding ${{m}}$ back.', '$-{{r}}+{{n}}+{{m}}={{answer}}$.'],
  answerSummary: { headline: 'Reverse each change in turn, signs included.', text: 'The number was ${{answer}}$.' },
  hint: 'Adding $-{{m}}$ is a subtraction, so undoing it is an addition.',
  feedback: 'The result is negative, and its sign has to travel through the whole calculation.',
});

mkc('6.3D', 'diagnosing-a-double-negative', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student wrote $-{{a}} - \\left(-{{b}}\\right) = -{{wrong}}$. What went wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 5, max: 28 },
      b: { type: 'int', min: 4, max: 26 },
    },
    derived: { wrong: 'a+b', right: 'b-a' },
    constraints: ['a!=b', 'abs(b-a)>2'],
  },
  choices: [
    { label: 'Subtracting a negative was carried out as subtracting a positive.', correct: true },
    { label: 'The two values were added when they should have been subtracted.', error: 'operationInverted' },
    { label: 'The larger value was written first.', error: 'ratioReversed' },
    { label: 'A digit was carried wrongly in the arithmetic.', error: 'arithmeticSlip' },
  ],
  reasoning: ['$-{{a}} - \\left(-{{b}}\\right)$ is $-{{a}}+{{b}}$, which is ${{right}}$.', 'Answering $-{{wrong}}$ means the second minus sign never cancelled the negative.'],
  answerSummary: { headline: 'Two minus signs in a row cancel.', text: 'The double negative was not resolved.' },
  hint: 'Rewrite the subtraction of a negative as an addition first.',
  feedback: 'The arithmetic itself is sound; it is the sign on ${{b}}$ that was mishandled.',
});

// ================================================================ 6.3E
// Multiplying and dividing positive rational numbers.

mkc('6.3E', 'difference-of-two-fractional-parts', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'What is ${{n}} \\times \\frac{{{p}}}{{{q}}} - {{m}} \\times \\frac{{{r}}}{{{q}}}$?',
  generator: {
    parameters: {
      q: { type: 'int', min: 4, max: 11 },
      u: { type: 'int', min: 2, max: 9 },
      w: { type: 'int', min: 2, max: 9 },
      p: { type: 'int', min: 2, max: 9 },
      r: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      n: 'q*u',
      m: 'q*w',
      answer: 'u*p-w*r',
      // Added the two parts instead of subtracting.
      d_operationInverted: 'u*p+w*r',
      // Paired each whole with the other numerator.
      d_ratioReversed: 'u*r-w*p',
      // Answered only the part that was being taken away.
      d_forgotFinalStep: 'w*r',
    },
    constraints: [
      'p<q', 'r<q', 'gcd(p,q)==1', 'gcd(r,q)==1', 'p!=r',
      'u*p-w*r>4', 'abs(u*r-w*p-(u*p-w*r))>3', 'u!=w', 'p!=r', 'abs(w*r-u*p+w*r)>3',
    ],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['${{n}}$ is ${{u}}$ lots of ${{q}}$, so the first part is ${{u}} \\times {{p}}$.', 'The second is ${{w}} \\times {{r}}$, and the difference is ${{answer}}$.'],
  answerSummary: { headline: 'A common denominator makes both products whole numbers.', text: 'The value is ${{answer}}$.' },
  hint: 'Divide each whole number by ${{q}}$ before multiplying.',
  feedback: 'Each numerator belongs to the whole number written beside it.',
});

mkc('6.3E', 'number-behind-a-doubled-fraction-of-itself', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: 'A number is doubled and then multiplied by $\\frac{{{p}}}{{{q}}}$, giving ${{v}}$. What is the number?',
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 5 },
      q: { type: 'int', min: 3, max: 12 },
      t: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      v: '2*t*p',
      answer: 'q*t',
      // Answered the value that was given.
      d_usedGivenValue: 'v',
      // Undid the fraction but never undid the doubling.
      d_forgotFinalStep: '2*q*t',
      // Divided by the numerator and stopped.
      d_partialTotal: 't',
    },
    constraints: ['p<q', 'gcd(p,q)==1', 'q*t>9', 'abs(v-q*t)>3', 'abs(q*t-t)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['Undoing $\\frac{{{p}}}{{{q}}}$ means multiplying ${{v}}$ by $\\frac{{{q}}}{{{p}}}$, giving $2 \\times {{q}} \\times {{t}}$.', 'Halving that leaves ${{answer}}$.'],
  answerSummary: { headline: 'Undo the operations in the reverse order they were applied.', text: 'The number is ${{answer}}$.' },
  hint: 'The doubling happened first, so it comes off last.',
  feedback: 'Reversing the fraction alone leaves the doubling still in the answer.',
});

mkc('6.3E', 'diagnosing-a-misplaced-decimal-point', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student multiplied ${{a}}$ by ${{b}}$ and wrote ${{wrong}}$. What went wrong?',
  generator: {
    parameters: {
      A: { type: 'int', min: 12, max: 89 },
      B: { type: 'int', min: 12, max: 89 },
    },
    derived: {
      a: 'A/10',
      b: 'B/10',
      right: 'A*B/100',
      wrong: 'A*B/10',
    },
    constraints: ['A%10!=0', 'B%10!=0'],
  },
  choices: [
    { label: 'The decimal point was placed one digit too far right.', correct: true },
    { label: 'The two numbers were added instead of multiplied.', error: 'operationInverted' },
    { label: 'Only the whole-number parts were multiplied.', error: 'partialTotal' },
    { label: 'One factor was rounded before the multiplication.', error: 'roundedWrong' },
  ],
  reasoning: ['Each factor carries one decimal place, so the product carries two.', '${{a}} \\times {{b}} = {{right}}$, not ${{wrong}}$.'],
  answerSummary: { headline: 'Count the decimal places in both factors and total them.', text: 'The decimal point sits one place too far right.' },
  hint: 'Multiply as whole numbers first, then replace the decimal places.',
  feedback: 'The digits themselves are right; it is their place value that is off.',
});

// ================================================================ 6.4A
// Additive and multiplicative rules, and how they differ.

mkc('6.4A', 'value-where-two-rules-agree', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Rule A is $y = {{a}}x - {{c}}$ and Rule B is $y = {{d}}x$. What is $y$ where they agree?',
  generator: {
    parameters: {
      a: { type: 'int', min: 4, max: 12 },
      d: { type: 'int', min: 2, max: 9 },
      k: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      c: '(a-d)*k',
      answer: 'd*k',
      // Answered the input where they agree, not the output.
      d_forgotFinalStep: 'k',
      // Read the output off Rule A without subtracting.
      d_partialTotal: 'a*k',
      // Answered the constant that was given.
      d_usedGivenValue: 'c',
    },
    constraints: ['d<a', 'a-d!=d', 'abs((a-d-d)*k)>3', 'd*k>8', 'abs((a-d)*k)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Setting ${{a}}x - {{c}} = {{d}}x$ gives $x = {{k}}$.', 'Rule B then gives $y = {{d}} \\times {{k}} = {{answer}}$.'],
  answerSummary: { headline: 'Solve for the input first, then read the output.', text: 'They agree at $y = {{answer}}$.' },
  hint: 'Collect the $x$ terms on one side before dividing.',
  feedback: 'The input where the rules meet is not the output they share.',
});

mkc('6.4A', 'multiplying-rule-behind-a-shared-pair', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
  prompt: 'One rule multiplies and one adds; both send ${{x}}$ to ${{y}}$. What does the multiplying rule send ${{x2}}$ to?',
  generator: {
    parameters: {
      x: { type: 'int', min: 2, max: 13 },
      m: { type: 'int', min: 2, max: 9 },
      x2: { type: 'int', min: 2, max: 13 },
    },
    derived: {
      y: 'm*x',
      answer: 'm*x2',
      // Multiplied by the output rather than by the factor behind it.
      d_usedGivenValue: 'x2*m*x',
      // Applied the adding rule instead.
      d_operationInverted: 'x2+m*x-x',
      // Answered the input untouched.
      d_forgotFinalStep: 'x2',
    },
    constraints: ['x!=x2', 'm*x2>8', 'abs(m*x2-x2-m*x+x)>3', 'abs(x2*m*x-m*x2)>3', 'abs(m*x2-x2)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['The multiplying rule takes ${{x}}$ to ${{y}}$, so it multiplies by ${{m}}$.', 'It therefore sends ${{x2}}$ to ${{answer}}$.'],
  answerSummary: { headline: 'One shared pair fixes both rules, but they part company elsewhere.', text: 'It sends ${{x2}}$ to ${{answer}}$.' },
  hint: 'Find the factor that carries ${{x}}$ to ${{y}}$.',
  feedback: 'The adding rule agrees at ${{x}}$ only, and gives a different value at ${{x2}}$.',
});

mkc('6.4A', 'input-where-two-rules-differ-by-a-set-amount', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'Rule A is $y = {{a}}x$ and Rule B is $y = x + {{b}}$. At which listed input does A exceed B by ${{gap}}$?',
  stimulus: {
    kind: 'table',
    columns: ['Input'],
    rows: [['{{k}}'], ['{{i_low}}'], ['{{i_high}}'], ['{{i_odd}}']],
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 8 },
      w: { type: 'int', min: 2, max: 9 },
      k: { type: 'int', min: 6, max: 40 },
    },
    derived: {
      b: '(a-1)*w',
      gap: '(a-1)*(k-w)',
      i_low: 'k-w',
      i_high: 'k+2*w',
      i_odd: 'w',
    },
    constraints: ['k>2*w+2', 'k-w>2', 'gap>6', 'w!=k-w', 'k!=2*w'],
  },
  choices: [
    { label: 'Input ${{k}}$', correct: true },
    { label: 'Input ${{i_low}}$', error: 'forgotFinalStep' },
    { label: 'Input ${{i_high}}$', error: 'operationInverted' },
    { label: 'Input ${{i_odd}}$', error: 'usedGivenValue' },
  ],
  reasoning: ['The gap between the rules at input $x$ is $({{a}}-1)x - {{b}}$.', 'Setting that equal to ${{gap}}$ gives $x = {{k}}$.'],
  answerSummary: { headline: 'The gap between an additive and a multiplicative rule grows steadily.', text: 'It is input ${{k}}$.' },
  hint: 'Write the difference between the two rules as one expression in $x$.',
  feedback: 'Leaving ${{b}}$ out of the difference shifts the input that works.',
});

// ================================================================ 6.7A
// Order of operations, exponents and factorization.

mkc('6.7A', 'product-less-a-grouped-quotient', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Find the value of ${{d}} \\times {{e}} - \\frac{{{a}} + {{b}}^{2}}{{{c}}}$.',
  generator: {
    parameters: {
      b: { type: 'int', min: 2, max: 6 },
      c: { type: 'int', min: 2, max: 9 },
      u: { type: 'int', min: 3, max: 20 },
      d: { type: 'int', min: 2, max: 7 },
      e: { type: 'int', min: 2, max: 7 },
    },
    derived: {
      a: 'c*u-b*b',
      answer: 'd*e-u',
      // Added the quotient instead of subtracting it.
      d_operationInverted: 'd*e+u',
      // Took the difference the other way round.
      d_signError: 'u-d*e',
      // Answered the quotient on its own.
      d_usedGivenValue: 'u',
    },
    constraints: ['a>2', 'abs(d*e-u)>4', 'abs(2*u-d*e)>3', 'd!=e'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The fraction bar groups ${{a}} + {{b}}^{2}$, which is ${{c}} \\times {{u}}$.', 'So the expression is ${{d}} \\times {{e}} - {{u}} = {{answer}}$.'],
  answerSummary: { headline: 'A fraction bar groups everything above it.', text: 'The value is ${{answer}}$.' },
  hint: 'Square ${{b}}$ before adding, and divide only after that.',
  feedback: 'The quotient is subtracted from the product, not the other way round.',
});

mkc('6.7A', 'coefficient-behind-a-squared-term', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: 'For which value of $b$ does ${{a}} + b \\times {{x}}^{2}$ equal ${{v}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 5, max: 60 },
      x: { type: 'int', min: 3, max: 6 },
      w: { type: 'int', min: 2, max: 7 },
    },
    derived: {
      v: 'a+w*x*x*x',
      answer: 'x*w',
      // Doubled the base instead of squaring it.
      d_exponentError: 'w*x*x/2',
      // Answered the base that was given.
      d_usedGivenValue: 'x*x',
      // Divided by a cube rather than a square.
      d_orderOfOperations: 'w',
    },
    constraints: ['w*x*x%2==0', 'x!=w', 'abs(x*x-x*w)>3', 'x*w>8', 'abs(w*x*x/2-x*w)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_exponentError}}'), error: 'exponentError' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_orderOfOperations}}'), error: 'orderOfOperations' },
  ],
  reasoning: ['Subtracting ${{a}}$ from ${{v}}$ leaves $b \\times {{x}}^{2}$.', 'Dividing by ${{x}}^{2}$ gives $b = {{answer}}$.'],
  answerSummary: { headline: 'Strip the constant first, then divide by the power.', text: '$b = {{answer}}$.' },
  hint: 'The square is a factor of what is left after ${{a}}$ is removed.',
  feedback: '${{x}}^{2}$ is ${{x}}$ multiplied by itself, not ${{x}}$ doubled.',
});

mkc('6.7A', 'diagnosing-a-squared-product', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student evaluated ${{a}} - {{b}} \\times {{c}}^{2}$ as ${{wrong}}$. What went wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 20, max: 90 },
      b: { type: 'int', min: 2, max: 6 },
      c: { type: 'int', min: 3, max: 7 },
    },
    derived: {
      right: 'a-b*c*c',
      wrong: 'a-b*c*b*c',
    },
    constraints: ['b>1', 'a-b*c*c!=a-b*c*b*c'],
  },
  choices: [
    { label: 'The base was multiplied by ${{b}}$ before it was squared.', correct: true },
    { label: 'The subtraction was carried out before the multiplication.', error: 'orderOfOperations' },
    { label: 'The exponent was treated as a multiplier.', error: 'exponentError' },
    { label: 'The sign in front of ${{b}}$ was dropped.', error: 'signError' },
  ],
  reasoning: ['Only ${{c}}$ carries the exponent, so the term is ${{b}} \\times {{c}} \\times {{c}}$.', 'That gives ${{right}}$, not ${{wrong}}$.'],
  answerSummary: { headline: 'An exponent binds only to the base written beneath it.', text: '${{b}}$ was folded into the base before squaring.' },
  hint: 'Ask which factor the exponent actually sits on.',
  feedback: 'Squaring came first here; the order of operations was not the problem.',
});

// ================================================================ 6.6A
// Independent and dependent quantities.

mkc('6.6A', 'column-that-a-rate-change-moves', {
  difficultyBand: 4, dok: 2, taskType: 'interpretation', representation: 'table',
  prompt: 'The table records two shifts. Which column changes if the pay rate changes but the hours do not?',
  stimulus: {
    kind: 'table',
    columns: ['Hours', 'Parts made', 'Pay'],
    rows: [['{{h}}', '{{parts}}', '$\\${{pay}}$'], ['{{h2}}', '{{parts2}}', '$\\${{pay2}}$']],
  },
  generator: {
    parameters: {
      h: { type: 'int', min: 3, max: 8 },
      h2: { type: 'int', min: 4, max: 9 },
      rate: { type: 'int', min: 14, max: 32 },
      speed: { type: 'int', min: 5, max: 20 },
    },
    derived: {
      parts: 'h*speed',
      parts2: 'h2*speed',
      pay: 'h*rate',
      pay2: 'h2*rate',
    },
    constraints: ['h!=h2'],
  },
  choices: [
    { label: 'Pay only.', correct: true },
    { label: 'Hours only.', error: 'operationInverted' },
    { label: 'Parts made only.', error: 'usedGivenValue' },
    { label: 'Parts made and pay together.', error: 'partialTotal' },
  ],
  reasoning: ['Hours are chosen, not produced, so nothing about the pay rate moves them.', 'Parts made depend on hours and on how fast the work goes, not on the rate.'],
  answerSummary: { headline: 'A change reaches only the quantities that depend on it.', text: 'Only the pay column changes.' },
  hint: 'Ask which column is computed from the rate.',
  feedback: 'Parts made and hours are settled before any pay rate is applied.',
});

mkc('6.6A', 'pair-for-a-longer-shift', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'orderedPairs',
  prompt: 'The pair $({{h}}, {{p}})$ records hours and pay for one shift. Which pair records a shift ${{k}}$ hours longer?',
  generator: {
    parameters: {
      h: { type: 'int', min: 2, max: 9 },
      rate: { type: 'int', min: 12, max: 30 },
      k: { type: 'int', min: 1, max: 6 },
    },
    derived: {
      p: 'h*rate',
      hNew: 'h+k',
      pNew: 'h*rate+rate*k',
      pFlat: 'h*rate+k',
    },
    constraints: ['rate!=1', 'k>0'],
  },
  choices: [
    { label: plain('({{hNew}}, {{pNew}})'), correct: true },
    { label: plain('({{hNew}}, {{pFlat}})'), error: 'usedGivenValue' },
    { label: plain('({{hNew}}, {{p}})'), error: 'forgotFinalStep' },
    { label: plain('({{pNew}}, {{hNew}})'), error: 'ratioReversed' },
  ],
  reasoning: ['The pay rate is ${{p}} \\div {{h}} = {{rate}}$ an hour.', '${{k}}$ more hours add ${{rate}} \\times {{k}}$, giving $({{hNew}}, {{pNew}})$.'],
  answerSummary: { headline: 'Recover the rate before extending the shift.', text: 'It is $({{hNew}}, {{pNew}})$.' },
  hint: 'The pair given is enough to find what one hour pays.',
  feedback: 'Extra hours add pay at the hourly rate, not one dollar each.',
});

mkc('6.6A', 'claim-that-ignores-a-fixed-charge', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal',
  prompt: 'A cost $c$ follows $c = {{r}}n + {{f}}$ for $n$ parts. Which statement is wrong?',
  generator: {
    parameters: {
      r: { type: 'int', min: 3, max: 20 },
      f: { type: 'int', min: 8, max: 60 },
    },
    constraints: ['f>0', 'r>1'],
  },
  choices: [
    { label: 'Doubling $n$ doubles $c$.', correct: true },
    { label: 'Raising $n$ by one raises $c$ by ${{r}}$.', error: 'operationInverted' },
    { label: 'When $n$ is zero, $c$ is ${{f}}$.', error: 'usedGivenValue' },
    { label: '$c$ depends on $n$, not $n$ on $c$.', error: 'ratioReversed' },
  ],
  reasoning: ['Doubling $n$ doubles only the ${{r}}n$ part; the ${{f}}$ is charged once either way.', 'So the cost grows by less than double.'],
  answerSummary: { headline: 'A fixed charge breaks proportional scaling.', text: 'Doubling $n$ does not double $c$.' },
  hint: 'Test the claim with $n$ equal to one and then two.',
  feedback: 'Each extra part does add exactly ${{r}}$; it is the fixed charge that spoils doubling.',
});

// ================================================================ 6.6B
// Writing an equation that fits a table of pairs.

mkc('6.6B', 'value-of-the-rule-at-zero', {
  difficultyBand: 4, dok: 2, taskType: 'interpretation', representation: 'table',
  prompt: 'Every row follows one rule of the form $y = kx + b$. What is $y$ when $x$ is zero?',
  stimulus: {
    kind: 'table',
    columns: ['x', 'y'],
    rows: [['{{x1}}', '{{y1}}'], ['{{x2}}', '{{y2}}'], ['{{x3}}', '{{y3}}']],
  },
  generator: {
    parameters: {
      k: { type: 'int', min: 3, max: 15 },
      b: { type: 'int', min: 4, max: 14 },
      x1: { type: 'int', min: 2, max: 5 },
      x2: { type: 'int', min: 6, max: 9 },
      x3: { type: 'int', min: 11, max: 15 },
    },
    derived: {
      y1: 'k*x1+b',
      y2: 'k*x2+b',
      y3: 'k*x3+b',
      answer: 'b',
      // Read the first output straight off the table.
      d_forgotFinalStep: 'y1',
      // Answered the rate of change instead of the starting value.
      d_ratioReversed: 'k',
      // Put the starting value on the wrong side of zero.
      d_signError: '0-b',
    },
    constraints: ['abs(b-k)>3', 'abs(y1-b)>3', 'b>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['From row to row $y$ climbs ${{k}}$ for each step in $x$.', 'Working back to $x = 0$ leaves $y = {{answer}}$.'],
  answerSummary: { headline: 'The value at zero is what is left once the rate is removed.', text: '$y = {{answer}}$.' },
  hint: 'Find how much $y$ changes per unit of $x$ first.',
  feedback: 'The rate of change and the value at zero are two different numbers.',
});

mkc('6.6B', 'input-that-reaches-a-target-output', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'orderedPairs',
  prompt: 'The pairs $({{x1}}, {{y1}})$ and $({{x2}}, {{y2}})$ obey one rule. For which $x$ does $y$ equal ${{yt}}$?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 7 },
      c: { type: 'int', min: 4, max: 70 },
      z: { type: 'int', min: 4, max: 9 },
      x1: { type: 'int', min: 1, max: 6 },
      x2: { type: 'int', min: 7, max: 12 },
    },
    derived: {
      b: 'k*c',
      y1: 'k*x1+k*c',
      y2: 'k*x2+k*c',
      answer: '(k+1)*z',
      yt: 'k*(k+1)*z+k*c',
      // Divided the output by the rate and never removed the constant.
      d_forgotFinalStep: '(k+1)*z+c',
      // Answered the constant divided by the rate.
      d_usedGivenValue: 'c',
      // Divided by one more than the rate.
      d_orderOfOperations: 'k*z',
    },
    constraints: ['c>3', 'z>3', 'abs(c-(k+1)*z)>3', '(k+1)*z>9'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_orderOfOperations}}'), error: 'orderOfOperations' },
  ],
  reasoning: ['The two pairs give a rise of ${{k}}$ per step and a value of ${{b}}$ at zero.', 'Solving ${{k}}x + {{b}} = {{yt}}$ gives $x = {{answer}}$.'],
  answerSummary: { headline: 'Build the rule from the pairs, then run it backwards.', text: '$x = {{answer}}$.' },
  hint: 'Take the value at zero off the target before dividing.',
  feedback: 'Dividing the target by the rate leaves the constant still folded in.',
});

mkc('6.6B', 'diagnosing-a-missing-constant', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'From the pairs $({{x1}}, {{y1}})$ and $({{x2}}, {{y2}})$ a student wrote $y = {{ratio}}x$. What went wrong?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 8 },
      x1: { type: 'int', min: 2, max: 6 },
      x2: { type: 'int', min: 7, max: 13 },
      j: { type: 'int', min: 1, max: 6 },
    },
    derived: {
      b: 'x1*j',
      y1: 'k*x1+x1*j',
      y2: 'k*x2+x1*j',
      ratio: 'k+j',
    },
    constraints: ['j>0', 'k*x2+x1*j!=(k+j)*x2'],
  },
  choices: [
    { label: 'The rule was read as multiplicative when a constant is also added.', correct: true },
    { label: 'The two coordinates were used in the wrong order.', error: 'ratioReversed' },
    { label: 'The rise was divided by the wrong difference.', error: 'wrongPercentBase' },
    { label: 'Only the second pair was used to build the rule.', error: 'partialTotal' },
  ],
  reasoning: ['$y = {{ratio}}x$ fits the first pair but sends ${{x2}}$ to a value that is not ${{y2}}$.', 'The pairs rise by ${{k}}$ per step and start from ${{b}}$ at zero.'],
  answerSummary: { headline: 'One pair can never settle a rule with two unknowns.', text: 'The constant term was left out.' },
  hint: 'Check the proposed rule against the second pair.',
  feedback: 'The coordinates were read in the right order; it is the form of the rule that is wrong.',
});

// ================================================================ 6.6C
// Equations that describe a situation with a rate and a starting amount.

mkc('6.6C', 'gap-between-two-plans-at-one-input', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Plan A costs $y = {{k}}x + {{b}}$ and Plan B costs $y = {{m}}x$. At $x = {{x}}$, how much cheaper is Plan B?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      m: { type: 'int', min: 3, max: 14 },
      b: { type: 'int', min: 10, max: 50 },
      x: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      answer: 'b-(m-k)*x',
      // Compared the fees and ignored the rates.
      d_forgotFinalStep: 'b',
      // Compared the rates and ignored the fee.
      d_partialTotal: '(m-k)*x',
      // Took the comparison the other way round.
      d_signError: '(m-k)*x-b',
    },
    constraints: ['m>k', 'b-(m-k)*x>4', 'abs(b-2*(m-k)*x)>3', '(m-k)*x>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['At $x = {{x}}$ Plan A costs ${{k}} \\times {{x}} + {{b}}$ and Plan B costs ${{m}} \\times {{x}}$.', 'The difference is ${{answer}}$.'],
  answerSummary: { headline: 'The fee and the rate both count at a given input.', text: 'Plan B is ${{answer}}$ cheaper.' },
  hint: 'Work out each cost in full before comparing them.',
  feedback: 'The fee is charged once, so it does not scale with $x$.',
});

mkc('6.6C', 'starting-amount-behind-a-steady-rate', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
  prompt: 'A pump adding ${{k}}$ litres a minute leaves a tank at ${{v}}$ litres after ${{t}}$ minutes. How much was in it first?',
  generator: {
    parameters: {
      k: { type: 'int', min: 3, max: 16 },
      t: { type: 'int', min: 2, max: 12 },
      start: { type: 'int', min: 6, max: 120 },
    },
    derived: {
      v: 'start+k*t',
      answer: 'start',
      // Added the pumped amount again instead of removing it.
      d_operationInverted: 'v+k*t',
      // Answered how much the pump delivered.
      d_usedGivenValue: 'k*t',
      // Took the difference the other way round.
      d_signError: 'k*t-v',
    },
    constraints: ['abs(k*t-start)>3', 'start>5'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['In ${{t}}$ minutes the pump delivers ${{k}} \\times {{t}}$ litres.', 'Taking that off ${{v}}$ leaves ${{answer}}$.'],
  answerSummary: { headline: 'Strip out what the rate contributed to reach the starting amount.', text: 'It held ${{answer}}$ litres.' },
  hint: 'The rate accounts for everything except what was already there.',
  feedback: 'The pumped amount has to come off the final reading, not be added to it.',
});

mkc('6.6C', 'equation-that-adds-a-discount', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'For "$x$ items at $\\${{k}}$ each, less a $\\${{b}}$ discount" a student writes $y = {{k}}x + {{b}}$. What is wrong?',
  generator: {
    parameters: {
      k: { type: 'int', min: 3, max: 25 },
      b: { type: 'int', min: 5, max: 40 },
    },
    constraints: ['k!=b'],
  },
  choices: [
    { label: 'The discount should be subtracted, not added.', correct: true },
    { label: 'The rate and the discount have been swapped.', error: 'ratioReversed' },
    { label: 'The discount should be multiplied by $x$.', error: 'wrongPercentBase' },
    { label: 'The rate should be added to $x$, not multiplied by it.', error: 'operationInverted' },
  ],
  reasoning: ['A discount lowers the total, so it carries a minus sign.', 'The equation should read $y = {{k}}x - {{b}}$.'],
  answerSummary: { headline: 'A discount subtracts once, whatever $x$ is.', text: 'The sign in front of ${{b}}$ is wrong.' },
  hint: 'Ask whether the total goes up or down because of the discount.',
  feedback: 'The rate is applied per item correctly; the discount is applied once.',
});

// ================================================================ 6.9A
// Writing equations and inequalities for verbal descriptions.

mkc('6.9A', 'inequality-for-a-doubled-then-reduced-number', {
  difficultyBand: 4, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'Twice a number, less ${{a}}$, is at most ${{t}}$. Which inequality says that?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 40 },
      t: { type: 'int', min: 8, max: 90 },
    },
    constraints: ['t>a'],
  },
  choices: [
    { label: plain('2x - {{a}} \\le {{t}}'), correct: true },
    { label: plain('2x + {{a}} \\le {{t}}'), error: 'operationInverted' },
    { label: plain('2(x - {{a}}) \\le {{t}}'), error: 'orderOfOperations' },
    { label: plain('2x - {{a}} \\ge {{t}}'), error: 'signError' },
  ],
  reasoning: ['"Twice a number" is $2x$, and "less ${{a}}$" subtracts after the doubling.', '"At most" is $\\le$.'],
  answerSummary: { headline: 'Translate each phrase in the order it is written.', text: 'It is $2x - {{a}} \\le {{t}}$.' },
  hint: 'Decide which operation happens first, then which direction the inequality faces.',
  feedback: 'Bracketing the subtraction doubles it as well as the number.',
});

mkc('6.9A', 'largest-whole-number-under-a-ceiling', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
  prompt: 'A number is multiplied by ${{a}}$ and then reduced by ${{b}}$; the result is at most ${{t}}$. What is the largest whole number it can be?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      j: { type: 'int', min: 1, max: 8 },
      k: { type: 'int', min: 5, max: 40 },
    },
    derived: {
      b: 'a*j',
      t: 'a*(k-j)',
      answer: 'k',
      // Never added the reduction back before dividing.
      d_forgotFinalStep: 'k-j',
      // Answered the reduction itself.
      d_ratioReversed: 'b',
      // Answered the ceiling untouched.
      d_usedGivenValue: 't',
    },
    constraints: ['k>j+2', 'abs(a*j-k)>3', 'abs(t-k)>3', 'j>0'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The condition is ${{a}}x - {{b}} \\le {{t}}$, so ${{a}}x \\le {{t}} + {{b}}$.', 'Dividing gives $x \\le {{answer}}$.'],
  answerSummary: { headline: 'Undo the subtraction before undoing the multiplication.', text: 'The largest is ${{answer}}$.' },
  hint: 'Move ${{b}}$ across before dividing by ${{a}}$.',
  feedback: 'Dividing first leaves the reduction still sitting on the wrong side.',
});

mkc('6.9A', 'inequality-with-the-widest-solution-set', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'symbolic',
  prompt: 'For whole numbers $x$ of at least $1$, which inequality allows the greatest number of values?',
  generator: {
    parameters: {
      a: { type: 'int', min: 4, max: 9 },
      t: { type: 'int', min: 24, max: 90 },
    },
    derived: {
      c1: 't-a',
      c2: 'floor(t/2)',
      c3: 'floor(t/3)',
      c4: 'floor(t/a)',
    },
    constraints: ['t>2*a+6', 'c1>c2', 'c2!=c3', 'c3!=c4', 'c1!=c4'],
  },
  choices: [
    { label: plain('x + {{a}} \\le {{t}}'), correct: true },
    { label: plain('2x \\le {{t}}'), error: 'ratioReversed' },
    { label: plain('3x \\le {{t}}'), error: 'operationInverted' },
    { label: plain('{{a}}x \\le {{t}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Adding ${{a}}$ shifts the ceiling down by ${{a}}$, leaving ${{c1}}$ values.', 'Each of the others divides the ceiling, which cuts far more away.'],
  answerSummary: { headline: 'Adding costs a fixed amount; multiplying costs a share.', text: 'It is $x + {{a}} \\le {{t}}$.' },
  hint: 'Count the whole numbers each inequality lets through.',
  feedback: 'Dividing ${{t}}$ by a factor removes a proportion, not a fixed amount.',
});

// ================================================================ 6.9B
// Solutions drawn on a number line.

mkc('6.9B', 'where-a-shaded-ray-begins', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'numberLine',
  prompt: 'Solving ${{k}}x - {{b}} \\le {{t}}$ shades a ray on the number line. At what value does it start?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      j: { type: 'int', min: 1, max: 9 },
      c: { type: 'int', min: 4, max: 40 },
    },
    derived: {
      b: 'k*j',
      t: 'k*(c-j)',
      answer: 'c',
      // Divided the ceiling without restoring the subtraction.
      d_forgotFinalStep: 'c-j',
      // Answered the amount that was subtracted.
      d_ratioReversed: 'b',
      // Answered the ceiling untouched.
      d_usedGivenValue: 't',
    },
    constraints: ['c>j+2', 'abs(k*j-c)>3', 'abs(t-c)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Adding ${{b}}$ to both sides gives ${{k}}x \\le {{t}} + {{b}}$.', 'Dividing by ${{k}}$ puts the endpoint at ${{answer}}$.'],
  answerSummary: { headline: 'The endpoint is the solved boundary, not a number from the question.', text: 'It starts at ${{answer}}$.' },
  hint: 'Solve the inequality before drawing anything.',
  feedback: 'The ceiling on ${{k}}x - {{b}}$ is not the ceiling on $x$.',
});

mkc('6.9B', 'inequality-behind-a-drawn-ray', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'numberLine',
  prompt: 'A number line is shaded left from a closed dot at ${{c}}$. Which inequality produces exactly that picture?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 3, max: 30 },
      c: { type: 'int', min: 3, max: 25 },
    },
    derived: { t: 'k*c+b', tLow: 'k*c-b' },
    constraints: ['k*c-b>0', 'b>2'],
  },
  choices: [
    { label: plain('{{k}}x + {{b}} \\le {{t}}'), correct: true },
    { label: plain('{{k}}x + {{b}} < {{t}}'), error: 'offByOneStep' },
    { label: plain('{{k}}x + {{b}} \\ge {{t}}'), error: 'signError' },
    { label: plain('{{k}}x - {{b}} \\le {{t}}'), error: 'operationInverted' },
  ],
  reasoning: ['A closed dot means the endpoint is included, so the relation is $\\le$.', 'Shading to the left means the solutions are the smaller values.'],
  answerSummary: { headline: 'The dot fixes the relation and the shading fixes the direction.', text: 'It is ${{k}}x + {{b}} \\le {{t}}$.' },
  hint: 'Decide the direction first, then whether the endpoint counts.',
  feedback: 'A strict inequality leaves the endpoint open.',
});

mkc('6.9B', 'diagnosing-a-ray-drawn-backwards', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'A student solves ${{k}}x > {{t}}$ and shades left from an open dot at ${{c}}$. What is wrong?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 3, max: 30 },
    },
    derived: { t: 'k*c' },
    constraints: ['k>1'],
  },
  choices: [
    { label: 'The shading should run right, because $x$ must be larger than ${{c}}$.', correct: true },
    { label: 'The dot should be closed at ${{c}}$.', error: 'signError' },
    { label: 'The endpoint should be at ${{t}}$, not ${{c}}$.', error: 'usedGivenValue' },
    { label: 'The inequality has no solutions at all.', error: 'operationInverted' },
  ],
  reasoning: ['Dividing ${{k}}x > {{t}}$ by the positive ${{k}}$ leaves $x > {{c}}$.', 'Nothing reverses the direction, so the shading belongs on the right.'],
  answerSummary: { headline: 'Dividing by a positive number keeps the direction.', text: 'The ray points the wrong way.' },
  hint: 'Check which values actually satisfy the inequality.',
  feedback: 'The open dot is right; a strict inequality excludes the endpoint.',
});

// ================================================================ 6.10A
// Writing and solving one-variable equations.

mkc('6.10A', 'solve-a-grouped-quotient-equation', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Solve $\\frac{x + {{a}}}{{{c}}} = {{q}}$.',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 30 },
      c: { type: 'int', min: 2, max: 9 },
      q: { type: 'int', min: 4, max: 35 },
    },
    derived: {
      answer: 'c*q-a',
      // Added ${{a}} instead of subtracting it.
      d_operationInverted: 'c*q+a',
      // Never multiplied by the divisor.
      d_forgotFinalStep: 'q-a',
      // Multiplied the added value by the divisor instead of the result.
      d_ratioReversed: 'a*c',
    },
    constraints: ['c*q-a>4', 'abs(a*c-c*q+a)>3', 'a!=q', 'abs(q-a)>2'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['Multiplying both sides by ${{c}}$ gives $x + {{a}} = {{c}} \\times {{q}}$.', 'Subtracting ${{a}}$ leaves $x = {{answer}}$.'],
  answerSummary: { headline: 'Clear the denominator before touching the constant.', text: '$x = {{answer}}$.' },
  hint: 'The fraction bar groups $x + {{a}}$, so both terms are divided.',
  feedback: 'Subtracting before multiplying leaves ${{a}}$ scaled by the wrong amount.',
});

mkc('6.10A', 'divisor-behind-a-known-solution', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: 'For which value of $c$ does $\\frac{x + {{a}}}{c} = {{q}}$ have the solution $x = {{v}}$?',
  generator: {
    parameters: {
      q: { type: 'int', min: 4, max: 16 },
      w: { type: 'int', min: 1, max: 6 },
      c: { type: 'int', min: 2, max: 14 },
    },
    derived: {
      a: 'q*w',
      v: 'q*(c-w)',
      answer: 'c',
      // Answered the numerator without dividing.
      d_forgotFinalStep: 'v+a',
      // Answered the quotient that was given.
      d_usedGivenValue: 'q',
      // Subtracted the constant instead of adding it.
      d_operationInverted: 'c-2*w',
    },
    constraints: ['c>w+2', 'c-2*w>0', 'abs(c-q)>3', 'v>3', 'abs(v+a-c)>3', 'w>0'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['With $x = {{v}}$ the numerator is ${{v}} + {{a}}$.', 'Dividing that by ${{q}}$ gives $c = {{answer}}$.'],
  answerSummary: { headline: 'Put the solution back in, then solve for what is missing.', text: '$c = {{answer}}$.' },
  hint: 'Work out the numerator first; the divisor is what turns it into ${{q}}$.',
  feedback: 'The numerator is not the divisor; it still has to be divided by ${{q}}$.',
});

mkc('6.10A', 'dividing-only-one-term', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'To solve ${{a}}x + {{b}} = {{t}}$ a student divides only the first term by ${{a}}$. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 3, max: 40 },
      x: { type: 'int', min: 2, max: 20 },
    },
    derived: { t: 'a*x+b' },
    constraints: ['a>1'],
  },
  choices: [
    { label: 'Every term on both sides has to be divided, not just one.', correct: true },
    { label: 'Division may never come before subtraction.', error: 'orderOfOperations' },
    { label: 'Both sides should be multiplied by ${{a}}$ instead.', error: 'operationInverted' },
    { label: 'The sign of ${{b}}$ should change where it stands.', error: 'signError' },
  ],
  reasoning: ['Dividing an equation by ${{a}}$ changes every term, giving $x + \\frac{{{b}}}{{{a}}} = \\frac{{{t}}}{{{a}}}$.', 'Dividing one term alone makes the two sides unequal.'],
  answerSummary: { headline: 'An operation applied to an equation reaches every term.', text: 'Only one term was divided.' },
  hint: 'Ask whether both sides still balance after the step.',
  feedback: 'Dividing first is a legitimate route; it just has to be done to everything.',
});

// ================================================================ 6.10B
// Deciding whether a value satisfies an equation or inequality.

mkc('6.10B', 'value-where-two-expressions-meet', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'For which value of $x$ does ${{k}}x - {{b}}$ equal ${{m}}x + {{c}}$?',
  generator: {
    parameters: {
      k: { type: 'int', min: 4, max: 12 },
      m: { type: 'int', min: 2, max: 8 },
      s: { type: 'int', min: 6, max: 22 },
      j: { type: 'int', min: 2, max: 7 },
    },
    derived: {
      c: '(k-m)*j',
      b: '(k-m)*(s-j)',
      answer: 's',
      // Answered the combined constant without dividing.
      d_forgotFinalStep: 'b+c',
      // Answered the constant on the right.
      d_usedGivenValue: 'c',
      // Took the constants apart instead of together.
      d_signError: 's-2*j',
    },
    constraints: ['m<k', 's>2*j+2', 'b>2', 'abs((k-m)*j-s)>3', 'abs(b+c-s)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['Collecting gives $({{k}}-{{m}})x = {{b}} + {{c}}$.', 'Dividing by ${{k}}-{{m}}$ leaves $x = {{answer}}$.'],
  answerSummary: { headline: 'Gather the variable on one side and the constants on the other.', text: '$x = {{answer}}$.' },
  hint: 'Both constants move to the same side, and both keep their signs.',
  feedback: 'The two constants combine before anything is divided.',
});

mkc('6.10B', 'value-that-clears-two-conditions', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'Which listed value satisfies both ${{a}}x \\le {{t}}$ and $x > {{lo}}$?',
  stimulus: {
    kind: 'table',
    columns: ['Value'],
    rows: [['{{vk}}'], ['{{lo}}'], ['{{tooBig}}'], ['{{tooSmall}}']],
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 9 },
      vk: { type: 'int', min: 8, max: 40 },
      gap: { type: 'int', min: 3, max: 12 },
      over: { type: 'int', min: 2, max: 9 },
      under: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      lo: 'vk-gap',
      t: 'a*vk',
      tooBig: 'vk+over',
      tooSmall: 'vk-gap-under',
    },
    constraints: ['vk-gap>2', 'vk-gap-under>0', 'gap>2'],
  },
  choices: [
    { label: 'Value ${{vk}}$', correct: true },
    { label: 'Value ${{lo}}$', error: 'offByOneStep' },
    { label: 'Value ${{tooBig}}$', error: 'forgotFinalStep' },
    { label: 'Value ${{tooSmall}}$', error: 'signError' },
  ],
  reasoning: ['The first condition caps $x$ at ${{vk}}$ and the second needs $x$ above ${{lo}}$.', 'Only ${{vk}}$ clears both.'],
  answerSummary: { headline: 'A value must satisfy every condition, not just one.', text: 'It is ${{vk}}$.' },
  hint: 'Test each listed value against both conditions in turn.',
  feedback: '"Greater than ${{lo}}$" excludes ${{lo}}$ itself.',
});

mkc('6.10B', 'substituting-inside-the-wrong-grouping', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'To check $x = {{v}}$ in ${{a}}x + {{b}} = {{t}}$ a student computes ${{a}} \\times ({{v}} + {{b}})$. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 3, max: 30 },
      v: { type: 'int', min: 2, max: 20 },
    },
    derived: { t: 'a*v+b', wrong: 'a*(v+b)' },
    constraints: ['a>1', 'b>2'],
  },
  choices: [
    { label: 'The addition was carried out before the multiplication.', correct: true },
    { label: 'The value belongs in place of ${{b}}$, not $x$.', error: 'usedGivenValue' },
    { label: 'Both sides must be divided by ${{a}}$ before checking.', error: 'operationInverted' },
    { label: 'A second value is needed before the check settles anything.', error: 'partialTotal' },
  ],
  reasoning: ['Only $x$ is multiplied by ${{a}}$, so the check is ${{a}} \\times {{v}}$ then $+ {{b}}$.', 'That gives ${{t}}$, while the grouped version gives ${{wrong}}$.'],
  answerSummary: { headline: 'Substitution replaces the letter, not the structure around it.', text: '${{b}}$ was pulled inside the multiplication.' },
  hint: 'Look at which term the coefficient actually multiplies.',
  feedback: 'One value is enough to settle a check; the grouping is the problem.',
});

// ================================================================ 6.11
// Points, quadrants and reflections in the coordinate plane.

mkc('6.11', 'point-after-two-reflections', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'orderedPairs',
  prompt: 'Reflect $(-{{p}}, {{q}})$ across the horizontal axis, then across the vertical axis. Which point results?',
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 18 },
      q: { type: 'int', min: 2, max: 18 },
    },
    constraints: ['p!=q'],
  },
  choices: [
    { label: plain('({{p}}, -{{q}})'), correct: true },
    { label: plain('(-{{p}}, -{{q}})'), error: 'forgotFinalStep' },
    { label: plain('({{p}}, {{q}})'), error: 'signError' },
    { label: plain('(-{{q}}, {{p}})'), error: 'ratioReversed' },
  ],
  reasoning: ['The first reflection changes the sign of the height, giving $(-{{p}}, -{{q}})$.', 'The second changes the sign of the across value, giving $({{p}}, -{{q}})$.'],
  answerSummary: { headline: 'Each axis flips the coordinate it is not aligned with.', text: 'It is $({{p}}, -{{q}})$.' },
  hint: 'Apply one reflection at a time and write the point down between them.',
  feedback: 'Stopping after the first reflection leaves the across value negative.',
});

mkc('6.11', 'point-behind-a-reflection-distance', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'orderedPairs',
  prompt: 'A point and its reflection across the vertical axis are ${{d}}$ apart, and the point sits at height $-{{q}}$ in Quadrant III. What is the point?',
  generator: {
    parameters: {
      h: { type: 'int', min: 2, max: 16 },
      q: { type: 'int', min: 2, max: 18 },
    },
    derived: { d: '2*h' },
    constraints: ['h!=q', 'h*2!=q'],
  },
  choices: [
    { label: plain('(-{{h}}, -{{q}})'), correct: true },
    { label: plain('(-{{d}}, -{{q}})'), error: 'forgotFinalStep' },
    { label: plain('({{h}}, -{{q}})'), error: 'signError' },
    { label: plain('(-{{q}}, -{{h}})'), error: 'ratioReversed' },
  ],
  reasoning: ['Reflecting across the vertical axis moves a point twice its distance from that axis.', 'So the across value is $-{{d}} \\div 2 = -{{h}}$.'],
  answerSummary: { headline: 'The separation is double the distance to the axis.', text: 'The point is $(-{{h}}, -{{q}})$.' },
  hint: 'Half the separation is how far the point sits from the vertical axis.',
  feedback: 'Quadrant III means both coordinates are negative.',
});

mkc('6.11', 'point-farther-from-one-axis-than-the-other', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'Which listed point sits farther from the horizontal axis than from the vertical axis?',
  stimulus: {
    kind: 'table',
    columns: ['Point'],
    rows: [['$({{x1}}, -{{y1}})$'], ['$(-{{x2}}, {{y2}})$'], ['$({{x3}}, {{y3}})$'], ['$(-{{x4}}, -{{y4}})$']],
  },
  generator: {
    parameters: {
      x1: { type: 'int', min: 2, max: 9 },
      g1: { type: 'int', min: 3, max: 12 },
      y2: { type: 'int', min: 2, max: 9 },
      g2: { type: 'int', min: 3, max: 12 },
      y3: { type: 'int', min: 2, max: 9 },
      g3: { type: 'int', min: 3, max: 12 },
      y4: { type: 'int', min: 2, max: 9 },
      g4: { type: 'int', min: 3, max: 12 },
    },
    derived: {
      y1: 'x1+g1',
      x2: 'y2+g2',
      x3: 'y3+g3',
      x4: 'y4+g4',
    },
    constraints: ['g1>2', 'g2>2', 'g3>2', 'g4>2'],
  },
  choices: [
    { label: plain('({{x1}}, -{{y1}})'), correct: true },
    { label: plain('(-{{x2}}, {{y2}})'), error: 'ratioReversed' },
    { label: plain('({{x3}}, {{y3}})'), error: 'signError' },
    { label: plain('(-{{x4}}, -{{y4}})'), error: 'usedGivenValue' },
  ],
  reasoning: ['Distance from the horizontal axis is the size of the height; from the vertical axis it is the size of the across value.', 'Only $({{x1}}, -{{y1}})$ has the larger height.'],
  answerSummary: { headline: 'Compare the sizes of the coordinates, not their signs.', text: 'It is $({{x1}}, -{{y1}})$.' },
  hint: 'Ignore the signs and compare the two numbers in each pair.',
  feedback: 'A negative coordinate is not farther from an axis for being negative.',
});

// ================================================================ 6.8A
// Angle relationships in triangles.

mkc('6.8A', 'third-angle-from-two-described-angles', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'In a triangle the second angle is ${{k}}$ times the first, and the third is ${{d}}^\\circ$ more than the first. What is the third angle?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 5 },
      x: { type: 'int', min: 15, max: 45 },
    },
    derived: {
      d: '180-(k+2)*x',
      answer: 'x+d',
      // Answered the first angle.
      d_partialTotal: 'x',
      // Answered the second angle.
      d_operationInverted: 'k*x',
      // Subtracted one angle from the total and stopped.
      d_signError: '180-x',
    },
    constraints: ['180-(k+2)*x>6', 'abs(k*x-x-180+(k+2)*x)>3', 'x>14', 'abs(180-x-x-180+(k+2)*x)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['The three angles are $x$, ${{k}}x$ and $x + {{d}}$, and they total $180^\\circ$.', 'That gives $x = {{x}}$, so the third is ${{answer}}^\\circ$.'],
  answerSummary: { headline: 'Write every angle in terms of one unknown before adding.', text: 'It is ${{answer}}^\\circ$.' },
  hint: 'Collect the three expressions and set the total to $180$.',
  feedback: 'Solving for the first angle is only part of the work.',
});

mkc('6.8A', 'larger-of-two-angles-from-their-difference', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: 'Two angles of a triangle differ by ${{g}}^\\circ$ and the third measures ${{c}}^\\circ$. What is the larger of the other two?',
  generator: {
    parameters: {
      c: { type: 'int', min: 20, max: 90 },
      g: { type: 'int', min: 4, max: 30 },
    },
    derived: {
      answer: '(180-c+g)/2',
      // Split the remainder evenly and ignored the difference.
      d_forgotFinalStep: '(180-c)/2',
      // Answered the whole remainder.
      d_usedGivenValue: '180-c',
      // Added the two given measures instead of using them.
      d_operationInverted: 'c+g',
    },
    constraints: ['(180-c+g)%2==0', '180-c-g>20', 'abs(c+g-(180-c+g)/2)>3', 'g>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['The other two angles total $180 - {{c}}$ and differ by ${{g}}$.', 'The larger is half their total plus half their difference, or ${{answer}}^\\circ$.'],
  answerSummary: { headline: 'A total and a difference together fix both values.', text: 'The larger is ${{answer}}^\\circ$.' },
  hint: 'Half the sum sits midway between the two angles.',
  feedback: 'Splitting the remainder evenly assumes the two angles are equal.',
});

mkc('6.8A', 'angle-set-with-no-equal-sides', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'verbal',
  prompt: 'Which set of three angles belongs to a triangle whose sides are all different lengths?',
  generator: {
    parameters: {
      a: { type: 'int', min: 30, max: 70 },
      b: { type: 'int', min: 20, max: 60 },
      e: { type: 'int', min: 25, max: 75 },
      f: { type: 'int', min: 3, max: 20 },
    },
    derived: {
      c: '180-a-b',
      twin: '180-2*e',
      offSum: '180-a-b+f',
      short: '180-a-b-f',
    },
    constraints: ['180-a-b>20', 'a!=b', '180-a-b!=a', '180-a-b!=b', '180-2*e>20', 'f>2', '180-a-b-f>10'],
  },
  choices: [
    { label: '${{a}}^\\circ$, ${{b}}^\\circ$, ${{c}}^\\circ$', correct: true },
    { label: '${{e}}^\\circ$, ${{e}}^\\circ$, ${{twin}}^\\circ$', error: 'partialTotal' },
    { label: '${{a}}^\\circ$, ${{b}}^\\circ$, ${{offSum}}^\\circ$', error: 'arithmeticSlip' },
    { label: '${{a}}^\\circ$, ${{b}}^\\circ$, ${{short}}^\\circ$', error: 'signError' },
  ],
  reasoning: ['The three angles must total $180^\\circ$, which rules out two of the sets.', 'Equal angles force equal sides, which rules out the pair of ${{e}}^\\circ$ angles.'],
  answerSummary: { headline: 'Sides are all different exactly when the angles are all different.', text: 'It is ${{a}}^\\circ$, ${{b}}^\\circ$, ${{c}}^\\circ$.' },
  hint: 'Check the total first, then look for repeated angles.',
  feedback: 'A set that totals $180^\\circ$ can still describe a triangle with two equal sides.',
});

// ================================================================ 6.8B
// Area of triangles and parallelograms by decomposition.

mkc('6.8B', 'area-left-after-a-triangle-is-removed', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'A parallelogram of base ${{b}}$ cm and a triangle of base ${{b2}}$ cm share a height of ${{h}}$ cm. How much larger is the parallelogram?',
  generator: {
    parameters: {
      b: { type: 'int', min: 6, max: 24 },
      b2: { type: 'int', min: 4, max: 40, step: 2 },
      h: { type: 'int', min: 3, max: 14 },
    },
    derived: {
      answer: 'b*h-b2*h/2',
      // Took the whole rectangle off instead of half of it.
      d_forgotFinalStep: 'b*h-b2*h',
      // Added the two areas instead of comparing them.
      d_operationInverted: 'b*h+b2*h/2',
      // Answered the triangle's area on its own.
      d_partialTotal: 'b2*h/2',
    },
    constraints: ['b*h-b2*h/2>4', 'abs(b*h-b2*h-b*h+b2*h/2)>3', 'abs(b2*h-b*h)>3', 'b2<2*b'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['The parallelogram covers ${{b}} \\times {{h}}$ and the triangle covers half of ${{b2}} \\times {{h}}$.', 'The difference is ${{answer}}$ square centimetres.'],
  answerSummary: { headline: 'A triangle covers half the rectangle on the same base and height.', text: 'It is ${{answer}}$ square centimetres larger.' },
  hint: 'Work out both areas before comparing them.',
  feedback: 'Using the full ${{b2}} \\times {{h}}$ counts the triangle twice over.',
});

mkc('6.8B', 'base-behind-a-joined-pair-of-triangles', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: 'Two identical triangles of height ${{h}}$ cm join into a parallelogram of area ${{A}}$ square cm. What is each triangle\'s base?',
  generator: {
    parameters: {
      h: { type: 'int', min: 3, max: 24 },
      base: { type: 'int', min: 4, max: 20 },
    },
    derived: {
      A: 'base*h',
      answer: 'base',
      // Halved the area a second time.
      d_operationInverted: 'A/(2*h)',
      // Doubled the base as well as the area.
      d_forgotFinalStep: '2*A/h',
      // Answered the height that was given.
      d_usedGivenValue: 'h',
    },
    constraints: ['base%2==0', 'abs(base-h)>3', 'base>5', 'abs(base-base/2)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The parallelogram has the same base as each triangle and the same height.', 'So the base is ${{A}} \\div {{h}} = {{answer}}$ cm.'],
  answerSummary: { headline: 'Joining the two triangles doubles the area, not the base.', text: 'Each base is ${{answer}}$ cm.' },
  hint: 'The two triangles sit side by side along the height, not along the base.',
  feedback: 'The halving is already accounted for once the pair is joined.',
});

mkc('6.8B', 'claim-linking-two-shapes-that-share-a-base', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal',
  prompt: 'A parallelogram and a triangle share a base of ${{b}}$ cm and a height of ${{h}}$ cm. Which statement is wrong?',
  generator: {
    parameters: {
      b: { type: 'int', min: 4, max: 24 },
      h: { type: 'int', min: 3, max: 18 },
    },
    constraints: ['b!=h'],
  },
  choices: [
    { label: 'Doubling the triangle\'s height doubles the parallelogram\'s area.', correct: true },
    { label: 'The triangle covers half of what the parallelogram covers.', error: 'ratioReversed' },
    { label: 'Doubling the shared base doubles both areas.', error: 'usedGivenValue' },
    { label: 'Cutting the parallelogram along a diagonal gives two triangles of that area.', error: 'incompleteFactoring' },
  ],
  reasoning: ['The two shapes are separate; changing one leaves the other alone.', 'Only a change to the shared base or shared height reaches both.'],
  answerSummary: { headline: 'Sharing a measurement is not the same as being linked.', text: 'The claim about the triangle\'s height is wrong.' },
  hint: 'Ask which measurements the two shapes genuinely have in common.',
  feedback: 'The half-area relationship does hold whenever the base and height match.',
});

// ================================================================ 6.7B
// Expressions and equations, and what each one lets you do.

mkc('6.7B', 'evaluate-a-grouped-expression-then-reduce', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'What is $\\frac{{{a}}x + {{b}}}{{{c}}} - {{d}}$ when $x = {{v}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      v: { type: 'int', min: 2, max: 12 },
      c: { type: 'int', min: 2, max: 9 },
      u: { type: 'int', min: 8, max: 40 },
      d: { type: 'int', min: 2, max: 30 },
    },
    derived: {
      b: 'c*u-a*v',
      answer: 'u-d',
      // Stopped after the division.
      d_forgotFinalStep: 'u',
      // Answered the amount that was taken off.
      d_usedGivenValue: 'd',
      // Took the difference the other way round.
      d_signError: 'd-u',
    },
    constraints: ['c*u-a*v>0', 'u-d>4', 'abs(2*d-u)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['At $x = {{v}}$ the numerator is ${{a}} \\times {{v}} + {{b}}$, which divides by ${{c}}$ to give ${{u}}$.', 'Taking ${{d}}$ off leaves ${{answer}}$.'],
  answerSummary: { headline: 'The fraction bar groups the whole numerator.', text: 'It is ${{answer}}$.' },
  hint: 'Substitute first, then divide, then subtract.',
  feedback: 'The subtraction sits outside the fraction, so it comes last.',
});

mkc('6.7B', 'which-line-can-be-solved-for-a-value', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'verbal',
  prompt: 'Which line can be solved for $x$ and has ${{v}}$ as its solution?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 3, max: 40 },
      v: { type: 'int', min: 2, max: 20 },
      off: { type: 'int', min: 3, max: 20 },
    },
    derived: { t: 'a*v+b', t2: 'a*v+b+off' },
    constraints: ['off>2'],
  },
  choices: [
    { label: plain('{{a}}x + {{b}} = {{t}}'), correct: true },
    { label: plain('{{a}}x + {{b}}'), error: 'usedGivenValue' },
    { label: plain('{{a}}x + {{b}} = {{t2}}'), error: 'operationInverted' },
    { label: plain('{{a}}x - {{b}}'), error: 'partialTotal' },
  ],
  reasoning: ['Only a line with an equals sign states a condition that $x$ can satisfy.', 'Of the two equations, ${{a}} \\times {{v}} + {{b}}$ comes to ${{t}}$.'],
  answerSummary: { headline: 'An expression names a value; an equation makes a claim.', text: 'It is ${{a}}x + {{b}} = {{t}}$.' },
  hint: 'Rule out the lines with nothing to satisfy, then test the rest.',
  feedback: 'An expression alone has no solution to find.',
});

mkc('6.7B', 'calling-an-evaluation-a-solution', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'Asked for the value of ${{a}}x + {{b}}$ at $x = {{v}}$, a student answers "$x = {{res}}$". What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 3, max: 40 },
      v: { type: 'int', min: 2, max: 20 },
    },
    derived: { res: 'a*v+b' },
    constraints: ['a>1'],
  },
  choices: [
    { label: 'The result is the value of the expression, not a new value of $x$.', correct: true },
    { label: 'The value ${{v}}$ belongs in place of ${{b}}$.', error: 'usedGivenValue' },
    { label: 'The expression cannot be evaluated without an equals sign.', error: 'operationInverted' },
    { label: 'The addition should be carried out before the multiplication.', error: 'orderOfOperations' },
  ],
  reasoning: ['$x$ was already fixed at ${{v}}$, so it cannot also be ${{res}}$.', 'The number ${{res}}$ is what the expression comes to.'],
  answerSummary: { headline: 'Evaluating answers with a value, not with a new $x$.', text: 'The answer was labelled as $x$ by mistake.' },
  hint: 'Ask what ${{res}}$ actually measures.',
  feedback: 'The arithmetic is right; it is the label on the answer that is wrong.',
});

// ================================================================ 6.7C
// Equivalent expressions and the distributive property.

mkc('6.7C', 'expanding-across-a-subtraction', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Simplify ${{a}}(x + {{b}}) - {{c}}(x - {{d}})$.',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 12 },
      b: { type: 'int', min: 2, max: 12 },
      c: { type: 'int', min: 2, max: 9 },
      d: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      coef: 'a-c',
      con: 'a*b+c*d',
      conBad: 'a*b-c*d',
      coefBad: 'a+c',
      conFlat: 'b+d',
    },
    constraints: ['a>c', 'a*b-c*d!=a*b+c*d', 'b+d!=a*b+c*d', 'b+d!=a*b-c*d', 'a-c>1'],
  },
  choices: [
    { label: plain('{{coef}}x + {{con}}'), correct: true },
    { label: plain('{{coef}}x + {{conBad}}'), error: 'signError' },
    { label: plain('{{coefBad}}x + {{con}}'), error: 'operationInverted' },
    { label: plain('{{coef}}x + {{conFlat}}'), error: 'incompleteFactoring' },
  ],
  reasoning: ['The first bracket gives ${{a}}x + {{a}} \\times {{b}}$ and the second takes off ${{c}}x - {{c}} \\times {{d}}$.', 'Combining leaves ${{coef}}x + {{con}}$.'],
  answerSummary: { headline: 'The minus sign reaches both terms inside the bracket.', text: 'It is ${{coef}}x + {{con}}$.' },
  hint: 'Expand each bracket separately before combining.',
  feedback: 'Subtracting $-{{c}} \\times {{d}}$ adds, so the constant grows.',
});

mkc('6.7C', 'constant-behind-a-simplified-pair', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: '${{a}}(x + b) + (x - {{cd}})$ simplifies to ${{coef}}x + {{k}}$. What is $b$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 7 },
      j: { type: 'int', min: 1, max: 6 },
      b: { type: 'int', min: 4, max: 22 },
    },
    derived: {
      cd: 'a*j',
      coef: 'a+1',
      k: 'a*b-a*j',
      // Divided the constant by the coefficient and stopped.
      d_forgotFinalStep: 'b-j',
      // Answered the simplified constant.
      d_usedGivenValue: 'k',
      // Answered the constant inside the second bracket.
      d_ratioReversed: 'cd',
    },
    constraints: ['b>j+3', 'abs(a*j-b)>3', 'abs(k-b)>3', 'k>2'],
  },
  choices: [
    { label: plain('{{b}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['Expanding gives $({{a}}+1)x + {{a}}b - {{cd}}$.', 'Setting ${{a}}b - {{cd}} = {{k}}$ gives $b = {{b}}$.'],
  answerSummary: { headline: 'Match the constant terms once both brackets are expanded.', text: '$b = {{b}}$.' },
  hint: 'Only the first bracket contributes ${{a}}$ copies of $b$.',
  feedback: 'The simplified constant still has ${{cd}}$ subtracted from it.',
});

mkc('6.7C', 'what-a-table-of-values-settles', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'The table evaluates $E$ and $F$ at three inputs. What does it show?',
  stimulus: {
    kind: 'table',
    columns: ['x', 'E', 'F'],
    rows: [['{{x1}}', '{{e1}}', '{{e1}}'], ['{{x2}}', '{{e2}}', '{{e2}}'], ['{{x3}}', '{{e3}}', '{{f3}}']],
  },
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 2, max: 20 },
      x1: { type: 'int', min: 1, max: 4 },
      x2: { type: 'int', min: 5, max: 9 },
      x3: { type: 'int', min: 10, max: 16 },
      off: { type: 'int', min: 3, max: 15 },
    },
    derived: {
      e1: 'k*x1+c',
      e2: 'k*x2+c',
      e3: 'k*x3+c',
      f3: 'k*x3+c+off',
    },
    constraints: ['off>2'],
  },
  choices: [
    { label: 'They are not equivalent, because they part company at ${{x3}}$.', correct: true },
    { label: 'They are equivalent, because they agree at ${{x1}}$ and ${{x2}}$.', error: 'partialTotal' },
    { label: 'They are equivalent for positive inputs only.', error: 'usedGivenValue' },
    { label: 'Neither expression can be simplified any further.', error: 'operationInverted' },
  ],
  reasoning: ['Equivalent expressions agree at every input, not merely at some.', 'One disagreement is enough to settle it.'],
  answerSummary: { headline: 'Agreement on a few inputs proves nothing; one disagreement proves a lot.', text: 'They are not equivalent.' },
  hint: 'Look for a row where the two columns differ.',
  feedback: 'Two matching rows leave every other input untested.',
});

// ================================================================ 6.7D
// Properties of operations: regrouping, distributing, factoring.

mkc('6.7D', 'subtracting-a-bracket-and-collecting', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Simplify ${{a}} - ({{b}}x - {{c}}) + {{d}}x$.',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 30 },
      b: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 2, max: 20 },
      d: { type: 'int', min: 3, max: 14 },
    },
    derived: {
      coef: 'd-b',
      con: 'a+c',
      coefBad: 'd+b',
      conBad: 'a-c',
    },
    constraints: ['d>b', 'd-b>1', 'a>c', 'a-c>1'],
  },
  choices: [
    { label: plain('{{coef}}x + {{con}}'), correct: true },
    { label: plain('{{coefBad}}x + {{conBad}}'), error: 'signError' },
    { label: plain('{{coef}}x + {{conBad}}'), error: 'partialTotal' },
    { label: plain('{{coefBad}}x + {{con}}'), error: 'operationInverted' },
  ],
  reasoning: ['The minus in front of the bracket flips both terms, giving $-{{b}}x + {{c}}$.', 'Collecting leaves ${{coef}}x + {{con}}$.'],
  answerSummary: { headline: 'A minus outside a bracket changes every sign inside it.', text: 'It is ${{coef}}x + {{con}}$.' },
  hint: 'Rewrite the bracket with its signs changed before collecting.',
  feedback: 'Changing only the $x$ term leaves the constant with the wrong sign.',
});

mkc('6.7D', 'largest-common-factor-of-a-pair', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: 'The expression ${{k}}x + {{c}}$ factors as $g({{p}}x + {{q}})$ with $g$ as large as possible. What is $g$?',
  generator: {
    parameters: {
      g: { type: 'int', min: 4, max: 20 },
      p: { type: 'int', min: 2, max: 7 },
      q: { type: 'int', min: 3, max: 24 },
    },
    derived: {
      k: 'g*p',
      c: 'g*q',
      answer: 'g',
      // Answered the coefficient left inside the bracket.
      d_forgotFinalStep: 'p',
      // Answered the constant left inside the bracket.
      d_partialTotal: 'q',
      // Answered the coefficient that was factored.
      d_usedGivenValue: 'k',
    },
    constraints: ['gcd(p,q)==1', 'abs(g-q)>3', 'abs(g-p)>2', 'g*p!=g'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['${{k}}$ and ${{c}}$ share the factor ${{g}}$, and what is left inside shares nothing further.', 'So $g = {{answer}}$.'],
  answerSummary: { headline: 'The largest common factor leaves a bracket with nothing left to take out.', text: '$g = {{answer}}$.' },
  hint: 'Check that the two numbers inside the bracket share no factor.',
  feedback: 'A factor that leaves a common factor behind was not the largest one.',
});

mkc('6.7D', 'row-that-misuses-a-property', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'table',
  prompt: 'Three rows rewrite an expression correctly and one does not. Which row is wrong?',
  stimulus: {
    kind: 'table',
    columns: ['Row', 'Rewritten as'],
    rows: [
      ['$1$', '${{a}} + (x + {{b}}) = ({{a}} + x) + {{b}}$'],
      ['$2$', '${{a}}(x + {{b}}) = {{a}}x + {{ab}}$'],
      ['$3$', '${{a}} \\times ({{b}} \\times x) = ({{a}} \\times {{b}}) \\times ({{a}} \\times x)$'],
      ['$4$', '${{a}}x + {{b}}x = ({{a}} + {{b}})x$'],
    ],
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 12 },
    },
    derived: { ab: 'a*b' },
    constraints: ['a!=b', 'a>1'],
  },
  choices: [
    { label: 'Row $3$', correct: true },
    { label: 'Row $1$', error: 'orderOfOperations' },
    { label: 'Row $2$', error: 'incompleteFactoring' },
    { label: 'Row $4$', error: 'operationInverted' },
  ],
  reasoning: ['Multiplication distributes over addition, not over another multiplication.', 'Row $3$ multiplies by ${{a}}$ twice, so it is ${{a}}$ times too large.'],
  answerSummary: { headline: 'Distributing works across a sum, never across a product.', text: 'Row $3$ is wrong.' },
  hint: 'Try each rewrite with a small value of $x$.',
  feedback: 'Regrouping a sum and collecting like terms are both sound.',
});

// ================================================================ 6.8C
// Equations that describe area and volume.

mkc('6.8C', 'equation-for-a-missing-parallel-edge', {
  difficultyBand: 4, dok: 2, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'A trapezoid with parallel edges ${{a}}$ and $b$ units and height ${{h}}$ units covers ${{A}}$ square units. Which equation gives $b$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 20 },
      b: { type: 'int', min: 4, max: 24 },
      h: { type: 'int', min: 2, max: 16, step: 2 },
    },
    derived: { A: '(a+b)*h/2' },
    constraints: ['a!=b', 'A>6'],
  },
  choices: [
    { label: plain('\\frac{({{a}} + b) \\times {{h}}}{2} = {{A}}'), correct: true },
    { label: plain('({{a}} + b) \\times {{h}} = {{A}}'), error: 'forgotFinalStep' },
    { label: plain('\\frac{{{a}} \\times b \\times {{h}}}{2} = {{A}}'), error: 'operationInverted' },
    { label: plain('\\frac{{{a}} + b}{2 \\times {{h}}} = {{A}}'), error: 'ratioReversed' },
  ],
  reasoning: ['A trapezoid covers the average of its parallel edges times its height.', 'That is $\\frac{({{a}} + b) \\times {{h}}}{2}$, and it equals ${{A}}$.'],
  answerSummary: { headline: 'Average the parallel edges before multiplying by the height.', text: 'It is $\\frac{({{a}} + b) \\times {{h}}}{2} = {{A}}$.' },
  hint: 'Ask what the halving is being applied to.',
  feedback: 'The two parallel edges are added, not multiplied.',
});

mkc('6.8C', 'equation-linking-two-shapes-of-equal-area', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: 'A triangle and a rectangle share a base of ${{b}}$ units and cover the same area, and the rectangle is ${{h}}$ units tall. Which equation gives height $t$?',
  generator: {
    parameters: {
      b: { type: 'int', min: 3, max: 20 },
      h: { type: 'int', min: 2, max: 15 },
    },
    constraints: ['b!=h'],
  },
  choices: [
    { label: plain('\\frac{{{b}}t}{2} = {{b}} \\times {{h}}'), correct: true },
    { label: plain('{{b}}t = {{b}} \\times {{h}}'), error: 'forgotFinalStep' },
    { label: plain('\\frac{{{b}}t}{2} = \\frac{{{b}} \\times {{h}}}{2}'), error: 'operationInverted' },
    { label: plain('\\frac{{{b}} + t}{2} = {{b}} \\times {{h}}'), error: 'ratioReversed' },
  ],
  reasoning: ['The triangle covers $\\frac{{{b}}t}{2}$ and the rectangle covers ${{b}} \\times {{h}}$.', 'Equal areas means those two expressions are equal.'],
  answerSummary: { headline: 'Only the triangle carries the halving.', text: 'It is $\\frac{{{b}}t}{2} = {{b}} \\times {{h}}$.' },
  hint: 'Write each area separately before setting them equal.',
  feedback: 'Halving both sides leaves the two shapes with the same formula, which they do not have.',
});

mkc('6.8C', 'trapezoid-formula-without-the-halving', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal',
  prompt: 'For a trapezoid of parallel edges ${{a}}$ and ${{b}}$ and height ${{h}}$ a student writes $A = ({{a}} + {{b}}) \\times {{h}}$. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 20 },
      b: { type: 'int', min: 4, max: 24 },
      h: { type: 'int', min: 2, max: 14 },
    },
    constraints: ['a!=b'],
  },
  choices: [
    { label: 'The sum of the parallel edges has to be halved.', correct: true },
    { label: 'The two parallel edges should be multiplied, not added.', error: 'operationInverted' },
    { label: 'The height should be halved rather than used whole.', error: 'ratioReversed' },
    { label: 'The slanted edges belong in the formula too.', error: 'usedGivenValue' },
  ],
  reasoning: ['A trapezoid covers the average of its parallel edges times its height.', 'Without the halving the answer is twice the true area.'],
  answerSummary: { headline: 'The average of the edges, not their total, multiplies the height.', text: 'The halving is missing.' },
  hint: 'Compare the formula with a rectangle whose two edges are equal.',
  feedback: 'Halving the height instead would give the same number here, but not the right reason.',
});

// ================================================================ 6.8D
// Solving area and volume problems.

mkc('6.8D', 'how-much-more-the-second-plate-covers', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'table',
  prompt: 'The table lists two trapezoidal plates. How much more does the second cover?',
  stimulus: {
    kind: 'table',
    columns: ['Plate', 'Parallel edges (cm)', 'Height (cm)'],
    rows: [['first', '${{a1}}$ and ${{b1}}$', '${{h1}}$'], ['second', '${{a2}}$ and ${{b2}}$', '${{h2}}$']],
  },
  generator: {
    parameters: {
      a1: { type: 'int', min: 3, max: 16 },
      b1: { type: 'int', min: 4, max: 20 },
      h1: { type: 'int', min: 2, max: 12, step: 2 },
      a2: { type: 'int', min: 3, max: 16 },
      b2: { type: 'int', min: 4, max: 20 },
      h2: { type: 'int', min: 2, max: 12, step: 2 },
    },
    derived: {
      A1: '(a1+b1)*h1/2',
      A2: '(a2+b2)*h2/2',
      answer: 'A2-A1',
      // Never halved either plate.
      d_forgotFinalStep: '(a2+b2)*h2-(a1+b1)*h1',
      // Answered the first plate\'s area.
      d_partialTotal: 'A1',
      // Compared the two the other way round.
      d_signError: 'A1-A2',
    },
    constraints: ['A2-A1>4', 'abs(A2-2*A1)>4', 'A1>5'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['The first plate covers ${{A1}}$ and the second covers ${{A2}}$ square centimetres.', 'The difference is ${{answer}}$.'],
  answerSummary: { headline: 'Work out each area in full before comparing.', text: 'It covers ${{answer}}$ square centimetres more.' },
  hint: 'Average each pair of parallel edges before multiplying.',
  feedback: 'Leaving the halving out doubles both areas and so doubles the gap.',
});

mkc('6.8D', 'second-base-from-a-combined-area', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: 'Two triangles of height ${{h}}$ units, one with base ${{b1}}$, together cover ${{A}}$ square units. What is the other base?',
  generator: {
    parameters: {
      h: { type: 'int', min: 4, max: 36 },
      b1: { type: 'int', min: 3, max: 24 },
      b2: { type: 'int', min: 3, max: 26 },
    },
    derived: {
      A: 'h*(b1+b2)/2',
      answer: 'b2',
      // Never took the given base off the total.
      d_operationInverted: 'b1+b2',
      // Answered the average of the two bases.
      d_ratioReversed: '(b1+b2)/2',
      // Answered the height that was given.
      d_usedGivenValue: 'h',
    },
    constraints: ['(b1+b2)%2==0', 'b2-b1>3', 'b1>4', 'abs(h-b2)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Together the two triangles cover $\\frac{{{h}}({{b1}} + b_2)}{2}$, which is ${{A}}$.', 'So ${{b1}} + b_2 = {{b1}}+{{b2}}$, leaving $b_2 = {{answer}}$.'],
  answerSummary: { headline: 'The shared height lets both triangles be handled as one.', text: 'The other base is ${{answer}}$.' },
  hint: 'Two triangles of the same height combine into one with the total base.',
  feedback: 'The total of the bases still has the given one to come off.',
});

mkc('6.8D', 'halving-then-doubling-a-plate', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'verbal',
  prompt: 'A parallelogram plate of base ${{b}}$ cm and height ${{h}}$ cm is cut along a diagonal, and one half has its height doubled. How does its area compare?',
  generator: {
    parameters: {
      b: { type: 'int', min: 4, max: 24 },
      h: { type: 'int', min: 3, max: 18 },
    },
    derived: { full: 'b*h', half: 'b*h/2' },
    constraints: ['b*h%2==0', 'b!=h'],
  },
  choices: [
    { label: 'It matches the original plate.', correct: true },
    { label: 'It is half of the original plate.', error: 'partialTotal' },
    { label: 'It is twice the original plate.', error: 'operationInverted' },
    { label: 'It is four times the original plate.', error: 'exponentError' },
  ],
  reasoning: ['The diagonal leaves a triangle covering half of ${{b}} \\times {{h}}$.', 'Doubling its height doubles that half, which brings it back to ${{full}}$.'],
  answerSummary: { headline: 'Halving and then doubling cancel out.', text: 'It matches the original.' },
  hint: 'Work out the half first, then apply the doubling to it.',
  feedback: 'Doubling the height doubles the area once, not twice.',
});

// ================================================================ 7.2
// The sets rational numbers belong to.

mkc('7.2', 'property-of-integers-alone', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal',
  prompt: 'Which statement holds for every integer but not for every rational number?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 20 },
      d: { type: 'int', min: 3, max: 9 },
    },
    derived: { half: 'a' },
    constraints: ['d>2'],
  },
  choices: [
    { label: 'Written as a decimal it has nothing after the point.', correct: true },
    { label: 'It can be written as one integer over another.', error: 'usedGivenValue' },
    { label: 'It has a definite place on the number line.', error: 'partialTotal' },
    { label: 'It may be negative.', error: 'signError' },
  ],
  reasoning: ['Every integer is a rational number, so the shared properties cannot separate them.', 'Only $\\frac{1}{{{d}}}$ and its kind carry something after the decimal point.'],
  answerSummary: { headline: 'Look for what the wider set allows that the narrower one does not.', text: 'Integers have no decimal part.' },
  hint: 'Test each claim on $\\frac{1}{{{d}}}$.',
  feedback: 'Being placeable on the number line is true of every rational number.',
});

mkc('7.2', 'value-fitting-three-conditions', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: 'A number is rational, negative, and not an integer. Which could it be?',
  generator: {
    parameters: {
      n: { type: 'int', min: 2, max: 11 },
      d: { type: 'int', min: 3, max: 13 },
      a: { type: 'int', min: 2, max: 20 },
      p: { type: 'int', min: 2, max: 20 },
    },
    constraints: ['gcd(n,d)==1', 'n<d', 'p!=4', 'p!=9', 'p!=16'],
  },
  choices: [
    { label: plain('-\\frac{{{n}}}{{{d}}}'), correct: true },
    { label: plain('-{{a}}'), error: 'usedGivenValue' },
    { label: plain('\\frac{{{n}}}{{{d}}}'), error: 'signError' },
    { label: plain('-\\sqrt{{{p}}}'), error: 'operationInverted' },
  ],
  reasoning: ['$-{{a}}$ is an integer and $\\frac{{{n}}}{{{d}}}$ is positive, so neither fits.', '$-\\sqrt{{{p}}}$ is not rational, which leaves $-\\frac{{{n}}}{{{d}}}$.'],
  answerSummary: { headline: 'Each condition rules out one of thechoices.', text: 'It is $-\\frac{{{n}}}{{{d}}}$.' },
  hint: 'Apply the three conditions one at a time.',
  feedback: 'A square root of a non-square is irrational, so it is not rational at all.',
});

mkc('7.2', 'row-that-sorts-a-value-wrongly', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'table',
  prompt: 'Each row claims the smallest set a value belongs to. Which row is wrong?',
  stimulus: {
    kind: 'table',
    columns: ['Row', 'Value', 'Smallest set claimed'],
    rows: [
      ['$1$', '${{w}}$', 'whole numbers'],
      ['$2$', '$-{{a}}$', 'integers'],
      ['$3$', '$\\frac{{{n}}}{{{d}}}$', 'integers'],
      ['$4$', '$-\\frac{{{n}}}{{{d}}}$', 'rational numbers'],
    ],
  },
  generator: {
    parameters: {
      w: { type: 'int', min: 1, max: 30 },
      a: { type: 'int', min: 2, max: 20 },
      n: { type: 'int', min: 2, max: 11 },
      d: { type: 'int', min: 3, max: 13 },
    },
    constraints: ['gcd(n,d)==1', 'n<d'],
  },
  choices: [
    { label: 'Row $3$', correct: true },
    { label: 'Row $1$', error: 'usedGivenValue' },
    { label: 'Row $2$', error: 'signError' },
    { label: 'Row $4$', error: 'partialTotal' },
  ],
  reasoning: ['$\\frac{{{n}}}{{{d}}}$ is not a whole number of units, so it is not an integer.', 'The smallest set it belongs to is the rational numbers.'],
  answerSummary: { headline: 'A fraction in lowest terms with a denominator above one is never an integer.', text: 'Row $3$ is wrong.' },
  hint: 'Ask whether each value could be written without a fraction bar.',
  feedback: 'A negative whole number really is an integer, so that row is sound.',
});

// ================================================================ 7.3A
// Adding, subtracting, multiplying and dividing rational numbers.

mkc('7.3A', 'sum-across-unlike-denominators', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic',
  prompt: 'Work out $-\\frac{{{a}}}{{{d}}} + \\frac{{{b}}}{{{e}}}$.',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 11 },
      d: { type: 'int', min: 3, max: 9 },
      b: { type: 'int', min: 2, max: 11 },
      e: { type: 'int', min: 3, max: 9 },
    },
    derived: {
      den0: 'd*e',
      raw: 'b*d-a*e',
      negRaw: 'a*e-b*d',
      swap: 'b*e-a*d',
      flat: 'b-a',
      flatDen: 'd+e',
    },
    constraints: ['d!=e', 'gcd(abs(b*d-a*e),d*e)==1', 'b*d-a*e!=0', 'b*e-a*d!=b*d-a*e', 'b*e-a*d!=a*e-b*d'],
  },
  choices: [
    { label: plain('\\frac{{{raw}}}{{{den0}}}'), correct: true },
    { label: plain('\\frac{{{negRaw}}}{{{den0}}}'), error: 'signError' },
    { label: plain('\\frac{{{swap}}}{{{den0}}}'), error: 'ratioReversed' },
    { label: plain('\\frac{{{flat}}}{{{flatDen}}}'), error: 'operationInverted' },
  ],
  reasoning: ['Over the common denominator ${{den0}}$ the two parts are $-{{a}} \\times {{e}}$ and ${{b}} \\times {{d}}$.', 'Their total is ${{raw}}$.'],
  answerSummary: { headline: 'Each numerator is scaled by the other denominator.', text: 'It is $\\frac{{{raw}}}{{{den0}}}$.' },
  hint: 'Rewrite both fractions over ${{d}} \\times {{e}}$ first.',
  feedback: 'Adding the denominators changes the size of every part.',
});

mkc('7.3A', 'number-behind-a-negative-fraction-product', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: 'Multiplying a number by $-\\frac{{{a}}}{{{b}}}$ gives ${{v}}$. What is the number?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 14 },
      b: { type: 'int', min: 3, max: 13 },
      t: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      v: '0-a*t',
      answer: 'b*t',
      // Multiplied by the fraction instead of by its reciprocal.
      d_operationInverted: 'a*b*t',
      // Used the fraction the right way up but the wrong way round.
      d_ratioReversed: 'a*t',
      // Answered the product that was given.
      d_usedGivenValue: 'v',
    },
    constraints: ['gcd(a,b)==1', 'abs(a*t-b*t)>3', 'b*t>8'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Undoing the multiplication means multiplying ${{v}}$ by $-\\frac{{{b}}}{{{a}}}$.', 'That gives ${{answer}}$.'],
  answerSummary: { headline: 'The reciprocal carries the negative sign with it.', text: 'The number is ${{answer}}$.' },
  hint: 'Two negatives make the answer positive here.',
  feedback: 'Multiplying by the same fraction again moves the value further from where it started.',
});

mkc('7.3A', 'which-calculation-lands-highest', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'Which of the listed calculations has the greatest value?',
  stimulus: {
    kind: 'table',
    columns: ['Calculation'],
    rows: [
      ['$-\\frac{{{a}}}{{{b}}} \\div {{c}}$'],
      ['$-\\frac{{{a}}}{{{b}}} \\times {{c}}$'],
      ['$-\\frac{{{a}}}{{{b}}} - {{c}}$'],
      ['$-\\frac{{{a}}}{{{b}}} \\times {{c}} \\times {{c}}$'],
    ],
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 11 },
      b: { type: 'int', min: 3, max: 12 },
      c: { type: 'int', min: 2, max: 9 },
    },
    constraints: ['gcd(a,b)==1', 'c>1'],
  },
  choices: [
    { label: plain('-\\frac{{{a}}}{{{b}}} \\div {{c}}'), correct: true },
    { label: plain('-\\frac{{{a}}}{{{b}}} \\times {{c}}'), error: 'operationInverted' },
    { label: plain('-\\frac{{{a}}}{{{b}}} - {{c}}'), error: 'signError' },
    { label: plain('-\\frac{{{a}}}{{{b}}} \\times {{c}} \\times {{c}}'), error: 'exponentError' },
  ],
  reasoning: ['Every calculation is negative, so the greatest is the one closest to zero.', 'Dividing by ${{c}}$ shrinks the size of $-\\frac{{{a}}}{{{b}}}$; the others enlarge it.'],
  answerSummary: { headline: 'Among negatives, smaller size means greater value.', text: 'It is $-\\frac{{{a}}}{{{b}}} \\div {{c}}$.' },
  hint: 'Ask which result sits nearest zero.',
  feedback: 'Multiplying a negative by a number above one drives it further down.',
});

// ================================================================ 7.4A
// Constant rates and proportional relationships.

mkc('7.4A', 'average-rate-across-two-stretches', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'table',
  prompt: 'The table records one machine working at two rates. What was its average rate?',
  stimulus: {
    kind: 'table',
    columns: ['Stretch', 'Crates an hour', 'Hours'],
    rows: [['first', '${{a}}$', '${{t1}}$'], ['second', '${{b}}$', '${{t2}}$']],
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 4, max: 20 },
      b: { type: 'int', min: 6, max: 34 },
      t1: { type: 'int', min: 2, max: 9 },
      t2: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      answer: '(a*t1+b*t2)/(t1+t2)',
      // Averaged the two rates without weighting them.
      d_forgotFinalStep: '(a+b)/2',
      // Answered the total number of crates.
      d_partialTotal: 'a*t1+b*t2',
      // Answered the first rate.
      d_usedGivenValue: 'a',
    },
    constraints: ['a<b', '(a+b)%2==0', '(a*t1+b*t2)%(t1+t2)==0', 't1!=t2', 'abs((a+b)/2-(a*t1+b*t2)/(t1+t2))>2'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['In all it makes ${{a}} \\times {{t1}} + {{b}} \\times {{t2}}$ crates over ${{t1}}+{{t2}}$ hours.', 'That is ${{answer}}$ an hour.'],
  answerSummary: { headline: 'An average rate divides the total by the total time.', text: 'It averaged ${{answer}}$ an hour.' },
  hint: 'Total the output and the time separately.',
  feedback: 'Averaging the two rates ignores how long each one lasted.',
});

mkc('7.4A', 'time-for-a-faster-machine', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: 'A machine fills ${{n}}$ crates in ${{t}}$ hours. How long does a machine ${{k}}$ times as fast take to fill ${{m}}$ crates?',
  generator: {
    parameters: {
      n: { type: 'int', min: 3, max: 12 },
      t: { type: 'int', min: 2, max: 8 },
      k: { type: 'int', min: 3, max: 8 },
      z: { type: 'int', min: 2, max: 8 },
    },
    derived: {
      m: 'k*n*z',
      answer: 't*z',
      // Never applied the speed multiplier.
      d_forgotFinalStep: 'k*t*z',
      // Answered the time the first machine took.
      d_usedGivenValue: 't',
      // Divided by the hours instead of multiplying.
      d_ratioReversed: 'k*z',
    },
    constraints: ['t*z>7', 'abs(k*z-t*z)>3', 'abs(t*z-t)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['The faster machine fills ${{k}} \\times {{n}}$ crates an hour\'s worth of the original in the same time.', '${{m}}$ crates therefore take ${{answer}}$ hours.'],
  answerSummary: { headline: 'Scale the rate first, then divide the new total by it.', text: 'It takes ${{answer}}$ hours.' },
  hint: 'Work out what the faster machine does in ${{t}}$ hours.',
  feedback: 'A machine ${{k}}$ times as fast needs less time, not more.',
});

mkc('7.4A', 'claim-about-two-machines-together', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal',
  prompt: 'One machine fills ${{a}}$ crates an hour and another fills ${{b}}$. Which statement about the pair is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 4, max: 20 },
      b: { type: 'int', min: 6, max: 34 },
    },
    derived: { sum: 'a+b' },
    constraints: ['a<b'],
  },
  choices: [
    { label: 'For a fixed order the pair takes the average of their two separate times.', correct: true },
    { label: 'Working together they fill ${{sum}}$ crates an hour.', error: 'partialTotal' },
    { label: 'The pair finishes a fixed order sooner than either machine alone.', error: 'usedGivenValue' },
    { label: 'Doubling both rates halves the time for a fixed order.', error: 'ratioReversed' },
  ],
  reasoning: ['Rates add, so the pair works at ${{sum}}$ an hour and finishes faster than either alone.', 'Times do not average; the combined time is shorter than both.'],
  answerSummary: { headline: 'Rates add; times do not.', text: 'The claim about averaging the times is wrong.' },
  hint: 'Compare the pair\'s time with the faster machine\'s time.',
  feedback: 'The combined rate really is the total of the two.',
});

// ---------------------------------------------------------------- emit
const seen = new Set();
for (const item of ITEMS) {
  if (seen.has(item.id)) throw new Error(`Duplicate ASVAB challenge id: ${item.id}`);
  seen.add(item.id);
}

// Against the direct tier as well as against itself. familyId is what
// repeat-avoidance and mastery attribution key on, so a challenge family sharing
// one with a direct family would make answering it count as having seen the
// other. Three Arithmetic Reasoning families hit exactly that before this check
// existed.
const direct = JSON.parse(readFileSync(new URL('../drafts/asvab-mk.json', import.meta.url), 'utf8')).documents;
const directIds = new Set(direct.map((item) => item.id));
const directFamilies = new Set(direct.map((item) => item.familyId));
for (const item of ITEMS) {
  if (directIds.has(item.id)) throw new Error(`Challenge id collides with a direct family: ${item.id}`);
  if (directFamilies.has(item.familyId)) throw new Error(`Challenge familyId collides with a direct family: ${item.familyId}`);
}

assertChallengeVariety(ITEMS);
writeFileSync(new URL('../drafts/asvab-mk-challenge.json', import.meta.url), `${JSON.stringify({ documents: ITEMS }, null, 1)}\n`);
console.log(`Mathematics Knowledge challenge: ${ITEMS.length} families across ${new Set(ITEMS.map((i) => i.assessedConstruct)).size} standards.`);
