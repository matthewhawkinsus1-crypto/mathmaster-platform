/*
 * IS THE LIVE EQUATION WHERE THE STUDENT CAN SEE IT?
 *
 * On desktop the identity bar, the assignment navigator and the sticky task
 * card cover roughly the top third of the window, and the action bar covers the
 * bottom ~90px. After a step commits the page can be left with the balance
 * board under that chrome: live QA at 1536×900 finished a simplification with
 * the page clamped at its bottom, the equation under the task card, and only
 * "Continue from the equation shown" in view.
 *
 * `rect` is the equals sign's bounding box — the centre of the board.
 */
export const COVERED_TOP_FRACTION = 1 / 3;
export const COVERED_BOTTOM_PX = 90;

export function workspaceNeedsReveal(rect, viewportHeight) {
  if (!rect || !(viewportHeight > 0)) return false;
  return rect.top < viewportHeight * COVERED_TOP_FRACTION || rect.bottom > viewportHeight - COVERED_BOTTOM_PX;
}
