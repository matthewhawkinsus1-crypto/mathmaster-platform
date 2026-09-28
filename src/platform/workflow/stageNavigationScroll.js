import { isDesktopStickyLayout, revealBelowSticky } from '../layout/stickyReveal.js';

/*
 * A STEP THE STUDENT MOVES TO SHOULD OPEN WHERE THEY CAN SEE IT.
 *
 * "Next step" only changed which stage was active, so the new stage rendered
 * wherever the old one had been scrolled to. On a Chromebook that was under the
 * sticky task and "Current question" cards: Step 2's equation field sat behind
 * them with only its math keypad showing (live QA, Algebra I DOL #2, 1366×768).
 *
 * After a student-initiated step change, the step's card is brought to just
 * below the pinned task card. Desktop only — the sticky stack is a desktop
 * layout, and phones keep their own keyboard-aware viewport handling. Work View
 * is left alone: its dialog is its own scroller with no sticky stack.
 */
export const bringActiveStageIntoView = (root, { win = typeof window !== 'undefined' ? window : null } = {}) => {
  if (!root || !isDesktopStickyLayout(win)) return false;
  if (root.closest?.('[role="dialog"]')) return false;
  // The workspace card carries the step's heading ("Step 2. Write the
  // equation · 2 of 5") above the active stage, so it is what lines up.
  const stage = root.querySelector?.('.workflow-focus__workspace')
    || root.querySelector?.('.workflow-focus__stage-shell--active');
  if (!stage) return false;
  const sticky = root.ownerDocument?.querySelector?.('.mathmaster-desktop-question-anchor') || null;
  return revealBelowSticky({ target: stage, sticky, win });
};
