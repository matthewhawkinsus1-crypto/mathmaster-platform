// In place of src/platform/supports/askTeacherStore.js for a node test of
// Teacher Home's questions panel (firstLoadTeacherHome.test.mjs): the
// teacher's listener is held here, and the test delivers its snapshots.
const listeners = new Set();

export const openTeacherQuestionsQuery = (db, { teacherEmail }) => ({ teacherEmail });
export const watchQuestions = (target, onChange) => {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
};
export const answerTeacherQuestion = async () => {};

/** Every open listener receives `questions`, as a snapshot would bring them. */
export const deliverQuestions = (questions) => listeners.forEach((onChange) => onChange(questions));
export const openListeners = () => listeners.size;
