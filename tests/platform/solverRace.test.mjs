import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOLVER_RACE_CATALOG, planSolverRace, solverRaceCatalogCounts, solverRaceFamilyPlan,
} from '../../functions/shared/solverRace.mjs';
import { buildPrivateToolGrading, buildPublicToolPayload, gradePathResponse } from '../../functions/shared/pathToolContracts.mjs';
import { buildRawPathResponse } from '../../src/platform/path/pathToolResponses.js';

test('catalog provides at least eight explicit structural families per solver family', () => {
  assert.deepEqual(solverRaceCatalogCounts(), {
    literalEquation: 10,
    linearInequality: 8,
    absoluteValueEquation: 8,
    absoluteValueInequality: 8,
  });
  for (const question of SOLVER_RACE_CATALOG) {
    assert.ok(question.difficultyBand);
    assert.ok(question.solutionDepth > 0);
    assert.ok(question.operationTags.length);
    assert.ok(Array.isArray(question.complexityTags));
  }
});

test('mixed ten-round race preserves the intended family progression', () => {
  assert.deepEqual(solverRaceFamilyPlan(10, 'mixed'), [
    'literalEquation', 'literalEquation', 'literalEquation',
    'linearInequality', 'linearInequality', 'linearInequality',
    'absoluteValueEquation', 'absoluteValueEquation',
    'absoluteValueInequality', 'absoluteValueInequality',
  ]);
  for (const count of [3, 5, 10, 15, 20]) assert.equal(solverRaceFamilyPlan(count).length, count);
});

test('focused progression stays in family, rises, varies, and schedules invisible -1 late', () => {
  const race = planSolverRace({ roundCount: 10, focus: 'literalEquation', seed: 'class-a' });
  assert.ok(race.every((question) => question.challengeFamily === 'literalEquation'));
  assert.deepEqual(race.map((question) => question.solverRaceStage), [
    'foundation', 'foundation', 'foundation', 'foundation',
    'developing', 'developing', 'developing', 'advanced', 'advanced', 'challenge',
  ]);
  assert.ok(race.slice(0, 4).every((question) => !question.complexityTags.includes('negativeUnitCoefficient')));
  assert.ok(race.slice(7).some((question) => question.complexityTags.length > 0));
  assert.notDeepEqual(
    planSolverRace({ roundCount: 10, focus: 'literalEquation', seed: 'class-a' }).map((q) => q.id),
    planSolverRace({ roundCount: 10, focus: 'literalEquation', seed: 'class-b' }).map((q) => q.id),
  );
});

const grade = (question, actual, clientClaims = {}) => gradePathResponse({
  privateGrading: buildPrivateToolGrading(question),
  raw: { finalRelation: actual, ...clientClaims },
});

test('literal isolation is bounded symbolic grading, not exact authored steps or strings', () => {
  const perimeter = SOLVER_RACE_CATALOG.find((q) => q.id.endsWith('_perimeter'));
  assert.equal(grade(perimeter, 'W=(P-2L)/2').isCorrect, true);
  assert.equal(grade(perimeter, 'W=P/2-L').isCorrect, true);
  assert.equal(grade(perimeter, 'P=2L+2W').isCorrect, false, 'unfinished original relation is not isolation');
  assert.equal(grade(perimeter, 'W=P/2+L', { isCorrect: true }).isCorrect, false, 'client correctness is ignored');
});

test('inequality grading accepts orientation and rejects a missed negative flip', () => {
  const negative = SOLVER_RACE_CATALOG.find((q) => q.id.endsWith('linearInequality_negative_flip'));
  assert.equal(grade(negative, '-4 <= x').isCorrect, true);
  assert.equal(grade(negative, 'x <= -4', { representationCorrect: true }).isCorrect, false);
});

test('absolute equation sets are order-independent and reject an extraneous candidate', () => {
  const basic = SOLVER_RACE_CATALOG.find((q) => q.id.endsWith('absoluteValueEquation_basic'));
  assert.equal(grade(basic, 'x=6 OR x=-6').isCorrect, true);
  assert.equal(grade(basic, 'x=-6 OR x=6 OR x=0').isCorrect, false);
  const none = SOLVER_RACE_CATALOG.find((q) => q.id.endsWith('absoluteValueEquation_no_solution'));
  assert.equal(grade(none, 'no solution').isCorrect, true);
});

test('absolute inequality grading supports AND, OR, unbounded, all-real, and no-solution sets', () => {
  for (const suffix of ['and_open', 'and_closed', 'or_open', 'or_closed', 'all_real', 'none']) {
    const question = SOLVER_RACE_CATALOG.find((q) => q.id.endsWith(`absoluteValueInequality_${suffix}`));
    assert.equal(grade(question, question.expectedFinalRelation).isCorrect, true, suffix);
  }
});

test('public payload omits private grading while relation-work sends raw mathematics', () => {
  const question = SOLVER_RACE_CATALOG[0];
  const payload = buildPublicToolPayload(question);
  assert.ok(payload);
  assert.doesNotMatch(JSON.stringify(payload), /expectedFinalRelation|solverGrader|y - a/);
  assert.deepEqual(buildRawPathResponse({
    pathToolId: 'stepAlgebra',
    answerState: { parts: [
      { id: 'relation-work', response: 'x = y-a', isCorrect: true },
      { id: 'candidate-verification', response: '4:valid', isCorrect: true },
    ] },
  }), { finalRelation: 'x = y-a', candidateVerification: '4:valid' });
});
