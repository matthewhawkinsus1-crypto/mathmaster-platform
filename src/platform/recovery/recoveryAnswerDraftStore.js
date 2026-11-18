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
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { holdDraftRead } from '../persistence/heldDraftRead.js';
import { WORKSPACE_DRAFT_COLLECTION } from '../persistence/workspaceDraftStore.js';
import {
  applyRecoveryAnswerPatch,
  recoveryDraftDocumentId,
  writeRecoveryAnswerPatch,
} from './recoveryAnswerDrafts.js';

const storedData = (snapshot) => (snapshot.exists() ? snapshot.data() : null);
// Server-stamped: the rules require it, and a wrong Chromebook clock must not
// decide anything here.
const setStamped = (transaction, reference) => (merged) => {
  transaction.set(reference, { ...merged, updatedAt: serverTimestamp() });
};

/**
 * The Recovery's server copy, read as it opens and held for its first save
 * (heldDraftRead.js), as a lesson's drafts are: `serverCopy` resolves to the
 * stored document (null when there is none), and `save(patch)` merges the
 * first save into it and writes it in the same transaction, resolving to the
 * stored answers it sent. One read for both. A write another Chromebook made
 * in between is read again and merged into, never overwritten.
 */
export const openRecoveryAnswerDraft = ({ studentId, assignmentId }) => {
  const reference = doc(db, WORKSPACE_DRAFT_COLLECTION, recoveryDraftDocumentId({ studentId, assignmentId }));
  return holdDraftRead({
    transact: (update) => runTransaction(db, update),
    read: async (transaction) => storedData(await transaction.get(reference)),
    write: (transaction, existing, patch) => writeRecoveryAnswerPatch(existing, patch, setStamped(transaction, reference)),
  });
};

export const writeRecoveryAnswerDraft = async (patch) => {
  if (!patch?.documentId) return [];
  const reference = doc(db, WORKSPACE_DRAFT_COLLECTION, patch.documentId);
  return runTransaction(db, (transaction) => applyRecoveryAnswerPatch({
    read: async () => storedData(await transaction.get(reference)),
    write: setStamped(transaction, reference),
  }, patch));
};
