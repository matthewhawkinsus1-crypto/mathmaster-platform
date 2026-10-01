import React, { useEffect, useRef } from 'react';
import './rewards.css';

/*
 * A modal dialog that behaves like one: focus moves in when it opens, Tab and
 * Shift+Tab stay inside it, Escape closes it (unless `busy`, so a student
 * cannot dismiss a request that is still in flight and lose its answer), and
 * focus returns to whatever opened it. On a phone it is a bottom sheet.
 */
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function RewardDialog({
  titleId, describedById = undefined, onClose, busy = false, children, initialFocusRef = null,
}) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    const opener = typeof document !== 'undefined' ? document.activeElement : null;
    const dialog = dialogRef.current;
    const first = initialFocusRef?.current || dialog?.querySelector(FOCUSABLE);
    first?.focus?.();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (!busyRef.current) {
          event.stopPropagation();
          closeRef.current?.();
        }
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((element) => element.offsetParent !== null || element === document.activeElement);
      if (!items.length) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    dialog?.addEventListener('keydown', onKeyDown);
    return () => {
      dialog?.removeEventListener('keydown', onKeyDown);
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
    // Once per opening: a dialog that moves between steps manages its own
    // focus (see UsePracticePassDialog), and re-running this would bounce
    // focus out to the opener and back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rw-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyRef.current) closeRef.current?.(); }}>
      <div
        ref={dialogRef}
        className="rw-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedById}
        aria-busy={busy ? 'true' : undefined}
      >
        {children}
      </div>
    </div>
  );
}
