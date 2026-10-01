import React, { createContext, useContext } from 'react';

const DEFAULT_RUNTIME = {
  showImmediateFeedback: true,
  questionTerminal: false,
  // Several labs were built as a developer bench and draw the expected result
  // next to the input that asks for it — the intersection point of a system,
  // the composed value of f(g(x)), the product on the complex plane. That is
  // correct for a teacher previewing a tool and ruins the item for a student,
  // so answers stay hidden unless a surface explicitly opts in.
  revealAnswers: false,
  // WHETHER A TOOL MAY OFFER ITS HINTS AT ALL.
  //
  // The activity decides, never the tool or the question: a DOL, quiz or test
  // carries `hintsAllowed: false` in its policy, and every hint affordance in
  // a registry tool reads it from here. Recording a hint's use is not enough —
  // on an exit ticket the hint itself is the help the activity withholds.
  // Defaults to allowed, so a surface with no activity (the tools lab, a
  // teacher's bench) keeps the hints it always had.
  hintsAllowed: true,
  // Who to tell when a hint is revealed somewhere the tool itself does not
  // see — the Work View Help drawer. QuestionEngine passes its hint recorder;
  // outside an activity there is nobody to tell.
  onHintUsed: null,
};

const ToolRuntimeContext = createContext(DEFAULT_RUNTIME);

export const ToolRuntimeProvider = ({ showImmediateFeedback = true, revealAnswers = false, questionTerminal = false, hintsAllowed = true, onHintUsed = null, children }) => (
  <ToolRuntimeContext.Provider value={{
    showImmediateFeedback: Boolean(showImmediateFeedback),
    revealAnswers: Boolean(revealAnswers),
    questionTerminal: Boolean(questionTerminal),
    // Only an explicit `false` withholds hints, the same reading QuestionEngine
    // gives the policy field (`hintsAllowed !== false`).
    hintsAllowed: hintsAllowed !== false,
    onHintUsed: typeof onHintUsed === 'function' ? onHintUsed : null,
  }}>
    {children}
  </ToolRuntimeContext.Provider>
);

export const useToolRuntimeContext = () => useContext(ToolRuntimeContext);

// Convenience for the many render sites that only care whether the worked
// answer may be shown. Defaults to hidden outside a provider.
export const useRevealAnswers = () => useContext(ToolRuntimeContext).revealAnswers === true;

// Convenience for every hint affordance. Defaults to allowed outside a provider.
export const useHintsAllowed = () => useContext(ToolRuntimeContext).hintsAllowed !== false;

// The activity's hint recorder, or null. Defaults to null outside a provider.
export const useHintUseReporter = () => useContext(ToolRuntimeContext).onHintUsed || null;

export default ToolRuntimeContext;
