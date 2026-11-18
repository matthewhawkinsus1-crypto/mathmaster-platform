/*
 * THE QUESTION A STUDENT IS ON IN LIVE VIEW, AS THE RESPONSE INSPECTOR NAMES IT.
 *
 * Live View tiles come from the student's heartbeat (App.jsx, buildLiveStatus),
 * which says where the student is as a POSITION: `questionIndex` is the place
 * of the current question in the list the student is responsible for,
 *
 *   included = studentAssignmentIndicesWithPracticePass({ assignment, hasPracticePass })
 *   questionIndex = included.indexOf(currentQuestionIndex)
 *
 * The inspector (inspectStudentResponse) takes the question's STORAGE index,
 * the one its record is kept under. They differ once a teacher has left a
 * question out or a Practice Pass waives a section, so the storage index is
 * rebuilt here from the same functions the student's device used:
 *
 *   - both lists, with and without a Practice Pass (the teacher's screen does
 *     not know whether the student holds one), and only those as long as the
 *     heartbeat's `questionCount` says the student's was;
 *   - the index at the heartbeat's position in each;
 *   - and, as a cross-check against an assignment edited since the student
 *     loaded it, the question there must have the heartbeat's activity role
 *     and its place within that section (`sectionQuestionIndex`).
 *
 * One index left: the target. None, or two that disagree: null, and Live View
 * offers no entry rather than open the wrong question. A reduced-item-count
 * accommodation does not move positions (omitted items stay in the list,
 * marked 'n' in `questionStates`), so it needs nothing here.
 *
 * `attempted` says whether the heartbeat shows an attempt on the question
 * (a state of correct, incorrect or attempted, or an attempt counted on it):
 * the inspector has nothing to show for a question never answered.
 *
 * Pure: reads only what it is given.
 */
import { studentAssignmentIndicesWithPracticePass } from '../../assignmentLifecycle.js';
import { getStoredAssignmentQuestions } from '../contract/storedAssignmentV5.js';
import { resolveQuestionActivityRole } from '../policies/activityPolicies.js';
import { QUESTION_STATE_CHARS } from '../../livePresence.js';

const ATTEMPTED_STATES = new Set([QUESTION_STATE_CHARS.CORRECT, QUESTION_STATE_CHARS.INCORRECT, QUESTION_STATE_CHARS.ATTEMPTED]);
const position = (value) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null);
const text = (value) => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '');

const roleOf = (questions, index, assignment) => {
  try {
    return resolveQuestionActivityRole({ question: questions[index] || {}, assignment });
  } catch {
    return null;
  }
};

/**
 * `{ studentId, assignmentId, questionIndex, attempted }` for the student's
 * current question, or null when it cannot be named for certain.
 */
export const liveInspectorTarget = ({ studentId, live, assignment } = {}) => {
  const student = text(studentId).trim();
  const assignmentId = text(live?.assignmentId).trim();
  const at = position(live?.questionIndex);
  if (!student || !assignmentId || at === null) return null;
  if (!assignment || typeof assignment !== 'object' || text(assignment.id) !== assignmentId) return null;
  let questions;
  let lists;
  try {
    questions = getStoredAssignmentQuestions(assignment);
    lists = [false, true].map((hasPracticePass) => studentAssignmentIndicesWithPracticePass({ assignment, hasPracticePass }));
  } catch {
    return null;
  }
  const count = position(live?.questionCount);
  const role = text(live?.activityRole);
  const sectionAt = position(live?.sectionQuestionIndex);
  const candidates = new Set();
  lists
    .filter((included) => Array.isArray(included) && (!count || included.length === count) && at < included.length)
    .forEach((included) => {
      const index = included[at];
      if (!Number.isInteger(index) || !questions[index]) return;
      if (role) {
        if (roleOf(questions, index, assignment) !== role) return;
        const section = included.filter((candidate) => roleOf(questions, candidate, assignment) === role);
        if (sectionAt !== null && section.indexOf(index) !== sectionAt) return;
      }
      candidates.add(index);
    });
  if (candidates.size !== 1) return null;
  const [questionIndex] = candidates;
  const state = text(live?.questionStates)[at];
  return {
    studentId: student,
    assignmentId,
    questionIndex,
    attempted: ATTEMPTED_STATES.has(state) || (position(live?.currentAttempts) ?? 0) > 0,
  };
};

export default liveInspectorTarget;
