import { readFile, writeFile } from 'node:fs/promises';

const replaceOnce = (source, oldText, newText, label) => {
  if (!source.includes(oldText)) throw new Error(`Could not locate ${label}`);
  return source.replace(oldText, newText);
};

// QuestionEngine owns the assignment-level understanding of solver workspace mode.
const questionPath = 'src/QuestionEngine.jsx';
let question = await readFile(questionPath, 'utf8');
question = replaceOnce(
  question,
  `  const [undoController, setUndoController] = useState(null);\n  const [scratchpadOpen, setScratchpadOpen] = useState(false);`,
  `  const [undoController, setUndoController] = useState(null);\n  const [solverWorkspaceMode, setSolverWorkspaceMode] = useState('normal');\n  const solverWorkspaceActive = solverWorkspaceMode !== 'normal';\n  const [scratchpadOpen, setScratchpadOpen] = useState(false);`,
  'QuestionEngine solver workspace state',
);
question = replaceOnce(
  question,
  `    setUndoController(null);\n    setScratchpadOpen(false);`,
  `    setUndoController(null);\n    setSolverWorkspaceMode('normal');\n    setScratchpadOpen(false);`,
  'QuestionEngine question reset',
);
question = replaceOnce(
  question,
  `    onUndoStateChange: registerUndo,\n    feedback: showOutcomeFeedback ? feedback : null,`,
  `    onUndoStateChange: registerUndo,\n    workspaceMode: solverWorkspaceMode,\n    onWorkspaceModeChange: setSolverWorkspaceMode,\n    feedback: showOutcomeFeedback ? feedback : null,`,
  'QuestionEngine common module workspace props',
);
question = replaceOnce(
  question,
  `        contextPanel={questionContextPanel}\n        workBar={questionWorkBar}`,
  `        contextPanel={solverWorkspaceActive ? null : questionContextPanel}\n        workspaceMode={solverWorkspaceMode}\n        workBar={questionWorkBar}`,
  'QuestionEngine MobileViewport workspace mode',
);
question = replaceOnce(
  question,
  `        <GuidedClassworkCoach\n          question={processedQuestion}\n          draftKey={draftKey}\n          enabled={resolvedActivityPolicy?.hintsAllowed !== false && guidedNotesMode !== 'off' && (guidedMode || supportPresentation.visualChunking)}\n          mode={guidedNotesMode}\n          activeStageId={workflowGuidanceState?.currentStageId || null}\n          workflowProgress={workflowGuidanceState}\n          disabled={locked}\n        />`,
  `        {!solverWorkspaceActive && (\n          <GuidedClassworkCoach\n            question={processedQuestion}\n            draftKey={draftKey}\n            enabled={resolvedActivityPolicy?.hintsAllowed !== false && guidedNotesMode !== 'off' && (guidedMode || supportPresentation.visualChunking)}\n            mode={guidedNotesMode}\n            activeStageId={workflowGuidanceState?.currentStageId || null}\n            workflowProgress={workflowGuidanceState}\n            disabled={locked}\n          />\n        )}`,
  'QuestionEngine guided coach workspace gate',
);
await writeFile(questionPath, question);

// The frame still owns its local layout transition, but reports it upward.
const framePath = 'src/components/common/SolverWorkspaceFrame.jsx';
let frame = await readFile(framePath, 'utf8');
frame = replaceOnce(
  frame,
  `  workspaceKind = 'algebra',\n  focusPanel = null,\n}) {`,
  `  workspaceKind = 'algebra',\n  focusPanel = null,\n  onWorkspaceModeChange = null,\n}) {`,
  'SolverWorkspaceFrame mode callback prop',
);
frame = replaceOnce(
  frame,
  `  useEffect(() => {\n    setMode('normal');\n    setZoom(1);\n    setFocusPanelOpen(true);\n  }, [workspaceKey]);\n\n  useEffect(() => {\n    if (mode === 'normal') {`,
  `  useEffect(() => {\n    setMode('normal');\n    setZoom(1);\n    setFocusPanelOpen(true);\n  }, [workspaceKey]);\n\n  useEffect(() => {\n    onWorkspaceModeChange?.(mode);\n  }, [mode, onWorkspaceModeChange]);\n\n  useEffect(() => () => {\n    onWorkspaceModeChange?.('normal');\n  }, [onWorkspaceModeChange]);\n\n  useEffect(() => {\n    if (mode === 'normal') {`,
  'SolverWorkspaceFrame mode reporting effects',
);
await writeFile(framePath, frame);

// Both public solver wrappers forward the frame callback while leaving their cores mounted once.
for (const wrapperPath of ['src/StepByStepAlgebra.jsx', 'src/MultiRelationAlgebra.jsx']) {
  let wrapper = await readFile(wrapperPath, 'utf8');
  wrapper = replaceOnce(
    wrapper,
    `      focusPanel={focusPanel}\n    >`,
    `      focusPanel={focusPanel}\n      onWorkspaceModeChange={props.onWorkspaceModeChange}\n    >`,
    `${wrapperPath} workspace callback`,
  );
  await writeFile(wrapperPath, wrapper);
}

// The viewport hides assignment chrome while preserving the student's previous Task-collapse choice.
const mobilePath = 'src/components/student/MobileViewportContainer.jsx';
let mobile = await readFile(mobilePath, 'utf8');
mobile = replaceOnce(
  mobile,
  `  workBar = null,\n  responseFields = null,\n}) => {`,
  `  workBar = null,\n  responseFields = null,\n  workspaceMode = 'normal',\n}) => {`,
  'MobileViewport workspaceMode prop',
);
mobile = replaceOnce(
  mobile,
  `  const [isPromptCollapsed, setIsPromptCollapsed] = useState(false);\n  const [isMobile, setIsMobile] = useState(detectMobile);`,
  `  const [isPromptCollapsed, setIsPromptCollapsed] = useState(false);\n  const workspaceActive = workspaceMode !== 'normal';\n  const [isMobile, setIsMobile] = useState(detectMobile);`,
  'MobileViewport workspaceActive state',
);
mobile = replaceOnce(
  mobile,
  `      className="mathmaster-desktop-question-content mathmaster-mobile-interaction-root"`,
  `      className={\`mathmaster-desktop-question-content mathmaster-mobile-interaction-root ${'${workspaceActive ? \'solver-workspace-active\' : \'\'}'}\`}`,
  'desktop workspace active class',
);
mobile = replaceOnce(
  mobile,
  `      <div className={\`mathmaster-desktop-question-anchor${'${isPromptCollapsed ? \' is-collapsed\' : \'\'}'}\`}>`,
  `      {!workspaceActive && (\n      <div className={\`mathmaster-desktop-question-anchor${'${isPromptCollapsed ? \' is-collapsed\' : \'\'}'}\`}>`,
  'desktop task anchor workspace gate start',
);
mobile = replaceOnce(
  mobile,
  `      </div>\n      {contextPanel}{responseFields}{toolWorkspace}`, 
  `      </div>\n      )}\n      {!workspaceActive && contextPanel}{responseFields}{toolWorkspace}`,
  'desktop task anchor workspace gate end',
);
mobile = replaceOnce(
  mobile,
  `      {(workBar || actionButtons) && (\n        <div className="mathmaster-desktop-action-bar">`,
  `      {!workspaceActive && (workBar || actionButtons) && (\n        <div className="mathmaster-desktop-action-bar">`,
  'desktop action bar workspace gate',
);
mobile = replaceOnce(
  mobile,
  `      className={\`mathmaster-question-container mathmaster-mobile-interaction-root ${'${isLandscape ? \'mode-landscape\' : \'mode-portrait\'}'} ${'${numericTarget ? \'numeric-keypad-open\' : \'\'}'}\`}`,
  `      className={\`mathmaster-question-container mathmaster-mobile-interaction-root ${'${isLandscape ? \'mode-landscape\' : \'mode-portrait\'}'} ${'${numericTarget ? \'numeric-keypad-open\' : \'\'}'} ${'${workspaceActive ? \'solver-workspace-active\' : \'\'}'}\`}`,
  'mobile workspace active class',
);
mobile = replaceOnce(
  mobile,
  `      <section className="question-prompt-panel" aria-label="Question prompt and response controls">`,
  `      {!workspaceActive && (\n      <section className="question-prompt-panel" aria-label="Question prompt and response controls">`,
  'mobile prompt workspace gate start',
);
mobile = replaceOnce(
  mobile,
  `      </section>\n\n      {contextPanel}\n      <main className="math-tool-workspace">{toolWorkspace}</main>\n\n      {!isLandscape && (actionButtons || workBar) && <div className="portrait-action-bar">{workBar}{actionButtons}</div>`,
  `      </section>\n      )}\n\n      {!workspaceActive && contextPanel}\n      <main className="math-tool-workspace">{toolWorkspace}</main>\n\n      {!workspaceActive && !isLandscape && (actionButtons || workBar) && <div className="portrait-action-bar">{workBar}{actionButtons}</div>`,
  'mobile prompt/context/action workspace gates',
);
mobile = replaceOnce(
  mobile,
  `        {isLandscape && (actionButtons || workBar) && <div className="landscape-action-bar">{workBar}{actionButtons}</div>}`,
  `        {!workspaceActive && isLandscape && (actionButtons || workBar) && <div className="landscape-action-bar">{workBar}{actionButtons}</div>}`,
  'landscape action workspace gate',
);
await writeFile(mobilePath, mobile);
