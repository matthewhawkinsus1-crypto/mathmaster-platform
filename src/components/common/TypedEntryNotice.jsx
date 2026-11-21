import { useEffect, useState } from 'react';

/*
 * WHAT A TYPED BOX SAYS WHEN ITS ENTRY CANNOT BE SUBMITTED (#557, #558).
 *
 * An entry with a sign left dangling (`12 +`), or longer than an answer may
 * be, is not submitted and uses no try (functions/shared/typedEntryGuard.mjs
 * typedEntryNotice builds the sentence). Submit is held back at once. The
 * sentence waits: `2x +` is on the way to `2x + 3`, and a warning on every
 * keystroke of a right answer would be noise, read aloud each time by a
 * screen reader. It is shown once the entry has stood unchanged for a
 * moment, and goes as soon as the entry is fine.
 */
export const TYPED_ENTRY_NOTICE_DELAY_MS = 900;

const STYLE = Object.freeze({
  margin: '6px 0 10px',
  padding: '6px 9px',
  borderRadius: '8px',
  fontSize: 'calc(13 * var(--mm-px))',
  lineHeight: 1.4,
  fontWeight: 700,
  background: 'var(--mm-warning-bg)',
  color: 'var(--mm-warning-text)',
});

/**
 * @param message  typedEntryNotice's sentence, or ''
 * @param entry    what the box holds: the wait starts again when it changes
 */
export default function TypedEntryNotice({ message, entry = '', id, style }) {
  const [shown, setShown] = useState('');
  useEffect(() => {
    if (!message) { setShown(''); return undefined; }
    const timer = setTimeout(() => setShown(message), TYPED_ENTRY_NOTICE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [message, entry]);
  if (!message || shown !== message) return null;
  return <p role="status" id={id} data-typed-entry-notice="" style={style ? { ...STYLE, ...style } : STYLE}>{shown}</p>;
}
