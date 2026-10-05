/*
 * IS THIS ASSESSMENT OPEN TO STUDENTS AT ALL? ONE ANSWER, BOTH SIDES.
 *
 * Before this module, "archived" was a flag only the teacher's own list read,
 * and a release date was enforced only by the student dashboard hiding a
 * button. The secure Test, the Retest and Corrections callables read neither,
 * so a student holding an open session (or calling the callable directly) could
 * sit a Test their teacher had archived, or one that had not opened yet.
 *
 * This is the ASSIGNMENT-level gate, and it sits in front of the Test Cycle
 * stage machine rather than inside it: the stage machine answers "which part of
 * this cycle has THIS student earned?", and this answers "is the assessment
 * open to students right now?". Both have to say yes.
 *
 * THE STATES, AND WHAT EACH ONE MEANS TO A STUDENT.
 *
 *   open         Nothing at the assignment level stands in the way.
 *   scheduled    `releaseAt` is in the future. Opens by itself at that time.
 *   unpublished  The teacher has paused it. Reversible; nothing was lost.
 *   archived     The teacher has retired it. Evidence and grades are kept.
 *   missing      The assignment document no longer exists.
 *
 * WHAT IS DELIBERATELY NOT A RULE HERE: the due date. Late work is still
 * credit-eligible work everywhere else in MathMaster, and a student sitting a
 * make-up Test after the class due date is ordinary. A teacher who wants a
 * cycle closed archives or pauses it — an explicit act, not a date that quietly
 * locks a student out of a Test they were told they could take.
 *
 * Pure by construction: no Firestore, no network, no clock of its own.
 */

import { parseInstant } from './instructionalCalendar.mjs';

export const ASSESSMENT_AVAILABILITY = Object.freeze({
  OPEN: 'open',
  SCHEDULED: 'scheduled',
  UNPUBLISHED: 'unpublished',
  ARCHIVED: 'archived',
  MISSING: 'missing',
});

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const assignmentIsArchived = (assignment) => isObject(assignment) && assignment.archived === true;

/** Paused by the teacher: hidden from students, reversible, evidence kept. */
export const assignmentIsUnpublished = (assignment) => isObject(assignment) && assignment.unpublished === true;

/** The release instant, or null when the assignment has none. */
export const assignmentReleaseInstant = (assignment) => (
  isObject(assignment) ? parseInstant(assignment.releaseAt || assignment.releaseDate, { endOfDay: false }) : null
);

/*
 * The student-facing sentence for each closed state. Written here once so the
 * server's refusal and the card's explanation are the same words. None of them
 * says anything about the student's own performance: an archived Test is closed
 * to everyone, and saying so reveals nothing about anybody's score.
 */
const MESSAGES = Object.freeze({
  [ASSESSMENT_AVAILABILITY.SCHEDULED]: 'This assessment is not open yet. It opens automatically at the time your teacher scheduled.',
  [ASSESSMENT_AVAILABILITY.UNPUBLISHED]: 'Your teacher has paused this assessment. It is not open right now, and nothing you have done was lost.',
  [ASSESSMENT_AVAILABILITY.ARCHIVED]: 'Your teacher has archived this assessment. It is closed, and your recorded work and grade are kept.',
  [ASSESSMENT_AVAILABILITY.MISSING]: 'This assessment is no longer available.',
});

export const assessmentAvailabilityMessage = (reason) => MESSAGES[reason] || null;

/**
 * The assignment-level answer.
 *
 * `opensAt` is an epoch-millisecond instant (or null) so each screen formats it
 * in its own locale; the server never bakes a time zone into a sentence.
 */
export const resolveAssessmentAvailability = ({ assignment = null, now = Date.now() } = {}) => {
  if (!isObject(assignment)) {
    return { open: false, reason: ASSESSMENT_AVAILABILITY.MISSING, opensAt: null, message: MESSAGES.missing };
  }
  if (assignmentIsArchived(assignment)) {
    return { open: false, reason: ASSESSMENT_AVAILABILITY.ARCHIVED, opensAt: null, message: MESSAGES.archived };
  }
  if (assignmentIsUnpublished(assignment)) {
    return { open: false, reason: ASSESSMENT_AVAILABILITY.UNPUBLISHED, opensAt: null, message: MESSAGES.unpublished };
  }
  const releaseAt = assignmentReleaseInstant(assignment);
  const at = Number(now);
  if (releaseAt !== null && Number.isFinite(at) && at < releaseAt) {
    return { open: false, reason: ASSESSMENT_AVAILABILITY.SCHEDULED, opensAt: releaseAt, message: MESSAGES.scheduled };
  }
  return { open: true, reason: ASSESSMENT_AVAILABILITY.OPEN, opensAt: null, message: null };
};
