import React, { createContext, useContext } from 'react';

const DEFAULT_RUNTIME = {
  showImmediateFeedback: true,
  // Several labs were built as a developer bench and draw the expected result
  // next to the input that asks for it — the intersection point of a system,
  // the composed value of f(g(x)), the product on the complex plane. That is
  // correct for a teacher previewing a tool and ruins the item for a student,
  // so answers stay hidden unless a surface explicitly opts in.
  revealAnswers: false,
};

const ToolRuntimeContext = createContext(DEFAULT_RUNTIME);

export const ToolRuntimeProvider = ({ showImmediateFeedback = true, revealAnswers = false, children }) => (
  <ToolRuntimeContext.Provider value={{
    showImmediateFeedback: Boolean(showImmediateFeedback),
    revealAnswers: Boolean(revealAnswers),
  }}>
    {children}
  </ToolRuntimeContext.Provider>
);

export const useToolRuntimeContext = () => useContext(ToolRuntimeContext);

// Convenience for the many render sites that only care whether the worked
// answer may be shown. Defaults to hidden outside a provider.
export const useRevealAnswers = () => useContext(ToolRuntimeContext).revealAnswers === true;

export default ToolRuntimeContext;
