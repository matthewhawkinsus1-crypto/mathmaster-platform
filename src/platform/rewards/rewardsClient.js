import { httpsCallable } from 'firebase/functions';
import {
  collection, getDocs, onSnapshot, query, where,
} from 'firebase/firestore';
import { functions } from '../../firebase.js';
import { loadTeacherGradeTransferState } from '../gradeTransfer/gradeTransferStore.js';

/*
 * REWARDS: THE FIRESTORE AND CALLABLE SEAM.
 *
 * Reads are scoped to one student in one class, exactly like the Class Points
 * wallet (classPointsClient.js): a missing identity is a no-op, never a broad
 * query. Every write is a callable — firestore.rules forbid any client write
 * to rewardGrants or classPointRewardRedemptions, so hiding a button is never
 * the only thing stopping a student.
 *
 *   inventory   a live listener on the student's AVAILABLE rewards only
 *               (small, and it is what makes a new reward appear at once)
 *   history     a one-time read when the student opens History
 *   teacher     one authorized callable read per student (getStudentRewards)
 */

const GRANTS = 'rewardGrants';
const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const withId = (entry) => ({ grantId: entry.id, ...entry.data() });

export const subscribeToStudentRewardInventory = ({ db, studentId, classId, onGrants, onError = () => {} }) => {
  const student = clean(studentId, 64);
  const cls = clean(classId, 120);
  if (!db || !student || !cls) {
    onGrants?.([]);
    return () => {};
  }
  return onSnapshot(
    query(
      collection(db, GRANTS),
      where('studentId', '==', student),
      where('classId', '==', cls),
      where('status', '==', 'available'),
    ),
    (snapshot) => onGrants(snapshot.docs.map(withId)),
    onError,
  );
};

/** Every reward this student has had in this class — used, taken back and expired included. */
export const loadStudentRewardHistory = async ({ db, studentId, classId }) => {
  const student = clean(studentId, 64);
  const cls = clean(classId, 120);
  if (!db || !student || !cls) return [];
  const snapshot = await getDocs(query(collection(db, GRANTS), where('studentId', '==', student), where('classId', '==', cls)));
  return snapshot.docs.map(withId);
};

const call = (name) => {
  const callable = httpsCallable(functions, name);
  return async (payload) => (await callable(payload)).data || {};
};

const redeemCallable = call('redeemPracticePass');

/** Use a Practice Pass. `payWith`: 'pass' (one the student holds) or 'classPoints'. */
export const usePracticePass = ({ assignmentId, payWith = 'pass', grantId = null }) => redeemCallable({
  assignmentId: clean(assignmentId),
  payWith: payWith === 'classPoints' ? 'classPoints' : 'pass',
  ...(grantId ? { grantId: clean(grantId) } : {}),
});

export const awardRewardGrant = call('awardRewardGrant');
export const revokeRewardGrant = call('revokeRewardGrant');
export const undoPracticePassRedemption = call('undoPracticePassRedemption');
export const getStudentRewards = call('getStudentRewards');

/**
 * "student__class__assignment" keys of the class's live Practice Pass waivers,
 * for the teacher gradebook. The same authorized callable Grade Transfer uses,
 * asked for waivers only.
 */
export const loadClassPracticePassKeys = async (classId) => {
  const cls = clean(classId, 120);
  if (!cls) return new Set();
  const { practicePasses } = await loadTeacherGradeTransferState({ classIds: [cls], practicePassesOnly: true });
  return practicePasses;
};

export const practicePassKey = (studentId, classId, assignmentId) => `${studentId}__${classId}__${assignmentId}`;
