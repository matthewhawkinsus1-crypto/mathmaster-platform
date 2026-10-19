/*
 * MATHLIVE'S LAZY RENDER CAN MISS AN ELEMENT THAT STARTS WITH NO WIDTH.
 *
 * <math-span>/<math-div> render when their own IntersectionObserver first
 * reports them on screen. An element that has not rendered yet has no content
 * and so no width, and when it mounts during interaction (a Step Algebra board
 * opened inside phone Work View) that observer never reported it: the board
 * read "LEFT SIDE = RIGHT SIDE" with nothing on either side (live QA round 2,
 * 390x844). A second look, a frame after mount and once more shortly after,
 * renders any element that is on screen and still empty. Off-screen elements
 * stay lazy.
 */
import { mathElementHasRendered } from './mathLiveCompat.js';

// The render-part lookup is a MathLive internal; it lives in mathLiveCompat.js.
export { mathElementHasRendered };

export function ensureMathElementRenders(element, win = typeof window === 'undefined' ? null : window) {
  if (!element || !win) return undefined;
  const nearViewport = () => {
    if (!element.isConnected || !element.getClientRects?.().length) return false;
    const box = element.getBoundingClientRect();
    return box.bottom >= -50 && box.top <= win.innerHeight + 50;
  };
  const ensure = () => {
    if (mathElementHasRendered(element) || !nearViewport()) return false;
    element.render?.();
    return true;
  };
  const observer = typeof win.IntersectionObserver === 'function'
    ? new win.IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) ensure();
      if (mathElementHasRendered(element)) observer.disconnect();
    }, { rootMargin: '50px' })
    : null;
  const frame = win.requestAnimationFrame?.(() => observer?.observe(element));
  const timer = win.setTimeout(ensure, 400);
  return () => {
    win.cancelAnimationFrame?.(frame);
    win.clearTimeout(timer);
    observer?.disconnect();
  };
}

/*
 * PRINTING TYPESETS EVERYTHING. A page printed before the student scrolled
 * through it (a worked solution, Review My Work) printed every formula that
 * had never been on screen as a blank: the lazy elements had no content
 * (student push J; the "blank Representation / inline $x$" report — on
 * screen they render when scrolled into view). Before printing, every
 * <math-span>/<math-div> that has not rendered is rendered now.
 */
export function renderPendingMathElements(root = typeof document === 'undefined' ? null : document) {
  if (!root?.querySelectorAll) return 0;
  let rendered = 0;
  root.querySelectorAll('math-span, math-div').forEach((element) => {
    if (mathElementHasRendered(element) || typeof element.render !== 'function') return;
    try {
      element.render();
      rendered += 1;
    } catch { /* an element MathLive cannot render stays as it was */ }
  });
  return rendered;
}

let printListenerInstalled = false;
export function installPrintMathRendering(win = typeof window === 'undefined' ? null : window) {
  if (printListenerInstalled || !win?.addEventListener) return false;
  printListenerInstalled = true;
  win.addEventListener('beforeprint', () => renderPendingMathElements(win.document));
  return true;
}

// Once, for every page that shows math (MathDisplay imports this module).
installPrintMathRendering();
