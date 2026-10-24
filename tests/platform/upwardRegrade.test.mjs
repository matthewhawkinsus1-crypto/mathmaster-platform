/*
 * RE-GRADE UPWARD ONLY (decision D8; the owner, 2026-10-16) — GR22.
 *
 * scripts/apply-upward-regrade.mjs raises the classroom answers a read-only
 * re-grade report listed, and only those the platform's own replay now marks
 * right, that were marked wrong, and that no teacher has decided. It writes
 * what the teacher's "Apply Corrected Grade" writes (an override, the DOL
 * projection, a Classroom release signal, an audit record) and never calls
 * Google Classroom: syncGradeToClassroom posts the grade.
 *
 * The attempts are the Job K re-grade fixtures (classroomRegradeFixtures.mjs),
 * built exactly as ingestion stores them, with the verdict the old grader gave
 * laid over them: d-right, c-mirror-right and e-right were marked wrong and
 * today's grader marks them right; d-lower was marked right (and today's
 * grader would lower it); d-wrong is wrong both times.
 *
 * The dry run runs on a database that refuses every write
 * (helpers/readOnlyFirestore.mjs); the apply on the server harness's
 * Firestore stand-in (helpers/serverCallableHarness.mjs). The Firestore
 * emulator run, beside the real callable, is tests/integration/
 * classroomRegrade/upwardRegradeApply.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  SKIP,
  UPWARD_REGRADE_SOURCE,
  candidatesFromReports,
  planUpwardRegrade,
  questionCredit,
  teacherOverrideApplies,
} from '../../scripts/lib/upwardRegrade.mjs';
import { parseApplyArgs, runUpwardRegrade } from '../../scripts/apply-upward-regrade.mjs';
import { FakeFieldPath, FakeFirestore, topLevelFunction } from './helpers/serverCallableHarness.mjs';
import { readOnlyStore } from './helpers/readOnlyFirestore.mjs';
import { FIXTURES, STORED, oldGradingFor, storedAttempt, toolResponseFor } from './helpers/classroomRegradeFixtures.mjs';
import { executableSource } from './helpers/sourceContract.mjs';

const ASSIGNMENT_ID = 'gr22-assignment';
const CLASS_ID = 'gr22-class';
const OCCURRED = Date.parse('2026-10-14T15:00:00.000Z');
const NOW = '2026-10-23T18:00:00.000Z';
// Two classwork questions, then a DOL question.
const ASSIGNMENT = Object.freeze({
  title: 'D8 fixture',
  schemaVersion: 5,
  assignedClassIds: [CLASS_ID],
  sections: [
    { id: 'cw', role: 'classwork', title: 'Classwork', questions: [STORED.quotient, STORED.inverseMirror] },
    { id: 'dol', role: 'dol', title: 'DOL', questions: [STORED.identify] },
  ],
});
const INDEX_OF = { quotient: 0, inverseMirror: 1, identify: 2 };
const FIXTURE = Object.fromEntries(FIXTURES.map((fixture) => [fixture.tag, fixture]));
const TAGS = ['d-right', 'c-mirror-right', 'e-right', 'd-lower', 'd-wrong'];
const studentOf = (tag) => `gr22-${tag}`;

/** The attempt as ingestion stored it, with the old grader's verdict. */
const attemptOf = (tag) => {
  const fixture = FIXTURE[tag];
  const questionIndex = INDEX_OF[fixture.question];
  const stored = storedAttempt({
    assignmentId: ASSIGNMENT_ID,
    questionIndex,
    question: STORED[fixture.question],
    response: structuredClone(toolResponseFor(fixture)),
    grading: oldGradingFor(fixture),
    submissionId: `${studentOf(tag)}-submit`,
    at: OCCURRED,
  });
  return { tag, studentId: studentOf(tag), questionIndex, ...stored };
};
const ATTEMPTS = Object.fromEntries(TAGS.map((tag) => [tag, attemptOf(tag)]));
const gradeDataOf = ({ questionIndex, record }, extra = {}) => ({
  classId: CLASS_ID,
  gradesByAssignment: { [ASSIGNMENT_ID]: { [String(questionIndex)]: record } },
  ...(questionIndex === 2 ? {
    // The DOL closed on the day it was taken, recorded as 0.
    dolGradesByAssignment: { [ASSIGNMENT_ID]: { '2026-10-14': { finalized: true, score: 0, questionIndex: 2, questionIndices: [2], recordedAt: '2026-10-14T15:30:00.000Z', status: 'section-finalized', finalizedAt: '2026-10-14T15:30:00.000Z' } } },
  } : {}),
  ...extra,
});
const candidateOf = ({ studentId, questionIndex }) => ({ studentId, assignmentId: ASSIGNMENT_ID, questionIndex });

const planOf = (attempt, { gradeData = gradeDataOf(attempt), assignment = ASSIGNMENT, evidenceDocument = attempt.evidenceDocument } = {}) => planUpwardRegrade({
  ...candidateOf(attempt), assignment, gradeData, evidenceDocument,
});

/** The fixture world: every attempt, its record and evidence, and the assignment. */
const seed = () => {
  const collections = { assignments: { [ASSIGNMENT_ID]: structuredClone(ASSIGNMENT) }, grades: {} };
  Object.values(ATTEMPTS).forEach((attempt) => {
    collections.grades[attempt.studentId] = gradeDataOf(attempt);
    collections[`grades/${attempt.studentId}/responseInspectionEvidence`] = { [attempt.evidenceDocumentId]: attempt.evidenceDocument };
  });
  return collections;
};
const CANDIDATES = Object.values(ATTEMPTS).map(candidateOf);

/* --------------------------------------------------------------- the plan -- */

test('the fixtures are what they claim: marked wrong under the old grader, and how the replay now reads them', () => {
  for (const tag of ['d-right', 'c-mirror-right', 'e-right', 'd-wrong']) {
    assert.notEqual(ATTEMPTS[tag].record.status, 'correct', `${tag}: marked wrong`);
    assert.equal(ATTEMPTS[tag].evidenceDocument.evidence.automaticResult.isCorrect, false, tag);
  }
  assert.equal(ATTEMPTS['d-lower'].record.status, 'correct', 'd-lower was marked right');
});

test('an answer marked wrong that the current grader marks right is raised to 100; nothing else is', () => {
  const outcomes = Object.fromEntries(TAGS.map((tag) => [tag, planOf(ATTEMPTS[tag])]));
  assert.deepEqual(Object.fromEntries(Object.entries(outcomes).map(([tag, plan]) => [tag, plan.outcome])), {
    'd-right': 'raise',
    'c-mirror-right': 'raise',
    'e-right': 'raise',
    'd-lower': SKIP.ALREADY_RIGHT,
    'd-wrong': SKIP.NOT_RIGHT_NOW,
  });
  assert.deepEqual([outcomes['d-right'].oldScore, outcomes['d-right'].newScore], [50, 100]);
  assert.deepEqual([outcomes['c-mirror-right'].oldScore, outcomes['c-mirror-right'].newScore], [0, 100]);
});

test('a teacher\'s decision stands, and secure work, untrusted evidence and a missing assignment are left alone', () => {
  const attempt = ATTEMPTS['d-right'];
  const teacherOverride = { active: true, score: 60, source: 'teacher-override', submissionId: attempt.record.lastSubmissionId, totalAttempts: attempt.record.totalAttempts, variantIndex: 0 };
  assert.equal(planOf(attempt, { gradeData: gradeDataOf(attempt, { teacherGradeOverridesByAssignment: { [ASSIGNMENT_ID]: { 0: teacherOverride } } }) }).outcome, SKIP.TEACHER_DECIDED);
  // An override of an EARLIER attempt does not apply to this one: it is raised.
  const stale = { ...teacherOverride, submissionId: 'an-earlier-attempt' };
  assert.equal(planOf(attempt, { gradeData: gradeDataOf(attempt, { teacherGradeOverridesByAssignment: { [ASSIGNMENT_ID]: { 0: stale } } }) }).outcome, 'raise');
  const zero = { active: true, score: 0, source: 'teacher-assignment-zero' };
  assert.equal(planOf(attempt, { gradeData: gradeDataOf(attempt, { teacherGradeOverridesByAssignment: { [ASSIGNMENT_ID]: { __assignment: zero } } }) }).outcome, SKIP.ASSIGNMENT_GRADE_SET);
  assert.equal(planOf(attempt, { assignment: { ...ASSIGNMENT, assessmentPolicy: { mode: 'testCycle' } } }).outcome, SKIP.TEST_CYCLE);
  assert.equal(planOf(attempt, { evidenceDocument: { ...attempt.evidenceDocument, submissionId: 'another-attempt' } }).outcome, SKIP.NO_TRUSTED_EVIDENCE);
  assert.equal(planOf(attempt, { assignment: null }).outcome, SKIP.ASSIGNMENT_MISSING);
  assert.equal(planOf(attempt, { gradeData: null }).outcome, SKIP.STUDENT_MISSING);
});

/*
 * functions/index.js keeps teacherOverrideAppliesToRecord and getQuestionCredit
 * to itself; the module mirrors them. Both are run here, the deployed ones cut
 * out of the source as written, over the same cases.
 */
test('the override and credit rules are the server\'s own, case for case', () => {
  const server = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const clamp = server.match(/^const clampPercent = [\s\S]*?;\n/m)[0];
  // eslint-disable-next-line no-new-func
  const deployed = new Function(`${clamp}\n${topLevelFunction('storedAlgebraStepPartialCredit')}\n${topLevelFunction('teacherOverrideAppliesToRecord')}\n${topLevelFunction('getQuestionCredit')}\nreturn { teacherOverrideAppliesToRecord, getQuestionCredit };`)();
  const record = { status: 'attempted', totalAttempts: 2, attemptCount: 2, variantIndex: 1, lastSubmissionId: 's-2', lastAttemptAt: '2026-10-14T15:00:00.000Z', bestPartialCredit: 40 };
  const steps = { ...record, bestPartialCredit: 10, stepGrades: [
    { variantIndex: 1, equationBefore: '2x+3=7', equationAfter: '2x=4', earned: 1, possible: 1, expectedTotalPoints: 2 },
    { variantIndex: 1, equationBefore: '2x=4', equationAfter: 'x=2', earned: 1, possible: 1, expectedTotalPoints: 2 },
  ] };
  const overrides = [
    null,
    { active: true, score: 90, submissionId: 's-2', totalAttempts: 2, variantIndex: 1 },
    { active: true, score: 90, submissionId: 's-1', totalAttempts: 2, variantIndex: 1 },
    { active: true, score: 90, totalAttempts: 1, variantIndex: 1, submissionId: 's-2' },
    { active: true, score: 90, totalAttempts: 2, variantIndex: 0, submissionId: 's-2' },
    { active: true, score: 75, totalAttempts: 2, variantIndex: 1, lastAttemptAt: '2026-10-14T15:00:00.000Z' },
    { active: true, score: 0, persistent: true, source: 'teacher-section-zero' },
    { active: false, score: 100, submissionId: 's-2', totalAttempts: 2, variantIndex: 1 },
    { active: true, score: 'not a number', submissionId: 's-2', totalAttempts: 2, variantIndex: 1 },
  ];
  for (const candidate of [record, steps, { ...record, status: 'correct' }, { ...record, bestPartialCredit: undefined, partialCredit: 30 }, null]) {
    for (const override of overrides) {
      const label = JSON.stringify({ candidate, override });
      assert.equal(teacherOverrideApplies(candidate, override), deployed.teacherOverrideAppliesToRecord(candidate, override), label);
      assert.equal(questionCredit(candidate, override), deployed.getQuestionCredit(candidate, override), label);
    }
  }
  assert.equal(questionCredit(steps), 0.9, 'the step credit is counted (at most 90), as the server counts it');
});

/* -------------------------------------------------------------- the input -- */

test('the step takes only what a read-only report listed for raising: never needs-teacher or now-lower, never secure or Path work', () => {
  const classroom = {
    tool: 'report-classroom-regrade-candidates',
    assignments: [{ assignmentId: 'a1', questions: [{ questionIndex: 3, attempts: [
      { studentId: 's1', classification: 're-grade-candidate' },
      { studentId: 's2', classification: 'needs-teacher' },
      { studentId: 's3', classification: 'now-lower' },
      { studentId: 's4', classification: 'changed-outside-k' },
    ] }] }],
  };
  const gaps = {
    tool: 'report-grader-gaps-2-regrade',
    changes: [
      { surface: 'assignments', direction: 'up', studentId: 's1', assignmentId: 'a1', questionIndex: 3 },
      { surface: 'assignments', direction: 'up', studentId: 's5', assignmentId: 'a2', questionIndex: 0 },
      { surface: 'assignments', direction: 'down', studentId: 's6', assignmentId: 'a2', questionIndex: 1 },
      { surface: 'secure', direction: 'up', studentId: 's7', examSessionId: 'e1' },
      { surface: 'path', direction: 'up', studentId: 's8', submissionId: 'p1' },
    ],
  };
  const { candidates, ignored } = candidatesFromReports([classroom, gaps]);
  assert.deepEqual(candidates.map(({ studentId, assignmentId, questionIndex }) => `${studentId}/${assignmentId}/${questionIndex}`), ['s1/a1/3', 's4/a1/3', 's5/a2/0']);
  assert.deepEqual(ignored, { 'classification:needs-teacher': 1, 'classification:now-lower': 1, 'direction:down': 1, 'surface:secure': 1, 'surface:path': 1 });
  assert.throws(() => candidatesFromReports([{ tool: 'something-else' }]), /not a re-grade report/);
});

test('read-only by default; --apply needs --actor; --yes is refused unless the Firestore emulator is the target', () => {
  const base = ['--project', 'demo-project', '--from', 'report.json'];
  assert.equal(parseApplyArgs(base, {}).mode, 'dry-run');
  assert.throws(() => parseApplyArgs(['--project', 'demo-project'], {}), /--from <report.json> is required/);
  assert.throws(() => parseApplyArgs([...base, '--apply'], {}), /--actor <email> is required/);
  assert.equal(parseApplyArgs([...base, '--apply', '--actor', 'ops@example.com'], {}).mode, 'apply');
  assert.throws(() => parseApplyArgs([...base, '--apply', '--actor', 'ops@example.com', '--yes'], {}), /refusing --yes/);
  assert.equal(parseApplyArgs([...base, '--apply', '--actor', 'ops@example.com', '--yes'], { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }).yes, true);
  assert.throws(() => parseApplyArgs([...base, '--yes'], { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080' }), /only makes sense with --apply/);
  assert.throws(() => parseApplyArgs([...base, '--execute'], {}), /Unknown option --execute/);
});

/* ---------------------------------------------------------------- the run -- */

test('the dry run reads and plans, and writes nothing', async () => {
  const documents = new Map();
  Object.entries(seed()).forEach(([collection, docs]) => Object.entries(docs).forEach(([id, data]) => documents.set(`${collection}/${id}`, data)));
  const store = readOnlyStore(documents);
  const report = await runUpwardRegrade({ db: store.db, FieldPath: FakeFieldPath, candidates: CANDIDATES, now: () => NOW });
  assert.deepEqual(store.attempts, []);
  assert.equal(report.mode, 'dry-run');
  assert.equal(report.execution, null);
  assert.equal(report.counts.byOutcome.raise, 3);
  assert.equal(report.counts.byOutcome[SKIP.ALREADY_RIGHT], 1);
  assert.equal(report.counts.byOutcome[SKIP.NOT_RIGHT_NOW], 1);
});

test('apply raises exactly the planned attempts as "Apply Corrected Grade" would, with an audit each, and leaves every other record alone', async () => {
  const db = new FakeFirestore(seed());
  const before = db.dump();
  let asked = 0;
  const report = await runUpwardRegrade({
    db, FieldPath: FakeFieldPath, candidates: CANDIDATES, mode: 'apply', actor: 'ops@example.com', now: () => NOW,
    confirm: async ({ counts }) => { asked += 1; assert.equal(counts.byOutcome.raise, 3); return true; },
  });
  assert.equal(asked, 1, 'asked once, before any write');
  assert.equal(report.execution.raised, 3);
  for (const tag of ['d-right', 'c-mirror-right', 'e-right']) {
    const { studentId, questionIndex, record } = ATTEMPTS[tag];
    const after = db.data('grades', studentId);
    const override = after.teacherGradeOverridesByAssignment[ASSIGNMENT_ID][String(questionIndex)];
    assert.equal(override.active, true, tag);
    assert.equal(override.score, 100, tag);
    assert.equal(override.source, UPWARD_REGRADE_SOURCE, tag);
    assert.equal(override.submissionId, record.lastSubmissionId, `${tag}: the override is for this very attempt`);
    assert.equal(teacherOverrideApplies(record, override), true, tag);
    assert.deepEqual(after.gradesByAssignment, before.grades[studentId].gradesByAssignment, `${tag}: the attempt itself is untouched (a teacher can restore it)`);
    // The platform's grade sync wakes on this: nothing here calls Classroom.
    assert.deepEqual(after.classroomReleaseSignals, { [ASSIGNMENT_ID]: { requestedAt: NOW, reason: 'manual-retry', source: UPWARD_REGRADE_SOURCE } }, tag);
    const audits = Object.values(db.dump()[`grades/${studentId}/gradeOverrideAudits`] || {});
    assert.equal(audits.length, 1, `${tag}: one audit record`);
    assert.equal(audits[0].type, UPWARD_REGRADE_SOURCE);
    assert.equal(audits[0].newScore, 100);
    assert.ok(audits[0].previousScore < 100);
    assert.equal(audits[0].actor.email, 'ops@example.com');
    assert.equal(audits[0].decision, 'D8');
    assert.equal(audits[0].runId, report.runId);
  }
  // The DOL item's section grade is recalculated; its close receipt is kept.
  const dol = db.data('grades', studentOf('e-right')).dolGradesByAssignment[ASSIGNMENT_ID]['2026-10-14'];
  assert.equal(dol.score, 100);
  assert.equal(dol.finalized, true);
  assert.equal(dol.recordedAt, '2026-10-14T15:30:00.000Z');
  assert.equal(dol.recalculatedAt, NOW);
  // The others: not one write.
  for (const tag of ['d-lower', 'd-wrong']) {
    assert.deepEqual(db.data('grades', studentOf(tag)), before.grades[studentOf(tag)], `${tag}: untouched`);
    assert.equal(db.writes.filter((write) => write.collection.startsWith(`grades/${studentOf(tag)}`) || write.id === studentOf(tag)).length, 0, tag);
  }
  const runAudit = Object.values(db.dump().adminAuditLog);
  assert.equal(runAudit.length, 1);
  assert.equal(runAudit[0].action, 'regrade_upward_d8');
  assert.equal(runAudit[0].actorEmail, 'ops@example.com');
  // A second run raises nothing more: the raised answers now carry an applying override.
  const again = await runUpwardRegrade({ db, FieldPath: FakeFieldPath, candidates: CANDIDATES, mode: 'apply', actor: 'ops@example.com', now: () => NOW, confirm: async () => true });
  assert.equal(again.counts.byOutcome.raise, 0);
  assert.equal(again.execution, null);
});

test('not confirmed: nothing is written; a teacher who acts between the plan and the write is not overwritten', async () => {
  const declined = new FakeFirestore(seed());
  const declinedReport = await runUpwardRegrade({ db: declined, FieldPath: FakeFieldPath, candidates: CANDIDATES, mode: 'apply', actor: 'ops@example.com', now: () => NOW, confirm: async () => false });
  assert.deepEqual(declinedReport.execution, { aborted: true });
  assert.deepEqual(declined.writes, []);

  const db = new FakeFirestore(seed());
  const { studentId, record } = ATTEMPTS['d-right'];
  const report = await runUpwardRegrade({
    db, FieldPath: FakeFieldPath, candidates: CANDIDATES, mode: 'apply', actor: 'ops@example.com', now: () => NOW,
    // While the operator reads the plan, the teacher sets this grade by hand.
    confirm: async () => {
      const grade = db.data('grades', studentId);
      grade.teacherGradeOverridesByAssignment = { [ASSIGNMENT_ID]: { 0: { active: true, score: 70, source: 'teacher-override', submissionId: record.lastSubmissionId, totalAttempts: record.totalAttempts, variantIndex: 0 } } };
      db.docsOf('grades').set(studentId, grade);
      return true;
    },
  });
  assert.equal(report.execution.raised, 2);
  assert.deepEqual(report.execution.changedSincePlan, { [SKIP.TEACHER_DECIDED]: 1 });
  assert.equal(db.data('grades', studentId).teacherGradeOverridesByAssignment[ASSIGNMENT_ID][0].score, 70, 'the teacher\'s 70 stands');
});

test('the step never calls Google Classroom; the grade reaches it through the platform\'s own sync', () => {
  for (const file of ['scripts/apply-upward-regrade.mjs', 'scripts/lib/upwardRegrade.mjs']) {
    const code = executableSource(readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8'));
    assert.doesNotMatch(code, /googleapis|classroom\.courses|patchGrade|classroomPushQueue|enqueueClassroomPushes/, `${file} talks to Classroom only through syncGradeToClassroom`);
  }
});
