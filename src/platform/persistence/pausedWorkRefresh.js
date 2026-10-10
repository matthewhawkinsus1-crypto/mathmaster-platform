/*
 * A PAUSED TAB RE-READS THE WORK WHEN THE QUESTION'S RECORD MOVES.
 *
 * A tab paused by another tab (activeWorkTab.js) still holds the work as it
 * was when it was last in charge — which can be an answer the student typed
 * there and never submitted. The question record keeps flowing in while it is
 * paused. When the other tab submits, the record that arrives here says the
 * question is closed (or has one attempt fewer), and the paused tab drew that
 * verdict over its own stale, unsubmitted answer: QA round 2 saw "7" under
 * "✓ CORRECT / Question complete" for a question answered and recorded as 5,
 * while a reload showed 5.
 *
 * So a paused tab treats a new attempt on the record the way "Continue here"
 * treats taking the question back: it drops what it holds and re-reads the
 * saved work — the work the tab in charge wrote and submitted. It does NOT
 * take the question back, and it never writes what it held: the stale answer
 * is discarded, not saved.
 *
 * Only an ATTEMPT moves the revision — never a field the tab itself changes
 * while working (time spent, help used). A tab that is in charge is never
 * refreshed here: its own Submit moves the record too, and its work on screen
 * IS the recorded work.
 */

const text = (value) => (value === null || value === undefined ? '' : String(value));

/** What a new attempt on the record changes — and nothing else. */
export const recordAttemptRevision = (record) => {
  if (!record || typeof record !== 'object') return 'none';
  return [
    text(record.status),
    text(Number(record.totalAttempts) || 0),
    text(Number(record.attemptCount) || 0),
    text(record.lastResponseKey),
    text(Number(record.variantIndex) || 0),
  ].join('|');
};

/**
 * Whether a paused tab must drop its local work and re-read the saved work.
 * `previous` and `next` are { scope, revision } — scope being the draft key the
 * revision was seen under, so moving to another question is never mistaken
 * for a new attempt on this one.
 */
export const pausedWorkNeedsRefresh = ({ paused, previous, next }) => Boolean(
  paused
  && previous
  && next
  && previous.scope === next.scope
  && previous.revision !== next.revision,
);
