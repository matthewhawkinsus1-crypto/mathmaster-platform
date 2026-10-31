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

/*
 * WHICH WORK, AND WHAT TO DO (NV10). "Some work needs attention" named no
 * assignment and no next step. It now says which assignment, where that is
 * known, and the one thing to do for each kind of trouble. The opening words
 * stay, so a student who has seen the line before still knows it.
 */
const titleList = (titles) => {
  const names = [...new Set((Array.isArray(titles) ? titles : []).map((title) => String(title || '').trim()).filter(Boolean))];
  if (!names.length) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} more assignments`;
};

export const attentionText = ({ status, draftsUnsaved = false, needsReviewTitles = [], unsavedDraftTitles = [] } = {}) => {
  if (status === 'volatile') {
    return 'Some work needs attention: an answer is only on this screen. Keep this tab open until it saves, and tell your teacher if this stays.';
  }
  if (status === 'needs-review') {
    const where = titleList(needsReviewTitles);
    return where
      ? `Some work needs attention: answers on ${where} have not been recorded yet. Keep this tab open while MathMaster sends them.`
      : 'Some work needs attention: some answers have not been recorded yet. Keep this tab open while MathMaster sends them.';
  }
  if (draftsUnsaved) {
    const where = titleList(unsavedDraftTitles);
    return where
      ? `Some work needs attention: unfinished work on ${where} is not backed up. Open it, finish it on this device, and tell your teacher.`
      : 'Some work needs attention: some unfinished work is not backed up. Finish it on this device, and tell your teacher.';
  }
  return SAVE_STATUS_TEXT.attention;
};

export const describeSaveStatus = ({
  persistenceStatus = 'idle',
  outboxDepth = 0,
  pendingGradeCount = 0,
  online = true,
  // Unfinished work that is not being saved (Batch 3, draftSaveHealth.js):
  // never "All work saved" while the assignment screen says it is not.
  draftsUnsaved = false,
  // The assignments that work is on, where known (NV10).
  needsReviewTitles = [],
  unsavedDraftTitles = [],
} = {}) => {
  const status = String(persistenceStatus || 'idle');
  const owed = count(outboxDepth) + count(pendingGradeCount);

  // The device could not hold the work, or the server has not recorded what
  // it was sent: both need the tab to stay open.
  if (status === 'volatile' || status === 'needs-review') {
    return { tone: SAVE_TONE.ATTENTION, text: attentionText({ status, needsReviewTitles }) };
  }
  if (status === 'rejected') {
    return { tone: SAVE_TONE.ATTENTION, text: SAVE_STATUS_TEXT.rejected };
  }
  if (draftsUnsaved) {
    return { tone: SAVE_TONE.ATTENTION, text: attentionText({ draftsUnsaved, unsavedDraftTitles }) };
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

/*
 * THE LINE UNDER A QUESTION SAYS WHAT WAS SAVED: A DRAFT OR AN ANSWER
 * (student pass 3, RUN-11).
 *
 * Moving between questions queues the student's progress (time on the
 * question) and drains it. The line then read "Syncing · 1 change saved on
 * this device…" and "Recorded by MathMaster." beside an answer the student
 * had never submitted — easy to read as "my answer was recorded".
 *
 * The status alone cannot tell the two apart, so the line also knows its
 * SUBJECT: 'answer' from the moment a submitted answer or step is in the
 * device queue (or a drain reports answers still owed, as after a reload)
 * until the queue next drains with nothing owed; 'draft' otherwise —
 * navigation progress and response checkpoints. A no-credit practice submit
 * queues nothing and is not an answer sent. "Answer recorded"
 * is reachable only from a drain that left nothing owed after an answer was
 * sent, so nothing is ever called recorded before the server has it.
 *
 * The 'volatile' and 'rejected' lines are not described here (null): App.jsx
 * keeps those words (the device could not store the change; the assignment
 * closed).
 */
export const SAVE_SUBJECT = Object.freeze({ DRAFT: 'draft', ANSWER: 'answer' });

export const initialSaveSubject = () => ({ pendingAnswer: false, lastRecorded: SAVE_SUBJECT.DRAFT, status: 'idle' });

/**
 * The subject after an event: { type: 'answer-sent' } when the student
 * submits, { type: 'status', status } on every persistence status (only a
 * change of status does anything). A drain that leaves nothing owed records
 * what was pending. An answer that could not be stored, or was refused, is
 * no longer pending: it may never be called recorded.
 */
export const nextSaveSubject = (state = initialSaveSubject(), event = {}) => {
  const current = state && typeof state === 'object' ? state : initialSaveSubject();
  if (event?.type === 'answer-sent') return current.pendingAnswer ? current : { ...current, pendingAnswer: true };
  if (event?.type !== 'status') return current;
  const status = String(event.status || 'idle');
  // Answers the last drain left in the queue (a reload, an offline device)
  // are answers, whoever queued them.
  if (count(event.pendingGradeCount) > 0 && !current.pendingAnswer) return { ...current, pendingAnswer: true };
  if (status === current.status) return current;
  if (status === 'durable' || status === 'submitted') {
    return { pendingAnswer: false, lastRecorded: current.pendingAnswer ? SAVE_SUBJECT.ANSWER : SAVE_SUBJECT.DRAFT, status };
  }
  if (status === 'volatile' || status === 'rejected') return { ...current, pendingAnswer: false, status };
  return { ...current, status };
};

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const describeRuntimeSaveLine = ({
  persistenceStatus = 'idle',
  subject = initialSaveSubject(),
  outboxDepth = 0,
  pendingGradeCount = 0,
} = {}) => {
  const status = String(persistenceStatus || 'idle');
  const answer = Boolean(subject?.pendingAnswer) || count(pendingGradeCount) > 0;
  const owed = count(pendingGradeCount) || count(outboxDepth);
  switch (status) {
    case 'capturing':
      // An answer is marked once it is queued, so before that this cannot
      // tell which it is.
      return answer ? 'Saving your answer…' : 'Saving…';
    case 'queued':
    case 'syncing':
      return answer
        ? 'Answer saved on this device · sending it to MathMaster. You may keep working.'
        : 'Draft saved on this device. You may keep working.';
    case 'offline':
      return answer
        ? `Waiting for connection · ${plural(count(pendingGradeCount) || 1, 'answer', 'answers')} saved on this device, not recorded yet.`
        : 'Draft saved on this device. It will sync when you are back online.';
    case 'needs-review':
      return `Needs review · ${plural(owed || 1, 'saved item has', 'saved items have')} not been recorded yet. You may keep working.`;
    case 'durable':
    case 'submitted':
      return subject?.lastRecorded === SAVE_SUBJECT.ANSWER ? 'Answer recorded by MathMaster.' : 'Draft saved.';
    default:
      return null;
  }
};

/*
 * A ROUTINE SAVE LINE (the owner, 2026-10-20; the W7-8 integrator's option).
 * On a phone every line under the question takes its height from the work
 * area ("Draft saved." is 27px of a 390×844 phone's 498). So a phone shows
 * only the lines that need the student: offline, needs review, refused, not
 * stored. The routine ones (saving, saved on this device and sending, "Draft
 * saved.", "Answer recorded by MathMaster.") are not drawn there (App.css and
 * MathToolMobileLayout.css hide `[data-save-line-routine]`); a Chromebook still
 * shows them. None of them is announced (App.jsx's save-line announcement).
 */
const ROUTINE_SAVE_STATUSES = new Set(['capturing', 'queued', 'syncing', 'durable', 'submitted']);
export const saveLineIsRoutine = ({ persistenceStatus = 'idle' } = {}) => ROUTINE_SAVE_STATUSES.has(String(persistenceStatus || 'idle'));

/*
 * A DRAFT LINE GIVES WAY WHILE UNFINISHED WORK IS NOT BEING SAVED (Batch 3
 * into pass 3).
 *
 * "Draft saved on this device" and "Draft saved." are about the student's
 * progress in the device queue. Batch 3 tells the student, in its own alert,
 * when their unfinished work itself could not be saved (draftSaveHealth.js:
 * storage full, a backup that refused it or is full). Read together, "Draft
 * saved on this device" over "Your work is not being saved on this device"
 * says both things at once. While that alert stands, a line about drafts is
 * not shown: the alert is the one sentence. A line about an answer the student
 * sent stays (that answer is in the queue or recorded), and so do offline,
 * needs-review, refused and not-stored, which ask something of the student.
 */
export const saveLineIsAboutDrafts = ({
  persistenceStatus = 'idle',
  subject = initialSaveSubject(),
  pendingGradeCount = 0,
} = {}) => {
  const status = String(persistenceStatus || 'idle');
  const answer = Boolean(subject?.pendingAnswer) || count(pendingGradeCount) > 0;
  switch (status) {
    case 'capturing':
    case 'queued':
    case 'syncing':
      return !answer;
    case 'durable':
    case 'submitted':
      return subject?.lastRecorded !== SAVE_SUBJECT.ANSWER;
    default:
      return false;
  }
};
