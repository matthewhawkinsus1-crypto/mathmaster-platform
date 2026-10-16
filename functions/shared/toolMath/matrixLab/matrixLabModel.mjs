/*
 * MATRIX LAB — WHAT ONE QUESTION ASKS, READ ONCE.
 *
 * The browser tool, the shared grader and Pre-Flight all read a question
 * through `readMatrixLabQuestion`, so "which matrix is A", "what is this
 * system's coefficient matrix" and "what does the calculator have loaded" have
 * one answer. Every key is DERIVED from the question's givens — the product
 * from the two matrices, the matrix equation and solution from the equations —
 * so there is no authored answer to disagree with the mathematics.
 *
 * Pure: no React, no DOM.
 */
import {
  MATRIX_ERRORS,
  SOLUTION_TYPES,
  addMatrices,
  asWrittenReading,
  classifySystem,
  dimensionsOf,
  equal,
  formatEquation,
  formatRational,
  inverseMatrix,
  isIdentity,
  isZero,
  matrixRowsOf,
  multiplyMatrices,
  parseCell,
  parseLinearEquation,
  parseMatrix,
  productDimensions,
  rational,
  rowMultipleOf,
  sub,
  systemMatrices,
  toNumber,
} from './matrixMath.mjs';

export const MATRIX_LAB_MODES = Object.freeze(['locate', 'operate', 'equation', 'solve', 'completeSystem']);
export const MATRIX_CALCULATOR_OPERATIONS = Object.freeze(['multiply', 'add', 'inverse', 'inverseTimes']);

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value) => String(value ?? '');
const list = (value) => (Array.isArray(value) ? value : []);

const DEFAULT_VARIABLES = Object.freeze(['x', 'y', 'z']);

/* ---------------------------------------------------------------------------
 * Matrices as authored.
 * ------------------------------------------------------------------------- */

const labelList = (value, length) => {
  const labels = list(value).map((label) => text(label).trim());
  return labels.length === length ? labels : null;
};

/**
 * One authored matrix → { name, rows (as authored text), values (exact),
 * rowLabels, colLabels, rowTitle, colTitle, dims }. `values` is null when a
 * cell is not a number — Pre-Flight refuses that question.
 */
export const readAuthoredMatrix = (name, spec) => {
  const source = Array.isArray(spec) ? { rows: spec } : (isObject(spec) ? spec : {});
  const rows = matrixRowsOf(source).map((row) => row.map((cell) => text(cell).trim()));
  const values = parseMatrix(rows);
  const dims = values ? dimensionsOf(values) : { rows: rows.length, cols: rows[0]?.length || 0 };
  return {
    name: text(name),
    rows,
    values,
    dims,
    rowLabels: labelList(source.rowLabels, dims.rows),
    colLabels: labelList(source.colLabels, dims.cols),
    rowTitle: text(source.rowTitle).trim() || null,
    colTitle: text(source.colTitle).trim() || null,
    caption: text(source.caption).trim() || null,
  };
};

export const readAuthoredMatrices = (question = {}) => {
  const source = isObject(question.matrices) ? question.matrices : {};
  return Object.fromEntries(Object.entries(source).map(([name, spec]) => [name, readAuthoredMatrix(name, spec)]));
};

/** a₃₄ for matrix A, row 3, column 4 — the lesson's element notation. */
const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';
export const subscript = (value) => text(value).replace(/\d/g, (digit) => SUBSCRIPT_DIGITS[Number(digit)]);
export const elementNotation = (matrixName, row, col) => `${text(matrixName).toLowerCase() || 'a'}${subscript(row)}${subscript(col)}`;

/* ---------------------------------------------------------------------------
 * The question.
 * ------------------------------------------------------------------------- */

const readMode = (question) => {
  const mode = text(question.mode).trim();
  return MATRIX_LAB_MODES.includes(mode) ? mode : 'operate';
};

const readVariables = (question) => {
  const variables = list(question.variables).map((variable) => text(variable).trim()).filter((variable) => /^[A-Za-z]$/.test(variable));
  return variables.length >= 2 ? variables : [...DEFAULT_VARIABLES];
};

const DEFAULT_TECHNOLOGY = Object.freeze({
  locate: [],
  operate: [],
  equation: [],
  solve: ['inverse', 'inverseTimes'],
  completeSystem: ['inverse', 'inverseTimes'],
});

const readTechnology = (question, mode) => {
  if (question.technology === false) return [];
  const authored = isObject(question.technology) ? list(question.technology.operations) : null;
  const operations = (authored || DEFAULT_TECHNOLOGY[mode]).map((operation) => text(operation).trim());
  return MATRIX_CALCULATOR_OPERATIONS.filter((operation) => operations.includes(operation));
};

const readTargets = (question, matrix) => list(question.targets).map((target, index) => {
  const row = Math.floor(Number(target?.row));
  const col = Math.floor(Number(target?.col));
  const kind = text(target?.kind).trim() === 'notation' ? 'notation' : 'tap';
  return {
    id: text(target?.id).trim() || `target-${index + 1}`,
    kind,
    row,
    col,
    description: text(target?.description).trim(),
    valid: Number.isInteger(row) && Number.isInteger(col) && row >= 1 && col >= 1
      && Boolean(matrix?.values) && row <= matrix.dims.rows && col <= matrix.dims.cols,
  };
});

const readCompletionTargets = (question) => list(question.targets).map((target, index) => ({
  id: text(target?.id).trim() || `target-${index + 1}`,
  classification: [SOLUTION_TYPES.ONE, SOLUTION_TYPES.NONE, SOLUTION_TYPES.MANY].includes(text(target?.classification).trim())
    ? text(target.classification).trim()
    : null,
  label: text(target?.label).trim(),
}));

/**
 * Everything the lab and its grader need to know about one question.
 */
export const readMatrixLabQuestion = (question = {}) => {
  const q = isObject(question) ? question : {};
  const mode = readMode(q);
  const matrices = readAuthoredMatrices(q);
  const names = Object.keys(matrices);
  const variables = readVariables(q);
  const equations = list(q.equations).map((equation) => text(equation).trim()).filter(Boolean);
  const technology = readTechnology(q, mode);
  const base = { mode, matrices, names, variables, equations, technology };

  if (mode === 'locate') {
    const matrixName = names.includes(text(q.matrix)) ? text(q.matrix) : names[0] || null;
    const matrix = matrixName ? matrices[matrixName] : null;
    return {
      ...base,
      matrixName,
      matrix,
      askDimensions: q.askDimensions !== false,
      targets: readTargets(q, matrix),
    };
  }

  if (mode === 'operate') {
    const operation = text(q.operation).trim() === 'add' ? 'add' : 'multiply';
    const left = names.includes(text(q.left)) ? text(q.left) : names[0] || null;
    const right = names.includes(text(q.right)) ? text(q.right) : names[1] || null;
    const leftMatrix = left ? matrices[left] : null;
    const rightMatrix = right ? matrices[right] : null;
    const result = leftMatrix?.values && rightMatrix?.values
      ? (operation === 'add' ? addMatrices(leftMatrix.values, rightMatrix.values) : multiplyMatrices(leftMatrix.values, rightMatrix.values))
      : { error: MATRIX_ERRORS.INVALID };
    const resultDims = operation === 'add'
      ? (result.value ? dimensionsOf(result.value) : null)
      : (leftMatrix?.values && rightMatrix?.values ? productDimensions(leftMatrix.dims, rightMatrix.dims) : null);
    return {
      ...base,
      operation,
      left,
      right,
      leftMatrix,
      rightMatrix,
      result: result.value || null,
      resultError: result.error || null,
      resultDims,
      defined: Boolean(result.value),
      askDefined: q.askDefined !== false,
      fillResult: q.fillResult !== false,
      showExpansion: q.showExpansion === true,
      judgeInverse: q.judgeInverse === true,
      areInverses: Boolean(result.value) && isIdentity(result.value),
      // How the operation is written ("A · B"), and what the result is called
      // (an authored name such as "Results", or the operation itself).
      operationLabel: operation === 'add' ? `${left} + ${right}` : `${left} · ${right}`,
      resultName: text(q.resultName).trim() || (operation === 'add' ? `${left} + ${right}` : `${left}${right}`),
      resultRowLabels: leftMatrix?.rowLabels || null,
      resultColLabels: operation === 'add' ? leftMatrix?.colLabels || null : rightMatrix?.colLabels || null,
      resultRowTitle: leftMatrix?.rowTitle || null,
      resultColTitle: operation === 'add' ? leftMatrix?.colTitle || null : rightMatrix?.colTitle || null,
    };
  }

  // equation · solve · completeSystem — a system of linear equations.
  const system = systemMatrices(equations, variables);
  const givenA = matrices.A?.values || null;
  const givenB = matrices.B?.values || null;
  const keyA = system?.A || givenA;
  const keyB = system?.B || givenB;

  if (mode === 'completeSystem') {
    return { ...base, keyA, keyB, targets: readCompletionTargets(q) };
  }

  const classification = keyA && keyB ? classifySystem(keyA, keyB) : null;
  const inverse = keyA ? inverseMatrix(keyA) : { error: MATRIX_ERRORS.INVALID };
  return {
    ...base,
    keyA,
    keyB,
    // Equation mode always builds; solve mode builds when it is given equations.
    buildEquation: mode === 'equation' || (q.buildEquation !== false && Boolean(system)),
    startA: matrixRowsOf(list(q.startFrom?.A)).map((row) => row.map((cell) => text(cell))),
    startB: list(q.startFrom?.B).map((cell) => text(Array.isArray(cell) ? cell[0] : cell)),
    askInverse: mode === 'solve' && q.askInverse === true,
    // A modeling question hides the system: the student writes A and B from
    // the words, and the equations only define what a right row is.
    showEquations: q.showEquations !== false,
    keyInverse: inverse.value || null,
    classification,
    asWritten: equations.map((equation) => asWrittenReading(equation, variables)),
    variableMeanings: isObject(q.variableMeanings) ? q.variableMeanings : null,
  };
};

/* ---------------------------------------------------------------------------
 * Comparing what a student typed with an exact value.
 * ------------------------------------------------------------------------- */

const decimalPlaces = (raw) => {
  const match = text(raw).trim().match(/^[-−+]?\d*\.(\d+)$/);
  return match ? match[1].length : 0;
};

/**
 * Is a typed cell this exact value? The exact value always is (59/4, 14.75,
 * \frac{59}{4}). A decimal is also accepted as a ROUNDING of a value that has
 * no short decimal — 3.3333 for 10/3 — when it carries at least three
 * decimal places and is within half a unit of its last place. 3.3 is not
 * 10/3, and 14.8 is not 59/4.
 */
export const cellMatches = (typed, exact) => {
  const value = parseCell(typed);
  if (!value || !exact) return false;
  if (equal(value, exact)) return true;
  const places = decimalPlaces(typed);
  if (places < 3) return false;
  const difference = Math.abs(toNumber(sub(value, exact)));
  return difference <= 0.5 * 10 ** -places + 1e-12;
};

export const cellIsBlank = (typed) => text(typed).trim() === '';

/* ---------------------------------------------------------------------------
 * A matrix equation the student wrote, against the system.
 * ------------------------------------------------------------------------- */

const permutations = (items) => (items.length <= 1
  ? [items]
  : items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest])));

/**
 * Match each row of the student's [A | B] to an equation of the system. A row
 * is that equation when it is a nonzero multiple of its standard form — the
 * same equation, perhaps multiplied through by −1 — and the rows may come in
 * any order, as long as each equation is used once. Returns, per student row,
 * the index of the equation it is (or null), using the assignment that
 * matches the most rows.
 */
export const matchEquationRows = (studentRows, keyRows) => {
  const count = keyRows.length;
  const ok = studentRows.map((row) => keyRows.map((keyRow) => Boolean(row && rowMultipleOf(row, keyRow))));
  let best = null;
  for (const order of permutations([...Array(count).keys()])) {
    const assignment = studentRows.map((_, index) => (ok[index]?.[order[index]] ? order[index] : null));
    const matched = assignment.filter((entry) => entry !== null).length;
    // Prefer more matches; on a tie, the in-order assignment.
    const inOrder = assignment.every((entry, index) => entry === null || entry === index);
    if (!best || matched > best.matched || (matched === best.matched && inOrder && !best.inOrder)) {
      best = { assignment, matched, inOrder };
    }
  }
  return best ? best.assignment : studentRows.map(() => null);
};

/** The student's rows as exact [a, b, c, d] (null for a row with a blank or non-number). */
export const studentAugmentedRows = (A, B, count, width) => Array.from({ length: count }, (_, i) => {
  const cells = [...list(A?.[i]).slice(0, width), Array.isArray(B?.[i]) ? B[i][0] : B?.[i]];
  if (cells.length !== width + 1) return null;
  const parsed = cells.map(parseCell);
  return parsed.some((cell) => !cell) ? null : parsed;
});

export const keyAugmentedRows = (keyA, keyB) => keyA.map((row, i) => [...row, keyB[i][0]]);

/**
 * Why a row is wrong, when the reason is one the lesson names. `asWritten`:
 * the student copied the equation's coefficients as printed instead of first
 * moving every variable term to the left (Nicky's error). Never an answer.
 */
export const equationRowDiagnosis = (studentRow, reading) => {
  if (!studentRow || !reading) return null;
  const asWrittenRow = [...reading.row, reading.constant];
  return studentRow.every((cell, index) => equal(cell, asWrittenRow[index])) ? 'asWritten' : null;
};

/* ---------------------------------------------------------------------------
 * The matrix calculator.
 * ------------------------------------------------------------------------- */

export const CALCULATOR_ERROR_TEXT = Object.freeze({
  [MATRIX_ERRORS.DIMENSION]: 'ERR: DIMENSION MISMATCH',
  [MATRIX_ERRORS.SINGULAR]: 'ERR: SINGULAR MATRIX',
  [MATRIX_ERRORS.NOT_SQUARE]: 'ERR: INVALID DIMENSION',
  [MATRIX_ERRORS.INVALID]: 'ERR: A CELL IS EMPTY OR NOT A NUMBER',
});

/**
 * Run one calculator command on the matrices the student has loaded.
 *   multiply      [L]·[R]
 *   add           [L]+[R]
 *   inverse       [L]⁻¹
 *   inverseTimes  [L]⁻¹·[R]
 * Returns { value } or { error } — the exact error a graphing calculator gives.
 */
export const runCalculator = (operation, leftCells, rightCells) => {
  const left = parseMatrix(leftCells);
  const right = parseMatrix(rightCells);
  if (operation === 'inverse') return left ? inverseMatrix(left) : { error: MATRIX_ERRORS.INVALID };
  if (!left || !right) return { error: MATRIX_ERRORS.INVALID };
  if (operation === 'add') return addMatrices(left, right);
  if (operation === 'multiply') return multiplyMatrices(left, right);
  if (operation === 'inverseTimes') {
    const inverse = inverseMatrix(left);
    return inverse.error ? inverse : multiplyMatrices(inverse.value, right);
  }
  return { error: MATRIX_ERRORS.INVALID };
};

/** A result matrix as text cells, exact (59/4) — what the calculator prints. */
export const matrixText = (matrix) => (Array.isArray(matrix) ? matrix.map((row) => row.map(formatRational)) : []);

/* ---------------------------------------------------------------------------
 * A third equation the student wrote.
 * ------------------------------------------------------------------------- */

/** Classify the given equations plus one student row ({ coefficients, constant }). */
export const classifyCompletedSystem = (keyA, keyB, coefficients, constant) => {
  if (!keyA || !keyB) return null;
  const row = list(coefficients).map(parseCell);
  const d = parseCell(constant);
  if (row.length !== keyA[0].length || row.some((cell) => !cell) || !d) return null;
  if (row.every(isZero)) return { type: null, reason: 'noVariables' };
  return classifySystem([...keyA, row], [...keyB, [d]]);
};

export { SOLUTION_TYPES, rational, parseLinearEquation };

/* ---------------------------------------------------------------------------
 * Authoring validation (toolSchemas.validateToolQuestion → Pre-Flight).
 * ------------------------------------------------------------------------- */

const MAX_SIZE = 6;
const sizeOk = (dims) => dims.rows >= 1 && dims.cols >= 1 && dims.rows <= MAX_SIZE && dims.cols <= MAX_SIZE;

/**
 * Teacher-readable reasons a Matrix Lab question cannot be given to a student.
 * Every one names what to change; an empty list means the question is sound.
 */
export const validateMatrixLabQuestion = (question = {}) => {
  const errors = [];
  const q = isObject(question) ? question : {};
  const rawMode = text(q.mode).trim();
  if (rawMode && !MATRIX_LAB_MODES.includes(rawMode)) errors.push(`matrixLab mode must be one of: ${MATRIX_LAB_MODES.join(', ')}.`);
  if (isObject(q.technology)) {
    list(q.technology.operations).forEach((operation) => {
      if (!MATRIX_CALCULATOR_OPERATIONS.includes(text(operation))) errors.push(`matrixLab technology operation "${operation}" is not one of: ${MATRIX_CALCULATOR_OPERATIONS.join(', ')}.`);
    });
  }
  const model = readMatrixLabQuestion(q);
  Object.values(model.matrices).forEach((matrix) => {
    if (!matrix.values) errors.push(`matrixLab matrix ${matrix.name} must be a rectangular grid of numbers (integers, decimals or fractions such as 2/3).`);
    else if (!sizeOk(matrix.dims)) errors.push(`matrixLab matrix ${matrix.name} is ${matrix.dims.rows} × ${matrix.dims.cols}; the lab shows matrices up to ${MAX_SIZE} × ${MAX_SIZE}.`);
  });

  if (model.mode === 'locate') {
    if (!model.matrix) errors.push('matrixLab locate needs the matrix to read in "matrices".');
    if (!model.askDimensions && !model.targets.length) errors.push('matrixLab locate must ask for the dimensions or at least one element.');
    const seen = new Set();
    model.targets.forEach((target, index) => {
      if (!target.valid) errors.push(`matrixLab locate target ${index + 1} needs a row and column inside matrix ${model.matrixName || ''}.`.replace(/ \./, '.'));
      if (target.kind === 'notation' && !target.description) errors.push(`matrixLab locate target ${index + 1} asks for notation, so it needs a description of the element in words.`);
      if (seen.has(target.id)) errors.push(`matrixLab locate target id "${target.id}" is used more than once.`);
      seen.add(target.id);
    });
  }

  if (model.mode === 'operate') {
    if (!model.leftMatrix?.values || !model.rightMatrix?.values) errors.push('matrixLab operate needs two numeric matrices, named by "left" and "right".');
    else {
      if (!model.askDefined && !model.defined) errors.push(`matrixLab operate: ${model.resultName} is not defined, so a student can only show that — set askDefined to true.`);
      if (model.judgeInverse && !(model.defined && model.resultDims.rows === model.resultDims.cols)) errors.push('matrixLab operate judgeInverse needs a square product.');
      if (!model.askDefined && !model.fillResult && !model.judgeInverse) errors.push('matrixLab operate asks the student nothing: enable askDefined, fillResult or judgeInverse.');
      if (model.defined && model.resultDims && !sizeOk(model.resultDims)) errors.push(`matrixLab operate: ${model.resultName} is too large to fill in.`);
    }
  }

  if (['equation', 'solve', 'completeSystem'].includes(model.mode)) {
    if (model.equations.length) {
      const unreadable = model.equations.filter((equation) => !parseLinearEquation(equation, model.variables));
      unreadable.forEach((equation) => errors.push(`matrixLab could not read "${equation}" as a linear equation in ${model.variables.join(', ')}. Write terms such as 3x, -y, 2.5z and numbers on each side of one "=".`));
    } else if (model.mode !== 'solve' || !model.keyA) {
      errors.push(`matrixLab ${model.mode} needs the system's "equations".`);
    }
  }

  if (model.mode === 'equation' && model.keyA) {
    if (model.keyA.length > 4 || model.variables.length > 4) errors.push('matrixLab equation supports up to four equations in up to four variables.');
  }

  if (model.mode === 'solve' && model.keyA) {
    if (model.keyA.length !== model.keyA[0].length) errors.push('matrixLab solve needs as many equations as variables, so A is square.');
    if (!model.technology.includes('inverseTimes') && !model.technology.includes('inverse')) errors.push('matrixLab solve needs the calculator\'s inverse command ("inverse" or "inverseTimes").');
    if (model.askInverse && !model.keyInverse) errors.push('matrixLab solve asks for A⁻¹, but this A is singular.');
    if (!model.buildEquation && !(model.matrices.A?.values && model.matrices.B?.values)) errors.push('matrixLab solve without equations needs matrices A and B.');
  }

  if (model.mode === 'completeSystem') {
    if (!model.targets.length) errors.push('matrixLab completeSystem needs at least one target classification ("none" or "many").');
    model.targets.forEach((target, index) => {
      if (!target.classification) errors.push(`matrixLab completeSystem target ${index + 1} needs classification "one", "none" or "many".`);
    });
    if (model.keyA && model.keyA.length !== model.variables.length - 1) errors.push('matrixLab completeSystem gives all but one equation: one fewer equation than variables.');
    else if (model.keyA && classifySystem(model.keyA, model.keyB)?.type === SOLUTION_TYPES.NONE) errors.push('matrixLab completeSystem: the given equations already contradict each other.');
  }
  return errors;
};

/* ---------------------------------------------------------------------------
 * The answer key, as lines a teacher reads (answer-key worksheet PDF).
 * ------------------------------------------------------------------------- */

const keyText = (value) => formatRational(value).replace(/-/g, '−');
const keyMatrix = (matrix) => `[${matrix.map((row) => row.map(keyText).join(', ')).join('; ')}]`;
const CLASSIFICATION_TEXT = Object.freeze({ one: 'exactly one solution', none: 'no solution', many: 'infinitely many solutions' });

/**
 * What a right answer is, derived from the givens — never authored. Empty for
 * a question the lab cannot read (Pre-Flight refuses those).
 */
export const matrixLabAnswerLines = (question = {}) => {
  const model = readMatrixLabQuestion(question);
  const lines = [];
  if (model.mode === 'locate' && model.matrix?.values) {
    if (model.askDimensions) lines.push(`Dimensions of ${model.matrixName}: ${model.matrix.dims.rows} × ${model.matrix.dims.cols}`);
    model.targets.filter((target) => target.valid).forEach((target) => {
      const name = elementNotation(model.matrixName, target.row, target.col);
      lines.push(`${target.kind === 'tap' ? name : `${target.description}: ${name}`} = ${model.matrix.rows[target.row - 1][target.col - 1]}`);
    });
  } else if (model.mode === 'operate' && model.leftMatrix?.values && model.rightMatrix?.values) {
    lines.push(model.defined ? `${model.operationLabel} is defined: ${model.resultDims.rows} × ${model.resultDims.cols}` : `${model.operationLabel} is not defined`);
    if (model.result) lines.push(`${model.resultName} = ${keyMatrix(model.result)}`);
    if (model.judgeInverse && model.defined) lines.push(`${model.left} and ${model.right} ${model.areInverses ? 'are' : 'are not'} inverses`);
  } else if ((model.mode === 'equation' || model.mode === 'solve') && model.keyA && model.keyB) {
    lines.push(`A = ${keyMatrix(model.keyA)}`, `B = ${keyMatrix(model.keyB)}`);
    if (model.mode === 'solve' && model.classification) {
      if (model.askInverse && model.keyInverse) lines.push(`A⁻¹ = ${keyMatrix(model.keyInverse)}`);
      lines.push(model.classification.type === SOLUTION_TYPES.ONE
        ? `Solution: ${model.variables.map((variable, index) => `${variable} = ${keyText(model.classification.solution[index])}`).join(', ')}`
        : `The coefficient matrix is singular: ${CLASSIFICATION_TEXT[model.classification.type]}`);
    }
  } else if (model.mode === 'completeSystem' && model.keyA) {
    const [first] = model.keyA;
    const constant = model.keyB[0][0];
    const doubled = first.map((value) => rational(value.n * 2n, value.d));
    model.targets.forEach((target) => {
      if (target.classification === SOLUTION_TYPES.MANY) lines.push(`Infinitely many (one example): ${formatEquation(doubled, rational(constant.n * 2n, constant.d), model.variables)}`);
      if (target.classification === SOLUTION_TYPES.NONE) lines.push(`No solution (one example): ${formatEquation(doubled, rational(constant.n * 2n + constant.d, constant.d), model.variables)}`);
    });
  }
  return lines;
};
