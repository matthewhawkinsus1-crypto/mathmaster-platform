import React, { useMemo, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import ToolShell, { Panel, TaskCard } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import useReportToolWork from '../shared/useReportToolWork.js';
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import useMathUndoHistory, { questionUndoResetKey } from '../../platform/workView/useMathUndoHistory.js';
import MatrixGrid from '../../components/common/MatrixGrid.jsx';
import MathText from '../../components/common/MathText.jsx';
import matrixLabGrader, { matrixEquationDiagnostics, matrixLabWork } from '../../../functions/shared/serverGrading/tools/matrixLab.mjs';
import {
  SOLUTION_TYPES,
  elementNotation,
  formatRational,
  productEntry,
  readMatrixLabQuestion,
} from './matrixLabMath.js';
import MatrixCalculator from './MatrixCalculator.jsx';
import {
  CellInput, CheckRow, DimensionsInput, MatrixInput, Step, Symbol, SystemDisplay, VariableMatrix, YesNo,
  buttonStyle, choiceStyle, resizeCells, setCell,
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
  return { feedback, check, clearFeedback };
}

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
  const { feedback, check, clearFeedback } = useLabSubmission(questionData, onAction, work, 'locate');
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
  const complete = (!model.askDimensions || (String(dimensions.rows).trim() && String(dimensions.cols).trim()))
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
                  aria-label={`Row ${i + 1}, column ${j + 1}: ${value}${chips.length ? `, chosen for ${chips.map((chip) => elementNotation(letter, chip.row, chip.col)).join(', ')}` : ''}`}
                  style={{ ...buttonStyle, minWidth: 48, padding: '6px 8px', fontSize: 'calc(19 * var(--mm-px))', position: 'relative', background: chips.length ? 'var(--mm-primary-subtle)' : 'var(--mm-surface)', border: chips.length ? '2px solid #1a73e8' : '1px solid var(--mm-tint-border)', cursor: active ? 'pointer' : 'default' }}
                >
                  {String(value).replace(/-/g, '−')}
                  {chips.length ? <span aria-hidden="true" style={{ position: 'absolute', top: -9, right: -6, background: '#1a73e8', color: '#fff', borderRadius: 8, padding: '0 5px', fontSize: 'calc(11 * var(--mm-px))' }}>{chips.map((chip) => elementNotation(letter, chip.row, chip.col)).join(' ')}</span> : null}
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
      <CheckRow label="Check matrix reading" onCheck={check} enabled={Boolean(complete)} feedback={feedback} />
    </>
  );
}

/* ----------------------------------------------------------------- operate */

function OperateMode({ questionData, model, onAction }) {
  const { leftMatrix, rightMatrix } = model;
  const [defined, setDefined] = usePersistentToolState('defined', '');
  const [dimensions, setDimensions] = usePersistentToolState('dimensions', { rows: '', cols: '' });
  const [entries, setEntries] = usePersistentToolState('entries', []);
  const [inverses, setInverses] = usePersistentToolState('inverses', '');
  const [focus, setFocus] = useState(null);
  const work = useMemo(() => matrixLabWork(questionData, { defined, dimensions, entries, inverses }), [questionData, defined, dimensions, entries, inverses]);
  const { feedback, check, clearFeedback } = useLabSubmission(questionData, onAction, work, 'operate');
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
  const focusedTerms = model.showExpansion && focus && model.operation === 'multiply'
    && focus.i < leftMatrix.dims.rows && focus.j < rightMatrix.dims.cols && leftMatrix.dims.cols === rightMatrix.dims.rows
    ? productEntry(leftMatrix.values, rightMatrix.values, focus.i, focus.j).terms
    : null;
  const highlightLeft = focus && model.operation === 'multiply' ? focus.i : null;
  const highlightRight = focus && model.operation === 'multiply' ? focus.j : null;
  const showGrid = model.fillResult && gridDims;
  const complete = (!model.askDefined || defined === 'no' || (defined === 'yes' && typedDims))
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
      {showGrid ? (
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
            />
          </div>
          {focusedTerms ? (
            <p aria-live="polite" style={{ textAlign: 'center', margin: '12px 0 0', fontSize: 'calc(17 * var(--mm-px))' }}>
              Row {focus.i + 1} of {model.left} · column {focus.j + 1} of {model.right} ={' '}
              <MathText>{focusedTerms.map((term) => `${formatRational(term.left)}(${formatRational(term.right)})`.replace(/-/g, '−')).join(' + ')}</MathText>
            </p>
          ) : null}
        </Step>
      ) : null}
      {model.judgeInverse && (!model.askDefined || defined === 'yes') ? (
        <Step number={nextStep()} title={`Are ${model.left} and ${model.right} inverses?`} note="Two matrices are inverses when their product is the identity matrix I.">
          <YesNo value={inverses} label={`Are ${model.left} and ${model.right} inverses?`} onChange={(value) => { clearFeedback(); setInverses(value); }} />
        </Step>
      ) : null}
      <MatrixCalculator
        left={{ name: model.left, cells: leftMatrix.rows }}
        right={{ name: model.right, cells: rightMatrix.rows }}
        operations={model.technology}
      />
      <CheckRow label={model.operation === 'add' ? 'Check the sum' : 'Check the product'} onCheck={check} enabled={Boolean(complete)} feedback={feedback} />
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

const diagnosisNotes = (diagnostics) => diagnostics
  .map((diagnosis, index) => (diagnosis === 'asWritten'
    ? { partId: `row${index + 1}`, text: `Row ${index + 1} copies equation ${index + 1} as it is printed. Write that equation in standard form Ax + By + Cz = D first — every variable term on the left, the constant on the right.` }
    : null))
  .filter(Boolean);

/* ---------------------------------------------------------------- equation */

function EquationMode({ questionData, model, onAction }) {
  const initial = useMemo(() => startCells(model), [model]);
  const [A, setA] = usePersistentToolState('A', initial.A);
  const [B, setB] = usePersistentToolState('B', initial.B);
  const work = useMemo(() => matrixLabWork(questionData, { A, B }), [questionData, A, B]);
  const { feedback, check, clearFeedback } = useLabSubmission(questionData, onAction, work, 'equation');
  useLabUndo(questionData, { A, B }, (restored) => {
    setA(restored.A || initial.A);
    setB(restored.B || initial.B);
  }, clearFeedback, 'Undo the last matrix-equation change');
  const complete = A.every((row) => row.every((cell) => String(cell).trim())) && B.every((cell) => String(cell).trim());
  const notes = feedback && !feedback.isCorrect ? diagnosisNotes(matrixEquationDiagnostics(questionData, work)) : [];
  return (
    <>
      <TaskCard question={questionData} task="Write the system as a matrix equation A · X = B." steps={['Write every equation in standard form Ax + By + Cz = D.', 'Row i of A holds the coefficients of equation i, in the order x, y, z. A missing variable has coefficient 0.', 'B holds the constants, in the same order.']} />
      <Panel title="The system">
        <div style={{ display: 'flex', justifyContent: 'safe center' }}><SystemDisplay equations={model.equations} /></div>
      </Panel>
      <Step number={1} title="Write the matrix equation">
        <MatrixEquationBuilder model={model} A={A} B={B} onA={(i, j, value) => { clearFeedback(); setA(setCell(A, i, j, value)); }} onB={(i, value) => { clearFeedback(); setB(B.map((cell, index) => (index === i ? value : cell))); }} />
      </Step>
      <CheckRow label="Check the matrix equation" onCheck={check} enabled={complete} feedback={feedback} notes={notes} />
    </>
  );
}

/* ------------------------------------------------------------------- solve */

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
  const state = { A, B, inverse, classification, values, usedTechnology };
  const work = useMemo(() => matrixLabWork(questionData, state), [questionData, A, B, inverse, classification, values, usedTechnology]); // eslint-disable-line react-hooks/exhaustive-deps
  const { feedback, check, clearFeedback } = useLabSubmission(questionData, onAction, work, 'solve');
  useLabUndo(questionData, { A, B, inverse, classification, values }, (restored) => {
    setA(restored.A || initial.A);
    setB(restored.B || initial.B);
    setInverse(restored.inverse || resizeCells([], size, size));
    setClassification(restored.classification || '');
    setValues(restored.values || model.variables.map(() => ''));
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
  const answered = classification && (classification !== SOLUTION_TYPES.ONE || values.every((value) => String(value).trim()));
  const complete = built && inverseDone && answered;
  const notes = feedback && !feedback.isCorrect && model.buildEquation ? diagnosisNotes(matrixEquationDiagnostics(questionData, work)) : [];
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
          onRun={(operation) => { if (['inverse', 'inverseTimes'].includes(operation) && !usedTechnology) setUsedTechnology(true); }}
        />
        {model.askInverse ? (
          <div style={{ marginTop: 14 }}>
            <p style={{ margin: '0 0 8px', fontWeight: 700 }}>Record A⁻¹ (exact fractions, or decimals to 4 places):</p>
            <div style={{ display: 'flex', justifyContent: 'safe center' }}>
              <MatrixInput name="A⁻¹" cells={inverse} onCell={(i, j, value) => { clearFeedback(); setInverse(setCell(inverse, i, j, value)); }} labelFor={(i, j) => `Inverse matrix, row ${i + 1}, column ${j + 1}`} />
            </div>
          </div>
        ) : null}
      </Step>
      <Step number={nextStep()} title="Report the solution">
        <div role="radiogroup" aria-label="How many solutions does the system have?" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CLASSIFICATIONS.map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={classification === id} onClick={() => { clearFeedback(); setClassification(id); }} style={choiceStyle(classification === id)}>{label}</button>
          ))}
        </div>
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
      <CheckRow label="Check the solution" onCheck={check} enabled={Boolean(complete)} feedback={feedback} notes={notes} />
    </>
  );
}

/* ---------------------------------------------------------- completeSystem */

function CompleteSystemMode({ questionData, model, onAction }) {
  const [rows, setRows] = usePersistentToolState('rows', {});
  const work = useMemo(() => matrixLabWork(questionData, { rows }), [questionData, rows]);
  const { feedback, check, clearFeedback } = useLabSubmission(questionData, onAction, work, 'completeSystem');
  useLabUndo(questionData, { rows }, (restored) => setRows(restored.rows || {}), clearFeedback, 'Undo the last equation change');
  const width = model.variables.length;
  const rowOf = (id) => ({ coefficients: Array.from({ length: width }, (_, k) => rows?.[id]?.coefficients?.[k] ?? ''), constant: rows?.[id]?.constant ?? '' });
  const edit = (id, next) => { clearFeedback(); setRows({ ...rows, [id]: next }); };
  const complete = model.targets.every((target) => {
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
            <MatrixCalculator title="Test this system" left={{ name: 'A', cells: testA }} right={{ name: 'B', cells: testB }} operations={model.technology} />
          </Step>
        );
      })}
      <CheckRow label="Check my equations" onCheck={check} enabled={complete} feedback={feedback} />
    </>
  );
}

