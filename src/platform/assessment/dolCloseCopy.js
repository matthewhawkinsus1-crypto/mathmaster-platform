/*
 * WHAT A STUDENT IS TOLD ABOUT A TIMED DOL, IN ONE PLACE.
 *
 * QA round 2 (R2-m4): after a teacher pressed "Close now" the student read
 * "The DOL timer has ended … no new submission is allowed" directly above
 * "Your latest completed response will be submitted automatically when time
 * ends". The second line promises a future that already happened, and "timer"
 * is wrong when the teacher closed it.
 *
 * The rules this function owns:
 *   - an OPEN, timed DOL is the only state that says the latest completed
 *     response "will be submitted automatically when time ends";
 *   - a DOL the teacher closed says the teacher closed it, never "timer";
 *   - a DOL whose time ran out says time is up;
 *   - once closed, the student still learns whether their latest completed
 *     response was recorded — from the server's finalization receipt only. No
 *     receipt yet means "checking", never "submitted".
 *
 * Nothing here reads or reveals an answer, verdict or score: the inputs are the
 * window state and the receipt status.
 *
 * Inputs
 *   status        getDOLState().status: 'active' | 'ended' | anything else
 *   teacherClosed getDOLState().teacherClosed (a teacher's "Close now")
 *   outcome       the studentResponseCheckpoints receipt status, or null:
 *                 'auto-submitted' | 'explicitly-submitted' | 'incomplete-at-close'
 *
 *   extendedTime  getDOLState().extendedTime — the student's own extra time
 *                 (decision D7) keeps their exit ticket open past the class's
 *   endsAt        getDOLState().endsAt — the student's own close
 *
 * Output: { state, lockMessage, openNotice, closeReceipt, extraTimeNotice } —
 * every string is '' when that line should not render. lockMessage is what
 * the host passes as QuestionEngine's assignmentLockedMessage. While a student
 * with extra time works, extraTimeNotice tells them THEIR close time ("Your
 * exit ticket closes at 10:52 — extra time.") and leads the open notice, so a
 * classmate's timer running out is never what they go by. It names no
 * accommodation and no multiplier.
 */

import { EXTRA_TIME_WORDS } from './extraTimeWords.js';

export const DOL_OPEN_NOTICE = 'Your latest completed response will be submitted automatically when time ends.';

// "extra time", shared with the timer pill and Home (extraTimeWords.js).
export { EXTRA_TIME_WORDS };

const clockTime = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const hours = date.getHours() % 12 || 12;
  return `${hours}:${String(date.getMinutes()).padStart(2, '0')}`;
};

/** The student's own close, when extra time moves it; '' otherwise. */
export const dolExtraTimeNotice = ({ extendedTime = false, endsAt = null } = {}) => {
  if (extendedTime !== true || !endsAt) return '';
  const time = clockTime(endsAt);
  return time ? `Your exit ticket closes at ${time} — ${EXTRA_TIME_WORDS}.` : '';
};

const RECEIPT_TEXT = {
  teacher: {
    'auto-submitted': 'Your latest completed response was submitted when your teacher closed the exit ticket.',
    'explicitly-submitted': 'Your submitted work has been saved.',
    'incomplete-at-close': 'No completed response was available to submit when your teacher closed the exit ticket.',
  },
  timer: {
    'auto-submitted': 'Time is up. Your latest completed response was submitted automatically.',
    'explicitly-submitted': 'Time is up. Your submitted work has been saved.',
    'incomplete-at-close': 'Time is up. No completed response was available to submit.',
  },
};

const LOCK_TEXT = {
  teacher: 'Your teacher closed this exit ticket. Your saved response is available for review, but no new submission is allowed.',
  timer: 'Time is up for this exit ticket. Your saved response is available for review, but no new submission is allowed.',
};

const PENDING_RECEIPT = 'Checking whether your latest completed response was recorded.';

export const describeDolClose = ({ status, teacherClosed = false, outcome = null, extendedTime = false, endsAt = null } = {}) => {
  if (status === 'active') {
    const extraTimeNotice = dolExtraTimeNotice({ extendedTime, endsAt });
    return {
      state: 'open',
      lockMessage: '',
      openNotice: extraTimeNotice ? `${extraTimeNotice} ${DOL_OPEN_NOTICE}` : DOL_OPEN_NOTICE,
      closeReceipt: '',
      extraTimeNotice,
    };
  }
  if (status !== 'ended') {
    // Waiting / not scheduled today: the DOL is not open, nothing is pending.
    return { state: 'not-open', lockMessage: '', openNotice: '', closeReceipt: '', extraTimeNotice: '' };
  }
  const closedBy = teacherClosed === true ? 'teacher' : 'timer';
  const receipt = RECEIPT_TEXT[closedBy][String(outcome || '')] || PENDING_RECEIPT;
  return {
    state: closedBy === 'teacher' ? 'closed-by-teacher' : 'closed-by-timer',
    lockMessage: LOCK_TEXT[closedBy],
    openNotice: '',
    closeReceipt: receipt,
    extraTimeNotice: '',
  };
};
