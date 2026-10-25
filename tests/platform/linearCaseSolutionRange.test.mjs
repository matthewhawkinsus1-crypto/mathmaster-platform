/*
 * A FRACTIONAL ANSWER STAYS INSIDE BOTH ENDS OF `solutionRange` (CT15 / A2-98).
 *
 * linear.multiStepEquation v2 and linear.twoStepEquation v2 checked a fractional
 * answer against the larger of the two endpoints' absolute values only. For a
 * range that is symmetric about 0 (the default [-10, 10], and every range a
 * lesson or a support sets) that is the same thing; for any other range it is
 * not: with [2, 6] a student could be dealt x = 1/8, and with [-3, 8] x = -7.
 *
 * A family version is frozen the day it ships (a delivery pin and a graded
 * attempt name an instance by it), so the correction is version 3 of both
 * families and version 2 keeps its rule. What this holds:
 *
 *   - v2 still deals answers outside the range (so it was not "fixed in place"),
 *     and the counts of what v2 and v3 deal are pinned for the two-step family;
 *   - v3 is v2 with exactly the out-of-range answers removed: tuple by tuple,
 *     v3 accepts a tuple if and only if v2 accepts it and the answer the
 *     DISPLAYED equation has lies between both endpoints;
 *   - nothing moves for a range symmetric about 0, for an integer answer, or for
 *     the cases that have no answer (no solution, every real number);
 *   - the endpoints themselves are still allowed;
 *   - a slot that says `"version": 3` is dealt in-range answers end to end, and
 *     an unpinned reference still means version 1.
 *
 * The answer is read from the equation the student sees, by an oracle that
 * shares no code with the families (helpers/questionFamilyCases.mjs), never from
 * the family's own key or from the rule being tested.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveFamilyConstraints } from '../../functions/shared/questionFamilyContract.mjs';
import {
  buildFamilyQuestion,
  buildParameterSpace,
  decodeParameterIndex,
  evaluateFamilyCandidate,
  familyStrata,
} from '../../functions/shared/questionFamilyEngine.mjs';
import { resolveFamilyPreviewInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { defaultFamilyVersion, getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { equationOracle } from './helpers/questionFamilyCases.mjs';

const FAMILY_IDS = ['linear.multiStepEquation', 'linear.twoStepEquation'];
const family = (id, version) => {
  const found = getPlatformQuestionFamily(id, version);
  assert.ok(found, `${id} v${version} is registered`);
  return found;
};

const slot = (familyDefinition, constraints) => ({
  questionId: `q-${familyDefinition.id}-v${familyDefinition.version}`,
  type: 'stepAlgebra',
  prompt: 'Solve {{equation}}.',
  questionFamily: { id: familyDefinition.id, version: familyDefinition.version, constraints },
});

/** "7/3", "-4" or "1/8" as a number. */
const numberOf = (text) => {
  const [numerator, denominator = '1'] = String(text).split('/');
  return Number(numerator) / Number(denominator);
};

/** The answer the DISPLAYED equation has, or null when it has none (or reads wrongly). */
const displayedAnswer = (familyDefinition, values, constraints, instance) => {
  const question = buildFamilyQuestion({
    family: familyDefinition,
    instance,
    constraintValues: values,
    authored: slot(familyDefinition, constraints),
    tool: 'stepAlgebra',
  });
  const read = equationOracle(question);
  assert.notEqual(read.case, 'unreadable', `${familyDefinition.id}: ${question.equation}`);
  assert.notEqual(read.case, 'display-mismatch', `${familyDefinition.id}: ${question.equation}`);
  return read.case === 'one' ? numberOf(read.value) : null;
};

/**
 * Every tuple of the family's parameter space (every `stride`th one when the space
 * is too large to walk), judged by both versions: { tuples, accepted2, accepted3, outside }.
 * `outside` counts the tuples version 2 accepts whose displayed answer is outside [low, high].
 */
const compareVersions = (id, constraints, { stride = 1 } = {}) => {
  const [v2, v3] = [family(id, 2), family(id, 3)];
  const resolved = resolveFamilyConstraints(v2, constraints);
  assert.equal(resolved.fatal, false, JSON.stringify(resolved.issues));
  const values = resolved.values;
  assert.deepEqual(resolveFamilyConstraints(v3, constraints).values, values, 'both versions read the constraints the same way');
  const [low, high] = values.solutionRange;
  const result = { tuples: 0, accepted2: 0, accepted3: 0, outside: 0, answers3: new Set(), problems: [] };
  for (const stratum of familyStrata(v2, values) || [undefined]) {
    const space2 = buildParameterSpace(v2, values, stratum);
    const space3 = buildParameterSpace(v3, values, stratum);
    assert.deepEqual([space3.names, space3.size], [space2.names, space2.size], 'the same parameter space');
    for (let index = 0; index < space2.size; index += stride) {
      result.tuples += 1;
      const params = decodeParameterIndex(space2, index);
      const one = evaluateFamilyCandidate(v2, values, params);
      const three = evaluateFamilyCandidate(v3, values, params);
      if (one.valid) result.accepted2 += 1;
      if (three.valid) result.accepted3 += 1;
      if (three.valid && !one.valid) result.problems.push(`version 3 accepts a tuple version 2 refused: ${JSON.stringify(params)}`);
      if (!one.valid) continue;
      const answer = displayedAnswer(v2, values, constraints, one.instance);
      const within = answer === null || (answer >= low && answer <= high);
      if (!within) result.outside += 1;
      // THE RULE: version 3 keeps the tuple exactly when version 2 does and the answer is between both ends.
      if (three.valid !== within) result.problems.push(`${JSON.stringify(params)}: answer ${answer} in [${low}, ${high}] but version 3 ${three.valid ? 'accepts' : 'refuses'} it`);
      if (three.valid && answer !== null) result.answers3.add(answer);
    }
  }
  return result;
};

// The comparisons are the slow part, and two tests read the same one.
const compared = new Map();
const compareOnce = (id, constraints, options = {}) => {
  const key = JSON.stringify([id, constraints, options]);
  if (!compared.has(key)) compared.set(key, compareVersions(id, constraints, options));
  return compared.get(key);
};

const TWO_STEP_FRACTION = { solutionForm: 'fraction' };

test('version 3 is registered beside version 2, and an unpinned reference still means version 1', () => {
  for (const id of FAMILY_IDS) {
    assert.equal(defaultFamilyVersion(id), 1, `${id}: unpinned still means version 1`);
    const [v2, v3] = [family(id, 2), family(id, 3)];
    assert.deepEqual(Object.keys(v3.constraints), Object.keys(v2.constraints), `${id}: the same settings`);
    Object.entries(v2.constraints).forEach(([name, knob]) => assert.deepEqual(v3.constraints[name], knob, `${id} ${name}: the same allowance and default`));
    assert.deepEqual(v3.conceptConstraints, v2.conceptConstraints);
  }
});

test('version 2 keeps its rule: with [2, 6] and fractional answers it still deals answers outside the range', () => {
  const result = compareOnce('linear.twoStepEquation', { ...TWO_STEP_FRACTION, solutionRange: [2, 6] });
  assert.equal(result.accepted2, 10436, 'version 2 deals 10,436 questions');
  assert.equal(result.outside, 8442, 'and 8,442 of them (81%) have an answer outside [2, 6]');
  assert.deepEqual(result.problems, []);
});

test('version 3 deals only the 1,994 of them whose answer is inside [2, 6]', () => {
  const result = compareOnce('linear.twoStepEquation', { ...TWO_STEP_FRACTION, solutionRange: [2, 6] });
  assert.equal(result.accepted3, 1994);
  assert.equal(result.accepted2 - result.outside, result.accepted3, 'exactly the in-range ones');
  assert.ok([...result.answers3].every((answer) => answer > 2 && answer < 6), 'a fractional answer, so strictly between the ends');
  assert.ok(result.answers3.size > 10, `${result.answers3.size} different answers are still dealt`);
});

test('two-step: for every range, version 3 is version 2 with exactly the out-of-range answers removed', () => {
  const ranges = [[-10, 10], [-6, 6], [-30, 30], [2, 6], [0, 10], [-3, 8], [-8, 3], [5, 15]];
  for (const distribute of [false, true]) {
    for (const solutionRange of ranges) {
      const constraints = { ...TWO_STEP_FRACTION, distribute, solutionRange };
      // Every third tuple of 14,400 (the exact counts for [2, 6] are pinned above, over all of them).
      const result = compareOnce('linear.twoStepEquation', constraints, { stride: 3 });
      assert.deepEqual(result.problems.slice(0, 3), [], JSON.stringify(constraints));
      assert.equal(result.accepted3, result.accepted2 - result.outside, JSON.stringify(constraints));
      // Nothing moves for a range symmetric about 0 (the default [-10, 10] among them).
      if (solutionRange[0] === -solutionRange[1]) assert.equal(result.outside, 0, `${JSON.stringify(constraints)}: a symmetric range moves nothing`);
      else assert.ok(result.outside > 0, `${JSON.stringify(constraints)}: version 2 let answers outside the range through`);
    }
  }
});

test('multi-step: the same rule over a stride of its 10.6 million fractional-answer tuples', () => {
  for (const solutionRange of [[-10, 10], [2, 6], [0, 10], [-3, 8], [5, 15]]) {
    const constraints = { solutionCase: 'one', solutionForm: 'fraction', solutionRange };
    const result = compareOnce('linear.multiStepEquation', constraints, { stride: 2999 });
    assert.ok(result.accepted2 > 800, `${JSON.stringify(constraints)}: ${result.accepted2} tuples sampled`);
    assert.deepEqual(result.problems.slice(0, 3), [], JSON.stringify(constraints));
    assert.equal(result.accepted3, result.accepted2 - result.outside, JSON.stringify(constraints));
    if (solutionRange[0] === -solutionRange[1]) assert.equal(result.outside, 0, `${JSON.stringify(constraints)}: symmetric, nothing moves`);
    else assert.ok(result.outside > 0, `${JSON.stringify(constraints)}: version 2 let answers outside the range through`);
  }
});

test('an integer answer is drawn from the range, so nothing moves, and both endpoints are still dealt', () => {
  for (const [id, base] of [['linear.twoStepEquation', {}], ['linear.multiStepEquation', { solutionCase: 'one' }]]) {
    for (const solutionRange of [[2, 6], [-3, 8], [0, 5]]) {
      const constraints = { ...base, solutionForm: 'integer', solutionRange };
      const result = compareOnce(id, constraints, { stride: id === 'linear.twoStepEquation' ? 23 : 797 });
      assert.deepEqual(result.problems.slice(0, 3), [], JSON.stringify(constraints));
      assert.equal(result.outside, 0, `${id} ${JSON.stringify(solutionRange)}: integer answers are never outside`);
      assert.equal(result.accepted3, result.accepted2, `${id} ${JSON.stringify(solutionRange)}: version 3 deals what version 2 did`);
      assert.ok(result.answers3.has(solutionRange[0]) && result.answers3.has(solutionRange[1]), `${id} ${JSON.stringify(solutionRange)}: both ends of the range are still dealt`);
    }
  }
});

test('the cases with no answer to bound (no solution, every real number) are the same in both versions', () => {
  for (const solutionCase of ['none', 'infinite']) {
    const constraints = { solutionCase, solutionRange: [2, 6] };
    const result = compareOnce('linear.multiStepEquation', constraints, { stride: 211 });
    assert.ok(result.accepted2 > 100, `${solutionCase}: ${result.accepted2} tuples sampled`);
    assert.equal(result.accepted3, result.accepted2, `${solutionCase}: nothing moves`);
    assert.deepEqual(result.problems, []);
  }
});

test('end to end: a slot that pins version 3 is dealt in-range fractional answers at every allocation index, the same slot at version 2 is not', () => {
  for (const [id, base] of [['linear.twoStepEquation', {}], ['linear.multiStepEquation', { solutionCase: 'one' }]]) {
    const dealt = (version) => Array.from({ length: 80 }, (unused, index) => {
      const { question, error } = resolveFamilyPreviewInstance({
        questionId: `qf-ct15-${id}-${version}`,
        type: 'stepAlgebra',
        prompt: 'Solve {{equation}}.',
        questionFamily: { id, version, constraints: { ...base, solutionForm: 'fraction', solutionRange: [2, 6] } },
      }, { index });
      assert.ok(question, `${id} v${version} index ${index}: ${JSON.stringify(error)}`);
      const read = equationOracle(question);
      assert.equal(read.case, 'one');
      return numberOf(read.value);
    });
    const withVersion3 = dealt(3);
    assert.ok(withVersion3.every((answer) => answer > 2 && answer < 6), `${id} v3 deals ${withVersion3.filter((answer) => !(answer > 2 && answer < 6)).slice(0, 3)} outside [2, 6]`);
    assert.ok(new Set(withVersion3).size > 15, `${id} v3: ${new Set(withVersion3).size} different answers in 80 deals`);
    const withVersion2 = dealt(2);
    assert.ok(withVersion2.filter((answer) => !(answer >= 2 && answer <= 6)).length > 40, `${id} v2 still deals most answers outside [2, 6]`);
  }
});
