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
  // ONE HINT LADDER PER QUESTION (student pass 3, HELP-10). Where the host
  // carries the platform's hint ladder (QuestionEngine's 💡 Hint), a tool's
  // HintPanel hands its rungs to it through this (toolHintChannel.js publish)
  // and shows no ladder of its own: the platform's release rule and leak guard
  // then apply to them. Null where the host has no ladder (the tools lab, a
  // server-graded host), and the tool keeps its own panel.
  publishHints: null,
  // THE PLATFORM'S OUTCOME FOR THE LATEST ATTEMPT, SHOWN BESIDE THE TOOL'S OWN
  // VERDICT (PQ-022; see attemptOutcomeSlots.js). `attemptOutcomeSlots` is the
  // registry a verdict area joins while mounted; `attemptOutcome` is
  // { slot, text, detail, tone } when QuestionEngine hands an outcome to one of
  // them. Both null outside a question (the tools lab), and the outcome is
  // null whenever QuestionEngine shows it in its own box — or shows nothing,
  // as on a DOL before feedback is released.
  attemptOutcome: null,
  attemptOutcomeSlots: null,
  // The channel a tool reports its LIVE raw work through (see
  // useReportToolWork.js). QuestionEngine turns it into the response a
  // deadline checkpoint carries; outside an assignment it is a no-op.
  reportWork: null,
  // WHAT THE TOOL'S FINAL ACTION IS CALLED, WHEN THE HOST SAYS SO.
  //
  // On a secure Test the tool's "Check construction" does not check anything:
  // it records the student's one answer and moves on, and the verdict is
  // withheld until the teacher releases it. A button that says "Check" there
  // invites a student to press it to see whether they are right — and lose
  // the item. A secure host names the action ("Record answer"); null keeps
  // each tool's own wording everywhere else.
  submitLabel: null,
  // WHETHER THE ACTIVITY WITHHOLDS VERDICTS, as the activity says it.
  //
  // `showImmediateFeedback` above is false for two different reasons: the
  // activity withholds verdicts (a secure Test, a DOL before release), OR the
  // tool is server-graded and has no answer key to judge with. A tool that
  // judges from the student's own work (Step Algebra checks a move against the
  // equation it was applied to) needs only the first: on Corrections and My
  // Math Path practice it keeps its move coaching. Defaults to not withheld.
  verdictsWithheld: false,
  // WHETHER A TEACHER IS THE ONE LOOKING (a lesson or test preview). Teacher
  // policy copy, such as Step Algebra's "Support 3 · Standard" and its level
  // sentence, is for them; a student reads student words or nothing (pass 3,
  // Q-12). Defaults to a student, so no surface shows policy by accident.
  teacherView: false,
};

const ToolRuntimeContext = createContext(DEFAULT_RUNTIME);

export const ToolRuntimeProvider = ({ showImmediateFeedback = true, revealAnswers = false, questionTerminal = false, hintsAllowed = true, onHintUsed = null, publishHints = null, attemptOutcome = null, attemptOutcomeSlots = null, reportWork = null, submitLabel = null, verdictsWithheld = false, teacherView = false, children }) => (
  <ToolRuntimeContext.Provider value={{
    showImmediateFeedback: Boolean(showImmediateFeedback),
    revealAnswers: Boolean(revealAnswers),
    questionTerminal: Boolean(questionTerminal),
    // Only an explicit `false` withholds hints, the same reading QuestionEngine
    // gives the policy field (`hintsAllowed !== false`).
    hintsAllowed: hintsAllowed !== false,
    onHintUsed: typeof onHintUsed === 'function' ? onHintUsed : null,
    publishHints: typeof publishHints === 'function' ? publishHints : null,
    attemptOutcome: attemptOutcome && typeof attemptOutcome === 'object' ? attemptOutcome : null,
    attemptOutcomeSlots: attemptOutcomeSlots || null,
    reportWork: typeof reportWork === 'function' ? reportWork : null,
    submitLabel: typeof submitLabel === 'string' && submitLabel.trim() ? submitLabel.trim() : null,
    verdictsWithheld: verdictsWithheld === true,
    teacherView: teacherView === true,
  }}>
    {children}
  </ToolRuntimeContext.Provider>
);

export const useToolRuntimeContext = () => useContext(ToolRuntimeContext);

// Convenience for the many render sites that only care whether the worked
// answer may be shown. Defaults to hidden outside a provider.
export const useRevealAnswers = () => useContext(ToolRuntimeContext).revealAnswers === true;

// Convenience for every hint affordance. Defaults to allowed outside a provider.
export const useTeacherView = () => useContext(ToolRuntimeContext).teacherView === true;

export const useHintsAllowed = () => useContext(ToolRuntimeContext).hintsAllowed !== false;

// The label of a tool's final Check action: the host's (a secure "Record
// answer") where one is set, the tool's own everywhere else.
export const useSubmitLabel = (ownLabel) => useContext(ToolRuntimeContext).submitLabel || ownLabel;

// The host's label alone (null when the tool keeps its own), for a tool whose
// wording around that action — a panel title — must not say "Check" either.
export const useHostSubmitLabel = () => useContext(ToolRuntimeContext).submitLabel || null;

// The activity's hint recorder, or null. Defaults to null outside a provider.
export const useHintUseReporter = () => useContext(ToolRuntimeContext).onHintUsed || null;

// Where a tool's rungs go when the host carries the platform ladder, or null.
export const useToolHintPublisher = () => useContext(ToolRuntimeContext).publishHints || null;

// Whether a tool shows a hint ladder of its own: hints allowed, and no
// platform ladder to hand them to. Every tool-owned hint surface (the panel,
// a Work View Help that is only hints) reads this.
export const useOwnHintLadder = () => {
  const runtime = useContext(ToolRuntimeContext);
  return runtime.hintsAllowed !== false && !runtime.publishHints;
};

export default ToolRuntimeContext;
