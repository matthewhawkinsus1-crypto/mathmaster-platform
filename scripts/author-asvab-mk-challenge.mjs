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
      k: { type: 'int', min: 1, max: 6 },
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
