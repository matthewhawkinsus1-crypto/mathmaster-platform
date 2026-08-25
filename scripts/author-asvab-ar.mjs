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
      d_ratioReversed: 'round(m2/m1)',
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

// ================================================================ 6.4C
// Ratios as multiplicative comparisons of two quantities of the same kind.

ar('6.4C', 'times-as-many', {
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A {{shop}} has {{small}} {{item}} on the floor and {{big}} in the back. How many times as many are in the back?',
  generator: {
    parameters: {
      shop: SHOPS, item: GOODS,
      small: { type: 'int', min: 2, max: 9 },
      k: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      big: 'small*k',
      answer: 'k',
      d_operationInverted: 'big-small',
      d_usedGivenValue: 'small',
      d_offByOneStep: 'k-1',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
  ],
  reasoning: ['{{big}} divided by {{small}} is {{answer}}.', 'Comparing two counts of the same thing is a division, not a subtraction.'],
  answerSummary: { headline: 'How many times as many is a division.', text: 'There are ${{answer}}$ times as many in the back.' },
  hint: 'Ask how many floor-sized groups fit into the back stock.',
  feedback: 'How many times as many is not the same as how many more.',
});

ar('6.4C', 'ratio-in-lowest-terms', {
  difficultyBand: 2, dok: 1, taskType: 'procedural', representation: 'symbolic',
  prompt: 'A batch has {{redCount}} {{first}} and {{blueCount}} {{second}}. In lowest terms, what is the ratio of {{first}} to {{second}}?',
  generator: {
    parameters: {
      first: contextParam(['bolts', 'washers', 'clamps', 'rivets']),
      second: contextParam(['nuts', 'screws', 'pins', 'anchors']),
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 9 },
      scale: { type: 'int', min: 2, max: 8 },
    },
    derived: {
      redCount: 'a*scale',
      blueCount: 'b*scale',
      sumA: 'a+b',
    },
    constraints: ['gcd(a,b)==1', 'a!=b'],
  },
  choices: [
    { label: plain('{{a}}:{{b}}'), correct: true },
    { label: plain('{{b}}:{{a}}'), error: 'ratioReversed' },
    { label: plain('{{redCount}}:{{blueCount}}'), error: 'forgotFinalStep' },
    { label: plain('{{a}}:{{sumA}}'), error: 'partialTotal' },
  ],
  reasoning: ['{{redCount}} and {{blueCount}} share a factor of {{scale}}.', 'Dividing both by {{scale}} leaves {{a}} to {{b}}.'],
  answerSummary: { headline: 'Both counts divide by their common factor.', text: 'The ratio is ${{a}}:{{b}}$.' },
  hint: 'Look for a number that divides both counts.',
  feedback: 'The order of the two numbers follows the order named in the question.',
});

ar('6.4C', 'other-count-from-ratio', {
  difficultyBand: 3, dok: 2, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'In a {{crew}} the ratio of {{first}} to {{second}} is {{a}} to {{b}}. There are {{firstCount}} {{first}}. How many {{second}} are there?',
  generator: {
    parameters: {
      crew: WORKERS,
      first: contextParam(['loaders', 'drivers', 'welders', 'inspectors']),
      second: contextParam(['helpers', 'packers', 'fitters', 'checkers']),
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 9 },
      scale: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      firstCount: 'a*scale',
      answer: 'b*scale',
      d_ratioReversed: 'round(a*a*scale/b)',
      d_operationInverted: 'a*b',
      d_offByOneStep: 'b*(scale-1)',
    },
    constraints: ['a!=b', 'd_offByOneStep>0'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
  ],
  reasoning: ['{{firstCount}} is {{scale}} groups of {{a}}.', 'The same {{scale}} groups of {{b}} gives {{answer}}.'],
  answerSummary: { headline: 'Both parts of a ratio scale by the same factor.', text: 'There are ${{answer}}$ {{second}}.' },
  hint: 'Work out how many times the ratio has been scaled up.',
  feedback: 'Both sides of the ratio grow by the same factor, not by the same amount.',
});

ar('6.4C', 'part-to-whole-fraction', {
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'verbal',
  prompt: 'A shipment holds {{first}} and {{second}} in a ratio of {{a}} to {{b}}. What fraction of the shipment is {{first}}?',
  generator: {
    parameters: {
      first: contextParam(['cartons', 'crates', 'drums', 'pallets']),
      second: contextParam(['sacks', 'bins', 'barrels', 'totes']),
      a: { type: 'int', min: 2, max: 9 },
      b: { type: 'int', min: 2, max: 9 },
    },
    derived: { whole: 'a+b' },
    constraints: ['gcd(a,b)==1', 'a!=b'],
  },
  choices: [
    { label: plain('\\frac{{{a}}}{{{whole}}}'), correct: true },
    { label: plain('\\frac{{{a}}}{{{b}}}'), error: 'operationInverted' },
    { label: plain('\\frac{{{b}}}{{{whole}}}'), error: 'ratioReversed' },
    { label: plain('\\frac{1}{{{whole}}}'), error: 'partialTotal' },
  ],
  reasoning: ['The shipment is {{a}}+{{b}} equal parts, or {{whole}} in all.', '{{first}} account for {{a}} of those {{whole}} parts.'],
  answerSummary: { headline: 'A part-to-part ratio becomes a part-to-whole fraction by adding the parts.', text: '{{first}} are $\\frac{{{a}}}{{{whole}}}$ of the shipment.' },
  hint: 'Count how many equal parts the whole shipment contains.',
  feedback: 'The bottom of the fraction is the whole, not the other part.',
});

ar('6.4C', 'which-count-keeps-ratio', {
  difficultyBand: 3, dok: 3, taskType: 'representationTranslation', representation: 'table',
  prompt: 'The mix below must stay at a ratio of {{a}} to {{b}}. How many {{second}} go with {{firstCount}} {{first}}?',
  stimulus: {
    kind: 'table',
    title: 'Mix record',
    table: { headers: ['{{first}}', '{{second}}'], rows: [['{{a}}', '{{b}}'], ['{{firstCount}}', '?']] },
  },
  generator: {
    parameters: {
      first: contextParam(['parts sand', 'parts base', 'parts resin', 'units concentrate']),
      second: contextParam(['parts cement', 'parts filler', 'parts hardener', 'units water']),
      a: { type: 'int', min: 2, max: 7 },
      b: { type: 'int', min: 2, max: 7 },
      scale: { type: 'int', min: 3, max: 9 },
    },
    derived: {
      firstCount: 'a*scale',
      answer: 'b*scale',
      d_operationInverted: 'a*b',
      d_ratioReversed: 'round(a*a*scale/b)',
      d_offByOneStep: 'b+a*scale-a',
    },
    constraints: ['a!=b'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
  ],
  reasoning: ['The first row was multiplied by {{scale}} to reach {{firstCount}}.', '{{b}} times {{scale}} is {{answer}}.'],
  answerSummary: { headline: 'An equivalent ratio multiplies both entries by the same number.', text: 'It takes ${{answer}}$ {{second}}.' },
  hint: 'Compare the two rows in the first column.',
  feedback: 'Adding the same amount to both entries changes the ratio; multiplying keeps it.',
});

// ================================================================ 6.4D
// Rates as a comparison by division of two quantities of different kinds.

ar('6.4D', 'fuel-economy', {
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'context',
  prompt: 'A {{vehicle}} covers {{miles}} miles on {{gal}} gallons. How many miles per gallon is that?',
  generator: {
    parameters: {
      vehicle: VEHICLES,
      mpg: { type: 'int', min: 5, max: 25 },
      gal: { type: 'int', min: 5, max: 25 },
    },
    derived: {
      miles: 'mpg*gal',
      answer: 'mpg',
      d_operationInverted: 'gal',
      d_partialTotal: 'miles-gal',
      d_offByOneStep: 'round(miles/(gal+3))',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
  ],
  reasoning: ['Miles per gallon shares the miles among the gallons.', '{{miles}} divided by {{gal}} is {{answer}}.'],
  answerSummary: { headline: 'A rate divides one quantity by the other.', text: 'It gets ${{answer}}$ miles per gallon.' },
  hint: 'Decide which quantity is being shared out and which does the sharing.',
  feedback: 'Miles per gallon puts miles on top.',
});

ar('6.4D', 'cost-per-unit-with-shipping', {
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A case of {{count}} {{item}} costs $\\${{total}}$, and shipping adds $\\${{ship}}$. What does one {{item}} cost delivered?',
  generator: {
    parameters: {
      item: GOODS,
      each: { type: 'int', min: 2, max: 18 },
      perItemShip: { type: 'int', min: 1, max: 6 },
      count: { type: 'int', min: 4, max: 24 },
    },
    derived: {
      total: 'each*count',
      ship: 'perItemShip*count',
      answer: 'each+perItemShip',
      d_forgotFinalStep: 'each',
      d_operationInverted: 'count',
      d_partialTotal: 'total+ship',
    },
    constraints: [],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['The case works out to $\\${{each}}$ an item.', 'Shipping adds $\\${{ship}}$ over {{count}} items, or $\\${{perItemShip}}$ each.', 'Delivered, one costs $\\${{answer}}$.'],
  answerSummary: { headline: 'Both charges have to come down to a single item before they add.', text: 'One costs $\\${{answer}}$ delivered.' },
  hint: 'Shipping covers the whole case, not one item.',
  feedback: 'Bring the shipping down to a per-item amount before adding it on.',
});

ar('6.4D', 'faster-of-two-rates', {
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'Two {{machine}}s ran the outputs shown. How many more {{item}} an hour does the faster one make?',
  stimulus: {
    kind: 'table',
    title: 'Output log',
    table: { headers: ['machine', '{{item}}', 'hours'], rows: [['A', '{{outA}}', '{{hA}}'], ['B', '{{outB}}', '{{hB}}']] },
  },
  generator: {
    parameters: {
      machine: MACHINES, item: GOODS,
      slow: { type: 'int', min: 4, max: 20 },
      gap: { type: 'int', min: 2, max: 18 },
      hA: { type: 'int', min: 2, max: 9 },
      hB: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      fast: 'slow+gap',
      outA: 'fast*hA',
      outB: 'slow*hB',
      answer: 'gap',
      d_partialTotal: 'abs(outA-outB)',
      d_operationInverted: 'slow',
      d_offByOneStep: 'abs(hA-hB)',
    },
    constraints: ['hA!=hB'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
  ],
  reasoning: ['Machine A runs at {{outA}} over {{hA}} hours, or {{fast}} an hour.', 'Machine B runs at {{slow}} an hour.', 'The gap is {{answer}}.'],
  answerSummary: { headline: 'Two totals over different hours only compare per hour.', text: 'The faster one makes ${{answer}}$ more an hour.' },
  hint: 'Neither total means anything until both are per hour.',
  feedback: 'Compare the hourly rates, not the totals.',
});

ar('6.4D', 'total-from-rate', {
  difficultyBand: 2, dok: 2, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'A {{machine}} fills {{rate}} {{item}} a minute. How many does it fill in {{mins}} minutes?',
  generator: {
    parameters: {
      machine: MACHINES, item: GOODS,
      rate: { type: 'int', min: 3, max: 30 },
      mins: { type: 'int', min: 3, max: 30 },
    },
    derived: {
      answer: 'rate*mins',
      // A product is the hardest shape to build distractors for: adding
      // instead of multiplying, using a given value and stopping a step early
      // all land BELOW the key, which leaves it the largest of the four every
      // time. So one error runs a minute long, and one squares the time.
      d_operationInverted: 'mins*mins',
      d_offByOneStep: 'rate*(mins-1)',
      d_arithmeticSlip: 'rate*(mins+1)',
    },
    constraints: ['rate!=mins'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['Each minute accounts for {{rate}} {{item}}.', '{{mins}} minutes gives {{rate}} times {{mins}}.'],
  answerSummary: { headline: 'A rate multiplied by the time gives the total.', text: 'It fills ${{answer}}$ {{item}}.' },
  hint: 'One minute is worth the rate. Count the minutes.',
  feedback: 'A per-minute amount multiplies by the minutes; it does not add to them.',
});

ar('6.4D', 'per-item-from-per-dozen', {
  difficultyBand: 3, dok: 2, taskType: 'representationTranslation', representation: 'verbal',
  prompt: '{{item}} sell at $\\${{perDozen}}$ a dozen. At that rate, what do {{want}} {{item}} cost?',
  generator: {
    parameters: {
      item: GOODS,
      each: { type: 'int', min: 2, max: 15 },
      want: { type: 'int', min: 2, max: 24 },
    },
    derived: {
      perDozen: 'each*12',
      answer: 'each*want',
      d_forgotFinalStep: 'perDozen',
      d_operationInverted: 'each+want',
      d_unitConversion: 'perDozen*want',
    },
    constraints: [],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: money('{{d_unitConversion}}'), error: 'unitConversion' },
  ],
  reasoning: ['A dozen is 12, so one costs $\\${{perDozen}}$ over 12, or $\\${{each}}$.', '{{want}} of them cost $\\${{answer}}$.'],
  answerSummary: { headline: 'Come down to one before going up to the amount asked.', text: '{{want}} cost $\\${{answer}}$.' },
  hint: 'Work out what a single one costs first.',
  feedback: 'The quoted price covers twelve, not one.',
});

// ================================================================ 6.5A
// Ratios and rates through scale factors, tables and proportions.

ar('6.5A', 'scale-drawing-length', {
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'On a plan, {{inches}} inch stands for {{feet}} feet. A wall drawn {{drawn}} inches long is how many feet long?',
  generator: {
    parameters: {
      inches: { type: 'choice', values: [1] },
      feet: { type: 'int', min: 2, max: 16 },
      drawn: { type: 'int', min: 2, max: 16 },
    },
    derived: {
      answer: 'feet*drawn',
      d_operationInverted: 'drawn*drawn',
      d_offByOneStep: 'feet*(drawn-1)',
      d_arithmeticSlip: 'feet*(drawn+1)',
    },
    constraints: ['feet!=drawn', 'd_offByOneStep>0'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['Every drawn inch is {{feet}} real feet.', '{{drawn}} inches is {{drawn}} times {{feet}}.'],
  answerSummary: { headline: 'A scale converts each drawn unit into real units.', text: 'The wall is ${{answer}}$ feet long.' },
  hint: 'Decide what one drawn inch is worth in real life.',
  feedback: 'Each inch on the plan carries the same number of real feet.',
});

ar('6.5A', 'model-to-real-reverse', {
  difficultyBand: 3, dok: 2, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'A model is built at {{scale}} to 1. The real {{part}} is {{real}} centimetres. How many centimetres is it on the model?',
  generator: {
    parameters: {
      part: contextParam(['axle', 'boom', 'mast', 'strut', 'beam']),
      scale: { type: 'int', min: 3, max: 24 },
      modelLen: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      real: 'scale*modelLen',
      answer: 'modelLen',
      d_operationInverted: 'scale',
      d_forgotFinalStep: 'real',
      d_offByOneStep: 'round(real/(scale+1))',
    },
    constraints: ['scale!=modelLen'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
  ],
  reasoning: ['The real {{part}} is {{scale}} times the model.', '{{real}} divided by {{scale}} is {{answer}}.'],
  answerSummary: { headline: 'Going from real to model divides by the scale.', text: 'It is ${{answer}}$ centimetres on the model.' },
  hint: 'The model is the smaller of the two. Which operation makes a number smaller?',
  feedback: 'Scaling up and scaling down are opposite operations.',
});

ar('6.5A', 'proportion-missing-entry', {
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'table',
  prompt: 'The table keeps a constant rate. What belongs in the empty cell?',
  stimulus: {
    kind: 'table',
    title: 'Rate table',
    table: { headers: ['{{unitA}}', '{{unitB}}'], rows: [['{{a1}}', '{{b1}}'], ['{{a2}}', '?']] },
  },
  generator: {
    parameters: {
      unitA: contextParam(['hours', 'cases', 'trips', 'loads']),
      unitB: contextParam(['units', 'pounds', 'miles', 'dollars']),
      k: { type: 'int', min: 2, max: 15 },
      a1: { type: 'int', min: 2, max: 12 },
      a2: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      b1: 'a1*k',
      answer: 'a2*k',
      d_usedGivenValue: 'b1',
      d_offByOneStep: 'k*(a2-1)',
      d_arithmeticSlip: 'k*(a2+1)',
    },
    constraints: ['a1!=a2'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['The first row pairs {{a1}} with {{b1}}, so each {{unitA}} is worth {{k}}.', '{{a2}} times {{k}} is {{answer}}.'],
  answerSummary: { headline: 'A constant rate multiplies, row by row.', text: 'The cell holds ${{answer}}$.' },
  hint: 'Work out what one unit in the left column is worth.',
  feedback: 'The rows are linked by multiplying, not by adding the same amount.',
});

ar('6.5A', 'recipe-scale-up', {
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'verbal',
  prompt: 'A mix uses {{partA}} parts {{matA}} to {{partB}} parts {{matB}}. To use {{useA}} pounds of {{matA}}, how many pounds of {{matB}} are needed?',
  generator: {
    parameters: {
      matA: contextParam(['sand', 'gravel', 'base', 'aggregate']),
      matB: contextParam(['cement', 'binder', 'filler', 'lime']),
      partA: { type: 'int', min: 2, max: 9 },
      partB: { type: 'int', min: 2, max: 9 },
      scale: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      useA: 'partA*scale',
      answer: 'partB*scale',
      d_ratioReversed: 'round(partA*partA*scale/partB)',
      d_offByOneStep: 'partB*(scale-1)',
      d_arithmeticSlip: 'partB*(scale+1)',
    },
    constraints: ['partA!=partB', 'd_offByOneStep>0'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['{{useA}} pounds is {{scale}} batches of {{partA}} parts.', '{{scale}} batches need {{partB}} times {{scale}} pounds of {{matB}}.'],
  answerSummary: { headline: 'Both ingredients scale by the same number of batches.', text: 'It needs ${{answer}}$ pounds of {{matB}}.' },
  hint: 'Count how many whole batches the given amount makes.',
  feedback: 'Both parts of the mix grow by the same factor.',
});

ar('6.5A', 'unit-rate-then-budget', {
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'context',
  prompt: '{{count}} {{item}} cost $\\${{total}}$. How many {{item}} can be bought with $\\${{budget}}$?',
  generator: {
    parameters: {
      item: GOODS,
      each: { type: 'int', min: 2, max: 20 },
      count: { type: 'int', min: 3, max: 24 },
      buy: { type: 'int', min: 3, max: 24 },
    },
    derived: {
      total: 'each*count',
      budget: 'each*buy',
      answer: 'buy',
      d_operationInverted: 'each',
      d_usedGivenValue: 'count',
      d_partialTotal: 'round(budget/count)',
    },
    constraints: ['buy!=count'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['{{count}} for $\\${{total}}$ is $\\${{each}}$ each.', '$\\${{budget}}$ divided by $\\${{each}}$ is {{answer}}.'],
  answerSummary: { headline: 'Get the price of one, then see how many the budget covers.', text: 'It buys ${{answer}}$ {{item}}.' },
  hint: 'A budget question needs the price of a single item first.',
  feedback: 'Divide the budget by the price of one, not by the number in the first offer.',
});

// ================================================================ 6.4E
// Ratios and percents as fractions, decimals and concrete models.

ar('6.4E', 'percent-to-decimal', {
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'symbolic',
  prompt: 'A {{shop}} enters a {{p}}% fee into a register that takes decimals. Which decimal does it enter?',
  generator: {
    parameters: { shop: SHOPS, p: { type: 'int', min: 4, max: 96 } },
    derived: {
      answer: 'p/100',
      d_unitConversion: 'p/10',
      d_convertedWrongWay: 'p/1000',
      d_wrongPercentBase: '(100-p)/100',
    },
    constraints: ['p!=50'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_unitConversion}}'), error: 'unitConversion' },
    { label: plain('{{d_convertedWrongWay}}'), error: 'convertedWrongWay' },
    { label: plain('{{d_wrongPercentBase}}'), error: 'wrongPercentBase' },
  ],
  reasoning: ['A percent counts hundredths.', '{{p}} hundredths is {{answer}}.'],
  answerSummary: { headline: 'Percent means per hundred.', text: '{{p}}% is ${{answer}}$.' },
  hint: 'How many hundredths does the percent name?',
  feedback: 'Moving the point one place gives tenths, not hundredths.',
});

ar('6.4E', 'shaded-grid-percent', {
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'table',
  prompt: 'A 10 by 10 grid has {{shaded}} squares shaded. What percent of the grid is shaded?',
  stimulus: {
    kind: 'expressions',
    title: 'Grid record',
    note: '{{shaded}} of the 100 squares are shaded and {{unshaded}} are blank.',
  },
  generator: {
    parameters: { shaded: { type: 'int', min: 4, max: 96 } },
    derived: {
      unshaded: '100-shaded',
      answer: 'shaded',
      d_wrongPercentBase: 'unshaded',
      d_unitConversion: 'shaded*10',
      d_convertedWrongWay: 'round(shaded/10)',
    },
    constraints: ['shaded!=50'],
  },
  choices: [
    { label: plain('{{answer}}\\%'), correct: true },
    { label: plain('{{d_wrongPercentBase}}\\%'), error: 'wrongPercentBase' },
    { label: plain('{{d_unitConversion}}\\%'), error: 'unitConversion' },
    { label: plain('{{d_convertedWrongWay}}\\%'), error: 'convertedWrongWay' },
  ],
  reasoning: ['The grid holds 100 squares, so each square is one percent.', '{{shaded}} squares shaded is {{answer}}%.'],
  answerSummary: { headline: 'A hundred-square grid reads straight off as a percent.', text: '${{answer}}\\%$ is shaded.' },
  hint: 'Count how many squares the whole grid holds.',
  feedback: 'The question asks about the shaded part, not the blank part.',
});

ar('6.4E', 'fraction-to-percent', {
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'verbal',
  prompt: '{{num}} out of every {{den}} {{item}} pass inspection. What percent pass?',
  generator: {
    parameters: {
      item: GOODS,
      den: { type: 'choice', values: [4, 5, 8, 10, 20, 25, 50] },
      pct: { type: 'int', min: 5, max: 95, step: 5 },
    },
    derived: {
      num: 'pct*den/100',
      answer: 'pct',
      d_wrongPercentBase: '100-pct',
      d_usedGivenValue: 'num',
      d_unitConversion: 'pct*2',
    },
    constraints: ['num==round(num)', 'num>0', 'pct!=50'],
  },
  choices: [
    { label: plain('{{answer}}\\%'), correct: true },
    { label: plain('{{d_wrongPercentBase}}\\%'), error: 'wrongPercentBase' },
    { label: plain('{{d_usedGivenValue}}\\%'), error: 'usedGivenValue' },
    { label: plain('{{d_unitConversion}}\\%'), error: 'unitConversion' },
  ],
  reasoning: ['{{den}} goes into 100 a whole number of times.', 'Scaling {{num}} out of {{den}} up to hundredths gives {{answer}} out of 100.'],
  answerSummary: { headline: 'A percent is the same ratio rewritten out of 100.', text: '${{answer}}\\%$ pass.' },
  hint: 'Scale the comparison so the second number becomes 100.',
  feedback: 'The count that passes is not already a percent.',
});

ar('6.4E', 'percent-of-amount', {
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: '{{p}}% of a {{total}}-{{item}} order arrived early. How many arrived early?',
  generator: {
    parameters: {
      item: GOODS,
      p: { type: 'choice', values: [10, 20, 25, 40, 60, 75, 80, 90] },
      hundreds: { type: 'int', min: 1, max: 12 },
    },
    derived: {
      total: 'hundreds*100',
      answer: 'total*p/100',
      d_wrongPercentBase: 'total-total*p/100',
      d_usedGivenValue: 'p',
      d_unitConversion: 'total*p/10',
    },
    constraints: ['p!=50'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_wrongPercentBase}}'), error: 'wrongPercentBase' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_unitConversion}}'), error: 'unitConversion' },
  ],
  reasoning: ['One percent of {{total}} is {{hundreds}}.', '{{p}} percent is {{p}} times {{hundreds}}, or {{answer}}.'],
  answerSummary: { headline: 'Find one percent, then take as many as the percent names.', text: '${{answer}}$ arrived early.' },
  hint: 'Work out what one percent of the order is.',
  feedback: 'The percent is a share of the order, not a count on its own.',
});

ar('6.4E', 'largest-of-mixed-forms', {
  difficultyBand: 3, dok: 3, taskType: 'conceptual', representation: 'symbolic',
  rankAnalysisNotApplicable: true,
  prompt: 'Four {{shop}} discounts are written in different forms. Which is the largest?',
  generator: {
    parameters: {
      shop: SHOPS,
      big: { type: 'int', min: 60, max: 95 },
      mid: { type: 'int', min: 30, max: 55 },
      low: { type: 'int', min: 5, max: 25 },
    },
    derived: {
      bigDec: 'big/100',
      midDec: 'mid/100',
      lowDec: 'low/100',
      tenth: 'mid/1000',
    },
    constraints: ['big>mid+5', 'mid>low+5'],
  },
  choices: [
    { label: plain('{{bigDec}}'), correct: true },
    { label: plain('{{mid}}\\%'), error: 'convertedWrongWay' },
    { label: plain('\\frac{{{low}}}{100}'), error: 'wrongPercentBase' },
    { label: plain('{{tenth}}'), error: 'unitConversion' },
  ],
  reasoning: ['Put every option in the same form first.', '{{bigDec}} is {{big}}%, {{mid}}% is {{midDec}}, and the last two are {{lowDec}} and {{tenth}}.'],
  answerSummary: { headline: 'Percents, fractions and decimals only compare in one shared form.', text: '${{bigDec}}$ is the largest.' },
  hint: 'Rewrite each option the same way before comparing.',
  feedback: 'A larger-looking number is not larger once the forms match.',
});

// ================================================================ 6.4F
// Benchmark fractions and percents.

// A single drawn quantity cannot produce an unbiased item: every distractor is
// then a fixed multiple of the key, so the ordering never changes and the key
// sits at the same rank in every draw. Each of these therefore draws the
// benchmark itself from a list balanced either side of a half, which lets the
// "used the other part" error land above the key as often as below it.

const BENCHMARK_PERCENTS = { type: 'choice', values: [10, 20, 25, 40, 60, 75, 80, 90] };

ar('6.4F', 'benchmark-percent-of-money', {
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'context',
  prompt: 'A {{tool}} listed at $\\${{total}}$ is marked down {{p}}%. How much is taken off?',
  generator: {
    parameters: {
      tool: contextParam(['grinder', 'compressor', 'drill', 'generator', 'welder']),
      p: BENCHMARK_PERCENTS,
      hundreds: { type: 'int', min: 1, max: 15 },
    },
    derived: {
      total: 'hundreds*100',
      answer: 'total*p/100',
      d_wrongPercentBase: 'total*(100-p)/100',
      d_unitConversion: 'total*p/10',
      d_convertedWrongWay: 'total*p/1000',
    },
    constraints: [],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_wrongPercentBase}}'), error: 'wrongPercentBase' },
    { label: money('{{d_unitConversion}}'), error: 'unitConversion' },
    { label: money('{{d_convertedWrongWay}}'), error: 'convertedWrongWay' },
  ],
  reasoning: ['One percent of {{total}} is {{hundreds}}.', '{{p}} of those is {{answer}}.'],
  answerSummary: { headline: 'A markdown is a percent of the listed price.', text: '$\\${{answer}}$ is taken off.' },
  hint: 'Work out one percent of the listed price first.',
  feedback: 'The markdown is the part taken off, not the part left.',
});

ar('6.4F', 'two-benchmarks-remaining', {
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'context',
  prompt: 'A {{crew}} cleared {{p}}% of {{total}} {{item}} on the first day and {{q}}% of the total on the second. How many are left?',
  generator: {
    parameters: {
      crew: WORKERS, item: GOODS,
      p: { type: 'choice', values: [10, 20, 25, 30, 45] },
      q: { type: 'choice', values: [10, 20, 25, 30, 45] },
      hundreds: { type: 'int', min: 2, max: 15 },
    },
    derived: {
      total: 'hundreds*100',
      cleared: 'total*(p+q)/100',
      answer: 'total-total*(p+q)/100',
      d_wrongPercentBase: 'cleared',
      d_forgotFinalStep: 'total-total*p/100',
      d_operationInverted: 'total*p*q/10000',
    },
    constraints: ['p!=q'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_wrongPercentBase}}'), error: 'wrongPercentBase' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['Together the two days cleared {{p}}+{{q}} percent of the order.', 'That is {{cleared}}, leaving {{answer}}.'],
  answerSummary: { headline: 'Both percents are of the same total, so they add.', text: '${{answer}}$ are left.' },
  hint: 'Both days are measured against the original order.',
  feedback: 'Add the two shares before taking them off the total.',
});

ar('6.4F', 'one-percent-scaling', {
  difficultyBand: 2, dok: 2, taskType: 'reverseReasoning', representation: 'context',
  prompt: '1% of a shipment is {{one}} {{item}}. How many {{item}} are {{p}}% of it?',
  generator: {
    parameters: {
      item: GOODS,
      one: { type: 'int', min: 3, max: 40 },
      p: BENCHMARK_PERCENTS,
    },
    derived: {
      answer: 'one*p',
      d_wrongPercentBase: 'one*(100-p)',
      d_forgotFinalStep: 'one*100',
      d_convertedWrongWay: 'round(one*p/10)',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_wrongPercentBase}}'), error: 'wrongPercentBase' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_convertedWrongWay}}'), error: 'convertedWrongWay' },
  ],
  reasoning: ['Each percent is worth {{one}} {{item}}.', '{{p}} percent is {{p}} times {{one}}.'],
  answerSummary: { headline: 'One percent is the unit every other percent is built from.', text: 'That is ${{answer}}$ {{item}}.' },
  hint: 'One percent is a building block. How many of them does the question want?',
  feedback: 'The whole shipment is 100 percent; the question asks for less than that.',
});

ar('6.4F', 'whole-from-benchmark-part', {
  difficultyBand: 3, dok: 2, taskType: 'reverseReasoning', representation: 'verbal',
  prompt: '{{part}} {{item}} are {{num}} of the {{den}} equal shares of a load, and {{extra}} more were added. How many {{item}} are there now?',
  generator: {
    parameters: {
      item: GOODS,
      den: { type: 'choice', values: [3, 4, 5, 6] },
      num: { type: 'int', min: 1, max: 5 },
      share: { type: 'int', min: 4, max: 30 },
      extra: { type: 'int', min: 5, max: 50, step: 5 },
    },
    derived: {
      part: 'num*share',
      load: 'den*share',
      answer: 'den*share+extra',
      d_forgotFinalStep: 'load',
      d_operationInverted: 'extra*den',
      d_partialTotal: 'part*den+extra',
    },
    constraints: ['num<den', 'num>1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['{{part}} covers {{num}} shares, so one share is {{share}}.', 'The whole load is {{den}} shares, or {{load}}.', 'With {{extra}} more that is {{answer}}.'],
  answerSummary: { headline: 'Get to one share before rebuilding the whole.', text: 'There are now ${{answer}}$ {{item}}.' },
  hint: 'Work out the size of a single share first.',
  feedback: 'The given count covers several shares, not one.',
});

ar('6.4F', 'benchmark-strip-reading', {
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'A strip of {{total}} {{item}} is split into the parts shown. What percent is {{label1}}?',
  stimulus: {
    kind: 'table',
    title: 'Strip diagram',
    table: { headers: ['part', 'count'], rows: [['{{label1}}', '{{part1}}'], ['{{label2}}', '{{part2}}']] },
  },
  generator: {
    parameters: {
      item: GOODS,
      label1: contextParam(['inspected', 'packed', 'loaded', 'cleared']),
      label2: contextParam(['held', 'pending', 'returned', 'flagged']),
      p: { type: 'choice', values: [10, 20, 25, 40, 60, 75, 80, 90] },
      hundreds: { type: 'int', min: 1, max: 9 },
    },
    derived: {
      total: 'hundreds*100',
      part1: 'total*p/100',
      part2: 'total-total*p/100',
      answer: 'p',
      d_wrongPercentBase: '100-p',
      d_usedGivenValue: 'part1',
      d_convertedWrongWay: 'round(p/10)',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}\\%'), correct: true },
    { label: plain('{{d_wrongPercentBase}}\\%'), error: 'wrongPercentBase' },
    { label: plain('{{d_usedGivenValue}}\\%'), error: 'usedGivenValue' },
    { label: plain('{{d_convertedWrongWay}}\\%'), error: 'convertedWrongWay' },
  ],
  reasoning: ['{{part1}} out of {{total}} is the share being asked for.', 'That is {{answer}} out of every hundred.'],
  answerSummary: { headline: 'A part of a whole becomes a percent by comparing it to the whole.', text: '${{answer}}\\%$ is {{label1}}.' },
  hint: 'Compare the part named in the question with the whole strip.',
  feedback: 'Read the row the question names, not the other one.',
});

// ================================================================ 6.4G
// Equivalent forms of fractions, decimals and percents, including money.

ar('6.4G', 'tip-as-fraction-of-bill', {
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A bill of $\\${{bill}}$ is paid with a tip of $\\${{tip}}$. What percent of the bill is the tip?',
  generator: {
    parameters: {
      p: { type: 'choice', values: [10, 20, 25, 30, 60, 70, 75, 80] },
      hundreds: { type: 'int', min: 1, max: 12 },
    },
    derived: {
      bill: 'hundreds*100',
      tip: 'bill*p/100',
      answer: 'p',
      d_wrongPercentBase: '100-p',
      d_unitConversion: 'p*10',
      d_convertedWrongWay: 'round(p/10)',
    },
    constraints: ['p!=50'],
  },
  choices: [
    { label: plain('{{answer}}\\%'), correct: true },
    { label: plain('{{d_wrongPercentBase}}\\%'), error: 'wrongPercentBase' },
    { label: plain('{{d_unitConversion}}\\%'), error: 'unitConversion' },
    { label: plain('{{d_convertedWrongWay}}\\%'), error: 'convertedWrongWay' },
  ],
  reasoning: ['One percent of {{bill}} is {{hundreds}}.', '{{tip}} divided by {{hundreds}} is {{answer}}.'],
  answerSummary: { headline: 'A part becomes a percent by comparing it to the whole.', text: 'The tip is ${{answer}}\\%$ of the bill.' },
  hint: 'Work out what one percent of the bill is worth.',
  feedback: 'Compare the tip with the bill, not with what is left over.',
});

ar('6.4G', 'decimal-price-to-total', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'A {{shop}} charges $\\${{cents}}$ cents for each {{item}}. What do {{count}} {{item}} cost in dollars?',
  generator: {
    parameters: {
      shop: SHOPS, item: GOODS,
      cents: { type: 'choice', values: [5, 10, 20, 25, 40, 50] },
      hundreds: { type: 'int', min: 2, max: 50 },
    },
    derived: {
      count: 'hundreds*100/cents',
      totalCents: 'hundreds*100',
      answer: 'hundreds',
      d_unitConversion: 'hundreds*100',
      d_convertedWrongWay: 'round(hundreds/10)',
      d_operationInverted: 'cents',
    },
    constraints: [],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_unitConversion}}'), error: 'unitConversion' },
    { label: money('{{d_convertedWrongWay}}'), error: 'convertedWrongWay' },
    { label: money('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['{{count}} at {{cents}} cents each is {{totalCents}} cents.', 'A hundred cents is a dollar, so that is {{answer}} dollars.'],
  answerSummary: { headline: 'Cents become dollars a hundred at a time.', text: 'They cost $\\${{answer}}$.' },
  hint: 'Total the cents first, then change to dollars.',
  feedback: 'A hundred cents make a dollar.',
});

ar('6.4G', 'discount-two-forms', {
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'verbal',
  prompt: 'A {{tool}} costs $\\${{price}}$. One {{shop}} takes {{p}}% off and another takes $\\${{flat}}$ off. How much cheaper is the better offer?',
  generator: {
    parameters: {
      tool: contextParam(['grinder', 'compressor', 'drill', 'generator', 'welder']),
      shop: SHOPS,
      p: { type: 'choice', values: [10, 20, 25, 40, 50] },
      hundreds: { type: 'int', min: 2, max: 12 },
      flatTens: { type: 'int', min: 1, max: 30 },
    },
    derived: {
      price: 'hundreds*100',
      percentOff: 'price*p/100',
      flat: 'flatTens*10',
      answer: 'abs(percentOff-flat)',
      d_partialTotal: 'percentOff',
      d_usedGivenValue: 'flat',
      d_forgotFinalStep: 'abs(p-flatTens)',
    },
    constraints: ['percentOff!=flat'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['{{p}} percent of {{price}} is {{percentOff}}.', 'The flat offer takes off {{flat}}.', 'The two savings differ by {{answer}}.'],
  answerSummary: { headline: 'A percent off and an amount off only compare once both are amounts.', text: 'The better offer saves $\\${{answer}}$ more.' },
  hint: 'Turn the percent into an amount of money before comparing.',
  feedback: 'The question asks for the difference between the two savings.',
});

ar('6.4G', 'fraction-of-dollar', {
  difficultyBand: 1, dok: 1, taskType: 'representationTranslation', representation: 'symbolic',
  prompt: 'A {{shop}} rounds a price to {{num}} of {{den}} equal parts of a dollar. How many cents is that?',
  generator: {
    parameters: {
      shop: SHOPS,
      den: { type: 'choice', values: [2, 4, 5, 10, 20, 25] },
      num: { type: 'int', min: 1, max: 19 },
    },
    derived: {
      answer: '100*num/den',
      d_convertedWrongWay: '100*den/num',
      d_usedGivenValue: 'num*den',
      d_unitConversion: '10*num/den',
    },
    constraints: ['num<den', 'answer==round(answer)', 'd_convertedWrongWay==round(d_convertedWrongWay)', 'd_unitConversion==round(d_unitConversion)'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_convertedWrongWay}}'), error: 'convertedWrongWay' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_unitConversion}}'), error: 'unitConversion' },
  ],
  reasoning: ['A dollar is 100 cents split into {{den}} parts.', '{{num}} of those parts is {{answer}} cents.'],
  answerSummary: { headline: 'A fraction of a dollar is that fraction of 100 cents.', text: 'It is ${{answer}}$ cents.' },
  hint: 'Split 100 cents into the number of parts named.',
  feedback: 'Check which of the two numbers counts the parts.',
});

ar('6.4G', 'full-price-from-deposit', {
  difficultyBand: 3, dok: 2, taskType: 'reverseReasoning', representation: 'verbal',
  prompt: 'A {{p}}% deposit on a {{tool}} comes to $\\${{deposit}}$. What is the full price?',
  generator: {
    parameters: {
      tool: contextParam(['grinder', 'compressor', 'drill', 'generator', 'welder']),
      p: { type: 'choice', values: [10, 20, 25, 40, 60, 75, 80, 90] },
      hundreds: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      price: 'hundreds*100',
      deposit: 'price*p/100',
      answer: 'price',
      d_wrongPercentBase: 'round(deposit*100/(100-p))',
      d_unitConversion: 'deposit*100',
      d_partialTotal: 'price-deposit',
    },
    constraints: [],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_wrongPercentBase}}'), error: 'wrongPercentBase' },
    { label: money('{{d_unitConversion}}'), error: 'unitConversion' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['$\\${{deposit}}$ is {{p}} percent of the price.', 'One percent is {{hundreds}}, so the full hundred percent is {{answer}}.'],
  answerSummary: { headline: 'Work back from the percent paid to the whole.', text: 'The full price is $\\${{answer}}$.' },
  hint: 'Find what one percent of the price is worth.',
  feedback: 'The deposit is part of the price, so the price is larger.',
});

// ================================================================ 6.4H
// Converting units within one measurement system.

ar('6.4H', 'feet-to-inches', {
  difficultyBand: 1, dok: 1, taskType: 'procedural', representation: 'context',
  prompt: 'A {{part}} measures {{feet}} feet {{inches}} inches. How many inches is that in all?',
  generator: {
    parameters: {
      part: contextParam(['rail', 'bracket', 'beam', 'pipe', 'channel']),
      feet: { type: 'int', min: 2, max: 11 },
      inches: { type: 'int', min: 2, max: 11 },
    },
    derived: {
      answer: 'feet*12+inches',
      d_unitConversion: 'feet*10+inches',
      d_convertedWrongWay: 'inches*12+feet',
      d_offByOneStep: 'feet*12+inches+12',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_unitConversion}}'), error: 'unitConversion' },
    { label: plain('{{d_convertedWrongWay}}'), error: 'convertedWrongWay' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
  ],
  reasoning: ['{{feet}} feet is {{feet}} times 12 inches.', 'The extra {{inches}} inches bring it to {{answer}}.'],
  answerSummary: { headline: 'Only the feet need converting; the inches are already inches.', text: 'It is ${{answer}}$ inches.' },
  hint: 'A foot is twelve inches.',
  feedback: 'Check which measurement counts feet and which counts inches.',
});

ar('6.4H', 'ounces-to-pounds-remainder', {
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'verbal',
  prompt: 'A crate holds {{ounces}} ounces of {{item}}. How many whole pounds is that?',
  generator: {
    parameters: {
      item: GOODS,
      pounds: { type: 'int', min: 2, max: 16 },
      spare: { type: 'int', min: 1, max: 15 },
    },
    derived: {
      ounces: 'pounds*16+spare',
      answer: 'pounds',
      d_unitConversion: 'round(ounces/12)',
      d_convertedWrongWay: 'round(ounces/32)',
      d_partialTotal: 'spare',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_unitConversion}}'), error: 'unitConversion' },
    { label: plain('{{d_convertedWrongWay}}'), error: 'convertedWrongWay' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['A pound is 16 ounces.', '{{ounces}} ounces holds {{answer}} whole pounds with {{spare}} ounces over.'],
  answerSummary: { headline: 'Sixteen ounces make a pound.', text: 'That is ${{answer}}$ whole pounds.' },
  hint: 'How many groups of sixteen fit in the total?',
  feedback: 'Check how many ounces make one pound.',
});

ar('6.4H', 'gallons-to-quarts-rate', {
  difficultyBand: 2, dok: 2, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'A tank takes {{quarts}} quarts to fill. A pump moves {{gpm}} gallons a minute. How many minutes does filling take?',
  generator: {
    parameters: {
      gpm: { type: 'int', min: 2, max: 12 },
      mins: { type: 'int', min: 3, max: 20 },
    },
    derived: {
      gallons: 'gpm*mins',
      quarts: 'gpm*mins*4',
      answer: 'mins',
      d_unitConversion: 'quarts/gpm',
      d_operationInverted: 'gpm',
      d_partialTotal: 'round(gallons/4)',
    },
    constraints: ['gpm!=mins'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_unitConversion}}'), error: 'unitConversion' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['Four quarts make a gallon, so {{quarts}} quarts is {{gallons}} gallons.', '{{gallons}} at {{gpm}} a minute takes {{answer}} minutes.'],
  answerSummary: { headline: 'Match the units before using the rate.', text: 'It takes ${{answer}}$ minutes.' },
  hint: 'The tank is measured in quarts but the pump works in gallons.',
  feedback: 'Convert to the pump’s units before dividing.',
});

ar('6.4H', 'yards-of-material', {
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'verbal',
  prompt: 'A job needs {{pieces}} pieces of {{part}}, each {{feetEach}} feet long, plus {{extra}} yards spare. Material is sold by the yard. How many yards are needed?',
  generator: {
    parameters: {
      part: contextParam(['trim', 'cable', 'hose', 'edging', 'strip']),
      pieces: { type: 'int', min: 3, max: 24 },
      yardsEach: { type: 'int', min: 1, max: 6 },
      extra: { type: 'int', min: 2, max: 40 },
    },
    derived: {
      feetEach: 'yardsEach*3',
      totalFeet: 'pieces*yardsEach*3',
      answer: 'pieces*yardsEach+extra',
      d_forgotFinalStep: 'pieces*yardsEach',
      d_convertedWrongWay: 'totalFeet+extra',
      d_partialTotal: 'extra*3',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_convertedWrongWay}}'), error: 'convertedWrongWay' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['{{pieces}} pieces at {{feetEach}} feet is {{totalFeet}} feet, or {{d_forgotFinalStep}} yards.', 'With {{extra}} yards spare that is {{answer}}.'],
  answerSummary: { headline: 'Total in one unit, then convert once.', text: 'It needs ${{answer}}$ yards.' },
  hint: 'Add up all the material first, then change units.',
  feedback: 'Three feet make a yard, so the yard count is smaller than the foot count.',
});

ar('6.4H', 'hours-to-minutes-table', {
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'table',
  prompt: 'A {{crew}} logs shifts in hours. Using the table, how many minutes are {{bigCount}} hours?',
  stimulus: {
    kind: 'table',
    title: 'Conversion',
    table: { headers: ['hours', 'minutes'], rows: [['1', '60'], ['{{bigCount}}', '?']] },
  },
  generator: {
    parameters: {
      crew: WORKERS,
      bigCount: { type: 'int', min: 5, max: 120 },
    },
    derived: {
      answer: 'bigCount*60',
      d_operationInverted: 'bigCount+60',
      d_unitConversion: 'bigCount*100',
      d_convertedWrongWay: 'bigCount*bigCount',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_convertedWrongWay}}'), error: 'convertedWrongWay' },
    { label: plain('{{d_unitConversion}}'), error: 'unitConversion' },
  ],
  reasoning: ['One hour holds 60 minutes.', '{{bigCount}} hours hold {{answer}}.'],
  answerSummary: { headline: 'A conversion table gives the rate for a single unit.', text: 'That is ${{answer}}$ minutes.' },
  hint: 'Read what one hour is worth from the first row.',
  feedback: 'Converting to a smaller unit gives a larger count.',
});

// ================================================================ 6.5B
// The three percent questions: find the part, the whole, or the percent.

ar('6.5B', 'part-given-whole-and-percent', {
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A {{crew}} inspected {{p}}% of the {{total}} {{item}} delivered. How many did they inspect?',
  generator: {
    parameters: {
      crew: WORKERS, item: GOODS,
      p: { type: 'choice', values: [10, 20, 25, 30, 60, 70, 75, 80] },
      hundreds: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      total: 'hundreds*100',
      answer: 'total*p/100',
      d_wrongPercentBase: 'total-total*p/100',
      d_unitConversion: 'total*p/10',
      d_convertedWrongWay: 'total*p/1000',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_wrongPercentBase}}'), error: 'wrongPercentBase' },
    { label: plain('{{d_unitConversion}}'), error: 'unitConversion' },
    { label: plain('{{d_convertedWrongWay}}'), error: 'convertedWrongWay' },
  ],
  reasoning: ['One percent of {{total}} is {{hundreds}}.', '{{p}} of those is {{answer}}.'],
  answerSummary: { headline: 'A percent of a total is a share of it.', text: 'They inspected ${{answer}}$.' },
  hint: 'Work out one percent of the delivery first.',
  feedback: 'The question asks for the inspected part, not the rest.',
});

ar('6.5B', 'whole-given-part-and-percent', {
  difficultyBand: 3, dok: 2, taskType: 'reverseReasoning', representation: 'context',
  prompt: '{{part}} {{item}} failed inspection, which was {{p}}% of the batch. How many were in the batch?',
  generator: {
    parameters: {
      item: GOODS,
      p: { type: 'choice', values: [10, 20, 25, 40, 60, 75, 80, 90] },
      hundreds: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      answer: 'hundreds*100',
      part: 'answer*p/100',
      d_wrongPercentBase: 'round(part*100/(100-p))',
      d_unitConversion: 'part*100',
      d_partialTotal: 'answer-part',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_wrongPercentBase}}'), error: 'wrongPercentBase' },
    { label: plain('{{d_unitConversion}}'), error: 'unitConversion' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['{{part}} is {{p}} percent of the batch.', 'One percent is {{hundreds}}, so a hundred percent is {{answer}}.'],
  answerSummary: { headline: 'Come down to one percent, then up to the whole.', text: 'The batch held ${{answer}}$ {{item}}.' },
  hint: 'What would one percent of the batch be?',
  feedback: 'The failures are part of the batch, so the batch is larger.',
});

ar('6.5B', 'percent-given-part-and-whole', {
  difficultyBand: 2, dok: 2, taskType: 'interpretation', representation: 'context',
  prompt: 'Of {{total}} {{item}} on a {{vehicle}}, {{part}} were damaged. What percent were damaged?',
  generator: {
    parameters: {
      item: GOODS, vehicle: VEHICLES,
      p: { type: 'choice', values: [5, 10, 20, 25, 60, 75, 80, 90] },
      hundreds: { type: 'int', min: 2, max: 16 },
    },
    derived: {
      total: 'hundreds*100',
      part: 'total*p/100',
      answer: 'p',
      d_wrongPercentBase: '100-p',
      d_usedGivenValue: 'hundreds',
      d_unitConversion: 'p*10',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}\\%'), correct: true },
    { label: plain('{{d_wrongPercentBase}}\\%'), error: 'wrongPercentBase' },
    { label: plain('{{d_usedGivenValue}}\\%'), error: 'usedGivenValue' },
    { label: plain('{{d_unitConversion}}\\%'), error: 'unitConversion' },
  ],
  reasoning: ['One percent of {{total}} is {{hundreds}}.', '{{part}} divided by {{hundreds}} is {{answer}}.'],
  answerSummary: { headline: 'A part becomes a percent by comparing it with the whole.', text: '${{answer}}\\%$ were damaged.' },
  hint: 'How many hundredths of the load is the damaged part?',
  feedback: 'The damaged count is not already a percent.',
});

ar('6.5B', 'raise-then-reduction', {
  difficultyBand: 3, dok: 3, taskType: 'procedural', representation: 'verbal',
  prompt: 'A {{shop}} raised a $\\${{price}}$ charge by {{p}}%, then took $\\${{cut}}$ off for a trade account. What is the charge now?',
  generator: {
    parameters: {
      shop: SHOPS,
      p: { type: 'choice', values: [5, 10, 20, 25, 30, 40, 50, 60] },
      hundreds: { type: 'int', min: 3, max: 12 },
      cutTens: { type: 'int', min: 5, max: 75 },
    },
    derived: {
      price: 'hundreds*100',
      rise: 'price*p/100',
      cut: 'cutTens*10',
      answer: 'price+price*p/100-cutTens*10',
      d_forgotFinalStep: 'price+price*p/100',
      d_operationInverted: 'price-cutTens*10',
      d_partialTotal: 'price*p/100+cutTens*10',
    },
    constraints: ['answer>0'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['{{p}} percent of {{price}} is {{rise}}, giving {{d_forgotFinalStep}}.', 'Taking off {{cut}} leaves {{answer}}.'],
  answerSummary: { headline: 'The rise goes on the original, then the reduction comes off the result.', text: 'The charge is now $\\${{answer}}$.' },
  hint: 'Handle the two changes in the order the sentence gives them.',
  feedback: 'The rise is added to the charge before the reduction comes off.',
});

ar('6.5B', 'percent-table-missing', {
  difficultyBand: 3, dok: 3, taskType: 'representationTranslation', representation: 'table',
  prompt: 'The table records the same order two ways. How many {{item}} are still outstanding?',
  stimulus: {
    kind: 'table',
    title: 'Order status',
    table: { headers: ['status', 'percent', 'count'], rows: [['filled', '{{p}}%', '{{filled}}'], ['outstanding', '{{q}}%', '?']] },
  },
  generator: {
    parameters: {
      item: GOODS,
      p: { type: 'choice', values: [10, 20, 25, 30, 60, 70, 75, 80] },
      hundreds: { type: 'int', min: 2, max: 18 },
    },
    derived: {
      q: '100-p',
      total: 'hundreds*100',
      filled: 'total*p/100',
      answer: 'total-total*p/100',
      d_wrongPercentBase: 'filled',
      d_usedGivenValue: 'q',
      d_partialTotal: 'total',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_wrongPercentBase}}'), error: 'wrongPercentBase' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['{{filled}} is {{p}} percent, so one percent is {{hundreds}} and the order is {{total}}.', 'The remaining {{q}} percent is {{answer}}.'],
  answerSummary: { headline: 'The two rows are two views of one order.', text: '${{answer}}$ are outstanding.' },
  hint: 'The filled row tells you the size of the whole order.',
  feedback: 'The percent in the second row is not a count.',
});

// ================================================================ 6.5C
// Equivalent fractions, decimals and percents of the same whole.

ar('6.5C', 'same-share-different-forms', {
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  rankAnalysisNotApplicable: true,
  prompt: 'Four {{shop}} records show shares of one order. Which is the largest share?',
  generator: {
    parameters: {
      shop: SHOPS,
      big: { type: 'int', min: 55, max: 95, step: 5 },
      mid: { type: 'int', min: 20, max: 45, step: 5 },
      low: { type: 'int', min: 2, max: 15 },
    },
    derived: {
      bigDec: 'big/100',
      midDec: 'mid/100',
      lowDec: 'low/100',
    },
    constraints: ['big>mid+10'],
  },
  choices: [
    { label: plain('{{big}}\\%'), correct: true },
    { label: plain('{{midDec}}'), error: 'convertedWrongWay' },
    { label: plain('\\frac{{{low}}}{100}'), error: 'wrongPercentBase' },
    { label: plain('{{lowDec}}'), error: 'unitConversion' },
  ],
  reasoning: ['Rewrite each record the same way: {{big}}% is {{bigDec}}, and {{midDec}} is {{mid}}%.', 'The largest share is {{big}}%.'],
  answerSummary: { headline: 'Shares only compare once every form matches.', text: '${{big}}\\%$ is the largest.' },
  hint: 'Put all four into one form before comparing.',
  feedback: 'A record can look larger and still name a smaller share.',
});

ar('6.5C', 'equal-parts-of-one-load', {
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'verbal',
  prompt: 'A load of {{total}} {{item}} is split into {{den}} equal parts. How many {{item}} are in {{num}} parts?',
  generator: {
    parameters: {
      item: GOODS,
      den: { type: 'choice', values: [8, 10, 12, 16, 20] },
      per: { type: 'int', min: 6, max: 20 },
      num: { type: 'int', min: 1, max: 7 },
    },
    derived: {
      total: 'den*per',
      answer: 'num*per',
      d_partialTotal: 'per',
      d_operationInverted: 'num*den',
      d_offByOneStep: 'num*per+per',
    },
    constraints: ['num<den'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
  ],
  reasoning: ['Each part holds {{total}} divided by {{den}}, or {{per}}.', '{{num}} parts hold {{answer}}.'],
  answerSummary: { headline: 'Find one part, then take as many as asked.', text: 'There are ${{answer}}$ {{item}}.' },
  hint: 'Work out the size of a single part first.',
  feedback: 'The two numbers count parts, not items.',
});

ar('6.5C', 'decimal-share-to-count', {
  difficultyBand: 2, dok: 1, taskType: 'procedural', representation: 'context',
  prompt: 'A {{crew}} finished {{dec}} of a {{total}}-{{item}} job. How many {{item}} is that?',
  generator: {
    parameters: {
      crew: WORKERS, item: GOODS,
      p: { type: 'choice', values: [10, 20, 25, 40, 60, 75, 80, 90] },
      hundreds: { type: 'int', min: 2, max: 18 },
    },
    derived: {
      dec: 'p/100',
      total: 'hundreds*100',
      answer: 'total*p/100',
      d_wrongPercentBase: 'total-total*p/100',
      d_unitConversion: 'total*p',
      d_convertedWrongWay: 'round(total*p/1000)',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_wrongPercentBase}}'), error: 'wrongPercentBase' },
    { label: plain('{{d_unitConversion}}'), error: 'unitConversion' },
    { label: plain('{{d_convertedWrongWay}}'), error: 'convertedWrongWay' },
  ],
  reasoning: ['{{dec}} of the job is {{p}} percent of it.', '{{p}} percent of {{total}} is {{answer}}.'],
  answerSummary: { headline: 'A decimal share reads as hundredths.', text: 'That is ${{answer}}$ {{item}}.' },
  hint: 'How many hundredths does the decimal name?',
  feedback: 'A decimal share makes the total smaller, not larger.',
});

ar('6.5C', 'which-two-match', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'table',
  rankAnalysisNotApplicable: true,
  prompt: 'Three clerks recorded the same share of one shipment. Which record does not match the others?',
  stimulus: {
    kind: 'table',
    title: 'Clerk records',
    table: { headers: ['clerk', 'record'], rows: [['A', '{{p}}%'], ['B', '{{dec}}'], ['C', '\\frac{{{p}}}{{{wrongDen}}}'] ] },
  },
  generator: {
    parameters: {
      p: { type: 'int', min: 5, max: 95, step: 5 },
      wrongDen: { type: 'choice', values: [10, 1000] },
    },
    derived: {
      dec: 'p/100',
      wrongVal: 'p/wrongDen',
      d_tenth: 'p/10',
      d_hundredth: 'p/1000',
    },
    constraints: ['p!=50'],
  },
  choices: [
    { label: plain('\\frac{{{p}}}{{{wrongDen}}}'), correct: true },
    { label: plain('{{p}}\\%'), error: 'wrongPercentBase' },
    { label: plain('{{dec}}'), error: 'convertedWrongWay' },
    { label: plain('\\frac{{{p}}}{100}'), error: 'unitConversion' },
  ],
  reasoning: ['{{p}}% and {{dec}} both name {{p}} hundredths.', 'The third record uses {{wrongDen}} on the bottom, so it names a different share.'],
  answerSummary: { headline: 'Equivalent records must all name the same share of the whole.', text: 'Clerk C’s record is the odd one out.' },
  hint: 'Two of the records already agree. Find the one that does not.',
  feedback: 'A percent counts hundredths, so the matching fraction is over 100.',
});

ar('6.5C', 'build-equivalent-fraction', {
  difficultyBand: 2, dok: 2, taskType: 'reverseReasoning', representation: 'symbolic',
  prompt: 'A {{shop}} records {{num}} of {{den}} {{item}} as sold. Out of 100, that is how many?',
  generator: {
    parameters: {
      shop: SHOPS, item: GOODS,
      den: { type: 'choice', values: [4, 5, 10, 20, 25, 50] },
      num: { type: 'int', min: 1, max: 40 },
    },
    derived: {
      factor: '100/den',
      answer: 'num*100/den',
      d_forgotFinalStep: 'num',
      d_operationInverted: 'num+den',
      d_offByOneStep: 'num*100/den+factor',
    },
    constraints: ['num<den', 'answer==round(answer)'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
  ],
  reasoning: ['{{den}} goes into 100 exactly {{factor}} times.', 'Scaling {{num}} the same way gives {{answer}}.'],
  answerSummary: { headline: 'Both parts of a fraction scale by the same factor.', text: 'It is ${{answer}}$ out of 100.' },
  hint: 'How many times does the bottom number go into 100?',
  feedback: 'Both numbers grow by the same factor, not by the same amount.',
});

// ================================================================ 7.4B
// Unit rates from rates.

ar('7.4B', 'wage-per-hour', {
  difficultyBand: 2, dok: 1, taskType: 'procedural', representation: 'context',
  prompt: 'A {{worker}} earned $\\${{pay}}$ for {{hours}} hours. What is the hourly rate?',
  generator: {
    parameters: {
      worker: contextParam(['mechanic', 'driver', 'loader', 'welder', 'technician']),
      rate: { type: 'int', min: 12, max: 40 },
      hours: { type: 'int', min: 12, max: 40 },
    },
    derived: {
      pay: 'rate*hours',
      answer: 'rate',
      d_operationInverted: 'hours',
      d_offByOneStep: 'round(pay/(hours+2))',
      d_arithmeticSlip: 'round(pay/(hours-2))',
    },
    constraints: ['hours>4'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: money('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: money('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['The pay covers every hour worked.', '{{pay}} shared over {{hours}} hours is {{answer}} an hour.'],
  answerSummary: { headline: 'An hourly rate divides the pay by the hours.', text: 'The rate is $\\${{answer}}$ an hour.' },
  hint: 'Decide which quantity is being shared across the other.',
  feedback: 'Check which number counts hours and which counts dollars.',
});

ar('7.4B', 'best-unit-rate-of-three', {
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'Three {{shop}} offers are listed. What is the lowest price per {{item}}?',
  stimulus: {
    kind: 'table',
    title: 'Offers',
    table: { headers: ['offer', 'count', 'price'], rows: [['A', '{{n1}}', '{{p1}}'], ['B', '{{n2}}', '{{p2}}'], ['C', '{{n3}}', '{{p3}}']] },
  },
  generator: {
    parameters: {
      shop: SHOPS, item: GOODS,
      low: { type: 'int', min: 3, max: 14 },
      gap1: { type: 'int', min: 1, max: 8 },
      gap2: { type: 'int', min: 1, max: 8 },
      n1: { type: 'int', min: 3, max: 12 },
      n2: { type: 'int', min: 3, max: 14 },
      n3: { type: 'int', min: 3, max: 12 },
    },
    derived: {
      mid: 'low+gap1',
      high: 'low+gap1+gap2',
      p1: 'n1*high',
      p2: 'n2*low',
      p3: 'n3*mid',
      answer: 'low',
      d_operationInverted: 'gap1',
      d_usedGivenValue: 'n2',
      d_partialTotal: 'p2',
    },
    constraints: [],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['Offer A is {{high}} each, B is {{low}} each and C is {{mid}} each.', 'The lowest of the three is {{answer}}.'],
  answerSummary: { headline: 'Three totals only rank once each is per item.', text: 'The lowest price is $\\${{answer}}$ each.' },
  hint: 'Work out what one item costs under each offer.',
  feedback: 'The cheapest total is not always the cheapest per item.',
});

ar('7.4B', 'restate-rate-per-ten', {
  difficultyBand: 3, dok: 2, taskType: 'representationTranslation', representation: 'verbal',
  prompt: 'A {{machine}} uses {{ml}} millilitres of oil every {{cycles}} cycles. How much does it use every 10 cycles?',
  generator: {
    parameters: {
      machine: MACHINES,
      unit: { type: 'int', min: 1, max: 5 },
      cycles: { type: 'choice', values: [20, 25, 40, 50] },
    },
    derived: {
      ml: 'unit*cycles',
      answer: 'unit*10',
      d_forgotFinalStep: 'unit',
      d_operationInverted: 'cycles',
      d_usedGivenValue: 'ml',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{ml}} over {{cycles}} cycles is {{unit}} millilitres a cycle.', 'Ten cycles use ten times that, or {{answer}}.'],
  answerSummary: { headline: 'Restating a rate goes through the amount for one.', text: 'It uses ${{answer}}$ millilitres every 10 cycles.' },
  hint: 'Work out the oil for a single cycle first.',
  feedback: 'The quoted figure covers a different number of cycles.',
});

ar('7.4B', 'unit-rate-then-order', {
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'context',
  prompt: 'A supplier charges $\\${{total}}$ for {{count}} {{item}}. At the same rate, what do {{want}} {{item}} cost?',
  generator: {
    parameters: {
      item: GOODS,
      each: { type: 'int', min: 3, max: 20 },
      count: { type: 'int', min: 4, max: 24 },
      want: { type: 'int', min: 4, max: 24 },
    },
    derived: {
      total: 'each*count',
      answer: 'each*want',
      d_partialTotal: 'total',
      d_forgotFinalStep: 'each',
      d_offByOneStep: 'each*(want+1)',
    },
    constraints: ['count!=want'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_offByOneStep}}'), error: 'offByOneStep' },
  ],
  reasoning: ['{{count}} for {{total}} is {{each}} each.', '{{want}} at {{each}} each is {{answer}}.'],
  answerSummary: { headline: 'Come down to one, then up to the amount ordered.', text: '{{want}} cost $\\${{answer}}$.' },
  hint: 'What does a single one cost?',
  feedback: 'The quoted total covers a different quantity from the one ordered.',
});

ar('7.4B', 'rate-from-two-readings', {
  difficultyBand: 3, dok: 3, taskType: 'reverseReasoning', representation: 'table',
  prompt: 'A meter read {{r1}} at {{h1}} hours and {{r2}} at {{h2}} hours. How much does it climb each hour?',
  stimulus: {
    kind: 'table',
    title: 'Meter log',
    table: { headers: ['hours', 'reading'], rows: [['{{h1}}', '{{r1}}'], ['{{h2}}', '{{r2}}']] },
  },
  generator: {
    parameters: {
      rate: { type: 'int', min: 3, max: 12 },
      h1: { type: 'int', min: 1, max: 8 },
      gap: { type: 'int', min: 2, max: 12 },
      start: { type: 'int', min: 10, max: 60, step: 5 },
    },
    derived: {
      h2: 'h1+gap',
      r1: 'start+rate*h1',
      r2: 'start+rate*h1+rate*gap',
      answer: 'rate',
      d_forgotFinalStep: 'r2-r1',
      d_operationInverted: 'gap',
      d_offByOneStep: 'round((r2-r1)/(2*gap))',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
  ],
  reasoning: ['The reading rose by {{d_forgotFinalStep}} over {{gap}} hours.', 'That is {{answer}} an hour.'],
  answerSummary: { headline: 'A per-hour climb needs the change in both columns.', text: 'It climbs ${{answer}}$ an hour.' },
  hint: 'Both the reading and the hours changed. Compare the two changes.',
  feedback: 'The total rise is not the hourly rise.',
});

// ================================================================ 7.4C
// The constant of proportionality.

ar('7.4C', 'constant-from-pair', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'A {{machine}} produces {{y}} {{item}} in {{x}} hours at a steady rate. How many does it produce each hour?',
  generator: {
    parameters: {
      machine: MACHINES, item: GOODS,
      k: { type: 'int', min: 4, max: 30 },
      x: { type: 'int', min: 4, max: 30 },
    },
    derived: {
      y: 'k*x',
      answer: 'k',
      d_operationInverted: 'x',
      d_offByOneStep: 'round(y/(x+2))',
      d_arithmeticSlip: 'round(y/(x-2))',
    },
    constraints: ['x>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['A steady rate means every hour contributes the same amount.', '{{y}} over {{x}} hours is {{answer}} an hour.'],
  answerSummary: { headline: 'A steady rate is the output divided by the input.', text: 'It produces ${{answer}}$ an hour.' },
  hint: 'One hour is the unit the question wants.',
  feedback: 'Check which column counts hours.',
});

ar('7.4C', 'which-table-is-proportional', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'table',
  rankAnalysisNotApplicable: true,
  prompt: 'One row of this steady-rate table is wrong. Which entry does not match the others?',
  stimulus: {
    kind: 'table',
    title: 'Rate table',
    table: { headers: ['hours', 'output'], rows: [['{{x1}}', '{{y1}}'], ['{{x2}}', '{{y2}}'], ['{{x3}}', '{{bad}}']] },
  },
  generator: {
    parameters: {
      k: { type: 'int', min: 3, max: 15 },
      x1: { type: 'int', min: 2, max: 6 },
      step1: { type: 'int', min: 1, max: 5 },
      step2: { type: 'int', min: 1, max: 5 },
      off: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      x2: 'x1+step1',
      x3: 'x1+step1+step2',
      y1: 'k*x1',
      y2: 'k*x2',
      y3: 'k*x3',
      bad: 'k*x3+off',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{bad}}'), correct: true },
    { label: plain('{{y1}}'), error: 'usedGivenValue' },
    { label: plain('{{y2}}'), error: 'partialTotal' },
    { label: plain('{{y3}}'), error: 'offByOneStep' },
  ],
  reasoning: ['The first two rows both give {{k}} per hour.', 'At {{x3}} hours a steady rate gives {{y3}}, not {{bad}}.'],
  answerSummary: { headline: 'A steady rate gives the same amount per hour in every row.', text: 'The entry ${{bad}}$ breaks the pattern.' },
  hint: 'Work out the per-hour amount from the first two rows.',
  feedback: 'Check each row against the rate the earlier rows set.',
});

ar('7.4C', 'output-from-constant', {
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'verbal',
  prompt: 'A pump moves {{k}} litres a minute. How many litres does it move in {{x}} minutes?',
  generator: {
    parameters: {
      k: { type: 'int', min: 4, max: 30 },
      x: { type: 'int', min: 4, max: 30 },
    },
    derived: {
      answer: 'k*x',
      d_operationInverted: 'x*x',
      d_offByOneStep: 'k*(x-1)',
      d_arithmeticSlip: 'k*(x+1)',
    },
    constraints: ['k!=x'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['Every minute accounts for {{k}} litres.', '{{x}} minutes gives {{answer}}.'],
  answerSummary: { headline: 'A constant rate multiplies by the time.', text: 'It moves ${{answer}}$ litres.' },
  hint: 'One minute is worth the stated amount.',
  feedback: 'Pair the per-minute amount with the number of minutes.',
});

ar('7.4C', 'input-from-constant', {
  difficultyBand: 3, dok: 2, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'A {{vehicle}} burns {{k}} litres of fuel an hour. How long can it run on {{total}} litres?',
  generator: {
    parameters: {
      vehicle: VEHICLES,
      k: { type: 'int', min: 4, max: 25 },
      hours: { type: 'int', min: 4, max: 25 },
    },
    derived: {
      total: 'k*hours',
      answer: 'hours',
      d_operationInverted: 'k',
      d_offByOneStep: 'round(total/(k+2))',
      d_arithmeticSlip: 'round(total/(k-2))',
    },
    constraints: ['k>4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_arithmeticSlip}}'), error: 'arithmeticSlip' },
  ],
  reasoning: ['Each hour costs {{k}} litres.', '{{total}} divided by {{k}} is {{answer}} hours.'],
  answerSummary: { headline: 'A total and a rate give the time.', text: 'It runs ${{answer}}$ hours.' },
  hint: 'How many hours worth of fuel does the tank hold?',
  feedback: 'The tank size is shared out at the hourly rate.',
});

ar('7.4C', 'compare-two-constants', {
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'Two {{machine}}s ran as logged. How many more {{item}} an hour does the faster one make?',
  stimulus: {
    kind: 'table',
    title: 'Run log',
    table: { headers: ['machine', 'hours', 'output'], rows: [['A', '{{hA}}', '{{outA}}'], ['B', '{{hB}}', '{{outB}}']] },
  },
  generator: {
    parameters: {
      machine: MACHINES, item: GOODS,
      slow: { type: 'int', min: 5, max: 25 },
      gap: { type: 'int', min: 2, max: 20 },
      hA: { type: 'int', min: 2, max: 9 },
      hB: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      fast: 'slow+gap',
      outA: 'fast*hA',
      outB: 'slow*hB',
      answer: 'gap',
      d_partialTotal: 'abs(outA-outB)',
      d_operationInverted: 'slow',
      d_offByOneStep: 'abs(hA-hB)',
    },
    constraints: ['hA!=hB'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
  ],
  reasoning: ['Machine A makes {{fast}} an hour and B makes {{slow}}.', 'The difference is {{answer}}.'],
  answerSummary: { headline: 'Compare the two rates, not the two totals.', text: 'It makes ${{answer}}$ more an hour.' },
  hint: 'Neither total means anything until both are per hour.',
  feedback: 'The machines ran for different lengths of time.',
});

// ================================================================ 6.12C
// Mean, median, range: the summary questions the ASVAB actually asks.

ar('6.12C', 'mean-of-shifts', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'table',
  prompt: 'A {{crew}} loaded the counts shown over four days. What is the daily average?',
  stimulus: {
    kind: 'table',
    title: 'Daily loads',
    table: { headers: ['day', 'loaded'], rows: [['1', '{{a}}'], ['2', '{{b}}'], ['3', '{{c}}'], ['4', '{{d}}']] },
  },
  generator: {
    parameters: {
      crew: WORKERS,
      mean: { type: 'int', min: 8, max: 22 },
      s1: { type: 'int', min: -10, max: 10 },
      s2: { type: 'int', min: -10, max: 10 },
      s3: { type: 'int', min: -10, max: 10 },
    },
    derived: {
      a: 'mean+s1',
      b: 'mean+s2',
      c: 'mean+s3',
      d: 'mean-s1-s2-s3',
      total: 'mean*4',
      answer: 'mean',
      d_forgotFinalStep: 'total',
      d_operationInverted: 'max(max(a,b),max(c,d))-min(min(a,b),min(c,d))',
      d_offByOneStep: 'round(total/5)',
    },
    constraints: ['a>0', 'b>0', 'c>0', 'd>0'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
  ],
  reasoning: ['The four days total {{total}}.', 'Shared over four days that is {{answer}} a day.'],
  answerSummary: { headline: 'An average shares the total evenly across the entries.', text: 'The average is ${{answer}}$ a day.' },
  hint: 'Total the four days, then split the total evenly.',
  feedback: 'Divide by how many days there are, not by more or fewer.',
});

ar('6.12C', 'missing-value-from-mean', {
  difficultyBand: 3, dok: 3, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'Four deliveries averaged {{mean}} {{item}}. Three of them carried {{a}}, {{b}} and {{c}}. How many did the fourth carry?',
  generator: {
    parameters: {
      item: GOODS,
      mean: { type: 'int', min: 10, max: 40 },
      s1: { type: 'int', min: -8, max: 8 },
      s2: { type: 'int', min: -8, max: 8 },
      s3: { type: 'int', min: -8, max: 8 },
    },
    derived: {
      a: 'mean+s1',
      b: 'mean+s2',
      c: 'mean+s3',
      answer: 'mean-s1-s2-s3',
      total: 'mean*4',
      d_forgotFinalStep: 'mean',
      d_partialTotal: 'a+b+c',
      d_operationInverted: 'min(min(a,b),c)',
    },
    constraints: ['a>0', 'b>0', 'c>0', 'answer>0'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['Four deliveries averaging {{mean}} carried {{total}} in all.', 'The first three carried {{d_partialTotal}}, so the fourth carried {{answer}}.'],
  answerSummary: { headline: 'The average fixes the total, and the total fixes the missing entry.', text: 'The fourth carried ${{answer}}$.' },
  hint: 'What must all four add up to?',
  feedback: 'Work out the total the average implies before looking at the missing one.',
});

ar('6.12C', 'median-of-five', {
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'table',
  prompt: 'Five runs recorded the times shown in minutes. What is the median time?',
  stimulus: {
    kind: 'table',
    title: 'Run times',
    table: { headers: ['run', 'minutes'], rows: [['1', '{{v3}}'], ['2', '{{v1}}'], ['3', '{{v5}}'], ['4', '{{v2}}'], ['5', '{{v4}}']] },
  },
  generator: {
    parameters: {
      v1: { type: 'int', min: 8, max: 20 },
      g1: { type: 'int', min: 1, max: 6 },
      g2: { type: 'int', min: 1, max: 6 },
      g3: { type: 'int', min: 1, max: 6 },
      g4: { type: 'int', min: 1, max: 6 },
    },
    derived: {
      v2: 'v1+g1',
      v3: 'v1+g1+g2',
      v4: 'v1+g1+g2+g3',
      v5: 'v1+g1+g2+g3+g4',
      answer: 'v1+g1+g2',
      d_usedGivenValue: 'v1',
      d_operationInverted: 'v5',
      d_partialTotal: 'round((v1+v2+v3+v4+v5)/5)',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['In order the times run {{v1}}, {{v2}}, {{v3}}, {{v4}}, {{v5}}.', 'The middle one of five is {{answer}}.'],
  answerSummary: { headline: 'The median is the middle value once the list is in order.', text: 'The median is ${{answer}}$ minutes.' },
  hint: 'Put the times in order first.',
  feedback: 'The middle of the table is not the middle of the ordered list.',
});

ar('6.12C', 'range-of-readings', {
  difficultyBand: 1, dok: 1, taskType: 'interpretation', representation: 'context',
  prompt: 'Over {{days}} days a {{crew}} logged temperatures from {{low}} to {{high}} degrees. What is the range?',
  generator: {
    parameters: {
      crew: WORKERS,
      low: { type: 'int', min: 5, max: 40 },
      spread: { type: 'int', min: 6, max: 45 },
      days: { type: 'int', min: 5, max: 40 },
    },
    derived: {
      high: 'low+spread',
      answer: 'spread',
      d_partialTotal: 'low+high',
      d_usedGivenValue: 'days',
      d_operationInverted: 'low',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['The range measures how far apart the extremes are.', '{{high}} minus {{low}} is {{answer}}.'],
  answerSummary: { headline: 'Range is the distance between the highest and lowest.', text: 'The range is ${{answer}}$ degrees.' },
  hint: 'How far is it from the lowest reading to the highest?',
  feedback: 'The range is a difference, not a total and not the number of days.',
});

ar('6.12C', 'average-after-one-more', {
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'verbal',
  prompt: 'Three loads averaged {{mean}} {{item}}. A fourth load of {{fourth}} arrives. What is the new average?',
  generator: {
    parameters: {
      item: GOODS,
      mean: { type: 'int', min: 24, max: 44 },
      step: { type: 'int', min: 1, max: 5 },
      dir: { type: 'choice', values: [-1, 1] },
    },
    derived: {
      fourth: 'mean+dir*step*4',
      answer: 'mean+dir*step',
      total: 'mean*3+mean+dir*step*4',
      d_forgotFinalStep: 'mean',
      d_partialTotal: 'fourth',
      d_operationInverted: 'round((mean+fourth)/2)',
    },
    constraints: ['fourth>0', 'answer>0'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['The first three carried {{mean}} times 3.', 'With the fourth the total is {{total}} over four loads, or {{answer}}.'],
  answerSummary: { headline: 'A new entry moves the average toward itself, not all the way.', text: 'The new average is ${{answer}}$.' },
  hint: 'Rebuild the total, then share it over four loads.',
  feedback: 'Averaging the old average with the new load is not the same as averaging all four.',
});

// ================================================================ 6.3B
// Whether multiplying by a fraction makes a quantity larger or smaller.

ar('6.3B', 'which-multiplier-grows', {
  difficultyBand: 2, dok: 2, taskType: 'conceptual', representation: 'symbolic',
  rankAnalysisNotApplicable: true,
  prompt: 'A {{shop}} scales an order of {{total}} {{item}} by one of these factors. Which gives the largest new order?',
  generator: {
    parameters: {
      shop: SHOPS, item: GOODS,
      total: { type: 'int', min: 20, max: 400, step: 20 },
      whole: { type: 'int', min: 2, max: 5 },
      den: { type: 'choice', values: [3, 4, 5] },
    },
    derived: { topHeavy: 'whole*den+1' },
    constraints: [],
  },
  choices: [
    { label: plain('\\frac{{{topHeavy}}}{{{den}}}'), correct: true },
    { label: plain('\\frac{1}{{{den}}}'), error: 'partialTotal' },
    { label: plain('\\frac{{{den}}}{{{topHeavy}}}'), error: 'ratioReversed' },
    { label: plain('\\frac{1}{{{topHeavy}}}'), error: 'operationInverted' },
  ],
  reasoning: ['A factor bigger than 1 grows the order; a factor smaller than 1 shrinks it.', 'Only $\\frac{{{topHeavy}}}{{{den}}}$ has a top larger than its bottom.'],
  answerSummary: { headline: 'A fraction grows a quantity only when its top exceeds its bottom.', text: '$\\frac{{{topHeavy}}}{{{den}}}$ gives the largest order.' },
  hint: 'Compare the top and bottom of each factor with each other.',
  feedback: 'Multiplying by a fraction below 1 makes the result smaller.',
});

ar('6.3B', 'scale-up-by-improper', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'A {{crew}} increased a run of {{total}} {{item}} to {{num}} for every {{den}} it had been. How many {{item}} now?',
  generator: {
    parameters: {
      crew: WORKERS, item: GOODS,
      den: { type: 'choice', values: [2, 3, 4, 5] },
      extra: { type: 'int', min: 1, max: 5 },
      unit: { type: 'int', min: 6, max: 40 },
    },
    derived: {
      num: 'den+extra',
      total: 'den*unit',
      answer: 'unit*(den+extra)',
      d_ratioReversed: 'round(total*den/(den+extra))',
      d_partialTotal: 'unit*den*2',
      d_offByOneStep: 'unit*(den+extra+1)',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
  ],
  reasoning: ['{{total}} splits into {{den}} shares of {{unit}}.', '{{num}} of those shares is {{answer}}, which is more than it started with.'],
  answerSummary: { headline: 'A factor above one grows the run.', text: 'There are now ${{answer}}$ {{item}}.' },
  hint: 'Work out one share of the original run first.',
  feedback: 'The new run is larger than the old one.',
});

ar('6.3B', 'scale-down-by-proper', {
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A {{machine}} run of {{total}} {{item}} was cut to {{num}} of every {{den}}. How many {{item}} now?',
  generator: {
    parameters: {
      machine: MACHINES, item: GOODS,
      den: { type: 'choice', values: [3, 4, 5, 6, 8] },
      num: { type: 'int', min: 1, max: 7 },
      unit: { type: 'int', min: 6, max: 40 },
    },
    derived: {
      total: 'den*unit',
      answer: 'unit*num',
      d_ratioReversed: 'unit*(den-num)',
      d_partialTotal: 'unit',
      d_offByOneStep: 'unit*(num+1)',
    },
    constraints: ['num<den'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
  ],
  reasoning: ['{{total}} splits into {{den}} shares of {{unit}}.', 'Keeping {{num}} of them leaves {{answer}}.'],
  answerSummary: { headline: 'A factor below one shrinks the run.', text: 'There are now ${{answer}}$ {{item}}.' },
  hint: 'How big is a single share of the original run?',
  feedback: 'Cutting a run down leaves fewer than before.',
});

ar('6.3B', 'identify-the-factor', {
  difficultyBand: 3, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
  prompt: 'An order of {{total}} {{item}} was changed to {{after}}. How many of every {{den}} were kept?',
  generator: {
    parameters: {
      item: GOODS,
      den: { type: 'choice', values: [3, 4, 5, 6, 8] },
      num: { type: 'int', min: 1, max: 12 },
      unit: { type: 'int', min: 5, max: 30 },
    },
    derived: {
      total: 'den*unit',
      after: 'num*unit',
      answer: 'num',
      d_ratioReversed: 'den',
      d_partialTotal: 'unit',
      d_offByOneStep: 'abs(num-den)',
    },
    constraints: ['num!=den', 'd_offByOneStep>0'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
  ],
  reasoning: ['{{total}} splits into {{den}} shares of {{unit}}.', '{{after}} is {{answer}} of those shares.'],
  answerSummary: { headline: 'Work back from the new size to the number of shares kept.', text: '${{answer}}$ of every {{den}} were kept.' },
  hint: 'How big is one share of the original order?',
  feedback: 'The answer counts shares, not items.',
});

ar('6.3B', 'grow-then-shrink', {
  difficultyBand: 3, dok: 3, taskType: 'representationTranslation', representation: 'table',
  prompt: 'A run was scaled twice as recorded. How many {{item}} are there at the end?',
  stimulus: {
    kind: 'table',
    title: 'Scaling record',
    table: { headers: ['step', 'factor'], rows: [['start', '{{total}} {{item}}'], ['first', '{{n1}} of every {{d1}}'], ['second', '{{n2}} of every {{d2}}']] },
  },
  generator: {
    parameters: {
      item: GOODS,
      d1: { type: 'choice', values: [2, 3, 4] },
      n1: { type: 'int', min: 3, max: 8 },
      d2: { type: 'choice', values: [2, 3, 4] },
      n2: { type: 'int', min: 1, max: 3 },
      unit: { type: 'int', min: 4, max: 24 },
    },
    derived: {
      total: 'd1*d2*unit',
      middle: 'n1*d2*unit',
      answer: 'n1*n2*unit',
      d_forgotFinalStep: 'middle',
      d_operationInverted: 'total',
      d_partialTotal: 'd1*n2*unit',
    },
    constraints: ['n2<d2', 'n1>d1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['The first step grows {{total}} to {{middle}}.', 'The second step cuts that to {{answer}}.'],
  answerSummary: { headline: 'Each factor applies to what the step before it left.', text: 'There are ${{answer}}$ {{item}}.' },
  hint: 'The second factor works on the result of the first, not on the start.',
  feedback: 'Apply the two factors one after the other.',
});

// ================================================================ 6.14C
// Balancing a register of deposits, withdrawals and transfers.

ar('6.14C', 'register-closing-balance', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'table',
  prompt: 'A register opened at $\\${{start}}$ and recorded the entries shown. What is the closing balance?',
  stimulus: {
    kind: 'table',
    title: 'Register',
    table: { headers: ['entry', 'amount'], rows: [['deposit', '{{dep}}'], ['withdrawal', '{{wd}}'], ['deposit', '{{dep2}}']] },
  },
  generator: {
    parameters: {
      start: { type: 'int', min: 100, max: 900, step: 10 },
      dep: { type: 'int', min: 20, max: 400, step: 10 },
      wd: { type: 'int', min: 20, max: 800, step: 10 },
      dep2: { type: 'int', min: 20, max: 400, step: 10 },
    },
    derived: {
      answer: 'start+dep-wd+dep2',
      d_signError: 'start+dep+wd+dep2',
      d_forgotFinalStep: 'start+dep-wd',
      d_partialTotal: 'start',
    },
    constraints: ['answer>0'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_signError}}'), error: 'signError' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['Deposits add and withdrawals take away.', '{{start}} plus {{dep}} minus {{wd}} plus {{dep2}} is {{answer}}.'],
  answerSummary: { headline: 'A register runs down the entries in order.', text: 'The closing balance is $\\${{answer}}$.' },
  hint: 'Work down the entries one at a time from the opening balance.',
  feedback: 'A withdrawal lowers the balance, and the opening figure is only the starting point.',
});

ar('6.14C', 'missing-register-entry', {
  difficultyBand: 3, dok: 3, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'A register opened at $\\${{start}}$, took a deposit of $\\${{dep}}$ and one withdrawal, and closed at $\\${{end}}$. What was the withdrawal?',
  generator: {
    parameters: {
      start: { type: 'int', min: 100, max: 900, step: 10 },
      dep: { type: 'int', min: 20, max: 500, step: 10 },
      wd: { type: 'int', min: 20, max: 500, step: 10 },
    },
    derived: {
      end: 'start+dep-wd',
      answer: 'wd',
      d_signError: 'start+dep+end',
      d_partialTotal: 'abs(start-end)',
      d_forgotFinalStep: 'dep',
    },
    constraints: ['end>0'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_signError}}'), error: 'signError' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['After the deposit the balance stood at {{start}} plus {{dep}}.', 'Falling to {{end}} means {{answer}} was taken out.'],
  answerSummary: { headline: 'Work forward to the point before the unknown entry.', text: 'The withdrawal was $\\${{answer}}$.' },
  hint: 'What was the balance just after the deposit?',
  feedback: 'The deposit lands before the withdrawal, so it counts too.',
});

ar('6.14C', 'transfer-between-accounts', {
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'verbal',
  prompt: 'An account holding $\\${{a}}$ transfers $\\${{move}}$ to one holding $\\${{b}}$. How much more does the second account now hold than the first?',
  generator: {
    parameters: {
      b: { type: 'int', min: 100, max: 900, step: 20 },
      move: { type: 'int', min: 20, max: 300, step: 20 },
      gap: { type: 'int', min: 20, max: 300, step: 20 },
    },
    derived: {
      a: 'b+2*move-gap',
      newA: 'b+move-gap',
      newB: 'b+move',
      answer: 'gap',
      d_forgotFinalStep: 'abs(gap-move)',
      d_signError: 'a+b',
      d_partialTotal: 'move',
    },
    constraints: ['newA>0', 'a>move'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_signError}}'), error: 'signError' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['The first account falls to {{newA}} and the second rises to {{newB}}.', '{{newB}} minus {{newA}} is {{answer}}.'],
  answerSummary: { headline: 'A transfer moves the amount twice: out of one and into the other.', text: 'The second holds $\\${{answer}}$ more.' },
  hint: 'Both balances change, not just one.',
  feedback: 'The gap widens by twice the transfer, because one side loses what the other gains.',
});

ar('6.14C', 'overdraft-check', {
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'context',
  prompt: 'A register holds $\\${{start}}$ with $\\${{pending}}$ of payments still to clear. What is the largest whole-dollar withdrawal that keeps the balance at or above zero?',
  generator: {
    parameters: {
      start: { type: 'int', min: 200, max: 1200, step: 10 },
      pending: { type: 'int', min: 50, max: 700, step: 10 },
    },
    derived: {
      answer: 'start-pending',
      d_forgotFinalStep: 'start',
      d_signError: 'abs(start-2*pending)',
      d_partialTotal: 'pending',
    },
    constraints: ['answer>0'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_signError}}'), error: 'offByOneStep' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['The pending payments are already committed.', 'Only {{start}} minus {{pending}}, or {{answer}}, is free to withdraw.'],
  answerSummary: { headline: 'Money already committed is not available.', text: 'The largest safe withdrawal is $\\${{answer}}$.' },
  hint: 'Some of the balance is already spoken for.',
  feedback: 'The pending payments still have to clear.',
});

ar('6.14C', 'weekly-register-average', {
  difficultyBand: 3, dok: 3, taskType: 'representationTranslation', representation: 'table',
  prompt: 'A register logged the four weekly net changes shown. What was the average change per week?',
  stimulus: {
    kind: 'table',
    title: 'Net change by week',
    table: { headers: ['week', 'change'], rows: [['1', '{{w1}}'], ['2', '{{w2}}'], ['3', '{{w3}}'], ['4', '{{w4}}']] },
  },
  generator: {
    parameters: {
      mean: { type: 'int', min: 20, max: 190, step: 5 },
      s1: { type: 'int', min: -60, max: 60, step: 5 },
      s2: { type: 'int', min: -60, max: 60, step: 5 },
      s3: { type: 'int', min: -60, max: 60, step: 5 },
    },
    derived: {
      w1: 'mean+s1',
      w2: 'mean+s2',
      w3: 'mean+s3',
      w4: 'mean-s1-s2-s3',
      total: 'mean*4',
      answer: 'mean',
      d_forgotFinalStep: 'total',
      d_operationInverted: 'max(max(w1,w2),max(w3,w4))-min(min(w1,w2),min(w3,w4))',
      d_offByOneStep: 'round(total/5)',
    },
    constraints: [],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: money('{{d_offByOneStep}}'), error: 'offByOneStep' },
  ],
  reasoning: ['The four weeks total {{total}}.', 'Shared over four weeks that is {{answer}}.'],
  answerSummary: { headline: 'An average change shares the total across the weeks.', text: 'The average is $\\${{answer}}$ a week.' },
  hint: 'Total the four weeks first, including the ones that fell.',
  feedback: 'Divide by the number of weeks, not by one more or fewer.',
});

// ================================================================ 7.13A
// Sales tax and income tax on wages.

ar('7.13A', 'tax-gap-between-counties', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'A {{worker}} earning $\\${{price}}$ pays {{p}}% income tax in one bracket and {{q}}% in another. How much more tax is paid at the higher rate?',
  generator: {
    parameters: {
      worker: contextParam(['mechanic', 'driver', 'loader', 'welder', 'technician']),
      p: { type: 'choice', values: [3, 5, 7, 9, 12, 15, 18, 22] },
      q: { type: 'choice', values: [3, 5, 7, 9, 12, 15, 18, 22] },
      hundreds: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      price: 'hundreds*100',
      answer: 'price*abs(p-q)/100',
      d_partialTotal: 'price*min(p,q)/100',
      d_unitConversion: 'price*abs(p-q)/1000',
      d_signError: 'price*(p+q)/100',
    },
    constraints: ['p!=q'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_unitConversion}}'), error: 'unitConversion' },
    { label: money('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['The two rates differ by {{p}} against {{q}} percent.', 'That difference applied to {{price}} is {{answer}}.'],
  answerSummary: { headline: 'The extra tax comes from the difference in the rates.', text: 'It is $\\${{answer}}$ more.' },
  hint: 'Only the gap between the two rates matters.',
  feedback: 'The question asks for the difference, not either tax on its own.',
});

ar('7.13A', 'tax-rate-from-receipt', {
  difficultyBand: 3, dok: 3, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'A receipt shows $\\${{price}}$ before tax and $\\${{total}}$ after. What was the tax rate?',
  generator: {
    parameters: {
      p: { type: 'choice', values: [4, 5, 6, 8, 60, 70, 75, 80] },
      hundreds: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      price: 'hundreds*100',
      tax: 'price*p/100',
      total: 'price+price*p/100',
      answer: 'p',
      d_wrongPercentBase: '100-p',
      d_usedGivenValue: 'hundreds',
      d_unitConversion: 'p*10',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}\\%'), correct: true },
    { label: plain('{{d_wrongPercentBase}}\\%'), error: 'wrongPercentBase' },
    { label: plain('{{d_usedGivenValue}}\\%'), error: 'usedGivenValue' },
    { label: plain('{{d_unitConversion}}\\%'), error: 'unitConversion' },
  ],
  reasoning: ['The tax added was {{total}} minus {{price}}, or {{tax}}.', 'One percent of {{price}} is {{hundreds}}, so the rate is {{answer}}%.'],
  answerSummary: { headline: 'The rate compares the tax with the pre-tax price.', text: 'The rate was ${{answer}}\\%$.' },
  hint: 'How much tax was actually added?',
  feedback: 'Compare the tax with the price before tax, not with the total.',
});

ar('7.13A', 'take-home-after-tax-and-dues', {
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'verbal',
  prompt: 'A {{worker}} earned $\\${{gross}}$, paid {{p}}% income tax and $\\${{dues}}$ in union dues. What was left?',
  generator: {
    parameters: {
      worker: contextParam(['mechanic', 'driver', 'loader', 'welder', 'technician']),
      p: { type: 'choice', values: [10, 15, 20, 25, 30, 40] },
      hundreds: { type: 'int', min: 4, max: 30 },
      duesTens: { type: 'int', min: 2, max: 130 },
    },
    derived: {
      gross: 'hundreds*100',
      tax: 'gross*p/100',
      dues: 'duesTens*10',
      answer: 'gross-gross*p/100-duesTens*10',
      d_forgotFinalStep: 'gross-gross*p/100',
      d_offByOneStep: 'gross-gross*p/100-duesTens*20',
      d_partialTotal: 'gross*p/100+duesTens*10',
    },
    constraints: ['answer>0'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['{{p}} percent of {{gross}} is {{tax}}.', 'Taking off the tax and the {{dues}} in dues leaves {{answer}}.'],
  answerSummary: { headline: 'Both deductions come off the earnings.', text: '$\\${{answer}}$ was left.' },
  hint: 'Two amounts come off, not one.',
  feedback: 'The dues come off as well as the tax.',
});

ar('7.13A', 'which-item-carries-more-tax', {
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'Both items below are taxed at {{p}}%. How much more tax does the dearer one carry?',
  stimulus: {
    kind: 'table',
    title: 'Order',
    table: { headers: ['item', 'price'], rows: [['{{item1}}', '{{price1}}'], ['{{item2}}', '{{price2}}']] },
  },
  generator: {
    parameters: {
      item1: contextParam(['grinder', 'compressor', 'drill']),
      item2: contextParam(['hose', 'cable', 'toolbox']),
      p: { type: 'choice', values: [4, 5, 6, 8, 10, 20, 25] },
      h1: { type: 'int', min: 1, max: 14 },
      h2: { type: 'int', min: 1, max: 14 },
    },
    derived: {
      price1: 'h1*100',
      price2: 'h2*100',
      answer: 'abs(h1-h2)*100*p/100',
      d_partialTotal: 'min(h1,h2)*100*p/100',
      d_unitConversion: 'abs(h1-h2)*100*p/1000',
      d_signError: '(h1+h2)*100*p/100',
    },
    constraints: ['h1!=h2'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_unitConversion}}'), error: 'unitConversion' },
    { label: money('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['The prices differ by {{answer}} divided by {{p}} percent, that is by the gap between {{price1}} and {{price2}}.', '{{p}} percent of that gap is {{answer}}.'],
  answerSummary: { headline: 'The tax gap comes from the price gap.', text: 'It is $\\${{answer}}$ more.' },
  hint: 'The rate is the same, so only the price difference matters.',
  feedback: 'The question asks for the difference between the two taxes.',
});

ar('7.13A', 'price-before-tax', {
  difficultyBand: 3, dok: 3, taskType: 'conceptual', representation: 'context',
  prompt: 'A bill of $\\${{total}}$ covers a purchase, {{p}}% sales tax on it, and a $\\${{fee}}$ untaxed fee. What was the purchase price?',
  generator: {
    parameters: {
      p: { type: 'choice', values: [4, 5, 8, 10, 20, 25] },
      hundreds: { type: 'int', min: 2, max: 20 },
      feeTens: { type: 'int', min: 2, max: 220 },
    },
    derived: {
      price: 'hundreds*100',
      fee: 'feeTens*10',
      total: 'price+price*p/100+feeTens*10',
      answer: 'price',
      d_wrongPercentBase: 'total*p/100',
      d_partialTotal: 'feeTens*10',
      d_signError: 'total',
    },
    constraints: [],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_wrongPercentBase}}'), error: 'wrongPercentBase' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['Taking the {{fee}} fee off the bill leaves the price plus {{p}} percent of it.', 'A price of {{answer}} gives exactly that.'],
  answerSummary: { headline: 'The tax is a percent of the pre-tax price, not of the total.', text: 'The price before tax was $\\${{answer}}$.' },
  hint: 'The fee was not taxed, so take it off before working back through the tax.',
  feedback: 'Taking the percent off the total does not undo adding it to the price.',
});

// ================================================================ 7.13E
// Simple against compound interest on savings.
//
// The principal is a multiple of 1600 so that P*r*r/10000 stays a whole number
// for every rate drawn. Compound interest without a calculator only works if
// the second year's figure is exact.

const SAVINGS_RATES = { type: 'choice', values: [10, 20, 25, 50] };

ar('7.13E', 'simple-interest-earned', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'A {{worker}} put $\\${{principal}}$ into an account paying {{r}}% simple interest a year. How much interest is earned in {{years}} years?',
  generator: {
    parameters: {
      worker: contextParam(['mechanic', 'driver', 'loader', 'welder', 'technician']),
      r: SAVINGS_RATES,
      k: { type: 'int', min: 1, max: 6 },
      years: { type: 'int', min: 2, max: 9 },
    },
    derived: {
      principal: 'k*1600',
      perYear: 'k*1600*r/100',
      answer: 'k*1600*r/100*years',
      d_forgotFinalStep: 'perYear',
      d_signError: 'principal+k*1600*r/100*years',
      d_usedGivenValue: 'principal',
    },
    constraints: [],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_signError}}'), error: 'signError' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Each year pays {{r}} percent of {{principal}}, or {{perYear}}.', 'Over {{years}} years that is {{answer}}.'],
  answerSummary: { headline: 'Simple interest pays the same amount every year.', text: 'It earns $\\${{answer}}$.' },
  hint: 'Work out one year first.',
  feedback: 'The question asks for the interest, not the balance.',
});

ar('7.13E', 'simple-high-rate-versus-compound', {
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'context',
  prompt: 'One account pays {{rs}}% simple on $\\${{principal}}$; another pays {{rc}}% compounded yearly on the same amount. Over two years, how much more does the better one earn?',
  generator: {
    parameters: {
      rs: SAVINGS_RATES,
      rc: SAVINGS_RATES,
      k: { type: 'int', min: 1, max: 6 },
    },
    derived: {
      principal: 'k*1600',
      simpleEarn: 'k*1600*rs/100*2',
      compoundEarn: 'k*1600*rc/100*2+k*1600*rc*rc/10000',
      answer: 'abs(k*1600*rs/100*2-k*1600*rc/100*2-k*1600*rc*rc/10000)',
      d_partialTotal: 'min(simpleEarn,compoundEarn)',
      d_unitConversion: 'abs(k*1600*rs/1000*2-k*1600*rc/1000*2-k*1600*rc*rc/100000)',
      d_signError: 'simpleEarn+compoundEarn',
    },
    constraints: ['simpleEarn!=compoundEarn'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_unitConversion}}'), error: 'unitConversion' },
    { label: money('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['Simple at {{rs}} percent earns {{simpleEarn}} over two years.', 'Compounding at {{rc}} percent earns {{compoundEarn}}, because the second year also pays on the first year’s interest.', 'The gap is {{answer}}.'],
  answerSummary: { headline: 'A higher simple rate can still beat a lower compounded one over a short run.', text: 'The better account earns $\\${{answer}}$ more.' },
  hint: 'Work out what each account earns over the two years before comparing.',
  feedback: 'Compounding is not automatically the larger figure over two years.',
});

ar('7.13E', 'balance-after-withdrawal', {
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'table',
  prompt: 'An account compounds yearly as logged, with a withdrawal at the end of year one. What is the balance at the end of year two?',
  stimulus: {
    kind: 'table',
    title: 'Account',
    table: { headers: ['item', 'value'], rows: [['opening', '{{principal}}'], ['rate', '{{r}}%'], ['end of year 1', '{{year1}}'], ['withdrawn', '{{wd}}']] },
  },
  generator: {
    parameters: {
      r: SAVINGS_RATES,
      k: { type: 'int', min: 2, max: 6 },
      wdHundreds: { type: 'int', min: 1, max: 58 },
    },
    derived: {
      principal: 'k*1600',
      year1: 'k*1600+k*1600*r/100',
      wd: 'wdHundreds*100',
      base: 'k*1600+k*1600*r/100-wdHundreds*100',
      answer: 'base+base*r/100',
      d_forgotFinalStep: 'base',
      d_signError: 'year1+year1*r/100',
      d_partialTotal: 'principal',
    },
    constraints: ['base>0', 'answer==round(answer)'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_signError}}'), error: 'signError' },
    { label: money('{{d_partialTotal}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Year one closes at {{year1}}, and the withdrawal leaves {{base}}.', 'Year two pays {{r}} percent on {{base}}, giving {{answer}}.'],
  answerSummary: { headline: 'The second year pays interest on what is actually left.', text: 'The balance is $\\${{answer}}$.' },
  hint: 'The withdrawal happens before the second year’s interest.',
  feedback: 'Interest in year two is worked out on the balance after the withdrawal.',
});

ar('7.13E', 'years-to-reach-target-simple', {
  difficultyBand: 3, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
  prompt: 'A deposit of $\\${{principal}}$ earns $\\${{perYear}}$ in simple interest each year. How many years until the interest reaches $\\${{target}}$?',
  generator: {
    parameters: {
      // Simple interest only here, so the rate does not have to keep a squared
      // term whole; a lower range lets it cross the number of years.
      r: { type: 'choice', values: [2, 4, 5, 8, 10, 15] },
      k: { type: 'int', min: 1, max: 6 },
      years: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      principal: 'k*1600',
      perYear: 'k*1600*r/100',
      target: 'k*1600*r/100*years',
      answer: 'years',
      d_operationInverted: 'r',
      d_offByOneStep: 'years+1',
      d_partialTotal: 'round(years/2)',
    },
    constraints: ['years>2'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['Each year adds {{perYear}}.', '{{target}} divided by {{perYear}} is {{answer}} years.'],
  answerSummary: { headline: 'A fixed yearly amount divides into the target.', text: 'It takes ${{answer}}$ years.' },
  hint: 'How many yearly payments make up the target?',
  feedback: 'Divide the target by what one year earns.',
});

ar('7.13E', 'compare-two-accounts', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'table',
  prompt: 'Two deposits ran for one year as shown. How much more interest did the better one earn?',
  stimulus: {
    kind: 'table',
    title: 'Deposits',
    table: { headers: ['account', 'deposit', 'rate'], rows: [['A', '{{pA}}', '{{rA}}%'], ['B', '{{pB}}', '{{rB}}%']] },
  },
  generator: {
    parameters: {
      rA: { type: 'choice', values: [8, 10, 12, 15, 20, 25] },
      rB: { type: 'choice', values: [8, 10, 12, 15, 20, 25] },
      kA: { type: 'int', min: 2, max: 6 },
      kB: { type: 'int', min: 2, max: 6 },
    },
    derived: {
      pA: 'kA*1600',
      pB: 'kB*1600',
      intA: 'kA*1600*rA/100',
      intB: 'kB*1600*rB/100',
      answer: 'abs(kA*1600*rA/100-kB*1600*rB/100)',
      d_partialTotal: 'min(intA,intB)',
      d_signError: 'intA+intB',
      d_unitConversion: 'abs(kA*1600*rA/1000-kB*1600*rB/1000)',
    },
    constraints: ['intA!=intB'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_signError}}'), error: 'signError' },
    { label: money('{{d_unitConversion}}'), error: 'unitConversion' },
  ],
  reasoning: ['Account A earns {{intA}} and B earns {{intB}}.', 'The gap is {{answer}}.'],
  answerSummary: { headline: 'A bigger deposit does not always earn more.', text: 'It earns $\\${{answer}}$ more.' },
  hint: 'Work out each account’s interest before comparing.',
  feedback: 'Neither the deposits nor the rates compare on their own.',
});

// ================================================================ 7.13F
// Sales, rebates and coupons.

ar('7.13F', 'coupon-then-pay', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'A {{tool}} listed at $\\${{price}}$ has $\\${{coupon}}$ off. What is paid?',
  generator: {
    parameters: {
      tool: contextParam(['grinder', 'compressor', 'drill', 'generator', 'welder']),
      priceTens: { type: 'int', min: 12, max: 90 },
      couponTens: { type: 'int', min: 2, max: 60 },
    },
    derived: {
      price: 'priceTens*10',
      coupon: 'couponTens*10',
      answer: 'priceTens*10-couponTens*10',
      d_signError: 'priceTens*10+couponTens*10',
      d_partialTotal: 'couponTens*10',
      d_offByOneStep: 'priceTens*10-couponTens*20',
    },
    constraints: ['answer>0'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_signError}}'), error: 'signError' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_offByOneStep}}'), error: 'offByOneStep' },
  ],
  reasoning: ['A coupon comes off the listed price.', '{{price}} minus {{coupon}} is {{answer}}.'],
  answerSummary: { headline: 'A coupon lowers what is paid.', text: '$\\${{answer}}$ is paid.' },
  hint: 'The coupon reduces the amount handed over.',
  feedback: 'The coupon is the discount, not the price.',
});

ar('7.13F', 'percent-off-versus-coupon', {
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'verbal',
  prompt: 'A {{tool}} costs $\\${{price}}$. One shop takes {{p}}% off, another takes $\\${{coupon}}$ off. How much better is the stronger offer?',
  generator: {
    parameters: {
      tool: contextParam(['grinder', 'compressor', 'drill', 'generator', 'welder']),
      p: { type: 'choice', values: [10, 20, 25, 40, 50] },
      hundreds: { type: 'int', min: 2, max: 14 },
      couponTens: { type: 'int', min: 2, max: 60 },
    },
    derived: {
      price: 'hundreds*100',
      percentOff: 'hundreds*100*p/100',
      coupon: 'couponTens*10',
      answer: 'abs(hundreds*100*p/100-couponTens*10)',
      d_partialTotal: 'min(percentOff,coupon)',
      d_signError: 'percentOff+coupon',
      d_unitConversion: 'abs(hundreds*100*p/1000-couponTens)',
    },
    constraints: ['percentOff!=coupon'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_signError}}'), error: 'signError' },
    { label: money('{{d_unitConversion}}'), error: 'unitConversion' },
  ],
  reasoning: ['{{p}} percent of {{price}} is {{percentOff}}.', 'Against a {{coupon}} coupon the gap is {{answer}}.'],
  answerSummary: { headline: 'A percent off and an amount off compare only as amounts.', text: 'The stronger offer saves $\\${{answer}}$ more.' },
  hint: 'Turn the percent into money before comparing.',
  feedback: 'The question asks for the difference between the two savings.',
});

ar('7.13F', 'rebate-after-purchase', {
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'Two {{tool}}s at $\\${{price}}$ each carry a $\\${{rebate}}$ rebate apiece. What is the final cost for both?',
  generator: {
    parameters: {
      tool: contextParam(['grinder', 'compressor', 'drill', 'generator', 'welder']),
      priceTens: { type: 'int', min: 12, max: 90 },
      rebateTens: { type: 'int', min: 2, max: 60 },
    },
    derived: {
      price: 'priceTens*10',
      rebate: 'rebateTens*10',
      answer: 'priceTens*20-rebateTens*20',
      d_forgotFinalStep: 'priceTens*20',
      d_partialTotal: 'priceTens*10-rebateTens*10',
      d_signError: 'rebateTens*20',
    },
    constraints: ['answer>0'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['Two at {{price}} come to {{d_forgotFinalStep}}.', 'Two rebates of {{rebate}} take off {{d_signError}} in all, leaving {{answer}}.'],
  answerSummary: { headline: 'A rebate per item applies to every item bought.', text: 'The final cost is $\\${{answer}}$.' },
  hint: 'Both units carry a rebate.',
  feedback: 'The rebate applies once per item, not once per order.',
});

ar('7.13F', 'stacked-sale-and-coupon', {
  difficultyBand: 3, dok: 3, taskType: 'conceptual', representation: 'verbal',
  prompt: 'A {{tool}} at $\\${{price}}$ is cut by {{p}}%, and then $\\${{coupon}}$ comes off the sale price. What is paid?',
  generator: {
    parameters: {
      tool: contextParam(['grinder', 'compressor', 'drill', 'generator', 'welder']),
      p: { type: 'choice', values: [10, 20, 25, 40, 50] },
      hundreds: { type: 'int', min: 3, max: 16 },
      couponTens: { type: 'int', min: 2, max: 50 },
    },
    derived: {
      price: 'hundreds*100',
      sale: 'hundreds*100-hundreds*100*p/100',
      coupon: 'couponTens*10',
      answer: 'hundreds*100-hundreds*100*p/100-couponTens*10',
      d_offByOneStep: 'hundreds*100-hundreds*100*p/100-couponTens*20',
      d_partialTotal: 'hundreds*100*p/100+couponTens*10',
      d_signError: 'hundreds*100-hundreds*100*p/100+couponTens*10',
    },
    constraints: ['answer>0'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['The sale takes {{price}} down to {{sale}}.', 'The coupon then takes off {{coupon}}, leaving {{answer}}.'],
  answerSummary: { headline: 'Each reduction applies to what the one before it left.', text: '$\\${{answer}}$ is paid.' },
  hint: 'Handle the two reductions in the order given.',
  feedback: 'The coupon comes off the sale price, not the original.',
});

ar('7.13F', 'best-saving-of-three', {
  difficultyBand: 3, dok: 3, taskType: 'representationTranslation', representation: 'table',
  prompt: 'Three offers on the same $\\${{price}}$ {{tool}} are listed. How much does the best offer save?',
  stimulus: {
    kind: 'table',
    title: 'Offers',
    table: { headers: ['offer', 'terms'], rows: [['A', '{{pA}}% off'], ['B', '$\\${{couponB}}$ off'], ['C', '{{pC}}% off']] },
  },
  generator: {
    parameters: {
      tool: contextParam(['grinder', 'compressor', 'drill', 'generator', 'welder']),
      pA: { type: 'choice', values: [10, 20, 25, 40, 50] },
      pC: { type: 'choice', values: [10, 20, 25, 40, 50] },
      hundreds: { type: 'int', min: 3, max: 16 },
      couponTens: { type: 'int', min: 5, max: 80 },
    },
    derived: {
      price: 'hundreds*100',
      cutA: 'hundreds*100*pA/100',
      couponB: 'couponTens*10',
      cutC: 'hundreds*100*pC/100',
      answer: 'max(max(hundreds*100*pA/100,couponTens*10),hundreds*100*pC/100)',
      d_partialTotal: 'min(min(cutA,couponB),cutC)',
      d_signError: 'cutA+couponB+cutC',
      d_forgotFinalStep: 'price-max(max(cutA,couponB),cutC)',
    },
    constraints: ['cutA!=couponB', 'couponB!=cutC', 'cutA!=cutC', 'couponB<price'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_signError}}'), error: 'signError' },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['The three offers take off {{cutA}}, {{couponB}} and {{cutC}}.', 'The largest saving is {{answer}}.'],
  answerSummary: { headline: 'Percent offers and coupon offers rank only once both are amounts of money.', text: 'The best offer saves $\\${{answer}}$.' },
  hint: 'Work out what each offer takes off in money.',
  feedback: 'The question asks what is saved, not what is paid.',
});

// ================================================================ 8.12A
// How the rate and the term change what credit costs.

ar('8.12A', 'rate-difference-on-one-loan', {
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'context',
  prompt: 'A $\\${{principal}}$ loan runs {{years}} years. At {{r1}}% simple interest instead of {{r2}}%, how much more interest is paid?',
  generator: {
    parameters: {
      hundreds: { type: 'int', min: 5, max: 40 },
      r1: { type: 'choice', values: [4, 6, 8, 10, 12, 15, 18, 22] },
      r2: { type: 'choice', values: [4, 6, 8, 10, 12, 15, 18, 22] },
      years: { type: 'int', min: 2, max: 8 },
    },
    derived: {
      principal: 'hundreds*100',
      int1: 'hundreds*100*r1/100*years',
      int2: 'hundreds*100*r2/100*years',
      answer: 'abs(hundreds*100*r1/100*years-hundreds*100*r2/100*years)',
      d_partialTotal: 'min(int1,int2)',
      d_signError: 'int1+int2',
      d_unitConversion: 'abs(hundreds*10*r1/100*years-hundreds*10*r2/100*years)',
    },
    constraints: ['r1!=r2'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_signError}}'), error: 'signError' },
    { label: money('{{d_unitConversion}}'), error: 'unitConversion' },
  ],
  reasoning: ['At {{r1}} percent the interest is {{int1}}; at {{r2}} percent it is {{int2}}.', 'The gap is {{answer}}.'],
  answerSummary: { headline: 'Only the difference in the rates changes the cost.', text: 'It costs $\\${{answer}}$ more.' },
  hint: 'Work out the interest under each rate before comparing.',
  feedback: 'The question asks for the difference, not either total.',
});

ar('8.12A', 'term-difference-on-one-loan', {
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'context',
  prompt: 'A $\\${{principal}}$ loan at {{r}}% simple interest runs {{y1}} years instead of {{y2}}. How much more interest is paid?',
  generator: {
    parameters: {
      hundreds: { type: 'int', min: 5, max: 40 },
      r: { type: 'choice', values: [4, 6, 8, 10, 12, 15] },
      y1: { type: 'int', min: 2, max: 12 },
      y2: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      principal: 'hundreds*100',
      perYear: 'hundreds*100*r/100',
      answer: 'hundreds*100*r/100*abs(y1-y2)',
      d_partialTotal: 'perYear*min(y1,y2)',
      d_signError: 'perYear*(y1+y2)',
      d_forgotFinalStep: 'perYear',
    },
    constraints: ['y1!=y2'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_signError}}'), error: 'signError' },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['Each year costs {{perYear}} in interest.', 'The extra {{answer}} covers the difference of {{y1}} against {{y2}} years.'],
  answerSummary: { headline: 'A longer term costs one year’s interest for every extra year.', text: 'It costs $\\${{answer}}$ more.' },
  hint: 'How many extra years is it, and what does one year cost?',
  feedback: 'Only the extra years add cost, not the whole term.',
});

ar('8.12A', 'interest-on-simple-loan', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'verbal',
  prompt: 'A {{worker}} borrows $\\${{principal}}$ at {{r}}% simple interest for {{years}} years. How much interest is owed?',
  generator: {
    parameters: {
      worker: contextParam(['mechanic', 'driver', 'loader', 'welder', 'technician']),
      hundreds: { type: 'int', min: 5, max: 40 },
      r: { type: 'choice', values: [6, 8, 10, 12, 15, 20, 25] },
      years: { type: 'int', min: 2, max: 14 },
    },
    derived: {
      principal: 'hundreds*100',
      perYear: 'hundreds*100*r/100',
      answer: 'hundreds*100*r/100*years',
      d_forgotFinalStep: 'perYear',
      d_signError: 'principal+hundreds*100*r/100*years',
      d_usedGivenValue: 'principal',
    },
    constraints: [],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_signError}}'), error: 'signError' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['One year costs {{r}} percent of {{principal}}, or {{perYear}}.', '{{years}} years cost {{answer}}.'],
  answerSummary: { headline: 'Simple interest charges the same amount every year.', text: '$\\${{answer}}$ of interest is owed.' },
  hint: 'Work out one year first.',
  feedback: 'The question asks for the interest, not what is repaid in total.',
});

ar('8.12A', 'monthly-payment-from-total', {
  difficultyBand: 2, dok: 2, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'A loan is repaid in {{months}} equal monthly payments totalling $\\${{total}}$. What is each payment?',
  generator: {
    parameters: {
      payment: { type: 'int', min: 10, max: 60, step: 5 },
      months: { type: 'int', min: 6, max: 66, step: 6 },
    },
    derived: {
      total: 'payment*months',
      answer: 'payment',
      d_operationInverted: 'months',
      d_signError: 'total',
      d_offByOneStep: 'round(total/(months+6))',
    },
    constraints: [],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: money('{{d_signError}}'), error: 'signError' },
    { label: money('{{d_offByOneStep}}'), error: 'offByOneStep' },
  ],
  reasoning: ['Equal payments each carry the same share of the total.', '{{total}} shared over {{months}} payments is {{answer}} each.'],
  answerSummary: { headline: 'Equal payments divide the total by their number.', text: 'Each payment is $\\${{answer}}$.' },
  hint: 'How many equal shares is the total split into?',
  feedback: 'Check which number counts months and which counts dollars.',
});

ar('8.12A', 'cheaper-of-two-loans', {
  difficultyBand: 3, dok: 3, taskType: 'errorAnalysis', representation: 'table',
  prompt: 'Two loans of $\\${{principal}}$ are offered as shown. How much less interest does the cheaper one cost?',
  stimulus: {
    kind: 'table',
    title: 'Loan offers',
    table: { headers: ['loan', 'rate', 'years'], rows: [['A', '{{rA}}%', '{{yA}}'], ['B', '{{rB}}%', '{{yB}}']] },
  },
  generator: {
    parameters: {
      hundreds: { type: 'int', min: 5, max: 40 },
      rA: { type: 'choice', values: [4, 6, 8, 10, 12, 15] },
      rB: { type: 'choice', values: [4, 6, 8, 10, 12, 15] },
      yA: { type: 'int', min: 2, max: 8 },
      yB: { type: 'int', min: 2, max: 8 },
    },
    derived: {
      principal: 'hundreds*100',
      intA: 'hundreds*100*rA/100*yA',
      intB: 'hundreds*100*rB/100*yB',
      answer: 'abs(hundreds*100*rA/100*yA-hundreds*100*rB/100*yB)',
      d_partialTotal: 'min(intA,intB)',
      d_signError: 'intA+intB',
      d_unitConversion: 'abs(hundreds*10*rA/100*yA-hundreds*10*rB/100*yB)',
    },
    constraints: ['intA!=intB'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_signError}}'), error: 'signError' },
    { label: money('{{d_unitConversion}}'), error: 'unitConversion' },
  ],
  reasoning: ['Loan A costs {{intA}} in interest and loan B costs {{intB}}.', 'The gap is {{answer}}.'],
  answerSummary: { headline: 'A lower rate over a longer term is not automatically cheaper.', text: 'The cheaper loan saves $\\${{answer}}$.' },
  hint: 'Neither the rate nor the term decides it alone.',
  feedback: 'Work out the total interest for each loan before comparing.',
});

// ================================================================ 8.12B
// The total cost of repaying a loan.

ar('8.12B', 'total-repaid-simple-loan', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'A $\\${{principal}}$ loan at {{r}}% simple interest runs {{years}} years. What is repaid in total?',
  generator: {
    parameters: {
      hundreds: { type: 'int', min: 5, max: 40 },
      r: { type: 'choice', values: [6, 8, 10, 12, 15, 20, 25] },
      years: { type: 'int', min: 2, max: 14 },
    },
    derived: {
      principal: 'hundreds*100',
      interest: 'hundreds*100*r/100*years',
      answer: 'hundreds*100+hundreds*100*r/100*years',
      d_forgotFinalStep: 'interest',
      d_signError: 'hundreds*200+hundreds*100*r/100*years',
      d_partialTotal: 'hundreds*100*r/100*years*2',
    },
    constraints: [],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_signError}}'), error: 'signError' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['The interest comes to {{interest}}.', 'Repaying the {{principal}} borrowed as well makes {{answer}}.'],
  answerSummary: { headline: 'Repaying a loan returns the amount borrowed plus the interest.', text: '$\\${{answer}}$ is repaid.' },
  hint: 'The borrowed amount has to come back too.',
  feedback: 'The interest alone is not the total repaid.',
});

ar('8.12B', 'total-from-monthly-payments', {
  difficultyBand: 2, dok: 2, taskType: 'application', representation: 'verbal',
  prompt: 'A loan is repaid at $\\${{payment}}$ a month for {{months}} months. How much more than the $\\${{principal}}$ borrowed is repaid?',
  generator: {
    parameters: {
      payment: { type: 'int', min: 40, max: 600, step: 10 },
      months: { type: 'int', min: 6, max: 48, step: 6 },
      extraHundreds: { type: 'int', min: 1, max: 5 },
    },
    derived: {
      total: 'payment*months',
      principal: 'payment*months-extraHundreds*100',
      answer: 'extraHundreds*100',
      d_forgotFinalStep: 'total',
      d_unitConversion: 'extraHundreds*10',
      d_operationInverted: 'payment',
    },
    constraints: ['principal>0'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_unitConversion}}'), error: 'unitConversion' },
    { label: money('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['{{months}} payments of {{payment}} come to {{total}}.', 'That is {{answer}} more than the {{principal}} borrowed.'],
  answerSummary: { headline: 'The extra paid is the difference between the payments and the loan.', text: '$\\${{answer}}$ more is repaid.' },
  hint: 'Total the payments first.',
  feedback: 'The question asks for the extra, not the total.',
});

ar('8.12B', 'card-balance-after-payment', {
  difficultyBand: 3, dok: 3, taskType: 'conceptual', representation: 'context',
  prompt: 'A card balance of $\\${{balance}}$ is charged {{r}}% interest for the month, then a payment of $\\${{payment}}$ is made. What is owed?',
  generator: {
    parameters: {
      balanceHundreds: { type: 'int', min: 3, max: 30 },
      r: { type: 'choice', values: [2, 4, 5, 10, 20, 25] },
      payment: { type: 'int', min: 100, max: 2300, step: 20 },
    },
    derived: {
      balance: 'balanceHundreds*100',
      charge: 'balanceHundreds*100*r/100',
      answer: 'balanceHundreds*100+balanceHundreds*100*r/100-payment',
      d_forgotFinalStep: 'balanceHundreds*100+balanceHundreds*100*r/100',
      d_signError: 'balanceHundreds*100-balanceHundreds*100*r/100-payment',
      d_partialTotal: 'payment',
    },
    constraints: ['answer>0'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_signError}}'), error: 'signError' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
  ],
  reasoning: ['The interest adds {{charge}}, taking the balance to {{d_forgotFinalStep}}.', 'The payment of {{payment}} leaves {{answer}}.'],
  answerSummary: { headline: 'Interest is charged before the payment is credited.', text: '$\\${{answer}}$ is owed.' },
  hint: 'The charge lands first, then the payment.',
  feedback: 'Interest raises the balance before anything is paid off.',
});

ar('8.12B', 'cost-of-two-repayment-plans', {
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'Two repayment plans for the same loan are shown. How much less does the cheaper plan cost in total?',
  stimulus: {
    kind: 'table',
    title: 'Plans',
    table: { headers: ['plan', 'monthly', 'months'], rows: [['A', '{{payA}}', '{{monA}}'], ['B', '{{payB}}', '{{monB}}']] },
  },
  generator: {
    parameters: {
      payA: { type: 'int', min: 40, max: 300, step: 10 },
      payB: { type: 'int', min: 40, max: 300, step: 10 },
      monA: { type: 'int', min: 6, max: 42, step: 6 },
      monB: { type: 'int', min: 6, max: 42, step: 6 },
    },
    derived: {
      totalA: 'payA*monA',
      totalB: 'payB*monB',
      answer: 'abs(payA*monA-payB*monB)',
      d_partialTotal: 'min(totalA,totalB)',
      d_signError: 'totalA+totalB',
      d_operationInverted: 'abs(payA-payB)',
    },
    constraints: ['totalA!=totalB'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_signError}}'), error: 'signError' },
    { label: money('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['Plan A costs {{totalA}} and plan B costs {{totalB}}.', 'The gap is {{answer}}.'],
  answerSummary: { headline: 'A smaller monthly payment can still cost more overall.', text: 'The cheaper plan saves $\\${{answer}}$.' },
  hint: 'Neither the payment nor the length settles it alone.',
  feedback: 'Total each plan before comparing.',
});

ar('8.12B', 'months-to-clear-balance', {
  difficultyBand: 3, dok: 2, taskType: 'representationTranslation', representation: 'verbal',
  prompt: 'A balance of $\\${{balance}}$ with no further interest is cleared at $\\${{payment}}$ a month. How many months does that take?',
  generator: {
    parameters: {
      payment: { type: 'int', min: 10, max: 60, step: 5 },
      months: { type: 'int', min: 4, max: 60 },
    },
    derived: {
      balance: 'payment*months',
      answer: 'months',
      d_operationInverted: 'payment',
      d_signError: 'balance',
      d_offByOneStep: 'round(balance/(payment+15))',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
  ],
  reasoning: ['Each month clears {{payment}}.', '{{balance}} divided by {{payment}} is {{answer}} months.'],
  answerSummary: { headline: 'A fixed payment divides into the balance.', text: 'It takes ${{answer}}$ months.' },
  hint: 'How many payments does the balance hold?',
  feedback: 'The answer counts months, not dollars.',
});

// ================================================================ 7.4D
// Percent increase and decrease, including multi-step.

// Factors of 1600 keep a second percent step whole: 1600 times 0.9 times 0.8
// is 1152, and every pairing of these rates lands on a whole number.
const STEP_RATES = { type: 'choice', values: [10, 20, 25, 40, 50] };

ar('7.4D', 'value-lost-this-year', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'A {{tool}} worth $\\${{value}}$ loses {{p}}% this year and is expected to lose {{q}}% of its original value next year. How much is lost this year?',
  generator: {
    parameters: {
      tool: contextParam(['grinder', 'compressor', 'drill', 'generator', 'welder']),
      p: { type: 'choice', values: [5, 10, 15, 20, 25, 30, 40] },
      q: { type: 'choice', values: [5, 10, 15, 20, 25, 30, 40] },
      hundreds: { type: 'int', min: 3, max: 30 },
    },
    derived: {
      value: 'hundreds*100',
      answer: 'hundreds*100*p/100',
      d_wrongPercentBase: 'hundreds*100*q/100',
      d_signError: 'hundreds*100-hundreds*100*p/100',
      d_unitConversion: 'hundreds*100*p/1000',
    },
    constraints: ['p!=q'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_wrongPercentBase}}'), error: 'wrongPercentBase' },
    { label: money('{{d_signError}}'), error: 'signError' },
    { label: money('{{d_unitConversion}}'), error: 'unitConversion' },
  ],
  reasoning: ['One percent of {{value}} is {{hundreds}}.', 'This year loses {{p}} of those, or {{answer}}.'],
  answerSummary: { headline: 'Read which year the question is asking about.', text: '$\\${{answer}}$ is lost this year.' },
  hint: 'Only one of the two percents applies to the question asked.',
  feedback: 'The question asks about this year, not next year or what is left.',
});

ar('7.4D', 'value-after-two-decreases', {
  difficultyBand: 3, dok: 3, taskType: 'application', representation: 'context',
  prompt: 'A {{tool}} worth $\\${{value}}$ falls {{p}}% in one year and {{q}}% of its new value the next. What is it worth then?',
  generator: {
    parameters: {
      tool: contextParam(['grinder', 'compressor', 'drill', 'generator', 'welder']),
      p: STEP_RATES,
      q: STEP_RATES,
      k: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      value: 'k*1600',
      afterOne: 'k*1600*(100-p)/100',
      answer: 'k*1600*(100-p)/100*(100-q)/100',
      d_wrongPercentBase: 'k*1600*(100-p-q)/100',
      d_forgotFinalStep: 'afterOne',
      d_signError: 'k*1600-k*1600*(100-p)/100*(100-q)/100',
    },
    constraints: ['d_wrongPercentBase>0'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_wrongPercentBase}}'), error: 'wrongPercentBase' },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['The first fall leaves {{afterOne}}.', 'The second fall takes {{q}} percent of {{afterOne}}, leaving {{answer}}.'],
  answerSummary: { headline: 'The second fall works on what the first one left.', text: 'It is worth $\\${{answer}}$.' },
  hint: 'The second percent applies to the reduced value, not the original.',
  feedback: 'Two percent falls do not add together.',
});

ar('7.4D', 'original-before-increase', {
  difficultyBand: 3, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
  prompt: 'After rising {{p}}%, a charge stands at $\\${{after}}$. What was it before?',
  generator: {
    parameters: {
      p: { type: 'choice', values: [10, 20, 25, 40, 60, 75, 80] },
      hundreds: { type: 'int', min: 3, max: 30 },
    },
    derived: {
      answer: 'hundreds*100',
      after: 'hundreds*100+hundreds*100*p/100',
      rise: 'hundreds*100*p/100',
      d_wrongPercentBase: 'after-after*p/100',
      d_signError: 'after',
      d_offByOneStep: 'rise*2',
    },
    constraints: [],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_wrongPercentBase}}'), error: 'wrongPercentBase' },
    { label: money('{{d_signError}}'), error: 'signError' },
    { label: money('{{d_offByOneStep}}'), error: 'offByOneStep' },
  ],
  reasoning: ['{{after}} is the old charge plus {{p}} percent of it.', 'A charge of {{answer}} rises by {{rise}} to give exactly {{after}}.'],
  answerSummary: { headline: 'The percent was taken from the old figure, not the new one.', text: 'It was $\\${{answer}}$.' },
  hint: 'The rise was worked out from the smaller amount.',
  feedback: 'Taking the same percent off the new figure does not undo the rise.',
});

ar('7.4D', 'percent-change-from-two-values', {
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'context',
  prompt: 'Output rose from {{before}} to {{after}} {{item}}. What was the percent increase?',
  generator: {
    parameters: {
      item: GOODS,
      p: { type: 'choice', values: [10, 20, 25, 40, 50, 60, 75, 80] },
      hundreds: { type: 'int', min: 2, max: 90 },
    },
    derived: {
      before: 'hundreds*100',
      rise: 'hundreds*100*p/100',
      after: 'hundreds*100+hundreds*100*p/100',
      answer: 'p',
      d_wrongPercentBase: 'round(rise*100/(hundreds*100+rise))',
      d_usedGivenValue: 'hundreds',
      d_unitConversion: 'p*10',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}\\%'), correct: true },
    { label: plain('{{d_wrongPercentBase}}\\%'), error: 'wrongPercentBase' },
    { label: plain('{{d_usedGivenValue}}\\%'), error: 'usedGivenValue' },
    { label: plain('{{d_unitConversion}}\\%'), error: 'unitConversion' },
  ],
  reasoning: ['Output rose by {{rise}}.', 'Against the starting {{before}} that is {{answer}} percent.'],
  answerSummary: { headline: 'A percent increase compares the rise with the starting figure.', text: 'It rose ${{answer}}\\%$.' },
  hint: 'Compare the rise with where output started.',
  feedback: 'The rise is measured against the original, not the new total.',
});

ar('7.4D', 'markup-then-discount', {
  difficultyBand: 3, dok: 3, taskType: 'representationTranslation', representation: 'table',
  prompt: 'A {{tool}} is priced through the two steps shown. What is the final price?',
  stimulus: {
    kind: 'table',
    title: 'Pricing',
    table: { headers: ['step', 'change'], rows: [['cost', '$\\${{cost}}$'], ['markup', '{{p}}%'], ['sale', '{{q}}% off']] },
  },
  generator: {
    parameters: {
      tool: contextParam(['grinder', 'compressor', 'drill', 'generator', 'welder']),
      p: { type: 'choice', values: [10, 20, 25, 50, 75, 100] },
      q: STEP_RATES,
      k: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      cost: 'k*1600',
      marked: 'k*1600*(100+p)/100',
      answer: 'k*1600*(100+p)/100*(100-q)/100',
      d_wrongPercentBase: 'k*1600*(100-q)/100',
      d_forgotFinalStep: 'marked',
      d_unitConversion: 'k*1600',
    },
    constraints: [],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_wrongPercentBase}}'), error: 'wrongPercentBase' },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_unitConversion}}'), error: 'unitConversion' },
  ],
  reasoning: ['The markup takes {{cost}} to {{marked}}.', 'The sale takes {{q}} percent off {{marked}}, leaving {{answer}}.'],
  answerSummary: { headline: 'Each step works on the price the step before it produced.', text: 'The final price is $\\${{answer}}$.' },
  hint: 'The discount applies to the marked-up price, not to the cost.',
  feedback: 'A markup and a discount of the same size do not cancel out.',
});

// ================================================================ 7.4E
// Converting between measurement systems. The factor is always stated, as it
// is on the test, so the work is the reasoning and not a memorised constant.

ar('7.4E', 'mixed-units-route-total', {
  difficultyBand: 2, dok: 2, taskType: 'procedural', representation: 'context',
  prompt: 'Using 1 mile = 1.6 kilometres, a route runs {{miles}} miles then {{extra}} kilometres. How many kilometres is the whole route?',
  generator: {
    parameters: {
      fives: { type: 'int', min: 2, max: 40 },
      extra: { type: 'int', min: 4, max: 200, step: 4 },
    },
    derived: {
      miles: 'fives*5',
      converted: 'fives*8',
      answer: 'fives*8+extra',
      d_forgotFinalStep: 'converted',
      d_convertedWrongWay: 'fives*5+extra*8/5',
      d_unitConversion: '(fives*5+extra)*8/5',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_convertedWrongWay}}'), error: 'convertedWrongWay' },
    { label: plain('{{d_unitConversion}}'), error: 'unitConversion' },
  ],
  reasoning: ['{{miles}} miles is {{converted}} kilometres.', 'Adding the {{extra}} kilometres already given makes {{answer}}.'],
  answerSummary: { headline: 'Only the leg in miles needs converting.', text: 'The route is ${{answer}}$ kilometres.' },
  hint: 'One leg is already in the unit the question wants.',
  feedback: 'Converting the whole route treats the kilometre leg as miles.',
});

ar('7.4E', 'kilograms-to-pounds-total', {
  difficultyBand: 3, dok: 2, taskType: 'application', representation: 'verbal',
  prompt: 'Using 1 kilogram = 2.2 pounds, what do {{crates}} crates of {{kg}} kilograms each weigh in pounds, on a {{pallet}}-pound pallet?',
  generator: {
    parameters: {
      fives: { type: 'int', min: 2, max: 20 },
      crates: { type: 'int', min: 2, max: 12 },
      pallet: { type: 'int', min: 20, max: 300, step: 10 },
    },
    derived: {
      kg: 'fives*5',
      perCrate: 'fives*11',
      answer: 'fives*11*crates+pallet',
      d_forgotFinalStep: 'fives*11*crates',
      d_offByOneStep: 'fives*11*(crates+1)+pallet',
      d_operationInverted: 'pallet*crates',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
  ],
  reasoning: ['One crate is {{kg}} times 2.2, or {{perCrate}} pounds.', '{{crates}} crates plus the {{pallet}}-pound pallet weigh {{answer}}.'],
  answerSummary: { headline: 'Convert once, then scale to the number of crates.', text: 'They weigh ${{answer}}$ pounds.' },
  hint: 'Convert one crate before counting them all, and the pallet is already in pounds.',
  feedback: 'Every crate has to be converted, and the pallet counts too.',
});

ar('7.4E', 'drums-from-a-tank', {
  difficultyBand: 3, dok: 2, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'Using 1 gallon = 4 litres, how many {{size}}-gallon drums does a {{litres}}-litre tank fill?',
  generator: {
    parameters: {
      size: { type: 'int', min: 3, max: 25 },
      drums: { type: 'int', min: 3, max: 25 },
    },
    derived: {
      gallons: 'size*drums',
      litres: 'size*drums*4',
      answer: 'drums',
      d_convertedWrongWay: 'round(litres/(size*16))',
      d_usedGivenValue: 'size',
      d_unitConversion: 'gallons',
    },
    constraints: ['size!=drums'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_convertedWrongWay}}'), error: 'convertedWrongWay' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
    { label: plain('{{d_unitConversion}}'), error: 'unitConversion' },
  ],
  reasoning: ['{{litres}} litres is {{gallons}} gallons.', '{{gallons}} shared into {{size}}-gallon drums fills {{answer}}.'],
  answerSummary: { headline: 'Convert to the drum’s unit, then share it out.', text: 'It fills ${{answer}}$ drums.' },
  hint: 'The tank is measured in litres but the drums in gallons.',
  feedback: 'Convert first, then divide by the drum size.',
});

ar('7.4E', 'compare-across-systems', {
  difficultyBand: 3, dok: 3, taskType: 'interpretation', representation: 'verbal',
  prompt: 'Using 1 kilogram = 2.2 pounds, how many pounds heavier is a {{kg}}-kilogram load than a {{lb}}-pound one?',
  generator: {
    parameters: {
      fives: { type: 'int', min: 4, max: 30 },
      lbTens: { type: 'int', min: 2, max: 30 },
    },
    derived: {
      kg: 'fives*5',
      kgInLb: 'fives*11',
      lb: 'lbTens*10',
      answer: 'fives*11-lbTens*10',
      d_convertedWrongWay: 'abs(fives*5-lbTens*10)',
      d_partialTotal: 'lb',
      d_signError: 'fives*11+lbTens*10',
    },
    constraints: ['answer>0'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_convertedWrongWay}}'), error: 'convertedWrongWay' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_signError}}'), error: 'signError' },
  ],
  reasoning: ['{{kg}} kilograms is {{kgInLb}} pounds.', '{{kgInLb}} minus {{lb}} is {{answer}}.'],
  answerSummary: { headline: 'Two systems only compare once both are in one unit.', text: 'It is ${{answer}}$ pounds heavier.' },
  hint: 'Put both loads into the same unit first.',
  feedback: 'The two figures are in different units as given.',
});

ar('7.4E', 'batches-from-kilograms', {
  difficultyBand: 2, dok: 2, taskType: 'representationTranslation', representation: 'table',
  prompt: 'Each batch needs {{grams}} grams of {{mat}}. Using the table, how many full batches come from {{kg}} kilograms?',
  stimulus: {
    kind: 'table',
    title: 'Conversion',
    table: { headers: ['kilograms', 'grams'], rows: [['1', '1000'], ['{{kg}}', '{{totalGrams}}']] },
  },
  generator: {
    parameters: {
      mat: contextParam(['resin', 'filler', 'binder', 'powder', 'compound']),
      grams: { type: 'choice', values: [100, 125, 200, 250, 400, 500] },
      kg: { type: 'int', min: 2, max: 90 },
    },
    derived: {
      totalGrams: 'kg*1000',
      answer: 'kg*1000/grams',
      d_forgotFinalStep: 'totalGrams',
      d_convertedWrongWay: 'kg',
      d_unitConversion: 'grams',
    },
    constraints: [],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_convertedWrongWay}}'), error: 'convertedWrongWay' },
    { label: plain('{{d_unitConversion}}'), error: 'unitConversion' },
  ],
  reasoning: ['{{kg}} kilograms is {{totalGrams}} grams.', '{{totalGrams}} divided by {{grams}} is {{answer}} batches.'],
  answerSummary: { headline: 'Convert to the unit the recipe uses, then share it out.', text: 'It makes ${{answer}}$ batches.' },
  hint: 'The stock and the recipe are in different units.',
  feedback: 'Convert the kilograms to grams before dividing.',
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
