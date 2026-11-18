/*
 * AN OPENER THAT LOST FOCUS BECAUSE IT WAS DISABLED, KEPT FOR 4 SECONDS ONLY.
 *
 * The Scratchpad button greys out while its overlay loads, so the dialog it
 * opens finds focus already on <body>. Dialog.jsx's document `focusout`
 * listener remembers such a button, and a dialog that opens within 4 s of it
 * borrows it as the element to return focus to (PR #454 review M1). Only that
 * case: a press that never took focus at all (Safari, iPadOS) leaves nothing
 * here, so closing never jumps to whatever was focused long before.
 *
 * The record was a module-level object that nothing ever cleared. It was read
 * only within the 4 s, but it kept the element, and through it the element's
 * whole detached tree, until the next disabled control lost focus: about 230
 * DOM nodes of a closed lesson, held at Home (the student-runtime memory pass,
 * docs/handoffs/NOVEMBER_BUILD_2026-11.md section 6). Now it is forgotten once
 * the 4 s have passed. Within them nothing changes: `recent()` answers exactly
 * as the old check did (the element while `now - at <= 4000`, else null).
 *
 * The clock and the timer are injectable so tests/platform can prove both.
 */
export const DISABLED_OPENER_WINDOW_MS = 4000;

export const createDisabledOpenerMemory = ({
  now = () => Date.now(),
  setTimer = (callback, ms) => setTimeout(callback, ms),
  clearTimer = (timer) => clearTimeout(timer),
  windowMs = DISABLED_OPENER_WINDOW_MS,
} = {}) => {
  let record = null;
  let timer = null;

  // Fires just after the window. A wall clock set back meanwhile (Date.now()
  // is not monotonic) would still let `recent()` answer, so the record stays
  // for exactly as long as it can be read, and goes the moment it cannot.
  const expire = () => {
    timer = null;
    if (!record) return;
    const left = record.at + windowMs - now();
    if (left >= 0) {
      timer = setTimer(expire, left + 1);
      return;
    }
    record = null;
  };

  return {
    /** A control that was focused lost focus because it was disabled. */
    remember(element) {
      if (timer != null) clearTimer(timer);
      record = { element, at: now() };
      timer = setTimer(expire, windowMs + 1);
    },
    /** That control, if it lost focus within the window; else null. */
    recent() {
      return record && now() - record.at <= windowMs ? record.element : null;
    },
    /** What the memory still holds, read or not (for tests). */
    held() {
      return record ? record.element : null;
    },
  };
};
