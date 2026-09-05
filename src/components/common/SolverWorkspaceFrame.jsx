import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './SolverWorkspaceFrame.css';

const ZOOM_MIN = 0.8;
const ZOOM_MAX = 1.3;
const ZOOM_STEP = 0.1;

const clampZoom = (value) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Number(value.toFixed(2))));

const restoreAttribute = (node, name, value) => {
  if (!node) return;
  if (value == null) node.removeAttribute(name);
  else node.setAttribute(name, value);
};

const focusableElements = (host) => {
  if (!host) return [];
  return Array.from(host.querySelectorAll([
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(','))).filter((node) => (
    node.getAttribute('aria-hidden') !== 'true'
    && !node.hidden
    && node.offsetParent !== null
  ));
};

/**
 * Shared display shell for algebra solvers.
 *
 * The solver child is rendered exactly once and never moved to a second React
 * tree. Enlarge and Focus are layout states applied to the existing question
 * engine, so equation state, pending operations, cancellations, guided notes,
 * undo state, attempt state and the existing Scratchpad controls all stay live.
 */
export default function SolverWorkspaceFrame({
  children,
  label = 'Algebra solver workspace',
  taskText = '',
  workspaceKey = '',
  workspaceKind = 'algebra',
  focusPanel = null,
  workspaceActions = null,
  onWorkspaceModeChange = null,
}) {
  const [mode, setMode] = useState('normal');
  const [zoom, setZoom] = useState(1);
  const [focusPanelOpen, setFocusPanelOpen] = useState(true);
  const [taskOpen, setTaskOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const frameRef = useRef(null);
  const returnRef = useRef(null);
  const triggerRef = useRef(null);

  const closeWorkspace = useCallback(() => setMode('normal'), []);

  const openMode = useCallback((nextMode, event) => {
    if (event?.currentTarget) triggerRef.current = event.currentTarget;
    setMode(nextMode);
  }, []);

  useEffect(() => {
    setMode('normal');
    setZoom(1);
    setFocusPanelOpen(true);
    setTaskOpen(false);
    setHelpOpen(false);
  }, [workspaceKey]);

  useEffect(() => {
    onWorkspaceModeChange?.(mode);
    if (mode === 'normal') {
      setTaskOpen(false);
      setHelpOpen(false);
    }
  }, [mode, onWorkspaceModeChange]);

  useEffect(() => () => {
    onWorkspaceModeChange?.('normal');
  }, [onWorkspaceModeChange]);

  useEffect(() => {
    if (mode === 'normal') {
      triggerRef.current?.focus?.({ preventScroll: true });
      return undefined;
    }

    const host = frameRef.current?.closest('.mathmaster-question-engine');
    if (!host || typeof document === 'undefined') return undefined;

    const previous = {
      bodyOverflow: document.body.style.overflow,
      role: host.getAttribute('role'),
      ariaModal: host.getAttribute('aria-modal'),
      ariaLabel: host.getAttribute('aria-label'),
      mode: host.dataset.solverWorkspaceMode,
      kind: host.dataset.solverWorkspaceKind,
    };

    host.dataset.solverWorkspaceMode = mode;
    host.dataset.solverWorkspaceKind = workspaceKind;
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-label', label);
    document.body.style.overflow = 'hidden';
    document.body.classList.add('mathmaster-solver-workspace-open');

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeWorkspace();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusables = focusableElements(host);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !host.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !host.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    const focusFrame = window.requestAnimationFrame(() => {
      returnRef.current?.focus?.({ preventScroll: true });
      if (mode === 'focus') frameRef.current?.scrollIntoView?.({ block: 'start' });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previous.bodyOverflow;
      document.body.classList.remove('mathmaster-solver-workspace-open');
      restoreAttribute(host, 'role', previous.role);
      restoreAttribute(host, 'aria-modal', previous.ariaModal);
      restoreAttribute(host, 'aria-label', previous.ariaLabel);
      if (previous.mode == null) delete host.dataset.solverWorkspaceMode;
      else host.dataset.solverWorkspaceMode = previous.mode;
      if (previous.kind == null) delete host.dataset.solverWorkspaceKind;
      else host.dataset.solverWorkspaceKind = previous.kind;
    };
  }, [closeWorkspace, label, mode, workspaceKind]);

  const zoomPercent = useMemo(() => Math.round(zoom * 100), [zoom]);
  const isOpen = mode !== 'normal';

  return (
    <div
      ref={frameRef}
      className={`solver-workspace-frame solver-workspace-frame--${workspaceKind} ${focusPanelOpen ? '' : 'is-focus-panel-collapsed'}`}
      data-workspace-mode={mode}
      style={{ '--solver-workspace-zoom': zoom }}
    >
      <div className="solver-workspace-modebar">
        <div className="solver-workspace-modebar__context">
          <strong>{mode === 'focus' ? 'Focus workspace' : mode === 'enlarged' ? 'Enlarged tool' : 'Workspace'}</strong>
        </div>

        <div className="solver-workspace-modebar__controls" role="group" aria-label="Solver workspace controls">
          <button
            type="button"
            onClick={(event) => openMode('enlarged', event)}
            aria-pressed={mode === 'enlarged'}
            className={mode === 'enlarged' ? 'is-active' : ''}
            title="Keep the current solver layout and give it much more screen space"
          >
            ⛶ Enlarge tool
          </button>
          <button
            type="button"
            onClick={(event) => openMode('focus', event)}
            aria-pressed={mode === 'focus'}
            className={mode === 'focus' ? 'is-active' : ''}
            title="Open the maximum-space solving layout with work history"
          >
            ▣ Focus workspace
          </button>

          {isOpen && (
            <>
              <span className="solver-workspace-divider" aria-hidden="true" />

              {taskText ? (
                <button
                  type="button"
                  className={taskOpen ? 'solver-workspace-global-action is-active' : 'solver-workspace-global-action'}
                  onClick={() => {
                    setTaskOpen((current) => !current);
                    setHelpOpen(false);
                  }}
                  aria-expanded={taskOpen}
                  aria-controls="solver-workspace-task-panel"
                >
                  Task
                </button>
              ) : null}

              {workspaceActions?.undo ? (
                <button
                  type="button"
                  className="solver-workspace-global-action"
                  onClick={workspaceActions.undo.onClick}
                  disabled={workspaceActions.undo.disabled}
                  title={workspaceActions.undo.title}
                >
                  {workspaceActions.undo.label || '↶ Undo'}
                </button>
              ) : null}

              {workspaceActions?.scratchpad ? (
                <button
                  type="button"
                  className="solver-workspace-global-action"
                  onClick={workspaceActions.scratchpad.onClick}
                  disabled={workspaceActions.scratchpad.disabled}
                  title={workspaceActions.scratchpad.title}
                >
                  {workspaceActions.scratchpad.label || '✎ Scratchpad'}
                </button>
              ) : null}

              <div className="solver-workspace-zoom" role="group" aria-label="Workspace zoom">
                <button
                  type="button"
                  onClick={() => setZoom((current) => clampZoom(current - ZOOM_STEP))}
                  disabled={zoom <= ZOOM_MIN}
                  aria-label="Zoom out workspace"
                >
                  −
                </button>
                <output aria-live="polite">{zoomPercent}%</output>
                <button
                  type="button"
                  onClick={() => setZoom((current) => clampZoom(current + ZOOM_STEP))}
                  disabled={zoom >= ZOOM_MAX}
                  aria-label="Zoom in workspace"
                >
                  +
                </button>
                <button type="button" onClick={() => setZoom(1)} title="Reset workspace zoom to fit the available screen">
                  Fit work
                </button>
              </div>

              {workspaceActions?.help ? (
                <button
                  type="button"
                  className={helpOpen ? 'solver-workspace-global-action is-active' : 'solver-workspace-global-action'}
                  onClick={() => {
                    setHelpOpen((current) => !current);
                    setTaskOpen(false);
                  }}
                  aria-expanded={helpOpen}
                  aria-controls="solver-workspace-help-panel"
                >
                  {workspaceActions.help.label || 'Help'}
                </button>
              ) : null}

              {focusPanel && mode === 'focus' ? (
                <button
                  type="button"
                  onClick={() => setFocusPanelOpen((current) => !current)}
                  aria-expanded={focusPanelOpen}
                  title={focusPanelOpen ? 'Hide work history for maximum equation space' : 'Show work history'}
                >
                  {focusPanelOpen ? 'Hide history' : 'Show history'}
                </button>
              ) : null}

              {workspaceActions?.submit ? (
                <button
                  type="button"
                  className="solver-workspace-submit"
                  onClick={workspaceActions.submit.onClick}
                  disabled={workspaceActions.submit.disabled}
                  title={workspaceActions.submit.title}
                >
                  {workspaceActions.submit.label || 'Submit'}
                </button>
              ) : null}

              <button
                ref={returnRef}
                type="button"
                className="solver-workspace-return"
                onClick={closeWorkspace}
              >
                Return to assignment
              </button>
            </>
          )}
        </div>
      </div>

      {isOpen && taskOpen && taskText ? (
        <div
          id="solver-workspace-task-panel"
          className="solver-workspace-help-panel solver-workspace-task-panel"
          role="region"
          aria-label="Task directions"
        >
          {taskText}
        </div>
      ) : null}

      {isOpen && helpOpen && workspaceActions?.help?.content ? (
        <div
          id="solver-workspace-help-panel"
          className="solver-workspace-help-panel"
          role="region"
          aria-label="Solver help"
        >
          {workspaceActions.help.content}
        </div>
      ) : null}

      <div className="solver-workspace-layout">
        <div className="solver-workspace-main">{children}</div>
        <aside className="solver-workspace-focus-panel" aria-label="Work history">
          {focusPanel}
        </aside>
      </div>
    </div>
  );
}
