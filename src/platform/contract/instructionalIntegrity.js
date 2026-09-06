// WHAT A QUESTION TEACHES, AS OPPOSED TO WHETHER IT RENDERS.
//
// semanticValidation.js asks "could the renderer show this?". These rules ask
// the next question: given that it renders, does it still measure what it says
// it measures? Every one of them is a defect that ships as a perfectly valid
// question and quietly hands the student the answer, so none of them is
// catchable by schema checking and all of them were found in real assignments.
//
// The rules are deliberately narrow. A rule that fires on a question a good
// teacher would write is worse than no rule, because authors learn to ignore
// the warnings — so where a pattern is usually wrong but sometimes right, it is
// a warning; where it is wrong by construction, it is an error.
//
// Pure: no React, no Firestore. Composed questions only — a flat question has
// no stages to reason about.

import { readComposedQuestion } from '../workflow/questionWorkflow.js';
import { stageFamily } from '../workflow/stageFamilies.js';

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? '').trim();

const GRAPH_READING_STAGES = new Set(['graphFeatureSelect', 'pointInput', 'domainInput', 'rangeInput', 'intervalInput']);
const SET_STAGES = new Set(['domainInput', 'rangeInput', 'intervalInput']);

/** Every string a student can read before answering. Stage prompts excluded. */
const stimulusText = (question, composed) => {
  const content = isObject(composed.content) ? composed.content : {};
  return [
    question?.prompt, question?.scenario, question?.stem,
    content.prompt, content.scenario, content.stem, content.equation, content.model,
  ].map(text).filter(Boolean).join(' \n ');
};

/** `f(x) = 2x + 1`, `y = 3^x`, `C(n) = 5n`. Not `x = 4`, which is a solution. */
const FUNCTION_DEFINITION = /\b([a-z])\s*\(\s*[a-z]\s*\)\s*=|(?:^|[\s(>])y\s*=/i;

const choiceLabels = (stage) => list(stage?.choices)
  .map((choice) => (typeof choice === 'string' ? choice : text(choice?.label || choice?.id)))
  .filter(Boolean);

const CONTINUITY = /^(discrete|continuous)$/i;

/** A bare name for a figure: "A", "Graph B", "Figure 3". Never mathematics. */
const FIGURE_NAME = /^(graph|figure|diagram|option)?\s*[a-z0-9]$/i;

export const instructionalIntegrityProblems = (question = {}) => {
  const composed = readComposedQuestion(question);
  if (!composed.composed) return { errors: [], warnings: [] };

  const errors = [];
  const warnings = [];
  const stages = composed.workflow;
  const stimulus = stimulusText(question, composed);
  const byIndex = new Map(stages.map((stage, index) => [stage.id, index]));

  /*
   * R1. THE ANSWER BOX MUST NOT ANSWER THE CLASSIFICATION.
   *
   * A question asks "is this relationship discrete or continuous?" and then, on
   * the next step, shows a box captioned "list the values in the domain". A
   * student who has read nothing at all now knows it is discrete. The whole
   * point of asking was to find out whether they could tell, and the format of
   * the next step told them.
   *
   * The fix is not a vaguer caption — it is `showWhen`, which asks for the
   * domain in the form the STUDENT chose, and grades them on the classification
   * they actually made.
   */
  stages.forEach((stage) => {
    if (stage.kind !== 'classification' && stage.kind !== 'multipleChoice') return;
    const labels = choiceLabels(stage);
    if (!labels.some((label) => CONTINUITY.test(label))) return;
    const at = byIndex.get(stage.id);
    stages.forEach((later) => {
      if (byIndex.get(later.id) <= at) return;
      if (!SET_STAGES.has(later.kind)) return;
      const shapesTheAnswer = Boolean(text(later.notation)) || list(later.choices).length > 0;
      if (!shapesTheAnswer) return;
      if (isObject(later.showWhen) && text(later.showWhen.stage) === stage.id) return;
      const asked = { domainInput: 'the domain', rangeInput: 'the range', intervalInput: 'an interval' }[later.kind] || 'a set';
      errors.push(
        `step "${later.id}" asks for ${asked} in one fixed form after step "${stage.id}" asks the student whether the `
        + 'relationship is discrete or continuous, so the answer box gives away the classification. '
        + `Put it behind \`showWhen: { stage: "${stage.id}", is: … }\` so each branch asks for the form that student chose.`,
      );
    });
  });

  /*
   * R2. LOCATE BEFORE YOU STATE.
   *
   * Writing "(4, 0)" for the x-intercept is two skills: finding it on the
   * plane, and reading its coordinates off the axes. Asking only for the
   * written answer marks a student wrong without ever finding out which half
   * they could do — and a student who can point at it but miscounts gridlines
   * gets the same zero as one who did not know what an intercept is.
   *
   * A warning, not an error: a question may legitimately ask for a feature the
   * student found in an earlier question, or in a table rather than a graph.
   */
  stages.forEach((stage) => {
    if (stage.kind !== 'pointInput') return;
    const feature = text(stage.feature);
    if (!feature) return;
    const at = byIndex.get(stage.id);
    const located = stages.some((earlier) => (
      earlier.kind === 'graphFeatureSelect'
      && text(earlier.feature) === feature
      && byIndex.get(earlier.id) < at
    ));
    if (located) return;
    warnings.push(
      `step "${stage.id}" asks the student to write the ${feature} without first asking them to find it on the graph. `
      + 'Marking it and stating it are different skills; a `graphFeatureSelect` step before this one marks them separately.',
    );
  });

  /*
   * R3. DO NOT PRINT THE EQUATION OF A GRAPH THE STUDENT IS READING.
   *
   * "The graph of f(x) = 2^x is shown. What is its domain?" is not a graph
   * question. A student who has memorised that exponentials have domain "all
   * real numbers" answers it without looking, and one who reads the graph
   * carefully gets no more credit for it. The equation is a shortcut past the
   * only thing being assessed.
   *
   * The exemption that keeps this rule honest: a question where the student
   * BUILDS the model — writes the equation, fills the table, constructs the
   * graph — and then reads features off what they built. There the equation is
   * the given the whole task starts from, not a shortcut past it. Only a
   * question that hands the student a finished graph to read is cheated by
   * printing its equation alongside.
   */
  const readsAGraph = stages.some((stage) => GRAPH_READING_STAGES.has(stage.kind));
  const buildsTheModel = stages.some((stage) => stageFamily(stage.kind) === 'build');
  if (readsAGraph && !buildsTheModel && FUNCTION_DEFINITION.test(stimulus)) {
    warnings.push(
      'the question displays the function\'s equation while asking the student to read features off its graph. '
      + 'The equation answers the domain, the range and the family without looking at the plane — show the graph alone '
      + 'unless translating between equation and graph is itself the skill being assessed.',
    );
  }

  /*
   * R4. NAMED FIGURES ARE MATCHED, NOT MULTIPLE-CHOICED.
   *
   * The shipped version of this bug: four graphs lettered A-D, a multiple
   * choice asking which was exponential, and the exponential one lettered "E".
   * More generally, a choice list of bare figure names is a matching task
   * wearing the wrong clothes — it asks about one figure and leaves the other
   * three unassessed, and every name it uses is a chance to cue the answer.
   */
  stages.forEach((stage) => {
    if (stage.kind !== 'multipleChoice' && stage.kind !== 'classification') return;
    const labels = choiceLabels(stage);
    if (labels.length < 3 || !labels.every((label) => FIGURE_NAME.test(label))) return;
    errors.push(
      `step "${stage.id}" offers bare figure names (${labels.join(', ')}) as answer choices. `
      + 'Use a `figureMatch` step: it labels the figures itself so a name cannot hint at the answer, '
      + 'and it asks about every figure instead of one.',
    );
  });

  /*
   * R5. THE STEM MUST NOT CONTAIN THE ANSWER TO THE CLASSIFICATION.
   *
   * "The discrete relation below is graphed. Is the relation discrete or
   * continuous?" reads like carelessness because it is, but it survives every
   * schema check ever written: both fields are well-formed and the answer key
   * is right. Only comparing the two catches it.
   */
  stages.forEach((stage) => {
    if (stage.kind !== 'classification' && stage.kind !== 'multipleChoice') return;
    // One word, so this cannot fire on a choice that merely shares a phrase
    // with the scenario ("hours worked").
    const named = choiceLabels(stage)
      .filter((label) => /^[A-Za-z][A-Za-z-]{3,}$/.test(label))
      .filter((label) => new RegExp(`\\b${label}\\b`, 'i').test(stimulus));
    // ASKING IS NOT TELLING. "classify the relationship as discrete or
    // continuous" names both options, and naming both is how a question asks.
    // Only one of them in the stem is the give-away: "the discrete relation
    // below is graphed — is it discrete or continuous?" Requiring exactly one
    // costs a false negative on a stem that asserts one and then lists both,
    // and buys never firing on a prompt that is merely doing its job.
    if (named.length !== 1) return;
    errors.push(
      `step "${stage.id}" asks the student to choose "${named[0]}", and the question already calls it that. `
      + 'Take the classification out of the givens; naming it there is the answer.',
    );
  });

  return { errors, warnings };
};

export default { instructionalIntegrityProblems };
