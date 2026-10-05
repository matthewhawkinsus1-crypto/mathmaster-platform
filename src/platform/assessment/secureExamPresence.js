import { useSyncExternalStore } from 'react';

/*
 * IS A SECURE EXAM RUNNING ON THIS SCREEN RIGHT NOW?
 *
 * The secure container owns the screen while a student is testing, but the
 * shell around it did not know that: the Warm-Up banner (with its "Go to
 * Warm-Up" button) and the Pack-Up banner were drawn ABOVE the exam — above
 * even the proctor-lock overlay — and the browser's Back button quietly
 * unmounted the exam mid-question. The container announces itself here, and
 * the shell reads it to stand those interruptions down until the exam is
 * submitted or left deliberately.
 *
 * Deliberately tiny: one id or null, no persistence. A refresh ends the
 * announcement with the page, which is correct — the exam must be resumed
 * through its card, which re-checks the server's gate.
 */

let activeExamSessionId = null;
const listeners = new Set();

const notify = () => listeners.forEach((listener) => listener());

export const setSecureExamActive = (examSessionId) => {
  const next = examSessionId ? String(examSessionId) : null;
  if (next === activeExamSessionId) return;
  activeExamSessionId = next;
  notify();
};

export const clearSecureExamActive = (examSessionId = null) => {
  if (examSessionId && String(examSessionId) !== activeExamSessionId) return;
  setSecureExamActive(null);
};

export const isSecureExamActive = () => Boolean(activeExamSessionId);

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useSecureExamActive = () => useSyncExternalStore(
  subscribe,
  () => activeExamSessionId,
  () => null,
);
