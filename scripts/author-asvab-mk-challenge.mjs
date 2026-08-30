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
