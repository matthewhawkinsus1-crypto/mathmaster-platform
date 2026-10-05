/*
 * A STUDENT'S OWN CLICK, TAP OR KEY OUTRANKS EVERY DEFERRED FOCUS.
 *
 * A question puts the cursor in a box LATE, never in the same event that made
 * the box: its opening autofocus and the cursor a cross-device restore puts
 * back both wait for an animation frame (the fields must exist first), a
 * registry tool's autofocus does the same, and MathLive focuses a field's
 * keyboard sink 60 ms after anything focuses the field. Each of those is a
 * request made BEFORE the student acted, carried out AFTER.
 *
 * Reproduced on main and on PR #435 (`draftCrossDeviceJourneys` `directions`):
 *
 *   1. A server copy from another Chromebook arrives; App remounts the
 *      question to show it, and QuestionEngine asks for the cursor back in the
 *      box the student had (restoreAnswerFocus, one frame later).
 *   2. That focus wakes MathLive, which queues its own focus of the same box,
 *      60 ms later.
 *   3. The student sees the restored work and clicks the OTHER box 40-100 ms
 *      after it appeared. The click focuses that box. Correct so far.
 *   4. The older deferred focus fires — the frame on a busy Chromebook, or
 *      MathLive's 60 ms timer on any machine — and pulls focus back to the
 *      restored box.
 *   5. The next keystrokes go there: "-2/3" becomes "-2/34", over the restored
 *      answer, and the box the student chose stays empty.
 *
 * THE RULE. A deferred focus belongs to the moment it was requested. When it
 * fires it may move the cursor only if that moment is still the present:
 *
 *   - this question (this mount, this generation) is still on screen;
 *   - no newer request for the same purpose has superseded this one (a newer
 *     restore replaces an older restore; a tool's own focus is not replaced
 *     by the question re-running its opening, or the other way round);
 *   - the student has not pressed, tapped, clicked or used the keyboard since
 *     the request's generation began (or since the request, for a focus that
 *     is the direct consequence of a key the student just pressed);
 *   - nothing else has moved focus since — a screen reader, Work View opening
 *     its dialog, a tool of its own accord. Their focus is not stale; ours is.
 *
 * Otherwise the request does nothing. No sleeps, no retries, and never a blur:
 * the request is dropped before it can move anything. MathLive's own 60 ms
 * focus is dropped the same way, at the field (guardStaleMathFieldFocus in
 * mathFieldFocusHandoff.js), because no frame of ours runs when it fires.
 *
 * WHAT COUNTS AS THE STUDENT ACTING (isExplicitStudentInteraction). A trusted
 * pointerdown, mousedown or touchstart anywhere on the page — mouse, pen,
 * finger — and a trusted keydown: Tab and Shift+Tab always (moving between
 * controls is a choice of where to be), any other key when it is aimed at
 * something. A key typed while focus is nowhere (the remount took the old box
 * away) has no destination of its own: it is on its way to wherever the
 * restore puts the cursor back, so it does not cancel the restore. Modifier
 * keys alone (Shift held before Tab) are not an action. Synthetic events
 * (`isTrusted` false) never count: the app's own `element.click()` is not the
 * student.
 *
 * Listened for on the document in the capture phase, so the press is recorded
 * before any handler under it — MathLive's, the focus hand-off's — can start
 * its own deferred focus. The listeners and the count belong to one authority,
 * and an authority belongs to one question mount: an interaction on question 3
 * says nothing about question 4, which starts a generation of its own.
 */
import { deepActiveElement } from './mathFieldFocusHandoff.js';

const POINTER_EVENTS = Object.freeze(['pointerdown', 'mousedown', 'touchstart']);
const INTERACTION_EVENTS = Object.freeze([...POINTER_EVENTS, 'keydown']);
const MODIFIER_KEYS = new Set([
  'Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'OS', 'Super', 'Hyper',
  'CapsLock', 'NumLock', 'ScrollLock', 'Fn', 'FnLock',
]);

const isPageBackground = (element, documentObject) => (
  !element || element === documentObject?.body || element === documentObject?.documentElement
);

/** Whether an event is the student acting (see the comment above). */
export const isExplicitStudentInteraction = (event, documentObject = typeof document !== 'undefined' ? document : null) => {
  if (!event || event.isTrusted !== true) return false;
  if (POINTER_EVENTS.includes(event.type)) return true;
  if (event.type !== 'keydown') return false;
  if (MODIFIER_KEYS.has(event.key)) return false;
  if (event.key === 'Tab') return true;
  const target = event.composedPath?.()?.[0] || event.target;
  return !isPageBackground(target, documentObject);
};

// Monotonic across every authority on the page: a generation number is never
// reused, so a ticket can never be mistaken for one from a later mount.
let generations = 0;

/**
 * One question mount's say over deferred focus.
 *
 *   start()          begin a generation (listeners on, nothing seen yet)
 *   stop()           end it: listeners off, every pending request dropped
 *   request(run, o)  run `run` on the next frame, only if still live; returns
 *                    a cancel function. o.since: 'generation' (default — any
 *                    interaction since the mount cancels it) or 'now' (only
 *                    one after this request does). o.channel: what the focus
 *                    is for ('question', 'tool', 'field', 'enter'); a newer
 *                    request supersedes an older one on the same channel.
 *   ticket(o)        the same check for a caller that schedules its own way
 *   isLive(ticket)   whether the moment a ticket recorded is still the present
 */
export function createDeferredFocusAuthority({
  windowObject = typeof window !== 'undefined' ? window : null,
  documentObject = typeof document !== 'undefined' ? document : null,
} = {}) {
  let generation = 0;
  let active = false;
  let interactions = 0;
  let serials = 0;
  const latestByChannel = new Map();
  const pending = new Set();

  const onInteraction = (event) => {
    if (active && isExplicitStudentInteraction(event, documentObject)) interactions += 1;
  };
  const listen = (on) => INTERACTION_EVENTS.forEach((type) => {
    const method = on ? 'addEventListener' : 'removeEventListener';
    documentObject?.[method]?.(type, onInteraction, { capture: true, passive: true });
  });

  const ticket = ({ since = 'generation', channel = 'question' } = {}) => {
    serials += 1;
    latestByChannel.set(channel, serials);
    return {
      generation,
      channel,
      serial: serials,
      interactions: since === 'now' ? interactions : 0,
      focus: deepActiveElement(documentObject),
    };
  };

  const focusUnmoved = (recorded) => {
    const now = deepActiveElement(documentObject);
    // Back to nothing (the element that had focus is gone) is not a choice
    // someone made; focus on something else is.
    return now === recorded.focus || isPageBackground(now, documentObject);
  };

  const isLive = (recorded) => Boolean(
    recorded
      && active
      && recorded.generation === generation
      && recorded.serial === latestByChannel.get(recorded.channel)
      && recorded.interactions === interactions
      && focusUnmoved(recorded),
  );

  const request = (run, options = {}) => {
    if (!active || !windowObject?.requestAnimationFrame) return () => {};
    const recorded = ticket(options);
    let frame = null;
    const cancel = () => {
      pending.delete(cancel);
      if (frame !== null) windowObject.cancelAnimationFrame?.(frame);
      frame = null;
    };
    frame = windowObject.requestAnimationFrame(() => {
      frame = null;
      pending.delete(cancel);
      if (isLive(recorded)) run(recorded);
    });
    pending.add(cancel);
    return cancel;
  };

  return {
    start() {
      if (active) return;
      generations += 1;
      generation = generations;
      interactions = 0;
      latestByChannel.clear();
      active = true;
      listen(true);
    },
    stop() {
      if (!active) return;
      active = false;
      listen(false);
      [...pending].forEach((cancel) => cancel());
    },
    request,
    ticket,
    isLive,
    get generation() { return generation; },
    get interactions() { return interactions; },
  };
}

export default createDeferredFocusAuthority;
