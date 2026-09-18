import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SOLVER_RACE_CATALOG, planSolverRace, solverRaceCatalogCounts, solverRaceFamilyPlan,
} from '../../functions/shared/solverRace.mjs';
import { buildPrivateToolGrading, buildPublicToolPayload, gradePathResponse } from '../../functions/shared/pathToolContracts.mjs';
import { buildRawPathResponse, hasMeaningfulRawPathResponse } from '../../src/platform/path/pathToolResponses.js';
import { questionFromToolPayload } from '../../src/platform/path/pathToolResponses.js';
import { needsMultiRelationWorkspace } from '../../src/algebraRelationFoundation.js';
import mathPath from '../../functions/lib/mathPath.js';

test('catalog provides at least eight explicit structural families per solver family', () => {
  assert.deepEqual(solverRaceCatalogCounts(), {
    linearEquation: 14,
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
    'linearEquation', 'linearEquation',
    'literalEquation', 'literalEquation',
    'linearInequality', 'linearInequality',
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
  for (const [focus, count] of [['mixed', 10], ['linearEquation', 3], ['literalEquation', 3], ['linearInequality', 3], ['absoluteValueEquation', 3], ['absoluteValueInequality', 3]]) {
    const race = planSolverRace({ roundCount: count, focus, seed: `dry-${focus}` });
    assert.equal(race.length, count);
    for (const question of race) assert.equal((await mathPath.buildIssuePlan(question)).issuable, true, `${focus}: ${question.id}`);
  }
});

test('all five families survive issue, sanitization, reconstruction, and workspace routing', async () => {
  for (const family of ['linearEquation', 'literalEquation', 'linearInequality', 'absoluteValueEquation', 'absoluteValueInequality']) {
    const question = SOLVER_RACE_CATALOG.find((entry) => entry.challengeFamily === family);
    const plan = await mathPath.buildIssuePlan(question);
    const publicQuestion = mathPath.buildSanitizedQuestion(question, {
      questionInstanceId: `solver-${family}`, attemptsAllowed: 1, attemptsUsed: 0, toolPayload: plan.toolPayload,
    });
    const renderable = questionFromToolPayload(publicQuestion);
    assert.equal(renderable.type, 'stepAlgebra');
    assert.equal(needsMultiRelationWorkspace(renderable), !['linearEquation', 'literalEquation'].includes(family));
    assert.equal(renderable.responseFields, undefined, 'no typed-answer fallback');
    assert.equal(renderable.choices, undefined, 'no multiple-choice fallback');
    assert.doesNotMatch(JSON.stringify(publicQuestion), /expectedFinalRelation|solverGrader/);
  }
});

test('every linear-equation structure is securely graded and rejects a wrong solution', () => {
  const structures = SOLVER_RACE_CATALOG.filter((entry) => entry.challengeFamily === 'linearEquation');
  assert.ok(structures.length >= 10);
  for (const question of structures) {
    assert.equal(grade(question, question.expectedFinalRelation).isCorrect, true, question.id);
    const answer = Number(question.expectedFinalRelation.split('=')[1]);
    assert.equal(grade(question, `x = ${answer + 1}`).isCorrect, false, question.id);
  }
});

test('the secure grader awards conservative partial credit for a valid unfinished solver relation', () => {
  const question = SOLVER_RACE_CATALOG.find((entry) => entry.id.endsWith('linearEquation_two_step'));
  const partial = grade(question, '4*x = 20', { score: 1, provisionalPoints: 1000 });
  assert.equal(partial.isCorrect, false);
  assert.equal(partial.score, .5, 'one server-verified move in a depth-two solve earns half base credit');
  assert.equal(grade(question, question.equation).score, 0, 'the untouched starting relation is not work');
  assert.equal(grade(question, '4*x = 24', { score: 1 }).score, 0, 'a client claim cannot make invalid algebra worth credit');
});

test('canonical response meaningfulness decides only whether there is work to send', () => {
  assert.equal(hasMeaningfulRawPathResponse({ finalRelation: '4*x = 20', candidateVerification: '' }), true);
  assert.equal(hasMeaningfulRawPathResponse({ finalRelation: '   ', candidateVerification: '' }), false);
  assert.equal(hasMeaningfulRawPathResponse(null), false);
});

test('difficulty can ramp or remain fixed while long races retain structural variety', () => {
  const ramp = planSolverRace({ roundCount: 10, focus: 'linearEquation', difficulty: 'ramp', seed: 'room' });
  assert.deepEqual([...new Set(ramp.map((question) => question.difficultyBand))], ['foundation', 'developing', 'advanced', 'challenge']);
  for (const difficulty of ['foundation', 'developing', 'advanced', 'challenge']) {
    const race = planSolverRace({ roundCount: 20, focus: 'linearEquation', difficulty, seed: 'room' });
    assert.ok(race.every((question) => question.difficultyBand === difficulty));
    assert.ok(new Set(race.map((question) => question.familyId)).size > 1, difficulty);
  }
});

test('a room seed gives every student the same mathematics and different rooms vary', () => {
  const options = { roundCount: 20, focus: 'linearEquation', difficulty: 'advanced', seed: 'room-a' };
  assert.deepEqual(planSolverRace(options), planSolverRace(options));
  assert.notDeepEqual(
    planSolverRace(options).map((question) => question.equation),
    planSolverRace({ ...options, seed: 'room-b' }).map((question) => question.equation),
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

test('absolute inequality special answers reject malformed prefix text', () => {
  const allReal = SOLVER_RACE_CATALOG.find((q) => q.id.endsWith('absoluteValueInequality_all_real'));
  const none = SOLVER_RACE_CATALOG.find((q) => q.id.endsWith('absoluteValueInequality_none'));
  assert.equal(grade(allReal, 'all real numbers').isCorrect, true);
  assert.equal(grade(allReal, 'all reals').isCorrect, true);
  assert.equal(grade(allReal, 'all real bananas').isCorrect, false);
  assert.equal(grade(allReal, 'all real x').isCorrect, false);
  assert.equal(grade(none, 'no solution').isCorrect, true);
  assert.equal(grade(none, 'no solution maybe').isCorrect, false);
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

test('absolute inequality OR branches support fractional endpoints from seeded variants', async () => {
  let variant = null;
  for (let index = 0; index < 256 && !variant; index += 1) {
    variant = planSolverRace({
      roundCount: 8,
      focus: 'absoluteValueInequality',
      seed: `fraction-endpoint-${index}`,
    }).find((question) => question.equation === '|3*x-2| >= 10');
  }

  assert.ok(variant, 'expected to encounter the fractional seeded OR variant');
  assert.equal(variant.expectedFinalRelation, 'x <= -8/3 OR x >= 4');
  assert.equal((await mathPath.buildIssuePlan(variant)).issuable, true, 'seeded variant remains securely issuable');

  const publicPayload = buildPublicToolPayload(variant);
  assert.ok(publicPayload);
  assert.doesNotMatch(JSON.stringify(publicPayload), /expectedFinalRelation|solverGrader|-8\/3/);

  assert.equal(grade(variant, 'x <= -8/3 OR x >= 4').isCorrect, true, 'authored order');
  assert.equal(grade(variant, 'x >= 4 OR x <= -8/3').isCorrect, true, 'reversed branch order');
  assert.equal(grade(variant, '-8/3 >= x OR 4 <= x').isCorrect, true, 'reversed inequality orientation');
  assert.equal(grade(variant, 'x >= -8/3 OR x >= 4').isCorrect, false, 'wrong left branch direction');
  assert.equal(grade(variant, 'x <= -8/3 OR x <= -8/3').isCorrect, false, 'duplicate branch');
  assert.equal(grade(variant, 'x < -8/3 OR x >= 4').isCorrect, false, 'endpoint openness matters');
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
