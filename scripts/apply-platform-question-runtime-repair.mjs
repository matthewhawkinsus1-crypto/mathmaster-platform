import { readFile, writeFile } from 'node:fs/promises';

const replaceOnce = async (path, before, after) => {
  const source = await readFile(path, 'utf8');
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0) throw new Error(`${path}: expected repair anchor was not found`);
  if (first !== last) throw new Error(`${path}: repair anchor matched more than once`);
  await writeFile(path, `${source.slice(0, first)}${after}${source.slice(first + before.length)}`);
};

const patchProblemGenerator = async () => {
  const path = 'src/problemGenerator.js';
  await replaceOnce(
    path,
`  if (hasPathGenerator(variantQuestion)) {
    const generated = generatePathInstanceWithRetries(variantQuestion, generationKey);
    if (!generated.question) {
      throw new Error(\`Could not generate assignment question: \${generated.reason || 'invalid generator template'}\`);
    }
    return generated.question;
  }`,
`  if (hasPathGenerator(variantQuestion)) {
    const generated = generatePathInstanceWithRetries(variantQuestion, generationKey);
    if (!generated.question) {
      // Assignment delivery is a student runtime. A malformed generated family
      // must fail THIS question closed, not throw before QuestionModuleBoundary
      // exists and take the whole assignment down with it. Keep only safe
      // presentation metadata; generator/workflow/grading data must not re-enter
      // another renderer or expose an answer key.
      return {
        questionId: variantQuestion.questionId || variantQuestion.id || '',
        id: variantQuestion.id || variantQuestion.questionId || '',
        type: 'platformQuestionError',
        activityRole: variantQuestion.activityRole,
        sectionId: variantQuestion.sectionId,
        sectionTitle: variantQuestion.sectionTitle,
        alignments: Array.isArray(variantQuestion.alignments) ? variantQuestion.alignments : [],
        assessmentContext: variantQuestion.assessmentContext || null,
        prompt: 'This question could not be prepared. Continue to another question and let your teacher know.',
        platformError: {
          sourceType: String(variantQuestion.type || ''),
          sourceId: String(variantQuestion.questionId || variantQuestion.id || ''),
          reason: String(generated.reason || 'invalid_generator_template'),
        },
      };
    }
    return generated.question;
  }`,
  );

  await replaceOnce(
    path,
`  const candidate = generateQuestionFromKey(supportedQuestion, generationKey);
  const replacement = getReplacementKeyParts(generationKey);`,
`  const candidate = generateQuestionFromKey(supportedQuestion, generationKey);
  // A platform-error sentinel is already the deterministic result for this
  // source question. Do not run replacement rerolls against the malformed
  // generator; that only repeats a structural fault and can obscure its reason.
  if (candidate?.type === 'platformQuestionError') return candidate;
  const replacement = getReplacementKeyParts(generationKey);`,
  );
};

const patchWorkflowRunner = async () => {
  const path = 'src/platform/workflow/WorkflowRunner.jsx';

  await replaceOnce(
    path,
`import { buildWorkflowSummaryItems, shouldUseWorkflowFocusMode, summarizeStageResponse } from './workflowFocusMode';
import { stageFamily, stageFamilyLabel } from './stageFamilies';`,
`import { buildWorkflowSummaryItems, shouldUseWorkflowFocusMode, summarizeStageResponse } from './workflowFocusMode';
import { resolveWorkflowTaskPrompt, selectPersistentWorkflowGraph } from './workflowPresentation.js';
import { stageFamily, stageFamilyLabel } from './stageFamilies';`,
  );

  await replaceOnce(
    path,
`function ChoiceStage({ stage, value, onChange, disabled, controlsBranch = false }) {`,
`function ChoiceStage({ stage, value, onChange, disabled, controlsBranch = false, showFigure = true }) {`,
  );

  await replaceOnce(
    path,
`    {stage?.previewOnGraph
      ? <ChoicePreviewGraph stage={stage} value={value} />
      : <StageFigure graph={stage?.graph} label={stage?.prompt} />}`,
`    {stage?.previewOnGraph
      ? <ChoicePreviewGraph stage={stage} value={value} />
      : showFigure ? <StageFigure graph={stage?.graph} label={stage?.prompt} /> : null}`,
  );

  await replaceOnce(
    path,
`          sourceGraph={stage.graph || content?.graph || null}`,
`          // When the question supplies the graph students are analyzing, that
          // exact authored graph is the evidence. Stage-level reconstructed
          // graphs are fallbacks for workflows that have no authored figure.
          sourceGraph={content?.graph || stage.graph || null}`,
  );

  await replaceOnce(
    path,
`    case 'pointInput':
      return <PointInputStage stage={stage} value={value} onChange={onChange} disabled={disabled} />;`,
`    case 'pointInput':
      return (
        <>
          {showFigure ? <StageFigure graph={stage?.graph} label={stage?.prompt} /> : null}
          <PointInputStage stage={stage} value={value} onChange={onChange} disabled={disabled} />
        </>
      );`,
  );

  await replaceOnce(
    path,
`    case 'classification':
    case 'multipleChoice':
      return <ChoiceStage stage={stage} value={value} onChange={onChange} disabled={disabled} controlsBranch={controlsBranch} />;`,
`    case 'classification':
    case 'multipleChoice':
      return <ChoiceStage stage={stage} value={value} onChange={onChange} disabled={disabled} controlsBranch={controlsBranch} showFigure={showFigure} />;`,
  );

  await replaceOnce(
    path,
`      currentStageId: currentStage?.id || null,
      currentStageKind: currentStage?.kind || null,
      currentStageIndex: currentStage ? currentIndex : null,`,
`      currentStageId: currentStage?.id || null,
      currentStageKind: currentStage?.kind || null,
      currentStageIndex: currentStage ? currentIndex : null,
      currentStagePrompt: resolveWorkflowTaskPrompt({ workflow: stages, activeStageIndex: currentIndex }) || null,`,
  );

  await replaceOnce(
    path,
`  const graphReference = checkedGraphReference({
    workflow,
    responses,
    content,
    grading,
    activeStageIndex: safeActiveIndex,
  });`,
`  const checkedGraph = checkedGraphReference({
    workflow,
    responses,
    content,
    grading,
    activeStageIndex: safeActiveIndex,
  });
  const graphReference = selectPersistentWorkflowGraph({ content, workflow, checkedGraph });
  const graphReferenceIsChecked = Boolean(checkedGraph);
  const activeStageHasOwnGraphWorkspace = ['graphFeatureSelect', 'coordinatePlot', 'functionGraph'].includes(activeStage?.kind);
  const showPersistentGraphReference = Boolean(graphReference && !activeStageHasOwnGraphWorkspace);
  const graphReferenceTitle = graphReferenceIsChecked ? 'Your checked graph' : 'Graph for this question';`,
  );

  await replaceOnce(
    path,
`              showFigure={focusMode || figureStageIds.has(stage.id)}`,
`              // Focus mode owns one persistent evidence graph beside the active
              // response surface. Stacked mode keeps the existing de-duplication
              // rule. Interactive graph stages still render their own live plane.
              showFigure={focusMode ? !showPersistentGraphReference : figureStageIds.has(stage.id)}`,
  );

  await replaceOnce(
    path,
`        <div className={graphReference ? 'workflow-focus__workspace-body workflow-focus__workspace-body--with-graph' : 'workflow-focus__workspace-body'}>`,
`        <div className={showPersistentGraphReference ? 'workflow-focus__workspace-body workflow-focus__workspace-body--with-graph' : 'workflow-focus__workspace-body'}>`,
  );

  await replaceOnce(
    path,
`          {graphReference && (
            <aside className="workflow-focus__graph-reference" aria-label="Your checked graph">
              <div className="workflow-focus__graph-reference-title">Your checked graph</div>
              <p>Use the graph you just completed while answering the remaining analysis steps.</p>
              <GraphDisplay graph={graphReference} title="Your checked graph" />
            </aside>
          )}`,
`          {showPersistentGraphReference && (
            <aside className="workflow-focus__graph-reference" aria-label={graphReferenceTitle}>
              <div className="workflow-focus__graph-reference-title">{graphReferenceTitle}</div>
              <p>{graphReferenceIsChecked
                ? 'Use the graph you just completed while answering the remaining analysis steps.'
                : 'Keep this same graph in view while you move through each analysis step.'}</p>
              <GraphDisplay graph={graphReference} title={graphReferenceTitle} />
            </aside>
          )}`,
  );
};

const patchMobileViewport = async () => {
  const path = 'src/components/student/MobileViewportContainer.jsx';

  await replaceOnce(
    path,
`  const [isPromptCollapsed, setIsPromptCollapsed] = useState(false);
  const workspaceActive = workspaceMode !== 'normal';`,
`  const [isPromptCollapsed, setIsPromptCollapsed] = useState(false);
  const [workflowTaskPrompt, setWorkflowTaskPrompt] = useState('');
  const workspaceActive = workspaceMode !== 'normal';`,
  );

  await replaceOnce(
    path,
`  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const promptPanel = root.querySelector('.question-prompt-panel');`,
`  // A composed Focus Mode question has a question-level prompt plus a live
  // stage-level instruction. YOUR TASK should say what the student must do NOW.
  // Keep the presentation shell generic by reading the active workflow stage
  // that already exists inside this container; ordinary questions have no such
  // stage and continue to use promptText unchanged.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const updateWorkflowTask = () => {
      const activeStage = root.querySelector('.workflow-focus__stage-shell--active');
      const activePrompt = activeStage?.querySelector('.mathmaster-question-prompt-plain');
      const next = String(activePrompt?.textContent || '').trim();
      setWorkflowTaskPrompt((current) => (current === next ? current : next));
    };
    updateWorkflowTask();
    const observer = new MutationObserver(updateWorkflowTask);
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, [toolWorkspace]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const promptPanel = root.querySelector('.question-prompt-panel');`,
  );

  await replaceOnce(
    path,
`  const numericKeypad = isMobile && numericTarget ? (`,
`  const displayedPromptText = workflowTaskPrompt || promptText || 'Complete the math task.';

  const numericKeypad = isMobile && numericTarget ? (`,
  );

  await replaceOnce(
    path,
`              {promptText || 'Complete the math task.'}`,
`              {displayedPromptText}`,
  );

  await replaceOnce(
    path,
`        {!isPromptCollapsed && <div className="prompt-body"><QuestionPrompt variant="plain" style={{ color: '#202124', fontWeight: 800, fontSize: 18, margin: 0 }}>{promptText || 'Complete the math task.'}</QuestionPrompt>{taskMeta && <div className="mathmaster-question-task-meta">{taskMeta}</div>}{taskContextPanel && <div className="mathmaster-question-task-context">{taskContextPanel}</div>}</div>}`,
`        {!isPromptCollapsed && <div className="prompt-body"><QuestionPrompt variant="plain" style={{ color: '#202124', fontWeight: 800, fontSize: 18, margin: 0 }}>{displayedPromptText}</QuestionPrompt>{taskMeta && <div className="mathmaster-question-task-meta">{taskMeta}</div>}{taskContextPanel && <div className="mathmaster-question-task-context">{taskContextPanel}</div>}</div>}`,
  );
};

await patchProblemGenerator();
await patchWorkflowRunner();
await patchMobileViewport();
console.log('Applied platform question runtime repair anchors successfully.');