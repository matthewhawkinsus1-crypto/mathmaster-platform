/*
 * WORKED SOLUTIONS THAT SOLVE THE DRAWN PROBLEM: eighteen Algebra 1 v2
 * templates (job J, "Content that teaches").
 *
 * These My Math Path templates are also the question pool for Live Challenge
 * standard rounds. Their solution reviews used to be a generic sentence ("Use
 * the stated dimensions... in the order required", "Construct each boundary
 * independently...") that taught nothing about the problem on the screen, so
 * the between-round solution a class saw was useless. Each review is now a
 * worked solution of THE DRAW: its own boundary points, its own sets, its own
 * r, its own groups and claim.
 *
 * A review is shown only after the question closes (Path recap / closed
 * review, Live Challenge after the round closes), so it may state the answer —
 * but it must be the right answer for that draw. This file proves, from the
 * DRAFT source the integrator builds the seed mirrors from:
 *
 *   - every draw (>= 40 seeded draws per template AND per variant, plus the 30
 *     recap probes) is fully substituted and fits the review shape the Path
 *     and the Live Challenge projector render (<= 5 reasoning steps, field
 *     lengths within the clamps of pathSolutionSupport / roundSolutionRecord);
 *   - an independent oracle reads the STUDENT-VISIBLE question (prompt,
 *     pairs, inequalities, points, table, choices) — never the generator's
 *     parameters or derived values — recomputes the mathematics with mathjs,
 *     and checks every number the review states;
 *   - the answer summary states the answer the server grades: it is parsed
 *     back into a response and the production grader marks it correct, and it
 *     agrees with the oracle;
 *   - each review mentions something specific to its draw (a number or a
 *     context noun read from the prompt);
 *   - everything except the review (prompt, response fields, choices,
 *     grading, parameters, constraints, the committed derived values,
 *     difficulty, hints...) is byte-for-byte the committed content (pinned
 *     literals). The only generator change allowed is NEW derived values the
 *     reviews read.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import * as math from 'mathjs';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';
import { buildPrivateSupport } from '../../functions/shared/pathSolutionSupport.mjs';
import { roundSolutionRecord } from '../../functions/shared/liveChallengeSolutionReveal.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

// Overridable only so a scratch run can point the same checks at a mutated copy.
const DRAFTS = process.env.MM_REVIEW_DRAFTS_DIR
  ? new URL(`file://${process.env.MM_REVIEW_DRAFTS_DIR}/`)
  : new URL('../../drafts/fidelity-v2/algebra1/', import.meta.url);
const DRAWS = Math.max(40, Number(process.env.MM_REVIEW_DRAWS) || 40);
const PROBES = 30;

// --- pinned committed content ----------------------------------------------------
//
// sha256 of the template with its solutionReview and generator.derived removed
// (stable key order), computed from the committed drafts before this change;
// `derived` is the committed derived block, which must survive unchanged.
const PINNED = {
  'A.2A': {
    // Re-pinned after #464's familyVersion 3→4 bump (m1); the old digest is the same content at familyVersion 3.
    'mm_A_2A_v2_discrete-mapping-domain-range': { sha256: '283e5182882345b39cd95976507668f293449458b39435a0f83b84b18b61e2bf', derived: { base: { x1: 'x0+1', x2: 'x0+2', x3: 'x0+3', y0: 'm*x0+b', y1: 'm*x1+b', y2: 'm*x2+b', y3: 'm*x3+b' }, variants: [] } },
  },
  'A.3D': {
    'mm_A_3D_v2_graph-solid-above': { sha256: '92857549071b7ba5574e21973a0b09ef54b5464973fddd86de0274c513f6be8f', derived: { base: null, variants: [] } },
    'mm_A_3D_v2_graph-dashed-below': { sha256: 'fc5d0060390f3cd51b4ab710778f65bba90468dc6a1409fe531175adc16a0790', derived: { base: null, variants: [] } },
    'mm_A_3D_v2_graph-solid-below': { sha256: '8a06087d5c1411b2e1c325d3f78ef6041814319cc13a256e88485963b61ff082', derived: { base: null, variants: [null, { m: 'rise/run' }] } },
    'mm_A_3D_v2_graph-dashed-above': { sha256: 'b55cfc882469a516913616e21b7384d8155af9aef5f321db27fe37fc4a97d2cb', derived: { base: null, variants: [] } },
  },
  'A.3H': {
    'mm_A_3H_v2_system-solid-overlap': { sha256: '555a513b416f8ed1c99a96d86a9df6294125bf4b6dc0384f495a366e97ae4383', derived: { base: null, variants: [null, { upper: 'lower+gap' }] } },
    'mm_A_3H_v2_system-dashed-overlap': { sha256: '0b91783e55b28e8f971b654517287918a5a8e203947f76372c69ae2aecdcaa4a', derived: { base: null, variants: [null, { m1: 'rise1/run1', m2: 'rise2/run2' }] } },
    'mm_A_3H_v2_system-mixed-boundaries': { sha256: '8e242cb84e945c014cdb33550232ffef138811bd3f12c4593a3bdd9b59014820', derived: { base: null, variants: [] } },
    'mm_A_3H_v2_system-context-feasible-region': { sha256: 'cb935745e1954742fd183c18d1febafa84e2a41f49f20e4cfdf5309723267841', derived: { base: null, variants: [] } },
    'mm_A_3H_v2_system-error-no-overlap': { sha256: '5a13c790d9ed9f46cef79d861b6184ca4ba8c8a2b453de660312821b40b1f016', derived: { base: null, variants: [] } },
  },
  'A.4A': {
    'mm_A_4A_v2_correlation-negative-noisy': { sha256: '98e32daf9a76958095784f5afca29229a5b5a48edcc8adee22ecd47ca1180d74', derived: { base: { y0: 'b', y1: 'b-m+1', y2: 'b-2*m-1', y3: 'b-3*m+1', y4: 'b-4*m-1' }, variants: [] } },
  },
  'A.4B': {
    'mm_A_4B_v2_confounder-season': { sha256: '8a188329c986cc78793a851fe4674b05ac36cdf9fb6bb9baffa0b568944bc3e0', derived: { base: null, variants: [] } },
    'mm_A_4B_v2_random-assignment': { sha256: 'aa6225efced3b955968764cbb72e17c7bda0cfc2653679c5b3ea0de641226a77', derived: { base: null, variants: [] } },
    'mm_A_4B_v2_observational-limit': { sha256: '98bc92560bcef440954181884732771916906f53c57c2fb88d4256b760ecdb6a', derived: { base: null, variants: [] } },
    'mm_A_4B_v2_headline-error': { sha256: 'f35d08b604877f51b6e299b703e337753e5f07ddba212082eaff0f6a5d6462ac', derived: { base: null, variants: [null, null] } },
    'mm_A_4B_v2_improve-evidence': { sha256: 'dbb7562e41a04cbef079ae7fd872081a10da823731e11dbd270e554a8574d274', derived: { base: null, variants: [null, null] } },
  },
  'A.5C': {
    'mm_A_5C_v2_classify-identical': { sha256: 'dbfbb683bb4c2b8259d0841046f9405c227feca2ce9e0f26a42293ea78b294b1', derived: { base: null, variants: [] } },
  },
  'A.12A': {
    'mm_A_12A_v2_table-function': { sha256: 'd767130a955fde5f6b705dbfe3384d83a18a8c3b0c46ee0a21b78a57fe0c9b77', derived: { base: null, variants: [] } },
  },
};

const stable = (value) => (Array.isArray(value)
  ? `[${value.map(stable).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
    : JSON.stringify(value));

const withoutReviewAndDerived = (doc) => {
  const copy = JSON.parse(JSON.stringify(doc));
  const clean = (node) => { delete node.solutionReview; if (node.generator) delete node.generator.derived; };
  clean(copy);
  (copy.variants || []).forEach(clean);
  return copy;
};

const loadTemplates = () => Object.entries(PINNED).flatMap(([standard, pins]) => {
  const payload = JSON.parse(readFileSync(new URL(`${standard}.json`, DRAFTS), 'utf8'));
  return Object.entries(pins).map(([id, pin]) => {
    const template = payload.documents.find((doc) => doc.id === id);
    assert.ok(template, `${id} is staged in ${standard}.json`);
    return { standard, id, pin, template };
  });
});

// --- reading a review --------------------------------------------------------------

const reviewTexts = (review) => [
  review.headline, ...review.reasoning, review.commonError, review.connection, review.answerSummary,
].filter((entry) => typeof entry === 'string' && entry);

// Every number a review states, with its sign. `{{b|signed}}` renders "x- 4",
// so a sign separated from its digits by a space is re-attached first.
const statedNumbers = (text) => (String(text).replace(/([+-])\s+(?=\d)/g, '$1')
  .match(/-?\d+(?:\.\d+)?/g) || []).map(Number);

const close = (a, b, eps = 1e-9) => Math.abs(Number(a) - Number(b)) <= eps;

const assertNumbersAllowed = (review, allowed, label) => {
  const values = [...allowed].map(Number);
  for (const text of reviewTexts(review)) {
    for (const value of statedNumbers(text)) {
      // A displayed "x+ 3" re-attaches as "+3"; the regex already drops "+".
      assert.ok(values.some((entry) => close(entry, value)),
        `${label}: the review states ${value}, which the oracle did not derive from the question ("${text}")`);
    }
  }
};

const words = (text) => String(text).toLowerCase().replace(/[^a-z0-9%\s-]/g, ' ').split(/\s+/).filter(Boolean);
const containsRun = (haystack, needle, size) => {
  const hay = ` ${words(haystack).join(' ')} `;
  const tokens = words(needle);
  const width = Math.min(size, tokens.length);
  for (let start = 0; start + width <= tokens.length; start += 1) {
    if (hay.includes(` ${tokens.slice(start, start + width).join(' ')} `)) return true;
  }
  return false;
};

// Evaluate a rendered "3x+ 1" / "-1x- 4" right-hand side at x.
const rhsAt = (expression, x) => math.evaluate(String(expression).replace(/\s+/g, '').replace(/(\d)x/g, '$1*x'), { x });

const relationHolds = (relation, lhs, rhs) => ({
  '>': lhs > rhs, '>=': lhs >= rhs, '<': lhs < rhs, '<=': lhs <= rhs,
})[relation];

const RELATION_FROM_TEX = { '\\ge': '>=', '\\le': '<=', '>': '>', '<': '<' };

// --- production grading --------------------------------------------------------------

const issue = async (question) => {
  const plan = await mathPath.buildIssuePlan(question);
  assert.equal(plan.issuable, true, `${question.id} instance is issuable (${plan.reason})`);
  return plan;
};

const gradeTool = async (plan, raw) => mathPath.gradePathToolResponse(plan.privateGrading, { raw });

// Choice items: the runtime ids the browser sees, matched back to their labels.
const gradeChoices = async (question, plan, labelByField) => {
  const sanitized = mathPath.buildSanitizedQuestion(question, { questionInstanceId: 'review-test', attemptsAllowed: 1 });
  const responses = {};
  for (const [fieldId, label] of Object.entries(labelByField)) {
    const field = sanitized.responseFields.find((entry) => entry.id === fieldId);
    const options = (field?.choices?.length ? field.choices : sanitized.choices) || [];
    const option = options.find((entry) => entry.label === label);
    assert.ok(option, `${question.id}: option "${label}" is offered for ${fieldId}`);
    responses[fieldId] = option.id;
  }
  return mathPath.gradeResponse(plan.privateGrading, { responses });
};

// --- the oracles ------------------------------------------------------------------------
//
// Each takes the generated question and returns
//   { allowed: numbers the review may state, specific: draw-specific tokens
//     the reasoning must mention, check: async (plan) => void }.

const ORACLES = {};

ORACLES['mm_A_2A_v2_discrete-mapping-domain-range'] = (q) => {
  const named = [...q.prompt.matchAll(/\$\((-?\d+), (-?\d+)\)\$/g)].map((match) => [+match[1], +match[2]]);
  const pairs = q.pairs.map((pair) => [Number(pair.x), Number(pair.y)]);
  assert.deepEqual(named, pairs, 'the prompt names the mapped pairs');
  const xs = pairs.map(([x]) => x);
  const ys = pairs.map(([, y]) => y);
  const isFunction = new Set(xs).size === xs.length;
  assert.equal(isFunction, true);
  const steps = ys.slice(1).map((y, index) => math.subtract(y, ys[index]));
  assert.ok(steps.every((step) => step === steps[0]), 'constant output step');
  const r = q.solutionReview;
  const setText = (values) => `\\{${values.join(', ')}\\}`;
  assert.ok(r.reasoning.some((step) => step.includes(`Domain: collect the first coordinates, $${setText(xs)}$`)), 'domain step');
  assert.ok(r.reasoning.some((step) => step.includes(`$${setText(ys)}$`) && step.includes(`Each output is ${steps[0]} more`)), 'range step with its common difference');
  assert.match(r.commonError, new RegExp(`\\$${xs[0]}\\\\le x\\\\le ${xs[3]}\\$`));
  const summary = /^Domain \$\\\{(.+?)\\\}\$; range \$\\\{(.+?)\\\}\$; it is a function\.$/.exec(r.answerSummary);
  assert.ok(summary, r.answerSummary);
  const domain = summary[1].split(', ').map(Number);
  const range = summary[2].split(', ').map(Number);
  assert.deepEqual([...domain].sort((a, b) => a - b), [...new Set(xs)].sort((a, b) => a - b));
  assert.deepEqual([...range].sort((a, b) => a - b), [...new Set(ys)].sort((a, b) => a - b));
  return {
    allowed: [...xs, ...ys, steps[0], 1],
    specific: [String(xs[0]), String(ys[0])],
    check: async (plan) => {
      assert.deepEqual([...plan.privateGrading.definition.domain].sort((a, b) => a - b), [...domain].sort((a, b) => a - b));
      assert.equal(plan.privateGrading.definition.isFunction, isFunction);
      assert.equal((await gradeTool(plan, { domain, range, isFunction: 'yes-definition' })).isCorrect, true, 'summary graded correct');
      assert.equal((await gradeTool(plan, { domain: range, range: domain, isFunction: 'yes-definition' })).isCorrect, false);
    },
  };
};

// One linear inequality y REL mx + b (A.3D).
const singleInequalityOracle = (q) => {
  const [inequality] = q.inequalities;
  const m = Number(inequality.m);
  const b = Number(inequality.b);
  const prompt = /\$y(\\ge|\\le|<|>)\s*(.+?)\$/.exec(q.prompt);
  assert.ok(prompt, q.prompt);
  const relation = RELATION_FROM_TEX[prompt[1]];
  assert.equal(relation, inequality.relation, 'the prompt and the graph agree on the symbol');
  [-2, 0, 3].forEach((x) => assert.ok(close(rhsAt(prompt[2], x), m * x + b), 'the prompt and the graph agree on the line'));
  const style = relation.includes('=') ? 'solid' : 'dashed';
  const side = relation.includes('>') ? 'above' : 'below';
  const r = q.solutionReview;
  const allowed = [0, 1, b, m];
  const implied = /implied by (-?\d+)\/(\d+)/.exec(q.prompt);
  let rise = null;
  let run = null;
  if (implied) {
    rise = +implied[1];
    run = +implied[2];
    assert.ok(close(math.divide(rise, run), m), 'the stated rise/run is the slope');
    allowed.push(rise, run, math.add(b, rise));
    assert.ok(r.reasoning[0].includes(`$y=\\frac{${rise}}{${run}}x`), 'boundary written with the exact slope');
    // The grid-point advice must be true for THIS rise/run: an unreduced slope
    // such as 2/4 already reaches a lattice point at x = 2, so the review may
    // not say a grid point comes "only" after a whole run.
    assert.ok(math.gcd(Math.abs(rise), run) === 1 || !/only after/.test(r.commonError),
      `${rise}/${run} reaches a grid point before a whole run: ${r.commonError}`);
    assert.ok(r.commonError.includes(`after a whole run of ${run}, so use $(0,${b})$ and $(${run},${math.add(b, rise)})$`), r.commonError);
  } else {
    allowed.push(math.add(m, b));
  }
  assert.ok(r.reasoning[0].includes(`$(0,${b})$`), 'boundary starts at the y-intercept');
  assert.match(r.reasoning[1], new RegExp(`the line is ${style}\\.$`));
  assert.match(r.reasoning[2], new RegExp(`so shade ${side}\\.`));
  const checkPoint = /Check \$\(0,(-?\d+)\)\$: \$(-?\d+)(\\ge |\\le |<|>)(-?\d+)\$ is true/.exec(r.reasoning[2]);
  assert.ok(checkPoint, r.reasoning[2]);
  const t = +checkPoint[1];
  assert.equal(+checkPoint[2], t);
  assert.equal(+checkPoint[4], b);
  assert.equal(RELATION_FROM_TEX[checkPoint[3].trim()], relation);
  assert.ok(relationHolds(relation, t, b), 'the check point satisfies the inequality');
  assert.ok(side === 'above' ? t > b : t < b, 'and lies on the shaded side');
  allowed.push(t);
  const summary = /^(Solid|Dashed) line through \$\((-?\d+),(-?\d+)\)\$ and \$\((-?\d+),(-?\d+)\)\$, (?:which is \$y=(.+?)\$, )?with the half-plane (above|below) it shaded\.$/.exec(r.answerSummary);
  assert.ok(summary, r.answerSummary);
  const points = [[+summary[2], +summary[3]], [+summary[4], +summary[5]]];
  points.forEach(([x, y]) => assert.ok(close(y, m * x + b), `(${x},${y}) is on the boundary`));
  assert.notEqual(points[0][0], points[1][0]);
  assert.equal(summary[1].toLowerCase(), style);
  assert.equal(summary[7], side);
  if (summary[6]) [-1, 2].forEach((x) => assert.ok(close(rhsAt(summary[6], x), m * x + b)));
  return {
    allowed,
    specific: [`(0,${b})`],
    check: async (plan) => {
      const raw = { construction: [{ points: points.map(([x, y]) => ({ x, y })), boundaryStyle: style, shade: side }] };
      assert.equal((await gradeTool(plan, raw)).isCorrect, true, 'summary construction graded correct');
      const flipped = { construction: [{ ...raw.construction[0], shade: side === 'above' ? 'below' : 'above' }] };
      assert.equal((await gradeTool(plan, flipped)).isCorrect, false);
    },
  };
};

// Two inequalities (A.3H): sloped wedge, fractional wedge, or horizontal strip.
const systemOracle = (q) => {
  const inequalities = q.inequalities.map((entry) => ({ m: Number(entry.m), b: Number(entry.b), relation: entry.relation }));
  const symbols = [...q.prompt.matchAll(/\$y(\\ge|\\le|<|>)\s*(.+?)\$/g)];
  assert.equal(symbols.length, 2, q.prompt);
  symbols.forEach((match, index) => {
    assert.equal(RELATION_FROM_TEX[match[1]], inequalities[index].relation);
    [-2, 0, 3].forEach((x) => assert.ok(close(rhsAt(match[2], x), inequalities[index].m * x + inequalities[index].b)));
  });
  const styles = inequalities.map((entry) => (entry.relation.includes('=') ? 'solid' : 'dashed'));
  const sides = inequalities.map((entry) => (entry.relation.includes('>') ? 'above' : 'below'));
  const satisfies = (index, x, y) => relationHolds(inequalities[index].relation, y, inequalities[index].m * x + inequalities[index].b);
  const r = q.solutionReview;
  const all = reviewTexts(r).join('\n');
  const strip = inequalities.every((entry) => entry.m === 0);
  const fractional = !strip && inequalities.some((entry) => !Number.isInteger(entry.m));
  const allowed = [0, 1, ...inequalities.flatMap((entry) => [entry.b])];
  const boundaryPoints = [];

  inequalities.forEach((entry, index) => {
    const step = r.reasoning[index];
    assert.ok(step.includes(`$(0,${entry.b})$`), `boundary ${index + 1} starts at its intercept: ${step}`);
    if (strip) {
      assert.ok(step.includes(`$(1,${entry.b})$`));
      boundaryPoints.push([[0, entry.b], [1, entry.b]]);
    } else if (fractional) {
      const move = /a rise of (-?\d+) over a run of (\d+) reaches \$\((\d+),(-?\d+)\)\$/.exec(step);
      assert.ok(move, step);
      const [rise, run, x, y] = move.slice(1).map(Number);
      assert.ok(close(math.divide(rise, run), entry.m), 'rise/run is the slope shown on the graph');
      assert.equal(x, run);
      assert.ok(close(y, entry.m * x + entry.b), 'the second point is on the boundary');
      assert.ok(step.includes(`\\frac{${rise}}{${run}}x`));
      allowed.push(rise, run, y);
      boundaryPoints.push([[0, entry.b], [x, y]]);
    } else {
      const p = math.add(entry.m, entry.b);
      assert.ok(step.includes(`$(1,${p})$`), step);
      allowed.push(p, entry.m);
      boundaryPoints.push([[0, entry.b], [1, p]]);
    }
    assert.ok(step.includes(`is ${styles[index]}`) || step.includes(`the line is ${styles[index]}`), `style ${styles[index]}: ${step}`);
    assert.ok(step.includes(`shade ${sides[index]} it`), `side ${sides[index]}: ${step}`);
  });

  // The point the review checks is in the overlap; the point it uses to show a
  // union is wrong satisfies the first inequality and fails the second.
  const checks = [...all.matchAll(/Check \$\(0,(-?\d+)\)\$/g)].map((match) => +match[1]);
  assert.ok(checks.length >= 1, 'the review checks a point');
  checks.forEach((t) => {
    assert.ok(satisfies(0, 0, t) && satisfies(1, 0, t), `(0,${t}) is in the overlap`);
    allowed.push(t);
  });
  const unions = [...all.matchAll(/\$\(0,(-?\d+)\)\$(?:: it)?(?: satisfies| is above)/g)].map((match) => +match[1]);
  assert.ok(unions.length >= 1, 'the review names a point the union wrongly keeps');
  unions.forEach((u) => {
    assert.ok(satisfies(0, 0, u) && !satisfies(1, 0, u), `(0,${u}) satisfies only the first inequality`);
    allowed.push(u);
  });
  if (strip) {
    const [lower, upper] = inequalities.map((entry) => entry.b);
    assert.ok(all.includes(`${upper - lower} units tall`));
    allowed.push(upper - lower);
    const summary = /^Solid lines \$y=(-?\d+)\$ and \$y=(-?\d+)\$, with only the strip \$(-?\d+)\\le y\\le (-?\d+)\$ shaded\.$/.exec(r.answerSummary);
    assert.ok(summary, r.answerSummary);
    assert.deepEqual(summary.slice(1).map(Number), [lower, upper, lower, upper]);
  } else {
    // The wedge opens to the left: the lower boundary rises, the upper falls.
    assert.ok(inequalities[0].m > 0 && inequalities[1].m < 0 && sides[0] === 'above' && sides[1] === 'below');
    assert.match(all, /wedge to the left of where they cross/);
    if (fractional) {
      const summary = /^Solid boundary through \$\(0,(-?\d+)\)\$ and \$\((\d+),(-?\d+)\)\$ shaded above, dashed boundary through \$\(0,(-?\d+)\)\$ and \$\((\d+),(-?\d+)\)\$ shaded below; only the overlap is the solution\.$/.exec(r.answerSummary);
      assert.ok(summary, r.answerSummary);
      assert.deepEqual(styles, ['solid', 'dashed']);
      const [b1, x1, y1, b2, x2, y2] = summary.slice(1).map(Number);
      assert.deepEqual([[0, b1], [x1, y1]], boundaryPoints[0]);
      assert.deepEqual([[0, b2], [x2, y2]], boundaryPoints[1]);
    } else {
      const summary = /^(Solid|Dashed) \$y=(.+?)\$ shaded (above|below), (solid|dashed) \$y=(.+?)\$ shaded (above|below); only the overlapping wedge, which contains \$\(0,(-?\d+)\)\$, is the solution\.$/.exec(r.answerSummary);
      assert.ok(summary, r.answerSummary);
      assert.deepEqual([summary[1].toLowerCase(), summary[4]], styles);
      assert.deepEqual([summary[3], summary[6]], sides);
      [-1, 2].forEach((x) => {
        assert.ok(close(rhsAt(summary[2], x), inequalities[0].m * x + inequalities[0].b));
        assert.ok(close(rhsAt(summary[5], x), inequalities[1].m * x + inequalities[1].b));
      });
      const t = +summary[7];
      assert.ok(satisfies(0, 0, t) && satisfies(1, 0, t));
    }
  }
  return {
    allowed,
    specific: inequalities.map((entry) => `(0,${entry.b})`),
    check: async (plan) => {
      const construction = boundaryPoints.map((points, index) => ({
        points: points.map(([x, y]) => ({ x, y })), boundaryStyle: styles[index], shade: sides[index],
      }));
      assert.equal((await gradeTool(plan, { construction })).isCorrect, true, 'summary construction graded correct');
      const union = construction.map((entry, index) => (index === 1 ? { ...entry, shade: 'above' } : entry));
      assert.equal((await gradeTool(plan, { construction: union })).isCorrect, false);
    },
  };
};

ORACLES['mm_A_3D_v2_graph-solid-above'] = singleInequalityOracle;
ORACLES['mm_A_3D_v2_graph-dashed-below'] = singleInequalityOracle;
ORACLES['mm_A_3D_v2_graph-solid-below'] = singleInequalityOracle;
ORACLES['mm_A_3D_v2_graph-dashed-above'] = singleInequalityOracle;
ORACLES['mm_A_3H_v2_system-solid-overlap'] = systemOracle;
ORACLES['mm_A_3H_v2_system-dashed-overlap'] = systemOracle;
ORACLES['mm_A_3H_v2_system-mixed-boundaries'] = systemOracle;
ORACLES['mm_A_3H_v2_system-context-feasible-region'] = systemOracle;
ORACLES['mm_A_3H_v2_system-error-no-overlap'] = (q) => {
  const result = systemOracle(q);
  assert.match(q.solutionReview.reasoning.join(' '), /union/);
  return result;
};

ORACLES['mm_A_4A_v2_correlation-negative-noisy'] = (q) => {
  const points = q.points.map((point) => [Number(point.x), Number(point.y)]);
  assert.equal(+(/the first point is \$\(0,(-?\d+)\)\$/.exec(q.prompt)[1]), points[0][1]);
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const xbar = math.mean(xs);
  const ybar = math.mean(ys);
  const sxy = math.sum(points.map(([x, y]) => (x - xbar) * (y - ybar)));
  const sxx = math.sum(xs.map((x) => (x - xbar) ** 2));
  const syy = math.sum(ys.map((y) => (y - ybar) ** 2));
  const r = sxy / math.sqrt(sxx * syy);
  const rounded = math.round(r, 3);
  const direction = r > 0 ? 'positive' : 'negative';
  const strength = Math.abs(r) >= 0.8 ? 'strong' : Math.abs(r) >= 0.5 ? 'moderate' : 'weak';
  const review = q.solutionReview;
  const all = reviewTexts(review).join('\n');
  points.forEach(([x, y]) => assert.ok(all.includes(`$(${x},${y})$`), `point (${x},${y}) listed`));
  assert.ok(all.includes(`$\\bar x=${xbar}$`) && all.includes(`$\\bar y=${ybar}$`), 'means');
  assert.match(all, new RegExp(`S_\\{xy\\}=[^$]*=${sxy}\\$`));
  assert.match(all, new RegExp(`S_\\{xx\\}=[^$]*=${sxx}\\$`));
  assert.match(all, new RegExp(`S_\\{yy\\}=[^$]*=${syy}\\$`));
  assert.ok(all.includes(`\\frac{${sxy}}{\\sqrt{${sxx}\\cdot ${syy}}}\\approx ${rounded}$`), 'r from the sums');
  const summary = /^\$r\\approx (-?\d*\.\d+)\$: a (strong|moderate|weak) (negative|positive) linear association\.$/.exec(review.answerSummary);
  assert.ok(summary, review.answerSummary);
  assert.ok(Math.abs(+summary[1] - r) <= 0.0005, `summary r ${summary[1]} vs ${r}`);
  assert.equal(summary[2], strength);
  assert.equal(summary[3], direction);
  return {
    allowed: [...xs, ...ys, xbar, ybar, sxy, sxx, syy, rounded, 2, 0.8, 1],
    specific: [String(points[0][1])],
    check: async (plan) => {
      const definition = plan.privateGrading.definition;
      assert.ok(Math.abs(definition.r - r) < 1e-9, 'server r matches the oracle');
      assert.deepEqual(definition.descriptor, { direction, strength });
      assert.equal((await gradeTool(plan, { r: +summary[1], direction: summary[3], strength: summary[2] })).isCorrect, true);
      assert.equal((await gradeTool(plan, { r: -summary[1], direction: 'positive', strength: summary[2] })).isCorrect, false);
    },
  };
};

ORACLES['mm_A_5C_v2_classify-identical'] = (q) => {
  const equations = [...q.prompt.matchAll(/\$y=(.+?)\$/g)].map((match) => match[1]);
  assert.equal(equations.length, 2);
  const m = Number(q.system.m1);
  const b = Number(q.system.b1);
  [-3, 0, 2, 5].forEach((x) => {
    assert.ok(close(rhsAt(equations[0], x), rhsAt(equations[1], x)), 'the two equations are the same line');
    assert.ok(close(rhsAt(equations[0], x), m * x + b));
  });
  const type = close(m, Number(q.system.m2)) && close(b, Number(q.system.b2)) ? 'infinite' : 'other';
  assert.equal(type, 'infinite');
  const review = q.solutionReview;
  const listed = [...review.reasoning[1].matchAll(/\((-?\d+),(-?\d+)\)/g)].map((match) => [+match[1], +match[2]]);
  assert.ok(listed.length >= 2, 'the review lists sample solutions');
  listed.forEach(([x, y]) => assert.ok(close(y, m * x + b), `(${x},${y}) solves both`));
  assert.ok(review.reasoning[0].includes(`same slope $${m}$`) && review.reasoning[0].includes(`same y-intercept $${b}$`));
  assert.match(review.answerSummary, /^Infinitely many solutions: /);
  return {
    allowed: [m, b, ...listed.flat()],
    specific: [`$${m}$`],
    check: async (plan) => {
      assert.equal(plan.privateGrading.definition.solution.type, 'infinite');
      assert.equal((await gradeTool(plan, { classification: 'infinite' })).isCorrect, true);
      assert.equal((await gradeTool(plan, { classification: 'one', x: 0, y: b })).isCorrect, false);
    },
  };
};

ORACLES['mm_A_12A_v2_table-function'] = (q) => {
  const rows = q.stimulus.table.rows.map(([x, y]) => [Number(x), Number(y)]);
  const inputs = rows.map(([x]) => x);
  const outputs = new Map();
  let isFunction = true;
  rows.forEach(([x, y]) => { if (outputs.has(x) && outputs.get(x) !== y) isFunction = false; outputs.set(x, y); });
  const verdict = isFunction ? 'FUNCTION' : 'NOT A FUNCTION';
  const review = q.solutionReview;
  rows.forEach(([x, y]) => assert.ok(review.reasoning[1].includes(`$${x}\\to ${y}$`), `${x} -> ${y}`));
  assert.ok(review.reasoning[0].includes(inputs.map((x) => `$${x}$`).slice(0, 3).join(', ')));
  assert.equal(new Set(inputs).size, inputs.length);
  const summary = /^(FUNCTION|NOT A FUNCTION): each of the inputs (.+) has exactly one output\.$/.exec(review.answerSummary);
  assert.ok(summary, review.answerSummary);
  assert.equal(summary[1], verdict);
  assert.deepEqual(summary[2].replace(' and ', ', ').split(', ').map(Number), inputs);
  return {
    allowed: rows.flat(),
    specific: [String(inputs[0])],
    check: async (plan) => {
      assert.equal(plan.privateGrading.fields[0].expected, verdict.toLowerCase());
      assert.equal((await mathPath.gradeResponse(plan.privateGrading, { responses: { answer: verdict } })).isCorrect, true);
      assert.equal((await mathPath.gradeResponse(plan.privateGrading, { responses: { answer: 'NOT A FUNCTION' } })).isCorrect, false);
    },
  };
};

// --- the study-design items (A.4B) -----------------------------------------------------
//
// The oracle encodes the statistics, not the key: an observational result
// establishes an association only; confounding is why it cannot settle cause;
// random assignment is what strengthens a causal claim; a lurking variable can
// drive two correlated quantities. It picks the option that says so from the
// visible labels, then the production grader confirms that option is the key.

const PRINCIPLE = [
  [/hot weather can influence both/i, true],
  [/randomly assign|randomized/i, true],
  [/association,? (?:but )?not (?:a )?caus|^an association between/i, true],
  [/confuses association with causation/i, true],
  [/does not rule out confounding/i, true],
  [/reduces systematic confounding/i, true],
  [/helps separate the treatment effect/i, true],
];
const principled = (label) => PRINCIPLE.some(([pattern]) => pattern.test(label));

const choiceFields = (q) => (q.responseFields.length > 1
  ? q.responseFields.map((field) => ({ id: field.id, labels: field.choices.map((choice) => choice.label) }))
  : [{ id: q.responseFields[0].id, labels: q.choices.map((choice) => choice.label) }]);

const studyOracle = (contextFrom) => (q) => {
  const context = contextFrom(q);
  const review = q.solutionReview;
  const fields = choiceFields(q);
  const picked = {};
  fields.forEach(({ id, labels }) => {
    const right = labels.filter(principled);
    assert.equal(right.length, 1, `${q.id}/${id}: exactly one option states the principle (${labels.join(' | ')})`);
    [picked[id]] = right;
    // The summary states the right option and none of the wrong ones.
    assert.ok(containsRun(review.answerSummary, picked[id], 5), `${q.id}/${id}: summary states "${picked[id]}": ${review.answerSummary}`);
    labels.filter((label) => label !== picked[id]).forEach((label) => {
      assert.ok(!containsRun(review.answerSummary, label, 4), `${q.id}/${id}: summary must not state "${label}"`);
    });
  });
  // A multi-part summary quotes every keyed option in full when the labels fit
  // the 240-character clamp together (they do not for a 4-part item).
  const keyed = fields.map(({ id }) => picked[id].replace(/\.$/, '').toLowerCase());
  if (fields.length > 1 && keyed.reduce((total, label) => total + label.length + 2, 0) <= 240) {
    keyed.forEach((label) => assert.ok(review.answerSummary.toLowerCase().includes(label), `${q.id}: summary quotes "${label}" in full: ${review.answerSummary}`));
  }
  // The instance's own keyed fields agree with the oracle.
  fields.forEach(({ id }) => {
    const field = q.responseFields.find((entry) => entry.id === id);
    const options = field.choices?.length ? field.choices : q.choices;
    assert.equal(options.find((choice) => choice.id === field.expected)?.label, picked[id], `${q.id}/${id} key`);
  });
  const reasoning = review.reasoning.join(' ');
  context.nouns.forEach((noun) => assert.ok(reasoning.includes(noun), `${q.id}: the reasoning names "${noun}"`));
  return {
    allowed: [...context.numbers, ...(context.extra || [])],
    specific: context.nouns,
    check: async (plan) => {
      assert.equal((await gradeChoices(q, plan, picked)).isCorrect, true, 'the summarized option is graded correct');
      const wrong = Object.fromEntries(fields.map(({ id, labels }) => [id, labels.find((label) => label !== picked[id])]));
      assert.equal((await gradeChoices(q, plan, wrong)).isCorrect, false);
    },
  };
};

ORACLES['mm_A_4B_v2_confounder-season'] = studyOracle((q) => {
  const match = /^(.+?) sales and (.+?) incidents both rise during hot months\./.exec(q.prompt);
  assert.ok(match, q.prompt);
  // Heat drives the second variable directly; being "in the water" is not why
  // heat-related incidents rise, so the mechanism may not rest on it alone.
  const reasoning = q.solutionReview.reasoning.join(' ');
  assert.ok(reasoning.includes(`heat also leads to more ${match[2]} incidents`), reasoning);
  assert.doesNotMatch(reasoning, /in the water, so/);
  return { numbers: [], nouns: [`${match[1]} sales`, `${match[2]} incidents`] };
});

ORACLES['mm_A_4B_v2_random-assignment'] = studyOracle((q) => {
  const match = /^Researchers have (\d+) students/.exec(q.prompt);
  assert.ok(match, q.prompt);
  const group = +match[1];
  const split = /for example (\d+) to tutoring and (\d+) to no tutoring/.exec(q.solutionReview.reasoning[0]);
  assert.ok(split, q.solutionReview.reasoning[0]);
  const [g1, g2] = [+split[1], +split[2]];
  assert.equal(math.add(g1, g2), group, 'the random split uses every student');
  assert.ok(Math.abs(g1 - g2) <= 1, 'into two equal-as-possible groups');
  assert.ok(q.solutionReview.answerSummary.includes(`${g1} and ${g2} of the ${group} students`));
  return { numbers: [group, g1, g2], nouns: [`${group} students`] };
});

ORACLES['mm_A_4B_v2_observational-limit'] = studyOracle((q) => {
  const match = /^A survey of (\d+) students finds that those who report (.+?) also report higher grades\./.exec(q.prompt);
  assert.ok(match, q.prompt);
  return { numbers: [+match[1]], nouns: [`${match[1]} students`, match[2]] };
});

ORACLES['mm_A_4B_v2_headline-error'] = studyOracle((q) => {
  const match = /(?:People|students) who (.+?) (?:have|report) (\d+)% better outcomes/.exec(q.prompt);
  assert.ok(match, q.prompt);
  return { numbers: [+match[2]], extra: [100], nouns: [match[1], `${match[2]}%`] };
});

ORACLES['mm_A_4B_v2_improve-evidence'] = studyOracle((q) => {
  const match = /association is found between (.+?) and (.+?)\. Which/.exec(q.prompt)
    || /students who use (.+?) have higher (.+?)\. A second study/.exec(q.prompt);
  assert.ok(match, q.prompt);
  return { numbers: [], nouns: [match[1], match[2]] };
});

// --- the runs -----------------------------------------------------------------------------

const variantTemplates = (template) => (Array.isArray(template.variants) && template.variants.length
  ? template.variants.map((variant, index) => ({ label: `variant ${index} (${variant.coverageKey})`, template: { ...template, variants: [variant] } }))
  : [{ label: 'base', template }]);

const checkInstance = async (id, question, label) => {
  const text = JSON.stringify(question);
  assert.doesNotMatch(text, /\{\{|NaN|undefined|Infinity/, `${label}: fully substituted`);
  assert.doesNotMatch(text, /\$\$/, `${label}: no empty math span`);
  const review = question.solutionReview;
  assert.ok(review && Array.isArray(review.reasoning), `${label}: has a review`);
  assert.ok(review.reasoning.length >= 2 && review.reasoning.length <= 5, `${label}: 2..5 steps (the projector shows 5)`);
  assert.ok(review.headline.length <= 160, `${label}: headline fits (${review.headline.length})`);
  review.reasoning.forEach((step) => assert.ok(step.length <= 400, `${label}: step fits (${step.length}): ${step}`));
  if (review.commonError) assert.ok(review.commonError.length <= 400, `${label}: commonError fits`);
  assert.ok(review.answerSummary && review.answerSummary.length <= 240, `${label}: answerSummary present and fits (${review.answerSummary?.length})`);
  reviewTexts(review).forEach((entry) => assert.equal((entry.match(/\$/g) || []).length % 2, 0, `${label}: balanced math in "${entry}"`));
  // Exactly what the Path and the Live Challenge projector would publish.
  const published = roundSolutionRecord({ question, solutionReview: buildPrivateSupport(question).solutionReview });
  assert.deepEqual([...published.solutionReview.reasoning], review.reasoning, `${label}: published unclipped`);
  assert.equal(published.solutionReview.answerSummary, review.answerSummary);

  const oracle = ORACLES[id](question);
  assertNumbersAllowed(review, oracle.allowed, label);
  const reasoning = review.reasoning.join(' ');
  assert.ok(oracle.specific.length && oracle.specific.every((token) => reasoning.includes(token)),
    `${label}: the reasoning names this draw (${oracle.specific.join(', ')})`);
  await oracle.check(await issue(question));
};

const TEMPLATES = loadTemplates();

test('every listed template is covered by an oracle', () => {
  assert.equal(TEMPLATES.length, 18);
  TEMPLATES.forEach(({ id }) => assert.equal(typeof ORACLES[id], 'function', id));
});

for (const { id, pin, template } of TEMPLATES) {
  test(`${id}: everything but the review is the committed content`, () => {
    const digest = createHash('sha256').update(stable(withoutReviewAndDerived(template))).digest('hex');
    assert.equal(digest, pin.sha256, `${id}: prompt, fields, choices, grading, parameters, constraints and metadata are unchanged`);
    // The generator may only GAIN derived values (which never consume the
    // random stream, so every draw keeps its numbers): each committed one is
    // unchanged, and a new one never redefines a drawn parameter.
    const keep = (committed, generator, where) => {
      Object.entries(committed || {}).forEach(([name, expression]) => {
        assert.equal(generator?.derived?.[name], expression, `${id} ${where}: committed derived ${name} is unchanged`);
      });
      Object.keys(generator?.derived || {}).forEach((name) => {
        assert.ok(!Object.hasOwn(generator.parameters || {}, name), `${id} ${where}: derived ${name} does not redefine a parameter`);
      });
    };
    keep(pin.derived.base, template.generator, 'base');
    pin.derived.variants.forEach((committed, index) => keep(committed, template.variants[index].generator, `variant ${index}`));
  });

  for (const { label, template: forced } of variantTemplates(template)) {
    test(`${id} ${label}: ${DRAWS} draws carry a correct worked solution of their own problem`, async () => {
      const seen = new Set();
      for (let draw = 0; draw < DRAWS; draw += 1) {
        const generated = generatePathInstance(forced, `solution-review-${draw}`);
        assert.ok(generated.question, `${id} ${label} draw ${draw} (${generated.reason})`);
        seen.add(JSON.stringify(generated.question.solutionReview));
        // eslint-disable-next-line no-await-in-loop
        await checkInstance(id, generated.question, `${id} ${label} draw ${draw}`);
      }
      assert.ok(seen.size > 1, `${id} ${label}: the review changes with the draw`);
    });
  }

  test(`${id}: the ${PROBES} recap probe draws carry a correct worked solution`, async () => {
    for (let draw = 0; draw < PROBES; draw += 1) {
      const generated = generatePathInstance(template, `recap-probe-${draw}`);
      assert.ok(generated.question, `${id} probe ${draw} (${generated.reason})`);
      // eslint-disable-next-line no-await-in-loop
      await checkInstance(id, generated.question, `${id} recap-probe-${draw}`);
    }
  });
}
