/*
 * READING IS ACTIVITY.
 *
 * The 120-second "Are you still working?" overlay listens for pointer moves,
 * clicks, touches, wheel and keydown. A screen-reader student reading the
 * question fires none of them: in browse mode NVDA, JAWS and VoiceOver consume
 * the arrow keys before the page sees a keydown. What the page DOES see as
 * they read is focus moving between controls (Tab, or the reader's "focus
 * follows the cursor"), the document scrolling to keep the reading cursor in
 * view, and the selection moving with it. Keyboard navigation reaches the page
 * as keyup as well as keydown (some readers pass only the release through).
 *
 * Every one of those now counts, so a student is never interrupted for
 * reading. The overlay's own appearance must not count: it focuses its
 * "I'm still here" button as it opens, and that focus would dismiss the
 * overlay the moment it rendered (the same trap the unmoved mousemove was).
 * Anything inside an element marked [data-idle-prompt] is ignored.
 */
export const IDLE_PROMPT_SELECTOR = '[data-idle-prompt]';

const fromIdlePrompt = (event) => {
  // selectionchange targets the document; what moved it is the focused element.
  const target = event?.type === 'selectionchange' ? event.target?.activeElement : event?.target;
  return Boolean(target && typeof target.closest === 'function' && target.closest(IDLE_PROMPT_SELECTOR));
};
export const READING_ACTIVITY_EVENTS = Object.freeze(['focusin', 'keyup', 'scroll', 'selectionchange']);

/** Subscribe `onActivity` to the reading signals; returns the unsubscribe. */
export const subscribeToReadingActivity = (target, onActivity) => {
  if (!target?.addEventListener || typeof onActivity !== 'function') return () => {};
  const options = { passive: true, capture: true };
  const handler = (event) => { if (!fromIdlePrompt(event)) onActivity(event); };
  const doc = target.document || target;
  const listeners = READING_ACTIVITY_EVENTS.map((type) => {
    // selectionchange fires on the document only.
    const on = type === 'selectionchange' ? doc : target;
    on.addEventListener(type, handler, options);
    return () => on.removeEventListener(type, handler, options);
  });
  return () => listeners.forEach((remove) => remove());
};
