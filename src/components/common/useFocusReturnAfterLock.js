import { useEffect, useRef } from 'react';

/*
 * FOCUS COMES BACK WHEN A LOCK LIFTS (WCAG 2.4.3 Focus Order).
 *
 * While an answer is being checked the question's controls are locked — a
 * disabled <fieldset> and `inert` — so a second press cannot submit twice.
 * Locking a focused control blurs it: the browser drops focus to <body>. A
 * keyboard or screen-reader student pressing Check then heard nothing and had
 * to Tab from the top of the page to get back to their answer (keyboard
 * sweep S1: 24 of 24 graded scenes, docs/accessibility/KEYBOARD_SWEEP.md).
 *
 * This remembers where focus was and, when the lock ends with focus lost to
 * <body>, puts it back — only on an element that is still in the page and can
 * take focus again. A student who moved focus elsewhere meanwhile is left
 * where they are.
 */

const canTakeFocusAgain = (element) => Boolean(
  element
  && element.isConnected
  && typeof element.focus === 'function'
  && !element.disabled
  && !element.closest?.('[inert], fieldset[disabled]'),
);

export const useFocusReturnAfterLock = (locked) => {
  const lastFocused = useRef(null);
  const wasLocked = useRef(false);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const remember = (event) => { if (event.target && event.target !== document.body) lastFocused.current = event.target; };
    document.addEventListener('focusin', remember);
    return () => document.removeEventListener('focusin', remember);
  }, []);

  useEffect(() => {
    if (locked) { wasLocked.current = true; return undefined; }
    if (!wasLocked.current) return undefined;
    wasLocked.current = false;
    // After the unlock has rendered (the fieldset re-enabled).
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active && active !== document.body) return;
      if (canTakeFocusAgain(lastFocused.current)) lastFocused.current.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [locked]);
};

export default useFocusReturnAfterLock;
