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
