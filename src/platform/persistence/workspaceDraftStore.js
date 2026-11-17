/*
 * WHERE SERVER-BACKED WORKING DRAFTS LIVE.
 *
 * `studentWorkspaceDrafts/{studentId}__{assignmentId}` — deliberately NOT the
 * grades document. Writing here changes no grade, wakes no Classroom passback
 * and produces no evidence; it is recoverable student work and nothing else.
 * One document per assignment means one read when the assignment opens, which
 * its first save writes with (openWorkspaceDraft), and one coalesced write per
 * debounce window.
 */
import { collection, doc, getDocs, limit, orderBy, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { mergeWorkspaceDraftDocumentReport, workspaceDraftDocumentId } from '../../../functions/shared/workspaceDraftSchema.mjs';
import { holdDraftRead } from './heldDraftRead.js';

export const WORKSPACE_DRAFT_COLLECTION = 'studentWorkspaceDrafts';

const storedData = (snapshot) => (snapshot.exists() ? snapshot.data() : null);

// A save's write, in its transaction: the patch merged into what was read.
// Returns the drafts the document's caps left out.
const writeMerged = (transaction, reference, existing, patch) => {
  const report = mergeWorkspaceDraftDocumentReport({ existing, patch });
  transaction.set(reference, {
    ...report.document,
    // Server-stamped: a Chromebook with a wrong clock must not win by
    // claiming the future, and the rules require it to be request.time.
    updatedAt: serverTimestamp(),
  });
  return report.droppedKeys;
};

/**
 * The assignment's server copy, read as it opens and held for its first save
 * (heldDraftRead.js): `serverCopy` resolves to the stored document (null when
 * there is none), and `save(patch)` merges the first save into it and writes
 * it in the same transaction. One read for both.
 */
export const openWorkspaceDraft = ({ studentId, assignmentId }) => {
  const reference = doc(db, WORKSPACE_DRAFT_COLLECTION, workspaceDraftDocumentId({ studentId, assignmentId }));
  return holdDraftRead({
    transact: (update) => runTransaction(db, update),
    read: async (transaction) => storedData(await transaction.get(reference)),
    write: (transaction, existing, patch) => writeMerged(transaction, reference, existing, patch),
  });
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
  let droppedKeys = [];
  await runTransaction(db, async (transaction) => {
    const existing = storedData(await transaction.get(reference));
    // Of the attempt that commits (a retried transaction runs again).
    droppedKeys = writeMerged(transaction, reference, existing, patch);
  });
  // The drafts the document's caps left out (workspaceDraftSchema.mjs): the
  // sync tells the student they are on this device only.
  return { written: true, droppedKeys };
};

/**
 * The assignment this student most recently worked on, from the server.
 *
 * This is what makes "resume where you left off" survive a different device,
 * rather than depending on the browser that happens to be in front of them.
 */
// More than one: a Recovery's saved answers live in this collection too
// (`…-recovery`, platform/recovery/recoveryAnswerDrafts.js) and carry no
// resume, so the newest document alone could hide the assignment to resume.
export const readLatestWorkspaceResume = async (studentId, { maxAssignments = 4 } = {}) => {
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
