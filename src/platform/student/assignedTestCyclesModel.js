/*
 * TESTS & EXAMS LISTS AN ASSIGNED TEST BEFORE ITS SESSION IS OPEN.
 *
 * "My Course Tests" listed secure SESSIONS, and a Test Cycle has none until
 * the teacher opens them — often days after it was assigned, and after Review
 * is under way. A student who went to Tests & Exams to find out when their
 * Test is read "Nothing here yet" about a Test their Assignments page showed.
 *
 * So a Test Cycle assigned to the student with no course-test session in the
 * list gets a row of its own, described from a READ-ONLY look at the card
 * (getStudentTestCycle `preview`): when its class-time window is, whether it
 * is taken in class, how long it is, and when it is due. The words are the
 * server's (testCycleAvailability.mjs) or the card's own helpers — nothing is
 * worked out a second time here — and the row's only action hands off to the
 * card, as a session row does. The look opens nothing: no session, no
 * stand-in Retest; only the card, opened by the student, does that.
 *
 * Pure: no React, no network.
 */

import { isTestCycleAssignment } from '../assessment/testCycle.js';
import { studentScheduleBlocks } from './testCycleScheduleView.js';
import { sittingFactsFor, testCycleCardDueFacts } from './testCycleDiscovery.js';

const clean = (value) => String(value ?? '').trim();

/**
 * The student's Test Cycles that no listed session stands for: assigned to
 * them (App holds only their own lessons), not archived, and with no
 * course-test session in the list for that assignment.
 *
 * These are CANDIDATES. The session list is capped and unordered, so a cycle
 * missing from it may still have a session; the read-only look answers that
 * from the student's record (`hasSecureSession`), and assignedTestCycleRow
 * gives no row to one that has.
 */
export const testCyclesWithoutSession = ({ assignments = [], sessions = [] } = {}) => {
  const listed = new Set((sessions || [])
    .map((session) => clean(session?.courseTest?.assignmentId))
    .filter(Boolean));
  return (assignments || []).filter((assignment) => (
    clean(assignment?.id)
    && isTestCycleAssignment(assignment)
    && assignment.archived !== true
    && !listed.has(clean(assignment.id))
  ));
};

/** "Test is not timed. 12 questions." — the card's sentence for the sitting ahead. */
export const testCycleDeliveryText = (card = {}) => {
  if (!card?.delivery) return null;
  const sitting = sittingFactsFor(card);
  const length = card.delivery.timed
    ? `${sitting.noun} is timed: ${card.delivery.timeLimitMinutes} minutes once you start${Number(card.delivery.extendedTimeMultiplier) > 1 ? ', including your extended time' : ''}.`
    : `${sitting.noun} is not timed.`;
  return sitting.questionCount ? `${length} ${sitting.questionCount} questions.` : length;
};

/**
 * One row, from the read-only card and the student's own dates.
 *
 * `dueAt` / `lateDueAt` are THIS student's (getAssignmentLifecycle) and
 * `classLateDueAt` the class's: the dates are chosen for the stage exactly as
 * the card chooses them (testCycleCardDueFacts).
 */
export const assignedTestCycleRow = ({ card = null, assignment = null, dueAt = null, lateDueAt = null, classLateDueAt = null, now = Date.now() } = {}) => {
  const assignmentId = clean(card?.assignmentId || assignment?.id);
  if (!assignmentId) return null;
  // The record has a session (beyond what the list showed): the list, not a
  // row, is where it belongs. Only an explicit "none" gets a row.
  if (card?.hasSecureSession !== false) return null;
  const when = studentScheduleBlocks(card).find((block) => block.id === 'test') || null;
  const due = testCycleCardDueFacts({ card, dueAt, lateDueAt, classLateDueAt, now });
  return {
    assignmentId,
    title: clean(card?.title) || clean(assignment?.title) || clean(assignment?.assignment?.title) || 'Test',
    // The card's own status words; a session-less Test is "not open yet".
    statusLabel: clean(card?.statusLabel) || 'Not open yet',
    detail: clean(card?.detail) || null,
    when: when ? { headline: when.headline, detail: when.detail, home: when.home } : null,
    delivery: testCycleDeliveryText(card),
    dueAt: due.dueAt,
    finalLateDueAt: due.finalLateDueAt,
  };
};

export default assignedTestCycleRow;
