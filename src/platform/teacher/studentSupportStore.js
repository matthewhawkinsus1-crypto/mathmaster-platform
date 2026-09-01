import {
  addDoc,
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import {
  SUPPORT_EVENT_STAGE,
  supportEventSignalKey,
} from './studentSupportSignals.js';

export const STUDENT_SUPPORT_COLLECTION = 'studentSupportEvents';
export const STUDENT_SESSION_SUMMARY_COLLECTION = 'studentSessionSummaries';

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
    originClassId: clean(event.classId) || null,
    originTeacherEmail: email,
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
    orderBy('createdAt', 'desc'),
    limit(750),
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

export const subscribeStudentSessionSummaries = ({
  db,
  teacherEmail,
  classIds = [],
  onChange,
  onError = null,
} = {}) => {
  const email = clean(teacherEmail).toLowerCase();
  if (!db || !email || typeof onChange !== 'function') return () => {};

  const normalizedClassIds = [...new Set(
    list(classIds).map((value) => clean(value)).filter(Boolean),
  )];

  const sortSummaries = (summaries) => [...summaries].sort((a, b) => (
    Number(b.endedAt || 0) - Number(a.endedAt || 0)
    || String(b.id).localeCompare(String(a.id))
  ));

  if (!normalizedClassIds.length) {
    const q = query(
      collection(db, STUDENT_SESSION_SUMMARY_COLLECTION),
      where('authorizedTeacherEmails', 'array-contains', email),
      orderBy('endedAt', 'desc'),
      limit(1000),
    );
    return onSnapshot(
      q,
      (snapshot) => onChange(sortSummaries(
        snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
      )),
      (error) => {
        if (typeof onError === 'function') onError(error);
      },
    );
  }

  // One bounded listener per class is cheaper and more useful than letting a
  // busy teacher's newest 1,000 sessions crowd every older class out of the
  // dashboard. Each class keeps enough history for multi-day productivity
  // review while remaining bounded.
  const byClass = new Map();
  const emit = () => {
    const merged = new Map();
    [...byClass.values()].flat().forEach((summary) => merged.set(summary.id, summary));
    onChange(sortSummaries([...merged.values()]));
  };

  const unsubs = normalizedClassIds.map((classId) => {
    const q = query(
      collection(db, STUDENT_SESSION_SUMMARY_COLLECTION),
      where('authorizedTeacherEmails', 'array-contains', email),
      where('classId', '==', classId),
      orderBy('endedAt', 'desc'),
      limit(1000),
    );
    return onSnapshot(
      q,
      (snapshot) => {
        byClass.set(classId, snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
        emit();
      },
      (error) => {
        if (typeof onError === 'function') onError(error);
      },
    );
  });

  return () => unsubs.forEach((unsubscribe) => unsubscribe());
};

export const fetchStudentSupportHistory = async ({
  db,
  teacherEmail,
  studentId,
  supportLimit = 200,
  sessionLimit = 120,
} = {}) => {
  const email = clean(teacherEmail).toLowerCase();
  const student = clean(studentId);
  if (!db || !email || !student) return { events: [], summaries: [] };

  const [eventSnapshot, sessionSnapshot] = await Promise.all([
    getDocs(query(
      collection(db, STUDENT_SUPPORT_COLLECTION),
      where('authorizedTeacherEmails', 'array-contains', email),
      where('studentId', '==', student),
      orderBy('createdAt', 'desc'),
      limit(Math.max(1, Math.min(500, Number(supportLimit) || 200))),
    )),
    getDocs(query(
      collection(db, STUDENT_SESSION_SUMMARY_COLLECTION),
      where('authorizedTeacherEmails', 'array-contains', email),
      where('studentId', '==', student),
      orderBy('endedAt', 'desc'),
      limit(Math.max(1, Math.min(365, Number(sessionLimit) || 120))),
    )),
  ]);

  return {
    events: eventSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
    summaries: sessionSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
  };
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
