/*
 * THE `accepted` GUARD WHERE THE SERVER ENFORCES IT: SUBMISSION INGESTION.
 *
 * HOW TO RUN: npm run test:callable-boundaries:emulator
 *
 * A Step Algebra step carries a boolean `accepted` verdict, and that is the
 * only `accepted` a student's device may send (#383): authoring uses the same
 * word for a list of accepted answers, so a string, list, object, number or
 * null there is answer-key material and the whole envelope is refused
 * (functions/shared/submissionEnvelope.mjs, forbiddenEnvelopeEntry). The shared
 * module is tested on its own in tests/platform/submissionAcceptedVerdict.test.mjs.
 * This suite is the server's side of it: a student signed in with a real
 * token sends crafted envelopes to the real ingestStudentSubmissions callable.
 *
 * The Firestore rules do not read `accepted` at all. A student cannot write
 * their grade document's records (tests/rules/gradeAuthorityRules.test.mjs), so
 * ingestion is the one door, and the guard is enforced there.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

const { NOTHING_CHANGED, changesBetween, db, projectSnapshot, shutdown, signedIn } = await import('./callableHost.mjs');
const { buildProgressEnvelope, buildSubmissionEnvelope } = await import('../../../functions/shared/submissionEnvelope.mjs');

const CLASS_ID = 'verdict-class';
const ASSIGNMENT_ID = 'verdict-assignment';
const STUDENT_ID = 'verdict-student';
const ANSWERS = ['2x+1', 'x+5'];

const question = (index) => ({
  questionId: `verdict-q${index}`, id: `verdict-q${index}`, type: 'literal', activityRole: 'classwork',
  prompt: `Verdict question ${index}`, solveFor: 'y', acceptedAnswers: [ANSWERS[index]],
});
const literal = (value) => ({ kind: 'scalar', type: 'literal', value, fields: [] });

// Every JSON value a crafted device can send as `accepted` that is not a boolean.
const NOT_A_VERDICT = [
  ['a string answer', 'x = 4'],
  ['an empty string', ''],
  ['the string "true"', 'true'],
  ['a list of answers', ['x = 4']],
  ['an empty list', []],
  ['a list of booleans', [true]],
  ['an object', { answer: 'x = 4' }],
  ['an empty object', {}],
  ['the number 1', 1],
  ['the number 0', 0],
  ['null', null],
];

/** What the device builds and sends: an honest envelope. */
const honest = ({ actionId, questionIndex, response, steps = undefined, previousTotalAttempts = 0 }) => buildSubmissionEnvelope({
  actionId,
  kind: 'ordinarySubmission',
  studentId: STUDENT_ID,
  assignmentId: ASSIGNMENT_ID,
  questionIndex,
  questionId: `verdict-q${questionIndex}`,
  activityRole: 'classwork',
  previousTotalAttempts,
  record: {
    totalAttempts: previousTotalAttempts + 1,
    attemptCount: previousTotalAttempts + 1,
    status: 'attempted',
    ...(steps ? { steps } : {}),
  },
  response,
  hasClassworkGrade: true,
});

/** The same envelope after a crafted client edits it on the wire. */
const crafted = (actionId, edit) => {
  const envelope = structuredClone(honest({ actionId, questionIndex: 0, response: literal(ANSWERS[0]) }));
  edit(envelope);
  return envelope;
};

// Where `accepted` can ride: where Step Algebra writes it, beside it, inside
// the student's response, on a step's raw work, and on the envelope itself.
const PLACES = [
  ['a step on the record', (envelope, value) => { envelope.record.steps = [{ label: 'Subtract 1', accepted: value }]; }],
  ['a step grade on the record', (envelope, value) => { envelope.record.stepGrades = [{ kind: 'balanced-operation', earned: 1, possible: 1, accepted: value }]; }],
  ['a field of the response', (envelope, value) => { envelope.response.fields = [{ id: 'y', value: ANSWERS[0], accepted: value }]; }],
  ['the step work of a step submission', (envelope, value) => { envelope.kind = 'stepSubmission'; envelope.stepWork = { version: 1, surface: 'equation', accepted: value }; }],
  ['the envelope itself', (envelope, value) => { envelope.accepted = value; }],
];

let student;
const UNREADABLE = (actionId) => ({ actionId, disposition: 'needs-review', reason: 'unreadable-envelope' });

before(async () => {
  await db.collection('classes').doc(CLASS_ID).set({
    name: 'Verdict class', course: 'algebra1', courseLevel: 'standard', period: 'Period 2',
    teacherOfRecord: 'verdict.teacher@district-one.test', status: 'active',
  });
  await db.collection('grades').doc(STUDENT_ID).set({
    displayName: STUDENT_ID, classId: CLASS_ID, classPeriod: 'Period 2', status: 'active',
    gradesByAssignment: {}, assignmentActivity: { [ASSIGNMENT_ID]: { totalTimeSeconds: 1800 } },
  });
  await db.collection('studentDirectory').doc('verdict.student@district-one.test').set({ studentId: STUDENT_ID });
  await db.collection('assignments').doc(ASSIGNMENT_ID).set({
    title: 'Verdict certification',
    assignedClassIds: [CLASS_ID],
    schemaVersion: 5,
    releaseAt: new Date(Date.now() - 86_400_000).toISOString(),
    dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    lateDueAt: new Date(Date.now() + 172_800_000).toISOString(),
    sections: [{ id: 'verdict-classwork', role: 'classwork', title: 'Classwork', questions: [question(0), question(1)] }],
    sectionAccess: { classwork: { defaultState: 'open', overridesByClassId: {} } },
  });
  student = await signedIn({ label: 'verdict-student', email: 'verdict.student@district-one.test' });
  assert.equal(student.claims.role, 'student');
});

after(shutdown);

test('the device itself refuses to build an envelope with a non-boolean accepted', () => {
  for (const [shape, value] of NOT_A_VERDICT) {
    assert.throws(
      () => honest({ actionId: 'device-check', questionIndex: 0, response: literal(ANSWERS[0]), steps: [{ accepted: value }] }),
      /may not carry answer keys/,
      shape,
    );
  }
});

test('every non-boolean accepted, wherever it rides, is refused at ingestion, and nothing is written anywhere', async () => {
  const envelopes = [
    ...NOT_A_VERDICT.map(([, value], index) => crafted(`shape-${index}`, (envelope) => PLACES[0][1](envelope, value))),
    ...PLACES.slice(1).map(([, edit], index) => crafted(`place-${index}`, (envelope) => edit(envelope, 'x = 4'))),
  ];
  assert.ok(envelopes.length <= 25, 'one call');
  const before = await projectSnapshot();
  const { receipts } = await student.call('ingestStudentSubmissions', { submissions: envelopes });
  assert.deepEqual(receipts, envelopes.map((envelope) => UNREADABLE(envelope.actionId)));
  assert.deepEqual(changesBetween(before, await projectSnapshot()), NOTHING_CHANGED);
});

test('a boolean verdict is ingested and graded, beside crafted envelopes refused in the same call', async () => {
  const submissions = [
    honest({ actionId: 'boolean-true', questionIndex: 0, response: literal(ANSWERS[0]), steps: [{ label: 'Subtract 1', accepted: true }] }),
    honest({ actionId: 'boolean-false', questionIndex: 1, response: literal('not it'), steps: [{ label: 'Divide by 0', accepted: false }] }),
    crafted('beside-string', (envelope) => { envelope.record.steps = [{ accepted: ANSWERS[0] }]; }),
    crafted('beside-object', (envelope) => { envelope.response.fields = [{ id: 'y', accepted: { value: ANSWERS[0] } }]; }),
  ];
  const { receipts } = await student.call('ingestStudentSubmissions', { submissions });
  assert.deepEqual(receipts.map((receipt) => [receipt.actionId, receipt.disposition]), [
    ['boolean-true', 'accepted'],
    ['boolean-false', 'accepted'],
    ['beside-string', 'needs-review'],
    ['beside-object', 'needs-review'],
  ]);

  const tracker = (await db.collection('grades').doc(STUDENT_ID).get()).data().gradesByAssignment[ASSIGNMENT_ID];
  assert.equal(tracker['0'].status, 'correct', 'the server graded the honest answer');
  assert.equal(tracker['0'].lastSubmissionId, 'boolean-true');
  assert.equal(tracker['1'].status, 'attempted');
  assert.equal(tracker['1'].lastSubmissionId, 'boolean-false');

  // And no document anywhere in the project holds an `accepted` that is not a boolean.
  const stray = [];
  const scan = (value, where) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, nested] of Object.entries(value)) {
      if (key === 'accepted' && typeof nested !== 'boolean') stray.push(`${where}.${key}`);
      scan(nested, `${where}.${key}`);
    }
  };
  for (const [docPath, { data }] of await projectSnapshot()) scan(data, docPath);
  assert.deepEqual(stray, []);
});

test('elapsed time cannot carry it in either: a progress envelope records the time and nothing it carried', async () => {
  const questionIndex = 1;
  // An attempt of its own on the question, so the time has a record to land on.
  const recorded = (await db.collection('grades').doc(STUDENT_ID).get()).data().gradesByAssignment?.[ASSIGNMENT_ID]?.[String(questionIndex)];
  const [attempt] = (await student.call('ingestStudentSubmissions', {
    submissions: [honest({
      actionId: 'progress-attempt', questionIndex, response: literal('still not it'),
      previousTotalAttempts: Number(recorded?.totalAttempts) || 0,
    })],
  })).receipts;
  assert.equal(attempt.disposition, 'accepted');
  const progress = {
    ...buildProgressEnvelope({
      actionId: 'progress-with-key', studentId: STUDENT_ID, assignmentId: ASSIGNMENT_ID, questionIndex,
      activityRole: 'classwork', timeSpentSeconds: 95,
    }),
    // Riding along: an answer list, and a forged verdict and record.
    accepted: [ANSWERS[questionIndex]],
    record: { status: 'correct', partialCredit: 100, accepted: [ANSWERS[questionIndex]] },
  };
  const recordBefore = (await db.collection('grades').doc(STUDENT_ID).get()).data().gradesByAssignment[ASSIGNMENT_ID][String(questionIndex)];
  const before = await projectSnapshot();
  const { receipts } = await student.call('ingestStudentSubmissions', { submissions: [progress] });
  assert.equal(receipts[0].actionId, 'progress-with-key');

  const changes = changesBetween(before, await projectSnapshot());
  assert.deepEqual(changes, { added: [], removed: [], changed: [`grades/${STUDENT_ID}`] });
  const recordAfter = (await db.collection('grades').doc(STUDENT_ID).get()).data().gradesByAssignment[ASSIGNMENT_ID][String(questionIndex)];
  assert.deepEqual(recordAfter, { ...recordBefore, timeSpent: recordAfter.timeSpent }, 'only the time moved');
  assert.equal(recordAfter.timeSpent, 95);
  assert.equal(recordAfter.status, 'attempted');
});
