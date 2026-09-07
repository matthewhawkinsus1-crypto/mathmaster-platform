import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, auth } from '../../firebase.js';
import {
  applyIncompleteDraftRepairCommit,
  buildIncompleteAssignmentDraftRecord,
  markIncompleteDraftForReview,
  restoreIncompleteAssignmentV5,
} from './incompleteAssignmentDraft.js';

export const INCOMPLETE_ASSIGNMENT_DRAFTS_COLLECTION = 'assignmentAuthoringDrafts';

const currentTeacherIdentity = () => {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error('Sign in as a teacher before saving an incomplete assignment.');
  return {
    uid: user.uid,
    email: user.email || null,
  };
};

const draftCollection = () => collection(db, INCOMPLETE_ASSIGNMENT_DRAFTS_COLLECTION);

export const saveIncompleteAssignmentDraft = async ({ intakeResult, rawText, sourceName } = {}) => {
  const owner = currentTeacherIdentity();
  const record = buildIncompleteAssignmentDraftRecord({
    intakeResult,
    rawText,
    sourceName,
    ownerUid: owner.uid,
    ownerEmail: owner.email,
  });
  const ref = await addDoc(draftCollection(), record);
  return { id: ref.id, ...record };
};

export const listIncompleteAssignmentDrafts = async () => {
  const owner = currentTeacherIdentity();
  const snapshot = await getDocs(query(
    draftCollection(),
    where('authoringReview.ownerUid', '==', owner.uid),
  ));
  return snapshot.docs
    .map((entry) => ({ id: entry.id, ...entry.data() }))
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
};

/**
 * Save a repaired draft.
 *
 * A repair committed through the Repair Center carries a teacher review context
 * and the revision it was committed at, and those must land with the assignment
 * rather than beside it: storing the questions while dropping the revision
 * leaves the next repair to be built against a number that no longer describes
 * the draft, which is exactly what the stale-repair guard reads. Callers that
 * pass neither keep the plain revalidation behaviour.
 */
export const updateIncompleteAssignmentDraft = async (draft, repairedAssignmentV5, commit = null) => {
  if (!draft?.id) throw new Error('The incomplete assignment draft is missing its saved ID.');
  currentTeacherIdentity();
  const next = commit
    ? applyIncompleteDraftRepairCommit(draft, {
      assignmentV5: repairedAssignmentV5,
      teacherReviewContext: commit.teacherReviewContext ?? draft.teacherReviewContext ?? null,
      committedRevision: commit.committedRevision,
    })
    : markIncompleteDraftForReview(draft, repairedAssignmentV5);
  const { id: _id, ...patch } = next;
  await updateDoc(doc(db, INCOMPLETE_ASSIGNMENT_DRAFTS_COLLECTION, draft.id), patch);
  return next;
};

export const deleteIncompleteAssignmentDraft = async (draftId) => {
  if (!draftId) return;
  currentTeacherIdentity();
  await deleteDoc(doc(db, INCOMPLETE_ASSIGNMENT_DRAFTS_COLLECTION, draftId));
};

export { restoreIncompleteAssignmentV5 };
