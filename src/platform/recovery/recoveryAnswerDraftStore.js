/*
 * WHERE A STUDENT'S SAVED RECOVERY ANSWERS LIVE ON THE SERVER.
 *
 * `studentWorkspaceDrafts/{studentId}__{assignmentId}-recovery` — the
 * student's own working-draft collection, under the Security Rules every
 * assignment draft already has (owner only, `secure: false`, server-stamped
 * `updatedAt`, no grade-bearing field). Its assignment id is not the
 * assignment's, so no assignment-draft reader, teacher report or
 * auto-submit ever mistakes it for one. What goes in is decided by
 * recoveryAnswerDrafts.js: the student's answers, nothing else.
 */
import { doc, getDoc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { WORKSPACE_DRAFT_COLLECTION } from '../persistence/workspaceDraftStore.js';
import {
  applyRecoveryAnswerPatch,
  readRecoveryDraftEntries,
  recoveryDraftDocumentId,
} from './recoveryAnswerDrafts.js';

export const readRecoveryAnswerDraft = async ({ studentId, assignmentId }) => {
  if (!studentId || !assignmentId) return [];
  const snapshot = await getDoc(doc(db, WORKSPACE_DRAFT_COLLECTION, recoveryDraftDocumentId({ studentId, assignmentId })));
  return snapshot.exists() ? readRecoveryDraftEntries(snapshot.data()) : [];
};

export const writeRecoveryAnswerDraft = async (patch) => {
  if (!patch?.documentId) return [];
  const reference = doc(db, WORKSPACE_DRAFT_COLLECTION, patch.documentId);
  return runTransaction(db, (transaction) => applyRecoveryAnswerPatch({
    read: async () => {
      const snapshot = await transaction.get(reference);
      return snapshot.exists() ? snapshot.data() : null;
    },
    // Server-stamped: the rules require it, and a wrong Chromebook clock
    // must not decide anything here.
    write: (merged) => { transaction.set(reference, { ...merged, updatedAt: serverTimestamp() }); },
  }, patch));
};
