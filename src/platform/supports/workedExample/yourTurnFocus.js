/*
 * WHERE THE CURSOR GOES ON "YOUR TURN" (WE-A).
 *
 * "Your turn" folds the example away, and the button the student pressed goes
 * with it. Focus must land somewhere they can act, never on the page body:
 *
 *   1. the first answer control of the question, where it takes a cursor;
 *   2. else the next empty answer field (a part-by-part question on its
 *      "Review all parts" screen, or one whose first control is read-only);
 *   3. else the Hint control, which brought the example and is always a
 *      button (the Work View Help drawer's copy of the panel lands here too,
 *      when the work behind the drawer takes no cursor).
 *
 * Plain DOM logic, so a node test can run it.
 */
import { answerControlAcceptsFocus, focusFirstAnswerControl, nextEmptyAnswerField } from '../../interaction/answerEntryUx.js';

const within = (root, element) => Boolean(root && element && element !== root && typeof root.contains === 'function' && root.contains(element));

/** Returns where focus went: 'answer', 'empty-field', 'hint-control' or null. */
export const focusAfterYourTurn = (root, {
  doc = typeof document !== 'undefined' ? document : null,
  focusFirst = focusFirstAnswerControl,
  nextEmpty = nextEmptyAnswerField,
  acceptsFocus = answerControlAcceptsFocus,
} = {}) => {
  if (!root) return null;
  if (focusFirst(root) && (!doc || within(root, doc.activeElement))) return 'answer';
  const empty = nextEmpty(root, null);
  if (empty && acceptsFocus(empty, doc) && typeof empty.focus === 'function') {
    empty.focus({ preventScroll: false });
    if (!doc || doc.activeElement === empty) return 'empty-field';
  }
  const hint = root.querySelector?.('[data-hint-control]') || doc?.querySelector?.('[data-hint-control]') || null;
  if (hint && typeof hint.focus === 'function') {
    hint.focus({ preventScroll: false });
    return 'hint-control';
  }
  return null;
};
