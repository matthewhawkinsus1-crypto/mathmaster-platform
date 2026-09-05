import React, { useCallback, useEffect, useState } from 'react';

/*
 * DIRECTIONS A STUDENT CAN PUT AWAY.
 *
 * Every tool leads with the same three blocks: what the tool is, what the task
 * is, and the numbered steps for working it. All three are worth having, and
 * all three are worth having ONCE. By the fourth question of a section the
 * student has read the steps three times and is scrolling past them to reach
 * the graph — on a Chromebook that is most of the visible screen spent on text
 * they have already absorbed.
 *
 * So the supporting material folds away, and STAYS folded for that student on
 * that surface. Callers choose the starting state: directions a student has
 * already read start folded so the tool is on screen and ready for input, while
 * anything they have not seen starts open. Either way the summary line always
 * names what is inside, and nothing is ever hidden — only folded.
 *
 * A FOLDED PANEL COSTS ONE ROW. The bottom margin exists to separate the open
 * body from what follows it; while closed there is no body, so reserving that
 * space would make a fold that saves nothing.
 *
 * PERSISTENCE IS BEST-EFFORT AND MUST NEVER BE LOAD-BEARING. A private window,
 * cleared site data, or a browser set to block storage all make the read throw
 * or come back empty. Every access is wrapped, and a failure simply means the
 * panel opens — which is the safe direction, because an unreadable preference
 * should never be the reason a struggling student loses their directions.
 */

const readStored = (key) => {
  if (!key || typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(key);
    if (value === 'open') return true;
    if (value === 'closed') return false;
    return null;
  } catch {
    return null;
  }
};

const writeStored = (key, open) => {
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, open ? 'open' : 'closed');
  } catch {
    // A browser that refuses storage still gets a working disclosure.
  }
};

export default function QuietDisclosure({
  summary,
  children,
  storageKey = null,
  defaultOpen = true,
  tone = 'quiet',
  style = {},
}) {
  const [open, setOpen] = useState(() => {
    const stored = readStored(storageKey);
    return stored === null ? defaultOpen : stored;
  });

  // The key changes when the student moves to another tool or question, and the
  // panel has to pick up that surface's own preference rather than carrying the
  // previous one across.
  useEffect(() => {
    const stored = readStored(storageKey);
    setOpen(stored === null ? defaultOpen : stored);
  }, [storageKey, defaultOpen]);

  const toggle = useCallback(() => {
    setOpen((current) => {
      const next = !current;
      writeStored(storageKey, next);
      return next;
    });
  }, [storageKey]);

  if (!children) return null;

  const strong = tone === 'strong';

  return (
    <div
      className="mathmaster-quiet-disclosure"
      data-open={open ? 'true' : 'false'}
      style={{ margin: open ? '0 0 10px' : 0, ...style }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          // The Chromebook touch minimum, same as every other student control.
          minHeight: 44,
          padding: '6px 12px 6px 10px',
          border: `1px solid ${strong ? '#9bb8e8' : '#dde5f0'}`,
          borderRadius: 999,
          background: strong ? '#f4f8ff' : '#fff',
          color: '#174ea6',
          font: 'inherit',
          fontSize: 13,
          fontWeight: 800,
          cursor: 'pointer',
        }}
      >
        <span aria-hidden="true" style={{ fontSize: 11, lineHeight: 1 }}>{open ? '▾' : '▸'}</span>
        {summary}
      </button>
      {open ? <div style={{ marginTop: 8 }}>{children}</div> : null}
    </div>
  );
}
