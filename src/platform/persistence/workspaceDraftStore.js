/*
 * WHERE SERVER-BACKED WORKING DRAFTS LIVE.
 *
 * `studentWorkspaceDrafts/{studentId}__{assignmentId}` — deliberately NOT the
 * grades document. Writing here changes no grade, wakes no Classroom passback
 * and produces no evidence; it is recoverable student work and nothing else.
 * One document per assignment means one read when the assignment opens and one
 * coalesced write per debounce window.
 */
import { collection, doc, getDoc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { mergeWorkspaceDraftDocument, workspaceDraftDocumentId } from '../../../functions/shared/workspaceDraftSchema.mjs';

export const WORKSPACE_DRAFT_COLLECTION = 'studentWorkspaceDrafts';

export const readWorkspaceDraft = async ({ studentId, assignmentId }) => {
  if (!studentId || !assignmentId) return null;
  const snapshot = await getDoc(doc(db, WORKSPACE_DRAFT_COLLECTION, workspaceDraftDocumentId({ studentId, assignmentId })));
  return snapshot.exists() ? snapshot.data() : null;
};

/**
 * Apply a patch by MERGING it into whatever the server currently holds.
 *
 * Never a whole-document write. A device that restored ten questions and then
 * edited one would otherwise send a document containing one entry and erase
 * the other nine — for itself and for every other device. The read and the
 * write share a transaction, so two Chromebooks editing different questions
 * both survive.
 *
 * This runs in the background flush, never in the student's typing path.
 */
export const writeWorkspaceDraft = async (patch) => {
  if (!patch?.documentId) return false;
  const reference = doc(db, WORKSPACE_DRAFT_COLLECTION, patch.documentId);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    const merged = mergeWorkspaceDraftDocument({
      existing: snapshot.exists() ? snapshot.data() : null,
      patch,
    });
    transaction.set(reference, {
      ...merged,
      // Server-stamped: a Chromebook with a wrong clock must not win by
      // claiming the future, and the rules require it to be request.time.
      updatedAt: serverTimestamp(),
    });
  });
  return true;
};

/**
 * The assignment this student most recently worked on, from the server.
 *
 * This is what makes "resume where you left off" survive a different device,
 * rather than depending on the browser that happens to be in front of them.
 */
export const readLatestWorkspaceResume = async (studentId, { maxAssignments = 1 } = {}) => {
  if (!studentId) return null;
  const snapshot = await getDocs(query(
    collection(db, WORKSPACE_DRAFT_COLLECTION),
    where('studentId', '==', studentId),
    orderBy('updatedAt', 'desc'),
    limit(Math.max(1, maxAssignments)),
  ));
  const latest = snapshot.docs.map((entry) => entry.data()).find((entry) => entry?.resume);
  return latest ? { assignmentId: latest.assignmentId, ...latest.resume } : null;
};
