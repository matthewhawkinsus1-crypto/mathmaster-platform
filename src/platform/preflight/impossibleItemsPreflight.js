/*
 * QUESTIONS THAT CANNOT HAVE THE ANSWER THEY LOOK LIKE THEY ASK FOR — a
 * Pre-Flight WARNING, never a block (TT04; audit findings A1-61 and C2-134).
 *
 * ADVISORY, like answerKeyPreflight.js: shown in its own panel, never in the
 * readiness diagnostics. A warning diagnostic makes an assignment "Needs
 * Review", an unpublished draft students never see (assignmentAuthoringState.js
 * and assignmentAvailability.js isUnpublishedDraft), and nothing here stops an
 * item from working: each case below is graded correctly and students are
 * protected at run time. The owner asked that teachers be shown these; hiding a
 * lesson from its class because a teacher wrote a dependent system on purpose
 * (Day 2 classification) would be the wrong price for the note, so the note is
 * advice and the teacher decides.
 *
 *   A SYSTEM THAT CANNOT HAVE EXACTLY ONE SOLUTION AS WRITTEN. The Systems
 *   Workspace's own authoring check (validateAlgebraicSystemAuthoring) already
 *   returns a warning for a 3×3 system in which a variable has a zero
 *   coefficient in every equation, and now also for a 2×2 system with an
 *   equation that has no variable in it (`0 = 5`) or a variable in neither
 *   equation. Its callers read only errors, so no teacher ever saw one. This
 *   audit carries those warnings to Pre-Flight.
 *
 *   A VERTEX OR CENTER THE FUNCTION LACKS. Only a quadratic and an
 *   absolute-value graph have a vertex, and only a rational, cubic or cube-root
 *   graph a center (FUNCTION_TYPES_WITH_FEATURE, the owner's GR18 call); for
 *   every other graph the key is "Does not exist". A question that names no
 *   feature asks for the function's own point (ownPointFeature), which for an
 *   exponential, a logarithm or a line is a vertex it does not have. That is a
 *   fair question when the author means it ("Does this function have a
 *   vertex?") and a mistake when an AI asked for "key features" and got this.
 *   Listed unless the author wrote the key (`expected`) themselves.
 */
import { normalizeAnalysisRequests } from '../../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';
import { validateAlgebraicSystemAuthoring } from '../../../functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs';
import { resolveSystemsWorkspaceMode } from '../../../functions/shared/toolMath/systemsWorkspace/systemsWorkspaceMode.mjs';
import { isFamilyBackedQuestion } from '../../../functions/shared/questionFamilyInstance.mjs';

const asArray = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clean = (value) => String(value ?? '').trim();

// The question types that open the graph workspace with a function to analyse
// (the same three QuestionEngine mounts it for).
const GRAPH_WORKSPACE_TYPES = new Set(['graphanalysis', 'functiongraph', 'functioninvestigation']);

const typeOf = (question) => clean(question?.toolId || question?.type).toLowerCase();

const systemWarnings = (question) => {
  if (typeOf(question) !== 'systemsworkspace') return [];
  try {
    if (resolveSystemsWorkspaceMode(question) !== 'algebraic') return [];
    return asArray(validateAlgebraicSystemAuthoring(question).warnings).map(clean).filter(Boolean);
  } catch {
    return [];
  }
};

const FEATURE_WORD = Object.freeze({ vertex: 'vertex', center: 'center' });

// A vertex or a center does not depend on the window the graph is drawn in, so
// any ordinary one will do for reading what the request resolves to.
const NOMINAL_WINDOW = Object.freeze({ xMin: -10, xMax: 10, yMin: -10, yMax: 10, xStep: 1, yStep: 1 });

const graphFeatureWarnings = (question) => {
  if (!GRAPH_WORKSPACE_TYPES.has(typeOf(question)) || !isObject(question.functionSpec)) return [];
  const spec = question.functionSpec;
  const typeName = clean(spec.type);
  // "an exponential function", "a linear function", "this function".
  const kindOfFunction = typeName ? `${/^[aeiou]/i.test(typeName) ? 'an' : 'a'} ${typeName} function` : 'this function';
  // The workspace's own reading of each request (graphWorkspaceModel.js), so
  // this cannot disagree with what a student is asked and what is keyed. Only
  // the Analyze-only view (graphAnalysis) supplies a request when none is written.
  let parts;
  try {
    parts = normalizeAnalysisRequests(question, spec, NOMINAL_WINDOW, typeOf(question) === 'graphanalysis');
  } catch {
    return [];
  }
  // One part per authored request, in order; none authored is the one default.
  const authored = asArray(question.analysisRequests).length ? question.analysisRequests : null;
  const warnings = [];
  asArray(parts).forEach((part, index) => {
    const feature = FEATURE_WORD[part?.feature];
    if (part?.kind !== 'point' || !feature || asArray(part.expected).length) return;
    const request = authored ? authored[index] : null;
    // The author wrote the key themselves: that is their call.
    if (request && Object.hasOwn(request, 'expected')) return;
    warnings.push(authored
      ? `asks for the ${feature} of ${kindOfFunction}, which has none, so the key is "Does not exist". If you meant that, nothing needs to change; if not, ask for a point the function does have.`
      : `names no feature to find, so it asks for the ${feature} of ${kindOfFunction}, which has none, and the key is "Does not exist". Add analysisRequests for the features you mean.`);
  });
  return [...new Set(warnings)];
};

export const auditAssignmentImpossibleItems = (questions = [], { deliveredOnly = true } = {}) => {
  const warnings = [];
  asArray(questions).forEach((question, index) => {
    if (!isObject(question)) return;
    if (deliveredOnly && question.teacherExcluded === true) return;
    // A family slot is a template: the versions students get are judged on
    // their own (questionGenerationPreflight.js).
    if (isFamilyBackedQuestion(question)) return;
    systemWarnings(question).forEach((warning) => warnings.push(`Question ${index + 1}: ${warning}`));
    graphFeatureWarnings(question).forEach((warning) => warnings.push(`Question ${index + 1} ${warning}`));
  });
  return { warnings: [...new Set(warnings)] };
};

export default auditAssignmentImpossibleItems;
