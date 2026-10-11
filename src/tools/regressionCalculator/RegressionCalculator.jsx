import React, { useId, useMemo, useRef, useState } from 'react';
import usePersistentToolState from '../shared/usePersistentToolState.js';
import ToolShell, { AttemptOutcome, TaskCard } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import CoordinatePlane from '../shared/CoordinatePlane';
import useMathUndoHistory, { questionUndoResetKey } from '../../platform/workView/useMathUndoHistory.js';
import { gradeToolCheck } from '../shared/sharedToolGrading.js';
import useReportToolWork from '../shared/useReportToolWork.js';
import regressionCalculatorGrader, {
  buildRegressionCalculatorWork,
} from '../../../functions/shared/serverGrading/tools/regressionCalculator.mjs';
import { resolveRegressionCalculatorMode } from '../../../functions/shared/serverGrading/declarations/regressionCalculator.mjs';
import { cleanRegressionPoints, regressionCalculatorStats } from './regressionCalculatorMath.js';
import {
  addMenuEnabled,
  addMenuMoveIndex,
  addMenuOpenIndex,
  resolveAddMenuChoice,
} from './regressionAddMenu.js';
import './RegressionCalculator.css';
import { useSubmitLabel } from '../shared/ToolRuntimeContext';

const EMPTY_EXPRESSION = () => ({ id: crypto.randomUUID(), type: 'expression', value: '' });
const orderedPair = (value) => {
  const match = String(value).trim().match(/^\(\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*\)$/);
  return match ? [Number(match[1]), Number(match[2])] : null;
};
const isRegressionExpression = (value) => /^\s*y(?:₁|_?1)\s*[~∼]\s*m\s*x(?:₁|_?1)\s*\+\s*b\s*$/i.test(String(value));
const validRows = (rows = []) => rows
  .filter((row) => row.every((cell) => String(cell).trim() !== '' && Number.isFinite(Number(cell))))
  .map(([x, y]) => [Number(x), Number(y)]);
const boundsFor = (points) => {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const padded = (values) => {
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 1);
    const pad = Math.max(1, (max - min) * 0.15);
    return [min - pad, max + pad];
  };
  const [xMin, xMax] = padded(xs);
  const [yMin, yMax] = padded(ys);
  return { xMin, xMax, yMin, yMax };
};

export default function RegressionCalculator({ questionData = {}, onAction }) {
  const source = cleanRegressionPoints(questionData.sourceData || questionData.points);
  // The same routing the grading declaration resolves, so the grader marks
  // the view the student actually sees.
  const sourceMode = resolveRegressionCalculatorMode(questionData);
  const [rows, setRows] = usePersistentToolState('rows', () => [EMPTY_EXPRESSION()]);
  const [selectedId, setSelectedId] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [run, setRun] = usePersistentToolState('run', null);
  const [direction, setDirection] = usePersistentToolState('direction', '');
  const [strength, setStrength] = usePersistentToolState('strength', '');
  const [notice, setNotice] = useState('');
  const [processEvidence, setProcessEvidence] = usePersistentToolState('processEvidence', []);
  const [redoDepth, setRedoDepth] = useState(0);
  const redoStackRef = useRef([]);
  const inputRefs = useRef([]);
  const addTriggerRef = useRef(null);
  const addMenuId = useId();
  const addMenuItemRefs = useRef([]);
  const addMenuRef = useRef(null);
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);
  // A secure host names the final action ("Record answer"); see ToolRuntimeContext.
  const submitActionLabel = useSubmitLabel('Submit my regression');

  const record = (type, detail = {}) => setProcessEvidence((events) => [...events, { type, ...detail }]);
  const commitRows = (next) => setRows(next);

  const tableRow = rows.find((row) => row.type === 'table');
  const tablePoints = useMemo(() => validRows(tableRow?.rows), [tableRow]);
  const expressionPoints = useMemo(
    () => rows.filter((row) => row.type === 'expression').map((row) => orderedPair(row.value)).filter(Boolean),
    [rows],
  );
  const plotted = tableRow ? tablePoints : expressionPoints;
  const hasRegressionExpression = rows.some((row) => row.type === 'expression' && isRegressionExpression(row.value));
  const graphBounds = useMemo(() => boundsFor(plotted.length ? plotted : source), [plotted, source]);
  const selected = rows.find((row) => row.id === selectedId);
  const conversionAvailable = selected?.type === 'expression' && Boolean(orderedPair(selected.value));
  const sourceGraphBounds = questionData.sourceGraphBounds || boundsFor(source);
  const mathematicalState = useMemo(
    () => ({ rows, run, direction, strength }),
    [rows, run, direction, strength],
  );
  const mathematicalStateRef = useRef(mathematicalState);
  mathematicalStateRef.current = mathematicalState;

  // The student's work, exactly as Submit sends it and as a deadline reads it.
  const work = useMemo(
    () => buildRegressionCalculatorWork({ table: tablePoints, regressionRun: run, direction, strength, processEvidence }),
    [tablePoints, run, direction, strength, processEvidence],
  );
  useReportToolWork(work);

  const clearRedo = () => {
    if (!redoStackRef.current.length) return;
    redoStackRef.current = [];
    setRedoDepth(0);
  };

  const undoHistory = useMathUndoHistory({
    label: 'Undo the last Regression Calculator change',
    state: mathematicalState,
    resetKey: questionUndoResetKey(questionData),
    onRestore: (restored) => {
      if (!restored) return;
      redoStackRef.current = [...redoStackRef.current, mathematicalStateRef.current].slice(-60);
      setRedoDepth(redoStackRef.current.length);
      setRows(restored.rows || [EMPTY_EXPRESSION()]);
      setRun(restored.run || null);
      setDirection(restored.direction || '');
      setStrength(restored.strength || '');
      setNotice('');
      clearFeedback();
    },
  });

  const undo = () => {
    if (!undoHistory.undo()) return;
    setNotice('');
    record('undoUsed');
  };

  const redo = () => {
    const restored = redoStackRef.current.at(-1);
    if (!restored) return;
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    setRedoDepth(redoStackRef.current.length);
    setRows(restored.rows || [EMPTY_EXPRESSION()]);
    setRun(restored.run || null);
    setDirection(restored.direction || '');
    setStrength(restored.strength || '');
    setNotice('');
    clearFeedback();
    record('redoUsed');
  };

  const startOver = () => {
    const hasWork = rows.some((row) => (
      row.type === 'table'
        ? validRows(row.rows).length > 0
        : Boolean(String(row.value || '').trim())
    )) || Boolean(run || direction || strength);
    if (!hasWork) return;
    clearRedo();
    setRows([EMPTY_EXPRESSION()]);
    setSelectedId(null);
    setEditOpen(false);
    setAddMenuOpen(false);
    setRun(null);
    setDirection('');
    setStrength('');
    setNotice('Workspace cleared.');
    clearFeedback();
    record('startOver');
  };

  const updateExpression = (id, value) => {
    clearRedo();
    const before = rows.find((row) => row.id === id)?.value;
    const editedIndex = rows.findIndex((row) => row.id === id);
    const shouldEmerge = editedIndex === rows.length - 1
      && rows[editedIndex]?.type === 'expression'
      && Boolean(String(value).trim());
    setRows((current) => {
      const next = current.map((row) => row.id === id ? { ...row, value } : row);
      if (shouldEmerge && !next.some((row, index) => index > editedIndex && row.type === 'expression' && !String(row.value).trim())) {
        next.push(EMPTY_EXPRESSION());
      }
      return next;
    });
    if (!orderedPair(before) && orderedPair(value)) record('orderedPairEntered', { row: editedIndex + 1 });
    if (shouldEmerge) record('expressionRowEmerged', { afterRow: editedIndex + 1 });
    setRun(null);
    clearFeedback();
  };

  const focusExpression = (row) => requestAnimationFrame(() => document.getElementById(`regression-${row.id}`)?.focus());

  // Choosing an Add Item entry — by click, by Enter / Space on the item, or by
  // Enter in the last expression box — goes through one resolver, so every
  // route records the same state (regressionAddMenu.js).
  const chooseAddItem = (choice) => {
    clearRedo();
    setAddMenuOpen(false);
    const outcome = resolveAddMenuChoice(choice, {
      rows,
      selectedId,
      sourceLength: source.length,
      makeId: () => crypto.randomUUID(),
    });
    if (!outcome) return;
    if (outcome.rows !== rows) commitRows(outcome.rows);
    setSelectedId(outcome.selectedId);
    setEditOpen(false);
    outcome.events.forEach(([type, detail]) => record(type, detail));
    setNotice(outcome.notice);
    if (outcome.focusId) focusExpression({ id: outcome.focusId });
    // The chosen item is about to unmount; do not drop focus to <body>.
    else if (addMenuRef.current?.contains(document.activeElement)) addTriggerRef.current?.focus();
  };
  const addExpression = () => chooseAddItem('expression');
  const addBlankTable = () => chooseAddItem('table');

  // The menu button pattern: the menu takes focus when it opens, arrows rove
  // over the enabled items, Escape returns to the trigger, Tab leaves.
  const addMenuItemsEnabled = addMenuEnabled(rows);
  const focusAddMenuItem = (index) => {
    if (index < 0) return;
    addMenuItemRefs.current[index]?.focus();
  };
  const openAddMenu = (key) => {
    setAddMenuOpen(true);
    const index = addMenuOpenIndex(key, addMenuItemsEnabled);
    requestAnimationFrame(() => focusAddMenuItem(index));
  };
  const closeAddMenu = ({ returnFocus }) => {
    setAddMenuOpen(false);
    if (returnFocus) addTriggerRef.current?.focus();
  };
  const onAddTriggerClick = () => {
    if (addMenuOpen) setAddMenuOpen(false);
    else openAddMenu(null);
  };
  const onAddTriggerKeyDown = (event) => {
    if (event.key === 'Escape' && addMenuOpen) {
      event.preventDefault();
      closeAddMenu({ returnFocus: true });
      return;
    }
    // Enter and Space reach the click handler natively; only the arrows open
    // the menu here.
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    openAddMenu(event.key);
  };
  const onAddMenuKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeAddMenu({ returnFocus: true });
      return;
    }
    if (event.key === 'Tab') {
      // Tab moves on from the menu as from the trigger; the menu closes.
      setAddMenuOpen(false);
      return;
    }
    const current = addMenuItemRefs.current.indexOf(document.activeElement);
    const next = addMenuMoveIndex(event.key, current, addMenuItemsEnabled);
    if (next === null) return;
    event.preventDefault();
    focusAddMenuItem(next);
  };

  const openEdit = () => {
    setEditOpen((open) => !open);
    const row = rows.findIndex((item) => item.id === selectedId) + 1;
    record('editModeOpened', { row });
    if (conversionAvailable) record('tableConversionOffered', { row });
  };

  const convertToTable = () => {
    clearRedo();
    const pair = orderedPair(selected?.value);
    if (!pair) return;
    const table = {
      id: selected.id,
      type: 'table',
      rows: [pair.map(String), ...Array.from({ length: Math.max(3, source.length - 1) }, () => ['', ''])],
    };
    commitRows(rows.map((row) => row.id === selected.id ? table : row));
    setEditOpen(false);
    setAddMenuOpen(false);
    setNotice('Table created.');
    record('tableCreated', { fromOrderedPair: true });
  };

  const updateTable = (rowIndex, column, value) => {
    clearRedo();
    setRows((current) => current.map((row) => {
      if (row.type !== 'table') return row;
      const nextRows = row.rows.map((pair, index) => index === rowIndex
        ? pair.map((cell, c) => c === column ? value : cell)
        : pair);
      if (rowIndex === nextRows.length - 1 && nextRows[rowIndex].some((cell) => String(cell).trim())) {
        nextRows.push(['', '']);
      }
      return { ...row, rows: nextRows };
    }));
    record('tableEdited', { row: rowIndex + 1, column: column ? 'y1' : 'x1' });
    setNotice('');
    setRun(null);
    clearFeedback();
  };

  const removeRow = (id) => {
    clearRedo();
    const next = rows.filter((row) => row.id !== id);
    commitRows(next.length ? next : [EMPTY_EXPRESSION()]);
    if (selectedId === id) setSelectedId(null);
    setRun(null);
    setNotice('');
  };

  const deleteAll = startOver;

  const execute = (row) => {
    clearRedo();
    if (!tableRow || tablePoints.length < 2 || !isRegressionExpression(row.value)) return;
    const stats = regressionCalculatorStats(tablePoints);
    if (!stats) return;
    const regressionRun = {
      operation: 'linearRegression',
      table: tablePoints.map((pair) => [...pair]),
      ...stats,
      r2: stats.r ** 2,
    };
    setRun(regressionRun);
    record('regressionExpressionEntered');
    record('regressionExecuted', { operation: 'linearRegression' });
    record('correlationProduced', { value: stats.r });
  };

  const addRegressionFromTable = () => {
    clearRedo();
    if (!tableRow || tablePoints.length < 2) return;
    const existing = rows.find((row) => row.type === 'expression' && isRegressionExpression(row.value));
    if (existing) {
      setSelectedId(existing.id);
      execute(existing);
      requestAnimationFrame(() => document.getElementById(`regression-${existing.id}`)?.focus());
      return;
    }

    const regression = {
      ...EMPTY_EXPRESSION(),
      value: 'y₁ ~ mx₁ + b',
    };
    commitRows([...rows, regression]);
    setSelectedId(regression.id);
    setEditOpen(false);
    setAddMenuOpen(false);
    setNotice('');
    record('expressionAdded', { source: 'addRegression' });
    record('addRegressionClicked', { pointCount: tablePoints.length });
    execute(regression);
    requestAnimationFrame(() => document.getElementById(`regression-${regression.id}`)?.focus());
  };

  const check = () => {
    // The verdict is the shared grader's — the one the server records.
    const result = gradeToolCheck(regressionCalculatorGrader, questionData, work);
    submit(
      { isCorrect: result.isCorrect, score: result.score },
      work,
      { mode: sourceMode, parts: result.parts },
    );
  };

  // Stage-aware feedback, first failing stage first. The table stage is the
  // first part; interpretation is not a part when it is not required.
  const feedbackParts = Array.isArray(feedback?.metadata?.parts) ? feedback.metadata.parts : [];
  const stagePassed = (id) => feedbackParts.find((part) => part.id === id)?.isCorrect === true;
  const feedbackText = feedback && (
    feedbackParts[0]?.isCorrect !== true
      ? 'Data entry/table does not match the provided data.'
      : !stagePassed('linear-regression')
        ? 'Regression setup is incomplete or invalid.'
        : !stagePassed('correlation-produced')
          ? 'A correlation value has not been produced.'
          : feedbackParts.some((part) => part.id === 'interpretation') && !stagePassed('interpretation')
            ? 'Check the direction/strength interpretation.'
            : 'Regression complete.'
  );

  return (
    <ToolShell
      title="Regression Calculator"
      subtitle="Build a table and regression expression in the calculator workspace."
      badge="Assessment statistics"
    >
      <TaskCard
        question={questionData}
        task="Use the calculator to model the source data and interpret its correlation."
        steps={[]}
      />

      {sourceMode === 'data' ? (
        <aside className="regression-givens" aria-label="Source data">
          <strong>Source data</strong>
          <div className="regression-givens-list">
            {source.map(([x, y], index) => <span key={index}>({x}, {y})</span>)}
          </div>
        </aside>
      ) : (
        <aside className="regression-givens regression-source-context">
          <strong>Source scatterplot</strong>
          <div data-regression-source-graph>
            <CoordinatePlane
              {...sourceGraphBounds}
              points={source.map(([x, y]) => ({ x, y }))}
              revealCoordinates={false}
              pointHoverEnabled={false}
              enlargeable={false}
              panZoom={false}
              ariaLabel="Source scatterplot; coordinates are intentionally not revealed"
            />
          </div>
        </aside>
      )}

      <div className={`regression-calculator ${collapsed ? 'is-collapsed' : ''}`}>
        <header className="regression-brandbar" aria-label="MathMaster graphing calculator">
          <span className="regression-brand">MathMaster</span>
          <span className="regression-brand-separator" aria-hidden="true" />
          <span className="regression-brand-title">Graphing Calculator</span>
          <span className="regression-brand-mode">Assessment Mode</span>
        </header>

        <section className="regression-graph" data-regression-graph aria-label="Calculator graph">
          <CoordinatePlane
            {...graphBounds}
            points={plotted.map(([x, y]) => ({ x, y }))}
            lines={run ? [{ m: run.m, b: run.b }] : []}
            enlargeable={false}
            panZoom={false}
            ariaLabel="Student data graph and fitted regression line"
          />
          <div className="regression-graph-controls" aria-hidden="true">
            <span>＋</span>
            <span>−</span>
          </div>
        </section>

        <nav className={`regression-toolbar ${editOpen ? 'is-editing' : ''}`} aria-label="Calculator toolbar">
          {editOpen ? (
            <>
              <button className="regression-delete-all" type="button" onClick={deleteAll} aria-label="Delete all expressions">
                Delete All
              </button>
              <span className="regression-toolbar-spacer" />
              <button type="button" onClick={undo} disabled={!undoHistory.canUndo} aria-label="Undo">↶</button>
              <button type="button" onClick={redo} disabled={!redoDepth} aria-label="Redo">↷</button>
              <span className="regression-toolbar-spacer" />
              <button className="regression-done" type="button" onClick={openEdit} aria-label="Done editing">Done</button>
            </>
          ) : (
            <>
              <div className="regression-add-wrap">
                <button
                  ref={addTriggerRef}
                  className="regression-tool-icon regression-add"
                  type="button"
                  onClick={onAddTriggerClick}
                  onKeyDown={onAddTriggerKeyDown}
                  aria-label="Add Item"
                  aria-expanded={addMenuOpen}
                  aria-haspopup="menu"
                  aria-controls={addMenuOpen ? addMenuId : undefined}
                  data-tooltip="Add Item"
                >
                  ＋
                </button>
                {addMenuOpen ? (
                  <div ref={addMenuRef} id={addMenuId} className="regression-add-menu" role="menu" aria-label="Add Item" onKeyDown={onAddMenuKeyDown}>
                    <button ref={(node) => { addMenuItemRefs.current[0] = node; }} type="button" role="menuitem" tabIndex={-1} onClick={addExpression}>
                      <span className="regression-add-menu-expression" aria-hidden="true">ƒ(x)</span>
                      <span>expression</span>
                    </button>
                    <button ref={(node) => { addMenuItemRefs.current[1] = node; }} type="button" role="menuitem" tabIndex={-1} onClick={addBlankTable} disabled={!addMenuItemsEnabled[1]}>
                      <span className="regression-add-menu-table" aria-hidden="true">
                        <i /><i /><i /><i />
                      </span>
                      <span>table</span>
                    </button>
                    <button ref={(node) => { addMenuItemRefs.current[2] = node; }} type="button" role="menuitem" tabIndex={-1} disabled={!addMenuItemsEnabled[2]} aria-disabled="true" title="Inference is not used in this activity">
                      <span className="regression-add-menu-inference" aria-hidden="true">⌒</span>
                      <span>inference</span>
                    </button>
                  </div>
                ) : null}
              </div>
              <span className="regression-toolbar-spacer" />
              <button className="regression-tool-icon" type="button" onClick={undo} disabled={!undoHistory.canUndo} aria-label="Undo" title="Undo">↶</button>
              <button className="regression-tool-icon" type="button" onClick={redo} disabled={!redoDepth} aria-label="Redo" title="Redo">↷</button>
              <span className="regression-toolbar-spacer" />
              <button className="regression-tool-icon regression-reset" type="button" onClick={startOver} aria-label="Start over" title="Clear this calculator and start over">↺</button>
              <button className="regression-tool-icon regression-settings" type="button" onClick={openEdit} aria-label="Settings and edit" title="Edit">⚙</button>
              <button
                className="regression-tool-icon regression-collapse"
                type="button"
                onClick={() => setCollapsed((value) => !value)}
                aria-label={`${collapsed ? 'Expand' : 'Collapse'} expression area`}
                title={collapsed ? 'Expand expressions' : 'Collapse expressions'}
              >
                {collapsed ? '⌃' : '⌄'}
              </button>
            </>
          )}
        </nav>

        <section className="regression-editor" aria-label="Expression and table editor">
          {editOpen && conversionAvailable ? (
            <div className="regression-edit-menu" role="menu" aria-label="Expression settings">
              <button
                type="button"
                role="menuitem"
                onClick={convertToTable}
                aria-label="Convert ordered pair to table"
                title="Convert this point to an x₁/y₁ table"
              >
                <span aria-hidden="true">▦</span>
                <span>Convert to table</span>
              </button>
            </div>
          ) : null}

          {notice ? (
            <div className="regression-notice" role="status">
              <span>{notice}</span>
              <button type="button" onClick={undo}>{notice === 'Workspace cleared.' ? 'Restore' : 'Undo'}</button>
            </div>
          ) : null}

          <ol className="regression-rows">
            {rows.map((row, rowIndex) => {
              const pair = row.type === 'expression' ? orderedPair(row.value) : null;
              const isRegression = row.type === 'expression' && isRegressionExpression(row.value);
              return (
                <li
                  key={row.id}
                  className={`${selectedId === row.id ? 'is-selected' : ''} ${pair ? 'has-point' : ''} ${row.type === 'table' ? 'is-table' : ''}`}
                  onClick={() => setSelectedId(row.id)}
                >
                  <span className="regression-row-gutter">
                    <span className="regression-row-number">{rowIndex + 1}</span>
                    {pair ? <span className="regression-point-dot" aria-hidden="true" /> : null}
                    {row.type === 'table' && tablePoints.length >= 2 && !hasRegressionExpression ? (
                      <button
                        className="regression-add-regression"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          addRegressionFromTable();
                        }}
                        aria-label="Add Regression"
                        data-tooltip="Add Regression"
                      >
                        <svg viewBox="0 0 28 28" aria-hidden="true" focusable="false">
                          <path d="M4 22 C8 15, 13 12, 24 5" />
                          <circle cx="6" cy="18.5" r="2.1" />
                          <circle cx="13.5" cy="12" r="2.1" />
                          <circle cx="21.5" cy="7" r="2.1" />
                        </svg>
                      </button>
                    ) : null}
                  </span>

                  {row.type === 'expression' ? (
                    <div className="regression-expression-block">
                      <div className="regression-expression-row">
                        <input
                          id={`regression-${row.id}`}
                          aria-label={`Expression ${rowIndex + 1}`}
                          value={row.value}
                          placeholder=""
                          autoComplete="off"
                          onFocus={() => setSelectedId(row.id)}
                          onChange={(event) => updateExpression(row.id, event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              if (isRegressionExpression(row.value)) execute(row);
                              else addExpression();
                            }
                          }}
                        />
                        {isRegression && tableRow ? (
                          <button
                            className="regression-evaluate"
                            type="button"
                            onClick={() => execute(row)}
                            aria-label="Evaluate regression expression"
                            title="Evaluate regression"
                          >
                            ↵
                          </button>
                        ) : null}
                        {editOpen ? (
                          <button
                            className="regression-row-delete"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              removeRow(row.id);
                            }}
                            aria-label={`Delete expression ${rowIndex + 1}`}
                            title="Delete"
                          >
                            ×
                          </button>
                        ) : null}
                      </div>

                      {run && isRegression ? (
                        <output className="regression-result" aria-live="polite">
                          <span className="regression-result-label">EQUATION</span>
                          <strong>y = {run.m.toFixed(5)}x {run.b < 0 ? '−' : '+'} {Math.abs(run.b).toFixed(5)}</strong>
                          <span className="regression-result-label">STATISTICS</span>
                          <span>R² = {run.r2.toFixed(4)}</span>
                          <span>r = {run.r.toFixed(4)}</span>
                          <span className="regression-result-secondary">m = {run.m.toFixed(4)} · b = {run.b.toFixed(4)}</span>
                        </output>
                      ) : null}
                    </div>
                  ) : (
                    <div className="regression-table-wrap">
                      <table className="regression-table">
                        <thead>
                          <tr>
                            <th aria-label="Row" />
                            <th>x₁</th>
                            <th><span className="regression-table-dot" aria-hidden="true" /> y₁</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.rows.map((pairValues, r) => (
                            <tr key={r}>
                              <th>{r + 1}</th>
                              {pairValues.map((value, c) => {
                                const index = r * 2 + c;
                                return (
                                  <td key={c}>
                                    <input
                                      ref={(node) => { inputRefs.current[index] = node; }}
                                      aria-label={`${c ? 'y' : 'x'} row ${r + 1}`}
                                      inputMode="decimal"
                                      value={value}
                                      onFocus={() => setSelectedId(row.id)}
                                      onChange={(event) => updateTable(r, c, event.target.value)}
                                      onKeyDown={(event) => {
                                        const columns = 2;
                                        let target = index;
                                        if (event.key === 'Enter' || event.key === 'ArrowRight') target = index + 1;
                                        if (event.key === 'ArrowLeft') target = index - 1;
                                        if (event.key === 'ArrowDown') target = index + columns;
                                        if (event.key === 'ArrowUp') target = index - columns;
                                        if (target !== index) {
                                          event.preventDefault();
                                          inputRefs.current[target]?.focus();
                                        }
                                      }}
                                    />
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {editOpen ? (
                        <button
                          className="regression-row-delete regression-table-delete"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            removeRow(row.id);
                          }}
                          aria-label="Delete table"
                          title="Delete table"
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>

          {run && questionData.requireInterpretation !== false ? (
            <div className="regression-interpretation">
              <span className="regression-interpretation-title">Interpret the correlation</span>
              <label>
                <span>Direction</span>
                <select
                  value={direction}
                  onChange={(event) => {
                    clearRedo();
                    setDirection(event.target.value);
                    record('interpretationSelected', { kind: 'direction' });
                  }}
                >
                  <option value="">Choose…</option>
                  <option value="positive">Positive</option>
                  <option value="negative">Negative</option>
                  <option value="none">None</option>
                </select>
              </label>
              <label>
                <span>Strength</span>
                <select
                  value={strength}
                  onChange={(event) => {
                    clearRedo();
                    setStrength(event.target.value);
                    record('interpretationSelected', { kind: 'strength' });
                  }}
                >
                  <option value="">Choose…</option>
                  <option value="strong">Strong</option>
                  <option value="moderate">Moderate</option>
                  <option value="weak">Weak</option>
                  <option value="none">None</option>
                </select>
              </label>
            </div>
          ) : null}
        </section>
      </div>

      <div className="regression-submit-row">
        {/* The student's words, not the platform's: "workflow" is our
            vocabulary for a sequence of steps, not theirs (PQ-029). */}
        <button className="regression-submit" data-primary-answer-action="true" type="button" onClick={check}>
          {submitActionLabel}
        </button>
        {/* Its verdict is already a live region, so the attempt outcome
            (PQ-022) is read as part of it rather than as a second one. */}
        {feedbackText ? <p role="status">{feedbackText}<AttemptOutcome inline /></p> : null}
      </div>
    </ToolShell>
  );
}
