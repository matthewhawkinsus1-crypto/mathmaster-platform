/*
 * THE STUDENT'S OTHER SCREENS, FETCHED WHILE HOME IS IDLE (PF01).
 *
 * Grades, Assignments, Rewards and an assignment's result load on demand
 * (app/lazyScreens.js): about 16 KB gzip that a student needs only after
 * opening one of them, kept off the first load. Once Home has rendered, App
 * hands them here and their code is fetched the next time the browser is
 * idle, so opening one is as quick as it was:
 *
 *   - once per page: after that the code is in the page (a screen opened
 *     while it is on its way shares the same request);
 *   - never when the device asks to save data (navigator.connection.saveData):
 *     each screen's code then arrives only when it is opened;
 *   - not while the device is offline: the browser would remember the failed
 *     request for the life of the page (platform/runtime/retryableChunk.js),
 *     so it waits until the device is back online.
 *
 * Plain JS, no React, so node tests drive it with a fake window.
 */

// As Home's prefetch of the question runtime (App.jsx).
export const IDLE_TIMEOUT_MS = 5000;
export const NO_IDLE_CALLBACK_DELAY_MS = 2000;

/** The device asks to save data (the Network Information API's saveData). */
export const savesData = (win) => Boolean(win?.navigator?.connection?.saveData);

/**
 * A prefetch that runs at most once. The function it returns asks for each
 * screen's `prefetch()` when the browser is next idle, and returns a cancel
 * for the effect that asked (Home left before then: nothing was fetched, so a
 * later visit to Home asks again).
 */
export const createIdlePrefetch = () => {
  let started = false;
  return (screens = [], win = typeof window !== 'undefined' ? window : null) => {
    if (started || !win || savesData(win)) return () => {};
    let idle = null;
    let timer = null;
    let waitingForOnline = false;
    const run = () => {
      idle = null;
      timer = null;
      if (started) return;
      if (win.navigator?.onLine === false) {
        waitingForOnline = true;
        win.addEventListener('online', schedule, { once: true });
        return;
      }
      started = true;
      screens.forEach((screen) => screen?.prefetch?.());
    };
    function schedule() {
      waitingForOnline = false;
      if (typeof win.requestIdleCallback === 'function') idle = win.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
      else timer = win.setTimeout(run, NO_IDLE_CALLBACK_DELAY_MS);
    }
    schedule();
    return () => {
      if (idle !== null) win.cancelIdleCallback?.(idle);
      if (timer !== null) win.clearTimeout(timer);
      if (waitingForOnline) win.removeEventListener('online', schedule);
    };
  };
};

/** App's, once per page. */
export const prefetchStudentScreens = createIdlePrefetch();
