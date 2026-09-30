import { createContext, createElement, useContext } from 'react';

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
 */
const AnswerFocusPolicyContext = createContext(null);

export function AnswerFocusPolicyProvider({ allowed, children }) {
  return createElement(AnswerFocusPolicyContext.Provider, { value: { allowed: Boolean(allowed) } }, children);
}

/** `{ allowed }` from the hosting question, or null when nothing hosts this tool. */
export const useAnswerFocusPolicy = () => useContext(AnswerFocusPolicyContext);
