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
// Deliberately self-contained. The server cannot import from the client bundle,
// and a grading rule that exists in two places is a grading rule that will
// eventually disagree with itself. Tests assert these agree with the client's
// own comparisons where both are used.

const UNICODE_MINUS = /[−–—]/g;

export const normalizeAnswer = (value) => String(value ?? '')
  .trim()
  .replace(UNICODE_MINUS, '-')
  .replace(/\\left|\\right/g, '')
  .replace(/\\cdot|\\times/g, '*')
  .replace(/\s+/g, '')
  .toLowerCase();

export const asNumber = (value) => {
  const text = normalizeAnswer(value);
  if (!text) return null;
  const fraction = text.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator === 0 ? null : Number(fraction[1]) / denominator;
  }
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
};

export const sameNumber = (left, right, tolerance = 1e-6) => {
  const a = asNumber(left);
  const b = asNumber(right);
  return a !== null && b !== null && Math.abs(a - b) <= tolerance;
};

export const sameText = (left, right) => normalizeAnswer(left) === normalizeAnswer(right);

export const sameValue = (left, right, tolerance = 1e-6) => (
  sameNumber(left, right, tolerance) || sameText(left, right)
);

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

/** Copy only the named fields, and only when they are actually present. */
export const pick = (source, fields) => {
  const result = {};
  fields.forEach((field) => {
    const value = source?.[field];
    if (value !== undefined && value !== null) result[field] = value;
  });
  return result;
};

const graded = (isCorrect, parts = [], detail = '') => ({
  isCorrect: isCorrect === true,
  score: isCorrect === true ? 1 : 0,
  parts,
  detail,
});

const invalid = (reason) => ({ valid: false, reason });
const valid = () => ({ valid: true, reason: null });

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

  // The Systems Workspace, in its linear mode. The two lines are the question;
  // where they meet is arithmetic the server redoes for itself rather than
  // taking the workspace's word for it.
  //
  // Its other modes (inequalities, linear-quadratic, matrix) collect different
  // work and are not eligible until each has its own grader here.
  systemsWorkspace: {
    serverGradingVersion: 1,
    responseShape: 'orderedPairWithClassification',
    sanitizePublicQuestion: (question) => pick(question, [
      'prompt', 'mode', 'system', 'graph', 'context', 'hint',
    ]),
    buildPrivateGradingDefinition: (question) => ({
      mode: String(question.mode || 'linear'),
      // The same solve the workspace shows, done again where the browser
      // cannot reach it.
      solution: solveTwoLines(question.system),
      tolerance: Number(question.numericTolerance ?? 0.05),
    }),
    validateStudentResponse: (raw) => (
      raw && typeof raw.classification === 'string' && raw.classification.trim() !== ''
        ? valid()
        : invalid('A systems response needs the classification the student chose.')
    ),
    gradeStudentResponse: (definition, raw) => {
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
  intervalNumberLine: {
    serverGradingVersion: 1,
    responseShape: 'intervals',
    sanitizePublicQuestion: (question) => pick(question, [
      'prompt', 'min', 'max', 'step', 'ask', 'notation', 'variable', 'context',
    ]),
    buildPrivateGradingDefinition: (question) => ({
      intervals: list(question.expectedIntervals ?? question.intervals),
      notation: question.expectedNotation ?? question.answer ?? null,
      inequality: question.expectedInequality ?? null,
      ask: list(question.ask).length ? list(question.ask) : ['graph'],
      tolerance: Number(question.numericTolerance ?? 1e-6),
    }),
    validateStudentResponse: (raw) => (
      raw && (Array.isArray(raw.intervals) || typeof raw.notation === 'string')
        ? valid()
        : invalid('A number-line response needs the intervals the student graphed.')
    ),
    gradeStudentResponse: (definition, raw) => {
      const parts = [];
      if (definition.ask.includes('graph') && definition.intervals.length) {
        const given = list(raw.intervals);
        const matches = given.length === definition.intervals.length
          && definition.intervals.every((wanted, index) => {
            const candidate = given[index] || {};
            return sameNumber(candidate.start ?? candidate[0], wanted.start ?? wanted[0], definition.tolerance)
              && sameNumber(candidate.end ?? candidate[1], wanted.end ?? wanted[1], definition.tolerance)
              && Boolean(candidate.startClosed) === Boolean(wanted.startClosed)
              && Boolean(candidate.endClosed) === Boolean(wanted.endClosed);
          });
        parts.push({ id: 'graph', isCorrect: matches });
      }
      if (definition.notation) {
        parts.push({ id: 'notation', isCorrect: sameText(raw.notation, definition.notation) });
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
    serverGradingVersion: 1,
    responseShape: 'graphWork',
    sanitizePublicQuestion: (question) => ({
      ...pick(question, [
        'prompt', 'functionSpec', 'graph', 'studentChoosesX', 'chooseXValues',
        'includeUndefinedChecks', 'undefinedCount', 'showCoordinates', 'context',
      ]),
      // A point task says which x to plot. The y is the answer, and the tool
      // recomputes it from the function the student can already see.
      ...(list(question.pointTasks).length ? {
        pointTasks: list(question.pointTasks).map((task, index) => pick(
          { id: `point-${index + 1}`, ...task },
          ['id', 'label', 'prompt', 'x', 'role'],
        )),
      } : {}),
      // Where each end of the graph is, but not which symbol belongs there.
      ...(list(question.endpointRequirements).length ? {
        endpointRequirements: list(question.endpointRequirements).map((requirement, index) => pick(
          { id: `endpoint-${index + 1}`, ...requirement },
          ['id', 'label', 'point', 'vector'],
        )),
      } : {}),
      ...(analysisRequests(question).length ? {
        analysisParts: analysisRequests(question).map((part, index) => pick(
          { id: `analysis-${index + 1}`, ...part },
          ['id', 'label', 'prompt', 'kind', 'responseMode', 'unit', 'choices'],
        )),
      } : {}),
    }),
    buildPrivateGradingDefinition: (question) => ({
      points: list(question.pointTasks)
        .map((task, index) => ({ id: String(task?.id || `point-${index + 1}`), expected: task?.expected ?? null }))
        .filter((task) => Array.isArray(task.expected) && task.expected.length === 2),
      markers: list(question.endpointRequirements)
        .map((requirement, index) => ({ id: String(requirement?.id || `endpoint-${index + 1}`), marker: requirement?.marker ?? null }))
        .filter((requirement) => requirement.marker != null),
      analysis: analysisRequests(question)
        .map((part, index) => ({
          id: String(part?.id || `analysis-${index + 1}`),
          kind: String(part?.kind || 'text'),
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
        if (part.kind === 'point' && part.expected.length) {
          parts.push({ id: part.id, isCorrect: samePairs(list(raw.selections?.[part.id]), part.expected, definition.tolerance) });
          return;
        }
        const given = raw.answers?.[part.id];
        const candidates = part.accepted.length ? part.accepted : part.expected;
        parts.push({ id: part.id, isCorrect: candidates.some((entry) => sameValue(given, entry, definition.tolerance)) });
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
      answerFields: answerFieldsOf(question).map((part, index) => pick(
        { id: `part-${index + 1}`, ...part },
        ['id', 'label', 'prompt', 'inputProfile', 'unit', 'choices', 'placeholder'],
      )),
    }),
    buildPrivateGradingDefinition: (question) => ({
      parts: answerFieldsOf(question).map((part, index) => ({
        id: String(part?.id || `part-${index + 1}`),
        expected: part?.expected ?? part?.answer ?? null,
        accepted: list(part?.acceptedAnswers),
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
      return definition.solution != null || definition.classification != null;
    case 'systemsWorkspace':
      return definition.mode === 'linear' && definition.solution.type != null;
    case 'relationMapping':
      return definition.arrows.length > 0;
    case 'intervalNumberLine':
      return definition.intervals.length > 0 || definition.notation != null;
    case 'stepAlgebra':
      // Symbolic prompts need marking this server cannot do fairly.
      return definition.symbolicPrompts === 0
        && (definition.expected != null || definition.accepted.length > 0);
    case 'functionInvestigation':
      // Something must have a declared expectation, or there is nothing to mark.
      return definition.points.length > 0 || definition.markers.length > 0 || definition.analysis.length > 0;
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
  const check = contract.validateStudentResponse(raw);
  if (!check.valid) {
    return { ...graded(false), rejected: true, reason: 'malformed_response', detail: check.reason };
  }
  const result = contract.gradeStudentResponse(privateGrading.definition, raw);
  // Belt and braces: whatever the client claimed, the verdict is this one.
  return { isCorrect: result.isCorrect === true, score: result.score, parts: result.parts, rejected: false, reason: null };
};
