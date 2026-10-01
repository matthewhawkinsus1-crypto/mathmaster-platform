/*
 * WHAT WENT WRONG ON THIS DEVICE, IN A FORM A TEACHER CAN SEND.
 *
 * When a screen fails, a student or teacher could only describe it ("it went
 * red") or read a raw stack trace off the screen. This keeps a short local
 * record of client failures — what kind, a scrubbed message, which build, which
 * screen — so the error panels can offer "Copy details for your teacher" and
 * support can tell a stale tab from a real defect.
 *
 * PRIVACY. Nothing here leaves the device on its own; it is copied only when a
 * person presses the button. And what is kept is scrubbed before it is stored:
 * no email addresses, no long digit runs (ids, phone numbers), no query
 * strings, at most 240 characters of message, and no stack, which can quote
 * code that holds question content. Student answers, names and answer keys are
 * never passed in by any caller.
 */

import { getMathMasterBuildInfo } from './buildInfo.js';

export const CLIENT_DIAGNOSTICS_STORAGE_KEY = 'mm:client-diagnostics';
export const CLIENT_DIAGNOSTICS_LIMIT = 25;
const MESSAGE_LIMIT = 240;

const memoryLog = [];

/** Remove what could identify a person or carry content, and bound the size. */
export const scrubDiagnosticText = (value) => String(value ?? '')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
  .replace(/\?[^\s'"]*/g, '')
  .replace(/\d{7,}/g, '[number]')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, MESSAGE_LIMIT);

const storage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

const readStored = () => {
  try {
    const parsed = JSON.parse(storage()?.getItem(CLIENT_DIAGNOSTICS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const screenPath = () => {
  try {
    return scrubDiagnosticText(window.location.pathname || '/');
  } catch {
    return '';
  }
};

/**
 * Keep one failure. `kind` is a short machine word (chunk-load, render-error,
 * unhandled-rejection, window-error); `source` names the boundary or listener.
 */
export const recordClientDiagnostic = ({ kind, message, source = '' } = {}) => {
  const build = getMathMasterBuildInfo();
  const entry = {
    at: new Date().toISOString(),
    kind: scrubDiagnosticText(kind || 'error').slice(0, 40),
    source: scrubDiagnosticText(source).slice(0, 60),
    message: scrubDiagnosticText(message),
    build: build?.gitSha ? String(build.gitSha).slice(0, 12) : 'unknown',
    screen: screenPath(),
    online: typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean' ? navigator.onLine : null,
  };
  const stored = [...readStored(), entry].slice(-CLIENT_DIAGNOSTICS_LIMIT);
  try {
    storage()?.setItem(CLIENT_DIAGNOSTICS_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Storage full or blocked: keep it for this page at least.
    memoryLog.push(entry);
    if (memoryLog.length > CLIENT_DIAGNOSTICS_LIMIT) memoryLog.shift();
  }
  return entry;
};

export const readClientDiagnostics = () => [...readStored(), ...memoryLog].slice(-CLIENT_DIAGNOSTICS_LIMIT);

/** A plain-text summary for "Copy details for your teacher". */
export const formatClientDiagnostics = ({ entries = readClientDiagnostics(), limit = 5 } = {}) => {
  const build = getMathMasterBuildInfo();
  const lines = [
    `MathMaster build ${build?.gitSha ? String(build.gitSha).slice(0, 12) : 'unknown'}${build?.builtAt ? ` (built ${build.builtAt})` : ''}`,
    `Reported ${new Date().toISOString()}`,
  ];
  entries.slice(-limit).forEach((entry) => {
    lines.push(`- ${entry.at} ${entry.kind}${entry.source ? ` in ${entry.source}` : ''} on ${entry.screen || '/'}: ${entry.message || '(no message)'}${entry.build && entry.build !== (build?.gitSha || '').slice(0, 12) ? ` [build ${entry.build}]` : ''}${entry.online === false ? ' [offline]' : ''}`);
  });
  return lines.join('\n');
};

export const clearClientDiagnostics = () => {
  memoryLog.length = 0;
  try {
    storage()?.removeItem(CLIENT_DIAGNOSTICS_STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
};

let installed = false;

/**
 * Record (never display) failures nothing else caught. Installed once, at
 * startup; also exposes the log to support as `window.__MATHMASTER_DIAGNOSTICS__()`.
 */
export const installClientDiagnostics = (target = typeof window !== 'undefined' ? window : null) => {
  if (!target || installed) return;
  installed = true;
  target.addEventListener('error', (event) => {
    // A failed <script>/<link> is reported by index.html's boot recovery.
    if (event?.target && event.target !== target) return;
    recordClientDiagnostic({ kind: 'window-error', message: event?.message || event?.error?.message, source: 'window' });
  });
  target.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    recordClientDiagnostic({ kind: 'unhandled-rejection', message: reason?.message || String(reason ?? ''), source: 'promise' });
  });
  target.__MATHMASTER_DIAGNOSTICS__ = () => readClientDiagnostics();
};
