/*
 * WHAT THE STUDENT APP DRAWS FOR A QUESTION — one rule for QuestionEngine,
 * which draws it, and for the assignment validator, which decides whether a
 * teacher may publish it.
 *
 *   drawnQuestionKind(question) → { route: 'workflow' }
 *                               | { route: 'registryTool', toolId }
 *                               | { route: 'questionType', type }
 *                               | null   (nothing: "This question could not be displayed")
 *
 * In this order, the first that applies:
 *
 *   1. A composed question is drawn by its workflow (WorkflowRunner): an
 *      authored `workflow`, or a `recipe` that expands into one, read by
 *      readComposedQuestion after its runtime repair. This beats every other
 *      route, the tool registry included: a relationMapping question that
 *      composes stages is a composition, the same type without one is the
 *      standalone tool. A composed question never routes to the registry.
 *   2. A registry tool named by `toolId`.
 *   3. A registry tool named by `type`. A malformed item can carry a toolId
 *      the registry does not know while its type names a real tool; it falls
 *      through to the type rather than to the panel, for a tool that exists.
 *   4. QuestionEngine's own module for `type` (its type switch), exactly as
 *      written: no trimming, no case folding.
 *
 * Nothing else draws a question. A `toolId` that names one of QuestionEngine's
 * own types is not a route: `{ type: 'freeResponse', toolId: 'multiAnswer' }`
 * is drawn by its type, and freeResponse is not one, so it draws nothing.
 * The validator used to judge `toolId || type` and let exactly that through.
 *
 * The registry is read through TOOL_CATALOG (toolCatalog.js), whose ids are
 * the registry's (tests/platform/drawnQuestionKind.test.mjs holds the
 * registry's loaders to it): the components stay out of anything this is
 * imported by. A name is a tool only as the catalogue's own key, never an
 * Object property such as "constructor".
 *
 * QuestionEngine calls this on the question it renders, after generation;
 * the validator on every version of a question a student can be given
 * (studentQuestionVersions.js): the stored question repaired as the student
 * player repairs it, then each of its variants, each version of a variant
 * family, or a family slot's preview. The rule applies no repair itself: what
 * it is handed is what is drawn.
 *
 * Pure: no React.
 */
import { TOOL_CATALOG } from '../../tools/toolCatalog.js';
import { readComposedQuestion } from '../workflow/questionWorkflow.js';

export const DRAWN_QUESTION_ROUTE = Object.freeze({
  WORKFLOW: 'workflow',
  REGISTRY_TOOL: 'registryTool',
  QUESTION_TYPE: 'questionType',
});

/*
 * The types QuestionEngine draws with its own modules: every case of its type
 * switch, in its order, before the default that is the panel. `platformQuestionError`
 * is not one: it is the placeholder for a question that could not be prepared,
 * drawn in place of the question area, never authored.
 * tests/platform/drawnQuestionKind.test.mjs holds this list to the switch.
 */
export const QUESTION_ENGINE_TYPES = Object.freeze([
  'modelingLab',
  'graphing',
  'functionGraph',
  'functionInvestigation',
  'graphAnalysis',
  'stepAlgebra',
  'algebra',
  'numberLine',
  'fraction',
  'literal',
  'system',
  'table',
  'orderedPair',
  'multiAnswer',
  'relationshipModel',
  'graphScenarioMatch',
  'graphComparison',
  'graphStory',
  'contextInterpretation',
]);

const ENGINE_TYPES = new Set(QUESTION_ENGINE_TYPES);
const WORKFLOW = Object.freeze({ route: DRAWN_QUESTION_ROUTE.WORKFLOW });

// The registry's own id for a name, as the registry's lookup reads it (a name
// is coerced to a key the way TOOL_REGISTRY[name] is), or null.
const registryToolId = (name) => (
  name !== undefined && name !== null && Object.prototype.hasOwnProperty.call(TOOL_CATALOG, name)
    ? String(name)
    : null
);

export const drawnQuestionKind = (question) => {
  if (!question || typeof question !== 'object' || Array.isArray(question)) return null;
  if (readComposedQuestion(question).composed) return WORKFLOW;
  const toolId = registryToolId(question.toolId) || registryToolId(question.type);
  if (toolId) return Object.freeze({ route: DRAWN_QUESTION_ROUTE.REGISTRY_TOOL, toolId });
  if (typeof question.type === 'string' && ENGINE_TYPES.has(question.type)) {
    return Object.freeze({ route: DRAWN_QUESTION_ROUTE.QUESTION_TYPE, type: question.type });
  }
  return null;
};

export default drawnQuestionKind;
