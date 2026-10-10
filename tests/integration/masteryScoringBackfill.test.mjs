/*
 * THE MASTERY RESCORING BACKFILL, AGAINST A REAL FIRESTORE (emulator).
 *
 * scripts/backfill-mastery-scoring.mjs runMasteryBackfill with the Admin SDK:
 * the dry run reports and writes nothing; --execute rescores each question
 * once, reads My Math Path's post-answer reviews as they should have been
 * written (QA round 2, R2-M2), floors what would be lost, and a second run
 * writes nothing. Run through npm run test:challenge-finish (CI: full platform
 * suite).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run through npm run test:challenge-finish.');

const admin = require(path.join(repo, 'functions/node_modules/firebase-admin'));
if (!admin.apps.length) admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'mathmaster-finish-harness' });
const db = admin.firestore();
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));
const { runMasteryBackfill } = await import(path.join(repo, 'scripts/backfill-mastery-scoring.mjs'));
const { MASTERY_STATUS } = await import(path.join(repo, 'functions/shared/masteryRule.mjs'));

const NOW = Date.parse('2026-10-12T15:00:00Z');
const PREFIX = 'mbf-';

// What submitPathResponse wrote for a finalized Path answer before the fix.
const pathEvent = (studentId, instance, { correct = true, at, dok = 3, code = 'A.5A' }) => {
  const supportUsage = { hintUsed: false, scaffoldUsed: false, workedExampleUsed: true, teacherAssisted: false, calculatorUsed: false, modified: false, accommodations: [] };
  return {
    eventKey: `${studentId}-${instance}`, studentId, occurredAt: at, masteryEvidenceKeys: [`texas:${code}`],
    questionSnapshot: { questionInstanceId: instance, dok }, source: { kind: 'myMathPath', activityRole: 'practice' },
    performance: { score: correct ? 1 : 0, isCorrect: correct, attemptNumber: 1, status: 'finalized', isMathematicallyIndependent: false },
    supportUsage: { ...supportUsage, isMathematicallyIndependent: mathPath.mathematicalIndependence(supportUsage) },
  };
};

const seed = async () => {
  const batch = db.batch();
  // A Path-only learner: four right answers, all stored as "supported".
  const pathOnly = `${PREFIX}path`;
  batch.set(db.collection('grades').doc(pathOnly), { gradesByAssignment: {}, classId: 'c1' });
  ['a', 'b', 'c', 'd'].forEach((instance, index) => {
    batch.set(db.collection('grades').doc(pathOnly).collection('evidenceEvents').doc(`e-${instance}`), pathEvent(pathOnly, `${pathOnly}-${instance}`, { at: NOW - 86400000 + index }));
  });
  batch.set(db.collection('studentMasteryProfiles').doc(pathOnly), {
    studentId: pathOnly,
    profiles: { 'A.5A': { teksCode: 'A.5A', mastery: { estimate: 75, status: MASTERY_STATUS.SECURE }, accumulator: { effectiveWeight: 4, weightedScoreSum: 3, eligibleEvents: 4, modifiedEvents: 0, independentSuccesses: 0 }, dimensions: { eligibleGradeLevelEvents: 4, independentSuccesses: 0, dokRepresented: [3] } } },
  });
  // A student whose stored profile says more than their evidence supports:
  // the floor must hold it.
  const held = `${PREFIX}held`;
  batch.set(db.collection('grades').doc(held), { gradesByAssignment: {}, classId: 'c1' });
  batch.set(db.collection('grades').doc(held).collection('evidenceEvents').doc('e-x'), pathEvent(held, `${held}-x`, { correct: false, at: NOW - 1000 }));
  batch.set(db.collection('studentMasteryProfiles').doc(held), {
    studentId: held,
    profiles: { 'A.5A': { teksCode: 'A.5A', mastery: { estimate: 92, status: MASTERY_STATUS.MASTERED }, accumulator: { effectiveWeight: 6, weightedScoreSum: 5.5, eligibleEvents: 6, modifiedEvents: 0, independentSuccesses: 4 }, dimensions: { eligibleGradeLevelEvents: 6, independentSuccesses: 4, dokRepresented: [3] } } },
  });
  await batch.commit();
  return { pathOnly, held };
};

test('dry run reports and writes nothing; execute rescores and floors; a second run writes nothing', async () => {
  const { pathOnly, held } = await seed();
  const before = (await db.collection('studentMasteryProfiles').doc(pathOnly).get()).data();

  const dry = await runMasteryBackfill({ db, now: NOW, student: pathOnly });
  assert.equal(dry.mode, 'dry-run');
  assert.equal(dry.counts.wouldWrite, 1);
  assert.equal(dry.counts.pathReviewsReclassified, 4, 'the dry run reports the reclassified Path answers');
  assert.deepEqual((await db.collection('studentMasteryProfiles').doc(pathOnly).get()).data(), before, 'nothing written');

  const executed = await runMasteryBackfill({ db, now: NOW, student: pathOnly, execute: true });
  assert.equal(executed.counts.written, 1);
  const after = (await db.collection('studentMasteryProfiles').doc(pathOnly).get()).data();
  assert.equal(after.masteryScoring.pathReviewReclassified, true);
  assert.equal(after.profiles['A.5A'].accumulator.independentSuccesses, 4);
  assert.equal(after.profiles['A.5A'].mastery.status, MASTERY_STATUS.MASTERED);
  // The evidence itself is never rewritten.
  const event = (await db.collection('grades').doc(pathOnly).collection('evidenceEvents').doc('e-a').get()).data();
  assert.equal(event.supportUsage.workedExampleUsed, true);

  const heldRun = await runMasteryBackfill({ db, now: NOW, student: held, execute: true });
  assert.equal(heldRun.counts.written, 1);
  assert.equal(heldRun.counts.refused, 0);
  const heldEntry = (await db.collection('studentMasteryProfiles').doc(held).get()).data().profiles['A.5A'];
  assert.equal(heldEntry.mastery.status, MASTERY_STATUS.MASTERED, 'a floor holds what the student had');
  assert.equal(heldEntry.floor.status, MASTERY_STATUS.MASTERED);

  const rerun = await runMasteryBackfill({ db, now: NOW + 1, student: pathOnly, execute: true });
  assert.equal(rerun.counts.skippedAlreadyRescored, 1);
  assert.equal(rerun.counts.written, 0);
  assert.deepEqual((await db.collection('studentMasteryProfiles').doc(pathOnly).get()).data(), after, 'idempotent');
});
