/*
 * "Ask my teacher" reads and writes (askTeacher.js shapes the documents).
 *
 * Every function takes the Firestore instance, so the emulator rule tests
 * (tests/rules/askTeacherRules.test.mjs) run these exact queries and writes
 * against firestore.rules. Errors are returned to the caller and never logged
 * here: a failed write must not put a student's words in a console or a
 * report.
 */
import {
  collection, doc, limit, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore';
import {
  HELP_ACKNOWLEDGEMENT_COLLECTION,
  QUESTION_STATUS,
  TEACHER_QUESTIONS_SHOWN,
  TEACHER_QUESTION_COLLECTION,
  buildHelpAcknowledgement,
  buildQuestionEdit,
  buildTeacherAnswer,
  buildTeacherQuestion,
} from './askTeacher.js';

const withIds = (snapshot) => snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));

/** The signed-in student's own questions on one assignment. */
export const myTeacherQuestionsQuery = (db, { studentId, assignmentId }) => query(
  collection(db, TEACHER_QUESTION_COLLECTION),
  where('studentId', '==', studentId),
  where('assignmentId', '==', assignmentId),
);

/**
 * Questions waiting for this teacher (the ones their students sent them), at
 * most TEACHER_QUESTIONS_SHOWN at a time: answering one lets the next in.
 */
export const openTeacherQuestionsQuery = (db, { teacherEmail }) => query(
  collection(db, TEACHER_QUESTION_COLLECTION),
  where('teacherEmail', '==', teacherEmail),
  where('status', '==', QUESTION_STATUS.OPEN),
  limit(TEACHER_QUESTIONS_SHOWN),
);

export const watchQuestions = (target, onChange, onError) => onSnapshot(
  target,
  (snapshot) => onChange(withIds(snapshot)),
  (error) => onError?.(error?.code || 'unavailable'),
);

/**
 * Send the student's question, or reword the one still waiting. A question
 * already answered is not reopened (the rules refuse it too).
 */
export const sendTeacherQuestion = async (db, {
  existing = null, studentId, classId, teacherEmail, assignmentId, assignmentTitle, questionIndex, questionLabel, text,
}) => {
  if (existing?.id && existing.status === QUESTION_STATUS.OPEN) {
    const edit = buildQuestionEdit({ text, timestamp: serverTimestamp() });
    if (!edit) throw new Error('empty');
    await updateDoc(doc(db, TEACHER_QUESTION_COLLECTION, existing.id), edit);
    return existing.id;
  }
  const built = buildTeacherQuestion({
    studentId, classId, teacherEmail, assignmentId, assignmentTitle, questionIndex, questionLabel, text,
    timestamp: serverTimestamp(),
  });
  if (!built) throw new Error(teacherEmail ? 'empty' : 'no-teacher');
  await setDoc(doc(db, TEACHER_QUESTION_COLLECTION, built.id), built.data);
  return built.id;
};

export const answerTeacherQuestion = async (db, { questionId, answer, teacherEmail }) => {
  const patch = buildTeacherAnswer({ answer, teacherEmail, timestamp: serverTimestamp() });
  if (!patch) throw new Error('empty');
  await updateDoc(doc(db, TEACHER_QUESTION_COLLECTION, questionId), patch);
};

/** One document per student: the teacher's latest "Seen" / "On my way". */
export const helpAcknowledgementRef = (db, studentId) => doc(db, HELP_ACKNOWLEDGEMENT_COLLECTION, studentId);

export const acknowledgeHelpRequest = async (db, { studentId, assignmentId, helpRequestedAt, status, teacherEmail }) => {
  const data = buildHelpAcknowledgement({
    studentId, assignmentId, helpRequestedAt, status, teacherEmail, timestamp: serverTimestamp(),
  });
  if (!data) throw new Error('invalid');
  await setDoc(helpAcknowledgementRef(db, studentId), data);
};

export const watchHelpAcknowledgement = (db, studentId, onChange, onError) => onSnapshot(
  helpAcknowledgementRef(db, studentId),
  (snapshot) => onChange(snapshot.exists() ? snapshot.data() : null),
  (error) => onError?.(error?.code || 'unavailable'),
);
