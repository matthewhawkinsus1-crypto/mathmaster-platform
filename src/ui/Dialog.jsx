import React, { forwardRef, useCallback, useEffect, useRef } from 'react';
import {
  TABBABLE_SELECTOR, initialFocusChoice, isTabbableFacts, isTopDialog, looksLikeCloseControl, nextFocusIndex, pushDialog,
} from './dialogFocus.js';
import { MATHLIVE_VIRTUAL_KEYBOARD_SELECTOR } from '../platform/math/mathLiveCompat.js';

/*
 * THE ONE ACCESSIBLE MODAL DIALOG.
 *
 *   <Dialog aria-labelledby="title-id" onClose={close} className=… style=…>
 *     <h2 id="title-id">…</h2> …
 *   </Dialog>
 *
 * It renders the element that carries role="dialog" — not the backdrop — so a
 * screen that already draws its own overlay swaps its inner
 * `<div role="dialog" aria-modal="true" …>` for `<Dialog …>` and keeps every
 * other prop, class and style. What it adds (rules in ./dialogFocus.js):
 *
 *   initial focus   `initialFocusRef`, else [data-autofocus], else the first
 *                   control that is not a close button, else the dialog itself
 *   focus trap      Tab / Shift+Tab wrap inside; focus that escapes (a click
 *                   on the backdrop, a programmatic focus) is pulled back
 *   Escape          calls onClose — only for the topmost dialog, and not while
 *                   `closeOnEscape` is false (a request in flight)
 *   focus return    to whatever was focused when it opened, if it still exists
 *   accessible name a dev warning when neither aria-label nor aria-labelledby
 *                   is given
 *
 * `useModalDialog(ref, options)` is the same behaviour for a component that
 * must keep its own element (a portal, a <section>).
 */

const isRendered = (element) => {
  if (!element || typeof element.getClientRects !== 'function') return true;
  if (element.getClientRects().length > 0) return true;
  return element === element.ownerDocument?.activeElement;
};

const tabbableWithin = (root) => {
  if (!root) return [];
  const hiddenInside = (element) => {
    const hiddenAncestor = element.closest('[hidden], [aria-hidden="true"]');
    return Boolean(hiddenAncestor && root.contains(hiddenAncestor));
  };
  return [...root.querySelectorAll(TABBABLE_SELECTOR)].filter((element) => isTabbableFacts({
    tabIndex: element.hasAttribute('tabindex') ? Number(element.getAttribute('tabindex')) : 0,
    disabled: element.disabled === true,
    hidden: hiddenInside(element),
    inert: element.closest('[inert]') !== null,
    rendered: isRendered(element),
  }));
};

// Layers that may hold focus while a Dialog is the top layer without counting
// as an escape from it: the on-screen math keyboard, a floating tool lifted
// above Work View (the calculator), anything marked to allow it. NOT another
// dialog: a modal ABOVE this one already makes it stand down (stack, or
// coveredByForeignModal), so a dialog holding focus while this one is on top
// is beneath it — the parent of a nested confirm — and focus there is an
// escape to pull back (Codex review, PR #454).
const ALLOWED_FOCUS_LAYERS = `${MATHLIVE_VIRTUAL_KEYBOARD_SELECTOR}, [data-work-view-floating-tool], [data-dialog-allow-focus]`;
const inAllowedLayer = (element) => Boolean(element?.closest?.(ALLOWED_FOCUS_LAYERS));

// An opener that lost focus BECAUSE it was disabled — the Scratchpad button
// greys out while the overlay loads, so the dialog opens with focus already on
// <body>. Only that case borrows it as the opener. A button press that never
// took focus at all (Safari, iPadOS) leaves nothing here, so closing never
// jumps to whatever was focused long before — an answer field whose focus
// would open the phone keypad (PR #454 review M1).
let disabledOpener = null;
const DISABLED_OPENER_WINDOW_MS = 4000;
if (typeof document !== 'undefined') {
  document.addEventListener('focusout', (event) => {
    if (event.target?.disabled === true) disabledOpener = { element: event.target, at: Date.now() };
  }, true);
}
const recentDisabledOpener = () => (
  disabledOpener && Date.now() - disabledOpener.at <= DISABLED_OPENER_WINDOW_MS ? disabledOpener.element : null
);

// Elements of the Dialogs currently open (they order themselves by the stack).
const openDialogElements = new Set();

// A modal that is not (yet) a Dialog — a Toast confirm, QuestionEngine's —
// knows nothing of the stack. If one is open LATER in the document than this
// dialog and outside it, it is the layer on top and this dialog stands down.
const coveredByForeignModal = (dialog) => {
  const doc = dialog.ownerDocument || document;
  return [...doc.querySelectorAll('[aria-modal="true"]')].some((element) => (
    !openDialogElements.has(element)
    && !dialog.contains(element)
    && (dialog.compareDocumentPosition(element) & 4) // DOCUMENT_POSITION_FOLLOWING
  ));
};

export function useModalDialog(ref, {
  onClose = null, initialFocusRef = null, closeOnEscape = true, returnFocus = true, active = true,
} = {}) {
  const onCloseRef = useRef(onClose);
  const escapeRef = useRef(closeOnEscape);
  onCloseRef.current = onClose;
  escapeRef.current = closeOnEscape;

  useEffect(() => {
    if (!active) return undefined;
    const dialog = ref.current;
    if (!dialog) return undefined;
    const doc = dialog.ownerDocument || document;
    // The token is the element itself, so "contains" can be asked of the DOM.
    const token = dialog;
    openDialogElements.add(dialog);
    const pop = pushDialog(token, { contains: (other) => other !== dialog && dialog.contains(other) });
    const onTop = () => isTopDialog(token) && !coveredByForeignModal(dialog);
    const borrowed = recentDisabledOpener();
    const opener = doc.activeElement && doc.activeElement !== doc.body
      ? doc.activeElement
      : (borrowed && !dialog.contains(borrowed) ? borrowed : null);

    // Focusable so it can hold focus when it has no controls; removed again on
    // close, for an element that stays mounted (Work View's host).
    const addedTabIndex = !dialog.hasAttribute('tabindex');
    if (addedTabIndex) dialog.setAttribute('tabindex', '-1');
    if (import.meta.env?.DEV && !dialog.getAttribute('aria-label') && !dialog.getAttribute('aria-labelledby')) {
      console.warn('[Dialog] a modal dialog needs aria-label or aria-labelledby', dialog);
    }

    const focusInitial = (opening) => {
      const explicit = initialFocusRef?.current;
      // Something inside already took focus (an autoFocus control, a
      // component's own choice) — unless the caller named the target, which
      // wins on opening (Work View's Enlarge button sits inside its host).
      const settled = dialog.contains(doc.activeElement) && doc.activeElement !== dialog;
      if (settled && !(opening && explicit)) return;
      if (settled && explicit === doc.activeElement) return;
      const items = tabbableWithin(dialog);
      const autofocusIndex = items.findIndex((item) => item.hasAttribute('data-autofocus'));
      const choice = initialFocusChoice({
        hasExplicit: Boolean(explicit),
        autofocusIndex,
        items: items.map((item) => ({ isClose: looksLikeCloseControl({ label: item.getAttribute('aria-label'), text: item.textContent }) })),
      });
      const target = choice.kind === 'explicit' ? explicit : choice.kind === 'item' ? items[choice.index] : dialog;
      target?.focus?.({ preventScroll: true });
    };
    // A dialog whose content mounts a frame later (lazy panels) still opens
    // focused: try now, and once more after paint if nothing inside took it.
    focusInitial(true);
    const frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => focusInitial(false)) : null;

    const onKeyDown = (event) => {
      // Bubble phase: a control inside that owns Escape or Tab (a listbox, the
      // math keyboard) handles it first and marks it handled. One exception: a
      // math field prevents Escape's default only to keep MathLive out of its
      // LaTeX mode (MathInput.jsx), not because it used the key — Escape there
      // still closes the dialog (Work View with focus in "Slope", PR #454).
      const handledInside = event.defaultPrevented
        && !(event.key === 'Escape' && event.target?.closest?.('math-field'));
      if (handledInside || !onTop()) return;
      if (event.key === 'Escape') {
        // A layer above that closed itself on this very Escape (a Toast
        // confirm) is already gone from the DOM by the time it bubbles here.
        if (event.target && event.target.isConnected === false) return;
        if (escapeRef.current && typeof onCloseRef.current === 'function') {
          event.stopPropagation();
          event.preventDefault();
          onCloseRef.current(event);
        }
        return;
      }
      if (event.key !== 'Tab') return;
      // Tabbing inside a floating tool (the calculator over Work View) is that
      // tool's own business.
      if (!dialog.contains(doc.activeElement) && inAllowedLayer(doc.activeElement)) return;
      const items = tabbableWithin(dialog);
      if (!items.length) { event.preventDefault(); dialog.focus({ preventScroll: true }); return; }
      const index = nextFocusIndex({ count: items.length, activeIndex: items.indexOf(doc.activeElement), shift: event.shiftKey });
      if (index == null) return;
      event.preventDefault();
      items[index].focus({ preventScroll: true });
    };
    const onFocusIn = (event) => {
      if (!onTop()) return;
      if (dialog.contains(event.target)) return;
      // Focus belonging to a later layer (a toast, a MathLive keyboard, a
      // popover appended to <body>) is not an escape from this dialog.
      if (inAllowedLayer(event.target)) return;
      const items = tabbableWithin(dialog);
      (items[0] || dialog).focus({ preventScroll: true });
    };
    doc.addEventListener('keydown', onKeyDown);
    doc.addEventListener('focusin', onFocusIn);
    return () => {
      if (frame != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
      doc.removeEventListener('keydown', onKeyDown);
      doc.removeEventListener('focusin', onFocusIn);
      pop();
      openDialogElements.delete(dialog);
      if (addedTabIndex) dialog.removeAttribute('tabindex');
      if (returnFocus && opener && opener.isConnected && typeof opener.focus === 'function') {
        opener.focus({ preventScroll: true });
      }
    };
    // Once per opening: content that changes inside an open dialog must not
    // bounce focus back to the first control.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

const Dialog = forwardRef(function Dialog({
  as: Tag = 'div', role = 'dialog', onClose = null, initialFocusRef = null, closeOnEscape = true, returnFocus = true,
  children, ...rest
}, forwardedRef) {
  const innerRef = useRef(null);
  const setRef = useCallback((node) => {
    innerRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);
  useModalDialog(innerRef, { onClose, initialFocusRef, closeOnEscape, returnFocus });
  return (
    <Tag ref={setRef} role={role} aria-modal="true" {...rest}>
      {children}
    </Tag>
  );
});

export default Dialog;
