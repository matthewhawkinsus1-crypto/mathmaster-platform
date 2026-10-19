/*
 * THE SERVER, FOR THE JOURNEYS THAT NEED ONE — opt in with `?server=1`.
 *
 * Without it the harness has no ingestion and no deadline finalizer: a Submit
 * stays queued on the device and a response checkpoint is never finalized.
 * That is exactly the part of the lmr-wu-1 lifecycle the Warm-Up reopen
 * journeys could not see. Production's failure needed the server: ingestion
 * recorded the student's Checks, the deadline finalizer auto-submitted the
 * last complete sort, the record became CLOSED, and the reopened Warm-Up then
 * rendered a closed question for the first time.
 *
 * This mirrors the orchestration in functions/index.js — the
 * `ingestStudentSubmissions` callable (ingestOneSubmission,
 * recordOneQuestionProgress) and the deadline finalizer
 * (finalizeOneResponseCheckpoint) — around the SAME shared modules those
 * functions call, so every decision that matters is production code: whether
 * an envelope is accepted, how the work is graded, which delivery pin is
 * trusted, what the attempt does to the record, when the section really
 * closed. The real functions themselves run against the Firestore emulator in
 * tests/integration/warmupReopen/warmupReopenServerLifecycle.test.mjs.
 *
 * Left out, and said so: Google Classroom passback, the Practice Pass check,
 * modeling labs, the DOL day projection, reduced-workload omissions (no
 * harness student has one), receipts' server timestamps beyond the store's,
 * and transactions (one page owns this store, so nothing interleaves).
 */
import { harnessStore, Timestamp } from './fakeFirestore.js';
import * as ingestion from '../../../functions/shared/submissionIngestion.mjs';
import { RETIRING_DISPOSITIONS, SUBMISSION_DISPOSITION } from '../../../functions/shared/studentSubmissionDisposition.mjs';
import { assignmentFinalCloseAt } from '../../../functions/shared/sectionDeadline.mjs';
import { buildCheckpointFinalization, decideCheckpointFinalization } from '../../../functions/shared/responseCheckpointFinalizer.mjs';

const CHECKPOINTS = 'studentResponseCheckpoints';
const RECEIPTS = 'studentSubmissionReceipts';

// functions/lib/assignmentRuntime.js (CommonJS, so restated here line for line).
const runtimeQuestionsFromAssignment = (assignment = {}) => {
  if (!assignment || typeof assignment !== 'object' || Number(assignment.schemaVersion) !== 5) return [];
  return (Array.isArray(assignment.sections) ? assignment.sections : []).flatMap((section) => (
    (Array.isArray(section?.questions) ? section.questions : []).map((question) => ({
      ...question,
      activityRole: question?.activityRole || section?.role || 'classwork',
      sectionId: section?.id || null,
      sectionTitle: section?.title || null,
    }))
  ));
};
const runtimeIndicesForSection = (assignment, role) => runtimeQuestionsFromAssignment(assignment).reduce((indices, question, index) => {
  if (question?.teacherExcluded !== true && String(question?.activityRole || '').trim().toLowerCase() === role) indices.push(index);
  return indices;
}, []);
// functions/index.js assignmentAudience / authoritativeStudentClassId / secureAssignmentMode.
const assignedTo = (assignment, classId) => Boolean(classId) && (Array.isArray(assignment?.assignedClassIds) ? assignment.assignedClassIds : [])
  .map((value) => String(value).trim()).includes(String(classId));
const classIdOf = (grade) => String(grade?.classId || '').trim() || null;
const secure = (assignment) => String(assignment?.assessmentPolicy?.mode || '') === 'testCycle' || assignment?.secure === true;

const readAssignment = (id) => {
  const data = harnessStore.get(`assignments/${id}`);
  return data ? { id, ...data } : null;
};
const recordFor = (grade, assignmentId, questionIndex) => grade?.gradesByAssignment?.[assignmentId]?.[String(questionIndex)]
  ?? grade?.gradesByAssignment?.[assignmentId]?.[questionIndex]
  ?? null;
// `update` with a nested map write, as FieldPath(gradesByAssignment, id, index) does.
const writeRecord = (studentId, assignmentId, questionIndex, record, extra = {}) => {
  const grade = harnessStore.get(`grades/${studentId}`) || {};
  const tracker = { ...grade.gradesByAssignment?.[assignmentId], [String(questionIndex)]: record };
  harnessStore.update(`grades/${studentId}`, {
    gradesByAssignment: { ...grade.gradesByAssignment, [assignmentId]: tracker },
    ...extra,
  });
};

const ingestOneSubmission = ({ studentId, envelope, now }) => {
  const receiptPath = `${RECEIPTS}/${encodeURIComponent(studentId)}__${encodeURIComponent(envelope.actionId)}`.slice(0, 1400);
  if (harnessStore.get(receiptPath)) {
    return { actionId: envelope.actionId, disposition: SUBMISSION_DISPOSITION.DUPLICATE, reason: 'receipt-already-issued' };
  }
  const assignment = readAssignment(envelope.assignmentId);
  const gradeData = harnessStore.get(`grades/${studentId}`) || null;
  const classId = classIdOf(gradeData);
  if (assignment && secure(assignment)) {
    return { actionId: envelope.actionId, disposition: SUBMISSION_DISPOSITION.PERMANENTLY_INVALID, reason: 'secure-assignment-excluded' };
  }
  const question = assignment ? runtimeQuestionsFromAssignment(assignment)[envelope.questionIndex] || null : null;
  const activityRole = ingestion.withAuthoritativeActivityRole({ envelope, question })?.activityRole || null;
  const canonicalRecord = recordFor(gradeData, envelope.assignmentId, envelope.questionIndex);
  const finalCloseAtMs = assignment ? assignmentFinalCloseAt(assignment, null, studentId, gradeData?.profile || null) : null;
  const decision = ingestion.decideSubmissionIngestion({
    envelope,
    assignmentExists: Boolean(assignment),
    gradeRecordExists: Boolean(gradeData),
    authorizedForClass: assignment ? assignedTo(assignment, classId) : null,
    assignmentClosedAtCapture: finalCloseAtMs === null ? null : Number(envelope.capturedAt || now) > Number(finalCloseAtMs),
    liveSectionAccess: assignment ? ingestion.resolveLiveSectionAccess({ assignment, activityRole, classId }) : null,
    question,
    canonicalRecord,
    deliveryAttempts: envelope.deliveryAttempts || 0,
    now,
  });
  if (decision.disposition !== SUBMISSION_DISPOSITION.ACCEPTED) {
    if (RETIRING_DISPOSITIONS.includes(decision.disposition)) {
      harnessStore.set(receiptPath, { studentId, actionId: envelope.actionId, disposition: decision.disposition, reason: decision.reason || null, issuedAt: Timestamp.now() });
    }
    return { actionId: envelope.actionId, disposition: decision.disposition, reason: decision.reason };
  }
  const built = ingestion.buildIngestedAttempt({
    envelope,
    assignment,
    question,
    canonicalRecord,
    gradeDocument: gradeData,
    classworkIndices: runtimeIndicesForSection(assignment, 'classwork'),
    dolIndices: runtimeIndicesForSection(assignment, 'dol'),
    modelingLabMarker: null,
    requireStepWork: false,
    ingestedAt: now,
  });
  if (built.blocked) {
    return { actionId: envelope.actionId, disposition: SUBMISSION_DISPOSITION.NEEDS_REVIEW, reason: built.reason };
  }
  // A finished question: nothing is written but the receipt.
  if (built.final) {
    harnessStore.set(receiptPath, { studentId, actionId: envelope.actionId, disposition: SUBMISSION_DISPOSITION.SUPERSEDED, reason: built.reason, issuedAt: Timestamp.now() });
    return { actionId: envelope.actionId, disposition: SUBMISSION_DISPOSITION.SUPERSEDED, reason: built.reason };
  }
  writeRecord(studentId, envelope.assignmentId, envelope.questionIndex, built.record, {
    supportUsageByAssignment: { ...gradeData?.supportUsageByAssignment, [envelope.assignmentId]: built.supportUsage },
    ...(built.classworkGrade ? { classworkGradesByAssignment: { ...gradeData?.classworkGradesByAssignment, [envelope.assignmentId]: built.classworkGrade } } : {}),
  });
  // The explicit submission is newer authority than its own checkpoint.
  const checkpointPath = envelope.checkpointDocumentId ? `${CHECKPOINTS}/${envelope.checkpointDocumentId}` : null;
  if (checkpointPath && harnessStore.get(checkpointPath)?.studentId === studentId) {
    harnessStore.update(checkpointPath, { status: 'explicitly-submitted', candidateFinalizeAt: null, supersededBySubmissionId: envelope.actionId });
  }
  harnessStore.set(receiptPath, {
    studentId, actionId: envelope.actionId, assignmentId: envelope.assignmentId, questionIndex: envelope.questionIndex,
    disposition: SUBMISSION_DISPOSITION.ACCEPTED, reason: null, gradedBy: built.gradedBy,
    totalAttempts: Number(built.record.totalAttempts) || 0, issuedAt: Timestamp.now(),
  });
  return {
    actionId: envelope.actionId,
    disposition: SUBMISSION_DISPOSITION.ACCEPTED,
    reason: null,
    gradedBy: built.gradedBy,
    totalAttempts: Number(built.record.totalAttempts) || 0,
    academicOccurredAt: built.academicAt,
    ingestedAt: now,
  };
};

const recordOneQuestionProgress = ({ studentId, envelope }) => {
  const assignment = readAssignment(envelope.assignmentId);
  const gradeData = harnessStore.get(`grades/${studentId}`) || null;
  const decision = ingestion.decideQuestionProgress({
    envelope,
    assignmentExists: Boolean(assignment),
    gradeRecordExists: Boolean(gradeData),
    secureAssignment: Boolean(assignment && secure(assignment)),
    authorizedForClass: assignment ? assignedTo(assignment, classIdOf(gradeData)) : null,
    question: assignment ? runtimeQuestionsFromAssignment(assignment)[envelope.questionIndex] || null : null,
    canonicalRecord: recordFor(gradeData, envelope.assignmentId, envelope.questionIndex),
  });
  if (decision.record) writeRecord(studentId, envelope.assignmentId, envelope.questionIndex, decision.record);
  return { actionId: envelope.actionId, disposition: decision.disposition, reason: decision.reason };
};

/** functions/index.js `ingestStudentSubmissions`, for the signed-in student. */
export const ingestStudentSubmissions = ({ studentId, submissions = [] } = {}) => {
  const incoming = Array.isArray(submissions) ? submissions : [];
  if (!incoming.length) throw Object.assign(new Error('invalid-argument: No submissions were supplied.'), { code: 'functions/invalid-argument' });
  if (incoming.length > ingestion.MAX_ENVELOPES_PER_CALL) {
    throw Object.assign(new Error('invalid-argument: Too many submissions.'), { code: 'functions/invalid-argument' });
  }
  const now = Date.now();
  const receipts = incoming.map((raw) => {
    const progress = ingestion.normalizeProgressEnvelope(raw);
    if (progress) {
      progress.studentId = studentId;
      return recordOneQuestionProgress({ studentId, envelope: progress });
    }
    const envelope = ingestion.normalizeSubmissionEnvelope(raw);
    if (!envelope) {
      return { actionId: String(raw?.actionId || '').slice(0, 200) || null, disposition: SUBMISSION_DISPOSITION.NEEDS_REVIEW, reason: 'unreadable-envelope' };
    }
    envelope.studentId = studentId;
    return ingestOneSubmission({ studentId, envelope, now });
  });
  return { receipts, ingestedAt: now };
};

/*
 * THE DEADLINE FINALIZER — functions/index.js finalizeOneResponseCheckpoint,
 * run over every active checkpoint, as the scheduled function and the
 * teacher's sweep both do. A journey calls it when the deadline has passed
 * ("the scheduler ran"). `timeZone` is the harness's school clock: the
 * fixture writes the bell schedule in the browser's own zone (schoolClock.mjs).
 */
export const finalizeResponseCheckpoints = ({ now = Date.now(), timeZone = null } = {}) => {
  const outcomes = [];
  harnessStore.paths(`${CHECKPOINTS}/`).forEach((path) => {
    const stored = harnessStore.get(path);
    if (!stored || stored.status !== 'active') return;
    const checkpoint = { ...stored, documentId: path.slice(CHECKPOINTS.length + 1) };
    const studentId = String(checkpoint.studentId || '');
    const gradeData = harnessStore.get(`grades/${studentId}`) || null;
    const assignment = readAssignment(String(checkpoint.assignmentId || 'missing'));
    const retire = (status, reason, extra = {}) => {
      harnessStore.update(path, {
        status,
        candidateFinalizeAt: null,
        finalizationReceipt: { checkpointRevision: Number(checkpoint.revision) || 0, finalizedAt: Timestamp.now(), origin: 'deadline-auto-submit', reason: reason || null, status, ...extra },
      });
      outcomes.push({ path, status, reason: reason || null, ...extra });
    };
    if (!assignment || !gradeData) {
      retire('invalid-context', assignment ? 'missing-grade-record' : 'missing-assignment');
      return;
    }
    const question = runtimeQuestionsFromAssignment(assignment)[Number(checkpoint.questionIndex)] || null;
    const schedule = harnessStore.get('settings/classSchedule') || null;
    const classRecord = harnessStore.get(`classes/${classIdOf(gradeData)}`) || null;
    const decision = decideCheckpointFinalization({
      checkpoint,
      assignment,
      gradeDocument: gradeData,
      gradeDocumentId: studentId,
      question,
      schedule,
      classPeriod: classRecord?.period || gradeData.classPeriod || null,
      isSecureAssignment: secure(assignment),
      now,
      timeZone,
    });
    if (decision.action === 'skip') return;
    if (decision.action === 'hold' || decision.action === 'reschedule') {
      harnessStore.update(path, decision.action === 'hold'
        ? { candidateFinalizeAt: new Date(now + 3_600_000), heldReason: decision.reason || null }
        : { candidateFinalizeAt: new Date(decision.finalizeAt), rescheduleReason: decision.reason || null });
      outcomes.push({ path, status: decision.action, reason: decision.reason || null });
      return;
    }
    if (decision.action === 'close') {
      retire(decision.status, decision.reason, { cutoff: decision.cutoff ? new Date(decision.cutoff) : null, resultingSubmissionId: decision.submissionId || null });
      return;
    }
    const finalization = buildCheckpointFinalization({
      checkpoint,
      assignment,
      question,
      decision,
      gradeDocument: gradeData,
      classworkIndices: runtimeIndicesForSection(assignment, 'classwork'),
      dolIndices: runtimeIndicesForSection(assignment, 'dol'),
      runAt: now,
      timeZone,
    });
    writeRecord(studentId, String(checkpoint.assignmentId), checkpoint.questionIndex, finalization.record, {
      supportUsageByAssignment: { ...gradeData.supportUsageByAssignment, [checkpoint.assignmentId]: finalization.supportUsage },
    });
    retire(decision.status, decision.reason, {
      cutoff: decision.cutoff ? new Date(decision.cutoff) : null,
      resultingSubmissionId: decision.submissionId,
      isCorrect: finalization.record.status === 'correct',
      gradedBy: 'server',
    });
  });
  return outcomes;
};

if (typeof window !== 'undefined') {
  window.__mmHarnessServer = { ingestStudentSubmissions, finalizeResponseCheckpoints };
}
