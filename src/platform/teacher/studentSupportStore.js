import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import {
  SUPPORT_EVENT_STAGE,
  supportEventSignalKey,
} from './studentSupportSignals.js';

export const STUDENT_SUPPORT_COLLECTION = 'studentSupportEvents';

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);
const safeObject = (value) => (
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
);

const compactEvidence = (value = {}) => Object.fromEntries(
  Object.entries(safeObject(value))
    .filter(([, entry]) => entry !== undefined)
    .slice(0, 40)
    .map(([key, entry]) => {
      if (Array.isArray(entry)) return [key, entry.slice(0, 30)];
      if (entry && typeof entry === 'object') {
        return [key, Object.fromEntries(Object.entries(entry).slice(0, 20))];
      }
      if (typeof entry === 'string') return [key, entry.slice(0, 500)];
      return [key, entry];
    }),
);

/**
 * Append-only support record. A signal is never edited into a fact later:
 * confirmation, dismissal, parent contact and resolution are new events that
 * point back to the earlier record. That preserves the difference between
 * "MathMaster suggested" and "teacher observed".
 */
export const recordStudentSupportEvent = async ({
  db,
  teacherEmail,
  event = {},
} = {}) => {
  const email = clean(teacherEmail).toLowerCase();
  if (!db) throw new Error('Student support logging needs Firestore.');
  if (!email) throw new Error('A signed-in teacher email is required to log student support.');

  const kind = clean(event.kind);
  const studentId = clean(event.studentId);
  if (!kind || !studentId) throw new Error('Student support events need a kind and student.');

  const nowIso = new Date().toISOString();
  const dayKey = nowIso.slice(0, 10);
  const signalKey = clean(event.signalKey) || supportEventSignalKey({
    kind,
    studentId,
    classId: event.classId,
    assignmentId: event.assignmentId,
    sessionKey: event.sessionKey,
    dayKey: event.dayKey || dayKey,
  });

  const payload = {
    schemaVersion: 1,
    kind,
    stage: clean(event.stage) || SUPPORT_EVENT_STAGE.TEACHER_CONFIRMED,
    studentId,
    studentName: clean(event.studentName) || studentId,
    classId: clean(event.classId) || null,
    classPeriod: clean(event.classPeriod) || null,
    assignmentId: clean(event.assignmentId) || null,
    assignmentTitle: clean(event.assignmentTitle).slice(0, 180) || null,
    sessionKey: clean(event.sessionKey) || null,
    signalKey,
    summary: clean(event.summary).slice(0, 800),
    note: clean(event.note).slice(0, 1200),
    source: clean(event.source) || 'teacher',
    confidence: clean(event.confidence) || null,
    evidence: compactEvidence(event.evidence),
    relatedEventId: clean(event.relatedEventId) || null,
    createdByEmail: email,
    authorizedTeacherEmails: [...new Set([
      email,
      ...list(event.authorizedTeacherEmails).map((value) => clean(value).toLowerCase()).filter(Boolean),
    ])].slice(0, 12),
    createdAt: nowIso,
    createdAtServer: serverTimestamp(),
  };

  const ref = await addDoc(collection(db, STUDENT_SUPPORT_COLLECTION), payload);
  return { id: ref.id, ...payload };
};

export const subscribeStudentSupportEvents = ({
  db,
  teacherEmail,
  onChange,
  onError = null,
} = {}) => {
  const email = clean(teacherEmail).toLowerCase();
  if (!db || !email || typeof onChange !== 'function') return () => {};

  const q = query(
    collection(db, STUDENT_SUPPORT_COLLECTION),
    where('authorizedTeacherEmails', 'array-contains', email),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const events = snapshot.docs
        .map((entry) => ({ id: entry.id, ...entry.data() }))
        .sort((a, b) => (
          Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '')
          || String(b.id).localeCompare(String(a.id))
        ));
      onChange(events);
    },
    (error) => {
      if (typeof onError === 'function') onError(error);
    },
  );
};

export const supportEventsForClass = (events = [], classId = null, classPeriod = null) => (
  list(events).filter((event) => {
    if (classId) return event.classId === classId;
    if (classPeriod) return event.classPeriod === classPeriod;
    return true;
  })
);

export const supportEventsForStudent = (events = [], studentId = null) => (
  list(events).filter((event) => !studentId || event.studentId === studentId)
);
