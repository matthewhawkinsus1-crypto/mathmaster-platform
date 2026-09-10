const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const clean = (value) => String(value ?? '').trim();
const lower = (value) => clean(value).toLowerCase();
const asArray = (value) => Array.isArray(value) ? value : [];

export const ASSIGNMENT_RUNTIME_REPAIR_VERSION = 1;

export const RUNTIME_REPAIR_KEYS = Object.freeze({
  NO_SYNTHETIC_FUNCTION_MODELING_GRAPH: 'function-modeling-exact-ask-no-synthetic-graph-v1',
  ACTIVE_WORKFLOW_TASK: 'workflow-active-task-presentation-v1',
  AUTHORED_GRAPH_PERSISTENCE: 'workflow-authored-graph-persistence-v1',
  COLLAPSED_WORKFLOW: 'collapsed-generated-workflow-v1',
});

const recipeName = (question = {}) => {
  if (typeof question?.recipe === 'string') return lower(question.recipe);
  return lower(question?.recipe?.name || question?.recipe?.recipe);
};

const recipeAsk = (question = {}) => (
  asArray(question?.recipe?.ask).map((value) => lower(value)).filter(Boolean)
);

const isFunctionModelingQuestion = (question = {}) => (
  lower(question?.type) === 'relationshipmodel'
  || recipeName(question) === 'functionmodeling'
);

const isFunctionCharacteristicsQuestion = (question = {}) => {
  const type = lower(question?.type);
  const recipe = recipeName(question);
  return type === 'functioncharacteristics'
    || type === 'graphanalysis'
    || recipe === 'functioncharacteristics';
};

const asksForGraph = (question = {}) => recipeAsk(question).includes('graph');
const hasExplicitAsk = (question = {}) => recipeAsk(question).length > 0;

const hasGraphStudentAction = (question = {}) => (
  asArray(question?.studentActions).some((action) => /graph|plot/i.test(clean(action)))
);

const hasAuthoredGraphEvidence = (question = {}) => (
  isObject(question?.graph)
  || isObject(question?.content?.graph)
);

const gradingUsesGraph = (grading) => {
  if (!isObject(grading)) return false;
  return Object.entries(grading).some(([key, value]) => (
    /graph|plot/i.test(key)
    || (isObject(value) && gradingUsesGraph(value))
  ));
};

const workflowGraphStages = (question = {}) => (
  asArray(question?.workflow).filter((stage) => {
    if (!isObject(stage)) return false;
    const kind = lower(stage.kind);
    return kind === 'graphconstruction' || kind === 'functiongraph' || kind === 'coordinateplot';
  })
);

const generatedWorkflowSource = (question = {}) => lower(question?.workflowProvenance?.source);

const diagnostic = ({ question, repairKey, code, message }) => ({
  issueKind: 'platformIssue',
  source: 'runtimeCompatibility',
  code: `runtimeRepair.${repairKey}.${code}`,
  severity: 'warning',
  questionId: clean(question?.questionId) || null,
  repairKey,
  message,
});

const noSyntheticGraphRule = (question = {}) => {
  const repairKey = RUNTIME_REPAIR_KEYS.NO_SYNTHETIC_FUNCTION_MODELING_GRAPH;
  if (!isFunctionModelingQuestion(question) || !hasExplicitAsk(question) || asksForGraph(question)) {
    return { applies: false };
  }

  const graphStages = workflowGraphStages(question);
  if (!graphStages.length) {
    // The authored/current District DOL shape is already correct. Recording the
    // evaluated compatibility key lets Repair Center resolve the old platform
    // report without manufacturing or persisting a workflow just to do so.
    return {
      applies: true,
      question,
      changed: false,
      safeToPersist: false,
      diagnostics: [],
    };
  }

  const provenance = generatedWorkflowSource(question);
  if (provenance === 'authored') {
    return {
      applies: true,
      question,
      changed: false,
      safeToPersist: false,
      diagnostics: [diagnostic({
        question,
        repairKey,
        code: 'blocked',
        message: 'The graph stage is marked as an authored workflow, so MathMaster preserved it instead of treating it as generated compatibility state.',
      })],
    };
  }

  if (provenance !== 'recipeexpansion') {
    return {
      applies: true,
      question,
      changed: false,
      safeToPersist: false,
      diagnostics: [diagnostic({
        question,
        repairKey,
        code: 'ambiguous',
        message: 'The workflow contains a graph stage but its origin is ambiguous. MathMaster preserved it rather than guessing that it was platform-generated.',
      })],
    };
  }

  if (hasAuthoredGraphEvidence(question)) {
    return {
      applies: true,
      question,
      changed: false,
      safeToPersist: false,
      diagnostics: [diagnostic({
        question,
        repairKey,
        code: 'blocked',
        message: 'The question contains authored graph evidence, so MathMaster preserved the graph workflow and did not apply an automatic content repair.',
      })],
    };
  }

  if (hasGraphStudentAction(question)) {
    return {
      applies: true,
      question,
      changed: false,
      safeToPersist: false,
      diagnostics: [diagnostic({
        question,
        repairKey,
        code: 'blocked',
        message: 'The authored student actions include graph work, so MathMaster preserved the graph stage.',
      })],
    };
  }

  if (gradingUsesGraph(question?.grading)) {
    return {
      applies: true,
      question,
      changed: false,
      safeToPersist: false,
      diagnostics: [diagnostic({
        question,
        repairKey,
        code: 'blocked',
        message: 'The grading contract depends on graph work, so MathMaster preserved the graph stage instead of changing grading meaning.',
      })],
    };
  }

  // This is intentionally narrow. Only the old generated graph-construction
  // stage is removed. Other workflow stages, prompts, grading, authored
  // evidence, ids and question metadata remain byte-for-byte owned by the
  // saved assignment.
  const repairedWorkflow = asArray(question.workflow).filter((stage) => (
    !isObject(stage) || lower(stage.kind) !== 'graphconstruction'
  ));

  if (repairedWorkflow.length === asArray(question.workflow).length) {
    return {
      applies: true,
      question,
      changed: false,
      safeToPersist: false,
      diagnostics: [diagnostic({
        question,
        repairKey,
        code: 'ambiguous',
        message: 'MathMaster found graph-related workflow state, but it did not match the known generated graph-construction defect exactly.',
      })],
    };
  }

  return {
    applies: true,
    question: { ...question, workflow: repairedWorkflow },
    changed: true,
    safeToPersist: true,
    diagnostics: [],
  };
};

/**
 * Recognize only the exact pre-provenance V5 collapse that already carries
 * enough recipe intent to rebuild itself. Nothing is written: readComposedQuestion
 * expands the saved recipe in memory. The marker exists so library/review code
 * knows it must not hunt for a sibling assignment or copy somebody else's JSON.
 */
const isKnownSelfContainedCollapsedWorkflow = (question = {}) => {
  if (asArray(question?.workflow).length > 0) return false;
  if (generatedWorkflowSource(question)) return false;
  if (lower(question?.type) !== 'functiongraph') return false;
  if (question?.studentChoosesX !== true) return false;
  if (recipeName(question) !== 'functionmodeling') return false;
  const ask = recipeAsk(question);
  if (ask.length < 2 || !ask.includes('graph')) return false;
  const functionSpec = isObject(question?.functionSpec) ? question.functionSpec : {};
  return lower(functionSpec.type) === 'linear'
    && Number(functionSpec.m) === 1
    && Number(functionSpec.b) === 0;
};

const presentationRulesFor = (question = {}) => {
  const keys = [];

  // PR #165 made the active workflow stage the canonical YOUR TASK text and
  // preserved the exact authored graph as shared evidence. These are runtime
  // presentation guarantees; correct saved questions do not need content
  // rewrites to benefit from them.
  if (isFunctionCharacteristicsQuestion(question)) {
    keys.push(RUNTIME_REPAIR_KEYS.ACTIVE_WORKFLOW_TASK);
    if (hasAuthoredGraphEvidence(question)) {
      keys.push(RUNTIME_REPAIR_KEYS.AUTHORED_GRAPH_PERSISTENCE);
    }
  }

  if (isKnownSelfContainedCollapsedWorkflow(question)) {
    keys.push(RUNTIME_REPAIR_KEYS.COLLAPSED_WORKFLOW);
  }

  return keys;
};

export const repairQuestionForCurrentRuntime = (question = {}, context = {}) => {
  const source = isObject(question) ? question : {};
  const repairKeys = [];
  const diagnostics = [];
  let repaired = source;
  let changed = false;
  let changedSafely = true;

  try {
    const graphRule = noSyntheticGraphRule(repaired, context);
    if (graphRule.applies) {
      repairKeys.push(RUNTIME_REPAIR_KEYS.NO_SYNTHETIC_FUNCTION_MODELING_GRAPH);
      diagnostics.push(...asArray(graphRule.diagnostics));
      if (graphRule.changed) {
        repaired = graphRule.question;
        changed = true;
        changedSafely = changedSafely && graphRule.safeToPersist === true;
      }
    }
  } catch (error) {
    diagnostics.push(diagnostic({
      question: source,
      repairKey: RUNTIME_REPAIR_KEYS.NO_SYNTHETIC_FUNCTION_MODELING_GRAPH,
      code: 'failed',
      message: `MathMaster could not evaluate the known function-modeling graph compatibility repair: ${error?.message || String(error)}`,
    }));
    repaired = source;
    changed = false;
    changedSafely = false;
  }

  presentationRulesFor(repaired).forEach((repairKey) => {
    if (!repairKeys.includes(repairKey)) repairKeys.push(repairKey);
  });

  return {
    question: repaired,
    changed,
    repairKeys,
    presentationOnly: !changed && repairKeys.length > 0,
    safeToPersist: changed && changedSafely,
    diagnostics,
  };
};

export const repairAssignmentForCurrentRuntime = (assignment = {}, context = {}) => {
  const source = isObject(assignment) ? assignment : {};
  const sections = asArray(source.sections);
  const repairManifest = [];
  const diagnostics = [];
  let changed = false;
  let everyChangedQuestionIsSafe = true;

  const repairedSections = sections.map((section) => {
    if (!isObject(section) || !Array.isArray(section.questions)) return section;
    let sectionChanged = false;

    const questions = section.questions.map((question) => {
      const result = repairQuestionForCurrentRuntime(question, {
        ...context,
        assignment: source,
        section,
      });

      diagnostics.push(...result.diagnostics);
      result.repairKeys.forEach((repairKey) => {
        repairManifest.push({
          questionId: clean(question?.questionId) || null,
          repairKey,
          runtimeVersion: ASSIGNMENT_RUNTIME_REPAIR_VERSION,
          changed: result.changed,
          safeToPersist: result.safeToPersist,
          presentationOnly: result.presentationOnly,
        });
      });

      if (!result.changed) return question;
      changed = true;
      sectionChanged = true;
      everyChangedQuestionIsSafe = everyChangedQuestionIsSafe && result.safeToPersist === true;
      return result.question;
    });

    return sectionChanged ? { ...section, questions } : section;
  });

  return {
    assignment: changed ? { ...source, sections: repairedSections } : source,
    changed,
    repairManifest,
    safeToPersist: changed && everyChangedQuestionIsSafe,
    diagnostics,
  };
};

export default repairAssignmentForCurrentRuntime;
