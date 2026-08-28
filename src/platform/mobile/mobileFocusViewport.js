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

const VERTICAL_SCROLL_SELECTOR = [
  '.question-prompt-panel',
  '.math-tool-workspace',
  '.mathmaster-mobile-local-scroll',
].join(',');

const numberOrZero = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

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

  const scroller = target.closest?.(VERTICAL_SCROLL_SELECTOR) || root;
  if (!scroller?.getBoundingClientRect) {
    stabilizeHorizontalViewport({ root, windowObject, documentObject });
    return false;
  }

  const targetRect = target.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const safeMargin = Math.max(0, numberOrZero(margin));

  let deltaY = 0;
  if (targetRect.top < scrollerRect.top + safeMargin) {
    deltaY = targetRect.top - (scrollerRect.top + safeMargin);
  } else if (targetRect.bottom > scrollerRect.bottom - safeMargin) {
    deltaY = targetRect.bottom - (scrollerRect.bottom - safeMargin);
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
