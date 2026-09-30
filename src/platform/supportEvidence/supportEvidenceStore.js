/*
 * FIRESTORE ACCESS FOR SUPPORT PROFILES AND SUPPORT EVIDENCE.
 *
 * Every record lives under the student's roster row, `grades/{studentId}/…`,
 * so Firestore enforces the same teacher-of-record authorization every teacher
 * surface already relies on, and the records leave with the student when the
 * account is erased (see firestore.rules and docs/IEP_SUPPORT_EVIDENCE_DESIGN.md).
 *
 * The payload builders live in functions/shared/ and mirror the rules field
 * for field (tests/platform/supportEvidenceRulesParity.test.mjs). This module
 * only adds what the client must add — ids, `serverTimestamp()` — and reads.
 *
 * Nothing here writes a support profile except `saveSupportProfileRevision`,
 * which writes an immutable revision and the student-readable projection in
 * ONE batch, so the two can never disagree.
 */
import {
  Timestamp,
  arrayUnion,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  SUPPORT_REVISIONS_SUBCOLLECTION,
  buildRevisionDocument,
  buildSupportProjection,
  legacyProfileToRevision,
  normalizeSupportRevisionInput,
  revisionEffectiveOn,
  toMillis,
} from '../../../functions/shared/supportProfileModel.mjs';
import {
  ENGAGEMENT_MINUTES_SUBCOLLECTION,
  SUPPORT_EVIDENCE_SUBCOLLECTION,
  SUPPORT_SERVICE_LOG_SUBCOLLECTION,
  availabilityEventId,
  buildServiceLogEntry,
  buildStaffEvidenceEvent,
  buildStudentEvidenceEvent,
  engagementDocId,
  epochMinuteOf,
  utcDayOf,
} from '../../../functions/shared/supportEvidenceModel.mjs';
import { zonedDateKey } from '../../../functions/shared/instructionalCalendar.mjs';

const SCHOOL_TIME_ZONE = 'America/Chicago';
const clean = (value) => String(value ?? '').trim();

export class SupportRecordError extends Error {
  constructor(errors = []) {
    super(errors.join(' ') || 'The record could not be saved.');
    this.name = 'SupportRecordError';
    this.errors = errors;
  }
}

const withMillis = (snapshot, timeField) => {
  const data = snapshot.data() || {};
  return { id: snapshot.id, ...data, [`${timeField}Ms`]: toMillis(data[timeField]) };
};

// --- Profile revisions ------------------------------------------------------------

export const fetchSupportProfileRevisions = async ({ db, studentId } = {}) => {
  const id = clean(studentId);
  if (!db || !id) return [];
  const snapshot = await getDocs(collection(db, 'grades', id, SUPPORT_REVISIONS_SUBCOLLECTION));
  return snapshot.docs
    .map((entry) => ({ ...withMillis(entry, 'createdAt'), revisionId: entry.id }))
    .sort((a, b) => (Number(a.revision) || 0) - (Number(b.revision) || 0) || (a.createdAtMs || 0) - (b.createdAtMs || 0));
};

/**
 * Save a new immutable revision and the projection the student's runtime
 * reads, atomically.
 *
 * `student.profile` is the stored `grades/{id}.profile` (raw or the flat
 * normalized view). The FIRST versioned save also snapshots the
 * pre-versioning profile as revision 0, so what the platform applied before
 * versioning is not lost from the history.
 */
export const saveSupportProfileRevision = async ({
  db,
  student,
  input,
  teacherEmail,
  nowValue = Date.now(),
  existingRevisions = null,
} = {}) => {
  const studentId = clean(student?.id || student?.studentId);
  const email = clean(teacherEmail).toLowerCase();
  if (!db) throw new SupportRecordError(['Saving a support profile needs Firestore.']);
  if (!studentId) throw new SupportRecordError(['Choose a student.']);
  if (!email) throw new SupportRecordError(['Sign in as the student\'s teacher to save a support profile.']);
  const { revision, errors } = normalizeSupportRevisionInput(input);
  if (errors.length) throw new SupportRecordError(errors);

  const classId = clean(student?.classId) || null;
  const revisions = Array.isArray(existingRevisions)
    ? existingRevisions
    : await fetchSupportProfileRevisions({ db, studentId });
  const revisionsRef = collection(db, 'grades', studentId, SUPPORT_REVISIONS_SUBCOLLECTION);
  const batch = writeBatch(db);
  const timeline = [...revisions];
  let nextNumber = revisions.reduce((max, entry) => Math.max(max, Number(entry.revision) || 0), 0) + 1;

  if (!revisions.length) {
    const legacy = legacyProfileToRevision(student?.profile);
    if (legacy) {
      const legacyRef = doc(revisionsRef);
      const legacyDocument = buildRevisionDocument({
        revision: {
          ...legacy,
          sourceLabel: 'Profile recorded before versioning (snapshot)',
          sourceNote: 'Captured automatically at the first versioned save. Dates and history before this moment were not recorded.',
        },
        studentId,
        classId,
        revisionNumber: 0,
        createdByEmail: email,
        legacySnapshot: true,
      });
      batch.set(legacyRef, { ...legacyDocument, createdAt: serverTimestamp() });
      timeline.push({ ...legacyDocument, id: legacyRef.id, revisionId: legacyRef.id, createdAtMs: nowValue });
      nextNumber = Math.max(nextNumber, 1);
    }
  }

  const revisionRef = doc(revisionsRef);
  const supersedes = revisionEffectiveOn(timeline, revision.effectiveStart);
  const document = buildRevisionDocument({
    revision,
    studentId,
    classId,
    revisionNumber: nextNumber,
    supersedesRevisionId: supersedes?.revisionId || supersedes?.id || null,
    createdByEmail: email,
  });
  batch.set(revisionRef, { ...document, createdAt: serverTimestamp() });
  timeline.push({ ...document, id: revisionRef.id, revisionId: revisionRef.id, createdAtMs: nowValue });

  const projection = buildSupportProjection({
    revisions: timeline,
    todayKey: zonedDateKey(nowValue, SCHOOL_TIME_ZONE),
    updatedAt: new Date(nowValue).toISOString(),
  });
  batch.update(doc(db, 'grades', studentId), { profile: projection });
  await batch.commit();
  return { revisionId: revisionRef.id, projection, revisions: timeline };
};

// --- Evidence events ----------------------------------------------------------------

/** A staff record (one-click action, provider entry, determination). */
export const recordStaffSupportEvidence = async ({ db, event, nowValue = Date.now() } = {}) => {
  const { payload, errors } = buildStaffEvidenceEvent(event);
  if (errors.length) throw new SupportRecordError(errors);
  const ref = doc(collection(db, 'grades', payload.studentId, SUPPORT_EVIDENCE_SUBCOLLECTION));
  await setDoc(ref, { ...payload, occurredAt: serverTimestamp() });
  // The stored time is the server's; this local estimate is only for the
  // screen until the record is read back.
  return { id: ref.id, ...payload, occurredAtMs: nowValue };
};

/**
 * A record from the student's own client. `deterministic` records
 * ("available" for an assignment and revision) use a fixed id so a relaunch
 * or second tab cannot duplicate them; the second write is refused by the
 * rules as an update, which is expected and swallowed.
 */
export const recordStudentSupportEvidence = async ({ db, event, deterministic = false } = {}) => {
  const { payload, errors } = buildStudentEvidenceEvent(event);
  if (errors.length) throw new SupportRecordError(errors);
  const evidence = collection(db, 'grades', payload.studentId, SUPPORT_EVIDENCE_SUBCOLLECTION);
  const ref = deterministic
    ? doc(evidence, availabilityEventId({ assignmentId: payload.assignmentId, profileRevisionId: payload.profileRevisionId, supportId: payload.supportId }))
    : doc(evidence);
  try {
    await setDoc(ref, { ...payload, occurredAt: serverTimestamp() });
    return { id: ref.id, recorded: true };
  } catch (error) {
    if (deterministic && /permission|PERMISSION_DENIED/i.test(String(error?.code || error?.message || ''))) {
      return { id: ref.id, recorded: false, alreadyRecorded: true };
    }
    throw error;
  }
};

export const fetchSupportEvidence = async ({
  db, studentId, fromMs = null, toMs = null, assignmentId = null, max = 1500,
} = {}) => {
  const id = clean(studentId);
  if (!db || !id) return [];
  const evidence = collection(db, 'grades', id, SUPPORT_EVIDENCE_SUBCOLLECTION);
  const constraints = [];
  if (assignmentId) {
    constraints.push(where('assignmentId', '==', clean(assignmentId)));
  } else {
    if (Number.isFinite(Number(fromMs)) && fromMs !== null) constraints.push(where('occurredAt', '>=', Timestamp.fromMillis(Number(fromMs))));
    if (Number.isFinite(Number(toMs)) && toMs !== null) constraints.push(where('occurredAt', '<=', Timestamp.fromMillis(Number(toMs))));
    constraints.push(orderBy('occurredAt', 'desc'));
  }
  constraints.push(limit(Math.max(1, Math.min(5000, Number(max) || 1500))));
  const snapshot = await getDocs(query(evidence, ...constraints));
  return snapshot.docs
    .map((entry) => withMillis(entry, 'occurredAt'))
    .sort((a, b) => (b.occurredAtMs || 0) - (a.occurredAtMs || 0));
};

// --- Service / support log -----------------------------------------------------------------

export const recordServiceLogEntry = async ({ db, entry, nowValue = Date.now() } = {}) => {
  const { payload, errors } = buildServiceLogEntry(entry);
  if (errors.length) throw new SupportRecordError(errors);
  const ref = doc(collection(db, 'grades', payload.studentId, SUPPORT_SERVICE_LOG_SUBCOLLECTION));
  await setDoc(ref, { ...payload, createdAt: serverTimestamp() });
  return { id: ref.id, ...payload, createdAtMs: nowValue };
};

export const fetchServiceLog = async ({ db, studentId, fromDateKey = null, toDateKey = null, max = 2000 } = {}) => {
  const id = clean(studentId);
  if (!db || !id) return [];
  const constraints = [];
  if (fromDateKey) constraints.push(where('dateKey', '>=', fromDateKey));
  if (toDateKey) constraints.push(where('dateKey', '<=', toDateKey));
  constraints.push(orderBy('dateKey', 'asc'));
  constraints.push(limit(Math.max(1, Math.min(5000, Number(max) || 2000))));
  const snapshot = await getDocs(query(collection(db, 'grades', id, SUPPORT_SERVICE_LOG_SUBCOLLECTION), ...constraints));
  return snapshot.docs.map((entry) => withMillis(entry, 'createdAt'));
};

// --- Active-engagement minute ledger ----------------------------------------------------------

/**
 * Add the current minute to today's ledger for this assignment. Idempotent:
 * the same minute from two tabs or a retry is stored once. The rules refuse
 * any minute that is not the one the server clock is in (or the one before).
 */
export const recordEngagementMinute = async ({ db, studentId, assignmentId, nowMs = Date.now() } = {}) => {
  const id = clean(studentId);
  const assignment = clean(assignmentId);
  if (!db || !id || !assignment) return null;
  const utcDay = utcDayOf(nowMs);
  const minute = epochMinuteOf(nowMs);
  await setDoc(
    doc(db, 'grades', id, ENGAGEMENT_MINUTES_SUBCOLLECTION, engagementDocId(assignment, utcDay)),
    {
      schemaVersion: 1,
      studentId: id,
      assignmentId: assignment,
      utcDay,
      minutes: arrayUnion(minute),
      lastRecordedAt: serverTimestamp(),
    },
    { merge: true },
  );
  return minute;
};

export const fetchEngagementLedger = async ({ db, studentId, fromMs = null, toMs = null, assignmentId = null } = {}) => {
  const id = clean(studentId);
  if (!db || !id) return [];
  const constraints = [];
  if (assignmentId) constraints.push(where('assignmentId', '==', clean(assignmentId)));
  else {
    if (fromMs !== null && Number.isFinite(Number(fromMs))) constraints.push(where('utcDay', '>=', utcDayOf(fromMs)));
    if (toMs !== null && Number.isFinite(Number(toMs))) constraints.push(where('utcDay', '<=', utcDayOf(toMs)));
  }
  const snapshot = await getDocs(query(collection(db, 'grades', id, ENGAGEMENT_MINUTES_SUBCOLLECTION), ...constraints));
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
};

/** Everything the drawer and the report need for one student, in parallel. */
export const loadStudentSupportRecords = async ({
  db, studentId, fromMs = null, toMs = null, fromDateKey = null, toDateKey = null,
} = {}) => {
  const [revisions, evidence, serviceLog, engagement] = await Promise.all([
    fetchSupportProfileRevisions({ db, studentId }),
    fetchSupportEvidence({ db, studentId, fromMs, toMs }),
    fetchServiceLog({ db, studentId, fromDateKey, toDateKey }),
    fetchEngagementLedger({ db, studentId, fromMs, toMs }),
  ]);
  return { revisions, evidence, serviceLog, engagement };
};
