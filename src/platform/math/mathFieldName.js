/*
 * A MATH BOX IS NAMED WHERE FOCUS LANDS (student pass 3, A11Y-3).
 *
 * A screen reader lands in MathLive's keyboard sink, not on the <math-field>
 * host that carries our aria-label. MathLive never gives the sink that name,
 * and it rewrites the sink's aria-label itself every time the field takes
 * focus (its "line" announcement: `keyboardDelegate.setAriaLabel(...)`, which
 * is "" for an empty box). So a student heard an unnamed text box in every
 * classroom answer field; only the secure-test field named it.
 *
 * bindMathFieldName puts the field's name on the sink:
 *   - as soon as MathLive has upgraded the element and built the sink;
 *   - again on every focusin (focus events from the shadow root reach the
 *     host), in case MathLive rebuilt the sink;
 *   - again whenever anything rewrites the sink's aria-label (a
 *     MutationObserver), which is what MathLive does on focus.
 *
 * The sink is found only through the MathLive adapter (mathLiveCompat.js),
 * which pins the verified selector.
 */
import { useEffect } from 'react';
import { mathFieldKeyboardSink } from './mathLiveCompat.js';
import { mathSpeechLabel } from '../language/mathSpeechLabel.js';

/*
 * A CLOSED QUESTION'S ANSWER IS SAID WITH ITS BOX (AX01).
 *
 * MathLive hides its typeset math from assistive technology, so a box is heard
 * by its name alone. Finished work is read-only now rather than inert, and a
 * screen-reader student reviewing it heard "Slope" and never what they had
 * answered. Once the question is closed the name carries the answer, in the
 * words MathDisplay uses for the same math (mathSpeechLabel.js). While it can
 * still be answered the name is the label alone: MathLive speaks what is typed.
 */
export const mathFieldAccessibleName = ({ name = '', value = '', closed = false } = {}) => {
  const label = String(name ?? '').trim() || 'Math answer';
  if (!closed) return label;
  return `${label}: ${mathSpeechLabel({ value }) || 'nothing entered'}`;
};

/** Give the field's keyboard sink its name. Returns the sink, or null. */
export const nameMathFieldSink = (mathField, name) => {
  const sink = mathFieldKeyboardSink(mathField);
  if (sink && name && sink.getAttribute('aria-label') !== name) sink.setAttribute('aria-label', name);
  return sink;
};

/**
 * Keep `name` on the field's keyboard sink for as long as the field is
 * mounted. Returns the cleanup.
 */
export const bindMathFieldName = (mathField, name, { win = globalThis.window } = {}) => {
  if (!mathField || !name) return () => {};
  let cancelled = false;
  let observer = null;
  let observed = null;
  const apply = () => {
    if (cancelled) return;
    const sink = nameMathFieldSink(mathField, name);
    if (!sink || sink === observed || typeof win?.MutationObserver !== 'function') return;
    observer?.disconnect();
    observed = sink;
    observer = new win.MutationObserver(() => nameMathFieldSink(mathField, name));
    observer.observe(sink, { attributes: true, attributeFilter: ['aria-label'] });
  };
  apply();
  if (!observed) {
    win?.customElements?.whenDefined?.('math-field').then(() => {
      if (cancelled) return;
      if (typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(apply);
      else apply();
    });
  }
  mathField.addEventListener?.('focusin', apply);
  return () => {
    cancelled = true;
    observer?.disconnect();
    mathField.removeEventListener?.('focusin', apply);
  };
};

/** The hook: `ref` holds the <math-field>; the name follows `name`. */
export const useMathFieldName = (ref, name) => {
  useEffect(() => bindMathFieldName(ref.current, name), [ref, name]);
};
