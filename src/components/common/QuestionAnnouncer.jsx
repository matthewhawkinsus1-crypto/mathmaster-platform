import React, { useEffect, useRef, useState } from 'react';
import { SR_ONLY_STYLE } from '../../ui/srOnly.js';

/*
 * A NEW QUESTION IS ANNOUNCED.
 *
 * Moving to the next question re-renders the stage and (on a laptop) puts
 * focus straight into the answer box. A sighted student sees the new prompt;
 * a screen-reader student heard only the answer box's label — "Answer, edit
 * text" — and had to go hunting backwards for what was being asked.
 *
 * This live region says where they are and what the screen asks:
 * "Question 3 of 8, Practice. Solve 2x plus 3 equals 7."
 *
 * The words are read from the RENDERED prompt, not from the question data, so
 * the announcement can never say more than the screen shows (a variant, a
 * hidden hint, an answer key). Math inside it is taken from MathDisplay's one
 * spoken copy; the typeset markup and anything aria-hidden are skipped.
 *
 * Polite, so it never cuts off what the screen reader is already saying about
 * the newly focused field; it follows it.
 */

const SKIP = new Set(['MATH-SPAN', 'MATH-DIV', 'MATH-FIELD', 'SCRIPT', 'STYLE', 'BUTTON', 'svg']);

/** The text a screen reader would read for `node`, minus hidden copies. */
export const spokenTextOf = (node) => {
  if (!node) return '';
  let text = '';
  const walk = (current) => {
    if (current.nodeType === 3) { text += current.nodeValue; return; }
    if (current.nodeType !== 1) return;
    if (SKIP.has(current.tagName) || current.getAttribute('aria-hidden') === 'true' || current.hidden) return;
    if (current.hasAttribute('data-announce-skip')) return;
    for (const child of current.childNodes) walk(child);
    if (/^(DIV|P|LI|H[1-6])$/.test(current.tagName)) text += ' ';
  };
  walk(node);
  return text.replace(/\s+/g, ' ').trim();
};

export default function QuestionAnnouncer({
  announceKey, position = '', containerRef = null, promptSelector = '.mathmaster-question-prompt',
}) {
  const [message, setMessage] = useState('');
  const previousKey = useRef(undefined);

  useEffect(() => {
    if (announceKey == null) return undefined;
    const first = previousKey.current === undefined;
    previousKey.current = announceKey;
    // Opening the assignment is a page change the screen reader already
    // reads; only a MOVE between questions needs telling.
    if (first) return undefined;
    let frame = null;
    let tries = 0;
    const read = () => {
      const container = containerRef?.current || (typeof document !== 'undefined' ? document : null);
      const prompt = container?.querySelector?.(promptSelector);
      // The prompt mounts with the tool; give it a few frames, then announce
      // the position alone rather than nothing.
      if (!prompt && tries < 20) { tries += 1; frame = requestAnimationFrame(read); return; }
      const words = spokenTextOf(prompt).replace(/^Your (question|task)\s*/i, '');
      setMessage([position, words].filter(Boolean).join('. '));
    };
    setMessage('');
    frame = requestAnimationFrame(read);
    return () => { if (frame != null) cancelAnimationFrame(frame); };
  }, [announceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={SR_ONLY_STYLE} role="status" aria-live="polite" aria-atomic="true" data-question-announcer="">
      {message}
    </div>
  );
}
