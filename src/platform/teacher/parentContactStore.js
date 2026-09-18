import { addDoc, collection, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
import { CONTACT_CATEGORIES, CONTACT_METHODS, validateContactDraft } from './parentContactCenter.js';

export const PARENT_CONTACT_COLLECTION = 'parentContactLogs';
const clean = (value) => String(value ?? '').trim();

export const recordParentContact = async ({ db, teacherEmail, contact = {} } = {}) => {
  const email = clean(teacherEmail).toLowerCase();
  const errors = validateContactDraft(contact);
  if (!db || !email) throw new Error('A signed-in teacher and Firestore are required.');
  if (errors.length) throw new Error(errors.join(' '));
  // Explicit allow-list: answer text/evidence can never hitch a ride in this record.
  const payload = {
    schemaVersion: 1, studentId: clean(contact.studentId), studentName: clean(contact.studentName),
    classId: clean(contact.classId) || null, classPeriod: clean(contact.classPeriod) || null,
    occurredAt: new Date(contact.occurredAt).toISOString(), method: CONTACT_METHODS.includes(contact.method) ? contact.method : 'other',
    category: CONTACT_CATEGORIES.includes(contact.category) ? contact.category : 'other', notes: clean(contact.notes).slice(0, 2000),
    outcome: clean(contact.outcome).slice(0, 1000), followUpDate: clean(contact.followUpDate) || null,
    recordType: 'contact', parentContactId: null,
    // sourceEventId is intentionally transient. App uses the caller's contact
    // object to append the linked support resolution after this write succeeds;
    // parentContactLogs keeps the fixed PR #271 Firestore schema.
    createdByEmail: email, originTeacherEmail: email, originClassId: clean(contact.classId) || null,
    authorizedTeacherEmails: [email], createdAt: new Date().toISOString(), createdAtServer: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, PARENT_CONTACT_COLLECTION), payload);
  return { id: ref.id, ...payload };
};

/** Append a resolution rather than rewriting the historical contact. */
export const recordParentContactResolution = async ({ db, teacherEmail, contact } = {}) => {
  const email = clean(teacherEmail).toLowerCase();
  if (!db || !email || !clean(contact?.id) || !clean(contact?.studentId)) throw new Error('A contact and signed-in teacher are required.');
  const now = new Date().toISOString();
  const payload = {
    schemaVersion: 1, recordType: 'followUpResolution', parentContactId: clean(contact.id),
    studentId: clean(contact.studentId), studentName: clean(contact.studentName), classId: clean(contact.classId) || null,
    classPeriod: clean(contact.classPeriod) || null, occurredAt: now, method: 'other', category: 'other', notes: '',
    outcome: 'Follow-up completed', followUpDate: null, createdByEmail: email, originTeacherEmail: email,
    originClassId: clean(contact.classId) || null, authorizedTeacherEmails: [email], createdAt: now, createdAtServer: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, PARENT_CONTACT_COLLECTION), payload);
  return { id: ref.id, ...payload };
};

export const resolveContactEvents = (rows) => {
  const resolved = new Set(rows.filter((row) => row.recordType === 'followUpResolution').map((row) => clean(row.parentContactId)));
  return rows.filter((row) => row.recordType !== 'followUpResolution').map((row) => ({ ...row, followUpCompleted: resolved.has(row.id) }));
};

export const subscribeParentContacts = ({ db, teacherEmail, onChange, onError } = {}) => {
  const email = clean(teacherEmail).toLowerCase();
  if (!db || !email || typeof onChange !== 'function') return () => {};
  return onSnapshot(query(collection(db, PARENT_CONTACT_COLLECTION), where('authorizedTeacherEmails', 'array-contains', email), orderBy('occurredAt', 'desc'), limit(2000)),
    (snapshot) => onChange(resolveContactEvents(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })))), onError);
};

/** Dedicated unbounded read used only by the explicit complete-history export. */
export const fetchAllParentContactsForExport = async ({ db, teacherEmail } = {}) => {
  const email = clean(teacherEmail).toLowerCase();
  if (!db || !email) throw new Error('A signed-in teacher and Firestore are required.');
  const snapshot = await getDocs(query(collection(db, PARENT_CONTACT_COLLECTION), where('authorizedTeacherEmails', 'array-contains', email), orderBy('occurredAt', 'desc')));
  return resolveContactEvents(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
};
