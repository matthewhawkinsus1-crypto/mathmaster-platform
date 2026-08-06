const DRAFT_PREFIX = 'mathmaster:draft:v2:';
const RESUME_PREFIX = 'mathmaster:resume:v1:';
const MAX_DRAFT_AGE_MS = 1000 * 60 * 60 * 24 * 45;

const safeParse = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const storageAvailable = () => {
  try {
    return typeof window !== 'undefined' && Boolean(window.localStorage);
  } catch {
    return false;
  }
};

const normalizeKeyPart = (value) => encodeURIComponent(String(value ?? ''));

export const buildQuestionDraftKey = ({
  studentId,
  assignmentId,
  questionIndex,
  variantIndex = 0,
  sessionMode = 'graded',
}) => {
  const sessionBucket = sessionMode === 'preview' ? 'preview' : 'student';
  return [
    DRAFT_PREFIX,
    normalizeKeyPart(studentId || 'anonymous'),
    normalizeKeyPart(assignmentId || 'assignment'),
    normalizeKeyPart(questionIndex ?? 0),
    normalizeKeyPart(variantIndex),
    normalizeKeyPart(sessionBucket),
  ].join(':');
};

export const readQuestionDraft = (key, fallback = null) => {
  if (!key || !storageAvailable()) return fallback;
  const parsed = safeParse(window.localStorage.getItem(key));
  if (!parsed || typeof parsed !== 'object') return fallback;
  const savedAt = Number(parsed.savedAt || 0);
  if (savedAt && Date.now() - savedAt > MAX_DRAFT_AGE_MS) {
    window.localStorage.removeItem(key);
    return fallback;
  }
  return parsed.value ?? fallback;
};

export const writeQuestionDraft = (key, value) => {
  if (!key || !storageAvailable()) return false;
  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        version: 2,
        savedAt: Date.now(),
        value,
      }),
    );
    return true;
  } catch (error) {
    console.warn('MathMaster could not save local question work:', error);
    return false;
  }
};

export const removeQuestionDraft = (key) => {
  if (!key || !storageAvailable()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Local draft removal is best-effort only.
  }
};


export const removeQuestionDraftFamily = (prefix) => {
  if (!prefix || !storageAvailable()) return;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key === prefix || key?.startsWith(`${prefix}:`)) window.localStorage.removeItem(key);
    }
  } catch {
    // Best-effort cleanup only.
  }
};

export const removeAssignmentDrafts = ({ studentId, assignmentId }) => {
  if (!storageAvailable()) return;
  const studentPart = normalizeKeyPart(studentId || 'anonymous');
  const assignmentPart = normalizeKeyPart(assignmentId || 'assignment');
  const prefix = `${DRAFT_PREFIX}:${studentPart}:${assignmentPart}:`;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(prefix)) window.localStorage.removeItem(key);
    }
  } catch {
    // Best-effort cleanup only.
  }
};

const resumeKey = (studentId) => `${RESUME_PREFIX}${normalizeKeyPart(studentId || 'anonymous')}`;

export const saveResumeAction = (studentId, action) => {
  if (!studentId || !storageAvailable()) return false;
  try {
    window.localStorage.setItem(
      resumeKey(studentId),
      JSON.stringify({
        ...action,
        savedAt: Date.now(),
      }),
    );
    return true;
  } catch (error) {
    console.warn('MathMaster could not save the resume action:', error);
    return false;
  }
};

export const readResumeAction = (studentId) => {
  if (!studentId || !storageAvailable()) return null;
  const parsed = safeParse(window.localStorage.getItem(resumeKey(studentId)));
  if (!parsed || typeof parsed !== 'object') return null;
  if (Date.now() - Number(parsed.savedAt || 0) > MAX_DRAFT_AGE_MS) {
    window.localStorage.removeItem(resumeKey(studentId));
    return null;
  }
  return parsed;
};

export const clearResumeAction = (studentId) => {
  if (!studentId || !storageAvailable()) return;
  try {
    window.localStorage.removeItem(resumeKey(studentId));
  } catch {
    // Best-effort only.
  }
};

export const buildPracticeTrackerKey = (studentId, assignmentId) =>
  `mathmaster:practice-tracker:v1:${normalizeKeyPart(studentId || 'anonymous')}:${normalizeKeyPart(assignmentId || 'assignment')}`;
