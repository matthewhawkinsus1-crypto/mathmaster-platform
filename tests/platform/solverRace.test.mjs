import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SOLVER_RACE_CATALOG, planSolverRace, solverRaceCatalogCounts, solverRaceFamilyPlan,
} from '../../functions/shared/solverRace.mjs';
import { buildPrivateToolGrading, buildPublicToolPayload, gradePathResponse } from '../../functions/shared/pathToolContracts.mjs';
import { buildRawPathResponse } from '../../src/platform/path/pathToolResponses.js';
import { questionFromToolPayload } from '../../src/platform/path/pathToolResponses.js';
import { needsMultiRelationWorkspace } from '../../src/algebraRelationFoundation.js';
import mathPath from '../../functions/lib/mathPath.js';

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
  assert.deepEqual(race.map((question) => question.operationTags), [
    ['subtract'], ['add'], ['divide'], ['multiply'], ['subtract', 'divide'],
    ['divide', 'subtract'], ['subtract', 'divide'], ['subtract', 'divide'],
    ['subtract', 'divide'], ['multiply', 'add', 'divide'],
  ]);
  assert.ok(race.slice(0, 4).every((question) => !question.complexityTags.includes('negativeUnitCoefficient')));
  assert.ok(race.slice(7).some((question) => question.complexityTags.length > 0));
  assert.notDeepEqual(
    planSolverRace({ roundCount: 10, focus: 'literalEquation', seed: 'class-a' }).map((q) => q.equation),
    planSolverRace({ roundCount: 10, focus: 'literalEquation', seed: 'class-b' }).map((q) => q.equation),
  );
});

test('every catalog question passes the real secure Path issue plan', async () => {
  for (const question of SOLVER_RACE_CATALOG) {
    const plan = await mathPath.buildIssuePlan(question);
    assert.equal(plan.issuable, true, `${question.id}: ${plan.reason}`);
    assert.ok(plan.toolPayload, question.id);
    assert.doesNotMatch(JSON.stringify(plan.toolPayload), /expectedFinalRelation|solverGrader/);
  }
});

test('room and dry-run planning cannot bypass real secure issuance', () => {
  const server = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const helperStart = server.indexOf('async function securelyPlanSolverRace(');
  const helperEnd = server.indexOf('\nfunction selectChallengeQuestions', helperStart);
  const helper = server.slice(helperStart, helperEnd);
  assert.match(helper, /mathPath\.buildIssuePlan\(question\)/);
  assert.match(helper, /challengeFamily[\s\S]*difficultyBand/);
  assert.doesNotMatch(server, /plan:\s*\{\s*issuable:\s*true\s*\}/);
});

test('mixed and all focused dry-run plans securely build every round', async () => {
  for (const [focus, count] of [['mixed', 10], ['literalEquation', 3], ['linearInequality', 3], ['absoluteValueEquation', 3], ['absoluteValueInequality', 3]]) {
    const race = planSolverRace({ roundCount: count, focus, seed: `dry-${focus}` });
    assert.equal(race.length, count);
    for (const question of race) assert.equal((await mathPath.buildIssuePlan(question)).issuable, true, `${focus}: ${question.id}`);
  }
});

test('all four families survive issue, sanitization, reconstruction, and workspace routing', async () => {
  for (const family of ['literalEquation', 'linearInequality', 'absoluteValueEquation', 'absoluteValueInequality']) {
    const question = SOLVER_RACE_CATALOG.find((entry) => entry.challengeFamily === family);
    const plan = await mathPath.buildIssuePlan(question);
    const publicQuestion = mathPath.buildSanitizedQuestion(question, {
      questionInstanceId: `solver-${family}`, attemptsAllowed: 1, attemptsUsed: 0, toolPayload: plan.toolPayload,
    });
    const renderable = questionFromToolPayload(publicQuestion);
    assert.equal(renderable.type, 'stepAlgebra');
    assert.equal(needsMultiRelationWorkspace(renderable), family !== 'literalEquation');
    assert.equal(renderable.responseFields, undefined, 'no typed-answer fallback');
    assert.equal(renderable.choices, undefined, 'no multiple-choice fallback');
    assert.doesNotMatch(JSON.stringify(publicQuestion), /expectedFinalRelation|solverGrader/);
  }
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

test('every literal structure accepts its expected isolation and rejects a nearby wrong one', () => {
  const equivalents = {
    subtract_a: 'x=-a+y', add_a: 'x=a+y', divide_a: 'x=(1/a)*y', multiply_a: 'x=y*a',
    two_step: 'x=y/a-b/a', grouped: 'x=(y-a*b)/a', invisible_negative: 'x=-y+b',
    negative_multi: 'x=b/a-y/a', perimeter: 'W=P/2-L', fraction_group: 'x=c*y/a+b/a',
  };
  for (const question of SOLVER_RACE_CATALOG.filter((entry) => entry.challengeFamily === 'literalEquation')) {
    const key = question.id.split('literalEquation_')[1];
    assert.equal(grade(question, question.expectedFinalRelation).isCorrect, true, `${key} exact`);
    assert.equal(grade(question, equivalents[key]).isCorrect, true, `${key} equivalent`);
    const [head, tail] = question.expectedFinalRelation.split('=');
    assert.equal(grade(question, `${head}=(${tail})+1`).isCorrect, false, `${key} incorrect`);
  }
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

test('absolute inequality unions use one-to-one branch matching', () => {
  const question = SOLVER_RACE_CATALOG.find((q) => q.id.endsWith('absoluteValueInequality_or_open'));
  assert.equal(grade(question, 'x > 2 OR x < -4').isCorrect, true, 'reversed order');
  assert.equal(grade(question, '2 < x OR -4 > x').isCorrect, true, 'equivalent orientation');
  assert.equal(grade(question, 'x < -4 OR x < -4').isCorrect, false, 'duplicate branch');
  assert.equal(grade(question, 'x < -4').isCorrect, false, 'missing branch');
  assert.equal(grade(question, 'x < -5 OR x > 2').isCorrect, false, 'wrong endpoint');
  assert.equal(grade(question, 'x <= -4 OR x > 2').isCorrect, false, 'open versus closed');
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
