/*
 * MY MATH PATH'S POST-ANSWER REVIEW IS NOT SUPPORT FOR THAT ANSWER
 * (release-candidate QA round 2, R2-M2; student push I follow-up).
 *
 * submitPathResponse stored `workedExampleUsed: reviewReleased`, and the
 * review is released by the attempt that closes the question, so every Path
 * answer read as supported. The owner-run backfill reads that history as it
 * should have been written; these tests pin when it may and may not.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { reclassifyPathReviewEvidence } from '../../functions/shared/pathReviewReclassification.mjs';
import { planStudentMasteryBackfill } from '../../scripts/lib/masteryScoringBackfill.mjs';
import { MASTERY_STATUS } from '../../functions/shared/masteryRule.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const mathPath = createRequire(import.meta.url)('../../functions/lib/mathPath.js');
const NOW = Date.parse('2026-10-12T15:00:00Z');

// Exactly what submitPathResponse wrote (functions/index.js): the review of
// the finalizing attempt marked as a worked example, independence false.
const pathAnswer = ({ instance, attempt = 1, correct = true, finalized = true, hint = false, teacher = false, at = 1000, dok = 3, code = 'A.5A', worked = finalized }) => {
  const supportUsage = { hintUsed: hint, scaffoldUsed: hint, workedExampleUsed: worked, teacherAssisted: teacher, calculatorUsed: false, modified: false, accommodations: [] };
  const independent = mathPath.mathematicalIndependence(supportUsage);
  return {
    id: `ev-${instance}-${attempt}`,
    evidence: {
      eventKey: `ev-${instance}-${attempt}`,
      occurredAt: at,
      masteryEvidenceKeys: [`texas:${code}`],
      questionSnapshot: { questionInstanceId: instance, dok },
      source: { kind: 'myMathPath', activityRole: 'practice' },
      performance: { score: correct ? 1 : 0, isCorrect: correct, attemptNumber: attempt, status: finalized ? 'finalized' : 'attempted', isMathematicallyIndependent: independent },
      supportUsage: { ...supportUsage, isMathematicallyIndependent: independent },
    },
  };
};

test('the recorded bug: every finalized Path answer read as supported', () => {
  const event = pathAnswer({ instance: 'q1' });
  assert.equal(event.evidence.supportUsage.isMathematicallyIndependent, false);
  // And the line that wrote it is the one this reads around.
  const submit = region(executableSource(readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8')), 'const reviewReleased =', 'const independent = mathPath.mathematicalIndependence(supportUsage);', 'path support usage');
  assert.match(submit, /Boolean\(attemptSupport\.solutionReview\)/, 'the review counted is the one this attempt released');
});

test('a review released by the finalizing answer is not support: reclassified independent', () => {
  const { events, counts } = reclassifyPathReviewEvidence([pathAnswer({ instance: 'q1' })], mathPath);
  assert.deepEqual(counts, { pathEvents: 1, reclassified: 1, anomalies: 0 });
  assert.equal(events[0].evidence.supportUsage.workedExampleUsed, false);
  assert.equal(events[0].evidence.supportUsage.isMathematicallyIndependent, true);
  assert.equal(events[0].evidence.performance.isMathematicallyIndependent, true);
});

test('real support stays: a hint released before the answer, or a teacher\'s help', () => {
  const hinted = pathAnswer({ instance: 'q2', attempt: 3, hint: true });
  const helped = pathAnswer({ instance: 'q3', teacher: true });
  const { events, counts } = reclassifyPathReviewEvidence([hinted, helped], mathPath);
  assert.equal(counts.reclassified, 2, 'the worked-example flag is cleared on both');
  events.forEach((entry) => assert.equal(entry.evidence.supportUsage.isMathematicallyIndependent, false, 'but they are still not independent'));
});

test('only when the record proves the review came with the answer, never before it', () => {
  // A worked example on an attempt that did not close the question, or on
  // one after an earlier attempt already carried one: left as they are. A
  // missed first try then a right second try: the second is reclassified.
  const notFinal = pathAnswer({ instance: 'q4', attempt: 1, finalized: false, worked: true });
  const later = [pathAnswer({ instance: 'q5', attempt: 1, finalized: false, correct: false }), pathAnswer({ instance: 'q5', attempt: 2 })];
  const earlier = [pathAnswer({ instance: 'q6', attempt: 1, finalized: false, worked: true }), pathAnswer({ instance: 'q6', attempt: 2 })];
  const { events, counts } = reclassifyPathReviewEvidence([notFinal, ...later, ...earlier], mathPath);
  assert.equal(counts.reclassified, 1, 'only q5 attempt 2');
  assert.equal(counts.anomalies, 3);
  assert.equal(events.find((entry) => entry.id === 'ev-q5-2').evidence.supportUsage.isMathematicallyIndependent, true);
  ['ev-q4-1', 'ev-q5-1', 'ev-q6-1', 'ev-q6-2'].forEach((id) => assert.deepEqual(events.find((entry) => entry.id === id), [notFinal, ...later, ...earlier].find((entry) => entry.id === id)));
  // A finalized attempt that is not the last on record (a corrupt history).
  const stale = [pathAnswer({ instance: 'q7', attempt: 1 }), pathAnswer({ instance: 'q7', attempt: 2, worked: false })];
  const staleResult = reclassifyPathReviewEvidence(stale, mathPath);
  assert.equal(staleResult.counts.reclassified, 0);
  assert.deepEqual(staleResult.events, stale);
  // Assignment evidence is never touched.
  const assignment = pathAnswer({ instance: 'a1' });
  assignment.evidence.source = { kind: 'assignment', assignmentId: 'x', activityRole: 'practice' };
  assert.deepEqual(reclassifyPathReviewEvidence([assignment], mathPath).events[0], assignment);
});

test('through the backfill: a Path-only learner\'s four right answers become Mastered, and nothing is lowered', () => {
  const events = ['a', 'b', 'c', 'd'].map((instance, index) => pathAnswer({ instance, at: 1000 + index }));
  // The document the old trigger built from that history: no independent success.
  const stored = { studentId: 's', profiles: { 'A.5A': { teksCode: 'A.5A', mastery: { estimate: 75, status: MASTERY_STATUS.SECURE }, accumulator: { effectiveWeight: 4, weightedScoreSum: 3, eligibleEvents: 4, modifiedEvents: 0, independentSuccesses: 0 }, dimensions: { eligibleGradeLevelEvents: 4, independentSuccesses: 0, dokRepresented: [3] } } } };
  const plan = planStudentMasteryBackfill({ studentId: 's', stored, events, student: { id: 's', gradesByAssignment: {} }, assignments: [], helpers: mathPath, now: NOW });
  assert.equal(plan.action, 'write');
  assert.deepEqual(plan.violations, []);
  assert.equal(plan.pathReview.reclassified, 4);
  const entry = plan.document.profiles['A.5A'];
  assert.equal(entry.accumulator.independentSuccesses, 4);
  assert.equal(entry.mastery.estimate, 100);
  assert.equal(entry.mastery.status, MASTERY_STATUS.MASTERED);
  assert.equal(plan.document.masteryScoring.pathReviewReclassified, true);
  assert.equal(plan.document.masteryScoring.pathReviewEventsReclassified, 4);
});

test('a document rescored before the reclassification is planned once more; after it, skipped', () => {
  const events = ['a', 'b'].map((instance, index) => pathAnswer({ instance, at: 1000 + index }));
  const firstPass = { studentId: 's', profiles: {}, masteryScoring: { version: 2, rescoredAt: 1 } };
  const plan = planStudentMasteryBackfill({ studentId: 's', stored: firstPass, events, student: { id: 's', gradesByAssignment: {} }, assignments: [], helpers: mathPath, now: NOW });
  assert.equal(plan.action, 'write');
  const again = planStudentMasteryBackfill({ studentId: 's', stored: plan.document, events, student: { id: 's', gradesByAssignment: {} }, assignments: [], helpers: mathPath, now: NOW + 1 });
  assert.equal(again.action, 'skip');
});
