import { CORE_QUESTION_TYPES, SUPPORTED_QUESTION_TYPES } from '../../assignmentBlueprint.js';
import { TOOL_CATALOG } from '../../tools/toolCatalog.js';
import { getToolCapabilities } from '../../tools/toolCapabilities.js';
import { ACTIVITY_POLICIES, ACTIVITY_ROLES } from '../policies/activityPolicies.js';
import { CALCULATOR_MODES } from '../policies/calculatorPolicy.js';
import { DOK_LEVELS, INSTRUCTIONAL_LEVELS } from '../../questionMetadata.js';
import { TEXAS_STANDARDS_BY_COURSE, TEXAS_MATH_ACTIVE_COURSES } from '../../texasStandards.js';
import { EXAM_DOMAIN_REGISTRY } from '../assessment/examDomainRegistry.js';
import { QUESTION_TYPE_CATALOG, REPRESENTATIONS } from './questionTypeCatalog.js';
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
    if (entry.doNotUseWhen?.length) {
      lines.push(line('**Do not use when:**'));
      entry.doNotUseWhen.forEach((useCase) => lines.push(bullet(useCase)));
    }
    const required = (entry.required || []).map((requirement) => requirement.path);
    lines.push(line(`**Required fields:** ${required.length ? required.map((field) => `\`${field}\``).join(', ') : '`type`, `prompt`'}`));
    if (entry.optional?.length) {
      lines.push(line(`**Optional fields:** ${entry.optional.map((field) => `\`${field}\``).join(', ')}`));
    }
    lines.push(line('**Example:**'));
    lines.push('```json');
    lines.push(JSON.stringify(entry.example, null, 2));
    lines.push('```');
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
export const buildAuthoringContract = ({ generatedAt = new Date() } = {}) => {
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

  parts.push(section('Question and tool types', [
    line('Core types:'),
    ...CORE_QUESTION_TYPES.map((type) => bullet(type)),
    '',
    line(`All ${SUPPORTED_QUESTION_TYPES.length} accepted values for "type" are listed here and in the tool section below.`),
  ]));

  parts.push(fidelitySection());
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
    line('**The rule that catches most authors:** when `assignment.variantMode` is'),
    line('"personalized" (the default), *every* question must be able to vary — give it a'),
    line('`generator`, or supply two or more `variants`. A question with only fixed literal'),
    line('values is rejected in personalized mode with "Question N is fixed".'),
    '',
    line('If a question genuinely must be identical for every student — a specific graph to'),
    line('read, a named real-world data set — then set `assignment.variantMode` to "shared"'),
    line('for the whole assignment and use literal values throughout.'),
    '',
    line('**Interactive tool questions are always fixed.** Every tool listed under'),
    line('"Interactive tool types" needs literal values (a specific line, system, sequence'),
    line('or data set) to render at all, so an assignment that uses any of them must set'),
    line('`"variantMode": "shared"`. Only the plain types — algebra, fraction, numberLine'),
    line('and anything you give a `generator` — can be personalized.'),
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
    bullet('Every question needs a type, a prompt and a primary alignment.'),
    bullet('If you are unsure whether a field exists, leave it out rather than inventing it.'),
  ]));

  return parts.join('\n');
};

/**
 * The paste-back request for a failed import: the offending JSON, the exact
 * validator errors, and only the contract rules that bear on them.
 */
export const buildFixRequest = ({ rawJson = '', errors = [], warnings = [] } = {}) => {
  const errorList = (Array.isArray(errors) ? errors : [errors]).filter(Boolean);
  const warningList = (Array.isArray(warnings) ? warnings : [warnings]).filter(Boolean);

  return [
    `# Fix this ${CONTRACT_SCHEMA_NAME} JSON`,
    '',
    'MathMaster rejected the JSON below. Fix **only** the problems listed, leave every',
    'other question and field exactly as it is, and return the complete corrected JSON',
    'object — one JSON object, nothing else, no markdown fence and no commentary.',
    '',
    '## Validation errors that must be fixed',
    ...errorList.map((error, index) => `${index + 1}. ${error}`),
    ...(warningList.length ? ['', '## Warnings (fix if straightforward)', ...warningList.map((w) => `- ${w}`)] : []),
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
    '',
    '## The JSON to fix',
    '```json',
    String(rawJson || '').trim(),
    '```',
  ].join('\n');
};
