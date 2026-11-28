/*
 * LOADING ONE STUDENT'S CASE REVIEW — ON DEMAND, ONE STUDENT, ONE WINDOW.
 *
 * Nothing here runs until a teacher presses "Build case review". It reads
 * only the selected student and the window their selected assignments need,
 * through the same rules-guarded readers PR #401's report uses, plus the
 * read-only `loadStudentCaseEvidence` callable for the records no teacher
 * browser may read directly (docs/STUDENT_CASE_REVIEW_DESIGN.md §5), and the
 * read-only `loadStudentConductEvidence` callable for the Discipline
 * Tracker's records and the family contacts.
 *
 * REQUIRED sources (the grade record, PR #401's support records) fail the
 * build: without them the case review would report missing evidence as "none".
 * OPTIONAL sources (per-attempt evidence, session summaries, export history,
 * saved gradebook snapshots, conduct records) degrade to an explicit "not
 * loaded", which the model reports as such — never as zero or none.
 *
 * Every function takes `db` / `functions` so the module imports nothing that
 * initialises Firebase (node tests import it directly).
 */
import {
  collection, doc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { zonedDateKey } from '../../../functions/shared/instructionalCalendar.mjs';
import {
  SIS_SNAPSHOT_SUBCOLLECTION, buildSisSnapshotDocument, snapshotFromDocument,
} from '../../../functions/shared/sisGradebookSnapshot.mjs';
import { CASE_EVIDENCE_LIMITS } from '../../../functions/shared/caseReviewEvidence.mjs';
import { ATTENDANCE_EXTENSION_GRANTS_COLLECTION } from '../../../functions/shared/assignmentPrivacy.mjs';
import { fetchStudentGradeRecord, loadStudentSupportRecords } from '../supportEvidence/supportEvidenceStore.js';
import { selectReportAssignments } from '../supportEvidence/supportEvidenceReport.js';
import { fetchStudentSupportHistory } from '../teacher/studentSupportStore.js';
import { loadTeacherGradeTransferState } from '../gradeTransfer/gradeTransferStore.js';

const SCHOOL_TIME_ZONE = 'America/Chicago';
const DAY_MS = 86400000;
const clean = (value) => String(value ?? '').trim();

export const CASE_EVIDENCE_CALLABLE = 'loadStudentCaseEvidence';

/**
 * The window the selected assignments need: the teacher's dates, else from 30
 * days before the earliest release/due to now — never longer than the
 * callable accepts.
 */
export const caseReviewWindow = ({ included = [], selection = {}, nowMs = Date.now() } = {}) => {
  const anchors = included
    .map(({ assignment }) => Date.parse(assignment?.releaseAt || assignment?.dueAt || assignment?.dueDate || ''))
    .filter(Number.isFinite);
  let fromMs = selection.fromDateKey
    ? Date.parse(`${selection.fromDateKey}T00:00:00Z`) - DAY_MS
    : (anchors.length ? Math.min(...anchors) - 30 * DAY_MS : nowMs - 120 * DAY_MS);
  const toMs = selection.toDateKey ? Date.parse(`${selection.toDateKey}T23:59:59Z`) + DAY_MS : nowMs;
  const maxSpan = (CASE_EVIDENCE_LIMITS.maxRangeDays - 1) * DAY_MS;
  if (toMs - fromMs > maxSpan) fromMs = toMs - maxSpan;
  return { fromMs, toMs, fromDateKey: zonedDateKey(fromMs, SCHOOL_TIME_ZONE), toDateKey: zonedDateKey(toMs, SCHOOL_TIME_ZONE) };
};

/** The read-only callable. Throws; the caller decides how to degrade. */
export const loadCaseEvidence = async ({ functions, studentId, fromMs, toMs, assignmentIds }) => {
  const response = await httpsCallable(functions, CASE_EVIDENCE_CALLABLE)({ studentId, fromMs, toMs, assignmentIds });
  return response?.data || null;
};

export const CONDUCT_EVIDENCE_CALLABLE = 'loadStudentConductEvidence';

/**
 * The student's conduct records and family contacts over the case's school
 * days (read-only; functions/disciplineFunctions.js). Throws; the caller
 * degrades to "not loaded".
 */
export const loadConductEvidence = async ({ functions, studentId, fromDateKey, toDateKey }) => {
  const response = await httpsCallable(functions, CONDUCT_EVIDENCE_CALLABLE)({ studentId, fromDateKey, toDateKey });
  return response?.data || null;
};

export const fetchSavedSisSnapshots = async ({ db, studentId, max = 5 } = {}) => {
  const id = clean(studentId);
  if (!db || !id) return [];
  const snapshot = await getDocs(query(
    collection(db, 'grades', id, SIS_SNAPSHOT_SUBCOLLECTION),
    orderBy('importedAt', 'desc'),
    limit(Math.max(1, Math.min(20, Number(max) || 5))),
  ));
  return snapshot.docs.map((entry) => {
    const data = entry.data() || {};
    const at = typeof data.importedAt?.toMillis === 'function' ? data.importedAt.toMillis() : null;
    return snapshotFromDocument(entry.id, data, at);
  });
};

/**
 * The student's attendance-extension grants, newest first: why a deadline
 * moved, kept privately per student (functions/shared/assignmentPrivacy.mjs).
 * The teacher of record may read them; the shared assignment keeps only the
 * deadline.
 */
export const fetchAttendanceExtensionGrants = async ({ db, studentId, max = 300 } = {}) => {
  const id = clean(studentId);
  if (!db || !id) return [];
  const snapshot = await getDocs(query(
    collection(db, 'grades', id, ATTENDANCE_EXTENSION_GRANTS_COLLECTION),
    orderBy('grantedAtMs', 'desc'),
    limit(Math.max(1, Math.min(500, Number(max) || 300))),
  ));
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
};

/** Save one student's imported rows with their case file. Read-only analysis; changes no grade. */
/**
 * The student's teacher signals (grades/{student}/attemptSignals), reviewed
 * ones included: a case review reads the whole record. Rules-guarded: only
 * the student's teacher (or root) can read them.
 */
export const ATTEMPT_SIGNALS_MAX = 500;
// Firestore's own readers; a test passes its own.
const FIRESTORE_READS = { collection, getDocs, limit, orderBy, query, where };
export const fetchAttemptSignals = async ({ db, studentId, fromMs = null, toMs = null, max = ATTEMPT_SIGNALS_MAX, store = FIRESTORE_READS } = {}) => {
  const id = clean(studentId);
  if (!db || !id) return { signals: [], firstRecordedAtMs: null, capped: false, max };
  const signalsOf = store.collection(db, 'grades', id, 'attemptSignals');
  // The case's own window, newest first, and one more than is kept: the extra
  // row is how the page knows the window held more than it loaded, and says so.
  const bounds = [
    ...(Number.isFinite(fromMs) ? [store.where('recordedAt', '>=', new Date(fromMs))] : []),
    ...(Number.isFinite(toMs) ? [store.where('recordedAt', '<=', new Date(toMs))] : []),
  ];
  const [windowed, first] = await Promise.all([
    store.getDocs(store.query(signalsOf, ...bounds, store.orderBy('recordedAt', 'desc'), store.limit(max + 1))),
    // The student's earliest signal on record, whatever the window: the date
    // from which an answer with no signal means something.
    store.getDocs(store.query(signalsOf, store.orderBy('recordedAt', 'asc'), store.limit(1))),
  ]);
  const rows = windowed.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  const earliest = first.docs[0]?.data()?.recordedAt;
  const firstRecordedAtMs = typeof earliest?.toMillis === 'function' ? earliest.toMillis() : (Number.isFinite(Number(earliest)) && earliest ? Number(earliest) : null);
  return { signals: rows.slice(0, max), firstRecordedAtMs, capped: rows.length > max, max };
};

export const saveSisSnapshot = async ({
  db, student, extracted, layout, fileName, confirmedMatches = {}, teacherEmail, nowMs = Date.now(),
} = {}) => {
  const { payload, errors } = buildSisSnapshotDocument({
    studentId: student?.id, classId: student?.classId || null, extracted, layout, fileName, confirmedMatches, createdByEmail: teacherEmail,
  });
  if (errors.length) throw new Error(errors.join(' '));
  const ref = doc(collection(db, 'grades', payload.studentId, SIS_SNAPSHOT_SUBCOLLECTION));
  await setDoc(ref, { ...payload, importedAt: serverTimestamp() });
  return snapshotFromDocument(ref.id, payload, nowMs);
};

const settledValue = (result) => (result.status === 'fulfilled' ? result.value : undefined);
const settledError = (result) => (result.status === 'rejected' ? clean(result.reason?.message || result.reason?.code || 'not available') : '');

/**
 * Everything one case review needs. Returns the inputs for
 * buildStudentCaseReview (minus the teacher's in-page choices).
 */
export const loadStudentCaseRecords = async ({
  db, functions, student, assignments = [], gradingPeriodSettings = null, selection = {}, teacherEmail = '', nowMs = Date.now(),
} = {}) => {
  const studentId = clean(student?.id);
  if (!db || !studentId) throw new Error('Choose a student first.');
  const record = await fetchStudentGradeRecord({ db, studentId });
  if (!record) throw new Error('This student\'s grade record could not be read.');
  const fullStudent = { ...record, ...student, profile: record.profile || student.profile || {}, id: studentId };
  const { included } = selectReportAssignments({ assignments, student: fullStudent, gradingPeriodSettings, selection });
  const window = caseReviewWindow({ included, selection, nowMs });
  const assignmentIds = included.map(({ assignment }) => assignment.id).slice(0, CASE_EVIDENCE_LIMITS.maxAssignments);

  // Required: PR #401's support records (rules-guarded, as its report reads them).
  const supportRecords = await loadStudentSupportRecords({
    db, studentId, fromMs: window.fromMs, toMs: window.toMs, fromDateKey: window.fromDateKey, toDateKey: window.toDateKey,
  });

  // Optional: each degrades to "not loaded".
  const [history, transfer, evidence, saved, grants, signals, conduct] = await Promise.allSettled([
    fetchStudentSupportHistory({ db, teacherEmail, studentId, supportLimit: 300, sessionLimit: 365 }),
    fullStudent.classId ? loadTeacherGradeTransferState({ classIds: [fullStudent.classId] }) : Promise.resolve(null),
    assignmentIds.length && functions
      ? loadCaseEvidence({ functions, studentId, fromMs: window.fromMs, toMs: window.toMs, assignmentIds })
      : Promise.resolve(null),
    fetchSavedSisSnapshots({ db, studentId }),
    fetchAttendanceExtensionGrants({ db, studentId }),
    fetchAttemptSignals({ db, studentId, fromMs: window.fromMs, toMs: window.toMs }),
    functions
      ? loadConductEvidence({ functions, studentId, fromDateKey: window.fromDateKey, toDateKey: window.toDateKey })
      : Promise.reject(new Error('not available')),
  ]);
  const historyValue = settledValue(history);
  const transferValue = settledValue(transfer);
  const caseEvidence = settledValue(evidence) || null;
  return {
    student: fullStudent,
    included,
    window,
    revisions: supportRecords.revisions,
    evidence: supportRecords.evidence,
    serviceLog: supportRecords.serviceLog,
    engagement: supportRecords.engagement,
    supportSignals: historyValue?.events || [],
    supportSignalsLoaded: Boolean(historyValue),
    sessionSummaries: historyValue ? historyValue.summaries || [] : undefined,
    exportSnapshots: transferValue ? transferValue.snapshots : null,
    practicePassKeys: transferValue ? [...(transferValue.practicePasses || [])] : [],
    caseEvidence,
    caseEvidenceError: caseEvidence ? '' : (settledError(evidence) || (assignmentIds.length ? 'not available' : '')),
    savedSnapshots: settledValue(saved) || [],
    savedSnapshotsError: settledError(saved),
    // undefined = not loaded (the model then falls back to the shared stub).
    extensionGrants: grants.status === 'fulfilled' ? grants.value : undefined,
    // The student's teacher signals; undefined = not loaded.
    attemptSignals: signals.status === 'fulfilled' ? signals.value.signals : undefined,
    // The earliest signal on record and whether the window held more than was loaded.
    attemptSignalsMeta: signals.status === 'fulfilled' ? { firstRecordedAtMs: signals.value.firstRecordedAtMs, capped: signals.value.capped, max: signals.value.max } : null,
    // The Discipline Tracker's records and the family contacts; undefined = not loaded.
    conductEvidence: settledValue(conduct) || undefined,
    conductEvidenceError: settledError(conduct),
    loadedAtMs: nowMs,
  };
};

export default loadStudentCaseRecords;
