/*
 * THE TEACHER'S NEXT STEPS — A DRAFT IN THIS TAB, NOT A RECORD.
 *
 * The case review's "Teacher-entered next steps" are the teacher's own words,
 * printed and exported apart from the generated evidence. MathMaster has no
 * server home for them (docs/STUDENT_CASE_REVIEW_DESIGN.md §4: kept in the page,
 * not saved), and they are not given one here. What is added is only that they
 * are no longer lost when the teacher closes the case review or reloads:
 *
 *   - kept in this tab's sessionStorage, one draft per signed-in teacher (uid)
 *     per student (src/auth/accountTabStorage.js) — never Firestore, never
 *     localStorage, never another account's key;
 *   - removed when the teacher clears the box, when any teacher signs out in
 *     this tab, when another account opens a case review here, and when the
 *     tab closes;
 *   - bounded (NEXT_STEPS_MAX_LENGTH characters).
 *
 * Without a signed-in uid or a student nothing is kept: the box still works,
 * for this page only.
 */
import { accountTabStorageKey, clearAccountTabStorage, tabStorage } from '../../auth/accountTabStorage.js';

export const NEXT_STEPS_MAX_LENGTH = 10000;
const DRAFT_NAME = 'caseReviewNextSteps';

export const nextStepsDraftKey = ({ teacherUid, studentId } = {}) => accountTabStorageKey(teacherUid, DRAFT_NAME, studentId);

/** Can this tab keep a draft for this teacher and student at all? */
export const nextStepsDraftAvailable = ({ teacherUid, studentId, storage = tabStorage() } = {}) => (
  Boolean(nextStepsDraftKey({ teacherUid, studentId })) && Boolean(storage)
);

/** This teacher's draft for this student, or '' (none, not kept, or unreadable). */
export const readNextStepsDraft = ({ teacherUid, studentId, storage = tabStorage() } = {}) => {
  const key = nextStepsDraftKey({ teacherUid, studentId });
  if (!key || !storage) return '';
  try {
    return String(storage.getItem(key) ?? '').slice(0, NEXT_STEPS_MAX_LENGTH);
  } catch {
    return '';
  }
};

/**
 * Keep this teacher's draft for this student; an empty or blank text removes
 * it. True when the browser holds the result, false when nothing could be kept.
 */
export const writeNextStepsDraft = ({ teacherUid, studentId, text = '', storage = tabStorage() } = {}) => {
  const key = nextStepsDraftKey({ teacherUid, studentId });
  if (!key || !storage) return false;
  const value = String(text ?? '').slice(0, NEXT_STEPS_MAX_LENGTH);
  try {
    if (value.trim()) storage.setItem(key, value);
    else storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

/** Drafts another account left in this tab are removed before this teacher sees the case review. */
export const forgetOtherAccountsDrafts = ({ teacherUid, storage = tabStorage() } = {}) => (
  String(teacherUid ?? '').trim() ? clearAccountTabStorage({ storage, keepUid: teacherUid }) : 0
);

export default readNextStepsDraft;
