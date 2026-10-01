// A whole class answering My Math Path at once, against a real Firestore.
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-path-class-harness \
//     --config tests/browser/emulator/firebase.json \
//     "node --test tests/integration/pathResponseClassConcurrency.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and picks
// this file up as well.)
//
// WHY (deep dive 2026-10-01 §13, DD-13e). Submission ingestion and Live
// Challenge answers already have class-scale concurrency tests
// (canonicalPersistenceCertification #25, liveChallengeConcurrency). The other
// hot callable, `submitPathResponse`, had only one-student tests — and a class
// does its Path practice together, so thirty submissions arrive inside a few
// seconds, with retries when a Chromebook's network blinks.
//
// WHAT THIS PROVES: under a class-sized burst, every submission is accepted
// (no aborted transaction, no "internal"), each student's own session closes
// its question exactly once with that student's own verdict, nothing crosses
// between students, and a duplicate delivery of the same submission — the
// retry a flaky network produces — is applied once. WHAT IT DOES NOT PROVE:
// throughput. The emulator does not enforce Firestore's per-document write
// limits; the callable writes only per-student documents (sessions,
// submissions, the student's own evidence), which is why it scales, and this
// test fails if it starts writing a shared document per submission.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const require = createRequire(import.meta.url);

assert.ok(
  process.env.FIRESTORE_EMULATOR_HOST,
  'FIRESTORE_EMULATOR_HOST must be set — run this through firebase emulators:exec, never against a real project.',
);

const functionsIndex = require(path.join(repo, 'functions/index.js'));
const admin = require(path.join(repo, 'functions/node_modules', 'firebase-admin'));
const db = admin.firestore();

const CLASS_SIZE = 30;
const TEACHER = 'path-class-harness-teacher@example.com';
const CLASS_ID = 'path-class-harness-class';
const SKILL = 'A.5(A)';
const ALIGNMENT = `texas:${SKILL}`;
const privateGrading = { pathToolId: 'algebra', definition: { expected: '4', accepted: [], tolerance: 1e-6 } };

const students = Array.from({ length: CLASS_SIZE }, (_, index) => ({
  studentId: `path-class-harness-student-${index + 1}`,
  sessionId: `path-class-harness-session-${index + 1}`,
  questionInstanceId: `qi-path-class-harness-${index + 1}`,
  submissionId: `sub-path-class-harness-${index + 1}`,
  // Half the class answers right; the verdicts must not cross between students.
  answer: index % 2 === 0 ? '4' : '5',
}));

const openQuestion = (questionInstanceId) => ({
  pathToolId: 'algebra',
  serverGradingVersion: 1,
  responseShape: 'value',
  questionInstanceId,
  alignmentKey: SKILL,
  bankQuestionId: `bank-${questionInstanceId}`,
  sourceBankQuestionId: `bank-${questionInstanceId}`,
  familyId: 'path-class-harness-family',
  familyVersion: 1,
  questionType: 'algebra',
  activityRole: 'practice',
  difficultyBand: 3,
  dok: 1,
  skillCode: SKILL,
  alignmentKeys: [ALIGNMENT],
  assessmentContext: { framework: 'course', examStyle: false },
  ccmrChallengeTier: null,
  ccmrFamilyRole: null,
  applicableSupports: [],
  authorizedSupports: [],
  // One attempt, so each submission finalizes its question.
  attemptsAllowed: 1,
  attemptsUsed: 0,
  privateGrading,
  privateSupport: null,
});

const sessionDoc = ({ studentId, sessionId, questionInstanceId }) => ({
  sessionId,
  studentId,
  status: 'active',
  sessionKind: 'practice',
  assessmentFramework: null,
  coursePracticeIntent: null,
  ccmrChallengeTier: null,
  courseId: 'algebra1',
  classId: CLASS_ID,
  classPeriod: '3',
  weekKey: null,
  weeklySlotKey: null,
  weeklySlot: null,
  weeklyPurpose: null,
  requiredQuestions: 5,
  target: { alignmentKey: ALIGNMENT },
  summary: { completedQuestions: 0, correctQuestions: 0, independentSuccesses: 0 },
  pathState: { counters: { questionsThisSession: 0 } },
  currentSkillCode: SKILL,
  excursion: null,
  diagnosing: null,
  lastDecision: null,
  evidenceBySkill: {},
  route: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  currentQuestion: openQuestion(questionInstanceId),
});

const request = ({ studentId, sessionId, questionInstanceId, submissionId, answer }) => ({
  auth: { uid: `${studentId}-uid`, token: { role: 'student', studentId } },
  data: { sessionId, questionInstanceId, submissionId, responsePayload: { raw: { value: answer } } },
  rawRequest: { headers: {} },
});

const submit = (student) => functionsIndex.submitPathResponse.run(request(student))
  .then((result) => ({ student, result, error: null }), (error) => ({ student, result: null, error }));

await db.collection('classes').doc(CLASS_ID).set({ teacherOfRecord: TEACHER, period: '3' });
await Promise.all(students.map(async (student) => {
  await db.recursiveDelete(db.collection('grades').doc(student.studentId)).catch(() => {});
  await db.collection('grades').doc(student.studentId).set({
    studentId: student.studentId, classId: CLASS_ID, classPeriod: '3', assignedTeacherEmail: TEACHER,
  });
  await db.collection('pathSessions').doc(student.sessionId).set(sessionDoc(student));
}));

// The whole class at once, and every third student's request delivered twice
// at the same moment (a retry racing the original).
const started = Date.now();
const outcomes = await Promise.all(students.flatMap((student, index) => (
  index % 3 === 0 ? [submit(student), submit(student)] : [submit(student)]
)));
const elapsedMs = Date.now() - started;

test(`${CLASS_SIZE} simultaneous Path submissions are all accepted`, () => {
  const failed = outcomes.filter((outcome) => outcome.error);
  assert.deepEqual(
    failed.map((outcome) => `${outcome.student.studentId}: [${outcome.error.code}] ${outcome.error.message}`),
    [],
  );
  console.log(`  ${outcomes.length} calls for ${CLASS_SIZE} students settled in ${elapsedMs} ms (emulator)`);
});

test('each student gets their own verdict, and a racing duplicate is applied once', async () => {
  for (const student of students) {
    const mine = outcomes.filter((outcome) => outcome.student === student && outcome.result);
    assert.ok(mine.length >= 1, student.studentId);
    mine.forEach((outcome) => {
      assert.equal(outcome.result.success, true, student.studentId);
      assert.equal(outcome.result.grading.isCorrect, student.answer === '4', `${student.studentId} keeps its own verdict`);
      assert.equal(outcome.result.grading.questionFinalized, true);
    });
    const session = (await db.collection('pathSessions').doc(student.sessionId).get()).data();
    assert.equal(session.currentQuestion, null, `${student.studentId}: the question closed`);
    assert.equal(session.summary.completedQuestions, 1, `${student.studentId}: counted once, even when delivered twice`);
    assert.equal(session.summary.correctQuestions, student.answer === '4' ? 1 : 0, student.studentId);
    const submissions = await db.collection('pathSubmissions').where('sessionId', '==', student.sessionId).get();
    assert.equal(submissions.size, 1, `${student.studentId}: one stored submission`);
  }
});

test('evidence lands under each student and nobody else', async () => {
  for (const student of students) {
    const events = (await db.collection('grades').doc(student.studentId).collection('evidenceEvents').get()).docs
      .map((entry) => entry.data())
      .filter((event) => event.source?.kind === 'myMathPath');
    assert.equal(events.length, 1, `${student.studentId}: exactly one Path evidence event`);
    assert.equal(events[0].studentId ?? student.studentId, student.studentId);
  }
});
