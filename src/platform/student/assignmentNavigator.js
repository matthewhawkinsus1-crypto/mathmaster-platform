/*
 * WHAT THE ASSIGNMENT NAVIGATOR SAYS ABOUT EACH QUESTION AND SECTION.
 *
 * The number strip, the section tabs and the Overview grid used to answer
 * "how is this question going?" three different ways (pass 3, RUN-5 / RUN-8 /
 * RUN-9):
 *
 *   - a quiz with feedback held still turned its numbers green or amber and
 *     read them as "correct" / "needs another try", and its tab said
 *     "✓ Complete" only when every answer was right — while the question itself
 *     said "Feedback opens later";
 *   - a question out of tries read "needs another try", and a Warm-Up closed for
 *     the period still said "2 tries left" in the Overview;
 *   - a locked section said "🔒 Locked" with its reason in a hover tooltip, and
 *     a section the teacher closed could not be opened again although its
 *     message promised the saved work stays visible.
 *
 * This module answers once, for all three. It is pure: no React, no clock of
 * its own. Every time and window comes from the lifecycle state the caller
 * already holds (getWarmupState, getDOLState, getSectionAccessState) — a
 * student's own DOL window (extra time) is that state's business, not this
 * module's.
 *
 * Nothing here changes grading: tries left come from the shared attempt
 * policy, read-only.
 */
import { getAttemptsRemaining, getQuestionCredit, normalizeQuestionRecord } from '../../attemptPolicy.js';

export const QUESTION_STATUS = Object.freeze({
  CORRECT: 'correct',
  // A miss with tries left.
  TRY_AGAIN: 'tryAgain',
  // Out of tries on this version, and the question offers "Request New
  // Question" (a fresh version, full credit still reachable): not finished.
  NEW_QUESTION: 'newQuestion',
  // Out of tries, or its section is closed: nothing more can be submitted.
  CLOSED: 'closed',
  // Feedback is held (a quiz or test the teacher releases later): answered,
  // and nothing about right or wrong.
  SUBMITTED: 'submitted',
  NOT_STARTED: 'notStarted',
  // Its section cannot be opened yet.
  LOCKED: 'locked',
});

const SPOKEN = Object.freeze({
  [QUESTION_STATUS.CORRECT]: 'correct',
  [QUESTION_STATUS.TRY_AGAIN]: 'needs another try',
  [QUESTION_STATUS.NEW_QUESTION]: 'out of tries, a new question is available',
  [QUESTION_STATUS.CLOSED]: 'closed',
  [QUESTION_STATUS.SUBMITTED]: 'submitted, feedback comes later',
  [QUESTION_STATUS.NOT_STARTED]: 'not started',
  [QUESTION_STATUS.LOCKED]: 'locked',
});

const triesText = (count) => `${count} ${count === 1 ? 'try' : 'tries'} left`;

/**
 * One question, as the navigator shows and speaks it.
 *
 * @param {object} input
 * @param {object} input.record          the question's tracker record (raw or normalized)
 * @param {number} input.maximumAttempts tries this student has on it (resolveQuestionMaximumAttempts)
 * @param {boolean} [input.feedbackHeld] right and wrong are held for this question
 * @param {boolean} [input.sectionClosed] its section takes no more submissions (read-only)
 * @param {boolean} [input.available]    its section can be opened at all
 * @param {string} [input.lockedLabel]   why it cannot be opened ("Opens 2:15 PM")
 * @param {boolean} [input.replacementAvailable] out of tries, the question
 *   offers a new version (its policy allows a replacement and its outcome is shown)
 * @returns {{ status: string, spoken: string, label: string, triesLeft: number }}
 */
export const describeNavigatorQuestion = ({
  record,
  maximumAttempts,
  feedbackHeld = false,
  sectionClosed = false,
  available = true,
  lockedLabel = '',
  replacementAvailable = false,
} = {}) => {
  const normalized = normalizeQuestionRecord(record);
  const triesLeft = getAttemptsRemaining(normalized, maximumAttempts);
  const answered = normalized.totalAttempts > 0 || ['correct', 'expired'].includes(normalized.status);
  const finish = (status, label, spoken = SPOKEN[status]) => ({ status, spoken, label, triesLeft });

  if (!available) {
    return finish(QUESTION_STATUS.LOCKED, lockedLabel || 'Locked', lockedLabel ? `locked, ${lockedLabel}` : SPOKEN.locked);
  }
  // The mask comes before every verdict: a held question never says correct,
  // never "tries left" (which, beside a correct one that locks, says wrong).
  if (feedbackHeld && answered) {
    return finish(QUESTION_STATUS.SUBMITTED, 'Submitted · feedback later');
  }
  if (normalized.status === 'correct') return finish(QUESTION_STATUS.CORRECT, 'Correct');
  const outOfTries = normalized.status === 'expired' && triesLeft <= 0;
  // A new version is one tap away while the section is open: not done, and a
  // section tab still lands on it so the student can ask for it.
  if (outOfTries && replacementAvailable && !sectionClosed) {
    return finish(QUESTION_STATUS.NEW_QUESTION, 'Out of tries · new question available');
  }
  if (outOfTries) {
    const percent = Math.round(getQuestionCredit(normalized) * 100);
    return finish(QUESTION_STATUS.CLOSED, percent > 0 ? `Closed · ${percent}% credit` : 'Closed · no tries left', 'closed, no tries left');
  }
  // A closed section overrides "tries left": nothing more can be submitted.
  if (sectionClosed) {
    return finish(QUESTION_STATUS.CLOSED, answered ? 'Closed' : 'Closed · not started', answered ? 'closed' : 'closed, not started');
  }
  if (answered) {
    const credit = getQuestionCredit(normalized);
    const label = credit > 0 ? `${Math.round(credit * 100)}% so far · ${triesText(triesLeft)}` : triesText(triesLeft);
    return finish(QUESTION_STATUS.TRY_AGAIN, label, `needs another try, ${triesText(triesLeft)}`);
  }
  return finish(QUESTION_STATUS.NOT_STARTED, 'Not started');
};

const TERMINAL = new Set([QUESTION_STATUS.CORRECT, QUESTION_STATUS.CLOSED, QUESTION_STATUS.SUBMITTED]);

/**
 * Is the question's outcome withheld from the student right now? The same rule
 * the question itself follows (QuestionEngine shows the outcome when its
 * feedback is 'immediate' or released; App releases a question in
 * post-deadline practice, after the teacher's release, or — for
 * 'afterAssignmentSubmit', a DOL — once the question is finished). While it
 * is, the navigator must not say right or wrong either.
 *
 * @param {object} input
 * @param {string} input.feedbackMode   the activity policy's `feedback`
 * @param {boolean} [input.released]    released for the whole assignment, or post-deadline practice
 * @param {object} [input.record]       the question's tracker record
 */
export const outcomeWithheld = ({ feedbackMode = 'immediate', released = false, record = null } = {}) => {
  if (feedbackMode === 'immediate' || released) return false;
  const status = normalizeQuestionRecord(record).status;
  if (feedbackMode === 'afterAssignmentSubmit' && ['correct', 'expired'].includes(status)) return false;
  return true;
};

/**
 * A section tab's words. `questions` are describeNavigatorQuestion results.
 * "✓ Complete" means every answer is right, so a held section never says it:
 * once all are in it says "All submitted".
 */
export const describeNavigatorSectionProgress = ({ questions = [], feedbackHeld = false } = {}) => {
  const total = questions.length;
  const done = questions.filter((question) => TERMINAL.has(question.status)).length;
  const allCorrect = total > 0 && !feedbackHeld && questions.every((question) => question.status === QUESTION_STATUS.CORRECT);
  const allSubmitted = total > 0 && feedbackHeld && done === total;
  return {
    total,
    done,
    allCorrect,
    label: allCorrect ? 'Complete' : allSubmitted ? 'All submitted' : `${done}/${total}`,
  };
};

/**
 * Where a section tab lands: the first question the student can work now and
 * has not finished; else (nothing workable) the first one they can open that
 * is not correct, so a closed section still opens for review; else the
 * current one; else the first one they can open. Never an out-of-tries
 * question while a workable one is left (RUN-9).
 *
 * `entries` carry `{ index, viewable, workable, status }`; status is a
 * QUESTION_STATUS.
 */
export const sectionLandingEntry = ({ entries = [], currentIndex = null } = {}) => {
  const viewable = entries.filter((entry) => entry.viewable);
  if (!viewable.length) return null;
  const unfinished = (entry) => !TERMINAL.has(entry.status);
  return viewable.find((entry) => entry.workable && unfinished(entry))
    || viewable.find((entry) => entry.status !== QUESTION_STATUS.CORRECT && entry.status !== QUESTION_STATUS.SUBMITTED)
    || viewable.find((entry) => entry.index === currentIndex)
    || viewable[0];
};

export const SECTION_ACCESS = Object.freeze({
  OPEN: 'open',
  // Viewable, takes no submissions.
  READ_ONLY: 'readOnly',
  // Cannot be opened (yet).
  LOCKED: 'locked',
});

const defaultFormatTime = (date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const defaultFormatDay = (date) => date.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(typeof value?.toMillis === 'function' ? value.toMillis() : value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Can this section be opened, worked, and if not, why and when — in a short
 * label for a tab ("Opens 2:15 PM", "Closed by your teacher") and a sentence a
 * screen reader and the Overview can say.
 *
 * @param {object} input
 * @param {string} input.role             warmup | classwork | practice | dol | …
 * @param {string} input.label            the section's student name
 * @param {boolean} [input.timedDol]      the entry is in the timed DOL window
 * @param {boolean} [input.unrestricted]  a preview, or post-deadline practice
 * @param {object} [input.lifecycle]      getAssignmentLifecycle
 * @param {object} [input.warmupState]    getWarmupState
 * @param {object} [input.dolState]       getDOLState
 * @param {object} [input.manualState]    getSectionAccessState for this role
 * @param {boolean} [input.hasWork]       the student has answered something in it
 * @param {number|Date} [input.nowValue]
 */
export const describeSectionAccess = ({
  role,
  label = 'this section',
  timedDol = false,
  unrestricted = false,
  lifecycle = null,
  warmupState = null,
  dolState = null,
  manualState = null,
  hasWork = false,
  nowValue = Date.now(),
  formatTime = defaultFormatTime,
  formatDay = defaultFormatDay,
} = {}) => {
  const open = { state: SECTION_ACCESS.OPEN, viewable: true, workable: true, short: '', reason: '' };
  if (unrestricted) return open;
  const now = toDate(nowValue) || new Date();
  const when = (date) => {
    const at = toDate(date);
    if (!at) return '';
    return at.toDateString() === now.toDateString() ? formatTime(at) : formatDay(at);
  };
  // `label` reads mid-sentence ("the Classwork"); a sentence starts upper-case.
  const sentence = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);
  const locked = (short, reason) => ({ state: SECTION_ACCESS.LOCKED, viewable: false, workable: false, short, reason: sentence(reason) });
  const readOnly = (short, reason) => ({ state: SECTION_ACCESS.READ_ONLY, viewable: true, workable: false, short, reason: sentence(reason) });
  const opensLater = (date, fallback) => {
    const at = when(date);
    return at
      ? locked(`Opens ${at}`, `${label} opens at ${at}.`)
      : locked(fallback, `${label} ${fallback.charAt(0).toLowerCase()}${fallback.slice(1)}.`);
  };
  const notToday = (state) => {
    const key = String(state?.instructionDateKey || '');
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (key && key < today) return locked('Closed', `${label} was open in class on ${key}. It is closed now.`);
    return key ? locked(`Opens ${key}`, `${label} opens in class on ${key}.`) : locked('Opens in class', `${label} opens when your teacher starts it in class.`);
  };

  // "Your work stays here" only when there is work: a student who never
  // started a closed section is told where to turn instead.
  const keptWork = (closedLine) => (hasWork
    ? `${closedLine} Your work stays here to look over.`
    : `${closedLine} Ask your teacher if you missed it.`);

  if (role === 'warmup' && warmupState?.enabled) {
    const status = warmupState.status;
    if (status === 'active') return open;
    if (status === 'closed') return readOnly('Closed', keptWork(`${label} is closed for today.`));
    if (status === 'ended') return readOnly('Class ended', keptWork(`Class has ended, so ${label} is closed.`));
    if (status === 'waiting') return opensLater(warmupState.opensAt, 'Opens before class');
    if (status === 'notToday') return notToday(warmupState);
    return locked('Opens in class', `${label} opens when your class starts.`);
  }

  if (timedDol && dolState?.enabled && !lifecycle?.isClosed) {
    const status = dolState.status;
    if (status === 'active') return open;
    if (status === 'ended') {
      return dolState.teacherClosed
        ? readOnly('Closed by your teacher', keptWork(`Your teacher closed ${label}.`))
        : readOnly('Time is up', keptWork(`Time is up for ${label}.`));
    }
    if (status === 'waiting' || status === 'beforeClass') return opensLater(dolState.opensAt, 'Opens near the end of class');
    if (status === 'notToday') return notToday(dolState);
    return locked('Opens in class', `${label} opens when your teacher starts it in class.`);
  }

  if (manualState?.enabled && !manualState.isOpen) {
    if (manualState.status === 'scheduled') {
      return opensLater(manualState.lifecycle?.releaseAt || lifecycle?.releaseAt, 'Opens later');
    }
    if (manualState.status === 'closedAssignment') return locked('Closed', `${label} is closed.`);
    // A section the teacher closed keeps the student's work visible — the
    // engine's own message promises it. One that has never been opened for
    // this class (authored to start locked, no work in it) stays shut, so its
    // questions are not shown before the teacher starts it.
    const teacherClosed = String(manualState.override?.state || '').toLowerCase() === 'closed';
    if (teacherClosed || hasWork) {
      return readOnly('Closed by your teacher', hasWork
        ? `Your teacher closed ${label}. Your work stays here to look over; you cannot submit until it is opened again.`
        : `Your teacher closed ${label}. You cannot submit until it is opened again.`);
    }
    return locked('Opens in class', `${label} opens when your teacher starts it in class.`);
  }

  return open;
};
