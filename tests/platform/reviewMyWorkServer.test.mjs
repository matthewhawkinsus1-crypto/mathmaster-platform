import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { region, executableSource } from './helpers/sourceContract.mjs';
import { studentAssignmentOverrideId } from '../../functions/shared/studentAssignmentOverrides.mjs';
import { practicePassRedemptionId } from '../../functions/shared/classPointRewards.mjs';
import { responseInspectionEvidenceDocumentId } from '../../functions/shared/responseInspector.mjs';

/*
 * REVIEW MY WORK, SERVER SIDE (functions/lib/reviewMyWork.js).
 *
 * A student reads their own submitted answers, outcomes and the reason for a
 * teacher's grade change — records firestore.rules keep from every browser —
 * only for their own id, only on their class's assignment, only once it is
 * closed for them and feedback is released, never for a Test Cycle test, and
 * never with the teacher's note, identity or the grader internals.
 */

const require = createRequire(import.meta.url);
const reviewMyWork = require('../../functions/lib/reviewMyWork.js');
const { loadMyReviewWorkHandler, OUTCOME, SOLUTION_SOURCE, INTEGRITY_REASON_LABELS } = reviewMyWork;

const NOW = Date.parse('2026-10-07T18:00:00Z');
const STUDENT = 'stu-1';
const OTHER = 'stu-2';
const ASSIGNMENT = 'asg-1';
const CLASS = 'class-a';

/* ---------------------------------------------------------- in-memory db */

const snapshot = (id, data) => ({ id, exists: data !== undefined, data: () => (data === undefined ? undefined : structuredClone(data)) });

const fakeDb = (docs = {}) => {
  const reads = [];
  const docRef = (path) => ({
    path,
    get: async () => { reads.push(path); return snapshot(path.split('/').at(-1), docs[path]); },
    collection: (name) => collectionRef(`${path}/${name}`),
  });
  const collectionRef = (path) => {
    const filters = [];
    const query = {
      doc: (id) => docRef(`${path}/${id}`),
      where: (field, op, value) => { filters.push([field, value]); return query; },
      limit: () => query,
      get: async () => {
        reads.push(`${path}?${filters.map(([f, v]) => `${f}=${v}`).join('&')}`);
        const prefix = `${path}/`;
        const matches = Object.entries(docs)
          .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
          .filter(([, data]) => filters.every(([field, value]) => data?.[field] === value));
        return { docs: matches.map(([key, data]) => snapshot(key.split('/').at(-1), data)) };
      },
    };
    return query;
  };
  return { reads, collection: (name) => collectionRef(name) };
};

/* -------------------------------------------------------------- fixtures */

const literal = (id, answer, extra = {}) => ({
  questionId: id, type: 'literal', prompt: `Simplify ${id}`, acceptedAnswers: [answer], ...extra,
});

const baseAssignment = (overrides = {}) => ({
  schemaVersion: 5,
  title: 'Linear equations',
  assignedClassIds: [CLASS],
  dueAt: '2026-10-01T22:00:00Z',
  lateDueAt: '2026-10-03T22:00:00Z',
  sections: [
    { id: 's-wu', role: 'warmup', title: 'Warm-Up', questions: [literal('q0', '4'), literal('q1', '5')] },
    { id: 's-cw', role: 'classwork', title: 'Classwork', questions: [literal('q2', '6'), literal('q3', '7'), literal('q4', '8')] },
  ],
  ...overrides,
});

const record = (status, extra = {}) => ({
  status, totalAttempts: 1, variantIndex: 0, lastSubmissionId: `sub-${extra.id ?? 'x'}`, lastAttemptAt: '2026-10-02T15:00:00Z', ...extra,
});

const evidenceDoc = (index, rec, response, extra = {}) => ({
  assignmentId: ASSIGNMENT,
  questionIndex: index,
  submissionId: rec.lastSubmissionId,
  variantIndex: rec.variantIndex,
  totalAttempts: rec.totalAttempts,
  evidence: {
    schemaVersion: 3,
    submittedResponse: response,
    submissionProvenance: 'exact-server-ingested-snapshot',
    gradingTrace: { available: true, fields: [{ id: 'SECRET_TRACE', raw: 'x' }] },
    automaticResult: { isCorrect: false, parts: [{ id: 'SECRET_RESULT' }] },
    automaticScore: 37,
    graderVersion: 'ordinary-response-v3',
    ...extra,
  },
});

const world = ({ assignment = baseAssignment(), grade = {}, extraDocs = {} } = {}) => {
  const r0 = record('correct', { id: 0 });
  const r1 = record('attempted', { id: 1, partialCredit: 50, bestPartialCredit: 50 });
  const r2 = record('expired', { id: 2, totalAttempts: 2 });
  const r3 = record('expired', { id: 3 });
  const gradeDoc = {
    classId: CLASS,
    gradesByAssignment: { [ASSIGNMENT]: { 0: r0, 1: r1, 2: r2, 3: r3, 4: { status: 'unattempted' } } },
    ...grade,
  };
  const evidence = (index, rec, value) => [
    `grades/${STUDENT}/responseInspectionEvidence/${responseInspectionEvidenceDocumentId({ assignmentId: ASSIGNMENT, questionIndex: index })}`,
    evidenceDoc(index, rec, { kind: 'value', type: 'literal', value, internalNote: 'drop me' }),
  ];
  return fakeDb({
    [`assignments/${ASSIGNMENT}`]: assignment,
    [`grades/${STUDENT}`]: gradeDoc,
    [`grades/${OTHER}`]: { classId: CLASS, gradesByAssignment: { [ASSIGNMENT]: { 0: record('correct', { id: 'other' }) } } },
    ...Object.fromEntries([evidence(0, r0, '4'), evidence(1, r1, '5x'), evidence(2, r2, '\\frac{1}{2}'), evidence(3, r3, '9')]),
    ...extraDocs,
  });
};

const load = (db, data = { assignmentId: ASSIGNMENT }, { studentId = STUDENT, now = NOW } = {}) => (
  loadMyReviewWorkHandler({ db, auth: { uid: 'uid-1', studentId }, data, now })
);

const rejects = (promise, code) => assert.rejects(promise, (error) => {
  assert.equal(error.code, code, error.message);
  return true;
});

/* ------------------------------------------------------------------ tests */

test('reads ONLY the caller\'s own records — a studentId in the request is ignored', async () => {
  const db = world();
  const result = await load(db, { assignmentId: ASSIGNMENT, studentId: OTHER });
  assert.equal(result.questions.length, 5);
  assert.equal(result.questions[0].submittedResponse.value, '4');
  assert.ok(db.reads.every((path) => !path.includes(OTHER)), `never touches another student: ${db.reads.join(', ')}`);
  assert.ok(db.reads.includes(`grades/${STUDENT}`));
});

test('refuses a caller without a student identity', async () => {
  await rejects(loadMyReviewWorkHandler({ db: world(), auth: { uid: 'u' }, data: { assignmentId: ASSIGNMENT, studentId: STUDENT }, now: NOW }), 'permission-denied');
  await rejects(loadMyReviewWorkHandler({ db: world(), auth: null, data: { assignmentId: ASSIGNMENT }, now: NOW }), 'permission-denied');
});

test('refuses while the assignment is still open for this student — including their own extension', async () => {
  await rejects(load(world(), undefined, { now: Date.parse('2026-10-02T12:00:00Z') }), 'failed-precondition');
  // No final close at all: never "closed", never revealed.
  await rejects(load(world({ assignment: baseAssignment({ dueAt: null, lateDueAt: null }) })), 'failed-precondition');
  // The class closed on Oct 3, but THIS student's private extension runs to Oct 10.
  const extended = world({ extraDocs: {
    [`studentAssignmentOverrides/${studentAssignmentOverrideId(STUDENT, ASSIGNMENT)}`]: { lateDueAt: '2026-10-10T22:00:00Z' },
  } });
  await rejects(load(extended), 'failed-precondition');
});

test('refuses while teacher-release feedback is held, and opens once it is released', async () => {
  const quiz = (released) => baseAssignment({
    feedbackReleased: released,
    sections: [{ id: 's-q', role: 'quiz', title: 'Quiz', questions: [literal('q0', '4')] }],
  });
  await rejects(load(world({ assignment: quiz(false) })), 'failed-precondition');
  const result = await load(world({ assignment: quiz(true) }));
  assert.equal(result.questions.length, 1);
});

test('refuses a secure Test Cycle test (job B owns its review)', async () => {
  await rejects(load(world({ assignment: baseAssignment({ assessmentPolicy: { mode: 'testCycle' } }) })), 'failed-precondition');
  await rejects(load(world({ assignment: baseAssignment({ secure: true }) })), 'failed-precondition');
});

test('refuses an assignment not assigned to the student\'s current class', async () => {
  await rejects(load(world({ assignment: baseAssignment({ assignedClassIds: ['class-z'] }) })), 'permission-denied');
  await rejects(load(world({ grade: { classId: null } })), 'permission-denied');
});

test('outcomes come from the effective grade: correct, partial, incorrect, not answered', async () => {
  const { questions } = await load(world());
  assert.deepEqual(questions.map((row) => row.outcome), [
    OUTCOME.CORRECT, OUTCOME.PARTIAL, OUTCOME.INCORRECT, OUTCOME.INCORRECT, OUTCOME.NOT_ANSWERED,
  ]);
  assert.deepEqual(questions.map((row) => row.credit), [100, 50, 0, 0, 0]);
  assert.equal(questions[4].submittedResponse, null);
  assert.equal(questions[2].sectionTitle, 'Classwork');
  assert.equal(questions[2].sectionRole, 'classwork');
  assert.equal(questions[0].prompt, 'Simplify q0');
});

test('a teacher correction changes the outcome and carries its fixed reason label — never the note', async () => {
  const r3 = record('expired', { id: 3 });
  const override = {
    active: true, score: 100, fieldOverrides: {}, updatedAt: '2026-10-04T10:00:00Z', source: 'teacher-override',
    automaticScore: 0, submissionId: r3.lastSubmissionId, lastAttemptAt: r3.lastAttemptAt, variantIndex: 0, totalAttempts: 1,
  };
  const db = world({
    grade: { teacherGradeOverridesByAssignment: { [ASSIGNMENT]: { 3: override } } },
    extraDocs: {
      [`grades/${STUDENT}/gradeOverrideAudits/a1`]: {
        assignmentId: ASSIGNMENT, questionIndex: 3, type: 'teacher-override', at: '2026-10-04T10:00:00Z',
        reason: 'Equivalent answer accepted by teacher', note: 'PRIVATE NOTE about the kid',
        actor: { uid: 't-1', email: 'teacher@school.org', name: 'Ms T' }, overrideActiveAfter: true, newScore: 100,
      },
      [`grades/${STUDENT}/gradeOverrideAudits/a0`]: {
        assignmentId: ASSIGNMENT, questionIndex: 3, type: 'teacher-override', at: '2026-10-04T09:00:00Z',
        reason: 'Other', note: 'older', actor: { email: 'teacher@school.org' }, overrideActiveAfter: true,
      },
    },
  });
  const { questions } = await load(db);
  assert.equal(questions[3].outcome, OUTCOME.CORRECT);
  assert.equal(questions[3].credit, 100);
  assert.equal(questions[3].teacherChanged, true);
  assert.equal(questions[3].teacherReason, 'Equivalent answer accepted by teacher');
  assert.equal(questions[2].teacherChanged, false);
  assert.equal(questions[2].teacherReason, null);
});

test('a reason that is not one of the fixed labels is not shown', async () => {
  const r3 = record('expired', { id: 3 });
  const db = world({
    grade: { teacherGradeOverridesByAssignment: { [ASSIGNMENT]: { 3: {
      active: true, score: 40, updatedAt: 'T', submissionId: r3.lastSubmissionId, variantIndex: 0, totalAttempts: 1,
    } } } },
    extraDocs: { [`grades/${STUDENT}/gradeOverrideAudits/a1`]: {
      assignmentId: ASSIGNMENT, questionIndex: 3, at: 'T', reason: 'Free text the teacher typed', overrideActiveAfter: true,
    } },
  });
  const { questions } = await load(db);
  assert.equal(questions[3].outcome, OUTCOME.PARTIAL);
  assert.equal(questions[3].teacherChanged, true);
  assert.equal(questions[3].teacherReason, null);
});

test('integrity zeros show their reason label and nothing else', async () => {
  const sectionZero = {
    active: true, score: 0, persistent: true, source: 'teacher-section-zero', reasonCode: 'cellPhoneUse',
    reason: 'Prohibited cellphone use', note: 'SECTION NOTE', actor: { email: 'teacher@school.org' }, participantRole: 'individual',
  };
  const db = world({ grade: { teacherGradeOverridesByAssignment: { [ASSIGNMENT]: {
    0: sectionZero, 1: { ...sectionZero, reason: 'Typed by hand: see me after class' },
    __sectionIntegrity_warmup: { active: true, previousOverridesByQuestion: { 0: { note: 'PRIOR NOTE' } } },
    __assignment: { active: true, score: 0, reason: 'Account or laptop switching', note: 'ASSIGNMENT NOTE', actor: { email: 'teacher@school.org' } },
  } } } });
  const result = await load(db);
  assert.equal(result.questions[0].outcome, OUTCOME.INCORRECT);
  assert.equal(result.questions[0].credit, 0);
  assert.equal(result.questions[0].teacherChanged, true);
  assert.equal(result.questions[0].teacherReason, 'Prohibited cellphone use');
  // A reason that is not one of the fixed labels is never shown, even on an integrity zero.
  assert.equal(result.questions[1].teacherChanged, true);
  assert.equal(result.questions[1].teacherReason, null);
  assert.deepEqual(result.assignmentChange, { reason: 'Account or laptop switching' });
  const text = JSON.stringify(result);
  for (const secret of ['NOTE', 'teacher@school.org', 'participantRole', 'reasonCode', 'previousOverridesByQuestion']) {
    assert.ok(!text.includes(secret), `leaked ${secret}`);
  }
});

test('never returns a note, an actor, an email, the grading trace or grader internals', async () => {
  const r3 = record('expired', { id: 3 });
  const db = world({
    grade: { teacherGradeOverridesByAssignment: { [ASSIGNMENT]: { 3: {
      active: true, score: 100, updatedAt: 'T', submissionId: r3.lastSubmissionId, variantIndex: 0, totalAttempts: 1, automaticScore: 0,
    } } } },
    extraDocs: { [`grades/${STUDENT}/gradeOverrideAudits/a1`]: {
      assignmentId: ASSIGNMENT, questionIndex: 3, at: 'T', reason: 'Other', note: 'PRIVATE NOTE',
      actor: { uid: 't-1', email: 'teacher@school.org', name: 'Ms T' }, overrideActiveAfter: true,
    } },
  });
  const text = JSON.stringify(await load(db));
  for (const secret of ['PRIVATE NOTE', 'teacher@school.org', 'Ms T', 't-1', 'gradingTrace', 'SECRET_TRACE',
    'automaticResult', 'SECRET_RESULT', 'automaticScore', 'submissionProvenance', 'graderVersion', 'internalNote', '"actor"', '"note"']) {
    assert.ok(!text.includes(secret), `leaked ${secret}`);
  }
});

test('the submitted answer is reduced to kind/type/value/fields', () => {
  const sanitized = reviewMyWork.sanitizeSubmittedResponse({
    kind: 'fields', type: 'multiAnswer', value: '', secret: 'x',
    fields: [{ id: 'a', value: '3', isComplete: true, grading: 'x' }, { value: 'no id' }],
  });
  assert.deepEqual(sanitized, { kind: 'fields', type: 'multiAnswer', value: '', fields: [{ id: 'a', value: '3', isComplete: true }] });
});

test('evidence from an earlier attempt is not passed off as this answer; the recorded parts are used instead', async () => {
  const r0 = record('correct', { id: 0, partGrades: [{ id: 'f1', label: 'x', isCorrect: true, response: '4' }] });
  const db = world({ grade: { gradesByAssignment: { [ASSIGNMENT]: { 0: { ...r0, lastSubmissionId: 'sub-newer' } } } } });
  const { questions } = await load(db);
  assert.equal(questions[0].responseSource, 'recorded');
  assert.deepEqual(questions[0].submittedResponse.fields, [{ id: 'f1', value: '4', isComplete: false }]);
});

test('the solution is for the version the student saw: the delivered instance, or none', async () => {
  const algebra = { questionId: 'alg', type: 'algebra', prompt: 'Solve', variantGenerator: { kind: 'x' }, answer: 999 };
  const r0 = record('attempted', { id: 0 });
  const assignment = baseAssignment({ sections: [{ id: 's', role: 'classwork', title: 'Classwork', questions: [algebra, { ...algebra, questionId: 'alg2' }] }] });
  const delivered = { ...algebra, answer: 3, equation: '2x+1=7' };
  const db = fakeDb({
    [`assignments/${ASSIGNMENT}`]: assignment,
    [`grades/${STUDENT}`]: { classId: CLASS, gradesByAssignment: { [ASSIGNMENT]: { 0: r0, 1: record('attempted', { id: 1 }) } } },
    [`grades/${STUDENT}/responseInspectionEvidence/${ASSIGNMENT}__q0`]: evidenceDoc(0, r0, { kind: 'value', value: '3' }, {
      deliveredInstanceAuthority: { authoritative: true, question: delivered },
    }),
  });
  const { questions } = await load(db);
  assert.equal(questions[0].solutionSource, SOLUTION_SOURCE.DELIVERED);
  assert.equal(questions[0].deliveredQuestion.answer, 3);
  // A generated question with no kept instance: the template would answer a different version.
  assert.equal(questions[1].solutionSource, SOLUTION_SOURCE.UNAVAILABLE);
  assert.equal(questions[1].deliveredQuestion, null);
  // A fixed question is its own delivered instance.
  const plain = await load(world());
  assert.equal(plain.questions[0].solutionSource, SOLUTION_SOURCE.ASSIGNMENT);
  assert.deepEqual(plain.questions[0].deliveredQuestion.acceptedAnswers, ['4']);
});

test('excused work and items this student was not responsible for read as excused', async () => {
  const excusedDb = world({ extraDocs: {
    [`studentAssignmentOverrides/${studentAssignmentOverrideId(STUDENT, ASSIGNMENT)}`]: { excused: true },
  } });
  const excused = await load(excusedDb);
  assert.equal(excused.excused, true);
  assert.ok(excused.questions.every((row) => row.outcome === OUTCOME.EXCUSED));

  const withPractice = baseAssignment({ sections: [
    ...baseAssignment().sections,
    { id: 's-p', role: 'practice', title: 'Practice', questions: [literal('q5', '1')] },
  ] });
  const passDb = world({ assignment: withPractice, extraDocs: {
    [`classPointRewardRedemptions/${practicePassRedemptionId({ studentId: STUDENT, classId: CLASS, assignmentId: ASSIGNMENT })}`]: { status: 'redeemed' },
  } });
  const pass = await load(passDb);
  assert.equal(pass.questions[5].outcome, OUTCOME.EXCUSED);
  assert.equal(pass.questions[4].outcome, OUTCOME.NOT_ANSWERED);
});

test('teacher-excluded questions are left out', async () => {
  const assignment = baseAssignment();
  assignment.sections[1].questions[2].teacherExcluded = true;
  const { questions } = await load(world({ assignment }));
  assert.deepEqual(questions.map((row) => row.index), [0, 1, 2, 3]);
});

/* --------------------------------------------------- the index.js wiring */

const indexSource = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');

test('index.js: loadMyReviewWork is identified by requireStudent, never by the request data', () => {
  const hunk = region(indexSource, 'exports.loadMyReviewWork = onCall(', '}));');
  assert.match(hunk, /auth:\s*requireStudent\(request\)/);
  assert.match(hunk, /require\("\.\/lib\/reviewMyWork"\)\.loadMyReviewWorkHandler\(/);
  assert.doesNotMatch(executableSource(hunk), /studentId/);
});

test('the integrity labels shown to students are exactly index.js ASSIGNMENT_ZERO_REASONS', () => {
  const block = region(indexSource, 'const ASSIGNMENT_ZERO_REASONS = Object.freeze({', '});');
  const labels = [...block.matchAll(/:\s*"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual([...INTEGRITY_REASON_LABELS].sort(), labels.sort());
});

/* ---------------------------------------- verifier: more doors that stay shut */

test('refuses work the teacher has hidden from students: archived, paused, or an authoring draft', async () => {
  await rejects(load(world({ assignment: baseAssignment({ archived: true }) })), 'failed-precondition');
  await rejects(load(world({ assignment: baseAssignment({ unpublished: true }) })), 'failed-precondition');
  await rejects(load(world({ assignment: baseAssignment({ authoringState: 'incomplete' }) })), 'failed-precondition');
  await rejects(load(world({ assignment: baseAssignment({ authoringReview: { state: 'needsReview' } }) })), 'failed-precondition');
  // A published, unarchived assignment still opens.
  const open = await load(world({ assignment: baseAssignment({ authoringState: 'published', archived: false, unpublished: false }) }));
  assert.equal(open.questions.length, 5);
});

test('refuses an older Test Cycle declared by gradingPurpose + rolePolicy + a Review section', async () => {
  const legacyCycle = baseAssignment({
    gradingPurpose: 'test',
    deliveryPolicy: { sectionGating: 'rolePolicy' },
    sections: [
      { id: 's-r', role: 'review', title: 'Review', questions: [literal('q0', '4')] },
      { id: 's-t', role: 'test', title: 'Test', questions: [literal('q1', '5')] },
    ],
    feedbackReleased: true,
  });
  await rejects(load(world({ assignment: legacyCycle })), 'failed-precondition');
});

test('a missing grades document and a missing assignment are refusals, never an empty review', async () => {
  const db = fakeDb({ [`assignments/${ASSIGNMENT}`]: baseAssignment() });
  await rejects(load(db), 'failed-precondition');
  await rejects(load(world(), { assignmentId: 'no-such-assignment' }), 'not-found');
});

test('another student\'s id as the assignment id reads nothing of theirs', async () => {
  const db = world();
  await rejects(load(db, { assignmentId: OTHER }), 'not-found');
  assert.ok(db.reads.every((path) => !path.startsWith(`grades/${OTHER}`)), db.reads.join(', '));
});

test('an assignment id that is a path is refused before anything is read', async () => {
  const db = world({ extraDocs: { [`assignments/${ASSIGNMENT}/private/answers`]: baseAssignment() } });
  await rejects(load(db, { assignmentId: `${ASSIGNMENT}/private/answers` }), 'invalid-argument');
  assert.deepEqual(db.reads, []);
});
