import React, { useMemo, useRef, useState } from 'react';
import ToolShell, { TaskCard } from '../shared/ToolShell';
import useToolSubmission from '../shared/useToolSubmission';
import CoordinatePlane from '../shared/CoordinatePlane';
import { cleanRegressionPoints, regressionCalculatorStats } from './regressionCalculatorMath.js';
import './RegressionCalculator.css';

const EMPTY_EXPRESSION = () => ({ id: crypto.randomUUID(), type: 'expression', value: '' });
const orderedPair = (value) => {
  const match = String(value).trim().match(/^\(\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*,\s*([+-]?(?:\d+\.?\d*|\.\d+))\s*\)$/);
  return match ? [Number(match[1]), Number(match[2])] : null;
};
const isRegressionExpression = (value) => /^\s*y(?:₁|_?1)\s*[~∼]\s*m\s*x(?:₁|_?1)\s*\+\s*b\s*$/i.test(String(value));
const validRows = (rows = []) => rows
  .filter((row) => row.every((cell) => String(cell).trim() !== '' && Number.isFinite(Number(cell))))
  .map(([x, y]) => [Number(x), Number(y)]);
const describe = (r) => ({
  direction: Math.abs(r) < 0.1 ? 'none' : r > 0 ? 'positive' : 'negative',
  strength: Math.abs(r) >= 0.8 ? 'strong' : Math.abs(r) >= 0.5 ? 'moderate' : Math.abs(r) >= 0.1 ? 'weak' : 'none',
});
const samePairs = (left, right) => JSON.stringify([...left].sort(([ax, ay], [bx, by]) => ax - bx || ay - by))
  === JSON.stringify([...right].sort(([ax, ay], [bx, by]) => ax - bx || ay - by));
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
  const sourceMode = questionData.sourceMode === 'scatterplot' ? 'scatterplot' : 'data';
  const [rows, setRows] = useState(() => [EMPTY_EXPRESSION()]);
  const [selectedId, setSelectedId] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [run, setRun] = useState(null);
  const [direction, setDirection] = useState('');
  const [strength, setStrength] = useState('');
  const [notice, setNotice] = useState('');
  const [processEvidence, setProcessEvidence] = useState([]);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const inputRefs = useRef([]);
  const { feedback, submit, clearFeedback } = useToolSubmission(onAction);

  const record = (type, detail = {}) => setProcessEvidence((events) => [...events, { type, ...detail }]);
  const commitRows = (next) => {
    setHistory((items) => [...items, rows]);
    setFuture([]);
    setRows(next);
  };

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

  const updateExpression = (id, value) => {
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

  const addExpression = () => {
    const existingBlank = rows.find((row) => row.type === 'expression' && !String(row.value).trim());
    if (existingBlank) {
      setSelectedId(existingBlank.id);
      setEditOpen(false);
      setAddMenuOpen(false);
      setNotice('');
      focusExpression(existingBlank);
      return;
    }
    const row = EMPTY_EXPRESSION();
    commitRows([...rows, row]);
    setSelectedId(row.id);
    setEditOpen(false);
    setAddMenuOpen(false);
    record('expressionAdded');
    setNotice('');
    focusExpression(row);
  };

  const addBlankTable = () => {
    if (tableRow) {
      setAddMenuOpen(false);
      return;
    }
    const table = {
      id: crypto.randomUUID(),
      type: 'table',
      rows: Array.from({ length: Math.max(4, source.length || 0) }, () => ['', '']),
    };
    const selectedIndex = rows.findIndex((row) => row.id === selectedId);
    const fallbackBlankIndex = rows.findIndex((row) => row.type === 'expression' && !String(row.value).trim());
    const replaceIndex = selectedIndex >= 0
      && rows[selectedIndex]?.type === 'expression'
      && !String(rows[selectedIndex]?.value).trim()
      ? selectedIndex
      : fallbackBlankIndex;
    const next = replaceIndex >= 0
      ? rows.map((row, index) => index === replaceIndex ? table : row)
      : [...rows, table];
    if (!next.some((row) => row.type === 'expression' && !String(row.value).trim())) {
      next.push(EMPTY_EXPRESSION());
    }
    commitRows(next);
    setSelectedId(table.id);
    setEditOpen(false);
    setAddMenuOpen(false);
    setNotice('Table created.');
    record('tableCreated', { fromAddMenu: true });
  };

  const openEdit = () => {
    setEditOpen((open) => !open);
    const row = rows.findIndex((item) => item.id === selectedId) + 1;
    record('editModeOpened', { row });
    if (conversionAvailable) record('tableConversionOffered', { row });
  };

  const convertToTable = () => {
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
    const next = rows.filter((row) => row.id !== id);
    commitRows(next.length ? next : [EMPTY_EXPRESSION()]);
    if (selectedId === id) setSelectedId(null);
    setRun(null);
    setNotice('');
  };

  const deleteAll = () => {
    commitRows([EMPTY_EXPRESSION()]);
    setSelectedId(null);
    setEditOpen(false);
    setAddMenuOpen(false);
    setRun(null);
    setNotice('');
  };

  const undo = () => {
    if (!history.length) return;
    setFuture((items) => [rows, ...items]);
    setRows(history.at(-1));
    setHistory((items) => items.slice(0, -1));
    setRun(null);
    setNotice('');
  };

  const redo = () => {
    if (!future.length) return;
    setHistory((items) => [...items, rows]);
    setRows(future[0]);
    setFuture((items) => items.slice(1));
    setRun(null);
  };

  const execute = (row) => {
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
    const entered = tablePoints;
    const expected = regressionCalculatorStats(source);
    const interpretation = expected ? describe(expected.r) : {};
    const raw = {
      table: entered,
      regressionRun: run,
      interpretation: { direction, strength },
      processEvidence,
    };
    const tableCorrect = samePairs(entered, source);
    const parts = {
      [sourceMode === 'scatterplot' ? 'graph-to-table' : 'data-entry']: tableCorrect,
      'linear-regression': tableCorrect && run?.operation === 'linearRegression' && samePairs(run.table, entered),
      'correlation-produced': tableCorrect && Math.abs(Number(run?.r) - Number(expected?.r)) <= 0.0005,
      interpretation: questionData.requireInterpretation === false
        || (direction === interpretation.direction && strength === interpretation.strength),
    };
    const required = questionData.requireInterpretation === false
      ? Object.values(parts).slice(0, 3)
      : Object.values(parts);
    submit(
      { isCorrect: required.every(Boolean), score: required.filter(Boolean).length / required.length },
      raw,
      { parts },
    );
  };

  const feedbackText = feedback && (
    !Object.values(feedback.metadata.parts)[0]
      ? 'Data entry/table does not match the provided data.'
      : !feedback.metadata.parts['linear-regression']
        ? 'Regression setup is incomplete or invalid.'
        : !feedback.metadata.parts['correlation-produced']
          ? 'A correlation value has not been produced.'
          : !feedback.metadata.parts.interpretation
            ? 'Check the direction/strength interpretation.'
            : 'Workflow complete.'
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
              <button type="button" onClick={undo} disabled={!history.length} aria-label="Undo">↶</button>
              <button type="button" onClick={redo} disabled={!future.length} aria-label="Redo">↷</button>
              <span className="regression-toolbar-spacer" />
              <button className="regression-done" type="button" onClick={openEdit} aria-label="Done editing">Done</button>
            </>
          ) : (
            <>
              <div className="regression-add-wrap">
                <button
                  className="regression-tool-icon regression-add"
                  type="button"
                  onClick={() => setAddMenuOpen((open) => !open)}
                  aria-label="Add Item"
                  aria-expanded={addMenuOpen}
                  aria-haspopup="menu"
                  data-tooltip="Add Item"
                >
                  ＋
                </button>
                {addMenuOpen ? (
                  <div className="regression-add-menu" role="menu" aria-label="Add Item">
                    <button type="button" role="menuitem" onClick={addExpression}>
                      <span className="regression-add-menu-expression" aria-hidden="true">ƒ(x)</span>
                      <span>expression</span>
                    </button>
                    <button type="button" role="menuitem" onClick={addBlankTable} disabled={Boolean(tableRow)}>
                      <span className="regression-add-menu-table" aria-hidden="true">
                        <i /><i /><i /><i />
                      </span>
                      <span>table</span>
                    </button>
                    <button type="button" role="menuitem" disabled aria-disabled="true" title="Inference is not used in this activity">
                      <span className="regression-add-menu-inference" aria-hidden="true">⌒</span>
                      <span>inference</span>
                    </button>
                  </div>
                ) : null}
              </div>
              <span className="regression-toolbar-spacer" />
              <button className="regression-tool-icon" type="button" onClick={undo} disabled={!history.length} aria-label="Undo" title="Undo">↶</button>
              <button className="regression-tool-icon" type="button" onClick={redo} disabled={!future.length} aria-label="Redo" title="Redo">↷</button>
              <span className="regression-toolbar-spacer" />
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
              <button type="button" onClick={undo}>Undo</button>
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
        <button className="regression-submit" data-primary-answer-action="true" type="button" onClick={check}>
          Submit workflow
        </button>
        {feedbackText ? <p role="status">{feedbackText}</p> : null}
      </div>
    </ToolShell>
  );
}
