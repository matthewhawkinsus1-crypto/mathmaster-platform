import { CORE_QUESTION_TYPES, SUPPORTED_QUESTION_TYPES } from '../../assignmentBlueprint.js';
import { TOOL_CATALOG } from '../../tools/toolCatalog.js';
import { getToolCapabilities } from '../../tools/toolCapabilities.js';
import { ACTIVITY_POLICIES, ACTIVITY_ROLES } from '../policies/activityPolicies.js';
import { CALCULATOR_MODES } from '../policies/calculatorPolicy.js';
import { DOK_LEVELS, INSTRUCTIONAL_LEVELS } from '../../questionMetadata.js';
import { TEXAS_STANDARDS_BY_COURSE, TEXAS_MATH_ACTIVE_COURSES } from '../../texasStandards.js';
import { EXAM_DOMAIN_REGISTRY } from '../assessment/examDomainRegistry.js';
import { QUESTION_TYPE_CATALOG, REPRESENTATIONS } from './questionTypeCatalog.js';
import { TYPES_THAT_RENDER_A_TABLE } from './semanticValidation.js';
import { ANALYSIS_NOTATIONS, NOTATION_ANALYSIS_KINDS, POINT_FEATURES } from '../../analysisRequestCatalog.js';
import {
  ALIGNMENT_FRAMEWORK_IDS,
  ALIGNMENT_ROLES,
  ASSESSMENT_FRAMEWORKS,
  EVIDENCE_LEVELS,
  EVIDENCE_MODES,
} from './alignments.js';

export const CONTRACT_SCHEMA_VERSION = 4;
export const CONTRACT_SCHEMA_NAME = 'MathMaster Assignment Bundle V4';

// Every field the platform owns. An AI that invents these produces JSON that
// looks authoritative and silently contradicts instructional policy, so the
// contract names them explicitly and the importer strips them.
export const PLATFORM_OWNED_FIELDS = Object.freeze([
  'id', 'assignmentId', 'questionId', 'createdAt', 'updatedAt',
  'attempts', 'maxAttempts', 'attemptsAllowed', 'attemptPolicy',
  'hintPolicy', 'hintsAllowed', 'replacementPolicy', 'allowReplacement',
  'feedbackPolicy', 'feedbackReleased', 'feedbackReleasedAt',
  'masteryPolicy', 'masteryWeight', 'readinessBand', 'studentReadiness',
  'isAdvanced', 'advanced', 'honors', 'isHonors', 'courseLevel',
  'alignmentKeys', 'masteryEvidenceKeys', 'evidenceKeys',
  'gradesByAssignment', 'questionRecords', 'persistence', 'serverState',
]);

// Fields a question may carry that the generator interprets. Kept here so the
// contract and the validator cannot drift.
const GENERATOR_FIELDS = Object.freeze([
  { field: 'generator.solutionRange', shape: '[min, max] integers', note: 'the range the intended answer is drawn from' },
  { field: 'generator.coefficientRange', shape: '[min, max] integers', note: 'coefficients on the variable; avoid ranges that can produce 0' },
  { field: 'generator.constantRange', shape: '[min, max] integers', note: 'constant terms' },
  { field: 'generator.variable', shape: 'string', note: 'defaults to "x"' },
  { field: 'generator.slopeRange', shape: '[min, max]', note: 'linear and graphing families' },
  { field: 'generator.interceptRange', shape: '[min, max]', note: 'linear and graphing families' },
  { field: 'generator.modifiedOneStep', shape: 'boolean', note: 'forces a one-step equation for modified content' },
  { field: 'generator.seedNote', shape: 'string', note: 'author note only; never affects generation' },
]);

const RESPONSE_TYPES = Object.freeze([
  { id: 'numeric', note: 'a single number' },
  { id: 'expression', note: 'an algebraic expression, graded by equivalence' },
  { id: 'equation', note: 'a full equation' },
  { id: 'orderedPair', note: '(x, y)' },
  { id: 'multiAnswer', note: 'several labelled parts in one question' },
  { id: 'selection', note: 'choose from supplied options' },
  { id: 'construction', note: 'plot points or build a graph' },
  { id: 'table', note: 'fill blanks in a table' },
]);

const line = (text = '') => text;
const bullet = (text) => `  - ${text}`;

const section = (title, lines) => [`## ${title}`, ...lines, ''].join('\n');

const toolSection = () => {
  const rows = Object.entries(TOOL_CATALOG).map(([toolId, definition]) => {
    const capabilities = getToolCapabilities(toolId) || {};
    const supports = Object.entries(capabilities)
      .filter(([, value]) => value === true)
      .map(([key]) => key.replace(/^supports/, ''))
      .join(', ');
    return bullet(`${toolId} — ${definition.label} · courses: ${(definition.courses || []).join(', ') || 'any'}${supports ? ` · supports: ${supports}` : ''}`);
  });
  rows.push('');
  rows.push(line('**Student-experience rules for registry tools:**'));
  rows.push(bullet('Always write a complete student-facing `prompt`. MathMaster shows the authored problem above the tool directions; do not rely on an internal mode name to explain the task.'));
  rows.push(bullet('For `sequenceExplorer` in `analyze` mode, the evidence shown before submission must stop before the requested target term: use `displayCount < targetN`. The runtime also enforces this so the answer cannot be printed in the table/graph by accident.'));
  rows.push(bullet('For sequence compare and finite-sum tasks, do not deliberately reveal the requested comparison/final term unless the item is a worked example.'));
  rows.push(bullet('Use normal V4 `alignments` for standards. `masteryEvidenceKeys` is platform-owned and must not be authored by the AI.'));
  rows.push(bullet('For `representationMatch`, supply explicit `sets`; never depend on demo/default representations.'));
  return section('Interactive tool types', rows);
};

const teksSection = () => {
  const lines = [];
  TEXAS_MATH_ACTIVE_COURSES.forEach((course) => {
    const standards = TEXAS_STANDARDS_BY_COURSE[course.id] || [];
    if (!standards.length) return;
    lines.push(line(`### ${course.label || course.id} (courseId: ${course.id}) — ${standards.length} standards`));
    standards.forEach((standard) => {
      lines.push(bullet(`${standard.code}${standard.readiness === 'readiness' ? ' [readiness]' : ''} — ${standard.description}`));
    });
    lines.push('');
  });
  return section('Active TEKS codes', lines);
};

const examSection = () => {
  const lines = [];
  Object.entries(EXAM_DOMAIN_REGISTRY).forEach(([framework, domains]) => {
    lines.push(line(`### ${framework}`));
    domains.forEach((domain) => lines.push(bullet(`domainId "${domain.id}" — ${domain.title}`)));
    lines.push('');
  });
  return section('Exam frameworks and their domain ids', lines);
};

const activityRoleSection = () => section('Activity roles', Object.values(ACTIVITY_ROLES).map((role) => {
  const policy = ACTIVITY_POLICIES[role] || {};
  return bullet(`"${role}" — ${policy.name || role}. ${policy.attempts ? `${policy.attempts} ${policy.attempts === 1 ? 'attempt' : 'attempts'}.` : ''} Feedback: ${policy.feedback || 'platform default'}.`);
}).concat([
  '',
  line('Set the role per question as `"activityRole": "classwork"`. MathMaster owns the'),
  line('attempts, hint and feedback policy attached to each role — do not restate them.'),
]));


// The catalogue is what stops the contract from listing type names without
// teaching how to build one. Every entry renders as a recipe: what it is for,
// when to reach for it, when not to, what it needs, and a working example.
const typeRecipeSection = () => {
  const lines = [
    line('Each type below is a different student experience, not a different label on a'),
    line('text box. Read "Do not use when" as carefully as "Use when" — most authoring'),
    line('mistakes are a type used for something it does not render.'),
    '',
  ];

  Object.entries(QUESTION_TYPE_CATALOG).forEach(([type, entry]) => {
    lines.push(line(`### \`${type}\` — ${entry.label}`));
    lines.push(line(`**Purpose.** ${entry.purpose}`));
    lines.push(line(`**Student sees.** ${entry.representation}`));
    if (entry.useWhen?.length) {
      lines.push(line('**Use when:**'));
      entry.useWhen.forEach((useCase) => lines.push(bullet(useCase)));
    }
    if (entry.studentAction) {
      // Answers the question the catalogue used to leave out: not "what
      // representation is this" but "what does the student physically do".
      lines.push(line(`**The student:** ${entry.studentAction}`));
    }
    if (entry.doNotUseWhen?.length) {
      lines.push(line('**Do not use when:**'));
      entry.doNotUseWhen.forEach((useCase) => lines.push(bullet(useCase)));
    }
    const required = (entry.required || []).map((requirement) => requirement.path);
    lines.push(line(`**Required fields:** ${required.length ? required.map((field) => `\`${field}\``).join(', ') : '`type`, `prompt`'}`));
    if (entry.optional?.length) {
      lines.push(line(`**Optional fields:** ${entry.optional.map((field) => `\`${field}\``).join(', ')}`));
    }
    // Type-specific warnings, emitted before the example so the reader meets
    // the trap before they meet the pattern they will copy.
    if (entry.notes?.length) {
      lines.push(line('**Watch out:**'));
      entry.notes.forEach((note) => lines.push(bullet(note)));
    }
    lines.push(line('**Example:**'));
    lines.push('```json');
    lines.push(JSON.stringify(entry.example, null, 2));
    lines.push('```');
    // A second example only where one exists, for the case the first cannot
    // show — the unbounded ray/union that the interval type keeps getting wrong.
    if (entry.unboundedExample) {
      lines.push(line('**Example — rays and unions (unbounded ends are `null`):**'));
      lines.push('```json');
      lines.push(JSON.stringify(entry.unboundedExample, null, 2));
      lines.push('```');
    }
    lines.push('');
  });

  return section('How to build each question type', lines);
};

const fidelitySection = () => section('Source representation fidelity', [
  line('**This is the most important rule in this document.**'),
  '',
  line('When you are given instructional material — a lesson, a slide deck, a worksheet —'),
  line('preserve the mathematical representation being taught. The representation *is*'),
  line('part of the skill. Reading a graph and reading a sentence about a graph are'),
  line('different abilities, and only one of them is what the lesson is teaching.'),
  '',
  bullet('A source graph must become an actual MathMaster graph.'),
  bullet('A source table must become a table.'),
  bullet('A number-line task must use a number-line representation.'),
  bullet('A mapping diagram must become a `relationMapping` question.'),
  bullet('Ordered pairs stay ordered pairs when that representation is the point.'),
  bullet('A visual relation must not become a verbal description to make authoring easier.'),
  bullet('Never replace "analyse the displayed graph" with prose describing what the graph does.'),
  bullet('Use a prose description of a graph only when interpreting a verbal situation is itself the intended skill.'),
  bullet('When MathMaster has an interactive tool that fits the source task, prefer it over a generic response question.'),
  '',
  line('**The specific mistake to avoid.** If you find yourself writing a prompt like'),
  line('"A graph falls from left to right until x = 2, then rises" — stop. That is a graph'),
  line('you were supposed to draw. Build it:'),
  '',
  '```json',
  '{',
  '  "type": "graphAnalysis",',
  '  "prompt": "Use the graph to answer each part.",',
  '  "functionSpec": { "type": "quadratic", "a": 1, "h": 2, "k": -3 },',
  '  "analysisRequests": [',
  '    { "id": "inc", "kind": "increasing", "notation": "interval" },',
  '    { "id": "dec", "kind": "decreasing", "notation": "interval" }',
  '  ]',
  '}',
  '```',
  '',
  line('MathMaster rejects a question whose prompt mentions "the graph", "the table",'),
  line('"the number line" or "the diagram" when the question carries no such structure.'),
  line('Writing around the check by removing the word "graph" from the prompt is worse'),
  line('than failing it — the student still cannot see what they are being asked about.'),
  '',
  line('**Showing a table the student only reads.** Use this shape ONLY when the source'),
  line('genuinely asks nothing but interpretation — the data is given, and the question is'),
  line('about what it means. Include the `table` object with `columns` and `rows`, and'),
  line('leave `table.answers` out so it renders read-only:'),
  '',
  '```json',
  '{',
  '  "type": "multiAnswer",',
  '  "prompt": "The table lists a city\'s recorded rainfall. Describe the trend and name the wettest month.",',
  '  "table": {',
  '    "columns": [{ "key": "month", "label": "Month" }, { "key": "rain", "label": "Rainfall (cm)" }],',
  '    "rows": [{ "month": "May", "rain": 12 }, { "month": "June", "rain": 9 }, { "month": "July", "rain": 4 }]',
  '  },',
  '  "answerFields": [',
  '    { "id": "trend", "label": "Trend", "answer": "decreasing" },',
  '    { "id": "wettest", "label": "Wettest month", "answer": "May" }',
  '  ]',
  '}',
  '```',
  '',
  line('For `multiAnswer`, do not send ordinary words through a math field. If the answer is'),
  line('a finite category (for example time/distance, linear/quadratic/exponential, or'),
  line('finite/infinite), author `type: "choice"` with explicit `options`. If the student'),
  line('must type a word or explanation, author `type: "text"`. Reserve the default math'),
  line('entry for actual mathematical notation. Finite roster-form sets are semantic'),
  line('answers, not strings: an answer such as `{-4, -3, -2}` is recognized as a set'),
  line('automatically, and MathMaster accepts equivalent element order and MathLive brace'),
  line('serialization. You may explicitly use `type: "set"`, but it is not required.'),
  '',
  line('**Do not reach for this shape when the source asked for more.** If the source says'),
  line('write the function, complete the table, graph it, and classify the relationship,'),
  line('then a table with two text boxes has deleted three of the four things the student'),
  line('was supposed to do. Use `relationshipModel` with the stages the source calls for.'),
  '',
  line(`Only these types display a \`table\`: ${[...TYPES_THAT_RENDER_A_TABLE].join(', ')}.`),
  line('On any other type the field is ignored and the student sees nothing, so a prompt'),
  line('that refers to a table on one of those types is rejected.'),
]);

const taskFidelitySection = () => section('Source task fidelity', [
  line('Representation fidelity is about what the student LOOKS AT. This rule is about'),
  line('what the student DOES, and it is violated more often.'),
  '',
  line('**Preserve every important mathematical action in the source task, not just its'),
  line('topic or its representation.** If the source asks students to write a function,'),
  line('complete a table, construct a graph, determine domain and range, and classify the'),
  line('relationship, the generated assignment must assess those actions. Do not delete'),
  line('task verbs because a narrower MathMaster tool is easier to author.'),
  '',
  line('**How to apply it.**'),
  bullet('Inventory the source verbs before authoring. Write, graph, complete, plot, determine, classify, explain, compare.'),
  bullet('Map every verb you selected to a student action in the generated question.'),
  bullet('If one type cannot carry all the actions, split the task across two tightly related questions rather than silently dropping actions.'),
  bullet('A verb you drop is a skill the assignment no longer assesses. That is a content decision, not a formatting one.'),
  '',
  line('**The reductions to watch for.** Each produces valid JSON and a poorer assignment'),
  line('than the source it came from:'),
  '',
  bullet('`multiAnswer` where the student was supposed to BUILD something. It is a response form; typing "discrete" is not constructing a graph.'),
  bullet('`relationshipModel` reduced to naming the independent and dependent variables when the source also asked for the equation, the graph and the reasonable domain.'),
  bullet('`table` alone where the source also asked for the graph of those same values.'),
  bullet('`relationMapping` without `"plot"` where the source showed both a coordinate graph and a mapping diagram.'),
  bullet('`graphAnalysis` where the source asked the student to DRAW the graph — that is `functionGraph`.'),
  '',
  line('**Worked example.** A source task reads: "A group sells bars for $2 each. Write a'),
  line('function for the money collected, complete the table, graph it, state the reasonable'),
  line('domain and range, and say whether it is discrete or continuous."'),
  '',
  line('That is six verbs. Keep them in ONE composed `relationshipModel` when they describe'),
  line("one mathematical model. MathMaster now threads the student's own equation into"),
  line('their table and then threads those completed table values into the graphing stage:'),
  '',
  '```json',
  '{',
  '  "type": "relationshipModel",',
  '  "prompt": "A group sells bars for $2 each. Build one model from quantities through the graph, then state the reasonable domain and range and classify the relationship.",',
  '  "scenario": "A group sells bars for $2 each. The money collected depends on the number sold.",',
  '  "quantities": [',
  '    { "id": "bars", "label": "Bars sold", "unit": "bars" },',
  '    { "id": "money", "label": "Money collected", "unit": "dollars" }',
  '  ],',
  '  "correctIndependentId": "bars",',
  '  "correctDependentId": "money",',
  '  "recipe": {',
  '    "name": "functionModeling",',
  '    "ask": ["quantities", "equation", "table", "graph", "domain", "range", "continuity"]',
  '  },',
  '  "correctEquation": "f(x)=2x",',
  '  "tableXValues": [0, 1, 2, 3, 4],',
  '  "graphMode": "discrete",',
  '  "continuity": "discrete",',
  '  "correctDomain": "x>=0",',
  '  "correctRange": "f>=0",',
  '  "notation": "inequality",',
  '  "graph": { "xMin": 0, "xMax": 8, "yMin": 0, "yMax": 16, "xStep": 1, "yStep": 2 }',
  '}',
  '```',
  '',
  line('**Dependency rule:** do not duplicate a hidden answer key in the table or graph just'),
  line('to make later stages work. In `functionModeling`, the table is evaluated from the'),
  line("equation the STUDENT wrote. The graph is then constructed from the STUDENT'S"),
  line('completed table (and the equation lineage carried with it). If the equation and'),
  line('table disagree, the graph stage waits for the student to reconcile them instead of'),
  line('silently switching to the authored correct function.'),
  '',
  line("For a continuous model the graph stage plots the student's table points and asks"),
  line('the student to draw the continuous function through them. For a discrete model it'),
  line('plots only the ordered pairs. Use the separate-question split only when the source'),
  line('really contains separate tasks, not to work around a missing dependency.'),
  '',
  line('**Choosing a graph for an analysis question.** When the target is identifying BOTH'),
  line('increasing and decreasing intervals, choose a function that visibly does both. A'),
  line('parent cubic is increasing everywhere, so asking for its decreasing intervals has'),
  line('an empty answer — answerable, but it teaches nothing and reads as a trick. Ask for'),
  line('an empty interval only when the lesson specifically intends that idea.'),
]);

const planningSection = () => section('Plan before you generate', [
  line('Before writing any JSON, work through this silently. Do not include it in your'),
  line('output — the output is still one JSON object and nothing else.'),
  '',
  line('**1. What does the source teach?** List the mathematical content: interval and'),
  line('inequality notation, domain and range, increasing/decreasing, positive/negative,'),
  line('relations, discrete versus continuous, contextual domain and range, and so on.'),
  '',
  line('**2. What representations does the source use?** Count them: number lines,'),
  line('coordinate graphs, piecewise graphs, smooth curves, ordered pairs, tables,'),
  line('mapping diagrams, equations, real-world contexts.'),
  '',
  line('**3. Match the mix.** The finished assignment must reflect the representation mix'),
  line('of the source. A graph-heavy source must produce a graph-heavy assignment. If the'),
  line('source teaches domain and range with twenty graphs, an assignment with zero'),
  line('rendered graphs is wrong however well its JSON validates.'),
  '',
  line('**4. Prefer fewer, richer questions.** One graph carrying four sub-answers through'),
  line('`analysisRequests` or `multiAnswer` beats four separate prose questions about the'),
  line('same graph. Aim for 10-12 substantial questions rather than 20 thin ones.'),
]);

/**
 * The complete AI-facing authoring contract, generated from the live registries
 * rather than maintained by hand. Paste the result into any AI assistant and it
 * knows exactly what MathMaster will accept.
 */
export const buildAdvancedAuthoringContract = ({ generatedAt = new Date() } = {}) => {
  const parts = [];

  parts.push([
    `# ${CONTRACT_SCHEMA_NAME}`,
    `Schema version: ${CONTRACT_SCHEMA_VERSION}`,
    `Generated from the running MathMaster build on ${generatedAt.toISOString().slice(0, 10)}.`,
    '',
    'You are authoring a math assignment for MathMaster. Read this contract, then',
    'return **one valid JSON object and nothing else** — no prose, no markdown',
    'fence, no explanation before or after.',
    '',
  ].join('\n'));

  parts.push(section('Top-level structure', [
    '```json',
    '{',
    `  "schemaVersion": ${CONTRACT_SCHEMA_VERSION},`,
    '  "assignment": {',
    '    "title": "Systems of Equations — Classwork",',
    '    "assignmentType": "notesClasswork | practice",',
    '    "variantMode": "personalized | shared",',
    '    "courseId": "algebra1 | algebra2",',
    '    "folder": "Algebra I/Module 3/Systems"',
    '  },',
    '  "questions": [ /* see below */ ]',
    '}',
    '```',
    '',
    line('`assignment.folder` is optional. Dates, class periods, release behaviour and'),
    line('publication are set by the teacher in Preflight — do not put them in the JSON.'),
  ]));

  parts.push(section('Question structure', [
    '```json',
    '{',
    '  "type": "algebra",',
    '  "prompt": "Solve for x.",',
    '  "activityRole": "classwork",',
    '  "dok": 2,',
    '  "difficultyBand": 3,',
    '  "calculator": "none",',
    '  "responseType": "numeric",',
    '  "generator": { "solutionRange": [-9, 9], "coefficientRange": [2, 9] },',
    '  "alignments": [',
    '    { "framework": "teks", "code": "A.5A", "role": "primary", "evidenceLevel": "assessed" }',
    '  ],',
    '  "assessmentContext": { "framework": "course" }',
    '}',
    '```',
    '',
    line('**Required on every question:** `type`, `prompt`, and at least one `alignments`'),
    line('entry with `role: "primary"`.'),
    line('**Optional:** `activityRole`, `dok`, `difficultyBand`, `calculator`,'),
    line('`responseType`, `generator`, `assessmentContext`, `context` (word-problem scenario).'),
  ]));

  parts.push(section('Analysis requests on a graph', [
    line('`graphAnalysis` and `functionInvestigation` ask their sub-questions through'),
    line('`analysisRequests`. Each entry needs an `id` and a `kind`. These are the only'),
    line('legal values — anything else is rejected, so do not invent one:'),
    '',
    line('**Answered by typing an interval or an inequality:**'),
    ...NOTATION_ANALYSIS_KINDS.map((kind) => bullet(`\`"kind": "${kind}"\``)),
    '',
    line('Add `"notation"` to say how the answer is written:'),
    ...ANALYSIS_NOTATIONS.map((notation) => bullet(`\`"${notation}"\``)),
    '',
    line('**Answered by clicking a point on the graph.** Use `"kind": "point"` *together'),
    line('with* a `feature`. `"kind": "point"` on its own has no location to find, so the'),
    line('student gets an empty click target:'),
    ...POINT_FEATURES.map((feature) => bullet(`\`{ "id": "...", "kind": "point", "feature": "${feature}" }\``)),
    '',
    line('**Where a function is positive or negative** is `"kind": "positive"` and'),
    line('`"kind": "negative"`. It is not a point feature — do not write `"kind": "point"`'),
    line('for it.'),
    '',
    '```json',
    '"analysisRequests": [',
    '  { "id": "domain", "kind": "domain", "notation": "interval" },',
    '  { "id": "pos", "kind": "positive", "notation": "interval" },',
    '  { "id": "roots", "kind": "point", "feature": "xIntercepts" }',
    ']',
    '```',
  ]));

  parts.push(section('Writing math inside prompts', [
    line('Prompts, labels and context are rendered as **plain text**. LaTeX is not'),
    line('typeset — a student would see the raw markup — and a backslash is not a legal'),
    line('JSON escape, so LaTeX also breaks the file. `\\frac` is the worst case: it'),
    line('parses without complaint because `\\f` means formfeed, silently replacing the'),
    line('fraction with an invisible control character.'),
    '',
    line('**Never write LaTeX.** No `\\frac`, `\\le`, `\\text{}`, `\\times`, `$…$`,'),
    line('`\\(…\\)`, `\\begin{}`. Write the mathematics in Unicode instead:'),
    ...[
      ['\\le / \\leq', '≤'],
      ['\\ge / \\geq', '≥'],
      ['\\neq', '≠'],
      ['\\infty', '∞'],
      ['\\times', '×'],
      ['\\div', '÷'],
      ['\\pm', '±'],
      ['\\pi', 'π'],
      ['\\theta', 'θ'],
      ['\\sqrt{x}', '√x'],
      ['\\cup', '∪'],
      ['\\frac{1}{2}', '1/2  (or ½)'],
      ['x^2', 'x²  (or x^2 — the caret is fine)'],
      ['\\{1, 2, 3\\}', '{1, 2, 3}'],
    ].map(([latex, unicode]) => bullet(`\`${latex}\` → \`${unicode}\``)),
    '',
    line('The only backslash that ever belongs in this JSON is `\\n` for a line break'),
    line('and `\\"` for a quotation mark inside a string.'),
  ]));

  parts.push(section('Static graph objects — do not guess the function schema', [
    line('Read-only graphs (`graph`, and each `graphs[].graph` inside graphScenarioMatch or graphComparison) use the shared `GraphDisplay` contract.'),
    line('Canonical storage nests each graph choice as `{ "id": "g1", "graph": { ... } }`, but authoring intake also accepts graph fields directly on the choice and normalizes them.'),
    line('A scenario canonically uses `description` (with optional `title`); authoring intake also accepts common `text`/`prompt` aliases.'),
    '',
    line('A quadratic may be written in either of these TWO forms. Choose one form and never mix them:'),
    bullet('Standard form: `{ "type": "quadratic", "a": -1, "b": 8, "c": 0 }` means y = ax² + bx + c.'),
    bullet('Vertex form: `{ "type": "quadratic", "a": -1, "h": 4, "k": 16 }` means y = a(x - h)² + k.'),
    line('Vertex form is especially useful when the maximum/minimum must be placed deliberately. Standard form remains supported for older content.'),
    '',
    line('For routine static graphs, omit `yMin`/`yMax` unless the viewing window is itself instructional. MathMaster auto-fits the rendered y-window to keep the authored mathematics visible. Use `lockViewport: true` only when a specific crop/window is part of the task.'),
    line('Do not use negative x-values for a real-world axis such as elapsed time unless the context explicitly permits negative time.'),
    line('If the context is countable only in whole units (tickets, packs, people), use plotted `points` rather than a continuous line when discreteness matters instructionally.'),
  ]));

  parts.push(section('Question and tool types', [
    line('Core types:'),
    ...CORE_QUESTION_TYPES.map((type) => bullet(type)),
    '',
    line(`All ${SUPPORTED_QUESTION_TYPES.length} accepted values for "type" are listed here and in the tool section below.`),
  ]));

  parts.push(fidelitySection());
  // Representation fidelity is about what the student looks at; task fidelity is
  // about what they do. The second is violated more often, so it sits directly
  // after the first rather than further down.
  parts.push(taskFidelitySection());
  parts.push(planningSection());
  parts.push(typeRecipeSection());
  parts.push(toolSection());

  parts.push(activityRoleSection());

  parts.push(section('Depth of Knowledge', DOK_LEVELS.map((level) => (
    bullet(`${level.level ?? level.value ?? level.id} — ${level.label || level.name || ''}${level.description ? `: ${level.description}` : ''}`)
  )).concat([
    '',
    line('`"dok"` must be an integer 1–4. modelingLab questions must be DOK 3 or 4.'),
  ])));

  parts.push(section('Difficulty bands', [
    line('`"difficultyBand"` is an integer 1–5, where 1 is most scaffolded and 5 is most demanding.'),
    line('Instructional levels available for modified content:'),
    ...INSTRUCTIONAL_LEVELS.map((level) => bullet(`${level.key || level.id} — ${level.label || ''}`)),
  ]));

  parts.push(section('Calculator', [
    line('`"calculator"` accepts:'),
    ...Object.values(CALCULATOR_MODES).map((mode) => bullet(`"${mode}"`)),
    '',
    line('Use "none" for items that assess computation itself. Use "teacherChoice" to let'),
    line('the teacher decide at Preflight. Assessment contexts can override this.'),
  ]));

  parts.push(section('Response types', RESPONSE_TYPES.map((entry) => bullet(`"${entry.id}" — ${entry.note}`))));

  parts.push(section('Generator fields', [
    line('Generators make each student see a different version of the same question.'),
    line('Ranges are inclusive `[min, max]` integer pairs.'),
    ...GENERATOR_FIELDS.map((entry) => bullet(`\`${entry.field}\` — ${entry.shape}: ${entry.note}`)),
    '',
    line('`assignment.variantMode: "personalized"` means personalize where each question supports it.'),
    line('Questions with generators or variants receive stable student-specific versions; fixed graphs/data remain fixed.'),
    line('A fixed interactive question no longer forces the entire assignment into shared mode.'),
    line('Use `"shared"` only when you intentionally want every question/version to be identical for all students.'),
    '',
    line('Other rules: a range must have min <= max; a coefficient range must not be able'),
    line('to produce 0; two slopes that must differ need a range wide enough to differ.'),
  ]));

  parts.push(section('Modeling lab format', [
    '```json',
    '{',
    '  "type": "modelingLab",',
    '  "dok": 3,',
    '  "labDefinition": {',
    '    "scenario": "A city\'s population grows each year.",',
    '    "parameters": [',
    '      { "id": "rate", "label": "Growth rate", "min": 0.01, "max": 0.2, "step": 0.01 }',
    '    ],',
    '    "targets": [ { "id": "population2030", "prompt": "Predict the 2030 population." } ]',
    '  }',
    '}',
    '```',
    '',
    line('`labDefinition.parameters` must have at least one entry, and DOK must be 3 or 4.'),
  ]));

  parts.push(section('Alignments', [
    line('`alignments` is the canonical way to say what a question measures. It is a flat'),
    line('list, and every entry names its own framework:'),
    '',
    '```json',
    '"alignments": [',
    '  { "framework": "teks", "code": "A.2A", "role": "primary", "evidenceLevel": "assessed" }',
    ']',
    '```',
    '',
    line(`Valid \`framework\`: ${ALIGNMENT_FRAMEWORK_IDS.join(', ')}.`),
    line(`Valid \`role\`: ${ALIGNMENT_ROLES.join(', ')}.`),
    line(`Valid \`evidenceLevel\`: ${EVIDENCE_LEVELS.join(', ')}.`),
    line(`Valid \`evidenceMode\`: ${EVIDENCE_MODES.join(', ')}.`),
    '',
    line('TEKS alignments use `code`. Exam alignments use `domainId`.'),
    '',
    line('**Align each question individually. Do not copy one standard onto every'),
    line('question in the assignment.** A lesson has a topic; a question has a'),
    line('standard, and they are not the same thing. Evaluating a function from a'),
    line('table, deciding whether a relation is a function, and graphing a compound'),
    line('inequality can all belong to one lesson and still assess three different'),
    line('standards.'),
    '',
    line('This matters because `alignments` is what mastery evidence is recorded'),
    line('against. A question tagged with a standard it does not assess reports'),
    line('progress the student has not made, and My Math Path will route on it.'),
    '',
    line('Where a question genuinely measures a prerequisite — an earlier grade'),
    line('level, or an earlier standard in the same course — align it to that'),
    line('prerequisite rather than to the lesson\'s headline standard. Choose from'),
    line('the standards catalogue; do not invent a code, and do not stretch a'),
    line('nearby one to fit.'),
    '',
    line('**For an ordinary course question, supply the TEKS alignment only.**'),
    line('MathMaster already maps TEKS to SAT, ACT, TSIA2 and ASVAB domains and will add'),
    line('those crosswalks itself, marked as informational overlap rather than exam'),
    line('evidence. Do not pad the list with all five frameworks.'),
    '',
    line('Declare an exam framework directly only when the item is genuinely written in'),
    line('that exam\'s style, and pair it with assessmentContext:'),
    '',
    '```json',
    '"alignments": [',
    '  { "framework": "teks", "code": "A.2A", "role": "primary", "evidenceLevel": "assessed" },',
    '  { "framework": "digitalSAT", "domainId": "algebra", "role": "primary", "evidenceMode": "direct" }',
    '],',
    '"assessmentContext": { "framework": "digitalSAT", "examStyle": true }',
    '```',
  ]));

  parts.push(examSection());

  parts.push(section('Assessment context', [
    line(`\`assessmentContext.framework\` accepts: ${ASSESSMENT_FRAMEWORKS.join(', ')}.`),
    line('Use "course" (or omit it) for ordinary coursework. Use an exam value only when'),
    line('the item was deliberately authored in that exam\'s style — this is what separates'),
    line('"this skill overlaps SAT Algebra" from "this is an SAT Algebra item", and the two'),
    line('must not carry the same readiness weight.'),
  ]));

  parts.push(teksSection());

  parts.push(section('Dates and times', [
    line('Do not put dates in the JSON. The teacher sets release, due and final late'),
    line('deadlines in Preflight. If a date is unavoidable, use ISO-8601 with an offset,'),
    line('for example "2026-09-14T15:30:00-05:00".'),
  ]));

  parts.push(section('Fields you must never invent', [
    line('MathMaster owns instructional and system policy. You author the mathematics.'),
    line('Never emit any of these — they are stripped on import:'),
    ...PLATFORM_OWNED_FIELDS.map((field) => bullet(`\`${field}\``)),
    '',
    line('In particular: do not decide attempts allowed, hint policy, replacement-question'),
    line('policy, feedback release, mastery policy, a student\'s readiness band, or whether'),
    line('a student is advanced.'),
  ]));

  parts.push(section('Honors', [
    line('Do not designate students or destination classes as Honors. Author appropriate'),
    line('rigor when the teacher asks for it. MathMaster determines Honors requirements'),
    line('from the teacher\'s destination-class configuration, which is authoritative.'),
  ]));

  parts.push(section('Output rules', [
    bullet('Return exactly one JSON object.'),
    bullet('No markdown fence, no commentary, no trailing text.'),
    bullet('Use straight quotes and valid JSON — no comments, no trailing commas.'),
    bullet('No LaTeX anywhere. Write math in Unicode (≤, ≥, ∞, ×, π, √, ∪, ½).'),
    bullet('Every question needs a type, a prompt and a primary alignment.'),
    bullet('If you are unsure whether a field exists, leave it out rather than inventing it.'),
  ]));

  return parts.join('\n');
};

const COMPACT_RECIPE_TYPES = Object.freeze([
  'table', 'multiAnswer', 'intervalNumberLine', 'functionGraph', 'graphAnalysis',
  'relationshipModel', 'graphScenarioMatch', 'graphComparison', 'relationMapping',
  'sequenceExplorer', 'representationMatch', 'functionInvestigation2',
]);

const COMPACT_TOOL_EXAMPLES = Object.freeze({
  sequenceExplorer: {
    label: 'Sequence explorer',
    action: 'Analyzes a sequence, finds a term, fills a missing term, compares two sequences, or writes recursive/explicit rules.',
    required: ['mode', 'sequence'],
    example: { type: 'sequenceExplorer', prompt: 'Find the common difference and the 8th term.', mode: 'analyze', sequence: { kind: 'arithmetic', first: 7, difference: 4 }, targetN: 8, displayCount: 6 },
  },
  representationMatch: {
    label: 'Connect representations',
    action: 'Matches equation, table, context, or graph representations of the same relationship.',
    required: ['mode', 'sets'],
    example: { type: 'representationMatch', prompt: 'Choose the graph that matches y = 2x + 1.', mode: 'graphMatch', targetId: 'linear', sets: [{ id: 'linear', graphSpec: { type: 'linear', a: 2, h: 0, k: 1 } }, { id: 'quadratic', graphSpec: { type: 'quadratic', a: 1, h: 0, k: -4 } }] },
  },
  functionInvestigation2: {
    label: 'Analyze a function',
    action: 'Reads family-specific domain/range, intercept, feature, behavior, or comparison information from a graph.',
    required: ['mode', 'function'],
    example: { type: 'functionInvestigation2', prompt: 'Determine the domain and range.', mode: 'domainRange', function: { type: 'quadratic', a: -1, h: 2, k: 6 } },
  },
});

const compactAuthoringExample = (example) => {
  const clone = example && typeof example === 'object' ? JSON.parse(JSON.stringify(example)) : example;
  const visit = (node, parentKey = '') => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach((item) => visit(item, parentKey)); return; }
    if (Object.prototype.hasOwnProperty.call(node, 'equationLatex') && !Object.prototype.hasOwnProperty.call(node, 'equation')) {
      node.equation = node.equationLatex; delete node.equationLatex;
    }
    if (Object.prototype.hasOwnProperty.call(node, 'equationsLatex') && !Object.prototype.hasOwnProperty.call(node, 'equations')) {
      node.equations = node.equationsLatex; delete node.equationsLatex;
    }
    if (Array.isArray(node.alignments) && !Object.prototype.hasOwnProperty.call(node, 'standard')) {
      const primary = node.alignments.find((entry) => entry?.framework === 'teks' && entry?.role === 'primary' && entry?.code);
      if (primary) {
        node.standard = primary.code;
        const secondaries = node.alignments.filter((entry) => entry?.framework === 'teks' && entry?.role === 'secondary' && entry?.code).map((entry) => entry.code);
        const prerequisites = node.alignments.filter((entry) => entry?.framework === 'teks' && entry?.role === 'prerequisite' && entry?.code).map((entry) => entry.code);
        if (secondaries.length) node.secondaryStandards = secondaries;
        if (prerequisites.length) node.prerequisiteStandards = prerequisites;
        delete node.alignments;
      }
    }
    if (parentKey === 'graph') {
      delete node.xMin; delete node.xMax; delete node.yMin; delete node.yMax; delete node.xStep; delete node.yStep;
    }
    Object.entries(node).forEach(([key, value]) => visit(value, key));
    if (node.graph && typeof node.graph === 'object' && !Array.isArray(node.graph)) {
      const drawableKeys = ['functions', 'points', 'segments', 'line', 'm', 'b', 'axisDisplay', 'xAxisLabel', 'xAxisUnit', 'yAxisLabel', 'yAxisUnit'];
      if (!drawableKeys.some((key) => Object.prototype.hasOwnProperty.call(node.graph, key))) delete node.graph;
    }
  };
  visit(clone);
  return clone;
};

const compactTeksSection = (courseId = null) => {
  const requestedCourse = ['algebra1', 'algebra2'].includes(String(courseId || '')) ? String(courseId) : null;
  const lines = [];
  TEXAS_MATH_ACTIVE_COURSES
    .filter((course) => ['algebra1', 'algebra2'].includes(course.id))
    .filter((course) => !requestedCourse || course.id === requestedCourse)
    .forEach((course) => {
      const standards = TEXAS_STANDARDS_BY_COURSE[course.id] || [];
      lines.push(`### ${course.label || course.id}`);
      standards.forEach((standard) => lines.push(`- ${standard.code} — ${standard.description}`));
      lines.push('');
    });
  return lines.join('\n');
};

const compactRecipeSection = () => COMPACT_RECIPE_TYPES.map((type) => {
  const entry = QUESTION_TYPE_CATALOG[type];
  const special = COMPACT_TOOL_EXAMPLES[type];
  const required = entry
    ? (entry.required || []).map((item) => item.path).filter(Boolean)
    : (special?.required || []);
  const label = entry?.label || special?.label || type;
  const action = entry?.studentAction || entry?.purpose || special?.action || 'Uses the named interactive tool.';
  const example = entry?.example || special?.example;
  return [
    `### ${type} — ${label}`,
    action,
    `Needs: ${required.length ? required.join(', ') : 'prompt'}.`,
    ...(example ? [`Example: ${JSON.stringify(compactAuthoringExample(example))}`] : []),
  ].join('\n');
}).join('\n\n');

const compactOtherTypeSection = () => SUPPORTED_QUESTION_TYPES
  .filter((type) => !COMPACT_RECIPE_TYPES.includes(type))
  .map((type) => {
    const entry = QUESTION_TYPE_CATALOG[type];
    const required = (entry?.required || []).map((item) => item.path).filter(Boolean);
    return `- ${type}${entry?.label ? ` — ${entry.label}` : ''}; needs ${required.length ? required.join(', ') : 'prompt'}`;
  })
  .join('\n');

/**
 * Default AI-facing contract. This is intentionally an AUTHORING API rather
 * than a dump of renderer implementation details. MathMaster owns defaults,
 * viewports, mixed fixed/generated delivery, policy and storage normalization.
 * The long registry-derived contract remains available to developers through
 * buildAdvancedAuthoringContract, but teachers should not need it.
 */
export const AUTHORING_INTENT_SCHEMA_VERSION = 5;
export const AUTHORING_INTENT_SCHEMA_NAME = 'MathMaster Authoring Intent V5';

/**
 * Default teacher-facing AI contract. V4 remains the internal/runtime schema,
 * but outside AIs author mathematical intent instead of renderer implementation.
 */
export const buildAuthoringContract = ({ generatedAt = new Date(), courseId = null } = {}) => [
  `# ${AUTHORING_INTENT_SCHEMA_NAME}`,
  `Generated from MathMaster on ${generatedAt.toISOString().slice(0, 10)}.`,
  '',
  'Return one JSON object and nothing else. Describe the mathematics and what the student must DO.',
  'Do not choose MathMaster React components, V4 question types/toolIds, Firestore storage shapes, graph viewport bounds, attempt rules, or internal grading fields. MathMaster compiles this intent into its V4 runtime format.',
  'If MathMaster later asks for a repair, KEEP schemaVersion 5. Never convert a V5 intent into V4 or add renderer plumbing such as type, toolId, functionSpec, analysisRequests, or graph merely to satisfy an internal error.',
  '',
  '## Assignment shape',
  '```json',
  '{',
  '  "schemaVersion": 5,',
  '  "assignment": {',
  '    "title": "Descriptive title",',
  `    "courseId": "${courseId || 'algebra1'}",`,
  '    "assignmentType": "notesClasswork",',
  '    "folder": "Algebra I/Module 1/Functions"',
  '  },',
  '  "activities": [',
  '    { "role": "warmup", "title": "Warm-Up", "questions": [] },',
  '    { "role": "classwork", "title": "Classwork", "questions": [] },',
  '    { "role": "practice", "title": "Practice", "questions": [] }',
  '  ]',
  '}',
  '```',
  '',
  'Dates, classes, attempts, hints, feedback release, mastery weights, IDs, and student readiness are set by MathMaster/teacher Preflight. Do not include them.',
  '',
  '## Question intent',
  'Every question needs:',
  '- `prompt`: student-facing wording.',
  '- `standard`: the primary TEKS for THIS question.',
  '- `studentActions`: what the student physically does.',
  '- the mathematical data needed to perform those actions.',
  '',
  'Optional Guided Notes for Classwork:',
  '- Add `guidedNotes.steps` only when you can provide question-specific mathematical instruction that teaches the process without giving away a future answer.',
  '- Each step may use `{ "title":"...", "instruction":"...", "stageId":"..." }`. `stageId` is optional; MathMaster automatically derives stage-aware notes for composed workflows when authored notes are absent.',
  '- Good notes name a mathematical idea, relationship, representation strategy, decision, misconception, or connection to earlier student work.',
  '- Never author filler such as "Read the question", "Identify what is being asked", "Solve the problem", "Enter your answer", "Think carefully", or "Check your answer". MathMaster suppresses those notes rather than showing an empty-feeling panel.',
  '- Guided Notes teach the process. Do not reveal a requested value unless the student has already produced/validated that value in an earlier stage.',
  '',
  'Example — meaningful Guided Notes:',
  '```json',
  '{',
  '  "standard": "A.3C",',
  '  "prompt": "Build the table and graph for V(t)=1.8t.",',
  '  "studentActions": ["completeTable","constructGraph","classifyContinuity"],',
  '  "function": { "family":"linear", "m":1.8, "b":0 },',
  '  "table": { "columns":["t","V(t)"], "rows":[{"t":0,"V(t)":null},{"t":0.5,"V(t)":null}] },',
  '  "guidedNotes": { "steps": [',
  '    { "title":"Use the unit rate", "instruction":"Substitute each time input into V(t)=1.8t and keep exact decimal outputs." },',
  '    { "title":"Graph your table", "instruction":"Treat each completed row as an ordered pair. Decide whether values between the listed times are meaningful before connecting the points." }',
  '  ] }',
  '}',
  '```',
  '',
  'Example — construct a graph:',
  '```json',
  '{',
  '  "standard": "A.3C",',
  '  "prompt": "Graph f(x) = 2x + 1 for x ≥ 0.",',
  '  "studentActions": ["constructGraph"],',
  '  "function": { "family": "linear", "m": 2, "b": 1, "domain": { "min": 0 } }',
  '}',
  '```',
  '',
  'Example — one connected contextual model:',
  '```json',
  '{',
  '  "standard": "A.3C",',
  '  "prompt": "Build a model for the situation from quantities through the graph.",',
  '  "scenario": "A refill station adds 5 liters of water per minute to an empty container.",',
  '  "studentActions": ["identifyQuantities","writeEquation","completeTable","constructGraph","stateDomain","stateRange","classifyContinuity"],',
  '  "quantities": [',
  '    { "id": "time", "label": "Time", "unit": "minutes" },',
  '    { "id": "water", "label": "Water", "unit": "liters" }',
  '  ],',
  '  "correctIndependentId": "time",',
  '  "correctDependentId": "water",',
  '  "answerModel": {',
  '    "equation": "W(t)=5t",',
  '    "tableXValues": [0,1,2,3,4],',
  '    "domain": "t>=0",',
  '    "range": "W>=0",',
  '    "continuity": "continuous"',
  '  }',
  '}',
  '```',
  '',
  'MathMaster carries the STUDENT\'S equation into the table and the STUDENT\'S completed table into the graph. Do not duplicate a hidden correct graph merely to make later stages work.',
  'When a reasonable domain or range is an infinite discrete set that is awkward to type (for example `{0,1,2,...}`), `answerModel` may also include `domainChoices` and/or `rangeChoices`. MathMaster will present those as student choice cards while preserving the domain/range stage.',
  '',
  'A non-context function task may also combine actions in one question. For example, `completeTable + constructGraph + stateRange + classifyContinuity` is one connected student workflow; keep all four actions and include the function/table data. MathMaster composes the table, graph, range response and classification automatically.',
  'For a graph the student READS, use `readGraph` plus the analysis actions. For a graph the student BUILDS, use `constructGraph`. Do not add `type: graphing` or `type: graphAnalysis` yourself.',
  '',
  '## Stable studentActions',
  '- Solving: `solveEquation`, `solveStepByStep`, `fractionAnswer`, `solveLiteral`, `solveSystem`.',
  '- Number lines: `chooseNumberLine`, `constructInterval`, `writeInterval`.',
  '- Graphs/functions: `readGraph`, `constructGraph`, `investigateFunction`, `analyzeDomain`, `analyzeRange`, `analyzeIncreasing`, `analyzeDecreasing`, `analyzeConstant`, `analyzePositive`, `analyzeNegative`, `findVertex`, `findXIntercepts`, `findYIntercept`, `findMaximum`, `findMinimum`.',
  '- Representations: `completeTable`, `stateOrderedPair`, `multipleResponses`, `buildMapping`, `plotRelation`, `classifyFunction`, `matchGraphsToStories`, `compareGraphs`, `writeGraphStory`, `interpretPointInContext`, `connectRepresentations`, `sortIntoOwnGroups`.',
  '- Context modeling: `identifyQuantities`, `configureAxes`, `writeEquation`, `stateDomain`, `stateRange`, `classifyContinuity`. Use `configureAxes` with `axisRequirements` when students must choose axis quantities/units or a reasonable count-by scale.',
  '- Open construction: `buildFunctionFromConstraints` lets students create ANY linear/quadratic/exponential/absolute/vertical-line relation satisfying authored characteristics; MathMaster grades the constraints instead of one hidden equation.',
  '- Sequences: `analyzeSequence`, `findSequenceTerm`, `findMissingTerm`, `writeRecursive`, `writeExplicit`, `compareSequences`, `partialSum`.',
  '- Specialist workspaces when the lesson genuinely needs them: `analyzeData`, `fitDataModel`, `predictFromModel`, `findInverse`, `composeFunctions`, `analyzeParabolaGeometry`, `factorPolynomial`, `dividePolynomial`, `multiplyPolynomials`, `solveInequality`, `complexOperations`, `analyzeComplex`, `solveExponential`, `solveLogarithmic`, `analyzeTransformations`, `constructLine`.',
  '',
  '## Mathematical data shapes',
  '- Function: `{ "family":"linear", "m":2, "b":1 }` or `{ "family":"quadratic", "a":1, "h":2, "k":-3 }`. Exponential/logarithmic may add `base`.',
  '- Relation: use Firestore-safe coordinate objects, e.g. `\"relation\": [{\"x\":-2,\"y\":3},{\"x\":1,\"y\":2},{\"x\":3,\"y\":-1}]`. Do not use arrays directly inside arrays.',
  '- Interval: `"intervals": [{"min":-3,"max":5,"minClosed":true,"maxClosed":false}]`; use null for infinity.',
  '- Table: include `columns` and `rows`; author each row as an object keyed by its column keys, not as a nested array. If the table is generated from a supplied function, `answers` may be omitted because MathMaster derives the blank-cell key from the function. If you do provide answers, MathMaster verifies/normalizes them rather than treating renderer shape as authoring responsibility. A read-only table omits `answers` and is normally paired with `multipleResponses`.',
  '- Graph analysis: provide the function and the analysis `studentActions`; do not hand-author internal `analysisRequests`. If the displayed function has a restricted domain, put that restriction inside `function.domain`.',
  '- Sequence: `{ "kind":"arithmetic", "first":7, "difference":4 }` or `{ "kind":"geometric", "first":3, "ratio":2 }`.',
  '- Graph/story matching: supply `stories`, `candidateGraphs`, and `matches`. A candidate graph may simply carry a `function` instead of hand-calculated viewport bounds.',
  '- Point interpretation: with `interpretPointInContext`, use `target: {"kind":"startingPoint","coordinates":[x,y]}`, a `quantities` object with `x` and `y` descriptors (`id`, `label`, `unit`), and `quantityChoices` as an array of `{id,label,unit}` choices when students must choose the quantity roles. Do not use a bare `point:[x,y]` plus an x/y options object; MathMaster needs the target and units to grade the interpretation faithfully.',
  '- Multipart response: use `responses`, each with `id`, `label`, and `answer`/`acceptedAnswers`; add `options` for finite choices.',
  '- Open sort: with `sortIntoOwnGroups`, provide `items` (each with a unique `id`; graph cards may include `graphSpec`; discrete graph points should be Firestore-safe `{x,y}` objects) and `validSchemes`. Each scheme has `groups`, and every group lists its `itemIds`. Supply more than one scheme when multiple classifications are mathematically valid. Group names and rationales are required by default; set `requireGroupNames:false` or `requireRationale:false` only when the source does not ask for them.',
  '- Static graph point rule: author plotted points as Firestore-safe `{"x":2,"y":5}` objects. `{"coordinates":[2,5]}` is also accepted for compatibility. Do NOT author `graph.points` as direct `[x,y]` arrays because that creates an array-inside-array shape Firestore cannot persist. MathMaster normalizes accepted point objects before rendering and rejects malformed points instead of silently drawing a blank graph.',
  '- Constraint builder: with `buildFunctionFromConstraints`, provide `allowedFamilies` and `constraints`. Supported constraint kinds include `family`, `continuity`, `behavior`, `extremum`, `isFunction`, `straightLine`, `passesThrough`, `vertex`, `xIntercept`, and `yIntercept`. For `passesThrough` or `vertex`, author Firestore-safe points as `{\"x\": 2, \"y\": 3}` rather than nested arrays. Do not provide one answer equation unless the lesson genuinely requires one unique equation.',
  '',
  '## Student-experience rules',
  '- Preserve source representation. If the source shows a graph, table, number line, mapping, or ordered pairs, the student must see that representation.',
  '- Preserve source verbs. If students are asked to write, complete, graph, classify, explain, and compare, do not silently delete actions because a simpler response box is easier.',
  '- Use finite choices for categories such as linear/quadratic/exponential, finite/infinite, discrete/continuous, and yes/no when the source does not require written explanation.',
  '- Prompts are plain text. Use Unicode math such as ≤, ≥, ∞, ×, π, √, ∪, ½. Ordinary currency such as $6 is fine.',
  '- For countable contexts, use discrete representations when discreteness matters. Do not invent negative elapsed time.',
  '- Do not reveal a requested sequence term in the starter terms.',
  '- Do not invent or replace a TEKS just to make validation pass.',
  '',
  '## Course TEKS',
  compactTeksSection(courseId),
  '',
  '## Output',
  'Return exactly one JSON object with `schemaVersion: 5`. MathMaster will compile V5 intent into its internal V4 tool contracts, auto-fit ordinary graph windows, normalize storage-safe shapes, and run student-experience validation before teacher Preflight. Do not output V4.',
].join('\n');

/**
 * The paste-back request for a failed import: the offending JSON, the exact
 * validator errors, and only the contract rules that bear on them.
 */
export const buildFixRequest = ({ rawJson = '', errors = [], warnings = [], sourceSchemaVersion = null } = {}) => {
  const errorList = (Array.isArray(errors) ? errors : [errors]).filter(Boolean);
  const warningList = (Array.isArray(warnings) ? warnings : [warnings]).filter(Boolean);
  const aiSafeWarnings = warningList.filter((warning) => !/(TEKS|alignment|mastery|standard)/i.test(String(warning)));
  const isV5 = Number(sourceSchemaVersion) === AUTHORING_INTENT_SCHEMA_VERSION
    || /"schemaVersion"\s*:\s*5\b/.test(String(rawJson || ''));

  if (isV5) {
    return [
      `# Fix this ${AUTHORING_INTENT_SCHEMA_NAME} JSON`,
      '',
      'MathMaster could not safely compile the authoring intent below. Fix only the mathematical/content omissions named in the errors.',
      'KEEP `schemaVersion: 5`. Do not convert this to V4. Do not add `type`, `toolId`, `functionSpec`, `analysisRequests`, renderer-specific `graph` plumbing, Firestore fields, or viewport bounds just to satisfy an internal message.',
      'Preserve every `studentActions` verb unless the error says the mathematical task itself is contradictory.',
      '',
      '## Validation errors that must be fixed',
      ...errorList.map((error, index) => `${index + 1}. ${error}`),
      ...(aiSafeWarnings.length ? ['', '## Safe warnings to clean up', ...aiSafeWarnings.map((w) => `- ${w}`)] : []),
      '',
      '## V5 repair rules',
      '- Return exactly one JSON object with `schemaVersion: 5`.',
      '- Keep the same assignment/activity structure and studentActions.',
      '- Supply mathematical data that is genuinely missing (for example a function, relation, interval, table data, scenario, or expected non-derivable response).',
      '- If a student reads a graph, provide `function` or graph/story mathematical data; MathMaster chooses the renderer.',
      '- If a student completes a table and then constructs a graph, keep both actions in the same question; MathMaster composes the dependency.',
      '- Do not change TEKS/standards merely to silence a warning.',
      '- Use Unicode math in student-facing text; ordinary currency such as $6 is fine.',
      '',
      '## The V5 JSON to fix',
      '```json',
      String(rawJson || '').trim(),
      '```',
    ].join('\n');
  }

  return [
    `# Fix this ${CONTRACT_SCHEMA_NAME} JSON`,
    '',
    'MathMaster rejected the JSON below. Fix **only** the problems listed, leave every',
    'other question and field exactly as it is, and return the complete corrected JSON',
    'object — one JSON object, nothing else, no markdown fence and no commentary.',
    '',
    '## Validation errors that must be fixed',
    ...errorList.map((error, index) => `${index + 1}. ${error}`),
    ...(aiSafeWarnings.length ? ['', '## Safe warnings to clean up', ...aiSafeWarnings.map((w) => `- ${w}`)] : []),
    '',
    '## Rules that apply',
    `- Schema version is ${CONTRACT_SCHEMA_VERSION}.`,
    `- Valid question types: ${SUPPORTED_QUESTION_TYPES.join(', ')}.`,
    `- Valid activity roles: ${Object.values(ACTIVITY_ROLES).join(', ')}.`,
    '- dok is an integer 1-4; difficultyBand is an integer 1-5.',
    `- alignments entries use framework ${ALIGNMENT_FRAMEWORK_IDS.join(' | ')}; TEKS uses "code", exams use "domainId".`,
    `- Valid alignment roles: ${ALIGNMENT_ROLES.join(', ')}.`,
    '- Generator ranges are inclusive [min, max] with min <= max.',
    `- Never emit platform-owned fields: ${PLATFORM_OWNED_FIELDS.join(', ')}.`,
    '- Do not add dates, class periods or Honors designations; the teacher sets those.',
    '- No LaTeX commands/delimiters in student-facing prompts, labels or context. Ordinary currency such as $6 is fine; write prompt math in Unicode (≤, ≥, ∞, ×, π, √, ∪, ½).',
    `- analysisRequests kinds: ${NOTATION_ANALYSIS_KINDS.join(', ')}, or "point" WITH a feature (${POINT_FEATURES.join(', ')}).`,
    '- "positive" and "negative" are kinds in their own right. Never rewrite them as "point".',
    '- Do not change TEKS/standards merely to silence a warning. MathMaster keeps alignment review in Preflight.',
    '',
    '## The JSON to fix',
    '```json',
    String(rawJson || '').trim(),
    '```',
  ].join('\n');
};
