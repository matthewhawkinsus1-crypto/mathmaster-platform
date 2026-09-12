const finite = (value) => Number.isFinite(Number(value));

export const cleanRegressionPoints = (points = []) => (Array.isArray(points) ? points : [])
  .map((point) => Array.isArray(point) ? point : [point?.x, point?.y])
  .filter((point) => point.length === 2 && point.every(finite))
  .map(([x, y]) => [Number(x), Number(y)]);

export const regressionCalculatorStats = (points = []) => {
  const clean = cleanRegressionPoints(points);
  if (clean.length < 3) return null;
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const mx = mean(clean.map(([x]) => x));
  const my = mean(clean.map(([, y]) => y));
  const sxx = clean.reduce((sum, [x]) => sum + (x - mx) ** 2, 0);
  const syy = clean.reduce((sum, [, y]) => sum + (y - my) ** 2, 0);
  const sxy = clean.reduce((sum, [x, y]) => sum + (x - mx) * (y - my), 0);
  if (sxx <= 0 || syy <= 0) return null;
  const m = sxy / sxx;
  return { m, b: my - m * mx, r: sxy / Math.sqrt(sxx * syy) };
};

const normalizeSourceMode = (value) => value === 'scatterplot' ? 'scatterplot' : 'data';

const descriptor = (r) => ({
  direction: Math.abs(r) < 0.1 ? 'none' : r > 0 ? 'positive' : 'negative',
  strength: Math.abs(r) >= 0.8 ? 'strong' : Math.abs(r) >= 0.5 ? 'moderate' : Math.abs(r) >= 0.1 ? 'weak' : 'none',
});

const canonicalTable = (points) => cleanRegressionPoints(points)
  .sort(([ax, ay], [bx, by]) => ax - bx || ay - by);

const sameTable = (actual, expected, tolerance = 1e-9) => {
  const rows = canonicalTable(actual);
  const wanted = canonicalTable(expected);
  return rows.length === wanted.length && rows.every((row, index) => (
    row.every((value, coordinate) => Math.abs(value - wanted[index][coordinate]) <= tolerance)
  ));
};

export const sanitizeRegressionCalculatorPublicQuestion = (question = {}) => {
  const sourceGraphBounds = question.sourceGraphBounds && typeof question.sourceGraphBounds === 'object'
    ? Object.fromEntries(['xMin','xMax','yMin','yMax']
      .filter((key) => Number.isFinite(Number(question.sourceGraphBounds[key])))
      .map((key) => [key, Number(question.sourceGraphBounds[key])]))
    : undefined;
  return {
    prompt: String(question.prompt || ''),
    sourceData: cleanRegressionPoints(question.sourceData || question.points),
    sourceMode: normalizeSourceMode(question.sourceMode),
    ...(sourceGraphBounds && Object.keys(sourceGraphBounds).length === 4 ? { sourceGraphBounds } : {}),
    requireInterpretation: question.requireInterpretation !== false,
  };
};

export const buildRegressionCalculatorPrivateDefinition = (question = {}) => {
  const sourceData = cleanRegressionPoints(question.sourceData || question.points);
  return {
    sourceData,
    sourceMode: normalizeSourceMode(question.sourceMode),
    stats: regressionCalculatorStats(sourceData),
    requireInterpretation: question.requireInterpretation !== false,
  };
};

export const regressionCalculatorDefinitionIsGradable = (definition) => Boolean(definition?.stats && definition.sourceData.length >= 3);

export const validateRegressionCalculatorResponse = (raw) => raw && typeof raw === 'object' && !Array.isArray(raw)
  ? { valid: true, reason: null }
  : { valid: false, reason: 'A regression-calculator response needs the table and workflow evidence.' };

export const gradeRegressionCalculatorResponse = (definition, raw = {}) => {
  const table = sameTable(raw.table, definition.sourceData);
  // A run is accepted only when it names the supported operation and carries
  // the exact table snapshot used. A final r or client correctness flag alone
  // cannot manufacture either process stage.
  const run = raw.regressionRun;
  const regression = table && run?.operation === 'linearRegression'
    && sameTable(run.table, definition.sourceData);
  const submittedStats = regression ? regressionCalculatorStats(run.table) : null;
  const producedR = Boolean(submittedStats)
    && finite(run.r) && finite(run.m) && finite(run.b)
    && Math.abs(Number(run.r) - submittedStats.r) <= 0.0005
    && Math.abs(Number(run.m) - submittedStats.m) <= 0.0005
    && Math.abs(Number(run.b) - submittedStats.b) <= 0.0005
    && Math.abs(submittedStats.r - definition.stats.r) <= 0.0005;
  const expected = descriptor(definition.stats.r);
  const interpretation = !definition.requireInterpretation || (
    raw.interpretation?.direction === expected.direction
    && raw.interpretation?.strength === expected.strength
  );
  const parts = [
    { id: definition.sourceMode === 'scatterplot' ? 'graph-to-table' : 'data-entry', isCorrect: table },
    { id: 'linear-regression', isCorrect: regression },
    { id: 'correlation-produced', isCorrect: producedR },
    ...(definition.requireInterpretation ? [{ id: 'interpretation', isCorrect: interpretation }] : []),
  ];
  const correct = parts.filter((part) => part.isCorrect).length;
  return { isCorrect: correct === parts.length, score: correct / parts.length, rejected: false, reason: null, parts };
};
