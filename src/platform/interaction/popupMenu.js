/*
 * ONE KEYBOARD MODEL FOR A POP-UP MENU OR LIST (TT27, slice 2).
 *
 * The ⋮ menu on an assignment card and the class selector's list were two
 * hand-built pop-ups with the same gaps. Escape from an item of the card menu
 * closed it and dropped focus to the page instead of back to the ⋮ button; the
 * class list did not close on Escape at all; and neither took the arrow keys,
 * because every item was a Tab stop of its own (a card's menu has up to twenty).
 * Both now take their behaviour from here, in the pattern that fits:
 *
 *   kind 'menu'     WAI-ARIA "Menu Button": the card menu
 *   kind 'listbox'  "Collapsible Dropdown Listbox": the class list
 *
 *   OPEN      Enter or Space on the button (its click), or ArrowDown / ArrowUp,
 *             opens the pop-up and moves focus INTO it: onto the first item
 *             (ArrowUp: the last); a list opens on the item that is selected.
 *   MOVE      the pop-up is one Tab stop: its items are tabindex -1. Up and
 *             Down move, wrapping; Home and End jump; items that are disabled
 *             are passed over.
 *   CHOOSE    Enter or Space on an item. Items are native buttons, so that key
 *             is the browser's own click and no code here repeats it: a key and
 *             a pointer press reach the same handler.
 *   CLOSE     Escape closes it and focus goes back to the button. So does
 *             choosing an item, and BEFORE the item's action runs, so a dialog
 *             that action opens remembers the button as its opener and gives
 *             focus back to it. Tab closes it and carries on from the button.
 *             A press outside closes it and leaves focus where the person put it.
 *
 * Nothing here chooses by moving: the arrow keys move focus only. For the class
 * list that matters, since choosing a class changes the whole workspace.
 *
 * Three layers, as the student choice group has: pure functions (what a key
 * means), `popupMenuHandlers` (the same with its effects handed in, so node can
 * run it against stand-in elements) and `usePopupMenu` (the React hook).
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';

// The role an item carries, and so how the pop-up's items are found.
const ITEM_ROLE = Object.freeze({ menu: 'menuitem', listbox: 'option' });

const enabledIndexes = (enabled) => enabled.map((on, index) => (on ? index : -1)).filter((index) => index >= 0);

/**
 * Which item takes focus when the pop-up opens. `key` is the key that opened it
 * (null for a click), `enabled` says per item whether it can be chosen, and
 * `selected` is the index of the item that is chosen already (-1: none).
 * Returns -1 when nothing can take focus.
 */
export const popupOpenIndex = ({ key = null, enabled = [], selected = -1 } = {}) => {
  const indexes = enabledIndexes(enabled);
  if (!indexes.length) return -1;
  if (selected >= 0 && enabled[selected]) return selected;
  return key === 'ArrowUp' ? indexes.at(-1) : indexes[0];
};

/**
 * The item a key moves focus to from `current` (-1: focus is on none of them),
 * or null when the key does not move it.
 */
export const popupMoveIndex = (key, current, enabled = []) => {
  const indexes = enabledIndexes(enabled);
  if (!indexes.length) return null;
  if (key === 'Home') return indexes[0];
  if (key === 'End') return indexes.at(-1);
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return null;
  const position = indexes.indexOf(current);
  if (position < 0) return key === 'ArrowDown' ? indexes[0] : indexes.at(-1);
  const step = key === 'ArrowDown' ? 1 : -1;
  return indexes[(position + step + indexes.length) % indexes.length];
};

/**
 * What a key does while focus is inside the pop-up:
 *   { type: 'move', index } | { type: 'close', consume } | null
 * `consume` is whether the key is taken (Escape: so a dialog around the pop-up
 * does not also close). Tab is not: the browser then moves on from the button.
 */
export const popupKeyAction = ({ key, current = -1, enabled = [] } = {}) => {
  if (key === 'Escape') return { type: 'close', consume: true };
  if (key === 'Tab') return { type: 'close', consume: false };
  const index = popupMoveIndex(key, current, enabled);
  return index === null ? null : { type: 'move', index };
};

/**
 * What a key does on the button. Enter and Space are its click, so they are not
 * here. ArrowDown and ArrowUp open the pop-up (or, when it is open already,
 * take focus into it); Escape closes an open one.
 */
export const triggerKeyAction = ({ key, open = false } = {}) => {
  if (open && key === 'Escape') return { type: 'close', consume: true };
  if (key === 'ArrowDown' || key === 'ArrowUp') return { type: 'open' };
  return null;
};

const itemEnabled = (element) => !(element.disabled || element.getAttribute?.('aria-disabled') === 'true');
const itemSelected = (element) => element.getAttribute?.('aria-selected') === 'true';
const unmodified = (event) => !(event.altKey || event.ctrlKey || event.metaKey);

/**
 * Put focus on the item the pop-up opened for, once it has drawn.
 * `pending.current` is { key } from the moment something asked for the pop-up
 * until its items exist (the card menu measures itself first, a render later).
 * Returns whether focus moved.
 */
export const landPendingFocus = ({ items, pending }) => {
  if (!pending.current) return false;
  const elements = items();
  if (!elements.length) return false;
  const index = popupOpenIndex({
    key: pending.current.key,
    enabled: elements.map(itemEnabled),
    selected: elements.findIndex(itemSelected),
  });
  pending.current = null;
  if (index < 0) return false;
  elements[index].focus({ preventScroll: true });
  return true;
};

/**
 * The behaviour, with everything it touches handed in:
 *   trigger()   the button that opens the pop-up
 *   items()     the pop-up's items, in order (elements)
 *   pending     { current } — see landPendingFocus
 *   isOpen()    whether the pop-up is open now
 *   setOpen(v)  open or close it
 */
export const popupMenuHandlers = ({ trigger, items, pending, isOpen, setOpen }) => {
  // Focus first, then close: a press that ends the pop-up must not leave focus
  // on an item that is about to unmount (focus would fall to the page).
  const close = ({ refocus = true } = {}) => {
    pending.current = null;
    if (refocus) trigger()?.focus?.();
    setOpen(false);
  };
  const open = (key = null) => {
    pending.current = { key };
    setOpen(true);
  };
  return {
    close,
    open,
    // Choosing: back to the button, closed, and only then the item's own action.
    choose: (action) => {
      close();
      action?.();
    },
    onTriggerClick: () => (isOpen() ? close() : open(null)),
    onTriggerKeyDown: (event) => {
      if (!unmodified(event)) return;
      const action = triggerKeyAction({ key: event.key, open: isOpen() });
      if (!action) return;
      event.preventDefault();
      if (action.type === 'close') {
        if (action.consume) event.stopPropagation();
        close();
      } else if (isOpen()) {
        pending.current = { key: event.key };
        landPendingFocus({ items, pending });
      } else {
        open(event.key);
      }
    },
    onPopupKeyDown: (event) => {
      if (!unmodified(event)) return;
      const elements = items();
      const action = popupKeyAction({
        key: event.key,
        current: elements.findIndex((element) => element === event.target || element.contains?.(event.target)),
        enabled: elements.map(itemEnabled),
      });
      if (!action) return;
      if (action.type === 'move') {
        event.preventDefault();
        elements[action.index].focus();
        return;
      }
      if (action.consume) {
        event.preventDefault();
        event.stopPropagation();
      }
      close();
    },
  };
};

/**
 * `const menu = usePopupMenu({ kind: 'menu', open, onOpenChange: setOpen })`
 *
 *   <button ref={menu.triggerRef} {...menu.triggerProps}>…</button>
 *   {open && (
 *     <div {...menu.popupProps} role="menu" aria-label="…">
 *       <button {...menu.itemProps} onClick={() => menu.choose(run)}>…</button>
 *     </div>
 *   )}
 *
 * The caller keeps `open` (it decides whether to draw the pop-up, and where).
 * `popupProps` goes on the outermost element of the pop-up, since it carries the
 * keys and the test for a press outside; the element with the menu or listbox
 * role may sit inside it. A list marks its chosen option `aria-selected`, and
 * opens on it.
 *
 * There is no aria-controls on the button: with aria-haspopup, axe 4.11 never
 * decides it, and lists the button as "needs review" for as long as the pop-up
 * is open. The pop-up takes focus as it opens, which is how a screen reader
 * reaches it.
 */
export function usePopupMenu({ kind = 'menu', open, onOpenChange }) {
  const role = ITEM_ROLE[kind];
  if (!role) throw new Error(`usePopupMenu: kind must be "menu" or "listbox", not "${kind}"`);
  const triggerRef = useRef(null);
  const popupRef = useRef(null);
  const pending = useRef(null);
  const openRef = useRef(open);
  const setOpenRef = useRef(onOpenChange);
  openRef.current = open;
  setOpenRef.current = onOpenChange;

  const items = useCallback(
    () => (popupRef.current ? [...popupRef.current.querySelectorAll(`[role="${role}"]`)] : []),
    [role],
  );
  const handlers = useMemo(() => popupMenuHandlers({
    trigger: () => triggerRef.current,
    items,
    pending,
    isOpen: () => openRef.current,
    setOpen: (value) => setOpenRef.current?.(value),
  }), [items]);

  // After every render, until it has landed: the items may draw a render after `open`.
  useEffect(() => {
    if (!open) { pending.current = null; return; }
    landPendingFocus({ items, pending });
  });

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (triggerRef.current?.contains(event.target) || popupRef.current?.contains(event.target)) return;
      handlers.close({ refocus: false });
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, handlers]);

  return {
    triggerRef,
    popupRef,
    close: handlers.close,
    choose: handlers.choose,
    triggerProps: {
      ref: triggerRef,
      'aria-haspopup': kind,
      'aria-expanded': Boolean(open),
      onClick: handlers.onTriggerClick,
      onKeyDown: handlers.onTriggerKeyDown,
    },
    popupProps: { ref: popupRef, tabIndex: -1, onKeyDown: handlers.onPopupKeyDown },
    itemProps: { role, tabIndex: -1 },
  };
}
