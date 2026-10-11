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
 * Output: { state, lockMessage, openNotice, closeReceipt } — every string is
 * '' when that line should not render. lockMessage is what the host passes as
 * QuestionEngine's assignmentLockedMessage.
 */

export const DOL_OPEN_NOTICE = 'Your latest completed response will be submitted automatically when time ends.';

const RECEIPT_TEXT = {
  teacher: {
    'auto-submitted': 'Your latest completed response was submitted when your teacher closed the DOL.',
    'explicitly-submitted': 'Your submitted work has been saved.',
    'incomplete-at-close': 'No completed response was available to submit when your teacher closed the DOL.',
  },
  timer: {
    'auto-submitted': 'Time is up. Your latest completed response was submitted automatically.',
    'explicitly-submitted': 'Time is up. Your submitted work has been saved.',
    'incomplete-at-close': 'Time is up. No completed response was available to submit.',
  },
};

const LOCK_TEXT = {
  teacher: 'Your teacher closed this DOL. Your saved response is available for review, but no new submission is allowed.',
  timer: 'Time is up for this DOL. Your saved response is available for review, but no new submission is allowed.',
};

const PENDING_RECEIPT = 'Checking whether your latest completed response was recorded.';

export const describeDolClose = ({ status, teacherClosed = false, outcome = null } = {}) => {
  if (status === 'active') {
    return { state: 'open', lockMessage: '', openNotice: DOL_OPEN_NOTICE, closeReceipt: '' };
  }
  if (status !== 'ended') {
    // Waiting / not scheduled today: the DOL is not open, nothing is pending.
    return { state: 'not-open', lockMessage: '', openNotice: '', closeReceipt: '' };
  }
  const closedBy = teacherClosed === true ? 'teacher' : 'timer';
  const receipt = RECEIPT_TEXT[closedBy][String(outcome || '')] || PENDING_RECEIPT;
  return {
    state: closedBy === 'teacher' ? 'closed-by-teacher' : 'closed-by-timer',
    lockMessage: LOCK_TEXT[closedBy],
    openNotice: '',
    closeReceipt: receipt,
  };
};
