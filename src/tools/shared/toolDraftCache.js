/*
 * THE PARSED TOOL WORKSPACES THIS PAGE HOLDS, ON THEIR OWN (PF01).
 *
 * usePersistentToolState.js keeps one parsed record per tool workspace key
 * (`toolDraftCache`), shared by every field of the tool showing it. App reads
 * one thing from it: "View as Student" forgets the preview's cached
 * workspaces before the preview opens (`forgetAssignmentToolDrafts`).
 * Importing that from usePersistentToolState.js carried the whole draft hook
 * and its shape checks in front of every student's Home. The cache lives
 * here, usePersistentToolState.js reads and writes the same Map and
 * re-exports both names, so every caller still forgets the same workspaces;
 * the hook loads with the tools that use it.
 *
 * Plain JS, no React.
 */
import { parseQuestionDraftKey } from '../../questionDraftStorage.js';

/* `${draftKey}:work:${scope}` — usePersistentToolState.js, toolDraftKey. */
export const TOOL_DRAFT_SEGMENT = 'work';

/*
 * One parsed record per key, shared by every field of the tool showing it
 * (usePersistentToolState.js, loadStore). Before any tool has mounted it is
 * empty, so there is nothing to forget.
 */
export const toolDraftCache = new Map();

/**
 * Forget every cached tool workspace for one student/assignment.
 *
 * localStorage can be cleared independently of this module-level parsed cache
 * (teacher "Restart Preview Fresh" is the important case). Clearing only disk
 * and leaving this cache alive resurrects the supposedly deleted answers on
 * the next mount.
 */
export const forgetAssignmentToolDrafts = ({ studentId, assignmentId } = {}) => {
  const wantedStudent = String(studentId ?? '');
  const wantedAssignment = String(assignmentId ?? '');
  if (!wantedStudent || !wantedAssignment) return 0;
  let forgotten = 0;
  [...toolDraftCache.keys()].forEach((key) => {
    const identity = parseQuestionDraftKey(key);
    if (!identity) return;
    if (identity.studentId !== wantedStudent || identity.assignmentId !== wantedAssignment) return;
    if (!String(identity.toolSuffix || '').startsWith(`${TOOL_DRAFT_SEGMENT}:`)) return;
    const store = toolDraftCache.get(key);
    if (store?.timer !== null && store?.timer !== undefined) clearTimeout(store.timer);
    toolDraftCache.delete(key);
    forgotten += 1;
  });
  return forgotten;
};
