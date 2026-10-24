/*
 * "ASK MY TEACHER" OVER TIME (TT26). Pure; functions/index.js applies it.
 *
 * WHEN A CLASS CHANGES HANDS. A question is addressed to the teacher of record
 * the day it is sent (firestore.rules teacherQuestionCreateValid), and a
 * teacher's list reads only the questions addressed to them. A question still
 * waiting when the class (or the student) moved to another teacher stayed on
 * the old teacher's list, and a rewording went there too; the new teacher could
 * answer it but no screen showed it. So reauthorizeStudentRecords moves a
 * waiting question to the new teacher of record. An answered one stays with
 * the teacher who answered it.
 *
 * HOW LONG. Student-written text about a minor's work was kept until the
 * account was deleted. A question, and its answer, is now kept one school
 * year after its last change, then removed by a nightly job
 * (expireAskTeacherQuestions). The length is a policy choice the owner can
 * change here.
 */
export const ASK_TEACHER_COLLECTION = 'askTeacherQuestions';
export const ASK_TEACHER_RETENTION_DAYS = 365;
export const ASK_TEACHER_RETENTION_MS = ASK_TEACHER_RETENTION_DAYS * 24 * 60 * 60 * 1000;

const clean = (value) => String(value ?? '').trim();
const email = (value) => clean(value).toLowerCase();

/** The change that moves a waiting question to the student's new teacher of record, or null. */
export const openQuestionHandover = (question = {}, classRecord = null) => {
  const teacher = email(classRecord?.teacherOfRecord);
  if (!teacher || clean(question?.status) !== 'open') return null;
  const classId = classRecord?.classId ?? question?.classId ?? null;
  if (email(question?.teacherEmail) === teacher && (question?.classId ?? null) === classId) return null;
  return { teacherEmail: teacher, classId };
};

const toMillis = (value) => {
  if (!value) return null;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

/** Whether a question's last change is older than the retention period. */
export const askTeacherQuestionExpired = (question = {}, nowMs = Date.now()) => {
  const changed = toMillis(question?.updatedAt) ?? toMillis(question?.answeredAt) ?? toMillis(question?.createdAt);
  return changed !== null && changed > 0 && Number(nowMs) - changed > ASK_TEACHER_RETENTION_MS;
};
