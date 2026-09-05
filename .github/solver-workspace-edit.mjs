import { readFile, writeFile } from 'node:fs/promises';

const replaceOne = (source, before, after, label) => {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Missing replacement target: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Replacement target is not unique: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
};

const replaceCount = (source, pattern, replacement, expected, label) => {
  let count = 0;
  const next = source.replace(pattern, (...args) => {
    count += 1;
    return typeof replacement === 'function' ? replacement(...args) : replacement;
  });
  if (count !== expected) throw new Error(`${label}: expected ${expected} replacements, found ${count}`);
  return next;
};

const questionPath = 'src/QuestionEngine.jsx';
let question = await readFile(questionPath, 'utf8');

question = replaceCount(
  question,
  /<(StepByStepAlgebra|MultiRelationAlgebra)\n(\s+)\{\.\.\.commonModuleProps\}\n/g,
  (_match, component, indent) => `<${component}\n${indent}{...commonModuleProps}\n${indent}workspaceActions={workspaceActions}\n`,
  4,
  'forward workspace actions to algebra wrappers',
);

question = replaceOne(
  question,
  "  const questionReferencePanel = referenceInfo\n    ? <ReferenceInfoCard referenceInfo={referenceInfo} />\n    : null;\n\n",
  "  const questionReferencePanel = referenceInfo\n    ? <ReferenceInfoCard referenceInfo={referenceInfo} />\n    : null;\n\n  const guidedCoachEnabled = resolvedActivityPolicy?.hintsAllowed !== false\n    && guidedNotesMode !== 'off'\n    && (guidedMode || supportPresentation.visualChunking);\n  const guidedCoach = (\n    <GuidedClassworkCoach\n      question={processedQuestion}\n      draftKey={draftKey}\n      enabled={guidedCoachEnabled}\n      mode={guidedNotesMode}\n      activeStageId={workflowGuidanceState?.currentStageId || null}\n      workflowProgress={workflowGuidanceState}\n      disabled={locked}\n    />\n  );\n  const submitLabel = submitting\n    ? 'Checking…'\n    : processedQuestion?.type === 'stepAlgebra'\n      ? 'Submit Solved Equation'\n      : record.attemptCount > 0\n        ? 'Submit Another Attempt'\n        : 'Submit Answer';\n  const workspaceActions = {\n    undo: {\n      label: '↶ Undo',\n      onClick: () => undoController?.onUndo?.(),\n      disabled: !undoController?.canUndo || locked,\n      title: undoController?.label || 'Undo the most recent response change',\n    },\n    scratchpad: {\n      label: scratchpadLoading ? 'Opening…' : '✎ Scratchpad',\n      onClick: openScratchpad,\n      disabled: scratchpadLoading,\n      title: 'Open the scratchpad without covering the solver controls',\n    },\n    help: guidedCoachEnabled ? {\n      label: 'Help',\n      content: guidedCoach,\n    } : null,\n    submit: !locked && shouldShowSubmit ? {\n      label: submitLabel,\n      onClick: handleSubmit,\n      disabled: submitDisabled,\n      title: 'Submit this completed question',\n    } : null,\n  };\n\n",
  'define reusable workspace actions',
);

question = replaceOne(
  question,
  "        {!solverWorkspaceActive && (\n          <GuidedClassworkCoach\n            question={processedQuestion}\n            draftKey={draftKey}\n            enabled={resolvedActivityPolicy?.hintsAllowed !== false && guidedNotesMode !== 'off' && (guidedMode || supportPresentation.visualChunking)}\n            mode={guidedNotesMode}\n            activeStageId={workflowGuidanceState?.currentStageId || null}\n            workflowProgress={workflowGuidanceState}\n            disabled={locked}\n          />\n        )}\n",
  "        {!solverWorkspaceActive && guidedCoach}\n",
  'reuse one GuidedClassworkCoach instance definition',
);

question = replaceOne(
  question,
  "          {submitting ? 'Checking…' : processedQuestion?.type === 'stepAlgebra' ? 'Submit Solved Equation' : record.attemptCount > 0 ? 'Submit Another Attempt' : 'Submit Answer'}\n",
  "          {submitLabel}\n",
  'reuse submit label in normal assignment bar',
);

await writeFile(questionPath, question);

for (const path of ['src/StepByStepAlgebra.jsx', 'src/MultiRelationAlgebra.jsx']) {
  let source = await readFile(path, 'utf8');
  source = replaceOne(
    source,
    "      focusPanel={focusPanel}\n      onWorkspaceModeChange={props.onWorkspaceModeChange}\n",
    "      focusPanel={focusPanel}\n      workspaceActions={props.workspaceActions}\n      onWorkspaceModeChange={props.onWorkspaceModeChange}\n",
    `${path} forwards workspace actions`,
  );
  await writeFile(path, source);
}

const framePath = 'src/components/common/SolverWorkspaceFrame.jsx';
let frame = await readFile(framePath, 'utf8');

frame = replaceOne(
  frame,
  "  focusPanel = null,\n  onWorkspaceModeChange = null,\n",
  "  focusPanel = null,\n  workspaceActions = null,\n  onWorkspaceModeChange = null,\n",
  'frame workspaceActions prop',
);

frame = replaceOne(
  frame,
  "  const [zoom, setZoom] = useState(1);\n  const [focusPanelOpen, setFocusPanelOpen] = useState(true);\n",
  "  const [zoom, setZoom] = useState(1);\n  const [focusPanelOpen, setFocusPanelOpen] = useState(true);\n  const [helpOpen, setHelpOpen] = useState(false);\n",
  'frame Help state',
);

frame = replaceOne(
  frame,
  "    setZoom(1);\n    setFocusPanelOpen(true);\n",
  "    setZoom(1);\n    setFocusPanelOpen(true);\n    setHelpOpen(false);\n",
  'reset Help on question change',
);

frame = replaceOne(
  frame,
  "  useEffect(() => {\n    onWorkspaceModeChange?.(mode);\n  }, [mode, onWorkspaceModeChange]);\n",
  "  useEffect(() => {\n    onWorkspaceModeChange?.(mode);\n    if (mode === 'normal') setHelpOpen(false);\n  }, [mode, onWorkspaceModeChange]);\n",
  'close Help when workspace closes',
);

frame = replaceOne(
  frame,
  "              <span className=\"solver-workspace-divider\" aria-hidden=\"true\" />\n              <div className=\"solver-workspace-zoom\" role=\"group\" aria-label=\"Workspace zoom\">\n",
  "              <span className=\"solver-workspace-divider\" aria-hidden=\"true\" />\n\n              {workspaceActions?.undo ? (\n                <button\n                  type=\"button\"\n                  className=\"solver-workspace-global-action\"\n                  onClick={workspaceActions.undo.onClick}\n                  disabled={workspaceActions.undo.disabled}\n                  title={workspaceActions.undo.title}\n                >\n                  {workspaceActions.undo.label || '↶ Undo'}\n                </button>\n              ) : null}\n\n              {workspaceActions?.scratchpad ? (\n                <button\n                  type=\"button\"\n                  className=\"solver-workspace-global-action\"\n                  onClick={workspaceActions.scratchpad.onClick}\n                  disabled={workspaceActions.scratchpad.disabled}\n                  title={workspaceActions.scratchpad.title}\n                >\n                  {workspaceActions.scratchpad.label || '✎ Scratchpad'}\n                </button>\n              ) : null}\n\n              <div className=\"solver-workspace-zoom\" role=\"group\" aria-label=\"Workspace zoom\">\n",
  'frame Undo and Scratchpad controls',
);

frame = replaceOne(
  frame,
  "              </div>\n\n              {focusPanel && mode === 'focus' ? (\n",
  "              </div>\n\n              {workspaceActions?.help ? (\n                <button\n                  type=\"button\"\n                  className={helpOpen ? 'solver-workspace-global-action is-active' : 'solver-workspace-global-action'}\n                  onClick={() => setHelpOpen((current) => !current)}\n                  aria-expanded={helpOpen}\n                  aria-controls=\"solver-workspace-help-panel\"\n                >\n                  {workspaceActions.help.label || 'Help'}\n                </button>\n              ) : null}\n\n              {focusPanel && mode === 'focus' ? (\n",
  'frame Help control',
);

frame = replaceOne(
  frame,
  "              <button\n                ref={returnRef}\n                type=\"button\"\n                className=\"solver-workspace-return\"\n",
  "              {workspaceActions?.submit ? (\n                <button\n                  type=\"button\"\n                  className=\"solver-workspace-submit\"\n                  onClick={workspaceActions.submit.onClick}\n                  disabled={workspaceActions.submit.disabled}\n                  title={workspaceActions.submit.title}\n                >\n                  {workspaceActions.submit.label || 'Submit'}\n                </button>\n              ) : null}\n\n              <button\n                ref={returnRef}\n                type=\"button\"\n                className=\"solver-workspace-return\"\n",
  'frame final Submit control',
);

frame = replaceOne(
  frame,
  "      </div>\n\n      <div className=\"solver-workspace-layout\">\n",
  "      </div>\n\n      {isOpen && helpOpen && workspaceActions?.help?.content ? (\n        <div\n          id=\"solver-workspace-help-panel\"\n          className=\"solver-workspace-help-panel\"\n          role=\"region\"\n          aria-label=\"Solver help\"\n        >\n          {workspaceActions.help.content}\n        </div>\n      ) : null}\n\n      <div className=\"solver-workspace-layout\">\n",
  'frame Help panel',
);

frame = frame.replace('role="group" aria-label="Solver workspace size"', 'role="group" aria-label="Solver workspace controls"');
await writeFile(framePath, frame);

const cssPath = 'src/components/common/SolverWorkspaceFrame.css';
let css = await readFile(cssPath, 'utf8');

css = replaceOne(
  css,
  "/* Shared full-screen algebra workspace.\n   The question engine itself becomes the overlay so task text, Guided Notes,\n   tries, Undo and the existing Scratchpad remain part of the same live UI. */\n",
  "/* Shared full-screen algebra workspace.\n   The mounted solver becomes the workspace while assignment-only chrome is\n   suppressed. Global work actions move into the compact top bar so they never\n   cover equation inputs near the bottom of the solving surface. */\n",
  'workspace CSS header comment',
);

css = replaceOne(
  css,
  "  gap: 6px;\n  flex-wrap: wrap;\n}\n",
  "  gap: 6px;\n  flex-wrap: nowrap;\n}\n",
  'wide toolbar stays one row',
);

css = replaceOne(
  css,
  ".solver-workspace-return {\n  border-color: #174ea6 !important;\n  background: #174ea6 !important;\n  color: #fff !important;\n}\n",
  ".solver-workspace-submit {\n  border-color: #174ea6 !important;\n  background: #174ea6 !important;\n  color: #fff !important;\n  box-shadow: 0 3px 9px rgba(23, 78, 166, .18);\n}\n\n.solver-workspace-return {\n  border-color: #8aa5cf !important;\n  background: #fff !important;\n  color: #174ea6 !important;\n}\n\n.solver-workspace-global-action {\n  white-space: nowrap;\n}\n\n.solver-workspace-help-panel {\n  position: sticky;\n  top: 58px;\n  z-index: 75;\n  max-height: min(38vh, 320px);\n  margin: -4px 0 10px;\n  padding: 10px 12px;\n  overflow: auto;\n  border: 1px solid #c8d5ea;\n  border-radius: 12px;\n  background: #fff;\n  box-shadow: 0 8px 24px rgba(31, 73, 125, .12);\n  text-align: left;\n}\n",
  'workspace primary submit and Help panel styles',
);

css = replaceOne(
  css,
  "@media (max-width: 1020px) {\n",
  "@media (max-width: 1180px) {\n  .solver-workspace-modebar {\n    align-items: flex-start;\n  }\n\n  .solver-workspace-modebar__controls {\n    flex-wrap: wrap;\n  }\n}\n\n@media (max-width: 1020px) {\n",
  'toolbar responsive wrapping breakpoint',
);

await writeFile(cssPath, css);
