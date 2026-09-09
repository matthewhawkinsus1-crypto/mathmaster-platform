import { readFile, writeFile } from 'node:fs/promises';

const replaceOnce = (source, search, replacement, label) => {
  const matches = typeof search === 'string'
    ? source.split(search).length - 1
    : [...source.matchAll(new RegExp(search.source, search.flags.includes('g') ? search.flags : `${search.flags}g`))].length;
  if (matches !== 1) {
    throw new Error(`${label}: expected exactly one match, found ${matches}`);
  }
  return source.replace(search, replacement);
};

const updateFile = async (path, transform) => {
  const before = await readFile(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`${path}: transform made no change`);
  await writeFile(path, after);
};

await updateFile('src/problemGenerator.js', (source) => {
  const pattern = /export const generateQuestion = \(question, generationKey, studentProfile = null, adaptation = null\) => \{[\s\S]*?\n\};\n\nexport const isPersonalizedBlueprint/;
  const replacement = `const buildPlatformQuestionError = (question, error) => {
  const rawReason = String(
    error?.generationReason
    || error?.reason
    || error?.message
    || 'question_generation_failed',
  );
  const reason = rawReason
    .replace(/^Could not generate assignment question:\\s*/i, '')
    .replace(/\\.$/, '')
    .trim() || 'question_generation_failed';
  const questionId = question?.questionId || question?.id || null;

  return {
    ...(questionId ? { id: questionId, questionId } : { id: 'platform-question-error' }),
    type: 'platformQuestionError',
    activityRole: question?.activityRole,
    prompt: 'This question could not be prepared. Continue with the rest of the assignment.',
    platformError: {
      sourceType: question?.type || null,
      reason,
    },
    ...(question?.standard ? { standard: question.standard } : {}),
    ...(question?.teks ? { teks: question.teks } : {}),
    ...(Array.isArray(question?.alignments) ? { alignments: question.alignments } : {}),
    ...(question?.dok != null ? { dok: question.dok } : {}),
    ...(question?.difficultyBand != null ? { difficultyBand: question.difficultyBand } : {}),
  };
};

export const generateQuestion = (question, generationKey, studentProfile = null, adaptation = null) => {
  if (!question) return null;

  try {
    const adaptiveQuestion = applyAdaptiveDifferentiation(question, studentProfile, {
      targetBandOverride: adaptation?.adapted ? adaptation.difficultyBand : null,
    }).question;
    // Apply accommodations/modifications after adaptive selection so a student
    // support plan always wins if the two would otherwise change the same field.
    const supportedQuestion = applyStudentSupportToQuestion(adaptiveQuestion, studentProfile).question;
    const candidate = generateQuestionFromKey(supportedQuestion, generationKey);
    const replacement = getReplacementKeyParts(generationKey);
    if (!replacement || replacement.variantIndex <= 0) return candidate;

    const previous = generateQuestionFromKey(
      supportedQuestion,
      \`${'${replacement.baseKey}'}|variant:${'${replacement.variantIndex - 1}'}\`,
    );
    const previousFingerprint = JSON.stringify(previous);
    if (JSON.stringify(candidate) !== previousFingerprint) return candidate;

    for (let reroll = 1; reroll <= 12; reroll += 1) {
      const rerolled = generateQuestionFromKey(
        supportedQuestion,
        \`${'${generationKey}'}|replacement-reroll:${'${reroll}'}\`,
      );
      if (JSON.stringify(rerolled) !== previousFingerprint) return rerolled;
    }

    return candidate;
  } catch (error) {
    // Generation/preparation failures belong to the individual question. The
    // assignment shell must remain usable so the student can continue and the
    // teacher can repair this one item without losing the rest of the work.
    return buildPlatformQuestionError(question, error);
  }
};

export const isPersonalizedBlueprint`;
  return replaceOnce(source, pattern, replacement, 'problemGenerator generateQuestion');
});

await updateFile('src/QuestionEngine.jsx', (source) => {
  let next = source;
  next = replaceOnce(
    next,
    "      case 'contextInterpretation':\n        return <ContextInterpretation {...commonModuleProps} />;\n      default:",
    "      case 'contextInterpretation':\n        return <ContextInterpretation {...commonModuleProps} />;\n      case 'platformQuestionError':\n        return (\n          <div role=\"alert\" style={{ padding: '22px 24px', margin: '0 auto', maxWidth: '640px', borderRadius: '12px', background: '#fef7e0', border: '1px solid #f9ab00', textAlign: 'left' }}>\n            <h3 style={{ margin: 0, color: '#7a4f00' }}>This question is temporarily unavailable</h3>\n            <p style={{ margin: '10px 0 0', lineHeight: 1.55 }}>\n              MathMaster could not prepare this question correctly. You can continue with the rest of the assignment; this item will not trap you on this screen.\n            </p>\n          </div>\n        );\n      default:",
    'QuestionEngine platform error case',
  );
  next = replaceOnce(
    next,
    "  const shouldShowSubmit = !missingToolDefinition && processedQuestion?.type !== 'modelingLab' && (processedQuestion?.type !== 'stepAlgebra' || answerState.isComplete);",
    "  const shouldShowSubmit = !missingToolDefinition && processedQuestion?.type !== 'modelingLab' && processedQuestion?.type !== 'platformQuestionError' && (processedQuestion?.type !== 'stepAlgebra' || answerState.isComplete);",
    'QuestionEngine submit suppression',
  );
  next = replaceOnce(
    next,
    "        promptText={processedQuestion?.prompt || processedQuestion?.scenario || 'Complete the math task.'}",
    "        promptText={workflowGuidanceState?.currentStagePrompt || processedQuestion?.prompt || processedQuestion?.scenario || 'Complete the math task.'}",
    'QuestionEngine active task prompt',
  );
  return next;
});

await updateFile('src/platform/workflow/WorkflowRunner.jsx', (source) => {
  let next = source;
  next = replaceOnce(
    next,
    "import { workflowEndpointMarkers } from './workflowGraphVisuals.js';\nimport './WorkflowFocusMode.css';",
    "import { workflowEndpointMarkers } from './workflowGraphVisuals.js';\nimport { resolveWorkflowTaskPrompt, selectPersistentWorkflowGraph } from './workflowPresentation.js';\nimport './WorkflowFocusMode.css';",
    'WorkflowRunner presentation import',
  );
  next = replaceOnce(
    next,
    "    const currentStage = stages[currentIndex] || null;\n    onProgressChangeRef.current?.({\n      ...progressState,\n      currentStageId: currentStage?.id || null,\n      currentStageKind: currentStage?.kind || null,\n      currentStageIndex: currentStage ? currentIndex : null,\n    });",
    "    const currentStage = stages[currentIndex] || null;\n    const currentStagePrompt = resolveWorkflowTaskPrompt({ workflow: stages, activeStageIndex: currentIndex });\n    onProgressChangeRef.current?.({\n      ...progressState,\n      currentStageId: currentStage?.id || null,\n      currentStageKind: currentStage?.kind || null,\n      currentStageIndex: currentStage ? currentIndex : null,\n      currentStagePrompt,\n    });",
    'WorkflowRunner progress prompt',
  );
  next = replaceOnce(
    next,
    "  const graphReference = checkedGraphReference({\n    workflow,\n    responses,\n    content,\n    grading,\n    activeStageIndex: safeActiveIndex,\n  });",
    "  const checkedGraph = checkedGraphReference({\n    workflow,\n    responses,\n    content,\n    grading,\n    activeStageIndex: safeActiveIndex,\n  });\n  const graphReference = selectPersistentWorkflowGraph({ content, workflow, checkedGraph });\n  const graphReferenceTitle = checkedGraph ? 'Your checked graph' : 'Graph for this question';\n  const graphReferenceDescription = checkedGraph\n    ? 'Use the graph you just completed while answering the remaining analysis steps.'\n    : 'Keep this graph in view while you answer each analysis step.';",
    'WorkflowRunner persistent graph selection',
  );
  next = replaceOnce(
    next,
    "              showFigure={focusMode || figureStageIds.has(stage.id)}",
    "              showFigure={focusMode ? !graphReference : figureStageIds.has(stage.id)}",
    'WorkflowRunner duplicate graph suppression',
  );
  next = replaceOnce(
    next,
    "            <aside className=\"workflow-focus__graph-reference\" aria-label=\"Your checked graph\">\n              <div className=\"workflow-focus__graph-reference-title\">Your checked graph</div>\n              <p>Use the graph you just completed while answering the remaining analysis steps.</p>\n              <GraphDisplay graph={graphReference} title=\"Your checked graph\" />\n            </aside>",
    "            <aside className=\"workflow-focus__graph-reference\" aria-label={graphReferenceTitle}>\n              <div className=\"workflow-focus__graph-reference-title\">{graphReferenceTitle}</div>\n              <p>{graphReferenceDescription}</p>\n              <GraphDisplay graph={graphReference} title={graphReferenceTitle} />\n            </aside>",
    'WorkflowRunner graph reference copy',
  );
  return next;
});

console.log('Platform runtime repair transforms applied successfully.');
