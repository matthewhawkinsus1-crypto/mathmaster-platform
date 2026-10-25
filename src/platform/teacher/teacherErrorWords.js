/*
 * A TEACHER SCREEN'S ERROR LINE (TT31).
 *
 * The student screens' filter (studentErrorWords.js), for the teacher's Live
 * Challenge console, question library and dry run: a sentence our server or
 * our own checks wrote is kept; a Firestore, SDK or program error ("Missing
 * or insufficient permissions.", "e.map is not a function") is replaced by
 * the screen's own sentence for what did not work. The technical text goes
 * to the caller's console warning, for support (a warning, not an error: a
 * refusal the teacher reads is expected, and the browser QA drivers fail on
 * console errors). A teacher has no one to "tell", so the last resort asks
 * for a retry instead.
 */
import { describeStudentErrorWords } from '../student/studentErrorWords.js';

export const TEACHER_ERROR_GENERIC = 'Something went wrong on our side. Try again in a moment.';

export const teacherErrorSentence = (error, fallback = null) => (
  describeStudentErrorWords(error, { fallback: fallback || TEACHER_ERROR_GENERIC }).text
);
