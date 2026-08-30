// Server-safe grading helper for Systems Workspace inequality mode.
//
// This deliberately mirrors the student-facing SystemsWorkspace inequality
// experience without trusting the browser's correctness claim. The browser is
// allowed to see the inequalities, graph bounds, and marked test point because
// those ARE the question. The server recomputes whether the marked point and
// the student's candidate point satisfy every inequality.

const list = (value) => (Array.isArray(value) ? value : []);
const finite = (value) => Number.isFinite(Number(value));

export const normalizePathLinearInequality = (raw = {}) => ({
  m: Number(raw.m ?? 0),
  b: Number(raw.b ?? 0),
  relation: ['>', '>=', '<', '<='].includes(String(raw.relation || ''))
    ? String(raw.relation)
    : '>=',
});

export const satisfiesPathLinearInequality = (inequality = {}, x, y, tolerance = 1e-8) => {
  if (!finite(x) || !finite(y)) return false;
  const normalized = normalizePathLinearInequality(inequality);
  if (!Number.isFinite(normalized.m) || !Number.isFinite(normalized.b)) return false;
  const lhs = Number(y);
  const rhs = normalized.m * Number(x) + normalized.b;
  switch (normalized.relation) {
    case '>': return lhs > rhs + tolerance;
    case '>=': return lhs >= rhs - tolerance;
    case '<': return lhs < rhs - tolerance;
    case '<=': return lhs <= rhs + tolerance;
    default: return false;
  }
};

export const satisfiesPathInequalitySystem = (inequalities = [], point = {}, tolerance = 1e-8) => {
  const normalized = list(inequalities).map(normalizePathLinearInequality);
  if (!normalized.length || !finite(point?.x) || !finite(point?.y)) return false;
  return normalized.every((inequality) => satisfiesPathLinearInequality(inequality, point.x, point.y, tolerance));
};

export const buildSystemsInequalityPrivateDefinition = (question = {}) => {
  const inequalities = list(question.inequalities).map(normalizePathLinearInequality)
    .filter((inequality) => Number.isFinite(inequality.m) && Number.isFinite(inequality.b));
  const testPoint = finite(question.testPoint?.x) && finite(question.testPoint?.y)
    ? { x: Number(question.testPoint.x), y: Number(question.testPoint.y) }
    : null;
  const tolerance = Number(question.numericTolerance ?? 1e-8);
  return {
    mode: 'inequalities',
    inequalities,
    testPoint,
    expectedTestPoint: testPoint ? satisfiesPathInequalitySystem(inequalities, testPoint, tolerance) : null,
    tolerance: Number.isFinite(tolerance) && tolerance >= 0 ? tolerance : 1e-8,
  };
};

export const systemsInequalityDefinitionIsGradable = (definition = {}) => (
  definition.mode === 'inequalities'
  && list(definition.inequalities).length > 0
  && definition.testPoint != null
  && typeof definition.expectedTestPoint === 'boolean'
);

export const validateSystemsInequalityResponse = (raw) => {
  const choice = String(raw?.testChoice || '').toLowerCase();
  if (!['yes', 'no'].includes(choice)) {
    return { valid: false, reason: 'Choose yes or no for the marked test point.' };
  }
  if (!finite(raw?.candidate?.x) || !finite(raw?.candidate?.y)) {
    return { valid: false, reason: 'Enter both coordinates for your feasible point.' };
  }
  return { valid: true, reason: null };
};

export const gradeSystemsInequalityResponse = (definition = {}, raw = {}) => {
  if (!systemsInequalityDefinitionIsGradable(definition)) {
    return { isCorrect: false, score: 0, parts: [], rejected: true, reason: 'ungradable_inequality_definition' };
  }
  const validation = validateSystemsInequalityResponse(raw);
  if (!validation.valid) {
    return { isCorrect: false, score: 0, parts: [], rejected: true, reason: 'malformed_response', detail: validation.reason };
  }

  const candidateFeasible = satisfiesPathInequalitySystem(
    definition.inequalities,
    raw.candidate,
    definition.tolerance,
  );
  const testAnswer = String(raw.testChoice).toLowerCase() === 'yes';
  const testCorrect = testAnswer === definition.expectedTestPoint;
  const parts = [
    { id: 'test-point', isCorrect: testCorrect },
    { id: 'candidate-point', isCorrect: candidateFeasible },
  ];
  const correctCount = parts.filter((part) => part.isCorrect).length;
  return {
    isCorrect: correctCount === parts.length,
    score: correctCount / parts.length,
    parts,
    rejected: false,
    reason: null,
  };
};

export const sanitizeSystemsInequalityPublicQuestion = (question = {}) => ({
  prompt: String(question.prompt || ''),
  mode: 'inequalities',
  inequalities: list(question.inequalities).map(normalizePathLinearInequality),
  testPoint: finite(question.testPoint?.x) && finite(question.testPoint?.y)
    ? { x: Number(question.testPoint.x), y: Number(question.testPoint.y) }
    : null,
  graph: question.graph && typeof question.graph === 'object'
    ? {
      xMin: finite(question.graph.xMin) ? Number(question.graph.xMin) : -6,
      xMax: finite(question.graph.xMax) ? Number(question.graph.xMax) : 8,
      yMin: finite(question.graph.yMin) ? Number(question.graph.yMin) : -4,
      yMax: finite(question.graph.yMax) ? Number(question.graph.yMax) : 10,
    }
    : { xMin: -6, xMax: 8, yMin: -4, yMax: 10 },
  ...(question.context && typeof question.context === 'object' ? { context: question.context } : {}),
});
