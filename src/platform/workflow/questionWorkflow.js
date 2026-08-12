// Composing a question out of interaction primitives.
//
// A rich question is three separate things, and keeping them separate is the
// point (see INTERACTION_COMPOSITION_ARCHITECTURE.md):
//
//   content   what mathematics exists      — scenario, equation, domain
//   workflow  what the student is asked to do — an ordered list of stages
//   grading   what counts as correct
//
// The failure this prevents is answers living in the fields that describe what
// the student sees. When `answer` sits beside `prompt`, every renderer has to
// remember not to show it, and one that forgets leaks the answer. Here the
// renderer is given `content` and `workflow` and never sees `grading` at all.
//
// This module is pure: it normalises, validates and orders. It renders nothing.

import { STAGE_OUTPUT, getStage, isKnownStageKind, resolveStageKind } from './interactionStages.js';
import { expandRecipe } from './questionRecipes.js';

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

/**
 * Has the student actually put something here?
 *
 * Delegated components report their state as they mount, and an empty table
 * arrives as `{}` rather than as nothing. Counting that as answered marked a
 * freshly-opened question complete before the student had touched it, so an
 * empty container is treated as no answer.
 */
export const hasStageResponse = (value) => {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') {
    // Workflow artifacts may carry useful metadata before the student has
    // finished the stage.  Downstream work must wait for the artifact itself
    // to say it is complete; otherwise a graph could unlock after only one
    // table cell was entered.
    if (value.__mathmasterWorkflowArtifact) return value.isComplete === true;
    return Object.values(value).some((entry) => hasStageResponse(entry));
  }
  return true;
};

/**
 * A stage's id. Authors may name a stage so a later one can refer to it;
 * otherwise the kind serves, which is what the short examples rely on.
 */
const stageId = (raw, index, usedIds) => {
  const explicit = String(raw?.id || '').trim();
  if (explicit) return explicit;
  const kind = resolveStageKind(raw) || `stage${index + 1}`;
  // `equationInput` is referred to as "equation" in authored JSON far more often
  // than by its full kind, so both resolve.
  const short = kind.replace(/Input$|Construction$|Diagram$|Plot$|Graph$/, '');
  return usedIds.has(short) ? kind : short;
};

/**
 * Normalise one stage entry. Unknown kinds survive normalisation carrying an
 * `unknown` flag so validation can report them by name rather than dropping
 * them silently — a stage that vanishes is worse than one that errors.
 */
export const normalizeStage = (raw, index, usedIds = new Set()) => {
  const source = isObject(raw) ? raw : {};
  const kind = resolveStageKind(source);
  const definition = kind ? getStage(kind) : null;
  const id = stageId(source, index, usedIds);

  return {
    ...source,
    id,
    kind: kind || String(source.kind || ''),
    unknown: !definition,
    produces: definition?.produces || null,
    consumes: definition?.consumes || [],
    // `source: { fromStage: "equation" }` — the stage is driven by the
    // student's own earlier work rather than by the answer key.
    sourceStageId: isObject(source.source) ? String(source.source.fromStage || '') || null : null,
    aliasedFrom: kind && kind !== String(source.kind || '') ? String(source.kind) : null,
  };
};

/**
 * The whole workflow, normalised and in order.
 */
export const normalizeWorkflow = (workflow = []) => {
  const list = Array.isArray(workflow) ? workflow : [];
  const usedIds = new Set();
  return list.map((raw, index) => {
    const normalized = normalizeStage(raw, index, usedIds);
    // Two stages of the same kind in one workflow — plot the points, then plot
    // the transformed points — need distinct ids.
    let id = normalized.id;
    let suffix = 2;
    while (usedIds.has(id)) { id = `${normalized.id}${suffix}`; suffix += 1; }
    usedIds.add(id);
    return { ...normalized, id, index };
  });
};

/**
 * Validate a composed workflow.
 *
 * Every failure here is one a student would otherwise meet as a blank panel or
 * a stage that silently does nothing, so they are errors rather than warnings.
 */
export const validateWorkflow = (workflow = [], { label = 'Question' } = {}) => {
  const stages = normalizeWorkflow(workflow);
  const errors = [];

  if (!stages.length) {
    return { errors: [`${label} has an empty \`workflow\`. A composed question needs at least one stage.`], stages };
  }

  const byId = new Map(stages.map((entry) => [entry.id, entry]));

  stages.forEach((entry) => {
    if (entry.unknown) {
      errors.push(
        `${label} stage ${entry.index + 1} has kind "${entry.kind}", which is not a supported interaction. `
        + 'Compose from the published stage list; new interactions cannot be invented in JSON.',
      );
      return;
    }

    if (!entry.sourceStageId) return;

    const upstream = byId.get(entry.sourceStageId);
    if (!upstream) {
      errors.push(`${label} stage "${entry.id}" reads from "${entry.sourceStageId}", which is not a stage in this question.`);
      return;
    }
    if (upstream.index >= entry.index) {
      // Reading forwards would mean grading work the student has not done yet.
      errors.push(`${label} stage "${entry.id}" reads from "${entry.sourceStageId}", which comes later in the workflow.`);
      return;
    }
    if (upstream.produces && entry.consumes.length && !entry.consumes.includes(upstream.produces)) {
      errors.push(
        `${label} stage "${entry.id}" cannot be driven by "${entry.sourceStageId}": `
        + `it accepts ${entry.consumes.join(', ')} but that stage produces ${upstream.produces}.`,
      );
    }
  });

  return { errors, stages };
};

/**
 * What a stage should be built from at runtime.
 *
 * Returns the student's own upstream answer when the question asked for that,
 * and the authored content otherwise. This is the difference between a
 * workspace and a sequence of isolated questions: a student who writes
 * f(x) = x + 2 fills their table from THAT, and MathMaster can then say their
 * table is consistent with their function while their function does not model
 * the situation — which no independent per-stage check can say.
 */
export const resolveStageInput = ({ stage: entry, responses = {}, content = {} }) => {
  if (!entry) return { from: 'none', value: null };
  if (!entry.sourceStageId) return { from: 'content', value: content };

  const upstream = responses[entry.sourceStageId];
  const hasResponse = hasStageResponse(upstream);
  return {
    from: hasResponse ? 'student' : 'pending',
    sourceStageId: entry.sourceStageId,
    value: hasResponse ? upstream : null,
    // A stage whose source is unanswered is not an error — it is simply not
    // ready, and the runtime shows it as waiting rather than as broken.
    ready: hasResponse,
  };
};

/**
 * Validate the wiring between the workflow and its grading section.
 *
 * A grading rule keyed to a stage that does not exist is the worst kind of
 * authoring mistake: nothing errors, nothing renders differently, and the stage
 * is quietly never marked. Preflight is the only place it can be caught.
 */
export const validateGrading = (workflow = [], grading = null, { label = 'Question' } = {}) => {
  if (!isObject(grading)) return [];
  const stages = normalizeWorkflow(workflow);
  const byId = new Map(stages.map((entry) => [entry.id, entry]));
  const errors = [];

  Object.entries(grading).forEach(([key, rule]) => {
    const stage = byId.get(key);
    if (!stage) {
      errors.push(
        `${label} grades "${key}", which is not a stage in this question. `
        + `The stages are: ${stages.map((entry) => entry.id).join(', ') || 'none'}.`,
      );
      return;
    }
    if (!isObject(rule) || !rule.consistentWith) return;

    const upstream = byId.get(rule.consistentWith);
    if (!upstream) {
      errors.push(`${label} stage "${key}" is graded against "${rule.consistentWith}", which is not a stage in this question.`);
      return;
    }
    if (upstream.index >= stage.index) {
      errors.push(`${label} stage "${key}" is graded against "${rule.consistentWith}", which the student answers later.`);
    }
  });

  return errors;
};

/**
 * Split a question into the three sections, accepting both the composed shape
 * and the flat legacy shape.
 *
 * Backwards compatibility matters more here than tidiness: every existing
 * assignment is flat, and a question that stops rendering because its JSON
 * predates this layer is a regression a student meets.
 */
// Fields that hold an answer. When a composed question has no `content`
// section, the question itself stands in for one — and these must not travel
// with it, or the renderer is handed the answer key it was designed never to
// see. Preflight can catch a leaked answer in the JSON; it cannot catch one
// this module passes along.
const ANSWER_FIELDS = [
  'grading', 'correctEquation', 'correctIndependentId', 'correctDependentId',
  'correctDomain', 'correctRange', 'tableAnswers', 'answers', 'continuity',
];

const contentWithoutAnswers = (source) => {
  const content = { ...source };
  ANSWER_FIELDS.forEach((field) => { delete content[field]; });
  return content;
};

export const readComposedQuestion = (question = {}) => {
  const source = isObject(question) ? question : {};
  const explicit = Array.isArray(source.workflow) && source.workflow.length > 0;
  // A named recipe is expanded here, so a recipe question and a hand-composed
  // one are the same thing everywhere downstream: one runtime, one validator,
  // one grader. An explicit workflow always wins — naming the stages is the
  // more specific instruction.
  const expanded = explicit ? null : expandRecipe(source);
  const workflow = explicit ? source.workflow : (expanded?.workflow || []);
  const composed = workflow.length > 0;

  return {
    composed,
    recipe: expanded?.recipe || null,
    recipeErrors: expanded?.errors || [],
    content: isObject(source.content)
      ? source.content
      : (composed ? contentWithoutAnswers(source) : source),
    workflow: composed ? normalizeWorkflow(workflow) : [],
    // Never handed to a renderer.
    grading: explicit
      ? (isObject(source.grading) ? source.grading : null)
      : (expanded?.grading || null),
  };
};

/**
 * The stages a student still has to complete, for progress and partial credit.
 */
export const summarizeWorkflowProgress = (stages = [], responses = {}) => {
  const total = stages.length;
  const answered = stages.filter((entry) => hasStageResponse(responses[entry.id])).length;
  return {
    total,
    answered,
    remaining: total - answered,
    complete: total > 0 && answered === total,
    // Each stage is independently gradable, so partial credit is the norm
    // rather than something bolted on.
    fraction: total ? Number((answered / total).toFixed(4)) : 0,
  };
};

export { STAGE_OUTPUT, isKnownStageKind };
