/*
 * MEASURE NOW, AND PUBLISH WHAT A RESIZEOBSERVER REPORTS IN THE NEXT FRAME.
 *
 * A callback that writes what it measures onto the page can resize, inside
 * the observer's delivery, elements other observers watch; what that resize
 * reports cannot be delivered in the same pass, and the browser fires
 * "ResizeObserver loop completed with undelivered notifications" at the page.
 * The Work View button's room met it (P-5, openerPlacement.js
 * observeOpenerRoom, which does the same for that button). So did the student
 * identity bar's height: on a phone the assignment screen is sized from it
 * (100dvh less the bar, App.css), so a bar re-wrapped by 200% text or by
 * turning the phone, published from inside its observer, resized the whole
 * assignment screen while observers were still being delivered. With Work
 * View open, on the Systems Workspace's construct question at 390×844 and
 * CI's fonts, that was two loop errors in every cycle of text size and turns.
 *
 * So the first measurement is made at once (a layout effect: before the first
 * paint), and an observed change is published in the next animation frame,
 * once however many changes arrive before it. A callback cannot re-enter
 * itself, and the resize its writes cause is observed in the next pass like
 * any other change.
 *
 *   targets   the elements whose size decides what is published
 *   publish   measures them and writes the result
 * Returns the function that stops observing (and drops a pending frame).
 */
export const observeThenPublish = ({
  targets = [],
  publish,
  ResizeObserverClass = typeof ResizeObserver === 'function' ? ResizeObserver : null,
  requestFrame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (callback) => setTimeout(callback, 16),
  cancelFrame = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout,
} = {}) => {
  publish();
  if (typeof ResizeObserverClass !== 'function') return () => {};
  let frame = null;
  const observer = new ResizeObserverClass(() => {
    if (frame !== null) return;
    frame = requestFrame(() => {
      frame = null;
      publish();
    });
  });
  targets.filter(Boolean).forEach((target) => observer.observe(target));
  return () => {
    if (frame !== null) cancelFrame(frame);
    frame = null;
    observer.disconnect();
  };
};

export default observeThenPublish;
