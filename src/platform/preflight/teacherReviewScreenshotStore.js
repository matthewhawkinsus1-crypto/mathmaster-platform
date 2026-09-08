import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase.js';
import {
  TEACHER_REVIEW_SCREENSHOTS_COLLECTION,
  buildTeacherReviewScreenshotRecord,
} from './teacherReviewScreenshot.js';

/**
 * Persistence for review screenshots.
 *
 * These are stored outside the assignment document for the same reason the
 * written notes are: /assignments is student-readable, and a teacher's evidence
 * about a broken question is teacher-only. They are stored outside the review
 * context as well, because that document is small, read constantly, and capped
 * at 1 MiB — see teacherReviewScreenshot.js.
 */

const currentTeacherIdentity = () => {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error('Sign in as a teacher before attaching review screenshots.');
  return { uid: user.uid, email: user.email || null };
};

const screenshotRef = (screenshotId) => doc(db, TEACHER_REVIEW_SCREENSHOTS_COLLECTION, String(screenshotId));

export const saveTeacherReviewScreenshot = async ({ dataUrl, assignmentId, questionId = null, flagId = null }) => {
  const owner = currentTeacherIdentity();
  const record = buildTeacherReviewScreenshotRecord({
    dataUrl,
    ownerUid: owner.uid,
    assignmentId,
    questionId,
    flagId,
  });
  const { id, ...document } = record;
  await setDoc(screenshotRef(id), document, { merge: false });
  return record;
};

/** A missing screenshot is a normal outcome — the teacher may have removed it. */
export const loadTeacherReviewScreenshot = async (screenshotId) => {
  if (!screenshotId) return null;
  const owner = currentTeacherIdentity();
  const snapshot = await getDoc(screenshotRef(screenshotId));
  if (!snapshot.exists()) return null;
  const record = snapshot.data() || {};
  if (record.ownerUid !== owner.uid) {
    throw new Error('This review screenshot belongs to a different teacher.');
  }
  return { id: snapshot.id, ...record };
};

export const deleteTeacherReviewScreenshot = async (screenshotId) => {
  if (!screenshotId) return;
  currentTeacherIdentity();
  await deleteDoc(screenshotRef(screenshotId));
};

export default {
  saveTeacherReviewScreenshot,
  loadTeacherReviewScreenshot,
  deleteTeacherReviewScreenshot,
};
