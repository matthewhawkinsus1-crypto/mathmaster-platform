import React, { useMemo, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import ToolShell, { Panel, TaskCard } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import useReportToolWork from '../shared/useReportToolWork.js';
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import useMathUndoHistory, { questionUndoResetKey } from '../../platform/workView/useMathUndoHistory.js';
import MatrixGrid from '../../components/common/MatrixGrid.jsx';
import MathText from '../../components/common/MathText.jsx';
import matrixLabGrader, { matrixLabFixList, matrixLabWork, matrixLabWrongCells } from '../../../functions/shared/serverGrading/tools/matrixLab.mjs';
import {
  SINGULAR_CONSTANT,
  SOLUTION_TYPES,
  elementNotation,
  formatRational,
  parseCell,
  productEntry,
  readMatrixLabQuestion,
} from './matrixLabMath.js';
import MatrixCalculator from './MatrixCalculator.jsx';
import { expansionPlan, negativeInParentheses } from './matrixCalculatorDisplay.js';
import { useMethodWithheld } from '../shared/ToolRuntimeContext';
import { spokenMathValue } from '../shared/spokenMathValue.js';
import {
  CellInput, CheckRow, DimensionsInput, MatrixInput, Step, Symbol, SystemDisplay, VariableMatrix, YesNo,
  buttonStyle, ChoiceRadios, choiceStyle, resizeCells, setCell,
} from './matrixLabUi.jsx';

/*
 * MATRIX LAB — Algebra II, solving systems with matrices (A2.3B).
 *
 *   locate          dimensions, and the element a_ij: tap it, or write its notation
 *   operate         is A·B defined, what size is it, fill it in row × column,
 *                   and are the two matrices inverses
 *   equation        write a system as A·X = B (standard form first)
 *   solve           write A·X = B, use the matrix calculator, report or classify
 *   completeSystem  write a third equation for no solution / infinitely many
 *
 * Every verdict is the shared grader's (functions/shared/serverGrading/tools/
 * matrixLab.mjs), the same function the server records.
 */

const SHELL = {
  locate: { title: 'Matrix Lab', subtitle: 'Read a matrix: its dimensions, and where each element lives.', badge: 'Algebra II · Matrices' },
  operate: { title: 'Matrix Lab', subtitle: 'Multiply matrices row by column — and decide when a product exists.', badge: 'Algebra II · Matrix operations' },
  equation: { title: 'Matrix Lab', subtitle: 'Write a system of equations as one matrix equation, A · X = B.', badge: 'Algebra II · Matrix equations' },
  solve: { title: 'Matrix Lab', subtitle: 'Solve A · X = B with matrix technology: X = A⁻¹B.', badge: 'Algebra II · Solving with matrices' },
  completeSystem: { title: 'Matrix Lab', subtitle: 'Design a system: what makes it have no solution, or infinitely many?', badge: 'Algebra II · Singular systems' },
};

function useLabSubmission(questionData, onAction, work, mode) {
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);
  useReportToolWork(work);
  const check = () => {
    const result = gradeToolCheck(matrixLabGrader, questionData, work);
    submit({ isCorrect: result.isCorrect, score: result.score }, work, { mode, parts: result.parts });
  };
  // What to fix, read from the work that was checked (the verdict clears when
  // the student edits it). `feedback` is null wherever outcome feedback is
  // withheld, so on an exit ticket or a test there is no list and no mark.
  const missed = feedback && !feedback.isCorrect ? feedback : null;
  const fixList = useMemo(() => (missed ? matrixLabFixList(questionData, missed.response || {}, missed.metadata?.parts) : []), [missed, questionData]);
  const wrongCells = useMemo(() => (missed ? matrixLabWrongCells(questionData, missed.response || {}) : {}), [missed, questionData]);
  return { feedback, check, clearFeedback, fixList, wrongCells };
}

// A press on the lab's matrix calculator is a calculator use, recorded like the
// platform calculator (P2-12): DOL 2's record said "calculator not used" after
// [A]⁻¹·[B]. QuestionEngine sets calculatorUsed; other hosts ignore it.
const reportCalculator = (onAction) => () => onAction?.('CALCULATOR_USED');

/*
 * NOTHING THAT IS NOT AN ANSWER COSTS A TRY (P2-10).
 *
 * Check used to need only non-empty cells, so a bare "−" typed for "−y" enabled
 * it, was graded wrong and spent a try with nothing but "Reconsider: Row 1".
 * A cell that is not a number keeps Check off and says why, before anything is
 * counted. It describes only what was typed, so it is shown on an exit ticket
 * too. `whole` fields (dimensions, a row or column number) need a whole number.
 */
const SIGN_ONLY = /^[+\-−–]$/;
const formatProblem = (fields = []) => {
  for (const field of fields) {
    const raw = String(field.value ?? '').trim();
    if (!raw) continue;
    const readable = field.whole ? /^\d+$/.test(raw) : Boolean(parseCell(raw));
    if (readable) continue;
    if (SIGN_ONLY.test(raw)) return `${field.label}: “${raw}” alone is not a number. For a term like ${raw === '+' ? '+y' : '−y'}, write ${raw === '+' ? '1' : '−1'}. No try has been used.`;
    if (field.whole) return `${field.label}: “${raw}” is not a whole number. No try has been used.`;
    return `${field.label}: “${raw}” is not a number yet. Write an integer, a decimal or a fraction such as 2/3. No try has been used.`;
  }
  return null;
};
const gridFields = (cells, label) => cells.flatMap((row, i) => row.map((value, j) => ({ value, label: label(i, j) })));
const sameCells = (left, right) => JSON.stringify(left) === JSON.stringify(right);
// An authored start the student has not changed is not refused — an item
// published with a right start must stay answerable — but Check asks once
// before it spends a try on it (S3, integration review). CheckRow words it
// with the button's own name ("press Submit again" where the press spends a
// try; D9), so it never says Check beside a Submit button.
const UNTOUCHED_START = (actionName) => `This is the matrix equation as it was given. Change what needs fixing, or press ${actionName} again if it is right as it is.`;

function useLabUndo(questionData, state, restore, clearFeedback, label) {
  return useMathUndoHistory({
    label,
    state,
    resetKey: questionUndoResetKey(questionData),
    onRestore: (restored) => {
      restore(restored || {});
      clearFeedback();
    },
  });
}

export default function MatrixLab({ questionData = {}, onAction }) {
  const model = useMemo(() => readMatrixLabQuestion(questionData), [questionData]);
  const shell = SHELL[model.mode] || SHELL.operate;
  let body;
  if (model.mode === 'locate') body = <LocateMode questionData={questionData} model={model} onAction={onAction} />;
  else if (model.mode === 'equation') body = <EquationMode questionData={questionData} model={model} onAction={onAction} />;
  else if (model.mode === 'solve') body = <SolveMode questionData={questionData} model={model} onAction={onAction} />;
  else if (model.mode === 'completeSystem') body = <CompleteSystemMode questionData={questionData} model={model} onAction={onAction} />;
  else body = <OperateMode questionData={questionData} model={model} onAction={onAction} />;
  return <ToolShell title={shell.title} subtitle={shell.subtitle} badge={shell.badge}>{body}</ToolShell>;
}

/* ------------------------------------------------------------------ locate */

function LocateMode({ questionData, model, onAction }) {
  const matrix = model.matrix;
  const [dimensions, setDimensions] = usePersistentToolState('dimensions', { rows: '', cols: '' });
  const [targets, setTargets] = usePersistentToolState('targets', {});
  const tapTargets = model.targets.filter((target) => target.kind === 'tap');
  const [activeId, setActiveId] = useState(() => tapTargets.find((target) => !targets?.[target.id])?.id || tapTargets[0]?.id || null);
  const work = useMemo(() => matrixLabWork(questionData, { dimensions, targets }), [questionData, dimensions, targets]);
  const { feedback, check, clearFeedback, fixList } = useLabSubmission(questionData, onAction, work, 'locate');
  useLabUndo(questionData, { dimensions, targets }, (restored) => {
    setDimensions(restored.dimensions || { rows: '', cols: '' });
    setTargets(restored.targets || {});
  }, clearFeedback, 'Undo the last matrix-reading change');
  if (!matrix?.values) return <p>This question's matrix could not be read.</p>;

  const letter = model.matrixName;
  const place = (target, row, col) => {
    clearFeedback();
    const next = { ...targets, [target]: { row, col } };
    setTargets(next);
    const following = tapTargets.find((entry) => entry.id !== target && !next[entry.id]);
    if (following) setActiveId(following.id);
  };
  const tappedBy = (i, j) => tapTargets.filter((target) => targets?.[target.id]?.row === i + 1 && targets?.[target.id]?.col === j + 1);
  const describe = (row, col) => {
    const value = matrix.rows[row - 1]?.[col - 1];
    if (value === undefined) return '';
    const rowName = matrix.rowLabels ? ` (${matrix.rowLabels[row - 1]})` : '';
    const colName = matrix.colLabels ? ` (${matrix.colLabels[col - 1]})` : '';
    return `row ${row}${rowName}, column ${col}${colName}: the value there is ${value}`;
  };
  const blocker = formatProblem([
    ...(model.askDimensions ? [{ value: dimensions.rows, label: 'Number of rows', whole: true }, { value: dimensions.cols, label: 'Number of columns', whole: true }] : []),
    ...model.targets.filter((target) => target.kind === 'notation').flatMap((target, index) => [
      { value: targets?.[target.id]?.row, label: `Element ${index + 1}, row number`, whole: true },
      { value: targets?.[target.id]?.col, label: `Element ${index + 1}, column number`, whole: true },
    ]),
  ]);
  const complete = !blocker && (!model.askDimensions || (String(dimensions.rows).trim() && String(dimensions.cols).trim()))
    && model.targets.every((target) => targets?.[target.id]?.row && targets?.[target.id]?.col);

  return (
    <>
      <TaskCard question={questionData} task="Read the matrix: its dimensions, and the elements the question names." steps={['Dimensions are rows × columns: count the rows first.', `The element ${elementNotation(letter, 'i', 'j').replace(/i/, 'ᵢ').replace(/j$/, 'ⱼ')} is in row i and column j — row first, then column.`, 'For an element named in words, find its row and column, then write the row number first.']} />
      <Panel title={`Matrix ${letter}`}>
        <div style={{ display: 'flex', justifyContent: 'safe center' }}>
          <MatrixGrid
            name={letter}
            rows={matrix.rows}
            rowLabels={matrix.rowLabels}
            colLabels={matrix.colLabels}
            rowTitle={matrix.rowTitle}
            colTitle={matrix.colTitle}
            ariaLabel={`Matrix ${letter}. ${activeId ? 'Tap the cell for the element you are placing.' : ''}`}
            renderCell={(i, j, value) => {
              const chips = tappedBy(i, j);
              const active = tapTargets.find((target) => target.id === activeId);
              return (
                <button
                  type="button"
                  onClick={() => active && place(active.id, i + 1, j + 1)}
                  disabled={!active}
                  aria-label={`Row ${i + 1}, column ${j + 1}: ${spokenMathValue(String(value ?? ''))}${chips.length ? `, chosen for ${chips.map((chip) => elementNotation(letter, chip.row, chip.col)).join(', ')}` : ''}`}
                  style={{ ...buttonStyle, minWidth: 48, padding: '6px 8px', fontSize: 'calc(19 * var(--mm-px))', position: 'relative', background: chips.length ? 'var(--mm-primary-subtle)' : 'var(--mm-surface)', border: chips.length ? '2px solid var(--mm-primary)' : '1px solid var(--mm-tint-border)', cursor: active ? 'pointer' : 'default' }}
                >
                  {String(value).replace(/-/g, '−')}
                  {chips.length ? <span aria-hidden="true" style={{ position: 'absolute', top: -9, right: -6, background: 'var(--mm-primary)', color: 'var(--mm-on-primary)', borderRadius: 8, padding: '0 5px', fontSize: 'calc(11 * var(--mm-px))' }}>{chips.map((chip) => elementNotation(letter, chip.row, chip.col)).join(' ')}</span> : null}
                </button>
              );
            }}
          />
        </div>
      </Panel>
      {model.askDimensions ? (
        <Step number={1} title={`Dimensions of matrix ${letter}`}>
          <span style={{ marginRight: 10 }}>Matrix {letter} is</span>
          <DimensionsInput value={dimensions} label={`Dimensions of matrix ${letter}`} onChange={(next) => { clearFeedback(); setDimensions(next); }} />
        </Step>
      ) : null}
      {model.targets.length ? (
        <Step number={model.askDimensions ? 2 : 1} title="Elements">
          <ol style={{ margin: 0, paddingLeft: 20, display: 'grid', gap: 12 }}>
            {model.targets.map((target) => {
              const chosen = targets?.[target.id];
              if (target.kind === 'tap') {
                const name = elementNotation(letter, target.row, target.col);
                return (
                  <li key={target.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <button type="button" aria-pressed={activeId === target.id} onClick={() => setActiveId(target.id)} style={choiceStyle(activeId === target.id)}>
                        Tap {name}
                      </button>
                      <span style={{ color: 'var(--mm-text-muted)' }}>{chosen ? `You chose ${describe(chosen.row, chosen.col)}.` : activeId === target.id ? 'Now tap its cell in the matrix.' : 'Select, then tap its cell.'}</span>
                    </div>
                  </li>
                );
              }
              return (
                <li key={target.id}>
                  <MathText as="div" style={{ marginBottom: 6 }}>{target.description}</MathText>
                  <span role="group" aria-label={`Matrix notation for ${target.description}`} style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2 }}>
                    <span style={{ fontStyle: 'italic', fontFamily: 'serif', fontSize: 'calc(24 * var(--mm-px))', fontWeight: 700 }}>{letter.toLowerCase()}</span>
                    <CellInput value={chosen?.row ?? ''} label={`Row number for ${target.description}`} onChange={(row) => { clearFeedback(); setTargets({ ...targets, [target.id]: { ...chosen, row } }); }} style={{ width: 48, minWidth: 44, fontSize: 'calc(15 * var(--mm-px))' }} />
                    <CellInput value={chosen?.col ?? ''} label={`Column number for ${target.description}`} onChange={(col) => { clearFeedback(); setTargets({ ...targets, [target.id]: { ...chosen, col } }); }} style={{ width: 48, minWidth: 44, fontSize: 'calc(15 * var(--mm-px))' }} />
                  </span>
                  <span style={{ marginLeft: 8, color: 'var(--mm-text-muted)', fontSize: 'calc(13 * var(--mm-px))' }}>row, then column</span>
                </li>
              );
            })}
          </ol>
        </Step>
      ) : null}
      <CheckRow label="Check matrix reading" onCheck={check} enabled={Boolean(complete)} feedback={feedback} fixList={fixList} blocker={blocker} />
    </>
  );
}

/* ----------------------------------------------------------------- operate */

/*
 * THE ROW-BY-COLUMN TERMS OF THE FOCUSED PRODUCT CELL, and, where they fade
 * (R-7), the button that asks for them. The terms name the products and leave
 * the adding to the student. The button is a disclosure: it stays on screen
 * while the terms show, so a keyboard student who asked for them keeps their
 * place and can hide them again. expansionPlan decides what is drawn.
 */
export function ProductExpansion({ authored, focus, requested = null, methodWithheld = false, left, right, onToggle = () => {} }) {
  const plan = expansionPlan({ authored, focus, requested, methodWithheld });
  if (!plan.show && !plan.offer) return null;
  const terms = plan.show ? productEntry(left.values, right.values, focus.i, focus.j).terms : null;
  return (
    <>
      {plan.offer ? (
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button type="button" aria-expanded={plan.show} onClick={() => onToggle({ i: focus.i, j: focus.j })} style={buttonStyle}>
            {plan.show ? 'Hide' : 'Show'} the multiplication for this cell
          </button>
        </div>
      ) : null}
      {terms ? (
        <p aria-live="polite" style={{ textAlign: 'center', margin: '12px 0 0', fontSize: 'calc(17 * var(--mm-px))' }}>
          Row {focus.i + 1} of {left.name} · column {focus.j + 1} of {right.name} ={' '}
          <MathText>{terms.map((term) => `${negativeInParentheses(formatRational(term.left))}(${formatRational(term.right)})`.replace(/-/g, '−')).join(' + ')}</MathText>
        </p>
      ) : null}
    </>
  );
}

function OperateMode({ questionData, model, onAction }) {
  const { leftMatrix, rightMatrix } = model;
  const [defined, setDefined] = usePersistentToolState('defined', '');
  const [dimensions, setDimensions] = usePersistentToolState('dimensions', { rows: '', cols: '' });
  const [entries, setEntries] = usePersistentToolState('entries', []);
  const [inverses, setInverses] = usePersistentToolState('inverses', '');
  const [focus, setFocus] = useState(null);
  // Which product cell the student asked to see the terms of (a fading expansion, R-7).
  const [requestedCell, setRequestedCell] = useState(null);
  const methodWithheld = useMethodWithheld();
  const work = useMemo(() => matrixLabWork(questionData, { defined, dimensions, entries, inverses }), [questionData, defined, dimensions, entries, inverses]);
  const { feedback, check, clearFeedback, fixList, wrongCells } = useLabSubmission(questionData, onAction, work, 'operate');
  useLabUndo(questionData, { defined, dimensions, entries, inverses }, (restored) => {
    setDefined(restored.defined || '');
    setDimensions(restored.dimensions || { rows: '', cols: '' });
    setEntries(restored.entries || []);
    setInverses(restored.inverses || '');
  }, clearFeedback, 'Undo the last matrix-operation change');
  if (!leftMatrix?.values || !rightMatrix?.values) return <p>This question's matrices could not be read.</p>;

  const symbol = model.operation === 'add' ? '+' : '·';
  const typedRows = Number(dimensions.rows);
  const typedCols = Number(dimensions.cols);
  const typedDims = Number.isInteger(typedRows) && Number.isInteger(typedCols) && typedRows >= 1 && typedCols >= 1 && typedRows <= 8 && typedCols <= 8;
  // Without a "defined?" step the grid is the product's own size. With one, it
  // is the size the student predicted — a wrong prediction builds a grid that
  // cannot hold the product, which is the lesson.
  const gridDims = !model.askDefined
    ? model.resultDims
    : (defined === 'yes' && typedDims ? { rows: typedRows, cols: typedCols } : null);
  const grid = gridDims ? resizeCells(entries, gridDims.rows, gridDims.cols) : [];
  const editEntry = (i, j, value) => {
    clearFeedback();
    setEntries(setCell(resizeCells(entries, gridDims.rows, gridDims.cols), i, j, value));
  };
  const focusHasTerms = Boolean(focus) && model.operation === 'multiply'
    && focus.i < leftMatrix.dims.rows && focus.j < rightMatrix.dims.cols && leftMatrix.dims.cols === rightMatrix.dims.rows;
  const highlightLeft = focus && model.operation === 'multiply' ? focus.i : null;
  const highlightRight = focus && model.operation === 'multiply' ? focus.j : null;
  const showGrid = model.fillResult && gridDims;
  const blocker = formatProblem([
    ...(model.askDefined && defined === 'yes' ? [{ value: dimensions.rows, label: 'Number of rows', whole: true }, { value: dimensions.cols, label: 'Number of columns', whole: true }] : []),
    ...(model.fillResult && gridDims ? gridFields(grid, (i, j) => `${model.resultName}, row ${i + 1}, column ${j + 1}`) : []),
  ]);
  const complete = !blocker && (!model.askDefined || defined === 'no' || (defined === 'yes' && typedDims))
    && (!model.fillResult || defined === 'no' || (gridDims && grid.every((row) => row.every((cell) => String(cell).trim()))))
    && (!model.judgeInverse || inverses);
  let stepNumber = 0;
  const nextStep = () => { stepNumber += 1; return stepNumber; };

  return (
    <>
      <TaskCard
        question={questionData}
        task={model.operation === 'add' ? `Add ${model.left} + ${model.right}.` : `Multiply ${model.left} · ${model.right}.`}
        steps={model.operation === 'add'
          ? ['Matrices add only when they have the same dimensions.', 'Add the elements in matching positions.']
          : ['A·B is defined only when the number of COLUMNS of A equals the number of ROWS of B.', 'The product has the rows of A and the columns of B ("outer dimensions").', 'Entry (p, q) = row p of A times column q of B: multiply matching elements and add.']}
      />
      <Panel title="The matrices">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'safe center', gap: 10, flexWrap: 'wrap' }}>
          <MatrixGrid name={model.left} rows={leftMatrix.rows} rowLabels={leftMatrix.rowLabels} colLabels={leftMatrix.colLabels} rowTitle={leftMatrix.rowTitle} colTitle={leftMatrix.colTitle} highlightRow={highlightLeft} caption={leftMatrix.caption} />
          <Symbol>{symbol}</Symbol>
          <MatrixGrid name={model.right} rows={rightMatrix.rows} rowLabels={rightMatrix.rowLabels} colLabels={rightMatrix.colLabels} rowTitle={rightMatrix.rowTitle} colTitle={rightMatrix.colTitle} highlightCol={highlightRight} caption={rightMatrix.caption} />
        </div>
        {model.showExpansion ? (
          <p style={{ textAlign: 'center', color: 'var(--mm-text-muted)', margin: '10px 0 0' }}>
            {model.left} is {leftMatrix.dims.rows} × {leftMatrix.dims.cols}; {model.right} is {rightMatrix.dims.rows} × {rightMatrix.dims.cols}.
          </p>
        ) : null}
      </Panel>
      {model.askDefined ? (
        <Step number={nextStep()} title={`Is ${model.operationLabel} defined?`}>
          <YesNo value={defined} label={`Is ${model.operationLabel} defined?`} onChange={(value) => { clearFeedback(); setDefined(value); }} />
          {defined === 'yes' ? (
            <div style={{ marginTop: 12 }}>
              <span style={{ marginRight: 10 }}>{model.operationLabel} is</span>
              <DimensionsInput value={dimensions} label={`Dimensions of ${model.operationLabel}`} onChange={(next) => { clearFeedback(); setDimensions(next); }} />
            </div>
          ) : null}
        </Step>
      ) : null}
      {/* The calculator BESIDE the grid it feeds, where there is room (P2-8):
          below it, a student scrolled down to press [G]·[H] and back up to
          copy nine numbers, and a copy slip cost a try. On a phone they stack. */}
      <div data-matrix-grid-and-calculator="" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', columnGap: 12 }}>
        {showGrid ? (
          <div style={{ flex: '1 1 360px', minWidth: 0 }}>
            <Step number={nextStep()} title={model.resultName === model.operationLabel || model.resultName === `${model.left}${model.right}` ? `Fill in ${model.operationLabel}` : `Fill in ${model.operationLabel} (${model.resultName})`} note={model.operation === 'multiply' ? 'Tap a cell: its row of the first matrix and its column of the second light up.' : null}>
              <div style={{ display: 'flex', justifyContent: 'safe center' }}>
                <MatrixInput
                  name={model.resultName}
                  cells={grid}
                  rowLabels={gridDims.rows === model.resultDims?.rows ? model.resultRowLabels : null}
                  colLabels={gridDims.cols === model.resultDims?.cols ? model.resultColLabels : null}
                  onCell={editEntry}
                  onFocusCell={(i, j) => setFocus({ i, j })}
                  highlightRow={focus?.i ?? null}
                  highlightCol={focus?.j ?? null}
                  invalidCells={wrongCells.entries || null}
                />
              </div>
              <ProductExpansion
                authored={questionData.showExpansion}
                focus={focusHasTerms ? focus : null}
                requested={requestedCell}
                methodWithheld={methodWithheld}
                left={{ name: model.left, values: leftMatrix.values }}
                right={{ name: model.right, values: rightMatrix.values }}
                onToggle={(cell) => setRequestedCell((current) => (current && current.i === cell.i && current.j === cell.j ? null : cell))}
              />
            </Step>
          </div>
        ) : null}
        {model.technology.length ? (
          <div style={{ flex: '1 1 300px', minWidth: 0 }}>
            <MatrixCalculator
              left={{ name: model.left, cells: leftMatrix.rows }}
              right={{ name: model.right, cells: rightMatrix.rows }}
              operations={model.technology}
              onRun={reportCalculator(onAction)}
            />
          </div>
        ) : null}
      </div>
      {model.judgeInverse && (!model.askDefined || defined === 'yes') ? (
        <Step number={nextStep()} title={`Are ${model.left} and ${model.right} inverses?`} note="Two matrices are inverses when their product is the identity matrix I.">
          <YesNo value={inverses} label={`Are ${model.left} and ${model.right} inverses?`} onChange={(value) => { clearFeedback(); setInverses(value); }} />
        </Step>
      ) : null}
      <CheckRow label={model.operation === 'add' ? 'Check the sum' : 'Check the product'} onCheck={check} enabled={Boolean(complete)} feedback={feedback} fixList={fixList} blocker={blocker} />
    </>
  );
}

/* ------------------------------------------------- equation · solve shared */

function MatrixEquationBuilder({ model, A, B, onA, onB }) {
  const width = model.variables.length;
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'safe center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ textAlign: 'center' }}>
        <MatrixInput name="A" cells={A} onCell={onA} labelFor={(i, j) => `Coefficient matrix A, row ${i + 1}, coefficient of ${model.variables[j]}`} />
        <div style={{ fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>coefficient matrix</div>
      </div>
      <Symbol>·</Symbol>
      <div style={{ textAlign: 'center' }}>
        <VariableMatrix variables={model.variables} />
        <div style={{ fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>variable matrix X</div>
      </div>
      <Symbol>=</Symbol>
      <div style={{ textAlign: 'center' }}>
        <MatrixInput name="B" showName={false} cells={B.map((cell) => [cell])} onCell={(i, _j, value) => onB(i, value)} labelFor={(i) => `Constant matrix B, row ${i + 1}`} />
        <div style={{ fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)' }}>constant matrix B</div>
      </div>
      <span style={{ width: '100%', textAlign: 'center', color: 'var(--mm-text-muted)', fontSize: 'calc(12 * var(--mm-px))' }}>{width} variables · {width} equations</span>
    </div>
  );
}

const startCells = (model) => {
  const count = model.keyA ? model.keyA.length : model.equations.length || 3;
  const width = model.variables.length;
  return {
    A: resizeCells(model.startA, count, width),
    B: Array.from({ length: count }, (_, i) => model.startB[i] ?? ''),
  };
};

// The cells of A · X = B, named the way a format message says them.
const equationFields = (model, A, B) => [
  ...gridFields(A, (i, j) => `Row ${i + 1} of A, coefficient of ${model.variables[j]}`),
  ...B.map((value, i) => ({ value, label: `Row ${i + 1} of B` })),
];
// Authored starting cells (Nicky's matrix) that the student has not changed.
const untouchedStart = (model, initial, A, B) => (model.startA.length > 0 || model.startB.some((cell) => String(cell).trim() !== ''))
  && sameCells(A, initial.A) && sameCells(B, initial.B);

/* ---------------------------------------------------------------- equation */

function EquationMode({ questionData, model, onAction }) {
  const initial = useMemo(() => startCells(model), [model]);
  const [A, setA] = usePersistentToolState('A', initial.A);
  const [B, setB] = usePersistentToolState('B', initial.B);
  const work = useMemo(() => matrixLabWork(questionData, { A, B }), [questionData, A, B]);
  const { feedback, check, clearFeedback, fixList } = useLabSubmission(questionData, onAction, work, 'equation');
  useLabUndo(questionData, { A, B }, (restored) => {
    setA(restored.A || initial.A);
    setB(restored.B || initial.B);
  }, clearFeedback, 'Undo the last matrix-equation change');
  const blocker = formatProblem(equationFields(model, A, B));
  const confirm = untouchedStart(model, initial, A, B) ? UNTOUCHED_START : null;
  const complete = !blocker && A.every((row) => row.every((cell) => String(cell).trim())) && B.every((cell) => String(cell).trim());
  return (
    <>
      <TaskCard question={questionData} task="Write the system as a matrix equation A · X = B." steps={['Write every equation in standard form Ax + By + Cz = D.', 'Row i of A holds the coefficients of equation i, in the order x, y, z. A missing variable has coefficient 0.', 'B holds the constants, in the same order.']} />
      <Panel title="The system">
        <div style={{ display: 'flex', justifyContent: 'safe center' }}><SystemDisplay equations={model.equations} /></div>
      </Panel>
      <Step number={1} title="Write the matrix equation">
        <MatrixEquationBuilder model={model} A={A} B={B} onA={(i, j, value) => { clearFeedback(); setA(setCell(A, i, j, value)); }} onB={(i, value) => { clearFeedback(); setB(B.map((cell, index) => (index === i ? value : cell))); }} />
      </Step>
      <CheckRow label="Check the matrix equation" onCheck={check} enabled={complete} feedback={feedback} fixList={fixList} blocker={blocker} confirm={confirm} />
    </>
  );
}

/* ------------------------------------------------------------------- solve */

const EMPTY_REASON = Object.freeze({ row: '', otherRow: '', factor: '', constant: '' });

/*
 * WHY A SINGULAR SYSTEM HAS NO SOLUTION OR INFINITELY MANY (P2-2).
 *
 * Three buttons and three tries let a student pass "none or many" on a second
 * guess. So the decision comes with its reason, read from the student's own A
 * and B: which row is a multiple of which, by what, and whether the constants
 * follow. Only the rows and the arithmetic on screen decide it. It is graded
 * where the question asks (justifySingular), and asked on every solve item
 * (TS08).
 */
function SingularReason({ size, value, onChange }) {
  const rows = Array.from({ length: size }, (_, index) => String(index + 1));
  const selectStyle = { minHeight: 44, borderRadius: 8, border: '1.5px solid var(--mm-tint-border)', background: 'var(--mm-surface)', color: 'var(--mm-text-strong)', padding: '6px 8px', fontSize: 'calc(16 * var(--mm-px))' };
  const rowSelect = (field, label) => (
    <select aria-label={label} value={value[field] || ''} onChange={(event) => onChange({ [field]: event.target.value })} style={selectStyle}>
      <option value="">row …</option>
      {rows.map((row) => <option key={row} value={row}>{`row ${row}`}</option>)}
    </select>
  );
  return (
    <div role="group" aria-label="Why the calculator finds no inverse" data-singular-reason="" style={{ marginTop: 12, display: 'grid', gap: 10 }}>
      <p style={{ margin: 0, fontWeight: 700 }}>Why? Show it from the rows of A.</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span>In A,</span>
        {rowSelect('row', 'The row that is a multiple')}
        <span>is</span>
        <CellInput value={value.factor} label="The multiple" onChange={(factor) => onChange({ factor })} style={{ width: 72 }} />
        <span>times</span>
        {rowSelect('otherRow', 'The row it is a multiple of')}
        <span>.</span>
      </div>
      <ChoiceRadios
        label="Do the constants in B follow the same multiple?"
        lead={<span>The constants in B</span>}
        options={[[SINGULAR_CONSTANT.FOLLOWS, 'follow the same multiple'], [SINGULAR_CONSTANT.BREAKS, 'do not follow it']]}
        value={value.constant}
        onChange={(constant) => onChange({ constant })}
        style={{ alignItems: 'center' }}
      />
    </div>
  );
}

const CLASSIFICATIONS = [
  [SOLUTION_TYPES.ONE, 'Exactly one solution'],
  [SOLUTION_TYPES.NONE, 'No solution'],
  [SOLUTION_TYPES.MANY, 'Infinitely many solutions'],
];

function SolveMode({ questionData, model, onAction }) {
  const initial = useMemo(() => startCells(model), [model]);
  const [A, setA] = usePersistentToolState('A', initial.A);
  const [B, setB] = usePersistentToolState('B', initial.B);
  const size = model.variables.length;
  const [inverse, setInverse] = usePersistentToolState('inverse', resizeCells([], size, size));
  const [classification, setClassification] = usePersistentToolState('classification', '');
  const [values, setValues] = usePersistentToolState('values', model.variables.map(() => ''));
  const [usedTechnology, setUsedTechnology] = usePersistentToolState('usedTechnology', false);
  const [singularReason, setSingularReason] = usePersistentToolState('singularReason', EMPTY_REASON);
  const state = { A, B, inverse, classification, values, usedTechnology, singularReason };
  const work = useMemo(() => matrixLabWork(questionData, state), [questionData, A, B, inverse, classification, values, usedTechnology, singularReason]); // eslint-disable-line react-hooks/exhaustive-deps
  const { feedback, check, clearFeedback, fixList, wrongCells } = useLabSubmission(questionData, onAction, work, 'solve');
  useLabUndo(questionData, { A, B, inverse, classification, values, singularReason }, (restored) => {
    setA(restored.A || initial.A);
    setB(restored.B || initial.B);
    setInverse(restored.inverse || resizeCells([], size, size));
    setClassification(restored.classification || '');
    setValues(restored.values || model.variables.map(() => ''));
    setSingularReason(restored.singularReason || EMPTY_REASON);
  }, clearFeedback, 'Undo the last solving change');

  // The calculator holds what the student wrote — or, when the question gives
  // A and B, those matrices as given.
  const givenA = model.matrices.A?.rows;
  const givenB = model.matrices.B?.rows;
  const loadedA = model.buildEquation ? A : givenA;
  const loadedB = model.buildEquation ? B.map((cell) => [cell]) : givenB;
  const built = model.buildEquation
    ? A.every((row) => row.every((cell) => String(cell).trim())) && B.every((cell) => String(cell).trim())
    : true;
  const inverseDone = !model.askInverse || inverse.every((row) => row.every((cell) => String(cell).trim()));
  // THE REASON ON EVERY "NONE" OR "MANY" (TS08). Asked only where the
  // question grades it (justifySingular), which a singular system does by
  // default, its absence told a student who chose "No solution" that the
  // system was not singular. Every solve item now asks it the same way, and
  // waits for it the same way. Where the question does not grade it, the
  // reason is never sent (matrixLabWork), so it shows no verdict and changes
  // no score.
  const asksReason = classification === SOLUTION_TYPES.NONE || classification === SOLUTION_TYPES.MANY;
  const reasonDone = !asksReason || (singularReason.row && singularReason.otherRow && String(singularReason.factor).trim() && singularReason.constant);
  const answered = classification && (classification !== SOLUTION_TYPES.ONE || values.every((value) => String(value).trim())) && reasonDone;
  const blocker = formatProblem([
    ...(model.buildEquation ? equationFields(model, A, B) : []),
    ...(model.askInverse ? gridFields(inverse, (i, j) => `A⁻¹, row ${i + 1}, column ${j + 1}`) : []),
    ...(classification === SOLUTION_TYPES.ONE ? values.map((value, index) => ({ value, label: `The value of ${model.variables[index]}` })) : []),
    ...(asksReason ? [{ value: singularReason.factor, label: 'The multiple' }] : []),
  ]);
  const confirm = model.buildEquation && untouchedStart(model, initial, A, B) ? UNTOUCHED_START : null;
  const complete = !blocker && built && inverseDone && answered;
  const editReason = (patch) => { clearFeedback(); setSingularReason({ ...EMPTY_REASON, ...singularReason, ...patch }); };
  const meaning = (variable) => model.variableMeanings?.[variable] || null;
  let stepNumber = 0;
  const nextStep = () => { stepNumber += 1; return stepNumber; };

  return (
    <>
      <TaskCard question={questionData} task="Solve the system with matrices: write A · X = B, then use the calculator to find X = A⁻¹B." steps={['Write each equation in standard form, then build A and B.', 'Run [A]⁻¹·[B] on the calculator.', 'If the calculator reports ERR: SINGULAR MATRIX, A has no inverse: the system has no solution or infinitely many. Compare the rows to decide which.']} />
      <Panel title={model.showEquations ? 'The system' : 'The variables'}>
        <div style={{ display: 'flex', justifyContent: 'safe center', flexWrap: 'wrap', gap: 12 }}>
          {model.equations.length && model.showEquations ? <SystemDisplay equations={model.equations} /> : null}
          {!model.buildEquation && givenA ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'safe center' }}>
              <MatrixGrid name="A" rows={givenA} />
              <Symbol>·</Symbol>
              <VariableMatrix variables={model.variables} />
              <Symbol>=</Symbol>
              <MatrixGrid name="B" showName={false} rows={givenB || []} />
            </div>
          ) : null}
        </div>
        {model.variableMeanings ? (
          <dl style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'safe center', gap: '6px 18px', margin: '10px 0 0', color: 'var(--mm-text)' }}>
            {model.variables.filter(meaning).map((variable) => (
              <div key={variable} style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                <dt style={{ fontStyle: 'italic', fontFamily: 'serif', fontWeight: 700 }}>{variable} =</dt>
                <dd style={{ margin: 0 }}>{meaning(variable)}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </Panel>
      {model.buildEquation ? (
        <Step number={nextStep()} title="Write the matrix equation A · X = B">
          <MatrixEquationBuilder model={model} A={A} B={B} onA={(i, j, value) => { clearFeedback(); setA(setCell(A, i, j, value)); }} onB={(i, value) => { clearFeedback(); setB(B.map((cell, index) => (index === i ? value : cell))); }} />
        </Step>
      ) : null}
      <Step number={nextStep()} title="Use matrix technology" note={model.buildEquation ? 'The calculator holds YOUR A and B. If they are wrong, its answer will be too.' : null}>
        <MatrixCalculator
          left={{ name: 'A', cells: loadedA }}
          right={{ name: 'B', cells: loadedB }}
          operations={model.technology}
          onRun={(operation) => {
            reportCalculator(onAction)();
            if (['inverse', 'inverseTimes'].includes(operation) && !usedTechnology) setUsedTechnology(true);
          }}
        />
        {model.askInverse ? (
          <div style={{ marginTop: 14 }}>
            {/* The grader accepts a decimal with 3 or more places (cellMatches);
                this used to ask for 4 (P2-5). */}
            <p style={{ margin: '0 0 8px', fontWeight: 700 }}>Record A⁻¹ (exact fractions, or decimals to at least 3 places):</p>
            <div style={{ display: 'flex', justifyContent: 'safe center' }}>
              <MatrixInput name="A⁻¹" cells={inverse} onCell={(i, j, value) => { clearFeedback(); setInverse(setCell(inverse, i, j, value)); }} labelFor={(i, j) => `Inverse matrix, row ${i + 1}, column ${j + 1}`} invalidCells={wrongCells.inverse || null} />
            </div>
          </div>
        ) : null}
      </Step>
      <Step number={nextStep()} title="Report the solution">
        <ChoiceRadios
          label="How many solutions does the system have?"
          options={CLASSIFICATIONS}
          value={classification}
          onChange={(id) => { clearFeedback(); setClassification(id); }}
        />
        {asksReason ? <SingularReason size={model.keyA?.length || size} value={singularReason} onChange={editReason} /> : null}
        {classification === SOLUTION_TYPES.ONE ? (
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
            {model.variables.map((variable, index) => (
              <label key={variable} style={{ display: 'grid', gap: 4, fontWeight: 700 }}>
                <span><MathText>{`$${variable}$ =`}</MathText>{meaning(variable) ? <span style={{ fontWeight: 400, color: 'var(--mm-text-muted)' }}> ({meaning(variable)})</span> : null}</span>
                <CellInput value={values[index]} label={`Value of ${variable}`} onChange={(value) => { clearFeedback(); setValues(values.map((entry, k) => (k === index ? value : entry))); }} />
              </label>
            ))}
          </div>
        ) : null}
      </Step>
      <CheckRow label="Check the solution" onCheck={check} enabled={Boolean(complete)} feedback={feedback} fixList={fixList} blocker={blocker} confirm={confirm} />
    </>
  );
}

/* ---------------------------------------------------------- completeSystem */

function CompleteSystemMode({ questionData, model, onAction }) {
  const [rows, setRows] = usePersistentToolState('rows', {});
  const work = useMemo(() => matrixLabWork(questionData, { rows }), [questionData, rows]);
  const { feedback, check, clearFeedback, fixList } = useLabSubmission(questionData, onAction, work, 'completeSystem');
  useLabUndo(questionData, { rows }, (restored) => setRows(restored.rows || {}), clearFeedback, 'Undo the last equation change');
  const width = model.variables.length;
  const rowOf = (id) => ({ coefficients: Array.from({ length: width }, (_, k) => rows?.[id]?.coefficients?.[k] ?? ''), constant: rows?.[id]?.constant ?? '' });
  const edit = (id, next) => { clearFeedback(); setRows({ ...rows, [id]: next }); };
  const blocker = formatProblem(model.targets.flatMap((target, index) => {
    const row = rowOf(target.id);
    return [...row.coefficients.map((value, k) => ({ value, label: `Equation ${index + 1}, coefficient of ${model.variables[k]}` })), { value: row.constant, label: `Equation ${index + 1}, constant` }];
  }));
  const complete = !blocker && model.targets.every((target) => {
    const row = rowOf(target.id);
    return [...row.coefficients, row.constant].every((cell) => String(cell).trim());
  });
  const label = (target) => target.label || (target.classification === SOLUTION_TYPES.NONE ? 'Equation 3 so the system has NO solution' : target.classification === SOLUTION_TYPES.MANY ? 'Equation 3 so the system has INFINITELY MANY solutions' : 'Equation 3 so the system has exactly one solution');
  return (
    <>
      <TaskCard question={questionData} task="Write a third equation that gives the system the kind of solution asked for." steps={['A system with a coefficient row that is a multiple of another row has no inverse.', 'If the constant follows the same multiple, the equations agree: infinitely many solutions.', 'If the constant does not, the equations contradict each other: no solution.', 'Test your system on the calculator — but only your reasoning can tell none from many.']} />
      <Panel title="Two of the equations">
        <div style={{ display: 'flex', justifyContent: 'safe center' }}><SystemDisplay equations={model.equations} /></div>
      </Panel>
      {model.targets.map((target, index) => {
        const row = rowOf(target.id);
        const testA = [...(model.keyA || []).map((keyRow) => keyRow.map(formatRational)), row.coefficients];
        const testB = [...(model.keyB || []).map((keyRow) => [formatRational(keyRow[0])]), [row.constant]];
        return (
          <Step key={target.id} number={index + 1} title={label(target)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {model.variables.map((variable, k) => (
                <React.Fragment key={variable}>
                  {k > 0 ? <Symbol>+</Symbol> : null}
                  <CellInput value={row.coefficients[k]} label={`${label(target)}: coefficient of ${variable}`} onChange={(value) => edit(target.id, { ...row, coefficients: row.coefficients.map((cell, m) => (m === k ? value : cell)) })} />
                  <MathText>{`$${variable}$`}</MathText>
                </React.Fragment>
              ))}
              <Symbol>=</Symbol>
              <CellInput value={row.constant} label={`${label(target)}: constant`} onChange={(value) => edit(target.id, { ...row, constant: value })} />
            </div>
            <MatrixCalculator title="Test this system" historyKey="testCalculatorHistory" left={{ name: 'A', cells: testA }} right={{ name: 'B', cells: testB }} operations={model.technology} onRun={reportCalculator(onAction)} />
          </Step>
        );
      })}
      <CheckRow label="Check my equations" onCheck={check} enabled={complete} feedback={feedback} fixList={fixList} blocker={blocker} />
    </>
  );
}

