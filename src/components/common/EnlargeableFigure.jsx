import React, { useCallback, useEffect, useRef, useState } from 'react';

// A graph a student can actually see.
//
// THE PROBLEM. A coordinate plane inside a Path question was measured at 587
// pixels wide in a 1366-pixel Chromebook window, and there was no way to make
// it bigger. The width is squeezed by a chain of caps — the session card, the
// tool shell, then a fixed sidebar of point tasks — each of them individually
// reasonable. A student plotting (4, −1) on a plane that small is aiming at a
// target a few pixels across.
//
// So the plane gets a way out of the chain: full window, one press. Every graph
// in MathMaster is an SVG with a `viewBox`, so it scales to whatever box it is
// given without any redrawing — enlarging is a layout change, not a render
// mode, and the workspace inside keeps working because it reads its geometry
// from `getBoundingClientRect` on every interaction rather than from a constant.
//
// Keyboard: Escape closes, and focus returns to the button that opened it.

const CONTROL = {
  position: 'absolute',
  top: 8,
  right: 8,
  zIndex: 2,
  minHeight: 34,
  padding: '0 12px',
  border: '1px solid #c5d5ef',
  borderRadius: 8,
  background: '#fff',
  color: '#174ea6',
  fontWeight: 800,
  fontSize: 13,
  cursor: 'pointer',
};

const BACKDROP = {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  background: 'rgba(15, 23, 42, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'clamp(8px, 2vw, 24px)',
  boxSizing: 'border-box',
};

// Whether the student has already said they would rather work embedded. Read
// defensively: a private window or blocked site data makes this throw, and the
// safe answer to "has this been dismissed" when we cannot tell is no, because
// the student can always close the panel again.
const readDismissed = (key) => {
  if (!key || typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(key) === 'dismissed';
  } catch {
    return false;
  }
};

const writeDismissed = (key) => {
  if (!key || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, 'dismissed');
  } catch {
    // A browser refusing storage simply asks again next time.
  }
};

export default function EnlargeableFigure({
  children,
  label = 'graph',
  style = {},
  enlargeLabel = 'Enlarge',
  openEnlarged = false,
  dismissKey = null,
  // THE ENLARGED PANEL COVERS THE QUESTION THAT SENT THE STUDENT TO IT.
  //
  // It is a full-window modal over the page holding the task, so a student who
  // opens a plane to plot on loses sight of what they were asked to plot. On a
  // question they opened themselves that is merely annoying; on one that opens
  // itself it is the platform hiding the prompt on the student's behalf.
  //
  // So the task comes with the figure. Passed as text rather than rendered by
  // the caller because it is shown ONLY in the enlarged view - repeating it
  // inline would put the same sentence on screen twice.
  taskText = '',
}) {
  const [enlarged, setEnlarged] = useState(() => openEnlarged && !readDismissed(dismissKey));
  const openerRef = useRef(null);
  const closeRef = useRef(null);

  // CLOSING AN AUTO-OPENED PANEL MEANS IT.
  //
  // Without this, a student who prefers the embedded layout dismisses the same
  // panel on every question of a thirteen-question assignment, and a default
  // meant to help becomes something to fight. Only a close of a panel the
  // student did not open is recorded; closing one they opened themselves says
  // nothing about the default.
  const close = useCallback(() => {
    setEnlarged((current) => {
      if (current && openEnlarged) writeDismissed(dismissKey);
      return false;
    });
  }, [openEnlarged, dismissKey]);

  useEffect(() => {
    if (!enlarged) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    closeRef.current?.focus?.();
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enlarged, close]);

  // Focus goes back where it came from, so a keyboard user is not dropped at
  // the top of the page after closing.
  useEffect(() => {
    if (!enlarged) openerRef.current?.focus?.({ preventScroll: true });
    // Only on the transition back, never on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enlarged]);

  // A new question decides for itself. Without this the panel keeps whatever
  // state the previous question left it in, so a student who closed one figure
  // finds the next one embedded even where it should have opened.
  useEffect(() => {
    setEnlarged(openEnlarged && !readDismissed(dismissKey));
  }, [openEnlarged, dismissKey]);

  const figure = (
    <figure
      data-enlarged={enlarged ? 'true' : 'false'}
      style={enlarged
        ? {
          position: 'relative',
          margin: 0,
          width: 'min(100%, 1400px)',
          maxHeight: '100%',
          overflow: 'auto',
          padding: 14,
          border: '1px solid #dfe3e7',
          borderRadius: 14,
          background: '#fff',
          boxSizing: 'border-box',
          boxShadow: '0 20px 60px rgba(15,23,42,.35)',
        }
        : { position: 'relative', margin: 0, boxSizing: 'border-box', ...style }}
    >
      {enlarged && taskText ? (
        <p
          style={{
            margin: '0 96px 12px 0',
            padding: '10px 13px',
            borderLeft: '4px solid #1a73e8',
            borderRadius: '0 8px 8px 0',
            background: '#f4f8ff',
            color: '#202124',
            fontSize: 15,
            fontWeight: 700,
            lineHeight: 1.4,
          }}
        >
          {taskText}
        </p>
      ) : null}
      {enlarged ? (
        <button
          ref={closeRef}
          type="button"
          onClick={close}
          // A student did not ask for this panel when it opens itself, so the
          // way out is stated in full rather than as a bare glyph.
          style={openEnlarged
            ? { ...CONTROL, minHeight: 44, borderColor: '#1a73e8', background: '#e8f0fe', fontWeight: 900 }
            : CONTROL}
        >
          {openEnlarged ? 'Close full screen ✕' : 'Close ✕'}
        </button>
      ) : (
        <button ref={openerRef} type="button" onClick={() => setEnlarged(true)} style={CONTROL}>
          ⤢ {enlargeLabel}
        </button>
      )}
      {children}
    </figure>
  );

  if (!enlarged) return figure;

  return (
    <div
      style={BACKDROP}
      role="dialog"
      aria-modal="true"
      aria-label={`${label}, enlarged`}
      // Clicking the backdrop closes; clicking the figure must not. Plotting a
      // point is a click on the plane, and it would be maddening for the panel
      // to vanish underneath it.
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      {figure}
    </div>
  );
}
