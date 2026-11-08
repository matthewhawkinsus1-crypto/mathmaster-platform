import {
  getAttemptsRemaining,
  normalizeQuestionRecord,
  resolveQuestionMaximumAttempts,
  resolveTeacherGrantedExtraAttempts,
} from '../../attemptPolicy.js';
import { getEffectiveActivityPolicy } from '../policies/activityPolicies.js';
import { countedQuestion } from '../generation/shownFamilyQuestion.js';

/*
 * TWO QUESTIONS THE "TODAY" RULE AND ASSIGNMENT ENTRY MUST ANSWER THE SAME WAY.
 *
 * Home promises "Start" from describeLessonSections; App's startAssignment
 * decides where Start lands. When the two answered these differently a student
 * looped between Home and the result page (a DOL whose class window is
 * switched off), or Home called a DOL finished while the teacher had just
 * granted another try. Both now ask this module.
 */

/**
 * Can a timed section (Warm-Up or DOL) be worked on this minute?
 *
 * `windowState` is getWarmupState / getDOLState. A section whose class-period
 * window is switched off (`enabled: false` — preflight's "Use the class-period
 * window" unchecked, or Edit Setup) has no timer: it behaves like Classwork,
 * open whenever the assignment is. Otherwise only an active window is
 * workable.
 */
export const timedSectionWorkableNow = (windowState) => (
  !windowState || windowState.enabled === false || windowState.status === 'active'
);

/**
 * Is this question finished for the student — correct, or out of tries?
 *
 * `expired` alone is not enough for a DOL: a teacher can grant extra DOL
 * attempts after the student used theirs, and the attempt policy then reopens
 * the question ("1 try left"). A DOL question is terminal only when it is
 * correct or no try remains under the same maximum the workspace enforces.
 *
 * That maximum is counted on the question the student was dealt, as the
 * question list counts it (P-7): for a Question Family slot, the question it
 * dealt, which `countedQuestion` finds from what the caller knows — the
 * questions shown on its page (`shown`) and the family engine's rebuild of the
 * slot's pin (`deal`), as App hands them (terminalCountingFor). A caller with neither
 * counts on the stored slot, as before. An exit ticket gives one try to every
 * question, so today the answer is the same either way.
 */
export const questionIsTerminal = ({
  record,
  role = null,
  question = null,
  assignment = null,
  classId = null,
  studentId = null,
  // Where the slot is stored, and what the caller knows of what it dealt.
  questionIndex = 0,
  shown = null,
  deal = null,
} = {}) => {
  const normalized = normalizeQuestionRecord(record);
  if (normalized.status === 'correct') return true;
  if (normalized.status !== 'expired') return false;
  if (String(role || '').trim().toLowerCase() !== 'dol' || !assignment) return true;
  const activityPolicy = getEffectiveActivityPolicy('dol');
  const maximum = resolveQuestionMaximumAttempts({
    question: countedQuestion({
      shown,
      deal,
      assignmentId: assignment.id || '',
      storedQuestion: question,
      questionIndex,
      record,
      fallback: question || {},
    }),
    maximumAttempts: activityPolicy?.attempts,
    activityPolicy,
    teacherGrantedExtraAttempts: resolveTeacherGrantedExtraAttempts({
      assignment, activityRole: 'dol', classId, studentId,
    }),
  });
  return getAttemptsRemaining(normalized, maximum) === 0;
};

export default questionIsTerminal;
