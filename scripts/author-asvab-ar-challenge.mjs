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
      want: { type: 'int', min: 20, max: 50, step: 10 },
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

// ---------------------------------------------------------------- emit
const seen = new Set();
for (const item of ITEMS) {
  if (seen.has(item.id)) throw new Error(`Duplicate ASVAB challenge id: ${item.id}`);
  seen.add(item.id);
}
assertChallengeVariety(ITEMS);
writeFileSync(new URL('../drafts/asvab-ar-challenge.json', import.meta.url), `${JSON.stringify({ documents: ITEMS }, null, 1)}\n`);
console.log(`Arithmetic Reasoning challenge: ${ITEMS.length} families across ${new Set(ITEMS.map((i) => i.assessedConstruct)).size} standards.`);
