const EPS = 1e-9;

const finite = (value) => Number.isFinite(Number(value));

const rowOf = (row = {}) => {
  if (Array.isArray(row)) return row.slice(0, 4).map(Number);
  return [row.a, row.b, row.c, row.d].map(Number);
};

export const cleanMatrix3 = (value = {}) => {
  const rows = Array.isArray(value) ? value : (Array.isArray(value.rows) ? value.rows : []);
  if (rows.length !== 3) return [];
  const cleaned = rows.map(rowOf);
  return cleaned.every((row) => row.length === 4 && row.every(Number.isFinite)) ? cleaned : [];
};

const clone = (matrix) => matrix.map((row) => [...row]);

export const rref3 = (value = {}) => {
  const matrix = cleanMatrix3(value);
  if (!matrix.length) return { type: null, matrix: [] };
  const a = clone(matrix);
  let pivotRow = 0;
  const pivotColumns = [];

  for (let col = 0; col < 3 && pivotRow < 3; col += 1) {
    let best = pivotRow;
    for (let row = pivotRow + 1; row < 3; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[best][col])) best = row;
    }
    if (Math.abs(a[best][col]) <= EPS) continue;
    [a[pivotRow], a[best]] = [a[best], a[pivotRow]];

    const pivot = a[pivotRow][col];
    a[pivotRow] = a[pivotRow].map((entry) => entry / pivot);
    for (let row = 0; row < 3; row += 1) {
      if (row === pivotRow) continue;
      const factor = a[row][col];
      if (Math.abs(factor) <= EPS) continue;
      a[row] = a[row].map((entry, index) => entry - factor * a[pivotRow][index]);
    }
    pivotColumns.push(col);
    pivotRow += 1;
  }

  const normalized = a.map((row) => row.map((entry) => (Math.abs(entry) <= EPS ? 0 : entry)));
  const inconsistent = normalized.some((row) => row.slice(0, 3).every((entry) => Math.abs(entry) <= EPS) && Math.abs(row[3]) > EPS);
  if (inconsistent) return { type: 'none', matrix: normalized };
  if (pivotColumns.length < 3) return { type: 'infinite', matrix: normalized };
  return {
    type: 'one',
    matrix: normalized,
    solution: { x: normalized[0][3], y: normalized[1][3], z: normalized[2][3] },
  };
};

export const applyMatrix3RowOperation = (value = {}, operation = {}) => {
  const matrix = cleanMatrix3(value);
  if (!matrix.length) return null;
  const target = Number(operation.targetRow);
  const source = Number(operation.sourceRow);
  const factor = Number(operation.factor);
  if (![target, source, factor].every(Number.isFinite) || target < 0 || target > 2 || source < 0 || source > 2 || target === source) return null;
  return matrix[target].map((entry, index) => entry - factor * matrix[source][index]);
};

const normalizeRowOperation = (operation = {}) => {
  const targetRow = Number(operation.targetRow);
  const sourceRow = Number(operation.sourceRow);
  const factor = Number(operation.factor);
  return [targetRow, sourceRow, factor].every(Number.isFinite)
    && targetRow >= 0 && targetRow <= 2
    && sourceRow >= 0 && sourceRow <= 2
    && targetRow !== sourceRow
    ? { targetRow, sourceRow, factor }
    : null;
};

export const applyMatrix3RowOperationToMatrix = (value = {}, operation = {}) => {
  const matrix = cleanMatrix3(value);
  const normalized = normalizeRowOperation(operation);
  if (!matrix.length || !normalized) return null;
  const next = clone(matrix);
  next[normalized.targetRow] = applyMatrix3RowOperation({ rows: matrix }, normalized);
  return next;
};

const rowOperationsOf = (question = {}) => {
  const list = Array.isArray(question.rowOperations)
    ? question.rowOperations
    : (question.rowOperation ? [question.rowOperation] : []);
  return list.map(normalizeRowOperation).filter(Boolean);
};

const sameRow = (left, right, tolerance) => {
  const a = rowOf(left);
  const b = rowOf(right);
  return a.length === 4 && b.length === 4
    && a.every((entry, index) => finite(entry) && finite(b[index]) && Math.abs(Number(entry) - Number(b[index])) <= tolerance);
};

const sameMatrix = (left, right, tolerance) => {
  const a = cleanMatrix3({ rows: left });
  const b = cleanMatrix3({ rows: right });
  return a.length === 3 && b.length === 3
    && a.every((row, index) => sameRow(row, b[index], tolerance));
};

export const sanitizeSystemsMatrix3PublicQuestion = (question = {}) => ({
  prompt: String(question.prompt || ''),
  mode: 'matrix3',
  method: ['gaussian', 'rref'].includes(String(question.method)) ? String(question.method) : 'gaussian',
  matrix: {
    rows: cleanMatrix3(question.matrix).map((row) => ({ a: row[0], b: row[1], c: row[2], d: row[3] })),
  },
  ...(rowOperationsOf(question).length ? {
    rowOperations: rowOperationsOf(question),
  } : {}),
  ...(question.context ? { context: question.context } : {}),
});

export const buildSystemsMatrix3PrivateDefinition = (question = {}) => {
  const matrix = cleanMatrix3(question.matrix);
  const solved = rref3({ rows: matrix });
  const method = ['gaussian', 'rref'].includes(String(question.method)) ? String(question.method) : 'gaussian';
  const rowOperations = rowOperationsOf(question);
  let working = matrix;
  const checkpoints = [];
  if (method === 'gaussian') {
    for (const operation of rowOperations) {
      const next = applyMatrix3RowOperationToMatrix({ rows: working }, operation);
      if (!next) break;
      working = next;
      checkpoints.push([...working[operation.targetRow]]);
    }
  }
  return {
    mode: 'matrix3',
    method,
    matrix,
    solved,
    rowOperations,
    checkpoints,
    // Backward-compatible aliases for the first single-step contract.
    rowOperation: rowOperations[0] || null,
    checkpoint: checkpoints[0] || null,
    tolerance: Math.max(1e-8, Math.abs(Number(question.numericTolerance ?? 0.02))),
  };
};

export const systemsMatrix3DefinitionIsGradable = (definition = {}) => (
  definition.mode === 'matrix3'
  && cleanMatrix3({ rows: definition.matrix }).length === 3
  && definition.solved?.type != null
  && (
    definition.method === 'rref'
    || (
      definition.method === 'gaussian'
      && Array.isArray(definition.checkpoints)
      && definition.checkpoints.length > 0
      && definition.checkpoints.every((row) => Array.isArray(row) && row.length === 4)
    )
  )
);

export const validateSystemsMatrix3Response = (raw, definition = {}) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'A 3×3 system response needs the student work.' };
  if (typeof raw.classification !== 'string' || !raw.classification.trim()) return { ok: false, reason: 'Choose how many solutions the 3×3 system has.' };
  if (definition.method === 'gaussian') {
    const supplied = Array.isArray(raw.checkpoints) ? raw.checkpoints : (Array.isArray(raw.checkpoint) ? [raw.checkpoint] : []);
    if (supplied.length !== definition.checkpoints.length) {
      return { ok: false, reason: 'Enter every required Gaussian-elimination row checkpoint.' };
    }
  }
  if (definition.method === 'rref' && !Array.isArray(raw.rref)) return { ok: false, reason: 'Enter the RREF matrix produced by technology.' };
  if (definition.solved?.type === 'one' && ![raw.x, raw.y, raw.z].every(finite)) return { ok: false, reason: 'Enter x, y, and z for the unique solution.' };
  return { ok: true, reason: null };
};

export const gradeSystemsMatrix3Response = (definition = {}, raw = {}) => {
  const tolerance = Number(definition.tolerance ?? 0.02);
  const parts = [
    { id: 'classification', isCorrect: String(raw.classification) === String(definition.solved?.type) },
  ];

  if (definition.method === 'gaussian') {
    const supplied = Array.isArray(raw.checkpoints) ? raw.checkpoints : (Array.isArray(raw.checkpoint) ? [raw.checkpoint] : []);
    definition.checkpoints.forEach((expected, index) => {
      parts.push({
        id: `row-operation-${index + 1}`,
        isCorrect: sameRow(supplied[index], expected, tolerance),
      });
    });
  } else {
    parts.push({ id: 'rref', isCorrect: sameMatrix(raw.rref, definition.solved?.matrix, tolerance) });
  }

  if (definition.solved?.type === 'one') {
    const s = definition.solved.solution || {};
    parts.push({
      id: 'solution',
      isCorrect: [raw.x, raw.y, raw.z].every(finite)
        && Math.abs(Number(raw.x) - Number(s.x)) <= tolerance
        && Math.abs(Number(raw.y) - Number(s.y)) <= tolerance
        && Math.abs(Number(raw.z) - Number(s.z)) <= tolerance,
    });
  }

  const correct = parts.filter((part) => part.isCorrect).length;
  return {
    isCorrect: parts.length > 0 && correct === parts.length,
    score: parts.length ? correct / parts.length : 0,
    parts,
  };
};
