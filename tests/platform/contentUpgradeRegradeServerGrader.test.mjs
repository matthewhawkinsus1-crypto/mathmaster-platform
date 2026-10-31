// GR07: A CONTENT UPGRADE RE-MARKS A MULTI-ANSWER PART WITH THE SERVER'S GRADER.
//
// When a newer release of a live assignment only widens what a question
// accepts (more accepted answers, a wider tolerance), the upgrade re-marks the
// work students already saved (assignmentContentTrackerMigration.js). A
// multi-answer part used to be re-marked by a reader of its own: the answer's
// text, or a number within a `tolerance` key no grader reads. It refused the
// same answer in another spelling, never read `numericTolerance` (what the
// graders read), and credited numbers the server refuses. It is now marked by
// the server's own multi-answer grader (ordinaryResponseGrading.mjs
// gradeMultiAnswerResponse, what ingestion and the deadline finalizer run),
// against the upgraded question: a part is credited exactly when the server
// would credit the same response today.
//
// The other two upgrade regrades keep their rules by design, recorded at the
// code: a safe response control credits a complete part of a box that is now
// a choice (the old free-text box could not be read, as the browser's live
// correction credits it), and a Systems Workspace upgrade re-marks nothing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { executableSource } from './helpers/sourceContract.mjs';

const require = createRequire(import.meta.url);
const { buildContentUpgradePlan } = require('../../functions/lib/assignmentContentVersion.js');
const {
  loadServerGrading,
  migrateTrackerForContentUpgrade,
} = require('../../functions/lib/assignmentContentTrackerMigration.js');

const assignment = (id, version, field, extra = {}) => ({
  id,
  schemaVersion: 5,
  assignmentRevision: 1,
  contentLineage: { familyId: 'regrade-family', version },
  sections: [{
    id: 'practice',
    role: 'practice',
    title: 'Practice',
    questions: [{ questionId: 'q1', type: 'multiAnswer', prompt: 'Measure the side.', answerFields: [field], ...extra }],
  }],
});

// The saved work of one student: one complete, wrong part.
const savedWork = (response) => ({
  0: {
    status: 'attempted',
    attemptCount: 1,
    totalAttempts: 1,
    partialCredit: 0,
    bestPartialCredit: 0,
    partGrades: [{ id: 'side', label: 'Side', isComplete: true, isCorrect: false, credit: 0, weight: 1, response }],
  },
});

const upgrade = async ({ before, after, response, extra = {}, withGrader = true }) => {
  const plan = await buildContentUpgradePlan({
    liveAssignment: assignment('live', 1, before, extra),
    targetAssignment: assignment('release', 2, after, extra),
  });
  assert.equal(plan.changes[0].classification, 'gradingExpansion', 'the release only widens what is accepted');
  const serverGrading = withGrader ? await loadServerGrading() : undefined;
  return migrateTrackerForContentUpgrade({ tracker: savedWork(response), plan, correctedAt: '2026-10-25T12:00:00.000Z', serverGrading })
    .tracker[0];
};

test('an added accepted answer credits the same answer in another spelling, as the server grader reads it', async () => {
  const before = { id: 'side', label: 'Side', answer: '5', inputProfile: 'text' };
  const after = { ...before, acceptedAnswers: ['5 cm'] };
  const credited = await upgrade({ before, after, response: '5cm' });
  assert.equal(credited.status, 'correct');
  assert.equal(credited.bestPartialCredit, 100);
  assert.deepEqual([credited.partGrades[0].isCorrect, credited.partGrades[0].contentVersionRegraded], [true, true]);
  // A wrong answer stays wrong.
  const wrong = await upgrade({ before, after, response: '7 cm' });
  assert.equal(wrong.status, 'attempted');
  assert.equal(wrong.partGrades[0].isCorrect, false);
});

test('a wider numericTolerance credits what the graders now accept; a tolerance no grader reads credits nothing', async () => {
  const before = { id: 'side', label: 'Side', answer: '12', inputProfile: 'number' };
  const widened = await upgrade({ before: { ...before, numericTolerance: 0 }, after: { ...before, numericTolerance: 0.5 }, response: '12.4' });
  assert.equal(widened.status, 'correct', 'the graders read numericTolerance');
  // `tolerance` on a field is not read by any grader, so 13 is still wrong for
  // 12 when a student submits it; the regrade agrees instead of crediting it.
  const unread = await upgrade({ before: { ...before, tolerance: 0 }, after: { ...before, tolerance: 2 }, response: '13' });
  assert.equal(unread.status, 'attempted');
  assert.equal(unread.partGrades[0].isCorrect, false);
});

test('without the server grader, or for a question the server cannot mark from its stored copy, the record is kept as it was', async () => {
  const before = { id: 'side', label: 'Side', answer: '5', inputProfile: 'text' };
  const after = { ...before, acceptedAnswers: ['5 cm'] };
  const unloaded = await upgrade({ before, after, response: '5cm', withGrader: false });
  assert.deepEqual(unloaded, savedWork('5cm')[0]);
  // A generated question: what the student answered is not the stored key.
  const generated = await upgrade({ before, after, response: '5cm', extra: { generator: { kind: 'linear' } } });
  assert.deepEqual(generated, savedWork('5cm')[0]);
});

test('both upgrade callables (Content V2 upgrade, teacher repair) pass the server grader into the migration', () => {
  const index = executableSource(readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8'));
  const calls = index.split('assignmentContentTrackerMigration.migrateTrackerForContentUpgrade({').slice(1);
  assert.equal(calls.length, 2, 'the two callers');
  const before = index.split('assignmentContentTrackerMigration.migrateTrackerForContentUpgrade({').slice(0, -1);
  calls.forEach((call, index_) => {
    const argument = call.slice(0, call.indexOf('});'));
    assert.match(argument, /\n\s*serverGrading,\n/, `call ${index_ + 1} passes serverGrading`);
    assert.match(before[index_].slice(-600), /const serverGrading = await assignmentContentTrackerMigration\.loadServerGrading\(\);/, `call ${index_ + 1} loads it first`);
  });
});
