import { CORE_QUESTION_TYPES, SUPPORTED_QUESTION_TYPES } from '../../assignmentBlueprint.js';
import { TOOL_CATALOG } from '../../tools/toolCatalog.js';
import { getToolCapabilities } from '../../tools/toolCapabilities.js';
import { ACTIVITY_POLICIES, ACTIVITY_ROLES } from '../policies/activityPolicies.js';
import { CALCULATOR_MODES } from '../policies/calculatorPolicy.js';
import { DOK_LEVELS, INSTRUCTIONAL_LEVELS } from '../../questionMetadata.js';
import { TEXAS_STANDARDS_BY_COURSE, TEXAS_MATH_ACTIVE_COURSES } from '../../texasStandards.js';
import { EXAM_DOMAIN_REGISTRY } from '../assessment/examDomainRegistry.js';
import { getSkillCrosswalk } from '../ccmr/assessmentCrosswalk.js';
import { QUESTION_TYPE_CATALOG, REPRESENTATIONS } from './questionTypeCatalog.js';
import { TYPES_THAT_RENDER_A_TABLE } from './semanticValidation.js';
import { AUTHORING_INTENT_V5_ACTIONS } from './authoringIntentV5.js';
import { ANALYSIS_NOTATIONS, NOTATION_ANALYSIS_KINDS, POINT_FEATURES } from '../../analysisRequestCatalog.js';
import {
  ALIGNMENT_FRAMEWORK_IDS,
  ALIGNMENT_ROLES,
  ASSESSMENT_FRAMEWORKS,
  EVIDENCE_LEVELS,
  EVIDENCE_MODES,
} from './alignments.js';

export const CONTRACT_SCHEMA_VERSION = 5;
export const CONTRACT_SCHEMA_NAME = 'MathMaster Assignment V5';

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
  rows.push(bullet('Use V5 `alignments` for standards. `masteryEvidenceKeys` is platform-owned and must not be authored by the AI.'));
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

const ccmrCrosswalkSection = () => {
  const lines = [
    line('Use this table only when you are deliberately authoring an exam-style item.'),
    line('An omitted framework means do not claim that assessment for that TEKS. A partial'),
    line('mapping means the TEKS is broader than the assessment; keep the item inside the'),
    line('overlapping aspect instead of testing an excluded part.'),
    '',
  ];
  TEXAS_MATH_ACTIVE_COURSES.forEach((course) => {
    const standards = TEXAS_STANDARDS_BY_COURSE[course.id] || [];
    lines.push(line(`### ${course.label || course.id}`));
    standards.forEach((standard) => {
      const connections = Object.values(getSkillCrosswalk(standard.code).frameworks || {});
      if (!connections.length) return;
      const rendered = connections.map((entry) => (
        `${entry.framework}:${entry.domainId}${entry.coverage === 'partial' ? ' [partial]' : ''}`
      )).join('; ');
      lines.push(bullet(`${standard.code} — ${rendered}`));
      connections.filter((entry) => entry.coverage === 'partial' && entry.allowedAspects?.length).forEach((entry) => {
        lines.push(`  - ${entry.framework} overlap only: ${entry.allowedAspects.join('; ')}`);
      });
    });
    lines.push('');
  });
  return section('TEKS → CCMR exam-style authoring crosswalk', lines);
};

const compactCcmrCrosswalkSection = (courseId = null) => {
  const requestedCourse = ['algebra1', 'algebra2'].includes(String(courseId || '')) ? String(courseId) : null;
  const lines = [];
  TEXAS_MATH_ACTIVE_COURSES
    .filter((course) => ['algebra1', 'algebra2'].includes(course.id))
    .filter((course) => !requestedCourse || course.id === requestedCourse)
    .forEach((course) => {
      lines.push(`### ${course.label || course.id}`);
      (TEXAS_STANDARDS_BY_COURSE[course.id] || []).forEach((standard) => {
        const connections = Object.values(getSkillCrosswalk(standard.code).frameworks || {});
        if (!connections.length) return;
        const rendered = connections.map((entry) => `${entry.framework}:${entry.domainId}${entry.coverage === 'partial' ? ' [partial]' : ''}`).join('; ');
        lines.push(`- ${standard.code} — ${rendered}`);
        connections.filter((entry) => entry.coverage === 'partial' && entry.allowedAspects?.length).forEach((entry) => {
          lines.push(`  - ${entry.framework} overlap only: ${entry.allowedAspects.join('; ')}`);
        });
      });
      lines.push('');
    });
  return lines.join('\n');
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


const instructionalScopeSection = () => section('Instructional scope and lesson depth', [
  line('**A familiar word does not authorize a later-course or later-unit skill.**'),
  '',
  line('Match not only the topic, but the depth at which the supplied lesson teaches it.'),
  bullet('Exposure: students see/hear the idea or vocabulary.'),
  bullet('Recognition/classification: students identify the feature on a graph or sort examples by it.'),
  bullet('Analysis: students calculate or state exact values/intervals associated with the feature.'),
  bullet('Construction: students create an equation/model from the feature.'),
  '',
  line('Never jump upward in that sequence unless the source lesson explicitly does so.'),
  line('Example: a lesson may introduce "absolute maximum/minimum" so students can sort quadratic graphs by that characteristic. That does NOT automatically authorize finding the exact maximum value, solving for a vertex, or constructing an equation from a prescribed extremum.'),
  line('Likewise, a lesson may discuss a graph as increasing/decreasing without authorizing formal increasing/decreasing intervals in interval notation.'),
  '',
  bullet('Scaffolding may reach DOWN to prerequisite skills already taught in earlier grades/courses.'),
  bullet('Scaffolding must never reach UP into a later course/unit merely because MathMaster has a tool capable of it.'),
  bullet('For Algebra I, do not require formal increasing/decreasing/positive/negative intervals in interval notation unless MathMaster has an explicit later-course/extension authorization.'),
  bullet('For Algebra I domain/range, preserve the representation used by the source lesson; do not silently upgrade inequalities/sets/verbal descriptions into interval notation.'),
  bullet('If the source only asks students to recognize a family characteristic, use comparison/classification controls rather than `findMaximum`, `findMinimum`, or an equation-construction task.'),
  '',
  line('MathMaster Preflight contains a lesson-depth guard for curated curriculum lessons. If it rejects a question as beyond the current lesson depth, rewrite the question at the source lesson\'s level rather than deleting the guardrail.'),
]);

const sectionBalanceRigorSection = () => section('Classwork versus Practice balance and rigor', [
  line('**Classwork and Practice are not two labels for interchangeable questions.**'),
  '',
  bullet('Classwork: fewer, richer teaching problems. Use the strongest multi-representation and exploratory interactions here, with meaningful Guided Notes when appropriate.'),
  bullet('Practice: broader independent application of the SAME lesson objectives at comparable cognitive rigor, with substantially less scaffolding.'),
  bullet('DOL: a short independent sample of the essential objectives, not a second full Practice set.'),
  '',
  line('For a typical two-lesson bundle, aim for about 6–8 substantial Classwork questions and 8–12 Practice questions. This is a target, not a rigid quota; one long composed workflow can count for more instructional work than one short response item.'),
  line('Practice should normally be at least as broad as Classwork. If Classwork has many more questions/opportunities than Practice, rebalance by keeping the best teaching examples in Classwork and moving or rewriting additional applications into Practice.'),
  '',
  bullet('Coverage parity: every major standard/objective taught in Classwork should normally reappear independently in Practice.'),
  bullet('Rigor floor: Practice may remove support, but it must not quietly turn DOK 2–3 Classwork into mostly DOK 1 recognition.'),
  bullet('Interaction parity: if Classwork uses graphs, mappings, tables, modeling, sorting, or representation matching, Practice should retain a meaningful share of those experiences instead of collapsing to mostly simple multiple-response questions.'),
  bullet('Scaffolding reduction: Guided Notes belong primarily in Classwork. Practice should usually run without authored Guided Notes and with fewer hints.'),
  bullet('Transfer variety: Practice should use new numbers, contexts, or representations while assessing the same lesson objective; do not merely copy Classwork verbatim.'),
  bullet('Instructional ceiling still wins: never add later-unit/later-course mathematics merely to make Practice look harder.'),
  '',
  line('MathMaster Preflight reports Section Balance & Rigor warnings. They are advisory and teacher-overridable; curriculum instructional-scope violations remain separate hard guardrails.'),
]);

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
  bullet('When the lesson objective is graphical behavior, the student must actually see the graph. Do not replace graph reading with equation-to-graph inference unless that representation transfer has already been taught in the lesson.'),
  bullet('For V5 questions, use `assessedConstruct: "graphicalBehavior"` when behavior/shape is the target. MathMaster can then enforce that a visible `graph` or `function` is supplied for lessons whose representation scope requires graph reading.'),
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
const compactTeksSection = (courseId = null) => {
  const requested = String(courseId || '').trim();
  const courses = requested
    ? TEXAS_MATH_ACTIVE_COURSES.filter((course) => course.id === requested)
    : TEXAS_MATH_ACTIVE_COURSES;
  return courses.flatMap((course) => {
    const lines = [`### ${course.label || course.id}`];
    (TEXAS_STANDARDS_BY_COURSE[course.id] || []).forEach((standard) => {
      lines.push(`- ${standard.code} — ${standard.description}`);
    });
    lines.push('');
    return lines;
  }).join('\n');
};

export const buildAdvancedAuthoringContract = (options = {}) => buildAuthoringContract({
  ...options,
  includeAdvancedNotes: true,
});

export const AUTHORING_INTENT_SCHEMA_VERSION = 5;
export const AUTHORING_INTENT_SCHEMA_NAME = 'MathMaster Assignment V5';

/**
 * Canonical teacher-facing Assignment V5 contract. Outside AIs author
 * mathematical intent; MathMaster chooses renderer implementation details.
 */
export const buildAuthoringContract = ({ generatedAt = new Date(), courseId = null } = {}) => [
  `# ${AUTHORING_INTENT_SCHEMA_NAME}`,
  `Generated from MathMaster on ${generatedAt.toISOString().slice(0, 10)}.`,
  '',
  'Return exactly one JSON object with schemaVersion 5 and nothing else.',
  'MathMaster V5 is the assignment contract and persistence source of truth.',
  'Describe the mathematics, representations, standards, and what the student must DO. MathMaster chooses internal React renderers and storage plumbing.',
  '',
  '## Required assignment shape',
  '```json',
  '{',
  '  "schemaVersion": 5,',
  '  "assignment": {',
  '    "title": "Descriptive title",',
  `    "courseId": "${courseId || 'algebra1'}",`,
  '    "folder": "Algebra I/Module 1/Functions",',
  '    "instructionalPurpose": "lesson",',
  '    "gradingPurpose": "classwork"',
  '  },',
  '  "variantPolicy": {',
  '    "mode": "personalized",',
  '    "sectionModes": { "warmup": "shared", "classwork": "shared", "practice": "personalized", "dol": "shared" }',
  '  },',
  '  "differentiationPolicy": { "mode": "bounded", "allowStandardChange": false, "preserveAssessmentFidelity": true },',
  '  "supportPolicy": { "mode": "inheritStudentProfile", "modificationsAllowed": false },',
  '  "toolPolicy": { "calculator": "inherit", "keyboard": "auto" },',
  '  "deliveryPolicy": { "sectionGating": "rolePolicy" },',
  '  "gradingPolicy": { "attemptPolicy": "rolePolicy", "scoring": "platformDefault" },',
  '  "evidencePolicy": { "gradeEligible": true, "masteryEligible": true, "recommendationEligible": true, "analyticsEligible": true },',
  '  "outputProfiles": {',
  '    "digital": { "enabled": true },',
  '    "studentWorksheetPdf": { "enabled": true, "includeWorkspace": true },',
  '    "teacherWorksheetPdf": { "enabled": true, "includeAnswers": true, "includeSolutions": true, "includeWorkspace": true },',
  '    "answerKeyPdf": { "enabled": true, "includeAnswers": true, "includeWorkspace": false },',
  '    "lessonNotesPdf": { "enabled": true, "targetPages": 2, "sections": [] }',
  '  },',
  '  "classroomIntegration": { "enabled": true },',
  '  "provenance": { "contentRelease": null, "templateVersion": null, "generatorVersion": null, "graderVersion": null },',
  '  "preflight": { "required": true },',
  '  "sections": [',
  '    { "role": "warmup", "title": "Warm-Up", "questions": [] },',
  '    { "role": "classwork", "title": "Classwork", "questions": [] },',
  '    { "role": "practice", "title": "Practice", "questions": [] },',
  '    { "role": "dol", "title": "DOL", "questions": [] }',
  '  ]',
  '}',
  '```',
  '',
  '## Section rules',
  '- Valid roles: warmup, classwork, practice, dol, quiz, test.',
  '- Use sections, never top-level questions or activities.',
  '- Warm-Up/Classwork/DOL may be shared while Practice is personalized or adaptive.',
  '- DOK and difficulty are separate: dok is 1–4 cognitive complexity; difficultyBand is 1–5 instructional difficulty.',
  '',
  '## Question authoring',
  '- Every question needs a student-facing prompt, a primary standard/alignment, and studentActions.',
  '- Do NOT author type, toolId, functionSpec, analysisRequests, viewport bounds, Firestore fields, attempts, mastery weights, readiness, or other runtime plumbing.',
  '- Preserve source representation fidelity: graph tasks show graphs, table tasks show tables, mapping tasks use mappings, number-line tasks use number lines.',
  '- Reference information is not a hint or an answer key. Omit `referenceInfo` when the prompt already contains the givens the student needs.',
  '- Use `referenceInfo` only for source facts or data the student must repeatedly consult while working. Never place a student conclusion in `referenceInfo`: independent/dependent roles, the equation/model, domain, range, continuity, axis labels, scale, transformed values, table outputs, intercepts, extrema, or another answer the student is being asked to determine.',
  '- If the source explicitly gives one of those facts and the question assesses something else, it may remain visible as a given. Otherwise the student must do that thinking in the workspace.',
  '- Generated expected answers must be derived from the same generator parameters as the prompt.',
  '- Do not pad accepted answers with equivalent formatting variants already handled by MathMaster equivalence grading.',
  '- Treat the generated answer/expected value as the canonical mathematical key. If acceptedAnswers/accepted is present, it must contain only genuinely different correct answers and must remain mathematically consistent with the canonical key.',
  '- Do not use gradingMode unless the task truly needs it. equivalentExpression is for expressions only; never use it for equations or when the prompt requires a specific form such as factored form, vertex form, standard form, slope-intercept form, or simplest radical form.',
  '- Generic answerFields/responseFields are auto-graded and therefore require a grading key. Teacher-reviewed explanations must use the platform\'s composed/teacher-review interaction rather than an unkeyed generic field.',
  '- If a response requires justification, comparison, or explanation, author the response part explicitly; do not collapse it to one numeric field.',
  '- Finite-choice questions should normally provide at least four meaningful options. Do not author a two-choice guessing shortcut for a three-attempt question; for binary concepts, use combined/neither or rationale-based distractors when mathematically appropriate.',
  '- Do not rely on authored option order to communicate meaning or correctness. MathMaster keeps a stable shuffled order during a question attempt so the first authored option is not automatically displayed first.',
  '- For Algebra I domain/range tasks, prefer inequality notation (for example 0 ≤ x ≤ 4 or y ≥ 0). Do not introduce interval notation unless the source or teacher explicitly requests it; interval notation is normally deferred until Algebra II in this course sequence.',
  '- If a multiple-choice task asks students to choose among graphs, preserve every candidate graph as a visible graph card. Never reduce A/B/C graph choices to text labels with no graphs.',
  '- For authored responseFields, use the semantic inputProfile that matches the answer: choice, text, number, expression, equation, interval, inequality, set, or orderedPair.',
  '- Never use inputProfile "text" merely because the answer will be typed. Mathematical responses belong in MathInput; plain text is for genuine word/phrase responses.',
  '- MathMaster infers answerFormat and required mobile keys from the expected response (parentheses, commas, variables, fractions, roots, exponents, interval/set symbols, inequalities). Do not micromanage keypad layout.',
  '- requiredSymbols is only for an unusual symbol the expected response cannot reveal on its own. Preflight blocks any response whose required notation cannot be guaranteed on the controlled mobile keypad.',
  '',
  '## Common studentActions',
  AUTHORING_INTENT_V5_ACTIONS.join(', '),
  '',
  '## Supports and adaptive differentiation',
  '- Never embed a studentId, IEP/504/EB profile, accommodation list, modification, or student-specific support setting in Assignment V5 or in a question. supportPolicy must inherit entitlements from the server-side student profile resolver.',
  '- Standard Assignment V5 content keeps supportPolicy.modificationsAllowed false. A curriculum modification changes WHAT is taught and belongs in the separate modified-curriculum evidence/reporting path; accommodations only change access.',
  '- Adaptive band profiles may vary numbers, context, scaffolding, generator parameters, and bounded rigor. They may not change the assigned standard/alignment, question/tool identity, assessed construct, section role, calculator policy, support policy, or assessmentContext.',
  '- If a band profile declares difficultyBand/generatorBand, it must match the profile key. Only author band profiles that sit inside the role-appropriate live adaptation envelope around the assigned difficulty/DOK.',
  '- DOL, quiz, and test rigor is comparable by default and is not silently levelled per student. Differentiated assessment requires an explicit teacher decision outside normal authoring.',
  '- Honors status is inherited from the destination class. Do not author honors/isHonors/courseLevel or a forced Honors mode into questions or student records.',
  '',
  '## Honors + CCMR Practice',
  '- Do not author honors/isHonors/courseLevel. Honors placement comes from the destination class.',
  '- For Honors, deepen reasoning, representation, modeling, justification, and transfer while preserving the assigned course TEKS and lesson ceiling.',
  '- In a full Honors assignment with independent Practice, aim for about 15% authentic exam-style CCMR Practice over the recent sequence: normally 1 item in a 5–8 question Practice section or 1–2 in a 9–12 question Practice section.',
  '- Warm-Ups/DOLs with three or fewer questions are exempt from the CCMR-share expectation.',
  '- Do not turn every Honors question into test prep; the exam-style item is a deliberate transfer check.',
  '',
  '## CCMR / assessment fidelity',
  '- Use assessmentContext only for genuine exam-style content.',
  '- A direct CCMR item must carry both TEKS alignment and the matching digitalSAT/ACT/TSIA2/ASVAB domain alignment.',
  '- Preserve authentic vocabulary/register, task structure, representation, and distractor style for the named assessment.',
  '- A TEKS label does not by itself authorize an assessment-domain claim; use the approved crosswalk and stay inside any partial-overlap limits.',
  compactCcmrCrosswalkSection(courseId),
  '',
  '## PDF / printable output',
  '- Digital and printable assignments use the same resolved questions. Never author a second PDF question set.',
  '- studentWorksheetPdf, teacherWorksheetPdf, and answerKeyPdf are supported from the same resolved questions. Teacher/key output must never be authored as a separate question bank.',
  '- lessonNotesPdf is for the separate 1–2 page notes/resource handout.',
  '- Printable worksheets preserve the same mathematical representation as digital delivery. Do not replace a graph, table, number line, or mapping task with prose merely to make it printable.',
  '- Do not author a second PDF-only copy of a question or a solved visual for the student worksheet. MathMaster derives printable givens and construction workspace from the resolved question and reveals solved visuals only in teacher/key output.',
  '- Keep printable tables to at most 8 columns and 18 rows per question, and graph-choice sets to at most 6 choices. Split a larger task into coherent questions instead of forcing unreadable scaling.',
  '- Keep long scenarios/solutions concise enough to fit with their required visual. Preflight blocks a question that cannot fit on one portrait worksheet page without clipping.',
  '',
  '## Course TEKS',
  compactTeksSection(courseId),
  '',
  '## Output',
  'Return exactly one MathMaster Assignment V5 JSON object. Older assignment formats and raw question arrays are unsupported.',
].join('\n');

export const buildFixRequest = ({ rawJson = '', errors = [], warnings = [] } = {}) => {
  const errorList = (Array.isArray(errors) ? errors : [errors]).filter(Boolean);
  const warningList = (Array.isArray(warnings) ? warnings : [warnings]).filter(Boolean);
  const aiSafeWarnings = warningList.filter((warning) => !/(TEKS|alignment|mastery|standard)/i.test(String(warning)));

  return [
    `# Fix this ${AUTHORING_INTENT_SCHEMA_NAME} JSON`,
    '',
    'MathMaster accepts Assignment V5 only. Fix only the mathematical/content omissions named below.',
    'KEEP schemaVersion 5 and sections[]. Do not add renderer plumbing or older assignment formats.',
    'Do not add type, toolId, functionSpec, analysisRequests, viewport bounds, Firestore fields, or platform-owned state.',
    'Preserve studentActions unless the task itself is contradictory.',
    '',
    '## Validation errors that must be fixed',
    ...errorList.map((error, index) => `${index + 1}. ${error}`),
    ...(aiSafeWarnings.length ? ['', '## Safe warnings to clean up', ...aiSafeWarnings.map((warning) => `- ${warning}`)] : []),
    '',
    '## V5 repair rules',
    '- Return exactly one JSON object with schemaVersion 5.',
    '- Keep the same assignment, sections, alignments, assessmentContext, and studentActions unless an error specifically requires a mathematical correction.',
    '- Supply missing mathematical data such as a function, relation, intervals, table data, scenario, or non-derivable expected response.',
    '- If an interaction-contract error is listed, correct the semantic inputProfile/answerFormat or the mathematical response itself. Do not invent a custom keyboard or renderer.',
    '- Do not change TEKS merely to silence a warning; alignment review belongs in Preflight.',
    '- Use Unicode math in student-facing text.',
    '',
    '## The V5 JSON to fix',
    '```json',
    String(rawJson || '').trim(),
    '```',
  ].join('\n');
};
