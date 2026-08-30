// The Path Tool Contract.
//
// A My Math Path question has to do two contradictory things: render the
// authentic MathMaster tool in the student's browser, and be graded somewhere
// the student cannot reach. This file is the seam between them, and it exists
// once — the server loads it, the client imports it, the Teacher Path Simulator
// runs it. A second copy would drift, and a drifted security boundary is worse
// than no boundary.
//
// Each eligible tool declares four things:
//
//   sanitizePublicQuestion(question)      what the browser may see
//   buildPrivateGradingDefinition(q)      what only the server may see
//   validateStudentResponse(raw)          is this shaped like student work
//   gradeStudentResponse(private, raw)    the authoritative verdict
//
// THREE RULES, EACH LEARNED FROM A REAL FAILURE MODE.
//
// 1. ALLOWLIST, NEVER DENYLIST. The public payload is built by naming the
//    fields that may travel, not by copying the question and deleting fields
//    called `answer`. A denylist is one authoring key away from leaking, and
//    the key that leaks is always the one nobody thought of.
//
// 2. THE ALLOWLIST IS PER TOOL. `pairs` is the question for a mapping diagram
//    and the answer for a coordinate plot. There is no field list that is safe
//    for every tool, so there is no shared one.
//
// 3. FAIL CLOSED. A tool with no complete contract is not path-eligible. It is
//    never silently downgraded to a text box — that is how a graphing question
//    becomes "type your answer" without anyone deciding it should.
//
// Some tools have no secret at all: a relation's domain is computable from the
// pairs the student can see. Server grading still matters for those, because
// what is being protected is not the answer's secrecy but the VERDICT'S
// AUTHORITY — the browser must not be able to assert that it was right.

// --- Comparison helpers -------------------------------------------------------
// The browser, Teacher Path Simulator and Cloud Functions all import the same
// scalar/set equivalence rules. This prevents MathLive serialization from
// receiving one verdict in classroom work and another in My Math Path.
import {
  asNumber,
  normalizeAnswer,
  sameNumber,
  sameText,
  sameValue,
} from './answerEquivalence.mjs';

import {
  buildSystemsInequalityPrivateDefinition,
  gradeSystemsInequalityResponse,
  sanitizeSystemsInequalityPublicQuestion,
  systemsInequalityDefinitionIsGradable,
  validateSystemsInequalityResponse,
} from './pathSystemsInequalityGrading.mjs';
import {
  buildDataModelingPrivateDefinition,
  dataModelingDefinitionIsGradable,
  gradeDataModelingResponse,
  sanitizeDataModelingPublicQuestion,
} from './pathDataModelingGrading.mjs';
import {
  buildGraphingPrivateDefinition,
  gradeGraphingResponse,
  graphingDefinitionIsGradable,
  sanitizeGraphingPublicQuestion,
  validateGraphingResponse,
} from './pathGraphingGrading.mjs';

export { asNumber, normalizeAnswer, sameNumber, sameText, sameValue } from './answerEquivalence.mjs';

const UNICODE_MINUS = /[−–—]/g;

export const sameSet = (left = [], right = [], tolerance = 1e-6) => {
  const a = [...left];
  const b = [...right];
  if (a.length !== b.length) return false;
  return b.every((wanted) => {
    const index = a.findIndex((candidate) => sameValue(candidate, wanted, tolerance));
    if (index < 0) return false;
    a.splice(index, 1);
    return true;
  });
};

export const samePairs = (left = [], right = [], tolerance = 1e-6) => {
  // Both sides are normalized first, so a student's [x, y] arrows compare
  // correctly against a stored relation of {x, y} objects and vice versa.
  const a = left.map(orderedPairOf).filter(Boolean);
  const b = right.map(orderedPairOf).filter(Boolean);
  if (a.length !== b.length) return false;
  return b.every((wanted) => {
    const index = a.findIndex((candidate) => sameNumber(candidate[0], wanted[0], tolerance)
      && sameNumber(candidate[1], wanted[1], tolerance));
    if (index < 0) return false;
    a.splice(index, 1);
    return true;
  });
};

const list = (value) => (Array.isArray(value) ? value : []);
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * One ordered pair, from either storage shape.
 *
 * Firestore forbids an array directly inside an array, so relations are stored
 * as `{x, y}`; older authored content used `[x, y]`. Both mean the same pair.
 */
export const orderedPairOf = (pair) => {
  const x = Number(Array.isArray(pair) ? pair[0] : pair?.x);
  const y = Number(Array.isArray(pair) ? pair[1] : pair?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
};

// --- Intervals ------------------------------------------------------------------
//
// The number-line tool emits `{min, max, minClosed, maxClosed}`; the first
// server contract read `{start, end, startClosed, endClosed}`. Same mathematics,
// two vocabularies, and a student whose graph was right was told it was wrong.
//
// Both are normalized here, at the security boundary, so no caller has to know
// which one it was handed. Three further facts this normalization has to carry:
//
//   * JSON has no Infinity. A ray drawn to ±∞ in the browser arrives as null
//     after serialization, so null/undefined MUST read as unbounded, not as 0.
//   * An unbounded end is never closed, whatever the JSON says.
//   * A union is a set. `(-∞, -3] ∪ [4, ∞)` is the same answer whichever piece
//     the student drew first, so both sides are sorted before comparison.
//
// This mirrors `src/tools/intervalNumberLine/intervalMath.js` deliberately: the
// server cannot import the client bundle, and a test asserts the two agree.
const PATH_INFINITY = Number.POSITIVE_INFINITY;

const normalizePathInterval = (raw = {}) => {
  const lowerRaw = raw.min ?? raw.start ?? raw.from ?? raw.lower;
  const upperRaw = raw.max ?? raw.end ?? raw.to ?? raw.upper;
  const lower = lowerRaw === null || lowerRaw === undefined || lowerRaw === '-inf' || lowerRaw === '-∞'
    ? -PATH_INFINITY
    : Number(lowerRaw);
  const upper = upperRaw === null || upperRaw === undefined || upperRaw === 'inf' || upperRaw === '∞'
    ? PATH_INFINITY
    : Number(upperRaw);
  return {
    min: Number.isNaN(lower) ? -PATH_INFINITY : lower,
    max: Number.isNaN(upper) ? PATH_INFINITY : upper,
    minClosed: Number.isFinite(lower) ? Boolean(raw.minClosed ?? raw.startClosed) : false,
    maxClosed: Number.isFinite(upper) ? Boolean(raw.maxClosed ?? raw.endClosed) : false,
  };
};

export const normalizePathIntervals = (raw = []) => list(raw)
  .map(normalizePathInterval)
  .filter((interval) => interval.min <= interval.max)
  .sort((a, b) => a.min - b.min || a.max - b.max);

const samePathEndpoint = (left, right, tolerance = 1e-6) => {
  if (left === right) return true;
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= tolerance;
};

export const samePathIntervals = (left = [], right = [], tolerance = 1e-6) => {
  const a = normalizePathIntervals(left);
  const b = normalizePathIntervals(right);
  if (a.length !== b.length) return false;
  return a.every((interval, index) => {
    const other = b[index];
    return samePathEndpoint(interval.min, other.min, tolerance)
      && samePathEndpoint(interval.max, other.max, tolerance)
      && interval.minClosed === other.minClosed
      && interval.maxClosed === other.maxClosed;
  });
};

const parsePathIntervalNotation = (text) => {
  // The notation box is a MathLive field, so what arrives is LaTeX:
  // `(-\infty, -3] \cup (2, \infty)`. The backslash-prefixed commands have to
  // be resolved BEFORE the bare-word rules, or `\infty` becomes `\∞` — a
  // backslash the endpoint pattern cannot match, which marked every correct
  // unbounded interval wrong while the number line beside it was graded right.
  //
  // Character for character the same normalization as `parseIntervalNotation`
  // in src/tools/intervalNumberLine/intervalMath.js. A test asserts the two
  // agree on every spelling; keep them identical rather than merely equivalent.
  const raw = String(text || '')
    .replace(UNICODE_MINUS, '-')
    .replace(/\\left|\\right/g, '')
    .replace(/\\lbrack/g, '[')
    .replace(/\\rbrack/g, ']')
    .replace(/\\infty/g, '∞')
    .replace(/\\cup/g, '∪')
    .replace(/\\(?:,|;|!|quad|qquad)/g, '')
    .replace(/infinity|infty|inf/gi, '∞')
    .replace(/\bU\b/g, '∪')
    .trim();
  if (!raw) return null;
  const pieces = raw.split('∪').map((piece) => piece.trim()).filter(Boolean);
  if (!pieces.length) return null;

  const parsed = [];
  for (const piece of pieces) {
    const match = piece.match(/^([[(])\s*(-?∞|-?[\d.]+)\s*,\s*(-?∞|-?[\d.]+)\s*([\])])$/);
    if (!match) return null;
    const [, openBracket, lowerText, upperText, closeBracket] = match;
    const min = lowerText.includes('∞') ? (lowerText.startsWith('-') ? -PATH_INFINITY : PATH_INFINITY) : Number(lowerText);
    const max = upperText.includes('∞') ? (upperText.startsWith('-') ? -PATH_INFINITY : PATH_INFINITY) : Number(upperText);
    if (Number.isNaN(min) || Number.isNaN(max)) return null;
    parsed.push({
      min,
      max,
      minClosed: openBracket === '[' && Number.isFinite(min),
      maxClosed: closeBracket === ']' && Number.isFinite(max),
    });
  }
  return normalizePathIntervals(parsed);
};

/**
 * Interval notation, graded as mathematics rather than as a string.
 *
 * `[-3,5)`, `[-3, 5)` and `[-3.0, 5)` are one answer, and a student should not
 * lose a question to a space. Unreadable notation is wrong, never "accepted".
 */
export const pathIntervalNotationMatches = (studentText, expectedIntervals, tolerance = 1e-6) => {
  const parsed = parsePathIntervalNotation(studentText);
  return parsed ? samePathIntervals(parsed, expectedIntervals, tolerance) : false;
};

// Function-investigation analysis parts use the SAME interval notation field as
// the interval-number-line tool, but historically went through scalar
// `sameValue()` grading instead. That made a mathematically correct domain
// such as `(-\\infty,\\infty)` fail against an authored key like
// "all real numbers" or "(-inf,inf)".
//
// Keep the interval semantics here at the shared client/server contract so the
// browser preview, secure Cloud Function verdict, and teacher simulator cannot
// drift again.
const FUNCTION_ANALYSIS_INTERVAL_KINDS = new Set([
  'domain', 'range', 'increasing', 'decreasing', 'constant', 'positive', 'negative',
]);

const normalizeAllRealText = (value) => String(value ?? '')
  .toLowerCase()
  .replace(UNICODE_MINUS, '-')
  .replace(/\\left|\\right/g, '')
  .replace(/\\mathbb\s*\{?r\}?/g, 'r')
  .replace(/ℝ/g, 'r')
  .replace(/[\s_{}]/g, '')
  .replace(/\\(?:,|;|!|quad|qquad)/g, '');

const isAllRealText = (value) => {
  const text = normalizeAllRealText(value);
  return [
    'allrealnumbers',
    'allreals',
    'realnumbers',
    'reals',
    'r',
    'x∈r',
    'xinr',
  ].includes(text);
};

const intervalTextToPathIntervals = (value) => {
  if (isAllRealText(value)) {
    return [{
      min: -PATH_INFINITY,
      max: PATH_INFINITY,
      minClosed: false,
      maxClosed: false,
    }];
  }
  return parsePathIntervalNotation(value);
};

export const pathAnalysisTextMatches = (
  studentText,
  candidates = [],
  { kind = '', notation = '', tolerance = 1e-6 } = {},
) => {
  const resolvedNotation = String(notation || '').trim()
    || (FUNCTION_ANALYSIS_INTERVAL_KINDS.has(String(kind || '')) ? 'interval' : '');

  if (resolvedNotation === 'interval') {
    const studentIntervals = intervalTextToPathIntervals(studentText);
    return list(candidates).some((candidate) => {
      const expectedIntervals = intervalTextToPathIntervals(candidate);
      if (studentIntervals && expectedIntervals) {
        return samePathIntervals(studentIntervals, expectedIntervals, tolerance);
      }
      // "does not exist", "none", and other explicitly authored textual
      // interval answers still need a safe fallback.
      return sameValue(studentText, candidate, tolerance);
    });
  }

  return list(candidates).some((candidate) => sameValue(studentText, candidate, tolerance));
};

/**
 * Can an equation actually be read out of this question?
 *
 * The balance workspace needs one equation with exactly one equals sign, from
 * whichever field the author used. The server has no parser for the tool's AST,
 * so this is deliberately the weaker check — it catches "there is no equation
 * here at all", which is the case that reached students as a crash screen.
 */
export const hasSingleEquation = (question = {}) => {
  if (question.leftExpression && question.rightExpression) return true;
  return [question.equation, question.equationAscii, question.initialEquation, question.equationLatex]
    .some((value) => typeof value === 'string' && value.split('=').length === 2);
};

/** Copy only the named fields, and only when they are actually present. */
export const pick = (source, fields) => {
  const result = {};
  fields.forEach((field) => {
    const value = source?.[field];
    if (value !== undefined && value !== null) result[field] = value;
  });
  return result;
};

// A function-investigation may need a visible table as the SOURCE of the graph.
// Do not pass an arbitrary stimulus object through the secure tool boundary:
// an authoring-only key could contain an answer. A2.2B needs only the table
// shape, so allowlist that shape field by field and normalize rows to the same
// Firestore-safe { cells: [...] } form the generic Path sanitizer uses.
const sanitizeFunctionInvestigationTableStimulus = (stimulus) => {
  if (!isObject(stimulus) || !isObject(stimulus.table)) return null;
  const cellsForRow = (row) => (
    Array.isArray(row) ? row : (Array.isArray(row?.cells) ? row.cells : [])
  );
  const headers = list(stimulus.table.headers)
    .slice(0, 8)
    .map((value) => String(value).slice(0, 200));
  const rows = list(stimulus.table.rows)
    .slice(0, 20)
    .map((row) => ({
      cells: cellsForRow(row).slice(0, 8).map((value) => String(value).slice(0, 200)),
    }));

  if (!headers.length && !rows.length) return null;
  return {
    kind: 'table',
    ...(stimulus.title ? { title: String(stimulus.title).slice(0, 140) } : {}),
    ...(stimulus.note ? { note: String(stimulus.note).slice(0, 300) } : {}),
    table: { headers, rows },
  };
};

const graded = (isCorrect, parts = [], detail = '') => ({
  isCorrect: isCorrect === true,
  score: isCorrect === true ? 1 : 0,
  parts,
  detail,
});

const invalid = (reason) => ({ valid: false, reason });
const valid = () => ({ valid: true, reason: null });

// --- Inverse reflection experience -------------------------------------------
//
// A graph-based inverse question should complete the representation chain:
// original points -> original graph -> reflection across y=x -> inverse graph
// -> inverse equation.  The public configuration describes the work but never
// sends the reflected coordinates or inverse equation.
//
// The explicit inverseReflection object is the canonical authoring contract.
// The inferred branch upgrades the already-live Algebra II family at issue
// time, so students do not have to wait for a full bank reseed.

const inverseReflectionCue = (part) => {
  const id = String(part?.id || '').toLowerCase();
  const language = String((part?.label || '') + ' ' + (part?.prompt || '')).toLowerCase();
  return id === 'inverse' || /\binverse\s+point\b/.test(language);
};

const inverseEquationForLinearSpec = (spec = {}) => {
  const type = String(spec?.type || '');
  const m = Number(spec?.m ?? spec?.a);
  const b = Number(spec?.b ?? spec?.k ?? 0);
  if (!['linear', 'line'].includes(type) || !Number.isFinite(m) || Math.abs(m) <= 1e-12 || !Number.isFinite(b)) return null;
  return 'f^-1(x)=(x-(' + b + '))/' + m;
};

const resolveFunctionInvestigationInverseReflection = (question = {}) => {
  const explicit = isObject(question?.inverseReflection) && question.inverseReflection.enabled !== false
    ? question.inverseReflection
    : null;
  const authoredAnalysis = analysisRequests(question);
  const cue = authoredAnalysis.find(inverseReflectionCue) || null;
  const gradablePointTasks = list(question?.pointTasks)
    .map((task, index) => ({ ...task, id: String(task?.id || ('point-' + (index + 1))) }))
    .filter((task) => Array.isArray(task?.expected) && task.expected.length === 2);

  const inferred = !explicit
    && ['linear', 'line'].includes(String(question?.functionSpec?.type || ''))
    && gradablePointTasks.length >= 2
    && Boolean(cue);

  if (!explicit && !inferred) return null;

  const requestedIds = list(explicit?.sourceTaskIds).map(String).filter(Boolean);
  const sourceTasks = (requestedIds.length
    ? requestedIds.map((id) => gradablePointTasks.find((task) => task.id === id)).filter(Boolean)
    : gradablePointTasks.slice(0, 2));

  if (sourceTasks.length < 2) return null;

  const requireEquation = explicit?.requireInverseEquation !== false;
  const expectedEquation = explicit?.expectedEquation
    ?? (requireEquation ? inverseEquationForLinearSpec(question?.functionSpec) : null);
  if (requireEquation && !expectedEquation) return null;

  const consumeAnalysisId = String(explicit?.consumeAnalysisId || cue?.id || '').trim() || null;
  const equationPartId = String(explicit?.equationPartId || 'inverse-equation');

  return {
    consumeAnalysisId,
    sourceTasks,
    expectedEquation,
    publicConfig: {
      enabled: true,
      sourceTaskIds: sourceTasks.map((task) => task.id),
      showReferenceLine: explicit?.showReferenceLine !== false,
      requireReflectedPoints: true,
      requireInverseSketch: explicit?.requireInverseSketch !== false,
      requireInverseEquation: requireEquation,
      equationPartId,
      equationLabel: String(explicit?.equationLabel || 'Write the equation of the inverse function.'),
      inverseLineLabel: String(explicit?.inverseLineLabel || 'Draw the inverse through both reflected points.'),
    },
  };
};

const expandedFunctionInvestigationAnalysisRequests = (question = {}) => {
  const inverse = resolveFunctionInvestigationInverseReflection(question);
  const authored = analysisRequests(question);
  if (!inverse) return authored;

  const retained = inverse.consumeAnalysisId
    ? authored.filter((part) => String(part?.id || '') !== inverse.consumeAnalysisId)
    : authored;

  const reflectedPointParts = inverse.sourceTasks.map((task, index) => ({
    id: 'inverse-reflect-' + task.id,
    label: 'Reflect plotted point ' + (index + 1) + ' across $y=x$.',
    prompt: 'Place the image of plotted point ' + (index + 1) + ' after reflection across $y=x$.',
    kind: 'inversePoint',
    sourceTaskId: task.id,
    responseMode: 'click',
    expected: [[Number(task.expected[1]), Number(task.expected[0])]],
  }));

  const equationPart = inverse.publicConfig.requireInverseEquation ? [{
    id: inverse.publicConfig.equationPartId,
    label: inverse.publicConfig.equationLabel,
    kind: 'value',
    responseMode: 'text',
    notation: 'equation',
    expected: [inverse.expectedEquation],
  }] : [];

  return [...retained, ...reflectedPointParts, ...equationPart];
};

const enhancedInverseReflectionPrompt = (question = {}, inverse = null) => {
  const original = String(question?.prompt || '').trim();
  if (!inverse) return original;
  if (/reflect\s+both\s+plotted\s+points\s+across/i.test(original)) return original;
  const replacement = 'Then reflect both plotted points across $y=x$, draw $f^{-1}$ on the same coordinate plane, and write the equation of the inverse.';
  if (/Then\s+give\s+the\s+inverse\s+point[\s\S]*$/i.test(original)) {
    return original.replace(/Then\s+give\s+the\s+inverse\s+point[\s\S]*$/i, replacement);
  }
  return (original + ' ' + replacement).trim();
};

// --- The tools ----------------------------------------------------------------

const CONTRACTS = {
  // Solve an equation. The equation is the question; its solution is not.
  algebra: {
    serverGradingVersion: 1,
    responseShape: 'value',
    sanitizePublicQuestion: (question) => pick(question, [
      'prompt', 'equationLatex', 'equationAscii', 'variable', 'solveFor',
      'targetForm', 'objective', 'workspaceDifficulty', 'graph', 'context',
    ]),
    buildPrivateGradingDefinition: (question) => ({
      expected: question.answer ?? question.expected ?? null,
      accepted: list(question.acceptedAnswers),
      tolerance: Number(question.numericTolerance ?? 1e-6),
    }),
    validateStudentResponse: (raw) => (
      raw && typeof raw.value === 'string' && raw.value.trim() !== ''
        ? valid()
        : invalid('An algebra response needs the value the student entered.')
    ),
    gradeStudentResponse: (definition, raw) => {
      const candidates = [definition.expected, ...definition.accepted].filter((entry) => entry !== null && entry !== undefined);
      const isCorrect = candidates.some((entry) => sameValue(raw.value, entry, definition.tolerance));
      return graded(isCorrect, [{ id: 'value', isCorrect }]);
    },
  },

  // A system of equations. The equations are public; where they meet is not.
  system: {
    serverGradingVersion: 1,
    responseShape: 'orderedPair',
    sanitizePublicQuestion: (question) => pick(question, [
      'prompt', 'equationsLatex', 'equations', 'graph', 'context', 'solutionMethod',
    ]),
    buildPrivateGradingDefinition: (question) => ({
      // The intersection, and the classification when the question asks for one.
      solution: question.answer ?? question.solution ?? null,
      classification: question.classification ?? null,
      accepted: list(question.acceptedAnswers),
      tolerance: Number(question.numericTolerance ?? 1e-6),
    }),
    validateStudentResponse: (raw) => {
      if (!raw) return invalid('A systems response is missing.');
      const hasPoint = Number.isFinite(Number(raw.x)) && Number.isFinite(Number(raw.y));
      const hasText = typeof raw.value === 'string' && raw.value.trim() !== '';
      const hasClass = typeof raw.classification === 'string' && raw.classification.trim() !== '';
      return hasPoint || hasText || hasClass ? valid() : invalid('A systems response needs the intersection the student found.');
    },
    gradeStudentResponse: (definition, raw) => {
      const parts = [];
      let allCorrect = true;

      if (definition.solution != null) {
        const expected = parseOrderedPair(definition.solution);
        const given = Number.isFinite(Number(raw.x)) && Number.isFinite(Number(raw.y))
          ? [Number(raw.x), Number(raw.y)]
          : parseOrderedPair(raw.value);
        const pointCorrect = Boolean(expected && given)
          && Math.abs(expected[0] - given[0]) <= definition.tolerance
          && Math.abs(expected[1] - given[1]) <= definition.tolerance;
        parts.push({ id: 'solution', isCorrect: pointCorrect });
        allCorrect = allCorrect && pointCorrect;
      }

      if (definition.classification) {
        const classCorrect = sameText(raw.classification, definition.classification);
        parts.push({ id: 'classification', isCorrect: classCorrect });
        allCorrect = allCorrect && classCorrect;
      }

      return graded(parts.length > 0 && allCorrect, parts);
    },
  },

  // The Systems Workspace has two Path-safe modes.
  //
  // Linear mode re-solves the two equations server-side. Inequality mode keeps
  // the graph data public because it IS the question, but recomputes the marked
  // test point and the student's candidate point server-side. Other workspace
  // modes remain fail-closed until they receive equally explicit contracts.
  systemsWorkspace: {
    serverGradingVersion: 2,
    responseShape: 'systemsWorkspace',
    sanitizePublicQuestion: (question) => (
      String(question.mode || 'linear') === 'inequalities'
        ? sanitizeSystemsInequalityPublicQuestion(question)
        : pick(question, ['prompt', 'mode', 'system', 'graph', 'context', 'hint'])
    ),
    buildPrivateGradingDefinition: (question) => (
      String(question.mode || 'linear') === 'inequalities'
        ? buildSystemsInequalityPrivateDefinition(question)
        : {
          mode: 'linear',
          // The same solve the workspace shows, done again where the browser
          // cannot reach it.
          solution: solveTwoLines(question.system),
          tolerance: Number(question.numericTolerance ?? 0.05),
        }
    ),
    validateStudentResponse: (raw, definition) => {
      // The grader is selected from the server-held definition, never from a
      // client-sent mode flag. Inequality validation also needs that definition
      // because a construction task requires different fields from a legacy
      // test-point task.
      if (definition?.mode === 'inequalities') {
        return validateSystemsInequalityResponse(raw, definition);
      }
      return raw && typeof raw.classification === 'string' && raw.classification.trim() !== ''
        ? valid()
        : invalid('A systems response needs the classification or feasible-region work the student produced.');
    },
    gradeStudentResponse: (definition, raw) => {
      if (definition.mode === 'inequalities') {
        return gradeSystemsInequalityResponse(definition, raw);
      }
      const { solution, tolerance } = definition;
      const parts = [{ id: 'classification', isCorrect: sameText(raw.classification, solution.type) }];
      if (solution.type === 'one') {
        parts.push({
          id: 'solution',
          isCorrect: sameNumber(raw.x, solution.x, tolerance) && sameNumber(raw.y, solution.y, tolerance),
        });
      }
      return graded(parts.every((part) => part.isCorrect), parts);
    },
  },

  // Data Modeling Lab. The points and requested mode are public; regression
  // coefficients, correlation, tolerances and the best-model verdict are
  // recomputed/stored only on the server. The registry tool submits its raw
  // student work directly, so there is no browser-side correctness authority.
  dataModelingLab: {
    serverGradingVersion: 1,
    responseShape: 'dataModeling',
    sanitizePublicQuestion: sanitizeDataModelingPublicQuestion,
    buildPrivateGradingDefinition: buildDataModelingPrivateDefinition,
    validateStudentResponse: (raw) => (
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? valid()
        : invalid('A data-modeling response needs the work the student entered in the lab.')
    ),
    gradeStudentResponse: (definition, raw) => gradeDataModelingResponse(definition, raw),
  },

  // Graphing2 constructs a line from conditions such as standard form,
  // point-slope form, two given points, or a vertical/horizontal equation.
  // Those conditions are the public question; the server independently rebuilds
  // the target line and ignores the browser's claimed studentLine/verdict.
  graphing2: {
    serverGradingVersion: 1,
    responseShape: 'graphingConstruction',
    sanitizePublicQuestion: sanitizeGraphingPublicQuestion,
    buildPrivateGradingDefinition: buildGraphingPrivateDefinition,
    validateStudentResponse: validateGraphingResponse,
    gradeStudentResponse: gradeGraphingResponse,
  },

  // Plot a relation, or read one. The pairs are the question here.
  relationMapping: {
    serverGradingVersion: 1,
    responseShape: 'relation',
    // No secret in the pairs — a student can see the relation and work its
    // domain out. What the server protects is the verdict, not the data.
    sanitizePublicQuestion: (question) => pick(question, [
      'prompt', 'pairs', 'domainLabel', 'rangeLabel', 'ask', 'context',
    ]),
    buildPrivateGradingDefinition: (question) => {
      // Firestore cannot nest an array inside an array, so a relation is stored
      // as {x, y} objects. Older content used [x, y]. Both are the same
      // relation, and the grader must not care which one it was given — reading
      // only `pair[0]` silently produced NaN domains for every stored question.
      const pairs = list(question.pairs).map(orderedPairOf).filter(Boolean);
      const xs = [...new Set(pairs.map((pair) => pair[0]))];
      const ys = [...new Set(pairs.map((pair) => pair[1]))];
      const seen = new Map();
      const isFunction = pairs.every(([x, y]) => {
        if (!seen.has(x)) { seen.set(x, y); return true; }
        return seen.get(x) === y;
      });
      return {
        ask: list(question.ask).length ? list(question.ask) : ['mapping', 'domain', 'range'],
        arrows: pairs,
        domain: xs,
        range: ys,
        isFunction,
      };
    },
    validateStudentResponse: (raw) => (
      raw && (Array.isArray(raw.arrows) || Array.isArray(raw.domain) || Array.isArray(raw.range) || typeof raw.isFunction === 'string' || typeof raw.isFunction === 'boolean')
        ? valid()
        : invalid('A relation response needs the arrows, sets or classification the student produced.')
    ),
    gradeStudentResponse: (definition, raw) => {
      const parts = [];
      if (definition.ask.includes('mapping')) {
        parts.push({ id: 'mapping', isCorrect: samePairs(list(raw.arrows), definition.arrows) });
      }
      if (definition.ask.includes('domain')) {
        parts.push({ id: 'domain', isCorrect: sameSet(list(raw.domain), definition.domain) });
      }
      if (definition.ask.includes('range')) {
        parts.push({ id: 'range', isCorrect: sameSet(list(raw.range), definition.range) });
      }
      if (definition.ask.includes('isFunction')) {
        const answered = typeof raw.isFunction === 'boolean'
          ? raw.isFunction
          : ['yes', 'true'].includes(normalizeAnswer(raw.isFunction));
        parts.push({ id: 'isFunction', isCorrect: answered === definition.isFunction });
      }
      return graded(parts.length > 0 && parts.every((part) => part.isCorrect), parts);
    },
  },

  // Graph an interval or a compound inequality on a number line.
  //
  // Version 2. Version 1 read `{start, end, startClosed, endClosed}` while the
  // browser tool has always emitted `{min, max, minClosed, maxClosed}`, and
  // graded the ask stage `notation` while the authoring contract and the tool
  // both call it `interval`. The result was that a correct number-line graph
  // could be marked wrong in server-graded My Math Path, and the notation stage
  // was never graded at all. Both vocabularies are accepted from here on, so
  // content authored against either one keeps working.
  intervalNumberLine: {
    serverGradingVersion: 2,
    responseShape: 'intervals',
    sanitizePublicQuestion: (question) => pick(question, [
      'prompt', 'min', 'max', 'step', 'ask', 'variable', 'context', 'inequalityText',
    ]),
    buildPrivateGradingDefinition: (question) => ({
      intervals: normalizePathIntervals(question.expectedIntervals ?? question.intervals),
      notation: question.expectedNotation ?? question.answer ?? null,
      inequality: question.expectedInequality ?? null,
      ask: list(question.ask).length ? list(question.ask) : ['graph'],
      tolerance: Number(question.numericTolerance ?? 1e-6),
    }),
    validateStudentResponse: (raw) => (
      raw && (Array.isArray(raw.intervals) || typeof raw.notation === 'string')
        ? valid()
        : invalid('A number-line response needs the intervals the student graphed and the notation the question asked for.')
    ),
    gradeStudentResponse: (definition, raw) => {
      const parts = [];
      if (definition.ask.includes('graph')) {
        // An empty key cannot mark anything correct: with nothing to compare
        // against, the graph stage fails rather than passing by default.
        parts.push({
          id: 'graph',
          isCorrect: definition.intervals.length > 0
            && samePathIntervals(raw.intervals, definition.intervals, definition.tolerance),
        });
      }
      // `interval` is the live ask-stage name; `notation` is the legacy one.
      if (definition.ask.includes('interval') || definition.ask.includes('notation')) {
        parts.push({
          id: 'notation',
          isCorrect: definition.intervals.length > 0
            ? pathIntervalNotationMatches(raw.notation, definition.intervals, definition.tolerance)
            : definition.notation != null && sameText(raw.notation, definition.notation),
        });
      }
      if (definition.ask.includes('inequality') && definition.inequality != null) {
        parts.push({ id: 'inequality', isCorrect: sameText(raw.inequality, definition.inequality) });
      }
      return graded(parts.length > 0 && parts.every((part) => part.isCorrect), parts);
    },
  },

  // The balance workspace. The student rearranges the equation by legal moves;
  // what is graded is where they ended up.
  //
  // Only equations are eligible. A question that also asks for typed algebraic
  // expressions (`algebraPrompts`) needs symbolic equivalence to be marked
  // fairly — `2(x+1)` and `2x+2` are the same answer — and the server has no
  // computer-algebra system. Marking those by string comparison would fail
  // students for writing a correct answer a different way, so the question is
  // not path-eligible instead.
  stepAlgebra: {
    serverGradingVersion: 1,
    responseShape: 'finalEquation',
    sanitizePublicQuestion: (question) => pick(question, [
      'prompt', 'equationLatex', 'equation', 'variable', 'objective', 'targetForm',
      'workspaceDifficulty', 'supportLevel', 'allowedOperations', 'context', 'graph',
    ]),
    buildPrivateGradingDefinition: (question) => ({
      expected: question.answer ?? question.solution ?? question.expected ?? null,
      accepted: list(question.acceptedAnswers),
      variable: String(question.variable || question.objective?.variable || 'x'),
      // Present means "this question needs symbolic marking", which disqualifies it.
      symbolicPrompts: list(question.algebraPrompts).length,
      // The workspace cannot be built without an equation to put on the
      // balance, and a question the tool cannot render is a question that must
      // not be issued — having an answer key is not enough.
      hasEquation: hasSingleEquation(question),
      tolerance: Number(question.numericTolerance ?? 1e-6),
    }),
    validateStudentResponse: (raw) => {
      const hasEquation = typeof raw?.finalEquation === 'string' && raw.finalEquation.trim() !== '';
      const hasValue = raw?.value !== undefined && String(raw.value).trim() !== '';
      return hasEquation || hasValue ? valid() : invalid('A workspace response needs the equation the student finished with.');
    },
    gradeStudentResponse: (definition, raw) => {
      const isolated = isolatedValue(raw.finalEquation, definition.variable);
      const given = isolated ?? raw.value;
      const candidates = [definition.expected, ...definition.accepted]
        .filter((entry) => entry !== null && entry !== undefined)
        .map((entry) => isolatedValue(entry, definition.variable) ?? entry);
      const isCorrect = candidates.some((entry) => sameValue(given, entry, definition.tolerance));
      return graded(isCorrect, [{ id: 'algebra-objective', isCorrect }]);
    },
  },

  // Graph a given function, then answer questions about it.
  //
  // Nothing here is secret: the student is handed the function and asked to
  // draw it, so every expectation is derivable from what they can see. What the
  // server protects is the verdict — the browser must not be able to assert
  // that a curve was placed correctly.
  //
  // The freehand curve is deliberately NOT graded here. "Snapped" is a claim the
  // workspace makes about its own strokes, and re-deriving it server-side would
  // mean shipping the sampler and the whole snapping heuristic. Grading it from
  // the client's own boolean would be exactly the thing this file exists to
  // prevent, so the curve stays a construction aid and the graded parts are the
  // ones with declared expectations.
  functionInvestigation: {
    serverGradingVersion: 2,
    responseShape: 'graphWork',
    sanitizePublicQuestion: (question) => {
      const inverse = resolveFunctionInvestigationInverseReflection(question);
      const publicQuestion = pick(
        { ...question, prompt: enhancedInverseReflectionPrompt(question, inverse) },
        [
          'prompt', 'functionSpec', 'graph', 'studentChoosesX', 'chooseXValues',
          'includeUndefinedChecks', 'undefinedCount', 'showCoordinates', 'context',
        ],
      );

      const tableStimulus = sanitizeFunctionInvestigationTableStimulus(question.stimulus);
      if (tableStimulus) publicQuestion.stimulus = tableStimulus;

      if (inverse) publicQuestion.inverseReflection = inverse.publicConfig;

      if (list(question.pointTasks).length) {
        publicQuestion.pointTasks = list(question.pointTasks).map((task, index) => pick(
          { id: 'point-' + (index + 1), ...task },
          ['id', 'label', 'prompt', 'x', 'role'],
        ));
      }

      if (list(question.endpointRequirements).length) {
        publicQuestion.endpointRequirements = list(question.endpointRequirements).map((requirement, index) => pick(
          { id: 'endpoint-' + (index + 1), ...requirement },
          ['id', 'label', 'point', 'vector'],
        ));
      }

      const publicAnalysis = expandedFunctionInvestigationAnalysisRequests(question);
      if (publicAnalysis.length) {
        publicQuestion.analysisRequests = publicAnalysis.map((part, index) => pick(
          { id: 'analysis-' + (index + 1), ...part },
          ['id', 'label', 'prompt', 'kind', 'responseMode', 'unit', 'choices', 'notation', 'allowNone', 'sourceTaskId'],
        ));
      }

      return publicQuestion;
    },
    buildPrivateGradingDefinition: (question) => ({
      points: list(question.pointTasks)
        .map((task, index) => ({ id: String(task?.id || `point-${index + 1}`), expected: task?.expected ?? null }))
        .filter((task) => Array.isArray(task.expected) && task.expected.length === 2),
      markers: list(question.endpointRequirements)
        .map((requirement, index) => ({ id: String(requirement?.id || `endpoint-${index + 1}`), marker: requirement?.marker ?? null }))
        .filter((requirement) => requirement.marker != null),
      analysis: expandedFunctionInvestigationAnalysisRequests(question)
        .map((part, index) => ({
          id: String(part?.id || `analysis-${index + 1}`),
          kind: String(part?.kind || 'text'),
          notation: String(
            part?.notation
            || (FUNCTION_ANALYSIS_INTERVAL_KINDS.has(String(part?.kind || '')) ? 'interval' : ''),
          ),
          renderable: analysisKindIsRenderable(part),
          expected: list(part?.expected),
          accepted: list(part?.acceptedAnswers),
        }))
        .filter((part) => part.expected.length > 0 || part.accepted.length > 0),
      tolerance: Number(question.numericTolerance ?? 0.28),
    }),
    validateStudentResponse: (raw) => (
      raw && (isObject(raw.placements) || isObject(raw.markerPlacements) || isObject(raw.answers) || isObject(raw.selections))
        ? valid()
        : invalid('A graphing response needs the points, symbols or answers the student produced.')
    ),
    gradeStudentResponse: (definition, raw) => {
      const parts = [];
      definition.points.forEach((task) => {
        const placed = raw.placements?.[task.id];
        parts.push({
          id: task.id,
          isCorrect: Array.isArray(placed)
            && sameNumber(placed[0], task.expected[0], definition.tolerance)
            && sameNumber(placed[1], task.expected[1], definition.tolerance),
        });
      });
      definition.markers.forEach((requirement) => {
        const placement = raw.markerPlacements?.[requirement.id];
        const chosen = typeof placement === 'string' ? placement : placement?.marker;
        parts.push({ id: `${requirement.id}-type`, isCorrect: sameText(chosen, requirement.marker) });
      });
      definition.analysis.forEach((part) => {
        if (['point', 'inversePoint'].includes(part.kind) && part.expected.length) {
          parts.push({ id: part.id, isCorrect: samePairs(list(raw.selections?.[part.id]), part.expected, definition.tolerance) });
          return;
        }
        const given = raw.answers?.[part.id];
        const candidates = part.accepted.length ? part.accepted : part.expected;
        parts.push({
          id: part.id,
          isCorrect: pathAnalysisTextMatches(given, candidates, {
            kind: part.kind,
            notation: part.notation,
            tolerance: definition.tolerance,
          }),
        });
      });
      const correct = parts.filter((part) => part.isCorrect).length;
      const result = graded(parts.length > 0 && correct === parts.length, parts);
      return { ...result, score: parts.length ? correct / parts.length : 0 };
    },
  },

  // A multi-part question: several response fields, each graded on its own.
  multiAnswer: {
    serverGradingVersion: 1,
    responseShape: 'fields',
    // `answerFields` is what MultiAnswerGrader renders from; `parts` is the
    // older authoring name for the same list.
    sanitizePublicQuestion: (question) => ({
      ...pick(question, ['prompt', 'context', 'graph', 'table', 'mathDisplay']),
      // Each field's prompt and input profile travel; its expected value does not.
      answerFields: answerFieldsOf(question).map((part, index) => {
        const safe = pick(
          { id: `part-${index + 1}`, ...part },
          ['id', 'label', 'prompt', 'type', 'inputMode', 'inputProfile', 'toolProfile', 'notation', 'unit', 'placeholder'],
        );
        // `choices` and `options` are the list the student picks FROM, so they
        // travel — but only as the labels the dropdown renders. Copying them
        // whole would re-open the denylist hole this file exists to close: an
        // author writing `options: [{ label: 'discrete', correct: true }]`
        // would have shipped the answer key to the browser inside a field the
        // allowlist had just admitted. An allowlist that admits an unbounded
        // object is not an allowlist.
        ['choices', 'options'].forEach((field) => {
          if (!Array.isArray(part?.[field])) return;
          safe[field] = part[field].map((option) => (
            option && typeof option === 'object' ? String(option.label ?? option.value ?? option.id ?? '') : String(option)
          )).filter(Boolean);
        });
        return safe;
      }),
    }),
    buildPrivateGradingDefinition: (question) => ({
      parts: answerFieldsOf(question).map((part, index) => ({
        id: String(part?.id || `part-${index + 1}`),
        expected: part?.expected ?? part?.answer ?? null,
        accepted: [...list(part?.accepted), ...list(part?.acceptedAnswers)],
        tolerance: Number(part?.numericTolerance ?? question.numericTolerance ?? 1e-6),
      })),
    }),
    validateStudentResponse: (raw) => (
      raw && isObject(raw.responses)
        ? valid()
        : invalid('A multi-part response needs one entry per part.')
    ),
    gradeStudentResponse: (definition, raw) => {
      const parts = definition.parts.map((part) => {
        const given = raw.responses?.[part.id];
        const candidates = [part.expected, ...part.accepted].filter((entry) => entry !== null && entry !== undefined);
        return { id: part.id, isCorrect: candidates.some((entry) => sameValue(given, entry, part.tolerance)) };
      });
      // Partial credit is real here, but the question is correct only when
      // every part is.
      const correct = parts.filter((part) => part.isCorrect).length;
      const result = graded(parts.length > 0 && correct === parts.length, parts);
      return { ...result, score: parts.length ? correct / parts.length : 0 };
    },
  },
};

/**
 * Where two lines meet.
 *
 * Deliberately the same arithmetic as the workspace's own `solveTwoLines`, done
 * server-side. This is the one place a duplicated rule is correct: the server
 * must not be able to be told the answer by the thing it is checking.
 */
const solveTwoLines = (system) => {
  const a = Number(system?.m1);
  const c = Number(system?.b1);
  const b = Number(system?.m2);
  const d = Number(system?.b2);
  if (![a, b, c, d].every((value) => Number.isFinite(value))) return { type: null };
  if (Math.abs(a - b) <= 1e-9) return { type: Math.abs(c - d) <= 1e-9 ? 'infinite' : 'none' };
  const x = (d - c) / (a - b);
  return { type: 'one', x, y: a * x + c };
};

/** The response fields of a multi-part question, under either authoring name. */
const answerFieldsOf = (question) => (
  list(question?.answerFields).length ? list(question.answerFields) : list(question?.parts)
);

/** The analysis questions attached to a graphing item, under either authoring name. */
const analysisRequests = (question) => (
  list(question?.analysisParts).length ? list(question.analysisParts) : list(question?.analysisRequests)
);

// The analysis kinds the graphing workspace actually renders. Mirrors
// `src/analysisRequestCatalog.js`, which the server cannot import; a test
// asserts the two lists are identical.
//
// Why this is a security-boundary concern and not authoring trivia: an
// unrecognised kind does not fail in the tool, it silently becomes a
// click-a-point task. The server would then grade a typed `answers` entry that
// the student was never given a box for, and mark it wrong every time.
// What an analysis part is ASKING FOR.
//
// `value` is the one most graph questions actually are: a single answer typed
// as text — a slope, a rate, an intercept, the equation of an asymptote, the
// word "downward". Before it existed the only kinds available were interval
// questions, so every short-answer part in the bank was filed under
// `increasing` or `decreasing` because those were on the allowed list. The
// field passed validation and meant nothing, and the student paid for it: the
// workspace picks the keypad from the kind, so "What is the slope of this
// line?" was answered on a keypad of ( ) [ ] ∞ ∪.
export const PATH_ANALYSIS_NOTATION_KINDS = Object.freeze([
  'value', 'domain', 'range', 'increasing', 'decreasing', 'constant', 'positive', 'negative',
]);

// The kinds whose answer is genuinely an interval or an inequality, and so
// genuinely want the interval keypad. Everything else is a `value`.
export const PATH_ANALYSIS_INTERVAL_KINDS = Object.freeze([
  'domain', 'range', 'increasing', 'decreasing', 'constant', 'positive', 'negative',
]);

/**
 * Which answer keypad an analysis part should be given.
 *
 * Lives beside the kinds rather than in the workspace because it is the same
 * decision: what this part is asking for. An explicit `notation` from the
 * author wins; otherwise the kind decides, and only the kinds whose answer
 * really is an interval get the interval pad. The old rule was "interval unless
 * the author said otherwise", and authors almost never said otherwise.
 */
export const analysisKeypadProfile = (part) => {
  const notation = String(part?.notation || '');
  if (notation === 'equation') return 'equation';
  if (notation === 'inequality') return 'inequality';
  if (notation === 'set') return 'set';
  if (notation === 'interval') return 'interval';
  return PATH_ANALYSIS_INTERVAL_KINDS.includes(String(part?.kind || '')) ? 'interval' : 'basic';
};
export const PATH_ANALYSIS_POINT_FEATURES = Object.freeze([
  'xIntercepts', 'yIntercept', 'vertex', 'localMaximum', 'localMinimum', 'center',
]);

const analysisKindIsRenderable = (part) => {
  const kind = String(part?.kind || '');
  if (PATH_ANALYSIS_NOTATION_KINDS.includes(kind)) return true;
  if (kind === 'inversePoint') return Boolean(String(part?.sourceTaskId || '').trim());
  return kind === 'point' && PATH_ANALYSIS_POINT_FEATURES.includes(String(part?.feature || ''));
};

/**
 * The value on the far side of `x = …`.
 *
 * The balance workspace finishes with an equation, not a number, and the
 * authored answer may be written either way.
 */
const isolatedValue = (value, variable = 'x') => {
  const text = String(value ?? '').trim();
  if (!text.includes('=')) return null;
  const [left, right] = text.split('=').map((side) => normalizeAnswer(side));
  const target = normalizeAnswer(variable);
  if (left === target) return right;
  if (right === target) return left;
  return null;
};

const parseOrderedPair = (value) => {
  if (Array.isArray(value) && value.length === 2) {
    const x = asNumber(value[0]);
    const y = asNumber(value[1]);
    return x === null || y === null ? null : [x, y];
  }
  const text = normalizeAnswer(value).replace(/^[([]/, '').replace(/[)\]]$/, '');
  const parts = text.split(',');
  if (parts.length !== 2) return null;
  const x = asNumber(parts[0]);
  const y = asNumber(parts[1]);
  return x === null || y === null ? null : [x, y];
};

// --- The public surface --------------------------------------------------------

export const PATH_TOOL_IDS = Object.freeze(Object.keys(CONTRACTS));

// Authoring names that mean the same tool. `functionGraph` and
// `functionInvestigation` are the same workspace in two modes, and one contract
// covers both rather than two contracts drifting apart.
//
// `literal` is deliberately NOT aliased here even though it can render on the
// same workspace: solving a formula for one of its letters produces an
// expression, and marking an expression needs symbolic equivalence the server
// does not have.
const TOOL_ALIASES = Object.freeze({
  functionGraph: 'functionInvestigation',
  // Existing authoring uses the shorter semantic name while the shared tool
  // registry renders the component under dataModelingLab. Resolve once here so
  // the server, simulator and browser all agree on the canonical Path tool id.
  dataModeling: 'dataModelingLab',
});

export const getPathToolContract = (toolId) => CONTRACTS[TOOL_ALIASES[toolId] || toolId] || null;

/**
 * Which tool grades this question, from the question itself.
 *
 * Never from anything the browser sends: the grader is chosen from what the
 * server stored when it issued the question.
 */
export const resolvePathToolId = (question) => {
  const explicit = String(question?.pathToolId || question?.toolId || question?.type || '').trim();
  const resolved = TOOL_ALIASES[explicit] || explicit;
  return CONTRACTS[resolved] ? resolved : null;
};

/**
 * Can this question be issued on a path?
 *
 * A tool without a contract is not eligible, and the caller is expected to skip
 * it rather than render it some other way.
 */
export const isPathEligible = (question) => {
  const toolId = resolvePathToolId(question);
  if (!toolId) return false;
  const contract = CONTRACTS[toolId];
  const definition = contract.buildPrivateGradingDefinition(question);
  return hasGradableDefinition(toolId, definition);
};

export const hasGradableDefinition = (toolId, definition) => {
  switch (toolId) {
    case 'algebra':
      return definition.expected != null || definition.accepted.length > 0;
    case 'system':
      // The systems GRADER collects an ordered pair and nothing else — it has
      // no control for classifying a system. So a `system` question that also
      // declares a classification asks for something the student is never shown
      // a way to answer, and would be marked wrong on it every time. That
      // question belongs to `systemsWorkspace`, which does collect one.
      return definition.solution != null && definition.classification == null;
    case 'systemsWorkspace':
      return definition.mode === 'linear'
        ? definition.solution.type != null
        : definition.mode === 'inequalities' && systemsInequalityDefinitionIsGradable(definition);
    case 'dataModelingLab':
      return dataModelingDefinitionIsGradable(definition);
    case 'graphing2':
      return graphingDefinitionIsGradable(definition);
    case 'relationMapping':
      return definition.arrows.length > 0;
    case 'intervalNumberLine':
      return definition.intervals.length > 0 || definition.notation != null;
    case 'stepAlgebra':
      // Symbolic prompts need marking this server cannot do fairly.
      return definition.symbolicPrompts === 0
        && definition.hasEquation
        && (definition.expected != null || definition.accepted.length > 0);
    case 'functionInvestigation':
      // Something must have a declared expectation, or there is nothing to
      // mark — and every analysis part must be one the workspace can actually
      // put in front of the student, or it would be marked wrong unanswerably.
      return definition.analysis.every((part) => part.renderable)
        && (definition.points.length > 0 || definition.markers.length > 0 || definition.analysis.length > 0);
    case 'multiAnswer':
      return definition.parts.length > 0
        && definition.parts.every((part) => part.expected != null || part.accepted.length > 0);
    default:
      return false;
  }
};

/**
 * The payload the browser is allowed to have.
 *
 * Returns null for an ineligible tool, and the caller must treat that as "do
 * not issue this question" rather than as "issue it some other way".
 */
export const buildPublicToolPayload = (question) => {
  const toolId = resolvePathToolId(question);
  if (!toolId) return null;
  const contract = CONTRACTS[toolId];
  const definition = contract.buildPrivateGradingDefinition(question);
  if (!hasGradableDefinition(toolId, definition)) return null;
  return {
    pathToolId: toolId,
    serverGradingVersion: contract.serverGradingVersion,
    responseShape: contract.responseShape,
    // The tool's own student-visible configuration, by allowlist.
    tool: contract.sanitizePublicQuestion(question),
  };
};

export const buildPrivateToolGrading = (question) => {
  const toolId = resolvePathToolId(question);
  if (!toolId) return null;
  return { pathToolId: toolId, definition: CONTRACTS[toolId].buildPrivateGradingDefinition(question) };
};

/**
 * Grade raw student work.
 *
 * `privateGrading` came from the session the SERVER stored. `raw` is whatever
 * the browser sent, and it is treated as untrusted throughout: any correctness
 * the client attached is ignored rather than merged.
 */
export const gradePathResponse = ({ privateGrading, raw }) => {
  const toolId = privateGrading?.pathToolId;
  const contract = toolId ? CONTRACTS[toolId] : null;
  if (!contract) {
    return { ...graded(false), rejected: true, reason: 'no_server_grader_for_this_tool' };
  }
  const check = contract.validateStudentResponse(raw, privateGrading.definition);
  if (!check.valid) {
    return { ...graded(false), rejected: true, reason: 'malformed_response', detail: check.reason };
  }
  const result = contract.gradeStudentResponse(privateGrading.definition, raw);
  // Belt and braces: whatever the client claimed, the verdict is this one.
  return { isCorrect: result.isCorrect === true, score: result.score, parts: result.parts, rejected: false, reason: null };
};
