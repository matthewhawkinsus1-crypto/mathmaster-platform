import React, { createContext, useContext } from 'react';

const DEFAULT_LIFECYCLE = Object.freeze({ terminal: false, positionsReadable: false });

const QuestionLifecycleContext = createContext(DEFAULT_LIFECYCLE);

// QuestionEngine is the sole authority for whether the current question may
// still be edited. Keeping that signal above the complete module tree means
// presentation infrastructure can react consistently without every legacy,
// registry, and nested tool having to accept and forward another prop.
//
// `terminal` is "no more edits" (the keypad closes, the work is read-only). It is
// NOT "the answer may be read out": a DOL the window closed on, a waiting
// Warm-Up or a section a teacher locked is terminal and shows no solution, and
// a teacher can reopen it. `positionsReadable` is that second fact — the
// outcome is shown and the question is finished — and it alone lets a figure's
// screen-reader description read positions (graphDescription.js 'features').
// Fails closed: false unless the host says so.
export const QuestionLifecycleProvider = ({ terminal = false, positionsReadable = false, children }) => (
  <QuestionLifecycleContext.Provider value={{ terminal: Boolean(terminal), positionsReadable: positionsReadable === true }}>
    {children}
  </QuestionLifecycleContext.Provider>
);

export const useQuestionLifecycle = () => useContext(QuestionLifecycleContext);

export default QuestionLifecycleContext;
