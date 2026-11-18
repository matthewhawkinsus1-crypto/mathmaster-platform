/*
 * TOASTS NEVER COVER THE ACTION BAR.
 *
 * On the assignment screen a toast rises above where the action bar actually
 * is (--mm-action-bar-clearance, App.css), not only by the bar's height: with
 * the compact navigator a short question leaves the bar above the bottom of
 * the screen, in the flow, and a toast lifted by the bar's height alone
 * landed on Submit at 1366×768.
 *
 * The clearance is measured while a toast is on screen, every frame, and only
 * then. Measured on a scroll, a resize or the page changing size, it went
 * stale whenever the bar arrived or moved without any of those, and CI's
 * studentScreenChange S7 found "That question has moved" over Submit at
 * 1366×768. A toast is up for seconds, and the frames stop with the last one.
 * A toast arriving is seen as it is added (a MutationObserver on the toast
 * viewport), so its first frame is already clear. Every bar on screen
 * counts: a toast clears the highest.
 */
import { writeStyleVariable } from './layoutWrites.js';

export const ACTION_BAR_CLEARANCE_VAR = '--mm-action-bar-clearance';
export const ACTION_BAR_SELECTOR = '.mathmaster-desktop-action-bar, .portrait-action-bar, .landscape-action-bar';
// Phones place toasts at the top of the screen (uiKit.css), where no
// clearance is read (App.css lifts them only above 640px).
const WIDE_SCREEN = '(min-width: 641px)';

/** How far above the bottom of the screen a toast clears every bar on screen: 0 when none is. */
export const actionBarClearance = (boxes, viewportHeight) => (boxes || []).reduce((highest, box) => (
  box && box.height > 0 && box.top < viewportHeight && box.bottom > 0
    ? Math.max(highest, Math.round(viewportHeight - box.top))
    : highest
), 0);

/**
 * Follows the clearance while a toast is shown. Returns the function that
 * stops, which removes the variable.
 */
export const followActionBarClearance = ({
  doc = typeof document === 'undefined' ? null : document,
  win = typeof window === 'undefined' ? null : window,
} = {}) => {
  if (!doc || !win) return () => {};
  const { style } = doc.documentElement;
  const viewport = doc.querySelector('.mm-toast-viewport');
  const wide = typeof win.matchMedia === 'function' ? win.matchMedia(WIDE_SCREEN) : null;
  let frame = 0;
  const measure = () => {
    if (wide && !wide.matches) return;
    const boxes = [...doc.querySelectorAll(ACTION_BAR_SELECTOR)].map((bar) => bar.getBoundingClientRect());
    writeStyleVariable(style, ACTION_BAR_CLEARANCE_VAR, `${actionBarClearance(boxes, win.innerHeight)}px`);
  };
  const tick = () => {
    frame = 0;
    if (!viewport?.querySelector('.mm-toast')) return;
    measure();
    frame = win.requestAnimationFrame(tick);
  };
  const follow = () => {
    if (!frame) frame = win.requestAnimationFrame(tick);
  };
  const Observer = win.MutationObserver || globalThis.MutationObserver;
  const observer = viewport && typeof Observer === 'function' ? new Observer(follow) : null;
  observer?.observe(viewport, { childList: true, subtree: true });
  follow();
  return () => {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    observer?.disconnect();
    writeStyleVariable(style, ACTION_BAR_CLEARANCE_VAR, null);
  };
};

export default followActionBarClearance;
