// Re-grade upward only (decision D8; GR22), against a real Firestore (the
// emulator): the read-only count first, then scripts/apply-upward-regrade.mjs,
// over attempts the real ingestStudentSubmissions callable recorded.
//
// HOW TO RUN (with the classroom re-grade report suite):
//   npm run test:classroom-regrade-report:emulator
// It must never run against a real project: it refuses without
// FIRESTORE_EMULATOR_HOST, and the CLI it runs refuses --yes without it too.
//
// THE STUDENTS, each answering the one question of this suite's assignment
// (classroomRegradeFixtures 2d, the exact quotient) through the real callable,
// with the verdict the pre-fix grader gave laid over the record:
//   raise   marked wrong, right now: the step raises it.
//   twin    the same answer, corrected first by the teacher's own "Apply
//           Corrected Grade" (overrideStudentResponseGrade, applyReplay): the
//           step leaves it, and what each path wrote is compared.
//   lower   marked right, which today's grader would lower: never touched.
//   wrong   wrong both times: never touched.
// The grade reaches Classroom through the real syncGradeToClassroom trigger,
// behind the harness's Classroom stub; the step itself never calls it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

const {
  db, fns, studentRequest, teacherRequest, patchGradeCalls, resetClassroomCalls, runClassroomSync,
} = await import('../canonicalPersistenceHarness.mjs');
const admin = require(path.join(repo, 'functions/node_modules', 'firebase-admin'));
const { FieldPath } = admin.firestore;
const { rosterLinkDocumentId } = require(path.join(repo, 'functions/lib/publication.js'));

const { runClassroomRegradeReport } = await import('../../../scripts/report-classroom-regrade-candidates.mjs');
const { UPWARD_REGRADE_SOURCE, SKIP } = await import('../../../scripts/lib/upwardRegrade.mjs');
const { FIXTURES, STORED, agedToOldGrading, oldGradingFor, toolResponseFor } = await import('../../platform/helpers/classroomRegradeFixtures.mjs');

const PREFIX = 'd8-regrade';
const CLASS_ID = `${PREFIX}-class`;
const ASSIGNMENT_ID = `${PREFIX}-assignment`;
const COURSE_ID = `${PREFIX}-course`;
const COURSEWORK_ID = `${PREFIX}-coursework`;
const TEACHER_EMAIL = 'd8-regrade.teacher@example.com';
const FIXTURE = Object.fromEntries(FIXTURES.map((fixture) => [fixture.tag, fixture]));
const STUDENTS = { raise: 'd-right', twin: 'd-right', lower: 'd-lower', wrong: 'd-wrong' };
const studentOf = (role) => `${PREFIX}-${role}`;
const gradeRef = (role) => db.collection('grades').doc(studentOf(role));
const evidenceRef = (role) => gradeRef(role).collection('responseInspectionEvidence').doc(`${encodeURIComponent(ASSIGNMENT_ID)}__q0`);
const readGrade = async (role) => (await gradeRef(role).get()).data() || {};
const audits = async (role) => (await gradeRef(role).collection('gradeOverrideAudits').get()).docs.map((doc) => doc.data());

const envelopeFor = (role) => ({
  schemaVersion: 1,
  actionId: `${PREFIX}-${role}-submit`,
  kind: 'ordinarySubmission',
  assignmentId: ASSIGNMENT_ID,
  questionIndex: 0,
  questionId: STORED.quotient.questionId,
  variantIndex: 0,
  activityRole: 'classwork',
  capturedAt: Date.now(),
  previousTotalAttempts: 0,
  record: { totalAttempts: 1, attemptCount: 1, status: 'attempted' },
  response: structuredClone(toolResponseFor(FIXTURE[STUDENTS[role]])),
  capturedSectionAccess: null,
  hasClassworkGrade: true,
  hasDolGrade: false,
});

// A database handle that throws on every write method: the count gets nothing else.
const WRITE_METHODS = new Set(['set', 'update', 'delete', 'create', 'add', 'batch', 'runTransaction', 'bulkWriter', 'recursiveDelete', 'bundle']);
const FIRESTORE_TYPES = new Set(['Firestore', 'CollectionReference', 'DocumentReference', 'Query', 'QuerySnapshot', 'QueryDocumentSnapshot', 'DocumentSnapshot']);
const targets = new WeakMap();
const unwrap = (value) => (Array.isArray(value) ? value.map(unwrap) : (targets.get(value) || value));
const readOnly = (value) => {
  if (Array.isArray(value)) return value.map(readOnly);
  if (value && typeof value.then === 'function') return value.then(readOnly);
  if (!value || typeof value !== 'object' || !FIRESTORE_TYPES.has(value.constructor?.name)) return value;
  const proxy = new Proxy(value, {
    get(target, property) {
      if (WRITE_METHODS.has(property)) return () => { throw new Error(`write refused: ${String(property)}`); };
      const member = Reflect.get(target, property, target);
      return typeof member === 'function' ? (...args) => readOnly(member.apply(target, args.map(unwrap))) : readOnly(member);
    },
  });
  targets.set(proxy, value);
  return proxy;
};

const cleanup = async () => {
  for (const role of Object.keys(STUDENTS)) {
    // eslint-disable-next-line no-await-in-loop
    await db.recursiveDelete(gradeRef(role)).catch(() => {});
    // eslint-disable-next-line no-await-in-loop
    const receipts = await db.collection('studentSubmissionReceipts').where('studentId', '==', studentOf(role)).get();
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(receipts.docs.map((doc) => doc.ref.delete()));
    // eslint-disable-next-line no-await-in-loop
    await db.collection('classroomRosterLinks').doc(rosterLinkDocumentId(COURSE_ID, studentOf(role))).delete().catch(() => {});
  }
  await db.collection('classroomLinks').doc(`${PREFIX}-publication`).delete().catch(() => {});
  await db.collection('assignments').doc(ASSIGNMENT_ID).delete().catch(() => {});
  await db.collection('classes').doc(CLASS_ID).delete().catch(() => {});
  const runs = await db.collection('adminAuditLog').where('action', '==', 'regrade_upward_d8').get();
  await Promise.all(runs.docs.map((doc) => doc.ref.delete()));
};

const before = {};

test.before(async () => {
  await cleanup();
  await db.collection('classes').doc(CLASS_ID).set({
    name: 'D8 re-grade — Period 1', course: 'algebra2', courseLevel: 'standard',
    period: 'Period 1', teacherOfRecord: TEACHER_EMAIL, status: 'active',
  });
  await db.collection('assignments').doc(ASSIGNMENT_ID).set({
    title: 'D8 re-grade fixture',
    assignedClassIds: [CLASS_ID],
    releaseAt: new Date(Date.now() - 86_400_000).toISOString(),
    dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    lateDueAt: new Date(Date.now() + 172_800_000).toISOString(),
    schemaVersion: 5,
    sections: [{ id: `${PREFIX}-classwork`, role: 'classwork', title: 'Classwork', questions: [STORED.quotient] }],
    sectionAccess: { classwork: { defaultState: 'open', overridesByClassId: {} } },
  });
  await db.collection('classroomLinks').doc(`${PREFIX}-publication`).set({
    schemaVersion: 2, publicationId: `${PREFIX}-publication`, assignmentId: ASSIGNMENT_ID,
    courseId: COURSE_ID, courseName: 'D8 Course', courseworkId: COURSEWORK_ID,
    teacherUid: `uid-${TEACHER_EMAIL}`, status: 'published', maxPoints: 100, sectionKey: 'whole',
  });
  for (const role of Object.keys(STUDENTS)) {
    // eslint-disable-next-line no-await-in-loop
    await gradeRef(role).set({
      displayName: `Fixture ${role}`, classId: CLASS_ID, classPeriod: 'Period 1',
      assignedTeacherEmail: TEACHER_EMAIL, status: 'active', gradesByAssignment: {},
      assignmentActivity: { [ASSIGNMENT_ID]: { totalTimeSeconds: 1800 } },
    });
    // eslint-disable-next-line no-await-in-loop
    await db.collection('classroomRosterLinks').doc(rosterLinkDocumentId(COURSE_ID, studentOf(role))).set({
      courseId: COURSE_ID, studentId: studentOf(role), googleUserId: `google-${studentOf(role)}`,
    });
    // eslint-disable-next-line no-await-in-loop
    const result = await fns.ingestStudentSubmissions.run(studentRequest(studentOf(role), { submissions: [envelopeFor(role)] }));
    assert.equal(result.receipts[0].disposition, 'accepted', `${role}: ${result.receipts[0].reason}`);
    // The verdict the pre-fix grader gave, laid over what today's grader wrote.
    const fixture = FIXTURE[STUDENTS[role]];
    const [grade, evidence] = await Promise.all([gradeRef(role).get(), evidenceRef(role).get()]);
    const aged = agedToOldGrading({
      record: grade.data().gradesByAssignment[ASSIGNMENT_ID]['0'],
      evidenceDocument: evidence.data(),
      question: STORED.quotient,
      response: evidence.data().evidence.submittedResponse,
      grading: oldGradingFor(fixture),
    });
    // eslint-disable-next-line no-await-in-loop
    await gradeRef(role).update(new FieldPath('gradesByAssignment', ASSIGNMENT_ID, '0'), aged.record);
    // eslint-disable-next-line no-await-in-loop
    await evidenceRef(role).set(aged.evidenceDocument);
  }
  // The teacher corrects the twin with "Apply Corrected Grade" first.
  before.twin = await readGrade('twin');
  await fns.overrideStudentResponseGrade.run(teacherRequest({
    studentId: studentOf('twin'), assignmentId: ASSIGNMENT_ID, questionIndex: 0, action: 'applyReplay', reason: 'Platform/grader issue',
  }, TEACHER_EMAIL));
});

test.after(cleanup);

test('the records are the old verdicts: raise, twin and wrong marked wrong, lower marked right', async () => {
  for (const role of ['raise', 'wrong']) {
    // eslint-disable-next-line no-await-in-loop
    assert.notEqual((await readGrade(role)).gradesByAssignment[ASSIGNMENT_ID]['0'].status, 'correct', role);
  }
  assert.equal((await readGrade('lower')).gradesByAssignment[ASSIGNMENT_ID]['0'].status, 'correct');
  assert.equal((await readGrade('twin')).teacherGradeOverridesByAssignment[ASSIGNMENT_ID]['0'].score, 100, 'the teacher corrected the twin');
});

test('the count, then the step: only "raise" is raised, through the platform\'s own path; Classroom gets the same grade either way', async () => {
  // 1. The read-only count, as the owner runs it.
  const report = await runClassroomRegradeReport({
    db: readOnly(db),
    assignmentIds: [ASSIGNMENT_ID],
    v5Sources: [],
    fieldPath: (...segments) => new FieldPath(...segments),
  });
  const listed = Object.fromEntries(report.assignments[0].questions[0].attempts.map((attempt) => [attempt.studentId.slice(PREFIX.length + 1), attempt.classification]));
  assert.equal(listed.raise, 're-grade-candidate');
  assert.equal(listed.lower, 'now-lower');
  assert.equal(listed.wrong, undefined, 'wrong both times: not listed');

  const out = mkdtempSync(path.join(os.tmpdir(), 'apply-upward-regrade-'));
  try {
    const from = path.join(out, 'count.json');
    const outcomePath = path.join(out, 'outcome.json');
    writeFileSync(from, JSON.stringify(report));
    before.raise = await readGrade('raise');
    before.lower = await readGrade('lower');
    before.wrong = await readGrade('wrong');
    const twinAfterTeacher = await readGrade('twin');
    const project = process.env.GCLOUD_PROJECT || 'mathmaster-classroom-regrade';
    const run = (extra) => promisify(execFile)(process.execPath, [
      path.join(repo, 'scripts/apply-upward-regrade.mjs'), '--project', project, '--from', from, '--report', outcomePath, ...extra,
    ], { cwd: repo, env: process.env });

    // 2. The dry run writes nothing.
    const dry = await run([]);
    assert.match(dry.stdout, /DRY RUN/);
    assert.deepEqual(await readGrade('raise'), before.raise);

    // 3. The step, under the emulator (where --yes is allowed).
    const { stdout } = await run(['--apply', '--yes', '--actor', 'ops@example.com']);
    assert.doesNotMatch(stdout, new RegExp(PREFIX), 'no student or assignment id on stdout');
    const outcome = JSON.parse(readFileSync(outcomePath, 'utf8'));
    const byRole = Object.fromEntries(outcome.attempts.map((attempt) => [attempt.studentId.slice(PREFIX.length + 1), attempt.outcome]));
    // The count lists the twin (it classifies the automatic verdict) and the
    // step leaves it to the teacher; now-lower never reaches the step at all.
    assert.deepEqual(byRole, { raise: 'raise', twin: SKIP.TEACHER_DECIDED });
    assert.equal(outcome.sources.ignored['classification:now-lower'], 1);
    assert.equal(outcome.execution.raised, 1);

    // raise: an override of 100 for this attempt, the release signal, an audit.
    const raised = await readGrade('raise');
    const override = raised.teacherGradeOverridesByAssignment[ASSIGNMENT_ID]['0'];
    assert.equal(override.source, UPWARD_REGRADE_SOURCE);
    assert.deepEqual(raised.gradesByAssignment, before.raise.gradesByAssignment, 'the attempt itself is untouched');
    assert.equal(raised.classroomReleaseSignals[ASSIGNMENT_ID].source, UPWARD_REGRADE_SOURCE);
    const [audit] = await audits('raise');
    assert.equal(audit.type, UPWARD_REGRADE_SOURCE);
    assert.equal(audit.actor.email, 'ops@example.com');

    // The same correction the teacher's own button made on the twin.
    const teacherOverride = twinAfterTeacher.teacherGradeOverridesByAssignment[ASSIGNMENT_ID]['0'];
    const core = ({ active, score, automaticScore, fieldOverrides, totalAttempts, variantIndex }) => ({ active, score, automaticScore, fieldOverrides, totalAttempts, variantIndex });
    assert.deepEqual(core(override), core(teacherOverride));
    const [teacherAudit] = await audits('twin');
    assert.deepEqual([audit.previousScore, audit.newScore, audit.reason], [teacherAudit.previousScore, teacherAudit.newScore, teacherAudit.reason]);
    assert.deepEqual(await readGrade('twin'), twinAfterTeacher, 'the twin is left as the teacher set it');

    // lower and wrong: untouched.
    assert.deepEqual(await readGrade('lower'), before.lower);
    assert.deepEqual(await readGrade('wrong'), before.wrong);

    // 4. Classroom: the real grades trigger posts the raised grade, as it does the teacher's.
    resetClassroomCalls();
    await runClassroomSync(studentOf('raise'), before.raise);
    const raisedPosts = patchGradeCalls().filter((call) => call.courseWorkId === COURSEWORK_ID);
    resetClassroomCalls();
    await runClassroomSync(studentOf('twin'), before.twin);
    const teacherPosts = patchGradeCalls().filter((call) => call.courseWorkId === COURSEWORK_ID);
    assert.ok(raisedPosts.length >= 1, 'the raised grade is posted by the platform\'s sync');
    assert.equal(raisedPosts.at(-1).grade, 100);
    assert.equal(raisedPosts.at(-1).grade, teacherPosts.at(-1)?.grade, 'the same grade as the teacher\'s correction posts');

    // 5. A second run raises nothing more.
    await run(['--apply', '--yes', '--actor', 'ops@example.com']);
    const second = JSON.parse(readFileSync(outcomePath, 'utf8'));
    assert.equal(second.counts.byOutcome.raise, 0);
    assert.equal(second.execution, null);
    assert.equal((await audits('raise')).length, 1, 'one audit, one raise');
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
