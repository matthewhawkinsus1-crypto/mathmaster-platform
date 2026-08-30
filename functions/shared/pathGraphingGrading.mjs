// Server-safe grading for Graphing2.
//
// Graphing2 is a construction tool: the student supplies two plotted points and
// the browser draws the line through them. The conditions defining the target
// line are the question and may be public; the authoritative verdict is
// recomputed here from the student's two points.
//
// This intentionally mirrors src/tools/graphing2/graphingMath.js without
// importing browser code into Cloud Functions. Parity tests lock the two copies
// together.

const finite = (value) => Number.isFinite(Number(value));
const list = (value) => (Array.isArray(value) ? value : []);
const nearlyEqual = (left, right, tolerance = 1e-9) => (
  finite(left) && finite(right) && Math.abs(Number(left) - Number(right)) <= tolerance
);
const round = (value, places = 8) => {
  const factor = 10 ** places;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

export const pathLineFromPoints = (first, second, tolerance = 1e-9) => {
  if (!Array.isArray(first) || !Array.isArray(second) || first.length !== 2 || second.length !== 2) return null;
  const [x1, y1] = first.map(Number);
  const [x2, y2] = second.map(Number);
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  if (nearlyEqual(x1, x2, tolerance) && nearlyEqual(y1, y2, tolerance)) return null;
  if (nearlyEqual(x1, x2, tolerance)) return { kind: 'vertical', x: round((x1 + x2) / 2, 6) };
  const m = (y2 - y1) / (x2 - x1);
  return { kind: 'slopeIntercept', m: round(m, 8), b: round(y1 - m * x1, 8) };
};

export const pathLineFromStandard = ({ A, B, C } = {}) => {
  const a = Number(A);
  const b = Number(B);
  const c = Number(C);
  if (![a, b, c].every(Number.isFinite) || (nearlyEqual(a, 0) && nearlyEqual(b, 0))) return null;
  if (nearlyEqual(b, 0)) return { kind: 'vertical', x: round(c / a, 8) };
  return { kind: 'slopeIntercept', m: round(-a / b, 8), b: round(c / b, 8) };
};

export const pathTargetLineFromQuestion = (question = {}) => {
  const mode = String(question.mode || 'slopeIntercept');
  if (mode === 'throughPoints') return pathLineFromPoints(question.givenPoints?.[0], question.givenPoints?.[1]);
  if (mode === 'pointSlope') {
    const point = question.point || [0, 0];
    const m = Number(question.slope);
    if (!Array.isArray(point) || point.length !== 2 || !Number.isFinite(m)
        || !point.map(Number).every(Number.isFinite)) return null;
    return { kind: 'slopeIntercept', m, b: round(Number(point[1]) - m * Number(point[0]), 8) };
  }
  if (mode === 'standardForm') return pathLineFromStandard(question.standard);
  if (mode === 'verticalHorizontal') {
    const value = Number(question.value);
    if (!Number.isFinite(value)) return null;
    return question.orientation === 'vertical'
      ? { kind: 'vertical', x: value }
      : { kind: 'slopeIntercept', m: 0, b: value };
  }
  const line = question.line || {};
  if (finite(line.x)) return { kind: 'vertical', x: Number(line.x) };
  return finite(line.m) && finite(line.b)
    ? { kind: 'slopeIntercept', m: Number(line.m), b: Number(line.b) }
    : null;
};

export const pathLinesEquivalent = (left, right, tolerance = 0.08) => {
  if (!left || !right || left.kind !== right.kind) return false;
  if (left.kind === 'vertical') return nearlyEqual(left.x, right.x, tolerance);
  return nearlyEqual(left.m, right.m, tolerance)
    && nearlyEqual(left.b, right.b, tolerance * 2);
};

export const pathPointOnLine = (line, point, tolerance = 0.12) => {
  if (!line || !Array.isArray(point) || point.length !== 2) return false;
  const [x, y] = point.map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (line.kind === 'vertical') return nearlyEqual(x, line.x, tolerance);
  return nearlyEqual(y, Number(line.m) * x + Number(line.b), tolerance);
};

export const buildGraphingPrivateDefinition = (question = {}) => ({
  mode: String(question.mode || 'slopeIntercept'),
  target: pathTargetLineFromQuestion(question),
  tolerance: finite(question.tolerance) ? Math.abs(Number(question.tolerance)) : 0.12,
});

export const graphingDefinitionIsGradable = (definition = {}) => (
  ['vertical', 'slopeIntercept'].includes(String(definition.target?.kind || ''))
  && finite(definition.tolerance)
);

export const validateGraphingResponse = (raw = {}) => {
  const points = list(raw.points);
  if (points.length < 2) return { valid: false, reason: 'Plot two different points before checking the line.' };
  if (!points.slice(0, 2).every((point) => (
    Array.isArray(point) && point.length === 2 && point.every(finite)
  ))) {
    return { valid: false, reason: 'Each plotted point needs a finite x- and y-coordinate.' };
  }
  if (!pathLineFromPoints(points[0], points[1])) {
    return { valid: false, reason: 'Two different points are required to define a line.' };
  }
  return { valid: true, reason: null };
};

export const gradeGraphingResponse = (definition = {}, raw = {}) => {
  if (!graphingDefinitionIsGradable(definition)) {
    return { isCorrect: false, score: 0, parts: [], rejected: true, reason: 'ungradable_graphing_definition' };
  }
  const validation = validateGraphingResponse(raw);
  if (!validation.valid) {
    return { isCorrect: false, score: 0, parts: [], rejected: true, reason: 'malformed_response', detail: validation.reason };
  }

  const points = raw.points.slice(0, 2);
  const studentLine = pathLineFromPoints(points[0], points[1]);
  const pointChecks = points.map((point) => pathPointOnLine(definition.target, point, definition.tolerance));
  const lineCorrect = pathLinesEquivalent(studentLine, definition.target, definition.tolerance);
  const parts = [
    { id: 'point-1', isCorrect: pointChecks[0] },
    { id: 'point-2', isCorrect: pointChecks[1] },
    { id: 'constructed-line', isCorrect: lineCorrect },
  ];
  const correctCount = parts.filter((part) => part.isCorrect).length;
  return {
    isCorrect: lineCorrect,
    score: lineCorrect ? 1 : correctCount / parts.length,
    parts,
    rejected: false,
    reason: null,
  };
};

const safePoint = (point) => (
  Array.isArray(point) && point.length === 2 && point.every(finite)
    ? [Number(point[0]), Number(point[1])]
    : null
);

export const sanitizeGraphingPublicQuestion = (question = {}) => {
  const mode = String(question.mode || 'slopeIntercept');
  const publicQuestion = {
    prompt: String(question.prompt || ''),
    mode,
    ...(question.graphBounds && typeof question.graphBounds === 'object'
      ? { graphBounds: question.graphBounds }
      : {}),
    ...(finite(question.snapStep) ? { snapStep: Number(question.snapStep) } : {}),
    ...(question.context && typeof question.context === 'object' ? { context: question.context } : {}),
  };

  if (mode === 'throughPoints') {
    publicQuestion.givenPoints = list(question.givenPoints).map(safePoint).filter(Boolean);
  } else if (mode === 'pointSlope') {
    const point = safePoint(question.point);
    if (point) publicQuestion.point = point;
    if (finite(question.slope)) publicQuestion.slope = Number(question.slope);
  } else if (mode === 'standardForm') {
    const standard = question.standard || {};
    publicQuestion.standard = {
      A: Number(standard.A),
      B: Number(standard.B),
      C: Number(standard.C),
    };
  } else if (mode === 'verticalHorizontal') {
    publicQuestion.orientation = question.orientation === 'vertical' ? 'vertical' : 'horizontal';
    if (finite(question.value)) publicQuestion.value = Number(question.value);
  } else {
    const line = question.line || {};
    publicQuestion.line = finite(line.x)
      ? { x: Number(line.x) }
      : { m: Number(line.m), b: Number(line.b) };
  }

  return publicQuestion;
};
