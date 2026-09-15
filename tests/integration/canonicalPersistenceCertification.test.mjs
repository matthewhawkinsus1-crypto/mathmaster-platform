/*
 * CANONICAL STUDENT PERSISTENCE — END-TO-END CERTIFICATION.
 *
 * HOW TO RUN:  npm run test:canonical-persistence
 *
 * WHY THIS EXISTS. tests/platform proves the RULES: that a rejection is
 * classified, that ordering per question is preserved, that a forged verdict is
 * overruled. Every one of those was green on September 14 while students'
 * Warm-Up and Classwork attempts were not reaching
 * `grades/{studentId}.gradesByAssignment` at all. A rule can be right while the
 * wiring is wrong — a field path that does not exist, a transaction that writes
 * nothing, an authorization read that happens after the state it guards.
 *
 * So this drives the REAL `ingestStudentSubmissions` callable against a REAL
 * Firestore and reads back what actually landed in the document a teacher's
 * gradebook and Google Classroom passback both read.
 *
 * THE HARNESS NEVER SUPPLIES A VERDICT IT WANTS BACK. Where a question is
 * server-gradeable the student sends only their raw response, so a passing
 * assertion means the SERVER marked it.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  ASSIGNMENT_ID, CLASS_ID, OTHER_CLASS_ID, PREFIX, STUDENT_A, STUDENT_B, TEACHER_EMAIL,
  STUDENT_C, certAssignment, db, fns, ingest, patchGradeCalls, readGradeDoc, readRecord,
  refusal, resetClassroomCalls, runClassroomSync, seedFixture, seedRosteredStudent, studentRequest,
  submissionEnvelope, teacherRequest, teardownFixture,
} from './canonicalPersistenceHarness.mjs';

before(seedFixture);
after(teardownFixture);

/* ==========================================================================
 * 1 & 2. AN ORDINARY SUBMIT REACHES CANONICAL GRADES, AND A TEACHER SEES IT.
 * ======================================================================== */

test('1. an online ordinary Submit reaches grades/{studentId}.gradesByAssignment', async () => {
  const receipts = await ingest(STUDENT_A, [submissionEnvelope({
    actionId: `${PREFIX}-a-q0-attempt-1`,
    questionIndex: 0,
    response: { kind: 'scalar', type: 'literal', value: '2x+1', fields: [] },
  })]);
  assert.equal(receipts[0].disposition, 'accepted');
  assert.equal(receipts[0].gradedBy, 'server', 'the server must mark a question it can mark');

  const record = await readRecord(STUDENT_A, 0);
  assert.equal(record.totalAttempts, 1);
  assert.equal(record.status, 'correct');
  assert.equal(record.lastSubmissionId, `${PREFIX}-a-q0-attempt-1`);
});

test('2 & 21. the teacher gradebook reads that question as attempted, from the canonical document', async () => {
  // The teacher's view is `gradesByAssignment` — the same document, read the
  // way the gradebook reads it, not a projection built for this test.
  const grade = await readGradeDoc(STUDENT_A);
  const tracker = grade.gradesByAssignment[ASSIGNMENT_ID];
  assert.ok(tracker, 'the assignment must have a tracker on the canonical document');
  assert.equal(Number(tracker['0'].totalAttempts) > 0, true, 'question 0 must read as attempted');
  assert.equal(tracker['1'], undefined, 'a question with no attempt must stay unattempted');
  // Support usage rides the same write as the attempt, so a teacher never sees
  // a grade whose accommodations record is one submission behind.
  assert.ok(grade.supportUsageByAssignment?.[ASSIGNMENT_ID], 'support usage must be written with the attempt');
});

test('a receipt is issued so the device knows the work landed', async () => {
  const receipts = await db.collection('studentSubmissionReceipts')
    .where('studentId', '==', STUDENT_A).where('assignmentId', '==', ASSIGNMENT_ID).get();
  const ids = receipts.docs.map((snapshot) => snapshot.data().actionId);
  assert.ok(ids.includes(`${PREFIX}-a-q0-attempt-1`));
});

/* ==========================================================================
 * 15 & 16. IDEMPOTENCY AND STALENESS, AGAINST A REAL DOCUMENT.
 * ======================================================================== */

test('15. delivering the same submission twice produces one attempt', async () => {
  const envelope = submissionEnvelope({
    actionId: `${PREFIX}-a-q0-attempt-1`,
    questionIndex: 0,
    response: { kind: 'scalar', type: 'literal', value: '2x+1', fields: [] },
  });
  const receipts = await ingest(STUDENT_A, [envelope]);
  assert.equal(receipts[0].disposition, 'duplicate', 'a replay must read as a duplicate, never as a fresh acceptance');
  assert.equal(receipts[0].reason, 'receipt-already-issued');
  assert.equal((await readRecord(STUDENT_A, 0)).totalAttempts, 1);
});

test('16. a stale envelope cannot roll a newer canonical attempt backward', async () => {
  // A second legitimate attempt lands...
  await ingest(STUDENT_B, [submissionEnvelope({
    actionId: `${PREFIX}-b-q2-attempt-1`,
    questionIndex: 2,
    previousTotalAttempts: 0,
    response: { kind: 'scalar', type: 'literal', value: 'wrong', fields: [] },
  })]);
  await ingest(STUDENT_B, [submissionEnvelope({
    actionId: `${PREFIX}-b-q2-attempt-2`,
    questionIndex: 2,
    previousTotalAttempts: 1,
    response: { kind: 'scalar', type: 'literal', value: 'x-4', fields: [] },
  })]);
  assert.equal((await readRecord(STUDENT_B, 2)).totalAttempts, 2);
  assert.equal((await readRecord(STUDENT_B, 2)).status, 'correct');

  // ...and a device that was offline arrives holding the FIRST attempt's shape.
  const receipts = await ingest(STUDENT_B, [submissionEnvelope({
    actionId: `${PREFIX}-b-q2-stale`,
    questionIndex: 2,
    previousTotalAttempts: 0,
    response: { kind: 'scalar', type: 'literal', value: 'wrong', fields: [] },
  })]);
  assert.equal(receipts[0].disposition, 'superseded');
  const record = await readRecord(STUDENT_B, 2);
  assert.equal(record.totalAttempts, 2, 'the newer attempt must survive');
  assert.equal(record.status, 'correct');
});

/* ==========================================================================
 * 13 & 14. A TEACHER CLOSING A SECTION MUST NOT ERASE WORK ALREADY DONE.
 * ======================================================================== */

test('13 & 14. Classwork closed AFTER the capture still records the attempt', async () => {
  const capturedAt = Date.now() - 600_000;
  await db.collection('assignments').doc(ASSIGNMENT_ID).update({
    'sectionAccess.classwork.overridesByClassId': {
      [CLASS_ID]: { state: 'closed', changedAt: new Date().toISOString(), changedBy: TEACHER_EMAIL },
    },
  });

  const receipts = await ingest(STUDENT_A, [submissionEnvelope({
    actionId: `${PREFIX}-a-q1-during-open`,
    questionIndex: 1,
    capturedAt,
    response: { kind: 'scalar', type: 'literal', value: 'x+5', fields: [] },
  })]);
  assert.equal(receipts[0].disposition, 'accepted', 'work captured while the section was open must still count');
  assert.equal((await readRecord(STUDENT_A, 1)).totalAttempts, 1);
});

test('a submission captured AFTER the close is refused, and says why', async () => {
  const receipts = await ingest(STUDENT_A, [submissionEnvelope({
    actionId: `${PREFIX}-a-q3-after-close`,
    questionIndex: 3,
    capturedAt: Date.now() + 60_000,
    response: { kind: 'scalar', type: 'literal', value: '9', fields: [] },
  })]);
  assert.equal(receipts[0].disposition, 'permanently-invalid');
  assert.equal(receipts[0].reason, 'section-closed-at-capture');
  const grade = await readGradeDoc(STUDENT_A);
  assert.equal(grade.gradesByAssignment[ASSIGNMENT_ID]['3'], undefined, 'no grade may be written for refused work');
});

test('the capture-time section proof carries work whose close time was never recorded', async () => {
  // A close with no `changedAt` is the unprovable case. The section state the
  // browser recorded at capture is the witness a later teacher edit cannot
  // rewrite, and it is what keeps this attempt.
  await db.collection('assignments').doc(ASSIGNMENT_ID).update({
    'sectionAccess.classwork.overridesByClassId': { [CLASS_ID]: { state: 'closed' } },
  });
  const receipts = await ingest(STUDENT_B, [submissionEnvelope({
    actionId: `${PREFIX}-b-q1-proofed`,
    questionIndex: 1,
    capturedAt: Date.now() - 900_000,
    capturedSectionAccess: { role: 'classwork', enabled: true, isOpen: true, status: 'open', overrideChangedAt: null },
    response: { kind: 'scalar', type: 'literal', value: 'x+5', fields: [] },
  })]);
  assert.equal(receipts[0].disposition, 'accepted');

  // Without the proof the same shape is kept for review rather than graded or
  // destroyed — which is the behaviour the incident needed and did not have.
  const unprovable = await ingest(STUDENT_B, [submissionEnvelope({
    actionId: `${PREFIX}-b-q3-unprovable`,
    questionIndex: 3,
    capturedAt: Date.now() - 900_000,
    response: { kind: 'scalar', type: 'literal', value: '9', fields: [] },
  })]);
  assert.equal(unprovable[0].disposition, 'needs-review');
  assert.equal(unprovable[0].reason, 'section-close-time-unknown');

  await db.collection('assignments').doc(ASSIGNMENT_ID).update({
    'sectionAccess.classwork.overridesByClassId': {},
  });
});

/* ==========================================================================
 * 23. SECURITY: A BROWSER MAY NOT SUPPLY A GRADE.
 * ======================================================================== */

test('23. a forged correct verdict is overruled by the server marking the raw response', async () => {
  await ingest(STUDENT_B, [submissionEnvelope({
    actionId: `${PREFIX}-b-q0-forged`,
    questionIndex: 0,
    record: { totalAttempts: 1, attemptCount: 1, status: 'correct', partialCredit: 100, bestPartialCredit: 100 },
    response: { kind: 'scalar', type: 'literal', value: 'definitely not the answer', fields: [] },
  })]);
  const record = await readRecord(STUDENT_B, 0);
  assert.equal(record.status, 'attempted', 'the server verdict must win');
  assert.equal(record.partialCredit, 0);
  assert.equal(record.gradedBy, 'server');
});

test('23. one student cannot write into another student’s grade document', async () => {
  const failure = await refusal(fns.ingestStudentSubmissions.run(studentRequest(STUDENT_B, {
    submissions: [{ ...submissionEnvelope({ actionId: `${PREFIX}-cross-student`, questionIndex: 4 }), studentId: STUDENT_A }],
  })));
  // The envelope's studentId is overwritten with the caller's, so this is
  // accepted for B and can never touch A.
  assert.equal(failure, null);
  const grade = await readGradeDoc(STUDENT_A);
  assert.equal(grade.gradesByAssignment[ASSIGNMENT_ID]['4'], undefined);
});

test('23. a teacher cannot call the student submission ingestion path', async () => {
  const failure = await refusal(fns.ingestStudentSubmissions.run(teacherRequest({
    submissions: [submissionEnvelope({ actionId: `${PREFIX}-teacher-call`, questionIndex: 0 })],
  })));
  assert.equal(failure?.code, 'permission-denied');
});

test('23. a secure Test Cycle assignment never accepts an ordinary submission', async () => {
  await db.collection('assignments').doc(`${PREFIX}-secure`).set({
    ...certAssignment(),
    assessmentPolicy: { mode: 'testCycle' },
  });
  const receipts = await ingest(STUDENT_A, [submissionEnvelope({
    actionId: `${PREFIX}-secure-attempt`,
    assignmentId: `${PREFIX}-secure`,
    questionIndex: 0,
    response: { kind: 'scalar', type: 'literal', value: '2x+1', fields: [] },
  })]);
  assert.equal(receipts[0].disposition, 'permanently-invalid');
  assert.equal(receipts[0].reason, 'secure-assignment-excluded');
});

test('23. an envelope carrying an answer key is refused outright', async () => {
  const receipts = await ingest(STUDENT_A, [{
    ...submissionEnvelope({ actionId: `${PREFIX}-smuggled`, questionIndex: 0 }),
    record: { totalAttempts: 1, status: 'correct', acceptedAnswers: ['2x+1'] },
  }]);
  assert.equal(receipts[0].disposition, 'needs-review');
  assert.equal(receipts[0].reason, 'unreadable-envelope');
});

/* ==========================================================================
 * 22. CLASSROOM PASSBACK STILL WAKES FROM A CANONICAL GRADE WRITE.
 * ======================================================================== */

test('22. a canonical grade write from server ingestion drives Classroom passback', async () => {
  // A finished assignment, answered one question at a time through the same
  // ingestion path a student's Chromebook uses. The trigger posts a STAGE, not
  // a keystroke, so a partially answered tracker legitimately posts nothing —
  // proving passback needs a student who actually finished.
  const answers = ['2x+1', 'x+5', 'x-4', '9'];
  for (let index = 0; index < answers.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    const receipts = await ingest(STUDENT_C, [submissionEnvelope({
      actionId: `${PREFIX}-c-q${index}`,
      questionIndex: index,
      response: { kind: 'scalar', type: 'literal', value: answers[index], fields: [] },
    })]);
    assert.equal(receipts[0].disposition, 'accepted');
  }
  const finished = await readGradeDoc(STUDENT_C);
  assert.ok(
    finished.classworkGradesByAssignment?.[ASSIGNMENT_ID],
    'finishing the classwork must write the completion projection that unlocks dependent work',
  );

  resetClassroomCalls();
  await runClassroomSync(STUDENT_C, {});
  const patches = patchGradeCalls();
  assert.ok(patches.length >= 1, 'the grades trigger must post the canonical score to Classroom');
  assert.equal(patches.at(-1).courseWorkId, `${PREFIX}-coursework`);
  assert.equal(patches.at(-1).grade, 100, 'four correct answers must post as full credit');
});

/* ==========================================================================
 * THE TEACHER RECOVERY REPORT, ON REAL DATA.
 * ======================================================================== */

test('the recovery report counts canonical attempts and is scoped to the teacher of record', async () => {
  const report = await fns.getStudentPersistenceRecoveryReport.run(teacherRequest({
    assignmentId: ASSIGNMENT_ID, classId: CLASS_ID,
  }));
  const rowA = report.students.find((student) => student.studentId === STUDENT_A);
  assert.ok(rowA, 'the report must include every student in the class');
  // Student A answered questions 0 and 1; question 3 was captured after the
  // close and correctly refused, so it is a receipt but not an attempt.
  assert.equal(rowA.canonicalAttempted, 2);
  assert.equal(rowA.recoveredAttempts, 2, 'only accepted receipts count as recovered attempts');
  assert.equal(rowA.expectedQuestionCount, 4);

  const refused = await refusal(fns.getStudentPersistenceRecoveryReport.run(
    teacherRequest({ assignmentId: ASSIGNMENT_ID, classId: CLASS_ID }, 'someone.else@desotoisd.org'),
  ));
  assert.equal(refused?.code, 'permission-denied');
});

test('the recovery report refuses a class the assignment was never assigned to', async () => {
  const refused = await refusal(fns.getStudentPersistenceRecoveryReport.run(teacherRequest({
    assignmentId: ASSIGNMENT_ID, classId: OTHER_CLASS_ID,
  })));
  assert.equal(refused?.code, 'failed-precondition');
});

test('a device queue report is stored under the calling student and nobody else', async () => {
  await fns.reportStudentDeviceQueue.run(studentRequest(STUDENT_A, {
    deviceId: 'chromebook-01',
    summary: {
      summarySchemaVersion: 2,
      queued: 5,
      queuedGradeBearing: 5,
      needsReview: 1,
      blockedReasons: { 'delivery-error:offline': 2 },
      // Two pending for THIS assignment; three for a different one.
      queuedByAssignment: { [ASSIGNMENT_ID]: 2, 'some-other-assignment': 3 },
      queuedGradeBearingByAssignment: { [ASSIGNMENT_ID]: 2, 'some-other-assignment': 3 },
      needsReviewByAssignment: { [ASSIGNMENT_ID]: 1 },
    },
  }));
  const report = await fns.getStudentPersistenceRecoveryReport.run(teacherRequest({
    assignmentId: ASSIGNMENT_ID, classId: CLASS_ID,
  }));
  const rowA = report.students.find((student) => student.studentId === STUDENT_A);
  assert.equal(rowA.deviceQueues.length, 1);
  assert.equal(rowA.deviceQueues[0].deviceId, 'chromebook-01');

  // THE NUMBER THE ASSIGNMENT REPORT SHOWS IS THIS ASSIGNMENT'S.
  assert.equal(rowA.deviceQueues[0].assignmentQueueKnown, true);
  assert.equal(rowA.deviceQueues[0].queuedGradeBearingForAssignment, 2);
  assert.equal(rowA.deviceQueues[0].needsReviewForAssignment, 1);
  // The device-wide total is still available, and labelled as device-wide.
  assert.equal(rowA.deviceQueues[0].deviceWideQueuedGradeBearing, 5);
  assert.equal(report.totals.queuedOnDevices, 2, 'the class total must count only this assignment');

  assert.ok(rowA.needsReview.some(
    (item) => item.source === 'deviceQueue' && item.reason === 'delivery-error:offline' && item.scope === 'device-wide',
  ));
});

test('a device that reported only an aggregate is never read as this assignment\u2019s count', async () => {
  // The release before the breakdown existed. Its three queued submissions all
  // belong to a different assignment, and showing "3" here would tell a teacher
  // work is outstanding on the assignment in front of them when none is.
  await fns.reportStudentDeviceQueue.run(studentRequest(STUDENT_B, {
    deviceId: 'legacy-chromebook',
    summary: { queued: 3, queuedGradeBearing: 3, needsReview: 0 },
  }));
  const report = await fns.getStudentPersistenceRecoveryReport.run(teacherRequest({
    assignmentId: ASSIGNMENT_ID, classId: CLASS_ID,
  }));
  const rowB = report.students.find((student) => student.studentId === STUDENT_B);
  const legacy = rowB.deviceQueues.find((queue) => queue.deviceId === 'legacy-chromebook');
  assert.ok(legacy, 'the legacy device must still appear in the report');
  assert.equal(legacy.assignmentQueueKnown, false);
  assert.equal(legacy.queuedGradeBearingForAssignment, null, 'the aggregate must not be reinterpreted');
  assert.equal(legacy.deviceWideQueuedGradeBearing, 3, 'the aggregate is still reported, as an aggregate');
  assert.equal(legacy.summarySchemaVersion, 1);
  assert.ok(
    report.totals.devicesWithoutAssignmentBreakdown >= 1,
    'the report must say how many devices could not answer per assignment',
  );
});

/* ==========================================================================
 * A SWEEP MUST NOT STOP AT 200 AND CALL ITSELF DONE.
 *
 * Thirty students and a dozen Classwork questions is more than 200 active
 * checkpoints. The first version read one page and returned, so a teacher was
 * told the assignment had been swept when only its first 200 records had been
 * looked at — and the rest of the class's work stayed lost.
 * ======================================================================== */

test('a sweep pages past 200 checkpoints and only reports complete when it is', async () => {
  const CHECKPOINT_COUNT = 260;
  const writer = [];
  for (let index = 0; index < CHECKPOINT_COUNT; index += 1) {
    const studentId = `${PREFIX}-sweep-student-${String(index % 30).padStart(2, '0')}`;
    writer.push(db.collection('studentResponseCheckpoints').doc(`${PREFIX}-sweep-${String(index).padStart(4, '0')}`).set({
      schemaVersion: 2,
      documentId: `${PREFIX}-sweep-${String(index).padStart(4, '0')}`,
      studentId,
      assignmentId: ASSIGNMENT_ID,
      classId: CLASS_ID,
      questionIndex: index % 4,
      questionId: `${PREFIX}-q${index % 4}`,
      variantIndex: 0,
      activityRole: 'classwork',
      revision: 1,
      response: { kind: 'scalar', type: 'literal', value: '2x+1', fields: [] },
      isComplete: true,
      previousTotalAttempts: 0,
      // Deliberately NULL: the hint the scheduled due query can never select,
      // which is exactly what the sweep exists to reach.
      candidateFinalizeAt: null,
      status: 'active',
      secure: false,
    }));
  }
  await Promise.all(writer);

  const first = await fns.sweepStudentResponseCheckpoints.run(teacherRequest({
    assignmentId: ASSIGNMENT_ID, classId: CLASS_ID,
  }));
  assert.ok(first.examined > 200, `a sweep examined only ${first.examined}; it must page past one batch`);
  assert.ok(first.pages >= 2, 'more than one page must have been read');
  assert.equal(first.complete, true, 'every matching checkpoint was reachable, so the sweep is complete');
  assert.equal(first.nextCursor, null);

  // Every one of them was decided, so none is still in the sweep's working set.
  const stillActive = await db.collection('studentResponseCheckpoints')
    .where('assignmentId', '==', ASSIGNMENT_ID)
    .where('classId', '==', CLASS_ID)
    .where('status', '==', 'active')
    .count().get();
  assert.equal(
    stillActive.data().count,
    0,
    'a complete sweep must leave nothing it never looked at',
  );
});

test('a bounded sweep resumes deterministically and never re-reads a held checkpoint', async () => {
  // Re-seed a smaller set and drive the cursor by hand, which is what a
  // truncated call hands back.
  const ids = Array.from({ length: 12 }, (_unused, index) => `${PREFIX}-cursor-${String(index).padStart(2, '0')}`);
  await Promise.all(ids.map((id, index) => db.collection('studentResponseCheckpoints').doc(id).set({
    schemaVersion: 2,
    documentId: id,
    studentId: STUDENT_B,
    assignmentId: ASSIGNMENT_ID,
    classId: CLASS_ID,
    questionIndex: index % 4,
    questionId: `${PREFIX}-q${index % 4}`,
    variantIndex: 0,
    activityRole: 'classwork',
    revision: 1,
    response: { kind: 'scalar', type: 'literal', value: 'not right', fields: [] },
    isComplete: true,
    previousTotalAttempts: 0,
    candidateFinalizeAt: null,
    status: 'active',
    secure: false,
  })));

  // Resume after the sixth id: the continuation must examine only what is
  // beyond the cursor, in the same document order.
  const resumed = await fns.sweepStudentResponseCheckpoints.run(teacherRequest({
    assignmentId: ASSIGNMENT_ID, classId: CLASS_ID, cursor: ids[5],
  }));
  assert.equal(resumed.complete, true);
  assert.ok(resumed.examined <= 6, `a resumed sweep examined ${resumed.examined}; it must not restart from the beginning`);

  // The ones before the cursor were never touched by that call.
  const untouched = await db.collection('studentResponseCheckpoints').doc(ids[0]).get();
  assert.equal(untouched.data().status, 'active', 'documents before the cursor must be left for the next pass');
});

/* ==========================================================================
 * 25. THIRTY STUDENTS SUBMITTING AT ONCE.
 * ======================================================================== */

test('25. thirty students submitting concurrently each get exactly one canonical attempt', async () => {
  const studentIds = Array.from({ length: 30 }, (_unused, index) => `${PREFIX}-load-${String(index).padStart(2, '0')}`);
  await Promise.all(studentIds.map((studentId) => db.collection('grades').doc(studentId).set({
    displayName: studentId, classId: CLASS_ID, classPeriod: 'Period 1',
    assignedTeacherEmail: TEACHER_EMAIL, status: 'active', gradesByAssignment: {},
  })));

  const results = await Promise.all(studentIds.map((studentId) => ingest(studentId, [submissionEnvelope({
    actionId: `${studentId}-q0`,
    questionIndex: 0,
    response: { kind: 'scalar', type: 'literal', value: '2x+1', fields: [] },
  })])));
  results.forEach((receipts, index) => {
    assert.equal(receipts[0].disposition, 'accepted', `${studentIds[index]} must be accepted`);
  });

  const records = await Promise.all(studentIds.map((studentId) => readRecord(studentId, 0)));
  records.forEach((record, index) => {
    assert.equal(record.totalAttempts, 1, `${studentIds[index]} must have exactly one attempt`);
    assert.equal(record.status, 'correct');
  });
});

/* ==========================================================================
 * 26. A DEVICE REPORT IS A SNAPSHOT: A DRAINED ASSIGNMENT KEY MUST DISAPPEAR.
 *
 * `set(..., { merge: true })` merges Firestore maps RECURSIVELY. A device that
 * reported `queuedGradeBearingByAssignment.assignmentA = 1` and then drained it
 * sends a summary with no `assignmentA` key at all — and a recursive merge
 * leaves the stale `1` exactly where it was, forever. Nothing in the system
 * ever removes it, so the assignment reads as permanently `persistencePending`,
 * its Classroom passback stays `sync-pending` for the rest of the year, and the
 * teacher recovery report shows queued work on an empty Chromebook.
 *
 * This is the whole reason the report is written as a full `set()`.
 * ======================================================================== */

const SNAPSHOT_STUDENT = `${PREFIX}-snapshot-student`;
const SNAPSHOT_DEVICE = 'snapshot-chromebook';
const SNAPSHOT_REPORT_ID = `${encodeURIComponent(SNAPSHOT_STUDENT)}__${SNAPSHOT_DEVICE}`;
const OTHER_ASSIGNMENT_B = `${PREFIX}-assignment-b`;
const OTHER_ASSIGNMENT_C = `${PREFIX}-assignment-c`;

/*
 * A report as the current client sends one: generation-stamped.
 *
 * `reportGeneration` defaults to a fresh monotonic value so the ordinary case
 * behaves like production. Passing one explicitly is how the race below drives
 * arrival order independently of capture order. Passing `null` reproduces a
 * device on the release before generations existed.
 */
let nextHarnessGeneration = Date.now();
const reportQueue = (studentId, deviceId, queuedGradeBearingByAssignment, reportGeneration) =>
  fns.reportStudentDeviceQueue.run(studentRequest(studentId, {
    deviceId,
    ...(reportGeneration === null
      ? {}
      : { reportGeneration: reportGeneration ?? (nextHarnessGeneration += 1) }),
    summary: {
      summarySchemaVersion: 2,
      queued: Object.values(queuedGradeBearingByAssignment).reduce((total, count) => total + count, 0),
      queuedGradeBearing: Object.values(queuedGradeBearingByAssignment).reduce((total, count) => total + count, 0),
      queuedByAssignment: queuedGradeBearingByAssignment,
      queuedGradeBearingByAssignment,
      needsReview: 0,
    },
  }));

const readDeviceReport = async () =>
  (await db.collection('studentDevicePersistenceReports').doc(SNAPSHOT_REPORT_ID).get()).data() || {};

const persistenceRowFor = async (studentId) => {
  const report = await fns.getStudentPersistenceRecoveryReport.run(teacherRequest({
    assignmentId: ASSIGNMENT_ID, classId: CLASS_ID,
  }));
  return report.students.find((student) => student.studentId === studentId);
};

test('26. a queued count that reaches zero stops being stored, and the pending flag clears with it', async () => {
  await seedRosteredStudent(SNAPSHOT_STUDENT);
  const key = encodeURIComponent(ASSIGNMENT_ID);
  const otherKey = encodeURIComponent(OTHER_ASSIGNMENT_B);

  /*
   * A SECOND ASSIGNMENT IS ALWAYS ON THE DEVICE, AND THAT IS THE POINT.
   *
   * A Chromebook holding work for exactly one assignment is the one case a
   * recursive merge happens to get right: an entirely EMPTY map replaces
   * rather than merges. The real Chromebook has yesterday's assignment on it
   * too, so the map is never empty, and that is the shape where a stale key
   * survives forever. Every step below therefore keeps assignment B queued.
   */
  await reportQueue(SNAPSHOT_STUDENT, SNAPSHOT_DEVICE, { [ASSIGNMENT_ID]: 2, [OTHER_ASSIGNMENT_B]: 1 });
  assert.equal((await readDeviceReport()).queuedGradeBearingByAssignment[key], 2);
  let row = await persistenceRowFor(SNAPSHOT_STUDENT);
  assert.equal(row.persistencePending, true);
  assert.ok(row.persistencePendingReasons.includes('device-queue'));

  // Report A = 1. The device drained one.
  await reportQueue(SNAPSHOT_STUDENT, SNAPSHOT_DEVICE, { [ASSIGNMENT_ID]: 1, [OTHER_ASSIGNMENT_B]: 1 });
  assert.equal((await readDeviceReport()).queuedGradeBearingByAssignment[key], 1);
  assert.equal((await persistenceRowFor(SNAPSHOT_STUDENT)).persistencePending, true);

  // Report A = 0 explicitly. A zero the device DID send must read as zero.
  await reportQueue(SNAPSHOT_STUDENT, SNAPSHOT_DEVICE, { [ASSIGNMENT_ID]: 0, [OTHER_ASSIGNMENT_B]: 1 });
  assert.equal((await readDeviceReport()).queuedGradeBearingByAssignment[key], 0);
  assert.equal((await persistenceRowFor(SNAPSHOT_STUDENT)).persistencePending, false);

  // Report A OMITTED — the real shape. `summarizeDurableOutbox` builds the map
  // from the rows that exist, so an assignment with nothing left queued has no
  // key at all. This is what a recursive merge cannot represent.
  await reportQueue(SNAPSHOT_STUDENT, SNAPSHOT_DEVICE, { [OTHER_ASSIGNMENT_B]: 1 });
  const drained = await readDeviceReport();
  assert.equal(
    Object.hasOwn(drained.queuedGradeBearingByAssignment, key),
    false,
    'an omitted assignment key must no longer be stored — a stale one is false queued work forever',
  );
  assert.deepEqual(
    Object.keys(drained.queuedByAssignment),
    [otherKey],
    'every assignment map is a snapshot: only what the device last said survives',
  );

  row = await persistenceRowFor(SNAPSHOT_STUDENT);
  assert.equal(row.deviceQueues[0].queuedGradeBearingForAssignment, 0);
  assert.equal(row.persistencePending, false, 'the pending flag must clear once nothing is queued');
  assert.deepEqual(row.persistencePendingReasons, []);
  // The other assignment's real queued work is untouched by all of this.
  assert.equal(drained.queuedGradeBearingByAssignment[otherKey], 1);

  // The report is still a report: the device is still listed, and the history
  // that is deliberately carried forward survived the replacement.
  assert.equal(drained.deviceId, SNAPSHOT_DEVICE);
  assert.ok(drained.firstReportedAt, 'first-reported history is carried forward across snapshots');
});

test('26. an assignment the device has stopped reporting does not survive under a new one', async () => {
  // Assignment B drained; the device now only has work for assignment C. B must
  // not still read as queued, or B is held as sync-pending on C's evidence.
  await reportQueue(SNAPSHOT_STUDENT, SNAPSHOT_DEVICE, { [OTHER_ASSIGNMENT_B]: 4 });
  const withB = await readDeviceReport();
  assert.equal(withB.queuedGradeBearingByAssignment[encodeURIComponent(OTHER_ASSIGNMENT_B)], 4);

  await reportQueue(SNAPSHOT_STUDENT, SNAPSHOT_DEVICE, { [OTHER_ASSIGNMENT_C]: 1 });
  const withC = await readDeviceReport();
  assert.equal(
    Object.hasOwn(withC.queuedGradeBearingByAssignment, encodeURIComponent(OTHER_ASSIGNMENT_B)),
    false,
    'assignment B must not survive a report that only mentions assignment C',
  );
  assert.equal(withC.queuedGradeBearingByAssignment[encodeURIComponent(OTHER_ASSIGNMENT_C)], 1);
  assert.deepEqual(
    Object.keys(withC.queuedGradeBearingByAssignment),
    [encodeURIComponent(OTHER_ASSIGNMENT_C)],
    'the stored map is exactly what the device last said, and nothing else',
  );
});

/* ==========================================================================
 * 27. LOCAL CLASSWORK COMPLETION CANNOT BECOME CANONICAL.
 *
 * `classworkGradesByAssignment` opens the next assignment through
 * `prerequisiteAccess`, so it is a completion projection with real academic
 * consequences. The browser used to compute it from its own tracker — the local
 * overlay, which contains attempts still sitting in that Chromebook's durable
 * queue and never seen by canonical grades. A student could therefore be marked
 * Classwork-complete, and unlocked, on evidence the gradebook cannot support.
 *
 * The browser now asks and the server decides, from canonical records only.
 * ======================================================================== */

const CLASSWORK_STUDENT = `${PREFIX}-classwork-student`;

test('27. a Classwork completion the browser believes in is not written while an attempt is still queued', async () => {
  await seedRosteredStudent(CLASSWORK_STUDENT);

  // Three of four Classwork questions have reached canonical grades. The
  // fourth is captured and still queued on the Chromebook — it is NOT ingested
  // here, which is exactly the state the local tracker cannot distinguish from
  // "answered". Locally the student has answered all four and put in well over
  // the engagement minimum, so the old browser rule said: complete.
  const answers = ['2x+1', 'x+5', 'x-4'];
  for (let index = 0; index < answers.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    const receipts = await ingest(CLASSWORK_STUDENT, [submissionEnvelope({
      actionId: `${PREFIX}-classwork-q${index}`,
      questionIndex: index,
      response: { kind: 'scalar', type: 'literal', value: answers[index], fields: [] },
    })]);
    assert.equal(receipts[0].disposition, 'accepted');
  }

  const partial = await readGradeDoc(CLASSWORK_STUDENT);
  assert.equal(
    partial.classworkGradesByAssignment?.[ASSIGNMENT_ID],
    undefined,
    'three of four canonical attempts is 75%, under the 80% rule — nothing may be recorded',
  );

  // THE ACTIVITY FLUSH. Engagement time is saved, and the server is asked to
  // look again. The call carries an assignment id and nothing else.
  const refused = await fns.reconcileAssignmentActivityProjection.run(
    studentRequest(CLASSWORK_STUDENT, { assignmentId: ASSIGNMENT_ID }),
  );
  assert.equal(refused.reconciled, false);
  assert.equal(refused.reason, 'completion-not-met');
  assert.equal(refused.classworkGrade, null);
  assert.equal(refused.completion.completionPercent, 75, 'the server counted CANONICAL attempts, not the local four');

  const stillPartial = await readGradeDoc(CLASSWORK_STUDENT);
  assert.equal(
    stillPartial.classworkGradesByAssignment?.[ASSIGNMENT_ID],
    undefined,
    'an activity flush must not be able to write a completion the canonical record does not support',
  );

  // The queued attempt finally reaches the server. NOW the evidence supports it.
  await ingest(CLASSWORK_STUDENT, [submissionEnvelope({
    actionId: `${PREFIX}-classwork-q3`,
    questionIndex: 3,
    response: { kind: 'scalar', type: 'literal', value: '9', fields: [] },
  })]);
  const complete = await readGradeDoc(CLASSWORK_STUDENT);
  assert.equal(
    complete.classworkGradesByAssignment?.[ASSIGNMENT_ID]?.score,
    100,
    'ingestion derives the projection from canonical records the moment they support it',
  );
});

test('27. the activity reconciliation writes the projection when TIME alone completes the rule', async () => {
  // The one case ingestion cannot see: the completion rule has an engagement
  // term, so the threshold can be crossed after the last response was already
  // ingested and nothing is left to trigger a recomputation.
  const timeStudent = `${PREFIX}-time-student`;
  await seedRosteredStudent(timeStudent);
  await db.collection('grades').doc(timeStudent).update({ assignmentActivity: { [ASSIGNMENT_ID]: { totalTimeSeconds: 60 } } });

  const answers = ['2x+1', 'x+5', 'x-4', '9'];
  for (let index = 0; index < answers.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await ingest(timeStudent, [submissionEnvelope({
      actionId: `${PREFIX}-time-q${index}`,
      questionIndex: index,
      response: { kind: 'scalar', type: 'literal', value: answers[index], fields: [] },
    })]);
  }
  // All four answered, but only a minute of engagement: under the rule.
  assert.equal(
    (await readGradeDoc(timeStudent)).classworkGradesByAssignment?.[ASSIGNMENT_ID],
    undefined,
  );

  // The student keeps working. The activity flush saves the time, then asks.
  await db.collection('grades').doc(timeStudent).update({ assignmentActivity: { [ASSIGNMENT_ID]: { totalTimeSeconds: 1800 } } });
  const reconciled = await fns.reconcileAssignmentActivityProjection.run(
    studentRequest(timeStudent, { assignmentId: ASSIGNMENT_ID }),
  );
  assert.equal(reconciled.reconciled, true);
  assert.equal(reconciled.classworkGrade.score, 100);
  assert.equal(
    (await readGradeDoc(timeStudent)).classworkGradesByAssignment?.[ASSIGNMENT_ID]?.score,
    100,
  );

  // It is idempotent, and it writes nothing the second time.
  const again = await fns.reconcileAssignmentActivityProjection.run(
    studentRequest(timeStudent, { assignmentId: ASSIGNMENT_ID }),
  );
  assert.equal(again.reconciled, false);
  assert.equal(again.reason, 'already-recorded');
});

test('27. one student cannot reconcile another student’s completion projection', async () => {
  // The callable takes an assignment id and derives the student from the token,
  // so there is no student id to forge. A teacher has no student token at all.
  const denied = await refusal(fns.reconcileAssignmentActivityProjection.run(
    teacherRequest({ assignmentId: ASSIGNMENT_ID }),
  ));
  assert.equal(denied?.code, 'permission-denied');
});

/* ==========================================================================
 * 28. AN UNRECOVERABLE DISCREPANCY, CLOSED BY A NAMED HUMAN.
 *
 * `session-summary-gap` withholds a final Classroom passback while a student's
 * own session says they worked more questions than the gradebook can account
 * for. That is the right alarm and it can be permanently true — a queued
 * response proven invalid, a reimaged Chromebook, presence counting something
 * that was never going to become an attempt. Left alone the assignment never
 * passes back for the rest of the year.
 *
 * It is NOT timed out. A gate that expires protects nobody, because work that
 * really is still recoverable looks identical on the clock.
 * ======================================================================== */

const GAP_STUDENT = `${PREFIX}-gap-student`;
const OTHER_TEACHER_EMAIL = 'canon.other.teacher@desotoisd.org';
const RESOLUTION_ID = `${encodeURIComponent(GAP_STUDENT)}__${encodeURIComponent(ASSIGNMENT_ID)}`;

const readResolution = async () =>
  (await db.collection('studentPersistenceResolutions').doc(RESOLUTION_ID).get()).data() || null;

const resolveRequest = (overrides = {}, email = TEACHER_EMAIL) => teacherRequest({
  studentId: GAP_STUDENT,
  assignmentId: ASSIGNMENT_ID,
  classId: CLASS_ID,
  reason: 'IT reimaged the Chromebook on the 16th; the queued responses are gone.',
  acknowledgedWorked: 4,
  acknowledgedCanonicalAttempted: 2,
  ...overrides,
}, email);

test('28. a session/canonical gap blocks finality until a teacher of record resolves it', async () => {
  await seedRosteredStudent(GAP_STUDENT);
  // Two questions reached canonical grades.
  const answers = ['2x+1', 'x+5'];
  for (let index = 0; index < answers.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await ingest(GAP_STUDENT, [submissionEnvelope({
      actionId: `${PREFIX}-gap-q${index}`,
      questionIndex: index,
      response: { kind: 'scalar', type: 'literal', value: answers[index], fields: [] },
    })]);
  }
  // The student's own session says they worked four.
  await db.collection('studentSessionSummaries').doc(`${PREFIX}-gap-session`).set({
    studentId: GAP_STUDENT, assignmentId: ASSIGNMENT_ID, classId: CLASS_ID,
    authorizedTeacherEmails: [TEACHER_EMAIL], answered: 4, activeSeconds: 1800,
    endedAt: new Date().toISOString(),
  });

  const row = await persistenceRowFor(GAP_STUDENT);
  assert.equal(row.persistencePending, true);
  assert.deepEqual(row.persistencePendingReasons, ['session-summary-gap']);
  assert.equal(row.unaccountedForQuestions, 2, 'the discrepancy the teacher has to see');
  assert.equal(row.persistenceResolution, null, 'nothing is resolved yet');
});

test('28. an unauthorized caller cannot resolve a persistence hold', async () => {
  // A teacher who is not the teacher of record for this class.
  const otherTeacher = await refusal(fns.resolveStudentPersistenceHold.run(resolveRequest({}, OTHER_TEACHER_EMAIL)));
  assert.equal(otherTeacher?.code, 'permission-denied');

  // A student, including the student the hold is about.
  const student = await refusal(fns.resolveStudentPersistenceHold.run(studentRequest(GAP_STUDENT, {
    studentId: GAP_STUDENT, assignmentId: ASSIGNMENT_ID, classId: CLASS_ID, reason: 'let me through',
    acknowledgedWorked: 4, acknowledgedCanonicalAttempted: 2,
  })));
  assert.equal(student?.code, 'permission-denied');

  // The right teacher, but a class this student is not in.
  const wrongClass = await refusal(fns.resolveStudentPersistenceHold.run(resolveRequest({ classId: OTHER_CLASS_ID })));
  assert.ok(['permission-denied', 'failed-precondition'].includes(wrongClass?.code), wrongClass?.code);

  // The right teacher and class, but a different class's student.
  const wrongStudent = await refusal(fns.resolveStudentPersistenceHold.run(
    resolveRequest({ studentId: `${PREFIX}-not-a-student` }),
  ));
  assert.equal(wrongStudent?.code, 'not-found');

  // No reason recorded.
  const noReason = await refusal(fns.resolveStudentPersistenceHold.run(resolveRequest({ reason: '   ' })));
  assert.equal(noReason?.code, 'invalid-argument');

  // Numbers that are not the ones on screen: a confirmation opened ten minutes
  // ago describes a discrepancy that may no longer be the discrepancy.
  const stale = await refusal(fns.resolveStudentPersistenceHold.run(resolveRequest({ acknowledgedWorked: 9 })));
  assert.equal(stale?.code, 'failed-precondition');
  assert.match(stale.message, /changed since/);

  assert.equal(await readResolution(), null, 'not one refused call may leave a record behind');
  assert.equal((await persistenceRowFor(GAP_STUDENT)).persistencePending, true);
});

test('28. the teacher of record resolves it, with an audit trail and without creating a grade', async () => {
  const before = await readGradeDoc(GAP_STUDENT);

  const result = await fns.resolveStudentPersistenceHold.run(resolveRequest());
  assert.equal(result.success, true);
  assert.equal(result.acknowledgedWorked, 4);
  assert.equal(result.acknowledgedCanonicalAttempted, 2);

  // THE RECORD. Actor, timestamp, reason, and the discrepancy it covers.
  const resolution = await readResolution();
  assert.equal(resolution.studentId, GAP_STUDENT);
  assert.equal(resolution.assignmentId, ASSIGNMENT_ID);
  assert.equal(resolution.classId, CLASS_ID);
  assert.equal(resolution.resolvedByEmail, TEACHER_EMAIL);
  assert.ok(resolution.resolvedAt, 'a resolution without a time is not an audit record');
  assert.match(resolution.reason, /reimaged/);
  assert.equal(resolution.acknowledgedWorked, 4);
  assert.equal(resolution.acknowledgedCanonicalAttempted, 2);

  // An entry in the administrator's audit log, naming the actor.
  const audit = await db.collection('adminAuditLog')
    .where('action', '==', 'student_persistence_hold_resolved').get();
  const entry = audit.docs.map((doc) => doc.data()).find((data) => data.target === `${GAP_STUDENT}__${ASSIGNMENT_ID}`);
  assert.ok(entry, 'the resolution must be in the administrator audit log');
  assert.equal(entry.actorEmail, TEACHER_EMAIL);
  assert.equal(entry.details.worked, 4);
  assert.equal(entry.details.canonicalAttempted, 2);

  // NOTHING ACADEMIC CHANGED. No grade, no attempt, no zero, no correctness.
  const after = await readGradeDoc(GAP_STUDENT);
  assert.deepEqual(
    after.gradesByAssignment,
    before.gradesByAssignment,
    'resolving a hold must not touch one question record',
  );
  assert.equal(
    after.classworkGradesByAssignment?.[ASSIGNMENT_ID],
    before.classworkGradesByAssignment?.[ASSIGNMENT_ID],
  );
  assert.equal(Object.keys(after.gradesByAssignment[ASSIGNMENT_ID] || {}).length, 2, 'still two attempts, not four');

  // The hold is released, and the row says who closed it — the discrepancy
  // itself is still reported, because it really happened.
  const row = await persistenceRowFor(GAP_STUDENT);
  assert.equal(row.persistencePending, false);
  assert.deepEqual(row.persistencePendingReasons, []);
  assert.deepEqual(row.persistenceResolvedReasons, ['session-summary-gap']);
  assert.equal(row.persistenceResolution.resolvedByEmail, TEACHER_EMAIL);
  assert.equal(row.unaccountedForQuestions, 2, 'the gap is closed, not erased');
});

test('28. new concrete queued evidence reactivates the hold a resolution had closed', async () => {
  // A Chromebook that had not reconnected comes back and reports one
  // grade-bearing submission still queued for this assignment. That is concrete
  // recoverable evidence: it raises its own reason, which no resolution
  // suppresses, and the hard hold is active again.
  await reportQueue(GAP_STUDENT, 'late-chromebook', { [ASSIGNMENT_ID]: 1 });

  const row = await persistenceRowFor(GAP_STUDENT);
  assert.equal(row.persistencePending, true, 'newly reported queued work must block finality again');
  assert.deepEqual(row.persistencePendingReasons, ['device-queue']);

  // And the hold may not be resolved away while that work is still reachable:
  // the teacher is sent to recover it instead.
  const refused = await refusal(fns.resolveStudentPersistenceHold.run(resolveRequest()));
  assert.equal(refused?.code, 'failed-precondition');
  assert.match(refused.message, /device-queue/);

  // Session evidence growing past what was acknowledged is a DIFFERENT
  // discrepancy from the one the teacher looked at, so the gap returns too.
  await reportQueue(GAP_STUDENT, 'late-chromebook', {});
  assert.equal((await persistenceRowFor(GAP_STUDENT)).persistencePending, false);
  await db.collection('studentSessionSummaries').doc(`${PREFIX}-gap-session`).update({ answered: 9 });
  const grown = await persistenceRowFor(GAP_STUDENT);
  assert.equal(grown.persistencePending, true);
  assert.deepEqual(grown.persistencePendingReasons, ['session-summary-gap']);
  assert.equal(grown.persistenceResolution.supersededByNewEvidence, true);

  // Put the evidence back where the resolution covers it.
  await db.collection('studentSessionSummaries').doc(`${PREFIX}-gap-session`).update({ answered: 4 });
  assert.equal((await persistenceRowFor(GAP_STUDENT)).persistencePending, false);
});

/* ==========================================================================
 * 29. FINAL CLASSROOM PASSBACK RESUMES ONLY WHEN PERSISTENCE IS GENUINELY CLEAR.
 * ======================================================================== */

const PASSBACK_STUDENT = `${PREFIX}-passback-student`;

test('29. a final grade is withheld while evidence is outstanding and posts once it is clear', async () => {
  await seedRosteredStudent(PASSBACK_STUDENT);
  const answers = ['2x+1', 'x+5', 'x-4', '9'];
  for (let index = 0; index < answers.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await ingest(PASSBACK_STUDENT, [submissionEnvelope({
      actionId: `${PREFIX}-passback-q${index}`,
      questionIndex: index,
      response: { kind: 'scalar', type: 'literal', value: answers[index], fields: [] },
    })]);
  }

  // A Chromebook still holding one grade-bearing submission for this
  // assignment. The gradebook looks finished; it is not.
  await reportQueue(PASSBACK_STUDENT, 'passback-chromebook', { [ASSIGNMENT_ID]: 1 });
  resetClassroomCalls();
  await runClassroomSync(PASSBACK_STUDENT, {});
  assert.equal(
    patchGradeCalls().length,
    0,
    'a final-looking partial grade is more dangerous than a delayed one',
  );

  // And the audit says WHY, rather than saying nothing.
  const heldAudit = await db.collection('classroomGradeSyncs')
    .where('studentId', '==', PASSBACK_STUDENT).get();
  const held = heldAudit.docs.map((doc) => doc.data()).find((data) => data.status === 'sync-pending');
  assert.ok(held, 'a withheld passback must leave an audit row saying it was withheld');
  assert.equal(held.isFinal, false);
  assert.deepEqual(held.persistencePendingReasons, ['device-queue']);

  // The device drains and reports it. Persistence is genuinely clear now.
  await reportQueue(PASSBACK_STUDENT, 'passback-chromebook', {});
  resetClassroomCalls();
  await runClassroomSync(PASSBACK_STUDENT, {});
  const patches = patchGradeCalls();
  assert.ok(patches.length >= 1, 'the passback must resume once the evidence clears');
  assert.equal(patches.at(-1).grade, 100);
});

test('29. a resolved unrecoverable gap lets the same passback finish', async () => {
  // Same student, now with a session gap and no concrete recoverable evidence:
  // presence says nine, the gradebook can prove four, and nothing is left
  // anywhere to recover. Without a resolution this assignment never passes back.
  await db.collection('studentSessionSummaries').doc(`${PREFIX}-passback-session`).set({
    studentId: PASSBACK_STUDENT, assignmentId: ASSIGNMENT_ID, classId: CLASS_ID,
    authorizedTeacherEmails: [TEACHER_EMAIL], answered: 9, activeSeconds: 2400,
    endedAt: new Date().toISOString(),
  });
  resetClassroomCalls();
  await runClassroomSync(PASSBACK_STUDENT, {});
  assert.equal(patchGradeCalls().length, 0, 'the gap withholds the final grade');

  await fns.resolveStudentPersistenceHold.run(teacherRequest({
    studentId: PASSBACK_STUDENT, assignmentId: ASSIGNMENT_ID, classId: CLASS_ID,
    reason: 'Presence counted a tab left open in another class period.',
    acknowledgedWorked: 9, acknowledgedCanonicalAttempted: 4,
  }));

  resetClassroomCalls();
  await runClassroomSync(PASSBACK_STUDENT, {});
  const patches = patchGradeCalls();
  assert.ok(patches.length >= 1, 'an acknowledged unrecoverable gap must let finalization proceed');
  assert.equal(
    patches.at(-1).grade,
    100,
    'and it finalizes on the CANONICAL evidence that exists — no zeros are manufactured for the gap',
  );
});

/* ==========================================================================
 * 30. EVERY DEVICE IS INSPECTED BEFORE A FINAL GRADE, NOT THE FIRST TEN.
 *
 * The safety read was `.limit(10)` with no ordering. A student with eleven
 * device rows — a class set of Chromebooks, a browser-storage reset, the old
 * unstable fallback id minting a row per report — could have the ONE device
 * still holding an unsynced answer omitted from the read. The total came back
 * zero and the final grade went out over the top of real work.
 * ======================================================================== */

const MANY_DEVICE_STUDENT = `${PREFIX}-many-device-student`;

test('30. the eleventh device still holding queued work withholds the final grade', async () => {
  await seedRosteredStudent(MANY_DEVICE_STUDENT);
  const answers = ['2x+1', 'x+5', 'x-4', '9'];
  for (let index = 0; index < answers.length; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await ingest(MANY_DEVICE_STUDENT, [submissionEnvelope({
      actionId: `${PREFIX}-many-q${index}`,
      questionIndex: index,
      response: { kind: 'scalar', type: 'literal', value: answers[index], fields: [] },
    })]);
  }

  // Ten devices that have drained everything, and an eleventh that has not.
  // The empty ones are reported FIRST so that any surviving cap would read the
  // reassuring rows and stop before reaching the one that matters.
  for (let device = 1; device <= 10; device += 1) {
    // eslint-disable-next-line no-await-in-loop
    await reportQueue(MANY_DEVICE_STUDENT, `chromebook-${String(device).padStart(2, '0')}`, {});
  }
  await reportQueue(MANY_DEVICE_STUDENT, 'chromebook-11', { [ASSIGNMENT_ID]: 1 });

  const stored = await db.collection('studentDevicePersistenceReports')
    .where('studentId', '==', MANY_DEVICE_STUDENT).get();
  assert.equal(stored.size, 11, 'the fixture must actually exceed the old cap');

  // THE SAFETY DECISION. `readPersistencePending` is exercised through the
  // trigger that consumes it, which is where the missed device did its damage.
  resetClassroomCalls();
  await runClassroomSync(MANY_DEVICE_STUDENT, {});
  assert.equal(
    patchGradeCalls().length,
    0,
    'an eleventh device holding an unsynced answer must withhold the final Classroom grade',
  );
  const heldAudit = await db.collection('classroomGradeSyncs')
    .where('studentId', '==', MANY_DEVICE_STUDENT).get();
  const held = heldAudit.docs.map((doc) => doc.data()).find((data) => data.status === 'sync-pending');
  assert.ok(held, 'and the withholding must be audited');
  assert.deepEqual(held.persistencePendingReasons, ['device-queue']);

  // THE TEACHER REPORT SEES IT TOO — all eleven rows, and the right total.
  const row = await persistenceRowFor(MANY_DEVICE_STUDENT);
  assert.equal(row.persistencePending, true);
  assert.equal(row.deviceQueues.length, 11, 'the teacher report must list every device, not ten');
  const eleventh = row.deviceQueues.find((queue) => queue.deviceId === 'chromebook-11');
  assert.ok(eleventh, 'the device holding the work must appear in the report');
  assert.equal(eleventh.queuedGradeBearingForAssignment, 1);

  // And once that device drains, the grade goes out.
  await reportQueue(MANY_DEVICE_STUDENT, 'chromebook-11', {});
  resetClassroomCalls();
  await runClassroomSync(MANY_DEVICE_STUDENT, {});
  assert.ok(patchGradeCalls().length >= 1, 'the passback resumes once every device is clear');
  assert.equal(patchGradeCalls().at(-1).grade, 100);
});

/* ==========================================================================
 * 31. A LATE REPORT CANNOT RESTORE A QUEUE THAT IS ALREADY EMPTY.
 *
 * The client's 12-second bound stops it WAITING; it does not cancel a callable
 * already on the wire. So a "2 queued" report captured before a drain can
 * arrive after the "0 queued" report captured after it. An unconditional write
 * restores the stale count with the tab closed and nothing left to correct it,
 * and the student's final grade is held as sync-pending indefinitely.
 * ======================================================================== */

const RACE_STUDENT = `${PREFIX}-race-student`;
const RACE_DEVICE = 'race-chromebook';
const RACE_REPORT_ID = `${encodeURIComponent(RACE_STUDENT)}__${RACE_DEVICE}`;
const readRaceReport = async () =>
  (await db.collection('studentDevicePersistenceReports').doc(RACE_REPORT_ID).get()).data() || {};

test('31. generation 7 arriving after generation 8 does not overwrite it', async () => {
  await seedRosteredStudent(RACE_STUDENT);

  // Establish the device with an older generation so both racers are updates
  // rather than first writes.
  await reportQueue(RACE_STUDENT, RACE_DEVICE, { [ASSIGNMENT_ID]: 3 }, 6);
  assert.equal((await readRaceReport()).reportGeneration, 6);
  const firstReportedAt = (await readRaceReport()).firstReportedAt;
  assert.ok(firstReportedAt, 'the device has a first-reported time to preserve');

  // Generation 8 — captured after the drain, says nothing is queued — LANDS FIRST.
  const landedFirst = await reportQueue(RACE_STUDENT, RACE_DEVICE, {}, 8);
  assert.equal(landedFirst.applied, true);
  assert.equal((await readRaceReport()).reportGeneration, 8);

  // Generation 7 — captured BEFORE the drain, says 2 are queued — was delayed
  // in flight and arrives now.
  const arrivedLate = await reportQueue(RACE_STUDENT, RACE_DEVICE, { [ASSIGNMENT_ID]: 2 }, 7);

  // It succeeds, because the client did nothing wrong and must not retry an
  // obsolete report — but it is ignored, not applied.
  assert.equal(arrivedLate.success, true);
  assert.equal(arrivedLate.applied, false);
  assert.equal(arrivedLate.ignored, true);
  assert.equal(arrivedLate.reason, 'superseded-by-newer-report');
  assert.equal(arrivedLate.storedReportGeneration, 8);

  const final = await readRaceReport();
  assert.equal(final.reportGeneration, 8, 'the newest generation must remain the stored one');
  assert.equal(
    Object.hasOwn(final.queuedGradeBearingByAssignment, encodeURIComponent(ASSIGNMENT_ID)),
    false,
    'the stale positive count must not be restored',
  );
  assert.equal(final.queuedGradeBearing, 0);
  assert.equal(final.firstReportedAt.toMillis(), firstReportedAt.toMillis(), 'firstReportedAt is preserved');

  // The consequence that matters: the final grade is not held by a report that
  // was obsolete before it arrived.
  const row = await persistenceRowFor(RACE_STUDENT);
  assert.equal(row.persistencePending, false);

  // A repeat of the generation already stored is ignored the same way, so a
  // retry of a delivered report cannot resurrect anything either.
  const replay = await reportQueue(RACE_STUDENT, RACE_DEVICE, { [ASSIGNMENT_ID]: 5 }, 8);
  assert.equal(replay.ignored, true);
  assert.equal((await readRaceReport()).queuedGradeBearing, 0);

  // And a genuinely newer report still lands.
  const newer = await reportQueue(RACE_STUDENT, RACE_DEVICE, { [ASSIGNMENT_ID]: 1 }, 9);
  assert.equal(newer.applied, true);
  assert.equal((await readRaceReport()).queuedGradeBearing, 1);
  await reportQueue(RACE_STUDENT, RACE_DEVICE, {}, 10);
});

test('31. a device on the release before generations existed still reports', async () => {
  // It sends no generation at all. Nothing generation-stamped has been stored
  // for this device id, so its reports work exactly as they did before.
  const legacyDevice = `${PREFIX}-legacy-gen-device`;
  const legacyId = `${encodeURIComponent(RACE_STUDENT)}__${legacyDevice}`;
  const readLegacy = async () =>
    (await db.collection('studentDevicePersistenceReports').doc(legacyId).get()).data() || {};

  assert.equal((await reportQueue(RACE_STUDENT, legacyDevice, { [ASSIGNMENT_ID]: 2 }, null)).applied, true);
  assert.equal((await readLegacy()).queuedGradeBearing, 2);
  // Repeated unversioned reports keep working — a legacy device must not be
  // silenced after its first report.
  assert.equal((await reportQueue(RACE_STUDENT, legacyDevice, {}, null)).applied, true);
  assert.equal((await readLegacy()).queuedGradeBearing, 0);

  // Once the browser updates and sends a generation, it wins…
  assert.equal((await reportQueue(RACE_STUDENT, legacyDevice, { [ASSIGNMENT_ID]: 4 }, 100)).applied, true);
  // …and an unversioned report still in flight from the old tab cannot undo it.
  const staleUnversioned = await reportQueue(RACE_STUDENT, legacyDevice, {}, null);
  assert.equal(staleUnversioned.ignored, true);
  assert.equal((await readLegacy()).queuedGradeBearing, 4);
  await reportQueue(RACE_STUDENT, legacyDevice, {}, 101);
});
