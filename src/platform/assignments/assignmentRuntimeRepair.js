const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const clean = (value) => String(value ?? '').trim();
const lower = (value) => clean(value).toLowerCase();
const asArray = (value) => Array.isArray(value) ? value : [];

// Version 4 also recognizes the proven historical representation that copied
// the same synthetic identity graph onto both the question and its continuity
// stage. Previously the question-level copy was mistaken for authored evidence.
export const ASSIGNMENT_RUNTIME_REPAIR_VERSION = 4;

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

const sameChoiceList = (actual, expected) => {
  const values = asArray(actual).map((value) => lower(typeof value === 'string' ? value : value?.id ?? value?.label));
  return values.length === expected.length && values.every((value, index) => value === expected[index]);
};

const exactBranchStage = (stage, { id, kind, controller, choice }) => (
  isObject(stage)
  && clean(stage.id) === id
  && lower(stage.kind) === lower(kind)
  && clean(stage?.showWhen?.stage) === controller
  && lower(stage?.showWhen?.is) === lower(choice)
);

const ownsAnyNonEmptyGraphAnnotation = (graph = {}) => (
  ['points', 'lines', 'polylines', 'regions', 'verticalLines', 'horizontalLines']
    .some((key) => asArray(graph?.[key]).length > 0)
);

const identityFunctionSpec = (spec = {}) => {
  if (!isObject(spec)) return false;
  const type = lower(spec.type || spec.family);
  if (type !== 'linear' && type !== 'line') return false;

  const slopeKeys = ['m', 'slope', 'a'];
  const interceptKeys = ['b', 'intercept', 'k'];
  const slopeKey = slopeKeys.find((key) => spec[key] !== undefined && spec[key] !== null && spec[key] !== '');
  const interceptKey = interceptKeys.find((key) => spec[key] !== undefined && spec[key] !== null && spec[key] !== '');
  if (!slopeKey || !interceptKey) return false;

  const slope = Number(spec[slopeKey]);
  const intercept = Number(spec[interceptKey]);
  const horizontalShift = spec.h == null || spec.h === '' ? 0 : Number(spec.h);
  return Number.isFinite(slope)
    && Number.isFinite(intercept)
    && Number.isFinite(horizontalShift)
    && slope === 1
    && intercept === 0
    && horizontalShift === 0;
};

const identityModel = (model) => {
  let token = lower(model).replace(/\s+/g, '').replace(/\*/g, '');
  if (!token) return false;
  token = token.replace(/^f\(x\)=/, '').replace(/^y=/, '').replace(/[()]/g, '');
  return /^(?:1)?x(?:\+0|-0)?$/.test(token);
};

/**
 * The old fallback graph was not mathematical authoring. It was the identity
 * function created when an empty/default linear spec reached a renderer that
 * expected a function. Keep this signature deliberately narrow: one plain
 * identity function and no authored annotations. A real graph with points,
 * asymptotes, regions, extra lines, or a non-identity function is never swept
 * up by this compatibility rule.
 */
const isKnownSyntheticIdentityGraph = (graph = {}) => {
  if (!isObject(graph) || ownsAnyNonEmptyGraphAnnotation(graph)) return false;
  if (identityModel(graph.model)) return true;
  if (identityFunctionSpec(graph.functionSpec)) return true;

  const functions = asArray(graph.functions).filter(isObject);
  return functions.length === 1 && identityFunctionSpec(functions[0]);
};

const stableJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};

const duplicatedSyntheticQuestionGraph = (question = {}) => {
  if (!isKnownSyntheticIdentityGraph(question?.graph)) return false;
  const matchingStage = asArray(question?.workflow).find((stage) => (
    isContinuityClassificationStage(stage)
    && isKnownSyntheticIdentityGraph(stage.graph)
    && stableJson(stage.graph) === stableJson(question.graph)
  ));
  return Boolean(matchingStage);
};

const isContinuityClassificationStage = (stage = {}) => (
  isObject(stage)
  && clean(stage.id) === 'continuity'
  && lower(stage.kind) === 'classification'
  && sameChoiceList(stage.choices, ['discrete', 'continuous'])
);

const hasKnownSyntheticContinuityStageGraph = (question = {}) => (
  asArray(question?.workflow).some((stage) => (
    isContinuityClassificationStage(stage)
    && isKnownSyntheticIdentityGraph(stage.graph)
  ))
);

const stripKnownSyntheticContinuityStageGraph = (question = {}) => {
  let changed = false;
  const workflow = asArray(question?.workflow).map((stage) => {
    if (!isContinuityClassificationStage(stage) || !isKnownSyntheticIdentityGraph(stage.graph)) return stage;
    const next = { ...stage };
    delete next.graph;
    changed = true;
    return next;
  });
  if (!changed) return question;
  const repaired = { ...question, workflow };
  if (duplicatedSyntheticQuestionGraph(question)) delete repaired.graph;
  return repaired;
};

/**
 * The old bug existed before workflowProvenance was stamped. Failing closed on
 * every unstamped workflow therefore preserved the exact defect forever.
 *
 * Recognize only the generated shape we know the old functionModeling recipe
 * produced for continuity + domain (optionally range): a continuity choice,
 * the synthetic default graph step, then the generated discrete/continuous
 * branches. Any renamed/reworded graph stage, extra step, different ordering,
 * authored graph evidence, graph student action, or graph grading remains
 * outside this signature and is preserved.
 */
const isExactKnownLegacySyntheticGraphWorkflow = (question = {}) => {
  if (generatedWorkflowSource(question)) return false;
  if (recipeName(question) !== 'functionmodeling') return false;

  const ask = recipeAsk(question);
  const acceptedAsk = (
    (ask.length === 2 && ask[0] === 'continuity' && ask[1] === 'domain')
    || (ask.length === 3 && ask[0] === 'continuity' && ask[1] === 'domain' && ask[2] === 'range')
  );
  if (!acceptedAsk) return false;

  const workflow = asArray(question.workflow);
  const expectedLength = ask.includes('range') ? 6 : 4;
  if (workflow.length !== expectedLength) return false;

  const [continuity, graph, domainDiscrete, domainContinuous, ...rest] = workflow;
  if (!isObject(continuity)
    || clean(continuity.id) !== 'continuity'
    || lower(continuity.kind) !== 'classification'
    || !sameChoiceList(continuity.choices, ['discrete', 'continuous'])) return false;

  if (!isObject(graph)
    || clean(graph.id) !== 'graph'
    || lower(graph.kind) !== 'graphconstruction'
    || lower(graph.graphMode) !== 'studentselected'
    || clean(graph.continuityStageId) !== 'continuity'
    || clean(graph.prompt) !== 'Build the graph of the relationship.'
    || isObject(graph.graph)
    || isObject(graph.source)) return false;

  if (!exactBranchStage(domainDiscrete, {
    id: 'domainDiscrete', kind: 'domainInput', controller: 'continuity', choice: 'discrete',
  })) return false;
  if (!exactBranchStage(domainContinuous, {
    id: 'domainContinuous', kind: 'domainInput', controller: 'continuity', choice: 'continuous',
  })) return false;

  if (!ask.includes('range')) return rest.length === 0;
  return rest.length === 2
    && exactBranchStage(rest[0], {
      id: 'rangeDiscrete', kind: 'rangeInput', controller: 'continuity', choice: 'discrete',
    })
    && exactBranchStage(rest[1], {
      id: 'rangeContinuous', kind: 'rangeInput', controller: 'continuity', choice: 'continuous',
    });
};

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

  const provenance = generatedWorkflowSource(question);
  const staleContinuityGraph = hasKnownSyntheticContinuityStageGraph(question);
  const graphStages = workflowGraphStages(question);

  if (!staleContinuityGraph && !graphStages.length) {
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
        message: 'The graph state is marked as an authored workflow, so MathMaster preserved it instead of treating it as generated compatibility state.',
      })],
    };
  }

  if (hasAuthoredGraphEvidence(question) && !duplicatedSyntheticQuestionGraph(question)) {
    return {
      applies: true,
      question,
      changed: false,
      safeToPersist: false,
      diagnostics: [diagnostic({
        question,
        repairKey,
        code: 'blocked',
        message: 'The question contains authored graph evidence, so MathMaster preserved it and did not apply an automatic content repair.',
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
        message: 'The authored student actions include graph work, so MathMaster preserved the graph state.',
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
        message: 'The grading contract depends on graph work, so MathMaster preserved the graph state instead of changing grading meaning.',
      })],
    };
  }

  if (staleContinuityGraph) {
    const repairedQuestion = stripKnownSyntheticContinuityStageGraph(question);
    // recipeExpansion is explicit proof that MathMaster generated the workflow,
    // so teacher-side safe writeback may clean it permanently. Pre-provenance
    // state gets the same immediate student-facing repair in memory, but is not
    // persisted because authorship cannot be proven from the stored record.
    return {
      applies: true,
      question: repairedQuestion,
      changed: repairedQuestion !== question,
      safeToPersist: provenance === 'recipeexpansion',
      diagnostics: [],
    };
  }

  const knownLegacyShape = !provenance && isExactKnownLegacySyntheticGraphWorkflow(question);
  if (provenance !== 'recipeexpansion' && !knownLegacyShape) {
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
