import { normalizeQuestionStandards } from './questionMetadata.js';
import { getTexasStandard } from './texasStandards.js';
import { MISSING_TOOL_IDS, validateToolQuestion } from './tools/toolSchemas.js';
import { compileAuthoringIntentV5 } from './platform/contract/authoringIntentV5.js';
import { flattenV5Sections } from './platform/contract/assignmentSchemaV5.js';
import { looksLikeFiniteSetNotation } from '../functions/shared/answerEquivalence.mjs';

export const DEFAULT_ASSIGNMENT_BLUEPRINT = `{
  "schemaVersion": 5,
  "assignment": {
    "title": "Algebra I — Sample Lesson",
    "courseId": "algebra1",
    "folder": "Algebra I/Sample",
    "instructionalPurpose": "lesson",
    "gradingPurpose": "classwork"
  },
  "variantPolicy": {
    "mode": "personalized",
    "sectionModes": {
      "warmup": "shared",
      "classwork": "shared",
      "practice": "personalized",
      "dol": "shared"
    }
  },
  "outputProfiles": {
    "digital": { "enabled": true },
    "studentWorksheetPdf": { "enabled": true, "includeWorkspace": true },
    "lessonNotesPdf": { "enabled": true, "targetPages": 2 }
  },
  "sections": [
    {
      "role": "classwork",
      "title": "Classwork",
      "questions": [
        {
          "standard": "A.5A",
          "prompt": "Solve 3x + 6 = 21.",
          "studentActions": ["solveStepByStep"],
          "equation": "3x+6=21",
          "dok": 1,
          "difficultyBand": 3
        }
      ]
    }
  ]
}`;

export const MATH_BLUEPRINT_GUIDE = `MATHMASTER ASSIGNMENT V5 — CANONICAL

MathMaster accepts one assignment format: schemaVersion 5.
V4/V3/V2 packages and raw question arrays are intentionally unsupported and may be deleted.

TOP LEVEL
{
  "schemaVersion": 5,
  "assignment": {
    "title": "Functions — Lesson 1",
    "courseId": "algebra1",
    "folder": "Algebra I/Module 1/Functions",
    "instructionalPurpose": "lesson",
    "gradingPurpose": "classwork"
  },
  "variantPolicy": {
    "mode": "personalized",
    "sectionModes": {
      "warmup": "shared",
      "classwork": "shared",
      "practice": "personalized",
      "dol": "shared"
    }
  },
  "sections": [
    {
      "role": "classwork",
      "title": "Classwork",
      "questions": []
    }
  ]
}

VALID SECTION ROLES
warmup, classwork, practice, dol, quiz, test

AUTHORING RULE
Questions describe mathematical intent and studentActions. Do not author React component names, toolId, renderer type, viewport bounds, Firestore fields, attempt counters, or other platform-owned runtime state. MathMaster chooses the internal renderer.

CORE POLICY GROUPS
variantPolicy — shared/personalized/adaptive delivery and per-section modes.
differentiationPolicy — bounded rigor and adaptation rules.
supportPolicy — inherit student supports; accommodations do not silently change the standard.
toolPolicy — calculator/keyboard/tool availability.
deliveryPolicy — section access and gating.
gradingPolicy — grading behavior.
evidencePolicy — whether work contributes to grade/mastery/recommendations/analytics.
outputProfiles — digital, printable worksheet, notes PDF, future teacher key/answer key.
classroomIntegration — Google Classroom publishing intent.
provenance — content/generator/grader release metadata.
preflight — teacher review requirements.

PDF OUTPUT
The same resolved questions power digital delivery and printable student worksheets. Do not maintain a separate PDF question bank. studentWorksheetPdf is supported now. teacherWorksheetPdf and answerKeyPdf remain disabled until their dedicated key/solution renderers are finished.

DOK AND DIFFICULTY
dok is 1–4 and measures cognitive complexity.
difficultyBand is 1–5 and measures instructional difficulty.
They are not interchangeable.

CCMR
Use explicit alignments and assessmentContext for digitalSAT, ACT, TSIA2, or ASVAB content. Exam-style items must preserve the assessment's authentic language/register and allowed domain overlap.

EXPECTED ANSWERS
Generated questions must derive the expected answer from the same generator parameters that create the prompt. Do not pad accepted answers with formatting variants already handled by semantic/equivalence grading.
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
    throw new Error('Assignment V5 JSON is empty. Paste one schemaVersion 5 assignment object.');
  }

  normalizedText = stripOuterCodeFence(normalizedText, repairs);
  normalizedText = extractJsonPayload(normalizedText, repairs);
  normalizedText = replacePythonLiteralsOutsideStrings(normalizedText, repairs);

  // Runs whether or not the text parses: "\\le" throws, but "\\frac" parses into
  // a formfeed and silently corrupts the prompt, so both need the same pass.
  normalizedText = escapeStrayBackslashesInStrings(normalizedText, repairs);

  try {
    const source = JSON.parse(normalizedText);
    if (Array.isArray(source)) {
      throw new Error('Assignment V5 does not accept raw question arrays. Create one schemaVersion 5 object with sections[].');
    }
    if (!source || typeof source !== 'object') {
      throw new Error('Assignment V5 must be one JSON object.');
    }
    const sourceSchemaVersion = Number(source.schemaVersion) || null;
    if (sourceSchemaVersion !== 5) {
      throw new Error(`Assignment V5 is the only supported assignment format. Received schemaVersion ${sourceSchemaVersion ?? 'missing'}; V4 and earlier test assignments may be discarded.`);
    }

    const compiledV5 = compileAuthoringIntentV5(source);
    const parsed = compiledV5.package;
    repairs.push(...compiledV5.repairs);

    const questions = normalizeQuestionStorageShapes(flattenV5Sections(parsed), repairs);
    if (questions.length === 0) {
      throw new Error('Assignment V5 contains no questions.');
    }

    return {
      assignmentV5: parsed,
      questions,
      sourceSchemaVersion: 5,
      normalizedText: JSON.stringify(parsed, null, 2),
      repairs,
      warnings: compiledV5.warnings || [],
    };
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    const detail = describeJsonParseError(error, normalizedText);
    throw new Error(
      `${detail} Paste one valid MathMaster Assignment V5 JSON object. JSON uses lowercase true, false, and null.`,
    );
  }
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
