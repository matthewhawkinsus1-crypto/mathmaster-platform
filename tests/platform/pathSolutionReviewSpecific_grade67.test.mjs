/*
 * WORKED SOLUTIONS FOR 28 GRADE 6/7 PATH TEMPLATES (job J, "Content that teaches").
 *
 * These My Math Path templates are also the question pool for Live Challenge
 * standard rounds. Their solution reviews used to be a generic sentence ("Use
 * the defining property to rule out choices…") that said nothing about the
 * problem on the screen, so the between-round solution taught nothing. Each
 * review is now a worked solution of the drawn problem, written with the draw's
 * own numbers through {{placeholders}} (plus generator.derived values where a
 * step needs a computed number).
 *
 * A review is shown only after the question closes (Path recap / closed review;
 * Live Challenge after the round closes), so it may state the answer — but it
 * has to be the right answer for THAT draw. For 40+ draws of every template,
 * this file:
 *   - recomputes the correct answer with an independent oracle that reads only
 *     what the student sees (prompt, stimulus, choice texts), never the
 *     template's parameters or derived values, and checks the graded key and
 *     the answerSummary both name it;
 *   - checks every number the review states is one the oracle derives from the
 *     visible content (mathjs), and that every relation the review writes in
 *     $…$ (=, ≈, <, >) actually holds;
 *   - checks the headline and the final step reach the oracle's verdict and
 *     never state the losing option, that numbers with a single role (sample
 *     space size, a set's range) carry the right value, that worked examples
 *     state the conditions their conclusion needs, and that $…$ is balanced;
 *   - checks the review is about this draw (it states a number from the prompt
 *     and a context noun the prompt uses), fits the projector (2..5 steps) and
 *     the stored limits, and has no unresolved placeholder;
 *   - pins every graded field (prompt, choices, keys, parameters, constraints,
 *     original derived values, metadata) to the committed pre-change template.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as math from 'mathjs';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';
import { buildPrivateSupport } from '../../functions/shared/pathSolutionSupport.mjs';
import { splitMathSegments, isMathSegment, unwrapMathSegment } from '../../src/components/common/mathSegments.js';

const SEED_DIR = '../../seed/pathQuestionBank';
const DRAWS = 40;

const loadDocuments = (grade) => JSON.parse(readFileSync(
  new URL(`${SEED_DIR}/grade${grade}_pathQuestionBank_seed.json`, import.meta.url),
  'utf8',
)).documents;
const DOCUMENTS = new Map([...loadDocuments(6), ...loadDocuments(7)].map((doc) => [doc.id, doc]));

// Graded content of the committed template before the reviews were rewritten:
// sha256 (first 16 hex) of the document without solutionReview and with
// generator.derived limited to the keys it had then. New derived keys may only
// be added; nothing graded may move.
const PINNED = {
  'mm_gen_6_6_4C_same-attribute-check': { expected: ['same'], derived: [], sha: 'b9b0973df171cbe7' },
  'mm_gen_6_6_6A_time-distance': { expected: ['time'], derived: [], sha: 'e952a76d869332e1' },
  'mm_gen_6_6_6A_items-cost': { expected: ['cost'], derived: ['cost2', 'cost3'], sha: '2a3e62a207825717' },
  'mm_gen_6_6_6A_age-height': { expected: ['age'], derived: [], sha: '2700121829efdd80' },
  'mm_gen_6_6_7B_repair-expression': { expected: ['expr'], derived: [], sha: '02d7c71674754b44' },
  'mm_gen_6_6_7D_commutative': { expected: ['comm'], derived: [], sha: '55d234591d003765' },
  'mm_gen_6_6_7D_associative': { expected: ['assoc'], derived: [], sha: '504c5c9f8e6a2ce6' },
  'mm_gen_6_6_12A_choose-display': { expected: ['hist'], derived: [], sha: 'd864e8162ffb2b43' },
  'mm_gen_6_6_12B_shape-symmetric': { expected: ['sym'], derived: [], sha: '7ed5ba9cc70fa9d6' },
  'mm_gen_6_6_13B_varying-data': { expected: ['yes'], derived: ['b', 'c'], sha: '7142ea1ba5059336' },
  'mm_gen_6_6_13B_repeat-measurement': { expected: ['none'], derived: [], sha: '518ea327ed29f2a6' },
  'mm_gen_6_6_13B_compare-variability': { expected: ['B'], derived: ['b2', 'b3'], sha: '17cc22e37542abc7' },
  'mm_gen_7_7_5C_compare-scales': { expected: ['drawingA'], derived: [], sha: 'bcc647ca83abb62c' },
  'mm_gen_7_7_6A_missing-outcome': { expected: ['pairs'], derived: [], sha: '99e7641d089b3ed4' },
  'mm_gen_7_7_6B_simulate-fair-coin': { expected: ['two'], derived: [], sha: '0f66658f2c78b91b' },
  'mm_gen_7_7_6B_compound-simulation': { expected: ['both'], derived: [], sha: 'b17bac56e3105710' },
  'mm_gen_7_7_6B_select-trials': { expected: ['large'], derived: [], sha: '85d0a5e9f2611c91' },
  'mm_gen_7_7_6F_random-vs-biased': { expected: ['random'], derived: [], sha: 'ed52647ed24cd94f' },
  'mm_gen_7_7_6F_compare-samples': { expected: ['larger'], derived: [], sha: 'f5a7a797a83d3e4d' },
  'mm_gen_7_7_6H_compare-simulations': { expected: ['B'], derived: [], sha: '2ade54d398ffc8b5' },
  'mm_gen_7_7_6I_theory-vs-data-error': { expected: ['no'], derived: [], sha: 'f084e057bdc7aec3' },
  'mm_gen_7_7_12A_error-analysis': { expected: ['summary'], derived: [], sha: '75e1157efd55d3a2' },
  'mm_gen_7_7_12B_sample-method': { expected: ['random'], derived: [], sha: 'ae9f87924a3f2e88' },
  'mm_gen_7_7_12B_inference-caution': { expected: ['estimate'], derived: [], sha: 'cec60054e77fca44' },
  'mm_gen_7_7_12C_overlap-interpretation': { expected: ['B'], derived: [], sha: 'a8cd0845c38c34a2' },
  'mm_gen_7_7_12C_spread-comparison': { expected: ['B'], derived: [], sha: '86eeca4aa1a8a4fd' },
  'mm_gen_7_7_12C_claim-strength': { expected: ['center'], derived: [], sha: 'e5f7acc15e5d12fe' },
  'mm_gen_7_7_13E_compare-interest': { expected: ['compound'], derived: [], sha: '265aab450de5c522' },
};

// --- reading the visible question ------------------------------------------------

const match = (pattern, text) => {
  const found = pattern.exec(text);
  assert.ok(found, `${pattern} matches ${JSON.stringify(text)}`);
  return found.slice(1).map(Number);
};
const labels = (q) => q.choices.map((choice) => choice.label);
const onlyOne = (q, predicate, why) => {
  const hits = labels(q).filter(predicate);
  assert.equal(hits.length, 1, `exactly one choice is ${why}: ${JSON.stringify(labels(q))}`);
  return hits[0];
};
const choiceNumber = (label) => Number(/(\d+)/.exec(label)[1]);
const range = (values) => math.max(values) - math.min(values);
const pct = (n, places) => math.round(math.divide(100, n), places);

// Each oracle reads the generated question as a student sees it and returns:
//   answer   the correct choice text, decided from the visible content
//   allowed  every number a correct worked solution of this draw may state
//            ([value, tolerance] for a rounded value)
//   given    numbers taken straight from the prompt (a review must state one)
//   nouns    context words of this prompt (a review must use one)
const ORACLES = {
  'mm_gen_6_6_4C_same-attribute-check': (q) => {
    const [a, b] = match(/compares (\d+) red tiles to (\d+) blue tiles/, q.prompt);
    // Same attribute: both quantities are counted in the same unit.
    const answer = onlyOne(q, (label) => {
      const [, x, unitA, y, unitB] = /^\$(\d+)\$ (?:\w+ )?(\w+) (?:to|in|for) \$(\d+)\$ (?:\w+ )?(\w+)$/.exec(label);
      assert.deepEqual([Number(x), Number(y)], [a, b]);
      return unitA === unitB;
    }, 'a same-attribute comparison');
    return { answer, allowed: [a, b], given: [a, b], nouns: ['tiles'] };
  },
  'mm_gen_6_6_6A_time-distance': (q) => {
    const [rate] = match(/moves at (\d+) miles per hour/, q.prompt);
    // distance = rate × time: distance is computed from time, so time is the input.
    return {
      answer: onlyOne(q, (label) => label.startsWith('Time'), 'the input'),
      allowed: [rate, 2, 3, math.evaluate(`${rate}*2`), math.evaluate(`${rate}*3`)],
      given: [rate],
      nouns: ['miles per hour'],
    };
  },
  'mm_gen_6_6_6A_items-cost': (q) => {
    const [price] = match(/cost \$(\d+)\$ dollars each/, q.prompt);
    const rows = q.stimulus.table.rows.map((row) => row.map(Number));
    // Every total is tickets × price: the cost column is computed from the
    // tickets column, so total cost is the dependent quantity.
    rows.forEach(([tickets, cost]) => assert.equal(cost, math.evaluate(`${tickets}*${price}`)));
    return {
      answer: onlyOne(q, (label) => /cost/i.test(label), 'the computed column'),
      allowed: [price, ...rows.flat()],
      given: [price],
      nouns: ['ticket'],
    };
  },
  'mm_gen_6_6_6A_age-height': (q) => {
    const [weeks] = match(/once per week for (\d+) weeks/, q.prompt);
    return { answer: onlyOne(q, (label) => label.startsWith('Age'), 'the scheduled input'), allowed: [weeks, 1], given: [weeks], nouns: ['plant'] };
  },
  'mm_gen_6_6_7B_repair-expression': (q) => {
    const [a, b] = match(/^The object \$(\d+)x\+(\d+)\$ is called what\?$/, q.prompt);
    const object = /\$([^$]*)\$/.exec(q.prompt)[1];
    const kind = /=/.test(object) ? 'An equation' : (/[<>]/.test(object) ? 'An inequality' : 'An expression');
    return {
      answer: onlyOne(q, (label) => label === kind, kind),
      allowed: [a, b, 1, math.evaluate(`${a}*1+${b}`)],
      given: [a, b],
      nouns: ['x'],
    };
  },
  'mm_gen_6_6_7D_commutative': (q) => {
    const [a, a2] = match(/^Which property justifies \$(\d+)\+x=x\+(\d+)\$\?$/, q.prompt);
    assert.equal(a, a2);
    // Same addends, reversed order, no parentheses: commutative.
    const x = 3.7;
    assert.equal(math.evaluate(`${a}+x`, { x }), math.evaluate(`x+${a}`, { x }));
    return {
      answer: onlyOne(q, (label) => label.startsWith('Commutative'), 'commutative'),
      allowed: [a, 1, a + 1],
      given: [a],
      nouns: ['x'],
    };
  },
  'mm_gen_6_6_7D_associative': (q) => {
    const [a, b, a2, b2] = match(/^Which property justifies \$\((\d+)\+(\d+)\)\+x=(\d+)\+\((\d+)\+x\)\$\?$/, q.prompt);
    // Same order of addends on both sides; only the parentheses moved.
    assert.deepEqual([a2, b2], [a, b]);
    return {
      answer: onlyOne(q, (label) => label.startsWith('Associative'), 'associative'),
      allowed: [a, b, 0, 1, math.evaluate(`${a}+${b}`), math.evaluate(`${b}+1`), math.evaluate(`(${a}+${b})+1`)],
      given: [a, b],
      nouns: ['x'],
    };
  },
  'mm_gen_6_6_12A_choose-display': (q) => {
    const [n] = match(/records \$(\d+)\$ numerical measurements/, q.prompt);
    assert.match(q.prompt, /frequencies across intervals/);
    return { answer: onlyOne(q, (label) => label === 'Histogram', 'the interval display'), allowed: [n], given: [n], nouns: ['measurements'] };
  },
  'mm_gen_6_6_12B_shape-symmetric': (q) => {
    const freqs = match(/frequencies \$(\d+),(\d+),(\d+),(\d+),(\d+)\$/, q.prompt);
    const symmetric = freqs.every((value, index) => value === freqs[freqs.length - 1 - index]);
    const shape = symmetric ? /symmetric/ : (freqs[0] > freqs[4] ? /right-skewed/ : /left-skewed/);
    return {
      answer: onlyOne(q, (label) => shape.test(label), 'the shape'),
      allowed: [...freqs, 1, 2, 4, 5, math.evaluate(`${freqs[0]}+${freqs[1]}`)],
      given: freqs,
      nouns: ['bin'],
    };
  },
  'mm_gen_6_6_13B_varying-data': (q) => {
    const values = match(/^Measurements are \$(\d+),(\d+),(\d+)\$/, q.prompt);
    const varies = range(values) > 0;
    return {
      answer: onlyOne(q, (label) => label === (varies ? 'Variability' : 'No variability'), 'the verdict'),
      allowed: [...values, 0, range(values)],
      given: values,
      nouns: ['measurements'],
    };
  },
  'mm_gen_6_6_13B_repeat-measurement': (q) => {
    const values = match(/readings \$(\d+),(\d+),(\d+),(\d+)\$/, q.prompt);
    const varies = range(values) > 0;
    return {
      answer: onlyOne(q, (label) => (varies ? /have variability/ : /no variability/).test(label), 'the verdict'),
      allowed: [...values, 0, math.mean(values)],
      given: values,
      nouns: ['readings'],
    };
  },
  'mm_gen_6_6_13B_compare-variability': (q) => {
    const setA = match(/Data set A is \$(\d+),(\d+),(\d+)\$/, q.prompt);
    const setB = match(/Data set B is \$(\d+),(\d+),(\d+)\$/, q.prompt);
    const varying = [['Set A', setA], ['Set B', setB]].filter(([, set]) => range(set) > 0);
    assert.equal(varying.length, 1);
    return {
      answer: onlyOne(q, (label) => label === varying[0][0], 'the varying set'),
      allowed: [...setA, ...setB, 0, range(setA), range(setB)],
      given: [...setA, ...setB],
      nouns: ['Set A', 'Set B'],
    };
  },
  'mm_gen_7_7_5C_compare-scales': (q) => {
    const [a, b] = match(/Drawing A uses 1 cm : (\d+) m\. Drawing B uses 1 cm : (\d+) m/, q.prompt);
    // Drawing length = real length ÷ (meters per cm): the smaller divisor wins.
    const len = a * b;
    const longer = math.divide(len, a) > math.divide(len, b) ? 'Drawing A' : 'Drawing B';
    return { answer: onlyOne(q, (label) => label === longer, 'the longer drawing'), allowed: [a, b, 1, len], given: [a, b], nouns: ['Drawing A'] };
  },
  'mm_gen_7_7_6A_missing-outcome': (q) => {
    const [s] = match(/a (\d+)-color spinner/, q.prompt);
    // The sample space is {H,T} × colors: 2s outcomes, each a pair.
    return {
      answer: onlyOne(q, (label) => /^Ordered pairs pairing each coin result with each spinner color$/.test(label), 'the product list'),
      allowed: [s, 2, math.evaluate(`2*${s}`), math.evaluate(`${s}+2`)],
      given: [s],
      nouns: ['spinner', 'coin'],
    };
  },
  'mm_gen_7_7_6B_simulate-fair-coin': (q) => {
    const [n] = match(/simulate (\d+) fair coin tosses/, q.prompt);
    const pHeads = (label) => {
      if (/two equally likely outcomes/.test(label)) return math.fraction(1, 2);
      if (/die where only 1 represents heads/.test(label)) return math.fraction(1, 6);
      const [heads, tails] = [/one heads section/.test(label) ? 1 : null, /three tails sections/.test(label) ? 3 : null];
      return math.fraction(heads, heads + tails);
    };
    return {
      answer: onlyOne(q, (label) => math.equal(pHeads(label), math.fraction(1, 2)), 'a fair model'),
      allowed: [n, 1, 2, 3, 4, 6],
      given: [n],
      nouns: ['toss'],
    };
  },
  'mm_gen_7_7_6B_compound-simulation': (q) => {
    const [s] = match(/a (\d+)-section spinner/, q.prompt);
    return {
      answer: onlyOne(q, (label) => /coin/.test(label) && /spinner/.test(label), 'a two-stage model'),
      allowed: [s, 1, 2, math.evaluate(`2*${s}`)],
      given: [s],
      nouns: ['spinner'],
    };
  },
  'mm_gen_7_7_6B_select-trials': (q) => {
    const [small, large] = match(/either (\d+) trials or (\d+) trials/, q.prompt);
    const most = Math.max(...labels(q).map(choiceNumber));
    return {
      answer: onlyOne(q, (label) => choiceNumber(label) === most, 'the larger plan'),
      allowed: [small, large, pct(small, 1), pct(large, 2)],
      given: [small, large],
      nouns: ['trials'],
    };
  },
  'mm_gen_7_7_6F_random-vs-biased': (q) => {
    const [n] = match(/A school has (\d+) students/, q.prompt);
    return { answer: onlyOne(q, (label) => /random sample/i.test(label), 'a random sample'), allowed: [n], given: [n], nouns: ['student'] };
  },
  'mm_gen_7_7_6F_compare-samples': (q) => {
    const [aN, p, bN] = match(/sample A has (\d+) people and estimates (\d+)% support\. Random sample B has (\d+) people/, q.prompt);
    const largerName = bN > aN ? 'Sample B' : 'Sample A';
    return {
      answer: onlyOne(q, (label) => label.startsWith(largerName) && /larger/.test(label), 'the larger sample'),
      allowed: [aN, bN, p, pct(aN, 1), pct(bN, 2)],
      given: [aN, bN, p],
      nouns: ['Sample B'],
    };
  },
  'mm_gen_7_7_6H_compare-simulations': (q) => {
    const [a, b] = match(/Simulation A uses (\d+) trials and estimates 50%; Simulation B uses (\d+) trials/, q.prompt);
    const more = b > a ? 'Simulation B' : 'Simulation A';
    return {
      answer: onlyOne(q, (label) => label === more, 'the larger simulation'),
      allowed: [a, b, 50, pct(a, 1), pct(b, 2)],
      given: [a, b],
      nouns: ['Simulation'],
    };
  },
  'mm_gen_7_7_6I_theory-vs-data-error': (q) => {
    const [p] = match(/experimental probability of (\d+)% proves/, q.prompt);
    return {
      answer: onlyOne(q, (label) => /can vary/.test(label) && /sample space/.test(label), 'the correction'),
      // The review's own illustration: a fair coin (1/2 = 50%), 7 heads in 10 tosses.
      allowed: [p, 1, 2, 50, 7, 10, 70],
      given: [p],
      nouns: ['experimental'],
    };
  },
  'mm_gen_7_7_12A_error-analysis': (q) => {
    const [amax, bmax] = match(/maximum is (\d+), while Group B has maximum (\d+)/, q.prompt);
    return {
      answer: onlyOne(q, (label) => /shape, center, and spread/.test(label), 'the full comparison'),
      allowed: [amax, bmax, math.evaluate(`${amax}-${bmax}`)],
      given: [amax, bmax],
      nouns: ['Group A'],
    };
  },
  'mm_gen_7_7_12B_sample-method': (q) => {
    const [pop] = match(/opinions of (\d+) residents/, q.prompt);
    return { answer: onlyOne(q, (label) => label.startsWith('Randomly select'), 'random selection'), allowed: [pop], given: [pop], nouns: ['residents'] };
  },
  'mm_gen_7_7_12B_inference-caution': (q) => {
    const [n, p] = match(/random sample of (\d+) students estimates (\d+)% support/, q.prompt);
    return {
      answer: onlyOne(q, (label) => label.startsWith(`About ${p}%`) && /sampling variation/.test(label), 'the hedged estimate'),
      allowed: [n, p],
      given: [n, p],
      nouns: ['students'],
    };
  },
  'mm_gen_7_7_12C_overlap-interpretation': (q) => {
    const [a, b] = match(/have medians (\d+) and (\d+)/, q.prompt);
    const higher = b > a ? 'B' : 'A';
    return {
      answer: onlyOne(q, (label) => label.startsWith(`Population ${higher} likely has a larger center`), 'the center inference'),
      allowed: [a, b, Math.abs(b - a)],
      given: [a, b],
      nouns: ['median'],
    };
  },
  'mm_gen_7_7_12C_spread-comparison': (q) => {
    const [ra, rb] = match(/A sample range is (\d+) and B sample range is (\d+)/, q.prompt);
    const wider = rb > ra ? 'Population B' : 'Population A';
    return {
      answer: onlyOne(q, (label) => label === wider, 'the wider population'),
      allowed: [ra, rb, Math.abs(rb - ra)],
      given: [ra, rb],
      nouns: ['range'],
    };
  },
  'mm_gen_7_7_12C_claim-strength': (q) => {
    const [n, a, n2, b] = match(/Sample A has (\d+) random observations with mean (\d+); Sample B has (\d+) random observations with mean (\d+)/, q.prompt);
    assert.equal(n, n2);
    assert.ok(b > a, 'the family always draws B above A');
    return {
      answer: onlyOne(q, (label) => /Population B has a higher center/.test(label), 'the center claim'),
      allowed: [n, a, b, b - a],
      given: [n, a, b],
      nouns: ['mean'],
    };
  },
  'mm_gen_7_7_13E_compare-interest': (q) => {
    const [P, r, t] = match(/start at \$(\d+) with (\d+)% annual interest for (\d+) years/, q.prompt);
    const yearly = math.evaluate(`${P}*${r}/100`);
    const simple = math.evaluate(`${P} + ${P}*${r}/100*${t}`);
    const compound = math.evaluate(`${P}*(1+${r}/100)^${t}`);
    const answer = compound > simple ? 'Compound interest' : (compound < simple ? 'Simple interest' : 'They must be equal');
    return {
      answer: onlyOne(q, (label) => label === answer, 'the larger balance'),
      allowed: [P, r, t, 1, 2, yearly, simple, math.evaluate(`1+${r}/100`), math.evaluate(`${P}+${yearly}`),
        [compound, 0.005 + 1e-9], [compound - simple, 0.005 + 1e-9]],
      given: [P, r, t],
      nouns: ['interest'],
    };
  },
};

// --- the verdict the worked steps reach --------------------------------------------
//
// The answerSummary is checked against the oracle above, but a student reads the
// steps. Each entry below is built from the oracle's answer (never from the
// review) and says what the headline and the final reasoning step must conclude,
// what they must never claim (the losing option stated as the conclusion), and,
// where a number has one role, which value that role must carry.

const esc = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const other = (name, pair) => pair.find((entry) => entry !== name);
const AB = (prefix, winner) => other(winner, [`${prefix} A`, `${prefix} B`]);

const VERDICTS = {
  'mm_gen_6_6_4C_same-attribute-check': () => ({ headline: /compares two counts of the same attribute/, final: /each is a rate, not a same-attribute ratio/ }),
  'mm_gen_6_6_6A_time-distance': () => ({ headline: /time is the independent variable/, final: /Time traveled is the independent variable and distance traveled is the dependent variable/, contradicts: [/distance (?:traveled )?is the independent/i] }),
  'mm_gen_6_6_6A_items-cost': () => ({ headline: /Total cost depends on how many tickets/, final: /total cost is dependent and the number of tickets is independent/, contradicts: [/total cost is (?:the )?independent/i] }),
  'mm_gen_6_6_6A_age-height': () => ({ headline: /age in weeks is independent/, final: /chosen or controlled: age in weeks\. Height is the dependent variable/, contradicts: [/height is (?:the )?independent/i] }),
  'mm_gen_6_6_7B_repair-expression': () => ({ headline: /so it is an expression/, final: /So it is an expression\./, contradicts: [/it is an (?:equation|inequality)/] }),
  'mm_gen_6_6_7D_commutative': () => ({ headline: /which is the commutative property of addition/, final: /Changing order is the commutative property/, contradicts: [/which is the associative/] }),
  'mm_gen_6_6_7D_associative': () => ({ headline: /which is the associative property of addition/, final: /Changing the grouping without changing the order is the associative property/, contradicts: [/which is the commutative/] }),
  'mm_gen_6_6_12A_choose-display': () => ({ headline: /use a histogram/, final: /the histogram is the display designed for this/ }),
  'mm_gen_6_6_12B_shape-symmetric': (answer) => {
    const shape = answer.replace(/^Approximately /, '').toLowerCase();
    return { headline: new RegExp(`the histogram is (?:approximately )?${esc(shape)}`), final: new RegExp(`the shape is (?:approximately )?${esc(shape)}`) };
  },
  'mm_gen_6_6_13B_varying-data': (answer) => (answer === 'Variability'
    ? { headline: /so the data have variability/, final: /the measurements vary: the data have variability/, contradicts: [/data have no variability/] }
    : { headline: /no variability/, final: /no variability/, contradicts: [/data have variability/] }),
  'mm_gen_6_6_13B_repeat-measurement': (answer) => (/no variability/.test(answer)
    ? { headline: /the displayed data have no variability/, final: /the displayed data have no variability/, contradicts: [/data have variability/] }
    : { headline: /have variability/, final: /have variability/, contradicts: [/no variability/] }),
  'mm_gen_6_6_13B_compare-variability': (answer) => ({
    headline: new RegExp(`^${esc(answer)} \\(.*so it has variability`),
    final: new RegExp(`${esc(answer)}'s range is .*so ${esc(answer)} is the set with variability`),
    contradicts: [new RegExp(`${AB('Set', answer)} is the set with variability`), new RegExp(`${AB('Set', answer)} \\([^)]*\\) contains different values`)],
  }),
  'mm_gen_7_7_5C_compare-scales': (answer) => ({
    headline: new RegExp(`^On ${esc(answer)} each centimeter stands for only`),
    final: new RegExp(`${esc(answer)} shows the object longer`),
    contradicts: [new RegExp(`${AB('Drawing', answer)} shows the object longer`)],
  }),
  'mm_gen_7_7_6A_missing-outcome': () => ({ headline: /the sample space is a list of ordered pairs/, final: /Neither one lists the/ }),
  'mm_gen_7_7_6B_simulate-fair-coin': () => ({ headline: /needs a device with \$2\$ equally likely outcomes/, final: /they would produce too few heads/ }),
  'mm_gen_7_7_6B_compound-simulation': () => ({ headline: /must produce both a coin result and one of/, final: /Either one drops a stage, so it cannot simulate the compound event/ }),
  'mm_gen_7_7_6B_select-trials': (answer, q) => {
    const counts = labels(q).map(choiceNumber);
    const [large, small] = [choiceNumber(answer), counts.find((value) => value !== choiceNumber(answer))];
    return {
      headline: new RegExp(`^\\$${large}\\$ trials give a more reliable estimate than \\$${small}\\$`),
      final: new RegExp(`The \\$${large}\\$-trial plan is generally more reliable`),
      contradicts: [new RegExp(`\\$${small}\\$-trial plan is generally more reliable`), new RegExp(`^\\$${small}\\$ trials give a more reliable`)],
    };
  },
  'mm_gen_7_7_6F_random-vs-biased': () => ({ headline: /Only a random sample from the full roster/, final: /the random roster sample is the one that supports a schoolwide inference/ }),
  'mm_gen_7_7_6F_compare-samples': (answer) => {
    const winner = /^(Sample [AB])/.exec(answer)[1];
    return {
      headline: new RegExp(`but ${winner}'s .* give a more stable estimate than ${AB('Sample', winner)}'s`),
      final: new RegExp(`${winner}'s estimate would generally vary less`),
      contradicts: [new RegExp(`${AB('Sample', winner)}'s estimate would generally vary less`)],
    };
  },
  'mm_gen_7_7_6H_compare-simulations': (answer) => ({
    headline: new RegExp(`but ${esc(answer)}'s .* fluctuate less than ${AB('Simulation', answer)}'s`),
    final: new RegExp(`${esc(answer)} would generally fluctuate less`),
    contradicts: [new RegExp(`${AB('Simulation', answer)} would generally fluctuate less`)],
  }),
  'mm_gen_7_7_6I_theory-vs-data-error': () => ({ headline: /it does not prove the theoretical probability is exactly/, final: /cannot prove its exact value/ }),
  'mm_gen_7_7_12A_error-analysis': () => ({ headline: /comparing distributions needs shape, center and spread/, final: /compare their centers .*spreads .*and shapes/, contradicts: [/Group A has the larger center/, /Group B has the smaller center/] }),
  'mm_gen_7_7_12B_sample-method': () => ({ headline: /^Randomly selecting from the full list/, final: /only the random full-list sample supports the inference/ }),
  'mm_gen_7_7_12B_inference-caution': (answer) => {
    const p = /^About (\d+)%/.exec(answer)[1];
    return { headline: new RegExp(`an estimate of about \\$${p}\\\\%\\$, not an exact claim`), final: new RegExp(`about \\$${p}\\\\%\\$ of the population may support it`) };
  },
  'mm_gen_7_7_12C_overlap-interpretation': (answer) => {
    const winner = /^(Population [AB])/.exec(answer)[1];
    return {
      headline: new RegExp(`so ${winner} likely has the larger center`),
      final: /is not supported, and "identical centers" ignores the gap/,
      contradicts: [new RegExp(`${AB('Population', winner)} likely has the larger center`)],
    };
  },
  'mm_gen_7_7_12C_spread-comparison': (answer) => ({
    headline: new RegExp(`suggests ${esc(answer)} is more variable`),
    final: new RegExp(`the samples suggest ${esc(answer)} is more variable`),
    contradicts: [new RegExp(`suggests? ${AB('Population', answer)} is more variable`)],
  }),
  'mm_gen_7_7_12C_claim-strength': () => ({ headline: /suggest Population B has a higher center, not that every B value is larger/, final: /The best-supported conclusion is that Population B has a higher center/, contradicts: [/Population A has a higher center/] }),
  'mm_gen_7_7_13E_compare-interest': (answer) => ({
    headline: new RegExp(`${esc(answer.toLowerCase())} earns more`),
    final: /compounding comes out ahead/,
    contradicts: [/simple interest earns more/i],
  }),
};

// Numbers with a single role in a review: every "<n> outcomes"/"<n> ordered pairs"
// in the missing-outcome review must be the size of the sample space (2s), apart
// from the explicitly rejected side-by-side count after "not".
const ROLES = {
  'mm_gen_7_7_6A_missing-outcome': (q) => {
    const [s] = match(/a (\d+)-color spinner/, q.prompt);
    return [{ pattern: /(?<!not \$)(\d+)\$? (?:outcomes|ordered pairs)/g, value: math.evaluate(`2*${s}`), what: 'the sample-space size' }];
  },
  'mm_gen_6_6_13B_compare-variability': (q) => {
    const setA = match(/Data set A is \$(\d+),(\d+),(\d+)\$/, q.prompt);
    const setB = match(/Data set B is \$(\d+),(\d+),(\d+)\$/, q.prompt);
    return [
      { pattern: /Set A's range is \$(\d+)\$/g, value: range(setA), what: "Set A's range" },
      { pattern: /Set B's range is \$(\d+)\$/g, value: range(setB), what: "Set B's range" },
    ];
  },
};

// A worked example is a claim too. These pin the conditions that make each
// example's conclusion follow (each was missing once and read as a false rule).
const EXAMPLE_CONDITIONS = {
  // "A has the smaller center" follows only when Group B's values are constrained
  // as well; with B = {bmax, 5, 5} and A = {amax, bmax-1, bmax-1}, A's center is larger.
  'mm_gen_7_7_12A_error-analysis': [{ claim: /smaller center/, needs: /every value in Group B is close to/ }],
  // The prompt says only "an s-section spinner"; equally likely results are an
  // assumption the review has to state, not a given.
  'mm_gen_7_7_6B_compound-simulation': [{ claim: /spinner[^.]*equally likely|equally likely[^.]*spinner/, needs: /Assume its \$\d+\$ sections are equal/ }],
};

// --- reading the review -----------------------------------------------------------

const reviewTexts = (review) => [review.headline, ...review.reasoning, review.commonError, review.connection, review.answerSummary]
  .filter((entry) => typeof entry === 'string');

const strings = (node) => (typeof node === 'string' ? [node]
  : Array.isArray(node) ? node.flatMap(strings)
    : node && typeof node === 'object' ? Object.values(node).flatMap(strings) : []);

const numbersIn = (text) => (String(text).match(/\d+(?:\.\d+)?/g) || []).map(Number);

const isAllowed = (value, allowed) => allowed.some((entry) => {
  const [target, tolerance] = Array.isArray(entry) ? entry : [entry, 1e-9];
  return Math.abs(Number(target) - value) <= tolerance;
});

// $…$ segments → mathjs: \times, \div, \frac, \%, \approx.
const toMathjs = (latex) => latex
  .replace(/\\times|\\cdot/g, '*')
  .replace(/\\div/g, '/')
  .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))')
  .replace(/\\%/g, '/100')
  .replace(/\\approx/g, '≈');

/** Every relation chain written in math in `text`, checked. Returns how many were checked. */
const checkRelations = (text, where) => {
  let checked = 0;
  for (const segment of splitMathSegments(text).filter(isMathSegment)) {
    const source = toMathjs(unwrapMathSegment(segment).value);
    const parts = source.split(/(=|≈|<|>)/);
    if (parts.length < 3) continue;
    const sides = parts.filter((unused, index) => index % 2 === 0).map((side) => side.trim());
    const ops = parts.filter((unused, index) => index % 2 === 1);
    // `$<$` names a symbol; `$x=1$` chooses a value. Neither is a claim to check.
    if (sides.some((side) => side === '' || side === 'x')) continue;
    assert.doesNotMatch(sides.join(' '), /\\|[A-Za-wyz]/, `${where}: a relation the oracle cannot read: ${segment}`);
    const values = sides.map((side) => math.evaluate(side, { x: 3.7 }));
    ops.forEach((op, index) => {
      const [left, right] = [values[index], values[index + 1]];
      const holds = op === '=' ? Math.abs(left - right) <= 1e-9 * Math.max(1, Math.abs(right))
        : op === '≈' ? Math.abs(left - right) <= 0.005 + 1e-9
          : op === '<' ? left < right : left > right;
      assert.ok(holds, `${where}: ${segment} — ${left} ${op} ${right} is false`);
    });
    checked += 1;
  }
  return checked;
};

// Templates whose review carries a computation, so the relation check must have
// found and verified at least one.
const MUST_COMPUTE = new Set([
  'mm_gen_6_6_6A_time-distance', 'mm_gen_6_6_6A_items-cost', 'mm_gen_6_6_7B_repair-expression',
  'mm_gen_6_6_7D_commutative', 'mm_gen_6_6_7D_associative', 'mm_gen_6_6_12B_shape-symmetric',
  'mm_gen_6_6_13B_varying-data', 'mm_gen_6_6_13B_repeat-measurement', 'mm_gen_6_6_13B_compare-variability',
  'mm_gen_7_7_5C_compare-scales', 'mm_gen_7_7_6A_missing-outcome', 'mm_gen_7_7_6B_simulate-fair-coin',
  'mm_gen_7_7_6B_compound-simulation', 'mm_gen_7_7_6I_theory-vs-data-error', 'mm_gen_7_7_12A_error-analysis',
  'mm_gen_7_7_12C_overlap-interpretation', 'mm_gen_7_7_12C_spread-comparison', 'mm_gen_7_7_12C_claim-strength',
  'mm_gen_7_7_13E_compare-interest',
]);

const GENERIC = /Use the defining property|Use the stated dimensions|Apply the defining condition|Read only the feature the question asks about|Put both quantities in the same form|The model must preserve both/;

const seeds = [
  ...Array.from({ length: 30 }, (unused, index) => `recap-probe-${index}`),
  ...Array.from({ length: Math.max(0, DRAWS - 30) + 10 }, (unused, index) => `review-oracle-${index}`),
];

test('every template named here is in the grade 6/7 seed with an oracle and a pin', () => {
  assert.equal(Object.keys(PINNED).length, 28);
  assert.deepEqual(Object.keys(ORACLES).sort(), Object.keys(PINNED).sort());
  assert.deepEqual(Object.keys(VERDICTS).sort(), Object.keys(PINNED).sort());
  for (const id of Object.keys(PINNED)) assert.ok(DOCUMENTS.has(id), `${id} is in the seed`);
  assert.ok(seeds.length >= DRAWS);
});

for (const [id, pin] of Object.entries(PINNED)) {
  test(`${id}: graded content is unchanged from the committed template`, () => {
    const doc = DOCUMENTS.get(id);
    const { solutionReview, ...rest } = doc;
    assert.ok(solutionReview, 'has a solution review');
    const derived = rest.generator.derived || {};
    const original = Object.fromEntries(Object.entries(derived).filter(([name]) => pin.derived.includes(name)));
    assert.deepEqual(Object.keys(original).sort(), [...pin.derived].sort(), 'original derived values are all still there');
    const graded = { ...rest, generator: { ...rest.generator } };
    if (pin.derived.length) graded.generator.derived = original; else delete graded.generator.derived;
    const sha = createHash('sha256').update(JSON.stringify(graded)).digest('hex').slice(0, 16);
    assert.equal(sha, pin.sha, 'prompt, choices, keys, parameters, constraints and metadata are byte-identical');
    assert.deepEqual(doc.responseFields.map((field) => field.expected), pin.expected);
    assert.equal(doc.variants, undefined, 'no variants: one review serves every draw');
  });

  test(`${id}: the review is a worked solution of each draw, with the right answer`, () => {
    const oracle = ORACLES[id];
    let relations = 0;
    for (const seed of seeds) {
      const { question, reason } = generatePathInstance(DOCUMENTS.get(id), seed);
      assert.ok(question, `${seed}: generated (${reason})`);
      const where = `${id} ${seed}`;
      strings(question).forEach((entry) => assert.doesNotMatch(entry, /\{\{|\}\}/, `${where}: no unresolved placeholder in ${entry}`));

      const review = question.solutionReview;
      const stored = buildPrivateSupport(question).solutionReview;
      assert.ok(review.reasoning.length >= 2 && review.reasoning.length <= 5, `${where}: 2..5 steps for the projector`);
      assert.ok(review.headline.length <= 160, `${where}: headline fits (${review.headline.length})`);
      review.reasoning.forEach((step) => assert.ok(step.length <= 400, `${where}: step fits (${step.length})`));
      assert.ok(review.commonError && review.commonError.length <= 400, `${where}: common error present and fits`);
      assert.ok(review.answerSummary.length <= 240, `${where}: answer summary fits`);
      assert.deepEqual(stored.reasoning, review.reasoning, `${where}: nothing is clipped when stored`);
      reviewTexts(review).forEach((entry) => assert.doesNotMatch(entry, GENERIC, `${where}: no generic filler`));

      const visible = oracle(question);
      const keyed = question.choices.find((choice) => choice.id === question.responseFields[0].expected);
      assert.equal(keyed.label, visible.answer, `${where}: the graded key is the oracle's answer`);
      assert.equal(review.answerSummary, visible.answer, `${where}: the answer summary states the correct choice`);

      const verdict = VERDICTS[id](visible.answer, question);
      assert.match(review.headline, verdict.headline, `${where}: the headline reaches the verdict`);
      assert.match(review.reasoning.at(-1), verdict.final, `${where}: the final step reaches the verdict`);
      for (const wrong of verdict.contradicts || []) {
        reviewTexts(review).forEach((entry) => assert.doesNotMatch(entry, wrong, `${where}: never concludes the losing option`));
      }
      for (const role of ROLES[id] ? ROLES[id](question) : []) {
        for (const entry of reviewTexts(review)) {
          for (const found of entry.matchAll(role.pattern)) {
            assert.equal(Number(found[1]), role.value, `${where}: "${found[0]}" must state ${role.what}`);
          }
        }
      }
      for (const { claim, needs } of EXAMPLE_CONDITIONS[id] || []) {
        review.reasoning.filter((step) => claim.test(step)).forEach((step) => assert.match(step, needs, `${where}: the example states the condition its conclusion needs`));
      }

      for (const entry of reviewTexts(review)) {
        // Every $ opens or closes a math segment: an odd count leaves raw TeX on screen.
        const dollars = (entry.match(/(?<!\\)\$/g) || []).length;
        assert.equal(dollars % 2, 0, `${where}: balanced $…$ in "${entry}"`);
        // "a 8-color", "a 11-section": numbers read aloud with a vowel sound take "an".
        assert.doesNotMatch(entry, /\b[Aa] \$?(?:8|11|18|8\d+)\b/, `${where}: article before a number in "${entry}"`);
        for (const value of numbersIn(entry)) {
          assert.ok(isAllowed(value, visible.allowed), `${where}: ${value} in "${entry}" is not derivable from the visible question`);
        }
        relations += checkRelations(entry, where);
      }

      const body = [review.headline, ...review.reasoning].join(' ');
      assert.ok(numbersIn(body).some((value) => visible.given.includes(value)),
        `${where}: the worked steps state a number from this prompt`);
      const shown = [question.prompt, ...labels(question)].join(' ').toLowerCase();
      const nouns = visible.nouns.filter((word) => shown.includes(word.toLowerCase()));
      assert.ok(nouns.length, `${where}: the context nouns come from the question`);
      assert.ok(nouns.some((word) => body.toLowerCase().includes(word.toLowerCase())), `${where}: the steps use this question's context (${nouns})`);
    }
    if (MUST_COMPUTE.has(id)) assert.ok(relations >= seeds.length, `${id}: the computation in the review was checked on every draw`);
  });
}
