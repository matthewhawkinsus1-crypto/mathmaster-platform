const CHOICE_PROFILES = new Set(['choice', 'multiplechoice', 'multiple-choice', 'select']);

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
};
const stableStringify = (value) => JSON.stringify(canonicalize(value));

const normalizeText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

const answerCandidates = (field = {}) => [
  ...(field.answer !== undefined && field.answer !== null ? [field.answer] : []),
  ...(Array.isArray(field.acceptedAnswers) ? field.acceptedAnswers : []),
].map((value) => String(value ?? '').trim()).filter(Boolean);

const isChoiceField = (field = {}) => {
  const profile = String(field.inputProfile ?? field.inputMode ?? field.type ?? '').trim().toLowerCase();
  return CHOICE_PROFILES.has(profile) || (Array.isArray(field.options) && field.options.length > 1);
};

const looksLikePlainLanguage = (value) => {
  const text = String(value ?? '').trim();
  return Boolean(text) && /[A-Za-z]/.test(text) && !/[=<>≤≥≠+*/^()[\]{}\\∞π√∪∩]/.test(text);
};

const RESPONSE_ENTRY_KEYS = new Set([
  'acceptedAnswers', 'answer', 'options', 'type', 'inputProfile', 'inputMode',
  'answerFormat', 'requiredSymbols', 'inputContract', 'toolProfile', 'notation',
  'placeholder', 'presentation',
]);

const withoutKeys = (value = {}, keys = new Set()) => Object.fromEntries(
  Object.entries(value).filter(([key]) => !keys.has(key)),
);

const sameOutsideAnswerFields = (before = {}, after = {}) => {
  const strip = (question) => {
    const copy = { ...question };
    delete copy.answerFields;
    return copy;
  };
  return stableStringify(strip(before)) === stableStringify(strip(after));
};

/*
 * CERTIFIED LIVE SYSTEMS-WORKSPACE RECOVERY.
 *
 * Some early V5 assignments were authored with solveSystem intent but the old
 * compiler persisted them as the legacy `system` ordered-pair grader. The
 * mathematics never changed; the renderer did. A live repair may restore that
 * intended algebraic Systems Workspace only when the exact question ID,
 * prompt, standards, metadata, question order, and two original equations are
 * unchanged. This is deliberately much narrower than a general tool swap.
 */
export const SYSTEMS_WORKSPACE_UPGRADE_REPAIR_KIND = 'systems-workspace-upgrade';

const SYSTEMS_WORKSPACE_UPGRADE_FIELDS = new Set([
  'type',
  'toolId',
  'mode',
  'method',
  'equations',
  'equationsLatex',
  'variables',
  'requireVerification',
  'askEfficiency',
  'showGraph',
  'showEquations',
  'solution',
]);

const normalizeEquationText = (value) => String(value ?? '')
  .replace(/[−–—]/g, '-')
  .replace(/\s+/g, '');

const escapeSystemsVariable = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\const normalizeEquationText = (value) => String(value ?? '')
  .replace(/[−–—]/g, '-')
  .replace(/\s+/g, '');
');

const solveSystemActions = (question = {}) => (
  Array.isArray(question.studentActions)
    ? question.studentActions.map((value) => String(value ?? '').trim())
    : []
);

const certifiedSystemMethodFromPrompt = (prompt = '') => {
  const text = String(prompt || '').trim().toLowerCase();
  if (/choose\s+(?:an\s+efficient\s+)?(?:algebraic\s+)?method/.test(text)
    || /choose\s+substitution\s+or\s+elimination/.test(text)) return 'studentChoice';
  if (/use\s+substitution/.test(text)) return 'substitution';
  if (/use\s+elimination/.test(text)) return 'elimination';
  return null;
};

const analyzeSystemsWorkspaceUpgrade = (before = {}, after = {}) => {
  const beforeType = String(before?.type || '').trim();
  const afterType = String(after?.type || after?.toolId || '').trim();
  if (beforeType !== 'system' || afterType !== 'systemsWorkspace') return null;
  if (String(after?.mode || '').trim() !== 'algebraic') {
    return {
      safe: false,
      affectedFieldIds: [],
      reason: 'A live legacy-system recovery may only restore the algebraic Systems Workspace.',
    };
  }

  const beforeActions = solveSystemActions(before);
  const afterActions = solveSystemActions(after);
  if (!beforeActions.includes('solveSystem') || !afterActions.includes('solveSystem')) {
    return {
      safe: false,
      affectedFieldIds: [],
      reason: 'The live system can be upgraded only when both versions preserve solveSystem intent.',
    };
  }

  const beforeEquations = Array.isArray(before?.equationsLatex)
    ? before.equationsLatex
    : (Array.isArray(before?.equations) ? before.equations : []);
  const afterEquations = Array.isArray(after?.equations) ? after.equations : [];
  if (beforeEquations.length !== 2 || afterEquations.length !== 2
    || beforeEquations.some((equation, index) => normalizeEquationText(equation) !== normalizeEquationText(afterEquations[index]))) {
    return {
      safe: false,
      affectedFieldIds: [],
      reason: 'A live Systems Workspace recovery must keep the two original equations exactly the same.',
    };
  }

  const requiredMethod = certifiedSystemMethodFromPrompt(before?.prompt);
  const afterMethod = String(after?.method || '').trim();
  if (!requiredMethod || afterMethod !== requiredMethod) {
    return {
      safe: false,
      affectedFieldIds: [],
      reason: 'The restored Systems Workspace method must match the method already required by the live prompt.',
    };
  }

  const variables = Array.isArray(after?.variables)
    ? after.variables.map((value) => String(value ?? '').trim()).filter(Boolean)
    : [];
  if (variables.length !== 2 || new Set(variables).size !== 2) {
    return {
      safe: false,
      affectedFieldIds: [],
      reason: 'The restored Systems Workspace must declare exactly two distinct variables.',
    };
  }
  const joinedEquations = afterEquations.join(' ');
  if (variables.some((variable) => !new RegExp('(^|[^A-Za-z0-9_])' + escapeSystemsVariable(variable) + '([^A-Za-z0-9_]|$)').test(joinedEquations))) {
    return {
      safe: false,
      affectedFieldIds: [],
      reason: 'The restored Systems Workspace variables must come from the original live equations.',
    };
  }

  if (after?.requireVerification !== true) {
    return {
      safe: false,
      affectedFieldIds: [],
      reason: 'The certified algebraic Systems Workspace recovery requires verification in both original equations.',
    };
  }

  const beforeProtected = withoutKeys(before, SYSTEMS_WORKSPACE_UPGRADE_FIELDS);
  const afterProtected = withoutKeys(after, SYSTEMS_WORKSPACE_UPGRADE_FIELDS);
  if (stableStringify(beforeProtected) !== stableStringify(afterProtected)) {
    return {
      safe: false,
      affectedFieldIds: [],
      reason: 'The certified live Systems Workspace recovery may change renderer plumbing only. Prompt, standards, metadata, grading weight, and every other protected field must remain unchanged.',
    };
  }

  return {
    safe: true,
    repairKind: SYSTEMS_WORKSPACE_UPGRADE_REPAIR_KIND,
    affectedFieldIds: [],
    restoredMethod: afterMethod,
    variables,
  };
};
/*
 * PRESENTATION-ONLY GRAPH VIEWPORT REPAIR.
 *
 * A teacher watching a live assignment can discover that an authored window
 * hides the part of the graph the question is about — a system whose
 * intersection sits outside the authored bounds, for example. Changing where
 * the same graph is framed changes nothing a student is asked to do and
 * nothing the grader reads, so it is the one graph edit that stays safe after
 * students begin work. Everything else about the graph — its functions, lines,
 * points, labels — is mathematical content and stays frozen.
 */
export const GRAPH_VIEWPORT_KEYS = Object.freeze(['xMin', 'xMax', 'yMin', 'yMax']);
export const GRAPH_VIEWPORT_REPAIR_KIND = 'graph-viewport-repair';

const VIEWPORT_KEY_SET = new Set(GRAPH_VIEWPORT_KEYS);

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// A graph object holding nothing but bounds is a window, not content. Dropping
// an emptied one lets a question that never carried a `graph` key compare equal
// to the same question with a window added: tools like systemsWorkspace draw
// their lines from `system` and read `graph` only for the axes, so the window
// is the one part of it that was never mathematical.
const withoutViewport = (question = {}) => {
  if (!isPlainObject(question.graph)) return question;
  const remaining = withoutKeys(question.graph, VIEWPORT_KEY_SET);
  const copy = { ...question };
  if (Object.keys(remaining).length) copy.graph = remaining;
  else delete copy.graph;
  return copy;
};

const analyzeGraphViewportRepair = (before = {}, after = {}) => {
  const beforeGraph = isPlainObject(before.graph) ? before.graph : null;
  const afterGraph = isPlainObject(after.graph) ? after.graph : null;
  if (!afterGraph) return null;

  if (!beforeGraph) {
    // The live question has no graph object at all: the tool is drawing from
    // its own mathematical fields and falling back to default axes. A repair
    // may supply the window those defaults got wrong, and nothing else — an
    // added graph carrying functions, lines, points or labels is new content.
    const contentKeys = Object.keys(afterGraph).filter((key) => !VIEWPORT_KEY_SET.has(key));
    if (contentKeys.length) {
      return {
        safe: false,
        affectedFieldIds: [],
        reason: `A live repair may add graph viewport bounds only. This repair also adds graph content (${contentKeys.join(', ')}) to a question students already received.`,
      };
    }
  }

  const changedKeys = GRAPH_VIEWPORT_KEYS.filter((key) => (
    stableStringify(beforeGraph?.[key] ?? null) !== stableStringify(afterGraph[key] ?? null)
  ));
  if (!changedKeys.length) return null;

  if (stableStringify(withoutViewport(before)) !== stableStringify(withoutViewport(after))) {
    return {
      safe: false,
      affectedFieldIds: [],
      reason: 'A live graph repair may change only the viewport bounds (xMin, xMax, yMin, yMax). The prompt, standards, tool type, equations, plotted objects, grading, and every other field must stay exactly as students received them.',
    };
  }

  const bounds = {};
  for (const key of GRAPH_VIEWPORT_KEYS) {
    const value = Number(afterGraph[key]);
    if (!Number.isFinite(value)) {
      return {
        safe: false,
        affectedFieldIds: [],
        reason: `Graph viewport bound “${key}” must be a finite number.`,
      };
    }
    bounds[key] = value;
  }
  if (!(bounds.xMin < bounds.xMax)) {
    return { safe: false, affectedFieldIds: [], reason: 'Graph viewport bounds require xMin to be less than xMax.' };
  }
  if (!(bounds.yMin < bounds.yMax)) {
    return { safe: false, affectedFieldIds: [], reason: 'Graph viewport bounds require yMin to be less than yMax.' };
  }

  // No affected response fields, by construction: nothing a student answered
  // was rewritten, so no live correction credit and no extra attempt can be
  // owed for reframing the same picture.
  return {
    safe: true,
    presentationOnly: true,
    repairKind: GRAPH_VIEWPORT_REPAIR_KIND,
    affectedFieldIds: [],
    changedViewportKeys: changedKeys,
    viewport: bounds,
  };
};

const WORKFLOW_WORD_CHOICE_REPAIRS = Object.freeze([
  { choiceKey: 'domainWordsChoices', correctKey: 'correctDomainWords', stageId: 'domainWords', askKey: 'domainWords' },
  { choiceKey: 'rangeWordsChoices', correctKey: 'correctRangeWords', stageId: 'rangeWords', askKey: 'rangeWords' },
]);

const workflowAsk = (question = {}) => {
  const recipeAsk = Array.isArray(question?.recipe?.ask) ? question.recipe.ask : [];
  const topLevelAsk = Array.isArray(question?.ask) ? question.ask : [];
  return (recipeAsk.length ? recipeAsk : topLevelAsk).map(String);
};

const isFunctionModelingQuestion = (question = {}) => {
  const type = String(question?.type || '').trim();
  const recipeName = typeof question?.recipe === 'string'
    ? question.recipe
    : String(question?.recipe?.name || question?.recipe?.recipe || '').trim();
  return type === 'relationshipModel' || recipeName === 'functionModeling';
};

const analyzeWorkflowWordChoiceRepair = (before = {}, after = {}) => {
  const changed = WORKFLOW_WORD_CHOICE_REPAIRS.filter(({ choiceKey }) => (
    stableStringify(before?.[choiceKey] ?? null) !== stableStringify(after?.[choiceKey] ?? null)
  ));
  if (!changed.length) return null;

  if (!isFunctionModelingQuestion(before) || !isFunctionModelingQuestion(after)) {
    return {
      safe: false,
      affectedFieldIds: [],
      reason: 'This repair changes workflow domain/range wording choices, but the live question is not a function-modeling relationship question.',
    };
  }

  const stripChoiceKeys = (question) => {
    const copy = { ...question };
    WORKFLOW_WORD_CHOICE_REPAIRS.forEach(({ choiceKey }) => { delete copy[choiceKey]; });
    return copy;
  };
  if (stableStringify(stripChoiceKeys(before)) !== stableStringify(stripChoiceKeys(after))) {
    return {
      safe: false,
      affectedFieldIds: [],
      reason: 'A workflow live repair may only add controlled choices to existing domain/range wording stages. The mathematical task and all other fields must stay unchanged.',
    };
  }

  const ask = new Set(workflowAsk(before));
  const affectedFieldIds = [];
  for (const config of changed) {
    if (!ask.has(config.askKey)) {
      return {
        safe: false,
        affectedFieldIds: [],
        reason: `Workflow stage “${config.stageId}” is not part of this live question, so choices cannot be added for it.`,
      };
    }

    const beforeChoices = Array.isArray(before?.[config.choiceKey])
      ? before[config.choiceKey].map((value) => String(value ?? '').trim()).filter(Boolean)
      : [];
    if (beforeChoices.length) {
      return {
        safe: false,
        affectedFieldIds: [],
        reason: `Workflow stage “${config.stageId}” already had finite choices; a live repair cannot rewrite those choices after student activity begins.`,
      };
    }

    const oldCandidates = Array.isArray(before?.[config.correctKey])
      ? before[config.correctKey].map((value) => String(value ?? '').trim()).filter(Boolean)
      : [];
    if (!oldCandidates.length || !oldCandidates.every(looksLikePlainLanguage)) {
      return {
        safe: false,
        affectedFieldIds: [],
        reason: `Workflow stage “${config.stageId}” is not a keyed plain-language response, so MathMaster will not convert it live.`,
      };
    }

    const options = Array.isArray(after?.[config.choiceKey])
      ? after[config.choiceKey].map((value) => String(value ?? '').trim()).filter(Boolean)
      : [];
    if (options.length < 2) {
      return {
        safe: false,
        affectedFieldIds: [],
        reason: `Workflow stage “${config.stageId}” needs at least two finite choices.`,
      };
    }

    const oldNormalized = new Set(oldCandidates.map(normalizeText));
    const oldCorrectOptions = options.filter((option) => oldNormalized.has(normalizeText(option)));
    if (oldCorrectOptions.length !== 1) {
      return {
        safe: false,
        affectedFieldIds: [],
        reason: `Workflow stage “${config.stageId}” must contain exactly one previously accepted correct wording among its choices.`,
      };
    }
    affectedFieldIds.push(config.stageId);
  }

  return { safe: true, affectedFieldIds };
};

const safeFieldConversion = (before = {}, after = {}) => {
  if (String(before.id || '') !== String(after.id || '')) {
    return { safe: false, reason: 'Answer-field IDs cannot change after students begin work.' };
  }
  if (stableStringify(before) === stableStringify(after)) return { safe: true, changed: false };

  if (isChoiceField(before)) {
    return { safe: false, reason: `Field “${before.label || before.id}” is already a choice field; live repair cannot rewrite its answer meaning.` };
  }
  if (!isChoiceField(after)) {
    return { safe: false, reason: `Field “${before.label || before.id}” must be converted to a finite choice response for a safe live repair.` };
  }

  const oldCandidates = answerCandidates(before);
  if (!oldCandidates.length || !oldCandidates.every(looksLikePlainLanguage)) {
    return { safe: false, reason: `Field “${before.label || before.id}” is not a plain-language keyed response, so MathMaster will not rewrite it after student activity begins.` };
  }

  if (stableStringify(withoutKeys(before, RESPONSE_ENTRY_KEYS)) !== stableStringify(withoutKeys(after, RESPONSE_ENTRY_KEYS))) {
    return { safe: false, reason: `Field “${before.label || before.id}” changed more than its response-entry controls.` };
  }

  const options = Array.isArray(after.options)
    ? after.options.map((value) => String(value ?? '').trim()).filter(Boolean)
    : [];
  const answer = String(after.answer ?? '').trim();
  if (options.length < 2 || !answer) {
    return { safe: false, reason: `Field “${before.label || before.id}” needs at least two choices and one keyed correct choice.` };
  }

  const oldNormalized = new Set(oldCandidates.map(normalizeText));
  if (!oldNormalized.has(normalizeText(answer))) {
    return { safe: false, reason: `Field “${before.label || before.id}” changed the keyed mathematical meaning instead of only changing how students respond.` };
  }
  if (!options.some((option) => normalizeText(option) === normalizeText(answer))) {
    return { safe: false, reason: `Field “${before.label || before.id}” does not include its keyed answer among the choices.` };
  }

  const oldCorrectOptions = options.filter((option) => oldNormalized.has(normalizeText(option)));
  if (oldCorrectOptions.length !== 1) {
    return {
      safe: false,
      reason: `Field “${before.label || before.id}” must contain exactly one of the previously accepted correct wordings so students do not see multiple correct choices.`,
    };
  }

  return { safe: true, changed: true };
};

export const analyzeSafeResponseEntryRepair = (beforeQuestion = {}, afterQuestion = {}) => {
  if (!beforeQuestion?.questionId || beforeQuestion.questionId !== afterQuestion?.questionId) {
    return { safe: false, affectedFieldIds: [], reason: 'The question ID must stay exactly the same.' };
  }

  const systemsWorkspaceUpgrade = analyzeSystemsWorkspaceUpgrade(beforeQuestion, afterQuestion);
  if (systemsWorkspaceUpgrade) return systemsWorkspaceUpgrade;

  const viewportRepair = analyzeGraphViewportRepair(beforeQuestion, afterQuestion);
  if (viewportRepair) return viewportRepair;

  const workflowRepair = analyzeWorkflowWordChoiceRepair(beforeQuestion, afterQuestion);
  if (workflowRepair) return workflowRepair;

  if (!sameOutsideAnswerFields(beforeQuestion, afterQuestion)) {
    return {
      safe: false,
      affectedFieldIds: [],
      reason: 'A live repair may change response-entry fields only. Prompt, graph/table, standards, tool type, order, and mathematical task must stay unchanged.',
    };
  }

  const beforeFields = Array.isArray(beforeQuestion.answerFields) ? beforeQuestion.answerFields : [];
  const afterFields = Array.isArray(afterQuestion.answerFields) ? afterQuestion.answerFields : [];
  if (!beforeFields.length || beforeFields.length !== afterFields.length) {
    return {
      safe: false,
      affectedFieldIds: [],
      reason: 'A live repair cannot add, remove, or reorder answer fields on a question students already received.',
    };
  }

  const affectedFieldIds = [];
  for (let index = 0; index < beforeFields.length; index += 1) {
    const result = safeFieldConversion(beforeFields[index], afterFields[index]);
    if (!result.safe) return { safe: false, affectedFieldIds: [], reason: result.reason };
    if (result.changed) affectedFieldIds.push(String(beforeFields[index].id));
  }

  if (!affectedFieldIds.length) {
    return { safe: false, affectedFieldIds: [], reason: 'No eligible plain-language response field was converted to a choice.' };
  }

  return { safe: true, affectedFieldIds };
};
