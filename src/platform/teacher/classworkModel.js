import { getIncludedQuestionIndices } from '../../assignmentLifecycle.js';
import { getStoredAssignmentQuestions } from '../contract/storedAssignmentV5.js';
import { resolveQuestionActivityRole } from '../policies/activityPolicies.js';

/**
 * Classwork is the primary teaching/pace section. This extracts, in order,
 * only the Classwork questions from an assignment's current included
 * questions, alongside each one's position within the FULL included list
 * (its "progress position") so a compact per-included-question state string
 * can be re-indexed down to just Classwork.
 */
export function classworkModel(assignment) {
  if (!assignment) return { questions: [], progressPositions: [] };
  const questions = getStoredAssignmentQuestions(assignment);
  const included = getIncludedQuestionIndices(assignment);
  const entries = included
    .map((questionIndex, progressPosition) => ({ questionIndex, progressPosition, question: questions[questionIndex] }))
    .filter(({ question }) => resolveQuestionActivityRole({ question, assignment }) === 'classwork');
  return {
    questions: entries.map(({ question, questionIndex }) => ({ question, questionIndex })),
    progressPositions: entries.map(({ progressPosition }) => progressPosition),
  };
}

/**
 * Maps a STORAGE question index (the assignment's raw question array index,
 * as tracked by things like `currentQuestionIndex`) to its position within
 * the Classwork-only list, or null when that storage index belongs to
 * another section (Warm-Up/Practice/DOL/etc) and therefore has no Classwork
 * position at all.
 *
 * This is the seam that keeps the teacher's real exemplar position — a
 * storage index — from being compared directly against a Classwork-relative
 * pace number, which is a different index system.
 */
export function classworkPositionForStorageIndex(assignment, storageQuestionIndex) {
  const { questions } = classworkModel(assignment);
  const position = questions.findIndex((entry) => entry.questionIndex === storageQuestionIndex);
  return position >= 0 ? position : null;
}

export function describeClassworkPace({ assignment, classworkQuestionPosition } = {}) {
  const { questions } = classworkModel(assignment);
  if (!questions.length) return 'No Classwork questions in this lesson';
  if (classworkQuestionPosition === null || classworkQuestionPosition === undefined) {
    return `Not yet in Classwork (${questions.length} question${questions.length === 1 ? '' : 's'})`;
  }
  return `Classwork Q${classworkQuestionPosition + 1} of ${questions.length}`;
}
