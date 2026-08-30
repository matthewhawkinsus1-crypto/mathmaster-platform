#!/usr/bin/env node
// ASVAB Arithmetic Reasoning — tier-2 challenge bank.
//
// Three authored families per standard, and they are authored, not derived. The
// tier this replaces took each direct family, prefixed "Without using a
// calculator, a test taker chose X. Rework the mathematics and select the
// correct ASVAB answer.", and built its distractors as key + 1, + 2, + 3. That
// made the key the smallest of four in 287 of 438 families and left 18 prompts
// with unbalanced math delimiters where the wrapper's closing `$` met a currency
// amount. None of it is reused here.
//
// The three families for a standard are three different escalations:
//
//   SYNTHESIS   two linked quantities, the first feeding the second, so the
//               order of work has to be planned rather than read off.
//   INVERSE     the outcome is given and an input has to be recovered.
//   JUDGEMENT   several candidates or a threshold, so the student compares and
//               decides. Usually DOK 3.
//
// Register is unchanged from the direct tier: practical prose, under 48 words
// and three sentences, no prompt naming the operation to run. Harder means more
// to work out, not more to read.

import { writeFileSync } from 'node:fs';
import { AR, asvabChallengeItem, assertChallengeVariety, contextParam, money, plain } from './lib/asvabAuthoring.mjs';

const ITEMS = [];
const arc = (code, slug, spec) => {
  ITEMS.push(asvabChallengeItem({ code, slug, domain: AR, courseId: spec.courseId || 'grade6', ...spec }));
};

const VEHICLES = contextParam(['delivery van', 'service truck', 'shuttle bus', 'work van', 'pickup']);
const WORKERS = contextParam(['crew', 'shift', 'team', 'work detail']);
const GOODS = contextParam(['filters', 'bolts', 'cartons', 'panels', 'crates', 'brackets']);
const SHOPS = contextParam(['hardware store', 'supply depot', 'warehouse outlet', 'parts counter']);
const MACHINES = contextParam(['press', 'labeler', 'sorter', 'stamping machine', 'conveyor']);

// ================================================================ 6.4B
// Prediction and comparison with ratios and rates.
//
// The distractor recipe every family in this file follows, from the kit header:
// one error that always OVERSHOOTS the key, one that always UNDERSHOOTS it, and
// one that is a different real quantity drawn INDEPENDENTLY so it lands on
// either side as the parameters move. The first two mean the key is never the
// smallest or largest of four; the third moves it between the middle ranks.

arc('6.4B', 'fuel-cost-for-a-longer-trip', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A {{vehicle}} uses {{g1}} gallons to travel {{m1}} miles. Fuel costs $\\${{price}}$ a gallon. What is the fuel cost of a {{m2}}-mile trip?',
  generator: {
    parameters: {
      vehicle: VEHICLES,
      mpg: { type: 'int', min: 8, max: 20, step: 2 },
      g1: { type: 'int', min: 3, max: 15 },
      g2: { type: 'int', min: 3, max: 15 },
      price: { type: 'int', min: 3, max: 6 },
    },
    derived: {
      m1: 'g1*mpg',
      m2: 'g2*mpg',
      answer: 'g2*price',
      d_partialTotal: '(g1+g2)*price',
      d_forgotFinalStep: 'g2',
      d_usedGivenValue: 'g1*price',
    },
    constraints: ['g1!=g2', 'abs(g1-g2)>1'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{m1}} miles on {{g1}} gallons is {{mpg}} miles a gallon, so {{m2}} miles takes {{g2}} gallons.', 'At $\\${{price}}$ a gallon that is $\\${{answer}}$.'],
  answerSummary: { headline: 'Find the gallons first, then their cost.', text: 'The trip costs $\\${{answer}}$.' },
  hint: 'The mileage rate connects the two trips; the price turns gallons into dollars.',
  feedback: 'Stopping at the number of gallons answers a different question than the one asked.',
});

arc('6.4B', 'average-mileage-from-a-fuel-bill', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'A {{vehicle}} finished a {{total}}-mile route on $\\${{spent}}$ of fuel bought at $\\${{price}}$ a gallon. How many miles a gallon did it average?',
  generator: {
    parameters: {
      vehicle: VEHICLES,
      // gal straddles mpg deliberately: `gal` is the crossing distractor and it
      // only crosses if its range genuinely overlaps the key's on both sides.
      mpg: { type: 'int', min: 14, max: 26, step: 2 },
      gal: { type: 'int', min: 6, max: 30 },
      price: { type: 'int', min: 3, max: 6 },
    },
    derived: {
      total: 'gal*mpg',
      spent: 'gal*price',
      answer: 'mpg',
      d_operationInverted: 'round(total/price)',
      d_unitConversion: 'round(total/spent)',
      d_forgotFinalStep: 'gal',
    },
    constraints: ['gal!=mpg', 'gal!=price'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_unitConversion}}'), error: 'unitConversion' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
  ],
  reasoning: ['$\\${{spent}}$ at $\\${{price}}$ a gallon is {{gal}} gallons.', '{{total}} miles on {{gal}} gallons averages {{answer}} miles a gallon.'],
  answerSummary: { headline: 'The bill gives the gallons; the gallons give the mileage.', text: 'It averaged ${{answer}}$ miles a gallon.' },
  hint: 'Convert the money into gallons before dividing the distance.',
  feedback: 'Dividing the miles by the dollars mixes two different units.',
});

arc('6.4B', 'reading-the-log-row-that-is-wrong', {
  difficultyBand: 5, dok: 3, taskType: 'errorAnalysis', representation: 'table',
  prompt: 'A {{machine}} runs at one steady rate, but one row of its log is wrong. The shift target is {{target}} {{item}}. What should the {{h3}}-hour row have read?',
  stimulus: {
    kind: 'table',
    columns: ['Hours', '{{item}} made'],
    rows: [['{{h1}}', '{{v1}}'], ['{{h2}}', '{{v2}}'], ['{{h3}}', '{{vBad}}'], ['{{h4}}', '{{v4}}']],
  },
  generator: {
    parameters: {
      machine: MACHINES,
      item: GOODS,
      rate: { type: 'int', min: 12, max: 40, step: 2 },
      h1: { type: 'int', min: 2, max: 4 },
      off: { type: 'int', min: 7, max: 29 },
      target: { type: 'int', min: 40, max: 210 },
    },
    derived: {
      h2: 'h1+1',
      h3: 'h1+2',
      h4: 'h1+4',
      v1: 'h1*rate',
      v2: 'h2*rate',
      v4: 'h4*rate',
      answer: 'h3*rate',
      vBad: 'answer+off',
      d_forgotFinalStep: 'vBad',
      d_offByOneStep: 'v2',
      d_usedGivenValue: 'target',
    },
    constraints: ['off!=rate', 'target!=answer', 'vBad!=v4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The rows that agree give {{rate}} {{item}} an hour.', 'At that rate {{h3}} hours is {{answer}} {{item}}, not the {{vBad}} logged.'],
  answerSummary: { headline: 'Recover the rate from the rows that agree.', text: 'The row should read ${{answer}}$.' },
  hint: 'Three rows share one rate. Use them to say what the fourth should have been.',
  feedback: 'The target is what the shift was aiming for, not what this row should show.',
});

// ================================================================ 6.4C
// Ratios and comparative relationships.

arc('6.4C', 'smaller-share-after-reinforcement', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A {{crew}} of {{total}} people is split {{a}} to {{b}} between loading and driving. Then {{extra}} more join the driving side. How many drive now?',
  generator: {
    parameters: {
      crew: WORKERS,
      unit: { type: 'int', min: 3, max: 12 },
      a: { type: 'int', min: 3, max: 7 },
      b: { type: 'int', min: 1, max: 2 },
      extra: { type: 'int', min: 2, max: 9 },
      roster: { type: 'int', min: 3, max: 30 },
    },
    derived: {
      total: '(a+b)*unit',
      answer: 'b*unit+extra',
      d_ratioReversed: 'a*unit+extra',
      d_forgotFinalStep: 'b*unit',
      d_usedGivenValue: 'roster',
    },
    constraints: ['a>b', 'roster!=answer', 'b*unit!=roster'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{a}} to {{b}} splits {{total}} into {{a}}+{{b}} shares of {{unit}}, so driving starts with {{d_forgotFinalStep}}.', 'With {{extra}} more that is {{answer}}.'],
  answerSummary: { headline: 'Split first, then add the reinforcement.', text: 'There are ${{answer}}$ driving.' },
  hint: 'The two numbers in the ratio say how many equal shares the crew makes.',
  feedback: 'The roster figure is the paper strength, not the number on this job.',
});

arc('6.4C', 'total-crew-from-one-side', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
  prompt: 'A {{crew}} booked for {{booked}} keeps {{first}} to {{second}} at {{a}} to {{b}}. It has {{secondCount}} {{second}}. After {{extra}} more {{first}} arrive, how many are there?',
  generator: {
    parameters: {
      crew: WORKERS,
      first: contextParam(['loaders', 'drivers', 'packers', 'checkers']),
      second: contextParam(['supervisors', 'inspectors', 'dispatchers', 'schedulers']),
      unit: { type: 'int', min: 2, max: 9 },
      a: { type: 'int', min: 3, max: 6 },
      b: { type: 'int', min: 1, max: 2 },
      extra: { type: 'int', min: 3, max: 14 },
      // Drawn independently so it straddles the key from both sides. Two
      // undershoots and one overshoot pinned the key at second largest.
      booked: { type: 'int', min: 12, max: 80 },
    },
    derived: {
      secondCount: 'b*unit',
      firstCount: 'a*unit',
      answer: 'firstCount+secondCount+extra',
      d_ratioReversed: 'a*secondCount+secondCount+extra',
      d_forgotFinalStep: 'firstCount+secondCount',
      d_usedGivenValue: 'booked',
    },
    constraints: ['a>b', 'unit!=1', 'booked!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_ratioReversed}}'), error: 'ratioReversed' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{secondCount}} {{second}} is {{b}} shares, so one share is {{unit}} and there are {{firstCount}} {{first}}.', 'With {{extra}} more that is {{answer}} people.'],
  answerSummary: { headline: 'One share first, then both sides, then the arrivals.', text: 'There are ${{answer}}$ people.' },
  hint: 'Find what one share of the ratio is worth before scaling the other side.',
  feedback: 'Multiplying the smaller count by the whole ratio number skips the share size.',
});

arc('6.4C', 'which-record-breaks-the-ratio', {
  difficultyBand: 5, dok: 3, taskType: 'errorAnalysis', representation: 'table',
  prompt: 'Three of these batches were mixed to one ratio and one was not. The order sheet asks for {{spec}}. How many {{second}} does the odd batch need to match the others?',
  stimulus: {
    kind: 'table',
    columns: ['Batch', '{{first}}', '{{second}}'],
    rows: [['1', '{{f1}}', '{{s1}}'], ['2', '{{f2}}', '{{s2}}'], ['3', '{{f3}}', '{{sBad}}'], ['4', '{{f4}}', '{{s4}}']],
  },
  generator: {
    parameters: {
      first: contextParam(['red panels', 'steel bolts', 'long brackets', 'wide filters']),
      second: contextParam(['blue panels', 'brass bolts', 'short brackets', 'narrow filters']),
      a: { type: 'int', min: 2, max: 5 },
      b: { type: 'int', min: 1, max: 3 },
      k1: { type: 'int', min: 2, max: 6 },
      k3: { type: 'int', min: 3, max: 9 },
      off: { type: 'int', min: 2, max: 11 },
      spec: { type: 'int', min: 3, max: 21 },
    },
    derived: {
      k2: 'k1+1',
      k4: 'k1+3',
      f1: 'a*k1', s1: 'b*k1',
      f2: 'a*k2', s2: 'b*k2',
      f3: 'a*k3',
      answer: 'b*k3',
      sBad: 'answer+off',
      f4: 'a*k4', s4: 'b*k4',
      d_forgotFinalStep: 'sBad',
      d_offByOneStep: 's1',
      d_usedGivenValue: 'spec',
    },
    constraints: ['a>b', 'off!=b', 'sBad!=s4', 'k3>k1+1', 'spec!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The batches that agree hold {{a}} {{first}} to every {{b}} {{second}}.', 'Batch 3 has {{f3}} {{first}}, so it needs {{answer}} {{second}}, not {{sBad}}.'],
  answerSummary: { headline: 'Recover the ratio from the batches that agree.', text: 'It needs ${{answer}}$.' },
  hint: 'Three batches share one ratio. Use them to say what the fourth should hold.',
  feedback: 'The order sheet figure is what was requested, not what this batch needs.',
});

// ================================================================ 6.4D
// Unit rates.

arc('6.4D', 'delivered-cost-each-across-two-orders', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A {{shop}} buys {{n1}} {{item}} for $\$\{{p1}}$ and {{n2}} more for $\$\{{p2}}$. What is the average cost of one across both orders?',
  generator: {
    parameters: {
      shop: SHOPS,
      item: GOODS,
      each: { type: 'int', min: 3, max: 12 },
      n1: { type: 'int', min: 4, max: 14 },
      n2: { type: 'int', min: 4, max: 14 },
      quote: { type: 'int', min: 2, max: 13 },
    },
    derived: {
      p1: 'n1*each',
      p2: 'n2*each',
      answer: 'each',
      d_partialTotal: 'p1+p2',
      d_operationInverted: 'round(p1/(n1+n2))',
      d_usedGivenValue: 'quote',
    },
    constraints: ['n1!=n2', 'quote!=each', 'quote!=n1'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Together that is {{d_partialTotal}} dollars for {{n1}}+{{n2}} {{item}}.', 'Dividing gives $\$\{{answer}}$ each.'],
  answerSummary: { headline: 'Total the money and the count before dividing.', text: 'Each costs $\$\{{answer}}$.' },
  hint: 'An average over both orders needs both totals of money and of count.',
  feedback: 'Dividing one order\'s money by both counts mixes the two orders.',
});

arc('6.4D', 'hours-to-clear-a-backlog', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'A {{machine}} clears {{rate}} {{item}} an hour. A backlog of {{backlog}} is waiting and {{arriving}} more arrive each hour. How many hours to clear it?',
  generator: {
    parameters: {
      machine: MACHINES,
      item: GOODS,
      net: { type: 'int', min: 8, max: 30, step: 2 },
      arriving: { type: 'int', min: 3, max: 15 },
      hours: { type: 'int', min: 3, max: 12 },
    },
    derived: {
      rate: 'net+arriving',
      backlog: 'net*hours',
      answer: 'hours',
      d_forgotFinalStep: 'round(backlog/rate)',
      d_operationInverted: 'round(backlog/arriving)',
      d_usedGivenValue: 'arriving',
    },
    constraints: ['arriving!=hours', 'round(backlog/rate)!=hours'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The {{machine}} clears {{rate}} but {{arriving}} arrive, so the backlog falls by {{net}} an hour.', '{{backlog}} at {{net}} an hour takes {{answer}} hours.'],
  answerSummary: { headline: 'Work with the net rate, not the raw one.', text: 'It takes ${{answer}}$ hours.' },
  hint: 'Some of each hour goes on the work that arrives during it.',
  feedback: 'Dividing by the full rate ignores the new arrivals.',
});

arc('6.4D', 'which-supplier-is-cheaper-and-by-how-much', {
  difficultyBand: 5, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'Two suppliers quote as shown. On an order of {{want}} {{item}}, how much does the cheaper one save?',
  stimulus: {
    kind: 'table',
    columns: ['Supplier', '{{item}}', 'Price'],
    rows: [['A', '{{nA}}', '$\$\{{pA}}$'], ['B', '{{nB}}', '$\$\{{pB}}$']],
  },
  generator: {
    parameters: {
      item: GOODS,
      eachA: { type: 'int', min: 4, max: 15 },
      eachB: { type: 'int', min: 4, max: 15 },
      nA: { type: 'int', min: 5, max: 12 },
      nB: { type: 'int', min: 5, max: 12 },
      want: { type: 'int', min: 10, max: 40, step: 10 },
    },
    derived: {
      pA: 'nA*eachA',
      pB: 'nB*eachB',
      answer: 'abs(eachA-eachB)*want',
      d_forgotFinalStep: 'abs(eachA-eachB)',
      d_partialTotal: 'abs(pA-pB)*want',
      d_usedGivenValue: 'pA+pB',
    },
    constraints: ['eachA!=eachB', 'abs(eachA-eachB)>1'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Supplier A works out at $\$\{{eachA}}$ each and B at $\$\{{eachB}}$ each.', 'Over {{want}} {{item}} the gap of the two unit prices comes to $\$\{{answer}}$.'],
  answerSummary: { headline: 'Compare the prices each, not the quoted totals.', text: 'The saving is $\$\{{answer}}$.' },
  hint: 'The two quotes cover different counts, so the totals cannot be compared directly.',
  feedback: 'The two quoted totals added together is what the samples cost, not the saving.',
});

// ================================================================ 6.5A
// Proportional reasoning and scale.

arc('6.5A', 'two-stage-scale-conversion', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'On a plan 1 inch stands for {{feet}} feet and a wall is drawn {{drawn}} inches long. Fencing costs $\$\{{rate}}$ a foot. What does that wall cost to fence?',
  generator: {
    parameters: {
      feet: { type: 'int', min: 3, max: 12 },
      drawn: { type: 'int', min: 3, max: 14 },
      rate: { type: 'int', min: 4, max: 15 },
      quoted: { type: 'int', min: 30, max: 1100 },
    },
    derived: {
      real: 'drawn*feet',
      answer: 'real*rate',
      d_partialTotal: 'answer+real*feet',
      d_forgotFinalStep: 'real',
      d_usedGivenValue: 'quoted',
    },
    constraints: ['quoted!=answer', 'real!=rate'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{drawn}} inches at {{feet}} feet an inch is {{real}} feet.', 'At $\$\{{rate}}$ a foot that is $\$\{{answer}}$.'],
  answerSummary: { headline: 'Convert the drawing to feet before pricing it.', text: 'It costs $\$\{{answer}}$.' },
  hint: 'The scale turns inches into feet; the rate turns feet into dollars.',
  feedback: 'The length in feet is not yet a price.',
});

arc('6.5A', 'drawn-length-from-a-budget', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'A plan uses 1 inch to {{feet}} feet. Fencing runs $\$\{{rate}}$ a foot, $\$\{{budget}}$ is available and {{allowance}} inches are already fenced. How many more inches can be fenced?',
  generator: {
    parameters: {
      feet: { type: 'int', min: 3, max: 10 },
      rate: { type: 'int', min: 3, max: 12 },
      drawn: { type: 'int', min: 8, max: 20 },
      allowance: { type: 'int', min: 2, max: 24 },
    },
    derived: {
      real: 'drawn*feet',
      budget: 'real*rate',
      answer: 'drawn',
      d_forgotFinalStep: 'real',
      d_convertedWrongWay: 'round(drawn/feet)',
      d_usedGivenValue: 'allowance',
    },
    constraints: ['allowance!=answer', 'drawn!=feet', 'round(drawn/feet)>0'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_convertedWrongWay}}'), error: 'convertedWrongWay' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['$\$\{{budget}}$ at $\$\{{rate}}$ a foot buys {{real}} feet.', 'At {{feet}} feet an inch that is {{answer}} inches on the plan.'],
  answerSummary: { headline: 'Money to feet, then feet back to the drawing.', text: 'It is ${{answer}}$ inches.' },
  hint: 'Work back through the rate first, then through the scale.',
  feedback: 'The length in feet still has to be turned back into inches on the plan.',
});

arc('6.5A', 'which-scale-row-is-wrong', {
  difficultyBand: 5, dok: 3, taskType: 'errorAnalysis', representation: 'table',
  prompt: 'A plan is drawn to one scale, but one row of this schedule does not fit it. What should that row read in feet?',
  stimulus: {
    kind: 'table',
    columns: ['Drawn (in)', 'Real (ft)'],
    rows: [['{{a1}}', '{{r1}}'], ['{{a2}}', '{{r2}}'], ['{{a3}}', '{{rBad}}'], ['{{a4}}', '{{r4}}']],
  },
  generator: {
    parameters: {
      feet: { type: 'int', min: 4, max: 14 },
      a1: { type: 'int', min: 2, max: 5 },
      a3: { type: 'int', min: 7, max: 16 },
      off: { type: 'int', min: 3, max: 19 },
      listed: { type: 'int', min: 20, max: 200 },
    },
    derived: {
      a2: 'a1+2',
      a4: 'a1+4',
      r1: 'a1*feet',
      r2: 'a2*feet',
      r4: 'a4*feet',
      answer: 'a3*feet',
      rBad: 'answer+off',
      d_forgotFinalStep: 'rBad',
      d_offByOneStep: 'r2',
      d_usedGivenValue: 'listed',
    },
    constraints: ['off!=feet', 'a3>a1+2', 'listed!=answer', 'rBad!=r4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The rows that agree use {{feet}} feet to the inch.', '{{a3}} inches should read {{answer}} feet, not {{rBad}}.'],
  answerSummary: { headline: 'Recover the scale from the rows that agree.', text: 'It should read ${{answer}}$ feet.' },
  hint: 'Three rows share one scale. Use them to test the fourth.',
  feedback: 'The figure printed in that row is the error, not the correction.',
});

// ================================================================ 6.4E
// Percents, fractions and decimals as equivalent forms.

arc('6.4E', 'percent-of-a-percent-order', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'Of {{total}} {{item}} delivered, {{p}}% were checked. Of those checked, {{q}}% passed. How many passed?',
  generator: {
    parameters: {
      item: GOODS,
      hundreds: { type: 'int', min: 2, max: 9 },
      p: { type: 'int', min: 20, max: 80, step: 10 },
      q: { type: 'int', min: 20, max: 90, step: 10 },
      logged: { type: 'int', min: 8, max: 340 },
    },
    derived: {
      total: 'hundreds*100',
      checked: 'total*p/100',
      answer: 'checked*q/100',
      d_forgotFinalStep: 'checked',
      d_wrongPercentBase: 'round(p*q/100)',
      d_usedGivenValue: 'logged',
    },
    constraints: ['p!=q', 'logged!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_wrongPercentBase}}'), error: 'wrongPercentBase' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{p}}% of {{total}} is {{checked}} checked.', '{{q}}% of those {{checked}} is {{answer}}.'],
  answerSummary: { headline: 'The second percent applies to the checked ones only.', text: '${{answer}}$ passed.' },
  hint: 'The second percentage is taken of a smaller group than the delivery.',
  feedback: 'Combining the two percentages as numbers loses the count they apply to.',
});

arc('6.4E', 'delivery-size-from-two-percents', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
  prompt: '{{p}}% of a delivery was checked and {{passed}} of those checked passed, which was {{q}}% of them. How many {{item}} were delivered?',
  generator: {
    parameters: {
      item: GOODS,
      hundreds: { type: 'int', min: 2, max: 9 },
      p: { type: 'int', min: 20, max: 80, step: 10 },
      q: { type: 'int', min: 20, max: 80, step: 10 },
      stated: { type: 'int', min: 100, max: 950 },
    },
    derived: {
      answer: 'hundreds*100',
      checked: 'answer*p/100',
      passed: 'checked*q/100',
      d_forgotFinalStep: 'checked',
      d_partialTotal: 'checked+answer',
      d_usedGivenValue: 'stated',
    },
    constraints: ['p!=q', 'stated!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{passed}} is {{q}}% of the checked group, so {{checked}} were checked.', '{{checked}} is {{p}}% of the delivery, so {{answer}} were delivered.'],
  answerSummary: { headline: 'Undo the inner percent first, then the outer one.', text: '${{answer}}$ were delivered.' },
  hint: 'Two percentages were applied in turn, so two have to be undone in turn.',
  feedback: 'Stopping at the checked group answers only half the question.',
});

arc('6.4E', 'gap-between-two-written-forms', {
  difficultyBand: 5, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'Two {{shop}} records describe shares of one order of {{total}} {{item}}. The sheet expected a gap of {{expected}}. How many more {{item}} does the larger share cover?',
  stimulus: {
    kind: 'table',
    columns: ['Record', 'Share'],
    rows: [['First', '{{p}}%'], ['Second', '$\\frac{{{num}}}{{{den}}}$']],
  },
  generator: {
    parameters: {
      shop: SHOPS,
      item: GOODS,
      hundreds: { type: 'int', min: 2, max: 8 },
      p: { type: 'int', min: 20, max: 80, step: 10 },
      num: { type: 'int', min: 1, max: 3 },
      den: { type: 'int', min: 4, max: 5 },
      expected: { type: 'int', min: 8, max: 260 },
    },
    derived: {
      total: 'hundreds*100',
      first: 'total*p/100',
      second: 'total*num/den',
      answer: 'abs(first-second)',
      d_forgotFinalStep: 'max(first,second)',
      d_wrongPercentBase: 'abs(p-round(num*100/den))',
      d_usedGivenValue: 'expected',
    },
    constraints: ['expected!=answer', 'num<den', 'total*p/100!=total*num/den', 'abs(first-second)>9'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_wrongPercentBase}}'), error: 'wrongPercentBase' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{p}}% of {{total}} is {{first}}; $\\frac{{{num}}}{{{den}}}$ of {{total}} is {{second}}.', 'The gap between them is {{answer}} {{item}}.'],
  answerSummary: { headline: 'Put both shares into {{item}} before comparing.', text: 'The gap is ${{answer}}$ {{item}}.' },
  hint: 'A percent and a fraction cannot be compared until both are counts.',
  feedback: 'The expected gap on the sheet is not what the two records actually differ by.',
});

// ================================================================ 6.4F
// Benchmark percents.

arc('6.4F', 'two-markdowns-in-sequence', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A {{tool}} listed at $\$\{{list}}$ is cut {{p}}%, then the sale price is cut {{q}}% more. What is the final price?',
  generator: {
    parameters: {
      tool: contextParam(['drill', 'compressor', 'welder', 'generator', 'grinder']),
      hundreds: { type: 'int', min: 2, max: 9 },
      p: { type: 'int', min: 10, max: 50, step: 10 },
      q: { type: 'int', min: 10, max: 50, step: 10 },
      posted: { type: 'int', min: 40, max: 480 },
    },
    derived: {
      list: 'hundreds*100',
      afterFirst: 'list*(100-p)/100',
      answer: 'afterFirst*(100-q)/100',
      d_forgotFinalStep: 'afterFirst',
      d_percentNotApplied: 'list*(100-p-q)/100',
      d_usedGivenValue: 'posted',
    },
    constraints: ['p!=q', 'p+q<90', 'posted!=answer'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_percentNotApplied}}'), error: 'percentNotApplied' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{p}}% off $\$\{{list}}$ leaves $\$\{{afterFirst}}$.', '{{q}}% off that leaves $\$\{{answer}}$.'],
  answerSummary: { headline: 'The second cut applies to the reduced price.', text: 'It ends at $\$\{{answer}}$.' },
  hint: 'The second discount is not taken from the original ticket.',
  feedback: 'Adding the two percentages treats both cuts as coming off the list price.',
});

arc('6.4F', 'list-price-behind-a-benchmark-cut', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
  prompt: 'After {{p}}% was taken off, a {{tool}} sold for $\$\{{sale}}$ and the {{shop}} kept $\$\{{fee}}$ of that as a fee. What was the list price?',
  generator: {
    parameters: {
      tool: contextParam(['drill', 'compressor', 'welder', 'generator', 'grinder']),
      shop: SHOPS,
      hundreds: { type: 'int', min: 2, max: 9 },
      p: { type: 'int', min: 10, max: 60, step: 10 },
      fee: { type: 'int', min: 5, max: 40, step: 5 },
      ticket: { type: 'int', min: 90, max: 900 },
    },
    derived: {
      answer: 'hundreds*100',
      sale: 'answer*(100-p)/100',
      d_forgotFinalStep: 'sale',
      d_partialTotal: 'answer+sale',
      d_usedGivenValue: 'ticket',
    },
    constraints: ['ticket!=answer', 'sale>fee'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['$\$\{{sale}}$ is {{100-p}}% of the list price.', 'That makes the list price $\$\{{answer}}$; the fee comes out of the sale, not the list.'],
  answerSummary: { headline: 'The sale price is a percentage of the list price.', text: 'The list price was $\$\{{answer}}$.' },
  hint: 'Ask what fraction of the list price the sale price represents.',
  feedback: 'The fee is taken from what was received, so it does not change the list price.',
});

arc('6.4F', 'which-claim-the-figures-support', {
  difficultyBand: 5, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'A {{crew}} logged two days against a target of {{total}} {{item}} and pledged {{pledge}}. How many more must be cleared to reach {{goal}}% of the target?',
  stimulus: {
    kind: 'table',
    columns: ['Day', '{{item}} cleared'],
    rows: [['1', '{{day1}}'], ['2', '{{day2}}']],
  },
  generator: {
    parameters: {
      crew: WORKERS,
      item: GOODS,
      hundreds: { type: 'int', min: 3, max: 9 },
      p: { type: 'int', min: 10, max: 20, step: 10 },
      q: { type: 'int', min: 10, max: 20, step: 10 },
      goal: { type: 'int', min: 70, max: 90, step: 10 },
      pledge: { type: 'int', min: 60, max: 620 },
    },
    derived: {
      total: 'hundreds*100',
      day1: 'total*p/100',
      day2: 'total*q/100',
      target: 'total*goal/100',
      answer: 'target-day1-day2',
      d_percentNotApplied: 'total-day1-day2',
      d_partialTotal: 'day1+day2',
      d_usedGivenValue: 'pledge',
    },
    // 2*(p+q) < goal keeps what is already cleared below what remains, so
    // `day1+day2` is a dependable undershoot rather than a second crosser.
    constraints: ['2*(p+q)<goal', 'target-day1-day2>0', 'pledge!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_percentNotApplied}}'), error: 'percentNotApplied' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{goal}}% of {{total}} is {{target}}, and {{day1}}+{{day2}} are already cleared.', 'That leaves {{answer}} still to clear.'],
  answerSummary: { headline: 'The goal is a percentage of the target, not the whole of it.', text: '${{answer}}$ are still to clear.' },
  hint: 'Work out how many the goal actually asks for before subtracting.',
  feedback: 'The pledge is what was promised, not what the goal still needs.',
});

// ================================================================ 6.4G
// Percents and money.

arc('6.4G', 'bill-with-tip-and-split', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A {{crew}} of {{people}} splits a $\$\{{bill}}$ bill evenly after adding a {{p}}% tip. What does each person pay?',
  generator: {
    parameters: {
      crew: WORKERS,
      people: { type: 'int', min: 3, max: 8 },
      tens: { type: 'int', min: 4, max: 30 },
      p: { type: 'int', min: 10, max: 25, step: 5 },
      each: { type: 'int', min: 6, max: 60 },
    },
    derived: {
      bill: 'tens*10',
      withTip: 'bill*(100+p)/100',
      answer: 'round(withTip/people)',
      d_percentNotApplied: 'round(bill/people)',
      d_forgotFinalStep: 'withTip',
      d_usedGivenValue: 'each',
    },
    constraints: ['each!=answer', 'withTip>people'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_percentNotApplied}}'), error: 'percentNotApplied' },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['A {{p}}% tip takes $\$\{{bill}}$ to $\$\{{withTip}}$.', 'Split {{people}} ways that is about $\$\{{answer}}$ each.'],
  answerSummary: { headline: 'Add the tip before splitting, not after.', text: 'Each pays about $\$\{{answer}}$.' },
  hint: 'Everyone shares the tip as well as the bill.',
  feedback: 'Splitting the bill alone leaves the tip unpaid.',
});

arc('6.4G', 'ticket-price-inside-a-total', {
  difficultyBand: 5, dok: 3, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'A receipt of $\$\{{total}}$ covers a {{tool}}, {{p}}% sales tax on it, and an untaxed $\$\{{fee}}$ delivery. What did the {{tool}} cost?',
  generator: {
    parameters: {
      tool: contextParam(['drill', 'compressor', 'welder', 'generator', 'grinder']),
      hundreds: { type: 'int', min: 1, max: 8 },
      p: { type: 'int', min: 5, max: 25, step: 5 },
      fee: { type: 'int', min: 10, max: 45, step: 5 },
      shown: { type: 'int', min: 90, max: 760 },
    },
    derived: {
      answer: 'hundreds*100',
      taxed: 'answer*(100+p)/100',
      total: 'taxed+fee',
      d_wrongPercentBase: 'round(taxed*(100-p)/100)',
      d_forgotFinalStep: 'total',
      d_usedGivenValue: 'shown',
    },
    constraints: ['shown!=answer'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_wrongPercentBase}}'), error: 'wrongPercentBase' },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Taking off the untaxed $\$\{{fee}}$ leaves $\$\{{taxed}}$, which is {{100+p}}% of the price.', 'That makes the price $\$\{{answer}}$.'],
  answerSummary: { headline: 'Remove the untaxed part before undoing the tax.', text: 'It cost $\$\{{answer}}$.' },
  hint: 'The delivery charge carries no tax, so it is not part of the taxed amount.',
  feedback: 'Taking the tax rate off again is not the same as undoing the tax that was added.',
});

arc('6.4G', 'total-cost-of-a-payment-plan', {
  difficultyBand: 5, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'Two ways to pay for a $\$\{{price}}$ {{tool}} are shown. What does plan A cost in total?',
  stimulus: {
    kind: 'table',
    columns: ['Plan', 'Terms'],
    rows: [['A', '{{p}}% deposit, then {{months}} payments of $\$\{{monthly}}$'], ['B', 'full price less {{q}}%']],
  },
  generator: {
    parameters: {
      tool: contextParam(['drill', 'compressor', 'welder', 'generator', 'grinder']),
      hundreds: { type: 'int', min: 4, max: 12 },
      p: { type: 'int', min: 20, max: 40, step: 10 },
      q: { type: 'int', min: 5, max: 20, step: 5 },
      months: { type: 'int', min: 3, max: 9 },
      monthly: { type: 'int', min: 40, max: 120, step: 20 },
    },
    derived: {
      price: 'hundreds*100',
      planA: 'price*p/100+months*monthly',
      planB: 'price*(100-q)/100',
      answer: 'planA',
      d_partialTotal: 'price+planA',
      d_forgotFinalStep: 'months*monthly',
      d_usedGivenValue: 'planB',
    },
    constraints: ['abs(planA-planB)>15', 'planA!=planB'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The deposit is {{p}}% of $\$\{{price}}$, and the {{months}} payments add {{months}}x$\$\{{monthly}}$.', 'Together plan A costs $\$\{{answer}}$.'],
  answerSummary: { headline: 'A deposit and instalments are both part of the plan.', text: 'Plan A costs $\$\{{answer}}$.' },
  hint: 'The deposit is a percentage of the ticket price, not of the instalments.',
  feedback: 'The instalments alone leave the deposit unpaid.',
});

// ================================================================ 6.4H
// Measurement conversion within a system.

arc('6.4H', 'material-in-two-units', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A job needs {{pieces}} lengths of {{part}} at {{feetEach}} feet {{inchEach}} inches each. How many whole feet of material is that?',
  generator: {
    parameters: {
      part: contextParam(['conduit', 'trim', 'channel', 'rail', 'edging']),
      pieces: { type: 'int', min: 4, max: 12 },
      feetEach: { type: 'int', min: 2, max: 9 },
      inchEach: { type: 'int', min: 3, max: 9, step: 3 },
      ordered: { type: 'int', min: 8, max: 90 },
    },
    derived: {
      totalInches: 'pieces*(feetEach*12+inchEach)',
      answer: 'floor(totalInches/12)',
      d_unitConversion: 'totalInches',
      d_forgotFinalStep: 'pieces*feetEach',
      d_usedGivenValue: 'ordered',
    },
    constraints: ['ordered!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_unitConversion}}'), error: 'unitConversion' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Each length is {{feetEach}}x12+{{inchEach}} inches, so {{pieces}} of them come to {{totalInches}} inches.', 'That is {{answer}} whole feet.'],
  answerSummary: { headline: 'Work in one unit before totalling.', text: 'It is ${{answer}}$ whole feet.' },
  hint: 'The spare inches on each length add up to more feet.',
  feedback: 'Counting only the whole feet on each length loses the inches.',
});

arc('6.4H', 'pieces-a-roll-yields', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'A roll holds {{yards}} yards of {{part}}. Each piece takes {{inchEach}} inches. How many whole pieces does the roll give?',
  generator: {
    parameters: {
      part: contextParam(['conduit', 'trim', 'channel', 'rail', 'edging']),
      yards: { type: 'int', min: 5, max: 20 },
      inchEach: { type: 'int', min: 7, max: 20 },
      quoted: { type: 'int', min: 6, max: 58 },
    },
    derived: {
      totalInches: 'yards*36',
      answer: 'floor(totalInches/inchEach)',
      d_convertedWrongWay: 'floor(yards*12/inchEach)',
      d_unitConversion: 'totalInches',
      d_usedGivenValue: 'quoted',
    },
    constraints: ['quoted!=answer', 'floor(yards*12/inchEach)>0'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_convertedWrongWay}}'), error: 'convertedWrongWay' },
    { label: plain('{{d_unitConversion}}'), error: 'unitConversion' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{yards}} yards is {{totalInches}} inches.', 'At {{inchEach}} inches a piece that gives {{answer}} whole pieces.'],
  answerSummary: { headline: 'Yards to inches before dividing.', text: 'It gives ${{answer}}$ pieces.' },
  hint: 'A yard is three feet, and a foot is twelve inches.',
  feedback: 'Treating a yard as twelve inches uses the wrong conversion.',
});

arc('6.4H', 'conversion-row-that-does-not-fit', {
  difficultyBand: 5, dok: 3, taskType: 'errorAnalysis', representation: 'table',
  prompt: 'This conversion chart should use one steady rate. One row does not. What should that row read?',
  stimulus: {
    kind: 'table',
    columns: ['Pounds', 'Ounces'],
    rows: [['{{a1}}', '{{o1}}'], ['{{a2}}', '{{o2}}'], ['{{a3}}', '{{oBad}}'], ['{{a4}}', '{{o4}}']],
  },
  generator: {
    parameters: {
      a1: { type: 'int', min: 2, max: 5 },
      a3: { type: 'int', min: 8, max: 16 },
      off: { type: 'int', min: 5, max: 27 },
      printed: { type: 'int', min: 60, max: 320 },
    },
    derived: {
      a2: 'a1+2',
      a4: 'a1+4',
      o1: 'a1*16',
      o2: 'a2*16',
      o4: 'a4*16',
      answer: 'a3*16',
      oBad: 'answer+off',
      d_forgotFinalStep: 'oBad',
      d_offByOneStep: 'o2',
      d_usedGivenValue: 'printed',
    },
    constraints: ['off!=16', 'a3>a1+3', 'printed!=answer', 'oBad!=o4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The rows that agree use 16 ounces to the pound.', '{{a3}} pounds should read {{answer}} ounces, not {{oBad}}.'],
  answerSummary: { headline: 'Recover the rate from the rows that agree.', text: 'It should read ${{answer}}$ ounces.' },
  hint: 'Three rows share one conversion. Use them to test the fourth.',
  feedback: 'The figure printed in that row is the error, not the correction.',
});

// ================================================================ 6.5B
// Part, whole and percent.

arc('6.5B', 'shortfall-against-a-percentage-target', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A {{crew}} inspected {{done}} of {{total}} {{item}}. The shift asks for {{p}}%. How many more must be inspected?',
  generator: {
    parameters: {
      crew: WORKERS,
      item: GOODS,
      hundreds: { type: 'int', min: 3, max: 9 },
      p: { type: 'int', min: 60, max: 90, step: 10 },
      donePct: { type: 'int', min: 10, max: 40, step: 10 },
      logged: { type: 'int', min: 60, max: 700 },
    },
    derived: {
      total: 'hundreds*100',
      done: 'total*donePct/100',
      target: 'total*p/100',
      answer: 'target-done',
      d_percentNotApplied: 'total-done',
      d_forgotFinalStep: 'done',
      d_usedGivenValue: 'logged',
    },
    constraints: ['2*donePct<p', 'logged!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_percentNotApplied}}'), error: 'percentNotApplied' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{p}}% of {{total}} is {{target}}, and {{done}} are inspected.', 'That leaves {{answer}} to go.'],
  answerSummary: { headline: 'The shift asks for a percentage, not the whole batch.', text: '${{answer}}$ more must be inspected.' },
  hint: 'Work out how many the target actually is before subtracting.',
  feedback: 'Inspecting every one is more than the shift asks for.',
});

arc('6.5B', 'batch-size-from-a-failure-rate', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
  prompt: '{{failed}} {{item}} failed, which was {{p}}% of a batch, and a second batch of {{second}} had none fail. The sheet counted {{counted}}. How many were there really?',
  generator: {
    parameters: {
      item: GOODS,
      hundreds: { type: 'int', min: 2, max: 8 },
      p: { type: 'int', min: 10, max: 50, step: 10 },
      second: { type: 'int', min: 40, max: 300, step: 20 },
      counted: { type: 'int', min: 150, max: 1050 },
    },
    derived: {
      batch: 'hundreds*100',
      failed: 'batch*p/100',
      answer: 'batch+second',
      d_forgotFinalStep: 'batch',
      d_partialTotal: 'answer+failed',
      d_usedGivenValue: 'counted',
    },
    constraints: ['p!=100', 'counted!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{failed}} is {{p}}% of the first batch, so that batch held {{batch}}.', 'With the second batch of {{second}} there were {{answer}} in all.'],
  answerSummary: { headline: 'Recover the first batch before adding the second.', text: 'There were ${{answer}}$ altogether.' },
  hint: 'The percentage describes the first batch only.',
  feedback: 'The figure on the sheet is what was counted, not what the two batches hold.',
});

arc('6.5B', 'which-shift-cleared-the-larger-share', {
  difficultyBand: 5, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'Two shifts worked different sized batches, as shown, and the log reported a gap of {{reported}}. How many more {{item}} did the larger shift really clear?',
  stimulus: {
    kind: 'table',
    columns: ['Shift', 'Batch', 'Cleared'],
    rows: [['Early', '{{tA}}', '{{pA}}%'], ['Late', '{{tB}}', '{{pB}}%']],
  },
  generator: {
    parameters: {
      item: GOODS,
      hA: { type: 'int', min: 2, max: 9 },
      hB: { type: 'int', min: 2, max: 9 },
      pA: { type: 'int', min: 20, max: 80, step: 10 },
      pB: { type: 'int', min: 20, max: 80, step: 10 },
      reported: { type: 'int', min: 20, max: 380 },
    },
    derived: {
      tA: 'hA*100',
      tB: 'hB*100',
      cA: 'tA*pA/100',
      cB: 'tB*pB/100',
      answer: 'abs(cA-cB)',
      d_forgotFinalStep: 'max(cA,cB)',
      d_wrongPercentBase: 'abs(pA-pB)',
      d_usedGivenValue: 'reported',
    },
    constraints: ['reported!=answer', 'cA!=cB', 'abs(cA-cB)>19', 'pA!=pB'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_wrongPercentBase}}'), error: 'wrongPercentBase' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Early cleared {{cA}} and Late cleared {{cB}}.', 'The gap between them is {{answer}} {{item}}.'],
  answerSummary: { headline: 'A percentage of a bigger batch is a bigger count.', text: 'The gap is ${{answer}}$ {{item}}.' },
  hint: 'The two percentages describe batches of different sizes.',
  feedback: 'The reported gap is what the log claims, not what the figures give.',
});

// ================================================================ 6.5C
// Equivalent forms of one share.

arc('6.5C', 'three-forms-of-one-order', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'Of {{total}} {{item}}, {{p}}% went to one depot and $\\frac{{{num}}}{{{den}}}$ to another, with {{held}} expected to stay. How many actually stayed?',
  generator: {
    parameters: {
      item: GOODS,
      hundreds: { type: 'int', min: 2, max: 8 },
      p: { type: 'int', min: 10, max: 20, step: 10 },
      num: { type: 'int', min: 1, max: 1 },
      den: { type: 'int', min: 4, max: 5 },
      held: { type: 'int', min: 100, max: 470 },
    },
    derived: {
      total: 'hundreds*100',
      first: 'total*p/100',
      second: 'total*num/den',
      answer: 'total-first-second',
      // The two shares together stay under half the order, so what is held back
      // is dependably larger than what was sent and this is a real undershoot.
      d_partialTotal: 'first+second',
      d_percentNotApplied: 'total-first',
      d_usedGivenValue: 'held',
    },
    constraints: ['num<den', 'total-first-second>first+second', 'held!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_percentNotApplied}}'), error: 'percentNotApplied' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{p}}% of {{total}} is {{first}} and $\\frac{{{num}}}{{{den}}}$ of it is {{second}}.', 'That leaves {{answer}} held back.'],
  answerSummary: { headline: 'Put both shares into counts before subtracting.', text: '${{answer}}$ were held back.' },
  hint: 'A percent and a fraction both have to become counts of {{item}} first.',
  feedback: 'The expected figure is what was planned, not what the two shares leave.',
});

arc('6.5C', 'order-size-behind-two-shares', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
  prompt: 'A depot took {{p}}% of an order and a second took $\\frac{{{num}}}{{{den}}}$ of it. Together they took {{taken}} {{item}}. How large was the order?',
  generator: {
    parameters: {
      item: GOODS,
      hundreds: { type: 'int', min: 2, max: 9 },
      p: { type: 'int', min: 10, max: 40, step: 10 },
      num: { type: 'int', min: 1, max: 2 },
      den: { type: 'int', min: 4, max: 5 },
      stated: { type: 'int', min: 150, max: 1000 },
    },
    derived: {
      answer: 'hundreds*100',
      first: 'answer*p/100',
      second: 'answer*num/den',
      taken: 'first+second',
      d_forgotFinalStep: 'taken',
      d_partialTotal: 'answer+taken',
      d_usedGivenValue: 'stated',
    },
    constraints: ['num<den', 'stated!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The two shares are {{p}}% and $\\frac{{{num}}}{{{den}}}$ of the order, so {{taken}} is their combined share of it.', 'That makes the order {{answer}}.'],
  answerSummary: { headline: 'Add the two shares as one fraction of the order.', text: 'The order was ${{answer}}$.' },
  hint: 'Both shares are measured against the same order.',
  feedback: 'The two depots took part of the order, not all of it.',
});

arc('6.5C', 'correcting-the-record-that-disagrees', {
  difficultyBand: 5, dok: 3, taskType: 'errorAnalysis', representation: 'table',
  prompt: 'Three clerks recorded the same share of {{total}} {{item}} and one disagrees. What should clerk C have recorded?',
  stimulus: {
    kind: 'table',
    columns: ['Clerk', 'Record'],
    rows: [['A', '{{p}}%'], ['B', '$\\frac{{{num}}}{{{den}}}$'], ['C', '{{cCount}} {{item}}'], ['Noted', '{{noted}} {{item}}']],
  },
  generator: {
    parameters: {
      item: GOODS,
      hundreds: { type: 'int', min: 2, max: 8 },
      num: { type: 'int', min: 1, max: 3 },
      den: { type: 'int', min: 4, max: 5 },
      off: { type: 'int', min: 8, max: 60, step: 4 },
      noted: { type: 'int', min: 30, max: 400 },
    },
    derived: {
      total: 'hundreds*100',
      p: 'round(num*100/den)',
      answer: 'total*num/den',
      share: 'answer',
      cCount: 'answer+off',
      d_forgotFinalStep: 'cCount',
      d_exponentError: 'round(answer*num/den)',
      d_usedGivenValue: 'noted',
    },
    constraints: ['num<den', 'noted!=answer', 'round(answer*num/den)!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_exponentError}}'), error: 'exponentError' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{p}}% and $\\frac{{{num}}}{{{den}}}$ of {{total}} both come to {{answer}}.', 'Clerk C recorded {{cCount}}, so {{answer}} is what the record should read.'],
  answerSummary: { headline: 'Two records agree; correct the third to match them.', text: 'It should read ${{answer}}$.' },
  hint: 'Turn the percent and the fraction into counts and see that they match.',
  feedback: 'Taking the fraction a second time shrinks a share that was already correct.',
});

// ================================================================ 7.4B
// Unit rates.

arc('7.4B', 'pay-across-two-rates', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A {{worker}} is paid $\$\{{rate}}$ an hour for the first {{plain}} hours and $\$\{{over}}$ an hour after that. What is the pay for a {{total}}-hour week?',
  generator: {
    parameters: {
      worker: contextParam(['mechanic', 'technician', 'driver', 'fitter', 'welder']),
      rate: { type: 'int', min: 12, max: 25 },
      bump: { type: 'int', min: 4, max: 12 },
      plain: { type: 'int', min: 30, max: 40, step: 5 },
      extra: { type: 'int', min: 4, max: 14 },
      offered: { type: 'int', min: 380, max: 1250 },
    },
    derived: {
      over: 'rate+bump',
      total: 'plain+extra',
      answer: 'plain*rate+extra*over',
      d_percentNotApplied: 'total*rate',
      d_partialTotal: 'total*over',
      d_usedGivenValue: 'offered',
    },
    constraints: ['offered!=answer'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_percentNotApplied}}'), error: 'percentNotApplied' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{plain}} hours at $\$\{{rate}}$ and {{extra}} hours at $\$\{{over}}$.', 'Together that is $\$\{{answer}}$.'],
  answerSummary: { headline: 'The two rates cover different parts of the week.', text: 'The pay is $\$\{{answer}}$.' },
  hint: 'Only the hours past the first block earn the higher rate.',
  feedback: 'Paying every hour at one rate ignores the change after {{plain}} hours.',
});

arc('7.4B', 'hours-behind-a-pay-packet', {
  difficultyBand: 5, dok: 3, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'A {{worker}} earning $\$\{{rate}}$ an hour, then $\$\{{over}}$ after {{plain}} hours, took home $\$\{{answerPay}}$. How many hours were worked?',
  generator: {
    parameters: {
      worker: contextParam(['mechanic', 'technician', 'driver', 'fitter', 'welder']),
      rate: { type: 'int', min: 12, max: 22 },
      bump: { type: 'int', min: 4, max: 10 },
      plain: { type: 'int', min: 30, max: 40, step: 5 },
      extra: { type: 'int', min: 5, max: 16 },
      listed: { type: 'int', min: 28, max: 66 },
    },
    derived: {
      over: 'rate+bump',
      answer: 'plain+extra',
      answerPay: 'plain*rate+extra*over',
      d_forgotFinalStep: 'extra',
      d_operationInverted: 'round(answerPay/rate)',
      d_usedGivenValue: 'listed',
    },
    constraints: ['listed!=answer', 'round(answerPay/rate)!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The first {{plain}} hours pay {{plain}}x$\$\{{rate}}$, leaving the rest at $\$\{{over}}$ an hour.', 'That is {{extra}} more hours, so {{answer}} in all.'],
  answerSummary: { headline: 'Take off the basic block before dividing the remainder.', text: 'It was ${{answer}}$ hours.' },
  hint: 'Some of the packet is earned before the higher rate starts.',
  feedback: 'Dividing the whole packet by the basic rate ignores the higher rate.',
});

arc('7.4B', 'which-quote-is-cheapest-per-unit', {
  difficultyBand: 5, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'Three suppliers quote as shown. What does the cheapest one charge for {{want}} {{item}}?',
  stimulus: {
    kind: 'table',
    columns: ['Supplier', '{{item}}', 'Price'],
    rows: [['A', '{{nA}}', '$\$\{{pA}}$'], ['B', '{{nB}}', '$\$\{{pB}}$'], ['C', '{{nC}}', '$\$\{{pC}}$']],
  },
  generator: {
    parameters: {
      item: GOODS,
      low: { type: 'int', min: 3, max: 8 },
      midBump: { type: 'int', min: 1, max: 4 },
      hiBump: { type: 'int', min: 5, max: 9 },
      nA: { type: 'int', min: 6, max: 14 },
      nB: { type: 'int', min: 6, max: 14 },
      nC: { type: 'int', min: 6, max: 14 },
      want: { type: 'int', min: 10, max: 40, step: 10 },
    },
    derived: {
      eachB: 'low+midBump',
      eachC: 'low+hiBump',
      pA: 'nA*low',
      pB: 'nB*eachB',
      pC: 'nC*eachC',
      answer: 'low*want',
      d_forgotFinalStep: 'low',
      d_partialTotal: 'eachC*want',
      d_usedGivenValue: 'pA+pB',
    },
    constraints: ['midBump<hiBump'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Per {{item}} the quotes work out at $\$\{{low}}$, $\$\{{eachB}}$ and $\$\{{eachC}}$.', 'The cheapest is $\$\{{low}}$, so {{want}} cost $\$\{{answer}}$.'],
  answerSummary: { headline: 'The lowest quoted total is not the lowest price each.', text: 'It costs $\$\{{answer}}$.' },
  hint: 'The three quotes cover different counts, so compare the price of one.',
  feedback: 'Adding two of the quotes prices their samples, not this order.',
});

// ================================================================ 7.4C
// Constant of proportionality.

arc('7.4C', 'two-machines-running-together', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'One {{machine}} makes {{k1}} {{item}} an hour and a second makes {{k2}}. Running together for {{hours}} hours, how many do they make?',
  generator: {
    parameters: {
      machine: MACHINES,
      item: GOODS,
      k1: { type: 'int', min: 8, max: 30 },
      k2: { type: 'int', min: 8, max: 30 },
      hours: { type: 'int', min: 3, max: 12 },
      ordered: { type: 'int', min: 60, max: 520 },
    },
    derived: {
      answer: '(k1+k2)*hours',
      d_partialTotal: 'answer+k1*hours',
      d_forgotFinalStep: 'k1*hours',
      d_usedGivenValue: 'ordered',
    },
    constraints: ['k1!=k2', 'ordered!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Together they make {{k1}}+{{k2}} {{item}} an hour.', 'Over {{hours}} hours that is {{answer}}.'],
  answerSummary: { headline: 'Add the two rates before multiplying by the time.', text: 'They make ${{answer}}$.' },
  hint: 'Both machines run for the whole time.',
  feedback: 'One machine alone accounts for only part of the output.',
});

arc('7.4C', 'time-to-finish-with-a-head-start', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'An order of {{order}} {{item}} is due. {{already}} are done and a {{machine}} adds {{k}} an hour. How many more hours are needed?',
  generator: {
    parameters: {
      machine: MACHINES,
      item: GOODS,
      k: { type: 'int', min: 9, max: 28 },
      hours: { type: 'int', min: 4, max: 15 },
      already: { type: 'int', min: 20, max: 260 },
      shift: { type: 'int', min: 3, max: 20 },
    },
    derived: {
      order: 'already+k*hours',
      answer: 'hours',
      d_operationInverted: 'round(order/k)',
      d_forgotFinalStep: 'round(already/k)',
      d_usedGivenValue: 'shift',
    },
    constraints: ['shift!=answer', 'already<k*hours', 'round(order/k)!=hours', 'round(already/k)!=hours'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{order}} less the {{already}} done leaves {{k}}x{{hours}} still to make.', 'At {{k}} an hour that is {{answer}} hours.'],
  answerSummary: { headline: 'Only the unfinished part still takes time.', text: 'It needs ${{answer}}$ more hours.' },
  hint: 'Part of the order is already behind you.',
  feedback: 'Dividing the whole order by the rate ignores what is already done.',
});

arc('7.4C', 'steady-rate-row-that-fails', {
  difficultyBand: 5, dok: 3, taskType: 'errorAnalysis', representation: 'table',
  prompt: 'A pump is supposed to move a steady number of litres a minute. One reading does not fit. What should it read?',
  stimulus: {
    kind: 'table',
    columns: ['Minutes', 'Litres'],
    rows: [['{{m1}}', '{{l1}}'], ['{{m2}}', '{{l2}}'], ['{{m3}}', '{{lBad}}'], ['{{m4}}', '{{l4}}']],
  },
  generator: {
    parameters: {
      k: { type: 'int', min: 6, max: 24 },
      m1: { type: 'int', min: 3, max: 6 },
      m3: { type: 'int', min: 10, max: 20 },
      off: { type: 'int', min: 5, max: 33 },
      gauge: { type: 'int', min: 50, max: 420 },
    },
    derived: {
      m2: 'm1+3',
      m4: 'm1+5',
      l1: 'm1*k',
      l2: 'm2*k',
      l4: 'm4*k',
      answer: 'm3*k',
      lBad: 'answer+off',
      d_forgotFinalStep: 'lBad',
      d_offByOneStep: 'l2',
      d_usedGivenValue: 'gauge',
    },
    constraints: ['off!=k', 'm3>m1+5', 'gauge!=answer', 'lBad!=l4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The readings that agree give {{k}} litres a minute.', '{{m3}} minutes should read {{answer}} litres, not {{lBad}}.'],
  answerSummary: { headline: 'Recover the rate from the readings that agree.', text: 'It should read ${{answer}}$ litres.' },
  hint: 'Three readings share one rate. Use them to test the fourth.',
  feedback: 'The reading on the gauge is not what this row should show.',
});

// ================================================================ 6.12C
// Measures of centre and spread.

arc('6.12C', 'average-across-two-weeks', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A {{crew}} averaged {{m1}} {{item}} a day over {{d1}} days, then {{m2}} a day over {{d2}} days. What is the average over all the days?',
  generator: {
    parameters: {
      crew: WORKERS,
      item: GOODS,
      m1: { type: 'int', min: 20, max: 60, step: 5 },
      m2: { type: 'int', min: 20, max: 60, step: 5 },
      d1: { type: 'int', min: 2, max: 8 },
      d2: { type: 'int', min: 2, max: 8 },
    },
    derived: {
      total: 'm1*d1+m2*d2',
      answer: 'round(total/(d1+d2))',
      d_partialTotal: 'total',
      d_meanMedianSwap: 'round((m1+m2)/2)',
      d_usedGivenValue: 'min(m1,m2)',
    },
    constraints: ['d1!=d2', 'm1!=m2', 'min(m1,m2)!=answer', 'round((m1+m2)/2)!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_meanMedianSwap}}'), error: 'meanMedianSwap' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The two stretches made {{total}} {{item}} over {{d1}}+{{d2}} days.', 'That averages {{answer}} a day.'],
  answerSummary: { headline: 'Average over the days, not over the two averages.', text: 'The average is ${{answer}}$.' },
  hint: 'The two stretches are different lengths, so they do not weigh the same.',
  feedback: 'The lower of the two stretch averages is not the average of all the days.',
});

arc('6.12C', 'run-needed-to-lift-an-average', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
  prompt: '{{n}} runs averaged {{mean}} minutes and {{posted}} was posted as the next target. To lift the average of all {{np1}} runs to {{goal}}, how long must the next run take?',
  generator: {
    parameters: {
      n: { type: 'int', min: 3, max: 7 },
      mean: { type: 'int', min: 20, max: 45 },
      rise: { type: 'int', min: 1, max: 4 },
      posted: { type: 'int', min: 22, max: 66 },
    },
    derived: {
      np1: 'n+1',
      goal: 'mean+rise',
      answer: 'goal*np1-mean*n',
      d_forgotFinalStep: 'goal',
      d_operationInverted: 'mean*np1',
      d_usedGivenValue: 'posted',
    },
    constraints: ['posted!=answer', 'goal!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{np1}} runs at {{goal}} minutes need {{goal}}x{{np1}} minutes in total.', 'The first {{n}} used {{mean}}x{{n}}, so the next must take {{answer}}.'],
  answerSummary: { headline: 'Work with the totals the averages stand for.', text: 'It must take ${{answer}}$ minutes.' },
  hint: 'An average is a total shared out, so start from the totals.',
  feedback: 'The posted target is what was asked for, not what the arithmetic requires.',
});

arc('6.12C', 'average-pulled-by-one-large-load', {
  difficultyBand: 5, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'Five loads were logged as shown and {{logged}} was entered as the average. What is the average really?',
  stimulus: {
    kind: 'table',
    columns: ['Load', '{{item}}'],
    rows: [['1', '{{v1}}'], ['2', '{{v2}}'], ['3', '{{v3}}'], ['4', '{{v4}}'], ['5', '{{v5}}']],
  },
  generator: {
    parameters: {
      item: GOODS,
      base: { type: 'int', min: 10, max: 30 },
      s2: { type: 'int', min: 2, max: 8 },
      s3: { type: 'int', min: 9, max: 16 },
      s4: { type: 'int', min: 17, max: 24 },
      big: { type: 'int', min: 40, max: 90, step: 5 },
      logged: { type: 'int', min: 18, max: 62 },
    },
    derived: {
      v1: 'base',
      v2: 'base+s2',
      v3: 'base+s3',
      v4: 'base+s4',
      v5: 'base+big',
      total: 'v1+v2+v3+v4+v5',
      answer: 'round(total/5)',
      mean: 'answer',
      d_partialTotal: 'total',
      d_meanMedianSwap: 'v3',
      d_usedGivenValue: 'logged',
    },
    constraints: ['answer>v3', 'logged!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_meanMedianSwap}}'), error: 'meanMedianSwap' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The five loads total {{total}}, so the average is {{answer}}.', 'The middle value is {{v3}}, which the large last load pulls the average above.'],
  answerSummary: { headline: 'One large load pulls the average above the middle value.', text: 'The average is ${{answer}}$.' },
  hint: 'The middle value and the average are not the same thing here.',
  feedback: 'The middle of the five loads is not what they average.',
});

// ================================================================ 6.3B
// Scaling by fractions.

arc('6.3B', 'run-scaled-up-then-back', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A run of {{total}} {{item}} was raised to {{a}} for every {{b}}, then cut to {{c}} of every {{d}}. How many are there now?',
  generator: {
    parameters: {
      item: GOODS,
      base: { type: 'int', min: 4, max: 20 },
      b: { type: 'int', min: 2, max: 4 },
      up: { type: 'int', min: 1, max: 3 },
      c: { type: 'int', min: 1, max: 3 },
      dGap: { type: 'int', min: 1, max: 3 },
      planned: { type: 'int', min: 20, max: 250 },
    },
    derived: {
      a: 'b+up',
      d: 'c+dGap',
      total: 'base*b*d',
      raised: 'total*a/b',
      answer: 'raised*c/d',
      d_forgotFinalStep: 'raised',
      d_operationInverted: 'total*c/d',
      d_usedGivenValue: 'planned',
    },
    constraints: ['planned!=answer', 'total*c/d!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Raising {{total}} to {{a}} for every {{b}} gives {{raised}}.', 'Cutting that to {{c}} of every {{d}} leaves {{answer}}.'],
  answerSummary: { headline: 'The second scaling applies to the raised run.', text: 'There are ${{answer}}$ now.' },
  hint: 'The cut is taken from the run after it was raised, not from the original.',
  feedback: 'Cutting the original run skips the increase entirely.',
});

arc('6.3B', 'original-run-behind-a-cut', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
  prompt: 'A run was cut to {{num}} of every {{den}}, leaving {{after}} {{item}}. The sheet listed {{listed}}. How many were in the original run?',
  generator: {
    parameters: {
      item: GOODS,
      unit: { type: 'int', min: 6, max: 30 },
      num: { type: 'int', min: 2, max: 4 },
      gap: { type: 'int', min: 1, max: 3 },
      listed: { type: 'int', min: 25, max: 170 },
    },
    derived: {
      den: 'num+gap',
      answer: 'unit*den',
      after: 'unit*num',
      d_forgotFinalStep: 'after',
      d_operationInverted: 'after*den',
      d_usedGivenValue: 'listed',
    },
    constraints: ['listed!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{after}} is {{num}} of every {{den}}, so one share of the run is {{unit}}.', 'The whole run was {{den}} shares, or {{answer}}.'],
  answerSummary: { headline: 'Find one share before rebuilding the whole.', text: 'The run held ${{answer}}$.' },
  hint: 'The count left over covers only part of the original shares.',
  feedback: 'Multiplying the remainder by the whole denominator counts each share too often.',
});

arc('6.3B', 'scaling-row-that-does-not-hold', {
  difficultyBand: 5, dok: 3, taskType: 'errorAnalysis', representation: 'table',
  prompt: 'Every run below was scaled by the same fraction, except one. What should that run have finished at?',
  stimulus: {
    kind: 'table',
    columns: ['Before', 'After'],
    rows: [['{{b1}}', '{{a1}}'], ['{{b2}}', '{{a2}}'], ['{{b3}}', '{{aBad}}'], ['{{b4}}', '{{a4}}']],
  },
  generator: {
    parameters: {
      num: { type: 'int', min: 2, max: 4 },
      gap: { type: 'int', min: 1, max: 3 },
      u1: { type: 'int', min: 3, max: 8 },
      u3: { type: 'int', min: 11, max: 20 },
      off: { type: 'int', min: 4, max: 26 },
      sheet: { type: 'int', min: 20, max: 74 },
    },
    derived: {
      den: 'num+gap',
      u2: 'u1+2',
      u4: 'u1+4',
      b1: 'u1*den', a1: 'u1*num',
      b2: 'u2*den', a2: 'u2*num',
      b3: 'u3*den',
      answer: 'u3*num',
      aBad: 'answer+off',
      b4: 'u4*den', a4: 'u4*num',
      d_forgotFinalStep: 'aBad',
      d_offByOneStep: 'a2',
      d_usedGivenValue: 'sheet',
    },
    constraints: ['off!=num', 'sheet!=answer', 'aBad!=a4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The runs that agree keep {{num}} of every {{den}}.', '{{b3}} should finish at {{answer}}, not {{aBad}}.'],
  answerSummary: { headline: 'Recover the fraction from the runs that agree.', text: 'It should read ${{answer}}$.' },
  hint: 'Three runs share one scaling. Use them to test the fourth.',
  feedback: 'The figure recorded for that run is the error, not the correction.',
});

// ================================================================ 6.14C
// Running a financial record.

arc('6.14C', 'closing-balance-after-a-fee', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'table',
  prompt: 'A register opened at $\$\{{start}}$ and recorded the entries shown, then a $\$\{{fee}}$ service charge. What is the closing balance?',
  stimulus: {
    kind: 'table',
    columns: ['Entry', 'Amount'],
    rows: [['Deposit', '$\$\{{dep}}$'], ['Withdrawal', '$\$\{{wd}}$'], ['Deposit', '$\$\{{dep2}}$']],
  },
  generator: {
    parameters: {
      start: { type: 'int', min: 120, max: 600, step: 10 },
      dep: { type: 'int', min: 40, max: 200, step: 10 },
      dep2: { type: 'int', min: 30, max: 180, step: 10 },
      wd: { type: 'int', min: 50, max: 250, step: 10 },
      fee: { type: 'int', min: 5, max: 30, step: 5 },
      statement: { type: 'int', min: 100, max: 800, step: 10 },
    },
    derived: {
      answer: 'start+dep+dep2-wd-fee',
      d_operationInverted: 'start+dep+dep2+wd-fee',
      d_forgotFinalStep: 'start+dep+dep2-wd-fee-fee',
      d_usedGivenValue: 'statement',
    },
    constraints: ['start+dep+dep2-wd-fee>0', 'statement!=answer'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The two deposits add $\$\{{dep}}$ and $\$\{{dep2}}$; the withdrawal takes $\$\{{wd}}$.', 'After the $\$\{{fee}}$ charge the balance is $\$\{{answer}}$.'],
  answerSummary: { headline: 'Deposits add, withdrawals and charges take away.', text: 'It closes at $\$\{{answer}}$.' },
  hint: 'A service charge leaves the account like a withdrawal.',
  feedback: 'Adding the withdrawal moves the balance the wrong way.',
});

arc('6.14C', 'entry-that-is-missing', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'A register opened at $\$\{{start}}$, took a $\$\{{dep}}$ deposit and one withdrawal, and closed at $\$\{{close}}$. What was the withdrawal?',
  generator: {
    parameters: {
      start: { type: 'int', min: 150, max: 700, step: 10 },
      dep: { type: 'int', min: 40, max: 220, step: 10 },
      wd: { type: 'int', min: 60, max: 400, step: 10 },
      noted: { type: 'int', min: 50, max: 420, step: 10 },
    },
    derived: {
      close: 'start+dep-wd',
      answer: 'wd',
      d_operationInverted: 'start+dep+close',
      d_forgotFinalStep: 'abs(start-close)',
      d_usedGivenValue: 'noted',
    },
    constraints: ['start+dep-wd>0', 'noted!=answer', 'abs(start-close)!=wd'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['After the deposit the register held $\$\{{start}}$+$\$\{{dep}}$.', 'Closing at $\$\{{close}}$ means $\$\{{answer}}$ went out.'],
  answerSummary: { headline: 'Add the deposit before working out what left.', text: 'The withdrawal was $\$\{{answer}}$.' },
  hint: 'The deposit went in before the withdrawal came out.',
  feedback: 'Comparing the opening and closing balances ignores the deposit.',
});

arc('6.14C', 'largest-withdrawal-that-clears', {
  difficultyBand: 5, dok: 3, taskType: 'interpretation', representation: 'context',
  prompt: 'A register holds $\$\{{start}}$ with $\$\{{pending}}$ of payments still to clear. The account must keep $\$\{{floor}}$. What is the largest whole withdrawal?',
  generator: {
    parameters: {
      floor: { type: 'int', min: 25, max: 100, step: 25 },
      pending: { type: 'int', min: 40, max: 260, step: 10 },
      room: { type: 'int', min: 30, max: 380, step: 10 },
      offered: { type: 'int', min: 30, max: 420, step: 10 },
    },
    derived: {
      start: 'floor+pending+room',
      answer: 'room',
      d_percentNotApplied: 'start-floor',
      d_forgotFinalStep: 'start-pending-floor-floor',
      d_usedGivenValue: 'offered',
    },
    constraints: ['start-pending-floor-floor>0', 'offered!=answer'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_percentNotApplied}}'), error: 'percentNotApplied' },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The $\$\{{pending}}$ still to clear and the $\$\{{floor}}$ that must stay are both spoken for.', 'That leaves $\$\{{answer}}$ available.'],
  answerSummary: { headline: 'Payments not yet cleared are already committed.', text: 'The largest withdrawal is $\$\{{answer}}$.' },
  hint: 'Two amounts in the account are not available to withdraw.',
  feedback: 'Leaving only the minimum forgets the payments still to clear.',
});

// ================================================================ 7.13A
// Income tax and deductions.

arc('7.13A', 'take-home-after-tax-and-dues', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A {{worker}} earned $\$\{{gross}}$, paid {{p}}% income tax and then $\$\{{dues}}$ in union dues. What was left?',
  generator: {
    parameters: {
      worker: contextParam(['mechanic', 'technician', 'driver', 'fitter', 'welder']),
      hundreds: { type: 'int', min: 8, max: 30 },
      p: { type: 'int', min: 10, max: 30, step: 5 },
      dues: { type: 'int', min: 20, max: 120, step: 10 },
      quoted: { type: 'int', min: 500, max: 2600, step: 20 },
    },
    derived: {
      gross: 'hundreds*100',
      tax: 'gross*p/100',
      answer: 'gross-tax-dues',
      d_percentNotApplied: 'gross-dues',
      d_forgotFinalStep: 'gross-tax-dues-dues',
      d_usedGivenValue: 'quoted',
    },
    constraints: ['gross-tax-dues-dues>0', 'quoted!=answer'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_percentNotApplied}}'), error: 'percentNotApplied' },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{p}}% of $\$\{{gross}}$ is $\$\{{tax}}$ in tax.', 'Taking that and the $\$\{{dues}}$ dues leaves $\$\{{answer}}$.'],
  answerSummary: { headline: 'Tax and dues both come out of the gross.', text: '$\$\{{answer}}$ was left.' },
  hint: 'The dues are a flat amount, not a percentage.',
  feedback: 'Taking only the dues leaves the tax unpaid.',
});

arc('7.13A', 'gross-behind-a-pay-slip', {
  difficultyBand: 5, dok: 3, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'After {{p}}% income tax and a flat $\$\{{dues}}$ deduction, a {{worker}} took home $\$\{{net}}$. What was the gross pay?',
  generator: {
    parameters: {
      worker: contextParam(['mechanic', 'technician', 'driver', 'fitter', 'welder']),
      hundreds: { type: 'int', min: 8, max: 30 },
      p: { type: 'int', min: 10, max: 30, step: 5 },
      dues: { type: 'int', min: 20, max: 120, step: 10 },
      slip: { type: 'int', min: 600, max: 2800, step: 20 },
    },
    derived: {
      answer: 'hundreds*100',
      tax: 'answer*p/100',
      net: 'answer-tax-dues',
      d_percentNotApplied: 'net+dues',
      d_partialTotal: 'answer+dues',
      d_usedGivenValue: 'slip',
    },
    constraints: ['answer-tax-dues>0', 'slip!=answer'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_percentNotApplied}}'), error: 'percentNotApplied' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Adding the $\$\{{dues}}$ back gives $\$\{{d_percentNotApplied}}$, which is {{100-p}}% of the gross.', 'That makes the gross $\$\{{answer}}$.'],
  answerSummary: { headline: 'Put the flat deduction back before undoing the percentage.', text: 'The gross was $\$\{{answer}}$.' },
  hint: 'The dues came off after the tax, so they go back on first.',
  feedback: 'The dues came out of the gross, so adding them on top overstates it.',
});

arc('7.13A', 'which-bracket-the-receipt-shows', {
  difficultyBand: 5, dok: 3, taskType: 'errorAnalysis', representation: 'table',
  prompt: 'Two earners were taxed at the same rate, but one line is wrong. What tax should that line show?',
  stimulus: {
    kind: 'table',
    columns: ['Earner', 'Gross', 'Tax'],
    rows: [['A', '$\$\{{g1}}$', '$\$\{{t1}}$'], ['B', '$\$\{{g2}}$', '$\$\{{tBad}}$'], ['C', '$\$\{{g3}}$', '$\$\{{t3}}$']],
  },
  generator: {
    parameters: {
      p: { type: 'int', min: 10, max: 30, step: 5 },
      h1: { type: 'int', min: 8, max: 16 },
      h2: { type: 'int', min: 18, max: 32 },
      h3: { type: 'int', min: 34, max: 48 },
      off: { type: 'int', min: 15, max: 120, step: 5 },
      filed: { type: 'int', min: 150, max: 900, step: 10 },
    },
    derived: {
      g1: 'h1*100', g2: 'h2*100', g3: 'h3*100',
      t1: 'g1*p/100',
      answer: 'g2*p/100',
      t3: 'g3*p/100',
      tBad: 'answer+off',
      d_forgotFinalStep: 'tBad',
      d_offByOneStep: 't1',
      d_usedGivenValue: 'filed',
    },
    constraints: ['filed!=answer', 'tBad!=t3'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Earners A and C are both taxed at {{p}}%.', '{{p}}% of $\$\{{g2}}$ is $\$\{{answer}}$, not the $\$\{{tBad}}$ shown.'],
  answerSummary: { headline: 'Recover the rate from the lines that agree.', text: 'It should show $\$\{{answer}}$.' },
  hint: 'Two of the three lines share one rate. Use them to test the third.',
  feedback: 'The tax printed on that line is the error, not the correction.',
});

// ================================================================ 7.13E
// Simple and compound interest.

arc('7.13E', 'interest-then-a-further-deposit', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A {{worker}} put $\$\{{principal}}$ into an account paying {{r}}% simple interest a year. After {{years}} years they added $\$\{{added}}$. What is the balance?',
  generator: {
    parameters: {
      worker: contextParam(['mechanic', 'technician', 'driver', 'fitter', 'welder']),
      hundreds: { type: 'int', min: 4, max: 20 },
      r: { type: 'int', min: 2, max: 10 },
      years: { type: 'int', min: 2, max: 6 },
      added: { type: 'int', min: 50, max: 400, step: 25 },
      shown: { type: 'int', min: 500, max: 2800, step: 20 },
    },
    derived: {
      principal: 'hundreds*100',
      interest: 'principal*r*years/100',
      answer: 'principal+interest+added',
      d_partialTotal: 'answer+interest',
      d_forgotFinalStep: 'principal+interest',
      d_usedGivenValue: 'shown',
    },
    constraints: ['shown!=answer'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{r}}% of $\$\{{principal}}$ for {{years}} years is $\$\{{interest}}$ of interest.', 'With the $\$\{{added}}$ deposit the balance is $\$\{{answer}}$.'],
  answerSummary: { headline: 'Interest first, then the new money.', text: 'The balance is $\$\{{answer}}$.' },
  hint: 'Simple interest is the same amount every year.',
  feedback: 'The deposit still has to be added after the interest.',
});

arc('7.13E', 'principal-behind-the-interest', {
  difficultyBand: 5, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
  prompt: 'An account paying {{r}}% simple interest a year earned $\$\{{interest}}$ over {{years}} years. What was put in at the start?',
  generator: {
    parameters: {
      hundreds: { type: 'int', min: 4, max: 24 },
      r: { type: 'int', min: 2, max: 10 },
      years: { type: 'int', min: 2, max: 6 },
      filed: { type: 'int', min: 300, max: 2800, step: 20 },
    },
    derived: {
      answer: 'hundreds*100',
      interest: 'answer*r*years/100',
      d_forgotFinalStep: 'round(interest*100/r)',
      d_partialTotal: 'interest',
      d_usedGivenValue: 'filed',
    },
    constraints: ['filed!=answer', 'round(interest*100/r)!=answer'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Over {{years}} years at {{r}}% the account earns {{r}}x{{years}}% of the principal.', '$\$\{{interest}}$ is that share, so the principal was $\$\{{answer}}$.'],
  answerSummary: { headline: 'The rate applies once for every year.', text: '$\$\{{answer}}$ was put in.' },
  hint: 'Total simple interest is the yearly rate multiplied by the number of years.',
  feedback: 'The interest earned is not the amount that was put in.',
});

arc('7.13E', 'compound-balance-after-two-years', {
  difficultyBand: 5, dok: 3, taskType: 'interpretation', representation: 'context',
  prompt: 'A {{worker}} put $\$\{{principal}}$ into an account paying {{r}}% compounded yearly. What is the balance after two years?',
  generator: {
    parameters: {
      worker: contextParam(['mechanic', 'technician', 'driver', 'fitter', 'welder']),
      hundreds: { type: 'int', min: 10, max: 40 },
      r: { type: 'int', min: 5, max: 25, step: 5 },
      posted: { type: 'int', min: 1000, max: 5600, step: 40 },
    },
    derived: {
      principal: 'hundreds*100',
      year1: 'principal*(100+r)/100',
      answer: 'year1*(100+r)/100',
      d_simpleForCompound: 'principal+2*principal*r/100',
      d_partialTotal: 'answer+principal*r/100',
      d_usedGivenValue: 'posted',
    },
    constraints: ['posted!=answer'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_simpleForCompound}}'), error: 'simpleForCompound' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['After one year the account holds $\$\{{year1}}$.', 'The second year pays {{r}}% of that, giving $\$\{{answer}}$.'],
  answerSummary: { headline: 'The second year earns interest on the first year of interest.', text: 'The balance is $\$\{{answer}}$.' },
  hint: 'Compounding pays on the balance, not on the original deposit.',
  feedback: 'Two years of simple interest misses the interest earned on interest.',
});

// ================================================================ 7.13F
// Discounts, coupons and what is actually paid.

arc('7.13F', 'sale-then-coupon-then-tax', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A {{tool}} listed at $\$\{{price}}$ is cut {{p}}%, then a $\$\{{coupon}}$ coupon comes off. Sales tax of {{t}}% is added. What is paid?',
  generator: {
    parameters: {
      tool: contextParam(['drill', 'compressor', 'welder', 'generator', 'grinder']),
      hundreds: { type: 'int', min: 2, max: 9 },
      p: { type: 'int', min: 10, max: 40, step: 10 },
      coupon: { type: 'int', min: 10, max: 50, step: 10 },
      t: { type: 'int', min: 5, max: 25, step: 5 },
      posted: { type: 'int', min: 90, max: 700, step: 10 },
    },
    derived: {
      price: 'hundreds*100',
      sale: 'price*(100-p)/100',
      afterCoupon: 'sale-coupon',
      answer: 'afterCoupon*(100+t)/100',
      d_forgotFinalStep: 'afterCoupon',
      d_percentNotApplied: '(price-coupon)*(100+t)/100',
      d_usedGivenValue: 'posted',
    },
    constraints: ['sale-coupon>0', 'posted!=answer'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_percentNotApplied}}'), error: 'percentNotApplied' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{p}}% off leaves $\$\{{sale}}$, and the coupon brings it to $\$\{{afterCoupon}}$.', 'Adding {{t}}% tax gives $\$\{{answer}}$.'],
  answerSummary: { headline: 'Tax is charged on what is actually owed.', text: 'The price paid is $\$\{{answer}}$.' },
  hint: 'The tax goes on last, after both reductions.',
  feedback: 'Leaving the sale discount out overstates what the tax is charged on.',
});

arc('7.13F', 'list-price-behind-a-till-receipt', {
  difficultyBand: 5, dok: 3, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'After {{p}}% was taken off and a $\$\{{coupon}}$ coupon applied, a {{tool}} came to $\$\{{paid}}$. The ticket read $\$\{{ticket}}$. What was the list price?',
  generator: {
    parameters: {
      tool: contextParam(['drill', 'compressor', 'welder', 'generator', 'grinder']),
      hundreds: { type: 'int', min: 2, max: 9 },
      p: { type: 'int', min: 10, max: 40, step: 10 },
      coupon: { type: 'int', min: 10, max: 50, step: 10 },
      ticket: { type: 'int', min: 130, max: 1000, step: 10 },
    },
    derived: {
      answer: 'hundreds*100',
      sale: 'answer*(100-p)/100',
      paid: 'sale-coupon',
      d_forgotFinalStep: 'paid+coupon',
      d_partialTotal: 'answer+coupon',
      d_usedGivenValue: 'ticket',
    },
    constraints: ['sale-coupon>0', 'ticket!=answer'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Adding the coupon back gives $\$\{{sale}}$, which is {{100-p}}% of the list price.', 'That makes the list price $\$\{{answer}}$.'],
  answerSummary: { headline: 'Put the coupon back before undoing the percentage.', text: 'The list price was $\$\{{answer}}$.' },
  hint: 'The coupon came off after the discount, so it goes back on first.',
  feedback: 'Restoring the coupon still leaves the percentage to undo.',
});

arc('7.13F', 'how-many-the-budget-buys-on-sale', {
  difficultyBand: 5, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'The sale below runs while $\$\{{budget}}$ is available to spend. How many {{tool}}s can be bought?',
  stimulus: {
    kind: 'table',
    columns: ['Item', 'Value'],
    rows: [['List price', '$\$\{{price}}$'], ['Sale', '{{p}}% off'], ['Ordered last time', '{{ordered}}']],
  },
  generator: {
    parameters: {
      tool: contextParam(['drill', 'compressor', 'welder', 'generator', 'grinder']),
      tens: { type: 'int', min: 6, max: 20 },
      p: { type: 'int', min: 10, max: 40, step: 10 },
      cut: { type: 'int', min: 5, max: 30, step: 5 },
      budget: { type: 'int', min: 400, max: 1800, step: 50 },
      ordered: { type: 'int', min: 2, max: 20 },
    },
    derived: {
      price: 'tens*10',
      sale: 'price*(100-p)/100',
      answer: 'floor(budget/sale)',
      d_percentNotApplied: 'floor(budget/price)',
      d_forgotFinalStep: 'floor(budget/(sale-cut))',
      d_usedGivenValue: 'ordered',
    },
    constraints: ['sale-cut>0', 'ordered!=answer', 'floor(budget/sale)>0'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_percentNotApplied}}'), error: 'percentNotApplied' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{p}}% off $\$\{{price}}$ leaves $\$\{{sale}}$ each.', '$\$\{{budget}}$ buys {{answer}} whole ones at that price.'],
  answerSummary: { headline: 'Price one at the sale rate before dividing the budget.', text: '${{answer}}$ can be bought.' },
  hint: 'Only whole ones can be bought.',
  feedback: 'Using the list price prices them higher than the sale allows.',
});

// ================================================================ 8.12A
// Borrowing cost.

arc('8.12A', 'total-repaid-on-a-simple-loan', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A {{worker}} borrows $\$\{{principal}}$ at {{r}}% simple interest for {{years}} years, plus a $\$\{{fee}}$ arrangement fee. What is repaid in all?',
  generator: {
    parameters: {
      worker: contextParam(['mechanic', 'technician', 'driver', 'fitter', 'welder']),
      hundreds: { type: 'int', min: 5, max: 30 },
      r: { type: 'int', min: 4, max: 12 },
      years: { type: 'int', min: 2, max: 6 },
      fee: { type: 'int', min: 20, max: 150, step: 10 },
      quoted: { type: 'int', min: 700, max: 4200, step: 20 },
    },
    derived: {
      principal: 'hundreds*100',
      interest: 'principal*r*years/100',
      answer: 'principal+interest+fee',
      d_partialTotal: 'answer+interest',
      d_forgotFinalStep: 'principal+interest',
      d_usedGivenValue: 'quoted',
    },
    constraints: ['quoted!=answer'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{r}}% for {{years}} years on $\$\{{principal}}$ is $\$\{{interest}}$ of interest.', 'With the $\$\{{fee}}$ fee the total repaid is $\$\{{answer}}$.'],
  answerSummary: { headline: 'The fee is repaid alongside the loan and its interest.', text: '$\$\{{answer}}$ is repaid.' },
  hint: 'Three amounts make up the repayment.',
  feedback: 'Leaving the fee out understates what is owed.',
});

arc('8.12A', 'term-behind-the-interest-charged', {
  difficultyBand: 5, dok: 3, taskType: 'reverseReasoning', representation: 'verbal',
  prompt: 'A $\$\{{principal}}$ loan at {{r}}% simple interest was charged $\$\{{interest}}$ in interest. The agreement listed {{stated}} years. How many years did it run?',
  generator: {
    parameters: {
      hundreds: { type: 'int', min: 5, max: 30 },
      r: { type: 'int', min: 4, max: 12 },
      years: { type: 'int', min: 2, max: 9 },
      stated: { type: 'int', min: 1, max: 9 },
    },
    derived: {
      principal: 'hundreds*100',
      yearly: 'principal*r/100',
      interest: 'yearly*years',
      answer: 'years',
      d_operationInverted: 'round(interest/r)',
      d_forgotFinalStep: 'round(interest/principal)',
      d_usedGivenValue: 'stated',
    },
    constraints: ['stated!=answer', 'round(interest/r)!=answer', 'round(interest/principal)!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['One year at {{r}}% on $\$\{{principal}}$ is $\$\{{yearly}}$.', '$\$\{{interest}}$ divided by that is {{answer}} years.'],
  answerSummary: { headline: 'Find one year of interest before dividing.', text: 'It ran ${{answer}}$ years.' },
  hint: 'Work out what a single year costs first.',
  feedback: 'The listed term is what the paperwork claims, not what the interest shows.',
});

arc('8.12A', 'monthly-payment-on-a-loan', {
  difficultyBand: 5, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'A loan is set out below. What is the monthly payment?',
  stimulus: {
    kind: 'table',
    columns: ['Item', 'Value'],
    rows: [['Amount borrowed', '$\$\{{principal}}$'], ['Simple interest', '{{r}}% a year'], ['Term', '{{years}} years']],
  },
  generator: {
    parameters: {
      hundreds: { type: 'int', min: 6, max: 24 },
      r: { type: 'int', min: 4, max: 12 },
      years: { type: 'int', min: 2, max: 5 },
      offered: { type: 'int', min: 15, max: 95, step: 5 },
    },
    derived: {
      principal: 'hundreds*100',
      interest: 'principal*r*years/100',
      total: 'principal+interest',
      months: 'years*12',
      answer: 'round(total/months)',
      d_percentNotApplied: 'round(principal/months)',
      d_operationInverted: 'round(total/years)',
      d_usedGivenValue: 'offered',
    },
    constraints: ['offered!=answer', 'round(principal/months)!=answer'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_percentNotApplied}}'), error: 'percentNotApplied' },
    { label: money('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The interest is $\$\{{interest}}$, so $\$\{{total}}$ is repaid over {{months}} months.', 'That is about $\$\{{answer}}$ a month.'],
  answerSummary: { headline: 'Interest is repaid alongside the amount borrowed.', text: 'It is about $\$\{{answer}}$ a month.' },
  hint: 'The term is given in years but the payments are monthly.',
  feedback: 'Spreading only the amount borrowed leaves the interest unpaid.',
});

// ================================================================ 8.12B
// Repaying what is owed.

arc('8.12B', 'card-balance-after-interest-and-payment', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A card balance of $\$\{{balance}}$ is charged {{r}}% interest for the month, then a payment of $\$\{{payment}}$ is made. What is owed?',
  generator: {
    parameters: {
      hundreds: { type: 'int', min: 3, max: 18 },
      r: { type: 'int', min: 2, max: 5 },
      payment: { type: 'int', min: 50, max: 400, step: 25 },
      statement: { type: 'int', min: 90, max: 1700, step: 10 },
    },
    derived: {
      balance: 'hundreds*100',
      interest: 'balance*r/100',
      answer: 'balance+interest-payment',
      d_operationInverted: 'balance-interest-payment',
      d_partialTotal: 'balance+interest',
      d_usedGivenValue: 'statement',
    },
    constraints: ['balance-interest-payment>0', 'statement!=answer'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{r}}% of $\$\{{balance}}$ adds $\$\{{interest}}$ of interest.', 'The $\$\{{payment}}$ payment then leaves $\$\{{answer}}$ owing.'],
  answerSummary: { headline: 'Interest is added before the payment comes off.', text: '$\$\{{answer}}$ is owed.' },
  hint: 'The interest is charged on the balance before anything is paid.',
  feedback: 'Interest increases what is owed; it does not reduce it.',
});

arc('8.12B', 'months-to-clear-a-balance', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'A balance of $\$\{{balance}}$ carries no further interest and $\$\{{already}}$ has been paid. At $\$\{{payment}}$ a month, how many more months clear it?',
  generator: {
    parameters: {
      payment: { type: 'int', min: 40, max: 150, step: 10 },
      months: { type: 'int', min: 4, max: 15 },
      already: { type: 'int', min: 50, max: 400, step: 25 },
      plan: { type: 'int', min: 3, max: 16 },
    },
    derived: {
      balance: 'already+payment*months',
      answer: 'months',
      d_percentNotApplied: 'round(balance/payment)',
      d_forgotFinalStep: 'round(already/payment)',
      d_usedGivenValue: 'plan',
    },
    constraints: ['plan!=answer', 'round(already/payment)!=months', 'round(balance/payment)!=months'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_percentNotApplied}}'), error: 'percentNotApplied' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The $\$\{{already}}$ already paid leaves $\$\{{payment}}$x{{months}} outstanding.', 'At $\$\{{payment}}$ a month that is {{answer}} more months.'],
  answerSummary: { headline: 'Only the unpaid part still takes months.', text: 'It takes ${{answer}}$ more months.' },
  hint: 'Part of the balance has already gone.',
  feedback: 'Dividing the whole balance ignores what has been paid.',
});

arc('8.12B', 'extra-paid-over-the-amount-borrowed', {
  difficultyBand: 5, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'A loan is repaid on the terms below. How much more than the amount borrowed is handed over?',
  stimulus: {
    kind: 'table',
    columns: ['Item', 'Value'],
    rows: [['Borrowed', '$\$\{{principal}}$'], ['Monthly payment', '$\$\{{payment}}$'], ['Months', '{{months}}']],
  },
  generator: {
    parameters: {
      hundreds: { type: 'int', min: 4, max: 16 },
      extraPer: { type: 'int', min: 5, max: 30, step: 5 },
      months: { type: 'int', min: 6, max: 24, step: 6 },
      billed: { type: 'int', min: 40, max: 480, step: 10 },
    },
    derived: {
      principal: 'hundreds*100',
      payment: 'round(principal/months)+extraPer',
      total: 'payment*months',
      answer: 'total-principal',
      d_forgotFinalStep: 'total',
      d_partialTotal: 'payment',
      d_usedGivenValue: 'billed',
    },
    constraints: ['total-principal>0', 'billed!=answer'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{months}} payments of $\$\{{payment}}$ come to $\$\{{total}}$.', 'That is $\$\{{answer}}$ more than the $\$\{{principal}}$ borrowed.'],
  answerSummary: { headline: 'Total the payments before comparing with the loan.', text: '$\$\{{answer}}$ more is handed over.' },
  hint: 'Work out everything paid, then set it against what was borrowed.',
  feedback: 'The whole amount handed over is not the same as the extra above the loan.',
});

// ================================================================ 7.4D
// Percent increase and decrease.

arc('7.4D', 'value-after-two-falls', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A {{tool}} worth $\$\{{value}}$ falls {{p}}% in one year, then {{q}}% of its new value the next. What is it worth then?',
  generator: {
    parameters: {
      tool: contextParam(['drill', 'compressor', 'welder', 'generator', 'grinder']),
      hundreds: { type: 'int', min: 4, max: 20 },
      p: { type: 'int', min: 10, max: 40, step: 10 },
      q: { type: 'int', min: 10, max: 40, step: 10 },
      appraised: { type: 'int', min: 200, max: 1250, step: 10 },
    },
    derived: {
      value: 'hundreds*100',
      afterOne: 'value*(100-p)/100',
      answer: 'afterOne*(100-q)/100',
      d_forgotFinalStep: 'afterOne',
      d_percentNotApplied: 'value*(100-p-q)/100',
      d_usedGivenValue: 'appraised',
    },
    constraints: ['p+q<90', 'appraised!=answer'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_percentNotApplied}}'), error: 'percentNotApplied' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['A {{p}}% fall leaves $\$\{{afterOne}}$.', 'A further {{q}}% off that leaves $\$\{{answer}}$.'],
  answerSummary: { headline: 'The second fall applies to the reduced value.', text: 'It is worth $\$\{{answer}}$.' },
  hint: 'The second year loses a share of the new value, not the original.',
  feedback: 'Adding the two percentages treats both falls as coming off the first value.',
});

arc('7.4D', 'value-before-a-rise-and-a-fee', {
  difficultyBand: 5, dok: 3, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'After rising {{p}}% and a $\$\{{fee}}$ fitting charge, a {{tool}} stands at $\$\{{after}}$. What was it before?',
  generator: {
    parameters: {
      tool: contextParam(['drill', 'compressor', 'welder', 'generator', 'grinder']),
      hundreds: { type: 'int', min: 3, max: 18 },
      p: { type: 'int', min: 10, max: 50, step: 10 },
      fee: { type: 'int', min: 20, max: 120, step: 10 },
      listed: { type: 'int', min: 250, max: 1900, step: 10 },
    },
    derived: {
      answer: 'hundreds*100',
      risen: 'answer*(100+p)/100',
      after: 'risen+fee',
      d_percentNotApplied: 'after-fee',
      // Taking the rise off again always lands below the original, because
      // (100+p)(100-p) is less than 10000 for any p.
      d_wrongPercentBase: 'round((after-fee)*(100-p)/100)',
      d_usedGivenValue: 'listed',
    },
    constraints: ['listed!=answer'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_percentNotApplied}}'), error: 'percentNotApplied' },
    { label: money('{{d_wrongPercentBase}}'), error: 'wrongPercentBase' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Taking off the $\$\{{fee}}$ charge leaves $\$\{{risen}}$, which is {{100+p}}% of the old value.', 'That makes it $\$\{{answer}}$ before.'],
  answerSummary: { headline: 'Remove the flat charge before undoing the rise.', text: 'It was $\$\{{answer}}$.' },
  hint: 'The fitting charge is not part of what rose.',
  feedback: 'Taking the same percentage off again does not undo a rise.',
});

arc('7.4D', 'percent-rise-between-two-readings', {
  difficultyBand: 5, dok: 3, taskType: 'errorAnalysis', representation: 'table',
  prompt: 'Output was logged over two years as shown. What was the percent increase?',
  stimulus: {
    kind: 'table',
    columns: ['Year', '{{item}}'],
    rows: [['1', '{{before}}'], ['2', '{{after}}']],
  },
  generator: {
    parameters: {
      item: GOODS,
      hundreds: { type: 'int', min: 2, max: 12 },
      p: { type: 'int', min: 10, max: 60, step: 5 },
      claimed: { type: 'int', min: 10, max: 60, step: 5 },
    },
    derived: {
      before: 'hundreds*100',
      after: 'before*(100+p)/100',
      answer: 'p',
      d_wrongPercentBase: 'round((after-before)*100/after)',
      d_percentNotApplied: 'round(after*100/before)',
      d_usedGivenValue: 'claimed',
    },
    constraints: ['claimed!=answer', 'round((after-before)*100/after)!=p'],
  },
  choices: [
    { label: plain('{{answer}}\\%'), correct: true },
    { label: plain('{{d_wrongPercentBase}}\\%'), error: 'wrongPercentBase' },
    { label: plain('{{d_percentNotApplied}}\\%'), error: 'percentNotApplied' },
    { label: plain('{{d_usedGivenValue}}\\%'), error: 'usedGivenValue' },
  ],
  reasoning: ['The rise is {{after}}-{{before}}, measured against the first year.', 'That is {{answer}}% of {{before}}.'],
  answerSummary: { headline: 'A percent increase is measured against the starting value.', text: 'It rose ${{answer}}\\%$.' },
  hint: 'The base of a percent increase is where it started, not where it finished.',
  feedback: 'Measuring the rise against the later figure uses the wrong base.',
});

// ================================================================ 7.4E
// Converting between measurement systems.

arc('7.4E', 'drums-then-cost-from-a-tank', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'Using 1 gallon = 4 litres, a {{litres}}-litre tank is emptied into {{size}}-gallon drums. Each drum costs $\$\{{each}}$ to ship. What is the shipping bill?',
  generator: {
    parameters: {
      size: { type: 'int', min: 2, max: 6 },
      drums: { type: 'int', min: 5, max: 24 },
      each: { type: 'int', min: 3, max: 15 },
      billed: { type: 'int', min: 25, max: 235, step: 5 },
    },
    derived: {
      gallons: 'size*drums',
      litres: 'gallons*4',
      answer: 'drums*each',
      d_unitConversion: 'litres*each',
      d_forgotFinalStep: 'drums',
      d_usedGivenValue: 'billed',
    },
    constraints: ['billed!=answer'],
  },
  choices: [
    { label: money('{{answer}}'), correct: true },
    { label: money('{{d_unitConversion}}'), error: 'unitConversion' },
    { label: money('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: money('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{litres}} litres is {{gallons}} gallons, which fills {{drums}} drums of {{size}} gallons.', 'At $\$\{{each}}$ a drum that is $\$\{{answer}}$.'],
  answerSummary: { headline: 'Litres to gallons to drums, then price the drums.', text: 'The bill is $\$\{{answer}}$.' },
  hint: 'The shipping is charged per drum, not per litre.',
  feedback: 'Pricing every litre charges far more than the drums cost.',
});

arc('7.4E', 'litres-needed-to-fill-an-order', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'Using 1 gallon = 4 litres, an order needs {{drums}} drums holding {{size}} gallons each. {{have}} litres are already in store. How many more litres are needed?',
  generator: {
    parameters: {
      size: { type: 'int', min: 2, max: 6 },
      drums: { type: 'int', min: 6, max: 26 },
      have: { type: 'int', min: 20, max: 200, step: 10 },
      quoted: { type: 'int', min: 20, max: 480, step: 10 },
    },
    derived: {
      gallons: 'size*drums',
      needLitres: 'gallons*4',
      answer: 'needLitres-have',
      d_unitConversion: 'gallons-have',
      d_forgotFinalStep: 'needLitres',
      d_usedGivenValue: 'quoted',
    },
    constraints: ['needLitres-have>0', 'gallons-have>0', 'quoted!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_unitConversion}}'), error: 'unitConversion' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{drums}} drums of {{size}} gallons is {{gallons}} gallons, or {{needLitres}} litres.', 'With {{have}} already in store, {{answer}} more are needed.'],
  answerSummary: { headline: 'Convert the order to litres before subtracting the stock.', text: '${{answer}}$ more litres are needed.' },
  hint: 'The stock is measured in litres, so the order has to be too.',
  feedback: 'Subtracting litres from gallons compares two different units.',
});

arc('7.4E', 'heavier-load-across-two-systems', {
  difficultyBand: 5, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'Using 1 kilogram = 1000 grams, two loads were weighed as shown. What is the heavier load in grams?',
  stimulus: {
    kind: 'table',
    columns: ['Load', 'Weight'],
    rows: [['A', '{{kg}} kilograms'], ['B', '{{grams}} grams']],
  },
  generator: {
    parameters: {
      kg: { type: 'int', min: 2, max: 9 },
      gramsK: { type: 'int', min: 1, max: 9 },
      gapHundreds: { type: 'int', min: 1, max: 9 },
      docket: { type: 'int', min: 4000, max: 10500, step: 100 },
    },
    derived: {
      grams: 'gramsK*1000+gapHundreds*100',
      kgGrams: 'kg*1000',
      answer: 'max(kgGrams,grams)',
      d_unitConversion: 'min(kgGrams,grams)',
      d_partialTotal: 'kgGrams+grams',
      d_usedGivenValue: 'docket',
    },
    constraints: ['kgGrams!=grams', 'docket!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_unitConversion}}'), error: 'unitConversion' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{kg}} kilograms is {{kgGrams}} grams, against load B at {{grams}} grams.', 'The heavier of the two is {{answer}} grams.'],
  answerSummary: { headline: 'Put both weights in one unit before comparing.', text: 'The heavier load is ${{answer}}$ grams.' },
  hint: 'A number of kilograms cannot be compared with a number of grams directly.',
  feedback: 'The lighter of the two loads is not what the question asks for.',
});

// ================================================================ 7.3B
// Operations with signed and rational numbers.

arc('7.3B', 'temperature-over-two-nights', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A reading of {{start}} degrees fell {{d1}} overnight, rose {{r1}} by afternoon, then fell {{d2}} the next night. What does it read?',
  generator: {
    parameters: {
      start: { type: 'int', min: 30, max: 70 },
      d1: { type: 'int', min: 8, max: 30 },
      r1: { type: 'int', min: 5, max: 25 },
      d2: { type: 'int', min: 6, max: 28 },
      gauge: { type: 'int', min: 20, max: 59 },
    },
    derived: {
      answer: 'start-d1+r1-d2',
      d_signError: 'start-d1-r1-d2',
      d_forgotFinalStep: 'start-d1+r1',
      d_usedGivenValue: 'gauge',
    },
    constraints: ['gauge!=answer', 'start-d1+r1-d2>0', 'start-d1-r1-d2>0'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_signError}}'), error: 'signError' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['{{start}} less {{d1}} then plus {{r1}} reaches {{d_forgotFinalStep}}.', 'A further fall of {{d2}} leaves {{answer}}.'],
  answerSummary: { headline: 'Apply the changes in the order they happened.', text: 'It reads ${{answer}}$ degrees.' },
  hint: 'Each change acts on the reading the one before it left.',
  feedback: 'Treating the afternoon rise as another fall moves the reading the wrong way.',
});

arc('7.3B', 'stock-before-four-adjustments', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'table',
  prompt: 'The adjustments below were applied to a stock of {{item}}, leaving {{end}}. What was the stock before them?',
  stimulus: {
    kind: 'table',
    columns: ['Adjustment', 'Change'],
    rows: [['1', '+{{a}}'], ['2', '-{{b}}'], ['3', '+{{c}}'], ['4', '-{{d}}']],
  },
  generator: {
    parameters: {
      item: GOODS,
      a: { type: 'int', min: 10, max: 60 },
      b: { type: 'int', min: 10, max: 60 },
      c: { type: 'int', min: 10, max: 60 },
      d: { type: 'int', min: 10, max: 60 },
      start: { type: 'int', min: 120, max: 400, step: 10 },
      counted: { type: 'int', min: 140, max: 400, step: 10 },
    },
    derived: {
      net: 'a-b+c-d',
      end: 'start+net',
      answer: 'start',
      d_offByOneStep: 'end-2*net',
      d_forgotFinalStep: 'end',
      d_usedGivenValue: 'counted',
    },
    // net stays positive so the closing figure is dependably above the opening
    // one and the two numeric distractors bracket rather than drift together.
    constraints: ['net>0', 'counted!=answer', 'end-2*net>0'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The four adjustments come to a net change of {{net}}.', 'Taking that off the {{end}} left gives {{answer}}.'],
  answerSummary: { headline: 'Total the changes, then undo them.', text: 'The stock was ${{answer}}$.' },
  hint: 'Work out the single net change the four adjustments make.',
  feedback: 'Taking the net change off twice removes more than the adjustments did.',
});

arc('7.3B', 'share-of-what-is-left', {
  difficultyBand: 5, dok: 3, taskType: 'errorAnalysis', representation: 'context',
  prompt: 'A {{machine}} finished {{n1}} of every {{d1}} of a run of {{total}} {{item}}, then {{n2}} of every {{d2}} of what was left. The sheet expected {{expected}}. How many remain?',
  generator: {
    parameters: {
      machine: MACHINES,
      item: GOODS,
      base: { type: 'int', min: 4, max: 16 },
      n1: { type: 'int', min: 1, max: 2 },
      d1: { type: 'int', min: 3, max: 4 },
      n2: { type: 'int', min: 1, max: 2 },
      d2: { type: 'int', min: 3, max: 4 },
      expected: { type: 'int', min: 18, max: 96 },
    },
    derived: {
      total: 'base*d1*d2',
      firstDone: 'total*n1/d1',
      leftAfterFirst: 'total-firstDone',
      secondDone: 'leftAfterFirst*n2/d2',
      answer: 'leftAfterFirst-secondDone',
      d_wrongPercentBase: 'total-firstDone-total*n2/d2',
      d_forgotFinalStep: 'leftAfterFirst',
      d_usedGivenValue: 'expected',
    },
    constraints: ['n1<d1', 'n2<d2', 'total-firstDone-total*n2/d2>0', 'expected!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_wrongPercentBase}}'), error: 'wrongPercentBase' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The first stage finishes {{firstDone}}, leaving {{leftAfterFirst}}.', 'The second finishes {{secondDone}} of those, leaving {{answer}}.'],
  answerSummary: { headline: 'The second fraction is taken of what was left.', text: '${{answer}}$ remain.' },
  hint: 'The second stage works on the remainder, not on the whole run.',
  feedback: 'The sheet figure is what was expected, not what the two stages leave.',
});

// ================================================================ A.3B
// Rate of change.

arc('A.3B', 'hours-until-a-tank-reaches-a-level', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A tank held {{start}} litres and {{end}} litres {{hours}} hours later. At that rate, how many more hours until it holds {{floor}} litres?',
  generator: {
    parameters: {
      rate: { type: 'int', min: 6, max: 30 },
      hours: { type: 'int', min: 2, max: 6 },
      moreHours: { type: 'int', min: 3, max: 14 },
      floor: { type: 'int', min: 20, max: 120, step: 10 },
      logged: { type: 'int', min: 3, max: 14 },
    },
    derived: {
      end: 'floor+rate*moreHours',
      start: 'end+rate*hours',
      answer: 'moreHours',
      d_operationInverted: 'round(end/rate)',
      d_forgotFinalStep: 'round(floor/rate)',
      d_usedGivenValue: 'logged',
    },
    constraints: ['logged!=answer', 'round(floor/rate)!=moreHours', 'round(end/rate)!=moreHours'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The tank falls {{rate}} litres an hour, and {{end}} less {{floor}} is {{rate}}x{{moreHours}}.', 'That takes {{answer}} more hours.'],
  answerSummary: { headline: 'Only the fall still to come takes more time.', text: 'It takes ${{answer}}$ more hours.' },
  hint: 'Work out the hourly fall from the two readings first.',
  feedback: 'Emptying the tank altogether goes further than the level asked for.',
});

arc('A.3B', 'level-the-tank-started-from', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'table',
  prompt: 'A tank falls by the same amount every hour. Using the readings below, how much did it hold at hour zero?',
  stimulus: {
    kind: 'table',
    columns: ['Hour', 'Litres'],
    rows: [['{{h1}}', '{{l1}}'], ['{{h2}}', '{{l2}}']],
  },
  generator: {
    parameters: {
      rate: { type: 'int', min: 5, max: 25 },
      h1: { type: 'int', min: 2, max: 5 },
      gap: { type: 'int', min: 2, max: 6 },
      base: { type: 'int', min: 60, max: 300, step: 10 },
      dial: { type: 'int', min: 70, max: 420, step: 10 },
    },
    derived: {
      h2: 'h1+gap',
      answer: 'base+rate*h1',
      l1: 'base',
      l2: 'base-rate*gap',
      d_forgotFinalStep: 'l1',
      d_partialTotal: 'answer+rate*h1',
      d_usedGivenValue: 'dial',
    },
    constraints: ['base-rate*gap>0', 'dial!=answer'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_partialTotal}}'), error: 'partialTotal' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Between the readings the tank loses {{rate}} litres an hour.', 'Adding {{h1}} hours of that back to {{l1}} gives {{answer}}.'],
  answerSummary: { headline: 'Run the rate backwards to hour zero.', text: 'It held ${{answer}}$ litres.' },
  hint: 'The first reading is already some hours into the fall.',
  feedback: 'The first reading is not the starting level.',
});

arc('A.3B', 'faster-of-a-rising-and-a-falling-tank', {
  difficultyBand: 5, dok: 3, taskType: 'interpretation', representation: 'table',
  prompt: 'Two tanks were logged over the same {{hours}} hours. How many litres an hour does the falling one lose?',
  stimulus: {
    kind: 'table',
    columns: ['Tank', 'Start', 'End'],
    rows: [['A', '{{aStart}}', '{{aEnd}}'], ['B', '{{bStart}}', '{{bEnd}}']],
  },
  generator: {
    parameters: {
      fall: { type: 'int', min: 8, max: 30 },
      rise: { type: 'int', min: 8, max: 32 },
      hours: { type: 'int', min: 3, max: 8 },
      aStart: { type: 'int', min: 200, max: 500, step: 10 },
      bStart: { type: 'int', min: 40, max: 200, step: 10 },
    },
    derived: {
      aEnd: 'aStart-fall*hours',
      bEnd: 'bStart+rise*hours',
      answer: 'fall',
      d_forgotFinalStep: 'fall*hours',
      // Counting the readings rather than the gaps between them always lands
      // below the true rate.
      d_offByOneStep: 'round(fall*hours/(hours+1))',
      d_usedGivenValue: 'rise',
    },
    constraints: ['aStart-fall*hours>0', 'rise!=fall', 'round(fall*hours/(hours+1))!=fall'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['Tank A goes from {{aStart}} to {{aEnd}}, a fall of {{d_forgotFinalStep}} litres over {{hours}} hours.', 'That is {{answer}} litres an hour.'],
  answerSummary: { headline: 'A rate is the change shared over the time.', text: 'It loses ${{answer}}$ litres an hour.' },
  hint: 'One tank rises and one falls; only the falling one is asked about.',
  feedback: 'The rising tank\'s rate answers about the wrong tank.',
});

// ================================================================ A2.6L
// Inverse variation, in practical terms.

arc('A2.6L', 'hours-after-the-crew-changes', {
  difficultyBand: 4, dok: 2, taskType: 'application', representation: 'context',
  prompt: 'A {{crew}} of {{w1}} would finish a job in {{h1}} hours. After {{worked}} hours, {{extra}} more people join. How many more hours does it take?',
  generator: {
    parameters: {
      crew: WORKERS,
      w1: { type: 'int', min: 2, max: 6 },
      h1: { type: 'int', min: 8, max: 24, step: 2 },
      worked: { type: 'int', min: 2, max: 6 },
      extra: { type: 'int', min: 1, max: 4 },
      quoted: { type: 'int', min: 2, max: 14 },
    },
    derived: {
      totalWork: 'w1*h1',
      doneWork: 'w1*worked',
      leftWork: 'totalWork-doneWork',
      w2: 'w1+extra',
      answer: 'round(leftWork/w2)',
      d_forgotFinalStep: 'h1-worked',
      d_offByOneStep: 'round(leftWork/(w2+extra))',
      d_usedGivenValue: 'quoted',
    },
    constraints: ['worked<h1', 'quoted!=answer', 'round(leftWork/w2)>0', 'round(leftWork/(w2+extra))!=round(leftWork/w2)'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The job is {{totalWork}} worker-hours and {{doneWork}} are done, leaving {{leftWork}}.', 'Shared by {{w2}} people that is {{answer}} hours.'],
  answerSummary: { headline: 'Count the work in worker-hours, not in hours.', text: 'It takes ${{answer}}$ more hours.' },
  hint: 'More people on the same work means fewer hours.',
  feedback: 'The hours the original crew had left assume the crew never grew.',
});

arc('A2.6L', 'crew-needed-to-meet-a-deadline', {
  difficultyBand: 4, dok: 3, taskType: 'reverseReasoning', representation: 'context',
  prompt: 'A {{crew}} of {{w1}} takes {{h1}} hours on a job. To finish it in {{h2}} hours instead, how many more people are needed?',
  generator: {
    parameters: {
      crew: WORKERS,
      w1: { type: 'int', min: 2, max: 5 },
      mult: { type: 'int', min: 2, max: 4 },
      h2: { type: 'int', min: 3, max: 9 },
      rostered: { type: 'int', min: 2, max: 12 },
    },
    derived: {
      h1: 'h2*mult',
      totalWork: 'w1*h1',
      w2: 'w1*mult',
      answer: 'w2-w1',
      d_forgotFinalStep: 'w2',
      d_offByOneStep: 'mult-1',
      d_usedGivenValue: 'rostered',
    },
    constraints: ['rostered!=answer', 'w2-w1>0', 'mult-1!=w2-w1'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_offByOneStep}}'), error: 'offByOneStep' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The job is {{totalWork}} worker-hours, so {{h2}} hours needs {{w2}} people.', 'That is {{answer}} more than the {{w1}} already there.'],
  answerSummary: { headline: 'Work out the crew needed, then the extra people.', text: '${{answer}}$ more are needed.' },
  hint: 'Halving the time doubles the people, and so on.',
  feedback: 'How many times faster the job must go is not how many people to add.',
});

arc('A2.6L', 'setting-that-keeps-the-product-fixed', {
  difficultyBand: 5, dok: 3, taskType: 'errorAnalysis', representation: 'table',
  prompt: 'Setting and speed vary inversely, so every pair below should give one product. One does not. What speed should it show?',
  stimulus: {
    kind: 'table',
    columns: ['Setting', 'Speed'],
    rows: [['{{x1}}', '{{y1}}'], ['{{x2}}', '{{y2}}'], ['{{x3}}', '{{yBad}}'], ['{{x4}}', '{{y4}}']],
  },
  generator: {
    parameters: {
      k1: { type: 'int', min: 2, max: 6 },
      k2: { type: 'int', min: 8, max: 20 },
      off: { type: 'int', min: 3, max: 20 },
      dial: { type: 'int', min: 32, max: 80 },
    },
    derived: {
      product: 'k1*k2*12',
      x1: 'k1', y1: 'product/k1',
      x2: 'k1*2', y2: 'product/(k1*2)',
      x3: 'k1*3',
      answer: 'product/(k1*3)',
      yBad: 'answer+off',
      x4: 'k1*4', y4: 'product/(k1*4)',
      d_forgotFinalStep: 'yBad',
      d_operationInverted: 'y4',
      d_usedGivenValue: 'dial',
    },
    constraints: ['off!=k1', 'dial!=answer', 'yBad!=y4'],
  },
  choices: [
    { label: plain('{{answer}}'), correct: true },
    { label: plain('{{d_forgotFinalStep}}'), error: 'forgotFinalStep' },
    { label: plain('{{d_operationInverted}}'), error: 'operationInverted' },
    { label: plain('{{d_usedGivenValue}}'), error: 'usedGivenValue' },
  ],
  reasoning: ['The pairs that agree all multiply to {{product}}.', 'A setting of {{x3}} therefore pairs with {{answer}}, not {{yBad}}.'],
  answerSummary: { headline: 'Recover the fixed product from the pairs that agree.', text: 'It should show ${{answer}}$.' },
  hint: 'Multiply the settings by their speeds and see which pair breaks the pattern.',
  feedback: 'The speed printed against that setting is the error, not the correction.',
});

// ---------------------------------------------------------------- emit
const seen = new Set();
for (const item of ITEMS) {
  if (seen.has(item.id)) throw new Error(`Duplicate ASVAB challenge id: ${item.id}`);
  seen.add(item.id);
}
assertChallengeVariety(ITEMS);
writeFileSync(new URL('../drafts/asvab-ar-challenge.json', import.meta.url), `${JSON.stringify({ documents: ITEMS }, null, 1)}\n`);
console.log(`Arithmetic Reasoning challenge: ${ITEMS.length} families across ${new Set(ITEMS.map((i) => i.assessedConstruct)).size} standards.`);
