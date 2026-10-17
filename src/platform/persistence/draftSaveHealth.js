/*
 * WHEN UNFINISHED WORK IS NOT BEING SAVED, THE STUDENT HEARS IT (Batch 3).
 *
 * Three ways a student's working draft could stop being saved, and each one
 * used to be a console line only (PR #458, "Not in this PR"):
 *
 *   DEVICE_FULL      local storage refused the draft (full, or blocked
 *                    mid-session). The background save may still carry it,
 *                    but this Chromebook no longer holds it.
 *   BACKUP_REFUSED   the server backup's guard refused the record
 *                    (workspaceDraftSchema.mjs: a verdict in tool state, or a
 *                    record over the size cap). It is on this device only.
 *   BACKUP_FULL      the assignment's backup document is at its caps (120
 *                    drafts, 400 KB): the oldest drafts no longer reach the
 *                    server. They are on the device that saved them only.
 *
 * The guards stay exactly as strict; this only stops the failure being
 * silent. Problems are kept per draft key, so one that is saved again later
 * (space freed, the record fixed, an older draft retired) clears itself. The
 * developer detail still goes to draftSyncDiagnostics.js; the student gets one
 * plain sentence (`describeDraftSaveProblems`) and is never shown a key or a
 * field path.
 */

export const DRAFT_SAVE_PROBLEM = Object.freeze({
  DEVICE_FULL: 'device-full',
  BACKUP_REFUSED: 'backup-refused',
  BACKUP_FULL: 'backup-full',
});

const KINDS = Object.values(DRAFT_SAVE_PROBLEM);
const MAX_KEYS_PER_KIND = 200;

const problems = new Map(KINDS.map((kind) => [kind, new Set()]));
const listeners = new Set();

const snapshot = () => Object.fromEntries(KINDS.map((kind) => [kind, problems.get(kind).size]));

const notify = () => {
  const current = snapshot();
  listeners.forEach((listener) => {
    try {
      listener(current);
    } catch {
      // A failing listener must never cost the student their keystroke.
    }
  });
};

/** One draft could not be saved this way. Cheap, and safe to call on every keystroke. */
export const reportDraftSaveProblem = (kind, key = '') => {
  const set = problems.get(kind);
  if (!set) return false;
  const id = String(key || '');
  if (set.has(id)) return false;
  set.add(id);
  while (set.size > MAX_KEYS_PER_KIND) set.delete(set.values().next().value);
  notify();
  return true;
};

/** That draft was saved this way after all. */
export const clearDraftSaveProblem = (kind, key = '') => {
  const set = problems.get(kind);
  if (!set || !set.size) return false;
  if (!set.delete(String(key || ''))) return false;
  notify();
  return true;
};

/** Every problem of one kind is over (a backup that kept everything), or all of them (sign-out). */
export const clearDraftSaveProblems = (kind = null) => {
  const kinds = kind ? [kind] : KINDS;
  let changed = false;
  kinds.forEach((each) => {
    const set = problems.get(each);
    if (set?.size) { set.clear(); changed = true; }
  });
  if (changed) notify();
  return changed;
};

/** `{ 'device-full': n, 'backup-refused': n, 'backup-full': n }`. */
export const currentDraftSaveProblems = () => snapshot();

export const subscribeDraftSaveHealth = (listener) => {
  if (typeof listener !== 'function') return () => {};
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/*
 * The sentence the student reads, or null when nothing is wrong. The most
 * serious first: work this device does not hold beats work only this device
 * holds. Each says where the work is and what to do — never "saved" for work
 * that is not.
 */
export const DRAFT_SAVE_PROBLEM_TEXT = Object.freeze({
  [DRAFT_SAVE_PROBLEM.DEVICE_FULL]: 'Your work is not being saved on this device: its storage is full. Keep this tab open so MathMaster can back it up, and tell your teacher.',
  [DRAFT_SAVE_PROBLEM.BACKUP_REFUSED]: 'Some of your work on this assignment can only be saved on this device, not backed up to MathMaster. Finish it on this device, and tell your teacher.',
  [DRAFT_SAVE_PROBLEM.BACKUP_FULL]: 'This assignment has more unfinished work than MathMaster can back up. Your oldest unfinished work is saved only on the device where you did it.',
});

/*
 * One student's problems on one assignment. Draft keys name both
 * (questionDraftStorage.js buildQuestionDraftKey); a problem on another
 * assignment is not this screen's to report.
 */
export const draftSaveProblemsFor = ({ studentId, assignmentId } = {}) => {
  if (!studentId || !assignmentId) return Object.fromEntries(KINDS.map((kind) => [kind, 0]));
  const part = (value) => encodeURIComponent(String(value ?? ''));
  const prefix = `mathmaster:draft:v2::${part(studentId)}:${part(assignmentId)}:`;
  return Object.fromEntries(KINDS.map((kind) => [kind, [...problems.get(kind)].filter((key) => key.startsWith(prefix)).length]));
};

export const describeDraftSaveProblems = (counts = snapshot()) => {
  const kind = KINDS.find((each) => Number(counts?.[each]) > 0);
  return kind ? { kind, text: DRAFT_SAVE_PROBLEM_TEXT[kind] } : null;
};
