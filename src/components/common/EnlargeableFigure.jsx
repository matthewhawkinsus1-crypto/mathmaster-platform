import React, { useCallback, useEffect, useRef, useState } from 'react';
import MathText from './MathText.jsx';
import { toggleWorkViewDrawer, useWorkViewCapabilities, workViewCapabilitySummary } from '../../platform/workView/workViewCapabilities.js';
import { readWorkViewViewport } from '../../platform/workView/workViewViewport.js';
import './WorkViewShell.css';

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
  // 44px, not the 34 this used to be. The button floats over the figure's
  // corner, so every pixel of it covers graph — but a control under 44px is
  // one a fingertip misses, and a student who misses the enlarge button on a
  // 360px phone has no other way to see the graph properly.
  minHeight: 44,
  padding: '0 12px',
  border: '1px solid #c5d5ef',
  borderRadius: 8,
  background: '#fff',
  color: '#174ea6',
  fontWeight: 800,
  fontSize: 13,
  cursor: 'pointer',
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
  capabilities = null,
}) {
  const [enlarged, setEnlarged] = useState(() => openEnlarged && !readDismissed(dismissKey));
  const [drawer, setDrawer] = useState(null);
  const [viewport, setViewport] = useState(() => readWorkViewViewport());
  const openerRef = useRef(null);
  const closeRef = useRef(null);
  const registeredCapabilities = useWorkViewCapabilities(capabilities);

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

  useEffect(() => {
    if (!enlarged || typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    root.dataset.workViewOpen = 'true';
    return () => {
      root.style.overflow = previousOverflow;
      delete root.dataset.workViewOpen;
    };
  }, [enlarged]);

  // A new question decides for itself. Without this the panel keeps whatever
  // state the previous question left it in, so a student who closed one figure
  // finds the next one embedded even where it should have opened.
  useEffect(() => {
    setEnlarged(openEnlarged && !readDismissed(dismissKey));
  }, [openEnlarged, dismissKey]);

  // visualViewport follows the actually usable height when mobile browser
  // chrome or the virtual keyboard changes. This is presentation-only state.
  useEffect(() => {
    if (!enlarged || typeof window === 'undefined') return undefined;
    const update = () => setViewport(readWorkViewViewport(window));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener?.('resize', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.visualViewport?.removeEventListener?.('resize', update);
    };
  }, [enlarged]);

  const task = registeredCapabilities.task?.content || registeredCapabilities.task?.text || taskText;
  const help = registeredCapabilities.help?.content || registeredCapabilities.help?.text;
  const instruction = registeredCapabilities.instruction?.content || registeredCapabilities.instruction?.text;
  const capabilityNames = workViewCapabilitySummary(registeredCapabilities)
    .filter((name) => !['task', 'help', 'instruction', 'primaryActions', 'secondaryActions'].includes(name));
  const shellActions = [
    registeredCapabilities.undo,
    registeredCapabilities.redo,
    registeredCapabilities.fitView,
    ...(registeredCapabilities.primaryActions || []),
    ...(registeredCapabilities.secondaryActions || []),
  ].filter((action) => action && (action.onAction || action.onClick));

  const invokeAction = (action) => (action.onAction || action.onClick)?.();

  // This figure occupies the same keyed position for embedded and Work View.
  // Only CSS presentation changes around it, so children are never cloned or
  // remounted and their mathematical React state remains the single owner.
  const figure = (
    <figure
      className="mathmaster-work-view-surface"
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
      {enlarged && instruction ? <div className="mathmaster-work-view-capability">{instruction}</div> : null}
      {enlarged && taskText && !registeredCapabilities.task ? (
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
          {/* The task carries the same `$…$` mathematics the prompt does — this
              IS the prompt, repeated where the modal covers it — so it needs the
              same rendering. Printed raw, a student who enlarged a number-line
              question read "Solve $-6x- 6 \ge 24$". */}
          <MathText>{taskText}</MathText>
        </p>
      ) : null}
      {!enlarged ? (
        <button ref={openerRef} type="button" onClick={() => setEnlarged(true)} style={CONTROL}>
          ⤢ {enlargeLabel}
        </button>
      ) : null}
      {children}
    </figure>
  );

  /*
   * RENDERED IN PLACE, AND THAT PLACE HAS TO STAY UNTRANSFORMED.
   *
   * `position: fixed` covers the viewport only while no ancestor has a
   * transform, filter or containment — any one of those makes that ancestor the
   * containing block instead. A stage-entry animation holding an identity
   * transform (fill-mode `both` over keyframes ending at `transform: none`) was
   * enough to shrink this panel to 344x395 inside a 390x664 phone and push the
   * graph out of the bottom of it, turning the one control that makes a small
   * embedded plane workable into a no-op. That animation is fixed in
   * WorkflowFocusMode.css.
   *
   * Portalling to the body would make the panel immune to that, but it would
   * also take the panel out of `.mathmaster-question-container` and
   * `.mathmaster-mobile-interaction-root` — and with them the phone layout that
   * stacks this workspace into one column and holds its controls at 44px. The
   * cure was worse: a full-width modal with a 220px sidebar, a 120px graph and
   * 32px buttons. So it stays here, and tests/browser/assignmentMobile.mjs
   * measures the enlarged plane against the embedded one on every run, which is
   * what catches the next ancestor that grows a transform.
   */
  return (
    <div
      className={`mathmaster-work-view-host${enlarged ? ' mathmaster-enlarged-figure' : ''}`}
      data-open={enlarged ? 'true' : 'false'}
      data-layout={viewport.mode}
      data-orientation={viewport.orientation}
      style={enlarged ? { '--mm-work-view-height': `${viewport.usableHeight}px` } : undefined}
      // Named so the app-wide "no graph taller than 70dvh" cap can stand down
      // here. Enlarging exists to make the figure big; applying the same cap
      // inside the modal would make the button do almost nothing.
      role={enlarged ? 'dialog' : undefined}
      aria-modal={enlarged ? 'true' : undefined}
      aria-label={enlarged ? `${label}, Work View` : undefined}
      // Clicking the backdrop closes; clicking the figure must not. Plotting a
      // point is a click on the plane, and it would be maddening for the panel
      // to vanish underneath it.
      onClick={(event) => { if (enlarged && event.target === event.currentTarget) close(); }}
    >
      <header className="mathmaster-work-view-header">
        <strong className="mathmaster-work-view-title">{label}</strong>
        {task ? <button type="button" aria-expanded={drawer === 'task'} onClick={() => setDrawer((value) => toggleWorkViewDrawer(value, 'task'))}>Task</button> : null}
        {help ? <button type="button" aria-expanded={drawer === 'help'} onClick={() => setDrawer((value) => toggleWorkViewDrawer(value, 'help'))}>Help</button> : null}
        <button ref={closeRef} type="button" onClick={close}>{openEnlarged ? 'Close full screen ✕' : 'Close ✕'}</button>
      </header>
      <section className="mathmaster-work-view-drawer" data-open={enlarged && drawer === 'task' ? 'true' : 'false'} aria-label="Original task">
        {task ? (typeof task === 'string' ? <MathText>{task}</MathText> : task) : null}
      </section>
      <section className="mathmaster-work-view-drawer" data-open={enlarged && drawer === 'help' ? 'true' : 'false'} aria-label="Help and instructions">
        {help || null}
      </section>
      <div className="mathmaster-work-view-body">
        {figure}
        <aside className="mathmaster-work-view-actions" aria-label="Work View controls">
          {shellActions.map((action, index) => (
            <button key={action.id || `${action.label}-${index}`} type="button" onClick={() => invokeAction(action)} disabled={action.disabled} title={action.title}>{action.label}</button>
          ))}
          {capabilityNames.map((name) => <span key={name} className="mathmaster-work-view-capability">{registeredCapabilities[name]?.label || name}</span>)}
        </aside>
      </div>
    </div>
  );
}
