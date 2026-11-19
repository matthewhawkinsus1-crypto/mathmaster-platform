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
 *     and its place within that section (`sectionQuestionIndex`), and the
 *     section must be as long as the student's (`sectionQuestionCount`). A
 *     question re-included before the student in their own section moves
 *     their place in the list and in the section alike, so until their
 *     device has the new copy (one heartbeat), only the section's length
 *     tells their list from the teacher's Practice Pass list when as many
 *     questions came back as Practice has.
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
 * ONCE PER ASSIGNMENT, NOT PER TILE PER HEARTBEAT. Live View asks for a
 * target for every tile each time it redraws, and it redraws on every
 * heartbeat, so the lists, each question's role and each section's order
 * were worked out again for every tile, every time. They depend on the
 * assignment alone. An assignment copy is never changed in place: a
 * snapshot or a teacher's edit hands over a new object (App keeps the
 * teacher's lessons in state and replaces them only when a lesson or a
 * class control changes). So what is worked out for an assignment object
 * stays that object's (liveInspectorLists, a WeakMap: it goes when the copy
 * goes), and each tile only looks its student up in it. Read it, never
 * write to it.
 *
 * Pure: reads only what it is given, and keeps what it worked out only with
 * the copy it was worked out from.
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

const LISTS = new WeakMap();

/**
 * What every target on `assignment` reads, worked out once for that copy:
 * its stored questions and, for each list a student can hold (without and
 * with a Practice Pass), the storage indices, each one's activity role and
 * each role's indices in order. Null for an assignment that cannot be read.
 */
export const liveInspectorLists = (assignment) => {
  if (!assignment || typeof assignment !== 'object') return null;
  if (LISTS.has(assignment)) return LISTS.get(assignment);
  let worked = null;
  try {
    const questions = getStoredAssignmentQuestions(assignment);
    const lists = [false, true]
      .map((hasPracticePass) => studentAssignmentIndicesWithPracticePass({ assignment, hasPracticePass }))
      .filter((included) => Array.isArray(included))
      .map((included) => {
        const roles = included.map((index) => roleOf(questions, index, assignment));
        const sections = new Map();
        included.forEach((index, at) => {
          if (!sections.has(roles[at])) sections.set(roles[at], []);
          sections.get(roles[at]).push(index);
        });
        return { included, roles, sections };
      });
    worked = { questions, lists };
  } catch {
    worked = null;
  }
  LISTS.set(assignment, worked);
  return worked;
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
  const worked = liveInspectorLists(assignment);
  if (!worked) return null;
  const { questions, lists } = worked;
  const count = position(live?.questionCount);
  const role = text(live?.activityRole);
  const sectionAt = position(live?.sectionQuestionIndex);
  // A heartbeat that does not say how long the student's section is (0, or
  // none) is not held to a length.
  const sectionCount = position(live?.sectionQuestionCount);
  const candidates = new Set();
  lists
    .filter(({ included }) => (!count || included.length === count) && at < included.length)
    .forEach(({ included, roles, sections }) => {
      const index = included[at];
      if (!Number.isInteger(index) || !questions[index]) return;
      if (role) {
        if (roles[at] !== role) return;
        const section = sections.get(role) || [];
        if (sectionAt !== null && section.indexOf(index) !== sectionAt) return;
        if (sectionCount && section.length !== sectionCount) return;
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
