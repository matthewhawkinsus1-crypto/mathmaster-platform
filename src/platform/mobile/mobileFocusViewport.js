// Horizontal viewport stability for mobile answer entry.
//
// The student question player is a stateful SPA inside several clipped/grid
// containers. On iOS/Chrome, focus and caret updates can still programmatically
// change scrollLeft on an overflow:hidden ancestor (or pan the layout viewport),
// even when no horizontal scrollbar is visible. That makes the whole question
// appear to "jump sideways" as the student types.
//
// Two rules:
// 1. Focus helpers may move a control vertically into view, never horizontally.
// 2. Page/question-level containers are always restored to scrollLeft = 0.
//    Tool-local horizontal scrollers are deliberately NOT touched.

const LOCKED_CONTAINER_SELECTOR = [
  '.mathmaster-question-container',
  '.question-prompt-panel',
  '.mathmaster-assignment-screen',
  '.mathmaster-assignment-shell',
  '.mathmaster-question-stage',
].join(',');

/*
 * In a staged question's Work View the surface does not scroll — the active
 * step's body does (`.workflow-focus__workspace-body`, or the active stage
 * itself beside a persistent graph; WorkViewShell.css). Without them the
 * nearest scroller found was the page's `.math-tool-workspace` BEHIND the
 * modal, so the box being typed into stayed where the keypad had pushed it:
 * at 390x844, a table stage's row 7 sat at y 547-591 with the keys at 570 and
 * the step body ending at 391 — typed into, and nowhere on screen (PQ-037).
 * Embedded, neither element scrolls (overflow visible), so the search walks
 * past them exactly as before.
 */
const VERTICAL_SCROLL_SELECTOR = [
  '.question-prompt-panel',
  '.workflow-focus__active-stage',
  '.workflow-focus__workspace-body',
  '.mathmaster-work-view-surface',
  '.math-tool-workspace',
  '.mathmaster-mobile-local-scroll',
].join(',');

const numberOrZero = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const pinchZoomed = (windowObject) => Number(windowObject?.visualViewport?.scale || 1) > 1.02;

const setScrollLeftZero = (element) => {
  if (!element) return;
  try {
    if (Math.abs(numberOrZero(element.scrollLeft)) > 0.5) element.scrollLeft = 0;
  } catch {
    // A detached or browser-owned node may reject a write during teardown.
  }
};

const lockedAncestors = (root) => {
  const found = new Set();
  let current = root;
  while (current) {
    if (current.matches?.(LOCKED_CONTAINER_SELECTOR)) found.add(current);
    current = current.parentElement;
  }
  return [...found];
};

/**
 * Undo browser/MathLive horizontal panning without changing vertical position.
 */
export const stabilizeHorizontalViewport = ({
  root = null,
  windowObject = typeof window !== 'undefined' ? window : null,
  documentObject = typeof document !== 'undefined' ? document : null,
} = {}) => {
  if (!windowObject || !documentObject) return false;
  // During pinch zoom, horizontal visual-viewport movement is the student's
  // magnifying-glass pan. Never interpret it as an accidental caret jump and
  // snap it back to x=0.
  if (pinchZoomed(windowObject)) return false;

  const page = documentObject.scrollingElement || documentObject.documentElement || documentObject.body;
  setScrollLeftZero(page);
  setScrollLeftZero(documentObject.documentElement);
  setScrollLeftZero(documentObject.body);
  setScrollLeftZero(root);

  lockedAncestors(root).forEach(setScrollLeftZero);

  // These are page-level student workspaces, not intentional horizontal
  // scrollers. A browser can pan one of them directly to keep a caret visible
  // even when its CSS says overflow-x: clip. Reset them explicitly so the
  // correction does not depend on which ancestor the browser chose.
  root?.querySelectorAll?.(
    '.mathmaster-question-tool-workspace, .workflow-focus__workspace, .workflow-focus__active-stage',
  )?.forEach?.(setScrollLeftZero);

  const top = numberOrZero(windowObject.scrollY ?? page?.scrollTop);
  const left = numberOrZero(windowObject.scrollX ?? page?.scrollLeft);
  if (Math.abs(left) > 0.5) {
    try {
      windowObject.scrollTo({ left: 0, top, behavior: 'auto' });
    } catch {
      windowObject.scrollTo?.(0, top);
    }
  }

  return true;
};

/**
 * Run after the current event and again on the next paint. MathLive may update
 * its caret scroll in a microtask/animation frame after the key event itself.
 */
export const scheduleHorizontalViewportStabilization = ({
  root = null,
  windowObject = typeof window !== 'undefined' ? window : null,
  documentObject = typeof document !== 'undefined' ? document : null,
} = {}) => {
  if (!windowObject || !documentObject) return;

  const run = () => stabilizeHorizontalViewport({ root, windowObject, documentObject });

  if (typeof queueMicrotask === 'function') queueMicrotask(run);
  else Promise.resolve().then(run);

  windowObject.requestAnimationFrame?.(run);
};

/**
 * Bring the focused control into view by changing only scrollTop on its nearest
 * local vertical scroller. Never call scrollIntoView() here: browsers are free
 * to pan horizontally when inline:'nearest' is used, including on clipped
 * ancestors with no visible horizontal scrollbar.
 */
/*
 * The nearest candidate that can actually scroll. `.mathmaster-work-view-surface`
 * is a scroller only while Work View is enlarged; closed, it is an ordinary
 * box with `overflow: visible`, and scrolling it did nothing — the real
 * scroller (the phone's `.math-tool-workspace`) sits further out. Measured at
 * 390×844 with the number keypad open: the focused box stayed under the keys.
 */
const nearestVerticalScroller = (target, windowObject) => {
  let candidate = target?.closest?.(VERTICAL_SCROLL_SELECTOR) || null;
  while (candidate) {
    const overflowY = windowObject?.getComputedStyle?.(candidate)?.overflowY;
    // No computed style (tests, detached nodes): trust the selector.
    if (!overflowY || overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return candidate;
    candidate = candidate.parentElement?.closest?.(VERTICAL_SCROLL_SELECTOR) || null;
  }
  return null;
};

/*
 * THE PART OF THE PAGE THE STUDENT CAN SEE WITH THE SCREEN KEYBOARD UP (PH05,
 * findings B-68, C2-76).
 *
 * The keyboard takes its room from the visual viewport, and on Android Chrome
 * and iOS only from that: the layout viewport, and every box measured by
 * getBoundingClientRect, keeps its size, so a box can sit "inside its scroller"
 * and below the keyboard at once. At 390×480 the focused box showed 11 of its
 * 70px. Rects are in layout coordinates and the visual viewport sits at
 * (offsetTop) inside them. While pinch-zoomed it is a magnifying glass over an
 * unchanged page (pinchZoomReveal.js), not a keyboard, so it is ignored there.
 */
const visibleBand = (windowObject) => {
  const visual = windowObject?.visualViewport;
  const height = numberOrZero(visual?.height);
  if (!visual || height <= 0 || pinchZoomed(windowObject)) return { top: -Infinity, bottom: Infinity };
  const top = numberOrZero(visual.offsetTop);
  return { top, bottom: top + height };
};

/*
 * WHAT THE LOCAL SCROLLER CANNOT DO, THE PAGE DOES (WCAG 2.4.11).
 *
 * The phone's question frame is a screen tall. Where a page puts something
 * above it (My Math Path's session, under its own header), the frame's last
 * rows are below the screen until the page itself scrolls. With the number
 * keypad up, Tab past the last box reached Submit and "Show a hint" at the end
 * of the work, and the work was already scrolled to its end: "Show a hint"
 * stayed under the keys, measured at 390x844 (the button at y 678 to 722, the
 * keys from 570). So after the local scroll, whatever still sits under the
 * keypad or below the screen is brought up by scrolling the page, vertically
 * only and never past the control's own top edge. Nothing moves when the local
 * scroll was enough, which is every question on the assignment screen (its
 * frame fits the screen). A control in a fixed layer (Work View, a tool's
 * drawer) does not move with the page, and the page beneath one must not move
 * (review of #463), so it is left alone, and so is a pinch-zoomed page (a
 * magnifying glass).
 */
const revealBelowByPage = (target, { screenBottom, screenTop, windowObject }) => {
  if (typeof windowObject?.scrollBy !== 'function' || pinchZoomed(windowObject)) return false;
  for (let node = target; node; node = node.parentElement) {
    if (windowObject.getComputedStyle?.(node)?.position === 'fixed') return false;
  }
  const rect = target.getBoundingClientRect?.();
  if (!rect) return false;
  const short = numberOrZero(rect.bottom) - screenBottom;
  if (!(short > 0.5)) return false;
  const step = Math.min(short, Math.max(0, numberOrZero(rect.top) - screenTop));
  if (!(step > 0.5)) return false;
  windowObject.scrollBy({ top: step, left: 0, behavior: 'auto' });
  return true;
};

export const scrollFocusedControlVertically = (
  target,
  {
    root = null,
    margin = 12,
    windowObject = typeof window !== 'undefined' ? window : null,
    documentObject = typeof document !== 'undefined' ? document : null,
  } = {},
) => {
  if (!target?.getBoundingClientRect) return false;

  const scroller = nearestVerticalScroller(target, windowObject) || root;
  if (!scroller?.getBoundingClientRect) {
    stabilizeHorizontalViewport({ root, windowObject, documentObject });
    return false;
  }

  const targetRect = target.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const safeMargin = Math.max(0, numberOrZero(margin));

  // While editing in mobile Work View the first split panel can be a sticky
  // graph/reference. Do not scroll the active field underneath that reference:
  // reserve the visible sticky panel's bottom edge as the top of the safe area.
  const workViewSurface = target.closest?.('.mathmaster-work-view-surface');
  const stickyReference = workViewSurface?.querySelector?.('.mathmaster-tool-split > .mathmaster-tool-panel:first-child');
  const stickyStyle = stickyReference && windowObject?.getComputedStyle?.(stickyReference);
  const stickyRect = stickyReference?.getBoundingClientRect?.();
  const stickyBottom = stickyReference
    && !stickyReference.contains(target)
    && stickyStyle?.position === 'sticky'
    && stickyRect?.height > 0
    ? Math.min(scrollerRect.bottom, stickyRect.bottom)
    : scrollerRect.top;
  const band = visibleBand(windowObject);
  const safeTop = Math.max(scrollerRect.top, stickyBottom, band.top) + safeMargin;

  // MathMaster's number keypad is fixed over the bottom of the screen, on top
  // of the workspace. A box "inside the scroller" can still be under the keys:
  // measured at 390×844, Linear Table Workbench's slope box sat 5px under the
  // keypad's top edge while the student typed into it. When the keypad covers
  // the box's column, the safe bottom is the keypad's top, not the scroller's.
  const keypadRect = documentObject?.querySelector?.('.mathmaster-mobile-numeric-keypad')?.getBoundingClientRect?.();
  const keypadCoversColumn = keypadRect && keypadRect.height > 0
    && keypadRect.left < targetRect.right && keypadRect.right > targetRect.left;
  const safeBottom = Math.min(scrollerRect.bottom, keypadCoversColumn ? keypadRect.top : scrollerRect.bottom, band.bottom) - safeMargin;

  let deltaY = 0;
  if (targetRect.top < safeTop) {
    deltaY = targetRect.top - safeTop;
  } else if (targetRect.bottom > safeBottom) {
    deltaY = targetRect.bottom - safeBottom;
  }

  if (Math.abs(deltaY) > 0.5) {
    const originalLeft = numberOrZero(scroller.scrollLeft);
    try {
      scroller.scrollBy({ top: deltaY, left: 0, behavior: 'auto' });
    } catch {
      scroller.scrollTop = numberOrZero(scroller.scrollTop) + deltaY;
      scroller.scrollLeft = originalLeft;
    }
    if (deltaY > 0) {
      const screenBottom = Math.min(
        keypadCoversColumn ? keypadRect.top : Infinity,
        band.bottom,
        numberOrZero(windowObject?.innerHeight) || Infinity,
      ) - safeMargin;
      revealBelowByPage(target, { screenBottom, screenTop: Math.max(0, band.top) + safeMargin, windowObject });
    }
  }

  stabilizeHorizontalViewport({ root, windowObject, documentObject });
  return true;
};

const TYPING_SURFACE = 'input, textarea, select, math-field, [contenteditable=""], [contenteditable="true"]';

/**
 * THE KEYBOARD OPENS AFTER FOCUS LANDS (PH05).
 *
 * Focus runs the reveal above once, before the keyboard is on screen, when
 * nothing needs to move. Then the keyboard slides up, the visible height drops
 * from 844 to 480, and the box being typed into is left below it. Run again
 * when the visible height changes and a typing surface in `root` has focus.
 * Anything else focused (a button, a link) or focus outside the question is
 * left alone: the keyboard does not make that scroll.
 */
export const revealFocusedControlAfterResize = ({
  root = null,
  windowObject = typeof window !== 'undefined' ? window : null,
  documentObject = typeof document !== 'undefined' ? document : null,
} = {}) => {
  const active = documentObject?.activeElement;
  if (!active || !root?.contains?.(active) || !active.matches?.(TYPING_SURFACE)) return false;
  return scrollFocusedControlVertically(active, { root, windowObject, documentObject });
};

/*
 * FOCUS THAT LEAVES THE QUESTION CLOSES THE NUMBER KEYPAD (student-a11y-3).
 *
 * The keypad is a software keyboard for the box that has focus, and it stays
 * up while focus moves on to a button inside the question: Step Algebra
 * commits a move from its number box to "Apply to both sides", and closing it
 * on the way re-rendered the editor before the press counted
 * (MobileViewportContainer handleFocusCapture). But it stayed up when focus left
 * the question altogether, for a control the question does not hold and no
 * reveal of the question's scrolls: after a My Math Path question was
 * submitted, Tab went on from it to the session's "Next question", which sat
 * under the keypad (WCAG 2.4.11). Focus moving to an element outside the
 * question's root is leaving the question, and a software keyboard closes
 * when its box is left. Focus going nowhere (to the page or the browser)
 * leaves the keypad as it was.
 */
export const focusLeavesQuestion = (root, nextFocus) => Boolean(
  root && nextFocus && nextFocus.nodeType === 1 && typeof root.contains === 'function' && !root.contains(nextFocus),
);

/*
 * TAB OFF THE NUMBER KEYPAD GOES ON TO THE WORK BAR (student-keyboard-ci).
 *
 * On a phone held upright the open keypad takes the work bar's place: the bar
 * is hidden under it (MathToolMobileLayout.css), which suits a finger, since
 * the keys sit where the bar was, and Done brings the bar back. By keyboard,
 * Tab from the keypad's last key went on past the hidden bar, out of the
 * question, and the keypad then closed behind it: going forward, Tab never
 * stopped on Submit once an answer was typed, nor on Start over, the
 * Scratchpad, the Calculator or the hint button (the keyboard sweep on a
 * phone: a table, a graph, a function graph and a function investigation).
 * Only Shift+Tab, once the keypad had gone, came back to them. Tab off the
 * keypad's last key now closes the keypad, as Done does, and goes on to the
 * bar's first control, which is what follows the work.
 *
 * This picks that control. Null leaves Tab to the browser, as before: another
 * key, Shift+Tab or a key held with another, a key of the keypad that is not
 * its last, or a bar with nothing that takes focus.
 */
const BAR_CONTROL = 'button, a[href], input, select, textarea, [tabindex]';
export const workBarControlAfterKeypad = (event, keypad, bar) => {
  if (!event || event.key !== 'Tab' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return null;
  const keys = [...(keypad?.querySelectorAll?.('button') || [])];
  if (!keys.length || event.target !== keys[keys.length - 1]) return null;
  return [...(bar?.querySelectorAll?.(BAR_CONTROL) || [])]
    .find((control) => !control.disabled && Number(control.tabIndex) >= 0 && !control.closest?.('[inert], [aria-hidden="true"]')) || null;
};

export const mobileViewportLockSelector = LOCKED_CONTAINER_SELECTOR;
