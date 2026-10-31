/*
 * A RECOVERY'S QUESTION FOR THE TEACHER (RC10).
 *
 * Its own module, loaded with the Recovery screen only: the rest of Ask my
 * teacher (askTeacher.js) is on every student's first load.
 */
import { QUESTION_STATUS, questionFor, sortQuestions } from './askTeacher.js';

const text = (value) => String(value ?? '').trim();

/*
 * WHERE A RECOVERY'S QUESTION FOR THE TEACHER IS FILED (RC10).
 *
 * A Recovery that has run out of practice questions sends the student to
 * their teacher, and the question they leave needs a place: a question id is
 * one of the assignment's own questions (firestore.rules), one question per
 * place, reworded only while nobody has answered it. So a Recovery files its
 * question under one of its section's questions, labelled with the
 * Recovery's name, and never on top of a question the student asked there
 * during the lesson:
 *
 *   1. their Recovery question still waiting for an answer: that one, to
 *      reword or wait on;
 *   2. otherwise the first of the section's questions they have not asked
 *      about: a new question;
 *   3. otherwise their latest answered Recovery question, to read the answer.
 *
 * Null when none of these exists (every place holds a question from the
 * lesson): the screen keeps telling the student to tell their teacher.
 */
export const recoveryQuestionPlace = ({ questions = [], assignmentId, questionIndexes = [], label = '' } = {}) => {
  const indexes = [...new Set((Array.isArray(questionIndexes) ? questionIndexes : [])
    .map(Number)
    .filter((index) => Number.isInteger(index) && index >= 0))]
    .sort((a, b) => a - b);
  if (!text(assignmentId) || !text(label) || !indexes.length) return null;
  const asked = indexes.map((questionIndex) => ({ questionIndex, question: questionFor(questions, { assignmentId, questionIndex }) }));
  const recovery = asked.filter(({ question }) => question && text(question.questionLabel) === text(label));
  const waiting = recovery.find(({ question }) => question.status !== QUESTION_STATUS.ANSWERED);
  if (waiting) return waiting;
  const free = asked.find(({ question }) => !question);
  if (free) return free;
  const answered = sortQuestions(recovery.map(({ question }) => question)).at(-1);
  return answered ? { questionIndex: Number(answered.questionIndex), question: answered } : null;
};

