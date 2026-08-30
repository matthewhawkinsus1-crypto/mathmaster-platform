// Server-safe grading helper for Systems Workspace inequality mode.
//
// The inequalities themselves are public because they ARE the question. The
// server independently checks every piece of student graph construction:
// two points on each boundary, solid/dashed boundary style, shading direction,
// marked test-point reasoning, and/or a feasible candidate point.
//
// This lets A.3D/A.3H assess the TEKS verb "graph" instead of showing a correct
// shaded region and only asking the student to read it.

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

export const expectedBoundaryStyle = (inequality = {}) => (
  String(inequality.relation || '').includes('=') ? 'solid' : 'dashed'
);

export const expectedShadeDirection = (inequality = {}) => (
  String(inequality.relation || '').includes('>') ? 'above' : 'below'
);

const normalizeAsk = (question = {}) => {
  const authored = list(question.ask).map(String);
  if (authored.length) return [...new Set(authored)];
  return question.interaction === 'construct' || question.requireGraphConstruction === true
    ? ['construction']
    : ['testPoint', 'candidate'];
};

const normalizeBoundaryPoints = (raw = {}) => {
  const points = list(raw.points ?? raw.boundaryPoints);
  if (points.length < 2) return [];
  return points.slice(0, 2).map((point) => ({
    x: Number(Array.isArray(point) ? point[0] : point?.x),
    y: Number(Array.isArray(point) ? point[1] : point?.y),
  }));
};

const boundaryPointsAreValid = (inequality, rawConstruction, tolerance = 0.08) => {
  const points = normalizeBoundaryPoints(rawConstruction);
  if (points.length !== 2 || points.some((point) => !finite(point.x) || !finite(point.y))) return false;
  if (Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) <= tolerance) return false;
  return points.every((point) => (
    Math.abs(Number(point.y) - (Number(inequality.m) * Number(point.x) + Number(inequality.b))) <= tolerance
  ));
};

export const buildSystemsInequalityPrivateDefinition = (question = {}) => {
  const inequalities = list(question.inequalities).map(normalizePathLinearInequality)
    .filter((inequality) => Number.isFinite(inequality.m) && Number.isFinite(inequality.b));
  const testPoint = finite(question.testPoint?.x) && finite(question.testPoint?.y)
    ? { x: Number(question.testPoint.x), y: Number(question.testPoint.y) }
    : null;
  const tolerance = Number(question.numericTolerance ?? 1e-8);
  const boundaryTolerance = Number(question.boundaryTolerance ?? 0.08);
  const ask = normalizeAsk(question);
  return {
    mode: 'inequalities',
    inequalities,
    ask,
    testPoint,
    expectedTestPoint: testPoint ? satisfiesPathInequalitySystem(inequalities, testPoint, tolerance) : null,
    tolerance: Number.isFinite(tolerance) && tolerance >= 0 ? tolerance : 1e-8,
    boundaryTolerance: Number.isFinite(boundaryTolerance) && boundaryTolerance >= 0 ? boundaryTolerance : 0.08,
  };
};

export const systemsInequalityDefinitionIsGradable = (definition = {}) => {
  if (definition.mode !== 'inequalities' || list(definition.inequalities).length === 0) return false;
  const ask = list(definition.ask);
  if (!ask.length) return false;
  if (ask.includes('testPoint') && (definition.testPoint == null || typeof definition.expectedTestPoint !== 'boolean')) return false;
  return ask.every((part) => ['construction', 'testPoint', 'candidate'].includes(part));
};

export const validateSystemsInequalityResponse = (raw, definition = null) => {
  const ask = list(definition?.ask).length ? list(definition.ask) : ['testPoint', 'candidate'];

  if (ask.includes('construction')) {
    const construction = list(raw?.construction);
    if (construction.length < list(definition?.inequalities).length) {
      return { valid: false, reason: 'Graph each inequality before checking your work.' };
    }
    for (let index = 0; index < list(definition?.inequalities).length; index += 1) {
      const entry = construction[index] || {};
      const points = normalizeBoundaryPoints(entry);
      if (points.length !== 2 || points.some((point) => !finite(point.x) || !finite(point.y))) {
        return { valid: false, reason: 'Enter two points for every boundary line.' };
      }
      if (!['solid', 'dashed'].includes(String(entry.boundaryStyle || ''))) {
        return { valid: false, reason: 'Choose solid or dashed for every boundary.' };
      }
      if (!['above', 'below'].includes(String(entry.shade || ''))) {
        return { valid: false, reason: 'Choose which side of every boundary to shade.' };
      }
    }
  }

  if (ask.includes('testPoint')) {
    const choice = String(raw?.testChoice || '').toLowerCase();
    if (!['yes', 'no'].includes(choice)) {
      return { valid: false, reason: 'Choose yes or no for the marked test point.' };
    }
  }

  if (ask.includes('candidate') && (!finite(raw?.candidate?.x) || !finite(raw?.candidate?.y))) {
    return { valid: false, reason: 'Enter both coordinates for your feasible point.' };
  }

  return { valid: true, reason: null };
};

export const gradeSystemsInequalityResponse = (definition = {}, raw = {}) => {
  if (!systemsInequalityDefinitionIsGradable(definition)) {
    return { isCorrect: false, score: 0, parts: [], rejected: true, reason: 'ungradable_inequality_definition' };
  }
  const validation = validateSystemsInequalityResponse(raw, definition);
  if (!validation.valid) {
    return { isCorrect: false, score: 0, parts: [], rejected: true, reason: 'malformed_response', detail: validation.reason };
  }

  const parts = [];
  if (definition.ask.includes('construction')) {
    definition.inequalities.forEach((inequality, index) => {
      const entry = list(raw.construction)[index] || {};
      parts.push({
        id: `boundary-${index + 1}`,
        isCorrect: boundaryPointsAreValid(inequality, entry, definition.boundaryTolerance),
      });
      parts.push({
        id: `boundary-style-${index + 1}`,
        isCorrect: String(entry.boundaryStyle) === expectedBoundaryStyle(inequality),
      });
      parts.push({
        id: `shade-${index + 1}`,
        isCorrect: String(entry.shade) === expectedShadeDirection(inequality),
      });
    });
  }

  if (definition.ask.includes('testPoint')) {
    const testAnswer = String(raw.testChoice).toLowerCase() === 'yes';
    parts.push({ id: 'test-point', isCorrect: testAnswer === definition.expectedTestPoint });
  }

  if (definition.ask.includes('candidate')) {
    parts.push({
      id: 'candidate-point',
      isCorrect: satisfiesPathInequalitySystem(definition.inequalities, raw.candidate, definition.tolerance),
    });
  }

  const correctCount = parts.filter((part) => part.isCorrect).length;
  return {
    isCorrect: parts.length > 0 && correctCount === parts.length,
    score: parts.length ? correctCount / parts.length : 0,
    parts,
    rejected: false,
    reason: null,
  };
};

export const sanitizeSystemsInequalityPublicQuestion = (question = {}) => ({
  prompt: String(question.prompt || ''),
  mode: 'inequalities',
  interaction: question.interaction === 'construct' || question.requireGraphConstruction === true ? 'construct' : 'analyze',
  ask: normalizeAsk(question),
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
