/*
 * WHEN A STEP ALGEBRA OPERATION WAS EDITED, AND WHICH COPY KEEPS IT.
 *
 * Step Algebra's draft holds the work on the equation as one answer, taken
 * whole from one copy (functions/shared/workspaceDraftSchema.mjs), and only a
 * committed step dates it: choosing an operation and typing its value ("Divide
 * by what?" 7) do not. When a device settles its copy against the server's and
 * both hold the same committed board, the operation not yet applied goes to the
 * copy that edited it later (questionDraftStorage.js, issue #386 R12). That was
 * judged by the time of the whole copy, which any edit moves, a prompt answer
 * too, so a prompt answer decided which operation survived (a review of
 * 455b994e, measured with the reviewer's two-device scripts on the real
 * questionDraftStorage.js and the shared merge):
 *
 *   - Start over undone. Chromebook A holds Divide 7, chosen and synced, not
 *     applied. The student presses Start over on B. Before A reads the
 *     server's copy, the student answers a prompt on A. A's read drops the
 *     pre-reset operation, but the rule saw the same board with A's copy as
 *     the newer and copied Divide 7 back; A's next save put it on the server
 *     and B got it back.
 *   - A fresh cart Chromebook whose student answers a prompt before the read
 *     lands dropped the Divide 7 left unapplied on another Chromebook, which
 *     came back before the rule.
 *
 * So the operation carries its own time. An edit that changes the work (the
 * operation, its value, anything not yet committed, or a committed step) dates
 * it under `operation` in the copy's per-answer times. That is not an answer
 * of its own: the shared merge carries a time it does not group as it is,
 * keeping the later of two copies' and dropping one dated at or before a reset
 * the copy did not see, so the server's copy says when its operation was last
 * edited on any device (tests/platform/stepAlgebraOperationEdit.test.mjs holds
 * the shared merge to that). A device keeps its own operation over the saved
 * copy's only when its operation was edited after the latest Start over and
 * the question's last submitted attempt, and no earlier than the saved copy's.
 *
 * A COPY THE BUILD BEFORE BEGAN (a review of this rule, PR #564). That build
 * dated no operation. A copy it began on this device and left unsettled — the
 * student worked before the server's copy was read, then the page reloaded
 * into this build — holds an operation the student typed here, with no time.
 * Judged as never edited, it yielded to the saved copy's, older or not, as a
 * fresh copy's work does: Divide 3 typed there became the saved Divide 7.
 * Only a fresh copy can lose this way (a settled copy is judged by the shared
 * merge, the later copy whole, as the build before judged it), and only an
 * edit made here can be in it: a settle or a restore ends `fieldsFresh`, and
 * this build dates every operation it edits. So such a copy is judged as that
 * build judged it: its operation dated by its own last save, when that save
 * was an edit, and only when it has seen the latest Start over, since that
 * time can be a prompt answer's after one. A fresh copy this build began, with
 * no operation or none edited, is never judged so (a fresh Chromebook whose
 * student answers a prompt first still gets the other Chromebook's back).
 */
import { fieldRecordGroups, resetTimeOf } from '../../../functions/shared/workspaceDraftSchema.mjs';

/** The key in a Step Algebra copy's per-answer times (`fieldEditedAt`) that dates its work, operation included. */
export const STEP_ALGEBRA_OPERATION_EDIT = 'operation';

const STEP_ALGEBRA = 'step-algebra';
const WORK = 'work';
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// The work as it stands: every field of the work group (all but the prompt
// answers), in a fixed order. A draft's value is plain JSON.
const workSignature = (value) => JSON.stringify((fieldRecordGroups(STEP_ALGEBRA, value).get(WORK)?.fields || [])
  .sort().map((field) => [field, value[field] ?? null]));

/**
 * The per-answer times a write of `next` over `previous` gives a Step Algebra
 * copy (`times`, as stampFieldRecordEdits made them), with the operation dated
 * `now` when the write is the student's edit and changed the work. A write
 * over no record (a fresh copy, a Start over's tombstone) dates nothing: the
 * board it shows was not chosen by an edit. Every other draft's times come back
 * as they were.
 */
export const stampStepAlgebraOperationEdit = ({ kind, previous, next, edit, now, times }) => {
  if (kind !== STEP_ALGEBRA || !edit || !isRecord(times) || !isRecord(previous) || !isRecord(next)) return times;
  if (workSignature(previous) === workSignature(next)) return times;
  return { ...times, [STEP_ALGEBRA_OPERATION_EDIT]: now };
};

/** When a copy's operation was last edited, as its per-answer times say; 0 when they say nothing. */
export const stepAlgebraOperationEditedAt = (copy) => {
  const time = Number(copy?.fieldEditedAt?.[STEP_ALGEBRA_OPERATION_EDIT]);
  return time > 0 ? time : 0;
};

// An operation held and not applied: a tile chosen, its value, or a move staged.
const holdsOperation = (value) => Boolean(value?.armedTile || value?.pendingMove || String(value?.operand ?? '').trim());

/**
 * Whether this device's operation (`own`) outlives the merge of its copy with
 * the saved one (`saved`, merged into `merged`) when both hold the same
 * committed board:
 *   - only an operation this device edited, after the latest Start over any
 *     copy knows of and after the question's last submitted attempt
 *     (`canonicalAt`): one from before a Start over goes with it, wherever
 *     the Start over was pressed;
 *   - and no earlier than the saved copy's operation. A copy saved without an
 *     operation time (by an older build) is bounded by its own time instead:
 *     its operation was edited then or before.
 * A tie keeps this device's: the saved copy can be its own first save, merged
 * on the server with an older operation. A fresh copy the build before began,
 * holding an operation and no time, is dated by its own last save (above).
 */
export const keepsOwnStepAlgebraOperation = ({ own, saved, merged, canonicalAt = 0 }) => {
  const mine = stepAlgebraOperationEditedAt(own)
    // A fresh copy the build before began here (above): its own last save.
    || (own?.fieldsFresh === true && own.savedAtIsEdit === true && holdsOperation(own.value)
      && resetTimeOf(own) >= resetTimeOf(merged) ? Math.max(0, Number(own.savedAt) || 0) : 0);
  if (!mine) return false;
  if (mine <= Math.max(resetTimeOf(merged), Math.max(0, Number(canonicalAt) || 0))) return false;
  const theirs = stepAlgebraOperationEditedAt(saved)
    || (saved?.savedAtIsEdit === true ? Math.max(0, Number(saved?.savedAt) || 0) : 0);
  return mine >= theirs;
};
