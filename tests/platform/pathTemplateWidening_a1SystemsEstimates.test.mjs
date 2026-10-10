/*
 * WIDENED: five A.3G graphical-system estimate templates (job J, "Content that
 * teaches").
 *
 * These templates drew new numbers every time, but the numbers lived only in
 * the workspace graph: the prompt a student reads was word-for-word the same,
 * so the recap content key saw one or two distinct questions in 30 draws and
 * the recap had to withhold their answers. The prompts now name the two models'
 * own visible numbers (slopes and intercepts, or fees and rates in context),
 * which the workspace legend already shows, so the question a student reads
 * changes with the draw. The answer (the crossing point) is never in the prompt.
 *
 * What this file proves, from the DRAFT source the integrator builds from:
 *   - each template draws >= 12 distinct questions in the 30 recap probe draws;
 *   - for >= 120 draws, an independent mathjs solve of the visible system
 *     equals the generator's point, the server's private key and the point in
 *     the solution review; the server grader accepts it and rejects the
 *     student's misread intercept;
 *   - the point, both intercepts and the answer lie inside the graph window;
 *   - context models stay realistic (positive fees/balances and rates);
 *   - the fields this widening must not touch keep their committed values.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as math from 'mathjs';
import { generatePathInstance } from '../../functions/shared/pathQuestionGeneration.mjs';

const require = createRequire(import.meta.url);
const mathPath = require('../../functions/lib/mathPath.js');

const DRAFT = JSON.parse(readFileSync(new URL('../../drafts/fidelity-v2/algebra1/A.3G.json', import.meta.url), 'utf8'));
const template = (id) => {
  const found = DRAFT.documents.find((entry) => entry.id === id);
  assert.ok(found, `${id} is in the A.3G draft`);
  return found;
};

// The recap's content key (tests/platform/pathRecapWithheld.test.mjs).
const contentKey = (question) => JSON.stringify({
  p: question.prompt,
  s: question.stimulus,
  sc: question.scenario,
  c: (Array.isArray(question.choices) ? question.choices : [])
    .map((choice) => (choice && typeof choice === 'object') ? (choice.text ?? choice.label ?? choice.latex ?? choice.value ?? '') : choice),
  f: (Array.isArray(question.responseFields) ? question.responseFields : [])
    .map((field) => (field && typeof field === 'object') ? (field.label ?? field.prompt ?? '') : field),
});

// Pinned committed values. `context` in the last column: a real-world model
// whose fees/balances and rates must stay positive.
const COMMON = {
  courseId: 'algebra1',
// familyVersion 4: raised with the widening so the recap can tell old draws from new (review of #464, m1).
  familyVersion: 4,
  alignmentKeys: ['texas:A.3G'],
  assessedConstruct: 'A.3G',
  type: 'systemsWorkspace',
  mode: 'linear',
  questionType: 'response',
  activityRole: 'practice',
  calculatorPolicy: 'none',
};
const PINNED = {
  'mm_A_3G_v2_error-read-intersection': {
    familyId: 'mathmaster:A.3G:v2-error-read-intersection', taskType: 'errorAnalysis', representation: 'verbal',
    difficultyBand: 4, dok: 3, numericTolerance: 0.12, variants: null, context: false,
  },
  'mm_A_3G_v2_graph-then-verify': {
    familyId: 'mathmaster:A.3G:v2-graph-then-verify', taskType: 'transfer', representation: 'multipleRepresentation',
    difficultyBand: 4, dok: 3, numericTolerance: 0.15,
    variants: [['core-d3b4', 3, 4], ['adaptive-d3b3-graph-estimate-equation-cross-check', 3, 3]], context: false,
  },
  'mm_A_3G_v2_pricing-estimate': {
    familyId: 'mathmaster:A.3G:v2-pricing-estimate', taskType: 'application', representation: 'context',
    difficultyBand: 2, dok: 2, numericTolerance: 0.12, variants: null, context: true,
  },
  'mm_A_3G_v2_savings-estimate': {
    familyId: 'mathmaster:A.3G:v2-savings-estimate', taskType: 'application', representation: 'context',
    difficultyBand: 3, dok: 2, numericTolerance: 0.12,
    variants: [['core-d2b3', 2, 3], ['adaptive-d2b4-fractional-graphical-intersection', 2, 4]], context: true,
  },
  'mm_A_3G_v2_transport-estimate': {
    familyId: 'mathmaster:A.3G:v2-transport-estimate', taskType: 'application', representation: 'context',
    difficultyBand: 3, dok: 2, numericTolerance: 0.12, variants: null, context: true,
  },
};
const IDS = Object.keys(PINNED);
const MIN_DISTINCT = 12;
const ORACLE_DRAWS = 120;

test('the fields the widening must not change keep their committed values', () => {
  for (const id of IDS) {
    const t = template(id);
    const pin = PINNED[id];
    assert.equal(t.id, id);
    for (const [key, value] of Object.entries({ ...COMMON, ...pin })) {
      if (['variants', 'context'].includes(key)) continue;
      assert.deepEqual(t[key], value, `${id}.${key}`);
    }
    assert.deepEqual(
      (t.variants || null) && t.variants.map((variant) => [variant.coverageKey, variant.dok, variant.difficultyBand]),
      pin.variants,
      `${id} variants`,
    );
    // Same workspace and same answer shape: two lines y = m x + b, answered as
    // a classification plus an (x, y) point.
    assert.deepEqual(t.system, { m1: '{{m1}}', b1: '{{b1}}', m2: '{{m2}}', b2: '{{b2}}' }, `${id}.system`);
  }
});

test('each widened template draws at least 12 distinct questions in the 30 recap probe draws', () => {
  const counts = {};
  for (const id of IDS) {
    const seen = new Set();
    for (let draw = 0; draw < 30; draw += 1) {
      const generated = generatePathInstance(template(id), `recap-probe-${draw}`);
      assert.ok(generated.question, `${id} probe ${draw}: ${generated.reason}`);
      seen.add(contentKey(generated.question));
    }
    counts[id] = seen.size;
  }
  // Actual counts at widening time: 30, 28, 27, 29, 30.
  for (const id of IDS) {
    assert.ok(counts[id] >= MIN_DISTINCT, `${id} drew ${counts[id]} distinct questions in 30 (need >= ${MIN_DISTINCT}; hard floor 8)`);
  }
});

const independentSolve = ({ m1, b1, m2, b2 }) => {
  // -m x + y = b for both lines, solved by mathjs LU, not by the generator's
  // own algebra or the server's solveTwoLines.
  const solution = math.lusolve(
    math.matrix([[-Number(m1), 1], [-Number(m2), 1]]),
    math.matrix([Number(b1), Number(b2)]),
  ).toArray().map((row) => row[0]);
  return { x: solution[0], y: solution[1] };
};

const shownNumber = (value) => String(value);

test('every draw is issuable, its answer is right by an independent solve, and it fits the graph', async () => {
  for (const id of IDS) {
    const pin = PINNED[id];
    for (let draw = 0; draw < ORACLE_DRAWS; draw += 1) {
      const label = `${id} draw ${draw}`;
      const generated = generatePathInstance(template(id), `widening-oracle-${draw}`);
      assert.ok(generated.question, `${label}: ${generated.reason}`);
      const question = generated.question;
      const { system, graph } = question;
      for (const key of ['m1', 'b1', 'm2', 'b2']) assert.equal(typeof system[key], 'number', `${label} ${key}`);
      assert.notEqual(system.m1, system.m2, `${label}: different slopes, exactly one solution`);

      const oracle = independentSolve(system);
      const { xstar, ystar } = generated.parameters;
      assert.ok(Math.abs(oracle.x - xstar) < 1e-9 && Math.abs(oracle.y - ystar) < 1e-9, `${label}: oracle (${oracle.x},${oracle.y}) vs generator (${xstar},${ystar})`);

      // The worked solution names the true point.
      const review = question.solutionReview.reasoning.join(' ');
      assert.ok(review.includes(`(${xstar},${ystar})`), `${label}: review shows the intersection`);
      if (question.solutionReview.answerSummary) {
        assert.ok(question.solutionReview.answerSummary.includes(`(${xstar},${ystar})`), `${label}: answer summary`);
      }

      // The prompt names the visible numbers of THIS draw and never the answer.
      for (const key of ['m1', 'b1', 'm2', 'b2']) {
        assert.ok(question.prompt.includes(shownNumber(system[key])), `${label}: prompt shows ${key}=${system[key]}`);
      }
      assert.ok(!question.prompt.includes(`${xstar},${ystar}`), `${label}: prompt must not reveal the intersection`);
      assert.doesNotMatch(JSON.stringify(question), /\{\{|NaN|undefined|Infinity/, `${label}: fully substituted`);

      // Everything the student reads off the graph is inside the window.
      for (const [px, py, what] of [[oracle.x, oracle.y, 'intersection'], [0, system.b1, 'intercept 1'], [0, system.b2, 'intercept 2']]) {
        assert.ok(px >= graph.xMin && px <= graph.xMax && py >= graph.yMin && py <= graph.yMax, `${label}: ${what} (${px},${py}) outside window`);
      }
      // The answer stays as clean as the original: halves (core) or quarters.
      assert.equal(Number.isInteger(xstar * 4), true, `${label}: x on a quarter grid`);

      if (pin.context) {
        assert.ok(system.b1 >= 1 && system.b2 >= 1, `${label}: fees/balances positive`);
        assert.ok(system.m1 > 0 && system.m2 > 0 && oracle.y > 0 && oracle.x > 0, `${label}: rates and break-even positive`);
        assert.ok(Number.isInteger(system.b2 * 100), `${label}: whole cents`);
        // No article sits right before a varying amount: "a 11-dollar" / "a 8.5-dollar"
        // read wrong, and "1 dollars" would too, so amounts follow "of" with the unit stated once.
        assert.doesNotMatch(question.prompt, /\b(a|an) -?\d/i, `${label}: no article before an amount`);
        assert.doesNotMatch(question.prompt, /\d-dollar|\d dollars?\b/, `${label}: unit not glued to a varying amount`);
        assert.match(question.prompt, /\(all amounts in dollars\)/, `${label}: unit stated once`);
      }

      // The production issuer and grader.
      // eslint-disable-next-line no-await-in-loop
      const plan = await mathPath.buildIssuePlan(question);
      assert.equal(plan.issuable, true, `${label}: ${plan.reason}`);
      const key = plan.privateGrading.definition.solution;
      assert.equal(key.type, 'one', label);
      assert.ok(Math.abs(key.x - oracle.x) < 1e-9 && Math.abs(key.y - oracle.y) < 1e-9, `${label}: server key matches the oracle`);
      const grade = (raw) => mathPath.gradePathToolResponse(plan.privateGrading, { raw });
      // eslint-disable-next-line no-await-in-loop
      const exact = await grade({ classification: 'one', x: String(oracle.x), y: String(oracle.y) });
      // eslint-disable-next-line no-await-in-loop
      const tenth = await grade({ classification: 'one', x: String(Math.round(oracle.x * 10) / 10), y: String(Math.round(oracle.y * 10) / 10) });
      // eslint-disable-next-line no-await-in-loop
      const misread = await grade({ classification: 'one', x: '0', y: String(system.b1) });
      assert.equal(exact.isCorrect, true, `${label}: exact answer graded correct`);
      assert.equal(tenth.isCorrect, true, `${label}: nearest-tenth estimate graded correct`);
      assert.equal(misread.isCorrect, false, `${label}: the y-intercept misread is graded wrong`);
    }
  }
});

test('the production certification passes on every edited template', async () => {
  for (const id of IDS) {
    // eslint-disable-next-line no-await-in-loop
    const plan = await mathPath.buildTemplateIssuePlan(template(id), { samples: 24 });
    assert.deepEqual(plan, { issuable: true, reason: null, samples: 24 }, id);
  }
});
