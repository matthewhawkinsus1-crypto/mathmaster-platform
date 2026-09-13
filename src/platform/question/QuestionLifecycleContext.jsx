import React, { createContext, useContext } from 'react';

const DEFAULT_LIFECYCLE = Object.freeze({ terminal: false });

const QuestionLifecycleContext = createContext(DEFAULT_LIFECYCLE);

// QuestionEngine is the sole authority for whether the current question may
// still be edited. Keeping that signal above the complete module tree means
// presentation infrastructure can react consistently without every legacy,
// registry, and nested tool having to accept and forward another prop.
export const QuestionLifecycleProvider = ({ terminal = false, children }) => (
  <QuestionLifecycleContext.Provider value={{ terminal: Boolean(terminal) }}>
    {children}
  </QuestionLifecycleContext.Provider>
);

export const useQuestionLifecycle = () => useContext(QuestionLifecycleContext);

export default QuestionLifecycleContext;
