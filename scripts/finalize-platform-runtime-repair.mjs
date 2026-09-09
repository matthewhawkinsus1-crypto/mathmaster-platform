import { readFile, writeFile } from 'node:fs/promises';

const replaceOnce = (source, before, after, label) => {
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0) throw new Error(`${label}: anchor not found`);
  if (first !== last) throw new Error(`${label}: anchor matched more than once`);
  return `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
};

const update = async (path, transform) => {
  const before = await readFile(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`${path}: no change`);
  await writeFile(path, after);
};

await update('src/platform/workflow/WorkflowRunner.jsx', (source) => {
  let next = source;

  next = replaceOnce(
    next,
    "function ChoiceStage({ stage, value, onChange, disabled, controlsBranch = false }) {",
    "function ChoiceStage({ stage, value, onChange, disabled, controlsBranch = false, showFigure = true }) {",
    'ChoiceStage signature',
  );

  next = replaceOnce(
    next,
    "    {stage?.previewOnGraph\n      ? <ChoicePreviewGraph stage={stage} value={value} />\n      : <StageFigure graph={stage?.graph} label={stage?.prompt} />}",
    "    {stage?.previewOnGraph\n      ? <ChoicePreviewGraph stage={stage} value={value} />\n      : showFigure ? <StageFigure graph={stage?.graph} label={stage?.prompt} /> : null}",
    'ChoiceStage figure suppression',
  );

  next = replaceOnce(
    next,
    "          sourceGraph={stage.graph || content?.graph || null}",
    "          // Prefer the exact authored evidence graph over a stage-level\n          // reconstructed fallback. This preserves the original window, points,\n          // labels, restrictions, and styling the student is meant to analyze.\n          sourceGraph={content?.graph || stage.graph || null}",
    'graph feature authored evidence priority',
  );

  next = replaceOnce(
    next,
    "    case 'pointInput':\n      return <PointInputStage stage={stage} value={value} onChange={onChange} disabled={disabled} />;",
    "    case 'pointInput':\n      return (\n        <>\n          {showFigure ? <StageFigure graph={stage?.graph} label={stage?.prompt} /> : null}\n          <PointInputStage stage={stage} value={value} onChange={onChange} disabled={disabled} />\n        </>\n      );",
    'point input figure suppression',
  );

  next = replaceOnce(
    next,
    "    case 'classification':\n    case 'multipleChoice':\n      return <ChoiceStage stage={stage} value={value} onChange={onChange} disabled={disabled} controlsBranch={controlsBranch} />;",
    "    case 'classification':\n    case 'multipleChoice':\n      return <ChoiceStage stage={stage} value={value} onChange={onChange} disabled={disabled} controlsBranch={controlsBranch} showFigure={showFigure} />;",
    'choice figure suppression wiring',
  );

  next = replaceOnce(
    next,
    "  const graphReference = selectPersistentWorkflowGraph({ content, workflow, checkedGraph });\n  const graphReferenceTitle = checkedGraph ? 'Your checked graph' : 'Graph for this question';\n  const graphReferenceDescription = checkedGraph\n    ? 'Use the graph you just completed while answering the remaining analysis steps.'\n    : 'Keep this graph in view while you answer each analysis step.';",
    "  const graphReference = selectPersistentWorkflowGraph({ content, workflow, checkedGraph });\n  const activeStageHasOwnGraphWorkspace = ['graphFeatureSelect', 'coordinatePlot', 'functionGraph'].includes(activeStage?.kind);\n  const showPersistentGraphReference = Boolean(graphReference && !activeStageHasOwnGraphWorkspace);\n  const graphReferenceTitle = checkedGraph ? 'Your checked graph' : 'Graph for this question';\n  const graphReferenceDescription = checkedGraph\n    ? 'Use the graph you just completed while answering the remaining analysis steps.'\n    : 'Keep this graph in view while you answer each analysis step.';",
    'persistent graph visibility',
  );

  next = replaceOnce(
    next,
    "              showFigure={focusMode ? !graphReference : figureStageIds.has(stage.id)}",
    "              showFigure={focusMode ? !showPersistentGraphReference : figureStageIds.has(stage.id)}",
    'focus figure suppression',
  );

  next = replaceOnce(
    next,
    "        <div className={graphReference ? 'workflow-focus__workspace-body workflow-focus__workspace-body--with-graph' : 'workflow-focus__workspace-body'}>",
    "        <div className={showPersistentGraphReference ? 'workflow-focus__workspace-body workflow-focus__workspace-body--with-graph' : 'workflow-focus__workspace-body'}>",
    'workspace graph layout',
  );

  next = replaceOnce(
    next,
    "          {graphReference && (\n            <aside className=\"workflow-focus__graph-reference\" aria-label={graphReferenceTitle}>",
    "          {showPersistentGraphReference && (\n            <aside className=\"workflow-focus__graph-reference\" aria-label={graphReferenceTitle}>",
    'graph reference rendering',
  );

  return next;
});

await update('tests/platform/workflowPresentationRuntime.test.mjs', (source) => {
  const before = `test('WorkflowRunner and MobileViewportContainer wire active task and persistent graph presentation into the student shell', async () => {
  const runner = await readFile(new URL('../../src/platform/workflow/WorkflowRunner.jsx', import.meta.url), 'utf8');
  const viewport = await readFile(new URL('../../src/components/student/MobileViewportContainer.jsx', import.meta.url), 'utf8');

  assert.match(runner, /currentStagePrompt/);
  assert.match(runner, /selectPersistentWorkflowGraph/);
  assert.match(runner, /content\\?\\.graph \\|\\| stage\\.graph/);
  assert.match(viewport, /workflow-focus__stage-shell--active/);
  assert.match(viewport, /workflowTaskPrompt/);
});`;

  const after = `test('WorkflowRunner and QuestionEngine wire active task and one persistent graph into the student shell', async () => {
  const runner = await readFile(new URL('../../src/platform/workflow/WorkflowRunner.jsx', import.meta.url), 'utf8');
  const engine = await readFile(new URL('../../src/QuestionEngine.jsx', import.meta.url), 'utf8');

  assert.match(runner, /currentStagePrompt/);
  assert.match(runner, /selectPersistentWorkflowGraph/);
  assert.match(runner, /showPersistentGraphReference/);
  assert.match(runner, /sourceGraph=\\{content\\?\\.graph \\|\\| stage\\.graph \\|\\| null\\}/);
  assert.match(runner, /showFigure=\\{showFigure\\}/);
  assert.match(engine, /workflowGuidanceState\\?\\.currentStagePrompt/);
});`;

  return replaceOnce(source, before, after, 'workflow presentation wiring regression');
});

console.log('Final workflow presentation repair applied.');
