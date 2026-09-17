import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp, where } from 'firebase/firestore';
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
    outcome: clean(contact.outcome).slice(0, 1000), followUpDate: clean(contact.followUpDate) || null, followUpCompleted: false,
    createdByEmail: email, authorizedTeacherEmails: [email], createdAt: new Date().toISOString(), createdAtServer: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, PARENT_CONTACT_COLLECTION), payload);
  return { id: ref.id, ...payload };
};

export const subscribeParentContacts = ({ db, teacherEmail, onChange, onError } = {}) => {
  const email = clean(teacherEmail).toLowerCase();
  if (!db || !email || typeof onChange !== 'function') return () => {};
  return onSnapshot(query(collection(db, PARENT_CONTACT_COLLECTION), where('authorizedTeacherEmails', 'array-contains', email), orderBy('occurredAt', 'desc'), limit(2000)),
    (snapshot) => onChange(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))), onError);
};
