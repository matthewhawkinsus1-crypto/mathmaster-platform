import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase.js';
import { emptyTeacherReviewContext } from './teacherReviewContext.js';

export const ASSIGNMENT_QUESTION_REVIEWS_COLLECTION = 'assignmentQuestionReviews';

const jsonSafe = (value) => JSON.parse(JSON.stringify(value));

const currentTeacherIdentity = () => {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error('Sign in as a teacher before reviewing assignment questions.');
  return { uid: user.uid, email: user.email || null };
};

const requireAssignmentId = (assignmentId) => {
  const value = String(assignmentId || '').trim();
  if (!value) throw new Error('Assignment review requires a saved assignment ID.');
  return value;
};

export const assignmentQuestionReviewDocId = (ownerUid, assignmentId) => (
  `${encodeURIComponent(String(ownerUid || '').trim())}__${encodeURIComponent(requireAssignmentId(assignmentId))}`
);

const reviewRef = (ownerUid, assignmentId) => doc(
  db,
  ASSIGNMENT_QUESTION_REVIEWS_COLLECTION,
  assignmentQuestionReviewDocId(ownerUid, assignmentId),
);

/**
 * Teacher review notes are intentionally stored outside /assignments because
 * assignment documents are student-readable. A missing review document is the
 * normal empty state, not an error.
 */
export const loadAssignmentTeacherReviewContext = async (assignmentId) => {
  const owner = currentTeacherIdentity();
  const safeAssignmentId = requireAssignmentId(assignmentId);
  const snapshot = await getDoc(reviewRef(owner.uid, safeAssignmentId));
  if (!snapshot.exists()) return emptyTeacherReviewContext();
  const record = snapshot.data() || {};
  if (record.ownerUid !== owner.uid || record.assignmentId !== safeAssignmentId) {
    throw new Error('Assignment review ownership does not match the signed-in teacher.');
  }
  return jsonSafe(record.teacherReviewContext || emptyTeacherReviewContext());
};

export const saveAssignmentTeacherReviewContext = async (assignmentId, teacherReviewContext) => {
  const owner = currentTeacherIdentity();
  const safeAssignmentId = requireAssignmentId(assignmentId);
  const ref = reviewRef(owner.uid, safeAssignmentId);
  const existing = await getDoc(ref);
  const nowIso = new Date().toISOString();
  const safeContext = jsonSafe(teacherReviewContext || emptyTeacherReviewContext());
  const record = {
    ownerUid: owner.uid,
    ownerEmail: owner.email,
    assignmentId: safeAssignmentId,
    teacherReviewContext: safeContext,
    createdAt: existing.exists() ? existing.data()?.createdAt || nowIso : nowIso,
    updatedAt: nowIso,
  };
  await setDoc(ref, record, { merge: false });
  return safeContext;
};
