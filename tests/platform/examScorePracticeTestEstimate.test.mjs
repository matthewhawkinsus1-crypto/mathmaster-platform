import test from 'node:test';
import assert from 'node:assert/strict';

import { predictExamScoreFromPracticeTest, predictExamScoresFromMastery } from '../../src/platform/assessment/examScorePredictor.js';
import { EXAM_BENCHMARKS, EXAM_TYPES } from '../../src/platform/assessment/examDomainRegistry.js';

/*
 * A PRACTICE TEST READ ON THE REAL EXAM'S SCALE — AS A RANGE.
 *
 * The range is how honest the estimate is about resting on few questions. These
 * tests pin the properties a student relies on, not the arithmetic: fewer
 * questions → a wider range; a perfect (or empty) short test still gets a real
 * range; never narrower than the mastery projection's own margin; the benchmark
 * is the registry's; and nothing is ever labelled an official score.
 */

const predict = (examType, earned, possible, count = possible) => predictExamScoreFromPracticeTest({
  examType, earnedPoints: earned, possiblePoints: possible, questionCount: count,
});

test('fewer questions, wider range — for the same share correct', () => {
  const short = predict(EXAM_TYPES.DIGITAL_SAT, 5, 10);
  const full = predict(EXAM_TYPES.DIGITAL_SAT, 22, 44);
  assert.equal(short.estimatedScore, full.estimatedScore, 'same share, same centre');
  assert.ok(short.high - short.low > full.high - full.low, `10 questions (${short.low}–${short.high}) must be wider than 44 (${full.low}–${full.high})`);
  assert.ok(short.low <= short.estimatedScore && short.estimatedScore <= short.high);
});

test('a perfect or an empty short test still gets a real range, not one number', () => {
  const perfect = predict(EXAM_TYPES.DIGITAL_SAT, 5, 5);
  assert.equal(perfect.high, 800);
  assert.ok(perfect.low <= 700, `5 of 5 is not proof of an 800 (got ${perfect.low}–${perfect.high})`);
  const empty = predict(EXAM_TYPES.ACT, 0, 5);
  assert.equal(empty.low, 1);
  assert.ok(empty.high >= 6, `0 of 5 is not proof of a 1 (got ${empty.low}–${empty.high})`);
});

test('never narrower than the margin the mastery projection already uses', () => {
  // A full-length ACT: the statistical range is tight, the fixed ±2 is the floor.
  for (const [examType, margin] of [[EXAM_TYPES.DIGITAL_SAT, 30], [EXAM_TYPES.ACT, 2], [EXAM_TYPES.TSIA2, 15], [EXAM_TYPES.ASVAB, 7]]) {
    const result = predict(examType, 50, 100, 400);
    const { scoreMin, scoreMax } = EXAM_BENCHMARKS[examType];
    assert.ok(result.low <= Math.max(scoreMin, result.estimatedScore - margin), `${examType} low`);
    assert.ok(result.high >= Math.min(scoreMax, result.estimatedScore + margin), `${examType} high`);
  }
});

test('SAT range edges land on the SAT\'s 10-point steps, rounded outward', () => {
  for (const [earned, count] of [[3, 7], [5, 10], [17, 23], [30, 44]]) {
    const result = predict(EXAM_TYPES.DIGITAL_SAT, earned, count);
    assert.equal(result.low % 10, 0, `${earned}/${count} low ${result.low}`);
    assert.equal(result.high % 10, 0, `${earned}/${count} high ${result.high}`);
  }
});

test('the benchmark is the registry\'s, and where the range sits is stated, not a pass', () => {
  assert.equal(predict(EXAM_TYPES.DIGITAL_SAT, 5, 10).benchmarkTarget, EXAM_BENCHMARKS[EXAM_TYPES.DIGITAL_SAT].readinessThreshold);
  assert.equal(predict(EXAM_TYPES.DIGITAL_SAT, 5, 10).benchmarkPosition, 'straddles');
  assert.equal(predict(EXAM_TYPES.DIGITAL_SAT, 10, 10).benchmarkPosition, 'above');
  assert.equal(predict(EXAM_TYPES.DIGITAL_SAT, 0, 10).benchmarkPosition, 'below');
  assert.equal(predict(EXAM_TYPES.TSIA2, 12, 20).alternativeDiagnosticLevel, 6);
  // The ASVAB has no universal cut: null, never a 0 everyone clears.
  assert.equal(predict(EXAM_TYPES.ASVAB, 7, 10).benchmarkTarget, null);
  assert.equal(predict(EXAM_TYPES.ASVAB, 7, 10).benchmarkPosition, null);
});

test('every estimate says it is not an official score', () => {
  for (const examType of Object.values(EXAM_TYPES)) {
    const result = predict(examType, 6, 10);
    assert.equal(result.estimateType, 'practice_test_projection');
    assert.match(result.disclaimer, /not an official|not an AFQT/);
  }
});

test('nothing to estimate from gives no estimate', () => {
  assert.equal(predict('courseTest', 3, 5), null);
  assert.equal(predictExamScoreFromPracticeTest({ examType: EXAM_TYPES.ACT, earnedPoints: null, possiblePoints: 10, questionCount: 10 }), null);
  assert.equal(predictExamScoreFromPracticeTest({ examType: EXAM_TYPES.ACT, earnedPoints: 3, possiblePoints: 0, questionCount: 10 }), null);
  assert.equal(predictExamScoreFromPracticeTest({ examType: EXAM_TYPES.ACT, earnedPoints: 3, possiblePoints: 10, questionCount: 0 }), null);
});

test('the mastery projection is unchanged by the refactor that shares its scale', () => {
  const report = predictExamScoresFromMastery({ 'A.2B': { mastery: { estimate: 80 } } });
  assert.equal(report.digitalSAT.examTitle, 'Digital SAT Math');
  assert.equal(report.digitalSAT.scoreRange, `${report.digitalSAT.estimatedScore - 30} - ${report.digitalSAT.estimatedScore + 30}`);
  assert.equal(report.asvab.examTitle, 'ASVAB Math Preparation');
});
