/*
 * ONE LINE THAT TELLS A STUDENT WHETHER THEIR WORK IS SAFE.
 *
 * App.jsx tracks the student's outbox in `studentPersistenceStatus`:
 *   idle          nothing has happened this session
 *   capturing     an answer is being written to this device's queue
 *   queued        written to the device queue, waiting to be sent
 *   syncing       the queue is being sent
 *   offline       the queue is waiting for a connection
 *   needs-review  something sent was not recorded yet (the server owes it)
 *   durable       recorded by the server
 *   submitted     recorded by the server, nothing left to send
 *   rejected      not accepted — the assignment is no longer available
 *   volatile      the device queue could not be written; the work is only on
 *                 screen, so the tab must stay open
 *
 * The Home line says this in a student's words, and never says "saved" while
 * anything is still owed a delivery (the September 14 lesson: a student was
 * told their work was in, and it was not).
 */

export const SAVE_TONE = Object.freeze({
  SAVED: 'saved',
  SAVING: 'saving',
  OFFLINE: 'offline',
  ATTENTION: 'attention',
});

export const SAVE_STATUS_TEXT = Object.freeze({
  saved: 'All work saved',
  saving: 'Saving…',
  offline: 'Offline — your work is saved on this device and will send when you reconnect',
  attention: 'Some work needs attention — keep this tab open',
  rejected: 'Some work could not be saved because the assignment has closed',
});

const count = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0);

export const describeSaveStatus = ({
  persistenceStatus = 'idle',
  outboxDepth = 0,
  pendingGradeCount = 0,
  online = true,
} = {}) => {
  const status = String(persistenceStatus || 'idle');
  const owed = count(outboxDepth) + count(pendingGradeCount);

  // The device could not hold the work, or the server has not recorded what
  // it was sent: both need the tab to stay open.
  if (status === 'volatile' || status === 'needs-review') {
    return { tone: SAVE_TONE.ATTENTION, text: SAVE_STATUS_TEXT.attention };
  }
  if (status === 'rejected') {
    return { tone: SAVE_TONE.ATTENTION, text: SAVE_STATUS_TEXT.rejected };
  }
  if (status === 'offline' || (online === false && (owed > 0 || ['capturing', 'queued', 'syncing'].includes(status)))) {
    return { tone: SAVE_TONE.OFFLINE, text: SAVE_STATUS_TEXT.offline };
  }
  if (['capturing', 'queued', 'syncing'].includes(status) || owed > 0) {
    return { tone: SAVE_TONE.SAVING, text: SAVE_STATUS_TEXT.saving };
  }
  // idle, durable, submitted — and nothing left in the queue.
  return { tone: SAVE_TONE.SAVED, text: SAVE_STATUS_TEXT.saved };
};
