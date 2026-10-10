/*
 * JOB K ITEM 2 — WHICH STORED CLASSROOM ATTEMPTS CHANGE VERDICT UNDER 2a–2f.
 *
 * scripts/lib/classroomRegradePlan.mjs decides; scripts/
 * report-classroom-regrade-candidates.mjs reads and reports. Neither writes.
 *
 * The fixtures (tests/platform/helpers/classroomRegradeFixtures.mjs) are
 * questions as the pre-K code stored them, students' work, and the verdict the
 * pre-K code recorded. Every new verdict expected here is derived by hand in
 * the fixture comments and re-derived below with mathjs, never by the module
 * under test. When the pre-K commit is in this clone, the stored shapes and
 * the old verdicts are checked against the pre-K code itself.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { all, create } from 'mathjs';

import Fraction from 'fraction.js';
import {
  DEFAULT_TOOL_SCOPE,
  DEFECT,
  NEEDS_TEACHER_REASON,
  REGRADE_CLASS,
  defectsOf,
  graphing2HasNoGridAnswer,
  indexV5Sources,
  legacyQuadraticRegression,
  parseToolScope,
  planClassroomAttempt,
  questionSurface,
} from '../../scripts/lib/classroomRegradePlan.mjs';
import {
  REPORT_NOTES,
  loadV5Sources,
  parseReportArgs,
  runClassroomRegradeReport,
} from '../../scripts/report-classroom-regrade-candidates.mjs';
import {
  FIXTURES,
  INTENT_2A_NO_SOURCE,
  INTENT_2B_NO_SOURCE,
  INTENT_2C_BRANCH,
  INTENT_SIGN_RATIONAL_NO_SOURCE,
  REGRESSION_SOURCE,
  PRE_K_COMMIT,
  PRE_K_STORED,
  STORED,
  V5_SOURCE,
  compileWith,
  oldGradingFor,
  storedAttempt,
  toolResponseFor,
} from './helpers/classroomRegradeFixtures.mjs';
import { executableSource } from './helpers/sourceContract.mjs';
import { gradeToolWork } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { deliveredQuestionForGrading } from '../../functions/shared/serverGrading/deliveredQuestion.mjs';
import { deriveLinearBridge, graphQuestionFor } from '../../functions/shared/toolMath/representationBridge/representationBridgeMath.mjs';
import { evaluateConstructionDetail } from '../../functions/shared/toolMath/graphing2/constructionPolicy.mjs';
import { targetLineFromQuestion } from '../../functions/shared/toolMath/graphing2/graphingMath.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const math = create(all);
const AT = Date.parse('2026-10-01T15:00:00Z');
const ASSIGNMENT = { id: 'k-regrade-assignment', schemaVersion: 5 };
const v5Index = indexV5Sources([{ path: 'k-regrade-source.json', payload: V5_SOURCE }]);

const stored = (fixture, index, overrides = {}) => storedAttempt({
  assignmentId: ASSIGNMENT.id,
  questionIndex: index,
  question: STORED[fixture.question],
  response: toolResponseFor(fixture),
  grading: oldGradingFor(fixture),
  submissionId: `sub-${fixture.tag}`,
  at: AT,
  ...overrides,
});
const plan = (fixture, index, extra = {}) => {
  const attempt = stored(fixture, index);
  return planClassroomAttempt({
    assignment: ASSIGNMENT,
    question: STORED[fixture.question],
    questionIndex: index,
    studentId: `student-${fixture.tag}`,
    record: attempt.record,
    evidenceDocument: attempt.evidenceDocument,
    v5Index,
    ...extra,
  });
};
const byTag = Object.fromEntries(FIXTURES.map((fixture, index) => [fixture.tag, { fixture, index }]));
const inDefaultScope = (question) => DEFAULT_TOOL_SCOPE.flatMap((entry) => parseToolScope(entry))
  .some((entry) => entry.tool === questionSurface(question).tool && (entry.mode === null || entry.mode === questionSurface(question).mode));

/* --- the expected values, re-derived without the module under test ------------ */

test('the hand-derived expectations hold under an independent evaluation (mathjs)', () => {
  // 2a: the key points are on 2x + 3y = 12; the control points are not.
  for (const [x, y] of byTag['a-key'].fixture.work.points) assert.equal(2 * x + 3 * y, 12);
  for (const [x, y] of byTag['a-wrong'].fixture.work.points) assert.notEqual(2 * x + 3 * y, 12);
  // 2b: f(2) for 3·5^(x − 1) + 4 is 19; the pre-K compile graded 3·2^x + 5, f(2) = 17.
  assert.equal(math.evaluate('3 * 5^(2 - 1) + 4'), 19);
  assert.equal(math.evaluate('3 * 2^2 + 5'), 17);
  // 2c: f(x) = (x − 2)² − 1 on x ≥ 2. f(0) = 3, and the kept input with f = 3 is 2 + √4 = 4.
  const fx = math.evaluate('(0 - 2)^2 - 1');
  assert.equal(fx, 3);
  assert.equal(math.evaluate(`2 + sqrt(${fx} + 1)`), 4);
  // 2d: (x − 1)/x is (x² − 1)/(x² + x) wherever both are defined; the extra-hole
  // answer is undefined at x = 5 where the quotient is 4/5.
  for (const x of [-3.5, -0.4, 0.7, 2.25, 6.1]) {
    assert.ok(Math.abs(math.evaluate('(x - 1) / x', { x }) - math.evaluate('(x^2 - 1) / (x^2 + x)', { x })) < 1e-12);
  }
  assert.equal(math.evaluate('(x^2 - 1) / (x^2 + x)', { x: 5 }), 0.8);
  assert.ok(!Number.isFinite(math.evaluate('((x - 1) * (x - 5)) / (x * (x - 5))', { x: 5 })));
  assert.equal(math.evaluate('(x + 1) / x', { x: 1 }), 2);
  // 2e: 2·2^(x − 1) − 3 is 1·2^(x − 0) − 3; 1.05·2^x − 3 is not.
  for (const x of [-2, 0, 1.5, 4]) {
    assert.ok(Math.abs(math.evaluate('2 * 2^(x - 1) - 3', { x }) - math.evaluate('1 * 2^(x - 0) - 3', { x })) < 1e-12);
  }
  assert.ok(Math.abs(math.evaluate('1.05 * 2^0 - 3') - math.evaluate('2 * 2^(0 - 1) - 3')) > 0.01);
  // 2f: a₈ of 7, 11, 15, ... is 35; of 7, 8, 9, ... (the old reading) is 14.
  assert.equal(math.evaluate('7 + (8 - 1) * 4'), 35);
  assert.equal(math.evaluate('7 + (8 - 1) * 1'), 14);
});

test('the later fixtures\' expectations hold under an independent evaluation (mathjs, fraction.js)', () => {
  // Sign '≥': (x + 2)(x − 3) at a point inside each chart interval.
  const product = (x) => math.evaluate('(x + 2) * (x - 3)', { x });
  assert.deepEqual([-5, 0, 7].map((x) => product(x) > 0), [true, false, true], 'positive on intervals 0 and 2');
  // 0x + 0y = 5: no (x, y) satisfies it; 0x + 0y = 0: every one does.
  for (const [x, y] of [[0, 0], [3, -2], [1e6, 7]]) {
    assert.notEqual(math.evaluate('0 * x + 0 * y', { x, y }), 5);
    assert.equal(math.evaluate('0 * x + 0 * y', { x, y }), 0);
  }
  // The least-squares quadratic, exactly (normal equations in fractions).
  const exactFit = (points) => {
    const sum = (fn) => points.reduce((total, [x, y]) => total.add(fn(new Fraction(x), new Fraction(y))), new Fraction(0));
    const A = [[sum((x) => x.pow(4)), sum((x) => x.pow(3)), sum((x) => x.pow(2))],
      [sum((x) => x.pow(3)), sum((x) => x.pow(2)), sum((x) => x)],
      [sum((x) => x.pow(2)), sum((x) => x), new Fraction(points.length)]];
    const v = [sum((x, y) => x.pow(2).mul(y)), sum((x, y) => x.mul(y)), sum((x, y) => y)];
    // Gauss–Jordan in exact arithmetic.
    const m = A.map((row, i) => [...row, v[i]]);
    for (let c = 0; c < 3; c += 1) {
      const p = m.findIndex((row, r) => r >= c && !row[c].equals(0));
      [m[c], m[p]] = [m[p], m[c]];
      const d = m[c][c];
      m[c] = m[c].map((value) => value.div(d));
      for (let r = 0; r < 3; r += 1) if (r !== c) { const f = m[r][c]; m[r] = m[r].map((value, j) => value.sub(f.mul(m[c][j]))); }
    }
    return m.map((row) => row[3]);
  };
  const pairs = (points) => points.map(({ x, y }) => [x, y]);
  const years = exactFit(pairs(STORED.quadraticYears.points));
  assert.deepEqual(years.map((value) => value.toFraction()), ['13/14', '-25868/7', '36766681/10']);
  const small = exactFit(pairs(STORED.quadraticSmall.points));
  assert.deepEqual(small.map((value) => value.toFraction()), ['13/14', '2/7', '67/70']);
  for (const [tag, fit] of [['quadratic-right', years], ['quadratic-control', small]]) {
    const work = byTag[tag].fixture.work;
    ['a', 'b', 'c'].forEach((key, i) => assert.ok(Math.abs(Number(work[key]) - fit[i].valueOf()) < 1e-6, `${tag} ${key}`));
  }
  // The pre-1dabf19 fit found no quadratic on the years, and agrees on 0..4.
  assert.equal(legacyQuadraticRegression(pairs(STORED.quadraticYears.points)), null);
  const legacySmall = legacyQuadraticRegression(pairs(STORED.quadraticSmall.points));
  [legacySmall.a, legacySmall.b, legacySmall.c].forEach((value, i) => assert.ok(Math.abs(value - small[i].valueOf()) < 1e-9));
  // (x² − 1)/(x − 1) is x + 1 off x = 1.
  for (const x of [-3.5, 0, 2.25, 7]) assert.ok(Math.abs(math.evaluate('(x^2 - 1) / (x - 1)', { x }) - (x + 1)) < 1e-12);
  // 5x + 6y = −7: m = −5/6, b = −7/6. (1, −2) and (−5, 3) are on it;
  // (−5, 3.5) is 1/2 off; (1, −2) with (−5, 3.5) has m = −11/12, b = −13/12,
  // 1/12 from the target's m and b.
  const m = new Fraction(-5, 6);
  const b = new Fraction(-7, 6);
  const at = (x) => m.mul(x).add(b);
  assert.deepEqual([at(1).valueOf(), at(-5).valueOf()], [-2, 3]);
  assert.equal(new Fraction(3.5).sub(at(-5)).valueOf(), 0.5);
  const near = new Fraction(3.5 + 2).div(-5 - 1);
  const nearB = new Fraction(-2).sub(near);
  assert.deepEqual([near.toFraction(), nearB.toFraction()], ['-11/12', '-13/12']);
  assert.deepEqual([near.sub(m).abs().toFraction(), nearB.sub(b).abs().toFraction()], ['1/12', '1/12']);
  // y = 2.3: the nearest 0.5-grid heights are 2 and 2.5, 0.3 and 0.2 away.
  assert.deepEqual([2, 2.5].map((y) => Math.abs(y - 2.3) > 0.12), [true, true]);
  // (2 + 3i)(−1 + 2i) = −8 + i; (2 + 3i) + (−1 + 2i) = 1 + 5i.
  assert.equal(math.format(math.evaluate('(2 + 3i) * (-1 + 2i)')), '-8 + i');
  assert.equal(math.format(math.evaluate('(2 + 3i) + (-1 + 2i)')), '1 + 5i');
  // The bridge rows are y = x − 4.
  for (const { x, y } of STORED.bridgeGeneral.source.rows) assert.equal(x - 4, y);
  // The regression of the source table, by the textbook formulas.
  const xs = REGRESSION_SOURCE.map(([x]) => x);
  const ys = REGRESSION_SOURCE.map(([, y]) => y);
  const sxy = math.sum(xs.map((x, i) => (x - math.mean(xs)) * (ys[i] - math.mean(ys))));
  const sxx = math.sum(xs.map((x) => (x - math.mean(xs)) ** 2));
  const syy = math.sum(ys.map((y) => (y - math.mean(ys)) ** 2));
  const slope = sxy / sxx;
  assert.ok(Math.abs(slope - 1.85) < 1e-12);
  assert.ok(Math.abs(math.mean(ys) - slope * math.mean(xs) - 0.25) < 1e-12);
  assert.ok(Math.abs(sxy / Math.sqrt(sxx * syy) - byTag['regression-control'].fixture.work.regressionRun.r) < 1e-12);
  // x² = 8y: focus (0, 2), directrix y = −2. P(2, 0.5) is 2.5 from both;
  // the offset-4 point (4, 2) is 4 from both.
  const distance = ([x, y]) => [math.distance([x, y], [0, 2]), y + 2];
  assert.deepEqual(distance([2, 0.5]), [2.5, 2.5]);
  assert.deepEqual(distance([4, 2]), [4, 4]);
  // P(x) = x² − 9: P(3) = 0, P(2) = −5.
  assert.deepEqual([3, 2].map((x) => math.evaluate('x^2 - 9', { x })), [0, -5]);
});

/* --- every fixture, planned ------------------------------------------------------ */

for (const [index, fixture] of FIXTURES.entries()) {
  test(`${fixture.tag}: ${fixture.expect.classification}${fixture.expect.reason ? ` (${fixture.expect.reason})` : ''}`, () => {
    const result = plan(fixture, index);
    assert.ok(result, 'in scope');
    assert.equal(result.classification, fixture.expect.classification);
    if (fixture.expect.reason) assert.equal(result.reason, fixture.expect.reason);
    if (fixture.expect.defect) assert.ok(result.defects.includes(fixture.expect.defect), JSON.stringify(result.defects));
    if (fixture.expect.defects) assert.deepEqual(result.defects, fixture.expect.defects, 'a negative control no K defect claims');
    if (fixture.expect.oldScore !== undefined) assert.equal(result.old.score, fixture.expect.oldScore, 'the recorded attempt score');
    if (fixture.expect.newScore !== undefined) {
      assert.equal(result.new.score, fixture.expect.newScore, 'the current attempt score');
      assert.equal(result.new.isCorrect, fixture.expect.newCorrect);
    }
    assert.equal(result.tool, fixture.tool);
  });
}

test('per part: the old and the new verdict, and only the parts that changed are marked', () => {
  const { fixture, index } = byTag['d-right'];
  const parts = Object.fromEntries(plan(fixture, index).parts.map((part) => [part.id, part]));
  assert.deepEqual([parts.quotient.old.isCorrect, parts.quotient.new.isCorrect, parts.quotient.changed], [false, true, true]);
  assert.deepEqual([parts['quotient-restrictions'].old.isCorrect, parts['quotient-restrictions'].new.isCorrect, parts['quotient-restrictions'].changed], [true, true, false]);
  const lower = Object.fromEntries(plan(byTag['c-mirror-lower'].fixture, byTag['c-mirror-lower'].index).parts.map((part) => [part.id, part]));
  assert.deepEqual([lower.inverse.old.credit, lower.inverse.new.credit], [1, 0]);
});

test('a score that rises or falls without the verdict flipping is still listed, by direction', () => {
  // (0, 4) is on 2x + 3y = 12 (0 + 12); (3, 0) is not (6 ≠ 12): a wrong line
  // through one right point. Old: no line, nothing right (0). New: point 1
  // right, so 1 of the 2 graded parts (50), still wrong.
  const onLine = ([x, y]) => 2 * x + 3 * y === 12;
  assert.deepEqual([[0, 4], [3, 0]].map(onLine), [true, false]);
  const rise = plan({ ...byTag['a-key'].fixture, tag: 'a-partial', work: { points: [[0, 4], [3, 0], [6, -4]] } }, 0);
  assert.equal(rise.classification, REGRADE_CLASS.CANDIDATE);
  assert.deepEqual([rise.old.score, rise.new.score, rise.new.isCorrect], [0, 50, false]);
  // f⁻¹(f(1)) = 1, so '2' is wrong both times; 17 was right for the stored
  // 3·2^x + 5 and is wrong for 3·5^(x − 1) + 4 (19): 50 falls to 0.
  const fall = plan({ ...byTag['b-lower'].fixture, tag: 'b-partial', work: { inverseAfterForward: '2', forwardAfterInverse: '17' } }, 0);
  assert.equal(fall.classification, REGRADE_CLASS.NOW_LOWER);
  assert.deepEqual([fall.old.score, fall.new.score, fall.old.isCorrect], [50, 0, false]);
});

test('2a / 2b are re-graded only against the question rebuilt from the V5 source, which names its source', () => {
  const { fixture, index } = byTag['a-key'];
  const result = plan(fixture, index);
  assert.equal(result.questionSource, 'rebuilt-from-v5-source');
  assert.deepEqual(result.rebuilt, { field: 'standard', reason: null, sourcePaths: ['k-regrade-source.json'] });
  // Without the source the same attempt cannot be re-graded.
  const bare = plan(fixture, index, { v5Index: indexV5Sources([]) });
  assert.equal(bare.classification, REGRADE_CLASS.NEEDS_TEACHER);
  assert.equal(bare.reason, NEEDS_TEACHER_REASON.STANDARD_FORM_LOST);
});

test('a V5 question with the same prompt is not the source unless it is the same question everywhere else', () => {
  const { fixture, index } = byTag['a-key'];
  // Another blueprint: the same prompt on x + y = 1, second in its section
  // (q_section-1_1_2, where the stored question is q_section-1_1_1).
  const elsewhere = structuredClone(V5_SOURCE);
  elsewhere.sections[0].questions = [V5_SOURCE.sections[0].questions[1], { ...V5_SOURCE.sections[0].questions[0], standardForm: { A: 1, B: 1, C: 1 } }];
  // The same position and prompt, but filed under another standard.
  const otherStandard = structuredClone(V5_SOURCE);
  otherStandard.sections[0].questions[0] = { ...otherStandard.sections[0].questions[0], standard: 'A.2C', standardForm: { A: 1, B: 1, C: 1 } };
  // The same position, prompt and standard, in a homework section.
  const otherRole = structuredClone(otherStandard);
  otherRole.sections[0].questions[0].standard = 'A.3C';
  otherRole.sections[0].role = 'homework';
  for (const payload of [elsewhere, otherStandard, otherRole]) {
    const result = plan(fixture, index, { v5Index: indexV5Sources([{ path: 'other.json', payload }]) });
    assert.equal(result.classification, REGRADE_CLASS.NEEDS_TEACHER);
    assert.equal(result.reason, NEEDS_TEACHER_REASON.STANDARD_FORM_LOST);
    assert.deepEqual(result.rebuilt, { field: null, reason: 'v5-source-is-another-question', sourcePaths: ['other.json'] });
  }
  // Beside the real source, the other blueprint is not a second opinion.
  const both = plan(fixture, index, { v5Index: indexV5Sources([{ path: 'other.json', payload: elsewhere }, { path: 'k-regrade-source.json', payload: V5_SOURCE }]) });
  assert.equal(both.classification, REGRADE_CLASS.CANDIDATE);
});

test('two V5 sources that disagree about the lost field are never guessed between', () => {
  const other = structuredClone(V5_SOURCE);
  other.sections[0].questions[0].standardForm = { A: 4, B: 6, C: 12 };
  const result = plan(byTag['a-key'].fixture, byTag['a-key'].index, {
    v5Index: indexV5Sources([{ path: 'one.json', payload: V5_SOURCE }, { path: 'two.json', payload: other }]),
  });
  assert.equal(result.classification, REGRADE_CLASS.NEEDS_TEACHER);
  assert.equal(result.reason, NEEDS_TEACHER_REASON.V5_SOURCE_AMBIGUOUS);
  // The same coefficients in two files are one source.
  const twice = plan(byTag['a-key'].fixture, byTag['a-key'].index, {
    v5Index: indexV5Sources([{ path: 'one.json', payload: V5_SOURCE }, { path: 'two.json', payload: V5_SOURCE }]),
  });
  assert.equal(twice.classification, REGRADE_CLASS.CANDIDATE);
});

test('a bridge rebuilt with a base the bridge cannot grade (b = 1) goes to the teacher', () => {
  const source = structuredClone(V5_SOURCE);
  source.sections[0].questions[1].function = { a: 3, b: 1, h: 1, k: 4 };
  const result = plan(byTag['b-right'].fixture, byTag['b-right'].index, { v5Index: indexV5Sources([{ path: 's.json', payload: source }]) });
  assert.equal(result.classification, REGRADE_CLASS.NEEDS_TEACHER);
  assert.equal(result.reason, NEEDS_TEACHER_REASON.REBUILT_UNGRADABLE);
});

test('a bridge whose source authored a line keeps its verdict: the stored shape is the source\'s own', () => {
  const source = structuredClone(V5_SOURCE);
  // {m: 3, b: 5} compiles, before and after K, to {type: 'linear', a: 3, h: 0, k: 5}.
  source.sections[0].questions[1].function = { m: 3, b: 5 };
  const result = plan(byTag['b-lower'].fixture, byTag['b-lower'].index, { v5Index: indexV5Sources([{ path: 's.json', payload: source }]) });
  assert.equal(result.classification, REGRADE_CLASS.UNCHANGED);
});

test('a 2f alias question outside DOL1 whose verdict changes goes to the teacher; DOL1\'s geometric copy always does', () => {
  // 5, 8, 11, ...: change 3, a₈ = 5 + 7·3 = 26 (old reading 5, 6, 7: a₈ = 12).
  const question = { type: 'sequenceExplorer', questionId: 'k-alias', prompt: 'Analyze the sequence.', mode: 'analyze', sequence: { kind: 'arithmetic', first: 5, commonDifference: 3 } };
  const fixture = { tag: 'alias', question: 'alias', tool: 'sequenceExplorer', work: { kindAnswer: 'arithmetic', changeAnswer: '3', termAnswer: '26' }, old: [false, 1 / 3, { kind: [true, true], change: [false, true], term: [false, true] }] };
  STORED.alias = question;
  try {
    const result = plan(fixture, 0);
    assert.equal(result.classification, REGRADE_CLASS.NEEDS_TEACHER);
    assert.equal(result.reason, NEEDS_TEACHER_REASON.SEQUENCE_SHOWN_DIFFERS);
  } finally {
    delete STORED.alias;
  }
  // DOL1's geometric copy (ratio 2 is also the old default, so no verdict
  // changes) still asks for terms the grader never checks.
  const copy = structuredClone(PRE_K_STORED.dol1Geometric);
  assert.deepEqual(defectsOf({ question: copy, surface: questionSurface(copy) }), [DEFECT.SEQUENCE_ALIAS]);
  const work = { kindAnswer: 'geometric', changeAnswer: '2', termAnswer: '384' };
  const attempt = storedAttempt({
    assignmentId: ASSIGNMENT.id, questionIndex: 0, question: copy, submissionId: 's', at: AT,
    response: gradeToolWork({ toolId: 'sequenceExplorer', question: copy, work }).toolResponse,
    grading: gradeToolWork({ toolId: 'sequenceExplorer', question: copy, work }),
  });
  const result = planClassroomAttempt({ assignment: ASSIGNMENT, question: copy, questionIndex: 0, record: attempt.record, evidenceDocument: attempt.evidenceDocument, v5Index });
  assert.equal(result.direction, 'same');
  assert.equal(result.reason, NEEDS_TEACHER_REASON.DOL1_ITEM_MUST_BE_REPLACED);
});

test('a compiler drop no V5 source confirms is counted, never attributed; one the source clears is not counted', async () => {
  // The '≥' chart has no numeratorFactors (like almost every chart) and no
  // source: suspected, not K's.
  const ge = plan(byTag['sign-ge-right'].fixture, byTag['sign-ge-right'].index);
  assert.deepEqual(ge.unconfirmedDefects, [DEFECT.SIGN_NUMERATOR_DROPPED]);
  assert.ok(!ge.defects.includes(DEFECT.SIGN_NUMERATOR_DROPPED));
  // The authored-'polynomial' chart: the source compiles it exactly as stored.
  const authored = plan(byTag['drop-sign-authored-polynomial'].fixture, byTag['drop-sign-authored-polynomial'].index);
  assert.deepEqual([authored.defects, authored.unconfirmedDefects], [[], [DEFECT.SIGN_RATIONAL_MODE_DROPPED, DEFECT.SIGN_NUMERATOR_DROPPED]]);
  // The parabola without its source is suspected only.
  const bare = plan(byTag['drop-parabola'].fixture, byTag['drop-parabola'].index, { v5Index: indexV5Sources([]) });
  assert.equal(bare.classification, REGRADE_CLASS.UNCHANGED);
  assert.deepEqual([bare.defects, bare.unconfirmedDefects], [[], [DEFECT.PARABOLA_POINT_DROPPED]]);
  // A confirmed drop names its source and shows the authored question's verdict.
  const drop = plan(byTag['drop-polynomial'].fixture, byTag['drop-polynomial'].index);
  assert.equal(drop.questionSource, 'rebuilt-from-v5-source');
  assert.deepEqual(drop.rebuilt.sourcePaths, ['k-regrade-source.json']);
  assert.deepEqual([drop.old.isCorrect, drop.new.isCorrect], [false, true]);
});

test('K changes the classroom report cannot see are explained, and their claims hold', () => {
  // Step Algebra 2's slope-intercept rewrite is graded as stepAlgebra.
  const rewrite = { type: 'stepAlgebra2', questionId: 'k-rewrite', mode: 'rewriteLinearForm', equation: 'y = x*2 - 6' };
  assert.equal(questionSurface(deliveredQuestionForGrading(rewrite)).tool, 'stepAlgebra');
  assert.equal(inDefaultScope(deliveredQuestionForGrading(rewrite)), false);
  // The bridge's graph stage is a form-aware factored-linear construction:
  // the both-points rule (the legacy path) never grades it.
  const derived = deriveLinearBridge(STORED.bridgeGeneral);
  const graphQuestion = graphQuestionFor(STORED.bridgeGeneral, derived);
  const detail = evaluateConstructionDetail([[4, 0], [6, 2]], graphQuestion, targetLineFromQuestion(graphQuestion), 0.12);
  assert.equal(detail.legacy, false);
  assert.ok(REPORT_NOTES.some((note) => /My Math Path is not read/.test(note)));
  assert.ok(REPORT_NOTES.some((note) => /consolidateStepAlgebra2Question/.test(note)));
});

test('a set field compiled from a template placeholder is recognised; braces the author wrote are not', () => {
  const field = (answer, extra = {}) => ({ type: 'multiAnswer', questionId: 'k-set', answerFields: [{ id: 'answer', type: 'set', toolProfile: 'set', answer, ...extra }] });
  const of = (question) => defectsOf({ question, surface: questionSurface(question) });
  assert.deepEqual(of(field('{{a}}')), [DEFECT.SET_FIELD_FROM_PLACEHOLDER]);
  assert.deepEqual(of(field('{{union}}/{{total}}')), [DEFECT.SET_FIELD_FROM_PLACEHOLDER]);
  assert.deepEqual(of(field('{ {{a}}, {{b}} }')), [], 'the author wrote set braces');
  assert.deepEqual(of(field('{-4, -3}')), []);
  assert.deepEqual(of({ ...field('{{a}}'), answerFields: [{ id: 'answer', inputProfile: 'number', answer: '{{a}}' }] }), [], 'not compiled as a set');
  // A family instance holds the substituted answer; its template is the stored question.
  const instance = field('7');
  assert.deepEqual(defectsOf({ question: instance, surface: questionSurface(instance), storedQuestion: field('{{a}}') }), [DEFECT.SET_FIELD_FROM_PLACEHOLDER]);
});

test('graphing2: a target is void only when no two snap-grid points reach it', () => {
  assert.equal(graphing2HasNoGridAnswer(STORED.horizontalOffGrid), true);
  assert.equal(graphing2HasNoGridAnswer({ ...STORED.horizontalOffGrid, value: 2.5 }), false);
  assert.equal(graphing2HasNoGridAnswer({ ...STORED.horizontalOffGrid, snapStep: 0.1 }), false, 'an authored snapStep reaches 2.3');
  // y = 3x + 0.2 on the 0.5 grid: 3x is a multiple of 1.5, so y is 0.2 off
  // a half-unit at best (0.3 or 0.2 away): no grid point within 0.12.
  assert.equal(graphing2HasNoGridAnswer({ type: 'graphing2', mode: 'slopeIntercept', line: { m: 3, b: 0.2 } }), true);
  assert.equal(graphing2HasNoGridAnswer(STORED.standardLine), false);
});

/* --- scope, evidence and records that cannot be replayed ------------------------- */

test('2c: an x outside a domain f declares itself is not the off-branch defect', () => {
  // f(x) = (x − 2)² − 1 on x ≥ 2 has no f(0): x = 0 is outside f, not on the
  // dropped branch. The same f with only inverseBranch 'right' (no domain)
  // is defined at 0, and x = 0 is the dropped branch.
  const declared = { ...STORED.inverseMirror, questionId: 'k-domain', f: { type: 'quadratic', a: 1, h: 2, k: -1, domain: { min: 2 } } };
  assert.equal(math.evaluate('(x - 2)^2 - 1', { x: 0 }), 3);
  assert.deepEqual(defectsOf({ question: declared, surface: questionSurface(declared) }), []);
  assert.deepEqual(defectsOf({ question: STORED.inverseMirror, surface: questionSurface(STORED.inverseMirror) }), [DEFECT.INVERSE_OFF_BRANCH_INPUT]);
});

test('the default scope: every graphing2 mode (the both-points rule); a tool K never touched is out; --tools narrows or widens it', () => {
  // A right slope-intercept line: (0, 1) and (1, 3) are on y = 2x + 1.
  const slope = { type: 'graphing2', questionId: 'k-slope', mode: 'slopeIntercept', line: { m: 2, b: 1 } };
  const attempt = storedAttempt({
    assignmentId: ASSIGNMENT.id, questionIndex: 0, question: slope, submissionId: 's', at: AT,
    response: toolResponseFor({ tool: 'graphing2', question: 'graphing2', work: { points: [[0, 1], [1, 3]] } }),
    grading: gradeToolWork({ toolId: 'graphing2', question: slope, work: { points: [[0, 1], [1, 3]] } }),
  });
  const input = { assignment: ASSIGNMENT, question: slope, questionIndex: 0, record: attempt.record, evidenceDocument: attempt.evidenceDocument, v5Index };
  const inScope = planClassroomAttempt(input);
  assert.equal(inScope.classification, REGRADE_CLASS.UNCHANGED, 'slope-intercept graphing2 is in the default scope, and a right line stays right');
  assert.deepEqual(inScope.defects, []);
  assert.equal(planClassroomAttempt({ ...input, scope: parseToolScope('graphing2:standardForm') }), null, '--tools narrows it');
  // complexPlaneLab's division mode: K changed only the Operations view.
  const division = { type: 'complexPlaneLab', questionId: 'k-division', mode: 'division', z: { re: 4, im: 2 }, w: { re: 1, im: -1 } };
  const divisionAttempt = storedAttempt({
    assignmentId: ASSIGNMENT.id, questionIndex: 0, question: division, submissionId: 's', at: AT,
    response: gradeToolWork({ toolId: 'complexPlaneLab', question: division, work: {} }).toolResponse,
    grading: gradeToolWork({ toolId: 'complexPlaneLab', question: division, work: {} }),
  });
  const divisionInput = { assignment: ASSIGNMENT, question: division, questionIndex: 0, record: divisionAttempt.record, evidenceDocument: divisionAttempt.evidenceDocument, v5Index };
  assert.equal(planClassroomAttempt(divisionInput), null, 'complexPlaneLab division is not in the default scope');
  assert.ok(planClassroomAttempt({ ...divisionInput, scope: parseToolScope('complexPlaneLab') }), '--tools widens it');
  const { fixture, index } = byTag['d-right'];
  assert.equal(plan(fixture, index, { scope: parseToolScope('inverseCompositionLab,transformationsLab:identify') }), null);
  assert.ok(plan(byTag['e-right'].fixture, byTag['e-right'].index, { scope: parseToolScope('transformationsLab:identify') }));
  // Every tool:mode entry names a surface and mode the registry resolves.
  for (const fixture of FIXTURES) {
    assert.ok(DEFAULT_TOOL_SCOPE.flatMap((entry) => parseToolScope(entry))
      .some((entry) => entry.tool === fixture.tool && (entry.mode === null || entry.mode === questionSurface(STORED[fixture.question]).mode)), fixture.tag);
  }
  assert.throws(() => parseToolScope(''), /at least one tool/);
  assert.throws(() => parseToolScope('graphing2:standard form'), /not tool or tool:mode/);
});

test('evidence for another attempt than the record counts is never replayed; a needs-teacher item is still listed', () => {
  const { fixture, index } = byTag['d-right'];
  const attempt = stored(fixture, index);
  const staleRecord = { ...attempt.record, lastSubmissionId: 'a-later-submission' };
  const result = planClassroomAttempt({ assignment: ASSIGNMENT, question: STORED.quotient, questionIndex: index, record: staleRecord, evidenceDocument: attempt.evidenceDocument, v5Index });
  assert.equal(result.classification, REGRADE_CLASS.NOT_REPLAYABLE);
  assert.equal(result.reason, 'no-evidence-for-the-recorded-attempt');
  // The same submission id, but another variant, or a record that has
  // counted a later attempt since: neither is the evidence's attempt.
  for (const record of [{ ...attempt.record, variantIndex: 1 }, { ...attempt.record, totalAttempts: Number(attempt.record.totalAttempts) + 1 }]) {
    const other = planClassroomAttempt({ assignment: ASSIGNMENT, question: STORED.quotient, questionIndex: index, record, evidenceDocument: attempt.evidenceDocument, v5Index });
    assert.equal(other.classification, REGRADE_CLASS.NOT_REPLAYABLE);
    assert.equal(other.reason, 'no-evidence-for-the-recorded-attempt');
  }
  const dol1 = byTag['f-dol1-new-right'];
  const dol1Attempt = stored(dol1.fixture, dol1.index);
  const noEvidence = planClassroomAttempt({ assignment: ASSIGNMENT, question: STORED.dol1, questionIndex: dol1.index, record: dol1Attempt.record, evidenceDocument: null, v5Index });
  assert.equal(noEvidence.classification, REGRADE_CLASS.NEEDS_TEACHER);
  assert.equal(noEvidence.new, null);
  // An unattempted record is not an attempt.
  assert.equal(planClassroomAttempt({ assignment: ASSIGNMENT, question: STORED.quotient, questionIndex: index, record: { status: 'unattempted' }, v5Index }), null);
});

test('a change on a question none of 2a–2f describes is reported apart, never as K\'s', () => {
  const { fixture, index } = byTag['f-control'];
  // Recorded as fully right, though change 3 is wrong for 7, 11, 15, ...: some
  // other grader would have had to say so.
  const attempt = stored(fixture, index, { grading: { ...oldGradingFor(fixture), isCorrect: true, score: 1 } });
  const result = planClassroomAttempt({ assignment: ASSIGNMENT, question: STORED.sequenceControl, questionIndex: index, record: attempt.record, evidenceDocument: attempt.evidenceDocument, v5Index });
  assert.equal(result.classification, REGRADE_CLASS.CHANGED_OUTSIDE_K);
  assert.equal(result.reason, 'lower');
  assert.deepEqual(result.defects, []);
});

test('an active teacher override is shown beside the attempt', () => {
  const { fixture, index } = byTag['d-right'];
  const attempt = stored(fixture, index);
  const override = { active: true, score: 100, totalAttempts: 1, variantIndex: 0, submissionId: attempt.record.lastSubmissionId, source: 'grantFullCredit' };
  const result = planClassroomAttempt({ assignment: ASSIGNMENT, question: STORED.quotient, questionIndex: index, record: attempt.record, evidenceDocument: attempt.evidenceDocument, override, v5Index });
  assert.deepEqual(result.override, { active: true, score: 100, source: 'grantFullCredit' });
  assert.equal(plan(fixture, index).override, null);
});

/* --- the fixtures are what the pre-K code stored and recorded ------------------- */

const DOL1_PATH = 'teacher-import-jsons/algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json';
const preKAvailable = (() => {
  try {
    execSync(`git cat-file -e ${PRE_K_COMMIT}^{commit}`, { cwd: repo, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

test('the stored shapes and the old verdicts are the pre-K code\'s own', { skip: preKAvailable ? false : `commit ${PRE_K_COMMIT} is not in this clone` }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'k-regrade-pre-k-'));
  try {
    execSync(`git archive ${PRE_K_COMMIT} functions/shared src ${DOL1_PATH} | tar -x -C "${dir}"`, { cwd: repo, stdio: ['ignore', 'ignore', 'inherit'] });
    // The old modules resolve their packages (mathjs, ...) from this checkout.
    symlinkSync(path.join(repo, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
    symlinkSync(path.join(repo, 'functions/node_modules'), path.join(dir, 'functions/node_modules'), 'dir');
    writeFileSync(path.join(dir, 'package.json'), readFileSync(path.join(repo, 'package.json')));
    const oldGrading = await import(pathToFileURL(path.join(dir, 'functions/shared/serverGrading/serverResponseGrading.mjs')).href);
    const { compileAuthoringIntentV5: oldCompile } = await import(pathToFileURL(path.join(dir, 'src/platform/contract/authoringIntentV5.js')).href);

    const compiled = (intent) => compileWith(oldCompile, intent);
    const imported = oldCompile(V5_SOURCE).package.sections[0].questions;
    assert.deepEqual(PRE_K_STORED.graphing2, imported[0]);
    assert.deepEqual(PRE_K_STORED.graphing2NoSource, compiled(INTENT_2A_NO_SOURCE));
    assert.deepEqual(PRE_K_STORED.bridge, imported[1]);
    assert.deepEqual(PRE_K_STORED.bridgeNoSource, compiled(INTENT_2B_NO_SOURCE));
    assert.deepEqual(PRE_K_STORED.inverseBranch, compiled(INTENT_2C_BRANCH));
    // DOL1 as the pre-K tree held it: the term items as first authored.
    const dol1 = oldCompile(JSON.parse(readFileSync(path.join(dir, DOL1_PATH), 'utf8'))).package.sections.flatMap((section) => section.questions);
    // The compiler drops, imported from the same source, and the lone one.
    ['parabola', 'parabolaOffset4', 'polynomial', 'signRational', 'signNumerator', 'signAuthoredPolynomial']
      .forEach((key, offset) => assert.deepEqual(PRE_K_STORED[key], imported[2 + offset], key));
    assert.deepEqual(PRE_K_STORED.signRationalNoSource, compiled(INTENT_SIGN_RATIONAL_NO_SOURCE));
    const dol1Item = (text) => dol1.find((question) => String(question.prompt).includes(text));
    assert.deepEqual(PRE_K_STORED.dol1, dol1Item('starts at 7 and each term is 4 more'));
    assert.deepEqual(PRE_K_STORED.dol1Geometric, dol1Item('starts at 3 and each term is twice'));

    const shape = (result) => ({
      graded: result.graded,
      isCorrect: result.isCorrect,
      score: result.score,
      parts: result.parts.map((part) => [part.id, part.isCorrect, part.isComplete, part.credit ?? null]),
    });
    for (const fixture of FIXTURES) {
      const old = oldGrading.gradeToolWork({ toolId: fixture.tool, question: STORED[fixture.question], work: fixture.work });
      assert.deepEqual(shape(oldGradingFor(fixture)), shape(old), `${fixture.tag}: the verdict the pre-K grader recorded`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/* --- the report against a database that refuses every write --------------------- */

const WRITE_METHODS = new Set(['set', 'update', 'delete', 'create', 'add', 'batch', 'runTransaction', 'bulkWriter', 'recursiveDelete', 'bundle']);
const pathOf = (field) => (typeof field === 'string' ? field.split('.') : [...field.segments]);
const pick = (data, fields) => {
  if (!fields) return structuredClone(data);
  const out = {};
  for (const field of fields) {
    const parts = pathOf(field);
    let source = data;
    for (const part of parts) source = source?.[part];
    if (source === undefined) continue;
    let target = out;
    parts.slice(0, -1).forEach((part) => { target[part] ??= {}; target = target[part]; });
    target[parts.at(-1)] = structuredClone(source);
  }
  return out;
};

// An in-memory Firestore with the read surface the report uses. Every object
// it hands out throws on a write method, and records the attempt.
const readOnlyStore = (documents) => {
  const attempts = [];
  const guard = (target, label) => new Proxy(target, {
    get(object, property) {
      if (WRITE_METHODS.has(property)) {
        return () => { attempts.push(`${label}.${String(property)}`); throw new Error(`write refused: ${label}.${String(property)}`); };
      }
      return object[property];
    },
  });
  const snapshot = (docPath, fields) => {
    const data = documents.get(docPath);
    return { id: docPath.split('/').at(-1), exists: data !== undefined, ref: { path: docPath }, data: () => (data === undefined ? undefined : pick(data, fields)) };
  };
  const query = (collectionPath, state = { fields: null, limit: Infinity, after: null }) => guard({
    select: (...fields) => query(collectionPath, { ...state, fields }),
    limit: (count) => query(collectionPath, { ...state, limit: count }),
    startAfter: (doc) => query(collectionPath, { ...state, after: doc }),
    get: async () => {
      let rows = [...documents.keys()]
        .filter((key) => key.startsWith(`${collectionPath}/`) && !key.slice(collectionPath.length + 1).includes('/'))
        .sort();
      if (state.after) rows = rows.slice(rows.indexOf(state.after.ref.path) + 1);
      return { docs: rows.slice(0, state.limit).map((key) => snapshot(key, state.fields)) };
    },
  }, `query(${collectionPath})`);
  const docRef = (docPath) => guard({
    id: docPath.split('/').at(-1),
    path: docPath,
    collection: (name) => collectionRef(`${docPath}/${name}`),
    get: async () => snapshot(docPath, null),
  }, `doc(${docPath})`);
  const collectionRef = (collectionPath) => guard({ ...query(collectionPath), doc: (id) => docRef(`${collectionPath}/${id}`) }, `collection(${collectionPath})`);
  const db = guard({
    collection: (name) => collectionRef(name),
    getAll: async (...args) => {
      const options = args.at(-1)?.fieldMask ? args.pop() : {};
      return args.map((ref) => snapshot(ref.path, options.fieldMask || null));
    },
  }, 'db');
  return { db, attempts };
};

const seededStore = () => {
  const docs = new Map();
  const questions = FIXTURES.map((fixture) => STORED[fixture.question]);
  // One question per fixture, as an assignment stores them (V5 sections).
  const assignment = (id, extra = {}) => ({
    title: `Assignment ${id}`, schemaVersion: 5,
    sections: [{ id: 'cw', role: 'classwork', title: 'Classwork', questions }], ...extra,
  });
  docs.set('assignments/A1', assignment('A1'));
  docs.set('assignments/A2', assignment('A2'));
  docs.set('assignments/TC', assignment('TC', { assessmentPolicy: { mode: 'testCycle' } }));
  docs.set('assignments/OTHER', { title: 'No tools', schemaVersion: 5, sections: [{ id: 'cw', role: 'classwork', questions: [{ type: 'literal', questionId: 'lit', acceptedAnswers: ['2'] }] }] });
  FIXTURES.forEach((fixture, index) => {
    const studentId = `stu-${String(index).padStart(2, '0')}-${fixture.tag}`;
    const grade = { displayName: 'never read', classId: 'class-1', gradesByAssignment: {}, teacherGradeOverridesByAssignment: {} };
    for (const assignmentId of ['A1', 'TC']) {
      const attempt = storedAttempt({
        assignmentId, questionIndex: index, question: STORED[fixture.question], response: toolResponseFor(fixture),
        grading: oldGradingFor(fixture), submissionId: `sub-${assignmentId}-${fixture.tag}`, at: AT,
      });
      grade.gradesByAssignment[assignmentId] = { [String(index)]: attempt.record };
      docs.set(`grades/${studentId}/responseInspectionEvidence/${attempt.evidenceDocumentId}`, attempt.evidenceDocument);
    }
    docs.set(`grades/${studentId}`, grade);
  });
  return readOnlyStore(docs);
};

test('the store really refuses writes (so the tests below would have caught one)', () => {
  const { db, attempts } = seededStore();
  assert.throws(() => db.collection('grades').doc('a').set({}), /write refused/);
  assert.throws(() => db.batch(), /write refused/);
  assert.throws(() => db.runTransaction(async () => {}), /write refused/);
  assert.equal(attempts.length, 3);
});

test('the report: by assignment, question and student id; counts; never a write; Test Cycles skipped', async () => {
  const { db, attempts } = seededStore();
  const report = await runClassroomRegradeReport({
    db, v5Sources: [{ path: 'k-regrade-source.json', payload: V5_SOURCE }], pageSize: 4, now: () => AT,
  });
  assert.deepEqual(attempts, []);
  assert.equal(report.readOnly, true);
  // What the list cannot show (My Math Path, the consolidated rewrite) rides in the detail.
  for (const note of REPORT_NOTES) assert.ok(report.notes.includes(note), note.slice(0, 40));
  assert.equal(report.counts.assignmentsRead, 4);
  assert.equal(report.counts.assignmentsSkippedTestCycle, 1);
  assert.equal(report.counts.assignmentsInScope, 2);
  assert.equal(report.counts.studentsRead, FIXTURES.length);
  assert.equal(report.counts.attemptsInScope, FIXTURES.length, 'A1 only: A2 has no attempts, TC is skipped');

  const expectedByClass = {};
  FIXTURES.forEach((fixture) => { expectedByClass[fixture.expect.classification] = (expectedByClass[fixture.expect.classification] || 0) + 1; });
  for (const [name, count] of Object.entries(report.counts.byClass)) assert.equal(count, expectedByClass[name] || 0, name);

  assert.deepEqual(report.assignments.map((entry) => entry.assignmentId), ['A1']);
  const listed = report.assignments[0].questions;
  const listedTags = listed.flatMap((question) => question.attempts.map((attempt) => attempt.studentId.replace(/^stu-\d\d-/, '')));
  const expectedTags = FIXTURES.filter((fixture) => fixture.expect.classification !== REGRADE_CLASS.UNCHANGED).map((fixture) => fixture.tag);
  assert.deepEqual(listedTags, expectedTags, 'every listed class, in question order; the unchanged negative controls are not listed');
  const order = listed.map((question) => question.questionIndex);
  assert.deepEqual(order, order.toSorted((a, b) => a - b));
  const dLower = listed.find((question) => question.attempts.some((attempt) => attempt.studentId.endsWith('d-lower'))).attempts[0];
  assert.equal(dLower.classification, REGRADE_CLASS.NOW_LOWER);
  assert.deepEqual([dLower.old.score, dLower.new.score], [100, 50]);
  assert.deepEqual(dLower.evidence.work.responses, { quotient: '((x-1)(x-5))/(x(x-5))' });
  assert.equal(dLower.classId, 'class-1');
  assert.doesNotMatch(JSON.stringify(report), /never read/, 'no name is read');
  assert.deepEqual(report.counts.byDefect[DEFECT.QUOTIENT], {
    [REGRADE_CLASS.CANDIDATE]: 1, [REGRADE_CLASS.NOW_LOWER]: 1, [REGRADE_CLASS.NEEDS_TEACHER]: 0, [REGRADE_CLASS.CHANGED_OUTSIDE_K]: 0,
  });
  assert.deepEqual(report.counts.byDefect[DEFECT.QUOTIENT_EXACT], {
    [REGRADE_CLASS.CANDIDATE]: 1, [REGRADE_CLASS.NOW_LOWER]: 0, [REGRADE_CLASS.NEEDS_TEACHER]: 0, [REGRADE_CLASS.CHANGED_OUTSIDE_K]: 0,
  });
  // Suspected drops no source settles, by hand: every chart without
  // numeratorFactors and no source for them (the three '≥' attempts, the
  // rational one with or without a source, the authored-'polynomial' one);
  // the authored-'polynomial' mode; the parabola whose offset IS the default.
  assert.deepEqual(report.counts.unconfirmedCompilerDefects, {
    [DEFECT.SIGN_NUMERATOR_DROPPED]: 6,
    [DEFECT.SIGN_RATIONAL_MODE_DROPPED]: 1,
    [DEFECT.PARABOLA_POINT_DROPPED]: 1,
  });
});

test('--assignment reads only the named assignments', async () => {
  const { db, attempts } = seededStore();
  const report = await runClassroomRegradeReport({ db, assignmentIds: ['A2', 'missing'], v5Sources: [], now: () => AT });
  assert.deepEqual(attempts, []);
  assert.equal(report.counts.assignmentsRead, 1);
  assert.equal(report.counts.attemptsInScope, 0);
  assert.deepEqual(report.assignmentFilter, ['A2', 'missing']);
});

test('V5 sources load from files and folders; a broken one is reported, not fatal', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'k-regrade-sources-'));
  try {
    writeFileSync(path.join(dir, 'good.json'), JSON.stringify(V5_SOURCE));
    writeFileSync(path.join(dir, 'broken.json'), '{ not json');
    writeFileSync(path.join(dir, 'notes.txt'), 'ignored');
    const sources = loadV5Sources([dir]);
    assert.deepEqual(sources.map((source) => [path.basename(source.path), Boolean(source.payload)]), [['broken.json', false], ['good.json', true]]);
    assert.throws(() => loadV5Sources([path.join(dir, 'absent')]), /does not exist/);
    // The repository's own teacher imports are the default and compile.
    const repoSources = loadV5Sources(['teacher-import-jsons']);
    assert.ok(repoSources.length >= 1 && repoSources.every((source) => source.payload));
    assert.deepEqual(indexV5Sources(repoSources).errors, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the script and the plan have no write mode and no Firestore write call', () => {
  for (const file of ['scripts/report-classroom-regrade-candidates.mjs', 'scripts/lib/classroomRegradePlan.mjs']) {
    const source = executableSource(readFileSync(path.join(repo, file), 'utf8'))
      // Not Firestore: app.delete() closes the Admin SDK's channels; Map.set
      // builds the in-memory index.
      .replace(/\bapp\.delete\(\)/g, 'app-close()')
      .replace(/\b(byKey|listed)\.set\(/g, 'map-set(');
    assert.doesNotMatch(source, /\.(set|update|delete|create|add|batch|runTransaction|bulkWriter|recursiveDelete)\(/, file);
    assert.doesNotMatch(source, /--execute|--write|--apply/, file);
  }
  assert.throws(() => parseReportArgs(['--project', 'p', '--execute']), /no write mode/);
  assert.throws(() => parseReportArgs(['--tools', 'graphing2']), /--project is required/);
  const parsed = parseReportArgs(['--project', 'p', '--tools', 'graphing2:standardForm,sequenceExplorer', '--assignment', 'a', '--assignment', 'a', '--v5-sources', 'x']);
  assert.deepEqual(parsed.scope, [{ tool: 'graphing2', mode: 'standardForm' }, { tool: 'sequenceExplorer', mode: null }]);
  assert.deepEqual([parsed.assignmentIds, parsed.v5Sources], [['a'], ['x']]);
  assert.equal(parseReportArgs(['--project', 'p']).scope.length, DEFAULT_TOOL_SCOPE.length);
  assert.throws(() => parseReportArgs(['--project', 'p', '--page-size', '0']), /--page-size/);
});

test('the report detail directory is gitignored', () => {
  assert.match(readFileSync(path.join(repo, '.gitignore'), 'utf8'), /^classroom-regrade-reports\/$/m);
});
