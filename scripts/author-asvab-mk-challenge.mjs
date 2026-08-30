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
      k: { type: 'int', min: 1, max: 3 },
      u1: { type: 'int', min: 1, max: 4 },
      u2: { type: 'int', min: 1, max: 4 },
    },
    derived: {
      t1: '2*u1',
      t2: '2*u2',
      m: 'a+2*k*u2',
      b: 'a+2*k*(u1+u2)',
      answer: 'a+2*k*u2',
      // Averaged the two rates without weighting them by the hours.
      d_forgotFinalStep: 'a+2*k*u2+k*(u1-u2)',
      // Answered the total number of crates.
      d_partialTotal: '2*(a+2*k*u2)*(u1+u2)',
      // Answered the first rate.
      d_usedGivenValue: 'a',
    },
    constraints: ['u1!=u2', 'abs(k*(u1-u2))>2', 'abs(2*(a+2*k*u2)*(u1+u2)-a-2*k*u2-k*(u1-u2))>2', 'abs(2*(a+2*k*u2)*(u1+u2)-a)>2'],
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

// ================================================================ 7.5A
// Similar figures and the factor that links them.

mkc('7.5A', 'perimeter-after-a-fractional-scaling', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade7',
  prompt: 'A rectangle ${{a}}$ by ${{b}}$ cm is scaled by a factor of $\\frac{{{k}}}{{{m}}}$. What is its new perimeter?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 6 },
      u: { type: 'int', min: 3, max: 15 },
      k: { type: 'int', min: 2, max: 7 },
      a: { type: 'int', min: 3, max: 30 },
    },
    derived: {
      b: 'm*u-a',
      answer: '2*u*k',
      // Scaled up but never divided back down.
      d_forgotFinalStep: '2*m*u*k',
      // Scaled one length and one width, not two of each.
      d_partialTotal: 'u*k',
      // Answered the perimeter it started with.
      d_usedGivenValue: '2*m*u',
    },
    constraints: ['m*u-a>2', 'a>2', 'k!=m', 'abs(m-k)>0', '2*u*k>9', 'abs(2*m*u-2*u*k)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The original perimeter is $2({{a}} + {{b}})$, which is $2 \\times {{m}} \\times {{u}}$.', 'Scaling by $\\frac{{{k}}}{{{m}}}$ leaves ${{answer}}$.'],
  answerSummary: { headline: 'Perimeter scales by the same factor as each length.', text: 'It is ${{answer}}$ cm.' },
  hint: 'Total the four sides first, then apply the factor once.',
  feedback: 'Scaling up without scaling back down applies only half the factor.',
});

mkc('7.5A', 'matching-side-from-two-areas', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade7',
  prompt: 'Similar triangles cover ${{A}}$ and ${{A2}}$ square cm, and the smaller has a side of ${{s}}$ cm. What is the matching side?',
  generator: {
    parameters: {
      A: { type: 'int', min: 8, max: 60 },
      k: { type: 'int', min: 2, max: 9 },
      s: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      A2: 'A*k*k',
      answer: 's*k',
      // Scaled the side by the area factor.
      d_exponentError: 's*k*k',
      // Answered the side that was given.
      d_usedGivenValue: 's',
      // Answered the area factor rather than a length.
      d_ratioReversed: 'k*k',
    },
    constraints: ['s*k>7', 'abs(k*k-s*k)>3', 'abs(s*k-s)>3', 'A<4*s*s', 'A>s*s/2'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_exponentError}}'), error: 'exponentError' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['The areas are in the ratio ${{k}}^{2}$, so the lengths are in the ratio ${{k}}$.', 'The matching side is ${{s}} \\times {{k}} = {{answer}}$ cm.'],
  answerSummary: { headline: 'Areas scale by the square of the length factor.', text: 'It is ${{answer}}$ cm.' },
  hint: 'Take the square root of the area ratio before touching the side.',
  feedback: 'The area factor is too large to apply to a length.',
});

mkc('7.5A', 'pair-that-must-be-similar', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'grade7',
  prompt: 'Which pair of triangles must be similar?',
  generator: {
    parameters: {
      a: { type: 'int', min: 25, max: 75 },
      b: { type: 'int', min: 20, max: 70 },
      s: { type: 'int', min: 3, max: 25 },
    },
    constraints: ['a+b<170', 'a!=b'],
  },
  choices: [
    { label: 'Both have an angle of ${{a}}^\\circ$ and an angle of ${{b}}^\\circ$.', correct: true },
    { label: 'Both cover the same area.', error: 'usedGivenValue' },
    { label: 'Both have a side of ${{s}}$ cm.', error: 'partialTotal' },
    { label: 'Both have a right angle.', error: 'incompleteFactoring' },
  ],
  reasoning: ['Two matching angles fix the third, so the triangles have the same shape.', 'Equal areas, one equal side or one equal angle leave the shape free to differ.'],
  answerSummary: { headline: 'Two pairs of equal angles are enough for similarity.', text: 'The pair sharing ${{a}}^\\circ$ and ${{b}}^\\circ$.' },
  hint: 'Ask which condition fixes every angle.',
  feedback: 'A single shared right angle still leaves the other two angles free.',
});

// ================================================================ 7.5B
// Pi as the ratio of circumference to diameter.

mkc('7.5B', 'extra-roll-of-the-larger-wheel', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade7',
  prompt: 'Wheels have diameters ${{d}}$ and ${{d2}}$ cm. Taking $\\pi$ as $\\frac{22}{7}$, how much farther does the larger roll in one turn?',
  generator: {
    parameters: {
      u: { type: 'int', min: 2, max: 12 },
      v: { type: 'int', min: 4, max: 16 },
    },
    derived: {
      d: '7*u',
      d2: '7*v',
      answer: '22*(v-u)',
      // Added the two circumferences instead of comparing them.
      d_operationInverted: '22*(v+u)',
      // Answered the smaller wheel's circumference.
      d_partialTotal: '22*u',
      // Compared the diameters and left pi out.
      d_usedGivenValue: '7*(v-u)',
    },
    constraints: ['v>u', 'v-u>1', 'abs(u-(v-u))>1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Each circumference is $\\frac{22}{7}$ times its diameter, giving ${{answer}}+22 \\times {{u}}$ and $22 \\times {{u}}$.', 'The gap is ${{answer}}$ cm.'],
  answerSummary: { headline: 'One turn covers the circumference.', text: 'It rolls ${{answer}}$ cm farther.' },
  hint: 'The difference in circumference is $\\pi$ times the difference in diameter.',
  feedback: 'Comparing diameters alone leaves the factor of $\\pi$ out.',
});

mkc('7.5B', 'diameter-behind-a-measured-roll', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade7',
  prompt: 'A wheel rolls ${{L}}$ cm in ${{n}}$ full turns. Taking $\\pi$ as $\\frac{22}{7}$, what is its diameter?',
  generator: {
    parameters: {
      u: { type: 'int', min: 2, max: 12, step: 2 },
      n: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      L: '22*n*u',
      answer: '7*u',
      // Answered the distance covered in one turn.
      d_forgotFinalStep: '22*u',
      // Answered the radius.
      d_diameterForRadius: '7*u/2',
      // Multiplied by the turns where a division belonged.
      d_orderOfOperations: 'n*u',
    },
    constraints: ['abs(n*u-7*u)>3', 'abs(7-n)>1', '7*u>9'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_diameterForRadius}}'), error: 'diameterForRadius' },
    { label: plain('{{d_orderOfOperations}}'), error: 'orderOfOperations' },
  ],
  reasoning: ['One turn covers ${{L}} \\div {{n}}$ cm, which is the circumference.', 'Dividing that by $\\frac{22}{7}$ gives a diameter of ${{answer}}$ cm.'],
  answerSummary: { headline: 'Circumference first, diameter second.', text: 'The diameter is ${{answer}}$ cm.' },
  hint: 'Find how far one turn carries the wheel before touching $\\pi$.',
  feedback: 'The distance in one turn is the circumference, not the diameter.',
});

mkc('7.5B', 'row-that-measures-from-the-radius', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'table', courseId: 'grade7',
  prompt: 'Each row records how far a wheel rolls in one turn, with $\\pi$ as $\\frac{22}{7}$. Which row is wrong?',
  stimulus: {
    kind: 'table',
    columns: ['Row', 'Diameter (cm)', 'One turn (cm)'],
    rows: [
      ['$1$', '${{d1}}$', '${{c1}}$'],
      ['$2$', '${{d2}}$', '${{c2}}$'],
      ['$3$', '${{d3}}$', '${{cBad}}$'],
      ['$4$', '${{d4}}$', '${{c4}}$'],
    ],
  },
  generator: {
    parameters: {
      u1: { type: 'int', min: 1, max: 9 },
      u2: { type: 'int', min: 1, max: 9 },
      u3: { type: 'int', min: 2, max: 10, step: 2 },
      u4: { type: 'int', min: 1, max: 9 },
    },
    derived: {
      d1: '7*u1', c1: '22*u1',
      d2: '7*u2', c2: '22*u2',
      d3: '7*u3', cBad: '11*u3',
      d4: '7*u4', c4: '22*u4',
    },
    constraints: ['u1!=u2', 'u2!=u4', 'u1!=u4', 'u3>1'],
  },
  choices: [
    { label: 'Row $3$', correct: true },
    { label: 'Row $1$', error: 'usedGivenValue' },
    { label: 'Row $2$', error: 'diameterForRadius' },
    { label: 'Row $4$', error: 'operationInverted' },
  ],
  reasoning: ['One turn covers $\\frac{22}{7}$ times the diameter.', 'Row $3$ records $\\frac{22}{7}$ times the radius instead, which is half as far.'],
  answerSummary: { headline: '$\\pi$ multiplies the diameter, not the radius.', text: 'Row $3$ is wrong.' },
  hint: 'Divide each recorded distance by its diameter and see what you get.',
  feedback: 'The other rows all give $\\frac{22}{7}$ when divided through.',
});

// ================================================================ 7.5C
// Scale drawings, and how area behaves under scaling.

mkc('7.5C', 'real-perimeter-from-a-plan', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade7',
  prompt: 'A plan at $1$ cm to ${{s}}$ m shows a rectangle ${{c}}$ cm by ${{c2}}$ cm. What is its real perimeter in metres?',
  generator: {
    parameters: {
      s: { type: 'int', min: 2, max: 12 },
      c: { type: 'int', min: 2, max: 7 },
      c2: { type: 'int', min: 2, max: 7 },
    },
    derived: {
      answer: '2*s*(c+c2)',
      // Read the perimeter off the plan without scaling.
      d_forgotFinalStep: '2*(c+c2)',
      // Scaled as though a perimeter behaved like an area.
      d_exponentError: '2*s*s*(c+c2)',
      // Worked out an area instead of a perimeter.
      d_usedGivenValue: 's*c*c2',
    },
    constraints: ['c!=c2', 'abs(s*c*c2-2*s*(c+c2))>3', 's>1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_exponentError}}'), error: 'exponentError' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['On the plan the perimeter is $2({{c}} + {{c2}})$ cm.', 'Each centimetre stands for ${{s}}$ m, so the real perimeter is ${{answer}}$ m.'],
  answerSummary: { headline: 'A perimeter is a length, so it scales once.', text: 'It is ${{answer}}$ m.' },
  hint: 'Total the plan lengths first, then convert.',
  feedback: 'Squaring the scale belongs to areas, not to perimeters.',
});

mkc('7.5C', 'plan-area-behind-a-real-one', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade7',
  prompt: 'A plan is drawn at $1$ cm to ${{s}}$ m. A room of real area ${{A}}$ square metres covers what area on the plan?',
  generator: {
    parameters: {
      s: { type: 'int', min: 2, max: 7 },
      z: { type: 'int', min: 2, max: 8 },
    },
    derived: {
      A: 's*s*s*z',
      answer: 's*z',
      // Divided by the scale once instead of twice.
      d_exponentError: 's*s*z',
      // Answered the square of the scale.
      d_ratioReversed: 's*s',
      // Divided twice by the scale and once more by mistake.
      d_forgotFinalStep: 'z',
    },
    constraints: ['abs(s*s-s*z)>3', 's*z>7', 'abs(s*z-z)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_exponentError}}'), error: 'exponentError' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['One square centimetre on the plan stands for ${{s}}^{2}$ square metres.', 'So ${{A}}$ square metres cover ${{A}} \\div {{s}}^{2} = {{answer}}$ square centimetres.'],
  answerSummary: { headline: 'Area divides by the square of the scale.', text: 'It covers ${{answer}}$ square centimetres.' },
  hint: 'Work out what one square centimetre of plan represents.',
  feedback: 'Dividing by the scale once treats the area like a length.',
});

mkc('7.5C', 'claim-about-redrawing-at-half-scale', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'grade7',
  prompt: 'A plan of a ${{c}}$ cm by ${{c2}}$ cm rectangle is redrawn at half its scale. Which statement is wrong?',
  generator: {
    parameters: {
      c: { type: 'int', min: 4, max: 24, step: 2 },
      c2: { type: 'int', min: 4, max: 24, step: 2 },
    },
    constraints: ['c!=c2'],
  },
  choices: [
    { label: 'The area it covers is halved.', correct: true },
    { label: 'Every length on it is halved.', error: 'partialTotal' },
    { label: 'The area it covers is quartered.', error: 'exponentError' },
    { label: 'Its perimeter is halved.', error: 'ratioReversed' },
  ],
  reasoning: ['Halving both sides multiplies the area by $\\frac{1}{2} \\times \\frac{1}{2}$.', 'That is a quarter, not a half.'],
  answerSummary: { headline: 'Lengths halve; areas quarter.', text: 'The claim that the area halves is wrong.' },
  hint: 'Work out the new area from the two halved sides.',
  feedback: 'The perimeter really does halve, because it is a length.',
});

// ================================================================ 7.7
// Straight-line relationships between two quantities.

mkc('7.7', 'value-further-along-a-line', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade7',
  prompt: 'A line of slope ${{m}}$ passes through $({{x1}}, {{y1}})$. What is $y$ when $x = {{x2}}$?',
  generator: {
    parameters: {
      m: { type: 'int', min: 4, max: 20 },
      x1: { type: 'int', min: 2, max: 12 },
      y1: { type: 'int', min: 3, max: 80 },
      gap: { type: 'int', min: 2, max: 14 },
    },
    derived: {
      x2: 'x1+gap',
      answer: 'y1+m*gap',
      // Added the slope times the new input, not the change in input.
      d_orderOfOperations: 'y1+m*x2',
      // Left the point out and used the slope alone.
      d_usedGivenValue: 'm*x2',
      // Ran the change the wrong way.
      d_operationInverted: 'y1-m*gap',
    },
    constraints: ['abs(y1-m*x1)>3', 'y1-m*gap>0', 'abs(m*x2-y1-m*gap)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_orderOfOperations}}'), error: 'orderOfOperations' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['From ${{x1}}$ to ${{x2}}$ is a change of ${{gap}}$, and each step of $1$ raises $y$ by ${{m}}$.', 'So $y$ reaches ${{answer}}$.'],
  answerSummary: { headline: 'Slope multiplies the change in $x$, not $x$ itself.', text: '$y = {{answer}}$.' },
  hint: 'Find how far $x$ has moved before applying the slope.',
  feedback: 'Multiplying the slope by ${{x2}}$ measures from zero, not from the given point.',
});

mkc('7.7', 'value-at-zero-from-two-points', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade7',
  prompt: 'A line passes through $({{x1}}, {{y1}})$ and $({{xt}}, {{yt}})$. What is its value at $x = 0$?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 24 },
      x1: { type: 'int', min: 2, max: 12 },
      gap: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 4, max: 20 },
    },
    derived: {
      y1: 'm*x1+b',
      xt: 'x1+gap',
      yt: 'm*x1+m*gap+b',
      answer: 'b',
      // Answered the first output.
      d_usedGivenValue: 'y1',
      // Answered the slope.
      d_ratioReversed: 'm',
      // Worked back from the wrong point.
      d_operationInverted: 'y1-m*xt',
    },
    constraints: ['abs(b-m)>3', 'abs(y1-b)>3', 'abs(y1-m*xt-b)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['The slope is $\\frac{{{yt}} - {{y1}}}{{{xt}} - {{x1}}} = {{m}}$.', 'Working back ${{x1}}$ steps from $({{x1}}, {{y1}})$ gives ${{answer}}$.'],
  answerSummary: { headline: 'Find the slope, then walk back to zero.', text: 'It is ${{answer}}$.' },
  hint: 'The first point is ${{x1}}$ steps from the axis.',
  feedback: 'Stepping back from the second point needs the second point\'s own input.',
});

mkc('7.7', 'slope-written-upside-down', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal', courseId: 'grade7',
  prompt: 'From $({{x1}}, {{y1}})$ and $({{x2}}, {{y2}})$ a student writes the slope as $\\frac{{{x2}} - {{x1}}}{{{y2}} - {{y1}}}$. What is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      x1: { type: 'int', min: 1, max: 9 },
      gap: { type: 'int', min: 2, max: 10 },
      b: { type: 'int', min: 2, max: 30 },
    },
    derived: {
      y1: 'm*x1+b',
      x2: 'x1+gap',
      y2: 'm*x1+m*gap+b',
    },
    constraints: ['m>1', 'gap>1'],
  },
  choices: [
    { label: 'The change in $y$ belongs on top.', correct: true },
    { label: 'The two points were taken in the wrong order.', error: 'signError' },
    { label: 'A third point is needed before a slope can be found.', error: 'partialTotal' },
    { label: 'The two differences should be added, not divided.', error: 'operationInverted' },
  ],
  reasoning: ['Slope measures rise per unit of run, so the change in $y$ is the numerator.', 'Written this way the value is $\\frac{1}{{{m}}}$ rather than ${{m}}$.'],
  answerSummary: { headline: 'Rise over run, in that order.', text: 'The fraction is upside down.' },
  hint: 'Ask what the slope is meant to measure per unit.',
  feedback: 'Taking the points in the other order changes both signs and leaves the value unchanged.',
});

// ================================================================ 7.8A
// Pyramids and prisms that share a base and a height.

mkc('7.8A', 'extra-room-in-the-larger-pyramid', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade7',
  prompt: 'One pyramid has base ${{B}}$ square cm and height ${{h}}$ cm; another has base ${{B2}}$ and height ${{h2}}$. How much more does the second hold?',
  generator: {
    parameters: {
      B: { type: 'int', min: 6, max: 60, step: 3 },
      h: { type: 'int', min: 2, max: 14 },
      B2: { type: 'int', min: 6, max: 60, step: 3 },
      h2: { type: 'int', min: 2, max: 16 },
    },
    derived: {
      answer: '(B2*h2-B*h)/3',
      // Never divided either volume by three.
      d_forgotFinalStep: 'B2*h2-B*h',
      // Answered the first pyramid's volume.
      d_partialTotal: 'B*h/3',
      // Compared the two the other way round.
      d_signError: '(B*h-B2*h2)/3',
    },
    constraints: ['B2*h2-B*h>9', 'abs(B*h-(B2*h2-B*h))>6', 'B*h>9'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['A pyramid holds a third of base times height.', 'The two volumes are $\\frac{{{B}} \\times {{h}}}{3}$ and $\\frac{{{B2}} \\times {{h2}}}{3}$, a gap of ${{answer}}$.'],
  answerSummary: { headline: 'Thirding each volume before comparing keeps the units right.', text: 'It holds ${{answer}}$ cubic cm more.' },
  hint: 'Work out each volume in full first.',
  feedback: 'Comparing base times height leaves both volumes three times too large.',
});

mkc('7.8A', 'prism-height-from-a-shared-base', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade7',
  prompt: 'A pyramid ${{h}}$ cm tall holds ${{V}}$ cubic cm, and a prism on the same base holds ${{V2}}$. How tall is the prism?',
  generator: {
    parameters: {
      B: { type: 'int', min: 6, max: 60, step: 3 },
      h: { type: 'int', min: 3, max: 30 },
      z: { type: 'int', min: 2, max: 8 },
    },
    derived: {
      V: 'B*h/3',
      V2: 'B*3*z',
      answer: '3*z',
      // Answered the pyramid's height.
      d_usedGivenValue: 'h',
      // Applied the thirding the wrong way round.
      d_forgotFinalStep: '9*z',
      // Thirded a height that was already a prism height.
      d_operationInverted: 'z',
    },
    constraints: ['abs(h-3*z)>3', '3*z>5', 'B*h%3==0'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['The pyramid gives the base as $3 \\times {{V}} \\div {{h}}$ square cm.', 'Dividing ${{V2}}$ by that base leaves a height of ${{answer}}$ cm.'],
  answerSummary: { headline: 'Recover the shared base before touching the second solid.', text: 'The prism is ${{answer}}$ cm tall.' },
  hint: 'A pyramid holds a third of base times height.',
  feedback: 'A prism holds base times height with no thirding at all.',
});

mkc('7.8A', 'pyramid-three-times-as-tall', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'verbal', courseId: 'grade7',
  prompt: 'A pyramid and a prism share a base of ${{B}}$ square cm, and the pyramid is three times as tall. How do their volumes compare?',
  generator: {
    parameters: {
      B: { type: 'int', min: 6, max: 60, step: 3 },
      h: { type: 'int', min: 2, max: 16 },
    },
    derived: { prism: 'B*h', pyramid: 'B*3*h/3' },
    constraints: ['B>5'],
  },
  choices: [
    { label: 'They hold the same.', correct: true },
    { label: 'The pyramid holds three times as much.', error: 'operationInverted' },
    { label: 'The prism holds three times as much.', error: 'ratioReversed' },
    { label: 'The pyramid holds a third as much.', error: 'partialTotal' },
  ],
  reasoning: ['The pyramid holds a third of ${{B}} \\times 3{{h}}$, which is ${{B}} \\times {{h}}$.', 'That is exactly what the prism holds.'],
  answerSummary: { headline: 'Tripling the height cancels the thirding.', text: 'They hold the same.' },
  hint: 'Write both volumes in terms of the shared base.',
  feedback: 'The thirding applies to the pyramid only after its own height is used.',
});

// ================================================================ 7.8B
// Triangular prisms and pyramids.

mkc('7.8B', 'prism-against-a-shorter-pyramid', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade7',
  prompt: 'A triangular prism has end base ${{b}}$ cm, end height ${{ht}}$ cm and length ${{L}}$ cm. How much more does it hold than a pyramid on that end, ${{L2}}$ cm long?',
  generator: {
    parameters: {
      g: { type: 'int', min: 1, max: 12 },
      b: { type: 'int', min: 2, max: 12 },
      L: { type: 'int', min: 3, max: 18 },
      L2: { type: 'int', min: 2, max: 40 },
    },
    derived: {
      ht: '6*g/b',
      answer: 'g*(3*L-L2)',
      // Left the triangle's halving out of both solids.
      d_forgotFinalStep: '2*g*(3*L-L2)',
      // Answered the pyramid's volume.
      d_partialTotal: 'g*L2',
      // Treated the pyramid as a second prism.
      d_operationInverted: '3*g*(L-L2)',
    },
    constraints: ['6*g%b==0', '6*g/b>1', '3*L-L2>2', 'abs(L2-(3*L-L2))>2', 'g*(3*L-L2)>8'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['The end triangle covers $\\frac{{{b}} \\times {{ht}}}{2}$ square cm.', 'The prism holds that times ${{L}}$; the pyramid holds a third of it times ${{L2}}$, leaving ${{answer}}$.'],
  answerSummary: { headline: 'The triangle is halved once, and only the pyramid is thirded.', text: 'It holds ${{answer}}$ cubic cm more.' },
  hint: 'Work out the end area before either solid.',
  feedback: 'The pyramid holds a third of what a prism of the same length would.',
});

mkc('7.8B', 'end-height-from-a-known-prism', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade7',
  prompt: 'A triangular prism holds ${{V}}$ cubic cm, is ${{L}}$ cm long, and its end triangle has base ${{b}}$ cm. How tall is that triangle?',
  generator: {
    parameters: {
      b: { type: 'int', min: 3, max: 16 },
      L: { type: 'int', min: 2, max: 30 },
      z: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      ht: '2*z',
      V: 'b*z*L',
      answer: '2*z',
      // Left the triangle's halving out.
      d_forgotFinalStep: 'z',
      // Answered the length that was given.
      d_usedGivenValue: 'L',
      // Halved where a doubling belonged.
      d_exponentError: '4*z',
    },
    constraints: ['abs(L-2*z)>3', '2*z>5', 'abs(2*z-z)>2'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_exponentError}}'), error: 'exponentError' },
  ],
  reasoning: ['The end triangle covers ${{V}} \\div {{L}}$ square cm.', 'That area is half of ${{b}} \\times$ the height, so the height is ${{answer}}$ cm.'],
  answerSummary: { headline: 'Divide out the length, then undo the triangle\'s halving.', text: 'It is ${{answer}}$ cm tall.' },
  hint: 'Find the area of the end face first.',
  feedback: 'A triangle covers half its base times its height, so undoing it doubles.',
});

mkc('7.8B', 'stretching-a-prism-in-two-directions', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'grade7',
  prompt: 'A triangular prism has its end base doubled, its end height halved, and its length doubled. How does its volume change?',
  generator: {
    parameters: {
      b: { type: 'int', min: 4, max: 20, step: 2 },
      ht: { type: 'int', min: 4, max: 20, step: 2 },
      L: { type: 'int', min: 2, max: 16 },
    },
    derived: { before: 'b*ht*L/2', after: '2*b*ht/2*2*L/2' },
    constraints: ['b*ht%2==0'],
  },
  choices: [
    { label: 'It doubles.', correct: true },
    { label: 'It stays the same.', error: 'partialTotal' },
    { label: 'It is four times as much.', error: 'exponentError' },
    { label: 'It halves.', error: 'operationInverted' },
  ],
  reasoning: ['Doubling the base and halving the height leave the end triangle covering the same area.', 'Only the doubled length is left, so the volume doubles.'],
  answerSummary: { headline: 'Track each factor separately, then multiply them.', text: 'It doubles.' },
  hint: 'Deal with the end face before the length.',
  feedback: 'The two changes to the end face cancel; the length change does not.',
});

// ================================================================ 7.8C
// The area of a circle.

mkc('7.8C', 'extra-cover-of-the-larger-disc', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade7',
  prompt: 'Discs have radii ${{r}}$ and ${{r2}}$ cm. Taking $\\pi$ as $\\frac{22}{7}$, how much more does the larger cover?',
  generator: {
    parameters: {
      u: { type: 'int', min: 2, max: 8 },
      w: { type: 'int', min: 1, max: 3 },
    },
    derived: {
      v: 'u+w',
      r: '7*u',
      r2: '7*v',
      answer: '154*(v*v-u*u)',
      // Used the diameters in place of the radii.
      d_diameterForRadius: '616*(v*v-u*u)',
      // Answered the smaller disc's area.
      d_partialTotal: '154*u*u',
      // Compared the two the other way round.
      d_signError: '154*(u*u-v*v)',
    },
    constraints: ['w>0', 'abs(u*u-(v*v-u*u))>1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_diameterForRadius}}'), error: 'diameterForRadius' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['Each disc covers $\\frac{22}{7}r^{2}$, giving $154 \\times {{u}}^{2}$ and $154 \\times {{v}}^{2}$.', 'The difference is ${{answer}}$ square cm.'],
  answerSummary: { headline: 'Square each radius before multiplying by $\\pi$.', text: 'It covers ${{answer}}$ square cm more.' },
  hint: 'Work out each area separately.',
  feedback: 'Putting a diameter where a radius belongs makes every area four times too large.',
});

mkc('7.8C', 'circumference-expression-from-an-area', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade7',
  prompt: 'A disc covers ${{A}}$ square cm. Which expression gives its circumference?',
  generator: {
    parameters: {
      A: { type: 'int', min: 12, max: 400 },
    },
    constraints: ['A>10'],
  },
  choices: [
    { label: plain('2\\sqrt{\\pi \\times {{A}}}'), correct: true },
    { label: plain('\\sqrt{\\pi \\times {{A}}}'), error: 'diameterForRadius' },
    { label: plain('\\frac{2 \\times {{A}}}{\\pi}'), error: 'operationInverted' },
    { label: plain('2\\pi\\sqrt{{{A}}}'), error: 'exponentError' },
  ],
  reasoning: ['From $A = \\pi r^{2}$ the radius is $\\sqrt{\\frac{A}{\\pi}}$.', 'Its circumference is $2\\pi r$, which simplifies to $2\\sqrt{\\pi A}$.'],
  answerSummary: { headline: 'Recover the radius from the area before finding the circumference.', text: 'It is $2\\sqrt{\\pi \\times {{A}}}$.' },
  hint: 'Solve $A = \\pi r^{2}$ for $r$ first.',
  feedback: 'Leaving the square root off treats an area as though it were a length.',
});

mkc('7.8C', 'claim-about-discs-in-a-ratio', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'grade7',
  prompt: 'Two discs have radii in the ratio $1$ to ${{k}}$. Which statement is wrong?',
  generator: {
    parameters: { k: { type: 'int', min: 2, max: 9 } },
    derived: { k2: 'k*k' },
    constraints: ['k>1'],
  },
  choices: [
    { label: 'The larger disc covers ${{k}}$ times the area.', correct: true },
    { label: 'The larger disc has ${{k}}$ times the circumference.', error: 'partialTotal' },
    { label: 'The larger disc covers ${{k2}}$ times the area.', error: 'exponentError' },
    { label: 'Halving both radii leaves the ratio unchanged.', error: 'ratioReversed' },
  ],
  reasoning: ['Circumference is a length, so it scales by ${{k}}$.', 'Area carries the square, so it scales by ${{k2}}$.'],
  answerSummary: { headline: 'Lengths scale by the factor; areas scale by its square.', text: 'The claim about ${{k}}$ times the area is wrong.' },
  hint: 'Compare $\\pi r^{2}$ for the two radii.',
  feedback: 'Scaling both radii by the same amount really does leave the ratio alone.',
});

// ================================================================ 7.9A
// Volume of prisms and pyramids in use.

mkc('7.9A', 'cubes-that-fill-a-crate', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade7',
  prompt: 'A crate ${{l}}$ by ${{w}}$ by ${{h}}$ cm is packed with cubes of edge ${{e}}$ cm. How many cubes fit?',
  generator: {
    parameters: {
      e: { type: 'int', min: 2, max: 8 },
      p: { type: 'int', min: 2, max: 8 },
      q: { type: 'int', min: 2, max: 8 },
      r: { type: 'int', min: 2, max: 8 },
    },
    derived: {
      l: 'e*p',
      w: 'e*q',
      h: 'e*r',
      answer: 'p*q*r',
      // Divided the crate's volume by the cube's edge, not its volume.
      d_exponentError: 'e*e*p*q*r',
      // Counted only one layer.
      d_partialTotal: 'p*q',
      // Answered the volume of one cube.
      d_orderOfOperations: 'e*e*e',
    },
    constraints: ['abs(e*e*e-p*q*r)>3', 'p*q*r>9', 'abs(p*q-p*q*r)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_exponentError}}'), error: 'exponentError' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_orderOfOperations}}'), error: 'orderOfOperations' },
  ],
  reasoning: ['Along each edge the crate takes ${{p}}$, ${{q}}$ and ${{r}}$ cubes.', 'That is ${{answer}}$ cubes in all.'],
  answerSummary: { headline: 'Count cubes along each edge, then multiply.', text: 'It takes ${{answer}}$ cubes.' },
  hint: 'Divide each edge of the crate by ${{e}}$ first.',
  feedback: 'Dividing the crate volume by the edge leaves two dimensions unconverted.',
});

mkc('7.9A', 'height-of-a-rectangular-pyramid', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade7',
  prompt: 'A pyramid with a rectangular base ${{l}}$ by ${{w}}$ cm holds ${{V}}$ cubic cm. How tall is it?',
  generator: {
    parameters: {
      l: { type: 'int', min: 3, max: 34 },
      w: { type: 'int', min: 2, max: 18 },
      z: { type: 'int', min: 2, max: 10 },
    },
    derived: {
      V: 'l*w*z',
      answer: '3*z',
      // Never undid the thirding.
      d_forgotFinalStep: 'z',
      // Answered a base edge.
      d_usedGivenValue: 'l',
      // Applied the factor of three twice.
      d_operationInverted: '9*z',
    },
    constraints: ['abs(l-3*z)>3', '3*z>5', 'abs(3*z-z)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['A pyramid holds a third of base times height, so ${{V}} = \\frac{{{l}} \\times {{w}} \\times h}{3}$.', 'That gives $h = {{answer}}$ cm.'],
  answerSummary: { headline: 'Undo the thirding before dividing by the base.', text: 'It is ${{answer}}$ cm tall.' },
  hint: 'Multiply the volume by three first.',
  feedback: 'Dividing the volume by the base alone gives a prism height, not a pyramid one.',
});

mkc('7.9A', 'change-that-leaves-a-crate-holding-the-same', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'grade7',
  prompt: 'A crate measures ${{l}}$ by ${{w}}$ by ${{h}}$ cm. Which change leaves its volume unchanged?',
  generator: {
    parameters: {
      l: { type: 'int', min: 4, max: 30, step: 2 },
      w: { type: 'int', min: 4, max: 24, step: 2 },
      h: { type: 'int', min: 3, max: 20 },
    },
    derived: { V: 'l*w*h' },
    constraints: ['l!=w'],
  },
  choices: [
    { label: 'Doubling the length and halving the width.', correct: true },
    { label: 'Doubling the length and the width.', error: 'operationInverted' },
    { label: 'Halving the length and the width.', error: 'partialTotal' },
    { label: 'Doubling every edge.', error: 'exponentError' },
  ],
  reasoning: ['Volume is the product of the three edges, so a factor of $2$ and a factor of $\\frac{1}{2}$ cancel.', 'Every other change alters the product.'],
  answerSummary: { headline: 'Volume changes by the product of the factors applied.', text: 'Doubling the length and halving the width.' },
  hint: 'Multiply the three factors together and look for $1$.',
  feedback: 'Doubling every edge multiplies the volume by eight.',
});

// ================================================================ 7.9B
// Circumference and area of circles.

mkc('7.9B', 'laps-round-a-circular-track', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade7',
  prompt: 'A circular track has radius ${{r}}$ cm. Taking $\\pi$ as $\\frac{22}{7}$, how many full laps cover ${{D}}$ cm?',
  generator: {
    parameters: {
      u: { type: 'int', min: 2, max: 26 },
      z: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      r: '7*u',
      D: '88*u*z',
      answer: '2*z',
      // Divided by half the circumference.
      d_forgotFinalStep: '4*z',
      // Treated the radius as the diameter.
      d_diameterForRadius: 'z',
      // Answered the radius in sevenths.
      d_usedGivenValue: 'u',
    },
    constraints: ['abs(u-2*z)>3', '2*z>5', 'abs(2*z-z)>2'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_diameterForRadius}}'), error: 'diameterForRadius' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['One lap is $2 \\times \\frac{22}{7} \\times {{r}}$ cm, which is $44 \\times {{u}}$.', '${{D}}$ divided by that is ${{answer}}$ laps.'],
  answerSummary: { headline: 'A lap is the circumference, which uses twice the radius.', text: 'It is ${{answer}}$ laps.' },
  hint: 'Work out the distance round the track first.',
  feedback: 'Using the radius where the diameter belongs halves every lap.',
});

mkc('7.9B', 'square-left-uncovered-by-a-circle', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade7',
  prompt: 'A circle of circumference ${{C}}$ cm is drawn inside a square of side ${{s}}$ cm. Taking $\\pi$ as $\\frac{22}{7}$, how much of the square is uncovered?',
  generator: {
    parameters: {
      u: { type: 'int', min: 1, max: 6 },
      j: { type: 'int', min: 1, max: 7 },
    },
    derived: {
      C: '44*u',
      s: 'u*(14+j)',
      answer: 's*s-154*u*u',
      // Read the circumference over pi as the radius.
      d_diameterForRadius: 's*s-616*u*u',
      // Answered the whole square.
      d_forgotFinalStep: 's*s',
      // Answered the circle instead of what is left.
      d_partialTotal: '154*u*u',
    },
    constraints: ['s*s-154*u*u>8', 'abs(154*u*u-(s*s-154*u*u))>6'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_diameterForRadius}}'), error: 'diameterForRadius' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['A circumference of ${{C}}$ gives a radius of $7 \\times {{u}}$ cm, so the circle covers $154 \\times {{u}}^{2}$.', 'The square covers ${{s}}^{2}$, leaving ${{answer}}$ square cm.'],
  answerSummary: { headline: 'Circumference gives the radius; the radius gives the area.', text: '${{answer}}$ square cm are uncovered.' },
  hint: 'Divide the circumference by $2\\pi$, not by $\\pi$.',
  feedback: 'Dividing by $\\pi$ alone gives the diameter, which doubles the radius.',
});

mkc('7.9B', 'same-perimeter-different-shape', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'grade7',
  prompt: 'A circle and a square both have a perimeter of ${{P}}$ cm. Which statement is true?',
  generator: {
    parameters: { P: { type: 'int', min: 20, max: 200, step: 4 } },
    derived: { side: 'P/4' },
    constraints: ['P>16'],
  },
  choices: [
    { label: 'The circle encloses the greater area.', correct: true },
    { label: 'The square encloses the greater area.', error: 'ratioReversed' },
    { label: 'They enclose the same area.', error: 'usedGivenValue' },
    { label: 'The square encloses $\\pi$ times the area of the circle.', error: 'exponentError' },
  ],
  reasoning: ['For a fixed perimeter the circle encloses more than any polygon.', 'The square of side ${{side}}$ covers ${{side}}^{2}$, which falls short of the circle.'],
  answerSummary: { headline: 'For a fixed perimeter the circle is the most efficient shape.', text: 'The circle encloses more.' },
  hint: 'Work out both areas for a perimeter you can handle mentally.',
  feedback: 'Equal perimeters do not force equal areas.',
});

// ================================================================ 7.9C
// Composite figures.

mkc('7.9C', 'perimeter-of-a-notched-rectangle', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade7',
  prompt: 'A ${{a}}$ by ${{b}}$ cm rectangle has a ${{c}}$ by ${{d}}$ cm rectangle cut from one corner. What is the perimeter of what is left?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 7 },
      b: { type: 'int', min: 3, max: 6 },
      c: { type: 'int', min: 1, max: 6 },
      d: { type: 'int', min: 1, max: 5 },
    },
    derived: {
      answer: '2*(a+b)',
      // Took the notch's perimeter off.
      d_partialTotal: '2*(a+b)-2*(c+d)',
      // Added the notch's perimeter on.
      d_operationInverted: '2*(a+b)+2*(c+d)',
      // Answered the area that is left.
      d_usedGivenValue: 'a*b-c*d',
    },
    constraints: ['c<a', 'd<b', '2*(a+b)-2*(c+d)>4', 'abs(a*b-c*d-2*(a+b))>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The two edges the notch adds are exactly as long as the two it removes.', 'So the perimeter is still $2({{a}} + {{b}}) = {{answer}}$ cm.'],
  answerSummary: { headline: 'A corner notch changes the area but not the perimeter.', text: 'It is ${{answer}}$ cm.' },
  hint: 'Trace the outline and pair each new edge with the edge it replaced.',
  feedback: 'The notch removes area, not distance round the outside.',
});

mkc('7.9C', 'rectangle-height-inside-a-composite', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade7',
  prompt: 'A plate covering ${{A}}$ square cm is a rectangle ${{a}}$ cm wide topped by a triangle of the same width and height ${{h}}$ cm. How tall is the rectangle?',
  generator: {
    parameters: {
      a: { type: 'int', min: 4, max: 24 },
      h: { type: 'int', min: 2, max: 40, step: 2 },
      b: { type: 'int', min: 3, max: 30 },
    },
    derived: {
      A: 'a*b+a*h/2',
      answer: 'b',
      // Divided the whole area by the width.
      d_forgotFinalStep: 'b+h/2',
      // Answered the triangle's height.
      d_usedGivenValue: 'h',
      // Took the whole triangle off instead of half of it.
      d_operationInverted: 'b-h/2',
    },
    constraints: ['b-h/2>2', 'abs(h-b)>3', 'h>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['The triangle covers $\\frac{{{a}} \\times {{h}}}{2}$ square cm.', 'Taking that off ${{A}}$ and dividing by ${{a}}$ leaves ${{answer}}$ cm.'],
  answerSummary: { headline: 'Peel off the piece you can work out, then divide.', text: 'The rectangle is ${{answer}}$ cm tall.' },
  hint: 'Work out the triangle first; it needs no unknowns.',
  feedback: 'A triangle covers half its base times its height.',
});

mkc('7.9C', 'claim-about-a-corner-notch', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'grade7',
  prompt: 'A ${{a}}$ by ${{b}}$ cm rectangle has a small rectangle cut from one corner. Which statement is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 6, max: 40 },
      b: { type: 'int', min: 5, max: 30 },
    },
    constraints: ['a!=b'],
  },
  choices: [
    { label: 'Its perimeter falls by twice the width of the notch.', correct: true },
    { label: 'Its area falls by the area of the notch.', error: 'partialTotal' },
    { label: 'Its perimeter is unchanged.', error: 'usedGivenValue' },
    { label: 'The two edges the notch adds match the two it removes.', error: 'ratioReversed' },
  ],
  reasoning: ['Cutting a corner rectangle out pushes two edges inwards and adds two of the same lengths.', 'The distance round the outside is therefore unchanged.'],
  answerSummary: { headline: 'A corner notch trades edges of equal length.', text: 'The perimeter does not fall.' },
  hint: 'Walk round the new outline and compare it with the old one.',
  feedback: 'The area really does fall by exactly the notch.',
});

// ================================================================ 7.9D
// Surface area of prisms and pyramids.

mkc('7.9D', 'painting-every-face-but-the-base', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade7',
  prompt: 'A box ${{l}}$ by ${{w}}$ by ${{h}}$ cm is painted on every face except the base. What area is painted?',
  generator: {
    parameters: {
      l: { type: 'int', min: 2, max: 11 },
      w: { type: 'int', min: 2, max: 11 },
      h: { type: 'int', min: 2, max: 11 },
    },
    derived: {
      answer: '2*h*(l+w)+l*w',
      // Painted the sides and left the top out.
      d_forgotFinalStep: '2*h*(l+w)',
      // Painted the base as well.
      d_operationInverted: '2*(l*w+l*h+w*h)',
      // Answered the volume.
      d_usedGivenValue: 'l*w*h',
    },
    constraints: ['abs(l*w*h-2*h*(l+w)-l*w)>5', 'l!=w', 'h>1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The four sides cover $2 \\times {{h}} \\times ({{l}} + {{w}})$ square cm.', 'Adding the top of ${{l}} \\times {{w}}$ gives ${{answer}}$.'],
  answerSummary: { headline: 'Count the faces you actually need before adding.', text: 'It is ${{answer}}$ square cm.' },
  hint: 'The top and the base are the same size; only one is painted.',
  feedback: 'Total surface area counts both the top and the base.',
});

mkc('7.9D', 'height-from-a-total-surface', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade7',
  prompt: 'A box with a square base of side ${{s}}$ cm has total surface area ${{S}}$ square cm. How tall is it?',
  generator: {
    parameters: {
      s: { type: 'int', min: 2, max: 30, step: 2 },
      h: { type: 'int', min: 6, max: 30, step: 2 },
    },
    derived: {
      S: '2*s*s+4*s*h',
      answer: 'h',
      // Left one pair of side faces out.
      d_forgotFinalStep: '2*h',
      // Answered the side of the base.
      d_usedGivenValue: 's',
      // Divided the side area by eight sides rather than four.
      d_partialTotal: 'h/2',
    },
    constraints: ['abs(s-h)>3', 'h>5', 'h/2!=s'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['The two square faces cover $2 \\times {{s}}^{2}$, leaving $4 \\times {{s}} \\times h$ for the sides.', 'Dividing that by $4 \\times {{s}}$ gives $h = {{answer}}$ cm.'],
  answerSummary: { headline: 'Strip out both square faces before dividing.', text: 'It is ${{answer}}$ cm tall.' },
  hint: 'A box on a square base has two square faces, not one.',
  feedback: 'A box on a square base has four side faces, not eight.',
});

mkc('7.9D', 'what-doubling-the-height-reaches', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'verbal', courseId: 'grade7',
  prompt: 'A box ${{l}}$ by ${{w}}$ cm at the base has its height doubled. Which statement about its surface is true?',
  generator: {
    parameters: {
      l: { type: 'int', min: 3, max: 24 },
      w: { type: 'int', min: 2, max: 20 },
      h: { type: 'int', min: 2, max: 16 },
    },
    derived: { lateral: '2*h*(l+w)', total: '2*(l*w+l*h+w*h)' },
    constraints: ['l!=w'],
  },
  choices: [
    { label: 'The four sides double, but the total surface does not.', correct: true },
    { label: 'The total surface doubles.', error: 'operationInverted' },
    { label: 'The total surface is unchanged.', error: 'usedGivenValue' },
    { label: 'The total surface is four times as large.', error: 'exponentError' },
  ],
  reasoning: ['The four side faces all carry the height, so they double.', 'The top and the base do not change at all, so the total grows by less than double.'],
  answerSummary: { headline: 'Only the faces that carry the height respond to it.', text: 'The sides double; the total does not.' },
  hint: 'Split the surface into the faces that use the height and the faces that do not.',
  feedback: 'The top and base are fixed by the base measurements alone.',
});

// ================================================================ 7.10A
// Writing two-step equations and inequalities.

mkc('7.10A', 'inequality-for-a-budget-with-a-discount', {
  difficultyBand: 4, dok: 2, taskType: 'representationTranslation', representation: 'symbolic', courseId: 'grade7',
  prompt: 'A budget of $\\${{t}}$ must cover a $\\${{b}}$ fee and $\\${{m}}$ a day, less a $\\${{c}}$ discount. Which inequality gives the days $x$?',
  generator: {
    parameters: {
      t: { type: 'int', min: 60, max: 400 },
      b: { type: 'int', min: 10, max: 90 },
      m: { type: 'int', min: 5, max: 40 },
      c: { type: 'int', min: 5, max: 50 },
    },
    constraints: ['t>b+m', 'c<b'],
  },
  choices: [
    { label: plain('{{b}} + {{m}}x - {{c}} \\le {{t}}'), correct: true },
    { label: plain('{{b}} + {{m}}x + {{c}} \\le {{t}}'), error: 'signError' },
    { label: plain('{{b}} + {{m}}x - {{c}} \\ge {{t}}'), error: 'operationInverted' },
    { label: plain('({{b}} + {{m}})x - {{c}} \\le {{t}}'), error: 'orderOfOperations' },
  ],
  reasoning: ['The fee is paid once, the rate is paid per day, and the discount comes off the total.', 'Staying inside the budget means the total is at most ${{t}}$.'],
  answerSummary: { headline: 'A one-off charge sits outside the term that carries $x$.', text: 'It is ${{b}} + {{m}}x - {{c}} \\le {{t}}$.' },
  hint: 'Decide which charges depend on the number of days.',
  feedback: 'Bracketing the fee with the rate charges it every day.',
});

mkc('7.10A', 'situation-behind-a-two-step-equation', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'verbal', courseId: 'grade7',
  prompt: 'For which situation is ${{m}}x + {{b}} = {{t}}$ the right equation?',
  generator: {
    parameters: {
      m: { type: 'int', min: 5, max: 40 },
      b: { type: 'int', min: 10, max: 90 },
      t: { type: 'int', min: 80, max: 400 },
    },
    constraints: ['t>b+m', 'm!=b'],
  },
  choices: [
    { label: 'A hire costs $\\${{b}}$ plus $\\${{m}}$ a day and comes to $\\${{t}}$.', correct: true },
    { label: 'A hire costs $\\${{m}}$ plus $\\${{b}}$ a day and comes to $\\${{t}}$.', error: 'ratioReversed' },
    { label: 'A hire costs $\\${{m}}$ a day less a $\\${{b}}$ discount and comes to $\\${{t}}$.', error: 'signError' },
    { label: 'A hire costs $\\${{b}}$ a day for ${{m}}$ days and comes to $\\${{t}}$.', error: 'operationInverted' },
  ],
  reasoning: ['The term ${{m}}x$ charges ${{m}}$ for each of $x$ days.', 'The ${{b}}$ stands outside that term, so it is charged once and added.'],
  answerSummary: { headline: 'The coefficient is the repeated charge; the constant is the one-off.', text: '$\\${{b}}$ plus $\\${{m}}$ a day.' },
  hint: 'Ask which number is multiplied by the unknown.',
  feedback: 'Swapping the two numbers charges the fee daily and the rate once.',
});

mkc('7.10A', 'subtraction-written-back-to-front', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal', courseId: 'grade7',
  prompt: 'For "${{m}}$ less than ${{c}}$ times a number is ${{t}}$" a student writes ${{m}} - {{c}}x = {{t}}$. What is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 4, max: 40 },
      c: { type: 'int', min: 2, max: 12 },
      t: { type: 'int', min: 10, max: 120 },
    },
    constraints: ['m!=t', 'c>1'],
  },
  choices: [
    { label: 'The subtraction is written the wrong way round.', correct: true },
    { label: 'The multiplication should come after the subtraction.', error: 'orderOfOperations' },
    { label: 'The number should be divided by ${{c}}$, not multiplied.', error: 'operationInverted' },
    { label: 'The equation needs an inequality sign instead.', error: 'signError' },
  ],
  reasoning: ['"${{m}}$ less than" something means that something has ${{m}}$ taken off it.', 'The equation should read ${{c}}x - {{m}} = {{t}}$.'],
  answerSummary: { headline: '"Less than" reverses the order the words appear in.', text: 'The two terms are the wrong way round.' },
  hint: 'Ask which quantity is being reduced.',
  feedback: 'The multiplication is applied to the right quantity; it is the order of the subtraction that fails.',
});

// ================================================================ 7.10B
// Two-step solutions shown on a number line.

mkc('7.10B', 'distance-between-two-plotted-solutions', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade7',
  prompt: 'Solving ${{m}}x + {{b}} = {{t}}$ plots one dot and solving ${{n}}x = {{s}}$ plots another. How far apart are they?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      n: { type: 'int', min: 2, max: 9 },
      p: { type: 'int', min: 6, max: 40 },
      q: { type: 'int', min: 2, max: 30 },
      b: { type: 'int', min: 3, max: 40 },
    },
    derived: {
      t: 'm*p+b',
      s: 'n*q',
      answer: 'p-q',
      // Added the two solutions instead of comparing them.
      d_operationInverted: 'p+q',
      // Answered the second solution.
      d_usedGivenValue: 'q',
      // Compared them the other way round.
      d_signError: 'q-p',
    },
    constraints: ['p-q>4', 'abs(q-(p-q))>3', 'q>1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['The first equation gives $x = {{p}}$ and the second gives $x = {{q}}$.', 'The dots sit ${{answer}}$ apart.'],
  answerSummary: { headline: 'Solve each equation before measuring anything.', text: 'They are ${{answer}}$ apart.' },
  hint: 'Each equation puts exactly one dot on the line.',
  feedback: 'The gap between two points is a difference, not a total.',
});

mkc('7.10B', 'constant-behind-a-drawn-endpoint', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'numberLine', courseId: 'grade7',
  prompt: 'The shading runs left from an open dot at ${{c}}$. For which $b$ does $\\frac{x}{{{m}}} + b < {{t}}$ draw that?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      u: { type: 'int', min: 2, max: 52 },
      t: { type: 'int', min: 10, max: 60 },
    },
    derived: {
      c: 'm*u',
      answer: 't-u',
      // Answered the number on the right of the inequality.
      d_usedGivenValue: 't',
      // Took the endpoint off instead of the quotient.
      d_forgotFinalStep: 't-c',
      // Answered the quotient itself.
      d_ratioReversed: 'u',
    },
    constraints: ['t-u>4', 'abs(2*u-t)>3', 'abs(t-c-(t-u))>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['At the endpoint $\\frac{{{c}}}{{{m}}} + b = {{t}}$, and $\\frac{{{c}}}{{{m}}}$ is ${{u}}$.', 'So $b = {{t}} - {{u}} = {{answer}}$.'],
  answerSummary: { headline: 'The open dot marks where the two sides are equal.', text: '$b = {{answer}}$.' },
  hint: 'Put the endpoint into the inequality as an equation.',
  feedback: 'The endpoint has to be divided by ${{m}}$ before it is used.',
});

mkc('7.10B', 'values-two-conditions-leave-shaded', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'numberLine', courseId: 'grade7',
  prompt: 'Which values satisfy both ${{m}}x \\le {{t}}$ and $x \\ge {{lo}}$?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      hi: { type: 'int', min: 8, max: 50 },
      gap: { type: 'int', min: 3, max: 20 },
    },
    derived: {
      t: 'm*hi',
      lo: 'hi-gap',
    },
    constraints: ['hi-gap>1', 'gap>2'],
  },
  choices: [
    { label: 'Every value from ${{lo}}$ to ${{hi}}$, both included.', correct: true },
    { label: 'Every value from ${{lo}}$ to ${{hi}}$, with ${{hi}}$ left out.', error: 'offByOneStep' },
    { label: 'Every value above ${{lo}}$.', error: 'partialTotal' },
    { label: 'Every value below ${{hi}}$.', error: 'usedGivenValue' },
  ],
  reasoning: ['The first condition solves to $x \\le {{hi}}$ and the second is already $x \\ge {{lo}}$.', 'Both use $\\le$ or $\\ge$, so both endpoints count.'],
  answerSummary: { headline: 'Two conditions leave only the overlap.', text: 'From ${{lo}}$ to ${{hi}}$, both included.' },
  hint: 'Solve the first condition before comparing the two.',
  feedback: 'Keeping only one condition leaves values the other one rules out.',
});

// ================================================================ 7.11A
// Solving two-step equations and inequalities.

mkc('7.11A', 'solve-a-grouped-two-step-quotient', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade7',
  prompt: 'Solve $\\frac{{{m}}x - {{b}}}{{{c}}} = {{t}}$.',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 2, max: 9 },
      u: { type: 'int', min: 4, max: 20 },
      j: { type: 'int', min: 1, max: 8 },
    },
    derived: {
      t: 'm*u/c',
      b: 'm*j',
      answer: 'u+j',
      // Stopped at the numerator.
      d_forgotFinalStep: 'm*(u+j)',
      // Subtracted the constant instead of adding it back.
      d_operationInverted: 'u-j',
      // Answered the number on the right.
      d_usedGivenValue: 't',
    },
    constraints: ['m*u%c==0', 'u>j+2', 'abs(t-(u+j))>3', 'u+j>7'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Multiplying by ${{c}}$ gives ${{m}}x - {{b}} = {{c}} \\times {{t}}$.', 'Adding ${{b}}$ and dividing by ${{m}}$ leaves $x = {{answer}}$.'],
  answerSummary: { headline: 'Clear the denominator, restore the constant, then divide.', text: '$x = {{answer}}$.' },
  hint: 'The fraction bar groups both terms above it.',
  feedback: 'The numerator is not the answer; it still has ${{m}}$ multiplying $x$.',
});

mkc('7.11A', 'constant-that-makes-two-equations-agree', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade7',
  prompt: 'For which $b$ do ${{m}}x + b = {{t}}$ and ${{n}}x = {{s}}$ have the same solution?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      n: { type: 'int', min: 2, max: 9 },
      p: { type: 'int', min: 2, max: 26 },
      t: { type: 'int', min: 20, max: 200 },
    },
    derived: {
      s: 'n*p',
      answer: 't-m*p',
      // Answered the number on the right.
      d_usedGivenValue: 't',
      // Answered the part the first equation contributes.
      d_ratioReversed: 'm*p',
      // Took the difference the other way round.
      d_signError: 'm*p-t',
    },
    constraints: ['t-m*p>4', 'abs(t-2*m*p)>4', 'm*p>5'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['The second equation gives $x = {{p}}$.', 'Putting that into the first gives ${{m}} \\times {{p}} + b = {{t}}$, so $b = {{answer}}$.'],
  answerSummary: { headline: 'Solve the equation that has no unknown constant first.', text: '$b = {{answer}}$.' },
  hint: 'One of the two equations can be solved straight away.',
  feedback: 'The constant is what is left of ${{t}}$ once ${{m}}x$ is accounted for.',
});

mkc('7.11A', 'dividing-an-inequality-by-a-negative', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal', courseId: 'grade7',
  prompt: 'To solve $-{{m}}x + {{b}} > {{t}}$ a student divides by $-{{m}}$ and leaves the sign facing the same way. What is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 5, max: 60 },
      t: { type: 'int', min: 2, max: 40 },
    },
    constraints: ['b>t', 'm>1'],
  },
  choices: [
    { label: 'Dividing by a negative reverses the direction of the inequality.', correct: true },
    { label: 'The constant ${{b}}$ should have been divided as well.', error: 'partialTotal' },
    { label: 'The inequality has to be turned into an equation first.', error: 'operationInverted' },
    { label: 'The sign of ${{b}}$ changes when it moves across.', error: 'signError' },
  ],
  reasoning: ['Multiplying or dividing both sides by a negative swaps which side is larger.', 'So the $>$ has to become a $<$.'],
  answerSummary: { headline: 'A negative divisor flips the inequality.', text: 'The direction was not reversed.' },
  hint: 'Test the claim on a simple pair of numbers, one negative.',
  feedback: '${{b}}$ is moved before the division here, so it never needed dividing.',
});

// ================================================================ 7.11B
// Testing whether a value satisfies an equation or inequality.

mkc('7.11B', 'gap-between-two-expressions-at-one-value', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade7',
  prompt: 'At $x = {{v}}$, by how much does ${{m}}x + {{b}}$ exceed ${{n}}x - {{c}}$?',
  generator: {
    parameters: {
      m: { type: 'int', min: 3, max: 12 },
      n: { type: 'int', min: 2, max: 10 },
      v: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 2, max: 40 },
      c: { type: 'int', min: 2, max: 70 },
    },
    derived: {
      answer: '(m-n)*v+b+c',
      // Added the coefficients instead of comparing them.
      d_operationInverted: '(m+n)*v+b+c',
      // Missed the sign on the constant being subtracted.
      d_signError: '(m-n)*v+b-c',
      // Answered the first expression on its own.
      d_usedGivenValue: 'm*v+b',
    },
    constraints: ['m>n', '(m-n)*v+b+c>8', 'abs(n*v-c)>3', 'abs(c)>2'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['At $x = {{v}}$ the two expressions come to ${{m}} \\times {{v}} + {{b}}$ and ${{n}} \\times {{v}} - {{c}}$.', 'Their difference is ${{answer}}$.'],
  answerSummary: { headline: 'Substitute into both, then subtract.', text: 'It exceeds it by ${{answer}}$.' },
  hint: 'Work each expression out in full before comparing.',
  feedback: 'Subtracting $-{{c}}$ adds, so the gap grows rather than shrinks.',
});

mkc('7.11B', 'constant-behind-a-failed-test', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade7',
  prompt: 'Testing $x = {{v}}$ in ${{m}}x + b = {{t}}$ leaves the left side ${{off}}$ short. What is $b$?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      v: { type: 'int', min: 2, max: 14 },
      off: { type: 'int', min: 3, max: 220 },
      t: { type: 'int', min: 40, max: 320 },
    },
    derived: {
      answer: 't-off-m*v',
      // Added the shortfall instead of taking it off.
      d_operationInverted: 't+off-m*v',
      // Answered the term that was substituted.
      d_signError: 'm*v',
      // Answered the shortfall itself.
      d_forgotFinalStep: 'off',
    },
    constraints: ['t-off-m*v>4', 'abs(off-(t-off-m*v))>3', 'abs(m*v-(t-off-m*v))>3', 'off>2'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['At $x = {{v}}$ the left side comes to ${{m}} \\times {{v}} + b$, and that is ${{off}}$ below ${{t}}$.', 'So $b = {{t}} - {{off}} - {{m}} \\times {{v}} = {{answer}}$.'],
  answerSummary: { headline: 'A shortfall tells you how far the left side is from the right.', text: '$b = {{answer}}$.' },
  hint: 'Write what the left side actually came to before solving.',
  feedback: 'Being short means the left side is smaller, so the constant is smaller too.',
});

mkc('7.11B', 'what-one-successful-test-settles', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'grade7',
  prompt: 'Testing $x = {{v}}$ in ${{m}}x + {{b}} \\le {{t}}$ makes the left side ${{lhs}}$. What does that settle?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      v: { type: 'int', min: 2, max: 14 },
      b: { type: 'int', min: 3, max: 40 },
      spare: { type: 'int', min: 3, max: 40 },
    },
    derived: { lhs: 'm*v+b', t: 'm*v+b+spare' },
    constraints: ['spare>2'],
  },
  choices: [
    { label: 'That ${{v}}$ satisfies it, though other values may too.', correct: true },
    { label: 'That ${{v}}$ is the only value that satisfies it.', error: 'partialTotal' },
    { label: 'That the inequality has no solutions.', error: 'operationInverted' },
    { label: 'That every value below ${{v}}$ fails it.', error: 'signError' },
  ],
  reasoning: ['${{lhs}}$ is at most ${{t}}$, so ${{v}}$ does satisfy the inequality.', 'An inequality usually holds for a whole range, so one success settles nothing about the rest.'],
  answerSummary: { headline: 'One test confirms one value and nothing more.', text: '${{v}}$ works; other values may as well.' },
  hint: 'Ask how many values an inequality normally allows.',
  feedback: 'A successful test cannot rule anything out.',
});

// ================================================================ 7.11C
// Angle relationships written as equations.

mkc('7.11C', 'value-behind-two-supplementary-expressions', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade7',
  prompt: 'An angle of $(2x + {{b}})^\\circ$ is supplementary to one of $(3x - {{c}})^\\circ$. What is $x$?',
  generator: {
    parameters: {
      b: { type: 'int', min: 5, max: 42 },
      k: { type: 'int', min: 21, max: 34 },
    },
    derived: {
      c: '5*k-180+b',
      answer: 'k',
      // Stopped before dividing by five.
      d_forgotFinalStep: '5*k',
      // Used ninety degrees in place of one hundred and eighty.
      d_operationInverted: 'k-18',
      // Answered a constant from the question.
      d_usedGivenValue: 'b',
    },
    constraints: ['5*k-180+b>2', 'abs(b-k)>3', '2*k+b<180', '3*k-(5*k-180+b)>2'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Supplementary angles total $180^\\circ$, so $5x + {{b}} - {{c}} = 180$.', 'That gives $x = {{answer}}$.'],
  answerSummary: { headline: 'Collect both expressions before using the total.', text: '$x = {{answer}}$.' },
  hint: 'Add the two expressions and set the result to $180$.',
  feedback: 'Ninety degrees belongs to complementary angles, not supplementary ones.',
});

mkc('7.11C', 'larger-angle-from-a-ratio-and-a-third', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade7',
  prompt: 'Two angles of a triangle are in the ratio ${{p}}$ to ${{q}}$ and the third is ${{c}}^\\circ$. What is the larger of the two?',
  generator: {
    parameters: {
      p: { type: 'int', min: 1, max: 5 },
      q: { type: 'int', min: 2, max: 8 },
      u: { type: 'int', min: 6, max: 30 },
    },
    derived: {
      c: '180-(p+q)*u',
      answer: 'q*u',
      // Answered the smaller of the two.
      d_forgotFinalStep: 'p*u',
      // Answered what the two share between them.
      d_usedGivenValue: '(p+q)*u',
      // Answered the third angle.
      d_ratioReversed: 'c',
    },
    constraints: ['q>p', 'gcd(p,q)==1', '180-(p+q)*u>12', 'abs(c-q*u)>4', 'q*u>15'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['The other two angles total $180 - {{c}} = {{p}}+{{q}}$ shares of ${{u}}^\\circ$.', 'The larger takes ${{q}}$ of them, or ${{answer}}^\\circ$.'],
  answerSummary: { headline: 'Split what is left of $180^\\circ$ in the given ratio.', text: 'It is ${{answer}}^\\circ$.' },
  hint: 'Work out one share before assigning either angle.',
  feedback: 'The whole remainder belongs to both angles, not to one.',
});

mkc('7.11C', 'pair-of-facts-that-cannot-both-hold', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'grade7',
  prompt: 'Which description can never fit two real angles?',
  generator: {
    parameters: {
      a: { type: 'int', min: 20, max: 70 },
      b: { type: 'int', min: 30, max: 80 },
    },
    derived: { comp: 'b' },
    constraints: ['a!=b', 'a+b<150'],
  },
  choices: [
    { label: 'They are supplementary and also complementary to each other.', correct: true },
    { label: 'They are supplementary and equal.', error: 'usedGivenValue' },
    { label: 'They are complementary and one measures ${{a}}^\\circ$.', error: 'partialTotal' },
    { label: 'They are supplementary and one measures ${{b}}^\\circ$.', error: 'ratioReversed' },
  ],
  reasoning: ['Supplementary angles total $180^\\circ$ and complementary angles total $90^\\circ$.', 'One pair cannot total both.'],
  answerSummary: { headline: 'A pair has one total, not two.', text: 'They cannot be both at once.' },
  hint: 'Write down what each word requires the total to be.',
  feedback: 'Two angles of $90^\\circ$ each are supplementary and equal, so that pair is possible.',
});

// ================================================================ 8.2A
// Real numbers: which sets a value belongs to.

mkc('8.2A', 'operation-that-lands-back-in-the-rationals', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'grade8',
  prompt: 'Which of these is certain to give a rational result?',
  generator: {
    parameters: {
      n: { type: 'int', min: 2, max: 40 },
      m: { type: 'int', min: 2, max: 40 },
      a: { type: 'int', min: 2, max: 20 },
    },
    constraints: ['n!=m', 'n!=4', 'n!=9', 'n!=16', 'n!=25', 'n!=36', 'm!=4', 'm!=9', 'm!=16', 'm!=25', 'm!=36'],
  },
  choices: [
    { label: 'Multiplying $\\sqrt{{{n}}}$ by itself.', correct: true },
    { label: 'Adding $\\sqrt{{{n}}}$ to $\\sqrt{{{m}}}$.', error: 'usedGivenValue' },
    { label: 'Dividing $\\sqrt{{{n}}}$ by ${{a}}$.', error: 'partialTotal' },
    { label: 'Subtracting ${{a}}$ from $\\sqrt{{{n}}}$.', error: 'signError' },
  ],
  reasoning: ['$\\sqrt{{{n}}} \\times \\sqrt{{{n}}}$ is ${{n}}$, which is a whole number.', 'The other three leave an irrational part behind.'],
  answerSummary: { headline: 'Squaring undoes a square root exactly.', text: 'Multiplying $\\sqrt{{{n}}}$ by itself.' },
  hint: 'Ask which operation removes the root altogether.',
  feedback: 'Dividing or shifting an irrational number leaves it irrational.',
});

mkc('8.2A', 'irrational-with-a-rational-square', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'Which value is irrational but has a rational square?',
  generator: {
    parameters: {
      n: { type: 'int', min: 2, max: 60 },
      root: { type: 'int', min: 3, max: 12 },
      p: { type: 'int', min: 2, max: 11 },
      q: { type: 'int', min: 3, max: 13 },
    },
    derived: { sq: 'root*root' },
    constraints: [
      'gcd(p,q)==1', 'n!=4', 'n!=9', 'n!=16', 'n!=25', 'n!=36', 'n!=49',
      'n*n!=root*root', 'n!=root*root',
    ],
  },
  choices: [
    { label: plain('\\sqrt{{{n}}}'), correct: true },
    { label: plain('\\sqrt{{{sq}}}'), error: 'usedGivenValue' },
    { label: plain('\\frac{{{p}}}{{{q}}}'), error: 'ratioReversed' },
    { label: plain('\\pi'), error: 'operationInverted' },
  ],
  reasoning: ['$\\sqrt{{{n}}}$ is irrational because ${{n}}$ is not a perfect square, and its square is ${{n}}$.', '$\\sqrt{{{sq}}}$ and $\\frac{{{p}}}{{{q}}}$ are already rational, and $\\pi^{2}$ is irrational.'],
  answerSummary: { headline: 'A root of a non-square is irrational; its square is not.', text: 'It is $\\sqrt{{{n}}}$.' },
  hint: 'Square each choice and see what comes out.',
  feedback: '$\\sqrt{{{sq}}}$ is a whole number, so it was never irrational.',
});

mkc('8.2A', 'sum-of-a-rational-and-an-irrational', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'verbal', courseId: 'grade8',
  prompt: 'What is true of ${{a}}$ added to $\\sqrt{{{n}}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 30 },
      n: { type: 'int', min: 2, max: 60 },
    },
    constraints: ['n!=4', 'n!=9', 'n!=16', 'n!=25', 'n!=36', 'n!=49'],
  },
  choices: [
    { label: 'The total is always irrational.', correct: true },
    { label: 'The total is always rational.', error: 'operationInverted' },
    { label: 'The total is rational whenever ${{a}}$ is a whole number.', error: 'usedGivenValue' },
    { label: 'It depends on which of the two is larger.', error: 'partialTotal' },
  ],
  reasoning: ['If the total were rational, subtracting the rational ${{a}}$ would leave $\\sqrt{{{n}}}$ rational.', 'It is not, so the total cannot be rational.'],
  answerSummary: { headline: 'A rational shift cannot repair an irrational number.', text: 'The total is irrational.' },
  hint: 'Suppose the total were rational and see what follows.',
  feedback: 'Being a whole number is what makes ${{a}}$ rational, which is exactly the case that fails.',
});

// ================================================================ 8.2B
// Approximating irrational numbers.

mkc('8.2B', 'root-to-the-nearest-tenth-interval', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'numberLine', courseId: 'grade8',
  prompt: 'Between which two consecutive tenths does $\\sqrt{{{n}}}$ lie?',
  generator: {
    parameters: { n: { type: 'int', min: 12, max: 300 } },
    derived: {
      t: 'floor(sqrt(n)*10)',
      lo: 'floor(sqrt(n)*10)/10',
      hi: '(floor(sqrt(n)*10)+1)/10',
      hi2: '(floor(sqrt(n)*10)+2)/10',
      below: '(floor(sqrt(n)*10)-1)/10',
      w: 'floor(sqrt(n))',
      w1: 'floor(sqrt(n))+1',
    },
    constraints: ['floor(sqrt(n)*10)%10!=0', 'floor(sqrt(n))>2'],
  },
  choices: [
    { label: plain('{{lo}} \\text{ and } {{hi}}'), correct: true },
    { label: plain('{{hi}} \\text{ and } {{hi2}}'), error: 'roundedWrong' },
    { label: plain('{{below}} \\text{ and } {{lo}}'), error: 'offByOneStep' },
    { label: plain('{{w}} \\text{ and } {{w1}}'), error: 'partialTotal' },
  ],
  reasoning: ['${{lo}}^{2}$ is below ${{n}}$ and ${{hi}}^{2}$ is above it.', 'So $\\sqrt{{{n}}}$ sits between ${{lo}}$ and ${{hi}}$.'],
  answerSummary: { headline: 'Square each candidate tenth and compare with the number.', text: 'Between ${{lo}}$ and ${{hi}}$.' },
  hint: 'Try squaring a tenth just below your estimate.',
  feedback: 'Whole numbers bracket the root too loosely to answer this.',
});

mkc('8.2B', 'interval-holding-a-sum-of-two-roots', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'symbolic', courseId: 'grade8',
  prompt: 'Between which two whole numbers does $\\sqrt{{{n}}} + \\sqrt{{{m}}}$ lie?',
  generator: {
    parameters: {
      n: { type: 'int', min: 5, max: 90 },
      m: { type: 'int', min: 5, max: 90 },
    },
    derived: {
      lo: 'floor(sqrt(n)+sqrt(m))',
      hi: 'floor(sqrt(n)+sqrt(m))+1',
      sepLo: 'floor(sqrt(n))+floor(sqrt(m))',
      sepHi: 'floor(sqrt(n))+floor(sqrt(m))+1',
      joinLo: 'floor(sqrt(n+m))',
      joinHi: 'floor(sqrt(n+m))+1',
      prodLo: 'floor(sqrt(n)*sqrt(m))',
      prodHi: 'floor(sqrt(n)*sqrt(m))+1',
    },
    constraints: [
      'floor(sqrt(n)+sqrt(m))!=floor(sqrt(n))+floor(sqrt(m))',
      'floor(sqrt(n)+sqrt(m))!=floor(sqrt(n+m))',
      'floor(sqrt(n)+sqrt(m))!=floor(sqrt(n)*sqrt(m))',
      'floor(sqrt(n))+floor(sqrt(m))!=floor(sqrt(n+m))',
      'floor(sqrt(n))+floor(sqrt(m))!=floor(sqrt(n)*sqrt(m))',
      'floor(sqrt(n+m))!=floor(sqrt(n)*sqrt(m))',
    ],
  },
  choices: [
    { label: plain('{{lo}} \\text{ and } {{hi}}'), correct: true },
    { label: plain('{{sepLo}} \\text{ and } {{sepHi}}'), error: 'partialTotal' },
    { label: plain('{{joinLo}} \\text{ and } {{joinHi}}'), error: 'operationInverted' },
    { label: plain('{{prodLo}} \\text{ and } {{prodHi}}'), error: 'ratioReversed' },
  ],
  reasoning: ['Each root sits between two whole numbers, but their two fractional parts can carry the total past the next whole number.', 'The sum lands between ${{lo}}$ and ${{hi}}$.'],
  answerSummary: { headline: 'Estimate the sum itself, not the two parts separately.', text: 'Between ${{lo}}$ and ${{hi}}$.' },
  hint: 'Estimate each root to a tenth before adding.',
  feedback: 'Rounding each root down first loses whatever the two fractions add up to.',
});

mkc('8.2B', 'adding-under-one-root', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal', courseId: 'grade8',
  prompt: 'A student writes $\\sqrt{{{n}}} + \\sqrt{{{m}}} = \\sqrt{{{sum}}}$. What is wrong?',
  generator: {
    parameters: {
      n: { type: 'int', min: 5, max: 80 },
      m: { type: 'int', min: 5, max: 80 },
    },
    derived: { sum: 'n+m' },
    constraints: ['n!=m'],
  },
  choices: [
    { label: 'A square root does not split across a sum.', correct: true },
    { label: 'The two roots should have been multiplied first.', error: 'operationInverted' },
    { label: 'The total under the root should be halved.', error: 'partialTotal' },
    { label: 'Each root should be squared before adding.', error: 'exponentError' },
  ],
  reasoning: ['Squaring the left side gives ${{n}} + {{m}}$ plus a cross term of $2\\sqrt{{{n}} \\times {{m}}}$.', 'That extra term is exactly what the claim throws away.'],
  answerSummary: { headline: 'Roots distribute over products, not over sums.', text: 'The root cannot be split across the sum.' },
  hint: 'Square both sides and compare.',
  feedback: 'Multiplying the roots is a different calculation with a different answer.',
});

// ================================================================ 8.2C
// Scientific notation.

mkc('8.2C', 'product-in-scientific-notation', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade8',
  prompt: 'What is $({{a}} \\times 10^{{{e}}}) \\times ({{b}} \\times 10^{{{f}}})$ in scientific notation?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 9 },
      e: { type: 'int', min: 2, max: 9 },
      f: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      ab: 'a*b',
      mant: 'a*b/10',
      ee: 'e+f+1',
      ef: 'e+f',
      eProduct: 'e*f',
    },
    constraints: ['a*b>10', 'a*b%10!=0', 'e*f!=e+f+1', 'e*f!=e+f'],
  },
  choices: [
    { label: plain('{{mant}} \\times 10^{{{ee}}}'), correct: true },
    { label: plain('{{ab}} \\times 10^{{{ef}}}'), error: 'exponentError' },
    { label: plain('{{mant}} \\times 10^{{{ef}}}'), error: 'offByOneStep' },
    { label: plain('{{mant}} \\times 10^{{{eProduct}}}'), error: 'operationInverted' },
  ],
  reasoning: ['The first factors multiply to ${{ab}}$ and the powers add to $10^{{{ef}}}$.', 'Rewriting ${{ab}}$ as ${{mant}} \\times 10$ raises the exponent to ${{ee}}$.'],
  answerSummary: { headline: 'Normalising the first factor costs one from the exponent.', text: 'It is ${{mant}} \\times 10^{{{ee}}}$.' },
  hint: 'Multiply the first factors, then fix the result to sit between $1$ and $10$.',
  feedback: 'Exponents add under multiplication; they are not multiplied.',
});

mkc('8.2C', 'reading-behind-a-multiple', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'A reading of ${{m}} \\times 10^{{{e}}}$ is ${{k}}$ times another. Write the other in scientific notation.',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 8 },
      k: { type: 'int', min: 3, max: 9 },
      e: { type: 'int', min: 3, max: 9 },
    },
    derived: {
      q: 'm*10/k',
      em: 'e-1',
      mk: 'm/k',
      ek: 'e-k',
    },
    constraints: ['m<k', 'm*10%k==0', 'e-k!=e-1', 'm*10/k>=1'],
  },
  choices: [
    { label: plain('{{q}} \\times 10^{{{em}}}'), correct: true },
    { label: plain('{{q}} \\times 10^{{{e}}}'), error: 'offByOneStep' },
    { label: plain('{{mk}} \\times 10^{{{em}}}'), error: 'exponentError' },
    { label: plain('{{q}} \\times 10^{{{ek}}}'), error: 'operationInverted' },
  ],
  reasoning: ['Dividing ${{m}}$ by ${{k}}$ gives a first factor below $1$, which is not allowed.', 'Writing it as ${{q}}$ costs one from the exponent, leaving $10^{{{em}}}$.'],
  answerSummary: { headline: 'A first factor below one has to borrow from the exponent.', text: 'It is ${{q}} \\times 10^{{{em}}}$.' },
  hint: 'Divide the first factors, then renormalise.',
  feedback: 'The exponent falls by one, not by ${{k}}$.',
});

mkc('8.2C', 'largest-of-four-readings', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'table', courseId: 'grade8',
  prompt: 'Which of the listed readings is the largest?',
  stimulus: {
    kind: 'table',
    columns: ['Reading'],
    rows: [
      ['${{a}} \\times 10^{{{e}}}$'],
      ['${{b}} \\times 10^{{{e}}}$'],
      ['${{c}} \\times 10^{{{eLow}}}$'],
      ['${{d}} \\times 10^{{{eLow2}}}$'],
    ],
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 5, max: 9 },
      b: { type: 'int', min: 2, max: 4 },
      c: { type: 'int', min: 2, max: 9 },
      d: { type: 'int', min: 2, max: 9 },
      e: { type: 'int', min: 5, max: 12 },
      g: { type: 'int', min: 1, max: 3 },
      g2: { type: 'int', min: 1, max: 3 },
    },
    derived: { eLow: 'e-g', eLow2: 'e-g2' },
    constraints: ['a>b', 'e-g>0', 'e-g2>0', 'g!=g2'],
  },
  choices: [
    { label: plain('{{a}} \\times 10^{{{e}}}'), correct: true },
    { label: plain('{{b}} \\times 10^{{{e}}}'), error: 'partialTotal' },
    { label: plain('{{c}} \\times 10^{{{eLow}}}'), error: 'usedGivenValue' },
    { label: plain('{{d}} \\times 10^{{{eLow2}}}'), error: 'ratioReversed' },
  ],
  reasoning: ['The exponent decides first, so the two readings at $10^{{{e}}}$ outrank the rest.', 'Between those two, the larger first factor wins.'],
  answerSummary: { headline: 'Compare exponents first, first factors second.', text: 'It is ${{a}} \\times 10^{{{e}}}$.' },
  hint: 'Sort by the power of ten before looking at anything else.',
  feedback: 'A large first factor cannot make up for a smaller power of ten.',
});

// ================================================================ 8.2D
// Ordering real numbers.

mkc('8.2D', 'nearest-value-to-a-root', {
  difficultyBand: 4, dok: 2, taskType: 'representationTranslation', representation: 'symbolic', courseId: 'grade8',
  prompt: 'Which of these is closest to $\\sqrt{{{n}}}$?',
  generator: {
    parameters: { n: { type: 'int', min: 20, max: 200 } },
    derived: {
      near: 'round(sqrt(n)*10)/10',
      low: 'floor(sqrt(n))',
      high: 'floor(sqrt(n))+1',
      half: 'n/2',
      pct: 'round(sqrt(n)*10)*10',
    },
    constraints: ['floor(sqrt(n))>3', 'round(sqrt(n)*10)%10!=0', 'n/2!=floor(sqrt(n))'],
  },
  choices: [
    { label: plain('{{near}}'), correct: true },
    { label: plain('{{low}}'), error: 'roundedWrong' },
    { label: plain('{{high}}'), error: 'offByOneStep' },
    { label: plain('\\frac{{{n}}}{2}'), error: 'operationInverted' },
  ],
  rankAnalysisNotApplicable: true,
  reasoning: ['Squaring ${{near}}$ lands within a tenth of ${{n}}$.', 'The whole numbers either side are further away, and half of ${{n}}$ is nowhere near.'],
  answerSummary: { headline: 'Test a candidate by squaring it.', text: 'It is ${{near}}$.' },
  hint: 'Square each candidate and compare with ${{n}}$.',
  feedback: 'Halving is not the same as taking a square root.',
});

mkc('8.2D', 'multiple-of-a-fraction-that-brackets-a-root', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'For which whole number $k$ does $\\sqrt{{{n}}}$ lie between $\\frac{k}{{{c}}}$ and $\\frac{k+1}{{{c}}}$?',
  generator: {
    parameters: {
      n: { type: 'int', min: 20, max: 700 },
      c: { type: 'int', min: 3, max: 5 },
    },
    derived: {
      answer: 'floor(sqrt(n)*c)',
      // Left the denominator out altogether.
      d_partialTotal: 'floor(sqrt(n))',
      // Divided instead of taking a root.
      d_exponentError: 'floor(n/c)',
      // Scaled the whole-number part by the denominator twice.
      d_usedGivenValue: 'floor(sqrt(n))*c*c',
    },
    constraints: [
      'floor(sqrt(n)*c)%c!=0', 'floor(sqrt(n))>3',
      'abs(floor(sqrt(n))*c*c-floor(sqrt(n)*c))>3', 'abs(floor(n/c)-floor(sqrt(n)*c))>3',
      'abs(floor(sqrt(n))-floor(sqrt(n)*c))>3',
    ],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_exponentError}}'), error: 'exponentError' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Multiplying $\\sqrt{{{n}}}$ by ${{c}}$ and taking the whole-number part gives ${{answer}}$.', 'So $\\sqrt{{{n}}}$ sits between $\\frac{{{answer}}}{{{c}}}$ and the next ${{c}}$th.'],
  answerSummary: { headline: 'Scale the root by the denominator before rounding down.', text: '$k = {{answer}}$.' },
  hint: 'Work out ${{c}}\\sqrt{{{n}}}$ first.',
  feedback: 'Dividing ${{n}}$ by ${{c}}$ never involves a square root at all.',
});

mkc('8.2D', 'comparing-under-the-root-sign', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal', courseId: 'grade8',
  prompt: 'A student says $\\sqrt{{{n}}}$ is greater than $\\frac{{{p}}}{{{q}}}$ because ${{n}}$ is greater than ${{p}}$. What is wrong?',
  generator: {
    parameters: {
      n: { type: 'int', min: 5, max: 60 },
      p: { type: 'int', min: 2, max: 4 },
      q: { type: 'int', min: 3, max: 9 },
    },
    constraints: ['gcd(p,q)==1', 'p<q', 'n>p', 'n!=4', 'n!=9', 'n!=16', 'n!=25', 'n!=36', 'n!=49'],
  },
  choices: [
    { label: 'Comparing ${{n}}$ with ${{p}}$ ignores both the root and the denominator.', correct: true },
    { label: 'The root should be doubled before any comparison.', error: 'operationInverted' },
    { label: 'The fraction is negative, so it is smaller in any case.', error: 'signError' },
    { label: 'Both values should be rounded to whole numbers first.', error: 'roundedWrong' },
  ],
  reasoning: ['$\\sqrt{{{n}}}$ is far smaller than ${{n}}$, and $\\frac{{{p}}}{{{q}}}$ is far smaller than ${{p}}$.', 'The conclusion happens to be right here, but the reason given settles nothing.'],
  answerSummary: { headline: 'Compare the values themselves, not the numbers inside them.', text: 'The root and the denominator were both ignored.' },
  hint: 'Work out roughly what each side comes to.',
  feedback: 'Rounding both to whole numbers would lose the very difference being tested.',
});

// ================================================================ 8.3A
// Dilations and similar figures.

mkc('8.3A', 'point-after-two-dilations', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'orderedPairs', courseId: 'grade8',
  prompt: 'A dilation of factor ${{k}}$ about the origin is followed by one of factor ${{m}}$. Where does $({{x}}, {{y}})$ end up?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 7 },
      m: { type: 'int', min: 2, max: 7 },
      x: { type: 'int', min: 2, max: 14 },
      y: { type: 'int', min: 2, max: 14 },
    },
    derived: {
      px: 'k*m*x', py: 'k*m*y',
      sx: 'k+m',
      ax: '(k+m)*x', ay: '(k+m)*y',
      fx: 'k*x', fy: 'k*y',
      mx: 'k*x', my: 'm*y',
    },
    constraints: ['x!=y', 'k!=m', 'k*m!=k+m'],
  },
  choices: [
    { label: plain('({{px}}, {{py}})'), correct: true },
    { label: plain('({{ax}}, {{ay}})'), error: 'operationInverted' },
    { label: plain('({{fx}}, {{fy}})'), error: 'forgotFinalStep' },
    { label: plain('({{mx}}, {{my}})'), error: 'ratioReversed' },
  ],
  reasoning: ['The first dilation gives $({{fx}}, {{fy}})$.', 'The second multiplies both by ${{m}}$, giving $({{px}}, {{py}})$.'],
  answerSummary: { headline: 'Two dilations about the same centre multiply their factors.', text: 'It ends at $({{px}}, {{py}})$.' },
  hint: 'Apply one dilation at a time.',
  feedback: 'Factors combine by multiplying, not by adding.',
});

mkc('8.3A', 'perimeter-from-two-similar-areas', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'Similar rectangles cover ${{A}}$ and ${{A2}}$ square cm, and the smaller has perimeter ${{P}}$ cm. What is the larger perimeter?',
  generator: {
    parameters: {
      A: { type: 'int', min: 4, max: 24 },
      k: { type: 'int', min: 6, max: 30 },
      P: { type: 'int', min: 8, max: 26 },
    },
    derived: {
      A2: 'A*k*k',
      answer: 'P*k',
      // Scaled the perimeter by the area factor.
      d_exponentError: 'P*k*k',
      // Answered the perimeter that was given.
      d_usedGivenValue: 'P',
      // Answered the area factor instead of a length.
      d_ratioReversed: 'k*k',
    },
    constraints: ['P*k>9', 'abs(k*k-P*k)>3', 'abs(P*k-P)>3', 'P*P>=16*A'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_exponentError}}'), error: 'exponentError' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['The areas are in the ratio ${{k}}^{2}$, so the lengths are in the ratio ${{k}}$.', 'The larger perimeter is ${{P}} \\times {{k}} = {{answer}}$ cm.'],
  answerSummary: { headline: 'Take the square root of the area ratio to get the length ratio.', text: 'It is ${{answer}}$ cm.' },
  hint: 'Perimeter is a length, so it scales once.',
  feedback: 'The area factor is the square of the factor a perimeter uses.',
});

mkc('8.3A', 'scaling-area-like-a-length', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal', courseId: 'grade8',
  prompt: 'A student says a dilation of factor ${{k}}$ multiplies both the perimeter and the area by ${{k}}$. What is wrong?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      s: { type: 'int', min: 3, max: 20 },
    },
    derived: { k2: 'k*k', twoK: '2*k' },
    constraints: ['k>1'],
  },
  choices: [
    { label: 'The area is multiplied by ${{k2}}$, not by ${{k}}$.', correct: true },
    { label: 'The perimeter is multiplied by ${{k2}}$ as well.', error: 'exponentError' },
    { label: 'Neither one changes under a dilation.', error: 'usedGivenValue' },
    { label: 'The area is multiplied by ${{twoK}}$.', error: 'partialTotal' },
  ],
  reasoning: ['Both dimensions of the figure are multiplied by ${{k}}$, so the area gains ${{k}}$ twice.', 'The perimeter is a single length, so it gains ${{k}}$ once.'],
  answerSummary: { headline: 'Area scales by the square of the factor.', text: 'The area is multiplied by ${{k2}}$.' },
  hint: 'Try a square of side ${{s}}$ before and after.',
  feedback: 'The perimeter really is multiplied by ${{k}}$; the error is on the area.',
});

// ================================================================ 8.3B
// What a dilation changes and what it leaves alone.

mkc('8.3B', 'growth-in-area-under-a-dilation', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade8',
  prompt: 'A panel of perimeter ${{p}}$ cm and area ${{A}}$ square cm is dilated by a factor of ${{k}}$. By how much does its area grow?',
  generator: {
    parameters: {
      p: { type: 'int', min: 10, max: 200 },
      A: { type: 'int', min: 4, max: 60 },
      k: { type: 'int', min: 2, max: 6 },
    },
    derived: {
      answer: 'A*k*k-A',
      // Scaled the area once instead of twice.
      d_exponentError: 'A*k-A',
      // Answered the new area rather than the growth.
      d_forgotFinalStep: 'A*k*k',
      // Answered the new perimeter.
      d_usedGivenValue: 'p*k',
    },
    constraints: ['A*k*k-A>8', 'abs(p*k-(A*k*k-A))>4', 'abs(A*k-A-(A*k*k-A))>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_exponentError}}'), error: 'exponentError' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The new area is ${{A}} \\times {{k}}^{2}$ square cm.', 'Taking off the original ${{A}}$ leaves a growth of ${{answer}}$.'],
  answerSummary: { headline: 'Area scales by the square, and growth is the difference.', text: 'It grows by ${{answer}}$ square cm.' },
  hint: 'Work out the new area before comparing.',
  feedback: 'Scaling the area once treats it as if it were a length.',
});

mkc('8.3B', 'second-length-under-the-same-dilation', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'A dilation sends a rod of length ${{L}}$ to one of length ${{L2}}$. What does it send a rod of length ${{M}}$ to?',
  generator: {
    parameters: {
      L: { type: 'int', min: 2, max: 20 },
      k: { type: 'int', min: 2, max: 7 },
      M: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      L2: 'L*k',
      answer: 'M*k',
      // Answered the length that was given.
      d_usedGivenValue: 'M',
      // Applied the factor twice.
      d_exponentError: 'M*k*k',
      // Answered the first rod's image.
      d_ratioReversed: 'L2',
    },
    constraints: ['L!=M', 'M*k>7', 'abs(L-M)>2', 'abs(M*k-M)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_exponentError}}'), error: 'exponentError' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['The dilation multiplies every length by ${{L2}} \\div {{L}} = {{k}}$.', 'So ${{M}}$ becomes ${{answer}}$.'],
  answerSummary: { headline: 'One pair of lengths fixes the factor for every other.', text: 'It becomes ${{answer}}$.' },
  hint: 'Find the factor from the pair you are given.',
  feedback: 'The factor applies once to each length, not twice.',
});

mkc('8.3B', 'row-that-scales-the-wrong-quantity', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'table', courseId: 'grade8',
  prompt: 'Each row records what a dilation of factor ${{k}}$ does. Which row is wrong?',
  stimulus: {
    kind: 'table',
    columns: ['Row', 'Quantity', 'After the dilation'],
    rows: [
      ['$1$', 'a side of ${{s}}$ cm', '${{ks}}$ cm'],
      ['$2$', 'a perimeter of ${{p}}$ cm', '${{kp}}$ cm'],
      ['$3$', 'an area of ${{A}}$ square cm', '${{kA}}$ square cm'],
      ['$4$', 'an angle of ${{ang}}$ degrees', '${{ang}}$ degrees'],
    ],
  },
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 7 },
      s: { type: 'int', min: 3, max: 20 },
      p: { type: 'int', min: 10, max: 90 },
      A: { type: 'int', min: 6, max: 80 },
      ang: { type: 'int', min: 20, max: 150 },
    },
    derived: { ks: 'k*s', kp: 'k*p', kA: 'k*A' },
    constraints: ['k>1'],
  },
  choices: [
    { label: 'Row $3$', correct: true },
    { label: 'Row $1$', error: 'usedGivenValue' },
    { label: 'Row $2$', error: 'partialTotal' },
    { label: 'Row $4$', error: 'exponentError' },
  ],
  reasoning: ['Sides and perimeters are lengths, so they take one factor of ${{k}}$.', 'An area takes two, so row $3$ is short by a factor of ${{k}}$.'],
  answerSummary: { headline: 'Only the area carries the factor twice.', text: 'Row $3$ is wrong.' },
  hint: 'Ask how many lengths each quantity is built from.',
  feedback: 'Angles are unchanged by a dilation, so row $4$ is sound.',
});

// ================================================================ 8.3C
// Dilations with a rational factor.

mkc('8.3C', 'point-after-a-fraction-and-a-whole-factor', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'orderedPairs', courseId: 'grade8',
  prompt: 'A dilation of factor $\\frac{{{p}}}{{{q}}}$ about the origin is followed by one of factor ${{k}}$. Where does $({{x}}, {{y}})$ go?',
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 7 },
      q: { type: 'int', min: 3, max: 9 },
      k: { type: 'int', min: 2, max: 6 },
      u: { type: 'int', min: 2, max: 9 },
      v: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      x: 'q*u', y: 'q*v',
      ax: 'k*p*u', ay: 'k*p*v',
      fx: 'p*u', fy: 'p*v',
      rx: 'k*q*u', ry: 'k*q*v',
      sx: 'k*p*v', sy: 'k*p*u',
    },
    constraints: ['gcd(p,q)==1', 'p<q', 'u!=v'],
  },
  choices: [
    { label: plain('({{ax}}, {{ay}})'), correct: true },
    { label: plain('({{fx}}, {{fy}})'), error: 'forgotFinalStep' },
    { label: plain('({{rx}}, {{ry}})'), error: 'ratioReversed' },
    { label: plain('({{sx}}, {{sy}})'), error: 'operationInverted' },
  ],
  reasoning: ['The fraction sends $({{x}}, {{y}})$ to $({{fx}}, {{fy}})$.', 'Multiplying both by ${{k}}$ gives $({{ax}}, {{ay}})$.'],
  answerSummary: { headline: 'Apply the fraction first, then the whole-number factor.', text: 'It goes to $({{ax}}, {{ay}})$.' },
  hint: 'A factor of $\\frac{{{p}}}{{{q}}}$ divides by ${{q}}$ and multiplies by ${{p}}$.',
  feedback: 'Turning the fraction upside down enlarges instead of reducing.',
});

mkc('8.3C', 'factor-behind-a-shortened-length', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'A dilation about the origin sends a length of ${{L}}$ to ${{L2}}$. In lowest terms, what is the factor?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 8 },
      b: { type: 'int', min: 3, max: 12 },
      t: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      L: 'b*t',
      L2: 'a*t',
      diff: 'b-a',
      sum: 'a+b',
    },
    constraints: ['gcd(a,b)==1', 'a<b', 'b-a>1', 'b*t>7'],
  },
  choices: [
    { label: plain('\\frac{{{a}}}{{{b}}}'), correct: true },
    { label: plain('\\frac{{{b}}}{{{a}}}'), error: 'ratioReversed' },
    { label: plain('\\frac{{{a}}}{{{sum}}}'), error: 'partialTotal' },
    { label: plain('\\frac{{{diff}}}{{{b}}}'), error: 'operationInverted' },
  ],
  reasoning: ['The factor is the image over the original, or ${{L2}}$ over ${{L}}$.', 'Cancelling ${{t}}$ leaves $\\frac{{{a}}}{{{b}}}$.'],
  answerSummary: { headline: 'Image over original, then cancel.', text: 'It is $\\frac{{{a}}}{{{b}}}$.' },
  hint: 'Divide the image by the original before simplifying.',
  feedback: 'The factor divides by the original length, not by a total.',
});

mkc('8.3C', 'what-a-reduction-really-does', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'verbal', courseId: 'grade8',
  prompt: 'A dilation about the origin uses a factor of $\\frac{{{p}}}{{{q}}}$, with ${{p}}$ below ${{q}}$. Which statement is true?',
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 7 },
      q: { type: 'int', min: 3, max: 11 },
    },
    constraints: ['gcd(p,q)==1', 'p<q'],
  },
  choices: [
    { label: 'Every point except the origin moves closer to the origin.', correct: true },
    { label: 'Every angle shrinks by the same factor.', error: 'exponentError' },
    { label: 'The area shrinks by $\\frac{{{p}}}{{{q}}}$.', error: 'partialTotal' },
    { label: 'Points on the axes stay where they are.', error: 'usedGivenValue' },
  ],
  reasoning: ['A factor below $1$ multiplies every distance from the origin by less than $1$.', 'Angles are untouched, and the area shrinks by the square of the factor.'],
  answerSummary: { headline: 'A factor below one pulls everything towards the centre.', text: 'Every point except the origin moves closer.' },
  hint: 'Track one point on an axis through the dilation.',
  feedback: 'Only the origin itself is fixed by a dilation about the origin.',
});

// ================================================================ 8.4A
// Slope triangles on a line.

mkc('8.4A', 'rise-of-a-second-slope-triangle', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade8',
  prompt: 'One slope triangle on a line has rise ${{rise}}$ and run ${{run}}$, and a second has run ${{run2}}$. What is the second rise?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      run: { type: 'int', min: 2, max: 16 },
      run2: { type: 'int', min: 2, max: 16 },
    },
    derived: {
      rise: 'm*run',
      answer: 'm*run2',
      // Answered the rise that was given.
      d_usedGivenValue: 'rise',
      // Answered the run without applying the slope.
      d_forgotFinalStep: 'run2',
      // Applied the slope twice.
      d_operationInverted: 'm*m*run2',
    },
    constraints: ['run!=run2', 'm*run2>7', 'abs(m*run2-run2)>3', 'abs(run-run2)>1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['The two triangles are similar, so ${{rise}}$ over ${{run}}$ equals the new rise over ${{run2}}$.', 'That gives ${{answer}}$.'],
  answerSummary: { headline: 'Every slope triangle on a line has the same rise-to-run ratio.', text: 'Its rise is ${{answer}}$.' },
  hint: 'Work out the ratio from the first triangle.',
  feedback: 'The rise changes with the run; it is the ratio that stays put.',
});

mkc('8.4A', 'run-that-reaches-a-given-rise', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'Two points on a line differ by ${{rise}}$ vertically and ${{run}}$ horizontally, and a third sits ${{y3}}$ above the first. How far across is it?',
  generator: {
    parameters: {
      rise: { type: 'int', min: 2, max: 18 },
      run: { type: 'int', min: 2, max: 18 },
      t: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      y3: 'rise*t',
      answer: 'run*t',
      // Answered the vertical distance instead.
      d_ratioReversed: 'y3',
      // Answered how many times over, not the distance.
      d_forgotFinalStep: 't',
      // Multiplied by the rise as well as the run.
      d_operationInverted: 'run*rise*t',
    },
    constraints: ['rise!=run', 'run*t>7', 'abs(run-rise)>1', 'abs(run*t-t)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['${{y3}}$ is ${{t}}$ times the rise of ${{rise}}$.', 'The horizontal distance grows by the same factor, giving ${{answer}}$.'],
  answerSummary: { headline: 'Scale the run by the same factor as the rise.', text: 'It is ${{answer}}$ across.' },
  hint: 'Work out how many of the first triangle fit into the new rise.',
  feedback: 'The rise and the run scale together, so one does not multiply the other.',
});

mkc('8.4A', 'triangle-that-cannot-sit-on-the-line', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'table', courseId: 'grade8',
  prompt: 'Three of these slope triangles sit on one line and one cannot. Which one?',
  stimulus: {
    kind: 'table',
    columns: ['Triangle', 'Rise', 'Run'],
    rows: [
      ['A', '${{r1}}$', '${{n1}}$'],
      ['B', '${{r2}}$', '${{n2}}$'],
      ['C', '${{rBad}}$', '${{n3}}$'],
      ['D', '${{r4}}$', '${{n4}}$'],
    ],
  },
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 8 },
      n1: { type: 'int', min: 2, max: 12 },
      n2: { type: 'int', min: 2, max: 12 },
      n3: { type: 'int', min: 2, max: 12 },
      n4: { type: 'int', min: 2, max: 12 },
      off: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      r1: 'm*n1', r2: 'm*n2', r4: 'm*n4',
      rBad: 'm*n3+off',
    },
    constraints: ['n1!=n2', 'n2!=n4', 'n1!=n4', 'off>1', '(m*n3+off)%n3!=0'],
  },
  choices: [
    { label: 'Triangle C', correct: true },
    { label: 'Triangle A', error: 'usedGivenValue' },
    { label: 'Triangle B', error: 'partialTotal' },
    { label: 'Triangle D', error: 'ratioReversed' },
  ],
  reasoning: ['Three of the triangles give a rise-to-run ratio of ${{m}}$.', 'Triangle C gives ${{rBad}}$ over ${{n3}}$, which is not ${{m}}$.'],
  answerSummary: { headline: 'Every slope triangle on a line shares one ratio.', text: 'Triangle C cannot sit on it.' },
  hint: 'Divide each rise by its run.',
  feedback: 'A larger triangle is not a steeper one as long as the ratio matches.',
});

// ================================================================ 8.4B
// Proportional relationships and graphs through the origin.

mkc('8.4B', 'vertical-gap-between-two-proportional-graphs', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'orderedPairs', courseId: 'grade8',
  prompt: 'Proportional graphs pass through $({{a}}, {{b}})$ and $({{c}}, {{d}})$. At $x = {{x}}$, how far apart are they?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 14 },
      c: { type: 'int', min: 2, max: 14 },
      m: { type: 'int', min: 3, max: 16 },
      n: { type: 'int', min: 2, max: 15 },
      x: { type: 'int', min: 2, max: 14 },
    },
    derived: {
      b: 'a*m',
      d: 'c*n',
      answer: 'x*(m-n)',
      // Added the two rates instead of comparing them.
      d_operationInverted: 'x*(m+n)',
      // Answered the gap in rates, not in height.
      d_forgotFinalStep: 'm-n',
      // Compared the two given heights instead.
      d_partialTotal: 'a*m-c*n',
    },
    constraints: ['m>n', 'x*(m-n)>8', 'abs(a*m-c*n-x*(m-n))>4', 'abs(m-n-x*(m-n))>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['The two graphs rise ${{m}}$ and ${{n}}$ per step, since each passes through the origin.', 'At $x = {{x}}$ they are ${{x}} \\times ({{m}} - {{n}})= {{answer}}$ apart.'],
  answerSummary: { headline: 'A proportional graph is fixed by one point and the origin.', text: 'They are ${{answer}}$ apart.' },
  hint: 'Work out each rate before going to $x = {{x}}$.',
  feedback: 'The gap between the given points is measured at different inputs.',
});

mkc('8.4B', 'input-where-two-proportional-graphs-separate', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'Proportional graphs pass through $({{a}}, {{b}})$ and $({{c}}, {{d}})$. At which $x$ are they ${{g}}$ apart?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      c: { type: 'int', min: 2, max: 12 },
      m: { type: 'int', min: 3, max: 9 },
      n: { type: 'int', min: 2, max: 7 },
      u: { type: 'int', min: 3, max: 48 },
    },
    derived: {
      b: 'a*m',
      d: 'c*n',
      g: '(m-n)*u',
      answer: 'u',
      // Answered the gap itself.
      d_forgotFinalStep: 'g',
      // Answered the product of the two rates.
      d_usedGivenValue: 'm*n',
      // Answered the gap between the rates.
      d_partialTotal: 'm-n',
    },
    constraints: ['m>n', 'm-n>1', 'abs(m*n-u)>4', 'abs(m-n-u)>3', 'u>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['The graphs separate at ${{m}} - {{n}}$ per step.', 'Reaching a gap of ${{g}}$ takes ${{answer}}$ steps.'],
  answerSummary: { headline: 'The gap grows steadily at the difference of the two rates.', text: '$x = {{answer}}$.' },
  hint: 'Find how fast the gap itself grows.',
  feedback: 'The gap is a height, not the input that produces it.',
});

mkc('8.4B', 'positive-points-called-proportional', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal', courseId: 'grade8',
  prompt: 'A student says a line through $({{a}}, {{b}})$ and $({{c}}, {{d}})$ is proportional because both points are positive. What is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      c: { type: 'int', min: 13, max: 26 },
      m: { type: 'int', min: 2, max: 9 },
      b0: { type: 'int', min: 3, max: 30 },
    },
    derived: { b: 'a*m+b0', d: 'c*m+b0' },
    constraints: ['b0>2'],
  },
  choices: [
    { label: 'Proportional means the line also passes through the origin.', correct: true },
    { label: 'The two points would have to share a $y$ value.', error: 'usedGivenValue' },
    { label: 'The coordinates would have to be whole numbers.', error: 'roundedWrong' },
    { label: 'The second point would have to be further from the origin.', error: 'partialTotal' },
  ],
  reasoning: ['These two points give a line that meets the $y$-axis at ${{b0}}$, not at zero.', 'Positive coordinates say nothing about where a line crosses that axis.'],
  answerSummary: { headline: 'Proportional lines pass through the origin.', text: 'The line misses the origin.' },
  hint: 'Work back from either point to $x = 0$.',
  feedback: 'Whole-number coordinates are neither required nor enough.',
});

// ================================================================ 8.4C
// Rate of change and value at zero.

mkc('8.4C', 'value-further-along-a-line-from-a-table', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'table', courseId: 'grade8',
  prompt: 'Every row follows one linear rule. What is $y$ when $x$ is ${{xq}}$?',
  stimulus: {
    kind: 'table',
    columns: ['x', 'y'],
    rows: [['{{x1}}', '{{y1}}'], ['{{x2}}', '{{y2}}'], ['{{x3}}', '{{y3}}']],
  },
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 16 },
      b: { type: 'int', min: 3, max: 16 },
      x1: { type: 'int', min: 1, max: 4 },
      x2: { type: 'int', min: 5, max: 9 },
      x3: { type: 'int', min: 10, max: 14 },
      xq: { type: 'int', min: 15, max: 30 },
    },
    derived: {
      y1: 'm*x1+b', y2: 'm*x2+b', y3: 'm*x3+b',
      answer: 'm*xq+b',
      // Left the value at zero out.
      d_forgotFinalStep: 'm*xq',
      // Swapped the rate and the starting value.
      d_operationInverted: 'b*xq+m',
      // Combined the two before multiplying.
      d_orderOfOperations: '(m+b)*xq',
    },
    constraints: ['abs(b*xq+m-m*xq-b)>4', 'abs((m+b)*xq-m*xq-b)>4', 'b>2'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_orderOfOperations}}'), error: 'orderOfOperations' },
  ],
  reasoning: ['Row to row $y$ climbs ${{m}}$ per step, and working back to $x = 0$ gives ${{b}}$.', 'So at $x = {{xq}}$ the value is ${{answer}}$.'],
  answerSummary: { headline: 'A linear rule needs both its rate and its value at zero.', text: '$y = {{answer}}$.' },
  hint: 'Find the rate first, then the value at zero.',
  feedback: 'The starting value is added once, not multiplied by the input.',
});

mkc('8.4C', 'second-line-through-the-same-axis-point', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'Two lines meet the $y$-axis at the same point; one rises ${{m}}$ a step through $({{x1}}, {{y1}})$ and the other rises ${{n}}$. What does the second reach at $x = {{x1}}$?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 14 },
      n: { type: 'int', min: 2, max: 14 },
      x1: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 4, max: 40 },
    },
    derived: {
      y1: 'm*x1+b',
      answer: 'n*x1+b',
      // Answered the first line's value.
      d_usedGivenValue: 'y1',
      // Left the shared axis point out.
      d_forgotFinalStep: 'n*x1',
      // Added the second rise on top of the first line.
      d_orderOfOperations: 'y1+n*x1',
    },
    constraints: ['m!=n', 'abs(m-n)*x1>3', 'b>3', 'n*x1>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_orderOfOperations}}'), error: 'orderOfOperations' },
  ],
  reasoning: ['The first line puts the shared axis point at ${{y1}} - {{m}} \\times {{x1}} = {{b}}$.', 'The second reaches ${{b}} + {{n}} \\times {{x1}} = {{answer}}$.'],
  answerSummary: { headline: 'Recover the shared starting value before using the second rate.', text: 'It reaches ${{answer}}$.' },
  hint: 'Work the first line back to the axis.',
  feedback: 'The second line starts from the same point, not from the first line.',
});

mkc('8.4C', 'claim-about-a-tank-that-starts-full', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'grade8',
  prompt: 'A tank holds $y = {{m}}x + {{b}}$ litres after $x$ minutes of filling. Which statement is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 30 },
      b: { type: 'int', min: 5, max: 90 },
      x1: { type: 'int', min: 2, max: 12 },
    },
    derived: { val: 'm*x1+b' },
    constraints: ['b>4'],
  },
  choices: [
    { label: 'The tank was empty when the filling started.', correct: true },
    { label: 'It gains ${{m}}$ litres a minute.', error: 'partialTotal' },
    { label: 'It already held ${{b}}$ litres before the filling began.', error: 'usedGivenValue' },
    { label: 'After ${{x1}}$ minutes it holds ${{val}}$ litres.', error: 'ratioReversed' },
  ],
  reasoning: ['Putting $x = 0$ into the rule gives ${{b}}$ litres, not zero.', 'The tank already held that much before any filling.'],
  answerSummary: { headline: 'The constant term is what was there at the start.', text: 'The tank was not empty.' },
  hint: 'Substitute $x = 0$ and read the result.',
  feedback: 'The rate really is ${{m}}$ litres a minute; it is the starting point that is misread.',
});

// ================================================================ 8.5A
// The constant of proportionality.

mkc('8.5A', 'gap-between-two-constants', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'table', courseId: 'grade8',
  prompt: 'Each row records one proportional relationship. By how much does the first constant exceed the second?',
  stimulus: {
    kind: 'table',
    columns: ['Relationship', 'x', 'y'],
    rows: [['first', '${{x1}}$', '${{y1}}$'], ['second', '${{x2}}$', '${{y2}}$']],
  },
  generator: {
    parameters: {
      x1: { type: 'int', min: 2, max: 14 },
      x2: { type: 'int', min: 2, max: 14 },
      k1: { type: 'int', min: 24, max: 70 },
      k2: { type: 'int', min: 2, max: 60 },
    },
    derived: {
      y1: 'x1*k1',
      y2: 'x2*k2',
      answer: 'k1-k2',
      // Added the two constants.
      d_operationInverted: 'k1+k2',
      // Compared them the other way round.
      d_signError: 'k2-k1',
      // Answered the second constant.
      d_partialTotal: 'k2',
    },
    constraints: ['k1>k2', 'k1-k2>3', 'abs(k2-(k1-k2))>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['Each constant is $y$ divided by $x$, giving ${{k1}}$ and ${{k2}}$.', 'The difference is ${{answer}}$.'],
  answerSummary: { headline: 'Divide each pair before comparing anything.', text: 'It exceeds it by ${{answer}}$.' },
  hint: 'One row on its own fixes a proportional constant.',
  feedback: 'The two outputs are measured at different inputs, so they cannot be compared directly.',
});

mkc('8.5A', 'length-that-matches-another-cost', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'Rope costs $\\${{k}}$ a metre and chain $\\${{other}}$ a metre. How many metres of rope cost as much as ${{n}}$ metres of chain?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 20 },
      t: { type: 'int', min: 2, max: 9 },
      n: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      other: 'k*t',
      answer: 'n*t',
      // Answered the length that was given.
      d_usedGivenValue: 'n',
      // Applied the ratio twice.
      d_operationInverted: 'n*t*t',
      // Answered the price of the chain.
      d_forgotFinalStep: 'other',
    },
    constraints: ['n*t>8', 'abs(other-n*t)>3', 'abs(n*t-n)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['${{n}}$ metres of chain cost ${{n}} \\times {{other}}$ dollars.', 'Dividing by ${{k}}$ gives ${{answer}}$ metres of rope.'],
  answerSummary: { headline: 'Convert to money, then back at the other rate.', text: 'It is ${{answer}}$ metres.' },
  hint: 'Work out the cost of the chain first.',
  feedback: 'Chain costs ${{t}}$ times as much a metre, so the rope length is ${{t}}$ times as long.',
});

mkc('8.5A', 'claim-about-combining-two-constants', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'grade8',
  prompt: 'Two proportional relationships have constants ${{k}}$ and ${{other}}$. Which statement is wrong?',
  generator: {
    parameters: {
      k: { type: 'int', min: 3, max: 20 },
      other: { type: 'int', min: 2, max: 18 },
    },
    derived: { sum: 'k+other', prod: 'k*other' },
    constraints: ['k>other'],
  },
  choices: [
    { label: 'Adding the two outputs at each $x$ gives a constant of ${{prod}}$.', correct: true },
    { label: 'Adding the two outputs at each $x$ gives a constant of ${{sum}}$.', error: 'partialTotal' },
    { label: 'The first grows faster for every positive $x$.', error: 'usedGivenValue' },
    { label: 'Both pass through the origin.', error: 'ratioReversed' },
  ],
  reasoning: ['At each $x$ the two outputs are ${{k}}x$ and ${{other}}x$, and their total is $({{k}} + {{other}})x$.', 'Multiplying the constants describes something else entirely.'],
  answerSummary: { headline: 'Adding two proportional outputs adds their constants.', text: 'The constant is ${{sum}}$, not ${{prod}}$.' },
  hint: 'Write both outputs at the same $x$ and add them.',
  feedback: 'The larger constant does grow faster, and both do pass through the origin.',
});

// ================================================================ 8.5B
// Linear relationships with a non-zero starting value.

mkc('8.5B', 'month-where-two-plans-level', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade8',
  prompt: 'Two plans charge $\\${{m1}}$ and $\\${{m2}}$ a month with joining fees of $\\${{b1}}$ and $\\${{b2}}$. When do they cost the same?',
  generator: {
    parameters: {
      m1: { type: 'int', min: 8, max: 44 },
      gap: { type: 'int', min: 2, max: 12 },
      u: { type: 'int', min: 4, max: 40 },
      b2: { type: 'int', min: 20, max: 200 },
    },
    derived: {
      m2: 'm1+gap',
      diff: 'gap*u',
      b1: 'b2+gap*u',
      answer: 'u',
      // Answered the difference in fees.
      d_forgotFinalStep: 'diff',
      // Answered the gap between the monthly charges.
      d_operationInverted: 'gap',
      // Answered the cheaper monthly charge.
      d_ratioReversed: 'm1',
    },
    constraints: ['u>4', 'abs(m1-u)>4', 'abs(gap-u)>3', 'gap*u>12'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['The fees differ by ${{diff}}$ and the monthly charges differ by ${{gap}}$.', 'The cheaper monthly plan catches up after ${{answer}}$ months.'],
  answerSummary: { headline: 'The fee gap is closed at the rate the monthly charges differ.', text: 'After ${{answer}}$ months.' },
  hint: 'Divide the fee gap by the gap in monthly charges.',
  feedback: 'The fee difference is money, not a number of months.',
});

mkc('8.5B', 'monthly-charge-behind-a-total', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'A plan with a $\\${{b}}$ joining fee comes to $\\${{t}}$ after ${{x}}$ months. What does it charge a month?',
  generator: {
    parameters: {
      x: { type: 'int', min: 3, max: 14 },
      j: { type: 'int', min: 2, max: 7 },
      m: { type: 'int', min: 10, max: 60 },
    },
    derived: {
      b: 'x*j',
      t: 'x*j+m*x',
      answer: 'm',
      // Divided the whole total by the months.
      d_forgotFinalStep: 'm+j',
      // Took the fee off twice.
      d_operationInverted: 'm-j',
      // Answered the joining fee.
      d_usedGivenValue: 'b',
    },
    constraints: ['m-j>2', 'abs(b-m)>4', 'j>1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Taking the ${{b}}$ fee off ${{t}}$ leaves ${{m}} \\times {{x}}$ dollars of monthly charges.', 'Dividing by ${{x}}$ gives ${{answer}}$ a month.'],
  answerSummary: { headline: 'Remove the one-off charge before dividing.', text: 'It charges $\\${{answer}}$ a month.' },
  hint: 'The fee is paid once, so it never divides by the months.',
  feedback: 'Dividing the whole total spreads the fee across every month.',
});

mkc('8.5B', 'fee-folded-into-the-monthly-rate', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal', courseId: 'grade8',
  prompt: 'For a $\\${{b}}$ joining fee at $\\${{m}}$ a month a student writes $y = ({{m}} + {{b}})x$. What is wrong?',
  generator: {
    parameters: {
      b: { type: 'int', min: 10, max: 120 },
      m: { type: 'int', min: 5, max: 60 },
    },
    constraints: ['b!=m'],
  },
  choices: [
    { label: 'The fee is charged once, not every month.', correct: true },
    { label: 'The fee should be subtracted instead.', error: 'signError' },
    { label: 'The monthly charge should be divided by the fee.', error: 'ratioReversed' },
    { label: 'The rule needs no $x$ in it at all.', error: 'operationInverted' },
  ],
  reasoning: ['Multiplying $({{m}} + {{b}})$ by $x$ charges the ${{b}}$ every month.', 'It belongs outside the term that carries $x$, as $y = {{m}}x + {{b}}$.'],
  answerSummary: { headline: 'A one-off charge stands outside the $x$ term.', text: 'The fee is being charged monthly.' },
  hint: 'Work out what the rule gives for two months.',
  feedback: 'The fee is added, not subtracted; it is where it sits that is wrong.',
});

// ================================================================ 8.5E
// Direct variation.

mkc('8.5E', 'extra-stretch-between-two-loads', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade8',
  prompt: 'A spring stretches ${{s1}}$ cm under ${{L1}}$ kg. How much more does ${{L3}}$ kg stretch it than ${{L2}}$ kg?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      L1: { type: 'int', min: 2, max: 12 },
      L2: { type: 'int', min: 2, max: 26 },
      L3: { type: 'int', min: 3, max: 34 },
    },
    derived: {
      s1: 'k*L1',
      answer: 'k*(L3-L2)',
      // Added the two loads instead of comparing them.
      d_operationInverted: 'k*(L3+L2)',
      // Compared the two the other way round.
      d_signError: 'k*(L2-L3)',
      // Answered the stretch under the smaller load.
      d_partialTotal: 'k*L2',
    },
    constraints: ['L3>L2', 'k*(L3-L2)>7', 'abs(L2-(L3-L2))>1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['The spring stretches ${{s1}} \\div {{L1}} = {{k}}$ cm for each kilogram.', 'The extra ${{L3}} - {{L2}}$ kg adds ${{answer}}$ cm.'],
  answerSummary: { headline: 'Find the stretch per kilogram before comparing loads.', text: 'It stretches ${{answer}}$ cm more.' },
  hint: 'Only the difference in load matters here.',
  feedback: 'Adding the loads measures the stretch under both at once.',
});

mkc('8.5E', 'output-from-a-recorded-rise', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'Under direct variation $y$ rises by ${{d}}$ whenever $x$ rises by ${{g}}$. What is $y$ when $x = {{xt}}$?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 14 },
      g: { type: 'int', min: 2, max: 16 },
      xt: { type: 'int', min: 2, max: 14 },
    },
    derived: {
      d: 'k*g',
      answer: 'k*xt',
      // Used the whole rise as the constant.
      d_operationInverted: 'd*xt',
      // Answered the constant on its own.
      d_forgotFinalStep: 'k',
      // Answered the recorded rise.
      d_usedGivenValue: 'd',
    },
    constraints: ['g>1', 'k*xt>8', 'abs(d-k*xt)>3', 'abs(k-k*xt)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['A rise of ${{d}}$ over ${{g}}$ steps is ${{k}}$ per step.', 'Direct variation passes through the origin, so at $x = {{xt}}$ the value is ${{answer}}$.'],
  answerSummary: { headline: 'The constant is the rise per single step.', text: '$y = {{answer}}$.' },
  hint: 'Divide the rise by the number of steps it took.',
  feedback: 'The recorded rise covers ${{g}}$ steps, not one.',
});

mkc('8.5E', 'claim-about-shifting-the-input', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'grade8',
  prompt: 'In a direct variation with constant ${{k}}$, which statement is wrong?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 15 },
      a: { type: 'int', min: 2, max: 12 },
    },
    derived: { ka: 'k*a' },
    constraints: ['k>1'],
  },
  choices: [
    { label: 'Adding ${{a}}$ to $x$ adds ${{a}}$ to $y$.', correct: true },
    { label: 'Adding ${{a}}$ to $x$ adds ${{ka}}$ to $y$.', error: 'partialTotal' },
    { label: 'Doubling $x$ doubles $y$.', error: 'operationInverted' },
    { label: 'When $x$ is zero, $y$ is zero.', error: 'usedGivenValue' },
  ],
  reasoning: ['Every step in $x$ is multiplied by ${{k}}$ before it reaches $y$.', 'So ${{a}}$ more in $x$ is ${{ka}}$ more in $y$.'],
  answerSummary: { headline: 'A shift in $x$ is scaled by the constant.', text: 'It adds ${{ka}}$, not ${{a}}$.' },
  hint: 'Compare $y$ at $x$ and at $x + {{a}}$.',
  feedback: 'Doubling really does double, because the constant multiplies through.',
});

// ================================================================ 8.5F
// Telling proportional apart from merely linear.

mkc('8.5F', 'fall-in-cost-per-copy', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade8',
  prompt: 'A printer charges $\\${{b}}$ setup plus $\\${{m}}$ a copy. By how much does the cost per copy fall between ${{n1}}$ and ${{n2}}$ copies?',
  generator: {
    parameters: {
      t: { type: 'int', min: 2, max: 8 },
      n1: { type: 'int', min: 2, max: 7 },
      gap: { type: 'int', min: 2, max: 8 },
      m: { type: 'int', min: 2, max: 40 },
    },
    derived: {
      n2: 'n1+gap',
      b: 'n1*(n1+gap)*t',
      answer: 't*gap',
      // Added the two counts instead of comparing them.
      d_operationInverted: 't*(2*n1+gap)',
      // Answered the fall for a single extra copy.
      d_forgotFinalStep: 't',
      // Answered the charge per copy.
      d_usedGivenValue: 'm',
    },
    constraints: ['t*gap>5', 'abs(m-t*gap)>3', 'abs(t-t*gap)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The cost per copy is ${{m}}$ plus the setup shared out, or ${{m}} + \\frac{{{b}}}{n}$.', 'Between ${{n1}}$ and ${{n2}}$ copies that share falls by ${{answer}}$.'],
  answerSummary: { headline: 'The setup fee is spread thinner as the run grows.', text: 'It falls by $\\${{answer}}$.' },
  hint: 'Work out the setup share at each count.',
  feedback: 'The per-copy charge itself never changes; only the shared setup does.',
});

mkc('8.5F', 'setup-fee-behind-a-unit-cost', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'A setup fee plus $\\${{m}}$ a copy works out at $\\${{t}}$ a copy over ${{n}}$ copies. What is the setup fee?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 30 },
      share: { type: 'int', min: 2, max: 30 },
      n: { type: 'int', min: 3, max: 24 },
    },
    derived: {
      t: 'm+share',
      answer: 'share*n',
      // Answered the share of the fee carried by one copy.
      d_forgotFinalStep: 'share',
      // Added the per-copy charge back before multiplying.
      d_operationInverted: '(t+m)*n',
      // Multiplied the count by the per-copy charge.
      d_ratioReversed: 'n*m',
    },
    constraints: ['share*n>9', 'abs(n*m-share*n)>4', 'abs(share-share*n)>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['Each copy carries $\\${{t}} - \\${{m}} = \\${{share}}$ of the setup.', 'Over ${{n}}$ copies that is $\\${{answer}}$.'],
  answerSummary: { headline: 'The per-copy excess times the run gives the fee.', text: 'The fee is $\\${{answer}}$.' },
  hint: 'Work out how much of each copy pays for setup.',
  feedback: 'The share belongs to one copy; the fee covers all of them.',
});

mkc('8.5F', 'fact-that-settles-proportionality', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'verbal', courseId: 'grade8',
  prompt: 'A cost rises by the same amount for every extra item. Which single fact settles whether it is proportional?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 30 },
      n: { type: 'int', min: 2, max: 20 },
    },
    derived: { one: 'm' },
    constraints: ['m>1'],
  },
  choices: [
    { label: 'What the cost is for zero items.', correct: true },
    { label: 'What the cost is for one item.', error: 'partialTotal' },
    { label: 'Whether the cost rises by the same amount each time.', error: 'usedGivenValue' },
    { label: 'Whether every cost is a whole number of dollars.', error: 'roundedWrong' },
  ],
  reasoning: ['A steady rise already tells us the relationship is linear.', 'Only the cost at zero items decides whether it also passes through the origin.'],
  answerSummary: { headline: 'Linear plus through the origin is what proportional means.', text: 'The cost for zero items.' },
  hint: 'Ask what proportional adds to linear.',
  feedback: 'A steady rise is already known and settles nothing further.',
});

// ================================================================ 8.5G
// Functions.

mkc('8.5G', 'pair-that-would-break-the-function', {
  difficultyBand: 4, dok: 2, taskType: 'interpretation', representation: 'table', courseId: 'grade8',
  prompt: 'The table lists a relation. Adding which pair would stop it being a function?',
  stimulus: {
    kind: 'table',
    columns: ['Input', 'Output'],
    rows: [['${{x1}}$', '${{y1}}$'], ['${{x2}}$', '${{y2}}$'], ['${{x3}}$', '${{y3}}$']],
  },
  generator: {
    parameters: {
      x1: { type: 'int', min: 1, max: 9 },
      x2: { type: 'int', min: 10, max: 19 },
      x3: { type: 'int', min: 20, max: 29 },
      x4: { type: 'int', min: 30, max: 39 },
      x5: { type: 'int', min: 40, max: 49 },
      y1: { type: 'int', min: 2, max: 30 },
      y2: { type: 'int', min: 31, max: 60 },
      y3: { type: 'int', min: 61, max: 90 },
      y5: { type: 'int', min: 91, max: 120 },
      off: { type: 'int', min: 3, max: 20 },
    },
    derived: { yNew: 'y1+off' },
    constraints: ['off>2'],
  },
  choices: [
    { label: plain('({{x1}}, {{yNew}})'), correct: true },
    { label: plain('({{x4}}, {{y1}})'), error: 'usedGivenValue' },
    { label: plain('({{x5}}, {{y5}})'), error: 'partialTotal' },
    { label: plain('({{x1}}, {{y1}})'), error: 'operationInverted' },
  ],
  reasoning: ['A function gives each input exactly one output.', 'Only $({{x1}}, {{yNew}})$ hands ${{x1}}$ a second, different output.'],
  answerSummary: { headline: 'Repeating an input with a new output is what breaks a function.', text: 'It is $({{x1}}, {{yNew}})$.' },
  hint: 'Look for a pair whose input already appears.',
  feedback: 'Two inputs sharing one output is perfectly allowed.',
});

mkc('8.5G', 'output-that-keeps-a-relation-a-function', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal', courseId: 'grade8',
  prompt: 'A relation contains $({{a}}, {{p}})$, $({{b}}, {{q}})$ and $({{a}}, y)$. For which $y$ is it a function?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 15 },
      b: { type: 'int', min: 16, max: 30 },
      p: { type: 'int', min: 2, max: 40 },
      q: { type: 'int', min: 2, max: 40 },
      r: { type: 'int', min: 2, max: 40 },
    },
    constraints: ['p!=q', 'p!=r', 'q!=r'],
  },
  choices: [
    { label: 'Only ${{p}}$.', correct: true },
    { label: 'Only ${{q}}$.', error: 'usedGivenValue' },
    { label: 'Only ${{r}}$.', error: 'partialTotal' },
    { label: 'Any value at all.', error: 'operationInverted' },
  ],
  reasoning: ['The input ${{a}}$ already has the output ${{p}}$.', 'The third pair is allowed only if it repeats that output exactly.'],
  answerSummary: { headline: 'A repeated input must repeat its output too.', text: 'Only ${{p}}$.' },
  hint: 'Ask what output ${{a}}$ has already been given.',
  feedback: 'Any other value would give ${{a}}$ two different outputs.',
});

mkc('8.5G', 'rule-that-functions-do-not-impose', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'grade8',
  prompt: 'A mapping sends ${{a}}$ and ${{b}}$ to ${{p}}$, and ${{c}}$ to ${{q}}$. Which statement about functions is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 13, max: 24 },
      c: { type: 'int', min: 25, max: 36 },
      p: { type: 'int', min: 2, max: 40 },
      q: { type: 'int', min: 41, max: 80 },
    },
    constraints: ['p!=q'],
  },
  choices: [
    { label: 'Two different inputs may not share an output.', correct: true },
    { label: 'One input may not have two different outputs.', error: 'operationInverted' },
    { label: 'Every input has exactly one output.', error: 'usedGivenValue' },
    { label: 'A vertical line crosses the graph at most once.', error: 'partialTotal' },
  ],
  reasoning: ['Nothing stops ${{a}}$ and ${{b}}$ from both landing on ${{p}}$.', 'The rule runs the other way: no input may have two outputs.'],
  answerSummary: { headline: 'Functions restrict outputs per input, not inputs per output.', text: 'Sharing an output is allowed.' },
  hint: 'Check the mapping described against each claim.',
  feedback: 'The vertical line test is exactly the one-output-per-input rule drawn out.',
});

// ================================================================ 8.5H
// Proportional situations in context.

mkc('8.5H', 'length-where-two-suppliers-level', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade8',
  prompt: 'Wire costs $\\${{k}}$ a metre outright, and rope costs $\\${{b}}$ hire plus $\\${{m}}$ a metre. At how many metres do they cost the same?',
  generator: {
    parameters: {
      m: { type: 'int', min: 4, max: 44 },
      gap: { type: 'int', min: 2, max: 12 },
      u: { type: 'int', min: 4, max: 40 },
    },
    derived: {
      k: 'm+gap',
      b: 'gap*u',
      answer: 'u',
      // Answered the hire charge.
      d_forgotFinalStep: 'b',
      // Answered the rope's rate.
      d_usedGivenValue: 'm',
      // Answered the gap between the two rates.
      d_partialTotal: 'gap',
    },
    constraints: ['u>4', 'abs(m-u)>4', 'abs(gap-u)>3', 'gap*u>12'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['Wire costs ${{gap}}$ more a metre, so it closes the ${{b}}$ hire charge at ${{gap}}$ a metre.', 'That takes ${{answer}}$ metres.'],
  answerSummary: { headline: 'A one-off charge is closed at the difference in the rates.', text: 'At ${{answer}}$ metres.' },
  hint: 'Compare the two rates before touching the hire charge.',
  feedback: 'The hire charge is money, not a length.',
});

mkc('8.5H', 'fare-a-proportional-rule-would-give', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'A fare is $\\${{t1}}$ for ${{d1}}$ km and $\\${{t2}}$ for ${{d2}}$ km. If it were proportional, what would the second fare be?',
  generator: {
    parameters: {
      d1: { type: 'int', min: 2, max: 12 },
      d2: { type: 'int', min: 3, max: 24 },
      r: { type: 'int', min: 2, max: 14 },
      t2: { type: 'int', min: 5, max: 200 },
    },
    derived: {
      t1: 'd1*r',
      answer: 'd2*r',
      // Scaled by the distance rather than the rate.
      d_forgotFinalStep: 't1*d2',
      // Answered the first fare.
      d_usedGivenValue: 't1',
      // Answered the fare that was actually charged.
      d_ratioReversed: 't2',
    },
    constraints: ['d2>d1', 'd2*r>9', 'abs(t2-d2*r)>4', 'abs(t1-d2*r)>3', 'abs(t1*d2-d2*r)>4', 't2>t1', 't2<5*t1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['A proportional fare would charge ${{t1}} \\div {{d1}} = {{r}}$ a kilometre throughout.', 'Over ${{d2}}$ km that comes to $\\${{answer}}$.'],
  answerSummary: { headline: 'Proportional means one rate applies at every distance.', text: 'It would be $\\${{answer}}$.' },
  hint: 'Work out the rate the first journey implies.',
  feedback: 'Multiplying the first fare by the second distance scales it far too far.',
});

mkc('8.5H', 'change-that-would-make-a-charge-proportional', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'verbal', courseId: 'grade8',
  prompt: 'A job is billed as a $\\${{b}}$ callout plus $\\${{k}}$ an hour. Which change would make the bill proportional to the hours?',
  generator: {
    parameters: {
      b: { type: 'int', min: 20, max: 150 },
      k: { type: 'int', min: 15, max: 90 },
    },
    constraints: ['b!=k'],
  },
  choices: [
    { label: 'Dropping the callout charge.', correct: true },
    { label: 'Doubling the hourly rate.', error: 'operationInverted' },
    { label: 'Charging the callout twice.', error: 'partialTotal' },
    { label: 'Rounding every bill to the nearest dollar.', error: 'roundedWrong' },
  ],
  reasoning: ['Proportional means a bill of zero for zero hours.', 'The callout charge is the only thing standing in the way.'],
  answerSummary: { headline: 'Only the fixed charge breaks proportionality.', text: 'Drop the callout charge.' },
  hint: 'Work out what a zero-hour job would be billed.',
  feedback: 'Changing the hourly rate leaves the fixed charge exactly where it is.',
});

// ================================================================ 8.5I
// Writing a linear equation from a description.

mkc('8.5I', 'equation-for-a-tank-that-gains-and-loses', {
  difficultyBand: 4, dok: 2, taskType: 'representationTranslation', representation: 'symbolic', courseId: 'grade8',
  prompt: 'A tank holds ${{b}}$ litres, gains ${{m}}$ a minute from a pump and loses ${{c}}$ a minute through a leak. Which equation gives the amount after $x$ minutes?',
  generator: {
    parameters: {
      b: { type: 'int', min: 20, max: 400 },
      m: { type: 'int', min: 5, max: 60 },
      c: { type: 'int', min: 2, max: 40 },
    },
    constraints: ['m>c', 'm-c>1'],
  },
  choices: [
    { label: plain('y = ({{m}} - {{c}})x + {{b}}'), correct: true },
    { label: plain('y = ({{m}} + {{c}})x + {{b}}'), error: 'signError' },
    { label: plain('y = ({{m}} - {{c}})x - {{b}}'), error: 'operationInverted' },
    { label: plain('y = {{m}}x - {{c}} + {{b}}'), error: 'orderOfOperations' },
  ],
  reasoning: ['Each minute the tank nets ${{m}} - {{c}}$ litres, and that is what multiplies $x$.', 'The ${{b}}$ litres are already there before any minute passes.'],
  answerSummary: { headline: 'Net the two rates, then add the starting amount once.', text: 'It is $y = ({{m}} - {{c}})x + {{b}}$.' },
  hint: 'Work out the change over a single minute first.',
  feedback: 'The leak runs every minute, so it belongs inside the term that carries $x$.',
});

mkc('8.5I', 'input-where-a-linear-rule-reaches-zero', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'A linear rule gives $y = {{y1}}$ at $x = {{x1}}$ and $y = {{y2}}$ at $x = {{x2}}$. At which $x$ is $y$ zero?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      z: { type: 'int', min: 2, max: 14 },
      x1: { type: 'int', min: 4, max: 80 },
      gap: { type: 'int', min: 2, max: 14 },
    },
    derived: {
      x0: 'm*z',
      x2: 'x1+gap',
      y1: 'm*(x1-m*z)',
      y2: 'm*(x1+gap-m*z)',
      answer: 'm*z',
      // Answered the rate times the crossing point.
      d_ratioReversed: 'm*m*z',
      // Divided by the rate twice.
      d_forgotFinalStep: 'z',
      // Answered an input that was given.
      d_usedGivenValue: 'x1',
    },
    constraints: ['x1!=m*z', 'abs(x1-m*z)>3', 'm*z>7', 'abs(m*z-z)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The rule climbs ${{m}}$ for each step, since $y$ moves from ${{y1}}$ to ${{y2}}$ over ${{gap}}$ steps.', 'Working back from $({{x1}}, {{y1}})$ reaches zero at $x = {{answer}}$.'],
  answerSummary: { headline: 'Find the rate, then walk back until $y$ runs out.', text: '$x = {{answer}}$.' },
  hint: 'Work out how far $y$ has to fall and how many steps that takes.',
  feedback: 'The crossing point is an input, not the rate multiplied by one.',
});

mkc('8.5I', 'falling-line-written-as-a-rising-one', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'verbal', courseId: 'grade8',
  prompt: 'For a line crossing the vertical axis at ${{b}}$ and falling ${{m}}$ for each step a student writes $y = {{m}}x + {{b}}$. What is wrong?',
  generator: {
    parameters: {
      b: { type: 'int', min: 10, max: 200 },
      m: { type: 'int', min: 2, max: 40 },
    },
    constraints: ['b>m'],
  },
  choices: [
    { label: 'A fall makes the rate negative.', correct: true },
    { label: 'The crossing value should be negative as well.', error: 'signError' },
    { label: 'The rate and the crossing value are the wrong way round.', error: 'ratioReversed' },
    { label: 'The rate should be divided by the step size.', error: 'operationInverted' },
  ],
  reasoning: ['A line that falls sends $y$ down as $x$ rises, so the coefficient is $-{{m}}$.', 'The crossing value ${{b}}$ is where the line starts and stays positive.'],
  answerSummary: { headline: 'The sign of the rate records the direction.', text: 'The rate should be $-{{m}}$.' },
  hint: 'Work out $y$ one step past the axis.',
  feedback: 'The line crosses above zero, so the constant is positive.',
});

// ================================================================ 8.6A
// Volume as base area times height.

mkc('8.6A', 'depth-after-pouring-into-a-wider-tank', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade8',
  prompt: 'A tank of base ${{B}}$ square cm holds water ${{h}}$ cm deep. Poured into a tank of base ${{B2}}$ square cm, how deep does it stand?',
  generator: {
    parameters: {
      q: { type: 'int', min: 3, max: 140 },
      s: { type: 'int', min: 2, max: 9 },
      h: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      B2: 'q',
      B: 'q*s',
      answer: 's*h',
      // Answered the depth it started at.
      d_usedGivenValue: 'h',
      // Answered the base area of the second tank.
      d_ratioReversed: 'B2',
      // Answered the volume rather than a depth.
      d_operationInverted: 'q*s*h',
    },
    constraints: ['s*h>7', 'abs(q-s*h)>4', 'abs(s*h-h)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['The water takes up ${{B}} \\times {{h}}$ cubic cm however it is poured.', 'Spread over a base of ${{B2}}$ it stands ${{answer}}$ cm deep.'],
  answerSummary: { headline: 'Volume stays fixed; base area and depth trade off.', text: 'It stands ${{answer}}$ cm deep.' },
  hint: 'Work out the volume before changing tanks.',
  feedback: 'A narrower base makes the same water stand deeper.',
});

mkc('8.6A', 'base-area-of-a-second-tank', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'Two tanks are the same height; one has base ${{B}}$ square cm and holds ${{V}}$ cubic cm, and the other holds ${{V2}}$. What is the second base area?',
  generator: {
    parameters: {
      h: { type: 'int', min: 2, max: 16 },
      w: { type: 'int', min: 2, max: 16 },
      B: { type: 'int', min: 4, max: 160 },
    },
    derived: {
      V: 'B*h',
      V2: 'h*h*w',
      answer: 'h*w',
      // Answered the second volume.
      d_forgotFinalStep: 'V2',
      // Divided by the height twice.
      d_partialTotal: 'w',
      // Answered the base area that was given.
      d_usedGivenValue: 'B',
    },
    constraints: ['h*w>7', 'abs(B-h*w)>4', 'abs(h*w-w)>3', 'B!=h*w'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The first tank gives the shared height as ${{V}} \\div {{B}} = {{h}}$ cm.', 'Dividing ${{V2}}$ by that height leaves a base of ${{answer}}$ square cm.'],
  answerSummary: { headline: 'Recover the shared height from the tank you know.', text: 'Its base is ${{answer}}$ square cm.' },
  hint: 'One tank is enough to fix the height.',
  feedback: 'A volume is not a base area; it still has the height folded in.',
});

mkc('8.6A', 'claim-about-widening-a-cylinder', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'grade8',
  prompt: 'A cylinder of radius ${{r}}$ cm and height ${{h}}$ cm holds $V = Bh$. Which statement is wrong?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 20 },
      h: { type: 'int', min: 2, max: 24 },
    },
    constraints: ['r!=h'],
  },
  choices: [
    { label: 'Doubling the radius doubles $B$.', correct: true },
    { label: 'Doubling the height doubles $V$.', error: 'partialTotal' },
    { label: '$B$ is the area of the circular face.', error: 'usedGivenValue' },
    { label: 'Doubling the radius makes $V$ four times as large.', error: 'exponentError' },
  ],
  reasoning: ['$B$ is $\\pi r^{2}$, so doubling ${{r}}$ makes it four times as large.', 'The height enters only once, so doubling it doubles $V$.'],
  answerSummary: { headline: 'The radius enters the base area twice over.', text: 'Doubling the radius quadruples $B$.' },
  hint: 'Write $B$ in terms of the radius before deciding.',
  feedback: 'The height really does scale the volume once for one.',
});

// ================================================================ 8.6B
// Cones against cylinders.

mkc('8.6B', 'extra-room-in-the-cylinder', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade8',
  prompt: 'A cone ${{h}}$ cm tall and a cylinder ${{h2}}$ cm tall share a radius of ${{r}}$ cm. How much more does the cylinder hold, in terms of $\\pi$?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 12 },
      g: { type: 'int', min: 1, max: 20 },
      h2: { type: 'int', min: 2, max: 30 },
    },
    derived: {
      h: '3*g',
      answer: 'r*r*(h2-g)',
      // Treated the cone as a second cylinder.
      d_forgotFinalStep: 'r*r*(h2-3*g)',
      // Answered the cone's volume.
      d_partialTotal: 'r*r*g',
      // Added the two volumes instead of comparing them.
      d_operationInverted: 'r*r*(h2+g)',
    },
    constraints: ['h2>g', 'r*r*(h2-g)>8', 'abs(h2-2*g)>1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['The cone holds $\\frac{{{r}}^{2} \\times {{h}}}{3}\\pi$, which is ${{r}}^{2} \\times {{g}}$ lots of $\\pi$.', 'The cylinder holds ${{r}}^{2} \\times {{h2}}$, leaving a gap of ${{answer}}\\pi$.'],
  answerSummary: { headline: 'Only the cone carries the thirding.', text: 'It is ${{answer}}\\pi$ cubic cm more.' },
  hint: 'Work out the cone first, with its third.',
  feedback: 'Treating the cone as a cylinder overstates it three times over.',
});

mkc('8.6B', 'cylinder-height-from-a-known-cone', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'A cone of radius ${{r}}$ cm and height ${{hCone}}$ cm holds ${{V}}\\pi$ cubic cm. How tall is a cylinder of the same radius holding ${{V2}}\\pi$?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 9 },
      g: { type: 'int', min: 2, max: 14 },
      z: { type: 'int', min: 2, max: 14 },
    },
    derived: {
      hCone: '3*g',
      V: 'r*r*g',
      V2: '3*r*r*z',
      answer: '3*z',
      // Answered the volume rather than a height.
      d_forgotFinalStep: 'V2',
      // Thirded a height that needed no thirding.
      d_operationInverted: 'z',
      // Answered the cone's height.
      d_usedGivenValue: 'hCone',
    },
    constraints: ['abs(g-z)>2', '3*z>7', 'abs(3*z-z)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['A cylinder of radius ${{r}}$ holds ${{r}}^{2}h\\pi$ cubic cm.', 'Setting that equal to ${{V2}}\\pi$ gives $h = {{answer}}$ cm.'],
  answerSummary: { headline: 'A cylinder needs no third, whatever the cone did.', text: 'It is ${{answer}}$ cm tall.' },
  hint: 'The cone is there to fix the radius, not the formula.',
  feedback: 'The thirding belongs to the cone alone.',
});

mkc('8.6B', 'heights-of-a-cone-and-cylinder-that-match', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'grade8',
  prompt: 'A cone and a cylinder share a radius of ${{r}}$ cm and hold the same volume. How do their heights compare?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 20 },
      h: { type: 'int', min: 2, max: 20 },
    },
    derived: { triple: '3*h' },
    constraints: ['r!=h'],
  },
  choices: [
    { label: 'The cone is three times as tall.', correct: true },
    { label: 'The cylinder is three times as tall.', error: 'ratioReversed' },
    { label: 'They are the same height.', error: 'usedGivenValue' },
    { label: 'The cone is nine times as tall.', error: 'exponentError' },
  ],
  reasoning: ['A cone holds a third of a cylinder on the same base and height.', 'To make up the shortfall its height has to be three times as great.'],
  answerSummary: { headline: 'Matching a third means tripling the height.', text: 'The cone is three times as tall.' },
  hint: 'Write both volumes with the same radius and compare.',
  feedback: 'The radius is shared, so the whole difference falls on the height.',
});

// ================================================================ 8.6C
// Squares on the sides of a right triangle.

mkc('8.6C', 'perimeter-of-the-square-on-the-longest-side', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade8',
  prompt: 'Squares on the two shorter sides of a right triangle cover ${{A}}$ and ${{B}}$ square cm. How much longer is the longest side than ${{e}}$ cm?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 6 },
      n: { type: 'int', min: 1, max: 5 },
      k: { type: 'int', min: 1, max: 2 },
      e: { type: 'int', min: 2, max: 90 },
    },
    derived: {
      a: 'k*(m*m-n*n)',
      b: 'k*2*m*n',
      c: 'k*(m*m+n*n)',
      A: 'k*k*(m*m-n*n)*(m*m-n*n)',
      B: 'k*k*4*m*m*n*n',
      answer: 'c-e',
      // Added the two lengths instead of comparing them.
      d_operationInverted: 'c+e',
      // Answered the length it was being compared with.
      d_partialTotal: 'e',
      // Compared the two the other way round.
      d_signError: 'e-c',
    },
    constraints: ['n<m', 'm*m-n*n>0', 'c-e>4', 'abs(2*e-c)>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['The square on the longest side covers ${{A}} + {{B}}$ square cm, so that side is ${{c}}$ cm.', 'That is ${{answer}}$ cm more than ${{e}}$ cm.'],
  answerSummary: { headline: 'The two smaller squares together give the largest one.', text: 'It is ${{answer}}$ cm longer.' },
  hint: 'Add the two areas, then take a square root.',
  feedback: 'The comparison runs from the longest side down to ${{e}}$ cm.',
});

mkc('8.6C', 'square-on-the-remaining-side', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'A right triangle has its longest side ${{c}}$ cm and one shorter side ${{a}}$ cm. What area does the square on the third side cover?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      n: { type: 'int', min: 1, max: 4 },
      k: { type: 'int', min: 1, max: 3 },
    },
    derived: {
      a: 'k*(m*m-n*n)',
      b: 'k*2*m*n',
      c: 'k*(m*m+n*n)',
      answer: 'k*k*4*m*m*n*n',
      // Added the two squares instead of subtracting.
      d_operationInverted: 'k*k*(m*m+n*n)*(m*m+n*n)+k*k*(m*m-n*n)*(m*m-n*n)',
      // Subtracted the sides instead of their squares.
      d_forgotFinalStep: 'k*(m*m+n*n)-k*(m*m-n*n)',
      // Answered the square on the side that was given.
      d_partialTotal: 'k*k*(m*m-n*n)*(m*m-n*n)',
    },
    constraints: ['n<m', 'm*m-n*n>0', 'abs(k*k*(m*m-n*n)*(m*m-n*n)-k*k*4*m*m*n*n)>5', 'k*2*m*n>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['The square on the longest side covers ${{c}}^{2}$, and the given side accounts for ${{a}}^{2}$ of it.', 'What is left is ${{answer}}$ square cm.'],
  answerSummary: { headline: 'The largest square is the total of the two smaller ones.', text: 'It covers ${{answer}}$ square cm.' },
  hint: 'Work with the areas, not the side lengths.',
  feedback: 'Subtracting the sides themselves leaves a length, not an area.',
});

mkc('8.6C', 'fact-that-shows-a-right-angle', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'grade8',
  prompt: 'Squares are drawn on the three sides of a triangle with sides ${{a}}$, ${{b}}$ and ${{c}}$ cm. Which fact would show it has a right angle?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 8 },
      n: { type: 'int', min: 1, max: 7 },
    },
    derived: {
      a: 'm*m-n*n',
      b: '2*m*n',
      c: 'm*m+n*n',
    },
    constraints: ['n<m', 'm*m-n*n>1'],
  },
  choices: [
    { label: 'The two smaller squares together cover exactly as much as the largest.', correct: true },
    { label: 'The three squares are all different sizes.', error: 'usedGivenValue' },
    { label: 'The largest square covers more than the other two together.', error: 'signError' },
    { label: 'All three side lengths are whole numbers.', error: 'roundedWrong' },
  ],
  reasoning: ['A right angle is exactly the case where the two smaller squares add to the largest.', 'Different sizes and whole-number sides happen in triangles with no right angle at all.'],
  answerSummary: { headline: 'Equality of the areas is the whole test.', text: 'The two smaller squares total the largest.' },
  hint: 'Recall what the theorem claims, and read it backwards.',
  feedback: 'If the largest square covers more, the angle opposite it is obtuse.',
});

// ================================================================ 8.7A
// Volume of cylinders, cones and spheres.

mkc('8.7A', 'space-left-round-a-sphere-in-a-drum', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade8',
  prompt: 'A sphere of radius ${{r}}$ cm sits in a drum of the same radius and height ${{h}}$ cm. How much space is left, in terms of $\\pi$?',
  generator: {
    parameters: {
      s: { type: 'int', min: 1, max: 8 },
      h: { type: 'int', min: 6, max: 50 },
    },
    derived: {
      r: '3*s',
      answer: '9*s*s*h-36*s*s*s',
      // Answered the drum's whole volume.
      d_forgotFinalStep: '9*s*s*h',
      // Answered the sphere's volume.
      d_partialTotal: '36*s*s*s',
      // Compared the two the other way round.
      d_signError: '36*s*s*s-9*s*s*h',
    },
    constraints: ['h>4*s', '9*s*s*h-36*s*s*s>8', 'abs(36*s*s*s-(9*s*s*h-36*s*s*s))>6'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['The drum holds ${{r}}^{2} \\times {{h}}\\pi$ and the sphere holds $\\frac{4}{3}{{r}}^{3}\\pi$.', 'The difference is ${{answer}}\\pi$ cubic cm.'],
  answerSummary: { headline: 'Work out both solids before subtracting.', text: '${{answer}}\\pi$ cubic cm are left.' },
  hint: 'The sphere uses the cube of the radius; the drum uses its square.',
  feedback: 'The drum is the larger of the two here, so the difference runs that way.',
});

mkc('8.7A', 'second-drum-of-the-same-height', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'A drum of radius ${{r}}$ cm holds ${{V}}\\pi$ cubic cm, and a second of the same height has radius ${{r2}}$ cm. What does the second hold?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 12 },
      r2: { type: 'int', min: 2, max: 14 },
      h: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      V: 'r*r*h',
      answer: 'r2*r2*h',
      // Answered the first drum's volume.
      d_usedGivenValue: 'V',
      // Doubled the radius before squaring it.
      d_diameterForRadius: '4*r2*r2*h',
      // Answered the shared height.
      d_forgotFinalStep: 'h',
    },
    constraints: ['r!=r2', 'r2*r2*h>9', 'abs(r-r2)>1', 'abs(r2*r2*h-h)>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_diameterForRadius}}'), error: 'diameterForRadius' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['The first drum gives the shared height as ${{V}} \\div {{r}}^{2} = {{h}}$ cm.', 'The second then holds ${{r2}}^{2} \\times {{h}} = {{answer}}$ lots of $\\pi$.'],
  answerSummary: { headline: 'Recover the shared height, then rebuild with the new radius.', text: 'It holds ${{answer}}\\pi$ cubic cm.' },
  hint: 'Divide out the first radius squared.',
  feedback: 'A radius is not a diameter; squaring it twice over inflates the answer fourfold.',
});

mkc('8.7A', 'claim-about-widening-a-drum', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'grade8',
  prompt: 'A cylinder, a cone and a sphere share a radius of ${{r}}$ cm, and the cylinder and cone stand ${{h}}$ cm tall. Which statement is wrong?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 18 },
      h: { type: 'int', min: 2, max: 24 },
    },
    constraints: ['r!=h'],
  },
  choices: [
    { label: 'Doubling the radius doubles what the cylinder holds.', correct: true },
    { label: 'The cone holds a third of what the cylinder holds.', error: 'partialTotal' },
    { label: 'Doubling the height doubles what the cylinder holds.', error: 'usedGivenValue' },
    { label: 'The sphere holds $\\frac{4}{3}\\pi {{r}}^{3}$ whatever the height.', error: 'ratioReversed' },
  ],
  reasoning: ['A cylinder holds $\\pi r^{2}h$, so the radius enters twice and the height once.', 'Doubling the radius therefore makes it four times as large.'],
  answerSummary: { headline: 'The radius is squared; the height is not.', text: 'Doubling the radius quadruples it.' },
  hint: 'Write the formula out before testing each claim.',
  feedback: 'The cone really does hold a third, and the sphere ignores the height entirely.',
});

// ================================================================ 8.7B
// Surface area of cylinders.

mkc('8.7B', 'surface-of-an-open-tin', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade8',
  prompt: 'A tin of radius ${{r}}$ cm and height ${{h}}$ cm has no lid. What is its surface area, in terms of $\\pi$?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 40 },
      h: { type: 'int', min: 2, max: 24 },
    },
    derived: {
      answer: '2*r*h+r*r',
      // Left the base out as well.
      d_forgotFinalStep: '2*r*h',
      // Counted both ends.
      d_operationInverted: '2*r*h+2*r*r',
      // Answered the two circular faces on their own.
      d_partialTotal: '2*r*r',
    },
    constraints: ['abs(2*r*r-2*r*h-r*r)>5', 'r!=h', '2*r*h+r*r>9'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['The curved surface is $2{{r}}{{h}}\\pi$ and the base is ${{r}}^{2}\\pi$.', 'Together they come to ${{answer}}\\pi$ square cm.'],
  answerSummary: { headline: 'Count the faces the tin actually has.', text: 'It is ${{answer}}\\pi$ square cm.' },
  hint: 'An open tin has one circular face, not two.',
  feedback: 'Leaving both ends out drops the base the tin still has.',
});

mkc('8.7B', 'height-from-a-curved-surface', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'The curved surface of a tin of radius ${{r}}$ cm covers ${{S}}\\pi$ square cm. How tall is it?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 36 },
      z: { type: 'int', min: 2, max: 16 },
    },
    derived: {
      h: '2*z',
      S: '4*r*z',
      answer: '2*z',
      // Answered the surface rather than a height.
      d_forgotFinalStep: 'S',
      // Left the factor of two out.
      d_diameterForRadius: 'z',
      // Answered the radius that was given.
      d_usedGivenValue: 'r',
    },
    constraints: ['abs(r-2*z)>3', '2*z>5', 'abs(2*z-z)>2'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_diameterForRadius}}'), error: 'diameterForRadius' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The curved surface unrolls into a rectangle $2{{r}}\\pi$ across and $h$ tall.', 'So $h = {{S}} \\div (2 \\times {{r}}) = {{answer}}$ cm.'],
  answerSummary: { headline: 'The unrolled width is the circumference, not the radius.', text: 'It is ${{answer}}$ cm tall.' },
  hint: 'Divide by the whole circumference.',
  feedback: 'Dividing by the radius alone leaves a factor of two behind.',
});

mkc('8.7B', 'what-widening-and-shortening-does', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'verbal', courseId: 'grade8',
  prompt: 'A tin of radius ${{r}}$ cm and height ${{h}}$ cm has its radius doubled and its height halved. Which statement is true?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 16 },
      h: { type: 'int', min: 4, max: 24, step: 2 },
    },
    constraints: ['r!=h'],
  },
  choices: [
    { label: 'The curved surface is unchanged but the total is not.', correct: true },
    { label: 'The total surface is unchanged.', error: 'usedGivenValue' },
    { label: 'The curved surface doubles.', error: 'operationInverted' },
    { label: 'Nothing about the surface changes.', error: 'partialTotal' },
  ],
  reasoning: ['The curved surface is $2\\pi rh$, and doubling one factor while halving the other leaves it alone.', 'The two circular ends are $2\\pi r^{2}$, which grows fourfold.'],
  answerSummary: { headline: 'The ends depend on the radius alone.', text: 'The curved surface holds; the total grows.' },
  hint: 'Split the surface into the curved part and the ends.',
  feedback: 'The ends carry no height at all, so they cannot be left unchanged.',
});

// ================================================================ 8.7C
// The Pythagorean theorem in use.

mkc('8.7C', 'how-far-a-brace-exceeds-a-side', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade8',
  prompt: 'A gate ${{a}}$ cm by ${{b}}$ cm is braced corner to corner. By how much does the brace exceed the shorter side?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 8 },
      n: { type: 'int', min: 1, max: 7 },
      k: { type: 'int', min: 1, max: 4 },
    },
    derived: {
      a: 'k*(m*m-n*n)',
      b: 'k*2*m*n',
      c: 'k*(m*m+n*n)',
      answer: 'c-min(a,b)',
      // Added the brace to the side instead of comparing them.
      d_operationInverted: 'c+min(a,b)',
      // Answered the shorter side itself.
      d_partialTotal: 'min(a,b)',
      // Compared the two the other way round.
      d_signError: 'min(a,b)-c',
    },
    constraints: ['n<m', '5*m>6*n', 'm<6*n', 'm*m-n*n>0', 'c-min(a,b)>3', 'abs(2*min(a,b)-c)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['The brace runs $\\sqrt{{{a}}^{2} + {{b}}^{2}} = {{c}}$ cm.', 'That is ${{answer}}$ cm more than the shorter side.'],
  answerSummary: { headline: 'Find the diagonal first, then compare.', text: 'It exceeds it by ${{answer}}$ cm.' },
  hint: 'The brace is the longest side of the right triangle.',
  feedback: 'The brace is longer than either side, so the difference runs that way.',
});

mkc('8.7C', 'gate-height-a-brace-demands', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'A brace of ${{d}}$ cm is to run corner to corner on a gate ${{a}}$ cm wide. How tall must the gate be?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      n: { type: 'int', min: 1, max: 4 },
      k: { type: 'int', min: 1, max: 3 },
    },
    derived: {
      a: 'k*(m*m-n*n)',
      answer: 'k*2*m*n',
      d: 'k*(m*m+n*n)',
      // Added the width to the brace.
      d_operationInverted: 'k*(m*m+n*n)+k*(m*m-n*n)',
      // Subtracted the sides instead of their squares.
      d_forgotFinalStep: 'k*(m*m+n*n)-k*(m*m-n*n)',
      // Answered the width that was given.
      d_usedGivenValue: 'k*(m*m-n*n)',
    },
    constraints: ['n<m', 'm*m-n*n>0', 'k*2*m*n>5', 'abs(k*(m*m-n*n)-k*2*m*n)>3', 'abs(k*(m*m+n*n)-k*(m*m-n*n)-k*2*m*n)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The brace and the width are two sides of a right triangle, with the brace longest.', 'The height is $\\sqrt{{{d}}^{2} - {{a}}^{2}} = {{answer}}$ cm.'],
  answerSummary: { headline: 'Subtract the squares, then take the root.', text: 'It must be ${{answer}}$ cm tall.' },
  hint: 'The brace is the side opposite the right angle.',
  feedback: 'Subtracting the lengths themselves skips the squaring the theorem needs.',
});

mkc('8.7C', 'gate-that-cannot-take-its-brace', {
  difficultyBand: 4, dok: 3, taskType: 'errorAnalysis', representation: 'table', courseId: 'grade8',
  prompt: 'Three of these gates take the brace listed beside them and one does not. Which row is wrong?',
  stimulus: {
    kind: 'table',
    columns: ['Row', 'Width (cm)', 'Height (cm)', 'Brace (cm)'],
    rows: [
      ['$1$', '${{a1}}$', '${{b1}}$', '${{c1}}$'],
      ['$2$', '${{a2}}$', '${{b2}}$', '${{c2}}$'],
      ['$3$', '${{a3}}$', '${{b3}}$', '${{cBad}}$'],
      ['$4$', '${{a4}}$', '${{b4}}$', '${{c4}}$'],
    ],
  },
  generator: {
    parameters: {
      k1: { type: 'int', min: 1, max: 5 },
      k2: { type: 'int', min: 1, max: 5 },
      k3: { type: 'int', min: 1, max: 5 },
      k4: { type: 'int', min: 1, max: 5 },
      off: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      a1: '3*k1', b1: '4*k1', c1: '5*k1',
      a2: '5*k2', b2: '12*k2', c2: '13*k2',
      a3: '8*k3', b3: '15*k3', cBad: '17*k3+off',
      a4: '7*k4', b4: '24*k4', c4: '25*k4',
    },
    constraints: ['off>1', 'k1!=k2', 'k3!=k4'],
  },
  choices: [
    { label: 'Row $3$', correct: true },
    { label: 'Row $1$', error: 'usedGivenValue' },
    { label: 'Row $2$', error: 'partialTotal' },
    { label: 'Row $4$', error: 'ratioReversed' },
  ],
  reasoning: ['In three rows the two sides squared add to the brace squared.', 'Row $3$ needs a brace of $17 \\times {{k3}}$ cm, so the one listed is too long.'],
  answerSummary: { headline: 'Square the two sides and compare with the brace squared.', text: 'Row $3$ is wrong.' },
  hint: 'Test each row against the theorem in turn.',
  feedback: 'The other three rows are all right-angled as listed.',
});

// ================================================================ 8.7D
// Distance between two points.

mkc('8.7D', 'saving-from-cutting-the-corner', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'orderedPairs', courseId: 'grade8',
  prompt: 'How much shorter is the straight line from $({{x1}}, {{y1}})$ to $({{x2}}, {{y2}})$ than going across and then up?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 7 },
      n: { type: 'int', min: 1, max: 6 },
      k: { type: 'int', min: 1, max: 2 },
      x1: { type: 'int', min: 1, max: 12 },
      y1: { type: 'int', min: 1, max: 12 },
    },
    derived: {
      a: 'k*(m*m-n*n)',
      b: 'k*2*m*n',
      c: 'k*(m*m+n*n)',
      x2: 'x1+k*(m*m-n*n)',
      y2: 'y1+k*2*m*n',
      answer: 'k*(m*m-n*n)+k*2*m*n-k*(m*m+n*n)',
      // Added all three lengths.
      d_operationInverted: 'k*(m*m-n*n)+k*2*m*n+k*(m*m+n*n)',
      // Answered the straight line itself.
      d_partialTotal: 'k*(m*m+n*n)',
      // Compared the two the other way round.
      d_signError: 'k*(m*m+n*n)-k*(m*m-n*n)-k*2*m*n',
    },
    constraints: ['n<m', 'm*m-n*n>0', 'k*(m*m-n*n)+k*2*m*n-k*(m*m+n*n)>3', 'abs(k*(m*m+n*n)-2*(k*(m*m-n*n)+k*2*m*n-k*(m*m+n*n)))>4'],
  },
  choices: [
    { label: 'Shorter by ${{answer}}$.', correct: true },
    { label: 'Shorter by ${{d_operationInverted}}$.', error: 'operationInverted' },
    { label: 'Shorter by ${{d_partialTotal}}$.', error: 'partialTotal' },
    { label: 'Longer by ${{d_signError}}$.', error: 'signError' },
  ],
  reasoning: ['Going across and up covers ${{a}} + {{b}}$, while the straight line covers ${{c}}$.', 'The saving is ${{answer}}$.'],
  answerSummary: { headline: 'The straight line is the hypotenuse of the two moves.', text: 'It is shorter by ${{answer}}$.' },
  hint: 'Work out each route separately before comparing.',
  feedback: 'The straight line is shorter than the two moves added together.',
});

mkc('8.7D', 'height-of-a-point-at-a-set-distance', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'A point $({{x2}}, y)$ sits ${{c}}$ from $({{x1}}, {{y1}})$ and above it. What is $y$?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 9 },
      n: { type: 'int', min: 1, max: 4 },
      k: { type: 'int', min: 1, max: 2 },
      x1: { type: 'int', min: 1, max: 14 },
      y1: { type: 'int', min: 1, max: 30 },
    },
    derived: {
      a: 'k*(m*m-n*n)',
      b: 'k*2*m*n',
      c: 'k*(m*m+n*n)',
      x2: 'x1+k*(m*m-n*n)',
      answer: 'y1+k*2*m*n',
      // Used the whole distance as the rise.
      d_forgotFinalStep: 'y1+k*(m*m+n*n)',
      // Never moved up at all.
      d_usedGivenValue: 'y1',
      // Used the horizontal move as the rise.
      d_ratioReversed: 'y1+k*(m*m-n*n)',
    },
    constraints: ['n<m', 'm*m-n*n>0', 'abs(k*(m*m-n*n)-k*2*m*n)>3', 'k*2*m*n>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['The horizontal move is ${{a}}$, so the vertical move satisfies ${{a}}^{2} + b^{2} = {{c}}^{2}$.', 'That gives ${{b}}$, so $y = {{answer}}$.'],
  answerSummary: { headline: 'The distance is the hypotenuse, not either move.', text: '$y = {{answer}}$.' },
  hint: 'Find the horizontal move first.',
  feedback: 'The whole distance covers both moves, so it cannot be the rise on its own.',
});

mkc('8.7D', 'pair-the-same-distance-apart', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'orderedPairs', courseId: 'grade8',
  prompt: 'Which pair of points is the same distance apart as $({{x1}}, {{y1}})$ and $({{x2}}, {{y2}})$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 14 },
      b: { type: 'int', min: 2, max: 14 },
      x1: { type: 'int', min: 1, max: 12 },
      y1: { type: 'int', min: 1, max: 12 },
      p: { type: 'int', min: 13, max: 30 },
      q: { type: 'int', min: 13, max: 30 },
      off: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      x2: 'x1+a',
      y2: 'y1+b',
      px: 'p+a', py: 'q+b',
      ox: 'p+a', oy: 'q+b+off',
      sx: 'p+a+b', sy: 'q',
      dx: 'p+2*a', dy: 'q+2*b',
    },
    constraints: ['a!=b', 'off>1'],
  },
  choices: [
    { label: plain('({{p}}, {{q}}) \\text{ and } ({{px}}, {{py}})'), correct: true },
    { label: plain('({{p}}, {{q}}) \\text{ and } ({{ox}}, {{oy}})'), error: 'offByOneStep' },
    { label: plain('({{p}}, {{q}}) \\text{ and } ({{sx}}, {{sy}})'), error: 'partialTotal' },
    { label: plain('({{p}}, {{q}}) \\text{ and } ({{dx}}, {{dy}})'), error: 'exponentError' },
  ],
  reasoning: ['Distance depends only on the horizontal and vertical moves, here ${{a}}$ and ${{b}}$.', 'Only the first pair repeats both moves exactly.'],
  answerSummary: { headline: 'The same two moves give the same distance, wherever they start.', text: 'It is $({{p}}, {{q}})$ and $({{px}}, {{py}})$.' },
  hint: 'Work out the two moves for each pair.',
  feedback: 'Adding the two moves together along one axis gives a longer separation.',
});

// ================================================================ 8.8A
// Setting up equations with the unknown on both sides.

mkc('8.8A', 'equation-for-two-plans-with-a-rebate', {
  difficultyBand: 4, dok: 2, taskType: 'representationTranslation', representation: 'symbolic', courseId: 'grade8',
  prompt: 'Plan A costs $\\${{b1}}$ plus $\\${{m1}}$ a month, and Plan B $\\${{b2}}$ plus $\\${{m2}}$ a month less a $\\${{d}}$ rebate at the end. Which equation says they match over $x$ months?',
  generator: {
    parameters: {
      b1: { type: 'int', min: 10, max: 200 },
      b2: { type: 'int', min: 10, max: 200 },
      m1: { type: 'int', min: 5, max: 60 },
      m2: { type: 'int', min: 5, max: 60 },
      d: { type: 'int', min: 5, max: 80 },
    },
    constraints: ['m1!=m2', 'b1!=b2', 'd<b2'],
  },
  choices: [
    { label: plain('{{m1}}x + {{b1}} = {{m2}}x + {{b2}} - {{d}}'), correct: true },
    { label: plain('{{m1}}x + {{b1}} = {{m2}}x + {{b2}} + {{d}}'), error: 'signError' },
    { label: plain('{{m1}}x + {{b1}} = ({{m2}} - {{d}})x + {{b2}}'), error: 'orderOfOperations' },
    { label: plain('{{m1}}x + {{b1}} - {{d}} = {{m2}}x + {{b2}}'), error: 'operationInverted' },
  ],
  reasoning: ['Each side charges a monthly rate times $x$ plus a one-off amount.', 'The rebate is a one-off reduction on Plan B, so it comes off that side only.'],
  answerSummary: { headline: 'One-off amounts stay outside the term that carries $x$.', text: 'It is ${{m1}}x + {{b1}} = {{m2}}x + {{b2}} - {{d}}$.' },
  hint: 'Ask which charges depend on the number of months.',
  feedback: 'Folding the rebate into the monthly rate applies it every month.',
});

mkc('8.8A', 'monthly-charge-that-levels-two-plans', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'Plan A costs $\\${{b1}}$ plus $\\$m$ a month and Plan B $\\${{b2}}$ plus $\\${{m2}}$ a month, and they match after ${{x}}$ months. What is $m$?',
  generator: {
    parameters: {
      b1: { type: 'int', min: 10, max: 200 },
      g: { type: 'int', min: 2, max: 12 },
      x: { type: 'int', min: 2, max: 16 },
      m2: { type: 'int', min: 5, max: 70 },
    },
    derived: {
      b2: 'b1+g*x',
      answer: 'm2+g',
      // Added the whole gap in fees to the rate.
      d_forgotFinalStep: 'm2+g*x',
      // Answered the gap in fees.
      d_usedGivenValue: 'g*x',
      // Took the gap off instead of adding it.
      d_operationInverted: 'm2-g',
    },
    constraints: ['m2-g>2', 'abs(g*x-m2-g)>4', 'x>1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['Plan B starts ${{g}} \\times {{x}}$ dollars dearer, so Plan A must make that up over ${{x}}$ months.', 'That needs ${{g}}$ more a month, or ${{answer}}$.'],
  answerSummary: { headline: 'Spread the fee gap over the months to get the rate gap.', text: '$m = {{answer}}$.' },
  hint: 'Work out how much of the fee gap each month has to cover.',
  feedback: 'The whole fee gap is closed over ${{x}}$ months, not in one.',
});

mkc('8.8A', 'claim-about-life-either-side-of-the-crossing', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'grade8',
  prompt: 'Two plans with different monthly charges cost the same after ${{x}}$ months. Which statement is wrong?',
  generator: {
    parameters: {
      x: { type: 'int', min: 3, max: 24 },
      m1: { type: 'int', min: 5, max: 60 },
      m2: { type: 'int', min: 5, max: 60 },
    },
    constraints: ['m1!=m2'],
  },
  choices: [
    { label: 'One plan is cheaper both before month ${{x}}$ and after it.', correct: true },
    { label: 'Before month ${{x}}$ one is cheaper, and after it the other is.', error: 'partialTotal' },
    { label: 'At month ${{x}}$ the two totals are equal.', error: 'usedGivenValue' },
    { label: 'The plan with the smaller monthly charge wins in the long run.', error: 'ratioReversed' },
  ],
  reasoning: ['The plan with the smaller monthly charge gains ground steadily.', 'Since they are equal at month ${{x}}$, the lead has to change hands there.'],
  answerSummary: { headline: 'A single crossing point swaps which plan is cheaper.', text: 'One plan cannot lead throughout.' },
  hint: 'Compare the two totals at one month and at twice that.',
  feedback: 'Equal totals at ${{x}}$ months is exactly what the crossing means.',
});

// ================================================================ 8.8C
// Solving with the unknown on both sides.

mkc('8.8C', 'solve-across-a-bracket', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade8',
  prompt: 'Solve ${{m1}}x + {{b1}} = {{m2}}(x - {{c}})$.',
  generator: {
    parameters: {
      m1: { type: 'int', min: 2, max: 9 },
      gap: { type: 'int', min: 2, max: 4 },
      w: { type: 'int', min: 2, max: 14 },
      u: { type: 'int', min: 6, max: 40 },
    },
    derived: {
      m2: 'm1+gap',
      c: 'gap*w/(m1+gap)',
      b1: 'gap*u-gap*w-m1*0',
      answer: 'u-w',
      // Stopped at the numerator.
      d_forgotFinalStep: 'gap*(u-w)',
      // Answered the amount inside the bracket.
      d_usedGivenValue: 'gap*w',
      // Took the bracket's contribution off twice.
      d_operationInverted: 'u-2*w',
    },
    constraints: ['gap*w%(m1+gap)==0', 'u-2*w>2', 'gap*u-gap*w>0', 'abs(gap*w-(u-w))>4', 'u-w>7'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['Expanding gives ${{m1}}x + {{b1}} = {{m2}}x - {{m2}} \\times {{c}}$.', 'Collecting leaves $({{m2}} - {{m1}})x = {{b1}} + {{m2}} \\times {{c}}$, so $x = {{answer}}$.'],
  answerSummary: { headline: 'Expand the bracket before collecting anything.', text: '$x = {{answer}}$.' },
  hint: 'The ${{m2}}$ multiplies both terms inside the bracket.',
  feedback: 'The collected numerator still has to be divided by the difference in coefficients.',
});

mkc('8.8C', 'constant-that-puts-the-crossing-in-place', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'For which $c$ does ${{m1}}x + {{b1}} = {{m2}}x + c$ have the solution $x = {{v}}$?',
  generator: {
    parameters: {
      m1: { type: 'int', min: 2, max: 12 },
      gap: { type: 'int', min: 4, max: 20 },
      v: { type: 'int', min: 4, max: 20 },
      b1: { type: 'int', min: 40, max: 400 },
    },
    derived: {
      m2: 'm1+gap',
      answer: 'b1-gap*v',
      // Answered the constant that was given.
      d_usedGivenValue: 'b1',
      // Answered the amount the two sides differ by.
      d_ratioReversed: 'gap*v',
      // Took the difference the other way round.
      d_signError: 'gap*v-b1',
    },
    constraints: ['b1-gap*v>4', 'abs(gap*v-(b1-gap*v))>4', 'gap*v>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['At $x = {{v}}$ the left side comes to ${{m1}} \\times {{v}} + {{b1}}$.', 'Matching the right side gives $c = {{b1}} - {{gap}} \\times {{v}} = {{answer}}$.'],
  answerSummary: { headline: 'Substitute the solution and read off what is missing.', text: '$c = {{answer}}$.' },
  hint: 'The two $x$ terms differ by ${{gap}}$ for each unit of $x$.',
  feedback: 'The difference comes off the given constant, not the other way round.',
});

mkc('8.8C', 'what-a-false-statement-settles', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'verbal', courseId: 'grade8',
  prompt: 'An equation with $x$ on both sides simplifies to ${{a}} = {{b}}$. What does that mean?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 60 },
      b: { type: 'int', min: 2, max: 60 },
    },
    constraints: ['a!=b'],
  },
  choices: [
    { label: 'It has no solutions at all.', correct: true },
    { label: 'Every value of $x$ satisfies it.', error: 'operationInverted' },
    { label: 'It has exactly one solution.', error: 'partialTotal' },
    { label: 'It simply has not been simplified far enough.', error: 'usedGivenValue' },
  ],
  reasoning: ['The $x$ terms cancelled, leaving a claim that does not depend on $x$ at all.', 'Since ${{a}}$ is not ${{b}}$, no value of $x$ can make the equation true.'],
  answerSummary: { headline: 'A false statement with no $x$ left means no solutions.', text: 'There are none.' },
  hint: 'Ask whether any choice of $x$ could change the two sides.',
  feedback: 'Every value would satisfy it only if the leftover statement were true.',
});

// ================================================================ 8.8D
// Angle relationships in triangles and on transversals.

mkc('8.8D', 'gap-between-two-exterior-angles', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade8',
  prompt: 'A triangle has interior angles of ${{a}}^\\circ$ and ${{b}}^\\circ$ at two vertices. How much larger is the exterior angle at the third vertex than the one at the first?',
  generator: {
    parameters: {
      a: { type: 'int', min: 60, max: 168 },
      b: { type: 'int', min: 6, max: 88 },
    },
    derived: {
      answer: '2*a+b-180',
      // Answered the larger exterior angle.
      d_partialTotal: 'a+b',
      // Answered the exterior angle at the first vertex.
      d_usedGivenValue: '180-a',
      // Compared the two the other way round.
      d_signError: '180-2*a-b',
    },
    constraints: ['a+b<175', '2*a+b-180>6', 'abs(2*(180-a)-(a+b))>6'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['The exterior angle at the third vertex is ${{a}} + {{b}}$, and the one at the first is $180 - {{a}}$.', 'The difference is ${{answer}}^\\circ$.'],
  answerSummary: { headline: 'An exterior angle equals the two remote interior angles.', text: 'It is ${{answer}}^\\circ$ larger.' },
  hint: 'Work out both exterior angles before comparing.',
  feedback: 'The exterior angle at the first vertex sits on a straight line with ${{a}}^\\circ$.',
});

mkc('8.8D', 'third-angle-from-an-exterior-one', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'An exterior angle of a triangle measures ${{e}}^\\circ$ and one remote interior angle is ${{a}}^\\circ$. What is the third interior angle?',
  generator: {
    parameters: {
      e: { type: 'int', min: 95, max: 170 },
      a: { type: 'int', min: 20, max: 120 },
    },
    derived: {
      answer: '180-e',
      // Answered the other remote interior angle.
      d_usedGivenValue: 'e-a',
      // Answered the exterior angle itself.
      d_operationInverted: 'e',
      // Took the given interior angle off as well.
      d_partialTotal: '180-e-a',
    },
    constraints: ['a<e', '180-e>10', '180-e-a>0', 'abs(e-a-(180-e))>5'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['The exterior angle sits on a straight line with the interior angle at the same vertex.', 'So that interior angle is $180 - {{e}} = {{answer}}^\\circ$.'],
  answerSummary: { headline: 'The third angle is the one beside the exterior angle.', text: 'It is ${{answer}}^\\circ$.' },
  hint: 'Ask which vertex the exterior angle belongs to.',
  feedback: 'Subtracting the remote angle gives the other remote angle, not the third one.',
});

mkc('8.8D', 'claim-about-angles-on-a-transversal', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'grade8',
  prompt: 'Parallel lines are cut by a transversal and one angle measures ${{a}}^\\circ$. Which statement is wrong?',
  generator: {
    parameters: { a: { type: 'int', min: 25, max: 155 } },
    derived: { sup: '180-a' },
    constraints: ['a!=90'],
  },
  choices: [
    { label: 'The angle inside the parallels on the same side is also ${{a}}^\\circ$.', correct: true },
    { label: 'The corresponding angle is ${{a}}^\\circ$.', error: 'partialTotal' },
    { label: 'The alternate angle is ${{a}}^\\circ$.', error: 'usedGivenValue' },
    { label: 'The angle beside it on the same line is ${{sup}}^\\circ$.', error: 'ratioReversed' },
  ],
  reasoning: ['Angles inside the parallels on the same side of the transversal add to $180^\\circ$.', 'So that angle is ${{sup}}^\\circ$, not ${{a}}^\\circ$.'],
  answerSummary: { headline: 'Same-side interior angles are supplementary, not equal.', text: 'That angle is ${{sup}}^\\circ$.' },
  hint: 'Sketch the two parallels and mark every angle.',
  feedback: 'Corresponding and alternate angles really are equal.',
});

// ================================================================ 8.9
// Two linear equations at once.

mkc('8.9', 'sum-of-the-crossing-coordinates', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'grade8',
  prompt: 'Lines $y = {{m1}}x + {{b1}}$ and $y = {{m2}}x + {{b2}}$ cross once. What is the total of the crossing point\'s coordinates?',
  generator: {
    parameters: {
      m1: { type: 'int', min: 3, max: 14 },
      gap: { type: 'int', min: 2, max: 10 },
      u: { type: 'int', min: 2, max: 16 },
      b1: { type: 'int', min: 3, max: 100 },
    },
    derived: {
      m2: 'm1-gap',
      b2: 'b1+gap*u',
      yAt: 'm1*u+b1',
      answer: 'u+m1*u+b1',
      // Answered the input only.
      d_forgotFinalStep: 'u',
      // Answered the total of the two crossing values on the axis.
      d_usedGivenValue: 'b1+b2',
      // Added a second crossing value by mistake.
      d_orderOfOperations: 'u+m1*u+b1+b2',
    },
    constraints: ['m1-gap>0', 'abs(b1+b2-(u+m1*u+b1))>5', 'u+m1*u+b1>12'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_orderOfOperations}}'), error: 'orderOfOperations' },
  ],
  reasoning: ['Setting the two rules equal gives $x = {{u}}$, and either rule then gives $y = {{yAt}}$.', 'Their total is ${{answer}}$.'],
  answerSummary: { headline: 'Solve for the input, then read the output off either line.', text: 'It is ${{answer}}$.' },
  hint: 'The crossing point satisfies both equations at once.',
  feedback: 'The input alone is only half of the point.',
});

mkc('8.9', 'third-line-through-the-same-crossing', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'grade8',
  prompt: 'Two lines cross at $({{u}}, {{y}})$, and a third line $y = {{m3}}x + c$ passes through the same point. What is $c$?',
  generator: {
    parameters: {
      u: { type: 'int', min: 2, max: 16 },
      m3: { type: 'int', min: 2, max: 14 },
      c: { type: 'int', min: 5, max: 120 },
    },
    derived: {
      y: 'm3*u+c',
      answer: 'c',
      // Answered the height of the crossing point.
      d_usedGivenValue: 'y',
      // Answered the part the slope contributes.
      d_ratioReversed: 'm3*u',
      // Took the difference the other way round.
      d_signError: 'm3*u-y',
    },
    constraints: ['abs(m3*u-c)>4', 'c>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['The third line must satisfy ${{y}} = {{m3}} \\times {{u}} + c$.', 'That gives $c = {{answer}}$.'],
  answerSummary: { headline: 'A shared point is one equation the third line has to satisfy.', text: '$c = {{answer}}$.' },
  hint: 'Put the crossing point into the third equation.',
  feedback: 'The height of the point still has the slope term inside it.',
});

mkc('8.9', 'claim-about-two-parallel-lines', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'grade8',
  prompt: 'Two lines have slope ${{m}}$ and cross the vertical axis at ${{b1}}$ and ${{b2}}$. Which statement is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 16 },
      b1: { type: 'int', min: 2, max: 90 },
      b2: { type: 'int', min: 2, max: 90 },
    },
    constraints: ['b1!=b2'],
  },
  choices: [
    { label: 'They cross at exactly one point.', correct: true },
    { label: 'They never cross.', error: 'operationInverted' },
    { label: 'No pair of values satisfies both equations.', error: 'partialTotal' },
    { label: 'They stay the same distance apart.', error: 'usedGivenValue' },
  ],
  reasoning: ['Equal slopes means the two lines rise at the same rate for every step.', 'Different crossing points then keep them permanently apart.'],
  answerSummary: { headline: 'Same slope, different intercept means no crossing at all.', text: 'They never cross.' },
  hint: 'Try to solve the two equations together and see what happens.',
  feedback: 'A gap of ${{b1}} - {{b2}}$ is carried at every value of $x$.',
});

// ================================================================ A.2A
// Domain and range of a linear function.

mkc('A.2A', 'width-of-a-range-over-a-closed-domain', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'For $f(x) = {{m}}x + {{b}}$ on ${{lo}} \\le x \\le {{hi}}$, how wide is the range?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 14 },
      b: { type: 'int', min: 2, max: 160 },
      lo: { type: 'int', min: 1, max: 12 },
      span: { type: 'int', min: 2, max: 16 },
    },
    derived: {
      hi: 'lo+span',
      answer: 'm*span',
      // Added the two endpoints instead of subtracting.
      d_operationInverted: 'm*(2*lo+span)',
      // Answered the width of the domain.
      d_forgotFinalStep: 'span',
      // Answered the constant on its own.
      d_usedGivenValue: 'b',
    },
    constraints: ['m*span>9', 'abs(b-m*span)>5', 'abs(span-m*span)>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Across the domain $x$ moves ${{span}}$, and each step of $1$ moves $f$ by ${{m}}$.', 'So the range is ${{answer}}$ wide.'],
  answerSummary: { headline: 'The range width is the slope times the domain width.', text: 'It is ${{answer}}$ wide.' },
  hint: 'The constant shifts both endpoints equally and cancels.',
  feedback: 'The constant shifts the range but does not change how wide it is.',
});

mkc('A.2A', 'domain-endpoint-behind-a-range', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'For $f(x) = {{m}}x + {{b}}$ on ${{lo}} \\le x \\le h$ the range tops out at ${{fhi}}$. What is $h$?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 12 },
      j: { type: 'int', min: 2, max: 6 },
      h: { type: 'int', min: 6, max: 40 },
      lo: { type: 'int', min: 1, max: 20 },
    },
    derived: {
      b: 'm*j',
      fhi: 'm*h+m*j',
      answer: 'h',
      // Answered the top of the range.
      d_forgotFinalStep: 'fhi',
      // Answered the constant term.
      d_usedGivenValue: 'b',
      // Added the constant instead of removing it.
      d_signError: 'h-2*j',
    },
    constraints: ['h-2*j>2', 'abs(b-h)>4', 'lo<h', 'h>5'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['The top of the range comes from the top of the domain, so ${{m}}h + {{b}} = {{fhi}}$.', 'That gives $h = {{answer}}$.'],
  answerSummary: { headline: 'A rising function sends the largest input to the largest output.', text: '$h = {{answer}}$.' },
  hint: 'Remove the constant before dividing by the slope.',
  feedback: 'The constant is part of the output, not an input.',
});

mkc('A.2A', 'claim-about-a-range-on-a-closed-domain', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra1',
  prompt: 'For $f(x) = {{m}}x + {{b}}$ on ${{lo}} \\le x \\le {{hi}}$, which statement is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 14 },
      b: { type: 'int', min: 2, max: 50 },
      lo: { type: 'int', min: 1, max: 10 },
      span: { type: 'int', min: 3, max: 16 },
    },
    derived: { hi: 'lo+span', count: 'span+1' },
    constraints: ['span>2'],
  },
  choices: [
    { label: 'The range runs from $f({{lo}})$ up to $f({{hi}})$ whatever sign ${{m}}$ has.', correct: true },
    { label: 'The range is a closed interval.', error: 'partialTotal' },
    { label: 'The domain contains ${{count}}$ whole numbers.', error: 'usedGivenValue' },
    { label: 'Each output in the range comes from exactly one input.', error: 'ratioReversed' },
  ],
  reasoning: ['A negative slope would send the largest input to the smallest output.', 'The endpoints of the range would then be the other way round.'],
  answerSummary: { headline: 'The sign of the slope decides which endpoint is which.', text: 'The claim ignores a negative slope.' },
  hint: 'Ask what a falling function does to the two endpoints.',
  feedback: 'A closed domain really does give a closed range for a linear function.',
});

// ================================================================ A.2B
// Writing the equation of a line.

mkc('A.2B', 'parallel-line-through-a-second-point', {
  difficultyBand: 4, dok: 2, taskType: 'representationTranslation', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'A line of slope ${{m}}$ passes through $({{x1}}, {{y1}})$. Which equation gives the line parallel to it through $({{x2}}, {{y2}})$?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 14 },
      x1: { type: 'int', min: 1, max: 14 },
      y1: { type: 'int', min: 1, max: 40 },
      x2: { type: 'int', min: 15, max: 30 },
      y2: { type: 'int', min: 41, max: 90 },
    },
    constraints: ['x1!=x2', 'y1!=y2'],
  },
  choices: [
    { label: plain('y - {{y2}} = {{m}}(x - {{x2}})'), correct: true },
    { label: plain('y - {{y1}} = {{m}}(x - {{x1}})'), error: 'usedGivenValue' },
    { label: plain('y + {{y2}} = {{m}}(x + {{x2}})'), error: 'signError' },
    { label: plain('y - {{y2}} = -{{m}}(x - {{x2}})'), error: 'operationInverted' },
  ],
  reasoning: ['A parallel line keeps the slope ${{m}}$ and takes the new point.', 'Point-slope form subtracts the coordinates of the point it passes through.'],
  answerSummary: { headline: 'Parallel means same slope, new point.', text: 'It is $y - {{y2}} = {{m}}(x - {{x2}})$.' },
  hint: 'Decide what changes and what stays the same.',
  feedback: 'Reversing the sign of the slope gives a line that is not parallel at all.',
});

mkc('A.2B', 'slope-plus-intercept-from-two-points', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'The line through $({{x1}}, {{y1}})$ and $({{x2}}, {{y2}})$ is written as $y = mx + b$. What is $m + b$?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 14 },
      b: { type: 'int', min: -40, max: 40 },
      x1: { type: 'int', min: 2, max: 12 },
      gap: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      x2: 'x1+gap',
      y1: 'm*x1+b',
      y2: 'm*x1+m*gap+b',
      answer: 'm+b',
      // Subtracted the two instead of adding them.
      d_signError: 'm-b',
      // Answered the slope alone.
      d_forgotFinalStep: 'm',
      // Multiplied the two instead of adding them.
      d_operationInverted: 'm*b',
    },
    constraints: ['abs(m*b-m-b)>4', 'abs(m-b-m-b)>4', 'abs(b)>3', 'abs(m+b)>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['The slope is $\\frac{{{y2}} - {{y1}}}{{{x2}} - {{x1}}} = {{m}}$, and working back to zero gives $b = {{b}}$.', 'Their total is ${{answer}}$.'],
  answerSummary: { headline: 'Two points fix both the slope and the intercept.', text: 'It is ${{answer}}$.' },
  hint: 'Find the slope first, then use either point.',
  feedback: 'The question asks for the total of the two, not their difference.',
});

mkc('A.2B', 'description-of-a-parallel-but-different-line', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'verbal', courseId: 'algebra1',
  prompt: 'Which description gives a line parallel to $y = {{m}}x + {{b}}$ but not the same line?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 14 },
      b: { type: 'int', min: 2, max: 40 },
      b2: { type: 'int', min: 41, max: 90 },
      m2: { type: 'int', min: 15, max: 30 },
    },
    constraints: ['m!=m2', 'b!=b2'],
  },
  choices: [
    { label: 'Slope ${{m}}$, crossing the vertical axis at ${{b2}}$.', correct: true },
    { label: 'Slope ${{m}}$, crossing the vertical axis at ${{b}}$.', error: 'usedGivenValue' },
    { label: 'Slope ${{m2}}$, crossing the vertical axis at ${{b2}}$.', error: 'ratioReversed' },
    { label: 'Slope $-{{m}}$, crossing the vertical axis at ${{b2}}$.', error: 'signError' },
  ],
  reasoning: ['Parallel lines share a slope, so the slope has to stay ${{m}}$.', 'Being a different line means the crossing point has to change.'],
  answerSummary: { headline: 'Same slope, different intercept.', text: 'Slope ${{m}}$ at ${{b2}}$.' },
  hint: 'Ask what makes two lines parallel and what makes them different.',
  feedback: 'Keeping both the slope and the crossing point gives the same line back.',
});

// ================================================================ A.2C
// Standard form.

mkc('A.2C', 'standard-form-with-a-discount', {
  difficultyBand: 4, dok: 2, taskType: 'representationTranslation', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'Tickets cost $\\${{a}}$ and programmes $\\${{b}}$, and a group pays $\\${{c}}$ after a $\\${{d}}$ discount. Which equation in standard form links the counts?',
  generator: {
    parameters: {
      a: { type: 'int', min: 4, max: 40 },
      b: { type: 'int', min: 2, max: 30 },
      c: { type: 'int', min: 60, max: 600 },
      d: { type: 'int', min: 5, max: 50 },
    },
    derived: { cd: 'c+d', cmd: 'c-d' },
    constraints: ['a!=b', 'c>d'],
  },
  choices: [
    { label: plain('{{a}}x + {{b}}y = {{cd}}'), correct: true },
    { label: plain('{{a}}x + {{b}}y = {{c}}'), error: 'forgotFinalStep' },
    { label: plain('{{a}}x + {{b}}y = {{cmd}}'), error: 'signError' },
    { label: plain('{{b}}x + {{a}}y = {{cd}}'), error: 'ratioReversed' },
  ],
  reasoning: ['Before the discount the group owed ${{a}}x + {{b}}y$ dollars.', 'The discount took ${{d}}$ off, so that total was ${{c}} + {{d}}$.'],
  answerSummary: { headline: 'Undo the discount to reach the pre-discount total.', text: 'It is ${{a}}x + {{b}}y = {{cd}}$.' },
  hint: 'Work backwards from what was actually paid.',
  feedback: 'Each price belongs with the count of its own item.',
});

mkc('A.2C', 'total-of-the-two-intercepts', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'The line ${{a}}x + {{b}}y = {{c}}$ crosses both axes. What is the total of its two intercepts?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 20 },
      b: { type: 'int', min: 2, max: 20 },
      t: { type: 'int', min: 1, max: 9 },
    },
    derived: {
      c: 'a*b*t',
      answer: 'b*t+a*t',
      // Answered the constant on the right.
      d_operationInverted: 'c',
      // Answered one intercept only.
      d_partialTotal: 'b*t',
      // Answered the product of the two coefficients.
      d_ratioReversed: 'a*b',
    },
    constraints: ['a!=b', 'b*t+a*t>8', 'abs(a*b-(b*t+a*t))>4', 'abs(b*t-(b*t+a*t))>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['Setting $y = 0$ gives $x = {{c}} \\div {{a}}$, and setting $x = 0$ gives $y = {{c}} \\div {{b}}$.', 'Their total is ${{answer}}$.'],
  answerSummary: { headline: 'Each intercept comes from setting the other variable to zero.', text: 'It is ${{answer}}$.' },
  hint: 'Find each intercept separately.',
  feedback: 'The constant on the right is not an intercept until it is divided through.',
});

mkc('A.2C', 'equation-that-is-the-same-line', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'table', courseId: 'algebra1',
  prompt: 'Which of the listed equations describes the same line as ${{a}}x + {{b}}y = {{c}}$?',
  stimulus: {
    kind: 'table',
    columns: ['Equation'],
    rows: [
      ['${{a2}}x + {{b2}}y = {{c2}}$'],
      ['${{a2}}x + {{b}}y = {{c2}}$'],
      ['${{a}}x + {{b2}}y = {{c}}$'],
      ['${{a2}}x + {{b2}}y = {{c}}$'],
    ],
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 14 },
      b: { type: 'int', min: 2, max: 14 },
      c: { type: 'int', min: 6, max: 90 },
      k: { type: 'int', min: 2, max: 5 },
    },
    derived: { a2: 'a*k', b2: 'b*k', c2: 'c*k' },
    constraints: ['a!=b', 'k>1'],
  },
  choices: [
    { label: plain('{{a2}}x + {{b2}}y = {{c2}}'), correct: true },
    { label: plain('{{a2}}x + {{b}}y = {{c2}}'), error: 'partialTotal' },
    { label: plain('{{a}}x + {{b2}}y = {{c}}'), error: 'ratioReversed' },
    { label: plain('{{a2}}x + {{b2}}y = {{c}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['Multiplying every term by ${{k}}$ leaves the same line.', 'Scaling only some of the terms moves the line.'],
  answerSummary: { headline: 'A line survives multiplication only if every term is multiplied.', text: 'It is ${{a2}}x + {{b2}}y = {{c2}}$.' },
  hint: 'Check whether each equation is the original times a single number.',
  feedback: 'Leaving the right-hand side alone shifts the line without turning it.',
});

// ================================================================ A.2D
// Direct variation.

mkc('A.2D', 'input-behind-a-chained-variation', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'If $z = {{j}}y$ and $y = {{k}}x$, at which $x$ does $z$ reach ${{t}}$?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 14 },
      j: { type: 'int', min: 2, max: 9 },
      w: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      t: 'k*j*j*w',
      answer: 'j*w',
      // Divided by one constant only.
      d_forgotFinalStep: 'k*j*w',
      // Divided by both constants twice over.
      d_partialTotal: 'w',
      // Answered the product of the two constants.
      d_usedGivenValue: 'k*j',
    },
    constraints: ['j*w>7', 'abs(k*j-j*w)>4', 'abs(j*w-w)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Substituting gives $z = {{j}} \\times {{k}}x$, so $z = {{j}}{{k}}x$.', 'Setting that to ${{t}}$ gives $x = {{answer}}$.'],
  answerSummary: { headline: 'Chained variations multiply their constants.', text: '$x = {{answer}}$.' },
  hint: 'Write $z$ in terms of $x$ before solving.',
  feedback: 'Both constants stand between $z$ and $x$, so both have to come out.',
});

mkc('A.2D', 'time-to-reach-a-later-load', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'A load varies directly with time and reaches ${{y1}}$ kg in ${{x1}}$ minutes. How long does it take to reach ${{y2}}$ kg?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 34 },
      x1: { type: 'int', min: 2, max: 28 },
      x2: { type: 'int', min: 3, max: 30 },
    },
    derived: {
      y1: 'k*x1',
      y2: 'k*x2',
      answer: 'x2',
      // Answered the load rather than the time.
      d_usedGivenValue: 'y2',
      // Answered the time that was given.
      d_ratioReversed: 'x1',
      // Answered the loading rate.
      d_forgotFinalStep: 'k',
    },
    constraints: ['x1!=x2', 'abs(x1-x2)>2', 'abs(k-x2)>3', 'x2>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['The belt loads ${{y1}} \\div {{x1}} = {{k}}$ kg a minute.', 'Reaching ${{y2}}$ kg therefore takes ${{answer}}$ minutes.'],
  answerSummary: { headline: 'Find the rate, then divide the target by it.', text: 'It takes ${{answer}}$ minutes.' },
  hint: 'One pair of readings fixes the rate.',
  feedback: 'A load in kilograms is not a time in minutes.',
});

mkc('A.2D', 'claim-about-chained-constants', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra1',
  prompt: 'The value $y$ varies directly with $x$ with constant ${{k}}$, and $z$ varies directly with $y$ with constant ${{j}}$. Which statement is wrong?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 16 },
      j: { type: 'int', min: 2, max: 16 },
    },
    derived: { sum: 'k+j', prod: 'k*j' },
    constraints: ['k!=j'],
  },
  choices: [
    { label: 'The constant linking $z$ to $x$ is ${{sum}}$.', correct: true },
    { label: 'The constant linking $z$ to $x$ is ${{prod}}$.', error: 'partialTotal' },
    { label: 'The value $z$ varies directly with $x$.', error: 'usedGivenValue' },
    { label: 'When $x$ is zero, $z$ is zero.', error: 'ratioReversed' },
  ],
  reasoning: ['Substituting $y = {{k}}x$ into $z = {{j}}y$ gives $z = {{j}} \\times {{k}}x$.', 'The two constants multiply, so the link is ${{prod}}$.'],
  answerSummary: { headline: 'Chained variations multiply, never add.', text: 'The constant is ${{prod}}$.' },
  hint: 'Substitute one rule into the other.',
  feedback: 'Both rules pass through the origin, so the chain does too.',
});

// ================================================================ A.2E
// Parallel lines.

mkc('A.2E', 'parallel-to-a-standard-form-line-through-a-point', {
  difficultyBand: 4, dok: 2, taskType: 'representationTranslation', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'Which line is parallel to ${{a}}x + {{b}}y = {{c}}$ and passes through $({{x1}}, {{y1}})$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 14 },
      b: { type: 'int', min: 2, max: 14 },
      c: { type: 'int', min: 10, max: 200 },
      x1: { type: 'int', min: 2, max: 16 },
      y1: { type: 'int', min: 2, max: 16 },
    },
    derived: { d: 'a*x1+b*y1', d2: 'a*x1-b*y1' },
    constraints: ['a!=b', 'a*x1+b*y1!=c', 'a*x1-b*y1!=a*x1+b*y1'],
  },
  choices: [
    { label: plain('{{a}}x + {{b}}y = {{d}}'), correct: true },
    { label: plain('{{a}}x + {{b}}y = {{c}}'), error: 'usedGivenValue' },
    { label: plain('{{b}}x + {{a}}y = {{d}}'), error: 'ratioReversed' },
    { label: plain('{{a}}x - {{b}}y = {{d2}}'), error: 'signError' },
  ],
  reasoning: ['Parallel lines in standard form keep both coefficients and change only the constant.', 'Substituting $({{x1}}, {{y1}})$ gives that constant as ${{d}}$.'],
  answerSummary: { headline: 'Keep the coefficients; recompute the constant.', text: 'It is ${{a}}x + {{b}}y = {{d}}$.' },
  hint: 'The slope comes from the two coefficients alone.',
  feedback: 'Swapping the coefficients changes the slope, so the line is no longer parallel.',
});

mkc('A.2E', 'gap-between-two-parallel-lines-at-an-input', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'Parallel lines of slope ${{m}}$ cross the vertical axis at ${{c1}}$ and ${{c2}}$. At $x = {{v}}$, how far apart are they?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 16 },
      c1: { type: 'int', min: 2, max: 60 },
      c2: { type: 'int', min: 20, max: 160 },
      v: { type: 'int', min: 2, max: 16 },
    },
    derived: {
      answer: 'c2-c1',
      // Added the two crossing points instead of comparing them.
      d_operationInverted: 'c1+c2',
      // Answered how far the lines have climbed by ${{v}}.
      d_ratioReversed: 'm*v',
      // Compared the two the other way round.
      d_signError: 'c1-c2',
    },
    constraints: ['c2-c1>6', 'abs(m*v-(c2-c1))>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['Both lines climb ${{m}}$ for every step, so the climb cancels when they are compared.', 'The gap stays ${{c2}} - {{c1}} = {{answer}}$ at every input.'],
  answerSummary: { headline: 'Parallel lines keep a constant vertical gap.', text: 'They are ${{answer}}$ apart.' },
  hint: 'Work out both heights at $x = {{v}}$ and subtract.',
  feedback: 'The climb by $x = {{v}}$ is the same on both lines, so it cannot widen the gap.',
});

mkc('A.2E', 'claim-about-two-parallel-lines-crossing', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra1',
  prompt: 'Two different lines both have slope ${{m}}$. Which statement is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 18 },
      c: { type: 'int', min: 2, max: 60 },
    },
    constraints: ['m>1'],
  },
  choices: [
    { label: 'They cross the vertical axis at the same point.', correct: true },
    { label: 'They never meet.', error: 'operationInverted' },
    { label: 'A vertical shift carries one onto the other.', error: 'partialTotal' },
    { label: 'They rise by ${{m}}$ for each step in $x$.', error: 'usedGivenValue' },
  ],
  reasoning: ['Two lines with the same slope and the same crossing point are the same line.', 'Being different forces the crossing points apart.'],
  answerSummary: { headline: 'Same slope and same intercept means one line, not two.', text: 'The crossing points must differ.' },
  hint: 'Ask what would happen if both facts held at once.',
  feedback: 'Never meeting is exactly what equal slopes and different intercepts give.',
});

// ================================================================ A.2F
// Perpendicular lines.

mkc('A.2F', 'axis-crossing-of-a-perpendicular-line', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'Line B is perpendicular to ${{a}}x + {{b}}y = {{c}}$ and passes through $({{x1}}, {{y1}})$. Where does B cross the vertical axis?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 2, max: 14 },
      c: { type: 'int', min: 10, max: 200 },
      u: { type: 'int', min: 2, max: 32 },
      y1: { type: 'int', min: 20, max: 200 },
    },
    derived: {
      x1: 'a*u',
      answer: 'y1-b*u',
      // Answered the height of the point.
      d_usedGivenValue: 'y1',
      // Answered how far the perpendicular climbs to reach the point.
      d_ratioReversed: 'b*u',
      // Took the difference the other way round.
      d_signError: 'b*u-y1',
    },
    constraints: ['y1-b*u>4', 'abs(b*u-(y1-b*u))>4', 'b*u>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['Line A has slope $-\\frac{{{a}}}{{{b}}}$, so line B has slope $\\frac{{{b}}}{{{a}}}$.', 'Walking back ${{x1}}$ from $({{x1}}, {{y1}})$ drops ${{b}} \\times {{u}}$, leaving ${{answer}}$.'],
  answerSummary: { headline: 'Flip and negate the slope, then walk back to the axis.', text: 'It crosses at ${{answer}}$.' },
  hint: 'The perpendicular slope is the reciprocal with the sign changed.',
  feedback: 'The point itself is not on the axis; the climb still has to come off.',
});

mkc('A.2F', 'horizontal-crossing-of-a-perpendicular', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'A line perpendicular to $y = \\frac{{{p}}}{{{q}}}x + {{c}}$ passes through $({{x1}}, {{y1}})$. Where does it cross the horizontal axis?',
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 12 },
      q: { type: 'int', min: 2, max: 12 },
      w: { type: 'int', min: 2, max: 14 },
      x1: { type: 'int', min: 2, max: 40 },
      c: { type: 'int', min: 2, max: 40 },
    },
    derived: {
      y1: 'q*w',
      answer: 'x1+p*w',
      // Answered the point's own input.
      d_usedGivenValue: 'x1',
      // Used the fraction the right way up.
      d_ratioReversed: 'x1+q*w',
      // Applied both parts of the fraction.
      d_exponentError: 'x1+p*q*w',
    },
    constraints: ['gcd(p,q)==1', 'p!=q', 'abs(p-q)*w>3', 'p*w>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_exponentError}}'), error: 'exponentError' },
  ],
  reasoning: ['The perpendicular slope is $-\\frac{{{q}}}{{{p}}}$, so falling ${{y1}}$ takes ${{p}} \\times {{w}}$ across.', 'That puts the crossing at ${{answer}}$.'],
  answerSummary: { headline: 'The reciprocal slope swaps the roles of the two parts.', text: 'It crosses at ${{answer}}$.' },
  hint: 'How far across does the line travel while dropping ${{y1}}$?',
  feedback: 'Using $\\frac{{{q}}}{{{p}}}$ the right way up travels the wrong distance.',
});

mkc('A.2F', 'pair-of-slopes-that-are-perpendicular', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'verbal', courseId: 'algebra1',
  prompt: 'Which pair of slopes belongs to perpendicular lines?',
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 14 },
      q: { type: 'int', min: 2, max: 14 },
    },
    constraints: ['p!=q', 'p>1'],
  },
  choices: [
    { label: '${{p}}$ and $-\\frac{1}{{{p}}}$', correct: true },
    { label: '${{p}}$ and $\\frac{1}{{{p}}}$', error: 'signError' },
    { label: '${{p}}$ and $-{{p}}$', error: 'operationInverted' },
    { label: '${{p}}$ and $\\frac{{{p}}}{{{q}}}$', error: 'ratioReversed' },
  ],
  reasoning: ['Perpendicular slopes multiply to $-1$.', 'Only ${{p}} \\times -\\frac{1}{{{p}}}$ comes to $-1$.'],
  answerSummary: { headline: 'Flip the fraction and change the sign.', text: '${{p}}$ and $-\\frac{1}{{{p}}}$.' },
  hint: 'Multiply each pair together and look for $-1$.',
  feedback: 'Changing the sign alone leaves the product at $-{{p}}^{2}$.',
});

// ================================================================ A.2G
// Horizontal and vertical lines.

mkc('A.2G', 'perimeter-fenced-by-four-rails', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'Rails run along $x = {{p}}$, $x = {{q}}$, $y = {{r}}$ and $y = {{s}}$. What is the perimeter they enclose?',
  generator: {
    parameters: {
      p: { type: 'int', min: 1, max: 12 },
      wide: { type: 'int', min: 2, max: 24 },
      r: { type: 'int', min: 1, max: 12 },
      tall: { type: 'int', min: 2, max: 24 },
    },
    derived: {
      q: 'p+wide',
      s: 'r+tall',
      answer: '2*(wide+tall)',
      // Doubled every coordinate instead of the two gaps.
      d_operationInverted: '2*(p+q+r+s)',
      // Answered one width plus one height.
      d_forgotFinalStep: 'wide+tall',
      // Answered the distance round only the two named rails.
      d_usedGivenValue: 'p+q+r+s',
    },
    constraints: ['abs(p+q+r+s-2*(wide+tall))>5', 'wide!=tall'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The two vertical rails stand ${{wide}}$ apart and the two horizontal rails ${{tall}}$ apart.', 'The perimeter is $2({{wide}} + {{tall}}) = {{answer}}$.'],
  answerSummary: { headline: 'The gaps between the rails give the two side lengths.', text: 'It is ${{answer}}$.' },
  hint: 'A rail at $x = {{p}}$ is a vertical line, not a length.',
  feedback: 'Adding the four positions measures nothing on the rectangle.',
});

mkc('A.2G', 'crossing-of-two-midway-rails', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'orderedPairs', courseId: 'algebra1',
  prompt: 'One line runs midway between $x = {{p}}$ and $x = {{q}}$, another midway between $y = {{r}}$ and $y = {{s}}$. Where do they cross?',
  generator: {
    parameters: {
      p: { type: 'int', min: 1, max: 20 },
      wide: { type: 'int', min: 2, max: 24, step: 2 },
      r: { type: 'int', min: 1, max: 20 },
      tall: { type: 'int', min: 2, max: 24, step: 2 },
    },
    derived: {
      q: 'p+wide',
      s: 'r+tall',
      mx: 'p+wide/2',
      my: 'r+tall/2',
      halfW: 'wide/2',
      halfT: 'tall/2',
      sumX: 'p+q',
      sumY: 'r+s',
    },
    constraints: ['wide!=tall', 'p!=r', 'mx!=my', 'sumX!=sumY'],
  },
  choices: [
    { label: plain('({{mx}}, {{my}})'), correct: true },
    { label: plain('({{my}}, {{mx}})'), error: 'ratioReversed' },
    { label: plain('({{sumX}}, {{sumY}})'), error: 'forgotFinalStep' },
    { label: plain('({{halfW}}, {{halfT}})'), error: 'operationInverted' },
  ],
  reasoning: ['Midway between two vertical rails is the average of their two $x$ values.', 'The same holds for the horizontal pair, giving $({{mx}}, {{my}})$.'],
  answerSummary: { headline: 'A midway line sits at the average, not at half the gap.', text: 'They cross at $({{mx}}, {{my}})$.' },
  hint: 'Average each pair of positions.',
  feedback: 'Half the gap measures a distance, not a position.',
});

mkc('A.2G', 'claim-about-a-line-through-two-points-sharing-an-x', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra1',
  prompt: 'A line passes through $({{a}}, {{y1}})$ and $({{a}}, {{y2}})$. Which statement is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 30 },
      y1: { type: 'int', min: 1, max: 30 },
      y2: { type: 'int', min: 31, max: 90 },
    },
    constraints: ['y1!=y2', 'a>1'],
  },
  choices: [
    { label: 'Its slope is zero.', correct: true },
    { label: 'Its equation is $x = {{a}}$.', error: 'operationInverted' },
    { label: 'Its slope is undefined.', error: 'usedGivenValue' },
    { label: 'It never crosses the vertical axis.', error: 'partialTotal' },
  ],
  reasoning: ['The two points share an $x$ value, so the run between them is zero.', 'Dividing by zero leaves the slope undefined, not zero.'],
  answerSummary: { headline: 'A vertical line has no slope at all.', text: 'The slope is undefined, not zero.' },
  hint: 'Work out the rise and the run between the two points.',
  feedback: 'A slope of zero belongs to a horizontal line.',
});

// ================================================================ A.2I
// Writing a system for a situation.

mkc('A.2I', 'system-with-a-refund', {
  difficultyBand: 4, dok: 2, taskType: 'representationTranslation', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'A canteen sold ${{n}}$ items, sandwiches at $\\${{a}}$ and soups at $\\${{b}}$, taking $\\${{t}}$ after a $\\${{d}}$ refund. Which system fits?',
  generator: {
    parameters: {
      n: { type: 'int', min: 20, max: 200 },
      a: { type: 'int', min: 3, max: 12 },
      b: { type: 'int', min: 2, max: 10 },
      t: { type: 'int', min: 100, max: 900 },
      d: { type: 'int', min: 5, max: 60 },
    },
    derived: { td: 't+d' },
    // The takings have to sit between what the cheapest and dearest mix would bring in.
    constraints: ['a>b', 't>d', 't+d>n*b', 't+d<n*a'],
  },
  choices: [
    { label: plain('x + y = {{n}} \\text{ and } {{a}}x + {{b}}y = {{td}}'), correct: true },
    { label: plain('x + y = {{n}} \\text{ and } {{a}}x + {{b}}y = {{t}}'), error: 'forgotFinalStep' },
    { label: plain('{{a}}x + {{b}}y = {{n}} \\text{ and } x + y = {{td}}'), error: 'ratioReversed' },
    { label: plain('x + y = {{n}} \\text{ and } {{b}}x + {{a}}y = {{td}}'), error: 'operationInverted' },
  ],
  reasoning: ['One equation counts the items and one totals the money taken.', 'The refund reduced the takings, so the sales came to ${{t}} + {{d}}$.'],
  answerSummary: { headline: 'Counting has coefficients of one; money carries the prices.', text: 'It is $x + y = {{n}}$ with ${{a}}x + {{b}}y = {{td}}$.' },
  hint: 'Ask what each equation is measuring.',
  feedback: 'Prices belong in the money equation, not the counting one.',
});

mkc('A.2I', 'product-behind-a-sum-and-a-difference', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'Two numbers add to ${{s}}$ and differ by ${{g}}$. What is their product?',
  generator: {
    parameters: {
      big: { type: 'int', min: 6, max: 200 },
      small: { type: 'int', min: 2, max: 190 },
    },
    derived: {
      s: 'big+small',
      g: 'big-small',
      answer: 'big*small',
      // Multiplied the two given totals.
      d_operationInverted: 's*g',
      // Answered the larger number.
      d_forgotFinalStep: 'big',
      // Squared half the total.
      d_exponentError: 's*s/4',
    },
    constraints: ['big>small', 'big-small>3', 'big<3*small', '(big+small)%2==0', 'abs(s*g-big*small)>5', 'abs(s*s/4-big*small)>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_exponentError}}'), error: 'exponentError' },
  ],
  reasoning: ['Half the total plus half the difference gives ${{big}}$, and half the total minus half the difference gives ${{small}}$.', 'Their product is ${{answer}}$.'],
  answerSummary: { headline: 'A sum and a difference fix both numbers.', text: 'The product is ${{answer}}$.' },
  hint: 'Recover the two numbers before multiplying anything.',
  feedback: 'The total and the difference are not the two numbers themselves.',
});

mkc('A.2I', 'claim-about-a-counting-and-money-system', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra1',
  prompt: 'A canteen sells sandwiches at $\\${{a}}$ and soups at $\\${{b}}$, and ${{n}}$ items go in all. Which statement about the system is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 12 },
      b: { type: 'int', min: 2, max: 10 },
      n: { type: 'int', min: 20, max: 200 },
    },
    constraints: ['a!=b'],
  },
  choices: [
    { label: 'Both equations carry the two prices as coefficients.', correct: true },
    { label: 'The counting equation has coefficients of one.', error: 'partialTotal' },
    { label: 'The money equation carries the prices as coefficients.', error: 'usedGivenValue' },
    { label: 'Both equations use the same two unknowns.', error: 'ratioReversed' },
  ],
  reasoning: ['The counting equation adds up items, so each item counts once whatever it cost.', 'Only the money equation weights the two unknowns by price.'],
  answerSummary: { headline: 'Counting and money weight the unknowns differently.', text: 'Only one equation carries the prices.' },
  hint: 'Write both equations out before deciding.',
  feedback: 'Both equations really do describe the same two counts.',
});

// ================================================================ A.3A
// Rate of change from different forms.

mkc('A.3A', 'fall-across-a-run-in-standard-form', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'On the line ${{a}}x + {{b}}y = {{c}}$, by how much does $y$ fall as $x$ rises by ${{g}}$?',
  generator: {
    parameters: {
      b: { type: 'int', min: 2, max: 20 },
      k: { type: 'int', min: 2, max: 16 },
      g: { type: 'int', min: 2, max: 16 },
      c: { type: 'int', min: 10, max: 300 },
    },
    derived: {
      a: 'b*k',
      answer: 'k*g',
      // Used the coefficient of $x$ as the whole rate.
      d_operationInverted: 'b*k*g',
      // Answered the rate for a single step.
      d_forgotFinalStep: 'k',
      // Used the coefficient of $y$ as the rate.
      d_ratioReversed: 'b*g',
    },
    constraints: ['b!=k', 'k*g>7', 'abs(b*g-k*g)>4', 'abs(k-k*g)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['Solving for $y$ gives a slope of $-\\frac{{{a}}}{{{b}}} = -{{k}}$.', 'Over a run of ${{g}}$ that is a fall of ${{answer}}$.'],
  answerSummary: { headline: 'The slope is the ratio of the two coefficients, not either one.', text: 'It falls by ${{answer}}$.' },
  hint: 'Rearrange into $y = mx + c$ first.',
  feedback: 'The coefficient of $x$ still has to be divided by the coefficient of $y$.',
});

mkc('A.3A', 'input-where-a-bill-reaches-a-total', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'A bill follows $y - {{y1}} = {{m}}(x - {{x1}})$, with $x$ in hours. At which $x$ does it reach ${{t}}$?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 20 },
      x1: { type: 'int', min: 2, max: 14 },
      y1: { type: 'int', min: 20, max: 200 },
      u: { type: 'int', min: 2, max: 120 },
    },
    derived: {
      t: 'y1+m*u',
      answer: 'x1+u',
      // Added the whole shortfall as if it were hours.
      d_forgotFinalStep: 'x1+m*u',
      // Answered the hours already accounted for.
      d_usedGivenValue: 'x1',
      // Multiplied the given hours by the rate.
      d_ratioReversed: 'm*x1',
    },
    constraints: ['abs(m*x1-(x1+u))>4', 'x1+u>7', 'u>1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['The bill has to rise ${{t}} - {{y1}}$, and it rises ${{m}}$ an hour.', 'That takes ${{u}}$ more hours, reaching $x = {{answer}}$.'],
  answerSummary: { headline: 'Divide the shortfall by the rate before adding the known hours.', text: '$x = {{answer}}$.' },
  hint: 'Point-slope form measures from $({{x1}}, {{y1}})$.',
  feedback: 'The shortfall is money; it becomes hours only after dividing by the rate.',
});

mkc('A.3A', 'claim-about-the-slope-in-standard-form', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra1',
  prompt: 'For the line ${{a}}x + {{b}}y = {{c}}$, which statement is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 16 },
      b: { type: 'int', min: 2, max: 16 },
      c: { type: 'int', min: 10, max: 200 },
    },
    constraints: ['a!=b'],
  },
  choices: [
    { label: 'Its slope is ${{a}}$.', correct: true },
    { label: 'Its slope is $-\\frac{{{a}}}{{{b}}}$.', error: 'partialTotal' },
    { label: 'It crosses the vertical axis at $\\frac{{{c}}}{{{b}}}$.', error: 'usedGivenValue' },
    { label: 'Doubling all three numbers leaves the line unchanged.', error: 'ratioReversed' },
  ],
  reasoning: ['Rearranging gives $y = -\\frac{{{a}}}{{{b}}}x + \\frac{{{c}}}{{{b}}}$.', 'The coefficient of $x$ in standard form is not the slope on its own.'],
  answerSummary: { headline: 'Standard form hides the slope until it is rearranged.', text: 'The slope is $-\\frac{{{a}}}{{{b}}}$.' },
  hint: 'Solve the equation for $y$.',
  feedback: 'Scaling every term really does leave the same line.',
});

// ================================================================ A.3C
// Intercepts and zeros.

mkc('A.3C', 'litres-left-before-a-tank-empties', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'A tank holds $y = {{b}} - {{m}}x$ litres after $x$ minutes. How much is left ${{g}}$ minutes before it empties?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 20 },
      z: { type: 'int', min: 3, max: 30 },
      g: { type: 'int', min: 2, max: 16 },
    },
    derived: {
      b: 'm*z',
      answer: 'm*g',
      // Answered the tank's starting amount.
      d_usedGivenValue: 'b',
      // Answered the number of minutes.
      d_forgotFinalStep: 'g',
      // Answered the amount left ${{g}} minutes after the start.
      d_ratioReversed: 'b-m*g',
    },
    constraints: ['z>g', 'm*g>7', 'abs(b-2*m*g)>4', 'abs(g-m*g)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['The tank empties at $x = {{b}} \\div {{m}} = {{z}}$ minutes.', 'With ${{g}}$ minutes still to run it holds ${{m}} \\times {{g}} = {{answer}}$ litres.'],
  answerSummary: { headline: 'Work from the emptying time backwards at the drain rate.', text: 'It holds ${{answer}}$ litres.' },
  hint: 'Find when the tank runs dry first.',
  feedback: 'Counting ${{g}}$ minutes from the start measures from the wrong end.',
});

mkc('A.3C', 'vertical-crossing-from-a-horizontal-one', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'A line ${{a}}x + {{b}}y = c$ crosses the horizontal axis at ${{h}}$. Where does it cross the vertical axis?',
  generator: {
    parameters: {
      b: { type: 'int', min: 2, max: 18 },
      k: { type: 'int', min: 2, max: 16 },
      h: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      a: 'b*k',
      c: 'b*k*h',
      answer: 'k*h',
      // Answered the constant on the right.
      d_forgotFinalStep: 'c',
      // Answered the crossing that was given.
      d_usedGivenValue: 'h',
      // Divided by the wrong coefficient.
      d_ratioReversed: 'b*h',
    },
    constraints: ['b!=k', 'k*h>7', 'abs(b*h-k*h)>4', 'abs(h-k*h)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['Setting $y = 0$ gives $c = {{a}} \\times {{h}}$.', 'Setting $x = 0$ then gives $y = c \\div {{b}} = {{answer}}$.'],
  answerSummary: { headline: 'One crossing fixes the constant; the other follows.', text: 'It crosses at ${{answer}}$.' },
  hint: 'Recover the constant from the crossing you are given.',
  feedback: 'Each crossing divides the constant by its own coefficient.',
});

mkc('A.3C', 'claim-about-a-zero-and-an-intercept', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra1',
  prompt: 'For $f(x) = {{m}}x - {{p}}$, which statement is wrong?',
  generator: {
    parameters: {
      m: { type: 'int', min: 2, max: 16 },
      p: { type: 'int', min: 4, max: 90 },
    },
    derived: { diff: 'p-m' },
    constraints: ['p>m'],
  },
  choices: [
    { label: 'Its zero is at $x = {{diff}}$.', correct: true },
    { label: 'Its zero is at $x = \\frac{{{p}}}{{{m}}}$.', error: 'partialTotal' },
    { label: 'It crosses the vertical axis at $-{{p}}$.', error: 'usedGivenValue' },
    { label: 'It rises by ${{m}}$ for each step in $x$.', error: 'ratioReversed' },
  ],
  reasoning: ['A zero is where ${{m}}x = {{p}}$, so $x = \\frac{{{p}}}{{{m}}}$.', 'Subtracting ${{m}}$ from ${{p}}$ is not the same operation at all.'],
  answerSummary: { headline: 'A zero divides the constant by the slope.', text: 'The zero is $\\frac{{{p}}}{{{m}}}$.' },
  hint: 'Set the rule to zero and solve.',
  feedback: 'The vertical crossing really is $-{{p}}$, at $x = 0$.',
});

// ================================================================ A.3F
// Systems: crossing, parallel and identical lines.

mkc('A.3F', 'cost-in-the-month-two-plans-level', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'Plan A costs $\\${{f1}}$ plus $\\${{m1}}$ a month and Plan B $\\${{f2}}$ plus $\\${{m2}}$ a month. What do they each cost in the month they level?',
  generator: {
    parameters: {
      m1: { type: 'int', min: 5, max: 40 },
      gap: { type: 'int', min: 2, max: 14 },
      u: { type: 'int', min: 3, max: 20 },
      f2: { type: 'int', min: 40, max: 600 },
    },
    derived: {
      m2: 'm1+gap',
      f1: 'f2+gap*u',
      answer: 'f1+m1*u',
      // Answered the month rather than the cost.
      d_forgotFinalStep: 'u',
      // Added both fees to the monthly charges.
      d_operationInverted: 'f1+f2+m1*u',
      // Answered the total of the two fees.
      d_usedGivenValue: 'f1+f2',
    },
    constraints: ['f1+m1*u>20', 'abs(f1+f2-(f1+m1*u))>5', 'gap*u>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The fees differ by ${{gap}} \\times {{u}}$ and the monthly charges by ${{gap}}$, so they level after ${{u}}$ months.', 'Plan A then costs ${{f1}} + {{m1}} \\times {{u}} = {{answer}}$.'],
  answerSummary: { headline: 'Find the month first, then put it back into either plan.', text: 'Each costs $\\${{answer}}$.' },
  hint: 'Solve for the month before working out any money.',
  feedback: 'The month they level is a count, not a cost.',
});

mkc('A.3F', 'coefficient-that-makes-one-line-twice', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'For which $a_2$ do ${{a}}x + {{b}}y = {{c}}$ and $a_2x + {{b2}}y = {{c2}}$ describe the same line?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 18 },
      b: { type: 'int', min: 2, max: 18 },
      c: { type: 'int', min: 10, max: 200 },
      k: { type: 'int', min: 2, max: 6 },
    },
    derived: {
      b2: 'b*k',
      c2: 'c*k',
      answer: 'a*k',
      // Answered the coefficient that was already given.
      d_usedGivenValue: 'a',
      // Answered the other scaled coefficient.
      d_ratioReversed: 'b*k',
      // Applied the factor twice.
      d_exponentError: 'a*k*k',
    },
    constraints: ['a!=b', 'abs(b*k-a*k)>4', 'a*k>7'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_exponentError}}'), error: 'exponentError' },
  ],
  reasoning: ['The second equation is the first multiplied by ${{b2}} \\div {{b}} = {{k}}$.', 'So $a_2$ has to be ${{a}} \\times {{k}} = {{answer}}$.'],
  answerSummary: { headline: 'Identical lines differ by one factor applied to every term.', text: '$a_2 = {{answer}}$.' },
  hint: 'Compare the two constants to find the factor.',
  feedback: 'The factor is applied once to each term, not twice.',
});

mkc('A.3F', 'claim-about-a-system-with-no-solution', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra1',
  prompt: 'The system ${{a}}x + {{b}}y = {{c}}$ and ${{a2}}x + {{b2}}y = {{c2}}$ has no solution. Which statement is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 16 },
      b: { type: 'int', min: 2, max: 16 },
      c: { type: 'int', min: 10, max: 150 },
      k: { type: 'int', min: 2, max: 5 },
      off: { type: 'int', min: 3, max: 40 },
    },
    derived: { a2: 'a*k', b2: 'b*k', c2: 'c*k+off' },
    constraints: ['a!=b', 'off>2'],
  },
  choices: [
    { label: 'The two lines cross a long way from the origin.', correct: true },
    { label: 'The two lines are parallel.', error: 'operationInverted' },
    { label: 'The two lines have the same slope.', error: 'usedGivenValue' },
    { label: 'No pair of values satisfies both equations.', error: 'partialTotal' },
  ],
  reasoning: ['The coefficients scale by ${{k}}$ but the constants do not, so the lines are parallel and distinct.', 'Parallel lines never cross, however far out they are followed.'],
  answerSummary: { headline: 'No solution means no crossing anywhere.', text: 'They do not cross at all.' },
  hint: 'Check whether one equation is a multiple of the other.',
  feedback: 'Equal slopes with different constants is exactly the no-solution case.',
});

// ================================================================ A.5A
// Solving linear equations in one variable.

mkc('A.5A', 'solve-a-grouped-quotient-with-a-shift', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'Solve $\\frac{x + {{p}}}{{{d}}} - {{q}} = {{r}}$.',
  generator: {
    parameters: {
      p: { type: 'int', min: 3, max: 260 },
      d: { type: 'int', min: 2, max: 12 },
      q: { type: 'int', min: 2, max: 20 },
      r: { type: 'int', min: 2, max: 30 },
    },
    derived: {
      answer: 'd*(r+q)-p',
      // Stopped at the numerator.
      d_forgotFinalStep: 'd*(r+q)',
      // Subtracted the shift instead of adding it back.
      d_operationInverted: 'd*(r-q)-p',
      // Answered the constant inside the fraction.
      d_usedGivenValue: 'p',
    },
    constraints: ['d*(r+q)-p>6', 'abs(p-(d*(r+q)-p))>5', 'd*(r-q)-p!=d*(r+q)-p'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Adding ${{q}}$ to both sides gives $\\frac{x + {{p}}}{{{d}}} = {{r}} + {{q}}$.', 'Multiplying by ${{d}}$ and subtracting ${{p}}$ leaves $x = {{answer}}$.'],
  answerSummary: { headline: 'Undo the outside shift, then the division, then the inside shift.', text: '$x = {{answer}}$.' },
  hint: 'The ${{q}}$ sits outside the fraction, so it comes off first.',
  feedback: 'The numerator still has ${{p}}$ inside it.',
});

mkc('A.5A', 'constant-that-fixes-a-bracketed-solution', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'For which $c$ does ${{a}}(x + {{p}}) = {{b}}x + c$ have the solution $x = {{v}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 18 },
      b: { type: 'int', min: 2, max: 16 },
      p: { type: 'int', min: 2, max: 16 },
      v: { type: 'int', min: 2, max: 60 },
    },
    derived: {
      answer: '(a-b)*v+a*p',
      // Left the second coefficient out.
      d_forgotFinalStep: 'a*p+a*v',
      // Took the difference off instead of adding it.
      d_signError: 'a*p-(a-b)*v',
      // Answered what the right-hand coefficient contributes.
      d_ratioReversed: 'b*v',
    },
    constraints: ['a>b', '(a-b)*v+a*p>8', 'abs(b*v-((a-b)*v+a*p))>5', 'a*p-(a-b)*v>0'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['At $x = {{v}}$ the left side comes to ${{a}}({{v}} + {{p}})$.', 'Taking ${{b}} \\times {{v}}$ off leaves $c = {{answer}}$.'],
  answerSummary: { headline: 'Expand, substitute, and read off what is left.', text: '$c = {{answer}}$.' },
  hint: 'The bracket multiplies both terms inside it.',
  feedback: 'The right-hand side still carries ${{b}}x$, which has to be accounted for.',
});

mkc('A.5A', 'sound-first-step-on-two-brackets', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'verbal', courseId: 'algebra1',
  prompt: 'For ${{a}}(x + {{p}}) = {{b}}(x - {{q}})$, which first step is sound?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 16 },
      b: { type: 'int', min: 2, max: 16 },
      p: { type: 'int', min: 2, max: 30 },
      q: { type: 'int', min: 2, max: 30 },
    },
    constraints: ['a!=b', 'p!=q'],
  },
  choices: [
    { label: 'Expand both brackets, then collect the $x$ terms.', correct: true },
    { label: 'Divide the left by ${{a}}$ and the right by ${{b}}$.', error: 'operationInverted' },
    { label: 'Cancel the brackets, since both sides have one.', error: 'partialTotal' },
    { label: 'Subtract ${{p}}$ from both sides.', error: 'signError' },
  ],
  reasoning: ['Whatever is done to one side has to be done to the other in full.', 'Expanding changes neither side\'s value, so it is always safe.'],
  answerSummary: { headline: 'Expanding is the one step that changes nothing.', text: 'Expand both brackets first.' },
  hint: 'Ask whether each step keeps the two sides equal.',
  feedback: 'Dividing the two sides by different numbers breaks the equality.',
});

// ================================================================ A.5B
// Solving linear inequalities.

mkc('A.5B', 'greatest-whole-number-under-a-grouped-ceiling', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'What is the greatest whole number $x$ with $\\frac{{{a}}x + {{p}}}{{{d}}} \\le {{q}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 5 },
      d: { type: 'int', min: 2, max: 9 },
      j: { type: 'int', min: 1, max: 9 },
      k: { type: 'int', min: 6, max: 120 },
    },
    derived: {
      p: 'a*j',
      q: 'a*(k+j)/d',
      answer: 'k',
      // Stopped at the numerator.
      d_forgotFinalStep: 'a*k',
      // Answered the ceiling that was given.
      d_usedGivenValue: 'q',
      // Took the constant off twice.
      d_operationInverted: 'k-2*j',
    },
    constraints: ['a*(k+j)%d==0', 'k-2*j>1', 'abs(q-k)>4', 'abs(a*k-k)>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['Multiplying by ${{d}}$ gives ${{a}}x + {{p}} \\le {{d}} \\times {{q}}$.', 'Taking ${{p}}$ off and dividing by ${{a}}$ leaves $x \\le {{answer}}$.'],
  answerSummary: { headline: 'Clear the denominator, then the constant, then the coefficient.', text: 'It is ${{answer}}$.' },
  hint: 'The fraction bar groups both terms above it.',
  feedback: 'The numerator still has ${{a}}$ multiplying $x$.',
});

mkc('A.5B', 'largest-daily-rate-a-budget-allows', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal', courseId: 'algebra1',
  prompt: 'A budget of $\\${{q}}$ covers a $\\${{p}}$ fee plus a daily rate for ${{n}}$ days. What is the largest whole daily rate it allows?',
  generator: {
    parameters: {
      p: { type: 'int', min: 10, max: 90 },
      n: { type: 'int', min: 3, max: 24 },
      r: { type: 'int', min: 4, max: 90 },
    },
    derived: {
      q: 'p+n*r',
      answer: 'r',
      // Answered what is left of the budget, not the rate.
      d_forgotFinalStep: 'n*r',
      // Answered the number of days.
      d_usedGivenValue: 'n',
      // Answered the fee.
      d_ratioReversed: 'p',
    },
    constraints: ['abs(n-r)>3', 'abs(p-r)>4', 'n*r>12'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['The fee leaves $\\${{q}} - \\${{p}}$ for the ${{n}}$ days.', 'Dividing gives a rate of $\\${{answer}}$ a day.'],
  answerSummary: { headline: 'Remove the one-off charge before dividing by the days.', text: 'It is $\\${{answer}}$ a day.' },
  hint: 'The fee is paid once, so it never divides by the days.',
  feedback: 'What is left of the budget still has to be spread over ${{n}}$ days.',
});

mkc('A.5B', 'inequality-with-the-same-solutions', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'Which inequality has the same solutions as $-{{a}}x + {{p}} > {{q}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 14 },
      p: { type: 'int', min: 20, max: 200 },
      q: { type: 'int', min: 2, max: 100 },
    },
    constraints: ['p>q'],
  },
  choices: [
    { label: plain('x < \\frac{{{p}} - {{q}}}{{{a}}}'), correct: true },
    { label: plain('x > \\frac{{{p}} - {{q}}}{{{a}}}'), error: 'signError' },
    { label: plain('x < \\frac{{{q}} - {{p}}}{{{a}}}'), error: 'operationInverted' },
    { label: plain('x < \\frac{{{p}} + {{q}}}{{{a}}}'), error: 'partialTotal' },
  ],
  reasoning: ['Moving ${{p}}$ across gives $-{{a}}x > {{q}} - {{p}}$.', 'Dividing by $-{{a}}$ reverses the sign, leaving $x < \\frac{{{p}} - {{q}}}{{{a}}}$.'],
  answerSummary: { headline: 'Dividing by a negative turns the inequality round.', text: 'It is $x < \\frac{{{p}} - {{q}}}{{{a}}}$.' },
  hint: 'Isolate the $x$ term before dividing.',
  feedback: 'Keeping the direction after a negative divide reverses which values work.',
});

// ================================================================ A.5C
// Solving a system.

mkc('A.5C', 'total-of-the-two-solutions', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'table', courseId: 'algebra1',
  prompt: 'Solve the system in the table. What is $x + y$?',
  stimulus: {
    kind: 'table',
    columns: ['Equation'],
    rows: [['${{a}}x + {{b}}y = {{c1}}$'], ['${{a2}}x - {{d}}y = {{c2}}$']],
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 9 },
      a2: { type: 'int', min: 2, max: 9 },
      d: { type: 'int', min: 2, max: 9 },
      x0: { type: 'int', min: 2, max: 9 },
      y0: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      c1: 'a*x0+b*y0',
      c2: 'a2*x0-d*y0',
      answer: 'x0+y0',
      // Added the two right-hand sides.
      d_operationInverted: 'c1+c2',
      // Answered one solution only.
      d_forgotFinalStep: 'x0',
      // Answered the total of the two leading coefficients.
      d_ratioReversed: 'a+b',
    },
    constraints: ['a*b!=a2*d', 'a*x0-d*y0!=0', 'x0!=y0', 'abs(a+b-x0-y0)>3', 'a2*x0-d*y0>0'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['The system is satisfied by $x = {{x0}}$ and $y = {{y0}}$.', 'Their total is ${{answer}}$.'],
  answerSummary: { headline: 'Solve for both unknowns before combining them.', text: 'It is ${{answer}}$.' },
  hint: 'Eliminate one unknown, then substitute back.',
  feedback: 'The coefficients are not the solutions; they only weight them.',
});

mkc('A.5C', 'multiplier-that-clears-the-first-unknown', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'To eliminate $x$ by subtraction, by what must ${{a}}x + {{b}}y = {{c1}}$ be multiplied before subtracting ${{a2}}x + {{d}}y = {{c2}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      k: { type: 'int', min: 2, max: 14 },
      b: { type: 'int', min: 2, max: 14 },
      d: { type: 'int', min: 2, max: 16 },
      c1: { type: 'int', min: 10, max: 200 },
      c2: { type: 'int', min: 10, max: 200 },
    },
    derived: {
      a2: 'a*k',
      answer: 'k',
      // Answered the coefficient to be matched.
      d_forgotFinalStep: 'a*k',
      // Answered the coefficient already in place.
      d_usedGivenValue: 'a',
      // Answered the other coefficient in the same equation.
      d_operationInverted: 'b',
    },
    constraints: ['b!=d', 'abs(a-k)>2', 'abs(b-k)>2', 'a*k>7'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['Subtraction clears $x$ only once both $x$ coefficients match.', '${{a}}$ reaches ${{a2}}$ when it is multiplied by ${{answer}}$.'],
  answerSummary: { headline: 'Match the coefficients before subtracting.', text: 'Multiply by ${{answer}}$.' },
  hint: 'Divide the coefficient you want by the one you have.',
  feedback: 'The coefficient to be matched is the target, not the multiplier.',
});

mkc('A.5C', 'equation-substitution-leaves-behind', {
  difficultyBand: 4, dok: 3, taskType: 'representationTranslation', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'Substituting $y = {{m}}x + {{p}}$ into ${{a}}x + {{b}}y = {{c}}$ leaves which equation?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 14 },
      b: { type: 'int', min: 2, max: 12 },
      m: { type: 'int', min: 2, max: 10 },
      p: { type: 'int', min: 2, max: 30 },
      c: { type: 'int', min: 20, max: 300 },
    },
    derived: {
      ab: 'a+b*m',
      abBad: 'a+m',
      bp: 'b*p',
    },
    constraints: ['a+b*m!=a+m', 'b*p!=p'],
  },
  choices: [
    { label: plain('{{ab}}x + {{bp}} = {{c}}'), correct: true },
    { label: plain('{{abBad}}x + {{bp}} = {{c}}'), error: 'incompleteFactoring' },
    { label: plain('{{ab}}x + {{p}} = {{c}}'), error: 'partialTotal' },
    { label: plain('{{ab}}x - {{bp}} = {{c}}'), error: 'signError' },
  ],
  reasoning: ['The ${{b}}$ multiplies both terms of $y$, giving ${{b}}{{m}}x + {{b}}{{p}}$.', 'Collecting with ${{a}}x$ leaves ${{ab}}x + {{bp}} = {{c}}$.'],
  answerSummary: { headline: 'Distribute the coefficient across the whole substitution.', text: 'It is ${{ab}}x + {{bp}} = {{c}}$.' },
  hint: 'Both terms of $y$ pass through the ${{b}}$.',
  feedback: 'Leaving the constant undistributed drops a factor of ${{b}}$.',
});

// ================================================================ A.6A
// Domain and range of a quadratic.

mkc('A.6A', 'range-over-a-domain-past-the-vertex', {
  difficultyBand: 4, dok: 2, taskType: 'interpretation', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'For $y = {{a}}(x - {{h}})^2 + {{k}}$ on ${{lo}} \\le x \\le {{hi}}$, what is the range?',
  generator: {
    parameters: {
      a: { type: 'int', min: 1, max: 6 },
      h: { type: 'int', min: 1, max: 12 },
      k: { type: 'int', min: 2, max: 40 },
      d1: { type: 'int', min: 1, max: 8 },
      d2: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      lo: 'h+d1',
      hi: 'h+d1+d2',
      flo: 'a*d1*d1+k',
      fhi: 'a*(d1+d2)*(d1+d2)+k',
    },
    constraints: ['d2>1', 'a*d1*d1+k!=a*(d1+d2)*(d1+d2)+k'],
  },
  choices: [
    { label: plain('{{flo}} \\le y \\le {{fhi}}'), correct: true },
    { label: plain('{{fhi}} \\le y \\le {{flo}}'), error: 'ratioReversed' },
    { label: plain('{{k}} \\le y \\le {{fhi}}'), error: 'usedGivenValue' },
    { label: plain('{{lo}} \\le y \\le {{hi}}'), error: 'partialTotal' },
  ],
  reasoning: ['The domain lies entirely to the right of the turning point, so the curve only rises across it.', 'That puts the range between $f({{lo}})$ and $f({{hi}})$.'],
  answerSummary: { headline: 'A domain clear of the vertex gives a range between the two endpoints.', text: 'It is ${{flo}} \\le y \\le {{fhi}}$.' },
  hint: 'Check whether the turning point lies inside the domain.',
  feedback: 'The least value ${{k}}$ is only reached at $x = {{h}}$, which is outside the domain.',
});

mkc('A.6A', 'distance-from-the-axis-of-symmetry', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'An upward parabola with $a = {{a}}$ has least value ${{k}}$ and reaches ${{y1}}$ at one input. How far is that input from the axis of symmetry?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      z: { type: 'int', min: 2, max: 9 },
      k: { type: 'int', min: 2, max: 60 },
    },
    derived: {
      d: 'a*z',
      y1: 'k+a*a*a*z*z',
      answer: 'a*z',
      // Answered the square of the distance.
      d_exponentError: 'a*a*z*z',
      // Divided by the coefficient twice.
      d_operationInverted: 'z',
      // Answered the square of the coefficient.
      d_ratioReversed: 'a*a',
    },
    constraints: ['abs(a-z)>1', 'a*z>7', 'abs(a*a-a*z)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_exponentError}}'), error: 'exponentError' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['The height above the least value is ${{y1}} - {{k}}$, which equals ${{a}}$ times the distance squared.', 'Dividing and taking the root gives ${{answer}}$.'],
  answerSummary: { headline: 'Strip the least value, divide by the coefficient, then take the root.', text: 'It is ${{answer}}$.' },
  hint: 'The rise above the vertex is $a$ times a square.',
  feedback: 'Stopping before the square root leaves the squared distance.',
});

mkc('A.6A', 'claim-about-a-parabola-with-a-least-value', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra1',
  prompt: 'An upward parabola has least value ${{k}}$ at $x = {{h}}$. Which statement is wrong?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 60 },
      h: { type: 'int', min: 1, max: 20 },
    },
    constraints: ['k>1'],
  },
  choices: [
    { label: 'Its domain is $y \\ge {{k}}$.', correct: true },
    { label: 'Its range is $y \\ge {{k}}$.', error: 'partialTotal' },
    { label: 'Its domain is every real number.', error: 'usedGivenValue' },
    { label: 'Every value above ${{k}}$ is reached at two inputs.', error: 'ratioReversed' },
  ],
  reasoning: ['The domain lists the inputs a rule accepts, and a quadratic accepts every real number.', 'The restriction to $y \\ge {{k}}$ describes the outputs, so it is the range.'],
  answerSummary: { headline: 'Domain is inputs; range is outputs.', text: 'The restriction belongs to the range.' },
  hint: 'Ask which of the two lists inputs.',
  feedback: 'A value above the least one really is reached on both sides of the vertex.',
});

// ================================================================ A.7A
// Vertex and axis of symmetry.

mkc('A.7A', 'vertex-from-standard-form', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'orderedPairs', courseId: 'algebra1',
  prompt: 'What is the vertex of $y = {{a}}x^2 - {{b}}x + {{c}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 1, max: 8 },
      h: { type: 'int', min: 1, max: 12 },
      c: { type: 'int', min: 5, max: 120 },
    },
    derived: {
      b: '2*a*h',
      k: 'c-a*h*h',
      negH: 'h',
    },
    constraints: ['c-a*h*h!=h', 'c-a*h*h!=c', 'h!=c'],
  },
  choices: [
    { label: plain('({{h}}, {{k}})'), correct: true },
    { label: plain('(-{{h}}, {{k}})'), error: 'signError' },
    { label: plain('({{k}}, {{h}})'), error: 'ratioReversed' },
    { label: plain('({{h}}, {{c}})'), error: 'forgotFinalStep' },
  ],
  reasoning: ['The axis of symmetry sits at $x = \\frac{{{b}}}{2 \\times {{a}}} = {{h}}$.', 'Substituting gives $y = {{k}}$, so the vertex is $({{h}}, {{k}})$.'],
  answerSummary: { headline: 'Find the axis first, then evaluate there.', text: 'It is $({{h}}, {{k}})$.' },
  hint: 'The vertex sits on the axis of symmetry.',
  feedback: 'The constant term is the height at $x = 0$, not at the vertex.',
});

mkc('A.7A', 'coefficient-behind-a-known-axis', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'The parabola $y = {{a}}x^2 + bx + {{c}}$ has axis of symmetry $x = -{{h}}$. What is $b$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      h: { type: 'int', min: 2, max: 14 },
      c: { type: 'int', min: 5, max: 200 },
    },
    derived: {
      answer: '2*a*h',
      // Doubled the coefficient a second time.
      d_exponentError: '4*a*h',
      // Left the doubling out.
      d_forgotFinalStep: 'a*h',
      // Answered the constant term.
      d_usedGivenValue: 'c',
    },
    constraints: ['2*a*h>9', 'abs(c-2*a*h)>5', 'abs(a*h-2*a*h)>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_exponentError}}'), error: 'exponentError' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The axis sits at $x = -\\frac{b}{2a}$, so $-{{h}} = -\\frac{b}{2 \\times {{a}}}$.', 'That gives $b = {{answer}}$.'],
  answerSummary: { headline: 'The axis divides the linear coefficient by twice the leading one.', text: '$b = {{answer}}$.' },
  hint: 'Rearrange the formula for the axis of symmetry.',
  feedback: 'The factor of two belongs on the denominator, so it multiplies when moved.',
});

mkc('A.7A', 'claim-about-a-parabola-in-vertex-form', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra1',
  prompt: 'The parabola $y = {{a}}(x - {{h}})^2 + {{k}}$ opens upwards. Which statement is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 1, max: 8 },
      h: { type: 'int', min: 2, max: 14 },
      k: { type: 'int', min: 2, max: 60 },
    },
    derived: { v: 'a*h*h+k' },
    constraints: ['h>1'],
  },
  choices: [
    { label: 'Its axis of symmetry is $x = -{{h}}$.', correct: true },
    { label: 'Its vertex is $({{h}}, {{k}})$.', error: 'partialTotal' },
    { label: 'Its least value is ${{k}}$.', error: 'usedGivenValue' },
    { label: 'It crosses the vertical axis at ${{v}}$.', error: 'ratioReversed' },
  ],
  reasoning: ['The squared term vanishes at $x = {{h}}$, which is where the axis of symmetry sits.', 'The minus sign inside the bracket does not move the axis to the other side.'],
  answerSummary: { headline: 'Vertex form shows the axis directly, sign included.', text: 'The axis is $x = {{h}}$.' },
  hint: 'Ask which input makes the bracket zero.',
  feedback: 'The least value really is ${{k}}$, reached at that same input.',
});

// ================================================================ A.7B
// Zeros and factors.

mkc('A.7B', 'axis-of-symmetry-from-two-zeros', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'A parabola has zeros at ${{r}}$ and $-{{s}}$. Where is its axis of symmetry?',
  generator: {
    parameters: {
      u: { type: 'int', min: 2, max: 24 },
      w: { type: 'int', min: 1, max: 20 },
    },
    derived: {
      r: '2*u',
      s: '2*w',
      answer: 'u-w',
      // Answered the gap between the two zeros.
      d_forgotFinalStep: '2*u+2*w',
      // Answered one zero.
      d_usedGivenValue: '2*u',
      // Averaged them the other way round.
      d_signError: 'w-u',
    },
    constraints: ['u-w>2', 'abs(2*u-(u-w))>4', 'u!=w'],
  },
  choices: [
    { label: plain('x = {{answer}}'), correct: true },
    { label: plain('x = {{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('x = {{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('x = {{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['The axis of symmetry sits midway between the two zeros.', 'The average of ${{r}}$ and $-{{s}}$ is ${{answer}}$.'],
  answerSummary: { headline: 'The axis is the average of the two zeros.', text: 'It is $x = {{answer}}$.' },
  hint: 'Average the two zeros, signs included.',
  feedback: 'The distance between the zeros is twice the distance from either to the axis.',
});

mkc('A.7B', 'coefficient-total-from-two-zeros', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'The quadratic $y = x^2 + bx + c$ has zeros ${{r}}$ and $-{{s}}$. What is $b + c$?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 20 },
      s: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      answer: 's-r-r*s',
      // Added the product instead of subtracting it.
      d_operationInverted: 's-r+r*s',
      // Took the two zeros the other way round.
      d_signError: 'r-s-r*s',
      // Answered the product of the zeros.
      d_partialTotal: 'r*s',
    },
    constraints: ['r!=s', 'abs(r-s)>1', 'r*s>7'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['With zeros ${{r}}$ and $-{{s}}$ the quadratic is $(x - {{r}})(x + {{s}})$.', 'Expanding gives $b = {{s}} - {{r}}$ and $c = -{{r}}{{s}}$, so the total is ${{answer}}$.'],
  answerSummary: { headline: 'Expand the factored form and read the coefficients.', text: 'It is ${{answer}}$.' },
  hint: 'Write the two factors before multiplying them out.',
  feedback: 'One zero is negative, so the constant term comes out negative too.',
});

mkc('A.7B', 'claim-about-a-single-zero', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra1',
  prompt: 'A quadratic has exactly one zero, at $x = {{r}}$. Which statement is wrong?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 24 },
      a: { type: 'int', min: 2, max: 8 },
    },
    constraints: ['r>1'],
  },
  choices: [
    { label: 'It can be written as $(x - {{r}})(x + {{r}})$.', correct: true },
    { label: 'It can be written as ${{a}}(x - {{r}})^{2}$.', error: 'partialTotal' },
    { label: 'Its turning point sits on the horizontal axis.', error: 'usedGivenValue' },
    { label: 'Its axis of symmetry is $x = {{r}}$.', error: 'ratioReversed' },
  ],
  reasoning: ['$(x - {{r}})(x + {{r}})$ has two zeros, at ${{r}}$ and $-{{r}}$.', 'A single zero needs the same factor twice over.'],
  answerSummary: { headline: 'One zero means one repeated factor.', text: 'That form has two zeros, not one.' },
  hint: 'Set each factor to zero in turn.',
  feedback: 'A repeated factor really does put the turning point on the axis.',
});

// ================================================================ A.8A
// Solving quadratic equations.

mkc('A.8A', 'gap-between-the-two-roots', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'Solve $x^2 - {{sum}}x + {{product}} = 0$. How far apart are the two roots?',
  generator: {
    parameters: {
      r: { type: 'int', min: 6, max: 40 },
      s: { type: 'int', min: 2, max: 30 },
    },
    derived: {
      sum: 'r+s',
      product: 'r*s',
      answer: 'r-s',
      // Added the two roots instead of comparing them.
      d_operationInverted: 'r+s',
      // Answered the smaller root.
      d_partialTotal: 's',
      // Compared the two the other way round.
      d_signError: 's-r',
    },
    constraints: ['r>s', 'r-s>3', 'abs(s-(r-s))>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['The two numbers that add to ${{sum}}$ and multiply to ${{product}}$ are ${{r}}$ and ${{s}}$.', 'They sit ${{answer}}$ apart.'],
  answerSummary: { headline: 'Factor first, then compare the roots.', text: 'They are ${{answer}}$ apart.' },
  hint: 'Look for two numbers with the given sum and product.',
  feedback: 'The sum of the roots is the coefficient, not the gap between them.',
});

mkc('A.8A', 'other-zero-from-one-of-them', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'The quadratic $x^2 + bx + {{c}}$ has ${{r}}$ as one zero. What is the other?',
  generator: {
    parameters: {
      r: { type: 'int', min: 2, max: 40 },
      s: { type: 'int', min: 2, max: 40 },
    },
    derived: {
      c: 'r*s',
      answer: 's',
      // Answered the constant term.
      d_forgotFinalStep: 'c',
      // Answered the zero that was given.
      d_usedGivenValue: 'r',
      // Made the second zero negative.
      d_signError: '0-s',
    },
    constraints: ['r!=s', 'abs(r-s)>3', 'r*s>9'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['With a leading coefficient of one, the two zeros multiply to the constant ${{c}}$.', 'So the other zero is ${{c}} \\div {{r}} = {{answer}}$.'],
  answerSummary: { headline: 'The zeros multiply to the constant term.', text: 'It is ${{answer}}$.' },
  hint: 'Write the quadratic in factored form.',
  feedback: 'Both zeros are positive here, since the constant is positive and the sum is negative.',
});

mkc('A.8A', 'claim-about-two-distinct-solutions', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra1',
  prompt: 'The equation $x^2 + {{b}}x + {{c}} = 0$ has two different real solutions. Which statement is wrong?',
  generator: {
    parameters: {
      b: { type: 'int', min: 2, max: 30 },
      c: { type: 'int', min: 2, max: 60 },
    },
    constraints: ['b*b>4*c'],
  },
  choices: [
    { label: 'Its graph touches the horizontal axis at exactly one point.', correct: true },
    { label: 'Its graph crosses the horizontal axis twice.', error: 'partialTotal' },
    { label: 'It factors into two different linear factors.', error: 'usedGivenValue' },
    { label: 'Its turning point lies off the horizontal axis.', error: 'ratioReversed' },
  ],
  reasoning: ['Two different real solutions put two separate crossings on the horizontal axis.', 'Touching at one point belongs to a repeated solution.'],
  answerSummary: { headline: 'Two solutions means two crossings, not one touch.', text: 'It crosses twice.' },
  hint: 'Sketch a parabola with two zeros.',
  feedback: 'The turning point does sit off the axis, between the two crossings.',
});

// ================================================================ A.10A
// Adding and subtracting polynomials.

mkc('A.10A', 'subtract-from-a-doubled-polynomial', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'Subtract $({{d}}x^2 + {{e}}x + {{f}})$ from twice $({{a}}x^2 + {{b}}x + {{c}})$.',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 2, max: 14 },
      c: { type: 'int', min: 2, max: 20 },
      d: { type: 'int', min: 2, max: 12 },
      e: { type: 'int', min: 2, max: 14 },
      f: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      qa: '2*a-d', qb: '2*b-e', qc: '2*c-f',
      wc: '2*c+f',
      pa: '2*a+d', pb: '2*b+e',
      ha: 'a-d', hb: 'b-e', hc: 'c-f',
    },
    constraints: ['2*a-d>0', '2*b-e>0', '2*c-f>0', 'a-d>0', 'b-e>0', 'c-f>0', '2*c-f!=2*c+f'],
  },
  choices: [
    { label: plain('{{qa}}x^2 + {{qb}}x + {{qc}}'), correct: true },
    { label: plain('{{qa}}x^2 + {{qb}}x + {{wc}}'), error: 'signError' },
    { label: plain('{{pa}}x^2 + {{pb}}x + {{wc}}'), error: 'operationInverted' },
    { label: plain('{{ha}}x^2 + {{hb}}x + {{hc}}'), error: 'partialTotal' },
  ],
  reasoning: ['Doubling the first gives $2{{a}}x^2 + 2{{b}}x + 2{{c}}$.', 'Subtracting the second takes each term away, leaving ${{qa}}x^2 + {{qb}}x + {{qc}}$.'],
  answerSummary: { headline: 'Double every term, then subtract every term.', text: 'It is ${{qa}}x^2 + {{qb}}x + {{qc}}$.' },
  hint: 'The doubling reaches all three terms.',
  feedback: 'The minus sign in front of the bracket changes every sign inside it.',
});

mkc('A.10A', 'width-from-an-algebraic-perimeter', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'A rectangle is ${{a}}x + {{b}}$ long and has perimeter ${{pa}}x + {{pb}}$. How wide is it?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 2, max: 20 },
      c: { type: 'int', min: 2, max: 12 },
      d: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      pa: '2*a+2*c',
      pb: '2*b+2*d',
      ua: 'pa-2*a', ub: 'pb-2*b',
      va: 'c', vb: '0-d',
      ha: 'pa/2', hb: 'pb/2',
    },
    constraints: ['a!=c', 'b!=d', 'c>1', 'd>1'],
  },
  choices: [
    { label: plain('{{c}}x + {{d}}'), correct: true },
    { label: plain('{{ua}}x + {{ub}}'), error: 'forgotFinalStep' },
    { label: plain('{{c}}x - {{d}}'), error: 'signError' },
    { label: plain('{{ha}}x + {{hb}}'), error: 'partialTotal' },
  ],
  reasoning: ['Half the perimeter is one length plus one width, or ${{ha}}x + {{hb}}$.', 'Taking the length off leaves ${{c}}x + {{d}}$.'],
  answerSummary: { headline: 'Halve the perimeter before removing the length.', text: 'It is ${{c}}x + {{d}}$ wide.' },
  hint: 'A perimeter counts each side twice.',
  feedback: 'Taking two lengths off the whole perimeter leaves two widths, not one.',
});

mkc('A.10A', 'what-cancels-a-squared-term', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra1',
  prompt: 'Adding ${{a}}x^2 + {{b}}x + {{c}}$ to a second quadratic leaves no $x^2$ term. What must be true of the second?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 14 },
      b: { type: 'int', min: 2, max: 16 },
      c: { type: 'int', min: 2, max: 30 },
    },
    constraints: ['a>1'],
  },
  choices: [
    { label: 'Its $x^2$ coefficient is $-{{a}}$.', correct: true },
    { label: 'Its $x^2$ coefficient is zero.', error: 'partialTotal' },
    { label: 'Its $x$ coefficient is $-{{b}}$.', error: 'ratioReversed' },
    { label: 'Its constant is $-{{c}}$.', error: 'usedGivenValue' },
  ],
  reasoning: ['Like terms add independently, so only the $x^2$ coefficients decide the $x^2$ term.', 'They cancel when the second is $-{{a}}$.'],
  answerSummary: { headline: 'Each power settles its own coefficient.', text: 'Its $x^2$ coefficient is $-{{a}}$.' },
  hint: 'Add the two $x^2$ coefficients and set the total to zero.',
  feedback: 'A zero coefficient would leave ${{a}}x^2$ standing.',
});

// ================================================================ A.10B
// Multiplying polynomials.

mkc('A.10B', 'expand-two-binomials-with-coefficients', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'Expand $({{a}}x + {{p}})({{b}}x + {{q}})$.',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 9 },
      p: { type: 'int', min: 2, max: 14 },
      q: { type: 'int', min: 2, max: 14 },
    },
    derived: {
      ab: 'a*b',
      mid: 'a*q+b*p',
      pq: 'p*q',
      midBad: 'a*b+p*q',
      midDiff: 'a*q-b*p',
    },
    constraints: ['a*q!=b*p', 'a*b+p*q!=a*q+b*p', 'a*q-b*p!=a*q+b*p', 'a*q-b*p!=a*b+p*q'],
  },
  choices: [
    { label: plain('{{ab}}x^2 + {{mid}}x + {{pq}}'), correct: true },
    { label: plain('{{ab}}x^2 + {{pq}}'), error: 'incompleteFactoring' },
    { label: plain('{{ab}}x^2 + {{midBad}}x + {{pq}}'), error: 'operationInverted' },
    { label: plain('{{ab}}x^2 + {{midDiff}}x + {{pq}}'), error: 'signError' },
  ],
  reasoning: ['The outer and inner products give ${{a}} \\times {{q}}$ and ${{b}} \\times {{p}}$.', 'Adding them gives the middle term ${{mid}}x$.'],
  answerSummary: { headline: 'Four products, with two of them combining.', text: 'It is ${{ab}}x^2 + {{mid}}x + {{pq}}$.' },
  hint: 'Multiply every term of the first bracket by every term of the second.',
  feedback: 'The middle term comes from two cross products, not from the outer coefficients alone.',
});

mkc('A.10B', 'other-side-of-an-algebraic-rectangle', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'A rectangle covers ${{ab}}x^2 + {{mid}}x + {{pq}}$ and one side is ${{a}}x + {{p}}$. What is the other side?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 9 },
      p: { type: 'int', min: 2, max: 14 },
      q: { type: 'int', min: 2, max: 14 },
    },
    derived: {
      ab: 'a*b',
      mid: 'a*q+b*p',
      pq: 'p*q',
    },
    constraints: ['a!=b', 'p!=q', 'b!=q', 'a*b!=p*q'],
  },
  choices: [
    { label: plain('{{b}}x + {{q}}'), correct: true },
    { label: plain('{{b}}x - {{q}}'), error: 'signError' },
    { label: plain('{{q}}x + {{b}}'), error: 'ratioReversed' },
    { label: plain('{{ab}}x + {{pq}}'), error: 'partialTotal' },
  ],
  reasoning: ['The leading terms multiply to ${{ab}}x^2$, so the other side starts ${{b}}x$.', 'The constants multiply to ${{pq}}$, so it ends $+ {{q}}$.'],
  answerSummary: { headline: 'Match the leading terms and the constants.', text: 'It is ${{b}}x + {{q}}$.' },
  hint: 'Divide the leading coefficient and the constant separately.',
  feedback: 'The whole leading coefficient belongs to both sides together, not to one.',
});

mkc('A.10B', 'what-a-difference-of-brackets-gives', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'verbal', courseId: 'algebra1',
  prompt: 'What does $(x + {{p}})(x - {{p}})$ come to?',
  generator: {
    parameters: { p: { type: 'int', min: 2, max: 20 } },
    derived: { p2: 'p*p', twoP: '2*p' },
    constraints: ['p>1'],
  },
  choices: [
    { label: 'The two $x$ terms cancel, leaving $x^2 - {{p2}}$.', correct: true },
    { label: 'It comes to $x^2 + {{p2}}$.', error: 'signError' },
    { label: 'It comes to $x^2 - {{twoP}}x - {{p2}}$.', error: 'partialTotal' },
    { label: 'It comes to $x^2 - {{p2}}x$.', error: 'operationInverted' },
  ],
  reasoning: ['The outer product is $-{{p}}x$ and the inner product is $+{{p}}x$, so they cancel.', 'What is left is $x^2 - {{p2}}$.'],
  answerSummary: { headline: 'Opposite constants cancel the middle term.', text: 'It is $x^2 - {{p2}}$.' },
  hint: 'Write out all four products.',
  feedback: 'The constants multiply to $-{{p2}}$, not to $+{{p2}}$.',
});

// ================================================================ A.10C
// Dividing a polynomial by a binomial.

mkc('A.10C', 'divide-by-a-binomial-with-a-coefficient', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'What is $({{a}}x^2 + {{mid}}x + {{last}}) \\div ({{b}}x + {{q}})$?',
  generator: {
    parameters: {
      b: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 2, max: 9 },
      p: { type: 'int', min: 2, max: 12 },
      q: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      a: 'b*c',
      mid: 'b*p+c*q',
      last: 'p*q',
    },
    constraints: ['b!=c', 'p!=q', 'c!=p', 'b*c!=p*q'],
  },
  choices: [
    { label: plain('{{c}}x + {{p}}'), correct: true },
    { label: plain('{{c}}x - {{p}}'), error: 'signError' },
    { label: plain('{{p}}x + {{c}}'), error: 'ratioReversed' },
    { label: plain('{{a}}x + {{last}}'), error: 'partialTotal' },
  ],
  reasoning: ['The leading terms give ${{a}} \\div {{b}} = {{c}}$, so the quotient starts ${{c}}x$.', 'The constants give ${{last}} \\div {{q}} = {{p}}$.'],
  answerSummary: { headline: 'Match the leading terms, then the constants.', text: 'It is ${{c}}x + {{p}}$.' },
  hint: 'Ask what multiplies ${{b}}x$ to give ${{a}}x^2$.',
  feedback: 'The quotient is smaller than the polynomial it came from.',
});

mkc('A.10C', 'how-much-longer-the-other-side-is', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'A rectangle covers $x^2 + {{sum}}x + {{product}}$ and one side is $x + {{p}}$. By how much does the other side exceed it?',
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 34 },
      gap: { type: 'int', min: 3, max: 30 },
    },
    derived: {
      q: 'p+gap',
      sum: '2*p+gap',
      product: 'p*(p+gap)',
      answer: 'gap',
      // Added the two constants instead of comparing them.
      d_operationInverted: '2*p+gap',
      // Answered the constant that was given.
      d_usedGivenValue: 'p',
      // Compared the two the other way round.
      d_signError: '0-gap',
    },
    constraints: ['gap>2', 'abs(p-gap)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['Dividing gives the other side as $x + {{q}}$.', 'That exceeds $x + {{p}}$ by ${{answer}}$.'],
  answerSummary: { headline: 'Divide out the known side, then compare the constants.', text: 'It exceeds it by ${{answer}}$.' },
  hint: 'The two constants multiply to ${{product}}$.',
  feedback: 'The sum of the constants is the middle coefficient, not the gap.',
});

mkc('A.10C', 'claim-about-an-exact-division', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra1',
  prompt: 'A quadratic divides exactly by $x + {{p}}$. Which statement is wrong?',
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 24 },
      q: { type: 'int', min: 2, max: 24 },
    },
    constraints: ['p!=q'],
  },
  choices: [
    { label: 'It has a zero at $x = {{p}}$.', correct: true },
    { label: 'It has a zero at $x = -{{p}}$.', error: 'signError' },
    { label: 'It has $x + {{p}}$ as one of its factors.', error: 'usedGivenValue' },
    { label: 'Substituting $-{{p}}$ makes it zero.', error: 'partialTotal' },
  ],
  reasoning: ['A factor of $x + {{p}}$ vanishes when $x = -{{p}}$, not when $x = {{p}}$.', 'So the zero sits on the negative side.'],
  answerSummary: { headline: 'A factor $x + p$ gives the zero $-p$.', text: 'The zero is $-{{p}}$.' },
  hint: 'Set the factor equal to zero and solve.',
  feedback: 'Dividing exactly and factoring are the same statement.',
});

// ================================================================ A.10D
// Distributing and factoring out.

mkc('A.10D', 'two-brackets-one-subtracted', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'Write ${{k}}({{a}}x - {{b}}) - {{m}}({{c}}x - {{d}})$ without brackets.',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 14 },
      m: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 2, max: 9 },
      d: { type: 'int', min: 2, max: 14 },
    },
    derived: {
      coef: 'k*a-m*c',
      con: 'm*d-k*b',
      conBad: '0-k*b-m*d',
      coefBad: 'k*a+m*c',
      conFlat: 'd-b',
    },
    constraints: ['k*a-m*c>0', 'm*d-k*b>0', 'd-b!=m*d-k*b', 'k*a!=m*c'],
  },
  choices: [
    { label: plain('{{coef}}x + {{con}}'), correct: true },
    { label: plain('{{coef}}x + {{conBad}}'), error: 'signError' },
    { label: plain('{{coefBad}}x + {{con}}'), error: 'operationInverted' },
    { label: plain('{{coef}}x + {{conFlat}}'), error: 'incompleteFactoring' },
  ],
  reasoning: ['The minus in front of the second bracket flips both terms inside it.', 'That gives ${{coef}}x + {{con}}$.'],
  answerSummary: { headline: 'A subtracted bracket has every sign inside it changed.', text: 'It is ${{coef}}x + {{con}}$.' },
  hint: 'Expand each bracket separately before combining.',
  feedback: 'Subtracting $-{{m}} \\times {{d}}$ adds, so the constant rises.',
});

mkc('A.10D', 'largest-factor-of-a-binomial', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'Taking out the largest possible factor, ${{ka}}x + {{kb}}$ becomes $g({{a}}x + {{b}})$. What is $g$?',
  generator: {
    parameters: {
      g: { type: 'int', min: 3, max: 24 },
      a: { type: 'int', min: 2, max: 20 },
      b: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      ka: 'g*a',
      kb: 'g*b',
      answer: 'g',
      // Answered the whole leading coefficient.
      d_usedGivenValue: 'ka',
      // Answered what is left inside the bracket.
      d_forgotFinalStep: 'a',
      // Answered the other term inside the bracket.
      d_ratioReversed: 'b',
    },
    constraints: ['gcd(a,b)==1', 'a!=b', 'abs(a-g)>2', 'abs(b-g)>2'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['${{ka}}$ and ${{kb}}$ share the factor ${{g}}$, and what is left shares nothing further.', 'So $g = {{answer}}$.'],
  answerSummary: { headline: 'The largest factor leaves a bracket with nothing left to take out.', text: '$g = {{answer}}$.' },
  hint: 'Check that ${{a}}$ and ${{b}}$ share no factor.',
  feedback: 'A term inside the bracket is what is left after the factor comes out.',
});

mkc('A.10D', 'shared-factor-across-two-brackets', {
  difficultyBand: 4, dok: 3, taskType: 'representationTranslation', representation: 'table', courseId: 'algebra1',
  prompt: 'Which of the listed expressions equals ${{k}}({{a}}x + {{b}}) + {{k}}({{c}}x + {{d}})$?',
  stimulus: {
    kind: 'table',
    columns: ['Expression'],
    rows: [
      ['${{k}}({{ac}}x + {{bd}})$'],
      ['${{k2}}({{ac}}x + {{bd}})$'],
      ['${{k}}({{ac}}x + {{b}})$'],
      ['${{k}}({{aTimesC}}x + {{bd}})$'],
    ],
  },
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 14 },
      c: { type: 'int', min: 2, max: 9 },
      d: { type: 'int', min: 2, max: 14 },
    },
    derived: {
      ac: 'a+c',
      bd: 'b+d',
      k2: '2*k',
      aTimesC: 'a*c',
    },
    constraints: ['a+c!=a*c', 'b+d!=b', 'a!=c'],
  },
  choices: [
    { label: plain('{{k}}({{ac}}x + {{bd}})'), correct: true },
    { label: plain('{{k2}}({{ac}}x + {{bd}})'), error: 'exponentError' },
    { label: plain('{{k}}({{ac}}x + {{b}})'), error: 'partialTotal' },
    { label: plain('{{k}}({{aTimesC}}x + {{bd}})'), error: 'ratioReversed' },
  ],
  reasoning: ['The shared ${{k}}$ comes out once, not twice.', 'What is left inside adds term by term, giving ${{ac}}x + {{bd}}$.'],
  answerSummary: { headline: 'A shared factor is taken out once for the whole sum.', text: 'It is ${{k}}({{ac}}x + {{bd}})$.' },
  hint: 'Expand both brackets and then take the factor back out.',
  feedback: 'Doubling the factor doubles the whole expression.',
});

// ================================================================ A.10E
// Factoring trinomials.

mkc('A.10E', 'perimeter-from-a-factored-area', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'A rectangle covers ${{a}}x^2 + {{mid}}x + {{last}}$. What is its perimeter?',
  generator: {
    parameters: {
      b: { type: 'int', min: 2, max: 9 },
      c: { type: 'int', min: 2, max: 9 },
      p: { type: 'int', min: 2, max: 12 },
      q: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      a: 'b*c',
      mid: 'b*q+c*p',
      last: 'p*q',
      coef: '2*(b+c)',
      con: '2*(p+q)',
      halfCoef: 'b+c',
      halfCon: 'p+q',
      prodCoef: '2*b*c',
      prodCon: '2*p*q',
    },
    constraints: ['b!=c', 'p!=q', '2*(b+c)!=2*b*c', '2*(p+q)!=2*p*q'],
  },
  choices: [
    { label: plain('{{coef}}x + {{con}}'), correct: true },
    { label: plain('{{halfCoef}}x + {{halfCon}}'), error: 'forgotFinalStep' },
    { label: plain('{{prodCoef}}x + {{prodCon}}'), error: 'ratioReversed' },
    { label: plain('{{coef}}x + {{halfCon}}'), error: 'partialTotal' },
  ],
  reasoning: ['The area factors as $({{b}}x + {{p}})({{c}}x + {{q}})$, which are the two sides.', 'Twice their total is ${{coef}}x + {{con}}$.'],
  answerSummary: { headline: 'Factor to find the sides, then double their total.', text: 'It is ${{coef}}x + {{con}}$.' },
  hint: 'A perimeter counts each side twice.',
  feedback: 'The sides add for a perimeter; they multiply only for the area.',
});

mkc('A.10E', 'missing-constant-in-a-second-factor', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'A quadratic factors as $({{b}}x + {{p}})({{c}}x + q)$ and its middle coefficient is ${{mid}}$. What is $q$?',
  generator: {
    parameters: {
      b: { type: 'int', min: 2, max: 9 },
      w: { type: 'int', min: 2, max: 30 },
      q: { type: 'int', min: 6, max: 40 },
      cRaw: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      c: 'cRaw',
      p: 'b*w/cRaw',
      mid: 'b*q+cRaw*p',
      answer: 'q',
      // Answered the middle coefficient itself.
      d_forgotFinalStep: 'mid',
      // Answered the constant in the first bracket.
      d_usedGivenValue: 'p',
      // Solved for the constant with the sign reversed.
      d_signError: '0-q',
    },
    constraints: ['b*w%cRaw==0', 'b*w/cRaw>1', 'abs(p-q)>3', 'abs(mid-q)>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['The middle coefficient is ${{b}}q + {{c}} \\times {{p}}$.', 'Setting that equal to ${{mid}}$ gives $q = {{answer}}$.'],
  answerSummary: { headline: 'The middle term collects both cross products.', text: '$q = {{answer}}$.' },
  hint: 'Write the middle coefficient in terms of $q$ first.',
  feedback: 'The middle coefficient still has the other cross product inside it.',
});

mkc('A.10E', 'claim-about-a-monic-factorisation', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra1',
  prompt: 'A quadratic factors as $(x + {{p}})(x + {{q}})$. Which statement is wrong?',
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 20 },
      q: { type: 'int', min: 2, max: 20 },
    },
    derived: { pq: 'p*q', sum: 'p+q' },
    constraints: ['p!=q', 'p*q!=p+q'],
  },
  choices: [
    { label: 'Its middle coefficient is ${{pq}}$.', correct: true },
    { label: 'Its middle coefficient is ${{sum}}$.', error: 'partialTotal' },
    { label: 'Its constant term is ${{pq}}$.', error: 'usedGivenValue' },
    { label: 'Its zeros are $-{{p}}$ and $-{{q}}$.', error: 'ratioReversed' },
  ],
  reasoning: ['Expanding gives $x^2 + ({{p}} + {{q}})x + {{p}}{{q}}$.', 'The two constants add for the middle term and multiply for the last one.'],
  answerSummary: { headline: 'Add for the middle, multiply for the constant.', text: 'The middle coefficient is ${{sum}}$.' },
  hint: 'Expand the two brackets.',
  feedback: 'The product does appear, but as the constant term.',
});

// ================================================================ A.10F
// Difference of two squares.

mkc('A.10F', 'total-of-the-two-factors', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'Factor ${{aSq}}x^2 - {{bSq}}$. What do the two factors add to?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 14 },
      b: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      aSq: 'a*a',
      bSq: 'b*b',
      twoA: '2*a',
      twoB: '2*b',
      aSq2: '2*a*a',
    },
    constraints: ['a!=b', '2*a!=2*a*a'],
  },
  choices: [
    { label: plain('{{twoA}}x'), correct: true },
    { label: plain('{{aSq2}}x'), error: 'exponentError' },
    { label: plain('{{twoA}}x + {{twoB}}'), error: 'partialTotal' },
    { label: plain('{{twoA}}x - {{twoB}}'), error: 'signError' },
  ],
  reasoning: ['The factors are $({{a}}x - {{b}})$ and $({{a}}x + {{b}})$.', 'Their constants cancel, leaving ${{twoA}}x$.'],
  answerSummary: { headline: 'The two constants are opposites, so they cancel.', text: 'They add to ${{twoA}}x$.' },
  hint: 'Write both factors before adding them.',
  feedback: 'The factors carry ${{a}}x$ each, not ${{a}}^{2}x$.',
});

mkc('A.10F', 'constant-behind-a-known-factor', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'The expression ${{aSq}}x^2 - c$ factors as a difference of two squares with $({{a}}x - {{b}})$ as one factor. What is $c$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 20 },
      b: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      aSq: 'a*a',
      answer: 'b*b',
      // Multiplied both squares together.
      d_operationInverted: 'a*a*b*b',
      // Answered the constant inside the factor.
      d_forgotFinalStep: 'b',
      // Answered the square of the other coefficient.
      d_usedGivenValue: 'a*a',
    },
    constraints: ['a!=b', 'abs(a*a-b*b)>5', 'b*b>7'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['A difference of squares needs the other factor to be $({{a}}x + {{b}})$.', 'Multiplying gives ${{aSq}}x^2 - {{answer}}$.'],
  answerSummary: { headline: 'The constant is the square of the one in the factor.', text: '$c = {{answer}}$.' },
  hint: 'Write the matching factor and multiply out.',
  feedback: 'The constant is squared, not left as it stands.',
});

mkc('A.10F', 'expression-that-is-not-a-difference-of-squares', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'table', courseId: 'algebra1',
  prompt: 'Which of the listed expressions cannot be factored as a difference of two squares?',
  stimulus: {
    kind: 'table',
    columns: ['Expression'],
    rows: [
      ['$x^2 + {{bSq}}$'],
      ['$x^2 - {{bSq}}$'],
      ['${{aSq}}x^2 - {{bSq}}$'],
      ['${{bSq}} - x^2$'],
    ],
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 2, max: 16 },
    },
    derived: { aSq: 'a*a', bSq: 'b*b' },
    constraints: ['a!=b'],
  },
  choices: [
    { label: plain('x^2 + {{bSq}}'), correct: true },
    { label: plain('x^2 - {{bSq}}'), error: 'signError' },
    { label: plain('{{aSq}}x^2 - {{bSq}}'), error: 'usedGivenValue' },
    { label: plain('{{bSq}} - x^2'), error: 'partialTotal' },
  ],
  reasoning: ['The pattern needs one square taken away from another.', 'A sum of two squares has no such factorisation over the real numbers.'],
  answerSummary: { headline: 'The pattern is a difference, never a sum.', text: 'It is $x^2 + {{bSq}}$.' },
  hint: 'Look for a minus sign between two squares.',
  feedback: 'Which square comes first does not matter, so long as one is subtracted.',
});

// ================================================================ A.11A
// Radicals.

mkc('A.11A', 'combine-two-scaled-roots', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'Simplify ${{k}}\\sqrt{{{a}}} + {{m}}\\sqrt{{{b}}}$.',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      m: { type: 'int', min: 2, max: 9 },
      p: { type: 'int', min: 2, max: 7 },
      q: { type: 'int', min: 2, max: 7 },
      r: { type: 'int', min: 2, max: 7 },
    },
    derived: {
      a: 'p*p*r',
      b: 'q*q*r',
      coef: 'k*p+m*q',
      coefFlat: 'k+m',
      coefSwap: 'k*q+m*p',
      ab: 'a+b',
    },
    constraints: ['p!=q', 'r!=4', 'k*p+m*q!=k*q+m*p', 'k*p+m*q!=k+m'],
  },
  choices: [
    { label: plain('{{coef}}\\sqrt{{{r}}}'), correct: true },
    { label: plain('{{coefFlat}}\\sqrt{{{r}}}'), error: 'partialTotal' },
    { label: plain('{{coefSwap}}\\sqrt{{{r}}}'), error: 'ratioReversed' },
    { label: plain('{{coef}}\\sqrt{{{ab}}}'), error: 'operationInverted' },
  ],
  reasoning: ['$\\sqrt{{{a}}}$ is ${{p}}\\sqrt{{{r}}}$ and $\\sqrt{{{b}}}$ is ${{q}}\\sqrt{{{r}}}$.', 'Adding gives $({{k}} \\times {{p}} + {{m}} \\times {{q}})\\sqrt{{{r}}}$.'],
  answerSummary: { headline: 'Reduce both roots to the same surd before adding.', text: 'It is ${{coef}}\\sqrt{{{r}}}$.' },
  hint: 'Pull the square factors out of each root first.',
  feedback: 'Roots add only once the surd inside them matches.',
});

mkc('A.11A', 'side-from-a-diagonal-in-surd-form', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'A rectangle is ${{w}}$ cm wide with a diagonal of $\\sqrt{{{d}}}$ cm. How tall is it?',
  generator: {
    parameters: {
      w: { type: 'int', min: 2, max: 30 },
      h: { type: 'int', min: 2, max: 30 },
    },
    derived: {
      d: 'w*w+h*h',
      answer: 'h',
      // Stopped before taking the square root.
      d_operationInverted: 'h*h',
      // Answered the width that was given.
      d_usedGivenValue: 'w',
      // Subtracted the lengths instead of their squares.
      d_forgotFinalStep: 'round(sqrt(d))-w',
    },
    constraints: ['abs(w-h)>2', 'h>3', 'round(sqrt(w*w+h*h))-w>0', 'abs(round(sqrt(w*w+h*h))-w-h)>2'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['The diagonal squared is ${{d}}$, and the width squared is ${{w}} \\times {{w}}$.', 'What is left is the height squared, so the height is ${{answer}}$.'],
  answerSummary: { headline: 'Work with the squares, then take one root at the end.', text: 'It is ${{answer}}$ cm tall.' },
  hint: 'The diagonal is already given as a square root.',
  feedback: 'Subtracting the lengths themselves skips the squaring the theorem needs.',
});

mkc('A.11A', 'claim-about-a-simplified-root', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra1',
  prompt: 'Which statement about $\\sqrt{{{n}}}$ is wrong?',
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 9 },
      r: { type: 'int', min: 2, max: 7 },
    },
    derived: {
      n: 'p*p*r',
      p2: 'p*p',
      lo: 'floor(sqrt(p*p*r))',
      hi: 'floor(sqrt(p*p*r))+1',
    },
    constraints: ['r!=4', 'r!=1', 'floor(sqrt(p*p*r))>1'],
  },
  choices: [
    { label: 'It equals $\\sqrt{{{p2}}}$ divided by $\\sqrt{{{r}}}$.', correct: true },
    { label: 'It equals ${{p}}\\sqrt{{{r}}}$.', error: 'partialTotal' },
    { label: 'Its square is ${{n}}$.', error: 'usedGivenValue' },
    { label: 'It lies between ${{lo}}$ and ${{hi}}$.', error: 'ratioReversed' },
  ],
  reasoning: ['$\\sqrt{{{n}}}$ splits as $\\sqrt{{{p2}}} \\times \\sqrt{{{r}}}$, a product.', 'Dividing instead would give a far smaller value.'],
  answerSummary: { headline: 'A root splits across a product, not a quotient.', text: 'The two roots multiply.' },
  hint: 'Square the claimed value and see what comes out.',
  feedback: 'Pulling the square factor out really does give ${{p}}\\sqrt{{{r}}}$.',
});

// ================================================================ A.11B
// Exponent rules.

mkc('A.11B', 'power-of-a-scaled-term-over-a-power', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'Simplify $\\frac{({{k}}x^{{{a}}})^{{{b}}}}{x^{{{c}}}}$.',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 4 },
      a: { type: 'int', min: 2, max: 6 },
      b: { type: 'int', min: 2, max: 3 },
      c: { type: 'int', min: 2, max: 8 },
    },
    derived: {
      kb: 'k^b',
      exp: 'a*b-c',
      expBad: 'a+b-c',
      expProd: 'a*b*c',
    },
    constraints: ['a*b-c>1', 'a+b-c>0', 'a*b-c!=a+b-c', 'a*b-c!=a*b*c'],
  },
  choices: [
    { label: plain('{{kb}}x^{{{exp}}}'), correct: true },
    { label: plain('{{k}}x^{{{exp}}}'), error: 'partialTotal' },
    { label: plain('{{kb}}x^{{{expBad}}}'), error: 'exponentError' },
    { label: plain('{{kb}}x^{{{expProd}}}'), error: 'operationInverted' },
  ],
  reasoning: ['Raising to the power ${{b}}$ reaches the ${{k}}$ as well as the $x$, giving ${{kb}}x^{{{a}} \\times {{b}}}$.', 'Dividing then takes ${{c}}$ off the exponent.'],
  answerSummary: { headline: 'An outer power reaches every factor inside.', text: 'It is ${{kb}}x^{{{exp}}}$.' },
  hint: 'Deal with the bracket before the division.',
  feedback: 'Powers multiply when a power is raised to a power; they do not add.',
});

mkc('A.11B', 'side-exponent-of-an-algebraic-cube', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'A cube of side ${{k}}x^{m}$ has volume ${{V}}x^{{{pw}}}$. What is $m$?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 14 },
      z: { type: 'int', min: 2, max: 4 },
    },
    derived: {
      V: 'k^3',
      pw: '9*z',
      answer: '3*z',
      // Answered the volume's exponent.
      d_forgotFinalStep: 'pw',
      // Divided by three twice over.
      d_operationInverted: 'z',
      // Answered the side's coefficient.
      d_usedGivenValue: 'k',
    },
    constraints: ['abs(k-3*z)>2', '3*z>5'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Cubing the side gives ${{k}}^{3}x^{3m}$.', 'Matching the exponent gives $3m = {{pw}}$, so $m = {{answer}}$.'],
  answerSummary: { headline: 'Cubing multiplies the exponent by three.', text: '$m = {{answer}}$.' },
  hint: 'Write the volume in terms of $m$ first.',
  feedback: 'The volume exponent is three times the side exponent, not the side exponent itself.',
});

mkc('A.11B', 'claim-about-two-powers-of-the-same-base', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra1',
  prompt: 'Which statement about $x^{{{a}}}$ and $x^{{{b}}}$ is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 3, max: 12 },
      b: { type: 'int', min: 2, max: 9 },
    },
    derived: { sum: 'a+b', prod: 'a*b', diff: 'a-b' },
    constraints: ['a>b', 'a+b!=a*b'],
  },
  choices: [
    { label: 'Their product is $x^{{{prod}}}$.', correct: true },
    { label: 'Their product is $x^{{{sum}}}$.', error: 'partialTotal' },
    { label: 'Their quotient is $x^{{{diff}}}$.', error: 'usedGivenValue' },
    { label: '$(x^{{{a}}})^{{{b}}}$ is $x^{{{prod}}}$.', error: 'ratioReversed' },
  ],
  reasoning: ['Multiplying powers of the same base adds the exponents.', 'Multiplying the exponents belongs to raising a power to a power.'],
  answerSummary: { headline: 'Add exponents to multiply; multiply them to raise a power.', text: 'The product is $x^{{{sum}}}$.' },
  hint: 'Write both powers out in full for small exponents.',
  feedback: 'The product ${{prod}}$ does appear, but as the exponent of a power of a power.',
});

// ================================================================ A.12A
// Relations and functions.

mkc('A.12A', 'input-that-can-be-added-freely', {
  difficultyBand: 4, dok: 2, taskType: 'interpretation', representation: 'table', courseId: 'algebra1',
  prompt: 'The table lists a relation. Adding which input would keep it a function whatever output it took?',
  stimulus: {
    kind: 'table',
    columns: ['Input', 'Output'],
    rows: [['${{x1}}$', '${{y1}}$'], ['${{x2}}$', '${{y2}}$'], ['${{x3}}$', '${{y3}}$']],
  },
  generator: {
    parameters: {
      x1: { type: 'int', min: 1, max: 9 },
      x2: { type: 'int', min: 10, max: 19 },
      x3: { type: 'int', min: 20, max: 29 },
      x4: { type: 'int', min: 1, max: 29 },
      y1: { type: 'int', min: 2, max: 30 },
      y2: { type: 'int', min: 31, max: 60 },
      y3: { type: 'int', min: 61, max: 90 },
    },
    constraints: ['x4!=x1', 'x4!=x2', 'x4!=x3'],
  },
  choices: [
    { label: plain('{{x4}}'), correct: true },
    { label: plain('{{x1}}'), error: 'usedGivenValue' },
    { label: plain('{{x2}}'), error: 'partialTotal' },
    { label: plain('{{x3}}'), error: 'ratioReversed' },
  ],
  rankAnalysisNotApplicable: false,
  reasoning: ['An input already in the table would need to repeat its own output exactly.', 'Only ${{x4}}$ is new, so any output at all is safe.'],
  answerSummary: { headline: 'A fresh input can take any output.', text: 'It is ${{x4}}$.' },
  hint: 'Look for the input that does not already appear.',
  feedback: 'An input already listed constrains what output it may take.',
});

mkc('A.12A', 'inputs-behind-a-function-with-repeats', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal', courseId: 'algebra1',
  prompt: 'A function is written as ${{n}}$ pairs, and only ${{k}}$ different outputs appear. How many different inputs are there?',
  generator: {
    parameters: {
      n: { type: 'int', min: 5, max: 14 },
      k: { type: 'int', min: 2, max: 6 },
    },
    derived: { diff: 'n-k', total: 'n+k' },
    constraints: ['k<n', 'n-k>1'],
  },
  choices: [
    { label: '${{n}}$, one for each pair.', correct: true },
    { label: '${{k}}$, one for each output.', error: 'ratioReversed' },
    { label: '${{diff}}$, the pairs left over.', error: 'partialTotal' },
    { label: '${{total}}$, the pairs and the outputs together.', error: 'operationInverted' },
  ],
  reasoning: ['A function may send several inputs to one output, but never one input to several.', 'So each of the ${{n}}$ pairs carries its own input.'],
  answerSummary: { headline: 'Outputs may repeat; inputs may not.', text: 'There are ${{n}}$.' },
  hint: 'Ask which side of a pair is allowed to repeat.',
  feedback: 'Only ${{k}}$ outputs appear because several inputs share them.',
});

mkc('A.12A', 'what-being-a-function-requires', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra1',
  prompt: 'A mapping sends ${{a}}$ and ${{b}}$ to ${{p}}$, and ${{c}}$ to ${{q}}$. Which statement must be true of every function?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      b: { type: 'int', min: 13, max: 24 },
      c: { type: 'int', min: 25, max: 36 },
      p: { type: 'int', min: 2, max: 40 },
      q: { type: 'int', min: 41, max: 80 },
    },
    constraints: ['p!=q'],
  },
  choices: [
    { label: 'Every input has exactly one output.', correct: true },
    { label: 'Every output comes from exactly one input.', error: 'ratioReversed' },
    { label: 'There are as many outputs as inputs.', error: 'partialTotal' },
    { label: 'No two pairs share an output.', error: 'usedGivenValue' },
  ],
  reasoning: ['The mapping described sends two inputs to ${{p}}$ and is still a function.', 'The requirement runs the other way: one output per input.'],
  answerSummary: { headline: 'The rule constrains outputs per input only.', text: 'Every input has exactly one output.' },
  hint: 'Test each claim against the mapping described.',
  feedback: 'Sharing an output is exactly what the mapping described does.',
});

// ================================================================ A.12B
// Function notation.

mkc('A.12B', 'gap-between-two-function-values', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'For $f(x) = {{a}}x + {{b}}$, what is $f({{v}}) - f({{w}})$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 16 },
      b: { type: 'int', min: 2, max: 140 },
      w: { type: 'int', min: 2, max: 14 },
      gap: { type: 'int', min: 2, max: 16 },
    },
    derived: {
      v: 'w+gap',
      answer: 'a*gap',
      // Added the two inputs instead of comparing them.
      d_operationInverted: 'a*(2*w+gap)+2*b',
      // Answered the gap between the inputs.
      d_forgotFinalStep: 'gap',
      // Answered the constant, which cancels.
      d_usedGivenValue: 'b',
    },
    constraints: ['a*gap>7', 'abs(b-a*gap)>5', 'abs(gap-a*gap)>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The constant ${{b}}$ appears in both outputs, so it cancels.', 'What is left is ${{a}}$ times the gap in inputs, or ${{answer}}$.'],
  answerSummary: { headline: 'A difference of outputs cancels the constant.', text: 'It is ${{answer}}$.' },
  hint: 'Write both outputs before subtracting.',
  feedback: 'The gap in inputs still has to be scaled by ${{a}}$.',
});

mkc('A.12B', 'second-output-from-a-known-one', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'For $f(x) = {{a}}x + b$, $f({{v}}) = {{t}}$. What is $f({{w}})$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 16 },
      v: { type: 'int', min: 2, max: 14 },
      gap: { type: 'int', min: 2, max: 16 },
      t: { type: 'int', min: 20, max: 110 },
    },
    derived: {
      w: 'v+gap',
      answer: 't+a*gap',
      // Added the two inputs instead of the change between them.
      d_operationInverted: 't+a*(2*v+gap)',
      // Answered the output that was given.
      d_usedGivenValue: 't',
      // Answered the second input scaled by the rate.
      d_ratioReversed: 'a*(v+gap)',
    },
    constraints: ['abs(a*(v+gap)-t-a*gap)>5', 'a*gap>5'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['Moving from ${{v}}$ to ${{w}}$ is a change of ${{gap}}$ in the input.', 'That raises the output by ${{a}} \\times {{gap}}$, giving ${{answer}}$.'],
  answerSummary: { headline: 'The unknown constant cancels between the two outputs.', text: 'It is ${{answer}}$.' },
  hint: 'The constant $b$ never has to be found.',
  feedback: 'The rate applies to the change in input, not to the input itself.',
});

mkc('A.12B', 'claim-about-function-notation', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra1',
  prompt: 'For $f(x) = {{a}}x + {{b}}$, which statement is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 16 },
      b: { type: 'int', min: 2, max: 60 },
      v: { type: 'int', min: 2, max: 14 },
      w: { type: 'int', min: 15, max: 30 },
    },
    constraints: ['b>1', 'v<w'],
  },
  choices: [
    { label: '$f({{v}} + {{w}})$ equals $f({{v}}) + f({{w}})$.', correct: true },
    { label: '$f({{v}})$ is the output at the input ${{v}}$.', error: 'usedGivenValue' },
    { label: '$f({{v}} + {{w}})$ equals ${{a}}({{v}} + {{w}}) + {{b}}$.', error: 'partialTotal' },
    { label: '$f({{v}}) - f({{w}})$ equals ${{a}}({{v}} - {{w}})$.', error: 'ratioReversed' },
  ],
  reasoning: ['Adding the two outputs counts the constant ${{b}}$ twice.', '$f({{v}} + {{w}})$ counts it only once.'],
  answerSummary: { headline: 'The constant is added once per evaluation, not once per input.', text: 'The two are not equal.' },
  hint: 'Work out both sides for small values.',
  feedback: 'The difference of two outputs really does cancel the constant.',
});

// ================================================================ A.12E
// Rearranging a formula.

mkc('A.12E', 'hours-from-a-rearranged-bill', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'A bill follows $T = {{a}}h + {{b}}$. Solve for $h$, and find $h$ when $T = {{t}}$.',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      j: { type: 'int', min: 2, max: 10 },
      u: { type: 'int', min: 4, max: 66 },
    },
    derived: {
      b: 'a*j',
      t: 'a*u+a*j',
      answer: 'u',
      // Stopped after removing the fixed charge.
      d_forgotFinalStep: 'a*u',
      // Answered the fixed charge.
      d_usedGivenValue: 'b',
      // Took the fixed charge off twice.
      d_operationInverted: 'u-j',
    },
    constraints: ['u-j>1', 'abs(b-u)>4', 'abs(a*u-u)>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['Rearranging gives $h = \\frac{T - {{b}}}{{{a}}}$.', 'At $T = {{t}}$ that comes to ${{answer}}$.'],
  answerSummary: { headline: 'Remove the fixed charge before dividing by the rate.', text: '$h = {{answer}}$.' },
  hint: 'The fixed charge is paid once, whatever $h$ is.',
  feedback: 'What is left after the fixed charge still has to be divided by the rate.',
});

mkc('A.12E', 'current-from-a-rearranged-resistance', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra1',
  prompt: 'Solve $R = \\frac{{{a}}V}{I}$ for $I$, and find $I$ when $R = {{r}}$ and $V = {{v}}$.',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 12 },
      r: { type: 'int', min: 2, max: 12 },
      z: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      v: 'r*z',
      answer: 'a*z',
      // Stopped at the numerator.
      d_forgotFinalStep: 'a*r*z',
      // Divided by the coefficient as well.
      d_ratioReversed: 'z',
      // Answered the voltage that was given.
      d_usedGivenValue: 'v',
    },
    constraints: ['abs(a-r)>1', 'a*z>7', 'abs(a*z-z)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Multiplying by $I$ and dividing by $R$ gives $I = \\frac{{{a}}V}{R}$.', 'At $R = {{r}}$ and $V = {{v}}$ that is ${{answer}}$.'],
  answerSummary: { headline: 'A variable in a denominator swaps places with the subject.', text: '$I = {{answer}}$.' },
  hint: 'Clear the fraction before isolating $I$.',
  feedback: 'The coefficient ${{a}}$ stays on the top when $I$ moves.',
});

mkc('A.12E', 'rearrangement-that-keeps-the-constant-inside', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'table', courseId: 'algebra1',
  prompt: 'Which of the listed rearrangements gives $A = {{a}}b + c$ solved for $b$?',
  stimulus: {
    kind: 'table',
    columns: ['Rearrangement'],
    rows: [
      ['$b = \\frac{A - c}{{{a}}}$'],
      ['$b = \\frac{A}{{{a}}} - c$'],
      ['$b = \\frac{A + c}{{{a}}}$'],
      ['$b = A - {{a}}c$'],
    ],
  },
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 16 },
      c: { type: 'int', min: 2, max: 40 },
    },
    constraints: ['a>1'],
  },
  choices: [
    { label: plain('b = \\frac{A - c}{{{a}}}'), correct: true },
    { label: plain('b = \\frac{A}{{{a}}} - c'), error: 'partialTotal' },
    { label: plain('b = \\frac{A + c}{{{a}}}'), error: 'signError' },
    { label: plain('b = A - {{a}}c'), error: 'operationInverted' },
  ],
  reasoning: ['The constant $c$ has to come off before anything is divided.', 'Dividing only $A$ leaves $c$ unscaled.'],
  answerSummary: { headline: 'Undo the addition first, then the multiplication.', text: 'It is $b = \\frac{A - c}{{{a}}}$.' },
  hint: 'Work backwards through the operations applied to $b$.',
  feedback: 'Dividing after moving $c$ means $c$ is divided too.',
});

// ================================================================ A2.4D
// Completing the square.

mkc('A2.4D', 'how-far-above-the-least-cost', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra2',
  prompt: 'A cost follows $C = {{a}}x^2 - {{b}}x + {{c}}$. How far above its least value is the cost at $x = {{v}}$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 1, max: 6 },
      h: { type: 'int', min: 2, max: 14 },
      g: { type: 'int', min: 2, max: 12 },
      c: { type: 'int', min: 20, max: 400 },
    },
    derived: {
      b: '2*a*h',
      v: 'h+g',
      answer: 'a*g*g',
      // Squared the coefficient as well as the distance.
      d_exponentError: 'a*a*g*g',
      // Left the coefficient out.
      d_forgotFinalStep: 'g*g',
      // Answered the least value itself.
      d_usedGivenValue: 'c-a*h*h',
    },
    constraints: ['c-a*h*h>0', 'a*g*g>7', 'abs(c-a*h*h-a*g*g)>5', 'a>1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_exponentError}}'), error: 'exponentError' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Completing the square puts the turning point at $x = {{h}}$.', 'At $x = {{v}}$ the cost sits ${{a}} \\times {{g}}^{2} = {{answer}}$ above it.'],
  answerSummary: { headline: 'The rise above the minimum is the coefficient times a square.', text: 'It is ${{answer}}$ above.' },
  hint: 'Find the turning point before evaluating anything.',
  feedback: 'The coefficient multiplies the square once, not twice.',
});

mkc('A2.4D', 'coefficient-behind-a-known-least-value', {
  difficultyBand: 5, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra2',
  prompt: 'A cost $C = {{a}}x^2 - bx + {{c}}$ has least value ${{k}}$. What is $b$?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 8 },
      h: { type: 'int', min: 2, max: 16 },
      k: { type: 'int', min: 5, max: 150 },
    },
    derived: {
      c: 'k+a*h*h',
      answer: '2*a*h',
      // Answered the constant the prompt already gives.
      d_usedGivenValue: 'k+a*h*h',
      // Answered the least value rather than the coefficient behind it.
      d_partialTotal: 'k',
      // Left the turning point undoubled.
      d_offByOneStep: 'a*h',
    },
    constraints: ['2*a*h>7', 'abs(2*a*h-k)>4', 'abs(a*h-k)>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
  ],
  reasoning: ['Vertex form makes the least value ${{c}} - {{a}}h^{2} = {{k}}$, so $h = {{h}}$.', 'The turning point is $\\frac{b}{2 \\times {{a}}}$, giving $b = {{answer}}$.'],
  answerSummary: { headline: 'The least value fixes the turning point, and the turning point fixes $b$.', text: '$b = {{answer}}$.' },
  hint: 'Work out how far the least value sits below the constant.',
  feedback: 'The turning point is half of $\\frac{b}{{{a}}}$, so $b$ is twice as large again.',
});

mkc('A2.4D', 'claim-about-a-completed-square', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra2',
  prompt: 'Completing the square on ${{a}}x^2 - {{b}}x + {{c}}$ gives ${{a}}(x - {{h}})^2 + k$. Which statement is wrong?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 8 },
      h: { type: 'int', min: 2, max: 14 },
      c: { type: 'int', min: 20, max: 300 },
    },
    derived: { b: '2*a*h', k: 'c-a*h*h' },
    constraints: ['c-a*h*h>0', 'c!=c-a*h*h'],
  },
  choices: [
    { label: 'The value of $k$ is ${{c}}$.', correct: true },
    { label: 'The value of ${{h}}$ is $\\frac{{{b}}}{2 \\times {{a}}}$.', error: 'partialTotal' },
    { label: 'The least value of the expression is $k$.', error: 'usedGivenValue' },
    { label: 'The two forms agree at every value of $x$.', error: 'ratioReversed' },
  ],
  reasoning: ['Expanding ${{a}}(x - {{h}})^2$ contributes ${{a}} \\times {{h}}^{2}$ to the constant.', 'So $k$ is ${{c}}$ less that amount, not ${{c}}$ itself.'],
  answerSummary: { headline: 'Completing the square borrows from the constant.', text: '$k$ is ${{k}}$, not ${{c}}$.' },
  hint: 'Expand the vertex form and compare constants.',
  feedback: 'The two forms really are equal at every input; that is the point of the rewrite.',
});

// ================================================================ A2.4F
// Radical and quadratic equations.

mkc('A2.4F', 'solve-a-scaled-root-with-a-shift', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra2',
  prompt: 'Solve ${{k}}\\sqrt{x + {{a}}} = {{p}}$.',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      m: { type: 'int', min: 4, max: 12 },
      a: { type: 'int', min: 2, max: 140 },
    },
    derived: {
      p: 'k*m',
      answer: 'm*m-a',
      // Never took the shift off.
      d_forgotFinalStep: 'm*m',
      // Answered the shift that was given.
      d_usedGivenValue: 'a',
      // Never squared.
      d_exponentError: 'm-a',
    },
    constraints: ['m*m-a>4', 'abs(2*a-m*m)>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_exponentError}}'), error: 'exponentError' },
  ],
  reasoning: ['Dividing by ${{k}}$ leaves $\\sqrt{x + {{a}}} = {{m}}$.', 'Squaring and subtracting ${{a}}$ gives $x = {{answer}}$.'],
  answerSummary: { headline: 'Free the root before squaring, and undo the shift after.', text: '$x = {{answer}}$.' },
  hint: 'The coefficient has to go before the squaring.',
  feedback: 'Squaring gives what is under the root, which still has ${{a}}$ added.',
});

mkc('A2.4F', 'shift-behind-a-known-radical-solution', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra2',
  prompt: 'For which $a$ does $\\sqrt{x + a} = {{b}}$ have the solution $x = {{v}}$?',
  generator: {
    parameters: {
      b: { type: 'int', min: 4, max: 16 },
      v: { type: 'int', min: 4, max: 260 },
    },
    derived: {
      answer: 'b*b-v',
      // Added the solution instead of taking it off.
      d_operationInverted: 'b*b+v',
      // Took the difference the other way round.
      d_signError: 'v-b*b',
      // Answered the solution that was given.
      d_usedGivenValue: 'v',
    },
    constraints: ['b*b-v>3', 'abs(2*v-b*b)>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Squaring gives ${{v}} + a = {{b}}^{2}$.', 'So $a = {{b}}^{2} - {{v}} = {{answer}}$.'],
  answerSummary: { headline: 'Square first, then solve for what is missing.', text: '$a = {{answer}}$.' },
  hint: 'Substitute the solution and square both sides.',
  feedback: 'The solution is subtracted from the square, not added to it.',
});

mkc('A2.4F', 'first-step-on-a-scaled-root', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'verbal', courseId: 'algebra2',
  prompt: 'Which first step solves ${{k}}\\sqrt{x} = {{p}}$ correctly?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 12 },
      p: { type: 'int', min: 10, max: 200 },
    },
    derived: { kSq: 'k*k' },
    constraints: ['p>k'],
  },
  choices: [
    { label: 'Divide both sides by ${{k}}$, then square.', correct: true },
    { label: 'Square both sides straight away.', error: 'orderOfOperations' },
    { label: 'Divide both sides by ${{kSq}}$, then square.', error: 'exponentError' },
    { label: 'Square both sides, then divide by ${{k}}$.', error: 'operationInverted' },
  ],
  reasoning: ['Squaring while the coefficient is still there squares the coefficient too.', 'Freeing the root first keeps the arithmetic straight.'],
  answerSummary: { headline: 'Isolate the radical before squaring.', text: 'Divide by ${{k}}$ first.' },
  hint: 'Ask what happens to ${{k}}$ when both sides are squared.',
  feedback: 'Squaring first leaves ${{kSq}}x$ on the left, which the later division does not clear.',
});

// ================================================================ A2.4G
// Extraneous roots.

mkc('A2.4G', 'which-candidate-survives-the-original', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra2',
  prompt: 'Squaring $\\sqrt{x + {{a}}} = x - {{b}}$ gives two candidates. Which one satisfies the original?',
  generator: {
    parameters: {
      b: { type: 'int', min: 3, max: 20 },
      d: { type: 'int', min: 2, max: 14 },
    },
    derived: {
      r: 'b+d',
      s: 'b+1-d',
      a: 'b*b-(b+d)*(b+1-d)',
      answer: 'b+d',
      // Answered the candidate the original rejects.
      d_usedGivenValue: 'b+1-d',
      // Answered the total of the two candidates.
      d_operationInverted: '2*b+1',
      // Answered the shift inside the root.
      d_partialTotal: 'b*b-(b+d)*(b+1-d)',
    },
    constraints: ['b+1-d<b', 'b*b-(b+d)*(b+1-d)>2', 'abs(b*b-(b+d)*(b+1-d)-(b+d))>3', 'd>1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['A square root is never negative, so $x - {{b}}$ has to be at least zero.', 'Only ${{answer}}$ clears that; ${{s}}$ makes the right side negative.'],
  answerSummary: { headline: 'Squaring can create a root the original rejects.', text: 'It is ${{answer}}$.' },
  hint: 'Check the sign of the right-hand side for each candidate.',
  feedback: 'Both candidates satisfy the squared equation; only one satisfies the original.',
});

mkc('A2.4G', 'which-length-the-equation-allows', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'verbal', courseId: 'algebra2',
  prompt: 'A length satisfies $\\sqrt{L + {{a}}} = L - {{b}}$, and squaring gives ${{r}}$ and ${{s}}$. Which is the length?',
  generator: {
    parameters: {
      b: { type: 'int', min: 3, max: 20 },
      d: { type: 'int', min: 2, max: 14 },
    },
    derived: {
      r: 'b+d',
      s: 'b+1-d',
      a: 'b*b-(b+d)*(b+1-d)',
    },
    constraints: ['b+1-d<b', 'b*b-(b+d)*(b+1-d)>2', 'd>1'],
  },
  choices: [
    { label: '${{r}}$, because ${{s}}$ would make the right side negative.', correct: true },
    { label: '${{s}}$, because it is the smaller of the two.', error: 'partialTotal' },
    { label: 'Both, because both satisfy the squared equation.', error: 'operationInverted' },
    { label: 'Neither, because a square root cannot equal a difference.', error: 'usedGivenValue' },
  ],
  reasoning: ['The left side is a square root, so it is never negative.', 'That rules out any candidate making $L - {{b}}$ negative.'],
  answerSummary: { headline: 'The original equation, not the squared one, decides.', text: 'It is ${{r}}$.' },
  hint: 'Put each candidate back into the equation as written.',
  feedback: 'Satisfying the squared equation is exactly what an extraneous root does.',
});

mkc('A2.4G', 'check-that-settles-a-candidate', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra2',
  prompt: 'After squaring $\\sqrt{x + {{a}}} = x - {{b}}$, which check settles whether a candidate is genuine?',
  generator: {
    parameters: {
      a: { type: 'int', min: 2, max: 60 },
      b: { type: 'int', min: 2, max: 20 },
    },
    constraints: ['a>1'],
  },
  choices: [
    { label: 'Substituting it into the original equation.', correct: true },
    { label: 'Substituting it into the squared equation.', error: 'partialTotal' },
    { label: 'Checking that it is positive.', error: 'usedGivenValue' },
    { label: 'Checking that it is the larger of the two candidates.', error: 'ratioReversed' },
  ],
  reasoning: ['Squaring can turn a false statement into a true one, so the squared form accepts too much.', 'Only the original equation can reject an extraneous candidate.'],
  answerSummary: { headline: 'Check against the equation you started with.', text: 'Substitute into the original.' },
  hint: 'Ask which equation the extra root satisfies.',
  feedback: 'Being positive is not enough; the right side has to be non-negative too.',
});

// ================================================================ A2.6B
// Cube roots.

mkc('A2.6B', 'solve-a-scaled-cube-root', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra2',
  prompt: 'Solve ${{k}}\\sqrt[3]{x + {{a}}} = {{p}}$.',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 9 },
      m: { type: 'int', min: 3, max: 8 },
      a: { type: 'int', min: 2, max: 520 },
    },
    derived: {
      p: 'k*m',
      answer: 'm*m*m-a',
      // Never took the shift off.
      d_forgotFinalStep: 'm*m*m',
      // Answered the shift that was given.
      d_usedGivenValue: 'a',
      // Squared instead of cubing.
      d_exponentError: 'm*m-a',
    },
    constraints: ['m*m*m-a>4', 'abs(2*a-m*m*m)>5', 'm*m-a!=m*m*m-a'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_exponentError}}'), error: 'exponentError' },
  ],
  reasoning: ['Dividing by ${{k}}$ leaves $\\sqrt[3]{x + {{a}}} = {{m}}$.', 'Cubing and subtracting ${{a}}$ gives $x = {{answer}}$.'],
  answerSummary: { headline: 'Free the cube root, cube, then undo the shift.', text: '$x = {{answer}}$.' },
  hint: 'A cube root is undone by cubing, not by squaring.',
  feedback: 'Cubing gives what is under the root, which still has ${{a}}$ added.',
});

mkc('A2.6B', 'extra-capacity-of-a-larger-cubical-tank', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra2',
  prompt: 'One cubical tank holds ${{v}}$ cubic metres and another has side ${{s2}}$ metres. How much more does the second hold?',
  generator: {
    parameters: {
      s: { type: 'int', min: 4, max: 12 },
      inc: { type: 'int', min: 1, max: 4 },
    },
    derived: {
      s2: 's+inc',
      v: 's*s*s',
      answer: 's2*s2*s2-s*s*s',
      // Added the two capacities instead of comparing them.
      d_operationInverted: 's2*s2*s2+s*s*s',
      // Compared the two the other way round.
      d_signError: 's*s*s-s2*s2*s2',
      // Answered the first tank's capacity.
      d_partialTotal: 's*s*s',
    },
    constraints: ['s2*s2*s2-s*s*s>9', 'abs(2*s*s*s-s2*s2*s2)>6'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['The first tank has side $\\sqrt[3]{{{v}}} = {{s}}$ metres.', 'The second holds ${{s2}}^{3}$, which is ${{answer}}$ more.'],
  answerSummary: { headline: 'A capacity gives the side through a cube root.', text: 'It holds ${{answer}}$ more.' },
  hint: 'Find the first tank\'s side before comparing.',
  feedback: 'The comparison runs from the larger tank down to the smaller one.',
});

mkc('A2.6B', 'claim-about-a-negative-cube-root', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra2',
  prompt: 'Solving $\\sqrt[3]{x} = -{{b}}$, which statement is wrong?',
  generator: {
    parameters: {
      b: { type: 'int', min: 2, max: 14 },
    },
    derived: { cube: 'b*b*b' },
    constraints: ['b>1'],
  },
  choices: [
    { label: 'There is no solution, because a cube root cannot be negative.', correct: true },
    { label: 'The solution is $-{{cube}}$.', error: 'partialTotal' },
    { label: 'Cubing both sides undoes the cube root.', error: 'usedGivenValue' },
    { label: 'No check for extraneous roots is needed here.', error: 'ratioReversed' },
  ],
  reasoning: ['Every real number has exactly one real cube root, negative ones included.', 'Cubing gives $x = -{{cube}}$, which satisfies the equation.'],
  answerSummary: { headline: 'Cube roots accept negatives; square roots do not.', text: 'There is a solution.' },
  hint: 'Cube $-{{b}}$ and see what comes out.',
  feedback: 'Cubing is a one-to-one operation, so it creates no extra roots.',
});

// ================================================================ A2.6E
// Absolute value equations.

mkc('A2.6E', 'gap-between-two-absolute-value-solutions', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra2',
  prompt: 'Solve ${{k}}\\left|x - {{p}}\\right| = {{r}}$. How far apart are the two solutions?',
  generator: {
    parameters: {
      k: { type: 'int', min: 3, max: 12 },
      d: { type: 'int', min: 2, max: 30 },
      p: { type: 'int', min: 2, max: 60 },
    },
    derived: {
      r: 'k*d',
      answer: '2*d',
      // Answered the number on the right of the equation.
      d_forgotFinalStep: 'r',
      // Answered the distance to one solution only.
      d_operationInverted: 'd',
      // Answered the centre of the two solutions.
      d_usedGivenValue: 'p',
    },
    constraints: ['abs(p-2*d)>4', '2*d>5'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Dividing by ${{k}}$ leaves $\\left|x - {{p}}\\right| = {{d}}$.', 'The two solutions sit ${{d}}$ either side of ${{p}}$, so they are ${{answer}}$ apart.'],
  answerSummary: { headline: 'Free the bars before splitting into two cases.', text: 'They are ${{answer}}$ apart.' },
  hint: 'The coefficient has to go before the bars are split.',
  feedback: 'The distance to one solution is half the gap between them.',
});

mkc('A2.6E', 'other-solution-of-an-absolute-value-equation', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra2',
  prompt: 'The equation $\\left|x - p\\right| = {{d}}$ has ${{high}}$ as one solution. What is the other?',
  generator: {
    parameters: {
      d: { type: 'int', min: 3, max: 40 },
      gap: { type: 'int', min: 4, max: 44 },
    },
    derived: {
      high: '2*d+gap',
      answer: 'gap',
      // Moved the same way instead of the opposite way.
      d_operationInverted: 'high+2*d',
      // Answered the distance itself.
      d_usedGivenValue: 'd',
      // Took the difference the other way round.
      d_signError: '2*d-high',
    },
    constraints: ['gap>3', 'abs(d-gap)>3'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['The two solutions sit ${{d}}$ either side of $p$, so they are $2 \\times {{d}}$ apart.', 'The other is ${{high}} - 2 \\times {{d}} = {{answer}}$.'],
  answerSummary: { headline: 'The two solutions straddle the centre by the same distance.', text: 'It is ${{answer}}$.' },
  hint: 'The known solution is ${{d}}$ above the centre.',
  feedback: 'The other solution lies on the far side of the centre, not beyond the one given.',
});

mkc('A2.6E', 'solutions-of-an-impossible-absolute-value', {
  difficultyBand: 4, dok: 3, taskType: 'interpretation', representation: 'verbal', courseId: 'algebra2',
  prompt: 'How many solutions does ${{k}}\\left|x - {{p}}\\right| + {{c}} = {{r}}$ have?',
  generator: {
    parameters: {
      k: { type: 'int', min: 2, max: 12 },
      p: { type: 'int', min: 2, max: 60 },
      c: { type: 'int', min: 30, max: 200 },
      gap: { type: 'int', min: 3, max: 40 },
    },
    derived: { r: 'c-gap' },
    constraints: ['c-gap>0', 'gap>2'],
  },
  choices: [
    { label: 'None.', correct: true },
    { label: 'Exactly one.', error: 'partialTotal' },
    { label: 'Exactly two.', error: 'operationInverted' },
    { label: 'Every value of $x$.', error: 'usedGivenValue' },
  ],
  reasoning: ['Isolating the bars gives ${{k}}\\left|x - {{p}}\\right| = {{r}} - {{c}}$, which is negative.', 'An absolute value is never negative, so nothing satisfies it.'],
  answerSummary: { headline: 'A negative right-hand side rules everything out.', text: 'There are none.' },
  hint: 'Isolate the bars before counting anything.',
  feedback: 'Two solutions would need a positive value on the right.',
});

// ================================================================ A2.6I
// Rational equations.

mkc('A2.6I', 'value-where-two-rational-sides-agree', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra2',
  prompt: 'What value of $x$ makes $\\frac{{{n}}}{x} + {{p}} = \\frac{{{m}}}{x} + {{q}}$ true?',
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 30 },
      gap: { type: 'int', min: 2, max: 14 },
      w: { type: 'int', min: 2, max: 20 },
      m: { type: 'int', min: 5, max: 200 },
    },
    derived: {
      q: 'p+gap',
      n: 'm+gap*w',
      answer: 'w',
      // Answered the gap between the two numerators.
      d_forgotFinalStep: 'gap*w',
      // Answered the gap between the two constants.
      d_usedGivenValue: 'gap',
      // Answered the constant on the left.
      d_ratioReversed: 'p',
    },
    constraints: ['abs(p-w)>3', 'abs(gap-w)>3', 'gap*w>7'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
  ],
  reasoning: ['Collecting gives $\\frac{{{n}} - {{m}}}{x} = {{q}} - {{p}}$.', 'That leaves $x = {{answer}}$.'],
  answerSummary: { headline: 'Gather the fractions and the constants on opposite sides.', text: '$x = {{answer}}$.' },
  hint: 'Both fractions share the same denominator.',
  feedback: 'The difference of the numerators still has to be divided by the difference of the constants.',
});

mkc('A2.6I', 'numerator-behind-a-known-solution', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'symbolic', courseId: 'algebra2',
  prompt: 'For which $n$ does $\\frac{n}{x} + {{p}} = {{q}}$ have the solution $x = {{v}}$?',
  generator: {
    parameters: {
      p: { type: 'int', min: 2, max: 24 },
      gap: { type: 'int', min: 2, max: 24 },
      v: { type: 'int', min: 2, max: 30 },
    },
    derived: {
      q: 'p+gap',
      answer: 'v*gap',
      // Added the two constants instead of comparing them.
      d_operationInverted: 'v*(2*p+gap)',
      // Answered the gap between the constants.
      d_usedGivenValue: 'gap',
      // Scaled by the wrong constant.
      d_partialTotal: 'p*v',
    },
    constraints: ['v*gap>7', 'abs(p-gap)>2', 'abs(p*v-v*gap)>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['At $x = {{v}}$ the fraction has to come to ${{q}} - {{p}} = {{gap}}$.', 'So $n = {{v}} \\times {{gap}} = {{answer}}$.'],
  answerSummary: { headline: 'The fraction carries whatever the constants leave over.', text: '$n = {{answer}}$.' },
  hint: 'Move the constant across before clearing the denominator.',
  feedback: 'The whole left constant does not scale the numerator; only the shortfall does.',
});

mkc('A2.6I', 'claim-about-clearing-a-denominator', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra2',
  prompt: 'For $\\frac{{{n}}}{x} + {{p}} = {{q}}$, which statement is wrong?',
  generator: {
    parameters: {
      n: { type: 'int', min: 10, max: 200 },
      p: { type: 'int', min: 2, max: 30 },
      q: { type: 'int', min: 32, max: 90 },
    },
    constraints: ['q>p'],
  },
  choices: [
    { label: 'Multiplying by $x$ gives ${{n}} + {{p}} = {{q}}x$.', correct: true },
    { label: 'Multiplying by $x$ gives ${{n}} + {{p}}x = {{q}}x$.', error: 'partialTotal' },
    { label: 'The value $x$ cannot be zero.', error: 'usedGivenValue' },
    { label: 'Subtracting ${{p}}$ first gives $\\frac{{{n}}}{x} = {{q}} - {{p}}$.', error: 'ratioReversed' },
  ],
  reasoning: ['Multiplying an equation by $x$ reaches every term, including the ${{p}}$.', 'Leaving ${{p}}$ unmultiplied breaks the equality.'],
  answerSummary: { headline: 'Clearing a denominator multiplies every term.', text: 'The ${{p}}$ must be multiplied too.' },
  hint: 'Apply the multiplication term by term.',
  feedback: 'Zero really is excluded, since it would divide by zero.',
});

// ================================================================ A2.6L
// Inverse variation.

mkc('A2.6L', 'fall-in-y-across-two-inputs', {
  difficultyBand: 4, dok: 2, taskType: 'procedural', representation: 'symbolic', courseId: 'algebra2',
  prompt: 'With $y$ varying inversely with $x$ and $y = {{y1}}$ at $x = {{x1}}$, how much does $y$ fall as $x$ goes from ${{x2}}$ to ${{x3}}$?',
  generator: {
    parameters: {
      u: { type: 'int', min: 2, max: 20 },
      x1: { type: 'int', min: 2, max: 12 },
      x2: { type: 'int', min: 2, max: 12 },
      x3: { type: 'int', min: 3, max: 20 },
    },
    derived: {
      k: 'u*x1*x2*x3',
      y1: 'u*x2*x3',
      answer: 'u*x1*x3-u*x1*x2',
      // Added the two values instead of comparing them.
      d_operationInverted: 'u*x1*x3+u*x1*x2',
      // Answered the value at the second input.
      d_partialTotal: 'u*x1*x2',
      // Compared the two the other way round.
      d_signError: 'u*x1*x2-u*x1*x3',
    },
    constraints: ['x3>x2', 'u*x1*x3-u*x1*x2>7', 'abs(2*u*x1*x2-u*x1*x3)>6'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['The constant is ${{x1}} \\times {{y1}} = {{k}}$.', 'So $y$ moves from $\\frac{{{k}}}{{{x2}}}$ to $\\frac{{{k}}}{{{x3}}}$, a fall of ${{answer}}$.'],
  answerSummary: { headline: 'Find the constant, then read $y$ at each input.', text: 'It falls by ${{answer}}$.' },
  hint: 'Under inverse variation the product $xy$ never changes.',
  feedback: 'Larger inputs give smaller outputs, so the fall runs that way.',
});

mkc('A2.6L', 'days-left-after-part-of-the-crew-goes', {
  difficultyBand: 5, dok: 3, taskType: 'application', representation: 'context', courseId: 'algebra2',
  prompt: 'A crew of ${{w1}}$ finishes a job in ${{d1}}$ days. After ${{a}}$ days ${{q}}$ workers leave, so how many more days does the job take?',
  generator: {
    parameters: {
      c: { type: 'int', min: 1, max: 4 },
      s: { type: 'int', min: 2, max: 5 },
      e: { type: 'int', min: 1, max: 5 },
      h: { type: 'int', min: 1, max: 3 },
      a: { type: 'int', min: 2, max: 11 },
    },
    derived: {
      w1: 'c*(s+e)',
      w2: 'c*s',
      q: 'c*e',
      d1: 'a+s*h',
      work: 'c*(s+e)*(a+s*h)',
      left: 'c*(s+e)*s*h',
      answer: '(s+e)*h',
      // Read the days still on the schedule without rescaling for the smaller crew.
      d_forgotFinalStep: 's*h',
      // Answered the length of the original schedule.
      d_usedGivenValue: 'a+s*h',
      // Gave the job's whole run rather than the days still to come.
      d_partialTotal: 'a+(s+e)*h',
    },
    constraints: ['c*e>1', '(s+e)*h>3', 'abs(a-e*h)>1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['The job is ${{w1}} \\times {{d1}} = {{work}}$ worker-days, of which ${{left}}$ are still undone.', 'Workers and days vary inversely, so ${{left}}$ worker-days shared by ${{w2}}$ workers take ${{answer}}$ days.'],
  answerSummary: { headline: 'Price the job in worker-days, then divide by the crew that is left.', text: 'It takes ${{answer}}$ more days.' },
  hint: 'Work already finished is gone; only the part still undone gets shared out again.',
  feedback: 'The schedule the job started on no longer applies once the crew shrinks.',
});

mkc('A2.6L', 'claim-about-inverse-variation', {
  difficultyBand: 4, dok: 3, taskType: 'conceptual', representation: 'verbal', courseId: 'algebra2',
  prompt: 'Under inverse variation with constant ${{k}}$, which statement is wrong?',
  generator: {
    parameters: { k: { type: 'int', min: 6, max: 200 } },
    constraints: ['k>5'],
  },
  choices: [
    { label: 'Doubling $x$ doubles $y$.', correct: true },
    { label: 'Doubling $x$ halves $y$.', error: 'partialTotal' },
    { label: 'The product of $x$ and $y$ is always ${{k}}$.', error: 'usedGivenValue' },
    { label: 'The value $y$ is never zero.', error: 'ratioReversed' },
  ],
  reasoning: ['Inverse variation keeps $xy$ fixed at ${{k}}$.', 'Doubling $x$ therefore halves $y$ rather than doubling it.'],
  answerSummary: { headline: 'Inverse means the product stays put, not the ratio.', text: 'Doubling $x$ halves $y$.' },
  hint: 'Write $y$ in terms of $x$ and the constant.',
  feedback: 'A zero output would make the product zero, not ${{k}}$.',
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
