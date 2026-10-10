import { SECTION_STATE, describeSectionWait } from './lessonSections.js';

/*
 * WHAT THE RESULT PAGE TELLS A STUDENT TO DO NEXT.
 *
 * The result page is where "nothing open right now" lands: App's
 * startAssignment opens it when a student presses into an assignment with no
 * question workable this minute. A page that answered that with a grade and
 * two list buttons was the dead end, moved. So this decides, from the one
 * "Today" rule (the dashboard entry for this assignment) and Up Next
 * (resolveUpNext), which of these the page leads with:
 *
 *   continue   the assignment is open and something in it can be done now —
 *              Start/Continue, landing on entry.nextQuestionIndex
 *   recovery   the remaining work is a Recovery, taken from the panel on this
 *              page
 *   waiting    unfinished but nothing open now — say what opens when, section
 *              by section, and offer Up next (or Home) instead
 *   closed     past the final deadline — the grade is the record; a no-credit
 *              retry is offered beside it
 *   excused    nothing asked; results only
 *   finished   done — Up next, or Home when there is nothing up next
 *
 * Pure: no React, no clock of its own (nowValue is passed through to the wait
 * copy so "opens at 2:15 PM" vs "opens Thu, Oct 8" is testable).
 */

export const RESULT_STEP = Object.freeze({
  CONTINUE: 'continue',
  RECOVERY: 'recovery',
  WAITING: 'waiting',
  CLOSED: 'closed',
  EXCUSED: 'excused',
  FINISHED: 'finished',
  UNKNOWN: 'unknown',
});

export const TRY_AGAIN_LABEL = 'Try it again — no credit';
export const tryAgainLabel = (sectionLabel = null) => (
  sectionLabel ? `Try ${sectionLabel} again — no credit` : TRY_AGAIN_LABEL
);

/**
 * One line per lesson section: "Warm-Up — done", "Classwork — 2 of 3 done",
 * "Practice — opens when your teacher starts it in class", "DOL — opens at
 * 2:15 PM". The wait wording is describeSectionWait's, so Home's card and this
 * page never phrase the same wait two ways.
 */
export const describeSectionStatus = (section, { nowValue = Date.now(), formatTime, formatDay } = {}) => {
  if (!section) return null;
  const label = section.label || section.role || 'Questions';
  const progress = `${section.doneCount || 0} of ${section.total || 0} done`;
  let text;
  switch (section.state) {
    case SECTION_STATE.DONE: text = 'done'; break;
    case SECTION_STATE.EXCUSED: text = 'excused'; break;
    case SECTION_STATE.OPEN: text = section.workable ? `${progress} · open now` : progress; break;
    case SECTION_STATE.RECOVERY: text = 'closed · a Recovery is ready'; break;
    case SECTION_STATE.CLOSED: text = `closed · ${progress}`; break;
    case SECTION_STATE.OPENS_LATER:
    case SECTION_STATE.LOCKED: {
      const wait = describeSectionWait(section, {
        nowValue,
        ...(formatTime ? { formatTime } : {}),
        ...(formatDay ? { formatDay } : {}),
      }) || 'not open yet';
      text = wait.startsWith(label) ? wait.slice(label.length).trim() : wait;
      break;
    }
    default: text = progress;
  }
  return {
    role: section.role,
    label,
    state: section.state,
    text,
    // Open now — the one row worth drawing the eye to.
    open: section.state === SECTION_STATE.OPEN && section.workable === true,
  };
};

/**
 * @param {object} input
 * @param {object} input.entry       the Grade Center entry (what the page shows)
 * @param {object|null} input.todayEntry the dashboard entry for this assignment
 * @param {object|null} input.upNext  resolveUpNext({ dashboard, assignmentId })
 */
export const describeResultNextStep = ({
  entry = null,
  todayEntry = null,
  upNext = null,
  nowValue = Date.now(),
  formatTime,
  formatDay,
} = {}) => {
  const closed = entry?.frozen === true || todayEntry?.lifecycle?.isPracticeOnly === true;
  const excused = todayEntry?.excused === true || entry?.status === 'excused';
  const finished = todayEntry ? todayEntry.finished === true : closed || excused;
  const lessonSections = Array.isArray(todayEntry?.lesson?.sections) ? todayEntry.lesson.sections : [];
  const sections = lessonSections
    .map((section) => describeSectionStatus(section, { nowValue, formatTime, formatDay }))
    .filter(Boolean);
  const attempted = Number(todayEntry?.questionsAttempted) || Number(entry?.overall?.attempted) || 0;
  const usableUpNext = upNext && upNext.assignment ? upNext : null;

  const base = {
    upNext: usableUpNext,
    sections,
    waitText: null,
    continueLabel: null,
    questionIndex: null,
    // No Up next and nothing left here: Home is the honest next place.
    offerHome: false,
    // A no-credit retry of closed work.
    canTryAgain: closed && !excused && entry?.practiceAvailable !== false,
  };

  let kind;
  if (excused) kind = RESULT_STEP.EXCUSED;
  else if (closed) kind = RESULT_STEP.CLOSED;
  else if (todayEntry?.actionable === true && todayEntry.action === 'recovery') kind = RESULT_STEP.RECOVERY;
  else if (todayEntry?.actionable === true) kind = RESULT_STEP.CONTINUE;
  else if (todayEntry && !finished) kind = RESULT_STEP.WAITING;
  else if (finished) kind = RESULT_STEP.FINISHED;
  else kind = RESULT_STEP.UNKNOWN;

  const step = { ...base, kind };
  if (kind === RESULT_STEP.CONTINUE) {
    step.continueLabel = todayEntry.testCycle?.actionLabel || (attempted > 0 ? 'Continue' : 'Start');
    step.questionIndex = Number.isInteger(todayEntry.nextQuestionIndex) ? todayEntry.nextQuestionIndex : null;
  }
  if (kind === RESULT_STEP.WAITING) {
    step.waitText = todayEntry.waitText || null;
    step.offerHome = !usableUpNext;
  }
  if ([RESULT_STEP.FINISHED, RESULT_STEP.CLOSED, RESULT_STEP.EXCUSED].includes(kind)) {
    step.offerHome = !usableUpNext;
  }
  // Section-by-section status is for unfinished open work; a closed or
  // excused record is already broken down by the score breakdown above it.
  if (![RESULT_STEP.CONTINUE, RESULT_STEP.WAITING, RESULT_STEP.RECOVERY].includes(kind)) step.sections = [];
  return step;
};

export default describeResultNextStep;
