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
      q: { type: 'int', min: 3, max: 30 },
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
