/*
 * THE CONTRACT THAT STOPS THIS BUG COMING BACK.
 *
 * Students lost unfinished work because a registry tool could hold the whole of
 * their answer in `useState` and look completely finished: it rendered, it
 * graded, it passed every test. Nothing anywhere said that a workspace which is
 * remounted on navigation cannot keep the student's answer in component state.
 *
 * So it is said here, per tool, in a file Node can read:
 *
 *   studentStatePersistence   'draft-backed' — the student can edit mathematics
 *                             in this tool, and every such value goes through
 *                             `usePersistentToolState`.
 *                             'read-only' — the tool has nothing a student can
 *                             answer with. It displays.
 *
 *   transientState            The `useState` calls that are allowed to stay
 *                             transient, each with the reason. Presentation,
 *                             never mathematics: a camera, a hover, a menu, a
 *                             message that is regenerated from state anyway.
 *
 * `tests/platform/toolDraftPersistenceContract.test.mjs` reads every registry
 * tool's source and fails on any `useState` that is not named here. A new tool
 * whose answer sits in `useState` cannot ship silently: the gate names the
 * field, and the author either moves it to the draft-backed hook or writes down
 * why it is only presentation.
 */

export const STUDENT_STATE_PERSISTENCE_MODES = Object.freeze(['draft-backed', 'read-only']);

const entry = (sources, transientState = {}, studentStatePersistence = 'draft-backed') => Object.freeze({
  studentStatePersistence,
  sources: Object.freeze(sources),
  transientState: Object.freeze(transientState),
});

export const TOOL_STATE_PERSISTENCE = Object.freeze({
  dataModelingLab: entry(['dataModeling/DataModelingLab.jsx']),
  regressionCalculator: entry(['regressionCalculator/RegressionCalculator.jsx'], {
    selectedId: 'Which row the cursor is in. Selection, not an answer.',
    editOpen: 'Row editor open/closed.',
    addMenuOpen: 'Add menu open/closed.',
    collapsed: 'Whether the list is collapsed.',
    notice: 'Transient status line, regenerated from the action that raised it.',
    redoDepth: 'Mirror of the redo stack depth, for enabling a button.',
  }),
  inverseCompositionLab: entry([
    'inverseComposition/InverseCompositionLabRouter.jsx',
    'inverseComposition/InverseCompositionLab.jsx',
    'inverseComposition/InverseDerivationLab.jsx',
  ], {
    operationError: 'Why the last operation was rejected. Error text, not work.',
  }),
  functionOperationsLab: entry(['functionOperations/FunctionOperationsLab.jsx']),
  // Every field a student can actually answer with in the student-build
  // inequality mode (boundary construction, style, shading, classification,
  // test-point reasoning, vertices, modeling constraints) is
  // `usePersistentToolState`-backed. What is listed below is only which
  // graph tap currently means, plus the
  // last-check feedback strings for the reasoning panels — none of it is
  // mathematics, all of it is regenerated the moment a student re-opens the
  // card or re-runs a check.
  // 3×3 substitution (#341): the whole reduction round — source choice,
  // isolation, token, every target's substitution and standard form, the
  // back-substitution and the verification — is ONE draft-backed, versioned
  // field (`reduction`), read back through `repairReductionState`. The reduced
  // 2×2 is AlgebraicSystemMode itself under its own draft scope, so its fields
  // persist exactly as a standalone 2×2's do.
  // 3×3 elimination (#359) and the three-plane model share the same rule:
  // EliminationReductionMode's whole round is ONE draft-backed, versioned field
  // (`elimination`) read back through `repairEliminationState`; the three-plane
  // model keeps plane visibility, the reveal and the interpretation draft-backed.
  // They were missing from this audit until #361.
  systemsWorkspace: entry(['systemsWorkspace/SystemsWorkspace.jsx', 'systemsWorkspace/AlgebraicSystemMode.jsx', 'systemsWorkspace/SubstitutionReductionMode.jsx', 'systemsWorkspace/EliminationReductionMode.jsx', 'systemsWorkspace/Algebraic3SystemMode.jsx', 'systemsWorkspace/ThreePlaneWorkspace.jsx'], {
    armed: 'What the next graph tap will place (a boundary point, a shaded side, a vertex, or a test point). Selection, not an answer.',
    teacherPointFeedback: 'The message under the teacher test-point reasoning panel, regenerated from the response already stored in teacherPointResponse.',
    studentPointFeedback: 'The message under the student test-point reasoning panel, regenerated from the response already stored in studentPointResponse.',
    vertexFeedback: 'The message under the vertex panel, regenerated from the vertex answers already stored in vertices.',
    slotAttempt: 'Transient pick-up/drop feedback for substitution, back-substitution, multiplier placement, equation combination, and verification. It records the currently armed token or last rejected destination, while every committed mathematical choice remains in the draft-backed systems fields.',
    scaleEditors: 'Which elimination equation has its optional scale-factor editor open. Presentation-only; the actual multiplier value and all mathematical work remain in draft-backed systems fields.',
    dragOverVariable: 'Which variable token is physically under the pointer during a drag. Hover-only presentation state that clears on drag leave/drop and never represents a mathematical choice.',
    embeddedUndoController: 'Transient bridge to the currently visible Step Algebra undo controller. It contains callbacks/canUndo presentation state, not student mathematics; the actual algebra history remains draft-backed inside Step Algebra.',
    reductionFeedback: 'The neutral message for the last rejected 3×3 move (wrong variable, source equation, and so on). Regenerated by the next move; never mathematics.',
    armedToken: 'Which 3×3 token (substitution expression, back-substitution value, or verification value) is picked up for select-then-place. Selection, not an answer.',
    subsystemUndoController: 'Transient bridge to the reduced 2×2 subsystem\'s Undo controller, captured so the 3×3 workspace can order Undo most-local-first. Callbacks, not mathematics.',
    subsystemReport: 'Mirror of the reduced 2×2 subsystem\'s solution as it last reported it. The subsystem\'s own draft-backed fields are the source of truth and are read directly on first render.',
    feedbackNote: 'The neutral message for the last rejected 3×3 elimination move (a pair without the variable, a repeated pair, a product that does not match). Regenerated by the next move; never mathematics.',
    showSolvedSubsystem: 'Whether the solved reduced 2×2 is unfolded for review. Presentation-only; the 2×2 work itself is draft-backed under its own scope.',
    camera: 'The three-plane model\'s rotation angle. A viewing angle, not an answer; Reset view restores the default.',
    hasInteracted: 'Whether the student has touched the three-plane model yet, so the pre-interaction idle orbit (#387) stops. Resets for a new system; motion bookkeeping, not an answer.',
    reduceMotion: 'Mirror of the device\'s prefers-reduced-motion setting, read from matchMedia, that suppresses the idle orbit. An accessibility preference, never mathematics.',
    orbitBudgetSpent: 'Whether the idle orbit has used its ten-second budget and stopped for good (deep dive 2026-10-01 §10.6). Resets for a new system; motion bookkeeping, not an answer.',
    modelOnScreen: 'Mirror of the IntersectionObserver report on the three-plane model, so the idle orbit pauses while it is scrolled out of view. Viewport bookkeeping, never mathematics.',
    pageHidden: 'Mirror of document.hidden, so the idle orbit pauses in a hidden tab. Page visibility, never mathematics.',
  }),
  parabolaGeometryLab: entry(['parabolaGeometry/ParabolaGeometryLab.jsx']),
  polynomialWorkshop: entry(['polynomialWorkshop/PolynomialWorkshop.jsx']),
  signSolutionAnalyzer: entry(['signSolutionAnalyzer/SignSolutionAnalyzer.jsx']),
  sequenceExplorer: entry(['sequenceExplorer/SequenceExplorer.jsx'], {
    plotMessage: 'Why a click was not a valid term position. Error text.',
  }),
  complexPlaneLab: entry(['complexPlane/ComplexPlaneLab.jsx']),
  exponentialLogBridge: entry(['exponentialLog/ExponentialLogBridge.jsx']),
  transformationsLab: entry(['transformations/TransformationsLab.jsx']),
  representationMatch: entry(['representationMatch/RepresentationMatch.jsx'], {
    activeLineSlot: 'Which line slot linearConnections cards are currently tapped into. Selection, not an answer.',
  }),
  functionInvestigation2: entry(['functionInvestigation2/FunctionInvestigation2.jsx']),
  graphing2: entry(['graphing2/Graphing2.jsx']),
  stepAlgebra2: entry(['stepAlgebra2/StepAlgebra2.jsx', 'stepAlgebra2/RewriteLinearForm.jsx', 'stepAlgebra2/LinearIntercepts.jsx'], {
    inputError: 'Why an operand was rejected. Error text, not a step.',
    // RewriteLinearForm hosts StepByStepAlgebraCore, which persists its own work
    // (equation, open structure tool, step log) in its per-question draft.
    coreUndo: 'The embedded Step Algebra Undo controller (callbacks). Wiring, not an answer.',
    localMessage: 'Why the current intercept path needs attention. Feedback text, not mathematical work.',
    zeroArmed: 'Whether the movable zero token is selected. Interaction state, not an answer.',
  }),
  // Nothing here is answerable: it renders an attempt that has already been
  // graded. A draft would have nothing to hold.
  solutionReview2: entry(['solutionReview2/SolutionReview2.jsx'], {}, 'read-only'),
  intervalNumberLine: entry(['intervalNumberLine/IntervalNumberLine.jsx'], {
    viewport: 'The camera. Presentation — panning must never look like an edit.',
    endpointError: 'Why a typed endpoint was rejected. Error text.',
    dragging: 'Which endpoint the finger is currently on. Gone at pointer-up.',
  }),
  relationMapping: entry(['relationMapping/RelationMapping.jsx'], {
    hoverPoint: 'The cursor preview on the plane.',
    selectedDomain: 'Which domain value is armed for the next arrow. Selection.',
  }),
  openSortBoard: entry(['openSortBoard/OpenSortBoard.jsx'], {
    selectedId: 'Which card is picked up. Selection, not a placement.',
  }),
  constraintFunctionBuilder: entry(['constraintFunctionBuilder/ConstraintFunctionBuilder.jsx']),
  linearTableWorkbench: entry(['linearTableWorkbench/LinearTableWorkbench.jsx'], {
    selectedRows: 'Which rows are currently picked up before a comparison is recorded. Selection, not committed evidence.',
    editingEvidenceIndex: 'Which already-recorded interval is open in the edit controls. Editor selection only; the committed evidence stays draft-backed until Save changes.',
    notice: 'Transient status line, regenerated from the action that raised it.',
    redoDepth: 'Mirror of the redo stack depth, for enabling a button.',
  }),
  expressionMeaning: entry(['expressionMeaning/ExpressionMeaning.jsx'], {
    activeId: "Which expression's meaning row is open for editing. Selection, not an answer.",
  }),
  // Process Mode (the Multiple Representations board's interactionMode
  // "process") keeps the student's process log and the work inside each
  // method draft-backed on the board (`processLog`, `processDraft`); an
  // embedded Step Algebra workspace keeps its own draft, as it does in every
  // tool. What stays transient below is presentation or a mirror of that.
  representationBridge: entry([
    'representationBridge/RepresentationBridge.jsx',
    'representationBridge/LinearMultipleRepresentationsBoard.jsx',
    'representationBridge/process/ProcessWorkspace.jsx',
    'representationBridge/process/ProcessMethods.jsx',
    'representationBridge/process/ProcessAlgebraMethods.jsx',
    'representationBridge/process/ProcessBoardParts.jsx',
    'representationBridge/process/processUi.jsx',
  ], {
    selectedRows: 'Which table rows are currently picked up before a comparison is recorded. Selection, not committed evidence.',
    activeHighlight: 'Which concept (rate/start/zero) is emphasized across every panel. UI emphasis, not an answer, and does not need to persist.',
    activeMeaningRow: 'Which meaning row (m/b/c) is open for editing. Selection, not an answer.',
    notice: 'Transient status line, regenerated from the action that raised it.',
    redoDepth: 'Mirror of the redo stack depth, for enabling a button.',
    enlargedGraph: 'Which graph is currently open in modal enlarged view.',
    confirmSubmit: 'Whether the "some parts are still empty" confirmation is showing. A prompt, not work.',
    undoReveal: 'Which card the last Undo changed, so the board can bring it into view and outline it. Presentation of a change the shared Undo history already made; the history itself is useMathUndoHistory\'s.',
    processNotice: 'Process Mode: the line under "What I know" naming the fact just established and the cards it opened. Regenerated from the process log, which is draft-backed.',
    processScroll: 'Process Mode: a counter that asks the board to bring the process workspace into view after "Find". Presentation only.',
    liveWork: 'Process Mode: a mirror, per method, of the equation and steps an embedded Step Algebra workspace reports. That workspace keeps them in its own draft and reports them again whenever it opens.',
    lastCheck: 'Process Mode: the message and field colours from the last Check of the work on screen. Regenerated by pressing Check again; what Check recorded is in the draft-backed process log.',
    enlarged: 'Process Mode: whether the process workspace fills the screen. Presentation only.',
    coreUndo: 'Process Mode: the embedded Step Algebra workspace\'s Undo controller, for the Undo button. The workspace owns its history.',
  }),
});

export const getToolStatePersistence = (toolId) => TOOL_STATE_PERSISTENCE[toolId] || null;

/** The tools a student can answer with, and which therefore must be draft-backed. */
export const draftBackedToolIds = () => Object.entries(TOOL_STATE_PERSISTENCE)
  .filter(([, value]) => value.studentStatePersistence === 'draft-backed')
  .map(([toolId]) => toolId);

/*
 * Shared tool components are audited too, and separately, because they hold no
 * question identity of their own: `CoordinatePlane` reports a point up to
 * whichever tool mounted it and must never persist one itself, and `ToolShell`
 * owns nothing but its own disclosure.
 */
export const SHARED_TOOL_TRANSIENT_STATE = Object.freeze({
  'shared/CoordinatePlane.jsx': Object.freeze({
    view: 'Zoom and pan. The camera is presentation and is excluded from undo too.',
    pointerPreview: 'Where the cursor is hovering.',
    keyboardCursor: 'Where the keyboard cursor is.',
    hoveredPointIndex: 'Which plotted point is under the cursor.',
    keyboardActive: 'Whether the keyboard cursor is showing.',
    dragIndex: 'Which point the current gesture is moving. Gone at pointer-up.',
    gestureActive: 'Whether a pointer gesture is in progress.',
    keyboardHelpVisible: 'Whether the plane has keyboard focus, which shows the keyboard plotting help.',
  }),
  'shared/ToolShell.jsx': Object.freeze({
    revealed: 'Whether the hint list is open.',
    wrapped: 'Whether a verdict pill wraps at its current width, which sets its corner radius (PQ-032). Measured layout.',
    slot: 'This verdict area\'s token in the question\'s attempt-outcome registry (PQ-022). Which slot shows an outcome is presentation; the outcome itself is the engine\'s grading result.',
    taskCards: 'How many TaskCards opened their fold with this tool\'s description (PQ-023), which decides whether the header still offers "About this tool". Layout.',
  }),
  'shared/useToolSubmission.js': Object.freeze({
    feedback: 'The verdict for the last submission. A grading result, never a draft.',
  }),
});
