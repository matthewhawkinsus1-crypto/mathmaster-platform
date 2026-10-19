/*
 * A ROW OF KEYS IS ONE TAB STOP (WAI-ARIA toolbar, roving tabindex).
 *
 * MathInput's keypad was a plain `<button>` per key, so a keyboard student
 * pressed Tab twenty times to get past one answer box (issue #383 R7, #386
 * item 3; student pass 3 PR-27). In a toolbar only one key is in the Tab
 * order (`tabIndex 0`); the arrow keys move between keys, Home and End go to
 * the first and last, and Tab leaves the group. The key last moved to is the
 * one Tab comes back to.
 *
 * Every key is still a real button with its own name: a screen reader hears
 * "Insert stacked fraction, button" and "toolbar, Math tools" around it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

// Left/Up go back, Right/Down go on, both wrapping; Home and End jump. Up and
// Down are kept because the keypad is drawn as a grid, and a student pressing
// Down expects to move rather than to have nothing happen.
const STEP = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };

/** The key a toolbar key press moves to, or null when the key is not a toolbar key. */
export const rovingTargetIndex = (key, index, count) => {
  if (!(count > 0)) return null;
  const current = Math.min(Math.max(Number(index) || 0, 0), count - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (STEP[key] == null) return null;
  return (current + STEP[key] + count) % count;
};

/** The one key in the Tab order: the remembered one, held inside the row as it changes length. */
export const rovingActiveIndex = (index, count) => (count > 0 ? Math.min(Math.max(Number(index) || 0, 0), count - 1) : -1);

/**
 * `const toolbar = useRovingToolbar(count)` — spread `toolbar.itemProps(i)`
 * on each key and put `toolbar.onKeyDown` on the element with role="toolbar".
 */
export function useRovingToolbar(count) {
  const [stored, setStored] = useState(0);
  const items = useRef([]);
  const active = rovingActiveIndex(stored, count);
  useEffect(() => { items.current.length = count; }, [count]);

  const onKeyDown = useCallback((event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const from = items.current.indexOf(event.target);
    if (from < 0) return;
    const next = rovingTargetIndex(event.key, from, count);
    if (next == null) return;
    event.preventDefault();
    // A Work View or dialog around the field must not also act on the arrow.
    event.stopPropagation();
    setStored(next);
    items.current[next]?.focus?.();
  }, [count]);

  const itemProps = useCallback((index) => ({
    ref: (node) => { items.current[index] = node; },
    tabIndex: index === active ? 0 : -1,
    // A key reached by pointer or by Tab becomes the one Tab returns to.
    onFocus: () => setStored(index),
  }), [active]);

  return { activeIndex: active, onKeyDown, itemProps };
}
