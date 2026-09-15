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
  refusal, resetClassroomCalls, runClassroomSync, seedFixture, studentRequest,
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
