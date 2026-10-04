/*
 * 30-SEAT CERTIFICATION — EVERY NEW SOLUTION CASE AND MODE, A FULL CLASS.
 *
 * For each slot setting the special-case work adds (linear.multiStepEquation
 * v2, linear.twoStepEquation v2, systems.algebraic2x2 v1), thirty students are
 * seated by the real allocator (planSeatAdditions) and each is given their
 * version through the real allocation and resolution. For every slot:
 *
 *   valid generated count   30 of 30
 *   unique fingerprints     30
 *   unique equations        30 (what each student is shown differs)
 *   capacity                the family can give at least the class
 *   deterministic replay    the same seat resolves to the same question, and
 *                           the delivery pin reproduces it exactly
 *   valid answer keys       the independent oracle's reading of the shown
 *                           equation or system is the key
 *   browser/server parity   correct work is credited and wrong work refused,
 *                           identically, by the workspace's own grader on the
 *                           delivered question and by the server on the
 *                           question IT rebuilds from the pin (seat-verified)
 *
 * A mixed slot must give the class every case it mixes, in exactly the shares
 * the stratified sequence promises; the distributions are asserted and
 * reported (t.diagnostic).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import { measureFamilyCapacity } from '../../functions/shared/questionFamilyEngine.mjs';
import { reproduceFamilyQuestionFromPin } from '../../functions/shared/questionFamilyInstance.mjs';
import { getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { gradeServerResponse } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import {
  KEY_CASE,
  STUDENTS,
  correctWork,
  deliverTo,
  equationOracle,
  gradeBothWays,
  seatedAssignment,
  serverQuestionFor,
  systemOracle,
  wrongWork,
} from './helpers/questionFamilyCases.mjs';

const multi = (questionId, constraints) => ({ questionId, type: 'stepAlgebra', questionFamily: { id: 'linear.multiStepEquation', version: 2, constraints } });
const two = (questionId, constraints) => ({ questionId, type: 'stepAlgebra', questionFamily: { id: 'linear.twoStepEquation', version: 2, constraints } });
const system = (questionId, constraints, extra = {}) => ({ questionId, type: 'systemsWorkspace', questionFamily: { id: 'systems.algebraic2x2', version: 1, constraints }, ...extra });

const SLOTS = Object.freeze([
  multi('eq-one', { solutionCase: 'one' }),
  multi('eq-none', { solutionCase: 'none' }),
  multi('eq-infinite', { solutionCase: 'infinite' }),
  multi('eq-mixed', { solutionCase: 'mixed' }),
  multi('eq-one-distribute', { solutionCase: 'one', distribute: true }),
  multi('eq-none-distribute', { solutionCase: 'none', distribute: true }),
  multi('eq-infinite-distribute', { solutionCase: 'infinite', distribute: true }),
  multi('eq-mixed-distribute-mixed', { solutionCase: 'mixed', distribute: 'mixed' }),
  multi('eq-fraction-solution', { solutionForm: 'fraction' }),
  multi('eq-fraction-coefficient', { coefficientForm: 'fraction' }),
  multi('eq-mixed-fraction-coefficient', { solutionCase: 'mixed', coefficientForm: 'fraction' }),
  two('two-step', {}),
  two('two-step-distribute', { distribute: true }),
  two('two-step-fraction-coefficient', { coefficientForm: 'fraction' }),
  two('two-step-fraction-solution', { solutionForm: 'fraction' }),
  system('sys-one', { solutionCase: 'one' }),
  system('sys-none', { solutionCase: 'none' }),
  system('sys-infinite', { solutionCase: 'infinite' }),
  system('sys-mixed', { solutionCase: 'mixed' }),
  system('sys-fraction', { solutionCase: 'one', solutionForm: 'fraction' }),
  system('sys-one-substitution', { solutionCase: 'one' }, { method: 'substitution' }),
  system('sys-mixed-elimination', { solutionCase: 'mixed' }, { method: 'elimination' }),
]);

const assignment = seatedAssignment('qf-case-certification', SLOTS);
const shownText = (question) => (question.type === 'systemsWorkspace' ? question.equations.join(' ; ') : question.equation);
const oracleFor = (question) => (question.type === 'systemsWorkspace' ? systemOracle(question) : equationOracle(question));
const keyMatches = (question, oracle) => {
  const key = question.solutionKey;
  if (KEY_CASE[key.outcome] !== oracle.case) return false;
  if (key.outcome === 'value') return oracle.value === key.value;
  if (key.outcome === 'point') return oracle.x === key.x && oracle.y === key.y;
  return true;
};

const certify = (storageIndex) => {
  const slot = SLOTS[storageIndex];
  const family = getPlatformQuestionFamily(slot.questionFamily.id, slot.questionFamily.version);
  const deliveries = STUDENTS.map((studentId) => ({ studentId, result: deliverTo(assignment, storageIndex, studentId) }));
  return { slot, family, deliveries };
};

const distribution = (deliveries, key) => deliveries.reduce((counts, { result }) => {
  const value = key(result);
  counts[value] = (counts[value] || 0) + 1;
  return counts;
}, {});

SLOTS.forEach((slot, storageIndex) => {
  test(`30 seats: ${slot.questionId} (${slot.questionFamily.id} v${slot.questionFamily.version} ${JSON.stringify(slot.questionFamily.constraints)}${slot.method ? `, method ${slot.method}` : ''})`, (t) => {
    const { family, deliveries } = certify(storageIndex);

    // Valid generated count.
    deliveries.forEach(({ studentId, result }) => assert.equal(result.error, null, `${studentId}: ${result.error}`));
    assert.equal(deliveries.length, 30);

    // Unique fingerprints and unique equations.
    assert.equal(new Set(deliveries.map(({ result }) => result.instance.fingerprint)).size, 30, 'unique fingerprints');
    assert.equal(new Set(deliveries.map(({ result }) => shownText(result.question))).size, 30, 'unique equations shown');
    deliveries.forEach(({ result }) => assert.equal(result.delivery.wrapped, false, 'no student is handed a repeat'));

    // Capacity.
    const { values } = resolveFamilyConstraints(family, slot.questionFamily.constraints);
    const capacity = measureFamilyCapacity(family, values, { budget: 2048 });
    assert.ok(capacity.capacity >= 30, `capacity ${capacity.capacity}`);

    deliveries.forEach(({ studentId, result }) => {
      // Deterministic replay: the seat again, and the pin.
      const again = deliverTo(assignment, storageIndex, studentId);
      assert.equal(again.instance.fingerprint, result.instance.fingerprint, `${studentId}: the same seat, the same question`);
      assert.deepEqual(again.question, result.question);
      const stored = assignment.sections[0].questions[storageIndex];
      const replayed = reproduceFamilyQuestionFromPin({ question: stored, assignmentId: assignment.id, storageIndex, pin: result.delivery });
      assert.equal(replayed.error, null, `${studentId}: the pin replays (${replayed.error})`);
      assert.deepEqual(replayed.question, result.question, `${studentId}: the pin reproduces exactly what was shown`);

      // A valid answer key, read independently from what the student is shown.
      const oracle = oracleFor(result.question);
      assert.ok(keyMatches(result.question, oracle), `${studentId}: ${shownText(result.question)} — key ${JSON.stringify(result.question.solutionKey)}, oracle ${JSON.stringify(oracle)}`);

      // Browser/server parity, on the question the SERVER rebuilds from the pin.
      const server = serverQuestionFor(assignment, storageIndex, studentId, result.delivery);
      assert.ok(server.question, `${studentId}: the server rebuilds the instance (${server.reason})`);
      for (const [label, work, expected] of [['correct', correctWork(result.question), true], ['wrong', wrongWork(result.question), false]]) {
        const { browser } = gradeBothWays(result.question, work);
        const onServer = gradeServerResponse({ question: server.question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
        assert.equal(browser.isCorrect, expected, `${studentId} ${label}: the workspace's own verdict`);
        assert.equal(onServer.graded, true, `${studentId} ${label}: ${onServer.reason}`);
        assert.equal(onServer.isCorrect, browser.isCorrect, `${studentId} ${label}: the server agrees`);
      }
    });

    // The distribution of cases (and, for the equations, shapes) in this class.
    const cases = distribution(deliveries, ({ instance }) => instance.params.case);
    const shapes = distribution(deliveries, ({ instance }) => (instance.params.shape ? `${instance.params.case}·${instance.params.shape}` : instance.params.case));
    t.diagnostic(`${slot.questionId}: capacity ${capacity.exact ? '' : '~'}${capacity.capacity}; cases ${JSON.stringify(cases)}; strata ${JSON.stringify(shapes)}`);
    const requested = slot.questionFamily.constraints.solutionCase;
    if (requested && requested !== 'mixed') assert.deepEqual(cases, { [requested]: 30 }, 'every student gets the requested case');
  });
});

test('mixed slots give a class every case, in exactly the promised shares', () => {
  const expectations = {
    'eq-mixed': { cases: { one: 10, none: 10, infinite: 10 }, strata: 6 },
    'eq-mixed-distribute-mixed': { cases: { one: 10, none: 10, infinite: 10 }, strata: 12 },
    'eq-mixed-fraction-coefficient': { cases: { one: 10, none: 10, infinite: 10 }, strata: 6 },
    'sys-mixed': { cases: { one: 10, none: 10, infinite: 10 }, strata: 3 },
    'sys-mixed-elimination': { cases: { one: 10, none: 10, infinite: 10 }, strata: 3 },
  };
  for (const [questionId, expected] of Object.entries(expectations)) {
    const storageIndex = SLOTS.findIndex((slot) => slot.questionId === questionId);
    const { deliveries } = certify(storageIndex);
    assert.deepEqual(distribution(deliveries, ({ instance }) => instance.params.case), expected.cases, questionId);
    // Counting from the first seat, every block of m seats (m = number of strata) covers each stratum once.
    const bySeat = deliveries
      .map(({ result }) => ({ seat: result.delivery.seat, stratum: `${result.instance.params.case}·${result.instance.params.shape || ''}` }))
      .sort((left, right) => left.seat - right.seat);
    const m = expected.strata;
    for (let block = 0; block + m <= bySeat.length; block += m) {
      const strata = new Set(bySeat.slice(block, block + m).map((entry) => entry.stratum));
      assert.equal(strata.size, m, `${questionId}: seats ${block}–${block + m - 1} cover every stratum`);
    }
    // Balanced on the case first: seats 1–3, 4–6, … (from the first seat) are one of each case.
    for (let run = 0; run + 3 <= bySeat.length; run += 3) {
      const cases = new Set(bySeat.slice(run, run + 3).map((entry) => entry.stratum.split('·')[0]));
      assert.equal(cases.size, 3, `${questionId}: seats ${run}–${run + 2} are one of each case`);
    }
    // The workspace never reveals the case: every equation of a mixed slot opens the relation workspace.
    deliveries.forEach(({ result }) => {
      if (result.question.type === 'stepAlgebra') assert.equal(result.question.relationWorkspace, true);
      else assert.equal(result.question.prompt, 'Solve the system. Decide whether it has one solution, no solution, or infinitely many solutions.');
    });
  }
});
