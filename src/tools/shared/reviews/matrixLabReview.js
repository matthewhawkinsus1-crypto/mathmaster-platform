// Worked solution review for matrixLab (contract: ../toolSolutionReview.js, textOnlyReview).
/*
 * THE MATRIX LAB'S WORKED SOLUTION — DERIVED, THEN GRADED.
 *
 * Every key the lab grades is derived from the question's givens by
 * matrixLabModel.mjs, so the review states that same derivation: the product
 * computed row by column, the matrix equation read off the standard-form
 * equations, X = A⁻¹B, or — for a singular system — which row is a multiple of
 * which and whether the constants follow. It then builds the work a student
 * following the review would submit and grades it with the shared grader.
 * Unless the grader calls that work correct and complete, the review is null.
 *
 * Shown only once the question is closed (QuestionEngine); pure, no React.
 */
import matrixLabGrader, { matrixLabWork } from '../../../../functions/shared/serverGrading/tools/matrixLab.mjs';
import { gradeWorkWithGrader } from '../../../../functions/shared/serverGrading/toolWorkGrading.mjs';
import { SOLUTION_TYPES, elementNotation, readMatrixLabQuestion } from '../../../../functions/shared/toolMath/matrixLab/matrixLabModel.mjs';
import { formatEquation, formatRational, productEntry, rowMultipleOf } from '../../../../functions/shared/toolMath/matrixLab/matrixMath.mjs';

export const implemented = true;

const show = (value) => formatRational(value).replace(/-/g, '−');
const matrixText = (matrix) => `[${matrix.map((row) => row.map(show).join(', ')).join('; ')}]`;
const columnText = (column) => `[${column.map((row) => show(row[0] ?? row)).join('; ')}]`;
const dims = ({ rows, cols }) => `${rows} × ${cols}`;

const accepted = (question, state) => {
  const verdict = gradeWorkWithGrader({ grader: matrixLabGrader, question, work: matrixLabWork(question, state) });
  return verdict.graded === true && verdict.isCorrect === true && verdict.isComplete === true;
};

const locateReview = (question, model) => {
  const { matrix, matrixName } = model;
  if (!matrix?.values) return null;
  const targets = Object.fromEntries(model.targets.map((target) => [target.id, { row: target.row, col: target.col }]));
  if (!accepted(question, { dimensions: { rows: String(matrix.dims.rows), cols: String(matrix.dims.cols) }, targets })) return null;
  const name = (row, col) => elementNotation(matrixName, row, col);
  return {
    title: 'Reading the matrix',
    items: [
      ...(model.askDimensions ? [{ label: `Dimensions of ${matrixName}`, value: dims(matrix.dims) }] : []),
      ...model.targets.map((target) => ({ label: target.kind === 'tap' ? name(target.row, target.col) : target.description, value: `${name(target.row, target.col)} = ${matrix.rows[target.row - 1][target.col - 1]}` })),
    ],
    steps: [
      ...(model.askDimensions ? [`Matrix ${matrixName} has ${matrix.dims.rows} rows and ${matrix.dims.cols} columns, so it is ${dims(matrix.dims)} — rows first, then columns.`] : []),
      ...model.targets.slice(0, 10).map((target) => {
        const where = `row ${target.row}${matrix.rowLabels ? ` (${matrix.rowLabels[target.row - 1]})` : ''} and column ${target.col}${matrix.colLabels ? ` (${matrix.colLabels[target.col - 1]})` : ''}`;
        return target.kind === 'tap'
          ? `${name(target.row, target.col)} is in ${where}: its value is ${matrix.rows[target.row - 1][target.col - 1]}.`
          : `${target.description} is in ${where}, so it is ${name(target.row, target.col)} — the row number is written first.`;
      }),
    ],
    why: `In an element name such as ${name(2, 3)}, the first number is always the row and the second is the column; ${name(2, 3)} and ${name(3, 2)} are different elements.`,
    note: null,
  };
};

const operateReview = (question, model) => {
  if (!model.leftMatrix?.values || !model.rightMatrix?.values) return null;
  const { left, right, leftMatrix, rightMatrix } = model;
  const state = {
    defined: model.defined ? 'yes' : 'no',
    dimensions: model.defined ? { rows: String(model.resultDims.rows), cols: String(model.resultDims.cols) } : { rows: '', cols: '' },
    entries: model.result ? model.result.map((row) => row.map(formatRational)) : [],
    inverses: model.areInverses ? 'yes' : 'no',
  };
  if (!accepted(question, state)) return null;
  const sizeLine = model.operation === 'add'
    ? `${left} is ${dims(leftMatrix.dims)} and ${right} is ${dims(rightMatrix.dims)}. Matrices add only when their dimensions match, so ${model.resultName} is ${model.defined ? `defined and is ${dims(model.resultDims)}` : 'not defined'}.`
    : `${left} is ${dims(leftMatrix.dims)} and ${right} is ${dims(rightMatrix.dims)}. ${model.defined ? `The inner dimensions match (${leftMatrix.dims.cols} = ${rightMatrix.dims.rows}), so ${model.resultName} is defined, and it takes the outer dimensions: ${dims(model.resultDims)}.` : `The inner dimensions do not match (${leftMatrix.dims.cols} ≠ ${rightMatrix.dims.rows}), so ${model.resultName} is not defined.`}`;
  const steps = [sizeLine];
  if (model.defined && model.operation === 'multiply') {
    const terms = productEntry(leftMatrix.values, rightMatrix.values, 0, 0).terms;
    steps.push(`Entry (1, 1) is row 1 of ${left} times column 1 of ${right}: ${terms.map((term) => `${show(term.left)}(${show(term.right)})`).join(' + ')} = ${show(model.result[0][0])}.`);
    steps.push(`Every other entry works the same way: entry (p, q) is row p of ${left} times column q of ${right}.`);
  }
  if (model.defined && model.operation === 'add') steps.push('Add the elements in matching positions.');
  if (model.judgeInverse) steps.push(model.areInverses ? `${model.resultName} is the identity matrix, so ${left} and ${right} are inverses.` : `${model.resultName} is not the identity matrix, so ${left} and ${right} are not inverses.`);
  return {
    title: model.operation === 'add' ? 'Matrix sum' : 'Matrix product',
    items: [
      { label: `Is ${model.resultName} defined?`, value: model.defined ? `Yes — ${dims(model.resultDims)}` : 'No' },
      ...(model.result ? [{ label: model.resultName, value: matrixText(model.result) }] : []),
      ...(model.judgeInverse ? [{ label: 'Inverses?', value: model.areInverses ? 'Yes' : 'No' }] : []),
    ],
    steps,
    why: model.operation === 'add' ? 'Each element of the sum is the sum of the two elements in the same position.' : 'The number of columns of the first matrix must equal the number of rows of the second, because each entry pairs a row with a column element by element.',
    note: null,
  };
};

const equationLines = (model) => model.keyA.map((row, index) => formatEquation(row, model.keyB[index][0], model.variables).replace(/-/g, '−'));

const systemReview = (question, model) => {
  if (!model.keyA || !model.keyB) return null;
  const A = model.keyA.map((row) => row.map(formatRational));
  const B = model.keyB.map((row) => formatRational(row[0]));
  const standard = equationLines(model);
  const buildSteps = [
    `Write each equation in standard form: ${standard.join('; ')}.`,
    `A holds the coefficients in order (${model.variables.join(', ')}), with 0 for a missing variable: A = ${matrixText(model.keyA)}. B holds the constants: B = ${columnText(model.keyB)}.`,
  ];
  if (model.mode === 'equation') {
    if (!accepted(question, { A, B })) return null;
    return {
      title: 'Matrix equation',
      items: [{ label: 'A', value: matrixText(model.keyA) }, { label: 'B', value: columnText(model.keyB) }],
      steps: buildSteps,
      why: 'Multiplying A by X = [x; y; z] row by column gives back the left side of each equation, and setting it equal to B gives back the system.',
      note: null,
    };
  }
  const { classification } = model;
  if (!classification) return null;
  const values = classification.type === SOLUTION_TYPES.ONE ? classification.solution.map(formatRational) : model.variables.map(() => '');
  const state = {
    A, B,
    inverse: model.keyInverse ? model.keyInverse.map((row) => row.map(formatRational)) : [],
    classification: classification.type,
    values,
  };
  if (!accepted(question, state)) return null;
  const steps = model.buildEquation ? [...buildSteps] : [];
  if (classification.type === SOLUTION_TYPES.ONE) {
    if (model.askInverse && model.keyInverse) steps.push(`The calculator gives A⁻¹ = ${matrixText(model.keyInverse)}.`);
    steps.push(`X = A⁻¹B = ${columnText(classification.solution.map((value) => [value]))}, so ${model.variables.map((variable, index) => `${variable} = ${show(classification.solution[index])}`).join(', ')}.`);
  } else {
    steps.push('The calculator reports ERR: SINGULAR MATRIX: A has no inverse, so the system does not have exactly one solution.');
    const augmented = model.keyA.map((row, index) => [...row, model.keyB[index][0]]);
    let found = null;
    for (let i = 0; i < model.keyA.length && !found; i += 1) {
      for (let j = 0; j < model.keyA.length && !found; j += 1) {
        if (i === j) continue;
        const factor = rowMultipleOf(model.keyA[j], model.keyA[i]);
        if (factor) found = { i, j, factor, constants: Boolean(rowMultipleOf(augmented[j], augmented[i])) };
      }
    }
    if (found) {
      steps.push(`The coefficients of equation ${found.j + 1} are ${show(found.factor)} times those of equation ${found.i + 1}${found.constants ? ', and so is its constant: the two equations say the same thing.' : ', but its constant is not: the two equations contradict each other.'}`);
    }
    steps.push(classification.type === SOLUTION_TYPES.MANY ? 'So the system has infinitely many solutions.' : 'So the system has no solution.');
  }
  return {
    title: 'Solving with matrices',
    items: [
      ...(model.buildEquation ? [{ label: 'A', value: matrixText(model.keyA) }, { label: 'B', value: columnText(model.keyB) }] : []),
      { label: 'Solution', value: classification.type === SOLUTION_TYPES.ONE ? `(${classification.solution.map(show).join(', ')})` : classification.type === SOLUTION_TYPES.NONE ? 'No solution' : 'Infinitely many solutions' },
    ],
    steps,
    why: classification.type === SOLUTION_TYPES.ONE
      ? `Check: substitute ${model.variables.map((variable, index) => `${variable} = ${show(classification.solution[index])}`).join(', ')} into each original equation; every one is true.`
      : 'A singular coefficient matrix means two equations have proportional coefficients; the constants decide whether they agree (many) or contradict (none).',
    note: null,
  };
};

const completeReview = (question, model) => {
  if (!model.keyA || !model.targets.length) return null;
  const [first] = model.keyA;
  const firstConstant = model.keyB[0][0];
  const rows = {};
  const items = [];
  for (const target of model.targets) {
    if (target.classification === SOLUTION_TYPES.ONE) return null;
    const doubled = first.map((value) => formatRational({ n: value.n * 2n, d: value.d }));
    const constant = target.classification === SOLUTION_TYPES.MANY
      ? formatRational({ n: firstConstant.n * 2n, d: firstConstant.d })
      : formatRational({ n: firstConstant.n * 2n + firstConstant.d, d: firstConstant.d });
    rows[target.id] = { coefficients: doubled, constant };
    items.push({ label: target.classification === SOLUTION_TYPES.MANY ? 'Infinitely many (one example)' : 'No solution (one example)', value: `${doubled.map((cell) => cell.replace(/-/g, '−')).join(', ')} | ${constant.replace(/-/g, '−')}` });
  }
  if (!accepted(question, { rows })) return null;
  return {
    title: 'Designing the third equation',
    items,
    steps: [
      `Start from equation 1, ${equationLines(model)[0]}, and multiply its coefficients by 2.`,
      'Infinitely many solutions: multiply the constant by 2 as well. The new equation is equation 1 again, so it adds no new condition.',
      'No solution: change the constant to anything else. The new equation then contradicts equation 1.',
    ],
    why: 'Any third equation whose coefficients are a combination of the other two makes the coefficient matrix singular; whether its constant follows the same combination decides many versus none.',
    note: 'Many other equations work too — this is one example.',
  };
};

const buildReview = (question) => {
  if (!question || typeof question !== 'object') return null;
  const model = readMatrixLabQuestion(question);
  if (model.mode === 'locate') return locateReview(question, model);
  if (model.mode === 'operate') return operateReview(question, model);
  if (model.mode === 'equation' || model.mode === 'solve') return systemReview(question, model);
  if (model.mode === 'completeSystem') return completeReview(question, model);
  return null;
};

export const buildMatrixLabReview = (question) => {
  try {
    return buildReview(question);
  } catch {
    return null;
  }
};
