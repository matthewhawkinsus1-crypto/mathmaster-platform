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
 *                   (· the singular reason, where the question asks for it)
 *   completeSystem  one part per requested system type
 */
import declaration from '../declarations/matrixLab.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import { gradedResult } from '../gradingResult.mjs';
import { SOLUTION_TYPES, classifySystem, formatRational, parseCell, sub, toNumber } from '../../toolMath/matrixLab/matrixMath.mjs';
import {
  SINGULAR_CONSTANT,
  cellIsBlank,
  cellMatches,
  classifyCompletedSystem,
  elementNotation,
  equationRowDiagnosis,
  keyAugmentedRows,
  matchEquationRows,
  inSpanOfFewRows,
  matchSituationRows,
  ownRowReason,
  readMatrixLabQuestion,
  singularReasonHolds,
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

// The student's [A | B] as text cells and as exact rows.
const studentSystem = (model, work) => {
  const count = model.keyA.length;
  const width = model.keyA[0].length;
  const A = cellsOf(work?.A, count, width);
  const B = columnOf(work?.B, count);
  return { A, B, rows: studentAugmentedRows(A, B, count, width) };
};

// Per student row, whether it is right. A printed system: each row is one of
// its equations (any order, any nonzero multiple). A hidden one (a modeling
// item): each row is a fact of the situation (matchSituationRows).
const rowVerdicts = (model, rows) => {
  const keyRows = keyAugmentedRows(model.keyA, model.keyB);
  if (model.hiddenSystem) return matchSituationRows(rows, keyRows);
  return matchEquationRows(rows, keyRows).map((entry) => entry !== null);
};

const equationParts = (model, work) => {
  const { A, B, rows } = studentSystem(model, work);
  const right = rowVerdicts(model, rows);
  return rows.map((row, index) => ({
    id: `row${index + 1}`,
    label: `Row ${index + 1} of the matrix equation`,
    isComplete: [...A[index], B[index]].every((cell) => !cellIsBlank(cell)),
    isCorrect: right[index],
    response: `[${A[index].join(', ')} | ${B[index]}]`,
  }));
};

/** Per row, why it is wrong when the lesson names the reason (UI feedback). */
export const matrixEquationDiagnostics = (question, work) => {
  const model = readMatrixLabQuestion(question);
  if (!model.keyA || !['equation', 'solve'].includes(model.mode)) return [];
  const { rows } = studentSystem(model, work);
  const right = rowVerdicts(model, rows);
  // "Copied as printed" needs a printed equation to have copied.
  return rows.map((row, index) => (right[index] || model.hiddenSystem ? null : equationRowDiagnosis(row, model.asWritten[index])));
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
  // The decision weighs `decisionWeight` parts where the author says so (DOL 3:
  // as much as its three rows), shared with its reason where that is asked
  // (the owner, 2026-10-23, A2-17). Unset, each counts one part, as before. A
  // weight moves partial credit only: all parts right is still 100%.
  const reasonAsked = model.justifySingular && model.classification.type !== SOLUTION_TYPES.ONE;
  const decisionPartWeight = model.decisionWeight ? { weight: model.decisionWeight / (reasonAsked ? 2 : 1) } : {};
  parts.push({
    id: 'classification',
    label: 'Number of solutions',
    isComplete: Object.values(SOLUTION_TYPES).includes(classification),
    isCorrect: classification === model.classification.type,
    response: CLASSIFICATION_LABEL[classification] || '',
    ...decisionPartWeight,
  });
  // A singular system's decision needs its reason (P2-2): with three buttons
  // and three tries, "none or many" could be passed on a second guess. The
  // reason is read against the matrices the student holds — their own A and B,
  // or the given ones — and must be true of them and agree with the decision
  // the student CHOSE ("follows" with many, "breaks" with none). So a right
  // reason about wrong rows earns this part (carried-error credit) while the
  // rows and the decision are marked on their own parts.
  if (reasonAsked) {
    const reason = singularReasonOf(work);
    const { A, B } = model.buildEquation
      ? studentSystem(model, work)
      : { A: model.matrices.A?.rows || [], B: model.matrices.B?.rows || [] };
    const decided = classification === SOLUTION_TYPES.NONE || classification === SOLUTION_TYPES.MANY;
    const consistent = reason.constant === (classification === SOLUTION_TYPES.MANY ? SINGULAR_CONSTANT.FOLLOWS : SINGULAR_CONSTANT.BREAKS);
    parts.push({
      id: 'singularReason',
      label: 'Why A has no inverse, and what the constants say',
      isComplete: Boolean(classification),
      isCorrect: decided && consistent && singularReasonHolds(A, B, reason),
      response: decided ? `row ${reason.row} = ${reason.factor} × row ${reason.otherRow}; constants ${reason.constant}` : '',
      ...decisionPartWeight,
    });
  }
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

const singularReasonOf = (work) => {
  const entry = isObject(work?.singularReason) ? work.singularReason : {};
  const constant = choiceText(entry.constant);
  return {
    row: wholeNumber(entry.row),
    otherRow: wholeNumber(entry.otherRow),
    factor: cellText(entry.factor),
    constant: Object.values(SINGULAR_CONSTANT).includes(constant) ? constant : '',
  };
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
        // Sent only where the question asks for it, so every other solve
        // item's work is exactly what it was.
        ...(model.justifySingular ? { singularReason: singularReasonOf({ singularReason: s.singularReason }) } : {}),
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

/* ------------------------------------------------- one list of what to fix */

// "x", "x and z", "x, y and z".
const listWords = (words) => (words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);
const ROUNDED_ADVICE = 'Write the exact fraction, or keep at least 3 decimal places.';
// One sentence per row of wrong cells, in a fixed shape Translate knows:
// "In the inverse matrix, row 2, columns 1 and 2 were rounded too early."
const cellSentences = (where, { rounded, other }) => {
  const byRow = (cells) => {
    const rows = new Map();
    cells.forEach(([i, j]) => rows.set(i, [...(rows.get(i) || []), j + 1]));
    return [...rows];
  };
  const sentence = ([i, columns], singular, plural) => `In ${where}, row ${i + 1}, column${columns.length === 1 ? '' : 's'} ${listWords(columns.map(String))} ${columns.length === 1 ? singular : plural}.`;
  return [
    ...byRow(other).map((group) => sentence(group, 'is not right yet', 'are not right yet')),
    ...byRow(rounded).map((group) => sentence(group, 'was rounded too early', 'were rounded too early')),
    ...(rounded.length ? [ROUNDED_ADVICE] : []),
  ].join(' ');
};

// A decimal with fewer than 3 places that IS the exact value rounded: 3.3 for
// 10/3, 14.8 for 59/4. Said only with a verdict the student can see.
const roundedEarly = (typed, exact) => {
  const match = String(typed ?? '').trim().match(/^[-−+]?\d*\.(\d+)$/);
  const value = parseCell(typed);
  if (!match || !value || !exact) return false;
  const places = match[1].length;
  if (places >= 3) return false;
  return Math.abs(toNumber(sub(value, exact))) <= 0.5 * 10 ** -places + 1e-12;
};

// Wrong cells of a typed matrix against an exact one, split into rounded-early
// and the rest.
const wrongCells = (typed, exact) => {
  const rounded = [];
  const other = [];
  exact.forEach((row, i) => row.forEach((value, j) => {
    const cell = typed[i]?.[j];
    if (cellMatches(cell, value)) return;
    (roundedEarly(cell, value) ? rounded : other).push([i, j]);
  }));
  return { rounded, other };
};

/** The cells the latest verdict marks wrong ("i,j" keys), for the grids. */
export const matrixLabWrongCells = (question, work = {}) => {
  const model = readMatrixLabQuestion(question);
  const keys = ({ rounded, other }) => new Set([...rounded, ...other].map(([i, j]) => `${i},${j}`));
  if (model.mode === 'operate' && model.result) {
    return { entries: keys(wrongCells(cellsOf(work.entries, model.resultDims.rows, model.resultDims.cols), model.result)) };
  }
  if (model.mode === 'solve' && model.askInverse && model.keyInverse) {
    const size = model.keyInverse.length;
    return { inverse: keys(wrongCells(cellsOf(work.inverse, size, size), model.keyInverse)) };
  }
  return {};
};

// A printed equation with no term in a variable ("2x − 3y = 7" has no z):
// the student can see that on screen, so naming it reveals nothing.
const absentVariable = (model, index, row) => {
  const equation = model.equations[index];
  if (!equation || !row) return null;
  const written = String(equation).replace(/\s+/g, '');
  return model.variables.find((variable, k) => !written.includes(variable) && row[k].n !== 0n) || null;
};

const rowReasonText = (model, reason, index) => {
  const n = index + 1;
  if (reason?.startsWith?.('missing:')) {
    const variable = reason.slice('missing:'.length);
    return `Row ${n}: equation ${n} has no ${variable} term. A missing variable still has a place in A — what is its coefficient?`;
  }
  const zeroTerms = model.variables.map((variable) => `0${variable}`).join(' + ');
  if (reason === 'asWritten') return `Row ${n} copies equation ${n} as it is printed. Write that equation in standard form Ax + By + Cz = D first — every variable term on the left, the constant on the right.`;
  if (reason === 'noVariables') return `Row ${n}: ${zeroTerms} has no variable in it, so it says nothing about ${listWords(model.variables)}. Each row needs at least one variable.`;
  if (reason === 'repeats') return `Row ${n}: its coefficients repeat what the other rows already say (a multiple or a combination of them), so A has no inverse. Each row needs a different fact.`;
  if (reason === 'combines') return `Row ${n} combines two of the equations. Each row of A · X = B is one equation of the system, in standard form.`;
  if (reason === 'notAFact') return `Row ${n} is not one of the situation's facts. Each row should say one thing the problem tells you — a count, a total, a comparison — or two of them combined, as when you substitute one into another.`;
  return null;
};

/**
 * WHAT TO FIX, AS ONE LIST (student pass 3, P2-1, P2-3, P2-5, P2-9).
 *
 * The lab used to print one "Reconsider" line per wrong part: a missing
 * variable written as 1 gave five (two rows and x, y, z), and an A⁻¹ with two
 * cells rounded early gave one line that named no cell. This turns the parts
 * of a graded attempt into lines that each name a row, a cell or a field, and
 * cover every wrong part exactly once:
 *
 *   - a wrong row says why when the reason is in the student's own work (no
 *     variable, a repeated row), when it is a known slip (copied as printed),
 *     or, on a printed system, when it combines equations;
 *   - x, y, z that follow from the student's own wrong A and B are one line —
 *     fix the rows, run the calculator again — not three;
 *   - wrong cells of A⁻¹ or of a product are named, and a cell rounded too
 *     early is said to be;
 *   - a third equation with no variables says so.
 *
 * Shown ONLY beside a verdict the student can see: CheckRow renders nothing
 * while the activity withholds outcome feedback (an exit ticket, a quiz, a
 * test before release), because useToolSubmission holds no feedback there.
 * No line states a key value, a key row or a key cell.
 *
 * Returns [{ ids, text }] — `text` null for a part with nothing more to say
 * than its label (the lab shows "Reconsider: <label>").
 */
export const matrixLabFixList = (question, work = {}, parts = []) => {
  const model = readMatrixLabQuestion(question);
  const wrong = list(parts).filter((part) => part && part.graded !== false && !part.isCorrect);
  const wrongIds = new Set(wrong.map((part) => String(part.id)));
  const lines = [];
  const used = new Set();
  const take = (ids, text) => {
    const fresh = ids.filter((id) => wrongIds.has(id) && !used.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => used.add(id));
    lines.push({ ids: fresh, text });
  };

  if (['equation', 'solve'].includes(model.mode) && model.keyA && model.keyB) {
    const { rows } = studentSystem(model, work);
    const keyRows = keyAugmentedRows(model.keyA, model.keyB);
    const diagnoses = matrixEquationDiagnostics(question, work);
    rows.forEach((row, index) => {
      const id = `row${index + 1}`;
      if (!wrongIds.has(id)) return;
      const missing = model.hiddenSystem ? null : absentVariable(model, index, row);
      let reason = diagnoses[index] || (missing ? `missing:${missing}` : null) || ownRowReason(rows, index);
      if (!reason && row) {
        if (model.hiddenSystem) reason = 'notAFact';
        // A combination of TWO printed equations, judged from those two rows
        // alone. Never "in the span of the whole system": for a system with
        // one solution that span is every row true at the solution, so the
        // reason would confirm a guessed value ("1x + 0y + 0z = 2") — an
        // oracle (S1, integration review). Fewer than n rows for the same
        // reason: two rows of a 2 × 2 already span everything.
        else if (inSpanOfFewRows(row, keyRows, Math.min(2, keyRows.length - 1))) reason = 'combines';
      }
      take([id], rowReasonText(model, reason, index));
    });
    const rowsWrong = rows.some((_, index) => wrongIds.has(`row${index + 1}`));

    if (model.mode === 'solve' && model.askInverse && model.keyInverse && wrongIds.has('inverse')) {
      const size = model.keyInverse.length;
      take(['inverse'], cellSentences('the inverse matrix', wrongCells(cellsOf(work.inverse, size, size), model.keyInverse)) || null);
    }

    if (model.mode === 'solve' && model.classification?.type === SOLUTION_TYPES.ONE) {
      const valueIds = model.variables.map((variable) => `value-${variable}`);
      const values = columnOf(work.values, model.variables.length);
      const wrongVariables = model.variables.filter((variable) => wrongIds.has(`value-${variable}`));
      // Carried error: the student's x, y, z are exactly what THEIR A and B
      // give. Said from their own work, so it reveals nothing.
      const own = rowsWrong && rows.every(Boolean) ? classifySystem(rows.map((row) => row.slice(0, -1)), rows.map((row) => [row[row.length - 1]])) : null;
      const carried = own?.type === SOLUTION_TYPES.ONE && values.every((value, index) => cellMatches(value, own.solution[index]));
      if (wrongVariables.length && carried) {
        take(valueIds, `Your ${listWords(model.variables)} are what your A and B give. Fix the rows above, then run the calculator again.`);
      } else {
        const rounded = wrongVariables.filter((variable) => roundedEarly(values[model.variables.indexOf(variable)], model.classification.solution[model.variables.indexOf(variable)]));
        if (rounded.length) take(rounded.map((variable) => `value-${variable}`), `The value${rounded.length === 1 ? '' : 's'} of ${listWords(rounded)} ${rounded.length === 1 ? 'was' : 'were'} rounded too early. ${ROUNDED_ADVICE}`);
        const rest = wrongVariables.filter((variable) => !rounded.includes(variable));
        if (rest.length) take(rest.map((variable) => `value-${variable}`), `Reconsider the value${rest.length === 1 ? '' : 's'} of ${listWords(rest)}.`);
      }
    }
    if (wrongIds.has('singularReason')) {
      take(['singularReason'], 'Why A has no inverse: name two rows of A where one is a multiple of the other, the multiple, and whether the constants follow the same multiple.');
    }
  }

  if (model.mode === 'operate' && model.result) {
    const { rows: height, cols: width } = model.resultDims;
    const cellIds = [];
    for (let i = 0; i < height; i += 1) for (let j = 0; j < width; j += 1) cellIds.push(`r${i + 1}c${j + 1}`);
    if (cellIds.some((id) => wrongIds.has(id))) {
      take(cellIds, cellSentences(model.operation === 'add' ? 'the sum' : 'the product', wrongCells(cellsOf(work.entries, height, width), model.result)) || null);
    }
  }

  if (model.mode === 'completeSystem') {
    const width = model.keyA ? model.keyA[0].length : model.variables.length;
    model.targets.forEach((target) => {
      if (!wrongIds.has(target.id)) return;
      const entry = list(work.rows).find((row) => isObject(row) && String(row.id) === target.id) || {};
      const coefficients = Array.from({ length: width }, (_, index) => cellText(list(entry.coefficients)[index]));
      const noVariables = coefficients.every((cell) => parseCell(cell)) && coefficients.every((cell) => parseCell(cell).n === 0n);
      take([target.id], noVariables
        ? `Your equation for ${CLASSIFICATION_LABEL[target.classification] || 'this system'}: every coefficient is 0, so it is not an equation in ${listWords(model.variables)}. It is true for every ${listWords(model.variables)}, or for none, so it cannot complete the system. Give it at least one variable.`
        : null);
    });
  }

  // Everything not explained above keeps its own line, in the parts' order.
  wrong.forEach((part) => take([String(part.id)], null));
  return lines.map((line) => ({ ...line, labels: line.ids.map((id) => wrong.find((part) => String(part.id) === id)?.label || id) }));
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
