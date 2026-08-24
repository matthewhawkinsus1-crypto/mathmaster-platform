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

// ---------------------------------------------------------------- emit
const seen = new Set();
for (const item of ITEMS) {
  if (seen.has(item.id)) throw new Error(`Duplicate ASVAB id: ${item.id}`);
  seen.add(item.id);
}
assertStandardVariety(ITEMS);
writeFileSync(new URL('../drafts/asvab-ar.json', import.meta.url), `${JSON.stringify({ documents: ITEMS }, null, 1)}\n`);
console.log(`Arithmetic Reasoning: ${ITEMS.length} families across ${new Set(ITEMS.map((i) => i.assessedConstruct)).size} standards.`);
