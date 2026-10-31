/*
 * AN OPEN MATH BOX SAYS WHAT IS IN IT WHERE FOCUS LANDS (AX11).
 *
 * The other half of mathFieldName.js. A screen reader lands in MathLive's
 * keyboard sink, and MathLive hides its typeset math from assistive technology.
 * Before the name took over the sink's aria-label, MathLive's own "line"
 * announcement put the box's content there, so a student landing in a filled box
 * heard what it held. The name wins that label now, and a student coming back to
 * an answer heard "Slope, edit text" and nothing of what they had typed.
 *
 * The content goes in aria-description on the sink instead, which is read after
 * the name and the role: "Slope, edit text, 3 over 4". It is said in the words
 * MathDisplay uses for the same math (../language/mathSpeechLabel.js).
 *
 *   - an empty box has no description;
 *   - a closed question's box has none either: nothing in it can change, and
 *     where it can be reached its NAME carries the answer (AX01), so it is
 *     never said twice;
 *   - an edit is not read again: MathLive's live region says what each key did,
 *     and a description is read when focus arrives.
 *
 * The sink is found only through the MathLive adapter (mathLiveCompat.js).
 */
import { useEffect } from 'react';
import { mathFieldKeyboardSink } from './mathLiveCompat.js';
import { mathSpeechLabel } from '../language/mathSpeechLabel.js';

/** What a box holds, in words; '' for an empty box and for a closed question's. */
export const mathFieldAccessibleDescription = ({ value = '', closed = false } = {}) => (
  closed ? '' : mathSpeechLabel({ value })
);

/** Give the field's keyboard sink its description, or take it away. Returns the sink, or null. */
export const describeMathFieldSink = (mathField, description) => {
  const sink = mathFieldKeyboardSink(mathField);
  if (!sink) return null;
  const text = String(description ?? '').trim();
  if (text) {
    if (sink.getAttribute('aria-description') !== text) sink.setAttribute('aria-description', text);
  } else if (sink.getAttribute('aria-description') !== null) {
    sink.removeAttribute('aria-description');
  }
  return sink;
};

/**
 * Keep `description` on the field's keyboard sink for as long as the field is
 * mounted: as soon as MathLive has built the sink, and again on every focusin in
 * case it rebuilt it. Returns the cleanup.
 */
export const bindMathFieldDescription = (mathField, description, { win = globalThis.window } = {}) => {
  if (!mathField) return () => {};
  let cancelled = false;
  const apply = () => {
    if (!cancelled) describeMathFieldSink(mathField, description);
  };
  apply();
  if (!mathFieldKeyboardSink(mathField)) {
    win?.customElements?.whenDefined?.('math-field').then(() => {
      if (cancelled) return;
      if (typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(apply);
      else apply();
    });
  }
  mathField.addEventListener?.('focusin', apply);
  return () => {
    cancelled = true;
    mathField.removeEventListener?.('focusin', apply);
  };
};

/** The hook: `ref` holds the <math-field>; the description follows `description`. */
export const useMathFieldDescription = (ref, description) => {
  useEffect(() => bindMathFieldDescription(ref.current, description), [ref, description]);
};
