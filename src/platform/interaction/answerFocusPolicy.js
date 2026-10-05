import { createContext, createElement, useContext, useLayoutEffect, useMemo, useState } from 'react';
import { createDeferredFocusAuthority } from './deferredFocusAuthority.js';

/*
 * ONE ANSWER TO "MAY THIS QUESTION PUT THE CURSOR IN A BOX WHEN IT OPENS?"
 *
 * QuestionEngine decides it — it knows whether the question is locked, behind a
 * scaffold, composed, on a phone or on a touch-first tablet (see
 * shouldFocusAnswerOnOpen). ToolShell used to decide for itself, and its answer
 * was always yes: every registry tool focused its first input on mount, so on a
 * phone the number keypad opened over a table the student had not read, and on
 * an iPad the math keypad covered half a board, even though QuestionEngine had
 * already chosen not to focus anything.
 *
 * A tool reads the host's decision from here. Without a host (the tools lab
 * bench) it applies the same policy itself.
 *
 * AND WHEN. The question also hands down its deferred-focus authority
 * (deferredFocusAuthority.js, DeferredFocusProvider): every focus anything in
 * it asks for on a later frame — a registry tool's autofocus, a math field a
 * Step Algebra action sends the student to — goes through the same question's
 * generation, so a press or a key the student made in the meantime cancels it
 * as surely as the question's own.
 */
const AnswerFocusPolicyContext = createContext(null);
const DeferredFocusContext = createContext(null);

export function AnswerFocusPolicyProvider({ allowed, children }) {
  const value = useMemo(() => ({ allowed: Boolean(allowed) }), [allowed]);
  return createElement(AnswerFocusPolicyContext.Provider, { value }, children);
}

/** `{ allowed }` from the hosting question, or null when nothing hosts this tool. */
export const useAnswerFocusPolicy = () => useContext(AnswerFocusPolicyContext);

/** Everything under a question shares its deferred-focus authority. */
export function DeferredFocusProvider({ authority, children }) {
  return createElement(DeferredFocusContext.Provider, { value: authority || null }, children);
}

/** The hosting question's deferred-focus authority, or null outside one. */
export const useDeferredFocusHost = () => useContext(DeferredFocusContext);

/**
 * A deferred-focus authority for one mount: started before any child effect
 * can ask it for a focus (layout effects run before passive ones), stopped on
 * unmount, which drops whatever it still had pending. StrictMode's second
 * mount starts a fresh generation. `enabled: false` keeps it stopped (no
 * listeners) for a component that uses its host's instead.
 */
export function useDeferredFocusAuthority({ enabled = true } = {}) {
  const [authority] = useState(() => createDeferredFocusAuthority());
  useLayoutEffect(() => {
    if (!enabled) return undefined;
    authority.start();
    return () => authority.stop();
  }, [authority, enabled]);
  return authority;
}

/** The hosting question's authority, or — with no host — one of this component's own. */
export function useHostedDeferredFocusAuthority() {
  const hosted = useDeferredFocusHost();
  const own = useDeferredFocusAuthority({ enabled: !hosted });
  return hosted || own;
}
