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
  const safeTop = Math.max(scrollerRect.top, stickyBottom) + safeMargin;

  // MathMaster's number keypad is fixed over the bottom of the screen, on top
  // of the workspace. A box "inside the scroller" can still be under the keys:
  // measured at 390×844, Linear Table Workbench's slope box sat 5px under the
  // keypad's top edge while the student typed into it. When the keypad covers
  // the box's column, the safe bottom is the keypad's top, not the scroller's.
  const keypadRect = documentObject?.querySelector?.('.mathmaster-mobile-numeric-keypad')?.getBoundingClientRect?.();
  const keypadCoversColumn = keypadRect && keypadRect.height > 0
    && keypadRect.left < targetRect.right && keypadRect.right > targetRect.left;
  const safeBottom = Math.min(scrollerRect.bottom, keypadCoversColumn ? keypadRect.top : scrollerRect.bottom) - safeMargin;

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
  }

  stabilizeHorizontalViewport({ root, windowObject, documentObject });
  return true;
};

export const mobileViewportLockSelector = LOCKED_CONTAINER_SELECTOR;
