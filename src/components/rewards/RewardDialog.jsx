import React, { useRef } from 'react';
import Dialog from '../../ui/Dialog.jsx';
import './rewards.css';

/*
 * A modal dialog that behaves like one: focus moves in when it opens, Tab and
 * Shift+Tab stay inside it, Escape closes it (unless `busy`, so a student
 * cannot dismiss a request that is still in flight and lose its answer), and
 * focus returns to whatever opened it. On a phone it is a bottom sheet. The
 * focus rules are the shared Dialog's (src/ui/Dialog.jsx); it focuses once per
 * opening, so a dialog that moves between steps manages its own focus (see
 * UsePracticePassDialog).
 */

export default function RewardDialog({
  titleId, describedById = undefined, onClose, busy = false, children, initialFocusRef = null,
}) {
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;

  return (
    <div className="rw-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyRef.current) closeRef.current?.(); }}>
      <Dialog
        onClose={onClose}
        closeOnEscape={!busy}
        initialFocusRef={initialFocusRef}
        className="rw-dialog"
        aria-labelledby={titleId}
        aria-describedby={describedById}
        aria-busy={busy ? 'true' : undefined}
      >
        {children}
      </Dialog>
    </div>
  );
}
