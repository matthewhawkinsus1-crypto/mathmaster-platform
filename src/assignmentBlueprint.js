import { isPersonalizedBlueprint } from './problemGenerator.js';
import { normalizeQuestionStandards } from './questionMetadata.js';
import { getTexasStandard } from './texasStandards.js';
import { MISSING_TOOL_IDS, validateToolQuestion } from './tools/toolSchemas.js';
import { normalizeLabDefinition } from './platform/labs/labDefinitionSchema.js';
import { compileAuthoringIntentV5 } from './platform/contract/authoringIntentV5.js';
import { looksLikeFiniteSetNotation } from '../functions/shared/answerEquivalence.mjs';

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

CENTRAL ACTIVITY POLICY (PHASE 3A)

Attempt rules are not repeated inside question modules. They come from the activity
role. Warm-Up, Classwork, and Practice allow three attempts and replacement problems.
DOL, Quiz, and Test allow one attempt, disable hints, and do not allow replacement
problems. DOL feedback is held until the activity feedback window; Quiz/Test feedback
waits for teacher release. Calculator access is resolved separately from the activity
default, question design, assessment context, and documented student support plan.

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

Use "workspaceDifficulty": 1-5 to set how much the workspace helps (1 Guided, 5 Open).
Balanced but inefficient moves are always allowed at every level: adding an unhelpful
value to both sides is correct algebra by a longer road, and the workspace says so
rather than rejecting it. At levels 3 and 4 such a move also uses one of the attempts
permitted by the current activity role. Only a move that breaks equivalence — multiplying
or dividing by zero — is refused. Operations appear on both sides immediately.
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

For categorical fields with a small set of valid answers, use "type": "choice" and provide "options". For ordinary written words or explanations, use "type": "text" so students get a normal text box instead of the math keyboard. Use the default field only for mathematical notation.


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

STATIC GRAPH RULES

For quadratic functions in a read-only graph, choose exactly one parameterization:
- standard form: { "type": "quadratic", "a": -1, "b": 8, "c": 0 } for y = ax^2 + bx + c
- vertex form: { "type": "quadratic", "a": -1, "h": 4, "k": 16 } for y = a(x - h)^2 + k
Do not mix b/c with h/k in the same quadratic.

For graphScenarioMatch and graphComparison, each entry is { "id": "g1", "graph": { ... } };
functions and bounds belong inside the nested graph object. Before returning JSON, evaluate each
function at xMin/xMax and verify the intended curve and defining feature fit inside yMin/yMax.
Real-world elapsed-time graphs should not include negative time unless the context explicitly allows it.
Countable whole-item situations should use plotted points rather than a continuous line when discreteness matters.

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

const findBalancedPayloadEnd = (text, startIndex) => {
  const opening = text[startIndex];
  if (opening !== '{' && opening !== '[') return -1;
  const stack = [];
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') { inString = true; continue; }
    if (character === '{' || character === '[') { stack.push(character); continue; }
    if (character !== '}' && character !== ']') continue;
    const expected = character === '}' ? '{' : '[';
    if (stack[stack.length - 1] !== expected) return -1;
    stack.pop();
    if (stack.length === 0) return index;
  }
  return -1;
};

const extractJsonPayload = (value, repairs) => {
  const trimmed = value.trim();
  const isArray = trimmed.startsWith('[') && trimmed.endsWith(']');
  const isObject = trimmed.startsWith('{') && trimmed.endsWith('}');
  if (isArray || isObject) return trimmed;

  // AI assistants sometimes return executable-looking wrappers such as
  // `assignment = {...}; print(...)` or several fenced blocks after the JSON.
  // Taking everything from the first opening brace to the LAST closing brace
  // merged those unrelated blocks and created a false parse error. Stop at the
  // first balanced top-level payload instead.
  let inString = false;
  let escaped = false;
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') { inString = true; continue; }
    if (character !== '{' && character !== '[') continue;
    const endIndex = findBalancedPayloadEnd(trimmed, index);
    if (endIndex <= index) continue;
    repairs.push('extracted the first complete JSON payload from surrounding AI text/code');
    return trimmed.slice(index, endIndex + 1).trim();
  }

  return trimmed;
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


// AI assistants routinely write LaTeX inside JSON strings — "\le", "\text{or}",
// "\{", "\frac" — and a lone backslash is not a legal JSON escape. Two failure
// modes result: "\le" throws a syntax error, and "\frac" silently parses,
// because \f is the formfeed escape, corrupting the string into a control
// character followed by "rac". Both are fixed the same way: escape any
// backslash that is not already starting a valid JSON escape.
const VALID_JSON_ESCAPES = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);

// \f, \b and \t are legal JSON escapes — formfeed, backspace, tab — that are
// also the opening of common LaTeX commands, so those three letters are the
// only genuinely ambiguous ones. Guessing from "a letter follows" is too blunt:
// it would mangle the legitimate tab in "two\tafter". Instead the whole command
// name is matched, since a LaTeX command ends at the first non-letter.
// \n and \r are not ambiguous in practice and are always left alone: a real
// line break inside a prompt is common, and \neq / \rightarrow are rare enough
// that breaking line breaks to catch them would be a bad trade.
const AMBIGUOUS_LATEX_COMMANDS = new Set([
  // f
  'frac', 'floor', 'forall', 'fbox', 'fill',
  // b
  'begin', 'bar', 'binom', 'bmod', 'boxed', 'bullet', 'bigcup', 'bigcap',
  'bigcirc', 'bold', 'boldsymbol', 'brace', 'bracket', 'because', 'bmatrix',
  // t
  'text', 'textbf', 'textit', 'textrm', 'times', 'theta', 'to', 'triangle',
  'tan', 'tfrac', 'top', 'tilde', 'therefore', 'tbinom',
]);

const startsAmbiguousLatexCommand = (text, backslashIndex) => {
  const next = text[backslashIndex + 1];
  if (next !== 'f' && next !== 'b' && next !== 't') return false;
  const command = (text.slice(backslashIndex + 1).match(/^[a-zA-Z]+/) || [''])[0];
  return AMBIGUOUS_LATEX_COMMANDS.has(command.toLowerCase());
};

// Only touches the inside of string literals, so structural characters are safe.
const escapeStrayBackslashesInStrings = (text, repairs) => {
  let out = '';
  let inString = false;
  let fixed = 0;

  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];

    if (!inString) {
      if (character === '"') inString = true;
      out += character;
      continue;
    }

    if (character === '"') { inString = false; out += character; continue; }

    if (character !== '\\') { out += character; continue; }

    const next = text[i + 1];
    // A real \uXXXX needs four hex digits; anything else claiming to be one is
    // a LaTeX command such as \underline.
    const isUnicodeEscape = next === 'u' && /^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6));
    const isValid = next !== undefined && VALID_JSON_ESCAPES.has(next) && (next !== 'u' || isUnicodeEscape);

    if (isValid && !startsAmbiguousLatexCommand(text, i)) {
      out += character + next;
      i += 1;
      continue;
    }

    out += '\\\\';
    fixed += 1;
  }

  if (fixed) {
    repairs.push(`escaped ${fixed} LaTeX backslash${fixed === 1 ? '' : 'es'} inside strings`);
  }
  return out;
};

// Intake is an AUTHORING COMPILER, not a strict transcription test. External
// AIs should be allowed to express mathematically clear intent in a few common
// aliases; MathMaster normalizes that intent into the exact internal renderer
// contract before validation/storage. Only deterministic, meaning-preserving
// repairs belong here.
const normalizeStaticFunctionSpec = (spec, repairs, label) => {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return spec;
  const next = { ...spec };
  if (String(next.type || '').toLowerCase() === 'linear') {
    next.type = 'line';
    repairs.push(`${label} function type linear → line`);
  }
  return next;
};

const normalizeGraphObject = (graph, repairs, label) => {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) return graph;
  const next = { ...graph };
  if (Array.isArray(next.functions)) {
    next.functions = next.functions.map((spec, index) => normalizeStaticFunctionSpec(spec, repairs, `${label}.functions[${index}]`));
  }
  if (next.functionSpec && !next.functions) {
    next.functions = [normalizeStaticFunctionSpec(next.functionSpec, repairs, `${label}.functionSpec`)];
    delete next.functionSpec;
    repairs.push(`wrapped ${label}.functionSpec as a drawable graph function`);
  }
  return next;
};

const normalizeGraphChoices = (items, repairs, label) => (Array.isArray(items) ? items : []).map((item, index) => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
  if (item.graph && typeof item.graph === 'object' && !Array.isArray(item.graph)) {
    return { ...item, graph: normalizeGraphObject(item.graph, repairs, `${label}[${index}].graph`) };
  }

  const graphKeys = ['xMin', 'xMax', 'yMin', 'yMax', 'xStep', 'yStep', 'functions', 'points', 'segments', 'line', 'm', 'b', 'functionSpec', 'axisDisplay', 'xAxisLabel', 'xAxisUnit', 'yAxisLabel', 'yAxisUnit'];
  const graph = {};
  let moved = 0;
  graphKeys.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(item, key)) return;
    graph[key] = item[key];
    moved += 1;
  });
  if (!moved) return item;
  const next = { ...item };
  graphKeys.forEach((key) => delete next[key]);
  next.graph = normalizeGraphObject(graph, repairs, `${label}[${index}].graph`);
  repairs.push(`nested ${label}[${index}] graph fields under .graph`);
  return next;
});

const normalizeAnalysisRequests = (requests, repairs, label) => {
  if (!Array.isArray(requests)) return requests;
  const seen = new Map();
  let added = 0;
  const normalized = requests.map((request) => {
    if (!request || typeof request !== 'object' || Array.isArray(request) || request.id) return request;
    const base = String(request.feature || request.kind || 'part').replace(/[^A-Za-z0-9_-]+/g, '-') || 'part';
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    added += 1;
    return { ...request, id: count === 1 ? base : `${base}-${count}` };
  });
  if (added) repairs.push(`generated ${added} missing analysis request id${added === 1 ? '' : 's'} in ${label}`);
  return normalized;
};

const inferAuthoringQuestionType = (question = {}) => {
  if (Array.isArray(question.intervals)) return 'intervalNumberLine';
  if (Array.isArray(question.pairs)) return 'relationMapping';
  if (question.sequence && typeof question.sequence === 'object') return 'sequenceExplorer';
  if (Array.isArray(question.sets)) return 'representationMatch';
  if (Array.isArray(question.quantities) && (question.scenario || question.correctIndependentId || question.correctDependentId)) return 'relationshipModel';
  if (Array.isArray(question.scenarios) && Array.isArray(question.graphs) && question.correctMatches) return 'graphScenarioMatch';
  if (Array.isArray(question.graphs) && Array.isArray(question.fields)) return 'graphComparison';
  if (Array.isArray(question.analysisRequests) && question.functionSpec) return 'graphAnalysis';
  if (question.table?.answers && Array.isArray(question.table?.columns) && Array.isArray(question.table?.rows)) return 'table';
  if (Array.isArray(question.answerFields)) return 'multiAnswer';
  if (Array.isArray(question.equations) || Array.isArray(question.equationsLatex)) return 'system';
  if (question.solveFor && question.answer != null) return 'literal';
  return null;
};


const inferBinaryChoiceOptions = (field = {}) => {
  const label = String(field.label || field.prompt || '').toLowerCase();
  const answer = String(field.answer ?? field.acceptedAnswers?.[0] ?? '').trim().toLowerCase();
  const patterns = [
    { options: ['yes', 'no'], pattern: /yes\s*(?:\/|or)\s*no|no\s*(?:\/|or)\s*yes/ },
    { options: ['true', 'false'], pattern: /true\s*(?:\/|or)\s*false|false\s*(?:\/|or)\s*true/ },
    { options: ['discrete', 'continuous'], pattern: /discrete\s*(?:\/|or)\s*continuous|continuous\s*(?:\/|or)\s*discrete/ },
    { options: ['finite', 'infinite'], pattern: /finite\s*(?:\/|or)\s*infinite|infinite\s*(?:\/|or)\s*finite/ },
  ];
  return patterns.find((entry) => entry.pattern.test(label) && entry.options.includes(answer))?.options || null;
};

// Firestore does not allow an array to contain another array directly. The
// authoring compiler accepts the natural [[x,y], ...] notation and stores the
// Firestore-safe {x,y} shape. The same pass also absorbs common AI aliases so
// they never trigger a round trip merely because the renderer uses a different
// internal field name.
const normalizeQuestionStorageShapes = (questions, repairs = []) => (Array.isArray(questions) ? questions : []).map((question, index) => {
  if (!question || typeof question !== 'object' || Array.isArray(question)) return question;
  let next = { ...question };
  const label = `Question ${index + 1}`;
  if (!next.toolId && !next.type) {
    const inferredType = inferAuthoringQuestionType(next);
    if (inferredType) {
      next.type = inferredType;
      repairs.push(`inferred ${label} type as ${inferredType} from its mathematical structure`);
    }
  }
  const type = next.toolId || next.type;

  // Standards are mathematical intent, but the verbose internal alignment
  // object should not be an AI-authoring burden. Accept concise authoring
  // shorthands and compile them into the canonical alignment array. Never
  // inherit one assignment-level standard across every question: primary
  // alignment remains question-specific.
  if (!Array.isArray(next.alignments) || next.alignments.length === 0) {
    // `standard` is not exclusively a standards field. `graphing2` in
    // standardForm mode carries `standard: { A, B, C }` — the coefficients of
    // Ax + By = C — and reading that as a TEKS code stringified the object into
    // an alignment of "[object Object]" and then DELETED the coefficients, so
    // the question arrived at the student with no equation and reported mastery
    // against a standard that does not exist.
    //
    // Only a string shaped like a standards code is treated as the shorthand,
    // and only the key it actually came from is consumed.
    const looksLikeStandardCode = (value) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9.\-_]*$/.test(value.trim());
    const fromKey = looksLikeStandardCode(next.primaryStandard)
      ? 'primaryStandard'
      : looksLikeStandardCode(next.standard) ? 'standard' : null;
    const primaryStandard = fromKey ? String(next[fromKey]).trim() : '';
    const secondaryStandards = Array.isArray(next.secondaryStandards) ? next.secondaryStandards : [];
    const prerequisiteStandards = Array.isArray(next.prerequisiteStandards) ? next.prerequisiteStandards : [];
    if (primaryStandard) {
      next.alignments = [
        { framework: 'teks', code: primaryStandard, role: 'primary', evidenceLevel: next.evidenceLevel || 'assessed' },
        ...secondaryStandards.filter(Boolean).map((code) => ({ framework: 'teks', code: String(code), role: 'secondary', evidenceLevel: 'practiced' })),
        ...prerequisiteStandards.filter(Boolean).map((code) => ({ framework: 'teks', code: String(code), role: 'prerequisite', evidenceLevel: 'practiced' })),
      ];
      delete next[fromKey];
      delete next.secondaryStandards;
      delete next.prerequisiteStandards;
      delete next.evidenceLevel;
      repairs.push(`compiled ${label} standard shorthand into alignments`);
    }
  }

  if (type === 'relationMapping' && Array.isArray(next.pairs)) {
    let converted = 0;
    const pairs = next.pairs.map((pair) => {
      if (!Array.isArray(pair) || pair.length !== 2) return pair;
      converted += 1;
      return { x: pair[0], y: pair[1] };
    });
    if (converted) {
      next.pairs = pairs;
      repairs.push(`converted ${label} relationMapping [x, y] pairs to Firestore-safe {x, y} objects`);
    }
  }

  // AI-facing authoring uses the ordinary words equation/equations. The older
  // renderer field names remain internal compatibility details.
  if (!next.equationLatex && typeof next.equation === 'string' && ['algebra', 'stepAlgebra', 'literal'].includes(type)) {
    next.equationLatex = next.equation;
    delete next.equation;
    repairs.push(`mapped ${label}.equation to the internal equation field`);
  }
  if (!next.equationsLatex && Array.isArray(next.equations) && type === 'system') {
    next.equationsLatex = next.equations;
    delete next.equations;
    repairs.push(`mapped ${label}.equations to the internal system equation field`);
  }

  if (type === 'intervalNumberLine' && Array.isArray(next.ask) && next.ask.includes('notation')) {
    next.ask = next.ask.map((part) => part === 'notation' ? 'interval' : part);
    repairs.push(`normalized ${label} intervalNumberLine ask notation → interval`);
  }

  if (Array.isArray(next.analysisRequests)) {
    next.analysisRequests = normalizeAnalysisRequests(next.analysisRequests, repairs, `${label}.analysisRequests`);
  }

  if (next.graph && typeof next.graph === 'object' && !Array.isArray(next.graph)) {
    next.graph = normalizeGraphObject(next.graph, repairs, `${label}.graph`);
  }
  if (['graphScenarioMatch', 'graphComparison'].includes(type) && Array.isArray(next.graphs)) {
    next.graphs = normalizeGraphChoices(next.graphs, repairs, `${label}.graphs`);
  }
  if (Array.isArray(next.scenarios)) {
    let scenarioAliases = 0;
    next.scenarios = next.scenarios.map((scenario) => {
      if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario) || scenario.description) return scenario;
      const description = scenario.text || scenario.prompt || scenario.scenario;
      if (!description) return scenario;
      const normalized = { ...scenario, description };
      delete normalized.text;
      scenarioAliases += 1;
      return normalized;
    });
    if (scenarioAliases) repairs.push(`normalized ${scenarioAliases} scenario description alias${scenarioAliases === 1 ? '' : 'es'} in ${label}`);
  }

  // If an author supplies explicit options, the student should get a selector.
  // Requiring the AI to also remember the renderer-only `type: choice` switch
  // creates needless magic-word grading failures.
  ['answerFields', 'fields'].forEach((key) => {
    if (!Array.isArray(next[key])) return;
    let promoted = 0;
    let setFields = 0;
    next[key] = next[key].map((field) => {
      if (!field || typeof field !== 'object' || Array.isArray(field)) return field;
      let normalizedField = field;
      if (!normalizedField.type && Array.isArray(normalizedField.options) && normalizedField.options.length) {
        promoted += 1;
        normalizedField = { ...normalizedField, type: 'choice' };
      }
      if (!normalizedField.type) {
        const inferredOptions = inferBinaryChoiceOptions(normalizedField);
        if (inferredOptions) {
          promoted += 1;
          normalizedField = { ...normalizedField, type: 'choice', options: inferredOptions };
        }
      }
      if (!normalizedField.type) {
        const accepted = Array.isArray(normalizedField.acceptedAnswers) && normalizedField.acceptedAnswers.length
          ? normalizedField.acceptedAnswers
          : normalizedField.answer !== undefined
            ? [normalizedField.answer]
            : [];
        if (accepted.some((value) => looksLikeFiniteSetNotation(value))) {
          setFields += 1;
          normalizedField = { ...normalizedField, type: 'set', toolProfile: normalizedField.toolProfile || 'set' };
        }
      }
      return normalizedField;
    });
    if (promoted) repairs.push(`promoted ${promoted} ${label} ${key} option field${promoted === 1 ? '' : 's'} to student choice controls`);
    if (setFields) repairs.push(`recognized ${setFields} ${label} ${key} field${setFields === 1 ? '' : 's'} as finite-set notation and enabled semantic set grading`);
  });

  return next;
});

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

  // Runs whether or not the text parses: "\le" throws, but "\frac" parses into
  // a formfeed and silently corrupts the prompt, so both need the same pass.
  normalizedText = escapeStrayBackslashesInStrings(normalizedText, repairs);

  try {
    let parsed = JSON.parse(normalizedText);
    const sourceSchemaVersion = !Array.isArray(parsed) && parsed && typeof parsed === 'object'
      ? Number(parsed.schemaVersion) || null
      : null;
    if (!Array.isArray(parsed) && parsed && typeof parsed === 'object' && Number(parsed.schemaVersion) === 5) {
      const compiledV5 = compileAuthoringIntentV5(parsed);
      parsed = compiledV5.package;
      repairs.push(...compiledV5.repairs);
    }
    if (Array.isArray(parsed)) {
      const questions = normalizeQuestionStorageShapes(parsed, repairs);
      return {
        questions,
        assignment: null,
        schemaVersion: 1,
        sourceSchemaVersion,
        isPackage: false,
        normalizedText: JSON.stringify(questions, null, 2),
        repairs,
      };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Assignment JSON must be either a question array or an object containing a questions array.');
    }

    const hasBundleActivities = Array.isArray(parsed.activities);
    const normalizedActivities = hasBundleActivities
      ? parsed.activities.map((activity, activityIndex) => {
          const activityRole = activity?.role || 'classwork';
          const normalizedActivityQuestions = normalizeQuestionStorageShapes(
            Array.isArray(activity?.questions)
              ? activity.questions.map((question) => ({
                  ...question,
                  activityRole: question?.activityRole || activityRole,
                }))
              : [],
            repairs,
          );
          return { ...activity, questions: normalizedActivityQuestions, __activityIndex: activityIndex };
        })
      : [];

    const bundledQuestions = hasBundleActivities
      ? normalizedActivities.flatMap((activity) => {
          const activityRole = activity?.role || 'classwork';
          const standardQuestions = activity.questions || [];
          if (!activity?.labDefinition && !activity?.isModelingLab) return standardQuestions;
          const labSource = activity.labDefinition || activity;
          const publicLab = normalizeLabDefinition(labSource);
          return [...standardQuestions, {
            type: 'modelingLab',
            questionId: String(activity?.questionId || `${activity.activityId || `activity-${Number(activity.__activityIndex || 0) + 1}`}-lab`),
            familyId: `modelingLab:${labSource.labType || 'optimization'}`,
            activityRole,
            dok: Number(labSource.dokLevel || labSource.dok || 3),
            teks: labSource.teksAlignments || labSource.teks || [],
            prompt: labSource.guidingQuestion || labSource.title || 'Interactive mathematical modeling lab',
            labDefinition: publicLab,
          }];
        })
      : [];

    if (!Array.isArray(parsed.questions) && !hasBundleActivities) {
      throw new Error('Assignment Package JSON is missing a top-level "questions" array or Bundle V3 "activities" array.');
    }

    // Bundle V3 is authoritative when activities are present. Some transition
    // files also contain a legacy top-level questions mirror; using that mirror
    // would make the student assignment differ from the pre-flight preview.
    const questions = hasBundleActivities
      ? bundledQuestions
      : normalizeQuestionStorageShapes(parsed.questions, repairs);
    if (questions.length === 0) {
      throw new Error('Assignment Package JSON contains no questions.');
    }

    const lessonMetadata = parsed.lessonMetadata && typeof parsed.lessonMetadata === 'object' && !Array.isArray(parsed.lessonMetadata)
      ? parsed.lessonMetadata
      : {};
    const assignmentMetadata = parsed.assignment || parsed.metadata || (hasBundleActivities
      ? {
          title: lessonMetadata.title,
          curriculum: lessonMetadata.course ? { course: lessonMetadata.course, topic: lessonMetadata.topic ?? null } : null,
        }
      : {});

    return {
      questions,
      assignment: assignmentMetadata,
      schemaVersion: Number(parsed.schemaVersion) || 2,
      sourceSchemaVersion,
      isPackage: true,
      isBundle: hasBundleActivities,
      bundleSource: hasBundleActivities
        ? { ...parsed, activities: normalizedActivities.map(({ __activityIndex, ...activity }) => activity) }
        : null,
      normalizedText: JSON.stringify(
        hasBundleActivities
          ? { ...parsed, activities: normalizedActivities.map(({ __activityIndex, ...activity }) => activity) }
          : { ...parsed, questions },
        null,
        2,
      ),
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
  if (['personalized', 'different', 'generated', 'different-stable-version', 'mixed', 'per-student', 'perstudent', 'personalize-where-possible'].includes(token)) return 'personalized';
  // Personalized means 'personalize where the question supports it'. Fixed
  // graphs/data remain identical while generator/variant questions use the
  // student's stable generation key. A single fixed visual must never force
  // the entire assignment into one shared version.
  return questions.some((question) => isPersonalizedBlueprint(question)) ? 'personalized' : 'shared';
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

const normalizeSectionVariantModes = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([role, mode]) => [String(role).trim().toLowerCase(), String(mode).trim().toLowerCase()])
    .filter(([, mode]) => mode === 'shared' || mode === 'personalized'));
};

const normalizeDOLInstructionDates = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .map(([period, date]) => [normalizeClassPeriod(period), String(date || '').trim()])
    .filter(([period, date]) => Boolean(period) && /^\d{4}-\d{2}-\d{2}$/.test(date)));
};

export const normalizeAssignmentPackageMetadata = (rawAssignment = {}, questions = []) => {
  const source = rawAssignment && typeof rawAssignment === 'object' && !Array.isArray(rawAssignment) ? rawAssignment : {};
  const templateKey = String(source.template || '').trim().toLowerCase();
  const template = ASSIGNMENT_TEMPLATE_DEFAULTS[templateKey] || {};
  const mergedDol = { ...(template.dol || {}), ...(source.dol || {}) };
  const mergedWarmup = { ...(template.warmup || {}), ...(source.warmup || {}) };
  const merged = { ...template, ...source, dol: mergedDol, warmup: mergedWarmup };

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
      sectionVariantModes: Object.prototype.hasOwnProperty.call(source, 'sectionVariantModes'),
      classes: ['classes', 'classPeriods', 'assignedClassPeriods'].some((key) => Object.prototype.hasOwnProperty.call(source, key)),
      releaseAt: Object.prototype.hasOwnProperty.call(source, 'releaseAt') || Object.prototype.hasOwnProperty.call(source, 'releaseDate'),
      dueAt: Object.prototype.hasOwnProperty.call(source, 'dueAt') || Object.prototype.hasOwnProperty.call(source, 'dueDate'),
      lateDueAt: Object.prototype.hasOwnProperty.call(source, 'lateDueAt') || Object.prototype.hasOwnProperty.call(source, 'lateDueDate'),
      prerequisite: Object.prototype.hasOwnProperty.call(source, 'prerequisiteAssignmentId') || Object.prototype.hasOwnProperty.call(source, 'prerequisiteTitle') || Object.prototype.hasOwnProperty.call(source, 'prerequisite'),
      completionRule: Object.prototype.hasOwnProperty.call(source, 'completionRule') || Boolean(templateKey),
      dol: Object.prototype.hasOwnProperty.call(source, 'dol') || Boolean(templateKey),
      warmup: Object.prototype.hasOwnProperty.call(source, 'warmup') || Boolean(template?.warmup),
    },
    schemaVersion: Number(merged.schemaVersion) || 2,
    template: templateKey || null,
    assignmentKey: String(merged.assignmentId || merged.assignmentKey || merged.key || '').trim() || null,
    title: String(merged.title || merged.name || '').trim(),
    folder: String(merged.folder || '').trim() || null,
    assignmentType,
    variantMode,
    sectionVariantModes: normalizeSectionVariantModes(merged.sectionVariantModes),
    assignedClassPeriods: classes,
    releaseAt: merged.releaseAt || merged.releaseDate || null,
    dueAt: merged.dueAt || merged.dueDate || null,
    lateDueAt: merged.lateDueAt || merged.lateDueDate || null,
    prerequisiteAssignmentId: String(merged.prerequisiteAssignmentId || '').trim() || null,
    prerequisiteTitle: String(merged.prerequisiteTitle || merged.prerequisite?.title || '').trim() || null,
    completionRule: merged.completionRule || (assignmentType === 'notesClasswork'
      ? { minEngagementMinutes: 10, minimumQuestionCompletionPercent: 80 }
      : null),
    warmup: {
      // Warm-Up availability follows the student's actual class period. The
      // authored assignment may change the default seven-minute lead-in, while
      // teacher close/reopen state is stored later on the live assignment.
      enabled: merged.warmup?.enabled !== false,
      minutesBeforeStart: Math.max(0, Number(merged.warmup?.minutesBeforeStart ?? merged.warmup?.minutes ?? 7)),
      instructionDate: String(merged.warmup?.instructionDate || merged.warmup?.date || '').trim() || null,
      instructionDatesByClassPeriod: normalizeDOLInstructionDates(merged.warmup?.instructionDatesByClassPeriod),
    },
    dol: {
      // DOL behavior belongs to the authored DOL/activity role, not the legacy
      // assignmentType compatibility field. Guided classwork bundles may also
      // contain an exit ticket.
      enabled: merged.dol?.enabled === true,
      minutesBeforeEnd: Math.max(1, Number(merged.dol?.minutesBeforeEnd || merged.dol?.minutes || 10)),
      instructionDate: String(merged.dol?.instructionDate || merged.dol?.date || '').trim() || null,
      instructionDatesByClassPeriod: normalizeDOLInstructionDates(merged.dol?.instructionDatesByClassPeriod),
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

// The single list of what a question may be. The authoring contract shown to an
// AI is generated from this, so a newly registered tool becomes authorable
// without anyone editing a help document.
export const CORE_QUESTION_TYPES = Object.freeze([
  'algebra', 'fraction', 'numberLine', 'graphing', 'functionGraph',
  'functionInvestigation', 'graphAnalysis', 'stepAlgebra', 'literal',
  'system', 'table', 'orderedPair', 'multiAnswer', 'relationshipModel',
  'graphScenarioMatch', 'graphComparison', 'graphStory', 'contextInterpretation',
  'modelingLab',
]);

export const SUPPORTED_QUESTION_TYPES = Object.freeze([...CORE_QUESTION_TYPES, ...MISSING_TOOL_IDS]);

export const validateAssignmentQuestions = (questions, options = {}) => {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('JSON must be a non-empty array of questions.');
  }

  const supportedTypes = new Set(SUPPORTED_QUESTION_TYPES);

  questions.forEach((question, index) => {
    const questionType = question?.toolId || question?.type;
    if (!questionType) throw new Error(`Question ${index + 1} is missing a type/toolId.`);
    if (!supportedTypes.has(questionType)) {
      throw new Error(`Question ${index + 1} uses unsupported type ${questionType}.`);
    }
    if (MISSING_TOOL_IDS.includes(questionType)) {
      const toolValidation = validateToolQuestion({ ...question, toolId: questionType });
      if (!toolValidation.isValid) {
        throw new Error(`Question ${index + 1} (${questionType}) is invalid: ${toolValidation.errors.join(' | ')}`);
      }
    }
    if (questionType === 'modelingLab') {
      if (!question.labDefinition || typeof question.labDefinition !== 'object') throw new Error(`Question ${index + 1} modelingLab is missing labDefinition.`);
      const labDok = Number(question.labDefinition.dokLevel ?? question.dok ?? 3);
      if (![3, 4].includes(labDok)) throw new Error(`Question ${index + 1} modelingLab DOK must be 3 or 4.`);
      if (!Array.isArray(question.labDefinition.parameters) || question.labDefinition.parameters.length === 0) throw new Error(`Question ${index + 1} modelingLab requires at least one parameter.`);
    }
    const rawDok = question?.complexity?.level ?? question?.complexity?.dok ?? question?.standards?.dok ?? question?.dok;
    if (rawDok !== undefined && rawDok !== null && rawDok !== '' && (!Number.isInteger(Number(rawDok)) || Number(rawDok) < 1 || Number(rawDok) > 4)) {
      throw new Error(`Question ${index + 1} has invalid DOK ${rawDok}. Use an integer from 1 through 4.`);
    }
    const rawBand = question?.difficulty?.generatorBand ?? question?.difficulty?.band ?? question?.difficultyBand ?? question?.generatorBand;
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
  });

  return questions;
};
