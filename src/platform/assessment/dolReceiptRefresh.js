/*
 * THE EXIT-TICKET RECEIPT ARRIVES AFTER THE CLOSE (RT08).
 *
 * The receipts (studentResponseCheckpoints) are read when an assignment
 * opens; a live subscription was left out on purpose (#474). So a student
 * still on the page when their exit ticket closed saw no "Time is up. Your
 * latest completed response was submitted automatically." until a reload.
 *
 * The server's finalizer runs every minute from the close, so when the open
 * assignment's exit ticket closes — time up, or the teacher's Close now —
 * the receipts are read again a few times over the next minutes: three reads
 * per close, not a standing listener.
 */
export const RECEIPT_READS_AFTER_CLOSE_MS = Object.freeze([20_000, 80_000, 140_000]);

/**
 * The re-reads one change of the open exit ticket calls for: none unless the
 * SAME assignment's exit ticket was open and is now closed. `window` is
 * `{ assignmentId, open }`, or null when no timed exit ticket is open on screen.
 */
export const receiptRereadsAfter = (previous, next) => (
  previous?.assignmentId && previous.assignmentId === next?.assignmentId
  && previous.open === true && next.open === false
    ? RECEIPT_READS_AFTER_CLOSE_MS
    : []
);
