// Grade 8 My Math Path templates whose solution review is a worked solution of
// THE DRAW, not a sentence about the topic.
//
// These 20 templates are also the question pool for Live Challenge standard
// rounds. Release-candidate QA found their between-round solution useless: the
// review said what the topic is ("Dilations preserve angle measure but scale
// lengths.") and its answer summary was the internal choice id ("angles"). Each
// review now works the drawn problem with the draw's own numbers (generator
// placeholders, plus derived helper values) and its answer summary is the text
// of the correct choice.
//
// A review is shown only once the question is closed (pathSolutionSupport.mjs)
// or the round is closed (liveChallengeSolutionReveal.mjs), so it may state the
// answer; it must be the right answer for that draw. This file proves, against
// the seed source of truth, for 40 seeded draws plus the 30 recap-probe draws
// of every template:
//   * the review is fully substituted, has 2-5 reasoning steps (the projector
//     shows five) and fits the buildPrivateSupport / roundSolutionRecord limits;
//   * every number the review states is recomputed by an independent mathjs
//     oracle from the instance's VISIBLE prompt, choices and table — never from
//     the template's generator values;
//   * the oracle's verdict is the graded key, and the answer summary is that
//     choice's text;
//   * the review names something from its own draw (a number in the prompt);
//   * prompt, choices, table, keys, parameters, constraints and difficulty are
//     unchanged from the committed bank (pinned literals below).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import * as math from 'mathjs';

import { effectivePathVariants, generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';
import { buildPrivateSupport } from '../../functions/shared/pathSolutionSupport.mjs';
import { roundSolutionRecord } from '../../functions/shared/liveChallengeSolutionReveal.mjs';

// Resolved from this file, not the process cwd, so the test runs from any directory.
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SEED = 'seed/pathQuestionBank/grade8_pathQuestionBank_seed.json';
const seedDocs = JSON.parse(readFileSync(join(REPO_ROOT, SEED), 'utf8')).documents;
const template = (id) => {
  const found = seedDocs.find((doc) => doc.id === id);
  assert.ok(found, `${id} is in ${SEED}`);
  return found;
};

const DRAW_SEEDS = [
  ...Array.from({ length: 40 }, (unused, index) => `review-specific-${index}`),
  ...Array.from({ length: 30 }, (unused, index) => `recap-probe-${index}`),
];

// ---- independent oracle ---------------------------------------------------------
//
// Reads only what a student sees. Each entry returns the numbers a correct
// worked solution of that draw may state (`values`), the prompt numbers that
// make the draw this draw (`specific`), the claims the review must make with
// those numbers in the right places (`must`: exact substrings, so Loan A's
// interest cannot be stated as Loan B's, nor the lateral area as the total),
// and the choice the mathematics selects.

const ev = (expression, scope = {}) => Number(math.evaluate(expression, scope));
const grab = (text, pattern, what) => {
  const match = pattern.exec(String(text));
  assert.ok(match, `oracle reads ${what} from: ${text}`);
  return match.slice(1).map(Number);
};
// How a signed term is written after another: "- 5" or "+ 5".
const signed = (value) => `${value < 0 ? '-' : '+'} ${Math.abs(value)}`;
const choiceMatching = (question, pattern) => {
  const hits = question.choices.filter((choice) => pattern.test(choice.label));
  assert.equal(hits.length, 1, `exactly one choice matches ${pattern}`);
  return hits[0];
};

const ORACLE = {
  'mm_gen_8_8_3B_angle-preserved': (q) => {
    const [k] = grab(q.prompt, /dilated by factor (\d+)/, 'k');
    assert.notEqual(k, 1, 'a factor other than 1 changes lengths');
    return { specific: [k], values: [k, ev('k^2', { k }), ev('3 k', { k }), 3, 50, 1, 2],
      must: [`$3 \\times ${k} = ${ev('3 k', { k })}$ units`, `$${k}^2 = ${ev('k^2', { k })}$`, 'a $50^\\circ$ angle is still $50^\\circ$'],
      correct: choiceMatching(q, /^Angle measures$/) };
  },
  'mm_gen_8_8_5C_error-two-differences': (q) => {
    const [d, n] = grab(q.prompt, /first differences of (\d+) and immediately declares all (\d+) points/, 'd, n');
    assert.ok(n > 3, 'two differences cover only three points');
    const outputs = [0, d, 2 * d, 4 * d];
    const differences = outputs.slice(1).map((y, index) => y - outputs[index]);
    assert.deepEqual(differences, [d, d, 2 * d], 'the counterexample starts with two differences of d and then breaks');
    return { specific: [d, n], values: [d, n, n - 1, n - 3, 2 * d, 4 * d, 0, 1, 2, 3],
      must: [`there are ${n - 1} first differences, so ${n - 3} more points`, `outputs $0, ${d}, ${2 * d}, ${4 * d}$ at inputs $0, 1, 2, 3$ have differences ${differences.join(', ').replace(/, (?=[^,]*$)/, ', then ')}`],
      correct: choiceMatching(q, /full data pattern/) };
  },
  'mm_gen_8_8_5F_context-sort': (q) => {
    const [r, fee] = grab(q.prompt, /rate of (\d+) per unit and possible starting fee (\d+)/, 'r, fee');
    const machine = (x) => r * x;
    const service = (x) => fee + r * x;
    const proportional = (f) => f(0) === 0 && f(1) === f(2) / 2;
    assert.ok(proportional(machine) && !proportional(service));
    return {
      specific: [r, fee],
      values: [r, fee, machine(2), service(1), service(2), 2 * service(1), 0, 1, 2],
      must: [
        `after 1 hour ${machine(1)}, after 2 hours ${machine(2)}`,
        `Service: $y = ${r}x + ${fee}$. After 0 hours it already costs ${service(0)} dollars`,
        `1 hour costs ${service(1)} dollars but 2 hours cost ${service(2)} dollars, not $2 \\times ${service(1)} = ${2 * service(1)}$`,
      ],
      correct: choiceMatching(q, /no starting amount/),
    };
  },
  'mm_gen_8_8_5H_error-fee': (q) => {
    const [r, fee] = grab(q.prompt, /a (\d+)-dollar-per-unit rule with a (\d+)-dollar starting fee/, 'r, fee');
    const cost = (x) => fee + r * x;
    assert.notEqual(cost(0), 0);
    return { specific: [r, fee], values: [r, fee, cost(1), cost(2), 2 * cost(1), 0, 1, 2],
      must: [`$y = ${r}x + ${fee}$. Buying 0 units still costs ${cost(0)} dollars`, `1 unit costs ${cost(1)} dollars but 2 units cost ${cost(2)} dollars`, `($2 \\times ${cost(1)} = ${2 * cost(1)}$)`],
      correct: choiceMatching(q, /zero starting value/) };
  },
  'mm_gen_8_8_6C_error-lengths': (q) => {
    const [a, b, sum] = grab(q.prompt, /legs (\d+) and (\d+) and says the hypotenuse is (\d+)/, 'a, b, sum');
    const c = ev('sqrt(a^2 + b^2)', { a, b });
    assert.ok(Number.isInteger(c));
    assert.equal(sum, a + b);
    assert.notEqual(sum, c);
    return { specific: [a, b, sum], values: [a, b, sum, c, a * a, b * b, c * c, 2],
      must: [`$${a}^2 + ${b}^2 = ${a * a} + ${b * b} = ${c * c}$`, `$c = \\sqrt{ ${c * c} } = ${c}$, because $${c}^2 = ${c * c}$`, `hypotenuse of ${c}, not ${sum}`],
      correct: choiceMatching(q, /^Square the side lengths/) };
  },
  'mm_gen_8_8_7B_lateral-vs-total': (q) => {
    const [r, h] = grab(q.prompt, /radius (\d+) and height (\d+)/, 'r, h');
    // Coefficients of pi.
    const lateral = ev('2 r h', { r, h });
    const base = ev('r^2', { r });
    const total = ev('2 r h + 2 r^2', { r, h });
    return { specific: [r, h], values: [r, h, lateral, base, 2 * base, total, 2],
      must: [
        `the lateral area is $${lateral}\\pi$ and the total area is $${total}\\pi$`,
        `$2\\pi rh = 2\\pi(${r})(${h}) = ${lateral}\\pi$`,
        `$\\pi r^2 = \\pi(${r})^2 = ${base}\\pi$`,
        `Total surface area $= ${lateral}\\pi + ${2 * base}\\pi = ${total}\\pi$`,
      ],
      correct: choiceMatching(q, /plus the two circular bases/) };
  },
  'mm_gen_8_8_8B_table-to-story': (q) => {
    const rows = q.stimulus.table.rows;
    const [a, r1] = rows.find((row) => row[0] === 'A').slice(1).map(Number);
    const [b, r2] = rows.find((row) => row[0] === 'B').slice(1).map(Number);
    const month = math.fraction(a - b, r2 - r1);
    assert.ok(Number(month) > 0, 'the totals really do become equal');
    assert.ok(math.equal(math.add(a, math.multiply(r1, month)), math.add(b, math.multiply(r2, month))));
    return { specific: [a, b, r1, r2], values: [a, b, r1, r2, a - b, r2 - r1, a + r1],
      must: [
        `Company A's total is $${a} + ${r1}m$ and Company B's total is $${b} + ${r2}m$`,
        `B starts ${a - b} lower but changes ${r2 - r1} more per month ($${r2} - ${r1} = ${r2 - r1}$)`,
        `$${a} + ${r1}m = ${b} + ${r2}m$, gives $${a - b} = ${r2 - r1}m$`,
        `$${a} + ${r1} = ${a + r1}$`,
      ],
      correct: choiceMatching(q, /become equal/) };
  },
  'mm_gen_8_8_8D_aa-similarity': (q) => {
    const [a, b] = grab(q.prompt, /an angle of (\d+)° and an angle of (\d+)°/, 'a, b');
    const third = 180 - a - b;
    assert.ok(third > 0);
    return { specific: [a, b], values: [a, b, third, 180], must: [`$180^\\circ - ${a}^\\circ - ${b}^\\circ = ${third}^\\circ$`, `${a}°, ${b}° and ${third}°`], correct: choiceMatching(q, /similar by AA/) };
  },
  'mm_gen_8_8_9_parallel-error': (q) => {
    const [m] = grab(q.prompt, /same slope (-?\d+)/, 'm');
    const [b1, b2] = grab(q.prompt, /intercepts (-?\d+) and (-?\d+)/, 'b1, b2');
    // The vertical gap is the same at every x; nonzero means no solution.
    const gaps = [-7, 0, 13].map((x) => ev('(m x + b2) - (m x + b1)', { m, b1, b2, x }));
    assert.ok(gaps.every((gap) => gap === gaps[0] && gap !== 0));
    return {
      specific: [m, b1, b2],
      // `{{b|signed}}` writes "- 5": the bare magnitude is the same intercept.
      values: [m, b1, b2, Math.abs(b1), Math.abs(b2), gaps[0], 1],
      must: [
        `the same slope $m = ${m}$: the first has $b = ${b1}$ and the second has $b = ${b2}$`,
        `$mx ${signed(b1)} = mx ${signed(b2)}$`,
        `leaves $${b1} = ${b2}$, which is false`,
        `$${b2} - ${b1 < 0 ? `(${b1})` : b1} = ${gaps[0]}$ at every $x$`,
      ],
      correct: choiceMatching(q, /^No intersection/),
    };
  },
  'mm_gen_8_8_10A_reflection-orientation': (q) => {
    const [n] = grab(q.prompt, /with a (\d+)-unit side/, 'n');
    return { specific: [n], values: [n, 1], must: [`the image of the ${n}-unit side is also ${n} units long`], correct: choiceMatching(q, /congruent, but its orientation reverses/) };
  },
  'mm_gen_8_8_10B_identify-rigid': (q) => {
    const [dx] = grab(q.prompt, /translation of (\d+) units/, 'dx');
    const [k] = grab(choiceMatching(q, /^Dilate/).label, /factor (\d+)/, 'k');
    assert.notEqual(k, 1);
    return { specific: [dx, k], values: [dx, k, 4, 4 * k], must: [`$(x, y) \\to (x + ${dx}, y)$`, `$4 \\times ${k} = ${4 * k}$ units`], correct: choiceMatching(q, /^Translate/) };
  },
  'mm_gen_8_8_10B_table-sort': (q) => {
    const [dx] = grab(q.prompt, /translation of (\d+) units/, 'dx');
    const [k] = grab(q.stimulus.table.rows[1][0], /Dilation by (\d+)/, 'k');
    assert.equal(q.stimulus.table.rows[0][1], 'unchanged');
    assert.notEqual(k, 1);
    return { specific: [dx, k], values: [dx, k, 5, 5 * k], must: [`Translation by ${dx} units: the table says lengths are unchanged`, `$5 \\times ${k} = ${5 * k}$ units`], correct: choiceMatching(q, /^Translation by/) };
  },
  'mm_gen_8_8_10B_reverse-classify': (q) => {
    const [n, image] = grab(q.prompt, /A (\d+)-unit segment is transformed to another (\d+)-unit segment/, 'n');
    assert.equal(ev('image / n', { image, n }), 1);
    return { specific: [n], values: [n, 1, 2, 2 * n], must: [`$= ${n} \\div ${image} = ${ev('image / n', { image, n })}$`, `$2 \\times ${n} = ${2 * n}$ units`], correct: choiceMatching(q, /rigid motion/) };
  },
  'mm_gen_8_8_11A_reverse-no-association': (q) => {
    const [n] = grab(q.prompt, /sample of (\d+) students/, 'n');
    return { specific: [n], values: [n], must: [`Plotting the ${n} students'`], correct: choiceMatching(q, /^Shoe size/) };
  },
  'mm_gen_8_8_11A_causation-error': (q) => {
    const [n] = grab(q.prompt, /scatterplot of (\d+) towns/, 'n');
    return { specific: [n], values: [n], must: [`The plot of ${n} towns`], correct: choiceMatching(q, /does not establish causation/) };
  },
  'mm_gen_8_8_11C_random-sample': (q) => {
    const [p] = grab(q.prompt, /has (\d+)% favoring/, 'p');
    const [n] = grab(q.prompt, /sample of size (\d+)/, 'n');
    const expected = ev('round(p / 100 * n)', { p, n });
    assert.ok(Math.abs(expected - ev('p / 100 * n', { p, n })) <= 0.5);
    return { specific: [p, n], values: [p, n, expected], must: [`about ${p}% of ${n}, or roughly ${expected} people`], correct: choiceMatching(q, /random process/) };
  },
  'mm_gen_8_8_11C_simulation-variability': (q) => {
    const [n] = grab(q.prompt, /samples of size (\d+)/, 'n');
    return { specific: [n], values: [n, 1], must: [`each person is $\\frac{1}{ ${n} }$ of the sample`], correct: choiceMatching(q, /naturally vary/) };
  },
  'mm_gen_8_8_12A_rate-compare': (q) => {
    const [principal, t] = grab(q.prompt, /principal (\d+) dollars and length (\d+) years/, 'P, t');
    const [r1, r2] = grab(q.prompt, /Loan A is (\d+)% and Loan B is (\d+)%/, 'r1, r2');
    const interestA = ev('P * r / 100 * t', { P: principal, r: r1, t });
    const interestB = ev('P * r / 100 * t', { P: principal, r: r2, t });
    assert.ok(interestB > interestA);
    return {
      specific: [principal, t, r1, r2],
      values: [principal, t, r1, r2, interestA, interestB, interestB - interestA, 100],
      must: [
        `Loan B at ${r2}% costs more interest than Loan A at ${r1}%`,
        `Loan A: $I = ${principal} \\times \\frac{ ${r1} }{100} \\times ${t} = ${interestA}$ dollars`,
        `Loan B: $I = ${principal} \\times \\frac{ ${r2} }{100} \\times ${t} = ${interestB}$ dollars`,
        `$${interestB} - ${interestA} = ${interestB - interestA}$ dollars more`,
        `${r1}% and ${r2}% give ${interestA} and ${interestB} dollars`,
      ],
      correct: choiceMatching(q, /^Loan B/),
    };
  },
  'mm_gen_8_8_12A_error-payment-only': (q) => {
    const [years] = grab(q.prompt, /a (\d+)-year loan/, 'years');
    const interest = ev('1000 * 0.05 * y', { y: years });
    const shortInterest = ev('1000 * 0.05 * 3');
    // The worked example's claims: the longer loan has the smaller monthly
    // payment AND the larger total interest.
    assert.ok((1000 + interest) / (12 * years) < (1000 + shortInterest) / 36);
    assert.ok(interest > shortInterest);
    return {
      specific: [years],
      values: [years, 12 * years, interest, 1000 + interest, 5, 1000, 0.05, 3, shortInterest],
      must: [
        `${years} years (${12 * years} monthly payments)`,
        `$1000 \\times 0.05 \\times ${years} = ${interest}$ dollars, and the total repaid is ${1000 + interest} dollars`,
        `$1000 \\times 0.05 \\times 3 = ${shortInterest}$ dollars`,
      ],
      correct: choiceMatching(q, /^Total interest/),
    };
  },
  'mm_gen_8_8_12D_compare-methods': (q) => {
    const [r] = grab(q.prompt, /positive rate (\d+)%/, 'r');
    const P = 10000;
    const firstPeriod = ev('P * r / 100', { P, r });
    const simple = ev('P * r / 100 * 2', { P, r });
    const compound = math.round(ev('P * (1 + r / 100)^2 - P', { P, r }), 6);
    assert.ok(compound > simple);
    // Period 2 earns r% of the period-1 balance: the first period's interest again plus interest on it.
    const secondExtra = math.round(ev('(P + f) * r / 100 - f', { P, f: firstPeriod, r }), 6);
    assert.equal(math.round(firstPeriod + firstPeriod + secondExtra, 6), compound);
    return {
      specific: [r],
      values: [r, 1, 2, P, firstPeriod, P + firstPeriod, simple, compound, math.round(compound - simple, 6)],
      must: [
        `compound interest earns ${compound} dollars and simple interest ${simple}`,
        `which is ${firstPeriod} dollars, so 2 periods earn $2 \\times ${firstPeriod} = ${simple}$ dollars`,
        `making the balance ${P + firstPeriod} dollars. Period 2 earns ${r}% of ${P + firstPeriod}, which is $${firstPeriod} + ${secondExtra}$ dollars`,
        `$${firstPeriod} + ${firstPeriod} + ${secondExtra} = ${compound}$ dollars, which beats ${simple} by ${math.round(compound - simple, 6)} dollars`,
      ],
      correct: choiceMatching(q, /^Compound interest/),
    };
  },
};

const IDS = Object.keys(ORACLE);

// Every number written in a string. A minus counts only when attached to the
// digits ("-5"), so "7 - 5" reads as 7 and 5; "10,000" reads as 10000.
const numbersIn = (value) => {
  const found = [];
  const pattern = /(?<![\w.])-?\d{1,3}(?:,\d{3})+(?:\.\d+)?(?!\d)|(?<![\w.])-?\d+(?:\.\d+)?/g;
  const source = String(value ?? '');
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    found.push(Number(match[0].replace(/,/g, '')));
  }
  return found;
};

// ---- graded fields, pinned to the committed bank ---------------------------------
//
// The review rewrite may add generator.derived helpers and replace
// solutionReview. Nothing a student is graded on may move.

const PINS = Object.freeze({
  "mm_gen_8_8_3B_angle-preserved": {
    prompt: "A triangle is dilated by factor {{k}}. Which attribute must remain unchanged?",
    choices: [{"id":"angles","label":"Angle measures"},{"id":"lengths","label":"Side lengths"},{"id":"area","label":"Area"}],
    responseFields: [{"id":"answer","label":"Choose the correct answer","inputProfile":"choice","expected":"angles"}],
    questionType: "response",
    taskType: "conceptual",
    difficultyBand: 2,
    dok: 1,
    assessedConstruct: "8.3B",
    parameters: {"k":{"type":"int","min":2,"max":10}},
    variants: null,
  },
  "mm_gen_8_8_5C_error-two-differences": {
    prompt: "A student sees two equal first differences of {{d}} and immediately declares all {{n}} points linear. What is the best response?",
    choices: [{"id":"needAllPattern","label":"Check the full data pattern; two matching differences are not enough."},{"id":"alwaysLinear","label":"Two equal differences prove every remaining point is linear."}],
    responseFields: [{"id":"answer","label":"Choose the correct answer","inputProfile":"choice","expected":"needAllPattern"}],
    questionType: "response",
    taskType: "errorAnalysis",
    difficultyBand: 4,
    dok: 2,
    assessedConstruct: "8.5C",
    parameters: {"d":{"type":"int","min":2,"max":10},"n":{"type":"int","min":5,"max":20}},
    variants: null,
  },
  "mm_gen_8_8_5F_context-sort": {
    prompt: "For a rate of {{r}} per unit and possible starting fee {{fee}}, which situation is proportional?",
    choices: [{"id":"noFee","label":"A machine produces {{r}} units per hour with no starting amount."},{"id":"withFee","label":"A service charges {{fee}} dollars plus {{r}} dollars per hour."}],
    responseFields: [{"id":"answer","label":"Choose the correct answer","inputProfile":"choice","expected":"noFee"}],
    questionType: "response",
    taskType: "application",
    difficultyBand: 2,
    dok: 1,
    assessedConstruct: "8.5F",
    parameters: {"r":{"type":"int","min":2,"max":20},"fee":{"type":"int","min":5,"max":50}},
    variants: null,
  },
  "mm_gen_8_8_5H_error-fee": {
    prompt: "A student says a {{r}}-dollar-per-unit rule with a {{fee}}-dollar starting fee is proportional because the rate is constant. What is missing?",
    choices: [{"id":"startingValueMatters","label":"Proportionality also requires zero starting value."},{"id":"rateIsEnough","label":"A constant rate alone guarantees proportionality."}],
    responseFields: [{"id":"answer","label":"Choose the correct answer","inputProfile":"choice","expected":"startingValueMatters"}],
    questionType: "response",
    taskType: "errorAnalysis",
    difficultyBand: 4,
    dok: 2,
    assessedConstruct: "8.5H",
    parameters: {"r":{"type":"int","min":2,"max":20},"fee":{"type":"int","min":5,"max":50}},
    variants: null,
  },
  "mm_gen_8_8_6C_error-lengths": {
    prompt: "A student sees a right triangle with legs {{a}} and {{b}} and says the hypotenuse is {{sum}} because side lengths add. What is the correction?",
    choices: [{"id":"squareRelationship","label":"Square the side lengths: $a^2+b^2=c^2$."},{"id":"lengthAddition","label":"Adding the leg lengths always gives the hypotenuse."}],
    responseFields: [{"id":"answer","label":"Choose the correct answer","inputProfile":"choice","expected":"squareRelationship"}],
    questionType: "response",
    taskType: "errorAnalysis",
    difficultyBand: 4,
    dok: 2,
    assessedConstruct: "8.6C",
    parameters: {"m":{"type":"int","min":3,"max":8},"n":{"type":"int","min":1,"max":5}},
    derived: {"a":"m*m-n*n","b":"2*m*n","c":"m*m+n*n","sum":"a+b"},
    constraints: ["m>n","a>0"],
    variants: null,
  },
  "mm_gen_8_8_7B_lateral-vs-total": {
    prompt: "A closed cylinder has radius {{r}} and height {{h}}. Which statement distinguishes lateral and total surface area?",
    choices: [{"id":"addBases","label":"Total surface area equals lateral area plus the two circular bases."},{"id":"sameArea","label":"Lateral and total surface area are always equal."}],
    responseFields: [{"id":"answer","label":"Choose the correct answer","inputProfile":"choice","expected":"addBases"}],
    questionType: "response",
    taskType: "comparison",
    difficultyBand: 4,
    dok: 2,
    assessedConstruct: "8.7B",
    parameters: {"r":{"type":"int","min":2,"max":10},"h":{"type":"int","min":2,"max":15}},
    variants: null,
  },
  "mm_gen_8_8_8B_table-to-story": {
    prompt: "A table says Company A starts at {{a}} and changes {{r1}} per month; B starts at {{b}} and changes {{r2}} per month. Which situation fits an equality comparison?",
    choices: [{"id":"breakEven","label":"Determine when the two monthly totals become equal."},{"id":"singleCompany","label":"Determine only Company A after one month."}],
    responseFields: [{"id":"answer","label":"Choose the correct answer","inputProfile":"choice","expected":"breakEven"}],
    stimulus: {"table":{"headers":["Company","Starting amount","Monthly change"],"rows":[["A","{{a}}","{{r1}}"],["B","{{b}}","{{r2}}"]]}},
    questionType: "response",
    taskType: "interpretation",
    difficultyBand: 2,
    dok: 2,
    assessedConstruct: "8.8B",
    parameters: {"a":{"type":"int","min":20,"max":80},"b":{"type":"int","min":5,"max":19},"r1":{"type":"int","min":2,"max":10},"r2":{"type":"int","min":11,"max":20}},
    variants: null,
  },
  "mm_gen_8_8_8D_aa-similarity": {
    prompt: "Triangle A and Triangle B each have an angle of {{a}}° and an angle of {{b}}°. What can be concluded?",
    choices: [{"id":"similarByAA","label":"The triangles are similar by AA."},{"id":"mustCongruent","label":"The triangles must be congruent."}],
    responseFields: [{"id":"answer","label":"Choose the correct answer","inputProfile":"choice","expected":"similarByAA"}],
    questionType: "response",
    taskType: "reverseReasoning",
    difficultyBand: 3,
    dok: 2,
    assessedConstruct: "8.8D",
    parameters: {"a":{"type":"int","min":20,"max":70},"b":{"type":"int","min":20,"max":70}},
    constraints: ["a+b<170"],
    variants: null,
  },
  "mm_gen_8_8_9_parallel-error": {
    prompt: "Two lines have the same slope {{m}} but different intercepts {{b1}} and {{b2}}. How many intersection points do they have?",
    choices: [{"id":"noIntersection","label":"No intersection; the lines are parallel."},{"id":"oneIntersection","label":"Exactly one intersection."}],
    responseFields: [{"id":"answer","label":"Choose the correct answer","inputProfile":"choice","expected":"noIntersection"}],
    questionType: "response",
    taskType: "errorAnalysis",
    difficultyBand: 4,
    dok: 2,
    assessedConstruct: "8.9",
    parameters: {"m":{"type":"int","min":-8,"max":8,"exclude":[0]},"b1":{"type":"int","min":-15,"max":-1},"b2":{"type":"int","min":1,"max":15}},
    variants: null,
  },
  "mm_gen_8_8_10A_reflection-orientation": {
    prompt: "A triangle with a {{n}}-unit side is reflected across an axis. Which statement is true?",
    choices: [{"id":"congruentReverseOrientation","label":"The image is congruent, but its orientation reverses."},{"id":"sizeChanges","label":"The image changes size."}],
    responseFields: [{"id":"answer","label":"Choose the correct answer","inputProfile":"choice","expected":"congruentReverseOrientation"}],
    questionType: "response",
    taskType: "conceptual",
    difficultyBand: 2,
    dok: 1,
    assessedConstruct: "8.10A",
    parameters: {"n":{"type":"int","min":2,"max":12}},
    variants: null,
  },
  "mm_gen_8_8_10B_identify-rigid": {
    prompt: "Which generated transformation involving a translation of {{dx}} units preserves congruence?",
    choices: [{"id":"translationRigid","label":"Translate {{dx}} units right."},{"id":"dilationNonRigid","label":"Dilate by factor {{k}}."}],
    responseFields: [{"id":"answer","label":"Choose the correct answer","inputProfile":"choice","expected":"translationRigid"}],
    questionType: "response",
    taskType: "conceptual",
    difficultyBand: 1,
    dok: 1,
    assessedConstruct: "8.10B",
    parameters: {"dx":{"type":"int","min":1,"max":12}},
    derived: {"k":"dx+1"},
    variants: null,
  },
  "mm_gen_8_8_10B_table-sort": {
    prompt: "Use the transformation table comparing a translation of {{dx}} units with a dilation. Which row describes a congruence-preserving move?",
    choices: [{"id":"translationRow","label":"Translation by {{dx}} units"},{"id":"dilationRow","label":"Dilation by factor {{k}}"}],
    responseFields: [{"id":"answer","label":"Choose the correct answer","inputProfile":"choice","expected":"translationRow"}],
    stimulus: {"table":{"headers":["Transformation","Effect on lengths"],"rows":[["Translation","unchanged"],["Dilation by {{k}}","multiplied by {{k}}"]]}},
    questionType: "response",
    taskType: "interpretation",
    difficultyBand: 2,
    dok: 2,
    assessedConstruct: "8.10B",
    parameters: {"dx":{"type":"int","min":1,"max":10},"k":{"type":"int","min":2,"max":8}},
    variants: null,
  },
  "mm_gen_8_8_10B_reverse-classify": {
    prompt: "A {{n}}-unit segment is transformed to another {{n}}-unit segment while all angles are preserved. Which classification fits?",
    choices: [{"id":"rigidMotion","label":"Congruence-preserving rigid motion"},{"id":"nonRigid","label":"Non-congruence-preserving dilation"}],
    responseFields: [{"id":"answer","label":"Choose the correct answer","inputProfile":"choice","expected":"rigidMotion"}],
    questionType: "response",
    taskType: "reverseReasoning",
    difficultyBand: 3,
    dok: 2,
    assessedConstruct: "8.10B",
    parameters: {"n":{"type":"int","min":2,"max":20}},
    variants: null,
  },
  "mm_gen_8_8_11A_reverse-no-association": {
    prompt: "For a sample of {{n}} students, which generated situation would most reasonably show little or no association?",
    choices: [{"id":"unrelatedVariables","label":"Shoe size versus number of letters in a first name for {{n}} students"},{"id":"linkedVariables","label":"Hours practiced versus skill score after training"}],
    responseFields: [{"id":"answer","label":"Choose the correct answer","inputProfile":"choice","expected":"unrelatedVariables"}],
    questionType: "response",
    taskType: "reverseReasoning",
    difficultyBand: 3,
    dok: 2,
    assessedConstruct: "8.11A",
    parameters: {"n":{"type":"int","min":10,"max":30}},
    variants: null,
  },
  "mm_gen_8_8_11A_causation-error": {
    prompt: "A scatterplot of {{n}} towns shows towns with more firefighters also having more fire damage. A student says firefighters cause damage. What is wrong?",
    choices: [{"id":"associationNotCausation","label":"Association does not establish causation; larger fires can lead to both more damage and more firefighters."},{"id":"causationProved","label":"Any positive association proves causation."}],
    responseFields: [{"id":"answer","label":"Choose the correct answer","inputProfile":"choice","expected":"associationNotCausation"}],
    questionType: "response",
    taskType: "errorAnalysis",
    difficultyBand: 4,
    dok: 2,
    assessedConstruct: "8.11A",
    parameters: {"n":{"type":"int","min":8,"max":30}},
    variants: null,
  },
  "mm_gen_8_8_11C_random-sample": {
    prompt: "A population has {{p}}% favoring an option. Which sampling method best simulates a representative random sample of size {{n}}?",
    choices: [{"id":"randomSelection","label":"Select {{n}} members using a random process from the whole population."},{"id":"convenienceSelection","label":"Ask the first {{n}} people entering one location."}],
    responseFields: [{"id":"answer","label":"Choose the correct answer","inputProfile":"choice","expected":"randomSelection"}],
    questionType: "response",
    taskType: "conceptual",
    difficultyBand: 1,
    dok: 1,
    assessedConstruct: "8.11C",
    parameters: {"p":{"type":"int","min":20,"max":80},"n":{"type":"int","min":20,"max":100}},
    variants: null,
  },
  "mm_gen_8_8_11C_simulation-variability": {
    prompt: "Repeated random samples of size {{n}} from the same population give slightly different percentages. What does this show?",
    choices: [{"id":"samplingVariability","label":"Random samples naturally vary, even when drawn from the same population."},{"id":"populationChanged","label":"The population percentage must change after every sample."}],
    responseFields: [{"id":"answer","label":"Choose the correct answer","inputProfile":"choice","expected":"samplingVariability"}],
    questionType: "response",
    taskType: "errorAnalysis",
    difficultyBand: 4,
    dok: 2,
    assessedConstruct: "8.11C",
    parameters: {"n":{"type":"int","min":20,"max":100}},
    variants: null,
  },
  "mm_gen_8_8_12A_rate-compare": {
    prompt: "Two loans have the same principal {{P}}00 dollars and length {{t}} years. Loan A is {{r1}}% and Loan B is {{r2}}%, with B higher. Which costs more interest?",
    choices: [{"id":"higherRateCostsMore","label":"Loan B, because its interest rate is higher."},{"id":"sameCost","label":"They cost the same because principal and time match."}],
    responseFields: [{"id":"answer","label":"Choose the correct answer","inputProfile":"choice","expected":"higherRateCostsMore"}],
    questionType: "response",
    taskType: "comparison",
    difficultyBand: 2,
    dok: 1,
    assessedConstruct: "8.12A",
    parameters: {"P":{"type":"int","min":5,"max":40},"t":{"type":"int","min":1,"max":8},"r1":{"type":"int","min":2,"max":8},"gap":{"type":"int","min":1,"max":7}},
    derived: {"r2":"r1+gap"},
    variants: null,
  },
  "mm_gen_8_8_12A_error-payment-only": {
    prompt: "A borrower chooses a {{years}}-year loan only because its monthly payment is lower. What cost should also be compared?",
    choices: [{"id":"totalInterest","label":"Total interest and total amount repaid over the full loan."},{"id":"monthlyOnly","label":"Only the monthly payment matters."}],
    responseFields: [{"id":"answer","label":"Choose the correct answer","inputProfile":"choice","expected":"totalInterest"}],
    questionType: "response",
    taskType: "errorAnalysis",
    difficultyBand: 4,
    dok: 2,
    assessedConstruct: "8.12A",
    parameters: {"years":{"type":"int","min":4,"max":15}},
    variants: null,
  },
  "mm_gen_8_8_12D_compare-methods": {
    prompt: "After more than one period at positive rate {{r}}%, which method usually earns more on the same starting principal?",
    choices: [{"id":"compoundMore","label":"Compound interest, because interest itself can earn interest."},{"id":"simpleMore","label":"Simple interest, because it always uses only the original principal."}],
    responseFields: [{"id":"answer","label":"Choose the correct answer","inputProfile":"choice","expected":"compoundMore"}],
    questionType: "response",
    taskType: "comparison",
    difficultyBand: 4,
    dok: 2,
    assessedConstruct: "8.12D",
    parameters: {"r":{"type":"int","min":2,"max":15}},
    variants: null,
  },
});

test('the 20 templates keep every graded and visible field of the committed bank', () => {
  assert.deepEqual(IDS.sort(), Object.keys(PINS).sort());
  for (const id of IDS) {
    const doc = template(id);
    const pin = PINS[id];
    for (const key of ['prompt', 'choices', 'responseFields', 'stimulus', 'questionType', 'taskType', 'difficultyBand', 'dok', 'assessedConstruct']) {
      assert.deepEqual(doc[key], pin[key], `${id}.${key}`);
    }
    assert.deepEqual(doc.variants ?? null, pin.variants, `${id}.variants`);
    assert.deepEqual(doc.generator.parameters, pin.parameters, `${id} parameters`);
    assert.deepEqual(doc.generator.constraints, pin.constraints, `${id} constraints`);
    // Original derived values are kept exactly; new ones are only additions.
    for (const [name, expression] of Object.entries(pin.derived || {})) {
      assert.equal(doc.generator.derived?.[name], expression, `${id} derived ${name}`);
    }
    for (const name of Object.keys(doc.generator.derived || {})) {
      assert.ok(!(name in doc.generator.parameters), `${id}: derived ${name} does not shadow a parameter`);
    }
  }
});

test('every draw\'s solution review is a worked solution of that draw, checked by an independent oracle', (t) => {
  for (const id of IDS) {
    const rows = effectivePathVariants(template(id));
    assert.equal(rows.length, 1, `${id} has no variants to review separately`);
    for (const seed of DRAW_SEEDS) {
      const generated = generatePathInstance(template(id), seed);
      assert.ok(generated.question, `${id} ${seed}: ${generated.reason}`);
      const question = generated.question;
      const review = question.solutionReview;
      const where = `${id} ${seed}`;

      const strings = [review.headline, ...review.reasoning, review.commonError, review.connection, review.answerSummary]
        .filter((entry) => entry != null);
      for (const entry of strings) {
        assert.equal(typeof entry, 'string', where);
        // `\frac{ 7 }{100}` and `\sqrt{ 25 }` are LaTeX groups, not placeholders.
        assert.doesNotMatch(entry, /\{\{|\}\}/, `${where}: unresolved placeholder in "${entry}"`);
      }
      assert.ok(review.reasoning.length >= 2 && review.reasoning.length <= 5, `${where}: ${review.reasoning.length} steps`);
      assert.ok(review.headline.length <= 160, `${where}: headline length`);
      assert.ok(review.reasoning.every((step) => step.length <= 400), `${where}: step length`);
      assert.ok((review.commonError || '').length <= 400, `${where}: commonError length`);
      assert.ok(review.answerSummary.length <= 240, `${where}: answerSummary length`);
      assert.equal(strings.join(' ').split('$').length % 2, 1, `${where}: every $ opens and closes inline math`);

      // The server's own private-support and round-record builders keep it whole.
      const support = buildPrivateSupport(question).solutionReview;
      assert.deepEqual(support.reasoning, review.reasoning, where);
      assert.equal(support.answerSummary, review.answerSummary, where);
      const record = roundSolutionRecord({ question, solutionReview: support });
      assert.deepEqual([...record.solutionReview.reasoning], review.reasoning, where);

      const oracle = ORACLE[id](question);
      assert.equal(oracle.correct.id, question.responseFields[0].expected, `${where}: the mathematics selects the graded key`);
      assert.equal(review.answerSummary, oracle.correct.label, `${where}: answer summary is the correct choice's text`);

      const allowed = new Set(oracle.values.map(Number));
      for (const entry of strings) {
        for (const value of numbersIn(entry)) {
          assert.ok(allowed.has(value), `${where}: ${value} is not recomputed from the visible draw in "${entry}"`);
        }
      }

      // Membership above says each number is right for the draw; these say each
      // one is attached to the right claim.
      const text = strings.join('\n');
      for (const claim of oracle.must) {
        assert.ok(text.includes(claim), `${where}: the review states "${claim}"`);
      }
      // A coefficient of 1 or -1 is not written ("1x", "-1x").
      assert.doesNotMatch(text, /(?<![\w.,])-?1[a-z]\b/, `${where}: unit coefficient written out`);

      const body = numbersIn([review.headline, ...review.reasoning].join(' '));
      assert.ok(oracle.specific.some((value) => body.includes(value)), `${where}: the review names a number from its own prompt`);
    }
  }
  t.diagnostic(`${IDS.length} templates x ${DRAW_SEEDS.length} draws`);
});

test('a slope of 1 or -1 is never written as a coefficient ("y = 1x - 12")', () => {
  const id = 'mm_gen_8_8_9_parallel-error';
  const seen = new Set();
  for (let index = 0; index < 400 && seen.size < 2; index += 1) {
    const { question } = generatePathInstance(template(id), `unit-slope-${index}`);
    const [m] = grab(question.prompt, /same slope (-?\d+)/, 'm');
    if (Math.abs(m) !== 1) continue;
    seen.add(m);
    const review = question.solutionReview;
    const text = [review.headline, ...review.reasoning, review.commonError].join('\n');
    assert.doesNotMatch(text, /(?<![\w.,])-?1x/, `slope ${m}: ${text}`);
    assert.match(text, new RegExp(`slope \\$m = ${m}\\$`), `slope ${m} is stated as m = ${m}`);
  }
  assert.deepEqual([...seen].sort(), [-1, 1], 'the scan reached both unit slopes');
});

test('the review is not one sentence reused across draws: different prompts get different worked solutions', () => {
  for (const id of IDS) {
    const prompts = new Set();
    const reviews = new Set();
    for (const seed of DRAW_SEEDS) {
      const { question } = generatePathInstance(template(id), seed);
      prompts.add(JSON.stringify([question.prompt, question.stimulus ?? null]));
      reviews.add(JSON.stringify(question.solutionReview.reasoning));
    }
    assert.equal(reviews.size, prompts.size, `${id}: ${prompts.size} distinct prompts but ${reviews.size} distinct worked solutions`);
  }
});
