import { isDesktopStickyLayout, pinnedBottom, revealBelowSticky } from '../layout/stickyReveal.js';

/*
 * A STEP THE STUDENT MOVES TO SHOULD OPEN WHERE THEY CAN SEE IT.
 *
 * "Next step" only changed which stage was active, so the new stage rendered
 * wherever the old one had been scrolled to. On a Chromebook that was under the
 * sticky task and "Current question" cards: Step 2's equation field sat behind
 * them with only its math keypad showing (live QA, Algebra I DOL #2, 1366×768).
 *
 * After a student-initiated step change, the step's card is brought to just
 * below the pinned task card on desktop, and the step's answer area into view
 * on a phone (below). Work View is left alone: its dialog is its own scroller
 * with no sticky stack.
 */
export const bringActiveStageIntoView = (root, { win = typeof window !== 'undefined' ? window : null } = {}) => {
  if (!root) return false;
  if (root.closest?.('[role="dialog"]')) return false;
  if (!isDesktopStickyLayout(win)) {
    // Two frames on: tapping "Next step" focused it, and the phone container
    // keeps a focused control in view one frame after focus
    // (MobileViewportContainer, scrollFocusedControlVertically). Run first,
    // the reveal was undone by it — the box scrolled back down to the button.
    if (typeof win?.requestAnimationFrame !== 'function') return revealActiveStageOnPhone(root, win);
    win.requestAnimationFrame(() => win.requestAnimationFrame(() => revealActiveStageOnPhone(root, win)));
    return true;
  }
  // The workspace card carries the step's heading ("Step 2. Write the
  // equation · 2 of 5") above the active stage, so it is what lines up.
  const stage = root.querySelector?.('.workflow-focus__workspace')
    || root.querySelector?.('.workflow-focus__stage-shell--active');
  if (!stage) return false;
  const sticky = root.ownerDocument?.querySelector?.('.mathmaster-desktop-question-anchor') || null;
  return revealBelowSticky({ target: stage, sticky, win });
};

/*
 * ON A PHONE, THE STEP'S ANSWER AREA.
 *
 * A phone has no sticky stack, and it had the same failure. Upright, the
 * question scrolls in its own box (MobileViewportContainer's workspace, between
 * the task and the action bar: 226px of a 390×664 screen), and "Next step" left
 * that box where the old step had it. From the Yes/No step, "Mark every
 * x-intercept" opened with its plane scrolled out above the box and only
 * "0 of 2 marked." in view; "Where is this function increasing" opened with
 * its choices above it. On its side the page itself scrolls, under the
 * identity bar.
 *
 * So the active stage — the step's own controls, below its heading and any
 * graph shown for reference — is brought into whatever scrolls it, as little as
 * possible: a stage already in view stays put, one below the view rises until
 * its last control is in, and one above the view, or taller than it (a plane),
 * lines up its top. The question needs no room kept for it here: it is in its
 * own panel (upright) or column (on its side).
 */
const PHONE_VIEW_MARGIN = 8;

const scrollParentOf = (element, win) => {
  const page = win?.document?.scrollingElement || win?.document?.documentElement || null;
  for (let node = element?.parentElement; node && node !== page && node !== win?.document?.body; node = node.parentElement) {
    const overflowY = win?.getComputedStyle?.(node)?.overflowY;
    const scrolls = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
    if (scrolls && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return null;
};

export const revealActiveStageOnPhone = (root, win = typeof window !== 'undefined' ? window : null) => {
  const target = root?.querySelector?.('.workflow-focus__active-stage');
  if (!target?.getBoundingClientRect || !win) return false;
  const scroller = scrollParentOf(target, win);
  // The page scrolls instead (a phone on its side): only what is pinned at the
  // top of the window — the identity bar, and the navigator where it is pinned
  // — covers the step.
  const view = scroller?.getBoundingClientRect?.() || {
    top: pinnedBottom(root.ownerDocument?.querySelector?.('.mathmaster-assignment-unified-nav') || null, win),
    bottom: Number(win.innerHeight) || 0,
  };
  const top = view.top + PHONE_VIEW_MARGIN;
  const bottom = view.bottom - PHONE_VIEW_MARGIN;
  if (!(bottom > top)) return false;
  const box = target.getBoundingClientRect();
  let delta = 0;
  if (box.top < top || box.height > bottom - top) delta = box.top - top;
  else if (box.bottom > bottom) delta = box.bottom - bottom;
  if (Math.abs(delta) < 2) return false;
  const owner = scroller || win;
  if (typeof owner.scrollBy !== 'function') return false;
  owner.scrollBy({ top: delta, left: 0, behavior: 'auto' });
  return true;
};
