import { QUESTION_TYPE_CATALOG, getTypeEntry } from './questionTypeCatalog.js';
import { inequalityMatchesIntervals } from '../../tools/intervalNumberLine/intervalMath.js';
import { validateGrading, validateWorkflow } from '../workflow/questionWorkflow.js';

// Recognising a type name is not validation. `{ type: 'graphAnalysis', prompt:
// 'A graph falls from left to right until x = 2' }` used to pass because
// "graphAnalysis" is spelled correctly, and the student then saw a question
// about a graph that was never drawn. These checks ask the harder question:
// could the renderer actually show this?

const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const nonEmptyArray = (value) => Array.isArray(value) && value.length > 0;
const get = (question, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), question);
const has = (value) => value !== undefined && value !== null && value !== '';

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

const VISUAL_PROMISES = [
  {
    id: 'graph',
    pattern: /\b(the|this|each|following)\s+graph\b|\bgraph\s+(below|above|shown)\b|\bshown\s+(below|above)\b|\bpictured\b|\bthe\s+coordinate\s+plane\b/i,
    label: 'a graph',
    satisfied: (question) => isObject(question.graph) || isObject(question.visual)
      || has(get(question, 'functionSpec.type')) || nonEmptyArray(question.graphs)
      || nonEmptyArray(get(question, 'graph.functions')),
    remedy: 'Add a `graph` object or a `functionSpec` so the graph is actually drawn, or reword the prompt so it does not refer to one.',
  },
  {
    id: 'table',
    pattern: /\b(the|this|each|following)\s+table\b|\btable\s+(below|above|shown)\b/i,
    label: 'a table',
    satisfied: (question) => isObject(question.table) && nonEmptyArray(question.table.rows)
      && TYPES_THAT_RENDER_A_TABLE.has(String(question.toolId || question.type)),
    remedy: `Add a \`table\` object with \`columns\` and \`rows\`, and use a type that displays one (${[...TYPES_THAT_RENDER_A_TABLE].join(', ')}), or reword the prompt.`,
  },
  {
    id: 'numberLine',
    pattern: /\b(the|this|each|following)\s+number\s*line\b|\bnumber\s*line\s+(below|above|shown)\b/i,
    label: 'a number line',
    satisfied: (question) => nonEmptyArray(question.intervals) || nonEmptyArray(question.choices)
      || String(question.type) === 'numberLine' || String(question.type) === 'intervalNumberLine',
    remedy: 'Use `intervalNumberLine` with an `intervals` array, or `numberLine` with `choices`.',
  },
  {
    id: 'diagram',
    pattern: /\b(the|this|each|following)\s+(mapping\s+)?diagram\b|\bdiagram\s+(below|above|shown)\b/i,
    label: 'a diagram',
    satisfied: (question) => nonEmptyArray(question.pairs) || isObject(question.graph)
      || isObject(question.labDefinition) || String(question.type) === 'relationMapping',
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
const LATEX_DELIMITER = /(\$[^$\n]{1,80}\$|\\\(|\\\[)/;

const checkPlainTextMath = (question, label, errors, warnings) => {
  const strings = collectStrings(question);

  if (strings.some((text) => CONTROL_CHARACTERS.test(text))) {
    errors.push(
      `${label} contains an invisible control character, which is what a LaTeX command such as \\frac or \\bar turns into when JSON parses it. The text is already corrupted — rewrite it in plain Unicode math (≤, ≥, ∞, ×, √, ½).`,
    );
  }

  const latex = strings.find((text) => LATEX_COMMAND.test(text) || LATEX_DELIMITER.test(text));
  if (latex) {
    const sample = (latex.match(LATEX_COMMAND) || latex.match(LATEX_DELIMITER) || [''])[0];
    warnings.push(
      `${label} contains LaTeX (${sample}). MathMaster renders prompts as plain text, so the student would see the markup. Write the math in Unicode instead: ≤ ≥ ≠ ∞ × ÷ ± π √ ∪ ½ x².`,
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
  const entry = getTypeEntry(type);

  // Interactive tools have their own schema validation elsewhere; the catalogue
  // covers the core types.
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

  // A composed question's workflow. An unknown stage kind would otherwise
  // render as nothing at all, and a stage reading from a later one would grade
  // work the student has not done yet — both are silent in the JSON and loud
  // for the student.
  if (Array.isArray(question.workflow) && question.workflow.length) {
    validateWorkflow(question.workflow, { label }).errors.forEach((message) => errors.push(message));
    // A grading rule keyed to a stage that does not exist marks nothing and
    // says nothing. Only Preflight can catch it.
    validateGrading(question.workflow, question.grading, { label }).forEach((message) => errors.push(message));
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
    if (promise.satisfied(question)) return;
    errors.push(
      `${label} refers to ${promise.label} in its prompt, but the question contains none. ${promise.remedy}`,
    );
  });

  // A prompt that narrates a graph instead of showing one is the exact failure
  // this whole pass exists to catch, so it is called out by name.
  const narratesAGraph = /\ba\s+graph\s+(that\s+)?(falls|rises|increases|decreases|crosses|passes|starts|goes)\b/i.test(prompt)
    || /\b(a|the)\s+function\s+(crosses|falls|rises)\b/i.test(prompt);
  if (narratesAGraph && !VISUAL_PROMISES[0].satisfied(question)) {
    warnings.push(
      `${label} describes a graph in words rather than showing one. If the source material displays a graph, build it with graphAnalysis or functionGraph instead.`,
    );
  }

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
