/*
 * KEEP A KEYBOARD-FOCUSED CONTROL CLEAR OF THE STICKY ACTION BAR (WCAG 2.4.11
 * Focus Not Obscured; KEYBOARD_SWEEP S5).
 *
 * The assignment screen reserves room under its sticky Undo / Scratchpad /
 * Submit bar with `scroll-padding-bottom` keyed to its own wrapper class
 * (App.css). Every other host of QuestionEngine — My Math Path, Section
 * Recovery, Live Challenge, the rich runtime — has the same bar and no such
 * padding, so Tab could park a control underneath it (17 stops in 8 tools,
 * bare harness). A global scroll-padding fixed that and moved the page on an
 * Undo that was already in view (PR #454), so it was reverted.
 *
 * This is the narrow version: after the browser has scrolled a Tab-focused
 * control into view, measure. Only if the bar actually covers it is the page
 * scrolled — by exactly the overlap and a small gap. A control already in view
 * never moves anything, and a pointer focus never does either.
 */
export const ACTION_BAR_SELECTOR = '.mathmaster-desktop-action-bar';
export const ACTION_BAR_FOCUS_GAP = 12;

/**
 * How far to scroll down so `target` clears the bar, or 0. Rects are viewport
 * rects ({ top, bottom, left, right }). A bar that does not overlap the target
 * horizontally, or is not across the target's bottom edge, covers nothing.
 */
export const actionBarFocusOverlap = ({ target, bar, gap = ACTION_BAR_FOCUS_GAP } = {}) => {
  if (!target || !bar) return 0;
  const horizontal = target.right > bar.left && target.left < bar.right;
  const covered = horizontal && target.bottom > bar.top && target.top < bar.bottom;
  if (!covered) return 0;
  // Never push the control's top above the top of the viewport to do it: a
  // control taller than the space above the bar gets its top edge shown.
  return Math.max(0, Math.min(target.bottom - bar.top + gap, target.top));
};

const scrollParentOf = (element, win) => {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    const style = win.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
  }
  return null;
};

/**
 * Watch keyboard focus inside the host (`getHost()`, read at each focus, so a
 * host that re-renders a different tree is still covered) and scroll a covered
 * control clear of the host's own action bar. Returns the unbind function.
 */
export const bindActionBarFocusReveal = (getHost, { win = typeof window !== 'undefined' ? window : null } = {}) => {
  if (typeof getHost !== 'function' || !win?.document) return () => {};
  let frame = 0;
  // Which input moved focus last. `:focus-visible` alone misses a math field
  // (its focus lives in MathLive's shadow root, so the host never matches),
  // and those are exactly the answer boxes a Tab lands on.
  let keyboardLast = false;
  const onKeyDown = (event) => { if (event.key === 'Tab' || event.key === 'Enter' || event.key.startsWith('Arrow')) keyboardLast = true; };
  const onPointerDown = () => { keyboardLast = false; };
  const onFocusIn = (event) => {
    const target = event.target;
    const host = getHost();
    if (!host || !(target instanceof win.Element) || !host.contains(target)) return;
    // Keyboard focus only: a click never scrolls the page under the pointer.
    let keyboard = keyboardLast;
    try { keyboard = keyboard || target.matches(':focus-visible'); } catch { /* an engine without :focus-visible */ }
    if (!keyboard) return;
    if (target.closest(ACTION_BAR_SELECTOR)) return;
    win.cancelAnimationFrame(frame);
    // After the browser's own scroll-into-view for this focus.
    frame = win.requestAnimationFrame(() => {
      const bar = host.querySelector(ACTION_BAR_SELECTOR);
      if (!bar || win.document.activeElement !== target) return;
      const delta = actionBarFocusOverlap({ target: target.getBoundingClientRect(), bar: bar.getBoundingClientRect() });
      if (delta <= 0) return;
      const scroller = scrollParentOf(target, win);
      if (scroller && scroller.contains(bar)) scroller.scrollBy({ top: delta, left: 0, behavior: 'auto' });
      else win.scrollBy({ top: delta, left: 0, behavior: 'auto' });
    });
  };
  win.document.addEventListener('keydown', onKeyDown, true);
  win.document.addEventListener('pointerdown', onPointerDown, true);
  win.document.addEventListener('focusin', onFocusIn);
  return () => {
    win.cancelAnimationFrame(frame);
    win.document.removeEventListener('keydown', onKeyDown, true);
    win.document.removeEventListener('pointerdown', onPointerDown, true);
    win.document.removeEventListener('focusin', onFocusIn);
  };
};
