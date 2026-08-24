#!/usr/bin/env node
// ASVAB Arithmetic Reasoning bank.
//
// Arithmetic Reasoning measures "ability to solve arithmetic word problems".
// Authentic AR prose is short, concrete and practical, and it does not tell the
// student which operation to run — deciding that IS the construct. So:
//
//   * prompts stay under the register limits in functions/shared/asvabFidelity.mjs
//   * no prompt names a formula, a property or an operation
//   * contexts are ordinary practical situations, drawn per instance, and are
//     deliberately not all military
//   * every number is designed to be worked by hand, because the ASVAB permits
//     no calculator
//   * each of the five families per standard is a different task STRUCTURE, not
//     the same computation wearing a different noun
//
// Every distractor is an expression over the same drawn parameters that
// computes what a student gets after one named mistake. Run
// `node scripts/audit-asvab-fidelity.mjs` to check that claim.

import { writeFileSync } from 'node:fs';
import { AR, asvabItem, assertStandardVariety, contextParam, money, plain } from './lib/asvabAuthoring.mjs';

const ITEMS = [];
const ar = (code, slug, spec) => {
  ITEMS.push(asvabItem({ code, slug, domain: AR, courseId: spec.courseId || 'grade6', ...spec }));
};

// Context pools. The mathematics never depends on which word is drawn; these
// exist so a student does not meet the same sentence five times.
const VEHICLES = contextParam(['delivery van', 'service truck', 'shuttle bus', 'work van', 'pickup']);
const WORKERS = contextParam(['crew', 'shift', 'team', 'work detail']);
const GOODS = contextParam(['filters', 'bolts', 'cartons', 'panels', 'crates', 'brackets']);
const SHOPS = contextParam(['hardware store', 'supply depot', 'warehouse outlet', 'parts counter']);
const MACHINES = contextParam(['press', 'labeler', 'sorter', 'stamping machine', 'conveyor']);

// ================================================================ 6.4B
// Prediction and comparison with ratios and rates.
//
// Distractor discipline used throughout this file: the three wrong answers are
// each a real quantity from the same situation — the intermediate value, the
// other share, the reversed ratio — rather than the key nudged up or down. That
// is how ASVAB distractors actually behave, and it has a second benefit the
// audit measures: because those quantities move independently of the key as the
// parameters are drawn, the key does not sit at a fixed rank among the four,
// so it cannot be found by magnitude alone.

ar('6.4B', 'scale-prediction', {
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A {{vehicle}} uses {{g1}} gallons of fuel to travel {{m1}} miles. At that rate, how many gallons are needed to travel {{m2}} miles?',
  generator: {
    parameters: {
      vehicle: VEHICLES,
      mpg: { type: 'int', min: 8, max: 20, step: 2 },
      g1: { type: 'int', min: 2, max: 16 },
      g2: { type: 'int', min: 2, max: 16 },
    },
    derived: {
      m1: 'g1*mpg',
      m2: 'g2*mpg',
      answer: 'g2',
      d_ratioReversed: 'round(g1*g1/g2)',
      d_usedGivenValue: 'g1',
      d_operationInverted: 'mpg',
    },
    constraints: ['g1!=g2', 'answer!=d_ratioReversed', 'answer!=d_usedGivenValue', 'answer!=d_operationInverted', 'd_ratioReversed!=d_usedGivenValue', 'd_ratioReversed!=d_operationInverted'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['{{m1}} miles on {{g1}} gallons is {{mpg}} miles per gallon.', '{{m2}} divided by {{mpg}} is {{answer}}.'],
  answerSummary: { headline: 'Find what one gallon covers, then share the new distance into it.', text: 'It takes ${{answer}}$ gallons.' },
  hint: 'Work out how far the {{vehicle}} goes on a single gallon first.',
  feedback: 'Check which distance goes with which amount of fuel.',
});

ar('6.4B', 'better-buy-then-scale', {
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'verbal',
  prompt: 'A {{shop}} sells {{item}} at {{n1}} for $\\${{p1}}$ or {{n2}} for $\\${{p2}}$. At the lower price per item, what do {{need}} {{item}} cost?',
  generator: {
    parameters: {
      shop: SHOPS, item: GOODS,
      n1: { type: 'int', min: 3, max: 8 },
      n2: { type: 'int', min: 3, max: 8 },
      low: { type: 'int', min: 2, max: 7 },
      gap: { type: 'int', min: 1, max: 5 },
      need: { type: 'int', min: 3, max: 11 },
    },
    derived: {
      high: 'low+gap',
      p1: 'n1*high',
      p2: 'n2*low',
      answer: 'need*low',
      d_usedGivenValue: 'need*high',
      d_partialTotal: 'p2',
      d_forgotFinalStep: 'p1',
    },
    constraints: ['n1!=n2', 'answer!=d_usedGivenValue', 'answer!=d_partialTotal', 'answer!=d_forgotFinalStep', 'd_partialTotal!=d_forgotFinalStep', 'd_usedGivenValue!=d_partialTotal', 'd_usedGivenValue!=d_forgotFinalStep'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['{{n1}} for $\\${{p1}}$ is $\\${{high}}$ each; {{n2}} for $\\${{p2}}$ is $\\${{low}}$ each.', '{{need}} at $\\${{low}}$ each is $\\${{answer}}$.'],
  answerSummary: { headline: 'Compare per item, then buy at that price.', text: '{{need}} {{item}} cost $\\${{answer}}$.' },
  hint: 'Find what one item costs under each offer before deciding.',
  feedback: 'Decide which offer is cheaper per item, then use that price.',
});

ar('6.4B', 'part-from-ratio-and-total', {
  difficultyBand: 3, dok: 2, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'A {{crew}} of {{total}} people is split between loading and driving in a ratio of {{m}} to {{n}}. How many are loading?',
  generator: {
    parameters: {
      crew: WORKERS,
      m: { type: 'int', min: 2, max: 8 },
      n: { type: 'int', min: 2, max: 8 },
      unitSize: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      total: '(m+n)*unitSize',
      answer: 'm*unitSize',
      d_ratioReversed: 'n*unitSize',
      d_partialTotal: 'round(total/2)',
      d_operationInverted: 'm*n',
    },
    constraints: ['m!=n', 'answer!=d_ratioReversed', 'answer!=d_partialTotal', 'answer!=d_operationInverted', 'd_ratioReversed!=d_partialTotal', 'd_ratioReversed!=d_operationInverted', 'd_partialTotal!=d_operationInverted'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['The ratio splits the {{crew}} into {{m}}+{{n}} equal shares.', '{{total}} divided by {{m}}+{{n}} gives {{unitSize}} per share.', 'Loading takes {{m}} shares.'],
  answerSummary: { headline: 'A ratio splits a total into equal shares.', text: '${{answer}}$ people are loading.' },
  hint: 'Work out how many equal shares the total is divided into.',
  feedback: 'The two numbers in the ratio count shares, not people.',
});

ar('6.4B', 'shortfall-after-run', {
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'context',
  prompt: 'An order calls for {{needed}} {{item}}. A {{machine}} makes {{rate}} an hour and runs {{hours}} hours. How many {{item}} are still owed?',
  generator: {
    parameters: {
      machine: MACHINES, item: GOODS,
      rate: { type: 'int', min: 5, max: 50, step: 5 },
      hours: { type: 'int', min: 2, max: 7 },
      short: { type: 'int', min: 10, max: 70, step: 10 },
    },
    derived: {
      made: 'rate*hours',
      needed: 'rate*hours+short',
      answer: 'short',
      d_forgotFinalStep: 'made',
      d_offByOneStep: 'abs(short-rate)',
      d_operationInverted: 'round(needed/hours)',
    },
    constraints: ['answer!=d_forgotFinalStep', 'answer!=d_offByOneStep', 'answer!=d_operationInverted', 'd_offByOneStep>0', 'd_forgotFinalStep!=d_offByOneStep', 'd_forgotFinalStep!=d_operationInverted', 'd_offByOneStep!=d_operationInverted'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['In {{hours}} hours the {{machine}} makes {{rate}} times {{hours}}, or {{made}}.', '{{needed}} minus {{made}} is {{answer}}.'],
  answerSummary: { headline: 'Produce first, then compare against the order.', text: '${{answer}}$ {{item}} are still owed.' },
  hint: 'Work out how many were made before looking at what is left.',
  feedback: 'The question asks what remains, not how many were produced.',
});

ar('6.4B', 'two-rate-shift-total', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'table',
  prompt: 'A {{machine}} runs two stretches at the rates shown. How many {{item}} does it make in all?',
  stimulus: {
    kind: 'table',
    title: 'Production log',
    table: {
      headers: ['stretch', 'per hour', 'hours'],
      rows: [['first', '{{r1}}', '{{h1}}'], ['second', '{{r2}}', '{{h2}}']],
    },
  },
  generator: {
    parameters: {
      machine: MACHINES, item: GOODS,
      r1: { type: 'int', min: 5, max: 40, step: 5 },
      r2: { type: 'int', min: 5, max: 40, step: 5 },
      h1: { type: 'int', min: 2, max: 9 },
      h2: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      answer: 'r1*h1+r2*h2',
      d_operationInverted: 'r1*h2+r2*h1',
      d_partialTotal: '(r1+r2)*h1',
      d_forgotFinalStep: 'r1*h1',
    },
    constraints: ['r1!=r2', 'h1!=h2', 'answer!=d_operationInverted', 'answer!=d_partialTotal', 'answer!=d_forgotFinalStep', 'd_operationInverted!=d_partialTotal', 'd_operationInverted!=d_forgotFinalStep', 'd_partialTotal!=d_forgotFinalStep'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['The first stretch makes {{r1}} times {{h1}}.', 'The second makes {{r2}} times {{h2}}.', 'Together that is {{answer}}.'],
  answerSummary: { headline: 'Each rate only applies to its own stretch of time.', text: 'It makes ${{answer}}$ {{item}} in all.' },
  hint: 'Each stretch of time has its own hourly amount. Handle them one at a time.',
  feedback: 'Pair each hourly amount with the hours it actually ran.',
});

// ---------------------------------------------------------------- emit
const seen = new Set();
for (const item of ITEMS) {
  if (seen.has(item.id)) throw new Error(`Duplicate ASVAB id: ${item.id}`);
  seen.add(item.id);
}
assertStandardVariety(ITEMS);
writeFileSync(new URL('../drafts/asvab-ar.json', import.meta.url), `${JSON.stringify({ documents: ITEMS }, null, 1)}\n`);
console.log(`Arithmetic Reasoning: ${ITEMS.length} families across ${new Set(ITEMS.map((i) => i.assessedConstruct)).size} standards.`);
