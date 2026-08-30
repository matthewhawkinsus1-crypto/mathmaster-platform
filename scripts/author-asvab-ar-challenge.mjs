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

// ---------------------------------------------------------------- emit
const seen = new Set();
for (const item of ITEMS) {
  if (seen.has(item.id)) throw new Error(`Duplicate ASVAB challenge id: ${item.id}`);
  seen.add(item.id);
}
assertChallengeVariety(ITEMS);
writeFileSync(new URL('../drafts/asvab-ar-challenge.json', import.meta.url), `${JSON.stringify({ documents: ITEMS }, null, 1)}\n`);
console.log(`Arithmetic Reasoning challenge: ${ITEMS.length} families across ${new Set(ITEMS.map((i) => i.assessedConstruct)).size} standards.`);
