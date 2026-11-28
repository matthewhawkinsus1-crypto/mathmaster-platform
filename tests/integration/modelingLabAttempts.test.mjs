// SUBMITMODELINGLAB: ATTEMPTS COUNTED PER STUDENT, ASSIGNMENT AND LAB, AGAINST
// REAL FIRESTORE.
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-lab-attempts \
//     --config tests/browser/emulator/firebase.json \
//     "node --import ./tests/integration/support/emulatorTransactions.mjs --test tests/integration/modelingLabAttempts.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and runs
// this file too.)
//
// The real exported callable proves:
//   * attempts are counted on a server ledger per (student, assignment, lab)
//     and capped at the server's limit, whatever submission ids the browser
//     sends; resending a counted submission returns that attempt again;
//   * each attempt's marker is keyed by the server's attempt number, and is
//     the one ingestion reads for the submissionId the callable returned;
//   * a closed assignment, and one not assigned to the student's class, are
//     refused before anything is written;
//   * the model-accuracy rubric line is returned only on the final attempt or
//     a mastered one, while the marker always keeps the whole evaluation.
//
// Every id starts with `mlab-`.

import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

import { db, fns, refusal, repo, studentRequest } from './canonicalPersistenceHarness.mjs';

const require = createRequire(import.meta.url);
const mathPath = require(path.join(repo, 'functions/lib/mathPath.js'));

const P = 'mlab-';
const CLASS_ID = `${P}class`;
const OTHER_CLASS_ID = `${P}class-other`;
const LAB_ID = `${P}lab`;
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();

const labDefinition = (assignmentId) => ({
  labId: LAB_ID,
  assignmentId,
  title: 'Spring constant',
  parameters: [{ id: 'k', label: 'k', min: 0, max: 10, step: 1 }],
  constraints: [],
  evaluation: { targetParameters: { k: 5 } },
  rubric: { minimumTrials: 1, minimumHypothesisWords: 1, minimumJustificationWords: 2, masteryThreshold: 0.85 },
  teksAlignments: [],
});

async function seed(name, { classIds = [CLASS_ID], dueAt = iso(Date.now() + 7 * DAY) } = {}) {
  const assignmentId = `${P}${name}`;
  const studentId = `${P}${name}-student`;
  const labId = `${LAB_ID}-${name}`;
  await db.collection('assignments').doc(assignmentId).set({
    title: `Lab ${name}`,
    assignedClassIds: classIds,
    releaseAt: iso(Date.now() - DAY),
    dueAt,
  });
  await db.collection('modelingLabDefinitions').doc(labId).set({ ...labDefinition(assignmentId), labId });
  await db.collection('grades').doc(studentId).set({ studentId, classId: CLASS_ID, classPeriod: 'Lab Period' });
  return { assignmentId, studentId, labId };
}

const submission = (k) => ({
  studentHypothesis: 'k is five',
  trialHistory: [{ trialNumber: 1, parameters: { k } }],
  finalParameterValues: { k },
  studentJustification: 'the trials show the spring settles at five',
});

const submit = ({ assignmentId, studentId, labId }, submissionId, k = 0) => fns.submitModelingLab.run(
  studentRequest(studentId, { assignmentId, labId, submissionId, submission: submission(k) }),
);

const markerRef = ({ assignmentId, studentId, labId }, submissionId) => db.collection('modelingLabSubmissions')
  .doc(mathPath.opaqueId('labsub', studentId, assignmentId, labId, submissionId));

let MAX = 0;
before(async () => {
  // Read the cap from the callable's own refusal, so the test follows the constant.
  const probe = await seed('probe');
  for (let index = 1; index <= 20; index += 1) {
    const outcome = await refusal(submit(probe, `probe-${index}`));
    if (outcome) {
      assert.equal(outcome.code, 'resource-exhausted');
      MAX = index - 1;
      break;
    }
  }
  assert.ok(MAX >= 1 && MAX < 20, 'the callable caps a student\'s attempts on one lab');
});

test('attempts are capped per student, assignment and lab, whatever submission ids the browser sends', async () => {
  const ids = await seed('cap');
  const results = [];
  for (let index = 1; index <= MAX; index += 1) results.push(await submit(ids, `browser-${index}`));
  assert.deepEqual(results.map((result) => result.attemptNumber), Array.from({ length: MAX }, (_, index) => index + 1));
  assert.equal(results.at(-1).attemptsRemaining, 0);
  const over = await refusal(submit(ids, 'browser-fresh-id'));
  assert.equal(over?.code, 'resource-exhausted', 'a new submission id does not buy another attempt');

  const markers = await db.collection('modelingLabSubmissions')
    .where('studentId', '==', ids.studentId).where('assignmentId', '==', ids.assignmentId).get();
  assert.equal(markers.docs.filter((doc) => doc.data().result?.evaluation).length, MAX, 'one marker per counted attempt');
});

test('resending a counted submission returns that attempt and counts nothing', async () => {
  const ids = await seed('retry');
  const first = await submit(ids, 'same-browser-id');
  const again = await submit(ids, 'same-browser-id');
  assert.equal(again.submissionId, first.submissionId);
  assert.equal(again.attemptNumber, 1);
  const second = await submit(ids, 'next-browser-id');
  assert.equal(second.attemptNumber, 2, 'the resend was not counted as an attempt');
});

test('the marker for the returned submissionId is the one ingestion reads, with the whole evaluation', async () => {
  const ids = await seed('marker');
  const result = await submit(ids, 'marker-browser-id');
  const marker = await markerRef(ids, result.submissionId).get();
  assert.ok(marker.exists, 'ingestion finds the marker by the submissionId the callable returned');
  assert.equal(typeof marker.data().result.evaluation.rubricBreakdown.modelAccuracy, 'number');
  assert.equal((await markerRef(ids, 'marker-browser-id').get()).exists, false, 'the browser id does not key the marker');
});

test('model accuracy is returned only on the final attempt or a mastered one', async () => {
  const ids = await seed('accuracy');
  const early = await submit(ids, 'acc-1', 0);
  assert.equal(early.evaluation.isMastered, false);
  if (MAX > 1) {
    assert.equal('modelAccuracy' in early.evaluation.rubricBreakdown, false, 'withheld before the final attempt');
    assert.equal(early.evaluation.modelAccuracyWithheld, true);
    assert.equal(typeof early.evaluation.rubricBreakdown.writtenJustificationCompleteness, 'number', 'the other lines stay');
  }
  let last = early;
  for (let index = 2; index <= MAX; index += 1) last = await submit(ids, `acc-${index}`, 0);
  assert.equal(typeof last.evaluation.rubricBreakdown.modelAccuracy, 'number', 'shown on the final attempt');

  const mastered = await submit(await seed('mastered'), 'mastered-1', 5);
  assert.equal(mastered.evaluation.isMastered, true);
  assert.equal(typeof mastered.evaluation.rubricBreakdown.modelAccuracy, 'number', 'shown once mastered');
});

test('a closed assignment is refused and nothing is written', async () => {
  const ids = await seed('closed', { dueAt: iso(Date.now() - 2 * DAY) });
  const outcome = await refusal(submit(ids, 'closed-1'));
  assert.equal(outcome?.code, 'failed-precondition');
  const markers = await db.collection('modelingLabSubmissions').where('studentId', '==', ids.studentId).get();
  assert.equal(markers.size, 0);
});

test('an assignment not assigned to the student\'s class is refused', async () => {
  const ids = await seed('other-class', { classIds: [OTHER_CLASS_ID] });
  const outcome = await refusal(submit(ids, 'other-1'));
  assert.equal(outcome?.code, 'permission-denied');
});
