/*
 * Shared grader for the `matrixLab` registry tool — run by the browser tool
 * for its feedback, by QuestionEngine for the recorded verdict, and by the
 * server as the authority. See ../toolGraderDefinition.mjs.
 *
 * Every key is derived from the question's givens by matrixLabModel.mjs (the
 * product from the two matrices, the matrix equation and solution from the
 * equations), so a grade can never disagree with the mathematics on screen.
 *
 * Parts are one per thing the student decides, so the lab can say WHICH cell
 * or row to reconsider without saying what belongs there:
 *
 *   locate          dimensions · one part per element target
 *   operate         defined · dimensions · one part per result cell · inverses
 *   equation        one part per equation's row of [A | B]
 *   solve           matrix-equation rows · A⁻¹ · classification · x, y, z
 *   completeSystem  one part per requested system type
 */
import declaration from '../declarations/matrixLab.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult } from '../gradingResult.mjs';
import { SOLUTION_TYPES, formatRational } from '../../toolMath/matrixLab/matrixMath.mjs';
import {
  cellIsBlank,
  cellMatches,
  classifyCompletedSystem,
  elementNotation,
  equationRowDiagnosis,
  keyAugmentedRows,
  matchEquationRows,
  readMatrixLabQuestion,
  studentAugmentedRows,
} from '../../toolMath/matrixLab/matrixLabModel.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
// A cell is the text the student typed. A number a tampered client sends is
// read as its spelling; anything else is blank.
const cellText = (value) => {
  if (typeof value === 'string') return value.slice(0, 40);
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
};
const choiceText = (value) => (typeof value === 'string' ? value.trim() : '');
const wholeNumber = (value) => {
  const number = Number(typeof value === 'string' ? value.trim() : value);
  return Number.isInteger(number) && String(value).trim() !== '' ? number : null;
};
const cellsOf = (rows, height, width) => Array.from({ length: height }, (_, i) => Array.from({ length: width }, (_, j) => cellText(list(rows)[i]?.[j])));
const columnOf = (cells, height) => Array.from({ length: height }, (_, i) => {
  const entry = list(cells)[i];
  return cellText(Array.isArray(entry) ? entry[0] : entry);
});

const CLASSIFICATION_LABEL = Object.freeze({
  [SOLUTION_TYPES.ONE]: 'exactly one solution',
  [SOLUTION_TYPES.NONE]: 'no solution',
  [SOLUTION_TYPES.MANY]: 'infinitely many solutions',
});

/* ------------------------------------------------------------------ locate */

const gradeLocate = (question, work) => {
  const model = readMatrixLabQuestion(question);
  const parts = [];
  if (model.askDimensions && model.matrix) {
    const rows = wholeNumber(work.dimensions?.rows);
    const cols = wholeNumber(work.dimensions?.cols);
    parts.push({
      id: 'dimensions',
      label: `Dimensions of matrix ${model.matrixName}`,
      isComplete: rows !== null && cols !== null,
      isCorrect: rows === model.matrix.dims.rows && cols === model.matrix.dims.cols,
      response: rows !== null && cols !== null ? `${rows} × ${cols}` : '',
    });
  }
  const given = new Map(list(work.targets).filter(isObject).map((entry) => [String(entry.id), entry]));
  model.targets.forEach((target) => {
    const entry = given.get(target.id) || {};
    const row = wholeNumber(entry.row);
    const col = wholeNumber(entry.col);
    parts.push({
      id: target.id,
      label: target.kind === 'tap' ? `Element ${elementNotation(model.matrixName, target.row, target.col)}` : target.description || target.id,
      isComplete: row !== null && col !== null,
      isCorrect: target.valid && row === target.row && col === target.col,
      response: row !== null && col !== null ? elementNotation(model.matrixName, row, col) : '',
    });
  });
  return gradedResult({ parts });
};

/* ----------------------------------------------------------------- operate */

const gradeOperate = (question, work) => {
  const model = readMatrixLabQuestion(question);
  const parts = [];
  const defined = choiceText(work.defined);
  const rows = wholeNumber(work.dimensions?.rows);
  const cols = wholeNumber(work.dimensions?.cols);
  if (model.askDefined) {
    parts.push({
      id: 'defined',
      label: `Is ${model.operationLabel} defined?`,
      isComplete: defined === 'yes' || defined === 'no',
      isCorrect: defined === (model.defined ? 'yes' : 'no'),
      response: defined,
    });
    if (model.defined) {
      parts.push({
        id: 'dimensions',
        label: `Dimensions of ${model.operationLabel}`,
        isComplete: rows !== null && cols !== null,
        isCorrect: rows === model.resultDims.rows && cols === model.resultDims.cols,
        response: rows !== null && cols !== null ? `${rows} × ${cols}` : '',
      });
    }
  }
  if (model.defined && model.fillResult) {
    const { rows: height, cols: width } = model.resultDims;
    const entries = cellsOf(work.entries, height, width);
    for (let i = 0; i < height; i += 1) {
      for (let j = 0; j < width; j += 1) {
        parts.push({
          id: `r${i + 1}c${j + 1}`,
          label: `Row ${i + 1}, column ${j + 1} of ${model.resultName}`,
          isComplete: !cellIsBlank(entries[i][j]),
          isCorrect: cellMatches(entries[i][j], model.result[i][j]),
          response: entries[i][j],
        });
      }
    }
  }
  if (model.judgeInverse && model.defined) {
    const inverses = choiceText(work.inverses);
    parts.push({
      id: 'inverses',
      label: `Are ${model.left} and ${model.right} inverses?`,
      isComplete: inverses === 'yes' || inverses === 'no',
      isCorrect: inverses === (model.areInverses ? 'yes' : 'no'),
      response: inverses,
    });
  }
  return gradedResult({ parts });
};

/* ---------------------------------------------------- equation and solve */

const equationParts = (model, work) => {
  const count = model.keyA.length;
  const width = model.keyA[0].length;
  const A = cellsOf(work.A, count, width);
  const B = columnOf(work.B, count);
  const studentRows = studentAugmentedRows(A, B, count, width);
  const matched = matchEquationRows(studentRows, keyAugmentedRows(model.keyA, model.keyB));
  return studentRows.map((row, index) => ({
    id: `row${index + 1}`,
    label: `Row ${index + 1} of the matrix equation`,
    isComplete: [...A[index], B[index]].every((cell) => !cellIsBlank(cell)),
    isCorrect: matched[index] !== null,
    response: `[${A[index].join(', ')} | ${B[index]}]`,
  }));
};

/** Per row, why it is wrong when the lesson names the reason (UI feedback). */
export const matrixEquationDiagnostics = (question, work) => {
  const model = readMatrixLabQuestion(question);
  if (!model.keyA || !['equation', 'solve'].includes(model.mode)) return [];
  const count = model.keyA.length;
  const width = model.keyA[0].length;
  const A = cellsOf(work?.A, count, width);
  const B = columnOf(work?.B, count);
  const studentRows = studentAugmentedRows(A, B, count, width);
  const matched = matchEquationRows(studentRows, keyAugmentedRows(model.keyA, model.keyB));
  return studentRows.map((row, index) => (matched[index] !== null ? null : equationRowDiagnosis(row, model.asWritten[index])));
};

const gradeEquation = (question, work) => {
  const model = readMatrixLabQuestion(question);
  if (!model.keyA || !model.keyB) return gradedResult({ parts: [] });
  return gradedResult({ parts: equationParts(model, work) });
};

const gradeSolve = (question, work) => {
  const model = readMatrixLabQuestion(question);
  if (!model.keyA || !model.keyB || !model.classification) return gradedResult({ parts: [] });
  const parts = model.buildEquation ? equationParts(model, work) : [];
  if (model.askInverse && model.keyInverse) {
    const size = model.keyInverse.length;
    const typed = cellsOf(work.inverse, size, size);
    const cells = typed.flat();
    const right = cells.filter((cell, index) => cellMatches(cell, model.keyInverse[Math.floor(index / size)][index % size])).length;
    parts.push({
      id: 'inverse',
      label: 'The inverse matrix A⁻¹',
      isComplete: cells.every((cell) => !cellIsBlank(cell)),
      isCorrect: right === cells.length,
      credit: right / cells.length,
      response: typed.map((row) => row.join(' ')).join(' / '),
    });
  }
  const classification = choiceText(work.classification);
  parts.push({
    id: 'classification',
    label: 'Number of solutions',
    isComplete: Object.values(SOLUTION_TYPES).includes(classification),
    isCorrect: classification === model.classification.type,
    response: CLASSIFICATION_LABEL[classification] || '',
  });
  if (model.classification.type === SOLUTION_TYPES.ONE) {
    const values = columnOf(work.values, model.variables.length);
    model.variables.forEach((variable, index) => {
      parts.push({
        id: `value-${variable}`,
        label: `The value of ${variable}`,
        isComplete: !cellIsBlank(values[index]),
        isCorrect: classification === SOLUTION_TYPES.ONE && cellMatches(values[index], model.classification.solution[index]),
        response: values[index],
      });
    });
  }
  return gradedResult({ parts });
};

/* ---------------------------------------------------------- completeSystem */

const gradeCompleteSystem = (question, work) => {
  const model = readMatrixLabQuestion(question);
  const given = new Map(list(work.rows).filter(isObject).map((entry) => [String(entry.id), entry]));
  const width = model.keyA ? model.keyA[0].length : model.variables.length;
  const parts = model.targets.map((target) => {
    const entry = given.get(target.id) || {};
    const coefficients = Array.from({ length: width }, (_, index) => cellText(list(entry.coefficients)[index]));
    const constant = cellText(entry.constant);
    const verdict = classifyCompletedSystem(model.keyA, model.keyB, coefficients, constant);
    return {
      id: target.id,
      label: target.label || `A third equation that gives ${CLASSIFICATION_LABEL[target.classification] || 'the requested system'}`,
      isComplete: [...coefficients, constant].every((cell) => !cellIsBlank(cell)),
      isCorrect: Boolean(target.classification) && verdict?.type === target.classification,
      response: `${coefficients.join(', ')} | ${constant}`,
    };
  });
  return gradedResult({ parts });
};

/**
 * The work the lab reports for a question, from its own state — exactly what
 * Check submits and a deadline checkpoints.
 */
export const matrixLabWork = (question, state = {}) => {
  const model = readMatrixLabQuestion(question);
  const s = isObject(state) ? state : {};
  switch (model.mode) {
    case 'locate':
      return {
        dimensions: { rows: cellText(s.dimensions?.rows), cols: cellText(s.dimensions?.cols) },
        targets: model.targets.map((target) => ({ id: target.id, row: s.targets?.[target.id]?.row ?? null, col: s.targets?.[target.id]?.col ?? null })),
      };
    case 'operate':
      return {
        defined: choiceText(s.defined),
        dimensions: { rows: cellText(s.dimensions?.rows), cols: cellText(s.dimensions?.cols) },
        entries: list(s.entries).map((row) => list(row).map(cellText)),
        inverses: choiceText(s.inverses),
      };
    case 'equation':
      return { A: list(s.A).map((row) => list(row).map(cellText)), B: list(s.B).map(cellText) };
    case 'solve':
      return {
        A: list(s.A).map((row) => list(row).map(cellText)),
        B: list(s.B).map(cellText),
        inverse: list(s.inverse).map((row) => list(row).map(cellText)),
        classification: choiceText(s.classification),
        values: list(s.values).map(cellText),
        usedTechnology: s.usedTechnology === true,
      };
    case 'completeSystem':
      return {
        rows: model.targets.map((target) => ({
          id: target.id,
          coefficients: list(s.rows?.[target.id]?.coefficients).map(cellText),
          constant: cellText(s.rows?.[target.id]?.constant),
        })),
      };
    default:
      return {};
  }
};

/** The exact key cell as the lab prints it in a solution review. */
export const keyCellText = formatRational;

export default bindToolGrader(declaration, 'matrixLab', {
  locate: gradeLocate,
  operate: gradeOperate,
  equation: gradeEquation,
  solve: gradeSolve,
  completeSystem: gradeCompleteSystem,
});
