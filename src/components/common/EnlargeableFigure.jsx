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

export default function EnlargeableFigure({
  children,
  label = 'graph',
  style = {},
  enlargeLabel = 'Enlarge',
}) {
  const [enlarged, setEnlarged] = useState(false);
  const openerRef = useRef(null);
  const closeRef = useRef(null);

  const close = useCallback(() => setEnlarged(false), []);

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

  const figure = (
    <figure
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
      {enlarged ? (
        <button ref={closeRef} type="button" onClick={close} style={CONTROL}>
          Close ✕
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
