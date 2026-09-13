import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MathText from './MathText.jsx';
import {
  WorkViewCapabilityPortProvider,
  combinePublishedCapabilities,
  toggleWorkViewDrawer,
  useWorkViewCapabilities,
  workViewCapabilitySummary,
} from '../../platform/workView/workViewCapabilities.js';
import { readWorkViewViewport } from '../../platform/workView/workViewViewport.js';
import { useQuestionLifecycle } from '../../platform/question/QuestionLifecycleContext.jsx';
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
  // The tool body can contain positioned split panes and headings. Keep the
  // opener above those local stacking contexts so the visible button is also
  // the element that receives a student's click.
  zIndex: 50,
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
  presentationKey = null,
  forceClosed = false,
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
  const { terminal: questionTerminal } = useQuestionLifecycle();
  // `forceClosed` remains a supported escape hatch for non-QuestionEngine
  // hosts, while the shared lifecycle closes every direct or nested figure in
  // the current question without relying on a tool to forward that prop.
  const shouldForceClose = forceClosed || questionTerminal;
  const [enlarged, setEnlarged] = useState(() => !shouldForceClose && openEnlarged && !readDismissed(dismissKey));
  const [drawer, setDrawer] = useState(null);
  const [viewport, setViewport] = useState(() => readWorkViewViewport());
  const openerRef = useRef(null);
  const closeRef = useRef(null);
  const presentationKeyRef = useRef(presentationKey);
  const actionsRef = useRef(null);
  // What descendants have told this shell they can do. Held per publisher id so
  // a plane that unmounts withdraws only its own controls.
  const [publishedByChild, setPublishedByChild] = useState({});
  const publish = useCallback((id, childCapabilities) => {
    setPublishedByChild((current) => {
      if (!childCapabilities) {
        if (!(id in current)) return current;
        const next = { ...current };
        delete next[id];
        return next;
      }
      if (current[id] === childCapabilities) return current;
      return { ...current, [id]: childCapabilities };
    });
  }, []);
  const publishedCapabilities = useMemo(
    () => combinePublishedCapabilities(publishedByChild),
    [publishedByChild],
  );
  const registeredCapabilities = useWorkViewCapabilities(capabilities, publishedCapabilities);

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

  // A grading transition owns this close. It is deliberately separate from
  // `close`: completing a question is not the student's choice to dismiss the
  // compact-phone default for future questions. Blurring also dismisses the
  // MathMaster/mobile keyboard before the continuation controls appear.
  useEffect(() => {
    if (!shouldForceClose) return;
    if (typeof document !== 'undefined') document.activeElement?.blur?.();
    setDrawer(null);
    setEnlarged(false);
  }, [shouldForceClose]);

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
    if (!enlarged && !shouldForceClose) openerRef.current?.focus?.({ preventScroll: true });
    // Only on the transition back, never on first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enlarged, shouldForceClose]);

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

  // A new question decides its initial presentation, but a responsive resize
  // must not override the student's current Work View state. In particular, an
  // aiming tool can move from a wide viewport (auto-open policy true) to a
  // narrow one (policy false) during orientation; that is presentation only and
  // must not close the workspace underneath the student's work.
  useEffect(() => {
    const questionChanged = presentationKeyRef.current !== presentationKey;
    presentationKeyRef.current = presentationKey;
    const allowedToAutoOpen = !shouldForceClose && openEnlarged && !readDismissed(dismissKey);

    if (questionChanged) {
      setEnlarged(allowedToAutoOpen);
      return;
    }
    if (allowedToAutoOpen) setEnlarged((current) => current || true);
  }, [openEnlarged, dismissKey, presentationKey, shouldForceClose]);

  // visualViewport follows the actually usable height when mobile browser
  // chrome or the virtual keyboard changes. This is presentation-only state.
  useEffect(() => {
    if (!enlarged || typeof window === 'undefined') return undefined;
    const update = () => {
      const next = readWorkViewViewport(window);
      setViewport((current) => (
        current.mode === next.mode
        && current.orientation === next.orientation
        && current.usableHeight === next.usableHeight
        && current.offsetTop === next.offsetTop
        && current.keyboardOpen === next.keyboardOpen
        && current.controlsPlacement === next.controlsPlacement
          ? current
          : next
      ));
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener?.('resize', update);
    // iOS opens the software keyboard by SCROLLING the visual viewport rather
    // than resizing the layout one, so a panel pinned to `inset: 0` slides off
    // the top of the screen and only a scroll event says so. Without this, a
    // student typing a coordinate in Work View loses the header and the close
    // control above the fold.
    window.visualViewport?.addEventListener?.('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.visualViewport?.removeEventListener?.('resize', update);
      window.visualViewport?.removeEventListener?.('scroll', update);
    };
  }, [enlarged]);

  /*
   * HOW TALL THE BOTTOM ACTION REGION IS, PUBLISHED TO THE REST OF THE PAGE.
   *
   * The calculator launcher is `position: fixed` at the bottom-right corner with
   * a z-index far above this panel — it is a platform affordance, and on an
   * accommodation plan it is the student's by right — so on a phone it landed
   * squarely on top of the Clear button. Hiding it would take a support tool
   * away; leaving it covers a registered control.
   *
   * So the shell says how much room its controls need and anything pinned to the
   * bottom of the window clears them. Measured rather than assumed, because the
   * row wraps to two lines when a tool registers more actions than fit across a
   * 390px phone. Zero while the controls are a side rail, where nothing at the
   * bottom of the window is in their way.
   */
  useEffect(() => {
    if (!enlarged || typeof document === 'undefined') return undefined;
    const root = document.documentElement;
    const apply = () => {
      const height = viewport.controlsPlacement === 'bottom'
        ? (actionsRef.current?.getBoundingClientRect?.().height || 0)
        : 0;
      root.style.setProperty('--mm-work-view-actions', `${Math.round(height)}px`);
    };
    apply();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(apply) : null;
    if (observer && actionsRef.current) observer.observe(actionsRef.current);
    return () => {
      observer?.disconnect();
      root.style.removeProperty('--mm-work-view-actions');
    };
  }, [enlarged, viewport.controlsPlacement]);

  const task = registeredCapabilities.task?.content || registeredCapabilities.task?.text || taskText;
  const help = registeredCapabilities.help?.content || registeredCapabilities.help?.text;
  const instruction = registeredCapabilities.instruction?.content || registeredCapabilities.instruction?.text;
  // Task, Help and the current instruction have their own places in the shell,
  // and anything with an `onAction` becomes a button below. What is left is the
  // set of things this workspace can do that have no control of their own —
  // pan/zoom, point editing, numeric fields, a data table — and those read as
  // labels so a student can tell at a glance what the enlarged view carries.
  const shellActionNames = ['undo', 'redo', 'fitView'].filter(
    (name) => registeredCapabilities[name]?.onAction || registeredCapabilities[name]?.onClick,
  );
  const capabilityNames = workViewCapabilitySummary(registeredCapabilities)
    .filter((name) => !['task', 'help', 'instruction', 'primaryActions', 'secondaryActions'].includes(name))
    .filter((name) => !shellActionNames.includes(name));
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
      {/* The current instruction is the one sentence telling the student what
          this step asks for, so it keeps a class of its own. It used to share
          the chip class with the capability labels, and the mobile rule that
          drops those chips to save room was taking the instruction with them —
          on the narrow screen that needs it most. */}
      {enlarged && instruction ? (
        <div className="mathmaster-work-view-instruction">
          {typeof instruction === 'string' ? <MathText>{instruction}</MathText> : instruction}
        </div>
      ) : null}
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
        <button ref={openerRef} type="button" onClick={() => { if (!shouldForceClose) setEnlarged(true); }} disabled={shouldForceClose} style={CONTROL}>
          ⤢ {enlargeLabel}
        </button>
      ) : null}
      <WorkViewCapabilityPortProvider publish={publish}>{children}</WorkViewCapabilityPortProvider>
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
      data-controls={viewport.controlsPlacement}
      data-keyboard={viewport.keyboardOpen ? 'open' : undefined}
      style={enlarged ? {
        '--mm-work-view-height': `${viewport.usableHeight}px`,
        // Follows the visual viewport rather than the layout one, so the panel
        // stays on the part of the screen the student can actually see when the
        // keyboard or a collapsing browser bar moves it.
        top: viewport.offsetTop ? `${viewport.offsetTop}px` : undefined,
      } : undefined}
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
        <aside ref={actionsRef} className="mathmaster-work-view-actions" aria-label="Work View controls">
          {shellActions.map((action, index) => (
            <button
              key={action.id || `${action.label}-${index}`}
              type="button"
              // Named so the browser gate can find the registered controls and
              // measure them. A capability that registered but rendered off the
              // bottom of a phone is not a control the student has.
              data-work-view-action={action.id || action.label}
              className={/undo/i.test(String(action.id || action.label || '')) ? 'mathmaster-universal-undo' : undefined}
              data-undo-owner={/undo/i.test(String(action.id || action.label || '')) ? 'current-tool' : undefined}
              // Fit, pan and zoom move the camera and nothing else. Marked in
              // the DOM so the state-integrity gate can press them and assert
              // that the mathematics and the Undo depth are unchanged.
              data-camera-only={action.cameraOnly ? 'true' : undefined}
              onClick={() => invokeAction(action)}
              disabled={action.disabled}
              title={action.title}
            >
              {action.label}
            </button>
          ))}
          {capabilityNames.map((name) => <span key={name} className="mathmaster-work-view-capability" data-work-view-capability={name}>{registeredCapabilities[name]?.label || name}</span>)}
        </aside>
      </div>
    </div>
  );
}
