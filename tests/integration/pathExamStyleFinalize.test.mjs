// Finalize a real exam-style My Math Path question against a real Firestore.
//
// HOW TO RUN:
//   firebase emulators:exec --only firestore --project mathmaster-path-exam-harness \
//     --config tests/browser/emulator/firebase.json \
//     "node --test tests/integration/pathExamStyleFinalize.test.mjs"
// (`npm run test:challenge-finish` globs tests/integration/*.test.mjs and picks
// this file up as well.)
//
// WHY. `submitPathResponse` declared `const activeSkillCode` inside the
// `if (questionFinalized) { ... }` routing block, and then read it again in a
// SIBLING block — the CCMR direct-evidence write for SAT/ACT/TSIA2/ASVAB
// questions. Block scope made that a ReferenceError inside the transaction, so
// every finalized exam-style question failed with a generic "internal" error and
// no evidence, no progress and no session update landed. Nothing caught it:
// no unit test runs the callable, and the path only executes when a question is
// both exam-style AND finalized.
//
// This runs the real exported Cloud Function with a synthetic student auth
// context (v2 onCall exposes `.run`, so no production code is changed to make
// it testable) against the Firestore emulator, then reads back what landed.
//
// The seed is the smallest session `submitPathResponse` accepts, shaped like the
// one `startPathSession` + `issueNextPathQuestion` write: an active session with
// an open `currentQuestion` whose `privateGrading` uses the `algebra` tool
// contract (`{ expected }` graded against `{ raw: { value } }`) — the simplest
// server grader there is, so the only thing under test is what happens AFTER
// grading.

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

const requireFunctionsModule = (specifier) => {
  try {
    return require(path.join(repo, 'functions/node_modules', specifier));
  } catch (error) {
    if (error?.code === 'MODULE_NOT_FOUND') {
      throw new Error(
        `${specifier} is not installed. Run \`npm --prefix functions ci\` before this suite — `
        + 'it loads the real Cloud Functions, whose dependencies live in functions/.',
      );
    }
    throw error;
  }
};

// functions/index.js calls initializeApp() at module load, so it is required
// FIRST and owns the default app.
const functionsIndex = require(path.join(repo, 'functions/index.js'));
const admin = requireFunctionsModule('firebase-admin');
const db = admin.firestore();

// `withPathCallableDiagnostics` turns any non-HttpsError into
// HttpsError("internal") and logs the real cause. Without this, a regression
// reads as "internal" with a diagnostic id and nothing else. Resolve the logger
// exactly as functions/index.js does, so this is the same module instance, and
// keep what it is asked to log so a failure can name the actual exception.
const functionsLogger = createRequire(path.join(repo, 'functions/index.js'))('firebase-functions/logger');
const loggedFailures = [];
const originalLoggerError = functionsLogger.error;
functionsLogger.error = (...args) => {
  loggedFailures.push(args);
  return originalLoggerError.apply(functionsLogger, args);
};

const TEACHER = 'path-exam-harness-teacher@example.com';
const CLASS_ID = 'path-exam-harness-class';
const SKILL = 'A.5(A)';
const ALIGNMENT = `texas:${SKILL}`;
// One of the frameworks normalizePathAssessmentFramework accepts. A value it
// rejects ("sat") would skip the CCMR block entirely and guard nothing.
const FRAMEWORK = 'digitalSAT';

const EXAM = {
  studentId: 'path-exam-harness-sat-student',
  sessionId: 'path-exam-harness-sat-session',
  questionInstanceId: 'qi-path-exam-harness-sat',
  submissionId: 'sub-path-exam-harness-sat-1',
};
const COURSE = {
  studentId: 'path-exam-harness-course-student',
  sessionId: 'path-exam-harness-course-session',
  questionInstanceId: 'qi-path-exam-harness-course',
  submissionId: 'sub-path-exam-harness-course-1',
};

const studentRequest = (studentId, data) => ({
  auth: { uid: `${studentId}-uid`, token: { role: 'student', studentId } },
  data,
  rawRequest: { headers: {} },
});

// The `algebra` tool contract: the private definition holds the answer; the
// browser sends only the value the student typed.
const privateGrading = { pathToolId: 'algebra', definition: { expected: '4', accepted: [], tolerance: 1e-6 } };
const correctResponse = { raw: { value: '4' } };

const openQuestion = ({ questionInstanceId, examStyle }) => ({
  pathToolId: 'algebra',
  serverGradingVersion: 1,
  responseShape: 'value',
  questionInstanceId,
  alignmentKey: SKILL,
  bankQuestionId: `bank-${questionInstanceId}`,
  sourceBankQuestionId: `bank-${questionInstanceId}`,
  familyId: 'path-exam-harness-family',
  familyVersion: 1,
  questionType: 'algebra',
  activityRole: 'practice',
  difficultyBand: 3,
  dok: 1,
  skillCode: SKILL,
  alignmentKeys: [ALIGNMENT],
  assessmentContext: examStyle
    ? { framework: FRAMEWORK, examStyle: true }
    : { framework: 'course', examStyle: false },
  ccmrChallengeTier: examStyle ? 1 : null,
  ccmrFamilyRole: examStyle ? 'direct' : null,
  applicableSupports: [],
  authorizedSupports: [],
  // One attempt, so the first submission finalizes the question whether or
  // not it is correct — the condition under which the defect fired.
  attemptsAllowed: 1,
  attemptsUsed: 0,
  privateGrading,
  privateSupport: null,
});

const sessionDoc = ({ studentId, sessionId, questionInstanceId, examStyle }) => ({
  sessionId,
  studentId,
  status: 'active',
  sessionKind: 'practice',
  assessmentFramework: examStyle ? FRAMEWORK : null,
  coursePracticeIntent: null,
  ccmrChallengeTier: examStyle ? 1 : null,
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
  currentQuestion: openQuestion({ questionInstanceId, examStyle }),
});

const seedStudent = async ({ studentId, sessionId, questionInstanceId, examStyle }) => {
  await db.recursiveDelete(db.collection('grades').doc(studentId)).catch(() => {});
  await db.collection('pathSessions').doc(sessionId).delete().catch(() => {});
  const priorSubmissions = await db.collection('pathSubmissions').where('sessionId', '==', sessionId).get();
  await Promise.all(priorSubmissions.docs.map((entry) => entry.ref.delete()));

  await db.collection('grades').doc(studentId).set({
    studentId,
    classId: CLASS_ID,
    classPeriod: '3',
    assignedTeacherEmail: TEACHER,
  });
  await db.collection('pathSessions').doc(sessionId).set(sessionDoc({ studentId, sessionId, questionInstanceId, examStyle }));
};

const submit = async ({ studentId, sessionId, questionInstanceId, submissionId }) => {
  const logStart = loggedFailures.length;
  try {
    const result = await functionsIndex.submitPathResponse.run(studentRequest(studentId, {
      sessionId, questionInstanceId, submissionId, responsePayload: correctResponse,
    }));
    return { result, error: null, logged: [] };
  } catch (error) {
    return { result: null, error, logged: loggedFailures.slice(logStart) };
  }
};

// The cause, as the callable's own diagnostic logged it, so a red run says
// "ReferenceError: activeSkillCode is not defined" rather than "internal".
const describeFailure = (outcome) => {
  if (!outcome.error) return '';
  const causes = outcome.logged
    .map((args) => args.find((arg) => arg && typeof arg === 'object' && 'message' in arg))
    .filter(Boolean)
    .map((meta) => `${meta.message}\n${String(meta.stack || '').split('\n').slice(0, 3).join('\n')}`);
  return `submitPathResponse rejected: [${outcome.error.code}] ${outcome.error.message}`
    + (causes.length ? `\nunderlying cause logged by withPathCallableDiagnostics:\n${causes.join('\n---\n')}` : '');
};

const ccmrProgressDocs = async (studentId) => (
  (await db.collection('grades').doc(studentId).collection('ccmrProgress').get()).docs.map((entry) => entry.data())
);

const pathEvidence = async (studentId) => (
  (await db.collection('grades').doc(studentId).collection('evidenceEvents').get()).docs
    .map((entry) => entry.data())
    .filter((event) => event.source?.kind === 'myMathPath')
);

await db.collection('classes').doc(CLASS_ID).set({ teacherOfRecord: TEACHER, period: '3' });
await seedStudent({ ...EXAM, examStyle: true });
await seedStudent({ ...COURSE, examStyle: false });

const examOutcome = await submit(EXAM);
const courseOutcome = await submit(COURSE);

test('a finalized exam-style (digitalSAT) question is graded without a server error', () => {
  assert.equal(examOutcome.error, null, describeFailure(examOutcome));
  assert.equal(examOutcome.result.success, true);
  assert.equal(examOutcome.result.grading.isCorrect, true);
  assert.equal(examOutcome.result.grading.questionFinalized, true);
  assert.equal(examOutcome.result.grading.attemptsRemaining, 0);
  assert.equal(examOutcome.result.session.hasOpenQuestion, false, 'a finalized question closes');
});

test('the exam-style question records CCMR direct evidence against its skill', async () => {
  assert.equal(examOutcome.error, null, describeFailure(examOutcome));
  const progress = await ccmrProgressDocs(EXAM.studentId);
  assert.equal(progress.length, 1, 'exactly one CCMR progress record, for this skill and framework');
  const [record] = progress;
  assert.equal(record.teksCode, SKILL, 'the progress record is filed under the question\'s skill code');
  assert.equal(record.alignmentKey, ALIGNMENT);
  assert.equal(record.framework, FRAMEWORK);
  assert.equal(record.studentId, EXAM.studentId);
  assert.equal(record.directItemsAttempted, 1);
  assert.equal(record.directItemsCorrect, 1);
  assert.equal(record.tier1ItemsAttempted, 1);
});

test('the exam-style submission lands its evidence and closes the question on the session', async () => {
  assert.equal(examOutcome.error, null, describeFailure(examOutcome));
  const events = await pathEvidence(EXAM.studentId);
  assert.equal(events.length, 1);
  assert.equal(events[0].source.assessmentFramework, FRAMEWORK);
  assert.equal(events[0].performance.status, 'finalized');
  const session = (await db.collection('pathSessions').doc(EXAM.sessionId).get()).data();
  assert.equal(session.currentQuestion, null);
  assert.equal(session.summary.completedQuestions, 1);
});

test('a finalized course (non-exam-style) question still works and writes no CCMR progress', async () => {
  assert.equal(courseOutcome.error, null, describeFailure(courseOutcome));
  assert.equal(courseOutcome.result.success, true);
  assert.equal(courseOutcome.result.grading.questionFinalized, true);
  assert.equal(courseOutcome.result.session.hasOpenQuestion, false);

  const progress = await ccmrProgressDocs(COURSE.studentId);
  assert.equal(progress.length, 0, 'course practice is not CCMR direct evidence');

  const events = await pathEvidence(COURSE.studentId);
  assert.equal(events.length, 1);
  assert.equal(events[0].source.assessmentFramework, null);
  assert.equal(events[0].performance.status, 'finalized');
});
