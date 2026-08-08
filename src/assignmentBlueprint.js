import { isPersonalizedBlueprint } from './problemGenerator.js';
import { normalizeQuestionStandards } from './questionMetadata.js';
import { getTexasStandard } from './texasStandards.js';
// Capabilities rather than the component registry on purpose: this module is
// imported by Node-side tests and tooling, and toolRegistry pulls in every
// tool's React component.
import { TOOL_CAPABILITIES } from './tools/toolCapabilities.js';

export const DEFAULT_ASSIGNMENT_BLUEPRINT = `[
  {
    "type": "stepAlgebra",
    "prompt": "Solve the equation by keeping both sides balanced.",
    "mode": "rigorous",
    "objective": { "kind": "isolate", "variable": "x", "simplifyRequired": true },
    "generator": {
      "kind": "stepLinearEquation",
      "solutionRange": [-9, 9],
      "coefficientRange": [2, 9],
      "constantRange": [-12, 12]
    }
  },
  {
    "type": "literal",
    "prompt": "Solve the literal equation for the indicated variable.",
    "generator": {
      "kind": "literalLinear",
      "coefficientRange": [2, 12],
      "constantRange": [-15, 15]
    }
  },
  {
    "type": "system",
    "prompt": "Solve the system. Enter the solution as an ordered pair.",
    "showEquations": true,
    "showGraph": true,
    "generator": {
      "kind": "linearSystem",
      "xRange": [-10, 10],
      "yRange": [-10, 10]
    }
  },
  {
    "type": "table",
    "prompt": "Complete the missing values in the function table.",
    "showRule": true,
    "generator": {
      "kind": "functionTable",
      "ruleType": "linear",
      "rowCount": 5,
      "blankCount": 3,
      "slopeRange": [-6, 6],
      "interceptRange": [-12, 12]
    }
  },
  {
    "type": "orderedPair",
    "prompt": "Write the coordinates of the plotted point as an ordered pair.",
    "generator": {
      "kind": "orderedPair",
      "xRange": [-99, 99],
      "yRange": [-99, 99],
      "windowRadius": 6
    }
  },
  {
    "type": "multiAnswer",
    "prompt": "For the line shown, enter both requested values.",
    "generator": {
      "kind": "lineFeatures",
      "slopeRange": [-99, 99],
      "interceptRange": [-99, 99]
    }
  },
  {
    "type": "functionInvestigation",
    "prompt": "Choose x-values, construct the graph, show end behavior, and complete the requested analysis.",
    "showEquation": true,
    "showCoordinates": true,
    "studentChoosesX": true,
    "includeUndefinedChecks": true,
    "requireEndpointMarkers": true,
    "analysisRequests": [
      { "id": "roots", "kind": "point", "feature": "xIntercepts", "responseMode": "both", "allowNone": true, "label": "X-intercepts" },
      { "id": "domain", "kind": "domain", "notation": "interval", "label": "Domain" },
      { "id": "range", "kind": "range", "notation": "inequality", "label": "Range" },
      { "id": "increasing", "kind": "increasing", "notation": "interval", "label": "Increasing interval(s)" }
    ],
    "generator": {
      "kind": "parentFunctionGraph",
      "functionTypes": ["absolute", "quadratic", "squareRoot", "cubic", "cubeRoot", "logarithmic", "exponential", "rational"],
      "coefficientChoices": [-2, -1, 1, 2],
      "hRange": [-3, 3],
      "kRange": [-3, 3],
      "baseChoices": [2]
    }
  }
]`;

export const MATH_BLUEPRINT_GUIDE = `ASSIGNMENT PACKAGE V2 — RECOMMENDED

A complete assignment can now be created from one JSON object. Manual form fields are optional when the package provides them.

{
  "schemaVersion": 2,
  "assignment": {
    "title": "Algebra I M1 T1 L1 - Activity 1.1",
    "folder": "Algebra I/Module 1/Topic 1/Lesson 1",
    "template": "guided-notes",
    "assignmentType": "notesClasswork",
    "variantMode": "shared",
    "classes": ["Period 1", "Period 3", "Period 6"],
    "releaseAt": "2026-08-17T08:00:00-05:00",
    "dueAt": "2026-08-17T16:00:00-05:00",
    "lateDueAt": "2026-08-19T23:59:00-05:00",
    "standards": ["A.1A", "A.1C"],
    "curriculum": { "provider": "Bluebonnet", "course": "Algebra I", "module": 1, "topic": 1, "lesson": 1 }
  },
  "questions": [ ... ]
}

Supported templates: "practice", "practice-with-dol", and "guided-notes".
Use "P1" through "P8", numbers 1 through 8, or "Period 1" through "Period 8" in classes.
If variantMode is omitted, MathMaster automatically chooses Shared for fixed lesson questions and Personalized for generated/variant questions.
If folder is supplied, MathMaster creates the folder path automatically.
Legacy question-array JSON still works; manual title and dates remain available as fallbacks.

TEXAS STANDARDS + DIFFICULTY METADATA

Every question may carry the following optional metadata. JSON is the source of truth; the Assignment Question Editor can write the same fields without hand-editing JSON.

{
  "standards": {
    "primary": [{ "code": "A.2A", "level": "assessed" }],
    "secondary": [{ "code": "A.1D", "level": "practiced" }],
    "prerequisite": []
  },
  "complexity": { "framework": "DOK", "level": 2 },
  "difficulty": { "instructionalLevel": "gradeLevel", "generatorBand": 3 },
  "purpose": "independentPractice",
  "evidenceWeight": 0.75,
  "differentiation": { "mode": "recommend" }
}

TEKS evidence levels: introduced, practiced, assessed, masteryEvidence.
DOK levels: 1 through 4. DOK measures cognitive complexity; it is not the same as instructional difficulty.
Generator bands: 1 Prerequisite, 2 Developing, 3 Grade Level, 4 Advanced, 5 Extension.
Differentiation modes: off, recommend, auto. Auto changes content only when the question includes difficulty-tagged variants or authored differentiation.bandProfiles. Students with insufficient evidence default to Grade Level (Band 3).

TEXAS COURSE + VERTICAL TEKS

Algebra I and Algebra II registries are loaded. Course ID is inferred from the TEKS code, so this is valid:

{
  "standards": {
    "primary": [{ "code": "A2.4F", "level": "assessed" }],
    "secondary": [{ "code": "A2.1D", "level": "practiced" }],
    "prerequisite": [{ "code": "A.8A", "level": "prerequisite" }]
  }
}

The grade-level/course target remains in standards.primary. Earlier-course standards belong in standards.prerequisite. MathMaster can recommend prior-course TEKS from the pathway registry when evidence shows a student needs support; it does not silently replace the current-course target.

Example auto-differentiation profiles:

{
  "differentiation": {
    "mode": "auto",
    "bandProfiles": {
      "2": { "generator": { "coefficientRange": [1, 4] } },
      "3": { "generator": { "coefficientRange": [2, 9] } },
      "4": { "generator": { "coefficientRange": [-12, 12] } }
    }
  }
}

PERSONALIZED QUESTIONS WITHOUT DATABASE BLOAT

The database stores only one compact blueprint. The browser uses the assignment ID,
student ID, and question number as a stable seed. Each student receives a stable
variant at the same difficulty, and refreshing the page does not change it.

Every new question must use either a generator or at least two variants.

SHARED ATTEMPT POLICY

Attempt rules are not repeated inside each question module. Every question uses the
same shared policy: three attempts on the current generated problem. After the third
miss, that problem expires and the student may request a new problem at the same
difficulty. The assignment allows unlimited replacement problems until the due date.
After the due date, the same workflow continues in Practice Mode without grade changes.

SUPPORTED PERSONALIZED GENERATORS

Step-by-step balance algebra:
"type": "stepAlgebra",
"mode": "rigorous",
"objective": { "kind": "isolate", "variable": "x", "simplifyRequired": true },
"generator": {
  "kind": "stepLinearEquation",
  "solutionRange": [-9, 9],
  "coefficientRange": [2, 9],
  "constantRange": [-12, 12]
}

Use "mode": "exploratory" to allow balanced but unproductive moves without using
an attempt. Rigorous mode rejects unproductive moves, shakes the workspace, and uses
one of the question's three attempts. Operations appear on both sides immediately.
Students draw a strike-through line over the inverse pair, see a brief cancellation
animation, and then the other side simplifies. The AST state and compact stepGrades
array are stored in the shared question record, not inside a separate module schema.

Literal and slope-intercept balance questions use the same engine. Set:
"objective": { "kind": "isolate", "variable": "h", "simplifyRequired": true }
or:
"objective": { "kind": "slopeIntercept", "variable": "y", "simplifyRequired": true }

Literal equation:
"type": "literal",
"generator": { "kind": "literalLinear", "coefficientRange": [2, 12], "constantRange": [-15, 15] }

System of equations with a graph and ordered-pair answer:
"type": "system",
"showEquations": true,
"showGraph": true,
"generator": { "kind": "linearSystem", "xRange": [-10, 10], "yRange": [-10, 10] }

Function table with multiple blanks:
"type": "table",
"showRule": true,
"generator": { "kind": "functionTable", "ruleType": "linear", "rowCount": 5, "blankCount": 3 }

Ordered pair from a graph:
"type": "orderedPair",
"generator": { "kind": "orderedPair", "xRange": [-12, 12], "yRange": [-12, 12] }

Line graph:
"type": "graphing",
"showEquation": false,
"showGraph": true,
"generator": { "kind": "lineGraph", "slopeChoices": [-3, -2, -1, 1, 2, 3], "interceptRange": [-8, 8] }

Multiple-answer line features:
"type": "multiAnswer",
"generator": { "kind": "lineFeatures", "slopeRange": [-99, 99], "interceptRange": [-99, 99] }

Unified function investigation tool:
"type": "functionInvestigation",
"showEquation": true,
"generator": {
  "kind": "parentFunctionGraph",
  "functionTypes": ["absolute", "quadratic", "squareRoot", "cubic", "cubeRoot", "logarithmic", "exponential", "rational"],
  "coefficientChoices": [-2, -1, 1, 2],
  "hRange": [-3, 3],
  "kRange": [-3, 3],
  "baseChoices": [2]
}

The shared interactive graph shell auto-scales around the generated key point and outer
points. Students drag or select five point cards, and square-root/logarithmic questions
may include a Not Real / Undefined card. Set "showCoordinates": false to hide the live
cursor coordinates. After point validation, students freehand the curve; a correct
trace snaps to the exact mathematical path. Clearly marked graph ends then accept Arrow, Open Circle, or Closed Circle responses. Each marker location and each marker type is graded separately, so students may submit an incomplete-quality end-behavior response for partial credit.

Backward-compatible pre-drawn graph analysis (the same shared tool):
"type": "graphAnalysis",
"showEquation": false,
"showCoordinates": false,
"generator": {
  "kind": "graphFeatureAnalysis",
  "featureChoices": ["vertex", "localMaximum", "localMinimum", "xIntercepts", "yIntercept"]
}

The recommended new format is "functionInvestigation", which combines point selection, graph construction, end behavior, and analysis in one sequential tool. The older "graphAnalysis" type remains available for existing assignments.

MULTIPLE ANSWERS IN ONE QUESTION

Use type "multiAnswer" and list each required field:
"answerFields": [
  { "id": "m", "label": "Slope", "acceptedAnswers": ["2"] },
  { "id": "b", "label": "Y-intercept", "acceptedAnswers": ["-3"] }
]

For personalized multi-answer questions, place complete field sets inside "variants".

FORMATTED MATH

Wrap inline prompt math in dollar signs:
"prompt": "Simplify $sqrt(x^2 + 9)$ and evaluate $log_2(x)$."

ASCII math renders automatically:
"formula": "A = 1/2 b h"

Exact LaTeX requires doubled JSON backslashes:
"formulaLatex": "\\\\frac{-b \\\\pm \\\\sqrt{b^2-4ac}}{2a}"

GRAPH OBJECTS

A graph may contain multiple functions, so systems graph naturally:
"graph": {
  "functions": [
    { "type": "line", "m": 2, "b": 1 },
    { "type": "line", "m": -1, "b": 4 }
  ]
}

Supported graph functions: line, quadratic, absolute, squareRoot, cubic, cubeRoot,
logarithmic, exponential, reciprocal, and rational. Structured numeric graph fields
are used instead of executable code.

SHARED SCRATCHPAD AND UNDO

Every question automatically includes a full-screen native canvas scratchpad. Student
work is compressed into a Base64 image string and saved in a separate per-question
Firestore scratchpad document, keeping the grade tracker compact. The teacher detail
view can reopen the saved work. A shared Undo control is supplied by each response
module, while the scratchpad has its own stroke-level Undo and Clear All restoration.

ADVANCED GRAPH CONSTRUCTION

Set "studentChoosesX": true when students must choose the four outer x-values. The
center/key-point task remains fixed in the middle of the five point cards. Point cards
remain neutral until validation. Coordinate labels are translucent, the plotted point
is high contrast, and the coordinate plane highlights the active drop location.

MULTIPART GRAPH ANALYSIS

Use several requests in the same graph question:
"analysisRequests": [
  { "id": "roots", "kind": "point", "feature": "xIntercepts", "label": "X-intercepts" },
  { "id": "domain", "kind": "domain", "notation": "interval", "label": "Domain" },
  { "id": "range", "kind": "range", "notation": "inequality", "label": "Range" }
]

Set notation inputs receive only the contextual tools needed for brackets,
inequalities, union, intersection, and positive/negative infinity. Each request,
point, endpoint marker, table blank, or answer field receives its own partial-credit
record and incorrect fields are identified after submission.

UNIFIED FUNCTION INVESTIGATION

Use "type": "functionInvestigation". Students may choose four outer x-values, place
five locations with colored horizontal/vertical drag guides, sketch and snap the
function, provide an end-behavior symbol at every visible end, and then complete
several analysis requests on the same graph.

Supported analysis kinds: point features (xIntercepts, yIntercept, vertex,
localMaximum, localMinimum, center), domain, range, increasing, decreasing, and
constant. For point features use "responseMode": "click", "input", or "both" and
"allowNone": true when "Does not exist" should be available.

Restricted domain example:
"domainChoices": [
  { "minOffset": -3, "maxOffset": 3, "minInclusive": false, "maxInclusive": true }
]

A finite restricted end receives an Open Circle or Closed Circle. An unrestricted
continuing end receives an Arrow. Every end has separate partial-credit parts for
placement and symbol type.

ALGEBRAIC MICRO-QUESTIONS

Step algebra questions may include algebraic expression prompts, including
Distribution:
"algebraPrompts": [
  {
    "id": "distribute",
    "prompt": "Distribute and simplify 3(x+2).",
    "acceptedExpressions": ["3x+6"]
  }
]
Equivalent algebraic forms are accepted. During balanced operations, cancellation is
marked only on the side containing a zero pair or identity pair; the other side must
be simplified in an algebraic response field.

LESSON AND SCENARIO QUESTION TYPES

Independent/dependent quantities, discrete/continuous classification, axis labels,
reasonable scales, and origin meaning:
"type": "relationshipModel"

For lessons where students must determine graph labels, units, or scale, hide those
answers initially and let student responses build the graph:
"axisSetup": {
  "required": true,
  "requireScale": true,
  "inputMode": "type",
  "applyToGraph": true,
  "hideGraphLabels": true,
  "hideGraphUnits": true,
  "hideGraphScale": true
}

Set "inputMode": "drag" to give students quantity/unit cards that can be dragged
directly to the X- and Y-axis targets. Touch users may tap a card and then tap its
destination. Typed or dragged answers appear on the graph immediately. When
"hideGraphScale" is true, numeric tick labels remain hidden until the student enters
a positive count-by value for that axis.

Any structured graph may also control static visibility with:
"axisDisplay": {
  "showXTickLabels": false,
  "showYTickLabels": false,
  "showAxisTitles": false,
  "showAxisSymbols": true
}

Scenario-to-graph card sort with one-to-one matching and partial credit:
"type": "graphScenarioMatch"

Side-by-side graph comparison with selected and written responses:
"type": "graphComparison"

Student-created scenario, labeled axes, freehand coordinate sketch, and explanation:
"type": "graphStory"

Graph Story is an open-ended completion-credit item. The response and saved work remain
available in the teacher detail view for instructional review.

ASSIGNMENT QUESTION EDITOR

Published assignments include an Edit Questions action. Before student activity begins,
questions may be removed and reordered. After student records exist, Throw Out Safely
marks a question as excluded without changing its stored index, preventing existing
student grades from being attached to the wrong question. Excluded questions are hidden
from students and omitted from the assignment grade.

`;


const stripOuterCodeFence = (value, repairs) => {
  const match = value.match(
    /^```(?:json|javascript|js|python)?\s*([\s\S]*?)\s*```$/i,
  );
  if (!match) return value;
  repairs.push('removed a markdown code fence');
  return match[1].trim();
};

const extractJsonPayload = (value, repairs) => {
  const trimmed = value.trim();
  const isArray = trimmed.startsWith('[') && trimmed.endsWith(']');
  const isObject = trimmed.startsWith('{') && trimmed.endsWith('}');
  if (isArray || isObject) return trimmed;

  const arrayIndex = trimmed.indexOf('[');
  const objectIndex = trimmed.indexOf('{');
  const candidates = [arrayIndex, objectIndex].filter((index) => index >= 0);
  if (!candidates.length) return trimmed;

  const firstIndex = Math.min(...candidates);
  const opening = trimmed[firstIndex];
  const closing = opening === '[' ? ']' : '}';
  const lastIndex = trimmed.lastIndexOf(closing);
  if (lastIndex <= firstIndex) return trimmed;

  repairs.push('removed text surrounding the JSON payload');
  return trimmed.slice(firstIndex, lastIndex + 1).trim();
};

const replacePythonLiteralsOutsideStrings = (value, repairs) => {
  const replacements = [
    ['True', 'true'],
    ['False', 'false'],
    ['None', 'null'],
  ];
  const repairedTokens = new Set();
  let output = '';
  let inString = false;
  let escaped = false;
  let index = 0;

  while (index < value.length) {
    const character = value[index];

    if (inString) {
      output += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      index += 1;
      continue;
    }

    if (character === '"') {
      inString = true;
      output += character;
      index += 1;
      continue;
    }

    let replaced = false;
    for (const [pythonToken, jsonToken] of replacements) {
      if (!value.startsWith(pythonToken, index)) continue;

      const before = index > 0 ? value[index - 1] : '';
      const after = value[index + pythonToken.length] || '';
      const beforeIsWord = /[A-Za-z0-9_$]/.test(before);
      const afterIsWord = /[A-Za-z0-9_$]/.test(after);
      if (beforeIsWord || afterIsWord) continue;

      output += jsonToken;
      index += pythonToken.length;
      repairedTokens.add(`${pythonToken} → ${jsonToken}`);
      replaced = true;
      break;
    }

    if (!replaced) {
      output += character;
      index += 1;
    }
  }

  if (repairedTokens.size > 0) {
    repairs.push(`converted ${Array.from(repairedTokens).join(', ')}`);
  }
  return output;
};

const describeJsonParseError = (error, source) => {
  const positionMatch = String(error?.message || '').match(/position\s+(\d+)/i);
  if (!positionMatch) return error?.message || 'The blueprint could not be parsed.';

  const position = Number(positionMatch[1]);
  const before = source.slice(0, position);
  const line = before.split('\n').length;
  const lastLineBreak = before.lastIndexOf('\n');
  const column = position - lastLineBreak;
  return `${error.message} (line ${line}, column ${column}).`;
};

export const parseAssignmentBlueprintText = (rawValue) => {
  const repairs = [];
  let normalizedText = String(rawValue ?? '')
    .replace(/^\uFEFF/, '')
    .trim();

  if (!normalizedText) {
    throw new Error('The assignment JSON box is empty. Paste a question array or an Assignment Package object.');
  }

  normalizedText = stripOuterCodeFence(normalizedText, repairs);
  normalizedText = extractJsonPayload(normalizedText, repairs);
  normalizedText = replacePythonLiteralsOutsideStrings(normalizedText, repairs);

  try {
    const parsed = JSON.parse(normalizedText);
    if (Array.isArray(parsed)) {
      return {
        questions: parsed,
        assignment: null,
        schemaVersion: 1,
        isPackage: false,
        normalizedText: JSON.stringify(parsed, null, 2),
        repairs,
      };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Assignment JSON must be either a question array or an object containing a questions array.');
    }

    if (!Array.isArray(parsed.questions)) {
      throw new Error('Assignment Package JSON is missing the top-level "questions" array.');
    }

    return {
      questions: parsed.questions,
      assignment: parsed.assignment || parsed.metadata || {},
      schemaVersion: Number(parsed.schemaVersion) || 2,
      isPackage: true,
      normalizedText: JSON.stringify(parsed, null, 2),
      repairs,
    };
  } catch (error) {
    if (String(error?.message || '').startsWith('Assignment ')) throw error;
    const detail = describeJsonParseError(error, normalizedText);
    throw new Error(
      `${detail} Paste a JSON question array or Assignment Package object. JSON uses lowercase true, false, and null.`,
    );
  }
};

const ASSIGNMENT_TEMPLATE_DEFAULTS = {
  practice: {
    assignmentType: 'practice',
    variantMode: 'personalized',
    dol: { enabled: false, minutesBeforeEnd: 10, questionIndex: null },
  },
  'practice-with-dol': {
    assignmentType: 'practice',
    variantMode: 'personalized',
    dol: { enabled: true, minutesBeforeEnd: 10, questionIndex: null },
  },
  'guided-notes': {
    assignmentType: 'notesClasswork',
    variantMode: 'shared',
    completionRule: { minEngagementMinutes: 10, minimumQuestionCompletionPercent: 80 },
    dol: { enabled: false, minutesBeforeEnd: 10, questionIndex: null },
  },
};

const normalizeAssignmentType = (value) => {
  const token = String(value || '').trim().toLowerCase();
  if (['notesclasswork', 'notes-classwork', 'guidedclasswork', 'guided-classwork', 'guidednotes', 'guided-notes', 'classwork'].includes(token)) return 'notesClasswork';
  return 'practice';
};

const normalizeVariantMode = (value, questions) => {
  const token = String(value || '').trim().toLowerCase();
  if (['shared', 'exact', 'same', 'same-version', 'exact-same-version'].includes(token)) return 'shared';
  if (['personalized', 'different', 'generated', 'different-stable-version'].includes(token)) return 'personalized';
  return questions.some((question) => !isPersonalizedBlueprint(question)) ? 'shared' : 'personalized';
};

const normalizeClassPeriod = (value) => {
  const token = String(value ?? '').trim();
  if (!token) return null;
  const match = token.match(/^(?:period\s*|p)?([1-8])$/i);
  if (match) return `Period ${match[1]}`;
  return /^Period [1-8]$/i.test(token) ? `Period ${token.match(/[1-8]/)[0]}` : null;
};

const normalizeClassPeriods = (value) => {
  const items = Array.isArray(value) ? value : value == null ? [] : [value];
  return [...new Set(items.map(normalizeClassPeriod).filter(Boolean))];
};

export const normalizeAssignmentPackageMetadata = (rawAssignment = {}, questions = []) => {
  const source = rawAssignment && typeof rawAssignment === 'object' && !Array.isArray(rawAssignment) ? rawAssignment : {};
  const templateKey = String(source.template || '').trim().toLowerCase();
  const template = ASSIGNMENT_TEMPLATE_DEFAULTS[templateKey] || {};
  const mergedDol = { ...(template.dol || {}), ...(source.dol || {}) };
  const merged = { ...template, ...source, dol: mergedDol };

  const assignmentType = normalizeAssignmentType(merged.assignmentType || merged.type);
  const variantMode = normalizeVariantMode(merged.variantMode || merged.problemVersions || merged.versionMode, questions);
  const classes = normalizeClassPeriods(merged.classes ?? merged.classPeriods ?? merged.assignedClassPeriods);
  const rawDolQuestionIndex = merged.dol?.questionIndex;
  const rawDolQuestionNumber = merged.dol?.questionNumber;
  const dolQuestionIndexValue = rawDolQuestionIndex === null || rawDolQuestionIndex === undefined || rawDolQuestionIndex === ''
    ? null
    : Number(rawDolQuestionIndex);
  const dolQuestionNumber = rawDolQuestionNumber === null || rawDolQuestionNumber === undefined || rawDolQuestionNumber === ''
    ? null
    : Number(rawDolQuestionNumber);
  const dolQuestionIndex = Number.isInteger(dolQuestionIndexValue)
    ? dolQuestionIndexValue
    : Number.isInteger(dolQuestionNumber) && dolQuestionNumber > 0
      ? dolQuestionNumber - 1
      : null;

  return {
    provided: {
      title: Object.prototype.hasOwnProperty.call(source, 'title') || Object.prototype.hasOwnProperty.call(source, 'name'),
      folder: Object.prototype.hasOwnProperty.call(source, 'folder'),
      assignmentType: Object.prototype.hasOwnProperty.call(source, 'assignmentType') || Object.prototype.hasOwnProperty.call(source, 'type') || Boolean(templateKey),
      variantMode: Object.prototype.hasOwnProperty.call(source, 'variantMode') || Object.prototype.hasOwnProperty.call(source, 'problemVersions') || Object.prototype.hasOwnProperty.call(source, 'versionMode') || Boolean(templateKey),
      classes: ['classes', 'classPeriods', 'assignedClassPeriods'].some((key) => Object.prototype.hasOwnProperty.call(source, key)),
      releaseAt: Object.prototype.hasOwnProperty.call(source, 'releaseAt') || Object.prototype.hasOwnProperty.call(source, 'releaseDate'),
      dueAt: Object.prototype.hasOwnProperty.call(source, 'dueAt') || Object.prototype.hasOwnProperty.call(source, 'dueDate'),
      lateDueAt: Object.prototype.hasOwnProperty.call(source, 'lateDueAt') || Object.prototype.hasOwnProperty.call(source, 'lateDueDate'),
      prerequisite: Object.prototype.hasOwnProperty.call(source, 'prerequisiteAssignmentId') || Object.prototype.hasOwnProperty.call(source, 'prerequisiteTitle') || Object.prototype.hasOwnProperty.call(source, 'prerequisite'),
      completionRule: Object.prototype.hasOwnProperty.call(source, 'completionRule') || Boolean(templateKey),
      dol: Object.prototype.hasOwnProperty.call(source, 'dol') || Boolean(templateKey),
    },
    schemaVersion: Number(merged.schemaVersion) || 2,
    template: templateKey || null,
    assignmentKey: String(merged.assignmentId || merged.assignmentKey || merged.key || '').trim() || null,
    title: String(merged.title || merged.name || '').trim(),
    folder: String(merged.folder || '').trim() || null,
    assignmentType,
    variantMode,
    assignedClassPeriods: classes,
    releaseAt: merged.releaseAt || merged.releaseDate || null,
    dueAt: merged.dueAt || merged.dueDate || null,
    lateDueAt: merged.lateDueAt || merged.lateDueDate || null,
    prerequisiteAssignmentId: String(merged.prerequisiteAssignmentId || '').trim() || null,
    prerequisiteTitle: String(merged.prerequisiteTitle || merged.prerequisite?.title || '').trim() || null,
    completionRule: merged.completionRule || (assignmentType === 'notesClasswork'
      ? { minEngagementMinutes: 10, minimumQuestionCompletionPercent: 80 }
      : null),
    dol: {
      enabled: assignmentType === 'practice' && merged.dol?.enabled === true,
      minutesBeforeEnd: Math.max(1, Number(merged.dol?.minutesBeforeEnd || merged.dol?.minutes || 10)),
      questionIndex: dolQuestionIndex,
      questionId: String(merged.dol?.questionId || '').trim() || null,
    },
    standards: Array.isArray(merged.standards) ? merged.standards.map(String) : [],
    curriculum: merged.curriculum && typeof merged.curriculum === 'object' && !Array.isArray(merged.curriculum)
      ? merged.curriculum
      : null,
  };
};

export const assertFirestoreSafeAssignmentPayload = (value) => {
  const visit = (current, path = '$') => {
    if (Array.isArray(current)) {
      current.forEach((item, index) => {
        if (Array.isArray(item)) {
          throw new Error(`Firestore cannot save an array directly inside another array (found at ${path}[${index}]). Wrap the inner list in an object instead.`);
        }
        visit(item, `${path}[${index}]`);
      });
      return;
    }
    if (!current || typeof current !== 'object') return;
    Object.entries(current).forEach(([key, item]) => visit(item, `${path}.${key}`));
  };
  visit(value);
  return value;
};

// These belong to the graph point-builder used by functionInvestigation/analysisRequests
// origin points, not to relationshipModel. RelationshipModel.jsx never reads them - it only
// grades the origin explanation against origin.requiredConcepts (a free-text textarea). A
// question authored with these fields but no requiredConcepts silently accepts any non-blank
// answer as correct, since matchesConceptGroups treats a missing concept list as "ungraded".
const RELATIONSHIP_MODEL_ORIGIN_FOREIGN_KEYS = ['target', 'responseMode', 'coordinates', 'applyResponseToGraph'];

export const validateAssignmentQuestions = (questions, options = {}) => {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('JSON must be a non-empty array of questions.');
  }

  const allowFixed = options.allowFixed === true || options.variantMode === 'shared';
  const supportedTypes = new Set([
    'algebra', 'fraction', 'numberLine', 'graphing', 'functionGraph',
    'functionInvestigation', 'graphAnalysis', 'stepAlgebra', 'literal',
    'system', 'table', 'orderedPair', 'multiAnswer', 'relationshipModel',
    'graphScenarioMatch', 'graphComparison', 'graphStory', 'contextInterpretation',
    // Batch A-D interactive tools. Sourced from the registry so a newly
    // registered tool is publishable and renderable together, and the two can
    // never drift apart into "teacher can publish it, student cannot see it".
    ...Object.keys(TOOL_CAPABILITIES),
  ]);

  questions.forEach((question, index) => {
    if (!question?.type) throw new Error(`Question ${index + 1} is missing a type.`);
    if (!supportedTypes.has(question.type)) {
      throw new Error(`Question ${index + 1} uses unsupported type ${question.type}.`);
    }
    const rawDok = question?.complexity?.level ?? question?.complexity?.dok ?? question?.standards?.dok ?? question?.dok;
    if (rawDok !== undefined && rawDok !== null && rawDok !== '' && (!Number.isInteger(Number(rawDok)) || Number(rawDok) < 1 || Number(rawDok) > 4)) {
      throw new Error(`Question ${index + 1} has invalid DOK ${rawDok}. Use an integer from 1 through 4.`);
    }
    const rawBand = question?.difficulty?.generatorBand ?? question?.difficulty?.band ?? question?.generatorBand;
    if (rawBand !== undefined && rawBand !== null && rawBand !== '' && (!Number.isInteger(Number(rawBand)) || Number(rawBand) < 1 || Number(rawBand) > 5)) {
      throw new Error(`Question ${index + 1} has invalid difficulty band ${rawBand}. Use an integer from 1 through 5.`);
    }
    if (question?.evidenceWeight !== undefined && (!Number.isFinite(Number(question.evidenceWeight)) || Number(question.evidenceWeight) < 0 || Number(question.evidenceWeight) > 2)) {
      throw new Error(`Question ${index + 1} has invalid evidenceWeight. Use a number from 0 through 2.`);
    }
    if (question?.differentiation?.mode && !['off', 'recommend', 'auto'].includes(question.differentiation.mode)) {
      throw new Error(`Question ${index + 1} has invalid differentiation mode. Use off, recommend, or auto.`);
    }
    if (question?.standards) {
      const standards = normalizeQuestionStandards(question);
      [...standards.primary, ...standards.secondary, ...standards.prerequisite].forEach((entry) => {
        if (!getTexasStandard(entry.code)) {
          throw new Error(`Question ${index + 1} references TEKS ${entry.code}, which is not in a loaded Texas Math registry.`);
        }
      });
    }
    if (question.type === 'relationshipModel' && question.origin && typeof question.origin === 'object') {
      const foreignKeys = RELATIONSHIP_MODEL_ORIGIN_FOREIGN_KEYS.filter((key) => key in question.origin);
      if (foreignKeys.length > 0) {
        throw new Error(
          `Question ${index + 1} (relationshipModel) has origin.${foreignKeys.join(', origin.')}, which belongs to a different question type and has no effect here. relationshipModel grades the origin explanation using origin.requiredConcepts (a list of key words/phrases the student's answer must include), not a graph point builder. Remove ${foreignKeys.join(', ')} and add requiredConcepts.`,
        );
      }
    }
    if (!allowFixed && !isPersonalizedBlueprint(question)) {
      throw new Error(
        `Question ${index + 1} (${question.type}) is fixed. Add a generator, at least two variants, or publish the assignment in Shared exact version mode.`,
      );
    }
  });

  return questions;
};
