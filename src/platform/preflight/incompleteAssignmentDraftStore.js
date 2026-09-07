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
  finalizeIncompleteAssignmentReview,
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

export const updateIncompleteAssignmentDraft = async (draft, repairedAssignmentV5) => {
  if (!draft?.id) throw new Error('The incomplete assignment draft is missing its saved ID.');
  currentTeacherIdentity();
  const next = markIncompleteDraftForReview(draft, repairedAssignmentV5);
  const { id: _id, ...patch } = next;
  await updateDoc(doc(db, INCOMPLETE_ASSIGNMENT_DRAFTS_COLLECTION, draft.id), patch);
  return next;
};

/** Persist a staged Step 5 repair only after questionRepairImport has approved it. */
export const commitIncompleteAssignmentDraftRepair = async (draft, committedRepair) => {
  if (!draft?.id) throw new Error('The incomplete assignment draft is missing its saved ID.');
  currentTeacherIdentity();
  const next = applyIncompleteDraftRepairCommit(draft, committedRepair);
  const { id: _id, ...patch } = next;
  await updateDoc(doc(db, INCOMPLETE_ASSIGNMENT_DRAFTS_COLLECTION, draft.id), patch);
  return next;
};

/** Teacher flags are human-owned review state and may be saved without rewriting a question. */
export const saveIncompleteAssignmentTeacherReviewContext = async (draft, teacherReviewContext) => {
  if (!draft?.id) throw new Error('The incomplete assignment draft is missing its saved ID.');
  currentTeacherIdentity();
  const updatedAt = new Date().toISOString();
  const safeContext = JSON.parse(JSON.stringify(teacherReviewContext || { flags: [] }));
  await updateDoc(doc(db, INCOMPLETE_ASSIGNMENT_DRAFTS_COLLECTION, draft.id), {
    teacherReviewContext: safeContext,
    updatedAt,
  });
  return {
    ...draft,
    teacherReviewContext: safeContext,
    updatedAt,
  };
};

/**
 * Promote a repaired draft to Ready, or to Published.
 *
 * finalizeIncompleteAssignmentReview decides whether the draft may advance —
 * blocking diagnostics refuse, an override counts only where the finding is
 * eligible for one, and any open teacher flag refuses outright. It throws with
 * the reason when it will not, and this deliberately does not catch: a draft
 * that cannot advance must not be written as though it did.
 *
 * Ready is not Published. Reaching the Library and being given to students are
 * separate decisions, so publishing is an explicit argument rather than
 * something readiness implies. Neither rewrites question JSON, and neither
 * advances assignmentRevision — reviewing is not editing.
 */
export const finalizeIncompleteAssignmentDraftReview = async (draft, { published = false } = {}) => {
  if (!draft?.id) throw new Error('The incomplete assignment draft is missing its saved ID.');
  currentTeacherIdentity();
  const next = finalizeIncompleteAssignmentReview(draft, { published });
  const { id: _id, ...patch } = next;
  await updateDoc(doc(db, INCOMPLETE_ASSIGNMENT_DRAFTS_COLLECTION, draft.id), patch);
  return next;
};

/**
 * The draft's job ends when the assignment it was standing in for is published.
 *
 * Leaving it behind means the teacher sees the same assignment in two places —
 * once in the Library and once in Incomplete Assignments, still asking to be
 * repaired — and the stale copy is the one that keeps the old question JSON.
 */
export const markIncompleteAssignmentDraftPublished = async (draftId) => {
  if (!draftId) return;
  currentTeacherIdentity();
  await deleteDoc(doc(db, INCOMPLETE_ASSIGNMENT_DRAFTS_COLLECTION, draftId));
};

export const deleteIncompleteAssignmentDraft = async (draftId) => {
  if (!draftId) return;
  currentTeacherIdentity();
  await deleteDoc(doc(db, INCOMPLETE_ASSIGNMENT_DRAFTS_COLLECTION, draftId));
};

export { restoreIncompleteAssignmentV5 };
