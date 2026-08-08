import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import './uiKit.css';

/*
 * Replaces window.alert / window.confirm across the app.
 *
 * Both natives block the whole tab, cannot be styled, cannot be read by a
 * screen reader in context, and on a Chromebook kiosk they render as a jarring
 * browser chrome dialog that looks nothing like the app. Worse, window.confirm
 * inside an async handler freezes the UI mid-save.
 *
 * `showToast` is fire-and-forget feedback. `confirm` returns a promise so the
 * old `if (!window.confirm(...)) return;` guard becomes
 * `if (!(await confirm({...}))) return;` with no other restructuring.
 */

const ToastContext = createContext(null);

const DEFAULT_DURATIONS = { error: 10000, warning: 8000, success: 5000, info: 5000 };

let nextToastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const timersRef = useRef(new Map());
  const confirmButtonRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback((options) => {
    const { tone = 'info', title = '', message = '', duration } = typeof options === 'string'
      ? { message: options }
      : (options || {});
    nextToastId += 1;
    const id = nextToastId;
    setToasts((current) => [...current, { id, tone, title, message }]);

    const ms = Number.isFinite(Number(duration)) ? Number(duration) : (DEFAULT_DURATIONS[tone] ?? 5000);
    if (ms > 0) {
      const timer = setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
        timersRef.current.delete(id);
      }, ms);
      timersRef.current.set(id, timer);
    }
    return id;
  }, []);

  // Capture the ref value at effect setup so cleanup cannot read a different
  // Map than the one whose timers it is clearing.
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const confirm = useCallback((options = {}) => new Promise((resolve) => {
    previouslyFocusedRef.current = document.activeElement;
    setConfirmState({
      title: options.title || 'Are you sure?',
      message: options.message || '',
      confirmLabel: options.confirmLabel || 'Continue',
      cancelLabel: options.cancelLabel || 'Cancel',
      tone: options.tone || 'primary',
      resolve,
    });
  }), []);

  const closeConfirm = useCallback((result) => {
    setConfirmState((current) => {
      current?.resolve?.(result);
      return null;
    });
    // Return focus to whatever opened the dialog, so keyboard users are not
    // dumped back at the top of the document.
    const previous = previouslyFocusedRef.current;
    if (previous && typeof previous.focus === 'function') {
      window.requestAnimationFrame(() => previous.focus());
    }
  }, []);

  useEffect(() => {
    if (!confirmState) return undefined;
    confirmButtonRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeConfirm(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [confirmState, closeConfirm]);

  const value = useMemo(() => ({
    showToast,
    dismissToast,
    confirm,
    toastSuccess: (title, message) => showToast({ tone: 'success', title, message }),
    toastError: (title, message) => showToast({ tone: 'error', title, message }),
    toastInfo: (title, message) => showToast({ tone: 'info', title, message }),
    toastWarning: (title, message) => showToast({ tone: 'warning', title, message }),
  }), [showToast, dismissToast, confirm]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Two regions: errors interrupt, everything else waits for a pause. */}
      <div className="mm-toast-viewport">
        <div aria-live="assertive" aria-atomic="false" style={{ display: 'contents' }}>
          {toasts.filter((toast) => toast.tone === 'error').map((toast) => (
            <ToastRow key={toast.id} toast={toast} onDismiss={dismissToast} />
          ))}
        </div>
        <div aria-live="polite" aria-atomic="false" style={{ display: 'contents' }}>
          {toasts.filter((toast) => toast.tone !== 'error').map((toast) => (
            <ToastRow key={toast.id} toast={toast} onDismiss={dismissToast} />
          ))}
        </div>
      </div>

      {confirmState && (
        <div
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeConfirm(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 19000, background: 'rgba(32,33,36,0.72)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="mm-confirm-title"
            aria-describedby={confirmState.message ? 'mm-confirm-message' : undefined}
            style={{
              width: '100%', maxWidth: '460px', background: 'var(--mm-surface)',
              borderRadius: 'var(--mm-radius-lg)', boxShadow: 'var(--mm-shadow-lg)',
              padding: '26px 28px', textAlign: 'left',
            }}
          >
            <h2 id="mm-confirm-title" style={{ margin: 0, fontSize: '19px', color: 'var(--mm-ink)' }}>
              {confirmState.title}
            </h2>
            {confirmState.message && (
              <p id="mm-confirm-message" style={{ margin: '10px 0 0', color: 'var(--mm-ink-muted)', lineHeight: 1.55, whiteSpace: 'pre-line' }}>
                {confirmState.message}
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px', flexWrap: 'wrap' }}>
              <button type="button" className="mm-btn mm-btn--neutral" onClick={() => closeConfirm(false)}>
                {confirmState.cancelLabel}
              </button>
              <button
                type="button"
                ref={confirmButtonRef}
                className={`mm-btn ${confirmState.tone === 'danger' ? 'mm-btn--danger' : 'mm-btn--primary'}`}
                onClick={() => closeConfirm(true)}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}

function ToastRow({ toast, onDismiss }) {
  return (
    <div className="mm-toast" data-tone={toast.tone}>
      <div className="mm-toast__body">
        {toast.title && <p className="mm-toast__title">{toast.title}</p>}
        {toast.message && <p className="mm-toast__message">{toast.message}</p>}
      </div>
      <button type="button" className="mm-toast__close" onClick={() => onDismiss(toast.id)} aria-label="Dismiss notification">
        &times;
      </button>
    </div>
  );
}

/**
 * Falls back to a no-op-ish shim rather than throwing when a component renders
 * outside the provider. A missing toast must never blank the screen — the
 * worst case is feedback routed back to the native dialog.
 */
export function useToast() {
  const context = useContext(ToastContext);
  if (context) return context;
  return {
    showToast: ({ title, message } = {}) => window.alert([title, message].filter(Boolean).join('\n\n')),
    dismissToast: () => {},
    confirm: ({ title, message } = {}) => Promise.resolve(window.confirm([title, message].filter(Boolean).join('\n\n'))),
    toastSuccess: (title, message) => window.alert([title, message].filter(Boolean).join('\n\n')),
    toastError: (title, message) => window.alert([title, message].filter(Boolean).join('\n\n')),
    toastInfo: (title, message) => window.alert([title, message].filter(Boolean).join('\n\n')),
    toastWarning: (title, message) => window.alert([title, message].filter(Boolean).join('\n\n')),
  };
}
