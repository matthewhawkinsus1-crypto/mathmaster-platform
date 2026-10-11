// The Job K classroom re-grade report (2a–2f, the later grader changes and the
// compiler drops), against a real Firestore (the emulator), over attempts the
// real ingestStudentSubmissions callable recorded.
//
// HOW TO RUN:
//   npx firebase emulators:exec --only firestore --project mathmaster-classroom-regrade \
//     --config tests/browser/emulator/firebase.json \
//     "node --import ./tests/integration/support/emulatorTransactions.mjs --test tests/integration/classroomRegrade/*.test.mjs"
// or `npm run test:classroom-regrade-report:emulator` (a CI step of its own).
// It lives outside tests/integration/*.test.mjs on purpose, so the shared
// challenge-finish emulator run never mixes its reads with another suite's
// records; its assertions are scoped to this suite's own assignment and
// students as well.
//
// THE FIXTURES (tests/platform/helpers/classroomRegradeFixtures.mjs): one
// student per fixture, each answering one question of one assignment through
// the real callable, which writes the record and the response evidence
// exactly as production does.
//   - 2a, 2b: the assignment stores the pre-K compile, so the server's verdict
//     at ingestion IS the old outcome (those graders never changed).
//   - the compiler drops: likewise (their graders never changed), and the
//     report lists them for the teacher whatever the verdict.
//   - 2c, 2d, 2e, 2f and the later grader changes: the server grades with
//     today's (fixed) code, so what it records is the NEW outcome. That is phase 1: the report must find
//     nothing to re-grade there. Phase 2 lays the verdict the pre-K grader
//     returned (pinned in the fixtures and checked against the pre-K code by
//     tests/platform/kGrading_classroomRegradePlan.test.mjs) over those
//     records, the old outcome, and the report must list each one.
//   - A question today's grader refuses (complexPlaneLab 'divide') cannot be
//     ingested at all now; its pre-K record and evidence are written as
//     ingestion wrote them then (storedAttempt), the old outcome from the start.
// Negative controls (a truly wrong answer, an unaffected sequence, a drop
// whose source poses the same problem) stay out in both phases. The report runs on a database handle that throws on every
// write method, and as the CLI.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const require = createRequire(import.meta.url);

assert.ok(
  process.env.FIRESTORE_EMULATOR_HOST,
  'FIRESTORE_EMULATOR_HOST must be set — run this through firebase emulators:exec, never against a real project.',
);

// The harness loads functions/index.js (which owns the default app) behind a
// Google Classroom stub.
const { db, fns, studentRequest } = await import('../canonicalPersistenceHarness.mjs');
const admin = require(path.join(repo, 'functions/node_modules', 'firebase-admin'));
const { FieldPath } = admin.firestore;

const { runClassroomRegradeReport } = await import('../../../scripts/report-classroom-regrade-candidates.mjs');
const { REGRADE_CLASS } = await import('../../../scripts/lib/classroomRegradePlan.mjs');
const {
  FIXTURES, STORED, V5_SOURCE, agedToOldGrading, oldGradingFor, storedAttempt, toolResponseFor,
} = await import('../../platform/helpers/classroomRegradeFixtures.mjs');

const PREFIX = 'k-regrade-fixture';
const CLASS_ID = `${PREFIX}-class`;
const ASSIGNMENT_ID = `${PREFIX}-assignment`;
const TEACHER_EMAIL = 'k-regrade.teacher@example.com';
const V5_SOURCE_PATH = 'k-regrade-source.json';

// The assignment: every stored question once, in a V5 classwork section.
const QUESTION_KEYS = [...new Set(FIXTURES.map((fixture) => fixture.question))];
const questionIndexOf = (fixture) => QUESTION_KEYS.indexOf(fixture.question);
const studentOf = (fixture) => `${PREFIX}-${fixture.tag}`;

const assignmentDocument = () => ({
  title: 'Job K re-grade report fixture',
  assignedClassIds: [CLASS_ID],
  releaseAt: new Date(Date.now() - 86_400_000).toISOString(),
  dueAt: new Date(Date.now() + 86_400_000).toISOString(),
  lateDueAt: new Date(Date.now() + 172_800_000).toISOString(),
  schemaVersion: 5,
  sections: [{ id: `${PREFIX}-classwork`, role: 'classwork', title: 'Classwork', questions: QUESTION_KEYS.map((key) => STORED[key]) }],
  sectionAccess: { classwork: { defaultState: 'open', overridesByClassId: {} } },
});

// One submission, as the student app sends it.
const envelopeFor = (fixture) => ({
  schemaVersion: 1,
  actionId: `${PREFIX}-${fixture.tag}-submit`,
  kind: 'ordinarySubmission',
  assignmentId: ASSIGNMENT_ID,
  questionIndex: questionIndexOf(fixture),
  questionId: STORED[fixture.question].questionId,
  variantIndex: 0,
  activityRole: 'classwork',
  capturedAt: Date.now(),
  previousTotalAttempts: 0,
  record: { totalAttempts: 1, attemptCount: 1, status: 'attempted' },
  response: JSON.parse(JSON.stringify(toolResponseFor(fixture))),
  capturedSectionAccess: null,
  hasClassworkGrade: true,
  hasDolGrade: false,
});

const gradeRef = (fixture) => db.collection('grades').doc(studentOf(fixture));
const readStored = async (fixture) => {
  const index = questionIndexOf(fixture);
  const [grade, evidence] = await Promise.all([
    gradeRef(fixture).get(),
    gradeRef(fixture).collection('responseInspectionEvidence').doc(`${encodeURIComponent(ASSIGNMENT_ID)}__q${index}`).get(),
  ]);
  return {
    record: grade.data()?.gradesByAssignment?.[ASSIGNMENT_ID]?.[String(index)] || null,
    evidenceDocument: evidence.exists ? evidence.data() : null,
  };
};

// A database handle that throws on every write method, at every level: the
// report gets nothing else.
const WRITE_METHODS = new Set(['set', 'update', 'delete', 'create', 'add', 'batch', 'runTransaction', 'bulkWriter', 'recursiveDelete', 'bundle']);
const FIRESTORE_TYPES = new Set(['Firestore', 'CollectionReference', 'DocumentReference', 'Query', 'QuerySnapshot', 'QueryDocumentSnapshot', 'DocumentSnapshot']);
const writeAttempts = [];
const targets = new WeakMap();
const unwrap = (value) => (Array.isArray(value) ? value.map(unwrap) : (targets.get(value) || value));
const readOnly = (value) => {
  if (Array.isArray(value)) return value.map(readOnly);
  if (value && typeof value.then === 'function') return value.then(readOnly);
  if (!value || typeof value !== 'object' || !FIRESTORE_TYPES.has(value.constructor?.name)) return value;
  const proxy = new Proxy(value, {
    get(target, property) {
      if (WRITE_METHODS.has(property)) {
        return () => {
          writeAttempts.push(`${target.constructor.name}.${String(property)}`);
          throw new Error(`write refused: ${String(property)}`);
        };
      }
      const member = Reflect.get(target, property, target);
      return typeof member === 'function'
        ? (...args) => readOnly(member.apply(target, args.map(unwrap)))
        : readOnly(member);
    },
  });
  targets.set(proxy, value);
  return proxy;
};

const report = (options = {}) => runClassroomRegradeReport({
  db: readOnly(db),
  assignmentIds: [ASSIGNMENT_ID],
  v5Sources: [{ path: V5_SOURCE_PATH, payload: V5_SOURCE }],
  pageSize: 3,
  fieldPath: (...segments) => new FieldPath(...segments),
  ...options,
});
// This suite's attempts, by fixture tag.
const listedByTag = (result) => Object.fromEntries((result.assignments.find((entry) => entry.assignmentId === ASSIGNMENT_ID)?.questions || [])
  .flatMap((question) => question.attempts.map((attempt) => [attempt.studentId.slice(PREFIX.length + 1), { ...attempt, questionIndex: question.questionIndex }])));

const ingested = {};

test.before(async () => {
  await db.collection('classes').doc(CLASS_ID).set({
    name: 'Job K re-grade — Period 1', course: 'algebra1', courseLevel: 'standard',
    period: 'Period 1', teacherOfRecord: TEACHER_EMAIL, status: 'active',
  });
  await db.collection('assignments').doc(ASSIGNMENT_ID).set(assignmentDocument());
  for (const fixture of FIXTURES) {
    // eslint-disable-next-line no-await-in-loop
    await db.recursiveDelete(gradeRef(fixture)).catch(() => {});
    // eslint-disable-next-line no-await-in-loop
    await gradeRef(fixture).set({
      displayName: `Fixture ${fixture.tag}`, classId: CLASS_ID, classPeriod: 'Period 1',
      assignedTeacherEmail: TEACHER_EMAIL, status: 'active', gradesByAssignment: {},
      assignmentActivity: { [ASSIGNMENT_ID]: { totalTimeSeconds: 1800 } },
    });
    const receipts = await db.collection('studentSubmissionReceipts').where('studentId', '==', studentOf(fixture)).get();
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(receipts.docs.map((doc) => doc.ref.delete()));
    if (fixture.ingestBlocked) {
      // Today's server refuses the question, so the record is the pre-K one.
      const old = storedAttempt({
        assignmentId: ASSIGNMENT_ID,
        questionIndex: questionIndexOf(fixture),
        question: STORED[fixture.question],
        response: JSON.parse(JSON.stringify(toolResponseFor(fixture))),
        grading: oldGradingFor(fixture),
        submissionId: `${PREFIX}-${fixture.tag}-submit`,
        at: Date.now(),
      });
      // eslint-disable-next-line no-await-in-loop
      await gradeRef(fixture).update(new FieldPath('gradesByAssignment', ASSIGNMENT_ID, String(questionIndexOf(fixture))), old.record);
      // eslint-disable-next-line no-await-in-loop
      await gradeRef(fixture).collection('responseInspectionEvidence').doc(old.evidenceDocumentId).set(old.evidenceDocument);
      // eslint-disable-next-line no-await-in-loop
      ingested[fixture.tag] = await readStored(fixture);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const result = await fns.ingestStudentSubmissions.run(studentRequest(studentOf(fixture), { submissions: [envelopeFor(fixture)] }));
    assert.equal(result.receipts[0].disposition, 'accepted', `${fixture.tag}: ${result.receipts[0].reason}`);
    // eslint-disable-next-line no-await-in-loop
    ingested[fixture.tag] = await readStored(fixture);
  }
});

test.after(async () => {
  for (const fixture of FIXTURES) {
    // eslint-disable-next-line no-await-in-loop
    await db.recursiveDelete(gradeRef(fixture)).catch(() => {});
    const receipts = await db.collection('studentSubmissionReceipts').where('studentId', '==', studentOf(fixture)).get();
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(receipts.docs.map((doc) => doc.ref.delete()));
  }
  await db.collection('assignments').doc(ASSIGNMENT_ID).delete();
  await db.collection('classes').doc(CLASS_ID).delete();
});

test('ingestion records the old outcome for 2a/2b (a lossy stored question) and the new one where the grader changed', () => {
  for (const fixture of FIXTURES) {
    const { record, evidenceDocument } = ingested[fixture.tag];
    assert.ok(record && evidenceDocument, `${fixture.tag}: record and evidence written`);
    assert.equal(evidenceDocument.submissionId, record.lastSubmissionId);
    const recordedCorrect = evidenceDocument.evidence.automaticResult.isCorrect === true;
    if (!fixture.old) {
      // The stored question is the pre-K compile: this IS the old verdict.
      assert.equal(recordedCorrect, oldGradingFor(fixture).isCorrect === true, fixture.tag);
    } else if (fixture.expect.newCorrect !== undefined) {
      assert.equal(recordedCorrect, fixture.expect.newCorrect, `${fixture.tag}: today's grader at ingestion`);
    }
  }
  // The deciding cases, spelled out.
  assert.equal(ingested['a-key'].record.status, 'attempted', '2a: the key line was graded wrong (no line to compare with)');
  assert.equal(ingested['b-lower'].record.status, 'correct', '2b: 17 was right for 3·2^x + 5');
  assert.equal(ingested['d-right'].record.status, 'correct', '2d: the fixed grader accepts (x − 1)/x');
  assert.equal(ingested['f-dol1-old-right'].record.status, 'attempted', '2f: change 1, a₈ = 14 is wrong for 7, 11, 15, ...');
});

test('phase 1 — records the fixed grader wrote: nothing to re-grade; the stored-question defects are still listed', async () => {
  const result = await report();
  assert.deepEqual(writeAttempts, []);
  const listed = listedByTag(result);
  const expected = {
    // The compiler defects: the stored question is still lossy.
    'a-key': REGRADE_CLASS.CANDIDATE,
    'a-no-source': REGRADE_CLASS.NEEDS_TEACHER,
    'b-right': REGRADE_CLASS.CANDIDATE,
    'b-lower': REGRADE_CLASS.NOW_LOWER,
    'b-no-source': REGRADE_CLASS.NEEDS_TEACHER,
    // Never re-graded, whichever grader recorded them.
    'c-branch': REGRADE_CLASS.NEEDS_TEACHER,
    'f-dol1-new-right': REGRADE_CLASS.NEEDS_TEACHER,
    'f-dol1-old-right': REGRADE_CLASS.NEEDS_TEACHER,
    // Never graded now (and recorded under the old code).
    'complex-divide': REGRADE_CLASS.NEEDS_TEACHER,
    // The screen showed the default problem: listed whatever the verdict.
    'drop-parabola': REGRADE_CLASS.NEEDS_TEACHER,
    'drop-polynomial': REGRADE_CLASS.NEEDS_TEACHER,
    'drop-sign-rational': REGRADE_CLASS.NEEDS_TEACHER,
    'drop-sign-rational-no-source': REGRADE_CLASS.NEEDS_TEACHER,
    'drop-sign-numerator': REGRADE_CLASS.NEEDS_TEACHER,
  };
  assert.deepEqual(Object.fromEntries(Object.entries(listed).map(([tag, attempt]) => [tag, attempt.classification])), expected);
});

test('phase 2 — the old outcome: every defect class is listed as it should be, and the negative controls stay out', async () => {
  for (const fixture of FIXTURES.filter((entry) => entry.old)) {
    const { record, evidenceDocument } = ingested[fixture.tag];
    const aged = agedToOldGrading({
      record, evidenceDocument, question: STORED[fixture.question], response: evidenceDocument.evidence.submittedResponse, grading: oldGradingFor(fixture),
    });
    // eslint-disable-next-line no-await-in-loop
    await gradeRef(fixture).update(new FieldPath('gradesByAssignment', ASSIGNMENT_ID, String(questionIndexOf(fixture))), aged.record);
    // eslint-disable-next-line no-await-in-loop
    await gradeRef(fixture).collection('responseInspectionEvidence').doc(`${encodeURIComponent(ASSIGNMENT_ID)}__q${questionIndexOf(fixture)}`).set(aged.evidenceDocument);
  }
  const result = await report();
  assert.deepEqual(writeAttempts, []);
  const listed = listedByTag(result);
  for (const fixture of FIXTURES) {
    const attempt = listed[fixture.tag];
    if (fixture.expect.classification === REGRADE_CLASS.UNCHANGED) {
      assert.equal(attempt, undefined, `${fixture.tag}: a negative control is not listed`);
      continue;
    }
    assert.ok(attempt, `${fixture.tag}: listed`);
    assert.equal(attempt.classification, fixture.expect.classification, fixture.tag);
    if (fixture.expect.reason) assert.equal(attempt.reason, fixture.expect.reason, fixture.tag);
    if (fixture.expect.defect) assert.ok(attempt.defects.includes(fixture.expect.defect), fixture.tag);
    if (fixture.expect.oldScore !== undefined) assert.equal(attempt.old.score, fixture.expect.oldScore, `${fixture.tag}: old score`);
    if (fixture.expect.newScore !== undefined) assert.equal(attempt.new.score, fixture.expect.newScore, `${fixture.tag}: new score`);
    assert.equal(attempt.classId, CLASS_ID);
    assert.equal(attempt.questionIndex, questionIndexOf(fixture));
    assert.equal(attempt.record.lastSubmissionId, `${PREFIX}-${fixture.tag}-submit`);
  }
  // The evidence each one points at is that student's own stored work.
  assert.deepEqual(listed['c-mirror-lower'].evidence.work, { x: 0, inverseAnswer: '0' });
  assert.deepEqual(listed['d-right'].parts.find((part) => part.id === 'quotient').new.isCorrect, true);
});

test('unscoped (every assignment), this suite\'s attempts are classified the same', async () => {
  const result = await report({ assignmentIds: [] });
  assert.deepEqual(writeAttempts, []);
  const listed = listedByTag(result);
  const expectedListed = FIXTURES.filter((fixture) => fixture.expect.classification !== REGRADE_CLASS.UNCHANGED);
  assert.deepEqual(Object.keys(listed).sort(), expectedListed.map((fixture) => fixture.tag).sort());
  for (const fixture of expectedListed) assert.equal(listed[fixture.tag].classification, fixture.expect.classification, fixture.tag);
});

test('as the CLI: counts on stdout, student ids only in the JSON detail', async () => {
  const out = mkdtempSync(path.join(os.tmpdir(), 'classroom-regrade-report-'));
  try {
    const source = path.join(out, V5_SOURCE_PATH);
    writeFileSync(source, JSON.stringify(V5_SOURCE));
    const project = process.env.GCLOUD_PROJECT || 'mathmaster-classroom-regrade';
    const { stdout } = await promisify(execFile)(process.execPath, [
      path.join(repo, 'scripts/report-classroom-regrade-candidates.mjs'),
      '--project', project,
      '--assignment', ASSIGNMENT_ID,
      '--v5-sources', source,
      '--out', path.join(out, 'detail'),
    ], { cwd: repo, env: process.env });
    assert.match(stdout, /READ ONLY/);
    const expectedCount = (name) => FIXTURES.filter((fixture) => fixture.expect.classification === name).length;
    for (const name of [REGRADE_CLASS.CANDIDATE, REGRADE_CLASS.NOW_LOWER, REGRADE_CLASS.NEEDS_TEACHER]) {
      assert.match(stdout, new RegExp(`^\\s+${name}\\s+${expectedCount(name)}$`, 'm'), name);
    }
    assert.doesNotMatch(stdout, new RegExp(PREFIX), 'no student or assignment id on stdout');
    const [file] = readdirSync(path.join(out, 'detail'));
    const detail = JSON.parse(readFileSync(path.join(out, 'detail', file), 'utf8'));
    assert.equal(detail.readOnly, true);
    assert.equal(Object.keys(listedByTag(detail)).length, FIXTURES.filter((fixture) => fixture.expect.classification !== REGRADE_CLASS.UNCHANGED).length);
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
