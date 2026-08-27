import { QUESTION_TYPE_CATALOG, getTypeEntry } from './questionTypeCatalog.js';
import { inequalityMatchesIntervals } from '../../tools/intervalNumberLine/intervalMath.js';
import { readComposedQuestion, validateGrading, validateWorkflow } from '../workflow/questionWorkflow.js';
import { auditStaticGraphViewport } from '../../graphSpecUtils.js';
import { validateQuestionInteractionContracts } from '../interaction/interactionContract.js';

// Recognising a type name is not validation. `{ type: 'graphAnalysis', prompt:
// 'A graph falls from left to right until x = 2' }` used to pass because
// "graphAnalysis" is spelled correctly, and the student then saw a question
// about a graph that was never drawn. These checks ask the harder question:
// could the renderer actually show this?

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const nonEmptyArray = (value) => Array.isArray(value) && value.length > 0;
const get = (question, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), question);
const has = (value) => value !== undefined && value !== null && value !== '';

const looksLikeFiniteCategoryField = (field) => {
  if (!isObject(field) || field.type === 'choice' || field.type === 'text' || field.inputMode === 'text') return false;
  const accepted = nonEmptyArray(field.acceptedAnswers)
    ? field.acceptedAnswers
    : has(field.answer)
      ? [field.answer]
      : [];
  if (!accepted.length || accepted.length > 6) return false;
  return accepted.every((value) => {
    const text = String(value ?? '').trim();
    if (!text || /[=<>≤≥≠+*/^()[\]{}\\∞π√∪∩]/.test(text)) return false;
    const words = text.match(/[A-Za-z]+/g) || [];
    return words.length >= 1 && words.length <= 3;
  });
};

// Phrases that promise the student something to look at. If the prompt makes
// the promise and the question carries no such structure, the item is broken no
// matter how well-formed its JSON is.
// A `table` on a question is only visible to the student if that type's
// renderer draws one. `TableGrader` builds a fillable table, and the graders
// that share `QuestionVisual` show a read-only one; every other type ignores
// the field entirely, so promising a table there is the same broken question as
// promising a graph with no graph.
export const TYPES_THAT_RENDER_A_TABLE = new Set([
  'table', 'algebra', 'fraction', 'literal', 'system', 'orderedPair', 'multiAnswer',
  'numberLine', 'graphing',
]);

const composedHasStage = (composed, kinds = []) => Boolean(
  composed?.composed
  && Array.isArray(composed.workflow)
  && composed.workflow.some((stage) => kinds.includes(stage.kind)),
);

const VISUAL_PROMISES = [
  {
    id: 'graph',
    pattern: /\b(the|this|each|following)\s+graph\b|\bgraph\s+(below|above|shown)\b|\bshown\s+(below|above)\b|\bpictured\b|\bthe\s+coordinate\s+plane\b/i,
    label: 'a graph',
    satisfied: (question, composed) => isObject(question.graph) || isObject(question.visual)
      || has(get(question, 'functionSpec.type')) || nonEmptyArray(question.graphs)
      || nonEmptyArray(get(question, 'graph.functions'))
      || composedHasStage(composed, ['functionGraph', 'coordinatePlot']),
    remedy: 'Add a `graph` object or a `functionSpec` so the graph is actually drawn, or reword the prompt so it does not refer to one.',
  },
  {
    id: 'table',
    pattern: /\b(the|this|each|following)\s+table\b|\btable\s+(below|above|shown)\b/i,
    label: 'a table',
    satisfied: (question, composed) => (
      isObject(question.table) && nonEmptyArray(question.table.rows)
      && TYPES_THAT_RENDER_A_TABLE.has(String(question.toolId || question.type))
    ) || composedHasStage(composed, ['tableInput']),
    remedy: `Add a \`table\` object with \`columns\` and \`rows\`, and use a type that displays one (${[...TYPES_THAT_RENDER_A_TABLE].join(', ')}), or reword the prompt.`,
  },
  {
    id: 'numberLine',
    pattern: /\b(the|this|each|following)\s+number\s*line\b|\bnumber\s*line\s+(below|above|shown)\b/i,
    label: 'a number line',
    satisfied: (question, composed) => nonEmptyArray(question.intervals) || nonEmptyArray(question.choices)
      || String(question.type) === 'numberLine' || String(question.type) === 'intervalNumberLine'
      || composedHasStage(composed, ['numberLine', 'intervalInput']),
    remedy: 'Use `intervalNumberLine` with an `intervals` array, or `numberLine` with `choices`.',
  },
  {
    id: 'diagram',
    pattern: /\b(the|this|each|following)\s+(mapping\s+)?diagram\b|\bdiagram\s+(below|above|shown)\b/i,
    label: 'a diagram',
    satisfied: (question, composed) => nonEmptyArray(question.pairs) || isObject(question.graph)
      || isObject(question.labDefinition) || String(question.type) === 'relationMapping'
      || composedHasStage(composed, ['mappingDiagram']),
    remedy: 'Use `relationMapping` with a `pairs` array, or supply the diagram the prompt refers to.',
  },
];

// Every string a student could read, gathered so LaTeX in a label or an answer
// is caught as readily as LaTeX in the prompt.
const collectStrings = (value, out = [], depth = 0) => {
  if (depth > 6) return out;
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out, depth + 1));
  else if (isObject(value)) Object.values(value).forEach((item) => collectStrings(item, out, depth + 1));
  return out;
};

// Formfeed, backspace and vertical tab. None of these can be typed on purpose;
// they are what is left after "\frac" or "\bar" is parsed as a JSON escape, so
// the surrounding text has already lost characters.
const CONTROL_CHARACTERS = /[\f\b\v\0]/;

// A backslash followed by letters, "$…$" and "\(…\)" are all LaTeX. Prompts
// render as plain text, so the student would see the markup itself.
const LATEX_COMMAND = /\\[a-zA-Z]{2,}/;
const LATEX_DELIMITER = /(\$[^$\n]{1,80}\$(?!\s*\d)|\\\(|\\\[)/;


const auditQuestionGraphs = (question, type, label, errors, warnings, composedQuestion = false) => {
  const auditOne = (graph, graphLabel, strictBoundaryVisibility = false) => {
    if (!isObject(graph)) return;
    const result = auditStaticGraphViewport(graph, { label: graphLabel, strictBoundaryVisibility });
    result.errors.forEach((message) => errors.push(message));
    result.warnings.forEach((message) => warnings.push(message));
  };

  if (isObject(question.graph)) {
    const graphHasOwnDrawing = nonEmptyArray(question.graph.functions) || nonEmptyArray(question.graph.points)
      || nonEmptyArray(question.graph.segments) || isObject(question.graph.line)
      || has(question.graph.m) || has(question.graph.b);
    // Not every `graph` object is a GraphDisplay card. functionGraph and
    // graphAnalysis take their curve from `functionSpec`, and an interactive
    // tool — systemsWorkspace and the rest of the registry — draws its own
    // picture from `inequalities`, `system` or `pairs` and uses `graph` for
    // nothing but the viewport. Auditing those as static cards reported a
    // correct question as having "no drawable function", which is the same
    // mistake in reverse: judging JSON against a renderer it never reaches.
    const selfRenderedViewport = String(type) === 'constraintFunctionBuilder'
      || (String(type) === 'relationshipModel' && question.axisSetup?.required === true);
    const drawsItsOwnPicture = composedQuestion
      || selfRenderedViewport
      || has(question.toolId)
      || has(get(question, 'functionSpec.type'))
      || nonEmptyArray(question.inequalities)
      || isObject(question.system)
      || nonEmptyArray(question.pairs);
    if (graphHasOwnDrawing || !drawsItsOwnPicture) {
      auditOne(question.graph, `${label}.graph`, false);
    }
  }

  if (nonEmptyArray(question.graphs)) {
    const graphIds = new Set();
    question.graphs.forEach((item, index) => {
      const itemLabel = `${label}.graphs[${index}]`;
      if (!isObject(item)) {
        errors.push(`${itemLabel} must be an object.`);
        return;
      }
      const id = String(item.id || '').trim();
      if (id) {
        if (graphIds.has(id)) errors.push(`${label} repeats graph id "${id}"; graph ids must be unique.`);
        graphIds.add(id);
      }
      if (!isObject(item.graph)) {
        if (type === 'graphScenarioMatch' || type === 'graphComparison') {
          errors.push(`${itemLabel} has no nested \`graph\` object. The renderer ignores \`functions\` placed directly on the choice item.`);
        }
        return;
      }
      auditOne(item.graph, `${itemLabel}.graph`, type === 'graphScenarioMatch' || type === 'graphComparison');
    });

    if (type === 'graphScenarioMatch' && isObject(question.correctMatches)) {
      const scenarioIds = new Set((Array.isArray(question.scenarios) ? question.scenarios : []).map((scenario) => String(scenario?.id || '').trim()).filter(Boolean));
      const usedTargets = new Set();
      scenarioIds.forEach((scenarioId) => {
        const target = String(question.correctMatches[scenarioId] || '').trim();
        if (!target) errors.push(`${label} correctMatches is missing scenario "${scenarioId}".`);
        else if (!graphIds.has(target)) errors.push(`${label} correctMatches maps scenario "${scenarioId}" to unknown graph "${target}".`);
        else if (usedTargets.has(target)) errors.push(`${label} maps more than one scenario to graph "${target}", but the student UI only allows each graph to be assigned once.`);
        else usedTargets.add(target);
      });
      Object.keys(question.correctMatches).forEach((scenarioId) => {
        if (!scenarioIds.has(scenarioId)) errors.push(`${label} correctMatches contains unknown scenario "${scenarioId}".`);
      });

      // When an author says a real-world relationship is discrete or
      // continuous, make the matched graph honor that mathematical meaning.
      // This prevents count data such as whole snack packs or video shares from
      // quietly being shown as a continuous curve.
      const graphById = new Map((question.graphs || []).map((item) => [String(item?.id || ''), item?.graph]));
      (question.scenarios || []).forEach((scenario) => {
        const relationshipType = String(scenario?.relationshipType || '').trim();
        if (!['discrete', 'continuous'].includes(relationshipType)) return;
        const matchedGraph = graphById.get(String(question.correctMatches?.[scenario.id] || ''));
        if (!isObject(matchedGraph)) return;
        const hasPoints = nonEmptyArray(matchedGraph.points);
        const hasContinuousDrawing = nonEmptyArray(matchedGraph.functions) || nonEmptyArray(matchedGraph.segments) || isObject(matchedGraph.line) || has(matchedGraph.m) || has(matchedGraph.b);
        if (relationshipType === 'discrete' && (!hasPoints || hasContinuousDrawing)) {
          errors.push(`${label} scenario "${scenario.title || scenario.id}" is marked discrete, but its matched graph is not a point-only discrete graph.`);
        }
        if (relationshipType === 'continuous' && !hasContinuousDrawing) {
          errors.push(`${label} scenario "${scenario.title || scenario.id}" is marked continuous, but its matched graph has no continuous curve or segment.`);
        }
      });
    }
  }
};

const SUPPORTED_PROMPT_MATH = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g;

const checkPlainTextMath = (question, label, errors, warnings) => {
  const strings = collectStrings(question);

  if (strings.some((text) => CONTROL_CHARACTERS.test(text))) {
    errors.push(
      `${label} contains an invisible control character, which is what a LaTeX command such as \\frac or \\bar turns into when JSON parses it. The text is already corrupted — rewrite it in plain Unicode math (≤, ≥, ∞, ×, √, ½).`,
    );
  }

  // QuestionPrompt intentionally renders $...$, \\(...\\), $$...$$ and
  // \\[...\\] through MathDisplay. Strip those supported prompt segments before
  // checking for raw LaTeX. Other fields are still ordinary UI strings and
  // should not silently receive renderer markup.
  const prompt = String(question?.prompt ?? '');
  const promptRemainder = prompt.replace(SUPPORTED_PROMPT_MATH, '');
  const stringsToCheck = strings.map((text) => (text === prompt ? promptRemainder : text));
  const latex = stringsToCheck.find((text) => LATEX_COMMAND.test(text) || LATEX_DELIMITER.test(text));
  if (latex) {
    const sample = (latex.match(LATEX_COMMAND) || latex.match(LATEX_DELIMITER) || [''])[0];
    warnings.push(
      `${label} contains raw LaTeX (${sample}) outside a supported math-delimited question prompt. Use Unicode for ordinary UI text, or wrap prompt mathematics in $...$ / \\(...\\).`,
    );
  }
};

/**
 * Semantic validation for one question. Returns blocking errors and advisory
 * warnings. `label` is used verbatim in messages so they can be pasted into an
 * AI fix request.
 */
export const validateQuestionSemantics = (question = {}, { label = 'Question' } = {}) => {
  const errors = [];
  const warnings = [];

  if (!isObject(question)) return { errors: [`${label} must be an object.`], warnings };

  const type = question.toolId || question.type;
  const composed = readComposedQuestion(question);
  // Once a question has a workflow, the workflow is the renderer contract.
  // Applying legacy type-required fields on top of it recreates the exact V5
  // bug this layer is meant to prevent (for example, a functionGraph workflow
  // with a real table stage being told its type cannot render a table).
  const entry = composed.composed ? null : getTypeEntry(type);

  // Interactive tools have their own schema validation elsewhere; the catalogue
  // covers the core types. Composed questions are validated by their stages.
  if (entry) {
    const missingRequired = (entry.required || []).filter((requirement) => !has(get(question, requirement.path)));
    missingRequired.forEach((requirement) => {
      errors.push(`${label} (${type}) ${requirement.message}.`);
    });

    // The custom checks assume the required fields exist, so running them on top
    // of a missing-field error only restates it in different words.
    if (!missingRequired.length && typeof entry.validate === 'function') {
      let custom = [];
      try {
        custom = entry.validate(question) || [];
      } catch (error) {
        custom = [`could not be checked (${error.message})`];
      }
      custom.forEach((message) => errors.push(`${label} (${type}) ${message}.`));
    }
  }

  if (String(type) === 'multiAnswer' && Array.isArray(question.answerFields)) {
    question.answerFields.forEach((field, index) => {
      if (!looksLikeFiniteCategoryField(field)) return;
      warnings.push(
        `${label} answerFields[${index}] ("${field.label || field.id || 'field'}") looks categorical but would use a free-response box. `
        + 'Use `type: "choice"` with explicit `options` when there are a small number of valid categories, or `type: "text"` for intentional written language. This avoids math-keyboard entry for ordinary words.',
      );
    });
  }

  const interactionAudit = validateQuestionInteractionContracts(question, { label });
  errors.push(...interactionAudit.errors);
  warnings.push(...interactionAudit.warnings);

  // A composed question's workflow. An unknown stage kind would otherwise
  // render as nothing at all, and a stage reading from a later one would grade
  // work the student has not done yet — both are silent in the JSON and loud
  // for the student.
  composed.recipeErrors.forEach((message) => errors.push(message));
  if (composed.composed) {
    validateWorkflow(composed.workflow, { label }).errors.forEach((message) => errors.push(message));
    // A grading rule keyed to a stage that does not exist marks nothing and
    // says nothing. Only Preflight can catch it.
    validateGrading(composed.workflow, composed.grading, { label }).forEach((message) => errors.push(message));

    // Graph dependencies are real runtime dependencies now.  Validate only
    // the mathematically underdetermined cases rather than banning the feature.
    // A continuous graph can come from the student's equation directly, or from
    // a table that carries lineage back to that equation.  A discrete plot can
    // be built from table points alone.
    const workflowById = new Map(composed.workflow.map((stage) => [stage.id, stage]));
    composed.workflow.forEach((stage) => {
      if (stage.kind === 'functionGraph') {
        if (stage.sourceStageId) {
          const source = workflowById.get(stage.sourceStageId);
          if (source?.kind === 'tableInput') {
            const tableSource = source.sourceStageId ? workflowById.get(source.sourceStageId) : null;
            const hasModelLineage = tableSource?.kind === 'equationInput';
            if (!hasModelLineage && !isObject(composed.content?.functionSpec)) {
              errors.push(
                `${label} graph stage "${stage.id}" is continuous and reads a table that has no equation/model source. `
                + 'A finite table does not determine one unique continuous graph. Add an equation stage before the table, or provide a public functionSpec.',
              );
            }
          }
        } else if (!isObject(composed.content?.functionSpec)) {
          errors.push(
            `${label} graph stage "${stage.id}" has no student model source and no public functionSpec, so there is no function to graph.`,
          );
        }
      }
      if (stage.kind === 'coordinatePlot' && !stage.sourceStageId) {
        const pairs = Array.isArray(stage.pairs) && stage.pairs.length ? stage.pairs : composed.content?.pairs;
        if (!Array.isArray(pairs) || !pairs.length) {
          errors.push(`${label} point-plot stage "${stage.id}" has no upstream table and no ordered pairs to plot.`);
        }
      }
    });
  }

  // An interval number line that disagrees with its own inequality.
  //
  // This is the one validation here that catches a WRONG ANSWER rather than an
  // unrenderable question, which makes it the most important of them: a finite
  // interval standing in for a ray marks a correct student wrong and an
  // incorrect student right, and nothing else in Preflight would notice.
  if (String(type) === 'intervalNumberLine' && has(question.inequalityText) && nonEmptyArray(question.intervals)) {
    const check = inequalityMatchesIntervals(question.inequalityText, question.intervals, question.variable || 'x');
    if (check.checked && !check.matches) {
      errors.push(
        `${label} (intervalNumberLine) says "${question.inequalityText}", which is ${check.expected}, `
        + `but its \`intervals\` encode ${check.actual}. `
        + 'The number line\'s `min` and `max` are the viewport only — use `null` for an unbounded end '
        + 'so a ray reaches infinity instead of stopping at the edge of the picture.',
      );
    }
  }

  // The prompt-promises-a-visual rule, applied to every type.
  const prompt = [question.prompt, question.scenario, question.question]
    .filter((value) => typeof value === 'string')
    .join(' ');

  VISUAL_PROMISES.forEach((promise) => {
    if (!promise.pattern.test(prompt)) return;
    if (promise.satisfied(question, composed)) return;
    errors.push(
      `${label} refers to ${promise.label} in its prompt, but the question contains none. ${promise.remedy}`,
    );
  });

  // A prompt that narrates a graph instead of showing one is the exact failure
  // this whole pass exists to catch, so it is called out by name.
  const narratesAGraph = /\ba\s+graph\s+(that\s+)?(falls|rises|increases|decreases|crosses|passes|starts|goes)\b/i.test(prompt)
    || /\b(a|the)\s+function\s+(crosses|falls|rises)\b/i.test(prompt);
  if (narratesAGraph && !VISUAL_PROMISES[0].satisfied(question, composed)) {
    warnings.push(
      `${label} describes a graph in words rather than showing one. If the source material displays a graph, build it with graphAnalysis or functionGraph instead.`,
    );
  }

  auditQuestionGraphs(question, String(type || ''), label, errors, warnings, composed.composed);
  checkPlainTextMath(question, label, errors, warnings);

  return { errors, warnings };
};

export const validateQuestionsSemantics = (questions = []) => {
  const errors = [];
  const warnings = [];
  (Array.isArray(questions) ? questions : []).forEach((question, index) => {
    const result = validateQuestionSemantics(question, { label: `Question ${index + 1}` });
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  });
  return { errors, warnings };
};

export const VISUAL_PROMISE_IDS = Object.freeze(VISUAL_PROMISES.map((promise) => promise.id));
export const CATALOGUE_TYPE_COUNT = Object.keys(QUESTION_TYPE_CATALOG).length;
