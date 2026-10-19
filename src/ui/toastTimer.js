/*
 * A TOAST'S CLOCK, WHICH STOPS WHILE THE STUDENT IS READING IT
 * (student pass 3, NAV-10; WCAG 2.2.1 Timing Adjustable).
 *
 * A toast closed itself after five seconds whatever the student was doing —
 * a pointer resting on it, or keyboard focus on its close button, did not
 * keep it. Now the clock pauses while the toast is hovered or holds focus and
 * resumes with the time that was left when both end.
 *
 * Pure: the timer functions and the clock are passed in, so node tests drive
 * it with a fake clock.
 */
export const createToastTimer = ({
  ms,
  onExpire,
  setTimer = (fn, delay) => setTimeout(fn, delay),
  clearTimer = (handle) => clearTimeout(handle),
  now = () => Date.now(),
} = {}) => {
  let remaining = Math.max(0, Number(ms) || 0);
  let startedAt = null;
  let handle = null;
  let done = false;
  // Hover and focus are separate holds: the toast resumes when both end.
  const holds = new Set();

  const run = () => {
    if (done || handle !== null || holds.size) return;
    startedAt = now();
    handle = setTimer(() => {
      handle = null;
      done = true;
      onExpire?.();
    }, remaining);
  };
  const stop = () => {
    if (handle === null) return;
    clearTimer(handle);
    handle = null;
    remaining = Math.max(0, remaining - (now() - startedAt));
  };

  run();
  return {
    /** Hold the toast open for `reason` ('hover' | 'focus'). */
    pause(reason = 'hover') {
      if (done) return;
      holds.add(reason);
      stop();
    },
    /** Release one hold; the clock runs again when none is left. */
    resume(reason = 'hover') {
      holds.delete(reason);
      run();
    },
    cancel() {
      done = true;
      stop();
    },
    get remaining() { return handle === null ? remaining : Math.max(0, remaining - (now() - startedAt)); },
    get paused() { return holds.size > 0; },
  };
};

export default createToastTimer;
