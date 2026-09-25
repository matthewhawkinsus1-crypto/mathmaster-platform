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
export const mathElementHasRendered = (element) => Boolean(
  element?.shadowRoot?.querySelector?.('[part="render"]')?.childElementCount,
);

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
